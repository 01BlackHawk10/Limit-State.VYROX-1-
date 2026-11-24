import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getCircuitData, SHOULDER_WIDTH } from '../Aurelia Ridge/circuitSpline';
import { FROSTPEAK_WATER_LEVEL } from './frostpeakTerrainField';
import { createSeededRandom, fbm2D, lerp } from '../../engine/mathNoise';
import { ProceduralTextureSuite } from '../Aurelia Ridge/proceduralTextures';
import { type WeatherUniforms } from '../Aurelia Ridge/skyAndLighting';
import { groundHeightAt, groundNormalAt } from '../Aurelia Ridge/terrainField';
import { worldColliders } from '../Aurelia Ridge/worldColliders';
import { type LandmarksAndCampusRig } from '../Aurelia Ridge/landmarksAndCampusBuilder';
import { type PropsAndFoliageRig, type PropsQualityTier } from '../Aurelia Ridge/propsAndFoliageBuilder';
import { isPointInPitBounds } from '../mapRegistry';
import {
  buildCornerFanZoneRigs,
  buildOrientedPitAndGrandstandAddon,
  buildSharedTracksideInfra,
} from '../sharedTracksideKit';
import { type CrowdTelemetryInput } from '../sharedGrandstandCrowd';

/**
 * Frostpeak Glacier Landmarks:
 * 1. Heated 6-Bay Alpine Pit-Lane Apron, Timber-Steel Paddock, Race Control & Heated Grandstand
 * 2. Monumental Glacial Ice & Granite Canyon Overhang Arch (16.5m+ clearance)
 * 3. Multi-Part Alpine Chalet Village & Summit Ski Lodge with Chimney Smoke Plumes
 * 4. Active Ski Slope Slalom Course & Misting Fan Snow-Making Cannons
 * 5. Overhead Alpine Gondola Cableway with Base & Summit Terminals + Moving Cabins
 * 6. Snowplowed Trackside Wooden Snow-Drift Fences
 */
export function buildFrostpeakLandmarksRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): LandmarksAndCampusRig {
  const group = new THREE.Group();
  group.name = 'FrostpeakLandmarksRig';

  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };

  const circuit = getCircuitData();
  const samples = circuit.samples;
  const N = samples.length;
  const pitBounds = circuit.pitLaneBounds;
  const pitY = pitBounds.y;
  const rand = createSeededRandom(55109);

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const wireMats: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T, wireframeCapable = true): T => {
    disposableMats.push(m);
    if (wireframeCapable) wireMats.push(m);
    return m;
  };

  // ---------------------------------------------------------------------------
  // 1. HEATED PIT-LANE APRON, RADIANT PIT BOXES & 6-BAY ALPINE PADDOCK
  // ---------------------------------------------------------------------------
  const pitFrame = pitBounds.frame ?? {
    centerX: -13,
    centerZ: 220,
    tanX: 1,
    tanZ: 0,
    rightX: 0,
    rightZ: 1,
    halfLength: 120,
    halfWidth: 10.5,
  };
  const pitYaw = Math.atan2(-pitFrame.tanZ, pitFrame.tanX);
  const pitComplexGroup = new THREE.Group();
  pitComplexGroup.position.set(pitFrame.centerX, pitY, pitFrame.centerZ);
  pitComplexGroup.rotation.y = pitYaw;
  group.add(pitComplexGroup);

  const pitLocalToWorld = (lx: number, lz: number): [number, number] => [
    pitFrame.centerX + lx * pitFrame.tanX + lz * pitFrame.rightX,
    pitFrame.centerZ + lx * pitFrame.tanZ + lz * pitFrame.rightZ,
  ];

  const pitApronGeo = trackGeo(new THREE.PlaneGeometry(246, 22));
  pitApronGeo.rotateX(-Math.PI / 2);
  {
    const uvAttr = pitApronGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * 14, uvAttr.getY(i) * 1.6);
    }
    uvAttr.needsUpdate = true;
  }
  const pitApronMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.asphaltAlbedo,
      normalMap: textures.asphaltNormal,
      roughnessMap: textures.asphaltRoughness,
      color: 0xaab7c4,
      roughness: 0.72,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const pitApron = new THREE.Mesh(pitApronGeo, pitApronMat);
  pitApron.position.set(0, 0.03, -1.0);
  pitApron.receiveShadow = true;
  pitComplexGroup.add(pitApron);

  const lineMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.2,
      roughness: 0.45,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const pitLineGeo = trackGeo(new THREE.PlaneGeometry(236, 0.36));
  pitLineGeo.rotateX(-Math.PI / 2);
  const pitLine = new THREE.Mesh(pitLineGeo, lineMat);
  pitLine.position.set(0, 0.05, 7.6);
  pitComplexGroup.add(pitLine);

  const boxMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.28,
      roughness: 0.46,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const boxPadGeo = trackGeo(new THREE.PlaneGeometry(10.5, 4.6));
  boxPadGeo.rotateX(-Math.PI / 2);
  const boxPadInst = new THREE.InstancedMesh(boxPadGeo, boxMat, 6);
  const padMat4 = new THREE.Matrix4();
  for (let b = 0; b < 6; b++) {
    padMat4.makeTranslation(-50 + b * 20, 0.055, 1.6);
    boxPadInst.setMatrixAt(b, padMat4);
  }
  boxPadInst.instanceMatrix.needsUpdate = true;
  boxPadInst.computeBoundingSphere();
  pitComplexGroup.add(boxPadInst);

  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.concreteNormal,
      color: 0xe2e8f0,
      roughness: 0.78,
      metalness: 0.06,
    }),
  );
  const [wallWx, wallWz] = pitLocalToWorld(0, 9.2);
  worldColliders.addObb(
    wallWx,
    wallWz,
    63,
    0.42,
    pitFrame.tanX,
    pitFrame.tanZ,
    'concrete',
    pitY - 0.5,
    pitY + 2.5,
  );

  // Heated Alpine Timber & Steel materials for Village, Lodge, Slalom & Snow Fences
  const timberMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.barkAlbedo,
      normalMap: textures.barkNormal,
      color: 0x6b472f,
      roughness: 0.86,
      metalness: 0.04,
    }),
  );
  const snowRoofMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf1f6fb, roughness: 0.85, metalness: 0.03 }),
  );
  const stonePlinthMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      normalMap: textures.terrainRockNormal,
      color: 0x7b8694,
      roughness: 0.9,
      metalness: 0.04,
    }),
  );
  const glassHospitalityMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x261d12,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.35,
      roughness: 0.12,
      metalness: 0.12,
      clearcoat: 0.9,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
    }),
  );

  // Add oriented Race Control Pavilion, Pit-Wall Catch Fence, Entry Portal & Heated 8-Tier Grandstand
  const sharedPitAddon = buildOrientedPitAndGrandstandAddon(
    group,
    textures,
    sharedWeather,
    pitBounds,
    pitFrame,
    FROSTPEAK_WATER_LEVEL,
    'frostpeak_pass',
  );

  // ---------------------------------------------------------------------------
  // 2. MONUMENTAL GLACIAL ICE & GRANITE CANYON OVERHANG ARCH (16.5m+ clearance)
  // ---------------------------------------------------------------------------
  let archIdx = Math.floor(0.76 * N);
  let bestArchScore = -Infinity;
  for (let i = Math.floor(0.64 * N); i < Math.floor(0.9 * N); i++) {
    const s = samples[i % N];
    if (s.isBridge || s.isStraight) continue;
    if (Math.abs(s.curvature) > 0.0115 || s.position.y < 18.0) continue;
    if (isPointInPitBounds(pitBounds, s.position.x, s.position.y, s.position.z, 24, 24)) continue;
    const score = s.position.y - Math.abs(s.curvature) * 520;
    if (score > bestArchScore) {
      bestArchScore = score;
      archIdx = i % N;
    }
  }
  const archSample = samples[archIdx];
  const archFrame = new THREE.Matrix4().makeBasis(
    archSample.right,
    new THREE.Vector3(0, 1, 0),
    archSample.tangent.clone().negate(),
  );
  const archQuat = new THREE.Quaternion().setFromRotationMatrix(archFrame);

  const graniteArchMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      normalMap: textures.terrainRockNormal,
      normalScale: new THREE.Vector2(1.25, 1.25),
      color: 0x6f7c8c,
      roughness: 0.88,
      metalness: 0.05,
    }),
  );
  const glacialIceMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x99dcff,
      emissive: 0x0c4a6e,
      emissiveIntensity: 0.14,
      roughness: 0.16,
      metalness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
      transparent: false,
    }),
  );

  const archRockGeos: THREE.BufferGeometry[] = [];
  const archIceGeos: THREE.BufferGeometry[] = [];
  const archSegs = 15;
  const spanHalf = 17.2;
  const archHeight = 19.4;
  for (let i = 0; i <= archSegs; i++) {
    const a = (i / archSegs) * Math.PI;
    const lx = Math.cos(a) * spanHalf;
    const ly = Math.sin(a) * archHeight - 2.4;
    const thickness = 5.3 - Math.sin(a) * 1.45 + (rand() - 0.5) * 0.6;
    const depth = 11.4 - Math.sin(a) * 2.4;

    const segGeo = new THREE.DodecahedronGeometry(thickness, 1);
    const sPos = segGeo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < sPos.count; v++) {
      const vx = sPos.getX(v);
      const vy = sPos.getY(v);
      const vz = sPos.getZ(v);
      const jag = 0.82 + Math.sin(vx * 1.9 + i) * 0.16 + Math.cos(vz * 1.7) * 0.14;
      sPos.setXYZ(v, vx * jag, vy * jag * 0.88, (vz / thickness) * (depth * 0.56) * jag);
    }
    segGeo.computeVertexNormals();
    segGeo.rotateZ(a - Math.PI * 0.5);
    segGeo.translate(lx, ly, (rand() - 0.5) * 1.2);
    segGeo.applyQuaternion(archQuat);
    segGeo.translate(archSample.position.x, archSample.position.y, archSample.position.z);

    // Outer piers granite rock, high canyon vault faceted translucent blue glacier ice
    if (i <= 2 || i >= archSegs - 2) {
      archRockGeos.push(segGeo);
    } else {
      archIceGeos.push(segGeo);
    }
  }
  if (archRockGeos.length > 0) {
    const mAR = trackGeo(BufferGeometryUtils.mergeGeometries(archRockGeos, false));
    archRockGeos.forEach((g) => g.dispose());
    const arMesh = new THREE.Mesh(mAR, graniteArchMat);
    arMesh.castShadow = true;
    arMesh.receiveShadow = true;
    group.add(arMesh);
  }
  if (archIceGeos.length > 0) {
    const mAI = trackGeo(BufferGeometryUtils.mergeGeometries(archIceGeos, false));
    archIceGeos.forEach((g) => g.dispose());
    const aiMesh = new THREE.Mesh(mAI, glacialIceMat);
    aiMesh.castShadow = true;
    aiMesh.receiveShadow = true;
    group.add(aiMesh);
  }

  for (const archSide of [-1, 1] as const) {
    const px = archSample.position.x + archSample.right.x * archSide * spanHalf;
    const pz = archSample.position.z + archSample.right.z * archSide * spanHalf;
    worldColliders.addCircle(
      px,
      pz,
      4.5,
      'rock',
      archSample.position.y - 4.0,
      archSample.position.y + 8.5,
    );
  }
  const archIceLight = new THREE.PointLight(0x7dd3fc, 0, 62, 1.45);
  archIceLight.position.copy(archSample.position).add(new THREE.Vector3(0, 8.2, 0));
  archIceLight.visible = false;
  group.add(archIceLight);

  // ---------------------------------------------------------------------------
  // 3. MULTI-PART ALPINE CHALET VILLAGE, SUMMIT SKI LODGE & CHIMNEY SMOKE
  // ---------------------------------------------------------------------------
  const chaletPlinthGeos: THREE.BufferGeometry[] = [];
  const chaletWallGeos: THREE.BufferGeometry[] = [];
  const chaletRoofGeos: THREE.BufferGeometry[] = [];
  const chaletWinGeos: THREE.BufferGeometry[] = [];
  const chimneyPositions: THREE.Vector3[] = [];

  const warmWindowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.78,
      roughness: 0.22,
    }),
  );

  // Village chalets clustered on leveled Ski Village Terrace (-175, 128) & lake overlook ridges
  const chaletPlacements: Array<[number, number, number, number]> = [
    [-192, 108, 0.14, 1.1],
    [-175, 126, -0.18, 1.25],
    [-156, 106, 0.22, 1.0],
    [-186, 146, 0.08, 1.18],
    [-156, 144, -0.12, 1.12],
    [-172, 166, 0.26, 1.3],
    [-138, 118, 1.48, 1.05],
    [-140, 148, 1.54, 1.15],
    [-144, 174, -1.42, 0.95],
    [-55, 116, 0.42, 1.2],
    [18, 108, 0.35, 1.05],
    [172, 82, -0.45, 1.15],
    [-204, 162, 0.32, 1.08],
    [224, 112, -0.58, 1.18],
  ];

  for (const [cx, cz, cyaw, sc] of chaletPlacements) {
    const cy = groundHeightAt(cx, cz);
    if (cy < FROSTPEAK_WATER_LEVEL + 1.5) continue;
    if (isPointInPitBounds(pitBounds, cx, cy, cz, 16, 28)) continue;
    if (circuit.queryNearest(cx, cz).absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 10.5) {
      continue;
    }

    const w = 10.4 * sc;
    const h = 4.9 * sc;
    const d = 8.6 * sc;

    // Grounded stone foundation plinth extending below slope terrain
    const plinthCh = new THREE.BoxGeometry(w + 1.1, 3.6, d + 1.1);
    plinthCh.rotateY(cyaw);
    plinthCh.translate(cx, cy - 0.9, cz);
    chaletPlinthGeos.push(plinthCh);

    // Timber log cabin hall
    const wall = new THREE.BoxGeometry(w, h, d);
    wall.rotateY(cyaw);
    wall.translate(cx, cy + h * 0.5 + 0.35, cz);
    chaletWallGeos.push(wall);

    // Stone hearth chimney stack rising past roof ridge
    const chimX = Math.cos(cyaw) * (w * 0.28);
    const chimZ = -Math.sin(cyaw) * (w * 0.28);
    const chim = new THREE.BoxGeometry(1.15 * sc, h + 4.4 * sc, 1.15 * sc);
    chim.rotateY(cyaw);
    chim.translate(cx + chimX, cy + (h + 4.4 * sc) * 0.5, cz + chimZ);
    chaletPlinthGeos.push(chim);
    chimneyPositions.push(new THREE.Vector3(cx + chimX, cy + h + 4.5 * sc, cz + chimZ));

    // Snow-laden pitched gable pyramid roof
    const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.84, 4.5 * sc, 4);
    roof.rotateY(Math.PI * 0.25 + cyaw);
    roof.translate(cx, cy + h + 2.4 * sc, cz);
    chaletRoofGeos.push(roof);

    // Warm lit cabin window belt
    const win = new THREE.BoxGeometry(w * 0.72, 1.55 * sc, d + 0.18);
    win.rotateY(cyaw);
    win.translate(cx, cy + h * 0.56 + 0.35, cz);
    chaletWinGeos.push(win);

    worldColliders.addObb(
      cx,
      cz,
      w * 0.52,
      d * 0.52,
      Math.cos(cyaw),
      Math.sin(cyaw),
      'wood',
      cy - 2,
      cy + h + 4,
    );
  }

  // Summit Ski Lodge on leveled NE Knoll (255, -310)
  const lodgeX = 255;
  const lodgeZ = -310;
  const lodgeY = groundHeightAt(lodgeX, lodgeZ);
  if (circuit.queryNearest(lodgeX, lodgeZ).absDistance > circuit.roadHalfWidth + SHOULDER_WIDTH + 12) {
    const lodgePlinth = new THREE.BoxGeometry(28.5, 4.8, 18.2);
    lodgePlinth.translate(lodgeX, lodgeY - 1.1, lodgeZ);
    chaletPlinthGeos.push(lodgePlinth);

    const lodgeBase = new THREE.BoxGeometry(26, 7.5, 16);
    lodgeBase.translate(lodgeX, lodgeY + 4.1, lodgeZ);
    chaletWallGeos.push(lodgeBase);

    const lodgeRoof = new THREE.ConeGeometry(19.5, 7.0, 4);
    lodgeRoof.rotateY(Math.PI * 0.25);
    lodgeRoof.translate(lodgeX, lodgeY + 11.2, lodgeZ);
    chaletRoofGeos.push(lodgeRoof);

    const lodgeWin = new THREE.BoxGeometry(22.5, 3.2, 16.25);
    lodgeWin.translate(lodgeX, lodgeY + 5.1, lodgeZ);
    chaletWinGeos.push(lodgeWin);

    const lodgeChim = new THREE.BoxGeometry(2.2, 14.5, 2.2);
    lodgeChim.translate(lodgeX + 7.2, lodgeY + 7.2, lodgeZ - 3.0);
    chaletPlinthGeos.push(lodgeChim);
    chimneyPositions.push(new THREE.Vector3(lodgeX + 7.2, lodgeY + 14.6, lodgeZ - 3.0));

    worldColliders.addObb(lodgeX, lodgeZ, 14, 9, 1, 0, 'wood', lodgeY - 2, lodgeY + 14);
  }

  if (chaletPlinthGeos.length > 0) {
    const mP = trackGeo(BufferGeometryUtils.mergeGeometries(chaletPlinthGeos, false));
    chaletPlinthGeos.forEach((g) => g.dispose());
    const plinths = new THREE.Mesh(mP, stonePlinthMat);
    plinths.castShadow = true;
    plinths.receiveShadow = true;
    group.add(plinths);
  }
  if (chaletWallGeos.length > 0) {
    const mW = trackGeo(BufferGeometryUtils.mergeGeometries(chaletWallGeos, false));
    chaletWallGeos.forEach((g) => g.dispose());
    const walls = new THREE.Mesh(mW, timberMat);
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);
  }
  if (chaletRoofGeos.length > 0) {
    const mR = trackGeo(BufferGeometryUtils.mergeGeometries(chaletRoofGeos, false));
    chaletRoofGeos.forEach((g) => g.dispose());
    const roofs = new THREE.Mesh(mR, snowRoofMat);
    roofs.castShadow = true;
    roofs.receiveShadow = true;
    group.add(roofs);
  }
  if (chaletWinGeos.length > 0) {
    const mWin = trackGeo(BufferGeometryUtils.mergeGeometries(chaletWinGeos, false));
    chaletWinGeos.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mWin, warmWindowMat));
  }

  // Animated Instanced Chimney Smoke Plumes
  const smokePuffsPerChimney = 5;
  const smokeCount = chimneyPositions.length * smokePuffsPerChimney;
  const smokeGeo = trackGeo(new THREE.IcosahedronGeometry(0.65, 1));
  const smokeMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xe6eef6,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    }),
    false,
  );
  const smokeInst =
    smokeCount > 0 ? new THREE.InstancedMesh(smokeGeo, smokeMat, smokeCount) : null;
  if (smokeInst) {
    smokeInst.frustumCulled = false;
    group.add(smokeInst);
  }

  // ---------------------------------------------------------------------------
  // 4. ACTIVE SKI SLOPE SLALOM COURSE & MISTING FAN SNOW-MAKING CANNONS
  // ---------------------------------------------------------------------------
  const slalomRedMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.42 }),
  );
  const slalomBlueMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.42 }),
  );
  const cannonYellowMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.36, metalness: 0.35 }),
  );
  const gondolaTowerMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.42, metalness: 0.78 }),
  );

  // Choose the cleanest snow slope strip clear of roads, pit, and water
  let slalomStart: [number, number] = [-116, 52];
  let slalomDir: [number, number] = [-0.28, 0.96];
  const slalomCandidates: Array<{ start: [number, number]; dir: [number, number] }> = [
    { start: [-122, 46], dir: [-0.22, 0.97] },
    { start: [-222, -62], dir: [0.35, 0.93] },
    { start: [195, -245], dir: [-0.15, 0.98] },
    { start: [-190, 215], dir: [0.55, 0.83] },
  ];
  for (const cand of slalomCandidates) {
    let allClear = true;
    for (let g = 0; g < 7; g++) {
      const gx = cand.start[0] + cand.dir[0] * g * 13 + (g % 2 === 0 ? -4.2 : 4.2);
      const gz = cand.start[1] + cand.dir[1] * g * 13;
      const gy = groundHeightAt(gx, gz);
      if (gy < FROSTPEAK_WATER_LEVEL + 3.0) {
        allClear = false;
        break;
      }
      if (isPointInPitBounds(pitBounds, gx, gy, gz, 12, 16)) {
        allClear = false;
        break;
      }
      if (circuit.queryNearest(gx, gz).absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 9.0) {
        allClear = false;
        break;
      }
    }
    if (allClear) {
      slalomStart = cand.start;
      slalomDir = cand.dir;
      break;
    }
  }

  const redPoleGeos: THREE.BufferGeometry[] = [];
  const bluePoleGeos: THREE.BufferGeometry[] = [];
  const startY = groundHeightAt(slalomStart[0], slalomStart[1]);
  if (
    startY > FROSTPEAK_WATER_LEVEL + 2.5 &&
    circuit.queryNearest(slalomStart[0], slalomStart[1]).absDistance >
      circuit.roadHalfWidth + SHOULDER_WIDTH + 7.5
  ) {
    // Timber Ski Race Start Hut Arch
    const hutGroup = new THREE.Group();
    const hutYaw = Math.atan2(slalomDir[0], slalomDir[1]);
    hutGroup.position.set(slalomStart[0], startY, slalomStart[1]);
    hutGroup.rotation.y = hutYaw;
    const hBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.8, 3.6, 3.8)), timberMat);
    hBase.position.y = 1.6;
    hBase.castShadow = true;
    const hRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(5.6, 2.4, 4)), snowRoofMat);
    hRoof.rotation.y = Math.PI * 0.25;
    hRoof.position.y = 4.6;
    hRoof.castShadow = true;
    hutGroup.add(hBase, hRoof);
    group.add(hutGroup);
    worldColliders.addCircle(slalomStart[0], slalomStart[1], 3.4, 'wood', startY - 1, startY + 6);

    const perpX = -slalomDir[1];
    const perpZ = slalomDir[0];
    for (let g = 1; g <= 7; g++) {
      const sideSign = g % 2 === 0 ? 1 : -1;
      const cx = slalomStart[0] + slalomDir[0] * g * 12.5 + perpX * sideSign * 4.4;
      const cz = slalomStart[1] + slalomDir[1] * g * 12.5 + perpZ * sideSign * 4.4;
      const cy = groundHeightAt(cx, cz);
      if (cy < FROSTPEAK_WATER_LEVEL + 1.8) continue;
      if (circuit.queryNearest(cx, cz).absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 6.5) {
        continue;
      }

      for (const offset of [-1.2, 1.2]) {
        const px = cx + perpX * offset;
        const pz = cz + perpZ * offset;
        const py = groundHeightAt(px, pz);
        const pole = new THREE.CylinderGeometry(0.055, 0.055, 2.4, 6);
        pole.translate(px, py + 1.15, pz);
        if (g % 2 === 0) redPoleGeos.push(pole);
        else bluePoleGeos.push(pole);
      }
      const banner = new THREE.BoxGeometry(2.4, 0.65, 0.06);
      banner.rotateY(Math.atan2(slalomDir[0], slalomDir[1]));
      banner.translate(cx, cy + 1.85, cz);
      if (g % 2 === 0) redPoleGeos.push(banner);
      else bluePoleGeos.push(banner);
    }
  }
  if (redPoleGeos.length > 0) {
    const mRed = trackGeo(BufferGeometryUtils.mergeGeometries(redPoleGeos, false));
    redPoleGeos.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mRed, slalomRedMat));
  }
  if (bluePoleGeos.length > 0) {
    const mBlue = trackGeo(BufferGeometryUtils.mergeGeometries(bluePoleGeos, false));
    bluePoleGeos.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mBlue, slalomBlueMat));
  }

  // 5 Fan-Driven Snow-Making Cannons with Animated Billowing Snow Plumes
  const cannonTripodGeos: THREE.BufferGeometry[] = [];
  const cannonBarrelGeos: THREE.BufferGeometry[] = [];
  const snowPlumeGeos: THREE.BufferGeometry[] = [];
  const cannonNozzles: Array<{ pos: THREE.Vector3; dirX: number; dirZ: number }> = [];

  const cannonCoords: Array<[number, number, number]> = [
    [-152, 92, 0.45],
    [-162, 128, 0.15],
    [-136, 152, -0.4],
    [240, -295, 2.4],
    [-34, 108, 1.2],
  ];
  for (const [cx, cz, yaw] of cannonCoords) {
    const cy = groundHeightAt(cx, cz);
    if (cy < FROSTPEAK_WATER_LEVEL + 1.5) continue;
    if (circuit.queryNearest(cx, cz).absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 6.0) {
      continue;
    }
    const leg = new THREE.CylinderGeometry(0.18, 0.65, 1.45, 5);
    leg.translate(cx, cy + 0.7, cz);
    cannonTripodGeos.push(leg);

    const barrel = new THREE.CylinderGeometry(0.42, 0.54, 1.95, 10);
    barrel.rotateX(Math.PI * 0.36);
    barrel.rotateY(yaw);
    barrel.translate(cx, cy + 1.75, cz);
    cannonBarrelGeos.push(barrel);

    const dx = Math.sin(yaw);
    const dz = Math.cos(yaw);
    cannonNozzles.push({ pos: new THREE.Vector3(cx + dx * 1.1, cy + 2.35, cz + dz * 1.1), dirX: dx, dirZ: dz });

    const plume = new THREE.ConeGeometry(2.6, 11.5, 8, 1, true);
    plume.translate(0, -5.75, 0);
    plume.rotateX(-Math.PI * 0.34);
    plume.rotateY(yaw);
    plume.translate(cx + dx * 1.0, cy + 2.25, cz + dz * 1.0);
    snowPlumeGeos.push(plume);
  }
  if (cannonTripodGeos.length > 0) {
    const mCT = trackGeo(BufferGeometryUtils.mergeGeometries(cannonTripodGeos, false));
    cannonTripodGeos.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mCT, gondolaTowerMat));
  }
  if (cannonBarrelGeos.length > 0) {
    const mCB = trackGeo(BufferGeometryUtils.mergeGeometries(cannonBarrelGeos, false));
    cannonBarrelGeos.forEach((g) => g.dispose());
    const cbMesh = new THREE.Mesh(mCB, cannonYellowMat);
    cbMesh.castShadow = true;
    group.add(cbMesh);
  }
  const snowMistConeMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xf4f9ff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    false,
  );
  if (snowPlumeGeos.length > 0) {
    const mSP = trackGeo(BufferGeometryUtils.mergeGeometries(snowPlumeGeos, false));
    snowPlumeGeos.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mSP, snowMistConeMat));
  }

  // ---------------------------------------------------------------------------
  // 5. OVERHEAD ALPINE GONDOLA CABLEWAY, BASE/SUMMIT TERMINALS & MOVING CABINS
  // ---------------------------------------------------------------------------
  const cableMat = trackMat(
    new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.85 }),
    false,
  );
  const cabinBodyMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xe11d48,
      roughness: 0.22,
      metalness: 0.18,
      clearcoat: 0.85,
    }),
  );

  const gondolaNodesXZ: Array<[number, number]> = [
    [-175, 138],
    [-178, 28],
    [-182, -88],
    [-192, -198],
    [-205, -305],
  ];
  const gondolaTopPts: THREE.Vector3[] = [];
  const towerGeos: THREE.BufferGeometry[] = [];

  for (let idx = 0; idx < gondolaNodesXZ.length; idx++) {
    const [tx, tz] = gondolaNodesXZ[idx];
    const ty = groundHeightAt(tx, tz);
    const towerH = 38.0;
    const mast = new THREE.CylinderGeometry(0.42, 0.82, towerH, 8);
    mast.translate(tx, ty + towerH * 0.5 - 0.5, tz);
    towerGeos.push(mast);

    const crossArm = new THREE.BoxGeometry(6.8, 0.55, 0.65);
    crossArm.translate(tx, ty + towerH - 0.6, tz);
    towerGeos.push(crossArm);

    gondolaTopPts.push(new THREE.Vector3(tx, ty + towerH - 0.6, tz));

    if (circuit.queryNearest(tx, tz).absDistance > circuit.roadHalfWidth + SHOULDER_WIDTH + 4.5) {
      worldColliders.addCircle(tx, tz, 1.0, 'metal', ty - 2, ty + 14);
    }

    // Gondola Base & Summit Boarding Terminal Stations at first & last node
    if (idx === 0 || idx === gondolaNodesXZ.length - 1) {
      if (circuit.queryNearest(tx, tz).absDistance > circuit.roadHalfWidth + SHOULDER_WIDTH + 9.0) {
        const stGroup = new THREE.Group();
        stGroup.position.set(tx, ty, tz);
        const stDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.5, 4.0, 14.5)), concreteMat);
        stDeck.position.y = 0.8;
        stDeck.castShadow = true;
        stDeck.receiveShadow = true;
        const stHall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10.5, 4.6, 12.0)), timberMat);
        stHall.position.y = 4.6;
        stHall.castShadow = true;
        const stRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(9.6, 3.2, 4)), snowRoofMat);
        stRoof.rotation.y = Math.PI * 0.25;
        stRoof.position.y = 8.4;
        stGroup.add(stDeck, stHall, stRoof);
        group.add(stGroup);
        worldColliders.addObb(tx, tz, 6.4, 7.4, 1, 0, 'concrete', ty - 2, ty + 10);
      }
    }
  }

  if (towerGeos.length > 0) {
    const tm = trackGeo(BufferGeometryUtils.mergeGeometries(towerGeos, false));
    towerGeos.forEach((g) => g.dispose());
    const tMesh = new THREE.Mesh(tm, gondolaTowerMat);
    tMesh.castShadow = true;
    group.add(tMesh);
  }

  const cableCurve = new THREE.CatmullRomCurve3(gondolaTopPts, false, 'catmullrom', 0.35);
  for (const sideOffset of [-2.9, 2.9]) {
    const cablePts: THREE.Vector3[] = [];
    for (let i = 0; i <= 72; i++) {
      const p = cableCurve.getPointAt(i / 72);
      const spanFrac = (i % 18) / 18;
      const sag = Math.sin(spanFrac * Math.PI) * 1.8;
      cablePts.push(new THREE.Vector3(p.x + sideOffset, p.y - sag, p.z));
    }
    const cGeo = trackGeo(new THREE.BufferGeometry().setFromPoints(cablePts));
    group.add(new THREE.Line(cGeo, cableMat));
  }

  const cabinHangerGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6));
  const cabinBoxGeo = trackGeo(new THREE.BoxGeometry(2.4, 2.3, 2.6));
  const cabinGlassGeo = trackGeo(new THREE.BoxGeometry(2.46, 1.05, 2.66));

  const gondolaCabins: Array<{ group: THREE.Group; phase: number; laneOffset: number }> = [];
  for (let c = 0; c < 6; c++) {
    const cg = new THREE.Group();
    const hanger = new THREE.Mesh(cabinHangerGeo, gondolaTowerMat);
    hanger.position.y = -1.1;
    cg.add(hanger);

    const body = new THREE.Mesh(cabinBoxGeo, cabinBodyMat);
    body.position.y = -3.1;
    body.castShadow = true;
    cg.add(body);

    const win = new THREE.Mesh(cabinGlassGeo, warmWindowMat);
    win.position.y = -2.8;
    cg.add(win);

    group.add(cg);
    gondolaCabins.push({
      group: cg,
      phase: c / 6,
      laneOffset: c % 2 === 0 ? -2.9 : 2.9,
    });
  }

  // ---------------------------------------------------------------------------
  // 6. SNOWPLOWED TRACKSIDE WOODEN SNOW-DRIFT FENCES ON HIGH PASSES
  // ---------------------------------------------------------------------------
  const snowFenceGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < N; i += 10) {
    const s = samples[i];
    if (s.isBridge || s.position.y < 32.0) continue;
    const outSide = s.curvature >= 0 ? 1 : -1;
    const lat = outSide * (circuit.roadHalfWidth + SHOULDER_WIDTH + 3.2);
    const fx = s.position.x + s.right.x * lat;
    const fz = s.position.z + s.right.z * lat;
    const fy = groundHeightAt(fx, fz);
    if (fy < FROSTPEAK_WATER_LEVEL + 2.0) continue;
    if (isPointInPitBounds(pitBounds, fx, fy, fz, 10, 14)) continue;
    if (circuit.queryNearest(fx, fz).absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 2.5) {
      continue;
    }

    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const post = new THREE.BoxGeometry(0.14, 1.45, 0.14);
    post.rotateY(yaw);
    post.translate(fx, fy + 0.65, fz);
    snowFenceGeos.push(post);

    const slatA = new THREE.BoxGeometry(0.08, 0.22, 4.4);
    slatA.rotateY(yaw);
    slatA.translate(fx, fy + 0.55, fz);
    snowFenceGeos.push(slatA);

    const slatB = new THREE.BoxGeometry(0.08, 0.22, 4.4);
    slatB.rotateY(yaw);
    slatB.translate(fx, fy + 1.05, fz);
    snowFenceGeos.push(slatB);
  }
  if (snowFenceGeos.length > 0) {
    const mSF = trackGeo(BufferGeometryUtils.mergeGeometries(snowFenceGeos, false));
    snowFenceGeos.forEach((g) => g.dispose());
    const sfMesh = new THREE.Mesh(mSF, timberMat);
    sfMesh.castShadow = true;
    group.add(sfMesh);
  }

  // Animated Snow-Cannon Spray Plumes (zero-GC)
  const cannonMistPuffs = 4;
  const cannonMistCount = cannonNozzles.length * cannonMistPuffs;
  const cannonMistInst =
    cannonMistCount > 0 ? new THREE.InstancedMesh(smokeGeo, snowMistConeMat, cannonMistCount) : null;
  if (cannonMistInst) {
    cannonMistInst.frustumCulled = false;
    group.add(cannonMistInst);
  }

  // GPU Wind-Driven Alpine Ridge-Crest Spindrift Snow Crystals
  const spindriftCount = 650;
  const spindriftPos = new Float32Array(spindriftCount * 3);
  const spindriftPhase = new Float32Array(spindriftCount);
  let sdIdx = 0;
  let sdAttempts = 0;
  while (sdIdx < spindriftCount && sdAttempts < 4200) {
    sdAttempts++;
    const sx = (rand() - 0.5) * 920;
    const sz = (rand() - 0.5) * 880;
    const sy = groundHeightAt(sx, sz);
    if (sy < FROSTPEAK_WATER_LEVEL + 14.0) continue;
    spindriftPos[sdIdx * 3] = sx;
    spindriftPos[sdIdx * 3 + 1] = sy + 0.6 + rand() * 8.5;
    spindriftPos[sdIdx * 3 + 2] = sz;
    spindriftPhase[sdIdx] = rand() * 6.2831;
    sdIdx++;
  }
  const spindriftGeo = trackGeo(new THREE.BufferGeometry());
  spindriftGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(spindriftPos.subarray(0, sdIdx * 3), 3),
  );
  spindriftGeo.setAttribute(
    'aPhase',
    new THREE.BufferAttribute(spindriftPhase.subarray(0, sdIdx), 1),
  );
  const spindriftMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: sharedWeather.uTime,
        uWindSpeed: sharedWeather.uWindSpeed,
        uWindDir: sharedWeather.uWindDir,
        uOpacity: { value: 0.48 },
      },
      vertexShader: `
        attribute float aPhase;
        uniform float uTime;
        uniform float uWindSpeed;
        uniform vec2 uWindDir;
        varying float vAlpha;
        void main() {
          float drift = mod(uTime * (6.5 + uWindSpeed * 4.5) + aPhase * 12.0, 44.0) - 22.0;
          vec3 p = position;
          p.x += uWindDir.x * drift;
          p.z += uWindDir.y * drift;
          p.y += sin(uTime * 2.1 + aPhase * 3.0) * 1.15;
          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPos;
          gl_PointSize = clamp(160.0 / max(8.0, -mvPos.z), 1.5, 4.5);
          float edgeFade = 1.0 - abs(drift) / 22.0;
          vAlpha = smoothstep(0.0, 0.25, edgeFade) * smoothstep(320.0, 90.0, -mvPos.z);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c);
          if (d > 0.25) discard;
          float soft = smoothstep(0.25, 0.02, d);
          gl_FragColor = vec4(0.92, 0.96, 1.0, soft * vAlpha * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
    }),
    false,
  );
  if (sdIdx > 0) {
    const spindriftPts = new THREE.Points(spindriftGeo, spindriftMat);
    spindriftPts.frustumCulled = false;
    group.add(spindriftPts);
  }

  // Zero-allocation animation loop helpers
  const _cabinPosScratch = new THREE.Vector3();
  const _smokeDummy = new THREE.Object3D();

  const updateGondolas = (elapsedSec: number) => {
    for (let i = 0; i < gondolaCabins.length; i++) {
      const cb = gondolaCabins[i];
      const raw = (elapsedSec * 0.025 + cb.phase) % 1;
      const u = cb.laneOffset < 0 ? raw : 1 - raw;
      cableCurve.getPointAt(u, _cabinPosScratch);
      cb.group.position.set(_cabinPosScratch.x + cb.laneOffset, _cabinPosScratch.y, _cabinPosScratch.z);
    }
  };

  const updateChimneySmoke = (elapsedSec: number) => {
    if (smokeInst && chimneyPositions.length > 0) {
      const wx = sharedWeather.uWindDir.value.x * (0.8 + sharedWeather.uWindSpeed.value * 1.4);
      const wz = sharedWeather.uWindDir.value.y * (0.8 + sharedWeather.uWindSpeed.value * 1.4);
      let idx = 0;
      for (let c = 0; c < chimneyPositions.length; c++) {
        const base = chimneyPositions[c];
        for (let p = 0; p < smokePuffsPerChimney; p++) {
          const life = (elapsedSec * 0.24 + c * 0.17 + p / smokePuffsPerChimney) % 1;
          const px = base.x + wx * life * 6.5 + Math.sin(elapsedSec * 1.4 + p + c) * 0.45 * life;
          const py = base.y + life * 9.8;
          const pz = base.z + wz * life * 6.5 + Math.cos(elapsedSec * 1.2 + p) * 0.45 * life;
          const s = 0.55 + life * 2.1;
          _smokeDummy.position.set(px, py, pz);
          _smokeDummy.rotation.set(life * 1.8, life * 2.4, 0);
          _smokeDummy.scale.setScalar(s);
          _smokeDummy.updateMatrix();
          smokeInst.setMatrixAt(idx++, _smokeDummy.matrix);
        }
      }
      smokeInst.instanceMatrix.needsUpdate = true;
    }

    if (cannonMistInst && cannonNozzles.length > 0) {
      let idx = 0;
      for (let nIdx = 0; nIdx < cannonNozzles.length; nIdx++) {
        const noz = cannonNozzles[nIdx];
        for (let p = 0; p < cannonMistPuffs; p++) {
          const life = (elapsedSec * 0.65 + nIdx * 0.21 + p / cannonMistPuffs) % 1;
          const px = noz.pos.x + noz.dirX * life * 9.5;
          const py = noz.pos.y + life * 3.8 - life * life * 2.1;
          const pz = noz.pos.z + noz.dirZ * life * 9.5;
          const s = 0.75 + life * 2.8;
          _smokeDummy.position.set(px, py, pz);
          _smokeDummy.rotation.set(life * 2.2, nIdx + life * 1.5, 0);
          _smokeDummy.scale.setScalar(s);
          _smokeDummy.updateMatrix();
          cannonMistInst.setMatrixAt(idx++, _smokeDummy.matrix);
        }
      }
      cannonMistInst.instanceMatrix.needsUpdate = true;
    }
  };

  updateGondolas(0);
  updateChimneySmoke(0);

  const cornerFanZones = buildCornerFanZoneRigs(
    group,
    sharedWeather,
    FROSTPEAK_WATER_LEVEL,
    'frostpeak_pass',
  );
  const defaultCrowdInput: CrowdTelemetryInput = {
    closestRivalGapSec: null,
    speedMps: 0,
    playerDistToGrandstand: 500,
    isFinalLap: false,
    isRacing: false,
    isPodium: false,
    isFinished: false,
    isCloseFinish: false,
    positionChangedPulse: 0,
    reactivityScale: 1,
    densityScale: 1,
  };

  return {
    group,
    update: (elapsedSec: number, deltaSec = 0.016, crowdInput?: CrowdTelemetryInput) => {
      const ci = crowdInput ?? defaultCrowdInput;
      sharedPitAddon.update(elapsedSec, deltaSec, ci);
      cornerFanZones.update(deltaSec, elapsedSec, ci);
      updateGondolas(elapsedSec);
      updateChimneySmoke(elapsedSec);
    },
    setNightFactor: (nightFactor: number) => {
      sharedPitAddon.setNightFactor(nightFactor);
      cornerFanZones.setNightFactor(nightFactor);
      glassHospitalityMat.emissiveIntensity = 0.34 + nightFactor * 2.0;
      warmWindowMat.emissiveIntensity = 0.56 + nightFactor * 2.85;
      lineMat.emissiveIntensity = 0.18 + nightFactor * 1.45;
      boxMat.emissiveIntensity = 0.25 + nightFactor * 1.65;
      glacialIceMat.emissiveIntensity = 0.12 + nightFactor * 0.52;
      const showPl = nightFactor > 0.01;
      archIceLight.intensity = nightFactor * 4.2;
      archIceLight.visible = showPl;
      spindriftMat.uniforms.uOpacity.value = 0.48 - nightFactor * 0.16;
    },
    setWireframe: (wire: boolean) => {
      sharedPitAddon.setWireframe(wire);
      cornerFanZones.setWireframe(wire);
      for (const m of wireMats) {
        if ('wireframe' in m) {
          (m as THREE.MeshStandardMaterial).wireframe = wire;
        }
      }
    },
    getGrandstandWorldPos: () => sharedPitAddon.getGrandstandWorldPos(),
    dispose: () => {
      sharedPitAddon.dispose();
      cornerFanZones.dispose();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}

/**
 * Frostpeak Glacier Props & Ultra-Dense Alpine Winter Ecosystem:
 * 1. Full Shared FIA Broadcast Kit (Composite S/F Gantry, 5 Marshal Towers + Wind Flags,
 *    Tire Barrier Stacks, Pooled Braking Boards x2, Chevrons, Speed Traps, Streetlamps & Floodlights)
 * 2. ~680 Norway Spruces + ~340 Frosted Alpine Pines (Lathe + 6-limb trunk, scalloped drooping
 *    needle boughs with snow mantle shader, coniferNeedle PBR maps, wind sway)
 * 3. ~200 Windswept Timberline Krummholz Pines on steep ridges
 * 4. ~1,450 Frosted Alpine Juniper Shrubs + ~550 Frozen Sedge Tufts
 * 5. ~360 Jagged Granite Cliff Monoliths + ~180 Faceted Translucent Cyan-Blue Glacier Ice Seracs
 */
export function buildFrostpeakPropsAndFoliageRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): PropsAndFoliageRig {
  const group = new THREE.Group();
  group.name = 'FrostpeakPropsAndFoliageRig';

  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };

  const circuit = getCircuitData();
  const samples = circuit.samples;
  const N = samples.length;
  const roadHalf = circuit.roadHalfWidth;
  const rand = createSeededRandom(39107);

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };

  // 1. Attach full FIA Trackside Broadcast Kit
  const tracksideInfra = buildSharedTracksideInfra(
    group,
    textures,
    sharedWeather,
    'frostpeak_pass',
    FROSTPEAK_WATER_LEVEL,
  );

  const scaledRegistry: Array<{
    mesh: THREE.InstancedMesh;
    fullCount: number;
    allowsShadow: boolean;
  }> = [];

  // 4x4 spatial cell grid (~260m cells) so distant winter flora, rocks & seracs cull cleanly
  const FP_CELL_DIM = 4;
  const FP_HALF_SPAN = 520;
  const FP_CELL_SIZE = (FP_HALF_SPAN * 2) / FP_CELL_DIM;
  const FP_CELL_HALF_DIAG = FP_CELL_SIZE * 0.72;
  const fpCells: Array<{ group: THREE.Group; cx: number; cz: number }> = [];
  for (let czIdx = 0; czIdx < FP_CELL_DIM; czIdx++) {
    for (let cxIdx = 0; cxIdx < FP_CELL_DIM; cxIdx++) {
      const cg = new THREE.Group();
      cg.name = `FrostpeakPropCell_${cxIdx}_${czIdx}`;
      group.add(cg);
      fpCells.push({
        group: cg,
        cx: -FP_HALF_SPAN + (cxIdx + 0.5) * FP_CELL_SIZE,
        cz: -FP_HALF_SPAN + (czIdx + 0.5) * FP_CELL_SIZE,
      });
    }
  }
  const getFpCellIndex = (x: number, z: number): number => {
    const cx = Math.max(0, Math.min(FP_CELL_DIM - 1, Math.floor((x + FP_HALF_SPAN) / FP_CELL_SIZE)));
    const cz = Math.max(0, Math.min(FP_CELL_DIM - 1, Math.floor((z + FP_HALF_SPAN) / FP_CELL_SIZE)));
    return cz * FP_CELL_DIM + cx;
  };
  const bucketInstancedIntoCells = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    matrices: THREE.Matrix4[],
    colors: THREE.Color[] | null,
    castShadow: boolean,
    receiveShadow: boolean,
  ) => {
    if (matrices.length === 0) return;
    const perCellM: THREE.Matrix4[][] = Array.from({ length: fpCells.length }, () => []);
    const perCellC: THREE.Color[][] = Array.from({ length: fpCells.length }, () => []);
    for (let i = 0; i < matrices.length; i++) {
      const m = matrices[i];
      const ci = getFpCellIndex(m.elements[12], m.elements[14]);
      perCellM[ci].push(m);
      if (colors) perCellC[ci].push(colors[i]);
    }
    for (let ci = 0; ci < fpCells.length; ci++) {
      const bm = perCellM[ci];
      if (bm.length === 0) continue;
      const inst = new THREE.InstancedMesh(geo, mat, bm.length);
      for (let i = 0; i < bm.length; i++) {
        inst.setMatrixAt(i, bm[i]);
        if (colors) inst.setColorAt(i, perCellC[ci][i]);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = castShadow;
      inst.receiveShadow = receiveShadow;
      fpCells[ci].group.add(inst);
      scaledRegistry.push({ mesh: inst, fullCount: bm.length, allowsShadow: castShadow });
    }
  };

  const gondolaCorridorClear = (wx: number, wz: number): boolean => {
    // Keep clear of the western overhead Gondola cableway corridor & terminals
    if (wx > -220 && wx < -160 && wz > -320 && wz < 150) return false;
    // Keep clear of Summit Lodge terrace (255, -310)
    if (Math.hypot(wx - 255, wz + 310) < 24) return false;
    return true;
  };

  const isClearForWinterFlora = (wx: number, wz: number, extraRoadMargin = 4.6): boolean => {
    if (!gondolaCorridorClear(wx, wz)) return false;
    if (Math.hypot(wx - 29, wz - 64) < 34.0) return false; // Meltwater icefall canyon & plunge pool
    if (wx > -85 && wx < 55 && wz > -315 && wz < -272) return false; // Opposite main grandstand pad
    const h = groundHeightAt(wx, wz);
    if (h < FROSTPEAK_WATER_LEVEL + 1.45 || h > 96) return false;
    if (isPointInPitBounds(circuit.pitLaneBounds, wx, h, wz, 14, 28)) return false;
    const q = circuit.queryNearest(wx, wz);
    const minDist = q.isBridge ? 18.0 : roadHalf + SHOULDER_WIDTH + extraRoadMargin;
    if (q.absDistance < minDist) return false;
    return true;
  };

  const dummy = new THREE.Object3D();

  // ---------------------------------------------------------------------------
  // 2. LATHE + 6-LIMB TRUNK & SCALLOPED SNOW-MANTLED ALPINE CONIFERS
  // ---------------------------------------------------------------------------
  const barkParts: THREE.BufferGeometry[] = [];
  const trunkProfile = [
    new THREE.Vector2(0.54, 0.0),
    new THREE.Vector2(0.39, 0.48),
    new THREE.Vector2(0.28, 1.35),
    new THREE.Vector2(0.21, 2.95),
    new THREE.Vector2(0.14, 4.9),
    new THREE.Vector2(0.06, 6.4),
  ];
  barkParts.push(new THREE.LatheGeometry(trunkProfile, 9));
  for (let br = 0; br < 6; br++) {
    const yaw = br * 1.047 + (br % 2) * 0.25;
    const by = 2.6 + (br % 3) * 1.15;
    const branchLen = 1.45 - (br % 3) * 0.22;
    const limb = new THREE.CylinderGeometry(0.032, 0.085, branchLen, 6);
    limb.translate(0, branchLen * 0.5, 0);
    limb.rotateZ(1.12);
    limb.rotateY(yaw);
    limb.translate(0, by, 0);
    barkParts.push(limb);
  }
  const coniferTrunkGeo = trackGeo(BufferGeometryUtils.mergeGeometries(barkParts, false));
  barkParts.forEach((g) => g.dispose());

  // Krummholz gnarly trunk
  const krummTrunkParts: THREE.BufferGeometry[] = [];
  const kSeg1 = new THREE.CylinderGeometry(0.17, 0.27, 1.45, 7);
  kSeg1.translate(0, 0.72, 0);
  kSeg1.rotateZ(-0.22);
  krummTrunkParts.push(kSeg1);
  const kSeg2 = new THREE.CylinderGeometry(0.1, 0.17, 1.4, 7);
  kSeg2.translate(0, 0.7, 0);
  kSeg2.rotateZ(-0.56);
  kSeg2.translate(0.3, 1.32, 0.04);
  krummTrunkParts.push(kSeg2);
  const kSeg3 = new THREE.CylinderGeometry(0.045, 0.1, 1.25, 6);
  kSeg3.translate(0, 0.62, 0);
  kSeg3.rotateZ(-0.82);
  kSeg3.translate(0.98, 2.38, 0.06);
  krummTrunkParts.push(kSeg3);
  const krummholzTrunkGeo = trackGeo(BufferGeometryUtils.mergeGeometries(krummTrunkParts, false));
  krummTrunkParts.forEach((g) => g.dispose());

  const trunkMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.barkAlbedo,
      normalMap: textures.barkNormal,
      normalScale: new THREE.Vector2(1.15, 1.15),
      color: 0xd4c6b8,
      roughness: 0.94,
      metalness: 0.0,
    }),
  );

  const scaleGeometryUvs = (g: THREE.BufferGeometry, su: number, sv: number) => {
    const uvAttr = g.attributes.uv as THREE.BufferAttribute | undefined;
    if (!uvAttr) return;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * su, uvAttr.getY(i) * sv);
    }
  };

  const makeNeedleBoughFan = (
    rad: number,
    height: number,
    segs: number,
    seedOff: number,
    droopFactor = 0.36,
  ) => {
    const g = new THREE.ConeGeometry(rad, height, segs, 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const vx = pos.getX(v);
      const vy = pos.getY(v);
      const vz = pos.getZ(v);
      const rDist = Math.hypot(vx, vz);
      const ang = Math.atan2(vz, vx);
      const scallop = 1.0 + 0.22 * Math.sin(ang * 5.0 + seedOff) + 0.12 * Math.cos(ang * 9.0 - seedOff);
      const droop = rDist > 0.1 ? -Math.pow(rDist / rad, 1.4) * height * droopFactor : 0;
      pos.setXYZ(v, vx * scallop, vy + droop, vz * scallop);
    }
    scaleGeometryUvs(g, 2.4, 2.0);
    g.computeVertexNormals();
    return g;
  };

  // Species 1: Heavy Snow-Laden Norway Spruce (~680)
  const spruceParts: THREE.BufferGeometry[] = [];
  const spruceTiers = [
    { y: 2.35, rad: 1.56, h: 1.8, n: 5, offsetR: 0.54 },
    { y: 3.65, rad: 1.4, h: 1.68, n: 5, offsetR: 0.45 },
    { y: 4.95, rad: 1.22, h: 1.58, n: 4, offsetR: 0.36 },
    { y: 6.25, rad: 1.02, h: 1.48, n: 4, offsetR: 0.26 },
    { y: 7.5, rad: 0.8, h: 1.38, n: 3, offsetR: 0.18 },
    { y: 8.65, rad: 0.58, h: 1.32, n: 3, offsetR: 0.1 },
  ];
  let sSeed = 3.1;
  for (let tIdx = 0; tIdx < spruceTiers.length; tIdx++) {
    const tier = spruceTiers[tIdx];
    for (let k = 0; k < tier.n; k++) {
      sSeed += 1.23;
      const ang = (k / tier.n) * Math.PI * 2 + tIdx * 0.58;
      const fan = makeNeedleBoughFan(tier.rad, tier.h, 8, sSeed, 0.48);
      fan.rotateZ(-0.24);
      fan.rotateY(ang);
      fan.translate(
        Math.cos(ang) * tier.offsetR,
        tier.y + (k % 2) * 0.14,
        Math.sin(ang) * tier.offsetR,
      );
      spruceParts.push(fan);
    }
  }
  const spruceSpire = makeNeedleBoughFan(0.64, 2.5, 8, 12.7, 0.32);
  spruceSpire.translate(0, 9.85, 0);
  spruceParts.push(spruceSpire);
  const spruceCanopyGeo = trackGeo(BufferGeometryUtils.mergeGeometries(spruceParts, false));
  spruceParts.forEach((g) => g.dispose());

  // Species 2: Frosted Alpine Pine (~340)
  const pineParts: THREE.BufferGeometry[] = [];
  const pineTiers = [
    { y: 3.15, rad: 1.58, h: 1.48, n: 5, offsetR: 0.72 },
    { y: 4.35, rad: 1.4, h: 1.38, n: 4, offsetR: 0.56 },
    { y: 5.55, rad: 1.18, h: 1.28, n: 4, offsetR: 0.42 },
    { y: 6.7, rad: 0.94, h: 1.18, n: 3, offsetR: 0.28 },
    { y: 7.75, rad: 0.7, h: 1.15, n: 2, offsetR: 0.14 },
  ];
  let pSeed = 0;
  for (let tIdx = 0; tIdx < pineTiers.length; tIdx++) {
    const tier = pineTiers[tIdx];
    for (let k = 0; k < tier.n; k++) {
      pSeed += 1.37;
      const ang = (k / tier.n) * Math.PI * 2 + tIdx * 0.65;
      const fan = makeNeedleBoughFan(tier.rad, tier.h, 8, pSeed, 0.34);
      fan.rotateZ(-0.15);
      fan.rotateY(ang);
      fan.translate(
        Math.cos(ang) * tier.offsetR,
        tier.y + (k % 2) * 0.16,
        Math.sin(ang) * tier.offsetR,
      );
      pineParts.push(fan);
    }
  }
  const leaderCrown = makeNeedleBoughFan(0.76, 2.05, 8, 9.1);
  leaderCrown.translate(0, 8.8, 0);
  pineParts.push(leaderCrown);
  const pineCanopyGeo = trackGeo(BufferGeometryUtils.mergeGeometries(pineParts, false));
  pineParts.forEach((g) => g.dispose());

  // Species 3: Windswept Timberline Krummholz Pines (~200)
  const krummParts: THREE.BufferGeometry[] = [];
  const krummPads = [
    { x: 0.65, y: 1.75, z: -0.25, rad: 0.95, h: 0.88, tilt: -0.28 },
    { x: 1.05, y: 2.32, z: 0.28, rad: 0.88, h: 0.84, tilt: -0.34 },
    { x: 1.55, y: 2.82, z: -0.08, rad: 0.78, h: 0.8, tilt: -0.42 },
    { x: 2.05, y: 3.18, z: 0.12, rad: 0.62, h: 0.72, tilt: -0.48 },
    { x: 0.25, y: 1.45, z: 0.35, rad: 0.72, h: 0.68, tilt: -0.18 },
  ];
  for (let kp = 0; kp < krummPads.length; kp++) {
    const pad = krummPads[kp];
    const fan = makeNeedleBoughFan(pad.rad, pad.h, 7, 4.2 + kp * 1.7, 0.24);
    fan.rotateZ(pad.tilt);
    fan.rotateY(kp * 0.7);
    fan.translate(pad.x, pad.y, pad.z);
    krummParts.push(fan);
  }
  const krummholzCanopyGeo = trackGeo(BufferGeometryUtils.mergeGeometries(krummParts, false));
  krummParts.forEach((g) => g.dispose());

  const snowFoliageMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.coniferNeedleAlbedo,
      normalMap: textures.coniferNeedleNormal,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughnessMap: textures.coniferNeedleRoughness,
      roughness: 0.92,
      metalness: 0.02,
      color: 0xffffff,
    }),
  );
  snowFoliageMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSnowLocalNorm;
        varying float vSnowBoughY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSnowLocalNorm = normalize(normal);
        vSnowBoughY = position.y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vSnowLocalNorm;
        varying float vSnowBoughY;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        // Heavy alpine snow mantle resting on upward-facing conifer needle tiers
        float snowWeight = smoothstep(0.06, 0.56, vSnowLocalNorm.y) * smoothstep(1.4, 3.2, vSnowBoughY);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 1.0), snowWeight * 0.90);`,
      );
  };
  snowFoliageMat.customProgramCacheKey = () => 'frostpeak-snow-conifer-pbr-static-v4';

  const spruceTransforms: THREE.Matrix4[] = [];
  const spruceColors: THREE.Color[] = [];
  const pineTransforms: THREE.Matrix4[] = [];
  const pineColors: THREE.Color[] = [];
  const krummTransforms: THREE.Matrix4[] = [];
  const krummColors: THREE.Color[] = [];

  // Roadside scenic conifer line first, then dense mountain forest groves
  for (let i = 0; i < N; i += 4) {
    const s = samples[i];
    if (s.isBridge) continue;
    for (const side of [-1, 1] as const) {
      if (rand() < 0.14) continue;
      const lat = side * (roadHalf + SHOULDER_WIDTH + 5.4 + rand() * 19);
      const px = s.position.x + s.right.x * lat + (rand() - 0.5) * 3.2;
      const pz = s.position.z + s.right.z * lat + (rand() - 0.5) * 3.2;
      if (!isClearForWinterFlora(px, pz, 4.4)) continue;
      const py = groundHeightAt(px, pz);
      const n = groundNormalAt(px, pz, 1.4);
      if (n.y < 0.62) continue;

      const sc = 0.84 + rand() * 0.54;
      dummy.position.set(px, py - 0.25, pz);
      dummy.rotation.set((rand() - 0.5) * 0.08, rand() * Math.PI * 2, (rand() - 0.5) * 0.08);
      dummy.scale.set(sc, sc * (0.9 + rand() * 0.28), sc);
      dummy.updateMatrix();
      const mat = dummy.matrix.clone();
      worldColliders.addCircle(px, pz, 0.48 * sc, 'wood', py - 1.5, py + 9.0);

      if (py > 46 && rand() < 0.45) {
        krummTransforms.push(mat);
        krummColors.push(new THREE.Color().setHSL(0.41 + rand() * 0.04, 0.34, 0.26 + rand() * 0.08));
      } else if (rand() < 0.66) {
        spruceTransforms.push(mat);
        spruceColors.push(new THREE.Color().setHSL(0.42 + rand() * 0.04, 0.38, 0.22 + rand() * 0.08));
      } else {
        pineTransforms.push(mat);
        pineColors.push(new THREE.Color().setHSL(0.39 + rand() * 0.05, 0.36, 0.25 + rand() * 0.08));
      }
    }
  }

  let fAttempts = 0;
  while (
    spruceTransforms.length + pineTransforms.length + krummTransforms.length < 4800 &&
    fAttempts < 52000
  ) {
    fAttempts++;
    const px = (rand() - 0.5) * 960;
    const pz = (rand() - 0.5) * 920;
    if (!isClearForWinterFlora(px, pz, 4.8)) continue;
    const py = groundHeightAt(px, pz);
    const n = groundNormalAt(px, pz, 1.5);
    if (n.y < (py > 52 ? 0.54 : 0.60)) continue;

    const grove = fbm2D(px * 0.008, pz * 0.008, 3, 2.0, 0.5, 613);
    if (rand() > 0.66 + grove * 0.34) continue;

    const sc = 0.82 + rand() * 0.62;
    dummy.position.set(px, py - 0.26, pz);
    dummy.rotation.set((rand() - 0.5) * 0.08, rand() * Math.PI * 2, (rand() - 0.5) * 0.08);
    dummy.scale.set(sc, sc * (0.88 + rand() * 0.32), sc);
    dummy.updateMatrix();
    const mat = dummy.matrix.clone();
    worldColliders.addCircle(px, pz, 0.5 * sc, 'wood', py - 1.5, py + 9.0);

    if ((py > 52 || n.y < 0.72) && krummTransforms.length < 750 && rand() < 0.52) {
      krummTransforms.push(mat);
      krummColors.push(new THREE.Color().setHSL(0.41 + rand() * 0.04, 0.32, 0.26 + rand() * 0.08));
    } else if (spruceTransforms.length < 2800 && rand() < 0.66) {
      spruceTransforms.push(mat);
      spruceColors.push(new THREE.Color().setHSL(0.42 + rand() * 0.04, 0.38, 0.22 + rand() * 0.08));
    } else {
      pineTransforms.push(mat);
      pineColors.push(new THREE.Color().setHSL(0.39 + rand() * 0.05, 0.36, 0.24 + rand() * 0.08));
    }
  }

  const addTreeSpecies = (
    tGeo: THREE.BufferGeometry,
    cGeo: THREE.BufferGeometry,
    matrices: THREE.Matrix4[],
    colors: THREE.Color[],
  ) => {
    bucketInstancedIntoCells(tGeo, trunkMat, matrices, null, false, false);
    bucketInstancedIntoCells(cGeo, snowFoliageMat, matrices, colors, true, true);
  };

  addTreeSpecies(coniferTrunkGeo, spruceCanopyGeo, spruceTransforms, spruceColors);
  addTreeSpecies(coniferTrunkGeo, pineCanopyGeo, pineTransforms, pineColors);
  addTreeSpecies(krummholzTrunkGeo, krummholzCanopyGeo, krummTransforms, krummColors);

  // ---------------------------------------------------------------------------
  // 3. FROSTED ALPINE JUNIPER SHRUBS (~1,450) & FROZEN SEDGE TUFTS (~550)
  // ---------------------------------------------------------------------------
  const shrubParts: THREE.BufferGeometry[] = [];
  for (let s = 0; s < 3; s++) {
    const puff = new THREE.DodecahedronGeometry(0.62 - s * 0.07, 0);
    puff.scale(1.18, 0.7, 1.18);
    puff.rotateY(s * 1.15);
    puff.translate((s - 1) * 0.32, 0.25 + (s % 2) * 0.1, ((s * 2) % 3 - 1) * 0.22);
    shrubParts.push(puff);
  }
  const juniperGeo = trackGeo(BufferGeometryUtils.mergeGeometries(shrubParts, false));
  shrubParts.forEach((g) => g.dispose());

  const frostedShrubMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );
  frostedShrubMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vShrubTop;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vShrubTop = clamp(normal.y, 0.0, 1.0);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying float vShrubTop;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.96, 1.0), smoothstep(0.2, 0.72, vShrubTop) * 0.82);`,
      );
  };
  frostedShrubMat.customProgramCacheKey = () => 'frostpeak-frosted-shrub-static-v2';

  const juniperTransforms: THREE.Matrix4[] = [];
  const juniperColors: THREE.Color[] = [];
  const juniperPalette = [
    new THREE.Color(0x2d4f3d),
    new THREE.Color(0x3a614c),
    new THREE.Color(0x4c6855),
    new THREE.Color(0x6e786c),
  ];

  let jAttempts = 0;
  while (juniperTransforms.length < 2400 && jAttempts < 19500) {
    jAttempts++;
    const rx = (rand() - 0.5) * 880;
    const rz = (rand() - 0.5) * 840;
    if (!isClearForWinterFlora(rx, rz, 3.6)) continue;
    const q = circuit.queryNearest(rx, rz);
    if (rand() > (q.absDistance < roadHalf + 45 ? 0.92 : 0.42)) continue;
    const ry = groundHeightAt(rx, rz);
    if (ry < FROSTPEAK_WATER_LEVEL + 1.0 || ry > 96) continue;
    const n = groundNormalAt(rx, rz, 1.2);
    if (n.y < 0.60) continue;

    const sc = 0.55 + rand() * 0.92;
    dummy.position.set(rx, ry - 0.1, rz);
    dummy.rotation.set((rand() - 0.5) * 0.18, rand() * Math.PI * 2, (rand() - 0.5) * 0.18);
    dummy.scale.set(sc * (0.9 + rand() * 0.35), sc * (0.72 + rand() * 0.35), sc * (0.9 + rand() * 0.35));
    dummy.updateMatrix();
    juniperTransforms.push(dummy.matrix.clone());
    const col = juniperPalette[Math.floor(rand() * juniperPalette.length)].clone();
    col.offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.05);
    juniperColors.push(col);
  }
  bucketInstancedIntoCells(juniperGeo, frostedShrubMat, juniperTransforms, juniperColors, false, true);

  // Frozen Sedge Tufts near lake shore & snow embankments
  const sedgeParts: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 5; b++) {
    const blade = new THREE.ConeGeometry(0.1, 0.88, 3);
    blade.rotateZ((b - 2) * 0.25);
    blade.rotateY(b * 1.25);
    blade.translate(Math.cos(b * 1.25) * 0.16, 0.38, Math.sin(b * 1.25) * 0.16);
    sedgeParts.push(blade);
  }
  const sedgeGeo = trackGeo(BufferGeometryUtils.mergeGeometries(sedgeParts, false));
  sedgeParts.forEach((g) => g.dispose());

  const sedgeTransforms: THREE.Matrix4[] = [];
  const sedgeColors: THREE.Color[] = [];
  let sAttempts = 0;
  while (sedgeTransforms.length < 800 && sAttempts < 8200) {
    sAttempts++;
    const sx = (rand() - 0.5) * 760;
    const sz = (rand() - 0.5) * 740;
    if (!isClearForWinterFlora(sx, sz, 3.2)) continue;
    const sy = groundHeightAt(sx, sz);
    if (sy < FROSTPEAK_WATER_LEVEL + 0.5 || sy > FROSTPEAK_WATER_LEVEL + 16.0) continue;
    const sc = 0.72 + rand() * 0.75;
    dummy.position.set(sx, sy - 0.08, sz);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(sc, sc * (0.85 + rand() * 0.4), sc);
    dummy.updateMatrix();
    sedgeTransforms.push(dummy.matrix.clone());
    sedgeColors.push(new THREE.Color().setHSL(0.13 + rand() * 0.05, 0.32, 0.46 + rand() * 0.12));
  }
  bucketInstancedIntoCells(sedgeGeo, frostedShrubMat, sedgeTransforms, sedgeColors, false, false);

  // ---------------------------------------------------------------------------
  // 4. JAGGED GRANITE CLIFF MONOLITHS (~360) & GLACIER ICE SERACS (~180)
  // ---------------------------------------------------------------------------
  const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1.5, 1));
  const rPos = rockGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rPos.count; i++) {
    const vx = rPos.getX(i);
    const vy = rPos.getY(i);
    const vz = rPos.getZ(i);
    const jag = 0.8 + Math.sin(vx * 2.4 + vz * 1.9) * 0.2 + Math.cos(vy * 3.1) * 0.16;
    rPos.setXYZ(i, vx * jag * 1.25, vy * jag * 0.88, vz * jag);
  }
  rockGeo.computeVertexNormals();

  const snowRockMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      normalMap: textures.terrainRockNormal,
      color: 0x8d9aa8,
      roughness: 0.88,
      metalness: 0.06,
    }),
  );
  snowRockMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRockWorldNorm;`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vRockWorldNorm = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRockWorldNorm;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float snowCap = smoothstep(0.28, 0.72, vRockWorldNorm.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.96, 1.0), snowCap * 0.86);`,
      );
  };
  snowRockMat.customProgramCacheKey = () => 'frostpeak-snow-granite-v1';

  const rockMatrices: THREE.Matrix4[] = [];
  const rockColors: THREE.Color[] = [];
  let rAttempts = 0;
  while (rockMatrices.length < 520 && rAttempts < 5800) {
    rAttempts++;
    const rx = (rand() - 0.5) * 900;
    const rz = (rand() - 0.5) * 860;
    if (Math.hypot(rx - 29, rz - 64) < 34.0) continue;
    if (rx > -85 && rx < 55 && rz > -315 && rz < -272) continue;
    const ry = groundHeightAt(rx, rz);
    if (ry < FROSTPEAK_WATER_LEVEL - 0.5 || ry > 112) continue;
    const q = circuit.queryNearest(rx, rz);
    if (q.absDistance < (q.isBridge ? 17.5 : roadHalf + SHOULDER_WIDTH + 5.2)) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, rx, ry, rz, 12, 24)) continue;

    const sBase = 0.75 + rand() * 2.55;
    dummy.position.set(rx, ry - sBase * 0.32, rz);
    dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    dummy.scale.set(
      sBase * (0.9 + rand() * 0.5),
      sBase * (0.65 + rand() * 0.65),
      sBase * (0.9 + rand() * 0.5),
    );
    dummy.updateMatrix();
    rockMatrices.push(dummy.matrix.clone());
    const sh = 0.76 + rand() * 0.26;
    rockColors.push(new THREE.Color(sh * 0.94, sh * 0.97, sh));
    worldColliders.addCircle(rx, rz, 1.35 * sBase, 'rock', ry - 2, ry + 6);
  }
  bucketInstancedIntoCells(rockGeo, snowRockMat, rockMatrices, rockColors, true, true);

  // Faceted Translucent Cyan-Blue Glacier Ice Seracs along Frozen Lake Shore & Ridges (~180)
  const iceSeracGeo = trackGeo(new THREE.ConeGeometry(1.45, 5.4, 5));
  iceSeracGeo.translate(0, 2.2, 0);
  const icePos = iceSeracGeo.attributes.position as THREE.BufferAttribute;
  for (let v = 0; v < icePos.count; v++) {
    const vx = icePos.getX(v);
    const vy = icePos.getY(v);
    const vz = icePos.getZ(v);
    const skew = 1.0 + Math.sin(vy * 1.4 + vx * 2.1) * 0.14;
    icePos.setXYZ(v, vx * skew, vy, vz * skew * 0.85);
  }
  iceSeracGeo.computeVertexNormals();

  const seracMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xa6e3ff,
      emissive: 0x0c4a6e,
      emissiveIntensity: 0.14,
      roughness: 0.14,
      metalness: 0.04,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      transparent: false,
      flatShading: true,
    }),
  );

  const seracMatrices: THREE.Matrix4[] = [];
  const seracColors: THREE.Color[] = [];
  let iceAttempts = 0;
  while (seracMatrices.length < 320 && iceAttempts < 4800) {
    iceAttempts++;
    const ix =
      iceAttempts % 2 === 0
        ? 55 + (rand() - 0.5) * 290 // Near Frozen Glacial Lake basin
        : (rand() - 0.5) * 860;
    const iz =
      iceAttempts % 2 === 0
        ? 185 + (rand() - 0.5) * 220
        : (rand() - 0.5) * 820;
    if (!gondolaCorridorClear(ix, iz)) continue;
    if (Math.hypot(ix - 29, iz - 64) < 32.0) continue;
    const iy = groundHeightAt(ix, iz);
    if (iy < FROSTPEAK_WATER_LEVEL - 0.4 || iy > 108) continue;
    const q = circuit.queryNearest(ix, iz);
    if (q.absDistance < (q.isBridge ? 17.5 : roadHalf + SHOULDER_WIDTH + 6.8)) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, ix, iy, iz, 14, 26)) continue;

    const sc = 0.72 + rand() * 1.45;
    dummy.position.set(ix, Math.max(FROSTPEAK_WATER_LEVEL - 0.25, iy - 0.35), iz);
    dummy.rotation.set((rand() - 0.5) * 0.28, rand() * Math.PI * 2, (rand() - 0.5) * 0.28);
    dummy.scale.set(sc * (0.85 + rand() * 0.45), sc * (0.8 + rand() * 0.75), sc * (0.85 + rand() * 0.45));
    dummy.updateMatrix();
    seracMatrices.push(dummy.matrix.clone());
    seracColors.push(new THREE.Color().setHSL(0.54 + rand() * 0.04, 0.55, 0.72 + rand() * 0.16));
    worldColliders.addCircle(ix, iz, 1.15 * sc, 'rock', iy - 2, iy + 6);
  }
  bucketInstancedIntoCells(iceSeracGeo, seracMat, seracMatrices, seracColors, true, true);

  let keepRatio = 0.78;
  let foliageDensityScale = 1.0;

  return {
    group,
    setNightFactor: (nightFactor: number) => {
      seracMat.emissiveIntensity = 0.12 + nightFactor * 0.42;
      tracksideInfra.setNightFactor(nightFactor);
    },
    updateVisibilityWindow: (
      focusPos: THREE.Vector3,
      radiusM = 580,
      camPos?: THREE.Vector3,
      camFwd?: THREE.Vector3,
    ) => {
      tracksideInfra.updateVisibilityWindow(focusPos, camPos, camFwd);
      const maxR = radiusM + FP_CELL_HALF_DIAG;
      const maxRSq = maxR * maxR;
      let hasCamDir = false;
      let fwdX = 0;
      let fwdZ = 0;
      if (camPos && camFwd) {
        const fLen = Math.hypot(camFwd.x, camFwd.z);
        if (fLen > 0.05) {
          fwdX = camFwd.x / fLen;
          fwdZ = camFwd.z / fLen;
          hasCamDir = true;
        }
      }
      for (let c = 0; c < fpCells.length; c++) {
        const cell = fpCells[c];
        const dx = cell.cx - focusPos.x;
        const dz = cell.cz - focusPos.z;
        if (dx * dx + dz * dz > maxRSq) {
          cell.group.visible = false;
          continue;
        }
        if (hasCamDir && camPos) {
          const cdx = cell.cx - camPos.x;
          const cdz = cell.cz - camPos.z;
          if (cdx * fwdX + cdz * fwdZ < -(FP_CELL_HALF_DIAG + 14)) {
            cell.group.visible = false;
            continue;
          }
        }
        cell.group.visible = true;
      }
    },
    setGraphicsQuality: (quality: PropsQualityTier) => {
      keepRatio = quality === 'performance' ? 0.38 : quality === 'balanced' ? 0.72 : 1.0;
      const allowShadows = quality === 'ultra';
      for (const item of scaledRegistry) {
        item.mesh.count = Math.max(
          1,
          Math.min(item.fullCount, Math.round(item.fullCount * keepRatio * foliageDensityScale)),
        );
        item.mesh.castShadow = item.allowsShadow && allowShadows;
      }
      tracksideInfra.setGraphicsQuality(quality);
    },
    setFoliageDensity: (density: number) => {
      foliageDensityScale = Math.max(0.25, Math.min(1.4, density));
      for (const item of scaledRegistry) {
        item.mesh.count = Math.max(
          1,
          Math.min(item.fullCount, Math.round(item.fullCount * keepRatio * foliageDensityScale)),
        );
      }
    },
    dispose: () => {
      tracksideInfra.dispose();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}
