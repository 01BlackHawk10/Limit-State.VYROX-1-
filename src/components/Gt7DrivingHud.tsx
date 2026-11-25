import {
  Activity,
  AlertTriangle,
  Aperture,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Flag,
  Flame,
  Fuel,
  Gauge,
  Ghost,
  Lightbulb,
  LogOut,
  MessageSquare,
  Radio,
  RotateCcw,
  Send,
  Settings,
  Shield,
  ShieldOff,
  SkipForward,
  Sliders,
  Thermometer,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  runQuickPhysicsSelfTests,
  type SelfTestSuiteResult,
} from '../engine/physicsSelfTest';
import {
  CctvStationInfo,
  CockpitDialState,
  DrivingCameraMode,
  EngineerRadioCaption,
  GameMode,
  getCircuitMinimapData,
  MAP_REGISTRY,
  MapId,
  PitStrategyPlan,
  TIRE_COMPOUNDS,
  TireCompoundId,
  VehicleAssists,
  VehicleTelemetry,
} from '../engine/SceneController';
import {
  type CustomMapBlueprint,
  DEFAULT_HUD_VISIBILITY,
  getPartyModeMeta,
  type HudVisibilityConfig,
  type PartyCollisionMode,
  type PartyRoomState,
} from '../shared/socialTypes';
import { formatLapMs } from './MainScreenOverlay';

interface Gt7DrivingHudProps {
  activeMapId: MapId;
  activeCustomBlueprint?: CustomMapBlueprint | null;
  telemetry: VehicleTelemetry;
  subscribeTelemetry?: (listener: (tlm: VehicleTelemetry) => void) => () => void;
  assists: VehicleAssists;
  drivingCamera: DrivingCameraMode;
  weatherLabel: string;
  weatherAutoEnabled?: boolean;
  weatherProgressPct?: number;
  phaseLabel: string;
  mapRevision: number;
  isHudHidden: boolean;
  hudVisibility: HudVisibilityConfig;
  minimapMode: 'overview' | 'ahead';
  isSpectator: boolean;
  isCctv: boolean;
  headlightsOn: boolean;
  cctvStations: CctvStationInfo[];
  cctvStationIndex: number;
  preRaceIntroActive: boolean;
  engineerCaption: EngineerRadioCaption | null;
  advancedTelemetryEnabled: boolean;
  cockpitDials: CockpitDialState;
  pitStrategy: PitStrategyPlan;
  activeParty?: PartyRoomState | null;
  currentUserId?: string | null;
  onChangeHudVisibility: (next: HudVisibilityConfig) => void;
  onHudMenuOpenChange?: (open: boolean) => void;
  onTogglePartyCollisionMode?: (mode: PartyCollisionMode) => void;
  onSendPartyChat?: (text: string) => void;
  onLeaveParty?: () => void;
  onCockpitDialsChange: (dials: CockpitDialState) => void;
  onPitStrategyChange: (strategy: PitStrategyPlan) => void;
  onToggleMinimapMode: () => void;
  onExportTelemetryCsv: () => void;
  onSkipPreRaceIntro: () => void;
  onCycleDrivingCamera: () => void;
  onCycleCctv: (delta: number) => void;
  onReturnToDrive: () => void;
  onResetTrack: () => void;
  onToggleHeadlights?: () => void;
  onToggleActiveAero?: () => void;
  onOpenTuning?: () => void;
  onEnterPhotoMode?: () => void;
  onOpenSettings: () => void;
  onToggleHudHidden?: () => void;
}

const CAM_LABELS: Record<DrivingCameraMode, string> = {
  chase: 'Chase',
  chaseFar: 'Chase Far',
  cockpit: 'Cockpit',
  windshield: 'Windshield',
  hood: 'Hood Cam',
  bumper: 'Bumper Cam',
};

const MODE_LABELS: Record<GameMode, string> = {
  time_trial: 'Time Trial',
  sprint: 'AI Sprint',
  endurance: 'Endurance',
  drift: 'Drift Attack',
  tofu_delivery: 'Tofu Delivery',
};

function formatDeltaMs(delta: number | null): { text: string; colorClass: string } {
  if (delta === null) return { text: '--.---', colorClass: 'text-slate-400' };
  const sign = delta <= 0 ? '-' : '+';
  const sec = (Math.abs(delta) / 1000).toFixed(3);
  return {
    text: `${sign}${sec}`,
    colorClass: delta <= 0 ? 'text-emerald-400' : 'text-rose-400',
  };
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarToCartesian(cx, cy, r, endDeg);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? '0' : '1';
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function tireBoxBorder(lifePct: number, gripLossPct: number): string {
  if (lifePct < 20) return 'border-rose-500/85 bg-rose-950/45';
  if (lifePct < 40 || gripLossPct > 18) return 'border-amber-400/65 bg-amber-950/25';
  return 'border-white/12 bg-black/55';
}

function thermalBadge(tempC: number, hotC: number, warmC: number) {
  if (tempC >= hotC) return { label: 'HOT', color: 'text-rose-400' };
  if (tempC >= warmC) return { label: 'OPT', color: 'text-emerald-400' };
  return { label: 'WARM', color: 'text-sky-300' };
}

const HUD_TOGGLE_ITEMS: Array<{ key: keyof HudVisibilityConfig; label: string }> = [
  { key: 'showGearRpm', label: 'Gear/RPM' },
  { key: 'showMinimap', label: 'Track Map' },
  { key: 'showTelemetryGraph', label: 'Telemetry Graph' },
  { key: 'showSectorTimes', label: 'Sector Times' },
  { key: 'showSpeedometer', label: 'Speedometer' },
  { key: 'showLapAndPosition', label: 'Lap & Position' },
  { key: 'showPartyHud', label: 'Party Lobby HUD' },
  { key: 'showTrackWeatherStatus', label: 'Weather / Surface / Auto' },
  { key: 'showTopActionButtons', label: 'Tune & Aero Top Buttons' },
  { key: 'showMfdDials', label: 'Tire, Fuel & Pit MFD' },
  { key: 'showEngineHealth', label: 'Engine Health & PSI' },
  { key: 'showTrackRubber', label: 'Track Rubbering Bar' },
];

const TELEMETRY_GRAPH_CAPACITY = 72;

export const Gt7DrivingHud = memo(function Gt7DrivingHud({
  activeMapId,
  activeCustomBlueprint = null,
  telemetry,
  subscribeTelemetry,
  assists,
  drivingCamera,
  weatherLabel,
  weatherAutoEnabled = false,
  weatherProgressPct = 0,
  phaseLabel,
  mapRevision,
  isHudHidden,
  hudVisibility,
  minimapMode,
  isSpectator,
  isCctv,
  headlightsOn,
  cctvStations,
  cctvStationIndex,
  preRaceIntroActive,
  engineerCaption,
  advancedTelemetryEnabled,
  cockpitDials,
  pitStrategy,
  activeParty = null,
  currentUserId = null,
  onChangeHudVisibility,
  onHudMenuOpenChange,
  onTogglePartyCollisionMode,
  onSendPartyChat,
  onLeaveParty,
  onCockpitDialsChange,
  onPitStrategyChange,
  onToggleMinimapMode,
  onExportTelemetryCsv,
  onSkipPreRaceIntro,
  onCycleDrivingCamera,
  onCycleCctv,
  onReturnToDrive,
  onResetTrack,
  onToggleHeadlights,
  onToggleActiveAero,
  onOpenTuning,
  onEnterPhotoMode,
  onOpenSettings,
  onToggleHudHidden,
}: Gt7DrivingHudProps) {
  const [liveTlm, setLiveTlm] = useState<VehicleTelemetry>(telemetry);
  const [mfdTab, setMfdTab] = useState<'dials' | 'pit'>('dials');
  const [selfTestResult, setSelfTestResult] = useState<SelfTestSuiteResult | null>(null);
  const [hudMenuOpen, setHudMenuOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileMfdOpen, setMobileMfdOpen] = useState(false);
  const [mobilePartyOpen, setMobilePartyOpen] = useState(false);

  const lastHudSyncMsRef = useRef(0);
  const lastDiscreteHudRef = useRef<{
    gear: number;
    lap: number;
    pitStatus: VehicleTelemetry['pitStatus'];
    countdownLabel: string;
    raceFinished: boolean;
    aeroDeployed: boolean;
    activeAeroEnabled: boolean;
    shreddedCount: number;
    fuelState: VehicleTelemetry['fuelState'];
    tofuFailed: boolean;
    tofuSpilling: boolean;
    ghostActive: boolean;
    tandemRole: VehicleTelemetry['tandemRole'];
  } | null>(null);

  useEffect(() => {
    setLiveTlm(telemetry);
  }, [telemetry]);

  useEffect(() => {
    if (!subscribeTelemetry) return;
    return subscribeTelemetry((next) => {
      const now = performance.now();
      const prev = lastDiscreteHudRef.current;
      const discreteChanged =
        !prev ||
        prev.gear !== next.gear ||
        prev.lap !== next.lap ||
        prev.pitStatus !== next.pitStatus ||
        prev.countdownLabel !== next.countdownLabel ||
        prev.raceFinished !== next.raceFinished ||
        prev.aeroDeployed !== next.aeroDeployed ||
        prev.activeAeroEnabled !== next.activeAeroEnabled ||
        prev.shreddedCount !== next.shreddedCount ||
        prev.fuelState !== next.fuelState ||
        prev.tofuFailed !== next.tofuFailed ||
        prev.tofuSpilling !== next.tofuSpilling ||
        prev.ghostActive !== next.ghostActive ||
        prev.tandemRole !== next.tandemRole;

      if (discreteChanged || now - lastHudSyncMsRef.current >= 45) {
        lastHudSyncMsRef.current = now;
        lastDiscreteHudRef.current = {
          gear: next.gear,
          lap: next.lap,
          pitStatus: next.pitStatus,
          countdownLabel: next.countdownLabel,
          raceFinished: next.raceFinished,
          aeroDeployed: next.aeroDeployed,
          activeAeroEnabled: next.activeAeroEnabled,
          shreddedCount: next.shreddedCount,
          fuelState: next.fuelState,
          tofuFailed: next.tofuFailed,
          tofuSpilling: next.tofuSpilling,
          ghostActive: next.ghostActive,
          tandemRole: next.tandemRole,
        };
        setLiveTlm(next);
      }
    });
  }, [subscribeTelemetry]);

  const traceRingRef = useRef<{
    thr: Float32Array;
    brk: Float32Array;
    spd: Float32Array;
    head: number;
    count: number;
    lastPushMs: number;
  }>({
    thr: new Float32Array(TELEMETRY_GRAPH_CAPACITY),
    brk: new Float32Array(TELEMETRY_GRAPH_CAPACITY),
    spd: new Float32Array(TELEMETRY_GRAPH_CAPACITY),
    head: 0,
    count: 0,
    lastPushMs: 0,
  });

  useEffect(() => {
    if (isHudHidden || !hudVisibility.showTelemetryGraph) return;
    const now = performance.now();
    const ring = traceRingRef.current;
    if (now - ring.lastPushMs < 45 && ring.count > 0) return;
    ring.lastPushMs = now;
    ring.thr[ring.head] = Math.min(1, Math.max(0, liveTlm.throttle));
    ring.brk[ring.head] = Math.min(1, Math.max(0, liveTlm.brake));
    ring.spd[ring.head] = Math.min(1, Math.max(0, liveTlm.speedKmh / 360));
    ring.head = (ring.head + 1) % TELEMETRY_GRAPH_CAPACITY;
    if (ring.count < TELEMETRY_GRAPH_CAPACITY) ring.count += 1;
  }, [
    isHudHidden,
    hudVisibility.showTelemetryGraph,
    liveTlm.throttle,
    liveTlm.brake,
    liveTlm.speedKmh,
    liveTlm.lapTimeMs,
  ]);

  const toggleHudMenu = (next?: boolean) => {
    setHudMenuOpen((prev) => (typeof next === 'boolean' ? next : !prev));
  };

  useEffect(() => {
    onHudMenuOpenChange?.(hudMenuOpen && !isHudHidden);
    return () => {
      onHudMenuOpenChange?.(false);
    };
  }, [hudMenuOpen, isHudHidden, onHudMenuOpenChange]);

  const activeMapMeta = MAP_REGISTRY[activeMapId];
  const activeCircuitShortName = activeCustomBlueprint
    ? activeCustomBlueprint.title
    : activeMapMeta.shortName;
  const activeCircuitFullName = activeCustomBlueprint
    ? activeCustomBlueprint.title
    : activeMapMeta.name;
  const minimap = useMemo(() => {
    void mapRevision;
    void activeMapId;
    return getCircuitMinimapData();
  }, [mapRevision, activeMapId]);

  if (isHudHidden) {
    return null;
  }

  const viewWidth = minimap.maxX - minimap.minX;
  const viewHeight = minimap.maxZ - minimap.minZ;

  const gearLabel =
    liveTlm.gear === -1 ? 'R' : liveTlm.gear === 0 ? 'N' : String(liveTlm.gear);

  const maxRpmScale = Math.max(6500, liveTlm.redlineRpm || 8800);
  const rpmRatio = Math.min(1, Math.max(0, liveTlm.rpm / maxRpmScale));
  const speedRatio = Math.min(1, Math.max(0, liveTlm.speedKmh / 380));
  const throttlePct = Math.round(Math.min(1, Math.max(0, liveTlm.throttle)) * 100);
  const brakePct = Math.round(Math.min(1, Math.max(0, liveTlm.brake)) * 100);
  const delta = formatDeltaMs(liveTlm.deltaMs);
  const playerYawDeg = (-liveTlm.headingRad * 180) / Math.PI + 180;
  const currentStation = cctvStations[cctvStationIndex];

  const isInteriorCam = drivingCamera === 'cockpit' || drivingCamera === 'windshield';
  const isBumperCam = drivingCamera === 'bumper';
  const isHoodCam = drivingCamera === 'hood';

  const lapText =
    liveTlm.lapTarget > 0 ? `${liveTlm.lap} / ${liveTlm.lapTarget}` : `${liveTlm.lap}`;

  const oilStatus = thermalBadge(liveTlm.oilTempC, 114, 88);
  const waterStatus = thermalBadge(liveTlm.waterTempC, 102, 82);

  // Dual Circular Dial geometry for Bumper Cam
  const dialBgArc = describeArc(90, 90, 72, -130, 130);
  const dialRedArc = describeArc(90, 90, 72, -130 + 260 * 0.86, 130);
  const rpmDialFill =
    rpmRatio > 0.01 ? describeArc(90, 90, 72, -130, -130 + 260 * rpmRatio) : '';
  const spdDialFill =
    speedRatio > 0.01 ? describeArc(90, 90, 72, -130, -130 + 260 * speedRatio) : '';
  const rpmNeedleDeg = -130 + 260 * rpmRatio;
  const spdNeedleDeg = -130 + 260 * speedRatio;
  const rpmStroke =
    liveTlm.rpm > maxRpmScale * 0.92
      ? '#ef4444'
      : liveTlm.rpm > maxRpmScale * 0.78
      ? '#f59e0b'
      : '#38bdf8';

  // GT7 Chase Curved Arched Tachometer geometry
  const archStartDeg = -64;
  const archEndDeg = 64;
  const archSweepDeg = archEndDeg - archStartDeg;
  const archBgPath = describeArc(160, 132, 112, archStartDeg, archEndDeg);
  const archRedPath = describeArc(160, 132, 112, archStartDeg + archSweepDeg * 0.85, archEndDeg);
  const archFillPath =
    rpmRatio > 0.01
      ? describeArc(160, 132, 112, archStartDeg, archStartDeg + archSweepDeg * rpmRatio)
      : '';

  const renderMinimapSvg = (sizeClass: string) => {
    const isAhead = minimapMode === 'ahead';
    const radarZoom =
      Math.min(260, 200) / Math.max(190, Math.min(viewWidth, viewHeight) * 0.36);
    const invScale = 1 / Math.max(0.25, radarZoom);

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleMinimapMode}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleMinimapMode();
          }
        }}
        title="Click or press M to toggle Full Map / Ahead Sector View"
        className={`relative cursor-pointer select-none overflow-hidden ${sizeClass}`}
      >
        {isAhead ? (
          <svg
            viewBox="0 0 260 200"
            className="h-full w-full"
            aria-label={`${activeMapMeta.shortName} Ahead Radar`}
          >
            <g
              transform={`translate(130, 156) scale(${radarZoom.toFixed(4)}) rotate(${(-playerYawDeg).toFixed(1)}) translate(${(-liveTlm.posX).toFixed(1)}, ${(-liveTlm.posZ).toFixed(1)})`}
            >
              <path
                d={minimap.svgPath}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth={20 * invScale}
                strokeLinejoin="round"
              />
              <path
                d={minimap.svgPath}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth={8.5 * invScale}
                strokeLinejoin="round"
              />
              <circle cx={minimap.startX} cy={minimap.startZ} r={10 * invScale} fill="#f59e0b" />
              <circle cx={minimap.sector1X} cy={minimap.sector1Z} r={6.5 * invScale} fill="#38bdf8" />
              <circle cx={minimap.sector2X} cy={minimap.sector2Z} r={6.5 * invScale} fill="#38bdf8" />
              {liveTlm.rivals.map((rv) => (
                <circle
                  key={rv.id}
                  cx={rv.posX}
                  cy={rv.posZ}
                  r={10.5 * invScale}
                  fill={rv.color}
                  stroke="#090c11"
                  strokeWidth={2.5 * invScale}
                />
              ))}
            </g>
            <g transform="translate(130, 156)">
              <polygon
                points="0,-13 8,9 0,4.5 -8,9"
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth={2.2}
              />
            </g>
          </svg>
        ) : (
          <svg
            viewBox={`${minimap.minX} ${minimap.minZ} ${viewWidth} ${viewHeight}`}
            className="h-full w-full"
            aria-label={`${activeMapMeta.shortName} Circuit Map`}
          >
            <path
              d={minimap.svgPath}
              fill="none"
              stroke="rgba(255,255,255,0.16)"
              strokeWidth={24}
              strokeLinejoin="round"
            />
            <path
              d={minimap.svgPath}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth={9}
              strokeLinejoin="round"
            />
            <circle cx={minimap.startX} cy={minimap.startZ} r={14} fill="#f59e0b" />
            <circle cx={minimap.sector1X} cy={minimap.sector1Z} r={9} fill="#38bdf8" />
            <circle cx={minimap.sector2X} cy={minimap.sector2Z} r={9} fill="#38bdf8" />
            {liveTlm.rivals.map((rv) => (
              <circle
                key={rv.id}
                cx={rv.posX}
                cy={rv.posZ}
                r={14}
                fill={rv.color}
                stroke="#090c11"
                strokeWidth={4}
              />
            ))}
            <g
              transform={`translate(${liveTlm.posX.toFixed(1)}, ${liveTlm.posZ.toFixed(1)}) rotate(${playerYawDeg.toFixed(1)})`}
            >
              <polygon
                points="0,-24 16,18 0,9 -16,18"
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth={4}
              />
            </g>
          </svg>
        )}
        <span className="font-mono-tabular pointer-events-none absolute top-0 right-0 border border-white/15 bg-[#06080d] px-1.5 py-0.5 text-[8px] font-bold tracking-wider text-sky-300 uppercase">
          M · {isAhead ? 'AHEAD' : 'FULL'}
        </span>
      </div>
    );
  };

  const renderTireMfdCard = (compact = false) => {
    const fuelColor =
      liveTlm.fuelPct <= 15
        ? 'bg-rose-500'
        : liveTlm.fuelPct <= 30
        ? 'bg-amber-400'
        : 'bg-sky-400';

    return (
      <div className={`gt7-hud-box ${compact ? 'p-2' : 'p-2.5'}`}>
        <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-white/10 pb-1 text-[9px] font-bold tracking-[0.16em] text-slate-400 uppercase">
          <span>Tire &amp; Fuel</span>
          <div className="font-mono-tabular flex items-center gap-1.5">
            <span className="border border-white/15 bg-white/8 px-1 text-slate-100">
              {liveTlm.tireCompoundShort}
            </span>
            <span className="text-sky-300">{liveTlm.gripPct}%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {(['fl', 'fr', 'rl', 'rr'] as const).map((corner, idx) => {
            const t = liveTlm.tires[corner];
            const psi = liveTlm.tirePressuresPsi[idx] ?? 27.0;
            const life = Math.round(t.lifePct);

            return (
              <div
                key={corner}
                title={`${corner.toUpperCase()} · Life ${life}% · Grip Loss -${t.gripLossPct}% · ${psi.toFixed(1)} PSI`}
                className={`flex flex-col border px-1.5 py-1 ${
                  compact ? 'w-[68px]' : 'w-[80px]'
                } ${tireBoxBorder(t.lifePct, t.gripLossPct)}`}
              >
                <div className="flex w-full items-center justify-between text-[8px] font-bold">
                  <span className="font-mono-tabular text-slate-300 uppercase">{corner}</span>
                  {t.shredded ? (
                    <span className="font-mono-tabular bg-rose-600 px-1 text-[7px] font-bold text-white uppercase">
                      SHRED
                    </span>
                  ) : t.brakeFaded ? (
                    <span className="font-mono-tabular bg-amber-500 px-1 text-[7px] font-bold text-slate-950 uppercase">
                      FADE
                    </span>
                  ) : (
                    <span
                      className={`font-mono-tabular ${
                        t.lifePct < 20
                          ? 'font-bold text-rose-400'
                          : t.lifePct < 45
                          ? 'text-amber-300'
                          : 'text-slate-100'
                      }`}
                    >
                      {life}%
                    </span>
                  )}
                </div>

                <div className="mt-1 h-1.5 w-full overflow-hidden bg-white/10">
                  <div
                    className={`h-full ${
                      t.shredded || t.lifePct < 20
                        ? 'bg-rose-500'
                        : t.lifePct < 45
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                    style={{ width: `${t.shredded ? 4 : Math.max(4, life)}%` }}
                  />
                </div>

                <div className="font-mono-tabular mt-0.5 flex items-center justify-between text-[8px] text-slate-300">
                  <span>{psi.toFixed(1)}</span>
                  <span
                    className={
                      t.brakeFaded
                        ? 'text-amber-300'
                        : t.gripLossPct > 15
                        ? 'text-rose-300'
                        : 'text-slate-400'
                    }
                  >
                    {t.brakeFaded
                      ? `${Math.round(t.brakeTempC)}°R`
                      : t.gripLossPct > 0
                      ? `-${t.gripLossPct}%`
                      : 'OK'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-1.5 border-t border-white/10 pt-1.5">
          <div className="font-mono-tabular flex items-center justify-between gap-2 text-[10px]">
            <span className="inline-flex items-center gap-1 font-bold text-white">
              <Fuel
                className={`h-3 w-3 ${
                  liveTlm.fuelState !== 'normal' || liveTlm.fuelPct <= 15
                    ? 'text-rose-400'
                    : liveTlm.fuelPct <= 30
                    ? 'text-amber-400'
                    : 'text-sky-400'
                }`}
              />
              <span>
                FUEL:{' '}
                {liveTlm.fuelLapsEst !== null
                  ? `${liveTlm.fuelLapsEst.toFixed(1)} LAPS`
                  : '-- LAPS'}
              </span>
            </span>
            <span
              className={`font-semibold uppercase ${
                liveTlm.fuelState === 'stalled'
                  ? 'text-rose-400'
                  : liveTlm.fuelState === 'critical' || liveTlm.fuelState === 'starving'
                  ? 'text-amber-300'
                  : 'text-slate-300'
              }`}
            >
              {liveTlm.fuelState === 'stalled'
                ? 'STALL'
                : liveTlm.fuelState === 'critical'
                ? 'CRIT'
                : liveTlm.fuelState === 'starving'
                ? 'STARVE'
                : `${liveTlm.fuelLiters.toFixed(1)}L (${Math.round(liveTlm.fuelPct)}%)`}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 w-full overflow-hidden bg-white/12">
            <div
              className={`h-full transition-all duration-150 ${fuelColor}`}
              style={{
                width: `${liveTlm.fuelPct <= 0.1 ? 0 : Math.max(2, liveTlm.fuelPct)}%`,
              }}
            />
          </div>
        </div>

        {!compact && (
          <div className="font-mono-tabular mt-1.5 flex items-center justify-between gap-1 text-[9px]">
            <span
              className={`px-1 py-0.5 font-semibold ${
                liveTlm.absActive
                  ? 'bg-amber-500 text-slate-950'
                  : cockpitDials.absLevel > 0
                  ? 'bg-white/10 text-slate-200'
                  : 'bg-white/5 text-slate-500'
              }`}
            >
              ABS {cockpitDials.absLevel}
            </span>
            <span
              className={`px-1 py-0.5 font-semibold ${
                liveTlm.tcsActive
                  ? 'bg-amber-500 text-slate-950'
                  : cockpitDials.tcsLevel > 0
                  ? 'bg-white/10 text-slate-200'
                  : 'bg-white/5 text-slate-500'
              }`}
            >
              TCS {cockpitDials.tcsLevel}
            </span>
            <span className="bg-white/10 px-1 py-0.5 font-semibold text-sky-300">
              MAP {cockpitDials.engineMap}
            </span>
            <span className="bg-white/10 px-1 py-0.5 font-semibold text-slate-200">
              {assists.autoGear ? 'AT' : 'MT'}
            </span>
          </div>
        )}
      </div>
    );
  };

  const renderCockpitMfdCard = (mobileSheet = false) => {
    const compoundIds: TireCompoundId[] = [
      'comfort_hard',
      'sports_medium',
      'sports_soft',
      'racing_hard',
      'racing_medium',
      'racing_soft',
    ];
    const pitAttention =
      !assists.autoPitService && (liveTlm.pitRequired || liveTlm.pitStatus === 'in_lane');

    return (
      <div className={`gt7-hud-box ${mobileSheet ? 'w-full p-3' : 'w-[240px] p-2.5'}`}>
        <div className="mb-2 flex items-center justify-between gap-1.5 border-b border-white/10 pb-1.5">
          <button
            type="button"
            onClick={() => setMfdTab('dials')}
            className={`inline-flex ${mobileSheet ? 'h-10' : ''} flex-1 items-center justify-center gap-1 px-2 py-1 text-[10px] font-bold tracking-wider uppercase whitespace-nowrap shrink-0 ${
              mfdTab === 'dials'
                ? 'bg-sky-500 text-slate-950'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Sliders className="h-3.5 w-3.5 desktop:h-3 desktop:w-3" />
            <span>MFD Dials</span>
          </button>
          <button
            type="button"
            onClick={() => setMfdTab('pit')}
            className={`inline-flex ${mobileSheet ? 'h-10' : ''} flex-1 items-center justify-center gap-1 px-2 py-1 text-[10px] font-bold tracking-wider uppercase whitespace-nowrap shrink-0 ${
              mfdTab === 'pit'
                ? 'bg-amber-400 text-slate-950'
                : pitAttention
                ? 'border border-amber-400/70 bg-amber-500/20 text-amber-200'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Wrench className="h-3.5 w-3.5 desktop:h-3 desktop:w-3" />
            <span>Pit Plan</span>
          </button>
        </div>

        {mfdTab === 'dials' ? (
          <div className="font-mono-tabular flex flex-col gap-1.5 text-[10px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">BB (1/2)</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onCockpitDialsChange({
                      ...cockpitDials,
                      brakeBalance: Math.max(
                        -5,
                        Math.round((cockpitDials.brakeBalance - 0.5) * 10) / 10
                      ),
                    })
                  }
                  className="border border-white/15 bg-white/5 px-1.5 py-0.5 text-slate-200 hover:border-sky-400"
                >
                  -
                </button>
                <span className="min-w-[38px] text-center font-bold text-white">
                  {cockpitDials.brakeBalance > 0 ? '+' : ''}
                  {cockpitDials.brakeBalance.toFixed(1)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onCockpitDialsChange({
                      ...cockpitDials,
                      brakeBalance: Math.min(
                        5,
                        Math.round((cockpitDials.brakeBalance + 0.5) * 10) / 10
                      ),
                    })
                  }
                  className="border border-white/15 bg-white/5 px-1.5 py-0.5 text-slate-200 hover:border-sky-400"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">TCS (3)</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onCockpitDialsChange({
                      ...cockpitDials,
                      tcsLevel: Math.max(0, cockpitDials.tcsLevel - 1),
                    })
                  }
                  className="border border-white/15 bg-white/5 px-1.5 py-0.5 text-slate-200 hover:border-sky-400"
                >
                  -
                </button>
                <span className="min-w-[38px] text-center font-bold text-sky-300">
                  {cockpitDials.tcsLevel === 0 ? 'OFF' : `LVL ${cockpitDials.tcsLevel}`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onCockpitDialsChange({
                      ...cockpitDials,
                      tcsLevel: Math.min(5, cockpitDials.tcsLevel + 1),
                    })
                  }
                  className="border border-white/15 bg-white/5 px-1.5 py-0.5 text-slate-200 hover:border-sky-400"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">ABS (4)</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onCockpitDialsChange({
                      ...cockpitDials,
                      absLevel: Math.max(0, cockpitDials.absLevel - 1),
                    })
                  }
                  className="border border-white/15 bg-white/5 px-1.5 py-0.5 text-slate-200 hover:border-sky-400"
                >
                  -
                </button>
                <span className="min-w-[38px] text-center font-bold text-emerald-300">
                  {cockpitDials.absLevel === 0 ? 'OFF' : `LVL ${cockpitDials.absLevel}`}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onCockpitDialsChange({
                      ...cockpitDials,
                      absLevel: Math.min(3, cockpitDials.absLevel + 1),
                    })
                  }
                  className="border border-white/15 bg-white/5 px-1.5 py-0.5 text-slate-200 hover:border-sky-400"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">MAP (5)</span>
              <div className="flex items-center gap-1">
                {([1, 2, 3] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onCockpitDialsChange({ ...cockpitDials, engineMap: m })}
                    className={`border px-2 py-0.5 font-bold whitespace-nowrap shrink-0 ${
                      cockpitDials.engineMap === m
                        ? 'border-sky-400 bg-sky-500/25 text-white'
                        : 'border-white/12 bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    {m === 1 ? '1 ECO' : m === 2 ? '2 BAL' : '3 QUAL'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-400">DIFF (6)</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onCockpitDialsChange({
                      ...cockpitDials,
                      diffPreload: Math.max(1, cockpitDials.diffPreload - 1),
                    })
                  }
                  className="border border-white/15 bg-white/5 px-1.5 py-0.5 text-slate-200 hover:border-sky-400"
                >
                  -
                </button>
                <span className="min-w-[38px] text-center font-bold text-amber-300">
                  LOCK {cockpitDials.diffPreload}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onCockpitDialsChange({
                      ...cockpitDials,
                      diffPreload: Math.min(5, cockpitDials.diffPreload + 1),
                    })
                  }
                  className="border border-white/15 bg-white/5 px-1.5 py-0.5 text-slate-200 hover:border-sky-400"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        ) : assists.autoPitService ? (
          <div className="border border-amber-400/40 bg-amber-500/10 p-2 text-[10px] text-amber-200">
            AUTO PIT ASSIST ON: Pit box automatically fills 100% fuel and matches current tires.
          </div>
        ) : (
          <div className="font-mono-tabular flex flex-col gap-2 text-[10px]">
            <div>
              <div className="mb-1 flex items-center justify-between text-slate-400">
                <span>FUEL TARGET</span>
                <span className="font-bold text-amber-300">
                  {Math.round(pitStrategy.fuelTargetFrac * 100)}%
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {[0.25, 0.5, 0.75, 1.0].map((frac) => (
                  <button
                    key={frac}
                    type="button"
                    onClick={() => onPitStrategyChange({ ...pitStrategy, fuelTargetFrac: frac })}
                    className={`border py-0.5 font-bold ${
                      Math.abs(pitStrategy.fuelTargetFrac - frac) < 0.04
                        ? 'border-amber-400 bg-amber-400 text-slate-950'
                        : 'border-white/12 bg-white/5 text-slate-300 hover:text-white'
                    }`}
                  >
                    {Math.round(frac * 100)}%
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between text-slate-400">
                <span>COMPOUND</span>
                <span className="font-bold text-sky-300">
                  {TIRE_COMPOUNDS[pitStrategy.tireCompound].shortLabel}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {compoundIds.map((cid) => (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => onPitStrategyChange({ ...pitStrategy, tireCompound: cid })}
                    className={`border py-0.5 text-[9px] font-bold ${
                      pitStrategy.tireCompound === cid
                        ? 'border-sky-400 bg-sky-500 text-slate-950'
                        : 'border-white/12 bg-white/5 text-slate-300 hover:text-white'
                    }`}
                  >
                    {TIRE_COMPOUNDS[cid].shortLabel}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">WING TRIM</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    onPitStrategyChange({
                      ...pitStrategy,
                      wingTrim: Math.max(-2, pitStrategy.wingTrim - 1),
                    })
                  }
                  className="border border-white/15 bg-white/5 px-2 py-0.5 text-slate-200 hover:border-sky-400"
                >
                  -
                </button>
                <span className="min-w-[30px] text-center font-bold text-white">
                  {pitStrategy.wingTrim > 0 ? `+${pitStrategy.wingTrim}` : pitStrategy.wingTrim}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onPitStrategyChange({
                      ...pitStrategy,
                      wingTrim: Math.min(3, pitStrategy.wingTrim + 1),
                    })
                  }
                  className="border border-white/15 bg-white/5 px-2 py-0.5 text-slate-200 hover:border-sky-400"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderAdvancedTelemetryCard = () => {
    if (!advancedTelemetryEnabled) return null;
    const d = liveTlm.diagnostics;
    const corners = [
      { key: 'FL', t: liveTlm.tires.fl },
      { key: 'FR', t: liveTlm.tires.fr },
      { key: 'RL', t: liveTlm.tires.rl },
      { key: 'RR', t: liveTlm.tires.rr },
    ];
    return (
      <div className="gt7-hud-box w-[346px] border-sky-400/35 p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-white/10 pb-1">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3 w-3 text-sky-400" />
            <span className="text-[9px] font-bold tracking-wider text-sky-300 uppercase">
              Physics Diagnostics · {d.chassisHz}/{d.tireSubstepHz}Hz
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSelfTestResult(runQuickPhysicsSelfTests())}
              className="inline-flex items-center gap-1 border border-sky-400/50 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold text-sky-200 uppercase hover:bg-sky-500/25 whitespace-nowrap shrink-0"
            >
              <CheckCircle2 className="h-2.5 w-2.5" />
              <span>Self-Test</span>
            </button>
            <button
              type="button"
              onClick={onExportTelemetryCsv}
              className="inline-flex items-center gap-1 border border-emerald-400/50 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 uppercase hover:bg-emerald-500/25 whitespace-nowrap shrink-0"
            >
              <Download className="h-2.5 w-2.5" />
              <span>CSV 25Hz</span>
            </button>
          </div>
        </div>

        <div className="font-mono-tabular mb-1.5 flex items-center justify-between gap-2 border border-amber-400/35 bg-amber-500/10 px-1.5 py-0.5 text-[8.5px] text-amber-200">
          <span className="font-bold tracking-wider uppercase">
            NON-DETERMINISTIC (IEEE-754)
          </span>
          <span className="font-semibold text-sky-300 uppercase">
            {d.physicsPreset} · {d.lastStepCpuMs.toFixed(2)}ms (pk {d.maxStepCpuMs.toFixed(2)})
          </span>
        </div>

        <div className="font-mono-tabular mb-1.5 grid grid-cols-4 gap-1 text-[9px]">
          <div className="border border-white/10 bg-black/45 px-1.5 py-0.5">
            <div className="text-[8px] text-slate-400">CLUTCH</div>
            <div className="font-bold text-white">{Math.round(d.clutchEngage * 100)}%</div>
          </div>
          <div className="border border-white/10 bg-black/45 px-1.5 py-0.5">
            <div className="text-[8px] text-slate-400">ESC YAW</div>
            <div className="font-bold text-sky-300">{d.escTorqueNm} Nm</div>
          </div>
          <div className="border border-white/10 bg-black/45 px-1.5 py-0.5">
            <div className="text-[8px] text-slate-400">AERO DF</div>
            <div className="font-bold text-emerald-300">{liveTlm.downforceKgf} kgf</div>
          </div>
          <div
            className={`border px-1.5 py-0.5 ${
              d.rolloverWarning
                ? 'border-rose-500/70 bg-rose-950/45 text-rose-300'
                : 'border-white/10 bg-black/45 text-slate-200'
            }`}
          >
            <div className="text-[8px] text-slate-400">SSF ROLL</div>
            <div className="font-bold">
              {d.rolloverSsf.toFixed(2)} ({d.rolloverRiskRatio.toFixed(2)})
            </div>
          </div>
        </div>

        <div className="font-mono-tabular grid grid-cols-4 gap-1.5 text-[9px]">
          {corners.map(({ key, t }) => (
            <div key={key} className="border border-white/10 bg-black/45 px-1.5 py-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200">{key}</span>
                <span
                  className={`text-[8px] font-bold ${
                    t.shredded
                      ? 'text-rose-400'
                      : t.grounded
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                  }`}
                >
                  {t.shredded ? 'SHRED' : t.grounded ? 'GND' : 'AIR'}
                </span>
              </div>
              <div className="text-slate-400">κ {t.kappa.toFixed(2)}</div>
              <div className="text-slate-400">α {t.alphaDeg.toFixed(1)}°</div>
              <div className="text-sky-300">Life {Math.round(t.lifePct)}%</div>
              <div className="text-slate-300">{Math.round(t.normalFzN)}N</div>
              <div className={t.brakeFaded ? 'font-bold text-rose-400' : 'text-amber-300'}>
                {t.brakeFaded ? `FADE ${Math.round(t.brakeTempC)}°` : `BRK ${Math.round(t.brakeTempC)}°`}
              </div>
            </div>
          ))}
        </div>

        <div className="font-mono-tabular mt-1.5 flex items-center justify-between text-[9px] text-slate-300">
          <span>GND: {d.groundedCount}/4</span>
          <span>LSD LOCK: {liveTlm.lsdLockPct}%</span>
          <span>STINT: {liveTlm.stintFuelPerLap.toFixed(1)}L/L</span>
        </div>

        <div className="font-mono-tabular mt-1 grid grid-cols-3 gap-1 text-[9px]">
          <div className="border border-white/10 bg-black/45 px-1.5 py-0.5">
            <span className="text-[8px] text-slate-400">GOV: </span>
            <span className="font-bold text-amber-300">{d.govCapDeg.toFixed(1)}°</span>
          </div>
          <div className="border border-white/10 bg-black/45 px-1.5 py-0.5">
            <span className="text-[8px] text-slate-400">CST: </span>
            <span className="font-bold text-emerald-300">
              {d.cstAssistDeg >= 0 ? '+' : ''}
              {d.cstAssistDeg.toFixed(1)}°
            </span>
          </div>
          <div className="border border-white/10 bg-black/45 px-1.5 py-0.5">
            <span className="text-[8px] text-slate-400">SLIP BODY: </span>
            <span className="font-bold text-sky-300">{d.slipBodyDeg.toFixed(1)}°</span>
          </div>
        </div>

        {selfTestResult && (
          <div className="font-mono-tabular mt-1.5 border-t border-white/12 pt-1.5 text-[8.5px]">
            <div className="mb-1 flex items-center justify-between">
              <span
                className={`font-bold ${
                  selfTestResult.allPassed ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                BIST: {selfTestResult.passedCount}/{selfTestResult.totalCount} PASSED (
                {selfTestResult.durationMs.toFixed(1)}ms)
              </span>
              <button
                type="button"
                onClick={() => setSelfTestResult(null)}
                className="text-slate-400 hover:text-white"
              >
                CLEAR
              </button>
            </div>
            <div className="flex flex-col gap-0.5">
              {selfTestResult.results.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2">
                  <span className={r.passed ? 'text-emerald-300' : 'text-rose-400'}>
                    {r.passed ? 'PASS' : 'FAIL'} · {r.id}
                  </span>
                  <span className="truncate text-slate-400">{r.metric}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTelemetryGraphCard = () => {
    const ring = traceRingRef.current;
    const n = ring.count;
    const w = 196;
    const h = 48;
    const startIdx = n < TELEMETRY_GRAPH_CAPACITY ? 0 : ring.head;
    const buildPts = (arr: Float32Array): string => {
      if (n < 2) {
        const y = (h - 3).toFixed(1);
        return `0,${y} ${w},${y}`;
      }
      const pts: string[] = [];
      for (let i = 0; i < n; i++) {
        const idx = (startIdx + i) % TELEMETRY_GRAPH_CAPACITY;
        const x = ((i / (TELEMETRY_GRAPH_CAPACITY - 1)) * w).toFixed(1);
        const y = (h - 2 - arr[idx] * (h - 6)).toFixed(1);
        pts.push(`${x},${y}`);
      }
      return pts.join(' ');
    };
    const thrPts = buildPts(ring.thr);
    const brkPts = buildPts(ring.brk);
    const spdPts = buildPts(ring.spd);

    return (
      <div className="gt7-hud-box hidden desktop:block w-[214px] px-2.5 py-2">
        <div className="font-mono-tabular mb-1 flex items-center justify-between text-[8.5px] font-bold tracking-wider uppercase">
          <span className="text-slate-400">Telemetry</span>
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">T {throttlePct}%</span>
            <span className="text-rose-400">B {brakePct}%</span>
            <span className="text-sky-300">{Math.round(liveTlm.speedKmh)}</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full bg-black/55 border border-white/10">
          <line x1="0" y1={h * 0.5} x2={w} y2={h * 0.5} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" strokeWidth="1" />
          <line x1="0" y1={h * 0.25} x2={w} y2={h * 0.25} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <line x1="0" y1={h * 0.75} x2={w} y2={h * 0.75} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <polyline fill="none" stroke="#38bdf8" strokeWidth="1.3" strokeOpacity="0.7" points={spdPts} />
          <polyline fill="none" stroke="#fb7185" strokeWidth="1.6" points={brkPts} />
          <polyline fill="none" stroke="#34d399" strokeWidth="1.7" points={thrPts} />
        </svg>
      </div>
    );
  };

  const renderEngineHealthCard = (compact = false) => (
    <div className={`gt7-hud-box ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
      <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-1 text-[9px] font-bold tracking-[0.16em] text-slate-400 uppercase">
        <span className="inline-flex items-center gap-1">
          <Thermometer className="h-3 w-3 text-sky-400" />
          Engine Health
        </span>
        <span className="font-mono-tabular text-slate-200">
          {liveTlm.latG >= 0 ? '+' : ''}
          {liveTlm.latG.toFixed(2)}G
        </span>
      </div>

      <div className="font-mono-tabular mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <div className="flex items-center justify-between gap-2 text-[9px] text-slate-400">
            <span>OIL TEMP</span>
            <span className={oilStatus.color}>{oilStatus.label}</span>
          </div>
          <div className="text-sm font-bold text-white">
            {liveTlm.oilTempC.toFixed(1)}
            <span className="ml-0.5 text-[10px] text-slate-400">°C</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 text-[9px] text-slate-400">
            <span>WATER</span>
            <span className={waterStatus.color}>{waterStatus.label}</span>
          </div>
          <div className="text-sm font-bold text-white">
            {liveTlm.waterTempC.toFixed(1)}
            <span className="ml-0.5 text-[10px] text-slate-400">°C</span>
          </div>
        </div>
      </div>

      {!compact && (
        <div className="font-mono-tabular mt-1.5 flex items-center justify-between gap-3 border-t border-white/10 pt-1 text-[10px] text-slate-300">
          <span>
            FL/FR{' '}
            <strong className="text-white">
              {liveTlm.tirePressuresPsi[0].toFixed(1)}/{liveTlm.tirePressuresPsi[1].toFixed(1)}
            </strong>{' '}
            PSI
          </span>
          <span>
            RL/RR{' '}
            <strong className="text-white">
              {liveTlm.tirePressuresPsi[2].toFixed(1)}/{liveTlm.tirePressuresPsi[3].toFixed(1)}
            </strong>{' '}
            PSI
          </span>
        </div>
      )}
    </div>
  );

  // Starting gantry lights calculation
  const lightsLitCount =
    liveTlm.countdownLabel === '3'
      ? 2
      : liveTlm.countdownLabel === '2'
      ? 4
      : liveTlm.countdownLabel === '1'
      ? 5
      : 0;
  const isStartGo = liveTlm.countdownLabel === 'START';

  if (preRaceIntroActive) {
    return (
      <div
        className="pointer-events-none fixed inset-0 z-20 flex h-[100dvh] flex-col justify-between p-2.5 desktop:p-6"
        style={{
          paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
          paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
          paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
          paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
        }}
      >
        <div className="flex items-start justify-between">
          <div className="gt7-hud-box max-w-[92vw] border-t-2 border-t-sky-400 px-3 py-2 desktop:px-5 desktop:py-3">
            <div className="truncate text-[9px] font-bold tracking-[0.22em] text-sky-400 uppercase desktop:text-[10px]">
              {activeCircuitFullName} · Grid Broadcast
            </div>
            <div className="font-display mt-0.5 truncate text-xs font-bold tracking-tight text-white uppercase desktop:text-lg">
              {liveTlm.carName} · {MODE_LABELS[liveTlm.gameMode]}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2 desktop:gap-4">
          <div className="gt7-hud-box px-3 py-1.5 text-[11px] text-slate-300 desktop:px-4 desktop:py-2 desktop:text-xs">
            <span className="font-semibold text-white">{phaseLabel}</span>
            <span className="mx-1.5 text-slate-600">·</span>
            <span>{weatherLabel}</span>
          </div>

          <button
            type="button"
            onClick={onSkipPreRaceIntro}
            className="pointer-events-auto inline-flex h-11 items-center gap-1.5 border border-sky-400/70 bg-[#06080d] px-4 text-xs font-bold tracking-wider text-sky-300 uppercase transition-colors hover:bg-sky-500 hover:text-slate-950 whitespace-nowrap shrink-0 desktop:h-auto desktop:px-4 desktop:py-2"
          >
            <SkipForward className="h-4 w-4 desktop:h-3.5 desktop:w-3.5" />
            <span className="desktop:hidden">Skip Intro</span>
            <span className="hidden desktop:inline">Skip Intro (SPACE)</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 flex h-[100dvh] flex-col justify-between p-1.5 landscape-short:p-1.5 desktop:p-5"
      style={{
        paddingTop: 'max(0.45rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.45rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      {/* GT7 Starting Gantry Lights & Countdown Banner */}
      {liveTlm.countdownLabel && !isSpectator && !liveTlm.raceFinished && (
        <div className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center px-4">
          <div className="gt7-hud-box border-t-2 border-b-2 border-t-sky-400/80 border-b-sky-400/80 px-7 py-4 text-center desktop:px-12 desktop:py-6">
            {/* 5 Starting Gantry Lamps */}
            <div className="mb-2.5 flex items-center justify-center gap-2 desktop:mb-3 desktop:gap-2.5">
              {Array.from({ length: 5 }).map((_, idx) => {
                const litRed = !isStartGo && idx < lightsLitCount;
                return (
                  <div
                    key={idx}
                    className={`h-3.5 w-3.5 border transition-colors duration-100 desktop:h-4 desktop:w-4 ${
                      isStartGo
                        ? 'border-emerald-300 bg-emerald-400 shadow-[0_0_12px_#34d399]'
                        : litRed
                          ? 'border-rose-300 bg-rose-500 shadow-[0_0_12px_#ef4444]'
                          : 'border-white/20 bg-black/70'
                    }`}
                  />
                );
              })}
            </div>
            <div className="text-[10px] font-bold tracking-[0.24em] text-sky-400 uppercase desktop:text-[11px]">
              {activeCircuitShortName} · {MODE_LABELS[liveTlm.gameMode]}
            </div>
            <div
              className={`font-display mt-1 font-bold tracking-tight ${
                isStartGo ? 'text-4xl text-emerald-400 desktop:text-6xl' : 'text-5xl text-white desktop:text-7xl'
              }`}
            >
              {liveTlm.countdownLabel}
            </div>
          </div>
        </div>
      )}

      {/* Top Row: Timing Tower (Left) · Flags/Alerts/Radio (Center) · Camera & Actions (Right) */}
      <div className="relative flex flex-nowrap desktop:flex-wrap items-start justify-between gap-1 desktop:gap-3">
        <div className="pointer-events-auto flex flex-col min-[520px]:flex-row items-start gap-1 min-w-0 shrink-0">
          <div className="gt7-hud-box border-t-2 border-t-sky-400 px-2 py-1 landscape-short:py-0.5 desktop:px-3.5 desktop:py-2">
            <div className="flex items-center justify-between gap-1.5 text-[8.5px] font-bold tracking-[0.14em] text-sky-300 uppercase desktop:text-[10px]">
              <span className="inline-flex items-center gap-1 truncate max-w-[90px] desktop:max-w-[230px]">
                <Flag className="h-2.5 w-2.5 shrink-0 text-sky-400" />
                <span className="truncate">{activeCircuitShortName}</span>
              </span>
              {!hudVisibility.showLapAndPosition && (
                <span className="font-mono-tabular text-slate-400">L{lapText}</span>
              )}
            </div>

            {hudVisibility.showLapAndPosition && (
              <>
                <div className="mt-0.5 border-t border-white/10 pt-0.5 flex items-center justify-between gap-2 desktop:mt-1 desktop:pt-1 desktop:gap-5">
                  {liveTlm.gameMode === 'sprint' && (
                    <div className="border-r border-white/12 pr-2 desktop:pr-3">
                      <span className="hidden text-[10px] font-bold tracking-wider text-slate-400 uppercase desktop:block">
                        Pos
                      </span>
                      <div className="font-display text-xs leading-none font-bold text-white desktop:text-2xl">
                        <span className="desktop:hidden">P</span>
                        {liveTlm.racePosition}
                        <span className="text-[9px] text-slate-400 desktop:text-xs">/{liveTlm.totalRacers}</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="text-[8.5px] font-bold tracking-wider text-slate-400 uppercase desktop:text-[10px]">
                      L{lapText} <span className="hidden desktop:inline">· {MODE_LABELS[liveTlm.gameMode]}</span>
                    </span>
                    <div className="font-mono-tabular text-xs font-bold tracking-tight text-white desktop:text-xl">
                      {formatLapMs(liveTlm.lapTimeMs)}
                    </div>
                  </div>

                  {liveTlm.gameMode === 'drift' ? (
                    <div className="text-right">
                      <span className="flex items-center justify-end gap-1 text-[8.5px] font-bold tracking-wider text-amber-400 uppercase desktop:text-[10px]">
                        <Flame className="h-3 w-3" />
                        <span className="hidden desktop:inline">Drift Score</span>
                      </span>
                      <div className="font-mono-tabular text-xs font-bold text-white desktop:text-lg">
                        {liveTlm.driftPoints.toLocaleString()}
                        {liveTlm.driftActivePoints > 0 && (
                          <span className="ml-1 text-[9.5px] text-amber-300 desktop:text-sm">
                            +{liveTlm.driftActivePoints} (x{liveTlm.driftCombo})
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="hidden text-right desktop:block">
                      <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                        Delta
                      </span>
                      <div className={`font-mono-tabular text-base font-bold ${delta.colorClass}`}>
                        {delta.text}
                      </div>
                    </div>
                  )}
                </div>

                {/* Mobile compact Best Lap line (landscape/wide phones only) */}
                {!isInteriorCam && liveTlm.bestLapMs !== null && (
                  <div className="font-mono-tabular mt-0.5 hidden min-[520px]:flex desktop:hidden items-center justify-between gap-2 border-t border-white/10 pt-0.5 text-[9px] text-slate-400">
                    <span>BEST</span>
                    <span className="font-semibold text-emerald-300">
                      {formatLapMs(liveTlm.bestLapMs)}
                    </span>
                  </div>
                )}

                {!isInteriorCam && (
                  <div className="hidden desktop:block">
                    <div className="font-mono-tabular mt-1.5 grid grid-cols-2 gap-x-4 border-t border-white/10 pt-1.5 text-[11px]">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">BEST</span>
                        <span className="text-emerald-300">{formatLapMs(liveTlm.bestLapMs)}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-400">LAST</span>
                        <span className="text-slate-200">{formatLapMs(liveTlm.lastLapMs)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {!isInteriorCam && hudVisibility.showSectorTimes && (
              <div className="font-mono-tabular mt-1.5 hidden desktop:flex items-center gap-1.5 border-t border-white/10 pt-1.5 text-[10px]">
                {[0, 1, 2].map((idx) => {
                  const isActiveSector = liveTlm.sector === idx + 1;
                  const isRecordPulse = liveTlm.sectorRecordPulse === idx + 1;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-1 px-1.5 py-0.5 ${
                        isRecordPulse
                          ? 'bg-fuchsia-500/30 text-fuchsia-200'
                          : isActiveSector
                          ? 'bg-sky-500/25 text-sky-300'
                          : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      <span>S{idx + 1}</span>
                      <span className="text-slate-100">
                        {liveTlm.sectorTimesMs[idx] !== null
                          ? `${(liveTlm.sectorTimesMs[idx]! / 1000).toFixed(2)}s`
                          : '--'}
                      </span>
                    </div>
                  );
                })}
                {!liveTlm.cleanLap && (
                  <span className="ml-auto font-bold text-rose-400 uppercase">Off-Line</span>
                )}
              </div>
            )}

            {/* Track Evolution / Rubbering Progress (Desktop Only, Toggleable) */}
            {hudVisibility.showTrackRubber && (() => {
              const rubberPct = Math.round(
                Math.min(100, Math.max(0, liveTlm.rubberInProgress * 100))
              );
              const stageLabel =
                rubberPct >= 75 ? 'RUBBERED' : rubberPct >= 35 ? 'BUILDING' : 'GREEN';
              const barColor =
                rubberPct >= 75
                  ? 'bg-emerald-400'
                  : rubberPct >= 35
                  ? 'bg-amber-400'
                  : 'bg-sky-400';
              const textTone =
                rubberPct >= 75
                  ? 'text-emerald-300'
                  : rubberPct >= 35
                  ? 'text-amber-300'
                  : 'text-sky-300';
              return (
                <div className="hidden desktop:block mt-1.5 border-t border-white/10 pt-1.5">
                  <div className="font-mono-tabular flex items-center justify-between gap-3 text-[9px] font-bold tracking-wider uppercase">
                    <span className="text-slate-400">Rubbering Progress</span>
                    <span className={textTone}>
                      {rubberPct}% · {stageLabel}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden bg-white/10">
                    <div
                      className={`h-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${Math.max(4, rubberPct)}%` }}
                    />
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Mobile Compact Top-Left Track Radar (non-intrusive size) */}
          {!isSpectator && !isInteriorCam && hudVisibility.showMinimap && (
            <div className="gt7-hud-box pointer-events-auto block desktop:hidden p-0.5">
              {renderMinimapSvg('h-14 w-14 landscape-short:h-12 landscape-short:w-14')}
            </div>
          )}
        </div>

        {/* Top-Center Mobile Digital Speedometer + Flags/Alerts/Radio */}
        {!isSpectator && (
          <div className="pointer-events-none flex flex-1 flex-col items-center gap-1 desktop:flex-initial desktop:gap-1.5">
            {(hudVisibility.showSpeedometer || hudVisibility.showGearRpm) && (
              <div className="gt7-hud-box pointer-events-auto flex desktop:hidden flex-col items-center border-t-2 border-t-sky-400 px-2 py-0.5">
                {hudVisibility.showGearRpm && (
                  <div className="mb-0.5 flex w-20 gap-0.5">
                    {Array.from({ length: 10 }).map((_, idx) => {
                      const lit = rpmRatio >= (idx + 1) / 10;
                      const segCol =
                        idx >= 8 ? 'bg-rose-500' : idx >= 6 ? 'bg-amber-400' : 'bg-sky-400';
                      return <div key={idx} className={`h-1 flex-1 ${lit ? segCol : 'bg-white/12'}`} />;
                    })}
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <div className="flex h-4 w-1 flex-col justify-end bg-white/10">
                    <div className="w-full bg-rose-500" style={{ height: `${brakePct}%` }} />
                  </div>
                  {hudVisibility.showGearRpm && (
                    <span
                      className={`font-display text-base leading-none font-bold ${
                        liveTlm.shiftFlash ? 'text-rose-400' : 'text-sky-400'
                      }`}
                    >
                      {gearLabel}
                    </span>
                  )}
                  {hudVisibility.showSpeedometer && (
                    <div className="flex items-baseline gap-0.5">
                      <span className="font-mono-tabular text-base leading-none font-bold text-white">
                        {Math.round(liveTlm.speedKmh)}
                      </span>
                      <span className="text-[7.5px] font-bold text-slate-400 uppercase">km/h</span>
                    </div>
                  )}
                  <div className="flex h-4 w-1 flex-col justify-end bg-white/10">
                    <div className="w-full bg-emerald-400" style={{ height: `${throttlePct}%` }} />
                  </div>
                </div>
                <div className="font-mono-tabular flex items-center gap-1 text-[7.5px] font-bold uppercase">
                  <span className={liveTlm.fuelPct <= 15 ? 'text-rose-400' : liveTlm.fuelPct <= 30 ? 'text-amber-300' : 'text-sky-300'}>
                    F:{Math.round(liveTlm.fuelPct)}%
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className={liveTlm.minTireLifePct <= 25 ? 'text-rose-400' : liveTlm.minTireLifePct <= 55 ? 'text-amber-300' : 'text-emerald-300'}>
                    T:{liveTlm.minTireLifePct}%
                  </span>
                </div>
              </div>
            )}
            <div className="pointer-events-none fixed inset-x-3 top-[74px] landscape-short:top-[60px] z-15 flex flex-col items-center gap-1 desktop:static desktop:inset-auto desktop:gap-1.5">
            {liveTlm.speedTrapKmh !== null && (
              <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-sky-400/75 bg-[#07111c] px-3 py-1.5 shadow-xl">
                <Gauge className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-sky-300 uppercase">
                  Speed Trap · {liveTlm.speedTrapKmh} km/h (Best {liveTlm.speedTrapRecordKmh})
                </span>
              </div>
            )}

            {liveTlm.gameMode === 'drift' && liveTlm.inDriftClippingZone && (
              <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-amber-400/80 bg-[#1a1205] px-3 py-1 shadow-xl">
                <Flame className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-amber-300 uppercase">
                  Apex Clipping Zone · 1.5x Drift Multiplier
                </span>
              </div>
            )}

            {/* Multiplayer Tandem Drift Pairing Pill */}
            {liveTlm.tandemPartnerUsername && (
              <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-fuchsia-400/75 bg-[#1b0821] px-3 py-1 shadow-xl">
                <Users className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" />
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-fuchsia-200 uppercase">
                  TANDEM x{liveTlm.tandemMultiplier.toFixed(2)} · {liveTlm.tandemRole ?? 'CHASE'} · @{liveTlm.tandemPartnerUsername}
                  {liveTlm.tandemBonusPoints > 0 ? ` (+${liveTlm.tandemBonusPoints.toLocaleString()})` : ''}
                </span>
              </div>
            )}

            {/* Ghost Battle Gap Pill */}
            {liveTlm.ghostActive && (
              <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-sky-400/65 bg-[#07111c] px-3 py-1 shadow-xl">
                <Ghost className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-slate-200 uppercase">
                  {liveTlm.ghostName || 'Ghost'}{' '}
                  {liveTlm.ghostDeltaSec !== null && (
                    <span
                      className={
                        liveTlm.ghostDeltaSec <= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }
                    >
                      {liveTlm.ghostDeltaSec <= 0 ? '-' : '+'}
                      {Math.abs(liveTlm.ghostDeltaSec).toFixed(2)}s
                    </span>
                  )}{' '}
                  {liveTlm.ghostGapMeters !== null && (
                    <span className="text-slate-400">
                      ({Math.abs(liveTlm.ghostGapMeters).toFixed(0)}m)
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Tofu Delivery Water-Cup Slosh & Integrity Gauge */}
            {liveTlm.gameMode === 'tofu_delivery' && !liveTlm.tofuFailed && (
              <div
                className={`flex max-w-[calc(100vw-1.5rem)] items-center gap-3 border px-3 py-1.5 shadow-xl ${
                  liveTlm.tofuSpilling || liveTlm.tofuIntegrityPct < 35
                    ? 'border-rose-500 bg-[#2a070d]'
                    : 'border-amber-400/75 bg-[#090d14]'
                }`}
              >
                {/* Live Water Cup Tilt Indicator */}
                <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden border border-sky-300/60 bg-black/75 shrink-0">
                  <div
                    className="h-5 w-full bg-sky-400/65 transition-transform duration-75"
                    style={{
                      transform: `translateY(${Math.max(-6, Math.min(6, (100 - liveTlm.tofuIntegrityPct) * 0.14))}px) rotate(${Math.max(-28, Math.min(28, liveTlm.tofuCupTiltX * 32))}deg)`,
                    }}
                  />
                  <div className="pointer-events-none absolute inset-x-0 top-1.5 border-t border-dashed border-amber-300/60" />
                </div>
                <div className="min-w-[140px]">
                  <div className="flex items-center justify-between gap-2 font-mono-tabular text-[10px] font-bold uppercase">
                    <span className={liveTlm.tofuSpilling ? 'text-rose-300' : 'text-amber-300'}>
                      {liveTlm.tofuSpilling ? 'SPILLING WATER!' : 'Tofu Water Cup'}
                    </span>
                    <span className="text-white">{Math.round(liveTlm.tofuIntegrityPct)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden bg-white/15">
                    <div
                      className={`h-full transition-all duration-75 ${
                        liveTlm.tofuIntegrityPct < 35
                          ? 'bg-rose-500'
                          : liveTlm.tofuIntegrityPct < 70
                          ? 'bg-amber-400'
                          : 'bg-sky-400'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, liveTlm.tofuIntegrityPct))}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {liveTlm.fuelState === 'stalled' && liveTlm.pitStatus === 'none' && (
              <div
                role="alert"
                className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border-2 border-rose-500 bg-[#2a070d] px-3.5 py-2 shadow-2xl"
              >
                <Fuel className="h-4 w-4 shrink-0 text-rose-400" />
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-rose-100 uppercase">
                  ENGINE STALLED · 0% FUEL · NO POWER STEERING —{' '}
                  {liveTlm.engineCranking ? 'STARTER CRANKING · ' : ''}COAST TO PIT LANE
                </span>
              </div>
            )}

            {liveTlm.fuelState === 'critical' && liveTlm.pitStatus === 'none' && (
              <div
                role="alert"
                className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border-2 border-rose-500 bg-[#2a070d] px-3.5 py-1.5 shadow-2xl"
              >
                <Fuel className="h-4 w-4 shrink-0 text-rose-400" />
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-rose-200 uppercase">
                  CRITICAL FUEL ({liveTlm.fuelPct.toFixed(1)}%) · 50% SPUTTER — BOX NOW
                </span>
              </div>
            )}

            {liveTlm.fuelState === 'starving' && liveTlm.pitStatus === 'none' && (
              <div
                role="alert"
                className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-amber-400 bg-[#261604] px-3.5 py-1.5 shadow-xl"
              >
                <Fuel className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-amber-200 uppercase">
                  FUEL PICKUP STARVING IN CORNERS — 50% CUTS · PIT THIS LAP
                </span>
              </div>
            )}

            {liveTlm.shreddedCount > 0 && liveTlm.pitStatus === 'none' && (
              <div
                role="alert"
                className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border-2 border-rose-500 bg-[#2a070d] px-3.5 py-2 shadow-2xl"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-rose-100 uppercase">
                  TIRE SHRED · SLOW PUNCTURE (
                  {(['fl', 'fr', 'rl', 'rr'] as const)
                    .filter((c) => liveTlm.tires[c].shredded)
                    .map((c) => c.toUpperCase())
                    .join('/')}{' '}
                  · 0.35x GRIP) — LIMP TO PIT BOX
                </span>
              </div>
            )}

            {liveTlm.shreddedCount === 0 &&
              liveTlm.minTireLifePct < 20 &&
              liveTlm.pitStatus === 'none' && (
                <div
                  role="alert"
                  className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-rose-500 bg-[#2a070d] px-3.5 py-2 shadow-2xl"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-rose-200 uppercase">
                    Critical Tire Wear · {liveTlm.minTireLifePct}% Life · Late Slip Peak — Box Now
                  </span>
                </div>
              )}

            {liveTlm.brakeFadeCount > 0 && liveTlm.pitStatus === 'none' && (
              <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-amber-400/80 bg-[#241404] px-3 py-1.5 shadow-xl">
                <Thermometer className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-amber-200 uppercase">
                  Brake Rotor Fade (&gt;760°C) · Reduced Deceleration
                </span>
              </div>
            )}

            {liveTlm.fuelState === 'normal' &&
              liveTlm.fuelPct <= 20 &&
              liveTlm.pitStatus === 'none' && (
                <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-amber-400/75 bg-[#241604] px-3 py-1.5 shadow-xl">
                  <Fuel className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-amber-200 uppercase">
                    Low Fuel · {Math.round(liveTlm.fuelPct)}% ({liveTlm.fuelLiters.toFixed(1)}L) —
                    Pit Lane Required
                  </span>
                </div>
              )}

            {liveTlm.pitRequired &&
              liveTlm.shreddedCount === 0 &&
              liveTlm.minTireLifePct >= 20 &&
              liveTlm.fuelPct > 20 &&
              liveTlm.pitStatus === 'none' && (
                <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-rose-400/65 bg-[#1c090d] px-3 py-1.5 shadow-xl">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                  <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-rose-200 uppercase">
                    Pit Window Open · Tires {liveTlm.avgTireLifePct}% · Box This Lap
                  </span>
                </div>
              )}

            {liveTlm.pitOverspeed && (
              <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-amber-400 bg-[#291704] px-3 py-1.5 shadow-xl">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-300" />
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-amber-200 uppercase">
                  Pit Speed Limiter · Slow Below 84 km/h
                </span>
              </div>
            )}

            {liveTlm.pitStatus === 'in_lane' && !liveTlm.pitOverspeed && (
              <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-sky-400/60 bg-[#0b131c] px-3 py-1.5 shadow-xl">
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-semibold tracking-wider text-sky-300 uppercase">
                  Pit Lane · Stop Inside Cyan Pit Box for Tires, Fuel &amp; Wash
                </span>
              </div>
            )}

            {liveTlm.pitStatus === 'servicing' && (
              <div className="flex w-64 max-w-[calc(100vw-1.5rem)] flex-col gap-1 border border-amber-400/65 bg-[#06080d] px-3.5 py-2 shadow-xl">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-300 uppercase">
                  <span>Pit Crew · Tires, Fuel &amp; Wash</span>
                  <span className="font-mono-tabular">
                    {Math.round(liveTlm.pitServiceProgress * 100)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden bg-white/15">
                  <div
                    className="h-full bg-amber-400 transition-all duration-75"
                    style={{ width: `${Math.round(liveTlm.pitServiceProgress * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {liveTlm.pitStatus === 'complete' && (
              <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-2 border border-emerald-400/75 bg-[#071c12] px-3 py-1.5 shadow-xl">
                <span className="font-mono-tabular text-[11px] desktop:text-xs font-bold tracking-wider text-emerald-300 uppercase">
                  Fresh Tires, Full Fuel &amp; Wash · 100%
                </span>
              </div>
            )}

            {engineerCaption && (
              <div
                className={`mt-1 flex max-w-[min(28rem,calc(100vw-1.5rem))] items-center gap-2.5 border px-3.5 py-2 shadow-2xl ${
                  engineerCaption.severity === 'critical'
                    ? 'border-rose-500/80 bg-[#1e070c] text-rose-100'
                    : engineerCaption.severity === 'warn'
                    ? 'border-amber-400/75 bg-[#1b1204] text-amber-100'
                    : engineerCaption.severity === 'record'
                    ? 'border-fuchsia-400/75 bg-[#1b0821] text-fuchsia-100'
                    : 'border-sky-400/70 bg-[#07131e] text-sky-100'
                }`}
              >
                <Radio className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                <div className="text-[11px] desktop:text-xs leading-snug">
                  <span className="mr-1.5 text-[10px] font-bold tracking-wider text-sky-300 uppercase">
                    {engineerCaption.speaker}:
                  </span>
                  <span>{engineerCaption.message}</span>
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {/* Top-Right Status + Eye UI Toggle + Camera Cycle + Tools + Pause */}
        <div className="pointer-events-auto flex flex-nowrap items-center justify-end gap-1 desktop:flex-wrap desktop:gap-2">
          {isSpectator ? (
            <div className="gt7-hud-box flex flex-wrap items-center gap-1.5 border-rose-400/40 px-2.5 py-1.5 text-xs text-slate-100">
              <Camera className="h-3.5 w-3.5 text-rose-400" />
              <span className="font-semibold text-rose-300 max-w-[140px] truncate desktop:max-w-none">
                {isCctv && currentStation
                  ? `${currentStation.code} · ${currentStation.label}`
                  : 'Spectator View'}
              </span>
              {isCctv && (
                <>
                  <button
                    type="button"
                    onClick={() => onCycleCctv(-1)}
                    aria-label="Previous CCTV"
                    className="flex h-9 w-9 desktop:h-7 desktop:w-7 items-center justify-center hover:bg-white/10"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCycleCctv(1)}
                    aria-label="Next CCTV"
                    className="flex h-9 w-9 desktop:h-7 desktop:w-7 items-center justify-center hover:bg-white/10"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onReturnToDrive}
                className="ml-1 inline-flex h-9 desktop:h-auto items-center bg-sky-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-sky-400 whitespace-nowrap shrink-0"
              >
                Drive Car (C)
              </button>
            </div>
          ) : hudVisibility.showTrackWeatherStatus ? (
            <div className="gt7-hud-box hidden items-center gap-2 px-3 py-1.5 text-xs text-slate-200 desktop:flex">
              <span className="font-semibold text-sky-300">{phaseLabel}</span>
              <span className="text-slate-600">·</span>
              <span>{weatherLabel}</span>
              {weatherAutoEnabled && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="font-mono-tabular text-amber-300">
                    AUTO {Math.round(weatherProgressPct)}%
                  </span>
                </>
              )}
              <span className="text-slate-600">·</span>
              <span className="font-mono-tabular text-slate-300 uppercase">
                {liveTlm.audioSurface} {liveTlm.gripPct}%
              </span>
              {Math.abs(liveTlm.slopeGradePct) >= 2 && (
                <>
                  <span className="text-slate-600">·</span>
                  <span
                    className={`font-mono-tabular font-semibold ${
                      liveTlm.slopeGradePct > 0 ? 'text-amber-300' : 'text-sky-300'
                    }`}
                  >
                    {liveTlm.slopeGradePct > 0 ? '+' : ''}
                    {Math.round(liveTlm.slopeGradePct)}% GRADE
                  </span>
                </>
              )}
            </div>
          ) : null}

          {!isSpectator && (
            <>
              {/* Desktop Full Top-Right Action Buttons */}
              {hudVisibility.showTopActionButtons && onOpenTuning && (
                <button
                  type="button"
                  onClick={onOpenTuning}
                  title="Open Tuning & Active Aero Drawer"
                  className="gt7-hud-box hidden desktop:inline-flex items-center gap-1.5 px-2.5 py-1.5 font-mono-tabular text-[11px] font-bold text-sky-300 uppercase transition-colors hover:border-sky-400/60 hover:text-white whitespace-nowrap shrink-0"
                >
                  <Wrench className="h-3 w-3 text-sky-400" />
                  <span>Tune</span>
                </button>
              )}

              {hudVisibility.showTopActionButtons && (
                <button
                  type="button"
                  onClick={onToggleActiveAero}
                  disabled={!liveTlm.activeAeroEnabled || liveTlm.activeAeroMode === 'off'}
                  title="Toggle Active Aero (X)"
                  className={`gt7-hud-box hidden desktop:inline-flex items-center gap-1 px-2.5 py-1.5 font-mono-tabular text-[11px] font-bold uppercase transition-colors whitespace-nowrap shrink-0 ${
                    !liveTlm.activeAeroEnabled || liveTlm.activeAeroMode === 'off'
                      ? 'text-slate-400 opacity-75'
                      : liveTlm.aeroDeployed
                        ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                        : 'border-amber-400/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
                  }`}
                >
                  <span>
                    {!liveTlm.activeAeroEnabled || liveTlm.activeAeroMode === 'off'
                      ? 'FIXED AERO'
                      : liveTlm.activeAeroMode === 'auto'
                        ? liveTlm.aeroDeployed
                          ? 'AERO AUTO · DF'
                          : 'AERO AUTO · DRS'
                        : liveTlm.aeroDeployed
                          ? 'AERO DF (X)'
                          : 'DRS FLAT (X)'}
                  </span>
                </button>
              )}
              {hudVisibility.showTopActionButtons && onToggleHeadlights && (
                <button
                  type="button"
                  onClick={onToggleHeadlights}
                  title="Toggle Headlights (L)"
                  className={`gt7-hud-box hidden desktop:inline-flex items-center gap-1 px-2.5 py-1.5 font-mono-tabular text-[11px] font-bold uppercase transition-colors whitespace-nowrap shrink-0 ${
                    headlightsOn
                      ? 'border-sky-400/70 bg-sky-500/20 text-sky-200 hover:bg-sky-500/30'
                      : 'text-slate-300 hover:border-sky-400/50 hover:text-white'
                  }`}
                >
                  <Lightbulb className={`h-3 w-3 ${headlightsOn ? 'text-sky-300' : 'text-slate-400'}`} />
                  <span>{headlightsOn ? 'Lights ON (L)' : 'Lights OFF (L)'}</span>
                </button>
              )}

              {isInteriorCam && (
                <div className="gt7-hud-box hidden items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-slate-300 desktop:flex">
                  <span className="font-mono-tabular font-semibold text-sky-300">RMB + Mouse</span>
                  <span>Look Around</span>
                </div>
              )}

              {/* Desktop Top Icon-Only Eye UI Toggle Button (mobile uses Tools -> Hide All UI) */}
              {onToggleHudHidden && (
                <button
                  type="button"
                  onClick={onToggleHudHidden}
                  aria-label="Hide UI"
                  title="Hide / Show UI (H)"
                  data-testid="hud-eye-toggle"
                  className="gt7-hud-box hidden desktop:inline-flex items-center justify-center text-sky-300 transition-colors hover:border-sky-400/60 hover:text-white shrink-0 h-8 w-8"
                >
                  <Eye className="h-4 w-4" />
                </button>
              )}

              {/* Desktop Photography Mode (mobile uses Tools -> Photography Mode) */}
              {onEnterPhotoMode && (
                <button
                  type="button"
                  onClick={onEnterPhotoMode}
                  title="Photography Mode (P)"
                  className="gt7-hud-box hidden desktop:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold tracking-wider text-sky-200 uppercase transition-colors hover:border-sky-400/60 hover:text-white whitespace-nowrap shrink-0"
                >
                  <Aperture className="h-3.5 w-3.5 text-sky-400" />
                  <span>Photo (P)</span>
                </button>
              )}

              {/* Camera Cycle (Always visible) */}
              <button
                type="button"
                onClick={onCycleDrivingCamera}
                className="gt7-hud-box inline-flex h-10 landscape-short:h-8 items-center gap-1 px-2 text-[10px] font-semibold text-slate-200 transition-colors hover:border-sky-400/50 hover:text-white whitespace-nowrap shrink-0 desktop:h-auto desktop:gap-1.5 desktop:px-3 desktop:py-1.5 desktop:text-xs"
              >
                <Camera className="h-3.5 w-3.5 text-sky-400" />
                <span className="desktop:hidden">Cam</span>
                <span className="hidden desktop:inline">{CAM_LABELS[drivingCamera]} (C)</span>
              </button>

              {/* Mobile Compact Quick-Actions Popover */}
              <div className="relative desktop:hidden">
                <button
                  type="button"
                  onClick={() => {
                    setMobileToolsOpen((p) => !p);
                    if (hudMenuOpen) toggleHudMenu(false);
                  }}
                  aria-expanded={mobileToolsOpen}
                  aria-label="Quick Car Actions"
                  className={`gt7-hud-box inline-flex h-10 landscape-short:h-8 items-center gap-1 px-2 text-[10px] font-bold uppercase whitespace-nowrap shrink-0 ${
                    mobileToolsOpen
                      ? 'border-sky-400 bg-sky-500/25 text-sky-200'
                      : 'text-slate-200'
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5 text-sky-400" />
                  <span>Tools</span>
                </button>

                {mobileToolsOpen && (
                  <div className="gt7-hud-box absolute right-0 top-full z-40 mt-1.5 w-[min(232px,calc(100vw-1rem))] border border-sky-400/45 bg-[#090d14] p-2 shadow-2xl space-y-1.5">
                    {onOpenTuning && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileToolsOpen(false);
                          onOpenTuning();
                        }}
                        className="flex h-11 w-full items-center justify-between border border-sky-400/45 bg-sky-500/15 px-3 text-[11px] font-bold text-sky-200 uppercase"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Wrench className="h-3.5 w-3.5 text-sky-400" />
                          <span>Car Setup &amp; Aero</span>
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setMobileToolsOpen(false);
                        setMobilePartyOpen(false);
                        setMobileMfdOpen((p) => !p);
                      }}
                      className={`flex h-11 w-full items-center justify-between border px-3 text-[11px] font-bold uppercase ${
                        mobileMfdOpen
                          ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                          : 'border-white/15 bg-white/5 text-slate-200'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Gauge className="h-3.5 w-3.5 text-amber-400" />
                        <span>Pit Plan &amp; MFD</span>
                      </span>
                      <span className="font-mono-tabular text-[10px] text-amber-300">
                        {mobileMfdOpen ? 'Hide' : 'Open'}
                      </span>
                    </button>

                    {activeParty && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileToolsOpen(false);
                          setMobileMfdOpen(false);
                          setMobilePartyOpen((p) => !p);
                        }}
                        className="flex h-11 w-full items-center justify-between border border-emerald-400/45 bg-emerald-500/12 px-3 text-[11px] font-bold text-emerald-200 uppercase"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Users className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Party {activeParty.code}</span>
                        </span>
                        <span className="font-mono-tabular text-[10px]">
                          {activeParty.members.length}
                        </span>
                      </button>
                    )}

                    {onToggleHeadlights && (
                      <button
                        type="button"
                        onClick={() => {
                          onToggleHeadlights();
                          setMobileToolsOpen(false);
                        }}
                        className={`flex h-11 w-full items-center justify-between border px-3 text-[11px] font-bold uppercase ${
                          headlightsOn
                            ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                            : 'border-white/15 bg-white/5 text-slate-200'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <Lightbulb className="h-3.5 w-3.5 text-sky-300" />
                          <span>Headlights</span>
                        </span>
                        <span className="font-mono-tabular text-[10px]">
                          {headlightsOn ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        onToggleActiveAero?.();
                        setMobileToolsOpen(false);
                      }}
                      disabled={!liveTlm.activeAeroEnabled || liveTlm.activeAeroMode === 'off'}
                      className="flex h-11 w-full items-center justify-between border border-white/15 bg-white/5 px-3 text-[11px] font-bold text-slate-200 uppercase disabled:opacity-45"
                    >
                      <span>Active Aero</span>
                      <span className="font-mono-tabular text-[10px] text-amber-300">
                        {liveTlm.aeroDeployed ? 'DF' : 'DRS'}
                      </span>
                    </button>

                    {onToggleHudHidden && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileToolsOpen(false);
                          onToggleHudHidden();
                        }}
                        className="flex h-11 w-full items-center justify-between border border-white/15 bg-white/5 px-3 text-[11px] font-bold text-slate-200 uppercase"
                      >
                        <span className="inline-flex items-center gap-2">
                          <EyeOff className="h-3.5 w-3.5 text-amber-300" />
                          <span>Hide All UI</span>
                        </span>
                        <span className="font-mono-tabular text-[10px] text-amber-300">Clean</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setMobileToolsOpen(false);
                        toggleHudMenu(true);
                      }}
                      className="flex h-11 w-full items-center justify-between border border-white/15 bg-white/5 px-3 text-[11px] font-bold text-slate-200 uppercase"
                    >
                      <span className="inline-flex items-center gap-2">
                        <Eye className="h-3.5 w-3.5 text-sky-400" />
                        <span>HUD Widgets</span>
                      </span>
                      <span className="font-mono-tabular text-[10px] text-slate-400">Edit</span>
                    </button>

                    {onEnterPhotoMode && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileToolsOpen(false);
                          onEnterPhotoMode();
                        }}
                        className="flex h-11 w-full items-center justify-between border border-sky-400/45 bg-sky-500/12 px-3 text-[11px] font-bold text-sky-200 uppercase"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Aperture className="h-3.5 w-3.5 text-sky-400" />
                          <span>Photography Mode</span>
                        </span>
                        <span className="font-mono-tabular text-[10px] text-sky-300">Open</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setMobileToolsOpen(false);
                        onResetTrack();
                      }}
                      className="flex h-11 w-full items-center justify-between border border-white/15 bg-white/5 px-3 text-[11px] font-bold text-slate-200 uppercase"
                    >
                      <span className="inline-flex items-center gap-2">
                        <RotateCcw className="h-3.5 w-3.5 text-slate-300" />
                        <span>Reset to Track</span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setMobileToolsOpen(false);
                toggleHudMenu();
              }}
              aria-expanded={hudMenuOpen}
              title="Toggle In-Game HUD Widgets"
              className={`gt7-hud-box hidden desktop:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                hudMenuOpen
                  ? 'border-sky-400 bg-sky-500/25 text-sky-200'
                  : 'text-slate-200 hover:border-sky-400/50 hover:text-white'
              }`}
            >
              <Eye className="h-3.5 w-3.5 text-sky-400" />
              <span>HUD</span>
            </button>

            {hudMenuOpen && (
              <div className="gt7-hud-box absolute right-0 top-full z-40 mt-1.5 w-[min(264px,calc(100vw-1rem))] border border-sky-400/45 bg-[#090d14] p-2.5 shadow-2xl">
                <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-1.5">
                  <span className="font-display text-[11px] font-bold tracking-wider text-white uppercase">
                    HUD Visibility
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onChangeHudVisibility({ ...DEFAULT_HUD_VISIBILITY })}
                      className="h-8 desktop:h-auto border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-sky-300 uppercase hover:border-sky-400/50"
                    >
                      Clean
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeHudVisibility({
                          showSpeedometer: true,
                          showGearRpm: true,
                          showLapAndPosition: true,
                          showSectorTimes: true,
                          showMinimap: true,
                          showTelemetryGraph: true,
                          showPartyHud: true,
                          showTrackWeatherStatus: true,
                          showTopActionButtons: true,
                          showMfdDials: true,
                          showEngineHealth: true,
                          showTrackRubber: true,
                        })
                      }
                      className="h-8 desktop:h-auto border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-emerald-300 uppercase hover:border-emerald-400/50"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleHudMenu(false)}
                      className="desktop:hidden h-8 border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300 uppercase"
                    >
                      Done
                    </button>
                  </div>
                </div>
                <div className="max-h-[55dvh] overflow-y-auto space-y-1">
                  {HUD_TOGGLE_ITEMS.map((item) => {
                    const enabled = hudVisibility[item.key];
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() =>
                          onChangeHudVisibility({
                            ...hudVisibility,
                            [item.key]: !enabled,
                          })
                        }
                        className={`flex h-10 desktop:h-auto w-full items-center justify-between border px-2.5 py-1.5 desktop:py-1 text-left text-[11px] transition-colors ${
                          enabled
                            ? 'border-sky-400/35 bg-sky-500/12 text-white'
                            : 'border-white/8 bg-black/40 text-slate-400 hover:border-white/25'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        <span
                          className={`inline-flex items-center gap-1 font-mono-tabular text-[9.5px] font-bold uppercase ${
                            enabled ? 'text-emerald-300' : 'text-slate-500'
                          }`}
                        >
                          {enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          {enabled ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onResetTrack}
            title="Reset Car to Track (R)"
            className="gt7-hud-box hidden desktop:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-white/35 hover:text-white whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-300" />
            <span>Reset (R)</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Pause and Settings"
            className="gt7-hud-box inline-flex h-10 landscape-short:h-8 items-center gap-1 px-2 text-[10px] font-bold text-white transition-colors hover:border-sky-400/60 hover:text-sky-300 whitespace-nowrap shrink-0 desktop:h-auto desktop:gap-1.5 desktop:px-3 desktop:py-1.5 desktop:text-xs"
          >
            <Settings className="h-3.5 w-3.5 text-sky-400" />
            <span className="desktop:hidden">Pause</span>
            <span className="hidden desktop:inline">Pause / Settings</span>
          </button>
        </div>
      </div>

      {/* Mobile On-Demand Pit Plan / MFD Sheet (accessible cleanly from Tools on phones) */}
      {!isSpectator && mobileMfdOpen && (
        <div className="pointer-events-auto fixed inset-x-3 top-14 z-35 mx-auto w-[min(340px,calc(100vw-1.5rem))] desktop:hidden">
          <div className="gt5-panel gt5-carbon border border-sky-400/50 p-2.5 shadow-2xl space-y-2 max-h-[65dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="font-display text-xs font-bold tracking-wider text-sky-300 uppercase">
                Cockpit MFD &amp; Pit Plan
              </span>
              <button
                type="button"
                onClick={() => setMobileMfdOpen(false)}
                aria-label="Close MFD sheet"
                className="flex h-9 w-9 items-center justify-center border border-white/15 bg-white/5 text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderCockpitMfdCard(true)}
            {renderTireMfdCard(true)}
          </div>
        </div>
      )}

      {/* Mobile On-Demand Party Sheet */}
      {!isSpectator && activeParty && mobilePartyOpen && (
        <div className="pointer-events-auto fixed inset-x-3 top-14 z-35 mx-auto w-[min(340px,calc(100vw-1.5rem))] desktop:hidden">
          <div className="gt5-panel gt5-carbon border border-emerald-400/50 p-3 shadow-2xl max-h-[65dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-1.5 font-display text-xs font-bold text-white uppercase">
                <Users className="h-4 w-4 text-emerald-400" />
                <span>
                  Party {activeParty.code} · {getPartyModeMeta(activeParty.activityMode).shortLabel.toUpperCase()}
                  {activeParty.activityMode === 'ai_race'
                    ? ` (${(activeParty.aiDifficulty ?? 'pro').toUpperCase()})`
                    : ''}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {onLeaveParty && (
                  <button
                    type="button"
                    onClick={onLeaveParty}
                    className="flex h-9 w-9 items-center justify-center border border-white/15 bg-white/5 text-rose-300"
                    title="Leave Party"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setMobilePartyOpen(false)}
                  aria-label="Close Party Overlay"
                  className="flex h-9 w-9 items-center justify-center border border-white/15 bg-white/5 text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 space-y-1">
              {[...activeParty.members]
                .sort((a, b) => b.totalProgress - a.totalProgress)
                .slice(0, 6)
                .map((m, idx) => (
                  <div
                    key={m.userId}
                    className={`flex items-center justify-between font-mono-tabular text-xs ${
                      currentUserId === m.userId ? 'font-bold text-sky-300' : 'text-slate-300'
                    }`}
                  >
                    <span className="truncate">
                      {idx + 1}. @{m.username}
                    </span>
                    <span className="text-slate-400">
                      L{m.lap} · {m.bestLapMs ? formatLapMs(m.bestLapMs) : '--:--'}
                    </span>
                  </div>
                ))}
            </div>
            {onSendPartyChat && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const inp = (e.currentTarget.elements.namedItem('partyChatInputMobile') as HTMLInputElement | null);
                  if (!inp || !inp.value.trim()) return;
                  onSendPartyChat(inp.value);
                  inp.value = '';
                  inp.blur();
                }}
                className="mt-2.5 flex items-center border border-white/15 bg-black/60"
              >
                <MessageSquare className="m-2 h-4 w-4 shrink-0 text-slate-500" />
                <input
                  name="partyChatInputMobile"
                  type="text"
                  placeholder="Party chat..."
                  className="h-10 w-full bg-transparent text-base text-white placeholder-slate-500 focus:outline-none"
                />
                <button type="submit" className="flex h-10 w-10 items-center justify-center text-sky-400 hover:text-white">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Multiplayer Party Standings & Chat Overlay (Desktop Side Widget) */}
      {!isSpectator && activeParty && hudVisibility.showPartyHud && (
        <div className="pointer-events-auto my-auto ml-auto hidden w-64 flex-col gap-1.5 desktop:flex">
          <div className="gt7-hud-box border-t-2 border-t-emerald-400 p-2.5 text-[11px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <div className="flex items-center gap-1.5 font-display font-bold text-white uppercase">
                <Users className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  Party {activeParty.code} · {getPartyModeMeta(activeParty.activityMode).shortLabel.toUpperCase()}
                  {activeParty.activityMode === 'ai_race'
                    ? ` (${(activeParty.aiDifficulty ?? 'pro').toUpperCase()})`
                    : ''}
                </span>
              </div>
              {onLeaveParty && (
                <button
                  type="button"
                  onClick={onLeaveParty}
                  className="text-slate-400 hover:text-rose-300"
                  title="Leave Party"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="mt-1.5 space-y-1">
              {[...activeParty.members]
                .sort((a, b) => b.totalProgress - a.totalProgress)
                .slice(0, 6)
                .map((m, idx) => (
                  <div
                    key={m.userId}
                    className={`flex items-center justify-between font-mono-tabular text-[10px] ${
                      currentUserId === m.userId ? 'font-bold text-sky-300' : 'text-slate-300'
                    }`}
                  >
                    <span className="truncate">
                      {idx + 1}. @{m.username}
                    </span>
                    <span className="text-slate-400">
                      L{m.lap} · {m.bestLapMs ? formatLapMs(m.bestLapMs) : '--:--'}
                    </span>
                  </div>
                ))}
            </div>

            {currentUserId && activeParty.hostUserId === currentUserId && onTogglePartyCollisionMode && (
              <div className="mt-2 flex items-center gap-1 border-t border-white/10 pt-1.5">
                <span className="text-[9px] text-slate-400 uppercase mr-1">Cars:</span>
                {(['ghost', 'collide', 'race_only'] as const).map((cm) => (
                  <button
                    key={cm}
                    type="button"
                    onClick={() => onTogglePartyCollisionMode(cm)}
                    className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      activeParty.collisionMode === cm
                        ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                        : 'border-white/10 bg-white/5 text-slate-400'
                    }`}
                  >
                    {cm === 'ghost' ? <ShieldOff className="h-2.5 w-2.5" /> : <Shield className="h-2.5 w-2.5" />}
                    <span>{cm === 'race_only' ? 'Race' : cm}</span>
                  </button>
                ))}
              </div>
            )}

            {activeParty.chat.length > 0 && (
              <div className="mt-2 max-h-20 space-y-0.5 overflow-y-auto border-t border-white/10 pt-1.5 text-[10px]">
                {activeParty.chat.slice(-4).map((msg) => (
                  <div key={msg.id} className="truncate text-slate-300">
                    <span className="font-semibold text-sky-300">{msg.username}: </span>
                    <span>{msg.text}</span>
                  </div>
                ))}
              </div>
            )}

            {onSendPartyChat && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const inp = (e.currentTarget.elements.namedItem('partyChatInput') as HTMLInputElement | null);
                  if (!inp || !inp.value.trim()) return;
                  onSendPartyChat(inp.value);
                  inp.value = '';
                  inp.blur();
                }}
                className="mt-1.5 flex border border-white/12 bg-black/60"
              >
                <MessageSquare className="m-1.5 h-3 w-3 shrink-0 text-slate-500" />
                <input
                  name="partyChatInput"
                  type="text"
                  placeholder="Party chat..."
                  className="w-full bg-transparent py-1 text-[10px] text-white placeholder-slate-500 focus:outline-none"
                />
                <button type="submit" className="px-1.5 text-sky-400 hover:text-white">
                  <Send className="h-3 w-3" />
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Bottom Camera-Adaptive GT7 HUD Row */}
      {!isSpectator && (
        <div className="flex items-end justify-between gap-4">
          {/* Bottom-Left: Circuit Radar + Tire/Fuel MFD + Cockpit MFD */}
          {!isInteriorCam && (hudVisibility.showMinimap || hudVisibility.showTelemetryGraph || hudVisibility.showMfdDials) ? (
            <div className="pointer-events-auto hidden desktop:flex items-end gap-2">
              {hudVisibility.showMinimap && (
                <div className="gt7-hud-box p-2">{renderMinimapSvg('h-24 w-32')}</div>
              )}
              {hudVisibility.showTelemetryGraph && renderTelemetryGraphCard()}
              {hudVisibility.showMfdDials && renderTireMfdCard(false)}
              {hudVisibility.showMfdDials && renderCockpitMfdCard()}
            </div>
          ) : (
            <div />
          )}

          {/* Center Cluster Morphing by Driving Camera Mode (Desktop Only — Mobile uses Top-Center cluster to keep bottom clear for touch controls) */}
          {isInteriorCam ? (
            /* COCKPIT / WINDSHIELD: Desktop MFD */
            <div className="pointer-events-auto ml-auto hidden desktop:flex items-end gap-2">
              {renderAdvancedTelemetryCard()}
              {hudVisibility.showTelemetryGraph && renderTelemetryGraphCard()}
              {hudVisibility.showEngineHealth && renderEngineHealthCard(true)}
              {hudVisibility.showMfdDials && renderTireMfdCard(true)}
              {hudVisibility.showMfdDials && renderCockpitMfdCard()}
              {hudVisibility.showMinimap && (
                <div className="gt7-hud-box p-2">
                  {renderMinimapSvg('h-20 w-28')}
                </div>
              )}
            </div>
          ) : !hudVisibility.showSpeedometer && !hudVisibility.showGearRpm ? (
            <div />
          ) : isBumperCam ? (
            /* BUMPER CAM: Signature GT7 Dual Circular Analog/Digital Dials (Desktop) */
            <div className="pointer-events-auto mx-auto hidden desktop:flex w-full max-w-3xl items-end justify-center gap-3">
              {/* Speedometer Circular Dial */}
              {hudVisibility.showSpeedometer && (
                <div className="gt7-hud-box relative flex h-36 w-36 items-center justify-center desktop:h-40 desktop:w-40">
                  <svg viewBox="0 0 180 180" className="h-full w-full">
                    <path d={dialBgArc} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={9} />
                    {Array.from({ length: 11 }).map((_, idx) => {
                      const deg = -130 + (260 * idx) / 10;
                      const p1 = polarToCartesian(90, 90, 62, deg);
                      const p2 = polarToCartesian(90, 90, 77, deg);
                      return (
                        <line
                          key={idx}
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke="rgba(255,255,255,0.35)"
                          strokeWidth={1.5}
                        />
                      );
                    })}
                    {spdDialFill && <path d={spdDialFill} fill="none" stroke="#f8fafc" strokeWidth={8} />}
                    <g transform={`rotate(${spdNeedleDeg.toFixed(1)} 90 90)`}>
                      <line x1="90" y1="90" x2="90" y2="22" stroke="#38bdf8" strokeWidth="2.5" />
                    </g>
                  </svg>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-4">
                    <span className="font-mono-tabular text-3xl leading-none font-bold text-white">
                      {Math.round(liveTlm.speedKmh)}
                    </span>
                    <span className="mt-1 text-[9px] font-bold tracking-widest text-slate-400 uppercase">
                      km/h
                    </span>
                  </div>
                </div>
              )}

              {/* Center Gear + Throttle / Brake / Steer Tile */}
              <div className="gt7-hud-box flex flex-col items-center gap-2 border-t-2 border-t-sky-400 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  {/* Brake vertical bar */}
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="flex h-10 w-2 flex-col justify-end bg-white/10">
                      <div className="w-full bg-rose-500" style={{ height: `${brakePct}%` }} />
                    </div>
                    <span className="font-mono-tabular text-[8px] font-bold text-rose-400">BRK</span>
                  </div>

                  {hudVisibility.showGearRpm && (
                    <div className="flex flex-col items-center px-2">
                      <span className="text-[9px] font-bold tracking-wider text-slate-400 uppercase">
                        Gear
                      </span>
                      <span
                        className={`font-display text-3xl leading-none font-bold ${
                          liveTlm.shiftFlash ? 'text-rose-400' : 'text-sky-400'
                        }`}
                      >
                        {gearLabel}
                      </span>
                    </div>
                  )}

                  {/* Throttle vertical bar */}
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="flex h-10 w-2 flex-col justify-end bg-white/10">
                      <div className="w-full bg-emerald-400" style={{ height: `${throttlePct}%` }} />
                    </div>
                    <span className="font-mono-tabular text-[8px] font-bold text-emerald-400">THR</span>
                  </div>
                </div>

                <div className="relative h-1 w-36 overflow-hidden bg-white/12">
                  <div className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-white/35" />
                  <div
                    className="absolute top-0 h-full w-2.5 -translate-x-1/2 bg-sky-400"
                    style={{ left: `${50 - liveTlm.steerNorm * 44}%` }}
                  />
                </div>
              </div>

              {/* Tachometer Circular Dial */}
              {hudVisibility.showGearRpm && (
                <div className="gt7-hud-box relative flex h-36 w-36 items-center justify-center desktop:h-40 desktop:w-40">
                  <svg viewBox="0 0 180 180" className="h-full w-full">
                    <path d={dialBgArc} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={9} />
                    <path d={dialRedArc} fill="none" stroke="rgba(239,68,68,0.45)" strokeWidth={9} />
                    {Array.from({ length: 10 }).map((_, idx) => {
                      const deg = -130 + (260 * idx) / 9;
                      const p1 = polarToCartesian(90, 90, 62, deg);
                      const p2 = polarToCartesian(90, 90, 77, deg);
                      return (
                        <line
                          key={idx}
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke={idx >= 8 ? 'rgba(248,113,113,0.75)' : 'rgba(255,255,255,0.35)'}
                          strokeWidth={1.5}
                        />
                      );
                    })}
                    {rpmDialFill && <path d={rpmDialFill} fill="none" stroke={rpmStroke} strokeWidth={8} />}
                    <g transform={`rotate(${rpmNeedleDeg.toFixed(1)} 90 90)`}>
                      <line x1="90" y1="90" x2="90" y2="22" stroke="#f59e0b" strokeWidth="2.5" />
                    </g>
                  </svg>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-5">
                    <span className="font-mono-tabular text-sm font-bold text-white">
                      {liveTlm.rpm}
                    </span>
                    <span className="text-[9px] font-bold tracking-widest text-slate-400 uppercase">
                      rpm
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : isHoodCam ? (
            /* HOOD CAM: Low-Profile GT7 Shift Ribbon (Desktop) */
            <div className="gt7-hud-box pointer-events-auto mx-auto hidden desktop:flex items-center gap-4 border-t-2 border-t-sky-400 px-5 py-2">
              <div className="flex items-baseline gap-2">
                {hudVisibility.showGearRpm && (
                  <span
                    className={`font-display text-2xl leading-none font-bold ${
                      liveTlm.shiftFlash ? 'text-rose-400' : 'text-sky-400'
                    }`}
                  >
                    {gearLabel}
                  </span>
                )}
                {hudVisibility.showSpeedometer && (
                  <>
                    <span className="font-mono-tabular text-3xl leading-none font-bold text-white">
                      {Math.round(liveTlm.speedKmh)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">km/h</span>
                  </>
                )}
              </div>

              {hudVisibility.showGearRpm && (
                <div className="flex w-44 flex-col gap-1">
                  <div className="flex h-2 gap-0.5">
                    {Array.from({ length: 16 }).map((_, i) => {
                      const threshold = (i + 1) / 16;
                      const lit = rpmRatio >= threshold;
                      const segCol =
                        i >= 13 ? 'bg-rose-500' : i >= 10 ? 'bg-amber-400' : 'bg-sky-400';
                      return (
                        <div key={i} className={`flex-1 ${lit ? segCol : 'bg-white/10'}`} />
                      );
                    })}
                  </div>
                  <div className="font-mono-tabular flex justify-between text-[9px] text-slate-400">
                    <span>{liveTlm.rpm} RPM</span>
                    {liveTlm.gameMode === 'drift' && (
                      <span className="text-amber-300">{liveTlm.driftAngleDeg}° SLIP</span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <div className="flex h-7 w-1.5 flex-col justify-end bg-white/12" title="Brake">
                  <div className="w-full bg-rose-500" style={{ height: `${brakePct}%` }} />
                </div>
                <div className="flex h-7 w-1.5 flex-col justify-end bg-white/12" title="Throttle">
                  <div className="w-full bg-emerald-400" style={{ height: `${throttlePct}%` }} />
                </div>
              </div>
            </div>
          ) : (
            /* CHASE / CHASE FAR: Authentic GT7 Curved SVG Tachometer Ribbon (Desktop) */
            <div className="gt7-hud-box pointer-events-auto mx-auto hidden desktop:flex flex-col items-center border-t-2 border-t-sky-400 px-5 pt-1.5 pb-2.5">
              {/* Multi-stage LED Shift Bar */}
              {hudVisibility.showGearRpm && (
                <div className="mb-1 flex w-64 gap-1 desktop:w-72">
                  {Array.from({ length: 16 }).map((_, idx) => {
                    const active = rpmRatio >= (idx + 1) / 16;
                    const segColor =
                      idx >= 13
                        ? 'bg-rose-500 shadow-[0_0_8px_#ef4444]'
                        : idx >= 10
                        ? 'bg-amber-400'
                        : 'bg-sky-400';
                    return (
                      <div
                        key={idx}
                        className={`h-1.5 flex-1 transition-colors duration-75 ${
                          active ? segColor : 'bg-white/10'
                        }`}
                      />
                    );
                  })}
                </div>
              )}

              {/* Curved GT7 Tachometer Ribbon SVG + Digital Gear/Speed Readout */}
              <div
                className={`relative flex items-end justify-center ${
                  hudVisibility.showGearRpm ? 'h-[112px] w-[320px]' : 'pt-2 pb-1 px-2'
                }`}
              >
                {hudVisibility.showGearRpm && (
                  <svg
                    viewBox="0 0 320 112"
                    className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                    aria-hidden="true"
                  >
                    <path
                      d={archBgPath}
                      fill="none"
                      stroke="rgba(255,255,255,0.12)"
                      strokeWidth={10}
                    />
                    <path
                      d={archRedPath}
                      fill="none"
                      stroke="rgba(239,68,68,0.42)"
                      strokeWidth={10}
                    />
                    {archFillPath && (
                      <path d={archFillPath} fill="none" stroke={rpmStroke} strokeWidth={10} />
                    )}
                    {Array.from({ length: 9 }).map((_, idx) => {
                      const deg = archStartDeg + (archSweepDeg * idx) / 8;
                      const p1 = polarToCartesian(160, 132, 102, deg);
                      const p2 = polarToCartesian(160, 132, 118, deg);
                      return (
                        <line
                          key={idx}
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke={idx >= 7 ? '#f87171' : 'rgba(226,232,240,0.45)'}
                          strokeWidth={1.5}
                        />
                      );
                    })}
                  </svg>
                )}

                <div className="relative z-10 flex items-center gap-3 pb-1">
                  {/* Brake Bar */}
                  <div className="flex flex-col items-center gap-0.5" title="Brake Input">
                    <div className="flex h-12 w-2 flex-col justify-end bg-white/10">
                      <div className="w-full bg-rose-500" style={{ height: `${brakePct}%` }} />
                    </div>
                    <span className="font-mono-tabular text-[8px] font-bold text-rose-400">BRK</span>
                  </div>

                  {/* Gear Box */}
                  {hudVisibility.showGearRpm && (
                    <div className="flex h-14 w-12 items-center justify-center border border-white/18 bg-black/65">
                      <span
                        className={`font-display text-4xl leading-none font-bold ${
                          liveTlm.shiftFlash ? 'text-rose-400' : 'text-sky-400'
                        }`}
                      >
                        {gearLabel}
                      </span>
                    </div>
                  )}

                  {/* Speed + RPM + Telemetry Line */}
                  <div className="flex min-w-[96px] flex-col items-start">
                    {hudVisibility.showSpeedometer && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono-tabular text-4xl leading-none font-bold tracking-tight text-white">
                          {Math.round(liveTlm.speedKmh)}
                        </span>
                        <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                          km/h
                        </span>
                      </div>
                    )}
                    <div className="font-mono-tabular mt-1 flex items-center gap-1.5 text-[10px] text-slate-400">
                      {hudVisibility.showGearRpm && (
                        <>
                          <span>{liveTlm.rpm} rpm</span>
                          <span>·</span>
                        </>
                      )}
                      <span className="text-slate-200">
                        {liveTlm.gameMode === 'drift'
                          ? `${liveTlm.driftAngleDeg}°`
                          : `${Math.abs(liveTlm.latG).toFixed(1)}G`}
                      </span>
                      {hudVisibility.showGearRpm && liveTlm.gear > 0 && liveTlm.gearMaxSpeedKmh > 0 && (
                        <>
                          <span>·</span>
                          <span
                            className={
                              liveTlm.shiftFlash
                                ? 'font-bold text-rose-400'
                                : 'text-sky-300/90'
                            }
                          >
                            CAP {liveTlm.gearMaxSpeedKmh}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Throttle Bar */}
                  <div className="flex flex-col items-center gap-0.5" title="Throttle Input">
                    <div className="flex h-12 w-2 flex-col justify-end bg-white/10">
                      <div
                        className="w-full bg-emerald-400"
                        style={{ height: `${throttlePct}%` }}
                      />
                    </div>
                    <span className="font-mono-tabular text-[8px] font-bold text-emerald-400">
                      THR
                    </span>
                  </div>
                </div>
              </div>

              {/* Steering Angle Balance Bar */}
              <div className="relative mt-1 h-1 w-56 overflow-hidden bg-white/12">
                <div className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-white/35" />
                <div
                  className="absolute top-0 h-full w-3 -translate-x-1/2 bg-sky-400"
                  style={{ left: `${50 - liveTlm.steerNorm * 44}%` }}
                />
              </div>
            </div>
          )}

          {/* Bottom-Right Engine Health Card + Optional Pro Physics Telemetry */}
          {!isInteriorCam && (advancedTelemetryEnabled || hudVisibility.showEngineHealth) ? (
            <div className="pointer-events-auto hidden flex-col items-end gap-2 desktop:flex lg:flex">
              {renderAdvancedTelemetryCard()}
              {hudVisibility.showEngineHealth && renderEngineHealthCard(false)}
            </div>
          ) : (
            !isInteriorCam && <div />
          )}
        </div>
      )}
    </div>
  );
});
