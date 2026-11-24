import {
  Activity,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Compass,
  Cpu,
  Eye,
  Home,
  Laptop,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Smartphone,
  Snowflake,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AppScreenMode,
  CameraPresetId,
  CarModelId,
  CarSetupConfig,
  CctvStationInfo,
  CinematicSettings,
  DEFAULT_CINEMATIC_SETTINGS,
  DrivingCameraMode,
  FilmGradePreset,
  getDefaultCarSetup,
  GraphicsQuality,
  MAP_LIST,
  MAP_REGISTRY,
  MapId,
  PerformanceSnapshot,
  RaceConfig,
  RaceDifficulty,
  RenderScaleOption,
  ShadowQualityOption,
  StartCountdownMode,
  TextureSizeOption,
  TIRE_COMPOUNDS,
  TireCompoundId,
  VEHICLE_SPECS,
  VehicleAssists,
  WeatherAutoPace,
} from '../engine/SceneController';
import { HazePreset, SnowAtmospherePreset, WeatherPreset } from '../Maps/Aurelia Ridge/skyAndLighting';
import { InspectMode } from '../Maps/Aurelia Ridge/terrainBuilder';
import { DEFAULT_HUD_VISIBILITY, type HudVisibilityConfig } from '../shared/socialTypes';
import type {
  DeviceExperienceOverride,
  DeviceExperienceProfile,
} from '../utils/deviceExperience';

export type SettingsTab = 'cameras' | 'setup' | 'driving' | 'environment' | 'performance';

interface SettingsModalProps {
  open: boolean;
  initialTab?: SettingsTab;
  appMode: AppScreenMode;
  activeMapId: MapId;
  selectedCarId: CarModelId;
  raceConfig: RaceConfig;
  isSpectatingFromGarage: boolean;
  assists: VehicleAssists;
  carSetup: CarSetupConfig;
  drivingCamera: DrivingCameraMode;
  audioVolume: number;
  audioMuted: boolean;
  activePreset: CameraPresetId | null;
  isFlyover: boolean;
  isCctv: boolean;
  cctvStations: CctvStationInfo[];
  cctvStationIndex: number;
  cctvAutoSwitch: boolean;
  solarAngle: number;
  phaseLabel: string;
  isAutoCycle: boolean;
  hazePreset: HazePreset;
  weatherPreset: WeatherPreset;
  snowAtmosphere: SnowAtmospherePreset;
  inspectMode: InspectMode;
  postFxEnabled: boolean;
  graphicsQuality: GraphicsQuality;
  shadowQuality: ShadowQualityOption;
  textureSize: TextureSizeOption;
  renderScale: RenderScaleOption;
  cinematicSettings: CinematicSettings;
  weatherAutoProgressPct: number;
  performanceSnapshot: PerformanceSnapshot;
  advancedTelemetryEnabled: boolean;
  onClose: () => void;
  onSelectActiveMap?: (mapId: MapId) => void;
  onToggleAutoManageResources: () => void;
  onPurgeUnusedResources: () => void;
  onToggleAdvancedTelemetry: () => void;
  onRaceConfigChange: (next: RaceConfig) => void;
  onAssistsChange: (next: VehicleAssists) => void;
  onCarSetupChange: (next: CarSetupConfig) => void;
  onDrivingCameraChange: (cam: DrivingCameraMode) => void;
  onAudioVolumeChange: (vol: number) => void;
  onAudioMuteToggle: () => void;
  onSelectPreset: (preset: CameraPresetId) => void;
  onToggleFlyover: () => void;
  onToggleCctv: () => void;
  onCycleCctv: (delta: number) => void;
  onToggleCctvAutoSwitch: () => void;
  onReturnToDrive: () => void;
  onSolarChange: (deg: number) => void;
  onToggleAutoCycle: () => void;
  onHazeChange: (haze: HazePreset) => void;
  onWeatherChange: (weather: WeatherPreset) => void;
  onSnowAtmosphereChange: (preset: SnowAtmospherePreset) => void;
  onInspectChange: (mode: InspectMode) => void;
  onTogglePostFx: () => void;
  onGraphicsQualityChange: (quality: GraphicsQuality) => void;
  onShadowQualityChange: (shadow: ShadowQualityOption) => void;
  onTextureSizeChange: (size: TextureSizeOption) => void;
  onRenderScaleChange: (scale: RenderScaleOption) => void;
  onCinematicSettingsChange: (next: CinematicSettings) => void;
  onCaptureScreenshot: () => void;
  onRestartRace: () => void;
  onExitToGarage: () => void;
  mobileVisibility?: 'auto' | 'always' | 'off';
  mobileSteerMode?: 'arrows' | 'wheel' | 'slider' | 'tilt';
  mobileSteerSensitivity?: number;
  mobileAutoGas?: boolean;
  onMobileVisibilityChange?: (vis: 'auto' | 'always' | 'off') => void;
  onMobileSteerModeChange?: (mode: 'arrows' | 'wheel' | 'slider' | 'tilt') => void;
  onMobileSteerSensitivityChange?: (sensitivity: number) => void;
  onMobileAutoGasChange?: (enabled: boolean) => void;
  onReplayTutorial?: () => void;
  surfaceAudioEnabled?: boolean;
  onSurfaceAudioToggle?: () => void;
  onOpenTuning?: () => void;
  hudVisibility: HudVisibilityConfig;
  onHudVisibilityChange: (next: HudVisibilityConfig) => void;
  activeCustomBlueprintTitle?: string | null;
  deviceProfile?: DeviceExperienceProfile;
  onDeviceOverrideChange?: (next: DeviceExperienceOverride) => void;
}

const COMPOUND_ORDER: TireCompoundId[] = [
  'comfort_hard',
  'sports_medium',
  'sports_soft',
  'racing_hard',
  'racing_medium',
  'racing_soft',
];

const WEATHER_OPTIONS: Array<{ id: WeatherPreset; label: string; desc: string }> = [
  { id: 'dry', label: 'Dry', desc: '100% Grip' },
  { id: 'overcast', label: 'Overcast', desc: '94% Grip' },
  { id: 'rain', label: 'Wet Rain', desc: '72% Grip' },
  { id: 'sunset_storm', label: 'Sunset Storm', desc: '74% Grip · Gale' },
  { id: 'deep_morning_mist', label: 'Morning Mist', desc: '92% Grip · Fog' },
];

const SNOW_ATMOSPHERE_OPTIONS: Array<{
  id: SnowAtmospherePreset;
  label: string;
  desc: string;
}> = [
  { id: 'alpine_snow', label: 'Crisp Alpine', desc: 'Light Snow · 91% Grip' },
  { id: 'twilight_storm', label: 'Twilight Storm', desc: 'Blizzard · 86% Grip' },
  { id: 'glacier_sun', label: 'Glacier Sun', desc: 'Clear Ice · 92% Grip' },
];

const HAZE_OPTIONS: Array<{ id: HazePreset; label: string }> = [
  { id: 'low', label: 'Clear' },
  { id: 'golden', label: 'Balanced' },
  { id: 'heavy', label: 'Dense' },
];

const INSPECT_OPTIONS: Array<{ id: InspectMode; label: string }> = [
  { id: 'lit', label: 'Lit PBR' },
  { id: 'wireframe', label: 'Wireframe' },
  { id: 'elevation', label: 'Elevation' },
];

const DRIVING_CAM_OPTIONS: Array<{ id: DrivingCameraMode; label: string }> = [
  { id: 'chase', label: 'Chase' },
  { id: 'chaseFar', label: 'Chase Far' },
  { id: 'cockpit', label: 'Cockpit' },
  { id: 'windshield', label: 'Windshield' },
  { id: 'hood', label: 'Hood' },
  { id: 'bumper', label: 'Bumper' },
];

const GRAPHICS_QUALITY_OPTIONS: Array<{
  id: GraphicsQuality;
  label: string;
  desc: string;
  badge?: string;
}> = [
  {
    id: 'recommended',
    label: 'Recommended',
    desc: 'Tuned Res · Hardware MSAA · Crisp Road & Cars · High FPS',
    badge: 'BEST',
  },
  { id: 'low', label: 'Low', desc: '1x Res · Hardware MSAA · No Shadows · Max FPS' },
  { id: 'balanced', label: 'Balanced', desc: 'Tuned Res · Hardware MSAA · 1K Shadows · Clean Lighting' },
  { id: 'medium', label: 'Medium', desc: 'High Res · SMAA AA · Bloom + Film LUT · 1K Shadows' },
  { id: 'high', label: 'High', desc: 'Native Res · SMAA AA · 1.5K Shadows + Car SSR' },
  { id: 'max', label: 'Max', desc: 'Native Res · SMAA AA · 2K Shadows + GTAO + SSR' },
  { id: 'ultra', label: 'Ultra', desc: 'Native Res · SMAA AA · 2K Shadows + Full HDR' },
];

const TEXTURE_SIZE_OPTIONS: Array<{ id: TextureSizeOption; label: string; hint: string }> = [
  { id: '512', label: '512px', hint: 'Fastest · Low VRAM' },
  { id: '1024', label: '1024px', hint: 'Crisp · Balanced' },
  { id: '2048', label: '2048px', hint: 'Full Detail' },
];

const SHADOW_QUALITY_OPTIONS: Array<{ id: ShadowQualityOption; label: string; hint: string }> = [
  { id: 'off', label: 'Off', hint: 'Max FPS' },
  { id: 'low', label: 'Low', hint: '512px' },
  { id: 'medium', label: 'Med', hint: '1024px' },
  { id: 'high', label: 'High', hint: '2048px' },
];

const RENDER_SCALE_OPTIONS: Array<{ id: RenderScaleOption; label: string; hint: string }> = [
  { id: 'fast', label: 'Fast', hint: '0.8x–1.0x' },
  { id: 'balanced', label: 'Balanced', hint: '1.0x–1.25x' },
  { id: 'native', label: 'Native', hint: 'Full DPR' },
];

const DIFFICULTY_OPTIONS: Array<{ id: RaceDifficulty; label: string }> = [
  { id: 'novice', label: 'Novice' },
  { id: 'pro', label: 'Pro' },
  { id: 'elite', label: 'Elite' },
];

const COUNTDOWN_OPTIONS: Array<{ id: StartCountdownMode; label: string }> = [
  { id: 'full', label: 'Full (3-2-1)' },
  { id: 'quick', label: 'Quick (1s)' },
  { id: 'instant', label: 'Instant Start' },
];

const FILM_GRADE_OPTIONS: Array<{ id: FilmGradePreset; label: string }> = [
  { id: 'natural', label: 'Natural PBR' },
  { id: 'broadcast', label: 'Broadcast' },
  { id: 'kodak_gold', label: 'Kodak Gold' },
  { id: 'cool_gt', label: 'Cool GT' },
  { id: 'noir', label: 'Noir' },
];

const WEATHER_PACE_OPTIONS: Array<{ id: WeatherAutoPace; label: string; desc: string }> = [
  { id: 'rapid', label: 'Rapid', desc: '90s Cycle' },
  { id: 'sprint', label: 'Sprint', desc: '3m Cycle' },
  { id: 'endurance', label: 'Endurance', desc: '5.5m Cycle' },
];

export function SettingsModal({
  open,
  initialTab = 'cameras',
  appMode,
  activeMapId,
  selectedCarId,
  raceConfig,
  isSpectatingFromGarage,
  assists,
  carSetup,
  drivingCamera,
  audioVolume,
  audioMuted,
  activePreset,
  isFlyover,
  isCctv,
  cctvStations,
  cctvStationIndex,
  cctvAutoSwitch,
  solarAngle,
  phaseLabel,
  isAutoCycle,
  hazePreset,
  weatherPreset,
  snowAtmosphere,
  inspectMode,
  postFxEnabled,
  graphicsQuality,
  shadowQuality,
  textureSize,
  renderScale,
  cinematicSettings,
  weatherAutoProgressPct,
  performanceSnapshot,
  advancedTelemetryEnabled,
  onClose,
  onSelectActiveMap,
  onToggleAutoManageResources,
  onPurgeUnusedResources,
  onToggleAdvancedTelemetry,
  onRaceConfigChange,
  onAssistsChange,
  onCarSetupChange,
  onDrivingCameraChange,
  onAudioVolumeChange,
  onAudioMuteToggle,
  onSelectPreset,
  onToggleFlyover,
  onToggleCctv,
  onCycleCctv,
  onToggleCctvAutoSwitch,
  onReturnToDrive,
  onSolarChange,
  onToggleAutoCycle,
  onHazeChange,
  onWeatherChange,
  onSnowAtmosphereChange,
  onInspectChange,
  onTogglePostFx,
  onGraphicsQualityChange,
  onShadowQualityChange,
  onTextureSizeChange,
  onRenderScaleChange,
  onCinematicSettingsChange,
  onCaptureScreenshot,
  onRestartRace,
  onExitToGarage,
  mobileVisibility = 'auto',
  mobileSteerMode = 'arrows',
  mobileSteerSensitivity = 1.0,
  mobileAutoGas = false,
  onMobileVisibilityChange,
  onMobileSteerModeChange,
  onMobileSteerSensitivityChange,
  onMobileAutoGasChange,
  onReplayTutorial,
  surfaceAudioEnabled = true,
  onSurfaceAudioToggle,
  onOpenTuning,
  hudVisibility,
  onHudVisibilityChange,
  activeCustomBlueprintTitle = null,
  deviceProfile,
  onDeviceOverrideChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [shotSavedFlash, setShotSavedFlash] = useState(false);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  if (!open) return null;

  const activeMapMeta = MAP_REGISTRY[activeMapId];
  const vantageOptions = activeMapMeta.cameraVantages;
  const activeSpec = VEHICLE_SPECS[selectedCarId] ?? VEHICLE_SPECS['bmw-m4-gt3-evo'];
  const activeHp = Math.round(activeSpec.maxPowerWatts / 745.7);
  const activeTorqueNm = Math.round(activeSpec.v8TorqueNm + activeSpec.electricFillNm);
  const activeDifficulty: RaceDifficulty = raceConfig.difficulty ?? 'pro';

  const currentStation = cctvStations[cctvStationIndex] ?? {
    index: 0,
    code: 'CAM 01',
    label: 'Pit Exit',
    trackT: 0.09,
  };

  const handleTakeScreenshot = () => {
    onCaptureScreenshot();
    setShotSavedFlash(true);
    window.setTimeout(() => setShotSavedFlash(false), 1800);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-[#06080c]/88 p-0 sm:p-4"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Game and Environment Settings"
    >
      <div className="gt5-panel gt5-carbon flex h-[96dvh] sm:h-auto sm:max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden">
        <div className="gt5-horizon-rule shrink-0" />
        {/* GT5 Header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/12 bg-black/50 px-3 py-2.5 landscape-short:py-1.5 desktop:px-5 desktop:py-3.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sliders className="h-4 w-4 text-sky-400 shrink-0" />
            <h2 className="font-display text-xs font-bold tracking-wider text-white uppercase desktop:text-lg truncate">
              {appMode === 'racing'
                ? `Pause · ${activeCustomBlueprintTitle || activeMapMeta.shortName}`
                : 'World Cameras, Graphics & Options'}
            </h2>
          </div>

          <div className="flex items-center gap-1.5 desktop:gap-2 shrink-0">
            <button
              type="button"
              onClick={handleTakeScreenshot}
              className="inline-flex h-10 landscape-short:h-8 desktop:h-auto items-center gap-1.5 border border-sky-400/50 bg-sky-500/14 px-3 desktop:px-3 py-1 desktop:py-1.5 text-[11px] desktop:text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/24 whitespace-nowrap shrink-0"
            >
              {shotSavedFlash ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Saved PNG</span>
                </>
              ) : (
                <>
                  <Camera className="h-3.5 w-3.5 text-sky-400" />
                  <span className="hidden desktop:inline">Screenshot (No HUD)</span>
                  <span className="desktop:hidden">Snap</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="flex h-10 w-10 landscape-short:h-8 landscape-short:w-8 desktop:h-8 desktop:w-8 items-center justify-center border border-white/15 bg-white/[0.04] text-slate-300 transition-colors hover:border-sky-400/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* GT5 Horizontal Navigation Ribbon */}
        <nav className="flex overflow-x-auto no-scrollbar desktop:grid desktop:grid-cols-5 border-b border-white/10 bg-black/45 shrink-0">
          {[
            { id: 'cameras' as const, label: 'Map & Cameras' },
            { id: 'setup' as const, label: 'Car Setup' },
            { id: 'driving' as const, label: 'Driving & Audio' },
            { id: 'environment' as const, label: 'Weather & FX' },
            { id: 'performance' as const, label: 'Performance' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[44px] landscape-short:min-h-[38px] desktop:min-h-0 border-b-2 px-3.5 landscape-short:py-1.5 py-2.5 font-display text-[11px] desktop:text-xs font-bold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? 'border-sky-400 bg-sky-500/14 text-white'
                  : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Scrollable Settings Body */}
        <div className="flex-1 min-h-0 space-y-3.5 desktop:space-y-5 overflow-y-auto p-3 landscape-short:p-2.5 desktop:p-5">
          {deviceProfile && onDeviceOverrideChange && (
            <div
              data-testid="settings-device-mode-switcher"
              className="flex flex-wrap items-center justify-between gap-2 border border-sky-400/35 bg-sky-950/25 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                {deviceProfile.isMobileExperience ? (
                  <Smartphone className="h-4 w-4 text-sky-400 shrink-0" />
                ) : (
                  <Laptop className="h-4 w-4 text-sky-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-display text-[11px] font-bold tracking-wider text-sky-300 uppercase">
                    Device Mode
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    Detected: <strong className="text-slate-200 uppercase">{deviceProfile.detectedKind}</strong> · Active: <strong className="text-sky-300 uppercase">{deviceProfile.activeMode}</strong>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'auto', label: `Auto (${deviceProfile.detectedKind})` },
                    { id: 'mobile', label: 'Mobile' },
                    { id: 'laptop', label: 'Laptop' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onDeviceOverrideChange(opt.id)}
                    className={`inline-flex h-9 items-center gap-1 border px-2.5 font-display text-[10px] font-bold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 ${
                      deviceProfile.override === opt.id
                        ? 'border-sky-400 bg-sky-500 text-slate-950'
                        : 'border-white/15 bg-black/50 text-slate-300 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    {opt.id === 'mobile' && <Smartphone className="h-3 w-3" />}
                    {opt.id === 'laptop' && <Laptop className="h-3 w-3" />}
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'setup' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold tracking-wider text-slate-300 uppercase">
                    {activeSpec.shortName} · Real-Time Chassis &amp; Tire Tuning
                  </h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {activeHp.toLocaleString()} HP · {activeTorqueNm} Nm · {activeSpec.massKg.toLocaleString()} kg · Changes apply immediately.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onCarSetupChange(getDefaultCarSetup(selectedCarId))}
                  className="inline-flex h-10 desktop:h-auto items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-sky-400/50 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Default</span>
                </button>
              </div>

              <div>
                <div className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
                  Tire Compound
                </div>
                <div className="mt-2 grid grid-cols-1 min-[400px]:grid-cols-2 gap-2 sm:grid-cols-3">
                  {COMPOUND_ORDER.map((id) => {
                    const meta = TIRE_COMPOUNDS[id];
                    const selected = carSetup.tireCompound === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => onCarSetupChange({ ...carSetup, tireCompound: id })}
                        className={`min-h-[44px] border p-2.5 text-left transition-colors ${
                          selected
                            ? 'border-sky-400 bg-sky-500/20 text-white'
                            : 'border-white/10 bg-black/45 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <div className="text-xs font-semibold">{meta.label}</div>
                        <div className="font-mono-tabular mt-0.5 text-[11px] text-sky-300">
                          {Math.round(meta.gripMult * 100)}% Grip · {meta.wearMult.toFixed(2)}x Wear
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-white/10 bg-black/45 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">Weight Distribution (F : R)</span>
                    <span className="font-mono-tabular text-sky-300">
                      {carSetup.weightDistributionFrontPct}% : {100 - carSetup.weightDistributionFrontPct}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={40}
                    max={60}
                    step={1}
                    value={carSetup.weightDistributionFrontPct}
                    onChange={(e) =>
                      onCarSetupChange({
                        ...carSetup,
                        weightDistributionFrontPct: Number(e.target.value),
                      })
                    }
                    className="sun-slider mt-2.5 w-full"
                  />
                </div>

                <div className="border border-white/10 bg-black/45 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">Tire Grip Trim</span>
                    <span className="font-mono-tabular text-emerald-300">
                      {Math.round(carSetup.tireGripTrim * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.8}
                    max={1.2}
                    step={0.02}
                    value={carSetup.tireGripTrim}
                    onChange={(e) =>
                      onCarSetupChange({
                        ...carSetup,
                        tireGripTrim: Number(e.target.value),
                      })
                    }
                    className="sun-slider mt-2.5 w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-white/10 bg-black/45 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">Suspension Natural Frequency</span>
                    <span className="font-mono-tabular text-sky-300">
                      {carSetup.springRateHz.toFixed(1)} Hz
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1.8}
                    max={4.5}
                    step={0.1}
                    value={carSetup.springRateHz}
                    onChange={(e) =>
                      onCarSetupChange({
                        ...carSetup,
                        springRateHz: Number(e.target.value),
                      })
                    }
                    className="sun-slider mt-2.5 w-full"
                  />
                </div>

                <div className="border border-white/10 bg-black/45 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">Damper Compression Ratio</span>
                    <span className="font-mono-tabular text-sky-300">
                      {Math.round(carSetup.damperRatio * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={1.0}
                    step={0.02}
                    value={carSetup.damperRatio}
                    onChange={(e) =>
                      onCarSetupChange({
                        ...carSetup,
                        damperRatio: Number(e.target.value),
                      })
                    }
                    className="sun-slider mt-2.5 w-full"
                  />
                </div>

                <div className="border border-white/10 bg-black/45 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">Anti-Roll Bar (Front)</span>
                    <span className="font-mono-tabular text-amber-300">
                      Lv. {carSetup.antiRollFront}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={carSetup.antiRollFront}
                    onChange={(e) =>
                      onCarSetupChange({
                        ...carSetup,
                        antiRollFront: Number(e.target.value),
                      })
                    }
                    className="sun-slider mt-2.5 w-full"
                  />
                </div>

                <div className="border border-white/10 bg-black/45 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">Anti-Roll Bar (Rear)</span>
                    <span className="font-mono-tabular text-amber-300">
                      Lv. {carSetup.antiRollRear}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={carSetup.antiRollRear}
                    onChange={(e) =>
                      onCarSetupChange({
                        ...carSetup,
                        antiRollRear: Number(e.target.value),
                      })
                    }
                    className="sun-slider mt-2.5 w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="border border-white/10 bg-black/45 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">Ride Height</span>
                    <span className="font-mono-tabular text-sky-300">
                      {carSetup.rideHeightMm} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={45}
                    max={95}
                    step={1}
                    value={carSetup.rideHeightMm}
                    onChange={(e) =>
                      onCarSetupChange({
                        ...carSetup,
                        rideHeightMm: Number(e.target.value),
                      })
                    }
                    className="sun-slider mt-2.5 w-full"
                  />
                </div>

                <div className="border border-white/10 bg-black/45 p-3.5">
                  {(() => {
                    const frontPct =
                      Math.round(
                        Math.min(68, Math.max(46, 57.5 + carSetup.brakeBalance * 1.8)) * 10,
                      ) / 10;
                    const rearPct = Math.round((100 - frontPct) * 10) / 10;
                    const bbLabel =
                      carSetup.brakeBalance > 0
                        ? `+${carSetup.brakeBalance.toFixed(1)}`
                        : carSetup.brakeBalance.toFixed(1);
                    return (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-200">Brake Bias (F / R)</span>
                          <span className="font-mono-tabular text-sky-300">
                            {bbLabel} · {frontPct.toFixed(1)}% / {rearPct.toFixed(1)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-5}
                          max={5}
                          step={0.5}
                          value={carSetup.brakeBalance}
                          onChange={(e) =>
                            onCarSetupChange({
                              ...carSetup,
                              brakeBalance: Number(e.target.value),
                            })
                          }
                          className="sun-slider mt-2.5 w-full"
                        />
                      </>
                    );
                  })()}
                </div>

                <div className="border border-white/10 bg-black/45 p-3.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">Aero Downforce</span>
                    <span className="font-mono-tabular text-sky-300">
                      {Math.round(carSetup.downforceScale * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.6}
                    max={1.4}
                    step={0.05}
                    value={carSetup.downforceScale}
                    onChange={(e) =>
                      onCarSetupChange({
                        ...carSetup,
                        downforceScale: Number(e.target.value),
                      })
                    }
                    className="sun-slider mt-2.5 w-full"
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === 'driving' && (
            <>
              <div>
                <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Transmission &amp; Driving Assists
                </h3>
                <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <button
                    type="button"
                    onClick={() =>
                      onAssistsChange({ ...assists, autoGear: !assists.autoGear })
                    }
                    className="flex flex-col items-start border border-white/12 bg-black/45 p-3 text-left transition-colors hover:border-sky-400/50"
                  >
                    <span className="text-[11px] text-slate-400">Transmission</span>
                    <span className="mt-0.5 text-sm font-semibold text-white">
                      {assists.autoGear ? 'Automatic (AT)' : 'Manual (E / Q)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onAssistsChange({ ...assists, abs: !assists.abs })}
                    className="flex flex-col items-start border border-white/12 bg-black/45 p-3 text-left transition-colors hover:border-sky-400/50"
                  >
                    <span className="text-[11px] text-slate-400">Anti-Lock Brakes (ABS)</span>
                    <span
                      className={`mt-0.5 text-sm font-semibold ${
                        assists.abs ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {assists.abs ? 'Enabled' : 'Disabled'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onAssistsChange({ ...assists, tcs: !assists.tcs })}
                    className="flex flex-col items-start border border-white/12 bg-black/45 p-3 text-left transition-colors hover:border-sky-400/50"
                  >
                    <span className="text-[11px] text-slate-400">Traction Control (TCS)</span>
                    <span
                      className={`mt-0.5 text-sm font-semibold ${
                        assists.tcs ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {assists.tcs ? 'Enabled' : 'Disabled (Raw)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onAssistsChange({
                        ...assists,
                        hillClimbAssist: !(assists.hillClimbAssist ?? true),
                      })
                    }
                    className="flex flex-col items-start border border-white/12 bg-black/45 p-3 text-left transition-colors hover:border-sky-400/50"
                  >
                    <span className="text-[11px] text-slate-400">Hill-Climb Assist (Slope &gt; 4%)</span>
                    <span
                      className={`mt-0.5 text-sm font-semibold ${
                        (assists.hillClimbAssist ?? true) ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {(assists.hillClimbAssist ?? true)
                        ? 'Enabled (Flat-Ground Parity)'
                        : 'Disabled (Raw Grade)'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="border border-white/10 bg-black/45 p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">Steering Sensitivity</span>
                    <span className="font-mono-tabular text-sky-300">
                      {assists.steerSensitivity.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.6}
                    max={1.4}
                    step={0.05}
                    value={assists.steerSensitivity}
                    onChange={(e) =>
                      onAssistsChange({
                        ...assists,
                        steerSensitivity: Number(e.target.value),
                      })
                    }
                    className="sun-slider mt-3 w-full"
                  />
                </div>

                <div className="border border-white/10 bg-black/45 p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">Gamepad Force Feedback</span>
                    <span className="font-mono-tabular text-sky-300">
                      {Math.round((assists.ffbIntensity ?? 0.75) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={assists.ffbIntensity ?? 0.75}
                    onChange={(e) =>
                      onAssistsChange({
                        ...assists,
                        ffbIntensity: Number(e.target.value),
                      })
                    }
                    className="sun-slider mt-3 w-full"
                  />
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Physics Solver Preset &amp; Pro Telemetry
                </h3>
                <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="border border-white/12 bg-black/45 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        Physics Fidelity (120Hz / 960Hz Substep)
                      </span>
                      <span className="font-mono-tabular text-[10px] font-semibold text-amber-300">
                        IEEE-754 FLOAT
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onAssistsChange({
                            ...assists,
                            physicsPreset: 'simulation',
                            steeringGovernor: false,
                            countersteerAssist: false,
                          })
                        }
                        className={`border px-2.5 py-2 text-left transition-colors ${
                          (assists.physicsPreset ?? 'simulation') === 'simulation'
                            ? 'border-sky-400 bg-sky-500/20 text-white'
                            : 'border-white/10 bg-black/50 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        <div className="text-xs font-semibold">Simulation</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          Raw Pacejka · Governor &amp; CST OFF
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onAssistsChange({
                            ...assists,
                            physicsPreset: 'simcade',
                            steeringGovernor: true,
                            countersteerAssist: true,
                          })
                        }
                        className={`border px-2.5 py-2 text-left transition-colors ${
                          assists.physicsPreset === 'simcade'
                            ? 'border-emerald-400 bg-emerald-500/20 text-white'
                            : 'border-white/10 bg-black/50 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        <div className="text-xs font-semibold">SimCade</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">
                          GT Sport 4-Layer · Governor &amp; CST ON
                        </div>
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onAssistsChange({
                            ...assists,
                            steeringGovernor: !(
                              assists.steeringGovernor ??
                              assists.physicsPreset === 'simcade'
                            ),
                          })
                        }
                        className="border border-white/10 bg-black/50 px-2.5 py-1.5 text-left transition-colors hover:border-sky-400/50"
                      >
                        <div className="text-[10px] text-slate-400">Yaw-Rate Governor</div>
                        <div
                          className={`text-[11px] font-semibold ${
                            (assists.steeringGovernor ??
                            assists.physicsPreset === 'simcade')
                              ? 'text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {(assists.steeringGovernor ??
                          assists.physicsPreset === 'simcade')
                            ? 'ON (Grip Cap)'
                            : 'OFF'}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onAssistsChange({
                            ...assists,
                            countersteerAssist: !(
                              assists.countersteerAssist ??
                              assists.physicsPreset === 'simcade'
                            ),
                          })
                        }
                        className="border border-white/10 bg-black/50 px-2.5 py-1.5 text-left transition-colors hover:border-sky-400/50"
                      >
                        <div className="text-[10px] text-slate-400">Countersteer Assist</div>
                        <div
                          className={`text-[11px] font-semibold ${
                            (assists.countersteerAssist ??
                            assists.physicsPreset === 'simcade')
                              ? 'text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {(assists.countersteerAssist ??
                          assists.physicsPreset === 'simcade')
                            ? 'ON (8° Catch)'
                            : 'OFF'}
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        onAssistsChange({
                          ...assists,
                          autoPitService: !(assists.autoPitService ?? false),
                        })
                      }
                      className="flex flex-col items-start border border-white/12 bg-black/45 p-3 text-left transition-colors hover:border-sky-400/50"
                    >
                      <span className="text-[11px] text-slate-400">
                        Auto Pit Service (Easy Assist)
                      </span>
                      <span
                        className={`mt-0.5 text-sm font-semibold ${
                          assists.autoPitService ? 'text-amber-300' : 'text-sky-300'
                        }`}
                      >
                        {assists.autoPitService
                          ? 'ON (Auto 100% Fuel & Matched Tires)'
                          : 'OFF (Manual Pit Strategy MFD)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={onToggleAdvancedTelemetry}
                      className="flex flex-col items-start border border-white/12 bg-black/45 p-3 text-left transition-colors hover:border-sky-400/50"
                    >
                      <span className="text-[11px] text-slate-400">
                        Physics Diagnostics HUD &amp; 25 Hz CSV Logger
                      </span>
                      <span
                        className={`mt-0.5 text-sm font-semibold ${
                          advancedTelemetryEnabled ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {advancedTelemetryEnabled
                          ? 'Enabled (Substep, Thermal, Self-Test, CSV)'
                          : 'Disabled (Clean GT7 HUD)'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Driving Camera View
                </h3>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {DRIVING_CAM_OPTIONS.map((cam) => (
                    <button
                      key={cam.id}
                      type="button"
                      onClick={() => onDrivingCameraChange(cam.id)}
                      className={`h-10 desktop:h-auto border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        drivingCamera === cam.id
                          ? 'border-sky-400 bg-sky-500 text-slate-950'
                          : 'border-white/12 bg-black/45 text-slate-300 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  AI Rival Pace Difficulty
                </h3>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {DIFFICULTY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onRaceConfigChange({ ...raceConfig, difficulty: opt.id })}
                      className={`h-10 desktop:h-auto border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        activeDifficulty === opt.id
                          ? 'border-amber-400 bg-amber-400 text-slate-950'
                          : 'border-white/12 bg-black/45 text-slate-300 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Race Start Countdown
                </h3>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {COUNTDOWN_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onRaceConfigChange({ ...raceConfig, startCountdownMode: opt.id })
                      }
                      className={`h-10 desktop:h-auto border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        (raceConfig.startCountdownMode ?? 'full') === opt.id
                          ? 'border-sky-400 bg-sky-400 text-slate-950'
                          : 'border-white/12 bg-black/45 text-slate-300 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-white/10 bg-black/45 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                    {audioMuted ? (
                      <VolumeX className="h-4 w-4 text-rose-400" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-sky-400" />
                    )}
                    <span>Race, Radio &amp; Spatial Audio Volume</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-xs text-slate-300">
                      {audioMuted ? 'MUTED' : `${Math.round(audioVolume * 100)}%`}
                    </span>
                    <button
                      type="button"
                      onClick={onAudioMuteToggle}
                      className="h-10 desktop:h-auto border border-white/12 bg-white/5 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/10"
                    >
                      {audioMuted ? 'Unmute' : 'Mute'}
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={audioVolume}
                  onChange={(e) => onAudioVolumeChange(Number(e.target.value))}
                  className="sun-slider mt-3 w-full"
                />
                {onSurfaceAudioToggle && (
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                    <div>
                      <div className="text-xs font-medium text-slate-200">
                        Tire Scrub, Curbs &amp; Surface Audio
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Road texture, rumble strips, gravel &amp; snow synth (disable to save mobile CPU)
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onSurfaceAudioToggle}
                      className={`h-10 desktop:h-auto border px-3 py-1 text-[11px] font-semibold uppercase whitespace-nowrap shrink-0 ${
                        surfaceAudioEnabled
                          ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-300'
                          : 'border-white/15 bg-white/5 text-slate-400'
                      }`}
                    >
                      {surfaceAudioEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                )}
              </div>

              {onMobileVisibilityChange && onMobileSteerModeChange && (
                <div className="border border-white/10 bg-black/45 p-3.5 sm:p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
                      Mobile Touch Controls
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'auto', label: 'Auto (Touch)' },
                          { id: 'always', label: 'Always On' },
                          { id: 'off', label: 'Off' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onMobileVisibilityChange(opt.id)}
                          className={`h-10 desktop:h-auto border px-3 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                            mobileVisibility === opt.id
                              ? 'border-sky-400 bg-sky-500 text-slate-950'
                              : 'border-white/12 bg-black/50 text-slate-300 hover:border-white/30'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                    <span className="text-xs text-slate-300">Touch Steering Style</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'arrows', label: 'Arrow Buttons' },
                          { id: 'wheel', label: 'Virtual Wheel' },
                          { id: 'slider', label: 'Touch Slider' },
                          { id: 'tilt', label: 'Tilt Gyro' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onMobileSteerModeChange(opt.id)}
                          className={`h-10 desktop:h-auto border px-3 py-1 text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                            mobileSteerMode === opt.id
                              ? 'border-amber-400 bg-amber-400 text-slate-950'
                              : 'border-white/12 bg-black/50 text-slate-300 hover:border-white/30'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {onMobileAutoGasChange && (
                    <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                      <div>
                        <span className="text-xs text-slate-200">Mobile Auto-Gas</span>
                        <p className="text-[10.5px] text-slate-400">
                          Accelerates automatically so you only tap Brake, Handbrake &amp; Steer
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onMobileAutoGasChange(!mobileAutoGas)}
                        className={`h-10 desktop:h-auto border px-3 py-1 text-[11px] font-semibold uppercase whitespace-nowrap shrink-0 ${
                          mobileAutoGas
                            ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-300'
                            : 'border-white/15 bg-white/5 text-slate-400'
                        }`}
                      >
                        {mobileAutoGas ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  )}

                  {onMobileSteerSensitivityChange && (
                    <div className="border-t border-white/10 pt-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-300">Touch Steering Sensitivity</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular font-semibold text-amber-300">
                            {mobileSteerSensitivity.toFixed(2)}x
                          </span>
                          {Math.abs(mobileSteerSensitivity - 1.0) >= 0.01 && (
                            <button
                              type="button"
                              onClick={() => onMobileSteerSensitivityChange(1.0)}
                              className="border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 hover:border-white/35 hover:text-white"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={2.0}
                        step={0.05}
                        value={mobileSteerSensitivity}
                        onChange={(e) => onMobileSteerSensitivityChange(parseFloat(e.target.value))}
                        aria-label="Touch Steering Sensitivity"
                        className="sun-slider w-full"
                      />
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>0.50x Smooth</span>
                        <span>1.00x Standard</span>
                        <span>2.00x Sharp</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="border border-white/10 bg-black/45 p-3.5 sm:p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
                      HUD Layout
                    </div>
                    <div className="text-[10.5px] text-slate-400">
                      Show or hide individual on-track instruments.
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onHudVisibilityChange({ ...DEFAULT_HUD_VISIBILITY })}
                      className="h-9 desktop:h-auto border border-sky-400/50 bg-sky-500/15 px-3 py-1 text-[10px] font-bold text-sky-200 uppercase hover:bg-sky-500/25 whitespace-nowrap"
                    >
                      Clean Default
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onHudVisibilityChange({
                          showSpeedometer: true,
                          showGearRpm: true,
                          showLapAndPosition: true,
                          showSectorTimes: true,
                          showMinimap: true,
                          showTelemetryGraph: true,
                          showPartyHud: true,
                          showTrackWeatherStatus: true,
                          showTopActionButtons: true,
                          showMfdDials: true,
                          showEngineHealth: true,
                          showTrackRubber: true,
                        })
                      }
                      className="h-9 desktop:h-auto border border-emerald-400/50 bg-emerald-500/15 px-3 py-1 text-[10px] font-bold text-emerald-200 uppercase hover:bg-emerald-500/25 whitespace-nowrap"
                    >
                      All ON
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onHudVisibilityChange({
                          showSpeedometer: false,
                          showGearRpm: false,
                          showLapAndPosition: false,
                          showSectorTimes: false,
                          showMinimap: false,
                          showTelemetryGraph: false,
                          showPartyHud: false,
                          showTrackWeatherStatus: false,
                          showTopActionButtons: false,
                          showMfdDials: false,
                          showEngineHealth: false,
                          showTrackRubber: false,
                        })
                      }
                      className="h-9 desktop:h-auto border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-bold text-slate-300 uppercase hover:border-white/35 whitespace-nowrap"
                    >
                      All OFF
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      { key: 'showGearRpm', label: 'Gear/RPM' },
                      { key: 'showMinimap', label: 'Track Map' },
                      { key: 'showTelemetryGraph', label: 'Telemetry Graph' },
                      { key: 'showSectorTimes', label: 'Sector Times' },
                      { key: 'showSpeedometer', label: 'Speedometer' },
                      { key: 'showLapAndPosition', label: 'Lap & Position' },
                      { key: 'showPartyHud', label: 'Party Lobby Overlay' },
                      { key: 'showTrackWeatherStatus', label: 'Weather / Surface / Auto' },
                      { key: 'showTopActionButtons', label: 'Tune & Aero Auto Buttons' },
                      { key: 'showMfdDials', label: 'Tire, Fuel & Pit MFD' },
                      { key: 'showEngineHealth', label: 'Engine Health & PSI' },
                      { key: 'showTrackRubber', label: 'Track Rubbering Bar' },
                    ] as Array<{ key: keyof HudVisibilityConfig; label: string }>
                  ).map((item) => {
                    const enabled = hudVisibility[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() =>
                          onHudVisibilityChange({
                            ...hudVisibility,
                            [item.key]: !enabled,
                          })
                        }
                        className={`min-h-[44px] desktop:min-h-0 flex items-center justify-between border px-3 py-2 text-left text-xs transition-colors ${
                          enabled
                            ? 'border-sky-400/60 bg-sky-500/18 text-white'
                            : 'border-white/10 bg-black/55 text-slate-400 hover:border-white/30'
                        }`}
                      >
                        <span className="truncate pr-2">{item.label}</span>
                        <span
                          className={`font-mono-tabular text-[10px] font-bold uppercase shrink-0 ${
                            enabled ? 'text-emerald-300' : 'text-slate-500'
                          }`}
                        >
                          {enabled ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {onReplayTutorial && (
                <div className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-black/45 p-4">
                  <div>
                    <div className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
                      Interactive New-User Tour &amp; On-Track Coach
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      Restart the guided GT5 showroom walkthrough and Lap 1 driving coach.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onReplayTutorial();
                      onClose();
                    }}
                    className="h-10 desktop:h-auto border border-sky-400/60 bg-sky-500/20 px-3.5 py-1.5 text-xs font-bold tracking-wider text-sky-200 uppercase hover:bg-sky-500/35 whitespace-nowrap shrink-0"
                  >
                    Replay Tutorial
                  </button>
                </div>
              )}
            </>
          )}

          {activeTab === 'environment' && (
            <>
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  {activeMapId === 'frostpeak_pass' ? (
                    <>
                      <Snowflake className="h-3.5 w-3.5 text-sky-400" />
                      <span>Winter Snow Atmosphere &amp; Cold Tarmac Grip</span>
                    </>
                  ) : (
                    <>
                      <CloudRain className="h-3.5 w-3.5 text-sky-400" />
                      <span>Track Weather &amp; Tire Grip</span>
                    </>
                  )}
                </div>
                {activeMapId === 'frostpeak_pass' ? (
                  <div className="mt-2.5 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3 sm:gap-2.5">
                    {SNOW_ATMOSPHERE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onSnowAtmosphereChange(opt.id)}
                        className={`border p-3 text-left transition-colors ${
                          snowAtmosphere === opt.id
                            ? 'border-sky-400 bg-sky-500/20 text-white'
                            : 'border-white/10 bg-black/45 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="font-mono-tabular mt-0.5 text-[11px] text-sky-300">
                          {opt.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
                    {WEATHER_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onWeatherChange(opt.id)}
                        className={`border p-3 text-left transition-colors ${
                          weatherPreset === opt.id
                            ? 'border-sky-400 bg-sky-500/20 text-white'
                            : 'border-white/10 bg-black/45 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="font-mono-tabular mt-0.5 text-[11px] text-sky-300">
                          {opt.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-white/10 bg-black/45 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
                    <Sun className="h-4 w-4 text-amber-400" />
                    <span>360° Solar Orbit · {phaseLabel}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-xs text-slate-300">
                      {solarAngle}°
                    </span>
                    <button
                      type="button"
                      onClick={onToggleAutoCycle}
                      className={`inline-flex h-10 desktop:h-auto items-center gap-1 border px-3 py-1 text-xs font-medium transition-colors ${
                        isAutoCycle
                          ? 'border-amber-400/60 bg-amber-500/20 text-amber-300'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:text-white'
                      }`}
                    >
                      {isAutoCycle ? (
                        <>
                          <Pause className="h-3 w-3" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="h-3 w-3" />
                          <span>Auto</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={solarAngle}
                  onChange={(e) => onSolarChange(Number(e.target.value))}
                  className="sun-slider mt-3 w-full"
                />
              </div>

              <div>
                <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Atmospheric Haze
                </h3>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {HAZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onHazeChange(opt.id)}
                      className={`h-10 desktop:h-auto border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        hazePreset === opt.id
                          ? 'border-sky-400 bg-sky-500 text-slate-950'
                          : 'border-white/12 bg-black/45 text-slate-300 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border border-white/10 bg-black/45 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
                      Dynamic Weather
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-slate-400">
                      10% per-lap chance to transition between Dry, Mist &amp; Rain.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-[11px] text-sky-300">
                      {cinematicSettings.dynamicWeatherEnabled ? '10% / Lap' : 'Disabled'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onCinematicSettingsChange({
                          ...cinematicSettings,
                          dynamicWeatherEnabled: !cinematicSettings.dynamicWeatherEnabled,
                        })
                      }
                      className={`h-10 desktop:h-auto border px-3.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        cinematicSettings.dynamicWeatherEnabled
                          ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                          : 'border-white/12 bg-white/5 text-slate-300 hover:text-white'
                      }`}
                    >
                      {cinematicSettings.dynamicWeatherEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="border border-white/10 bg-black/45 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold tracking-wider text-slate-200 uppercase">
                      Automated Weather Progression
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-slate-400">
                      Evolves Dry &rarr; Overcast &rarr; Rain &amp; track grip over time.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-[11px] text-sky-300">
                      {cinematicSettings.weatherAutoEnabled
                        ? `Cycle ${weatherAutoProgressPct}%`
                        : 'Manual Lock'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onCinematicSettingsChange({
                          ...cinematicSettings,
                          weatherAutoEnabled: !cinematicSettings.weatherAutoEnabled,
                        })
                      }
                      className={`h-10 desktop:h-auto border px-3.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        cinematicSettings.weatherAutoEnabled
                          ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                          : 'border-white/12 bg-white/5 text-slate-300 hover:text-white'
                      }`}
                    >
                      {cinematicSettings.weatherAutoEnabled ? 'Auto Active' : 'Manual Only'}
                    </button>
                  </div>
                </div>

                {cinematicSettings.weatherAutoEnabled && (
                  <div className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
                    {WEATHER_PACE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onCinematicSettingsChange({
                            ...cinematicSettings,
                            weatherPace: opt.id,
                          })
                        }
                        className={`min-h-[44px] border p-2 text-left transition-colors ${
                          cinematicSettings.weatherPace === opt.id
                            ? 'border-sky-400 bg-sky-500/20 text-white'
                            : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <div className="text-xs font-semibold">{opt.label}</div>
                        <div className="font-mono-tabular text-[10px] text-sky-300">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-white/10 bg-black/45 p-4 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-200 uppercase">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span>Cinematic Post-FX &amp; Camera Studio</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCinematicSettingsChange({ ...DEFAULT_CINEMATIC_SETTINGS })}
                    className="inline-flex h-10 desktop:h-auto items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset Cinema Defaults</span>
                  </button>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-400 uppercase">
                    Film Color Grade LUT
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {FILM_GRADE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onCinematicSettingsChange({ ...cinematicSettings, filmGrade: opt.id })
                        }
                        className={`h-10 desktop:h-auto border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          cinematicSettings.filmGrade === opt.id
                            ? 'border-amber-400 bg-amber-400 text-slate-950'
                            : 'border-white/12 bg-black/50 text-slate-300 hover:border-white/30 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200">ACES Exposure</span>
                      <span className="font-mono-tabular text-sky-300">
                        {cinematicSettings.exposure.toFixed(2)} EV
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.75}
                      max={1.40}
                      step={0.02}
                      value={cinematicSettings.exposure}
                      onChange={(e) =>
                        onCinematicSettingsChange({
                          ...cinematicSettings,
                          exposure: Number(e.target.value),
                        })
                      }
                      className="sun-slider mt-1.5 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200">Bloom Intensity</span>
                      <span className="font-mono-tabular text-sky-300">
                        {Math.round(cinematicSettings.bloomStrength * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.45}
                      step={0.01}
                      value={cinematicSettings.bloomStrength}
                      onChange={(e) =>
                        onCinematicSettingsChange({
                          ...cinematicSettings,
                          bloomStrength: Number(e.target.value),
                        })
                      }
                      className="sun-slider mt-1.5 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200">Bloom Threshold</span>
                      <span className="font-mono-tabular text-sky-300">
                        {cinematicSettings.bloomThreshold.toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.70}
                      max={1.15}
                      step={0.01}
                      value={cinematicSettings.bloomThreshold}
                      onChange={(e) =>
                        onCinematicSettingsChange({
                          ...cinematicSettings,
                          bloomThreshold: Number(e.target.value),
                        })
                      }
                      className="sun-slider mt-1.5 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200">Lens Vignette</span>
                      <span className="font-mono-tabular text-sky-300">
                        {Math.round(cinematicSettings.vignetteStrength * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.55}
                      step={0.02}
                      value={cinematicSettings.vignetteStrength}
                      onChange={(e) =>
                        onCinematicSettingsChange({
                          ...cinematicSettings,
                          vignetteStrength: Number(e.target.value),
                        })
                      }
                      className="sun-slider mt-1.5 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200">Base Camera FOV</span>
                      <span className="font-mono-tabular text-amber-300">
                        {cinematicSettings.baseFovDeg}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={48}
                      max={74}
                      step={1}
                      value={cinematicSettings.baseFovDeg}
                      onChange={(e) =>
                        onCinematicSettingsChange({
                          ...cinematicSettings,
                          baseFovDeg: Number(e.target.value),
                        })
                      }
                      className="sun-slider mt-1.5 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200">Speed-Sense FOV Boost</span>
                      <span className="font-mono-tabular text-amber-300">
                        {Math.round(cinematicSettings.speedFovBoost * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.05}
                      value={cinematicSettings.speedFovBoost}
                      onChange={(e) =>
                        onCinematicSettingsChange({
                          ...cinematicSettings,
                          speedFovBoost: Number(e.target.value),
                        })
                      }
                      className="sun-slider mt-1.5 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200">Kerb &amp; Speed Camera Shake</span>
                      <span className="font-mono-tabular text-sky-300">
                        {Math.round(cinematicSettings.cameraShake * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.05}
                      value={cinematicSettings.cameraShake}
                      onChange={(e) =>
                        onCinematicSettingsChange({
                          ...cinematicSettings,
                          cameraShake: Number(e.target.value),
                        })
                      }
                      className="sun-slider mt-1.5 w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200">Grandstand Crowd Reactivity</span>
                      <span className="font-mono-tabular text-emerald-300">
                        {Math.round(cinematicSettings.crowdReactivity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.25}
                      max={1.5}
                      step={0.05}
                      value={cinematicSettings.crowdReactivity}
                      onChange={(e) =>
                        onCinematicSettingsChange({
                          ...cinematicSettings,
                          crowdReactivity: Number(e.target.value),
                        })
                      }
                      className="sun-slider mt-1.5 w-full"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-200">Grandstand Crowd Fill Density</span>
                      <span className="font-mono-tabular text-emerald-300">
                        {Math.round(cinematicSettings.crowdDensity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.25}
                      max={1.0}
                      step={0.05}
                      value={cinematicSettings.crowdDensity}
                      onChange={(e) =>
                        onCinematicSettingsChange({
                          ...cinematicSettings,
                          crowdDensity: Number(e.target.value),
                        })
                      }
                      className="sun-slider mt-1.5 w-full"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'cameras' && (
            <>
              <div className="border border-white/10 bg-black/45 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-200 uppercase">
                    <Compass className="h-3.5 w-3.5 text-sky-400" />
                    <span>{activeMapMeta.shortName} · Spectator Cameras</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {onSelectActiveMap && appMode !== 'racing' && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {MAP_LIST.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => onSelectActiveMap(m.id)}
                            className={`h-10 desktop:h-auto border px-3 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                              activeMapId === m.id
                                ? 'border-amber-400 bg-amber-400 text-slate-950'
                                : 'border-white/12 bg-black/50 text-slate-300 hover:border-white/30 hover:text-white'
                            }`}
                          >
                            {m.shortName}
                          </button>
                        ))}
                      </div>
                    )}
                    {(isSpectatingFromGarage ||
                      (appMode === 'racing' && (isCctv || isFlyover || activePreset !== null))) && (
                      <button
                        type="button"
                        onClick={() => {
                          onReturnToDrive();
                          onClose();
                        }}
                        className="h-10 desktop:h-auto bg-sky-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-sky-400 whitespace-nowrap shrink-0"
                      >
                        {appMode === 'garage' ? 'Return to Showroom' : 'Return to Driver Seat'}
                      </button>
                    )}
                  </div>
                </div>

                <p className="mt-1 text-[11px] text-slate-400">
                  Switch circuit vantages, live CCTV, or Aerial Tour.
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {vantageOptions.map((opt) => {
                    const active = activePreset === opt.id && !isFlyover && !isCctv;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          onSelectPreset(opt.id);
                          onClose();
                        }}
                        className={`h-10 desktop:h-auto border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? 'border-sky-400 bg-sky-500 text-slate-950 font-semibold'
                            : 'border-white/12 bg-black/50 text-slate-200 hover:border-white/30'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      onToggleCctv();
                      onClose();
                    }}
                    className={`inline-flex h-10 desktop:h-auto items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      isCctv
                        ? 'border-red-500 bg-red-500 text-white'
                        : 'border-white/12 bg-black/50 text-slate-200 hover:border-white/30'
                    }`}
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>{isCctv ? 'Exit CCTV' : 'Trackside CCTV'}</span>
                  </button>

                  {isCctv && (
                    <div className="flex items-center gap-1 border border-white/12 bg-black/55 px-2 py-1 text-xs">
                      <button
                        type="button"
                        onClick={() => onCycleCctv(-1)}
                        className="flex h-8 w-8 desktop:h-auto desktop:w-auto items-center justify-center p-0.5 text-slate-300 hover:text-white"
                        aria-label="Previous CCTV"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="font-mono-tabular text-slate-200">
                        {currentStation.code}
                      </span>
                      <button
                        type="button"
                        onClick={() => onCycleCctv(1)}
                        className="flex h-8 w-8 desktop:h-auto desktop:w-auto items-center justify-center p-0.5 text-slate-300 hover:text-white"
                        aria-label="Next CCTV"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={onToggleCctvAutoSwitch}
                        className={`ml-1 h-8 desktop:h-auto px-2.5 py-0.5 text-[11px] ${
                          cctvAutoSwitch ? 'bg-sky-500/25 text-sky-300' : 'text-slate-400'
                        }`}
                      >
                        {cctvAutoSwitch ? 'Auto Cut' : 'Hold Cam'}
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      onToggleFlyover();
                      onClose();
                    }}
                    className={`inline-flex h-10 desktop:h-auto items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      isFlyover
                        ? 'border-sky-400 bg-sky-500 text-slate-950'
                        : 'border-white/12 bg-black/50 text-slate-200 hover:border-white/30'
                    }`}
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    <span>{isFlyover ? 'Stop Aerial Tour' : 'Aerial Tour'}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                    <Eye className="h-3.5 w-3.5" />
                    <span>Terrain Inspect Mode</span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {INSPECT_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onInspectChange(opt.id)}
                        className={`h-10 desktop:h-auto border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          inspectMode === opt.id
                            ? 'border-sky-400 bg-sky-500 text-slate-950'
                            : 'border-white/12 bg-black/45 text-slate-300 hover:border-white/30'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                    <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                    <span>Post-Processing</span>
                  </div>
                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={onTogglePostFx}
                      className={`inline-flex h-10 desktop:h-auto items-center gap-2 border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                        postFxEnabled
                          ? 'border-sky-400/55 bg-sky-500/20 text-sky-300'
                          : 'border-white/12 bg-black/45 text-slate-300'
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>{postFxEnabled ? 'Cinematic Post-FX' : 'Raw PBR'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                  <span>Graphics Quality &amp; SSR Preset</span>
                </div>
                <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {GRAPHICS_QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onGraphicsQualityChange(opt.id)}
                      className={`border p-3 text-left transition-colors ${
                        graphicsQuality === opt.id
                          ? 'border-sky-400 bg-sky-500/20 text-white'
                          : 'border-white/10 bg-black/45 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{opt.label}</span>
                        {opt.badge && (
                          <span className="border border-emerald-400/50 bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-emerald-300 uppercase">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      <div className="font-mono-tabular mt-0.5 text-[11px] text-sky-300/90">
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div className="border border-white/10 bg-black/45 p-3">
                    <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      Texture Size
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {TEXTURE_SIZE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onTextureSizeChange(opt.id)}
                          className={`border px-2 py-1.5 text-center transition-colors ${
                            textureSize === opt.id
                              ? 'border-sky-400 bg-sky-500/20 text-white'
                              : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <div className="font-mono-tabular text-[11px] font-bold">{opt.label}</div>
                          <div className="text-[9px] text-slate-400">{opt.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border border-white/10 bg-black/45 p-3">
                    <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      Shadow Quality
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-1">
                      {SHADOW_QUALITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onShadowQualityChange(opt.id)}
                          className={`border px-1.5 py-1.5 text-center transition-colors ${
                            shadowQuality === opt.id
                              ? 'border-sky-400 bg-sky-500/20 text-white'
                              : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <div className="text-[11px] font-bold">{opt.label}</div>
                          <div className="text-[9px] text-slate-400">{opt.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border border-white/10 bg-black/45 p-3">
                    <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      Render Scale
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      {RENDER_SCALE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onRenderScaleChange(opt.id)}
                          className={`border px-2 py-1.5 text-center transition-colors ${
                            renderScale === opt.id
                              ? 'border-sky-400 bg-sky-500/20 text-white'
                              : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <div className="text-[11px] font-bold">{opt.label}</div>
                          <div className="text-[9px] text-slate-400">{opt.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'performance' && (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="border border-white/10 bg-black/45 p-3">
                  <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    Framerate
                  </div>
                  <div
                    className={`font-mono-tabular mt-1 text-2xl font-bold ${
                      performanceSnapshot.fps >= 50
                        ? 'text-emerald-400'
                        : performanceSnapshot.fps >= 34
                        ? 'text-amber-300'
                        : 'text-rose-400'
                    }`}
                  >
                    {performanceSnapshot.fps} FPS
                  </div>
                </div>

                <div className="border border-white/10 bg-black/45 p-3">
                  <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    Avg / p95 Frame
                  </div>
                  <div className="font-mono-tabular mt-1 text-lg font-bold text-white">
                    {performanceSnapshot.avgFrameMs.toFixed(1)}
                    <span className="text-xs text-slate-400">
                      {' '}
                      / {performanceSnapshot.p95FrameMs.toFixed(1)} ms
                    </span>
                  </div>
                </div>

                <div className="border border-white/10 bg-black/45 p-3">
                  <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    Draw Calls / Tris
                  </div>
                  <div className="font-mono-tabular mt-1 text-lg font-bold text-sky-300">
                    {performanceSnapshot.drawCalls}
                    <span className="text-xs text-slate-400">
                      {' '}
                      / {(performanceSnapshot.triangles / 1000).toFixed(0)}k
                    </span>
                  </div>
                </div>

                <div className="border border-white/10 bg-black/45 p-3">
                  <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                    GPU Memory Pools
                  </div>
                  <div className="font-mono-tabular mt-1 text-sm font-bold text-white">
                    {performanceSnapshot.geometries} Geo · {performanceSnapshot.textures} Tex
                  </div>
                  <div className="font-mono-tabular text-[11px] text-slate-400">
                    {performanceSnapshot.programs} Shaders · {performanceSnapshot.pooledCars} Cars
                  </div>
                </div>
              </div>

              <div className="border border-white/10 bg-black/45 p-4">
                <div className="flex items-center justify-between text-xs font-semibold tracking-wider text-slate-300 uppercase">
                  <span className="inline-flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-sky-400" />
                    <span>Main-Loop Subsystem Budget (16.7 ms Target)</span>
                  </span>
                  <span className="font-mono-tabular text-sky-300">
                    {MAP_REGISTRY[performanceSnapshot.activeMapId]?.shortName}
                  </span>
                </div>

                <div className="mt-3 space-y-2.5 text-xs">
                  {[
                    {
                      label: 'WebGL Render & Post-FX',
                      ms: performanceSnapshot.renderMs,
                      color: 'bg-sky-400',
                    },
                    {
                      label: 'World, Water & Spline',
                      ms: performanceSnapshot.worldMs,
                      color: 'bg-emerald-400',
                    },
                    {
                      label: 'Vehicle Physics & AI',
                      ms: performanceSnapshot.physicsMs,
                      color: 'bg-amber-400',
                    },
                    {
                      label: 'HUD Telemetry Sync',
                      ms: performanceSnapshot.uiSyncMs,
                      color: 'bg-violet-400',
                    },
                  ].map((row) => {
                    const pct = Math.min(100, (row.ms / 16.67) * 100);
                    return (
                      <div key={row.label}>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-300">{row.label}</span>
                          <span className="font-mono-tabular font-semibold text-white">
                            {row.ms.toFixed(2)} ms
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden bg-white/10">
                          <div
                            className={`h-full ${row.color}`}
                            style={{ width: `${Math.max(2, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border border-white/10 bg-black/45 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold tracking-wider text-slate-300 uppercase">
                  <span className="inline-flex items-center gap-1.5">
                    <Sliders className="h-3.5 w-3.5 text-sky-400" />
                    <span>Render Performance Toggles (Instant GPU Savings)</span>
                  </span>
                  <span className="font-mono-tabular text-[11px] text-sky-300">
                    {textureSize}px · Shadow: {shadowQuality.toUpperCase()} · Scale: {renderScale}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      Texture Resolution
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                      {TEXTURE_SIZE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onTextureSizeChange(opt.id)}
                          className={`border px-2 py-1.5 text-center transition-colors ${
                            textureSize === opt.id
                              ? 'border-sky-400 bg-sky-500/20 text-white'
                              : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <div className="font-mono-tabular text-[11px] font-bold">{opt.label}</div>
                          <div className="text-[9px] text-slate-400">{opt.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      Shadow Map Quality
                    </div>
                    <div className="mt-1.5 grid grid-cols-4 gap-1">
                      {SHADOW_QUALITY_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onShadowQualityChange(opt.id)}
                          className={`border px-1.5 py-1.5 text-center transition-colors ${
                            shadowQuality === opt.id
                              ? 'border-sky-400 bg-sky-500/20 text-white'
                              : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <div className="text-[11px] font-bold">{opt.label}</div>
                          <div className="text-[9px] text-slate-400">{opt.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                      Render Scale / DPR
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                      {RENDER_SCALE_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onRenderScaleChange(opt.id)}
                          className={`border px-2 py-1.5 text-center transition-colors ${
                            renderScale === opt.id
                              ? 'border-sky-400 bg-sky-500/20 text-white'
                              : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                          }`}
                        >
                          <div className="text-[11px] font-bold">{opt.label}</div>
                          <div className="text-[9px] text-slate-400">{opt.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="border border-white/10 bg-black/45 p-4">
                  <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-slate-300 uppercase">
                    <Cpu className="h-3.5 w-3.5 text-sky-400" />
                    <span>Resource Manager</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Automatically caps DPR or trims heavy post-FX passes during sustained drops, and purges non-active cached car instances.
                  </p>

                  <div className="mt-2 font-mono-tabular text-[11px] text-sky-300">
                    Dynamic Resolution: {Math.round((performanceSnapshot.drsScale ?? 1) * 100)}% ·{' '}
                    {(performanceSnapshot.effectiveDpr ?? 1).toFixed(2)}x DPR
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onToggleAutoManageResources}
                      className={`h-10 desktop:h-auto border px-3 py-1.5 text-xs font-semibold transition-colors ${
                        performanceSnapshot.autoManageEnabled
                          ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-300'
                          : 'border-white/12 bg-white/5 text-slate-300'
                      }`}
                    >
                      Auto-Manage: {performanceSnapshot.autoManageEnabled ? 'Active' : 'Off'}
                      {performanceSnapshot.autoThrottleLevel > 0
                        ? ` (L${performanceSnapshot.autoThrottleLevel})`
                        : ''}
                    </button>

                    <button
                      type="button"
                      onClick={onPurgeUnusedResources}
                      className="inline-flex h-10 desktop:h-auto items-center gap-1.5 border border-amber-400/50 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/25"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Purge Unused Cache</span>
                    </button>
                  </div>
                </div>

                <div className="border border-white/10 bg-black/45 p-4">
                  <div className="flex items-center justify-between text-xs font-semibold tracking-wider text-slate-300 uppercase">
                    <span>Transition &amp; Hitch Log</span>
                    <span className="font-mono-tabular text-[11px] text-sky-300">
                      {performanceSnapshot.lastTransitionLabel} ·{' '}
                      {performanceSnapshot.lastTransitionMs.toFixed(1)} ms
                    </span>
                  </div>

                  {performanceSnapshot.recentSpikes.length === 0 ? (
                    <div className="mt-3 border border-white/8 bg-black/50 px-3 py-2.5 text-xs text-slate-400">
                      No frame spikes above 38 ms recorded in this session.
                    </div>
                  ) : (
                    <div className="mt-2.5 space-y-1">
                      {performanceSnapshot.recentSpikes.map((spk, idx) => (
                        <div
                          key={`${spk.label}-${spk.atSec}-${idx}`}
                          className="font-mono-tabular flex items-center justify-between border-b border-white/8 py-1 text-[11px]"
                        >
                          <span className="truncate text-slate-200">{spk.label}</span>
                          <span className="text-amber-300 shrink-0">
                            {spk.ms.toFixed(1)} ms @ {spk.atSec.toFixed(0)}s
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* GT5 Footer Actions */}
        <div className="flex flex-col landscape-short:flex-row desktop:flex-row desktop:flex-wrap items-stretch landscape-short:items-center desktop:items-center justify-between gap-2 border-t border-white/12 bg-black/50 px-3 py-2.5 landscape-short:py-2 desktop:px-5 desktop:py-3.5 shrink-0">
          {appMode === 'racing' ? (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar desktop:flex-wrap desktop:gap-2">
              {onOpenTuning && (
                <button
                  type="button"
                  onClick={onOpenTuning}
                  className="inline-flex h-10 landscape-short:h-9 desktop:h-auto items-center gap-1.5 border border-sky-400/55 bg-sky-500/18 px-3 desktop:px-3.5 py-1 desktop:py-2 text-[11px] desktop:text-xs font-semibold text-sky-200 hover:bg-sky-500/28 whitespace-nowrap shrink-0"
                >
                  <Sliders className="h-3.5 w-3.5 text-sky-400" />
                  <span>Live Tune &amp; Aero</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onExitToGarage();
                  onClose();
                }}
                className="inline-flex h-10 landscape-short:h-9 desktop:h-auto items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3 desktop:px-3.5 py-1 desktop:py-2 text-[11px] desktop:text-xs font-semibold text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
              >
                <Home className="h-3.5 w-3.5" />
                <span className="desktop:hidden">Garage</span>
                <span className="hidden desktop:inline">Return to Garage</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onRestartRace();
                  onClose();
                }}
                className="inline-flex h-10 landscape-short:h-9 desktop:h-auto items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3 desktop:px-3.5 py-1 desktop:py-2 text-[11px] desktop:text-xs font-semibold text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Restart Grid</span>
              </button>
            </div>
          ) : (
            <span className="hidden desktop:inline text-xs text-slate-400">
              Press H during driving, map customizer, or podium to hide all UI cleanly.
            </span>
          )}

          <button
            type="button"
            onClick={onClose}
            className="h-11 landscape-short:h-9 desktop:h-auto bg-sky-500 px-4 desktop:px-5 py-1.5 desktop:py-2 font-display text-xs font-bold tracking-wider text-slate-950 uppercase transition-colors hover:bg-sky-400 whitespace-nowrap shrink-0"
          >
            {appMode === 'racing' ? 'Resume Driving' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
