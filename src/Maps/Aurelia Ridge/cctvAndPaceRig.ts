import * as THREE from 'three';
import {
  createCircuitQueryScratch,
  getCircuitData,
  SHOULDER_WIDTH,
} from './circuitSpline';
import { clamp, lerp } from '../../engine/mathNoise';
import { McLarenCarInstance } from '../../engine/mclarenCarLoader';
import { CAR_POSTFX_LAYER } from '../../engine/carPostFx';
import { type ProceduralTextureSuite } from './proceduralTextures';
import { type WeatherUniforms } from './skyAndLighting';
import { groundHeightAt } from './terrainField';
import { worldColliders } from './worldColliders';

export interface CctvStationInfo {
  index: number;
  code: string;
  label: string;
  trackT: number;
}

export interface PlayerCarFrameState {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  bodyPitch: number;
  bodyRoll: number;
  bodyHeave?: number;
  wheelSpin: number;
  wheelSpins?: [number, number, number, number];
  wheelSuspOffsets?: [number, number, number, number];
  steerAngle: number;
  steerAngleFL?: number;
  steerAngleFR?: number;
  speedMps: number;
  brakeSkidIntensity: number;
  brakePedal: number;
  handbrake: boolean;
  wheelSlips?: [number, number, number, number];
  surface?: string;
  headlightsOn: boolean;
  dirtLevel: number;
  wetness: number;
  isInteriorView: boolean;
  activeAeroEnabled?: boolean;
  aeroDeployed?: boolean;
  deltaSec?: number;
}

export interface CctvAndPaceRig {
  group: THREE.Group;
  attachCar: (car: McLarenCarInstance) => void;
  getCarRoot: () => THREE.Group | null;
  setPlayerControlled: (controlled: boolean) => void;
  refreshCircuit: () => void;
  applyPlayerState: (state: PlayerCarFrameState) => void;
  update: (deltaSec: number, elapsedSec: number) => void;
  setCarVisible: (visible: boolean) => void;
  getChaseViewPose: (
    outCarPos: THREE.Vector3,
    outTangent: THREE.Vector3,
    outRight: THREE.Vector3,
    outUp: THREE.Vector3,
  ) => void;
  getStationCount: () => number;
  getStations: () => CctvStationInfo[];
  getNearestStationIndex: () => number;
  getActiveViewPose: (
    stationIndex: number,
    outPos: THREE.Vector3,
    outTarget: THREE.Vector3,
  ) => void;
  emitCollisionSparks: (
    x: number,
    y: number,
    z: number,
    nx: number,
    nz: number,
    vx: number,
    vz: number,
    intensity: number,
  ) => void;
  setNightFactor: (nightFactor: number) => void;
  setWireframe: (wire: boolean) => void;
  dispose: () => void;
}

interface CctvStationNode {
  info: CctvStationInfo;
  panGroup: THREE.Group;
  tiltGroup: THREE.Group;
  lensAnchor: THREE.Object3D;
  tallyMat: THREE.MeshStandardMaterial;
  currentYaw: number;
  currentPitch: number;
}

const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _tanA = new THREE.Vector3();
const _tanB = new THREE.Vector3();
const _rightA = new THREE.Vector3();
const _rightB = new THREE.Vector3();
const _upA = new THREE.Vector3();
const _upB = new THREE.Vector3();
const _carWorldPos = new THREE.Vector3();
const _carFocusPos = new THREE.Vector3();
const _basisMat = new THREE.Matrix4();
const _carBaseQuat = new THREE.Quaternion();
const _eulerOff = new THREE.Euler();
const _quatOff = new THREE.Quaternion();
const _toCar = new THREE.Vector3();
const _towerWorldPos = new THREE.Vector3();
const _negRight = new THREE.Vector3();

function wrapAngle(a: number): number {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
}

/**
 * Hosts the player-controlled / spectator GT3 race car on the circuit,
 * braking-only procedural tire skid trails, wet rain wake spray, brake tire smoke,
 * and six motorized trackside CCTV towers that pan/tilt onto the active car.
 */
export function buildCctvAndPaceRig(
  textures?: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): CctvAndPaceRig {
  const group = new THREE.Group();
  group.name = 'CctvAndPaceRig';

  let circuit = getCircuitData();
  let samples = circuit.samples;
  let N = samples.length;

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const wireframeMats: THREE.MeshStandardMaterial[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    if (m instanceof THREE.MeshStandardMaterial) {
      wireframeMats.push(m);
    }
    return m;
  };

  // Wrapper node that receives the loaded GT3 car GLB instance
  const carHost = new THREE.Group();
  carHost.name = 'PlayerCarTrackHost';
  group.add(carHost);

  let attachedCar: McLarenCarInstance | null = null;
  let carVisible = false;
  let playerControlled = true;
  let headlightsOn = false;
  let nightLevel = 0;

  carHost.visible = false;

  interface PooledEmitter {
    points: THREE.Points;
    pos: Float32Array;
    vel: Float32Array;
    life: Float32Array;
    maxLife: Float32Array;
    startSize: Float32Array;
    endSize: Float32Array;
    peakAlpha: Float32Array;
    tint: Float32Array;
    posAttr: THREE.BufferAttribute;
    sizeAttr: THREE.BufferAttribute;
    alphaAttr: THREE.BufferAttribute;
    tintAttr: THREE.BufferAttribute;
    mat: THREE.ShaderMaterial;
    cursor: number;
    maxCount: number;
    drag: number;
    buoyancy: number;
    gravity: number;
  }

  const createPooledEmitter = (
    maxCount: number,
    colorAHex: number,
    colorBHex: number,
    drag: number,
    buoyancy: number,
    gravity: number,
    renderOrder = 3,
  ): PooledEmitter => {
    const pos = new Float32Array(maxCount * 3);
    const vel = new Float32Array(maxCount * 3);
    const life = new Float32Array(maxCount);
    const maxLife = new Float32Array(maxCount);
    const startSize = new Float32Array(maxCount);
    const endSize = new Float32Array(maxCount);
    const peakAlpha = new Float32Array(maxCount);
    const tint = new Float32Array(maxCount);
    const sizes = new Float32Array(maxCount);
    const alphas = new Float32Array(maxCount);

    for (let i = 0; i < maxCount; i++) {
      pos[i * 3 + 1] = -9999;
    }

    const geo = trackGeo(new THREE.BufferGeometry());
    const posAttr = new THREE.BufferAttribute(pos, 3);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const sizeAttr = new THREE.BufferAttribute(sizes, 1);
    sizeAttr.setUsage(THREE.DynamicDrawUsage);
    const alphaAttr = new THREE.BufferAttribute(alphas, 1);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    const tintAttr = new THREE.BufferAttribute(tint, 1);
    tintAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr);
    geo.setAttribute('aSize', sizeAttr);
    geo.setAttribute('aAlpha', alphaAttr);
    geo.setAttribute('aTintMix', tintAttr);

    const hasMistTex = Boolean(textures?.mistSpriteAlbedo);
    const pixelRatio =
      typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const mat = trackMat(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMap: { value: textures?.mistSpriteAlbedo ?? null },
          uHasMap: { value: hasMistTex ? 1.0 : 0.0 },
          uPixelRatio: { value: pixelRatio },
          uColorA: { value: new THREE.Color(colorAHex) },
          uColorB: { value: new THREE.Color(colorBHex) },
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
            gl_PointSize = clamp((aSize * 340.0 * uPixelRatio) / max(1.0, -mvPos.z), 1.5, 165.0);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          uniform float uHasMap;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
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
            vec3 col = mix(uColorA, uColorB, vTintMix) * uNightDim;
            gl_FragColor = vec4(col, alpha);
          }
        `,
      }),
    );

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.visible = false;
    points.renderOrder = renderOrder;
    group.add(points);

    return {
      points,
      pos,
      vel,
      life,
      maxLife,
      startSize,
      endSize,
      peakAlpha,
      tint,
      posAttr,
      sizeAttr,
      alphaAttr,
      tintAttr,
      mat,
      cursor: 0,
      maxCount,
      drag,
      buoyancy,
      gravity,
    };
  };

  const spawnPooledParticle = (
    pool: PooledEmitter,
    px: number,
    py: number,
    pz: number,
    vx: number,
    vy: number,
    vz: number,
    lifeSec: number,
    size0: number,
    size1: number,
    alpha: number,
    tintMix: number,
  ) => {
    const slot = pool.cursor % pool.maxCount;
    pool.cursor = (pool.cursor + 1) % pool.maxCount;
    const i3 = slot * 3;
    pool.pos[i3] = px;
    pool.pos[i3 + 1] = py;
    pool.pos[i3 + 2] = pz;
    pool.vel[i3] = vx;
    pool.vel[i3 + 1] = vy;
    pool.vel[i3 + 2] = vz;
    pool.life[slot] = lifeSec;
    pool.maxLife[slot] = lifeSec;
    pool.startSize[slot] = size0;
    pool.endSize[slot] = size1;
    pool.peakAlpha[slot] = alpha;
    pool.tint[slot] = tintMix;
  };

  const stepPooledEmitter = (
    pool: PooledEmitter,
    dt: number,
    windX: number,
    windZ: number,
  ) => {
    let anyAlive = false;
    const damp = Math.exp(-pool.drag * dt);
    const sArr = pool.sizeAttr.array as Float32Array;
    const aArr = pool.alphaAttr.array as Float32Array;

    for (let i = 0; i < pool.maxCount; i++) {
      const rem = pool.life[i];
      if (rem <= 0) {
        aArr[i] = 0;
        continue;
      }
      anyAlive = true;
      const nextRem = rem - dt;
      pool.life[i] = nextRem;
      if (nextRem <= 0) {
        aArr[i] = 0;
        pool.pos[i * 3 + 1] = -9999;
        continue;
      }

      const age = 1.0 - nextRem / Math.max(pool.maxLife[i], 0.01);
      const i3 = i * 3;

      pool.vel[i3] = (pool.vel[i3] + windX * 0.25 * dt) * damp;
      pool.vel[i3 + 1] = (pool.vel[i3 + 1] + (pool.buoyancy - pool.gravity) * dt) * damp;
      pool.vel[i3 + 2] = (pool.vel[i3 + 2] + windZ * 0.25 * dt) * damp;

      pool.pos[i3] += pool.vel[i3] * dt;
      pool.pos[i3 + 1] += pool.vel[i3 + 1] * dt;
      pool.pos[i3 + 2] += pool.vel[i3 + 2] * dt;

      // Keep billows from sinking underground
      if (pool.pos[i3 + 1] < -20) {
        pool.life[i] = 0;
        aArr[i] = 0;
        continue;
      }

      sArr[i] = lerp(pool.startSize[i], pool.endSize[i], Math.pow(age, 0.72));
      const fadeIn = clamp(age / 0.14, 0, 1);
      const fadeOut = Math.pow(1.0 - age, 1.45);
      aArr[i] = pool.peakAlpha[i] * fadeIn * fadeOut;
    }

    pool.points.visible = anyAlive;
    if (anyAlive) {
      pool.posAttr.needsUpdate = true;
      pool.sizeAttr.needsUpdate = true;
      pool.alphaAttr.needsUpdate = true;
      pool.tintAttr.needsUpdate = true;
    }
  };

  // Realistic world-space pooled emitters for Tire Smoke, Wet Water Spray/Rooster-Tails & Offroad Dust
  const smokePool = createPooledEmitter(260, 0xf2f5f9, 0xc7d2df, 1.7, 0.95, 0.0, 3);
  const sprayPool = createPooledEmitter(260, 0xeef7ff, 0xb8d7ed, 1.45, 0.25, 9.6, 3);
  const dirtPool = createPooledEmitter(160, 0x876747, 0x624a33, 1.5, 0.15, 12.2, 3);
  const smokeEmitAccum = [0, 0, 0, 0];
  let sprayEmitAccum = 0;
  let dirtEmitAccum = 0;
  let emitRandSeed = 13791;
  const nextNoise = () => {
    emitRandSeed = (Math.imul(emitRandSeed, 1664525) + 1013904223) >>> 0;
    return emitRandSeed / 4294967295;
  };

  // Metallic Wall Impact & Scrape Spark Streaks Pool (additive gold-white streaks)
  const MAX_SPARKS = 96;
  const sparkHead = new Float32Array(MAX_SPARKS * 3);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  const sparkMaxLife = new Float32Array(MAX_SPARKS);
  const sparkLinePos = new Float32Array(MAX_SPARKS * 2 * 3);
  const sparkLineCol = new Float32Array(MAX_SPARKS * 2 * 3);

  const sparkGeo = trackGeo(new THREE.BufferGeometry());
  const sparkPosAttr = new THREE.BufferAttribute(sparkLinePos, 3);
  sparkPosAttr.setUsage(THREE.DynamicDrawUsage);
  const sparkColAttr = new THREE.BufferAttribute(sparkLineCol, 3);
  sparkColAttr.setUsage(THREE.DynamicDrawUsage);
  sparkGeo.setAttribute('position', sparkPosAttr);
  sparkGeo.setAttribute('color', sparkColAttr);

  const sparkMat = trackMat(
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  const sparkMesh = new THREE.LineSegments(sparkGeo, sparkMat);
  sparkMesh.frustumCulled = false;
  sparkMesh.visible = false;
  group.add(sparkMesh);
  let sparkCursor = 0;

  // ---------------------------------------------------------------------------
  // BRAKING-ONLY DYNAMIC PROCEDURAL TIRE SKID MARKS
  // Emitted strictly while actively braking (brake pedal / handbrake), fading over time
  // ---------------------------------------------------------------------------
  const MAX_SKID_QUADS = 1400;
  const skidPositions = new Float32Array(MAX_SKID_QUADS * 4 * 3);
  const skidUvs = new Float32Array(MAX_SKID_QUADS * 4 * 2);
  const skidMeta = new Float32Array(MAX_SKID_QUADS * 4 * 2);
  const skidIndices = new Uint16Array(MAX_SKID_QUADS * 6);
  for (let q = 0; q < MAX_SKID_QUADS; q++) {
    const vBase = q * 4;
    const iBase = q * 6;
    skidIndices[iBase] = vBase;
    skidIndices[iBase + 1] = vBase + 1;
    skidIndices[iBase + 2] = vBase + 2;
    skidIndices[iBase + 3] = vBase + 1;
    skidIndices[iBase + 4] = vBase + 3;
    skidIndices[iBase + 5] = vBase + 2;
    for (let v = 0; v < 4; v++) {
      skidMeta[(vBase + v) * 2] = -999.0;
      skidMeta[(vBase + v) * 2 + 1] = 0.0;
    }
  }

  const skidGeo = trackGeo(new THREE.BufferGeometry());
  const skidPosAttr = new THREE.BufferAttribute(skidPositions, 3);
  skidPosAttr.setUsage(THREE.DynamicDrawUsage);
  const skidUvAttr = new THREE.BufferAttribute(skidUvs, 2);
  skidUvAttr.setUsage(THREE.DynamicDrawUsage);
  const skidMetaAttr = new THREE.BufferAttribute(skidMeta, 2);
  skidMetaAttr.setUsage(THREE.DynamicDrawUsage);

  skidGeo.setAttribute('position', skidPosAttr);
  skidGeo.setAttribute('uv', skidUvAttr);
  skidGeo.setAttribute('aSkidMeta', skidMetaAttr);
  skidGeo.setIndex(new THREE.BufferAttribute(skidIndices, 1));

  const skidMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFadeDuration: { value: 18.0 },
        uWetness: weatherUniforms?.uWetness ?? { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
      vertexShader: `
        attribute vec2 aSkidMeta;
        varying vec2 vUv;
        varying vec2 vMeta;
        void main() {
          vUv = uv;
          vMeta = aSkidMeta;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uFadeDuration;
        uniform float uWetness;
        varying vec2 vUv;
        varying vec2 vMeta;
        void main() {
          float birthTime = vMeta.x;
          float intensity = vMeta.y;
          if (intensity <= 0.01 || birthTime < -500.0) discard;
          float age = max(uTime - birthTime, 0.0);
          float life = clamp(age / max(uFadeDuration, 1.0), 0.0, 1.0);
          if (life >= 1.0) discard;

          float timeFade = 1.0 - smoothstep(0.16, 1.0, life);
          timeFade = timeFade * timeFade;

          float edgeSoft = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
          float treadGroove = 0.85 + 0.15 * cos((vUv.x - 0.5) * 14.0);
          float chatter = 0.8 + 0.2 * sin(vUv.y * 16.0 + birthTime * 5.0);

          float alpha = clamp(intensity * edgeSoft * treadGroove * chatter * timeFade * mix(0.82, 0.56, uWetness), 0.0, 0.88);
          if (alpha < 0.01) discard;

          vec3 rubberCol = mix(vec3(0.028, 0.030, 0.034), vec3(0.016, 0.018, 0.022), uWetness);
          gl_FragColor = vec4(rubberCol, alpha);
        }
      `,
    }),
  );

  const skidMesh = new THREE.Mesh(skidGeo, skidMat);
  skidMesh.frustumCulled = false;
  skidMesh.renderOrder = 2;
  group.add(skidMesh);

  // ---------------------------------------------------------------------------
  // SIX ANIMATED TRACKSIDE BROADCAST CCTV CAMERA TOWERS
  // ---------------------------------------------------------------------------
  const mastSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x93a0ae,
      roughness: 0.34,
      metalness: 0.84,
      envMapIntensity: 1.2,
    }),
  );
  const padConcreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c636b,
      roughness: 0.88,
      metalness: 0.05,
    }),
  );
  const camShellMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xdfe4ea,
      roughness: 0.38,
      metalness: 0.24,
    }),
  );
  const camDarkTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b2028,
      roughness: 0.44,
      metalness: 0.65,
    }),
  );
  const collarAmberMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe69517,
      roughness: 0.35,
      metalness: 0.25,
    }),
  );
  const opticalLensMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0d2742,
      roughness: 0.04,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      envMapIntensity: 1.9,
    }),
  );

  const sfT = circuit.startFinishIndex / N;
  const stationTargets: Array<{ code: string; label: string; targetT: number; heightOffset: number }> =
    circuit.mapId === 'coral_bay'
      ? [
          { code: 'CAM 01', label: 'Palm Sweeper', targetT: (sfT + 0.08) % 1, heightOffset: 6.4 },
          { code: 'CAM 02', label: 'Coral Hook', targetT: (sfT + 0.21) % 1, heightOffset: 6.8 },
          { code: 'CAM 03', label: 'Hammerhead Point', targetT: (sfT + 0.34) % 1, heightOffset: 7.4 },
          { code: 'CAM 04', label: 'Reef Causeway', targetT: (sfT + 0.48) % 1, heightOffset: 7.4 },
          { code: 'CAM 05', label: 'Sunset Bluff', targetT: (sfT + 0.65) % 1, heightOffset: 7.2 },
          { code: 'CAM 06', label: 'Marina Chicane', targetT: (sfT + 0.84) % 1, heightOffset: 6.6 },
        ]
      : circuit.mapId === 'frostpeak_pass'
      ? [
          { code: 'CAM 01', label: 'Ridge Pit Exit', targetT: (sfT + 0.08) % 1, heightOffset: 6.6 },
          { code: 'CAM 02', label: 'West Switchbacks', targetT: (sfT + 0.24) % 1, heightOffset: 7.4 },
          { code: 'CAM 03', label: 'Ski Village Turn', targetT: (sfT + 0.40) % 1, heightOffset: 7.0 },
          { code: 'CAM 04', label: 'Frost Lake Span', targetT: (sfT + 0.57) % 1, heightOffset: 7.6 },
          { code: 'CAM 05', label: 'East Fjord Hairpin', targetT: (sfT + 0.72) % 1, heightOffset: 7.2 },
          { code: 'CAM 06', label: 'Summit Approach', targetT: (sfT + 0.89) % 1, heightOffset: 6.8 },
        ]
      : [
          { code: 'CAM 01', label: 'Pit Exit', targetT: 0.09, heightOffset: 6.4 },
          { code: 'CAM 02', label: 'Turn 1 Dip', targetT: 0.19, heightOffset: 6.8 },
          { code: 'CAM 03', label: 'Cable Bridge', targetT: 0.37, heightOffset: 7.4 },
          { code: 'CAM 04', label: 'Karussell Bowl', targetT: 0.56, heightOffset: 7.0 },
          { code: 'CAM 05', label: 'Canyon Esses', targetT: 0.76, heightOffset: 7.2 },
          { code: 'CAM 06', label: 'Final Hairpin', targetT: 0.93, heightOffset: 6.6 },
        ];

  const stations: CctvStationNode[] = [];

  const padGeo = trackGeo(new THREE.BoxGeometry(1.75, 2.2, 1.75));
  const mastGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.15, 1.0, 10));
  const flangeGeo = trackGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12));
  const collarGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 12));
  const yokeBaseGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.18, 0.34));
  const yokeArmGeo = trackGeo(new THREE.BoxGeometry(0.08, 0.38, 0.16));
  const camBodyGeo = trackGeo(new THREE.BoxGeometry(0.36, 0.32, 0.72));
  const camHoodGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.14, 0.96));
  const lensBarrelOuterGeo = trackGeo(new THREE.CylinderGeometry(0.12, 0.13, 0.34, 16));
  lensBarrelOuterGeo.rotateX(Math.PI * 0.5);
  const lensGlassGeo = trackGeo(new THREE.CylinderGeometry(0.095, 0.095, 0.04, 16));
  lensGlassGeo.rotateX(Math.PI * 0.5);
  const tallyLedGeo = trackGeo(new THREE.BoxGeometry(0.07, 0.055, 0.04));

  stationTargets.forEach((def, idx) => {
    let sampleIdx = Math.floor(def.targetT * N) % N;
    for (let step = 0; step < 80; step++) {
      const fwd = (sampleIdx + step) % N;
      const bwd = (sampleIdx - step + N) % N;
      if (!samples[fwd].isBridge) {
        sampleIdx = fwd;
        break;
      }
      if (!samples[bwd].isBridge) {
        sampleIdx = bwd;
        break;
      }
    }

    const s = samples[sampleIdx];
    const outSide = s.curvature >= 0 ? 1 : -1;
    const lat = outSide * (circuit.roadHalfWidth + SHOULDER_WIDTH + 3.6);
    const tx = s.position.x + s.right.x * lat;
    const tz = s.position.z + s.right.z * lat;
    const ty = groundHeightAt(tx, tz);

    const towerGroup = new THREE.Group();
    towerGroup.name = `CctvTower_${idx + 1}`;
    towerGroup.position.set(tx, ty, tz);

    const pad = new THREE.Mesh(padGeo, padConcreteMat);
    pad.position.y = -0.85;
    pad.castShadow = true;
    pad.receiveShadow = true;
    towerGroup.add(pad);

    const mastH = def.heightOffset;
    const mast = new THREE.Mesh(mastGeo, mastSteelMat);
    mast.scale.y = mastH;
    mast.position.y = mastH * 0.5 + 0.2;
    mast.castShadow = true;
    towerGroup.add(mast);

    const collar = new THREE.Mesh(collarGeo, collarAmberMat);
    collar.position.y = mastH - 0.55;
    towerGroup.add(collar);

    const flange = new THREE.Mesh(flangeGeo, camDarkTrimMat);
    flange.position.y = mastH + 0.22;
    towerGroup.add(flange);

    const panGroup = new THREE.Group();
    panGroup.position.set(0, mastH + 0.34, 0);
    towerGroup.add(panGroup);

    const yokeBase = new THREE.Mesh(yokeBaseGeo, camDarkTrimMat);
    yokeBase.position.y = 0.06;
    panGroup.add(yokeBase);

    for (const ax of [-0.2, 0.2]) {
      const arm = new THREE.Mesh(yokeArmGeo, camDarkTrimMat);
      arm.position.set(ax, 0.28, 0);
      panGroup.add(arm);
    }

    const tiltGroup = new THREE.Group();
    tiltGroup.position.set(0, 0.42, 0);
    panGroup.add(tiltGroup);

    const camBody = new THREE.Mesh(camBodyGeo, camShellMat);
    camBody.castShadow = true;
    tiltGroup.add(camBody);

    const camHood = new THREE.Mesh(camHoodGeo, camShellMat);
    camHood.position.set(0, 0.18, 0.08);
    camHood.castShadow = true;
    tiltGroup.add(camHood);

    const lensBarrel = new THREE.Mesh(lensBarrelOuterGeo, camDarkTrimMat);
    lensBarrel.position.set(0, -0.02, 0.46);
    tiltGroup.add(lensBarrel);

    const lensGlass = new THREE.Mesh(lensGlassGeo, opticalLensMat);
    lensGlass.position.set(0, -0.02, 0.62);
    tiltGroup.add(lensGlass);

    const tallyMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x801414,
        emissive: 0xff2626,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    const tallyLed = new THREE.Mesh(tallyLedGeo, tallyMat);
    tallyLed.position.set(0.14, 0.14, 0.36);
    tiltGroup.add(tallyLed);

    const lensAnchor = new THREE.Object3D();
    lensAnchor.position.set(0, 0.02, 0.85);
    tiltGroup.add(lensAnchor);

    group.add(towerGroup);
    worldColliders.addObb(tx, tz, 0.95, 0.95, 1, 0, 'concrete', ty - 2.0, ty + 8.0);

    stations.push({
      info: {
        index: idx,
        code: def.code,
        label: def.label,
        trackT: sampleIdx / N,
      },
      panGroup,
      tiltGroup,
      lensAnchor,
      tallyMat,
      currentYaw: 0,
      currentPitch: 0,
    });
  });

  // ---------------------------------------------------------------------------
  // SIMULATION & TRACKING STATE
  // ---------------------------------------------------------------------------
  let paceT = 0.05;
  let speedMps = 56;
  let smoothCurv = 0;
  let smoothPitch = 0;
  let smoothRoll = 0;
  let wheelSpin = 0;
  let currentBrakingFactor = 0;
  let playerHandbrake = false;
  let latestSurface = 'tarmac';
  const latestWheelSlips: [number, number, number, number] = [0, 0, 0, 0];

  let skidCursor = 0;
  let skidHasPrev = false;
  let skidDistAccum = 0;
  const _prevRearL = new THREE.Vector3();
  const _prevRearR = new THREE.Vector3();
  const _prevRight = new THREE.Vector3();
  const _prevUp = new THREE.Vector3();
  const _prevIntensity = { value: 0 };
  const _currRearL = new THREE.Vector3();
  const _currRearR = new THREE.Vector3();

  const writeSkidQuad = (
    p0: THREE.Vector3,
    r0: THREE.Vector3,
    u0: THREE.Vector3,
    i0: number,
    p1: THREE.Vector3,
    r1: THREE.Vector3,
    u1: THREE.Vector3,
    i1: number,
    birthTime: number,
    vScroll: number,
  ) => {
    const q = skidCursor % MAX_SKID_QUADS;
    skidCursor = (skidCursor + 1) % MAX_SKID_QUADS;
    const vBase = q * 4;
    const halfW = 0.21;
    const lift = 0.036;

    const p0x = p0.x + u0.x * lift;
    const p0y = p0.y + u0.y * lift;
    const p0z = p0.z + u0.z * lift;
    const p1x = p1.x + u1.x * lift;
    const p1y = p1.y + u1.y * lift;
    const p1z = p1.z + u1.z * lift;

    skidPositions[vBase * 3] = p0x - r0.x * halfW;
    skidPositions[vBase * 3 + 1] = p0y - r0.y * halfW;
    skidPositions[vBase * 3 + 2] = p0z - r0.z * halfW;

    skidPositions[(vBase + 1) * 3] = p0x + r0.x * halfW;
    skidPositions[(vBase + 1) * 3 + 1] = p0y + r0.y * halfW;
    skidPositions[(vBase + 1) * 3 + 2] = p0z + r0.z * halfW;

    skidPositions[(vBase + 2) * 3] = p1x - r1.x * halfW;
    skidPositions[(vBase + 2) * 3 + 1] = p1y - r1.y * halfW;
    skidPositions[(vBase + 2) * 3 + 2] = p1z - r1.z * halfW;

    skidPositions[(vBase + 3) * 3] = p1x + r1.x * halfW;
    skidPositions[(vBase + 3) * 3 + 1] = p1y + r1.y * halfW;
    skidPositions[(vBase + 3) * 3 + 2] = p1z + r1.z * halfW;

    skidUvs[vBase * 2] = 0.0;
    skidUvs[vBase * 2 + 1] = vScroll;
    skidUvs[(vBase + 1) * 2] = 1.0;
    skidUvs[(vBase + 1) * 2 + 1] = vScroll;
    skidUvs[(vBase + 2) * 2] = 0.0;
    skidUvs[(vBase + 2) * 2 + 1] = vScroll + 1.0;
    skidUvs[(vBase + 3) * 2] = 1.0;
    skidUvs[(vBase + 3) * 2 + 1] = vScroll + 1.0;

    skidMeta[vBase * 2] = birthTime;
    skidMeta[vBase * 2 + 1] = i0;
    skidMeta[(vBase + 1) * 2] = birthTime;
    skidMeta[(vBase + 1) * 2 + 1] = i0;
    skidMeta[(vBase + 2) * 2] = birthTime;
    skidMeta[(vBase + 2) * 2 + 1] = i1;
    skidMeta[(vBase + 3) * 2] = birthTime;
    skidMeta[(vBase + 3) * 2 + 1] = i1;
  };

  const applyWheelVisuals = (
    spinRad: number,
    steerRad: number,
    wheelSpins?: [number, number, number, number],
    wheelSuspOffsets?: [number, number, number, number],
    steerFL?: number,
    steerFR?: number,
  ) => {
    if (!attachedCar) return;
    const pivots = attachedCar.wheelSpinPivots;
    for (let i = 0; i < pivots.length; i++) {
      pivots[i].rotation.x = wheelSpins ? wheelSpins[i] : spinRad;
      pivots[i].position.y = wheelSuspOffsets ? wheelSuspOffsets[i] : 0;
    }
    const steers = attachedCar.frontWheelSteerPivots;
    if (steers.length >= 2) {
      steers[0].rotation.y = steerFL ?? steerRad;
      steers[1].rotation.y = steerFR ?? steerRad;
    } else {
      for (const st of steers) {
        st.rotation.y = steerRad;
      }
    }
  };

  const updateSpectatorPacePose = (deltaSec: number) => {
    const wrappedT = ((paceT % 1) + 1) % 1;
    const fIdx = wrappedT * N;
    const idxA = Math.floor(fIdx) % N;
    const idxB = (idxA + 1) % N;
    const alpha = fIdx - Math.floor(fIdx);

    const sA = samples[idxA];
    const sB = samples[idxB];

    _posA.copy(sA.position);
    _posB.copy(sB.position);
    _carWorldPos.lerpVectors(_posA, _posB, alpha);

    _tanA.copy(sA.tangent);
    _tanB.copy(sB.tangent);
    _tanA.lerp(_tanB, alpha).normalize();

    _rightA.copy(sA.right);
    _rightB.copy(sB.right);
    _rightA.lerp(_rightB, alpha).normalize();

    _upA.copy(sA.up);
    _upB.copy(sB.up);
    _upA.lerp(_upB, alpha).normalize();

    const curv = lerp(sA.curvature, sB.curvature, alpha);
    smoothCurv = lerp(smoothCurv, curv, 1 - Math.exp(-5.0 * deltaSec));

    const absCurv = Math.abs(smoothCurv);
    const targetSpeed = clamp(76 - absCurv * 3100, 26, 78);
    const accelRate = targetSpeed < speedMps ? 4.6 : 1.75;
    const prevSpeed = speedMps;
    speedMps = lerp(speedMps, targetSpeed, 1 - Math.exp(-accelRate * deltaSec));

    const brakingFactor = clamp((prevSpeed - speedMps) / Math.max(deltaSec, 0.001) / 22, 0, 1);
    currentBrakingFactor = brakingFactor > 0.14 ? brakingFactor : 0;

    const racingLat = clamp(-smoothCurv * 145, -2.6, 2.6);
    const crownLift = lerp(0.06, 0.03, Math.abs(racingLat) / Math.max(4, circuit.roadHalfWidth));
    _carWorldPos.addScaledVector(_rightA, racingLat).addScaledVector(_upA, crownLift);

    _negRight.copy(_rightA).negate();
    _basisMat.makeBasis(_negRight, _upA, _tanA);
    _carBaseQuat.setFromRotationMatrix(_basisMat);

    carHost.position.copy(_carWorldPos);
    carHost.quaternion.copy(_carBaseQuat);

    const targetPitch = currentBrakingFactor * 0.028 - (targetSpeed > prevSpeed ? 0.014 : 0);
    const targetRoll = clamp(smoothCurv * speedMps * 0.045, -0.048, 0.048);
    smoothPitch = lerp(smoothPitch, targetPitch, 1 - Math.exp(-8.0 * deltaSec));
    smoothRoll = lerp(smoothRoll, targetRoll, 1 - Math.exp(-8.0 * deltaSec));
    _eulerOff.set(smoothPitch, 0, smoothRoll);
    _quatOff.setFromEuler(_eulerOff);

    const ds = speedMps * deltaSec;
    paceT = (paceT + ds / circuit.totalLength) % 1;
    const wRad = attachedCar?.wheelRadius ?? 0.345;
    wheelSpin += ds / wRad;

    if (attachedCar) {
      const steerRad = clamp(-smoothCurv * 16, -0.35, 0.35);
      attachedCar.bodySpringGroup.quaternion.copy(_quatOff);
      attachedCar.setLights(headlightsOn, currentBrakingFactor, nightLevel);
      attachedCar.setInteriorMode(false);
      attachedCar.setDirtAndWeather(0, weatherUniforms?.uWetness.value ?? 0);
      attachedCar.setSteeringWheelAngle(steerRad);
      applyWheelVisuals(wheelSpin, steerRad);
    }

    _carFocusPos.copy(_carWorldPos).addScaledVector(_upA, 0.65);
  };

  const updateSkidMarks = (deltaSec: number, elapsedSec: number) => {
    skidMat.uniforms.uTime.value = elapsedSec;
    const wet = weatherUniforms?.uWetness.value ?? 0;
    skidMat.uniforms.uFadeDuration.value = lerp(18.0, 10.5, wet);

    // Emit tire trails STRICTLY when car is visible AND actively braking
    if (!carVisible || currentBrakingFactor <= 0.04 || speedMps < 2.4) {
      skidHasPrev = false;
      return;
    }

    const skidIntensity = clamp(currentBrakingFactor, 0.22, 1.0);

    _currRearL.copy(_carWorldPos).addScaledVector(_rightA, 0.86).addScaledVector(_tanA, -1.42);
    _currRearR.copy(_carWorldPos).addScaledVector(_rightA, -0.86).addScaledVector(_tanA, -1.42);

    if (!skidHasPrev) {
      _prevRearL.copy(_currRearL);
      _prevRearR.copy(_currRearR);
      _prevRight.copy(_rightA);
      _prevUp.copy(_upA);
      _prevIntensity.value = skidIntensity;
      skidHasPrev = true;
      skidDistAccum = 0;
      return;
    }

    const stepDist = _currRearL.distanceTo(_prevRearL);
    if (stepDist < 0.62) {
      return;
    }
    if (stepDist > 12.0) {
      _prevRearL.copy(_currRearL);
      _prevRearR.copy(_currRearR);
      _prevRight.copy(_rightA);
      _prevUp.copy(_upA);
      _prevIntensity.value = skidIntensity;
      return;
    }

    skidDistAccum += deltaSec * speedMps * 0.15;
    writeSkidQuad(
      _prevRearL,
      _prevRight,
      _prevUp,
      _prevIntensity.value,
      _currRearL,
      _rightA,
      _upA,
      skidIntensity,
      elapsedSec,
      skidDistAccum,
    );
    writeSkidQuad(
      _prevRearR,
      _prevRight,
      _prevUp,
      _prevIntensity.value,
      _currRearR,
      _rightA,
      _upA,
      skidIntensity,
      elapsedSec,
      skidDistAccum,
    );

    _prevRearL.copy(_currRearL);
    _prevRearR.copy(_currRearR);
    _prevRight.copy(_rightA);
    _prevUp.copy(_upA);
    _prevIntensity.value = skidIntensity;

    skidPosAttr.needsUpdate = true;
    skidUvAttr.needsUpdate = true;
    skidMetaAttr.needsUpdate = true;
  };

  const updateCctvTurrets = (deltaSec: number, elapsedSec: number, instant = false) => {
    const trackAlpha = instant ? 1.0 : 1 - Math.exp(-7.5 * deltaSec);
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      st.panGroup.getWorldPosition(_towerWorldPos);
      _toCar.copy(_carFocusPos).sub(_towerWorldPos);
      const horizDist = Math.hypot(_toCar.x, _toCar.z) || 0.001;

      const targetYaw = Math.atan2(_toCar.x, _toCar.z);
      const targetPitch = -Math.atan2(_toCar.y, horizDist);

      const dYaw = wrapAngle(targetYaw - st.currentYaw);
      st.currentYaw = wrapAngle(st.currentYaw + dYaw * trackAlpha);
      st.currentPitch = lerp(st.currentPitch, clamp(targetPitch, -0.75, 0.45), trackAlpha);

      st.panGroup.rotation.y = st.currentYaw;
      st.tiltGroup.rotation.x = st.currentPitch;

      st.tallyMat.emissiveIntensity = 0.8 + 0.85 * Math.max(0, Math.sin(elapsedSec * 3.6 + i * 0.9));
    }
  };

  const _wheelEmitPos = new THREE.Vector3();
  const _wakeQueryScratch = createCircuitQueryScratch();

  const computeWheelContactWorldPos = (wheelIdx: number) => {
    if (attachedCar && attachedCar.wheelSpinPivots[wheelIdx]) {
      attachedCar.wheelSpinPivots[wheelIdx].getWorldPosition(_wheelEmitPos);
      _wheelEmitPos.addScaledVector(_upA, -attachedCar.wheelRadius * 0.68);
      return;
    }
    const isLeft = wheelIdx === 0 || wheelIdx === 2;
    const isFront = wheelIdx < 2;
    const lat = isLeft ? 0.86 : -0.86;
    const lon = isFront ? 1.32 : -1.36;
    _wheelEmitPos
      .copy(_carWorldPos)
      .addScaledVector(_rightA, lat)
      .addScaledVector(_tanA, lon)
      .addScaledVector(_upA, 0.12);
  };

  const updateWakeAndBrakeSmoke = (deltaSec: number) => {
    const dt = clamp(deltaSec, 0.001, 0.05);
    const wet = weatherUniforms?.uWetness.value ?? 0;
    const windSpeed = weatherUniforms?.uWindSpeed.value ?? 0;
    const windDir = weatherUniforms?.uWindDir.value;
    const windX = windDir ? windDir.x * windSpeed * 0.55 : 0;
    const windZ = windDir ? windDir.y * windSpeed * 0.55 : 0;
    const isFrostpeak = circuit.mapId === 'frostpeak_pass';
    const speedRatio = clamp(speedMps / 72, 0.0, 1.0);
    const nightDim = lerp(1.0, 0.36, nightLevel);

    smokePool.mat.uniforms.uNightDim.value = nightDim;
    sprayPool.mat.uniforms.uNightDim.value = nightDim;
    dirtPool.mat.uniforms.uNightDim.value = nightDim;

    let snowWakeStrength = 0;
    if (isFrostpeak && carVisible && speedMps > 4.5) {
      const q = circuit.queryNearestInto(_carWorldPos.x, _carWorldPos.z, _wakeQueryScratch);
      const isOffSaltedLine = q.absDistance > circuit.roadHalfWidth - 0.35;
      const snowing = windSpeed > 1.25 && !q.isBridge;
      if (isOffSaltedLine) {
        snowWakeStrength = 0.65;
      } else if (snowing || currentBrakingFactor > 0.25) {
        snowWakeStrength = 0.36;
      }
    }

    const isOffroad =
      latestSurface === 'dirt' ||
      latestSurface === 'gravel' ||
      latestSurface === 'sand' ||
      latestSurface === 'grass' ||
      latestSurface === 'snow';

    if (carVisible) {
      // 1. Volumetric Tire Smoke per wheel (burnouts, drifts, handbrake slides, hard lockups)
      const globalBrakeSmoke =
        currentBrakingFactor > 0.30 && speedMps > 4.5 ? (currentBrakingFactor - 0.28) * 1.15 : 0;
      const rearHandbrakeSmoke = playerHandbrake && speedMps > 3.2 ? 0.85 : 0;
      const drySmokeAtten = !isOffroad && wet < 0.72 ? lerp(1.0, 0.24, wet) : 0;

      if (drySmokeAtten > 0.02) {
        for (let w = 0; w < 4; w++) {
          const slip = latestWheelSlips[w] ?? 0;
          const isRear = w >= 2;
          const wheelSmoke = clamp(
            Math.max(
              slip > 0.14 ? (slip - 0.12) * 1.35 : 0,
              isRear ? rearHandbrakeSmoke : 0,
              globalBrakeSmoke * (isRear ? 0.95 : 0.72),
            ),
            0,
            1.0,
          );
          if (wheelSmoke <= 0.06) {
            smokeEmitAccum[w] = 0;
            continue;
          }
          smokeEmitAccum[w] += dt * (18 + wheelSmoke * 42);
          const emitCount = Math.min(4, Math.floor(smokeEmitAccum[w]));
          if (emitCount > 0) {
            smokeEmitAccum[w] -= emitCount;
            computeWheelContactWorldPos(w);
            const sideSign = w % 2 === 0 ? 1 : -1;
            for (let k = 0; k < emitCount; k++) {
              const r1 = nextNoise() - 0.5;
              const r2 = nextNoise() - 0.5;
              const r3 = nextNoise();
              const ejectSpeed = clamp(speedMps * 0.12, 0.8, 5.8);
              const vx =
                -_tanA.x * ejectSpeed +
                _rightA.x * (sideSign * (0.45 + r3 * 0.9) + r1 * 1.6) +
                r2 * 0.8;
              const vy = 0.75 + wheelSmoke * 1.45 + r3 * 1.1;
              const vz =
                -_tanA.z * ejectSpeed +
                _rightA.z * (sideSign * (0.45 + r3 * 0.9) + r1 * 1.6) +
                r2 * 0.8;
              spawnPooledParticle(
                smokePool,
                _wheelEmitPos.x + r1 * 0.16,
                _wheelEmitPos.y + r3 * 0.12,
                _wheelEmitPos.z + r2 * 0.16,
                vx,
                vy,
                vz,
                0.75 + wheelSmoke * 0.85 + r3 * 0.35,
                0.52 + wheelSmoke * 0.32,
                2.55 + wheelSmoke * 1.85,
                clamp((0.24 + wheelSmoke * 0.30) * drySmokeAtten, 0.05, 0.48),
                r3 * 0.65,
              );
            }
          }
        }
      }

      // 2. Wet Rain Water Spray & Ballistic Rooster-Tails (or Frostpeak snow wake)
      const sprayStrength =
        snowWakeStrength > 0
          ? snowWakeStrength * clamp(speedRatio * 1.15, 0.2, 1.0)
          : wet > 0.04 && speedMps > 3.5
          ? wet * clamp(speedRatio * 1.25, 0.18, 1.0)
          : 0;
      if (sprayStrength > 0.04) {
        if (snowWakeStrength > 0) {
          sprayPool.mat.uniforms.uColorA.value.setHex(0xf4f8fc);
          sprayPool.mat.uniforms.uColorB.value.setHex(0xd6e5f2);
        } else {
          sprayPool.mat.uniforms.uColorA.value.setHex(0xeaf5fd);
          sprayPool.mat.uniforms.uColorB.value.setHex(0xb4d5ea);
        }
        sprayEmitAccum += dt * (28 + sprayStrength * 88);
        const emitCount = Math.min(7, Math.floor(sprayEmitAccum));
        if (emitCount > 0) {
          sprayEmitAccum -= emitCount;
          for (let k = 0; k < emitCount; k++) {
            // Favor rear wheels slightly more for dramatic rooster-tails, while front tires cast wheel-arch mist
            const wheelIdx = (k + Math.floor(nextNoise() * 6)) % 4;
            computeWheelContactWorldPos(wheelIdx);
            const r1 = nextNoise() - 0.5;
            const r2 = nextNoise() - 0.5;
            const r3 = nextNoise();
            const isMistPlume = k % 2 === 0;
            const sideSign = wheelIdx % 2 === 0 ? 1 : -1;
            const backPull = clamp(speedMps * (isMistPlume ? 0.16 : 0.28), 1.2, 14.5);
            const vx =
              -_tanA.x * backPull +
              _rightA.x * (sideSign * (0.65 + r3 * 1.45) + r1 * 1.8);
            const vy = isMistPlume
              ? 1.15 + sprayStrength * 2.4 + r3 * 1.2
              : 2.35 + sprayStrength * 4.4 + r3 * 1.9;
            const vz =
              -_tanA.z * backPull +
              _rightA.z * (sideSign * (0.65 + r3 * 1.45) + r1 * 1.8);
            spawnPooledParticle(
              sprayPool,
              _wheelEmitPos.x + r1 * 0.18,
              _wheelEmitPos.y + 0.08 + r3 * 0.14,
              _wheelEmitPos.z + r2 * 0.18,
              vx,
              vy,
              vz,
              isMistPlume ? 0.48 + r3 * 0.36 : 0.34 + r3 * 0.24,
              isMistPlume ? 0.52 + sprayStrength * 0.35 : 0.24 + sprayStrength * 0.16,
              isMistPlume ? 2.2 + sprayStrength * 1.65 : 0.55 + sprayStrength * 0.42,
              clamp((isMistPlume ? 0.22 : 0.32) * (0.4 + sprayStrength * 0.75), 0.08, 0.44),
              isMistPlume ? 0.15 : 0.85,
            );
          }
        }
      }

      // 3. Surface-aware Offroad Dirt / Gravel / Sand / Grass / Snow Rooster-Tail
      const allSlip = Math.max(
        latestWheelSlips[0] ?? 0,
        latestWheelSlips[1] ?? 0,
        latestWheelSlips[2] ?? 0,
        latestWheelSlips[3] ?? 0,
      );
      const dirtStrength =
        isOffroad && (speedMps > 2.2 || allSlip > 0.15)
          ? clamp(speedMps / 30 + allSlip * 0.65, 0.14, 1.0)
          : 0;
      if (dirtStrength > 0.04) {
        if (latestSurface === 'sand') {
          dirtPool.mat.uniforms.uColorA.value.setHex(0xe0ca96);
          dirtPool.mat.uniforms.uColorB.value.setHex(0xb89c66);
        } else if (latestSurface === 'snow') {
          dirtPool.mat.uniforms.uColorA.value.setHex(0xf4f8fc);
          dirtPool.mat.uniforms.uColorB.value.setHex(0xd4e4f2);
        } else if (latestSurface === 'grass') {
          dirtPool.mat.uniforms.uColorA.value.setHex(0x6d7d4d);
          dirtPool.mat.uniforms.uColorB.value.setHex(0x4a5534);
        } else {
          dirtPool.mat.uniforms.uColorA.value.setHex(0x8e6c4b);
          dirtPool.mat.uniforms.uColorB.value.setHex(0x5d452e);
        }
        dirtEmitAccum += dt * (24 + dirtStrength * 52);
        const emitCount = Math.min(5, Math.floor(dirtEmitAccum));
        if (emitCount > 0) {
          dirtEmitAccum -= emitCount;
          for (let k = 0; k < emitCount; k++) {
            const wheelIdx = 2 + (k % 2);
            computeWheelContactWorldPos(wheelIdx);
            const r1 = nextNoise() - 0.5;
            const r2 = nextNoise() - 0.5;
            const r3 = nextNoise();
            const sideSign = wheelIdx % 2 === 0 ? 1 : -1;
            const backPull = clamp(speedMps * 0.22, 1.4, 11.5);
            spawnPooledParticle(
              dirtPool,
              _wheelEmitPos.x + r1 * 0.2,
              _wheelEmitPos.y + 0.06,
              _wheelEmitPos.z + r2 * 0.2,
              -_tanA.x * backPull + _rightA.x * (sideSign * (0.5 + r3 * 1.3) + r1 * 1.8),
              2.2 + dirtStrength * 3.8 + r3 * 1.6,
              -_tanA.z * backPull + _rightA.z * (sideSign * (0.5 + r3 * 1.3) + r1 * 1.8),
              0.42 + r3 * 0.34,
              0.38 + dirtStrength * 0.25,
              1.65 + dirtStrength * 1.15,
              clamp(0.28 + dirtStrength * 0.28, 0.14, 0.52),
              r3,
            );
          }
        }
      }
    }

    stepPooledEmitter(smokePool, dt, windX, windZ);
    stepPooledEmitter(sprayPool, dt, windX * 0.5, windZ * 0.5);
    stepPooledEmitter(dirtPool, dt, windX * 0.3, windZ * 0.3);
  };

  const updateSparks = (deltaSec: number) => {
    let anyAlive = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (sparkLife[i] <= 0) {
        const b = i * 6;
        sparkLinePos[b] = 0;
        sparkLinePos[b + 1] = -9999;
        sparkLinePos[b + 2] = 0;
        sparkLinePos[b + 3] = 0;
        sparkLinePos[b + 4] = -9999;
        sparkLinePos[b + 5] = 0;
        continue;
      }
      anyAlive = true;
      sparkLife[i] -= deltaSec;
      const lifeRatio = clamp(sparkLife[i] / Math.max(sparkMaxLife[i], 0.01), 0, 1);

      sparkVel[i * 3 + 1] -= 16.5 * deltaSec;
      sparkVel[i * 3] *= 1 - 1.4 * deltaSec;
      sparkVel[i * 3 + 2] *= 1 - 1.4 * deltaSec;

      const x = sparkHead[i * 3] + sparkVel[i * 3] * deltaSec;
      const y = sparkHead[i * 3 + 1] + sparkVel[i * 3 + 1] * deltaSec;
      const z = sparkHead[i * 3 + 2] + sparkVel[i * 3 + 2] * deltaSec;
      sparkHead[i * 3] = x;
      sparkHead[i * 3 + 1] = y;
      sparkHead[i * 3 + 2] = z;

      const b = i * 6;
      const streakDt = 0.026;
      sparkLinePos[b] = x;
      sparkLinePos[b + 1] = y;
      sparkLinePos[b + 2] = z;
      sparkLinePos[b + 3] = x - sparkVel[i * 3] * streakDt;
      sparkLinePos[b + 4] = y - sparkVel[i * 3 + 1] * streakDt;
      sparkLinePos[b + 5] = z - sparkVel[i * 3 + 2] * streakDt;

      // White-hot core -> bright amber -> deep red ember fade
      const r = lifeRatio;
      const g = lifeRatio * lifeRatio * 0.78;
      const bl = lifeRatio * lifeRatio * lifeRatio * 0.35;
      sparkLineCol[b] = r;
      sparkLineCol[b + 1] = g;
      sparkLineCol[b + 2] = bl;
      sparkLineCol[b + 3] = r * 0.45;
      sparkLineCol[b + 4] = g * 0.25;
      sparkLineCol[b + 5] = 0;
    }

    sparkMesh.visible = anyAlive;
    if (anyAlive) {
      sparkPosAttr.needsUpdate = true;
      sparkColAttr.needsUpdate = true;
    }
  };

  updateSpectatorPacePose(0.016);
  updateCctvTurrets(0.016, 0, true);

  return {
    group,
    attachCar: (car: McLarenCarInstance) => {
      if (attachedCar === car && car.root.parent === carHost) {
        return;
      }
      if (attachedCar && attachedCar.root.parent === carHost) {
        carHost.remove(attachedCar.root);
      }
      attachedCar = car;
      car.root.position.set(0, 0, 0);
      car.root.quaternion.identity();
      if (!car.root.userData.postFxLayerEnabled) {
        car.root.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.layers.enable(CAR_POSTFX_LAYER);
          }
        });
        car.root.userData.postFxLayerEnabled = true;
      }
      carHost.add(car.root);
      car.setLights(headlightsOn, currentBrakingFactor, nightLevel);
    },
    getCarRoot: () => attachedCar?.root ?? null,
    setPlayerControlled: (controlled: boolean) => {
      if (playerControlled !== controlled) {
        skidHasPrev = false;
      }
      playerControlled = controlled;
    },
    refreshCircuit: () => {
      circuit = getCircuitData();
      samples = circuit.samples;
      N = samples.length;
    },
    applyPlayerState: (st: PlayerCarFrameState) => {
      headlightsOn = st.headlightsOn;
      _carWorldPos.copy(st.pos);
      _tanA.copy(st.forward);
      _rightA.copy(st.right);
      _upA.copy(st.up);
      speedMps = st.speedMps;
      playerHandbrake = st.handbrake;
      latestSurface = st.surface ?? 'tarmac';
      if (st.wheelSlips) {
        latestWheelSlips[0] = st.wheelSlips[0];
        latestWheelSlips[1] = st.wheelSlips[1];
        latestWheelSlips[2] = st.wheelSlips[2];
        latestWheelSlips[3] = st.wheelSlips[3];
      } else {
        latestWheelSlips[0] = latestWheelSlips[1] = latestWheelSlips[2] = latestWheelSlips[3] = 0;
      }
      currentBrakingFactor = st.brakeSkidIntensity;

      carHost.position.copy(st.pos);
      carHost.quaternion.copy(st.quat);

      if (attachedCar) {
        _eulerOff.set(st.bodyPitch, 0, st.bodyRoll);
        _quatOff.setFromEuler(_eulerOff);
        attachedCar.bodySpringGroup.position.y = st.bodyHeave ?? 0;
        attachedCar.bodySpringGroup.quaternion.copy(_quatOff);
        const lightBrake = clamp(Math.max(st.brakePedal, st.handbrake ? 1 : 0), 0, 1);
        attachedCar.setLights(st.headlightsOn, lightBrake, nightLevel);
        attachedCar.setInteriorMode(st.isInteriorView);
        attachedCar.setDirtAndWeather(st.dirtLevel, st.wetness);
        attachedCar.setSteeringWheelAngle(st.steerAngle);
        attachedCar.setActiveAeroState(
          st.activeAeroEnabled !== false,
          st.aeroDeployed !== false,
          st.deltaSec ?? 0.016,
        );
        applyWheelVisuals(
          st.wheelSpin,
          st.steerAngle,
          st.wheelSpins,
          st.wheelSuspOffsets,
          st.steerAngleFL,
          st.steerAngleFR,
        );
      }

      _carFocusPos.copy(_carWorldPos).addScaledVector(_upA, 0.65);
    },
    update: (deltaSec: number, elapsedSec: number) => {
      if (!playerControlled) {
        updateSpectatorPacePose(deltaSec);
      }
      updateSkidMarks(deltaSec, elapsedSec);
      updateCctvTurrets(deltaSec, elapsedSec, false);
      updateWakeAndBrakeSmoke(deltaSec);
      updateSparks(deltaSec);
    },
    setCarVisible: (visible: boolean) => {
      if (carVisible !== visible) {
        skidHasPrev = false;
      }
      carVisible = visible;
      carHost.visible = visible;
      if (!visible) {
        smokePool.points.visible = false;
        sprayPool.points.visible = false;
        dirtPool.points.visible = false;
      }
    },
    getChaseViewPose: (
      outCarPos: THREE.Vector3,
      outTangent: THREE.Vector3,
      outRight: THREE.Vector3,
      outUp: THREE.Vector3,
    ) => {
      outCarPos.copy(_carWorldPos);
      outTangent.copy(_tanA);
      outRight.copy(_rightA);
      outUp.copy(_upA);
    },
    getStationCount: () => stations.length,
    getStations: () => stations.map((s) => s.info),
    getNearestStationIndex: () => {
      let bestIdx = 0;
      let bestDistSq = Infinity;
      for (let i = 0; i < stations.length; i++) {
        stations[i].panGroup.getWorldPosition(_towerWorldPos);
        const dSq = _towerWorldPos.distanceToSquared(_carFocusPos);
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
      return bestIdx;
    },
    getActiveViewPose: (
      stationIndex: number,
      outPos: THREE.Vector3,
      outTarget: THREE.Vector3,
    ) => {
      const safeIdx = ((stationIndex % stations.length) + stations.length) % stations.length;
      const st = stations[safeIdx];
      st.lensAnchor.getWorldPosition(outPos);
      outTarget.copy(_carFocusPos);
    },
    emitCollisionSparks: (
      x: number,
      y: number,
      z: number,
      nx: number,
      nz: number,
      vx: number,
      vz: number,
      intensity: number,
    ) => {
      const count = Math.min(28, Math.max(2, Math.round(intensity * 24)));
      const speed = Math.hypot(vx, vz);
      for (let k = 0; k < count; k++) {
        const slot = sparkCursor % MAX_SPARKS;
        sparkCursor = (sparkCursor + 1) % MAX_SPARKS;
        const j1 = Math.sin(slot * 12.9898 + k * 78.233) * 0.5;
        const j2 = Math.cos(slot * 4.1414 + k * 23.11) * 0.5;
        const j3 = Math.sin(slot * 9.71 + k * 5.3) * 0.5 + 0.5;
        sparkHead[slot * 3] = x + j1 * 0.25;
        sparkHead[slot * 3 + 1] = y + 0.08 + j3 * 0.35;
        sparkHead[slot * 3 + 2] = z + j2 * 0.25;

        const sprayBoost = 3.5 + intensity * 11.0;
        sparkVel[slot * 3] = vx * 0.65 + nx * (1.8 + j3 * sprayBoost) + j1 * 6.5;
        sparkVel[slot * 3 + 1] = 2.0 + j3 * (4.5 + intensity * 6.0) + speed * 0.08;
        sparkVel[slot * 3 + 2] = vz * 0.65 + nz * (1.8 + j3 * sprayBoost) + j2 * 6.5;

        const life = 0.22 + j3 * (0.28 + intensity * 0.28);
        sparkMaxLife[slot] = life;
        sparkLife[slot] = life;
      }
      sparkMesh.visible = true;
    },
    setNightFactor: (nightFactor: number) => {
      nightLevel = nightFactor;
      if (attachedCar) {
        attachedCar.setLights(headlightsOn, currentBrakingFactor, nightLevel);
      }
    },
    setWireframe: (wire: boolean) => {
      for (const m of wireframeMats) m.wireframe = wire;
      attachedCar?.setWireframe(wire);
    },
    dispose: () => {
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}
