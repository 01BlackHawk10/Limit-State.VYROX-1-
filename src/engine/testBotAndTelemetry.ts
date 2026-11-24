import { type CircuitData, getCircuitData } from '../Maps/Aurelia Ridge/circuitSpline';
import type { MapId } from '../Maps/mapRegistry';
import { computeEffectiveSpecs } from './carCustomization';
import {
  BOT_VERSION,
  buildSetupSnapshot,
  classifyTrackProgress,
  computeConditionsHash,
  computeSetupHash,
  type CornerPhaseId,
  createRunMetadata,
  createSeededRng,
  getAuthoredCorners,
  type RunMetadata,
  type SetupSnapshot,
  SIM_BUILD_HASH,
} from './deterministicCore';
import { clamp, lerp } from './mathNoise';
import type { AnyCarSpecId } from '../shared/carTypes';
import {
  type CarSetupConfig,
  TIRE_COMPOUNDS,
  VEHICLE_SPECS,
  type VehicleAssists,
  type VehicleControlsInput,
  VehiclePhysicsEngine,
  type VehicleTelemetry,
} from './vehiclePhysics';

export interface FullRateTelemetrySample {
  timeMs: number;
  progress: number;
  trackT: number;
  cornerId: string;
  phase: CornerPhaseId | 'straight';
  sector: 1 | 2 | 3;
  speedKmh: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  steerNorm: number;
  latG: number;
  lonG: number;
  frontSlipDeg: number;
  rearSlipDeg: number;
  understeerDeg: number;
  frontFzN: number;
  rearFzN: number;
  travelMm: number;
  downforceKgf: number;
  oilTempC: number;
  waterTempC: number;
  maxBrakeTempC: number;
  fuelLiters: number;
  governorActive: boolean;
}

export interface CornerPhaseSummary {
  key: string; // e.g. "T4:apex"
  cornerId: string;
  cornerName: string;
  phase: CornerPhaseId;
  sector: 1 | 2 | 3;
  sampleCount: number;
  durationMs: number;
  avgSpeedKmh: number;
  minSpeedKmh: number;
  maxLatG: number;
  avgFrontSlipDeg: number;
  avgRearSlipDeg: number;
  understeerDeg: number;
  peakBrakeTempC: number;
  avgOilTempC: number;
  avgWaterTempC: number;
  avgDownforceKgf: number;
  avgTravelMm: number;
  governorHits: number;
}

export interface GovernorEngagementLog {
  timeMs: number;
  progress: number;
  cornerId: string;
  phase: CornerPhaseId | 'straight';
  slipRatioToPeak: number;
  distanceM: number;
}

export interface TelemetryEventCounts {
  kerbStrikes: number;
  shifts: number;
  revLimiterHits: number;
  offTrackMistakes: number;
  bottomingEvents: number;
}

export interface DriverConsistencyMetrics {
  lapTimesMs: number[];
  stdDevMs: number;
  inputSmoothnessPct: number;
}

export interface RunTelemetryRecord {
  metadata: RunMetadata;
  snapshot: SetupSnapshot;
  source: 'bot' | 'human';
  lapTimeMs: number;
  sectorTimesMs: [number, number, number];
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  maxLatG: number;
  avgUndersteerDeg: number;
  peakBrakeTempC: number;
  peakOilTempC: number;
  peakWaterTempC: number;
  fuelUsedLiters: number;
  governorEngagements: number;
  governorDistanceFrac: number;
  lowConfidence: boolean;
  confidenceReason: string;
  alphaPeakDeg: number;
  governorLogs: GovernorEngagementLog[];
  events: TelemetryEventCounts;
  consistency: DriverConsistencyMetrics;
  phaseSummaries: CornerPhaseSummary[];
  /** Stored ONLY for current & reference runs; stripped from older history runs */
  fullRateSamples: FullRateTelemetrySample[];
}

export interface CompactRunHistoryEntry {
  metadata: RunMetadata;
  source: 'bot' | 'human';
  lapTimeMs: number;
  lowConfidence: boolean;
  governorEngagements: number;
  maxLatG: number;
  avgUndersteerDeg: number;
  peakBrakeTempC: number;
  peakOilTempC: number;
  phaseSummaries: CornerPhaseSummary[];
}

export const BOT_TEST_ASSISTS: VehicleAssists = {
  autoGear: true,
  abs: true,
  tcs: true,
  steerSensitivity: 1.0,
  autoPitService: false,
  ffbIntensity: 0,
  physicsPreset: 'simulation',
};

const IDLE_BOT_INPUT: VehicleControlsInput = {
  throttle: false,
  brake: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
  lookBack: false,
  throttleVal: 0,
  brakeVal: 0,
  steerAxis: 0,
  handbrakeVal: 0,
};

/**
 * Frozen pre-lap speed profile computed in a single deterministic pass
 * from the setup's effective tire, brake, mass, and aero parameters (no iteration).
 */
export function computeFrozenBotSpeedProfile(
  circuit: CircuitData,
  carId: AnyCarSpecId,
  setup: CarSetupConfig,
): { targetSpeedsMps: Float32Array; alphaPeakDeg: number; muEst: number } {
  const n = circuit.samples.length;
  const targetSpeeds = new Float32Array(n);
  const baseSpec = VEHICLE_SPECS[carId] ?? VEHICLE_SPECS['bmw-m4-gt3-evo'];
  const eff = computeEffectiveSpecs(baseSpec, setup);
  const compound = TIRE_COMPOUNDS[setup.tireCompound] ?? TIRE_COMPOUNDS.racing_hard;

  const muEst =
    1.44 *
    circuit.gripScale *
    compound.gripMult *
    setup.tireGripTrim *
    baseSpec.mechGripBoost;

  // Peak slip angle threshold for stability governor (0.85..1.05x window)
  const alphaPeakDeg = clamp(11.4 / Math.pow(compound.stiffnessMult, 0.35), 9.0, 14.5);

  // Frozen reference aero downforce at nominal 42 m/s cornering speed (no iteration)
  const refV = 42.0;
  const totalDfCoeff =
    0.5 *
    1.225 *
    (baseSpec.downforceFront * eff.downforceFrontMult +
      baseSpec.downforceRear * eff.downforceRearMult);
  const frozenDfN = totalDfCoeff * refV * refV;
  const estMassKg = eff.massKg + baseSpec.fuelMaxLiters * 0.55 * 0.74;
  const effectiveG = 9.81 * (1.0 + frozenDfN / (estMassKg * 9.81));

  // 1) Curvature-limited lateral speed (max of tight & medium curvature windows)
  for (let i = 0; i < n; i++) {
    const p1 = circuit.samples[(i - 1 + n) % n];
    const n1 = circuit.samples[(i + 1) % n];
    const p3 = circuit.samples[(i - 3 + n) % n];
    const n3 = circuit.samples[(i + 3) % n];
    const ds1 = Math.max(1.0, (2 / n) * circuit.totalLength);
    const ds3 = Math.max(3.0, (6 / n) * circuit.totalLength);
    const k1 = Math.acos(clamp(p1.tangent.x * n1.tangent.x + p1.tangent.z * n1.tangent.z, -1, 1)) / ds1;
    const k3 = Math.acos(clamp(p3.tangent.x * n3.tangent.x + p3.tangent.z * n3.tangent.z, -1, 1)) / ds3;
    const roadPenalty = Math.abs(circuit.samples[i].curvature ?? 0);
    const k = Math.max(0.0006, k1, k3, roadPenalty);
    const vLatMax = Math.sqrt((muEst * effectiveG * 0.68) / k);
    targetSpeeds[i] = clamp(vLatMax, 13.0, 88.0);
  }

  const dsSeg = circuit.totalLength / n;
  const maxBrakeDecel = (eff.maxBrakeForce / estMassKg) * 0.62;
  const maxAccel = clamp((eff.maxPowerWatts / (estMassKg * 38)) * 0.68, 4.2, 10.5);

  // 2) Back-propagated braking pass (two cyclic wraps to respect S/F boundary)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const nextIdx = (i + 1) % n;
      const vNext = targetSpeeds[nextIdx];
      const vBrake = Math.sqrt(vNext * vNext + 2 * maxBrakeDecel * dsSeg);
      if (vBrake < targetSpeeds[i]) {
        targetSpeeds[i] = vBrake;
      }
    }
  }

  // 3) Forward-propagated acceleration pass
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const prevIdx = (i - 1 + n) % n;
      const vPrev = targetSpeeds[prevIdx];
      const vAccel = Math.sqrt(vPrev * vPrev + 2 * maxAccel * dsSeg);
      if (vAccel < targetSpeeds[i]) {
        targetSpeeds[i] = vAccel;
      }
    }
  }

  return { targetSpeedsMps: targetSpeeds, alphaPeakDeg, muEst };
}

function buildPhaseSummaries(
  mapId: MapId,
  samples: FullRateTelemetrySample[],
): CornerPhaseSummary[] {
  const corners = getAuthoredCorners(mapId);
  const phases: CornerPhaseId[] = ['entry', 'apex', 'exit'];
  const buckets = new Map<string, FullRateTelemetrySample[]>();

  for (const c of corners) {
    for (const p of phases) {
      buckets.set(`${c.cornerId}:${p}`, []);
    }
  }

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s.phase === 'straight') continue;
    const key = `${s.cornerId}:${s.phase}`;
    const arr = buckets.get(key);
    if (arr) arr.push(s);
  }

  const dtSampleMs =
    samples.length > 1 ? Math.max(8, (samples[samples.length - 1].timeMs - samples[0].timeMs) / samples.length) : 16.67;

  const out: CornerPhaseSummary[] = [];
  for (const c of corners) {
    for (const p of phases) {
      const key = `${c.cornerId}:${p}`;
      const arr = buckets.get(key) ?? [];
      if (arr.length === 0) {
        out.push({
          key,
          cornerId: c.cornerId,
          cornerName: c.name,
          phase: p,
          sector: c.sector,
          sampleCount: 0,
          durationMs: 0,
          avgSpeedKmh: 0,
          minSpeedKmh: 0,
          maxLatG: 0,
          avgFrontSlipDeg: 0,
          avgRearSlipDeg: 0,
          understeerDeg: 0,
          peakBrakeTempC: 0,
          avgOilTempC: 0,
          avgWaterTempC: 0,
          avgDownforceKgf: 0,
          avgTravelMm: 0,
          governorHits: 0,
        });
        continue;
      }
      let sumSpd = 0;
      let minSpd = Infinity;
      let maxLatG = 0;
      let sumFSlip = 0;
      let sumRSlip = 0;
      let sumUS = 0;
      let peakBrk = 0;
      let sumOil = 0;
      let sumWater = 0;
      let sumDf = 0;
      let sumTravel = 0;
      let govHits = 0;
      for (const s of arr) {
        sumSpd += s.speedKmh;
        if (s.speedKmh < minSpd) minSpd = s.speedKmh;
        if (Math.abs(s.latG) > maxLatG) maxLatG = Math.abs(s.latG);
        sumFSlip += s.frontSlipDeg;
        sumRSlip += s.rearSlipDeg;
        sumUS += s.understeerDeg;
        if (s.maxBrakeTempC > peakBrk) peakBrk = s.maxBrakeTempC;
        sumOil += s.oilTempC;
        sumWater += s.waterTempC;
        sumDf += s.downforceKgf;
        sumTravel += s.travelMm;
        if (s.governorActive) govHits++;
      }
      const inv = 1 / arr.length;
      out.push({
        key,
        cornerId: c.cornerId,
        cornerName: c.name,
        phase: p,
        sector: c.sector,
        sampleCount: arr.length,
        durationMs: Math.round(arr.length * dtSampleMs),
        avgSpeedKmh: Number((sumSpd * inv).toFixed(2)),
        minSpeedKmh: Number(minSpd.toFixed(2)),
        maxLatG: Number(maxLatG.toFixed(3)),
        avgFrontSlipDeg: Number((sumFSlip * inv).toFixed(2)),
        avgRearSlipDeg: Number((sumRSlip * inv).toFixed(2)),
        understeerDeg: Number((sumUS * inv).toFixed(2)),
        peakBrakeTempC: Math.round(peakBrk),
        avgOilTempC: Number((sumOil * inv).toFixed(1)),
        avgWaterTempC: Number((sumWater * inv).toFixed(1)),
        avgDownforceKgf: Math.round(sumDf * inv),
        avgTravelMm: Number((sumTravel * inv).toFixed(2)),
        governorHits: govHits,
      });
    }
  }
  return out;
}

export function runReferenceBotLap(params: {
  carId: AnyCarSpecId;
  setup: CarSetupConfig;
  mapId?: MapId;
  seed?: number;
  runSequence?: number;
  startingFuelLiters?: number;
  sampleStride?: number; // e.g. 2 stores 30Hz samples cleanly
}): RunTelemetryRecord {
  const circuit = getCircuitData();
  const mapId = params.mapId ?? circuit.mapId;
  const snapshot = buildSetupSnapshot({
    carId: params.carId,
    setup: params.setup,
    assists: BOT_TEST_ASSISTS,
    startingFuelLiters: params.startingFuelLiters,
  });
  snapshot.conditions.trackId = mapId;
  const metadata = createRunMetadata(snapshot, 'test', params.runSequence ?? 1);
  const rng = createSeededRng(params.seed ?? 0x420f17);
  void rng();

  const { targetSpeedsMps, alphaPeakDeg } = computeFrozenBotSpeedProfile(
    circuit,
    params.carId,
    snapshot.setup,
  );

  const eng = new VehiclePhysicsEngine();
  eng.setCarModel(params.carId);
  eng.setCarSetup(snapshot.setup);
  eng.setCockpitDials(snapshot.cockpitDials);
  eng.setTestMode(true, snapshot.startingFuelLiters);
  eng.setDeterministicSeed(params.seed ?? 0x420f17);

  // Rolling-start launch just behind Start/Finish line so Lap 1 captures clean full lap
  const sfIdx = circuit.startFinishIndex;
  const launchT = (circuit.samples[sfIdx].t - 28 / circuit.totalLength + 1) % 1;
  const launchSample = circuit.sampleAtT(launchT);
  const launchIdx = Math.floor(launchT * circuit.samples.length) % circuit.samples.length;
  const launchSpeedMps = clamp(targetSpeedsMps[launchIdx] * 0.92, 22, 68);
  const launchYaw = Math.atan2(launchSample.tangent.x, launchSample.tangent.z);

  eng.setStateForTest({
    x: launchSample.position.x,
    y: launchSample.position.y,
    z: launchSample.position.z,
    vx: Math.sin(launchYaw) * launchSpeedMps,
    vy: 0,
    vz: Math.cos(launchYaw) * launchSpeedMps,
    yaw: launchYaw,
    omega: 0,
    gear: 3,
    countdownTimer: 0,
  });

  const dt = 1 / 60;
  const maxSteps = 12000; // up to 200 seconds safety cap
  const govEnterDeg = alphaPeakDeg * 0.85;
  const govHardDeg = alphaPeakDeg * 1.05;

  const samples: FullRateTelemetrySample[] = [];
  const governorLogs: GovernorEngagementLog[] = [];

  let lapStarted = false;
  let lapStartTimeMs = 0;
  let lastProgress = 0.98;
  let sectorStartMs = 0;
  const sectorTimesMs: [number, number, number] = [0, 0, 0];
  let prevSector: 1 | 2 | 3 = 1;

  let govCurrentlyActive = false;
  let govDistanceAccum = 0;
  let totalGovDistanceM = 0;
  let prevSteer = 0;
  let prevThrottle = 0;
  let steerJerkSum = 0;
  let thrJerkSum = 0;
  let lapSampleSteps = 0;

  let prevGear = 3;
  let prevSurface: VehicleTelemetry['surface'] = 'tarmac';
  const events: TelemetryEventCounts = {
    kerbStrikes: 0,
    shifts: 0,
    revLimiterHits: 0,
    offTrackMistakes: 0,
    bottomingEvents: 0,
  };

  let lastTlm!: VehicleTelemetry;
  const sampleStride = Math.max(1, params.sampleStride ?? 2);

  for (let stepIdx = 0; stepIdx < maxSteps; stepIdx++) {
    const q = circuit.queryNearest(eng.pos.x, eng.pos.z, eng.pos.y);
    const speedMps = Math.hypot(eng.vx, eng.vz);
    const lookaheadM = clamp(12.0 + speedMps * 0.34, 12.0, 34.0);
    const aheadT = (q.t + lookaheadM / circuit.totalLength) % 1;
    const aheadSample = circuit.sampleAtT(aheadT);

    // Pure-pursuit lateral steering with yaw-rate damping toward centerline ahead
    const dx = aheadSample.position.x - eng.pos.x;
    const dz = aheadSample.position.z - eng.pos.z;
    const fwdX = Math.sin(eng.yaw);
    const fwdZ = Math.cos(eng.yaw);
    const leftX = Math.cos(eng.yaw);
    const leftZ = -Math.sin(eng.yaw);
    const localFwd = dx * fwdX + dz * fwdZ;
    const localLeft = dx * leftX + dz * leftZ;
    const headingErr = Math.atan2(localLeft, Math.max(2.5, localFwd));
    let steerCmd = clamp(headingErr * 1.95 - eng.omega * 0.14, -1, 1);

    // Target speed profile: respect both current corner apex limit and upcoming braking zone
    const curIdx = Math.floor(q.t * circuit.samples.length) % circuit.samples.length;
    const spdLookT = (q.t + clamp(8 + speedMps * 0.38, 8, 38) / circuit.totalLength) % 1;
    const spdIdx = Math.floor(spdLookT * circuit.samples.length) % circuit.samples.length;
    const targetV = Math.min(targetSpeedsMps[curIdx], targetSpeedsMps[spdIdx]);
    const vErr = targetV - speedMps;

    let throttleCmd = vErr > 0.3 ? clamp(vErr / 4.2, 0.15, 1.0) : vErr > -1.2 ? 0.18 : 0;
    let brakeCmd = vErr < -1.0 ? clamp((-vErr - 0.8) / 5.0, 0.08, 1.0) : 0;

    // Stability Governor inside 0.85..1.05x peak slip angle window
    const curRearAlpha = lastTlm
      ? (Math.abs(lastTlm.tires.rl.alphaDeg) + Math.abs(lastTlm.tires.rr.alphaDeg)) * 0.5
      : 0;
    const curFrontAlpha = lastTlm
      ? (Math.abs(lastTlm.tires.fl.alphaDeg) + Math.abs(lastTlm.tires.fr.alphaDeg)) * 0.5
      : 0;
    const peakCornerAlpha = Math.max(curRearAlpha, curFrontAlpha);

    let governorActive = false;
    if (lapStarted && peakCornerAlpha > govEnterDeg && speedMps > 12) {
      governorActive = true;
      const frac = clamp((peakCornerAlpha - govEnterDeg) / Math.max(0.5, govHardDeg - govEnterDeg), 0, 1);
      throttleCmd *= lerp(0.86, 0.38, frac);
      steerCmd *= lerp(0.95, 0.72, frac);
      if (peakCornerAlpha >= govHardDeg) {
        brakeCmd = Math.max(brakeCmd, 0.18);
      }
      govDistanceAccum += speedMps * dt;
      totalGovDistanceM += speedMps * dt;
    }

    const input: VehicleControlsInput = {
      ...IDLE_BOT_INPUT,
      throttle: throttleCmd > 0.02,
      brake: brakeCmd > 0.02,
      steerLeft: steerCmd > 0.02,
      steerRight: steerCmd < -0.02,
      throttleVal: throttleCmd,
      brakeVal: brakeCmd,
      steerAxis: steerCmd,
    };

    lastTlm = eng.step(dt, input, BOT_TEST_ASSISTS, 'dry');
    const cls = classifyTrackProgress(circuit, lastTlm.trackT);

    if (!lapStarted) {
      if (lastProgress > 0.82 && cls.progress < 0.18) {
        lapStarted = true;
        lapStartTimeMs = (stepIdx + 1) * dt * 1000;
        sectorStartMs = 0;
        prevSector = 1;
        prevGear = lastTlm.gear;
        prevSurface = lastTlm.surface;
      }
      lastProgress = cls.progress;
      continue;
    }

    const lapElapsedMs = (stepIdx + 1) * dt * 1000 - lapStartTimeMs;
    lapSampleSteps++;
    steerJerkSum += Math.abs(steerCmd - prevSteer);
    thrJerkSum += Math.abs(throttleCmd - prevThrottle);
    prevSteer = steerCmd;
    prevThrottle = throttleCmd;

    if (governorActive && !govCurrentlyActive) {
      govCurrentlyActive = true;
      govDistanceAccum = speedMps * dt;
      governorLogs.push({
        timeMs: Math.round(lapElapsedMs),
        progress: Number(cls.progress.toFixed(4)),
        cornerId: cls.cornerId,
        phase: cls.phase,
        slipRatioToPeak: Number((peakCornerAlpha / alphaPeakDeg).toFixed(3)),
        distanceM: 0,
      });
    } else if (!governorActive && govCurrentlyActive && peakCornerAlpha < govEnterDeg - 0.55) {
      govCurrentlyActive = false;
      if (governorLogs.length > 0) {
        governorLogs[governorLogs.length - 1].distanceM = Number(govDistanceAccum.toFixed(2));
      }
    }

    if (lastTlm.gear !== prevGear) {
      events.shifts++;
      prevGear = lastTlm.gear;
    }
    if (lastTlm.rpm >= lastTlm.redlineRpm * 0.992) events.revLimiterHits++;
    if (lastTlm.surface === 'kerb' && prevSurface !== 'kerb') events.kerbStrikes++;
    if (lastTlm.surface === 'offroad' && prevSurface !== 'offroad') events.offTrackMistakes++;
    prevSurface = lastTlm.surface;

    if (prevSector === 1 && cls.sector === 2 && sectorTimesMs[0] === 0) {
      sectorTimesMs[0] = Math.round(lapElapsedMs - sectorStartMs);
      sectorStartMs = lapElapsedMs;
    } else if (prevSector === 2 && cls.sector === 3 && sectorTimesMs[1] === 0) {
      sectorTimesMs[1] = Math.round(lapElapsedMs - sectorStartMs);
      sectorStartMs = lapElapsedMs;
    }
    prevSector = cls.sector;

    const frontSlipDeg = (Math.abs(lastTlm.tires.fl.alphaDeg) + Math.abs(lastTlm.tires.fr.alphaDeg)) * 0.5;
    const rearSlipDeg = (Math.abs(lastTlm.tires.rl.alphaDeg) + Math.abs(lastTlm.tires.rr.alphaDeg)) * 0.5;
    const understeerDeg = frontSlipDeg - rearSlipDeg;
    const frontFzN = (lastTlm.tires.fl.normalFzN + lastTlm.tires.fr.normalFzN) * 0.5;
    const rearFzN = (lastTlm.tires.rl.normalFzN + lastTlm.tires.rr.normalFzN) * 0.5;
    const avgTravelMm =
      (lastTlm.tires.fl.travelMm + lastTlm.tires.fr.travelMm + lastTlm.tires.rl.travelMm + lastTlm.tires.rr.travelMm) *
      0.25;
    const maxBrkTemp = Math.max(
      lastTlm.tires.fl.brakeTempC,
      lastTlm.tires.fr.brakeTempC,
      lastTlm.tires.rl.brakeTempC,
      lastTlm.tires.rr.brakeTempC,
    );

    if (stepIdx % sampleStride === 0) {
      samples.push({
        timeMs: Math.round(lapElapsedMs),
        progress: Number(cls.progress.toFixed(4)),
        trackT: Number(lastTlm.trackT.toFixed(4)),
        cornerId: cls.cornerId,
        phase: cls.phase,
        sector: cls.sector,
        speedKmh: Number(lastTlm.speedKmh.toFixed(2)),
        rpm: lastTlm.rpm,
        gear: lastTlm.gear,
        throttle: Number(lastTlm.throttle.toFixed(3)),
        brake: Number(lastTlm.brake.toFixed(3)),
        steerNorm: Number(lastTlm.steerNorm.toFixed(3)),
        latG: Number(lastTlm.latG.toFixed(3)),
        lonG: Number(lastTlm.lonG.toFixed(3)),
        frontSlipDeg: Number(frontSlipDeg.toFixed(2)),
        rearSlipDeg: Number(rearSlipDeg.toFixed(2)),
        understeerDeg: Number(understeerDeg.toFixed(2)),
        frontFzN: Math.round(frontFzN),
        rearFzN: Math.round(rearFzN),
        travelMm: Number(avgTravelMm.toFixed(2)),
        downforceKgf: lastTlm.downforceKgf,
        oilTempC: lastTlm.oilTempC,
        waterTempC: lastTlm.waterTempC,
        maxBrakeTempC: maxBrkTemp,
        fuelLiters: lastTlm.fuelLiters,
        governorActive,
      });
    }

    if (lapElapsedMs > 12000 && lastProgress > 0.84 && cls.progress < 0.16) {
      sectorTimesMs[2] = Math.round(lapElapsedMs - sectorStartMs);
      if (govCurrentlyActive && governorLogs.length > 0) {
        governorLogs[governorLogs.length - 1].distanceM = Number(govDistanceAccum.toFixed(2));
      }
      events.bottomingEvents = lastTlm.diagnostics.bottomingEvents;
      break;
    }
    lastProgress = cls.progress;
  }

  const lapTimeMs =
    samples.length > 0 ? samples[samples.length - 1].timeMs : Math.round((sectorTimesMs[0] + sectorTimesMs[1] + sectorTimesMs[2]) || 85000);
  const avgSpd =
    samples.length > 0 ? samples.reduce((a, b) => a + b.speedKmh, 0) / samples.length : 0;
  const maxSpd = samples.reduce((m, s) => Math.max(m, s.speedKmh), 0);
  const maxLatG = samples.reduce((m, s) => Math.max(m, Math.abs(s.latG)), 0);
  const avgUS =
    samples.length > 0 ? samples.reduce((a, b) => a + b.understeerDeg, 0) / samples.length : 0;
  const peakBrakeTempC = samples.reduce((m, s) => Math.max(m, s.maxBrakeTempC), 0);
  const peakOilTempC = samples.reduce((m, s) => Math.max(m, s.oilTempC), 0);
  const peakWaterTempC = samples.reduce((m, s) => Math.max(m, s.waterTempC), 0);

  const governorEngagements = governorLogs.length;
  const governorDistanceFrac = clamp(totalGovDistanceM / Math.max(800, circuit.totalLength), 0, 1);
  const lowConfidence = governorEngagements > 3 || governorDistanceFrac > 0.05;
  const confidenceReason =
    governorEngagements > 3
      ? `Low Confidence: ${governorEngagements} governor engagements (> 3/lap limit)`
      : governorDistanceFrac > 0.05
        ? `Low Confidence: ${(governorDistanceFrac * 100).toFixed(1)}% lap distance under governor (> 5% limit)`
        : `Valid Reference Run (${governorEngagements} eng · ${(governorDistanceFrac * 100).toFixed(1)}% dist)`;

  const meanJerk = (steerJerkSum + thrJerkSum) / Math.max(1, lapSampleSteps);
  const inputSmoothnessPct = Number(clamp(100 - meanJerk * 420, 45, 99.5).toFixed(1));

  return {
    metadata,
    snapshot,
    source: 'bot',
    lapTimeMs,
    sectorTimesMs,
    avgSpeedKmh: Number(avgSpd.toFixed(1)),
    maxSpeedKmh: Number(maxSpd.toFixed(1)),
    maxLatG: Number(maxLatG.toFixed(3)),
    avgUndersteerDeg: Number(avgUS.toFixed(2)),
    peakBrakeTempC: Math.round(peakBrakeTempC),
    peakOilTempC: Number(peakOilTempC.toFixed(1)),
    peakWaterTempC: Number(peakWaterTempC.toFixed(1)),
    fuelUsedLiters: 0, // Test mode locks fuel consumption
    governorEngagements,
    governorDistanceFrac: Number(governorDistanceFrac.toFixed(4)),
    lowConfidence,
    confidenceReason,
    alphaPeakDeg: Number(alphaPeakDeg.toFixed(2)),
    governorLogs,
    events,
    consistency: {
      lapTimesMs: [lapTimeMs],
      stdDevMs: 0,
      inputSmoothnessPct,
    },
    phaseSummaries: buildPhaseSummaries(mapId, samples),
    fullRateSamples: samples,
  };
}

export function compactRunForHistory(run: RunTelemetryRecord): CompactRunHistoryEntry {
  return {
    metadata: run.metadata,
    source: run.source,
    lapTimeMs: run.lapTimeMs,
    lowConfidence: run.lowConfidence,
    governorEngagements: run.governorEngagements,
    maxLatG: run.maxLatG,
    avgUndersteerDeg: run.avgUndersteerDeg,
    peakBrakeTempC: run.peakBrakeTempC,
    peakOilTempC: run.peakOilTempC,
    phaseSummaries: run.phaseSummaries,
  };
}

// ---------------------------------------------------------------------------
// Two-Run Diff (Hash comparison first, then channel & corner-phase deltas)
// ---------------------------------------------------------------------------

export interface PhaseChannelDelta {
  key: string;
  cornerId: string;
  cornerName: string;
  phase: CornerPhaseId;
  durationMsDelta: number;
  avgSpeedKmhDelta: number;
  minSpeedKmhDelta: number;
  maxLatGDelta: number;
  understeerDegDelta: number;
  avgFrontSlipDegDelta: number;
  avgRearSlipDegDelta: number;
  peakBrakeTempCDelta: number;
  avgOilTempCDelta: number;
  avgDownforceKgfDelta: number;
  avgTravelMmDelta: number;
}

export interface RunDiffResult {
  refRunId: string;
  currRunId: string;
  setupHashMatch: boolean;
  conditionsHashMatch: boolean;
  simBuildHashMatch: boolean;
  identicalSetupAndConditions: boolean;
  changedSetupFields: string[];
  lapTimeMsDelta: number;
  avgSpeedKmhDelta: number;
  maxSpeedKmhDelta: number;
  maxLatGDelta: number;
  avgUndersteerDegDelta: number;
  peakBrakeTempCDelta: number;
  peakOilTempCDelta: number;
  peakWaterTempCDelta: number;
  bottomingEventsDelta: number;
  governorEngagementsDelta: number;
  stdDevMsDelta: number;
  phaseDeltas: PhaseChannelDelta[];
}

function diffSetupFields(a: CarSetupConfig, b: CarSetupConfig): string[] {
  const changed: string[] = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof CarSetupConfig>;
  for (const k of keys) {
    if (k === 'equippedParts') {
      const pa = JSON.stringify(a.equippedParts ?? {});
      const pb = JSON.stringify(b.equippedParts ?? {});
      if (pa !== pb) changed.push('equippedParts');
    } else if (a[k] !== b[k]) {
      changed.push(String(k));
    }
  }
  return changed;
}

export function computeRunDiff(
  reference: RunTelemetryRecord,
  current: RunTelemetryRecord,
): RunDiffResult {
  const setupHashMatch = reference.metadata.setupHash === current.metadata.setupHash;
  const conditionsHashMatch =
    reference.metadata.conditionsHash === current.metadata.conditionsHash;
  const simBuildHashMatch = reference.metadata.simBuildHash === current.metadata.simBuildHash;
  const changedSetupFields = diffSetupFields(reference.snapshot.setup, current.snapshot.setup);

  const refMap = new Map<string, CornerPhaseSummary>();
  for (const p of reference.phaseSummaries) refMap.set(p.key, p);

  const phaseDeltas: PhaseChannelDelta[] = current.phaseSummaries.map((cp) => {
    const rp = refMap.get(cp.key);
    return {
      key: cp.key,
      cornerId: cp.cornerId,
      cornerName: cp.cornerName,
      phase: cp.phase,
      durationMsDelta: cp.durationMs - (rp?.durationMs ?? 0),
      avgSpeedKmhDelta: Number((cp.avgSpeedKmh - (rp?.avgSpeedKmh ?? 0)).toFixed(2)),
      minSpeedKmhDelta: Number((cp.minSpeedKmh - (rp?.minSpeedKmh ?? 0)).toFixed(2)),
      maxLatGDelta: Number((cp.maxLatG - (rp?.maxLatG ?? 0)).toFixed(3)),
      understeerDegDelta: Number((cp.understeerDeg - (rp?.understeerDeg ?? 0)).toFixed(2)),
      avgFrontSlipDegDelta: Number((cp.avgFrontSlipDeg - (rp?.avgFrontSlipDeg ?? 0)).toFixed(2)),
      avgRearSlipDegDelta: Number((cp.avgRearSlipDeg - (rp?.avgRearSlipDeg ?? 0)).toFixed(2)),
      peakBrakeTempCDelta: cp.peakBrakeTempC - (rp?.peakBrakeTempC ?? 0),
      avgOilTempCDelta: Number((cp.avgOilTempC - (rp?.avgOilTempC ?? 0)).toFixed(1)),
      avgDownforceKgfDelta: cp.avgDownforceKgf - (rp?.avgDownforceKgf ?? 0),
      avgTravelMmDelta: Number((cp.avgTravelMm - (rp?.avgTravelMm ?? 0)).toFixed(2)),
    };
  });

  return {
    refRunId: reference.metadata.runId,
    currRunId: current.metadata.runId,
    setupHashMatch,
    conditionsHashMatch,
    simBuildHashMatch,
    identicalSetupAndConditions: setupHashMatch && conditionsHashMatch && simBuildHashMatch,
    changedSetupFields,
    lapTimeMsDelta: current.lapTimeMs - reference.lapTimeMs,
    avgSpeedKmhDelta: Number((current.avgSpeedKmh - reference.avgSpeedKmh).toFixed(2)),
    maxSpeedKmhDelta: Number((current.maxSpeedKmh - reference.maxSpeedKmh).toFixed(2)),
    maxLatGDelta: Number((current.maxLatG - reference.maxLatG).toFixed(3)),
    avgUndersteerDegDelta: Number(
      (current.avgUndersteerDeg - reference.avgUndersteerDeg).toFixed(2),
    ),
    peakBrakeTempCDelta: current.peakBrakeTempC - reference.peakBrakeTempC,
    peakOilTempCDelta: Number((current.peakOilTempC - reference.peakOilTempC).toFixed(1)),
    peakWaterTempCDelta: Number((current.peakWaterTempC - reference.peakWaterTempC).toFixed(1)),
    bottomingEventsDelta: current.events.bottomingEvents - reference.events.bottomingEvents,
    governorEngagementsDelta: current.governorEngagements - reference.governorEngagements,
    stdDevMsDelta: Number((current.consistency.stdDevMs - reference.consistency.stdDevMs).toFixed(1)),
    phaseDeltas,
  };
}

// Re-export helpers so callers can access hashes cleanly
export { BOT_VERSION, computeConditionsHash, computeSetupHash, SIM_BUILD_HASH };
