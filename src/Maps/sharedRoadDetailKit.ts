import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CircuitSample } from './Aurelia Ridge/circuitSpline';
import { isPointInPitBounds, type MapPitBounds } from './mapRegistry';
import type { WeatherUniforms } from './Aurelia Ridge/skyAndLighting';

export type HighwayStripeStyle = 'dashed_yellow' | 'double_yellow' | 'white_dashed' | 'none';

export interface WeatheredAsphaltPatchOptions {
  cacheKey: string;
  sharedWeather: WeatherUniforms;
  uRubberLevel: { value: number };
  uAsphaltWear: { value: number };
  asphaltORM?: THREE.Texture;
  highwayStripeStyle?: HighwayStripeStyle;
  uRoadSnowAccum?: { value: number };
  frostEdgeRime?: number;
  sparkleStrength?: number;
  edgeDustRgb?: [number, number, number];
  /** Slight crown darkening/sheen boost for weathered regional tarmac. */
  camberContrast?: number;
}

/**
 * Returns a compact Uint16Array index buffer when vertexCount fits in 16 bits,
 * halving index memory footprint compared to JS arrays / Uint32Array.
 */
export function compactIndexBuffer(
  indices: number[],
  vertexCount: number,
): Uint16Array | Uint32Array {
  return vertexCount < 65536 ? new Uint16Array(indices) : new Uint32Array(indices);
}

/**
 * Patches any road MeshStandardMaterial whose geometry provides `attribute float aApexBias`
 * with hyper-detailed world-space GT7 / GTA V / GTA VI weathered asphalt:
 * - Packed linear ORM micro-detail (Cavity AO, Micro-Roughness, Quartz aggregate sparkle)
 * - Non-tiling dual-scale aggregate tonal drift & bitumen wear patches
 * - World-space sinuous tar-sealed crack seams & transverse thermal expansion joints
 * - Weathered highway centerline & crisp edge boundary stripes with realistic chipping & tire scuffing
 * - Apex-tracking dark rubbered racing groove, dual straight tire tracks & off-line marbles
 * - Wet-weather rut puddles (mirror-low roughness) + concentric raindrop splash ripples
 * - Optional Frostpeak cold frost edge rime & progressive snowpack drift accumulation
 */
export function patchWeatheredAsphaltMaterial(
  mat: THREE.MeshStandardMaterial,
  opts: WeatheredAsphaltPatchOptions,
): void {
  const [edR, edG, edB] = opts.edgeDustRgb ?? [0.27, 0.26, 0.23];
  const camberContrast = opts.camberContrast ?? 0.08;
  const stripeMode =
    opts.highwayStripeStyle === 'double_yellow'
      ? 2.0
      : opts.highwayStripeStyle === 'dashed_yellow'
      ? 1.0
      : opts.highwayStripeStyle === 'white_dashed'
      ? 3.0
      : 0.0;
  const frostRime = Math.max(0, Math.min(1, opts.frostEdgeRime ?? 0));
  const sparkleAmt = Math.max(0, Math.min(1.5, opts.sparkleStrength ?? 0.65));
  const hasOrm = Boolean(opts.asphaltORM);
  const hasSnow = Boolean(opts.uRoadSnowAccum);

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = opts.sharedWeather.uWetness;
    shader.uniforms.uOvercast = opts.sharedWeather.uOvercast;
    shader.uniforms.uTime = opts.sharedWeather.uTime;
    shader.uniforms.uRubberLevel = opts.uRubberLevel;
    shader.uniforms.uAsphaltWear = opts.uAsphaltWear;
    shader.uniforms.uStripeMode = { value: stripeMode };
    shader.uniforms.uFrostEdgeRime = { value: frostRime };
    shader.uniforms.uSparkleStrength = { value: sparkleAmt };
    if (opts.asphaltORM) {
      shader.uniforms.uAsphaltORM = { value: opts.asphaltORM };
    }
    if (opts.uRoadSnowAccum) {
      shader.uniforms.uRoadSnowAccum = opts.uRoadSnowAccum;
    }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aApexBias;
        varying float vApexBias;
        varying vec2 vRoadUv;
        varying vec3 vRoadWorldPos;
        varying vec3 vRoadViewUp;`,
      )
      .replace(
        '#include <defaultnormal_vertex>',
        `#include <defaultnormal_vertex>
        vRoadViewUp = normalize(transformedNormal);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vApexBias = aApexBias;
        vRoadUv = uv;
        vRoadWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWetness;
        uniform float uOvercast;
        uniform float uTime;
        uniform float uRubberLevel;
        uniform float uAsphaltWear;
        uniform float uStripeMode;
        uniform float uFrostEdgeRime;
        uniform float uSparkleStrength;
        ${hasOrm ? 'uniform sampler2D uAsphaltORM;' : ''}
        ${hasSnow ? 'uniform float uRoadSnowAccum;' : ''}
        varying float vApexBias;
        varying vec2 vRoadUv;
        varying vec3 vRoadWorldPos;
        varying vec3 vRoadViewUp;

        float roadHash21(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 34.5);
          return fract(p.x * p.y);
        }
        float roadNoise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(roadHash21(i), roadHash21(i + vec2(1.0, 0.0)), u.x),
            mix(roadHash21(i + vec2(0.0, 1.0)), roadHash21(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float computeTarCrackMask(vec2 wp, float vRoad) {
          // Soft organic non-periodic asphalt weathering patches (no repeating diagonal or transverse bars)
          vec2 pA = wp * 0.085 + vec2(3.7, -2.9);
          vec2 pB = vec2(wp.x * 0.14 - wp.y * 0.11, wp.x * 0.11 + wp.y * 0.14);
          float n1 = roadNoise2(pA);
          float n2 = roadNoise2(pB + n1 * 2.2);
          float n3 = roadNoise2(wp * 0.42 + vec2(vRoad * 0.05, -vRoad * 0.03));
          float blotch = smoothstep(0.58, 0.86, n1 * 0.55 + n2 * 0.45);
          float fineVein = 1.0 - smoothstep(0.0, 0.09, abs(n2 - 0.52) + abs(n3 - 0.5) * 0.55);
          return clamp(max(blotch * 0.34, fineVein * blotch * 0.48), 0.0, 0.55);
        }
        float computeRubberGrooveMask(vec2 wp, float uTrack, float apexBias) {
          float grooveCenter = 0.50 - apexBias * 0.22;
          float dMain = (uTrack - grooveCenter) / 0.16;
          float mainGroove = exp(-(dMain * dMain));
          float dLeft = (uTrack - (grooveCenter - 0.068)) / 0.055;
          float dRight = (uTrack - (grooveCenter + 0.068)) / 0.055;
          float dualTrack = (exp(-(dLeft * dLeft)) + exp(-(dRight * dRight))) * 0.64;
          float streakNoise = 0.80 + 0.20 * roadNoise2(wp * 0.45);
          return clamp((mainGroove * 0.72 + dualTrack * 0.56) * streakNoise, 0.0, 1.0);
        }
        float computePuddleMask(vec2 wp, float uTrack) {
          float n1 = roadNoise2(wp * 0.11);
          float n2 = roadNoise2(wp * 0.31 + vec2(4.2, -3.1));
          float n = n1 * 0.65 + n2 * 0.35;
          float rL = (uTrack - 0.34) / 0.11;
          float rR = (uTrack - 0.66) / 0.11;
          float rutBias = 0.08 * exp(-(rL * rL)) + 0.08 * exp(-(rR * rR));
          return smoothstep(0.54, 0.71, n + rutBias);
        }
        ${
          hasSnow
            ? `float computeRoadSnowMask(vec2 wp, float uTrack, float apexBias) {
          float grooveCenter = 0.50 - apexBias * 0.22;
          float dApex = abs(uTrack - grooveCenter);
          float clearedGroove = 1.0 - smoothstep(0.09, 0.28, dApex);
          float driftNoise = roadNoise2(wp * 0.18 + vec2(1.7, -3.1)) * 0.65 + roadNoise2(wp * 0.55) * 0.35;
          float edgeFavor = smoothstep(0.14, 0.48, abs(uTrack - 0.5));
          float rawSnow = smoothstep(0.24, 0.76, driftNoise * 0.65 + edgeFavor * 0.62);
          float accum = clamp(uRoadSnowAccum, 0.0, 1.0);
          return clamp(rawSnow * accum * (1.0 - clearedGroove * mix(0.84, 0.96, clamp(uRubberLevel, 0.0, 1.0))), 0.0, 0.92);
        }`
            : ''
        }
        vec2 roadHash22(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.xx + p3.yz) * p3.zy);
        }
        vec2 roadRainSplashLayer(vec2 uv, float t) {
          vec2 cell = floor(uv);
          vec2 f = fract(uv);
          vec2 rnd = roadHash22(cell);
          float age = fract(t * (1.35 + rnd.x * 0.7) + rnd.y);
          vec2 center = 0.25 + 0.5 * rnd;
          vec2 d = f - center;
          float dist = length(d) + 0.0001;
          float rad = age * 0.44;
          float rDiff = (dist - rad) * 22.0;
          float ring = exp(-(rDiff * rDiff)) * (1.0 - age) * sin((dist - rad) * 48.0);
          return (d / dist) * ring;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 aspTex = texture2D(map, vMapUv);
          float uTrack = vRoadUv.x;
          float vTrack = vRoadUv.y;
          float wearAmount = clamp(uAsphaltWear, 0.0, 1.0);
          ${
            hasOrm
              ? 'vec3 ormSample = texture2D(uAsphaltORM, vMapUv).rgb;'
              : 'vec3 ormSample = vec3(0.88, 0.62, 0.5);'
          }

          // Multi-scale world-space aggregate weathering & sun-bleached stone patches
          float macroWear = 0.5 + 0.5 * sin(vRoadWorldPos.x * 0.052 + cos(vRoadWorldPos.z * 0.046) * 2.1);
          float fineWear = roadNoise2(vRoadWorldPos.xz * 0.42);
          float microGrit = roadNoise2(vRoadWorldPos.xz * 2.8);
          float wearContrast = mix(0.05, 0.16, wearAmount);
          aspTex.rgb *= mix(1.0 - wearContrast, 1.0 + wearContrast * 0.65, macroWear * 0.6 + fineWear * 0.4);
          aspTex.rgb = mix(aspTex.rgb, aspTex.rgb * 1.08 + vec3(0.018), wearAmount * 0.28 * (1.0 - macroWear));
          aspTex.rgb *= (0.95 + microGrit * 0.10) * mix(0.90, 1.04, ormSample.r);

          // Subtle road-crown camber highlight at center & gutter shading toward outer shoulders
          float centerCrown = 1.0 - pow(abs(uTrack - 0.5) * 2.0, 1.6);
          aspTex.rgb *= 1.0 + (centerCrown - 0.45) * ${camberContrast.toFixed(3)};

          // Subtle centerline oil/exhaust darkened lane strip (GTA V highway realism)
          float laneCenterOil = exp(-pow((uTrack - 0.5) / 0.11, 2.0)) * 0.08 * (0.65 + 0.35 * fineWear);
          aspTex.rgb *= (1.0 - laneCenterOil);

          // Subtle organic aggregate wear patches across older tarmac zones
          float tarCrack = computeTarCrackMask(vRoadWorldPos.xz, vTrack) * (0.20 + 0.40 * wearAmount);
          aspTex.rgb = mix(aspTex.rgb, aspTex.rgb * 0.87, tarCrack);

          // Weathered highway lane markings (edge fog lines + centerline dashes / double yellow)
          if (uStripeMode > 0.5) {
            float chipNoise = roadNoise2(vRoadWorldPos.xz * 3.1);
            float chipMask = smoothstep(0.18 + wearAmount * 0.24, 0.52 + wearAmount * 0.18, chipNoise);
            float edgeLineL = smoothstep(0.046, 0.041, abs(uTrack - 0.046));
            float edgeLineR = smoothstep(0.046, 0.041, abs(uTrack - 0.954));
            float edgePaint = clamp(max(edgeLineL, edgeLineR), 0.0, 1.0) * chipMask * 0.82;
            aspTex.rgb = mix(aspTex.rgb, vec3(0.84, 0.86, 0.88), edgePaint);

            float dashCycle = step(0.46, fract(vTrack * 1.15));
            float centerPaint = 0.0;
            vec3 centerPaintCol = vec3(0.92, 0.68, 0.16);
            if (uStripeMode > 1.5 && uStripeMode < 2.5) {
              // Double yellow center highway lines
              float dY1 = 1.0 - smoothstep(0.0055, 0.010, abs(uTrack - 0.486));
              float dY2 = 1.0 - smoothstep(0.0055, 0.010, abs(uTrack - 0.514));
              centerPaint = max(dY1, dY2) * chipMask * 0.86;
            } else if (uStripeMode > 2.5) {
              // Crisp FIA / alpine white dashed center stripe
              float dW = 1.0 - smoothstep(0.007, 0.013, abs(uTrack - 0.50));
              centerPaint = dW * dashCycle * chipMask * 0.84;
              centerPaintCol = vec3(0.88, 0.90, 0.93);
            } else {
              // Dashed golden-yellow mountain pass stripe
              float dY = 1.0 - smoothstep(0.007, 0.013, abs(uTrack - 0.50));
              centerPaint = dY * dashCycle * chipMask * 0.86;
            }
            aspTex.rgb = mix(aspTex.rgb, centerPaintCol, centerPaint);
          }

          // Progressive racing-line rubber groove + off-line marble flecks
          float rubberGroove = computeRubberGrooveMask(vRoadWorldPos.xz, uTrack, vApexBias);
          float rubberStrength = clamp(0.18 + uRubberLevel * 0.82, 0.0, 1.0);
          aspTex.rgb = mix(aspTex.rgb, aspTex.rgb * vec3(0.45, 0.46, 0.49), rubberGroove * rubberStrength * 0.80);

          float offLineMask = (1.0 - rubberGroove) * smoothstep(0.06, 0.22, uTrack) * (1.0 - smoothstep(0.78, 0.94, uTrack));
          float marbleFlecks = smoothstep(0.75, 0.92, roadNoise2(vRoadWorldPos.xz * 2.85));
          aspTex.rgb = mix(aspTex.rgb, vec3(0.085, 0.085, 0.095), offLineMask * marbleFlecks * rubberStrength * 0.40);

          // Optional Frostpeak icy shoulder rime + drifting snowpack outside cleared salted racing line
          if (uFrostEdgeRime > 0.01) {
            float frostEdge = smoothstep(0.28, 0.48, abs(uTrack - 0.5)) * uFrostEdgeRime;
            aspTex.rgb = mix(aspTex.rgb * vec3(0.88, 0.92, 0.96), vec3(0.68, 0.76, 0.86), frostEdge * 0.42);
          }

          // Roadside shoulder dust accumulation near outer boundary lines
          float edgeDust = (1.0 - smoothstep(0.0, 0.065, uTrack)) + smoothstep(0.935, 1.0, uTrack);
          aspTex.rgb = mix(aspTex.rgb, vec3(${edR.toFixed(2)}, ${edG.toFixed(2)}, ${edB.toFixed(2)}), clamp(edgeDust, 0.0, 1.0) * 0.28);

          // Wet-weather tarmac darkening & rut puddle contrast (GTA VI glossy puddle look)
          float puddleMaskCol = computePuddleMask(vRoadWorldPos.xz, uTrack);
          float wetDark = mix(1.0, mix(0.50, 0.32, puddleMaskCol), uWetness);
          aspTex.rgb *= wetDark;

          // Smooth anti-aliased quartz aggregate micro-sparkle on sunlit dry/damp stone
          vec3 roadViewDir = normalize(cameraPosition - vRoadWorldPos);
          float grazeAngle = pow(1.0 - clamp(abs(roadViewDir.y), 0.0, 1.0), 1.6);
          float sparkleSample = roadNoise2(vRoadWorldPos.xz * 9.5 + vec2(3.7, -5.1));
          float quartzCell = smoothstep(0.80, 0.96, sparkleSample) * ormSample.b;
          float sparkVis = (1.0 - uOvercast * 0.75) * (1.0 - puddleMaskCol * uWetness) * uSparkleStrength;
          aspTex.rgb += vec3(0.14, 0.13, 0.12) * quartzCell * (0.25 + 0.75 * grazeAngle) * sparkVis;

          ${
            hasSnow
              ? `float snowMaskCol = computeRoadSnowMask(vRoadWorldPos.xz, uTrack, vApexBias);
          vec3 freshSnowCol = mix(vec3(0.84, 0.89, 0.96), vec3(0.95, 0.97, 1.0), roadNoise2(vRoadWorldPos.xz * 0.45));
          aspTex.rgb = mix(aspTex.rgb, freshSnowCol, snowMaskCol);`
              : ''
          }

          diffuseColor *= aspTex;
        #endif`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float uR = vRoadUv.x;
        float vR = vRoadUv.y;
        #ifdef USE_MAP
        float ormRough = ormSample.g;
        float rubberGrooveR = rubberGroove;
        float tarGloss = tarCrack * (0.28 + 0.52 * clamp(uAsphaltWear, 0.0, 1.0));
        float puddleMaskR = puddleMaskCol;
        #else
        ${
          hasOrm
            ? 'float ormRough = texture2D(uAsphaltORM, vRoadUv).g;'
            : 'float ormRough = roughnessFactor;'
        }
        float rubberGrooveR = computeRubberGrooveMask(vRoadWorldPos.xz, uR, vApexBias);
        float tarGloss = computeTarCrackMask(vRoadWorldPos.xz, vR) * (0.28 + 0.52 * clamp(uAsphaltWear, 0.0, 1.0));
        float puddleMaskR = computePuddleMask(vRoadWorldPos.xz, uR);
        #endif
        roughnessFactor = mix(roughnessFactor, ormRough, 0.45);
        roughnessFactor = mix(roughnessFactor, 0.38, rubberGrooveR * clamp(0.18 + uRubberLevel * 0.82, 0.0, 1.0) * 0.68);
        roughnessFactor = mix(roughnessFactor, 0.48, tarGloss * 0.45);
        float wearRoughShift = clamp(uAsphaltWear, 0.0, 1.0) * 0.14;
        roughnessFactor = clamp(roughnessFactor + wearRoughShift - 0.04, 0.16, 0.96);
        if (uFrostEdgeRime > 0.01) {
          float frostEdgeR = smoothstep(0.32, 0.49, abs(uR - 0.5)) * uFrostEdgeRime;
          roughnessFactor = mix(roughnessFactor, mix(0.20, 0.036, puddleMaskR), frostEdgeR * 0.65);
        }
        float wetRoadRough = mix(0.22, 0.024, puddleMaskR);
        roughnessFactor = mix(roughnessFactor, wetRoadRough, uWetness * 0.97);
        ${
          hasSnow
            ? `#ifdef USE_MAP
        float snowR = snowMaskCol;
        #else
        float snowR = computeRoadSnowMask(vRoadWorldPos.xz, uR, vApexBias);
        #endif
        roughnessFactor = mix(roughnessFactor, 0.52, snowR);`
            : ''
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        if (uWetness > 0.01) {
          #ifdef USE_MAP
          float puddleMaskN = puddleMaskCol;
          #else
          float puddleMaskN = computePuddleMask(vRoadWorldPos.xz, vRoadUv.x);
          #endif
          normal = normalize(mix(normal, normalize(vRoadViewUp), puddleMaskN * uWetness * 0.94));
          vec2 splashGrad =
            roadRainSplashLayer(vRoadWorldPos.xz * 1.4, uTime) +
            roadRainSplashLayer(vRoadWorldPos.xz * 2.3 + vec2(5.1, -3.4), uTime * 1.15);
          vec3 viewRipple = (viewMatrix * vec4(splashGrad.x, 0.0, splashGrad.y, 0.0)).xyz;
          normal = normalize(normal + viewRipple * mix(0.035, 0.14, puddleMaskN) * uWetness);
        }`,
      );
  };
  mat.customProgramCacheKey = () =>
    `${opts.cacheKey}-s${stripeMode}-orm${hasOrm ? 1 : 0}-sn${hasSnow ? 1 : 0}`;
}

export interface SegmentedCurbsOptions {
  samples: CircuitSample[];
  closedLoop: boolean;
  halfAsp: number;
  totalLength: number;
  kerbHeightScale: number;
  colorAHex: number;
  colorBHex: number;
  pitLaneBounds?: MapPitBounds;
  curvatureThreshold?: number;
  curbWidth?: number;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  trackMat: <T extends THREE.Material>(m: T) => T;
}

/**
 * Builds true 3D beveled segmented FIA curbs + outer drainage lip along turns and pit transitions.
 * Every curb run is broken into individual ~1.65m chamfered 3D blocks with tapered entry/exit ramps,
 * rumble grooves, tire-scuff shading, and alternating dual-tone vertex colors.
 */
export function buildSegmented3DFiaCurbs(opts: SegmentedCurbsOptions): {
  mesh: THREE.Mesh | null;
  material: THREE.MeshStandardMaterial | null;
} {
  const {
    samples,
    closedLoop,
    halfAsp,
    totalLength,
    kerbHeightScale,
    colorAHex,
    colorBHex,
    pitLaneBounds,
    trackGeo,
    trackMat,
  } = opts;

  const N = samples.length;
  if (N < 6) return { mesh: null, material: null };

  const curvThresh = opts.curvatureThreshold ?? 0.0066;
  const curbWidth = opts.curbWidth ?? 1.48;
  const maxKerbH = 0.115 * Math.max(0.55, Math.min(1.65, kerbHeightScale));
  const stepLenM = totalLength / N;
  const blockTargetM = 1.65;
  const samplesPerBlock = Math.max(1, Math.round(blockTargetM / Math.max(0.5, stepLenM)));

  const colA = new THREE.Color(colorAHex);
  const colB = new THREE.Color(colorBHex);
  const colBacking = new THREE.Color(0x52575e);
  const colScuff = new THREE.Color(0x1f2228);
  const tmpCol = new THREE.Color();

  const geos: THREE.BufferGeometry[] = [];

  const emitSegmentedRun = (startIdx: number, endIdx: number, side: -1 | 1) => {
    const runLen = endIdx - startIdx;
    if (runLen < 3) return;

    const totalBlocks = Math.max(1, Math.floor(runLen / samplesPerBlock));
    for (let b = 0; b < totalBlocks; b++) {
      const bStart = startIdx + b * samplesPerBlock;
      const bEnd = b === totalBlocks - 1 ? endIdx : Math.min(endIdx, bStart + samplesPerBlock);
      const subSteps = Math.max(1, bEnd - bStart);
      const isAlt = b % 2 === 0;
      const blockColor = isAlt ? colA : colB;

      // Taper first and last block height slightly so curb ends bevel smoothly into asphalt
      const startHeightScale = b === 0 ? 0.25 : 1.0;
      const endHeightScale = b === totalBlocks - 1 ? 0.25 : 1.0;

      // Leave a crisp 14% visual joint between blocks at block boundary via clamped t
      const rows = subSteps + 1;
      const cols = 6; // inner edge -> inner ramp top -> inner crown groove -> outer crown -> outer drop -> backing curb edge
      const pos = new Float32Array(rows * cols * 3);
      const col = new Float32Array(rows * cols * 3);
      const uv = new Float32Array(rows * cols * 2);
      const idx: number[] = [];

      for (let r = 0; r < rows; r++) {
        const localT = r / subSteps;
        // Inset 0.04 along block boundaries to carve crisp expansion joint bevels
        const fracIdx = bStart + localT * subSteps;
        const sIdx = closedLoop
          ? Math.round(fracIdx) % N
          : Math.min(N - 1, Math.round(fracIdx));
        const s = samples[sIdx];
        const edgeInsetScale =
          r === 0 || r === rows - 1 ? 0.62 : 1.0;
        const rampEndScale =
          startHeightScale + (endHeightScale - startHeightScale) * localT;
        const h = maxKerbH * edgeInsetScale * rampEndScale;

        // Lateral offsets outward from track edge
        const l0 = side * (halfAsp - 0.14); // flush on tarmac edge
        const l1 = side * (halfAsp + 0.18); // angled FIA inner bevel crest
        const l2 = side * (halfAsp + curbWidth * 0.45); // center flat/grooved crown
        const l3 = side * (halfAsp + curbWidth * 0.84); // outer painted edge
        const l4 = side * (halfAsp + curbWidth * 0.90); // vertical curb drop
        const l5 = side * (halfAsp + curbWidth * 1.18); // concrete drainage backing apron

        const p0 = s.position.clone().addScaledVector(s.right, l0).addScaledVector(s.up, 0.015);
        const p1 = s.position.clone().addScaledVector(s.right, l1).addScaledVector(s.up, h);
        const p2 = s.position.clone().addScaledVector(s.right, l2).addScaledVector(s.up, h * 0.92);
        const p3 = s.position.clone().addScaledVector(s.right, l3).addScaledVector(s.up, h * 1.04);
        const p4 = s.position.clone().addScaledVector(s.right, l4).addScaledVector(s.up, 0.01);
        const p5 = s.position.clone().addScaledVector(s.right, l5).addScaledVector(s.up, -0.045);

        const rawPts = side > 0 ? [p0, p1, p2, p3, p4, p5] : [p5, p4, p3, p2, p1, p0];
        const uCoords = side > 0 ? [0, 0.22, 0.5, 0.82, 0.9, 1.0] : [1.0, 0.9, 0.82, 0.5, 0.22, 0];

        for (let c = 0; c < cols; c++) {
          const vi = r * cols + c;
          pos[vi * 3] = rawPts[c].x;
          pos[vi * 3 + 1] = rawPts[c].y;
          pos[vi * 3 + 2] = rawPts[c].z;
          uv[vi * 2] = uCoords[c];
          uv[vi * 2 + 1] = localT;

          const isBacking = (side > 0 && c >= 4) || (side < 0 && c <= 1);
          const isInnerRamp = (side > 0 && c <= 1) || (side < 0 && c >= 4);
          if (isBacking) {
            tmpCol.copy(colBacking);
          } else {
            tmpCol.copy(blockColor);
            if (isInnerRamp) {
              tmpCol.lerp(colScuff, 0.22);
            }
            if (r === 0 || r === rows - 1) {
              tmpCol.multiplyScalar(0.84);
            }
          }
          col[vi * 3] = tmpCol.r;
          col[vi * 3 + 1] = tmpCol.g;
          col[vi * 3 + 2] = tmpCol.b;
        }

        if (r < rows - 1) {
          for (let c = 0; c < cols - 1; c++) {
            const a = r * cols + c;
            const bPt = a + 1;
            const d = (r + 1) * cols + c;
            const e = d + 1;
            idx.push(a, bPt, d, bPt, e, d);
          }
        }
      }

      const bGeo = new THREE.BufferGeometry();
      bGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      bGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      bGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      bGeo.setIndex(new THREE.BufferAttribute(compactIndexBuffer(idx, rows * cols), 1));
      bGeo.computeVertexNormals();
      geos.push(bGeo);
    }
  };

  for (const side of [-1, 1] as const) {
    let activeStart = -1;
    for (let i = 0; i < N; i++) {
      const s = samples[i];
      const inPitEntry =
        side === -1 &&
        pitLaneBounds &&
        s.isStraight &&
        isPointInPitBounds(pitLaneBounds, s.position.x, s.position.y, s.position.z, 18, 28);
      const wantCurb = !s.isBridge && !inPitEntry && Math.abs(s.curvature) >= curvThresh;
      if (wantCurb && activeStart < 0) {
        activeStart = i;
      } else if (!wantCurb && activeStart >= 0) {
        emitSegmentedRun(activeStart, i - 1, side);
        activeStart = -1;
      }
    }
    if (activeStart >= 0) {
      emitSegmentedRun(activeStart, N - 1, side);
    }
  }

  if (geos.length === 0) return { mesh: null, material: null };

  const merged = trackGeo(BufferGeometryUtils.mergeGeometries(geos, false));
  for (const g of geos) g.dispose();
  merged.computeBoundingSphere();

  const material = trackMat(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      normalMap: opts.normalMap ?? null,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: opts.roughnessMap ?? null,
      roughness: 0.62,
      metalness: 0.05,
    }),
  );

  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, material };
}

export interface DrainGratesOptions {
  samples: CircuitSample[];
  halfAsp: number;
  pitLaneBounds?: MapPitBounds;
  spacingSamples?: number;
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  trackMat: <T extends THREE.Material>(m: T) => T;
}

/**
 * Builds recessed cast-iron storm-drain grates along road edges, bridge margins, and pit apron gutter.
 * Uses InstancedMesh with concrete surround collar, dark sunken sump pocket, and slotted cast-iron bars.
 */
export function buildRecessedDrainGrates(opts: DrainGratesOptions): THREE.Group {
  const { samples, halfAsp, pitLaneBounds, trackGeo, trackMat } = opts;
  const N = samples.length;
  const grateGroup = new THREE.Group();
  grateGroup.name = 'RecessedDrainGrates';

  const spacing = opts.spacingSamples ?? 18;
  const matrices: THREE.Matrix4[] = [];
  const upVec = new THREE.Vector3(0, 1, 0);

  for (let i = 4; i < N - 4; i += spacing) {
    const s = samples[i];
    if (s.isTunnel) continue;
    // Place on both sides along straights & bridges, or inside low side on banked curves
    const sides: Array<-1 | 1> =
      Math.abs(s.curvature) < 0.006 ? [-1, 1] : [s.curvature > 0 ? 1 : -1];

    for (const side of sides) {
      if (
        side === -1 &&
        pitLaneBounds &&
        s.isStraight &&
        isPointInPitBounds(pitLaneBounds, s.position.x, s.position.y, s.position.z, 12, 24)
      ) {
        continue;
      }
      const lat = side * (halfAsp - 0.36);
      const pos = s.position
        .clone()
        .addScaledVector(s.right, lat)
        .addScaledVector(s.up, 0.022);
      const basis = new THREE.Matrix4().makeBasis(
        s.right,
        s.up.lengthSq() > 0.1 ? s.up : upVec,
        s.tangent.clone().negate(),
      );
      const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
      matrices.push(new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1)));
    }
  }

  // Also add recessed gutter drains along pit apron track wall edge
  if (pitLaneBounds?.frame) {
    const f = pitLaneBounds.frame;
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(f.rightX, 0, f.rightZ),
      upVec,
      new THREE.Vector3(-f.tanX, 0, -f.tanZ),
    );
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
    for (let along = -f.halfLength + 14; along <= f.halfLength - 14; along += 26) {
      const px = f.centerX + f.tanX * along + f.rightX * (f.halfWidth - 1.2);
      const pz = f.centerZ + f.tanZ * along + f.rightZ * (f.halfWidth - 1.2);
      matrices.push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(px, pitLaneBounds.y + 0.025, pz),
          quat,
          new THREE.Vector3(1, 1, 1),
        ),
      );
    }
  }

  if (matrices.length === 0) return grateGroup;

  // Build composite single-unit geometry: outer concrete collar, recessed dark pit, cast-iron slotted bars
  const collarParts: THREE.BufferGeometry[] = [];
  const barParts: THREE.BufferGeometry[] = [];

  const frameTop = new THREE.BoxGeometry(0.62, 0.032, 0.96);
  const frameB = new THREE.BoxGeometry(0.09, 0.045, 0.96);
  frameB.translate(-0.265, 0.015, 0);
  const frameB2 = frameB.clone().translate(0.53, 0, 0);
  collarParts.push(frameTop, frameB, frameB2);

  // Dark sump floor inside collar
  const sumpGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.038, 0.84));
  sumpGeo.translate(0, 0.008, 0);

  // Heavy cast-iron transverse slots across sump
  for (let slot = -4; slot <= 4; slot++) {
    const bar = new THREE.BoxGeometry(0.42, 0.022, 0.042);
    bar.translate(0, 0.028, slot * 0.092);
    barParts.push(bar);
  }
  // Center cast-iron spine rib
  const spine = new THREE.BoxGeometry(0.055, 0.024, 0.86);
  spine.translate(0, 0.028, 0);
  barParts.push(spine);

  const collarGeo = trackGeo(BufferGeometryUtils.mergeGeometries(collarParts, false));
  collarParts.forEach((g) => g.dispose());
  const barsGeo = trackGeo(BufferGeometryUtils.mergeGeometries(barParts, false));
  barParts.forEach((g) => g.dispose());

  const collarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x5c626a,
      roughness: 0.84,
      metalness: 0.14,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const sumpMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0b0e12,
      roughness: 0.95,
      metalness: 0.05,
    }),
  );
  const ironMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x262d36,
      roughness: 0.38,
      metalness: 0.86,
    }),
  );

  const collarInst = new THREE.InstancedMesh(collarGeo, collarMat, matrices.length);
  const sumpInst = new THREE.InstancedMesh(sumpGeo, sumpMat, matrices.length);
  const barsInst = new THREE.InstancedMesh(barsGeo, ironMat, matrices.length);

  for (let i = 0; i < matrices.length; i++) {
    collarInst.setMatrixAt(i, matrices[i]);
    sumpInst.setMatrixAt(i, matrices[i]);
    barsInst.setMatrixAt(i, matrices[i]);
  }
  for (const inst of [collarInst, sumpInst, barsInst]) {
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    inst.receiveShadow = true;
    grateGroup.add(inst);
  }

  return grateGroup;
}
