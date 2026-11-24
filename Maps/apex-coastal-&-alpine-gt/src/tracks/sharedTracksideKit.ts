import * as THREE from 'three';
import type { ProceduralTextureSet } from './proceduralTextures';
import { createTrackSpatialQuery } from './terrainField';
import type {
  ColliderRegistry,
  MapDefinition,
  MapId,
  TerrainField,
  TrackSample,
} from './types';

export interface PitGrandstandHandle {
  updateCrowd: (elapsed: number, excitement: number) => void;
  setNightFactor: (nightFactor: number) => void;
  dispose: () => void;
}

/**
 * Builds the 6-bay FIA pit garages, glass VIP hospitality suite, Race Control tower,
 * debris catch-fence, pit entry portal, podium, and opposite tiered covered grandstand
 * with Jumbotron + telemetry-reactive spectator crowd.
 */
export function buildOrientedPitAndGrandstandAddon(
  parent: THREE.Group,
  mapDef: MapDefinition,
  terrain: TerrainField,
  registry: ColliderRegistry,
  textures: ProceduralTextureSet,
  mapId: MapId
): PitGrandstandHandle {
  const disposables: { dispose: () => void }[] = [];
  const { pitFrame } = mapDef;
  const accentHex = mapId === 'coral_bay' ? 0x06b6d4 : 0x38bdf8;
  const trimColor = mapId === 'coral_bay' ? 0xbda27e : 0xf59e0b;

  // Root transform aligned to pitFrame: +X local = tangent, +Z local = right
  const pitRoot = new THREE.Group();
  pitRoot.position.set(pitFrame.centerX, pitFrame.y, pitFrame.centerZ);
  pitRoot.rotation.y = -Math.atan2(pitFrame.tangentZ, pitFrame.tangentX);
  parent.add(pitRoot);

  // Materials
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.85,
    metalness: 0.08,
  });
  const garageBodyMat = new THREE.MeshStandardMaterial({
    color: mapId === 'coral_bay' ? 0xe2e8f0 : 0x3b4859,
    map: textures.facadeMap,
    roughness: 0.58,
    metalness: 0.22,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: trimColor,
    roughness: 0.52,
    metalness: 0.25,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: mapId === 'coral_bay' ? 0x38bdf8 : 0xfbbf24,
    emissive: mapId === 'coral_bay' ? 0x0284c7 : 0xd97706,
    emissiveIntensity: 0.45,
    roughness: 0.14,
    metalness: 0.72,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.72,
    roughness: 0.3,
    metalness: 0.5,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.42,
    metalness: 0.78,
  });
  const fenceMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    map: textures.catchFenceMap,
    alphaTest: 0.28,
    transparent: true,
    roughness: 0.42,
    metalness: 0.76,
    side: THREE.DoubleSide,
  });
  disposables.push(
    concreteMat,
    garageBodyMat,
    roofMat,
    glassMat,
    accentMat,
    darkMetalMat,
    fenceMat
  );

  // 1. Grounded Pit Building Plinth + 6-Bay FIA Pit Garages (behind pit apron at local z = +16)
  const plinthGeo = new THREE.BoxGeometry(118, 3.0, 16);
  const plinthMesh = new THREE.Mesh(plinthGeo, concreteMat);
  plinthMesh.position.set(0, -1.35, 18.5);
  plinthMesh.receiveShadow = true;
  pitRoot.add(plinthMesh);
  disposables.push(plinthGeo);

  const bayGeo = new THREE.BoxGeometry(17.5, 5.4, 11.5);
  const doorGeo = new THREE.BoxGeometry(11.5, 3.6, 0.3);
  const roofStripGeo = new THREE.BoxGeometry(114, 0.55, 13.5);
  const vipGeo = new THREE.BoxGeometry(74, 3.4, 9.2);
  disposables.push(bayGeo, doorGeo, roofStripGeo, vipGeo);

  for (let b = 0; b < 6; b++) {
    const bx = (b - 2.5) * 18.4;
    const bay = new THREE.Mesh(bayGeo, garageBodyMat);
    bay.position.set(bx, 2.7, 18.5);
    bay.castShadow = true;
    bay.receiveShadow = true;
    pitRoot.add(bay);

    const door = new THREE.Mesh(doorGeo, darkMetalMat);
    door.position.set(bx, 1.85, 12.7);
    pitRoot.add(door);
  }

  // VIP Hospitality Glass Suite on 2nd story
  const vip = new THREE.Mesh(vipGeo, glassMat);
  vip.position.set(8, 7.1, 18.5);
  pitRoot.add(vip);

  const roof = new THREE.Mesh(roofStripGeo, roofMat);
  roof.position.set(0, 9.0, 18.2);
  roof.castShadow = true;
  pitRoot.add(roof);

  // Accent canopy fascia
  const fasciaGeo = new THREE.BoxGeometry(114, 0.42, 0.35);
  const fascia = new THREE.Mesh(fasciaGeo, accentMat);
  fascia.position.set(0, 5.55, 12.2);
  pitRoot.add(fascia);
  disposables.push(fasciaGeo);

  // Race Control Tower at west end of paddock
  const towerBaseGeo = new THREE.BoxGeometry(9.5, 14.5, 9.5);
  const towerCabGeo = new THREE.BoxGeometry(11.8, 3.8, 11.8);
  const towerRoofGeo = new THREE.BoxGeometry(12.6, 0.6, 12.6);
  const towerBase = new THREE.Mesh(towerBaseGeo, concreteMat);
  towerBase.position.set(-64, 7.25, 19);
  towerBase.castShadow = true;
  const towerCab = new THREE.Mesh(towerCabGeo, glassMat);
  towerCab.position.set(-64, 15.8, 19);
  const towerRoof = new THREE.Mesh(towerRoofGeo, darkMetalMat);
  towerRoof.position.set(-64, 18.0, 19);
  pitRoot.add(towerBase, towerCab, towerRoof);
  disposables.push(towerBaseGeo, towerCabGeo, towerRoofGeo);

  // Register OBB for Pit Garages + Race Control
  const cosY = pitFrame.tangentX;
  const sinY = pitFrame.tangentZ;
  const toWorld = (lx: number, lz: number): [number, number] => [
    pitFrame.centerX + lx * cosY + lz * pitFrame.rightX,
    pitFrame.centerZ + lx * sinY + lz * pitFrame.rightZ,
  ];
  const [garX, garZ] = toWorld(0, 18.5);
  registry.obbs.push({
    id: `${mapId}_pit_garages`,
    kind: 'building',
    centerX: garX,
    centerZ: garZ,
    halfW: 60,
    halfD: 6.5,
    axisX: cosY,
    axisZ: sinY,
    minY: pitFrame.y - 2,
    maxY: pitFrame.y + 18,
  });

  // Podium Structure at mapDef.podiumPosition
  const [podX, podY, podZ] = mapDef.podiumPosition;
  const podGroup = new THREE.Group();
  podGroup.position.set(podX, podY, podZ);
  podGroup.rotation.y = pitRoot.rotation.y;
  const podDeckGeo = new THREE.BoxGeometry(11, 1.4, 5.2);
  const podCanopyGeo = new THREE.BoxGeometry(12, 0.4, 5.8);
  const podPillarGeo = new THREE.CylinderGeometry(0.22, 0.26, 4.4, 10);
  const podDeck = new THREE.Mesh(podDeckGeo, concreteMat);
  podDeck.position.y = 0.7;
  const podCanopy = new THREE.Mesh(podCanopyGeo, accentMat);
  podCanopy.position.y = 4.6;
  podGroup.add(podDeck, podCanopy);
  for (const px of [-4.8, 4.8]) {
    const pMesh = new THREE.Mesh(podPillarGeo, darkMetalMat);
    pMesh.position.set(px, 2.4, -2.0);
    podGroup.add(pMesh);
  }
  parent.add(podGroup);
  disposables.push(podDeckGeo, podCanopyGeo, podPillarGeo);

  // Pit Entry Portal & Debris Catch-Fence along pit/track divider (local z = -11.2)
  const pitWallGeo = new THREE.BoxGeometry(205, 1.15, 0.75);
  const pitWall = new THREE.Mesh(pitWallGeo, concreteMat);
  pitWall.position.set(0, 0.55, -11.2);
  pitWall.receiveShadow = true;
  pitRoot.add(pitWall);
  disposables.push(pitWallGeo);

  const catchFenceGeo = new THREE.PlaneGeometry(188, 2.6, 1, 1);
  const catchFence = new THREE.Mesh(catchFenceGeo, fenceMat);
  catchFence.position.set(0, 2.4, -11.2);
  pitRoot.add(catchFence);
  const fencePostGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.7, 6);
  for (let fx = -90; fx <= 90; fx += 10) {
    const fPost = new THREE.Mesh(fencePostGeo, darkMetalMat);
    fPost.position.set(fx, 2.4, -11.2);
    pitRoot.add(fPost);
  }
  disposables.push(catchFenceGeo, fencePostGeo);

  const [pwX, pwZ] = toWorld(0, -11.2);
  registry.obbs.push({
    id: `${mapId}_pit_wall`,
    kind: 'pitwall',
    centerX: pwX,
    centerZ: pwZ,
    halfW: 102.5,
    halfD: 0.55,
    axisX: cosY,
    axisZ: sinY,
    minY: pitFrame.y - 1,
    maxY: pitFrame.y + 4,
  });

  // Pit Entry Portal Arch
  const portalPillarGeo = new THREE.BoxGeometry(1.1, 6.2, 1.1);
  const portalBeamGeo = new THREE.BoxGeometry(1.2, 1.1, 19.5);
  const pLeft = new THREE.Mesh(portalPillarGeo, darkMetalMat);
  pLeft.position.set(-108, 3.1, -9.5);
  const pRight = new THREE.Mesh(portalPillarGeo, darkMetalMat);
  pRight.position.set(-108, 3.1, 9.5);
  const pBeam = new THREE.Mesh(portalBeamGeo, accentMat);
  pBeam.position.set(-108, 6.2, 0);
  pitRoot.add(pLeft, pRight, pBeam);
  disposables.push(portalPillarGeo, portalBeamGeo);

  // 2. Opposite Tiered Covered Main Grandstand (across main straight at local z = -44)
  const gsLocalZ = -44;
  const gsGroup = new THREE.Group();
  gsGroup.position.set(0, 0, gsLocalZ);
  pitRoot.add(gsGroup);

  const gsPlinthGeo = new THREE.BoxGeometry(132, 3.6, 20);
  const gsPlinth = new THREE.Mesh(gsPlinthGeo, concreteMat);
  gsPlinth.position.set(0, -1.6, -2);
  gsGroup.add(gsPlinth);
  disposables.push(gsPlinthGeo);

  const tierCount = 8;
  const tierGeo = new THREE.BoxGeometry(126, 0.9, 1.85);
  disposables.push(tierGeo);
  for (let t = 0; t < tierCount; t++) {
    const tier = new THREE.Mesh(tierGeo, t % 2 === 0 ? concreteMat : roofMat);
    tier.position.set(0, 0.5 + t * 0.92, 6.5 - t * 1.72);
    tier.castShadow = true;
    tier.receiveShadow = true;
    gsGroup.add(tier);
  }

  // Grandstand Cover Canopy + Support Columns
  const gsCanopyGeo = new THREE.BoxGeometry(130, 0.55, 17.5);
  const gsCanopy = new THREE.Mesh(gsCanopyGeo, darkMetalMat);
  gsCanopy.position.set(0, 11.4, -0.5);
  gsCanopy.rotation.x = 0.14;
  gsCanopy.castShadow = true;
  gsGroup.add(gsCanopy);
  disposables.push(gsCanopyGeo);

  const colGeo = new THREE.CylinderGeometry(0.32, 0.36, 11.8, 8);
  disposables.push(colGeo);
  for (let c = -56; c <= 56; c += 28) {
    const col = new THREE.Mesh(colGeo, darkMetalMat);
    col.position.set(c, 5.8, -8.2);
    gsGroup.add(col);
  }

  // Jumbotron Display facing the straight
  const jumboFrameGeo = new THREE.BoxGeometry(24, 11.5, 1.4);
  const jumboScreenGeo = new THREE.PlaneGeometry(22.2, 10.2);
  const jumboMat = new THREE.MeshBasicMaterial({ map: textures.jumbotronTexture });
  const jumboFrame = new THREE.Mesh(jumboFrameGeo, darkMetalMat);
  jumboFrame.position.set(0, 17.8, -4.2);
  const jumboScreen = new THREE.Mesh(jumboScreenGeo, jumboMat);
  jumboScreen.position.set(0, 17.8, -3.45);
  gsGroup.add(jumboFrame, jumboScreen);
  disposables.push(jumboFrameGeo, jumboScreenGeo, jumboMat);

  const [gsW_X, gsW_Z] = toWorld(0, gsLocalZ - 2);
  registry.obbs.push({
    id: `${mapId}_grandstand`,
    kind: 'building',
    centerX: gsW_X,
    centerZ: gsW_Z,
    halfW: 66,
    halfD: 9.5,
    axisX: cosY,
    axisZ: sinY,
    minY: pitFrame.y - 2,
    maxY: pitFrame.y + 18,
  });

  // 3. Telemetry-Reactive Spectator Crowd on Grandstand Tiers (InstancedMesh)
  const crowdCount = 340;
  const crowdGeo = new THREE.CapsuleGeometry(0.24, 0.55, 4, 6);
  const crowdMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
  });
  const crowdInst = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdCount);
  const crowdBasePos: { x: number; y: number; z: number; phase: number }[] = [];
  const cDummy = new THREE.Object3D();
  const palette =
    mapId === 'coral_bay'
      ? [0x06b6d4, 0xf8fafc, 0xf59e0b, 0x14b8a6, 0x38bdf8]
      : [0x38bdf8, 0xf8fafc, 0xef4444, 0xfbbf24, 0x60a5fa];
  const tmpColor = new THREE.Color();

  for (let i = 0; i < crowdCount; i++) {
    const tierIdx = i % tierCount;
    const tx = (((i * 73) % 120) - 60) + ((i % 5) - 2) * 0.2;
    const ty = 1.25 + tierIdx * 0.92;
    const tz = 6.5 - tierIdx * 1.72;
    const phase = (i * 1.37) % (Math.PI * 2);
    crowdBasePos.push({ x: tx, y: ty, z: tz, phase });

    cDummy.position.set(tx, ty, tz);
    cDummy.updateMatrix();
    crowdInst.setMatrixAt(i, cDummy.matrix);
    tmpColor.setHex(palette[i % palette.length]);
    crowdInst.setColorAt(i, tmpColor);
  }
  crowdInst.instanceMatrix.needsUpdate = true;
  if (crowdInst.instanceColor) crowdInst.instanceColor.needsUpdate = true;
  crowdInst.computeBoundingSphere();
  gsGroup.add(crowdInst);
  disposables.push(crowdGeo, crowdMat);

  // Subtle Grounding check for podium
  const podTerrY = terrain.getHeight(podX, podZ);
  if (podY - podTerrY > 0.5) {
    const skirtGeo = new THREE.BoxGeometry(11.4, podY - podTerrY + 1.0, 5.4);
    const skirt = new THREE.Mesh(skirtGeo, concreteMat);
    skirt.position.set(0, -(podY - podTerrY) * 0.5, 0);
    podGroup.add(skirt);
    disposables.push(skirtGeo);
  }

  return {
    updateCrowd: (elapsed: number, excitement: number) => {
      const amp = 0.06 + excitement * 0.32;
      const freq = 3.2 + excitement * 5.2;
      for (let i = 0; i < crowdCount; i++) {
        const b = crowdBasePos[i];
        const hop = Math.abs(Math.sin(elapsed * freq + b.phase)) * amp;
        cDummy.position.set(b.x, b.y + hop, b.z);
        cDummy.updateMatrix();
        crowdInst.setMatrixAt(i, cDummy.matrix);
      }
      crowdInst.instanceMatrix.needsUpdate = true;
    },
    setNightFactor: (nightFactor: number) => {
      glassMat.emissiveIntensity = 0.3 + nightFactor * 1.15;
      accentMat.emissiveIntensity = 0.65 + nightFactor * 1.25;
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

/**
 * Corner Fan-Zone rigs placed safely outside track apexes with grounded concrete plinths,
 * canopies, flags, and telemetry viewing screens.
 */
export function buildCornerFanZoneRigs(
  parent: THREE.Group,
  samples: TrackSample[],
  terrain: TerrainField,
  registry: ColliderRegistry,
  mapId: MapId
): { updateFlags: (elapsed: number) => void; dispose: () => void } {
  const disposables: { dispose: () => void }[] = [];
  const accentHex = mapId === 'coral_bay' ? 0x06b6d4 : 0x38bdf8;

  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
  const tentMat = new THREE.MeshStandardMaterial({
    color: mapId === 'coral_bay' ? 0xf8fafc : 0xe2e8f0,
    roughness: 0.65,
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: 0.45,
    roughness: 0.35,
  });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 });
  const flagMat = new THREE.MeshStandardMaterial({
    color: mapId === 'coral_bay' ? 0x14b8a6 : 0xef4444,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  disposables.push(plinthMat, tentMat, bannerMat, poleMat, flagMat);

  const baseGeo = new THREE.BoxGeometry(16, 3.0, 10);
  const roofGeo = new THREE.ConeGeometry(5.2, 2.2, 4);
  const postGeo = new THREE.CylinderGeometry(0.14, 0.14, 3.6, 6);
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 6.2, 6);
  const flagGeo = new THREE.PlaneGeometry(1.8, 0.9, 6, 1);
  flagGeo.translate(0.9, 0, 0);
  disposables.push(baseGeo, roofGeo, postGeo, poleGeo, flagGeo);

  const flags: THREE.Mesh[] = [];
  const fracIndices = [0.22, 0.56, 0.84];
  const trackQuery = createTrackSpatialQuery(samples, 26);

  for (let k = 0; k < fracIndices.length; k++) {
    const s = samples[Math.floor(samples.length * fracIndices[k]) % samples.length];
    if (s.isBridge) continue;
    const fx = s.x - s.rightX * 22;
    const fz = s.z - s.rightZ * 22;
    if (trackQuery.minDist(fx, fz) < 18.5) continue;
    const fy = terrain.getHeight(fx, fz);
    if (fy < terrain.waterLevel + 1.2) continue;

    const rig = new THREE.Group();
    rig.position.set(fx, fy, fz);
    rig.rotation.y = -Math.atan2(s.tangentZ, s.tangentX);

    const plinth = new THREE.Mesh(baseGeo, plinthMat);
    plinth.position.y = -0.6;
    rig.add(plinth);

    for (const tx of [-4.2, 4.2]) {
      const roof = new THREE.Mesh(roofGeo, k % 2 === 0 ? tentMat : bannerMat);
      roof.position.set(tx, 4.3, 0);
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      rig.add(roof);
      for (const px of [-2.8, 2.8]) {
        for (const pz of [-2.8, 2.8]) {
          const post = new THREE.Mesh(postGeo, poleMat);
          post.position.set(tx + px, 2.2, pz);
          rig.add(post);
        }
      }
    }

    const fPole = new THREE.Mesh(poleGeo, poleMat);
    fPole.position.set(0, 3.4, 3.6);
    const flagMesh = new THREE.Mesh(flagGeo, flagMat);
    flagMesh.position.set(0, 5.9, 3.6);
    rig.add(fPole, flagMesh);
    flags.push(flagMesh);

    parent.add(rig);

    registry.obbs.push({
      id: `${mapId}_fanzone_${k}`,
      kind: 'building',
      centerX: fx,
      centerZ: fz,
      halfW: 8.2,
      halfD: 5.2,
      axisX: s.tangentX,
      axisZ: s.tangentZ,
      minY: fy - 1,
      maxY: fy + 8,
    });
  }

  return {
    updateFlags: (elapsed: number) => {
      for (let i = 0; i < flags.length; i++) {
        flags[i].rotation.y = Math.sin(elapsed * 3.8 + i * 1.4) * 0.28;
      }
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

/**
 * Shared Trackside Infra: Start/Finish gantry, Sector 1/2/3 overhead portals,
 * marshal flag posts, and 150m/100m/50m distance brake marker boards.
 */
export function buildSharedTracksideInfra(
  parent: THREE.Group,
  samples: TrackSample[],
  mapDef: MapDefinition
): { setNightFactor: (night: number) => void; dispose: () => void } {
  const disposables: { dispose: () => void }[] = [];
  const accentHex = mapDef.id === 'coral_bay' ? 0x06b6d4 : 0x38bdf8;

  const trussMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.42,
    metalness: 0.78,
  });
  const gantrySignMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    emissive: accentHex,
    emissiveIntensity: 0.65,
    roughness: 0.35,
  });
  const lightBulbMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 1.5,
  });
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.55,
  });
  disposables.push(trussMat, gantrySignMat, lightBulbMat, postMat);

  const legGeo = new THREE.BoxGeometry(0.72, 8.2, 0.72);
  const spanGeo = new THREE.BoxGeometry(1.35, 1.55, mapDef.roadWidth + 4.8);
  const crossBraceGeo = new THREE.BoxGeometry(1.65, 0.35, mapDef.roadWidth + 4.4);
  const bulbGeo = new THREE.SphereGeometry(0.24, 10, 8);
  disposables.push(legGeo, spanGeo, crossBraceGeo, bulbGeo);

  // Start/Finish Gantry + S2/S3 Sector Portals with overhead truss & LED start-light pods
  const portalFracs = [0.0, mapDef.sectors[1].startT, mapDef.sectors[2].startT];
  for (let p = 0; p < portalFracs.length; p++) {
    const idx = Math.floor(samples.length * portalFracs[p]) % samples.length;
    const s = samples[idx];
    const g = new THREE.Group();
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = -Math.atan2(s.tangentZ, s.tangentX);

    const halfSpan = mapDef.roadHalfWidth + 1.85;
    const lLeg = new THREE.Mesh(legGeo, trussMat);
    lLeg.position.set(0, 4.0, -halfSpan);
    lLeg.castShadow = true;
    const rLeg = new THREE.Mesh(legGeo, trussMat);
    rLeg.position.set(0, 4.0, halfSpan);
    rLeg.castShadow = true;
    const topSpan = new THREE.Mesh(spanGeo, p === 0 ? gantrySignMat : trussMat);
    topSpan.position.set(0, 7.8, 0);
    topSpan.castShadow = true;
    const upperTruss = new THREE.Mesh(crossBraceGeo, trussMat);
    upperTruss.position.set(0, 8.85, 0);
    g.add(lLeg, rLeg, topSpan, upperTruss);

    if (p === 0) {
      for (let b = -2; b <= 2; b++) {
        const bulb = new THREE.Mesh(bulbGeo, lightBulbMat);
        bulb.position.set(-0.74, 7.65, b * 1.15);
        g.add(bulb);
      }
    }
    parent.add(g);
  }

  // Marshal posts & high-vis trackside marshals with yellow safety flags
  const mHutGeo = new THREE.BoxGeometry(1.8, 2.4, 1.8);
  const mRoofGeo = new THREE.BoxGeometry(2.2, 0.25, 2.2);
  const vestGeo = new THREE.CapsuleGeometry(0.24, 0.65, 4, 6);
  const vestMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6 });
  const mFlagGeo = new THREE.PlaneGeometry(0.95, 0.55);
  mFlagGeo.translate(0.48, 0, 0);
  const mFlagMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  disposables.push(mHutGeo, mRoofGeo, vestGeo, vestMat, mFlagGeo, mFlagMat);

  for (let m = 0; m < 10; m++) {
    const s = samples[Math.floor((samples.length * (m + 0.5)) / 10) % samples.length];
    if (s.isBridge || s.hasRightPitGap) continue;
    const side = m % 2 === 0 ? 1 : -1;
    const mx = s.x + s.rightX * side * (mapDef.roadHalfWidth + 3.4);
    const mz = s.z + s.rightZ * side * (mapDef.roadHalfWidth + 3.4);

    const hut = new THREE.Mesh(mHutGeo, postMat);
    hut.position.set(mx, s.y + 1.15, mz);
    hut.rotation.y = -Math.atan2(s.tangentZ, s.tangentX);
    const roof = new THREE.Mesh(mRoofGeo, gantrySignMat);
    roof.position.set(mx, s.y + 2.45, mz);
    roof.rotation.y = hut.rotation.y;
    const marshal = new THREE.Mesh(vestGeo, vestMat);
    marshal.position.set(
      s.x + s.rightX * side * (mapDef.roadHalfWidth + 2.3),
      s.y + 0.85,
      s.z + s.rightZ * side * (mapDef.roadHalfWidth + 2.3)
    );
    const mFlag = new THREE.Mesh(mFlagGeo, mFlagMat);
    mFlag.position.set(marshal.position.x, s.y + 1.55, marshal.position.z);
    mFlag.rotation.y = hut.rotation.y + 0.4;
    parent.add(hut, roof, marshal, mFlag);
  }

  return {
    setNightFactor: (night: number) => {
      gantrySignMat.emissiveIntensity = 0.5 + night * 1.4;
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
