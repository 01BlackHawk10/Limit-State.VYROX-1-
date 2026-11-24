import * as d3 from 'd3';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Gauge,
  Paintbrush,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createEmptyDriverAnalytics } from '../engine/driverAnalytics';
import type { DriverAnalyticsData } from '../shared/socialTypes';
import { DriverAnalyticsPanel } from './DriverAnalyticsPanel';
import {
  type CarVisualCustomization,
  computeEffectiveSpecs,
  computeProjectedCarMetrics,
  type DecalStyleType,
  DEFAULT_STARTING_CREDITS_CR,
  type ExhaustFinishType,
  type FrontAeroType,
  generateDynoCurves,
  getDefaultVisualCustomization,
  getPartsForCategory,
  type HoodVentType,
  isPartOwnedForCar,
  PART_CATEGORY_LABELS,
  type PartCategoryId,
  type PaintFinishType,
  type RearDiffuserType,
  type RearWingSizeType,
  type SideAeroType,
  validateCarFitment,
  type WheelFinishType,
  type WrapPatternType,
} from '../engine/carCustomization';
import {
  EVENT_LEGALITY_RULES,
  evaluateCarLegality,
  type LegalityEnforcementMode,
} from '../engine/ppAndLegality';
import {
  type AppScreenMode,
  type CarModelId,
  type CarSetupConfig,
  getDefaultCarSetup,
  TIRE_COMPOUNDS,
  type TireCompoundId,
  VEHICLE_SPECS,
} from '../engine/SceneController';

export type TuningDrawerTab = 'parts' | 'setup' | 'visuals' | 'legality' | 'analytics';

interface GarageTuningDrawerProps {
  open: boolean;
  appMode?: AppScreenMode;
  initialTab?: TuningDrawerTab;
  carId: CarModelId;
  carName: string;
  carSetup: CarSetupConfig;
  visualConfig: CarVisualCustomization;
  legalityRuleId: string;
  legalityEnforcement: LegalityEnforcementMode;
  creditsCr?: number;
  ownedPartIds?: readonly string[];
  driverAnalytics?: DriverAnalyticsData;
  onResetDriverAnalytics?: () => void;
  garageAeroPreview?: boolean;
  liveAeroDeployed?: boolean;
  onToggleGarageAeroPreview?: (deployed: boolean) => void;
  onToggleLiveAero?: () => void;
  onCarSetupChange: (next: CarSetupConfig) => void;
  onPurchaseAndEquipPart?: (cat: PartCategoryId, partId: string, costCr: number) => boolean;
  onVisualConfigChange: (next: CarVisualCustomization) => void;
  onLegalityRuleChange: (ruleId: string) => void;
  onLegalityEnforcementChange: (mode: LegalityEnforcementMode) => void;
  onClose: () => void;
}

const PART_CATEGORIES: PartCategoryId[] = [
  'engine_swap',
  'ecu_turbo',
  'intake',
  'exhaust',
  'cooling',
  'weight',
  'suspension',
  'brakes',
  'drivetrain',
  'wheels',
  'aero',
];

const COMPOUND_ORDER: TireCompoundId[] = [
  'comfort_hard',
  'sports_medium',
  'sports_soft',
  'racing_hard',
  'racing_medium',
  'racing_soft',
];

const PAINT_SWATCHES: Array<{ name: string; hex: string }> = [
  { name: 'Papaya Spark', hex: '#ff6600' },
  { name: 'Volcano Red', hex: '#e11d48' },
  { name: 'Sarthe Blue', hex: '#0284c7' },
  { name: 'Verde Mantis', hex: '#16a34a' },
  { name: 'Onyx Obsidian', hex: '#18181b' },
  { name: 'Glacier White', hex: '#e2e8f0' },
  { name: 'Solaris Gold', hex: '#d97706' },
  { name: 'Cobalt Violet', hex: '#6366f1' },
];

const ACCENT_SWATCHES: string[] = [
  '#111827',
  '#f8fafc',
  '#38bdf8',
  '#f59e0b',
  '#ef4444',
  '#22c55e',
];

const FINISH_OPTIONS: Array<{ id: PaintFinishType; label: string }> = [
  { id: 'gloss', label: 'Gloss' },
  { id: 'metallic', label: 'Metallic' },
  { id: 'satin', label: 'Satin' },
  { id: 'matte', label: 'Matte' },
  { id: 'pearl', label: 'Pearl' },
  { id: 'carbon_weave', label: 'Carbon Weave' },
];

const WRAP_OPTIONS: Array<{ id: WrapPatternType; label: string; desc: string }> = [
  { id: 'none', label: 'Solid Paint', desc: 'Clean factory body' },
  { id: 'racing_stripe', label: 'Center GT Stripe', desc: 'Twin center stripe + borders' },
  { id: 'heritage_gulf', label: 'Heritage Band', desc: 'Classic nose & flank band' },
  { id: 'carbon_split', label: 'Exposed Carbon Split', desc: 'Two-tone roof & decklid' },
];

const DECAL_OPTIONS: Array<{ id: DecalStyleType; label: string }> = [
  { id: 'none', label: 'Clean' },
  { id: 'gt_banner', label: 'Windshield Banner' },
  { id: 'number_plate', label: 'Door Number Plate' },
  { id: 'full_race', label: 'Full Endurance' },
];

const WHEEL_FINISH_OPTIONS: Array<{ id: WheelFinishType; label: string }> = [
  { id: 'satin_black', label: 'Satin Black' },
  { id: 'machined_silver', label: 'Machined Alloy' },
  { id: 'bronze_gold', label: 'Forged Bronze' },
  { id: 'white_race', label: 'GT White' },
  { id: 'custom_hex', label: 'Custom Rim Color' },
];

const EXHAUST_OPTIONS: Array<{ id: ExhaustFinishType; label: string }> = [
  { id: 'titanium', label: 'Raw Titanium' },
  { id: 'burnt_ti', label: 'Burnt Blue Ti' },
  { id: 'chrome', label: 'Polished Chrome' },
  { id: 'black', label: 'Cerakote Black' },
];

const FRONT_AERO_OPTIONS: Array<{ id: FrontAeroType; label: string; spec: string }> = [
  { id: 'oem', label: 'OEM Bumper', spec: 'Baseline' },
  { id: 'lip', label: 'Street Lip', spec: '+DF · +2.2kg' },
  { id: 'gt_splitter', label: 'GT Carbon Splitter', spec: '+19% F-DF' },
  { id: 'canards', label: 'Splitter + Canards', spec: '+25% F-DF' },
];

const SIDE_AERO_OPTIONS: Array<{ id: SideAeroType; label: string; spec: string }> = [
  { id: 'oem', label: 'OEM Sill', spec: 'Baseline' },
  { id: 'carbon_skirts', label: 'Carbon Skirts', spec: '-Drag · +3kg' },
  { id: 'aero_blades', label: 'GT Aero Blades', spec: '+Floor Seal' },
];

const DIFFUSER_OPTIONS: Array<{ id: RearDiffuserType; label: string; spec: string }> = [
  { id: 'oem', label: 'OEM Valance', spec: 'Baseline' },
  { id: 'venturi_fin', label: 'Venturi Strakes', spec: '+11% R-DF' },
  { id: 'gt3_diffuser', label: 'GT3 Tunnel Diffuser', spec: '+22% R-DF' },
];

const HOOD_VENT_OPTIONS: Array<{ id: HoodVentType; label: string; spec: string }> = [
  { id: 'oem', label: 'OEM Hood', spec: 'Baseline' },
  { id: 'louvered_carbon', label: 'Carbon Louvers', spec: '-4.5kg · +12% Cool' },
];

const WING_OPTIONS: Array<{ id: RearWingSizeType; label: string }> = [
  { id: 'none', label: 'Wingless' },
  { id: 'lip', label: 'Ducktail Lip' },
  { id: 'low_drag', label: 'Low-Drag' },
  { id: 'oem', label: 'OEM Spec' },
  { id: 'gt_high', label: 'GT3 Swan-Neck' },
  { id: 'chassis_mount', label: 'Chassis GT Wing' },
];

function SliderRow({
  label,
  valueText,
  min,
  max,
  step,
  value,
  onChange,
  accentClass = 'text-sky-300',
}: {
  label: string;
  valueText: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
  accentClass?: string;
}) {
  return (
    <div className="border border-white/10 bg-black/45 p-3 sm:p-2.5">
      <div className="flex items-center justify-between text-xs sm:text-[11px]">
        <span className="font-medium text-slate-200">{label}</span>
        <span className={`font-mono-tabular font-semibold ${accentClass}`}>{valueText}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="sun-slider mt-2.5 sm:mt-2 w-full"
      />
    </div>
  );
}

export function GarageTuningDrawer({
  open,
  appMode = 'garage',
  initialTab = 'parts',
  carId,
  carName,
  carSetup,
  visualConfig,
  legalityRuleId,
  legalityEnforcement,
  creditsCr = DEFAULT_STARTING_CREDITS_CR,
  ownedPartIds,
  driverAnalytics,
  onResetDriverAnalytics,
  garageAeroPreview = true,
  liveAeroDeployed = true,
  onToggleGarageAeroPreview,
  onToggleLiveAero,
  onCarSetupChange,
  onPurchaseAndEquipPart,
  onVisualConfigChange,
  onLegalityRuleChange,
  onLegalityEnforcementChange,
  onClose,
}: GarageTuningDrawerProps) {
  const [activeTab, setActiveTab] = useState<TuningDrawerTab>(initialTab);
  const [selectedPartCat, setSelectedPartCat] = useState<PartCategoryId>('ecu_turbo');
  const [purchaseNotice, setPurchaseNotice] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [initialTab, open]);

  const baseSpec = VEHICLE_SPECS[carId] ?? VEHICLE_SPECS['bmw-m4-gt3-evo'];
  const effSpecs = useMemo(
    () => computeEffectiveSpecs(baseSpec, carSetup, visualConfig),
    [baseSpec, carSetup, visualConfig],
  );
  const fitment = useMemo(
    () => validateCarFitment(baseSpec, carSetup, visualConfig),
    [baseSpec, carSetup, visualConfig],
  );
  const dyno = useMemo(() => generateDynoCurves(baseSpec, carSetup), [baseSpec, carSetup]);
  const stockProj = useMemo(
    () =>
      computeProjectedCarMetrics(
        baseSpec,
        getDefaultCarSetup(carId),
        getDefaultVisualCustomization(carId),
      ),
    [baseSpec, carId],
  );
  const isRaceLive = appMode === 'racing';
  const currentAeroMode =
    carSetup.activeAeroMode ?? (carSetup.activeAeroEnabled === false ? 'off' : 'auto');
  const effectiveAeroDeployed = isRaceLive ? liveAeroDeployed : garageAeroPreview;
  const isWinglessKit = visualConfig.rearWingSize === 'none';

  const currProj = useMemo(
    () =>
      computeProjectedCarMetrics(baseSpec, carSetup, visualConfig, {
        aeroDeployed: effectiveAeroDeployed,
      }),
    [baseSpec, carSetup, visualConfig, effectiveAeroDeployed],
  );
  const legality = useMemo(
    () =>
      evaluateCarLegality({
        carId,
        setup: carSetup,
        visual: visualConfig,
        ruleId: legalityRuleId,
        enforcementMode: legalityEnforcement,
      }),
    [carId, carSetup, visualConfig, legalityRuleId, legalityEnforcement],
  );

  const dynoSvgPaths = useMemo(() => {
    const w = 480;
    const h = 165;
    const padL = 38;
    const padR = 14;
    const padT = 12;
    const padB = 24;

    const minRpm = dyno.points[0]?.rpm ?? 1000;
    const maxRpm = dyno.points[dyno.points.length - 1]?.rpm ?? 9000;
    const maxVal =
      Math.max(
        400,
        dyno.stockPeakHp,
        dyno.upgradedPeakHp,
        dyno.stockPeakNm,
        dyno.upgradedPeakNm,
      ) * 1.08;

    const xScale = d3.scaleLinear().domain([minRpm, maxRpm]).range([padL, w - padR]);
    const yScale = d3.scaleLinear().domain([0, maxVal]).range([h - padB, padT]);

    const lineGen = (accessor: (d: (typeof dyno.points)[number]) => number) =>
      d3
        .line<(typeof dyno.points)[number]>()
        .x((d) => xScale(d.rpm))
        .y((d) => yScale(accessor(d)))
        .curve(d3.curveMonotoneX)(dyno.points) ?? '';

    const areaGen = (accessor: (d: (typeof dyno.points)[number]) => number) =>
      d3
        .area<(typeof dyno.points)[number]>()
        .x((d) => xScale(d.rpm))
        .y0(h - padB)
        .y1((d) => yScale(accessor(d)))
        .curve(d3.curveMonotoneX)(dyno.points) ?? '';

    const gridYs = [0.25, 0.5, 0.75, 1.0].map((frac) => ({
      y: yScale(maxVal * frac),
      label: Math.round(maxVal * frac),
    }));

    const rpmTicks = [2000, 4000, 6000, 8000]
      .filter((r) => r >= minRpm && r <= maxRpm)
      .map((r) => ({
        x: xScale(r),
        label: `${r / 1000}k`,
      }));

    return {
      w,
      h,
      padL,
      padB,
      stockHpPath: lineGen((d) => d.stockHp),
      upgHpPath: lineGen((d) => d.upgradedHp),
      upgHpArea: areaGen((d) => d.upgradedHp),
      stockNmPath: lineGen((d) => d.stockNm),
      upgNmPath: lineGen((d) => d.upgradedNm),
      gridYs,
      rpmTicks,
    };
  }, [dyno]);

  if (!open) return null;

  const equippedMap = carSetup.equippedParts ?? {};
  const categoryParts = getPartsForCategory(selectedPartCat);

  const equipPart = (cat: PartCategoryId, partId: string, partName: string, costCr: number) => {
    if (onPurchaseAndEquipPart) {
      const ok = onPurchaseAndEquipPart(cat, partId, costCr);
      if (!ok) {
        setPurchaseNotice(
          `Need CR ${costCr.toLocaleString()} for ${partName} (Balance: CR ${creditsCr.toLocaleString()}). Win races or drift runs to earn CR.`,
        );
        return;
      }
      setPurchaseNotice(null);
      return;
    }
    setPurchaseNotice(null);
    onCarSetupChange({
      ...carSetup,
      equippedParts: {
        ...equippedMap,
        [cat]: partId,
      },
    });
  };

  const handleDedicatedAeroToggle = () => {
    if (isRaceLive) {
      onToggleLiveAero?.();
      return;
    }
    if (currentAeroMode === 'off') {
      onCarSetupChange({
        ...carSetup,
        activeAeroEnabled: true,
        activeAeroMode: 'manual',
      });
    }
    onToggleGarageAeroPreview?.(!garageAeroPreview);
  };

  return (
    <aside
      data-tutorial="tuning-drawer"
      className="gt5-panel gt5-carbon fixed top-0 right-0 bottom-0 z-30 flex w-full landscape-short:max-w-[440px] desktop:max-w-xl sm:max-w-xl flex-col border-l border-white/15 shadow-2xl"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
      role="dialog"
      aria-label="Garage Tuning & Customizer"
    >
      <div className="gt5-horizon-rule shrink-0" />
      {/* GT5 Tuning Shop Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/12 bg-black/50 px-3 py-2 sm:px-4 sm:py-3 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Wrench className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-400 shrink-0" />
            <h2 className="font-display text-xs sm:text-sm font-bold tracking-wider text-white uppercase truncate">
              {isRaceLive ? 'Live Pit Tuning' : 'Tuning Shop'} · {carName}
            </h2>
          </div>
          <div className="font-mono-tabular mt-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-slate-400">
            <span className="text-sky-300 font-semibold">{legality.ppReport.pp.toFixed(1)} PP</span>
            <span>·</span>
            <span className="text-amber-300 font-semibold">{legality.ppReport.bracket}</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{dyno.upgradedPeakHp} HP</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">{dyno.upgradedWeightKg} kg</span>
            <span>·</span>
            <span className="text-emerald-300 font-bold" data-testid="tuning-credits-balance">
              CR {creditsCr.toLocaleString()}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close Tuning Drawer"
          className="flex h-11 w-11 landscape-short:h-9 landscape-short:w-9 sm:h-9 sm:w-9 items-center justify-center border border-white/15 bg-white/[0.04] text-slate-300 transition-colors hover:border-sky-400/60 hover:text-white shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Performance & Pure Customisation Advisory Strip */}
      <div
        className={`flex items-center justify-between border-b px-3 py-1 sm:px-4 sm:py-1.5 text-[10px] sm:text-[11px] shrink-0 ${
          fitment.issues.length > 0
            ? 'border-amber-500/40 bg-amber-950/40 text-amber-200'
            : 'border-emerald-500/30 bg-emerald-950/30 text-emerald-200'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {fitment.issues.length > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          )}
          <span className="truncate font-medium">
            {fitment.issues.length > 0
              ? `Advisory: ${fitment.issues[0].title}`
              : `Open Class · ${legality.ppReport.pp.toFixed(1)} PP Ready to Race`}
          </span>
        </div>
        <span className="hidden min-[440px]:inline font-mono-tabular ml-2 shrink-0 text-[9px] sm:text-[10px] uppercase tracking-wider">
          All Builds Allowed
        </span>
      </div>

      {/* Dedicated Live Active Aero DRS Quick Toggle Bar (Manual DRS Deploy / Retract Separate from Auto System) */}
      <div
        data-testid="tuning-drawer-active-aero-bar"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-400/30 bg-sky-950/35 px-3 py-2 sm:px-4 sm:py-2 shrink-0"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] sm:text-[11px] font-bold tracking-wider text-white uppercase">
            <span>Active Aero DRS</span>
            <span className="font-mono-tabular border border-white/15 bg-black/45 px-1 py-0.5 text-[9px] text-sky-300">
              {currentAeroMode === 'off'
                ? 'FIXED'
                : currentAeroMode === 'manual'
                ? 'MANUAL'
                : 'AUTO'}
            </span>
            <span
              data-testid="active-aero-live-telemetry"
              className="font-mono-tabular border border-white/10 bg-black/50 px-1.5 py-0.5 text-[9px] text-amber-300"
            >
              {currProj.dragCdA.toFixed(3)} CdA · {currProj.downforceKgf250} kgf
            </span>
          </div>
          <div className="hidden min-[420px]:block truncate text-[10px] text-slate-300">
            {isWinglessKit
              ? 'Splitter & underbody flaps (wingless kit)'
              : isRaceLive
              ? 'Manually deploy/retract rear wing for straight-line DRS, separate from Auto-Deploy'
              : 'Toggle wing & front splitter DRS preview'}
          </div>
        </div>
        <button
          type="button"
          data-testid="active-aero-deploy-toggle"
          onClick={handleDedicatedAeroToggle}
          className={`h-9 sm:h-auto border px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase whitespace-nowrap shrink-0 transition-colors ${
            currentAeroMode === 'off'
              ? 'border-white/20 bg-black/50 text-slate-300 hover:border-sky-400/60 hover:text-white'
              : effectiveAeroDeployed
              ? 'border-emerald-400 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/35'
              : 'border-amber-400 bg-amber-500/25 text-amber-100 hover:bg-amber-500/35'
          }`}
        >
          {effectiveAeroDeployed ? 'DRS Closed · Wing Deployed' : 'DRS Open · Low Drag'}
        </button>
      </div>

      {/* Compact 4-Metric Mobile Delta Strip */}
      <div className="font-mono-tabular grid sm:hidden grid-cols-4 divide-x divide-white/10 border-b border-white/10 bg-black/65 text-center text-[10px]">
        {[
          {
            label: 'Top Spd',
            val: `${currProj.topSpeedKmh}`,
            diff: currProj.topSpeedKmh - stockProj.topSpeedKmh,
            unit: 'km/h',
            betterPositive: true,
          },
          {
            label: '0-100',
            val: `${currProj.zeroToHundredSec.toFixed(2)}s`,
            diff: Number((currProj.zeroToHundredSec - stockProj.zeroToHundredSec).toFixed(2)),
            unit: 's',
            betterPositive: false,
          },
          {
            label: 'Power',
            val: `${currProj.peakHp}`,
            diff: currProj.peakHp - stockProj.peakHp,
            unit: 'HP',
            betterPositive: true,
          },
          {
            label: 'Mass',
            val: `${currProj.massKg}`,
            diff: currProj.massKg - stockProj.massKg,
            unit: 'kg',
            betterPositive: false,
          },
        ].map((item) => {
          const changed = Math.abs(item.diff) >= 0.01;
          const good = item.betterPositive ? item.diff > 0 : item.diff < 0;
          const sign = item.diff > 0 ? '+' : '';
          return (
            <div key={item.label} className="px-1 py-1">
              <div className="text-[8px] text-slate-400 uppercase">{item.label}</div>
              <div className="font-bold text-white leading-tight">{item.val}</div>
              <div
                className={`text-[8px] font-semibold leading-tight ${
                  !changed ? 'text-slate-500' : good ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {changed ? `${sign}${item.diff}` : item.unit}
              </div>
            </div>
          );
        })}
      </div>

      {/* 6-Metric Stock vs Current Delta Matrix (Desktop) */}
      <div className="font-mono-tabular hidden sm:grid grid-cols-6 divide-x divide-white/10 border-b border-white/10 bg-black/65 text-center text-[10px]">
        {[
          {
            label: 'Top Spd',
            val: `${currProj.topSpeedKmh}`,
            diff: currProj.topSpeedKmh - stockProj.topSpeedKmh,
            unit: 'km/h',
            betterPositive: true,
          },
          {
            label: '0-100',
            val: `${currProj.zeroToHundredSec.toFixed(2)}s`,
            diff: Number((currProj.zeroToHundredSec - stockProj.zeroToHundredSec).toFixed(2)),
            unit: 's',
            betterPositive: false,
          },
          {
            label: 'Power',
            val: `${currProj.peakHp}`,
            diff: currProj.peakHp - stockProj.peakHp,
            unit: 'HP',
            betterPositive: true,
          },
          {
            label: 'Mass',
            val: `${currProj.massKg}`,
            diff: currProj.massKg - stockProj.massKg,
            unit: 'kg',
            betterPositive: false,
          },
          {
            label: 'DF@250',
            val: `${currProj.downforceKgf250}`,
            diff: currProj.downforceKgf250 - stockProj.downforceKgf250,
            unit: 'kgf',
            betterPositive: true,
          },
          {
            label: 'Lat G',
            val: `${currProj.peakLatG.toFixed(2)}`,
            diff: Number((currProj.peakLatG - stockProj.peakLatG).toFixed(2)),
            unit: 'G',
            betterPositive: true,
          },
        ].map((item) => {
          const changed = Math.abs(item.diff) >= 0.01;
          const good = item.betterPositive ? item.diff > 0 : item.diff < 0;
          const sign = item.diff > 0 ? '+' : '';
          return (
            <div key={item.label} className="px-1 py-1.5">
              <div className="text-[8px] text-slate-400 uppercase">{item.label}</div>
              <div className="font-bold text-white">{item.val}</div>
              <div
                className={`text-[8px] font-semibold ${
                  !changed ? 'text-slate-500' : good ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {changed ? `${sign}${item.diff}` : item.unit}
              </div>
            </div>
          );
        })}
      </div>

      {/* GT5 Sub-Navigation Tabs */}
      <nav className="grid grid-cols-5 border-b border-white/10 bg-black/50 shrink-0">
        {[
          { id: 'parts' as const, label: 'Parts & Dyno', shortLabel: 'Parts', icon: Cpu },
          { id: 'setup' as const, label: 'Chassis Setup', shortLabel: 'Setup', icon: Sliders },
          { id: 'visuals' as const, label: 'Paint & Aero', shortLabel: 'Aero', icon: Paintbrush },
          { id: 'legality' as const, label: 'PP & Rules', shortLabel: 'Rules', icon: Gauge },
          { id: 'analytics' as const, label: 'Analytics', shortLabel: 'Stats', icon: Activity },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[44px] landscape-short:min-h-[38px] sm:min-h-0 flex items-center justify-center gap-1 sm:gap-1.5 border-b-2 py-2 sm:py-2.5 text-[11px] font-bold tracking-wider uppercase transition-colors whitespace-nowrap ${
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

      {/* Scrollable Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        {activeTab === 'parts' && (
          <>
            {/* Live D3 Stock vs Upgraded Dyno Chart */}
            <section className="border border-white/12 bg-black/55 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-display font-bold tracking-wider text-slate-200 uppercase">
                  Dyno Overlay · Stock vs Upgraded
                </span>
                <div className="font-mono-tabular flex items-center gap-3 text-[10px]">
                  <span className="text-sky-300">
                    HP: {dyno.stockPeakHp} &rarr; <strong>{dyno.upgradedPeakHp}</strong>
                  </span>
                  <span className="text-amber-300">
                    Nm: {dyno.stockPeakNm} &rarr; <strong>{dyno.upgradedPeakNm}</strong>
                  </span>
                  <span className="text-emerald-300">
                    Mass: {dyno.stockWeightKg} &rarr; <strong>{dyno.upgradedWeightKg} kg</strong>
                  </span>
                </div>
              </div>

              <svg
                viewBox={`0 0 ${dynoSvgPaths.w} ${dynoSvgPaths.h}`}
                className="mt-2 w-full h-auto overflow-visible"
                aria-label="Stock vs Upgraded Dyno Curve"
              >
                <defs>
                  <linearGradient id="gt5DynoGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                {dynoSvgPaths.gridYs.map((g, idx) => (
                  <g key={idx}>
                    <line
                      x1={dynoSvgPaths.padL}
                      x2={dynoSvgPaths.w - 14}
                      y1={g.y}
                      y2={g.y}
                      stroke="rgba(255,255,255,0.08)"
                      strokeDasharray="2 3"
                    />
                    <text
                      x={dynoSvgPaths.padL - 5}
                      y={g.y + 3}
                      textAnchor="end"
                      fill="rgba(148,163,184,0.8)"
                      fontSize="9"
                      className="font-mono-tabular"
                    >
                      {g.label}
                    </text>
                  </g>
                ))}
                {dynoSvgPaths.rpmTicks.map((t) => (
                  <text
                    key={t.label}
                    x={t.x}
                    y={dynoSvgPaths.h - 6}
                    textAnchor="middle"
                    fill="rgba(148,163,184,0.85)"
                    fontSize="9"
                    className="font-mono-tabular"
                  >
                    {t.label}
                  </text>
                ))}
                <path d={dynoSvgPaths.upgHpArea} fill="url(#gt5DynoGrad)" />
                <path
                  d={dynoSvgPaths.stockNmPath}
                  fill="none"
                  stroke="#fbbf24"
                  strokeOpacity={0.38}
                  strokeWidth={1.4}
                  strokeDasharray="4 3"
                />
                <path
                  d={dynoSvgPaths.stockHpPath}
                  fill="none"
                  stroke="#38bdf8"
                  strokeOpacity={0.38}
                  strokeWidth={1.4}
                  strokeDasharray="4 3"
                />
                <path d={dynoSvgPaths.upgNmPath} fill="none" stroke="#f59e0b" strokeWidth={2.2} />
                <path d={dynoSvgPaths.upgHpPath} fill="none" stroke="#38bdf8" strokeWidth={2.4} />
              </svg>

              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                <span>Solid: Upgraded Build · Dashed: OEM Stock</span>
                <span className="font-mono-tabular">
                  Redline {effSpecs.redlineRpm} RPM · Cooling {Math.round(effSpecs.coolingRateMult * 100)}%
                </span>
              </div>
            </section>

            {/* Fitment Issues Detail List */}
            {fitment.issues.length > 0 && (
              <div className="space-y-1.5">
                {fitment.issues.map((issue) => (
                  <div
                    key={issue.code}
                    className={`border p-2.5 text-xs ${
                      issue.severity === 'error'
                        ? 'border-rose-500/60 bg-rose-950/40 text-rose-100'
                        : 'border-amber-500/50 bg-amber-950/35 text-amber-100'
                    }`}
                  >
                    <div className="font-semibold">{issue.title}</div>
                    <div className="mt-0.5 text-[11px] opacity-90">{issue.detail}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Category Selector Strip (Scrollable Row on Mobile, 3-Col Grid on sm+) */}
            <div>
              <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Tuning Shop Category
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:grid sm:grid-cols-3">
                {PART_CATEGORIES.map((cat) => {
                  const active = selectedPartCat === cat;
                  const equippedId = equippedMap[cat];
                  const isUpgraded =
                    equippedId && !equippedId.endsWith('_oem') && equippedId !== 'wheels_oem_19';
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedPartCat(cat)}
                      className={`h-10 sm:h-auto border px-3 py-2 text-left text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 sm:whitespace-normal ${
                        active
                          ? 'border-sky-400 bg-sky-500/20 text-white'
                          : isUpgraded
                          ? 'border-amber-400/50 bg-amber-500/12 text-amber-200 hover:border-amber-400/75'
                          : 'border-white/10 bg-black/45 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="truncate">{PART_CATEGORY_LABELS[cat]}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Insufficient CR Notice */}
            {purchaseNotice && (
              <div className="flex items-center justify-between gap-2 border border-rose-500/60 bg-rose-950/50 px-3 py-2 text-xs text-rose-100">
                <span>{purchaseNotice}</span>
                <button
                  type="button"
                  onClick={() => setPurchaseNotice(null)}
                  className="text-[10px] font-bold uppercase text-rose-300 hover:text-white shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Parts List for Selected Category */}
            <div className="space-y-2">
              {categoryParts.map((part) => {
                const isEquipped =
                  (equippedMap[selectedPartCat] ??
                    (selectedPartCat === 'wheels' ? 'wheels_oem_19' : `${selectedPartCat}_oem`)) ===
                    part.id ||
                  (!equippedMap[selectedPartCat] && part.tier === 'OEM');
                const isUnlocked = isPartOwnedForCar(part.id, ownedPartIds) || true;
                return (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => equipPart(selectedPartCat, part.id, part.name, part.costCredits)}
                    className={`w-full border p-3 text-left transition-colors ${
                      isEquipped
                        ? 'border-sky-400 bg-sky-500/16 text-white'
                        : isUnlocked
                        ? 'border-white/12 bg-black/45 text-slate-300 hover:border-sky-400/50 hover:text-white'
                        : 'border-white/12 bg-black/45 text-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold">{part.name}</span>
                          <span className="border border-white/15 bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-sky-300 uppercase">
                            {part.tier}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-slate-400">{part.summary}</p>
                      </div>
                      <div className="font-mono-tabular text-right text-[11px] shrink-0">
                        <div
                          className={`font-bold ${
                            isEquipped ? 'text-sky-300' : 'text-emerald-300'
                          }`}
                        >
                          {isEquipped
                            ? 'EQUIPPED'
                            : part.tier === 'OEM'
                            ? 'STOCK'
                            : 'UNLOCKED'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {part.weightDeltaKg === 0
                            ? '±0.0 kg'
                            : `${part.weightDeltaKg > 0 ? '+' : ''}${part.weightDeltaKg} kg`}
                        </div>
                      </div>
                    </div>

                    <div className="font-mono-tabular mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/8 pt-1.5 text-[10px] text-slate-400">
                      <span>Power {(part.powerMult * 100).toFixed(1)}%</span>
                      <span>Heat {(part.heatFactor * 100).toFixed(0)}%</span>
                      <span>Fuel {(part.fuelBurnMult * 100).toFixed(0)}%</span>
                      <span>Rel {part.reliabilityPct}%</span>
                      {part.wheelDiameterIn && (
                        <span>
                          {part.wheelDiameterIn}&quot; ET{part.wheelOffsetMm}
                        </span>
                      )}
                      {part.rotorDiameterMm && <span>{part.rotorDiameterMm}mm Rotor</span>}
                      {part.steeringLockBonusRad ? (
                        <span className="text-amber-300">
                          +{Math.round((part.steeringLockBonusRad * 180) / Math.PI)}° Lock
                        </span>
                      ) : null}
                      {part.bumpCompliance && part.bumpCompliance !== 1 ? (
                        <span className="text-sky-300">
                          Bump {Math.round(part.bumpCompliance * 100)}%
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {activeTab === 'setup' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">
                Full Chassis, Alignment, Diff &amp; Gearing
              </span>
              <button
                type="button"
                onClick={() => onCarSetupChange(getDefaultCarSetup(carId))}
                className="inline-flex h-10 sm:h-auto items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-sky-400/50 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Setup</span>
              </button>
            </div>

            {/* Tire Compound */}
            <div>
              <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Tire Compound
              </div>
              <div className="mt-1.5 grid grid-cols-1 min-[400px]:grid-cols-2 gap-1.5">
                {COMPOUND_ORDER.map((id) => {
                  const meta = TIRE_COMPOUNDS[id];
                  const active = carSetup.tireCompound === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onCarSetupChange({ ...carSetup, tireCompound: id })}
                      className={`min-h-[44px] border p-2 text-left text-[11px] transition-colors ${
                        active
                          ? 'border-sky-400 bg-sky-500/18 text-white'
                          : 'border-white/10 bg-black/45 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="font-semibold">{meta.label}</div>
                      <div className="font-mono-tabular text-[10px] text-sky-300">
                        {Math.round(meta.gripMult * 100)}% Grip · {meta.wearMult.toFixed(2)}x Wear
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Springs & Dampers */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Springs, Dampers &amp; Platform
              </div>
              <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-2">
                <SliderRow
                  label="Front Spring"
                  valueText={`${carSetup.frontSpringNmm ?? 140} N/mm`}
                  min={80}
                  max={260}
                  step={5}
                  value={carSetup.frontSpringNmm ?? 140}
                  onChange={(v) => onCarSetupChange({ ...carSetup, frontSpringNmm: v })}
                />
                <SliderRow
                  label="Rear Spring"
                  valueText={`${carSetup.rearSpringNmm ?? 145} N/mm`}
                  min={80}
                  max={260}
                  step={5}
                  value={carSetup.rearSpringNmm ?? 145}
                  onChange={(v) => onCarSetupChange({ ...carSetup, rearSpringNmm: v })}
                />
                <SliderRow
                  label="Front Bump Damper"
                  valueText={`${(carSetup.frontBumpDamp ?? 0.72).toFixed(2)}`}
                  min={0.4}
                  max={1.4}
                  step={0.04}
                  value={carSetup.frontBumpDamp ?? 0.72}
                  onChange={(v) => onCarSetupChange({ ...carSetup, frontBumpDamp: v })}
                />
                <SliderRow
                  label="Front Rebound Damper"
                  valueText={`${(carSetup.frontReboundDamp ?? 0.76).toFixed(2)}`}
                  min={0.4}
                  max={1.4}
                  step={0.04}
                  value={carSetup.frontReboundDamp ?? 0.76}
                  onChange={(v) => onCarSetupChange({ ...carSetup, frontReboundDamp: v })}
                />
                <SliderRow
                  label="Rear Bump Damper"
                  valueText={`${(carSetup.rearBumpDamp ?? 0.72).toFixed(2)}`}
                  min={0.4}
                  max={1.4}
                  step={0.04}
                  value={carSetup.rearBumpDamp ?? 0.72}
                  onChange={(v) => onCarSetupChange({ ...carSetup, rearBumpDamp: v })}
                />
                <SliderRow
                  label="Rear Rebound Damper"
                  valueText={`${(carSetup.rearReboundDamp ?? 0.76).toFixed(2)}`}
                  min={0.4}
                  max={1.4}
                  step={0.04}
                  value={carSetup.rearReboundDamp ?? 0.76}
                  onChange={(v) => onCarSetupChange({ ...carSetup, rearReboundDamp: v })}
                />
                <SliderRow
                  label="Front Anti-Roll Bar"
                  valueText={`Lv ${carSetup.antiRollFront}`}
                  min={1}
                  max={10}
                  step={1}
                  value={carSetup.antiRollFront}
                  onChange={(v) => onCarSetupChange({ ...carSetup, antiRollFront: v })}
                  accentClass="text-amber-300"
                />
                <SliderRow
                  label="Rear Anti-Roll Bar"
                  valueText={`Lv ${carSetup.antiRollRear}`}
                  min={1}
                  max={10}
                  step={1}
                  value={carSetup.antiRollRear}
                  onChange={(v) => onCarSetupChange({ ...carSetup, antiRollRear: v })}
                  accentClass="text-amber-300"
                />
                <SliderRow
                  label="Ride Height"
                  valueText={`${carSetup.rideHeightMm} mm`}
                  min={45}
                  max={95}
                  step={1}
                  value={carSetup.rideHeightMm}
                  onChange={(v) => onCarSetupChange({ ...carSetup, rideHeightMm: v })}
                />
                <SliderRow
                  label="Front Weight Dist"
                  valueText={`${carSetup.weightDistributionFrontPct}%`}
                  min={40}
                  max={60}
                  step={1}
                  value={carSetup.weightDistributionFrontPct}
                  onChange={(v) =>
                    onCarSetupChange({ ...carSetup, weightDistributionFrontPct: v })
                  }
                />
              </div>
            </div>

            {/* Alignment & Cold Pressures */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Alignment (Camber / Toe) &amp; Cold Tire PSI
              </div>
              <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-2">
                <SliderRow
                  label="Front Camber"
                  valueText={`${(carSetup.camberFrontDeg ?? -2.4).toFixed(1)}°`}
                  min={-4.5}
                  max={0.0}
                  step={0.1}
                  value={carSetup.camberFrontDeg ?? -2.4}
                  onChange={(v) => onCarSetupChange({ ...carSetup, camberFrontDeg: v })}
                />
                <SliderRow
                  label="Rear Camber"
                  valueText={`${(carSetup.camberRearDeg ?? -1.8).toFixed(1)}°`}
                  min={-4.0}
                  max={0.0}
                  step={0.1}
                  value={carSetup.camberRearDeg ?? -1.8}
                  onChange={(v) => onCarSetupChange({ ...carSetup, camberRearDeg: v })}
                />
                <SliderRow
                  label="Front Toe (+In / -Out)"
                  valueText={`${(carSetup.toeFrontDeg ?? -0.08).toFixed(2)}°`}
                  min={-0.5}
                  max={0.5}
                  step={0.02}
                  value={carSetup.toeFrontDeg ?? -0.08}
                  onChange={(v) => onCarSetupChange({ ...carSetup, toeFrontDeg: v })}
                />
                <SliderRow
                  label="Rear Toe (+In / -Out)"
                  valueText={`${(carSetup.toeRearDeg ?? 0.16).toFixed(2)}°`}
                  min={-0.5}
                  max={0.5}
                  step={0.02}
                  value={carSetup.toeRearDeg ?? 0.16}
                  onChange={(v) => onCarSetupChange({ ...carSetup, toeRearDeg: v })}
                />
                <SliderRow
                  label="Cold Tire PSI (Front)"
                  valueText={`${(carSetup.tirePressureFrontPsi ?? 27.5).toFixed(1)} PSI`}
                  min={21.0}
                  max={33.0}
                  step={0.5}
                  value={carSetup.tirePressureFrontPsi ?? 27.5}
                  onChange={(v) => onCarSetupChange({ ...carSetup, tirePressureFrontPsi: v })}
                  accentClass="text-emerald-300"
                />
                <SliderRow
                  label="Cold Tire PSI (Rear)"
                  valueText={`${(carSetup.tirePressureRearPsi ?? 27.0).toFixed(1)} PSI`}
                  min={21.0}
                  max={33.0}
                  step={0.5}
                  value={carSetup.tirePressureRearPsi ?? 27.0}
                  onChange={(v) => onCarSetupChange({ ...carSetup, tirePressureRearPsi: v })}
                  accentClass="text-emerald-300"
                />
              </div>
            </div>

            {/* Differential, Brakes, Gearing, Aero & ECU */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Differential, Brakes, Gearing, Aero &amp; ECU
              </div>
              <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-2">
                {(() => {
                  const frontPct = Math.round(
                    Math.min(68, Math.max(46, 57.5 + carSetup.brakeBalance * 1.8)) * 10,
                  ) / 10;
                  const rearPct = Math.round((100 - frontPct) * 10) / 10;
                  const bbSign = carSetup.brakeBalance > 0 ? `+${carSetup.brakeBalance.toFixed(1)}` : carSetup.brakeBalance.toFixed(1);
                  return (
                    <SliderRow
                      label="Brake Bias (F / R)"
                      valueText={`${bbSign} · ${frontPct.toFixed(1)}% / ${rearPct.toFixed(1)}%`}
                      min={-5}
                      max={5}
                      step={0.5}
                      value={carSetup.brakeBalance}
                      onChange={(v) => onCarSetupChange({ ...carSetup, brakeBalance: v })}
                      accentClass="text-sky-300"
                    />
                  );
                })()}
                <SliderRow
                  label="Diff Preload"
                  valueText={`${carSetup.diffPreloadNm ?? 140} Nm`}
                  min={20}
                  max={260}
                  step={10}
                  value={carSetup.diffPreloadNm ?? 140}
                  onChange={(v) => onCarSetupChange({ ...carSetup, diffPreloadNm: v })}
                />
                <SliderRow
                  label="Diff Power Lock"
                  valueText={`${carSetup.diffPowerLockPct ?? 50}%`}
                  min={15}
                  max={95}
                  step={5}
                  value={carSetup.diffPowerLockPct ?? 50}
                  onChange={(v) => onCarSetupChange({ ...carSetup, diffPowerLockPct: v })}
                />
                <SliderRow
                  label="Diff Coast Lock"
                  valueText={`${carSetup.diffCoastLockPct ?? 30}%`}
                  min={10}
                  max={80}
                  step={5}
                  value={carSetup.diffCoastLockPct ?? 30}
                  onChange={(v) => onCarSetupChange({ ...carSetup, diffCoastLockPct: v })}
                />
                <SliderRow
                  label="Final Drive Ratio"
                  valueText={`${(carSetup.finalDriveRatio ?? baseSpec.finalDrive).toFixed(2)}`}
                  min={2.8}
                  max={4.5}
                  step={0.04}
                  value={carSetup.finalDriveRatio ?? baseSpec.finalDrive}
                  onChange={(v) => onCarSetupChange({ ...carSetup, finalDriveRatio: v })}
                />
                <SliderRow
                  label="Gear Spacing Scale"
                  valueText={`${(carSetup.gearRatioScale ?? 1.0).toFixed(2)}x`}
                  min={0.82}
                  max={1.18}
                  step={0.02}
                  value={carSetup.gearRatioScale ?? 1.0}
                  onChange={(v) => onCarSetupChange({ ...carSetup, gearRatioScale: v })}
                />
                <SliderRow
                  label="Front Aero Scale"
                  valueText={`${Math.round((carSetup.downforceFrontScale ?? 1.0) * 100)}%`}
                  min={0.6}
                  max={1.4}
                  step={0.04}
                  value={carSetup.downforceFrontScale ?? 1.0}
                  onChange={(v) => onCarSetupChange({ ...carSetup, downforceFrontScale: v })}
                />
                <SliderRow
                  label="Rear Aero Scale"
                  valueText={`${Math.round((carSetup.downforceRearScale ?? 1.0) * 100)}%`}
                  min={0.6}
                  max={1.4}
                  step={0.04}
                  value={carSetup.downforceRearScale ?? 1.0}
                  onChange={(v) => onCarSetupChange({ ...carSetup, downforceRearScale: v })}
                />
                <SliderRow
                  label="ECU Boost Target"
                  valueText={`${Math.round((carSetup.ecuBoostScale ?? 1.0) * 100)}%`}
                  min={0.85}
                  max={1.18}
                  step={0.01}
                  value={carSetup.ecuBoostScale ?? 1.0}
                  onChange={(v) => onCarSetupChange({ ...carSetup, ecuBoostScale: v })}
                  accentClass="text-amber-300"
                />
                <SliderRow
                  label="Rev Limit Offset"
                  valueText={`${(carSetup.revLimitOffsetRpm ?? 0) >= 0 ? '+' : ''}${carSetup.revLimitOffsetRpm ?? 0} RPM`}
                  min={-400}
                  max={600}
                  step={50}
                  value={carSetup.revLimitOffsetRpm ?? 0}
                  onChange={(v) => onCarSetupChange({ ...carSetup, revLimitOffsetRpm: v })}
                  accentClass="text-amber-300"
                />
              </div>

              {/* Dedicated Active Aero DRS Toggle & Separate Auto-Deploy System Card */}
              <div
                data-tutorial="tuning-active-aero"
                className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border border-sky-400/35 bg-sky-500/10 p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold tracking-wider text-white uppercase">
                      Active Aero DRS &amp; Auto-Deployment
                    </span>
                    <span className="font-mono-tabular text-[10px] font-semibold text-amber-300">
                      {currProj.dragCdA.toFixed(3)} CdA · {currProj.downforceKgf250} kgf @ 250
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-300">
                    {currentAeroMode === 'auto'
                      ? 'Auto-Deploy active (DF in corners, DRS on straights). Use DRS toggle anytime for manual wing override.'
                      : currentAeroMode === 'manual'
                      ? 'Manual DRS wing control active (separate from Auto-Deploy).'
                      : 'Fixed Aero locked at neutral track spec.'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    data-testid="setup-active-aero-drs-toggle"
                    onClick={handleDedicatedAeroToggle}
                    className={`h-10 sm:h-auto border px-2.5 py-1 text-[10px] font-bold uppercase whitespace-nowrap shrink-0 transition-colors ${
                      currentAeroMode === 'off'
                        ? 'border-white/20 bg-black/50 text-slate-300 hover:border-amber-400/70'
                        : effectiveAeroDeployed
                        ? 'border-emerald-400/70 bg-emerald-500/20 text-emerald-200'
                        : 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                    }`}
                  >
                    {isRaceLive
                      ? effectiveAeroDeployed
                        ? 'Active Aero DRS: Closed (DF)'
                        : 'Active Aero DRS: Open (DRS)'
                      : effectiveAeroDeployed
                      ? 'DRS Preview: Closed'
                      : 'DRS Preview: Open'}
                  </button>
                  <button
                    type="button"
                    data-testid="setup-active-aero-auto-toggle"
                    onClick={() => {
                      const nextMode = currentAeroMode === 'auto' ? 'manual' : 'auto';
                      onCarSetupChange({
                        ...carSetup,
                        activeAeroEnabled: true,
                        activeAeroMode: nextMode,
                      });
                    }}
                    className={`h-10 sm:h-auto border px-2.5 py-1 text-[10px] font-bold uppercase whitespace-nowrap shrink-0 transition-colors ${
                      currentAeroMode === 'auto'
                        ? 'border-sky-400 bg-sky-500 text-slate-950'
                        : 'border-indigo-400/70 bg-indigo-500/25 text-indigo-100 hover:border-sky-400/60'
                    }`}
                  >
                    {currentAeroMode === 'auto' ? 'Auto-Deploy: ON' : 'Auto-Deploy: OFF'}
                  </button>
                  <button
                    type="button"
                    data-testid="setup-active-aero-fixed-toggle"
                    onClick={() => {
                      const nextMode = currentAeroMode === 'off' ? 'auto' : 'off';
                      onCarSetupChange({
                        ...carSetup,
                        activeAeroEnabled: nextMode !== 'off',
                        activeAeroMode: nextMode,
                      });
                    }}
                    className={`h-10 sm:h-auto border px-2.5 py-1 text-[10px] font-bold uppercase whitespace-nowrap shrink-0 transition-colors ${
                      currentAeroMode === 'off'
                        ? 'border-amber-400 bg-amber-400 text-slate-950'
                        : 'border-white/20 bg-black/50 text-slate-300 hover:border-white/40'
                    }`}
                  >
                    Fixed Wing
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'visuals' && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-wider text-slate-300 uppercase">
                Exterior Color, Aero, Livery &amp; Stance
              </span>
              <button
                type="button"
                onClick={() => onVisualConfigChange(getDefaultVisualCustomization(carId))}
                className="inline-flex h-10 sm:h-auto items-center gap-1.5 border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold text-slate-200 hover:border-sky-400/50 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Reset Exterior</span>
              </button>
            </div>

            {/* Body Paint Color & Finish */}
            <div className="border border-white/10 bg-black/45 p-3">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold tracking-wider text-slate-300 uppercase">Body Paint</span>
                <label className="flex items-center gap-2 font-mono-tabular text-slate-300">
                  <span>{visualConfig.paintHex.toUpperCase()}</span>
                  <input
                    type="color"
                    value={visualConfig.paintHex}
                    onChange={(e) =>
                      onVisualConfigChange({ ...visualConfig, paintHex: e.target.value })
                    }
                    className="h-8 w-10 sm:h-6 sm:w-8 cursor-pointer border border-white/20 bg-transparent p-0"
                  />
                </label>
              </div>
              <div className="mt-2.5 grid grid-cols-2 min-[460px]:grid-cols-4 gap-1.5">
                {PAINT_SWATCHES.map((sw) => {
                  const selected = visualConfig.paintHex.toLowerCase() === sw.hex.toLowerCase();
                  return (
                    <button
                      key={sw.hex}
                      type="button"
                      onClick={() => onVisualConfigChange({ ...visualConfig, paintHex: sw.hex })}
                      className={`min-h-[40px] sm:min-h-0 flex items-center gap-2 border px-2 py-1.5 text-left text-[11px] sm:text-[10px] ${
                        selected
                          ? 'border-sky-400 bg-sky-500/15 text-white'
                          : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      <span
                        className="h-4 w-4 sm:h-3.5 sm:w-3.5 shrink-0 border border-white/25"
                        style={{ backgroundColor: sw.hex }}
                      />
                      <span className="truncate">{sw.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Coat Finish
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {FINISH_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => onVisualConfigChange({ ...visualConfig, paintFinish: f.id })}
                    className={`min-h-[40px] sm:min-h-0 border py-1.5 text-[11px] font-semibold ${
                      visualConfig.paintFinish === f.id
                        ? 'border-sky-400 bg-sky-500/20 text-white'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Per-Part Exterior Colors & Tints */}
            <div className="border border-white/10 bg-black/45 p-3 space-y-2.5">
              <div className="text-[10px] font-bold tracking-wider text-slate-300 uppercase">
                Per-Part Colors &amp; Glass / Lens Tints
              </div>
              <div className="grid grid-cols-2 min-[460px]:grid-cols-3 gap-2 text-[11px]">
                {[
                  { label: 'Trim & Diffuser', key: 'trimHex' as const },
                  { label: 'Rear Wing', key: 'wingHex' as const },
                  { label: 'Brake Calipers', key: 'caliperHex' as const },
                  { label: 'Headlight Tint', key: 'headlightTintHex' as const },
                  { label: 'Window Tint', key: 'windowTintHex' as const },
                  { label: 'Custom Rim Color', key: 'rimHex' as const },
                ].map((part) => (
                  <label
                    key={part.key}
                    className="min-h-[40px] sm:min-h-0 flex items-center justify-between gap-1.5 border border-white/10 bg-black/50 px-2.5 py-1.5"
                  >
                    <span className="truncate text-[10px] text-slate-300">{part.label}</span>
                    <input
                      type="color"
                      value={visualConfig[part.key]}
                      onChange={(e) =>
                        onVisualConfigChange({
                          ...visualConfig,
                          [part.key]: e.target.value,
                          ...(part.key === 'rimHex' ? { wheelFinish: 'custom_hex' as const } : {}),
                        })
                      }
                      className="h-6 w-7 sm:h-5 sm:w-6 shrink-0 cursor-pointer border border-white/20 bg-transparent p-0"
                    />
                  </label>
                ))}
              </div>

              <SliderRow
                label="Window Tint Darkness"
                valueText={`${Math.round((visualConfig.windowTintOpacity ?? 0.36) * 100)}%`}
                min={0.14}
                max={0.88}
                step={0.04}
                value={visualConfig.windowTintOpacity ?? 0.36}
                onChange={(v) =>
                  onVisualConfigChange({ ...visualConfig, windowTintOpacity: v })
                }
              />

              <div>
                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  Exhaust Tip Finish
                </div>
                <div className="mt-1.5 grid grid-cols-2 min-[440px]:grid-cols-4 gap-1.5">
                  {EXHAUST_OPTIONS.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => onVisualConfigChange({ ...visualConfig, exhaustFinish: ex.id })}
                      className={`min-h-[40px] sm:min-h-0 border py-1.5 px-2 text-[10px] font-semibold ${
                        visualConfig.exhaustFinish === ex.id
                          ? 'border-sky-400 bg-sky-500/20 text-white'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Livery Wrap, Decals & Racing Number */}
            <div className="border border-white/10 bg-black/45 p-3 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="font-bold tracking-wider text-slate-300 uppercase">
                  Livery Pattern, Decals &amp; Number
                </span>
                <div className="flex items-center gap-1.5">
                  {ACCENT_SWATCHES.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Accent ${hex}`}
                      onClick={() => onVisualConfigChange({ ...visualConfig, wrapAccentHex: hex })}
                      className={`h-7 w-7 sm:h-4 sm:w-4 border ${
                        visualConfig.wrapAccentHex.toLowerCase() === hex.toLowerCase()
                          ? 'border-sky-400 scale-110'
                          : 'border-white/25'
                      }`}
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                  <input
                    type="color"
                    aria-label="Custom Livery Accent Color"
                    value={visualConfig.wrapAccentHex}
                    onChange={(e) =>
                      onVisualConfigChange({ ...visualConfig, wrapAccentHex: e.target.value })
                    }
                    className="h-7 w-8 sm:h-5 sm:w-6 cursor-pointer border border-white/20 bg-transparent p-0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-1.5">
                {WRAP_OPTIONS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => onVisualConfigChange({ ...visualConfig, wrapPattern: w.id })}
                    className={`min-h-[44px] border p-2 text-left ${
                      visualConfig.wrapPattern === w.id
                        ? 'border-sky-400 bg-sky-500/18 text-white'
                        : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <div className="text-[11px] font-bold">{w.label}</div>
                    <div className="text-[10px] text-slate-400">{w.desc}</div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 min-[440px]:grid-cols-4 gap-1.5">
                {DECAL_OPTIONS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onVisualConfigChange({ ...visualConfig, decalStyle: d.id })}
                    className={`min-h-[40px] sm:min-h-0 border py-1.5 px-2 text-[10px] font-semibold ${
                      visualConfig.decalStyle === d.id
                        ? 'border-sky-400 bg-sky-500/20 text-white'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between border border-white/10 bg-black/50 px-3 py-2 text-xs sm:text-[11px]">
                <span className="font-medium text-slate-300">Racing Number</span>
                <input
                  type="text"
                  maxLength={3}
                  value={visualConfig.racingNumber}
                  onChange={(e) =>
                    onVisualConfigChange({
                      ...visualConfig,
                      racingNumber: e.target.value.replace(/[^0-9A-Za-z]/g, '').slice(0, 3),
                    })
                  }
                  className="font-mono-tabular h-10 sm:h-auto w-20 sm:w-16 border border-white/20 bg-black/60 px-2 py-1 sm:py-0.5 text-center text-base sm:text-xs font-bold text-white uppercase focus:border-sky-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Swappable Aero Bodywork & Active Aero */}
            <div className="border border-white/10 bg-black/45 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-bold tracking-wider text-slate-300 uppercase">
                  Swappable Exterior Aero Kits (Live Physics)
                </span>
                <span className="font-mono-tabular text-[10px] text-emerald-300">
                  {currProj.downforceKgf250} kgf @250 · CdA {currProj.dragCdA.toFixed(3)}
                </span>
              </div>

              {(() => {
                const aeroMode =
                  carSetup.activeAeroMode ??
                  (carSetup.activeAeroEnabled === false ? 'off' : 'auto');
                const wingless = visualConfig.rearWingSize === 'none';
                return (
                  <div className="space-y-2 border border-sky-400/30 bg-sky-500/8 px-2.5 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-bold text-white uppercase">
                          Active Aero Actuator System
                        </div>
                        <div className="text-[10px] text-slate-300">
                          {aeroMode === 'auto'
                            ? 'Auto deploys DF in corners/braking & DRS flat on straights'
                            : aeroMode === 'manual'
                            ? 'Toggle mid-race with X key or HUD button'
                            : 'Fixed aero attitude locked to static downforce setting'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleDedicatedAeroToggle}
                        className={`h-9 sm:h-auto border px-2.5 py-1 text-[10px] font-bold uppercase whitespace-nowrap shrink-0 ${
                          effectiveAeroDeployed
                            ? 'border-emerald-400/65 bg-emerald-500/20 text-emerald-200'
                            : 'border-amber-400/65 bg-amber-500/20 text-amber-200'
                        }`}
                      >
                        {isRaceLive
                          ? effectiveAeroDeployed
                            ? 'Live: Downforce'
                            : 'Live: DRS Retracted'
                          : effectiveAeroDeployed
                          ? 'Preview: Downforce'
                          : 'Preview: DRS Flat'}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'off', label: 'Fixed' },
                          { id: 'manual', label: 'Manual (X)' },
                          { id: 'auto', label: 'Auto DF/DRS' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            onCarSetupChange({
                              ...carSetup,
                              activeAeroMode: opt.id,
                              activeAeroEnabled: opt.id !== 'off',
                            })
                          }
                          className={`min-h-[40px] sm:min-h-0 border px-2 py-1.5 text-[10px] font-bold uppercase transition-colors ${
                            aeroMode === opt.id
                              ? 'border-sky-400 bg-sky-500 text-slate-950'
                              : 'border-white/15 bg-black/50 text-slate-300 hover:border-white/30'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {wingless && aeroMode !== 'off' && (
                      <div className="text-[10px] text-amber-200/90">
                        Wingless kit equipped — front splitter &amp; underbody aero flaps still actuate dynamically.
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  Front Splitter &amp; Canards
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1.5">
                  {FRONT_AERO_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onVisualConfigChange({
                          ...visualConfig,
                          frontAero: opt.id,
                          showSplitter: opt.id !== 'oem',
                        })
                      }
                      className={`min-h-[44px] border p-2 sm:p-1.5 text-left ${
                        visualConfig.frontAero === opt.id
                          ? 'border-sky-400 bg-sky-500/18 text-white'
                          : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="text-[11px] font-bold">{opt.label}</div>
                      <div className="font-mono-tabular text-[9px] text-sky-300">{opt.spec}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  Side Skirts &amp; Underfloor Blades
                </div>
                <div className="mt-1 grid grid-cols-1 min-[420px]:grid-cols-3 gap-1.5">
                  {SIDE_AERO_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        onVisualConfigChange({
                          ...visualConfig,
                          sideAero: opt.id,
                          showSideSkirts: opt.id !== 'oem',
                        })
                      }
                      className={`min-h-[42px] border p-2 sm:p-1.5 text-left ${
                        visualConfig.sideAero === opt.id
                          ? 'border-sky-400 bg-sky-500/18 text-white'
                          : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="text-[11px] sm:text-[10px] font-bold truncate">{opt.label}</div>
                      <div className="font-mono-tabular text-[9px] text-sky-300">{opt.spec}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    Rear Diffuser
                  </div>
                  <div className="mt-1 space-y-1">
                    {DIFFUSER_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onVisualConfigChange({ ...visualConfig, rearDiffuser: opt.id })
                        }
                        className={`min-h-[40px] sm:min-h-0 flex w-full items-center justify-between border px-2.5 py-1.5 sm:py-1 text-[10px] ${
                          visualConfig.rearDiffuser === opt.id
                            ? 'border-sky-400 bg-sky-500/18 text-white'
                            : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <span className="font-semibold">{opt.label}</span>
                        <span className="font-mono-tabular text-[9px] text-sky-300">{opt.spec}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                    Hood Extractors
                  </div>
                  <div className="mt-1 space-y-1">
                    {HOOD_VENT_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          onVisualConfigChange({ ...visualConfig, hoodVents: opt.id })
                        }
                        className={`min-h-[40px] sm:min-h-0 flex w-full items-center justify-between border px-2.5 py-1.5 sm:py-1 text-[10px] ${
                          visualConfig.hoodVents === opt.id
                            ? 'border-sky-400 bg-sky-500/18 text-white'
                            : 'border-white/10 bg-black/50 text-slate-300 hover:border-white/25'
                        }`}
                      >
                        <span className="font-semibold">{opt.label}</span>
                        <span className="font-mono-tabular text-[9px] text-emerald-300">{opt.spec}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  Rear Wing Assembly
                </div>
                <div className="mt-1.5 grid grid-cols-2 min-[440px]:grid-cols-3 gap-1.5">
                  {WING_OPTIONS.map((wg) => (
                    <button
                      key={wg.id}
                      type="button"
                      onClick={() =>
                        onVisualConfigChange({ ...visualConfig, rearWingSize: wg.id })
                      }
                      className={`min-h-[40px] sm:min-h-0 border py-1.5 text-[10px] font-semibold ${
                        visualConfig.rearWingSize === wg.id
                          ? 'border-sky-400 bg-sky-500/20 text-white'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {wg.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Wheels & Live Stance Fitment */}
            <div className="border border-white/10 bg-black/45 p-3 space-y-2.5">
              <div>
                <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  Wheel Rim Finish
                </div>
                <div className="mt-1.5 grid grid-cols-2 min-[440px]:grid-cols-3 gap-1.5">
                  {WHEEL_FINISH_OPTIONS.map((wf) => (
                    <button
                      key={wf.id}
                      type="button"
                      onClick={() => onVisualConfigChange({ ...visualConfig, wheelFinish: wf.id })}
                      className={`min-h-[40px] sm:min-h-0 border py-1.5 px-2 text-left text-[10px] font-semibold ${
                        visualConfig.wheelFinish === wf.id
                          ? 'border-sky-400 bg-sky-500/20 text-white'
                          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25'
                      }`}
                    >
                      {wf.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase pt-1">
                Stance, Track Width &amp; Geometry (Synced to Chassis)
              </div>
              <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-2">
                <SliderRow
                  label="Spacer Offset"
                  valueText={`${(visualConfig.wheelOffsetMm ?? 0) >= 0 ? '+' : ''}${visualConfig.wheelOffsetMm ?? 0} mm`}
                  min={-12}
                  max={28}
                  step={2}
                  value={visualConfig.wheelOffsetMm ?? 0}
                  onChange={(v) => onVisualConfigChange({ ...visualConfig, wheelOffsetMm: v })}
                  accentClass="text-amber-300"
                />
                <SliderRow
                  label="Ride Height"
                  valueText={`${carSetup.rideHeightMm} mm`}
                  min={45}
                  max={95}
                  step={1}
                  value={carSetup.rideHeightMm}
                  onChange={(v) => onCarSetupChange({ ...carSetup, rideHeightMm: v })}
                />
                <SliderRow
                  label="Front Camber"
                  valueText={`${(carSetup.camberFrontDeg ?? -2.4).toFixed(1)}°`}
                  min={-4.5}
                  max={0.0}
                  step={0.1}
                  value={carSetup.camberFrontDeg ?? -2.4}
                  onChange={(v) => onCarSetupChange({ ...carSetup, camberFrontDeg: v })}
                />
                <SliderRow
                  label="Rear Camber"
                  valueText={`${(carSetup.camberRearDeg ?? -1.8).toFixed(1)}°`}
                  min={-4.0}
                  max={0.0}
                  step={0.1}
                  value={carSetup.camberRearDeg ?? -1.8}
                  onChange={(v) => onCarSetupChange({ ...carSetup, camberRearDeg: v })}
                />
              </div>
            </div>
          </>
        )}

        {activeTab === 'legality' && (
          <>
            {/* PP Class Rating Card */}
            <div className="border border-sky-400/35 bg-sky-950/20 p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-sky-300 uppercase">
                    Performance Points Index
                  </div>
                  <div className="font-mono-tabular mt-0.5 text-3xl font-bold text-white">
                    {legality.ppReport.pp.toFixed(1)}{' '}
                    <span className="text-sm text-sky-300">PP</span>
                  </div>
                </div>
                <div className="border border-amber-400/50 bg-amber-500/15 px-3 py-1.5 text-center">
                  <div className="text-[9px] font-bold tracking-wider text-amber-300 uppercase">
                    Class Bracket
                  </div>
                  <div className="font-display text-base font-bold text-white">
                    {legality.ppReport.bracket}
                  </div>
                </div>
              </div>

              <div className="font-mono-tabular mt-3 grid grid-cols-4 gap-2 border-t border-white/10 pt-2.5 text-center text-[11px]">
                <div>
                  <div className="text-[9px] text-slate-400 uppercase">HP/Ton</div>
                  <div className="font-semibold text-white">
                    {legality.ppReport.powerToWeightHpPerTon}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 uppercase">Est Lat G</div>
                  <div className="font-semibold text-emerald-300">
                    {legality.ppReport.estPeakLatG.toFixed(2)} G
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 uppercase">Est Decel</div>
                  <div className="font-semibold text-sky-300">
                    {legality.ppReport.estPeakDecelG.toFixed(2)} G
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-slate-400 uppercase">Aero Index</div>
                  <div className="font-semibold text-amber-300">
                    {legality.ppReport.downforceIndex.toFixed(2)}x
                  </div>
                </div>
              </div>
            </div>

            {/* Open Pure Customisation Policy */}
            <div className="border border-emerald-500/35 bg-emerald-950/25 p-3">
              <div className="text-xs font-bold text-emerald-200">Unrestricted Build Mode Active</div>
              <div className="text-[11px] text-slate-300 mt-0.5">
                All upgrades, camber stances, wheel spacers, and engine tunes are unrestricted and launch-ready on every circuit.
              </div>
            </div>

            {/* Event Rule Selector (Reference Brackets) */}
            <div>
              <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                Class Benchmark Comparison
              </div>
              <div className="mt-1.5 space-y-1.5">
                {EVENT_LEGALITY_RULES.map((rule) => {
                  const selected = rule.id === legality.rule.id;
                  return (
                    <button
                      key={rule.id}
                      type="button"
                      onClick={() => onLegalityRuleChange(rule.id)}
                      className={`w-full border p-2.5 text-left ${
                        selected
                          ? 'border-sky-400 bg-sky-500/15 text-white'
                          : 'border-white/10 bg-black/45 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold">
                        <span>{rule.label}</span>
                        <span className="font-mono-tabular text-[10px] text-slate-400">
                          Ref {rule.minWeightKg} kg · {rule.allowedDrivetrains.join('/')}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Advisory Clearance Notes */}
            <div className="space-y-1.5">
              {legality.warnings.length === 0 ? (
                <div className="flex items-center gap-2 border border-emerald-500/40 bg-emerald-950/30 p-3 text-xs text-emerald-200">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Vehicle build is cleared with zero fender or suspension clearance warnings.</span>
                </div>
              ) : (
                legality.warnings.map((w, i) => (
                  <div
                    key={`w-${i}`}
                    className="flex items-start gap-2 border border-amber-500/45 bg-amber-950/35 p-2.5 text-xs text-amber-100"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'analytics' && (
          <DriverAnalyticsPanel
            analytics={driverAnalytics ?? createEmptyDriverAnalytics()}
            onReset={onResetDriverAnalytics}
          />
        )}
      </div>
    </aside>
  );
}
