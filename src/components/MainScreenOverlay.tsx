import {
  Activity,
  AlertTriangle,
  Aperture,
  Award,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Film,
  Flag,
  Flame,
  FlaskConical,
  Gauge,
  Globe,
  Hammer,
  LayoutGrid,
  Lock,
  Play,
  Settings,
  Sliders,
  Timer,
  Trophy,
  User,
  UserPlus,
  Users,
  Wrench,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { GARAGE_CARS, formatLapMs, type GarageCarSlot } from '../data/garageCars';
import {
  type CarSetupConfig,
  type CarVisualCustomization,
  CircuitMetrics,
  GameMode,
  GarageCameraPreset,
  getFullCarSpecSheet,
  MAP_REGISTRY,
  MapId,
  RaceConfig,
  RaceDifficulty,
  resolveStintEconomics,
  StartCountdownMode,
  StintStrategyPreset,
  VEHICLE_SPECS,
} from '../engine/SceneController';
import type {
  AuthUser,
  CustomMapBlueprint,
  PartyRoomState,
} from '../shared/socialTypes';
import type { DeviceExperienceProfile } from '../utils/deviceExperience';
import type { MobileSteerMode, MobileVisibilityMode } from './MobileControlsOverlay';
import type { SocialHubTab } from './SocialHubModal';

export { GARAGE_CARS, formatLapMs, type GarageCarSlot };

const GAME_MODE_DEFS: Array<{
  id: GameMode;
  title: string;
  subtitle: string;
  defaultLaps: number;
  allowUnlimited: boolean;
}> = [
  {
    id: 'time_trial',
    title: 'Time Trial',
    subtitle: 'Solo hotlap with live fuel burn, tire wear & Pit Lane strategy',
    defaultLaps: 0,
    allowUnlimited: true,
  },
  {
    id: 'sprint',
    title: 'AI Sprint',
    subtitle: '4-car mixed GT grid race with full fuel, tire & Pit Lane service',
    defaultLaps: 3,
    allowUnlimited: false,
  },
  {
    id: 'endurance',
    title: 'Endurance',
    subtitle: '2.25x tire wear, thermal degradation & mandatory Pit Lane stops',
    defaultLaps: 5,
    allowUnlimited: false,
  },
  {
    id: 'drift',
    title: 'Drift Attack',
    subtitle: 'Score slip-angle chains up to x4 multiplier · Pit Lane service',
    defaultLaps: 3,
    allowUnlimited: true,
  },
];

const DIFFICULTY_OPTIONS: Array<{ id: RaceDifficulty; label: string; desc: string }> = [
  { id: 'novice', label: 'Novice', desc: 'Clean pace · Forgiving gaps' },
  { id: 'pro', label: 'Pro', desc: 'Slipstream & corner apex battle' },
  { id: 'elite', label: 'Elite', desc: 'Aggressive passes & late braking' },
];

const COUNTDOWN_OPTIONS: Array<{ id: StartCountdownMode; label: string; desc: string }> = [
  { id: 'full', label: 'Full 3-2-1', desc: 'Classic 3s GT grid lights' },
  { id: 'quick', label: 'Quick 1s', desc: 'Fast 1-second rolling launch' },
  { id: 'instant', label: 'Instant', desc: 'Zero countdown delay' },
];

const LAP_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: '1 Lap' },
  { value: 3, label: '3 Laps' },
  { value: 5, label: '5 Laps' },
  { value: 10, label: '10 Laps' },
  { value: 20, label: '20 Laps' },
  { value: 60, label: '60 Laps' },
  { value: 0, label: 'Unlimited' },
];

const STINT_PRESETS: Array<{
  id: StintStrategyPreset;
  label: string;
  laps: number;
  stints: number;
  desc: string;
}> = [
  { id: 'sprint', label: 'Sprint (Default)', laps: 20, stints: 2, desc: '20 Laps · 1 Stop (~10L/stint)' },
  { id: 'endurance', label: 'Endurance', laps: 60, stints: 12, desc: '60 Laps · 11 Stops (~5L/stint)' },
  { id: 'realistic', label: 'Realistic', laps: 20, stints: 1, desc: '20 Laps · 0 Stops (Full Stint)' },
];

const CAMERA_ANGLE_PRESETS: Array<{ id: GarageCameraPreset; label: string }> = [
  { id: 'hero', label: 'Hero 3/4' },
  { id: 'front', label: 'Front' },
  { id: 'profile', label: 'Side' },
  { id: 'rear', label: 'Rear Wing' },
  { id: 'cockpit', label: 'Canopy' },
];

const ALL_CONTROLS: Array<{ keys: string; action: string }> = [
  { keys: 'W / ↑', action: 'Accelerate' },
  { keys: 'S / ↓', action: 'Brake / Reverse' },
  { keys: 'A D / ← →', action: 'Steer Left / Right' },
  { keys: 'SPACE', action: 'Handbrake / Skip Grid Intro' },
  { keys: 'E / Q', action: 'Shift Up / Down (Manual)' },
  { keys: '1 / 2', action: 'Brake Bias - / + (Cockpit MFD)' },
  { keys: '3 / 4', action: 'Cycle TCS (0-5) / ABS (0-3)' },
  { keys: '5 / 6', action: 'Cycle Engine Map / Diff Preload' },
  { keys: 'C', action: 'Cycle Driving Camera' },
  { keys: 'RMB Drag', action: 'Look Around (Inside Car)' },
  { keys: 'B', action: 'Look Back' },
  { keys: 'R', action: 'Reset Car to Track' },
  { keys: 'X', action: 'Toggle Active Aero (Downforce / DRS)' },
  { keys: 'L', action: 'Toggle Headlights' },
  { keys: 'M', action: 'Toggle Minimap (Overview / Ahead)' },
  { keys: 'P', action: 'Photography Mode (Free Walk / Inside Car)' },
  { keys: 'H', action: 'Hide / Show HUD' },
  { keys: 'Gamepad', action: 'Analog Steer, Triggers & L1/R1 Shift' },
  { keys: 'ESC', action: 'Pause & Settings' },
];

type GarageTab = 'showroom' | 'events' | 'controls';

interface MainScreenOverlayProps {
  activeMapId: MapId;
  metrics: CircuitMetrics;
  carIndex: number;
  carLoadPct: number;
  carReady: boolean;
  bestLapMs: number | null;
  weatherLabel: string;
  phaseLabel: string;
  raceConfig: RaceConfig;
  carSetup?: CarSetupConfig;
  visualConfig?: CarVisualCustomization;
  garageCamPreset: GarageCameraPreset;
  liveSpecs?: {
    powerLabel: string;
    torqueLabel: string;
    weightLabel: string;
    ppLabel: string;
    bracketLabel: string;
  };
  legalityBlockedReason?: string | null;
  legalityWarning?: string | null;
  testModeEnabled?: boolean;
  user?: AuthUser | null;
  creditsCr?: number;
  activeParty?: PartyRoomState | null;
  livePartyCount?: number;
  activeCustomBlueprint?: CustomMapBlueprint | null;
  onCycleCar: (delta: number) => void;
  onOpenCarSelect: () => void;
  onRaceConfigChange: (config: RaceConfig) => void;
  onGarageCamPresetChange: (preset: GarageCameraPreset) => void;
  onStartRace: () => void;
  onOpenCustomMap: () => void;
  onOpenMapBuilder: () => void;
  onClearCustomBlueprint?: () => void;
  onOpenAuth: () => void;
  onOpenProfile?: () => void;
  onOpenSocialHub: (tab: SocialHubTab) => void;
  onOpenTuning: () => void;
  onOpenAnalytics?: () => void;
  onOpenEngLab: () => void;
  onOpenPhotoMode?: () => void;
  hasReplay?: boolean;
  onWatchReplay?: () => void;
  onOpenSettings: () => void;
  onActiveTabChange?: (tab: GarageTab) => void;
  mobileVisibility?: MobileVisibilityMode;
  mobileSteerMode?: MobileSteerMode;
  mobileSteerSensitivity?: number;
  mobileAutoGas?: boolean;
  onMobileVisibilityChange?: (vis: MobileVisibilityMode) => void;
  onMobileSteerModeChange?: (mode: MobileSteerMode) => void;
  onMobileSteerSensitivityChange?: (sensitivity: number) => void;
  onMobileAutoGasChange?: (enabled: boolean) => void;
  deviceProfile?: DeviceExperienceProfile;
}

export function MainScreenOverlay({
  activeMapId,
  metrics,
  carIndex,
  carLoadPct,
  carReady,
  bestLapMs,
  weatherLabel,
  phaseLabel,
  raceConfig,
  carSetup,
  visualConfig,
  garageCamPreset,
  liveSpecs,
  legalityBlockedReason,
  legalityWarning,
  testModeEnabled = false,
  user = null,
  creditsCr = 35000,
  activeParty = null,
  livePartyCount = 0,
  activeCustomBlueprint = null,
  onCycleCar,
  onOpenCarSelect,
  onRaceConfigChange,
  onGarageCamPresetChange,
  onStartRace,
  onOpenCustomMap,
  onOpenMapBuilder,
  onClearCustomBlueprint,
  onOpenAuth,
  onOpenProfile,
  onOpenSocialHub,
  onOpenTuning,
  onOpenAnalytics,
  onOpenEngLab,
  onOpenPhotoMode,
  hasReplay = false,
  onWatchReplay,
  onOpenSettings,
  onActiveTabChange,
  mobileVisibility = 'auto',
  mobileSteerMode = 'arrows',
  mobileSteerSensitivity = 1.0,
  mobileAutoGas = false,
  onMobileVisibilityChange,
  onMobileSteerModeChange,
  onMobileSteerSensitivityChange,
  onMobileAutoGasChange,
  deviceProfile,
}: MainScreenOverlayProps) {
  const isMobileExperience = deviceProfile?.isMobileExperience ?? false;
  const [activeTab, setActiveTabState] = useState<GarageTab>('showroom');
  const setActiveTab = (next: GarageTab) => {
    setActiveTabState(next);
    onActiveTabChange?.(next);
  };
  const [mobileCardExpanded, setMobileCardExpanded] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const activeMapMeta = MAP_REGISTRY[activeMapId];
  const car = GARAGE_CARS[carIndex] ?? GARAGE_CARS[0];
  const activeModeMeta =
    GAME_MODE_DEFS.find((m) => m.id === raceConfig.mode) ?? GAME_MODE_DEFS[0];
  const activeDifficulty: RaceDifficulty = raceConfig.difficulty ?? 'pro';
  const carTankLiters =
    (car.carModelId ? VEHICLE_SPECS[car.carModelId]?.fuelMaxLiters : undefined) ?? 92;
  const stintEcon = resolveStintEconomics(raceConfig, carTankLiters, car.carModelId ?? undefined);
  const specSheet = car.carModelId
    ? getFullCarSpecSheet(car.carModelId, carSetup, visualConfig)
    : null;
  const currentStints = Math.max(1, raceConfig.targetStints ?? stintEcon.targetStints);

  const handleSelectMode = (mode: GameMode) => {
    const def = GAME_MODE_DEFS.find((m) => m.id === mode) ?? GAME_MODE_DEFS[0];
    const nextLaps =
      !def.allowUnlimited && raceConfig.lapCount === 0
        ? 20
        : raceConfig.mode !== mode
        ? mode === 'endurance'
          ? 60
          : mode === 'sprint'
          ? 20
          : def.defaultLaps
        : raceConfig.lapCount;
    const nextStints =
      mode === 'endurance' ? 12 : mode === 'sprint' ? 2 : raceConfig.targetStints ?? 2;
    const nextPreset: StintStrategyPreset | undefined =
      mode === 'endurance' && nextLaps === 60 && nextStints === 12
        ? 'endurance'
        : nextLaps === 20 && nextStints === 1
        ? 'realistic'
        : nextLaps === 20 && nextStints === 2
        ? 'sprint'
        : undefined;
    onRaceConfigChange({
      ...raceConfig,
      mode,
      lapCount: nextLaps,
      difficulty: activeDifficulty,
      targetStints: nextStints,
      strategyPreset: nextPreset,
      startCountdownMode: raceConfig.startCountdownMode ?? 'full',
    });
  };

  const applyStintPreset = (preset: (typeof STINT_PRESETS)[number]) => {
    const nextMode: GameMode =
      preset.id === 'endurance'
        ? 'endurance'
        : raceConfig.mode === 'time_trial' || raceConfig.mode === 'drift'
        ? raceConfig.mode
        : 'sprint';
    onRaceConfigChange({
      ...raceConfig,
      mode: nextMode,
      lapCount: preset.laps,
      targetStints: preset.stints,
      strategyPreset: preset.id,
    });
  };

  const lapSummaryLabel =
    raceConfig.lapCount === 0
      ? 'Unlimited'
      : `${raceConfig.lapCount} ${raceConfig.lapCount === 1 ? 'Lap' : 'Laps'}`;

  const currentCamIdx = Math.max(
    0,
    CAMERA_ANGLE_PRESETS.findIndex((p) => p.id === garageCamPreset),
  );
  const currentCamMeta = CAMERA_ANGLE_PRESETS[currentCamIdx] ?? CAMERA_ANGLE_PRESETS[0];
  const cycleMobileGarageCam = () => {
    const next = CAMERA_ANGLE_PRESETS[(currentCamIdx + 1) % CAMERA_ANGLE_PRESETS.length];
    if (next) onGarageCamPresetChange(next.id);
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 flex h-[100dvh] flex-col justify-between overflow-hidden px-1.5 py-1 landscape-short:px-2 landscape-short:py-1 desktop:p-6"
      style={{
        paddingTop: 'max(0.35rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.45rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.45rem, env(safe-area-inset-right))',
      }}
    >
      {/* GT5 Top Command Bar: 1-row slim bar on mobile landscape, crisp 2-row on portrait, full matrix on desktop */}
      <header className="pointer-events-auto gt5-panel shrink-0 overflow-hidden">
        <div className="gt5-horizon-rule" />
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 landscape-short:gap-2 landscape-short:px-2.5 landscape-short:py-1 desktop:gap-6 desktop:px-4 desktop:py-2.5">
          {/* Zone 1: Brand Lockup, Active Circuit Title & Environment Metadata */}
          <div className="min-w-0 shrink">
            <div className="font-mono-tabular landscape-short:hidden text-[9px] desktop:text-[10px] font-bold tracking-[0.16em] text-sky-400 leading-none mb-0.5 truncate">
              Limit state <span className="text-white">.VYROX</span>
            </div>
            <div className="flex items-center gap-1.5 desktop:gap-2">
              <h1 className="font-display text-xs font-bold tracking-wider text-white uppercase desktop:text-lg leading-tight truncate max-w-[140px] landscape-short:max-w-[110px] desktop:max-w-none">
                <span className="desktop:hidden">
                  {activeCustomBlueprint ? activeCustomBlueprint.title : activeMapMeta.shortName}
                </span>
                <span className="hidden desktop:inline">
                  {activeCustomBlueprint ? activeCustomBlueprint.title : activeMapMeta.name}
                </span>
              </h1>
              {activeCustomBlueprint && onClearCustomBlueprint && (
                <button
                  type="button"
                  onClick={onClearCustomBlueprint}
                  className="border border-amber-400/50 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-200 uppercase hover:bg-amber-500/25 shrink-0"
                >
                  Official
                </button>
              )}
            </div>
            <div className="font-mono-tabular flex landscape-short:hidden desktop:flex items-center gap-1 text-[9.5px] text-slate-400 whitespace-nowrap desktop:gap-1.5 desktop:text-[11px]">
              <span>{metrics.lengthKm}km</span>
              <span className="hidden desktop:inline">·</span>
              <span className="hidden desktop:inline">{metrics.roadWidthM}m Tarmac</span>
              <span>·</span>
              <span className="text-slate-200 truncate max-w-[82px] desktop:max-w-none">{phaseLabel}</span>
              <span className="hidden desktop:inline">·</span>
              <span className="hidden desktop:inline text-sky-300">{weatherLabel}</span>
            </div>
          </div>

          {/* Mobile Landscape Single-Row Middle Strip: Compact Tabs + Scrollable Social Links */}
          <div className="hidden landscape-short:flex desktop:hidden flex-1 min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar">
            <div className="flex items-center border border-white/15 bg-black/60 p-0.5 shrink-0">
              {[
                { id: 'showroom' as const, label: 'Car' },
                { id: 'events' as const, label: 'Race' },
                { id: 'controls' as const, label: 'Controls' },
              ].map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`h-9 px-3 font-display text-[10.5px] font-bold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 ${
                      active ? 'bg-sky-500 text-slate-950' : 'text-slate-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <span className="h-4 w-px bg-white/15 shrink-0" />

            <button
              type="button"
              data-tutorial="tutorial-social-btn"
              onClick={() => onOpenSocialHub('parties')}
              className="inline-flex h-9 items-center gap-1.5 border border-sky-400/45 bg-sky-500/15 px-2.5 font-display text-[10px] font-bold tracking-wider text-sky-200 uppercase whitespace-nowrap shrink-0"
            >
              <Users className="h-3.5 w-3.5 text-sky-400" />
              <span>Parties ({livePartyCount})</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenSocialHub('explore')}
              className="inline-flex h-9 items-center gap-1.5 border border-white/14 bg-white/[0.04] px-2.5 font-display text-[10px] font-bold tracking-wider text-slate-200 uppercase whitespace-nowrap shrink-0"
            >
              <Globe className="h-3.5 w-3.5 text-emerald-400" />
              <span>Explore</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenSocialHub('leaderboards')}
              className="inline-flex h-9 items-center gap-1.5 border border-white/14 bg-white/[0.04] px-2.5 font-display text-[10px] font-bold tracking-wider text-slate-200 uppercase whitespace-nowrap shrink-0"
            >
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <span>Ranks</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenSocialHub('friends')}
              className="inline-flex h-9 items-center gap-1.5 border border-white/14 bg-white/[0.04] px-2.5 font-display text-[10px] font-bold tracking-wider text-slate-200 uppercase whitespace-nowrap shrink-0"
            >
              <UserPlus className="h-3.5 w-3.5 text-sky-300" />
              <span>Friends</span>
            </button>

            {activeParty && (
              <button
                type="button"
                onClick={() => onOpenSocialHub('parties')}
                className="inline-flex h-9 items-center gap-1 border border-emerald-400/60 bg-emerald-500/18 px-2.5 font-mono-tabular text-[10px] font-bold text-emerald-200 uppercase whitespace-nowrap shrink-0"
              >
                <span>Lobby {activeParty.code}</span>
              </button>
            )}
          </div>

          {/* Zone 2: Desktop Primary Showroom Navigation Strip */}
          <nav className="hidden desktop:flex items-center border border-white/12 bg-black/45 p-0.5 shrink-0">
            {[
              { id: 'showroom' as const, label: 'Showroom' },
              { id: 'events' as const, label: 'Race Setup' },
              { id: 'controls' as const, label: 'Controls' },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-tutorial={tab.id === 'events' ? 'tutorial-events-tab' : undefined}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-4 py-1.5 font-display text-xs font-bold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Track Record + Credits + Account + Settings */}
          <div className="flex items-center gap-1.5 desktop:gap-2.5 shrink-0">
            <div
              className="flex h-10 landscape-short:h-9 desktop:h-auto items-center gap-1 border border-amber-400/35 bg-amber-500/12 px-2 py-0.5 text-[10.5px] desktop:px-2.5 desktop:py-1 desktop:text-xs whitespace-nowrap shrink-0"
              title="GT Career Credits"
              data-testid="garage-credits-balance"
            >
              <span className="font-display font-bold tracking-wider text-amber-300">CR</span>
              <span className="font-mono-tabular font-bold text-white">
                {creditsCr.toLocaleString()}
              </span>
            </div>

            {bestLapMs !== null && (
              <div className="hidden items-center gap-2 border-r border-white/12 pr-3 text-xs xl:flex whitespace-nowrap">
                <Clock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="text-[10px] tracking-wider text-slate-400 uppercase">Best</span>
                <span className="font-mono-tabular font-semibold text-emerald-300">
                  {formatLapMs(bestLapMs)}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={onOpenAuth}
              className={`inline-flex h-10 landscape-short:h-9 items-center gap-1.5 border px-2.5 font-display text-[10.5px] font-bold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 desktop:h-auto desktop:gap-1.5 desktop:px-3 desktop:py-1.5 desktop:text-xs ${
                user
                  ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                  : 'border-sky-400/55 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
              }`}
            >
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="max-w-[72px] truncate desktop:max-w-none">
                {user ? `@${user.username}` : 'Sign In'}
              </span>
            </button>

            {onOpenProfile && (
              <button
                type="button"
                onClick={onOpenProfile}
                title="View Driver Profile"
                className="inline-flex h-10 landscape-short:h-9 items-center gap-1.5 border border-white/16 bg-white/[0.05] px-2.5 font-display text-[10.5px] font-bold tracking-wider text-slate-100 uppercase transition-colors hover:border-sky-400/70 hover:text-white whitespace-nowrap shrink-0 desktop:h-auto desktop:px-3 desktop:py-1.5 desktop:text-xs"
              >
                <Award className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                <span className="hidden sm:inline">Profile</span>
              </button>
            )}

            <button
              type="button"
              data-tutorial="tutorial-settings-btn"
              onClick={onOpenSettings}
              aria-label="Open Settings"
              className="inline-flex h-10 w-10 landscape-short:h-9 landscape-short:w-9 items-center justify-center border border-white/16 bg-white/[0.05] text-slate-100 transition-colors hover:border-sky-400/70 hover:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 desktop:h-auto desktop:w-auto desktop:gap-1.5 desktop:px-3 desktop:py-1.5 font-display text-xs font-bold tracking-wider uppercase"
            >
              <Settings className="h-4 w-4 desktop:h-3.5 desktop:w-3.5 text-sky-400" />
              <span className="hidden desktop:inline">Settings</span>
            </button>
          </div>
        </div>

        {/* Mobile Portrait Unified Scrollable Nav + Social Ribbon (Hidden on landscape-short & desktop) */}
        <div className="flex landscape-short:hidden desktop:hidden items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-white/10 bg-black/55 px-2.5 py-1.5">
          <div className="flex items-center border border-white/15 bg-black/60 p-0.5 shrink-0">
            {[
              { id: 'showroom' as const, label: 'Car' },
              { id: 'events' as const, label: 'Race' },
              { id: 'controls' as const, label: 'Controls' },
            ].map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  data-tutorial={tab.id === 'events' ? 'tutorial-events-tab' : undefined}
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-9 px-3 font-display text-[11px] font-bold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 ${
                    active ? 'bg-sky-500 text-slate-950' : 'text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <span className="h-5 w-px bg-white/15 shrink-0" />

          <button
            type="button"
            data-tutorial="tutorial-social-btn"
            onClick={() => onOpenSocialHub('parties')}
            className="inline-flex h-9 items-center gap-1.5 border border-sky-400/45 bg-sky-500/15 px-2.5 font-display text-[10.5px] font-bold tracking-wider text-sky-200 uppercase whitespace-nowrap shrink-0"
          >
            <Users className="h-3.5 w-3.5 text-sky-400" />
            <span>Parties ({livePartyCount})</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenSocialHub('explore')}
            className="inline-flex h-9 items-center gap-1.5 border border-white/14 bg-white/[0.04] px-2.5 font-display text-[10.5px] font-bold tracking-wider text-slate-200 uppercase whitespace-nowrap shrink-0"
          >
            <Globe className="h-3.5 w-3.5 text-emerald-400" />
            <span>Explore</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenSocialHub('leaderboards')}
            className="inline-flex h-9 items-center gap-1.5 border border-white/14 bg-white/[0.04] px-2.5 font-display text-[10.5px] font-bold tracking-wider text-slate-200 uppercase whitespace-nowrap shrink-0"
          >
            <Trophy className="h-3.5 w-3.5 text-amber-400" />
            <span>Ranks</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenSocialHub('friends')}
            className="inline-flex h-9 items-center gap-1.5 border border-white/14 bg-white/[0.04] px-2.5 font-display text-[10.5px] font-bold tracking-wider text-slate-200 uppercase whitespace-nowrap shrink-0"
          >
            <UserPlus className="h-3.5 w-3.5 text-sky-300" />
            <span>Friends</span>
          </button>

          {activeParty && (
            <button
              type="button"
              onClick={() => onOpenSocialHub('parties')}
              className="inline-flex h-9 items-center gap-1.5 border border-emerald-400/60 bg-emerald-500/18 px-2.5 font-mono-tabular text-[10.5px] font-bold text-emerald-200 uppercase whitespace-nowrap shrink-0"
            >
              <span>Lobby {activeParty.code}</span>
            </button>
          )}
        </div>

        {/* Desktop Social & Multiplayer Hub Quick-Launch Strip (>=1024x580) */}
        <div className="hidden desktop:flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/50 px-4 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-tutorial="tutorial-social-btn"
              onClick={() => onOpenSocialHub('parties')}
              className="inline-flex items-center gap-1.5 border border-sky-400/45 bg-sky-500/15 px-2.5 py-1 font-display text-[11px] font-bold tracking-wider text-sky-200 uppercase hover:bg-sky-500/25"
            >
              <Users className="h-3 w-3 text-sky-400" />
              <span>Live Parties ({livePartyCount})</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenSocialHub('explore')}
              className="inline-flex items-center gap-1.5 border border-white/14 bg-white/[0.04] px-2.5 py-1 font-display text-[11px] font-bold tracking-wider text-slate-200 uppercase hover:border-sky-400/50"
            >
              <Globe className="h-3 w-3 text-emerald-400" />
              <span>Explore Maps</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenSocialHub('leaderboards')}
              className="inline-flex items-center gap-1.5 border border-white/14 bg-white/[0.04] px-2.5 py-1 font-display text-[11px] font-bold tracking-wider text-slate-200 uppercase hover:border-amber-400/50"
            >
              <Trophy className="h-3 w-3 text-amber-400" />
              <span>Leaderboards</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenSocialHub('friends')}
              className="inline-flex items-center gap-1.5 border border-white/14 bg-white/[0.04] px-2.5 py-1 font-display text-[11px] font-bold tracking-wider text-slate-200 uppercase hover:border-sky-400/50"
            >
              <UserPlus className="h-3 w-3 text-sky-300" />
              <span>Friends</span>
            </button>
          </div>

          {activeParty && (
            <button
              type="button"
              onClick={() => onOpenSocialHub('parties')}
              className="inline-flex items-center gap-2 border border-emerald-400/60 bg-emerald-500/15 px-2.5 py-1 font-mono-tabular text-[10px] font-bold text-emerald-200 uppercase hover:bg-emerald-500/25"
            >
              <span>
                Party {activeParty.code} · {activeParty.members.length} Drivers ·{' '}
                {activeParty.activityMode}
              </span>
              <span className="text-white underline">Open Lobby</span>
            </button>
          )}
        </div>
      </header>

      {/* Center Stage: Dedicated Mobile Unobstructed Showcase vs Desktop GT5 Carbon Hangar */}
      <div className="my-1 flex min-h-0 flex-1 flex-col justify-end gap-2 py-0.5 desktop:my-auto desktop:flex-row desktop:items-center desktop:justify-between desktop:gap-6 desktop:py-3">
        {activeTab === 'showroom' && (
          <section
            data-tutorial="tutorial-showroom"
            onTouchStart={(e) => {
              if ((e.target as HTMLElement | null)?.closest('button')) {
                swipeStartRef.current = null;
                return;
              }
              const t = e.touches[0];
              if (t) swipeStartRef.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              const start = swipeStartRef.current;
              swipeStartRef.current = null;
              if (!start || (e.target as HTMLElement | null)?.closest('button')) return;
              const t = e.changedTouches[0];
              if (!t) return;
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              if (Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                onCycleCar(dx < 0 ? 1 : -1);
              }
            }}
            className={`pointer-events-auto gt5-panel gt5-carbon w-full min-[540px]:max-w-[380px] landscape-short:max-w-[330px] desktop:max-w-[360px] flex flex-col ${
              mobileCardExpanded ? 'max-h-[70dvh] desktop:max-h-[78dvh]' : 'max-h-[34dvh] desktop:max-h-full'
            } overflow-hidden`}
          >
            {/* Row 1: Bay identity + All Cars modal trigger + Specs toggle */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/60 px-2.5 py-1.5 desktop:px-3.5 desktop:py-1.5 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono-tabular text-[10px] font-bold tracking-[0.14em] text-sky-400 uppercase whitespace-nowrap">
                  Bay {String(carIndex + 1).padStart(2, '0')}
                </span>
                <span className="font-mono-tabular text-[10px] font-bold text-emerald-300 whitespace-nowrap truncate">
                  · {car.available && liveSpecs ? `${liveSpecs.ppLabel} PP` : `${car.pp} PP`}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenCarSelect();
                  }}
                  data-testid="open-car-select-btn"
                  aria-label={`Select Car (${GARAGE_CARS.length} vehicles)`}
                  className="inline-flex h-8 landscape-short:h-8 items-center gap-1.5 border border-sky-400/55 bg-sky-500/16 px-2.5 font-display text-[10px] font-bold tracking-wider text-sky-200 uppercase transition-colors hover:bg-sky-500/28 hover:text-white whitespace-nowrap shrink-0 desktop:h-7 desktop:px-2.5 desktop:text-[10px]"
                >
                  <LayoutGrid className="h-3 w-3 text-sky-400" />
                  <span>All ({GARAGE_CARS.length})</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileCardExpanded((v) => !v);
                  }}
                  className="h-8 landscape-short:h-8 desktop:h-7 border border-white/20 bg-white/[0.07] px-2.5 text-[10px] font-bold tracking-wider text-sky-300 uppercase whitespace-nowrap shrink-0 hover:border-sky-400/60"
                >
                  {mobileCardExpanded ? 'Less' : 'Specs'}
                </button>
              </div>
            </div>

            {/* Row 2: Dedicated Left / Right Car Switcher Arrows flanking vehicle identity */}
            <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/35 px-2 py-1.5 desktop:px-4 desktop:py-2.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCycleCar(-1);
                }}
                data-testid="prev-car-btn"
                aria-label="Previous car"
                className="flex h-11 w-11 landscape-short:h-9 landscape-short:w-9 desktop:h-9 desktop:w-9 items-center justify-center border border-white/20 bg-white/[0.06] text-white transition-colors hover:border-sky-400 hover:bg-sky-500/20 active:bg-sky-500/30 shrink-0"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="min-w-0 flex-1 text-center desktop:text-left">
                <div className="flex items-center justify-center desktop:justify-between gap-2">
                  <h2 className="font-display text-xs sm:text-sm font-bold tracking-tight text-white leading-tight truncate desktop:text-lg desktop:whitespace-normal">
                    {car.name}
                  </h2>
                  <span className="font-mono-tabular hidden desktop:inline text-xs font-semibold text-sky-300 shrink-0">
                    {carIndex + 1}/{GARAGE_CARS.length}
                  </span>
                </div>
                <p className="font-mono-tabular desktop:hidden mt-0.5 text-[10px] text-slate-300 truncate">
                  <span className="font-bold text-sky-300">{carIndex + 1}/{GARAGE_CARS.length}</span>
                  <span className="mx-1 text-slate-500">·</span>
                  <span className="text-amber-300">{car.available && liveSpecs ? liveSpecs.powerLabel : car.power}</span>
                  <span className="mx-1 text-slate-500">·</span>
                  <span>{car.available && liveSpecs ? liveSpecs.weightLabel : car.weight}</span>
                </p>
                <p className="hidden desktop:block mt-0.5 text-xs font-medium text-amber-300/90 truncate">
                  {car.category}
                </p>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCycleCar(1);
                }}
                data-testid="next-car-btn"
                aria-label="Next car"
                className="flex h-11 w-11 landscape-short:h-9 landscape-short:w-9 desktop:h-9 desktop:w-9 items-center justify-center border border-white/20 bg-white/[0.06] text-white transition-colors hover:border-sky-400 hover:bg-sky-500/20 active:bg-sky-500/30 shrink-0"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            {!carReady && car.available && (
              <div
                className="border-b border-white/10 bg-sky-950/35 px-2.5 py-1.5 desktop:px-4 shrink-0"
                data-testid="car-live-load-bar"
              >
                <div className="font-mono-tabular flex items-center justify-between gap-2 text-[10px] leading-none">
                  <span className="font-semibold tracking-wider text-sky-300 uppercase truncate">
                    Loading 3D Model
                  </span>
                  <span className="font-bold text-white shrink-0">{carLoadPct}%</span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden bg-white/12">
                  <div
                    className="h-full bg-sky-400 transition-all duration-150"
                    style={{ width: `${Math.max(4, carLoadPct)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="px-2.5 py-1.5 desktop:p-3 overflow-y-auto space-y-1.5 desktop:space-y-2">
              {/* Desktop 4-stat strip + quick Tune/Lab actions (collapsed mobile omits redundant stats & event bar) */}
              {!mobileCardExpanded && (
                <div className="space-y-1.5 desktop:space-y-2">
                  <div className="font-mono-tabular hidden desktop:grid grid-cols-4 border border-white/10 bg-black/50 divide-x divide-white/10 text-center">
                    <div className="px-1 py-1.5">
                      <div className="text-[8px] text-slate-400 uppercase">Power</div>
                      <div className="mt-0.5 text-[10.5px] font-bold text-white truncate">
                        {car.available && liveSpecs ? liveSpecs.powerLabel : car.power}
                      </div>
                    </div>
                    <div className="px-1 py-1.5">
                      <div className="text-[8px] text-slate-400 uppercase">Weight</div>
                      <div className="mt-0.5 text-[10.5px] font-bold text-white truncate">
                        {car.available && liveSpecs ? liveSpecs.weightLabel : car.weight}
                      </div>
                    </div>
                    <div className="px-1 py-1.5">
                      <div className="text-[8px] text-slate-400 uppercase">Drive</div>
                      <div className="mt-0.5 text-[10.5px] font-bold text-white truncate">
                        {car.drivetrain}
                      </div>
                    </div>
                    <div className="px-1 py-1.5 bg-sky-500/10">
                      <div className="text-[8px] text-sky-300 uppercase">PP</div>
                      <div className="mt-0.5 text-[10.5px] font-bold text-sky-300 truncate">
                        {car.available && liveSpecs ? liveSpecs.ppLabel : car.pp}
                      </div>
                    </div>
                  </div>

                  {car.available && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        data-tutorial="tutorial-tune-btn"
                        onClick={onOpenTuning}
                        className="inline-flex h-10 desktop:h-9 items-center justify-center gap-1.5 border border-sky-400/55 bg-sky-500/16 px-2.5 font-display text-[11px] font-bold tracking-wider text-sky-200 uppercase hover:bg-sky-500/26 whitespace-nowrap"
                      >
                        <Wrench className="h-3.5 w-3.5 text-sky-400" />
                        <span>Tune &amp; Setup</span>
                      </button>
                      <button
                        type="button"
                        data-tutorial="tutorial-englab-btn"
                        onClick={onOpenEngLab}
                        className="inline-flex h-10 desktop:h-9 items-center justify-center gap-1.5 border border-emerald-400/45 bg-emerald-500/12 px-2.5 font-display text-[11px] font-bold tracking-wider text-emerald-200 uppercase hover:bg-emerald-500/22 whitespace-nowrap"
                      >
                        <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
                        <span>{testModeEnabled ? 'Test Lab' : 'Eng. Lab'}</span>
                      </button>
                    </div>
                  )}

                  {car.available && legalityWarning && (
                    <div className="flex items-start gap-1.5 border border-amber-400/50 bg-amber-950/40 px-2 py-1 text-[10px] text-amber-200">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                      <span className="truncate">{legalityWarning}</span>
                    </div>
                  )}

                  <div className="hidden desktop:flex items-center justify-between border-t border-white/10 pt-1.5 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-300 min-w-0 truncate">
                      <Flag className="h-3 w-3 text-amber-400 shrink-0" />
                      <span className="font-semibold text-white">{activeModeMeta.title}</span>
                      <span className="text-slate-500">·</span>
                      <span className="font-mono-tabular text-sky-300">{lapSummaryLabel}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('events')}
                      className="px-2 py-0.5 text-[10.5px] font-bold tracking-wider text-sky-400 uppercase hover:text-sky-300 whitespace-nowrap shrink-0"
                    >
                      Event
                    </button>
                  </div>
                </div>
              )}

              <div className={mobileCardExpanded ? 'block' : 'hidden'}>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  {car.description}
                </p>

                {/* Primary 5-Column Spec Matrix */}
                <div className="font-mono-tabular mt-2 grid grid-cols-5 border border-white/10 bg-black/55 divide-x divide-white/10 text-center">
                  <div className="px-1 py-1.5">
                    <div className="text-[8px] text-slate-400 uppercase">Power</div>
                    <div className="mt-0.5 text-[10px] font-bold text-white">
                      {car.available && liveSpecs ? liveSpecs.powerLabel : car.power}
                    </div>
                  </div>
                  <div className="px-1 py-1.5">
                    <div className="text-[8px] text-slate-400 uppercase">Torque</div>
                    <div className="mt-0.5 text-[10px] font-bold text-white">
                      {car.available && liveSpecs ? liveSpecs.torqueLabel : car.torque}
                    </div>
                  </div>
                  <div className="px-1 py-1.5">
                    <div className="text-[8px] text-slate-400 uppercase">Weight</div>
                    <div className="mt-0.5 text-[10px] font-bold text-white">
                      {car.available && liveSpecs ? liveSpecs.weightLabel : car.weight}
                    </div>
                  </div>
                  <div className="px-1 py-1.5">
                    <div className="text-[8px] text-slate-400 uppercase">Drive</div>
                    <div className="mt-0.5 text-[10px] font-bold text-white truncate">
                      {car.drivetrain}
                    </div>
                  </div>
                  <div className="px-1 py-1.5 bg-sky-500/10">
                    <div className="text-[8px] text-sky-300 uppercase truncate">
                      {car.available && liveSpecs ? liveSpecs.bracketLabel : 'PP'}
                    </div>
                    <div className="mt-0.5 text-[10px] font-bold text-sky-300">
                      {car.available && liveSpecs ? liveSpecs.ppLabel : car.pp}
                    </div>
                  </div>
                </div>

                {/* Complete Technical Spec Sheet */}
                {specSheet && (
                  <div className="font-mono-tabular mt-2 space-y-1.5 border border-white/10 bg-black/45 p-2 text-[10px]">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <div className="flex justify-between gap-1 border-b border-white/8 pb-0.5">
                        <span className="text-slate-400">Engine</span>
                        <span className="text-slate-100 truncate">{specSheet.engineConfig}</span>
                      </div>
                      <div className="flex justify-between gap-1 border-b border-white/8 pb-0.5">
                        <span className="text-slate-400">Induction</span>
                        <span className="text-sky-300 truncate">{specSheet.induction}</span>
                      </div>
                      <div className="flex justify-between gap-1 border-b border-white/8 pb-0.5">
                        <span className="text-slate-400">P / W</span>
                        <span className="text-amber-300">{specSheet.powerToWeightHpPerTonne} HP/t</span>
                      </div>
                      <div className="flex justify-between gap-1 border-b border-white/8 pb-0.5">
                        <span className="text-slate-400">Redline</span>
                        <span className="text-slate-100">{specSheet.redlineRpm.toLocaleString()} RPM</span>
                      </div>
                      <div className="flex justify-between gap-1 border-b border-white/8 pb-0.5">
                        <span className="text-slate-400">Gearbox</span>
                        <span className="text-slate-100">{specSheet.gearCount}-Spd</span>
                      </div>
                      <div className="flex justify-between gap-1 border-b border-white/8 pb-0.5">
                        <span className="text-slate-400">Brake</span>
                        <span className="text-rose-300">{specSheet.maxBrakeKn} kN</span>
                      </div>
                      <div className="flex justify-between gap-1 border-b border-white/8 pb-0.5">
                        <span className="text-slate-400">Aero</span>
                        <span className="text-sky-200">{specSheet.downforceTotalKgf200} kgf</span>
                      </div>
                      <div className="flex justify-between gap-1 border-b border-white/8 pb-0.5">
                        <span className="text-slate-400">Fuel</span>
                        <span className="text-emerald-300">{specSheet.mileageKmPerL.toFixed(1)} km/L</span>
                      </div>
                    </div>
                  </div>
                )}

                {car.available && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onOpenTuning}
                      className="inline-flex h-9 items-center justify-center gap-1.5 border border-sky-400/55 bg-sky-500/14 px-2.5 font-display text-[11px] font-bold tracking-wider text-sky-200 uppercase hover:bg-sky-500/24 hover:text-white whitespace-nowrap"
                    >
                      <Wrench className="h-3.5 w-3.5 text-sky-400" />
                      <span>Tune &amp; Setup</span>
                    </button>
                    {onOpenAnalytics ? (
                      <button
                        type="button"
                        onClick={onOpenAnalytics}
                        className="inline-flex h-9 items-center justify-center gap-1.5 border border-amber-400/45 bg-amber-500/12 px-2.5 font-display text-[11px] font-bold tracking-wider text-amber-200 uppercase hover:bg-amber-500/22 hover:text-white whitespace-nowrap"
                      >
                        <Activity className="h-3.5 w-3.5 text-amber-400" />
                        <span>Analytics</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onOpenEngLab}
                        className="inline-flex h-9 items-center justify-center gap-1.5 border border-emerald-400/45 bg-emerald-500/12 px-2.5 font-display text-[11px] font-bold tracking-wider text-emerald-200 uppercase hover:bg-emerald-500/22 hover:text-white whitespace-nowrap"
                      >
                        <FlaskConical className="h-3.5 w-3.5 text-emerald-400" />
                        <span>{testModeEnabled ? 'Test Lab' : 'Eng. Lab'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'showroom' && !car.available && (
          <div className="pointer-events-auto gt5-panel mx-auto flex flex-col items-center px-5 py-3 text-center desktop:px-6 desktop:py-4">
            <Lock className="h-5 w-5 text-sky-300" />
            <p className="font-display mt-1.5 text-sm font-bold tracking-wider text-white uppercase desktop:mt-2 desktop:text-lg">
              Model Bay Prepared · GLB Pending
            </p>
            <p className="mt-1 max-w-xs text-[11px] text-slate-300 desktop:text-xs">
              Vehicle specs are staged and awaiting 3D GLB mesh. Select any available GT or Widebody vehicle to race.
            </p>
          </div>
        )}

        {activeTab === 'events' && (
          <section className="pointer-events-auto gt5-panel gt5-carbon w-full max-w-2xl max-h-full overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/12 bg-black/50 px-3 py-2 landscape-short:px-3 landscape-short:py-1.5 desktop:px-5 desktop:py-3">
              <div>
                <p className="text-[9px] font-semibold tracking-[0.2em] text-sky-400 uppercase desktop:text-[10px]">
                  Event Directory
                </p>
                <h2 className="font-display mt-0.5 text-xs font-bold text-white uppercase landscape-short:text-xs desktop:text-lg">
                  Game Mode, Distance &amp; AI Pace
                </h2>
              </div>
              <span className="font-mono-tabular text-[10px] text-slate-300 desktop:text-xs">
                {activeCustomBlueprint ? activeCustomBlueprint.title : activeMapMeta.shortName} · {metrics.lengthKm} km
              </span>
            </div>

            <div className="p-2.5 space-y-2 landscape-short:p-2 landscape-short:space-y-2 desktop:p-5 desktop:space-y-4">
              <div className="grid grid-cols-2 gap-1.5 desktop:gap-2.5">
                {GAME_MODE_DEFS.map((mode) => {
                  const selected = raceConfig.mode === mode.id;
                  const Icon =
                    mode.id === 'time_trial'
                      ? Timer
                      : mode.id === 'sprint'
                        ? Trophy
                        : mode.id === 'endurance'
                          ? Gauge
                          : Flame;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => handleSelectMode(mode.id)}
                      className={`flex min-h-[42px] flex-col items-start justify-center border p-2 text-left transition-colors desktop:p-3.5 ${
                        selected
                          ? 'border-sky-400 bg-sky-500/16 text-white'
                          : 'border-white/10 bg-black/40 text-slate-300 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-display text-[11px] font-bold uppercase tracking-wide desktop:text-sm">
                          {mode.title}
                        </span>
                        <Icon
                          className={`h-3.5 w-3.5 desktop:h-4 desktop:w-4 ${selected ? 'text-sky-400' : 'text-slate-400'}`}
                        />
                      </div>
                      <p className="hidden sm:block mt-0.5 text-[10px] leading-snug text-slate-300/90 desktop:mt-1 desktop:text-xs">
                        {mode.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Stint Strategy Presets & Car Economics */}
              <div className="border-t border-white/10 pt-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] desktop:text-xs">
                  <span className="font-semibold tracking-wider text-slate-300 uppercase">
                    Stint Strategy · {car.name}
                  </span>
                  <span className="font-mono-tabular text-[10px] text-emerald-300 desktop:text-[11px]">
                    ~{stintEcon.lapsPerStint.toFixed(1)} L/Stint · {stintEcon.consumptionPerLap.toFixed(1)} L/Lap · {stintEcon.mileageKmPerL.toFixed(2)} km/L
                  </span>
                </div>
                <div className="font-mono-tabular mt-1.5 flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-black/45 px-2.5 py-1 text-[9.5px] text-slate-300">
                  <span>
                    Fuel: <strong className="text-emerald-300">{stintEcon.raceFuelLPer100Km.toFixed(1)} L/100km</strong> · {carTankLiters}L ({stintEcon.estimatedTankRangeKm} km)
                  </span>
                  <span>
                    Tires: <strong className="text-amber-300">{stintEcon.tireWearMult.toFixed(2)}x wear</strong> · {stintEcon.tireStintRangeKm} km stint
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {STINT_PRESETS.map((preset) => {
                    const isActive =
                      raceConfig.strategyPreset === preset.id ||
                      (raceConfig.lapCount === preset.laps && currentStints === preset.stints);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyStintPreset(preset)}
                        className={`border px-2 py-1.5 text-left transition-colors desktop:px-3 desktop:py-2 ${
                          isActive
                            ? 'border-sky-400 bg-sky-500/18 text-white'
                            : 'border-white/12 bg-black/40 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        <div className="font-display text-[10.5px] font-bold uppercase truncate desktop:text-xs">
                          {preset.id === 'sprint' ? 'Sprint' : preset.label}
                        </div>
                        <div className="font-mono-tabular mt-0.5 text-[9px] text-slate-400 truncate desktop:text-[10px]">
                          {preset.laps}L · {preset.stints}S
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lap Count & Stints */}
              <div className="border-t border-white/10 pt-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] desktop:text-xs">
                  <span className="font-semibold tracking-wider text-slate-300 uppercase">
                    Race Distance · {lapSummaryLabel}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase desktop:text-[11px]">
                      Stints
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onRaceConfigChange({
                          ...raceConfig,
                          targetStints: Math.max(1, currentStints - 1),
                          strategyPreset: undefined,
                        })
                      }
                      className="flex h-10 w-10 desktop:h-7 desktop:w-7 items-center justify-center border border-white/15 bg-white/5 text-sm font-bold text-slate-200 hover:border-sky-400/60"
                      aria-label="Decrease target stints"
                    >
                      -
                    </button>
                    <span className="font-mono-tabular min-w-[24px] text-center font-bold text-sky-300">
                      {currentStints}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onRaceConfigChange({
                          ...raceConfig,
                          targetStints: Math.min(15, currentStints + 1),
                          strategyPreset: undefined,
                        })
                      }
                      className="flex h-10 w-10 desktop:h-7 desktop:w-7 items-center justify-center border border-white/15 bg-white/5 text-sm font-bold text-slate-200 hover:border-sky-400/60"
                      aria-label="Increase target stints"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 desktop:gap-2">
                  {LAP_OPTIONS.filter(
                    (opt) => opt.value !== 0 || activeModeMeta.allowUnlimited,
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        onRaceConfigChange({
                          ...raceConfig,
                          lapCount: opt.value,
                          strategyPreset: undefined,
                        })
                      }
                      className={`h-9 desktop:h-auto border px-3 py-1 font-mono-tabular text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 desktop:px-3 desktop:py-1.5 desktop:text-xs ${
                        raceConfig.lapCount === opt.value
                          ? 'border-sky-400 bg-sky-500 text-slate-950'
                          : 'border-white/12 bg-black/40 text-slate-200 hover:border-white/30'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}

                  <label className="inline-flex h-9 desktop:h-auto items-center gap-1.5 border border-white/18 bg-black/60 px-2.5 py-1 text-[11px] text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-slate-400 text-[10px]">
                      Custom
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={raceConfig.lapCount === 0 ? '' : raceConfig.lapCount}
                      placeholder="1-999"
                      aria-label="Custom lap count"
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10);
                        if (!Number.isFinite(raw)) return;
                        const clamped = Math.max(1, Math.min(999, raw));
                        onRaceConfigChange({
                          ...raceConfig,
                          lapCount: clamped,
                          strategyPreset: undefined,
                        });
                      }}
                      className="font-mono-tabular w-14 bg-transparent text-right text-xs font-bold text-amber-300 focus:outline-none"
                    />
                    <span className="font-mono-tabular text-[10px] text-sky-400">
                      ?laps={raceConfig.lapCount === 0 ? 'unlimited' : raceConfig.lapCount}
                    </span>
                  </label>
                </div>
              </div>

              {/* AI Rival Difficulty */}
              <div className="border-t border-white/10 pt-2.5">
                <div className="flex items-center justify-between text-[11px] desktop:text-xs">
                  <span className="font-semibold tracking-wider text-slate-300 uppercase">
                    AI Rival Difficulty
                  </span>
                  <span className="font-mono-tabular text-amber-300 uppercase">
                    {activeDifficulty}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5 desktop:gap-2">
                  {DIFFICULTY_OPTIONS.map((opt) => {
                    const selected = activeDifficulty === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onRaceConfigChange({ ...raceConfig, difficulty: opt.id })
                        }
                        className={`min-h-[44px] border px-2 py-2 text-left transition-colors desktop:min-h-0 desktop:px-3 desktop:py-2 ${
                          selected
                            ? 'border-amber-400 bg-amber-500/18 text-white'
                            : 'border-white/12 bg-black/40 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        <div className="font-display text-[11px] font-bold uppercase desktop:text-xs">{opt.label}</div>
                        <div className="mt-0.5 text-[9.5px] leading-tight text-slate-400 desktop:text-[10px]">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Countdown Mode */}
              <div className="border-t border-white/10 pt-2.5">
                <div className="flex items-center justify-between text-[11px] desktop:text-xs">
                  <span className="font-semibold tracking-wider text-slate-300 uppercase">
                    Race Start Countdown
                  </span>
                  <span className="font-mono-tabular text-sky-300 uppercase">
                    {raceConfig.startCountdownMode ?? 'full'}
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5 desktop:gap-2">
                  {COUNTDOWN_OPTIONS.map((opt) => {
                    const selected = (raceConfig.startCountdownMode ?? 'full') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onRaceConfigChange({ ...raceConfig, startCountdownMode: opt.id })
                        }
                        className={`min-h-[44px] border px-2 py-2 text-left transition-colors desktop:min-h-0 desktop:px-3 desktop:py-2 ${
                          selected
                            ? 'border-sky-400 bg-sky-500/18 text-white'
                            : 'border-white/12 bg-black/40 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        <div className="font-display text-[11px] font-bold uppercase desktop:text-xs">{opt.label}</div>
                        <div className="mt-0.5 text-[9.5px] leading-tight text-slate-400 desktop:text-[10px]">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'controls' && (
          <section className="pointer-events-auto gt5-panel gt5-carbon w-full max-w-2xl max-h-full overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/12 bg-black/50 px-3 py-2 landscape-short:py-1.5 desktop:px-5 desktop:py-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-3.5 w-3.5 text-sky-400 desktop:h-4 desktop:w-4" />
                <h2 className="font-display text-xs font-bold tracking-wider text-white uppercase desktop:text-base">
                  Driving Controls · {car.gearboxLabel}
                </h2>
              </div>
              <span className="hidden text-xs text-slate-400 desktop:inline">
                Hold RMB inside Cockpit / Windshield to look around
              </span>
            </div>

            {onMobileSteerModeChange && (
              <div className="border-b border-white/12 bg-black/35 p-2.5 space-y-2.5 desktop:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold tracking-[0.16em] text-sky-400 uppercase">
                      Mobile Touch Driving Controls
                    </p>
                    <p className="text-[10.5px] text-slate-400">
                      Pick your preferred steering layout for phones &amp; tablets
                    </p>
                  </div>
                  {onMobileVisibilityChange && (
                    <div className="flex gap-1">
                      {(
                        [
                          { id: 'auto', label: 'Auto' },
                          { id: 'always', label: 'Always' },
                          { id: 'off', label: 'Off' },
                        ] as const
                      ).map((vis) => (
                        <button
                          key={vis.id}
                          type="button"
                          onClick={() => onMobileVisibilityChange(vis.id)}
                          className={`h-8 border px-2 text-[10px] font-semibold uppercase ${
                            mobileVisibility === vis.id
                              ? 'border-sky-400 bg-sky-500 text-slate-950'
                              : 'border-white/12 bg-black/50 text-slate-300'
                          }`}
                        >
                          {vis.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {(
                    [
                      { id: 'arrows', label: 'Arrow Buttons', desc: 'Tap L / R pads' },
                      { id: 'wheel', label: 'Virtual Wheel', desc: 'Rotate steering rim' },
                      { id: 'slider', label: 'Touch Slider', desc: 'Smooth thumb drag' },
                      { id: 'tilt', label: 'Tilt Gyro', desc: 'Steer by tilting' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onMobileSteerModeChange(opt.id)}
                      className={`min-h-[44px] border px-2.5 py-1.5 text-left transition-colors ${
                        mobileSteerMode === opt.id
                          ? 'border-amber-400 bg-amber-400/20 text-white'
                          : 'border-white/12 bg-black/50 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      <div className="font-display text-[11px] font-bold uppercase">{opt.label}</div>
                      <div className="text-[9.5px] text-slate-400 leading-tight">{opt.desc}</div>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  {onMobileAutoGasChange && (
                    <button
                      type="button"
                      onClick={() => onMobileAutoGasChange(!mobileAutoGas)}
                      className={`inline-flex h-9 items-center gap-2 border px-2.5 text-[10.5px] font-semibold uppercase ${
                        mobileAutoGas
                          ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200'
                          : 'border-white/12 bg-black/50 text-slate-300'
                      }`}
                    >
                      <span>Auto-Gas: {mobileAutoGas ? 'ON' : 'OFF'}</span>
                    </button>
                  )}

                  {onMobileSteerSensitivityChange && (
                    <div className="flex flex-1 min-w-[160px] items-center gap-2">
                      <span className="text-[10px] text-slate-400 uppercase shrink-0">Sens</span>
                      <input
                        type="range"
                        min={0.5}
                        max={2.0}
                        step={0.05}
                        value={mobileSteerSensitivity}
                        onChange={(e) => onMobileSteerSensitivityChange(parseFloat(e.target.value))}
                        aria-label="Mobile Steering Sensitivity"
                        className="sun-slider flex-1"
                      />
                      <span className="font-mono-tabular text-[10.5px] font-bold text-amber-300 w-10 text-right shrink-0">
                        {mobileSteerSensitivity.toFixed(2)}x
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-x-5 gap-y-0.5 p-2.5 landscape-short:grid-cols-2 desktop:grid-cols-2 desktop:gap-x-6 desktop:gap-y-1 desktop:p-5">
              {ALL_CONTROLS.map((item) => (
                <div
                  key={item.keys}
                  className="flex items-center justify-between gap-2 border-b border-white/8 py-1 text-[10.5px] desktop:py-1.5 desktop:text-xs"
                >
                  <span className="text-slate-200">{item.action}</span>
                  <kbd className="font-mono-tabular border border-white/18 bg-black/60 px-1.5 py-0.5 text-[9.5px] font-semibold text-sky-300 whitespace-nowrap shrink-0 desktop:px-2 desktop:text-[11px]">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="hidden desktop:block" />
      </div>

      {/* GT5 Bottom Hangar Camera Deck & Event Launch Strip: Ergonomic touch bar on mobile */}
      <footer className="pointer-events-auto gt5-panel shrink-0 overflow-hidden">
        <div className="flex items-center justify-between gap-1 px-1.5 py-1.5 landscape-short:px-2 landscape-short:py-1 desktop:flex-wrap desktop:gap-3 desktop:px-4 desktop:py-2.5">
          {/* Mobile Compact Camera Angle Cycle Button */}
          <button
            type="button"
            onClick={cycleMobileGarageCam}
            title={`Camera: ${currentCamMeta.label}`}
            className="desktop:hidden inline-flex h-11 landscape-short:h-9 items-center gap-1 border border-white/16 bg-white/[0.05] px-2 text-[10px] font-semibold text-slate-200 active:border-sky-400/60 whitespace-nowrap shrink-0"
          >
            <Camera className="h-3.5 w-3.5 text-sky-400" />
            <span>Cam</span>
          </button>

          {/* Desktop Hangar Camera Angles */}
          <div className="hidden desktop:flex flex-wrap items-center gap-1.5">
            <div className="mr-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-slate-400 uppercase whitespace-nowrap">
              <Camera className="h-3.5 w-3.5 text-sky-400" />
              <span>Hangar View</span>
            </div>
            {CAMERA_ANGLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onGarageCamPresetChange(preset.id)}
                className={`border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  garageCamPreset === preset.id
                    ? 'border-sky-400 bg-sky-500/20 text-white'
                    : 'border-white/12 bg-white/[0.04] text-slate-300 hover:border-white/30 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
            <span className="ml-2 hidden text-[11px] text-slate-500 xl:inline">
              Drag showroom to orbit
            </span>
          </div>

          {/* Right Launch Deck */}
          <div className="flex items-center justify-end gap-1 ml-auto desktop:gap-2.5">
            {onOpenPhotoMode && (
              <button
                type="button"
                onClick={onOpenPhotoMode}
                title="Enter Photography Mode (P)"
                className="inline-flex h-11 landscape-short:h-9 items-center justify-center gap-1 border border-sky-400/45 bg-sky-500/12 px-2 font-display text-[10px] font-bold tracking-wider text-sky-200 uppercase transition-colors hover:bg-sky-500/24 hover:text-white whitespace-nowrap shrink-0 desktop:h-auto desktop:gap-1.5 desktop:px-3.5 desktop:py-2 desktop:text-xs"
              >
                <Aperture className="h-3.5 w-3.5 text-sky-400" />
                <span className="desktop:hidden">Photo</span>
                <span className="hidden desktop:inline">Photo (P)</span>
              </button>
            )}
            {!carReady && (
              <div className="hidden desktop:flex items-center gap-2 border border-white/12 bg-black/55 px-3 py-2 text-xs text-slate-300 whitespace-nowrap shrink-0">
                <span className="whitespace-nowrap">Preparing Car</span>
                <div className="h-1.5 w-24 overflow-hidden bg-white/10">
                  <div
                    className="h-full bg-sky-400 transition-all duration-150"
                    style={{ width: `${Math.max(4, carLoadPct)}%` }}
                  />
                </div>
                <span className="font-mono-tabular text-sky-300">{carLoadPct}%</span>
              </div>
            )}

            <div className="hidden text-right desktop:block pr-1 whitespace-nowrap shrink-0">
              <div className="text-[10px] tracking-wider text-slate-400 uppercase">Selected Event</div>
              <div className="font-mono-tabular text-xs font-semibold text-white">
                {activeModeMeta.title} · {lapSummaryLabel}
              </div>
            </div>

            {hasReplay && onWatchReplay && (
              <button
                type="button"
                onClick={onWatchReplay}
                className="inline-flex h-11 landscape-short:h-9 items-center justify-center gap-1 border border-amber-400/55 bg-amber-500/16 px-2.5 font-display text-[10px] font-bold tracking-wider text-amber-200 uppercase transition-colors hover:bg-amber-500/28 hover:text-white whitespace-nowrap shrink-0 desktop:h-auto desktop:gap-1.5 desktop:px-3.5 desktop:py-2 desktop:text-xs"
              >
                <Film className="h-3.5 w-3.5 text-amber-300" />
                <span>Replay</span>
              </button>
            )}

            {onOpenAnalytics && (
              <button
                type="button"
                onClick={onOpenAnalytics}
                className="hidden desktop:inline-flex items-center justify-center gap-1.5 border border-white/18 bg-white/[0.04] px-3 py-2 font-display text-xs font-bold tracking-wider text-slate-200 uppercase transition-colors hover:border-sky-400 hover:text-white whitespace-nowrap shrink-0"
              >
                <Activity className="h-3.5 w-3.5 text-sky-400" />
                <span>Analytics</span>
              </button>
            )}

            {car.available && (
              <button
                type="button"
                onClick={onOpenTuning}
                className="hidden desktop:inline-flex items-center justify-center gap-2 border border-sky-400/50 bg-sky-500/12 px-3.5 py-2 font-display text-xs font-bold tracking-wider text-sky-200 uppercase transition-colors hover:bg-sky-500/22 hover:text-white whitespace-nowrap shrink-0"
              >
                <Wrench className="h-3.5 w-3.5 text-sky-400" />
                <span>Tune</span>
              </button>
            )}

            <button
              type="button"
              data-tutorial="tutorial-build-btn"
              onClick={onOpenMapBuilder}
              className="inline-flex h-11 landscape-short:h-9 items-center justify-center gap-1 border border-emerald-400/55 bg-emerald-500/14 px-2 font-display text-[10px] font-bold tracking-wider text-emerald-200 uppercase transition-colors hover:bg-emerald-500/24 hover:text-white whitespace-nowrap shrink-0 desktop:h-auto desktop:gap-2 desktop:px-4 desktop:py-2 desktop:text-xs"
            >
              <Hammer className="h-3.5 w-3.5 text-emerald-400 desktop:h-4 desktop:w-4" />
              <span className="desktop:hidden">Build</span>
              <span className="hidden desktop:inline">Build Map</span>
            </button>

            <button
              type="button"
              onClick={onOpenCustomMap}
              className="inline-flex h-11 landscape-short:h-9 items-center justify-center gap-1 border border-amber-400/55 bg-amber-500/14 px-2 font-display text-[10px] font-bold tracking-wider text-amber-300 uppercase transition-colors hover:bg-amber-500/24 hover:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 desktop:h-auto desktop:gap-2 desktop:px-4 desktop:py-2 desktop:text-xs"
            >
              <Compass className="h-3.5 w-3.5 text-amber-400 desktop:h-4 desktop:w-4" />
              <span>Custom</span>
            </button>

            <button
              type="button"
              data-tutorial="tutorial-start-btn"
              disabled={!car.available || !carReady}
              onClick={onStartRace}
              className={`inline-flex h-11 landscape-short:h-9 items-center justify-center gap-1 px-3 font-display text-[11px] font-bold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 desktop:h-auto desktop:gap-2.5 desktop:px-6 desktop:py-2 desktop:text-sm ${
                car.available && carReady
                  ? 'bg-sky-500 text-slate-950 hover:bg-sky-400 shadow-lg'
                  : 'cursor-not-allowed border border-white/12 bg-white/8 text-slate-400'
              }`}
            >
              {car.available ? (
                <>
                  <Play className="h-3.5 w-3.5 fill-current desktop:h-4 desktop:w-4" />
                  <span className="desktop:hidden font-mono-tabular">
                    {carReady ? 'Race' : `${carLoadPct}%`}
                  </span>
                  <span className="hidden desktop:inline">
                    {carReady ? `Start ${activeModeMeta.title}` : `Loading ${carLoadPct}%`}
                  </span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5 desktop:h-4 desktop:w-4" />
                  <span>Soon</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
