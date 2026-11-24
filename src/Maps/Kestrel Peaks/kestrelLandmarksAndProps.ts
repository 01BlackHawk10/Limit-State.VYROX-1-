import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createCircuitQueryScratch,
  getCircuitData,
  SHOULDER_WIDTH,
} from '../Aurelia Ridge/circuitSpline';
import { KESTREL_WATER_LEVEL } from './kestrelTerrainField';
import { createSeededRandom, fbm2D, lerp } from '../../engine/mathNoise';
import { ProceduralTextureSuite } from '../Aurelia Ridge/proceduralTextures';
import { type WeatherUniforms } from '../Aurelia Ridge/skyAndLighting';
import {
  groundHeightAt,
  groundNormalAtInto,
} from '../Aurelia Ridge/terrainField';
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
import { attachInstancedUserAsset, type UserAssetId } from '../../engine/userAssetsLoader';

/**
 * Kestrel Peaks Dolomite Mountain Pass Landmarks:
 * 1. Stone & Dark Steel 6-Bay Alpine Paddock, Pit Apron, Race Control & Grandstand
 * 2. Highland Stone Watchtower overlooking the Stone Viaduct & Waterfall
 * 3. Dolomite Mountain Refuge Lodge perched above Eagle Col Summit (254m)
 * 4. Highland Loch Boathouse & Timber Pier
 */
export function buildKestrelLandmarksRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): LandmarksAndCampusRig {
  const group = new THREE.Group();
  group.name = 'KestrelLandmarksRig';

  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };

  const circuit = getCircuitData();
  const pitBounds = circuit.pitLaneBounds;
  const pitY = pitBounds.y;

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const disposableTex: THREE.Texture[] = [];
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
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    disposableTex.push(t);
    return t;
  };

  const pitFrame = pitBounds.frame ?? {
    centerX: 0,
    centerZ: 540,
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
      color: 0x9aa4b2,
      roughness: 0.74,
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
      color: 0x34d399,
      emissive: 0x059669,
      emissiveIntensity: 0.25,
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
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.25,
      roughness: 0.46,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const boxPadGeo = trackGeo(new THREE.PlaneGeometry(10.5, 4.6));
  boxPadGeo.rotateX(-Math.PI / 2);
  const boxPadInst = new THREE.InstancedMesh(boxPadGeo, boxMat, 6);
  const padDummyMat = new THREE.Matrix4();
  for (let b = 0; b < 6; b++) {
    padDummyMat.makeTranslation(-50 + b * 20, 0.055, 1.6);
    boxPadInst.setMatrixAt(b, padDummyMat);
  }
  boxPadInst.instanceMatrix.needsUpdate = true;
  boxPadInst.computeBoundingSphere();
  pitComplexGroup.add(boxPadInst);

  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.concreteNormal,
      color: 0xcbd5e1,
      roughness: 0.78,
      metalness: 0.06,
    }),
  );
  // Keep pit wall collider aligned with sharedPitRig's FIA pit wall at z = 9.2 (no duplicate visual mesh)
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

  // Shared materials used by Watchtower, Refuge Lodge, Finish Arch, Boathouse Pier & Signboards
  const paddockDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1a2029,
      roughness: 0.42,
      metalness: 0.65,
    }),
  );
  const timberMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.barkAlbedo,
      normalMap: textures.barkNormal,
      color: 0x61442e,
      roughness: 0.85,
      metalness: 0.04,
    }),
  );
  const bayLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0x34d399,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    }),
  );

  // Highland Stone Watchtower overlooking Stone Viaduct & Waterfall
  const stoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.terrainRockNormal,
      color: 0x737b84,
      roughness: 0.90,
      metalness: 0.04,
    }),
  );
  const slateRoofMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x26313d,
      roughness: 0.72,
      metalness: 0.14,
    }),
  );
  const watchWx = 415;
  const watchWz = -35;
  const watchY = groundHeightAt(watchWx, watchWz);
  const watchGroup = new THREE.Group();
  watchGroup.position.set(watchWx, watchY, watchWz);
  group.add(watchGroup);

  const towerBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(5.2, 6.4, 15.0, 10)), stoneMat);
  towerBase.position.y = 6.5;
  towerBase.castShadow = true;
  towerBase.receiveShadow = true;
  watchGroup.add(towerBase);

  const towerTurret = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(6.1, 6.2, 10)), slateRoofMat);
  towerTurret.position.y = 16.5;
  towerTurret.castShadow = true;
  watchGroup.add(towerTurret);

  const towerBeacon = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.1, 1.1, 0.9, 8)), bayLightMat);
  towerBeacon.position.y = 12.6;
  watchGroup.add(towerBeacon);
  worldColliders.addCircle(watchWx, watchWz, 6.5, 'concrete', watchY - 2, watchY + 18);

  // Dolomite Mountain Refuge Lodge & Summit Observatory perched beside the 326m Peak Finish (35, 326, -175)
  const lodgeWx = 74;
  const lodgeWz = -196;
  const lodgeY = Math.max(322, groundHeightAt(lodgeWx, lodgeWz));
  const lodgeGroup = new THREE.Group();
  lodgeGroup.position.set(lodgeWx, lodgeY, lodgeWz);
  lodgeGroup.rotation.y = 0.65;
  group.add(lodgeGroup);

  const lodgePlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(22, 8, 14)), stoneMat);
  lodgePlinth.position.y = -3.2;
  lodgeGroup.add(lodgePlinth);
  const lodgeBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(19, 5.2, 11.5)), timberMat);
  lodgeBody.position.y = 3.2;
  lodgeBody.castShadow = true;
  lodgeGroup.add(lodgeBody);
  const lodgeRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(14.5, 5.5, 4)), slateRoofMat);
  lodgeRoof.rotation.y = Math.PI * 0.25;
  lodgeRoof.position.y = 8.4;
  lodgeRoof.castShadow = true;
  lodgeGroup.add(lodgeRoof);
  worldColliders.addCircle(lodgeWx, lodgeWz, 11.5, 'concrete', lodgeY - 4, lodgeY + 14);

  // Alpine Summit Pass Crest Gate straddling the mountain peak pass (mid-lap landmark, NOT Finish Line)
  let finIdx = 0;
  let finDist = Infinity;
  for (let i = 0; i < circuit.samples.length; i++) {
    const cs = circuit.samples[i];
    if (cs.isTunnel || cs.isBridge) continue;
    const d = Math.hypot(cs.position.x - 35, cs.position.z + 175);
    if (d < finDist) {
      finDist = d;
      finIdx = i;
    }
  }
  const finS = circuit.samples[finIdx];
  const finArchGrp = new THREE.Group();
  finArchGrp.position.copy(finS.position);
  finArchGrp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), finS.tangent.clone().setY(0).normalize());
  const archSpan = circuit.roadWidth + 5.6;
  const fPostL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 8.6, 1.35)), stoneMat);
  fPostL.position.set(-archSpan * 0.5, 4.3, 0);
  const fPostR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.15, 8.6, 1.35)), stoneMat);
  fPostR.position.set(archSpan * 0.5, 4.3, 0);
  const fHeader = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(archSpan + 1.4, 2.0, 1.5)), paddockDarkMat);
  fHeader.position.set(0, 8.35, 0);
  const summitBannerCanvas = document.createElement('canvas');
  summitBannerCanvas.width = 768;
  summitBannerCanvas.height = 160;
  const sbCtx = summitBannerCanvas.getContext('2d');
  if (sbCtx) {
    sbCtx.fillStyle = '#0b1622';
    sbCtx.fillRect(0, 0, 768, 160);
    sbCtx.strokeStyle = '#10b981';
    sbCtx.lineWidth = 8;
    sbCtx.strokeRect(8, 8, 752, 144);
    sbCtx.fillStyle = '#34d399';
    sbCtx.font = 'bold 34px sans-serif';
    sbCtx.textAlign = 'center';
    sbCtx.fillText('KESTREL ALPINE SUMMIT PASS', 384, 62);
    sbCtx.fillStyle = '#f8fafc';
    sbCtx.font = 'bold 28px monospace';
    sbCtx.fillText('ELEV 326M  //  HIGHEST CREST  //  LAP CONTINUES', 384, 114);
  }
  const summitBannerTex = trackTex(new THREE.CanvasTexture(summitBannerCanvas));
  summitBannerTex.colorSpace = THREE.SRGBColorSpace;
  summitBannerTex.needsUpdate = true;
  const summitBannerMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: summitBannerTex,
      emissiveMap: summitBannerTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.32,
      roughness: 0.35,
    }),
  );
  const fBannerF = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(archSpan - 0.8, 1.65)), summitBannerMat);
  fBannerF.position.set(0, 8.35, 0.78);
  const fBannerB = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(archSpan - 0.8, 1.65)), summitBannerMat);
  fBannerB.position.set(0, 8.35, -0.78);
  fBannerB.rotation.y = Math.PI;
  const fGlow = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(archSpan - 0.6, 0.28, 1.6)), bayLightMat);
  fGlow.position.set(0, 7.22, 0);
  finArchGrp.add(fPostL, fPostR, fHeader, fBannerF, fBannerB, fGlow);
  group.add(finArchGrp);

  // Highland Loch Wooden Boathouse Pier on SW Loch Shore
  const pierWx = 455;
  const pierWz = 85;
  const pierGroup = new THREE.Group();
  pierGroup.position.set(pierWx, KESTREL_WATER_LEVEL + 0.55, pierWz);
  pierGroup.rotation.y = 0.55;
  group.add(pierGroup);
  const pierDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.2, 0.35, 16.0)), timberMat);
  pierDeck.castShadow = true;
  pierDeck.receiveShadow = true;
  pierGroup.add(pierDeck);
  const boathouse = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.0, 3.4, 6.8)), timberMat);
  boathouse.position.set(0, 1.85, -4.5);
  boathouse.castShadow = true;
  pierGroup.add(boathouse);
  const boathouseRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(4.6, 2.6, 4)), slateRoofMat);
  boathouseRoof.rotation.y = Math.PI * 0.25;
  boathouseRoof.position.set(0, 4.7, -4.5);
  pierGroup.add(boathouseRoof);

  // Summit Peak Scenic Overlook Deck near Finish (326m Mountain Crown)
  const overlookWx = 8;
  const overlookWz = -212;
  const overlookY = Math.max(322, groundHeightAt(overlookWx, overlookWz));
  const overlookGroup = new THREE.Group();
  overlookGroup.position.set(overlookWx, overlookY, overlookWz);
  overlookGroup.rotation.y = 0.35;
  group.add(overlookGroup);

  const deckStoneBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.5, 4.2, 8.5)), stoneMat);
  deckStoneBase.position.y = -1.6;
  deckStoneBase.receiveShadow = true;
  overlookGroup.add(deckStoneBase);

  const deckPlanks = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.2, 0.28, 9.2)), timberMat);
  deckPlanks.position.y = 0.62;
  deckPlanks.castShadow = true;
  deckPlanks.receiveShadow = true;
  overlookGroup.add(deckPlanks);

  const railGeo = trackGeo(new THREE.BoxGeometry(13.0, 0.14, 0.14));
  const railFront = new THREE.Mesh(railGeo, timberMat);
  railFront.position.set(0, 1.55, 4.35);
  overlookGroup.add(railFront);
  const vistaMast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.09, 0.12, 6.2, 8)), paddockDarkMat);
  vistaMast.position.set(5.4, 3.6, 3.8);
  overlookGroup.add(vistaMast);
  const vistaFlag = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 1.15, 0.06)), bayLightMat);
  vistaFlag.position.set(6.45, 5.9, 3.8);
  overlookGroup.add(vistaFlag);

  // Alpine Pass Elevation Signboards along climb & summit crest (placed outside shoulder)
  const makePassSignTexture = (title: string, elev: string): THREE.CanvasTexture => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 192;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 512, 192);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 8;
      ctx.strokeRect(10, 10, 492, 172);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('KESTREL SUMMIT CLIMB', 34, 58);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 54px sans-serif';
      ctx.fillText(title, 34, 120);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 34px monospace';
      ctx.fillText(elev, 34, 162);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, textures.gantryBannerAlbedo.anisotropy || 4);
    tex.needsUpdate = true;
    return tex;
  };

  const passWaypoints: Array<{ tx: number; tz: number; side: -1 | 1; title: string; elev: string }> = [
    { tx: 320, tz: 410, side: 1, title: 'SWITCHBACKS', elev: 'ELEV 1,140 M // +14%' },
    { tx: -345, tz: -760, side: -1, title: 'GALLERY TUNNEL', elev: 'ELEV 2,420 M // BORE' },
    { tx: 35, tz: -175, side: 1, title: 'SUMMIT CREST', elev: 'ELEV 3,220 M // PEAK' },
  ];
  const signPostGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.13, 4.2, 8));
  const signBoardGeo = trackGeo(new THREE.BoxGeometry(5.2, 2.0, 0.16));
  for (const wp of passWaypoints) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < circuit.samples.length; i++) {
      const cs = circuit.samples[i];
      if (cs.isBridge || cs.isTunnel) continue;
      const d = Math.hypot(cs.position.x - wp.tx, cs.position.z - wp.tz);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    const s = circuit.samples[bestIdx];
    const lat = wp.side * (circuit.roadHalfWidth + SHOULDER_WIDTH + 5.2);
    const sx = s.position.x + s.right.x * lat;
    const sz = s.position.z + s.right.z * lat;
    if (circuit.queryNearest(sx, sz).absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 3.4) continue;
    const sy = Math.max(s.position.y, groundHeightAt(sx, sz));
    const signGrp = new THREE.Group();
    signGrp.position.set(sx, sy, sz);
    const faceDir = s.tangent.clone().multiplyScalar(-1).setY(0).normalize();
    signGrp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), faceDir);

    const postL = new THREE.Mesh(signPostGeo, paddockDarkMat);
    postL.position.set(-1.6, 2.1, 0);
    const postR = new THREE.Mesh(signPostGeo, paddockDarkMat);
    postR.position.set(1.6, 2.1, 0);
    const tex = makePassSignTexture(wp.title, wp.elev);
    const boardMat = trackMat(
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.15 }),
    );
    const board = new THREE.Mesh(signBoardGeo, boardMat);
    board.position.set(0, 3.65, 0.08);
    board.castShadow = true;
    signGrp.add(postL, postR, board);
    group.add(signGrp);
  }

  // Shared FIA Pit Furniture + Race Control + Covered Spectator Grandstand
  const sharedPitRig = buildOrientedPitAndGrandstandAddon(
    group,
    textures,
    sharedWeather,
    pitBounds,
    pitFrame,
    KESTREL_WATER_LEVEL,
    'kestrel_peaks',
  );

  // Corner Spectator Fan Zones
  const cornerFanRig = buildCornerFanZoneRigs(
    group,
    sharedWeather,
    KESTREL_WATER_LEVEL,
    'kestrel_peaks',
  );

  return {
    group,
    update: (elapsedSec: number, deltaSec = 0.016, crowdInput?: CrowdTelemetryInput) => {
      sharedPitRig.update(elapsedSec, deltaSec, crowdInput);
      cornerFanRig.update(deltaSec, elapsedSec, {
        closestRivalGapSec: crowdInput?.closestRivalGapSec ?? null,
        speedMps: crowdInput?.speedMps ?? 0,
        playerDistToGrandstand: crowdInput?.playerDistToGrandstand ?? 500,
        isFinalLap: crowdInput?.isFinalLap ?? false,
        isRacing: crowdInput?.isRacing ?? false,
        isPodium: crowdInput?.isPodium ?? false,
        isFinished: crowdInput?.isFinished ?? false,
        isCloseFinish: crowdInput?.isCloseFinish ?? false,
        positionChangedPulse: crowdInput?.positionChangedPulse ?? 0,
        reactivityScale: crowdInput?.reactivityScale ?? 1,
        densityScale: crowdInput?.densityScale ?? 1,
        playerPos: crowdInput?.playerPos,
      });
    },
    setNightFactor: (nightFactor: number) => {
      bayLightMat.emissiveIntensity = 0.4 + nightFactor * 2.2;
      sharedPitRig.setNightFactor(nightFactor);
      cornerFanRig.setNightFactor(nightFactor);
    },
    setWireframe: (wire: boolean) => {
      for (const m of wireMats) {
        (m as THREE.MeshStandardMaterial).wireframe = wire;
      }
      sharedPitRig.setWireframe(wire);
      cornerFanRig.setWireframe(wire);
    },
    getGrandstandWorldPos: () => sharedPitRig.getGrandstandWorldPos(),
    dispose: () => {
      sharedPitRig.dispose();
      cornerFanRig.dispose();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
      for (const t of disposableTex) t.dispose();
    },
  };
}

/**
 * Builds Kestrel Peaks' Aurelia-grade Dense Botanical Forests (~3,200 multi-species trees
 * with Lathe trunks + 6 wooden limbs + scalloped conifer needle fans & wind/wetness shaders),
 * ~2,000 alpine scrub/ferns, ~520 Dolomite boulders, ~170 jagged limestone pinnacles,
 * and FIA trackside infrastructure.
 */
export function buildKestrelPropsAndFoliageRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): PropsAndFoliageRig {
  const group = new THREE.Group();
  group.name = 'KestrelPropsAndFoliageRig';

  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };

  const tracksideInfra = buildSharedTracksideInfra(
    group,
    textures,
    sharedWeather,
    'kestrel_peaks',
    KESTREL_WATER_LEVEL,
  );

  const circuit = getCircuitData();
  const roadHalf = circuit.roadHalfWidth;
  const rand = createSeededRandom(67213);

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

  const scaledRegistry: Array<{
    mesh: THREE.InstancedMesh;
    fullCount: number;
    allowsShadow: boolean;
  }> = [];

  const dummy = new THREE.Object3D();

  // ---------------------------------------------------------------------------
  // 1. BOTANICAL MULTI-SPECIES TRUNKS & LIMBS (Lathe + 6 Angled Branches)
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
  barkParts.push(new THREE.LatheGeometry(trunkProfile, 10));
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
      .replace('#include <common>', `#include <common>\nuniform float uWetness;`)
      .replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.62, uWetness);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.48, uWetness * 0.78);`);
  };
  trunkMat.customProgramCacheKey = () => 'kestrel-bark-wet-static-v4';

  // ---------------------------------------------------------------------------
  // 2. BOTANICAL SCALLOPED CONIFER CANOPIES (Spruce, Alpine Pine, Fir, Krummholz)
  // ---------------------------------------------------------------------------
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
      const scallop = 1.0 + 0.22 * Math.sin(ang * 5.0 + seedOff) + 0.12 * Math.cos(ang * 9.0 - seedOff);
      const droop = rDist > 0.1 ? -Math.pow(rDist / rad, 1.4) * height * droopFactor : 0;
      pos.setXYZ(v, vx * scallop, vy + droop, vz * scallop);
    }
    scaleGeometryUvs(g, 2.4, 2.0);
    g.computeVertexNormals();
    return g;
  };

  // Species 1: Tall Norway Spruce (~11.5m slender drooping whorls)
  const spruceParts: THREE.BufferGeometry[] = [];
  const spruceTiers = [
    { y: 2.35, rad: 1.56, h: 1.8, n: 5, offsetR: 0.56 },
    { y: 3.65, rad: 1.42, h: 1.7, n: 5, offsetR: 0.46 },
    { y: 4.95, rad: 1.24, h: 1.6, n: 4, offsetR: 0.36 },
    { y: 6.25, rad: 1.04, h: 1.48, n: 4, offsetR: 0.26 },
    { y: 7.5, rad: 0.80, h: 1.38, n: 3, offsetR: 0.18 },
    { y: 8.65, rad: 0.58, h: 1.32, n: 3, offsetR: 0.10 },
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
      fan.translate(Math.cos(ang) * tier.offsetR, tier.y + (k % 2) * 0.14, Math.sin(ang) * tier.offsetR);
      spruceParts.push(fan);
    }
  }
  const spruceSpire = makeNeedleBoughFan(0.64, 2.5, 8, 12.7, 0.3);
  spruceSpire.translate(0, 9.85, 0);
  spruceParts.push(spruceSpire);
  const spruceCanopyGeo = trackGeo(BufferGeometryUtils.mergeGeometries(spruceParts, false));
  for (const g of spruceParts) g.dispose();

  // Species 2: Broad Dolomite Alpine Pine
  const pineParts: THREE.BufferGeometry[] = [];
  const pineTiers = [
    { y: 3.15, rad: 1.60, h: 1.50, n: 5, offsetR: 0.74 },
    { y: 4.35, rad: 1.40, h: 1.38, n: 4, offsetR: 0.58 },
    { y: 5.55, rad: 1.18, h: 1.28, n: 4, offsetR: 0.42 },
    { y: 6.7, rad: 0.94, h: 1.18, n: 3, offsetR: 0.28 },
    { y: 7.75, rad: 0.70, h: 1.18, n: 2, offsetR: 0.14 },
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
      fan.translate(Math.cos(ang) * tier.offsetR, tier.y + (k % 2) * 0.16, Math.sin(ang) * tier.offsetR);
      pineParts.push(fan);
    }
  }
  const leaderCrown = makeNeedleBoughFan(0.78, 2.1, 8, 9.1);
  leaderCrown.translate(0, 8.85, 0);
  pineParts.push(leaderCrown);
  const pineCanopyGeo = trackGeo(BufferGeometryUtils.mergeGeometries(pineParts, false));
  for (const g of pineParts) g.dispose();

  // Species 3: Tall Highland Silver Fir / Mountain Cypress Column
  const firParts: THREE.BufferGeometry[] = [];
  for (let cIdx = 0; cIdx < 11; cIdx++) {
    const f = cIdx / 10;
    const cy = 2.4 + f * 7.0;
    const rad = lerp(0.98, 0.28, Math.pow(f, 0.95));
    const sy = lerp(1.58, 1.4, f);
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
    firParts.push(tuft);
  }
  const firCanopyGeo = trackGeo(BufferGeometryUtils.mergeGeometries(firParts, false));
  for (const g of firParts) g.dispose();

  // Species 4: Windswept Timberline Krummholz
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
      .replace('#include <common>', `#include <common>\nuniform float uWetness;`)
      .replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.72, uWetness);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.36, uWetness * 0.84);`);
  };
  foliageMat.customProgramCacheKey = () => 'kestrel-foliage-botanical-pbr-static-v5';

  const baseSprucePalette = [
    new THREE.Color(0x1f4523),
    new THREE.Color(0x28512b),
    new THREE.Color(0x19391f),
    new THREE.Color(0x315b34),
  ];
  const basePinePalette = [
    new THREE.Color(0x2c522a),
    new THREE.Color(0x366033),
    new THREE.Color(0x41693a),
    new THREE.Color(0x254825),
  ];
  const baseFirPalette = [
    new THREE.Color(0x2b4a2e),
    new THREE.Color(0x36593a),
    new THREE.Color(0x416443),
  ];
  const baseLarchPalette = [
    new THREE.Color(0x9a7b2c),
    new THREE.Color(0xb68b2d),
    new THREE.Color(0x7c742b),
  ];
  const baseKrummholzPalette = [
    new THREE.Color(0x3a5632),
    new THREE.Color(0x486239),
    new THREE.Color(0x334d2e),
  ];
  const tintVariation = (base: THREE.Color): THREE.Color => {
    const c = base.clone();
    c.offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.07, (rand() - 0.5) * 0.05);
    return c;
  };

  const qScratch = createCircuitQueryScratch(circuit.samples[0]);
  const nScratch = new THREE.Vector3();

  // Locate Snow-Shed Gallery footprint to prevent trees/crags from blocking or piercing it
  const shedIdx17 = (() => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < circuit.samples.length; i++) {
      const p = circuit.samples[i].position;
      const d = Math.hypot(p.x - 430, p.z + 685);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  })();
  const shedIdx18 = (() => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < circuit.samples.length; i++) {
      const p = circuit.samples[i].position;
      const d = Math.hypot(p.x - 165, p.z + 490);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    return bi;
  })();
  const shedSpan = Math.max(10, shedIdx18 - shedIdx17);
  const shedStartIdx = Math.round(shedIdx17 + shedSpan * 0.16);
  const shedEndIdx = Math.round(shedIdx17 + shedSpan * 0.56);

  // Collect all tunnel samples & portal endpoints dynamically and index into O(1) 28m spatial hash cells
  const SPATIAL_CELL = 28;
  const roadHashGrid = new Map<number, Array<{ x: number; z: number }>>();
  const tunnelHashGrid = new Map<number, Array<{ x: number; z: number }>>();
  const portalHashGrid = new Map<number, Array<{ x: number; z: number }>>();
  const spatialKey = (gx: number, gz: number) => ((gx + 256) << 12) | (gz + 256);
  const insertSpatialPoint = (
    grid: Map<number, Array<{ x: number; z: number }>>,
    x: number,
    z: number,
  ) => {
    const gx = Math.floor(x / SPATIAL_CELL);
    const gz = Math.floor(z / SPATIAL_CELL);
    const k = spatialKey(gx, gz);
    let arr = grid.get(k);
    if (!arr) {
      arr = [];
      grid.set(k, arr);
    }
    arr.push({ x, z });
  };
  const hasNearPoint = (
    grid: Map<number, Array<{ x: number; z: number }>>,
    wx: number,
    wz: number,
    radius: number,
  ): boolean => {
    const rSq = radius * radius;
    const cellSpan = Math.ceil(radius / SPATIAL_CELL);
    const cgx = Math.floor(wx / SPATIAL_CELL);
    const cgz = Math.floor(wz / SPATIAL_CELL);
    for (let dzCell = -cellSpan; dzCell <= cellSpan; dzCell++) {
      for (let dxCell = -cellSpan; dxCell <= cellSpan; dxCell++) {
        const arr = grid.get(spatialKey(cgx + dxCell, cgz + dzCell));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const p = arr[i];
          const dx = wx - p.x;
          const dz = wz - p.z;
          if (dx * dx + dz * dz < rSq) return true;
        }
      }
    }
    return false;
  };

  const allS = circuit.samples;
  for (let i = 0; i < allS.length; i++) {
    const cs = allS[i];
    if (i % 2 === 0) {
      insertSpatialPoint(roadHashGrid, cs.position.x, cs.position.z);
    }
    if (cs.isTunnel) {
      insertSpatialPoint(tunnelHashGrid, cs.position.x, cs.position.z);
      const prev = allS[(i - 1 + allS.length) % allS.length];
      const next = allS[(i + 1) % allS.length];
      if (!prev.isTunnel || !next.isTunnel) {
        insertSpatialPoint(portalHashGrid, cs.position.x, cs.position.z);
      }
    }
  }

  const isBlockedByTunnelOrShed = (
    wx: number,
    wz: number,
    q: ReturnType<typeof circuit.queryNearestInto>,
    extraPad = 0,
  ): boolean => {
    // 0. Guarantee absolute XZ clearance against ANY road sample (including crossovers/switchbacks)
    if (hasNearPoint(roadHashGrid, wx, wz, circuit.roadHalfWidth + SHOULDER_WIDTH + 3.8 + extraPad)) {
      return true;
    }
    // 1. Keep every tunnel portal entrance/exit & forecourt 100% open
    if (hasNearPoint(portalHashGrid, wx, wz, 44 + extraPad)) {
      return true;
    }
    // 2. Keep ALL tunnel bores (including crossover lower bore where queryNearest might match upper bridge!) clear
    if (hasNearPoint(tunnelHashGrid, wx, wz, 32 + extraPad)) {
      return true;
    }
    // 3. Keep Snow-Shed Gallery corridor & mouths clear
    const sIdx = q.sample.index;
    if ((q.sample.isTunnel || q.nextSample.isTunnel) && q.absDistance < 32 + extraPad) {
      return true;
    }
    if (sIdx >= shedStartIdx - 12 && sIdx <= shedEndIdx + 12 && q.absDistance < 28 + extraPad) {
      return true;
    }
    return false;
  };

  // Spatial 4x4 grid chunking for props/foliage (~550m cells) so distant trees/scrub/rocks cull cleanly
  const CELL_DIM = 4;
  const CELL_HALF_SPAN = 1100;
  const CELL_SIZE = (CELL_HALF_SPAN * 2) / CELL_DIM;
  const CELL_HALF_DIAG = CELL_SIZE * 0.72;
  const cellGroups: Array<{ group: THREE.Group; cx: number; cz: number }> = [];
  for (let czIdx = 0; czIdx < CELL_DIM; czIdx++) {
    for (let cxIdx = 0; cxIdx < CELL_DIM; cxIdx++) {
      const cg = new THREE.Group();
      cg.name = `KestrelPropCell_${cxIdx}_${czIdx}`;
      group.add(cg);
      cellGroups.push({
        group: cg,
        cx: -CELL_HALF_SPAN + (cxIdx + 0.5) * CELL_SIZE,
        cz: -CELL_HALF_SPAN + (czIdx + 0.5) * CELL_SIZE,
      });
    }
  }
  const getCellIndex = (x: number, z: number): number => {
    const cx = Math.max(0, Math.min(CELL_DIM - 1, Math.floor((x + CELL_HALF_SPAN) / CELL_SIZE)));
    const cz = Math.max(0, Math.min(CELL_DIM - 1, Math.floor((z + CELL_HALF_SPAN) / CELL_SIZE)));
    return cz * CELL_DIM + cx;
  };

  type PropKindBucket = {
    matrices: THREE.Matrix4[];
    colors: THREE.Color[];
  };
  const makeCellBuckets = (): PropKindBucket[] =>
    Array.from({ length: CELL_DIM * CELL_DIM }, () => ({ matrices: [], colors: [] }));

  const cleanupCallbacks: Array<() => void> = [];
  let isDisposed = false;
  let keepRatio = 0.62;
  let foliageDensityScale = 1.0;
  let allowTreeShadows = false;
  const getTreeQualityState = () => ({
    keepRatio,
    foliageDensityScale,
    allowShadows: allowTreeShadows,
  });

  const spruceCells = makeCellBuckets();
  const pineCells = makeCellBuckets();
  const firCells = makeCellBuckets();
  const larchCells = makeCellBuckets();
  const krummCells = makeCellBuckets();

  let treeAttempts = 0;
  const maxTrees = 4800;
  let totalPlacedTrees = 0;
  while (totalPlacedTrees < maxTrees && treeAttempts < 58000) {
    treeAttempts++;
    const tx = (rand() - 0.5) * 2060;
    const tz = (rand() - 0.5) * 2060;
    const ty = groundHeightAt(tx, tz);
    if (ty < KESTREL_WATER_LEVEL + 1.3 || ty > 268) continue;

    const q = circuit.queryNearestInto(tx, tz, qScratch);
    if (q.absDistance < roadHalf + SHOULDER_WIDTH + 9.5) continue;
    if (isBlockedByTunnelOrShed(tx, tz, q, 4.0)) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, tx, ty, tz, 18, 34)) continue;
    if (Math.hypot(tx - 415, tz + 35) < 16 || Math.hypot(tx - 74, tz + 196) < 26 || Math.hypot(tx - 35, tz + 175) < 30 || Math.hypot(tx - 404, tz + 110) < 36) continue;
    if (Math.abs(tx + 60) < 82 && tz > 622 && tz < 688) continue;

    const n = groundNormalAtInto(tx, tz, 1.6, nScratch);
    const isTimberline = ty > 188;
    if (n.y < (isTimberline ? 0.60 : 0.66)) continue;

    const groveNoise = fbm2D(tx * 0.0068, tz * 0.0068, 4, 2.05, 0.52, 771);
    const microClump = fbm2D(tx * 0.021, tz * 0.021, 3, 2.0, 0.5, 913);
    const roadRibbonBias = q.absDistance < roadHalf + 45 ? 0.25 : 0.0;
    const groveDensity = Math.max(0, Math.min(1, 0.58 + groveNoise * 0.58 + microClump * 0.24 + roadRibbonBias));
    if (rand() > groveDensity * 0.96) continue;

    const cellIdx = getCellIndex(tx, tz);
    totalPlacedTrees++;

    const krummProb = ty > 215 ? 0.85 : ty > 185 && n.y < 0.78 ? 0.65 : ty > 192 ? (ty - 192) / 36 : 0;
    if (rand() < krummProb) {
      const sc = 0.82 + rand() * 0.55;
      dummy.position.set(tx, ty - 0.24, tz);
      dummy.rotation.set((rand() - 0.5) * 0.14, 0.54 + (rand() - 0.5) * 0.6, (rand() - 0.5) * 0.14);
      dummy.scale.set(sc, sc * (0.85 + rand() * 0.35), sc);
      dummy.updateMatrix();
      krummCells[cellIdx].matrices.push(dummy.matrix.clone());
      krummCells[cellIdx].colors.push(
        tintVariation(baseKrummholzPalette[Math.floor(rand() * baseKrummholzPalette.length)]),
      );
      worldColliders.addCircle(tx, tz, 0.44 * sc, 'wood', ty - 1.5, ty + 5.0);
      continue;
    }

    const scaleXZ = 0.86 + rand() * 0.74;
    const scaleY = 0.90 + rand() * 0.88;
    dummy.position.set(tx, ty - 0.30, tz);
    dummy.rotation.set((rand() - 0.5) * 0.08, rand() * Math.PI * 2, (rand() - 0.5) * 0.08);
    dummy.scale.set(scaleXZ, scaleY, scaleXZ);
    dummy.updateMatrix();
    const treeMat = dummy.matrix.clone();
    worldColliders.addCircle(tx, tz, 0.55 * scaleXZ, 'wood', ty - 1.5, ty + 9.0);

    const roll = rand();
    if (roll < 0.40) {
      spruceCells[cellIdx].matrices.push(treeMat);
      spruceCells[cellIdx].colors.push(tintVariation(baseSprucePalette[Math.floor(rand() * baseSprucePalette.length)]));
    } else if (roll < 0.72) {
      pineCells[cellIdx].matrices.push(treeMat);
      pineCells[cellIdx].colors.push(tintVariation(basePinePalette[Math.floor(rand() * basePinePalette.length)]));
    } else if (roll < 0.87) {
      firCells[cellIdx].matrices.push(treeMat);
      firCells[cellIdx].colors.push(tintVariation(baseFirPalette[Math.floor(rand() * baseFirPalette.length)]));
    } else {
      larchCells[cellIdx].matrices.push(treeMat);
      larchCells[cellIdx].colors.push(tintVariation(baseLarchPalette[Math.floor(rand() * baseLarchPalette.length)]));
    }
  }

  const addCellTreeSpecies = (
    tGeo: THREE.BufferGeometry,
    cGeo: THREE.BufferGeometry,
    cells: PropKindBucket[],
    glbAssetId?: UserAssetId,
  ) => {
    for (let c = 0; c < cells.length; c++) {
      const bucket = cells[c];
      if (bucket.matrices.length === 0) continue;
      const trunkInst = new THREE.InstancedMesh(tGeo, trunkMat, bucket.matrices.length);
      const canopyInst = new THREE.InstancedMesh(cGeo, foliageMat, bucket.matrices.length);
      for (let i = 0; i < bucket.matrices.length; i++) {
        trunkInst.setMatrixAt(i, bucket.matrices[i]);
        canopyInst.setMatrixAt(i, bucket.matrices[i]);
        canopyInst.setColorAt(i, bucket.colors[i]);
      }
      trunkInst.instanceMatrix.needsUpdate = true;
      trunkInst.computeBoundingSphere();
      trunkInst.castShadow = false;
      canopyInst.instanceMatrix.needsUpdate = true;
      if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
      canopyInst.computeBoundingSphere();
      canopyInst.castShadow = true;
      canopyInst.receiveShadow = true;
      cellGroups[c].group.add(trunkInst, canopyInst);
      scaledRegistry.push({ mesh: trunkInst, fullCount: bucket.matrices.length, allowsShadow: false });
      scaledRegistry.push({ mesh: canopyInst, fullCount: bucket.matrices.length, allowsShadow: true });

      if (glbAssetId) {
        const neutralColors = bucket.matrices.map((_, idx) => {
          const s = 0.88 + ((idx * 31) % 19) * 0.01;
          return new THREE.Color(s, s * 1.02, s * 0.96);
        });
        attachInstancedUserAsset({
          assetId: glbAssetId,
          parentGroup: cellGroups[c].group,
          matrices: bucket.matrices,
          colors: neutralColors,
          fallbackMeshes: [trunkInst, canopyInst],
          scaledRegistry,
          allowsShadow: true,
          isDisposed: () => isDisposed,
          getQualityState: getTreeQualityState,
          cleanupCallbacks,
        });
      }
    }
  };
  addCellTreeSpecies(trunkGeo, spruceCanopyGeo, spruceCells, 'pine_tree_1');
  addCellTreeSpecies(trunkGeo, pineCanopyGeo, pineCells, 'pine_tree_2');
  addCellTreeSpecies(trunkGeo, firCanopyGeo, firCells, 'pine_tree_1');
  addCellTreeSpecies(trunkGeo, pineCanopyGeo, larchCells, 'pine_tree_2');
  addCellTreeSpecies(krummholzTrunkGeo, krummholzCanopyGeo, krummCells);

  // ---------------------------------------------------------------------------
  // 3. ALPINE SCRUB BUSHES, ROADSIDE TUFTS & WATERFALL GORGE FERNS (~2,000)
  // ---------------------------------------------------------------------------
  const scrubParts: THREE.BufferGeometry[] = [];
  for (let s = 0; s < 3; s++) {
    const puff = new THREE.DodecahedronGeometry(0.68 - s * 0.08, 0);
    puff.scale(1.18, 0.72, 1.18);
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
      .replace('#include <common>', `#include <common>\nuniform float uWetness;`)
      .replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb *= mix(1.0, 0.72, uWetness);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.44, uWetness * 0.8);`);
  };
  scrubMat.customProgramCacheKey = () => 'kestrel-scrub-wet-static-v2';

  const scrubCells = makeCellBuckets();
  const scrubPalette = [
    new THREE.Color(0x3f6134),
    new THREE.Color(0x52733e),
    new THREE.Color(0x6b7742),
    new THREE.Color(0x32522d),
  ];

  let scrubAttempts = 0;
  let totalScrub = 0;
  while (totalScrub < 2000 && scrubAttempts < 19000) {
    scrubAttempts++;
    const sx = (rand() - 0.5) * 1850;
    const sz = (rand() - 0.5) * 1850;
    const q = circuit.queryNearestInto(sx, sz, qScratch);
    if (q.absDistance < roadHalf + SHOULDER_WIDTH + 5.0) continue;
    if (isBlockedByTunnelOrShed(sx, sz, q, 2.0)) continue;
    const nearBias = q.absDistance < roadHalf + 42 ? 0.9 : 0.36;
    if (rand() > nearBias) continue;

    const sy = groundHeightAt(sx, sz);
    if (sy < KESTREL_WATER_LEVEL + 0.6 || sy > 235) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, sx, sy, sz, 18, 34)) continue;
    if ((Math.abs(sx + 60) < 82 && sz > 622 && sz < 688) || Math.hypot(sx - 404, sz + 110) < 34) continue;

    const n = groundNormalAtInto(sx, sz, 1.3, nScratch);
    if (n.y < 0.66) continue;

    const sc = 0.58 + rand() * 0.98;
    dummy.position.set(sx, sy - 0.1, sz);
    dummy.rotation.set((rand() - 0.5) * 0.18, rand() * Math.PI * 2, (rand() - 0.5) * 0.18);
    dummy.scale.set(sc * (0.9 + rand() * 0.35), sc * (0.75 + rand() * 0.45), sc * (0.9 + rand() * 0.35));
    dummy.updateMatrix();
    const cIdx = getCellIndex(sx, sz);
    scrubCells[cIdx].matrices.push(dummy.matrix.clone());
    const col = scrubPalette[Math.floor(rand() * scrubPalette.length)].clone();
    col.offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.06);
    scrubCells[cIdx].colors.push(col);
    totalScrub++;
  }
  for (let c = 0; c < scrubCells.length; c++) {
    const bucket = scrubCells[c];
    if (bucket.matrices.length === 0) continue;
    const scrubInst = new THREE.InstancedMesh(scrubGeo, scrubMat, bucket.matrices.length);
    for (let i = 0; i < bucket.matrices.length; i++) {
      scrubInst.setMatrixAt(i, bucket.matrices[i]);
      scrubInst.setColorAt(i, bucket.colors[i]);
    }
    scrubInst.instanceMatrix.needsUpdate = true;
    if (scrubInst.instanceColor) scrubInst.instanceColor.needsUpdate = true;
    scrubInst.computeBoundingSphere();
    scrubInst.castShadow = false;
    scrubInst.receiveShadow = true;
    cellGroups[c].group.add(scrubInst);
    scaledRegistry.push({ mesh: scrubInst, fullCount: bucket.matrices.length, allowsShadow: false });
  }

  // ---------------------------------------------------------------------------
  // 4. FACETED DOLOMITE LIMESTONE BOULDERS (~520) & ROADSIDE CLIFF PINNACLES (~180)
  // ---------------------------------------------------------------------------
  const rockGeo = trackGeo(new THREE.DodecahedronGeometry(1.7, 1));
  const rPos = rockGeo.attributes.position as THREE.BufferAttribute;
  for (let v = 0; v < rPos.count; v++) {
    const vx = rPos.getX(v);
    const vy = rPos.getY(v);
    const vz = rPos.getZ(v);
    const j = 0.82 + 0.34 * Math.abs(Math.sin(vx * 3.1 + vy * 2.4 - vz * 1.9));
    rPos.setXYZ(v, vx * j * 1.15, vy * j * 0.78, vz * j);
  }
  rockGeo.computeVertexNormals();
  const rockMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      color: 0x828b96,
      roughness: 0.90,
      metalness: 0.04,
      flatShading: true,
    }),
  );

  const rockCells = makeCellBuckets();
  let rockAttempts = 0;
  let totalRocks = 0;
  while (totalRocks < 520 && rockAttempts < 9000) {
    rockAttempts++;
    const rx = (rand() - 0.5) * 1950;
    const rz = (rand() - 0.5) * 1950;
    const ry = groundHeightAt(rx, rz);
    if (ry < KESTREL_WATER_LEVEL - 0.8) continue;

    const q = circuit.queryNearestInto(rx, rz, qScratch);
    const sc = 0.75 + rand() * 2.3;
    if (q.absDistance < roadHalf + SHOULDER_WIDTH + 6.0 + sc * 1.9) continue;
    if (isBlockedByTunnelOrShed(rx, rz, q, 3.0 + sc)) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, rx, ry, rz, 14, 26)) continue;

    dummy.position.set(rx, ry - 0.35 * sc, rz);
    dummy.rotation.set(rand() * 0.4, rand() * Math.PI * 2, rand() * 0.4);
    dummy.scale.set(sc * (0.9 + rand() * 0.5), sc * (0.65 + rand() * 0.55), sc * (0.9 + rand() * 0.5));
    dummy.updateMatrix();
    rockCells[getCellIndex(rx, rz)].matrices.push(dummy.matrix.clone());
    worldColliders.addCircle(rx, rz, 1.35 * sc, 'rock', ry - 2, ry + 5);
    totalRocks++;
  }
  for (let c = 0; c < rockCells.length; c++) {
    const bucket = rockCells[c];
    if (bucket.matrices.length === 0) continue;
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, bucket.matrices.length);
    rockInst.castShadow = true;
    rockInst.receiveShadow = true;
    for (let i = 0; i < bucket.matrices.length; i++) rockInst.setMatrixAt(i, bucket.matrices[i]);
    rockInst.instanceMatrix.needsUpdate = true;
    rockInst.computeBoundingSphere();
    cellGroups[c].group.add(rockInst);
    scaledRegistry.push({ mesh: rockInst, fullCount: bucket.matrices.length, allowsShadow: true });
  }

  const cragGeo = trackGeo(new THREE.ConeGeometry(4.2, 16.5, 6, 4));
  cragGeo.translate(0, 7.2, 0);
  const cragPos = cragGeo.attributes.position as THREE.BufferAttribute;
  for (let v = 0; v < cragPos.count; v++) {
    const vx = cragPos.getX(v);
    const vy = cragPos.getY(v);
    const vz = cragPos.getZ(v);
    const jag = 0.76 + 0.42 * Math.abs(Math.sin(vx * 0.85 + vy * 0.45 - vz * 0.92));
    cragPos.setXYZ(v, vx * jag, vy, vz * (0.85 + 0.3 * Math.cos(vy * 0.5 + vx)));
  }
  cragGeo.computeVertexNormals();

  const cragMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      color: 0x89929d,
      roughness: 0.92,
      metalness: 0.03,
      flatShading: true,
    }),
  );

  const cragCells = makeCellBuckets();
  const totalSamples = circuit.samples.length;
  let totalCrags = 0;
  for (let i = 0; i < totalSamples && totalCrags < 180; i += 6) {
    const s = circuit.samples[i];
    if (s.isBridge || s.isTunnel) continue;
    if (i >= shedStartIdx - 6 && i <= shedEndIdx + 6) continue;
    for (const side of [-1, 1]) {
      if (totalCrags >= 180) break;
      if (rand() > 0.62) continue;
      const latOffset = side * (roadHalf + SHOULDER_WIDTH + 12.5 + rand() * 19.0);
      const cx = s.position.x + s.right.x * latOffset;
      const cz = s.position.z + s.right.z * latOffset;
      const sx = 1.0 + rand() * 1.45;
      const sy = 1.05 + rand() * 1.65;
      const sz = 1.0 + rand() * 1.45;
      const q = circuit.queryNearestInto(cx, cz, qScratch);
      const cragPad = Math.max(sx, sz) * 5.2;
      if (q.isBridge || q.absDistance < roadHalf + SHOULDER_WIDTH + 9.0 + cragPad) continue;
      if (isBlockedByTunnelOrShed(cx, cz, q, 8.5 + cragPad)) continue;
      if (isPointInPitBounds(circuit.pitLaneBounds, cx, s.position.y, cz, 22, 34)) continue;
      if (Math.hypot(cx - 415, cz + 35) < 26 || Math.hypot(cx - 74, cz + 196) < 28 || Math.hypot(cx - 35, cz + 175) < 32) continue;
      if (Math.hypot(cx - 404, cz + 110) < 42) continue;
      if (Math.abs(cx + 60) < 82 && cz > 622 && cz < 688) continue;

      const cy = groundHeightAt(cx, cz);
      if (cy < KESTREL_WATER_LEVEL + 4.0 || cy < s.position.y - 1.5) continue;

      dummy.position.set(cx, cy - 3.2 * sy, cz);
      dummy.rotation.set((rand() - 0.5) * 0.14, rand() * Math.PI * 2, (rand() - 0.5) * 0.14);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      const cIdx = getCellIndex(cx, cz);
      cragCells[cIdx].matrices.push(dummy.matrix.clone());
      const shade = 0.72 + rand() * 0.34;
      cragCells[cIdx].colors.push(new THREE.Color(shade * 0.94, shade * 0.97, shade * 1.03));
      worldColliders.addCircle(cx, cz, 3.8 * Math.max(sx, sz), 'rock', cy - 4, cy + 18 * sy);
      totalCrags++;
    }
  }
  for (let c = 0; c < cragCells.length; c++) {
    const bucket = cragCells[c];
    if (bucket.matrices.length === 0) continue;
    const cragInst = new THREE.InstancedMesh(cragGeo, cragMat, bucket.matrices.length);
    cragInst.castShadow = true;
    cragInst.receiveShadow = true;
    for (let i = 0; i < bucket.matrices.length; i++) {
      cragInst.setMatrixAt(i, bucket.matrices[i]);
      cragInst.setColorAt(i, bucket.colors[i]);
    }
    cragInst.instanceMatrix.needsUpdate = true;
    if (cragInst.instanceColor) cragInst.instanceColor.needsUpdate = true;
    cragInst.computeBoundingSphere();
    cellGroups[c].group.add(cragInst);
    scaledRegistry.push({ mesh: cragInst, fullCount: bucket.matrices.length, allowsShadow: true });
  }

  return {
    group,
    setNightFactor: (nightFactor: number) => {
      tracksideInfra.setNightFactor(nightFactor);
    },
    updateVisibilityWindow: (
      focusPos: THREE.Vector3,
      radiusM = 620,
      camPos?: THREE.Vector3,
      camFwd?: THREE.Vector3,
    ) => {
      tracksideInfra.updateVisibilityWindow(focusPos, camPos, camFwd);
      const maxR = radiusM + CELL_HALF_DIAG;
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
      for (let c = 0; c < cellGroups.length; c++) {
        const cell = cellGroups[c];
        const dx = cell.cx - focusPos.x;
        const dz = cell.cz - focusPos.z;
        if (dx * dx + dz * dz > maxRSq) {
          cell.group.visible = false;
          continue;
        }
        if (hasCamDir && camPos) {
          const cdx = cell.cx - camPos.x;
          const cdz = cell.cz - camPos.z;
          if (cdx * fwdX + cdz * fwdZ < -(CELL_HALF_DIAG + 14)) {
            cell.group.visible = false;
            continue;
          }
        }
        cell.group.visible = true;
      }
    },
    setGraphicsQuality: (quality: PropsQualityTier) => {
      keepRatio = quality === 'performance' ? 0.32 : quality === 'balanced' ? 0.62 : 1.0;
      const allowShadows = quality === 'ultra';
      allowTreeShadows = allowShadows;
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
