import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, createSeededRandom, lerp } from '../engine/mathNoise';
import { type WeatherUniforms } from './Aurelia Ridge/skyAndLighting';

export interface CrowdTelemetryUniforms {
  uTime: { value: number };
  uExcitement: { value: number };     // 0.0 (idle) .. 1.0 (standing ovation)
  uWavePhase: { value: number };      // traveling grandstand wave angle
  uCrowdDensity: { value: number };   // 0.25 .. 1.0 visible spectator fill ratio
}

export interface CrowdTelemetryInput {
  closestRivalGapSec: number | null;
  speedMps: number;
  playerDistToGrandstand: number;
  latG?: number;
  inDriftZone?: boolean;
  nearBestPace?: boolean;
  playerPos?: { x: number; z: number };
  isFinalLap: boolean;
  isRacing: boolean;
  isPodium: boolean;
  isFinished: boolean;
  isCloseFinish: boolean;
  positionChangedPulse: number; // 0..1 when overtake happens
  reactivityScale: number;      // user setting 0.25 .. 1.5
  densityScale: number;         // user setting 0.25 .. 1.0
}

export interface GrandstandCrowdSpec {
  parentGroup: THREE.Group;
  /** Center of grandstand seating in parentGroup's local space (seats face -Z toward track). */
  centerX: number;
  baseY: number;
  centerZ: number;
  lengthX: number;
  depthZ: number;
  tierCount: number;
  stepHeight: number;
  stepDepth: number;
  frontTierOffsetZ: number;
  accentHex: number;
  secondaryHex: number;
}

export interface GrandstandCrowdRig {
  update: (
    deltaSec: number,
    elapsedSec: number,
    telemetry: CrowdTelemetryInput,
    distOverride?: number,
  ) => void;
  setWireframe: (wire: boolean) => void;
  dispose: () => void;
}

/**
 * Evaluates smooth crowd excitement (0 = calm idle, 1 = standing ovation) from live race telemetry,
 * including local player proximity, high-G cornering loads, drift zones, overtakes, and hot-lap pace.
 */
export function computeCrowdTargetExcitement(
  input: CrowdTelemetryInput,
  distOverride?: number,
): number {
  if (input.isPodium || input.isFinished) {
    return input.isCloseFinish ? 1.0 : 0.92;
  }
  if (!input.isRacing) {
    return 0.16;
  }

  let excitement = 0.14;
  const dist = distOverride ?? input.playerDistToGrandstand;

  // Close wheel-to-wheel rival battle
  if (input.closestRivalGapSec !== null && input.closestRivalGapSec < 2.6) {
    const closeness = clamp(1.0 - input.closestRivalGapSec / 2.6, 0, 1);
    excitement += closeness * 0.42;
  }

  // Player proximity flyby right past grandstand / corner fan zone
  const prox = dist < 105 ? clamp(1.0 - dist / 105, 0, 1) : 0;
  if (prox > 0) {
    const speedFactor = clamp(input.speedMps / 68, 0, 1);
    excitement += prox * speedFactor * 0.34;
  }

  // High-G cornering & drift zone excitement spike when player is near viewing zone
  const absLatG = Math.abs(input.latG ?? 0);
  if (absLatG > 1.05 && prox > 0.05) {
    const gFactor = clamp((absLatG - 1.05) / 1.35, 0, 1);
    excitement += gFactor * (0.28 + 0.30 * prox);
  }
  if (input.inDriftZone && prox > 0.05) {
    excitement += 0.24 + 0.28 * prox;
  }

  // Near-best-lap hot-lap pace excitement
  if (input.nearBestPace) {
    excitement += 0.18 + 0.18 * prox;
  }

  // Final lap tension boost
  if (input.isFinalLap) {
    excitement += 0.24;
  }

  // Overtake / position gain burst
  excitement += clamp(input.positionChangedPulse, 0, 1) * 0.48;

  return clamp(excitement * clamp(input.reactivityScale, 0.25, 1.5), 0.08, 1.0);
}

/**
 * Builds an articulated, multi-part spectator silhouette with vertex-encoded body part IDs
 * and vertex-color shading (distinct dark trousers, vibrant team jacket, skin tone, and cap/visor):
 *  partId 0 = legs / lower body
 *  partId 1 = jacket torso + head + cap (lifts & leans forward when cheering)
 *  partId 2 = left arm (raises & pumps around shoulder pivot)
 *  partId 3 = right arm (raises & pumps counter-phase around shoulder pivot)
 */
function buildArticulatedSpectatorGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const pushPart = (
    geo: THREE.BufferGeometry,
    partId: number,
    tintHex: number,
  ) => {
    const count = geo.attributes.position.count;
    const partAttr = new Float32Array(count);
    partAttr.fill(partId);
    geo.setAttribute('aPartId', new THREE.BufferAttribute(partAttr, 1));

    const c = new THREE.Color(tintHex);
    const colAttr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colAttr[i * 3] = c.r;
      colAttr[i * 3 + 1] = c.g;
      colAttr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colAttr, 3));
    parts.push(geo);
  };

  // Distinct left & right legs (dark trousers contrast cleanly against team jacket)
  for (const lx of [-0.1, 0.1]) {
    const leg = new THREE.CylinderGeometry(0.085, 0.072, 0.44, 6);
    leg.translate(lx, 0.22, -0.02);
    pushPart(leg, 0, 0x3b4252);
  }

  // Sculpted upper torso / team jacket + collar
  const torso = new THREE.CylinderGeometry(0.22, 0.18, 0.52, 8);
  torso.scale(1.08, 1.0, 0.62);
  torso.translate(0, 0.68, 0.02);
  pushPart(torso, 1, 0xffffff);

  const collar = new THREE.CylinderGeometry(0.11, 0.13, 0.09, 8);
  collar.translate(0, 0.95, 0.02);
  pushPart(collar, 1, 0xe2e8f0);

  // Head
  const head = new THREE.SphereGeometry(0.135, 8, 6);
  head.scale(0.95, 1.06, 0.98);
  head.translate(0, 1.11, 0.01);
  pushPart(head, 1, 0xf2c9a5);

  // Baseball / Motorsport cap crown + forward brim facing -Z toward track
  const capCrown = new THREE.CylinderGeometry(0.132, 0.142, 0.09, 8);
  capCrown.translate(0, 1.2, 0.01);
  pushPart(capCrown, 1, 0xffffff);
  const capVisor = new THREE.BoxGeometry(0.18, 0.03, 0.12);
  capVisor.translate(0, 1.16, -0.14);
  pushPart(capVisor, 1, 0xdbeafe);

  // Articulated arms (hinged near shoulders y = 0.88)
  const armL = new THREE.CylinderGeometry(0.055, 0.048, 0.42, 6);
  armL.translate(-0.27, 0.7, -0.02);
  pushPart(armL, 2, 0xffffff);

  const armR = new THREE.CylinderGeometry(0.055, 0.048, 0.42, 6);
  armR.translate(0.27, 0.7, -0.02);
  pushPart(armR, 3, 0xffffff);

  const merged = BufferGeometryUtils.mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  merged.computeVertexNormals();
  return merged;
}

/**
 * Populates any grandstand with GPU-instanced 3D spectators + waving team flags/banners
 * animated purely via vertex shaders driven by race telemetry.
 */
export function buildGrandstandCrowdRig(
  spec: GrandstandCrowdSpec,
  sharedUniforms: CrowdTelemetryUniforms | undefined,
  weatherUniforms: WeatherUniforms,
): GrandstandCrowdRig {
  const activeUniforms: CrowdTelemetryUniforms = sharedUniforms ?? {
    uTime: { value: 0 },
    uExcitement: { value: 0.16 },
    uWavePhase: { value: 0 },
    uCrowdDensity: { value: 1.0 },
  };
  const rand = createSeededRandom(448291);
  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];

  const crowdGeo = buildArticulatedSpectatorGeometry();
  disposableGeos.push(crowdGeo);

  // Generate tiered seat coordinates (dense realistic motorsport bowl with staircase aisles)
  const positions: Array<{ x: number; y: number; z: number; tierNorm: number }> = [];
  const usableHalfX = spec.lengthX * 0.5 - 2.2;
  for (let t = 0; t < spec.tierCount; t++) {
    const tierNorm = t / Math.max(1, spec.tierCount - 1);
    const seatY = spec.baseY + t * spec.stepHeight + 0.34;
    const seatZ = spec.centerZ - spec.depthZ * 0.5 + spec.frontTierOffsetZ + t * spec.stepDepth + 0.16;
    const spacingX = 0.78;
    for (let sx = -usableHalfX; sx <= usableHalfX; sx += spacingX) {
      // Leave crisp vertical access stairs every ~20m
      if (Math.abs(Math.abs(sx) - 18.0) < 1.2 || (usableHalfX > 36 && Math.abs(Math.abs(sx) - 38.0) < 1.2)) {
        continue;
      }
      // Subtle organic seat gaps (~94% occupancy)
      if (rand() < 0.06) continue;
      positions.push({
        x: spec.centerX + sx + (rand() - 0.5) * 0.14,
        y: seatY,
        z: seatZ + (rand() - 0.5) * 0.1,
        tierNorm,
      });
    }
  }

  const count = positions.length;
  const metaArray = new Float32Array(count * 4);

  const crowdMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.74,
    metalness: 0.04,
  });

  crowdMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = activeUniforms.uTime;
    shader.uniforms.uExcitement = activeUniforms.uExcitement;
    shader.uniforms.uWavePhase = activeUniforms.uWavePhase;
    shader.uniforms.uCrowdDensity = activeUniforms.uCrowdDensity;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aPartId;
        attribute vec4 aCrowdMeta;
        uniform float uTime;
        uniform float uExcitement;
        uniform float uWavePhase;
        uniform float uCrowdDensity;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Per-instance density culling via zero scale
        float visMask = step(aCrowdMeta.w, uCrowdDensity);
        transformed *= visMask;

        float phase = aCrowdMeta.x;
        float tierNorm = aCrowdMeta.y;
        float bias = aCrowdMeta.z;

        // Traveling stadium Mexican wave across grandstand width
        float waveArg = phase * 3.8 - uWavePhase;
        float waveBoost = pow(max(0.0, sin(waveArg)), 3.0) * smoothstep(0.15, 0.82, uExcitement);

        // Stand up threshold: low excitement stays seated, high excitement rises + jumps
        float standFactor = clamp(smoothstep(0.24, 0.65, uExcitement + bias * 0.24 + waveBoost * 0.62), 0.0, 1.0);
        float cheerFreq = mix(2.4, 8.6, uExcitement);
        float bounce = abs(sin(uTime * cheerFreq + phase * 11.0)) * smoothstep(0.42, 1.0, uExcitement) * 0.34;

        // Seated idle sway & subtle torso lean
        float idleSway = sin(uTime * 1.55 + phase * 6.283 + tierNorm * 2.0) * 0.055;
        float standLift = standFactor * 0.38 + bounce;

        if (aPartId < 0.5) {
          // Lower body stretches slightly when standing
          transformed.y *= (1.0 + standFactor * 0.58);
          transformed.y += bounce;
        } else if (aPartId < 1.5) {
          // Upper torso + head lifts & sways
          transformed.y += standLift;
          transformed.x += idleSway * (1.0 + standFactor * 0.78);
          transformed.z -= standFactor * 0.08;
        } else {
          // Arms (2 = left, 3 = right): raise overhead around shoulder pivot y=0.88 when cheering
          float isRight = step(2.5, aPartId);
          float armExcite = clamp(standFactor * 0.88 + waveBoost * 0.82 + uExcitement * 0.42, 0.0, 1.0);
          float pump = sin(uTime * (cheerFreq * 1.2) + phase * 9.0 + isRight * 1.45) * 0.48 * armExcite;
          float rotAng = armExcite * 2.58 + pump;
          float pivotY = 0.88;
          vec3 rel = transformed - vec3(0.0, pivotY, 0.0);
          float cs = cos(rotAng);
          float sn = sin(rotAng);
          vec3 rotArm = vec3(
            rel.x + (isRight > 0.5 ? 0.05 : -0.05) * armExcite,
            rel.y * cs - rel.z * sn,
            rel.y * sn + rel.z * cs
          );
          transformed = rotArm + vec3(0.0, pivotY + standLift, 0.0);
        }`,
      );
  };
  crowdMat.customProgramCacheKey = () => 'grandstand-crowd-instanced-v2-articulated';
  disposableMats.push(crowdMat);

  const crowdMesh = new THREE.InstancedMesh(crowdGeo, crowdMat, count);
  crowdMesh.name = 'InstancedGrandstandCrowd';
  crowdMesh.castShadow = false;
  crowdMesh.receiveShadow = true;

  const kitPalette = [
    new THREE.Color(spec.accentHex),
    new THREE.Color(spec.secondaryHex),
    new THREE.Color(0xf8fafc),
    new THREE.Color(0x334155),
    new THREE.Color(0xf59e0b),
    new THREE.Color(0xef4444),
    new THREE.Color(0x0ea5e9),
    new THREE.Color(0x10b981),
    new THREE.Color(0xa855f7),
  ];

  const dummy = new THREE.Object3D();
  const cTmp = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const p = positions[i];
    dummy.position.set(p.x, p.y, p.z);
    // Face -Z toward pit straight, with subtle natural gaze variation
    dummy.rotation.set(0, (rand() - 0.5) * 0.26, 0);
    const s = 0.92 + rand() * 0.22;
    dummy.scale.set(s, 0.9 + rand() * 0.24, s);
    dummy.updateMatrix();
    crowdMesh.setMatrixAt(i, dummy.matrix);

    const kit = kitPalette[Math.floor(rand() * kitPalette.length)];
    cTmp.copy(kit).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.08);
    crowdMesh.setColorAt(i, cTmp);

    const xNorm = clamp((p.x - spec.centerX) / Math.max(1, spec.lengthX * 0.5), -1, 1);
    metaArray[i * 4 + 0] = xNorm * 0.5 + 0.5; // longitudinal wave coord 0..1
    metaArray[i * 4 + 1] = p.tierNorm;
    metaArray[i * 4 + 2] = (rand() - 0.5) * 0.6;
    metaArray[i * 4 + 3] = rand(); // deterministic fill threshold for crowdDensity slider
  }

  crowdGeo.setAttribute('aCrowdMeta', new THREE.InstancedBufferAttribute(metaArray, 4));
  crowdMesh.instanceMatrix.needsUpdate = true;
  if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true;
  crowdMesh.computeBoundingSphere();
  spec.parentGroup.add(crowdMesh);

  // Add Animated Grandstand Roof/Rail Team Flags reacting to both Global Wind & Excitement
  const bannerGeo = new THREE.PlaneGeometry(1.85, 0.98, 8, 3);
  bannerGeo.translate(0.925, 0, 0);
  disposableGeos.push(bannerGeo);

  const bannerMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.62,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  bannerMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = weatherUniforms.uTime;
    shader.uniforms.uWindSpeed = weatherUniforms.uWindSpeed;
    shader.uniforms.uExcitement = activeUniforms.uExcitement;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWindSpeed;
        uniform float uExcitement;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float pinX = smoothstep(0.0, 1.85, position.x);
        float wFreq = 4.2 + uWindSpeed * 2.6 + uExcitement * 3.4;
        float flap = sin(position.x * 4.5 - uTime * wFreq + position.y * 2.2) * (0.14 + uWindSpeed * 0.08 + uExcitement * 0.14);
        transformed.z += flap * pinX;
        transformed.y += cos(position.x * 3.1 - uTime * wFreq * 0.8) * 0.06 * pinX;`,
      );
  };
  bannerMat.customProgramCacheKey = () => 'grandstand-banner-wind-v1';
  disposableMats.push(bannerMat);

  const flagXs: number[] = [];
  const flagSpan = spec.lengthX * 0.44;
  for (let fx = -flagSpan; fx <= flagSpan + 0.1; fx += flagSpan * 0.333) {
    flagXs.push(spec.centerX + fx);
  }
  const flagCount = flagXs.length;
  const flagMesh = new THREE.InstancedMesh(bannerGeo, bannerMat, flagCount);
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 2.8, 6);
  disposableGeos.push(poleGeo);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.75, roughness: 0.3 });
  disposableMats.push(poleMat);
  const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, flagCount);

  const roofFlagY = spec.baseY + spec.tierCount * spec.stepHeight + 5.8;
  const roofFlagZ = spec.centerZ - spec.depthZ * 0.5 - 0.6;
  for (let i = 0; i < flagCount; i++) {
    dummy.position.set(flagXs[i], roofFlagY, roofFlagZ);
    dummy.rotation.set(0, Math.PI * 0.5, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);

    dummy.position.set(flagXs[i], roofFlagY + 0.85, roofFlagZ);
    dummy.rotation.set(0, 0.15, 0);
    dummy.updateMatrix();
    flagMesh.setMatrixAt(i, dummy.matrix);
    flagMesh.setColorAt(i, kitPalette[i % kitPalette.length]);
  }
  poleMesh.instanceMatrix.needsUpdate = true;
  flagMesh.instanceMatrix.needsUpdate = true;
  if (flagMesh.instanceColor) flagMesh.instanceColor.needsUpdate = true;
  poleMesh.computeBoundingSphere();
  flagMesh.computeBoundingSphere();
  spec.parentGroup.add(poleMesh, flagMesh);

  let smoothedExcitement = 0.16;

  return {
    update: (
      deltaSec: number,
      elapsedSec: number,
      telemetry: CrowdTelemetryInput,
      distOverride?: number,
    ) => {
      const target = computeCrowdTargetExcitement(telemetry, distOverride);
      const rate = target > smoothedExcitement ? 5.2 : 1.7;
      smoothedExcitement = lerp(smoothedExcitement, target, 1 - Math.exp(-rate * clamp(deltaSec, 0.001, 0.1)));
      activeUniforms.uTime.value = elapsedSec;
      activeUniforms.uExcitement.value = smoothedExcitement;
      activeUniforms.uWavePhase.value = elapsedSec * (1.2 + smoothedExcitement * 2.6);
      activeUniforms.uCrowdDensity.value = clamp(telemetry.densityScale, 0.2, 1.0);
    },
    setWireframe: (wire: boolean) => {
      crowdMat.wireframe = wire;
      bannerMat.wireframe = wire;
    },
    dispose: () => {
      spec.parentGroup.remove(crowdMesh, flagMesh, poleMesh);
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}
