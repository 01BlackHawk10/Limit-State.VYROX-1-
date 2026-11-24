import * as THREE from 'three';
import { CAR_POSTFX_LAYER } from '../../engine/carPostFx';
import { CircuitData, getCircuitData } from './circuitSpline';
import { clamp, lerp } from '../../engine/mathNoise';
import {
  CarLiveryVariant,
  CarModelId,
  McLarenCarInstance,
  McLarenTemplate,
} from '../../engine/mclarenCarLoader';
import { WeatherPreset } from './skyAndLighting';
import { type CarImpactTransfer, RaceDifficulty } from '../../engine/vehiclePhysics';
import { isTougeMapId } from '../Touge/tougePassData';

export interface AiRivalSnapshot {
  id: string;
  name: string;
  carId: CarModelId;
  carName: string;
  color: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  trackT: number;
  totalProgress: number;
  lap: number;
  finished: boolean;
  finishTimeMs: number | null;
}

export interface AiRivalReplayPose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  pitch: number;
  roll: number;
  wheelSpin: number;
  steerAngle: number;
  brakeFactor: number;
  speedMps: number;
}

interface RivalState {
  id: string;
  name: string;
  preferredCarId: CarModelId;
  activeCarId: CarModelId;
  carName: string;
  color: string;
  livery: CarLiveryVariant;
  gridOffsetMeters: number;
  gridLateral: number;
  paceScale: number;
  preferredLane: number;
  host: THREE.Group;
  instance: McLarenCarInstance | null;
  trackT: number;
  lastProgress: number;
  crossedStartOnce: boolean;
  lap: number;
  totalProgress: number;
  finished: boolean;
  finishTimeMs: number | null;
  speedMps: number;
  lateralOffset: number;
  latVel: number;
  overtakeOffset: number;
  activePassSide: -1 | 0 | 1;
  passCommitTimer: number;
  yawSlipRad: number;
  yawSlipVel: number;
  bumpRecoverTimer: number;
  smoothCurv: number;
  smoothPitch: number;
  smoothRoll: number;
  wheelSpin: number;
  steerAngle: number;
  brakeFactor: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fwd: THREE.Vector3;
  rightVec: THREE.Vector3;
}

const RIVAL_DEFS: Array<{
  id: string;
  name: string;
  preferredCarId: CarModelId;
  color: string;
  livery: CarLiveryVariant;
  gridOffsetMeters: number;
  gridLateral: number;
  paceScale: number;
  preferredLane: number;
}> = [
  {
    id: 'rival-p1',
    name: 'K. Takahashi',
    preferredCarId: 'lambo-huracan-gt3-evo2',
    color: '#22c55e',
    livery: 'platinum_silver',
    gridOffsetMeters: 26,
    gridLateral: -2.2,
    paceScale: 0.94,
    preferredLane: -0.9,
  },
  {
    id: 'rival-p2',
    name: 'L. Navarro',
    preferredCarId: 'cadillac-v-series-r',
    color: '#eab308',
    livery: 'papaya_orange',
    gridOffsetMeters: 18,
    gridLateral: 2.2,
    paceScale: 0.92,
    preferredLane: 0.9,
  },
  {
    id: 'rival-p3',
    name: 'M. Lindqvist',
    preferredCarId: 'audi-r8-lms-evo',
    color: '#38bdf8',
    livery: 'titanium_gunmetal',
    gridOffsetMeters: 10,
    gridLateral: -2.2,
    paceScale: 0.90,
    preferredLane: 0.0,
  },
];

interface DifficultyTuning {
  basePace: number;
  cornerSpeedBoost: number;
  overtakeAggression: number;
  slipstreamGain: number;
  catchupBehind: number;
  catchupAhead: number;
  defenseStrength: number;
}

const DIFFICULTY_TUNINGS: Record<RaceDifficulty, DifficultyTuning> = {
  novice: {
    basePace: 0.60,
    cornerSpeedBoost: 0.66,
    overtakeAggression: 0.12,
    slipstreamGain: 0.0,
    catchupBehind: 0.96,
    catchupAhead: 0.78,
    defenseStrength: 0.02,
  },
  pro: {
    basePace: 0.72,
    cornerSpeedBoost: 0.76,
    overtakeAggression: 0.25,
    slipstreamGain: 0.01,
    catchupBehind: 0.98,
    catchupAhead: 0.84,
    defenseStrength: 0.08,
  },
  elite: {
    basePace: 0.82,
    cornerSpeedBoost: 0.86,
    overtakeAggression: 0.40,
    slipstreamGain: 0.03,
    catchupBehind: 1.00,
    catchupAhead: 0.90,
    defenseStrength: 0.16,
  },
};

const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _tanA = new THREE.Vector3();
const _tanB = new THREE.Vector3();
const _rightA = new THREE.Vector3();
const _rightB = new THREE.Vector3();
const _upA = new THREE.Vector3();
const _upB = new THREE.Vector3();
const _basis = new THREE.Matrix4();
const _negRight = new THREE.Vector3();
const _baseQuat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _springQuat = new THREE.Quaternion();

const _yawSlipQuat = new THREE.Quaternion();

export interface AiRivalsRig {
  group: THREE.Group;
  attachTemplate: (tpl: McLarenTemplate) => void;
  attachTemplates: (templates: Partial<Record<CarModelId, McLarenTemplate>>) => void;
  setDifficulty: (difficulty: RaceDifficulty) => void;
  setActive: (active: boolean) => void;
  refreshCircuit: () => void;
  resetGrid: () => void;
  update: (
    deltaSec: number,
    countdownSec: number,
    weather: WeatherPreset,
    nightFactor: number,
    playerPos: THREE.Vector3,
    playerTrackT?: number,
    playerSpeedMps?: number,
    playerTotalProgress?: number,
    continuousWeather?: { wetness: number; speedScale: number },
    targetLapCount?: number,
  ) => void;
  applyCarImpacts: (impacts: CarImpactTransfer[]) => void;
  getSnapshots: () => AiRivalSnapshot[];
  getReplayPoses: (outPoses: AiRivalReplayPose[]) => number;
  applyReplayPoses: (
    poses: AiRivalReplayPose[],
    count: number,
    nightFactor: number,
    wetness: number,
  ) => void;
  parkOnPodium: (
    poses: Array<{ pos: THREE.Vector3; yaw: number }>,
    nightFactor: number,
    wetness: number,
  ) => void;
  dispose: () => void;
}

export function buildAiRivalsRig(
  getMistTexture?: () => THREE.Texture | null,
): AiRivalsRig {
  const group = new THREE.Group();
  group.name = 'AiRivalsRig';
  group.visible = false;

  let circuit: CircuitData = getCircuitData();
  let samples = circuit.samples;
  let N = samples.length;
  let startFinishT = samples[circuit.startFinishIndex].t;
  let playerBaseStartT = circuit.closedLoop
    ? (startFinishT - 14 / circuit.totalLength + 1) % 1
    : Math.max(0.015, startFinishT - 14 / circuit.totalLength);

  let active = false;
  let difficulty: RaceDifficulty = 'pro';
  let raceClockMs = 0;

  // Lightweight pooled wet spray & slip smoke behind nearby AI rivals
  const MAX_RIVAL_WAKE = 120;
  const rWakePos = new Float32Array(MAX_RIVAL_WAKE * 3);
  const rWakeVel = new Float32Array(MAX_RIVAL_WAKE * 3);
  const rWakeLife = new Float32Array(MAX_RIVAL_WAKE);
  const rWakeMaxLife = new Float32Array(MAX_RIVAL_WAKE);
  const rWakeSize0 = new Float32Array(MAX_RIVAL_WAKE);
  const rWakeSize1 = new Float32Array(MAX_RIVAL_WAKE);
  const rWakePeakAlpha = new Float32Array(MAX_RIVAL_WAKE);
  const rWakeSizes = new Float32Array(MAX_RIVAL_WAKE);
  const rWakeAlphas = new Float32Array(MAX_RIVAL_WAKE);
  const rWakeTints = new Float32Array(MAX_RIVAL_WAKE);
  for (let i = 0; i < MAX_RIVAL_WAKE; i++) rWakePos[i * 3 + 1] = -9999;

  const rWakeGeo = new THREE.BufferGeometry();
  const rWakePosAttr = new THREE.BufferAttribute(rWakePos, 3);
  rWakePosAttr.setUsage(THREE.DynamicDrawUsage);
  const rWakeSizeAttr = new THREE.BufferAttribute(rWakeSizes, 1);
  rWakeSizeAttr.setUsage(THREE.DynamicDrawUsage);
  const rWakeAlphaAttr = new THREE.BufferAttribute(rWakeAlphas, 1);
  rWakeAlphaAttr.setUsage(THREE.DynamicDrawUsage);
  const rWakeTintAttr = new THREE.BufferAttribute(rWakeTints, 1);
  rWakeTintAttr.setUsage(THREE.DynamicDrawUsage);
  rWakeGeo.setAttribute('position', rWakePosAttr);
  rWakeGeo.setAttribute('aSize', rWakeSizeAttr);
  rWakeGeo.setAttribute('aAlpha', rWakeAlphaAttr);
  rWakeGeo.setAttribute('aTintMix', rWakeTintAttr);

  const rWakeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMap: { value: null as THREE.Texture | null },
      uHasMap: { value: 0.0 },
      uPixelRatio: {
        value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1,
      },
      uNightDim: { value: 1.0 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      attribute float aTintMix;
      uniform float uPixelRatio;
      varying float vAlpha;
      varying float vTintMix;
      void main() {
        vAlpha = aAlpha;
        vTintMix = aTintMix;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp((aSize * 320.0 * uPixelRatio) / max(1.0, -mvPos.z), 1.5, 145.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uHasMap;
      uniform float uNightDim;
      varying float vAlpha;
      varying float vTintMix;
      void main() {
        if (vAlpha <= 0.004) discard;
        vec2 centered = gl_PointCoord - vec2(0.5);
        float r = length(centered) * 2.0;
        if (r >= 1.0) discard;
        float radial = pow(1.0 - r, 1.85);
        float texAlpha = uHasMap > 0.5 ? texture2D(uMap, gl_PointCoord).a : radial;
        float alpha = radial * texAlpha * vAlpha;
        if (alpha <= 0.004) discard;
        vec3 col = mix(vec3(0.92, 0.94, 0.97), vec3(0.74, 0.85, 0.94), vTintMix) * uNightDim;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const rWakePoints = new THREE.Points(rWakeGeo, rWakeMat);
  rWakePoints.frustumCulled = false;
  rWakePoints.visible = false;
  rWakePoints.renderOrder = 3;
  group.add(rWakePoints);
  let rWakeCursor = 0;
  let rWakeAccum = 0;
  let rWakeRand = 91827;
  const nextRWakeRand = () => {
    rWakeRand = (Math.imul(rWakeRand, 1664525) + 1013904223) >>> 0;
    return rWakeRand / 4294967295;
  };

  const rivals: RivalState[] = RIVAL_DEFS.map((def) => {
    const host = new THREE.Group();
    host.name = `AiRival_${def.id}`;
    group.add(host);
    return {
      ...def,
      activeCarId: 'bmw-m4-gt3-evo',
      carName: '2025 BMW M4 GT3 Evo',
      host,
      instance: null,
      trackT: 0,
      lastProgress: 0.98,
      crossedStartOnce: false,
      lap: 1,
      totalProgress: -0.01,
      finished: false,
      finishTimeMs: null,
      speedMps: 0,
      lateralOffset: def.gridLateral,
      latVel: 0,
      overtakeOffset: 0,
      activePassSide: 0,
      passCommitTimer: 0,
      yawSlipRad: 0,
      yawSlipVel: 0,
      bumpRecoverTimer: 0,
      smoothCurv: 0,
      smoothPitch: 0,
      smoothRoll: 0,
      wheelSpin: 0,
      steerAngle: 0,
      brakeFactor: 0,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      fwd: new THREE.Vector3(0, 0, 1),
      rightVec: new THREE.Vector3(-1, 0, 0),
    };
  });

  const snapshots: AiRivalSnapshot[] = rivals.map((r) => ({
    id: r.id,
    name: r.name,
    carId: r.activeCarId,
    carName: r.carName,
    color: r.color,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    trackT: 0,
    totalProgress: 0,
    lap: 1,
    finished: false,
    finishTimeMs: null,
  }));

  const sampleTrackFrame = (
    t: number,
    outPos: THREE.Vector3,
    outTan: THREE.Vector3,
    outRight: THREE.Vector3,
    outUp: THREE.Vector3,
  ): number => {
    if (!circuit.closedLoop) {
      const clamped = clamp(t, 0, 1);
      const fIdx = clamped * (N - 1);
      const idxA = clamp(Math.floor(fIdx), 0, N - 1);
      const idxB = Math.min(N - 1, idxA + 1);
      const alpha = fIdx - idxA;
      const sA = samples[idxA];
      const sB = samples[idxB];
      outPos.lerpVectors(sA.position, sB.position, alpha);
      outTan.lerpVectors(sA.tangent, sB.tangent, alpha).normalize();
      outRight.lerpVectors(sA.right, sB.right, alpha).normalize();
      outUp.lerpVectors(sA.up, sB.up, alpha).normalize();
      return lerp(sA.curvature, sB.curvature, alpha);
    }
    const wrapped = ((t % 1) + 1) % 1;
    const fIdx = wrapped * N;
    const idxA = Math.floor(fIdx) % N;
    const idxB = (idxA + 1) % N;
    const alpha = fIdx - Math.floor(fIdx);
    const sA = samples[idxA];
    const sB = samples[idxB];

    outPos.lerpVectors(sA.position, sB.position, alpha);
    outTan.lerpVectors(sA.tangent, sB.tangent, alpha).normalize();
    outRight.lerpVectors(sA.right, sB.right, alpha).normalize();
    outUp.lerpVectors(sA.up, sB.up, alpha).normalize();
    return lerp(sA.curvature, sB.curvature, alpha);
  };

  const applyRivalPoseToInstance = (
    r: RivalState,
    nightFactor: number,
    wetness: number,
  ) => {
    if (!r.instance) return;
    _euler.set(r.smoothPitch, 0, r.smoothRoll);
    _springQuat.setFromEuler(_euler);
    r.instance.bodySpringGroup.quaternion.copy(_springQuat);
    r.instance.setLights(nightFactor > 0.2, r.brakeFactor, nightFactor);
    r.instance.setDirtAndWeather(0.05, wetness);
    r.instance.setSteeringWheelAngle(r.steerAngle);
    for (const w of r.instance.wheelSpinPivots) {
      w.rotation.x = r.wheelSpin;
    }
    for (const st of r.instance.frontWheelSteerPivots) {
      st.rotation.y = r.steerAngle;
    }
  };

  const syncRivalVisual = (r: RivalState, nightFactor: number, wetness: number) => {
    const curv = sampleTrackFrame(r.trackT, _posA, _tanA, _rightA, _upA);
    r.pos.copy(_posA).addScaledVector(_rightA, r.lateralOffset).addScaledVector(_upA, 0.03);
    r.fwd.copy(_tanA);
    r.rightVec.copy(_rightA);
    r.vel.copy(_tanA).multiplyScalar(r.speedMps).addScaledVector(_rightA, r.latVel);

    _negRight.copy(_rightA).negate();
    _basis.makeBasis(_negRight, _upA, _tanA);
    _baseQuat.setFromRotationMatrix(_basis);

    if (Math.abs(r.yawSlipRad) > 0.0005) {
      _yawSlipQuat.setFromAxisAngle(_upA, r.yawSlipRad);
      _baseQuat.premultiply(_yawSlipQuat);
    }

    r.host.position.copy(r.pos);
    r.host.quaternion.copy(_baseQuat);
    // Natural front wheel steering: track curvature + lane steering + countersteer into yaw slip
    const laneSteer = clamp(-r.latVel / Math.max(10, r.speedMps), -0.18, 0.18);
    const counterSteer = clamp(-r.yawSlipRad * 0.65, -0.25, 0.25);
    r.steerAngle = clamp(-curv * 16 + laneSteer + counterSteer, -0.42, 0.42);
    applyRivalPoseToInstance(r, nightFactor, wetness);
  };

  const resetGrid = () => {
    raceClockMs = 0;
    for (let i = 0; i < rivals.length; i++) {
      const r = rivals[i];
      if (!circuit.closedLoop) {
        const startT = clamp(startFinishT + (i - 1) * 0.004 + 0.008, 0.01, 0.06);
        const progress = Math.max(0, startT - startFinishT);
        r.trackT = startT;
        r.lastProgress = progress;
        r.crossedStartOnce = true;
        r.lap = 1;
        r.totalProgress = progress;
      } else {
        const startT = (playerBaseStartT + r.gridOffsetMeters / circuit.totalLength + 1) % 1;
        const progress = ((startT - startFinishT) % 1 + 1) % 1;
        r.trackT = startT;
        r.lastProgress = progress;
        r.crossedStartOnce = progress < 0.5;
        r.lap = 1;
        r.totalProgress = r.crossedStartOnce ? progress : progress - 1;
      }
      r.finished = false;
      r.finishTimeMs = null;
      r.speedMps = 0;
      r.lateralOffset = r.gridLateral;
      r.latVel = 0;
      r.overtakeOffset = 0;
      r.activePassSide = 0;
      r.passCommitTimer = 0;
      r.yawSlipRad = 0;
      r.yawSlipVel = 0;
      r.bumpRecoverTimer = 0;
      r.smoothCurv = 0;
      r.smoothPitch = 0;
      r.smoothRoll = 0;
      r.brakeFactor = 0.65;
      r.steerAngle = 0;
      syncRivalVisual(r, 0, 0);

      snapshots[i].carId = r.activeCarId;
      snapshots[i].carName = r.carName;
      snapshots[i].x = r.pos.x;
      snapshots[i].z = r.pos.z;
      snapshots[i].vx = 0;
      snapshots[i].vz = 0;
      snapshots[i].trackT = r.trackT;
      snapshots[i].totalProgress = r.totalProgress;
      snapshots[i].lap = r.lap;
      snapshots[i].finished = false;
      snapshots[i].finishTimeMs = null;
    }
  };

  const RIVAL_CAR_NAMES: Record<CarModelId, string> = {
    'bmw-m4-gt3-evo': '2025 BMW M4 GT3 Evo',
    'bmw-m4-widebody': 'BMW M4 Widebody Modified',
    'aston-vantage-gt3': '2020 Aston Martin Vantage AMR GT3',
    'aston-vulcan-amr': 'Aston Martin Vulcan AMR Pro',
    'audi-r8-lms-evo': '2020 Audi R8 LMS Evo',
    'lambo-huracan-gt3-evo2': '2023 Lamborghini Huracan GT3 EVO2',
    'mclaren-720s-gt3': '2019 McLaren 720S GT3',
    'acura-nsx-gt3': '2018 Acura NSX GT3 Evo',
    'toyota-gt-one-ts020': '1998 Toyota GT-One (TS020)',
    'mazda-furai': '2008 Mazda Furai Concept',
    'bmw-m-hybrid-v8': '2024 BMW M Hybrid V8 LMDh',
    'cadillac-v-series-r': '2023 Cadillac V-Series.R LMDh',
    'koenigsegg-agera-rs': '2015 Koenigsegg Agera RS',
    'bugatti-bolide': '2021 Bugatti Bolide',
    'de-tomaso-p900': '2023 De Tomaso P900',
    'subaru-wrx-sti': '2018 Subaru WRX STI',
    'honda-s2000': 'Honda S2000 (AP1)',
    'vw-polo-r-wrx': '2018 VW Polo R WRX',
    'mercedes-amg-gt3-evo': '2020 Mercedes-AMG GT3 Evo',
    'mclaren-f1-gtr-longtail': '1997 McLaren F1 GTR Longtail',
    'ferrari-f40-lbwk': 'Ferrari F40 LBWK Widebody',
    'ferrari-250-testa-rossa': '1957 Ferrari 250 Testa Rossa',
    'mazda-787b': '1991 Mazda 787B Group C',
    'honda-ra272-f1': '1965 Honda RA272 F1',
    'vw-golf-gti-mk2': '1992 VW Golf GTI 16v Mk2',
    'toyota-ae86-trueno': '1983 Toyota Sprinter Trueno AE86',
  };

  const COMPACT_RIVAL_FALLBACKS: readonly CarModelId[] = [
    'acura-nsx-gt3',
    'aston-vantage-gt3',
    'bmw-m4-gt3-evo',
  ];

  const TOUGE_RIVAL_PREFERRED: readonly CarModelId[] = [
    'honda-s2000',
    'subaru-wrx-sti',
    'toyota-ae86-trueno',
  ];

  let lastTemplates: Partial<Record<CarModelId, McLarenTemplate>> = {};

  const attachTemplates = (templates: Partial<Record<CarModelId, McLarenTemplate>>) => {
    lastTemplates = { ...lastTemplates, ...templates };
    const fallbackTpl =
      lastTemplates['bmw-m4-gt3-evo'] ??
      lastTemplates['lambo-huracan-gt3-evo2'] ??
      lastTemplates['cadillac-v-series-r'] ??
      lastTemplates['mclaren-720s-gt3'] ??
      lastTemplates['aston-vantage-gt3'] ??
      lastTemplates['audi-r8-lms-evo'] ??
      lastTemplates['acura-nsx-gt3'] ??
      lastTemplates['aston-vulcan-amr'] ??
      lastTemplates['bmw-m4-widebody'] ??
      lastTemplates['honda-s2000'] ??
      lastTemplates['subaru-wrx-sti'] ??
      lastTemplates['toyota-ae86-trueno'];
    if (!fallbackTpl) return;

    const isTouge = isTougeMapId(circuit.mapId);
    for (let i = 0; i < rivals.length; i++) {
      const r = rivals[i];
      const slotFallbackId = COMPACT_RIVAL_FALLBACKS[i % COMPACT_RIVAL_FALLBACKS.length];
      const preferredForMap = isTouge ? TOUGE_RIVAL_PREFERRED[i % TOUGE_RIVAL_PREFERRED.length] : r.preferredCarId;
      const targetTpl =
        lastTemplates[preferredForMap] ?? lastTemplates[r.preferredCarId] ?? lastTemplates[slotFallbackId] ?? fallbackTpl;
      if (r.instance && r.instance.carId === targetTpl.carId) {
        continue;
      }
      if (r.instance) {
        r.host.remove(r.instance.root);
        r.instance.dispose();
      }
      const inst = targetTpl.createInstance(false, r.livery);
      inst.root.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          child.layers.enable(CAR_POSTFX_LAYER);
        }
      });
      r.instance = inst;
      r.activeCarId = targetTpl.carId;
      r.carName = RIVAL_CAR_NAMES[targetTpl.carId] ?? '2025 BMW M4 GT3 Evo';
      snapshots[i].carId = r.activeCarId;
      snapshots[i].carName = r.carName;
      r.host.add(inst.root);
      syncRivalVisual(r, 0, 0);
    }
  };

  resetGrid();

  return {
    group,
    attachTemplate: (tpl: McLarenTemplate) => {
      attachTemplates({ [tpl.carId]: tpl });
    },
    attachTemplates,
    setDifficulty: (nextDiff: RaceDifficulty) => {
      difficulty = nextDiff;
    },
    setActive: (nextActive: boolean) => {
      active = nextActive;
      group.visible = nextActive;
    },
    refreshCircuit: () => {
      circuit = getCircuitData();
      samples = circuit.samples;
      N = samples.length;
      startFinishT = samples[circuit.startFinishIndex].t;
      playerBaseStartT = circuit.closedLoop
        ? (startFinishT - 14 / circuit.totalLength + 1) % 1
        : Math.max(0.015, startFinishT - 14 / circuit.totalLength);
      attachTemplates({});
      resetGrid();
    },
    resetGrid,
    update: (
      deltaSec: number,
      countdownSec: number,
      weather: WeatherPreset,
      nightFactor: number,
      playerPos: THREE.Vector3,
      playerTrackT = 0,
      playerSpeedMps = 0,
      playerTotalProgress = 0,
      continuousWeather?: { wetness: number; speedScale: number },
      targetLapCount = 0,
    ) => {
      if (!active) return;

      const dt = clamp(deltaSec, 0.001, 0.08);
      const wetness = continuousWeather
        ? continuousWeather.wetness
        : weather === 'rain'
          ? 1
          : 0;
      const weatherSpeedScale = continuousWeather
        ? continuousWeather.speedScale
        : weather === 'rain'
          ? 0.8
          : weather === 'overcast'
            ? 0.95
            : 1.0;
      const raceLive = countdownSec <= 0.15;
      if (raceLive) {
        raceClockMs += dt * 1000;
      }
      const tune = DIFFICULTY_TUNINGS[difficulty];
      const trackLen = circuit.totalLength;
      const maxHalf = Math.max(3.6, circuit.roadHalfWidth - 1.35);

      for (let i = 0; i < rivals.length; i++) {
        const r = rivals[i];
        r.host.visible = true;

        if (!raceLive) {
          r.speedMps = 0;
          r.latVel = 0;
          r.yawSlipRad = 0;
          r.yawSlipVel = 0;
          r.brakeFactor = 0.7;
          syncRivalVisual(r, nightFactor, wetness);
        } else {
          r.bumpRecoverTimer = Math.max(0, r.bumpRecoverTimer - dt);
          r.passCommitTimer = Math.max(0, r.passCommitTimer - dt);

          const classTopCap =
            r.activeCarId === 'aston-vulcan-amr'
              ? 82
              : r.activeCarId === 'bmw-m4-widebody'
                ? 78
                : r.activeCarId === 'lambo-huracan-gt3-evo2' || r.activeCarId === 'cadillac-v-series-r'
                  ? 76
                  : 72;

          // 1. Multi-point forward braking & racing-line curvature scanner (22m, 52m, 94m, 138m)
          const advanceLookaheadT = (d: number) =>
            circuit.closedLoop
              ? (r.trackT + d / trackLen) % 1
              : clamp(r.trackT + d / trackLen, 0, 1);
          const curvNow = sampleTrackFrame(r.trackT, _posA, _tanA, _rightA, _upA);
          const c22 = sampleTrackFrame(advanceLookaheadT(22), _posB, _tanB, _rightB, _upB);
          const c52 = sampleTrackFrame(advanceLookaheadT(52), _posB, _tanB, _rightB, _upB);
          const c94 = sampleTrackFrame(advanceLookaheadT(94), _posB, _tanB, _rightB, _upB);
          const c138 = sampleTrackFrame(advanceLookaheadT(138), _posB, _tanB, _rightB, _upB);

          // Conservative cornering grip cap + early conservative braking margin
          const maxLatG = 11.4 * tune.cornerSpeedBoost * lerp(1.0, 0.76, wetness);
          const speedLimitForCurv = (absC: number) =>
            absC > 0.0018 ? clamp(Math.sqrt(maxLatG / absC), 16, classTopCap) : classTopCap;

          const vLimNow = speedLimitForCurv(Math.abs(curvNow));
          const vLim22 = speedLimitForCurv(Math.abs(c22));
          const vLim52 = speedLimitForCurv(Math.abs(c52));
          const vLim94 = speedLimitForCurv(Math.abs(c94));
          const vLim138 = speedLimitForCurv(Math.abs(c138));

          // Early braking distance check (lower decel threshold forces braking far earlier)
          const brakeCapability = 8.4 * lerp(1.0, 0.74, wetness);
          const safeFrom22 = Math.sqrt(vLim22 * vLim22 + 2 * brakeCapability * 17);
          const safeFrom52 = Math.sqrt(vLim52 * vLim52 + 2 * brakeCapability * 42);
          const safeFrom94 = Math.sqrt(vLim94 * vLim94 + 2 * brakeCapability * 80);
          const safeFrom138 = Math.sqrt(vLim138 * vLim138 + 2 * brakeCapability * 120);

          const cornerPace = Math.min(vLimNow, safeFrom22, safeFrom52, safeFrom94, safeFrom138);
          r.smoothCurv = lerp(r.smoothCurv, curvNow, 1 - Math.exp(-6.2 * dt));

          // Wide, conservative racing line that frequently misses tight apexes
          const lineCurv = c22 * 0.45 + curvNow * 0.55;
          const wideDrift = clamp(Math.sin(r.trackT * 46 + i * 2.1) * 1.45, -2.0, 2.0);
          const apexLineOffset = clamp(-lineCurv * 52 + wideDrift, -(maxHalf - 0.8), maxHalf - 0.8);

          // 2. Racecraft Overtake & Defense Scanner with Hysteresis (no left-right oscillation)
          let slipstreamBonus = 0;
          let blockingAhead = false;
          let preferredPassTarget = 0;

          let deltaTPlayer = circuit.closedLoop
            ? ((playerTrackT - r.trackT) % 1 + 1) % 1
            : playerTrackT - r.trackT;
          if (circuit.closedLoop && deltaTPlayer > 0.5) deltaTPlayer -= 1.0;
          const distAheadPlayer = deltaTPlayer * trackLen;
          const pLat =
            (playerPos.x - _posA.x) * _rightA.x + (playerPos.z - _posA.z) * _rightA.z;

          if (distAheadPlayer > 2.2 && distAheadPlayer < 34.0) {
            const latGap = Math.abs(r.lateralOffset - pLat);
            if (latGap < 2.9 && r.speedMps > 24) {
              slipstreamBonus = Math.max(slipstreamBonus, tune.slipstreamGain);
            }
            if (latGap < 3.6 && distAheadPlayer < 26.0) {
              if (r.passCommitTimer <= 0 || r.activePassSide === 0) {
                // Pick the wider open gap on track
                const spaceRight = maxHalf - pLat;
                const spaceLeft = pLat + maxHalf;
                r.activePassSide = spaceRight >= spaceLeft ? 1 : -1;
                r.passCommitTimer = 1.4;
              }
              preferredPassTarget = clamp(
                pLat + r.activePassSide * (2.8 + tune.overtakeAggression * 0.85),
                -maxHalf,
                maxHalf,
              );
              if (distAheadPlayer < 8.5 && latGap < 2.2) {
                blockingAhead = true;
              }
            }
          } else if (distAheadPlayer < -2.4 && distAheadPlayer > -16.0 && tune.defenseStrength > 0.2) {
            preferredPassTarget = clamp(
              apexLineOffset * (1 - 0.35 * tune.defenseStrength) + pLat * 0.35 * tune.defenseStrength,
              -maxHalf + 0.6,
              maxHalf - 0.6,
            );
          }

          // Check sibling AI rivals ahead
          for (let j = 0; j < rivals.length; j++) {
            if (i === j) continue;
            const o = rivals[j];
            let dtO = circuit.closedLoop
              ? ((o.trackT - r.trackT) % 1 + 1) % 1
              : o.trackT - r.trackT;
            if (circuit.closedLoop && dtO > 0.5) dtO -= 1.0;
            const distAheadO = dtO * trackLen;
            if (distAheadO > 2.0 && distAheadO < 28.0) {
              const latGapO = Math.abs(r.lateralOffset - o.lateralOffset);
              if (latGapO < 2.7 && r.speedMps > 24) {
                slipstreamBonus = Math.max(slipstreamBonus, tune.slipstreamGain * 0.85);
              }
              if (latGapO < 3.3 && distAheadO < 22.0) {
                if (r.passCommitTimer <= 0 || r.activePassSide === 0) {
                  r.activePassSide = maxHalf - o.lateralOffset >= o.lateralOffset + maxHalf ? 1 : -1;
                  r.passCommitTimer = 1.25;
                }
                preferredPassTarget = clamp(
                  o.lateralOffset + r.activePassSide * (2.7 + tune.overtakeAggression * 0.65),
                  -maxHalf,
                  maxHalf,
                );
                if (distAheadO < 7.8 && latGapO < 2.15) {
                  blockingAhead = true;
                }
              }
            }
          }

          if (r.passCommitTimer <= 0 && preferredPassTarget === 0) {
            r.activePassSide = 0;
          }

          // Smooth competitive pack envelope
          const progDiff = r.totalProgress - playerTotalProgress;
          const packMod =
            progDiff < -0.025
              ? tune.catchupBehind
              : progDiff > 0.045
                ? tune.catchupAhead
                : 1.0;

          let desiredSpeed = r.finished
            ? Math.min(cornerPace * 0.52, 26)
            : cornerPace *
              r.paceScale *
              tune.basePace *
              packMod *
              (1 + slipstreamBonus) *
              weatherSpeedScale;
          if (blockingAhead && !r.finished) {
            desiredSpeed = Math.min(desiredSpeed, Math.max(18, r.speedMps * 0.88));
          }
          if (r.bumpRecoverTimer > 0) {
            desiredSpeed *= 0.92;
          }

          // Realistic longitudinal throttle & braking dynamics
          const prevSpd = r.speedMps;
          const speedErr = desiredSpeed - r.speedMps;
          if (speedErr < -0.6) {
            const reqDecel = clamp(-speedErr * 2.8, 2.0, brakeCapability);
            r.speedMps = Math.max(desiredSpeed, r.speedMps - reqDecel * dt);
            r.brakeFactor = clamp(reqDecel / 13.5, 0.15, 1.0);
          } else {
            // Realistic GT acceleration curve (strong low-speed punch, aero drag taper at high speed)
            const speedFrac = clamp(r.speedMps / classTopCap, 0, 1);
            const maxAccel = lerp(11.8, 3.2, speedFrac * 0.85) * lerp(1.0, 0.82, wetness);
            const accelGain = clamp(speedErr * 1.45, -1.5, maxAccel);
            r.speedMps = clamp(r.speedMps + accelGain * dt, 0, classTopCap * 1.06);
            r.brakeFactor = lerp(r.brakeFactor, 0, 1 - Math.exp(-14 * dt));
          }
          const longAccel = (r.speedMps - prevSpd) / dt;

          // Smooth lateral steering PD controller (feels heavy & tire-driven, never teleports!)
          const targetOvertakeOffset =
            preferredPassTarget !== 0 ? preferredPassTarget - apexLineOffset : 0;
          r.overtakeOffset = lerp(r.overtakeOffset, targetOvertakeOffset, 1 - Math.exp(-3.4 * dt));

          const targetLat = clamp(
            apexLineOffset + r.preferredLane * 0.55 + r.overtakeOffset,
            -maxHalf,
            maxHalf,
          );
          const latError = targetLat - r.lateralOffset;
          const steerGain = r.bumpRecoverTimer > 0 ? 9.5 : 14.5;
          const latDamping = r.bumpRecoverTimer > 0 ? 4.2 : 6.2;
          const latAccel = latError * steerGain - r.latVel * latDamping;
          r.latVel = clamp(r.latVel + latAccel * dt, -9.5, 9.5);
          r.lateralOffset += r.latVel * dt;
          if (r.lateralOffset > maxHalf + 0.35) {
            r.lateralOffset = maxHalf + 0.35;
            r.latVel = Math.min(0, -r.latVel * 0.25);
          } else if (r.lateralOffset < -(maxHalf + 0.35)) {
            r.lateralOffset = -(maxHalf + 0.35);
            r.latVel = Math.max(0, -r.latVel * 0.25);
          }

          // Yaw slip recovery spring-damper (natural corner slip + bump spin countersteer)
          const cornerSlipTarget = clamp(-r.smoothCurv * r.speedMps * 0.045, -0.09, 0.09);
          const yawErr = cornerSlipTarget - r.yawSlipRad;
          r.yawSlipVel += (yawErr * 18.0 - r.yawSlipVel * 6.5) * dt;
          r.yawSlipRad = clamp(r.yawSlipRad + r.yawSlipVel * dt, -0.58, 0.58);

          const ds = r.speedMps * dt;
          r.trackT = circuit.closedLoop
            ? (r.trackT + ds / trackLen) % 1
            : clamp(r.trackT + ds / trackLen, 0, 1);
          const wRad = r.instance?.wheelRadius ?? 0.355;
          r.wheelSpin += ds / wRad;

          const targetPitch = clamp(-longAccel * 0.0022, -0.025, 0.032);
          const targetRoll = clamp(
            r.smoothCurv * r.speedMps * 0.042 + r.latVel * 0.004,
            -0.052,
            0.052,
          );
          r.smoothPitch = lerp(r.smoothPitch, targetPitch, 1 - Math.exp(-8.5 * dt));
          r.smoothRoll = lerp(r.smoothRoll, targetRoll, 1 - Math.exp(-8.5 * dt));

          if (!circuit.closedLoop) {
            const progress = clamp(
              (r.trackT - startFinishT) / Math.max(0.05, 0.992 - startFinishT),
              0,
              1,
            );
            r.lastProgress = progress;
            if (!r.finished) {
              r.totalProgress = progress;
              if (r.trackT >= 0.992) {
                r.finished = true;
                r.finishTimeMs = Math.round(raceClockMs);
                r.lap = 1;
                r.totalProgress = 1.0;
              }
            }
          } else {
            const progress = ((r.trackT - startFinishT) % 1 + 1) % 1;
            if (r.lastProgress > 0.85 && progress < 0.15) {
              if (!r.crossedStartOnce) {
                r.crossedStartOnce = true;
              } else if (!r.finished) {
                r.lap += 1;
              }
            }
            r.lastProgress = progress;
            if (!r.finished) {
              r.totalProgress = r.crossedStartOnce ? r.lap - 1 + progress : progress - 1;
              if (targetLapCount > 0 && r.crossedStartOnce && r.lap > targetLapCount) {
                r.finished = true;
                r.finishTimeMs = Math.round(raceClockMs);
                r.lap = targetLapCount;
                r.totalProgress = Math.max(r.totalProgress, targetLapCount);
              }
            }
          }
        }
      }

      // AI-to-AI 2D physical separation & door-to-door momentum exchange
      if (raceLive && rivals.length > 1) {
        for (let i = 0; i < rivals.length; i++) {
          const a = rivals[i];
          sampleTrackFrame(a.trackT, _posA, _tanA, _rightA, _upA);
          a.pos.copy(_posA).addScaledVector(_rightA, a.lateralOffset).addScaledVector(_upA, 0.03);
          a.fwd.copy(_tanA);
          a.rightVec.copy(_rightA);
        }
        const minAiDist = 2.2;
        for (let i = 0; i < rivals.length; i++) {
          for (let j = i + 1; j < rivals.length; j++) {
            const a = rivals[i];
            const b = rivals[j];
            const dx = a.pos.x - b.pos.x;
            const dz = a.pos.z - b.pos.z;
            const dSq = dx * dx + dz * dz;
            if (dSq > 0.0001 && dSq < minAiDist * minAiDist) {
              const dist = Math.sqrt(dSq);
              const pen = Math.min(minAiDist - dist, 0.55);
              const nx = dx / dist;
              const nz = dz / dist;

              const aLatDot = nx * a.rightVec.x + nz * a.rightVec.z;
              const aFwdDot = nx * a.fwd.x + nz * a.fwd.z;
              a.lateralOffset = clamp(a.lateralOffset + aLatDot * pen * 0.5, -(maxHalf + 0.3), maxHalf + 0.3);
              b.lateralOffset = clamp(b.lateralOffset - aLatDot * pen * 0.5, -(maxHalf + 0.3), maxHalf + 0.3);
              a.latVel += aLatDot * 2.2;
              b.latVel -= aLatDot * 2.2;

              if (Math.abs(aFwdDot) > 0.35) {
                const avgSpd = (a.speedMps + b.speedMps) * 0.5;
                a.speedMps = lerp(a.speedMps, avgSpd + (aFwdDot > 0 ? 1.0 : -1.0), 0.35);
                b.speedMps = lerp(b.speedMps, avgSpd + (aFwdDot > 0 ? -1.0 : 1.0), 0.35);
              }
            }
          }
        }
      }

      // Sync final world transforms, telemetry snapshots & rival wet/slip wake
      if (getMistTexture && rWakeMat.uniforms.uHasMap.value < 0.5) {
        const mistTex = getMistTexture();
        if (mistTex) {
          rWakeMat.uniforms.uMap.value = mistTex;
          rWakeMat.uniforms.uHasMap.value = 1.0;
        }
      }
      rWakeMat.uniforms.uNightDim.value = lerp(1.0, 0.36, nightFactor);

      for (let i = 0; i < rivals.length; i++) {
        const r = rivals[i];
        if (raceLive) {
          syncRivalVisual(r, nightFactor, wetness);

          const dxP = r.pos.x - playerPos.x;
          const dzP = r.pos.z - playerPos.z;
          if (dxP * dxP + dzP * dzP < 185 * 185 && r.speedMps > 5.0) {
            const wetEmit = wetness > 0.05 ? wetness * clamp(r.speedMps / 65, 0.2, 1.0) : 0;
            const slipAmt = Math.abs(r.yawSlipRad);
            const smokeEmit =
              wetness < 0.72 && (slipAmt > 0.08 || r.brakeFactor > 0.48)
                ? clamp(Math.max((slipAmt - 0.06) * 2.4, (r.brakeFactor - 0.45) * 1.2), 0, 1)
                : 0;
            const totalEmit = Math.max(wetEmit, smokeEmit);
            if (totalEmit > 0.08) {
              rWakeAccum += dt * (12 + totalEmit * 24);
              const count = Math.min(3, Math.floor(rWakeAccum));
              if (count > 0) {
                rWakeAccum -= count;
                for (let k = 0; k < count; k++) {
                  const side = k % 2 === 0 ? 0.86 : -0.86;
                  const rn1 = nextRWakeRand() - 0.5;
                  const rn2 = nextRWakeRand();
                  const isWater = wetEmit >= smokeEmit;
                  const slot = rWakeCursor % MAX_RIVAL_WAKE;
                  rWakeCursor = (rWakeCursor + 1) % MAX_RIVAL_WAKE;
                  const s3 = slot * 3;
                  rWakePos[s3] = r.pos.x + r.rightVec.x * side - r.fwd.x * 1.38 + rn1 * 0.2;
                  rWakePos[s3 + 1] = r.pos.y + 0.16 + rn2 * 0.1;
                  rWakePos[s3 + 2] = r.pos.z + r.rightVec.z * side - r.fwd.z * 1.38 + rn1 * 0.2;
                  const backSpd = clamp(r.speedMps * 0.18, 1.2, 10.5);
                  rWakeVel[s3] = -r.fwd.x * backSpd + r.rightVec.x * (side * 0.8 + rn1 * 1.4);
                  rWakeVel[s3 + 1] = isWater ? 1.8 + rn2 * 2.4 : 0.85 + rn2 * 1.1;
                  rWakeVel[s3 + 2] = -r.fwd.z * backSpd + r.rightVec.z * (side * 0.8 + rn1 * 1.4);
                  const life = isWater ? 0.42 + rn2 * 0.26 : 0.72 + rn2 * 0.45;
                  rWakeLife[slot] = life;
                  rWakeMaxLife[slot] = life;
                  rWakeSize0[slot] = isWater ? 0.46 : 0.55;
                  rWakeSize1[slot] = isWater ? 2.1 : 2.95;
                  rWakePeakAlpha[slot] = clamp(0.16 + totalEmit * 0.24, 0.1, 0.38);
                  rWakeTints[slot] = isWater ? 0.85 : 0.05;
                }
              }
            }
          }
        }
        const snap = snapshots[i];
        snap.carId = r.activeCarId;
        snap.carName = r.carName;
        snap.x = r.pos.x;
        snap.z = r.pos.z;
        snap.vx = r.vel.x;
        snap.vz = r.vel.z;
        snap.trackT = r.trackT;
        snap.totalProgress = r.totalProgress;
        snap.lap = r.lap;
        snap.finished = r.finished;
        snap.finishTimeMs = r.finishTimeMs;
      }

      let anyRWake = false;
      const rDamp = Math.exp(-1.55 * dt);
      for (let i = 0; i < MAX_RIVAL_WAKE; i++) {
        const rem = rWakeLife[i];
        if (rem <= 0) {
          rWakeAlphas[i] = 0;
          continue;
        }
        anyRWake = true;
        const nextRem = rem - dt;
        rWakeLife[i] = nextRem;
        if (nextRem <= 0) {
          rWakeAlphas[i] = 0;
          rWakePos[i * 3 + 1] = -9999;
          continue;
        }
        const age = 1.0 - nextRem / Math.max(rWakeMaxLife[i], 0.01);
        const i3 = i * 3;
        const grav = rWakeTints[i] > 0.5 ? 5.8 : -0.7;
        rWakeVel[i3] *= rDamp;
        rWakeVel[i3 + 1] = (rWakeVel[i3 + 1] - grav * dt) * rDamp;
        rWakeVel[i3 + 2] *= rDamp;
        rWakePos[i3] += rWakeVel[i3] * dt;
        rWakePos[i3 + 1] += rWakeVel[i3 + 1] * dt;
        rWakePos[i3 + 2] += rWakeVel[i3 + 2] * dt;
        rWakeSizes[i] = lerp(rWakeSize0[i], rWakeSize1[i], Math.pow(age, 0.72));
        rWakeAlphas[i] = rWakePeakAlpha[i] * clamp(age / 0.14, 0, 1) * Math.pow(1 - age, 1.45);
      }
      rWakePoints.visible = anyRWake;
      if (anyRWake) {
        rWakePosAttr.needsUpdate = true;
        rWakeSizeAttr.needsUpdate = true;
        rWakeAlphaAttr.needsUpdate = true;
        rWakeTintAttr.needsUpdate = true;
      }
      void playerSpeedMps;
    },
    applyCarImpacts: (impacts: CarImpactTransfer[]) => {
      if (!active || impacts.length === 0) return;
      const trackLen = Math.max(100, circuit.totalLength);
      const maxHalf = Math.max(3.6, circuit.roadHalfWidth - 1.15);

      for (let k = 0; k < impacts.length; k++) {
        const imp = impacts[k];
        let target: RivalState | null = null;
        let targetIdx = -1;
        for (let i = 0; i < rivals.length; i++) {
          if (rivals[i].id === imp.id) {
            target = rivals[i];
            targetIdx = i;
            break;
          }
        }
        if (!target) continue;

        sampleTrackFrame(target.trackT, _posA, _tanA, _rightA, _upA);

        // Apply world push in spline (trackT + lateralOffset) coordinates
        const pushFwd = imp.pushX * _tanA.x + imp.pushZ * _tanA.z;
        const pushLat = imp.pushX * _rightA.x + imp.pushZ * _rightA.z;
        target.trackT = circuit.closedLoop
          ? ((target.trackT + pushFwd / trackLen) % 1 + 1) % 1
          : clamp(target.trackT + pushFwd / trackLen, 0, 1);
        target.lateralOffset = clamp(target.lateralOffset + pushLat, -(maxHalf + 0.35), maxHalf + 0.35);

        // Apply velocity impulse along track forward & lateral vectors
        const impFwd = imp.impulseVx * _tanA.x + imp.impulseVz * _tanA.z;
        const impLat = imp.impulseVx * _rightA.x + imp.impulseVz * _rightA.z;
        target.speedMps = clamp(target.speedMps + impFwd, 4.0, 92.0);
        target.latVel = clamp(target.latVel + impLat, -11.0, 11.0);

        // Apply realistic yaw spin / countersteer disturbance
        target.yawSlipVel = clamp(target.yawSlipVel + imp.yawKick * 2.2, -3.5, 3.5);
        target.yawSlipRad = clamp(target.yawSlipRad + imp.yawKick * 0.08, -0.58, 0.58);
        target.bumpRecoverTimer = Math.max(target.bumpRecoverTimer, 0.45 + imp.severity * 0.45);

        // Keep snapshot immediately fresh
        sampleTrackFrame(target.trackT, _posA, _tanA, _rightA, _upA);
        target.pos.copy(_posA).addScaledVector(_rightA, target.lateralOffset).addScaledVector(_upA, 0.03);
        target.vel.copy(_tanA).multiplyScalar(target.speedMps).addScaledVector(_rightA, target.latVel);
        target.host.position.copy(target.pos);

        if (targetIdx >= 0) {
          snapshots[targetIdx].x = target.pos.x;
          snapshots[targetIdx].z = target.pos.z;
          snapshots[targetIdx].vx = target.vel.x;
          snapshots[targetIdx].vz = target.vel.z;
          snapshots[targetIdx].trackT = target.trackT;
        }
      }
    },
    getSnapshots: () => (active ? snapshots : []),
    getReplayPoses: (outPoses: AiRivalReplayPose[]): number => {
      if (!active) return 0;
      const count = Math.min(rivals.length, outPoses.length);
      for (let i = 0; i < count; i++) {
        const r = rivals[i];
        const dst = outPoses[i];
        dst.pos.copy(r.host.position);
        dst.quat.copy(r.host.quaternion);
        dst.pitch = r.smoothPitch;
        dst.roll = r.smoothRoll;
        dst.wheelSpin = r.wheelSpin;
        dst.steerAngle = r.steerAngle;
        dst.brakeFactor = r.brakeFactor;
        dst.speedMps = r.speedMps;
      }
      return count;
    },
    applyReplayPoses: (
      poses: AiRivalReplayPose[],
      count: number,
      nightFactor: number,
      wetness: number,
    ) => {
      const limit = Math.min(rivals.length, count);
      for (let i = 0; i < limit; i++) {
        const r = rivals[i];
        const p = poses[i];
        r.host.visible = true;
        r.host.position.copy(p.pos);
        r.host.quaternion.copy(p.quat);
        r.smoothPitch = p.pitch;
        r.smoothRoll = p.roll;
        r.wheelSpin = p.wheelSpin;
        r.steerAngle = p.steerAngle;
        r.brakeFactor = p.brakeFactor;
        r.speedMps = p.speedMps;
        applyRivalPoseToInstance(r, nightFactor, wetness);
      }
      for (let i = limit; i < rivals.length; i++) {
        rivals[i].host.visible = false;
      }
    },
    parkOnPodium: (
      poses: Array<{ pos: THREE.Vector3; yaw: number }>,
      nightFactor: number,
      wetness: number,
    ) => {
      group.visible = true;
      for (let i = 0; i < rivals.length; i++) {
        const r = rivals[i];
        if (i < poses.length) {
          const p = poses[i];
          r.host.visible = true;
          r.host.position.copy(p.pos);
          r.host.quaternion.setFromAxisAngle(_upA.set(0, 1, 0), p.yaw);
          r.smoothPitch = 0;
          r.smoothRoll = 0;
          r.steerAngle = i === 0 ? 0.16 : -0.16;
          r.brakeFactor = 0.25;
          applyRivalPoseToInstance(r, nightFactor, wetness);
        } else {
          r.host.visible = false;
        }
      }
    },
    dispose: () => {
      rWakeGeo.dispose();
      rWakeMat.dispose();
      for (const r of rivals) {
        r.instance?.dispose();
      }
    },
  };
}
