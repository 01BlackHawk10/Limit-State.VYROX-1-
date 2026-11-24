import { clamp } from './mathNoise';
import type { AnyCarSpecId } from '../shared/carTypes';
import type { CarSetupConfig, VehicleSpecProfile } from './vehiclePhysics';

export type PartCategoryId =
  | 'engine_swap'
  | 'intake'
  | 'exhaust'
  | 'ecu_turbo'
  | 'cooling'
  | 'suspension'
  | 'brakes'
  | 'drivetrain'
  | 'wheels'
  | 'weight'
  | 'aero';

export const PART_CATEGORY_LABELS: Record<PartCategoryId, string> = {
  engine_swap: 'Engine Swap',
  intake: 'Intake & Plenum',
  exhaust: 'Exhaust System',
  ecu_turbo: 'ECU & Induction',
  cooling: 'Cooling Package',
  suspension: 'Suspension',
  brakes: 'Braking Hardware',
  drivetrain: 'Drivetrain & Diff',
  wheels: 'Forged Wheels',
  weight: 'Weight Reduction',
  aero: 'Aerodynamics',
};

export interface CarPartSpec {
  id: string;
  category: PartCategoryId;
  name: string;
  tier: 'OEM' | 'Club' | 'GT3 Race' | 'Endurance Pro';
  costCredits: number;
  weightDeltaKg: number;
  // Physical dimensions for fitment & clearance checks
  wheelDiameterIn?: number; // e.g. 18, 19, 20
  wheelWidthMm?: number;    // e.g. 285, 315, 335
  wheelOffsetMm?: number;   // ET offset
  wheelInertiaMult?: number; // rotational inertia multiplier (1.0 stock)
  rotorDiameterMm?: number; // e.g. 380, 396, 410
  wingSpanMm?: number;
  // Physics modifiers & engineering tradeoffs
  powerMult: number;
  lowEndTorqueMult: number;
  topEndTorqueMult: number;
  redlineDeltaRpm: number;
  spoolSpeedMult: number;
  heatFactor: number;       // engine oil/water thermal load multiplier
  fuelBurnMult: number;     // fuel burn multiplier
  springStiffMult: number;
  dampingMult: number;
  brakeTorqueMult: number;
  fadeLimitDeltaC: number;
  coolingRateMult: number;  // radiator & brake duct cooling multiplier
  downforceDelta: number;   // additive multiplier (e.g. +0.16)
  dragDelta: number;        // additive CdA scale (e.g. +0.07)
  reliabilityPct: number;   // 70..100
  drivetrainTorqueCapNm?: number;
  steeringLockBonusRad?: number; // extra front steering lock angle (drift/touge coilovers)
  bumpCompliance?: number;       // 1.0 stock; >1 softens touge gutter/bump shock
  summary: string;
}

export const DEFAULT_EQUIPPED_PARTS: Record<PartCategoryId, string> = {
  engine_swap: 'swap_oem',
  intake: 'intake_oem',
  exhaust: 'exhaust_oem',
  ecu_turbo: 'ecu_oem',
  cooling: 'cooling_oem',
  suspension: 'susp_oem',
  brakes: 'brakes_oem',
  drivetrain: 'drive_oem',
  wheels: 'wheels_oem_19',
  weight: 'weight_oem',
  aero: 'aero_oem',
};

export const PARTS_CATALOG: CarPartSpec[] = [
  // Engine Swaps
  {
    id: 'swap_oem',
    category: 'engine_swap',
    name: 'OEM Factory Powertrain',
    tier: 'OEM',
    costCredits: 0,
    weightDeltaKg: 0,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 100,
    summary: 'Original matching-numbers block and internal rotating assembly.',
  },
  {
    id: 'swap_4age_20v',
    category: 'engine_swap',
    name: 'TRD Group-A 4A-GE 20V Silvertop (11,000 RPM)',
    tier: 'Club',
    costCredits: 0,
    weightDeltaKg: -14.0,
    powerMult: 1.38,
    lowEndTorqueMult: 0.96,
    topEndTorqueMult: 1.46,
    redlineDeltaRpm: 3200,
    spoolSpeedMult: 1.18,
    heatFactor: 1.08,
    fuelBurnMult: 1.12,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.02,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 95,
    summary: 'Formula Atlantic dry-sump 20V twin-cam with titanium rods; screams to 11,000 RPM (-14 kg).',
  },
  {
    id: 'swap_f20c',
    category: 'engine_swap',
    name: 'Honda F20C 2.0L High-Rev I4 (9,000 RPM)',
    tier: 'Club',
    costCredits: 0,
    weightDeltaKg: 4.0,
    powerMult: 1.52,
    lowEndTorqueMult: 1.06,
    topEndTorqueMult: 1.44,
    redlineDeltaRpm: 1600,
    spoolSpeedMult: 1.14,
    heatFactor: 1.07,
    fuelBurnMult: 1.14,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 96,
    summary: 'Razor-sharp VTEC naturally aspirated response with 9,000 RPM top-end pull.',
  },
  {
    id: 'swap_sr20det',
    category: 'engine_swap',
    name: 'Nissan SR20DET Blacktop Turbo I4',
    tier: 'GT3 Race',
    costCredits: 0,
    weightDeltaKg: 16.0,
    powerMult: 1.85,
    lowEndTorqueMult: 1.24,
    topEndTorqueMult: 1.72,
    redlineDeltaRpm: 450,
    spoolSpeedMult: 0.94,
    heatFactor: 1.18,
    fuelBurnMult: 1.24,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 92,
    summary: 'Classic drift-spec aluminum turbo four (+85% power) for effortless rear wheelspin.',
  },
  {
    id: 'swap_13b_rew',
    category: 'engine_swap',
    name: 'Mazda 13B-REW Sequential Twin-Rotor',
    tier: 'GT3 Race',
    costCredits: 0,
    weightDeltaKg: -18.0,
    powerMult: 1.92,
    lowEndTorqueMult: 0.92,
    topEndTorqueMult: 1.86,
    redlineDeltaRpm: 1500,
    spoolSpeedMult: 1.06,
    heatFactor: 1.26,
    fuelBurnMult: 1.32,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 0.95,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 87,
    summary: 'Ultra-light mid-front rotary (-18 kg) with explosive 9,000 RPM boost and high thermal load.',
  },
  {
    id: 'swap_2jz_gte',
    category: 'engine_swap',
    name: 'Toyota 2JZ-GTE 3.0L Single-Turbo Inline-6',
    tier: 'Endurance Pro',
    costCredits: 0,
    weightDeltaKg: 58.0,
    powerMult: 2.35,
    lowEndTorqueMult: 1.22,
    topEndTorqueMult: 2.15,
    redlineDeltaRpm: 550,
    spoolSpeedMult: 0.84,
    heatFactor: 1.28,
    fuelBurnMult: 1.38,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 0.96,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 89,
    summary: 'Cast-iron monster inline-6 (+135% power); adds +58 kg over the front axle.',
  },

  // Intake
  {
    id: 'intake_oem',
    category: 'intake',
    name: 'OEM Carbon Airbox',
    tier: 'OEM',
    costCredits: 0,
    weightDeltaKg: 0,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 100,
    summary: 'Factory balanced plenum with clean throttle response.',
  },
  {
    id: 'intake_highflow',
    category: 'intake',
    name: 'High-Flow Carbon Trumpet Plenum',
    tier: 'GT3 Race',
    costCredits: 0,
    weightDeltaKg: -3.5,
    powerMult: 1.035,
    lowEndTorqueMult: 0.98,
    topEndTorqueMult: 1.055,
    redlineDeltaRpm: 150,
    spoolSpeedMult: 1.06,
    heatFactor: 1.02,
    fuelBurnMult: 1.03,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 98,
    summary: 'Trades minor sub-3000 RPM velocity for sharp high-RPM breathing (-3.5 kg).',
  },

  // Exhaust
  {
    id: 'exhaust_oem',
    category: 'exhaust',
    name: 'OEM Inconel Exhaust',
    tier: 'OEM',
    costCredits: 0,
    weightDeltaKg: 0,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 100,
    summary: 'Factory GT thermal-shielded inconel system.',
  },
  {
    id: 'exhaust_ti_race',
    category: 'exhaust',
    name: 'Titanium Straight-Pipe Race Header',
    tier: 'Endurance Pro',
    costCredits: 0,
    weightDeltaKg: -11.0,
    powerMult: 1.045,
    lowEndTorqueMult: 1.01,
    topEndTorqueMult: 1.065,
    redlineDeltaRpm: 100,
    spoolSpeedMult: 1.12,
    heatFactor: 1.06,
    fuelBurnMult: 1.04,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 95,
    summary: 'Cuts rear overhang weight by 11 kg and speeds turbo spool (+6% thermal load).',
  },

  // ECU & Turbo
  {
    id: 'ecu_oem',
    category: 'ecu_turbo',
    name: 'OEM Motorsport Calibration',
    tier: 'OEM',
    costCredits: 0,
    weightDeltaKg: 0,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 100,
    summary: 'Homologated factory boost map and conservative knock margins.',
  },
  {
    id: 'ecu_club_remap',
    category: 'ecu_turbo',
    name: 'Stage 1 Clubsport ECU Remap',
    tier: 'Club',
    costCredits: 0,
    weightDeltaKg: 0,
    powerMult: 1.065,
    lowEndTorqueMult: 1.07,
    topEndTorqueMult: 1.055,
    redlineDeltaRpm: 150,
    spoolSpeedMult: 1.04,
    heatFactor: 1.10,
    fuelBurnMult: 1.08,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 94,
    summary: 'Broad mid-range boost increase; raises fuel burn (+8%) and oil heat (+10%).',
  },
  {
    id: 'ecu_big_turbo',
    category: 'ecu_turbo',
    name: 'Ball-Bearing High-Boost Twin Turbos',
    tier: 'Endurance Pro',
    costCredits: 0,
    weightDeltaKg: 5.5,
    powerMult: 1.14,
    lowEndTorqueMult: 0.91,
    topEndTorqueMult: 1.18,
    redlineDeltaRpm: 300,
    spoolSpeedMult: 0.82,
    heatFactor: 1.24,
    fuelBurnMult: 1.15,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 86,
    summary: '+14% peak power & +300 RPM ceiling, but slower spool lag, +15% fuel burn & +24% heat.',
  },

  // Cooling
  {
    id: 'cooling_oem',
    category: 'cooling',
    name: 'OEM Twin Side Radiators',
    tier: 'OEM',
    costCredits: 0,
    weightDeltaKg: 0,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 100,
    summary: 'Factory radiator & brake duct airflow sufficient for OEM boost.',
  },
  {
    id: 'cooling_endurance',
    category: 'cooling',
    name: 'Endurance Triple-Core Radiator & Ducts',
    tier: 'Endurance Pro',
    costCredits: 0,
    weightDeltaKg: 6.8,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 0.78,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 35,
    coolingRateMult: 1.32,
    downforceDelta: 0,
    dragDelta: 0.015,
    reliabilityPct: 100,
    summary: '+32% thermal rejection for high-boost setups (+6.8 kg nose weight, +0.015 drag).',
  },

  // Suspension
  {
    id: 'susp_oem',
    category: 'suspension',
    name: 'OEM MonoCell Coilovers',
    tier: 'OEM',
    costCredits: 0,
    weightDeltaKg: 0,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 100,
    summary: 'Balanced GT damper valving suitable for bumpy kerbs.',
  },
  {
    id: 'susp_ohlins_ttx',
    category: 'suspension',
    name: 'Ohlins TTX36 4-Way Motorsport Coilovers',
    tier: 'GT3 Race',
    costCredits: 0,
    weightDeltaKg: -4.2,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.14,
    dampingMult: 1.16,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 97,
    summary: 'Sharper platform control & -4.2 kg unsprung mass; firmer over tall kerbs.',
  },
  {
    id: 'susp_touge_street',
    category: 'suspension',
    name: 'Touge Spec Progressive Street Coilovers',
    tier: 'Club',
    costCredits: 0,
    weightDeltaKg: -2.0,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 0.92,
    dampingMult: 1.08,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 99,
    bumpCompliance: 1.24,
    summary: 'Compliant touge valving absorbs gutters & mountain crests (+24% bump compliance) for Tofu stability.',
  },
  {
    id: 'susp_drift_angle',
    category: 'suspension',
    name: 'D-Spec High-Angle Knuckle & Drift Coilovers',
    tier: 'GT3 Race',
    costCredits: 0,
    weightDeltaKg: -3.2,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.08,
    dampingMult: 1.12,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 96,
    steeringLockBonusRad: 0.17,
    bumpCompliance: 1.08,
    summary: 'Modified steering knuckles add +10° max steering lock for deep tandem countersteer saves.',
  },

  // Brakes
  {
    id: 'brakes_oem',
    category: 'brakes',
    name: 'OEM 380mm Slotted Steel Rotors',
    tier: 'OEM',
    costCredits: 0,
    weightDeltaKg: 0,
    rotorDiameterMm: 380,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 100,
    summary: '380mm iron discs; fits 18" and larger wheels cleanly.',
  },
  {
    id: 'brakes_gt3_396',
    category: 'brakes',
    name: 'AP Racing 396mm Endurance Iron Kit',
    tier: 'GT3 Race',
    costCredits: 0,
    weightDeltaKg: -2.0,
    rotorDiameterMm: 396,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.09,
    fadeLimitDeltaC: 90,
    coolingRateMult: 1.08,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 98,
    summary: '+9% peak bite and +90°C fade margin. Clears 19"+ forged wheels.',
  },
  {
    id: 'brakes_ccm_410',
    category: 'brakes',
    name: '410mm Carbon-Ceramic Monoblock Kit',
    tier: 'Endurance Pro',
    costCredits: 0,
    weightDeltaKg: -13.5,
    rotorDiameterMm: 410,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.16,
    fadeLimitDeltaC: 190,
    coolingRateMult: 1.12,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 96,
    summary: '-13.5 kg rotating unsprung mass & massive fade resistance; requires 19"+ wheels.',
  },

  // Drivetrain
  {
    id: 'drive_oem',
    category: 'drivetrain',
    name: 'OEM Ricardo Sequential & Plate LSD',
    tier: 'OEM',
    costCredits: 0,
    weightDeltaKg: 0,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 100,
    drivetrainTorqueCapNm: 890,
    summary: 'Rated to 890 Nm combined torque with crisp 55ms upshifts.',
  },
  {
    id: 'drive_carbon_shaft',
    category: 'drivetrain',
    name: 'Carbon Prop Shaft & Billet Salisbury LSD',
    tier: 'Endurance Pro',
    costCredits: 0,
    weightDeltaKg: -8.5,
    powerMult: 1.015,
    lowEndTorqueMult: 1.02,
    topEndTorqueMult: 1.02,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.05,
    heatFactor: 1.0,
    fuelBurnMult: 0.99,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 99,
    drivetrainTorqueCapNm: 1200,
    summary: 'Cuts parasitic loss (+1.5% wheel power), saves 8.5 kg, rated to 1,200 Nm.',
  },

  // Wheels
  {
    id: 'wheels_oem_19',
    category: 'wheels',
    name: '19" Centerlock Cast Alloy (ET28)',
    tier: 'OEM',
    costCredits: 0,
    weightDeltaKg: 0,
    wheelDiameterIn: 19,
    wheelWidthMm: 305,
    wheelOffsetMm: 28,
    wheelInertiaMult: 1.0,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 100,
    summary: '19x11J ET28 wheel clearing all 380–410mm GT brake packages.',
  },
  {
    id: 'wheels_club_18',
    category: 'wheels',
    name: '18" Lightweight Sidewall Sprint Wheel (ET24)',
    tier: 'Club',
    costCredits: 0,
    weightDeltaKg: -6.4,
    wheelDiameterIn: 18,
    wheelWidthMm: 295,
    wheelOffsetMm: 24,
    wheelInertiaMult: 0.86,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 0.99,
    springStiffMult: 0.97,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 0.96,
    downforceDelta: 0,
    dragDelta: -0.01,
    reliabilityPct: 98,
    summary: '-14% rotational inertia & nimble 18" gearing; clears 380mm brakes only.',
  },
  {
    id: 'wheels_gt3_wide_19',
    category: 'wheels',
    name: '19" Forged Centerlock Slick (325mm ET18)',
    tier: 'GT3 Race',
    costCredits: 0,
    weightDeltaKg: -7.8,
    wheelDiameterIn: 19,
    wheelWidthMm: 325,
    wheelOffsetMm: 18,
    wheelInertiaMult: 0.88,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.02,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.05,
    downforceDelta: 0.01,
    dragDelta: 0.008,
    reliabilityPct: 97,
    summary: '325mm wide contact patch (-12% inertia, +1.6% mechanical grip); clears 410mm carbon brakes.',
  },
  {
    id: 'wheels_forged_20_wide',
    category: 'wheels',
    name: '20" Forged Magnesium Wide-Track (335mm ET14)',
    tier: 'Endurance Pro',
    costCredits: 0,
    weightDeltaKg: -9.2,
    wheelDiameterIn: 20,
    wheelWidthMm: 335,
    wheelOffsetMm: 14,
    wheelInertiaMult: 0.90,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.01,
    springStiffMult: 1.03,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.08,
    downforceDelta: 0.02,
    dragDelta: 0.015,
    reliabilityPct: 96,
    summary: 'Maximum 335mm grip (+2.4%) & tall 20" gearing; low ET14 risks fender rub below 55mm.',
  },

  // Chassis & Weight Reduction
  {
    id: 'weight_oem',
    category: 'weight',
    name: 'OEM Homologated Chassis Tub',
    tier: 'OEM',
    costCredits: 0,
    weightDeltaKg: 0,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 100,
    summary: 'Factory curb specification ballast and sound deadening.',
  },
  {
    id: 'weight_club_carbon',
    category: 'weight',
    name: 'Stage 1 Carbon Doors & Lexan Windows (-45 kg)',
    tier: 'Club',
    costCredits: 0,
    weightDeltaKg: -45,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 0.98,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.02,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 99,
    summary: 'Polycarbonate glazing and carbon doors trim 45 kg top weight.',
  },
  {
    id: 'weight_gt_tub',
    category: 'weight',
    name: 'Stage 2 Kevlar Bulkhead & Lithium Pack (-95 kg)',
    tier: 'GT3 Race',
    costCredits: 0,
    weightDeltaKg: -95,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 0.96,
    springStiffMult: 1.02,
    dampingMult: 1.02,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.04,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 97,
    summary: 'Stripped interior loom, titanium fasteners & carbon subframes (-95 kg).',
  },
  {
    id: 'weight_dry_carbon',
    category: 'weight',
    name: 'Stage 3 Full Pre-Preg Dry Carbon Body Shell (-145 kg)',
    tier: 'Endurance Pro',
    costCredits: 0,
    weightDeltaKg: -145,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.02,
    fuelBurnMult: 0.94,
    springStiffMult: 1.05,
    dampingMult: 1.04,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.06,
    downforceDelta: 0.02,
    dragDelta: 0,
    reliabilityPct: 93,
    summary: 'Extreme autoclaved dry-carbon clamshells & ballast removal (-145 kg).',
  },

  // Aero
  {
    id: 'aero_oem',
    category: 'aero',
    name: 'OEM Spec Swan-Neck GT Wing (1680mm)',
    tier: 'OEM',
    costCredits: 0,
    weightDeltaKg: 0,
    wingSpanMm: 1680,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.0,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0,
    dragDelta: 0,
    reliabilityPct: 100,
    summary: 'Homologated GT downforce-to-drag efficiency baseline.',
  },
  {
    id: 'aero_low_drag',
    category: 'aero',
    name: 'Le Mans Low-Drag Diffuser & Wing Trim',
    tier: 'GT3 Race',
    costCredits: 0,
    weightDeltaKg: -2.4,
    wingSpanMm: 1600,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 0.97,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: -0.10,
    dragDelta: -0.09,
    reliabilityPct: 99,
    summary: 'Boosts straight-line Vmax and lowers fuel use (-3%) at the cost of 10% corner aero load.',
  },
  {
    id: 'aero_high_df',
    category: 'aero',
    name: 'Sprint High-Downforce Dual-Element Wing (1840mm)',
    tier: 'Endurance Pro',
    costCredits: 0,
    weightDeltaKg: 3.4,
    wingSpanMm: 1840,
    powerMult: 1.0,
    lowEndTorqueMult: 1.0,
    topEndTorqueMult: 1.0,
    redlineDeltaRpm: 0,
    spoolSpeedMult: 1.0,
    heatFactor: 1.0,
    fuelBurnMult: 1.02,
    springStiffMult: 1.0,
    dampingMult: 1.0,
    brakeTorqueMult: 1.0,
    fadeLimitDeltaC: 0,
    coolingRateMult: 1.0,
    downforceDelta: 0.22,
    dragDelta: 0.085,
    reliabilityPct: 97,
    summary: '+22% aero downforce for technical sweeps; adds +0.085 drag and requires stiffer springs.',
  },
];

export const PARTS_BY_ID: Record<string, CarPartSpec> = Object.fromEntries(
  PARTS_CATALOG.map((p) => [p.id, p]),
);

export function getPartsForCategory(category: PartCategoryId): CarPartSpec[] {
  return PARTS_CATALOG.filter((p) => p.category === category);
}

export function resolveEquippedParts(
  equipped?: Partial<Record<PartCategoryId, string>>,
): Record<PartCategoryId, CarPartSpec> {
  const out = {} as Record<PartCategoryId, CarPartSpec>;
  for (const cat of Object.keys(DEFAULT_EQUIPPED_PARTS) as PartCategoryId[]) {
    const id = equipped?.[cat] ?? DEFAULT_EQUIPPED_PARTS[cat];
    out[cat] = PARTS_BY_ID[id] ?? PARTS_BY_ID[DEFAULT_EQUIPPED_PARTS[cat]];
  }
  return out;
}

export interface FitmentIssue {
  severity: 'error' | 'warning';
  code: string;
  title: string;
  detail: string;
}

export interface FitmentReport {
  fits: boolean; // false if any severity === 'error'
  issues: FitmentIssue[];
  totalWeightDeltaKg: number;
  totalCostCredits: number;
  reliabilityPct: number;
}

export interface EffectiveVehicleSpecs {
  massKg: number;
  maxPowerWatts: number;
  v8TorqueNm: number;
  electricFillNm: number;
  lowEndTorqueMult: number;
  topEndTorqueMult: number;
  redlineRpm: number;
  shiftUpRpm: number;
  shiftDownRpm: number;
  shiftFlashRpm: number;
  finalDrive: number;
  gearRatioScale: number;
  spoolSpeedMult: number;
  heatFactor: number;
  fuelBurnMult: number;
  coolingRateMult: number;
  springStiffMult: number;
  dampingMult: number;
  maxBrakeForce: number;
  fadeLimitDeltaC: number;
  downforceFrontMult: number;
  downforceRearMult: number;
  cdaDelta: number;
  trackWidthDeltaM: number;
  rideHeightGroundEffectMult: number;
  wheelDiameterIn: number;
  wheelWidthMm: number;
  wheelOffsetMm: number;
  wheelInertiaMult: number;
  wheelWidthGripMult: number;
  rotorDiameterMm: number;
  drivetrainTorqueCapNm: number;
  steeringLockBonusRad: number;
  bumpCompliance: number;
  weightDeltaKg: number;
  totalCostCredits: number;
  reliabilityPct: number;
}

export function getVisualAerodynamicsImpact(visual?: CarVisualCustomization): {
  downforceFrontDelta: number;
  downforceRearDelta: number;
  dragDelta: number;
  weightDeltaKg: number;
  coolingMult: number;
  trackWidthDeltaM: number;
} {
  if (!visual) {
    return {
      downforceFrontDelta: 0,
      downforceRearDelta: 0,
      dragDelta: 0,
      weightDeltaKg: 0,
      coolingMult: 1.0,
      trackWidthDeltaM: 0,
    };
  }
  let downforceFrontDelta = 0;
  let downforceRearDelta = 0;
  let dragDelta = 0;
  let weightDeltaKg = 0;
  let coolingMult = 1.0;

  // Front aero
  const frontType = visual.frontAero ?? (visual.showSplitter ? 'lip' : 'oem');
  if (frontType === 'lip') {
    downforceFrontDelta += 0.08;
    dragDelta += 0.014;
    weightDeltaKg += 2.2;
  } else if (frontType === 'gt_splitter') {
    downforceFrontDelta += 0.19;
    dragDelta += 0.032;
    weightDeltaKg += 4.6;
  } else if (frontType === 'canards') {
    downforceFrontDelta += 0.25;
    dragDelta += 0.048;
    weightDeltaKg += 5.4;
  }

  // Side skirts / aero blades
  const sideType = visual.sideAero ?? (visual.showSideSkirts ? 'carbon_skirts' : 'oem');
  if (sideType === 'carbon_skirts') {
    downforceFrontDelta += 0.03;
    downforceRearDelta += 0.04;
    dragDelta -= 0.008;
    weightDeltaKg += 3.0;
  } else if (sideType === 'aero_blades') {
    downforceFrontDelta += 0.06;
    downforceRearDelta += 0.08;
    dragDelta -= 0.012;
    weightDeltaKg += 4.2;
  }

  // Rear diffuser
  const diffType = visual.rearDiffuser ?? 'oem';
  if (diffType === 'venturi_fin') {
    downforceRearDelta += 0.11;
    dragDelta += 0.010;
    weightDeltaKg += 2.8;
  } else if (diffType === 'gt3_diffuser') {
    downforceRearDelta += 0.22;
    dragDelta += 0.024;
    weightDeltaKg += 4.8;
  }

  // Hood vents
  if (visual.hoodVents === 'louvered_carbon') {
    downforceFrontDelta += 0.05;
    dragDelta += 0.008;
    weightDeltaKg -= 4.5;
    coolingMult = 1.12;
  }

  // Rear wing profile
  if (visual.rearWingSize === 'none') {
    downforceRearDelta -= 0.24;
    dragDelta -= 0.085;
    weightDeltaKg -= 6.5;
  } else if (visual.rearWingSize === 'lip') {
    downforceRearDelta -= 0.12;
    dragDelta -= 0.045;
    weightDeltaKg -= 3.5;
  } else if (visual.rearWingSize === 'low_drag') {
    downforceRearDelta -= 0.05;
    dragDelta -= 0.025;
    weightDeltaKg -= 1.0;
  } else if (visual.rearWingSize === 'gt_high') {
    downforceRearDelta += 0.20;
    dragDelta += 0.062;
    weightDeltaKg += 4.8;
  } else if (visual.rearWingSize === 'chassis_mount') {
    downforceRearDelta += 0.34;
    dragDelta += 0.095;
    weightDeltaKg += 8.5;
  }

  // Track width visual stance spacer offset (-12 .. +28 mm per side -> total track width delta)
  const trackWidthDeltaM = clamp((visual.wheelOffsetMm ?? 0) * 0.002, -0.024, 0.056);
  if (Math.abs(visual.wheelOffsetMm ?? 0) > 2) {
    dragDelta += Math.max(0, (visual.wheelOffsetMm ?? 0) * 0.00075);
    weightDeltaKg += Math.max(0, (visual.wheelOffsetMm ?? 0) * 0.09);
  }

  return {
    downforceFrontDelta,
    downforceRearDelta,
    dragDelta,
    weightDeltaKg,
    coolingMult,
    trackWidthDeltaM,
  };
}

export function computeEffectiveSpecs(
  baseSpec: VehicleSpecProfile,
  setup: CarSetupConfig,
  visual?: CarVisualCustomization,
): EffectiveVehicleSpecs {
  const parts = resolveEquippedParts(setup.equippedParts);
  let weightDeltaKg = 0;
  let totalCostCredits = 0;
  let powerMult = 1.0;
  let lowEndTorqueMult = 1.0;
  let topEndTorqueMult = 1.0;
  let redlineDeltaRpm = 0;
  let spoolSpeedMult = 1.0;
  let heatFactor = 1.0;
  let fuelBurnMult = 1.0;
  let coolingRateMult = 1.0;
  let springStiffMult = 1.0;
  let dampingMult = 1.0;
  let brakeTorqueMult = 1.0;
  let fadeLimitDeltaC = 0;
  let downforceDelta = 0;
  let dragDelta = 0;
  let reliabilityPct = 100;
  let steeringLockBonusRad = 0;
  let bumpCompliance = 1.0;

  for (const cat of Object.keys(parts) as PartCategoryId[]) {
    const p = parts[cat];
    weightDeltaKg += p.weightDeltaKg;
    totalCostCredits += p.costCredits;
    powerMult *= p.powerMult;
    lowEndTorqueMult *= p.lowEndTorqueMult;
    topEndTorqueMult *= p.topEndTorqueMult;
    redlineDeltaRpm += p.redlineDeltaRpm;
    spoolSpeedMult *= p.spoolSpeedMult;
    heatFactor *= p.heatFactor;
    fuelBurnMult *= p.fuelBurnMult;
    coolingRateMult *= p.coolingRateMult;
    springStiffMult *= p.springStiffMult;
    dampingMult *= p.dampingMult;
    brakeTorqueMult *= p.brakeTorqueMult;
    fadeLimitDeltaC += p.fadeLimitDeltaC;
    downforceDelta += p.downforceDelta;
    dragDelta += p.dragDelta;
    steeringLockBonusRad += p.steeringLockBonusRad ?? 0;
    if (p.bumpCompliance !== undefined) {
      bumpCompliance *= p.bumpCompliance;
    }
    reliabilityPct = Math.min(reliabilityPct, p.reliabilityPct);
  }

  const visImpact = getVisualAerodynamicsImpact(visual);
  weightDeltaKg += visImpact.weightDeltaKg;
  dragDelta += visImpact.dragDelta;
  coolingRateMult *= visImpact.coolingMult;

  // Ride height ground effect & frontal area drag coupling
  const rideHeightDeltaMm = clamp((setup.rideHeightMm ?? 60) - 60, -20, 45);
  const rideHeightGroundEffectMult = clamp(1.0 - rideHeightDeltaMm * 0.0024, 0.88, 1.06);
  dragDelta += rideHeightDeltaMm * 0.0009;

  const ecuBoostScale = clamp(setup.ecuBoostScale ?? 1.0, 0.85, 1.18);
  const revOffset = clamp(setup.revLimitOffsetRpm ?? 0, -400, 600);
  const totalPowerMult = powerMult * (0.38 + 0.62 * ecuBoostScale);
  const totalTorqueMult = powerMult * ecuBoostScale;
  const redlineRpm = clamp(
    baseSpec.redlineRpm + redlineDeltaRpm + revOffset,
    6200,
    Math.max(11400, baseSpec.redlineRpm + 3400),
  );
  const redlineShiftRatio = redlineRpm / baseSpec.redlineRpm;

  const dfFrontScale = clamp((setup.downforceFrontScale ?? 1.0) * setup.downforceScale, 0.5, 1.6);
  const dfRearScale = clamp((setup.downforceRearScale ?? 1.0) * setup.downforceScale, 0.5, 1.6);

  const downforceFrontMult = Math.max(
    0.35,
    (dfFrontScale + downforceDelta * 0.78 + visImpact.downforceFrontDelta) * rideHeightGroundEffectMult,
  );
  const downforceRearMult = Math.max(
    0.35,
    (dfRearScale + downforceDelta * 1.12 + visImpact.downforceRearDelta) * rideHeightGroundEffectMult,
  );

  return {
    massKg: Math.max(420, baseSpec.massKg + weightDeltaKg),
    maxPowerWatts: baseSpec.maxPowerWatts * totalPowerMult,
    v8TorqueNm: baseSpec.v8TorqueNm * totalTorqueMult,
    electricFillNm: baseSpec.electricFillNm,
    lowEndTorqueMult,
    topEndTorqueMult,
    redlineRpm,
    shiftUpRpm: Math.round(baseSpec.shiftUpRpm * redlineShiftRatio),
    shiftDownRpm: Math.round(baseSpec.shiftDownRpm * redlineShiftRatio),
    shiftFlashRpm: Math.round(baseSpec.shiftFlashRpm * redlineShiftRatio),
    finalDrive: clamp(setup.finalDriveRatio ?? baseSpec.finalDrive, 2.80, 4.50),
    gearRatioScale: clamp(setup.gearRatioScale ?? 1.0, 0.82, 1.18),
    spoolSpeedMult,
    heatFactor: heatFactor * (0.4 + 0.6 * ecuBoostScale),
    fuelBurnMult: fuelBurnMult * (0.45 + 0.55 * ecuBoostScale),
    coolingRateMult,
    springStiffMult,
    dampingMult,
    maxBrakeForce: baseSpec.maxBrakeForce * brakeTorqueMult,
    fadeLimitDeltaC,
    downforceFrontMult,
    downforceRearMult,
    cdaDelta: dragDelta,
    trackWidthDeltaM: visImpact.trackWidthDeltaM,
    rideHeightGroundEffectMult,
    wheelDiameterIn: parts.wheels.wheelDiameterIn ?? 19,
    wheelWidthMm: parts.wheels.wheelWidthMm ?? 305,
    wheelOffsetMm: (parts.wheels.wheelOffsetMm ?? 28) - (visual?.wheelOffsetMm ?? 0),
    wheelInertiaMult: parts.wheels.wheelInertiaMult ?? 1.0,
    wheelWidthGripMult: 1.0 + ((parts.wheels.wheelWidthMm ?? 305) - 305) * 0.0008,
    rotorDiameterMm: parts.brakes.rotorDiameterMm ?? 380,
    drivetrainTorqueCapNm: parts.drivetrain.drivetrainTorqueCapNm ?? 890,
    steeringLockBonusRad,
    bumpCompliance,
    weightDeltaKg,
    totalCostCredits,
    reliabilityPct,
  };
}

export function isEngineSwapForcedInduction(partId?: string): boolean {
  return partId === 'swap_sr20det' || partId === 'swap_13b_rew' || partId === 'swap_2jz_gte';
}

export function validateCarFitment(
  baseSpec: VehicleSpecProfile,
  setup: CarSetupConfig,
  visual?: CarVisualCustomization,
): FitmentReport {
  const eff = computeEffectiveSpecs(baseSpec, setup, visual);
  const issues: FitmentIssue[] = [];

  // 1. Wheel barrel vs brake caliper/rotor clearance
  if (eff.wheelDiameterIn <= 18 && eff.rotorDiameterMm >= 396) {
    issues.push({
      severity: 'error',
      code: 'BRAKE_WHEEL_CLEARANCE',
      title: '18" Wheel Fails Brake Clearance',
      detail: `${eff.rotorDiameterMm}mm rotor/caliper package interferes with 18" wheel barrel. Select 19"+ wheels or 380mm brakes.`,
    });
  }

  // 2. Wide wheel / aggressive offset fender rub check
  if ((eff.wheelWidthMm >= 330 || (visual?.wheelOffsetMm ?? 0) >= 18) && eff.wheelOffsetMm <= 16 && setup.rideHeightMm < 56) {
    issues.push({
      severity: 'warning',
      code: 'FENDER_OFFSET_RUB',
      title: 'Fender Arch Clearance Tight',
      detail: `${eff.wheelWidthMm}mm ET${Math.round(eff.wheelOffsetMm)} wheel at ${setup.rideHeightMm}mm ride height risks outer fender rub on compression. Raise ride height >= 56mm or reduce spacer offset.`,
    });
  }

  // 3. High boost vs cooling capacity check
  if (eff.heatFactor > 1.18 && eff.coolingRateMult < 1.15) {
    issues.push({
      severity: 'warning',
      code: 'COOLING_DEFICIT',
      title: 'Cooling Capacity Margin Low',
      detail: `Engine thermal load (${Math.round(eff.heatFactor * 100)}%) exceeds OEM radiator capacity. Fit Endurance Cooling Package, Louvered Hood Vents, or trim ECU boost.`,
    });
  }

  // 4. Drivetrain rated torque vs combined peak torque
  const peakCombinedNm = eff.v8TorqueNm * eff.topEndTorqueMult + eff.electricFillNm;
  if (peakCombinedNm > eff.drivetrainTorqueCapNm) {
    issues.push({
      severity: 'error',
      code: 'DRIVETRAIN_TORQUE_CAP',
      title: 'Drivetrain Torque Limit Exceeded',
      detail: `Engine peak torque (${Math.round(peakCombinedNm)} Nm) exceeds ${eff.drivetrainTorqueCapNm} Nm gearbox/diff rating. Upgrade to Billet Drivetrain or lower ECU boost.`,
    });
  }

  // 5. Extreme camber/toe tire shoulder warning
  if ((setup.camberFrontDeg ?? -2.4) < -4.2 || (setup.camberRearDeg ?? -1.8) < -3.6) {
    issues.push({
      severity: 'warning',
      code: 'EXTREME_CAMBER',
      title: 'Excessive Negative Camber',
      detail: 'Camber beyond -4.2° front / -3.6° rear reduces straight-line braking contact patch.',
    });
  }

  return {
    fits: !issues.some((i) => i.severity === 'error'),
    issues,
    totalWeightDeltaKg: Number(eff.weightDeltaKg.toFixed(1)),
    totalCostCredits: eff.totalCostCredits,
    reliabilityPct: eff.reliabilityPct,
  };
}

export interface DynoPoint {
  rpm: number;
  stockHp: number;
  stockNm: number;
  upgradedHp: number;
  upgradedNm: number;
}

export interface DynoChartData {
  points: DynoPoint[];
  stockPeakHp: number;
  stockPeakHpRpm: number;
  stockPeakNm: number;
  upgradedPeakHp: number;
  upgradedPeakHpRpm: number;
  upgradedPeakNm: number;
  stockWeightKg: number;
  upgradedWeightKg: number;
}

function evalCurveTorqueNm(
  rpm: number,
  idleRpm: number,
  redlineRpm: number,
  v8Nm: number,
  electricNm: number,
  maxPowerW: number,
  lowEndMult: number,
  topEndMult: number,
): number {
  const n = clamp((rpm - idleRpm) / Math.max(100, redlineRpm - idleRpm), 0, 1);
  if (rpm > redlineRpm) {
    return 0;
  }
  const electricFill = electricNm > 0 ? electricNm * (1 - (n > 0.55 ? ((n - 0.55) / 0.43) * 0.35 : 0)) : 0;
  const spoolOffset = electricNm > 0 ? 0.14 : 0.22;
  const shapeMult = lowEndMult * (1 - n) + topEndMult * n;
  const v8Base =
    v8Nm *
    shapeMult *
    Math.pow(Math.sin(clamp((n + spoolOffset) / (1 + spoolOffset), 0, 1) * Math.PI * 0.62), 0.72);
  const combinedNm = electricFill + v8Base;
  const omegaEng = Math.max(120, (rpm * Math.PI * 2) / 60);
  const powerCapNm = maxPowerW / omegaEng;
  const topTaper = n > 0.9 ? 1 - ((n - 0.9) / 0.1) * 0.16 : 1.0;
  return Math.min(combinedNm, powerCapNm) * topTaper;
}

export function generateDynoCurves(
  baseSpec: VehicleSpecProfile,
  setup: CarSetupConfig,
): DynoChartData {
  const eff = computeEffectiveSpecs(baseSpec, setup);
  const maxRpm = Math.max(baseSpec.redlineRpm, eff.redlineRpm);
  const points: DynoPoint[] = [];

  let stockPeakHp = 0;
  let stockPeakHpRpm = baseSpec.idleRpm;
  let stockPeakNm = 0;
  let upgradedPeakHp = 0;
  let upgradedPeakHpRpm = baseSpec.idleRpm;
  let upgradedPeakNm = 0;

  const startRpm = Math.ceil(baseSpec.idleRpm / 250) * 250;
  for (let rpm = startRpm; rpm <= maxRpm + 250; rpm += 250) {
    const sNm =
      rpm <= baseSpec.redlineRpm
        ? evalCurveTorqueNm(
            rpm,
            baseSpec.idleRpm,
            baseSpec.redlineRpm,
            baseSpec.v8TorqueNm,
            baseSpec.electricFillNm,
            baseSpec.maxPowerWatts,
            1.0,
            1.0,
          )
        : 0;
    const uNm =
      rpm <= eff.redlineRpm
        ? evalCurveTorqueNm(
            rpm,
            baseSpec.idleRpm,
            eff.redlineRpm,
            eff.v8TorqueNm,
            eff.electricFillNm,
            eff.maxPowerWatts,
            eff.lowEndTorqueMult,
            eff.topEndTorqueMult,
          )
        : 0;

    const sHp = (sNm * rpm) / 7127;
    const uHp = (uNm * rpm) / 7127;

    if (sHp > stockPeakHp) {
      stockPeakHp = sHp;
      stockPeakHpRpm = rpm;
    }
    if (sNm > stockPeakNm) stockPeakNm = sNm;

    if (uHp > upgradedPeakHp) {
      upgradedPeakHp = uHp;
      upgradedPeakHpRpm = rpm;
    }
    if (uNm > upgradedPeakNm) upgradedPeakNm = uNm;

    points.push({
      rpm,
      stockHp: Math.round(sHp),
      stockNm: Math.round(sNm),
      upgradedHp: Math.round(uHp),
      upgradedNm: Math.round(uNm),
    });
  }

  return {
    points,
    stockPeakHp: Math.round(stockPeakHp),
    stockPeakHpRpm,
    stockPeakNm: Math.round(stockPeakNm),
    upgradedPeakHp: Math.round(upgradedPeakHp),
    upgradedPeakHpRpm,
    upgradedPeakNm: Math.round(upgradedPeakNm),
    stockWeightKg: baseSpec.massKg,
    upgradedWeightKg: Math.round(eff.massKg),
  };
}

export interface ProjectedCarMetrics {
  peakHp: number;
  peakTorqueNm: number;
  massKg: number;
  topSpeedKmh: number;
  zeroToHundredSec: number;
  downforceKgf250: number;
  dragCdA: number;
  peakLatG: number;
  peakDecelG: number;
  gearTopSpeedsKmh: number[];
}

/**
 * Live theoretical + mechanical performance projection responding to EVERY tune,
 * gear ratio, engine map, suspension alignment, wheel/brake, and exterior aero change.
 */
export function computeProjectedCarMetrics(
  baseSpec: VehicleSpecProfile,
  setup: CarSetupConfig,
  visual?: CarVisualCustomization,
  options?: { aeroDeployed?: boolean },
): ProjectedCarMetrics {
  const eff = computeEffectiveSpecs(baseSpec, setup, visual);
  const peakHp = Math.round(eff.maxPowerWatts / 745.7);
  const peakTorqueNm = Math.round(eff.v8TorqueNm * Math.max(eff.lowEndTorqueMult, eff.topEndTorqueMult) + eff.electricFillNm);
  const massKg = Math.round(eff.massKg);

  // Active Aero DRS scaling matching vehiclePhysics.ts
  const aeroMode =
    setup.activeAeroMode ?? (setup.activeAeroEnabled === false ? 'off' : 'auto');
  const useActiveAeroState = aeroMode !== 'off' && options?.aeroDeployed !== undefined;
  const activeAeroDfScale = useActiveAeroState ? (options!.aeroDeployed ? 1.18 : 0.68) : 1.0;
  const activeAeroDragScale = useActiveAeroState ? (options!.aeroDeployed ? 1.06 : 0.78) : 1.0;

  // Compute drag CdA & 250 km/h aero downforce
  const effDfFrontMult = eff.downforceFrontMult * activeAeroDfScale;
  const effDfRearMult = eff.downforceRearMult * activeAeroDfScale;
  const downforceAvgMult = (effDfFrontMult + effDfRearMult) * 0.5;
  const dragCdA = Math.max(
    0.42,
    (baseSpec.cdaBase + eff.cdaDelta + baseSpec.cdaScale * downforceAvgMult) * activeAeroDragScale,
  );
  const v250 = 250 / 3.6;
  const downforceN250 =
    0.5 *
    1.225 *
    (baseSpec.downforceFront * effDfFrontMult + baseSpec.downforceRear * effDfRearMult) *
    v250 *
    v250;
  const downforceKgf250 = Math.round(downforceN250 / 9.81);

  // Per-gear mechanical speed ceilings from redline RPM, gear ratios, final drive, and wheel diameter
  const wheelDiaScale = 1 + (eff.wheelDiameterIn - 19) * 0.015;
  const gearTopSpeedsKmh: number[] = [];
  for (let g = 1; g <= baseSpec.maxGear; g++) {
    const rawR = Math.abs(baseSpec.gearRatios[g + 1] ?? 1.0);
    const ratio = rawR * eff.gearRatioScale;
    const wheelRps = eff.redlineRpm / 60 / (ratio * eff.finalDrive);
    const vMps = wheelRps * 2 * Math.PI * (baseSpec.wheelRadius * wheelDiaScale);
    gearTopSpeedsKmh.push(Math.round(vMps * 3.6));
  }

  // Aero drag-limited Vmax: P = 0.5 * rho * CdA * v^3 + Crr * m * g * v (approx solved cubically)
  const wheelPowerW = eff.maxPowerWatts * 0.90;
  const aeroTopMps = Math.cbrt((wheelPowerW * 0.94) / (0.5 * 1.225 * dragCdA));
  const mechTopMps = (gearTopSpeedsKmh[gearTopSpeedsKmh.length - 1] ?? 320) / 3.6;
  const topSpeedKmh = Math.round(Math.min(aeroTopMps, mechTopMps) * 3.6);

  // Estimate 0-100 km/h launch time factoring mass, power, AWD traction, gearing, wheel inertia, and compound grip
  const tractionBoost = baseSpec.frontDriveFrac > 0.1 && baseSpec.rearDriveFrac > 0.1 ? 1.16 : 1.0;
  const compoundFactor =
    setup.tireCompound === 'racing_soft'
      ? 1.08
      : setup.tireCompound === 'racing_medium'
        ? 1.04
        : setup.tireCompound === 'racing_hard'
          ? 1.0
          : setup.tireCompound === 'sports_soft'
            ? 0.94
            : 0.87;
  const pwrToWt = peakHp / Math.max(420, massKg); // hp/kg
  const gearLaunchMult = clamp(eff.finalDrive / baseSpec.finalDrive, 0.85, 1.18) / wheelDiaScale;
  const inertiaLaunchBoost = clamp(1.0 / Math.pow(eff.wheelInertiaMult, 0.14), 0.96, 1.04);
  const raw0to100 = 1.68 / Math.max(0.22, pwrToWt * tractionBoost * Math.pow(compoundFactor * eff.wheelWidthGripMult, 0.6) * Math.pow(gearLaunchMult, 0.25) * inertiaLaunchBoost);
  const zeroToHundredSec = Number(clamp(raw0to100, 1.55, 6.4).toFixed(2));

  // Cornering Lat G factoring compound, wheel width, camber, track width, downforce
  const camberF = setup.camberFrontDeg ?? -2.4;
  const camberR = setup.camberRearDeg ?? -1.8;
  const camberPenaltyOrGain =
    1.0 +
    clamp(0.035 - (Math.abs(camberF + 2.5) + Math.abs(camberR + 1.9)) * 0.012, -0.08, 0.038);
  const trackBonus = 1.0 + clamp(eff.trackWidthDeltaM * 0.65, -0.02, 0.045);
  const muBase = 1.44 * compoundFactor * eff.wheelWidthGripMult * (setup.tireGripTrim ?? 1.0) * baseSpec.mechGripBoost * camberPenaltyOrGain * trackBonus;
  const peakLatG = Number(clamp(muBase * (1.0 + (downforceKgf250 / massKg) * 0.42), 0.92, 2.75).toFixed(2));
  const peakDecelG = Number(clamp((eff.maxBrakeForce / (massKg * 9.81)) * 0.88 * compoundFactor * eff.wheelWidthGripMult, 0.95, 2.55).toFixed(2));

  return {
    peakHp,
    peakTorqueNm,
    massKg,
    topSpeedKmh,
    zeroToHundredSec,
    downforceKgf250,
    dragCdA: Number(dragCdA.toFixed(3)),
    peakLatG,
    peakDecelG,
    gearTopSpeedsKmh,
  };
}

// ---------------------------------------------------------------------------
// Visual Customization Config (Per-Part Paint, Aero, Decals, Stance, Tint)
// ---------------------------------------------------------------------------

export type PaintFinishType = 'gloss' | 'metallic' | 'satin' | 'matte' | 'pearl' | 'carbon_weave';
export type WrapPatternType = 'none' | 'racing_stripe' | 'heritage_gulf' | 'carbon_split';
export type WheelFinishType = 'satin_black' | 'machined_silver' | 'bronze_gold' | 'white_race' | 'custom_hex';
export type RearWingSizeType = 'none' | 'lip' | 'low_drag' | 'oem' | 'gt_high' | 'chassis_mount';
export type FrontAeroType = 'oem' | 'lip' | 'gt_splitter' | 'canards';
export type SideAeroType = 'oem' | 'carbon_skirts' | 'aero_blades';
export type RearDiffuserType = 'oem' | 'venturi_fin' | 'gt3_diffuser';
export type HoodVentType = 'oem' | 'louvered_carbon';
export type ExhaustFinishType = 'titanium' | 'chrome' | 'burnt_ti' | 'black';
export type DecalStyleType = 'none' | 'gt_banner' | 'number_plate' | 'full_race';

export interface CarVisualCustomization {
  paintHex: string;
  paintFinish: PaintFinishType;
  trimHex: string;
  wingHex: string;
  caliperHex: string;
  rimHex: string;
  windowTintHex: string;
  windowTintOpacity: number; // 0.14 .. 0.88
  headlightTintHex: string;
  exhaustFinish: ExhaustFinishType;
  wrapPattern: WrapPatternType;
  wrapAccentHex: string;
  racingNumber: string;
  decalStyle: DecalStyleType;
  wheelFinish: WheelFinishType;
  showSplitter: boolean;
  showSideSkirts: boolean;
  frontAero: FrontAeroType;
  sideAero: SideAeroType;
  rearDiffuser: RearDiffuserType;
  hoodVents: HoodVentType;
  rearWingSize: RearWingSizeType;
  wheelOffsetMm: number; // -12 .. +28 mm
}

export function getDefaultVisualCustomization(carId: AnyCarSpecId): CarVisualCustomization {
  if (carId === 'mclaren-650s-gt3') {
    return {
      paintHex: '#ff6600',
      paintFinish: 'metallic',
      trimHex: '#181b22',
      wingHex: '#181b22',
      caliperHex: '#f59e0b',
      rimHex: '#171920',
      windowTintHex: '#0a0f18',
      windowTintOpacity: 0.34,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'racing_stripe',
      wrapAccentHex: '#111827',
      racingNumber: '65',
      decalStyle: 'number_plate',
      wheelFinish: 'satin_black',
      showSplitter: true,
      showSideSkirts: true,
      frontAero: 'gt_splitter',
      sideAero: 'carbon_skirts',
      rearDiffuser: 'gt3_diffuser',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'bmw-m4-gt3-evo') {
    return {
      paintHex: '#f1f5f9',
      paintFinish: 'gloss',
      trimHex: '#161922',
      wingHex: '#161922',
      caliperHex: '#0284c7',
      rimHex: '#171920',
      windowTintHex: '#0b101b',
      windowTintOpacity: 0.32,
      headlightTintHex: '#fef08a',
      exhaustFinish: 'titanium',
      wrapPattern: 'none',
      wrapAccentHex: '#0284c7',
      racingNumber: '25',
      decalStyle: 'gt_banner',
      wheelFinish: 'satin_black',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'bmw-m4-widebody') {
    return {
      paintHex: '#0f5e42',
      paintFinish: 'pearl',
      trimHex: '#14171f',
      wingHex: '#14171f',
      caliperHex: '#dc2626',
      rimHex: '#d1d5db',
      windowTintHex: '#080d14',
      windowTintOpacity: 0.42,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'burnt_ti',
      wrapPattern: 'none',
      wrapAccentHex: '#f59e0b',
      racingNumber: '04',
      decalStyle: 'none',
      wheelFinish: 'machined_silver',
      showSplitter: true,
      showSideSkirts: true,
      frontAero: 'lip',
      sideAero: 'carbon_skirts',
      rearDiffuser: 'venturi_fin',
      hoodVents: 'louvered_carbon',
      rearWingSize: 'oem',
      wheelOffsetMm: 4,
    };
  }
  if (carId === 'aston-vantage-gt3') {
    return {
      paintHex: '#0b5d44',
      paintFinish: 'metallic',
      trimHex: '#131820',
      wingHex: '#131820',
      caliperHex: '#a3e635',
      rimHex: '#181b22',
      windowTintHex: '#080c12',
      windowTintOpacity: 0.35,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'none',
      wrapAccentHex: '#84cc16',
      racingNumber: '59',
      decalStyle: 'gt_banner',
      wheelFinish: 'satin_black',
      showSplitter: true,
      showSideSkirts: true,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'aston-vulcan-amr') {
    return {
      paintHex: '#14532d',
      paintFinish: 'pearl',
      trimHex: '#12151c',
      wingHex: '#12151c',
      caliperHex: '#84cc16',
      rimHex: '#181a20',
      windowTintHex: '#070a10',
      windowTintOpacity: 0.40,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'burnt_ti',
      wrapPattern: 'none',
      wrapAccentHex: '#84cc16',
      racingNumber: '07',
      decalStyle: 'gt_banner',
      wheelFinish: 'satin_black',
      showSplitter: true,
      showSideSkirts: true,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'lambo-huracan-gt3-evo2') {
    return {
      paintHex: '#22c55e',
      paintFinish: 'pearl',
      trimHex: '#14161e',
      wingHex: '#14161e',
      caliperHex: '#facc15',
      rimHex: '#181b22',
      windowTintHex: '#090d16',
      windowTintOpacity: 0.36,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'burnt_ti',
      wrapPattern: 'none',
      wrapAccentHex: '#111827',
      racingNumber: '63',
      decalStyle: 'number_plate',
      wheelFinish: 'satin_black',
      showSplitter: true,
      showSideSkirts: true,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'audi-r8-lms-evo') {
    return {
      paintHex: '#2563eb',
      paintFinish: 'metallic',
      trimHex: '#151821',
      wingHex: '#151821',
      caliperHex: '#dc2626',
      rimHex: '#171920',
      windowTintHex: '#0a0f18',
      windowTintOpacity: 0.35,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'racing_stripe',
      wrapAccentHex: '#dc2626',
      racingNumber: '08',
      decalStyle: 'number_plate',
      wheelFinish: 'satin_black',
      showSplitter: true,
      showSideSkirts: true,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'mclaren-720s-gt3') {
    return {
      paintHex: '#f97316',
      paintFinish: 'metallic',
      trimHex: '#151821',
      wingHex: '#151821',
      caliperHex: '#fb923c',
      rimHex: '#181b22',
      windowTintHex: '#0a0f18',
      windowTintOpacity: 0.35,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'none',
      wrapAccentHex: '#111827',
      racingNumber: '72',
      decalStyle: 'number_plate',
      wheelFinish: 'satin_black',
      showSplitter: true,
      showSideSkirts: true,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'acura-nsx-gt3') {
    return {
      paintHex: '#e11d48',
      paintFinish: 'pearl',
      trimHex: '#14171f',
      wingHex: '#14171f',
      caliperHex: '#facc15',
      rimHex: '#191c24',
      windowTintHex: '#090d14',
      windowTintOpacity: 0.36,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'none',
      wrapAccentHex: '#f8fafc',
      racingNumber: '57',
      decalStyle: 'number_plate',
      wheelFinish: 'satin_black',
      showSplitter: true,
      showSideSkirts: true,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'toyota-gt-one-ts020') {
    return {
      paintHex: '#dc2626',
      paintFinish: 'gloss',
      trimHex: '#181a20',
      wingHex: '#dc2626',
      caliperHex: '#f59e0b',
      rimHex: '#d4d4d8',
      windowTintHex: '#0b1018',
      windowTintOpacity: 0.32,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'none',
      wrapAccentHex: '#f8fafc',
      racingNumber: '03',
      decalStyle: 'gt_banner',
      wheelFinish: 'machined_silver',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'mazda-furai') {
    return {
      paintHex: '#ea580c',
      paintFinish: 'metallic',
      trimHex: '#111318',
      wingHex: '#ea580c',
      caliperHex: '#facc15',
      rimHex: '#18191e',
      windowTintHex: '#070a10',
      windowTintOpacity: 0.44,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'burnt_ti',
      wrapPattern: 'racing_stripe',
      wrapAccentHex: '#111827',
      racingNumber: '55',
      decalStyle: 'number_plate',
      wheelFinish: 'satin_black',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'bmw-m-hybrid-v8') {
    return {
      paintHex: '#0284c7',
      paintFinish: 'gloss',
      trimHex: '#14171f',
      wingHex: '#14171f',
      caliperHex: '#ef4444',
      rimHex: '#161920',
      windowTintHex: '#080c14',
      windowTintOpacity: 0.38,
      headlightTintHex: '#fef08a',
      exhaustFinish: 'titanium',
      wrapPattern: 'racing_stripe',
      wrapAccentHex: '#e11d48',
      racingNumber: '24',
      decalStyle: 'full_race',
      wheelFinish: 'satin_black',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'cadillac-v-series-r') {
    return {
      paintHex: '#eab308',
      paintFinish: 'gloss',
      trimHex: '#13161e',
      wingHex: '#13161e',
      caliperHex: '#ef4444',
      rimHex: '#181b22',
      windowTintHex: '#080c14',
      windowTintOpacity: 0.40,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'carbon_split',
      wrapAccentHex: '#facc15',
      racingNumber: '01',
      decalStyle: 'full_race',
      wheelFinish: 'satin_black',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'koenigsegg-agera-rs') {
    return {
      paintHex: '#dc2626',
      paintFinish: 'pearl',
      trimHex: '#151820',
      wingHex: '#151820',
      caliperHex: '#f59e0b',
      rimHex: '#181a20',
      windowTintHex: '#090c12',
      windowTintOpacity: 0.36,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'racing_stripe',
      wrapAccentHex: '#f8fafc',
      racingNumber: '01',
      decalStyle: 'none',
      wheelFinish: 'satin_black',
      showSplitter: true,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'bugatti-bolide') {
    return {
      paintHex: '#1d4ed8',
      paintFinish: 'metallic',
      trimHex: '#11141c',
      wingHex: '#11141c',
      caliperHex: '#38bdf8',
      rimHex: '#161920',
      windowTintHex: '#070a10',
      windowTintOpacity: 0.44,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'burnt_ti',
      wrapPattern: 'carbon_split',
      wrapAccentHex: '#38bdf8',
      racingNumber: '16',
      decalStyle: 'none',
      wheelFinish: 'satin_black',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'de-tomaso-p900') {
    return {
      paintHex: '#991b1b',
      paintFinish: 'metallic',
      trimHex: '#181920',
      wingHex: '#991b1b',
      caliperHex: '#eab308',
      rimHex: '#ca8a04',
      windowTintHex: '#080b12',
      windowTintOpacity: 0.36,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'none',
      wrapAccentHex: '#ca8a04',
      racingNumber: '90',
      decalStyle: 'none',
      wheelFinish: 'bronze_gold',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'subaru-wrx-sti') {
    return {
      paintHex: '#1d4ed8',
      paintFinish: 'pearl',
      trimHex: '#171920',
      wingHex: '#1d4ed8',
      caliperHex: '#eab308',
      rimHex: '#d97706',
      windowTintHex: '#0b1018',
      windowTintOpacity: 0.32,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'burnt_ti',
      wrapPattern: 'none',
      wrapAccentHex: '#facc15',
      racingNumber: '05',
      decalStyle: 'none',
      wheelFinish: 'bronze_gold',
      showSplitter: true,
      showSideSkirts: true,
      frontAero: 'lip',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 4,
    };
  }
  if (carId === 'honda-s2000') {
    return {
      paintHex: '#facc15',
      paintFinish: 'pearl',
      trimHex: '#161820',
      wingHex: '#161820',
      caliperHex: '#dc2626',
      rimHex: '#1b1e26',
      windowTintHex: '#0a0f18',
      windowTintOpacity: 0.30,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'burnt_ti',
      wrapPattern: 'none',
      wrapAccentHex: '#111827',
      racingNumber: '20',
      decalStyle: 'none',
      wheelFinish: 'satin_black',
      showSplitter: true,
      showSideSkirts: false,
      frontAero: 'lip',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 2,
    };
  }
  if (carId === 'mercedes-amg-gt3-evo') {
    return {
      paintHex: '#94a3b8',
      paintFinish: 'metallic',
      trimHex: '#14171f',
      wingHex: '#14171f',
      caliperHex: '#f59e0b',
      rimHex: '#181b22',
      windowTintHex: '#080c14',
      windowTintOpacity: 0.38,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'racing_stripe',
      wrapAccentHex: '#22c55e',
      racingNumber: '04',
      decalStyle: 'number_plate',
      wheelFinish: 'satin_black',
      showSplitter: true,
      showSideSkirts: true,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'mclaren-f1-gtr-longtail') {
    return {
      paintHex: '#ea580c',
      paintFinish: 'gloss',
      trimHex: '#14171f',
      wingHex: '#14171f',
      caliperHex: '#facc15',
      rimHex: '#181b22',
      windowTintHex: '#080c14',
      windowTintOpacity: 0.34,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'heritage_gulf',
      wrapAccentHex: '#38bdf8',
      racingNumber: '41',
      decalStyle: 'number_plate',
      wheelFinish: 'satin_black',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'ferrari-f40-lbwk') {
    return {
      paintHex: '#dc2626',
      paintFinish: 'gloss',
      trimHex: '#14161d',
      wingHex: '#dc2626',
      caliperHex: '#facc15',
      rimHex: '#181a20',
      windowTintHex: '#090d14',
      windowTintOpacity: 0.32,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'burnt_ti',
      wrapPattern: 'none',
      wrapAccentHex: '#f8fafc',
      racingNumber: '40',
      decalStyle: 'none',
      wheelFinish: 'satin_black',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'ferrari-250-testa-rossa') {
    return {
      paintHex: '#b91c1c',
      paintFinish: 'gloss',
      trimHex: '#e2e8f0',
      wingHex: '#b91c1c',
      caliperHex: '#ca8a04',
      rimHex: '#e2e8f0',
      windowTintHex: '#0a0f18',
      windowTintOpacity: 0.24,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'chrome',
      wrapPattern: 'racing_stripe',
      wrapAccentHex: '#f8fafc',
      racingNumber: '22',
      decalStyle: 'number_plate',
      wheelFinish: 'machined_silver',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'mazda-787b') {
    return {
      paintHex: '#f97316',
      paintFinish: 'gloss',
      trimHex: '#15803d',
      wingHex: '#f8fafc',
      caliperHex: '#f59e0b',
      rimHex: '#f8fafc',
      windowTintHex: '#090d14',
      windowTintOpacity: 0.36,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'titanium',
      wrapPattern: 'carbon_split',
      wrapAccentHex: '#16a34a',
      racingNumber: '55',
      decalStyle: 'full_race',
      wheelFinish: 'white_race',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'honda-ra272-f1') {
    return {
      paintHex: '#f1f5f9',
      paintFinish: 'gloss',
      trimHex: '#1e293b',
      wingHex: '#f1f5f9',
      caliperHex: '#dc2626',
      rimHex: '#cbd5e1',
      windowTintHex: '#0a0f18',
      windowTintOpacity: 0.22,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'chrome',
      wrapPattern: 'none',
      wrapAccentHex: '#dc2626',
      racingNumber: '11',
      decalStyle: 'number_plate',
      wheelFinish: 'machined_silver',
      showSplitter: false,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 0,
    };
  }
  if (carId === 'vw-golf-gti-mk2') {
    return {
      paintHex: '#dc2626',
      paintFinish: 'gloss',
      trimHex: '#181a20',
      wingHex: '#181a20',
      caliperHex: '#ef4444',
      rimHex: '#d4d4d8',
      windowTintHex: '#090d14',
      windowTintOpacity: 0.30,
      headlightTintHex: '#ffffff',
      exhaustFinish: 'chrome',
      wrapPattern: 'none',
      wrapAccentHex: '#111827',
      racingNumber: '16',
      decalStyle: 'none',
      wheelFinish: 'machined_silver',
      showSplitter: true,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 2,
    };
  }
  if (carId === 'toyota-ae86-trueno') {
    return {
      paintHex: '#f8fafc',
      paintFinish: 'gloss',
      trimHex: '#14171f',
      wingHex: '#14171f',
      caliperHex: '#dc2626',
      rimHex: '#a16207',
      windowTintHex: '#0a0f18',
      windowTintOpacity: 0.32,
      headlightTintHex: '#fef08a',
      exhaustFinish: 'burnt_ti',
      wrapPattern: 'none',
      wrapAccentHex: '#111827',
      racingNumber: '86',
      decalStyle: 'none',
      wheelFinish: 'bronze_gold',
      showSplitter: true,
      showSideSkirts: false,
      frontAero: 'oem',
      sideAero: 'oem',
      rearDiffuser: 'oem',
      hoodVents: 'oem',
      rearWingSize: 'oem',
      wheelOffsetMm: 2,
    };
  }
  // vw-polo-r-wrx default
  return {
    paintHex: '#1e3a8a',
    paintFinish: 'gloss',
    trimHex: '#151821',
    wingHex: '#151821',
    caliperHex: '#f97316',
    rimHex: '#f8fafc',
    windowTintHex: '#090d14',
    windowTintOpacity: 0.34,
    headlightTintHex: '#ffffff',
    exhaustFinish: 'titanium',
    wrapPattern: 'racing_stripe',
    wrapAccentHex: '#38bdf8',
    racingNumber: '11',
    decalStyle: 'full_race',
    wheelFinish: 'white_race',
    showSplitter: true,
    showSideSkirts: true,
    frontAero: 'oem',
    sideAero: 'oem',
    rearDiffuser: 'oem',
    hoodVents: 'oem',
    rearWingSize: 'oem',
    wheelOffsetMm: 2,
  };
}

// ---------------------------------------------------------------------------
// GT Career Credits (CR) Economy & Part Ownership Helpers
// ---------------------------------------------------------------------------

export const DEFAULT_STARTING_CREDITS_CR = 35000;

export interface RaceRewardBreakdown {
  baseCr: number;
  positionBonusCr: number;
  driftBonusCr: number;
  distanceBonusCr: number;
  totalCr: number;
  label: string;
}

export function isPartOwnedForCar(
  partId: string,
  _ownedPartIds?: readonly string[] | undefined,
): boolean {
  const part = PARTS_CATALOG.find((p) => p.id === partId);
  return Boolean(part);
}

export function calculateRaceRewardCr(params: {
  mode: 'time_trial' | 'sprint' | 'endurance' | 'drift' | 'tofu_delivery';
  position: number;
  totalRacers: number;
  lapCount: number;
  driftPoints: number;
  distanceKm: number;
  difficulty?: 'novice' | 'pro' | 'elite';
  tofuGrade?: 'S' | 'A' | 'B' | 'C' | 'F';
  tofuIntegrityPct?: number;
  tofuFailed?: boolean;
  tofuChapterRewardCr?: number;
}): RaceRewardBreakdown {
  const diffMult =
    params.difficulty === 'elite' ? 1.45 : params.difficulty === 'pro' ? 1.2 : 1.0;
  const distKm = Math.max(0.5, params.distanceKm);
  const driftPts = Math.max(0, Math.round(params.driftPoints));

  if (params.mode === 'tofu_delivery') {
    if (params.tofuFailed || params.tofuGrade === 'F') {
      return {
        baseCr: 0,
        positionBonusCr: 0,
        driftBonusCr: 0,
        distanceBonusCr: 0,
        totalCr: 0,
        label: 'Delivery Failed — Tofu Spilled',
      };
    }
    const baseChapterCr = params.tofuChapterRewardCr ?? 8500;
    const gradeMult =
      params.tofuGrade === 'S'
        ? 1.5
        : params.tofuGrade === 'A'
          ? 1.2
          : params.tofuGrade === 'B'
            ? 1.0
            : 0.75;
    const baseCr = Math.round(baseChapterCr * gradeMult);
    const integrityBonus = Math.round(clamp(params.tofuIntegrityPct ?? 0, 0, 100) * 35);
    const distanceBonusCr = Math.round(distKm * 450);
    const totalCr = Math.max(2000, baseCr + integrityBonus + distanceBonusCr);
    return {
      baseCr,
      positionBonusCr: integrityBonus,
      driftBonusCr: 0,
      distanceBonusCr,
      totalCr,
      label: `Fujiwara Tofu Delivery (Grade ${params.tofuGrade ?? 'B'})`,
    };
  }

  if (params.mode === 'drift') {
    const baseCr = 2800;
    const positionBonusCr = 0;
    const driftBonusCr = Math.min(26000, Math.round(driftPts * 0.72));
    const distanceBonusCr = Math.round(distKm * 520);
    const totalCr = Math.max(2500, baseCr + driftBonusCr + distanceBonusCr);
    return {
      baseCr,
      positionBonusCr,
      driftBonusCr,
      distanceBonusCr,
      totalCr,
      label: 'Drift Attack Payout',
    };
  }

  if (params.mode === 'time_trial') {
    const baseCr = 2600;
    const positionBonusCr = 0;
    const driftBonusCr = Math.min(6000, Math.round(driftPts * 0.25));
    const distanceBonusCr = Math.round(distKm * 980);
    const totalCr = Math.max(2200, baseCr + driftBonusCr + distanceBonusCr);
    return {
      baseCr,
      positionBonusCr,
      driftBonusCr,
      distanceBonusCr,
      totalCr,
      label: 'Hotlap Track Payout',
    };
  }

  const isEndurance = params.mode === 'endurance';
  const baseCr = Math.round((isEndurance ? 6500 : 3800) * diffMult);
  const posRank = Math.max(1, Math.min(params.totalRacers || 4, params.position));
  const rawPosBonus =
    posRank === 1
      ? isEndurance
        ? 18500
        : 12000
      : posRank === 2
        ? isEndurance
          ? 12000
          : 7500
        : posRank === 3
          ? isEndurance
            ? 7500
            : 4500
          : 2200;
  const positionBonusCr = Math.round(rawPosBonus * diffMult);
  const distanceBonusCr = Math.round(distKm * (isEndurance ? 820 : 640));
  const driftBonusCr = Math.min(7500, Math.round(driftPts * 0.22));
  const totalCr = baseCr + positionBonusCr + distanceBonusCr + driftBonusCr;

  return {
    baseCr,
    positionBonusCr,
    driftBonusCr,
    distanceBonusCr,
    totalCr,
    label: isEndurance ? `Endurance P${posRank} Purse` : `Sprint P${posRank} Purse`,
  };
}

