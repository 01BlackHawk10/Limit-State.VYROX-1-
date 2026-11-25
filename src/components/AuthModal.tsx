import { Check, Cloud, Database, Edit3, Lock, LogIn, LogOut, ShieldCheck, User, UserPlus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  ApiRequestError,
  type CloudHealthStatus,
  normalizeClientUsername,
} from '../services/apiClient';
import type { AuthUser, UserCareerStats } from '../shared/socialTypes';

interface AuthModalProps {
  isOpen: boolean;
  mandatory?: boolean;
  defaultUsername?: string;
  user: AuthUser | null;
  stats: UserCareerStats;
  cloudHealth?: CloudHealthStatus | null;
  onClose: () => void;
  onOpenProfile?: () => void;
  onGoogleLogin: () => Promise<void>;
  onUpdateUsername?: (username: string) => Promise<void>;
  onLogin: (username: string, password: string) => Promise<void>;
  onSignup: (username: string, password: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

export function AuthModal({
  isOpen,
  mandatory = false,
  defaultUsername = '',
  user,
  stats,
  cloudHealth = null,
  onClose,
  onOpenProfile,
  onGoogleLogin,
  onUpdateUsername,
  onLogin,
  onSignup,
  onLogout,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState(() => defaultUsername);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSwitchToSignup, setShowSwitchToSignup] = useState(false);

  const [editingHandle, setEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState('');
  const [handleSaving, setHandleSaving] = useState(false);
  const [handleNotice, setHandleNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !user && !username && defaultUsername) {
      setUsername(defaultUsername);
    }
    if (isOpen && user) {
      setHandleDraft(user.username);
      setEditingHandle(false);
      setHandleNotice(null);
    }
  }, [defaultUsername, isOpen, user, username]);

  if (!isOpen) return null;

  const isLockedGate = mandatory && !user;

  const renderBackendLabel = cloudHealth?.postgresActive
    ? 'Render PostgreSQL Active'
    : cloudHealth?.persistentDb
      ? 'Persistent Server DB'
      : 'Server DB · Set DATABASE_URL';

  const renderBackendTone = cloudHealth?.postgresActive
    ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-300'
    : cloudHealth?.persistentDb
      ? 'border-sky-400/45 bg-sky-500/15 text-sky-300'
      : 'border-amber-400/45 bg-amber-500/15 text-amber-200';

  const firebaseTone =
    cloudHealth === null || cloudHealth.firebaseAuthReady
      ? 'border-emerald-400/45 bg-emerald-500/15 text-emerald-300'
      : 'border-amber-400/45 bg-amber-500/15 text-amber-200';

  const firebaseStatusLabel =
    cloudHealth === null
      ? 'Firestore Cloud Ready'
      : cloudHealth.firebaseAuthReady
        ? 'Firebase Cloud Connected'
        : 'Client Firestore Ready';

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleSubmitting(true);
    try {
      await onGoogleLogin();
      onClose();
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      if (code === 'auth/popup-closed-by-user') {
        setError('Google sign-in popup was closed before completing.');
      } else if (code === 'auth/popup-blocked') {
        setError('Popup was blocked by your browser. Please allow popups for this site and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Google cloud sign-in failed.');
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSaveUsername = async (e: FormEvent) => {
    e.preventDefault();
    if (!onUpdateUsername) return;
    setError(null);
    setHandleNotice(null);
    const cleaned = normalizeClientUsername(handleDraft);
    if (cleaned.length < 3 || cleaned.length > 24 || !/^[a-zA-Z0-9_.-]+$/.test(cleaned)) {
      setError('Driver handle must be 3–24 characters using letters, numbers, dots, underscores, or hyphens.');
      return;
    }
    setHandleSaving(true);
    try {
      await onUpdateUsername(cleaned);
      setEditingHandle(false);
      setHandleNotice(`Updated handle to @${cleaned}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update driver handle.');
    } finally {
      setHandleSaving(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setShowSwitchToSignup(false);
    const trimmed = normalizeClientUsername(username);
    if (trimmed.length < 3 || trimmed.length > 24) {
      setError('Username must be between 3 and 24 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
      setError('Username can only contain letters, numbers, dots, underscores, and hyphens.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await onLogin(trimmed, password);
      } else {
        await onSignup(trimmed, password);
      }
      setPassword('');
      setConfirmPassword('');
      onClose();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'USER_NOT_FOUND' && mode === 'login') {
        setShowSwitchToSignup(true);
        setError(
          `No Render cloud account found for "@${trimmed}". Check spelling or create "@${trimmed}" to continue (any local progress on this device is kept).`,
        );
      } else {
        setError(err instanceof Error ? err.message : 'Authentication failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/88 p-0 sm:p-4"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
      }}
    >
      <div
        className="gt5-panel gt5-carbon flex max-h-[94dvh] landscape-short:max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden border border-white/15 bg-[#0c0e13] text-slate-100 shadow-2xl"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <header className="flex items-center justify-between gap-2 border-b border-white/12 bg-black/55 px-4 py-3 sm:px-5 sm:py-3.5 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Cloud className="h-4 w-4 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-mono-tabular text-[10px] font-bold tracking-[0.18em] text-sky-400">
                Limit state <span className="text-white">.VYROX</span>
              </div>
              <h2 className="font-display text-sm sm:text-base font-bold tracking-wider text-white uppercase truncate">
                {user ? 'Driver Cloud Profile' : isLockedGate ? 'Dual Cloud Sign In' : 'Driver Cloud Account'}
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                {user
                  ? 'Builds, liveries, credits, best laps, friends & custom maps synced across devices'
                  : 'Sign in with Firebase Cloud (Google) or Render Cloud (Driver Handle & PostgreSQL)'}
              </p>
            </div>
          </div>
          {!isLockedGate && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center border border-white/15 bg-white/5 text-slate-300 hover:border-white/35 hover:text-white shrink-0"
              aria-label="Close account modal"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </header>

        {user ? (
          <div className="flex-1 overflow-y-auto space-y-3.5 p-4 sm:space-y-4 sm:p-5">
            {error && (
              <div className="border border-rose-500/60 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                {error}
              </div>
            )}
            {handleNotice && (
              <div className="border border-emerald-500/50 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-200">
                {handleNotice}
              </div>
            )}

            <div className="border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2.5 sm:px-4 sm:py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-10 w-10 items-center justify-center border border-emerald-400/50 bg-emerald-500/20 text-emerald-300 shrink-0">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-bold text-white truncate">
                        @{user.username}
                      </span>
                      <span className="border border-sky-400/40 bg-sky-500/15 px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold text-sky-300 uppercase">
                        {user.authProvider === 'google'
                          ? 'Firebase Cloud'
                          : cloudHealth?.postgresActive
                            ? 'Render PostgreSQL'
                            : 'Render Server'}
                      </span>
                    </div>
                    {user.email && (
                      <div className="text-[11px] text-slate-300 truncate">{user.email}</div>
                    )}
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-emerald-300">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {user.authProvider === 'google'
                          ? 'Firebase Firestore + Render Server Sync Active'
                          : cloudHealth?.postgresActive
                            ? 'Render PostgreSQL Cloud Sync Active · Cross-Device Saved'
                            : 'Server Cloud Sync Active · Cross-Device Saved'}
                      </span>
                    </div>
                  </div>
                </div>
                {onUpdateUsername && !editingHandle && (
                  <button
                    type="button"
                    onClick={() => {
                      setHandleDraft(user.username);
                      setEditingHandle(true);
                      setError(null);
                    }}
                    className="flex h-8 w-8 items-center justify-center border border-white/15 bg-black/40 text-slate-300 hover:border-sky-400/50 hover:text-white shrink-0"
                    title="Customize driver handle"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {editingHandle && onUpdateUsername && (
                <form onSubmit={handleSaveUsername} className="mt-3 flex items-center gap-2 border-t border-white/10 pt-2.5">
                  <input
                    type="text"
                    value={handleDraft}
                    onChange={(e) => setHandleDraft(e.target.value)}
                    placeholder="Driver handle (3–24 chars)"
                    maxLength={24}
                    className="flex-1 border border-white/20 bg-black/65 px-2.5 py-1.5 font-mono-tabular text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={handleSaving}
                    className="inline-flex h-8 items-center gap-1 bg-sky-500 px-3 font-display text-[11px] font-bold text-slate-950 uppercase hover:bg-sky-400 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{handleSaving ? 'Saving' : 'Save'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingHandle(false)}
                    className="h-8 border border-white/15 bg-white/5 px-2.5 text-[11px] text-slate-300 hover:text-white"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="border border-white/10 bg-black/45 p-3">
                <div className="text-[10px] tracking-wider text-slate-400 uppercase">Races Completed</div>
                <div className="font-mono-tabular mt-0.5 text-xl font-bold text-white">
                  {stats.racesCompleted}
                </div>
              </div>
              <div className="border border-white/10 bg-black/45 p-3">
                <div className="text-[10px] tracking-wider text-slate-400 uppercase">Race Wins</div>
                <div className="font-mono-tabular mt-0.5 text-xl font-bold text-amber-300">
                  {stats.racesWon}
                </div>
              </div>
              <div className="border border-white/10 bg-black/45 p-3">
                <div className="text-[10px] tracking-wider text-slate-400 uppercase">Distance Driven</div>
                <div className="font-mono-tabular mt-0.5 text-xl font-bold text-sky-300">
                  {stats.totalDistanceKm.toFixed(1)} km
                </div>
              </div>
              <div className="border border-white/10 bg-black/45 p-3">
                <div className="text-[10px] tracking-wider text-slate-400 uppercase">Total Drift Pts</div>
                <div className="font-mono-tabular mt-0.5 text-xl font-bold text-white">
                  {stats.totalDriftScore.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="border border-white/10 bg-black/35 px-3.5 py-2.5 text-xs text-slate-300">
              {user.authProvider === 'google'
                ? 'Sign in with this Google account on any browser or device to automatically restore your credits, tunes, liveries, telemetry, lap records, and custom maps from Firebase Firestore and Render Cloud.'
                : `Sign in with @${user.username} and your password on any device to restore your credits, tunes, liveries, lap records, and custom maps from Render Cloud.`}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-3">
              {onOpenProfile && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenProfile();
                  }}
                  className="mr-auto inline-flex h-11 sm:h-auto items-center gap-1.5 border border-amber-400/45 bg-amber-500/15 px-3.5 py-2 font-display text-xs font-bold tracking-wider text-amber-200 uppercase hover:bg-amber-500/25 whitespace-nowrap shrink-0"
                >
                  <User className="h-3.5 w-3.5" />
                  <span>Full Profile</span>
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  setSubmitting(true);
                  await onLogout();
                  setSubmitting(false);
                }}
                disabled={submitting}
                className="inline-flex h-11 sm:h-auto items-center gap-2 border border-rose-500/50 bg-rose-500/15 px-4 py-2 font-display text-xs font-bold tracking-wider text-rose-200 uppercase hover:bg-rose-500/25 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-11 sm:h-auto bg-sky-500 px-5 py-2 font-display text-xs font-bold tracking-wider text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap shrink-0"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 p-4 sm:p-5">
            {error && (
              <div className="space-y-2 border border-rose-500/60 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                <div>{error}</div>
                {showSwitchToSignup && mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setConfirmPassword(password);
                      setError(null);
                      setShowSwitchToSignup(false);
                    }}
                    className="inline-flex items-center gap-1.5 border border-sky-400/50 bg-sky-500/20 px-2.5 py-1 text-[11px] font-bold tracking-wider text-sky-200 uppercase hover:bg-sky-500/30"
                  >
                    <UserPlus className="h-3 w-3" />
                    <span>Switch to Create Account</span>
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {/* Option 1: Firebase Cloud (Google Sign-In + Firestore) */}
              <div className="flex flex-col justify-between space-y-3 border border-sky-400/35 bg-sky-500/[0.07] p-3.5">
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-sky-300 uppercase">
                      <Cloud className="h-4 w-4 shrink-0" />
                      <span>Firebase Cloud</span>
                    </div>
                    <span
                      className={`border px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold uppercase ${firebaseTone}`}
                    >
                      {firebaseStatusLabel}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-300">
                    Sign in with Google to store your driver profile, garage builds, credits, lap records, and custom maps in Firebase Firestore.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={googleSubmitting || submitting}
                    className="flex w-full min-h-[46px] items-center justify-center gap-2.5 bg-white px-4 py-2.5 font-display text-xs sm:text-sm font-bold tracking-wider text-slate-950 uppercase transition-colors hover:bg-slate-100 disabled:opacity-50"
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                      />
                    </svg>
                    <span>{googleSubmitting ? 'Connecting Firebase...' : 'Continue with Google'}</span>
                  </button>
                  <div className="text-[10px] leading-relaxed text-slate-400">
                    One-click OAuth login; also mirrors multiplayer parties &amp; leaderboards on the Render server.
                  </div>
                </div>
              </div>

              {/* Option 2: Render Cloud Account (PostgreSQL / .env DATABASE_URL) */}
              <div className="space-y-3 border border-emerald-400/35 bg-emerald-500/[0.05] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-emerald-300 uppercase">
                    <Database className="h-4 w-4 shrink-0" />
                    <span>Render Cloud Account</span>
                  </div>
                  <span
                    className={`border px-1.5 py-0.5 font-mono-tabular text-[9px] font-bold uppercase ${renderBackendTone}`}
                  >
                    {renderBackendLabel}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  Sign in with a Driver Handle &amp; Password backed by Render PostgreSQL (<code className="text-slate-200">DATABASE_URL</code>) without needing a Google account.
                </p>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="grid grid-cols-2 border border-white/12 bg-black/50 p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('login');
                        setError(null);
                        setShowSwitchToSignup(false);
                      }}
                      className={`flex min-h-[38px] sm:min-h-0 items-center justify-center gap-1.5 py-1.5 font-display text-xs font-bold tracking-wider uppercase transition-colors ${
                        mode === 'login'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <LogIn className="h-3.5 w-3.5" />
                      <span>Sign In</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('signup');
                        setError(null);
                        setShowSwitchToSignup(false);
                      }}
                      className={`flex min-h-[38px] sm:min-h-0 items-center justify-center gap-1.5 py-1.5 font-display text-xs font-bold tracking-wider uppercase transition-colors ${
                        mode === 'signup'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Create Account</span>
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold tracking-wider text-slate-300 uppercase">
                        Driver Username
                      </label>
                      <div className="flex items-center border border-white/15 bg-black/60 px-3">
                        <User className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="e.g. apex_driver_01"
                          autoComplete="username"
                          className="w-full bg-transparent py-2 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-[10px] font-semibold tracking-wider text-slate-300 uppercase">
                        Password
                      </label>
                      <div className="flex items-center border border-white/15 bg-black/60 px-3">
                        <Lock className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter password (min 4 chars)"
                          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                          className="w-full bg-transparent py-2 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {mode === 'signup' && (
                      <div>
                        <label className="mb-1 block text-[10px] font-semibold tracking-wider text-slate-300 uppercase">
                          Confirm Password
                        </label>
                        <div className="flex items-center border border-white/15 bg-black/60 px-3">
                          <Lock className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter password"
                            autoComplete="new-password"
                            className="w-full bg-transparent py-2 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || googleSubmitting}
                    className="w-full min-h-[44px] bg-emerald-500 py-2.5 font-display text-xs sm:text-sm font-bold tracking-wider text-slate-950 uppercase transition-colors hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {submitting
                      ? 'Syncing Render Cloud...'
                      : mode === 'login'
                        ? 'Sign In via Render Cloud'
                        : 'Register on Render Cloud'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
