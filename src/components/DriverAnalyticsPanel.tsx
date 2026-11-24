import React, { useMemo, useState } from 'react';
import { Activity, Compass, Flame, Gauge, RotateCcw, Timer, TrendingUp } from 'lucide-react';
import { computeAnalyticsSummary, TURN_IN_BIN_LABELS } from '../engine/driverAnalytics';
import type { DriverAnalyticsData } from '../shared/socialTypes';

interface DriverAnalyticsPanelProps {
  analytics: DriverAnalyticsData;
  onReset?: () => void;
}

function formatDurationCompact(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const remS = s % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${remS}s`;
  return `${remS}s`;
}

export const DriverAnalyticsPanel: React.FC<DriverAnalyticsPanelProps> = ({
  analytics,
  onReset,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);

  const summary = useMemo(() => computeAnalyticsSummary(analytics), [analytics]);

  const maxHistVal = useMemo(
    () => Math.max(1, ...analytics.turnInHistogram),
    [analytics.turnInHistogram],
  );

  // Throttle-to-brake reaction sparkline coordinates
  const ttbSpark = useMemo(() => {
    const vals = analytics.recentThrottleToBrakeMs;
    const w = 260;
    const h = 64;
    if (vals.length === 0) {
      return { w, h, points: '', dots: [] as Array<{ x: number; y: number; v: number }>, min: 0, max: 0 };
    }
    const minVal = Math.min(...vals);
    const maxVal = Math.max(minVal + 30, ...vals);
    const dots = vals.map((v, idx) => {
      const x = vals.length === 1 ? w * 0.5 : 10 + (idx / (vals.length - 1)) * (w - 20);
      const norm = (v - minVal) / (maxVal - minVal);
      const y = h - 10 - norm * (h - 20);
      return { x, y, v };
    });
    return {
      w,
      h,
      points: dots.map((d) => `${d.x.toFixed(1)},${d.y.toFixed(1)}`).join(' '),
      dots,
      min: minVal,
      max: maxVal,
    };
  }, [analytics.recentThrottleToBrakeMs]);

  // 5-axis Driver Signature Radar SVG geometry
  const radarData = useMemo(() => {
    const turnPrecisionScore =
      analytics.turnInAngleSamples > 0
        ? Math.max(25, Math.min(100, 100 - Math.abs(summary.avgTurnInAngleDeg - 16) * 2.2))
        : 50;
    const reactionScore =
      summary.avgThrottleToBrakeMs !== null
        ? Math.max(20, Math.min(100, ((420 - summary.avgThrottleToBrakeMs) / 340) * 100))
        : 50;
    const driftEfficiencyScore = Math.max(15, Math.min(100, summary.driftToGripEfficiencyPct || 40));
    const trailScore = Math.max(15, Math.min(100, summary.trailBrakingPct * 1.4 + 20));
    const disciplineScore = Math.max(20, Math.min(100, summary.cleanDrivingPct));

    const axes = [
      { label: 'Turn-In', value: turnPrecisionScore },
      { label: 'Reaction', value: reactionScore },
      { label: 'Drift->Grip', value: driftEfficiencyScore },
      { label: 'Trail-Brk', value: trailScore },
      { label: 'Clean', value: disciplineScore },
    ];
    const cx = 105;
    const cy = 96;
    const radius = 64;
    const ringLevels = [0.33, 0.66, 1.0];
    const toPoint = (idx: number, norm: number) => {
      const ang = -Math.PI / 2 + (idx / axes.length) * Math.PI * 2;
      return {
        x: cx + Math.cos(ang) * radius * norm,
        y: cy + Math.sin(ang) * radius * norm,
      };
    };
    const polygonPts = axes
      .map((a, idx) => {
        const pt = toPoint(idx, a.value / 100);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      })
      .join(' ');
    const rings = ringLevels.map((lvl) =>
      axes
        .map((_, idx) => {
          const pt = toPoint(idx, lvl);
          return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
        })
        .join(' '),
    );
    const labelCoords = axes.map((a, idx) => {
      const pt = toPoint(idx, 1.24);
      const axisEnd = toPoint(idx, 1.0);
      return { ...a, lx: pt.x, ly: pt.y, ex: axisEnd.x, ey: axisEnd.y };
    });
    return { cx, cy, polygonPts, rings, labelCoords };
  }, [analytics.turnInAngleSamples, summary]);

  if (analytics.totalSessions === 0) {
    return (
      <div className="space-y-4">
        <section className="border border-white/12 bg-black/55 p-4 text-center space-y-2.5">
          <Activity className="mx-auto h-7 w-7 text-sky-400" />
          <h3 className="font-display text-sm font-black tracking-wider text-white uppercase">
            Advanced Driver Analytics Ready
          </h3>
          <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
            Complete a run on any circuit or mountain pass to capture lifetime driving telemetry:
            Average Turn-In Angle, Throttle-to-Brake Transition Time, Drift-to-Grip Efficiency, and
            Trail-Braking Signature.
          </p>
          <div className="grid grid-cols-3 gap-2 pt-2 text-left">
            {[
              { title: 'Turn-In Angle', val: '--°', sub: 'Corner entry bite' },
              { title: 'Thr -> Brake', val: '-- ms', sub: 'Pedal transition' },
              { title: 'Drift -> Grip', val: '--%', sub: 'Slide exit recovery' },
            ].map((item) => (
              <div key={item.title} className="border border-white/10 bg-white/[0.02] p-2.5">
                <div className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                  {item.title}
                </div>
                <div className="mt-1 font-mono-tabular text-base font-black text-slate-500">
                  {item.val}
                </div>
                <div className="text-[10px] text-slate-500">{item.sub}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Flagship 3 KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="border border-sky-400/30 bg-sky-500/[0.07] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-sky-300 uppercase">
              Avg Turn-In Angle
            </span>
            <Compass className="h-3.5 w-3.5 text-sky-400" />
          </div>
          <div className="mt-1 font-mono-tabular text-2xl font-black text-white">
            {summary.avgTurnInAngleDeg.toFixed(1)}°
          </div>
          <div className="mt-1 text-[10px] text-slate-300">
            {summary.avgTurnInAngleDeg < 11
              ? 'Smooth GT apex commitment'
              : summary.avgTurnInAngleDeg < 21
                ? 'Balanced attack turn-in'
                : 'Aggressive touge flick entry'}
          </div>
        </div>

        <div className="border border-amber-400/30 bg-amber-500/[0.07] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-amber-300 uppercase">
              Throttle → Brake
            </span>
            <Timer className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="mt-1 font-mono-tabular text-2xl font-black text-white">
            {summary.avgThrottleToBrakeMs !== null
              ? `${Math.round(summary.avgThrottleToBrakeMs)} ms`
              : '-- ms'}
          </div>
          <div className="mt-1 font-mono-tabular text-[10px] text-slate-300">
            Best:{' '}
            <span className="font-bold text-amber-200">
              {analytics.bestThrottleToBrakeMs !== null ? `${analytics.bestThrottleToBrakeMs} ms` : '--'}
            </span>
          </div>
        </div>

        <div className="border border-emerald-400/30 bg-emerald-500/[0.07] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-wider text-emerald-300 uppercase">
              Drift → Grip Eff.
            </span>
            <Flame className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-1 font-mono-tabular text-2xl font-black text-white">
            {summary.driftToGripEfficiencyPct > 0
              ? `${summary.driftToGripEfficiencyPct.toFixed(1)}%`
              : `${summary.cleanDrivingPct.toFixed(0)}%`}
          </div>
          <div className="mt-1 font-mono-tabular text-[10px] text-slate-300">
            {analytics.driftExitCount > 0
              ? `${analytics.driftExitCount} controlled exits`
              : 'Grip-line stability'}
          </div>
        </div>
      </section>

      {/* Visual Charts Row: Turn-In Angle Histogram + Driver Signature Radar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="border border-white/12 bg-black/55 p-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-display font-bold tracking-wider text-slate-200 uppercase">
              Turn-In Angle Distribution
            </span>
            <span className="font-mono-tabular text-[10px] text-slate-400">
              {analytics.totalCorners} corners
            </span>
          </div>
          <div className="mt-3 flex items-end gap-2 h-28 border-b border-white/10 pb-1">
            {analytics.turnInHistogram.map((count, idx) => {
              const pct = Math.round((count / maxHistVal) * 100);
              return (
                <div key={TURN_IN_BIN_LABELS[idx]} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="font-mono-tabular text-[9px] text-slate-300 mb-1">{count}</span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full bg-sky-400/75 border-t border-sky-200 transition-all"
                      style={{ height: `${Math.max(count > 0 ? 10 : 3, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-2 text-center font-mono-tabular text-[9px] text-slate-400">
            {TURN_IN_BIN_LABELS.map((lbl) => (
              <div key={lbl} className="flex-1">
                {lbl}
              </div>
            ))}
          </div>
        </section>

        <section className="border border-white/12 bg-black/55 p-3 flex flex-col items-center">
          <div className="w-full flex items-center justify-between text-[11px]">
            <span className="font-display font-bold tracking-wider text-slate-200 uppercase">
              Driver Signature Radar
            </span>
            <span className="font-mono-tabular text-[10px] text-sky-300">
              {analytics.totalSessions} sessions
            </span>
          </div>
          <svg viewBox="0 0 210 192" className="mt-1 w-48 h-40 overflow-visible">
            {radarData.rings.map((pts, i) => (
              <polygon
                key={i}
                points={pts}
                fill="none"
                stroke="rgba(255,255,255,0.12)"
                strokeDasharray={i < 2 ? '2 2' : undefined}
              />
            ))}
            {radarData.labelCoords.map((ax) => (
              <g key={ax.label}>
                <line
                  x1={radarData.cx}
                  y1={radarData.cy}
                  x2={ax.ex}
                  y2={ax.ey}
                  stroke="rgba(255,255,255,0.10)"
                />
                <text
                  x={ax.lx}
                  y={ax.ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(203,213,225,0.9)"
                  fontSize="8.5"
                  fontWeight="700"
                >
                  {ax.label}
                </text>
              </g>
            ))}
            <polygon
              points={radarData.polygonPts}
              fill="rgba(56, 189, 248, 0.28)"
              stroke="#38bdf8"
              strokeWidth="1.8"
            />
          </svg>
        </section>
      </div>

      {/* Throttle-to-Brake Transition Sparkline + Trail Braking */}
      <section className="border border-white/12 bg-black/55 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="font-display font-bold tracking-wider text-slate-200 uppercase flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
            Throttle-to-Brake Transition History
          </span>
          <span className="font-mono-tabular text-[10px] text-slate-400">
            Last {analytics.recentThrottleToBrakeMs.length} braking zones
          </span>
        </div>

        {ttbSpark.dots.length > 0 ? (
          <svg viewBox={`0 0 ${ttbSpark.w} ${ttbSpark.h}`} className="w-full h-16 bg-black/40 border border-white/8">
            <polyline
              fill="none"
              stroke="#fbbf24"
              strokeWidth="1.8"
              points={ttbSpark.points}
            />
            {ttbSpark.dots.map((d, idx) => (
              <circle key={idx} cx={d.x} cy={d.y} r="2.6" fill="#fde68a" />
            ))}
          </svg>
        ) : (
          <div className="border border-white/8 bg-black/40 py-3 text-center text-[11px] text-slate-400">
            Brake cleanly from full throttle on track to populate reaction history.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono-tabular text-[11px]">
          <div className="border border-white/10 bg-white/[0.02] p-2">
            <div className="text-[9px] text-slate-400 uppercase">Trail-Braking</div>
            <div className="font-bold text-white">{summary.trailBrakingPct.toFixed(1)}%</div>
          </div>
          <div className="border border-white/10 bg-white/[0.02] p-2">
            <div className="text-[9px] text-slate-400 uppercase">Peak Lat G</div>
            <div className="font-bold text-sky-300">{analytics.peakLatG.toFixed(2)} G</div>
          </div>
          <div className="border border-white/10 bg-white/[0.02] p-2">
            <div className="text-[9px] text-slate-400 uppercase">Clean Discipline</div>
            <div className="font-bold text-emerald-300">{summary.cleanDrivingPct.toFixed(1)}%</div>
          </div>
          <div className="border border-white/10 bg-white/[0.02] p-2">
            <div className="text-[9px] text-slate-400 uppercase">Seat Time / Dist</div>
            <div className="font-bold text-white">
              {formatDurationCompact(analytics.totalDriveTimeSec)} · {analytics.totalDistanceKm.toFixed(1)} km
            </div>
          </div>
        </div>
      </section>

      {/* Recent Telemetry Sessions */}
      {analytics.recentSessions.length > 0 && (
        <section className="border border-white/12 bg-black/55 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-display text-[11px] font-bold tracking-wider text-slate-200 uppercase flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-sky-400" />
              Recent Stint Logs
            </span>
            {onReset && (
              <div className="flex items-center gap-1.5">
                {confirmReset ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        onReset();
                        setConfirmReset(false);
                      }}
                      className="border border-rose-400/60 bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-200 uppercase cursor-pointer"
                    >
                      Confirm Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="border border-white/15 px-2 py-0.5 text-[10px] font-bold text-slate-300 uppercase cursor-pointer"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-slate-400 uppercase hover:text-rose-300 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset Data
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="divide-y divide-white/8">
            {analytics.recentSessions.slice(0, 6).map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px]"
              >
                <div>
                  <div className="font-bold text-white">{s.mapName}</div>
                  <div className="text-[10px] text-slate-400 uppercase">
                    {s.mode.replace('_', ' ')} · {s.distanceKm.toFixed(2)} km · {s.cornersRecorded} corners
                  </div>
                </div>
                <div className="font-mono-tabular flex items-center gap-3 text-[10px]">
                  <span className="text-sky-300">Turn {s.avgTurnInAngleDeg.toFixed(1)}°</span>
                  <span className="text-amber-300">
                    {s.avgThrottleToBrakeMs !== null ? `${s.avgThrottleToBrakeMs}ms` : '--ms'}
                  </span>
                  <span className="text-emerald-300">Eff {s.driftToGripEfficiencyPct.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
