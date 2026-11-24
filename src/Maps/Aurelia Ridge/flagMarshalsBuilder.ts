import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getCircuitData,
  SHOULDER_WIDTH,
} from './circuitSpline';
import { lerp } from '../../engine/mathNoise';
import { type WeatherUniforms } from './skyAndLighting';
import { groundHeightAt } from './terrainField';
import { worldColliders } from './worldColliders';
import { isPointInPitBounds, type MapPitBounds } from '../mapRegistry';

export interface FlagMarshalsRig {
  group: THREE.Group;
  update: (
    deltaSec: number,
    elapsedSec: number,
    flagState: 'green' | 'yellow' | 'checkered',
    hazardTrackT: number | null,
  ) => void;
  setWireframe: (wire: boolean) => void;
  dispose: () => void;
}

interface MarshalStationNode {
  trackT: number;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  armPivot: THREE.Group;
  forearmPivot: THREE.Group;
  flagMesh: THREE.Mesh;
  phase: number;
  yellowBlend: number;
  isFinishStation: boolean;
}

function createClothFlagMaterial(
  colorHex: number,
  emissiveHex: number,
  waveBoost: number,
  sharedWeather: WeatherUniforms,
  checkered = false,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: colorHex,
    emissive: emissiveHex,
    emissiveIntensity: waveBoost > 1.2 ? 0.28 : 0.1,
    roughness: 0.72,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedWeather.uTime;
    shader.uniforms.uWetness = sharedWeather.uWetness;
    shader.uniforms.uWindSpeed = sharedWeather.uWindSpeed;
    shader.uniforms.uWaveBoost = { value: waveBoost };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWindSpeed;
        uniform float uWaveBoost;
        varying vec2 vFlagLocalUv;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec2 fUv = vec2(clamp(position.x / 0.98, 0.0, 1.0), clamp((position.y + 0.35) / 0.70, 0.0, 1.0));
        vFlagLocalUv = fUv;
        float pin = smoothstep(0.0, 0.9, fUv.x);
        float spd = clamp(uWindSpeed, 0.4, 2.8) * uWaveBoost;
        float w1 = sin(fUv.x * 8.5 - uTime * (4.8 * spd) + fUv.y * 2.2);
        float w2 = cos(fUv.x * 15.0 - uTime * (7.2 * spd) - fUv.y * 3.1);
        transformed.z += (w1 * 0.105 + w2 * 0.048) * pin * clamp(uWaveBoost, 0.9, 1.75);
        transformed.y += sin(fUv.x * 6.0 - uTime * (4.2 * spd)) * 0.036 * pin;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWetness;
        varying vec2 vFlagLocalUv;`,
      )
      .replace(
        '#include <map_fragment>',
        checkered
          ? `#include <map_fragment>
        float cx = floor(vFlagLocalUv.x * 6.0);
        float cy = floor(vFlagLocalUv.y * 4.0);
        float chk = mod(cx + cy, 2.0);
        float weave = 0.94 + 0.06 * sin(vFlagLocalUv.x * 140.0) * cos(vFlagLocalUv.y * 100.0);
        diffuseColor.rgb = mix(vec3(0.06), vec3(0.95), chk) * weave * mix(1.0, 0.78, uWetness);`
          : `#include <map_fragment>
        float weave = 0.94 + 0.06 * sin(vFlagLocalUv.x * 140.0) * cos(vFlagLocalUv.y * 100.0);
        float border = smoothstep(0.0, 0.06, vFlagLocalUv.x);
        diffuseColor.rgb *= mix(vec3(0.86), vec3(weave), border) * mix(1.0, 0.78, uWetness);`,
      );
  };
  mat.customProgramCacheKey = () =>
    `aurelia-marshal-handflag-${checkered ? 'chk' : waveBoost > 1.2 ? 'yellow' : 'green'}-v2`;
  return mat;
}

/**
 * Computes high-speed corner & braking-zone marshal indices directly from the spline
 * curvature profile, plus Start/Finish and high-speed ridge kinks.
 */
function selectCornerMarshalSamples(
  samples: ReturnType<typeof getCircuitData>['samples'],
  startFinishIndex: number,
  pitBounds: MapPitBounds,
): Array<{ sampleIdx: number; isFinish: boolean }> {
  const N = samples.length;
  const chosen: Array<{ sampleIdx: number; isFinish: boolean }> = [
    { sampleIdx: startFinishIndex, isFinish: true },
  ];

  // Find local curvature peaks (high-speed apexes & heavy braking entries) spaced at least ~5.5% apart
  const minSep = Math.floor(N * 0.055);
  const candidates: Array<{ idx: number; score: number }> = [];
  for (let i = 0; i < N; i++) {
    const c = Math.abs(samples[i].curvature);
    const prev = Math.abs(samples[(i - 2 + N) % N].curvature);
    const next = Math.abs(samples[(i + 2) % N].curvature);
    if (c > 0.0042 && c >= prev && c >= next) {
      // Place marshal slightly upstream of peak apex in the corner entry/braking zone
      const entryIdx = (i - Math.floor(N * 0.012) + N) % N;
      candidates.push({ idx: entryIdx, score: c });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const isFarEnough = (idx: number) => {
    for (const item of chosen) {
      const d = Math.abs(idx - item.sampleIdx);
      const wrapD = Math.min(d, N - d);
      if (wrapD < minSep) return false;
    }
    return true;
  };

  for (const cand of candidates) {
    if (chosen.length >= 12) break;
    let resolved = cand.idx;
    let valid = false;
    for (let step = 0; step < 60; step++) {
      const test = (cand.idx + step) % N;
      const cs = samples[test];
      const inPitCut =
        cs.isStraight &&
        isPointInPitBounds(pitBounds, cs.position.x, cs.position.y, cs.position.z, 18, 28);
      if (!cs.isBridge && !inPitCut) {
        resolved = test;
        valid = true;
        break;
      }
    }
    if (valid && isFarEnough(resolved)) {
      chosen.push({ sampleIdx: resolved, isFinish: false });
    }
  }

  return chosen;
}

/**
 * Builds 3D articulated Track Marshals stationed near high-speed corners & Start/Finish
 * who animate torso lean, head tracking, and flag waving synchronized to live flagState telemetry.
 */
export function buildFlagMarshalsRig(weatherUniforms?: WeatherUniforms): FlagMarshalsRig {
  const group = new THREE.Group();
  group.name = 'TracksideFlagMarshalsRig';

  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51).normalize() },
  };

  const circuit = getCircuitData();
  const samples = circuit.samples;
  const N = samples.length;

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

  // Marshal Materials
  const plinthMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x5c646d, roughness: 0.85, metalness: 0.08 }),
  );
  const orangeSafetyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf97316,
      emissive: 0x9a3412,
      emissiveIntensity: 0.16,
      roughness: 0.62,
      metalness: 0.06,
    }),
  );
  const suitDarkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72, metalness: 0.08 }),
  );
  const reflectiveStripeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x94a3b8,
      emissiveIntensity: 0.22,
      roughness: 0.28,
      metalness: 0.55,
    }),
  );
  const helmetMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.22, metalness: 0.2 }),
  );
  const visorMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.08, metalness: 0.75 }),
  );
  const poleMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.35, metalness: 0.82 }),
  );

  const greenFlagMat = trackMat(
    createClothFlagMaterial(0x16a34a, 0x052e16, 1.0, sharedWeather),
  );
  const checkeredFlagMat = trackMat(
    createClothFlagMaterial(0xffffff, 0x222222, 1.65, sharedWeather, true),
  );

  // Reusable geometries
  const plinthGeo = trackGeo(new THREE.BoxGeometry(1.55, 1.05, 1.55));
  const shieldRailGeo = trackGeo(new THREE.BoxGeometry(1.6, 0.74, 0.12));

  // Lower legs + boots
  const legParts: THREE.BufferGeometry[] = [];
  const legL = new THREE.CylinderGeometry(0.105, 0.085, 0.78, 8);
  legL.translate(-0.13, 0.42, 0);
  const legR = new THREE.CylinderGeometry(0.105, 0.085, 0.78, 8);
  legR.translate(0.13, 0.42, 0);
  legParts.push(legL, legR);
  const legsGeo = trackGeo(BufferGeometryUtils.mergeGeometries(legParts, false));
  for (const g of legParts) g.dispose();

  const torsoGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.62, 0.26));
  torsoGeo.translate(0, 0.32, 0);

  const stripeGeo = trackGeo(new THREE.BoxGeometry(0.48, 0.12, 0.28));
  stripeGeo.translate(0, 0.38, 0);

  const bootParts: THREE.BufferGeometry[] = [];
  const bootL = new THREE.BoxGeometry(0.14, 0.12, 0.24);
  bootL.translate(-0.13, 0.06, 0.04);
  const bootR = new THREE.BoxGeometry(0.14, 0.12, 0.24);
  bootR.translate(0.13, 0.06, 0.04);
  bootParts.push(bootL, bootR);
  const bootsGeo = trackGeo(BufferGeometryUtils.mergeGeometries(bootParts, false));
  for (const g of bootParts) g.dispose();

  const helmetGeo = trackGeo(new THREE.SphereGeometry(0.165, 12, 10));
  const visorGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.09, 0.12));

  const leftArmGeo = trackGeo(new THREE.CylinderGeometry(0.064, 0.052, 0.56, 7));
  leftArmGeo.translate(0, -0.26, 0);
  const upperArmGeo = trackGeo(new THREE.CylinderGeometry(0.068, 0.056, 0.3, 7));
  upperArmGeo.translate(0, 0.15, 0);
  const forearmGeo = trackGeo(new THREE.CylinderGeometry(0.056, 0.048, 0.28, 7));
  forearmGeo.translate(0, 0.14, 0);
  const staffGeo = trackGeo(new THREE.CylinderGeometry(0.022, 0.026, 1.42, 6));
  staffGeo.translate(0, 0.7, 0);
  const flagClothGeo = trackGeo(new THREE.PlaneGeometry(0.98, 0.7, 12, 6));
  flagClothGeo.translate(0.49, 0, 0);

  const cornerSlots = selectCornerMarshalSamples(
    samples,
    circuit.startFinishIndex,
    circuit.pitLaneBounds,
  );
  const stations: MarshalStationNode[] = [];

  cornerSlots.forEach(({ sampleIdx, isFinish }, idx) => {
    const s = samples[sampleIdx];
    const side = isFinish ? 1 : s.curvature >= 0 ? 1 : -1;
    const lat = side * (circuit.roadHalfWidth + SHOULDER_WIDTH + 1.15);
    const mx = s.position.x + s.right.x * lat;
    const mz = s.position.z + s.right.z * lat;
    const my = Math.max(groundHeightAt(mx, mz), s.position.y + s.right.y * lat - 0.15);

    const postGroup = new THREE.Group();
    postGroup.name = `FlagMarshalPost_${idx + 1}`;
    postGroup.position.set(mx, my, mz);

    // Orient marshal +Z facing inward toward the track carriageway
    const toTrackX = -s.right.x * side;
    const toTrackZ = -s.right.z * side;
    postGroup.rotation.y = Math.atan2(toTrackX, toTrackZ);

    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -0.35;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    postGroup.add(plinth);

    const shield = new THREE.Mesh(shieldRailGeo, orangeSafetyMat);
    shield.position.set(0, 0.48, 0.7);
    shield.castShadow = true;
    postGroup.add(shield);

    worldColliders.addObb(
      mx,
      mz,
      0.84,
      0.84,
      s.right.x,
      s.right.z,
      'concrete',
      my - 1.5,
      my + 3.2,
    );

    // Standing Marshal Figure atop plinth
    const figureGroup = new THREE.Group();
    figureGroup.position.set(0, 0.16, 0);
    postGroup.add(figureGroup);

    const legsMesh = new THREE.Mesh(legsGeo, orangeSafetyMat);
    legsMesh.castShadow = true;
    figureGroup.add(legsMesh);

    const bootsMesh = new THREE.Mesh(bootsGeo, suitDarkMat);
    bootsMesh.castShadow = true;
    figureGroup.add(bootsMesh);

    // Articulated Torso Pivot at waist
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 0.8, 0);
    figureGroup.add(torsoGroup);

    const torsoMesh = new THREE.Mesh(torsoGeo, orangeSafetyMat);
    torsoMesh.castShadow = true;
    torsoGroup.add(torsoMesh);

    const stripeMesh = new THREE.Mesh(stripeGeo, reflectiveStripeMat);
    torsoGroup.add(stripeMesh);

    // Head Pivot
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.76, 0);
    torsoGroup.add(headGroup);

    const helmetMesh = new THREE.Mesh(helmetGeo, helmetMat);
    helmetMesh.castShadow = true;
    headGroup.add(helmetMesh);

    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.position.set(0, -0.01, 0.13);
    headGroup.add(visorMesh);

    // Articulated Left Arm
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.29, 0.56, 0.02);
    torsoGroup.add(leftArmPivot);
    const leftArmMesh = new THREE.Mesh(leftArmGeo, orangeSafetyMat);
    leftArmMesh.castShadow = true;
    leftArmPivot.add(leftArmMesh);

    // Articulated Right Shoulder -> Forearm -> Flagstaff
    const armPivot = new THREE.Group();
    armPivot.position.set(0.29, 0.56, 0.04);
    torsoGroup.add(armPivot);

    const upperArmMesh = new THREE.Mesh(upperArmGeo, orangeSafetyMat);
    upperArmMesh.castShadow = true;
    armPivot.add(upperArmMesh);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(0, 0.3, 0);
    armPivot.add(forearmPivot);

    const forearmMesh = new THREE.Mesh(forearmGeo, orangeSafetyMat);
    forearmMesh.castShadow = true;
    forearmPivot.add(forearmMesh);

    const handStaffPivot = new THREE.Group();
    handStaffPivot.position.set(0, 0.28, 0.04);
    handStaffPivot.rotation.x = 0.26;
    forearmPivot.add(handStaffPivot);

    const staffMesh = new THREE.Mesh(staffGeo, poleMat);
    staffMesh.castShadow = true;
    handStaffPivot.add(staffMesh);

    const flagMesh = new THREE.Mesh(flagClothGeo, greenFlagMat);
    flagMesh.position.set(0, 1.04, 0);
    flagMesh.rotation.y = Math.PI * 0.5;
    flagMesh.castShadow = true;
    handStaffPivot.add(flagMesh);

    group.add(postGroup);

    stations.push({
      trackT: sampleIdx / N,
      torsoGroup,
      headGroup,
      leftArmPivot,
      armPivot,
      forearmPivot,
      flagMesh,
      phase: idx * 1.17,
      yellowBlend: 0,
      isFinishStation: isFinish,
    });
  });

  return {
    group,
    update: (
      deltaSec: number,
      elapsedSec: number,
      flagState: 'green' | 'yellow' | 'checkered',
      hazardTrackT: number | null,
    ) => {
      for (let i = 0; i < stations.length; i++) {
        const st = stations[i];
        const isCheckered = flagState === 'checkered' && st.isFinishStation;
        const targetMat = isCheckered ? checkeredFlagMat : greenFlagMat;
        if (st.flagMesh.material !== targetMat) {
          st.flagMesh.material = targetMat;
        }

        const activeWave = isCheckered ? 1 : 0;
        st.yellowBlend = lerp(st.yellowBlend, activeWave, 1 - Math.exp(-9.0 * deltaSec));
        void hazardTrackT;

        // Calm steady hold & lookout scan under Green vs urgent high overhead wave under Yellow/Checkered
        const calmRoll = -0.32 + Math.sin(elapsedSec * 2.2 + st.phase) * 0.14;
        const calmPitch = 0.34 + Math.cos(elapsedSec * 1.8 + st.phase) * 0.08;
        const calmForearm = 0.18 + Math.sin(elapsedSec * 2.2 + st.phase) * 0.08;

        const urgentRoll = -1.2 + Math.sin(elapsedSec * 11.8 + st.phase) * 0.62;
        const urgentPitch = 0.26 + Math.cos(elapsedSec * 9.8 + st.phase) * 0.32;
        const urgentForearm = 0.35 + Math.cos(elapsedSec * 11.8 + st.phase) * 0.44;

        st.armPivot.rotation.z = lerp(calmRoll, urgentRoll, st.yellowBlend);
        st.armPivot.rotation.x = lerp(calmPitch, urgentPitch, st.yellowBlend);
        st.forearmPivot.rotation.z = lerp(calmForearm, urgentForearm, st.yellowBlend);

        // Torso lean & counterweight left arm + head tracking oncoming apex
        st.torsoGroup.rotation.z = Math.sin(elapsedSec * (2.2 + st.yellowBlend * 4.5) + st.phase) * (0.04 + st.yellowBlend * 0.09);
        st.torsoGroup.rotation.x = 0.05 + st.yellowBlend * 0.08;
        st.leftArmPivot.rotation.z = 0.16 + st.yellowBlend * (0.35 + Math.sin(elapsedSec * 9.0 + st.phase) * 0.16);
        st.headGroup.rotation.y = Math.sin(elapsedSec * 1.4 + st.phase) * 0.38;
      }
    },
    setWireframe: (wire: boolean) => {
      for (const m of wireframeMats) m.wireframe = wire;
    },
    dispose: () => {
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}
