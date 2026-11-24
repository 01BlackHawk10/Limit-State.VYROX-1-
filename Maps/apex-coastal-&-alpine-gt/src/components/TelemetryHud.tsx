import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { TelemetrySnapshot, WeatherSettings } from '../engine/CircuitSceneController';
import { MAP_REGISTRY } from '../tracks/mapRegistry';
import type { CameraVantageId, LayoutPresetId, MapId } from '../tracks/types';

type DockTab = 'circuit' | 'cameras' | 'layout' | 'weather' | 'waypoints';

interface TelemetryHudProps {
  mapId: MapId;
  layoutPreset: LayoutPresetId;
  vantage: CameraVantageId;
  editorActive: boolean;
  muted: boolean;
  dockCollapsed: boolean;
  weather: WeatherSettings;
  telemetry: TelemetrySnapshot;
  onSelectMap: (id: MapId) => void;
  onSelectLayout: (preset: LayoutPresetId) => void;
  onSelectVantage: (vantage: CameraVantageId) => void;
  onToggleEditor: (active: boolean) => void;
  onNudgeWaypoint: (index: number, dx: number, dy: number, dz: number) => void;
  onUpdateWeather: (patch: Partial<WeatherSettings>) => void;
  onToggleMute: () => void;
  onToggleDock: () => void;
  onResetCar: () => void;
  onPause: () => void;
}

function formatLapTime(sec: number): string {
  const mins = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${mins}:${rem.toFixed(1).padStart(4, '0')}`;
}

export function TelemetryHud({
  mapId,
  layoutPreset,
  vantage,
  editorActive,
  muted,
  dockCollapsed,
  weather,
  telemetry,
  onSelectMap,
  onSelectLayout,
  onSelectVantage,
  onToggleEditor,
  onNudgeWaypoint,
  onUpdateWeather,
  onToggleMute,
  onToggleDock,
  onResetCar,
  onPause,
}: TelemetryHudProps) {
  const [activeTab, setActiveTab] = useState<DockTab>('circuit');
  const [selectedWaypointIdx, setSelectedWaypointIdx] = useState<number>(
    MAP_REGISTRY[mapId].editableWaypoints[0].index
  );

  const mapDef = MAP_REGISTRY[mapId];
  const validWp =
    mapDef.editableWaypoints.find((w) => w.index === selectedWaypointIdx) ??
    mapDef.editableWaypoints[0];
  const wpCoords = telemetry.controlPoints[validWp.index] ?? [0, 0, 0];
  const rpmPct = Math.min(100, Math.max(0, (telemetry.rpm / 8500) * 100));

  return (
    <div className="fixed inset-0 z-10 pointer-events-none">
      {/* Top-Left Compact Telemetry & Sector Cluster */}
      <div
        className="absolute top-4 left-4 pointer-events-auto px-4 py-3 rounded-lg border border-white/12"
        style={{ backgroundColor: 'rgba(7, 11, 20, 0.86)' }}
      >
        <div className="font-display font-bold text-base text-slate-50 leading-none">
          {mapDef.name}
        </div>
        <div className="mt-1.5 text-xs text-slate-400 font-mono-tabular flex items-center gap-1.5">
          <span style={{ color: mapDef.accent }}>{telemetry.sectorId}</span>
          <span aria-hidden="true">·</span>
          <span>{telemetry.trackLengthKm.toFixed(2)} km</span>
          <span aria-hidden="true">·</span>
          <span>{Math.round(telemetry.elevationDeltaM)} m Δ</span>
        </div>
        <div className="mt-2 pt-2 border-t border-white/10 flex items-baseline gap-4 text-xs font-mono-tabular">
          <div>
            <span className="text-slate-400 mr-1.5">LAP {telemetry.lap}</span>
            <span className="text-slate-100 font-semibold text-sm">
              {formatLapTime(telemetry.lapTime)}
            </span>
          </div>
          {telemetry.bestLapTime !== null && (
            <div>
              <span className="text-slate-400 mr-1.5">BEST</span>
              <span style={{ color: mapDef.accent }} className="font-semibold">
                {formatLapTime(telemetry.bestLapTime)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Top-Right Utility Controls (Mute [M], Reset [R], Pause [P]) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          tabIndex={-1}
          aria-label={muted ? 'Unmute engine audio' : 'Mute engine audio'}
          title="Mute / Unmute [M]"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/12 text-slate-200 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
          style={{ backgroundColor: 'rgba(7, 11, 20, 0.86)' }}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Reset vehicle to start grid"
          title="Reset to Grid [R]"
          onClick={(e) => {
            e.currentTarget.blur();
            onResetCar();
          }}
          className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/12 text-slate-200 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
          style={{ backgroundColor: 'rgba(7, 11, 20, 0.86)' }}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Pause simulation"
          title="Pause [P / Esc]"
          onClick={(e) => {
            e.currentTarget.blur();
            onPause();
          }}
          className="w-10 h-10 flex items-center justify-center rounded-lg border border-white/12 text-slate-200 hover:text-white hover:border-white/30 transition-colors cursor-pointer"
          style={{ backgroundColor: 'rgba(7, 11, 20, 0.86)' }}
        >
          <Pause className="w-4 h-4" />
        </button>
      </div>

      {/* Bottom-Right Speedometer & Gear Cluster */}
      <div
        className="hidden sm:block absolute bottom-5 right-5 pointer-events-auto px-4 py-3 rounded-lg border border-white/12 min-w-[164px]"
        style={{ backgroundColor: 'rgba(7, 11, 20, 0.86)' }}
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-1.5">
            <span
              data-testid="hud-speed"
              className="font-display font-bold text-3xl text-slate-50 font-mono-tabular leading-none"
            >
              {Math.round(telemetry.speedKmh)}
            </span>
            <span className="text-[11px] text-slate-400 font-semibold">KM/H</span>
          </div>
          <span
            className="font-display font-bold text-xl font-mono-tabular"
            style={{ color: mapDef.accent }}
          >
            {telemetry.gear === 0 ? 'R' : `G${telemetry.gear}`}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full transition-[width] duration-75"
            style={{
              width: `${rpmPct}%`,
              backgroundColor: rpmPct > 86 ? '#ef4444' : mapDef.accent,
            }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 font-mono-tabular">
          <span>{telemetry.inPitLane ? 'PIT LANE' : telemetry.onRoad ? 'TARMAC' : 'OFF-TRACK'}</span>
          <span>{telemetry.rpm} RPM</span>
        </div>
      </div>

      {/* Unified Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 w-[min(860px,92vw)] transition-transform duration-200 pointer-events-auto ${
          dockCollapsed ? 'translate-y-[calc(100%+18px)]' : 'translate-y-0'
        }`}
      >
        {/* Collapse / Expand Handle Attached to Top Edge */}
        <div className="flex justify-center mb-1.5">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleDock();
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-white/12 text-xs font-medium text-slate-200 hover:text-white cursor-pointer"
            style={{ backgroundColor: 'rgba(7, 11, 20, 0.9)' }}
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Show Controls [H]</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Hide Controls [H]</span>
              </>
            )}
          </button>
        </div>

        <div
          className="rounded-xl border border-white/12 p-3"
          style={{ backgroundColor: 'rgba(7, 11, 20, 0.92)' }}
        >
          {/* Dock Tabs */}
          <div className="flex items-center gap-1 border-b border-white/10 pb-2 mb-2.5 overflow-x-auto">
            {(
              [
                { id: 'circuit', label: 'Circuit' },
                { id: 'cameras', label: 'Cameras (8)' },
                { id: 'layout', label: 'Layout Presets' },
                { id: 'weather', label: 'Atmosphere' },
                { id: 'waypoints', label: 'Waypoints (9)' },
              ] as { id: DockTab; label: string }[]
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setActiveTab(tab.id);
                    if (tab.id === 'waypoints' && !editorActive) onToggleEditor(true);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Panel Content */}
          {activeTab === 'circuit' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {(['coral_bay', 'frostpeak_pass'] as MapId[]).map((id) => {
                  const def = MAP_REGISTRY[id];
                  const active = mapId === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onSelectMap(id);
                      }}
                      className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                        active
                          ? 'bg-slate-800/95 text-white border-cyan-400'
                          : 'bg-slate-900/60 text-slate-300 border-white/10 hover:border-white/25'
                      }`}
                    >
                      {def.name}
                    </button>
                  );
                })}
              </div>
              <div className="text-xs text-slate-400 font-mono-tabular">
                {telemetry.sectorName}
              </div>
            </div>
          )}

          {activeTab === 'cameras' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSelectVantage('chase');
                }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                  vantage === 'chase'
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'bg-slate-900 text-slate-300 hover:text-white'
                }`}
              >
                Chase Cam [C]
              </button>
              {mapDef.vantages.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectVantage(v.id);
                  }}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                    vantage === v.id
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'bg-slate-900 text-slate-300 hover:text-white'
                  }`}
                >
                  {i + 1}. {v.label}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'layout' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {mapDef.layoutPresets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onSelectLayout(p.id);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                      layoutPreset === p.id
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'bg-slate-900 text-slate-300 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400 font-mono-tabular">
                Locked Pit &amp; Bridge Indices: [{mapDef.lockedControlIndices.join(', ')}]
              </span>
            </div>
          )}

          {activeTab === 'weather' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <label className="flex flex-col gap-1 text-slate-300">
                <span className="flex justify-between font-mono-tabular">
                  <span>Solar Angle</span>
                  <span>{Math.round(weather.solarDeg)}°</span>
                </span>
                <input
                  type="range"
                  min={2}
                  max={65}
                  step={1}
                  value={weather.solarDeg}
                  onChange={(e) => onUpdateWeather({ solarDeg: Number(e.target.value) })}
                  className="gt-slider"
                />
              </label>

              <label className="flex flex-col gap-1 text-slate-300">
                <span className="flex justify-between font-mono-tabular">
                  <span>Atmos Haze</span>
                  <span>{Math.round(weather.haze * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0.05}
                  max={0.75}
                  step={0.05}
                  value={weather.haze}
                  onChange={(e) => onUpdateWeather({ haze: Number(e.target.value) })}
                  className="gt-slider"
                />
              </label>

              <label className="flex flex-col gap-1 text-slate-300">
                <span className="flex justify-between font-mono-tabular">
                  <span>Rain / Wetness</span>
                  <span>{Math.round(weather.wetness * 100)}%</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={weather.wetness}
                  onChange={(e) => onUpdateWeather({ wetness: Number(e.target.value) })}
                  className="gt-slider"
                />
              </label>

              {mapId === 'frostpeak_pass' ? (
                <label className="flex flex-col gap-1 text-slate-300">
                  <span className="flex justify-between font-mono-tabular">
                    <span>Snow Edge</span>
                    <span>{Math.round(weather.snowAccum * 100)}%</span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={weather.snowAccum}
                    onChange={(e) => onUpdateWeather({ snowAccum: Number(e.target.value) })}
                    className="gt-slider"
                  />
                </label>
              ) : (
                <label className="flex flex-col gap-1 text-slate-300">
                  <span className="flex justify-between font-mono-tabular">
                    <span>Ocean Chop</span>
                    <span>{Math.round(weather.waterChop * 100)}%</span>
                  </span>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={weather.waterChop}
                    onChange={(e) => onUpdateWeather({ waterChop: Number(e.target.value) })}
                    className="gt-slider"
                  />
                </label>
              )}
            </div>
          )}

          {activeTab === 'waypoints' && (
            <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleEditor(!editorActive);
                  }}
                  className={`px-2.5 py-1.5 rounded-md font-semibold cursor-pointer ${
                    editorActive
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {editorActive ? '3D Gizmos On' : '3D Gizmos Off'}
                </button>
                <select
                  aria-label="Select editable waypoint"
                  value={validWp.index}
                  onChange={(e) => setSelectedWaypointIdx(Number(e.target.value))}
                  className="bg-slate-900 border border-white/15 rounded-md px-2.5 py-1.5 text-slate-100"
                >
                  {mapDef.editableWaypoints.map((w) => (
                    <option key={w.index} value={w.index}>
                      {w.label}
                    </option>
                  ))}
                </select>
                <span className="text-slate-400 font-mono-tabular hidden sm:inline">
                  ({Math.round(wpCoords[0])}, {wpCoords[1].toFixed(1)}, {Math.round(wpCoords[2])})
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onNudgeWaypoint(validWp.index, -10, 0, 0)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  -X
                </button>
                <button
                  type="button"
                  onClick={() => onNudgeWaypoint(validWp.index, 10, 0, 0)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  +X
                </button>
                <button
                  type="button"
                  onClick={() => onNudgeWaypoint(validWp.index, 0, 1.5, 0)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  +Y
                </button>
                <button
                  type="button"
                  onClick={() => onNudgeWaypoint(validWp.index, 0, -1.5, 0)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  -Y
                </button>
                <button
                  type="button"
                  onClick={() => onNudgeWaypoint(validWp.index, 0, 0, -10)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  -Z
                </button>
                <button
                  type="button"
                  onClick={() => onNudgeWaypoint(validWp.index, 0, 0, 10)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                >
                  +Z
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
