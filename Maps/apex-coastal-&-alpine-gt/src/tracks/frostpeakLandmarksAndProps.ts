import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ProceduralTextureSet } from './proceduralTextures';
import {
  buildCornerFanZoneRigs,
  buildOrientedPitAndGrandstandAddon,
  buildSharedTracksideInfra,
} from './sharedTracksideKit';
import { createTrackSpatialQuery, hash2 } from './terrainField';
import type {
  ColliderRegistry,
  MapDefinition,
  TerrainField,
  TrackSample,
} from './types';

export interface FrostpeakPropsHandle {
  update: (elapsed: number, crowdExcitement: number) => void;
  setSnowAccumulation: (snow: number) => void;
  setNightFactor: (night: number) => void;
  dispose: () => void;
}

function normalizeGeoForMerge(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('uv')) {
    const count = g.getAttribute('position').count;
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  return g;
}

/**
 * Patches snow-mantle accumulation on upward-facing surfaces with zero wind sway
 * (frostpeak-snow-conifer-pbr-static-v4 / frostpeak-frosted-shrub-static-v2)
 */
function patchStaticSnowMantleMaterial(
  mat: THREE.MeshStandardMaterial,
  uSnowMantle: { value: number }
): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowMantle = uSnowMantle;
    shader.vertexShader =
      `varying vec3 vMantleWorldNormal;\n` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vMantleWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        `
      );
    shader.fragmentShader =
      `
      uniform float uSnowMantle;
      varying vec3 vMantleWorldNormal;
      ` +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `
        #include <color_fragment>
        float upFace = smoothstep(0.36, 0.86, vMantleWorldNormal.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.90, 0.96), upFace * uSnowMantle * 0.28);
        `
      );
  };
}

export function buildFrostpeakLandmarksAndProps(
  parent: THREE.Group,
  mapDef: MapDefinition,
  samples: TrackSample[],
  terrain: TerrainField,
  registry: ColliderRegistry,
  textures: ProceduralTextureSet
): FrostpeakPropsHandle {
  const disposables: { dispose: () => void }[] = [];
  const uSnowMantle = { value: 0.78 };
  const trackQuery = createTrackSpatialQuery(samples, 26);
  const hw = mapDef.roadHalfWidth;

  // 1. Heated Pit Apron (246 x 22 m), cyan speed-limit boundary line, 6 amber radiant pit boxes
  const { pitFrame } = mapDef;
  const pitApronGroup = new THREE.Group();
  pitApronGroup.position.set(pitFrame.centerX, pitFrame.y + 0.02, pitFrame.centerZ);
  pitApronGroup.rotation.y = -Math.atan2(pitFrame.tangentZ, pitFrame.tangentX);
  parent.add(pitApronGroup);

  const apronGeo = new THREE.PlaneGeometry(246, 22);
  apronGeo.rotateX(-Math.PI / 2);
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    map: textures.asphaltMap,
    roughness: 0.72,
  });
  const apronMesh = new THREE.Mesh(apronGeo, apronMat);
  apronMesh.receiveShadow = true;
  pitApronGroup.add(apronMesh);

  const speedLineGeo = new THREE.PlaneGeometry(236, 0.35);
  speedLineGeo.rotateX(-Math.PI / 2);
  const cyanLineMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const speedLine = new THREE.Mesh(speedLineGeo, cyanLineMat);
  speedLine.position.set(0, 0.02, -8.8);
  pitApronGroup.add(speedLine);

  const amberMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const boxLongGeo = new THREE.PlaneGeometry(10.5, 0.25);
  boxLongGeo.rotateX(-Math.PI / 2);
  const boxShortGeo = new THREE.PlaneGeometry(0.25, 4.6);
  boxShortGeo.rotateX(-Math.PI / 2);
  for (let b = 0; b < 6; b++) {
    const bx = (b - 2.5) * 18.4;
    const tL = new THREE.Mesh(boxLongGeo, amberMat);
    tL.position.set(bx, 0.025, 2.3);
    const bL = new THREE.Mesh(boxLongGeo, amberMat);
    bL.position.set(bx, 0.025, -2.3);
    const lE = new THREE.Mesh(boxShortGeo, amberMat);
    lE.position.set(bx - 5.15, 0.025, 0);
    const rE = new THREE.Mesh(boxShortGeo, amberMat);
    rE.position.set(bx + 5.15, 0.025, 0);
    pitApronGroup.add(tL, bL, lE, rE);
  }
  disposables.push(apronGeo, apronMat, speedLineGeo, cyanLineMat, amberMat, boxLongGeo, boxShortGeo);

  const pitAddon = buildOrientedPitAndGrandstandAddon(
    parent,
    mapDef,
    terrain,
    registry,
    textures,
    'frostpeak_pass'
  );
  const fanZones = buildCornerFanZoneRigs(parent, samples, terrain, registry, 'frostpeak_pass');
  const sharedInfra = buildSharedTracksideInfra(parent, samples, mapDef);

  // 2. Monumental Glacial Ice & Granite Overhang Arch (spanHalf: 17.2m, archHeight: 19.4m)
  const archSample = samples[Math.floor(samples.length * 0.26)];
  const iceArchGroup = new THREE.Group();
  iceArchGroup.position.set(archSample.x, archSample.y - 1.5, archSample.z);
  iceArchGroup.rotation.y = -Math.atan2(archSample.tangentZ, archSample.tangentX);
  parent.add(iceArchGroup);

  const graniteMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.9,
    flatShading: true,
  });
  const iceVaultMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    emissive: 0x0284c7,
    emissiveIntensity: 0.28,
    roughness: 0.16,
    transparent: true,
    opacity: 0.86,
    flatShading: true,
  });
  disposables.push(graniteMat, iceVaultMat);

  const spanHalf = 17.2;
  const archHeight = 19.4;
  const pierGeo = new THREE.CylinderGeometry(3.4, 5.2, archHeight * 0.72, 7);
  const archCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, archHeight * 0.54, -spanHalf),
    new THREE.Vector3(0, archHeight * 0.96, -spanHalf * 0.45),
    new THREE.Vector3(0, archHeight + 1.1, 0),
    new THREE.Vector3(0, archHeight * 0.96, spanHalf * 0.45),
    new THREE.Vector3(0, archHeight * 0.54, spanHalf),
  ]);
  const vaultGeo = new THREE.TubeGeometry(archCurve, 18, 3.6, 6, false);
  disposables.push(pierGeo, vaultGeo);

  for (const side of [-1, 1]) {
    const pMesh = new THREE.Mesh(pierGeo, graniteMat);
    pMesh.position.set(0, archHeight * 0.34, side * spanHalf);
    pMesh.castShadow = true;
    iceArchGroup.add(pMesh);

    const wx = archSample.x + archSample.rightX * side * spanHalf;
    const wz = archSample.z + archSample.rightZ * side * spanHalf;
    registry.circles.push({
      id: `fp_ice_arch_pillar_${side}`,
      kind: 'rock',
      x: wx,
      z: wz,
      radius: 4.5,
      minY: archSample.y - 4,
      maxY: archSample.y + archHeight,
    });
  }
  const vaultMesh = new THREE.Mesh(vaultGeo, iceVaultMat);
  vaultMesh.castShadow = true;
  iceArchGroup.add(vaultMesh);

  const archPointLight = new THREE.PointLight(0x38bdf8, 14, 70, 1.8);
  archPointLight.position.set(0, archHeight - 2.0, 0);
  iceArchGroup.add(archPointLight);

  // 3. Alpine Chalet Village (14 Multi-Part Timber Chalets) & Summit Ski Lodge (255, -310) + Chimney Smoke
  const chaletCoords: [number, number][] = [
    [-198, 118],
    [-175, 114],
    [-152, 122],
    [-195, 144],
    [-168, 148],
    [-140, 140],
    [-212, 165],
    [-184, 170],
    [-125, 115],
    [-112, 148],
    [138, 122],
    [162, 134],
    [152, 245],
    [178, 254],
  ];
  const timberMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.85 });
  const stonePlinthMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.92 });
  const snowRoofMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.65 });
  const chaletWinMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.15,
    roughness: 0.2,
  });
  disposables.push(timberMat, stonePlinthMat, snowRoofMat, chaletWinMat);

  const cPlinthGeo = new THREE.BoxGeometry(9.6, 2.2, 8.2);
  const cBodyGeo = new THREE.BoxGeometry(8.8, 4.2, 7.4);
  const cRoofGeo = new THREE.ConeGeometry(7.0, 3.6, 4);
  const cWinGeo = new THREE.BoxGeometry(2.8, 1.5, 0.22);
  const cChimneyGeo = new THREE.BoxGeometry(1.1, 3.4, 1.1);
  disposables.push(cPlinthGeo, cBodyGeo, cRoofGeo, cWinGeo, cChimneyGeo);

  const activeChimneys: { x: number; y: number; z: number }[] = [];

  for (let i = 0; i < chaletCoords.length; i++) {
    const [cx, cz] = chaletCoords[i];
    if (trackQuery.minDist(cx, cz) < hw + 11.5) continue;
    const cy = terrain.getHeight(cx, cz);
    const cg = new THREE.Group();
    cg.position.set(cx, cy, cz);
    cg.rotation.y = (i % 5) * 0.45 - 0.8;

    const plinth = new THREE.Mesh(cPlinthGeo, stonePlinthMat);
    plinth.position.y = 0.4;
    const body = new THREE.Mesh(cBodyGeo, timberMat);
    body.position.y = 3.2;
    body.castShadow = true;
    const roof = new THREE.Mesh(cRoofGeo, snowRoofMat);
    roof.position.y = 7.0;
    roof.rotation.y = Math.PI / 4;
    const win = new THREE.Mesh(cWinGeo, chaletWinMat);
    win.position.set(0, 3.3, 3.72);
    const chim = new THREE.Mesh(cChimneyGeo, stonePlinthMat);
    chim.position.set(2.2, 6.8, -1.6);
    cg.add(plinth, body, roof, win, chim);
    parent.add(cg);

    activeChimneys.push({ x: cx + 2.0, y: cy + 8.6, z: cz - 1.5 });
    registry.obbs.push({
      id: `fp_chalet_${i}`,
      kind: 'building',
      centerX: cx,
      centerZ: cz,
      halfW: 5.0,
      halfD: 4.3,
      axisX: Math.cos(cg.rotation.y),
      axisZ: -Math.sin(cg.rotation.y),
      minY: cy - 1,
      maxY: cy + 9,
    });
  }

  // Summit Ski Lodge (255, -310)
  const lodgeX = 255;
  const lodgeZ = -310;
  const lodgeY = terrain.getHeight(lodgeX, lodgeZ);
  const lodgeGroup = new THREE.Group();
  lodgeGroup.position.set(lodgeX, lodgeY, lodgeZ);
  const lPlinthGeo = new THREE.BoxGeometry(24, 3.2, 16);
  const lBodyGeo = new THREE.BoxGeometry(22, 6.5, 14);
  const lRoofGeo = new THREE.ConeGeometry(16.5, 5.8, 4);
  const lWinGeo = new THREE.BoxGeometry(16, 2.4, 0.3);
  const lPlinth = new THREE.Mesh(lPlinthGeo, stonePlinthMat);
  lPlinth.position.y = 0.8;
  const lBody = new THREE.Mesh(lBodyGeo, timberMat);
  lBody.position.y = 5.2;
  lBody.castShadow = true;
  const lRoof = new THREE.Mesh(lRoofGeo, snowRoofMat);
  lRoof.position.y = 11.2;
  lRoof.rotation.y = Math.PI / 4;
  const lWin = new THREE.Mesh(lWinGeo, chaletWinMat);
  lWin.position.set(0, 5.4, 7.05);
  const lChim = new THREE.Mesh(cChimneyGeo, stonePlinthMat);
  lChim.position.set(5.5, 11.5, -2.5);
  lodgeGroup.add(lPlinth, lBody, lRoof, lWin, lChim);
  parent.add(lodgeGroup);
  activeChimneys.push({ x: lodgeX + 5.5, y: lodgeY + 13.4, z: lodgeZ - 2.5 });
  registry.obbs.push({
    id: 'fp_summit_lodge',
    kind: 'building',
    centerX: lodgeX,
    centerZ: lodgeZ,
    halfW: 12.2,
    halfD: 8.2,
    axisX: 1,
    axisZ: 0,
    minY: lodgeY - 1,
    maxY: lodgeY + 14,
  });
  disposables.push(lPlinthGeo, lBodyGeo, lRoofGeo, lWinGeo);

  // Instanced Wind-Drifted Chimney Smoke Plumes (5 puffs per active chimney)
  const puffsPerChimney = 5;
  const smokeTotal = activeChimneys.length * puffsPerChimney;
  const smokeGeo = new THREE.IcosahedronGeometry(0.65, 1);
  const smokeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    transparent: true,
    opacity: 0.45,
    roughness: 1.0,
    depthWrite: false,
  });
  const smokeInst = new THREE.InstancedMesh(smokeGeo, smokeMat, smokeTotal);
  smokeInst.frustumCulled = false;
  parent.add(smokeInst);
  disposables.push(smokeGeo, smokeMat);

  // 4. Active Ski Slalom Course & 5 Fan-Driven Snow Cannons
  const startHutX = 115;
  const startHutZ = -105;
  const startHutY = terrain.getHeight(startHutX, startHutZ);
  const hutGroup = new THREE.Group();
  hutGroup.position.set(startHutX, startHutY, startHutZ);
  const hutBox = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3.2, 4.0), timberMat);
  hutBox.position.y = 1.6;
  const hutRoof = new THREE.Mesh(new THREE.ConeGeometry(3.8, 1.8, 4), snowRoofMat);
  hutRoof.position.y = 4.0;
  hutRoof.rotation.y = Math.PI / 4;
  hutGroup.add(hutBox, hutRoof);
  parent.add(hutGroup);

  const gatePoleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6);
  const redGateMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
  const blueGateMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.4 });
  disposables.push(gatePoleGeo, redGateMat, blueGateMat);

  for (let g = 0; g < 7; g++) {
    const gx = 108 - g * 12 + (g % 2 === 0 ? -5 : 5);
    const gz = -88 + g * 16;
    const gy = terrain.getHeight(gx, gz);
    const mat = g % 2 === 0 ? redGateMat : blueGateMat;
    const p1 = new THREE.Mesh(gatePoleGeo, mat);
    p1.position.set(gx - 2.2, gy + 1.1, gz);
    const p2 = new THREE.Mesh(gatePoleGeo, mat);
    p2.position.set(gx + 2.2, gy + 1.1, gz);
    parent.add(p1, p2);
  }

  // 5 yellow fan-driven snow-making cannons + animated cannonMistInst
  const cannonCoords: [number, number][] = [
    [122, -72],
    [95, -45],
    [110, -15],
    [72, 14],
    [-132, 102],
  ];
  const cannonYellowMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.35,
    metalness: 0.35,
  });
  const cannonBarrelGeo = new THREE.CylinderGeometry(0.45, 0.62, 1.8, 10);
  cannonBarrelGeo.rotateX(Math.PI / 3);
  const cannonStandGeo = new THREE.CylinderGeometry(0.18, 0.45, 1.4, 8);
  disposables.push(cannonYellowMat, cannonBarrelGeo, cannonStandGeo);

  for (const [cx, cz] of cannonCoords) {
    const cy = terrain.getHeight(cx, cz);
    const stand = new THREE.Mesh(cannonStandGeo, stonePlinthMat);
    stand.position.set(cx, cy + 0.7, cz);
    const barrel = new THREE.Mesh(cannonBarrelGeo, cannonYellowMat);
    barrel.position.set(cx, cy + 1.65, cz);
    parent.add(stand, barrel);
  }

  const cannonMistCount = cannonCoords.length * 12;
  const cMistGeo = new THREE.IcosahedronGeometry(0.75, 0);
  const cMistMat = new THREE.MeshBasicMaterial({
    color: 0xf0f9ff,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  const cannonMistInst = new THREE.InstancedMesh(cMistGeo, cMistMat, cannonMistCount);
  cannonMistInst.frustumCulled = false;
  parent.add(cannonMistInst);
  disposables.push(cMistGeo, cMistMat);

  // 5. Overhead Alpine Gondola Cableway: 5 towers (38m), Base & Summit terminals, dual catenary cables, 6 moving cabins
  const gondolaNodesXZ: [number, number][] = [
    [-168, 128], // Base terminal (Ski Village)
    [-82, 42],
    [12, -55],
    [125, -168],
    [245, -295], // Summit terminal (Summit Ski Lodge)
  ];
  const gondolaTowerPts: THREE.Vector3[] = [];
  const gSteelMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.78, roughness: 0.38 });
  const gCabinMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.32, metalness: 0.22 });
  const gTowerGeo = new THREE.CylinderGeometry(0.55, 1.25, 38, 8);
  const gCrossArmGeo = new THREE.BoxGeometry(7.2, 0.7, 0.85);
  const gTermGeo = new THREE.BoxGeometry(12, 5.4, 9.5);
  const gCabinGeo = new THREE.BoxGeometry(2.6, 2.4, 2.4);
  const gCabWinGeo = new THREE.BoxGeometry(2.7, 1.0, 1.8);
  disposables.push(gSteelMat, gCabinMat, gTowerGeo, gCrossArmGeo, gTermGeo, gCabinGeo, gCabWinGeo);

  for (let i = 0; i < gondolaNodesXZ.length; i++) {
    const [gx, gz] = gondolaNodesXZ[i];
    const gy = terrain.getHeight(gx, gz);
    const topY = gy + 38;
    gondolaTowerPts.push(new THREE.Vector3(gx, topY, gz));

    const tower = new THREE.Mesh(gTowerGeo, gSteelMat);
    tower.position.set(gx, gy + 19, gz);
    tower.castShadow = true;
    const arm = new THREE.Mesh(gCrossArmGeo, gSteelMat);
    arm.position.set(gx, topY, gz);
    arm.rotation.y = Math.PI / 4;
    parent.add(tower, arm);

    if (i === 0 || i === gondolaNodesXZ.length - 1) {
      const term = new THREE.Mesh(gTermGeo, timberMat);
      term.position.set(gx, gy + 2.7, gz);
      parent.add(term);
    }
  }

  const cableCurveA = new THREE.CatmullRomCurve3(
    gondolaTowerPts.map((p) => new THREE.Vector3(p.x - 1.9, p.y, p.z + 1.9))
  );
  const cableCurveB = new THREE.CatmullRomCurve3(
    gondolaTowerPts.map((p) => new THREE.Vector3(p.x + 1.9, p.y, p.z - 1.9))
  );
  const cableGeoA = new THREE.TubeGeometry(cableCurveA, 48, 0.09, 5, false);
  const cableGeoB = new THREE.TubeGeometry(cableCurveB, 48, 0.09, 5, false);
  parent.add(new THREE.Mesh(cableGeoA, gSteelMat), new THREE.Mesh(cableGeoB, gSteelMat));
  disposables.push(cableGeoA, cableGeoB);

  const gondolaCabins: { group: THREE.Group; offset: number; dir: 1 | -1 }[] = [];
  for (let c = 0; c < 6; c++) {
    const cg = new THREE.Group();
    const body = new THREE.Mesh(gCabinGeo, gCabinMat);
    body.position.y = -2.2;
    const win = new THREE.Mesh(gCabWinGeo, chaletWinMat);
    win.position.y = -1.9;
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 5), gSteelMat);
    hanger.position.y = -0.7;
    cg.add(body, win, hanger);
    parent.add(cg);
    gondolaCabins.push({ group: cg, offset: c / 6, dir: c % 2 === 0 ? 1 : -1 });
  }

  // 6. Trackside Wooden Snow-Drift Fences along high-elevation (>= 32m) outer corners
  const driftFenceGeo = new THREE.BoxGeometry(5.6, 1.35, 0.25);
  const driftFenceMat = new THREE.MeshStandardMaterial({ color: 0x785535, roughness: 0.9 });
  disposables.push(driftFenceGeo, driftFenceMat);
  const fenceMats: THREE.Matrix4[] = [];
  const fDummy = new THREE.Object3D();

  for (let i = 0; i < samples.length; i += 24) {
    const s = samples[i];
    if (s.y < 32 || s.isBridge || s.hasRightPitGap) continue;
    const fx = s.x - s.rightX * (mapDef.roadHalfWidth + 6.5);
    const fz = s.z - s.rightZ * (mapDef.roadHalfWidth + 6.5);
    const fy = terrain.getHeight(fx, fz);
    if (Math.abs(fy - s.y) > 4.5) continue;
    fDummy.position.set(fx, fy + 0.6, fz);
    fDummy.rotation.set(0, -Math.atan2(s.tangentZ, s.tangentX), 0);
    fDummy.scale.set(1, 1, 1);
    fDummy.updateMatrix();
    fenceMats.push(fDummy.matrix.clone());
  }
  if (fenceMats.length > 0) {
    const dfInst = new THREE.InstancedMesh(driftFenceGeo, driftFenceMat, fenceMats.length);
    fenceMats.forEach((m, idx) => dfInst.setMatrixAt(idx, m));
    dfInst.instanceMatrix.needsUpdate = true;
    dfInst.computeBoundingSphere();
    parent.add(dfInst);
  }

  // 7. 650 GPU Wind-Driven Ridge-Crest Spindrift Snow Crystal Particles
  const spinCount = 650;
  const spinGeo = new THREE.BufferGeometry();
  const spinPos = new Float32Array(spinCount * 3);
  const spinSeeds = new Float32Array(spinCount * 3);
  for (let i = 0; i < spinCount; i++) {
    const x = (hash2(i, 17) - 0.5) * 760;
    const z = (hash2(i, 31) - 0.5) * 760;
    const y = Math.max(terrain.getHeight(x, z), 18) + 2 + hash2(i, 53) * 18;
    spinPos[i * 3] = x;
    spinPos[i * 3 + 1] = y;
    spinPos[i * 3 + 2] = z;
    spinSeeds[i * 3] = hash2(i, 71);
    spinSeeds[i * 3 + 1] = 0.5 + hash2(i, 89);
    spinSeeds[i * 3 + 2] = hash2(i, 97) * Math.PI * 2;
  }
  spinGeo.setAttribute('position', new THREE.BufferAttribute(spinPos, 3));
  spinGeo.setAttribute('aSeed', new THREE.BufferAttribute(spinSeeds, 3));
  const spinUniforms = { uTime: { value: 0 } };
  const spinMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: spinUniforms,
    vertexShader: `
      attribute vec3 aSeed;
      uniform float uTime;
      varying float vAlpha;
      void main() {
        float t = fract(aSeed.x + uTime * 0.14 * aSeed.y);
        vAlpha = sin(t * 3.14159) * 0.72;
        vec3 p = position;
        p.x += (t - 0.5) * 42.0;
        p.y += sin(uTime * 1.4 + aSeed.z) * 2.2 - t * 3.5;
        p.z += (t - 0.5) * 16.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(4.5 * (140.0 / max(-mv.z, 1.0)), 1.5, 8.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        gl_FragColor = vec4(0.95, 0.98, 1.0, (1.0 - d * 2.0) * vAlpha);
      }
    `,
  });
  const spinPoints = new THREE.Points(spinGeo, spinMat);
  spinPoints.frustumCulled = false;
  parent.add(spinPoints);
  disposables.push(spinGeo, spinMat);

  // 8. Static Winter Foliage, Granite Monoliths & Glacier Ice Seracs (ZERO wind sway!)
  // A. Multi-Species Alpine Conifers (up to 4,800 instances): Lathe + 6-limb trunk, scalloped boughs, snow-mantle shader
  const trunkLathePts = [
    new THREE.Vector2(0.42, 0),
    new THREE.Vector2(0.32, 2.2),
    new THREE.Vector2(0.2, 5.4),
    new THREE.Vector2(0.06, 8.6),
  ];
  const trunkLathe = normalizeGeoForMerge(new THREE.LatheGeometry(trunkLathePts, 6));
  const trunkParts: THREE.BufferGeometry[] = [trunkLathe];
  for (let l = 0; l < 6; l++) {
    const limb = normalizeGeoForMerge(new THREE.CylinderGeometry(0.04, 0.09, 1.5, 5));
    limb.rotateZ(1.1);
    limb.translate(0.6, 2.5 + l * 0.85, 0);
    limb.rotateY((l / 6) * Math.PI * 2);
    trunkParts.push(limb);
  }
  const coniferTrunkGeo = mergeGeometries(trunkParts);
  const coniferTrunkMat = new THREE.MeshStandardMaterial({
    color: 0x4b382a,
    normalMap: textures.barkNormal,
    roughness: 0.92,
  });

  // Scalloped drooping boughs (5 overlapping jagged tiers) with static snow-mantle shader
  const boughParts: THREE.BufferGeometry[] = [];
  for (let tier = 0; tier < 5; tier++) {
    const r = 2.35 - tier * 0.36;
    const h = 2.5 - tier * 0.18;
    const cone = normalizeGeoForMerge(new THREE.ConeGeometry(r, h, 7));
    cone.rotateY(tier * 0.45);
    cone.translate(0, 2.3 + tier * 1.45, 0);
    boughParts.push(cone);
  }
  const coniferFoliageGeo = mergeGeometries(boughParts);
  const coniferFoliageMat = new THREE.MeshStandardMaterial({
    color: 0x0f291c,
    roughness: 0.88,
    flatShading: true,
  });
  patchStaticSnowMantleMaterial(coniferFoliageMat, uSnowMantle);
  disposables.push(coniferTrunkGeo, coniferTrunkMat, coniferFoliageGeo, coniferFoliageMat);

  const coniferMats: THREE.Matrix4[] = [];
  const coniferTints: THREE.Color[] = [];
  const instDummy = new THREE.Object3D();

  for (let a = 0; a < 6200 && coniferMats.length < 4800; a++) {
    const x = (hash2(a + 1000, 11) - 0.5) * 940;
    const z = (hash2(a + 1000, 23) - 0.5) * 940;
    const y = terrain.getHeight(x, z);
    if (y < 6.0 || y > 76) continue;
    if (terrain.getSlope(x, z) > 0.72) continue;
    if (terrain.isPitOrGrandstandPad(x, z) > 0.12) continue;
    const dRoad = trackQuery.minDist(x, z);
    if (dRoad < hw + 6.8) continue;

    // Species variation by elevation: Norway Spruce (low), Frosted Alpine Pine (mid), Timberline Krummholz (high, compact)
    const krummholz = y > 52 ? 0.58 : 1.0;
    const sc = (0.72 + hash2(a + 1000, 41) * 0.65) * krummholz;
    const slope = terrain.getSlope(x, z);
    instDummy.position.set(x, y - 0.25 - slope * 0.55, z);
    instDummy.rotation.set(0, hash2(a + 1000, 59) * Math.PI * 2, 0);
    instDummy.scale.set(sc * (y > 52 ? 1.2 : 1.0), sc, sc * (y > 52 ? 1.2 : 1.0));
    instDummy.updateMatrix();
    coniferMats.push(instDummy.matrix.clone());
    coniferTints.push(
      new THREE.Color().setHSL(0.38 + (hash2(a, 71) - 0.5) * 0.04, 0.34, 0.08 + (y / 180) * 0.05)
    );

    if (dRoad < 55) {
      registry.circles.push({
        id: `fp_conifer_${a}`,
        kind: 'wood',
        x,
        z,
        radius: 0.62 * sc,
        minY: y - 1,
        maxY: y + 9 * sc,
      });
    }
  }
  if (coniferMats.length > 0) {
    const ctInst = new THREE.InstancedMesh(coniferTrunkGeo, coniferTrunkMat, coniferMats.length);
    const cfInst = new THREE.InstancedMesh(coniferFoliageGeo, coniferFoliageMat, coniferMats.length);
    for (let i = 0; i < coniferMats.length; i++) {
      ctInst.setMatrixAt(i, coniferMats[i]);
      cfInst.setMatrixAt(i, coniferMats[i]);
      cfInst.setColorAt(i, coniferTints[i]);
    }
    ctInst.instanceMatrix.needsUpdate = true;
    cfInst.instanceMatrix.needsUpdate = true;
    if (cfInst.instanceColor) cfInst.instanceColor.needsUpdate = true;
    cfInst.castShadow = true;
    ctInst.computeBoundingSphere();
    cfInst.computeBoundingSphere();
    parent.add(ctInst, cfInst);
  }

  // B. Frosted Alpine Juniper Shrubs (up to 2,400 instances, frostpeak-frosted-shrub-static-v2)
  const juniperGeo = new THREE.DodecahedronGeometry(0.9, 0);
  juniperGeo.translate(0, 0.5, 0);
  const juniperMat = new THREE.MeshStandardMaterial({
    color: 0x1e3f30,
    roughness: 0.88,
    flatShading: true,
  });
  patchStaticSnowMantleMaterial(juniperMat, uSnowMantle);
  disposables.push(juniperGeo, juniperMat);

  const juniperMats: THREE.Matrix4[] = [];
  for (let a = 0; a < 3100 && juniperMats.length < 2400; a++) {
    const x = (hash2(a + 7000, 17) - 0.5) * 900;
    const z = (hash2(a + 7000, 29) - 0.5) * 900;
    const y = terrain.getHeight(x, z);
    if (y < 5.0 || y > 72) continue;
    if (terrain.getSlope(x, z) > 0.76) continue;
    if (terrain.isPitOrGrandstandPad(x, z) > 0.1) continue;
    if (trackQuery.minDist(x, z) < hw + 5.6) continue;
    const sc = 0.6 + hash2(a + 7000, 47) * 0.65;
    instDummy.position.set(x, y - 0.08, z);
    instDummy.rotation.set(0, hash2(a + 7000, 61) * Math.PI * 2, 0);
    instDummy.scale.set(sc * 1.2, sc * 0.75, sc * 1.2);
    instDummy.updateMatrix();
    juniperMats.push(instDummy.matrix.clone());
  }
  if (juniperMats.length > 0) {
    const jInst = new THREE.InstancedMesh(juniperGeo, juniperMat, juniperMats.length);
    juniperMats.forEach((m, i) => jInst.setMatrixAt(i, m));
    jInst.instanceMatrix.needsUpdate = true;
    jInst.computeBoundingSphere();
    parent.add(jInst);
  }

  // C. Frozen Sedge Tufts (up to 800 instances)
  const sedgeGeo = new THREE.ConeGeometry(0.32, 0.75, 4);
  sedgeGeo.translate(0, 0.35, 0);
  const sedgeMat = new THREE.MeshStandardMaterial({ color: 0x7c8fa4, roughness: 0.9 });
  disposables.push(sedgeGeo, sedgeMat);
  const sedgeMats: THREE.Matrix4[] = [];
  for (let a = 0; a < 1400 && sedgeMats.length < 800; a++) {
    const x = (hash2(a + 11000, 19) - 0.5) * 840;
    const z = (hash2(a + 11000, 37) - 0.5) * 840;
    const y = terrain.getHeight(x, z);
    if (y < 4.5 || y > 48) continue;
    if (trackQuery.minDist(x, z) < hw + 5.2) continue;
    const sc = 0.7 + hash2(a + 11000, 53) * 0.55;
    instDummy.position.set(x, y - 0.05, z);
    instDummy.rotation.set(0, hash2(a + 11000, 71) * Math.PI * 2, 0);
    instDummy.scale.set(sc, sc, sc);
    instDummy.updateMatrix();
    sedgeMats.push(instDummy.matrix.clone());
  }
  if (sedgeMats.length > 0) {
    const sgInst = new THREE.InstancedMesh(sedgeGeo, sedgeMat, sedgeMats.length);
    sedgeMats.forEach((m, i) => sgInst.setMatrixAt(i, m));
    sgInst.instanceMatrix.needsUpdate = true;
    sgInst.computeBoundingSphere();
    parent.add(sgInst);
  }

  // D. Snow-Capped Granite Cliff Monoliths (up to 520 instances, rock colliders)
  const monoGeo = new THREE.DodecahedronGeometry(1.65, 0);
  const monoMat = new THREE.MeshStandardMaterial({
    color: 0x3b4452,
    roughness: 0.88,
    flatShading: true,
  });
  patchStaticSnowMantleMaterial(monoMat, uSnowMantle);
  disposables.push(monoGeo, monoMat);

  const monoMats: THREE.Matrix4[] = [];
  for (let a = 0; a < 950 && monoMats.length < 520; a++) {
    const x = (hash2(a + 14000, 13) - 0.5) * 940;
    const z = (hash2(a + 14000, 31) - 0.5) * 940;
    const y = terrain.getHeight(x, z);
    if (y < 3.0 || y > 135) continue;
    const slope = terrain.getSlope(x, z);
    if (slope > 0.62) continue;
    if (terrain.isPitOrGrandstandPad(x, z) > 0.1) continue;
    const dRoad = trackQuery.minDist(x, z);
    if (dRoad < hw + 6.4) continue;
    const sx = 0.85 + hash2(a + 14000, 47) * 1.6;
    const sy = 0.85 + hash2(a + 14000, 59) * 1.9;
    const sz = 0.85 + hash2(a + 14000, 67) * 1.6;
    instDummy.position.set(x, y - sy * 0.25 - slope * 0.85, z);
    instDummy.rotation.set(hash2(a, 3) * 0.3, hash2(a, 5) * Math.PI * 2, hash2(a, 7) * 0.3);
    instDummy.scale.set(sx, sy, sz);
    instDummy.updateMatrix();
    monoMats.push(instDummy.matrix.clone());

    if (dRoad < 55) {
      registry.circles.push({
        id: `fp_granite_${a}`,
        kind: 'rock',
        x,
        z,
        radius: Math.max(sx, sz) * 1.25,
        minY: y - 1,
        maxY: y + sy * 2.5,
      });
    }
  }
  if (monoMats.length > 0) {
    const mInst = new THREE.InstancedMesh(monoGeo, monoMat, monoMats.length);
    monoMats.forEach((m, i) => mInst.setMatrixAt(i, m));
    mInst.instanceMatrix.needsUpdate = true;
    mInst.castShadow = true;
    mInst.computeBoundingSphere();
    parent.add(mInst);
  }

  // E. Faceted Translucent Cyan-Blue Glacier Ice Seracs (up to 320 instances, rock colliders, subtle night cyan glow)
  const seracGeo = new THREE.ConeGeometry(1.4, 5.2, 5);
  seracGeo.translate(0, 2.4, 0);
  const seracMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.22,
    roughness: 0.14,
    transparent: true,
    opacity: 0.84,
    flatShading: true,
  });
  disposables.push(seracGeo, seracMat);

  const seracMats: THREE.Matrix4[] = [];
  for (let a = 0; a < 750 && seracMats.length < 320; a++) {
    const x = (hash2(a + 18000, 17) - 0.5) * 900;
    const z = (hash2(a + 18000, 41) - 0.5) * 900;
    const y = terrain.getHeight(x, z);
    if (y < 14.0 || y > 138) continue;
    const slope = terrain.getSlope(x, z);
    if (slope > 0.62) continue;
    if (terrain.isPitOrGrandstandPad(x, z) > 0.1) continue;
    const dRoad = trackQuery.minDist(x, z);
    if (dRoad < hw + 6.8) continue;
    const sc = 0.8 + hash2(a + 18000, 61) * 1.45;
    instDummy.position.set(x, y - 0.55 - slope * 0.85, z);
    instDummy.rotation.set(
      (hash2(a, 11) - 0.5) * 0.35,
      hash2(a, 13) * Math.PI * 2,
      (hash2(a, 17) - 0.5) * 0.35
    );
    instDummy.scale.set(sc, sc * (0.9 + hash2(a, 23) * 0.6), sc);
    instDummy.updateMatrix();
    seracMats.push(instDummy.matrix.clone());

    if (dRoad < 55) {
      registry.circles.push({
        id: `fp_serac_${a}`,
        kind: 'rock',
        x,
        z,
        radius: 1.35 * sc,
        minY: y - 1,
        maxY: y + 5.4 * sc,
      });
    }
  }
  if (seracMats.length > 0) {
    const srInst = new THREE.InstancedMesh(seracGeo, seracMat, seracMats.length);
    seracMats.forEach((m, i) => srInst.setMatrixAt(i, m));
    srInst.instanceMatrix.needsUpdate = true;
    srInst.computeBoundingSphere();
    parent.add(srInst);
  }

  const animDummy = new THREE.Object3D();
  const tmpPt = new THREE.Vector3();

  return {
    update: (elapsed, crowdExcitement) => {
      pitAddon.updateCrowd(elapsed, crowdExcitement);
      fanZones.updateFlags(elapsed);
      spinUniforms.uTime.value = elapsed;

      // Update wind-drifted chimney smoke plumes
      let sIdx = 0;
      for (let c = 0; c < activeChimneys.length; c++) {
        const ch = activeChimneys[c];
        for (let p = 0; p < puffsPerChimney; p++) {
          const life = (elapsed * 0.24 + p / puffsPerChimney + c * 0.13) % 1;
          animDummy.position.set(
            ch.x + life * 4.5 + Math.sin(elapsed + p) * 0.4,
            ch.y + life * 7.8,
            ch.z + life * 1.8
          );
          animDummy.scale.setScalar(0.55 + life * 1.65);
          animDummy.rotation.set(life * 2, elapsed * 0.5, 0);
          animDummy.updateMatrix();
          smokeInst.setMatrixAt(sIdx++, animDummy.matrix);
        }
      }
      smokeInst.instanceMatrix.needsUpdate = true;

      // Update snow-cannon billowing snow-spray plumes
      let mIdx = 0;
      for (let c = 0; c < cannonCoords.length; c++) {
        const [cx, cz] = cannonCoords[c];
        const cy = terrain.getHeight(cx, cz) + 2.0;
        for (let p = 0; p < 12; p++) {
          const life = (elapsed * 0.65 + p / 12 + c * 0.19) % 1;
          animDummy.position.set(
            cx + Math.sin(c * 1.4) * life * 3.5,
            cy + life * 4.8 - life * life * 2.4,
            cz + life * 11.5
          );
          animDummy.scale.setScalar(0.45 + life * 1.85);
          animDummy.updateMatrix();
          cannonMistInst.setMatrixAt(mIdx++, animDummy.matrix);
        }
      }
      cannonMistInst.instanceMatrix.needsUpdate = true;

      // Oscillate 6 gondola cabins continuously end-to-end along dual catenary cables
      for (let i = 0; i < gondolaCabins.length; i++) {
        const cab = gondolaCabins[i];
        const raw = (elapsed * 0.032 + cab.offset) % 2;
        const t = raw <= 1 ? raw : 2 - raw;
        const curve = cab.dir === 1 ? cableCurveA : cableCurveB;
        curve.getPointAt(THREE.MathUtils.clamp(t, 0.02, 0.98), tmpPt);
        cab.group.position.copy(tmpPt);
      }
    },
    setSnowAccumulation: (snow) => {
      uSnowMantle.value = snow;
    },
    setNightFactor: (night) => {
      pitAddon.setNightFactor(night);
      sharedInfra.setNightFactor(night);
      chaletWinMat.emissiveIntensity = 0.5 + night * 1.5;
      seracMat.emissiveIntensity = 0.14 + night * 0.65;
      archPointLight.intensity = 5 + night * 18;
    },
    dispose: () => {
      pitAddon.dispose();
      fanZones.dispose();
      sharedInfra.dispose();
      disposables.forEach((d) => d.dispose());
    },
  };
}
