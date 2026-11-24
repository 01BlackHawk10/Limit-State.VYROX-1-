import * as d3 from 'd3';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FlaskConical,
  Gauge,
  Pause,
  Pin,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOT_VERSION,
  type BrakingBenchmarkResult,
  buildSetupSnapshot,
  computeConditionsHash,
  computeSetupHash,
  DETERMINISM_GUARANTEE_NOTE,
  runSkidpadBenchmark,
  runStraightLineBrakingBenchmark,
  SIM_BUILD_HASH,
  type SkidpadBenchmarkResult,
} from '../engine/deterministicCore';
import {
  type CarModelId,
  type CarSetupConfig,
  MAP_LIST,
  MAP_REGISTRY,
  type MapId,
  type VehicleTelemetry,
} from '../engine/SceneController';
import {
  type CompactRunHistoryEntry,
  compactRunForHistory,
  computeRunDiff,
  runReferenceBotLap,
  type RunTelemetryRecord,
} from '../engine/testBotAndTelemetry';
import {
  explainRunDiff,
  generateVarianceMap,
  loadCachedVarianceMap,
  type MvpGateSuiteReport,
  PARAMETER_GROUP_LABELS,
  type ParameterGroupId,
  runMvpGateSuite,
  saveCachedVarianceMap,
  type VarianceMapV1,
} from '../engine/varianceAndExplainer';
import { formatLapMs } from './MainScreenOverlay';

export interface LiveRubberSample {
  lapProgress: number;
  lap: number;
  rubberPct: number;
  gripMu: number;
  weatherLabel: string;
}

type LabTab = 'benchmarks' | 'bot_diff' | 'variance_gate' | 'rubbering';

interface EngineeringLabModalProps {
  open: boolean;
  activeMapId: MapId;
  carId: CarModelId;
  carName: string;
  carSetup: CarSetupConfig;
  testModeEnabled: boolean;
  liveTelemetry?: VehicleTelemetry;
  liveRubberHistory?: LiveRubberSample[];
  liveWeatherLabel?: string;
  onTestModeChange: (enabled: boolean) => void;
  onClose: () => void;
}

const PARAM_GROUP_ORDER: ParameterGroupId[] = [
  'springs',
  'dampers',
  'tires',
  'aero',
  'fuel_engine',
  'brakes',
];

export function EngineeringLabModal({
  open,
  activeMapId,
  carId,
  carName,
  carSetup,
  testModeEnabled,
  liveTelemetry,
  liveRubberHistory = [],
  liveWeatherLabel = 'Dry',
  onTestModeChange,
  onClose,
}: EngineeringLabModalProps) {
  const [activeTab, setActiveTab] = useState<LabTab>('benchmarks');
  const [skidpadRes, setSkidpadRes] = useState<SkidpadBenchmarkResult | null>(null);
  const [brakingRes, setBrakingRes] = useState<BrakingBenchmarkResult | null>(null);

  const [currentRun, setCurrentRun] = useState<RunTelemetryRecord | null>(null);
  const [referenceRun, setReferenceRun] = useState<RunTelemetryRecord | null>(null);
  const [runHistory, setRunHistory] = useState<CompactRunHistoryEntry[]>([]);
  const [runSeq, setRunSeq] = useState(1);

  const [varianceMap, setVarianceMap] = useState<VarianceMapV1 | null>(null);
  const [rebaselineNotice, setRebaselineNotice] = useState<string | null>(null);
  const [mvpReport, setMvpReport] = useState<MvpGateSuiteReport | null>(null);

  const snapshot = useMemo(() => {
    const snap = buildSetupSnapshot({ carId, setup: carSetup });
    snap.conditions.trackId = activeMapId;
    return snap;
  }, [carId, carSetup, activeMapId]);

  const currentSetupHash = useMemo(() => computeSetupHash(snapshot), [snapshot]);
  const currentConditionsHash = useMemo(
    () => computeConditionsHash(snapshot.conditions),
    [snapshot],
  );

  useEffect(() => {
    if (!open) return;
    const cached = loadCachedVarianceMap(activeMapId, carId, currentSetupHash);
    setVarianceMap(cached.map);
    setRebaselineNotice(cached.rebaselineNotice);
  }, [open, activeMapId, carId, currentSetupHash]);

  const runDiff = useMemo(() => {
    if (!referenceRun || !currentRun) return null;
    return computeRunDiff(referenceRun, currentRun);
  }, [referenceRun, currentRun]);

  const explanations = useMemo(() => {
    if (!runDiff) return [];
    return explainRunDiff(runDiff, varianceMap ?? undefined);
  }, [runDiff, varianceMap]);

  if (!open) return null;

  const activeMapMeta = MAP_REGISTRY[activeMapId];

  const handleRunSkidpad = () => {
    setSkidpadRes(runSkidpadBenchmark(carId, carSetup));
  };

  const handleRunBraking = () => {
    setBrakingRes(runStraightLineBrakingBenchmark(carId, carSetup));
  };

  const handleRunReferenceBot = () => {
    const nextRun = runReferenceBotLap({
      carId,
      setup: carSetup,
      mapId: activeMapId,
      seed: 0x10001,
      runSequence: runSeq,
      sampleStride: 2,
    });
    setRunSeq((s) => s + 1);
    if (currentRun) {
      setRunHistory((prev) => [compactRunForHistory(currentRun), ...prev].slice(0, 12));
    }
    setCurrentRun(nextRun);
    if (!referenceRun) {
      setReferenceRun(nextRun);
    }
  };

  const handlePinAsReference = () => {
    if (!currentRun) return;
    setReferenceRun(currentRun);
  };

  const handleGenerateVarianceMap = () => {
    const res = generateVarianceMap({
      carId,
      setup: carSetup,
      mapId: activeMapId,
      rebaselineNotice,
    });
    saveCachedVarianceMap(res.varianceMap);
    setVarianceMap(res.varianceMap);
    setRebaselineNotice(null);
    if (!referenceRun) {
      setReferenceRun(res.baselineRun);
    }
    if (!currentRun) {
      setCurrentRun(res.baselineRun);
    }
  };

  const handleRunMvpGate = () => {
    setMvpReport(runMvpGateSuite(carId));
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-[#06080c]/88 p-0 sm:p-4"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Vehicle Engineering & Telemetry Lab"
    >
      <div
        className="gt5-panel gt5-carbon flex h-[95dvh] sm:h-auto sm:max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="gt5-horizon-rule" />
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/12 bg-black/50 px-3 py-2.5 sm:px-5 sm:py-3.5 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-sky-400 shrink-0" />
              <h2 className="font-display text-sm sm:text-base font-bold tracking-wider text-white uppercase truncate">
                Vehicle Engineering Lab · {carName}
              </h2>
            </div>
            <div className="font-mono-tabular mt-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-slate-400">
              <span>{activeMapMeta.shortName}</span>
              <span>·</span>
              <span>Setup {currentSetupHash.slice(0, 8)}</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">Cond {currentConditionsHash.slice(0, 8)}</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">{SIM_BUILD_HASH}</span>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">{BOT_VERSION}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button
              type="button"
              onClick={() => onTestModeChange(!testModeEnabled)}
              className={`h-10 sm:h-auto border px-3 py-1.5 text-[11px] sm:text-xs font-bold uppercase transition-colors whitespace-nowrap ${
                testModeEnabled
                  ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200'
                  : 'border-white/15 bg-white/[0.04] text-slate-300 hover:border-sky-400/50'
              }`}
            >
              <span className="sm:hidden">Test: {testModeEnabled ? 'Locked' : 'Off'}</span>
              <span className="hidden sm:inline">Test Mode: {testModeEnabled ? 'Locked (Dry · 55% Fuel)' : 'Off'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Engineering Lab"
              className="flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center border border-white/15 bg-white/[0.04] text-slate-300 hover:border-sky-400/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Sub-nav */}
        <nav className="flex overflow-x-auto no-scrollbar sm:grid sm:grid-cols-4 border-b border-white/10 bg-black/45 shrink-0">
          {[
            { id: 'benchmarks' as const, label: 'Skidpad & Braking Benchmarks', shortLabel: 'Benchmarks', icon: Gauge },
            { id: 'bot_diff' as const, label: 'Reference Bot & Run Diff', shortLabel: 'Run Diff', icon: Activity },
            { id: 'variance_gate' as const, label: 'Variance Map & MVP Gate', shortLabel: 'MVP Gate', icon: Cpu },
            { id: 'rubbering' as const, label: 'Track Rubbering & Grip', shortLabel: 'Rubbering', icon: TrendingUp },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-h-[44px] sm:min-h-0 items-center justify-center gap-1.5 border-b-2 px-3 sm:px-2 py-2.5 text-[11px] sm:text-xs font-bold tracking-wider uppercase transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-sky-400 bg-sky-500/14 text-white'
                    : 'border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-sky-400' : 'text-slate-500'}`} />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3.5 sm:space-y-4">
          {activeTab === 'benchmarks' && (
            <>
              <div className="border border-sky-400/25 bg-sky-950/20 px-3.5 py-2.5 text-xs text-slate-300">
                <strong className="text-sky-300 uppercase tracking-wider text-[11px]">
                  Determinism Contract:
                </strong>{' '}
                {DETERMINISM_GUARANTEE_NOTE}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Skidpad Card */}
                <section className="border border-white/12 bg-black/45 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-sm font-bold text-white uppercase">
                          Fixed-Input Skidpad Test
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          82% steering ramp on flat dry tarmac · evaluates steady-state Lat G &amp; understeer gradient.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRunSkidpad}
                        className="inline-flex h-10 sm:h-auto items-center gap-1.5 bg-sky-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 uppercase hover:bg-sky-400 shrink-0 whitespace-nowrap"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Run Skidpad</span>
                      </button>
                    </div>

                    {skidpadRes ? (
                      <div className="font-mono-tabular mt-4 grid grid-cols-2 gap-2.5 border-t border-white/10 pt-3 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Steady Lateral G</div>
                          <div className="text-lg font-bold text-emerald-300">
                            {skidpadRes.steadyLatG.toFixed(3)} G
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Peak Lateral G</div>
                          <div className="text-lg font-bold text-sky-300">
                            {skidpadRes.peakLatG.toFixed(3)} G
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Front / Rear Slip</div>
                          <div className="font-semibold text-white">
                            {skidpadRes.frontSlipDeg.toFixed(2)}° / {skidpadRes.rearSlipDeg.toFixed(2)}°
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Understeer Grad</div>
                          <div className="font-semibold text-amber-300">
                            {skidpadRes.understeerDeg >= 0 ? '+' : ''}
                            {skidpadRes.understeerDeg.toFixed(2)}°
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Turn Radius / Speed</div>
                          <div className="font-semibold text-white">
                            {skidpadRes.turnRadiusM} m @ {skidpadRes.steadySpeedKmh} km/h
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Balance Status</div>
                          <div
                            className={`font-bold ${
                              skidpadRes.stable ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {skidpadRes.stable ? 'PLANTED' : 'EXCESS SLIP'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 border border-white/8 bg-black/50 p-3 text-xs text-slate-400">
                        Run benchmark to measure steady cornering traction with current suspension &amp; tire setup.
                      </div>
                    )}
                  </div>
                </section>

                {/* Straight-Line Braking Card */}
                <section className="border border-white/12 bg-black/45 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="font-display text-sm font-bold text-white uppercase">
                          200 &rarr; 0 Straight Braking Test
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Full WOT acceleration to 200 km/h followed by 100% threshold stop.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRunBraking}
                        className="inline-flex h-10 sm:h-auto items-center gap-1.5 bg-amber-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 uppercase hover:bg-amber-300 shrink-0 whitespace-nowrap"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Run Braking</span>
                      </button>
                    </div>

                    {brakingRes ? (
                      <div className="font-mono-tabular mt-4 grid grid-cols-2 gap-2.5 border-t border-white/10 pt-3 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Stopping Distance</div>
                          <div className="text-lg font-bold text-sky-300">
                            {brakingRes.brakingDistanceM.toFixed(2)} m
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Peak / Avg Decel</div>
                          <div className="text-lg font-bold text-emerald-300">
                            {brakingRes.peakDecelG.toFixed(2)} / {brakingRes.avgDecelG.toFixed(2)} G
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Stop Duration</div>
                          <div className="font-semibold text-white">
                            {brakingRes.brakingTimeSec.toFixed(3)} s (from {brakingRes.entrySpeedKmh} km/h)
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Peak Rotor Temp</div>
                          <div className="font-semibold text-amber-300">
                            {brakingRes.peakBrakeTempC}°C ({brakingRes.brakeFadeOccurred ? 'FADE' : 'NO FADE'})
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">ABS Duty Cycle</div>
                          <div className="font-semibold text-white">
                            {brakingRes.absActivePct.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase">Setup Digest</div>
                          <div className="text-slate-400">{brakingRes.setupHash.slice(0, 10)}</div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 border border-white/8 bg-black/50 p-3 text-xs text-slate-400">
                        Run benchmark to measure brake torque, ABS duty cycle, and rotor thermal rise.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}

          {activeTab === 'bot_diff' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border border-white/12 bg-black/45 p-3.5">
                <div>
                  <div className="text-xs font-bold text-white uppercase">
                    Reference-Line Measuring Bot ({BOT_VERSION})
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Single-pass frozen speed profile · 0.85–1.05x peak slip stability governor · Excludes &gt;3 eng or &gt;5% dist.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRunReferenceBot}
                    className="inline-flex h-10 sm:h-auto items-center gap-1.5 bg-sky-500 px-3.5 py-2 text-xs font-bold text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Run Reference Bot Lap</span>
                  </button>
                  {currentRun && (
                    <button
                      type="button"
                      onClick={handlePinAsReference}
                      className="inline-flex h-10 sm:h-auto items-center gap-1.5 border border-amber-400/60 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-200 uppercase hover:bg-amber-500/25 whitespace-nowrap"
                    >
                      <Pin className="h-3.5 w-3.5" />
                      <span>Set Current as Reference</span>
                    </button>
                  )}
                </div>
              </div>

              {currentRun ? (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="border border-white/12 bg-black/50 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-sky-300 uppercase truncate">
                        Current Run · {currentRun.metadata.runId}
                      </span>
                      {currentRun.lowConfidence ? (
                        <span className="inline-flex items-center gap-1 border border-rose-500/60 bg-rose-950/60 px-2 py-0.5 text-[10px] font-bold text-rose-200 uppercase shrink-0">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Low Confidence</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 border border-emerald-500/50 bg-emerald-950/50 px-2 py-0.5 text-[10px] font-bold text-emerald-200 uppercase shrink-0">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>Valid Sample</span>
                        </span>
                      )}
                    </div>
                    <div className="font-mono-tabular mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <div className="text-[10px] text-slate-400">Lap Time</div>
                        <div className="font-bold text-white">{formatLapMs(currentRun.lapTimeMs)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Peak Lat G</div>
                        <div className="font-bold text-emerald-300">{currentRun.maxLatG.toFixed(3)} G</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Gov Events</div>
                        <div className="font-bold text-amber-300">
                          {currentRun.governorEngagements} ({(currentRun.governorDistanceFrac * 100).toFixed(1)}%)
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">Peak Oil/Brk</div>
                        <div className="font-bold text-slate-200">
                          {currentRun.peakOilTempC}° / {currentRun.peakBrakeTempC}°C
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">{currentRun.confidenceReason}</div>
                  </div>

                  {referenceRun && (
                    <div className="border border-amber-400/30 bg-amber-950/18 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-amber-300 uppercase truncate">
                          Pinned Reference · {referenceRun.metadata.runId}
                        </span>
                        <span className="font-mono-tabular text-[10px] text-slate-400 shrink-0">
                          Hash {referenceRun.metadata.setupHash.slice(0, 8)}
                        </span>
                      </div>
                      <div className="font-mono-tabular mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-400">Lap Time</div>
                          <div className="font-bold text-white">{formatLapMs(referenceRun.lapTimeMs)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Peak Lat G</div>
                          <div className="font-bold text-emerald-300">{referenceRun.maxLatG.toFixed(3)} G</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Gov Events</div>
                          <div className="font-bold text-amber-300">
                            {referenceRun.governorEngagements} ({(referenceRun.governorDistanceFrac * 100).toFixed(1)}%)
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400">Understeer</div>
                          <div className="font-bold text-slate-200">
                            {referenceRun.avgUndersteerDeg.toFixed(2)}°
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-slate-400">
                        {runDiff
                          ? runDiff.identicalSetupAndConditions
                            ? 'Identical setup & conditions hashes — deltas and explanations suppressed.'
                            : `Changed fields: ${runDiff.changedSetupFields.join(', ') || 'None'}`
                          : 'Pin a run and adjust setup to inspect two-run diff.'}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border border-white/10 bg-black/50 p-4 text-xs text-slate-400">
                  Click <strong>Run Reference Bot Lap</strong> to record a deterministic baseline lap with corner-phase segmentation.
                </div>
              )}

              {runDiff && (
                <section className="border border-white/12 bg-black/45 p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-white uppercase">
                      <Sparkles className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                      <span>Deterministic Physics Explanations (Threshold Gated)</span>
                    </div>
                    <span className="font-mono-tabular text-[11px] text-slate-400">
                      ΔLap {(runDiff.lapTimeMsDelta / 1000).toFixed(3)}s · ΔLatG{' '}
                      {runDiff.maxLatGDelta >= 0 ? '+' : ''}
                      {runDiff.maxLatGDelta.toFixed(3)}G
                    </span>
                  </div>

                  {explanations.length === 0 ? (
                    <div className="border border-white/8 bg-black/50 p-3 text-xs text-slate-400">
                      No statistically significant differences detected above noise thresholds (or setup/conditions hashes match).
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {explanations.map((exp) => (
                        <div
                          key={exp.id}
                          className={`border p-2.5 text-xs ${
                            exp.severity === 'gain'
                              ? 'border-emerald-500/45 bg-emerald-950/30 text-emerald-100'
                              : exp.severity === 'warning'
                              ? 'border-amber-500/45 bg-amber-950/30 text-amber-100'
                              : 'border-sky-500/40 bg-sky-950/25 text-slate-100'
                          }`}
                        >
                          <div className="font-semibold">{exp.summaryText}</div>
                          <div className="font-mono-tabular mt-0.5 text-[10px] opacity-80">
                            Channel: {exp.channel} · Magnitude: {exp.magnitudeText} · Location: {exp.location}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {runDiff && runDiff.phaseDeltas.length > 0 && (
                <section className="border border-white/12 bg-black/50 p-3">
                  <div className="text-[11px] font-bold tracking-wider text-slate-300 uppercase mb-2">
                    Corner-Phase Delta Decomposition (Entry / Apex / Exit vs {runDiff.refRunId})
                  </div>
                  <div className="max-h-52 overflow-auto">
                    <table className="w-full min-w-[540px] text-left text-[11px] font-mono-tabular">
                      <thead className="border-b border-white/10 text-[10px] text-slate-400 uppercase">
                        <tr>
                          <th className="py-1.5 pr-2">Corner · Phase</th>
                          <th className="py-1.5 pr-2">ΔSpeed</th>
                          <th className="py-1.5 pr-2">ΔLatG</th>
                          <th className="py-1.5 pr-2">ΔUndersteer</th>
                          <th className="py-1.5 pr-2">ΔBrake °C</th>
                          <th className="py-1.5">ΔDF kgf</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runDiff.phaseDeltas.slice(0, 15).map((pd) => (
                          <tr key={pd.key} className="border-b border-white/5 text-slate-200">
                            <td className="py-1 pr-2 font-sans">
                              {pd.cornerId} {pd.cornerName} ·{' '}
                              <span className="text-sky-300 uppercase">{pd.phase}</span>
                            </td>
                            <td
                              className={`py-1 pr-2 ${
                                pd.avgSpeedKmhDelta > 0.25
                                  ? 'text-emerald-300'
                                  : pd.avgSpeedKmhDelta < -0.25
                                  ? 'text-rose-300'
                                  : 'text-slate-400'
                              }`}
                            >
                              {pd.avgSpeedKmhDelta >= 0 ? '+' : ''}
                              {pd.avgSpeedKmhDelta.toFixed(2)} km/h
                            </td>
                            <td className="py-1 pr-2">
                              {pd.maxLatGDelta >= 0 ? '+' : ''}
                              {pd.maxLatGDelta.toFixed(3)} G
                            </td>
                            <td className="py-1 pr-2">
                              {pd.understeerDegDelta >= 0 ? '+' : ''}
                              {pd.understeerDegDelta.toFixed(2)}°
                            </td>
                            <td className="py-1 pr-2">
                              {pd.peakBrakeTempCDelta >= 0 ? '+' : ''}
                              {pd.peakBrakeTempCDelta}°C
                            </td>
                            <td className="py-1">
                              {pd.avgDownforceKgfDelta >= 0 ? '+' : ''}
                              {pd.avgDownforceKgfDelta}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {runHistory.length > 0 && (
                <div className="border border-white/10 bg-black/45 p-3">
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1.5">
                    Compact History Summaries (Full-Rate Samples Stripped)
                  </div>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {runHistory.slice(0, 4).map((h) => (
                      <div
                        key={h.metadata.runId}
                        className="font-mono-tabular flex items-center justify-between border border-white/8 bg-black/50 px-2.5 py-1.5 text-[11px]"
                      >
                        <span className="text-slate-300">{h.metadata.runId}</span>
                        <span className="text-white font-semibold">{formatLapMs(h.lapTimeMs)}</span>
                        <span className="text-sky-300">{h.maxLatG.toFixed(2)}G</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'variance_gate' && (
            <>
              {rebaselineNotice && (
                <div className="flex items-center gap-2 border border-amber-500/50 bg-amber-950/40 p-3 text-xs text-amber-100">
                  <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>{rebaselineNotice}</span>
                </div>
              )}

              <section className="border border-white/12 bg-black/45 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm font-bold text-white uppercase">
                      Schema v1 Variance Map &amp; Significance Thresholds
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      6-group perturbation suite (springs, dampers, tires, aero, fuel_engine, brakes) + 3x nonlinearity probe.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateVarianceMap}
                    className="inline-flex h-10 sm:h-auto items-center gap-1.5 bg-sky-500 px-3.5 py-2 text-xs font-bold text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>{varianceMap ? 'Re-Baseline Variance Map' : 'Generate Variance Map'}</span>
                  </button>
                </div>

                {varianceMap ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px] text-left text-[11px] font-mono-tabular">
                      <thead className="border-b border-white/10 text-[10px] text-slate-400 uppercase">
                        <tr>
                          <th className="py-1.5 pr-2">Group</th>
                          <th className="py-1.5 pr-2">Perturbation</th>
                          <th className="py-1.5 pr-2">ΔLap Time</th>
                          <th className="py-1.5 pr-2">ΔLat G</th>
                          <th className="py-1.5 pr-2">ΔUndersteer</th>
                          <th className="py-1.5 pr-2">Sig Lap Thr</th>
                          <th className="py-1.5">Nonlinearity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {PARAM_GROUP_ORDER.map((g) => {
                          const s = varianceMap.sensitivity_by_group[g];
                          const thr = varianceMap.sig_threshold_by_group[g];
                          return (
                            <tr key={g} className="border-b border-white/5 text-slate-200">
                              <td className="py-1.5 pr-2 font-sans font-semibold text-sky-300">
                                {PARAMETER_GROUP_LABELS[g]}
                              </td>
                              <td className="py-1.5 pr-2 font-sans text-slate-300">
                                {s.perturbationLabel}
                              </td>
                              <td className="py-1.5 pr-2">
                                {s.lapTimeMsDelta >= 0 ? '+' : ''}
                                {(s.lapTimeMsDelta / 1000).toFixed(3)}s
                              </td>
                              <td className="py-1.5 pr-2">
                                {s.maxLatGDelta >= 0 ? '+' : ''}
                                {s.maxLatGDelta.toFixed(3)}G
                              </td>
                              <td className="py-1.5 pr-2">
                                {s.understeerDegDelta >= 0 ? '+' : ''}
                                {s.understeerDegDelta.toFixed(2)}°
                              </td>
                              <td className="py-1.5 pr-2 text-amber-300">{thr.lapTimeMs} ms</td>
                              <td className="py-1.5">
                                {s.nonlinearityDetected ? (
                                  <span className="text-amber-300">
                                    FLAG ({s.nonlinearityRatio}x)
                                  </span>
                                ) : (
                                  <span className="text-emerald-300">
                                    Linear ({s.nonlinearityRatio}x)
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="border border-white/8 bg-black/50 p-3 text-xs text-slate-400">
                    No cached variance map for this setup hash. Click <strong>Generate Variance Map</strong> to calibrate group significance thresholds.
                  </div>
                )}
              </section>

              <section className="border border-white/12 bg-black/45 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-display text-sm font-bold text-white uppercase">
                      8-Point MVP Acceptance Gate Suite
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Verifies determinism, zero-explanation silence, +20 N/mm 3-run sign stability, threshold boundaries, setup ranking, soft/stiff parity, and nonlinearity detection.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunMvpGate}
                    className="inline-flex h-10 sm:h-auto items-center gap-1.5 bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 uppercase hover:bg-emerald-400 whitespace-nowrap"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Run 8-Point MVP Gate</span>
                  </button>
                </div>

                {mvpReport && (
                  <div className="space-y-1.5">
                    <div
                      className={`border px-3 py-2 text-xs font-bold ${
                        mvpReport.allPassed
                          ? 'border-emerald-500/50 bg-emerald-950/35 text-emerald-200'
                          : 'border-rose-500/50 bg-rose-950/40 text-rose-200'
                      }`}
                    >
                      MVP Gate Result: {mvpReport.passedCount} / {mvpReport.totalCount} Passed ·{' '}
                      {mvpReport.simBuildHash}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {mvpReport.results.map((r) => (
                        <div
                          key={r.id}
                          className={`border p-2 text-xs ${
                            r.passed
                              ? 'border-emerald-500/30 bg-black/50 text-slate-200'
                              : 'border-rose-500/50 bg-rose-950/30 text-rose-100'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 font-semibold">
                            <span>{r.label}</span>
                            <span
                              className={`font-mono-tabular text-[10px] ${
                                r.passed ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {r.passed ? 'PASS' : 'FAIL'}
                            </span>
                          </div>
                          <div className="font-mono-tabular mt-0.5 text-[10px] text-slate-400">
                            {r.detail}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === 'rubbering' && (
            <TrackRubberingPanel
              activeMapId={activeMapId}
              liveTelemetry={liveTelemetry}
              liveRubberHistory={liveRubberHistory}
              liveWeatherLabel={liveWeatherLabel}
            />
          )}
        </div>
      </div>
    </div>
  );
}

type SimConditionId = 'dry' | 'overcast' | 'wet_rain' | 'frostpeak_snow';
type SimCompoundId = 'RS' | 'RM' | 'RH' | 'INT' | 'WET';

interface RubberChartPoint {
  lapProgress: number;
  lap: number;
  rubberPct: number;
  gripMu: number;
  surfaceLabel: string;
}

const SIM_CONDITION_OPTIONS: Array<{
  id: SimConditionId;
  label: string;
  wetness: number;
  snowPeak: number;
  washRate: number;
}> = [
  { id: 'dry', label: 'Dry Rubbering', wetness: 0.0, snowPeak: 0.0, washRate: 0.0 },
  { id: 'overcast', label: 'Cool Overcast', wetness: 0.14, snowPeak: 0.0, washRate: 0.05 },
  { id: 'wet_rain', label: 'Wet Rain', wetness: 0.78, snowPeak: 0.0, washRate: 0.55 },
  { id: 'frostpeak_snow', label: 'Frostpeak Snow', wetness: 0.32, snowPeak: 0.85, washRate: 0.18 },
];

const SIM_COMPOUND_OPTIONS: Array<{ id: SimCompoundId; label: string; dryMu: number; wetScale: number }> = [
  { id: 'RS', label: 'Racing Soft (RS)', dryMu: 1.50, wetScale: 0.64 },
  { id: 'RM', label: 'Racing Medium (RM)', dryMu: 1.44, wetScale: 0.72 },
  { id: 'RH', label: 'Racing Hard (RH)', dryMu: 1.38, wetScale: 0.76 },
  { id: 'INT', label: 'Intermediate (INT)', dryMu: 1.24, wetScale: 0.94 },
  { id: 'WET', label: 'Full Wet (WET)', dryMu: 1.15, wetScale: 1.00 },
];

function computeSimulated20LapSeries(
  mapId: MapId,
  conditionId: SimConditionId,
  compoundId: SimCompoundId,
): RubberChartPoint[] {
  const cond = SIM_CONDITION_OPTIONS.find((c) => c.id === conditionId) ?? SIM_CONDITION_OPTIONS[0];
  const comp = SIM_COMPOUND_OPTIONS.find((c) => c.id === compoundId) ?? SIM_COMPOUND_OPTIONS[1];
  const mapLengthFactor =
    mapId === 'kestrel_peaks' ? 1.85 : mapId === 'frostpeak_pass' ? 1.12 : mapId === 'coral_bay' ? 0.96 : 1.0;

  const points: RubberChartPoint[] = [];
  let rubber = 0.08;
  const stepLaps = 0.25;
  const totalSteps = 80;
  const avgLapTimeSec = 76 * mapLengthFactor;
  const avgSpeedMps = 46;

  for (let i = 0; i <= totalSteps; i++) {
    const lapProgress = Number((i * stepLaps).toFixed(2));
    const lap = Math.min(20, Math.floor(lapProgress) + 1);

    if (i > 0) {
      const dt = avgLapTimeSec * stepLaps;
      const onTrackBuild = (avgSpeedMps / 2400) * dt * (1 - 0.75 * cond.wetness) * 0.18;
      const lapCrossBonus = Math.abs(lapProgress - Math.round(lapProgress)) < 0.01 ? 0.055 * (1 - 0.65 * cond.wetness) : 0;
      const rainWash = cond.washRate * 0.012 * stepLaps;
      rubber = Math.max(0.08, Math.min(1.0, rubber + onTrackBuild + lapCrossBonus - rainWash));
    }

    const snowAccum = cond.snowPeak > 0 ? Math.min(1.0, (lapProgress / 16) * cond.snowPeak) : 0;
    const rubberGripFactor = 0.91 + 0.09 * rubber;
    const wetFactor = 1 - cond.wetness * (1 - comp.wetScale);
    const snowFactor = 1 - snowAccum * (comp.id === 'WET' || comp.id === 'INT' ? 0.16 : 0.28);
    const gripMu = Number(Math.max(0.68, comp.dryMu * rubberGripFactor * wetFactor * snowFactor).toFixed(3));

    points.push({
      lapProgress,
      lap,
      rubberPct: Number((rubber * 100).toFixed(1)),
      gripMu,
      surfaceLabel: cond.label,
    });
  }

  return points;
}

function TrackRubberingPanel({
  activeMapId,
  liveTelemetry,
  liveRubberHistory,
  liveWeatherLabel,
}: {
  activeMapId: MapId;
  liveTelemetry?: VehicleTelemetry;
  liveRubberHistory: LiveRubberSample[];
  liveWeatherLabel: string;
}) {
  const [sourceMode, setSourceMode] = useState<'simulator' | 'live'>(
    liveRubberHistory.length >= 2 ? 'live' : 'simulator',
  );
  const [simMapId, setSimMapId] = useState<MapId>(activeMapId);
  const [simCondition, setSimCondition] = useState<SimConditionId>(
    activeMapId === 'frostpeak_pass' ? 'frostpeak_snow' : 'dry',
  );
  const [simCompound, setSimCompound] = useState<SimCompoundId>('RM');
  const [simLapCursor, setSimLapCursor] = useState<number>(20);
  const [simPlaying, setSimPlaying] = useState<boolean>(false);
  const [hoverPoint, setHoverPoint] = useState<RubberChartPoint | null>(null);

  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(760);

  useEffect(() => {
    setSimMapId(activeMapId);
    if (activeMapId === 'frostpeak_pass') {
      setSimCondition('frostpeak_snow');
    } else if (simCondition === 'frostpeak_snow') {
      setSimCondition('dry');
    }
  }, [activeMapId, simCondition]);

  useEffect(() => {
    if (!simPlaying) return;
    const id = window.setInterval(() => {
      setSimLapCursor((prev) => {
        if (prev >= 20) {
          setSimPlaying(false);
          return 20;
        }
        return Number(Math.min(20, prev + 0.25).toFixed(2));
      });
    }, 90);
    return () => window.clearInterval(id);
  }, [simPlaying]);

  useEffect(() => {
    const el = svgContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      const next = Math.max(260, Math.round(el.getBoundingClientRect().width));
      setContainerWidth(next);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fullSimSeries = useMemo(
    () => computeSimulated20LapSeries(simMapId, simCondition, simCompound),
    [simMapId, simCondition, simCompound],
  );

  const visibleSeries = useMemo<RubberChartPoint[]>(() => {
    if (sourceMode === 'live') {
      return liveRubberHistory.map((s) => ({
        lapProgress: s.lapProgress,
        lap: s.lap,
        rubberPct: s.rubberPct,
        gripMu: s.gripMu,
        surfaceLabel: s.weatherLabel,
      }));
    }
    return fullSimSeries.filter((p) => p.lapProgress <= simLapCursor + 0.001);
  }, [sourceMode, liveRubberHistory, fullSimSeries, simLapCursor]);

  const activePoint = hoverPoint ?? visibleSeries[visibleSeries.length - 1] ?? null;

  useEffect(() => {
    const svgNode = svgRef.current;
    if (!svgNode) return;

    const width = containerWidth;
    const isNarrow = width < 460;
    const height = isNarrow ? 240 : 300;
    const margin = isNarrow
      ? { top: 18, right: 44, bottom: 34, left: 40 }
      : { top: 22, right: 56, bottom: 38, left: 52 };
    const innerW = Math.max(120, width - margin.left - margin.right);
    const innerH = Math.max(120, height - margin.top - margin.bottom);

    const svg = d3.select(svgNode);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', width).attr('height', height);

    const defs = svg.append('defs');
    const areaGrad = defs
      .append('linearGradient')
      .attr('id', 'rubberAreaGrad')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    areaGrad.append('stop').attr('offset', '0%').attr('stop-color', '#38bdf8').attr('stop-opacity', 0.34);
    areaGrad.append('stop').attr('offset', '100%').attr('stop-color', '#38bdf8').attr('stop-opacity', 0.02);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const maxDomainX =
      sourceMode === 'live'
        ? Math.max(20, d3.max(visibleSeries, (d) => d.lapProgress) ?? 20)
        : 20;

    const xScale = d3.scaleLinear().domain([0, maxDomainX]).range([0, innerW]);
    const yRubberScale = d3.scaleLinear().domain([0, 100]).range([innerH, 0]);
    const yGripScale = d3.scaleLinear().domain([0.65, 1.60]).range([innerH, 0]);

    g.append('g')
      .attr('class', 'grid-y')
      .call(
        d3
          .axisLeft(yRubberScale)
          .ticks(5)
          .tickSize(-innerW)
          .tickFormat(() => ''),
      )
      .call((sel) => {
        sel.select('.domain').remove();
        sel
          .selectAll('line')
          .attr('stroke', 'rgba(148, 163, 184, 0.14)')
          .attr('stroke-dasharray', '3,4');
      });

    g.append('g')
      .attr('class', 'grid-x')
      .attr('transform', `translate(0,${innerH})`)
      .call(
        d3
          .axisBottom(xScale)
          .ticks(10)
          .tickSize(-innerH)
          .tickFormat(() => ''),
      )
      .call((sel) => {
        sel.select('.domain').remove();
        sel
          .selectAll('line')
          .attr('stroke', 'rgba(148, 163, 184, 0.08)')
          .attr('stroke-dasharray', '2,4');
      });

    const xAxis = g
      .append('g')
      .attr('transform', `translate(0,${innerH})`)
      .call(d3.axisBottom(xScale).ticks(10).tickFormat((v) => `L${v}`));
    xAxis.select('.domain').attr('stroke', 'rgba(255,255,255,0.2)');
    xAxis.selectAll('text').attr('fill', '#94a3b8').attr('font-size', '10px');
    xAxis.selectAll('line').attr('stroke', 'rgba(255,255,255,0.2)');

    const yLeft = g
      .append('g')
      .call(d3.axisLeft(yRubberScale).ticks(5).tickFormat((v) => `${v}%`));
    yLeft.select('.domain').attr('stroke', 'rgba(56,189,248,0.45)');
    yLeft.selectAll('text').attr('fill', '#7dd3fc').attr('font-size', '10px');
    yLeft.selectAll('line').attr('stroke', 'rgba(56,189,248,0.45)');

    const yRight = g
      .append('g')
      .attr('transform', `translate(${innerW},0)`)
      .call(d3.axisRight(yGripScale).ticks(5).tickFormat((v) => `${Number(v).toFixed(2)}μ`));
    yRight.select('.domain').attr('stroke', 'rgba(52,211,153,0.45)');
    yRight.selectAll('text').attr('fill', '#6ee7b7').attr('font-size', '10px');
    yRight.selectAll('line').attr('stroke', 'rgba(52,211,153,0.45)');

    g.append('text')
      .attr('x', innerW / 2)
      .attr('y', innerH + 31)
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('font-size', '10px')
      .attr('letter-spacing', '0.12em')
      .text('RACE DISTANCE (20-LAP PROGRESSION)');

    if (visibleSeries.length >= 2) {
      const rubberArea = d3
        .area<RubberChartPoint>()
        .x((d) => xScale(d.lapProgress))
        .y0(innerH)
        .y1((d) => yRubberScale(d.rubberPct))
        .curve(d3.curveMonotoneX);

      const rubberLine = d3
        .line<RubberChartPoint>()
        .x((d) => xScale(d.lapProgress))
        .y((d) => yRubberScale(d.rubberPct))
        .curve(d3.curveMonotoneX);

      const gripLine = d3
        .line<RubberChartPoint>()
        .x((d) => xScale(d.lapProgress))
        .y((d) => yGripScale(d.gripMu))
        .curve(d3.curveMonotoneX);

      g.append('path').datum(visibleSeries).attr('fill', 'url(#rubberAreaGrad)').attr('d', rubberArea);

      g.append('path')
        .datum(visibleSeries)
        .attr('fill', 'none')
        .attr('stroke', '#38bdf8')
        .attr('stroke-width', 2.4)
        .attr('d', rubberLine);

      g.append('path')
        .datum(visibleSeries)
        .attr('fill', 'none')
        .attr('stroke', '#34d399')
        .attr('stroke-width', 2.4)
        .attr('d', gripLine);
    }

    const focusG = g.append('g').style('display', activePoint ? '' : 'none');
    const crosshairLine = focusG
      .append('line')
      .attr('y1', 0)
      .attr('y2', innerH)
      .attr('stroke', 'rgba(255,255,255,0.35)')
      .attr('stroke-dasharray', '3,3');
    const rubberDot = focusG
      .append('circle')
      .attr('r', 4.5)
      .attr('fill', '#38bdf8')
      .attr('stroke', '#080a0f')
      .attr('stroke-width', 1.5);
    const gripDot = focusG
      .append('circle')
      .attr('r', 4.5)
      .attr('fill', '#34d399')
      .attr('stroke', '#080a0f')
      .attr('stroke-width', 1.5);

    const positionFocus = (pt: RubberChartPoint | null) => {
      if (!pt) {
        focusG.style('display', 'none');
        return;
      }
      const cx = xScale(pt.lapProgress);
      focusG.style('display', '');
      crosshairLine.attr('x1', cx).attr('x2', cx);
      rubberDot.attr('cx', cx).attr('cy', yRubberScale(pt.rubberPct));
      gripDot.attr('cx', cx).attr('cy', yGripScale(pt.gripMu));
    };

    positionFocus(activePoint);

    const bisect = d3.bisector<RubberChartPoint, number>((d) => d.lapProgress).center;

    g.append('rect')
      .attr('width', innerW)
      .attr('height', innerH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', function (event: MouseEvent) {
        if (visibleSeries.length === 0) return;
        const [mx] = d3.pointer(event, this);
        const xVal = xScale.invert(mx);
        const idx = bisect(visibleSeries, xVal);
        const clamped = visibleSeries[Math.max(0, Math.min(visibleSeries.length - 1, idx))];
        if (clamped) {
          positionFocus(clamped);
          setHoverPoint(clamped);
        }
      })
      .on('mouseleave', () => {
        setHoverPoint(null);
      });
  }, [containerWidth, visibleSeries, sourceMode, activePoint]);

  const currentLiveRubberPct = liveTelemetry ? (liveTelemetry.rubberInProgress * 100).toFixed(1) : '8.0';
  const currentLiveMu = liveTelemetry ? ((liveTelemetry.gripPct / 100) * 1.44).toFixed(3) : '1.440';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-white/12 bg-black/45 p-3.5">
        <div>
          <h3 className="font-display text-sm font-bold text-white uppercase">
            Track Surface Rubbering &amp; Effective Grip Evolution (D3)
          </h3>
          <p className="text-[11px] text-slate-400">
            Visualizes rubber buildup along the racing groove (0–100%) and dynamic surface grip coefficient μ across a 20-lap race.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 border border-white/12 bg-black/60 p-0.5">
          <button
            type="button"
            onClick={() => {
              setSimPlaying(false);
              setHoverPoint(null);
              setSourceMode('simulator');
            }}
            className={`h-9 sm:h-auto px-3 py-1 text-xs font-bold uppercase transition-colors ${
              sourceMode === 'simulator'
                ? 'bg-sky-500 text-slate-950'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            20-Lap Simulator
          </button>
          <button
            type="button"
            onClick={() => {
              setSimPlaying(false);
              setHoverPoint(null);
              setSourceMode('live');
            }}
            className={`h-9 sm:h-auto px-3 py-1 text-xs font-bold uppercase transition-colors ${
              sourceMode === 'live'
                ? 'bg-emerald-500 text-slate-950'
                : 'text-slate-300 hover:bg-white/10'
            }`}
          >
            Live Telemetry ({liveRubberHistory.length})
          </button>
        </div>
      </div>

      {sourceMode === 'simulator' ? (
        <div className="grid grid-cols-1 gap-3 border border-white/12 bg-black/45 p-3.5 md:grid-cols-4">
          <div>
            <label className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">
              Circuit Surface
            </label>
            <select
              value={simMapId}
              onChange={(e) => setSimMapId(e.target.value as MapId)}
              className="h-10 sm:h-auto w-full border border-white/15 bg-[#0b0e14] px-2.5 py-1.5 text-sm sm:text-xs font-semibold text-white focus:border-sky-400 focus:outline-none"
            >
              {MAP_LIST.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.shortName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">
              Track &amp; Weather State
            </label>
            <select
              value={simCondition}
              onChange={(e) => setSimCondition(e.target.value as SimConditionId)}
              className="h-10 sm:h-auto w-full border border-white/15 bg-[#0b0e14] px-2.5 py-1.5 text-sm sm:text-xs font-semibold text-white focus:border-sky-400 focus:outline-none"
            >
              {SIM_CONDITION_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-1">
              Tire Compound
            </label>
            <select
              value={simCompound}
              onChange={(e) => setSimCompound(e.target.value as SimCompoundId)}
              className="h-10 sm:h-auto w-full border border-white/15 bg-[#0b0e14] px-2.5 py-1.5 text-sm sm:text-xs font-semibold text-white focus:border-sky-400 focus:outline-none"
            >
              {SIM_COMPOUND_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-between">
            <div className="flex items-center justify-between text-[10px] font-bold tracking-wider text-slate-400 uppercase">
              <span>Lap Scrubber</span>
              <span className="font-mono-tabular text-sky-300">Lap {simLapCursor.toFixed(2)} / 20</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (simLapCursor >= 20 && !simPlaying) {
                    setSimLapCursor(0);
                  }
                  setSimPlaying((p) => !p);
                }}
                className="inline-flex h-10 sm:h-auto items-center gap-1 bg-sky-500 px-3 py-1 text-[11px] font-bold text-slate-950 uppercase hover:bg-sky-400 shrink-0"
              >
                {simPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
                <span>{simPlaying ? 'Pause' : 'Play'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSimPlaying(false);
                  setSimLapCursor(20);
                }}
                aria-label="Reset 20-lap curve"
                className="flex h-10 w-10 sm:h-auto sm:w-auto items-center justify-center border border-white/15 bg-white/5 p-1 text-slate-300 hover:border-sky-400/60 hover:text-white shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <input
                type="range"
                min={0}
                max={20}
                step={0.25}
                value={simLapCursor}
                onChange={(e) => {
                  setSimPlaying(false);
                  setSimLapCursor(Number(e.target.value));
                }}
                className="sun-slider w-full"
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="font-mono-tabular grid grid-cols-2 gap-2.5 border border-emerald-500/30 bg-emerald-950/15 p-3 text-xs sm:grid-cols-4">
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Active Weather</div>
            <div className="font-bold text-white">{liveWeatherLabel}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Live Rubbering</div>
            <div className="font-bold text-sky-300">{currentLiveRubberPct}%</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Live Grip μ</div>
            <div className="font-bold text-emerald-300">{currentLiveMu} μ</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase">Recorded Samples</div>
            <div className="font-bold text-slate-200">{liveRubberHistory.length} pts</div>
          </div>
        </div>
      )}

      <section className="border border-white/12 bg-black/55 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5 text-sky-300 font-semibold">
              <span className="h-2.5 w-2.5 bg-sky-400 inline-block" />
              Rubbering Progress (%)
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">
              <span className="h-2.5 w-2.5 bg-emerald-400 inline-block" />
              Effective Grip Coefficient (μ)
            </span>
          </div>

          {activePoint && (
            <div className="font-mono-tabular flex flex-wrap items-center gap-3 border border-white/12 bg-[#090d14] px-3 py-1 text-[11px]">
              <span className="text-slate-400">
                Lap <strong className="text-white">{activePoint.lapProgress.toFixed(2)}</strong>
              </span>
              <span className="text-sky-300">
                Rubber: <strong>{activePoint.rubberPct.toFixed(1)}%</strong>
              </span>
              <span className="text-emerald-300">
                Grip: <strong>{activePoint.gripMu.toFixed(3)} μ</strong>
              </span>
              <span className="text-slate-400">{activePoint.surfaceLabel}</span>
            </div>
          )}
        </div>

        <div ref={svgContainerRef} className="relative w-full overflow-hidden">
          <svg ref={svgRef} className="block w-full select-none" aria-label="Track Rubbering Progress D3 Chart" />

          {sourceMode === 'live' && visibleSeries.length < 2 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 p-6 text-center">
              <div className="max-w-md border border-white/15 bg-[#090d14]/95 px-4 py-3 text-xs text-slate-300">
                Start a race and drive past countdown to stream real-time track rubbering and grip samples here, or switch to{' '}
                <strong className="text-sky-300">20-Lap Simulator</strong> to inspect projected grip evolution.
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
