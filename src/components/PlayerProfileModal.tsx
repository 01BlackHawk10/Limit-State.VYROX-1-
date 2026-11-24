import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  Car,
  Check,
  Compass,
  Edit3,
  Flame,
  Loader2,
  Map as MapIcon,
  Search,
  Swords,
  Trophy,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { computeAnalyticsSummary } from '../engine/driverAnalytics';
import { MAP_LIST, MAP_REGISTRY } from '../Maps/mapRegistry';
import {
  fetchPlayerProfile,
  sendFriendRequestByUsername,
  updateMyProfileBio,
} from '../services/apiClient';
import { GARAGE_CARS } from '../data/garageCars';
import type {
  AuthUser,
  CustomMapBlueprint,
  DriverAnalyticsData,
  PublicPlayerProfile,
  UserCareerStats,
} from '../shared/socialTypes';

interface PlayerProfileModalProps {
  open: boolean;
  targetIdentifier: string | null;
  authUser: AuthUser | null;
  localStats: UserCareerStats;
  localAnalytics: DriverAnalyticsData;
  localBio: string;
  localHomeCircuitId: string;
  localSelectedCarId: string;
  localCreditsCr: number;
  localTofuGrades: Record<string, { grade: 'S' | 'A' | 'B' | 'C' }>;
  onClose: () => void;
  onUpdateLocalBio?: (bio: string, homeCircuitId: string) => void;
  onOpenAccountSettings?: () => void;
  onDriveCustomMap?: (blueprint: CustomMapBlueprint) => void;
  onChallengePlayer?: (username: string) => void;
}

function formatLapTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms <= 0) return '--:--.---';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const rem = Math.floor(ms % 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(rem).padStart(3, '0')}`;
}

function getLicenseTier(stats: UserCareerStats): { grade: string; title: string; colorClass: string } {
  const score =
    stats.racesCompleted * 10 +
    stats.racesWon * 25 +
    stats.totalDistanceKm * 1.5 +
    stats.totalDriftScore / 3500;
  if (score >= 900) return { grade: 'S', title: 'Apex Legend', colorClass: 'border-amber-400 text-amber-300 bg-amber-500/15' };
  if (score >= 420) return { grade: 'A', title: 'Pro Touge Specialist', colorClass: 'border-sky-400 text-sky-300 bg-sky-500/15' };
  if (score >= 160) return { grade: 'B', title: 'Clubsport Contender', colorClass: 'border-emerald-400 text-emerald-300 bg-emerald-500/15' };
  return { grade: 'C', title: 'Circuit Rookie', colorClass: 'border-slate-400 text-slate-200 bg-white/10' };
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  open,
  targetIdentifier,
  authUser,
  localStats,
  localAnalytics,
  localBio,
  localHomeCircuitId,
  localSelectedCarId,
  localCreditsCr,
  localTofuGrades,
  onClose,
  onUpdateLocalBio,
  onOpenAccountSettings,
  onDriveCustomMap,
  onChallengePlayer,
}) => {
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [activeTab, setActiveTab] = useState<'laps' | 'drifts' | 'maps'>('laps');
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [homeDraft, setHomeDraft] = useState('aurelia_ridge');
  const [savingBio, setSavingBio] = useState(false);
  const [friendStatusMsg, setFriendStatusMsg] = useState<string | null>(null);

  const loadTargetProfile = useCallback(
    async (identifier: string) => {
      setErrorMsg(null);
      setFriendStatusMsg(null);
      setEditingBio(false);

      if (identifier === '__local__' || (!authUser && identifier === 'local')) {
        const grades: Record<string, 'S' | 'A' | 'B' | 'C'> = {};
        for (const [k, v] of Object.entries(localTofuGrades)) {
          if (v?.grade) grades[k] = v.grade;
        }
        const localProf: PublicPlayerProfile = {
          userId: 'local',
          username: 'Guest Driver',
          createdAt: Date.now(),
          lastSeenAt: Date.now(),
          online: true,
          isSelf: true,
          isFriend: false,
          hasIncomingFriendRequest: false,
          hasOutgoingFriendRequest: false,
          driverBio: localBio,
          homeCircuitId: localHomeCircuitId,
          selectedCarId: localSelectedCarId,
          creditsCr: localCreditsCr,
          stats: localStats,
          driverAnalytics: localAnalytics,
          tofuChaptersCompleted: Object.keys(grades).length,
          tofuBestGrades: grades,
          topLapRecords: [],
          topDriftRecords: [],
          publishedMaps: [],
          totalMapLikes: 0,
          totalMapPlays: 0,
        };
        setProfile(localProf);
        setBioDraft(localProf.driverBio);
        setHomeDraft(localProf.homeCircuitId);
        return;
      }

      setLoading(true);
      try {
        const fetched = await fetchPlayerProfile(identifier);
        setProfile(fetched);
        setBioDraft(fetched.driverBio);
        setHomeDraft(fetched.homeCircuitId || 'aurelia_ridge');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load driver profile.');
      } finally {
        setLoading(false);
      }
    },
    [
      authUser,
      localAnalytics,
      localBio,
      localCreditsCr,
      localHomeCircuitId,
      localSelectedCarId,
      localStats,
      localTofuGrades,
    ],
  );

  useEffect(() => {
    if (!open) return;
    const id = targetIdentifier ?? (authUser ? authUser.username : '__local__');
    void loadTargetProfile(id);
  }, [authUser, loadTargetProfile, open, targetIdentifier]);

  const analyticsSummary = useMemo(
    () => (profile?.driverAnalytics ? computeAnalyticsSummary(profile.driverAnalytics) : null),
    [profile?.driverAnalytics],
  );

  if (!open) return null;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchInput.trim().replace(/^@+/, '');
    if (!clean) return;
    void loadTargetProfile(clean);
  };

  const handleSaveBio = async () => {
    if (!profile || !profile.isSelf) return;
    const cleanBio = bioDraft.trim().slice(0, 180);
    setSavingBio(true);
    try {
      if (authUser && profile.userId !== 'local') {
        const saved = await updateMyProfileBio(cleanBio, homeDraft);
        setProfile({ ...profile, driverBio: saved.driverBio, homeCircuitId: saved.homeCircuitId });
        onUpdateLocalBio?.(saved.driverBio, saved.homeCircuitId);
      } else {
        setProfile({ ...profile, driverBio: cleanBio, homeCircuitId: homeDraft });
        onUpdateLocalBio?.(cleanBio, homeDraft);
      }
      setEditingBio(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save driver bio.');
    } finally {
      setSavingBio(false);
    }
  };

  const handleSendFriendRequest = async () => {
    if (!profile || profile.isSelf || !authUser) return;
    try {
      await sendFriendRequestByUsername(profile.username);
      setProfile({ ...profile, hasOutgoingFriendRequest: true });
      setFriendStatusMsg('Friend request sent');
    } catch (err) {
      setFriendStatusMsg(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const tier = profile ? getLicenseTier(profile.stats) : null;
  const favCarName =
    GARAGE_CARS.find((c) => c.carModelId === profile?.selectedCarId)?.name ??
    profile?.selectedCarId ??
    'GT3 Spec';
  const homeCircuitName =
    MAP_REGISTRY[profile?.homeCircuitId as keyof typeof MAP_REGISTRY]?.name ??
    profile?.homeCircuitId ??
    'Aurelia Ridge';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 p-3 sm:p-6">
      <div className="gt5-panel flex max-h-[90vh] w-full max-w-4xl flex-col border border-white/20 shadow-2xl overflow-hidden">
        {/* Top Search & Close Bar */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/12 bg-black/55 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Award className="h-4 w-4 text-sky-400 shrink-0" />
            <h2 className="font-display text-sm font-black tracking-[0.14em] text-white uppercase">
              Driver Profile Viewer
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <form onSubmit={handleSearchSubmit} className="flex items-center border border-white/15 bg-black/60">
              <Search className="ml-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search @driver..."
                className="w-36 sm:w-44 bg-transparent px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
              />
              <button
                type="submit"
                className="border-l border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-bold tracking-wider text-sky-300 uppercase hover:bg-sky-500/20 cursor-pointer"
              >
                Lookup
              </button>
            </form>

            <button
              type="button"
              onClick={onClose}
              className="border border-white/15 bg-white/[0.04] p-1.5 text-slate-300 hover:border-white/40 hover:text-white cursor-pointer"
              aria-label="Close Player Profile"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-xs font-bold tracking-wider text-slate-300 uppercase gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
              Loading Driver Telemetry...
            </div>
          ) : errorMsg ? (
            <div className="border border-rose-400/40 bg-rose-500/12 p-4 text-xs text-rose-200 flex items-center justify-between gap-3">
              <span>{errorMsg}</span>
              {authUser && (
                <button
                  type="button"
                  onClick={() => void loadTargetProfile(authUser.username)}
                  className="border border-white/20 px-3 py-1 text-[10px] font-bold uppercase text-white hover:border-sky-400 cursor-pointer"
                >
                  View My Profile
                </button>
              )}
            </div>
          ) : profile && tier ? (
            <>
              {/* Hero Driver Identity Card */}
              <section className="border border-white/12 bg-black/50 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center border text-xl font-black font-display ${tier.colorClass}`}
                    >
                      {tier.grade}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-lg font-black tracking-wide text-white">
                          @{profile.username}
                        </h3>
                        <span className="border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-300 uppercase">
                          {tier.title}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-300">
                          {profile.partyCode
                            ? `In Party ${profile.partyCode}`
                            : profile.online
                              ? 'Online'
                              : 'Offline'}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Car className="h-3.5 w-3.5 text-sky-400" /> {favCarName}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Compass className="h-3.5 w-3.5 text-amber-400" /> Home: {homeCircuitName}
                        </span>
                        <span>·</span>
                        <span>
                          Joined {new Date(profile.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Profile Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {profile.isSelf ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingBio((v) => !v)}
                          className="flex items-center gap-1.5 border border-white/18 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold tracking-wider text-white uppercase hover:border-sky-400 transition-colors cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-sky-400" />
                          {editingBio ? 'Cancel Edit' : 'Edit Bio'}
                        </button>
                        {onOpenAccountSettings && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenAccountSettings();
                            }}
                            className="border border-white/18 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold tracking-wider text-slate-200 uppercase hover:border-white/40 cursor-pointer"
                          >
                            Account
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        {authUser && (
                          profile.isFriend ? (
                            <span className="flex items-center gap-1 border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-bold tracking-wider text-emerald-300 uppercase">
                              <UserCheck className="h-3.5 w-3.5" /> Friends
                            </span>
                          ) : profile.hasOutgoingFriendRequest ? (
                            <span className="border border-amber-400/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-bold tracking-wider text-amber-200 uppercase">
                              Request Sent
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={handleSendFriendRequest}
                              className="flex items-center gap-1.5 border border-sky-400/50 bg-sky-500/20 px-3 py-1.5 text-[11px] font-bold tracking-wider text-white uppercase hover:bg-sky-500/35 cursor-pointer"
                            >
                              <UserPlus className="h-3.5 w-3.5" /> Add Friend
                            </button>
                          )
                        )}
                        {onChallengePlayer && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onChallengePlayer(profile.username);
                            }}
                            className="flex items-center gap-1.5 border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 text-[11px] font-bold tracking-wider text-amber-100 uppercase hover:bg-amber-500/35 cursor-pointer"
                          >
                            <Swords className="h-3.5 w-3.5" /> Challenge
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {friendStatusMsg && (
                  <div className="text-[11px] font-semibold text-sky-300">{friendStatusMsg}</div>
                )}

                {/* Bio Display / Editor */}
                {editingBio ? (
                  <div className="border-t border-white/10 pt-3 space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">
                          Driver Bio (max 180 chars)
                        </label>
                        <input
                          type="text"
                          maxLength={180}
                          value={bioDraft}
                          onChange={(e) => setBioDraft(e.target.value)}
                          placeholder="Touge specialist, clean late-braker..."
                          className="w-full border border-white/18 bg-black/70 px-3 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">
                          Home Circuit
                        </label>
                        <select
                          value={homeDraft}
                          onChange={(e) => setHomeDraft(e.target.value)}
                          className="w-full border border-white/18 bg-black/70 px-2.5 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                        >
                          {MAP_LIST.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={savingBio}
                        onClick={handleSaveBio}
                        className="flex items-center gap-1.5 border border-emerald-400/50 bg-emerald-500/20 px-3.5 py-1.5 text-[11px] font-bold tracking-wider text-emerald-100 uppercase hover:bg-emerald-500/35 cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {savingBio ? 'Saving...' : 'Save Profile'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="border-t border-white/10 pt-2.5 text-xs text-slate-300 italic">
                    {profile.driverBio || 'No driver bio set yet.'}
                  </p>
                )}
              </section>

              {/* Career & Telemetry Summary Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono-tabular">
                <div className="border border-white/12 bg-black/45 p-3">
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    Races / Wins
                  </div>
                  <div className="mt-1 text-lg font-black text-white">
                    {profile.stats.racesCompleted}{' '}
                    <span className="text-xs font-bold text-emerald-300">
                      ({profile.stats.racesWon}W)
                    </span>
                  </div>
                </div>
                <div className="border border-white/12 bg-black/45 p-3">
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    Total Distance
                  </div>
                  <div className="mt-1 text-lg font-black text-sky-300">
                    {profile.stats.totalDistanceKm.toFixed(1)} km
                  </div>
                </div>
                <div className="border border-white/12 bg-black/45 p-3">
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    Total Drift Score
                  </div>
                  <div className="mt-1 text-lg font-black text-amber-300">
                    {profile.stats.totalDriftScore.toLocaleString()}
                  </div>
                </div>
                <div className="border border-white/12 bg-black/45 p-3">
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    Tofu Story Clears
                  </div>
                  <div className="mt-1 text-lg font-black text-white">
                    {profile.tofuChaptersCompleted} chapters
                  </div>
                </div>
              </div>

              {/* Driver Analytics Snapshot */}
              {profile.driverAnalytics && analyticsSummary && profile.driverAnalytics.totalSessions > 0 && (
                <section className="border border-sky-400/25 bg-sky-500/[0.05] p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-display font-bold tracking-wider text-sky-200 uppercase">
                      Telemetry Signature ({profile.driverAnalytics.totalSessions} Sessions)
                    </span>
                    <span className="font-mono-tabular text-[10px] text-slate-300">
                      Peak {profile.driverAnalytics.peakLatG.toFixed(2)}G · {profile.driverAnalytics.totalCorners} corners
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono-tabular text-xs">
                    <div className="border border-white/10 bg-black/45 p-2.5">
                      <div className="text-[9px] text-slate-400 uppercase">Avg Turn-In</div>
                      <div className="font-bold text-white">
                        {analyticsSummary.avgTurnInAngleDeg.toFixed(1)}°
                      </div>
                    </div>
                    <div className="border border-white/10 bg-black/45 p-2.5">
                      <div className="text-[9px] text-slate-400 uppercase">Thr → Brake</div>
                      <div className="font-bold text-amber-300">
                        {analyticsSummary.avgThrottleToBrakeMs !== null
                          ? `${Math.round(analyticsSummary.avgThrottleToBrakeMs)} ms`
                          : '-- ms'}
                      </div>
                    </div>
                    <div className="border border-white/10 bg-black/45 p-2.5">
                      <div className="text-[9px] text-slate-400 uppercase">Drift → Grip</div>
                      <div className="font-bold text-emerald-300">
                        {analyticsSummary.driftToGripEfficiencyPct > 0
                          ? `${analyticsSummary.driftToGripEfficiencyPct.toFixed(1)}%`
                          : `${analyticsSummary.cleanDrivingPct.toFixed(0)}%`}
                      </div>
                    </div>
                    <div className="border border-white/10 bg-black/45 p-2.5">
                      <div className="text-[9px] text-slate-400 uppercase">Trail-Braking</div>
                      <div className="font-bold text-sky-300">
                        {analyticsSummary.trailBrakingPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Tabbed Records & Published Circuits */}
              <section className="border border-white/12 bg-black/45">
                <div className="grid grid-cols-3 border-b border-white/10 bg-black/50">
                  {[
                    { id: 'laps' as const, label: `Lap Records (${profile.topLapRecords.length})`, icon: Trophy },
                    { id: 'drifts' as const, label: `Drift Records (${profile.topDriftRecords.length})`, icon: Flame },
                    { id: 'maps' as const, label: `Published Maps (${profile.publishedMaps.length})`, icon: MapIcon },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center justify-center gap-1.5 border-b-2 py-2.5 text-[11px] font-bold tracking-wider uppercase transition-colors cursor-pointer ${
                          active
                            ? 'border-sky-400 bg-sky-500/15 text-white'
                            : 'border-transparent text-slate-400 hover:text-white'
                        }`}
                      >
                        <Icon className={`h-3.5 w-3.5 ${active ? 'text-sky-400' : 'text-slate-500'}`} />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="p-3">
                  {activeTab === 'laps' && (
                    profile.topLapRecords.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">
                        No ranked lap times posted yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-white/8 text-xs">
                        {profile.topLapRecords.map((rec) => (
                          <div key={rec.id} className="flex items-center justify-between py-2 gap-2">
                            <div>
                              <div className="font-bold text-white">{rec.mapName}</div>
                              <div className="text-[10px] text-slate-400 uppercase">
                                {rec.carId} · {rec.tireCompound} · PP {rec.ppRating}
                              </div>
                            </div>
                            <div className="font-mono-tabular text-sm font-black text-sky-300">
                              {formatLapTime(rec.bestLapMs)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {activeTab === 'drifts' && (
                    profile.topDriftRecords.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">
                        No ranked drift scores posted yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-white/8 text-xs">
                        {profile.topDriftRecords.map((rec) => (
                          <div key={rec.id} className="flex items-center justify-between py-2 gap-2">
                            <div>
                              <div className="font-bold text-white">{rec.mapName}</div>
                              <div className="text-[10px] text-slate-400 uppercase">
                                {rec.carId} · {rec.weatherPreset}
                              </div>
                            </div>
                            <div className="font-mono-tabular text-sm font-black text-amber-300">
                              {rec.driftScore.toLocaleString()} pts
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {activeTab === 'maps' && (
                    profile.publishedMaps.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">
                        No published circuits yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {profile.publishedMaps.map((m) => (
                          <div key={m.id} className="border border-white/12 bg-black/50 p-3 flex items-center justify-between gap-2">
                            <div>
                              <div className="font-bold text-xs text-white">{m.title}</div>
                              <div className="text-[10px] text-slate-400 uppercase">
                                {m.likesCount} likes · {m.playsCount} plays
                              </div>
                            </div>
                            {onDriveCustomMap && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onDriveCustomMap(m);
                                }}
                                className="border border-sky-400/50 bg-sky-500/20 px-2.5 py-1 text-[10px] font-bold tracking-wider text-white uppercase hover:bg-sky-500/35 cursor-pointer"
                              >
                                Drive
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
