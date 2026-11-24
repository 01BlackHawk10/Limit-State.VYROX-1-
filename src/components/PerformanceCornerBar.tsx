import { Activity } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type PerformanceSnapshot } from '../engine/SceneController';

interface PerformanceCornerBarProps {
  snapshot: PerformanceSnapshot;
  subscribeSnapshot?: (listener: (snap: PerformanceSnapshot) => void) => () => void;
  isHudHidden: boolean;
  hideOnMobile?: boolean;
  onOpenProfiler: () => void;
}

export function PerformanceCornerBar({
  snapshot,
  subscribeSnapshot,
  isHudHidden,
  hideOnMobile = false,
  onOpenProfiler,
}: PerformanceCornerBarProps) {
  const [liveSnap, setLiveSnap] = useState<PerformanceSnapshot>(snapshot);

  useEffect(() => {
    setLiveSnap(snapshot);
  }, [snapshot]);

  useEffect(() => {
    if (!subscribeSnapshot) return;
    return subscribeSnapshot((next) => {
      setLiveSnap(next);
    });
  }, [subscribeSnapshot]);

  if (isHudHidden) return null;

  const fpsColor =
    liveSnap.fps >= 50
      ? 'text-emerald-400'
      : liveSnap.fps >= 34
      ? 'text-amber-300'
      : 'text-rose-400';

  return (
    <button
      type="button"
      onClick={onOpenProfiler}
      title="Open Performance Profiler & Resource Manager"
      className={`fixed bottom-1.5 left-3 z-30 ${
        hideOnMobile ? 'hidden desktop:inline-flex' : 'inline-flex'
      } h-5 items-center gap-2 border border-white/14 bg-[#080b11]/95 px-2.5 text-[10px] font-medium text-slate-300 shadow-lg transition-colors hover:border-sky-400/70 hover:text-white whitespace-nowrap shrink-0`}
    >
      <Activity className="h-3 w-3 text-sky-400 shrink-0" />
      <span className={`font-mono-tabular font-bold ${fpsColor}`}>
        {liveSnap.fps} FPS
      </span>
      <span className="text-slate-600">·</span>
      <span className="font-mono-tabular text-slate-200">
        {liveSnap.avgFrameMs.toFixed(1)} ms
      </span>
      <span className="hidden text-slate-600 desktop:inline">·</span>
      <span className="font-mono-tabular hidden text-slate-400 desktop:inline">
        {liveSnap.drawCalls} DC
      </span>
      <span className="hidden text-slate-600 md:inline">·</span>
      <span className="font-mono-tabular hidden text-slate-400 md:inline">
        {liveSnap.geometries}G/{liveSnap.textures}T
      </span>
      {liveSnap.autoThrottleLevel > 0 && (
        <>
          <span className="text-slate-600">·</span>
          <span className="font-mono-tabular font-semibold text-amber-300">
            OPT L{liveSnap.autoThrottleLevel}
          </span>
        </>
      )}
    </button>
  );
}
