import {
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  createEmptyUserProgress,
  DEFAULT_HUD_VISIBILITY,
  type CustomMapBlueprint,
  type DriverAnalyticsData,
  type UserProgressData,
  type WeatherPresetId,
} from '../shared/socialTypes';

export interface CloudUserAccountDoc {
  uid: string;
  username: string;
  usernameLower: string;
  email: string;
  displayName: string;
  authProvider: 'google' | 'firebase';
}

const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNum(val, min, max, fallback));
}

function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

export function sanitizeFirestoreUsername(raw: string, fallbackUid: string): string {
  const cleaned = raw
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '');
  if (cleaned.length >= 3 && VALID_USERNAME_RE.test(cleaned)) {
    return cleaned.slice(0, 24);
  }
  const suffix = fallbackUid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'driver';
  const base = (cleaned || 'driver').slice(0, 14);
  return `${base}_${suffix}`.slice(0, 24);
}

export function deriveDefaultUsernameFromFirebaseUser(user: FirebaseUser): string {
  const fromDisplay = user.displayName ? user.displayName.replace(/\s+/g, '_') : '';
  const fromEmail = user.email ? user.email.split('@')[0] : '';
  return sanitizeFirestoreUsername(fromDisplay || fromEmail || 'driver', user.uid);
}

function createEmptyAnalyticsFallback(): DriverAnalyticsData {
  return {
    totalSessions: 0,
    totalDriveTimeSec: 0,
    totalDistanceKm: 0,
    totalCorners: 0,
    turnInAngleSumDeg: 0,
    turnInAngleSamples: 0,
    turnInHistogram: [0, 0, 0, 0, 0],
    throttleToBrakeSumMs: 0,
    throttleToBrakeCount: 0,
    bestThrottleToBrakeMs: null,
    recentThrottleToBrakeMs: [],
    driftExitCount: 0,
    driftToGripEfficiencySumPct: 0,
    trailBrakingCorners: 0,
    peakLatG: 0,
    cleanTimeSec: 0,
    trackTimeSec: 0,
    recentSessions: [],
    updatedAt: Date.now(),
  };
}

function buildSanitizedProgressPayload(uid: string, progress: UserProgressData) {
  const base = createEmptyUserProgress();
  const stats = {
    racesCompleted: clampInt(progress.stats?.racesCompleted, 0, 10000000, 0),
    racesWon: clampInt(progress.stats?.racesWon, 0, 10000000, 0),
    totalDistanceKm: Number(clampNum(progress.stats?.totalDistanceKm, 0, 100000000, 0).toFixed(2)),
    totalDriftScore: clampInt(progress.stats?.totalDriftScore, 0, 1000000000, 0),
  };

  return stripUndefinedDeep({
    ownerId: uid,
    selectedCarId: String(progress.selectedCarId || base.selectedCarId).slice(0, 64),
    activeMapId: String(progress.activeMapId || base.activeMapId).slice(0, 64),
    driverBio: String(progress.driverBio ?? '').trim().slice(0, 200),
    homeCircuitId: String(progress.homeCircuitId || base.homeCircuitId || 'aurelia_ridge').slice(0, 64),
    creditsCr: clampInt(progress.creditsCr ?? base.creditsCr ?? 35000, 0, 999999999, 35000),
    ownedPartsByCar: progress.ownedPartsByCar && typeof progress.ownedPartsByCar === 'object'
      ? progress.ownedPartsByCar
      : {},
    carSetups: progress.carSetups && typeof progress.carSetups === 'object' ? progress.carSetups : {},
    visualCustomizations:
      progress.visualCustomizations && typeof progress.visualCustomizations === 'object'
        ? progress.visualCustomizations
        : {},
    mapCustomizations:
      progress.mapCustomizations && typeof progress.mapCustomizations === 'object'
        ? progress.mapCustomizations
        : {},
    bestLaps: progress.bestLaps && typeof progress.bestLaps === 'object' ? progress.bestLaps : {},
    bestDrifts:
      progress.bestDrifts && typeof progress.bestDrifts === 'object' ? progress.bestDrifts : {},
    speedTrapRecords:
      progress.speedTrapRecords && typeof progress.speedTrapRecords === 'object'
        ? progress.speedTrapRecords
        : {},
    assists: progress.assists && typeof progress.assists === 'object' ? progress.assists : {},
    drivingCamera: String(progress.drivingCamera || 'chase').slice(0, 32),
    graphicsQuality: String(progress.graphicsQuality || 'high').slice(0, 32),
    shadowQuality: String(progress.shadowQuality || 'high').slice(0, 32),
    textureSize: clampInt(progress.textureSize ?? 1024, 256, 4096, 1024),
    renderScale: Number(clampNum(progress.renderScale ?? 1.0, 0.4, 2.0, 1.0).toFixed(2)),
    audioVolume: Number(clampNum(progress.audioVolume ?? 0.72, 0, 1, 0.72).toFixed(3)),
    audioMuted: Boolean(progress.audioMuted),
    surfaceAudioEnabled: progress.surfaceAudioEnabled !== false,
    hudVisibility: {
      ...DEFAULT_HUD_VISIBILITY,
      ...(progress.hudVisibility ?? {}),
    },
    cinematicSettings:
      progress.cinematicSettings && typeof progress.cinematicSettings === 'object'
        ? progress.cinematicSettings
        : {},
    preferredWeather: String(progress.preferredWeather || 'dry').slice(0, 32),
    preferredSolarDeg: Number(clampNum(progress.preferredSolarDeg ?? 168, 0, 360, 168).toFixed(1)),
    preferredRaceConfig:
      progress.preferredRaceConfig && typeof progress.preferredRaceConfig === 'object'
        ? progress.preferredRaceConfig
        : {},
    tofuStoryProgress:
      progress.tofuStoryProgress && typeof progress.tofuStoryProgress === 'object'
        ? progress.tofuStoryProgress
        : {},
    driverAnalytics:
      progress.driverAnalytics && typeof progress.driverAnalytics === 'object'
        ? progress.driverAnalytics
        : createEmptyAnalyticsFallback(),
    stats,
  });
}

function buildSanitizedCustomMapDoc(
  uid: string,
  authorUsername: string,
  bp: CustomMapBlueprint,
  overridePublish?: boolean,
) {
  const safeId = VALID_ID_RE.test(bp.id)
    ? bp.id
    : `map_${bp.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || Date.now()}`;
  const nowMs = Date.now();
  const controlPoints =
    Array.isArray(bp.controlPoints) && bp.controlPoints.length >= 3
      ? bp.controlPoints.slice(0, 400)
      : [
          { x: -120, y: 0, z: -120, bankDeg: 0 },
          { x: 120, y: 0, z: -120, bankDeg: 0 },
          { x: 120, y: 0, z: 120, bankDeg: 0 },
          { x: -120, y: 0, z: 120, bankDeg: 0 },
        ];

  return stripUndefinedDeep({
    id: safeId,
    authorId: uid,
    authorUsername: sanitizeFirestoreUsername(authorUsername || bp.authorUsername || 'driver', uid),
    title: String(bp.title || 'Untitled Circuit').trim().slice(0, 80) || 'Untitled Circuit',
    description: String(bp.description ?? '').trim().slice(0, 500),
    isPublished: typeof overridePublish === 'boolean' ? overridePublish : Boolean(bp.isPublished),
    closedLoop: bp.closedLoop !== false,
    templateId: String(bp.templateId || 'blank_loop').slice(0, 64),
    mapType: String(bp.mapType || 'circuit').slice(0, 32),
    difficulty: String(bp.difficulty || 'medium').slice(0, 32),
    baseplateTheme: String(bp.baseplateTheme || 'grassland').slice(0, 32),
    roadSurfaceTheme: String(bp.roadSurfaceTheme || 'asphalt').slice(0, 32),
    kerbTheme: String(bp.kerbTheme || 'red_white').slice(0, 32),
    autoTunnels: Boolean(bp.autoTunnels),
    waterEnabled: Boolean(bp.waterEnabled),
    waterLevel: clampNum(bp.waterLevel, -50, 200, -4),
    roadWidth: clampNum(bp.roadWidth, 4, 60, 14),
    splineTension: clampNum(bp.splineTension, 0, 2, 0.5),
    bankingScale: clampNum(bp.bankingScale, 0, 3, 1.0),
    gripScale: clampNum(bp.gripScale, 0.2, 2.5, 1.0),
    kerbHeightScale: clampNum(bp.kerbHeightScale, 0, 3, 1.0),
    asphaltWear: clampNum(bp.asphaltWear, 0, 1, 0.25),
    foliageDensity: clampNum(bp.foliageDensity, 0, 3, 1.0),
    defaultWeather: String(bp.defaultWeather || 'dry').slice(0, 32),
    defaultSolarDeg: clampNum(bp.defaultSolarDeg, 0, 360, 168),
    defaultHaze: String(bp.defaultHaze || 'golden').slice(0, 32),
    controlPoints,
    terrainStamps: Array.isArray(bp.terrainStamps) ? bp.terrainStamps.slice(0, 1000) : [],
    terrainMaterialStamps: Array.isArray(bp.terrainMaterialStamps)
      ? bp.terrainMaterialStamps.slice(0, 1000)
      : [],
    placedProps: Array.isArray(bp.placedProps) ? bp.placedProps.slice(0, 1000) : [],
    likesCount: clampInt(bp.likesCount, 0, 10000000, 0),
    playsCount: clampInt(bp.playsCount, 0, 10000000, 0),
    createdAtMs: typeof bp.createdAt === 'number' && Number.isFinite(bp.createdAt) ? bp.createdAt : nowMs,
    updatedAtMs: nowMs,
  });
}

function docToCustomMapBlueprint(raw: Record<string, unknown>): CustomMapBlueprint | null {
  if (!raw || typeof raw.id !== 'string' || !Array.isArray(raw.controlPoints)) return null;
  return {
    id: raw.id,
    title: String(raw.title ?? 'Untitled Circuit'),
    description: String(raw.description ?? ''),
    authorId: String(raw.authorId ?? ''),
    authorUsername: String(raw.authorUsername ?? 'driver'),
    isPublished: Boolean(raw.isPublished),
    closedLoop: raw.closedLoop !== false,
    templateId: (raw.templateId as CustomMapBlueprint['templateId']) || 'blank_loop',
    mapType: (raw.mapType as CustomMapBlueprint['mapType']) || 'circuit',
    difficulty: (raw.difficulty as CustomMapBlueprint['difficulty']) || 'medium',
    baseplateTheme: (raw.baseplateTheme as CustomMapBlueprint['baseplateTheme']) || 'grassland',
    roadSurfaceTheme: (raw.roadSurfaceTheme as CustomMapBlueprint['roadSurfaceTheme']) || 'asphalt',
    kerbTheme: (raw.kerbTheme as CustomMapBlueprint['kerbTheme']) || 'red_white',
    autoTunnels: Boolean(raw.autoTunnels),
    waterEnabled: Boolean(raw.waterEnabled),
    waterLevel: typeof raw.waterLevel === 'number' ? raw.waterLevel : -4,
    roadWidth: typeof raw.roadWidth === 'number' ? raw.roadWidth : 14,
    splineTension: typeof raw.splineTension === 'number' ? raw.splineTension : 0.5,
    bankingScale: typeof raw.bankingScale === 'number' ? raw.bankingScale : 1,
    gripScale: typeof raw.gripScale === 'number' ? raw.gripScale : 1,
    kerbHeightScale: typeof raw.kerbHeightScale === 'number' ? raw.kerbHeightScale : 1,
    asphaltWear: typeof raw.asphaltWear === 'number' ? raw.asphaltWear : 0.25,
    foliageDensity: typeof raw.foliageDensity === 'number' ? raw.foliageDensity : 1,
    defaultWeather: (raw.defaultWeather as WeatherPresetId) || 'dry',
    defaultSolarDeg: typeof raw.defaultSolarDeg === 'number' ? raw.defaultSolarDeg : 168,
    defaultHaze: (raw.defaultHaze as CustomMapBlueprint['defaultHaze']) || 'golden',
    controlPoints: raw.controlPoints as CustomMapBlueprint['controlPoints'],
    terrainStamps: Array.isArray(raw.terrainStamps)
      ? (raw.terrainStamps as CustomMapBlueprint['terrainStamps'])
      : [],
    terrainMaterialStamps: Array.isArray(raw.terrainMaterialStamps)
      ? (raw.terrainMaterialStamps as CustomMapBlueprint['terrainMaterialStamps'])
      : [],
    placedProps: Array.isArray(raw.placedProps)
      ? (raw.placedProps as CustomMapBlueprint['placedProps'])
      : [],
    likesCount: typeof raw.likesCount === 'number' ? raw.likesCount : 0,
    playsCount: typeof raw.playsCount === 'number' ? raw.playsCount : 0,
    createdAt: typeof raw.createdAtMs === 'number' ? raw.createdAtMs : Date.now(),
    updatedAt: typeof raw.updatedAtMs === 'number' ? raw.updatedAtMs : Date.now(),
  };
}

export async function signInWithGoogleCloud(): Promise<FirebaseUser> {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch {
    // Fallback to default persistence if restricted by browser mode
  }
  const result = await signInWithPopup(auth, googleAuthProvider);
  return result.user;
}

export async function signOutGoogleCloud(): Promise<void> {
  await signOut(auth);
}

export async function ensureFirebaseUserAccount(
  firebaseUser: FirebaseUser,
  preferredUsername?: string,
): Promise<CloudUserAccountDoc> {
  const uid = firebaseUser.uid;
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(userRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  const email = (firebaseUser.email || `${uid}@vyrox.cloud`).slice(0, 254);
  const displayName = (firebaseUser.displayName || '').trim().slice(0, 80);

  if (existingSnap.exists()) {
    const data = existingSnap.data() as Partial<CloudUserAccountDoc>;
    const existingUsername = sanitizeFirestoreUsername(
      data.username || deriveDefaultUsernameFromFirebaseUser(firebaseUser),
      uid,
    );
    if (data.email !== email || data.displayName !== displayName) {
      try {
        await updateDoc(userRef, {
          email,
          displayName,
          authProvider: 'google',
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, userPath);
      }
    }
    return {
      uid,
      username: existingUsername,
      usernameLower: existingUsername.toLowerCase(),
      email,
      displayName,
      authProvider: 'google',
    };
  }

  const username = sanitizeFirestoreUsername(
    preferredUsername || deriveDefaultUsernameFromFirebaseUser(firebaseUser),
    uid,
  );
  const accountDoc: CloudUserAccountDoc = {
    uid,
    username,
    usernameLower: username.toLowerCase(),
    email,
    displayName,
    authProvider: 'google',
  };

  try {
    await setDoc(userRef, {
      ...accountDoc,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, userPath);
  }

  const publicRef = doc(db, 'publicDrivers', uid);
  const publicPath = `publicDrivers/${uid}`;
  try {
    const pubSnap = await getDoc(publicRef);
    if (!pubSnap.exists()) {
      await setDoc(publicRef, {
        uid,
        username,
        usernameLower: username.toLowerCase(),
        driverBio: '',
        homeCircuitId: 'aurelia_ridge',
        selectedCarId: 'bmw-m4-gt3-evo',
        stats: {
          racesCompleted: 0,
          racesWon: 0,
          totalDistanceKm: 0,
          totalDriftScore: 0,
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, publicPath);
  }

  return accountDoc;
}

export async function updateCloudUsername(
  firebaseUser: FirebaseUser,
  rawUsername: string,
): Promise<string> {
  const uid = firebaseUser.uid;
  const clean = rawUsername.trim().replace(/^@+/, '').replace(/\s+/g, '_');
  if (!VALID_USERNAME_RE.test(clean)) {
    throw new Error(
      'Driver handle must be 3–24 characters using letters, numbers, dots, underscores, or hyphens.',
    );
  }

  const userRef = doc(db, 'users', uid);
  const userPath = `users/${uid}`;
  const displayName = (firebaseUser.displayName || clean).trim().slice(0, 80);

  try {
    await updateDoc(userRef, {
      username: clean,
      usernameLower: clean.toLowerCase(),
      displayName,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, userPath);
  }

  const pubRef = doc(db, 'publicDrivers', uid);
  const pubPath = `publicDrivers/${uid}`;
  try {
    const pubSnap = await getDoc(pubRef);
    if (pubSnap.exists()) {
      await updateDoc(pubRef, {
        username: clean,
        usernameLower: clean.toLowerCase(),
        driverBio: String(pubSnap.data()?.driverBio ?? ''),
        homeCircuitId: String(pubSnap.data()?.homeCircuitId ?? 'aurelia_ridge'),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, pubPath);
  }

  return clean;
}

export async function loadCloudUserData(uid: string): Promise<{
  progress: UserProgressData | null;
  draftMaps: CustomMapBlueprint[];
}> {
  const progressPath = `users/${uid}/cloudData/progress`;
  const progressRef = doc(db, 'users', uid, 'cloudData', 'progress');

  let loadedProgress: UserProgressData | null = null;
  try {
    const snap = await getDoc(progressRef);
    if (snap.exists()) {
      const data = snap.data() as Record<string, unknown>;
      loadedProgress = {
        ...createEmptyUserProgress(),
        ...(data as unknown as Partial<UserProgressData>),
        draftMaps: [],
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, progressPath);
  }

  const draftsPath = `users/${uid}/draftMaps`;
  const draftMaps: CustomMapBlueprint[] = [];
  try {
    const q = query(collection(db, 'users', uid, 'draftMaps'), where('authorId', '==', uid));
    const qSnap = await getDocs(q);
    qSnap.forEach((d) => {
      const bp = docToCustomMapBlueprint(d.data() as Record<string, unknown>);
      if (bp) draftMaps.push(bp);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, draftsPath);
  }

  if (loadedProgress) {
    loadedProgress.draftMaps = draftMaps;
  }

  return { progress: loadedProgress, draftMaps };
}

export async function saveCloudProgress(
  uid: string,
  progress: UserProgressData,
): Promise<void> {
  const progressPath = `users/${uid}/cloudData/progress`;
  const progressRef = doc(db, 'users', uid, 'cloudData', 'progress');
  const payload = buildSanitizedProgressPayload(uid, progress);

  let exists = false;
  try {
    const snap = await getDoc(progressRef);
    exists = snap.exists();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, progressPath);
  }

  if (!exists) {
    try {
      await setDoc(progressRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, progressPath);
    }
  } else {
    const { ownerId: _ignoredOwner, ...mutableFields } = payload;
    void _ignoredOwner;
    try {
      await updateDoc(progressRef, {
        ...mutableFields,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, progressPath);
    }
  }

  // Sync public driver summary card (non-PII)
  const publicPath = `publicDrivers/${uid}`;
  const publicRef = doc(db, 'publicDrivers', uid);
  try {
    const pubSnap = await getDoc(publicRef);
    if (pubSnap.exists()) {
      await updateDoc(publicRef, {
        selectedCarId: payload.selectedCarId,
        stats: payload.stats,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, publicPath);
  }
}

export async function saveCloudCustomMap(
  uid: string,
  authorUsername: string,
  blueprint: CustomMapBlueprint,
  overridePublish?: boolean,
): Promise<CustomMapBlueprint> {
  const sanitized = buildSanitizedCustomMapDoc(uid, authorUsername, blueprint, overridePublish);
  const draftPath = `users/${uid}/draftMaps/${sanitized.id}`;
  const draftRef = doc(db, 'users', uid, 'draftMaps', sanitized.id);

  let draftExists = false;
  try {
    const snap = await getDoc(draftRef);
    draftExists = snap.exists();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, draftPath);
  }

  if (!draftExists) {
    try {
      await setDoc(draftRef, {
        ...sanitized,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, draftPath);
    }
  } else {
    const {
      id: _id,
      authorId: _authorId,
      likesCount: _likes,
      playsCount: _plays,
      createdAtMs: _cams,
      ...mutableFields
    } = sanitized;
    void _id;
    void _authorId;
    void _likes;
    void _plays;
    void _cams;
    try {
      await updateDoc(draftRef, {
        ...mutableFields,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, draftPath);
    }
  }

  // Also mirror published maps to /publicMaps/{mapId} so friends & other devices discover them
  const publicPath = `publicMaps/${sanitized.id}`;
  const publicRef = doc(db, 'publicMaps', sanitized.id);
  if (sanitized.isPublished) {
    let pubExists = false;
    try {
      const pubSnap = await getDoc(publicRef);
      pubExists = pubSnap.exists();
    } catch {
      pubExists = false;
    }

    if (!pubExists) {
      try {
        await setDoc(publicRef, {
          ...sanitized,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, publicPath);
      }
    } else {
      const {
        id: _id,
        authorId: _authorId,
        likesCount: _likes,
        playsCount: _plays,
        createdAtMs: _cams,
        isPublished: _isPub,
        ...mutablePublic
      } = sanitized;
      void _id;
      void _authorId;
      void _likes;
      void _plays;
      void _cams;
      void _isPub;
      try {
        await updateDoc(publicRef, {
          ...mutablePublic,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, publicPath);
      }
    }
  }

  return docToCustomMapBlueprint(sanitized) ?? blueprint;
}

export async function deleteCloudCustomMap(uid: string, mapId: string): Promise<void> {
  if (!VALID_ID_RE.test(mapId)) return;
  const draftPath = `users/${uid}/draftMaps/${mapId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'draftMaps', mapId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, draftPath);
  }
  const publicPath = `publicMaps/${mapId}`;
  try {
    const pubSnap = await getDoc(doc(db, 'publicMaps', mapId));
    if (pubSnap.exists() && pubSnap.data()?.authorId === uid) {
      await deleteDoc(doc(db, 'publicMaps', mapId));
    }
  } catch {
    // Ignore if not published
  }
  void publicPath;
}

export async function fetchCloudPublicMaps(): Promise<CustomMapBlueprint[]> {
  const path = 'publicMaps';
  const out: CustomMapBlueprint[] = [];
  try {
    const q = query(collection(db, 'publicMaps'), where('isPublished', '==', true));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      const bp = docToCustomMapBlueprint(d.data() as Record<string, unknown>);
      if (bp) out.push(bp);
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
  return out;
}
