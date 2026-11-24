import {
  ArrowLeft,
  ArrowUpDown,
  CloudRain,
  Compass,
  Flag,
  Flame,
  Gauge,
  Ghost,
  Package,
  Play,
  Sliders,
  Snowflake,
  Sun,
  Timer,
  Trophy,
  X,
} from 'lucide-react';
import {
  TOFU_STORY_CHAPTERS,
  type TofuStoryChapter,
} from '../data/tofuStory';
import type { GhostBattleMode } from '../engine/ghostManager';
import {
  type CarModelId,
  type GameMode,
  MAP_REGISTRY,
  type MapId,
  type RaceConfig,
  type RaceDifficulty,
  resolveStintEconomics,
  type SnowAtmospherePreset,
  type StartCountdownMode,
  type StintStrategyPreset,
  VEHICLE_SPECS,
} from '../engine/SceneController';
import { isTougeMapId, type TougeDirection } from '../Maps/mapRegistry';
import type { WeatherPreset } from '../Maps/Aurelia Ridge/skyAndLighting';
import type { UserProgressData } from '../shared/socialTypes';

export const GAME_MODE_DEFS: Array<{
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
  {
    id: 'tofu_delivery',
    title: 'Tofu Delivery',
    subtitle: 'Fragile water-cup delivery · Snap jerks & hard wall hits spill cargo',
    defaultLaps: 1,
    allowUnlimited: false,
  },
];

export const DIFFICULTY_OPTIONS: Array<{ id: RaceDifficulty; label: string; desc: string }> = [
  { id: 'novice', label: 'Novice', desc: 'Clean pace · Forgiving gaps' },
  { id: 'pro', label: 'Pro', desc: 'Slipstream & corner apex battle' },
  { id: 'elite', label: 'Elite', desc: 'Aggressive passes & late braking' },
];

export const COUNTDOWN_OPTIONS: Array<{ id: StartCountdownMode; label: string; desc: string }> = [
  { id: 'full', label: 'Full 3-2-1', desc: 'Classic 3s GT grid lights' },
  { id: 'quick', label: 'Quick 1s', desc: 'Fast 1-second rolling launch' },
  { id: 'instant', label: 'Instant', desc: 'Zero countdown delay' },
];

export const LAP_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: '1 Lap' },
  { value: 3, label: '3 Laps' },
  { value: 5, label: '5 Laps' },
  { value: 10, label: '10 Laps' },
  { value: 20, label: '20 Laps' },
  { value: 60, label: '60 Laps' },
  { value: 0, label: 'Unlimited' },
];

export const STINT_PRESETS: Array<{
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

const WEATHER_OPTIONS: Array<{ id: WeatherPreset; label: string }> = [
  { id: 'dry', label: 'Clear Dry' },
  { id: 'overcast', label: 'Overcast' },
  { id: 'rain', label: 'Rain' },
  { id: 'sunset_storm', label: 'Storm' },
  { id: 'deep_morning_mist', label: 'Dense Mist' },
];

const SNOW_PRESETS: Array<{ id: SnowAtmospherePreset; label: string }> = [
  { id: 'alpine_snow', label: 'Crisp Alpine' },
  { id: 'twilight_storm', label: 'Twilight Storm' },
  { id: 'glacier_sun', label: 'Glacier Sun' },
];

const TIME_PRESETS: Array<{ label: string; deg: number }> = [
  { label: 'Dawn', deg: 14 },
  { label: 'Morning', deg: 42 },
  { label: 'Noon', deg: 82 },
  { label: 'Sunset', deg: 166 },
  { label: 'Midnight', deg: 265 },
];

interface RaceSetupModalProps {
  open: boolean;
  targetTitle: string;
  targetSubtitle?: string;
  isCustomBlueprint?: boolean;
  closedLoop?: boolean;
  activeMapId: MapId;
  selectedCarId: CarModelId;
  selectedCarName: string;
  carPpLabel?: string;
  raceConfig: RaceConfig;
  weatherPreset: WeatherPreset;
  snowAtmosphere: SnowAtmospherePreset;
  solarAngle: number;
  tougeDirection?: TougeDirection;
  ghostMode?: GhostBattleMode;
  tofuStoryProgress?: UserProgressData['tofuStoryProgress'];
  canChangeTrack?: boolean;
  onRaceConfigChange: (config: RaceConfig) => void;
  onWeatherChange: (weather: WeatherPreset) => void;
  onSnowAtmosphereChange: (preset: SnowAtmospherePreset) => void;
  onSolarChange: (deg: number) => void;
  onTougeDirectionChange?: (dir: TougeDirection) => void;
  onGhostModeChange?: (mode: GhostBattleMode) => void;
  onSelectTofuChapter?: (chapter: TofuStoryChapter) => void;
  onChangeTrack?: () => void;
  onOpenCarSelect?: () => void;
  onConfirmStartMatch: () => void;
  onClose: () => void;
}

export function RaceSetupModal({
  open,
  targetTitle,
  targetSubtitle,
  isCustomBlueprint = false,
  closedLoop = true,
  activeMapId,
  selectedCarId,
  selectedCarName,
  carPpLabel,
  raceConfig,
  weatherPreset,
  snowAtmosphere,
  solarAngle,
  tougeDirection = 'downhill',
  ghostMode = 'off',
  tofuStoryProgress,
  canChangeTrack = false,
  onRaceConfigChange,
  onWeatherChange,
  onSnowAtmosphereChange,
  onSolarChange,
  onTougeDirectionChange,
  onGhostModeChange,
  onSelectTofuChapter,
  onChangeTrack,
  onOpenCarSelect,
  onConfirmStartMatch,
  onClose,
}: RaceSetupModalProps) {
  if (!open) return null;

  const isTouge = !isCustomBlueprint && isTougeMapId(activeMapId);

  const activeMapMeta = MAP_REGISTRY[activeMapId];
  const activeModeMeta =
    GAME_MODE_DEFS.find((m) => m.id === raceConfig.mode) ?? GAME_MODE_DEFS[0];
  const activeDifficulty: RaceDifficulty = raceConfig.difficulty ?? 'pro';
  const carTankLiters = VEHICLE_SPECS[selectedCarId]?.fuelMaxLiters ?? 92;
  const stintEcon = resolveStintEconomics(raceConfig, carTankLiters, selectedCarId);
  const currentStints = Math.max(1, raceConfig.targetStints ?? stintEcon.targetStints);

  const handleSelectMode = (mode: GameMode) => {
    if (!closedLoop && (mode === 'sprint' || mode === 'endurance')) return;
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
      mode === 'endurance'
        ? 12
        : nextLaps > 0 && nextLaps <= 6
        ? 1
        : mode === 'sprint'
        ? 2
        : raceConfig.targetStints ?? 2;
    const nextPreset: StintStrategyPreset | undefined =
      mode === 'endurance' && nextLaps === 60 && nextStints === 12
        ? 'endurance'
        : nextLaps === 20 && nextStints === 1
        ? 'realistic'
        : nextLaps === 20 && nextStints === 2
        ? 'sprint'
        : undefined;
    if (mode === 'tofu_delivery') {
      const targetChapter =
        TOFU_STORY_CHAPTERS.find((c) => c.id === raceConfig.tofuChapterId) ??
        TOFU_STORY_CHAPTERS[0];
      if (onSelectTofuChapter) {
        onSelectTofuChapter(targetChapter);
        return;
      }
      onRaceConfigChange({
        ...raceConfig,
        mode: 'tofu_delivery',
        lapCount: 1,
        tofuChapterId: targetChapter.id,
        tofuFragility: targetChapter.spillSensitivity,
        tofuChapterRewardCr: targetChapter.rewardCr,
      });
      return;
    }
    onRaceConfigChange({
      ...raceConfig,
      mode,
      lapCount: closedLoop ? nextLaps : 0,
      difficulty: activeDifficulty,
      targetStints: nextStints,
      strategyPreset: nextPreset,
      startCountdownMode: raceConfig.startCountdownMode ?? 'full',
    });
  };

  const applyStintPreset = (preset: (typeof STINT_PRESETS)[number]) => {
    if (!closedLoop) return;
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

  const activeWeatherLabel =
    WEATHER_OPTIONS.find((w) => w.id === weatherPreset)?.label ?? 'Clear Dry';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end desktop:items-center justify-center bg-[#05070b]/90 p-0 desktop:p-4"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Mandatory Race Setup"
    >
      <div className="gt5-panel gt5-carbon flex max-h-[92dvh] desktop:h-auto desktop:max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden">
        <div className="gt5-horizon-rule shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/12 bg-black/60 px-2.5 py-2 landscape-short:py-1.5 desktop:px-5 desktop:py-3.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sliders className="h-3.5 w-3.5 text-sky-400 shrink-0 sm:h-4 sm:w-4" />
            <div className="min-w-0">
              <p className="hidden desktop:block text-[10px] font-bold tracking-[0.2em] text-amber-300 uppercase">
                Mandatory Pre-Match Setup
              </p>
              <h2 className="font-display text-xs font-bold tracking-wide text-white uppercase truncate desktop:text-lg">
                Race Setup · {targetTitle}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <div className="hidden desktop:flex items-center gap-2 border border-white/12 bg-black/50 px-2.5 py-1 text-[11px] text-slate-300">
              <Flag className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              <span className="font-semibold text-white truncate max-w-[200px]">
                {selectedCarName}
              </span>
              {carPpLabel && (
                <span className="font-mono-tabular text-sky-300">{carPpLabel} PP</span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cancel race setup"
              className="flex h-10 w-10 landscape-short:h-9 landscape-short:w-9 desktop:h-8 desktop:w-8 items-center justify-center border border-white/14 bg-white/[0.04] text-slate-300 transition-colors hover:border-sky-400/60 hover:text-white shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Setup Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-2.5 landscape-short:p-2 space-y-2.5 desktop:p-5 desktop:space-y-4">
          {/* Active Track & Car Strip */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 border border-white/12 bg-black/45 px-2.5 py-1.5 text-[11px] desktop:px-3 desktop:py-2 desktop:text-xs">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <Compass className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="font-display font-bold text-white uppercase truncate">{targetTitle}</span>
              <span className="hidden desktop:inline text-slate-500">·</span>
              <span className="hidden desktop:inline text-slate-300">
                {targetSubtitle ??
                  (isCustomBlueprint
                    ? closedLoop
                      ? 'Custom Closed Circuit'
                      : 'Point-to-Point Sprint'
                    : `${activeMapMeta.region} · ${activeMapMeta.lengthLabel}`)}
              </span>
              <span className="desktop:hidden text-slate-500">·</span>
              <span className="desktop:hidden text-slate-200 truncate max-w-[140px]">{selectedCarName}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenCarSelect && (
                <button
                  type="button"
                  onClick={onOpenCarSelect}
                  className="inline-flex h-8 desktop:h-auto items-center gap-1 border border-white/20 bg-white/[0.05] px-2.5 py-1 font-display text-[9.5px] desktop:text-[10px] font-bold tracking-wider text-slate-200 uppercase hover:border-sky-400/60 hover:text-white whitespace-nowrap shrink-0"
                >
                  <span>Car</span>
                </button>
              )}
              {canChangeTrack && onChangeTrack && (
                <button
                  type="button"
                  onClick={onChangeTrack}
                  className="inline-flex h-8 desktop:h-auto items-center gap-1 border border-sky-400/45 bg-sky-500/12 px-2.5 py-1 font-display text-[9.5px] desktop:text-[10px] font-bold tracking-wider text-sky-200 uppercase hover:bg-sky-500/24 whitespace-nowrap shrink-0"
                >
                  <ArrowLeft className="h-3 w-3" />
                  <span>Circuit</span>
                </button>
              )}
            </div>
          </div>

          {/* Touge Pass Direction Selector */}
          {isTouge && onTougeDirectionChange && (
            <div className="flex flex-wrap items-center justify-between gap-2 border border-amber-400/35 bg-amber-500/8 px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <ArrowUpDown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="font-display font-bold text-amber-200 uppercase tracking-wider">
                  Mountain Pass Direction
                </span>
                <span className="hidden sm:inline text-[11px] text-slate-300">
                  Point-to-point downhill descent or uphill climb
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {(['downhill', 'uphill'] as const).map((dir) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => onTougeDirectionChange(dir)}
                    className={`h-8 border px-3 font-display text-[11px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0 ${
                      tougeDirection === dir
                        ? 'border-amber-400 bg-amber-400 text-slate-950'
                        : 'border-white/15 bg-black/50 text-slate-300 hover:border-amber-400/60'
                    }`}
                  >
                    {dir === 'downhill' ? 'Downhill Run' : 'Uphill Climb'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 1. Game Mode */}
          <div>
            <div className="flex items-center justify-between text-[11px] desktop:text-xs mb-1.5 desktop:mb-2">
              <span className="font-semibold tracking-wider text-slate-300 uppercase">
                1. Event Mode
              </span>
              {!closedLoop && (
                <span className="font-mono-tabular text-[10px] text-amber-300">
                  Point-to-Point Touge Course
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5 desktop:grid-cols-5 desktop:gap-2">
              {GAME_MODE_DEFS.map((mode) => {
                const disabled = !closedLoop && (mode.id === 'sprint' || mode.id === 'endurance');
                const selected = raceConfig.mode === mode.id;
                const Icon =
                  mode.id === 'time_trial'
                    ? Timer
                    : mode.id === 'sprint'
                    ? Trophy
                    : mode.id === 'endurance'
                    ? Gauge
                    : mode.id === 'tofu_delivery'
                    ? Package
                    : Flame;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSelectMode(mode.id)}
                    className={`flex min-h-[42px] desktop:min-h-0 flex-col items-start justify-center desktop:justify-start border px-2.5 py-2 text-left transition-colors desktop:p-3 ${
                      disabled
                        ? 'cursor-not-allowed border-white/8 bg-black/25 text-slate-500 opacity-50'
                        : selected
                        ? mode.id === 'tofu_delivery'
                          ? 'border-amber-400 bg-amber-500/20 text-white'
                          : 'border-sky-400 bg-sky-500/18 text-white'
                        : 'border-white/12 bg-black/40 text-slate-300 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="font-display text-[11px] desktop:text-xs font-bold uppercase tracking-wide">
                        {mode.title}
                      </span>
                      <Icon
                        className={`h-3.5 w-3.5 desktop:h-4 desktop:w-4 shrink-0 ${
                          selected
                            ? mode.id === 'tofu_delivery'
                              ? 'text-amber-300'
                              : 'text-sky-400'
                            : 'text-slate-400'
                        }`}
                      />
                    </div>
                    <p className="hidden desktop:block mt-1 text-[11px] leading-snug text-slate-300/90">
                      {mode.subtitle}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tofu Delivery Story Chapters */}
          {raceConfig.mode === 'tofu_delivery' && (
            <div className="border border-amber-400/35 bg-black/55 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-amber-400" />
                  <span className="font-display text-xs font-bold tracking-wider text-amber-300 uppercase">
                    Fujiwara Tofu Story · Select Run
                  </span>
                </div>
                <span className="font-mono-tabular text-[10px] text-slate-300">
                  Best driven in 1983 Toyota AE86 Trueno · Keep water cup intact!
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
                {TOFU_STORY_CHAPTERS.map((chap) => {
                  const selected = (raceConfig.tofuChapterId ?? TOFU_STORY_CHAPTERS[0].id) === chap.id;
                  const record = tofuStoryProgress?.[chap.id];
                  return (
                    <button
                      key={chap.id}
                      type="button"
                      onClick={() => onSelectTofuChapter?.(chap)}
                      className={`border p-2 text-left transition-colors ${
                        selected
                          ? 'border-amber-400 bg-amber-500/18 text-white'
                          : 'border-white/12 bg-black/45 text-slate-300 hover:border-amber-400/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono-tabular text-[9.5px] font-bold text-amber-300 uppercase">
                          CH.{chap.chapterNumber} · {chap.direction}
                        </span>
                        {record?.grade && (
                          <span className="border border-emerald-400/50 bg-emerald-500/20 px-1 font-mono-tabular text-[9px] font-bold text-emerald-300">
                            {record.grade}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 font-display text-[11px] font-bold text-white truncate">
                        {chap.title}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400 line-clamp-2 leading-tight">
                        {chap.description}
                      </div>
                      <div className="mt-1.5 flex items-center justify-between font-mono-tabular text-[9.5px] text-slate-300">
                        <span>Frag {chap.spillSensitivity.toFixed(2)}x</span>
                        <span className="text-emerald-300">+CR {chap.rewardCr.toLocaleString()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Stint Strategy & Distance */}
          <div className="border-t border-white/10 pt-2.5 sm:pt-3.5 space-y-2 sm:space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] sm:text-xs">
              <span className="font-semibold tracking-wider text-slate-300 uppercase">
                2. Distance · {lapSummaryLabel}
              </span>
              <span className="font-mono-tabular text-[10px] text-emerald-300 sm:text-[11px]">
                ~{stintEcon.lapsPerStint.toFixed(1)} L/Stint ·{' '}
                {stintEcon.consumptionPerLap.toFixed(1)} L/Lap ·{' '}
                {stintEcon.mileageKmPerL.toFixed(2)} km/L
              </span>
            </div>
            <div className="font-mono-tabular flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border border-white/10 bg-black/45 px-2.5 py-1.5 text-[10px] text-slate-300">
              <span>
                Fuel: <strong className="text-emerald-300">{stintEcon.raceFuelLPer100Km.toFixed(1)} L/100km</strong> · Tank {carTankLiters}L ({stintEcon.estimatedTankRangeKm} km)
              </span>
              <span>
                Tires: <strong className="text-amber-300">{stintEcon.tireWearMult.toFixed(2)}x wear</strong> · Stint {stintEcon.tireStintRangeKm} km
              </span>
            </div>

            {closedLoop && (
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {STINT_PRESETS.map((preset) => {
                  const isActive =
                    raceConfig.strategyPreset === preset.id ||
                    (raceConfig.lapCount === preset.laps && currentStints === preset.stints);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyStintPreset(preset)}
                      className={`min-h-[42px] sm:min-h-0 border px-2 py-1.5 sm:px-2.5 sm:py-2 text-left transition-colors ${
                        isActive
                          ? 'border-sky-400 bg-sky-500/18 text-white'
                          : 'border-white/12 bg-black/40 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      <div className="font-display text-[10.5px] sm:text-xs font-bold uppercase truncate">
                        {preset.id === 'sprint' ? 'Sprint' : preset.label}
                      </div>
                      <div className="font-mono-tabular mt-0.5 text-[9px] sm:text-[10px] text-slate-400 truncate">
                        {preset.laps}L · {preset.stints}S
                        <span className="hidden sm:inline"> ({preset.desc.split('·')[1]?.trim() ?? ''})</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-1 min-w-0 flex-wrap items-center gap-1 sm:gap-1.5">
                {LAP_OPTIONS.filter(
                  (opt) =>
                    (closedLoop || opt.value === 0) &&
                    (opt.value !== 0 || activeModeMeta.allowUnlimited),
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      onRaceConfigChange({
                        ...raceConfig,
                        lapCount: opt.value,
                        targetStints:
                          opt.value > 0 && opt.value <= 6
                            ? 1
                            : opt.value >= 60
                            ? Math.max(raceConfig.targetStints ?? 12, 6)
                            : raceConfig.targetStints,
                        strategyPreset: undefined,
                      })
                    }
                    className={`h-9 desktop:h-auto border px-2.5 py-1 font-mono-tabular text-[10.5px] sm:text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      raceConfig.lapCount === opt.value
                        ? 'border-sky-400 bg-sky-500 text-slate-950'
                        : 'border-white/12 bg-black/40 text-slate-200 hover:border-white/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}

                {closedLoop && (
                  <label className="inline-flex h-9 desktop:h-auto items-center gap-1.5 border border-white/18 bg-black/60 px-2 py-1 text-[10.5px] text-slate-300">
                    <span className="font-semibold uppercase tracking-wider text-slate-400 text-[9.5px]">
                      Custom
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={raceConfig.lapCount === 0 ? '' : raceConfig.lapCount}
                      placeholder="Laps"
                      aria-label="Custom lap count"
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10);
                        if (!Number.isFinite(raw)) return;
                        const clamped = Math.max(1, Math.min(999, raw));
                        onRaceConfigChange({
                          ...raceConfig,
                          lapCount: clamped,
                          targetStints:
                            clamped <= 6
                              ? 1
                              : clamped >= 60
                              ? Math.max(raceConfig.targetStints ?? 12, 6)
                              : raceConfig.targetStints,
                          strategyPreset: undefined,
                        });
                      }}
                      className="font-mono-tabular w-12 bg-transparent text-right text-xs font-bold text-amber-300 focus:outline-none"
                    />
                    <span className="hidden sm:inline font-mono-tabular text-[9.5px] text-sky-400">
                      ?laps={raceConfig.lapCount === 0 ? 'unlimited' : raceConfig.lapCount}
                    </span>
                  </label>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9.5px] font-semibold tracking-wider text-slate-400 uppercase sm:text-[11px]">
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
                  className="flex h-9 w-9 desktop:h-7 desktop:w-7 items-center justify-center border border-white/15 bg-white/5 text-sm font-bold text-slate-200 hover:border-sky-400/60"
                  aria-label="Decrease target stints"
                >
                  -
                </button>
                <span className="font-mono-tabular min-w-[18px] text-center text-xs font-bold text-sky-300">
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
                  className="flex h-9 w-9 desktop:h-7 desktop:w-7 items-center justify-center border border-white/15 bg-white/5 text-sm font-bold text-slate-200 hover:border-sky-400/60"
                  aria-label="Increase target stints"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* 3. AI Difficulty & Start Countdown */}
          <div className="grid grid-cols-1 gap-2.5 border-t border-white/10 pt-2.5 sm:pt-3.5 md:grid-cols-2 md:gap-4">
            <div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs mb-1.5">
                <span className="font-semibold tracking-wider text-slate-300 uppercase">
                  3. AI Difficulty
                </span>
                <span className="font-mono-tabular text-amber-300 uppercase">
                  {activeDifficulty}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {DIFFICULTY_OPTIONS.map((opt) => {
                  const selected = activeDifficulty === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onRaceConfigChange({ ...raceConfig, difficulty: opt.id })}
                      className={`min-h-[38px] sm:min-h-[44px] border px-2 py-1.5 sm:px-3 sm:py-2 text-center sm:text-left transition-colors ${
                        selected
                          ? 'border-amber-400 bg-amber-500/18 text-white'
                          : 'border-white/12 bg-black/40 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      <div className="font-display text-[10.5px] sm:text-xs font-bold uppercase">{opt.label}</div>
                      <div className="hidden sm:block mt-0.5 text-[10px] text-slate-400 leading-tight">
                        {opt.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs mb-1.5">
                <span className="font-semibold tracking-wider text-slate-300 uppercase">
                  4. Countdown
                </span>
                <span className="font-mono-tabular text-sky-300 uppercase">
                  {raceConfig.startCountdownMode ?? 'full'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {COUNTDOWN_OPTIONS.map((opt) => {
                  const selected = (raceConfig.startCountdownMode ?? 'full') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onRaceConfigChange({ ...raceConfig, startCountdownMode: opt.id })
                      }
                      className={`min-h-[38px] sm:min-h-[44px] border px-2 py-1.5 sm:px-3 sm:py-2 text-center sm:text-left transition-colors ${
                        selected
                          ? 'border-sky-400 bg-sky-500/18 text-white'
                          : 'border-white/12 bg-black/40 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      <div className="font-display text-[10.5px] sm:text-xs font-bold uppercase">{opt.label}</div>
                      <div className="hidden sm:block mt-0.5 text-[10px] text-slate-400 leading-tight">
                        {opt.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. Weather & Track Lighting Conditions */}
          <div className="grid grid-cols-1 gap-2.5 border-t border-white/10 pt-2.5 sm:pt-3.5 md:grid-cols-2 md:gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs mb-1.5">
                <CloudRain className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                <span className="font-semibold tracking-wider text-slate-300 uppercase">
                  5. Weather
                </span>
              </div>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar sm:flex-wrap sm:gap-1.5">
                {WEATHER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onWeatherChange(opt.id)}
                    className={`h-9 desktop:h-auto border px-2.5 py-1 text-[10.5px] sm:text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      weatherPreset === opt.id
                        ? 'border-sky-400 bg-sky-500/20 text-white'
                        : 'border-white/12 bg-black/40 text-slate-300 hover:border-white/30'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {!isCustomBlueprint && activeMapId === 'frostpeak_pass' && (
                <div className="mt-2 border-t border-white/10 pt-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-sky-300 uppercase mb-1">
                    <Snowflake className="h-3 w-3 shrink-0" />
                    <span>Snow Atmosphere</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SNOW_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onSnowAtmosphereChange(preset.id)}
                        className={`h-9 desktop:h-auto border px-2 py-1 text-[10px] font-semibold transition-colors whitespace-nowrap truncate ${
                          snowAtmosphere === preset.id
                            ? 'border-sky-400 bg-sky-500/25 text-white'
                            : 'border-white/12 bg-black/40 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] sm:text-xs mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Sun className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="font-semibold tracking-wider text-slate-300 uppercase">
                    6. Time of Day
                  </span>
                </div>
                <span className="font-mono-tabular text-amber-300">
                  {Math.round(solarAngle)}°
                </span>
              </div>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar sm:flex-wrap sm:gap-1.5">
                {TIME_PRESETS.map((preset) => {
                  const active = Math.abs(solarAngle - preset.deg) < 12;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => onSolarChange(preset.deg)}
                      className={`h-9 desktop:h-auto border px-2.5 py-1 text-[10.5px] sm:text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'border-amber-400 bg-amber-500/20 text-white'
                          : 'border-white/12 bg-black/40 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 7. Ghost Battle Mode */}
          {onGhostModeChange && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 sm:pt-3">
              <div className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                <Ghost className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                <span className="font-semibold tracking-wider text-slate-300 uppercase">
                  7. Ghost Battle
                </span>
                <span className="hidden sm:inline text-[11px] text-slate-400">
                  Race your saved Personal Best hologram or Touge Rival ghost
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {([
                  { id: 'off', label: 'Off' },
                  { id: 'pb', label: 'Personal Best' },
                  { id: 'rival', label: 'Touge Rival' },
                ] as const).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onGhostModeChange(g.id)}
                    className={`h-9 desktop:h-auto border px-2.5 py-1 text-[10.5px] sm:text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      ghostMode === g.id
                        ? 'border-sky-400 bg-sky-500/20 text-white'
                        : 'border-white/12 bg-black/40 text-slate-300 hover:border-white/30'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-row items-center justify-between gap-2 border-t border-white/12 bg-black/65 px-2.5 py-2 landscape-short:py-1.5 desktop:px-5 desktop:py-3.5 shrink-0">
          <div className="hidden desktop:block font-mono-tabular text-[11px] text-slate-300 truncate">
            <span className="text-white font-semibold">{activeModeMeta.title}</span>
            <span className="mx-1.5 text-slate-500">·</span>
            <span className="text-sky-300">{lapSummaryLabel}</span>
            <span className="mx-1.5 text-slate-500">·</span>
            <span className="text-amber-300 uppercase">{activeDifficulty}</span>
            <span className="mx-1.5 text-slate-500">·</span>
            <span className="text-slate-300">{activeWeatherLabel}</span>
          </div>

          <div className="flex w-full desktop:w-auto items-center justify-end gap-2 ml-auto shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-10 landscape-short:h-9 desktop:h-auto border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0 desktop:px-4 desktop:py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="confirm-race-setup-launch-btn"
              onClick={onConfirmStartMatch}
              className="inline-flex h-10 landscape-short:h-9 desktop:h-auto flex-1 desktop:flex-initial items-center justify-center gap-1.5 bg-sky-500 px-3.5 py-1.5 font-display text-xs font-bold tracking-wider text-slate-950 uppercase transition-colors hover:bg-sky-400 shadow-lg whitespace-nowrap shrink-0 desktop:gap-2 desktop:px-6 desktop:py-2"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Start Match</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
