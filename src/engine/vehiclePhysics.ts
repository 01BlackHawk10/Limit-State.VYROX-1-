import * as THREE from 'three';
import {
  CircuitData,
  createCircuitQueryScratch,
  getCircuitData,
  getTougeDirection,
  SHOULDER_WIDTH,
  type TougeDirection,
} from '../Maps/Aurelia Ridge/circuitSpline';
import { clamp, lerp } from './mathNoise';
import { type AnyCarSpecId, type CarModelId, normalizeCarModelId } from '../shared/carTypes';
import { WeatherPreset, SnowAtmospherePreset } from '../Maps/Aurelia Ridge/skyAndLighting';
import { groundHeightAt, groundNormalAtInto } from '../Maps/Aurelia Ridge/terrainField';
import {
  COLLIDER_MATERIAL_PROPS,
  CollisionResolution,
  worldColliders,
} from '../Maps/Aurelia Ridge/worldColliders';
import { isPointInPitBounds, isTougeMapId, type MapId } from '../Maps/mapRegistry';
import {
  type CarVisualCustomization,
  computeEffectiveSpecs,
  DEFAULT_EQUIPPED_PARTS,
  type EffectiveVehicleSpecs,
  isEngineSwapForcedInduction,
  type PartCategoryId,
} from './carCustomization';
import { evaluateTofuGrade, getTofuChapterById, type TofuGrade } from '../data/tofuStory';
import {
  getActiveBlueprintEffects,
  queryBoostPadImpulse,
  sampleActiveRampSurface,
  sampleActiveTerrainMaterial,
  TERRAIN_MATERIAL_MAP,
} from './customMapBuilder';

export type DrivingCameraMode =
  | 'chase'
  | 'chaseFar'
  | 'cockpit'
  | 'windshield'
  | 'hood'
  | 'bumper';

export type GameMode = 'time_trial' | 'sprint' | 'endurance' | 'drift' | 'tofu_delivery';
export type RaceDifficulty = 'novice' | 'pro' | 'elite';
export type StintStrategyPreset = 'sprint' | 'endurance' | 'realistic';
export type FuelStarvationState = 'normal' | 'starving' | 'critical' | 'stalled';
export type StartCountdownMode = 'full' | 'quick' | 'instant';

export interface RaceConfig {
  mode: GameMode;
  lapCount: number; // 0 = Unlimited
  difficulty?: RaceDifficulty;
  targetStints?: number; // Derived stint count across raceLengthLaps
  strategyPreset?: StintStrategyPreset;
  startCountdownMode?: StartCountdownMode;
  tofuChapterId?: string;
  tofuFragility?: number;
  tofuMaxSlipDeg?: number;
  tofuChapterRewardCr?: number;
}

export interface CockpitDialState {
  brakeBalance: number; // -5 (Rear) .. +5 (Front)
  tcsLevel: number;     // 0 (Off) .. 5 (Max)
  absLevel: number;     // 0 (Off) .. 3 (Max)
  engineMap: 1 | 2 | 3; // 1 = Eco, 2 = Balanced, 3 = Quali
  diffPreload: number;  // 1 .. 5
}

export function getDefaultCockpitDials(): CockpitDialState {
  return {
    brakeBalance: 1,
    tcsLevel: 3,
    absLevel: 2,
    engineMap: 2,
    diffPreload: 3,
  };
}

export interface PitStrategyPlan {
  fuelTargetFrac: number; // 0.25 .. 1.00
  tireCompound: TireCompoundId;
  wingTrim: number;       // -2 .. +3 degrees
}

export function getDefaultPitStrategy(compound: TireCompoundId = 'racing_hard'): PitStrategyPlan {
  return {
    fuelTargetFrac: 1.0,
    tireCompound: compound,
    wingTrim: 0,
  };
}

export interface RivalTelemetry {
  id: string;
  name: string;
  color: string;
  posX: number;
  posZ: number;
  trackT: number;
}

export interface CarImpactTransfer {
  id: string;
  pushX: number;
  pushZ: number;
  impulseVx: number;
  impulseVz: number;
  yawKick: number;
  severity: number;
}

export interface LeaderboardEntry {
  position: number;
  name: string;
  carName: string;
  isPlayer: boolean;
  color: string;
  bestLapMs: number | null;
  totalTimeMs: number | null;
  gapText: string;
  driftPoints?: number;
}

export interface FinishSummary {
  mode: GameMode;
  totalTimeMs: number;
  bestLapMs: number | null;
  lapCount: number;
  position: number;
  totalRacers: number;
  driftPoints: number;
  speedTrapRecordKmh: number;
  leaderboard: LeaderboardEntry[];
  tofuIntegrityPct?: number;
  tofuGrade?: TofuGrade;
  tofuFailed?: boolean;
  tofuFailureReason?: string;
  tofuChapterId?: string;
  tofuChapterRewardCr?: number;
}

export type PhysicsPreset = 'simulation' | 'simcade';

export type ActiveAeroMode = 'off' | 'manual' | 'auto';

export interface VehicleAssists {
  autoGear: boolean;
  abs: boolean;
  tcs: boolean;
  steerSensitivity: number; // 0.6 .. 1.4
  autoPitService?: boolean; // Easy-mode assist (default OFF)
  hillClimbAssist?: boolean; // Smooth slope traction & grade assist on steep climbs (default ON)
  ffbIntensity?: number;    // 0.0 .. 1.5 (gamepad FFB)
  physicsPreset?: PhysicsPreset; // 'simulation' | 'simcade'
  steeringGovernor?: boolean; // Layer 3 yaw-rate governor (default true in simcade, false in simulation)
  countersteerAssist?: boolean; // Layer 4 countersteer assist (default true in simcade, false in simulation)
}

export type TireCompoundId =
  | 'comfort_hard'
  | 'sports_medium'
  | 'sports_soft'
  | 'racing_hard'
  | 'racing_medium'
  | 'racing_soft';

export interface TireCompoundMeta {
  id: TireCompoundId;
  label: string;
  shortLabel: string;
  gripMult: number;
  stiffnessMult: number;
  wearMult: number;
}

export const TIRE_COMPOUNDS: Record<TireCompoundId, TireCompoundMeta> = {
  comfort_hard: {
    id: 'comfort_hard',
    label: 'Comfort: Hard (CH)',
    shortLabel: 'CH',
    gripMult: 0.78,
    stiffnessMult: 0.84,
    wearMult: 0.48,
  },
  sports_medium: {
    id: 'sports_medium',
    label: 'Sports: Medium (SM)',
    shortLabel: 'SM',
    gripMult: 0.90,
    stiffnessMult: 0.92,
    wearMult: 0.62,
  },
  sports_soft: {
    id: 'sports_soft',
    label: 'Sports: Soft (SS)',
    shortLabel: 'SS',
    gripMult: 0.98,
    stiffnessMult: 0.98,
    wearMult: 0.74,
  },
  racing_hard: {
    id: 'racing_hard',
    label: 'Racing: Hard (RH)',
    shortLabel: 'RH',
    gripMult: 1.08,
    stiffnessMult: 1.06,
    wearMult: 0.70,
  },
  racing_medium: {
    id: 'racing_medium',
    label: 'Racing: Medium (RM)',
    shortLabel: 'RM',
    gripMult: 1.16,
    stiffnessMult: 1.12,
    wearMult: 0.92,
  },
  racing_soft: {
    id: 'racing_soft',
    label: 'Racing: Soft (RS)',
    shortLabel: 'RS',
    gripMult: 1.24,
    stiffnessMult: 1.18,
    wearMult: 1.14,
  },
};

export interface CarSetupConfig {
  weightDistributionFrontPct: number; // 40..60 (%)
  tireCompound: TireCompoundId;
  tireGripTrim: number; // 0.80..1.20
  springRateHz: number; // 1.8..4.5 Hz
  damperRatio: number; // 0.40..1.00
  antiRollFront: number; // 1..10
  antiRollRear: number; // 1..10
  rideHeightMm: number; // 45..95 mm
  brakeBalance: number; // -5 (Rear) .. +5 (Front)
  downforceScale: number; // 0.60..1.40
  // Expanded Stage 3 mechanical & alignment parameters
  frontSpringNmm?: number; // 80..260 N/mm
  rearSpringNmm?: number; // 80..260 N/mm
  frontBumpDamp?: number; // 0.40..1.40
  frontReboundDamp?: number; // 0.40..1.40
  rearBumpDamp?: number; // 0.40..1.40
  rearReboundDamp?: number; // 0.40..1.40
  camberFrontDeg?: number; // -4.5..0.0 deg
  camberRearDeg?: number; // -4.0..0.0 deg
  toeFrontDeg?: number; // -0.50..0.50 deg
  toeRearDeg?: number; // -0.50..0.50 deg
  tirePressureFrontPsi?: number; // 21.0..33.0 PSI
  tirePressureRearPsi?: number; // 21.0..33.0 PSI
  diffPreloadNm?: number; // 20..260 Nm
  diffPowerLockPct?: number; // 15..95 %
  diffCoastLockPct?: number; // 10..80 %
  finalDriveRatio?: number; // 2.80..4.50
  gearRatioScale?: number; // 0.82..1.18
  downforceFrontScale?: number; // 0.60..1.40
  downforceRearScale?: number; // 0.60..1.40
  ecuBoostScale?: number; // 0.85..1.18
  revLimitOffsetRpm?: number; // -400..+600 RPM
  activeAeroEnabled?: boolean; // dynamic active wing & front splitter
  activeAeroMode?: ActiveAeroMode; // 'off' | 'manual' | 'auto' (corner DF + straight DRS)
  equippedParts?: Partial<Record<PartCategoryId, string>>;
}

export function getDefaultCarSetup(carId: AnyCarSpecId = 'bmw-m4-gt3-evo'): CarSetupConfig {
  const isWidebody = carId === 'bmw-m4-widebody';
  const isVulcan = carId === 'aston-vulcan-amr';
  const isPrototype =
    carId === 'toyota-gt-one-ts020' ||
    carId === 'mazda-furai' ||
    carId === 'bmw-m-hybrid-v8' ||
    carId === 'cadillac-v-series-r' ||
    carId === 'mazda-787b' ||
    carId === 'honda-ra272-f1' ||
    carId === 'ferrari-250-testa-rossa';
  const isHypercar =
    isVulcan ||
    carId === 'koenigsegg-agera-rs' ||
    carId === 'bugatti-bolide' ||
    carId === 'de-tomaso-p900' ||
    carId === 'mclaren-f1-gtr-longtail' ||
    carId === 'ferrari-f40-lbwk';
  const isStreetOrRally =
    isWidebody ||
    carId === 'subaru-wrx-sti' ||
    carId === 'honda-s2000' ||
    carId === 'vw-polo-r-wrx' ||
    carId === 'vw-golf-gti-mk2' ||
    carId === 'toyota-ae86-trueno';

  const defaultFrontWeight =
    carId === 'vw-golf-gti-mk2'
      ? 61
      : carId === 'toyota-ae86-trueno'
        ? 52
        : carId === 'ferrari-250-testa-rossa'
          ? 51
          : carId === 'bmw-m4-gt3-evo' || carId === 'aston-vulcan-amr'
            ? 49
            : carId === 'aston-vantage-gt3' || carId === 'honda-s2000' || carId === 'mercedes-amg-gt3-evo'
              ? 48
              : carId === 'toyota-gt-one-ts020' ||
                  carId === 'bmw-m-hybrid-v8' ||
                  carId === 'cadillac-v-series-r' ||
                  carId === 'bugatti-bolide' ||
                  carId === 'honda-ra272-f1'
                ? 45
                : carId === 'audi-r8-lms-evo' ||
                    carId === 'koenigsegg-agera-rs' ||
                    carId === 'de-tomaso-p900' ||
                    carId === 'acura-nsx-gt3' ||
                    carId === 'mazda-787b'
                  ? 44
                  : carId === 'lambo-huracan-gt3-evo2' ||
                      carId === 'mclaren-650s-gt3' ||
                      carId === 'mclaren-720s-gt3' ||
                      carId === 'mazda-furai' ||
                      carId === 'mclaren-f1-gtr-longtail'
                    ? 43
                    : carId === 'ferrari-f40-lbwk'
                      ? 42
                      : carId === 'subaru-wrx-sti' || carId === 'vw-polo-r-wrx'
                        ? 55
                        : isWidebody
                          ? 51
                          : 47;

  const defaultFinalDrive =
    carId === 'audi-r8-lms-evo'
      ? 3.72
      : carId === 'lambo-huracan-gt3-evo2'
        ? 3.70
        : carId === 'mclaren-720s-gt3' || carId === 'acura-nsx-gt3'
          ? 3.64
          : carId === 'aston-vantage-gt3'
            ? 3.55
            : carId === 'mercedes-amg-gt3-evo'
              ? 3.56
              : carId === 'bmw-m4-gt3-evo'
                ? 3.54
                : carId === 'aston-vulcan-amr' || carId === 'mazda-787b'
                  ? 3.42
                  : carId === 'toyota-gt-one-ts020'
                    ? 3.38
                    : carId === 'mclaren-f1-gtr-longtail'
                      ? 3.36
                      : carId === 'ferrari-f40-lbwk'
                        ? 3.44
                        : carId === 'ferrari-250-testa-rossa'
                          ? 3.68
                          : carId === 'mazda-furai'
                            ? 3.78
                            : carId === 'bmw-m-hybrid-v8' || carId === 'cadillac-v-series-r'
                              ? 3.30
                              : carId === 'koenigsegg-agera-rs' || carId === 'bugatti-bolide'
                                ? 3.08
                                : carId === 'de-tomaso-p900'
                                  ? 4.48
                                  : carId === 'honda-s2000'
                                      ? 4.10
                                      : carId === 'honda-ra272-f1' || carId === 'toyota-ae86-trueno'
                                        ? 4.30
                                        : carId === 'vw-golf-gti-mk2'
                                          ? 3.94
                                          : carId === 'subaru-wrx-sti'
                                            ? 3.90
                                            : carId === 'vw-polo-r-wrx'
                                              ? 4.16
                                              : isWidebody
                                                ? 3.35
                                                : 3.58;

  return {
    weightDistributionFrontPct: defaultFrontWeight,
    tireCompound:
      carId === 'vw-polo-r-wrx'
        ? 'racing_medium'
        : isStreetOrRally
          ? 'sports_soft'
          : isHypercar || isPrototype
            ? 'racing_soft'
            : 'racing_hard',
    tireGripTrim: 1.0,
    springRateHz: isStreetOrRally ? 2.8 : isHypercar || isPrototype ? 3.5 : 3.2,
    damperRatio: 0.72,
    antiRollFront: isHypercar || isPrototype ? 7 : isStreetOrRally ? 5 : 6,
    antiRollRear: isHypercar || isPrototype ? 7 : isStreetOrRally ? 5 : 6,
    rideHeightMm:
      carId === 'subaru-wrx-sti' || carId === 'vw-polo-r-wrx'
        ? 82
        : isWidebody || carId === 'honda-s2000' || carId === 'vw-golf-gti-mk2' || carId === 'toyota-ae86-trueno'
          ? 72
          : isHypercar || isPrototype
            ? 56
            : 60,
    brakeBalance: 1,
    downforceScale: 1.0,
    frontSpringNmm: isStreetOrRally ? 115 : isHypercar || isPrototype ? 162 : 140,
    rearSpringNmm: isStreetOrRally ? 120 : isHypercar || isPrototype ? 168 : 145,
    frontBumpDamp: 0.72,
    frontReboundDamp: 0.76,
    rearBumpDamp: 0.72,
    rearReboundDamp: 0.76,
    camberFrontDeg: isStreetOrRally ? -2.2 : isHypercar || isPrototype ? -2.7 : -2.4,
    camberRearDeg: isStreetOrRally ? -1.7 : isHypercar || isPrototype ? -2.0 : -1.8,
    toeFrontDeg: -0.08,
    toeRearDeg: 0.16,
    tirePressureFrontPsi: 27.5,
    tirePressureRearPsi: 27.0,
    diffPreloadNm: 140,
    diffPowerLockPct: 50,
    diffCoastLockPct: 30,
    finalDriveRatio: defaultFinalDrive,
    gearRatioScale: 1.0,
    downforceFrontScale: 1.0,
    downforceRearScale: 1.0,
    ecuBoostScale: 1.0,
    revLimitOffsetRpm: 0,
    activeAeroEnabled: true,
    activeAeroMode: 'auto',
    equippedParts: { ...DEFAULT_EQUIPPED_PARTS },
  };
}

export interface VehicleControlsInput {
  throttle: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
  lookBack: boolean;
  // Optional analog overrides (0..1 or -1..1) from Gamepad API
  throttleVal?: number;
  brakeVal?: number;
  steerAxis?: number;
  handbrakeVal?: number;
}

export interface TireCornerTelemetry {
  loadNorm: number; // 0..1.6
  gripLossPct: number; // 0..100%
  slip: number;     // 0..1
  lifePct: number;  // 0..100
  kappa: number;    // longitudinal slip ratio (-1..1)
  alphaDeg: number; // slip angle deg
  travelMm: number; // suspension displacement mm (+ compressed)
  normalFzN: number;
  grounded: boolean;
  brakeTempC: number; // rotor °C
  brakeFaded: boolean;
  shredded: boolean;
  deflationFrac: number; // 0..1 slow puncture progress
}

export interface SparkEmitEvent {
  x: number;
  y: number;
  z: number;
  nx: number;
  nz: number;
  vx: number;
  vz: number;
  intensity: number;
}

export interface PhysicsDiagnosticsTelemetry {
  chassisHz: number;
  tireSubstepHz: number;
  substepsPerChassis: number;
  forceCombination: 'averaged_substep_forces';
  lastStepCpuMs: number;
  maxStepCpuMs: number;
  groundedWheels: [boolean, boolean, boolean, boolean];
  groundedCount: number;
  clutchEngage: number;
  escTorqueNm: number;
  rolloverSsf: number;
  rolloverRiskRatio: number;
  rolloverWarning: boolean;
  physicsPreset: PhysicsPreset;
  determinismWarning: string;
  cornerFzN: [number, number, number, number];
  testMode: boolean;
  bottomingEvents: number;
  govCapDeg: number;
  cstAssistDeg: number;
  slipBodyDeg: number;
}

export interface VehicleTelemetry {
  speedKmh: number;
  speedMps: number;
  rpm: number;
  redlineRpm: number;
  gear: number; // -1 = R, 0 = N, 1..7
  gearMaxSpeedKmh: number;
  throttle: number; // 0..1
  brake: number;    // 0..1
  steerNorm: number; // -1..1 (left positive)
  handbrake: boolean;
  isBraking: boolean;
  latG: number;
  lonG: number;
  absActive: boolean;
  tcsActive: boolean;
  shiftFlash: boolean;
  surface: 'tarmac' | 'kerb' | 'offroad' | 'bridge';
  audioSurface: 'asphalt' | 'curb' | 'gravel' | 'snow';
  activeAeroEnabled: boolean;
  activeAeroMode: ActiveAeroMode;
  aeroDeployed: boolean;
  slopeGradePct: number;
  gripPct: number;
  avgTireLifePct: number;
  minTireLifePct: number;
  tireCompoundShort: string;
  fuelLiters: number;
  fuelMaxLiters: number;
  fuelPct: number;
  fuelLapsEst: number | null;
  fuelState: FuelStarvationState;
  engineCranking: boolean;
  powerSteeringLost: boolean;
  stintLapsTarget: number;
  stintFuelPerLap: number;
  stintWearPerLapPct: number;
  pitRequired: boolean;
  pitOverspeed: boolean;
  oilTempC: number;
  waterTempC: number;
  tirePressuresPsi: [number, number, number, number];
  wheelSlips: [number, number, number, number];
  bodyHeave: number;
  downforceKgf: number;
  lsdLockPct: number;
  ffbTorqueNorm: number;
  shreddedCount: number;
  brakeFadeCount: number;
  cockpitDials: CockpitDialState;
  pitStrategy: PitStrategyPlan;
  speedTrapKmh: number | null;
  speedTrapRecordKmh: number;
  inDriftClippingZone: boolean;
  tires: {
    fl: TireCornerTelemetry;
    fr: TireCornerTelemetry;
    rl: TireCornerTelemetry;
    rr: TireCornerTelemetry;
  };
  lap: number;
  lapTimeMs: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  sector: 1 | 2 | 3;
  sectorTimesMs: [number | null, number | null, number | null];
  sectorRecordPulse: 0 | 1 | 2 | 3;
  deltaMs: number | null;
  cleanLap: boolean;
  countdownSec: number; // >0 during 3-2-1-GO, <=0 when live
  countdownLabel: string; // '3' | '2' | '1' | 'START' | ''
  trackT: number;
  posX: number;
  posZ: number;
  headingRad: number;
  flagState: 'green' | 'yellow';
  hazardTrackT: number | null;
  hazardReason: string;
  pitStatus: 'none' | 'in_lane' | 'servicing' | 'complete';
  pitServiceProgress: number; // 0..1
  pitCompletePulse: number; // 0..1
  dirtLevel: number;        // 0..1
  rubberInProgress: number; // 0..1
  wallImpactImpulse: number; // 0..1
  wallScrapeIntensity: number; // 0..1
  tireSquealIntensity: number; // 0..1
  kerbRumble: number;        // 0..1
  gearShiftPulse: number;    // 0..1
  turboBlowOffPulse: number; // 0..1
  brakeSkidIntensity: number; // 0..1
  sparkEvents: SparkEmitEvent[];
  gameMode: GameMode;
  lapTarget: number; // 0 = unlimited
  racePosition: number;
  totalRacers: number;
  rivals: RivalTelemetry[];
  driftPoints: number;
  driftActivePoints: number;
  driftCombo: number;
  driftAngleDeg: number;
  tofuIntegrityPct: number;
  tofuCupTiltX: number;
  tofuCupTiltZ: number;
  tofuSpilling: boolean;
  tofuFailed: boolean;
  tofuFailureReason: string;
  tofuGrade: TofuGrade | null;
  ghostActive: boolean;
  ghostName: string;
  ghostDeltaSec: number | null;
  ghostGapMeters: number | null;
  tandemPartnerUsername: string | null;
  tandemRole: 'LEAD' | 'CHASE' | null;
  tandemMultiplier: number;
  tandemBonusPoints: number;
  raceFinished: boolean;
  finishSummary: FinishSummary | null;
  carId: AnyCarSpecId;
  carName: string;
  diagnostics: PhysicsDiagnosticsTelemetry;
}

export interface VehicleSpecProfile {
  id: AnyCarSpecId;
  name: string;
  shortName: string;
  gearRatios: number[]; // index = gear + 1
  maxGear: number;
  finalDrive: number;
  wheelRadius: number;
  massKg: number;
  yawInertia: number;
  pitchInertia: number;
  rollInertia: number;
  wheelbase: number;
  trackWidth: number;
  rearSteerEnabled?: boolean;
  naturallyAspirated?: boolean;
  idleRpm: number;
  redlineRpm: number;
  shiftUpRpm: number;
  shiftDownRpm: number;
  shiftFlashRpm: number;
  maxPowerWatts: number;
  electricFillNm: number;
  v8TorqueNm: number;
  frontDriveFrac: number;
  rearDriveFrac: number;
  maxSteerRad: number;
  maxBrakeForce: number;
  cdaBase: number;
  cdaScale: number;
  downforceFront: number;
  downforceRear: number;
  defaultFrontWeightPct: number;
  mechGripBoost: number;
  fuelMaxLiters: number;
  engineConfig: string;
  induction: string;
  fuelBurnMult: number;
  tireWearMult: number;
  tireFrontWearBias: number;
  tireRearWearBias: number;
  raceFuelLPer100Km: number;
  estimatedTankRangeKm: number;
  tireStintRangeKm: number;
}

export const VEHICLE_SPECS: Record<AnyCarSpecId, VehicleSpecProfile> = {
  'audi-r8-lms-evo': {
    id: 'audi-r8-lms-evo',
    name: '2020 Audi R8 LMS Evo',
    shortName: 'Audi R8 LMS Evo',
    gearRatios: [-3.15, 0, 3.36, 2.46, 1.88, 1.48, 1.19, 0.97],
    maxGear: 6,
    finalDrive: 3.72,
    wheelRadius: 0.35,
    massKg: 1245,
    yawInertia: 1750,
    pitchInertia: 1560,
    rollInertia: 490,
    wheelbase: 2.65,
    trackWidth: 1.72,
    naturallyAspirated: true,
    idleRpm: 1100,
    redlineRpm: 8500,
    shiftUpRpm: 8250,
    shiftDownRpm: 3600,
    shiftFlashRpm: 8000,
    maxPowerWatts: 436000, // 585 HP 5.2L V10 FIA GT3 Evo
    electricFillNm: 0,
    v8TorqueNm: 575,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.48,
    maxBrakeForce: 19000,
    cdaBase: 0.88,
    cdaScale: 0.36,
    downforceFront: 1.26,
    downforceRear: 1.70,
    defaultFrontWeightPct: 44,
    mechGripBoost: 1.05,
    fuelMaxLiters: 120,
    engineConfig: '5.2L NA V10',
    induction: 'Naturally Aspirated',
    fuelBurnMult: 1.04,
    tireWearMult: 0.97,
    tireFrontWearBias: 0.92,
    tireRearWearBias: 1.08,
    raceFuelLPer100Km: 38.0,
    estimatedTankRangeKm: 316,
    tireStintRangeKm: 96,
  },
  'mclaren-650s-gt3': {
    id: 'mclaren-650s-gt3',
    name: '2015 McLaren 650S GT3',
    shortName: 'McLaren 650S GT3',
    gearRatios: [-3.05, 0, 2.74, 2.10, 1.64, 1.31, 1.07, 0.90],
    maxGear: 6,
    finalDrive: 3.58,
    wheelRadius: 0.345,
    massKg: 1240,
    yawInertia: 1760,
    pitchInertia: 1580,
    rollInertia: 495,
    wheelbase: 2.67,
    trackWidth: 1.76,
    idleRpm: 1050,
    redlineRpm: 7750,
    shiftUpRpm: 7500,
    shiftDownRpm: 3450,
    shiftFlashRpm: 7250,
    maxPowerWatts: 368000, // 493 HP / 500 PS
    electricFillNm: 0,
    v8TorqueNm: 545,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.47,
    maxBrakeForce: 18600,
    cdaBase: 0.92,
    cdaScale: 0.38,
    downforceFront: 1.24,
    downforceRear: 1.68,
    defaultFrontWeightPct: 43,
    mechGripBoost: 1.05,
    fuelMaxLiters: 110,
    engineConfig: '3.8L TT V8',
    induction: 'Twin-Turbo',
    fuelBurnMult: 1.00,
    tireWearMult: 0.96,
    tireFrontWearBias: 0.92,
    tireRearWearBias: 1.08,
    raceFuelLPer100Km: 36.5,
    estimatedTankRangeKm: 301,
    tireStintRangeKm: 97,
  },
  'bmw-m4-gt3-evo': {
    id: 'bmw-m4-gt3-evo',
    name: '2025 BMW M4 GT3 Evo',
    shortName: 'BMW M4 GT3 Evo',
    gearRatios: [-3.02, 0, 2.78, 2.12, 1.66, 1.32, 1.08, 0.91],
    maxGear: 6,
    finalDrive: 3.54,
    wheelRadius: 0.355,
    massKg: 1265,
    yawInertia: 1840,
    pitchInertia: 1640,
    rollInertia: 505,
    wheelbase: 2.86,
    trackWidth: 1.72,
    idleRpm: 1100,
    redlineRpm: 7500,
    shiftUpRpm: 7220,
    shiftDownRpm: 3400,
    shiftFlashRpm: 7000,
    maxPowerWatts: 440000, // 590 HP P58 3.0L twin-turbo I6 GT3 Evo spec
    electricFillNm: 0,
    v8TorqueNm: 700,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.47,
    maxBrakeForce: 19200,
    cdaBase: 0.90,
    cdaScale: 0.37,
    downforceFront: 1.28,
    downforceRear: 1.72,
    defaultFrontWeightPct: 49,
    mechGripBoost: 1.06,
    fuelMaxLiters: 120,
    engineConfig: '3.0L TT Inline-6',
    induction: 'Twin-Turbo',
    fuelBurnMult: 0.98,
    tireWearMult: 0.96,
    tireFrontWearBias: 0.98,
    tireRearWearBias: 1.02,
    raceFuelLPer100Km: 35.8,
    estimatedTankRangeKm: 335,
    tireStintRangeKm: 98,
  },
  'bmw-m4-widebody': {
    id: 'bmw-m4-widebody',
    name: 'BMW M4 Widebody Modified',
    shortName: 'M4 Widebody',
    gearRatios: [-3.32, 0, 3.62, 2.58, 1.94, 1.50, 1.20, 0.98, 0.80],
    maxGear: 7,
    finalDrive: 3.35,
    wheelRadius: 0.35,
    massKg: 1545,
    yawInertia: 2290,
    pitchInertia: 2040,
    rollInertia: 590,
    wheelbase: 2.857,
    trackWidth: 1.72,
    idleRpm: 820,
    redlineRpm: 7600,
    shiftUpRpm: 7320,
    shiftDownRpm: 3100,
    shiftFlashRpm: 7100,
    maxPowerWatts: 537000, // 720 HP tuned S58 3.0L twin-turbo inline-6
    electricFillNm: 0,
    v8TorqueNm: 850,
    frontDriveFrac: 0.28,
    rearDriveFrac: 0.72,
    maxSteerRad: 0.50,
    maxBrakeForce: 19000,
    cdaBase: 0.78,
    cdaScale: 0.29,
    downforceFront: 0.68,
    downforceRear: 0.94,
    defaultFrontWeightPct: 51,
    mechGripBoost: 1.04,
    fuelMaxLiters: 64,
    engineConfig: '3.0L S58 TT I6',
    induction: 'Forged Twin-Turbo',
    fuelBurnMult: 1.16,
    tireWearMult: 1.24,
    tireFrontWearBias: 1.02,
    tireRearWearBias: 0.98,
    raceFuelLPer100Km: 37.5,
    estimatedTankRangeKm: 171,
    tireStintRangeKm: 74,
  },
  'aston-vantage-gt3': {
    id: 'aston-vantage-gt3',
    name: '2020 Aston Martin Vantage AMR GT3',
    shortName: 'Vantage AMR GT3',
    gearRatios: [-3.08, 0, 2.86, 2.16, 1.68, 1.33, 1.08, 0.90],
    maxGear: 6,
    finalDrive: 3.55,
    wheelRadius: 0.35,
    massKg: 1255,
    yawInertia: 1810,
    pitchInertia: 1620,
    rollInertia: 500,
    wheelbase: 2.71,
    trackWidth: 1.74,
    idleRpm: 1050,
    redlineRpm: 7400,
    shiftUpRpm: 7150,
    shiftDownRpm: 3350,
    shiftFlashRpm: 6950,
    maxPowerWatts: 405000, // 543 HP 4.0L Twin-Turbo V8 GT3
    electricFillNm: 0,
    v8TorqueNm: 700,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.47,
    maxBrakeForce: 19100,
    cdaBase: 0.89,
    cdaScale: 0.36,
    downforceFront: 1.27,
    downforceRear: 1.71,
    defaultFrontWeightPct: 48,
    mechGripBoost: 1.06,
    fuelMaxLiters: 120,
    engineConfig: '4.0L TT V8',
    induction: 'Twin-Turbo',
    fuelBurnMult: 1.02,
    tireWearMult: 0.98,
    tireFrontWearBias: 0.97,
    tireRearWearBias: 1.03,
    raceFuelLPer100Km: 37.2,
    estimatedTankRangeKm: 323,
    tireStintRangeKm: 95,
  },
  'aston-vulcan-amr': {
    id: 'aston-vulcan-amr',
    name: 'Aston Martin Vulcan AMR Pro',
    shortName: 'Vulcan AMR Pro',
    gearRatios: [-3.12, 0, 2.94, 2.22, 1.72, 1.37, 1.11, 0.92],
    maxGear: 6,
    finalDrive: 3.42,
    wheelRadius: 0.355,
    massKg: 1350,
    yawInertia: 1940,
    pitchInertia: 1720,
    rollInertia: 510,
    wheelbase: 2.79,
    trackWidth: 1.76,
    naturallyAspirated: true,
    idleRpm: 1150,
    redlineRpm: 8250,
    shiftUpRpm: 8000,
    shiftDownRpm: 3650,
    shiftFlashRpm: 7750,
    maxPowerWatts: 611500, // 820 HP 7.0L NA V12 Track Prototype
    electricFillNm: 0,
    v8TorqueNm: 780,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.46,
    maxBrakeForce: 21400,
    cdaBase: 0.96,
    cdaScale: 0.42,
    downforceFront: 1.62,
    downforceRear: 2.18,
    defaultFrontWeightPct: 49,
    mechGripBoost: 1.09,
    fuelMaxLiters: 105,
    engineConfig: '7.0L NA V12',
    induction: 'Naturally Aspirated',
    fuelBurnMult: 1.32,
    tireWearMult: 1.16,
    tireFrontWearBias: 0.96,
    tireRearWearBias: 1.04,
    raceFuelLPer100Km: 48.2,
    estimatedTankRangeKm: 218,
    tireStintRangeKm: 81,
  },
  'lambo-huracan-gt3-evo2': {
    id: 'lambo-huracan-gt3-evo2',
    name: '2023 Lamborghini Huracan GT3 EVO2',
    shortName: 'Huracan GT3 EVO2',
    gearRatios: [-3.14, 0, 3.34, 2.45, 1.87, 1.47, 1.18, 0.96],
    maxGear: 6,
    finalDrive: 3.70,
    wheelRadius: 0.35,
    massKg: 1235,
    yawInertia: 1735,
    pitchInertia: 1545,
    rollInertia: 485,
    wheelbase: 2.62,
    trackWidth: 1.73,
    naturallyAspirated: true,
    idleRpm: 1120,
    redlineRpm: 8550,
    shiftUpRpm: 8300,
    shiftDownRpm: 3650,
    shiftFlashRpm: 8050,
    maxPowerWatts: 436000, // 585 HP 5.2L V10 GT3 EVO2
    electricFillNm: 0,
    v8TorqueNm: 575,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.48,
    maxBrakeForce: 19200,
    cdaBase: 0.87,
    cdaScale: 0.36,
    downforceFront: 1.30,
    downforceRear: 1.76,
    defaultFrontWeightPct: 43,
    mechGripBoost: 1.07,
    fuelMaxLiters: 118,
    engineConfig: '5.2L NA V10',
    induction: 'Naturally Aspirated',
    fuelBurnMult: 1.05,
    tireWearMult: 0.98,
    tireFrontWearBias: 0.91,
    tireRearWearBias: 1.09,
    raceFuelLPer100Km: 38.4,
    estimatedTankRangeKm: 307,
    tireStintRangeKm: 95,
  },
  'mclaren-720s-gt3': {
    id: 'mclaren-720s-gt3',
    name: '2019 McLaren 720S GT3',
    shortName: '720S GT3',
    gearRatios: [-3.10, 0, 3.16, 2.34, 1.79, 1.41, 1.14, 0.94],
    maxGear: 6,
    finalDrive: 3.64,
    wheelRadius: 0.345,
    massKg: 1240,
    yawInertia: 1715,
    pitchInertia: 1530,
    rollInertia: 480,
    wheelbase: 2.67,
    trackWidth: 1.74,
    idleRpm: 1120,
    redlineRpm: 8200,
    shiftUpRpm: 7920,
    shiftDownRpm: 3500,
    shiftFlashRpm: 7680,
    maxPowerWatts: 447400, // 600 HP 4.0L Twin-Turbo V8 FIA GT3
    electricFillNm: 0,
    v8TorqueNm: 680,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.48,
    maxBrakeForce: 19400,
    cdaBase: 0.85,
    cdaScale: 0.35,
    downforceFront: 1.33,
    downforceRear: 1.79,
    defaultFrontWeightPct: 43,
    mechGripBoost: 1.08,
    fuelMaxLiters: 115,
    engineConfig: '4.0L TT V8',
    induction: 'Twin-Turbo',
    fuelBurnMult: 1.01,
    tireWearMult: 0.95,
    tireFrontWearBias: 0.92,
    tireRearWearBias: 1.08,
    raceFuelLPer100Km: 36.8,
    estimatedTankRangeKm: 312,
    tireStintRangeKm: 99,
  },
  'acura-nsx-gt3': {
    id: 'acura-nsx-gt3',
    name: '2018 Acura NSX GT3 Evo',
    shortName: 'NSX GT3',
    gearRatios: [-3.08, 0, 3.10, 2.30, 1.76, 1.39, 1.12, 0.92],
    maxGear: 6,
    finalDrive: 3.64,
    wheelRadius: 0.348,
    massKg: 1240,
    yawInertia: 1725,
    pitchInertia: 1540,
    rollInertia: 482,
    wheelbase: 2.63,
    trackWidth: 1.73,
    idleRpm: 1100,
    redlineRpm: 7850,
    shiftUpRpm: 7580,
    shiftDownRpm: 3400,
    shiftFlashRpm: 7340,
    maxPowerWatts: 410100, // 550 HP 3.5L Twin-Turbo V6 GT3
    electricFillNm: 0,
    v8TorqueNm: 644,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.48,
    maxBrakeForce: 19200,
    cdaBase: 0.86,
    cdaScale: 0.35,
    downforceFront: 1.28,
    downforceRear: 1.73,
    defaultFrontWeightPct: 44,
    mechGripBoost: 1.07,
    fuelMaxLiters: 110,
    engineConfig: '3.5L TT V6',
    induction: 'Twin-Turbo',
    fuelBurnMult: 0.95,
    tireWearMult: 0.94,
    tireFrontWearBias: 0.93,
    tireRearWearBias: 1.07,
    raceFuelLPer100Km: 34.6,
    estimatedTankRangeKm: 318,
    tireStintRangeKm: 100,
  },
  'toyota-gt-one-ts020': {
    id: 'toyota-gt-one-ts020',
    name: '1998 Toyota GT-One (TS020) Road Version',
    shortName: 'Toyota GT-One',
    gearRatios: [-3.05, 0, 3.04, 2.26, 1.72, 1.35, 1.09, 0.89],
    maxGear: 6,
    finalDrive: 3.38,
    wheelRadius: 0.352,
    massKg: 900,
    yawInertia: 1380,
    pitchInertia: 1220,
    rollInertia: 380,
    wheelbase: 2.80,
    trackWidth: 1.76,
    idleRpm: 1250,
    redlineRpm: 8000,
    shiftUpRpm: 7750,
    shiftDownRpm: 3450,
    shiftFlashRpm: 7500,
    maxPowerWatts: 447400, // 600 HP 3.6L Twin-Turbo V8 LM-GT1
    electricFillNm: 0,
    v8TorqueNm: 649,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.46,
    maxBrakeForce: 22400,
    cdaBase: 0.72,
    cdaScale: 0.31,
    downforceFront: 1.56,
    downforceRear: 2.18,
    defaultFrontWeightPct: 45,
    mechGripBoost: 1.12,
    fuelMaxLiters: 90,
    engineConfig: '3.6L TT V8',
    induction: 'Twin-Turbo',
    fuelBurnMult: 1.06,
    tireWearMult: 0.89,
    tireFrontWearBias: 0.94,
    tireRearWearBias: 1.06,
    raceFuelLPer100Km: 38.8,
    estimatedTankRangeKm: 232,
    tireStintRangeKm: 106,
  },
  'mazda-furai': {
    id: 'mazda-furai',
    name: '2008 Mazda Furai Concept',
    shortName: 'Mazda Furai',
    gearRatios: [-3.12, 0, 3.18, 2.38, 1.84, 1.46, 1.18, 0.96],
    maxGear: 6,
    finalDrive: 3.78,
    wheelRadius: 0.34,
    massKg: 675,
    yawInertia: 1090,
    pitchInertia: 960,
    rollInertia: 310,
    wheelbase: 2.79,
    trackWidth: 1.75,
    naturallyAspirated: true,
    idleRpm: 1650,
    redlineRpm: 9200,
    shiftUpRpm: 8950,
    shiftDownRpm: 4200,
    shiftFlashRpm: 8700,
    maxPowerWatts: 335565, // 450 HP R20B 3-Rotor E100 Wankel LMP2
    electricFillNm: 0,
    v8TorqueNm: 385,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.47,
    maxBrakeForce: 19600,
    cdaBase: 0.70,
    cdaScale: 0.33,
    downforceFront: 1.72,
    downforceRear: 2.34,
    defaultFrontWeightPct: 43,
    mechGripBoost: 1.14,
    fuelMaxLiters: 75,
    engineConfig: '2.0L R20B 3-Rotor',
    induction: 'NA Ethanol Wankel',
    fuelBurnMult: 1.14,
    tireWearMult: 0.72,
    tireFrontWearBias: 0.92,
    tireRearWearBias: 1.08,
    raceFuelLPer100Km: 41.6,
    estimatedTankRangeKm: 180,
    tireStintRangeKm: 128,
  },
  'bmw-m-hybrid-v8': {
    id: 'bmw-m-hybrid-v8',
    name: '2024 BMW M Hybrid V8 LMDh',
    shortName: 'BMW M Hybrid V8',
    gearRatios: [-3.02, 0, 3.06, 2.28, 1.75, 1.38, 1.12, 0.92, 0.78],
    maxGear: 7,
    finalDrive: 3.30,
    wheelRadius: 0.355,
    massKg: 1030,
    yawInertia: 1520,
    pitchInertia: 1360,
    rollInertia: 420,
    wheelbase: 3.15,
    trackWidth: 1.78,
    idleRpm: 1300,
    redlineRpm: 8200,
    shiftUpRpm: 7920,
    shiftDownRpm: 3600,
    shiftFlashRpm: 7680,
    maxPowerWatts: 499619, // 670 HP BoP 4.0L Twin-Turbo V8 + MGU-K Hybrid
    electricFillNm: 185,
    v8TorqueNm: 650,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.46,
    maxBrakeForce: 23800,
    cdaBase: 0.75,
    cdaScale: 0.34,
    downforceFront: 1.92,
    downforceRear: 2.52,
    defaultFrontWeightPct: 45,
    mechGripBoost: 1.15,
    fuelMaxLiters: 90,
    engineConfig: '4.0L TT V8 + MGU-K',
    induction: 'Hybrid Twin-Turbo',
    fuelBurnMult: 0.86,
    tireWearMult: 0.92,
    tireFrontWearBias: 0.94,
    tireRearWearBias: 1.06,
    raceFuelLPer100Km: 31.4,
    estimatedTankRangeKm: 287,
    tireStintRangeKm: 104,
  },
  'cadillac-v-series-r': {
    id: 'cadillac-v-series-r',
    name: '2023 Cadillac V-Series.R LMDh',
    shortName: 'Cadillac V-Series.R',
    gearRatios: [-3.02, 0, 3.08, 2.30, 1.76, 1.39, 1.13, 0.93, 0.78],
    maxGear: 7,
    finalDrive: 3.30,
    wheelRadius: 0.355,
    massKg: 1030,
    yawInertia: 1525,
    pitchInertia: 1365,
    rollInertia: 422,
    wheelbase: 3.14,
    trackWidth: 1.78,
    idleRpm: 1350,
    redlineRpm: 8800,
    shiftUpRpm: 8500,
    shiftDownRpm: 3800,
    shiftFlashRpm: 8250,
    maxPowerWatts: 499619, // 670 HP 5.5L LMC55R NA DOHC V8 + MGU-K Hybrid LMDh
    electricFillNm: 195,
    v8TorqueNm: 645,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.46,
    maxBrakeForce: 24000,
    cdaBase: 0.74,
    cdaScale: 0.34,
    downforceFront: 1.94,
    downforceRear: 2.55,
    defaultFrontWeightPct: 45,
    mechGripBoost: 1.15,
    fuelMaxLiters: 90,
    engineConfig: '5.5L NA V8 + MGU-K',
    induction: 'Hybrid NA V8',
    fuelBurnMult: 0.88,
    tireWearMult: 0.92,
    tireFrontWearBias: 0.94,
    tireRearWearBias: 1.06,
    raceFuelLPer100Km: 32.1,
    estimatedTankRangeKm: 280,
    tireStintRangeKm: 104,
  },
  'koenigsegg-agera-rs': {
    id: 'koenigsegg-agera-rs',
    name: '2015 Koenigsegg Agera RS (Exposed Carbon)',
    shortName: 'Agera RS',
    gearRatios: [-3.10, 0, 2.98, 2.18, 1.66, 1.29, 1.03, 0.84, 0.70],
    maxGear: 7,
    finalDrive: 3.08,
    wheelRadius: 0.355,
    massKg: 1395,
    yawInertia: 1840,
    pitchInertia: 1640,
    rollInertia: 510,
    wheelbase: 2.66,
    trackWidth: 1.74,
    idleRpm: 1050,
    redlineRpm: 8250,
    shiftUpRpm: 7980,
    shiftDownRpm: 3400,
    shiftFlashRpm: 7750,
    maxPowerWatts: 865000, // 1,160 HP 5.0L Twin-Turbo V8 Agera RS
    electricFillNm: 0,
    v8TorqueNm: 1280,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.48,
    maxBrakeForce: 21500,
    cdaBase: 0.79,
    cdaScale: 0.28,
    downforceFront: 1.24,
    downforceRear: 1.68,
    defaultFrontWeightPct: 44,
    mechGripBoost: 1.11,
    fuelMaxLiters: 82,
    engineConfig: '5.0L TT V8',
    induction: 'Twin-Turbo',
    fuelBurnMult: 1.42,
    tireWearMult: 1.34,
    tireFrontWearBias: 0.88,
    tireRearWearBias: 1.12,
    raceFuelLPer100Km: 51.8,
    estimatedTankRangeKm: 158,
    tireStintRangeKm: 70,
  },
  'bugatti-bolide': {
    id: 'bugatti-bolide',
    name: '2021 Bugatti Bolide',
    shortName: 'Bugatti Bolide',
    gearRatios: [-3.12, 0, 3.02, 2.22, 1.68, 1.31, 1.04, 0.85, 0.71],
    maxGear: 7,
    finalDrive: 3.08,
    wheelRadius: 0.358,
    massKg: 1450,
    yawInertia: 1920,
    pitchInertia: 1700,
    rollInertia: 530,
    wheelbase: 2.75,
    trackWidth: 1.80,
    idleRpm: 1100,
    redlineRpm: 8100,
    shiftUpRpm: 7840,
    shiftDownRpm: 3400,
    shiftFlashRpm: 7600,
    maxPowerWatts: 1193000, // 1,600 HP 8.0L Quad-Turbo W16 AWD
    electricFillNm: 0,
    v8TorqueNm: 1600,
    frontDriveFrac: 0.32,
    rearDriveFrac: 0.68,
    maxSteerRad: 0.47,
    maxBrakeForce: 26500,
    cdaBase: 0.78,
    cdaScale: 0.34,
    downforceFront: 2.08,
    downforceRear: 2.76,
    defaultFrontWeightPct: 45,
    mechGripBoost: 1.18,
    fuelMaxLiters: 85,
    engineConfig: '8.0L Quad-Turbo W16',
    induction: 'Quad-Turbo',
    fuelBurnMult: 1.62,
    tireWearMult: 1.42,
    tireFrontWearBias: 0.95,
    tireRearWearBias: 1.05,
    raceFuelLPer100Km: 59.2,
    estimatedTankRangeKm: 144,
    tireStintRangeKm: 66,
  },
  'de-tomaso-p900': {
    id: 'de-tomaso-p900',
    name: '2023 De Tomaso P900',
    shortName: 'De Tomaso P900',
    gearRatios: [-3.08, 0, 3.12, 2.34, 1.80, 1.42, 1.14, 0.93],
    maxGear: 6,
    finalDrive: 4.48,
    wheelRadius: 0.348,
    massKg: 900,
    yawInertia: 1360,
    pitchInertia: 1200,
    rollInertia: 375,
    wheelbase: 2.73,
    trackWidth: 1.75,
    naturallyAspirated: true,
    idleRpm: 1600,
    redlineRpm: 12300,
    shiftUpRpm: 11950,
    shiftDownRpm: 5600,
    shiftFlashRpm: 11500,
    maxPowerWatts: 671000, // 900 HP 6.2L NA V12 @ 12,300 RPM
    electricFillNm: 0,
    v8TorqueNm: 580,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.47,
    maxBrakeForce: 22200,
    cdaBase: 0.76,
    cdaScale: 0.33,
    downforceFront: 1.76,
    downforceRear: 2.35,
    defaultFrontWeightPct: 44,
    mechGripBoost: 1.14,
    fuelMaxLiters: 78,
    engineConfig: '6.2L NA V12',
    induction: 'Naturally Aspirated',
    fuelBurnMult: 1.26,
    tireWearMult: 0.95,
    tireFrontWearBias: 0.92,
    tireRearWearBias: 1.08,
    raceFuelLPer100Km: 46.0,
    estimatedTankRangeKm: 170,
    tireStintRangeKm: 98,
  },
  'subaru-wrx-sti': {
    id: 'subaru-wrx-sti',
    name: '2018 Subaru WRX STI',
    shortName: 'WRX STI',
    gearRatios: [-3.30, 0, 3.63, 2.37, 1.76, 1.34, 1.06, 0.84],
    maxGear: 6,
    finalDrive: 3.90,
    wheelRadius: 0.325,
    massKg: 1515,
    yawInertia: 2150,
    pitchInertia: 1920,
    rollInertia: 590,
    wheelbase: 2.65,
    trackWidth: 1.62,
    idleRpm: 880,
    redlineRpm: 7100,
    shiftUpRpm: 6820,
    shiftDownRpm: 2900,
    shiftFlashRpm: 6550,
    maxPowerWatts: 231000, // 310 HP 2.5L Turbo Boxer-4 AWD
    electricFillNm: 0,
    v8TorqueNm: 393,
    frontDriveFrac: 0.41,
    rearDriveFrac: 0.59,
    maxSteerRad: 0.54,
    maxBrakeForce: 16200,
    cdaBase: 0.88,
    cdaScale: 0.22,
    downforceFront: 0.42,
    downforceRear: 0.68,
    defaultFrontWeightPct: 55,
    mechGripBoost: 1.02,
    fuelMaxLiters: 60,
    engineConfig: '2.5L Turbo Boxer-4',
    induction: 'Single-Turbo',
    fuelBurnMult: 0.84,
    tireWearMult: 1.06,
    tireFrontWearBias: 1.12,
    tireRearWearBias: 0.88,
    raceFuelLPer100Km: 27.6,
    estimatedTankRangeKm: 217,
    tireStintRangeKm: 86,
  },
  'honda-s2000': {
    id: 'honda-s2000',
    name: 'Honda S2000 (AP1)',
    shortName: 'Honda S2000',
    gearRatios: [-2.80, 0, 3.13, 2.04, 1.48, 1.16, 0.97, 0.81],
    maxGear: 6,
    finalDrive: 4.10,
    wheelRadius: 0.315,
    massKg: 1260,
    yawInertia: 1680,
    pitchInertia: 1490,
    rollInertia: 460,
    wheelbase: 2.40,
    trackWidth: 1.56,
    naturallyAspirated: true,
    idleRpm: 950,
    redlineRpm: 9000,
    shiftUpRpm: 8780,
    shiftDownRpm: 3950,
    shiftFlashRpm: 8500,
    maxPowerWatts: 184000, // 247 HP 2.0L VTEC NA I4
    electricFillNm: 0,
    v8TorqueNm: 218,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.55,
    maxBrakeForce: 15200,
    cdaBase: 0.78,
    cdaScale: 0.18,
    downforceFront: 0.34,
    downforceRear: 0.52,
    defaultFrontWeightPct: 48,
    mechGripBoost: 1.01,
    fuelMaxLiters: 50,
    engineConfig: '2.0L F20C NA I4',
    induction: 'Naturally Aspirated',
    fuelBurnMult: 0.56,
    tireWearMult: 0.78,
    tireFrontWearBias: 0.96,
    tireRearWearBias: 1.04,
    raceFuelLPer100Km: 18.2,
    estimatedTankRangeKm: 275,
    tireStintRangeKm: 118,
  },
  'vw-polo-r-wrx': {
    id: 'vw-polo-r-wrx',
    name: '2018 Volkswagen Polo R Supercar (WRX)',
    shortName: 'Polo R WRX',
    gearRatios: [-3.40, 0, 3.55, 2.48, 1.85, 1.44, 1.15, 0.94],
    maxGear: 6,
    finalDrive: 4.16,
    wheelRadius: 0.325,
    massKg: 1300,
    yawInertia: 1790,
    pitchInertia: 1610,
    rollInertia: 510,
    wheelbase: 2.50,
    trackWidth: 1.72,
    idleRpm: 1250,
    redlineRpm: 8500,
    shiftUpRpm: 8150,
    shiftDownRpm: 3600,
    shiftFlashRpm: 7900,
    maxPowerWatts: 425000, // 570 HP 2.0L Turbo Rallycross AWD (0-100 in 1.9s)
    electricFillNm: 0,
    v8TorqueNm: 650,
    frontDriveFrac: 0.45,
    rearDriveFrac: 0.55,
    maxSteerRad: 0.56,
    maxBrakeForce: 18600,
    cdaBase: 0.94,
    cdaScale: 0.28,
    downforceFront: 0.72,
    downforceRear: 1.04,
    defaultFrontWeightPct: 55,
    mechGripBoost: 1.08,
    fuelMaxLiters: 55,
    engineConfig: '2.0L Turbo RX I4',
    induction: 'High-Boost Turbo',
    fuelBurnMult: 1.08,
    tireWearMult: 1.18,
    tireFrontWearBias: 1.08,
    tireRearWearBias: 0.92,
    raceFuelLPer100Km: 34.8,
    estimatedTankRangeKm: 158,
    tireStintRangeKm: 76,
  },
  'mercedes-amg-gt3-evo': {
    id: 'mercedes-amg-gt3-evo',
    name: '2020 Mercedes-AMG GT3 Evo',
    shortName: 'AMG GT3 Evo',
    gearRatios: [-3.08, 0, 3.12, 2.34, 1.80, 1.42, 1.14, 0.94],
    maxGear: 6,
    finalDrive: 3.56,
    wheelRadius: 0.345,
    massKg: 1285,
    yawInertia: 1840,
    pitchInertia: 1620,
    rollInertia: 495,
    wheelbase: 2.63,
    trackWidth: 1.74,
    naturallyAspirated: true,
    idleRpm: 1050,
    redlineRpm: 8200,
    shiftUpRpm: 7900,
    shiftDownRpm: 3400,
    shiftFlashRpm: 7600,
    maxPowerWatts: 410000, // 550 HP 6.2L M159 NA V8
    electricFillNm: 0,
    v8TorqueNm: 650,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.49,
    maxBrakeForce: 19200,
    cdaBase: 0.80,
    cdaScale: 0.30,
    downforceFront: 1.15,
    downforceRear: 1.52,
    defaultFrontWeightPct: 48,
    mechGripBoost: 1.04,
    fuelMaxLiters: 110,
    engineConfig: '6.2L M159 NA V8',
    induction: 'Naturally Aspirated',
    fuelBurnMult: 1.10,
    tireWearMult: 1.01,
    tireFrontWearBias: 0.99,
    tireRearWearBias: 1.01,
    raceFuelLPer100Km: 40.2,
    estimatedTankRangeKm: 274,
    tireStintRangeKm: 92,
  },
  'mclaren-f1-gtr-longtail': {
    id: 'mclaren-f1-gtr-longtail',
    name: '1997 McLaren F1 GTR Longtail',
    shortName: 'F1 GTR LT',
    gearRatios: [-3.02, 0, 2.98, 2.24, 1.72, 1.36, 1.10, 0.89],
    maxGear: 6,
    finalDrive: 3.36,
    wheelRadius: 0.340,
    massKg: 915,
    yawInertia: 1420,
    pitchInertia: 1290,
    rollInertia: 380,
    wheelbase: 2.72,
    trackWidth: 1.70,
    naturallyAspirated: true,
    idleRpm: 1050,
    redlineRpm: 7800,
    shiftUpRpm: 7520,
    shiftDownRpm: 3350,
    shiftFlashRpm: 7250,
    maxPowerWatts: 447420, // 600 HP 6.0L BMW S70/2 V12
    electricFillNm: 0,
    v8TorqueNm: 651,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.48,
    maxBrakeForce: 18400,
    cdaBase: 0.68,
    cdaScale: 0.28,
    downforceFront: 1.24,
    downforceRear: 1.68,
    defaultFrontWeightPct: 43,
    mechGripBoost: 1.06,
    fuelMaxLiters: 100,
    engineConfig: '6.0L S70/2 NA V12',
    induction: 'Naturally Aspirated',
    fuelBurnMult: 1.08,
    tireWearMult: 0.90,
    tireFrontWearBias: 0.92,
    tireRearWearBias: 1.08,
    raceFuelLPer100Km: 39.5,
    estimatedTankRangeKm: 253,
    tireStintRangeKm: 105,
  },
  'ferrari-f40-lbwk': {
    id: 'ferrari-f40-lbwk',
    name: 'Ferrari F40 LBWK Widebody',
    shortName: 'F40 LBWK',
    gearRatios: [-3.05, 0, 2.82, 2.04, 1.52, 1.18, 0.92],
    maxGear: 5,
    finalDrive: 3.44,
    wheelRadius: 0.335,
    massKg: 1140,
    yawInertia: 1580,
    pitchInertia: 1410,
    rollInertia: 440,
    wheelbase: 2.45,
    trackWidth: 1.74,
    idleRpm: 980,
    redlineRpm: 7750,
    shiftUpRpm: 7480,
    shiftDownRpm: 3250,
    shiftFlashRpm: 7200,
    maxPowerWatts: 403000, // 540 HP 2.9L Twin-Turbo F120A V8
    electricFillNm: 0,
    v8TorqueNm: 620,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.50,
    maxBrakeForce: 18200,
    cdaBase: 0.76,
    cdaScale: 0.25,
    downforceFront: 0.88,
    downforceRear: 1.28,
    defaultFrontWeightPct: 42,
    mechGripBoost: 1.05,
    fuelMaxLiters: 90,
    engineConfig: '2.9L TT V8',
    induction: 'Twin-Turbo',
    fuelBurnMult: 1.09,
    tireWearMult: 1.08,
    tireFrontWearBias: 0.90,
    tireRearWearBias: 1.10,
    raceFuelLPer100Km: 39.8,
    estimatedTankRangeKm: 226,
    tireStintRangeKm: 86,
  },
  'ferrari-250-testa-rossa': {
    id: 'ferrari-250-testa-rossa',
    name: '1957 Ferrari 250 Testa Rossa',
    shortName: '250 Testa Rossa',
    gearRatios: [-2.95, 0, 2.86, 2.02, 1.48, 1.15, 0.92],
    maxGear: 5,
    finalDrive: 3.68,
    wheelRadius: 0.330,
    massKg: 800,
    yawInertia: 1220,
    pitchInertia: 1120,
    rollInertia: 340,
    wheelbase: 2.35,
    trackWidth: 1.38,
    naturallyAspirated: true,
    idleRpm: 1000,
    redlineRpm: 8000,
    shiftUpRpm: 7720,
    shiftDownRpm: 3600,
    shiftFlashRpm: 7450,
    maxPowerWatts: 224000, // 300 HP 3.0L Colombo V12
    electricFillNm: 0,
    v8TorqueNm: 302,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.52,
    maxBrakeForce: 14800,
    cdaBase: 0.70,
    cdaScale: 0.14,
    downforceFront: 0.28,
    downforceRear: 0.40,
    defaultFrontWeightPct: 51,
    mechGripBoost: 1.02,
    fuelMaxLiters: 80,
    engineConfig: '3.0L Colombo V12',
    induction: 'Naturally Aspirated',
    fuelBurnMult: 0.76,
    tireWearMult: 0.74,
    tireFrontWearBias: 0.98,
    tireRearWearBias: 1.02,
    raceFuelLPer100Km: 24.8,
    estimatedTankRangeKm: 323,
    tireStintRangeKm: 124,
  },
  'mazda-787b': {
    id: 'mazda-787b',
    name: '1991 Mazda 787B Group C',
    shortName: 'Mazda 787B',
    gearRatios: [-2.90, 0, 2.94, 2.12, 1.58, 1.22, 0.94],
    maxGear: 5,
    finalDrive: 3.42,
    wheelRadius: 0.340,
    massKg: 830,
    yawInertia: 1310,
    pitchInertia: 1190,
    rollInertia: 350,
    wheelbase: 2.66,
    trackWidth: 1.72,
    naturallyAspirated: true,
    idleRpm: 1350,
    redlineRpm: 9000,
    shiftUpRpm: 8700,
    shiftDownRpm: 4100,
    shiftFlashRpm: 8400,
    maxPowerWatts: 522000, // 700 HP 2.6L R26B 4-Rotor Wankel
    electricFillNm: 0,
    v8TorqueNm: 607,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.46,
    maxBrakeForce: 20400,
    cdaBase: 0.66,
    cdaScale: 0.34,
    downforceFront: 1.76,
    downforceRear: 2.34,
    defaultFrontWeightPct: 44,
    mechGripBoost: 1.08,
    fuelMaxLiters: 100,
    engineConfig: '2.6L R26B 4-Rotor',
    induction: 'NA 4-Rotor Wankel',
    fuelBurnMult: 1.28,
    tireWearMult: 0.88,
    tireFrontWearBias: 0.93,
    tireRearWearBias: 1.07,
    raceFuelLPer100Km: 46.8,
    estimatedTankRangeKm: 214,
    tireStintRangeKm: 108,
  },
  'honda-ra272-f1': {
    id: 'honda-ra272-f1',
    name: '1965 Honda RA272 F1',
    shortName: 'Honda RA272',
    gearRatios: [-2.85, 0, 3.05, 2.28, 1.76, 1.41, 1.16, 0.96],
    maxGear: 6,
    finalDrive: 4.30,
    wheelRadius: 0.305,
    massKg: 498,
    yawInertia: 780,
    pitchInertia: 720,
    rollInertia: 230,
    wheelbase: 2.30,
    trackWidth: 1.52,
    naturallyAspirated: true,
    idleRpm: 1650,
    redlineRpm: 13000,
    shiftUpRpm: 12650,
    shiftDownRpm: 6200,
    shiftFlashRpm: 12100,
    maxPowerWatts: 171511, // 230 HP 1.5L RA272E V12 @ 13,000 RPM
    electricFillNm: 0,
    v8TorqueNm: 185,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.50,
    maxBrakeForce: 13200,
    cdaBase: 0.62,
    cdaScale: 0.12,
    downforceFront: 0.24,
    downforceRear: 0.34,
    defaultFrontWeightPct: 45,
    mechGripBoost: 1.05,
    fuelMaxLiters: 65,
    engineConfig: '1.5L Transverse V12',
    induction: 'Naturally Aspirated',
    fuelBurnMult: 0.68,
    tireWearMult: 0.66,
    tireFrontWearBias: 0.90,
    tireRearWearBias: 1.10,
    raceFuelLPer100Km: 21.5,
    estimatedTankRangeKm: 302,
    tireStintRangeKm: 135,
  },
  'vw-golf-gti-mk2': {
    id: 'vw-golf-gti-mk2',
    name: '1992 Volkswagen Golf GTI 16v (Mk2)',
    shortName: 'Golf GTI Mk2',
    gearRatios: [-3.15, 0, 3.45, 2.12, 1.44, 1.13, 0.89],
    maxGear: 5,
    finalDrive: 3.94,
    wheelRadius: 0.295,
    massKg: 960,
    yawInertia: 1380,
    pitchInertia: 1240,
    rollInertia: 410,
    wheelbase: 2.47,
    trackWidth: 1.50,
    naturallyAspirated: true,
    idleRpm: 880,
    redlineRpm: 7000,
    shiftUpRpm: 6750,
    shiftDownRpm: 2900,
    shiftFlashRpm: 6500,
    maxPowerWatts: 104000, // 139 HP 1.8L DOHC 16v I4 FWD
    electricFillNm: 0,
    v8TorqueNm: 168,
    frontDriveFrac: 1.0,
    rearDriveFrac: 0.0,
    maxSteerRad: 0.56,
    maxBrakeForce: 13800,
    cdaBase: 0.78,
    cdaScale: 0.14,
    downforceFront: 0.22,
    downforceRear: 0.30,
    defaultFrontWeightPct: 61,
    mechGripBoost: 1.02,
    fuelMaxLiters: 55,
    engineConfig: '1.8L 16v DOHC I4',
    induction: 'Naturally Aspirated',
    fuelBurnMult: 0.44,
    tireWearMult: 0.68,
    tireFrontWearBias: 1.24,
    tireRearWearBias: 0.76,
    raceFuelLPer100Km: 14.4,
    estimatedTankRangeKm: 382,
    tireStintRangeKm: 132,
  },
  'toyota-ae86-trueno': {
    id: 'toyota-ae86-trueno',
    name: '1983 Toyota Sprinter Trueno GT-Apex (AE86)',
    shortName: 'AE86 Trueno',
    gearRatios: [-3.10, 0, 3.59, 2.02, 1.38, 1.00, 0.86],
    maxGear: 5,
    finalDrive: 4.30,
    wheelRadius: 0.295,
    massKg: 940,
    yawInertia: 1340,
    pitchInertia: 1210,
    rollInertia: 390,
    wheelbase: 2.40,
    trackWidth: 1.48,
    naturallyAspirated: true,
    idleRpm: 900,
    redlineRpm: 7800,
    shiftUpRpm: 7520,
    shiftDownRpm: 3400,
    shiftFlashRpm: 7250,
    maxPowerWatts: 97000, // 130 HP 1.6L 4A-GE DOHC I4 RWD
    electricFillNm: 0,
    v8TorqueNm: 149,
    frontDriveFrac: 0.0,
    rearDriveFrac: 1.0,
    maxSteerRad: 0.58,
    maxBrakeForce: 13600,
    cdaBase: 0.76,
    cdaScale: 0.15,
    downforceFront: 0.24,
    downforceRear: 0.34,
    defaultFrontWeightPct: 52,
    mechGripBoost: 1.02,
    fuelMaxLiters: 50,
    engineConfig: '1.6L 4A-GE DOHC I4',
    induction: 'Naturally Aspirated',
    fuelBurnMult: 0.42,
    tireWearMult: 0.62,
    tireFrontWearBias: 0.94,
    tireRearWearBias: 1.06,
    raceFuelLPer100Km: 13.8,
    estimatedTankRangeKm: 362,
    tireStintRangeKm: 145,
  },
};

export interface StintEconomics {
  raceLengthLaps: number;
  targetStints: number;
  lapsPerStint: number;
  consumptionPerLap: number;
  wearPerLap: number; // fraction 0..1 per lap
  fuelBurnMult: number;
  tireWearMult: number;
  raceFuelLPer100Km: number;
  mileageKmPerL: number;
  estimatedTankRangeKm: number;
  tireStintRangeKm: number;
}

/**
 * Pure formula deriving per-lap fuel burn and tire wear directly from
 * raceLengthLaps, targetStints, and the selected vehicle's fuel & tire wear profile.
 */
export function resolveStintEconomics(
  config: RaceConfig,
  tankCapacityLiters: number,
  carId?: AnyCarSpecId,
): StintEconomics {
  const defaultStints =
    config.strategyPreset === 'realistic'
      ? 1
      : config.strategyPreset === 'endurance'
      ? 12
      : config.lapCount > 0 && config.lapCount <= 6
      ? 1
      : 2;
  const raceLengthLaps = config.lapCount > 0 ? config.lapCount : 20;
  const targetStints = clamp(Math.round(config.targetStints ?? defaultStints), 1, 20);
  const lapsPerStint = Math.max(0.5, raceLengthLaps / targetStints);
  const spec = carId ? VEHICLE_SPECS[carId] : undefined;
  const fuelBurnMult = spec?.fuelBurnMult ?? 1.0;
  const tireWearMult = spec?.tireWearMult ?? 1.0;
  const raceFuelLPer100Km = spec?.raceFuelLPer100Km ?? 36.0;
  const mileageKmPerL = Math.round((100 / Math.max(4, raceFuelLPer100Km)) * 100) / 100;
  const estimatedTankRangeKm = spec?.estimatedTankRangeKm ?? Math.round(tankCapacityLiters * mileageKmPerL);
  const tireStintRangeKm = spec?.tireStintRangeKm ?? Math.round(96 / Math.max(0.4, tireWearMult));

  return {
    raceLengthLaps,
    targetStints,
    lapsPerStint,
    consumptionPerLap: (tankCapacityLiters / lapsPerStint) * fuelBurnMult,
    wearPerLap: (1.0 / lapsPerStint) * tireWearMult,
    fuelBurnMult,
    tireWearMult,
    raceFuelLPer100Km,
    mileageKmPerL,
    estimatedTankRangeKm,
    tireStintRangeKm,
  };
}

export interface FullCarSpecSheet {
  engineConfig: string;
  induction: string;
  drivetrainSplit: string;
  powerToWeightHpPerTonne: number;
  redlineRpm: number;
  wheelbaseMm: number;
  trackWidthMm: number;
  weightDistLabel: string;
  fuelMaxLiters: number;
  raceFuelLPer100Km: number;
  mileageKmPerL: number;
  estimatedTankRangeKm: number;
  fuelBurnMult: number;
  tireWearMult: number;
  tireStintRangeKm: number;
  tireWearBiasLabel: string;
  downforceFrontKgf200: number;
  downforceRearKgf200: number;
  downforceTotalKgf200: number;
  dragCda: number;
  maxBrakeKn: number;
  gearCount: number;
  finalDrive: number;
  rearSteer: boolean;
}

export function getFullCarSpecSheet(
  carId: AnyCarSpecId,
  setup?: CarSetupConfig,
  visual?: CarVisualCustomization,
): FullCarSpecSheet {
  const spec = VEHICLE_SPECS[carId] ?? VEHICLE_SPECS['bmw-m4-gt3-evo'];
  const eff = setup ? computeEffectiveSpecs(spec, setup, visual) : null;
  const massKg = eff?.massKg ?? spec.massKg;
  const peakWatts = eff?.maxPowerWatts ?? spec.maxPowerWatts;
  const peakHp = peakWatts / 745.7;
  const fuelBurnMult = Number((spec.fuelBurnMult * (eff?.fuelBurnMult ?? 1.0)).toFixed(2));
  const raceFuelLPer100Km = Number((spec.raceFuelLPer100Km * (eff?.fuelBurnMult ?? 1.0)).toFixed(1));
  const mileageKmPerL = Number((100 / Math.max(4, raceFuelLPer100Km)).toFixed(2));
  const estimatedTankRangeKm = Math.round(spec.fuelMaxLiters * mileageKmPerL);

  const fFrac = Math.round(spec.frontDriveFrac * 100);
  const rFrac = Math.round(spec.rearDriveFrac * 100);
  const drivetrainSplit =
    fFrac === 0
      ? 'RWD (0:100)'
      : rFrac === 0
      ? 'FWD (100:0)'
      : `AWD (${fFrac}:${rFrac})`;

  const frontPct = setup?.weightDistributionFrontPct ?? spec.defaultFrontWeightPct;
  const rearPct = 100 - frontPct;

  // Compute real aerodynamic downforce kgf at 200 km/h (55.56 m/s)
  const q200 = 0.5 * 1.225 * 55.56 * 55.56;
  const dfScaleFront = eff ? eff.downforceFrontMult : 1.0;
  const dfScaleRear = eff ? eff.downforceRearMult : 1.0;
  const dfFrontN = q200 * spec.downforceFront * 0.85 * dfScaleFront;
  const dfRearN = q200 * spec.downforceRear * 0.85 * dfScaleRear;
  const downforceFrontKgf200 = Math.round(dfFrontN / 9.81);
  const downforceRearKgf200 = Math.round(dfRearN / 9.81);

  const fBiasPct = Math.round(spec.tireFrontWearBias * 50);
  const rBiasPct = 100 - fBiasPct;

  return {
    engineConfig: spec.engineConfig,
    induction: spec.induction,
    drivetrainSplit,
    powerToWeightHpPerTonne: Math.round((peakHp / (massKg / 1000)) * 10) / 10,
    redlineRpm: Math.round(eff?.redlineRpm ?? spec.redlineRpm),
    wheelbaseMm: Math.round(spec.wheelbase * 1000),
    trackWidthMm: Math.round((spec.trackWidth + (eff?.trackWidthDeltaM ?? 0)) * 1000),
    weightDistLabel: `${frontPct}:${rearPct}`,
    fuelMaxLiters: spec.fuelMaxLiters,
    raceFuelLPer100Km,
    mileageKmPerL,
    estimatedTankRangeKm,
    fuelBurnMult,
    tireWearMult: spec.tireWearMult,
    tireStintRangeKm: spec.tireStintRangeKm,
    tireWearBiasLabel: `F ${fBiasPct}% / R ${rBiasPct}%`,
    downforceFrontKgf200,
    downforceRearKgf200,
    downforceTotalKgf200: downforceFrontKgf200 + downforceRearKgf200,
    dragCda: Number(Math.max(0.32, spec.cdaBase + (eff?.cdaDelta ?? 0)).toFixed(2)),
    maxBrakeKn: Number(((eff?.maxBrakeForce ?? spec.maxBrakeForce) / 1000).toFixed(1)),
    gearCount: spec.maxGear,
    finalDrive: Number((eff?.finalDrive ?? spec.finalDrive).toFixed(2)),
    rearSteer: Boolean(spec.rearSteerEnabled),
  };
}

const BEST_LAP_STORAGE_KEY = 'aurelia_ridge_gt7_best_v1';

export function getBestLapStorageKeyFor(
  mapId: MapId,
  carId: AnyCarSpecId,
  direction?: TougeDirection,
): string {
  if (isTougeMapId(mapId)) {
    const dir = direction ?? getTougeDirection();
    return `${mapId}_${dir}_gt7_best_${carId}_v1`;
  }
  if (mapId === 'aurelia_ridge') {
    return carId === 'audi-r8-lms-evo'
      ? BEST_LAP_STORAGE_KEY
      : `${BEST_LAP_STORAGE_KEY}_${carId}`;
  }
  return `${mapId}_gt7_best_${carId}_v1`;
}

export function readBestLapMsForMapCar(
  mapId: MapId,
  carId: AnyCarSpecId,
  direction?: TougeDirection,
): number | null {
  try {
    const raw = window.localStorage.getItem(getBestLapStorageKeyFor(mapId, carId, direction));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredBestRecord>;
    return typeof parsed.bestLapMs === 'number' && parsed.bestLapMs > 10000 ? parsed.bestLapMs : null;
  } catch {
    return null;
  }
}

interface StoredBestRecord {
  bestLapMs: number;
  deltaBuckets: number[];
}

export const COORDINATE_FRAME_CONTRACT = {
  handedness: 'right-handed (Three.js)',
  upAxis: '+Y',
  forwardAxis: '+Z',
  leftAxis: '+X',
  yawPositive: 'CCW around +Y (+Z forward turns toward +X left)',
  steerPositive: '+X left',
  latGPositive: '+X left (load transfers right to FR/RR)',
  determinismStatus: 'NON_DETERMINISTIC_WARNING',
} as const;

export const NON_DETERMINISTIC_MATH_WARNING =
  'NON-DETERMINISTIC_WARNING: Vehicle physics uses native JS IEEE-754 Math intrinsics; cross-CPU bit-exact fixed-point/rollback determinism is deferred.';

export interface PhysicsSurfaceSample {
  t: number;
  absDistance: number;
  signedLateral: number;
  isBridge: boolean;
  centerPos: { x: number; y: number; z: number };
  tangent: { x: number; y: number; z: number };
  right: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
}

export interface PhysicsEnvironmentAdapter {
  totalLength?: number;
  roadHalfWidth?: number;
  gripScale?: number;
  kerbHeightScale?: number;
  querySurfaceAt?: (x: number, z: number) => PhysicsSurfaceSample;
  groundHeightAt?: (x: number, yRef: number, z: number, surface: PhysicsSurfaceSample) => number;
  groundNormalAt?: (x: number, z: number) => THREE.Vector3;
  skipCollisions?: boolean;
  wheelAnchorOriginShiftX?: number;
  wheelAnchorOriginShiftZ?: number;
}

export interface VehiclePhysicsSnapshot {
  pos: [number, number, number];
  vy: number;
  yaw: number;
  vx: number;
  vz: number;
  omega: number;
  bodyPitch: number;
  bodyRoll: number;
  bodyHeave: number;
  pitchVel: number;
  rollVel: number;
  heaveVel: number;
  steerAngle: number;
  steerAngleFL: number;
  steerAngleFR: number;
  gear: number;
  rpm: number;
  turboBoost: number;
  clutchEngage: number;
  revMatchBlipTimer: number;
  shiftTimer: number;
  throttleSmooth: number;
  brakeSmooth: number;
  steerCmdSmooth: number;
  steerRampDeg?: number;
  latG: number;
  lonG: number;
  wheelOmega: [number, number, number, number];
  wheelSpins: [number, number, number, number];
  kappaLag: [number, number, number, number];
  alphaLag: [number, number, number, number];
  wheelCompM: [number, number, number, number];
  wheelVelMps: [number, number, number, number];
  wheelGrounded: [boolean, boolean, boolean, boolean];
  wheelNormalFz: [number, number, number, number];
  brakeTempsC: [number, number, number, number];
  tireLife: [number, number, number, number];
  tirePressuresPsi: [number, number, number, number];
  tireShredded: [boolean, boolean, boolean, boolean];
  tirePunctureAgeSec: [number, number, number, number];
  tireDeflationFrac: [number, number, number, number];
  oilTempC: number;
  waterTempC: number;
  fuelLiters: number;
  fuelState: FuelStarvationState;
  fixedAccumSec: number;
  lap: number;
  lapTimeMs: number;
  countdownTimer: number;
  prngState?: number;
  testModeEnabled?: boolean;
}

const DELTA_BUCKETS = 80;
const CHASSIS_HZ = 120;
const CHASSIS_DT = 1 / CHASSIS_HZ;
const TIRE_SUBSTEPS = 8; // 8 * 120 Hz = 960 Hz (~1000 Hz) tire, suspension & thermal solver

const _surfNormal = new THREE.Vector3(0, 1, 0);
const _trackNormal = new THREE.Vector3(0, 1, 0);
const _groundNorm = new THREE.Vector3(0, 1, 0);
const _carFwd = new THREE.Vector3(0, 0, 1);
const _carLeft = new THREE.Vector3(1, 0, 0);
const _carUp = new THREE.Vector3(0, 1, 0);
const _basisMat = new THREE.Matrix4();

function smoothRpmBlend(x: number, edge0: number, edge1: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * C1-continuous smooth brake pad friction curve vs rotor temperature (°C).
 * Eliminates piecewise fade kinks:
 *   Warmup (24 -> 185°C): 0.87 -> 1.03
 *   Fade (680 -> 980°C):  1.03 -> 0.56
 */
function smoothBrakePadMu(tempC: number, fadeLimitDeltaC = 0): number {
  const warm = smoothRpmBlend(tempC, 24, 185);
  const fade = smoothRpmBlend(tempC, 680 + fadeLimitDeltaC, 980 + fadeLimitDeltaC);
  return (0.87 + 0.16 * warm) - 0.47 * fade;
}

/**
 * Parameterized powertrain torque curve supporting both Hybrid VGT & 3.8L Twin-Turbo GT3 V8
 */
function engineTorqueAtRpm(
  rpm: number,
  spec: VehicleSpecProfile,
  turboBoost: number,
  eff?: EffectiveVehicleSpecs,
): number {
  const redline = eff ? eff.redlineRpm : spec.redlineRpm;
  const v8Nm = eff ? eff.v8TorqueNm : spec.v8TorqueNm;
  const electricNm = eff ? eff.electricFillNm : spec.electricFillNm;
  const maxPowerW = eff ? eff.maxPowerWatts : spec.maxPowerWatts;
  const lowEndMult = eff ? eff.lowEndTorqueMult : 1.0;
  const topEndMult = eff ? eff.topEndTorqueMult : 1.0;

  const r = clamp(rpm, spec.idleRpm * 0.25, redline);
  if (r >= redline) {
    return 0;
  }
  const fuelCutSoft = r > redline - 95 ? clamp((redline - r) / 95, 0, 1) : 1.0;
  const n = clamp((r - spec.idleRpm) / Math.max(100, redline - spec.idleRpm), 0, 1);
  const electricFill =
    electricNm > 0
      ? electricNm * (1.0 - smoothRpmBlend(n, 0.55, 0.98) * 0.35)
      : 0;
  const spoolOffset = electricNm > 0 ? 0.14 : 0.22;
  const shapeMult = lerp(lowEndMult, topEndMult, n);
  const v8Base =
    v8Nm *
    shapeMult *
    Math.pow(Math.sin(clamp((n + spoolOffset) / (1 + spoolOffset), 0, 1) * Math.PI * 0.62), 0.72);
  // Naturally aspirated engines respond immediately unless converted via forced-induction swap
  const isForcedInduction =
    !spec.naturallyAspirated ||
    Boolean(eff && (eff as EffectiveVehicleSpecs & { forcedInductionSwap?: boolean }).forcedInductionSwap);
  const v8Boost = !isForcedInduction
    ? v8Base
    : v8Base * (0.68 + 0.32 * clamp(turboBoost, 0, 1.15));
  const combinedNm = electricFill + v8Boost;
  const omegaEng = Math.max(120, (r * Math.PI * 2) / 60);
  const powerCapNm = maxPowerW / omegaEng;
  const topTaper = n > 0.90 ? 1 - ((n - 0.90) / 0.10) * 0.16 : 1.0;
  return Math.min(combinedNm, powerCapNm) * topTaper * fuelCutSoft;
}

/**
 * Pacejka Magic Formula (MF 5.2/6.1 inspired):
 * D * sin(C * atan(B * s - E * (B * s - atan(B * s))))
 */
function pacejkaMagic(slip: number, B: number, C: number, E: number, overSlipFalloff = 0.16): number {
  const absS = Math.abs(slip);
  const bx = B * absS;
  const shaped = bx - E * (bx - Math.atan(bx));
  const val = Math.sin(C * Math.atan(shaped));
  const over = Math.max(0, absS - 0.28);
  const tail = 1.0 - clamp(over * 0.26, 0, overSlipFalloff);
  return (slip > 0 ? 1 : slip < 0 ? -1 : 0) * val * tail;
}

/**
 * Staged tire grip vs tread life:
 *   0–80% wear  (life 1.0 -> 0.20): smooth scrub-in near 92%, linear decay to 0.85x at 20% life
 *   80–100% wear (life 0.20 -> 0.0): accelerated drop from 0.85x -> 0.55x
 *   100% wear (shredded): floor ~0.35x
 */
function tireGripFromLife(life: number, shredded: boolean): number {
  if (shredded) return 0.35;
  const l = clamp(life, 0, 1);
  if (l >= 0.85) {
    return 1.0 + (1.0 - l) * 0.12;
  }
  if (l >= 0.20) {
    return lerp(0.85, 1.018, (l - 0.20) / 0.65);
  }
  return lerp(0.55, 0.85, l / 0.20);
}

function wrapAngle(a: number): number {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

/**
 * Zero-GC pre-allocated 25 Hz ring buffer for Telemetry CSV export.
 * Records trailing 60 seconds (1500 rows) when Advanced Telemetry is enabled.
 */
const CSV_MAX_ROWS = 1500;
const CSV_COLS = 46;

class TelemetryCsvLogger {
  private buf = new Float32Array(CSV_MAX_ROWS * CSV_COLS);
  private writeIdx = 0;
  private count = 0;
  private accumSec = 0;
  private simTimeSec = 0;
  private enabled = false;

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public clear() {
    this.writeIdx = 0;
    this.count = 0;
    this.accumSec = 0;
    this.simTimeSec = 0;
  }

  public getSampleCount(): number {
    return this.count;
  }

  public maybeRecord(dt: number, tlm: VehicleTelemetry) {
    if (!this.enabled) return;
    this.simTimeSec += dt;
    this.accumSec += dt;
    if (this.count > 0 && this.accumSec < 0.04) return; // 25 Hz
    this.accumSec = Math.min(this.accumSec - 0.04, 0.04);
    if (this.accumSec < 0) this.accumSec = 0;

    const b = this.writeIdx * CSV_COLS;
    const d = this.buf;
    const fuelCode =
      tlm.fuelState === 'stalled' ? 3 : tlm.fuelState === 'critical' ? 2 : tlm.fuelState === 'starving' ? 1 : 0;
    const corners = [tlm.tires.fl, tlm.tires.fr, tlm.tires.rl, tlm.tires.rr];

    d[b + 0] = this.simTimeSec;
    d[b + 1] = tlm.lap;
    d[b + 2] = tlm.speedKmh;
    d[b + 3] = tlm.rpm;
    d[b + 4] = tlm.gear;
    d[b + 5] = tlm.throttle;
    d[b + 6] = tlm.brake;
    d[b + 7] = tlm.steerNorm * 27;
    d[b + 8] = tlm.latG;
    d[b + 9] = tlm.lonG;
    d[b + 10] = tlm.fuelLiters;
    d[b + 11] = fuelCode;
    d[b + 12] = tlm.cockpitDials.brakeBalance;
    d[b + 13] = tlm.cockpitDials.tcsLevel;
    d[b + 14] = tlm.cockpitDials.absLevel;
    d[b + 15] = tlm.cockpitDials.engineMap;
    d[b + 16] = tlm.cockpitDials.diffPreload;
    for (let i = 0; i < 4; i++) {
      d[b + 17 + i] = corners[i].gripLossPct;
      d[b + 21 + i] = corners[i].lifePct;
      d[b + 25 + i] = tlm.tirePressuresPsi[i];
      d[b + 29 + i] = corners[i].kappa;
      d[b + 33 + i] = corners[i].alphaDeg;
      d[b + 37 + i] = corners[i].travelMm;
      d[b + 41 + i] = corners[i].brakeTempC;
    }
    d[b + 45] = tlm.downforceKgf;

    this.writeIdx = (this.writeIdx + 1) % CSV_MAX_ROWS;
    if (this.count < CSV_MAX_ROWS) this.count++;
  }

  public toCsvString(): string {
    const header =
      'time_s,lap,speed_kmh,rpm,gear,throttle,brake,steer_deg,lat_g,lon_g,fuel_L,fuel_state,brake_bias,tcs_lvl,abs_lvl,eng_map,diff_preload,' +
      'fl_grip_loss_pct,fr_grip_loss_pct,rl_grip_loss_pct,rr_grip_loss_pct,fl_life_pct,fr_life_pct,rl_life_pct,rr_life_pct,' +
      'fl_psi,fr_psi,rl_psi,rr_psi,fl_kappa,fr_kappa,rl_kappa,rr_kappa,fl_alpha_deg,fr_alpha_deg,rl_alpha_deg,rr_alpha_deg,' +
      'fl_travel_mm,fr_travel_mm,rl_travel_mm,rr_travel_mm,fl_brake_c,fr_brake_c,rl_brake_c,rr_brake_c,downforce_kgf';
    if (this.count === 0) return header + '\n';

    const lines: string[] = [header];
    const start = this.count < CSV_MAX_ROWS ? 0 : this.writeIdx;
    const d = this.buf;
    for (let i = 0; i < this.count; i++) {
      const idx = ((start + i) % CSV_MAX_ROWS) * CSV_COLS;
      const row: string[] = [];
      for (let c = 0; c < CSV_COLS; c++) {
        const v = d[idx + c];
        row.push(c === 1 || c === 3 || c === 4 || (c >= 11 && c <= 16) ? String(Math.round(v)) : v.toFixed(3));
      }
      lines.push(row.join(','));
    }
    return lines.join('\n') + '\n';
  }
}

export class VehiclePhysicsEngine {
  private circuit: CircuitData;
  private startFinishT: number;
  private envAdapter: PhysicsEnvironmentAdapter | null;

  // Spatial rigid state (Three.js Y-up, +Z forward, +X left)
  public pos = new THREE.Vector3();
  public vy = 0;
  public yaw = 0;
  public vx = 0;
  public vz = 0;
  public omega = 0;

  // Fixed timestep accumulator & diagnostics
  private fixedAccumSec = 0;
  private lastStepCpuMs = 0;
  private maxStepCpuMs = 0;
  private lastEscTorqueNm = 0;
  private rolloverSsf = 3.0;
  private rolloverRiskRatio = 0.45;
  private rolloverWarning = false;
  private rolloverWarnedKey = '';
  private lastPhysicsPreset: PhysicsPreset = 'simulation';
  private lastTelemetryCache: VehicleTelemetry | null = null;
  private lastInPitLane = false;
  private lastInPitBox = false;
  private lastAbsFlag = false;
  private lastTcsFlag = false;
  private lastAvgGripPct = 100;
  private lastVLongOut = 0;
  private lastVLatOut = 0;
  private testModeEnabled = false;
  private fixedTestFuelLiters: number | null = null;
  private prngState = 0x9e3779b9;
  private bottomingEventsCount = 0;

  // Sprung body orientation & 4-wheel visual rig state
  public bodyPitch = 0;
  public bodyRoll = 0;
  public bodyHeave = 0;
  private pitchVel = 0;
  private rollVel = 0;
  private heaveVel = 0;
  public steerAngle = 0;
  public steerAngleFL = 0;
  public steerAngleFR = 0;
  public wheelSpin = 0;
  public wheelSpins: [number, number, number, number] = [0, 0, 0, 0];
  public wheelSuspOffsets: [number, number, number, number] = [0, 0, 0, 0];
  public worldQuaternion = new THREE.Quaternion();
  public forwardDir = new THREE.Vector3(0, 0, 1);
  public rightDir = new THREE.Vector3(-1, 0, 0);
  public upDir = new THREE.Vector3(0, 1, 0);

  // Active Car Model & Spec Profile
  private carId: AnyCarSpecId = 'bmw-m4-gt3-evo';
  private spec: VehicleSpecProfile = VEHICLE_SPECS['bmw-m4-gt3-evo'];

  // Drivetrain, Clutch, Steering Shaping & Setup + Cockpit MFD Dials + Pit Strategy
  private carSetup: CarSetupConfig = getDefaultCarSetup();
  private visualCustomization?: CarVisualCustomization;
  private cockpitDials: CockpitDialState = getDefaultCockpitDials();
  private pitStrategy: PitStrategyPlan = getDefaultPitStrategy('racing_hard');
  private gear = 1; // -1..maxGear
  private prevGear = 1;
  private rpm = 1150;
  private turboBoost = 0.2;
  private clutchEngage = 1.0;
  private revMatchBlipTimer = 0;
  private shiftTimer = 0;
  private throttleSmooth = 0;
  private brakeSmooth = 0;
  private steerCmdSmooth = 0;
  private steerRampDeg = 0;
  private lastGovCapDeg = 0;
  private lastCstAssistDeg = 0;
  private lastSlipBodyDeg = 0;
  private latG = 0;
  private lonG = 0;
  private prevThrottleSmooth = 0;

  // 1000 Hz Per-Wheel Dynamics [FL, FR, RL, RR]
  private wheelOmega: [number, number, number, number] = [0, 0, 0, 0];
  private kappaLag: [number, number, number, number] = [0, 0, 0, 0];
  private alphaLag: [number, number, number, number] = [0, 0, 0, 0];
  private alphaDegOut: [number, number, number, number] = [0, 0, 0, 0];
  private wheelCompM: [number, number, number, number] = [0.055, 0.055, 0.055, 0.055];
  private wheelVelMps: [number, number, number, number] = [0, 0, 0, 0];
  private wheelTravelMm: [number, number, number, number] = [0, 0, 0, 0];
  private wheelGrounded: [boolean, boolean, boolean, boolean] = [true, true, true, true];
  private wheelNormalFz: [number, number, number, number] = [2400, 2400, 2500, 2500];
  private brakeTempsC: [number, number, number, number] = [140, 140, 130, 130];
  private brakeFaded: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  private lsdLockPct = 0;
  private downforceKgf = 0;
  private ffbTorqueNorm = 0;

  // Progressive Tire Pressures, Wear & Shred/Puncture [FL, FR, RL, RR]
  private tireGripLossPct: [number, number, number, number] = [0, 0, 0, 0];
  private tireLoads: [number, number, number, number] = [0.55, 0.55, 0.65, 0.65];
  private tireSlips: [number, number, number, number] = [0, 0, 0, 0];
  private tireLife: [number, number, number, number] = [1, 1, 1, 1];
  private tirePressuresPsi: [number, number, number, number] = [27.5, 27.5, 27.0, 27.0];
  private tireShredded: [boolean, boolean, boolean, boolean] = [false, false, false, false];
  private tirePunctureAgeSec: [number, number, number, number] = [0, 0, 0, 0];
  private tireDeflationFrac: [number, number, number, number] = [0, 0, 0, 0];

  // Universal Fuel Tank & Staged Starvation state
  private fuelLiters = 92;
  private fuelUsedThisLap = 0;
  private prevLapFuelUsed = 0;
  private fuelState: FuelStarvationState = 'normal';
  private starvationCutClock = 0;
  private engineCranking = false;
  private powerSteeringLost = false;

  // Engine Thermals
  private oilTempC = 84.0;
  private waterTempC = 80.5;

  // Speed Trap & Drift Zone state
  private speedTrapKmh: number | null = null;
  private speedTrapBannerTimer = 0;
  private speedTrapRecordKmh = 0;
  private prevTrackTForTrap = 0;
  private inDriftClippingZone = false;

  // Pit Lane & Service state
  private pitServiceTimer = 0;
  private pitServiceDurationSec = 2.4;
  private pitStartFuelLiters = 0;
  private pitTargetFuelLiters = 92;
  private pitCompleteBannerTimer = 0;
  private pitCompletePulse = 0;

  // Motorsport Hazard / Yellow Flag state
  private hazardImpactTimer = 0;
  private yellowHoldTimer = 0;
  private hazardTrackT: number | null = null;
  private hazardReason = '';

  // Race / Lap & Game Mode state
  private raceConfig: RaceConfig = {
    mode: 'time_trial',
    lapCount: 20,
    difficulty: 'pro',
    targetStints: 2,
    strategyPreset: 'sprint',
  };
  private countdownTimer = 3.2;
  private totalRaceTimeMs = 0;
  private lap = 1;
  private lapTimeMs = 0;
  private lastLapMs: number | null = null;
  private bestLapMs: number | null = null;
  private bestBuckets: number[] | null = null;
  private currentBuckets: number[] = new Array(DELTA_BUCKETS).fill(-1);
  private lastProgress = 0;
  private sectorStartMs = 0;
  private sectorTimesMs: [number | null, number | null, number | null] = [null, null, null];
  private bestSectorTimesMs: [number | null, number | null, number | null] = [null, null, null];
  private sectorRecordPulse: 0 | 1 | 2 | 3 = 0;
  private cleanLap = true;
  private crossedStartOnce = false;
  private raceFinished = false;
  private playerFinishTimeMs: number | null = null;
  private finishSummary: FinishSummary | null = null;

  // Drift Attack state
  private driftPoints = 0;
  private driftActivePoints = 0;
  private driftCombo = 1;
  private driftChainSec = 0;
  private driftHoldGrace = 0;
  private driftAngleDeg = 0;

  // Tofu Delivery Water Cup state
  private tofuIntegrityPct = 100;
  private tofuCupTiltX = 0;
  private tofuCupTiltZ = 0;
  private tofuCupVelX = 0;
  private tofuCupVelZ = 0;
  private tofuSpilling = false;
  private tofuFailed = false;
  private tofuFailureReason = '';
  private tofuGrade: TofuGrade | null = null;
  private prevLatG = 0;

  // Ghost Battle & Tandem telemetry state (updated externally by SceneController)
  private ghostActive = false;
  private ghostName = '';
  private ghostDeltaSec: number | null = null;
  private ghostGapMeters: number | null = null;
  private tandemPartnerUsername: string | null = null;
  private tandemRole: 'LEAD' | 'CHASE' | null = null;
  private tandemMultiplier = 1;
  private tandemBonusPoints = 0;

  // Audio/FX pulses & scratch collision output
  private wallImpactImpulse = 0;
  private wallScrapeIntensity = 0;
  private tireSquealIntensity = 0;
  private turboBlowOffPulse = 0;
  private gearShiftPulse = 0;
  private absActive = false;
  private tcsActive = false;
  private brakeSkidIntensity = 0;
  private currentSurface: VehicleTelemetry['surface'] = 'tarmac';
  private lastAudioSurface: VehicleTelemetry['audioSurface'] = 'asphalt';
  private aeroDeployed = true;
  private aeroManualOverrideSec = 0;
  private lastSlopeGradePct = 0;
  private kerbRumble = 0;
  private currentTrackT = 0;
  private dirtLevel = 0;
  private rubberInProgress = 0;
  private rivalListOut: RivalTelemetry[] = [];

  private csvLogger = new TelemetryCsvLogger();

  private collisionScratch: CollisionResolution = {
    hit: false,
    pushX: 0,
    pushZ: 0,
    normalX: 0,
    normalZ: 0,
    hitX: 0,
    hitY: 0,
    hitZ: 0,
    leverTorque: 0,
    material: 'metal',
    sparks: false,
  };
  private pendingSparkEvents: SparkEmitEvent[] = [];
  private pendingRivalImpacts: CarImpactTransfer[] = [];
  private collisionVerticalDampTimer = 0;
  private prevChassisAvgGroundY = 0;

  public consumeRivalImpacts(): CarImpactTransfer[] {
    return this.pendingRivalImpacts;
  }

  // Zero-GC pre-allocated scratch buffers for 120 Hz chassis & 960 Hz tire substeps
  private readonly scratchRawWheelX = new Float64Array(4);
  private readonly scratchRawWheelZ = new Float64Array(4);
  private readonly scratchWheelCoordsX = new Float64Array(4);
  private readonly scratchWheelCoordsZ = new Float64Array(4);
  private readonly scratchCornerMu = new Float64Array(4);
  private readonly scratchCornerPeakShift = new Float64Array(4);
  private readonly scratchSteerAngles = new Float64Array(4);
  private readonly scratchTargetCornerFz = new Float64Array(4);
  private readonly scratchAeroPerCorner = new Float64Array(4);
  private readonly scratchCornerBrakeT = new Float64Array(4);
  private readonly scratchCornerBrakeF = new Float64Array(4);
  private readonly scratchCornerGroundY = new Float64Array(4);
  private readonly scratchCornerPlaneOffsetY = new Float64Array(4);
  private readonly scratchStepFz = new Float64Array(4);
  private readonly scratchWheelDriveT = new Float64Array(4);
  private readonly scratchSteerableMask = [true, true, false, false];
  private readonly scratchFinalUp = new THREE.Vector3();
  private readonly surfQScratch = createCircuitQueryScratch();
  private readonly wheelQScratch = createCircuitQueryScratch();
  private readonly colQScratch = createCircuitQueryScratch();
  private readonly groundNormScratch = new THREE.Vector3();

  constructor(envAdapter: PhysicsEnvironmentAdapter | null = null) {
    this.envAdapter = envAdapter;
    this.circuit = getCircuitData();
    this.startFinishT = this.circuit.samples[this.circuit.startFinishIndex].t;
    this.loadStoredBest();
    this.resetToGrid(true);
  }

  public setEnvironmentAdapter(envAdapter: PhysicsEnvironmentAdapter | null) {
    this.envAdapter = envAdapter;
  }

  public exportPhysicsSnapshot(): VehiclePhysicsSnapshot {
    return {
      pos: [this.pos.x, this.pos.y, this.pos.z],
      vy: this.vy,
      yaw: this.yaw,
      vx: this.vx,
      vz: this.vz,
      omega: this.omega,
      bodyPitch: this.bodyPitch,
      bodyRoll: this.bodyRoll,
      bodyHeave: this.bodyHeave,
      pitchVel: this.pitchVel,
      rollVel: this.rollVel,
      heaveVel: this.heaveVel,
      steerAngle: this.steerAngle,
      steerAngleFL: this.steerAngleFL,
      steerAngleFR: this.steerAngleFR,
      gear: this.gear,
      rpm: this.rpm,
      turboBoost: this.turboBoost,
      clutchEngage: this.clutchEngage,
      revMatchBlipTimer: this.revMatchBlipTimer,
      shiftTimer: this.shiftTimer,
      throttleSmooth: this.throttleSmooth,
      brakeSmooth: this.brakeSmooth,
      steerCmdSmooth: this.steerCmdSmooth,
      steerRampDeg: this.steerRampDeg,
      latG: this.latG,
      lonG: this.lonG,
      wheelOmega: [...this.wheelOmega] as [number, number, number, number],
      wheelSpins: [...this.wheelSpins] as [number, number, number, number],
      kappaLag: [...this.kappaLag] as [number, number, number, number],
      alphaLag: [...this.alphaLag] as [number, number, number, number],
      wheelCompM: [...this.wheelCompM] as [number, number, number, number],
      wheelVelMps: [...this.wheelVelMps] as [number, number, number, number],
      wheelGrounded: [...this.wheelGrounded] as [boolean, boolean, boolean, boolean],
      wheelNormalFz: [...this.wheelNormalFz] as [number, number, number, number],
      brakeTempsC: [...this.brakeTempsC] as [number, number, number, number],
      tireLife: [...this.tireLife] as [number, number, number, number],
      tirePressuresPsi: [...this.tirePressuresPsi] as [number, number, number, number],
      tireShredded: [...this.tireShredded] as [boolean, boolean, boolean, boolean],
      tirePunctureAgeSec: [...this.tirePunctureAgeSec] as [number, number, number, number],
      tireDeflationFrac: [...this.tireDeflationFrac] as [number, number, number, number],
      oilTempC: this.oilTempC,
      waterTempC: this.waterTempC,
      fuelLiters: this.fuelLiters,
      fuelState: this.fuelState,
      fixedAccumSec: this.fixedAccumSec,
      lap: this.lap,
      lapTimeMs: this.lapTimeMs,
      countdownTimer: this.countdownTimer,
      prngState: this.prngState,
      testModeEnabled: this.testModeEnabled,
    };
  }

  public restorePhysicsSnapshot(snap: VehiclePhysicsSnapshot) {
    this.pos.set(snap.pos[0], snap.pos[1], snap.pos[2]);
    this.vy = snap.vy;
    this.yaw = snap.yaw;
    this.vx = snap.vx;
    this.vz = snap.vz;
    this.omega = snap.omega;
    this.bodyPitch = snap.bodyPitch;
    this.bodyRoll = snap.bodyRoll;
    this.bodyHeave = snap.bodyHeave;
    this.pitchVel = snap.pitchVel;
    this.rollVel = snap.rollVel;
    this.heaveVel = snap.heaveVel;
    this.steerAngle = snap.steerAngle;
    this.steerAngleFL = snap.steerAngleFL;
    this.steerAngleFR = snap.steerAngleFR;
    this.gear = snap.gear;
    this.prevGear = snap.gear;
    this.rpm = snap.rpm;
    this.turboBoost = snap.turboBoost;
    this.clutchEngage = snap.clutchEngage;
    this.revMatchBlipTimer = snap.revMatchBlipTimer;
    this.shiftTimer = snap.shiftTimer;
    this.throttleSmooth = snap.throttleSmooth;
    this.brakeSmooth = snap.brakeSmooth;
    this.steerCmdSmooth = snap.steerCmdSmooth;
    this.steerRampDeg = snap.steerRampDeg ?? 0;
    this.latG = snap.latG;
    this.lonG = snap.lonG;
    this.wheelOmega = [...snap.wheelOmega] as [number, number, number, number];
    this.wheelSpins = [...snap.wheelSpins] as [number, number, number, number];
    this.kappaLag = [...snap.kappaLag] as [number, number, number, number];
    this.alphaLag = [...snap.alphaLag] as [number, number, number, number];
    this.wheelCompM = [...snap.wheelCompM] as [number, number, number, number];
    this.wheelVelMps = [...snap.wheelVelMps] as [number, number, number, number];
    this.wheelGrounded = [...snap.wheelGrounded] as [boolean, boolean, boolean, boolean];
    this.wheelNormalFz = [...snap.wheelNormalFz] as [number, number, number, number];
    this.brakeTempsC = [...snap.brakeTempsC] as [number, number, number, number];
    this.tireLife = [...snap.tireLife] as [number, number, number, number];
    this.tirePressuresPsi = [...snap.tirePressuresPsi] as [number, number, number, number];
    this.tireShredded = [...snap.tireShredded] as [boolean, boolean, boolean, boolean];
    this.tirePunctureAgeSec = [...snap.tirePunctureAgeSec] as [number, number, number, number];
    this.tireDeflationFrac = [...snap.tireDeflationFrac] as [number, number, number, number];
    this.oilTempC = snap.oilTempC;
    this.waterTempC = snap.waterTempC;
    this.fuelLiters = snap.fuelLiters;
    this.fuelState = snap.fuelState;
    this.fixedAccumSec = snap.fixedAccumSec;
    this.lap = snap.lap;
    this.lapTimeMs = snap.lapTimeMs;
    this.countdownTimer = snap.countdownTimer;
    if (typeof snap.prngState === 'number') this.prngState = snap.prngState >>> 0;
    if (typeof snap.testModeEnabled === 'boolean') this.testModeEnabled = snap.testModeEnabled;
  }

  /**
   * Direct test helpers for headless verification & diagnostics without mutating track geometry.
   */
  public setStateForTest(state: {
    x?: number;
    y?: number;
    z?: number;
    vx?: number;
    vy?: number;
    vz?: number;
    yaw?: number;
    omega?: number;
    gear?: number;
    rpm?: number;
    tireLife?: [number, number, number, number];
    brakeTempsC?: [number, number, number, number];
    fuelLiters?: number;
    countdownTimer?: number;
  }) {
    if (typeof state.x === 'number') this.pos.x = state.x;
    if (typeof state.y === 'number') this.pos.y = state.y;
    if (typeof state.z === 'number') this.pos.z = state.z;
    if (typeof state.vx === 'number') this.vx = state.vx;
    if (typeof state.vy === 'number') this.vy = state.vy;
    if (typeof state.vz === 'number') this.vz = state.vz;
    if (typeof state.yaw === 'number') this.yaw = state.yaw;
    if (typeof state.omega === 'number') this.omega = state.omega;
    if (typeof state.gear === 'number') {
      this.gear = state.gear;
      this.prevGear = state.gear;
    }
    if (typeof state.rpm === 'number') this.rpm = state.rpm;
    if (state.tireLife) this.tireLife = [...state.tireLife] as [number, number, number, number];
    if (state.brakeTempsC) this.brakeTempsC = [...state.brakeTempsC] as [number, number, number, number];
    if (typeof state.fuelLiters === 'number') this.fuelLiters = state.fuelLiters;
    if (typeof state.countdownTimer === 'number') this.countdownTimer = state.countdownTimer;
    this.steerRampDeg = 0;
    this.steerAngle = 0;
    this.steerAngleFL = 0;
    this.steerAngleFR = 0;
    this.lastGovCapDeg = 0;
    this.lastCstAssistDeg = 0;
    this.lastSlipBodyDeg = 0;
    this.fixedAccumSec = 0;
    this.collisionVerticalDampTimer = 0;
    this.prevChassisAvgGroundY = this.pos.y;
    this.pendingRivalImpacts.length = 0;
  }

  private remoteColliders: Array<{ id: string; x: number; z: number; vx: number; vz: number }> = [];
  private scratchColliders: Array<{ id: string; x: number; z: number; vx: number; vz: number }> = [];

  public setRemoteCarColliders(
    cars: Array<{ id: string; x: number; z: number; vx: number; vz: number }>,
  ) {
    this.remoteColliders = cars;
  }

  public refreshCircuit() {
    this.circuit = getCircuitData();
    this.startFinishT = this.circuit.samples[this.circuit.startFinishIndex].t;
    this.loadStoredBest();
  }

  private getStorageKey(): string {
    return getBestLapStorageKeyFor(
      this.circuit.mapId,
      this.carId,
      isTougeMapId(this.circuit.mapId) ? getTougeDirection() : undefined,
    );
  }

  private loadStoredBest() {
    this.bestLapMs = null;
    this.bestBuckets = null;
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const raw = window.localStorage.getItem(this.getStorageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredBestRecord;
      if (typeof parsed.bestLapMs === 'number' && parsed.bestLapMs > 10000) {
        this.bestLapMs = parsed.bestLapMs;
        if (Array.isArray(parsed.deltaBuckets) && parsed.deltaBuckets.length === DELTA_BUCKETS) {
          this.bestBuckets = parsed.deltaBuckets;
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveStoredBest() {
    if (this.bestLapMs === null || !this.bestBuckets) return;
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const payload: StoredBestRecord = {
        bestLapMs: this.bestLapMs,
        deltaBuckets: this.bestBuckets,
      };
      window.localStorage.setItem(this.getStorageKey(), JSON.stringify(payload));
    } catch {
      // Ignore storage errors
    }
  }

  public setCarModel(carId: AnyCarSpecId) {
    const resolvedId: AnyCarSpecId = VEHICLE_SPECS[carId] ? carId : normalizeCarModelId(carId);
    if (this.carId === resolvedId) return;
    const prevSpec = this.spec;
    const prevMaxFuel = prevSpec.fuelMaxLiters;
    const fuelFrac = clamp(this.fuelLiters / Math.max(1, prevMaxFuel), 0, 1);
    this.carId = resolvedId;
    this.spec = VEHICLE_SPECS[resolvedId] ?? VEHICLE_SPECS['bmw-m4-gt3-evo'];
    if (Math.abs(this.carSetup.weightDistributionFrontPct - prevSpec.defaultFrontWeightPct) < 0.5) {
      this.carSetup.weightDistributionFrontPct = this.spec.defaultFrontWeightPct;
    }
    if (
      this.carSetup.finalDriveRatio === undefined ||
      Math.abs(this.carSetup.finalDriveRatio - prevSpec.finalDrive) < 0.02
    ) {
      this.carSetup.finalDriveRatio = this.spec.finalDrive;
    }
    this.fuelLiters = fuelFrac * this.spec.fuelMaxLiters;
    this.gear = Math.min(this.gear, this.spec.maxGear);
    this.prevGear = this.gear;
    this.rpm = clamp(this.rpm, this.spec.idleRpm, this.spec.redlineRpm);
    this.loadStoredBest();
  }

  public getCarModel(): CarModelId {
    return normalizeCarModelId(this.carId);
  }

  public setTestMode(enabled: boolean, fixedFuelLiters?: number) {
    this.testModeEnabled = enabled;
    if (enabled) {
      this.fixedTestFuelLiters =
        typeof fixedFuelLiters === 'number'
          ? clamp(fixedFuelLiters, 5, this.spec.fuelMaxLiters)
          : Number((this.spec.fuelMaxLiters * 0.55).toFixed(2));
      this.fuelLiters = this.fixedTestFuelLiters;
      this.tireLife = [1, 1, 1, 1];
      this.tireShredded = [false, false, false, false];
      this.tireDeflationFrac = [0, 0, 0, 0];
      this.fuelState = 'normal';
    } else {
      this.fixedTestFuelLiters = null;
    }
  }

  public isTestMode(): boolean {
    return this.testModeEnabled;
  }

  public setDeterministicSeed(seed: number) {
    this.prngState = seed >>> 0;
  }

  public nextDeterministicRand(): number {
    this.prngState = (this.prngState + 0x6d2b79f5) >>> 0;
    let t = Math.imul(this.prngState ^ (this.prngState >>> 15), 1 | this.prngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public setCarSetup(setup: CarSetupConfig) {
    const def = getDefaultCarSetup(this.carId);
    this.carSetup = {
      ...def,
      ...setup,
      weightDistributionFrontPct: clamp(setup.weightDistributionFrontPct, 40, 60),
      tireGripTrim: clamp(setup.tireGripTrim, 0.8, 1.2),
      springRateHz: clamp(setup.springRateHz, 1.8, 4.5),
      damperRatio: clamp(setup.damperRatio, 0.4, 1.0),
      antiRollFront: clamp(setup.antiRollFront, 1, 10),
      antiRollRear: clamp(setup.antiRollRear, 1, 10),
      rideHeightMm: clamp(setup.rideHeightMm, 45, 95),
      brakeBalance: clamp(setup.brakeBalance, -5, 5),
      downforceScale: clamp(setup.downforceScale, 0.6, 1.4),
      frontSpringNmm: clamp(setup.frontSpringNmm ?? def.frontSpringNmm!, 80, 260),
      rearSpringNmm: clamp(setup.rearSpringNmm ?? def.rearSpringNmm!, 80, 260),
      frontBumpDamp: clamp(setup.frontBumpDamp ?? def.frontBumpDamp!, 0.4, 1.4),
      frontReboundDamp: clamp(setup.frontReboundDamp ?? def.frontReboundDamp!, 0.4, 1.4),
      rearBumpDamp: clamp(setup.rearBumpDamp ?? def.rearBumpDamp!, 0.4, 1.4),
      rearReboundDamp: clamp(setup.rearReboundDamp ?? def.rearReboundDamp!, 0.4, 1.4),
      camberFrontDeg: clamp(setup.camberFrontDeg ?? def.camberFrontDeg!, -4.5, 0.0),
      camberRearDeg: clamp(setup.camberRearDeg ?? def.camberRearDeg!, -4.0, 0.0),
      toeFrontDeg: clamp(setup.toeFrontDeg ?? def.toeFrontDeg!, -0.5, 0.5),
      toeRearDeg: clamp(setup.toeRearDeg ?? def.toeRearDeg!, -0.5, 0.5),
      tirePressureFrontPsi: clamp(setup.tirePressureFrontPsi ?? def.tirePressureFrontPsi!, 21.0, 33.0),
      tirePressureRearPsi: clamp(setup.tirePressureRearPsi ?? def.tirePressureRearPsi!, 21.0, 33.0),
      diffPreloadNm: clamp(setup.diffPreloadNm ?? def.diffPreloadNm!, 20, 260),
      diffPowerLockPct: clamp(setup.diffPowerLockPct ?? def.diffPowerLockPct!, 15, 95),
      diffCoastLockPct: clamp(setup.diffCoastLockPct ?? def.diffCoastLockPct!, 10, 80),
      finalDriveRatio: clamp(setup.finalDriveRatio ?? this.spec.finalDrive, 2.8, 4.5),
      gearRatioScale: clamp(setup.gearRatioScale ?? 1.0, 0.82, 1.18),
      downforceFrontScale: clamp(setup.downforceFrontScale ?? 1.0, 0.6, 1.4),
      downforceRearScale: clamp(setup.downforceRearScale ?? 1.0, 0.6, 1.4),
      ecuBoostScale: clamp(setup.ecuBoostScale ?? 1.0, 0.85, 1.18),
      revLimitOffsetRpm: clamp(setup.revLimitOffsetRpm ?? 0, -400, 600),
      activeAeroEnabled: setup.activeAeroEnabled !== false,
      activeAeroMode: setup.activeAeroMode ?? (setup.activeAeroEnabled === false ? 'off' : 'auto'),
      equippedParts: { ...DEFAULT_EQUIPPED_PARTS, ...(setup.equippedParts ?? {}) },
    };
    this.cockpitDials.brakeBalance = this.carSetup.brakeBalance;
    this.pitStrategy.tireCompound = this.carSetup.tireCompound;
  }

  public setVisualCustomization(visual?: CarVisualCustomization) {
    this.visualCustomization = visual ? { ...visual } : undefined;
  }

  public getCarSetup(): CarSetupConfig {
    return {
      ...this.carSetup,
      equippedParts: this.carSetup.equippedParts ? { ...this.carSetup.equippedParts } : undefined,
    };
  }

  public setCockpitDials(dials: CockpitDialState) {
    this.cockpitDials = {
      brakeBalance: clamp(Math.round(dials.brakeBalance * 2) / 2, -5, 5),
      tcsLevel: clamp(Math.round(dials.tcsLevel), 0, 5),
      absLevel: clamp(Math.round(dials.absLevel), 0, 3),
      engineMap: dials.engineMap === 1 ? 1 : dials.engineMap === 3 ? 3 : 2,
      diffPreload: clamp(Math.round(dials.diffPreload), 1, 5),
    };
    this.carSetup.brakeBalance = this.cockpitDials.brakeBalance;
  }

  public getCockpitDials(): CockpitDialState {
    return { ...this.cockpitDials };
  }

  public setPitStrategy(strategy: PitStrategyPlan) {
    this.pitStrategy = {
      fuelTargetFrac: clamp(strategy.fuelTargetFrac, 0.2, 1.0),
      tireCompound: TIRE_COMPOUNDS[strategy.tireCompound] ? strategy.tireCompound : this.carSetup.tireCompound,
      wingTrim: clamp(Math.round(strategy.wingTrim), -2, 3),
    };
  }

  public getPitStrategy(): PitStrategyPlan {
    return { ...this.pitStrategy };
  }

  public getResolvedActiveAeroMode(): ActiveAeroMode {
    if (this.carSetup.activeAeroMode) return this.carSetup.activeAeroMode;
    return this.carSetup.activeAeroEnabled === false ? 'off' : 'auto';
  }

  public setAeroDeployed(deployed: boolean) {
    this.aeroDeployed = Boolean(deployed);
    this.aeroManualOverrideSec = 6.0;
  }

  public toggleActiveAero(): boolean {
    if (this.getResolvedActiveAeroMode() === 'off') {
      return false;
    }
    this.aeroDeployed = !this.aeroDeployed;
    if (this.getResolvedActiveAeroMode() === 'auto') {
      this.aeroManualOverrideSec = 3.0;
    }
    return this.aeroDeployed;
  }

  public getAeroDeployed(): boolean {
    return this.getResolvedActiveAeroMode() === 'off' ? false : this.aeroDeployed;
  }

  public setTelemetryLoggerEnabled(enabled: boolean) {
    this.csvLogger.setEnabled(enabled);
  }

  public getTelemetryCsvSampleCount(): number {
    return this.csvLogger.getSampleCount();
  }

  public exportTelemetryCsv(): string {
    return this.csvLogger.toCsvString();
  }

  public setRaceConfig(config: RaceConfig) {
    this.raceConfig = { ...config };
  }

  public getRaceConfig(): RaceConfig {
    return this.raceConfig;
  }

  public resetToGrid(withCountdown = true, config?: RaceConfig) {
    if (config) {
      this.raceConfig = { ...config };
    }
    this.refreshCircuit();
    const startT = this.circuit.closedLoop
      ? (this.startFinishT - 14 / this.circuit.totalLength + 1) % 1
      : Math.max(0.008, this.startFinishT - 14 / this.circuit.totalLength);
    const sample = this.circuit.sampleAtT(startT);
    this.pos.copy(sample.position);
    if (this.raceConfig.mode === 'sprint') {
      this.pos.addScaledVector(sample.right, 2.2);
    }
    this.vy = 0;
    this.yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    this.vx = 0;
    this.vz = 0;
    this.omega = 0;
    this.fixedAccumSec = 0;
    this.gear = 1;
    this.prevGear = 1;
    this.rpm = this.spec.idleRpm;
    this.turboBoost = 0.2;
    this.clutchEngage = 1.0;
    this.revMatchBlipTimer = 0;
    this.shiftTimer = 0;
    this.throttleSmooth = 0;
    this.brakeSmooth = 0;
    this.steerCmdSmooth = 0;
    this.steerRampDeg = 0;
    this.lastGovCapDeg = 0;
    this.lastCstAssistDeg = 0;
    this.lastSlipBodyDeg = 0;
    this.steerAngle = 0;
    this.steerAngleFL = 0;
    this.steerAngleFR = 0;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.bodyHeave = 0;
    this.pitchVel = 0;
    this.rollVel = 0;
    this.heaveVel = 0;
    this.latG = 0;
    this.lonG = 0;
    this.wheelOmega = [0, 0, 0, 0];
    this.wheelSpins = [0, 0, 0, 0];
    this.wheelSuspOffsets = [0, 0, 0, 0];
    this.kappaLag = [0, 0, 0, 0];
    this.alphaLag = [0, 0, 0, 0];
    this.alphaDegOut = [0, 0, 0, 0];
    this.wheelCompM = [0.055, 0.055, 0.055, 0.055];
    this.wheelVelMps = [0, 0, 0, 0];
    this.wheelTravelMm = [0, 0, 0, 0];
    this.wheelGrounded = [true, true, true, true];
    const staticCornerN = (this.spec.massKg + this.spec.fuelMaxLiters * 0.74) * 9.81 * 0.25;
    this.wheelNormalFz = [staticCornerN, staticCornerN, staticCornerN, staticCornerN];
    this.brakeTempsC = [140, 140, 130, 130];
    this.brakeFaded = [false, false, false, false];
    this.lsdLockPct = 0;
    this.downforceKgf = 0;
    this.ffbTorqueNorm = 0;
    this.lastEscTorqueNm = 0;
    this.tireGripLossPct = [0, 0, 0, 0];
    this.tireSlips = [0, 0, 0, 0];
    this.tireLife = [1, 1, 1, 1];
    this.tirePressuresPsi = [27.5, 27.5, 27.0, 27.0];
    this.tireShredded = [false, false, false, false];
    this.tirePunctureAgeSec = [0, 0, 0, 0];
    this.tireDeflationFrac = [0, 0, 0, 0];
    this.fuelLiters = this.spec.fuelMaxLiters;
    this.fuelUsedThisLap = 0;
    this.prevLapFuelUsed = 0;
    this.fuelState = 'normal';
    this.starvationCutClock = 0;
    this.engineCranking = false;
    this.powerSteeringLost = false;
    this.oilTempC = 84.0;
    this.waterTempC = 80.5;
    this.bottomingEventsCount = 0;
    if (this.testModeEnabled) {
      this.fuelLiters = this.fixedTestFuelLiters ?? Number((this.spec.fuelMaxLiters * 0.55).toFixed(2));
    }
    this.speedTrapKmh = null;
    this.speedTrapBannerTimer = 0;
    this.speedTrapRecordKmh = 0;
    this.prevTrackTForTrap = startT;
    this.inDriftClippingZone = false;
    this.dirtLevel = 0;
    this.rubberInProgress = 0.08;
    this.pitServiceTimer = 0;
    this.pitServiceDurationSec = 2.2;
    this.pitCompleteBannerTimer = 0;
    this.pitCompletePulse = 0;
    this.hazardImpactTimer = 0;
    this.yellowHoldTimer = 0;
    this.hazardTrackT = null;
    this.hazardReason = '';
    const cdMode = this.raceConfig.startCountdownMode ?? 'full';
    this.countdownTimer = !withCountdown
      ? 0
      : cdMode === 'instant'
        ? 0
        : cdMode === 'quick'
          ? 1.2
          : 3.2;
    this.totalRaceTimeMs = 0;
    this.lap = 1;
    this.lapTimeMs = 0;
    this.sectorStartMs = 0;
    this.sectorTimesMs = [null, null, null];
    this.bestSectorTimesMs = [null, null, null];
    this.sectorRecordPulse = 0;
    this.cleanLap = true;
    this.crossedStartOnce = false;
    this.raceFinished = false;
    this.playerFinishTimeMs = null;
    this.finishSummary = null;
    this.driftPoints = 0;
    this.driftActivePoints = 0;
    this.driftCombo = 1;
    this.driftChainSec = 0;
    this.driftHoldGrace = 0;
    this.driftAngleDeg = 0;
    this.tofuIntegrityPct = 100;
    this.tofuCupTiltX = 0;
    this.tofuCupTiltZ = 0;
    this.tofuCupVelX = 0;
    this.tofuCupVelZ = 0;
    this.tofuSpilling = false;
    this.tofuFailed = false;
    this.tofuFailureReason = '';
    this.tofuGrade = null;
    this.prevLatG = 0;
    this.ghostDeltaSec = null;
    this.ghostGapMeters = null;
    this.tandemPartnerUsername = null;
    this.tandemRole = null;
    this.tandemMultiplier = 1;
    this.tandemBonusPoints = 0;
    this.currentBuckets.fill(-1);
    this.lastProgress = this.circuit.closedLoop ? 0.99 : 0;
    this.currentTrackT = startT;
    this.aeroDeployed = true;
    this.lastSlopeGradePct = 0;
    this.lastAudioSurface = 'asphalt';
    this.pendingSparkEvents.length = 0;
    this.pendingRivalImpacts.length = 0;
    this.collisionVerticalDampTimer = 0;
    this.prevChassisAvgGroundY = this.pos.y;
    this.lastTelemetryCache = null;
    this.csvLogger.clear();
    this.syncOrientationFromTrack(sample.up, 1.0);
  }

  public resetToNearestTrack() {
    const q = this.circuit.queryNearestInto(this.pos.x, this.pos.z, this.surfQScratch, this.pos.y);
    this.pos.copy(q.centerPos);
    this.vy = 0;
    this.collisionVerticalDampTimer = 0;
    this.prevChassisAvgGroundY = this.pos.y;
    this.pendingRivalImpacts.length = 0;
    this.yaw = Math.atan2(q.tangent.x, q.tangent.z);
    this.vx = 0;
    this.vz = 0;
    this.omega = 0;
    this.fixedAccumSec = 0;
    this.gear = 1;
    this.prevGear = 1;
    this.rpm = this.fuelState === 'stalled' ? 0 : this.spec.idleRpm;
    this.clutchEngage = 1.0;
    this.revMatchBlipTimer = 0;
    this.wheelOmega = [0, 0, 0, 0];
    this.kappaLag = [0, 0, 0, 0];
    this.alphaLag = [0, 0, 0, 0];
    this.wheelCompM = [0.055, 0.055, 0.055, 0.055];
    this.wheelVelMps = [0, 0, 0, 0];
    this.wheelGrounded = [true, true, true, true];
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.bodyHeave = 0;
    this.pitchVel = 0;
    this.rollVel = 0;
    this.heaveVel = 0;
    this.steerRampDeg = 0;
    this.steerAngle = 0;
    this.steerAngleFL = 0;
    this.steerAngleFR = 0;
    this.lastGovCapDeg = 0;
    this.lastCstAssistDeg = 0;
    this.lastSlipBodyDeg = 0;
    this.cleanLap = false;
    this.hazardImpactTimer = 0;
    this.yellowHoldTimer = 0;
    this.hazardTrackT = null;
    this.hazardReason = '';
    this.syncOrientationFromTrack(q.up, 1.0);
  }

  private onGearTransition(oldGear: number, newGear: number, isDownshift: boolean) {
    if (oldGear === newGear) return;
    // Regression 2.6: Zero forward <-> reverse pedal & slip channels cleanly on gear reversal
    if ((oldGear < 0 && newGear > 0) || (oldGear > 0 && newGear < 0)) {
      this.throttleSmooth = 0;
      this.brakeSmooth = 0;
      this.kappaLag.fill(0);
    }
    this.shiftTimer = 0.055;
    this.clutchEngage = 0.30;
    if (isDownshift && newGear >= 1 && this.fuelState !== 'stalled') {
      // Automatic rev-match throttle blip on sequential downshift
      this.revMatchBlipTimer = 0.14;
      const effSpec = computeEffectiveSpecs(this.spec, this.carSetup, this.visualCustomization);
      const effWheelRadius = this.spec.wheelRadius * (1 + (effSpec.wheelDiameterIn - 19) * 0.015);
      const rawRatio = Math.abs(this.spec.gearRatios[newGear + 1] ?? 1);
      const ratio = newGear > 1 ? rawRatio * effSpec.gearRatioScale : rawRatio;
      const speedMps = Math.hypot(this.vx, this.vz);
      const targetMatchRpm = clamp(
        (speedMps / effWheelRadius) * ratio * effSpec.finalDrive * (60 / (Math.PI * 2)) * 1.04,
        this.spec.idleRpm,
        effSpec.redlineRpm * 0.96,
      );
      if (targetMatchRpm > this.rpm) {
        this.rpm = lerp(this.rpm, targetMatchRpm, 0.65);
      }
    }
    this.prevGear = newGear;
  }

  public shiftUp(assists: VehicleAssists) {
    if (assists.autoGear) return;
    if (this.gear < this.spec.maxGear) {
      const prev = this.gear;
      this.gear += 1;
      if (this.gear === 0) this.gear = 1;
      this.onGearTransition(prev, this.gear, false);
      this.gearShiftPulse = 1.0;
    }
  }

  public shiftDown(assists: VehicleAssists) {
    if (assists.autoGear) return;
    if (this.gear > -1) {
      const prev = this.gear;
      const next = this.gear - 1;
      if (next === 0 && Math.hypot(this.vx, this.vz) > 4) {
        return;
      }
      this.gear = next;
      this.onGearTransition(prev, this.gear, true);
      this.gearShiftPulse = 0.85;
    }
  }

  private syncOrientationFromTrack(trackUp: THREE.Vector3, blendAlpha: number) {
    _surfNormal.lerp(trackUp, blendAlpha).normalize();
    _carFwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const fwdDotN = _carFwd.dot(_surfNormal);
    _carFwd.addScaledVector(_surfNormal, -fwdDotN).normalize();

    _carLeft.crossVectors(_surfNormal, _carFwd).normalize();
    _carUp.crossVectors(_carFwd, _carLeft).normalize();

    this.forwardDir.copy(_carFwd);
    this.rightDir.copy(_carLeft).negate();
    this.upDir.copy(_carUp);

    _basisMat.makeBasis(_carLeft, _carUp, _carFwd);
    this.worldQuaternion.setFromRotationMatrix(_basisMat);
  }

  private querySurface(x: number, z: number, scratch = this.surfQScratch): PhysicsSurfaceSample {
    if (this.envAdapter?.querySurfaceAt) {
      return this.envAdapter.querySurfaceAt(x, z);
    }
    return this.circuit.queryNearestInto(x, z, scratch, this.pos.y);
  }

  private sampleGroundHeight(
    x: number,
    yRef: number,
    z: number,
    q: PhysicsSurfaceSample,
    roadHalf: number,
  ): number {
    if (this.envAdapter?.groundHeightAt) {
      return this.envAdapter.groundHeightAt(x, yRef, z, q);
    }
    const pitAfterB = this.circuit.pitLaneBounds;
    const inPitAfter = isPointInPitBounds(pitAfterB, x, yRef, z, -5.0, -0.5);
    const nq = q as { sample?: { isTunnel?: boolean }; nextSample?: { isTunnel?: boolean } };
    const inTunnelCorridor = Boolean(nq.sample?.isTunnel || nq.nextSample?.isTunnel);
    let baseY: number;
    if (q.isBridge || (inTunnelCorridor && q.absDistance < roadHalf + SHOULDER_WIDTH + 3.5)) {
      baseY = q.centerPos.y + q.right.y * clamp(q.signedLateral, -roadHalf - 2.6, roadHalf + 2.6);
    } else if (inPitAfter) {
      baseY = pitAfterB.y;
    } else {
      const onRoadBlend = 1 - clamp((q.absDistance - (roadHalf + SHOULDER_WIDTH)) / 3.0, 0, 1);
      const trackElev =
        q.centerPos.y + q.right.y * clamp(q.signedLateral, -roadHalf - 2.5, roadHalf + 2.5);
      const terrainElev = groundHeightAt(x, z);
      baseY = lerp(terrainElev, trackElev, onRoadBlend);
    }
    return sampleActiveRampSurface(x, z, baseY);
  }

  private sampleGroundNormal(x: number, z: number): THREE.Vector3 {
    if (this.envAdapter?.groundNormalAt) {
      return this.envAdapter.groundNormalAt(x, z);
    }
    return groundNormalAtInto(x, z, 1.2, this.groundNormScratch);
  }

  public step(
    deltaSec: number,
    input: VehicleControlsInput,
    assists: VehicleAssists,
    weather: WeatherPreset,
    rivalsInput?: Array<{
      id: string;
      name: string;
      carName?: string;
      color: string;
      x: number;
      z: number;
      vx: number;
      vz: number;
      trackT: number;
      totalProgress: number;
      lap?: number;
      finished?: boolean;
      finishTimeMs?: number | null;
    }>,
    snowPreset: SnowAtmospherePreset | null = null,
    continuousWeather?: {
      wetness: number;
      roadFrictionScale: number;
      offroadFrictionScale: number;
    },
    roadSnowAccum = 0,
  ): VehicleTelemetry {
    const cpuStartMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dtFrame = clamp(deltaSec, 0.0, 0.1);
    this.pendingSparkEvents.length = 0;
    this.pendingRivalImpacts.length = 0;

    // Frame-rate-independent fixed accumulator (120 Hz chassis x 8 substeps = 960 Hz tire/susp/thermal)
    this.fixedAccumSec += dtFrame;
    const chassisSteps = Math.min(12, Math.floor((this.fixedAccumSec + 1e-9) / CHASSIS_DT));
    this.fixedAccumSec = Math.max(0, this.fixedAccumSec - chassisSteps * CHASSIS_DT);
    const dtExecuted = chassisSteps * CHASSIS_DT;
    const dtPulse = chassisSteps > 0 ? dtExecuted : dtFrame;

    // Decay instantaneous visual/audio pulses
    this.wallImpactImpulse = Math.max(0, this.wallImpactImpulse - dtPulse * 5.0);
    this.wallScrapeIntensity = Math.max(0, this.wallScrapeIntensity - dtPulse * 7.5);
    this.turboBlowOffPulse = Math.max(0, this.turboBlowOffPulse - dtPulse * 4.0);
    this.gearShiftPulse = Math.max(0, this.gearShiftPulse - dtPulse * 6.5);
    this.pitCompletePulse = Math.max(0, this.pitCompletePulse - dtPulse * 1.4);
    this.pitCompleteBannerTimer = Math.max(0, this.pitCompleteBannerTimer - dtPulse);
    this.hazardImpactTimer = Math.max(0, this.hazardImpactTimer - dtPulse);
    if (this.speedTrapBannerTimer > 0) {
      this.speedTrapBannerTimer = Math.max(0, this.speedTrapBannerTimer - dtPulse);
      if (this.speedTrapBannerTimer === 0) {
        this.speedTrapKmh = null;
      }
    }

    // Frame-rate-independent input snapshot polled once per render frame, consumed inside fixed steps
    const rawThrottleIn =
      typeof input.throttleVal === 'number' ? clamp(input.throttleVal, 0, 1) : input.throttle ? 1 : 0;
    const rawBrakeIn =
      typeof input.brakeVal === 'number' ? clamp(input.brakeVal, 0, 1) : input.brake ? 1 : 0;
    const rawSteerIn =
      typeof input.steerAxis === 'number'
        ? clamp(input.steerAxis, -1, 1)
        : (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
    const rawHandbrakeIn =
      input.handbrake || (typeof input.handbrakeVal === 'number' && input.handbrakeVal > 0.45);

    const physicsPreset: PhysicsPreset = assists.physicsPreset === 'simcade' ? 'simcade' : 'simulation';
    this.lastPhysicsPreset = physicsPreset;
    const isSimCade = physicsPreset === 'simcade';

    const wetnessRatio = this.testModeEnabled
      ? 0.0
      : continuousWeather
        ? clamp(continuousWeather.wetness, 0, 1)
        : weather === 'rain'
          ? 1.0
          : 0.0;
    const weatherMuScale = this.testModeEnabled
      ? 1.0
      : continuousWeather
        ? continuousWeather.roadFrictionScale
        : weather === 'rain'
          ? 0.72
          : weather === 'overcast'
            ? 0.94
            : 1.0;
    const offroadWeatherScale = this.testModeEnabled
      ? 1.0
      : continuousWeather
        ? continuousWeather.offroadFrictionScale
        : weather === 'rain'
          ? 0.78
          : 1.0;
    const customGripScale = this.envAdapter?.gripScale ?? this.circuit.gripScale;
    const totalTrackLen = this.envAdapter?.totalLength ?? this.circuit.totalLength;
    const roadHalf = this.envAdapter?.roadHalfWidth ?? this.circuit.roadHalfWidth;
    const kerbHeightScale = this.envAdapter?.kerbHeightScale ?? this.circuit.kerbHeightScale;

    // Extract Setup, Effective Parts Specs, Cockpit Dials & Stint Economics
    const spec = this.spec;
    const setup = this.carSetup;
    const eff = computeEffectiveSpecs(spec, setup, this.visualCustomization);
    const dials = this.cockpitDials;
    const compound = TIRE_COMPOUNDS[setup.tireCompound] ?? TIRE_COMPOUNDS.racing_hard;
    const stintEcon = resolveStintEconomics(this.raceConfig, spec.fuelMaxLiters, spec.id);

    const effWheelRadius = spec.wheelRadius * (1 + (eff.wheelDiameterIn - 19) * 0.015);
    const setupGripMult = compound.gripMult * setup.tireGripTrim * spec.mechGripBoost * eff.wheelWidthGripMult * (isSimCade ? 1.05 : 1.0);
    const staticFrontFrac = clamp(setup.weightDistributionFrontPct / 100, 0.40, 0.60);
    const staticRearFrac = 1.0 - staticFrontFrac;
    const effTrackWidth = spec.trackWidth + eff.trackWidthDeltaM;
    const halfTrack = effTrackWidth * 0.5;
    const cgHeight = 0.285 + ((setup.rideHeightMm - 45) / 50) * 0.11;

    // Regression 2.8: Derive local CoM strictly relative to wheel anchor average (invariant to mesh pivot shift)
    const anchorShiftX = this.envAdapter?.wheelAnchorOriginShiftX ?? 0;
    const anchorShiftZ = this.envAdapter?.wheelAnchorOriginShiftZ ?? 0;
    const defaultLf = spec.wheelbase * staticRearFrac;
    const defaultLr = spec.wheelbase * staticFrontFrac;
    const rawWheelX = this.scratchRawWheelX;
    rawWheelX[0] = anchorShiftX + halfTrack;
    rawWheelX[1] = anchorShiftX - halfTrack;
    rawWheelX[2] = anchorShiftX + halfTrack;
    rawWheelX[3] = anchorShiftX - halfTrack;
    const rawWheelZ = this.scratchRawWheelZ;
    rawWheelZ[0] = anchorShiftZ + defaultLf;
    rawWheelZ[1] = anchorShiftZ + defaultLf;
    rawWheelZ[2] = anchorShiftZ - defaultLr;
    rawWheelZ[3] = anchorShiftZ - defaultLr;
    const meanFrontZ = (rawWheelZ[0] + rawWheelZ[1]) * 0.5;
    const meanRearZ = (rawWheelZ[2] + rawWheelZ[3]) * 0.5;
    const effectiveWheelbase = Math.max(1.2, meanFrontZ - meanRearZ);
    const comZ = meanRearZ + staticFrontFrac * effectiveWheelbase;
    const comX = (rawWheelX[0] + rawWheelX[1] + rawWheelX[2] + rawWheelX[3]) * 0.25;
    const wheelCoordsX = this.scratchWheelCoordsX;
    const wheelCoordsZ = this.scratchWheelCoordsZ;
    for (let i = 0; i < 4; i++) {
      wheelCoordsX[i] = rawWheelX[i] - comX;
      wheelCoordsZ[i] = rawWheelZ[i] - comZ;
    }
    const lf = Math.max(0.4, (wheelCoordsZ[0] + wheelCoordsZ[1]) * 0.5);
    const lr = Math.max(0.4, -(wheelCoordsZ[2] + wheelCoordsZ[3]) * 0.5);

    // Static Rollover Margin Check (SSF = halfTrack / cgHeight vs peak lateral grip mu)
    const ssf = halfTrack / Math.max(0.15, cgHeight);
    const nominalPeakMu = 1.33 * weatherMuScale * customGripScale * setupGripMult;
    const rolloverRiskRatio = (nominalPeakMu * cgHeight) / Math.max(0.3, halfTrack);
    this.rolloverSsf = ssf;
    this.rolloverRiskRatio = rolloverRiskRatio;
    this.rolloverWarning = rolloverRiskRatio >= 0.92;
    if (this.rolloverWarning) {
      const warnKey = `${this.carId}:${setup.rideHeightMm}:${setup.tireCompound}`;
      if (this.rolloverWarnedKey !== warnKey) {
        this.rolloverWarnedKey = warnKey;
        console.warn(
          `[VehiclePhysics] Static rollover margin exceeded (risk ratio=${rolloverRiskRatio.toFixed(2)}, SSF=${ssf.toFixed(2)}, CG=${cgHeight.toFixed(3)}m). Lower ride height or widen track.`,
        );
      }
    }

    // Aerodynamics: split F/R downforce + wing trim (-2..+3) + Active Aero deploy/retract + Ride height ground effect
    const aeroMode = this.getResolvedActiveAeroMode();
    const activeAeroEnabled = aeroMode !== 'off';
    const isAeroDeployed = activeAeroEnabled && this.aeroDeployed;
    const activeAeroDfScale = activeAeroEnabled ? (isAeroDeployed ? 1.18 : 0.68) : 1.0;
    const activeAeroDragScale = activeAeroEnabled ? (isAeroDeployed ? 1.06 : 0.78) : 1.0;
    const wingAeroMod = (1.0 + this.pitStrategy.wingTrim * 0.045) * activeAeroDfScale;
    const groundEffectBonus = lerp(1.11, 0.92, (setup.rideHeightMm - 45) / 50);
    const downforceFrontMult = eff.downforceFrontMult * wingAeroMod * groundEffectBonus;
    const downforceRearMult = eff.downforceRearMult * wingAeroMod * groundEffectBonus;
    const downforceMult = (downforceFrontMult + downforceRearMult) * 0.5;
    const airDensity = clamp(1.225 * Math.exp(-Math.max(0, this.pos.y) * 0.000118), 1.05, 1.24);

    // Per-axle Dual-Rate Spring, Tire Vertical Spring & Asymmetric Bump/Rebound Dampers
    const hzFactor = Math.pow(setup.springRateHz / 3.2, 1.35);
    const frontSpringFactor = hzFactor * ((setup.frontSpringNmm ?? 140) / 140) * eff.springStiffMult;
    const rearSpringFactor = hzFactor * ((setup.rearSpringNmm ?? 145) / 145) * eff.springStiffMult;
    const springStiffFactor = (frontSpringFactor + rearSpringFactor) * 0.5;
    const frontCornerK = 52000 * frontSpringFactor;
    const rearCornerK = 52000 * rearSpringFactor;
    const tireVerticalK = 240000;
    const frontKEff = (frontCornerK * tireVerticalK) / (frontCornerK + tireVerticalK);
    const rearKEff = (rearCornerK * tireVerticalK) / (rearCornerK + tireVerticalK);
    const kEff = (frontKEff + rearKEff) * 0.5;
    const damperRatioNorm = setup.damperRatio / 0.72;
    const frontBumpDamp =
      3900 * damperRatioNorm * (setup.frontBumpDamp ?? 0.72) * Math.sqrt(frontSpringFactor) * eff.dampingMult;
    const frontReboundDamp =
      3900 * damperRatioNorm * (setup.frontReboundDamp ?? 0.76) * 1.48 * Math.sqrt(frontSpringFactor) * eff.dampingMult;
    const rearBumpDamp =
      3900 * damperRatioNorm * (setup.rearBumpDamp ?? 0.72) * Math.sqrt(rearSpringFactor) * eff.dampingMult;
    const rearReboundDamp =
      3900 * damperRatioNorm * (setup.rearReboundDamp ?? 0.76) * 1.48 * Math.sqrt(rearSpringFactor) * eff.dampingMult;
    const arbAvg = (setup.antiRollFront + setup.antiRollRear) * 0.5;
    const arbBalanceShift = (setup.antiRollRear - setup.antiRollFront) * 0.020;

    // Alignment & Tire Cold Pressure Targets
    const camberFrontDeg = setup.camberFrontDeg ?? -2.4;
    const camberRearDeg = setup.camberRearDeg ?? -1.8;
    const toeFrontRad = ((setup.toeFrontDeg ?? -0.08) * Math.PI) / 180;
    const toeRearRad = ((setup.toeRearDeg ?? 0.16) * Math.PI) / 180;
    const coldPsiFront = setup.tirePressureFrontPsi ?? 27.5;
    const coldPsiRear = setup.tirePressureRearPsi ?? 27.0;

    // Cockpit dial + setup diff/engine parameters
    const brakeFrontSplit = clamp(0.575 + dials.brakeBalance * 0.018, 0.46, 0.68);
    const brakeRearSplit = 1.0 - brakeFrontSplit;
    const effectiveTcsLevel = assists.tcs ? dials.tcsLevel : 0;
    const effectiveAbsLevel = assists.abs ? dials.absLevel : 0;
    const mapPowerScale = dials.engineMap === 1 ? 0.88 : dials.engineMap === 3 ? 1.04 : 1.0;
    const mapFuelScale = dials.engineMap === 1 ? 0.83 : dials.engineMap === 3 ? 1.16 : 1.0;
    const dialDiffScale = 0.7 + dials.diffPreload * 0.12;
    const diffPreloadNm = (setup.diffPreloadNm ?? 140) * dialDiffScale;
    const diffRampPower = ((setup.diffPowerLockPct ?? 50) / 100) * 0.92;
    const diffRampCoast = ((setup.diffCoastLockPct ?? 30) / 100) * 0.85;

    let lastAx = this.lonG;
    let lastAy = this.latG;
    let absFlag = this.lastAbsFlag;
    let tcsFlag = this.lastTcsFlag;
    let avgGripPct = this.lastAvgGripPct;
    let lastVLong = this.lastVLongOut;
    let lastVLat = this.lastVLatOut;
    let inPitLaneNow = this.lastInPitLane;
    let inPitBoxNow = this.lastInPitBox;
    let sparkAccumulator = 0;
    let lastDownforceN = this.downforceKgf * 9.81;
    let lastFfbTorque = this.ffbTorqueNorm;

    const wheelInertia = 1.38 * eff.wheelInertiaMult;
    const dtC = CHASSIS_DT;
    const dtT = dtC / TIRE_SUBSTEPS;
    const rearSteerEnabled = Boolean(spec.rearSteerEnabled);
    const steerableMask = this.scratchSteerableMask;
    steerableMask[0] = true;
    steerableMask[1] = true;
    steerableMask[2] = rearSteerEnabled;
    steerableMask[3] = rearSteerEnabled;

    if (chassisSteps > 0) {
      absFlag = false;
      tcsFlag = false;
    }

    for (let cStep = 0; cStep < chassisSteps; cStep++) {
      if (this.countdownTimer > 0) {
        this.countdownTimer = Math.max(0, this.countdownTimer - dtC);
      }
      if (this.collisionVerticalDampTimer > 0) {
        this.collisionVerticalDampTimer = Math.max(0, this.collisionVerticalDampTimer - dtC);
      }
      const raceLive = this.countdownTimer <= 0.15 && !this.raceFinished;
      const handbrakeActive = raceLive && rawHandbrakeIn;

      const targetThrottle = raceLive ? rawThrottleIn : 0;
      const targetBrake = raceLive ? rawBrakeIn : this.raceFinished ? 0.65 : 0;

      this.prevThrottleSmooth = this.throttleSmooth;
      const throttleRate = targetThrottle > this.throttleSmooth ? 11.5 : 15.0;
      this.throttleSmooth = lerp(this.throttleSmooth, targetThrottle, 1 - Math.exp(-throttleRate * dtC));
      this.brakeSmooth = lerp(this.brakeSmooth, targetBrake, 1 - Math.exp(-15.5 * dtC));

      const powerSteeringLost = this.fuelState === 'stalled';
      this.powerSteeringLost = powerSteeringLost;
      this.steerCmdSmooth = rawSteerIn;

      const hasTurboEngine =
        !spec.naturallyAspirated || isEngineSwapForcedInduction(this.carSetup.equippedParts?.engine_swap);
      if (hasTurboEngine && this.prevThrottleSmooth > 0.65 && this.throttleSmooth < 0.25 && this.rpm > 4500 && !powerSteeringLost) {
        this.turboBlowOffPulse = clamp((this.rpm - 4200) / 4500, 0.3, 1.0);
      }

      const q = this.querySurface(this.pos.x, this.pos.z);
      this.currentTrackT = q.t;

      if (this.envAdapter?.skipCollisions) {
        inPitLaneNow = false;
        inPitBoxNow = false;
      } else {
        const pitB = this.circuit.pitLaneBounds;
        const boxB = this.circuit.pitBoxBounds;
        inPitLaneNow = isPointInPitBounds(pitB, this.pos.x, this.pos.y, this.pos.z);
        inPitBoxNow = isPointInPitBounds(boxB, this.pos.x, this.pos.y, this.pos.z);
      }

      // Surface classification & base friction
      const isFrostpeak = !this.envAdapter && this.circuit.mapId === 'frostpeak_pass';
      const isWinterStorm = isFrostpeak && snowPreset === 'twilight_storm';
      const absLat = Math.abs(q.signedLateral);
      let surfaceMu =
        (isFrostpeak ? (isWinterStorm ? 1.22 : 1.28) : 1.44) *
        weatherMuScale *
        customGripScale *
        setupGripMult;
      let rollingCoeff = isFrostpeak ? 0.015 : 0.013;

      let paintedMatAudio: 'asphalt' | 'curb' | 'gravel' | 'snow' | null = null;
      if (q.isBridge) {
        this.currentSurface = 'bridge';
        surfaceMu =
          (isFrostpeak ? (isWinterStorm ? 1.18 : 1.24) : 1.38) *
          weatherMuScale *
          customGripScale *
          setupGripMult;
      } else if (inPitLaneNow || absLat <= roadHalf - 0.35) {
        this.currentSurface = 'tarmac';
        if (inPitLaneNow) {
          surfaceMu =
            (isFrostpeak ? 1.24 : 1.34) * weatherMuScale * customGripScale * setupGripMult;
        }
      } else if (absLat <= roadHalf + 0.95) {
        this.currentSurface = 'kerb';
        surfaceMu =
          (isFrostpeak ? (isWinterStorm ? 0.68 : 0.74) : 1.20) *
          weatherMuScale *
          customGripScale *
          setupGripMult;
        rollingCoeff = isFrostpeak ? 0.025 : 0.021;
      } else {
        this.currentSurface = 'offroad';
        const paintedMatId = sampleActiveTerrainMaterial(this.pos.x, this.pos.z);
        if (paintedMatId) {
          const matDef = TERRAIN_MATERIAL_MAP[paintedMatId];
          surfaceMu =
            matDef.gripMu *
            offroadWeatherScale *
            customGripScale *
            Math.sqrt(setupGripMult);
          rollingCoeff = matDef.rollingCoeff;
          paintedMatAudio = matDef.audioSurface;
        } else {
          surfaceMu =
            (isFrostpeak ? (isWinterStorm ? 0.46 : 0.52) : 0.68) *
            offroadWeatherScale *
            customGripScale *
            Math.sqrt(setupGripMult);
          rollingCoeff = isFrostpeak ? 0.068 : 0.048;
        }
      }

      const activeCustomBp = getActiveBlueprintEffects();
      if (
        activeCustomBp?.waterEnabled &&
        this.pos.y < (activeCustomBp.waterLevel ?? 17.5) - 0.35
      ) {
        const submersion = clamp(((activeCustomBp.waterLevel ?? 17.5) - this.pos.y) / 1.8, 0.15, 1.0);
        surfaceMu *= 1.0 - submersion * 0.42;
        rollingCoeff += submersion * 0.18;
      }

      if (isFrostpeak && roadSnowAccum > 0.01 && !this.testModeEnabled) {
        const accum = clamp(roadSnowAccum, 0, 1);
        if (this.currentSurface === 'tarmac') {
          const offLineFactor = clamp((absLat - 2.2) / 3.8, 0, 1);
          surfaceMu *= 1.0 - offLineFactor * accum * 0.18;
          rollingCoeff += offLineFactor * accum * 0.008;
        } else if (this.currentSurface === 'kerb' || this.currentSurface === 'offroad') {
          surfaceMu *= 1.0 - accum * 0.14;
          rollingCoeff += accum * 0.012;
        }
      }

      // Surface classification for real-time acoustic tire/engine filtering
      const offLineForSnow = isFrostpeak && roadSnowAccum > 0.25 && absLat > roadHalf * 0.62;
      this.lastAudioSurface =
        paintedMatAudio !== null
          ? paintedMatAudio
          : this.currentSurface === 'kerb'
            ? 'curb'
            : this.currentSurface === 'offroad'
              ? isFrostpeak
                ? 'snow'
                : 'gravel'
              : offLineForSnow
                ? 'snow'
                : 'asphalt';

      // Local chassis frame velocity
      const fwdX = Math.sin(this.yaw);
      const fwdZ = Math.cos(this.yaw);
      const leftX = Math.cos(this.yaw);
      const leftZ = -Math.sin(this.yaw);

      const dotFwdTan = fwdX * q.tangent.x + fwdZ * q.tangent.z;
      const dotFwdRight = fwdX * q.right.x + fwdZ * q.right.z;
      const dotLeftTan = leftX * q.tangent.x + leftZ * q.tangent.z;
      const dotLeftRight = leftX * q.right.x + leftZ * q.right.z;
      const slopeFwdY = q.tangent.y * dotFwdTan + q.right.y * dotFwdRight;
      const bankLatY = q.tangent.y * dotLeftTan + q.right.y * dotLeftRight;
      this.lastSlopeGradePct = Number((slopeFwdY * 100).toFixed(1));

      const vLong = this.vx * fwdX + this.vz * fwdZ;
      const vLat = this.vx * leftX + this.vz * leftZ;
      lastVLong = vLong;
      lastVLat = vLat;
      const speed = Math.hypot(vLong, vLat);

      // Update slow-puncture deflation progress over 25s when shredded
      for (let i = 0; i < 4; i++) {
        if (this.tireLife[i] <= 0.001 && !this.tireShredded[i]) {
          this.tireShredded[i] = true;
        }
        if (this.tireShredded[i] && raceLive) {
          this.tirePunctureAgeSec[i] += dtC;
          this.tireDeflationFrac[i] = clamp(this.tirePunctureAgeSec[i] / 25.0, 0, 1);
        }
      }

      // Per-corner friction & shifted slip peak for heavily worn tires (80-100% wear)
      const cornerMu = this.scratchCornerMu;
      const cornerPeakShift = this.scratchCornerPeakShift;
      let muSum = 0;
      for (let i = 0; i < 4; i++) {
        const life = this.tireLife[i];
        const lifeMu = tireGripFromLife(life, this.tireShredded[i]);
        cornerPeakShift[i] = life < 0.20 ? lerp(0, 0.48, (0.20 - life) / 0.20) : 0;
        const optPsi = 28.0;
        const psiDelta = Math.abs(this.tirePressuresPsi[i] - optPsi);
        const psiPenalty = this.tireShredded[i]
          ? lerp(0.14, 0.30, this.tireDeflationFrac[i])
          : clamp((psiDelta - 1.2) * 0.018, 0, 0.10);
        const psiMu = 1.0 - psiPenalty;

        const treadDepthFactor = lerp(0.38, 1.0, clamp(life, 0, 1));
        const aquaStartMps = 42.0 * treadDepthFactor;
        const aquaplane =
          wetnessRatio > 0.35 && speed > aquaStartMps && this.currentSurface !== 'offroad'
            ? clamp(((speed - aquaStartMps) / 38.0) * wetnessRatio * (1.2 - treadDepthFactor * 0.5), 0, 0.42)
            : 0;

        const composite = clamp(lifeMu * psiMu * (1.0 - aquaplane), 0.30, 1.08);
        this.tireGripLossPct[i] = Math.round(clamp((1.0 - composite) * 100, 0, 72));
        const axArbMod = i < 2 ? 1.0 + arbBalanceShift : 1.0 - arbBalanceShift;
        const hillAssistOn = assists.hillClimbAssist !== false;
        const slopeRaw = clamp((slopeFwdY - 0.03) / 0.11, 0, 1);
        const slopeSmooth = slopeRaw * slopeRaw * (3 - 2 * slopeRaw);
        const climbMuBoost =
          hillAssistOn && raceLive && slopeSmooth > 0 && rawThrottleIn > 0.08
            ? 1.0 + slopeSmooth * (spec.frontDriveFrac < 0.1 ? 0.24 : 0.17)
            : 1.0;
        cornerMu[i] = surfaceMu * composite * axArbMod * climbMuBoost;
        muSum += cornerMu[i];
      }
      avgGripPct = Math.round(((muSum * 0.25) / (1.44 * customGripScale)) * 100);

      // 4-Layer GT Sport Steering & Anti-Spin Assist Pipeline (strictly in input/assist layer)
      // Resolve Layer 3 & Layer 4 flags (explicit override wins, otherwise preset macro default)
      const govEnabled = assists.steeringGovernor ?? isSimCade;
      const cstEnabled = assists.countersteerAssist ?? isSimCade;

      // Layer 2 Speed Cap reference angle: maxAngle(v) = lerp(34° + steeringLockBonus, 10°, clamp(v / 45, 0, 1))
      const lockBonusDeg = (eff.steeringLockBonusRad * 180) / Math.PI;
      const maxAngleDeg = lerp(34.0 + lockBonusDeg, 10.0 + lockBonusDeg * 0.25, clamp(speed / 45.0, 0, 1));
      const steerAuthorityMult = powerSteeringLost ? 0.68 : 1.0;
      const steerSens = clamp(assists.steerSensitivity ?? 1.0, 0.6, 1.4);
      const targetSteerDeg = rawSteerIn * maxAngleDeg * steerSens * steerAuthorityMult;

      // Layer 1 — Asymmetric Ramp (attack 260°/s slower than release 480°/s)
      const isReleasing =
        Math.abs(targetSteerDeg) < 1e-4 ||
        targetSteerDeg * this.steerRampDeg < 0 ||
        Math.abs(targetSteerDeg) < Math.abs(this.steerRampDeg);
      const rampRateDegPerSec = (isReleasing ? 480.0 : 260.0) * (powerSteeringLost ? 0.65 : 1.0);
      const maxRampDelta = rampRateDegPerSec * dtC;
      const rampDiff = targetSteerDeg - this.steerRampDeg;
      if (Math.abs(rampDiff) <= maxRampDelta) {
        this.steerRampDeg = targetSteerDeg;
      } else {
        this.steerRampDeg += Math.sign(rampDiff) * maxRampDelta;
      }

      // Layer 2 — Speed Cap clamp
      const layer2SteerDeg = clamp(this.steerRampDeg, -maxAngleDeg, maxAngleDeg);
      this.steerRampDeg = layer2SteerDeg;

      // Layer 4 — Countersteer Assist (8° deadband, never exceeds maxAngle(v), only gear >= 1)
      const slipBodyDeg =
        speed > 0.5 ? (Math.atan2(vLat, Math.max(Math.abs(vLong), 0.1)) * 180) / Math.PI : 0;
      this.lastSlipBodyDeg = slipBodyDeg;
      let cstAssistDeg = 0;
      if (cstEnabled && this.gear >= 1 && Math.abs(slipBodyDeg) > 8.0) {
        const slipSign = slipBodyDeg > 0 ? 1 : -1;
        cstAssistDeg = slipSign * Math.min((Math.abs(slipBodyDeg) - 8.0) * 0.6, maxAngleDeg);
      }
      this.lastCstAssistDeg = cstAssistDeg;

      let effSteerDeg = layer2SteerDeg + cstAssistDeg;

      // Layer 3 — Yaw-Rate Governor (clamps the sum using mean friction of all 4 wheels [0..3])
      // Pacejka peak friction per wheel is cornerMu[i] * 1.18
      const muAvg =
        ((cornerMu[0] + cornerMu[1] + cornerMu[2] + cornerMu[3]) * 0.25) * 1.18;
      if (govEnabled && speed >= 1.0) {
        const maxUsefulRad = (muAvg * 9.81 * effectiveWheelbase) / (speed * speed);
        const maxUsefulDeg = (maxUsefulRad * 180) / Math.PI;
        effSteerDeg = clamp(effSteerDeg, -maxUsefulDeg, maxUsefulDeg);
        this.lastGovCapDeg = maxUsefulDeg;
      } else {
        this.lastGovCapDeg = 0;
      }

      this.steerAngle = (effSteerDeg * Math.PI) / 180;

      // Ackermann left/right front wheel angles (+steer turns left toward +X -> FL inner > FR outer)
      const absSteer = Math.abs(this.steerAngle);
      if (absSteer > 0.002) {
        const turnR = effectiveWheelbase / Math.tan(absSteer);
        const innerAng = Math.atan(effectiveWheelbase / Math.max(0.85, turnR - halfTrack));
        const outerAng = Math.atan(effectiveWheelbase / (turnR + halfTrack));
        if (this.steerAngle > 0) {
          this.steerAngleFL = innerAng;
          this.steerAngleFR = outerAng;
        } else {
          this.steerAngleFL = -outerAng;
          this.steerAngleFR = -innerAng;
        }
      } else {
        this.steerAngleFL = this.steerAngle;
        this.steerAngleFR = this.steerAngle;
      }

      // Regression 2.9: Rear steer respects steerable wheel mask (0 unless rearSteerEnabled)
      const rearSteerAng = rearSteerEnabled
        ? clamp(this.steerAngle * lerp(-0.08, 0.06, clamp(speed / 45, 0, 1)), -0.05, 0.05)
        : 0;
      const steerAngles = this.scratchSteerAngles;
      steerAngles[0] = steerableMask[0] ? this.steerAngleFL : 0;
      steerAngles[1] = steerableMask[1] ? this.steerAngleFR : 0;
      steerAngles[2] = steerableMask[2] ? rearSteerAng : 0;
      steerAngles[3] = steerableMask[3] ? rearSteerAng : 0;

      // Automatic gear selection + clean forward <-> reverse channel zeroing (Regression 2.6)
      if (this.shiftTimer > 0) {
        this.shiftTimer = Math.max(0, this.shiftTimer - dtC);
      }
      if (this.revMatchBlipTimer > 0) {
        this.revMatchBlipTimer = Math.max(0, this.revMatchBlipTimer - dtC);
      }
      if (assists.autoGear) {
        if (this.gear === -1) {
          if (this.throttleSmooth > 0.15 && vLong > -0.6) {
            this.gear = 1;
            this.onGearTransition(-1, 1, false);
          }
        } else {
          if (!handbrakeActive && this.brakeSmooth > 0.25 && vLong <= 0.45 && this.throttleSmooth < 0.05) {
            this.gear = -1;
            this.onGearTransition(this.prevGear, -1, true);
          } else if (this.gear <= 0) {
            this.gear = 1;
            this.onGearTransition(this.prevGear, 1, false);
          }
        }
      }

      // Staged Fuel Starvation System
      const fuelPctNow = (this.fuelLiters / Math.max(1, spec.fuelMaxLiters)) * 100;
      const highCornerOrBrake = Math.abs(this.latG) > 0.75 || this.lonG < -0.75;
      let fuelPowerMult = 1.0;

      if (fuelPctNow <= 0.005) {
        this.fuelState = 'stalled';
        fuelPowerMult = 0.0;
      } else if (fuelPctNow <= 1.0) {
        this.fuelState = 'critical';
        this.starvationCutClock += dtC * 14.5;
        const sputterWave = 0.78 + 0.22 * Math.sin(this.starvationCutClock);
        fuelPowerMult = 0.50 * sputterWave;
      } else if (fuelPctNow <= 3.0 && highCornerOrBrake) {
        this.fuelState = 'starving';
        this.starvationCutClock += dtC * 11.0;
        const cutOn = Math.sin(this.starvationCutClock) > -0.15;
        fuelPowerMult = cutOn ? 0.50 : 1.0;
      } else {
        this.fuelState = 'normal';
        fuelPowerMult = 1.0;
      }

      // Engine RPM, Clutch Engagement, Downshift Rev-Match Blip & Turbo Spool
      const baseRatio = spec.gearRatios[this.gear + 1] ?? 0;
      const ratio = this.gear > 1 ? baseRatio * eff.gearRatioScale : baseRatio;
      const drivenSum = Math.max(0.01, spec.frontDriveFrac + spec.rearDriveFrac);
      const frontAvgOmega = (this.wheelOmega[0] + this.wheelOmega[1]) * 0.5;
      const rearAvgOmega = (this.wheelOmega[2] + this.wheelOmega[3]) * 0.5;
      const avgDrivenOmega =
        (spec.frontDriveFrac * frontAvgOmega + spec.rearDriveFrac * rearAvgOmega) / drivenSum;
      const coupledRpm =
        this.gear === 0
          ? spec.idleRpm + this.throttleSmooth * (eff.redlineRpm - spec.idleRpm) * 0.85
          : Math.abs(avgDrivenOmega * ratio * eff.finalDrive) * (60 / (Math.PI * 2));

      let driveThrottle = raceLive ? this.throttleSmooth : 0;
      let brakeCmd = raceLive ? this.brakeSmooth : 1.0;
      let isReverseThrottle = false;

      if (raceLive && this.gear === -1) {
        if (handbrakeActive) {
          driveThrottle = 0;
          brakeCmd = Math.max(this.brakeSmooth, 1.0);
        } else if (this.brakeSmooth > 0.05) {
          driveThrottle = this.brakeSmooth;
          brakeCmd = 0;
          isReverseThrottle = true;
        } else if (this.throttleSmooth > 0.05) {
          driveThrottle = 0;
          brakeCmd = this.throttleSmooth;
        }
      }

      // Smooth Clutch Engagement across shifts & standing launches
      const launchSlipClutch =
        Math.abs(this.gear) === 1 && speed < 3.2
          ? lerp(driveThrottle > 0.05 ? 0.84 : 0.42, 1.0, clamp(speed / 3.2, 0, 1))
          : 1.0;
      const targetClutch =
        this.gear === 0 ? 0.0 : this.shiftTimer > 0 ? 0.28 : launchSlipClutch;
      this.clutchEngage = lerp(
        this.clutchEngage,
        targetClutch,
        1 - Math.exp((targetClutch > this.clutchEngage ? -24.0 : -34.0) * dtC),
      );

      if (this.fuelState === 'stalled') {
        this.engineCranking = raceLive && driveThrottle > 0.12;
        const crankRpm = this.engineCranking ? 290 + 45 * Math.sin(this.starvationCutClock * 2.5) : 0;
        this.starvationCutClock += dtC * 9.0;
        this.rpm = lerp(this.rpm, crankRpm, 1 - Math.exp(-10.0 * dtC));
        this.turboBoost = lerp(this.turboBoost, 0, 1 - Math.exp(-8.0 * dtC));
      } else {
        this.engineCranking = false;
        const revBlipOffset = this.revMatchBlipTimer > 0 ? 1100 * (this.revMatchBlipTimer / 0.14) : 0;
        const launchFloorRpm =
          raceLive && Math.abs(this.gear) === 1 && speed < 14
            ? spec.idleRpm + driveThrottle * lerp(4300, 1200, clamp(speed / 14, 0, 1))
            : spec.idleRpm;
        const freeRevRpm = !raceLive
          ? spec.idleRpm + this.throttleSmooth * 5400
          : spec.idleRpm + driveThrottle * 4200;
        const targetRpm =
          this.gear === 0 || !raceLive
            ? freeRevRpm
            : Math.max(spec.idleRpm, coupledRpm + revBlipOffset, launchFloorRpm);
        this.rpm = lerp(
          this.rpm,
          clamp(targetRpm, spec.idleRpm, eff.redlineRpm),
          1 - Math.exp(-22.0 * dtC),
        );
        const boostTarget =
          driveThrottle > 0.15
            ? clamp(((this.rpm - spec.idleRpm) / (eff.redlineRpm - spec.idleRpm)) * 1.15 * driveThrottle, 0.1, 1.08)
            : 0.05;
        this.turboBoost = lerp(
          this.turboBoost,
          boostTarget,
          1 - Math.exp((boostTarget > this.turboBoost ? -5.5 * eff.spoolSpeedMult : -10.5) * dtC),
        );
      }

      if (assists.autoGear && raceLive && this.gear >= 1 && this.shiftTimer <= 0 && this.fuelState !== 'stalled') {
        const climbDownshiftRpm =
          !this.envAdapter && slopeFwdY > 0.045 && this.throttleSmooth > 0.38
            ? eff.shiftDownRpm + clamp((slopeFwdY - 0.045) * 9800, 0, 1550)
            : eff.shiftDownRpm;
        if (this.rpm > eff.shiftUpRpm && this.gear < spec.maxGear) {
          const prev = this.gear;
          this.gear += 1;
          this.onGearTransition(prev, this.gear, false);
          this.gearShiftPulse = 1.0;
        } else if (
          this.rpm < climbDownshiftRpm &&
          this.gear > 1 &&
          (this.brakeSmooth > 0.15 || this.throttleSmooth > 0.35)
        ) {
          const prev = this.gear;
          this.gear -= 1;
          this.onGearTransition(prev, this.gear, true);
          this.gearShiftPulse = 0.78;
        }
      }

      // Dynamic mass (effective chassis + parts delta + 0.74 kg/L fuel)
      const activeMassKg = eff.massKg + this.fuelLiters * 0.74;

      // Drafting slipstream behind rivals ahead
      let draftReduction = 0;
      if (rivalsInput && rivalsInput.length > 0 && speed > 18) {
        for (let r = 0; r < rivalsInput.length; r++) {
          const rv = rivalsInput[r];
          const dx = rv.x - this.pos.x;
          const dz = rv.z - this.pos.z;
          const fwdDist = dx * fwdX + dz * fwdZ;
          const latDist = Math.abs(dx * leftX + dz * leftZ);
          if (fwdDist > 3.2 && fwdDist < 36.0 && latDist < 2.2) {
            const gain = (1 - fwdDist / 36.0) * (1 - latDist / 2.2) * 0.24;
            if (gain > draftReduction) draftReduction = gain;
          }
        }
      }

      // Aero Drag & Downforce
      const aeroYawRad = speed > 6 ? Math.atan2(vLat, Math.max(Math.abs(vLong), 6)) : 0;
      const yawBleed = 1.0 - clamp(Math.abs(aeroYawRad) * 0.65, 0, 0.32);
      const pitchAeroShift = clamp(-this.bodyPitch * 4.5, -0.14, 0.14);
      const effectiveCda = Math.max(0.42, (spec.cdaBase + eff.cdaDelta + spec.cdaScale * downforceMult) * activeAeroDragScale) * (1 - draftReduction);
      const aeroDrag = 0.5 * airDensity * effectiveCda * speed * speed;
      const aeroDownforceFront =
        0.5 * airDensity * spec.downforceFront * downforceFrontMult * (1 + pitchAeroShift) * yawBleed * vLong * Math.max(0, vLong);
      const aeroDownforceRear =
        0.5 * airDensity * spec.downforceRear * downforceRearMult * (1 - pitchAeroShift * 0.65) * yawBleed * vLong * Math.max(0, vLong);
      lastDownforceN = aeroDownforceFront + aeroDownforceRear;

      // Active gear mechanical redline wheel & vehicle speed ceiling
      const activeGearAbsRatio = this.gear >= 1 ? Math.abs(ratio) : 0;
      const gearMaxWheelOmega =
        activeGearAbsRatio > 0.05
          ? (eff.redlineRpm * Math.PI * 2) / (60 * activeGearAbsRatio * eff.finalDrive)
          : Infinity;
      const gearMaxSpeedMs = Number.isFinite(gearMaxWheelOmega)
        ? gearMaxWheelOmega * effWheelRadius
        : Infinity;

      // Engine torque + Clutch slip + Reverse 10 m/s cap + Strict Forward Gear Redline Limiter
      const fwdRedlineFrac = Number.isFinite(gearMaxWheelOmega)
        ? Math.max(
            avgDrivenOmega / Math.max(1, gearMaxWheelOmega),
            vLong / Math.max(1, gearMaxSpeedMs),
            this.rpm / eff.redlineRpm,
          )
        : 0;
      const revLimiterCap = isReverseThrottle
        ? clamp(1.0 - Math.max(0, -vLong - 8.2) / 1.8, 0, 1)
        : this.gear >= 1
          ? clamp(1.0 - Math.max(0, fwdRedlineFrac - 0.982) / 0.018, 0, 1)
          : 1.0;
      const effWithFi =
        isEngineSwapForcedInduction(this.carSetup.equippedParts?.engine_swap)
          ? Object.assign({}, eff, { forcedInductionSwap: true })
          : eff;
      const rawEngineTorque =
        this.gear === 0 || this.fuelState === 'stalled'
          ? 0
          : engineTorqueAtRpm(this.rpm, spec, this.turboBoost, effWithFi) *
            driveThrottle *
            fuelPowerMult *
            mapPowerScale *
            revLimiterCap;
      const launchMult =
        !isReverseThrottle && this.gear === 1 && speed < 8
          ? lerp(0.92, 1.0, clamp(speed / 8, 0, 1))
          : 1.0;
      const rpmAboveIdleFrac = clamp(
        (this.rpm - spec.idleRpm) / Math.max(100, eff.redlineRpm - spec.idleRpm),
        0,
        1.0,
      );
      const overrunExcessMs = this.gear >= 1 && Number.isFinite(gearMaxSpeedMs)
        ? Math.max(0, vLong - gearMaxSpeedMs * 0.996)
        : 0;
      const engineBrakeNm =
        raceLive && this.gear >= 1 && this.fuelState !== 'stalled'
          ? overrunExcessMs > 0
            ? -clamp(overrunExcessMs * 95 + 160, 0, 620) * this.clutchEngage
            : driveThrottle < 0.04 && vLong > 3.5
              ? -rpmAboveIdleFrac * 150 * this.clutchEngage
              : 0
          : 0;
      const revMatchBlipNm = this.revMatchBlipTimer > 0 && this.gear >= 1 && fwdRedlineFrac < 0.95 ? 35 : 0;
      const gearboxTotalTorque =
        this.gear === 0
          ? 0
          : ((rawEngineTorque * launchMult + revMatchBlipNm) * this.clutchEngage + engineBrakeNm) *
            Math.abs(ratio) *
            eff.finalDrive *
            0.91 *
            (isReverseThrottle ? -0.72 : 1.0);

      // Longitudinal & Lateral load transfer distribution across 4 corners
      const prevAx = clamp(this.lonG * 9.81, -22, 18);
      const transferLong = (activeMassKg * prevAx * cgHeight) / effectiveWheelbase;
      const fzFrontAxle = clamp(
        staticFrontFrac * activeMassKg * 9.81 + aeroDownforceFront - transferLong,
        400,
        (activeMassKg * 9.81 + lastDownforceN) * 0.85,
      );
      const fzRearAxle = clamp(
        staticRearFrac * activeMassKg * 9.81 + aeroDownforceRear + transferLong,
        400,
        (activeMassKg * 9.81 + lastDownforceN) * 0.85,
      );
      const totalNormal = fzFrontAxle + fzRearAxle;
      const latTransfer = clamp(
        (activeMassKg * this.latG * 9.81 * cgHeight) / effTrackWidth,
        -totalNormal * 0.37,
        totalNormal * 0.37,
      );
      const frontLatShare = clamp(setup.antiRollFront / Math.max(2, setup.antiRollFront + setup.antiRollRear), 0.25, 0.75);
      const rearLatShare = 1.0 - frontLatShare;
      const targetCornerFz = this.scratchTargetCornerFz;
      targetCornerFz[0] = clamp(fzFrontAxle * 0.5 - latTransfer * frontLatShare, 150, totalNormal * 0.45);
      targetCornerFz[1] = clamp(fzFrontAxle * 0.5 + latTransfer * frontLatShare, 150, totalNormal * 0.45);
      targetCornerFz[2] = clamp(fzRearAxle * 0.5 - latTransfer * rearLatShare, 150, totalNormal * 0.45);
      targetCornerFz[3] = clamp(fzRearAxle * 0.5 + latTransfer * rearLatShare, 150, totalNormal * 0.45);
      const staticCornerLoad = activeMassKg * 9.81 * 0.25;
      const aeroPerCorner = this.scratchAeroPerCorner;
      aeroPerCorner[0] = aeroDownforceFront * 0.5;
      aeroPerCorner[1] = aeroDownforceFront * 0.5;
      aeroPerCorner[2] = aeroDownforceRear * 0.5;
      aeroPerCorner[3] = aeroDownforceRear * 0.5;
      const eqComp = staticCornerLoad / kEff;

      // Brake Pad/Rotor Temperature & C1 Smooth Fade Factor per corner
      const rawBrakeForce = brakeCmd * eff.maxBrakeForce;
      const handbrakeCmdForce = handbrakeActive ? 11800 : 0;
      const cornerBrakeTorqueReq = this.scratchCornerBrakeT;
      const cornerBrakeForceReq = this.scratchCornerBrakeF;
      for (let i = 0; i < 4; i++) {
        const isFront = i < 2;
        const baseBrkF = isFront
          ? rawBrakeForce * brakeFrontSplit * 0.5
          : Math.max(rawBrakeForce * brakeRearSplit * 0.5, handbrakeCmdForce * 0.5);
        const tB = this.brakeTempsC[i];
        const fade = smoothBrakePadMu(tB, eff.fadeLimitDeltaC);
        this.brakeFaded[i] = tB > 740 + eff.fadeLimitDeltaC;
        const effRad = effWheelRadius - (this.tireShredded[i] ? 0.042 * this.tireDeflationFrac[i] : 0);
        cornerBrakeForceReq[i] = baseBrkF * fade;
        cornerBrakeTorqueReq[i] = baseBrkF * effRad * fade;

        const workKw = (baseBrkF * Math.abs(vLong)) / 1000;
        const heatGain = workKw * (isFront ? 0.145 : 0.105) * dtC;
        const airCool =
          (tB - (isFrostpeak ? 5 : 24)) *
          (0.045 + clamp(speed / 75, 0, 1) * 0.165) *
          eff.coolingRateMult *
          dtC;
        this.brakeTempsC[i] = clamp(tB + heatGain - airCool, isFrostpeak ? 5 : 24, 1080);
      }

      // Slope & terrain terms for climb velocity, gravity & road-plane corner hub projections
      const gravLong = -activeMassKg * 9.81 * slopeFwdY;
      const bankSlide = activeMassKg * 9.81 * bankLatY;
      const rawGroundClimb = clamp(vLong * slopeFwdY, -12.0, 12.0);
      const groundClimbRate =
        this.collisionVerticalDampTimer > 0 ? Math.min(rawGroundClimb, 0.55) : rawGroundClimb;

      // Precompute 4-corner world ground elevation & kerb micro-bumps before substepping
      const cornerGroundY = this.scratchCornerGroundY;
      const cornerPlaneOffsetY = this.scratchCornerPlaneOffsetY;
      let avgGroundY = 0;
      for (let i = 0; i < 4; i++) {
        const wx = this.pos.x + fwdX * wheelCoordsZ[i] + leftX * wheelCoordsX[i];
        const wz = this.pos.z + fwdZ * wheelCoordsZ[i] + leftZ * wheelCoordsX[i];
        const cq = this.querySurface(wx, wz, this.wheelQScratch);
        const gy = this.sampleGroundHeight(wx, this.pos.y, wz, cq, roadHalf);
        cornerGroundY[i] = gy;
        cornerPlaneOffsetY[i] = clamp(slopeFwdY * wheelCoordsZ[i] + bankLatY * wheelCoordsX[i], -0.45, 0.45);
        avgGroundY += gy * 0.25;
      }

      // Guard abrupt upward ground step jumps after a horizontal collision pushout (prevents curb/bank catapults)
      const groundJumpUp = avgGroundY - this.prevChassisAvgGroundY;
      if (this.collisionVerticalDampTimer > 0 && groundJumpUp > 0.11 && this.pos.y < avgGroundY - 0.03) {
        this.pos.y = avgGroundY - 0.03;
        this.vy = Math.min(this.vy, 0.25);
      }
      this.prevChassisAvgGroundY = avgGroundY;

      // -----------------------------------------------------------------------
      // ~1000 Hz (8x SUBSTEPS) SUSPENSION & TIRE CONTACT PATCH SOLVER
      // -----------------------------------------------------------------------
      let accumFxLong = 0;
      let accumFyLat = 0;
      let accumYawTorque = 0;
      let subMaxLsd = 0;
      let subAbsFired = false;
      let subTcsFired = false;
      let subBottomed = false;
      const nominalCornerLoad = spec.massKg * 9.81 * 0.25;
      const kerbWave =
        this.currentSurface === 'kerb'
          ? Math.sin(this.pos.x * 5.2 + this.pos.z * 5.2) * 0.014 * kerbHeightScale
          : this.currentSurface === 'offroad'
            ? Math.sin(this.pos.x * 2.1) * Math.cos(this.pos.z * 2.3) * 0.022
            : 0;

      for (let tSub = 0; tSub < TIRE_SUBSTEPS; tSub++) {
        // 1) Quarter-car suspension contact + vertical tire spring at ~960 Hz
        let sumVerticalSpringF = 0;
        const stepFz = this.scratchStepFz;
        for (let i = 0; i < 4; i++) {
          const isFront = i < 2;
          const axCornerK = isFront ? frontCornerK : rearCornerK;
          const axKEff = isFront ? frontKEff : rearKEff;
          const axEqComp = staticCornerLoad / axKEff;
          const cornerBodyY = this.pos.y + cornerPlaneOffsetY[i];
          const axleWave = i < 2 ? kerbWave : -kerbWave * 0.65;
          const rawComp = axEqComp - (cornerBodyY - cornerGroundY[i]) + axleWave;
          if (rawComp > 0.0005) {
            this.wheelGrounded[i] = true;
            const compClamped = clamp(rawComp, 0.0, 0.145);
            const compVel = clamp(groundClimbRate - this.vy, -6.5, 6.5);
            const dampRate =
              compVel >= 0
                ? isFront
                  ? frontBumpDamp
                  : rearBumpDamp
                : isFront
                  ? frontReboundDamp
                  : rearReboundDamp;
            const bumpStopClearance = axEqComp + 0.038 * ((setup.rideHeightMm - 32) / 28);
            const bumpStopExcess = Math.max(0, compClamped - bumpStopClearance);
            if (bumpStopExcess > 0.004) subBottomed = true;
            const bumpStopGain = this.collisionVerticalDampTimer > 0 ? 0.25 : 1.35;
            const bumpStopExtra = bumpStopExcess * axCornerK * bumpStopGain;
            const springF = Math.max(0, compClamped * axKEff + bumpStopExtra + compVel * dampRate);
            sumVerticalSpringF += springF;
            this.wheelVelMps[i] = (compClamped - this.wheelCompM[i]) / dtT;
            this.wheelCompM[i] = compClamped;
            this.wheelTravelMm[i] = (compClamped - axEqComp) * 1000;
            this.wheelSuspOffsets[i] =
              (compClamped - axEqComp) * 0.72 + (this.tireShredded[i] ? 0.042 * this.tireDeflationFrac[i] : 0);

            const cornerDynamicFz = Math.max(
              0,
              targetCornerFz[i] + (springF - (staticCornerLoad + aeroPerCorner[i])),
            );
            stepFz[i] = cornerDynamicFz;
          } else {
            this.wheelGrounded[i] = false;
            stepFz[i] = 0;
            this.wheelCompM[i] = lerp(this.wheelCompM[i], -0.045, 1 - Math.exp(-26 * dtT));
            this.wheelVelMps[i] = 0;
            this.wheelTravelMm[i] = this.wheelCompM[i] * 1000;
            this.wheelSuspOffsets[i] =
              this.wheelCompM[i] * 0.72 + (this.tireShredded[i] ? 0.042 * this.tireDeflationFrac[i] : 0);
          }
          this.wheelNormalFz[i] = stepFz[i];
          this.tireLoads[i] = stepFz[i] / 4900;
        }
        if (subBottomed && tSub === 0) this.bottomingEventsCount++;

        // Integrate chassis vertical velocity & position (Gravity + Suspension)
        const rawNetVerticalF = sumVerticalSpringF - activeMassKg * 9.81 - lastDownforceN;
        const maxUpwardN =
          this.collisionVerticalDampTimer > 0 ? activeMassKg * 5.5 : activeMassKg * 24.0;
        const netVerticalF = Math.min(rawNetVerticalF, maxUpwardN);
        this.vy += (netVerticalF / activeMassKg) * dtT;
        if (this.collisionVerticalDampTimer > 0) {
          this.vy = Math.min(this.vy, 0.35);
        }
        this.pos.y += this.vy * dtT;
        // Anti-tunneling chassis floor stop
        if (this.pos.y < avgGroundY - 0.055) {
          this.pos.y = avgGroundY - 0.055;
          if (this.vy < groundClimbRate) this.vy = groundClimbRate;
        }

        // 2) LSD & Torque distribution across driven corners
        const frontAxleDriveT = gearboxTotalTorque * spec.frontDriveFrac;
        const rearAxleDriveT = gearboxTotalTorque * spec.rearDriveFrac;

        const dOmegaRear = this.wheelOmega[2] - this.wheelOmega[3];
        const rearLockRatio = Math.abs(rearAxleDriveT) > 10 ? diffRampPower : diffRampCoast;
        const rearLockT = clamp(
          (diffPreloadNm + Math.abs(rearAxleDriveT) * rearLockRatio) * Math.tanh(dOmegaRear * 0.35),
          -850,
          850,
        );
        const lsdPctRear = clamp(Math.abs(rearLockT) / 520, 0, 1) * 100;
        if (lsdPctRear > subMaxLsd) subMaxLsd = lsdPctRear;

        const dOmegaFront = this.wheelOmega[0] - this.wheelOmega[1];
        const frontLockT =
          spec.frontDriveFrac > 0.05
            ? clamp((diffPreloadNm * 0.5 + Math.abs(frontAxleDriveT) * 0.25) * Math.tanh(dOmegaFront * 0.3), -420, 420)
            : 0;

        const wheelDriveT = this.scratchWheelDriveT;
        wheelDriveT[0] = frontAxleDriveT * 0.5 - frontLockT;
        wheelDriveT[1] = frontAxleDriveT * 0.5 + frontLockT;
        wheelDriveT[2] = rearAxleDriveT * 0.5 - rearLockT;
        wheelDriveT[3] = rearAxleDriveT * 0.5 + rearLockT;

        // Regression 2.10: TCS modulates |kappa| / |driveForce| symmetrically in both forward & reverse gears
        const maxDrivenRollMps = Math.max(
          spec.frontDriveFrac > 0.05 ? Math.abs(this.wheelOmega[0] * effWheelRadius) : 0,
          spec.frontDriveFrac > 0.05 ? Math.abs(this.wheelOmega[1] * effWheelRadius) : 0,
          spec.rearDriveFrac > 0.05 ? Math.abs(this.wheelOmega[2] * effWheelRadius) : 0,
          spec.rearDriveFrac > 0.05 ? Math.abs(this.wheelOmega[3] * effWheelRadius) : 0,
        );
        if (effectiveTcsLevel > 0 && raceLive && (speed > 0.25 || maxDrivenRollMps > 1.2) && driveThrottle > 0.08) {
          const tcsKappaThresh = lerp(0.24, 0.075, (effectiveTcsLevel - 1) / 4);
          let maxAbsDrivenKappa = 0;
          if (spec.frontDriveFrac > 0.05) {
            maxAbsDrivenKappa = Math.max(
              maxAbsDrivenKappa,
              Math.abs(this.kappaLag[0]),
              Math.abs(this.kappaLag[1]),
            );
          }
          if (spec.rearDriveFrac > 0.05) {
            maxAbsDrivenKappa = Math.max(
              maxAbsDrivenKappa,
              Math.abs(this.kappaLag[2]),
              Math.abs(this.kappaLag[3]),
            );
          }
          if (maxAbsDrivenKappa > tcsKappaThresh) {
            const cutScale = clamp(1.0 - (maxAbsDrivenKappa - tcsKappaThresh) * 5.5, 0.06, 0.92);
            for (let i = 0; i < 4; i++) wheelDriveT[i] *= cutScale;
            subTcsFired = true;
          }
        }

        let stepFxLong = 0;
        let stepFyLat = 0;
        let stepYawTorque = 0;

        // 3) Per-Wheel Pacejka Magic Formula, Friction Ellipse, Wheel Inertia & Slip-Power Thermal Flux
        for (let i = 0; i < 4; i++) {
          const effRad = effWheelRadius - (this.tireShredded[i] ? 0.042 * this.tireDeflationFrac[i] : 0);
          const fz = stepFz[i];
          const grounded = this.wheelGrounded[i] && fz > 10;

          const vCornerLong = vLong - this.omega * wheelCoordsX[i];
          const vCornerLat = vLat + this.omega * wheelCoordsZ[i];
          const isFront = i < 2;
          const toeSign = i % 2 === 0 ? 1 : -1;
          const toeStatic = toeSign * (isFront ? toeFrontRad : toeRearRad) * 0.45;
          const dAng = steerAngles[i] + toeStatic;
          const cD = Math.cos(dAng);
          const sD = Math.sin(dAng);
          const vWheelLong = vCornerLong * cD + vCornerLat * sD;
          const vWheelLat = -vCornerLong * sD + vCornerLat * cD;

          const vRoll = this.wheelOmega[i] * effRad;
          const vDenom = Math.max(Math.abs(vWheelLong), Math.abs(vRoll), 2.0);
          const rawKappa = grounded ? clamp((vRoll - vWheelLong) / vDenom, -1.2, 1.2) : 0;
          const rawAlpha =
            grounded && speed > 0.9 ? Math.atan2(vWheelLat, Math.max(Math.abs(vWheelLong), 2.2)) : 0;

          const relaxSpeed = Math.max(Math.abs(vWheelLong), 2.8);
          const kAlpha = clamp((relaxSpeed / 0.26) * dtT, 0, 1);
          const aAlpha = clamp((relaxSpeed / 0.38) * dtT, 0, 1);
          this.kappaLag[i] += (rawKappa - this.kappaLag[i]) * kAlpha;
          this.alphaLag[i] += (rawAlpha - this.alphaLag[i]) * aAlpha;

          if (!handbrakeActive && grounded) {
            const peakSlipBound = i >= 2 ? 0.145 : 0.195;
            this.alphaLag[i] = clamp(this.alphaLag[i], -peakSlipBound, peakSlipBound);
          }

          if (!grounded || (speed < 0.7 && Math.abs(vRoll) < 0.8)) {
            this.kappaLag[i] *= 0.85;
            this.alphaLag[i] *= 0.85;
          }

          let wheelBrakeT = cornerBrakeTorqueReq[i];
          const absTargetKappa = lerp(-0.22, -0.10, (effectiveAbsLevel - 1) / 2);
          if (grounded && effectiveAbsLevel > 0 && wheelBrakeT > 20 && speed > 3.2 && this.kappaLag[i] < absTargetKappa) {
            const release = clamp(1.0 - (absTargetKappa - this.kappaLag[i]) * 5.2, 0.14, 0.92);
            wheelBrakeT *= release;
            subAbsFired = true;
          }

          let fxTire = 0;
          let fyTire = 0;

          if (grounded) {
            const loadSensFz = Math.pow(fz / nominalCornerLoad, 0.90) * nominalCornerLoad;
            const axleWidthBias = i >= 2 ? 1.04 : 0.985;
            const axCamberDeg = isFront ? camberFrontDeg : camberRearDeg;
            const optCamberDeg = isFront ? -2.5 : -1.9;
            const camberLatBonus = 1.0 + clamp(0.032 - Math.abs(axCamberDeg - optCamberDeg) * 0.015, -0.06, 0.035);
            const camberLongPenalty = 1.0 - clamp((Math.abs(axCamberDeg) - 2.6) * 0.016, 0, 0.055);
            const cap = cornerMu[i] * loadSensFz * 1.18 * axleWidthBias;
            const axleStiffBias = i >= 2 ? 1.08 : 0.96;
            const stiff = ((compound.stiffnessMult * (isSimCade ? 0.95 : 1.0)) * axleStiffBias) / (1.0 + cornerPeakShift[i]);
            const handbrakeLatMod = i >= 2 && handbrakeActive ? 0.34 : 1.0;

            const fxPure = cap * camberLongPenalty * pacejkaMagic(this.kappaLag[i], 13.8 * stiff, 1.38, 0.25, 0.10);
            const effectiveLatGForCamber =
              Math.abs(this.latG) > 0.08 ? this.latG - Math.sign(this.latG) * 0.08 : 0;
            const camberThrust =
              (i % 2 === 0 ? 1 : -1) *
              clamp(effectiveLatGForCamber, -2.5, 2.5) *
              (0.006 + Math.abs(axCamberDeg) * 0.0025) *
              cap;
            const fyPure =
              -cap * camberLatBonus * handbrakeLatMod * pacejkaMagic(this.alphaLag[i], 8.6 * stiff, 1.24, 0.30, 0.05) +
              camberThrust * 0.40;

            // Combined-Slip Friction Ellipse with gentle lateral preservation
            const combined = Math.hypot(fxPure / (cap + 1), fyPure / (cap + 1));
            const ellLong = combined > 1.0 ? 1.0 / combined : 1.0;
            const ellLat = combined > 1.0 ? lerp(1.0 / combined, 1.0 / Math.sqrt(combined), 0.16) : 1.0;
            fxTire = fxPure * ellLong;
            fyTire = fyPure * ellLat;
          }

          let puncturePullLat = 0;
          if (grounded && this.tireShredded[i] && speed > 2.0) {
            const defl = this.tireDeflationFrac[i];
            const pullSign = i % 2 === 0 ? 1 : -1;
            puncturePullLat = pullSign * (340 + 780 * defl) * (0.4 + 0.6 * Math.sin(this.wheelSpins[i]));
          }

          const fxCar = fxTire * cD - fyTire * sD;
          const fyCar = fyTire * cD + fxTire * sD + puncturePullLat;

          stepFxLong += fxCar;
          stepFyLat += fyCar;
          stepYawTorque += wheelCoordsZ[i] * fyCar - wheelCoordsX[i] * fxCar;

          // Regression 2.11: Avoid Math.sign(0) zero-velocity oscillation cleanly
          const absOmega = Math.abs(this.wheelOmega[i]);
          const absVWheel = Math.abs(vWheelLong);
          const spinDir =
            absOmega > 0.18
              ? (this.wheelOmega[i] > 0 ? 1 : -1)
              : absVWheel > 0.12
                ? (vWheelLong > 0 ? 1 : -1)
                : 0;
          const appliedBrakeT =
            wheelBrakeT > 0 && absOmega < 0.75 && Math.abs(wheelDriveT[i]) < 40
              ? 0
              : wheelBrakeT * spinDir;
          const rollResistT = grounded && spinDir !== 0 ? rollingCoeff * fz * effRad * spinDir : 0;
          const netWheelT = wheelDriveT[i] - appliedBrakeT - fxTire * effRad - rollResistT;

          const maxReverseWheelOmega = isReverseThrottle ? -(10.0 / effRad + 1.5) : -110;
          const isDrivenWheel = i < 2 ? spec.frontDriveFrac > 0.05 : spec.rearDriveFrac > 0.05;
          const maxForwardWheelOmega =
            this.gear >= 1 && isDrivenWheel && Number.isFinite(gearMaxWheelOmega) && this.clutchEngage > 0.55
              ? gearMaxWheelOmega
              : 310;
          this.wheelOmega[i] = clamp(
            this.wheelOmega[i] + (netWheelT / wheelInertia) * dtT,
            maxReverseWheelOmega,
            maxForwardWheelOmega,
          );
          if (brakeCmd > 0.1 && absVWheel < 1.0 && Math.abs(wheelDriveT[i]) < 60) {
            this.wheelOmega[i] *= 0.80;
          }
          this.wheelSpins[i] += this.wheelOmega[i] * dtT;
        }

        accumFxLong += stepFxLong;
        accumFyLat += stepFyLat;
        accumYawTorque += stepYawTorque;
      }

      if (subAbsFired) absFlag = true;
      if (subTcsFired) tcsFlag = true;
      this.lsdLockPct = lerp(this.lsdLockPct, subMaxLsd, 1 - Math.exp(-14 * dtC));

      // Grounded Wheel Count Gate
      const groundedCount =
        (this.wheelGrounded[0] ? 1 : 0) +
        (this.wheelGrounded[1] ? 1 : 0) +
        (this.wheelGrounded[2] ? 1 : 0) +
        (this.wheelGrounded[3] ? 1 : 0);

      // Substep force combination: AVERAGE forces across the 8 tire substeps
      let fxLong = accumFxLong / TIRE_SUBSTEPS;
      let fyLat = accumFyLat / TIRE_SUBSTEPS;
      let yawTorque = accumYawTorque / TIRE_SUBSTEPS;

      // Track slope gravity, smooth C1 hill-climb assist, banking lateral slide & aero drag
      const straightHoldActive =
        Math.abs(rawSteerIn) < 0.02 && !handbrakeActive && Math.abs(this.steerAngle) < 0.002 && groundedCount >= 3;
      const hillAssistEnabled = assists.hillClimbAssist !== false;
      const gradeU = clamp((slopeFwdY - 0.03) / 0.11, 0, 1);
      const gradeSmooth = gradeU * gradeU * (3 - 2 * gradeU);
      const pwrPerKg = eff.maxPowerWatts / Math.max(850, activeMassKg);
      const pwrNormGain = clamp(420 / Math.max(220, pwrPerKg), 0.72, 1.38);
      const rwdSlopeAid = spec.frontDriveFrac < 0.1 ? 1.12 : 1.0;
      const climbAssistN =
        hillAssistEnabled && raceLive && gradeSmooth > 0 && driveThrottle > 0.08 && this.gear >= 1 && groundedCount >= 2
          ? activeMassKg *
            gradeSmooth *
            pwrNormGain *
            rwdSlopeAid *
            (9.81 * Math.max(0, slopeFwdY - 0.03) * 0.62 + 1.55 * clamp(1 - speed / 20, 0, 1)) *
            clamp(driveThrottle, 0, 1)
          : 0;
      fxLong -= (speed > 0.1 ? vLong / speed : 0) * aeroDrag;
      fxLong += gravLong + climbAssistN;
      fyLat -= straightHoldActive ? 0 : bankSlide;

      // Auto Active Aero: deploy high downforce on corners/braking/steep descents, retract to DRS on fast straights
      if (aeroMode === 'auto' && raceLive) {
        if (this.aeroManualOverrideSec > 0) {
          this.aeroManualOverrideSec = Math.max(0, this.aeroManualOverrideSec - dtC);
        } else {
          const spdKmhNow = speed * 3.6;
          const highLoadZone =
            rawBrakeIn > 0.12 ||
            handbrakeActive ||
            Math.abs(lastAy) > 0.35 ||
            Math.abs(rawSteerIn) > 0.18 ||
            slopeFwdY < -0.05;
          const fastStraightZone =
            spdKmhNow > 140 &&
            Math.abs(rawSteerIn) < 0.12 &&
            Math.abs(lastAy) < 0.30 &&
            rawThrottleIn > 0.65 &&
            rawBrakeIn < 0.05;
          if (highLoadZone) {
            this.aeroDeployed = true;
          } else if (fastStraightZone) {
            this.aeroDeployed = false;
          }
        }
      }

      // Regression 2.2, 2.3, 2.4: Excess-yaw-only ESC, scaled by spec.yawInertia, strictly gated on groundedCount >= 3
      let escTorqueNm = 0;
      if (groundedCount >= 3 && speed > 4.0) {
        const understeerK = 0.0018;
        const omegaRef = (vLong * Math.tan(this.steerAngle)) / (effectiveWheelbase + understeerK * speed * speed);
        const omegaExcess = this.omega - omegaRef;
        const deadband = handbrakeActive ? 0.42 : 0.012;
        const absExcess = Math.abs(omegaExcess);
        if (absExcess > deadband) {
          const excessMag = absExcess - deadband;
          const escGain = handbrakeActive
            ? 0.65
            : isSimCade
              ? 3.8 + effectiveTcsLevel * 0.30
              : 3.1 + effectiveTcsLevel * 0.28;
          escTorqueNm = clamp(
            -(omegaExcess > 0 ? 1 : -1) * excessMag * escGain * spec.yawInertia,
            -2.4 * spec.yawInertia,
            2.4 * spec.yawInertia,
          );
        }
        if (isSimCade && !handbrakeActive) {
          escTorqueNm -= this.omega * 0.35 * spec.yawInertia;
        }
      }
      this.lastEscTorqueNm = escTorqueNm;
      yawTorque += escTorqueNm;

      // Pneumatic trail / self-aligning FFB torque estimate
      lastFfbTorque = clamp(
        (this.alphaLag[0] + this.alphaLag[1]) * 0.5 * 1.85 + (this.currentSurface === 'kerb' ? 0.35 : 0),
        -1,
        1,
      );

      // Symplectic (Semi-Implicit) Euler Rigid-Body Chassis Integration + Regression 2.1 Unified stopLong Budget
      const ax = fxLong / activeMassKg;
      const ay = fyLat / activeMassKg;
      let nextVLong = vLong + ax * dtC;

      // Unified stopLong deceleration budget combining rolling + pedal brakes + handbrake into one cap
      let sumRollingForce = 0;
      let sumBrakeForce = 0;
      for (let i = 0; i < 4; i++) {
        if (this.wheelGrounded[i]) {
          sumRollingForce += rollingCoeff * this.wheelNormalFz[i];
          sumBrakeForce += cornerBrakeForceReq[i];
        }
      }
      const totalHoldForce = groundedCount > 0 ? sumRollingForce + sumBrakeForce : 0;
      if (groundedCount > 0 && Math.abs(gearboxTotalTorque) < 40 && Math.abs(vLong) < 0.35 && totalHoldForce > Math.abs(fxLong)) {
        nextVLong = 0;
      } else if (groundedCount > 0 && (brakeCmd > 0.05 || handbrakeActive) && Math.abs(vLong) > 0.01 && Math.abs(gearboxTotalTorque) < 60) {
        const stopDecelBudget = (totalHoldForce / activeMassKg) * dtC;
        const signV = vLong > 0 ? 1 : -1;
        if (nextVLong * signV < 0 || Math.abs(nextVLong) <= Math.max(0.015, stopDecelBudget * 0.25)) {
          if (Math.abs(vLong) <= stopDecelBudget + 0.08) {
            nextVLong = 0;
          }
        }
      }

      // Forward Gear Mechanical Speed Cap: never exceed current gear's redline speed
      if (this.gear >= 1 && Number.isFinite(gearMaxSpeedMs) && this.clutchEngage > 0.55 && groundedCount >= 1) {
        if (nextVLong > gearMaxSpeedMs) {
          nextVLong = gearMaxSpeedMs;
        }
      }

      const lowSpeedLatDamp = speed < 1.2 && groundedCount > 0 ? 0.85 : 1.0;
      const noSkidLatHold =
        !handbrakeActive && groundedCount >= 3
          ? Math.exp((straightHoldActive ? -7.5 : -3.6) * dtC)
          : 1.0;
      const nextVLat = (vLat + ay * dtC) * lowSpeedLatDamp * noSkidLatHold;

      this.vx = nextVLong * fwdX + nextVLat * leftX;
      this.vz = nextVLong * fwdZ + nextVLat * leftZ;

      if (raceLive && !this.envAdapter) {
        const boost = queryBoostPadImpulse(this.pos.x, this.pos.z, this.pos.y);
        if (boost?.active) {
          const curSpd = Math.hypot(this.vx, this.vz);
          if (curSpd < 105) {
            this.vx += boost.dirX * boost.boostAccel * dtC;
            this.vz += boost.dirZ * boost.boostAccel * dtC;
          }
        }
      }

      const straightYawDamp =
        straightHoldActive && Math.abs(this.omega) < 0.22 ? Math.exp(-8.5 * dtC) : 1.0;
      this.omega =
        (this.omega + (yawTorque / spec.yawInertia) * dtC) *
        straightYawDamp *
        (speed < 0.6 && groundedCount > 0 ? 0.82 : 1.0);

      // Clean rest clamp when held by brakes or parked (eliminates +/-0.16 m/s standstill dither)
      const postSpeed = Math.hypot(this.vx, this.vz);
      const holdingBrakeAtRest =
        groundedCount > 0 && (brakeCmd > 0.05 || handbrakeActive) && Math.abs(gearboxTotalTorque) < 55 && totalHoldForce > Math.abs(gravLong);
      if (
        (postSpeed < 0.22 && driveThrottle < 0.02 && !this.engineCranking) ||
        (postSpeed < 0.38 && holdingBrakeAtRest)
      ) {
        this.vx = 0;
        this.vz = 0;
        this.omega = 0;
        this.wheelOmega.fill(0);
      }

      // Regression 2.5: Hard reverse speed cap guard (10.0 m/s = 36 km/h)
      if (this.gear === -1) {
        const newVLong = this.vx * fwdX + this.vz * fwdZ;
        if (newVLong < -10.0) {
          const vL = this.vx * leftX + this.vz * leftZ;
          this.vx = -10.0 * fwdX + vL * leftX;
          this.vz = -10.0 * fwdZ + vL * leftZ;
        }
      }

      // Update position & yaw
      this.pos.x += this.vx * dtC;
      this.pos.z += this.vz * dtC;
      this.yaw = wrapAngle(this.yaw + this.omega * dtC);

      // Update per-corner slip & Ideal-Gas / Slow-Puncture PSI at 120 Hz
      for (let i = 0; i < 4; i++) {
        this.alphaDegOut[i] = (this.alphaLag[i] * 180) / Math.PI;
        const slipMag = Math.hypot(this.kappaLag[i] * 1.45, this.alphaLag[i] / 0.32);
        this.tireSlips[i] = clamp(slipMag + (i >= 2 && handbrakeActive ? 0.55 : 0), 0, 1);

        const isFront = i < 2;
        const coldBase = isFront ? coldPsiFront : coldPsiRear;
        const wearBleed = this.tireLife[i] < 0.30 ? (0.30 - this.tireLife[i]) * 2.6 : 0;
        const targetPsi = this.tireShredded[i]
          ? lerp(24.0, 5.2, this.tireDeflationFrac[i])
          : coldBase + clamp(this.tireLoads[i] - 0.5, 0, 1.2) * 0.85 - wearBleed;
        this.tirePressuresPsi[i] = lerp(
          this.tirePressuresPsi[i],
          clamp(targetPsi, 4.5, 34.5),
          1 - Math.exp((this.tireShredded[i] ? -2.2 : -0.72) * dtC),
        );
      }

      // Formula-Driven Tire Wear (frozen in Test Mode)
      if (!this.testModeEnabled && raceLive && speed > 1.2) {
        const dsFrac = (speed * dtC) / Math.max(800, totalTrackLen);
        const surfWearMult =
          this.currentSurface === 'kerb'
            ? 1.38
            : this.currentSurface === 'offroad'
              ? 1.62
              : wetnessRatio > 0.35
                ? lerp(1.0, 0.58, wetnessRatio)
                : 1.0;

        for (let i = 0; i < 4; i++) {
          const slipWork = this.tireSlips[i];
          const loadWork = clamp(this.tireLoads[i] / 0.58, 0.45, 1.75);
          const axleWearBias = i < 2 ? spec.tireFrontWearBias : spec.tireRearWearBias;
          const workScale =
            (0.46 + slipWork * 0.90 * loadWork) * surfWearMult * compound.wearMult * axleWearBias;
          const wearDelta = dsFrac * stintEcon.wearPerLap * workScale;
          this.tireLife[i] = Math.max(0.0, this.tireLife[i] - wearDelta);
        }
      }

      // Formula-Driven Fuel Consumption (frozen in Test Mode)
      if (!this.testModeEnabled && raceLive && this.fuelLiters > 0) {
        const dsFrac = (speed * dtC) / Math.max(800, totalTrackLen);
        const rpmFrac = clamp((this.rpm - spec.idleRpm) / (eff.redlineRpm - spec.idleRpm), 0, 1.05);
        const driveLoad = 0.22 + driveThrottle * (0.34 + rpmFrac * 0.42);
        const distanceBurn = dsFrac * stintEcon.consumptionPerLap * driveLoad * mapFuelScale * eff.fuelBurnMult;
        const idleBurn = (0.008 + driveThrottle * 0.014) * mapFuelScale * eff.fuelBurnMult * dtC;
        const burned = distanceBurn + idleBurn;
        this.fuelLiters = Math.max(0, this.fuelLiters - burned);
        this.fuelUsedThisLap += burned;
      }

      // Solid World Collisions
      if (!this.envAdapter?.skipCollisions) {
        const colQ = this.circuit.queryNearestInto(this.pos.x, this.pos.z, this.colQScratch, this.pos.y);
        const cFwdX = Math.sin(this.yaw);
        const cFwdZ = Math.cos(this.yaw);
        const cLeftX = Math.cos(this.yaw);
        const cLeftZ = -Math.sin(this.yaw);

        worldColliders.resolveCarCollisions(
          this.pos.x,
          this.pos.y,
          this.pos.z,
          cFwdX,
          cFwdZ,
          cLeftX,
          cLeftZ,
          colQ,
          this.collisionScratch,
        );

        if (this.collisionScratch.hit) {
          const res = this.collisionScratch;
          this.pos.x += res.pushX;
          this.pos.z += res.pushZ;

          // Suppress collision-induced upward launch & stabilize vertical resting height on post-push terrain
          this.collisionVerticalDampTimer = 0.26;
          this.vy = Math.min(this.vy, 0.2);
          this.pitchVel = clamp(this.pitchVel, -0.35, 0.35);
          this.rollVel = clamp(this.rollVel, -0.45, 0.45);
          const postPushQ = this.querySurface(this.pos.x, this.pos.z, this.wheelQScratch);
          const postPushY = this.sampleGroundHeight(this.pos.x, this.pos.y, this.pos.z, postPushQ, roadHalf);
          if (this.pos.y < postPushY - 0.04) {
            this.pos.y = postPushY - 0.04;
          }
          this.prevChassisAvgGroundY = postPushY;

          const nx = res.normalX;
          const nz = res.normalZ;
          const tx = -nz;
          const tz = nx;

          const vInto = -(this.vx * nx + this.vz * nz);
          const vTang = this.vx * tx + this.vz * tz;
          const props = COLLIDER_MATERIAL_PROPS[res.material];

          if (vInto > 0) {
            const impulse = vInto * (1 + props.restitution);
            this.vx += nx * impulse;
            this.vz += nz * impulse;

            this.omega = clamp(
              this.omega + res.leverTorque * clamp(vInto * 0.085, 0, 1.35),
              -4.2,
              4.2,
            );

            const tangDamp = clamp(
              1 - (1 - props.scrapeFriction) * clamp(vInto / 10 + 0.2, 0.2, 1.0),
              0.70,
              0.985,
            );
            const vOutTang = vTang * tangDamp;
            const vOutNorm = this.vx * nx + this.vz * nz;
            this.vx = nx * vOutNorm + tx * vOutTang;
            this.vz = nz * vOutNorm + tz * vOutTang;

            if (vInto > 1.6) {
              const impNorm = clamp(vInto / 18.0, 0.12, 1.0);
              this.wallImpactImpulse = Math.max(this.wallImpactImpulse, impNorm);
              if (vInto > 4.2) {
                this.cleanLap = false;
                this.hazardImpactTimer = 2.8;
                this.driftActivePoints = 0;
                this.driftCombo = 1;
                this.driftChainSec = 0;
                this.driftHoldGrace = 0;
              }
            }
          }

          const absTang = Math.abs(vTang);
          if (absTang > 2.8) {
            const scrapeFrac = clamp((absTang - 2.2) / 36.0, 0.08, 1.0);
            this.wallScrapeIntensity = Math.max(this.wallScrapeIntensity, scrapeFrac);
            const dragPerStep = Math.exp(-3.2 * (1 - props.scrapeFriction + 0.14) * dtC);
            this.vx *= dragPerStep;
            this.vz *= dragPerStep;
          }

          if (res.sparks && (vInto > 3.0 || absTang > 7.5)) {
            const burstStrength = clamp(Math.max(vInto / 18.0, absTang / 42.0), 0.18, 1.0);
            sparkAccumulator += burstStrength;
            if (sparkAccumulator >= 0.45 && this.pendingSparkEvents.length < 4) {
              sparkAccumulator = 0;
              this.pendingSparkEvents.push({
                x: res.hitX,
                y: res.hitY,
                z: res.hitZ,
                nx,
                nz,
                vx: this.vx,
                vz: this.vz,
                intensity: burstStrength,
              });
            }
          }
        }
      }

      // Two-Way Car-to-Car Collision with AI Sprint Rivals & Collidable Multiplayer Cars
      let collidablePeers: ReadonlyArray<{ id: string; x: number; z: number; vx: number; vz: number }>;
      if (rivalsInput && rivalsInput.length > 0 && this.remoteColliders.length > 0) {
        this.scratchColliders.length = 0;
        for (let i = 0; i < rivalsInput.length; i++) this.scratchColliders.push(rivalsInput[i]);
        for (let i = 0; i < this.remoteColliders.length; i++) this.scratchColliders.push(this.remoteColliders[i]);
        collidablePeers = this.scratchColliders;
      } else if (rivalsInput && rivalsInput.length > 0) {
        collidablePeers = rivalsInput;
      } else {
        collidablePeers = this.remoteColliders;
      }
      if (collidablePeers.length > 0 && !this.envAdapter?.skipCollisions) {
        const pFwdX = Math.sin(this.yaw);
        const pFwdZ = Math.cos(this.yaw);
        const minSphereDist = 2.08;
        const minSphereDistSq = minSphereDist * minSphereDist;

        for (let r = 0; r < collidablePeers.length; r++) {
          const rv = collidablePeers[r];
          const cdx = this.pos.x - rv.x;
          const cdz = this.pos.z - rv.z;
          if (cdx * cdx + cdz * cdz > 25.0) continue;

          const rvSpd = Math.hypot(rv.vx, rv.vz);
          const rFwdX = rvSpd > 0.5 ? rv.vx / rvSpd : pFwdX;
          const rFwdZ = rvSpd > 0.5 ? rv.vz / rvSpd : pFwdZ;

          let bestPen = 0;
          let bestNx = 0;
          let bestNz = 0;
          let bestLever = 0;
          let bestContactX = (this.pos.x + rv.x) * 0.5;
          let bestContactZ = (this.pos.z + rv.z) * 0.5;

          // Check 2 longitudinal bumper/chassis spheres on both cars for realistic GT body overlap
          for (const pOff of [-1.2, 1.2]) {
            const px = this.pos.x + pFwdX * pOff;
            const pz = this.pos.z + pFwdZ * pOff;
            for (const rOff of [-1.2, 1.2]) {
              const rx = rv.x + rFwdX * rOff;
              const rz = rv.z + rFwdZ * rOff;
              const dx = px - rx;
              const dz = pz - rz;
              const dSq = dx * dx + dz * dz;
              if (dSq > 0.0001 && dSq < minSphereDistSq) {
                const dist = Math.sqrt(dSq);
                const pen = minSphereDist - dist;
                if (pen > bestPen) {
                  bestPen = pen;
                  bestNx = dx / dist;
                  bestNz = dz / dist;
                  bestContactX = (px + rx) * 0.5;
                  bestContactZ = (pz + rz) * 0.5;
                  const relPx = bestContactX - this.pos.x;
                  const relPz = bestContactZ - this.pos.z;
                  bestLever = (relPx * bestNz - relPz * bestNx) * 0.32;
                }
              }
            }
          }

          if (bestPen > 0.001) {
            const clampedPen = Math.min(bestPen, 0.75);
            const playerPushX = bestNx * clampedPen * 0.52;
            const playerPushZ = bestNz * clampedPen * 0.52;
            const rivalPushX = -bestNx * clampedPen * 0.48;
            const rivalPushZ = -bestNz * clampedPen * 0.48;

            this.pos.x += playerPushX;
            this.pos.z += playerPushZ;
            this.collisionVerticalDampTimer = Math.max(this.collisionVerticalDampTimer, 0.22);
            this.vy = Math.min(this.vy, 0.2);

            const relVn = (this.vx - rv.vx) * bestNx + (this.vz - rv.vz) * bestNz;
            let rivalImpVx = 0;
            let rivalImpVz = 0;
            let rivalYawKick = 0;
            let hitSeverity = 0;

            if (relVn < 0) {
              // Equal-mass inelastic-damped impulse transfer (both player and rival feel the hit!)
              const restitution = 0.28;
              const impulseMag = -(1 + restitution) * relVn * 0.52;
              this.vx += bestNx * impulseMag;
              this.vz += bestNz * impulseMag;

              // Tangential rub friction between car doors/bumpers
              const tx = -bestNz;
              const tz = bestNx;
              const relVt = (this.vx - rv.vx) * tx + (this.vz - rv.vz) * tz;
              const tangTransfer = relVt * 0.08;
              this.vx -= tx * tangTransfer;
              this.vz -= tz * tangTransfer;

              rivalImpVx = -bestNx * impulseMag + tx * tangTransfer;
              rivalImpVz = -bestNz * impulseMag + tz * tangTransfer;

              const impactSpeed = -relVn;
              this.omega = clamp(
                this.omega + bestLever * clamp(impactSpeed * 0.075, 0, 1.15),
                -3.8,
                3.8,
              );
              const relRx = bestContactX - rv.x;
              const relRz = bestContactZ - rv.z;
              const rivalLever = (relRx * -bestNz - relRz * -bestNx) * 0.45;
              rivalYawKick = clamp(rivalLever * clamp(impactSpeed * 0.14, 0.05, 1.6), -1.8, 1.8);

              hitSeverity = clamp(impactSpeed / 16.0, 0.08, 1.0);
              if (impactSpeed > 2.4) {
                this.wallImpactImpulse = Math.max(
                  this.wallImpactImpulse,
                  clamp(impactSpeed / 16, 0.12, 0.72),
                );
              }
              if (impactSpeed > 5.0 && this.pendingSparkEvents.length < 4) {
                this.pendingSparkEvents.push({
                  x: bestContactX,
                  y: this.pos.y + 0.45,
                  z: bestContactZ,
                  nx: bestNx,
                  nz: bestNz,
                  vx: this.vx,
                  vz: this.vz,
                  intensity: clamp(impactSpeed / 18, 0.22, 0.85),
                });
              }
            }

            // Record mutual collision transfer for AI rival (accumulates cleanly across chassis steps)
            let merged = false;
            for (let m = 0; m < this.pendingRivalImpacts.length; m++) {
              const existing = this.pendingRivalImpacts[m];
              if (existing.id === rv.id) {
                existing.pushX += rivalPushX;
                existing.pushZ += rivalPushZ;
                existing.impulseVx += rivalImpVx;
                existing.impulseVz += rivalImpVz;
                existing.yawKick += rivalYawKick;
                existing.severity = Math.max(existing.severity, hitSeverity);
                merged = true;
                break;
              }
            }
            if (!merged) {
              this.pendingRivalImpacts.push({
                id: rv.id,
                pushX: rivalPushX,
                pushZ: rivalPushZ,
                impulseVx: rivalImpVx,
                impulseVz: rivalImpVz,
                yawKick: rivalYawKick,
                severity: hitSeverity,
              });
            }
          }
        }
      }

      // Smooth telemetry G-forces & sprung body pitch/roll/heave inside fixed step
      lastAx = ax / 9.81;
      lastAy = ay / 9.81;
      this.lonG = lerp(this.lonG, clamp(lastAx, -2.6, 2.2), 1 - Math.exp(-13.0 * dtC));
      this.latG = lerp(this.latG, clamp(lastAy, -2.8, 2.8), 1 - Math.exp(-13.0 * dtC));

      const arbRollScale = 1.0 / (0.65 + (arbAvg / 6.0) * 0.35);
      const rideHeightOffset = (setup.rideHeightMm - 60) * 0.00065;
      const pDrop0 = this.tireShredded[0] ? 0.036 * this.tireDeflationFrac[0] : 0;
      const pDrop1 = this.tireShredded[1] ? 0.036 * this.tireDeflationFrac[1] : 0;
      const pDrop2 = this.tireShredded[2] ? 0.036 * this.tireDeflationFrac[2] : 0;
      const pDrop3 = this.tireShredded[3] ? 0.036 * this.tireDeflationFrac[3] : 0;
      const puncturePitch = (pDrop0 + pDrop1 - pDrop2 - pDrop3) * 0.35;
      const punctureRoll = (pDrop1 + pDrop3 - pDrop0 - pDrop2) * 0.45;
      const punctureShimmy =
        (this.tireShredded[0] || this.tireShredded[1] || this.tireShredded[2] || this.tireShredded[3]) &&
        postSpeed > 4
          ? Math.sin(this.wheelSpin * 1.4) * 0.009
          : 0;

      const targetPitch = clamp((-this.lonG * 0.024) / springStiffFactor + puncturePitch, -0.055, 0.055);
      const targetRoll = clamp((-this.latG * 0.030 * arbRollScale) / springStiffFactor + punctureRoll, -0.065, 0.065);
      const kerbShake =
        this.currentSurface === 'kerb'
          ? Math.sin(this.wheelSpin * 2.4) * 0.013 * kerbHeightScale * eff.bumpCompliance
          : 0;
      const aeroSquat = -clamp((postSpeed / 95) ** 2 * 0.022 * downforceMult, 0, 0.028);
      const targetHeave = aeroSquat + kerbShake + punctureShimmy + rideHeightOffset - (pDrop0 + pDrop1 + pDrop2 + pDrop3) * 0.18;

      const springGain = 74 * springStiffFactor;
      const damperGain = 15.5 * setup.damperRatio * Math.sqrt(springStiffFactor);

      this.pitchVel += ((targetPitch - this.bodyPitch) * springGain - this.pitchVel * damperGain) * dtC;
      this.rollVel += ((targetRoll - this.bodyRoll) * springGain - this.rollVel * damperGain) * dtC;
      this.heaveVel += ((targetHeave - this.bodyHeave) * (springGain * 1.4) - this.heaveVel * (damperGain * 1.15)) * dtC;
      this.bodyPitch += this.pitchVel * dtC;
      this.bodyRoll += this.rollVel * dtC;
      this.bodyHeave = clamp(this.bodyHeave + this.heaveVel * dtC, -0.055, 0.048);
      this.wheelSpin += (vLong / spec.wheelRadius) * dtC;
    }

    const raceLive = this.countdownTimer <= 0.15 && !this.raceFinished;
    const handbrakeActive = raceLive && rawHandbrakeIn;
    const dtTotal = dtExecuted > 0 ? dtExecuted : dtFrame;

    this.lastInPitLane = inPitLaneNow;
    this.lastInPitBox = inPitBoxNow;
    this.lastAbsFlag = absFlag;
    this.lastTcsFlag = tcsFlag;
    this.lastAvgGripPct = avgGripPct;
    this.lastVLongOut = lastVLong;
    this.lastVLatOut = lastVLat;

    this.absActive = absFlag;
    this.tcsActive = tcsFlag;
    this.downforceKgf = Math.round(lastDownforceN / 9.81);
    this.ffbTorqueNorm = lastFfbTorque;

    const speedMps = Math.hypot(this.vx, this.vz);
    const speedKmh = speedMps * 3.6;

    // Engine Oil & Water Coolant Temps (scaled by parts thermal load & cooling capacity)
    const rpmNorm = clamp((this.rpm - spec.idleRpm) / Math.max(100, eff.redlineRpm - spec.idleRpm), 0, 1.05);
    const engineLoad =
      this.fuelState === 'stalled' ? 0.04 : raceLive ? 0.25 + this.throttleSmooth * 0.55 + rpmNorm * 0.45 : 0.12;
    const airCooling = clamp(speedKmh / 240, 0, 1.0) * eff.coolingRateMult;
    const targetWaterC = (this.fuelState === 'stalled' ? 68 : 82.0) + engineLoad * 24.5 * eff.heatFactor - airCooling * 8.5;
    const targetOilC = (this.fuelState === 'stalled' ? 72 : 86.0) + engineLoad * 34.0 * eff.heatFactor - airCooling * 6.5 + Math.abs(this.latG) * 2.2;
    this.waterTempC = lerp(this.waterTempC, targetWaterC, 1 - Math.exp(-0.22 * dtTotal));
    this.oilTempC = lerp(this.oilTempC, targetOilC, 1 - Math.exp(-0.14 * dtTotal));

    // Surface alignment orientation
    const finalQ = this.querySurface(this.pos.x, this.pos.z);
    if (this.envAdapter?.groundNormalAt || finalQ.isBridge || finalQ.absDistance < roadHalf + SHOULDER_WIDTH || inPitLaneNow) {
      const nVec = this.envAdapter?.groundNormalAt
        ? this.sampleGroundNormal(this.pos.x, this.pos.z)
        : finalQ.up;
      _trackNormal.set(nVec.x, nVec.y, nVec.z);
    } else {
      const gn = this.sampleGroundNormal(this.pos.x, this.pos.z);
      _groundNorm.copy(gn);
      const blend = clamp((finalQ.absDistance - (roadHalf + SHOULDER_WIDTH)) / 3.0, 0, 1);
      this.scratchFinalUp.set(finalQ.up.x, finalQ.up.y, finalQ.up.z);
      _trackNormal.lerpVectors(this.scratchFinalUp, _groundNorm, blend).normalize();
    }
    this.syncOrientationFromTrack(_trackNormal, 1 - Math.exp(-16.0 * dtPulse));

    // Track CPU step budget
    const stepCpuMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - cpuStartMs;
    this.lastStepCpuMs = chassisSteps > 0 ? lerp(this.lastStepCpuMs, stepCpuMs, 0.25) : stepCpuMs;
    if (stepCpuMs > this.maxStepCpuMs) this.maxStepCpuMs = stepCpuMs;

    // Speed Trap Radar Gate Detection
    if (this.circuit.features.speedTrapGates && raceLive && speedKmh > 35) {
      for (const trapT of this.circuit.speedTrapTs) {
        const diffA = Math.abs(this.prevTrackTForTrap - trapT);
        const diffB = Math.abs(finalQ.t - trapT);
        const crossedForward =
          (this.prevTrackTForTrap <= trapT && finalQ.t >= trapT && diffA + diffB < 0.08) ||
          Math.abs(finalQ.t - trapT) < 0.0028;
        if (crossedForward && this.speedTrapBannerTimer <= 0.1) {
          const captured = Math.round(speedKmh);
          this.speedTrapKmh = captured;
          this.speedTrapBannerTimer = 3.2;
          if (captured > this.speedTrapRecordKmh) {
            this.speedTrapRecordKmh = captured;
          }
        }
      }
    }
    this.prevTrackTForTrap = finalQ.t;

    // Drift Clipping Zone Detection
    this.inDriftClippingZone = false;
    if (this.circuit.features.driftClippingZones) {
      for (const dzT of this.circuit.driftZoneTs) {
        let d = Math.abs(finalQ.t - dzT);
        if (d > 0.5) d = 1 - d;
        if (d < 0.022 && finalQ.absDistance < roadHalf + 2.5) {
          this.inDriftClippingZone = true;
          break;
        }
      }
    }

    // Dirt & Frost/Slush Accumulation
    if (raceLive && speedMps > 1.5) {
      const spdNorm = clamp(speedMps / 75, 0, 1.3);
      const isFrostDirt = this.circuit.mapId === 'frostpeak_pass';
      if (this.currentSurface === 'offroad' && !inPitLaneNow) {
        this.dirtLevel = clamp(
          this.dirtLevel + dtTotal * ((isFrostDirt ? 0.08 : 0.045) + (isFrostDirt ? 0.19 : 0.14) * spdNorm),
          0,
          1,
        );
      } else if (this.currentSurface === 'kerb') {
        this.dirtLevel = clamp(
          this.dirtLevel + dtTotal * ((isFrostDirt ? 0.014 : 0.008) + (isFrostDirt ? 0.032 : 0.022) * spdNorm),
          0,
          1,
        );
      } else {
        if (wetnessRatio > 0.25) {
          this.dirtLevel = clamp(this.dirtLevel - dtTotal * 0.006 * wetnessRatio, 0.04, 1);
        } else {
          this.dirtLevel = clamp(this.dirtLevel + dtTotal * 0.0016 * (0.3 + 0.7 * spdNorm), 0, 1);
        }
      }
    }

    // Pit Lane Service (Respects Pit Strategy Plan OR Auto Pit Service Easy Assist)
    const minTireLife = Math.min(
      this.tireLife[0],
      this.tireLife[1],
      this.tireLife[2],
      this.tireLife[3],
    );
    const desiredFuel = assists.autoPitService
      ? spec.fuelMaxLiters
      : clamp(this.pitStrategy.fuelTargetFrac * spec.fuelMaxLiters, 10, spec.fuelMaxLiters);
    const compoundChanged =
      !assists.autoPitService && this.pitStrategy.tireCompound !== this.carSetup.tireCompound;
    const needsService =
      minTireLife < 0.995 ||
      this.fuelLiters < desiredFuel * 0.98 ||
      compoundChanged ||
      this.dirtLevel > 0.05;

    let pitStatus: VehicleTelemetry['pitStatus'] = 'none';
    if (this.pitCompleteBannerTimer > 0) {
      pitStatus = 'complete';
    } else if (inPitBoxNow && speedMps < 5.8 && needsService) {
      pitStatus = 'servicing';
      if (this.pitServiceTimer === 0) {
        this.pitStartFuelLiters = this.fuelLiters;
        this.pitTargetFuelLiters = Math.max(this.fuelLiters, desiredFuel);
        const fuelDelta = Math.max(0, this.pitTargetFuelLiters - this.pitStartFuelLiters);
        this.pitServiceDurationSec = 1.65 + (fuelDelta / spec.fuelMaxLiters) * 2.1;
      }
      this.pitServiceTimer += dtTotal;
      const serviceFrac = clamp(this.pitServiceTimer / Math.max(1.2, this.pitServiceDurationSec), 0, 1);
      this.fuelLiters = lerp(this.pitStartFuelLiters, this.pitTargetFuelLiters, serviceFrac);

      if (serviceFrac >= 1.0) {
        if (!assists.autoPitService) {
          this.carSetup.tireCompound = this.pitStrategy.tireCompound;
        }
        this.tireLife = [1, 1, 1, 1];
        this.tireShredded = [false, false, false, false];
        this.tirePunctureAgeSec = [0, 0, 0, 0];
        this.tireDeflationFrac = [0, 0, 0, 0];
        this.tireGripLossPct = [0, 0, 0, 0];
        this.tirePressuresPsi = [27.5, 27.5, 27.0, 27.0];
        this.brakeTempsC = [150, 150, 140, 140];
        this.brakeFaded = [false, false, false, false];
        this.fuelLiters = this.pitTargetFuelLiters;
        this.fuelState = 'normal';
        this.engineCranking = false;
        this.powerSteeringLost = false;
        this.dirtLevel = 0;
        this.pitServiceTimer = 0;
        this.pitCompleteBannerTimer = 3.2;
        this.pitCompletePulse = 1.0;
        pitStatus = 'complete';
      }
    } else if (inPitLaneNow) {
      pitStatus = 'in_lane';
      this.pitServiceTimer = Math.max(0, this.pitServiceTimer - dtTotal * 2.0);
    } else {
      this.pitServiceTimer = 0;
    }

    // Skid marks, tire smoke & audible squeal trigger on handbrake slides, hard brake lockups, and sustained drift/burnout slip
    const maxTireSlip = Math.max(
      this.tireSlips[0],
      this.tireSlips[1],
      this.tireSlips[2],
      this.tireSlips[3],
    );
    const activeHandbrakeSkid = raceLive && this.gear !== -1 && handbrakeActive && speedMps > 2.2;
    const hardBrakeSkid =
      raceLive &&
      this.gear !== -1 &&
      rawBrakeIn > 0.78 &&
      speedMps > 6.5 &&
      maxTireSlip > 0.18
        ? clamp((maxTireSlip - 0.14) * 1.45, 0.25, 0.85)
        : 0;
    const driftSlipSkid =
      raceLive &&
      this.gear !== -1 &&
      maxTireSlip > 0.34 &&
      speedMps > 3.5
        ? clamp((maxTireSlip - 0.30) * 1.35, 0.25, 0.90)
        : 0;
    this.brakeSkidIntensity = Math.max(activeHandbrakeSkid ? 0.95 : 0, hardBrakeSkid, driftSlipSkid);

    const avgWear = 1 - (this.tireLife[0] + this.tireLife[1] + this.tireLife[2] + this.tireLife[3]) * 0.25;
    const baseSqueal = Math.max(
      activeHandbrakeSkid ? 0.72 : 0,
      hardBrakeSkid * 0.9,
      driftSlipSkid * 0.95,
    );
    this.tireSquealIntensity =
      baseSqueal > 0
        ? clamp(Math.max(baseSqueal, maxTireSlip * (0.85 + avgWear * 0.25)), 0, 1)
        : 0;

    const anyShredded =
      this.tireShredded[0] || this.tireShredded[1] || this.tireShredded[2] || this.tireShredded[3];
    this.kerbRumble =
      this.currentSurface === 'kerb'
        ? clamp(speedMps / 40, 0.15, 1.0)
        : this.currentSurface === 'offroad'
        ? clamp(speedMps / 28, 0.2, 0.85)
        : anyShredded && speedMps > 4.0
        ? clamp(speedMps / 35, 0.25, 0.8)
        : 0;

    // Yellow flags disabled during racing — keep circuit green at all times
    this.yellowHoldTimer = 0;
    this.hazardImpactTimer = 0;
    this.hazardTrackT = null;
    this.hazardReason = '';
    const flagState: 'green' | 'yellow' = 'green';

    // Drift Attack Scoring
    const slipAngleDeg =
      speedMps > 2.0
        ? Math.abs((Math.atan2(lastVLat, Math.max(Math.abs(lastVLong), 0.5)) * 180) / Math.PI)
        : 0;
    this.driftAngleDeg = Math.round(slipAngleDeg);

    if (this.raceConfig.mode === 'drift' && raceLive) {
      const validDrift =
        speedMps > 10.5 &&
        this.currentSurface !== 'offroad' &&
        slipAngleDeg >= 8 &&
        slipAngleDeg <= 76;

      if (validDrift) {
        this.driftHoldGrace = 1.05;
        this.driftChainSec += dtTotal;
        this.driftCombo =
          this.driftChainSec > 6.0 ? 4 : this.driftChainSec > 3.6 ? 3 : this.driftChainSec > 1.6 ? 2 : 1;
        const zoneBonus = this.inDriftClippingZone ? 1.5 : 1.0;
        const rate = (slipAngleDeg * 2.2 + speedMps * 4.7) * this.driftCombo * zoneBonus;
        this.driftActivePoints += rate * dtTotal;
      } else if (this.driftHoldGrace > 0) {
        this.driftHoldGrace = Math.max(0, this.driftHoldGrace - dtTotal);
        if (this.driftHoldGrace === 0 && this.driftActivePoints > 0) {
          this.driftPoints += Math.round(this.driftActivePoints);
          this.driftActivePoints = 0;
          this.driftCombo = 1;
          this.driftChainSec = 0;
        }
      }
    }

    // Tofu Delivery Fragile Water-Cup Physics
    const latJerk = dtTotal > 1e-4 ? (this.latG - this.prevLatG) / dtTotal : 0;
    this.prevLatG = this.latG;
    if (this.raceConfig.mode === 'tofu_delivery') {
      const targetCupX = clamp(this.latG * 0.72, -1.15, 1.15);
      const targetCupZ = clamp(-this.lonG * 0.65, -1.15, 1.15);
      const cupStiff = 36.0;
      const cupDamp = 6.2;
      this.tofuCupVelX += ((targetCupX - this.tofuCupTiltX) * cupStiff - this.tofuCupVelX * cupDamp) * dtTotal;
      this.tofuCupVelZ += ((targetCupZ - this.tofuCupTiltZ) * cupStiff - this.tofuCupVelZ * cupDamp) * dtTotal;
      this.tofuCupTiltX = clamp(this.tofuCupTiltX + this.tofuCupVelX * dtTotal, -1.25, 1.25);
      this.tofuCupTiltZ = clamp(this.tofuCupTiltZ + this.tofuCupVelZ * dtTotal, -1.25, 1.25);

      if (raceLive && !this.tofuFailed) {
        const fragility = this.raceConfig.tofuFragility ?? 1.0;
        const maxSafeSlip = this.raceConfig.tofuMaxSlipDeg ?? 18;
        let spillPerSec = 0;
        let reason = '';

        // 1. Sliding too hard / excessive drift angle
        if (speedMps > 6.5 && slipAngleDeg > maxSafeSlip) {
          const excess = slipAngleDeg - maxSafeSlip;
          spillPerSec += excess * 1.45 * fragility;
          reason = 'Lost traction — slid too hard and spilled the water cup!';
        }

        // 2. Snap weight-transfer jerk or extreme lateral G
        const combinedG = Math.hypot(this.latG, this.lonG);
        if (Math.abs(latJerk) > 10.5) {
          spillPerSec += (Math.abs(latJerk) - 10.5) * 1.15 * fragility;
          if (!reason) reason = 'Abrupt weight transfer snapped the water cup!';
        }
        if (combinedG > 1.38) {
          spillPerSec += (combinedG - 1.38) * 18.0 * fragility;
          if (!reason) reason = 'Cornering G-force exceeded fragile cargo limit!';
        }

        // 3. Rough offroad or heavy kerb shock (softened by Touge street suspension compliance)
        if (this.currentSurface === 'offroad' && speedMps > 5.0) {
          spillPerSec += 14.0 * eff.bumpCompliance * fragility;
          if (!reason) reason = 'Off-road jolts shook the tofu crate!';
        } else if (this.currentSurface === 'kerb' && speedMps > 14.0) {
          spillPerSec += 4.2 * eff.bumpCompliance * fragility;
        }

        // 4. Barrier / guardrail impact
        let instantSpill = 0;
        if (this.wallImpactImpulse > 0.22) {
          instantSpill = this.wallImpactImpulse * 34.0 * eff.bumpCompliance * fragility * Math.min(1, dtTotal * 12);
          reason = 'Guardrail impact shattered the water cup!';
        }

        const totalSpill = spillPerSec * dtTotal + instantSpill;
        this.tofuSpilling = totalSpill > 0.05;
        if (totalSpill > 0) {
          this.tofuIntegrityPct = clamp(this.tofuIntegrityPct - totalSpill, 0, 100);
          if (this.tofuIntegrityPct <= 0.01) {
            this.tofuIntegrityPct = 0;
            this.tofuFailed = true;
            this.tofuFailureReason = reason || 'Water cup emptied — Tofu ruined!';
            this.tofuGrade = null;
            this.raceFinished = true;
          }
        }
      } else {
        this.tofuSpilling = false;
      }
    } else {
      this.tofuSpilling = false;
    }

    // Lap & 3-Sector Timing (supports both closed circuits and point-to-point hillclimbs/sprints)
    const isClosed = this.circuit.closedLoop;
    const progress = isClosed
      ? ((finalQ.t - this.startFinishT) % 1 + 1) % 1
      : clamp((finalQ.t - this.startFinishT) / Math.max(0.05, 0.988 - this.startFinishT), 0, 1);
    const prevSector: 1 | 2 | 3 =
      this.lastProgress < 0.3333 ? 1 : this.lastProgress < 0.6667 ? 2 : 3;
    const currSector: 1 | 2 | 3 =
      progress < 0.3333 ? 1 : progress < 0.6667 ? 2 : 3;

    this.sectorRecordPulse = 0;
    if (raceLive) {
      this.lapTimeMs += dtTotal * 1000;
      this.totalRaceTimeMs += dtTotal * 1000;

      if (speedMps > 8 && this.currentSurface !== 'offroad') {
        const rubberBuild = (speedMps / 2400) * dtTotal * lerp(1.0, 0.25, wetnessRatio);
        this.rubberInProgress = clamp(this.rubberInProgress + rubberBuild, 0.08, 1.0);
      }

      const crossedClosedStart = isClosed && this.lastProgress > 0.85 && progress < 0.15;
      const crossedPointToPointStart = !isClosed && !this.crossedStartOnce && finalQ.t >= this.startFinishT;
      const crossedPointToPointFinish =
        !isClosed && this.crossedStartOnce && progress >= 0.992 && this.lastProgress < 0.992 && this.lapTimeMs > 10000;

      if (crossedPointToPointStart || (crossedClosedStart && !this.crossedStartOnce)) {
        this.crossedStartOnce = true;
        this.lapTimeMs = 0;
        this.sectorStartMs = 0;
        this.sectorTimesMs = [null, null, null];
        this.fuelUsedThisLap = 0;
        this.cleanLap = true;
        this.currentBuckets.fill(-1);
      } else if (((crossedClosedStart && this.crossedStartOnce) || crossedPointToPointFinish) && this.lapTimeMs > 12000) {
        const s3Ms = Math.round(this.lapTimeMs - this.sectorStartMs);
        this.sectorTimesMs[2] = s3Ms;
        if (this.cleanLap && (this.bestSectorTimesMs[2] === null || s3Ms < this.bestSectorTimesMs[2]!)) {
          this.bestSectorTimesMs[2] = s3Ms;
          this.sectorRecordPulse = 3;
        }
        if (this.fuelUsedThisLap > 0.2) {
          this.prevLapFuelUsed = this.fuelUsedThisLap;
        }
        this.fuelUsedThisLap = 0;
        const completedMs = Math.round(this.lapTimeMs);
        this.lastLapMs = completedMs;
        if (this.cleanLap && (this.bestLapMs === null || completedMs < this.bestLapMs)) {
          this.bestLapMs = completedMs;
          this.bestBuckets = [...this.currentBuckets];
          this.saveStoredBest();
        }

        if (!isClosed || (this.raceConfig.lapCount > 0 && this.lap >= this.raceConfig.lapCount)) {
          if (this.driftActivePoints > 0) {
            this.driftPoints += Math.round(this.driftActivePoints);
            this.driftActivePoints = 0;
          }
          this.rubberInProgress = clamp(this.rubberInProgress + 0.14, 0.08, 1.0);
          if (this.raceConfig.lapCount > 0 || !isClosed || this.raceConfig.mode === 'tofu_delivery') {
            this.playerFinishTimeMs = Math.round(this.totalRaceTimeMs);
            if (this.raceConfig.mode === 'tofu_delivery' && !this.tofuFailed) {
              const chap = getTofuChapterById(this.raceConfig.tofuChapterId);
              this.tofuGrade = evaluateTofuGrade(
                chap,
                Math.round(this.totalRaceTimeMs),
                this.tofuIntegrityPct,
              );
            }
            this.raceFinished = true;
          }
        } else {
          this.lap += 1;
          this.rubberInProgress = clamp(this.rubberInProgress + 0.14, 0.08, 1.0);
          this.lapTimeMs = 0;
          this.sectorStartMs = 0;
          this.sectorTimesMs = [null, null, null];
          this.cleanLap = true;
          this.currentBuckets.fill(-1);
        }
      } else if (this.crossedStartOnce) {
        if (prevSector === 1 && currSector === 2 && this.sectorTimesMs[0] === null) {
          const s1Ms = Math.round(this.lapTimeMs - this.sectorStartMs);
          this.sectorTimesMs[0] = s1Ms;
          this.sectorStartMs = this.lapTimeMs;
          if (this.cleanLap && (this.bestSectorTimesMs[0] === null || s1Ms < this.bestSectorTimesMs[0]!)) {
            this.bestSectorTimesMs[0] = s1Ms;
            this.sectorRecordPulse = 1;
          }
        } else if (prevSector === 2 && currSector === 3 && this.sectorTimesMs[1] === null) {
          const s2Ms = Math.round(this.lapTimeMs - this.sectorStartMs);
          this.sectorTimesMs[1] = s2Ms;
          this.sectorStartMs = this.lapTimeMs;
          if (this.cleanLap && (this.bestSectorTimesMs[1] === null || s2Ms < this.bestSectorTimesMs[1]!)) {
            this.bestSectorTimesMs[1] = s2Ms;
            this.sectorRecordPulse = 2;
          }
        }
        const bucketIdx = clamp(Math.floor(progress * DELTA_BUCKETS), 0, DELTA_BUCKETS - 1);
        if (this.currentBuckets[bucketIdx] < 0) {
          this.currentBuckets[bucketIdx] = this.lapTimeMs;
        }
      }

      // If all AI rivals finished the race in Sprint mode, end the match immediately
      if (
        this.raceConfig.mode === 'sprint' &&
        this.raceConfig.lapCount > 0 &&
        !this.raceFinished &&
        rivalsInput &&
        rivalsInput.length > 0 &&
        rivalsInput.every((rv) => Boolean(rv.finished) || rv.totalProgress >= this.raceConfig.lapCount)
      ) {
        if (this.driftActivePoints > 0) {
          this.driftPoints += Math.round(this.driftActivePoints);
          this.driftActivePoints = 0;
        }
        this.raceFinished = true;
      }
    }
    this.lastProgress = progress;

    // Live Race Position Calculation
    const playerTotalProgress = this.crossedStartOnce ? this.lap - 1 + progress : progress - 1;
    let racePosition = 1;
    const totalRacers = this.raceConfig.mode === 'sprint' && rivalsInput ? rivalsInput.length + 1 : 1;
    this.rivalListOut.length = 0;
    if (this.raceConfig.mode === 'sprint' && rivalsInput) {
      for (let i = 0; i < rivalsInput.length; i++) {
        const rv = rivalsInput[i];
        const rvFinished = Boolean(rv.finished) || (this.raceConfig.lapCount > 0 && rv.totalProgress >= this.raceConfig.lapCount);
        const playerFinishedFlag = this.playerFinishTimeMs !== null;
        if (
          (rvFinished && !playerFinishedFlag) ||
          (rvFinished && playerFinishedFlag && (rv.finishTimeMs ?? Number.MAX_SAFE_INTEGER) < this.playerFinishTimeMs!) ||
          (!rvFinished && !playerFinishedFlag && rv.totalProgress > playerTotalProgress)
        ) {
          racePosition += 1;
        }
        this.rivalListOut.push({
          id: rv.id,
          name: rv.name,
          color: rv.color,
          posX: rv.x,
          posZ: rv.z,
          trackT: rv.trackT,
        });
      }
    }

    if (this.raceFinished && !this.finishSummary) {
      const leaderboard: LeaderboardEntry[] = [];
      if (this.raceConfig.mode === 'sprint' && rivalsInput && rivalsInput.length > 0) {
        const playerCompleted = this.playerFinishTimeMs !== null;
        const targetLaps = Math.max(1, this.raceConfig.lapCount);
        const racers = [
          {
            name: 'You (Player)',
            carName: spec.shortName,
            isPlayer: true,
            color: '#38bdf8',
            finished: playerCompleted,
            finishTimeMs: this.playerFinishTimeMs,
            totalProgress: playerCompleted ? Math.max(targetLaps, playerTotalProgress) : playerTotalProgress,
            bestLapMs: this.bestLapMs,
          },
          ...rivalsInput.map((rv, idx) => {
            const rvFin = Boolean(rv.finished) || (this.raceConfig.lapCount > 0 && rv.totalProgress >= this.raceConfig.lapCount);
            return {
              name: rv.name,
              carName: rv.carName ?? '2020 Audi R8 LMS Evo',
              isPlayer: false,
              color: rv.color,
              finished: rvFin,
              finishTimeMs: rv.finishTimeMs ?? (rvFin ? Math.round(this.totalRaceTimeMs) : null),
              totalProgress: rv.totalProgress,
              bestLapMs: this.bestLapMs
                ? Math.round(this.bestLapMs * (1.015 + idx * 0.012))
                : Math.round((this.totalRaceTimeMs / Math.max(1, targetLaps)) * (1.01 + idx * 0.015)),
            };
          }),
        ].sort((a, b) => {
          if (a.finished !== b.finished) return a.finished ? -1 : 1;
          if (a.finished && b.finished && a.finishTimeMs !== null && b.finishTimeMs !== null) {
            return a.finishTimeMs - b.finishTimeMs;
          }
          if (b.totalProgress !== a.totalProgress) return b.totalProgress - a.totalProgress;
          return a.isPlayer ? -1 : 1;
        });

        const playerRankIdx = racers.findIndex((r) => r.isPlayer);
        if (playerRankIdx >= 0) {
          racePosition = playerRankIdx + 1;
        }

        const leader = racers[0];
        const leaderProg = leader.totalProgress;
        const leaderTimeMs = leader.finishTimeMs ?? Math.round(this.totalRaceTimeMs);
        const avgLapMs =
          this.bestLapMs ?? this.totalRaceTimeMs / Math.max(1, this.crossedStartOnce ? Math.max(0.35, playerTotalProgress) : 1);

        racers.forEach((r, i) => {
          const progGap = Math.max(0, leaderProg - r.totalProgress);
          let gapText = 'LEADER';
          let entryTimeMs = Math.round(this.totalRaceTimeMs);
          if (i === 0) {
            entryTimeMs = leaderTimeMs;
            gapText = 'LEADER';
          } else if (leader.finished && r.finished && r.finishTimeMs !== null && leader.finishTimeMs !== null) {
            const gapMs = Math.max(1, r.finishTimeMs - leader.finishTimeMs);
            entryTimeMs = r.finishTimeMs;
            gapText = `+${(gapMs / 1000).toFixed(3)}s`;
          } else if (!r.finished && progGap >= 1.0) {
            const lapsDown = Math.floor(progGap);
            gapText = lapsDown === 1 ? '+1 LAP' : `+${lapsDown} LAPS`;
            entryTimeMs = Math.round(this.totalRaceTimeMs);
          } else {
            const estGapMs = Math.round(progGap * avgLapMs);
            entryTimeMs = r.finishTimeMs ?? Math.round(leaderTimeMs + estGapMs);
            gapText = `+${(estGapMs / 1000).toFixed(3)}s`;
          }
          leaderboard.push({
            position: i + 1,
            name: r.name,
            carName: r.carName,
            isPlayer: r.isPlayer,
            color: r.color,
            bestLapMs: r.bestLapMs,
            totalTimeMs: entryTimeMs,
            gapText,
          });
        });
      } else {
        leaderboard.push({
          position: 1,
          name: 'You (Player)',
          carName: spec.shortName,
          isPlayer: true,
          color: '#38bdf8',
          bestLapMs: this.bestLapMs,
          totalTimeMs: Math.round(this.totalRaceTimeMs),
          gapText: 'FINISHED',
          driftPoints: this.raceConfig.mode === 'drift' ? this.driftPoints : undefined,
        });
      }

      this.finishSummary = {
        mode: this.raceConfig.mode,
        totalTimeMs: Math.round(this.totalRaceTimeMs),
        bestLapMs: this.bestLapMs,
        lapCount: this.raceConfig.lapCount,
        position: racePosition,
        totalRacers,
        driftPoints: this.driftPoints,
        speedTrapRecordKmh: this.speedTrapRecordKmh,
        leaderboard,
        ...(this.raceConfig.mode === 'tofu_delivery'
          ? {
              tofuIntegrityPct: Math.round(this.tofuIntegrityPct),
              tofuGrade: this.tofuFailed
                ? undefined
                : (this.tofuGrade ??
                  evaluateTofuGrade(
                    getTofuChapterById(this.raceConfig.tofuChapterId),
                    Math.round(this.totalRaceTimeMs),
                    this.tofuIntegrityPct,
                  )),
              tofuFailed: this.tofuFailed,
              tofuFailureReason: this.tofuFailureReason || undefined,
              tofuChapterId: this.raceConfig.tofuChapterId,
              tofuChapterRewardCr: this.raceConfig.tofuChapterRewardCr,
            }
          : {}),
      };
    }

    let deltaMs: number | null = null;
    if (this.crossedStartOnce && this.bestBuckets) {
      const bucketIdx = clamp(Math.floor(progress * DELTA_BUCKETS), 0, DELTA_BUCKETS - 1);
      const refTime = this.bestBuckets[bucketIdx];
      if (refTime > 0) {
        deltaMs = Math.round(this.lapTimeMs - refTime);
      }
    }

    let countdownLabel = '';
    if (this.countdownTimer > 2.2) countdownLabel = '3';
    else if (this.countdownTimer > 1.2) countdownLabel = '2';
    else if (this.countdownTimer > 0.2) countdownLabel = '1';
    else if (this.countdownTimer > 0.001) countdownLabel = 'START';

    const avgTireLifePct = Math.round(
      (this.tireLife[0] + this.tireLife[1] + this.tireLife[2] + this.tireLife[3]) * 25,
    );
    const minTireLifePct = Math.round(minTireLife * 100);
    const fuelPct = Number(clamp((this.fuelLiters / Math.max(1, spec.fuelMaxLiters)) * 100, 0, 100).toFixed(1));
    const estBurnPerLap =
      this.prevLapFuelUsed > 0.2
        ? this.prevLapFuelUsed
        : this.crossedStartOnce && progress > 0.18 && this.fuelUsedThisLap > 0.2
        ? this.fuelUsedThisLap / progress
        : stintEcon.consumptionPerLap * mapFuelScale;
    const fuelLapsEst =
      estBurnPerLap > 0.05 ? Number((this.fuelLiters / estBurnPerLap).toFixed(1)) : null;
    const pitRequired = minTireLifePct <= 24 || fuelPct <= 18;
    const pitOverspeed = inPitLaneNow && speedKmh > 84;
    const shreddedCount =
      (this.tireShredded[0] ? 1 : 0) +
      (this.tireShredded[1] ? 1 : 0) +
      (this.tireShredded[2] ? 1 : 0) +
      (this.tireShredded[3] ? 1 : 0);
    const brakeFadeCount =
      (this.brakeFaded[0] ? 1 : 0) +
      (this.brakeFaded[1] ? 1 : 0) +
      (this.brakeFaded[2] ? 1 : 0) +
      (this.brakeFaded[3] ? 1 : 0);

    const makeCornerTlm = (idx: 0 | 1 | 2 | 3): TireCornerTelemetry => ({
      loadNorm: this.tireLoads[idx],
      gripLossPct: this.tireGripLossPct[idx],
      slip: this.tireSlips[idx],
      lifePct: Math.round(this.tireLife[idx] * 100),
      kappa: Number(this.kappaLag[idx].toFixed(3)),
      alphaDeg: Number(this.alphaDegOut[idx].toFixed(1)),
      travelMm: Number(this.wheelTravelMm[idx].toFixed(1)),
      normalFzN: Math.round(this.wheelNormalFz[idx]),
      grounded: this.wheelGrounded[idx],
      brakeTempC: Math.round(this.brakeTempsC[idx]),
      brakeFaded: this.brakeFaded[idx],
      shredded: this.tireShredded[idx],
      deflationFrac: Number(this.tireDeflationFrac[idx].toFixed(2)),
    });

    const groundedCountNow =
      (this.wheelGrounded[0] ? 1 : 0) +
      (this.wheelGrounded[1] ? 1 : 0) +
      (this.wheelGrounded[2] ? 1 : 0) +
      (this.wheelGrounded[3] ? 1 : 0);

    const activeBaseR = this.gear >= 1 ? (spec.gearRatios[this.gear + 1] ?? 1.0) : 0;
    const activeRatio = this.gear > 1 ? activeBaseR * eff.gearRatioScale : activeBaseR;
    const gearMaxSpeedKmh =
      this.gear >= 1 && Math.abs(activeRatio) > 0.05
        ? Math.round(((eff.redlineRpm / 60) / (Math.abs(activeRatio) * eff.finalDrive)) * 2 * Math.PI * spec.wheelRadius * 3.6)
        : this.gear === -1
          ? 36
          : 0;

    const outTelemetry: VehicleTelemetry = {
      speedKmh,
      speedMps,
      rpm: Math.round(this.rpm),
      redlineRpm: eff.redlineRpm,
      gear: this.gear,
      gearMaxSpeedKmh,
      throttle: this.throttleSmooth,
      brake: this.brakeSmooth,
      steerNorm: clamp(this.steerAngle / spec.maxSteerRad, -1, 1),
      handbrake: handbrakeActive,
      isBraking: this.brakeSkidIntensity > 0.02,
      latG: this.latG,
      lonG: this.lonG,
      absActive: this.absActive,
      tcsActive: this.tcsActive,
      shiftFlash: this.rpm > eff.shiftFlashRpm && this.gear >= 1,
      surface: this.currentSurface,
      audioSurface: this.lastAudioSurface,
      activeAeroEnabled: aeroMode !== 'off',
      activeAeroMode: aeroMode,
      aeroDeployed: aeroMode !== 'off' && this.aeroDeployed,
      slopeGradePct: this.lastSlopeGradePct,
      gripPct: avgGripPct,
      avgTireLifePct,
      minTireLifePct,
      tireCompoundShort: compound.shortLabel,
      fuelLiters: Number(this.fuelLiters.toFixed(1)),
      fuelMaxLiters: spec.fuelMaxLiters,
      fuelPct,
      fuelLapsEst,
      fuelState: this.fuelState,
      engineCranking: this.engineCranking,
      powerSteeringLost: this.powerSteeringLost,
      stintLapsTarget: Number(stintEcon.lapsPerStint.toFixed(1)),
      stintFuelPerLap: Number(stintEcon.consumptionPerLap.toFixed(1)),
      stintWearPerLapPct: Number((stintEcon.wearPerLap * 100).toFixed(1)),
      pitRequired,
      pitOverspeed,
      oilTempC: Number(this.oilTempC.toFixed(1)),
      waterTempC: Number(this.waterTempC.toFixed(1)),
      tirePressuresPsi: [
        Number(this.tirePressuresPsi[0].toFixed(1)),
        Number(this.tirePressuresPsi[1].toFixed(1)),
        Number(this.tirePressuresPsi[2].toFixed(1)),
        Number(this.tirePressuresPsi[3].toFixed(1)),
      ],
      wheelSlips: [
        Number(this.tireSlips[0].toFixed(3)),
        Number(this.tireSlips[1].toFixed(3)),
        Number(this.tireSlips[2].toFixed(3)),
        Number(this.tireSlips[3].toFixed(3)),
      ],
      bodyHeave: this.bodyHeave,
      downforceKgf: this.downforceKgf,
      lsdLockPct: Math.round(this.lsdLockPct),
      ffbTorqueNorm: this.ffbTorqueNorm,
      shreddedCount,
      brakeFadeCount,
      cockpitDials: { ...this.cockpitDials },
      pitStrategy: { ...this.pitStrategy },
      speedTrapKmh: this.speedTrapKmh,
      speedTrapRecordKmh: this.speedTrapRecordKmh,
      inDriftClippingZone: this.inDriftClippingZone,
      tires: {
        fl: makeCornerTlm(0),
        fr: makeCornerTlm(1),
        rl: makeCornerTlm(2),
        rr: makeCornerTlm(3),
      },
      lap: this.lap,
      lapTimeMs: Math.round(this.lapTimeMs),
      lastLapMs: this.lastLapMs,
      bestLapMs: this.bestLapMs,
      sector: currSector,
      sectorTimesMs: [...this.sectorTimesMs] as [number | null, number | null, number | null],
      sectorRecordPulse: this.sectorRecordPulse,
      deltaMs,
      cleanLap: this.cleanLap,
      countdownSec: this.countdownTimer,
      countdownLabel,
      trackT: this.currentTrackT,
      posX: this.pos.x,
      posZ: this.pos.z,
      headingRad: this.yaw,
      flagState,
      hazardTrackT: this.hazardTrackT,
      hazardReason: this.hazardReason,
      pitStatus,
      pitServiceProgress: clamp(this.pitServiceTimer / Math.max(1.2, this.pitServiceDurationSec), 0, 1),
      pitCompletePulse: this.pitCompletePulse,
      dirtLevel: this.dirtLevel,
      rubberInProgress: this.rubberInProgress,
      wallImpactImpulse: this.wallImpactImpulse,
      wallScrapeIntensity: this.wallScrapeIntensity,
      tireSquealIntensity: this.tireSquealIntensity,
      kerbRumble: this.kerbRumble,
      gearShiftPulse: this.gearShiftPulse,
      turboBlowOffPulse: this.turboBlowOffPulse,
      brakeSkidIntensity: this.brakeSkidIntensity,
      sparkEvents: this.pendingSparkEvents,
      gameMode: this.raceConfig.mode,
      lapTarget: this.raceConfig.lapCount,
      racePosition,
      totalRacers,
      rivals: this.rivalListOut.slice(),
      driftPoints: this.driftPoints,
      driftActivePoints: Math.round(this.driftActivePoints),
      driftCombo: this.driftCombo,
      driftAngleDeg: this.driftAngleDeg,
      tofuIntegrityPct: Math.round(this.tofuIntegrityPct),
      tofuCupTiltX: this.tofuCupTiltX,
      tofuCupTiltZ: this.tofuCupTiltZ,
      tofuSpilling: this.tofuSpilling,
      tofuFailed: this.tofuFailed,
      tofuFailureReason: this.tofuFailureReason,
      tofuGrade: this.tofuGrade,
      ghostActive: this.ghostActive,
      ghostName: this.ghostName,
      ghostDeltaSec: this.ghostDeltaSec,
      ghostGapMeters: this.ghostGapMeters,
      tandemPartnerUsername: this.tandemPartnerUsername,
      tandemRole: this.tandemRole,
      tandemMultiplier: this.tandemMultiplier,
      tandemBonusPoints: Math.round(this.tandemBonusPoints),
      raceFinished: this.raceFinished,
      finishSummary: this.finishSummary,
      carId: this.carId,
      carName: spec.shortName,
      diagnostics: {
        chassisHz: CHASSIS_HZ,
        tireSubstepHz: CHASSIS_HZ * TIRE_SUBSTEPS,
        substepsPerChassis: TIRE_SUBSTEPS,
        forceCombination: 'averaged_substep_forces',
        lastStepCpuMs: Number(this.lastStepCpuMs.toFixed(3)),
        maxStepCpuMs: Number(this.maxStepCpuMs.toFixed(3)),
        groundedWheels: [...this.wheelGrounded] as [boolean, boolean, boolean, boolean],
        groundedCount: groundedCountNow,
        clutchEngage: Number(this.clutchEngage.toFixed(2)),
        escTorqueNm: Math.round(this.lastEscTorqueNm),
        rolloverSsf: Number(this.rolloverSsf.toFixed(2)),
        rolloverRiskRatio: Number(this.rolloverRiskRatio.toFixed(2)),
        rolloverWarning: this.rolloverWarning,
        physicsPreset: this.lastPhysicsPreset,
        determinismWarning: NON_DETERMINISTIC_MATH_WARNING,
        cornerFzN: [
          Math.round(this.wheelNormalFz[0]),
          Math.round(this.wheelNormalFz[1]),
          Math.round(this.wheelNormalFz[2]),
          Math.round(this.wheelNormalFz[3]),
        ],
        testMode: this.testModeEnabled,
        bottomingEvents: this.bottomingEventsCount,
        govCapDeg: Number(this.lastGovCapDeg.toFixed(2)),
        cstAssistDeg: Number(this.lastCstAssistDeg.toFixed(2)),
        slipBodyDeg: Number(this.lastSlipBodyDeg.toFixed(2)),
      },
    };

    if (raceLive) {
      this.csvLogger.maybeRecord(dtTotal, outTelemetry);
    }

    this.lastTelemetryCache = outTelemetry;
    return outTelemetry;
  }

  public setGhostTelemetry(
    active: boolean,
    name: string,
    deltaSec: number | null,
    gapMeters: number | null,
  ) {
    this.ghostActive = active;
    this.ghostName = name;
    this.ghostDeltaSec = deltaSec;
    this.ghostGapMeters = gapMeters;
  }

  public setTandemTelemetry(
    partnerUsername: string | null,
    role: 'LEAD' | 'CHASE' | null,
    multiplier: number,
    bonusPointsDelta: number,
  ) {
    this.tandemPartnerUsername = partnerUsername;
    this.tandemRole = role;
    this.tandemMultiplier = multiplier;
    if (bonusPointsDelta > 0) {
      this.tandemBonusPoints += bonusPointsDelta;
      this.driftPoints += Math.round(bonusPointsDelta);
    }
  }
}
