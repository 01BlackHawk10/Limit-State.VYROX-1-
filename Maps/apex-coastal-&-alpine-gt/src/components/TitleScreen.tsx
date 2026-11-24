import { MAP_REGISTRY } from '../tracks/mapRegistry';
import type { MapId } from '../tracks/types';

interface TitleScreenProps {
  selectedMap: MapId;
  onSelectMap: (mapId: MapId) => void;
  onStart: () => void;
}

export function TitleScreen({ selectedMap, onSelectMap, onStart }: TitleScreenProps) {
  const activeDef = MAP_REGISTRY[selectedMap];

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between pointer-events-none">
      {/* Directional readability scrim leaving right 60% of 3D world open */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-[#050912]/90 via-[#050912]/48 to-transparent"
      />

      <main className="relative z-10 flex-1 flex items-center px-8 md:px-16 max-w-2xl">
        <div className="pointer-events-auto flex flex-col gap-6">
          {/* Bespoke SVG Motorsport Championship Emblem & Title Lockup */}
          <div className="flex flex-col gap-3">
            <svg
              viewBox="0 0 360 56"
              className="w-72 h-11"
              role="img"
              aria-label="Apex GT Coastal and Alpine Championship"
            >
              <polygon
                points="6,46 22,10 56,10 40,46"
                fill="none"
                stroke={activeDef.accent}
                strokeWidth="3"
              />
              <polygon points="18,40 30,16 44,16 32,40" fill={activeDef.accent} />
              <text
                x="72"
                y="26"
                fill="#f8fafc"
                fontFamily="Chakra Petch, sans-serif"
                fontSize="20"
                fontWeight="700"
                letterSpacing="2.5"
              >
                APEX CIRCUIT STUDIO
              </text>
              <text
                x="72"
                y="45"
                fill="#94a3b8"
                fontFamily="Plus Jakarta Sans, sans-serif"
                fontSize="12"
                fontWeight="500"
                letterSpacing="1.6"
              >
                CORAL BAY · FROSTPEAK GLACIER
              </text>
            </svg>

            <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-slate-50 leading-tight text-balance">
              Coastal &amp; Alpine GT Proving Grounds
            </h1>
            <p className="text-sm md:text-base text-slate-300 max-w-lg leading-relaxed">
              Drive two 2.7 km closed-loop FIA circuits with real-time ocean and glacial ice shaders,
              custom trackside landmarks, 7 broadcast vantages, and live spline geometry editing.
            </p>
          </div>

          {/* Circuit Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
            {(['coral_bay', 'frostpeak_pass'] as MapId[]).map((id) => {
              const def = MAP_REGISTRY[id];
              const isSelected = selectedMap === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectMap(id)}
                  className={`text-left px-4 py-3.5 rounded-lg border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#0b1324]/95 border-cyan-400 text-slate-50'
                      : 'bg-[#090f1d]/80 border-slate-700/70 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <div className="font-display font-semibold text-base whitespace-nowrap truncate">
                    {def.name}
                  </div>
                  <div className="mt-1 text-xs text-slate-400 font-mono-tabular whitespace-nowrap">
                    {def.targetLengthKm.toFixed(1)} km · {def.elevationDeltaM} m Δ · {def.roadWidth} m wide
                  </div>
                </button>
              );
            })}
          </div>

          {/* Primary Start CTA */}
          <div className="flex items-center gap-4 pt-1">
            <button
              type="button"
              data-start="true"
              onClick={onStart}
              className="px-7 py-3 rounded-lg font-display font-semibold text-base tracking-wide text-slate-950 transition-transform active:scale-[0.98] cursor-pointer whitespace-nowrap"
              style={{ backgroundColor: activeDef.accent }}
            >
              Drive {activeDef.name}
            </button>
          </div>
        </div>
      </main>

      {/* Flat Borderless Single-Line Control Hint */}
      <footer className="relative z-10 px-8 md:px-16 pb-6">
        <p className="text-xs text-slate-400 font-mono-tabular tracking-wide">
          WASD Drive · Space Handbrake · C Camera · H Hide Controls · Esc Pause
        </p>
      </footer>
    </div>
  );
}
