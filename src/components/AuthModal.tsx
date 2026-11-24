import { Cloud, Lock, LogIn, LogOut, ShieldCheck, User, UserPlus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, normalizeClientUsername } from '../services/apiClient';
import type { AuthUser, UserCareerStats } from '../shared/socialTypes';

interface AuthModalProps {
  isOpen: boolean;
  mandatory?: boolean;
  defaultUsername?: string;
  user: AuthUser | null;
  stats: UserCareerStats;
  onClose: () => void;
  onOpenProfile?: () => void;
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
  onClose,
  onOpenProfile,
  onLogin,
  onSignup,
  onLogout,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState(() => defaultUsername);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSwitchToSignup, setShowSwitchToSignup] = useState(false);

  useEffect(() => {
    if (isOpen && !user && !username && defaultUsername) {
      setUsername(defaultUsername);
    }
  }, [defaultUsername, isOpen, user, username]);

  if (!isOpen) return null;

  const isLockedGate = mandatory && !user;

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
          `No server account found for "@${trimmed}". Check spelling or create "@${trimmed}" to continue (any local progress on this device is kept).`,
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
        className="gt5-panel gt5-carbon flex max-h-[94dvh] landscape-short:max-h-[96dvh] w-full max-w-md flex-col overflow-hidden border border-white/15 bg-[#0c0e13] text-slate-100 shadow-2xl"
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
                {user ? 'Driver Cloud Profile' : isLockedGate ? 'Driver Sign In Required' : 'Driver Account & Cloud Sync'}
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                {isLockedGate
                  ? 'Sign in or create an account to enter the garage & race'
                  : 'Cross-device cloud progress, multiplayer parties & custom maps'}
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
            <div className="flex items-center justify-between border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2.5 sm:px-4 sm:py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center border border-emerald-400/50 bg-emerald-500/20 text-emerald-300 shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-base font-bold text-white truncate">@{user.username}</div>
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Cloud Sync Active · Cross-Device Saved</span>
                  </div>
                </div>
              </div>
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
              Sign in with <span className="font-mono-tabular text-sky-300">@{user.username}</span> on any other computer or device to automatically restore your car builds, liveries, lap records, and maps.
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
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-3.5 p-4 sm:space-y-4 sm:p-5">
            <div className="grid grid-cols-2 border border-white/12 bg-black/50 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setShowSwitchToSignup(false);
                }}
                className={`flex min-h-[44px] sm:min-h-0 items-center justify-center gap-2 py-2 font-display text-xs font-bold tracking-wider uppercase transition-colors ${
                  mode === 'login'
                    ? 'bg-sky-500 text-slate-950'
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
                className={`flex min-h-[44px] sm:min-h-0 items-center justify-center gap-2 py-2 font-display text-xs font-bold tracking-wider uppercase transition-colors ${
                  mode === 'signup'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Create Account</span>
              </button>
            </div>

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

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
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
                    className="w-full bg-transparent py-2.5 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
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
                    className="w-full bg-transparent py-2.5 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none"
                  />
                </div>
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold tracking-wider text-slate-300 uppercase">
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
                      className="w-full bg-transparent py-2.5 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-200">
              All car tunes, liveries, personal best laps, drift records, and custom maps are stored persistently so you can log in from any device.
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] bg-sky-500 py-2.5 font-display text-sm font-bold tracking-wider text-slate-950 uppercase transition-colors hover:bg-sky-400 disabled:opacity-50"
            >
              {submitting
                ? 'Authenticating...'
                : mode === 'login'
                ? 'Sign In & Sync Progress'
                : 'Register & Save Progress'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
