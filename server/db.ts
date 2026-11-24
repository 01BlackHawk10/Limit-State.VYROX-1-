import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  enqueuePgQuery,
  flushPgWrites,
  initPostgresAndSyncSqlite,
  isPostgresActive,
} from './pgSync';
import {
  type AuthUser,
  createEmptyUserProgress,
  type CustomMapBlueprint,
  type FriendEntry,
  type FriendRequestEntry,
  type FriendsOverview,
  type LeaderboardRecord,
  type PublicPlayerProfile,
  type UserProgressData,
  type WeatherPresetId,
} from '../src/shared/socialTypes';

function resolveDataDir(): string {
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }
  try {
    if (fs.existsSync('/var/data')) {
      fs.accessSync('/var/data', fs.constants.W_OK);
      return '/var/data';
    }
  } catch {
    // Fallback to workspace data dir
  }
  return path.resolve(process.cwd(), 'data');
}

const DATA_DIR = resolveDataDir();
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'apex_gt.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_progress (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK(status IN ('pending', 'accepted')),
    created_at INTEGER NOT NULL,
    UNIQUE(requester_id, addressee_id)
  );

  CREATE TABLE IF NOT EXISTS custom_maps (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_username TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    is_published INTEGER NOT NULL DEFAULT 0,
    blueprint_json TEXT NOT NULL,
    likes_count INTEGER NOT NULL DEFAULT 0,
    plays_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS map_likes (
    map_id TEXT NOT NULL REFERENCES custom_maps(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (map_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    map_id TEXT NOT NULL,
    map_name TEXT NOT NULL,
    car_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('time_trial', 'drift')),
    best_lap_ms INTEGER,
    drift_score INTEGER NOT NULL DEFAULT 0,
    weather_preset TEXT NOT NULL,
    tire_compound TEXT NOT NULL,
    pp_rating REAL NOT NULL,
    recorded_at INTEGER NOT NULL,
    UNIQUE(user_id, map_id, car_id, mode)
  );
`);

// Safe migration for custom_maps metadata filter columns
{
  const cols = db.prepare('PRAGMA table_info(custom_maps)').all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('map_type')) {
    db.exec("ALTER TABLE custom_maps ADD COLUMN map_type TEXT NOT NULL DEFAULT 'circuit'");
  }
  if (!names.has('difficulty')) {
    db.exec("ALTER TABLE custom_maps ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'medium'");
  }
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

export async function initDatabase(): Promise<void> {
  await initPostgresAndSyncSqlite(db);
}

export async function flushDatabaseWrites(): Promise<void> {
  await flushPgWrites();
}

export function isPersistentDbEnabled(): boolean {
  return isPostgresActive() || Boolean(process.env.DATA_DIR) || DATA_DIR === '/var/data';
}

export class AuthAccountError extends Error {
  public readonly code: 'USER_NOT_FOUND' | 'INVALID_PASSWORD';

  constructor(code: 'USER_NOT_FOUND' | 'INVALID_PASSWORD', message: string) {
    super(message);
    this.code = code;
  }
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/\s+/g, '_');
}

export function validateCredentials(username: string, password: string): string | null {
  const clean = normalizeUsername(username);
  if (clean.length < 3 || clean.length > 24) {
    return 'Username must be between 3 and 24 characters.';
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(clean)) {
    return 'Username may only contain letters, numbers, dots, underscores, and hyphens.';
  }
  if (!password || password.length < 4 || password.length > 128) {
    return 'Password must be at least 4 characters.';
  }
  return null;
}

function sanitizeUserProgress(progress?: Partial<UserProgressData> | null): UserProgressData {
  const base = createEmptyUserProgress();
  if (!progress || typeof progress !== 'object') {
    return base;
  }
  return {
    ...base,
    ...progress,
    driverBio:
      typeof progress.driverBio === 'string'
        ? progress.driverBio.trim().slice(0, 180)
        : base.driverBio,
    homeCircuitId:
      typeof progress.homeCircuitId === 'string' && /^[a-z0-9_:-]{2,64}$/i.test(progress.homeCircuitId)
        ? progress.homeCircuitId
        : base.homeCircuitId,
    creditsCr:
      typeof progress.creditsCr === 'number' && Number.isFinite(progress.creditsCr)
        ? Math.max(0, Math.round(progress.creditsCr))
        : base.creditsCr,
    ownedPartsByCar:
      progress.ownedPartsByCar && typeof progress.ownedPartsByCar === 'object'
        ? progress.ownedPartsByCar
        : {},
    hudVisibility: { ...base.hudVisibility!, ...(progress.hudVisibility ?? {}) },
    stats: { ...base.stats, ...(progress.stats ?? {}) },
    draftMaps: Array.isArray(progress.draftMaps) ? progress.draftMaps : [],
    driverAnalytics:
      progress.driverAnalytics && typeof progress.driverAnalytics === 'object'
        ? progress.driverAnalytics
        : undefined,
  };
}

export function createUserAccount(
  rawUsername: string,
  password: string,
  initialProgressOverride?: Partial<UserProgressData> | null,
): { user: AuthUser; token: string; progress: UserProgressData } {
  const username = normalizeUsername(rawUsername);
  const err = validateCredentials(username, password);
  if (err) {
    throw new Error(err);
  }
  const lower = username.toLowerCase();
  const existing = db
    .prepare('SELECT id FROM users WHERE username_lower = ?')
    .get(lower) as { id: string } | undefined;
  if (existing) {
    throw new Error('That username is already taken.');
  }

  const now = Date.now();
  const userId = `usr_${crypto.randomUUID()}`;
  const passwordHash = hashPassword(password);
  const initialProgress = sanitizeUserProgress(initialProgressOverride);
  const progressJson = JSON.stringify(initialProgress);

  const insertTx = db.transaction(() => {
    db.prepare(
      'INSERT INTO users (id, username, username_lower, password_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(userId, username, lower, passwordHash, now, now);

    db.prepare(
      'INSERT INTO user_progress (user_id, data_json, updated_at) VALUES (?, ?, ?)',
    ).run(userId, progressJson, now);
  });
  insertTx();

  enqueuePgQuery(
    `INSERT INTO users (id, username, username_lower, password_hash, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [userId, username, lower, passwordHash, now, now],
  );
  enqueuePgQuery(
    `INSERT INTO user_progress (user_id, data_json, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = EXCLUDED.updated_at`,
    [userId, progressJson, now],
  );

  const token = issueSessionToken(userId);
  return {
    user: { id: userId, username, createdAt: now },
    token,
    progress: initialProgress,
  };
}

export function loginUserAccount(
  rawUsername: string,
  password: string,
): { user: AuthUser; token: string; progress: UserProgressData } {
  const username = normalizeUsername(rawUsername);
  const lower = username.toLowerCase();
  const row = db
    .prepare(
      'SELECT id, username, password_hash, created_at FROM users WHERE username_lower = ?',
    )
    .get(lower) as
    | { id: string; username: string; password_hash: string; created_at: number }
    | undefined;

  if (!row) {
    throw new AuthAccountError(
      'USER_NOT_FOUND',
      `No account found for "@${username}".`,
    );
  }
  if (!verifyPassword(password, row.password_hash)) {
    throw new AuthAccountError(
      'INVALID_PASSWORD',
      'Incorrect password for that account.',
    );
  }

  const now = Date.now();
  db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now, row.id);
  enqueuePgQuery('UPDATE users SET last_seen_at = $1 WHERE id = $2', [now, row.id]);

  const token = issueSessionToken(row.id);
  const progress = getUserProgress(row.id);

  return {
    user: { id: row.id, username: row.username, createdAt: row.created_at },
    token,
    progress,
  };
}

export function issueSessionToken(userId: string): string {
  const now = Date.now();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000;
  db.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(token, userId, now, expiresAt);
  enqueuePgQuery(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)',
    [token, userId, now, expiresAt],
  );
  return token;
}

export function getUserByToken(token: string | undefined | null): AuthUser | null {
  if (!token) return null;
  const now = Date.now();
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.created_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as
    | { id: string; username: string; created_at: number; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at < now) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    enqueuePgQuery('DELETE FROM sessions WHERE token = $1', [token]);
    return null;
  }
  return { id: row.id, username: row.username, createdAt: row.created_at };
}

export function revokeSessionToken(token: string | undefined | null): void {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  enqueuePgQuery('DELETE FROM sessions WHERE token = $1', [token]);
}

export function getUserProgress(userId: string): UserProgressData {
  const row = db
    .prepare('SELECT data_json FROM user_progress WHERE user_id = ?')
    .get(userId) as { data_json: string } | undefined;
  if (!row) {
    return createEmptyUserProgress();
  }
  try {
    const parsed = JSON.parse(row.data_json) as Partial<UserProgressData>;
    return sanitizeUserProgress(parsed);
  } catch {
    return createEmptyUserProgress();
  }
}

export function saveUserProgress(userId: string, progress: UserProgressData): UserProgressData {
  const now = Date.now();
  const sanitized = sanitizeUserProgress(progress);
  const json = JSON.stringify(sanitized);
  db.prepare(
    `INSERT INTO user_progress (user_id, data_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
  ).run(userId, json, now);
  enqueuePgQuery(
    `INSERT INTO user_progress (user_id, data_json, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET data_json = EXCLUDED.data_json, updated_at = EXCLUDED.updated_at`,
    [userId, json, now],
  );
  return sanitized;
}

export function getFriendsOverview(
  userId: string,
  presenceLookup: (uid: string) => { online: boolean; partyCode?: string | null; partyName?: string | null },
): FriendsOverview {
  const acceptedRows = db
    .prepare(
      `SELECT f.created_at, u.id AS friend_id, u.username AS friend_username
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
       WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
       ORDER BY u.username COLLATE NOCASE ASC`,
    )
    .all(userId, userId, userId) as Array<{
    created_at: number;
    friend_id: string;
    friend_username: string;
  }>;

  const friends: FriendEntry[] = acceptedRows.map((row) => {
    const p = presenceLookup(row.friend_id);
    return {
      userId: row.friend_id,
      username: row.friend_username,
      status: p.partyCode ? 'in_party' : p.online ? 'online' : 'offline',
      partyCode: p.partyCode ?? null,
      partyName: p.partyName ?? null,
      since: row.created_at,
    };
  });

  const pendingRows = db
    .prepare(
      `SELECT f.id, f.requester_id, ur.username AS req_name, f.addressee_id, ua.username AS add_name, f.created_at
       FROM friendships f
       JOIN users ur ON ur.id = f.requester_id
       JOIN users ua ON ua.id = f.addressee_id
       WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
    )
    .all(userId, userId) as Array<{
    id: string;
    requester_id: string;
    req_name: string;
    addressee_id: string;
    add_name: string;
    created_at: number;
  }>;

  const requests: FriendRequestEntry[] = pendingRows.map((row) => ({
    id: row.id,
    fromUserId: row.requester_id,
    fromUsername: row.req_name,
    toUserId: row.addressee_id,
    toUsername: row.add_name,
    direction: row.addressee_id === userId ? 'incoming' : 'outgoing',
    createdAt: row.created_at,
  }));

  return { friends, requests };
}

export function getFriendIds(userId: string): string[] {
  const rows = db
    .prepare(
      `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS fid
       FROM friendships
       WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'`,
    )
    .all(userId, userId, userId) as Array<{ fid: string }>;
  return rows.map((r) => r.fid);
}

export function sendFriendRequest(fromUserId: string, targetUsernameRaw: string): FriendRequestEntry {
  const clean = normalizeUsername(targetUsernameRaw).toLowerCase();
  const target = db
    .prepare('SELECT id, username FROM users WHERE username_lower = ?')
    .get(clean) as { id: string; username: string } | undefined;
  if (!target) {
    throw new Error('Player not found with that username.');
  }
  if (target.id === fromUserId) {
    throw new Error('You cannot add yourself as a friend.');
  }

  const existing = db
    .prepare(
      `SELECT id, status, requester_id FROM friendships
       WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
    )
    .get(fromUserId, target.id, target.id, fromUserId) as
    | { id: string; status: string; requester_id: string }
    | undefined;

  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error(`You are already friends with ${target.username}.`);
    }
    if (existing.requester_id === target.id) {
      db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(existing.id);
      enqueuePgQuery("UPDATE friendships SET status = 'accepted' WHERE id = $1", [existing.id]);
    }
    const sender = db.prepare('SELECT username FROM users WHERE id = ?').get(fromUserId) as {
      username: string;
    };
    return {
      id: existing.id,
      fromUserId,
      fromUsername: sender.username,
      toUserId: target.id,
      toUsername: target.username,
      direction: 'outgoing',
      createdAt: Date.now(),
    };
  }

  const id = `fr_${crypto.randomUUID()}`;
  const now = Date.now();
  db.prepare(
    "INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
  ).run(id, fromUserId, target.id, now);
  enqueuePgQuery(
    "INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES ($1, $2, $3, 'pending', $4) ON CONFLICT (requester_id, addressee_id) DO NOTHING",
    [id, fromUserId, target.id, now],
  );
  const sender = db.prepare('SELECT username FROM users WHERE id = ?').get(fromUserId) as {
    username: string;
  };
  return {
    id,
    fromUserId,
    fromUsername: sender.username,
    toUserId: target.id,
    toUsername: target.username,
    direction: 'outgoing',
    createdAt: now,
  };
}

export function respondFriendRequest(
  userId: string,
  requestId: string,
  action: 'accept' | 'decline',
): void {
  const row = db
    .prepare('SELECT id, addressee_id, status FROM friendships WHERE id = ?')
    .get(requestId) as { id: string; addressee_id: string; status: string } | undefined;
  if (!row || row.addressee_id !== userId || row.status !== 'pending') {
    throw new Error('Friend request not found.');
  }
  if (action === 'accept') {
    db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(requestId);
    enqueuePgQuery("UPDATE friendships SET status = 'accepted' WHERE id = $1", [requestId]);
  } else {
    db.prepare('DELETE FROM friendships WHERE id = ?').run(requestId);
    enqueuePgQuery('DELETE FROM friendships WHERE id = $1', [requestId]);
  }
}

export function removeFriend(userId: string, friendUserId: string): void {
  db.prepare(
    `DELETE FROM friendships
     WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`,
  ).run(userId, friendUserId, friendUserId, userId);
  enqueuePgQuery(
    `DELETE FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $3 AND addressee_id = $4)`,
    [userId, friendUserId, friendUserId, userId],
  );
}

export function upsertCustomMap(
  author: AuthUser,
  blueprint: CustomMapBlueprint,
  publish?: boolean,
): CustomMapBlueprint {
  const now = Date.now();
  const mapId = blueprint.id && blueprint.id.trim() ? blueprint.id : `map_${crypto.randomUUID()}`;
  const existing = db
    .prepare('SELECT author_id, likes_count, plays_count, created_at FROM custom_maps WHERE id = ?')
    .get(mapId) as
    | { author_id: string; likes_count: number; plays_count: number; created_at: number }
    | undefined;

  if (existing && existing.author_id !== author.id) {
    throw new Error('You do not have permission to edit this map.');
  }

  const isPublished = publish ?? blueprint.isPublished;
  const mapType = blueprint.mapType || (blueprint.closedLoop ? 'circuit' : 'sprint');
  const difficulty = blueprint.difficulty || 'medium';
  const normalized: CustomMapBlueprint = {
    ...blueprint,
    id: mapId,
    title: (blueprint.title || 'Untitled Circuit').trim().slice(0, 60),
    description: (blueprint.description || '').trim().slice(0, 240),
    authorId: author.id,
    authorUsername: author.username,
    isPublished,
    mapType,
    difficulty,
    likesCount: existing?.likes_count ?? 0,
    playsCount: existing?.plays_count ?? 0,
    createdAt: existing?.created_at ?? now,
    updatedAt: now,
  };

  const bpJson = JSON.stringify(normalized);
  db.prepare(
    `INSERT INTO custom_maps (id, author_id, author_username, title, description, is_published, map_type, difficulty, blueprint_json, likes_count, plays_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       is_published = excluded.is_published,
       map_type = excluded.map_type,
       difficulty = excluded.difficulty,
       blueprint_json = excluded.blueprint_json,
       updated_at = excluded.updated_at`,
  ).run(
    normalized.id,
    author.id,
    author.username,
    normalized.title,
    normalized.description,
    isPublished ? 1 : 0,
    mapType,
    difficulty,
    bpJson,
    normalized.likesCount,
    normalized.playsCount,
    normalized.createdAt,
    normalized.updatedAt,
  );
  enqueuePgQuery(
    `INSERT INTO custom_maps (id, author_id, author_username, title, description, is_published, map_type, difficulty, blueprint_json, likes_count, plays_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       is_published = EXCLUDED.is_published,
       map_type = EXCLUDED.map_type,
       difficulty = EXCLUDED.difficulty,
       blueprint_json = EXCLUDED.blueprint_json,
       updated_at = EXCLUDED.updated_at`,
    [
      normalized.id,
      author.id,
      author.username,
      normalized.title,
      normalized.description,
      isPublished ? 1 : 0,
      mapType,
      difficulty,
      bpJson,
      normalized.likesCount,
      normalized.playsCount,
      normalized.createdAt,
      normalized.updatedAt,
    ],
  );

  return normalized;
}

export function getCustomMapById(mapId: string, viewerUserId?: string | null): CustomMapBlueprint | null {
  const row = db
    .prepare('SELECT blueprint_json, likes_count, plays_count, is_published, author_id, map_type, difficulty FROM custom_maps WHERE id = ?')
    .get(mapId) as
    | {
        blueprint_json: string;
        likes_count: number;
        plays_count: number;
        is_published: number;
        author_id: string;
        map_type: string;
        difficulty: string;
      }
    | undefined;
  if (!row) return null;
  if (!row.is_published && row.author_id !== viewerUserId) return null;
  const bp = JSON.parse(row.blueprint_json) as CustomMapBlueprint;
  let likedByMe = false;
  if (viewerUserId) {
    const like = db
      .prepare('SELECT 1 FROM map_likes WHERE map_id = ? AND user_id = ?')
      .get(mapId, viewerUserId);
    likedByMe = Boolean(like);
  }
  return {
    ...bp,
    mapType: (bp.mapType || row.map_type || 'circuit') as CustomMapBlueprint['mapType'],
    difficulty: (bp.difficulty || row.difficulty || 'medium') as CustomMapBlueprint['difficulty'],
    isPublished: row.is_published === 1,
    likesCount: row.likes_count,
    playsCount: row.plays_count,
    likedByMe,
  };
}

export function listExploreMaps(
  sort: 'top' | 'popular' | 'newest',
  query: string,
  viewerUserId?: string | null,
  mapTypeFilter = 'all',
  difficultyFilter = 'all',
): CustomMapBlueprint[] {
  const orderSql =
    sort === 'popular'
      ? 'plays_count DESC, updated_at DESC'
      : sort === 'newest'
        ? 'updated_at DESC'
        : 'likes_count DESC, plays_count DESC, updated_at DESC';

  const params: Array<string> = [query, `%${query}%`, `%${query}%`, `%${query}%`];
  let extraWhere = '';
  if (mapTypeFilter && mapTypeFilter !== 'all') {
    extraWhere += ' AND map_type = ?';
    params.push(mapTypeFilter);
  }
  if (difficultyFilter && difficultyFilter !== 'all') {
    extraWhere += ' AND difficulty = ?';
    params.push(difficultyFilter);
  }

  const rows = db
    .prepare(
      `SELECT id, blueprint_json, likes_count, plays_count, is_published, map_type, difficulty
       FROM custom_maps
       WHERE is_published = 1 AND (? = '' OR title LIKE ? OR description LIKE ? OR author_username LIKE ?)${extraWhere}
       ORDER BY ${orderSql}
       LIMIT 60`,
    )
    .all(...params) as Array<{
    id: string;
    blueprint_json: string;
    likes_count: number;
    plays_count: number;
    is_published: number;
    map_type: string;
    difficulty: string;
  }>;

  const likedIds = new Set<string>();
  if (viewerUserId) {
    const likedRows = db
      .prepare('SELECT map_id FROM map_likes WHERE user_id = ?')
      .all(viewerUserId) as Array<{ map_id: string }>;
    likedRows.forEach((r) => likedIds.add(r.map_id));
  }

  return rows.map((row) => {
    const bp = JSON.parse(row.blueprint_json) as CustomMapBlueprint;
    return {
      ...bp,
      mapType: (bp.mapType || row.map_type || 'circuit') as CustomMapBlueprint['mapType'],
      difficulty: (bp.difficulty || row.difficulty || 'medium') as CustomMapBlueprint['difficulty'],
      isPublished: true,
      likesCount: row.likes_count,
      playsCount: row.plays_count,
      likedByMe: likedIds.has(row.id),
    };
  });
}

export function listUserMaps(userId: string): CustomMapBlueprint[] {
  const rows = db
    .prepare(
      'SELECT blueprint_json, likes_count, plays_count, is_published FROM custom_maps WHERE author_id = ? ORDER BY updated_at DESC',
    )
    .all(userId) as Array<{
    blueprint_json: string;
    likes_count: number;
    plays_count: number;
    is_published: number;
  }>;
  return rows.map((row) => {
    const bp = JSON.parse(row.blueprint_json) as CustomMapBlueprint;
    return {
      ...bp,
      isPublished: row.is_published === 1,
      likesCount: row.likes_count,
      playsCount: row.plays_count,
    };
  });
}

export function deleteCustomMap(userId: string, mapId: string): void {
  db.prepare('DELETE FROM custom_maps WHERE id = ? AND author_id = ?').run(mapId, userId);
  enqueuePgQuery('DELETE FROM custom_maps WHERE id = $1 AND author_id = $2', [mapId, userId]);
}

export function toggleMapLike(userId: string, mapId: string): { liked: boolean; likesCount: number } {
  const now = Date.now();
  const tx = db.transaction(() => {
    const existing = db
      .prepare('SELECT 1 FROM map_likes WHERE map_id = ? AND user_id = ?')
      .get(mapId, userId);
    if (existing) {
      db.prepare('DELETE FROM map_likes WHERE map_id = ? AND user_id = ?').run(mapId, userId);
      db.prepare('UPDATE custom_maps SET likes_count = MAX(0, likes_count - 1) WHERE id = ?').run(mapId);
    } else {
      db.prepare('INSERT INTO map_likes (map_id, user_id, created_at) VALUES (?, ?, ?)').run(
        mapId,
        userId,
        now,
      );
      db.prepare('UPDATE custom_maps SET likes_count = likes_count + 1 WHERE id = ?').run(mapId);
    }
    const row = db.prepare('SELECT likes_count FROM custom_maps WHERE id = ?').get(mapId) as {
      likes_count: number;
    };
    return { liked: !existing, likesCount: row?.likes_count ?? 0 };
  });
  const res = tx();
  if (res.liked) {
    enqueuePgQuery(
      'INSERT INTO map_likes (map_id, user_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (map_id, user_id) DO NOTHING',
      [mapId, userId, now],
    );
  } else {
    enqueuePgQuery('DELETE FROM map_likes WHERE map_id = $1 AND user_id = $2', [mapId, userId]);
  }
  enqueuePgQuery('UPDATE custom_maps SET likes_count = $1 WHERE id = $2', [res.likesCount, mapId]);
  return res;
}

export function incrementMapPlay(mapId: string): void {
  db.prepare('UPDATE custom_maps SET plays_count = plays_count + 1 WHERE id = ?').run(mapId);
  enqueuePgQuery('UPDATE custom_maps SET plays_count = plays_count + 1 WHERE id = $1', [mapId]);
}

export function submitLeaderboardEntry(
  user: AuthUser,
  payload: {
    mapId: string;
    mapName: string;
    carId: string;
    mode: 'time_trial' | 'drift';
    bestLapMs: number | null;
    driftScore: number;
    weatherPreset: WeatherPresetId;
    tireCompound: string;
    ppRating: number;
  },
): LeaderboardRecord {
  const now = Date.now();
  const existing = db
    .prepare(
      'SELECT id, best_lap_ms, drift_score FROM leaderboard_entries WHERE user_id = ? AND map_id = ? AND car_id = ? AND mode = ?',
    )
    .get(user.id, payload.mapId, payload.carId, payload.mode) as
    | { id: string; best_lap_ms: number | null; drift_score: number }
    | undefined;

  const isBetter =
    !existing ||
    (payload.mode === 'time_trial'
      ? payload.bestLapMs !== null &&
        (existing.best_lap_ms === null || payload.bestLapMs < existing.best_lap_ms)
      : payload.driftScore > existing.drift_score);

  if (!isBetter && existing) {
    return {
      id: existing.id,
      userId: user.id,
      username: user.username,
      mapId: payload.mapId,
      mapName: payload.mapName,
      carId: payload.carId,
      mode: payload.mode,
      bestLapMs: existing.best_lap_ms,
      driftScore: existing.drift_score,
      weatherPreset: payload.weatherPreset,
      tireCompound: payload.tireCompound,
      ppRating: payload.ppRating,
      recordedAt: now,
    };
  }

  const id = existing?.id ?? `lb_${crypto.randomUUID()}`;
  db.prepare(
    `INSERT INTO leaderboard_entries
      (id, user_id, username, map_id, map_name, car_id, mode, best_lap_ms, drift_score, weather_preset, tire_compound, pp_rating, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, map_id, car_id, mode) DO UPDATE SET
       username = excluded.username,
       map_name = excluded.map_name,
       best_lap_ms = excluded.best_lap_ms,
       drift_score = excluded.drift_score,
       weather_preset = excluded.weather_preset,
       tire_compound = excluded.tire_compound,
       pp_rating = excluded.pp_rating,
       recorded_at = excluded.recorded_at`,
  ).run(
    id,
    user.id,
    user.username,
    payload.mapId,
    payload.mapName,
    payload.carId,
    payload.mode,
    payload.bestLapMs,
    Math.round(payload.driftScore),
    payload.weatherPreset,
    payload.tireCompound,
    payload.ppRating,
    now,
  );
  enqueuePgQuery(
    `INSERT INTO leaderboard_entries
      (id, user_id, username, map_id, map_name, car_id, mode, best_lap_ms, drift_score, weather_preset, tire_compound, pp_rating, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (user_id, map_id, car_id, mode) DO UPDATE SET
       username = EXCLUDED.username,
       map_name = EXCLUDED.map_name,
       best_lap_ms = EXCLUDED.best_lap_ms,
       drift_score = EXCLUDED.drift_score,
       weather_preset = EXCLUDED.weather_preset,
       tire_compound = EXCLUDED.tire_compound,
       pp_rating = EXCLUDED.pp_rating,
       recorded_at = EXCLUDED.recorded_at`,
    [
      id,
      user.id,
      user.username,
      payload.mapId,
      payload.mapName,
      payload.carId,
      payload.mode,
      payload.bestLapMs,
      Math.round(payload.driftScore),
      payload.weatherPreset,
      payload.tireCompound,
      payload.ppRating,
      now,
    ],
  );

  return {
    id,
    userId: user.id,
    username: user.username,
    mapId: payload.mapId,
    mapName: payload.mapName,
    carId: payload.carId,
    mode: payload.mode,
    bestLapMs: payload.bestLapMs,
    driftScore: Math.round(payload.driftScore),
    weatherPreset: payload.weatherPreset,
    tireCompound: payload.tireCompound,
    ppRating: payload.ppRating,
    recordedAt: now,
  };
}

export function queryLeaderboards(opts: {
  mapId?: string;
  mode: 'time_trial' | 'drift';
  carId?: string;
  scope: 'global' | 'friends';
  viewerUserId?: string | null;
}): LeaderboardRecord[] {
  const params: Array<string | number> = [opts.mode];
  let where = 'mode = ?';
  if (opts.mapId && opts.mapId !== 'all') {
    where += ' AND map_id = ?';
    params.push(opts.mapId);
  }
  if (opts.carId && opts.carId !== 'all') {
    where += ' AND car_id = ?';
    params.push(opts.carId);
  }
  if (opts.mode === 'time_trial') {
    where += ' AND best_lap_ms IS NOT NULL';
  }
  if (opts.scope === 'friends' && opts.viewerUserId) {
    const fids = [opts.viewerUserId, ...getFriendIds(opts.viewerUserId)];
    const placeholders = fids.map(() => '?').join(',');
    where += ` AND user_id IN (${placeholders})`;
    params.push(...fids);
  }

  const orderBy =
    opts.mode === 'time_trial' ? 'best_lap_ms ASC' : 'drift_score DESC, recorded_at DESC';

  const rows = db
    .prepare(
      `SELECT id, user_id, username, map_id, map_name, car_id, mode, best_lap_ms, drift_score, weather_preset, tire_compound, pp_rating, recorded_at
       FROM leaderboard_entries
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT 100`,
    )
    .all(...params) as Array<{
    id: string;
    user_id: string;
    username: string;
    map_id: string;
    map_name: string;
    car_id: string;
    mode: 'time_trial' | 'drift';
    best_lap_ms: number | null;
    drift_score: number;
    weather_preset: WeatherPresetId;
    tire_compound: string;
    pp_rating: number;
    recorded_at: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    mapId: r.map_id,
    mapName: r.map_name,
    carId: r.car_id,
    mode: r.mode,
    bestLapMs: r.best_lap_ms,
    driftScore: r.drift_score,
    weatherPreset: r.weather_preset,
    tireCompound: r.tire_compound,
    ppRating: r.pp_rating,
    recordedAt: r.recorded_at,
  }));
}

export function updateUserProfileMeta(
  userId: string,
  driverBio: string,
  homeCircuitId: string,
): { driverBio: string; homeCircuitId: string } {
  const cleanBio = String(driverBio ?? '').trim().slice(0, 180);
  const rawCircuit = String(homeCircuitId ?? 'aurelia_ridge').trim();
  const cleanCircuit = /^[a-z0-9_:-]{2,64}$/i.test(rawCircuit) ? rawCircuit : 'aurelia_ridge';

  const current = getUserProgress(userId);
  const updated: UserProgressData = {
    ...current,
    driverBio: cleanBio,
    homeCircuitId: cleanCircuit,
  };
  saveUserProgress(userId, updated);
  return { driverBio: cleanBio, homeCircuitId: cleanCircuit };
}

export function getPublicPlayerProfile(
  identifierRaw: string,
  viewerUserId: string | null,
  presenceLookup: (uid: string) => { online: boolean; partyCode?: string | null; partyName?: string | null },
): PublicPlayerProfile | null {
  const identifier = String(identifierRaw ?? '').trim().replace(/^@+/, '');
  if (!identifier || identifier.length > 64) return null;

  const userRow = db
    .prepare(
      `SELECT id, username, created_at, last_seen_at
       FROM users
       WHERE id = ? OR username_lower = ?
       LIMIT 1`,
    )
    .get(identifier, identifier.toLowerCase()) as
    | { id: string; username: string; created_at: number; last_seen_at: number }
    | undefined;

  if (!userRow) return null;

  const progress = getUserProgress(userRow.id);
  const presence = presenceLookup(userRow.id);
  const isSelf = Boolean(viewerUserId && viewerUserId === userRow.id);

  let isFriend = false;
  let hasIncomingFriendRequest = false;
  let hasOutgoingFriendRequest = false;
  if (viewerUserId && !isSelf) {
    const fRow = db
      .prepare(
        `SELECT requester_id, addressee_id, status
         FROM friendships
         WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
         LIMIT 1`,
      )
      .get(viewerUserId, userRow.id, userRow.id, viewerUserId) as
      | { requester_id: string; addressee_id: string; status: string }
      | undefined;
    if (fRow) {
      if (fRow.status === 'accepted') {
        isFriend = true;
      } else if (fRow.status === 'pending') {
        if (fRow.requester_id === viewerUserId) hasOutgoingFriendRequest = true;
        else hasIncomingFriendRequest = true;
      }
    }
  }

  const lapRows = db
    .prepare(
      `SELECT id, user_id, username, map_id, map_name, car_id, mode, best_lap_ms, drift_score, weather_preset, tire_compound, pp_rating, recorded_at
       FROM leaderboard_entries
       WHERE user_id = ? AND mode = 'time_trial' AND best_lap_ms IS NOT NULL
       ORDER BY best_lap_ms ASC
       LIMIT 12`,
    )
    .all(userRow.id) as Array<{
    id: string;
    user_id: string;
    username: string;
    map_id: string;
    map_name: string;
    car_id: string;
    mode: 'time_trial' | 'drift';
    best_lap_ms: number | null;
    drift_score: number;
    weather_preset: WeatherPresetId;
    tire_compound: string;
    pp_rating: number;
    recorded_at: number;
  }>;

  const driftRows = db
    .prepare(
      `SELECT id, user_id, username, map_id, map_name, car_id, mode, best_lap_ms, drift_score, weather_preset, tire_compound, pp_rating, recorded_at
       FROM leaderboard_entries
       WHERE user_id = ? AND mode = 'drift' AND drift_score > 0
       ORDER BY drift_score DESC, recorded_at DESC
       LIMIT 12`,
    )
    .all(userRow.id) as typeof lapRows;

  const mapRows = db
    .prepare(
      `SELECT blueprint_json, likes_count, plays_count
       FROM custom_maps
       WHERE author_id = ? AND is_published = 1
       ORDER BY likes_count DESC, updated_at DESC
       LIMIT 12`,
    )
    .all(userRow.id) as Array<{ blueprint_json: string; likes_count: number; plays_count: number }>;

  const publishedMaps: CustomMapBlueprint[] = [];
  let totalMapLikes = 0;
  let totalMapPlays = 0;
  for (const r of mapRows) {
    try {
      const bp = JSON.parse(r.blueprint_json) as CustomMapBlueprint;
      publishedMaps.push({
        ...bp,
        likesCount: r.likes_count,
        playsCount: r.plays_count,
      });
      totalMapLikes += r.likes_count;
      totalMapPlays += r.plays_count;
    } catch {
      // Ignore malformed blueprint row
    }
  }

  const tofuBestGrades: Record<string, 'S' | 'A' | 'B' | 'C'> = {};
  if (progress.tofuStoryProgress && typeof progress.tofuStoryProgress === 'object') {
    for (const [chapId, entry] of Object.entries(progress.tofuStoryProgress)) {
      if (entry && entry.grade) {
        tofuBestGrades[chapId] = entry.grade;
      }
    }
  }

  const mapLbRow = (r: (typeof lapRows)[number]): LeaderboardRecord => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    mapId: r.map_id,
    mapName: r.map_name,
    carId: r.car_id,
    mode: r.mode,
    bestLapMs: r.best_lap_ms,
    driftScore: r.drift_score,
    weatherPreset: r.weather_preset,
    tireCompound: r.tire_compound,
    ppRating: r.pp_rating,
    recordedAt: r.recorded_at,
  });

  return {
    userId: userRow.id,
    username: userRow.username,
    createdAt: userRow.created_at,
    lastSeenAt: userRow.last_seen_at,
    online: presence.online,
    partyCode: presence.partyCode ?? null,
    partyName: presence.partyName ?? null,
    isSelf,
    isFriend,
    hasIncomingFriendRequest,
    hasOutgoingFriendRequest,
    driverBio: progress.driverBio ?? '',
    homeCircuitId: progress.homeCircuitId ?? 'aurelia_ridge',
    selectedCarId: progress.selectedCarId ?? 'bmw-m4-gt3-evo',
    creditsCr: progress.creditsCr ?? 35000,
    stats: progress.stats,
    driverAnalytics: progress.driverAnalytics ?? null,
    tofuChaptersCompleted: Object.keys(tofuBestGrades).length,
    tofuBestGrades,
    topLapRecords: lapRows.map(mapLbRow),
    topDriftRecords: driftRows.map(mapLbRow),
    publishedMaps,
    totalMapLikes,
    totalMapPlays,
  };
}

