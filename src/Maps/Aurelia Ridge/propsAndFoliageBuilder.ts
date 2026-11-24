import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createCircuitQueryScratch,
  getCircuitData,
  ROAD_HALF_WIDTH,
  SHOULDER_WIDTH,
  WATER_LEVEL,
} from './circuitSpline';
import { createSeededRandom, fbm2D, lerp } from '../../engine/mathNoise';
import { ProceduralTextureSuite } from './proceduralTextures';
import { type WeatherUniforms } from './skyAndLighting';
import { groundHeightAt, groundNormalAtInto } from './terrainField';
import { worldColliders } from './worldColliders';
import { attachInstancedUserAsset, type UserAssetId } from '../../engine/userAssetsLoader';

export type PropsQualityTier = 'performance' | 'balanced' | 'ultra';

export interface PropsAndFoliageRig {
  group: THREE.Group;
  setNightFactor: (nightFactor: number) => void;
  updateVisibilityWindow: (
    focusPos: THREE.Vector3,
    radiusM?: number,
    camPos?: THREE.Vector3,
    camFwd?: THREE.Vector3,
  ) => void;
  setGraphicsQuality: (quality: PropsQualityTier) => void;
  setFoliageDensity?: (density: number) => void;
  dispose: () => void;
}

/**
 * Populates the redesigned 2.9km circuit with composite Start/Finish Gantry,
 * Race-Control Pavilion, track flood/streetlamps, chevron & braking distance signs,
 * and instanced wind-animated alpine pines, Mediterranean cypresses, scrub, and boulders.
 */
export function buildPropsAndFoliageRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): PropsAndFoliageRig {
  const group = new THREE.Group();
  group.name = 'PropsAndFoliageRig';

  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };

  const isInLandmarkFootprint = (wx: number, wz: number): boolean => {
    // Pit-Lane Apron, Paddock Garages & Race Control Pavilion
    if (wx > -148 && wx < 118 && wz > 194 && wz < 245) return true;
    // Main Grandstand overlooking Pit Straight
    if (wx > 10 && wx < 126 && wz > 250 && wz < 290) return true;
    // Gorge Waterfall rock outcrop
    if (wx > 26 && wx < 68 && wz > -72 && wz < -18) return true;
    return false;
  };

  const circuit = getCircuitData();
  const samples = circuit.samples;
  const N = samples.length;
  const rand = createSeededRandom(94871);
  const propQScratch = createCircuitQueryScratch(samples[0]);
  const propNormScratch = new THREE.Vector3();

  // Collect tunnel portal worlds positions so foliage/boulders never block tunnel mouths
  const tunnelPortalZones: Array<{ x: number; z: number }> = [];
  for (const [startT, endT] of circuit.tunnelRanges) {
    const sStart = circuit.sampleAtT(startT);
    const sEnd = circuit.sampleAtT(endT);
    tunnelPortalZones.push({ x: sStart.position.x, z: sStart.position.z });
    tunnelPortalZones.push({ x: sEnd.position.x, z: sEnd.position.z });
  }

  const isBlockedByTunnelPortal = (
    wx: number,
    wz: number,
    q: ReturnType<typeof circuit.queryNearestInto>,
    extraPad = 0,
  ): boolean => {
    if ((q.sample.isTunnel || q.nextSample.isTunnel) && q.absDistance < roadHalf + SHOULDER_WIDTH + 14.0 + extraPad) {
      return true;
    }
    const rSq = (24 + extraPad) * (24 + extraPad);
    for (let i = 0; i < tunnelPortalZones.length; i++) {
      const p = tunnelPortalZones[i];
      const dx = wx - p.x;
      const dz = wz - p.z;
      if (dx * dx + dz * dz < rSq) return true;
    }
    return false;
  };

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

  const darkCarbonMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b2028,
      roughness: 0.42,
      metalness: 0.55,
    }),
  );
  const brushedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb0b8c2,
      roughness: 0.28,
      metalness: 0.88,
      envMapIntensity: 1.25,
    }),
  );
  const concreteFootMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      roughness: 0.86,
      metalness: 0.04,
    }),
  );
  const amberAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.35,
      metalness: 0.25,
    }),
  );
  const glassDeckMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x203542,
      emissive: 0xffb85c,
      emissiveIntensity: 0.05,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );

  const sfIdx = circuit.startFinishIndex;
  const sfSample = samples[sfIdx];
  const sfBasis = new THREE.Matrix4().makeBasis(
    sfSample.right,
    sfSample.up,
    sfSample.tangent.clone().negate(),
  );

  // ---------------------------------------------------------------------------
  // 1. COMPOSITE START / FINISH TIMING GANTRY (Span lands squarely on Pit Wall!)
  // ---------------------------------------------------------------------------
  const gantry = new THREE.Group();
  gantry.name = 'StartFinishGantry';
  const roadHalf = circuit.roadHalfWidth;
  const spanW = roadHalf * 2 + 4.6;
  const gantryH = 8.6;

  for (const side of [-1, 1] as const) {
    const xOff = side * (spanW * 0.5);
    const foot = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 1.4, 1.8)), concreteFootMat);
    foot.position.set(xOff, 0.5, 0);
    foot.castShadow = true;
    foot.receiveShadow = true;
    gantry.add(foot);

    const pylon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.64, gantryH, 0.74)), darkCarbonMat);
    pylon.position.set(xOff, gantryH * 0.5 + 0.6, 0);
    pylon.castShadow = true;
    gantry.add(pylon);

    const trim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, gantryH * 0.85, 0.84)), amberAccentMat);
    trim.position.set(xOff - side * 0.34, gantryH * 0.5 + 0.6, 0);
    gantry.add(trim);

    const gx = sfSample.position.x + sfSample.right.x * xOff;
    const gz = sfSample.position.z + sfSample.right.z * xOff;
    worldColliders.addObb(
      gx,
      gz,
      0.85,
      0.95,
      sfSample.right.x,
      sfSample.right.z,
      'concrete',
      sfSample.position.y - 2.0,
      sfSample.position.y + gantryH,
    );
  }

  const topBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(spanW + 0.8, 0.48, 0.95)), brushedSteelMat);
  topBeam.position.set(0, gantryH + 0.65, 0);
  topBeam.castShadow = true;
  gantry.add(topBeam);

  const bannerBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(spanW - 1.2, 2.2, 0.55)), darkCarbonMat);
  bannerBox.position.set(0, gantryH - 0.55, 0);
  bannerBox.castShadow = true;
  gantry.add(bannerBox);

  const bannerFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.gantryBannerAlbedo,
      emissiveMap: textures.gantryBannerAlbedo,
      emissive: 0xffffff,
      emissiveIntensity: 0.1,
      roughness: 0.45,
      metalness: 0.1,
    }),
  );
  const bannerFront = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(spanW - 1.6, 1.95)), bannerFaceMat);
  bannerFront.position.set(0, gantryH - 0.55, 0.29);
  gantry.add(bannerFront);

  const bannerBack = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(spanW - 1.6, 1.95)), bannerFaceMat);
  bannerBack.position.set(0, gantryH - 0.55, -0.29);
  bannerBack.rotation.y = Math.PI;
  gantry.add(bannerBack);

  const podBezelGeo = trackGeo(new THREE.BoxGeometry(0.65, 0.95, 0.28));
  const podLensGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14));
  podLensGeo.rotateX(Math.PI / 2);
  const podLensMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b1212,
      emissive: 0xaa1a1a,
      emissiveIntensity: 0.05,
      roughness: 0.18,
      metalness: 0.2,
    }),
  );
  for (let p = -2; p <= 2; p++) {
    const pod = new THREE.Mesh(podBezelGeo, darkCarbonMat);
    pod.position.set(p * 1.45, gantryH - 2.05, 0.12);
    gantry.add(pod);
    const lens = new THREE.Mesh(podLensGeo, podLensMat);
    lens.position.set(p * 1.45, gantryH - 2.05, 0.27);
    gantry.add(lens);
  }

  // Night gantry floodlight illuminating the Start/Finish grid below
  const gantryNightLight = new THREE.PointLight(0xffcf88, 0, 70, 1.5);
  gantryNightLight.position.set(0, gantryH - 0.8, 0);
  gantryNightLight.visible = false;
  gantry.add(gantryNightLight);

  gantry.position.copy(sfSample.position);
  gantry.quaternion.setFromRotationMatrix(sfBasis);
  group.add(gantry);

  // ---------------------------------------------------------------------------
  // 2. ARCHITECTURAL RACE-CONTROL & TIMING PAVILION (West end of Paddock Garages)
  // ---------------------------------------------------------------------------
  const tower = new THREE.Group();
  tower.name = 'RaceControlPavilion';
  const tx = -104.5;
  const tz = 208.5;
  const ty = 20.0;

  const podium = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.0, 14.5, 16.0)), concreteFootMat);
  podium.position.set(0, -4.0, 0);
  podium.castShadow = true;
  podium.receiveShadow = true;
  tower.add(podium);

  const upperDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.2, 0.55, 17.5)), darkCarbonMat);
  upperDeck.position.set(0, 3.35, 0.5);
  upperDeck.castShadow = true;
  tower.add(upperDeck);

  const obsGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10.8, 3.3, 15.6)), glassDeckMat);
  obsGlass.position.set(0, 5.25, 0.5);
  tower.add(obsGlass);

  const roof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.2, 0.5, 18.8)), brushedSteelMat);
  roof.position.set(0, 7.15, 0.8);
  roof.castShadow = true;
  tower.add(roof);

  const roofTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.3, 0.16, 18.9)), amberAccentMat);
  roofTrim.position.set(0, 6.85, 0.8);
  tower.add(roofTrim);

  const mast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.18, 4.4, 8)), brushedSteelMat);
  mast.position.set(-2.2, 9.5, -3.5);
  mast.castShadow = true;
  tower.add(mast);

  tower.position.set(tx, ty, tz);
  group.add(tower);
  worldColliders.addObb(tx, tz, 6.2, 8.8, 1, 0, 'concrete', 12.0, 30.0);

  // ---------------------------------------------------------------------------
  // 3. ROADSIDE STREETLAMPS (Pit Straight, Cable-Stayed Bridge & Karussell Bowl)
  // ---------------------------------------------------------------------------
  const poleBaseGeo = new THREE.CylinderGeometry(0.08, 0.14, 6.6, 8);
  poleBaseGeo.translate(0, 3.3, 0);
  const armGeo = new THREE.BoxGeometry(1.9, 0.12, 0.12);
  armGeo.translate(-0.9, 6.52, 0);
  const singlePoleGeo = trackGeo(BufferGeometryUtils.mergeGeometries([poleBaseGeo, armGeo], false));
  poleBaseGeo.dispose();
  armGeo.dispose();

  const lumHeadGeo = trackGeo(new THREE.BoxGeometry(0.82, 0.14, 0.36));
  const lumMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffd592,
      emissive: 0xffac40,
      emissiveIntensity: 0.2,
      roughness: 0.25,
      metalness: 0.1,
    }),
  );

  const poleMatrices: THREE.Matrix4[] = [];
  const lumMatrices: THREE.Matrix4[] = [];
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < N; i += 15) {
    const s = samples[i];
    const inKarussell = s.position.x > -40 && s.position.x < 240 && s.position.z < -105 && s.position.z > -225;
    if (!s.isBridge && !s.isStraight && !inKarussell) continue;

    const sides = s.isBridge ? ([-1, 1] as const) : ([1] as const);
    for (const side of sides) {
      // On bridge, mount squarely atop the concrete parapet (deckHalfW - 0.35 = 10.05m, parapetH = 1.18m)
      const lat = side * (s.isBridge ? roadHalf + 2.55 : roadHalf + SHOULDER_WIDTH + 0.75);
      const px = s.position.x + s.right.x * lat;
      const pz = s.position.z + s.right.z * lat;
      const py = s.isBridge ? s.position.y + 1.14 : groundHeightAt(px, pz);

      const basisRight = s.right.clone().multiplyScalar(side);
      const basisFwd = s.tangent.clone().multiplyScalar(-side);
      tmpQuat.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(basisRight, new THREE.Vector3(0, 1, 0), basisFwd),
      );

      poleMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), tmpQuat, tmpScale));
      worldColliders.addCircle(px, pz, 0.24, 'metal', py - 1.0, py + 7.0);

      const lumLocal = new THREE.Vector3(-1.45, 6.42, 0).applyQuaternion(tmpQuat).add(new THREE.Vector3(px, py, pz));
      lumMatrices.push(new THREE.Matrix4().compose(lumLocal, tmpQuat, tmpScale));
    }
  }

  const poleInst =
    poleMatrices.length > 0
      ? new THREE.InstancedMesh(singlePoleGeo, darkCarbonMat, poleMatrices.length)
      : null;
  const lumInst =
    lumMatrices.length > 0
      ? new THREE.InstancedMesh(lumHeadGeo, lumMat, lumMatrices.length)
      : null;
  const polePositions: THREE.Vector3[] = [];
  if (poleInst && lumInst) {
    for (let i = 0; i < poleMatrices.length; i++) {
      poleInst.setMatrixAt(i, poleMatrices[i]);
      lumInst.setMatrixAt(i, lumMatrices[i]);
      const pPos = new THREE.Vector3();
      pPos.setFromMatrixPosition(poleMatrices[i]);
      polePositions.push(pPos);
    }
    poleInst.instanceMatrix.needsUpdate = true;
    lumInst.instanceMatrix.needsUpdate = true;
    poleInst.computeBoundingSphere();
    lumInst.computeBoundingSphere();
    poleInst.castShadow = true;
    group.add(poleInst, lumInst);
  }

  // ---------------------------------------------------------------------------
  // 4. ROADSIDE PROP POOL (Chevron Signs, Distance Boards & Speed-Trap Arches)
  // ---------------------------------------------------------------------------
  const signPostGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 2.35, 6));
  const chevronPlateGeo = trackGeo(new THREE.BoxGeometry(1.5, 1.5, 0.08));
  const distPlateGeo = trackGeo(new THREE.BoxGeometry(1.35, 1.35, 0.08));

  const chevronMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.chevronSignAlbedo,
      emissiveMap: textures.chevronSignAlbedo,
      emissive: 0xffb336,
      emissiveIntensity: 0.05,
      roughness: 0.38,
      metalness: 0.15,
    }),
  );
  const distMats = [
    trackMat(new THREE.MeshStandardMaterial({ map: textures.distanceSign150Albedo, roughness: 0.42 })),
    trackMat(new THREE.MeshStandardMaterial({ map: textures.distanceSign100Albedo, roughness: 0.42 })),
    trackMat(new THREE.MeshStandardMaterial({ map: textures.distanceSign50Albedo, roughness: 0.42 })),
  ];

  interface ChevronDescriptor {
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    flipX: boolean;
  }
  interface DistBoardDescriptor {
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    boardIdx: number;
  }
  interface SpeedTrapDescriptor {
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
  }

  const chevronDescs: ChevronDescriptor[] = [];
  const distBoardDescs: DistBoardDescriptor[] = [];
  const speedTrapDescs: SpeedTrapDescriptor[] = [];
  const tmpLookDummy = new THREE.Object3D();

  let lastChevronIdx = -50;
  for (let i = 0; i < N; i += 10) {
    const s = samples[i];
    if (s.isBridge || Math.abs(s.curvature) < 0.01 || i - lastChevronIdx < 10) continue;
    lastChevronIdx = i;

    const outSide = s.curvature > 0 ? 1 : -1;
    const lat = outSide * (roadHalf + SHOULDER_WIDTH + 1.25);
    const sx = s.position.x + s.right.x * lat;
    const sz = s.position.z + s.right.z * lat;
    const sy = groundHeightAt(sx, sz);

    const faceDir = s.tangent.clone().multiplyScalar(-1).addScaledVector(s.right, -outSide * 0.35).normalize();
    tmpLookDummy.position.set(sx, sy - 0.1, sz);
    tmpLookDummy.lookAt(sx + faceDir.x * 10, sy + 0.5, sz + faceDir.z * 10);
    chevronDescs.push({
      pos: tmpLookDummy.position.clone(),
      quat: tmpLookDummy.quaternion.clone(),
      flipX: outSide < 0,
    });
    worldColliders.addCircle(sx, sz, 0.42, 'metal', sy - 1.0, sy + 3.2);
  }

  const brakeStepSamples = Math.round(50 / (circuit.totalLength / N));
  const turn1EntryIdx = (sfIdx + Math.round(215 / (circuit.totalLength / N))) % N;
  for (let b = 0; b < 3; b++) {
    const idx = (turn1EntryIdx - (2 - b) * brakeStepSamples + N) % N;
    const s = samples[idx];
    const lat = -(roadHalf + SHOULDER_WIDTH + 1.35);
    const bx = s.position.x + s.right.x * lat;
    const bz = s.position.z + s.right.z * lat;
    const by = groundHeightAt(bx, bz);

    tmpLookDummy.position.set(bx, by - 0.1, bz);
    tmpLookDummy.lookAt(bx - s.tangent.x * 10, by, bz - s.tangent.z * 10);
    distBoardDescs.push({
      pos: tmpLookDummy.position.clone(),
      quat: tmpLookDummy.quaternion.clone(),
      boardIdx: b,
    });
    worldColliders.addObb(bx, bz, 0.72, 0.28, -s.right.x, -s.right.z, 'metal', by - 1.0, by + 3.0);
  }

  // Pre-allocate reusable RoadsidePropPool slots
  const chevronPoolSlots: Array<{ group: THREE.Group; board: THREE.Mesh; post: THREE.Mesh }> = [];
  const maxChevronSlots = Math.min(chevronDescs.length, 16);
  for (let sIdx = 0; sIdx < maxChevronSlots; sIdx++) {
    const signGroup = new THREE.Group();
    const post = new THREE.Mesh(signPostGeo, brushedSteelMat);
    post.position.y = 1.15;
    post.castShadow = true;
    signGroup.add(post);

    const board = new THREE.Mesh(chevronPlateGeo, [
      darkCarbonMat,
      darkCarbonMat,
      darkCarbonMat,
      darkCarbonMat,
      chevronMat,
      darkCarbonMat,
    ]);
    board.position.y = 2.05;
    board.castShadow = true;
    signGroup.add(board);
    signGroup.visible = false;
    group.add(signGroup);
    chevronPoolSlots.push({ group: signGroup, board, post });
  }

  const distPoolSlots: Array<{
    group: THREE.Group;
    board: THREE.Mesh;
    mats: THREE.Material[];
    posts: THREE.Mesh[];
  }> = [];
  for (let b = 0; b < distBoardDescs.length; b++) {
    const bGroup = new THREE.Group();
    const pL = new THREE.Mesh(signPostGeo, brushedSteelMat);
    pL.position.set(-0.42, 1.1, 0);
    pL.castShadow = true;
    const pR = new THREE.Mesh(signPostGeo, brushedSteelMat);
    pR.position.set(0.42, 1.1, 0);
    pR.castShadow = true;
    const mats: THREE.Material[] = [
      darkCarbonMat,
      darkCarbonMat,
      darkCarbonMat,
      darkCarbonMat,
      distMats[b],
      darkCarbonMat,
    ];
    const board = new THREE.Mesh(distPlateGeo, mats);
    board.position.set(0, 1.75, 0);
    board.castShadow = true;
    bGroup.add(pL, pR, board);
    bGroup.visible = false;
    group.add(bGroup);
    distPoolSlots.push({ group: bGroup, board, mats, posts: [pL, pR] });
  }

  // ---------------------------------------------------------------------------
  // 5. FOUR-SPECIES PBR ALPINE CONIFER ECOSYSTEM (Spruce, Pine, Cypress, Krummholz)
  // ---------------------------------------------------------------------------
  const barkParts: THREE.BufferGeometry[] = [];
  const trunkProfile = [
    new THREE.Vector2(0.48, 0.0),
    new THREE.Vector2(0.37, 0.45),
    new THREE.Vector2(0.28, 1.5),
    new THREE.Vector2(0.21, 3.2),
    new THREE.Vector2(0.14, 4.9),
    new THREE.Vector2(0.06, 6.4),
  ];
  const mainTrunkGeo = new THREE.LatheGeometry(trunkProfile, 10);
  barkParts.push(mainTrunkGeo);

  // 6 angled secondary structural wooden limbs branching out under pine needle whorls
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
  const trunkGeo = trackGeo(BufferGeometryUtils.mergeGeometries(barkParts, false));
  for (const g of barkParts) g.dispose();

  // Windswept High-Ridge Krummholz gnarled bent trunk
  const krummTrunkParts: THREE.BufferGeometry[] = [];
  const seg1 = new THREE.CylinderGeometry(0.17, 0.27, 1.45, 7);
  seg1.translate(0, 0.72, 0);
  seg1.rotateZ(-0.22);
  krummTrunkParts.push(seg1);

  const seg2 = new THREE.CylinderGeometry(0.1, 0.17, 1.4, 7);
  seg2.translate(0, 0.7, 0);
  seg2.rotateZ(-0.56);
  seg2.translate(0.3, 1.32, 0.04);
  krummTrunkParts.push(seg2);

  const seg3 = new THREE.CylinderGeometry(0.045, 0.1, 1.25, 6);
  seg3.translate(0, 0.62, 0);
  seg3.rotateZ(-0.82);
  seg3.translate(0.98, 2.38, 0.06);
  krummTrunkParts.push(seg3);

  const lowLimb = new THREE.CylinderGeometry(0.035, 0.075, 1.15, 6);
  lowLimb.translate(0, 0.55, 0);
  lowLimb.rotateZ(-1.05);
  lowLimb.rotateY(0.55);
  lowLimb.translate(0.45, 1.55, -0.08);
  krummTrunkParts.push(lowLimb);

  const krummholzTrunkGeo = trackGeo(BufferGeometryUtils.mergeGeometries(krummTrunkParts, false));
  for (const g of krummTrunkParts) g.dispose();

  const trunkMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.barkAlbedo,
      normalMap: textures.barkNormal,
      normalScale: new THREE.Vector2(1.15, 1.15),
      color: 0xffffff,
      roughness: 0.94,
      metalness: 0.0,
    }),
  );
  trunkMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = sharedWeather.uWetness;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWetness;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb *= mix(1.0, 0.62, uWetness);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.48, uWetness * 0.78);`,
      );
  };
  trunkMat.customProgramCacheKey = () => 'aurelia-bark-wet-static-v3';

  // Helper: scale UV tiling for crisp needle spray detail on foliage geometries
  const scaleGeometryUvs = (g: THREE.BufferGeometry, su: number, sv: number) => {
    const uvAttr = g.attributes.uv as THREE.BufferAttribute | undefined;
    if (!uvAttr) return;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * su, uvAttr.getY(i) * sv);
    }
  };

  // Build organic ruffled downward-sweeping needle bough fan helper
  const makeNeedleBoughFan = (
    rad: number,
    height: number,
    segs: number,
    seedOff: number,
    droopFactor = 0.34,
  ) => {
    const g = new THREE.ConeGeometry(rad, height, segs, 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < pos.count; v++) {
      const vx = pos.getX(v);
      const vy = pos.getY(v);
      const vz = pos.getZ(v);
      const rDist = Math.hypot(vx, vz);
      const ang = Math.atan2(vz, vx);
      // Scalloped asymmetric needle bough silhouette + natural branch droop
      const scallop = 1.0 + 0.22 * Math.sin(ang * 5.0 + seedOff) + 0.12 * Math.cos(ang * 9.0 - seedOff);
      const droop = rDist > 0.1 ? -Math.pow(rDist / rad, 1.4) * height * droopFactor : 0;
      pos.setXYZ(v, vx * scallop, vy + droop, vz * scallop);
    }
    scaleGeometryUvs(g, 2.4, 2.0);
    g.computeVertexNormals();
    return g;
  };

  // Species 1: Tall Valley Norway Spruce (slender drooping conical whorls, ~11.4m silhouette)
  const spruceParts: THREE.BufferGeometry[] = [];
  const spruceTiers = [
    { y: 2.35, rad: 1.52, h: 1.75, n: 5, offsetR: 0.54 },
    { y: 3.65, rad: 1.38, h: 1.65, n: 5, offsetR: 0.45 },
    { y: 4.95, rad: 1.2, h: 1.55, n: 4, offsetR: 0.36 },
    { y: 6.25, rad: 1.0, h: 1.45, n: 4, offsetR: 0.26 },
    { y: 7.5, rad: 0.78, h: 1.35, n: 3, offsetR: 0.18 },
    { y: 8.65, rad: 0.56, h: 1.3, n: 3, offsetR: 0.1 },
  ];
  let sSeed = 3.1;
  for (let tIdx = 0; tIdx < spruceTiers.length; tIdx++) {
    const tier = spruceTiers[tIdx];
    for (let k = 0; k < tier.n; k++) {
      sSeed += 1.23;
      const ang = (k / tier.n) * Math.PI * 2 + tIdx * 0.58;
      const fan = makeNeedleBoughFan(tier.rad, tier.h, 8, sSeed, 0.46);
      fan.rotateZ(-0.22);
      fan.rotateY(ang);
      fan.translate(
        Math.cos(ang) * tier.offsetR,
        tier.y + (k % 2) * 0.14,
        Math.sin(ang) * tier.offsetR,
      );
      spruceParts.push(fan);
    }
  }
  const spruceSpire = makeNeedleBoughFan(0.62, 2.45, 8, 12.7, 0.3);
  spruceSpire.translate(0, 9.85, 0);
  spruceParts.push(spruceSpire);
  const spruceCanopyGeo = trackGeo(BufferGeometryUtils.mergeGeometries(spruceParts, false));
  for (const g of spruceParts) g.dispose();

  // Species 2: Mid-Slope Alpine Pine (broad lateral bough clusters + pointed leader spire)
  const pineParts: THREE.BufferGeometry[] = [];
  const pineTiers = [
    { y: 3.15, rad: 1.55, h: 1.45, n: 5, offsetR: 0.72 },
    { y: 4.35, rad: 1.38, h: 1.35, n: 4, offsetR: 0.56 },
    { y: 5.55, rad: 1.15, h: 1.25, n: 4, offsetR: 0.42 },
    { y: 6.7, rad: 0.92, h: 1.15, n: 3, offsetR: 0.28 },
    { y: 7.75, rad: 0.68, h: 1.15, n: 2, offsetR: 0.14 },
  ];
  let pSeed = 0;
  for (let tIdx = 0; tIdx < pineTiers.length; tIdx++) {
    const tier = pineTiers[tIdx];
    for (let k = 0; k < tier.n; k++) {
      pSeed += 1.37;
      const ang = (k / tier.n) * Math.PI * 2 + tIdx * 0.65;
      const fan = makeNeedleBoughFan(tier.rad, tier.h, 9, pSeed);
      fan.rotateZ(-0.14);
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
  for (const g of pineParts) g.dispose();

  // Species 3: Warm Valley Mediterranean Cypress (slender flame-shaped 11-tuft column)
  const cypParts: THREE.BufferGeometry[] = [];
  for (let cIdx = 0; cIdx < 11; cIdx++) {
    const f = cIdx / 10;
    const cy = 2.4 + f * 6.8;
    const rad = lerp(0.92, 0.26, Math.pow(f, 0.95));
    const sy = lerp(1.55, 1.38, f);
    const tuft = new THREE.DodecahedronGeometry(rad, 1);
    const tPos = tuft.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < tPos.count; v++) {
      const vx = tPos.getX(v);
      const vy = tPos.getY(v);
      const vz = tPos.getZ(v);
      const ruffle = 0.88 + 0.22 * Math.sin(vx * 3.8 + cIdx) * Math.cos(vz * 3.6);
      tPos.setXYZ(v, vx * ruffle, vy * sy, vz * ruffle);
    }
    scaleGeometryUvs(tuft, 2.0, 2.0);
    tuft.computeVertexNormals();
    const ang = cIdx * 1.9;
    tuft.translate(Math.cos(ang) * 0.12 * (1 - f * 0.5), cy, Math.sin(ang) * 0.12 * (1 - f * 0.5));
    cypParts.push(tuft);
  }
  const cypressCanopyGeo = trackGeo(BufferGeometryUtils.mergeGeometries(cypParts, false));
  for (const g of cypParts) g.dispose();

  // Species 4: Windswept High-Ridge Krummholz (asymmetric leeward flagged foliage pads)
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
    const fan = makeNeedleBoughFan(pad.rad, pad.h, 8, 4.2 + kp * 1.7, 0.24);
    fan.rotateZ(pad.tilt);
    fan.rotateY(kp * 0.7);
    fan.translate(pad.x, pad.y, pad.z);
    krummParts.push(fan);
  }
  const krummholzCanopyGeo = trackGeo(BufferGeometryUtils.mergeGeometries(krummParts, false));
  for (const g of krummParts) g.dispose();

  const foliageMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.coniferNeedleAlbedo,
      normalMap: textures.coniferNeedleNormal,
      normalScale: new THREE.Vector2(0.95, 0.95),
      roughnessMap: textures.coniferNeedleRoughness,
      roughness: 1.0,
      metalness: 0.0,
      color: 0xffffff,
    }),
  );
  foliageMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = sharedWeather.uWetness;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWetness;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb *= mix(1.0, 0.72, uWetness);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.36, uWetness * 0.84);`,
      );
  };
  foliageMat.customProgramCacheKey = () => 'aurelia-foliage-botanical-pbr-wet-static-v5';

  const spruceTransforms: THREE.Matrix4[] = [];
  const spruceTrunkTransforms: THREE.Matrix4[] = [];
  const spruceColors: THREE.Color[] = [];
  const pineTransforms: THREE.Matrix4[] = [];
  const pineTrunkTransforms: THREE.Matrix4[] = [];
  const pineColors: THREE.Color[] = [];
  const cypressTransforms: THREE.Matrix4[] = [];
  const cypressTrunkTransforms: THREE.Matrix4[] = [];
  const cypressColors: THREE.Color[] = [];
  const krummholzTransforms: THREE.Matrix4[] = [];
  const krummholzColors: THREE.Color[] = [];
  const krummholzTrunkTransforms: THREE.Matrix4[] = [];

  const dummy = new THREE.Object3D();
  const baseSprucePalette = [
    new THREE.Color(0x214023),
    new THREE.Color(0x284b29),
    new THREE.Color(0x1b371e),
    new THREE.Color(0x305531),
  ];
  const basePinePalette = [
    new THREE.Color(0x2d4e2a),
    new THREE.Color(0x375c32),
    new THREE.Color(0x416538),
    new THREE.Color(0x274425),
  ];
  const baseCypressPalette = [
    new THREE.Color(0x2c4727),
    new THREE.Color(0x3a5630),
    new THREE.Color(0x485f33),
  ];
  const baseKrummholzPalette = [
    new THREE.Color(0x3a5430),
    new THREE.Color(0x475e36),
    new THREE.Color(0x334b2c),
  ];

  const tintVariation = (base: THREE.Color): THREE.Color => {
    const c = base.clone();
    c.offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.07, (rand() - 0.5) * 0.05);
    return c;
  };

  let attempts = 0;
  const maxTrees = 1220;
  while (
    spruceTransforms.length +
      pineTransforms.length +
      cypressTransforms.length +
      krummholzTransforms.length <
      maxTrees &&
    attempts < 14000
  ) {
    attempts++;
    const rx = (rand() - 0.5) * 980;
    const rz = (rand() - 0.5) * 980;
    if (isInLandmarkFootprint(rx, rz)) continue;

    const q = circuit.queryNearestInto(rx, rz, propQScratch);
    if (q.absDistance < roadHalf + SHOULDER_WIDTH + 10.5) continue;
    if (isBlockedByTunnelPortal(rx, rz, q, 4.0)) continue;

    const ry = groundHeightAt(rx, rz);
    if (ry < WATER_LEVEL + 1.4 || ry > 77) continue;

    const n = groundNormalAtInto(rx, rz, 1.5, propNormScratch);
    const isHighAltitude = ry > 49;
    if (n.y < (isHighAltitude ? 0.68 : 0.74)) continue;

    // Multi-octave forest-grove clustering noise + moisture gradient
    const groveNoise = fbm2D(rx * 0.0085, rz * 0.0085, 4, 2.05, 0.52, 771);
    const microClump = fbm2D(rx * 0.024, rz * 0.024, 3, 2.0, 0.5, 913);
    const groveDensity = Math.max(0, Math.min(1, 0.54 + groveNoise * 0.62 + microClump * 0.24));
    if (rand() > groveDensity * 0.94) continue;

    const distLake = Math.hypot(rx - 75, rz - 2);
    const distGorge = Math.hypot(rx - 46, rz + 42);
    const waterProx = Math.max(0, 1 - Math.min(distLake / 190, distGorge / 145));
    const moisture = waterProx * Math.max(0, 1 - (ry - WATER_LEVEL) / 42);

    // Ecological vertical & microclimate species classification
    const krummProb =
      ry > 54
        ? 0.86
        : ry > 44 && n.y < 0.8
          ? 0.68
          : ry > 47
            ? (ry - 47) / 14
            : 0;

    if (rand() < krummProb) {
      // Windswept High-Ridge Krummholz leaned subtly with prevailing alpine wind
      const sc = 0.75 + rand() * 0.52;
      dummy.position.set(rx, ry - 0.24, rz);
      dummy.rotation.set(
        (rand() - 0.5) * 0.14,
        0.54 + (rand() - 0.5) * 0.55,
        (rand() - 0.5) * 0.14,
      );
      dummy.scale.set(sc, sc * (0.85 + rand() * 0.35), sc);
      dummy.updateMatrix();
      krummholzTrunkTransforms.push(dummy.matrix.clone());
      krummholzTransforms.push(dummy.matrix.clone());
      worldColliders.addCircle(rx, rz, 0.44 * sc, 'wood', ry - 1.5, ry + 5.0);
      krummholzColors.push(
        tintVariation(baseKrummholzPalette[Math.floor(rand() * baseKrummholzPalette.length)]),
      );
      continue;
    }

    const scaleXZ = 0.82 + rand() * 0.48;
    const scaleY = 0.84 + rand() * 0.52;
    dummy.position.set(rx, ry - 0.28, rz);
    dummy.rotation.set((rand() - 0.5) * 0.08, rand() * Math.PI * 2, (rand() - 0.5) * 0.08);
    dummy.scale.set(scaleXZ, scaleY, scaleXZ);
    dummy.updateMatrix();
    const treeMat = dummy.matrix.clone();
    worldColliders.addCircle(rx, rz, 0.52 * scaleXZ, 'wood', ry - 1.5, ry + 8.5);

    const spruceScore =
      (ry < 38 ? 0.35 : 0.14) + moisture * 0.52 + (groveNoise > 0.08 ? 0.18 : 0);
    const cypressScore = ry < 34 ? (1 - moisture) * 0.36 + (groveNoise < 0.05 ? 0.12 : 0) : 0.05;
    const roll = rand();

    if (roll < spruceScore * 0.78) {
      spruceTrunkTransforms.push(treeMat);
      spruceTransforms.push(treeMat);
      spruceColors.push(
        tintVariation(baseSprucePalette[Math.floor(rand() * baseSprucePalette.length)]),
      );
    } else if (roll < spruceScore * 0.78 + cypressScore * 0.85) {
      cypressTrunkTransforms.push(treeMat);
      cypressTransforms.push(treeMat);
      cypressColors.push(
        tintVariation(baseCypressPalette[Math.floor(rand() * baseCypressPalette.length)]),
      );
    } else {
      pineTrunkTransforms.push(treeMat);
      pineTransforms.push(treeMat);
      pineColors.push(
        tintVariation(basePinePalette[Math.floor(rand() * basePinePalette.length)]),
      );
    }
  }

  const scaledInstancedRegistry: Array<{
    mesh: THREE.InstancedMesh;
    fullCount: number;
    allowsShadow: boolean;
    cellCenterX: number;
    cellCenterZ: number;
  }> = [];
  const cleanupCallbacks: Array<() => void> = [];
  let isDisposed = false;
  let qualityRatio = 0.78;
  let foliageDensityScale = 1.0;
  let allowTreeShadows = false;
  const getTreeQualityState = () => ({
    keepRatio: qualityRatio,
    foliageDensityScale,
    allowShadows: allowTreeShadows,
  });

  const FOLIAGE_CELL_SIZE = 340;
  const FOLIAGE_GRID_DIM = 3;
  const FOLIAGE_HALF_SPAN = 510;
  const getCellBucket = (m: THREE.Matrix4): number => {
    const cx = Math.max(0, Math.min(FOLIAGE_GRID_DIM - 1, Math.floor((m.elements[12] + FOLIAGE_HALF_SPAN) / FOLIAGE_CELL_SIZE)));
    const cz = Math.max(0, Math.min(FOLIAGE_GRID_DIM - 1, Math.floor((m.elements[14] + FOLIAGE_HALF_SPAN) / FOLIAGE_CELL_SIZE)));
    return cz * FOLIAGE_GRID_DIM + cx;
  };
  const cellCenterCoords = (bucket: number): [number, number] => {
    const cx = bucket % FOLIAGE_GRID_DIM;
    const cz = Math.floor(bucket / FOLIAGE_GRID_DIM);
    return [
      -FOLIAGE_HALF_SPAN + (cx + 0.5) * FOLIAGE_CELL_SIZE,
      -FOLIAGE_HALF_SPAN + (cz + 0.5) * FOLIAGE_CELL_SIZE,
    ];
  };

  const addTrunkInstanced = (geo: THREE.BufferGeometry, matrices: THREE.Matrix4[]) => {
    if (matrices.length === 0) return;
    const buckets: THREE.Matrix4[][] = Array.from({ length: FOLIAGE_GRID_DIM * FOLIAGE_GRID_DIM }, () => []);
    for (let i = 0; i < matrices.length; i++) buckets[getCellBucket(matrices[i])].push(matrices[i]);
    for (let b = 0; b < buckets.length; b++) {
      const bm = buckets[b];
      if (bm.length === 0) continue;
      const inst = new THREE.InstancedMesh(geo, trunkMat, bm.length);
      for (let i = 0; i < bm.length; i++) inst.setMatrixAt(i, bm[i]);
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = false;
      group.add(inst);
      const [cellCenterX, cellCenterZ] = cellCenterCoords(b);
      scaledInstancedRegistry.push({
        mesh: inst,
        fullCount: bm.length,
        allowsShadow: false,
        cellCenterX,
        cellCenterZ,
      });
    }
  };

  const addCellGlbSpecies = (
    assetId: UserAssetId,
    trunkGeoRef: THREE.BufferGeometry,
    canopyGeoRef: THREE.BufferGeometry,
    matrices: THREE.Matrix4[],
    colors: THREE.Color[],
  ) => {
    if (matrices.length === 0) return;
    const mBuckets: THREE.Matrix4[][] = Array.from({ length: FOLIAGE_GRID_DIM * FOLIAGE_GRID_DIM }, () => []);
    for (let i = 0; i < matrices.length; i++) {
      mBuckets[getCellBucket(matrices[i])].push(matrices[i]);
    }
    for (let b = 0; b < mBuckets.length; b++) {
      const bm = mBuckets[b];
      if (bm.length === 0) continue;
      const tInst = new THREE.InstancedMesh(trunkGeoRef, trunkMat, bm.length);
      const cInst = new THREE.InstancedMesh(canopyGeoRef, foliageMat, bm.length);
      for (let i = 0; i < bm.length; i++) {
        tInst.setMatrixAt(i, bm[i]);
        cInst.setMatrixAt(i, bm[i]);
        cInst.setColorAt(i, colors[i % colors.length]);
      }
      tInst.instanceMatrix.needsUpdate = true;
      cInst.instanceMatrix.needsUpdate = true;
      if (cInst.instanceColor) cInst.instanceColor.needsUpdate = true;
      tInst.computeBoundingSphere();
      cInst.computeBoundingSphere();
      tInst.castShadow = false;
      cInst.castShadow = true;
      cInst.receiveShadow = true;
      group.add(tInst, cInst);
      const [cellCenterX, cellCenterZ] = cellCenterCoords(b);
      scaledInstancedRegistry.push({
        mesh: tInst,
        fullCount: bm.length,
        allowsShadow: false,
        cellCenterX,
        cellCenterZ,
      });
      scaledInstancedRegistry.push({
        mesh: cInst,
        fullCount: bm.length,
        allowsShadow: true,
        cellCenterX,
        cellCenterZ,
      });
      const neutralColors = bm.map((_, idx) => {
        const s = 0.88 + ((idx * 29) % 17) * 0.01;
        return new THREE.Color(s, s * 1.02, s * 0.96);
      });
      attachInstancedUserAsset({
        assetId,
        parentGroup: group,
        matrices: bm,
        colors: neutralColors,
        fallbackMeshes: [tInst, cInst],
        scaledRegistry: scaledInstancedRegistry as unknown as Parameters<
          typeof attachInstancedUserAsset
        >[0]['scaledRegistry'],
        cellCenterX,
        cellCenterZ,
        allowsShadow: true,
        isDisposed: () => isDisposed,
        getQualityState: getTreeQualityState,
        cleanupCallbacks,
      });
    }
  };

  const addCanopyInstanced = (
    geo: THREE.BufferGeometry,
    matrices: THREE.Matrix4[],
    colors: THREE.Color[],
  ) => {
    if (matrices.length === 0) return;
    const mBuckets: THREE.Matrix4[][] = Array.from({ length: FOLIAGE_GRID_DIM * FOLIAGE_GRID_DIM }, () => []);
    const cBuckets: THREE.Color[][] = Array.from({ length: FOLIAGE_GRID_DIM * FOLIAGE_GRID_DIM }, () => []);
    for (let i = 0; i < matrices.length; i++) {
      const b = getCellBucket(matrices[i]);
      mBuckets[b].push(matrices[i]);
      cBuckets[b].push(colors[i]);
    }
    for (let b = 0; b < mBuckets.length; b++) {
      const bm = mBuckets[b];
      if (bm.length === 0) continue;
      const bc = cBuckets[b];
      const inst = new THREE.InstancedMesh(geo, foliageMat, bm.length);
      for (let i = 0; i < bm.length; i++) {
        inst.setMatrixAt(i, bm[i]);
        inst.setColorAt(i, bc[i]);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      inst.computeBoundingSphere();
      inst.castShadow = true;
      inst.receiveShadow = true;
      group.add(inst);
      const [cellCenterX, cellCenterZ] = cellCenterCoords(b);
      scaledInstancedRegistry.push({
        mesh: inst,
        fullCount: bm.length,
        allowsShadow: true,
        cellCenterX,
        cellCenterZ,
      });
    }
  };

  addCellGlbSpecies('pine_tree_1', trunkGeo, spruceCanopyGeo, spruceTransforms, spruceColors);
  addCellGlbSpecies('pine_tree_2', trunkGeo, pineCanopyGeo, pineTransforms, pineColors);
  addTrunkInstanced(trunkGeo, cypressTrunkTransforms);
  addCanopyInstanced(cypressCanopyGeo, cypressTransforms, cypressColors);
  addTrunkInstanced(krummholzTrunkGeo, krummholzTrunkTransforms);
  addCanopyInstanced(krummholzCanopyGeo, krummholzTransforms, krummholzColors);

  // ---------------------------------------------------------------------------
  // 5B. INSTANCED MEDITERRANEAN SCRUB BUSHES, ROADSIDE TUFTS & GORGE FERNS (1,910)
  // ---------------------------------------------------------------------------
  const scrubParts: THREE.BufferGeometry[] = [];
  for (let s = 0; s < 3; s++) {
    const puff = new THREE.DodecahedronGeometry(0.65 - s * 0.08, 0);
    puff.scale(1.15, 0.72, 1.15);
    puff.rotateY(s * 1.2);
    puff.translate((s - 1) * 0.35, 0.28 + (s % 2) * 0.1, ((s * 2) % 3 - 1) * 0.22);
    scrubParts.push(puff);
  }
  const scrubGeo = trackGeo(BufferGeometryUtils.mergeGeometries(scrubParts, false));
  for (const g of scrubParts) g.dispose();

  const scrubMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0.0,
    }),
  );
  scrubMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = sharedWeather.uWetness;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWetness;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        diffuseColor.rgb *= mix(1.0, 0.72, uWetness);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.44, uWetness * 0.8);`,
      );
  };
  scrubMat.customProgramCacheKey = () => 'aurelia-scrub-wet-static-v4';

  const scrubTransforms: THREE.Matrix4[] = [];
  const scrubColors: THREE.Color[] = [];
  const scrubPalette = [
    new THREE.Color(0x4b6438),
    new THREE.Color(0x647840),
    new THREE.Color(0x7c7a44),
    new THREE.Color(0x435732),
  ];

  let scrubAttempts = 0;
  while (scrubTransforms.length < 1800 && scrubAttempts < 12000) {
    scrubAttempts++;
    const rx = (rand() - 0.5) * 920;
    const rz = (rand() - 0.5) * 920;
    if (isInLandmarkFootprint(rx, rz)) continue;
    const q = circuit.queryNearestInto(rx, rz, propQScratch);
    // Keep strictly outside guardrails/shoulders while clustering richly along embankments
    if (q.absDistance < roadHalf + SHOULDER_WIDTH + 3.8) continue;
    if (isBlockedByTunnelPortal(rx, rz, q, 2.0)) continue;

    const nearRoadBias = q.absDistance < roadHalf + 38 ? 0.88 : 0.35;
    if (rand() > nearRoadBias) continue;

    const ry = groundHeightAt(rx, rz);
    if (ry < WATER_LEVEL + 0.6 || ry > 68) continue;

    const n = groundNormalAtInto(rx, rz, 1.2, propNormScratch);
    if (n.y < 0.7) continue;

    const sc = 0.55 + rand() * 0.95;
    dummy.position.set(rx, ry - 0.1, rz);
    dummy.rotation.set((rand() - 0.5) * 0.18, rand() * Math.PI * 2, (rand() - 0.5) * 0.18);
    dummy.scale.set(sc * (0.9 + rand() * 0.35), sc * (0.75 + rand() * 0.45), sc * (0.9 + rand() * 0.35));
    dummy.updateMatrix();

    scrubTransforms.push(dummy.matrix.clone());
    const col = scrubPalette[Math.floor(rand() * scrubPalette.length)].clone();
    col.offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.06);
    scrubColors.push(col);
  }

  // Lush emerald Gorge Ferns along the wet waterfall canyon perimeter (110 tufts)
  let fernCount = 0;
  let fernAttempts = 0;
  while (fernCount < 110 && fernAttempts < 1400) {
    fernAttempts++;
    const fx = 24 + rand() * 46;
    const fz = -72 + rand() * 58;
    // Keep clear of direct central water chute channel
    if (Math.abs(fx - 46) < 6.2 && fz > -60 && fz < -22) continue;
    const q = circuit.queryNearestInto(fx, fz, propQScratch);
    if (q.absDistance < roadHalf + SHOULDER_WIDTH + 3.5) continue;
    if (isBlockedByTunnelPortal(fx, fz, q, 2.0)) continue;

    const fy = groundHeightAt(fx, fz);
    if (fy < WATER_LEVEL + 0.4 || fy > WATER_LEVEL + 22) continue;
    const fn = groundNormalAtInto(fx, fz, 1.0, propNormScratch);
    if (fn.y < 0.58) continue;

    const fsc = 0.72 + rand() * 0.78;
    dummy.position.set(fx, fy - 0.08, fz);
    dummy.rotation.set((rand() - 0.5) * 0.22, rand() * Math.PI * 2, (rand() - 0.5) * 0.22);
    dummy.scale.set(fsc * 1.15, fsc * 0.9, fsc * 1.15);
    dummy.updateMatrix();

    scrubTransforms.push(dummy.matrix.clone());
    const fernCol = new THREE.Color(0x285427).offsetHSL((rand() - 0.5) * 0.03, 0.05, (rand() - 0.5) * 0.06);
    scrubColors.push(fernCol);
    fernCount++;
  }

  if (scrubTransforms.length > 0) {
    const mBuckets: THREE.Matrix4[][] = Array.from({ length: FOLIAGE_GRID_DIM * FOLIAGE_GRID_DIM }, () => []);
    const cBuckets: THREE.Color[][] = Array.from({ length: FOLIAGE_GRID_DIM * FOLIAGE_GRID_DIM }, () => []);
    for (let i = 0; i < scrubTransforms.length; i++) {
      const b = getCellBucket(scrubTransforms[i]);
      mBuckets[b].push(scrubTransforms[i]);
      cBuckets[b].push(scrubColors[i]);
    }
    for (let b = 0; b < mBuckets.length; b++) {
      const bm = mBuckets[b];
      if (bm.length === 0) continue;
      const bc = cBuckets[b];
      const scrubInst = new THREE.InstancedMesh(scrubGeo, scrubMat, bm.length);
      for (let i = 0; i < bm.length; i++) {
        scrubInst.setMatrixAt(i, bm[i]);
        scrubInst.setColorAt(i, bc[i]);
      }
      scrubInst.instanceMatrix.needsUpdate = true;
      if (scrubInst.instanceColor) scrubInst.instanceColor.needsUpdate = true;
      scrubInst.computeBoundingSphere();
      scrubInst.castShadow = false;
      scrubInst.receiveShadow = true;
      group.add(scrubInst);
      const [cellCenterX, cellCenterZ] = cellCenterCoords(b);
      scaledInstancedRegistry.push({
        mesh: scrubInst,
        fullCount: bm.length,
        allowsShadow: false,
        cellCenterX,
        cellCenterZ,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 6. INSTANCED STRATIFIED CLIFF BOULDERS & SHORELINE ROCKS (700)
  // ---------------------------------------------------------------------------
  const boulderGeo = trackGeo(new THREE.DodecahedronGeometry(1.6, 1));
  const bPos = boulderGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bPos.count; i++) {
    const vx = bPos.getX(i);
    const vy = bPos.getY(i);
    const vz = bPos.getZ(i);
    const warp = 0.8 + Math.sin(vx * 2.2 + vz * 1.8) * 0.18 + Math.cos(vy * 3.1) * 0.14;
    bPos.setXYZ(i, vx * warp * 1.25, vy * warp * 0.78, vz * warp);
  }
  boulderGeo.computeVertexNormals();

  const boulderMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      roughness: 0.9,
      metalness: 0.03,
    }),
  );

  const rockTransforms: THREE.Matrix4[] = [];
  const rockColors: THREE.Color[] = [];
  let rockAttempts = 0;
  while (rockTransforms.length < 700 && rockAttempts < 7000) {
    rockAttempts++;
    const rx = (rand() - 0.5) * 940;
    const rz = (rand() - 0.5) * 940;
    if (isInLandmarkFootprint(rx, rz)) continue;
    const q = circuit.queryNearestInto(rx, rz, propQScratch);
    if (q.absDistance < roadHalf + SHOULDER_WIDTH + 5.0) continue;
    if (isBlockedByTunnelPortal(rx, rz, q, 4.0)) continue;

    const ry = groundHeightAt(rx, rz);
    if (ry < WATER_LEVEL - 0.6) continue;

    const n = groundNormalAtInto(rx, rz, 1.5, propNormScratch);
    const isShore = ry < WATER_LEVEL + 2.8;
    const isSlope = n.y < 0.88;
    if (!isShore && !isSlope && rand() > 0.24) continue;

    const sBase = 0.55 + rand() * 2.45;
    const bScaleX = sBase * (0.9 + rand() * 0.5);
    const bScaleY = sBase * (0.65 + rand() * 0.4);
    const bScaleZ = sBase * (0.9 + rand() * 0.5);
    dummy.position.set(rx, ry - sBase * 0.38, rz);
    dummy.rotation.set(rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI);
    dummy.scale.set(bScaleX, bScaleY, bScaleZ);
    dummy.updateMatrix();
    rockTransforms.push(dummy.matrix.clone());
    worldColliders.addCircle(rx, rz, 1.38 * Math.max(bScaleX, bScaleZ), 'rock', ry - 2.0, ry + 6.0);

    const shade = 0.76 + rand() * 0.36;
    rockColors.push(new THREE.Color(shade, shade * 0.97, shade * 0.92));
  }

  if (rockTransforms.length > 0) {
    const mBuckets: THREE.Matrix4[][] = Array.from({ length: FOLIAGE_GRID_DIM * FOLIAGE_GRID_DIM }, () => []);
    const cBuckets: THREE.Color[][] = Array.from({ length: FOLIAGE_GRID_DIM * FOLIAGE_GRID_DIM }, () => []);
    for (let i = 0; i < rockTransforms.length; i++) {
      const b = getCellBucket(rockTransforms[i]);
      mBuckets[b].push(rockTransforms[i]);
      cBuckets[b].push(rockColors[i]);
    }
    for (let b = 0; b < mBuckets.length; b++) {
      const bm = mBuckets[b];
      if (bm.length === 0) continue;
      const bc = cBuckets[b];
      const rockInst = new THREE.InstancedMesh(boulderGeo, boulderMat, bm.length);
      for (let i = 0; i < bm.length; i++) {
        rockInst.setMatrixAt(i, bm[i]);
        rockInst.setColorAt(i, bc[i]);
      }
      rockInst.instanceMatrix.needsUpdate = true;
      if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
      rockInst.computeBoundingSphere();
      rockInst.castShadow = true;
      rockInst.receiveShadow = true;
      group.add(rockInst);
      const [cellCenterX, cellCenterZ] = cellCenterCoords(b);
      scaledInstancedRegistry.push({
        mesh: rockInst,
        fullCount: bm.length,
        allowsShadow: true,
        cellCenterX,
        cellCenterZ,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 7. CUSTOM TRACK MODULES: SPEED TRAP RADAR ARCHES (POOLED) & FLOODLIGHT TOWERS
  // ---------------------------------------------------------------------------
  const extraFloodMats: THREE.MeshStandardMaterial[] = [];
  const extraFloodLights: THREE.PointLight[] = [];
  const speedTrapSlots: Array<{ group: THREE.Group; legs: THREE.Mesh[] }> = [];

  if (circuit.features.speedTrapGates && circuit.speedTrapTs.length > 0) {
    const trapArchMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.75,
        roughness: 0.25,
      }),
    );
    const trapSpan = roadHalf * 2 + 4.4;
    const trapH = 7.4;

    circuit.speedTrapTs.forEach((stT) => {
      const s = circuit.sampleAtT(stT);
      const basis = new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate());
      speedTrapDescs.push({
        pos: s.position.clone(),
        quat: new THREE.Quaternion().setFromRotationMatrix(basis),
      });
      for (const side of [-1, 1] as const) {
        const px = side * (trapSpan * 0.5);
        const wx = s.position.x + s.right.x * px;
        const wz = s.position.z + s.right.z * px;
        worldColliders.addObb(
          wx,
          wz,
          0.42,
          0.42,
          s.right.x,
          s.right.z,
          'metal',
          s.position.y - 1.0,
          s.position.y + trapH,
        );
      }
    });

    const legGeo = trackGeo(new THREE.BoxGeometry(0.44, trapH, 0.44));
    const headerGeo = trackGeo(new THREE.BoxGeometry(trapSpan + 0.6, 0.72, 0.52));
    const stripGeo = trackGeo(new THREE.BoxGeometry(trapSpan - 0.8, 0.24, 0.58));

    const maxTrapSlots = Math.min(speedTrapDescs.length, 3);
    for (let t = 0; t < maxTrapSlots; t++) {
      const archGroup = new THREE.Group();
      const legs: THREE.Mesh[] = [];
      for (const side of [-1, 1] as const) {
        const px = side * (trapSpan * 0.5);
        const leg = new THREE.Mesh(legGeo, brushedSteelMat);
        leg.position.set(px, trapH * 0.5, 0);
        leg.castShadow = true;
        archGroup.add(leg);
        legs.push(leg);
      }
      const header = new THREE.Mesh(headerGeo, darkCarbonMat);
      header.position.set(0, trapH + 0.2, 0);
      archGroup.add(header);
      const neonStrip = new THREE.Mesh(stripGeo, trapArchMat);
      neonStrip.position.set(0, trapH - 0.22, 0);
      archGroup.add(neonStrip);
      archGroup.visible = false;
      group.add(archGroup);
      speedTrapSlots.push({ group: archGroup, legs });
    }
  }

  if (circuit.features.nightFloodlights) {
    const floodBulbMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        emissive: 0xfff3d1,
        emissiveIntensity: 0.2,
        roughness: 0.18,
      }),
    );
    extraFloodMats.push(floodBulbMat);

    const towerAngles = [0.12, 0.34, 0.52, 0.72, 0.89];
    towerAngles.forEach((ft) => {
      const s = circuit.sampleAtT(ft);
      if (s.isBridge) return;
      const outSide = s.curvature >= 0 ? 1 : -1;
      const lat = outSide * (roadHalf + SHOULDER_WIDTH + 3.2);
      const fx = s.position.x + s.right.x * lat;
      const fz = s.position.z + s.right.z * lat;
      const fy = groundHeightAt(fx, fz);

      const tGroup = new THREE.Group();
      const mast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.18, 0.28, 13.5, 8)), brushedSteelMat);
      mast.position.y = 6.75;
      mast.castShadow = true;
      tGroup.add(mast);

      const rack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.6, 0.75, 0.65)), darkCarbonMat);
      rack.position.set(0, 13.5, 0);
      tGroup.add(rack);

      const lampFace = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.2, 0.55)), floodBulbMat);
      lampFace.position.set(0, 13.35, 0.34);
      tGroup.add(lampFace);

      const pt = new THREE.PointLight(0xffe9c4, 0, 95, 1.45);
      pt.position.set(0, 12.8, 1.4);
      pt.visible = false;
      tGroup.add(pt);
      extraFloodLights.push(pt);

      tGroup.position.set(fx, fy - 0.15, fz);
      tGroup.lookAt(s.position.x, s.position.y + 1.0, s.position.z);
      group.add(tGroup);
      worldColliders.addCircle(fx, fz, 0.42, 'metal', fy - 1.0, fy + 14.0);
    });
  }

  let propWindowDistSq = 420 * 420;
  const lastPoolUpdatePos = new THREE.Vector3(1e9, 1e9, 1e9);
  const lastCamUpdatePos = new THREE.Vector3(1e9, 1e9, 1e9);
  let lastCamFwdX = 0;
  let lastCamFwdZ = 0;
  let lastHasCamDir = false;

  const updateVisibilityWindow = (
    focusPos: THREE.Vector3,
    radiusM = 480,
    force = false,
    camPos?: THREE.Vector3,
    camFwd?: THREE.Vector3,
  ) => {
    let fwdX = 0;
    let fwdZ = 0;
    let hasCamDir = false;
    if (camPos && camFwd) {
      const fLen = Math.hypot(camFwd.x, camFwd.z);
      if (fLen > 0.05) {
        fwdX = camFwd.x / fLen;
        fwdZ = camFwd.z / fLen;
        hasCamDir = true;
      }
    }
    const dirDot =
      hasCamDir && lastHasCamDir
        ? fwdX * lastCamFwdX + fwdZ * lastCamFwdZ
        : hasCamDir !== lastHasCamDir
        ? 0
        : 1;
    const camMovedSq = camPos ? lastCamUpdatePos.distanceToSquared(camPos) : 0;

    // Only re-stream pooled slots when focus/cam moves > 18m or camera yaw turns (zero GC)
    if (
      !force &&
      lastPoolUpdatePos.distanceToSquared(focusPos) < 324 &&
      camMovedSq < 324 &&
      dirDot > 0.985
    ) {
      return;
    }
    lastPoolUpdatePos.copy(focusPos);
    if (camPos) lastCamUpdatePos.copy(camPos);
    lastCamFwdX = fwdX;
    lastCamFwdZ = fwdZ;
    lastHasCamDir = hasCamDir;

    // Distance + behind-camera cull for 3x3 foliage & boulder spatial cells (half-diagonal of 340m cell ~241m)
    const cellCullRadius = Math.max(440, radiusM + 250);
    const cellCullSq = cellCullRadius * cellCullRadius;
    for (let i = 0; i < scaledInstancedRegistry.length; i++) {
      const item = scaledInstancedRegistry[i];
      const dx = item.cellCenterX - focusPos.x;
      const dz = item.cellCenterZ - focusPos.z;
      if (dx * dx + dz * dz > cellCullSq) {
        item.mesh.visible = false;
        continue;
      }
      if (hasCamDir && camPos) {
        const alongCam = (item.cellCenterX - camPos.x) * fwdX + (item.cellCenterZ - camPos.z) * fwdZ;
        if (alongCam < -(242 + 48)) {
          item.mesh.visible = false;
          continue;
        }
      }
      item.mesh.visible = true;
    }

    // 1) Stream chevron signs into reusable slots (radius + behind-camera cull)
    let cSlot = 0;
    for (let i = 0; i < chevronDescs.length && cSlot < chevronPoolSlots.length; i++) {
      const desc = chevronDescs[i];
      if (desc.pos.distanceToSquared(focusPos) > propWindowDistSq) continue;
      if (
        hasCamDir &&
        camPos &&
        (desc.pos.x - camPos.x) * fwdX + (desc.pos.z - camPos.z) * fwdZ < -14
      ) {
        continue;
      }
      const slot = chevronPoolSlots[cSlot++];
      slot.group.position.copy(desc.pos);
      slot.group.quaternion.copy(desc.quat);
      slot.board.scale.x = desc.flipX ? -1 : 1;
      slot.group.visible = true;
    }
    for (let i = cSlot; i < chevronPoolSlots.length; i++) {
      chevronPoolSlots[i].group.visible = false;
    }

    // 2) Stream braking distance boards
    let dSlot = 0;
    for (let i = 0; i < distBoardDescs.length && dSlot < distPoolSlots.length; i++) {
      const desc = distBoardDescs[i];
      if (desc.pos.distanceToSquared(focusPos) > propWindowDistSq) continue;
      if (
        hasCamDir &&
        camPos &&
        (desc.pos.x - camPos.x) * fwdX + (desc.pos.z - camPos.z) * fwdZ < -14
      ) {
        continue;
      }
      const slot = distPoolSlots[dSlot++];
      slot.group.position.copy(desc.pos);
      slot.group.quaternion.copy(desc.quat);
      slot.mats[4] = distMats[desc.boardIdx];
      slot.group.visible = true;
    }
    for (let i = dSlot; i < distPoolSlots.length; i++) {
      distPoolSlots[i].group.visible = false;
    }

    // 3) Stream speed-trap arches
    let tSlot = 0;
    for (let i = 0; i < speedTrapDescs.length && tSlot < speedTrapSlots.length; i++) {
      const desc = speedTrapDescs[i];
      if (desc.pos.distanceToSquared(focusPos) > propWindowDistSq * 1.35) continue;
      if (
        hasCamDir &&
        camPos &&
        (desc.pos.x - camPos.x) * fwdX + (desc.pos.z - camPos.z) * fwdZ < -16
      ) {
        continue;
      }
      const slot = speedTrapSlots[tSlot++];
      slot.group.position.copy(desc.pos);
      slot.group.quaternion.copy(desc.quat);
      slot.group.visible = true;
    }
    for (let i = tSlot; i < speedTrapSlots.length; i++) {
      speedTrapSlots[i].group.visible = false;
    }
    void polePositions;
  };

  const applyInstancedCounts = () => {
    for (const item of scaledInstancedRegistry) {
      item.mesh.count = Math.max(
        1,
        Math.min(item.fullCount, Math.round(item.fullCount * qualityRatio * foliageDensityScale)),
      );
    }
  };

  const setGraphicsQuality = (quality: PropsQualityTier) => {
    qualityRatio = quality === 'performance' ? 0.45 : quality === 'balanced' ? 0.72 : 1.0;
    const allowShadows = quality === 'ultra';
    allowTreeShadows = allowShadows;
    const winDist = quality === 'performance' ? 280 : quality === 'balanced' ? 420 : 620;
    propWindowDistSq = winDist * winDist;

    applyInstancedCounts();
    for (const item of scaledInstancedRegistry) {
      item.mesh.castShadow = item.allowsShadow && allowShadows;
    }
    if (poleInst) poleInst.castShadow = allowShadows;
    for (const slot of chevronPoolSlots) {
      slot.post.castShadow = allowShadows;
      slot.board.castShadow = allowShadows;
    }
    for (const slot of distPoolSlots) {
      slot.board.castShadow = allowShadows;
      for (const p of slot.posts) p.castShadow = allowShadows;
    }
    for (const slot of speedTrapSlots) {
      for (const leg of slot.legs) leg.castShadow = allowShadows;
    }
    updateVisibilityWindow(lastPoolUpdatePos, 480, true);
  };

  const setFoliageDensity = (density: number) => {
    foliageDensityScale = Math.max(0.25, Math.min(1.4, density));
    applyInstancedCounts();
  };

  // Seed initial visibility around Start/Finish
  updateVisibilityWindow(sfSample.position, 480, true);
  void ROAD_HALF_WIDTH;

  return {
    group,
    setNightFactor: (nightFactor: number) => {
      lumMat.emissiveIntensity = 0.15 + nightFactor * 2.6;
      bannerFaceMat.emissiveIntensity = 0.06 + nightFactor * 1.15;
      glassDeckMat.emissiveIntensity = 0.04 + nightFactor * 0.95;
      chevronMat.emissiveIntensity = 0.04 + nightFactor * 0.85;
      const showPl = nightFactor > 0.01;
      gantryNightLight.intensity = nightFactor * 3.4;
      gantryNightLight.visible = showPl;
      for (const fm of extraFloodMats) fm.emissiveIntensity = 0.15 + nightFactor * 2.8;
      for (const fl of extraFloodLights) {
        fl.intensity = nightFactor * 5.2;
        fl.visible = showPl;
      }
    },
    updateVisibilityWindow: (
      focusPos: THREE.Vector3,
      radiusM?: number,
      camPos?: THREE.Vector3,
      camFwd?: THREE.Vector3,
    ) => updateVisibilityWindow(focusPos, radiusM ?? 480, false, camPos, camFwd),
    setGraphicsQuality,
    setFoliageDensity,
    dispose: () => {
      isDisposed = true;
      for (const cb of cleanupCallbacks) cb();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}
