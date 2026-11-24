import { Camera, EyeOff, Film, Home, RotateCcw, Trophy } from 'lucide-react';
import { type RaceRewardBreakdown } from '../engine/carCustomization';
import { FinishSummary, GameMode, PodiumCameraAngle } from '../engine/SceneController';
import { formatLapMs } from './MainScreenOverlay';

interface PodiumCeremonyOverlayProps {
  summary: FinishSummary;
  isHudHidden: boolean;
  cameraAngle: PodiumCameraAngle;
  lastRaceReward?: RaceRewardBreakdown | null;
  creditsCr?: number;
  hasReplay?: boolean;
  onCameraAngleChange: (angle: PodiumCameraAngle) => void;
  onToggleHudHidden: () => void;
  onCaptureScreenshot: () => void;
  onWatchReplay?: () => void;
  onRestartRace: () => void;
  onExitToGarage: () => void;
}

const MODE_TITLES: Record<GameMode, string> = {
  time_trial: 'Time Trial Classification',
  sprint: 'AI Sprint Official Podium',
  endurance: 'Endurance Official Podium',
  drift: 'Drift Attack Classification',
  tofu_delivery: 'Fujiwara Tofu Delivery',
};

const PODIUM_ANGLES: Array<{ id: PodiumCameraAngle; label: string }> = [
  { id: 'auto', label: 'Pedestal & Car' },
  { id: 'car', label: 'Hero Car' },
  { id: 'driver', label: 'Winners' },
  { id: 'crane', label: 'Aerial View' },
];

export function PodiumCeremonyOverlay({
  summary,
  isHudHidden,
  cameraAngle,
  lastRaceReward = null,
  creditsCr,
  hasReplay = false,
  onCameraAngleChange,
  onToggleHudHidden,
  onCaptureScreenshot,
  onWatchReplay,
  onRestartRace,
  onExitToGarage,
}: PodiumCeremonyOverlayProps) {
  if (isHudHidden) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-2 landscape-short:p-1.5 desktop:p-6 overflow-hidden"
      style={{
        paddingTop: 'max(0.45rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.45rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.45rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.45rem, env(safe-area-inset-right))',
      }}
    >
      {/* GT5 Top Official Podium Header */}
      <header className="pointer-events-auto gt5-panel overflow-hidden shrink-0">
        <div className="gt5-horizon-rule" />
        <div className="flex flex-col landscape-short:flex-row landscape-short:items-center desktop:flex-row desktop:flex-wrap desktop:items-center justify-between gap-1.5 desktop:gap-2 px-2.5 py-1.5 landscape-short:py-1 desktop:px-4 desktop:py-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 landscape-short:h-6 landscape-short:w-6 desktop:h-9 desktop:w-9 items-center justify-center border border-amber-400/45 bg-amber-500/12 shrink-0">
              <Trophy className="h-3.5 w-3.5 desktop:h-4 desktop:w-4 text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="hidden desktop:block text-[10px] font-semibold tracking-[0.2em] text-sky-400 uppercase">
                Official Race Classification
              </div>
              <h2 className="font-display text-xs landscape-short:text-[11px] font-bold tracking-wide text-white uppercase desktop:text-xl truncate">
                {MODE_TITLES[summary.mode]}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar desktop:flex-wrap desktop:gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleHudHidden}
              className="inline-flex h-10 landscape-short:h-8 desktop:h-auto items-center gap-1.5 border border-white/15 bg-white/[0.04] px-2.5 desktop:px-3 py-1 desktop:py-1.5 text-[11px] desktop:text-xs font-semibold text-slate-200 transition-colors hover:border-white/35 hover:text-white whitespace-nowrap shrink-0"
            >
              <EyeOff className="h-3.5 w-3.5 text-slate-300" />
              <span className="desktop:hidden">Hide</span>
              <span className="hidden desktop:inline">Hide UI (H)</span>
            </button>
            <button
              type="button"
              onClick={onCaptureScreenshot}
              className="inline-flex h-10 landscape-short:h-8 desktop:h-auto items-center gap-1.5 border border-white/15 bg-white/[0.04] px-2.5 desktop:px-3 py-1 desktop:py-1.5 text-[11px] desktop:text-xs font-semibold text-slate-200 transition-colors hover:border-sky-400/60 hover:text-white whitespace-nowrap shrink-0"
            >
              <Camera className="h-3.5 w-3.5 text-sky-400" />
              <span className="desktop:hidden">Snap</span>
              <span className="hidden desktop:inline">Screenshot</span>
            </button>
            {hasReplay && onWatchReplay && (
              <button
                type="button"
                onClick={onWatchReplay}
                className="inline-flex h-10 landscape-short:h-8 desktop:h-auto items-center gap-1.5 border border-amber-400/55 bg-amber-500/20 px-2.5 desktop:px-3.5 py-1 desktop:py-1.5 text-[11px] desktop:text-xs font-bold text-amber-100 transition-colors hover:bg-amber-500/35 hover:text-white whitespace-nowrap shrink-0"
              >
                <Film className="h-3.5 w-3.5 text-amber-300" />
                <span className="desktop:hidden">Replay</span>
                <span className="hidden desktop:inline">Watch Replay</span>
              </button>
            )}
            <button
              type="button"
              onClick={onExitToGarage}
              className="inline-flex h-10 landscape-short:h-8 desktop:h-auto items-center gap-1.5 border border-white/15 bg-white/[0.04] px-2.5 desktop:px-3.5 py-1 desktop:py-1.5 text-[11px] desktop:text-xs font-semibold text-slate-200 transition-colors hover:border-white/35 hover:text-white whitespace-nowrap shrink-0"
            >
              <Home className="h-3.5 w-3.5" />
              <span>Garage</span>
            </button>
            <button
              type="button"
              onClick={onRestartRace}
              className="inline-flex h-10 landscape-short:h-8 desktop:h-auto items-center gap-1.5 bg-sky-500 px-3 desktop:px-4 py-1 desktop:py-1.5 font-display text-[11px] desktop:text-xs font-bold tracking-wider text-slate-950 uppercase transition-colors hover:bg-sky-400 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="desktop:hidden">Restart</span>
              <span className="hidden desktop:inline">Restart Event</span>
            </button>
          </div>
        </div>
      </header>

      {/* Bottom-Left Standings keeping Center Top-3 Pedestal & Hero Car Clear */}
      <div className="flex flex-col landscape-short:flex-row landscape-short:items-end desktop:flex-row desktop:items-end justify-between gap-1.5 desktop:gap-4 min-h-0">
        <section className="pointer-events-auto gt5-panel w-full max-w-md desktop:max-w-lg overflow-hidden max-h-[42dvh] landscape-short:max-h-[56dvh] landscape-short:max-w-sm desktop:max-h-none flex flex-col">
          <div className="flex items-center justify-between border-b border-white/12 bg-black/45 px-2.5 py-1.5 desktop:px-4 desktop:py-2.5 shrink-0">
            <span className="font-display text-[10px] desktop:text-xs font-bold tracking-[0.16em] text-amber-300 uppercase">
              Final Standings
            </span>
            <span className="font-mono-tabular text-[10px] desktop:text-xs text-slate-300 truncate ml-2">
              {summary.lapCount > 0 ? `${summary.lapCount} Laps` : 'Session'} ·{' '}
              <strong className="text-sky-300">{summary.speedTrapRecordKmh} km/h</strong>
            </span>
          </div>

          <div className="divide-y divide-white/8 p-1.5 desktop:p-3 overflow-y-auto">
            {summary.mode === 'tofu_delivery' && (
              <div
                className={`mb-2 border px-3 py-2 text-xs ${
                  summary.tofuFailed
                    ? 'border-rose-500/70 bg-rose-950/55 text-rose-100'
                    : 'border-amber-400/60 bg-amber-500/12 text-amber-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-bold uppercase tracking-wider">
                    {summary.tofuFailed
                      ? 'Delivery Failed · Tofu Spilled'
                      : `Delivery Complete · Grade ${summary.tofuGrade ?? 'B'}`}
                  </span>
                  <span className="font-mono-tabular font-bold">
                    Cup {Math.round(summary.tofuIntegrityPct ?? 0)}%
                  </span>
                </div>
                {summary.tofuFailed && summary.tofuFailureReason && (
                  <p className="mt-0.5 text-[11px] text-rose-200">{summary.tofuFailureReason}</p>
                )}
              </div>
            )}
            {summary.leaderboard.map((row) => (
              <div
                key={`${row.position}-${row.name}`}
                className={`flex items-center justify-between gap-2 desktop:gap-3 px-2 desktop:px-3 py-1 landscape-short:py-0.5 desktop:py-2 text-xs ${
                  row.isPlayer
                    ? 'border border-sky-400/65 bg-sky-500/14 text-white'
                    : 'bg-white/[0.02] text-slate-200'
                }`}
              >
                <div className="flex items-center gap-1.5 desktop:gap-2.5 min-w-0">
                  <span
                    className={`font-display w-5 desktop:w-7 text-center text-[11px] desktop:text-sm font-bold shrink-0 ${
                      row.position === 1
                        ? 'text-amber-400'
                        : row.position === 2
                        ? 'text-slate-100'
                        : row.position === 3
                        ? 'text-amber-600'
                        : 'text-slate-400'
                    }`}
                  >
                    P{row.position}
                  </span>
                  <span
                    className="h-3 w-1 shrink-0"
                    style={{ backgroundColor: row.color }}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-[10px] desktop:text-xs">{row.name}</div>
                    <div className="truncate text-[8.5px] desktop:text-[10px] text-slate-400">{row.carName}</div>
                  </div>
                </div>

                <div className="font-mono-tabular flex items-center gap-2 desktop:gap-4 text-right shrink-0 text-[9.5px] desktop:text-xs">
                  <div>
                    <div className="text-[8px] desktop:text-[9px] text-slate-400 uppercase">Best Lap</div>
                    <div className="text-emerald-300">{formatLapMs(row.bestLapMs)}</div>
                  </div>
                  <div className="min-w-[54px] desktop:min-w-[78px]">
                    <div className="text-[8px] desktop:text-[9px] text-slate-400 uppercase">
                      {summary.mode === 'drift' ? 'Drift Pts' : 'Gap / Time'}
                    </div>
                    <div className="font-bold text-white">
                      {summary.mode === 'drift' && row.driftPoints !== undefined
                        ? `${row.driftPoints.toLocaleString()} PTS`
                        : row.position === 1
                        ? formatLapMs(row.totalTimeMs)
                        : row.gapText}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {lastRaceReward && (
            <div className="border-t border-amber-400/30 bg-amber-500/8 px-2.5 py-1.5 desktop:px-4 desktop:py-2.5 text-[11px] desktop:text-xs shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-[9.5px] desktop:text-[11px] font-bold tracking-wider text-amber-300 uppercase truncate">
                  {lastRaceReward.label}
                </span>
                <span className="font-mono-tabular text-[11px] desktop:text-sm font-bold text-emerald-300 shrink-0">
                  +CR {lastRaceReward.totalCr.toLocaleString()}
                </span>
              </div>
              <div className="font-mono-tabular mt-0.5 flex flex-wrap items-center justify-between gap-2 text-[9.5px] desktop:text-[10px] text-slate-300">
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  <span>Base {lastRaceReward.baseCr.toLocaleString()}</span>
                  {lastRaceReward.positionBonusCr > 0 && (
                    <span>Pos +{lastRaceReward.positionBonusCr.toLocaleString()}</span>
                  )}
                  <span>Dist +{lastRaceReward.distanceBonusCr.toLocaleString()}</span>
                  {lastRaceReward.driftBonusCr > 0 && (
                    <span>Drift +{lastRaceReward.driftBonusCr.toLocaleString()}</span>
                  )}
                </div>
                {typeof creditsCr === 'number' && (
                  <span className="font-semibold text-amber-200">
                    Wallet: CR {creditsCr.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        <div className="pointer-events-auto flex flex-col items-stretch landscape-short:items-end desktop:items-end gap-1.5 desktop:gap-2 w-full landscape-short:w-auto desktop:w-auto shrink-0">
          <div className="gt5-panel flex items-center gap-1 p-1 overflow-x-auto no-scrollbar desktop:flex-wrap">
            {PODIUM_ANGLES.map((ang) => (
              <button
                key={ang.id}
                type="button"
                onClick={() => onCameraAngleChange(ang.id)}
                className={`h-10 landscape-short:h-8 desktop:h-auto px-2.5 desktop:px-3 py-1 desktop:py-1.5 text-[10.5px] desktop:text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  cameraAngle === ang.id
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                {ang.label}
              </button>
            ))}
          </div>
          <div className="hidden gt5-panel px-3.5 py-2 text-right text-[11px] text-slate-300 desktop:block">
            <div className="font-semibold text-white">Top-3 Podium Showcase</div>
            <div className="text-slate-400">
              Select a camera angle or press H for clean view
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
