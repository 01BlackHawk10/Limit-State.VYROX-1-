import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getCircuitData, SHOULDER_WIDTH } from '../Aurelia Ridge/circuitSpline';
import { CORAL_BAY_WATER_LEVEL } from './coralBayTerrainField';
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
import { attachInstancedUserAsset } from '../../engine/userAssetsLoader';

/**
 * Coral Bay Landmarks:
 * 1. Oriented Pit-Lane Apron, 6-Bay Coastal Paddock, Race Control Tower & Teak Spectator Grandstand
 * 2. Monumental Coastal Limestone Sea Arch (16.5m+ clearance)
 * 3. Resort Marina Piers, Bobbing Luxury Yachts & Sailing Catamarans with Tall Canvas Sails
 * 4. Headland Lighthouse with Rotating Lantern & Sweeping Night Beam + Flocking Seabirds
 * 5. Beachfront Promenade Boardwalk, Striped Parasols, Loungers, Surfboard Racks, Tiki Torches,
 *    Lifeguard Tower & Multi-Part Coastal Resort Villas
 */
export function buildCoralBayLandmarksRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): LandmarksAndCampusRig {
  const group = new THREE.Group();
  group.name = 'CoralBayLandmarksRig';

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
  const rand = createSeededRandom(73219);

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
  // 1. COASTAL PIT-LANE ASPHALT APRON, PADDOCK GARAGES & SHARED PIT/GRANDSTAND RIG
  // ---------------------------------------------------------------------------
  const pitFrame = pitBounds.frame ?? {
    centerX: -117.3,
    centerZ: 199.5,
    tanX: 12 / 13,
    tanZ: 5 / 13,
    rightX: -5 / 13,
    rightZ: 12 / 13,
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

  const pitApronGeo = trackGeo(new THREE.PlaneGeometry(245, 22));
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
      color: 0xcbd5e1,
      roughness: 0.78,
      metalness: 0.05,
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
      color: 0xfacc15,
      roughness: 0.55,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const pitLineGeo = trackGeo(new THREE.PlaneGeometry(235, 0.35));
  pitLineGeo.rotateX(-Math.PI / 2);
  const pitLine = new THREE.Mesh(pitLineGeo, lineMat);
  pitLine.position.set(0, 0.05, 7.6);
  pitComplexGroup.add(pitLine);

  const boxMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.25,
      roughness: 0.5,
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
      color: 0xf1f5f9,
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

  const paddockDarkMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.52, metalness: 0.45 }),
  );
  const glassHospitalityMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x164e63,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.14,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );

  // Add oriented Race Control Tower, Debris Catch Fence, Entry Portal & Covered Spectator Grandstand
  const sharedPitAddon = buildOrientedPitAndGrandstandAddon(
    group,
    textures,
    sharedWeather,
    pitBounds,
    pitFrame,
    CORAL_BAY_WATER_LEVEL,
    'coral_bay',
  );

  // ---------------------------------------------------------------------------
  // 2. MONUMENTAL COASTAL LIMESTONE SEA ARCH (North Headland Cliff Sector)
  // ---------------------------------------------------------------------------
  let archIdx = Math.floor(0.64 * N);
  let bestArchScore = -Infinity;
  for (let i = Math.floor(0.55 * N); i < Math.floor(0.76 * N); i++) {
    const s = samples[i % N];
    if (s.isBridge || s.isStraight) continue;
    if (Math.abs(s.curvature) > 0.011 || s.position.y < 12.0) continue;
    const score = s.position.y - Math.abs(s.curvature) * 500;
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

  const rockArchMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      normalMap: textures.terrainRockNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      color: 0xd9cdb8,
      roughness: 0.88,
      metalness: 0.03,
    }),
  );

  const archGeos: THREE.BufferGeometry[] = [];
  const archSegs = 15;
  const spanHalf = 17.2;
  const archHeight = 19.4;
  for (let i = 0; i <= archSegs; i++) {
    const a = (i / archSegs) * Math.PI;
    const lx = Math.cos(a) * spanHalf;
    const ly = Math.sin(a) * archHeight - 2.4;
    const thickness = 5.4 - Math.sin(a) * 1.4 + (rand() - 0.5) * 0.7;
    const depth = 11.2 - Math.sin(a) * 2.2;

    const segGeo = new THREE.DodecahedronGeometry(thickness, 1);
    const sPos = segGeo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < sPos.count; v++) {
      const vx = sPos.getX(v);
      const vy = sPos.getY(v);
      const vz = sPos.getZ(v);
      const jag = 0.84 + Math.sin(vx * 1.8 + i) * 0.14 + Math.cos(vz * 1.6) * 0.12;
      sPos.setXYZ(v, vx * jag, vy * jag * 0.88, (vz / thickness) * (depth * 0.55) * jag);
    }
    segGeo.computeVertexNormals();
    segGeo.rotateZ(a - Math.PI * 0.5);
    segGeo.translate(lx, ly, (rand() - 0.5) * 1.3);
    segGeo.applyQuaternion(archQuat);
    segGeo.translate(archSample.position.x, archSample.position.y, archSample.position.z);
    archGeos.push(segGeo);
  }
  const mergedArch = trackGeo(BufferGeometryUtils.mergeGeometries(archGeos, false));
  archGeos.forEach((g) => g.dispose());
  const archMesh = new THREE.Mesh(mergedArch, rockArchMat);
  archMesh.castShadow = true;
  archMesh.receiveShadow = true;
  group.add(archMesh);

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
  const archNightLight = new THREE.PointLight(0xffcb82, 0, 58, 1.45);
  archNightLight.position.copy(archSample.position).add(new THREE.Vector3(0, 8.0, 0));
  archNightLight.visible = false;
  group.add(archNightLight);

  // ---------------------------------------------------------------------------
  // 3. RESORT MARINA PIERS, COMPOSITE LUXURY YACHTS & SAILING CATAMARANS
  // ---------------------------------------------------------------------------
  const pierDeckMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xa17c58, roughness: 0.84, metalness: 0.04 }),
  );
  const pilingMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x4b3b2c, roughness: 0.92, metalness: 0.02 }),
  );

  const marinaGroup = new THREE.Group();
  marinaGroup.name = 'ResortMarina';
  const pierDeckY = CORAL_BAY_WATER_LEVEL + 1.35;

  const pierDefs = [
    { x: -222, z: 58, lenX: 48, lenZ: 4.4 },
    { x: -218, z: 92, lenX: 56, lenZ: 4.4 },
    { x: -224, z: 126, lenX: 46, lenZ: 4.4 },
    { x: -248, z: 92, lenX: 5.5, lenZ: 88 },
  ];
  const pierGeos: THREE.BufferGeometry[] = [];
  const pilingGeos: THREE.BufferGeometry[] = [];
  for (const pd of pierDefs) {
    const deck = new THREE.BoxGeometry(pd.lenX, 0.42, pd.lenZ);
    deck.translate(pd.x, pierDeckY, pd.z);
    pierGeos.push(deck);

    const steps = Math.max(3, Math.floor(Math.max(pd.lenX, pd.lenZ) / 14));
    for (let s = 0; s <= steps; s++) {
      const f = steps === 0 ? 0.5 : s / steps - 0.5;
      const px = pd.lenX > pd.lenZ ? pd.x + f * (pd.lenX - 3) : pd.x;
      const pz = pd.lenZ >= pd.lenX ? pd.z + f * (pd.lenZ - 3) : pd.z;
      const post = new THREE.CylinderGeometry(0.24, 0.28, 7.5, 7);
      post.translate(px, pierDeckY - 3.2, pz);
      pilingGeos.push(post);
      // Marina docking bollard atop pier
      const bollard = new THREE.CylinderGeometry(0.16, 0.2, 0.65, 8);
      bollard.translate(px, pierDeckY + 0.45, pz + (pd.lenX > pd.lenZ ? 1.6 : 0));
      pilingGeos.push(bollard);
    }
  }
  const mergedPiers = trackGeo(BufferGeometryUtils.mergeGeometries(pierGeos, false));
  pierGeos.forEach((g) => g.dispose());
  const pierMesh = new THREE.Mesh(mergedPiers, pierDeckMat);
  pierMesh.castShadow = true;
  pierMesh.receiveShadow = true;
  marinaGroup.add(pierMesh);

  const mergedPilings = trackGeo(BufferGeometryUtils.mergeGeometries(pilingGeos, false));
  pilingGeos.forEach((g) => g.dispose());
  marinaGroup.add(new THREE.Mesh(mergedPilings, pilingMat));

  const hullWhiteMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      roughness: 0.16,
      metalness: 0.08,
      clearcoat: 0.9,
    }),
  );
  const hullNavyMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x0f3b5c, roughness: 0.32, metalness: 0.25 }),
  );
  const yachtGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0b1f2e,
      roughness: 0.06,
      metalness: 0.2,
      clearcoat: 1.0,
    }),
  );
  const teakMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x9c7146, roughness: 0.78 }),
  );
  const sailClothMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfefefe,
      roughness: 0.65,
      side: THREE.DoubleSide,
    }),
  );

  const yachtNodes: Array<{ group: THREE.Group; baseY: number; phase: number; rollAmp: number }> = [];
  const yachtPlacements = [
    { x: -206, z: 70, yaw: 0.12, scale: 1.05 },
    { x: -202, z: 82, yaw: -0.08, scale: 0.95 },
    { x: -204, z: 104, yaw: 0.06, scale: 1.18 },
    { x: -206, z: 116, yaw: 0.14, scale: 0.9 },
    { x: 75, z: -210, yaw: 0.68, scale: 1.32 },
    { x: 118, z: -235, yaw: -0.55, scale: 1.22 },
  ];

  const yHullGeo = trackGeo(new THREE.BoxGeometry(4.4, 1.8, 16.5));
  const yBowGeo = trackGeo(new THREE.ConeGeometry(2.3, 5.2, 4));
  yBowGeo.rotateY(Math.PI * 0.25);
  yBowGeo.rotateX(Math.PI * 0.5);
  const yTeakGeo = trackGeo(new THREE.BoxGeometry(3.9, 0.18, 14.5));
  const yCabinGeo = trackGeo(new THREE.BoxGeometry(3.4, 2.1, 8.6));
  const yFlyGeo = trackGeo(new THREE.BoxGeometry(2.8, 0.35, 5.4));
  const yRadarGeo = trackGeo(new THREE.BoxGeometry(3.2, 1.35, 0.45));

  yachtPlacements.forEach((yp, idx) => {
    const yg = new THREE.Group();
    yg.position.set(yp.x, CORAL_BAY_WATER_LEVEL + 0.35, yp.z);
    yg.rotation.y = yp.yaw;
    yg.scale.setScalar(yp.scale);

    const hull = new THREE.Mesh(yHullGeo, idx % 2 === 0 ? hullWhiteMat : hullNavyMat);
    hull.position.y = 0.6;
    hull.castShadow = true;
    yg.add(hull);

    const bow = new THREE.Mesh(yBowGeo, idx % 2 === 0 ? hullWhiteMat : hullNavyMat);
    bow.position.set(0, 0.68, 10.2);
    bow.scale.set(1.0, 0.72, 1.0);
    bow.castShadow = true;
    yg.add(bow);

    const teak = new THREE.Mesh(yTeakGeo, teakMat);
    teak.position.set(0, 1.54, 0.4);
    yg.add(teak);

    const cabin = new THREE.Mesh(yCabinGeo, yachtGlassMat);
    cabin.position.set(0, 2.6, -0.6);
    cabin.castShadow = true;
    yg.add(cabin);

    const fly = new THREE.Mesh(yFlyGeo, hullWhiteMat);
    fly.position.set(0, 3.72, -1.2);
    yg.add(fly);

    const radar = new THREE.Mesh(yRadarGeo, hullWhiteMat);
    radar.position.set(0, 4.45, -1.4);
    yg.add(radar);

    marinaGroup.add(yg);
    yachtNodes.push({
      group: yg,
      baseY: CORAL_BAY_WATER_LEVEL + 0.35,
      phase: idx * 1.35,
      rollAmp: 0.025 + rand() * 0.015,
    });
  });

  // 4 Moored Sailing Catamarans with Tall Triangular Sails in Lagoon & Bay
  const catPontoonGeo = trackGeo(new THREE.BoxGeometry(0.95, 1.1, 13.5));
  const catBridgeDeckGeo = trackGeo(new THREE.BoxGeometry(5.6, 0.45, 7.8));
  const catMastGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.16, 17.5, 8));
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0);
  sailShape.lineTo(0, 14.5);
  sailShape.lineTo(5.8, 0.8);
  sailShape.closePath();
  const mainSailGeo = trackGeo(new THREE.ShapeGeometry(sailShape));
  mainSailGeo.rotateY(Math.PI * 0.5);

  const sailPlacements = [
    { x: 64, z: -268, yaw: 0.82 },
    { x: 118, z: -255, yaw: -0.45 },
    { x: 96, z: -210, yaw: 1.15 },
    { x: -175, z: 105, yaw: 0.32 },
  ];
  sailPlacements.forEach((sp, idx) => {
    const cg = new THREE.Group();
    cg.position.set(sp.x, CORAL_BAY_WATER_LEVEL + 0.3, sp.z);
    cg.rotation.y = sp.yaw;

    const pL = new THREE.Mesh(catPontoonGeo, hullWhiteMat);
    pL.position.set(-2.3, 0.45, 0);
    pL.castShadow = true;
    const pR = new THREE.Mesh(catPontoonGeo, hullWhiteMat);
    pR.position.set(2.3, 0.45, 0);
    pR.castShadow = true;
    const deck = new THREE.Mesh(catBridgeDeckGeo, teakMat);
    deck.position.set(0, 1.15, -0.4);
    const mast = new THREE.Mesh(catMastGeo, paddockDarkMat);
    mast.position.set(0, 9.8, 1.2);
    mast.castShadow = true;
    const mainSail = new THREE.Mesh(mainSailGeo, sailClothMat);
    mainSail.position.set(0, 3.0, 1.1);
    mainSail.rotation.y = 0.24;
    mainSail.castShadow = true;

    cg.add(pL, pR, deck, mast, mainSail);
    marinaGroup.add(cg);
    yachtNodes.push({
      group: cg,
      baseY: CORAL_BAY_WATER_LEVEL + 0.3,
      phase: (idx + 6) * 1.4,
      rollAmp: 0.032,
    });
  });

  group.add(marinaGroup);

  // ---------------------------------------------------------------------------
  // 4. HEADLAND LIGHTHOUSE WITH SWEEPING VOLUMETRIC NIGHT BEAM
  // ---------------------------------------------------------------------------
  const lhX = 398;
  const lhZ = 28;
  const lhY = groundHeightAt(lhX, lhZ);
  const lighthouseGroup = new THREE.Group();
  lighthouseGroup.position.set(lhX, lhY - 0.5, lhZ);

  const lhStripeMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.48 }),
  );
  const lhBase = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(4.2, 5.2, 4.5, 14)),
    concreteMat,
  );
  lhBase.position.y = 2.25;
  lhBase.castShadow = true;
  lighthouseGroup.add(lhBase);

  const lhShaft = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(2.5, 3.8, 22.0, 16)),
    hullWhiteMat,
  );
  lhShaft.position.y = 15.2;
  lhShaft.castShadow = true;
  lighthouseGroup.add(lhShaft);

  const lhBand = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(2.85, 3.15, 6.2, 16)),
    lhStripeMat,
  );
  lhBand.position.y = 17.0;
  lighthouseGroup.add(lhBand);

  const lhGallery = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(3.4, 3.1, 0.9, 16)),
    paddockDarkMat,
  );
  lhGallery.position.y = 26.4;
  lighthouseGroup.add(lhGallery);

  const lanternEmissiveMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.65,
      roughness: 0.15,
    }),
  );
  const lhLantern = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(1.9, 1.9, 3.2, 12)),
    lanternEmissiveMat,
  );
  lhLantern.position.y = 28.4;
  lighthouseGroup.add(lhLantern);

  // Rotating volumetric light beam cones mounted to lantern
  const beamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfef3c7,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
    false,
  );
  const beamGeo = trackGeo(new THREE.ConeGeometry(12.0, 95.0, 16, 1, true));
  beamGeo.translate(0, -47.5, 0);
  beamGeo.rotateZ(Math.PI * 0.5);
  const beamA = new THREE.Mesh(beamGeo, beamMat);
  const beamB = new THREE.Mesh(beamGeo, beamMat);
  beamB.rotation.y = Math.PI;
  lhLantern.add(beamA, beamB);

  const lhCap = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(2.5, 2.6, 12)), lhStripeMat);
  lhCap.position.y = 31.2;
  lighthouseGroup.add(lhCap);

  const lhBeaconLight = new THREE.PointLight(0xfde68a, 0, 160, 1.4);
  lhBeaconLight.position.set(0, 28.5, 0);
  lhBeaconLight.visible = false;
  lighthouseGroup.add(lhBeaconLight);

  group.add(lighthouseGroup);
  worldColliders.addObb(lhX, lhZ, 5.5, 5.5, 1, 0, 'concrete', lhY - 2, lhY + 32);

  // Coastal sunset crepuscular sunbeam shafts slanting across headland & lagoon
  const sunbeamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xffd79a,
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
    false,
  );
  const sunbeamGeo = trackGeo(new THREE.PlaneGeometry(34, 130));
  const sunbeamShafts: Array<{ x: number; y: number; z: number; ry: number; rz: number; s: number }> = [
    { x: lhX - 36, y: lhY + 46, z: lhZ - 24, ry: 0.62, rz: -0.34, s: 1.0 },
    { x: lhX + 18, y: lhY + 52, z: lhZ - 58, ry: 0.56, rz: -0.36, s: 1.25 },
    { x: 95, y: 42, z: -235, ry: 0.66, rz: -0.32, s: 1.35 },
  ];
  for (const sb of sunbeamShafts) {
    const shaft = new THREE.Mesh(sunbeamGeo, sunbeamMat);
    shaft.position.set(sb.x, sb.y, sb.z);
    shaft.rotation.set(0, sb.ry, sb.rz);
    shaft.scale.setScalar(sb.s);
    group.add(shaft);
  }

  // ---------------------------------------------------------------------------
  // 5. BEACHFRONT PROMENADE BOARDWALK, PARASOLS, LIFEGUARD TOWER & RESORT VILLAS
  // ---------------------------------------------------------------------------
  const parasolFabricMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, side: THREE.DoubleSide }),
  );
  const cabanaWinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.55,
      roughness: 0.22,
    }),
  );
  const tikiFlameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfdba74,
      emissive: 0xf97316,
      emissiveIntensity: 0.4,
      roughness: 0.25,
    }),
  );

  // Beachfront Promenade Timber Boardwalk planks + Parasols + Loungers + Tiki Torches
  const boardParts: THREE.BufferGeometry[] = [];
  const parasolCapGeos: THREE.BufferGeometry[] = [];
  const parasolPoleGeos: THREE.BufferGeometry[] = [];
  const tikiPoleGeos: THREE.BufferGeometry[] = [];
  const tikiFlameGeos: THREE.BufferGeometry[] = [];

  for (let bx = -195; bx <= 145; bx += 8) {
    const bz = 316 + Math.sin(bx * 0.014) * 7.0;
    const by = groundHeightAt(bx, bz);
    if (by < CORAL_BAY_WATER_LEVEL + 0.55) continue;
    if (isPointInPitBounds(pitBounds, bx, by, bz, 12, 16)) continue;
    if (circuit.queryNearest(bx, bz).absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 6.0) {
      continue;
    }
    const deckSeg = new THREE.BoxGeometry(8.2, 0.36, 4.4);
    deckSeg.rotateY(-Math.cos(bx * 0.014) * 0.12);
    deckSeg.translate(bx, by + 0.22, bz);
    boardParts.push(deckSeg);

    // Every 16m, add beach parasol + teak sun loungers seaward of boardwalk
    if (Math.abs(bx) % 16 === 0) {
      const px = bx + (rand() - 0.5) * 2.5;
      const pz = bz + 7.5 + rand() * 5.0;
      const py = groundHeightAt(px, pz);
      if (
        py > CORAL_BAY_WATER_LEVEL + 0.35 &&
        circuit.queryNearest(px, pz).absDistance > circuit.roadHalfWidth + SHOULDER_WIDTH + 6.5
      ) {
        const pole = new THREE.CylinderGeometry(0.06, 0.07, 2.7, 6);
        pole.translate(px, py + 1.35, pz);
        parasolPoleGeos.push(pole);

        const cap = new THREE.ConeGeometry(1.95, 0.72, 8);
        cap.translate(px, py + 2.75, pz);
        parasolCapGeos.push(cap);

        const lounger = new THREE.BoxGeometry(0.95, 0.28, 2.15);
        lounger.rotateY(0.18);
        lounger.translate(px + 1.15, py + 0.26, pz + 0.4);
        boardParts.push(lounger);
      }

      // Tiki torch lining the boardwalk
      const tPole = new THREE.CylinderGeometry(0.05, 0.07, 2.1, 6);
      tPole.translate(bx, by + 1.05, bz - 2.4);
      tikiPoleGeos.push(tPole);
      const tFlame = new THREE.SphereGeometry(0.16, 6, 5);
      tFlame.translate(bx, by + 2.22, bz - 2.4);
      tikiFlameGeos.push(tFlame);
    }
  }

  if (boardParts.length > 0) {
    const mB = trackGeo(BufferGeometryUtils.mergeGeometries(boardParts, false));
    boardParts.forEach((g) => g.dispose());
    const bMesh = new THREE.Mesh(mB, pierDeckMat);
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    group.add(bMesh);
  }
  if (parasolPoleGeos.length > 0) {
    const mPP = trackGeo(BufferGeometryUtils.mergeGeometries(parasolPoleGeos, false));
    parasolPoleGeos.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mPP, teakMat));
  }
  if (parasolCapGeos.length > 0) {
    const mPC = trackGeo(BufferGeometryUtils.mergeGeometries(parasolCapGeos, false));
    parasolCapGeos.forEach((g) => g.dispose());
    const pcMesh = new THREE.Mesh(mPC, parasolFabricMat);
    pcMesh.castShadow = true;
    group.add(pcMesh);
  }
  if (tikiPoleGeos.length > 0) {
    const mTP = trackGeo(BufferGeometryUtils.mergeGeometries(tikiPoleGeos, false));
    tikiPoleGeos.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mTP, pilingMat));
  }
  if (tikiFlameGeos.length > 0) {
    const mTF = trackGeo(BufferGeometryUtils.mergeGeometries(tikiFlameGeos, false));
    tikiFlameGeos.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mTF, tikiFlameMat));
  }

  // Elevated Coastal Lifeguard Watchtower near sandy surf beach
  for (const [lgX, lgZ] of [
    [76, 326],
    [-108, 322],
  ]) {
    const lgY = groundHeightAt(lgX, lgZ);
    if (
      lgY > CORAL_BAY_WATER_LEVEL + 0.45 &&
      circuit.queryNearest(lgX, lgZ).absDistance > circuit.roadHalfWidth + SHOULDER_WIDTH + 7.0
    ) {
      const lgGroup = new THREE.Group();
      lgGroup.position.set(lgX, lgY, lgZ);
      for (const sx of [-1.4, 1.4]) {
        for (const sz of [-1.4, 1.4]) {
          const stilt = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(0.24, 3.8, 0.24)),
            pilingMat,
          );
          stilt.position.set(sx, 1.7, sz);
          stilt.castShadow = true;
          lgGroup.add(stilt);
        }
      }
      const lgDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.8, 0.25, 3.8)), pierDeckMat);
      lgDeck.position.y = 3.5;
      lgGroup.add(lgDeck);
      const lgBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.8, 2.2, 2.8)), hullWhiteMat);
      lgBox.position.y = 4.7;
      lgBox.castShadow = true;
      lgGroup.add(lgBox);
      const lgRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(2.6, 1.35, 4)), lhStripeMat);
      lgRoof.rotation.y = Math.PI * 0.25;
      lgRoof.position.y = 6.45;
      lgRoof.castShadow = true;
      lgGroup.add(lgRoof);
      group.add(lgGroup);
      worldColliders.addCircle(lgX, lgZ, 2.2, 'wood', lgY - 1, lgY + 7);
    }
  }

  // Multi-Part Beachfront Resort Cabana Villas
  const cabanaWallGeos: THREE.BufferGeometry[] = [];
  const cabanaRoofGeos: THREE.BufferGeometry[] = [];
  const cabanaWinGeos: THREE.BufferGeometry[] = [];
  const cabanaCoords: Array<[number, number, number]> = [
    [-198, 272, 0.38],
    [-146, 290, 0.36],
    [-108, 304, 0.34],
    [82, 316, 0.12],
    [136, 326, 0.02],
    [255, 288, -0.42],
    [338, 178, -1.05],
    [-256, 206, 0.42],
    [195, 305, -0.25],
  ];
  for (const [cx, cz, cyaw] of cabanaCoords) {
    const cy = groundHeightAt(cx, cz);
    if (cy < CORAL_BAY_WATER_LEVEL + 0.5) continue;
    if (isPointInPitBounds(pitBounds, cx, cy, cz, 16, 26)) continue;
    if (circuit.queryNearest(cx, cz).absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 9.5) {
      continue;
    }
    const plinthV = new THREE.BoxGeometry(10.8, 1.4, 8.6);
    plinthV.rotateY(cyaw);
    plinthV.translate(cx, cy + 0.4, cz);
    cabanaWallGeos.push(plinthV);

    const body = new THREE.BoxGeometry(9.6, 4.0, 7.2);
    body.rotateY(cyaw);
    body.translate(cx, cy + 2.8, cz);
    cabanaWallGeos.push(body);

    const win = new THREE.BoxGeometry(6.4, 1.45, 7.36);
    win.rotateY(cyaw);
    win.translate(cx, cy + 3.1, cz);
    cabanaWinGeos.push(win);

    const roof = new THREE.ConeGeometry(7.6, 2.9, 4);
    roof.rotateY(Math.PI * 0.25 + cyaw);
    roof.translate(cx, cy + 6.1, cz);
    cabanaRoofGeos.push(roof);

    worldColliders.addObb(
      cx,
      cz,
      5.2,
      4.2,
      Math.cos(cyaw),
      Math.sin(cyaw),
      'concrete',
      cy - 1,
      cy + 7.5,
    );
  }
  if (cabanaWallGeos.length > 0) {
    const mW = trackGeo(BufferGeometryUtils.mergeGeometries(cabanaWallGeos, false));
    cabanaWallGeos.forEach((g) => g.dispose());
    const walls = new THREE.Mesh(mW, hullWhiteMat);
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);
  }
  if (cabanaRoofGeos.length > 0) {
    const mR = trackGeo(BufferGeometryUtils.mergeGeometries(cabanaRoofGeos, false));
    cabanaRoofGeos.forEach((g) => g.dispose());
    const roofs = new THREE.Mesh(mR, teakMat);
    roofs.castShadow = true;
    group.add(roofs);
  }
  if (cabanaWinGeos.length > 0) {
    const mWin = trackGeo(BufferGeometryUtils.mergeGeometries(cabanaWinGeos, false));
    cabanaWinGeos.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mWin, cabanaWinMat));
  }

  // ---------------------------------------------------------------------------
  // 6. FLOCKING COASTAL SEABIRDS ABOVE TURQUOISE LAGOON & MARINA
  // ---------------------------------------------------------------------------
  const birdWingL = new THREE.BoxGeometry(1.1, 0.06, 0.28);
  birdWingL.rotateZ(0.28);
  birdWingL.translate(-0.52, 0.14, 0);
  const birdWingR = new THREE.BoxGeometry(1.1, 0.06, 0.28);
  birdWingR.rotateZ(-0.28);
  birdWingR.translate(0.52, 0.14, 0);
  const birdBody = new THREE.ConeGeometry(0.14, 0.9, 5);
  birdBody.rotateX(Math.PI * 0.5);
  const birdGeo = trackGeo(
    BufferGeometryUtils.mergeGeometries([birdBody, birdWingL, birdWingR], false),
  );
  birdBody.dispose();
  birdWingL.dispose();
  birdWingR.dispose();

  const seabirdCount = 16;
  const seabirdInst = new THREE.InstancedMesh(birdGeo, hullWhiteMat, seabirdCount);
  seabirdInst.frustumCulled = false;
  group.add(seabirdInst);

  const birdSeeds = Array.from({ length: seabirdCount }, (_, i) => ({
    cx: i < 8 ? 85 : -225,
    cz: i < 8 ? -245 : 92,
    rad: 42 + (i % 5) * 18,
    alt: 32 + (i % 4) * 9,
    speed: 0.24 + (i % 3) * 0.06,
    phase: i * 1.15,
  }));
  const _birdDummy = new THREE.Object3D();
  const updateSeabirds = (elapsedSec: number) => {
    for (let i = 0; i < seabirdCount; i++) {
      const b = birdSeeds[i];
      const a = elapsedSec * b.speed + b.phase;
      const x = b.cx + Math.cos(a) * b.rad;
      const z = b.cz + Math.sin(a * 1.15) * (b.rad * 0.72);
      const y = b.alt + Math.sin(elapsedSec * 1.6 + b.phase) * 2.4;
      const dx = -Math.sin(a) * b.rad;
      const dz = Math.cos(a * 1.15) * (b.rad * 0.72) * 1.15;
      _birdDummy.position.set(x, y, z);
      _birdDummy.rotation.set(0, Math.atan2(dx, dz), Math.sin(elapsedSec * 6.5 + b.phase) * 0.14);
      _birdDummy.scale.setScalar(1.0);
      _birdDummy.updateMatrix();
      seabirdInst.setMatrixAt(i, _birdDummy.matrix);
    }
    seabirdInst.instanceMatrix.needsUpdate = true;
  };
  updateSeabirds(0);

  // ---------------------------------------------------------------------------
  // 7. CORNER FAN ZONES & ANIMATED COASTAL BEACH CRABS
  // ---------------------------------------------------------------------------
  const cornerFanZones = buildCornerFanZoneRigs(
    group,
    sharedWeather,
    CORAL_BAY_WATER_LEVEL,
    'coral_bay',
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

  // Multi-part articulated Sand/Ghost Crab mesh (flattened oval carapace + twin claws + 6 bent legs)
  const crabParts: THREE.BufferGeometry[] = [];
  const crabBody = new THREE.BoxGeometry(0.36, 0.11, 0.28);
  crabBody.translate(0, 0.09, 0);
  crabParts.push(crabBody);
  for (const sgn of [-1, 1] as const) {
    const claw = new THREE.BoxGeometry(0.11, 0.08, 0.16);
    claw.rotateY(sgn * 0.35);
    claw.translate(sgn * 0.21, 0.11, 0.16);
    crabParts.push(claw);

    const eye = new THREE.BoxGeometry(0.035, 0.07, 0.035);
    eye.translate(sgn * 0.08, 0.16, 0.12);
    crabParts.push(eye);

    for (let legIdx = -1; legIdx <= 1; legIdx++) {
      const leg = new THREE.BoxGeometry(0.20, 0.035, 0.045);
      leg.rotateZ(sgn * -0.32);
      leg.rotateY(legIdx * 0.28 * sgn);
      leg.translate(sgn * 0.24, 0.05, legIdx * 0.095);
      crabParts.push(leg);
    }
  }
  const crabGeo = trackGeo(BufferGeometryUtils.mergeGeometries(crabParts, false));
  crabParts.forEach((p) => p.dispose());
  crabGeo.computeVertexNormals();

  const crabMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.48,
    metalness: 0.12,
  });
  trackMat(crabMat);
  wireMats.push(crabMat);

  interface BeachCrabState {
    homeX: number;
    homeZ: number;
    x: number;
    z: number;
    axisX: number;
    axisZ: number;
    phase: number;
    speed: number;
    radius: number;
    scale: number;
  }
  const crabs: BeachCrabState[] = [];
  const cRand = createSeededRandom(91321);
  for (let attempt = 0; attempt < 1800 && crabs.length < 36; attempt++) {
    const cx = (cRand() - 0.5) * 820;
    const cz = (cRand() - 0.5) * 760;
    const h = groundHeightAt(cx, cz);
    if (h < CORAL_BAY_WATER_LEVEL + 0.38 || h > CORAL_BAY_WATER_LEVEL + 3.4) continue;
    const n = groundNormalAt(cx, cz, 1.0);
    if (n.y < 0.90) continue;
    const q = circuit.queryNearest(cx, cz);
    if (q.isBridge || q.absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 5.2) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, cx, h, cz, 12, 12)) continue;
    const ang = cRand() * Math.PI * 2;
    crabs.push({
      homeX: cx,
      homeZ: cz,
      x: cx,
      z: cz,
      axisX: Math.cos(ang),
      axisZ: Math.sin(ang),
      phase: cRand() * Math.PI * 2,
      speed: 1.3 + cRand() * 1.4,
      radius: 1.2 + cRand() * 2.2,
      scale: 0.85 + cRand() * 0.45,
    });
  }

  const crabInst = crabs.length > 0 ? new THREE.InstancedMesh(crabGeo, crabMat, crabs.length) : null;
  if (crabInst) {
    crabInst.castShadow = true;
    crabInst.receiveShadow = true;
    crabInst.frustumCulled = false;
    const crabColors = [0xf97316, 0xfb7185, 0xea580c, 0xfbbf24, 0xd97706];
    const tmpCol = new THREE.Color();
    for (let i = 0; i < crabs.length; i++) {
      tmpCol.setHex(crabColors[i % crabColors.length]);
      crabInst.setColorAt(i, tmpCol);
    }
    if (crabInst.instanceColor) crabInst.instanceColor.needsUpdate = true;
    group.add(crabInst);
  }

  const _crabDummy = new THREE.Object3D();
  const updateBeachCrabs = (elapsedSec: number, deltaSec: number, playerPos?: { x: number; z: number }) => {
    if (!crabInst || crabs.length === 0) return;
    const dt = Math.min(0.05, Math.max(0.001, deltaSec));
    for (let i = 0; i < crabs.length; i++) {
      const c = crabs[i];
      const patrolOff = Math.sin(elapsedSec * c.speed + c.phase) * c.radius;
      let targetX = c.homeX + c.axisX * patrolOff;
      let targetZ = c.homeZ + c.axisZ * patrolOff;
      let moveScale = 2.6;

      if (playerPos) {
        const dx = c.x - playerPos.x;
        const dz = c.z - playerPos.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < 24 * 24 && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const awayScale = (1 - dist / 24) * 6.5;
          targetX = c.homeX + (dx / dist) * awayScale;
          targetZ = c.homeZ + (dz / dist) * awayScale;
          moveScale = 7.8;
        }
      }

      const prevX = c.x;
      const prevZ = c.z;
      const alpha = 1 - Math.exp(-moveScale * dt);
      c.x = lerp(c.x, targetX, alpha);
      c.z = lerp(c.z, targetZ, alpha);

      const cy = Math.max(CORAL_BAY_WATER_LEVEL + 0.08, groundHeightAt(c.x, c.z));
      const vx = c.x - prevX;
      const vz = c.z - prevZ;
      const speedSq = vx * vx + vz * vz;
      const legBob = speedSq > 1e-6 ? Math.abs(Math.sin(elapsedSec * 18.0 + c.phase)) * 0.025 : 0;
      // Crabs scuttle sideways perpendicular to body heading
      const heading = speedSq > 1e-6 ? Math.atan2(vx, vz) + Math.PI * 0.5 : c.phase;

      _crabDummy.position.set(c.x, cy + legBob, c.z);
      _crabDummy.rotation.set(0, heading, Math.sin(elapsedSec * 14.0 + c.phase) * 0.06);
      _crabDummy.scale.setScalar(c.scale);
      _crabDummy.updateMatrix();
      crabInst.setMatrixAt(i, _crabDummy.matrix);
    }
    crabInst.instanceMatrix.needsUpdate = true;
  };
  updateBeachCrabs(0, 0.016);
  crabInst?.computeBoundingSphere();

  return {
    group,
    update: (elapsedSec: number, deltaSec = 0.016, crowdInput?: CrowdTelemetryInput) => {
      const ci = crowdInput ?? defaultCrowdInput;
      sharedPitAddon.update(elapsedSec, deltaSec, ci);
      cornerFanZones.update(deltaSec, elapsedSec, ci);
      for (const yn of yachtNodes) {
        yn.group.position.y = yn.baseY + Math.sin(elapsedSec * 1.45 + yn.phase) * 0.18;
        yn.group.rotation.z = Math.sin(elapsedSec * 1.15 + yn.phase) * yn.rollAmp;
        yn.group.rotation.x = Math.cos(elapsedSec * 0.9 + yn.phase) * (yn.rollAmp * 0.6);
      }
      lhLantern.rotation.y = elapsedSec * 1.15;
      updateSeabirds(elapsedSec);
      updateBeachCrabs(elapsedSec, deltaSec, ci.playerPos);
    },
    setNightFactor: (nightFactor: number) => {
      sharedPitAddon.setNightFactor(nightFactor);
      cornerFanZones.setNightFactor(nightFactor);
      glassHospitalityMat.emissiveIntensity = 0.14 + nightFactor * 1.55;
      lanternEmissiveMat.emissiveIntensity = 0.45 + nightFactor * 2.9;
      cabanaWinMat.emissiveIntensity = 0.28 + nightFactor * 2.4;
      tikiFlameMat.emissiveIntensity = 0.34 + nightFactor * 3.0;
      const showPl = nightFactor > 0.01;
      lhBeaconLight.intensity = nightFactor * 4.4;
      lhBeaconLight.visible = showPl;
      archNightLight.intensity = nightFactor * 3.8;
      archNightLight.visible = showPl;
      beamMat.opacity = nightFactor * 0.17;
      sunbeamMat.opacity = Math.max(0, 0.062 * (1 - nightFactor * 1.35));
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
 * Coral Bay Props & Ultra-Dense Tropical Ecosystem:
 * 1. Full Shared FIA Broadcast Kit (Composite S/F Gantry, 5 Marshal Towers + Wind Flags,
 *    Tire Barrier Stacks, Pooled Braking Boards x2, Chevrons, Speed Traps, Streetlamps & Floodlights)
 * 2. ~420 Multi-Part Coconut Palms (curved barkNormal trunk + coconut cluster + 9 swaying fronds)
 * 3. ~340 Broadleaf Tropical Banyan / Seagrape Canopy Trees
 * 4. ~1,550 Coastal Hibiscus & Monstera Shrubs + 720 Golden Beach Dune Grass Tufts
 * 5. ~420 Stratified Coral Limestone Boulders & Towering Offshore Sea Stacks
 */
export function buildCoralBayPropsAndFoliageRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): PropsAndFoliageRig {
  const group = new THREE.Group();
  group.name = 'CoralBayPropsAndFoliageRig';

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
  const rand = createSeededRandom(81421);

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
    'coral_bay',
    CORAL_BAY_WATER_LEVEL,
  );

  const scaledRegistry: Array<{
    mesh: THREE.InstancedMesh;
    fullCount: number;
    allowsShadow: boolean;
  }> = [];
  const cleanupCallbacks: Array<() => void> = [];
  let isDisposed = false;
  let keepRatio = 0.78;
  let foliageDensityScale = 1.0;
  let allowShadows = false;
  const getFoliageQualityState = () => ({
    keepRatio,
    foliageDensityScale,
    allowShadows,
  });

  const isClearForTropicalFlora = (wx: number, wz: number, extraRoadMargin = 4.4): boolean => {
    if (Math.hypot((wx + 232) / 55, (wz - 92) / 68) < 1.0) return false; // Marina water basin
    if (Math.hypot(wx - 398, wz - 28) < 12.0) return false; // Lighthouse
    if (Math.hypot(wx + 9, wz + 120) < 34.0) return false; // Waterfall canyon & plunge basin
    if (wx > -85 && wx < 55 && wz > 260 && wz < 302) return false; // Opposite main grandstand pad
    const h = groundHeightAt(wx, wz);
    if (h < CORAL_BAY_WATER_LEVEL + 0.65 || h > 78) return false;
    if (isPointInPitBounds(circuit.pitLaneBounds, wx, h, wz, 14, 28)) return false;
    const q = circuit.queryNearest(wx, wz);
    const minDist = q.isBridge ? 17.5 : roadHalf + SHOULDER_WIDTH + extraRoadMargin;
    if (q.absDistance < minDist) return false;
    return true;
  };

  const dummy = new THREE.Object3D();

  // 4x4 spatial cell grid (~240m cells) so distant palms, banyans, shrubs & rocks cull cleanly
  const CB_CELL_DIM = 4;
  const CB_HALF_SPAN = 480;
  const CB_CELL_SIZE = (CB_HALF_SPAN * 2) / CB_CELL_DIM;
  const CB_CELL_HALF_DIAG = CB_CELL_SIZE * 0.72;
  const cbCells: Array<{ group: THREE.Group; cx: number; cz: number }> = [];
  for (let czIdx = 0; czIdx < CB_CELL_DIM; czIdx++) {
    for (let cxIdx = 0; cxIdx < CB_CELL_DIM; cxIdx++) {
      const cg = new THREE.Group();
      cg.name = `CoralBayPropCell_${cxIdx}_${czIdx}`;
      group.add(cg);
      cbCells.push({
        group: cg,
        cx: -CB_HALF_SPAN + (cxIdx + 0.5) * CB_CELL_SIZE,
        cz: -CB_HALF_SPAN + (czIdx + 0.5) * CB_CELL_SIZE,
      });
    }
  }
  const getCbCellIndex = (x: number, z: number): number => {
    const cx = Math.max(0, Math.min(CB_CELL_DIM - 1, Math.floor((x + CB_HALF_SPAN) / CB_CELL_SIZE)));
    const cz = Math.max(0, Math.min(CB_CELL_DIM - 1, Math.floor((z + CB_HALF_SPAN) / CB_CELL_SIZE)));
    return cz * CB_CELL_DIM + cx;
  };
  const bucketCbInstancedIntoCells = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    matrices: THREE.Matrix4[],
    colors: THREE.Color[] | null,
    castShadow: boolean,
    receiveShadow: boolean,
  ): THREE.InstancedMesh[][] => {
    const byCell: THREE.InstancedMesh[][] = Array.from({ length: cbCells.length }, () => []);
    if (matrices.length === 0) return byCell;
    const perCellM: THREE.Matrix4[][] = Array.from({ length: cbCells.length }, () => []);
    const perCellC: THREE.Color[][] = Array.from({ length: cbCells.length }, () => []);
    for (let i = 0; i < matrices.length; i++) {
      const m = matrices[i];
      const ci = getCbCellIndex(m.elements[12], m.elements[14]);
      perCellM[ci].push(m);
      if (colors) perCellC[ci].push(colors[i]);
    }
    for (let ci = 0; ci < cbCells.length; ci++) {
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
      cbCells[ci].group.add(inst);
      scaledRegistry.push({ mesh: inst, fullCount: bm.length, allowsShadow: castShadow });
      byCell[ci].push(inst);
    }
    return byCell;
  };

  // ---------------------------------------------------------------------------
  // 2. COMPOSITE COCONUT PALMS (Curved Trunk + Coconut Cluster + 9-Frond Crown)
  // ---------------------------------------------------------------------------
  const trunkSegs: THREE.BufferGeometry[] = [];
  for (let s = 0; s < 6; s++) {
    const rBot = lerp(0.36, 0.13, s / 6);
    const rTop = lerp(0.36, 0.13, (s + 1) / 6);
    const seg = new THREE.CylinderGeometry(rTop, rBot, 1.85, 8);
    seg.translate(Math.sin(s * 0.24) * 0.45, 0.92 + s * 1.72, 0);
    seg.rotateZ(-0.045 * s);
    trunkSegs.push(seg);
  }
  const palmTrunkGeo = trackGeo(BufferGeometryUtils.mergeGeometries(trunkSegs, false));
  trunkSegs.forEach((g) => g.dispose());

  const frondParts: THREE.BufferGeometry[] = [];
  for (let f = 0; f < 10; f++) {
    const ang = (f / 10) * Math.PI * 2 + (f % 2) * 0.16;
    const pitchBase = 0.28 + (f % 3) * 0.14;
    // Curved arched palm frond stem + cascading leaflet blades (4 overlapping arched segments)
    for (let seg = 0; seg < 4; seg++) {
      const distOut = 0.65 + seg * 1.05;
      const archY = 10.25 + (f % 2) * 0.22 + Math.sin((seg / 3) * Math.PI * 0.85) * 0.65 - seg * seg * 0.22;
      const wBlade = (1.0 - seg * 0.17) * 0.82;
      const blade = new THREE.ConeGeometry(wBlade, 1.45, 5);
      const nb = blade.toNonIndexed();
      blade.dispose();
      nb.scale(0.85, 1.0, 0.16);
      nb.rotateZ(-Math.PI * (pitchBase + seg * 0.12));
      nb.translate(distOut, archY, 0);
      nb.rotateY(ang);
      frondParts.push(nb);
    }
  }
  for (let c = 0; c < 4; c++) {
    const ang = (c / 4) * Math.PI * 2;
    const nut = new THREE.DodecahedronGeometry(0.24, 0);
    nut.translate(Math.cos(ang) * 0.38 + 0.55, 9.7, Math.sin(ang) * 0.38);
    frondParts.push(nut);
  }
  const palmCrownGeo = trackGeo(BufferGeometryUtils.mergeGeometries(frondParts, false));
  frondParts.forEach((g) => g.dispose());

  const barkMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.barkAlbedo,
      normalMap: textures.barkNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      color: 0xb69b7d,
      roughness: 0.92,
      metalness: 0.0,
    }),
  );

  const palmCrownMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.65,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
  );

  const palmTransforms: THREE.Matrix4[] = [];
  const palmColors: THREE.Color[] = [];

  for (let i = 0; i < N; i += 4) {
    const s = samples[i];
    if (s.isBridge) continue;
    for (const side of [-1, 1] as const) {
      if (rand() < 0.14) continue;
      const lat = side * (roadHalf + SHOULDER_WIDTH + 5.4 + rand() * 19);
      const px = s.position.x + s.right.x * lat + (rand() - 0.5) * 3.5;
      const pz = s.position.z + s.right.z * lat + (rand() - 0.5) * 3.5;
      if (!isClearForTropicalFlora(px, pz, 4.2)) continue;
      const py = groundHeightAt(px, pz);
      dummy.position.set(px, py - 0.24, pz);
      dummy.rotation.set((rand() - 0.5) * 0.14, rand() * Math.PI * 2, (rand() - 0.5) * 0.14);
      const sc = 0.85 + rand() * 0.45;
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      palmTransforms.push(dummy.matrix.clone());
      palmColors.push(new THREE.Color().setHSL(0.29 + rand() * 0.06, 0.56, 0.32 + rand() * 0.12));
      worldColliders.addCircle(px, pz, 0.42 * sc, 'wood', py - 1, py + 9);
    }
  }

  for (let k = 0; k < 1050; k++) {
    const px = (rand() - 0.5) * 860;
    const pz = (rand() - 0.5) * 820;
    if (!isClearForTropicalFlora(px, pz, 4.4)) continue;
    const py = groundHeightAt(px, pz);
    dummy.position.set(px, py - 0.24, pz);
    dummy.rotation.set((rand() - 0.5) * 0.12, rand() * Math.PI * 2, (rand() - 0.5) * 0.12);
    const sc = 0.84 + rand() * 0.48;
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    palmTransforms.push(dummy.matrix.clone());
    palmColors.push(new THREE.Color().setHSL(0.3 + rand() * 0.05, 0.55, 0.34 + rand() * 0.1));
    worldColliders.addCircle(px, pz, 0.42 * sc, 'wood', py - 1, py + 9);
  }

  const palmTrunksByCell = bucketCbInstancedIntoCells(palmTrunkGeo, barkMat, palmTransforms, null, true, false);
  const palmCrownsByCell = bucketCbInstancedIntoCells(palmCrownGeo, palmCrownMat, palmTransforms, palmColors, true, true);

  for (let ci = 0; ci < cbCells.length; ci++) {
    const cellMatrices: THREE.Matrix4[] = [];
    const cellGlbColors: THREE.Color[] = [];
    for (let i = 0; i < palmTransforms.length; i++) {
      const m = palmTransforms[i];
      if (getCbCellIndex(m.elements[12], m.elements[14]) === ci) {
        cellMatrices.push(m);
        const shade = 0.88 + ((i * 37) % 19) * 0.01;
        cellGlbColors.push(new THREE.Color(shade, shade * 1.02, shade * 0.96));
      }
    }
    if (cellMatrices.length === 0) continue;
    attachInstancedUserAsset({
      assetId: 'palm_tree',
      parentGroup: cbCells[ci].group,
      matrices: cellMatrices,
      colors: cellGlbColors,
      fallbackMeshes: [...palmTrunksByCell[ci], ...palmCrownsByCell[ci]],
      scaledRegistry,
      allowsShadow: true,
      isDisposed: () => isDisposed,
      getQualityState: getFoliageQualityState,
      cleanupCallbacks,
    });
  }

  // ---------------------------------------------------------------------------
  // 3. BROADLEAF TROPICAL BANYAN / SEAGRAPE CANOPY TREES (~340)
  // ---------------------------------------------------------------------------
  const banyanTrunkParts: THREE.BufferGeometry[] = [];
  const mainStem = new THREE.CylinderGeometry(0.24, 0.52, 4.2, 8);
  mainStem.translate(0, 2.1, 0);
  banyanTrunkParts.push(mainStem);
  for (let b = 0; b < 4; b++) {
    const ang = (b / 4) * Math.PI * 2 + 0.3;
    const limb = new THREE.CylinderGeometry(0.11, 0.22, 3.2, 6);
    limb.translate(0, 1.6, 0);
    limb.rotateZ(0.55);
    limb.rotateY(ang);
    limb.translate(0, 3.3, 0);
    banyanTrunkParts.push(limb);
  }
  const banyanTrunkGeo = trackGeo(BufferGeometryUtils.mergeGeometries(banyanTrunkParts, false));
  banyanTrunkParts.forEach((g) => g.dispose());

  const banyanCanopyParts: THREE.BufferGeometry[] = [];
  const crownNodes = [
    [0, 6.2, 0, 2.6],
    [1.6, 5.4, 0.8, 2.05],
    [-1.5, 5.5, 0.9, 1.95],
    [0.5, 5.2, -1.7, 2.1],
    [-0.9, 6.9, -0.5, 1.75],
  ];
  for (const [cx, cy, cz, rad] of crownNodes) {
    const puff = new THREE.DodecahedronGeometry(rad, 1);
    const pPos = puff.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pPos.count; v++) {
      const vx = pPos.getX(v);
      const vy = pPos.getY(v);
      const vz = pPos.getZ(v);
      const ruffle = 0.88 + 0.22 * Math.sin(vx * 3.1 + cx) * Math.cos(vz * 3.2);
      pPos.setXYZ(v, vx * ruffle, vy * 0.72 * ruffle, vz * ruffle);
    }
    puff.computeVertexNormals();
    puff.translate(cx, cy, cz);
    banyanCanopyParts.push(puff);
  }
  const banyanCanopyGeo = trackGeo(BufferGeometryUtils.mergeGeometries(banyanCanopyParts, false));
  banyanCanopyParts.forEach((g) => g.dispose());

  const banyanTransforms: THREE.Matrix4[] = [];
  const banyanColors: THREE.Color[] = [];
  const banyanPalette = [
    new THREE.Color(0x286634),
    new THREE.Color(0x327a3d),
    new THREE.Color(0x20542c),
    new THREE.Color(0x3e8744),
  ];

  let bAttempts = 0;
  while (banyanTransforms.length < 1550 && bAttempts < 19500) {
    bAttempts++;
    const bx = (rand() - 0.5) * 860;
    const bz = (rand() - 0.5) * 820;
    if (!isClearForTropicalFlora(bx, bz, 6.2)) continue;
    const by = groundHeightAt(bx, bz);
    if (by < CORAL_BAY_WATER_LEVEL + 2.2) continue; // Inland cliffs, caldera slopes & meadows
    const n = groundNormalAt(bx, bz, 1.5);
    if (n.y < 0.62) continue;

    const grove = fbm2D(bx * 0.012, bz * 0.012, 3, 2.0, 0.5, 441);
    if (rand() > 0.55 + grove * 0.45) continue;

    const sc = 0.78 + rand() * 0.52;
    dummy.position.set(bx, by - 0.25, bz);
    dummy.rotation.set((rand() - 0.5) * 0.08, rand() * Math.PI * 2, (rand() - 0.5) * 0.08);
    dummy.scale.set(sc, sc * (0.88 + rand() * 0.28), sc);
    dummy.updateMatrix();
    banyanTransforms.push(dummy.matrix.clone());
    const c = banyanPalette[Math.floor(rand() * banyanPalette.length)].clone();
    c.offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.05);
    banyanColors.push(c);
    worldColliders.addCircle(bx, bz, 0.55 * sc, 'wood', by - 1, by + 7);
  }

  bucketCbInstancedIntoCells(banyanTrunkGeo, barkMat, banyanTransforms, null, true, false);
  bucketCbInstancedIntoCells(banyanCanopyGeo, palmCrownMat, banyanTransforms, banyanColors, true, true);

  // ---------------------------------------------------------------------------
  // 4. COASTAL HIBISCUS / MONSTERA SHRUBS (~1,550) & BEACH DUNE GRASS (~720)
  // ---------------------------------------------------------------------------
  const shrubParts: THREE.BufferGeometry[] = [];
  for (let s = 0; s < 4; s++) {
    const puff = new THREE.DodecahedronGeometry(0.68 - s * 0.07, 0);
    puff.scale(1.18, 0.72, 1.18);
    puff.rotateY(s * 1.1);
    puff.translate((s - 1.5) * 0.3, 0.28 + (s % 2) * 0.12, ((s * 2) % 3 - 1) * 0.24);
    shrubParts.push(puff);
  }
  const shrubGeo = trackGeo(BufferGeometryUtils.mergeGeometries(shrubParts, false));
  shrubParts.forEach((g) => g.dispose());

  const shrubMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.84,
      metalness: 0.02,
    }),
  );

  const shrubTransforms: THREE.Matrix4[] = [];
  const shrubColors: THREE.Color[] = [];
  const shrubPalette = [
    new THREE.Color(0x2f7d3a),
    new THREE.Color(0x419244),
    new THREE.Color(0x529c46),
    new THREE.Color(0x246630),
    new THREE.Color(0x9a4658), // Hibiscus blossom accent bush
  ];

  let sAttempts = 0;
  while (shrubTransforms.length < 2450 && sAttempts < 19500) {
    sAttempts++;
    const rx = (rand() - 0.5) * 860;
    const rz = (rand() - 0.5) * 820;
    if (!isClearForTropicalFlora(rx, rz, 3.6)) continue;
    const q = circuit.queryNearest(rx, rz);
    if (rand() > (q.absDistance < roadHalf + 42 ? 0.9 : 0.45)) continue;
    const ry = groundHeightAt(rx, rz);
    if (ry < CORAL_BAY_WATER_LEVEL + 0.55 || ry > 76) continue;
    const n = groundNormalAt(rx, rz, 1.2);
    if (n.y < 0.60) continue;

    const sc = 0.55 + rand() * 0.92;
    dummy.position.set(rx, ry - 0.1, rz);
    dummy.rotation.set((rand() - 0.5) * 0.18, rand() * Math.PI * 2, (rand() - 0.5) * 0.18);
    dummy.scale.set(sc * (0.9 + rand() * 0.35), sc * (0.75 + rand() * 0.4), sc * (0.9 + rand() * 0.35));
    dummy.updateMatrix();
    shrubTransforms.push(dummy.matrix.clone());

    const pick = rand() < 0.1 ? shrubPalette[4] : shrubPalette[Math.floor(rand() * 4)];
    const col = pick.clone();
    col.offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.05);
    shrubColors.push(col);
  }

  bucketCbInstancedIntoCells(shrubGeo, shrubMat, shrubTransforms, shrubColors, false, true);

  // Beach Dune Grass Tufts along sandy coast & coral dunes
  const grassBlades: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 5; b++) {
    const blade = new THREE.ConeGeometry(0.11, 0.95, 3);
    blade.rotateZ((b - 2) * 0.24);
    blade.rotateY(b * 1.25);
    blade.translate(Math.cos(b * 1.25) * 0.18, 0.42, Math.sin(b * 1.25) * 0.18);
    grassBlades.push(blade);
  }
  const duneGrassGeo = trackGeo(BufferGeometryUtils.mergeGeometries(grassBlades, false));
  grassBlades.forEach((g) => g.dispose());

  const duneTransforms: THREE.Matrix4[] = [];
  const duneColors: THREE.Color[] = [];
  let dgAttempts = 0;
  while (duneTransforms.length < 1350 && dgAttempts < 12000) {
    dgAttempts++;
    const gx = (rand() - 0.5) * 780;
    const gz = (rand() - 0.5) * 760;
    if (!isClearForTropicalFlora(gx, gz, 3.2)) continue;
    const gy = groundHeightAt(gx, gz);
    if (gy < CORAL_BAY_WATER_LEVEL + 0.38 || gy > CORAL_BAY_WATER_LEVEL + 7.2) continue;
    const sc = 0.75 + rand() * 0.75;
    dummy.position.set(gx, gy - 0.08, gz);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(sc, sc * (0.85 + rand() * 0.4), sc);
    dummy.updateMatrix();
    duneTransforms.push(dummy.matrix.clone());
    duneColors.push(new THREE.Color().setHSL(0.24 + rand() * 0.06, 0.44, 0.42 + rand() * 0.14));
  }
  bucketCbInstancedIntoCells(duneGrassGeo, shrubMat, duneTransforms, duneColors, false, false);

  // ---------------------------------------------------------------------------
  // 5. STRATIFIED CORAL LIMESTONE BOULDERS & DRAMATIC OFFSHORE SEA STACKS
  // ---------------------------------------------------------------------------
  const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1.5, 1));
  const rPos = rockGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rPos.count; i++) {
    const vx = rPos.getX(i);
    const vy = rPos.getY(i);
    const vz = rPos.getZ(i);
    const warp = 0.82 + Math.sin(vx * 2.1 + vz * 1.7) * 0.18 + Math.cos(vy * 3.0) * 0.14;
    rPos.setXYZ(i, vx * warp * 1.24, vy * warp * 0.8, vz * warp);
  }
  rockGeo.computeVertexNormals();

  const rockMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      color: 0xc8bfa8,
      roughness: 0.9,
      metalness: 0.04,
    }),
  );

  const rockMatrices: THREE.Matrix4[] = [];
  const rockColors: THREE.Color[] = [];
  let rockAttempts = 0;
  while (rockMatrices.length < 520 && rockAttempts < 5800) {
    rockAttempts++;
    const rx = (rand() - 0.5) * 860;
    const rz = (rand() - 0.5) * 820;
    if (Math.hypot(rx + 9, rz + 120) < 34.0) continue;
    if (rx > -85 && rx < 55 && rz > 260 && rz < 302) continue;
    const ry = groundHeightAt(rx, rz);
    if (ry < CORAL_BAY_WATER_LEVEL - 0.5 || ry > 82) continue;
    const q = circuit.queryNearest(rx, rz);
    if (q.absDistance < roadHalf + SHOULDER_WIDTH + 5.2) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, rx, ry, rz, 12, 24)) continue;

    const sBase = 0.65 + rand() * 2.25;
    dummy.position.set(rx, ry - sBase * 0.35, rz);
    dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    dummy.scale.set(sBase * (0.9 + rand() * 0.5), sBase * (0.6 + rand() * 0.45), sBase * (0.9 + rand() * 0.5));
    dummy.updateMatrix();
    rockMatrices.push(dummy.matrix.clone());
    const sh = 0.82 + rand() * 0.28;
    rockColors.push(new THREE.Color(sh, sh * 0.96, sh * 0.88));
    worldColliders.addCircle(rx, rz, 1.3 * sBase, 'rock', ry - 2, ry + 5);
  }

  // Towering eroded Offshore Sea Stacks emerging from Turquoise Coral Lagoon & Coastal Surf
  const seaStackCoords: Array<[number, number, number]> = [
    [168, -285, 1.35],
    [195, -204, 1.15],
    [52, -310, 1.45],
    [35, -182, 1.05],
    [142, -112, 1.25],
    [372, -162, 1.65],
    [392, -38, 1.5],
    [388, 122, 1.4],
    [-245, -352, 1.55],
    [-365, -210, 1.48],
    [-382, 232, 1.3],
    [224, 348, 1.4],
    [340, 295, 1.5],
    [42, 365, 1.25],
    [-125, 345, 1.3],
    [-255, 315, 1.4],
  ];
  for (const [sx, sz, sScale] of seaStackCoords) {
    const q = circuit.queryNearest(sx, sz);
    if (q.absDistance < roadHalf + SHOULDER_WIDTH + 16) continue;
    const bed = groundHeightAt(sx, sz);
    if (bed > CORAL_BAY_WATER_LEVEL + 1.8) continue;
    dummy.position.set(sx, CORAL_BAY_WATER_LEVEL + 2.2 * sScale, sz);
    dummy.rotation.set((rand() - 0.5) * 0.12, rand() * Math.PI * 2, (rand() - 0.5) * 0.12);
    dummy.scale.set(4.5 * sScale, 7.2 * sScale, 3.9 * sScale);
    dummy.updateMatrix();
    rockMatrices.push(dummy.matrix.clone());
    rockColors.push(new THREE.Color(0.86, 0.81, 0.72));
  }

  bucketCbInstancedIntoCells(rockGeo, rockMat, rockMatrices, rockColors, true, true);

  return {
    group,
    setNightFactor: (nightFactor: number) => {
      tracksideInfra.setNightFactor(nightFactor);
    },
    updateVisibilityWindow: (
      focusPos: THREE.Vector3,
      radiusM = 580,
      camPos?: THREE.Vector3,
      camFwd?: THREE.Vector3,
    ) => {
      tracksideInfra.updateVisibilityWindow(focusPos, camPos, camFwd);
      const maxR = radiusM + CB_CELL_HALF_DIAG;
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
      for (let c = 0; c < cbCells.length; c++) {
        const cell = cbCells[c];
        const dx = cell.cx - focusPos.x;
        const dz = cell.cz - focusPos.z;
        if (dx * dx + dz * dz > maxRSq) {
          cell.group.visible = false;
          continue;
        }
        if (hasCamDir && camPos) {
          const cdx = cell.cx - camPos.x;
          const cdz = cell.cz - camPos.z;
          if (cdx * fwdX + cdz * fwdZ < -(CB_CELL_HALF_DIAG + 14)) {
            cell.group.visible = false;
            continue;
          }
        }
        cell.group.visible = true;
      }
    },
    setGraphicsQuality: (quality: PropsQualityTier) => {
      keepRatio = quality === 'performance' ? 0.38 : quality === 'balanced' ? 0.72 : 1.0;
      allowShadows = quality === 'ultra';
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
      isDisposed = true;
      for (const cb of cleanupCallbacks) cb();
      tracksideInfra.dispose();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}
