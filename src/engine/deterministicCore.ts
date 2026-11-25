import type { CircuitData } from '../Maps/Aurelia Ridge/circuitSpline';
import type { WeatherPreset } from '../Maps/Aurelia Ridge/skyAndLighting';
import type { MapId } from '../Maps/mapRegistry';
import type { AnyCarSpecId } from '../shared/carTypes';
import {
  type CarSetupConfig,
  type CockpitDialState,
  getDefaultCarSetup,
  getDefaultCockpitDials,
  VEHICLE_SPECS,
  type VehicleAssists,
  type VehicleControlsInput,
  VehiclePhysicsEngine,
  type VehicleTelemetry,
} from './vehiclePhysics';
import { createFlatTrackAdapter, DEFAULT_SIM_ASSISTS, IDLE_INPUT } from './physicsSelfTest';

export const SIM_BUILD_HASH = 'gt-sim-v2.0-traction-2026';
export const BOT_VERSION = 'refbot-v1.0';
export const DETERMINISM_GUARANTEE_NOTE =
  'Bit-identical deterministic simulation guaranteed within the same browser and JS engine at fixed 120 Hz chassis / 960 Hz tire timesteps.';

/**
 * Deterministic 32-bit seeded PRNG (Mulberry32). Never uses Math.random().
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Canonical 64-bit FNV-1a hex digest for setup & condition snapshots.
 */
export function fnv1aHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + ((i & 7) << 4);
    h2 = Math.imul(h2, 0x01000193);
  }
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${p1}${p2}`;
}

function canonicalStringify(val: unknown): string {
  if (val === null || typeof val !== 'object') {
    if (typeof val === 'number') {
      return Number.isFinite(val) ? Number(val.toFixed(6)).toString() : '0';
    }
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const rec = val as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return `{${keys
    .filter((k) => rec[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify(rec[k])}`)
    .join(',')}}`;
}

export interface AmbientConditionsSnapshot {
  trackId: MapId;
  weather: WeatherPreset;
  airTempC: number;
  trackTempC: number;
  humidityPct: number;
  windSpeedMps: number;
  windDirDeg: number;
  surfaceGripScale: number;
}

export function getDefaultTestConditions(trackId: MapId = 'aurelia_ridge'): AmbientConditionsSnapshot {
  return {
    trackId,
    weather: 'dry',
    airTempC: 24,
    trackTempC: 30,
    humidityPct: 45,
    windSpeedMps: 0,
    windDirDeg: 0,
    surfaceGripScale: 1.0,
  };
}

export interface SetupSnapshot {
  carId: AnyCarSpecId;
  setup: CarSetupConfig;
  cockpitDials: CockpitDialState;
  assists: VehicleAssists;
  startingTireLife: [number, number, number, number];
  startingFuelLiters: number;
  startingBrakeTempC: [number, number, number, number];
  conditions: AmbientConditionsSnapshot;
}

export function buildSetupSnapshot(params: {
  carId: AnyCarSpecId;
  setup?: CarSetupConfig;
  cockpitDials?: CockpitDialState;
  assists?: VehicleAssists;
  startingFuelLiters?: number;
  conditions?: AmbientConditionsSnapshot;
}): SetupSnapshot {
  const spec = VEHICLE_SPECS[params.carId] ?? VEHICLE_SPECS['bmw-m4-gt3-evo'];
  const setup = params.setup ? { ...params.setup } : getDefaultCarSetup(params.carId);
  const cockpitDials = params.cockpitDials
    ? { ...params.cockpitDials }
    : getDefaultCockpitDials();
  const assists = params.assists ? { ...params.assists } : { ...DEFAULT_SIM_ASSISTS };
  const conditions = params.conditions
    ? { ...params.conditions }
    : getDefaultTestConditions();
  return {
    carId: params.carId,
    setup,
    cockpitDials,
    assists,
    startingTireLife: [1, 1, 1, 1],
    startingFuelLiters: params.startingFuelLiters ?? Number((spec.fuelMaxLiters * 0.55).toFixed(2)),
    startingBrakeTempC: [140, 140, 130, 130],
    conditions,
  };
}

export function computeConditionsHash(conditions: AmbientConditionsSnapshot): string {
  return fnv1aHex(canonicalStringify(conditions));
}

/**
 * Setup hash computed strictly from the starting vehicle state + ambient conditions
 * (never from continuously changing runtime telemetry).
 */
export function computeSetupHash(snapshot: SetupSnapshot): string {
  return fnv1aHex(canonicalStringify(snapshot));
}

export interface RunMetadata {
  runId: string;
  setupHash: string;
  conditionsHash: string;
  botVersion: string;
  simBuildHash: string;
  browserEngine: string;
  mode: 'test' | 'race' | 'benchmark';
  carId: AnyCarSpecId;
  trackId: MapId;
  createdAtIso: string;
}

export function detectBrowserEngineTag(): string {
  if (typeof navigator === 'undefined') return 'node-v8';
  const ua = navigator.userAgent || '';
  if (/Firefox\//.test(ua)) return 'gecko-spidermonkey';
  if (/Edg\//.test(ua) || /Chrome\//.test(ua)) return 'blink-v8';
  if (/Safari\//.test(ua)) return 'webkit-jsc';
  return 'browser-js';
}

export function createRunMetadata(
  snapshot: SetupSnapshot,
  mode: 'test' | 'race' | 'benchmark',
  runSequence = 1,
): RunMetadata {
  const setupHash = computeSetupHash(snapshot);
  const conditionsHash = computeConditionsHash(snapshot.conditions);
  return {
    runId: `${mode}_${setupHash.slice(0, 8)}_${String(runSequence).padStart(3, '0')}`,
    setupHash,
    conditionsHash,
    botVersion: BOT_VERSION,
    simBuildHash: SIM_BUILD_HASH,
    browserEngine: detectBrowserEngineTag(),
    mode,
    carId: snapshot.carId,
    trackId: snapshot.conditions.trackId,
    createdAtIso: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Authored Corner Phase Segmentation (Entry / Apex / Exit) per Track
// ---------------------------------------------------------------------------

export type CornerPhaseId = 'entry' | 'apex' | 'exit';

export interface AuthoredCornerDef {
  cornerId: string;
  name: string;
  sector: 1 | 2 | 3;
  startProg: number; // 0..1 lap progress from start/finish
  entryEndProg: number;
  apexEndProg: number;
  endProg: number;
}

const AUTHORED_CORNERS_BY_MAP: Record<MapId, AuthoredCornerDef[]> = {
  aurelia_ridge: [
    { cornerId: 'T1', name: 'Castlevania Sweeper', sector: 1, startProg: 0.08, entryEndProg: 0.11, apexEndProg: 0.15, endProg: 0.19 },
    { cornerId: 'T2', name: 'East Valley Climb', sector: 1, startProg: 0.19, entryEndProg: 0.22, apexEndProg: 0.26, endProg: 0.30 },
    { cornerId: 'T4', name: 'West Gorge Sweep', sector: 2, startProg: 0.40, entryEndProg: 0.43, apexEndProg: 0.47, endProg: 0.51 },
    { cornerId: 'T6', name: 'Grand Karussell Bowl', sector: 2, startProg: 0.52, entryEndProg: 0.56, apexEndProg: 0.61, endProg: 0.66 },
    { cornerId: 'T8', name: 'East Ridge Hairpin', sector: 2, startProg: 0.66, entryEndProg: 0.69, apexEndProg: 0.72, endProg: 0.75 },
    { cornerId: 'T10', name: 'Canyon Esses', sector: 3, startProg: 0.77, entryEndProg: 0.80, apexEndProg: 0.84, endProg: 0.88 },
    { cornerId: 'T14', name: 'Final Stadium Chicane', sector: 3, startProg: 0.90, entryEndProg: 0.93, apexEndProg: 0.96, endProg: 0.99 },
  ],
  coral_bay: [
    { cornerId: 'T1', name: 'Palm Beach Sweeper', sector: 1, startProg: 0.07, entryEndProg: 0.10, apexEndProg: 0.14, endProg: 0.18 },
    { cornerId: 'T2', name: 'Coral Hook Boomerang', sector: 1, startProg: 0.20, entryEndProg: 0.24, apexEndProg: 0.28, endProg: 0.32 },
    { cornerId: 'T3', name: 'Hammerhead Spit Hairpin', sector: 2, startProg: 0.35, entryEndProg: 0.39, apexEndProg: 0.44, endProg: 0.48 },
    { cornerId: 'T4', name: 'North Limestone Crest', sector: 2, startProg: 0.58, entryEndProg: 0.61, apexEndProg: 0.65, endProg: 0.69 },
    { cornerId: 'T5', name: 'Sunset Bluff Hairpin', sector: 3, startProg: 0.70, entryEndProg: 0.74, apexEndProg: 0.79, endProg: 0.83 },
    { cornerId: 'T6', name: 'Yacht Harbor Chicane', sector: 3, startProg: 0.86, entryEndProg: 0.90, apexEndProg: 0.94, endProg: 0.98 },
  ],
  frostpeak_pass: [
    { cornerId: 'T1', name: 'Summit Crest Hairpin', sector: 1, startProg: 0.07, entryEndProg: 0.11, apexEndProg: 0.15, endProg: 0.19 },
    { cornerId: 'T2', name: 'Gondola Switchbacks', sector: 1, startProg: 0.20, entryEndProg: 0.25, apexEndProg: 0.31, endProg: 0.36 },
    { cornerId: 'T3', name: 'Ski Village Hairpin', sector: 2, startProg: 0.38, entryEndProg: 0.42, apexEndProg: 0.47, endProg: 0.52 },
    { cornerId: 'T4', name: 'East Fjord Hairpin', sector: 2, startProg: 0.62, entryEndProg: 0.66, apexEndProg: 0.71, endProg: 0.75 },
    { cornerId: 'T5', name: 'Glacier Serpentine', sector: 3, startProg: 0.76, entryEndProg: 0.80, apexEndProg: 0.85, endProg: 0.89 },
    { cornerId: 'T6', name: 'Summit Lodge Chicane', sector: 3, startProg: 0.90, entryEndProg: 0.93, apexEndProg: 0.96, endProg: 0.99 },
  ],
  kestrel_peaks: [
    { cornerId: 'T1', name: 'Valley Sweeper', sector: 1, startProg: 0.07, entryEndProg: 0.10, apexEndProg: 0.14, endProg: 0.17 },
    { cornerId: 'T2', name: 'Highland Pine Bend', sector: 1, startProg: 0.18, entryEndProg: 0.21, apexEndProg: 0.24, endProg: 0.27 },
    { cornerId: 'T3', name: 'Granite Climb & East Switchback', sector: 2, startProg: 0.36, entryEndProg: 0.40, apexEndProg: 0.45, endProg: 0.49 },
    { cornerId: 'T4', name: 'Waterfall Gorge Cutback', sector: 2, startProg: 0.50, entryEndProg: 0.53, apexEndProg: 0.56, endProg: 0.59 },
    { cornerId: 'T5', name: 'Cedar Col & Gallery Tunnel', sector: 3, startProg: 0.60, entryEndProg: 0.64, apexEndProg: 0.68, endProg: 0.72 },
    { cornerId: 'T6', name: 'West Gorge Hairpin', sector: 3, startProg: 0.74, entryEndProg: 0.78, apexEndProg: 0.82, endProg: 0.86 },
    { cornerId: 'T7', name: 'Valley Chicane', sector: 3, startProg: 0.89, entryEndProg: 0.92, apexEndProg: 0.95, endProg: 0.98 },
  ],
  akina_pass: [
    { cornerId: 'T1', name: 'Haruna Entry Esses', sector: 1, startProg: 0.12, entryEndProg: 0.16, apexEndProg: 0.20, endProg: 0.24 },
    { cornerId: 'T2', name: 'Gutter Hairpin #1', sector: 1, startProg: 0.28, entryEndProg: 0.31, apexEndProg: 0.35, endProg: 0.39 },
    { cornerId: 'T3', name: 'Gutter Hairpin #2', sector: 2, startProg: 0.42, entryEndProg: 0.45, apexEndProg: 0.49, endProg: 0.53 },
    { cornerId: 'T4', name: 'Gutter Hairpin #3', sector: 2, startProg: 0.56, entryEndProg: 0.59, apexEndProg: 0.63, endProg: 0.67 },
    { cornerId: 'T5', name: 'Five Hairpins Finale', sector: 3, startProg: 0.70, entryEndProg: 0.74, apexEndProg: 0.78, endProg: 0.82 },
    { cornerId: 'T6', name: 'Pine Corridor S-Bends', sector: 3, startProg: 0.84, entryEndProg: 0.87, apexEndProg: 0.90, endProg: 0.94 },
  ],
  akagi_pass: [
    { cornerId: 'T1', name: 'Southern Ridge Sweeper', sector: 1, startProg: 0.14, entryEndProg: 0.18, apexEndProg: 0.22, endProg: 0.26 },
    { cornerId: 'T2', name: 'Double-Apex Bowl', sector: 1, startProg: 0.28, entryEndProg: 0.32, apexEndProg: 0.36, endProg: 0.40 },
    { cornerId: 'T3', name: 'White Comet Hairpin', sector: 2, startProg: 0.45, entryEndProg: 0.49, apexEndProg: 0.53, endProg: 0.57 },
    { cornerId: 'T4', name: 'Canyon Switchback', sector: 2, startProg: 0.60, entryEndProg: 0.64, apexEndProg: 0.68, endProg: 0.72 },
    { cornerId: 'T5', name: 'Valley Hairpin', sector: 3, startProg: 0.78, entryEndProg: 0.82, apexEndProg: 0.86, endProg: 0.90 },
  ],
  myogi_pass: [
    { cornerId: 'T1', name: 'Rock Face Hairpin', sector: 1, startProg: 0.16, entryEndProg: 0.20, apexEndProg: 0.24, endProg: 0.28 },
    { cornerId: 'T2', name: 'Cliffside Hairpin #1', sector: 1, startProg: 0.30, entryEndProg: 0.34, apexEndProg: 0.38, endProg: 0.42 },
    { cornerId: 'T3', name: 'Night Kids Hairpin', sector: 2, startProg: 0.48, entryEndProg: 0.52, apexEndProg: 0.56, endProg: 0.60 },
    { cornerId: 'T4', name: 'Lower Gorge Hairpin', sector: 2, startProg: 0.64, entryEndProg: 0.68, apexEndProg: 0.72, endProg: 0.76 },
    { cornerId: 'T5', name: 'Valley Exit Bend', sector: 3, startProg: 0.82, entryEndProg: 0.85, apexEndProg: 0.89, endProg: 0.93 },
  ],
};

export function getAuthoredCorners(mapId: MapId): ReadonlyArray<AuthoredCornerDef> {
  return AUTHORED_CORNERS_BY_MAP[mapId] ?? AUTHORED_CORNERS_BY_MAP.aurelia_ridge;
}

export interface CornerClassification {
  cornerId: string;
  cornerName: string;
  phase: CornerPhaseId | 'straight';
  sector: 1 | 2 | 3;
  progress: number;
}

export function classifyTrackProgress(
  circuit: CircuitData,
  trackT: number,
): CornerClassification {
  const sfT = circuit.samples[circuit.startFinishIndex]?.t ?? 0;
  const progress = circuit.closedLoop
    ? ((trackT - sfT) % 1 + 1) % 1
    : Math.max(0, Math.min(1, (trackT - sfT) / Math.max(0.05, 0.992 - sfT)));
  const sector: 1 | 2 | 3 = progress < 0.3333 ? 1 : progress < 0.6667 ? 2 : 3;
  const corners = getAuthoredCorners(circuit.mapId);
  for (let i = 0; i < corners.length; i++) {
    const c = corners[i];
    if (progress >= c.startProg && progress <= c.endProg) {
      const phase: CornerPhaseId =
        progress < c.entryEndProg
          ? 'entry'
          : progress < c.apexEndProg
            ? 'apex'
            : 'exit';
      return {
        cornerId: c.cornerId,
        cornerName: c.name,
        phase,
        sector: c.sector,
        progress,
      };
    }
  }
  return {
    cornerId: 'STR',
    cornerName: 'Straight',
    phase: 'straight',
    sector,
    progress,
  };
}

// ---------------------------------------------------------------------------
// Test Mode & Fixed-Input Skidpad / Straight-Line Braking Benchmarks
// ---------------------------------------------------------------------------

export interface TestModeConfig {
  enabled: boolean;
  fixedFuelFrac: number; // e.g. 0.55
  fixedTireLife: 1.0;
  lockedConditions: AmbientConditionsSnapshot;
}

export function getDefaultTestModeConfig(trackId: MapId = 'aurelia_ridge'): TestModeConfig {
  return {
    enabled: false,
    fixedFuelFrac: 0.55,
    fixedTireLife: 1.0,
    lockedConditions: getDefaultTestConditions(trackId),
  };
}

export interface SkidpadBenchmarkResult {
  carId: AnyCarSpecId;
  setupHash: string;
  conditionsHash: string;
  simBuildHash: string;
  steadySpeedKmh: number;
  peakLatG: number;
  steadyLatG: number;
  frontSlipDeg: number;
  rearSlipDeg: number;
  understeerDeg: number; // positive = understeer (front alpha > rear alpha), negative = oversteer
  turnRadiusM: number;
  stable: boolean;
}

export interface BrakingBenchmarkResult {
  carId: AnyCarSpecId;
  setupHash: string;
  conditionsHash: string;
  simBuildHash: string;
  entrySpeedKmh: number;
  brakingDistanceM: number;
  brakingTimeSec: number;
  peakDecelG: number;
  avgDecelG: number;
  absActivePct: number;
  peakBrakeTempC: number;
  brakeFadeOccurred: boolean;
}

export function runSkidpadBenchmark(
  carId: AnyCarSpecId,
  setup?: CarSetupConfig,
  assists?: VehicleAssists,
  seed = 0x51d9ad,
): SkidpadBenchmarkResult {
  const rng = createSeededRng(seed);
  void rng(); // deterministic seed anchor
  const snapshot = buildSetupSnapshot({ carId, setup, assists });
  const eng = new VehiclePhysicsEngine(createFlatTrackAdapter(1.0));
  eng.setCarModel(carId);
  eng.setCarSetup(snapshot.setup);
  eng.setCockpitDials(snapshot.cockpitDials);
  eng.setTestMode(true, snapshot.startingFuelLiters);
  eng.setStateForTest({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 30,
    yaw: 0,
    omega: 0,
    gear: 3,
    countdownTimer: 0,
  });

  const dt = 1 / 60;
  let peakLatG = 0;
  let latSum = 0;
  let frontAlphaSum = 0;
  let rearAlphaSum = 0;
  let sampleCount = 0;
  let tlm!: VehicleTelemetry;

  // Ramp steering cleanly to 80% lock while modulating throttle to hold cornering speed
  for (let i = 0; i < 240; i++) {
    const steerRamp = Math.min(0.82, ((i + 1) / 36) * 0.82);
    const input: VehicleControlsInput = {
      ...IDLE_INPUT,
      steerLeft: true,
      steerAxis: steerRamp,
      throttle: true,
      throttleVal: 0.58,
    };
    tlm = eng.step(dt, input, snapshot.assists, 'dry');
    peakLatG = Math.max(peakLatG, Math.abs(tlm.latG));
    if (i >= 120) {
      latSum += Math.abs(tlm.latG);
      frontAlphaSum += (Math.abs(tlm.tires.fl.alphaDeg) + Math.abs(tlm.tires.fr.alphaDeg)) * 0.5;
      rearAlphaSum += (Math.abs(tlm.tires.rl.alphaDeg) + Math.abs(tlm.tires.rr.alphaDeg)) * 0.5;
      sampleCount++;
    }
  }

  const steadyLatG = sampleCount > 0 ? latSum / sampleCount : Math.abs(tlm.latG);
  const frontSlipDeg = sampleCount > 0 ? frontAlphaSum / sampleCount : 0;
  const rearSlipDeg = sampleCount > 0 ? rearAlphaSum / sampleCount : 0;
  const understeerDeg = frontSlipDeg - rearSlipDeg;
  const speedMps = tlm.speedMps;
  const turnRadiusM = steadyLatG > 0.1 ? (speedMps * speedMps) / (steadyLatG * 9.81) : 999;

  return {
    carId,
    setupHash: computeSetupHash(snapshot),
    conditionsHash: computeConditionsHash(snapshot.conditions),
    simBuildHash: SIM_BUILD_HASH,
    steadySpeedKmh: Number(tlm.speedKmh.toFixed(1)),
    peakLatG: Number(peakLatG.toFixed(3)),
    steadyLatG: Number(steadyLatG.toFixed(3)),
    frontSlipDeg: Number(frontSlipDeg.toFixed(2)),
    rearSlipDeg: Number(rearSlipDeg.toFixed(2)),
    understeerDeg: Number(understeerDeg.toFixed(2)),
    turnRadiusM: Number(turnRadiusM.toFixed(1)),
    stable: rearSlipDeg < 12.0 && steadyLatG >= 1.15,
  };
}

export function runStraightLineBrakingBenchmark(
  carId: AnyCarSpecId,
  setup?: CarSetupConfig,
  assists?: VehicleAssists,
  seed = 0x67a4e1,
): BrakingBenchmarkResult {
  const rng = createSeededRng(seed);
  void rng();
  const snapshot = buildSetupSnapshot({ carId, setup, assists });
  const eng = new VehiclePhysicsEngine(createFlatTrackAdapter(1.0));
  eng.setCarModel(carId);
  eng.setCarSetup(snapshot.setup);
  eng.setCockpitDials(snapshot.cockpitDials);
  eng.setTestMode(true, snapshot.startingFuelLiters);
  eng.setStateForTest({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    omega: 0,
    gear: 1,
    countdownTimer: 0,
  });

  const dt = 1 / 60;
  let tlm!: VehicleTelemetry;
  // Phase 1: Accelerate WOT until >= 200 km/h (max 600 steps = 10s)
  for (let i = 0; i < 600; i++) {
    tlm = eng.step(
      dt,
      { ...IDLE_INPUT, throttle: true, throttleVal: 1.0 },
      snapshot.assists,
      'dry',
    );
    if (tlm.speedKmh >= 200) break;
  }

  const entrySpeedKmh = tlm.speedKmh;
  const startBrakeZ = tlm.posZ;
  let brakeSteps = 0;
  let absSteps = 0;
  let peakDecelG = 0;
  let decelSumG = 0;
  let peakBrakeTempC = 0;
  let brakeFadeOccurred = false;

  // Phase 2: Full threshold braking to < 1.5 km/h
  for (let i = 0; i < 420; i++) {
    tlm = eng.step(
      dt,
      { ...IDLE_INPUT, brake: true, brakeVal: 1.0 },
      snapshot.assists,
      'dry',
    );
    brakeSteps++;
    if (tlm.absActive) absSteps++;
    const decel = Math.max(0, -tlm.lonG);
    peakDecelG = Math.max(peakDecelG, decel);
    decelSumG += decel;
    peakBrakeTempC = Math.max(
      peakBrakeTempC,
      tlm.tires.fl.brakeTempC,
      tlm.tires.fr.brakeTempC,
      tlm.tires.rl.brakeTempC,
      tlm.tires.rr.brakeTempC,
    );
    if (tlm.brakeFadeCount > 0) brakeFadeOccurred = true;
    if (tlm.speedKmh < 1.5) break;
  }

  const brakingDistanceM = Math.max(0.1, tlm.posZ - startBrakeZ);
  const brakingTimeSec = brakeSteps * dt;

  return {
    carId,
    setupHash: computeSetupHash(snapshot),
    conditionsHash: computeConditionsHash(snapshot.conditions),
    simBuildHash: SIM_BUILD_HASH,
    entrySpeedKmh: Number(entrySpeedKmh.toFixed(1)),
    brakingDistanceM: Number(brakingDistanceM.toFixed(2)),
    brakingTimeSec: Number(brakingTimeSec.toFixed(3)),
    peakDecelG: Number(peakDecelG.toFixed(3)),
    avgDecelG: Number((brakeSteps > 0 ? decelSumG / brakeSteps : 0).toFixed(3)),
    absActivePct: Number((brakeSteps > 0 ? (absSteps / brakeSteps) * 100 : 0).toFixed(1)),
    peakBrakeTempC: Math.round(peakBrakeTempC),
    brakeFadeOccurred,
  };
}
