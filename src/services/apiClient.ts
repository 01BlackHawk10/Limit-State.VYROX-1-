import type {
  AuthUser,
  CustomMapBlueprint,
  FriendsOverview,
  LeaderboardRecord,
  PartyRoomSummary,
  PublicPlayerProfile,
  UserProgressData,
  WeatherPresetId,
} from '../shared/socialTypes';

const TOKEN_STORAGE_KEY = 'apex_gt_auth_token';
const LAST_USERNAME_KEY = 'vyrox_last_username_v1';
const ACCOUNT_VAULT_PREFIX = 'vyrox_account_vault_v1:';
const PROGRESS_VAULT_PREFIX = 'vyrox_progress_vault_v1:';

export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function normalizeClientUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').replace(/\s+/g, '_');
}

export function getStoredAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function getLastSignedInUsername(): string {
  try {
    return localStorage.getItem(LAST_USERNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function setLastSignedInUsername(username: string): void {
  try {
    const clean = normalizeClientUsername(username);
    if (clean) {
      localStorage.setItem(LAST_USERNAME_KEY, clean);
    }
  } catch {
    // Ignore storage errors
  }
}

async function computeSaltedDigest(saltHex: string, password: string): Promise<string> {
  const input = `${saltHex}:${password}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic 64-bit FNV-1a mixer for non-secure contexts
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function generateSaltHex(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(12);
    crypto.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

interface StoredAccountVault {
  username: string;
  saltHex: string;
  verifierHex: string;
  updatedAt: number;
}

async function saveLocalAccountVault(username: string, password: string): Promise<void> {
  const clean = normalizeClientUsername(username);
  if (!clean || !password) return;
  try {
    const saltHex = generateSaltHex();
    const verifierHex = await computeSaltedDigest(saltHex, password);
    const entry: StoredAccountVault = {
      username: clean,
      saltHex,
      verifierHex,
      updatedAt: Date.now(),
    };
    localStorage.setItem(`${ACCOUNT_VAULT_PREFIX}${clean.toLowerCase()}`, JSON.stringify(entry));
    setLastSignedInUsername(clean);
  } catch {
    // Ignore storage quota errors
  }
}

async function verifyLocalAccountVault(username: string, password: string): Promise<boolean> {
  const clean = normalizeClientUsername(username);
  if (!clean || !password) return false;
  try {
    const raw = localStorage.getItem(`${ACCOUNT_VAULT_PREFIX}${clean.toLowerCase()}`);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<StoredAccountVault>;
    if (!parsed.saltHex || !parsed.verifierHex) return false;
    const actual = await computeSaltedDigest(parsed.saltHex, password);
    return actual === parsed.verifierHex;
  } catch {
    return false;
  }
}

export function saveLocalProgressVault(username: string, progress: UserProgressData): void {
  const clean = normalizeClientUsername(username);
  if (!clean) return;
  try {
    localStorage.setItem(
      `${PROGRESS_VAULT_PREFIX}${clean.toLowerCase()}`,
      JSON.stringify({ updatedAt: Date.now(), progress }),
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function loadLocalProgressVault(username: string): UserProgressData | null {
  const clean = normalizeClientUsername(username);
  if (!clean) return null;
  try {
    const raw = localStorage.getItem(`${PROGRESS_VAULT_PREFIX}${clean.toLowerCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { progress?: UserProgressData } | UserProgressData;
    const prog = 'progress' in parsed && parsed.progress ? parsed.progress : (parsed as UserProgressData);
    return prog && typeof prog === 'object' ? prog : null;
  } catch {
    return null;
  }
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredAuthToken();
  const headers = new Headers(init.headers ?? {});
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response | null = null;
  let lastFetchError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(path, {
        ...init,
        headers,
      });
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 900));
          continue;
        }
      }
      break;
    } catch (err) {
      lastFetchError = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 900));
        continue;
      }
    }
  }

  if (!res) {
    throw new ApiRequestError(
      lastFetchError instanceof Error
        ? `Server unreachable (${lastFetchError.message}). Please retry.`
        : 'Unable to reach server. Please retry.',
      0,
      'NETWORK_ERROR',
    );
  }

  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = {};
    }
  }

  if (!res.ok) {
    const code = typeof json.code === 'string' ? json.code : undefined;
    const message =
      typeof json.error === 'string' && json.error
        ? json.error
        : res.status === 502 || res.status === 503 || res.status === 504
          ? 'Server is waking up — please tap Sign In again in a moment.'
          : `Request failed (${res.status})`;
    if (res.status === 401 && path === '/api/auth/me') {
      setStoredAuthToken(null);
    }
    throw new ApiRequestError(message, res.status, code);
  }

  return json as T;
}

export interface AuthSessionResponse {
  token: string;
  user: AuthUser;
  progress: UserProgressData;
  restoredFromVault?: boolean;
}

export async function signupWithUsername(
  username: string,
  password: string,
  initialProgress?: Partial<UserProgressData> | null,
): Promise<AuthSessionResponse> {
  const clean = normalizeClientUsername(username);
  const vaultProgress = loadLocalProgressVault(clean);
  const seedProgress = initialProgress ?? vaultProgress ?? undefined;
  const data = await apiRequest<AuthSessionResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ username: clean, password, progress: seedProgress }),
  });
  setStoredAuthToken(data.token);
  await saveLocalAccountVault(data.user.username, password);
  saveLocalProgressVault(data.user.username, data.progress);
  return data;
}

export async function loginWithUsername(
  username: string,
  password: string,
): Promise<AuthSessionResponse> {
  const clean = normalizeClientUsername(username);
  try {
    const data = await apiRequest<AuthSessionResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: clean, password }),
    });
    setStoredAuthToken(data.token);
    await saveLocalAccountVault(data.user.username, password);
    const localBackup = loadLocalProgressVault(data.user.username);
    if (localBackup) {
      saveLocalProgressVault(data.user.username, {
        ...localBackup,
        ...data.progress,
        creditsCr: Math.max(localBackup.creditsCr ?? 0, data.progress.creditsCr ?? 0),
      });
    } else {
      saveLocalProgressVault(data.user.username, data.progress);
    }
    return data;
  } catch (err) {
    const isNotFound =
      err instanceof ApiRequestError &&
      (err.code === 'USER_NOT_FOUND' || err.status === 404);
    if (isNotFound && (await verifyLocalAccountVault(clean, password))) {
      const savedProgress = loadLocalProgressVault(clean);
      const restored = await apiRequest<AuthSessionResponse>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: clean,
          password,
          progress: savedProgress ?? undefined,
        }),
      });
      setStoredAuthToken(restored.token);
      await saveLocalAccountVault(restored.user.username, password);
      saveLocalProgressVault(restored.user.username, restored.progress);
      return { ...restored, restoredFromVault: true };
    }
    throw err;
  }
}

export async function logoutAccount(): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch {
    // Clear local session regardless
  } finally {
    setStoredAuthToken(null);
  }
}

export async function fetchCurrentUser(): Promise<{
  user: AuthUser;
  progress: UserProgressData;
}> {
  return apiRequest<{ user: AuthUser; progress: UserProgressData }>('/api/auth/me');
}

export async function fetchUserProgress(): Promise<UserProgressData> {
  const res = await apiRequest<{ progress: UserProgressData }>('/api/progress');
  return res.progress;
}

export async function saveUserProgressCloud(
  progress: UserProgressData,
): Promise<UserProgressData> {
  const lastUser = getLastSignedInUsername();
  if (lastUser) {
    saveLocalProgressVault(lastUser, progress);
  }
  const res = await apiRequest<{ progress: UserProgressData }>('/api/progress', {
    method: 'PUT',
    body: JSON.stringify({ progress }),
  });
  return res.progress;
}

export async function fetchLeaderboards(params: {
  mapId?: string;
  carId?: string;
  mode?: 'time_trial' | 'drift';
  scope?: 'global' | 'friends';
}): Promise<LeaderboardRecord[]> {
  const qs = new URLSearchParams();
  if (params.mapId) qs.set('mapId', params.mapId);
  if (params.carId) qs.set('carId', params.carId);
  if (params.mode) qs.set('mode', params.mode);
  if (params.scope) qs.set('scope', params.scope);
  const res = await apiRequest<{ entries: LeaderboardRecord[] }>(
    `/api/leaderboards?${qs.toString()}`,
  );
  return res.entries ?? [];
}

export async function submitLeaderboardRecord(payload: {
  mapId: string;
  mapName: string;
  carId: string;
  mode: 'time_trial' | 'drift';
  bestLapMs: number | null;
  driftScore: number;
  weatherPreset: WeatherPresetId;
  tireCompound: string;
  ppRating: number;
}): Promise<LeaderboardRecord> {
  const res = await apiRequest<{ entry: LeaderboardRecord }>('/api/leaderboards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.entry;
}

export async function fetchFriendsOverview(): Promise<FriendsOverview> {
  return apiRequest<FriendsOverview>('/api/friends');
}

export async function sendFriendRequestByUsername(username: string): Promise<void> {
  await apiRequest('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
}

export async function respondToFriendRequest(
  requestId: string,
  action: 'accept' | 'decline',
): Promise<void> {
  await apiRequest('/api/friends/respond', {
    method: 'POST',
    body: JSON.stringify({ requestId, action }),
  });
}

export async function removeFriendById(friendUserId: string): Promise<void> {
  await apiRequest(`/api/friends/${encodeURIComponent(friendUserId)}`, {
    method: 'DELETE',
  });
}

export async function fetchExploreMaps(
  sort: 'top' | 'popular' | 'newest' = 'top',
  q = '',
  mapType = 'all',
  difficulty = 'all',
): Promise<CustomMapBlueprint[]> {
  const qs = new URLSearchParams({ sort });
  if (q.trim()) qs.set('q', q.trim());
  if (mapType && mapType !== 'all') qs.set('mapType', mapType);
  if (difficulty && difficulty !== 'all') qs.set('difficulty', difficulty);
  const res = await apiRequest<{ maps: CustomMapBlueprint[] }>(
    `/api/maps/explore?${qs.toString()}`,
  );
  return res.maps ?? [];
}

export async function fetchMyMaps(): Promise<CustomMapBlueprint[]> {
  const res = await apiRequest<{ maps: CustomMapBlueprint[] }>('/api/maps/mine');
  return res.maps ?? [];
}

export async function fetchCustomMapById(id: string): Promise<CustomMapBlueprint> {
  const res = await apiRequest<{ map: CustomMapBlueprint }>(
    `/api/maps/${encodeURIComponent(id)}`,
  );
  return res.map;
}

export async function saveOrPublishCustomMap(
  blueprint: CustomMapBlueprint,
  publish?: boolean,
): Promise<CustomMapBlueprint> {
  const res = await apiRequest<{ map: CustomMapBlueprint }>('/api/maps', {
    method: 'POST',
    body: JSON.stringify({ blueprint, publish }),
  });
  return res.map;
}

export async function toggleLikeCustomMap(
  id: string,
): Promise<{ liked: boolean; likesCount: number }> {
  return apiRequest<{ liked: boolean; likesCount: number }>(
    `/api/maps/${encodeURIComponent(id)}/like`,
    { method: 'POST' },
  );
}

export async function deleteCustomMapById(id: string): Promise<void> {
  await apiRequest(`/api/maps/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function fetchLiveParties(): Promise<PartyRoomSummary[]> {
  const res = await apiRequest<{ parties: PartyRoomSummary[] }>('/api/parties');
  return res.parties ?? [];
}

export async function fetchPlayerProfile(identifier: string): Promise<PublicPlayerProfile> {
  const res = await apiRequest<{ profile: PublicPlayerProfile }>(
    `/api/profiles/${encodeURIComponent(identifier)}`,
  );
  return res.profile;
}

export async function updateMyProfileBio(
  driverBio: string,
  homeCircuitId: string,
): Promise<{ driverBio: string; homeCircuitId: string }> {
  return apiRequest<{ driverBio: string; homeCircuitId: string }>('/api/profile/bio', {
    method: 'PUT',
    body: JSON.stringify({ driverBio, homeCircuitId }),
  });
}
