import {
  Check,
  Compass,
  Copy,
  Crown,
  Flame,
  Globe,
  Heart,
  LogIn,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldOff,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { MAP_LIST } from '../Maps/mapRegistry';
import { GARAGE_CARS, formatLapMs } from './MainScreenOverlay';
import {
  deleteCustomMapById,
  fetchExploreMaps,
  fetchFriendsOverview,
  fetchLeaderboards,
  fetchLiveParties,
  fetchMyMaps,
  removeFriendById,
  respondToFriendRequest,
  sendFriendRequestByUsername,
  toggleLikeCustomMap,
} from '../services/apiClient';
import { multiplayerClient } from '../services/multiplayerClient';
import type {
  AuthUser,
  CustomMapBlueprint,
  FriendsOverview,
  LeaderboardRecord,
  MapDifficultyTag,
  MapTypeTag,
  PartyActivityMode,
  PartyCollisionMode,
  PartyRoomState,
  PartyRoomSummary,
  PartyVisibility,
  WeatherPresetId,
} from '../shared/socialTypes';

export type SocialHubTab = 'parties' | 'explore' | 'leaderboards' | 'friends';

interface SocialHubModalProps {
  isOpen: boolean;
  initialTab: SocialHubTab;
  initialRoomLaps?: number;
  user: AuthUser | null;
  selectedCarId: string;
  selectedPaintHex: string;
  activeParty: PartyRoomState | null;
  liveParties: PartyRoomSummary[];
  onClose: () => void;
  onRequireAuth: () => void;
  onPlayCustomMapSolo: (blueprint: CustomMapBlueprint) => void;
  onEditCustomMap: (blueprint: CustomMapBlueprint) => void;
  onLaunchPartyDrive: (room: PartyRoomState) => void;
  onSyncUrlLaps?: (laps: number) => void;
  onViewPlayerProfile?: (identifier: string) => void;
}

const WEATHER_LABELS: Array<{ id: WeatherPresetId; label: string }> = [
  { id: 'dry', label: 'Dry Clear' },
  { id: 'overcast', label: 'Overcast' },
  { id: 'rain', label: 'Rain' },
  { id: 'sunset_storm', label: 'Sunset Storm' },
  { id: 'deep_morning_mist', label: 'Morning Mist' },
];

export function SocialHubModal({
  isOpen,
  initialTab,
  initialRoomLaps = 3,
  user,
  selectedCarId,
  selectedPaintHex,
  activeParty,
  liveParties,
  onClose,
  onRequireAuth,
  onPlayCustomMapSolo,
  onEditCustomMap,
  onLaunchPartyDrive,
  onSyncUrlLaps,
  onViewPlayerProfile,
}: SocialHubModalProps) {
  const [tab, setTab] = useState<SocialHubTab>(initialTab);

  // Parties state
  const [joinCode, setJoinCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomVisibility, setRoomVisibility] = useState<PartyVisibility>('public');
  const [roomActivity, setRoomActivity] = useState<PartyActivityMode>('race');
  const [roomCollision, setRoomCollision] = useState<PartyCollisionMode>('race_only');
  const [roomMapId, setRoomMapId] = useState<string>('aurelia_ridge');
  const [roomCustomMapId, setRoomCustomMapId] = useState<string>('');
  const [roomWeather, setRoomWeather] = useState<WeatherPresetId>('dry');
  const [roomLaps, setRoomLaps] = useState<number>(() =>
    initialRoomLaps > 0 ? Math.min(999, initialRoomLaps) : 3,
  );
  const [partyListLocal, setPartyListLocal] = useState<PartyRoomSummary[]>(liveParties);
  const [chatDraft, setChatDraft] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Explore state
  const [exploreSort, setExploreSort] = useState<'top' | 'popular' | 'newest'>('top');
  const [exploreQuery, setExploreQuery] = useState('');
  const [exploreMapType, setExploreMapType] = useState<'all' | MapTypeTag>('all');
  const [exploreDifficulty, setExploreDifficulty] = useState<'all' | MapDifficultyTag>('all');
  const [exploreMineOnly, setExploreMineOnly] = useState(false);
  const [exploreMaps, setExploreMaps] = useState<CustomMapBlueprint[]>([]);
  const [myMaps, setMyMaps] = useState<CustomMapBlueprint[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);

  // Leaderboards state
  const [lbScope, setLbScope] = useState<'global' | 'friends'>('global');
  const [lbMode, setLbMode] = useState<'time_trial' | 'drift'>('time_trial');
  const [lbMapId, setLbMapId] = useState<string>('all');
  const [lbCarId, setLbCarId] = useState<string>('all');
  const [lbEntries, setLbEntries] = useState<LeaderboardRecord[]>([]);
  const [lbLoading, setLbLoading] = useState(false);

  // Friends state
  const [friendsData, setFriendsData] = useState<FriendsOverview>({ friends: [], requests: [] });
  const [friendUsernameInput, setFriendUsernameInput] = useState('');
  const [friendsStatusMsg, setFriendsStatusMsg] = useState<string | null>(null);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    setPartyListLocal(liveParties);
  }, [liveParties]);

  const loadExplore = useCallback(async () => {
    setExploreLoading(true);
    try {
      const [pub, mine] = await Promise.all([
        fetchExploreMaps(exploreSort, exploreQuery, exploreMapType, exploreDifficulty),
        user ? fetchMyMaps().catch(() => []) : Promise.resolve([]),
      ]);
      setExploreMaps(pub);
      setMyMaps(mine);
    } catch {
      // Ignore transient errors
    } finally {
      setExploreLoading(false);
    }
  }, [exploreSort, exploreQuery, exploreMapType, exploreDifficulty, user]);

  const loadLeaderboards = useCallback(async () => {
    setLbLoading(true);
    try {
      const rows = await fetchLeaderboards({
        scope: lbScope,
        mode: lbMode,
        mapId: lbMapId,
        carId: lbCarId,
      });
      setLbEntries(rows);
    } catch {
      setLbEntries([]);
    } finally {
      setLbLoading(false);
    }
  }, [lbScope, lbMode, lbMapId, lbCarId]);

  const loadFriends = useCallback(async () => {
    if (!user) {
      setFriendsData({ friends: [], requests: [] });
      return;
    }
    try {
      const data = await fetchFriendsOverview();
      setFriendsData(data);
    } catch {
      // Ignore
    }
  }, [user]);

  const refreshParties = useCallback(async () => {
    multiplayerClient.listParties();
    try {
      const rows = await fetchLiveParties();
      setPartyListLocal(rows);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (tab === 'explore') void loadExplore();
    else if (tab === 'leaderboards') void loadLeaderboards();
    else if (tab === 'friends') void loadFriends();
    else if (tab === 'parties') {
      void refreshParties();
      if (user) {
        void loadFriends();
        void loadExplore();
      }
    }
  }, [isOpen, tab, loadExplore, loadLeaderboards, loadFriends, refreshParties, user]);

  if (!isOpen) return null;

  const customMapOptions = [
    ...myMaps,
    ...exploreMaps.filter((m) => !myMaps.some((mine) => mine.id === m.id)),
  ];

  const handleCreateParty = () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    const chosenCustom = customMapOptions.find((m) => m.id === roomCustomMapId) ?? null;
    multiplayerClient.createParty({
      name: roomName.trim() || `${user.username}'s Room`,
      visibility: roomVisibility,
      activityMode: roomActivity,
      collisionMode: roomCollision,
      mapId: chosenCustom ? 'aurelia_ridge' : roomMapId,
      customMapId: chosenCustom?.id ?? null,
      customMapTitle: chosenCustom?.title ?? null,
      customBlueprint: chosenCustom,
      weatherPreset: roomWeather,
      laps: roomActivity === 'explore' ? 0 : roomLaps,
      carId: selectedCarId,
      paintHex: selectedPaintHex,
    });
  };

  const handleJoinByCode = () => {
    if (!user) {
      onRequireAuth();
      return;
    }
    if (!joinCode.trim()) return;
    multiplayerClient.joinParty({
      code: joinCode.trim().toUpperCase(),
      carId: selectedCarId,
      paintHex: selectedPaintHex,
    });
  };

  const handleStartFriendRace = (friendUserId: string, friendUsername: string) => {
    if (!user) {
      onRequireAuth();
      return;
    }
    const chosenCustom = customMapOptions.find((m) => m.id === roomCustomMapId) ?? null;
    multiplayerClient.challengeFriend({
      friendUserId,
      mapId: chosenCustom ? 'aurelia_ridge' : roomMapId || 'aurelia_ridge',
      customMapId: chosenCustom?.id ?? null,
      customBlueprint: chosenCustom,
      activityMode: roomActivity,
      weatherPreset: roomWeather,
      laps: roomActivity === 'explore' ? 0 : roomLaps,
      carId: selectedCarId,
      paintHex: selectedPaintHex,
    });
    setFriendsStatusMsg(`Live race invitation sent to @${friendUsername}!`);
    setTab('parties');
  };

  const handleHostMapParty = (bp: CustomMapBlueprint) => {
    if (!user) {
      onRequireAuth();
      return;
    }
    multiplayerClient.createParty({
      name: `${bp.title.slice(0, 26)} Lobby`,
      visibility: 'public',
      activityMode: 'explore',
      collisionMode: 'race_only',
      mapId: 'aurelia_ridge',
      customMapId: bp.id,
      customMapTitle: bp.title,
      customBlueprint: bp,
      weatherPreset: bp.defaultWeather,
      solarDeg: bp.defaultSolarDeg,
      laps: 3,
      carId: selectedCarId,
      paintHex: selectedPaintHex,
    });
    setTab('parties');
  };

  const isHost = Boolean(user && activeParty && activeParty.hostUserId === user.id);
  const myMember = user && activeParty ? activeParty.members.find((m) => m.userId === user.id) : null;
  const displayedExploreMaps = exploreMineOnly
    ? myMaps.filter((bp) => {
        const inferredType = bp.mapType ?? (bp.closedLoop ? 'circuit' : 'sprint');
        const inferredDiff = bp.difficulty ?? 'medium';
        if (exploreMapType !== 'all' && inferredType !== exploreMapType) return false;
        if (exploreDifficulty !== 'all' && inferredDiff !== exploreDifficulty) return false;
        if (exploreQuery.trim()) {
          const q = exploreQuery.trim().toLowerCase();
          if (
            !bp.title.toLowerCase().includes(q) &&
            !bp.description.toLowerCase().includes(q) &&
            !bp.authorUsername.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        return true;
      })
    : exploreMaps;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/84 p-0 sm:p-5"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
      }}
    >
      <div
        className="gt5-panel gt5-carbon flex h-[95dvh] sm:h-[90dvh] w-full max-w-6xl flex-col overflow-hidden border border-white/15 bg-[#0b0e14] text-slate-100 shadow-2xl"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Header + Tabs */}
        <header className="flex flex-col gap-2 border-b border-white/12 bg-black/60 px-3 py-2.5 sm:px-6 sm:py-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Globe className="h-4 w-4 sm:h-5 sm:w-5 text-sky-400 shrink-0" />
              <div className="min-w-0">
                <h2 className="font-display text-sm font-bold tracking-wider text-white uppercase sm:text-lg truncate">
                  Apex Social &amp; Multiplayer Hub
                </h2>
                <p className="hidden sm:block text-[11px] text-slate-400 truncate">
                  Live Party Servers · Community Maps · Global Leaderboards · Friends
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center border border-white/15 bg-white/5 text-slate-300 hover:border-white/35 hover:text-white shrink-0"
              aria-label="Close Social Hub"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:flex-wrap">
            {(
              [
                { id: 'parties', label: 'Party Servers', icon: Users },
                { id: 'explore', label: 'Explore Maps', icon: Compass },
                { id: 'leaderboards', label: 'Leaderboards', icon: Trophy },
                { id: 'friends', label: 'Friends', icon: UserPlus },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`inline-flex h-10 sm:h-auto items-center gap-1.5 border px-3 py-1.5 font-display text-[11px] sm:text-xs font-bold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-sky-400 bg-sky-500 text-slate-950'
                      : 'border-white/12 bg-white/[0.04] text-slate-300 hover:border-white/30 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                  {item.id === 'parties' && activeParty && (
                    <span className="ml-1 bg-black/25 px-1.5 py-0.5 font-mono-tabular text-[10px]">
                      {activeParty.code}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          {/* ═══════════════ TAB 1: PARTIES & SERVERS ═══════════════ */}
          {tab === 'parties' && (
            <div className="space-y-4 sm:space-y-5">
              {!user && (
                <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-400/45 bg-amber-500/12 px-4 py-3">
                  <div className="text-xs text-amber-100">
                    Sign in with a driver username to host, join, or chat in multiplayer Party Servers.
                  </div>
                  <button
                    type="button"
                    onClick={onRequireAuth}
                    className="inline-flex h-10 sm:h-auto items-center gap-1.5 bg-amber-400 px-3.5 py-1.5 font-display text-xs font-bold tracking-wider text-slate-950 uppercase hover:bg-amber-300 whitespace-nowrap shrink-0"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    <span>Sign In / Register</span>
                  </button>
                </div>
              )}

              {activeParty ? (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_1fr]">
                  {/* Left: Room Lobby & Host Controls */}
                  <div className="space-y-4 border border-sky-400/35 bg-black/45 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display text-lg font-bold text-white uppercase">
                            {activeParty.name}
                          </span>
                          <span className="border border-sky-400/45 bg-sky-500/15 px-2 py-0.5 font-mono-tabular text-xs font-bold text-sky-300">
                            CODE {activeParty.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(activeParty.code);
                              setCopiedCode(true);
                              window.setTimeout(() => setCopiedCode(false), 1600);
                            }}
                            className="flex h-9 w-9 sm:h-7 sm:w-7 items-center justify-center border border-white/15 bg-white/5 text-slate-300 hover:text-white shrink-0"
                            title="Copy Room Code"
                          >
                            {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span>Host: @{activeParty.hostUsername}</span>
                          <span>·</span>
                          <span className="text-sky-300 uppercase">{activeParty.activityMode}</span>
                          <span>·</span>
                          <span className="text-amber-300 uppercase">
                            Collisions: {activeParty.collisionMode.replace('_', ' ')}
                          </span>
                          <span>·</span>
                          <span>Status: {activeParty.status.toUpperCase()}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {(activeParty.status === 'active' || activeParty.status === 'countdown') && (
                          <button
                            type="button"
                            onClick={() => onLaunchPartyDrive(activeParty)}
                            className="inline-flex h-10 sm:h-auto items-center gap-1.5 bg-emerald-400 px-4 py-2 font-display text-xs font-bold tracking-wider text-slate-950 uppercase hover:bg-emerald-300 whitespace-nowrap shrink-0"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            <span>Enter Track</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => multiplayerClient.leaveParty()}
                          className="h-10 sm:h-auto border border-rose-500/50 bg-rose-500/15 px-3 py-2 font-display text-xs font-bold tracking-wider text-rose-200 uppercase hover:bg-rose-500/25 whitespace-nowrap shrink-0"
                        >
                          Leave Room
                        </button>
                      </div>
                    </div>

                    {/* Host Room Settings */}
                    {isHost ? (
                      <div className="space-y-3 border border-white/10 bg-white/[0.02] p-3">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-amber-300 uppercase">
                          <Crown className="h-3.5 w-3.5" />
                          <span>Host Room Controls</span>
                        </div>
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                          <div>
                            <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                              Activity Mode
                            </label>
                            <select
                              value={activeParty.activityMode}
                              onChange={(e) =>
                                multiplayerClient.updatePartySettings({
                                  activityMode: e.target.value as PartyActivityMode,
                                })
                              }
                              className="h-10 sm:h-auto w-full border border-white/15 bg-black/70 px-2.5 py-1.5 text-sm sm:text-xs text-white"
                            >
                              <option value="race">Competitive Race</option>
                              <option value="tandem_drift">Tandem Drift Battle</option>
                              <option value="explore">Free-Roam Explore</option>
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                              Car Collision Mode
                            </label>
                            <select
                              value={activeParty.collisionMode}
                              onChange={(e) =>
                                multiplayerClient.updatePartySettings({
                                  collisionMode: e.target.value as PartyCollisionMode,
                                })
                              }
                              className="h-10 sm:h-auto w-full border border-white/15 bg-black/70 px-2.5 py-1.5 text-sm sm:text-xs text-white"
                            >
                              <option value="ghost">Ghost Cars (No Contact)</option>
                              <option value="collide">Collisions Always On</option>
                              <option value="race_only">Race Only (Ghost in Explore)</option>
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                              Weather Preset
                            </label>
                            <select
                              value={activeParty.weatherPreset}
                              onChange={(e) =>
                                multiplayerClient.updatePartySettings({
                                  weatherPreset: e.target.value as WeatherPresetId,
                                })
                              }
                              className="h-10 sm:h-auto w-full border border-white/15 bg-black/70 px-2.5 py-1.5 text-sm sm:text-xs text-white"
                            >
                              {WEATHER_LABELS.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                          <div>
                            <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                              Official Map
                            </label>
                            <select
                              value={activeParty.customMapId ? '' : activeParty.mapId}
                              onChange={(e) =>
                                multiplayerClient.updatePartySettings({
                                  mapId: e.target.value,
                                  customMapId: null,
                                  customBlueprint: null,
                                })
                              }
                              className="h-10 sm:h-auto w-full border border-white/15 bg-black/70 px-2.5 py-1.5 text-sm sm:text-xs text-white"
                            >
                              <option value="" disabled>
                                Custom Map Active
                              </option>
                              {MAP_LIST.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                              Custom Community Map
                            </label>
                            <select
                              value={activeParty.customMapId ?? ''}
                              onChange={(e) => {
                                const cid = e.target.value;
                                const found = customMapOptions.find((m) => m.id === cid) ?? null;
                                multiplayerClient.updatePartySettings({
                                  mapId: 'aurelia_ridge',
                                  customMapId: cid || null,
                                  customBlueprint: found,
                                });
                              }}
                              className="h-10 sm:h-auto w-full border border-white/15 bg-black/70 px-2.5 py-1.5 text-sm sm:text-xs text-white"
                            >
                              <option value="">None (Use Official Map)</option>
                              {customMapOptions.map((cm) => (
                                <option key={cm.id} value={cm.id}>
                                  {cm.title} (@{cm.authorUsername})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="mb-1 flex items-center justify-between text-[10px] text-slate-400 uppercase">
                              <span>
                                Laps ({activeParty.laps === 0 ? 'Unlimited' : activeParty.laps})
                              </span>
                              <span className="font-mono-tabular text-sky-400">
                                ?laps={activeParty.laps === 0 ? 'unlimited' : activeParty.laps}
                              </span>
                            </label>
                            <div className="flex flex-wrap items-center gap-1">
                              {[1, 3, 5, 10, 20, 0].map((val) => (
                                <button
                                  key={val}
                                  type="button"
                                  onClick={() => {
                                    multiplayerClient.updatePartySettings({ laps: val });
                                    onSyncUrlLaps?.(val);
                                  }}
                                  className={`h-8 border px-2 font-mono-tabular text-[11px] font-semibold ${
                                    activeParty.laps === val
                                      ? 'border-sky-400 bg-sky-500 text-slate-950'
                                      : 'border-white/15 bg-black/60 text-slate-200 hover:border-white/30'
                                  }`}
                                >
                                  {val === 0 ? 'Free' : `${val}L`}
                                </button>
                              ))}
                              <input
                                type="number"
                                min={0}
                                max={999}
                                value={activeParty.laps}
                                aria-label="Custom party lap count"
                                onChange={(e) => {
                                  const raw = parseInt(e.target.value, 10);
                                  if (!Number.isFinite(raw)) return;
                                  const clamped = Math.max(0, Math.min(999, raw));
                                  multiplayerClient.updatePartySettings({ laps: clamped });
                                  onSyncUrlLaps?.(clamped);
                                }}
                                className="h-8 w-14 border border-white/20 bg-black/75 px-1.5 text-center font-mono-tabular text-xs font-bold text-amber-300 focus:border-sky-400 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          {activeParty.status !== 'lobby' && (
                            <button
                              type="button"
                              onClick={() => multiplayerClient.returnToLobby()}
                              className="h-10 sm:h-auto border border-white/20 bg-white/5 px-3.5 py-2 font-display text-xs font-bold tracking-wider text-slate-200 uppercase hover:border-white/40 whitespace-nowrap shrink-0"
                            >
                              Return Room to Lobby
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => multiplayerClient.startParty()}
                            className="inline-flex h-10 sm:h-auto items-center gap-2 bg-sky-500 px-5 py-2 font-display text-xs font-bold tracking-wider text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap shrink-0"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            <span>
                              {activeParty.activityMode === 'explore'
                                ? 'Launch Explore Session'
                                : 'Start Multiplayer Race'}
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-xs">
                        <span>
                          Circuit:{' '}
                          <strong className="text-white">
                            {activeParty.customMapTitle ||
                              MAP_LIST.find((m) => m.id === activeParty.mapId)?.name ||
                              activeParty.mapId}
                          </strong>{' '}
                          · {activeParty.weatherPreset.replace('_', ' ')} ·{' '}
                          {activeParty.laps === 0 ? 'Free Cruise' : `${activeParty.laps} Laps`}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            multiplayerClient.setReady({
                              ready: !myMember?.ready,
                              carId: selectedCarId,
                              paintHex: selectedPaintHex,
                            })
                          }
                          className={`h-10 sm:h-auto border px-3.5 py-1.5 font-display text-xs font-bold uppercase whitespace-nowrap shrink-0 ${
                            myMember?.ready
                              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                              : 'border-white/20 bg-white/5 text-slate-200'
                          }`}
                        >
                          {myMember?.ready ? 'Ready' : 'Mark Ready'}
                        </button>
                      </div>
                    )}

                    {/* Driver Roster */}
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs font-bold tracking-wider text-slate-300 uppercase">
                        <span>
                          Drivers in Room ({activeParty.members.length}/{activeParty.maxMembers})
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          {activeParty.collisionMode === 'ghost' ? (
                            <>
                              <ShieldOff className="h-3.5 w-3.5 text-sky-400" />
                              Ghost Cars
                            </>
                          ) : (
                            <>
                              <Shield className="h-3.5 w-3.5 text-amber-400" />
                              {activeParty.collisionMode === 'collide'
                                ? 'Contact Enabled'
                                : 'Contact in Race Only'}
                            </>
                          )}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {activeParty.members.map((m) => (
                          <div
                            key={m.userId}
                            className="flex items-center justify-between border border-white/10 bg-black/45 px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className="inline-block h-3.5 w-3.5 border border-white/30"
                                style={{ backgroundColor: m.paintHex || '#38bdf8' }}
                              />
                              <div>
                                <div className="flex items-center gap-1.5 font-semibold text-white">
                                  {onViewPlayerProfile ? (
                                    <button
                                      type="button"
                                      onClick={() => onViewPlayerProfile(m.username)}
                                      className="hover:text-sky-300 underline decoration-white/25 cursor-pointer"
                                    >
                                      @{m.username}
                                    </button>
                                  ) : (
                                    <span>@{m.username}</span>
                                  )}
                                  {m.isHost && <Crown className="h-3 w-3 text-amber-400" />}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {GARAGE_CARS.find((c) => c.id === m.carId)?.name ?? m.carId}
                                </div>
                              </div>
                            </div>
                            <span
                              className={`font-mono-tabular text-[10px] font-bold uppercase ${
                                m.ready ? 'text-emerald-400' : 'text-slate-400'
                              }`}
                            >
                              {m.ready ? 'READY' : 'WAIT'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Quick Invite Friends */}
                    {friendsData.friends.length > 0 && (
                      <div className="border-t border-white/10 pt-3">
                        <div className="mb-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                          Invite Online Friends
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {friendsData.friends.map((f) => (
                            <button
                              key={f.userId}
                              type="button"
                              disabled={f.status === 'offline'}
                              onClick={() => multiplayerClient.inviteFriend(f.userId)}
                              className={`h-9 sm:h-auto border px-3 py-1 text-xs ${
                                f.status === 'offline'
                                  ? 'border-white/8 bg-black/30 text-slate-500'
                                  : 'border-sky-400/40 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20'
                              }`}
                            >
                              Invite @{f.username}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Party Chat */}
                  <div className="flex h-[320px] sm:h-[420px] flex-col border border-white/12 bg-black/45">
                    <div className="border-b border-white/10 px-3.5 py-2.5 text-xs font-bold tracking-wider text-slate-300 uppercase">
                      Party Comms &amp; Event Feed
                    </div>
                    <div className="flex-1 space-y-2 overflow-y-auto p-3 text-xs">
                      {activeParty.chat.map((msg) => (
                        <div
                          key={msg.id}
                          className={msg.isSystem ? 'text-[11px] text-amber-300/90' : 'text-slate-200'}
                        >
                          <span className="font-semibold text-sky-300">{msg.username}: </span>
                          <span>{msg.text}</span>
                        </div>
                      ))}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!chatDraft.trim()) return;
                        multiplayerClient.sendChat(chatDraft);
                        setChatDraft('');
                      }}
                      className="flex border-t border-white/10 bg-black/60"
                    >
                      <input
                        type="text"
                        value={chatDraft}
                        onChange={(e) => setChatDraft(e.target.value)}
                        placeholder="Send party chat..."
                        className="flex-1 bg-transparent px-3 py-2.5 sm:py-2 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="min-w-[44px] flex items-center justify-center border-l border-white/10 px-3.5 text-sky-400 hover:bg-sky-500/15"
                        aria-label="Send chat"
                      >
                        <Send className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                      </button>
                    </form>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_1.3fr]">
                  {/* Create Party Form */}
                  <div className="space-y-3 border border-white/12 bg-black/45 p-3.5 sm:p-4">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-2.5">
                      <Plus className="h-4 w-4 text-sky-400" />
                      <h3 className="font-display text-sm font-bold tracking-wider text-white uppercase">
                        Host New Party / Server
                      </h3>
                    </div>

                    <div>
                      <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                        Room Name
                      </label>
                      <input
                        type="text"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        placeholder={user ? `${user.username}'s GT Lobby` : 'GT3 Open Trackday'}
                        className="w-full border border-white/15 bg-black/65 px-3 py-2.5 sm:py-2 text-base sm:text-xs text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                          Visibility
                        </label>
                        <select
                          value={roomVisibility}
                          onChange={(e) => setRoomVisibility(e.target.value as PartyVisibility)}
                          className="h-10 sm:h-auto w-full border border-white/15 bg-black/65 px-2.5 py-2 text-sm sm:text-xs text-white"
                        >
                          <option value="public">Public Server</option>
                          <option value="friends">Friends Only</option>
                          <option value="private">Private (Code Only)</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                          Mode
                        </label>
                        <select
                          value={roomActivity}
                          onChange={(e) => setRoomActivity(e.target.value as PartyActivityMode)}
                          className="h-10 sm:h-auto w-full border border-white/15 bg-black/65 px-2.5 py-2 text-sm sm:text-xs text-white"
                        >
                          <option value="race">Multiplayer Race</option>
                          <option value="tandem_drift">Tandem Drift Battle</option>
                          <option value="explore">Free-Roam Explore</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                          Car Collisions
                        </label>
                        <select
                          value={roomCollision}
                          onChange={(e) => setRoomCollision(e.target.value as PartyCollisionMode)}
                          className="h-10 sm:h-auto w-full border border-white/15 bg-black/65 px-2.5 py-2 text-sm sm:text-xs text-white"
                        >
                          <option value="race_only">Race Only (Ghost Explore)</option>
                          <option value="collide">Collisions Always On</option>
                          <option value="ghost">Always Ghost Cars</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                          Weather
                        </label>
                        <select
                          value={roomWeather}
                          onChange={(e) => setRoomWeather(e.target.value as WeatherPresetId)}
                          className="h-10 sm:h-auto w-full border border-white/15 bg-black/65 px-2.5 py-2 text-sm sm:text-xs text-white"
                        >
                          {WEATHER_LABELS.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                          Official Track
                        </label>
                        <select
                          value={roomMapId}
                          onChange={(e) => {
                            setRoomMapId(e.target.value);
                            setRoomCustomMapId('');
                          }}
                          className="h-10 sm:h-auto w-full border border-white/15 bg-black/65 px-2.5 py-2 text-sm sm:text-xs text-white"
                        >
                          {MAP_LIST.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] text-slate-400 uppercase">
                          Or Custom Map
                        </label>
                        <select
                          value={roomCustomMapId}
                          onChange={(e) => setRoomCustomMapId(e.target.value)}
                          className="h-10 sm:h-auto w-full border border-white/15 bg-black/65 px-2.5 py-2 text-sm sm:text-xs text-white"
                        >
                          <option value="">Use Official Track</option>
                          {customMapOptions.map((cm) => (
                            <option key={cm.id} value={cm.id}>
                              {cm.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {roomActivity === 'race' && (
                      <div>
                        <label className="mb-1 flex items-center justify-between text-[10px] text-slate-400 uppercase">
                          <span>Race Laps: {roomLaps}</span>
                          <span className="font-mono-tabular text-sky-400">?laps={roomLaps}</span>
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {[1, 3, 5, 10, 20, 50].map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => {
                                setRoomLaps(val);
                                onSyncUrlLaps?.(val);
                              }}
                              className={`h-8 border px-2.5 font-mono-tabular text-[11px] font-semibold ${
                                roomLaps === val
                                  ? 'border-sky-400 bg-sky-500 text-slate-950'
                                  : 'border-white/15 bg-black/60 text-slate-200 hover:border-white/30'
                              }`}
                            >
                              {val}L
                            </button>
                          ))}
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={roomLaps}
                            aria-label="Custom race lap count"
                            onChange={(e) => {
                              const raw = parseInt(e.target.value, 10);
                              if (!Number.isFinite(raw)) return;
                              const clamped = Math.max(1, Math.min(999, raw));
                              setRoomLaps(clamped);
                              onSyncUrlLaps?.(clamped);
                            }}
                            className="h-8 w-16 border border-white/20 bg-black/75 px-2 text-center font-mono-tabular text-xs font-bold text-amber-300 focus:border-sky-400 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleCreateParty}
                      className="w-full min-h-[44px] bg-sky-500 py-2.5 font-display text-xs font-bold tracking-wider text-slate-950 uppercase hover:bg-sky-400"
                    >
                      Create &amp; Open Party Room
                    </button>
                  </div>

                  {/* Live Server Browser + Join by Code */}
                  <div className="space-y-3 border border-white/12 bg-black/45 p-3.5 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                      <h3 className="font-display text-sm font-bold tracking-wider text-white uppercase">
                        Live Party Servers ({partyListLocal.length})
                      </h3>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                          placeholder="ROOM CODE"
                          maxLength={6}
                          className="h-10 sm:h-auto w-32 border border-white/15 bg-black/70 px-2.5 py-1 font-mono-tabular text-base sm:text-xs text-white uppercase placeholder-slate-500 focus:border-sky-400 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleJoinByCode}
                          className="h-10 sm:h-auto border border-sky-400/50 bg-sky-500/15 px-3 py-1 font-display text-xs font-bold text-sky-200 uppercase hover:bg-sky-500/25 whitespace-nowrap shrink-0"
                        >
                          Join
                        </button>
                        <button
                          type="button"
                          onClick={() => void refreshParties()}
                          className="flex h-10 w-10 sm:h-auto sm:w-auto items-center justify-center border border-white/15 bg-white/5 p-1.5 text-slate-300 hover:text-white shrink-0"
                          title="Refresh Parties"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {partyListLocal.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400">
                        No public or friend party servers active yet. Create a room on the left to open a server.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {partyListLocal.map((room) => (
                          <div
                            key={room.id}
                            className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-black/55 px-3.5 py-2.5"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-display text-sm font-bold text-white">
                                  {room.name}
                                </span>
                                <span className="border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono-tabular text-[10px] text-sky-300">
                                  {room.code}
                                </span>
                                <span className="text-[10px] font-bold text-amber-300 uppercase">
                                  {room.activityMode}
                                </span>
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                Host @{room.hostUsername} ·{' '}
                                {room.customMapTitle ||
                                  MAP_LIST.find((m) => m.id === room.mapId)?.name ||
                                  room.mapId}{' '}
                                · {room.weatherPreset.replace('_', ' ')} ·{' '}
                                {room.collisionMode === 'ghost' ? 'Ghost' : 'Contact'}
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="font-mono-tabular text-xs text-slate-300">
                                {room.memberCount}/{room.maxMembers}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  if (!user) {
                                    onRequireAuth();
                                    return;
                                  }
                                  multiplayerClient.joinParty({
                                    roomId: room.id,
                                    carId: selectedCarId,
                                    paintHex: selectedPaintHex,
                                  });
                                }}
                                className="h-10 sm:h-auto bg-sky-500 px-3.5 py-1.5 font-display text-xs font-bold tracking-wider text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap shrink-0"
                              >
                                Join
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ TAB 2: EXPLORE COMMUNITY MAPS ═══════════════ */}
          {tab === 'explore' && (
            <div className="space-y-4">
              <div className="space-y-2.5 border border-white/10 bg-black/45 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-1 items-center border border-white/15 bg-black/65 px-3 min-w-[200px]">
                    <Search className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      value={exploreQuery}
                      onChange={(e) => setExploreQuery(e.target.value)}
                      placeholder="Search custom tracks by title, creator, or style..."
                      className="w-full bg-transparent py-2.5 sm:py-2 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(['top', 'popular', 'newest'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setExploreMineOnly(false);
                          setExploreSort(s);
                        }}
                        className={`h-10 sm:h-auto border px-3 py-1.5 font-display text-xs font-bold uppercase whitespace-nowrap shrink-0 ${
                          !exploreMineOnly && exploreSort === s
                            ? 'border-sky-400 bg-sky-500 text-slate-950'
                            : 'border-white/12 bg-white/5 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        {s === 'top' ? 'Top Rated' : s === 'popular' ? 'Most Played' : 'Newest'}
                      </button>
                    ))}
                    {user && (
                      <button
                        type="button"
                        onClick={() => setExploreMineOnly((prev) => !prev)}
                        className={`h-10 sm:h-auto border px-3 py-1.5 font-display text-xs font-bold uppercase whitespace-nowrap shrink-0 ${
                          exploreMineOnly
                            ? 'border-amber-400 bg-amber-500 text-slate-950'
                            : 'border-white/12 bg-white/5 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        My Maps ({myMaps.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Map Type & Difficulty Filter Strip */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-[11px]">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-1">
                    <span className="mr-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      Type:
                    </span>
                    {(['all', 'circuit', 'sprint', 'drift', 'stunt'] as const).map((mt) => (
                      <button
                        key={mt}
                        type="button"
                        onClick={() => setExploreMapType(mt)}
                        className={`min-h-[34px] sm:min-h-0 border px-2.5 sm:px-2 py-1 sm:py-0.5 font-display text-[10px] font-bold uppercase ${
                          exploreMapType === mt
                            ? 'border-sky-400 bg-sky-500/25 text-sky-200'
                            : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {mt}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-1">
                    <span className="mr-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      Difficulty:
                    </span>
                    {(['all', 'easy', 'medium', 'hard', 'extreme'] as const).map((diff) => (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setExploreDifficulty(diff)}
                        className={`min-h-[34px] sm:min-h-0 border px-2.5 sm:px-2 py-1 sm:py-0.5 font-display text-[10px] font-bold uppercase ${
                          exploreDifficulty === diff
                            ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                            : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {exploreLoading ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Loading community circuits...
                </div>
              ) : displayedExploreMaps.length === 0 ? (
                <div className="border border-white/10 bg-black/40 py-12 text-center text-xs text-slate-400">
                  No custom circuits found yet. Open the Map Builder Studio to sculpt and publish the first track!
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
                  {displayedExploreMaps.map((bp) => {
                    const isOwner = Boolean(user && bp.authorId === user.id);
                    return (
                      <div
                        key={bp.id}
                        className="flex flex-col justify-between border border-white/12 bg-black/50 p-4"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="font-display text-sm font-bold text-white uppercase">
                                {bp.title}
                              </h4>
                              <div className="text-[11px] text-sky-300">
                                by{' '}
                                {onViewPlayerProfile ? (
                                  <button
                                    type="button"
                                    onClick={() => onViewPlayerProfile(bp.authorUsername)}
                                    className="hover:text-white underline decoration-sky-400/40 cursor-pointer"
                                  >
                                    @{bp.authorUsername}
                                  </button>
                                ) : (
                                  `@${bp.authorUsername}`
                                )}
                                {!bp.isPublished && (
                                  <span className="ml-2 text-amber-300">· DRAFT</span>
                                )}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!user) {
                                  onRequireAuth();
                                  return;
                                }
                                const res = await toggleLikeCustomMap(bp.id);
                                setExploreMaps((prev) =>
                                  prev.map((m) =>
                                    m.id === bp.id
                                      ? { ...m, likedByMe: res.liked, likesCount: res.likesCount }
                                      : m,
                                  ),
                                );
                              }}
                              className={`inline-flex h-9 sm:h-auto items-center gap-1 border px-2.5 py-1 font-mono-tabular text-[11px] shrink-0 ${
                                bp.likedByMe
                                  ? 'border-rose-400/60 bg-rose-500/20 text-rose-300'
                                  : 'border-white/12 bg-white/5 text-slate-300 hover:border-white/30'
                              }`}
                            >
                              <Heart className={`h-3 w-3 ${bp.likedByMe ? 'fill-current' : ''}`} />
                              <span>{bp.likesCount}</span>
                            </button>
                          </div>

                          <p className="mt-2 line-clamp-2 text-xs text-slate-400">
                            {bp.description || 'Custom driver-built track'}
                          </p>

                          <div className="font-mono-tabular mt-3 flex flex-wrap gap-1.5 text-[10px] text-slate-300">
                            <span className="border border-sky-400/35 bg-sky-500/15 px-2 py-0.5 font-bold text-sky-200 uppercase">
                              {bp.mapType ?? (bp.closedLoop ? 'circuit' : 'sprint')}
                            </span>
                            <span className="border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 font-bold text-amber-200 uppercase">
                              {bp.difficulty ?? 'medium'}
                            </span>
                            <span className="border border-white/10 bg-white/5 px-2 py-0.5">
                              {bp.controlPoints.length} PTS
                            </span>
                            <span className="border border-white/10 bg-white/5 px-2 py-0.5">
                              {bp.placedProps.length} PROPS
                            </span>
                            <span className="border border-white/10 bg-white/5 px-2 py-0.5">
                              {bp.playsCount} PLAYS
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3">
                          <button
                            type="button"
                            onClick={() => onPlayCustomMapSolo(bp)}
                            className="inline-flex h-10 sm:h-auto flex-1 items-center justify-center gap-1 bg-sky-500 px-2.5 py-1.5 font-display text-[11px] font-bold tracking-wider text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap"
                          >
                            <Play className="h-3 w-3 fill-current" />
                            <span>Drive</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleHostMapParty(bp)}
                            className="inline-flex h-10 sm:h-auto items-center gap-1 border border-emerald-400/45 bg-emerald-500/15 px-2.5 py-1.5 font-display text-[11px] font-bold text-emerald-200 uppercase hover:bg-emerald-500/25 whitespace-nowrap shrink-0"
                          >
                            <Users className="h-3 w-3" />
                            <span>Host</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onEditCustomMap(bp)}
                            className="inline-flex h-10 sm:h-auto items-center gap-1 border border-amber-400/45 bg-amber-500/12 px-2.5 py-1.5 font-display text-[11px] font-bold text-amber-200 uppercase hover:bg-amber-500/22 whitespace-nowrap shrink-0"
                            title={isOwner ? 'Edit in Studio' : 'Remix Copy in Studio'}
                          >
                            <Wrench className="h-3 w-3" />
                            <span>{isOwner ? 'Edit' : 'Remix'}</span>
                          </button>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteCustomMapById(bp.id);
                                void loadExplore();
                              }}
                              className="flex h-10 w-10 sm:h-auto sm:w-auto items-center justify-center border border-rose-500/45 bg-rose-500/15 p-1.5 text-rose-300 hover:bg-rose-500/25 shrink-0"
                              title="Delete Map"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ TAB 3: GLOBAL & FRIENDS LEADERBOARDS ═══════════════ */}
          {tab === 'leaderboards' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2.5 border border-white/10 bg-black/45 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setLbScope('global')}
                    className={`h-10 sm:h-auto border px-3 py-1.5 font-display text-xs font-bold uppercase whitespace-nowrap shrink-0 ${
                      lbScope === 'global'
                        ? 'border-sky-400 bg-sky-500 text-slate-950'
                        : 'border-white/12 bg-white/5 text-slate-300'
                    }`}
                  >
                    Global Rankings
                  </button>
                  <button
                    type="button"
                    onClick={() => setLbScope('friends')}
                    className={`h-10 sm:h-auto border px-3 py-1.5 font-display text-xs font-bold uppercase whitespace-nowrap shrink-0 ${
                      lbScope === 'friends'
                        ? 'border-sky-400 bg-sky-500 text-slate-950'
                        : 'border-white/12 bg-white/5 text-slate-300'
                    }`}
                  >
                    Friends Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setLbMode('time_trial')}
                    className={`inline-flex h-10 sm:h-auto items-center gap-1 border px-3 py-1.5 font-display text-xs font-bold uppercase whitespace-nowrap shrink-0 ${
                      lbMode === 'time_trial'
                        ? 'border-amber-400 bg-amber-500 text-slate-950'
                        : 'border-white/12 bg-white/5 text-slate-300'
                    }`}
                  >
                    <Trophy className="h-3 w-3" />
                    <span>Best Lap</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLbMode('drift')}
                    className={`inline-flex h-10 sm:h-auto items-center gap-1 border px-3 py-1.5 font-display text-xs font-bold uppercase whitespace-nowrap shrink-0 ${
                      lbMode === 'drift'
                        ? 'border-amber-400 bg-amber-500 text-slate-950'
                        : 'border-white/12 bg-white/5 text-slate-300'
                    }`}
                  >
                    <Flame className="h-3 w-3" />
                    <span>Drift Score</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
                  <select
                    value={lbMapId}
                    onChange={(e) => setLbMapId(e.target.value)}
                    className="h-10 sm:h-auto w-full sm:w-auto border border-white/15 bg-black/70 px-2.5 py-1.5 text-sm sm:text-xs text-white"
                  >
                    <option value="all">All Circuits</option>
                    {MAP_LIST.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={lbCarId}
                    onChange={(e) => setLbCarId(e.target.value)}
                    className="h-10 sm:h-auto w-full sm:w-auto border border-white/15 bg-black/70 px-2.5 py-1.5 text-sm sm:text-xs text-white"
                  >
                    <option value="all">All Cars</option>
                    {GARAGE_CARS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {lbScope === 'friends' && !user ? (
                <div className="border border-white/10 bg-black/40 py-10 text-center text-xs text-slate-400">
                  Sign in to view your Friends Leaderboard.
                </div>
              ) : lbLoading ? (
                <div className="py-10 text-center text-xs text-slate-400">Loading leaderboard...</div>
              ) : lbEntries.length === 0 ? (
                <div className="border border-white/10 bg-black/40 py-10 text-center text-xs text-slate-400">
                  No records posted for this filter yet. Complete a clean lap or drift run while signed in!
                </div>
              ) : (
                <div className="overflow-x-auto border border-white/12 bg-black/50">
                  <table className="w-full min-w-[600px] text-left text-xs">
                    <thead className="border-b border-white/12 bg-black/60 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      <tr>
                        <th className="px-3.5 py-2.5">Rank</th>
                        <th className="px-3.5 py-2.5">Driver</th>
                        <th className="px-3.5 py-2.5">Circuit</th>
                        <th className="px-3.5 py-2.5">Vehicle</th>
                        <th className="px-3.5 py-2.5">Weather</th>
                        <th className="px-3.5 py-2.5 text-right">
                          {lbMode === 'drift' ? 'Drift Pts' : 'Best Lap'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/8">
                      {lbEntries.map((row, idx) => (
                        <tr
                          key={row.id}
                          className={
                            user && row.userId === user.id ? 'bg-sky-500/12' : 'hover:bg-white/[0.03]'
                          }
                        >
                          <td className="font-mono-tabular px-3.5 py-2.5 font-bold text-amber-300">
                            #{idx + 1}
                          </td>
                          <td className="px-3.5 py-2.5 font-semibold text-white">
                            {onViewPlayerProfile ? (
                              <button
                                type="button"
                                onClick={() => onViewPlayerProfile(row.username)}
                                className="hover:text-sky-300 underline decoration-white/25 cursor-pointer"
                              >
                                @{row.username}
                              </button>
                            ) : (
                              `@${row.username}`
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-300">{row.mapName}</td>
                          <td className="px-3.5 py-2.5 text-slate-300">
                            {GARAGE_CARS.find((c) => c.id === row.carId)?.name ?? row.carId}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-400 uppercase">
                            {row.weatherPreset.replace('_', ' ')}
                          </td>
                          <td className="font-mono-tabular px-3.5 py-2.5 text-right font-bold text-emerald-300">
                            {lbMode === 'drift'
                              ? row.driftScore.toLocaleString()
                              : formatLapMs(row.bestLapMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ TAB 4: FRIENDS & FRIEND RACE ═══════════════ */}
          {tab === 'friends' && (
            <div className="space-y-4">
              {!user ? (
                <div className="flex flex-col items-center justify-center gap-3 border border-white/10 bg-black/45 px-4 py-12 text-center">
                  <p className="text-xs text-slate-300">
                    Sign in to add friends, join their party rooms, and launch 1-click Friend Races.
                  </p>
                  <button
                    type="button"
                    onClick={onRequireAuth}
                    className="h-11 sm:h-auto bg-sky-500 px-4 py-2 font-display text-xs font-bold text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap shrink-0"
                  >
                    Sign In / Create Account
                  </button>
                </div>
              ) : (
                <>
                  {/* Add Friend Bar */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setFriendsError(null);
                      setFriendsStatusMsg(null);
                      if (!friendUsernameInput.trim()) return;
                      try {
                        await sendFriendRequestByUsername(friendUsernameInput.trim());
                        setFriendUsernameInput('');
                        setFriendsStatusMsg('Friend request sent!');
                        await loadFriends();
                      } catch (err) {
                        setFriendsError(
                          err instanceof Error ? err.message : 'Failed to send request.',
                        );
                      }
                    }}
                    className="flex flex-wrap items-center gap-2 border border-white/12 bg-black/45 p-3"
                  >
                    <input
                      type="text"
                      value={friendUsernameInput}
                      onChange={(e) => setFriendUsernameInput(e.target.value)}
                      placeholder="Add friend by exact username..."
                      className="min-w-[200px] flex-1 border border-white/15 bg-black/70 px-3 py-2.5 sm:py-2 text-base sm:text-xs text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-10 sm:h-auto w-full sm:w-auto items-center justify-center gap-1.5 bg-sky-500 px-4 py-2 font-display text-xs font-bold tracking-wider text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap shrink-0"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Send Request</span>
                    </button>
                  </form>

                  {friendsError && (
                    <div className="border border-rose-500/50 bg-rose-500/15 px-3 py-2 text-xs text-rose-200">
                      {friendsError}
                    </div>
                  )}
                  {friendsStatusMsg && (
                    <div className="border border-emerald-500/50 bg-emerald-500/15 px-3 py-2 text-xs text-emerald-200">
                      {friendsStatusMsg}
                    </div>
                  )}

                  {/* Pending Requests */}
                  {friendsData.requests.length > 0 && (
                    <div className="space-y-2 border border-white/12 bg-black/45 p-3.5">
                      <h4 className="font-display text-xs font-bold tracking-wider text-amber-300 uppercase">
                        Pending Friend Requests ({friendsData.requests.length})
                      </h4>
                      {friendsData.requests.map((req) => (
                        <div
                          key={req.id}
                          className="flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-black/50 px-3 py-2 text-xs"
                        >
                          <span>
                            {req.direction === 'incoming'
                              ? `Incoming from @${req.fromUsername}`
                              : `Sent to @${req.toUsername}`}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {req.direction === 'incoming' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await respondToFriendRequest(req.id, 'accept');
                                    await loadFriends();
                                  }}
                                  className="h-9 sm:h-auto bg-emerald-500 px-3 py-1 font-display text-[11px] font-bold text-slate-950 uppercase whitespace-nowrap shrink-0"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await respondToFriendRequest(req.id, 'decline');
                                    await loadFriends();
                                  }}
                                  className="h-9 sm:h-auto border border-white/15 bg-white/5 px-3 py-1 font-display text-[11px] font-bold text-slate-300 uppercase whitespace-nowrap shrink-0"
                                >
                                  Decline
                                </button>
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-400 uppercase">Pending</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Friends List */}
                  <div className="space-y-2 border border-white/12 bg-black/45 p-3.5">
                    <h4 className="font-display text-xs font-bold tracking-wider text-slate-300 uppercase">
                      Friends ({friendsData.friends.length})
                    </h4>
                    {friendsData.friends.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">
                        No friends added yet. Search a driver username above to connect and race together!
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                        {friendsData.friends.map((f) => (
                          <div
                            key={f.userId}
                            className="flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-black/55 px-3.5 py-2.5 text-xs"
                          >
                            <div>
                              <div className="font-display text-sm font-bold text-white">
                                {onViewPlayerProfile ? (
                                  <button
                                    type="button"
                                    onClick={() => onViewPlayerProfile(f.username)}
                                    className="hover:text-sky-300 underline decoration-white/25 cursor-pointer"
                                  >
                                    @{f.username}
                                  </button>
                                ) : (
                                  `@${f.username}`
                                )}
                              </div>
                              <div
                                className={`text-[11px] ${
                                  f.status === 'in_party'
                                    ? 'text-sky-300'
                                    : f.status === 'online'
                                    ? 'text-emerald-300'
                                    : 'text-slate-500'
                                }`}
                              >
                                {f.status === 'in_party'
                                  ? `In Party · ${f.partyName || f.partyCode}`
                                  : f.status === 'online'
                                  ? 'Online in Hangar'
                                  : 'Offline'}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {f.partyCode && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    multiplayerClient.joinParty({
                                      code: f.partyCode!,
                                      carId: selectedCarId,
                                      paintHex: selectedPaintHex,
                                    });
                                    setTab('parties');
                                  }}
                                  className="h-9 sm:h-auto bg-sky-500 px-3 py-1 font-display text-[11px] font-bold text-slate-950 uppercase whitespace-nowrap shrink-0"
                                >
                                  Join Party
                                </button>
                              )}
                              {activeParty && f.status !== 'offline' && (
                                <button
                                  type="button"
                                  onClick={() => multiplayerClient.inviteFriend(f.userId)}
                                  className="h-9 sm:h-auto border border-sky-400/50 bg-sky-500/15 px-3 py-1 font-display text-[11px] font-bold text-sky-200 uppercase whitespace-nowrap shrink-0"
                                >
                                  Invite
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleStartFriendRace(f.userId, f.username)}
                                className="h-9 sm:h-auto border border-amber-400/50 bg-amber-500/15 px-3 py-1 font-display text-[11px] font-bold text-amber-200 uppercase hover:bg-amber-500/25 whitespace-nowrap shrink-0"
                                title="Send real-time Race Invitation (pops up even during free-roam)"
                              >
                                Challenge Race
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await removeFriendById(f.userId);
                                  await loadFriends();
                                }}
                                className="flex h-9 w-9 sm:h-auto sm:w-auto items-center justify-center border border-white/12 bg-white/5 p-1 text-slate-400 hover:text-rose-300 shrink-0"
                                title="Remove Friend"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
