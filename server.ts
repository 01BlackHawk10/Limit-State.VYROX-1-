import express, { type Request, type Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import zlib from 'zlib';
import { WebSocketServer } from 'ws';
import {
  AuthAccountError,
  createUserAccount,
  deleteCustomMap,
  flushDatabaseWrites,
  getCustomMapById,
  getFriendsOverview,
  getPublicPlayerProfile,
  getUserByToken,
  getUserProgress,
  initDatabase,
  isPersistentDbEnabled,
  isPostgresActive,
  listExploreMaps,
  listUserMaps,
  loginUserAccount,
  queryLeaderboards,
  removeFriend,
  respondFriendRequest,
  revokeSessionToken,
  saveUserProgress,
  sendFriendRequest,
  submitLeaderboardEntry,
  toggleMapLike,
  updateAccountUsername,
  updateUserProfileMeta,
  upsertCustomMap,
  upsertFirebaseUser,
} from './server/db';
import { isFirebaseTokenVerifierReady, verifyFirebaseIdToken } from './server/firebaseAdmin';
import { PartyManager } from './server/partyManager';
import type {
  AuthUser,
  CustomMapBlueprint,
  UserProgressData,
  WeatherPresetId,
} from './src/shared/socialTypes';

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  const q = req.query.token;
  return typeof q === 'string' && q.trim() ? q.trim() : null;
}

function requireUser(req: Request, res: Response): AuthUser | null {
  const token = extractToken(req);
  const user = getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return null;
  }
  return user;
}

async function startServer() {
  await initDatabase();
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const partyManager = new PartyManager(wss);

  // ── HTTP Brotli / Gzip Compression Middleware (API, JS, CSS, JSON, WASM) ──
  const COMPRESSIBLE_MIME_RE =
    /^(?:text\/|application\/(?:json|javascript|ecmascript|wasm|xml|x-javascript)|image\/svg\+xml)/i;
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PUT') {
      next();
      return;
    }
    const reqPath = req.path.toLowerCase();
    if (
      reqPath.startsWith('/ws') ||
      reqPath.startsWith('/api/auth/') ||
      reqPath.endsWith('.glb') ||
      reqPath.endsWith('.usdz') ||
      reqPath.endsWith('.jpg') ||
      reqPath.endsWith('.jpeg') ||
      reqPath.endsWith('.png') ||
      reqPath.endsWith('.webp') ||
      req.headers.range
    ) {
      next();
      return;
    }
    const acceptEnc = String(req.headers['accept-encoding'] ?? '');
    const useBr = acceptEnc.includes('br');
    const useGzip = !useBr && acceptEnc.includes('gzip');
    if (!useBr && !useGzip) {
      next();
      return;
    }

    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    let compStream: zlib.BrotliCompress | zlib.Gzip | null = null;
    let decided = false;
    let passthrough = false;
    let pausedForRes = false;

    const cleanupStream = () => {
      if (compStream) {
        compStream.removeAllListeners();
        compStream.destroy();
        compStream = null;
      }
    };

    const ensureEncoder = (firstChunkSize: number) => {
      if (decided) return;
      decided = true;
      const cType = String(res.getHeader('Content-Type') ?? '');
      const hasEnc = Boolean(res.getHeader('Content-Encoding'));
      const cLenHeader = Number(res.getHeader('Content-Length') ?? 0);
      const isTooSmall = cLenHeader > 0 ? cLenHeader < 1024 : firstChunkSize < 512;
      if (
        res.headersSent ||
        hasEnc ||
        res.statusCode === 204 ||
        res.statusCode === 304 ||
        (cType && !COMPRESSIBLE_MIME_RE.test(cType)) ||
        isTooSmall
      ) {
        passthrough = true;
        return;
      }
      res.removeHeader('Content-Length');
      res.setHeader('Content-Encoding', useBr ? 'br' : 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      compStream = useBr
        ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 4 } })
        : zlib.createGzip({ level: 6 });

      compStream.on('data', (outBuf: Buffer) => {
        if (res.writableEnded || res.destroyed) return;
        const ok = origWrite(outBuf);
        if (!ok && compStream && !pausedForRes) {
          pausedForRes = true;
          compStream.pause();
        }
      });
      compStream.on('drain', () => {
        if (!pausedForRes && !res.writableEnded && !res.destroyed) {
          res.emit('drain');
        }
      });
      compStream.on('end', () => {
        if (!res.writableEnded && !res.destroyed) {
          origEnd();
        }
      });
      compStream.on('error', () => {
        cleanupStream();
        if (!res.writableEnded && !res.destroyed) {
          origEnd();
        }
      });
      res.on('drain', () => {
        if (pausedForRes && compStream) {
          pausedForRes = false;
          compStream.resume();
          if (compStream.writableLength < compStream.writableHighWaterMark) {
            res.emit('drain');
          }
        }
      });
      res.on('close', () => {
        cleanupStream();
      });
    };

    res.write = ((chunk: any, encoding?: any, cb?: any) => {
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(
            String(chunk),
            typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8',
          );
      ensureEncoder(buf.length);
      if (passthrough || !compStream) {
        return origWrite(chunk, encoding, cb);
      }
      if (typeof encoding === 'function') {
        return compStream.write(buf, encoding);
      }
      return compStream.write(buf, cb);
    }) as typeof res.write;

    res.end = ((chunk?: any, encoding?: any, cb?: any) => {
      const hasChunk = chunk !== undefined && chunk !== null && typeof chunk !== 'function';
      const buf = hasChunk
        ? Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(
              String(chunk),
              typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8',
            )
        : Buffer.alloc(0);
      ensureEncoder(buf.length);
      if (passthrough || !compStream) {
        return origEnd(chunk, encoding, cb);
      }
      if (typeof chunk === 'function') {
        compStream.end(chunk);
      } else if (typeof encoding === 'function') {
        compStream.end(buf, encoding);
      } else {
        compStream.end(buf, cb);
      }
      return res;
    }) as typeof res.end;

    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      persistentDb: isPersistentDbEnabled(),
      postgresActive: isPostgresActive(),
      firebaseAuthReady: isFirebaseTokenVerifierReady(),
      timestamp: Date.now(),
    });
  });

  // ── Auth ────────────────────────────────────────────────────────────────
  app.post('/api/auth/signup', (req, res) => {
    try {
      const { username, password, progress } = req.body as {
        username?: string;
        password?: string;
        progress?: Partial<UserProgressData>;
      };
      const result = createUserAccount(String(username ?? ''), String(password ?? ''), progress);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Sign up failed.' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const { username, password } = req.body as { username?: string; password?: string };
      const result = loginUserAccount(String(username ?? ''), String(password ?? ''));
      res.json(result);
    } catch (err) {
      if (err instanceof AuthAccountError) {
        const status = err.code === 'USER_NOT_FOUND' ? 404 : 401;
        res.status(status).json({ error: err.message, code: err.code });
        return;
      }
      res.status(401).json({ error: err instanceof Error ? err.message : 'Login failed.' });
    }
  });

  app.post('/api/auth/firebase', async (req, res) => {
    if (!isFirebaseTokenVerifierReady()) {
      res.status(503).json({ error: 'Cloud authentication is not configured.' });
      return;
    }
    try {
      const { idToken, username, progress } = (req.body ?? {}) as {
        idToken?: string;
        username?: string;
        progress?: Partial<UserProgressData>;
      };
      const decoded = await verifyFirebaseIdToken(String(idToken ?? ''));
      if (decoded.email && decoded.email_verified === false) {
        res.status(400).json({ error: 'Please verify your Google email before signing in.' });
        return;
      }
      const result = upsertFirebaseUser({
        firebaseUid: decoded.uid,
        email: decoded.email ?? null,
        displayName: typeof decoded.name === 'string' ? decoded.name : null,
        desiredUsername: typeof username === 'string' ? username : null,
        initialProgress: progress ?? null,
      });
      res.json(result);
    } catch (err) {
      res.status(401).json({
        error: err instanceof Error ? err.message : 'Firebase token verification failed.',
      });
    }
  });

  app.put('/api/auth/username', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const { username } = (req.body ?? {}) as { username?: unknown };
      const updated = updateAccountUsername(user.id, String(username ?? ''));
      res.json({ user: updated });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to update driver handle.',
      });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    revokeSessionToken(extractToken(req));
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const progress = getUserProgress(user.id);
    res.json({ user, progress });
  });

  // ── Persistent Cloud Progress ───────────────────────────────────────────
  app.get('/api/progress', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    res.json({ progress: getUserProgress(user.id) });
  });

  app.put('/api/progress', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const body = req.body as { progress?: UserProgressData } | UserProgressData;
      const incoming = ('progress' in body && body.progress ? body.progress : body) as UserProgressData;
      const saved = saveUserProgress(user.id, incoming);
      res.json({ progress: saved });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save progress.' });
    }
  });

  // ── Player Profiles ─────────────────────────────────────────────────────
  app.get('/api/profiles/:identifier', (req, res) => {
    const viewer = getUserByToken(extractToken(req));
    const profile = getPublicPlayerProfile(
      req.params.identifier,
      viewer?.id ?? null,
      (uid) => partyManager.getUserPresence(uid),
    );
    if (!profile) {
      res.status(404).json({ error: 'Driver profile not found.' });
      return;
    }
    res.json({ profile });
  });

  app.put('/api/profile/bio', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const body = (req.body ?? {}) as { driverBio?: unknown; homeCircuitId?: unknown };
      const driverBio = typeof body.driverBio === 'string' ? body.driverBio : '';
      const homeCircuitId =
        typeof body.homeCircuitId === 'string' ? body.homeCircuitId : 'aurelia_ridge';
      const updated = updateUserProfileMeta(user.id, driverBio, homeCircuitId);
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update profile.' });
    }
  });

  // ── Leaderboards ────────────────────────────────────────────────────────
  app.get('/api/leaderboards', (req, res) => {
    const viewer = getUserByToken(extractToken(req));
    const mapId = typeof req.query.mapId === 'string' ? req.query.mapId : 'all';
    const carId = typeof req.query.carId === 'string' ? req.query.carId : 'all';
    const mode = req.query.mode === 'drift' ? 'drift' : 'time_trial';
    const scope = req.query.scope === 'friends' ? 'friends' : 'global';

    if (scope === 'friends' && !viewer) {
      res.json({ entries: [] });
      return;
    }

    const entries = queryLeaderboards({
      mapId,
      carId,
      mode,
      scope,
      viewerUserId: viewer?.id ?? null,
    });
    res.json({ entries });
  });

  app.post('/api/leaderboards', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const body = req.body as {
        mapId: string;
        mapName: string;
        carId: string;
        mode: 'time_trial' | 'drift';
        bestLapMs: number | null;
        driftScore: number;
        weatherPreset: WeatherPresetId;
        tireCompound: string;
        ppRating: number;
      };
      const entry = submitLeaderboardEntry(user, {
        mapId: String(body.mapId || 'aurelia_ridge'),
        mapName: String(body.mapName || 'Aurelia Ridge'),
        carId: String(body.carId || 'audi-r8-lms-evo'),
        mode: body.mode === 'drift' ? 'drift' : 'time_trial',
        bestLapMs: typeof body.bestLapMs === 'number' && Number.isFinite(body.bestLapMs) ? Math.round(body.bestLapMs) : null,
        driftScore: Number(body.driftScore || 0),
        weatherPreset: body.weatherPreset || 'dry',
        tireCompound: String(body.tireCompound || 'racing_soft'),
        ppRating: Number(body.ppRating || 720),
      });
      res.status(201).json({ entry });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Leaderboard submission failed.' });
    }
  });

  // ── Friends ─────────────────────────────────────────────────────────────
  app.get('/api/friends', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    const overview = getFriendsOverview(user.id, (uid) => partyManager.getUserPresence(uid));
    res.json(overview);
  });

  app.post('/api/friends/request', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const { username } = req.body as { username?: string };
      const request = sendFriendRequest(user.id, String(username ?? ''));
      res.status(201).json({ request });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Friend request failed.' });
    }
  });

  app.post('/api/friends/respond', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const { requestId, action } = req.body as { requestId?: string; action?: 'accept' | 'decline' };
      respondFriendRequest(user.id, String(requestId ?? ''), action === 'accept' ? 'accept' : 'decline');
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Action failed.' });
    }
  });

  app.delete('/api/friends/:friendUserId', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    removeFriend(user.id, req.params.friendUserId);
    res.json({ ok: true });
  });

  // ── Custom Maps & Explore ───────────────────────────────────────────────
  app.get('/api/maps/explore', (req, res) => {
    const viewer = getUserByToken(extractToken(req));
    const sortParam = req.query.sort;
    const sort = sortParam === 'popular' || sortParam === 'newest' ? sortParam : 'top';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const mapType = typeof req.query.mapType === 'string' ? req.query.mapType : 'all';
    const difficulty = typeof req.query.difficulty === 'string' ? req.query.difficulty : 'all';
    const maps = listExploreMaps(sort, q, viewer?.id ?? null, mapType, difficulty);
    res.json({ maps });
  });

  app.get('/api/maps/mine', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    res.json({ maps: listUserMaps(user.id) });
  });

  app.get('/api/maps/:id', (req, res) => {
    const viewer = getUserByToken(extractToken(req));
    const map = getCustomMapById(req.params.id, viewer?.id ?? null);
    if (!map) {
      res.status(404).json({ error: 'Map not found.' });
      return;
    }
    res.json({ map });
  });

  app.post('/api/maps', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const body = req.body as { blueprint?: CustomMapBlueprint; publish?: boolean } | CustomMapBlueprint;
      const blueprint = ('blueprint' in body && body.blueprint ? body.blueprint : body) as CustomMapBlueprint;
      const publish = 'publish' in body ? body.publish : undefined;
      const saved = upsertCustomMap(user, blueprint, publish);
      res.status(201).json({ map: saved });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to save map.' });
    }
  });

  app.post('/api/maps/:id/like', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const result = toggleMapLike(user.id, req.params.id);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Like failed.' });
    }
  });

  app.delete('/api/maps/:id', (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    deleteCustomMap(user.id, req.params.id);
    res.json({ ok: true });
  });

  // ── Live Parties Summary ────────────────────────────────────────────────
  app.get('/api/parties', (req, res) => {
    const viewer = getUserByToken(extractToken(req));
    res.json({ parties: partyManager.listVisibleRooms(viewer?.id ?? null) });
  });

  // ── Fast Binary 3D Model Asset Delivery (Zero-stall streaming + Byte-Range + Caching) ──────
  const sendOptimizedModelAsset = (
    filePath: string,
    req: Request,
    res: Response,
    next: () => void,
  ) => {
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        next();
        return;
      }
      const etag = `W/"${stat.size}-${Math.floor(stat.mtimeMs)}"`;
      const isUsdz = filePath.toLowerCase().endsWith('.usdz');
      res.setHeader('Content-Type', isUsdz ? 'model/vnd.usdz+zip' : 'model/gltf-binary');
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', stat.mtime.toUTCString());
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('X-File-Size', String(stat.size));
      res.setHeader(
        'Cache-Control',
        process.env.NODE_ENV === 'production'
          ? 'public, max-age=604800, immutable'
          : 'public, max-age=86400',
      );
      if (req.headers['if-none-match'] === etag && !req.headers.range) {
        res.status(304).end();
        return;
      }
      res.sendFile(filePath, (sendErr) => {
        if (sendErr && !res.headersSent) next();
      });
    });
  };

  // Serve Three.js Draco glTF WASM decoders cleanly with zero 404s
  const dracoRootDir = path.resolve(process.cwd(), 'node_modules/three/examples/jsm/libs/draco/gltf');
  app.use('/draco', express.static(dracoRootDir, { maxAge: '7d' }));

  const carRootDir = path.resolve(process.cwd(), 'Car');
  app.use('/Car', (req, res, next) => {
    if (
      req.method !== 'GET' &&
      req.method !== 'HEAD'
    ) {
      next();
      return;
    }
    const lowPath = req.path.toLowerCase();
    if ('import' in req.query || 'url' in req.query || (!lowPath.endsWith('.glb') && !lowPath.endsWith('.usdz'))) {
      next();
      return;
    }
    try {
      const relPath = decodeURIComponent(req.path).replace(/^\/+/, '');
      const targetPath = path.resolve(carRootDir, relPath);
      if (!targetPath.startsWith(carRootDir + path.sep)) {
        res.status(403).end();
        return;
      }
      sendOptimizedModelAsset(targetPath, req, res, next);
    } catch {
      next();
    }
  });

  const assetsUserRootDir = path.resolve(process.cwd(), 'Assets-user');
  const distAssetsUserRootDir = path.resolve(process.cwd(), 'dist/Assets-user');
  app.use('/Assets-user', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    const lowPath = req.path.toLowerCase();
    if ('import' in req.query || 'url' in req.query || (!lowPath.endsWith('.glb') && !lowPath.endsWith('.gltf'))) {
      next();
      return;
    }
    try {
      const relPath = decodeURIComponent(req.path).replace(/^\/+/, '');
      const devTarget = path.resolve(assetsUserRootDir, relPath);
      const prodTarget = path.resolve(distAssetsUserRootDir, relPath);
      const isSafeDev = devTarget.startsWith(assetsUserRootDir + path.sep);
      const isSafeProd = prodTarget.startsWith(distAssetsUserRootDir + path.sep);
      if (!isSafeDev && !isSafeProd) {
        res.status(403).end();
        return;
      }
      const resolvedPath = isSafeDev && fs.existsSync(devTarget) ? devTarget : prodTarget;
      sendOptimizedModelAsset(resolvedPath, req, res, next);
    } catch {
      next();
    }
  });

  // ── Vite Dev Middleware or Static Prod ──────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.get(['/assets/*.glb', '/assets/*.usdz'], (req, res, next) => {
      try {
        const relPath = decodeURIComponent(req.path).replace(/^\/+/, '');
        const targetPath = path.resolve(distDir, relPath);
        if (!targetPath.startsWith(distDir + path.sep)) {
          res.status(403).end();
          return;
        }
        sendOptimizedModelAsset(targetPath, req, res, next);
      } catch {
        next();
      }
    });
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const portArgIdx = process.argv.findIndex((a) => a === '--port' || a.startsWith('--port='));
  let cliPort: number | undefined;
  if (portArgIdx !== -1) {
    const arg = process.argv[portArgIdx];
    const raw = arg.includes('=') ? arg.split('=')[1] : process.argv[portArgIdx + 1];
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) cliPort = parsed;
  }
  const envPort =
    process.env.PORT && process.env.PORT !== process.env.NGINX_PORT
      ? Number(process.env.PORT)
      : undefined;
  const defaultPort = Number(process.env.DEFAULT_APP_PORT) || 3000;
  const port = cliPort || envPort || defaultPort;

  server.listen(port, '0.0.0.0', () => {
    console.log(
      `Limit state .VYROX server listening on http://0.0.0.0:${port} (persistentDb=${isPersistentDbEnabled()})`,
    );
  });

  const handleShutdown = () => {
    void flushDatabaseWrites().finally(() => {
      process.exit(0);
    });
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
