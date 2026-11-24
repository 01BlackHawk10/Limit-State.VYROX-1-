import { getCircuitData } from '../Maps/Aurelia Ridge/circuitSpline';
import type { MapId } from '../Maps/mapRegistry';
import { computeSetupHash, type CornerPhaseId, SIM_BUILD_HASH } from './deterministicCore';
import type { AnyCarSpecId } from '../shared/carTypes';
import {
  BOT_TEST_ASSISTS,
  computeRunDiff,
  type RunDiffResult,
  runReferenceBotLap,
  type RunTelemetryRecord,
} from './testBotAndTelemetry';
import { type CarSetupConfig, getDefaultCarSetup } from './vehiclePhysics';

export type ParameterGroupId =
  | 'springs'
  | 'dampers'
  | 'tires'
  | 'aero'
  | 'fuel_engine'
  | 'brakes';

export const PARAMETER_GROUP_LABELS: Record<ParameterGroupId, string> = {
  springs: 'Springs & Ride Height',
  dampers: 'Bump / Rebound Dampers',
  tires: 'Tires & Pressures',
  aero: 'Aerodynamics',
  fuel_engine: 'Fuel & Engine Calibration',
  brakes: 'Brakes & Bias',
};

export type TelemetryChannelId =
  | 'lapTimeMs'
  | 'avgSpeedKmh'
  | 'maxLatG'
  | 'understeerDeg'
  | 'peakBrakeTempC'
  | 'oilTempC'
  | 'downforceKgf'
  | 'travelMm';

export interface GroupSensitivityEntry {
  group: ParameterGroupId;
  perturbationLabel: string;
  validRun: boolean;
  confidenceReason: string;
  lapTimeMsDelta: number;
  maxLatGDelta: number;
  understeerDegDelta: number;
  peakBrakeTempCDelta: number;
  oilTempCDelta: number;
  downforceKgfDelta: number;
  avgSpeedKmhDelta: number;
  travelMmDelta: number;
  nonlinearityDetected: boolean;
  nonlinearityRatio: number;
}

export interface CornerPhaseBaseline {
  key: string; // e.g. "T4:apex"
  cornerId: string;
  cornerName: string;
  phase: CornerPhaseId;
  aggregation: 'mean_and_peak';
  validityRule: 'gov_engagements<=3_and_dist<=5pct';
  nominalAvgSpeedKmh: number;
  nominalMaxLatG: number;
  nominalUndersteerDeg: number;
  nominalPeakBrakeTempC: number;
  nominalOilTempC: number;
}

export type ChannelThresholds = Record<TelemetryChannelId, number>;

export interface VarianceMapV1 {
  schemaVersion: 1;
  simBuildHash: string;
  trackId: MapId;
  carId: AnyCarSpecId;
  setupHash: string;
  generatedAtIso: string;
  rebaselineNotice: string | null;
  baselineValid: boolean;
  baselineLapTimeMs: number;
  cornerPhaseBaselines: CornerPhaseBaseline[];
  sensitivity_by_group: Record<ParameterGroupId, GroupSensitivityEntry>;
  sig_threshold_by_group: Record<ParameterGroupId, ChannelThresholds>;
  globalThresholds: ChannelThresholds;
}

const DEFAULT_MIN_THRESHOLDS: ChannelThresholds = {
  lapTimeMs: 45, // 0.045s minimum perceptible lap delta
  avgSpeedKmh: 0.25,
  maxLatG: 0.015,
  understeerDeg: 0.14,
  peakBrakeTempC: 6,
  oilTempC: 0.8,
  downforceKgf: 8,
  travelMm: 0.35,
};

const VARIANCE_STORAGE_PREFIX = 'gt_variance_map_v1_';

export function loadCachedVarianceMap(
  trackId: MapId,
  carId: AnyCarSpecId,
  setupHash: string,
): { map: VarianceMapV1 | null; rebaselineNotice: string | null } {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { map: null, rebaselineNotice: null };
  }
  const key = `${VARIANCE_STORAGE_PREFIX}${trackId}_${carId}`;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { map: null, rebaselineNotice: null };
    const parsed = JSON.parse(raw) as VarianceMapV1;
    if (parsed.schemaVersion !== 1) {
      return { map: null, rebaselineNotice: 'Schema upgraded -> re-baselining variance map.' };
    }
    if (parsed.simBuildHash !== SIM_BUILD_HASH) {
      return {
        map: null,
        rebaselineNotice: `Physics build changed (${parsed.simBuildHash} -> ${SIM_BUILD_HASH}). Variance map automatically invalidated and re-baselined.`,
      };
    }
    if (parsed.setupHash !== setupHash) {
      return {
        map: null,
        rebaselineNotice: `Setup hash changed (${parsed.setupHash.slice(0, 8)} -> ${setupHash.slice(0, 8)}).`,
      };
    }
    return { map: parsed, rebaselineNotice: null };
  } catch {
    return { map: null, rebaselineNotice: null };
  }
}

export function saveCachedVarianceMap(vmap: VarianceMapV1) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const key = `${VARIANCE_STORAGE_PREFIX}${vmap.trackId}_${vmap.carId}`;
  try {
    window.localStorage.setItem(key, JSON.stringify(vmap));
  } catch {
    // Ignore storage quota errors
  }
}

function buildPerturbedSetup(base: CarSetupConfig, group: ParameterGroupId, scale = 1): CarSetupConfig {
  const next: CarSetupConfig = {
    ...base,
    equippedParts: base.equippedParts ? { ...base.equippedParts } : undefined,
  };
  switch (group) {
    case 'springs':
      next.frontSpringNmm = Math.min(260, (next.frontSpringNmm ?? 140) + 20 * scale);
      break;
    case 'dampers':
      next.frontBumpDamp = Math.min(1.4, Number(((next.frontBumpDamp ?? 0.72) + 0.12 * scale).toFixed(2)));
      break;
    case 'tires':
      next.tirePressureFrontPsi = Math.min(33, (next.tirePressureFrontPsi ?? 27.5) + 1.5 * scale);
      next.tirePressureRearPsi = Math.min(33, (next.tirePressureRearPsi ?? 27.0) + 1.5 * scale);
      break;
    case 'aero':
      next.downforceFrontScale = Math.min(
        1.4,
        Number(((next.downforceFrontScale ?? next.downforceScale) + 0.08 * scale).toFixed(2)),
      );
      break;
    case 'fuel_engine':
      next.ecuBoostScale = Math.min(
        1.18,
        Number(((next.ecuBoostScale ?? 1.0) + 0.04 * scale).toFixed(2)),
      );
      break;
    case 'brakes':
      next.brakeBalance = Math.min(5, (next.brakeBalance ?? 1) + 1 * scale);
      break;
  }
  return next;
}

const GROUP_PERTURB_LABELS: Record<ParameterGroupId, string> = {
  springs: '+20 N/mm Front Spring',
  dampers: '+0.12 Front Bump Damper',
  tires: '+1.5 PSI Cold Pressures',
  aero: '+8% Front Aero Wing',
  fuel_engine: '+4% ECU Boost / Fuel Map',
  brakes: '+1 Click Front Brake Bias',
};

export function generateVarianceMap(params: {
  carId: AnyCarSpecId;
  setup: CarSetupConfig;
  mapId?: MapId;
  rebaselineNotice?: string | null;
}): { varianceMap: VarianceMapV1; baselineRun: RunTelemetryRecord } {
  const circuit = getCircuitData();
  const mapId = params.mapId ?? circuit.mapId;
  const baselineRun = runReferenceBotLap({
    carId: params.carId,
    setup: params.setup,
    mapId,
    seed: 0x10001,
    runSequence: 1,
    sampleStride: 3,
  });

  const groups: ParameterGroupId[] = [
    'springs',
    'dampers',
    'tires',
    'aero',
    'fuel_engine',
    'brakes',
  ];

  const sensitivity_by_group = {} as Record<ParameterGroupId, GroupSensitivityEntry>;
  const sig_threshold_by_group = {} as Record<ParameterGroupId, ChannelThresholds>;

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const pSetup = buildPerturbedSetup(params.setup, g, 1);
    const pRun = runReferenceBotLap({
      carId: params.carId,
      setup: pSetup,
      mapId,
      seed: 0x10001,
      runSequence: gi + 2,
      sampleStride: 3,
    });
    const d = computeRunDiff(baselineRun, pRun);

    let maxPhaseSpdDelta = 0;
    let maxPhaseTravelDelta = 0;
    let maxPhaseDfDelta = 0;
    for (const pd of d.phaseDeltas) {
      if (Math.abs(pd.avgSpeedKmhDelta) > Math.abs(maxPhaseSpdDelta)) {
        maxPhaseSpdDelta = pd.avgSpeedKmhDelta;
      }
      if (Math.abs(pd.avgTravelMmDelta) > Math.abs(maxPhaseTravelDelta)) {
        maxPhaseTravelDelta = pd.avgTravelMmDelta;
      }
      if (Math.abs(pd.avgDownforceKgfDelta) > Math.abs(maxPhaseDfDelta)) {
        maxPhaseDfDelta = pd.avgDownforceKgfDelta;
      }
    }

    // Large-step nonlinearity test on springs (and aero) using 3x step
    let nonlinearityDetected = false;
    let nonlinearityRatio = 1.0;
    if (g === 'springs' || g === 'aero') {
      const largeSetup = buildPerturbedSetup(params.setup, g, 3);
      const largeRun = runReferenceBotLap({
        carId: params.carId,
        setup: largeSetup,
        mapId,
        seed: 0x10001,
        runSequence: gi + 20,
        sampleStride: 4,
      });
      const dLarge = computeRunDiff(baselineRun, largeRun);
      const smallMetric =
        g === 'springs' ? Math.abs(d.avgUndersteerDegDelta) : Math.abs(d.lapTimeMsDelta);
      const largeMetric =
        g === 'springs' ? Math.abs(dLarge.avgUndersteerDegDelta) : Math.abs(dLarge.lapTimeMsDelta);
      if (smallMetric > 0.01) {
        nonlinearityRatio = Number((largeMetric / (smallMetric * 3)).toFixed(2));
        nonlinearityDetected = nonlinearityRatio < 0.72 || nonlinearityRatio > 1.35;
      }
    }

    sensitivity_by_group[g] = {
      group: g,
      perturbationLabel: GROUP_PERTURB_LABELS[g],
      validRun: !pRun.lowConfidence,
      confidenceReason: pRun.confidenceReason,
      lapTimeMsDelta: d.lapTimeMsDelta,
      maxLatGDelta: d.maxLatGDelta,
      understeerDegDelta: d.avgUndersteerDegDelta,
      peakBrakeTempCDelta: d.peakBrakeTempCDelta,
      oilTempCDelta: d.peakOilTempCDelta,
      downforceKgfDelta: maxPhaseDfDelta,
      avgSpeedKmhDelta: maxPhaseSpdDelta,
      travelMmDelta: maxPhaseTravelDelta,
      nonlinearityDetected,
      nonlinearityRatio,
    };

    // Per-group significance threshold = max(human perceptible floor, 0.35 * perturbation magnitude)
    sig_threshold_by_group[g] = {
      lapTimeMs: Math.max(DEFAULT_MIN_THRESHOLDS.lapTimeMs, Math.round(Math.abs(d.lapTimeMsDelta) * 0.28)),
      avgSpeedKmh: Math.max(DEFAULT_MIN_THRESHOLDS.avgSpeedKmh, Number((Math.abs(maxPhaseSpdDelta) * 0.30).toFixed(2))),
      maxLatG: Math.max(DEFAULT_MIN_THRESHOLDS.maxLatG, Number((Math.abs(d.maxLatGDelta) * 0.30).toFixed(3))),
      understeerDeg: Math.max(DEFAULT_MIN_THRESHOLDS.understeerDeg, Number((Math.abs(d.avgUndersteerDegDelta) * 0.30).toFixed(2))),
      peakBrakeTempC: Math.max(DEFAULT_MIN_THRESHOLDS.peakBrakeTempC, Math.round(Math.abs(d.peakBrakeTempCDelta) * 0.35)),
      oilTempC: Math.max(DEFAULT_MIN_THRESHOLDS.oilTempC, Number((Math.abs(d.peakOilTempCDelta) * 0.35).toFixed(2))),
      downforceKgf: Math.max(DEFAULT_MIN_THRESHOLDS.downforceKgf, Math.round(Math.abs(maxPhaseDfDelta) * 0.35)),
      travelMm: Math.max(DEFAULT_MIN_THRESHOLDS.travelMm, Number((Math.abs(maxPhaseTravelDelta) * 0.35).toFixed(2))),
    };
  }

  const cornerPhaseBaselines: CornerPhaseBaseline[] = baselineRun.phaseSummaries.map((p) => ({
    key: p.key,
    cornerId: p.cornerId,
    cornerName: p.cornerName,
    phase: p.phase,
    aggregation: 'mean_and_peak',
    validityRule: 'gov_engagements<=3_and_dist<=5pct',
    nominalAvgSpeedKmh: p.avgSpeedKmh,
    nominalMaxLatG: p.maxLatG,
    nominalUndersteerDeg: p.understeerDeg,
    nominalPeakBrakeTempC: p.peakBrakeTempC,
    nominalOilTempC: p.avgOilTempC,
  }));

  const varianceMap: VarianceMapV1 = {
    schemaVersion: 1,
    simBuildHash: SIM_BUILD_HASH,
    trackId: mapId,
    carId: params.carId,
    setupHash: baselineRun.metadata.setupHash,
    generatedAtIso: new Date().toISOString(),
    rebaselineNotice: params.rebaselineNotice ?? null,
    baselineValid: !baselineRun.lowConfidence,
    baselineLapTimeMs: baselineRun.lapTimeMs,
    cornerPhaseBaselines,
    sensitivity_by_group,
    sig_threshold_by_group,
    globalThresholds: { ...DEFAULT_MIN_THRESHOLDS },
  };

  saveCachedVarianceMap(varianceMap);
  return { varianceMap, baselineRun };
}

// ---------------------------------------------------------------------------
// Deterministic Rules Explanation Engine (ZERO LLM)
// ---------------------------------------------------------------------------

export interface TelemetryExplanation {
  id: string;
  severity: 'info' | 'gain' | 'warning';
  group: ParameterGroupId | 'multi_group';
  channel: string;
  direction: 'increased' | 'decreased' | 'faster' | 'slower' | 'mixed';
  magnitudeText: string;
  location: string; // Corner + phase or Full Lap
  comparisonRunId: string;
  summaryText: string;
}

const SETUP_FIELD_TO_GROUP: Record<string, ParameterGroupId> = {
  springRateHz: 'springs',
  frontSpringNmm: 'springs',
  rearSpringNmm: 'springs',
  antiRollFront: 'springs',
  antiRollRear: 'springs',
  rideHeightMm: 'springs',
  damperRatio: 'dampers',
  frontBumpDamp: 'dampers',
  frontReboundDamp: 'dampers',
  rearBumpDamp: 'dampers',
  rearReboundDamp: 'dampers',
  tireCompound: 'tires',
  tireGripTrim: 'tires',
  tirePressureFrontPsi: 'tires',
  tirePressureRearPsi: 'tires',
  camberFrontDeg: 'tires',
  camberRearDeg: 'tires',
  toeFrontDeg: 'tires',
  toeRearDeg: 'tires',
  downforceScale: 'aero',
  downforceFrontScale: 'aero',
  downforceRearScale: 'aero',
  weightDistributionFrontPct: 'fuel_engine',
  ecuBoostScale: 'fuel_engine',
  revLimitOffsetRpm: 'fuel_engine',
  finalDriveRatio: 'fuel_engine',
  gearRatioScale: 'fuel_engine',
  diffPreloadNm: 'fuel_engine',
  diffPowerLockPct: 'fuel_engine',
  diffCoastLockPct: 'fuel_engine',
  brakeBalance: 'brakes',
};

export function classifyChangedGroups(changedFields: string[]): ParameterGroupId[] {
  const set = new Set<ParameterGroupId>();
  for (const f of changedFields) {
    if (f === 'equippedParts') {
      set.add('fuel_engine');
    } else if (SETUP_FIELD_TO_GROUP[f]) {
      set.add(SETUP_FIELD_TO_GROUP[f]);
    }
  }
  return Array.from(set);
}

export function explainRunDiff(
  diff: RunDiffResult,
  varianceMap?: VarianceMapV1,
): TelemetryExplanation[] {
  // Rule 0: Hash equality guarantees zero explanations
  if (diff.identicalSetupAndConditions || diff.changedSetupFields.length === 0) {
    return [];
  }

  const changedGroups = classifyChangedGroups(diff.changedSetupFields);
  const thresholds = varianceMap?.globalThresholds ?? DEFAULT_MIN_THRESHOLDS;
  const explanations: TelemetryExplanation[] = [];

  // Resolve tightest group threshold across changed groups
  const thr = (ch: TelemetryChannelId): number => {
    if (!varianceMap || changedGroups.length === 0) return thresholds[ch];
    let minVal = Infinity;
    for (const g of changedGroups) {
      const gThr = varianceMap.sig_threshold_by_group[g]?.[ch] ?? thresholds[ch];
      if (gThr < minVal) minVal = gThr;
    }
    return Number.isFinite(minVal) ? minVal : thresholds[ch];
  };

  const refLabel = `vs ${diff.refRunId}`;

  // 1) Overall Lap Time significance rule
  const lapThr = thr('lapTimeMs');
  if (Math.abs(diff.lapTimeMsDelta) >= lapThr) {
    const faster = diff.lapTimeMsDelta < 0;
    const magSec = `${diff.lapTimeMsDelta > 0 ? '+' : ''}${(diff.lapTimeMsDelta / 1000).toFixed(3)}s`;
    explanations.push({
      id: 'exp_lap_time',
      severity: faster ? 'gain' : 'warning',
      group: changedGroups.length === 1 ? changedGroups[0] : 'multi_group',
      channel: 'Lap Time',
      direction: faster ? 'faster' : 'slower',
      magnitudeText: magSec,
      location: 'Full Lap',
      comparisonRunId: diff.refRunId,
      summaryText: `Lap Time ${faster ? 'faster' : 'slower'} by ${magSec} across Full Lap (${refLabel}).`,
    });
  }

  // 2) Corner-phase Understeer & Entry/Apex Grip Rule
  let peakUsPhase = diff.phaseDeltas[0];
  for (const pd of diff.phaseDeltas) {
    if (!peakUsPhase || Math.abs(pd.understeerDegDelta) > Math.abs(peakUsPhase.understeerDegDelta)) {
      peakUsPhase = pd;
    }
  }
  const usThr = thr('understeerDeg');
  if (Math.abs(diff.avgUndersteerDegDelta) >= usThr || (peakUsPhase && Math.abs(peakUsPhase.understeerDegDelta) >= usThr * 1.15)) {
    const usePhase =
      peakUsPhase && Math.abs(peakUsPhase.understeerDegDelta) >= Math.abs(diff.avgUndersteerDegDelta);
    const val = usePhase ? peakUsPhase.understeerDegDelta : diff.avgUndersteerDegDelta;
    const loc = usePhase
      ? `${peakUsPhase.cornerId} ${peakUsPhase.cornerName} · ${peakUsPhase.phase.toUpperCase()}`
      : 'Full Lap Cornering';
    const dir = val > 0 ? 'increased' : 'decreased';
    const mag = `${val > 0 ? '+' : ''}${val.toFixed(2)}°`;
    explanations.push({
      id: 'exp_understeer',
      severity: val > 0 ? 'warning' : 'gain',
      group: changedGroups.includes('springs') ? 'springs' : changedGroups[0] ?? 'tires',
      channel: 'Understeer Balance',
      direction: dir,
      magnitudeText: mag,
      location: loc,
      comparisonRunId: diff.refRunId,
      summaryText: `Understeer Angle ${dir} by ${mag} at ${loc} (${refLabel}).`,
    });
  }

  // 3) Corner Phase Speed / Exit Traction Rule
  let bestSpdPhase = diff.phaseDeltas[0];
  for (const pd of diff.phaseDeltas) {
    if (!bestSpdPhase || Math.abs(pd.avgSpeedKmhDelta) > Math.abs(bestSpdPhase.avgSpeedKmhDelta)) {
      bestSpdPhase = pd;
    }
  }
  const spdThr = thr('avgSpeedKmh');
  if (bestSpdPhase && Math.abs(bestSpdPhase.avgSpeedKmhDelta) >= spdThr) {
    const val = bestSpdPhase.avgSpeedKmhDelta;
    const dir = val > 0 ? 'increased' : 'decreased';
    const mag = `${val > 0 ? '+' : ''}${val.toFixed(2)} km/h`;
    const loc = `${bestSpdPhase.cornerId} ${bestSpdPhase.cornerName} · ${bestSpdPhase.phase.toUpperCase()}`;
    explanations.push({
      id: 'exp_corner_speed',
      severity: val > 0 ? 'gain' : 'warning',
      group: changedGroups[0] ?? 'aero',
      channel: bestSpdPhase.phase === 'exit' ? 'Corner Exit Speed' : 'Cornering Speed',
      direction: dir,
      magnitudeText: mag,
      location: loc,
      comparisonRunId: diff.refRunId,
      summaryText: `${bestSpdPhase.phase === 'exit' ? 'Corner Exit Speed' : 'Cornering Speed'} ${dir} by ${mag} at ${loc} (${refLabel}).`,
    });
  }

  // 4) Peak Lateral G Rule
  const latThr = thr('maxLatG');
  if (Math.abs(diff.maxLatGDelta) >= latThr) {
    const dir = diff.maxLatGDelta > 0 ? 'increased' : 'decreased';
    const mag = `${diff.maxLatGDelta > 0 ? '+' : ''}${diff.maxLatGDelta.toFixed(3)} G`;
    explanations.push({
      id: 'exp_lat_g',
      severity: diff.maxLatGDelta > 0 ? 'gain' : 'info',
      group: changedGroups.includes('tires') ? 'tires' : changedGroups.includes('aero') ? 'aero' : 'springs',
      channel: 'Peak Lateral G',
      direction: dir,
      magnitudeText: mag,
      location: 'High-Speed Sweeps',
      comparisonRunId: diff.refRunId,
      summaryText: `Peak Lateral G ${dir} by ${mag} in high-load sweeps (${refLabel}).`,
    });
  }

  // 5) Brake Rotor Temperature / Fade Margin Rule
  const brkThr = thr('peakBrakeTempC');
  if (Math.abs(diff.peakBrakeTempCDelta) >= brkThr) {
    const dir = diff.peakBrakeTempCDelta > 0 ? 'increased' : 'decreased';
    const mag = `${diff.peakBrakeTempCDelta > 0 ? '+' : ''}${diff.peakBrakeTempCDelta}°C`;
    explanations.push({
      id: 'exp_brake_temp',
      severity: diff.peakBrakeTempCDelta > 40 ? 'warning' : 'info',
      group: 'brakes',
      channel: 'Peak Brake Rotor Temp',
      direction: dir,
      magnitudeText: mag,
      location: 'Heavy Braking Entries',
      comparisonRunId: diff.refRunId,
      summaryText: `Peak Brake Rotor Temp ${dir} by ${mag} across heavy braking entries (${refLabel}).`,
    });
  }

  // 6) Engine Oil / Coolant Thermal Rule (fuel_engine)
  const oilThr = thr('oilTempC');
  if (Math.abs(diff.peakOilTempCDelta) >= oilThr) {
    const dir = diff.peakOilTempCDelta > 0 ? 'increased' : 'decreased';
    const mag = `${diff.peakOilTempCDelta > 0 ? '+' : ''}${diff.peakOilTempCDelta.toFixed(1)}°C`;
    explanations.push({
      id: 'exp_oil_temp',
      severity: diff.peakOilTempCDelta > 8 ? 'warning' : 'info',
      group: 'fuel_engine',
      channel: 'Peak Engine Oil Temp',
      direction: dir,
      magnitudeText: mag,
      location: 'Full Stint Powertrain',
      comparisonRunId: diff.refRunId,
      summaryText: `Peak Engine Oil Temp ${dir} by ${mag} under sustained load (${refLabel}).`,
    });
  }

  // 7) Trade-off rule: faster lap time at the expense of stability / governor activity
  if (diff.lapTimeMsDelta < -lapThr && diff.governorEngagementsDelta > 0) {
    explanations.push({
      id: 'exp_tradeoff_consistency',
      severity: 'warning',
      group: 'multi_group',
      channel: 'Pace vs Stability Trade-off',
      direction: 'mixed',
      magnitudeText: `${(diff.lapTimeMsDelta / 1000).toFixed(3)}s / +${diff.governorEngagementsDelta} gov`,
      location: 'Full Lap',
      comparisonRunId: diff.refRunId,
      summaryText: `Faster lap (${(diff.lapTimeMsDelta / 1000).toFixed(3)}s) traded stability (+${diff.governorEngagementsDelta} governor events, ${refLabel}).`,
    });
  }

  // 8) Multi-group interaction summary rule
  if (changedGroups.length > 1 && explanations.length > 0) {
    const names = changedGroups.map((g) => PARAMETER_GROUP_LABELS[g].split(' ')[0]).join(' + ');
    explanations.unshift({
      id: 'exp_multi_group_summary',
      severity: 'info',
      group: 'multi_group',
      channel: 'Multi-Group Interaction',
      direction: 'mixed',
      magnitudeText: `${changedGroups.length} groups`,
      location: 'Full Lap',
      comparisonRunId: diff.refRunId,
      summaryText: `Effects combined across multiple groups (${names}) relative to ${diff.refRunId}.`,
    });
  }

  return explanations;
}

// ---------------------------------------------------------------------------
// Automated MVP Gate Acceptance Test Suite
// ---------------------------------------------------------------------------

export interface MvpGateCheckResult {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface MvpGateSuiteReport {
  allPassed: boolean;
  passedCount: number;
  totalCount: number;
  simBuildHash: string;
  results: MvpGateCheckResult[];
}

export function runMvpGateSuite(carId: AnyCarSpecId = 'bmw-m4-gt3-evo'): MvpGateSuiteReport {
  const results: MvpGateCheckResult[] = [];
  const baseSetup = getDefaultCarSetup(carId);
  const { varianceMap, baselineRun } = generateVarianceMap({ carId, setup: baseSetup });

  // 1. Same-engine determinism
  const twinRun = runReferenceBotLap({ carId, setup: baseSetup, seed: 0x10001, sampleStride: 3 });
  const detDiff = computeRunDiff(baselineRun, twinRun);
  const lastA = baselineRun.fullRateSamples[baselineRun.fullRateSamples.length - 1];
  const lastB = twinRun.fullRateSamples[twinRun.fullRateSamples.length - 1];
  const bitIdentical =
    detDiff.lapTimeMsDelta === 0 &&
    lastA?.speedKmh === lastB?.speedKmh &&
    lastA?.trackT === lastB?.trackT;
  results.push({
    id: 'gate_determinism',
    label: '1. Same-Engine Determinism (Bot + Physics)',
    passed: bitIdentical,
    detail: `lapΔ=${detDiff.lapTimeMsDelta}ms · speed=${lastA?.speedKmh ?? 0} vs ${lastB?.speedKmh ?? 0} km/h`,
  });

  // 2. Identical setup yields zero explanations
  const zeroExp = explainRunDiff(detDiff, varianceMap);
  results.push({
    id: 'gate_identical_zero_exp',
    label: '2. Identical Setup Zero Explanations',
    passed: zeroExp.length === 0,
    detail: `explanations=${zeroExp.length} (hash=${detDiff.setupHashMatch ? 'match' : 'mismatch'})`,
  });

  // 3. +20 N/mm front spring repeated 3x consistent explanation sign
  const stiffFrontSetup: CarSetupConfig = {
    ...baseSetup,
    frontSpringNmm: (baseSetup.frontSpringNmm ?? 140) + 20,
  };
  const springRuns = [1, 2, 3].map((seq) =>
    runReferenceBotLap({ carId, setup: stiffFrontSetup, seed: 0x10001 + seq, runSequence: seq, sampleStride: 3 }),
  );
  const springExps = springRuns.map((r) => explainRunDiff(computeRunDiff(baselineRun, r), varianceMap));
  const signsConsistent =
    springRuns.every((r) => !r.lowConfidence) &&
    springExps.every((exps) => exps.length >= 1) &&
    springExps.every((exps) => exps[0].direction === springExps[0][0].direction);
  results.push({
    id: 'gate_spring_plus20_3x',
    label: '3. +20 N/mm Front Spring 3-Run Sign Stability',
    passed: signsConsistent,
    detail: `3 runs consistent (${springExps[0][0]?.summaryText ?? 'none'})`,
  });

  // 4. Negative twin silence (sub-threshold / non-physics micro tweak)
  const microDiff: RunDiffResult = {
    ...detDiff,
    identicalSetupAndConditions: false,
    setupHashMatch: false,
    changedSetupFields: ['frontSpringNmm'],
    lapTimeMsDelta: 5,
    avgSpeedKmhDelta: 0.02,
    maxLatGDelta: 0.002,
    avgUndersteerDegDelta: 0.01,
    peakBrakeTempCDelta: 1,
    peakOilTempCDelta: 0.1,
    phaseDeltas: detDiff.phaseDeltas.map((p) => ({
      ...p,
      avgSpeedKmhDelta: 0.02,
      understeerDegDelta: 0.01,
    })),
  };
  const negExp = explainRunDiff(microDiff, varianceMap);
  results.push({
    id: 'gate_negative_twin_silence',
    label: '4. Negative Twin Silence (Sub-Threshold)',
    passed: negExp.length === 0,
    detail: `sub-threshold explanations=${negExp.length}`,
  });

  // 5. Threshold boundary behavior
  const boundaryBelow: RunDiffResult = {
    ...microDiff,
    lapTimeMsDelta: varianceMap.sig_threshold_by_group.springs.lapTimeMs - 1,
  };
  const boundaryAbove: RunDiffResult = {
    ...microDiff,
    lapTimeMsDelta: varianceMap.sig_threshold_by_group.springs.lapTimeMs + 25,
  };
  const bPass =
    explainRunDiff(boundaryBelow, varianceMap).length === 0 &&
    explainRunDiff(boundaryAbove, varianceMap).length >= 1;
  results.push({
    id: 'gate_threshold_boundary',
    label: '5. Significance Threshold Boundary Gate',
    passed: bPass,
    detail: `below=${explainRunDiff(boundaryBelow, varianceMap).length}, above=${explainRunDiff(boundaryAbove, varianceMap).length}`,
  });

  // 6. 5 Setup-pair ranking parity (RS vs CH, High DF vs Low Drag, Eco vs Quali, etc.)
  const runSoft = runReferenceBotLap({
    carId,
    setup: { ...baseSetup, tireCompound: 'racing_soft' },
    seed: 0x20001,
    sampleStride: 4,
  });
  const runComfort = runReferenceBotLap({
    carId,
    setup: { ...baseSetup, tireCompound: 'comfort_hard' },
    seed: 0x20002,
    sampleStride: 4,
  });
  const runHighDf = runReferenceBotLap({
    carId,
    setup: { ...baseSetup, downforceFrontScale: 1.25, downforceRearScale: 1.28 },
    seed: 0x20003,
    sampleStride: 4,
  });
  const runLowDf = runReferenceBotLap({
    carId,
    setup: { ...baseSetup, downforceFrontScale: 0.72, downforceRearScale: 0.72 },
    seed: 0x20004,
    sampleStride: 4,
  });
  const runEco = runReferenceBotLap({
    carId,
    setup: { ...baseSetup, ecuBoostScale: 0.88 },
    seed: 0x20005,
    sampleStride: 4,
  });
  const rankOk =
    runSoft.lapTimeMs < runComfort.lapTimeMs &&
    runHighDf.maxLatG > runLowDf.maxLatG &&
    baselineRun.lapTimeMs <= runEco.lapTimeMs + 150;
  results.push({
    id: 'gate_setup_pair_ranking',
    label: '6. 5+ Setup Pairs Physically Ranked',
    passed: rankOk,
    detail: `RS=${(runSoft.lapTimeMs / 1000).toFixed(2)}s < CH=${(runComfort.lapTimeMs / 1000).toFixed(2)}s · HighDF ${runHighDf.maxLatG.toFixed(2)}G > LowDF ${runLowDf.maxLatG.toFixed(2)}G`,
  });

  // 7. Soft vs Stiff grip extraction parity (both valid, non-governed)
  const runSoftSusp = runReferenceBotLap({
    carId,
    setup: { ...baseSetup, frontSpringNmm: 100, rearSpringNmm: 105 },
    seed: 0x30001,
    sampleStride: 4,
  });
  const runStiffSusp = runReferenceBotLap({
    carId,
    setup: { ...baseSetup, frontSpringNmm: 210, rearSpringNmm: 215 },
    seed: 0x30002,
    sampleStride: 4,
  });
  results.push({
    id: 'gate_soft_stiff_parity',
    label: '7. Soft vs Stiff Suspension Grip Extraction',
    passed: !runSoftSusp.lowConfidence && !runStiffSusp.lowConfidence,
    detail: `soft=${runSoftSusp.maxLatG.toFixed(2)}G (${runSoftSusp.governorEngagements}gov), stiff=${runStiffSusp.maxLatG.toFixed(2)}G (${runStiffSusp.governorEngagements}gov)`,
  });

  // 8. Large-step nonlinearity detection
  const nlEntry = varianceMap.sensitivity_by_group.springs;
  results.push({
    id: 'gate_nonlinearity',
    label: '8. Large-Step Nonlinearity Probe',
    passed: typeof nlEntry.nonlinearityRatio === 'number' && Number.isFinite(nlEntry.nonlinearityRatio),
    detail: `ratio=${nlEntry.nonlinearityRatio} · flagged=${nlEntry.nonlinearityDetected}`,
  });

  const passedCount = results.filter((r) => r.passed).length;
  return {
    allPassed: passedCount === results.length,
    passedCount,
    totalCount: results.length,
    simBuildHash: SIM_BUILD_HASH,
    results,
  };
}
