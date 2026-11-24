import {
  Camera,
  Check,
  CloudRain,
  Compass,
  Eye,
  Home,
  Play,
  RotateCcw,
  Sliders,
  Snowflake,
  Sparkles,
  Sun,
} from 'lucide-react';
import { useState } from 'react';
import {
  CircuitLayoutPreset,
  CircuitMetrics,
  getDefaultMapCustomization,
  getEditableWaypointsForActiveMap,
  MAP_LIST,
  MAP_REGISTRY,
  MapCustomizationConfig,
  MapId,
} from '../engine/SceneController';
import { SnowAtmospherePreset, WeatherPreset } from '../Maps/Aurelia Ridge/skyAndLighting';

interface MapCustomizerOverlayProps {
  activeMapId: MapId;
  config: MapCustomizationConfig;
  metrics: CircuitMetrics;
  selectedWaypoint: number;
  weatherPreset: WeatherPreset;
  snowAtmosphere: SnowAtmospherePreset;
  solarAngle: number;
  phaseLabel: string;
  isHudHidden: boolean;
  onToggleHudHidden?: () => void;
  cameraMode?: 'overview' | 'top_down';
  onCameraModeChange?: (mode: 'overview' | 'top_down') => void;
  onSelectActiveMap: (mapId: MapId) => void;
  onConfigChange: (next: MapCustomizationConfig, rebuildImmediate?: boolean) => void;
  onSelectWaypoint: (wpIdx: number) => void;
  onApplyRebuild: () => void;
  onResetDefault: () => void;
  onWeatherChange: (w: WeatherPreset) => void;
  onSnowAtmosphereChange: (preset: SnowAtmospherePreset) => void;
  onSolarChange: (deg: number) => void;
  onCaptureScreenshot: () => void;
  onStartRace: () => void;
  onBackToGarage: () => void;
}

const PRESETS: Array<{ id: CircuitLayoutPreset; label: string; desc: string }> = [
  { id: 'original', label: 'Original Spec', desc: 'Factory circuit flow' },
  { id: 'technical_chicanes', label: 'Tech Chicanes', desc: 'Tight hairpins & switchbacks' },
  { id: 'high_speed', label: 'High Speed', desc: 'Sweeping flat-out apexes' },
  { id: 'drift_canyon', label: 'Drift Spec', desc: 'Wide linked canyon arcs' },
];

export function MapCustomizerOverlay({
  activeMapId,
  config,
  metrics,
  selectedWaypoint,
  weatherPreset,
  snowAtmosphere,
  solarAngle,
  phaseLabel,
  isHudHidden,
  onToggleHudHidden,
  cameraMode = 'overview',
  onCameraModeChange,
  onSelectActiveMap,
  onConfigChange,
  onSelectWaypoint,
  onApplyRebuild,
  onResetDefault,
  onWeatherChange,
  onSnowAtmosphereChange,
  onSolarChange,
  onCaptureScreenshot,
  onStartRace,
  onBackToGarage,
}: MapCustomizerOverlayProps) {
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  if (isHudHidden) {
    return null;
  }

  const activeMapMeta = MAP_REGISTRY[activeMapId];
  const editableWaypoints = getEditableWaypointsForActiveMap();
  const currentWpMeta =
    editableWaypoints.find((w) => w.index === selectedWaypoint) ??
    editableWaypoints[0];
  const wpOffset = config.waypointOffsets[currentWpMeta.index] ?? { dx: 0, dz: 0 };
  const wpBankDeg = config.waypointBanking?.[currentWpMeta.index] ?? 0;

  const setWpOffset = (dx: number, dz: number) => {
    onConfigChange(
      {
        ...config,
        waypointOffsets: {
          ...config.waypointOffsets,
          [currentWpMeta.index]: { dx, dz },
        },
      },
      false,
    );
  };

  const setWpBanking = (deg: number) => {
    onConfigChange(
      {
        ...config,
        waypointBanking: {
          ...(config.waypointBanking ?? {}),
          [currentWpMeta.index]: deg,
        },
      },
      false,
    );
  };

  const toggleFeature = (key: keyof MapCustomizationConfig['features']) => {
    onConfigChange(
      {
        ...config,
        features: {
          ...config.features,
          [key]: !config.features[key],
        },
      },
      true,
    );
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 flex h-[100dvh] flex-col justify-between overflow-hidden p-2 sm:p-4"
      style={{
        paddingTop: 'max(0.45rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.45rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      {/* GT5 Course Maker Top Command Bar (Always Sticky & Compact) */}
      <header
        data-testid="customizer-top-bar"
        className="pointer-events-auto gt5-panel shrink-0 overflow-hidden"
      >
        <div className="gt5-horizon-rule" />
        <div className="flex flex-col gap-1 px-2.5 py-1.5 sm:px-4 sm:py-2">
          {/* Primary Command Row */}
          <div className="flex items-center justify-between gap-1.5 sm:gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <Compass className="h-3.5 w-3.5 text-amber-400 shrink-0 sm:h-4 sm:w-4" />
              <div className="min-w-0">
                <h2 className="font-display text-xs font-bold tracking-wider text-white uppercase truncate sm:text-base">
                  {activeMapMeta.shortName}
                  <span className="hidden sm:inline"> · Course Maker</span>
                </h2>
                <p className="font-mono-tabular hidden text-[11px] text-slate-400 truncate md:block">
                  {metrics.lengthKm} km · {metrics.roadWidthM}m Tarmac · {metrics.elevationDeltaM}m ΔElev · Drag 3D corner pins
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setMobileToolsOpen((prev) => !prev)}
                className={`sm:hidden inline-flex h-10 landscape-short:h-8 items-center gap-1 border px-2.5 text-[11px] font-bold uppercase whitespace-nowrap shrink-0 ${
                  mobileToolsOpen
                    ? 'border-amber-400 bg-amber-500 text-slate-950'
                    : 'border-white/20 bg-white/[0.06] text-white'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>{mobileToolsOpen ? 'Hide' : 'Tools'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onCameraModeChange?.(cameraMode === 'top_down' ? 'overview' : 'top_down')
                }
                title="Toggle Top-Down / Reset 3D Camera"
                className={`inline-flex h-10 landscape-short:h-8 sm:h-8 items-center gap-1 border px-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 sm:px-2.5 sm:text-xs ${
                  cameraMode === 'top_down'
                    ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                    : 'border-white/15 bg-white/[0.04] text-slate-200 hover:border-sky-400/50 hover:text-white'
                }`}
              >
                <Compass className="h-3.5 w-3.5 text-sky-400" />
                <span className="sm:hidden">{cameraMode === 'top_down' ? '3D' : 'Top'}</span>
                <span className="hidden sm:inline">
                  {cameraMode === 'top_down' ? '3D Reset' : 'Top View'}
                </span>
              </button>

              <button
                type="button"
                onClick={onCaptureScreenshot}
                title="Capture Screenshot"
                className="hidden md:inline-flex h-8 items-center gap-1.5 border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-slate-200 hover:border-sky-400/60 hover:text-white whitespace-nowrap shrink-0"
              >
                <Camera className="h-3.5 w-3.5 text-sky-400" />
                <span>Screenshot</span>
              </button>

              <button
                type="button"
                onClick={onResetDefault}
                title="Reset Circuit"
                className="inline-flex h-10 landscape-short:h-8 sm:h-8 items-center gap-1 border border-white/15 bg-white/[0.04] px-2.5 text-[11px] font-semibold text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0 sm:px-2.5 sm:text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>

              <button
                type="button"
                onClick={onBackToGarage}
                className="inline-flex h-10 landscape-short:h-8 sm:h-8 items-center gap-1 border border-white/15 bg-white/[0.04] px-2.5 text-[11px] font-semibold text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0 sm:px-3 sm:text-xs"
              >
                <Home className="h-3.5 w-3.5" />
                <span>Garage</span>
              </button>

              {onToggleHudHidden && (
                <button
                  type="button"
                  onClick={onToggleHudHidden}
                  aria-label="Hide UI"
                  title="Hide UI (H)"
                  className="inline-flex h-10 w-10 landscape-short:h-8 landscape-short:w-8 sm:h-8 sm:w-8 items-center justify-center border border-white/15 bg-white/[0.04] text-sky-300 hover:bg-white/10 hover:text-white shrink-0"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}

              <button
                type="button"
                onClick={onStartRace}
                className="inline-flex h-10 landscape-short:h-8 sm:h-8 items-center gap-1 bg-sky-500 px-3 font-display text-[11px] font-bold tracking-wider text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap shrink-0 sm:px-3.5 sm:text-xs"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span className="sm:hidden">Race</span>
                <span className="hidden sm:inline">Race Track</span>
              </button>
            </div>
          </div>

          {/* Secondary Circuit Selector Bar */}
          <div className="flex items-center gap-1.5 border-t border-white/8 pt-1 overflow-x-auto no-scrollbar">
            {MAP_LIST.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectActiveMap(m.id)}
                className={`min-h-[36px] landscape-short:min-h-[30px] sm:min-h-0 border px-2.5 py-1 sm:py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeMapId === m.id
                    ? 'border-sky-400 bg-sky-500/25 text-white'
                    : 'border-white/10 bg-black/40 text-slate-300 hover:text-white'
                }`}
              >
                {m.shortName}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Left Control Inspector leaving 3D Circuit View Open (Hidden when H hides inspector) */}
      <div className="my-1 flex min-h-0 flex-1 items-start justify-between gap-4 overflow-hidden sm:py-2">
        {!isHudHidden && (
          <aside
            className={`pointer-events-auto gt5-panel gt5-carbon max-h-[56dvh] landscape-short:max-h-full landscape-short:max-w-[320px] sm:max-h-full w-full sm:max-w-sm space-y-3 overflow-y-auto p-3 sm:space-y-4 sm:p-4 ${
              mobileToolsOpen ? 'block' : 'hidden sm:block'
            }`}
          >
          {/* 1. Layout Presets */}
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] text-amber-300 uppercase">
              <Compass className="h-3.5 w-3.5" />
              <span>Track Layout Presets</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    onConfigChange(
                      {
                        ...getDefaultMapCustomization(),
                        ...config,
                        preset: p.id,
                        waypointOffsets: {},
                        waypointBanking: {},
                      },
                      true,
                    )
                  }
                  className={`min-h-[44px] sm:min-h-0 border p-2 text-left transition-colors ${
                    config.preset === p.id
                      ? 'border-amber-400 bg-amber-500/18 text-white'
                      : 'border-white/10 bg-black/45 text-slate-300 hover:border-white/25'
                  }`}
                >
                  <div className="text-xs font-semibold">{p.label}</div>
                  <div className="text-[10px] text-slate-400">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Corner Waypoint Offset Editor */}
          <div className="border-t border-white/10 pt-3">
            <div className="flex items-center justify-between text-[10px] font-semibold tracking-[0.18em] text-sky-300 uppercase">
              <span>Corner Waypoint Editor</span>
              <span className="font-mono-tabular text-slate-400">
                #{currentWpMeta.index}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5 sm:gap-1">
              {editableWaypoints.map((wp) => (
                <button
                  key={wp.index}
                  type="button"
                  onClick={() => onSelectWaypoint(wp.index)}
                  className={`min-h-[38px] sm:min-h-0 border px-2.5 py-1 text-[11px] sm:text-[10px] font-semibold transition-colors whitespace-nowrap ${
                    selectedWaypoint === wp.index
                      ? 'border-amber-400 bg-amber-500 text-slate-950'
                      : 'border-white/10 bg-black/45 text-slate-300 hover:border-white/30'
                  }`}
                >
                  {wp.label.split(' ')[0]}
                </button>
              ))}
            </div>

            <div className="mt-2.5 space-y-2 border border-white/10 bg-black/50 p-2.5 text-xs">
              <div className="font-medium text-white">{currentWpMeta.label}</div>
              <div>
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>East / West Offset (dX)</span>
                  <span className="font-mono-tabular text-amber-300">{wpOffset.dx} m</span>
                </div>
                <input
                  type="range"
                  min={-55}
                  max={55}
                  step={2}
                  value={wpOffset.dx}
                  onChange={(e) => setWpOffset(Number(e.target.value), wpOffset.dz)}
                  className="sun-slider mt-1 w-full"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>North / South Offset (dZ)</span>
                  <span className="font-mono-tabular text-amber-300">{wpOffset.dz} m</span>
                </div>
                <input
                  type="range"
                  min={-55}
                  max={55}
                  step={2}
                  value={wpOffset.dz}
                  onChange={(e) => setWpOffset(wpOffset.dx, Number(e.target.value))}
                  className="sun-slider mt-1 w-full"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-slate-300">
                  <span>Corner Banking Angle</span>
                  <span className="font-mono-tabular text-sky-300">
                    {wpBankDeg > 0 ? `+${wpBankDeg}°` : `${wpBankDeg}°`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-12}
                  max={18}
                  step={1}
                  value={wpBankDeg}
                  onChange={(e) => setWpBanking(Number(e.target.value))}
                  className="sun-slider mt-1 w-full"
                />
              </div>
            </div>
          </div>

          {/* 3. Track Geometry & Grip */}
          <div className="space-y-2.5 border-t border-white/10 pt-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] text-slate-300 uppercase">
              <Sliders className="h-3.5 w-3.5 text-sky-400" />
              <span>Track Geometry &amp; Grip</span>
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>Spline Curvature Tension</span>
                <span className="font-mono-tabular text-amber-300">
                  {(config.splineTension ?? 0.45).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0.15}
                max={0.75}
                step={0.05}
                value={config.splineTension ?? 0.45}
                onChange={(e) =>
                  onConfigChange({ ...config, splineTension: Number(e.target.value) }, false)
                }
                className="sun-slider mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>Tarmac Road Width</span>
                <span className="font-mono-tabular text-sky-300">{config.roadWidth.toFixed(1)} m</span>
              </div>
              <input
                type="range"
                min={12}
                max={20}
                step={0.5}
                value={config.roadWidth}
                onChange={(e) =>
                  onConfigChange({ ...config, roadWidth: Number(e.target.value) }, false)
                }
                className="sun-slider mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>Corner Banking Scale</span>
                <span className="font-mono-tabular text-sky-300">{config.bankingScale.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.4}
                max={1.6}
                step={0.1}
                value={config.bankingScale}
                onChange={(e) =>
                  onConfigChange({ ...config, bankingScale: Number(e.target.value) }, false)
                }
                className="sun-slider mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>Surface Tire Grip Scale</span>
                <span className="font-mono-tabular text-emerald-300">{Math.round(config.gripScale * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.75}
                max={1.2}
                step={0.05}
                value={config.gripScale}
                onChange={(e) =>
                  onConfigChange({ ...config, gripScale: Number(e.target.value) }, true)
                }
                className="sun-slider mt-1 w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>Rumble Kerb Height</span>
                <span className="font-mono-tabular text-sky-300">{config.kerbHeightScale.toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.8}
                step={0.1}
                value={config.kerbHeightScale}
                onChange={(e) =>
                  onConfigChange({ ...config, kerbHeightScale: Number(e.target.value) }, false)
                }
                className="sun-slider mt-1 w-full"
              />
            </div>

            <div className="border-t border-white/10 pt-2.5">
              <div className="mb-1.5 text-[10px] font-semibold tracking-[0.16em] text-sky-300 uppercase">
                Surface &amp; Environment Look
              </div>

              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-300">
                    <span>Asphalt Aggregate Wear</span>
                    <span className="font-mono-tabular text-sky-300">
                      {Math.round((config.asphaltWear ?? 0.35) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.asphaltWear ?? 0.35}
                    onChange={(e) =>
                      onConfigChange({ ...config, asphaltWear: Number(e.target.value) }, false)
                    }
                    className="sun-slider mt-1 w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-300">
                    <span>Trackside Foliage Density</span>
                    <span className="font-mono-tabular text-emerald-300">
                      {Math.round((config.foliageDensity ?? 1.0) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.35}
                    max={1.25}
                    step={0.05}
                    value={config.foliageDensity ?? 1.0}
                    onChange={(e) =>
                      onConfigChange({ ...config, foliageDensity: Number(e.target.value) }, false)
                    }
                    className="sun-slider mt-1 w-full"
                  />
                </div>

                {activeMapId === 'frostpeak_pass' ? (
                  <>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>Glacier &amp; Snow Sheen</span>
                        <span className="font-mono-tabular text-sky-300">
                          {Math.round((config.snowSheen ?? 0.65) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={config.snowSheen ?? 0.65}
                        onChange={(e) =>
                          onConfigChange({ ...config, snowSheen: Number(e.target.value) }, false)
                        }
                        className="sun-slider mt-1 w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>Road Snow Accumulation</span>
                        <span className="font-mono-tabular text-sky-300">
                          {Math.round((config.snowAccumRate ?? 1.0) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.1}
                        value={config.snowAccumRate ?? 1.0}
                        onChange={(e) =>
                          onConfigChange({ ...config, snowAccumRate: Number(e.target.value) }, false)
                        }
                        className="sun-slider mt-1 w-full"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>Water Surface Chop</span>
                        <span className="font-mono-tabular text-sky-300">
                          {Math.round((config.waterChop ?? 0.45) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={config.waterChop ?? 0.45}
                        onChange={(e) =>
                          onConfigChange({ ...config, waterChop: Number(e.target.value) }, false)
                        }
                        className="sun-slider mt-1 w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-300">
                        <span>Water Optical Clarity</span>
                        <span className="font-mono-tabular text-sky-300">
                          {Math.round((config.waterClarity ?? 0.65) * 100)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={config.waterClarity ?? 0.65}
                        onChange={(e) =>
                          onConfigChange({ ...config, waterClarity: Number(e.target.value) }, false)
                        }
                        className="sun-slider mt-1 w-full"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* 4. Custom Track Modules */}
          <div className="border-t border-white/10 pt-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] text-amber-300 uppercase">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Custom Track Modules</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {[
                { key: 'nightFloodlights' as const, label: 'Night Floodlights' },
                { key: 'speedTrapGates' as const, label: 'Speed Trap Gates' },
                { key: 'chicaneBarriers' as const, label: 'Chicane Barriers' },
                { key: 'driftClippingZones' as const, label: 'Drift Clip Zones' },
              ].map((mod) => {
                const enabled = config.features[mod.key];
                return (
                  <button
                    key={mod.key}
                    type="button"
                    onClick={() => toggleFeature(mod.key)}
                    className={`flex min-h-[42px] sm:min-h-0 items-center justify-between border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      enabled
                        ? 'border-sky-400/75 bg-sky-500/18 text-white'
                        : 'border-white/10 bg-black/45 text-slate-400'
                    }`}
                  >
                    <span>{mod.label}</span>
                    {enabled && <Check className="h-3 w-3 text-sky-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. Weather & Sun */}
          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
              <span className="inline-flex items-center gap-1">
                {activeMapId === 'frostpeak_pass' ? (
                  <>
                    <Snowflake className="h-3 w-3 text-sky-400" />
                    Snow Mode
                  </>
                ) : (
                  <>
                    <CloudRain className="h-3 w-3 text-sky-400" />
                    Weather
                  </>
                )}
              </span>
              <span className="inline-flex items-center gap-1 text-amber-300">
                <Sun className="h-3 w-3" />
                {phaseLabel} ({solarAngle}°)
              </span>
            </div>
            {activeMapId === 'frostpeak_pass' ? (
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'alpine_snow', label: 'Alpine' },
                    { id: 'twilight_storm', label: 'Storm' },
                    { id: 'glacier_sun', label: 'Glacier Sun' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onSnowAtmosphereChange(preset.id)}
                    className={`min-h-[40px] sm:min-h-0 border py-1 text-[10px] font-semibold uppercase ${
                      snowAtmosphere === preset.id
                        ? 'border-sky-400 bg-sky-500/20 text-white'
                        : 'border-white/10 bg-black/45 text-slate-300'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {(
                  [
                    { id: 'dry', label: 'Dry' },
                    { id: 'overcast', label: 'Overcast' },
                    { id: 'rain', label: 'Rain' },
                    { id: 'sunset_storm', label: 'Sunset Storm' },
                    { id: 'deep_morning_mist', label: 'Morning Mist' },
                  ] as const
                ).map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onWeatherChange(w.id)}
                    className={`min-h-[40px] sm:min-h-0 border py-1 text-[10px] font-semibold uppercase ${
                      weatherPreset === w.id
                        ? 'border-sky-400 bg-sky-500/20 text-white'
                        : 'border-white/10 bg-black/45 text-slate-300'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            )}
            <input
              type="range"
              min={0}
              max={360}
              step={2}
              value={solarAngle}
              onChange={(e) => onSolarChange(Number(e.target.value))}
              className="sun-slider w-full"
            />
          </div>

          <button
            type="button"
            onClick={onApplyRebuild}
            className="w-full min-h-[44px] bg-amber-500 py-2.5 font-display text-xs font-bold tracking-wider text-slate-950 uppercase transition-colors hover:bg-amber-400"
          >
            Apply &amp; Rebuild 3D Circuit
          </button>
          </aside>
        )}

        <div className="hidden lg:block" />
      </div>

      {/* Bottom Tip & Persistent Quick-Apply (Always Sticky & Immune to H) */}
      <footer
        data-testid="customizer-bottom-bar"
        className="pointer-events-none shrink-0 flex items-center justify-between gap-2 pt-1 sm:justify-end"
      >
        <div className="gt5-panel pointer-events-auto flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-slate-300 sm:px-3 sm:py-1.5 sm:text-[11px]">
          <span className="sm:hidden">
            {metrics.lengthKm} km · Drag 3D pins
          </span>
          <span className="hidden sm:inline">
            {isHudHidden
              ? 'Inspector Hidden · Press H to Show Inspector'
              : 'Drag 3D corner pins directly · Orbit Left-drag · Pan Right-drag · Scroll Zoom · H Hides Inspector'}
          </span>
        </div>
        <button
          type="button"
          onClick={onApplyRebuild}
          className="pointer-events-auto h-10 landscape-short:h-8 bg-amber-500 px-3.5 font-display text-[11px] font-bold tracking-wider text-slate-950 uppercase hover:bg-amber-400 whitespace-nowrap shrink-0 sm:hidden"
        >
          Apply Track
        </button>
      </footer>
    </div>
  );
}
