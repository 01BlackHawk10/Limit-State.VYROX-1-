import { Check, Clock, Compass, Flag, MapPin, Play, Snowflake, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import {
  type CarModelId,
  getCircuitPreviewData,
  MAP_LIST,
  type MapId,
  readBestLapMsForMapCar,
  type SnowAtmospherePreset,
} from '../engine/SceneController';
import { formatLapMs } from './MainScreenOverlay';

interface TrackSelectModalProps {
  open: boolean;
  activeMapId: MapId;
  selectedCarId: CarModelId;
  selectedCarName: string;
  eventSummary: string;
  snowAtmosphere: SnowAtmospherePreset;
  onSnowAtmosphereChange: (preset: SnowAtmospherePreset) => void;
  onSelectMap: (mapId: MapId) => void;
  onPrewarmMap?: (mapId: MapId) => void;
  onLaunchRace: (mapId: MapId) => void;
  onClose: () => void;
}

const SNOW_PRESETS: Array<{ id: SnowAtmospherePreset; label: string }> = [
  { id: 'alpine_snow', label: 'Crisp Alpine' },
  { id: 'twilight_storm', label: 'Twilight Storm' },
  { id: 'glacier_sun', label: 'Glacier Sun' },
];

function CircuitPreviewSvg({
  mapId,
  accentHex,
}: {
  mapId: MapId;
  accentHex: string;
}) {
  const preview = useMemo(() => {
    const data = getCircuitPreviewData(mapId);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of data.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const pad = 38;
    minX -= pad;
    maxX += pad;
    minZ -= pad;
    maxZ += pad;

    const mainPath =
      data.points
        .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.z.toFixed(1)}`)
        .join(' ') + ' Z';

    const bridgePath =
      data.bridgeSegment.length >= 2
        ? data.bridgeSegment
            .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.z.toFixed(1)}`)
            .join(' ')
        : '';

    return {
      viewBox: `${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`,
      mainPath,
      bridgePath,
      start: data.startPoint,
    };
  }, [mapId]);

  return (
    <svg
      viewBox={preview.viewBox}
      className="h-24 w-full desktop:h-36"
      aria-label={`${mapId} circuit layout`}
    >
      <path
        d={preview.mainPath}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth={22}
        strokeLinejoin="round"
      />
      <path
        d={preview.mainPath}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={8}
        strokeLinejoin="round"
      />
      {preview.bridgePath && (
        <path
          d={preview.bridgePath}
          fill="none"
          stroke={accentHex}
          strokeWidth={11}
          strokeLinecap="round"
        />
      )}
      <circle
        cx={preview.start.x}
        cy={preview.start.z}
        r={14}
        fill="#ffffff"
        stroke={accentHex}
        strokeWidth={5}
      />
    </svg>
  );
}

export function TrackSelectModal({
  open,
  activeMapId,
  selectedCarId,
  selectedCarName,
  eventSummary,
  snowAtmosphere,
  onSnowAtmosphereChange,
  onSelectMap,
  onPrewarmMap,
  onLaunchRace,
  onClose,
}: TrackSelectModalProps) {
  useEffect(() => {
    if (!open || !onPrewarmMap) return;
    onPrewarmMap(activeMapId);
  }, [open, activeMapId, onPrewarmMap]);

  if (!open) return null;

  const selectedMeta = MAP_LIST.find((m) => m.id === activeMapId) ?? MAP_LIST[0];

  return (
    <div
      className="fixed inset-0 z-40 flex items-end desktop:items-center justify-center bg-[#06080c]/88 p-0 desktop:p-4"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Select Circuit"
    >
      <div className="gt5-panel gt5-carbon flex max-h-[92dvh] desktop:h-auto desktop:max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden">
        <div className="gt5-horizon-rule shrink-0" />
        {/* Header + Real / Custom Category Switcher */}
        <div className="flex items-center justify-between gap-2 border-b border-white/12 bg-black/55 px-2.5 py-2 desktop:px-5 desktop:py-3.5 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Compass className="h-4 w-4 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] font-semibold tracking-[0.18em] text-sky-400 uppercase desktop:text-[10px]">
                Step 1 of 2 · World Circuits
              </p>
              <h2 className="font-display text-xs font-bold tracking-wide text-white uppercase truncate desktop:text-lg">
                {selectedCarName} · {eventSummary}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close track selection"
              className="flex h-10 w-10 desktop:h-9 desktop:w-9 items-center justify-center border border-white/14 bg-white/[0.04] text-slate-300 transition-colors hover:border-sky-400/60 hover:text-white shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Circuit Tiles: compact horizontal rows on mobile, 4-column showcase grid on laptop */}
        <div className="grid flex-1 min-h-0 grid-cols-1 gap-2 overflow-y-auto p-2.5 desktop:grid-cols-4 desktop:gap-4 desktop:p-5">
          {MAP_LIST.map((map) => {
            const isSelected = map.id === activeMapId;
            const bestLapMs = readBestLapMsForMapCar(map.id, selectedCarId);

            return (
              <div
                key={map.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onMouseEnter={() => onPrewarmMap?.(map.id)}
                onFocus={() => onPrewarmMap?.(map.id)}
                onClick={() => onSelectMap(map.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectMap(map.id);
                  }
                }}
                className={`flex cursor-pointer flex-col border p-2 text-left transition-colors desktop:p-4 ${
                  isSelected
                    ? 'border-sky-400 bg-[#0d1624] shadow-xl'
                    : 'border-white/12 bg-[#0a0d14] hover:border-white/30'
                }`}
              >
                {/* Mobile Compact Row + Desktop Stacked Header/Preview */}
                <div className="flex w-full items-center gap-2.5 desktop:block">
                  {/* Mobile left SVG thumbnail */}
                  <div className="w-[74px] shrink-0 border border-white/10 bg-[#06080c] p-1 desktop:hidden">
                    <div className="[&>svg]:h-12">
                      <CircuitPreviewSvg mapId={map.id} accentHex={map.accentHex} />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex w-full items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1 text-[8.5px] font-semibold tracking-[0.14em] uppercase text-slate-400 desktop:gap-1.5 desktop:text-[10px]">
                          <MapPin className="h-2.5 w-2.5 shrink-0 desktop:h-3 desktop:w-3" style={{ color: map.accentHex }} />
                          <span className="truncate">{map.region}</span>
                          {map.isTouge && (
                            <span className="border border-amber-400/50 bg-amber-500/15 px-1 text-[8px] font-bold text-amber-300 shrink-0">
                              TOUGE
                            </span>
                          )}
                        </div>
                        <h3 className="font-display mt-0.5 text-sm font-bold tracking-wide text-white uppercase truncate desktop:text-xl">
                          {map.name}
                        </h3>
                      </div>

                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 bg-sky-500 px-1.5 py-0.5 text-[8.5px] font-bold tracking-wider text-slate-950 uppercase shrink-0 desktop:px-2.5 desktop:py-1 desktop:text-[10px]">
                          <Check className="h-2.5 w-2.5 desktop:h-3 desktop:w-3" />
                          Selected
                        </span>
                      ) : (
                        <span className="border border-white/15 bg-white/[0.04] px-1.5 py-0.5 text-[8.5px] font-semibold tracking-wider text-slate-300 uppercase shrink-0 desktop:px-2.5 desktop:py-1 desktop:text-[10px]">
                          Select
                        </span>
                      )}
                    </div>

                    {/* Mobile compact inline metrics */}
                    <div className="font-mono-tabular mt-1.5 grid w-full grid-cols-3 gap-1.5 border-t border-white/10 pt-1 text-[10px] desktop:hidden">
                      <div className="truncate">
                        <span className="text-[8px] text-slate-400 uppercase mr-1">LEN</span>
                        <span className="font-semibold text-white">{map.lengthLabel}</span>
                      </div>
                      <div className="truncate">
                        <span className="text-[8px] text-slate-400 uppercase mr-1">ELV</span>
                        <span className="font-semibold text-white">{map.elevationLabel}</span>
                      </div>
                      <div className="inline-flex items-center justify-end gap-0.5 font-semibold text-emerald-300 truncate">
                        <Clock className="h-2.5 w-2.5 shrink-0" />
                        <span>{formatLapMs(bestLapMs)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Desktop Live Spline Preview */}
                <div className="hidden desktop:block mt-3 w-full border border-white/10 bg-[#06080c] p-2">
                  <CircuitPreviewSvg mapId={map.id} accentHex={map.accentHex} />
                </div>

                <p className="hidden desktop:block mt-3 text-xs leading-relaxed text-slate-300">
                  {map.tagline}
                </p>

                {/* Desktop Metrics Strip */}
                <div className="font-mono-tabular hidden desktop:grid mt-3 w-full grid-cols-3 gap-2 border-t border-white/10 pt-3 text-xs">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Length</div>
                    <div className="font-semibold text-white">{map.lengthLabel}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Elevation</div>
                    <div className="font-semibold text-white">{map.elevationLabel}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase">Best Lap</div>
                    <div className="inline-flex items-center gap-1 font-semibold text-emerald-300">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>{formatLapMs(bestLapMs)}</span>
                    </div>
                  </div>
                </div>

                {/* Sectors */}
                <div className="mt-2 hidden w-full space-y-1 border-t border-white/10 pt-2 text-[11px] text-slate-300 desktop:mt-3 desktop:block desktop:pt-2.5">
                  {map.sectorLabels.map((sec) => (
                    <div key={sec} className="flex items-center gap-1.5">
                      <Flag className="h-3 w-3 text-slate-500 shrink-0" />
                      <span className="truncate">{sec}</span>
                    </div>
                  ))}
                </div>

                {/* Inline Snow Atmosphere Selector on Frostpeak Glacier when active */}
                {map.id === 'frostpeak_pass' && isSelected && (
                  <div className="mt-1.5 w-full border-t border-sky-400/25 pt-1.5 sm:mt-3 sm:pt-2.5">
                    <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-semibold tracking-wider text-sky-300 uppercase">
                      <Snowflake className="h-3 w-3 shrink-0" />
                      <span>Snow Atmosphere</span>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-1.5">
                      {SNOW_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSnowAtmosphereChange(preset.id);
                          }}
                          className={`min-h-[36px] sm:min-h-0 border px-1.5 py-1 text-[9.5px] sm:text-[10px] font-semibold transition-colors whitespace-nowrap truncate ${
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
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/12 bg-black/55 px-2.5 py-2 landscape-short:py-1.5 desktop:px-5 desktop:py-3.5 shrink-0">
          <div className="hidden text-xs text-slate-400 desktop:block">
            Pit Lane refuel &amp; tire service active on all circuits &amp; game modes.
          </div>

          <div className="flex w-full desktop:w-auto items-center justify-end gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="h-10 landscape-short:h-9 desktop:h-auto border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 whitespace-nowrap shrink-0 desktop:px-4 desktop:py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onLaunchRace(selectedMeta.id)}
              className="inline-flex h-10 landscape-short:h-9 desktop:h-auto flex-1 desktop:flex-initial items-center justify-center gap-1.5 bg-sky-500 px-3.5 py-1.5 font-display text-xs font-bold tracking-wider text-slate-950 uppercase transition-colors hover:bg-sky-400 shadow-lg whitespace-nowrap shrink-0 desktop:gap-2 desktop:px-6 desktop:py-2"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Race Setup · {selectedMeta.shortName}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
