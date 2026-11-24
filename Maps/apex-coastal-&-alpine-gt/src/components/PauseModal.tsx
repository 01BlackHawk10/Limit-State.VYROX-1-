import { MAP_REGISTRY } from '../tracks/mapRegistry';
import type { MapId } from '../tracks/types';

interface PauseModalProps {
  mapId: MapId;
  lap: number;
  bestLapTime: number | null;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

export function PauseModal({
  mapId,
  lap,
  bestLapTime,
  onResume,
  onRestart,
  onReturnTitle,
}: PauseModalProps) {
  const mapDef = MAP_REGISTRY[mapId];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Simulation paused"
      className="fixed inset-0 z-30 flex items-center justify-center bg-[#050912]/75 px-4"
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/15 p-6 text-slate-100"
        style={{ backgroundColor: 'rgba(10, 15, 28, 0.96)' }}
      >
        <div className="text-xs font-mono-tabular text-slate-400">
          {mapDef.name} · Paused
        </div>
        <h2 className="mt-1 font-display text-2xl font-bold text-slate-50">
          Session Paused
        </h2>

        <div className="mt-4 grid grid-cols-2 gap-3 py-3 border-y border-white/10 font-mono-tabular text-xs">
          <div>
            <div className="text-slate-400">Current Lap</div>
            <div className="mt-0.5 text-lg font-semibold text-slate-100">{lap}</div>
          </div>
          <div>
            <div className="text-slate-400">Best Lap</div>
            <div className="mt-0.5 text-lg font-semibold" style={{ color: mapDef.accent }}>
              {bestLapTime !== null ? formatSec(bestLapTime) : '--:--.-'}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            data-start="true"
            onClick={onResume}
            className="w-full py-2.5 rounded-lg font-display font-semibold text-sm text-slate-950 cursor-pointer"
            style={{ backgroundColor: mapDef.accent }}
          >
            Resume Driving
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 rounded-lg font-medium text-sm bg-slate-800 hover:bg-slate-700 text-slate-100 cursor-pointer"
          >
            Restart on Grid
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="w-full py-2.5 rounded-lg font-medium text-sm border border-white/15 hover:border-white/30 text-slate-300 cursor-pointer"
          >
            Return to Circuit Selection
          </button>
        </div>
      </div>
    </div>
  );
}
