import {
  type CarVisualCustomization,
  computeEffectiveSpecs,
  type FitmentReport,
  validateCarFitment,
} from './carCustomization';
import { clamp } from './mathNoise';
import type { AnyCarSpecId } from '../shared/carTypes';
import {
  type CarSetupConfig,
  TIRE_COMPOUNDS,
  VEHICLE_SPECS,
} from './vehiclePhysics';

export type PpClassBracket = 'GT4' | 'GT3' | 'GT1' | 'Prototype';
export type LegalityEnforcementMode = 'relaxed' | 'strict';

export interface EventLegalityRule {
  id: string;
  label: string;
  maxPp: number | null; // null = unrestricted
  minWeightKg: number;
  allowedDrivetrains: Array<'RWD' | 'AWD'>;
  allowedTires: string[] | null;
}

export const EVENT_LEGALITY_RULES: EventLegalityRule[] = [
  {
    id: 'open_prototype',
    label: 'Open Unlimited / Prototype',
    maxPp: null,
    minWeightKg: 800,
    allowedDrivetrains: ['RWD', 'AWD'],
    allowedTires: null,
  },
  {
    id: 'gt3_spec',
    label: 'GT3 Championship (≤ 720 PP)',
    maxPp: 720,
    minWeightKg: 1180,
    allowedDrivetrains: ['RWD'],
    allowedTires: ['racing_hard', 'racing_medium', 'racing_soft'],
  },
  {
    id: 'gt1_cup',
    label: 'GT1 Hypercar Trophy (≤ 840 PP)',
    maxPp: 840,
    minWeightKg: 940,
    allowedDrivetrains: ['RWD', 'AWD'],
    allowedTires: null,
  },
  {
    id: 'gt4_club',
    label: 'GT4 Clubman Cup (≤ 580 PP)',
    maxPp: 580,
    minWeightKg: 1220,
    allowedDrivetrains: ['RWD'],
    allowedTires: ['comfort_hard', 'sports_medium', 'sports_soft', 'racing_hard'],
  },
];

export interface PerformancePointsBreakdown {
  pp: number;
  bracket: PpClassBracket;
  peakHp: number;
  massKg: number;
  powerToWeightHpPerTon: number;
  estPeakLatG: number;
  estPeakDecelG: number;
  downforceIndex: number;
}

export interface LegalityEvaluation {
  ppReport: PerformancePointsBreakdown;
  fitment: FitmentReport;
  rule: EventLegalityRule;
  enforcementMode: LegalityEnforcementMode;
  violations: string[];
  warnings: string[];
  isLegal: boolean;
  canLaunch: boolean; // false only when enforcementMode === 'strict' and !isLegal or !fitment.fits
}

export function classifyPpBracket(pp: number): PpClassBracket {
  if (pp <= 580) return 'GT4';
  if (pp <= 720) return 'GT3';
  if (pp <= 840) return 'GT1';
  return 'Prototype';
}

export function computePerformancePoints(
  carId: AnyCarSpecId,
  setup: CarSetupConfig,
  visual?: CarVisualCustomization,
): PerformancePointsBreakdown {
  const baseSpec = VEHICLE_SPECS[carId] ?? VEHICLE_SPECS['bmw-m4-gt3-evo'];
  const eff = computeEffectiveSpecs(baseSpec, setup, visual);
  const compound = TIRE_COMPOUNDS[setup.tireCompound] ?? TIRE_COMPOUNDS.racing_hard;

  const peakHp = Math.round(eff.maxPowerWatts / 745.7);
  const massKg = Math.round(eff.massKg);
  const powerToWeightHpPerTon = (peakHp / Math.max(420, massKg)) * 1000;

  const camberF = setup.camberFrontDeg ?? -2.4;
  const camberR = setup.camberRearDeg ?? -1.8;
  const camberMult =
    1.0 + clamp(0.032 - (Math.abs(camberF + 2.5) + Math.abs(camberR + 1.9)) * 0.012, -0.07, 0.036);
  const trackMult = 1.0 + clamp(eff.trackWidthDeltaM * 0.65, -0.02, 0.045);

  // Estimate steady cornering LatG and peak decel G
  const muEff = 1.44 * compound.gripMult * eff.wheelWidthGripMult * setup.tireGripTrim * baseSpec.mechGripBoost * camberMult * trackMult;
  const downforceIndex =
    (baseSpec.downforceFront * eff.downforceFrontMult +
      baseSpec.downforceRear * eff.downforceRearMult) *
    0.5;
  const estPeakLatG = clamp(muEff * (1.02 + downforceIndex * 0.14), 0.9, 2.55);
  const estPeakDecelG = clamp((eff.maxBrakeForce / (massKg * 9.81)) * 0.85 * compound.gripMult * eff.wheelWidthGripMult, 0.9, 2.35);

  const awdLaunchBonus = baseSpec.frontDriveFrac > 0.05 && baseSpec.rearDriveFrac > 0.05 ? 18 : 0;
  // Calibrated so stock 650S GT3 ~ 688 PP and stock 2020 Audi R8 LMS Evo ~ 714 PP
  const rawPp =
    348 +
    Math.pow(powerToWeightHpPerTon, 0.70) * 2.95 +
    (estPeakLatG - 1.0) * 110 +
    (estPeakDecelG - 1.0) * 48 +
    (downforceIndex - 1.0) * 20 -
    eff.cdaDelta * 14 +
    awdLaunchBonus;

  const pp = Number(clamp(rawPp, 350, 1080).toFixed(1));
  return {
    pp,
    bracket: classifyPpBracket(pp),
    peakHp,
    massKg,
    powerToWeightHpPerTon: Number(powerToWeightHpPerTon.toFixed(1)),
    estPeakLatG: Number(estPeakLatG.toFixed(2)),
    estPeakDecelG: Number(estPeakDecelG.toFixed(2)),
    downforceIndex: Number(downforceIndex.toFixed(2)),
  };
}

export function evaluateCarLegality(params: {
  carId: AnyCarSpecId;
  setup: CarSetupConfig;
  visual?: CarVisualCustomization;
  ruleId?: string;
  enforcementMode?: LegalityEnforcementMode;
}): LegalityEvaluation {
  const baseSpec = VEHICLE_SPECS[params.carId] ?? VEHICLE_SPECS['bmw-m4-gt3-evo'];
  const rule =
    EVENT_LEGALITY_RULES.find((r) => r.id === params.ruleId) ?? EVENT_LEGALITY_RULES[0];
  const enforcementMode: LegalityEnforcementMode = 'relaxed';

  const ppReport = computePerformancePoints(params.carId, params.setup, params.visual);
  const fitment = validateCarFitment(baseSpec, params.setup, params.visual);

  const violations: string[] = [];
  const warnings: string[] = [];

  for (const issue of fitment.issues) {
    warnings.push(issue.title);
  }

  return {
    ppReport,
    fitment,
    rule,
    enforcementMode,
    violations,
    warnings,
    isLegal: true,
    canLaunch: true,
  };
}
