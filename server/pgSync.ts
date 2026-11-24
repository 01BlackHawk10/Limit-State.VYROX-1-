import type Database from 'better-sqlite3';
import { Pool } from 'pg';

let pool: Pool | null = null;
let pgEnabled = false;
let writeQueue: Promise<void> = Promise.resolve();

export function isPostgresActive(): boolean {
  return pgEnabled && pool !== null;
}

export function enqueuePgQuery(sql: string, params: unknown[] = []): void {
  if (!pgEnabled || !pool) return;
  const activePool = pool;
  writeQueue = writeQueue
    .then(async () => {
      await activePool.query(sql, params);
    })
    .catch((err) => {
      console.error('[pgSync] write error:', err instanceof Error ? err.message : err);
    });
}

export async function flushPgWrites(): Promise<void> {
  try {
    await writeQueue;
  } catch {
    // Already logged inside queue
  }
}

export async function initPostgresAndSyncSqlite(sqlite: Database.Database): Promise<boolean> {
  const connStr = process.env.DATABASE_URL?.trim();
  if (!connStr) {
    pgEnabled = false;
    return false;
  }

  const isLocal =
    connStr.includes('localhost') ||
    connStr.includes('127.0.0.1') ||
    process.env.PGSSLMODE === 'disable';

  pool = new Pool({
    connectionString: connStr,
    max: 6,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        username_lower TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        last_seen_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_progress (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data_json TEXT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        UNIQUE(requester_id, addressee_id)
      );

      CREATE TABLE IF NOT EXISTS custom_maps (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        author_username TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        is_published INTEGER NOT NULL DEFAULT 0,
        map_type TEXT NOT NULL DEFAULT 'circuit',
        difficulty TEXT NOT NULL DEFAULT 'medium',
        blueprint_json TEXT NOT NULL,
        likes_count INTEGER NOT NULL DEFAULT 0,
        plays_count INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS map_likes (
        map_id TEXT NOT NULL REFERENCES custom_maps(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        PRIMARY KEY (map_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS leaderboard_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        map_id TEXT NOT NULL,
        map_name TEXT NOT NULL,
        car_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        best_lap_ms INTEGER,
        drift_score INTEGER NOT NULL DEFAULT 0,
        weather_preset TEXT NOT NULL,
        tire_compound TEXT NOT NULL,
        pp_rating DOUBLE PRECISION NOT NULL,
        recorded_at BIGINT NOT NULL,
        UNIQUE(user_id, map_id, car_id, mode)
      );
    `);

    const now = Date.now();
    await pool.query('DELETE FROM sessions WHERE expires_at < $1', [now]);

    const pgUsersCountRes = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM users');
    const pgUserCount = Number(pgUsersCountRes.rows[0]?.count ?? '0');

    if (pgUserCount > 0) {
      // Hydrate local SQLite from Postgres source of truth
      const [usersRes, sessionsRes, progressRes, friendsRes, mapsRes, likesRes, lbRes] =
        await Promise.all([
          pool.query('SELECT id, username, username_lower, password_hash, created_at, last_seen_at FROM users'),
          pool.query('SELECT token, user_id, created_at, expires_at FROM sessions WHERE expires_at >= $1', [now]),
          pool.query('SELECT user_id, data_json, updated_at FROM user_progress'),
          pool.query('SELECT id, requester_id, addressee_id, status, created_at FROM friendships'),
          pool.query(
            'SELECT id, author_id, author_username, title, description, is_published, map_type, difficulty, blueprint_json, likes_count, plays_count, created_at, updated_at FROM custom_maps',
          ),
          pool.query('SELECT map_id, user_id, created_at FROM map_likes'),
          pool.query(
            'SELECT id, user_id, username, map_id, map_name, car_id, mode, best_lap_ms, drift_score, weather_preset, tire_compound, pp_rating, recorded_at FROM leaderboard_entries',
          ),
        ]);

      const hydrateTx = sqlite.transaction(() => {
        const insUser = sqlite.prepare(
          `INSERT INTO users (id, username, username_lower, password_hash, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             username = excluded.username,
             username_lower = excluded.username_lower,
             password_hash = excluded.password_hash,
             last_seen_at = excluded.last_seen_at`,
        );
        for (const u of usersRes.rows) {
          insUser.run(u.id, u.username, u.username_lower, u.password_hash, Number(u.created_at), Number(u.last_seen_at));
        }

        const insSession = sqlite.prepare(
          `INSERT OR REPLACE INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
        );
        for (const s of sessionsRes.rows) {
          insSession.run(s.token, s.user_id, Number(s.created_at), Number(s.expires_at));
        }

        const insProgress = sqlite.prepare(
          `INSERT INTO user_progress (user_id, data_json, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             data_json = CASE WHEN excluded.updated_at >= user_progress.updated_at THEN excluded.data_json ELSE user_progress.data_json END,
             updated_at = MAX(user_progress.updated_at, excluded.updated_at)`,
        );
        for (const p of progressRes.rows) {
          insProgress.run(p.user_id, p.data_json, Number(p.updated_at));
        }

        const insFriend = sqlite.prepare(
          `INSERT OR REPLACE INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, ?, ?)`,
        );
        for (const f of friendsRes.rows) {
          insFriend.run(f.id, f.requester_id, f.addressee_id, f.status, Number(f.created_at));
        }

        const insMap = sqlite.prepare(
          `INSERT OR REPLACE INTO custom_maps (id, author_id, author_username, title, description, is_published, map_type, difficulty, blueprint_json, likes_count, plays_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const m of mapsRes.rows) {
          insMap.run(
            m.id,
            m.author_id,
            m.author_username,
            m.title,
            m.description,
            Number(m.is_published),
            m.map_type || 'circuit',
            m.difficulty || 'medium',
            m.blueprint_json,
            Number(m.likes_count),
            Number(m.plays_count),
            Number(m.created_at),
            Number(m.updated_at),
          );
        }

        const insLike = sqlite.prepare(
          `INSERT OR REPLACE INTO map_likes (map_id, user_id, created_at) VALUES (?, ?, ?)`,
        );
        for (const l of likesRes.rows) {
          insLike.run(l.map_id, l.user_id, Number(l.created_at));
        }

        const insLb = sqlite.prepare(
          `INSERT OR REPLACE INTO leaderboard_entries (id, user_id, username, map_id, map_name, car_id, mode, best_lap_ms, drift_score, weather_preset, tire_compound, pp_rating, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const r of lbRes.rows) {
          insLb.run(
            r.id,
            r.user_id,
            r.username,
            r.map_id,
            r.map_name,
            r.car_id,
            r.mode,
            r.best_lap_ms === null ? null : Number(r.best_lap_ms),
            Number(r.drift_score),
            r.weather_preset,
            r.tire_compound,
            Number(r.pp_rating),
            Number(r.recorded_at),
          );
        }
      });
      hydrateTx();
      console.log(`[pgSync] Hydrated ${usersRes.rows.length} users from PostgreSQL.`);
    } else {
      // Seed Postgres from any existing local SQLite data
      const localUsers = sqlite.prepare('SELECT * FROM users').all() as Array<any>;
      for (const u of localUsers) {
        await pool.query(
          `INSERT INTO users (id, username, username_lower, password_hash, created_at, last_seen_at)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
          [u.id, u.username, u.username_lower, u.password_hash, u.created_at, u.last_seen_at],
        );
      }
      const localSessions = sqlite.prepare('SELECT * FROM sessions WHERE expires_at >= ?').all(now) as Array<any>;
      for (const s of localSessions) {
        await pool.query(
          `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4) ON CONFLICT (token) DO NOTHING`,
          [s.token, s.user_id, s.created_at, s.expires_at],
        );
      }
      const localProgress = sqlite.prepare('SELECT * FROM user_progress').all() as Array<any>;
      for (const p of localProgress) {
        await pool.query(
          `INSERT INTO user_progress (user_id, data_json, updated_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING`,
          [p.user_id, p.data_json, p.updated_at],
        );
      }
      const localFriends = sqlite.prepare('SELECT * FROM friendships').all() as Array<any>;
      for (const f of localFriends) {
        await pool.query(
          `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
          [f.id, f.requester_id, f.addressee_id, f.status, f.created_at],
        );
      }
      const localMaps = sqlite.prepare('SELECT * FROM custom_maps').all() as Array<any>;
      for (const m of localMaps) {
        await pool.query(
          `INSERT INTO custom_maps (id, author_id, author_username, title, description, is_published, map_type, difficulty, blueprint_json, likes_count, plays_count, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING`,
          [
            m.id,
            m.author_id,
            m.author_username,
            m.title,
            m.description,
            m.is_published,
            m.map_type || 'circuit',
            m.difficulty || 'medium',
            m.blueprint_json,
            m.likes_count,
            m.plays_count,
            m.created_at,
            m.updated_at,
          ],
        );
      }
      const localLikes = sqlite.prepare('SELECT * FROM map_likes').all() as Array<any>;
      for (const l of localLikes) {
        await pool.query(
          `INSERT INTO map_likes (map_id, user_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (map_id, user_id) DO NOTHING`,
          [l.map_id, l.user_id, l.created_at],
        );
      }
      const localLb = sqlite.prepare('SELECT * FROM leaderboard_entries').all() as Array<any>;
      for (const r of localLb) {
        await pool.query(
          `INSERT INTO leaderboard_entries (id, user_id, username, map_id, map_name, car_id, mode, best_lap_ms, drift_score, weather_preset, tire_compound, pp_rating, recorded_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING`,
          [
            r.id,
            r.user_id,
            r.username,
            r.map_id,
            r.map_name,
            r.car_id,
            r.mode,
            r.best_lap_ms,
            r.drift_score,
            r.weather_preset,
            r.tire_compound,
            r.pp_rating,
            r.recorded_at,
          ],
        );
      }
      console.log(`[pgSync] Connected PostgreSQL (seeded ${localUsers.length} local users).`);
    }

    pgEnabled = true;
    return true;
  } catch (err) {
    console.error('[pgSync] PostgreSQL init failed, falling back to local SQLite:', err);
    try {
      await pool.end();
    } catch {
      // Ignore close error
    }
    pool = null;
    pgEnabled = false;
    return false;
  }
}
