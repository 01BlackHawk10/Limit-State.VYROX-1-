import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getCircuitData, SHOULDER_WIDTH } from './Aurelia Ridge/circuitSpline';
import { ProceduralTextureSuite } from './Aurelia Ridge/proceduralTextures';
import { type WeatherUniforms } from './Aurelia Ridge/skyAndLighting';
import { groundHeightAt } from './Aurelia Ridge/terrainField';
import { worldColliders } from './Aurelia Ridge/worldColliders';
import { type PropsQualityTier } from './Aurelia Ridge/propsAndFoliageBuilder';
import { isPointInPitBounds, type MapPitBounds, type MapPitFrame } from './mapRegistry';
import {
  buildGrandstandCrowdRig,
  type CrowdTelemetryInput,
  type GrandstandCrowdRig,
} from './sharedGrandstandCrowd';
import { attachInstancedUserAsset } from '../engine/userAssetsLoader';

export type TracksideThemeId =
  | 'aurelia_ridge'
  | 'coral_bay'
  | 'frostpeak_pass'
  | 'kestrel_peaks';

export interface TracksideThemePalette {
  accentHex: number;
  structureDarkHex: number;
  structureLightHex: number;
  canopyRoofHex: number;
  seatHex: number;
  bannerEmissiveHex: number;
  nightLightHex: number;
  tirePrimaryHex: number;
  tireSecondaryHex: number;
  glassHex: number;
  glassEmissiveHex: number;
}

export function getTracksidePalette(theme: TracksideThemeId): TracksideThemePalette {
  if (theme === 'aurelia_ridge') {
    return {
      accentHex: 0xf59e0b,
      structureDarkHex: 0x1e293b,
      structureLightHex: 0xe2e8f0,
      canopyRoofHex: 0x334155,
      seatHex: 0x1e3a5f,
      bannerEmissiveHex: 0xf59e0b,
      nightLightHex: 0xffd088,
      tirePrimaryHex: 0xef4444,
      tireSecondaryHex: 0xf8fafc,
      glassHex: 0x1e293b,
      glassEmissiveHex: 0xfbbf24,
    };
  }
  if (theme === 'coral_bay') {
    return {
      accentHex: 0x06b6d4,
      structureDarkHex: 0x1e293b,
      structureLightHex: 0xe2e8f0,
      canopyRoofHex: 0xf1f5f9,
      seatHex: 0x0f766e,
      bannerEmissiveHex: 0x0ea5e9,
      nightLightHex: 0xffdf9e,
      tirePrimaryHex: 0xef4444,
      tireSecondaryHex: 0xf8fafc,
      glassHex: 0x164e63,
      glassEmissiveHex: 0x38bdf8,
    };
  }
  if (theme === 'kestrel_peaks') {
    return {
      accentHex: 0x10b981,
      structureDarkHex: 0x1a2029,
      structureLightHex: 0xd1d5db,
      canopyRoofHex: 0x26323d,
      seatHex: 0x1f3a34,
      bannerEmissiveHex: 0x34d399,
      nightLightHex: 0xffd896,
      tirePrimaryHex: 0xdc2626,
      tireSecondaryHex: 0xf8fafc,
      glassHex: 0x142824,
      glassEmissiveHex: 0x34d399,
    };
  }
  return {
    accentHex: 0xf59e0b,
    structureDarkHex: 0x1b222c,
    structureLightHex: 0xcbd5e1,
    canopyRoofHex: 0xeaf2f8,
    seatHex: 0x334155,
    bannerEmissiveHex: 0x38bdf8,
    nightLightHex: 0xffd596,
    tirePrimaryHex: 0xdc2626,
    tireSecondaryHex: 0xf1f5f9,
    glassHex: 0x261d12,
    glassEmissiveHex: 0xfbbf24,
  };
}

export interface SharedLandmarkAddonRig {
  update: (elapsedSec: number, deltaSec?: number, crowdInput?: CrowdTelemetryInput) => void;
  setNightFactor: (nightFactor: number) => void;
  setWireframe: (wire: boolean) => void;
  getGrandstandWorldPos: () => THREE.Vector3 | null;
  dispose: () => void;
}

function createJumbotronTexture(
  title: string,
  accentCss: string,
  aniso = 4,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, 512, 256);

    ctx.fillStyle = accentCss;
    ctx.fillRect(0, 0, 512, 42);
    ctx.fillStyle = '#070b12';
    ctx.font = 'bold 24px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(`FIA GT TELEMETRY // ${title.toUpperCase()}`, 18, 22);

    ctx.fillStyle = '#111827';
    ctx.fillRect(16, 56, 310, 182);
    ctx.fillRect(340, 56, 156, 182);

    const drivers = [
      ['P1', 'A. VANCE', '1:24.318'],
      ['P2', 'K. MORI', '+0.412'],
      ['P3', 'L. ROSSI', '+1.084'],
      ['P4', 'M. SOLBERG', '+1.765'],
      ['P5', 'S. KLINE', '+2.490'],
    ];
    ctx.font = 'bold 18px monospace';
    drivers.forEach(([pos, name, gap], idx) => {
      const y = 78 + idx * 32;
      ctx.fillStyle = idx === 0 ? accentCss : '#e2e8f0';
      ctx.fillText(pos, 26, y);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(name, 74, y);
      ctx.fillStyle = idx === 0 ? '#34d399' : '#94a3b8';
      ctx.fillText(gap, 214, y);
    });

    ctx.fillStyle = accentCss;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('TRACK STATUS', 354, 82);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(354, 96, 128, 30);
    ctx.fillStyle = '#052e16';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('GREEN FLAG', 366, 112);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px monospace';
    ctx.fillText('SECTOR 1 · LIVE', 354, 158);
    ctx.fillText('DRS ENABLED', 354, 186);
    ctx.fillText('PIT LANE OPEN', 354, 214);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Builds the complete FIA Grade-1 Paddock & Opposite Main Grandstand complex
 * for Coral Bay, Frostpeak Glacier, and Kestrel Peaks aligned strictly to pitBounds.frame:
 * - Modern 6-bay open dark recessed Pit Garages with roll-up shutters, interior lighting & Paddock Club VIP lounge
 * - Pit-wall strategist timing desks & debris catch fence
 * - Pit entry signal portal, chevrons & overhead pit-box beacons
 * - Race Control & Timing Pavilion
 * - 10-tier roofed Opposite Main Grandstand with steel raker trusses, LED fascia, Broadcast Jumbotron & animated crowd
 */
export function buildOrientedPitAndGrandstandAddon(
  parentGroup: THREE.Group,
  textures: ProceduralTextureSuite,
  weatherUniforms: WeatherUniforms,
  pitBounds: MapPitBounds,
  pitFrame: MapPitFrame,
  waterLevel: number,
  theme: TracksideThemeId,
): SharedLandmarkAddonRig {
  const palette = getTracksidePalette(theme);
  const circuit = getCircuitData();
  const pitY = pitBounds.y;
  const pitYaw = Math.atan2(-pitFrame.tanZ, pitFrame.tanX);

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const disposableTex: THREE.Texture[] = [];
  const wireMats: THREE.MeshStandardMaterial[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T, wireCapable = true): T => {
    disposableMats.push(m);
    if (wireCapable && 'wireframe' in m) {
      wireMats.push(m as unknown as THREE.MeshStandardMaterial);
    }
    return m;
  };

  const pitLocalToWorld = (lx: number, lz: number): [number, number] => [
    pitFrame.centerX + lx * pitFrame.tanX + lz * pitFrame.rightX,
    pitFrame.centerZ + lx * pitFrame.tanZ + lz * pitFrame.rightZ,
  ];

  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.concreteNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      color: theme === 'coral_bay' ? 0xf1f5f9 : 0xdbe4ee,
      roughness: 0.82,
      metalness: 0.04,
    }),
  );
  const pitApronMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.concreteNormal,
      color: 0x383f49,
      roughness: 0.86,
      metalness: 0.06,
    }),
  );
  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.structureDarkHex,
      roughness: 0.38,
      metalness: 0.76,
    }),
  );
  const brushedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.structureLightHex,
      roughness: 0.28,
      metalness: 0.85,
    }),
  );
  const shutterMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.45,
      metalness: 0.72,
    }),
  );
  const darkInteriorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0c1017,
      roughness: 0.9,
      metalness: 0.1,
    }),
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.accentHex,
      emissive: palette.bannerEmissiveHex,
      emissiveIntensity: 0.14,
      roughness: 0.34,
      metalness: 0.28,
    }),
  );
  const canopyRoofMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.canopyRoofHex,
      roughness: 0.62,
      metalness: 0.14,
    }),
  );
  const seatMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.seatHex,
      roughness: 0.68,
      metalness: 0.1,
    }),
  );
  const stairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.84,
      metalness: 0.08,
    }),
  );
  const glassDeckMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: palette.glassHex,
      emissive: palette.glassEmissiveHex,
      emissiveIntensity: 0.16,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
    }),
  );
  const garageLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xe0f2fe,
      emissiveIntensity: 0.95,
      roughness: 0.2,
    }),
  );
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: theme === 'coral_bay' ? 0x38bdf8 : theme === 'kestrel_peaks' ? 0x10b981 : 0xf59e0b,
      emissive: theme === 'coral_bay' ? 0x0ea5e9 : theme === 'kestrel_peaks' ? 0x059669 : 0xd97706,
      emissiveIntensity: 1.45,
      roughness: 0.22,
    }),
  );
  const amberSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    }),
  );

  // Oriented Pit + Opposite Grandstand Container
  const pitAddon = new THREE.Group();
  pitAddon.name = 'OrientedFIAPitAndGrandstand';
  pitAddon.position.set(pitFrame.centerX, pitY, pitFrame.centerZ);
  pitAddon.rotation.y = pitYaw;
  parentGroup.add(pitAddon);

  // ---------------------------------------------------------------------------
  // A. PIT LANE APRON, CONCRETE PIT WALL & CATCH FENCE + STRATEGIST DESKS
  // ---------------------------------------------------------------------------
  const apronMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(148, 0.22, 22.0)),
    pitApronMat,
  );
  apronMesh.position.set(0, -0.06, -2.0);
  apronMesh.receiveShadow = true;
  pitAddon.add(apronMesh);

  // Solid Concrete Pit Wall separating track from pit lane (local z = +9.2)
  const pitWallMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(126, 1.08, 0.56)),
    concreteMat,
  );
  pitWallMesh.position.set(0, 0.54, 9.2);
  pitWallMesh.castShadow = true;
  pitWallMesh.receiveShadow = true;
  pitAddon.add(pitWallMesh);

  // Pit-wall debris catch fence stanchions & cables on top of pit wall
  const fenceParts: THREE.BufferGeometry[] = [];
  for (let px = -60; px <= 60; px += 6) {
    const post = new THREE.BoxGeometry(0.11, 2.25, 0.13);
    post.translate(px, 2.15, 9.2);
    fenceParts.push(post);
  }
  for (const cy of [1.85, 2.35, 2.85]) {
    const cable = new THREE.BoxGeometry(122, 0.045, 0.045);
    cable.translate(0, cy, 9.2);
    fenceParts.push(cable);
  }
  const mergedFence = trackGeo(BufferGeometryUtils.mergeGeometries(fenceParts, false));
  fenceParts.forEach((g) => g.dispose());
  const fenceMesh = new THREE.Mesh(mergedFence, brushedSteelMat);
  fenceMesh.castShadow = true;
  pitAddon.add(fenceMesh);

  // 6 Pit-Wall Strategist Timing Consoles (standing shelters inside pit wall z = +7.8)
  const consoleParts: THREE.BufferGeometry[] = [];
  const screenParts: THREE.BufferGeometry[] = [];
  const boxCenters = [-50, -30, -10, 10, 30, 50];
  for (const bx of boxCenters) {
    const desk = new THREE.BoxGeometry(3.8, 1.05, 1.15);
    desk.translate(bx, 0.52, 7.65);
    consoleParts.push(desk);
    const canopy = new THREE.BoxGeometry(4.4, 0.16, 1.85);
    canopy.translate(bx, 2.45, 7.7);
    consoleParts.push(canopy);
    for (const px of [-1.85, 1.85]) {
      const col = new THREE.BoxGeometry(0.12, 2.45, 0.14);
      col.translate(bx + px, 1.22, 8.2);
      consoleParts.push(col);
    }
    const screen = new THREE.BoxGeometry(3.1, 0.42, 0.08);
    screen.rotateX(-0.35);
    screen.translate(bx, 1.28, 7.52);
    screenParts.push(screen);
  }
  const mergedConsoles = trackGeo(BufferGeometryUtils.mergeGeometries(consoleParts, false));
  consoleParts.forEach((g) => g.dispose());
  const consolesMesh = new THREE.Mesh(mergedConsoles, darkSteelMat);
  consolesMesh.castShadow = true;
  consolesMesh.receiveShadow = true;
  pitAddon.add(consolesMesh);

  const mergedScreens = trackGeo(BufferGeometryUtils.mergeGeometries(screenParts, false));
  screenParts.forEach((g) => g.dispose());
  const screensMesh = new THREE.Mesh(mergedScreens, beaconMat);
  pitAddon.add(screensMesh);

  // Pit Entry Signal Portal (local x = -92) + Approach Chevrons
  const portalLegGeo = trackGeo(new THREE.BoxGeometry(0.42, 5.2, 0.42));
  const portalLegL = new THREE.Mesh(portalLegGeo, darkSteelMat);
  portalLegL.position.set(-92, 2.6, -7.2);
  const portalLegR = new THREE.Mesh(portalLegGeo, darkSteelMat);
  portalLegR.position.set(-92, 2.6, 7.6);
  const portalBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.54, 0.85, 15.6)), darkSteelMat);
  portalBeam.position.set(-92, 5.1, 0.2);
  const portalSign = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.62, 0.48, 5.2)), amberSignMat);
  portalSign.position.set(-92, 5.1, 0.2);
  pitAddon.add(portalLegL, portalLegR, portalBeam, portalSign);

  const chevGeo = trackGeo(new THREE.PlaneGeometry(3.0, 0.34));
  chevGeo.rotateX(-Math.PI / 2);
  for (let c = 0; c < 4; c++) {
    const chev = new THREE.Mesh(chevGeo, amberSignMat);
    chev.rotation.z = -0.32;
    chev.position.set(-110 + c * 5.8, 0.06, 6.2 - c * 0.9);
    pitAddon.add(chev);
  }

  // ---------------------------------------------------------------------------
  // B. MODERN FIA 6-BAY PIT GARAGES + PADDOCK CLUB VIP HOSPITALITY BUILDING
  // ---------------------------------------------------------------------------
  const garageLen = 124;
  const garageDepth = 13.5;
  const garageCenterZ = -17.2;

  // Deep concrete foundation plinth so no garage corner ever floats on uneven edges
  const garPlinth = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garageLen + 4, 14.0, garageDepth + 3)),
    concreteMat,
  );
  garPlinth.position.set(0, -7.0, garageCenterZ);
  garPlinth.receiveShadow = true;
  pitAddon.add(garPlinth);

  // Dark recessed rear garage interior shell (leaves front face open at local z = -10.5)
  const garRearWall = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garageLen, 4.4, 1.2)),
    darkInteriorMat,
  );
  garRearWall.position.set(0, 2.2, garageCenterZ - garageDepth * 0.5 + 0.6);
  garRearWall.receiveShadow = true;
  pitAddon.add(garRearWall);

  const garInteriorFloor = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garageLen - 0.5, 0.12, garageDepth - 1.0)),
    darkSteelMat,
  );
  garInteriorFloor.position.set(0, 0.06, garageCenterZ);
  garInteriorFloor.receiveShadow = true;
  pitAddon.add(garInteriorFloor);

  // End side walls + 7 structural steel portal bays dividing the 6 open pit garages
  const bayParts: THREE.BufferGeometry[] = [];
  const shutterParts: THREE.BufferGeometry[] = [];
  const bayLedParts: THREE.BufferGeometry[] = [];
  const baySignParts: THREE.BufferGeometry[] = [];

  for (let b = 0; b <= 6; b++) {
    const colX = -60 + b * 20;
    const isEnd = b === 0 || b === 6;
    const dividerWall = new THREE.BoxGeometry(isEnd ? 1.0 : 0.72, 4.45, garageDepth - 0.4);
    dividerWall.translate(colX, 2.22, garageCenterZ);
    bayParts.push(dividerWall);

    const frontPier = new THREE.BoxGeometry(1.15, 4.6, 1.1);
    frontPier.translate(colX, 2.3, garageCenterZ + garageDepth * 0.5 - 0.45);
    bayParts.push(frontPier);

    if (b < 6) {
      const bayMidX = colX + 10;
      // Partially raised corrugated roll-up shutter lintel at garage mouth
      const shutter = new THREE.BoxGeometry(18.2, 1.15, 0.36);
      shutter.translate(bayMidX, 3.85, garageCenterZ + garageDepth * 0.5 - 0.35);
      shutterParts.push(shutter);

      // Interior rear tool workbench inside bay
      const bench = new THREE.BoxGeometry(8.5, 1.05, 1.4);
      bench.translate(bayMidX, 0.52, garageCenterZ - garageDepth * 0.5 + 2.2);
      shutterParts.push(bench);

      // Crisp illuminated overhead bay light strip inside ceiling + pit-boom beacon outside
      const innerLed = new THREE.BoxGeometry(12.0, 0.14, 0.55);
      innerLed.translate(bayMidX, 4.22, garageCenterZ + 1.2);
      bayLedParts.push(innerLed);

      const outerBeacon = new THREE.BoxGeometry(4.2, 0.18, 0.28);
      outerBeacon.translate(bayMidX, 4.5, -6.2);
      baySignParts.push(outerBeacon);
    }
  }

  const mergedBays = trackGeo(BufferGeometryUtils.mergeGeometries(bayParts, false));
  bayParts.forEach((g) => g.dispose());
  const baysMesh = new THREE.Mesh(mergedBays, concreteMat);
  baysMesh.castShadow = true;
  baysMesh.receiveShadow = true;
  pitAddon.add(baysMesh);

  const mergedShutters = trackGeo(BufferGeometryUtils.mergeGeometries(shutterParts, false));
  shutterParts.forEach((g) => g.dispose());
  const shuttersMesh = new THREE.Mesh(mergedShutters, shutterMat);
  shuttersMesh.castShadow = true;
  pitAddon.add(shuttersMesh);

  const mergedBayLeds = trackGeo(BufferGeometryUtils.mergeGeometries(bayLedParts, false));
  bayLedParts.forEach((g) => g.dispose());
  pitAddon.add(new THREE.Mesh(mergedBayLeds, garageLedMat));

  const mergedBaySigns = trackGeo(BufferGeometryUtils.mergeGeometries(baySignParts, false));
  baySignParts.forEach((g) => g.dispose());
  pitAddon.add(new THREE.Mesh(mergedBaySigns, beaconMat));

  // Cantilevered Pit Lane Canopy Overhang + 2nd Floor Glazed Paddock Club VIP Suite
  const slabMid = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garageLen + 3, 0.65, garageDepth + 5.2)),
    darkSteelMat,
  );
  slabMid.position.set(0, 4.55, garageCenterZ + 2.1);
  slabMid.castShadow = true;
  pitAddon.add(slabMid);

  const vipCore = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garageLen - 6, 3.6, garageDepth - 2.6)),
    glassDeckMat,
  );
  vipCore.position.set(0, 6.65, garageCenterZ - 0.6);
  pitAddon.add(vipCore);

  // Glass VIP terrace railing overlooking pit lane
  const vipBalconyRail = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garageLen + 2, 1.05, 0.14)),
    glassDeckMat,
  );
  vipBalconyRail.position.set(0, 5.38, garageCenterZ + garageDepth * 0.5 + 4.4);
  pitAddon.add(vipBalconyRail);

  // Upper structural steel roof canopy + signature glowing accent fascia
  const garRoof = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garageLen + 5, 0.55, garageDepth + 6.4)),
    canopyRoofMat,
  );
  garRoof.position.set(0, 8.75, garageCenterZ + 2.4);
  garRoof.castShadow = true;
  pitAddon.add(garRoof);

  const garFascia = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garageLen + 5.2, 0.36, 0.32)),
    accentMat,
  );
  garFascia.position.set(0, 8.65, garageCenterZ + garageDepth * 0.5 + 5.55);
  pitAddon.add(garFascia);

  const [garWx, garWz] = pitLocalToWorld(0, garageCenterZ);
  worldColliders.addObb(
    garWx,
    garWz,
    garageLen * 0.5 + 1.0,
    garageDepth * 0.5 + 1.0,
    pitFrame.tanX,
    pitFrame.tanZ,
    'concrete',
    pitY - 4,
    pitY + 11,
  );

  // ---------------------------------------------------------------------------
  // C. RACE CONTROL & TIMING PAVILION ON ENTRY FLANK (local x = -78, z = -16.5)
  // ---------------------------------------------------------------------------
  const rcGroup = new THREE.Group();
  rcGroup.name = 'RaceControlPavilion';
  const rcLocalX = -78;
  const rcLocalZ = -16.5;
  rcGroup.position.set(rcLocalX, 0, rcLocalZ);

  const rcPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.5, 16.0, 15.5)), concreteMat);
  rcPlinth.position.set(0, -4.6, 0);
  rcPlinth.castShadow = true;
  rcPlinth.receiveShadow = true;
  rcGroup.add(rcPlinth);

  const rcDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.6, 0.55, 17.0)), darkSteelMat);
  rcDeck.position.set(0, 3.55, 0.5);
  rcDeck.castShadow = true;
  rcGroup.add(rcDeck);

  const rcGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.0, 3.8, 15.2)), glassDeckMat);
  rcGlass.position.set(0, 5.7, 0.5);
  rcGroup.add(rcGlass);

  const rcRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.6, 0.52, 18.4)), brushedSteelMat);
  rcRoof.position.set(0, 7.85, 0.8);
  rcRoof.castShadow = true;
  rcGroup.add(rcRoof);

  const rcTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.7, 0.24, 18.5)), accentMat);
  rcTrim.position.set(0, 7.52, 0.8);
  rcGroup.add(rcTrim);

  const rcMast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.18, 5.2, 8)), brushedSteelMat);
  rcMast.position.set(-2.2, 10.4, -3.2);
  rcMast.castShadow = true;
  rcGroup.add(rcMast);

  const rcDish = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.85, 0.35, 0.5, 10)), accentMat);
  rcDish.rotation.x = 0.65;
  rcDish.position.set(2.4, 9.6, -3.0);
  rcGroup.add(rcDish);

  pitAddon.add(rcGroup);
  const [rcWx, rcWz] = pitLocalToWorld(rcLocalX, rcLocalZ);
  worldColliders.addObb(
    rcWx,
    rcWz,
    6.4,
    8.5,
    pitFrame.tanX,
    pitFrame.tanZ,
    'concrete',
    pitY - 6,
    pitY + 12,
  );

  // ---------------------------------------------------------------------------
  // D. GUARANTEED 10-TIER ROOFED OPPOSITE MAIN GRANDSTAND + BROADCAST JUMBOTRON
  // ---------------------------------------------------------------------------
  const nightLights: THREE.PointLight[] = [];
  let chosenGsLocalX = 8;
  let chosenGsLocalZ = 47.0;
  let chosenGsGroundY = pitY;
  let foundGs = false;

  const gsLen = 96;
  const gsDepth = 22;
  const tierCount = 10;
  const stepH = 0.62;
  const stepD = 1.9;

  for (const candZ of [46.5, 44.0, 49.5, 52.0]) {
    for (const candX of [6, 22, -14, 34, -28]) {
      const [wx, wz] = pitLocalToWorld(candX, candZ);
      const q = circuit.queryNearest(wx, wz);
      if (q.absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + gsDepth * 0.5 + 2.4) continue;
      let ok = true;
      let minCornerH = Infinity;
      for (const cxOff of [-gsLen * 0.44, gsLen * 0.44]) {
        for (const czOff of [-gsDepth * 0.44, gsDepth * 0.44]) {
          const [cwx, cwz] = pitLocalToWorld(candX + cxOff, candZ + czOff);
          const ch = groundHeightAt(cwx, cwz);
          if (ch < waterLevel - 1.5) {
            ok = false;
            break;
          }
          if (ch < minCornerH) minCornerH = ch;
          const cq = circuit.queryNearest(cwx, cwz);
          if (cq.absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 2.0) {
            ok = false;
            break;
          }
          if (isPointInPitBounds(pitBounds, cwx, ch, cwz, 6, 6)) {
            ok = false;
            break;
          }
        }
        if (!ok) break;
      }
      if (ok) {
        chosenGsLocalX = candX;
        chosenGsLocalZ = candZ;
        chosenGsGroundY = Math.min(pitY, minCornerH);
        foundGs = true;
        break;
      }
    }
    if (foundGs) break;
  }

  // Fallback directly opposite pit apron if needed (terrainField grades opposite pad!)
  if (!foundGs) {
    const [wx, wz] = pitLocalToWorld(6, 46.5);
    chosenGsLocalX = 6;
    chosenGsLocalZ = 46.5;
    chosenGsGroundY = Math.min(pitY, groundHeightAt(wx, wz));
  }

  let crowdRig: GrandstandCrowdRig | null = null;
  let gsWorldPos: THREE.Vector3 | null = null;

  {
    const gsGroup = new THREE.Group();
    gsGroup.name = 'OppositeCoveredMainGrandstand';
    const podiumTopY = pitY + 0.35;
    const plinthBottom = Math.min(chosenGsGroundY, pitY) - 14.0;
    const plinthH = Math.max(15.0, podiumTopY - plinthBottom);

    gsGroup.position.set(chosenGsLocalX, podiumTopY - pitY, chosenGsLocalZ);

    // Deep concrete foundation plinth reaching well underground
    const gsPodium = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(gsLen + 4, plinthH, gsDepth + 4)),
      concreteMat,
    );
    gsPodium.position.set(0, -plinthH * 0.5, 0);
    gsPodium.castShadow = true;
    gsPodium.receiveShadow = true;
    gsGroup.add(gsPodium);

    // 10 Stepped concrete + stadium seating tiers
    const tierGeos: THREE.BufferGeometry[] = [];
    const stairGeos: THREE.BufferGeometry[] = [];
    for (let sIdx = 0; sIdx < tierCount; sIdx++) {
      const tz = -gsDepth * 0.5 + 1.6 + sIdx * stepD;
      const ty = 0.4 + sIdx * stepH;
      const stepGeo = new THREE.BoxGeometry(gsLen - 2, stepH + sIdx * 0.08, stepD + 0.08);
      stepGeo.translate(0, ty, tz);
      tierGeos.push(stepGeo);

      // Contrasting concrete access staircase steps at +/- 18m & +/- 38m
      for (const sx of [-38, -18, 18, 38]) {
        const st = new THREE.BoxGeometry(1.75, stepH + 0.06, stepD + 0.14);
        st.translate(sx, ty + 0.04, tz);
        stairGeos.push(st);
      }
    }
    const mergedTiers = trackGeo(BufferGeometryUtils.mergeGeometries(tierGeos, false));
    tierGeos.forEach((g) => g.dispose());
    const tiersMesh = new THREE.Mesh(mergedTiers, seatMat);
    tiersMesh.castShadow = true;
    tiersMesh.receiveShadow = true;
    gsGroup.add(tiersMesh);

    const mergedStairs = trackGeo(BufferGeometryUtils.mergeGeometries(stairGeos, false));
    stairGeos.forEach((g) => g.dispose());
    const stairsMesh = new THREE.Mesh(mergedStairs, stairMat);
    stairsMesh.receiveShadow = true;
    gsGroup.add(stairsMesh);

    const gsBackWall = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(gsLen + 1, 10.6, 1.2)),
      concreteMat,
    );
    gsBackWall.position.set(0, 5.3, gsDepth * 0.5 - 0.55);
    gsBackWall.castShadow = true;
    gsGroup.add(gsBackWall);

    // Structural steel raker trusses + cantilevered roof support columns
    const gsColGeos: THREE.BufferGeometry[] = [];
    for (let colX = -gsLen * 0.46; colX <= gsLen * 0.46 + 0.1; colX += gsLen * 0.115) {
      const post = new THREE.BoxGeometry(0.66, 12.4, 0.85);
      post.translate(colX, 6.2, gsDepth * 0.5 - 1.15);
      gsColGeos.push(post);

      const truss = new THREE.BoxGeometry(0.46, 0.78, gsDepth + 4.8);
      truss.rotateX(-0.085);
      truss.translate(colX, 11.75, -1.3);
      gsColGeos.push(truss);
    }
    const mergedCols = trackGeo(BufferGeometryUtils.mergeGeometries(gsColGeos, false));
    gsColGeos.forEach((g) => g.dispose());
    const colsMesh = new THREE.Mesh(mergedCols, darkSteelMat);
    colsMesh.castShadow = true;
    gsGroup.add(colsMesh);

    const gsCanopy = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(gsLen + 5, 0.46, gsDepth + 5.6)),
      canopyRoofMat,
    );
    gsCanopy.rotation.x = -0.085;
    gsCanopy.position.set(0, 12.35, -1.3);
    gsCanopy.castShadow = true;
    gsGroup.add(gsCanopy);

    const gsFascia = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(gsLen + 5.2, 0.42, 0.36)),
      accentMat,
    );
    gsFascia.position.set(0, 11.2, -gsDepth * 0.5 - 3.9);
    gsGroup.add(gsFascia);

    // Glass front safety balustrade facing the straight
    const gsFrontRail = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(gsLen - 2, 1.1, 0.14)),
      glassDeckMat,
    );
    gsFrontRail.position.set(0, 0.6, -gsDepth * 0.5 + 0.75);
    gsGroup.add(gsFrontRail);

    // Trackside Elevated Broadcast Jumbotron Tower flanking West wing of Opposite Grandstand
    const accentHexStr = '#' + palette.accentHex.toString(16).padStart(6, '0');
    const titleLabel =
      theme === 'coral_bay'
        ? 'CORAL BAY'
        : theme === 'frostpeak_pass'
        ? 'FROSTPEAK'
        : theme === 'kestrel_peaks'
        ? 'KESTREL PEAKS'
        : 'AURELIA RIDGE';
    const jumboTex = createJumbotronTexture(
      titleLabel,
      accentHexStr,
      Math.min(8, textures.gantryBannerAlbedo.anisotropy || 4),
    );
    disposableTex.push(jumboTex);
    const jumboMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: jumboTex,
        emissive: 0xffffff,
        emissiveMap: jumboTex,
        emissiveIntensity: 0.72,
        roughness: 0.25,
      }),
    );

    const jumboTower = new THREE.Group();
    jumboTower.position.set(-gsLen * 0.5 - 11.5, 0, -2.5);
    const jPylon = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(1.4, 15.0, 1.4)),
      darkSteelMat,
    );
    jPylon.position.y = 4.0;
    jPylon.castShadow = true;
    const jBezel = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(15.6, 8.2, 0.9)),
      darkSteelMat,
    );
    jBezel.position.y = 11.5;
    jBezel.castShadow = true;
    const jFace = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(14.6, 7.3)),
      jumboMat,
    );
    jFace.position.set(0, 11.5, -0.48);
    jFace.rotation.y = Math.PI; // Faces -Z toward track & pit lane!
    jumboTower.add(jPylon, jBezel, jFace);
    gsGroup.add(jumboTower);

    for (const lx of [-28, 0, 28]) {
      const gsLight = new THREE.PointLight(palette.nightLightHex, 0, 76, 1.45);
      gsLight.position.set(lx, 10.6, -2.4);
      gsLight.visible = false;
      gsGroup.add(gsLight);
      nightLights.push(gsLight);
    }

    crowdRig = buildGrandstandCrowdRig(
      {
        parentGroup: gsGroup,
        centerX: 0,
        baseY: 0.58,
        centerZ: 0,
        lengthX: gsLen,
        depthZ: gsDepth,
        tierCount,
        stepHeight: stepH,
        stepDepth: stepD,
        frontTierOffsetZ: 1.6,
        accentHex: palette.accentHex,
        secondaryHex: palette.structureDarkHex,
      },
      undefined,
      weatherUniforms,
    );

    pitAddon.add(gsGroup);
    const [gsWx, gsWz] = pitLocalToWorld(chosenGsLocalX, chosenGsLocalZ);
    gsWorldPos = new THREE.Vector3(gsWx, podiumTopY, gsWz);
    worldColliders.addObb(
      gsWx,
      gsWz,
      gsLen * 0.5 + 1.5,
      gsDepth * 0.5 + 1.5,
      pitFrame.tanX,
      pitFrame.tanZ,
      'concrete',
      plinthBottom,
      podiumTopY + 14,
    );
  }

  for (const lx of [-46, 0, 46]) {
    const pLight = new THREE.PointLight(palette.nightLightHex, 0, 56, 1.5);
    pLight.position.set(lx, 4.4, -6.0);
    pLight.visible = false;
    pitAddon.add(pLight);
    nightLights.push(pLight);
  }

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
    update: (elapsedSec: number, deltaSec = 0.016, crowdInput?: CrowdTelemetryInput) => {
      if (crowdRig) {
        crowdRig.update(deltaSec, elapsedSec, crowdInput ?? defaultCrowdInput);
      }
    },
    setNightFactor: (nightFactor: number) => {
      glassDeckMat.emissiveIntensity = 0.16 + nightFactor * 1.35;
      beaconMat.emissiveIntensity = 0.45 + nightFactor * 1.9;
      amberSignMat.emissiveIntensity = 0.4 + nightFactor * 1.7;
      garageLedMat.emissiveIntensity = 0.95 + nightFactor * 1.6;
      const showPl = nightFactor > 0.01;
      for (const pl of nightLights) {
        pl.intensity = nightFactor * 4.2;
        pl.visible = showPl;
      }
    },
    setWireframe: (wire: boolean) => {
      for (const m of wireMats) {
        m.wireframe = wire;
      }
      crowdRig?.setWireframe(wire);
    },
    getGrandstandWorldPos: () => gsWorldPos,
    dispose: () => {
      crowdRig?.dispose();
      for (const t of disposableTex) t.dispose();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}

export interface SharedTracksidePropsRig {
  setNightFactor: (nightFactor: number) => void;
  updateVisibilityWindow: (
    focusPos: THREE.Vector3,
    camPos?: THREE.Vector3,
    camFwd?: THREE.Vector3,
  ) => void;
  setGraphicsQuality: (quality: PropsQualityTier) => void;
  dispose: () => void;
}

/**
 * Builds Full FIA Broadcast Trackside Infrastructure for any closed spline circuit:
 * - Composite Start/Finish Timing Gantry with 5-pod lights & concrete footings
 * - 5 Corner Marshal Observation Towers with GPU global-wind cloth flags
 * - High-Curvature Tire Barrier Stacks on sharp corner outsides
 * - Pooled 150m / 100m / 50m Braking Distance Boards (2 major braking zones = 6 boards)
 * - Pooled Apex Chevron Arrow Signs & Speed-Trap Radar Arches
 * - Dense Instanced Roadside Streetlamps & 5 Corner Night Floodlight Towers
 */
export function buildSharedTracksideInfra(
  group: THREE.Group,
  textures: ProceduralTextureSuite,
  weatherUniforms: WeatherUniforms,
  theme: TracksideThemeId,
  waterLevel: number,
): SharedTracksidePropsRig {
  const palette = getTracksidePalette(theme);
  const circuit = getCircuitData();
  const samples = circuit.samples;
  const N = samples.length;
  const roadHalf = circuit.roadHalfWidth;
  const sfIdx = circuit.startFinishIndex;
  const sfSample = samples[sfIdx];

  // Snow-shed index range on kestrel_peaks so poles/signs never sit inside the gallery roof
  let shedStartIdx = -1;
  let shedEndIdx = -1;
  if (theme === 'kestrel_peaks') {
    let idx17 = 0;
    let d17 = Infinity;
    let idx18 = 0;
    let d18 = Infinity;
    for (let i = 0; i < N; i++) {
      const p = samples[i].position;
      const a = Math.hypot(p.x - 430, p.z + 685);
      if (a < d17) {
        d17 = a;
        idx17 = i;
      }
      const b = Math.hypot(p.x - 165, p.z + 490);
      if (b < d18) {
        d18 = b;
        idx18 = i;
      }
    }
    const span = Math.max(10, idx18 - idx17);
    shedStartIdx = Math.round(idx17 + span * 0.16);
    shedEndIdx = Math.round(idx17 + span * 0.56);
  }

  const tunnelSamplesList = samples.filter((s) => s.isTunnel);
  const isIndexNearTunnelOrShed = (idx: number, pad = 6): boolean => {
    if (shedStartIdx >= 0 && idx >= shedStartIdx - pad && idx <= shedEndIdx + pad) return true;
    for (let k = -pad; k <= pad; k++) {
      const ni = circuit.closedLoop ? (idx + k + N) % N : Math.max(0, Math.min(N - 1, idx + k));
      if (samples[ni].isTunnel) return true;
    }
    return false;
  };
  const isSpotBlockedByTrackOrTunnel = (
    wx: number,
    wz: number,
    originIdx: number,
    extraClear: number,
    minGapIdx = 16,
  ): boolean => {
    const clearDistSq = (roadHalf + SHOULDER_WIDTH + extraClear) ** 2;
    for (let j = 0; j < N; j += 2) {
      const idxDiff = Math.abs(j - originIdx);
      const wrapDiff = circuit.closedLoop ? Math.min(idxDiff, N - idxDiff) : idxDiff;
      if (wrapDiff <= minGapIdx) continue;
      const o = samples[j];
      const dx = wx - o.position.x;
      const dz = wz - o.position.z;
      if (dx * dx + dz * dz < clearDistSq) return true;
    }
    const tunClearSq = (roadHalf + SHOULDER_WIDTH + extraClear + 3.5) ** 2;
    for (let t = 0; t < tunnelSamplesList.length; t++) {
      const ts = tunnelSamplesList[t];
      const dx = wx - ts.position.x;
      const dz = wz - ts.position.z;
      if (dx * dx + dz * dz < tunClearSq) return true;
    }
    return false;
  };

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const cleanupCallbacks: Array<() => void> = [];
  const glbBarrierRegistry: Array<{
    mesh: THREE.InstancedMesh;
    fullCount: number;
    allowsShadow: boolean;
    scaleByQuality?: boolean;
  }> = [];
  let isDisposed = false;
  let currentQuality: PropsQualityTier = 'balanced';
  const getBarrierQualityState = () => ({
    keepRatio: currentQuality === 'performance' ? 0.6 : currentQuality === 'balanced' ? 0.85 : 1.0,
    foliageDensityScale: 1.0,
    allowShadows: currentQuality !== 'performance',
  });
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
      color: palette.structureDarkHex,
      roughness: 0.42,
      metalness: 0.58,
    }),
  );
  const brushedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.structureLightHex,
      roughness: 0.28,
      metalness: 0.86,
      envMapIntensity: 1.25,
    }),
  );
  const concreteFootMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.concreteNormal,
      roughness: 0.85,
      metalness: 0.04,
    }),
  );
  const accentTrimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.accentHex,
      roughness: 0.35,
      metalness: 0.25,
    }),
  );
  const glassDeckMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: palette.glassHex,
      emissive: palette.glassEmissiveHex,
      emissiveIntensity: 0.08,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
    }),
  );

  // ---------------------------------------------------------------------------
  // 1. COMPOSITE START / FINISH TIMING GANTRY (Truss + 5-Pod Start Lights + Footings)
  // ---------------------------------------------------------------------------
  const sfBasis = new THREE.Matrix4().makeBasis(
    sfSample.right,
    sfSample.up,
    sfSample.tangent.clone().negate(),
  );
  const gantry = new THREE.Group();
  gantry.name = 'CompositeStartFinishGantry';
  const spanW = roadHalf * 2 + 4.8;
  const gantryH = 8.7;

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

    const trim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.18, gantryH * 0.85, 0.84)), accentTrimMat);
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

  const topBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(spanW + 0.9, 0.48, 0.96)), brushedSteelMat);
  topBeam.position.set(0, gantryH + 0.65, 0);
  topBeam.castShadow = true;
  gantry.add(topBeam);

  const bannerBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(spanW - 1.2, 2.2, 0.56)), darkCarbonMat);
  bannerBox.position.set(0, gantryH - 0.55, 0);
  bannerBox.castShadow = true;
  gantry.add(bannerBox);

  const bannerFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.gantryBannerAlbedo,
      emissiveMap: textures.gantryBannerAlbedo,
      emissive: palette.bannerEmissiveHex,
      emissiveIntensity: 0.16,
      roughness: 0.42,
      metalness: 0.1,
    }),
  );
  const bannerFront = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(spanW - 1.6, 1.95)), bannerFaceMat);
  bannerFront.position.set(0, gantryH - 0.55, 0.3);
  gantry.add(bannerFront);
  const bannerBack = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(spanW - 1.6, 1.95)), bannerFaceMat);
  bannerBack.position.set(0, gantryH - 0.55, -0.3);
  bannerBack.rotation.y = Math.PI;
  gantry.add(bannerBack);

  const podBezelGeo = trackGeo(new THREE.BoxGeometry(0.65, 0.95, 0.28));
  const podLensGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14));
  podLensGeo.rotateX(Math.PI / 2);
  const podLensMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b1212,
      emissive: 0xb91c1c,
      emissiveIntensity: 0.12,
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

  const gantryNightLight = new THREE.PointLight(palette.nightLightHex, 0, 74, 1.5);
  gantryNightLight.position.set(0, gantryH - 0.8, 0);
  gantryNightLight.visible = false;
  gantry.add(gantryNightLight);

  gantry.position.copy(sfSample.position);
  gantry.quaternion.setFromRotationMatrix(sfBasis);
  group.add(gantry);

  // ---------------------------------------------------------------------------
  // 2. CORNER MARSHAL TOWERS + GPU GLOBAL-WIND PBR CLOTH FLAGS (5 Corners)
  // ---------------------------------------------------------------------------
  const flagMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
  );
  flagMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = weatherUniforms.uTime;
    shader.uniforms.uWetness = weatherUniforms.uWetness;
    shader.uniforms.uWindSpeed = weatherUniforms.uWindSpeed;
    shader.uniforms.uWindDir = weatherUniforms.uWindDir;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWindSpeed;
        uniform vec2 uWindDir;
        varying vec2 vFlagUv;
        varying float vFlagFold;

        vec3 evalClothDisp(vec3 p, vec2 fUv, vec3 localWind) {
          float pin = smoothstep(0.0, 0.92, fUv.x);
          float speed = clamp(uWindSpeed, 0.25, 3.2);
          float freqT = 3.8 + speed * 3.1;
          float waveA = sin(fUv.x * 8.2 - uTime * freqT + fUv.y * 2.1);
          float waveB = cos(fUv.x * 14.5 - uTime * (freqT * 1.45) - fUv.y * 3.4);
          float tipWhip = sin(fUv.x * 21.0 - uTime * (freqT * 2.05)) * smoothstep(0.55, 1.0, fUv.x);
          vec3 windPerp = normalize(vec3(-localWind.z, 0.0, localWind.x) + vec3(0.0001, 0.0, 0.0001));
          float amp = (0.14 + speed * 0.14) * pin;
          float gravityDroop = (1.0 - smoothstep(0.35, 2.1, speed)) * 0.34 * pow(max(fUv.x, 1e-4), 1.35);
          vec3 disp = vec3(0.0);
          disp += localWind * (fUv.x * 0.28 * speed);
          disp += windPerp * ((waveA * 0.65 + waveB * 0.35 + tipWhip * 0.22) * amp);
          disp.y += (cos(fUv.x * 6.0 - uTime * (freqT * 0.85)) * 0.075 * speed * pin) - gravityDroop;
          return disp;
        }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        vec2 fUv = vec2(clamp(position.x / 1.9, 0.0, 1.0), clamp((position.y + 0.51) / 1.02, 0.0, 1.0));
        vFlagUv = fUv;
        vec3 wDirLocal = normalize((transpose(mat3(modelMatrix)) * vec3(uWindDir.x, 0.0, uWindDir.y)) + vec3(0.0001, 0.0, 0.0001));
        vec3 dC = evalClothDisp(position, fUv, wDirLocal);
        vec3 dX = evalClothDisp(position + vec3(0.06, 0.0, 0.0), fUv + vec2(0.032, 0.0), wDirLocal);
        vec3 dY = evalClothDisp(position + vec3(0.0, 0.06, 0.0), fUv + vec2(0.0, 0.055), wDirLocal);
        vec3 tangX = normalize(vec3(0.06, 0.0, 0.0) + (dX - dC));
        vec3 tangY = normalize(vec3(0.0, 0.06, 0.0) + (dY - dC));
        objectNormal = normalize(cross(tangX, tangY));
        vFlagFold = clamp((dX.z - dC.z) * 4.5, -1.0, 1.0);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed += dC;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWetness;
        varying vec2 vFlagUv;
        varying float vFlagFold;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 cSignalOrange = vec3(0.95, 0.36, 0.07);
        vec3 cMarshalGold = vec3(0.96, 0.72, 0.12);
        vec3 cCanvasWhite = vec3(0.92, 0.91, 0.88);
        vec3 cHoistCanvas = vec3(0.86, 0.84, 0.78);
        float checker = step(0.5, fract(vFlagUv.y * 2.5 + step(0.5, fract(vFlagUv.x * 3.5)) * 0.5));
        float diagStripe = smoothstep(0.04, 0.06, abs(vFlagUv.y - 0.5) - 0.18);
        vec3 fieldCol = mix(cSignalOrange, cMarshalGold, 1.0 - diagStripe);
        vec3 flyCol = mix(cSignalOrange, cCanvasWhite, checker);
        vec3 clothCol = vFlagUv.x < 0.08
          ? cHoistCanvas
          : (vFlagUv.x < 0.44 ? fieldCol : flyCol);
        float weave = 0.95 + 0.05 * sin(vFlagUv.x * 220.0) * cos(vFlagUv.y * 140.0);
        float creaseAO = 0.88 + 0.12 * vFlagFold;
        clothCol *= weave * creaseAO * mix(1.0, 0.76, uWetness);
        diffuseColor.rgb *= clothCol;`,
      );
  };
  flagMat.customProgramCacheKey = () => 'shared-marshal-cloth-pbr-v1';

  const marshalFractions = [0.14, 0.32, 0.55, 0.74, 0.9];
  const marshalConcreteGeos: THREE.BufferGeometry[] = [];
  const marshalSteelGeos: THREE.BufferGeometry[] = [];
  const marshalGlassGeos: THREE.BufferGeometry[] = [];
  const marshalTrimGeos: THREE.BufferGeometry[] = [];

  for (const frac of marshalFractions) {
    const idx = Math.floor(frac * N) % N;
    const s = samples[idx];
    if (s.isBridge || s.isTunnel || isIndexNearTunnelOrShed(idx, 6)) continue;
    const outSide = s.curvature >= 0 ? 1 : -1;
    const lat = outSide * (roadHalf + SHOULDER_WIDTH + 5.2);
    const mx = s.position.x + s.right.x * lat;
    const mz = s.position.z + s.right.z * lat;
    if (isSpotBlockedByTrackOrTunnel(mx, mz, idx, 4.5)) continue;
    const my = groundHeightAt(mx, mz);
    if (my < waterLevel + 0.3) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, mx, my, mz, 8, 8)) continue;

    const basis = new THREE.Matrix4().makeBasis(
      s.right.clone().multiplyScalar(outSide),
      new THREE.Vector3(0, 1, 0),
      s.tangent.clone().multiplyScalar(-outSide),
    );
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);

    const plinth = new THREE.BoxGeometry(3.2, 5.4, 3.2);
    plinth.translate(0, 0.8, 0);
    plinth.applyQuaternion(quat);
    plinth.translate(mx, my, mz);
    marshalConcreteGeos.push(plinth);
    worldColliders.addObb(
      mx,
      mz,
      1.65,
      1.65,
      s.right.x * outSide,
      s.right.z * outSide,
      'concrete',
      my - 2,
      my + 7,
    );

    const cabinGlass = new THREE.BoxGeometry(2.6, 1.9, 2.6);
    cabinGlass.translate(0, 4.2, 0);
    cabinGlass.applyQuaternion(quat);
    cabinGlass.translate(mx, my, mz);
    marshalGlassGeos.push(cabinGlass);

    const roof = new THREE.BoxGeometry(3.5, 0.28, 3.5);
    roof.translate(0, 5.25, 0);
    roof.applyQuaternion(quat);
    roof.translate(mx, my, mz);
    marshalSteelGeos.push(roof);

    const pole = new THREE.CylinderGeometry(0.055, 0.08, 4.9, 8);
    pole.translate(-1.1, 7.65, 1.1);
    pole.applyQuaternion(quat);
    pole.translate(mx, my, mz);
    marshalSteelGeos.push(pole);

    const finial = new THREE.SphereGeometry(0.11, 8, 6);
    finial.translate(-1.1, 10.12, 1.1);
    finial.applyQuaternion(quat);
    finial.translate(mx, my, mz);
    marshalTrimGeos.push(finial);

    const flagGeo = trackGeo(new THREE.PlaneGeometry(1.9, 1.02, 20, 6));
    flagGeo.translate(0.95, 0, 0);
    const flagMesh = new THREE.Mesh(flagGeo, flagMat);
    flagMesh.castShadow = true;
    const flagOffset = new THREE.Vector3(-1.05, 9.45, 1.1).applyQuaternion(quat);
    flagMesh.position.set(mx + flagOffset.x, my + flagOffset.y, mz + flagOffset.z);
    flagMesh.quaternion.copy(quat);
    group.add(flagMesh);
  }

  if (marshalConcreteGeos.length > 0) {
    const mConc = trackGeo(BufferGeometryUtils.mergeGeometries(marshalConcreteGeos, false));
    marshalConcreteGeos.forEach((g) => g.dispose());
    const mConcMesh = new THREE.Mesh(mConc, concreteFootMat);
    mConcMesh.castShadow = true;
    mConcMesh.receiveShadow = true;
    group.add(mConcMesh);
  }
  if (marshalSteelGeos.length > 0) {
    const mSteel = trackGeo(BufferGeometryUtils.mergeGeometries(marshalSteelGeos, false));
    marshalSteelGeos.forEach((g) => g.dispose());
    const mSteelMesh = new THREE.Mesh(mSteel, darkCarbonMat);
    mSteelMesh.castShadow = true;
    group.add(mSteelMesh);
  }
  if (marshalTrimGeos.length > 0) {
    const mTrim = trackGeo(BufferGeometryUtils.mergeGeometries(marshalTrimGeos, false));
    marshalTrimGeos.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mTrim, accentTrimMat));
  }
  if (marshalGlassGeos.length > 0) {
    const mGlass = trackGeo(BufferGeometryUtils.mergeGeometries(marshalGlassGeos, false));
    marshalGlassGeos.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mGlass, glassDeckMat));
  }

  // ---------------------------------------------------------------------------
  // 3. HIGH-CURVATURE RACING TIRE BARRIER STACKS AT SHARP APEXES / RUNOFFS
  // ---------------------------------------------------------------------------
  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.05,
    }),
  );
  const stackTorusParts: THREE.BufferGeometry[] = [];
  for (let h = 0; h < 3; h++) {
    const ring = new THREE.TorusGeometry(0.42, 0.19, 8, 14);
    ring.rotateX(Math.PI * 0.5);
    ring.translate(0, 0.22 + h * 0.36, 0);
    stackTorusParts.push(ring);
  }
  const tireStackGeo = trackGeo(BufferGeometryUtils.mergeGeometries(stackTorusParts, false));
  stackTorusParts.forEach((g) => g.dispose());

  const tireMatrices: THREE.Matrix4[] = [];
  const tireColors: THREE.Color[] = [];
  const cTireRed = new THREE.Color(palette.tirePrimaryHex);
  const cTireWhite = new THREE.Color(palette.tireSecondaryHex);
  const dummy = new THREE.Object3D();

  let tireClusterCount = 0;
  for (let i = 0; i < N; i += 6) {
    const s = samples[i];
    if (s.isBridge || s.isTunnel || s.isStraight || Math.abs(s.curvature) < 0.0145) continue;
    if (isIndexNearTunnelOrShed(i, 5)) continue;
    const outSide = s.curvature > 0 ? 1 : -1;
    const lat = outSide * (roadHalf + SHOULDER_WIDTH + 0.85);
    const tx = s.position.x + s.right.x * lat;
    const tz = s.position.z + s.right.z * lat;
    if (isSpotBlockedByTrackOrTunnel(tx, tz, i, 2.2)) continue;
    const ty = groundHeightAt(tx, tz);
    if (ty < waterLevel + 0.15) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, tx, ty, tz, 8, 8)) continue;
    if (circuit.queryNearest(tx, tz).absDistance < roadHalf + 1.4) continue;

    dummy.position.set(tx, ty - 0.04, tz);
    dummy.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
    dummy.scale.setScalar(1.0);
    dummy.updateMatrix();
    tireMatrices.push(dummy.matrix.clone());
    tireColors.push(tireClusterCount % 2 === 0 ? cTireRed : cTireWhite);
    worldColliders.addCircle(tx, tz, 0.62, 'tire', ty - 1.0, ty + 1.8);
    tireClusterCount++;
  }

  let tireInst: THREE.InstancedMesh | null = null;
  if (tireMatrices.length > 0) {
    tireInst = new THREE.InstancedMesh(tireStackGeo, tireMat, tireMatrices.length);
    for (let i = 0; i < tireMatrices.length; i++) {
      tireInst.setMatrixAt(i, tireMatrices[i]);
      tireInst.setColorAt(i, tireColors[i]);
    }
    tireInst.instanceMatrix.needsUpdate = true;
    if (tireInst.instanceColor) tireInst.instanceColor.needsUpdate = true;
    tireInst.computeBoundingSphere();
    tireInst.castShadow = true;
    tireInst.receiveShadow = true;
    group.add(tireInst);

    const tireLocalTransform = new THREE.Matrix4()
      .makeRotationY(Math.PI * 0.5)
      .scale(new THREE.Vector3(0.74, 1.0, 0.84));
    const tireNeutralColors = tireMatrices.map((_, idx) =>
      idx % 2 === 0 ? new THREE.Color(0xffffff) : new THREE.Color(0xe6eaef),
    );
    attachInstancedUserAsset({
      assetId: 'tire_wall',
      parentGroup: group,
      matrices: tireMatrices,
      colors: tireNeutralColors,
      fallbackMeshes: [tireInst],
      localTransform: tireLocalTransform,
      scaledRegistry: glbBarrierRegistry,
      allowsShadow: true,
      isDisposed: () => isDisposed,
      getQualityState: getBarrierQualityState,
      cleanupCallbacks,
    });
  }

  // ---------------------------------------------------------------------------
  // 3B. USER-UPLOADED GLB TRACKSIDE CATCH FENCES, GUARDRAILS & PADDOCK MESH
  // ---------------------------------------------------------------------------
  const raceFenceMatrices: THREE.Matrix4[] = [];
  const assetFenceMatrices: THREE.Matrix4[] = [];
  const glbGuardrailMatrices: THREE.Matrix4[] = [];
  const glbTerminalMatrices: THREE.Matrix4[] = [];
  const protectiveFenceMatrices: THREE.Matrix4[] = [];

  for (let i = 0; i < N; i += 10) {
    const s = samples[i];
    if (s.isBridge || s.isTunnel || s.isStraight) continue;
    if (Math.abs(s.curvature) < 0.0095 || isIndexNearTunnelOrShed(i, 6)) continue;
    const outSide = s.curvature > 0 ? 1 : -1;
    const lat = outSide * (roadHalf + SHOULDER_WIDTH + 2.85);
    const fx = s.position.x + s.right.x * lat;
    const fz = s.position.z + s.right.z * lat;
    if (isSpotBlockedByTrackOrTunnel(fx, fz, i, 2.8)) continue;
    const fy = groundHeightAt(fx, fz);
    if (fy < waterLevel + 0.25) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, fx, fy, fz, 8, 8)) continue;
    if (circuit.queryNearest(fx, fz).absDistance < roadHalf + SHOULDER_WIDTH + 1.8) continue;

    // Align fence long axis (+X) along track tangent
    const basisFwd = s.right.clone().multiplyScalar(-outSide);
    const basisRight = s.tangent.clone();
    const qFence = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(basisRight, new THREE.Vector3(0, 1, 0), basisFwd),
    );
    const mat = new THREE.Matrix4().compose(new THREE.Vector3(fx, fy - 0.08, fz), qFence, new THREE.Vector3(1, 1, 1));
    if (Math.abs(s.curvature) >= 0.014) {
      assetFenceMatrices.push(mat);
      worldColliders.addObb(fx, fz, 2.4, 0.45, basisRight.x, basisRight.z, 'metal', fy - 1.0, fy + 5.5);
    } else {
      raceFenceMatrices.push(mat);
      worldColliders.addObb(fx, fz, 2.2, 0.42, basisRight.x, basisRight.z, 'metal', fy - 1.0, fy + 4.2);
    }
  }

  // Place guardrail + terminal bays near marshal towers and straight runoffs, plus protective mesh along paddock edge
  for (const frac of marshalFractions) {
    const idx = Math.floor(frac * N) % N;
    const s = samples[idx];
    if (s.isBridge || s.isTunnel || isIndexNearTunnelOrShed(idx, 6)) continue;
    const outSide = s.curvature >= 0 ? 1 : -1;
    const lat = outSide * (roadHalf + SHOULDER_WIDTH + 2.4);
    const gx = s.position.x + s.right.x * lat;
    const gz = s.position.z + s.right.z * lat;
    if (isSpotBlockedByTrackOrTunnel(gx, gz, idx, 3.2)) continue;
    const gy = groundHeightAt(gx, gz);
    if (gy < waterLevel + 0.3) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, gx, gy, gz, 8, 8)) continue;

    const basisFwd = s.right.clone().multiplyScalar(-outSide);
    const basisRight = s.tangent.clone();
    const qRail = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(basisRight, new THREE.Vector3(0, 1, 0), basisFwd),
    );
    const railPos = new THREE.Vector3(gx, gy - 0.04, gz);
    glbGuardrailMatrices.push(new THREE.Matrix4().compose(railPos, qRail, new THREE.Vector3(1, 1, 1)));
    const termPos = railPos.clone().addScaledVector(basisRight, 2.45);
    glbTerminalMatrices.push(new THREE.Matrix4().compose(termPos, qRail, new THREE.Vector3(1, 1, 1)));
    const termRevQ = qRail.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    const termNegPos = railPos.clone().addScaledVector(basisRight, -2.45);
    glbTerminalMatrices.push(new THREE.Matrix4().compose(termNegPos, termRevQ, new THREE.Vector3(1, 1, 1)));
  }

  // Place 10 metallic paddock protective fence panels along the rear edge of the Pit/Paddock apron
  if (circuit.pitLaneBounds.frame) {
    const pf = circuit.pitLaneBounds.frame;
    const sfTanDot = pf.rightX * (sfSample.position.x - pf.centerX) + pf.rightZ * (sfSample.position.z - pf.centerZ);
    const awayTrackSign = sfTanDot > 0 ? -1 : 1;
    const pBasis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(pf.tanX, 0, pf.tanZ),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(pf.rightX * awayTrackSign, 0, pf.rightZ * awayTrackSign),
    );
    const pQuat = new THREE.Quaternion().setFromRotationMatrix(pBasis);
    const backOffset = awayTrackSign * 14.2;
    for (let k = -5; k <= 4; k++) {
      const along = (k + 0.5) * 3.12;
      const px = pf.centerX + pf.tanX * along + pf.rightX * backOffset;
      const pz = pf.centerZ + pf.tanZ * along + pf.rightZ * backOffset;
      const py = groundHeightAt(px, pz);
      if (py < waterLevel + 0.2 || Math.abs(py - circuit.pitLaneBounds.y) > 3.5) continue;
      protectiveFenceMatrices.push(
        new THREE.Matrix4().compose(new THREE.Vector3(px, py - 0.02, pz), pQuat, new THREE.Vector3(1, 1, 1)),
      );
      worldColliders.addObb(px, pz, 1.52, 0.2, pf.tanX, pf.tanZ, 'metal', py - 0.5, py + 2.4);
    }
  }

  const mountTracksideGlb = (assetId: Parameters<typeof attachInstancedUserAsset>[0]['assetId'], matrices: THREE.Matrix4[]) => {
    if (matrices.length === 0) return;
    attachInstancedUserAsset({
      assetId,
      parentGroup: group,
      matrices,
      scaledRegistry: glbBarrierRegistry,
      allowsShadow: true,
      isDisposed: () => isDisposed,
      getQualityState: getBarrierQualityState,
      cleanupCallbacks,
    });
  };
  mountTracksideGlb('race_fence', raceFenceMatrices);
  mountTracksideGlb('asset_fence', assetFenceMatrices);
  mountTracksideGlb('guardrail', glbGuardrailMatrices);
  mountTracksideGlb('guardrail_terminal', glbTerminalMatrices);
  mountTracksideGlb('protective_fence', protectiveFenceMatrices);

  // ---------------------------------------------------------------------------
  // 4. DENSE ROADSIDE STREETLAMPS (Straights, Bridges & Major Corners)
  // ---------------------------------------------------------------------------
  const poleBaseGeo = new THREE.CylinderGeometry(0.08, 0.14, 6.6, 8);
  poleBaseGeo.translate(0, 3.3, 0);
  const armGeo = new THREE.BoxGeometry(1.9, 0.12, 0.12);
  armGeo.translate(-0.9, 6.52, 0);
  const singlePoleGeo = trackGeo(BufferGeometryUtils.mergeGeometries([poleBaseGeo, armGeo], false));
  poleBaseGeo.dispose();
  armGeo.dispose();

  const lumHeadGeo = trackGeo(new THREE.BoxGeometry(0.84, 0.15, 0.38));
  const lumMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffd896,
      emissive: 0xffb347,
      emissiveIntensity: 0.22,
      roughness: 0.24,
      metalness: 0.1,
    }),
  );

  const poleMatrices: THREE.Matrix4[] = [];
  const lumMatrices: THREE.Matrix4[] = [];
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < N; i += 14) {
    const s = samples[i];
    if (s.isTunnel) continue;
    if (theme === 'kestrel_peaks') {
      // On mountain passes, keep streetlamps strictly on the Start/Finish straight near Basecamp Village
      const distToSf = Math.hypot(s.position.x - sfSample.position.x, s.position.z - sfSample.position.z);
      if (!s.isStraight || s.isBridge || distToSf > 175) continue;
    } else {
      if (isIndexNearTunnelOrShed(i, 7)) continue;
      // Avoid isolated lone streetlamps on brief curvature inflections between tight corners
      const prevSample = samples[(i - 14 + N) % N];
      const nextSample = samples[(i + 14) % N];
      const inSustainedFastZone =
        Math.abs(s.curvature) < 0.0072 &&
        Math.abs(prevSample.curvature) < 0.0085 &&
        Math.abs(nextSample.curvature) < 0.0085;
      if (!s.isBridge && !s.isStraight && !inSustainedFastZone) continue;
    }
    if (isIndexNearTunnelOrShed(i, 7)) continue;

    const sides = s.isBridge ? ([-1, 1] as const) : ([1] as const);
    for (const side of sides) {
      const lat = side * (s.isBridge ? roadHalf + 2.55 : roadHalf + SHOULDER_WIDTH + 0.85);
      const px = s.position.x + s.right.x * lat;
      const pz = s.position.z + s.right.z * lat;
      if (isSpotBlockedByTrackOrTunnel(px, pz, i, s.isBridge ? 4.5 : 2.6)) continue;
      const py = s.isBridge ? s.position.y + 1.12 : groundHeightAt(px, pz);
      if (!s.isBridge && py < waterLevel + 0.2) continue;
      if (!s.isBridge && isPointInPitBounds(circuit.pitLaneBounds, px, py, pz, 5, 5)) continue;

      const basisRight = s.right.clone().multiplyScalar(side);
      const basisFwd = s.tangent.clone().multiplyScalar(-side);
      tmpQuat.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(basisRight, new THREE.Vector3(0, 1, 0), basisFwd),
      );
      poleMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), tmpQuat, tmpScale));
      worldColliders.addCircle(px, pz, 0.24, 'metal', py - 1.0, py + 7.0);

      const lumLocal = new THREE.Vector3(-1.45, 6.42, 0)
        .applyQuaternion(tmpQuat)
        .add(new THREE.Vector3(px, py, pz));
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
  // 5. POOLED FIA SIGNAGE (Chevron Arrows, 150/100/50m Braking Boards & Speed Traps)
  // ---------------------------------------------------------------------------
  const signPostGeo = trackGeo(new THREE.CylinderGeometry(0.055, 0.055, 2.35, 6));
  const chevronPlateGeo = trackGeo(new THREE.BoxGeometry(1.5, 1.5, 0.08));
  const distPlateGeo = trackGeo(new THREE.BoxGeometry(1.35, 1.35, 0.08));

  const chevronMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.chevronSignAlbedo,
      emissiveMap: textures.chevronSignAlbedo,
      emissive: 0xffb336,
      emissiveIntensity: 0.06,
      roughness: 0.38,
      metalness: 0.15,
    }),
  );
  const distMats = [
    trackMat(new THREE.MeshStandardMaterial({ map: textures.distanceSign150Albedo, roughness: 0.42 })),
    trackMat(new THREE.MeshStandardMaterial({ map: textures.distanceSign100Albedo, roughness: 0.42 })),
    trackMat(new THREE.MeshStandardMaterial({ map: textures.distanceSign50Albedo, roughness: 0.42 })),
  ];

  interface ChevronDesc {
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    flipX: boolean;
  }
  interface DistDesc {
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    boardIdx: number;
  }
  interface SpeedTrapDesc {
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
  }

  const chevronDescs: ChevronDesc[] = [];
  const distBoardDescs: DistDesc[] = [];
  const speedTrapDescs: SpeedTrapDesc[] = [];
  const tmpLookDummy = new THREE.Object3D();

  let lastChevronIdx = -50;
  for (let i = 0; i < N; i += 8) {
    const s = samples[i];
    if (s.isBridge || s.isTunnel || Math.abs(s.curvature) < 0.009 || i - lastChevronIdx < 9) continue;
    if (isIndexNearTunnelOrShed(i, 5)) continue;
    lastChevronIdx = i;

    const outSide = s.curvature > 0 ? 1 : -1;
    const lat = outSide * (roadHalf + SHOULDER_WIDTH + 1.25);
    const sx = s.position.x + s.right.x * lat;
    const sz = s.position.z + s.right.z * lat;
    if (isSpotBlockedByTrackOrTunnel(sx, sz, i, 2.5)) continue;
    const sy = groundHeightAt(sx, sz);
    if (sy < waterLevel + 0.15) continue;

    const faceDir = s.tangent
      .clone()
      .multiplyScalar(-1)
      .addScaledVector(s.right, -outSide * 0.35)
      .normalize();
    tmpLookDummy.position.set(sx, sy - 0.1, sz);
    tmpLookDummy.lookAt(sx + faceDir.x * 10, sy + 0.5, sz + faceDir.z * 10);
    chevronDescs.push({
      pos: tmpLookDummy.position.clone(),
      quat: tmpLookDummy.quaternion.clone(),
      flipX: outSide < 0,
    });
    worldColliders.addCircle(sx, sz, 0.42, 'metal', sy - 1.0, sy + 3.2);
  }

  // Braking distance boards (150m / 100m / 50m) at two signature braking zones
  const brakeStepSamples = Math.round(50 / (circuit.totalLength / N));
  const brakingZones = [
    (sfIdx + Math.round(195 / (circuit.totalLength / N))) % N,
    (sfIdx + Math.round((circuit.totalLength * 0.55) / (circuit.totalLength / N))) % N,
  ];
  for (const entryIdx of brakingZones) {
    for (let b = 0; b < 3; b++) {
      const idx = (entryIdx - (2 - b) * brakeStepSamples + N) % N;
      const s = samples[idx];
      if (s.isBridge || s.isTunnel || isIndexNearTunnelOrShed(idx, 5)) continue;
      const lat = -(roadHalf + SHOULDER_WIDTH + 1.35);
      const bx = s.position.x + s.right.x * lat;
      const bz = s.position.z + s.right.z * lat;
      if (isSpotBlockedByTrackOrTunnel(bx, bz, idx, 2.5)) continue;
      const by = groundHeightAt(bx, bz);
      if (by < waterLevel + 0.15) continue;

      tmpLookDummy.position.set(bx, by - 0.1, bz);
      tmpLookDummy.lookAt(bx - s.tangent.x * 10, by, bz - s.tangent.z * 10);
      distBoardDescs.push({
        pos: tmpLookDummy.position.clone(),
        quat: tmpLookDummy.quaternion.clone(),
        boardIdx: b,
      });
      worldColliders.addObb(bx, bz, 0.72, 0.28, -s.right.x, -s.right.z, 'metal', by - 1.0, by + 3.0);
    }
  }

  const chevronPoolSlots: Array<{ group: THREE.Group; board: THREE.Mesh; post: THREE.Mesh }> = [];
  const maxChevronSlots = Math.min(chevronDescs.length, 18);
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
  for (let b = 0; b < Math.min(distBoardDescs.length, 6); b++) {
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
      distMats[b % 3],
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

  // Speed-Trap Radar Arches
  const speedTrapSlots: Array<{ group: THREE.Group; legs: THREE.Mesh[] }> = [];
  if (circuit.features.speedTrapGates && circuit.speedTrapTs.length > 0) {
    const trapArchMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.accentHex,
        emissive: palette.accentHex,
        emissiveIntensity: 0.78,
        roughness: 0.24,
      }),
    );
    const trapSpan = roadHalf * 2 + 4.4;
    const trapH = 7.4;

    circuit.speedTrapTs.forEach((stT) => {
      const s = circuit.sampleAtT(stT);
      if (s.isBridge || s.isTunnel || isIndexNearTunnelOrShed(s.index, 4)) return;
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

  // 5 Corner Night Stadium Floodlight Towers (disabled along wilderness mountain pass horizons)
  const extraFloodMats: THREE.MeshStandardMaterial[] = [];
  const extraFloodLights: THREE.PointLight[] = [];
  if (circuit.features.nightFloodlights && theme !== 'kestrel_peaks') {
    const floodBulbMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        emissive: 0xfff3d1,
        emissiveIntensity: 0.22,
        roughness: 0.18,
      }),
    );
    extraFloodMats.push(floodBulbMat);

    const towerAngles = [0.1, 0.28, 0.48, 0.68, 0.86];
    towerAngles.forEach((ft) => {
      const s = circuit.sampleAtT(ft);
      if (s.isBridge || s.isTunnel || isIndexNearTunnelOrShed(s.index, 6)) return;
      const outSide = s.curvature >= 0 ? 1 : -1;
      const lat = outSide * (roadHalf + SHOULDER_WIDTH + 3.4);
      const fx = s.position.x + s.right.x * lat;
      const fz = s.position.z + s.right.z * lat;
      if (isSpotBlockedByTrackOrTunnel(fx, fz, s.index, 3.5)) return;
      const fy = groundHeightAt(fx, fz);
      if (fy < waterLevel + 0.2) return;
      if (isPointInPitBounds(circuit.pitLaneBounds, fx, fy, fz, 6, 6)) return;

      const tGroup = new THREE.Group();
      const mast = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.18, 0.28, 13.5, 8)),
        brushedSteelMat,
      );
      mast.position.y = 6.75;
      mast.castShadow = true;
      tGroup.add(mast);

      const rack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.8, 0.8, 0.68)), darkCarbonMat);
      rack.position.set(0, 13.5, 0);
      tGroup.add(rack);

      const lampFace = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.3, 0.56)), floodBulbMat);
      lampFace.position.set(0, 13.35, 0.36);
      tGroup.add(lampFace);

      const pt = new THREE.PointLight(palette.nightLightHex, 0, 96, 1.45);
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

  let propWindowDistSq = 460 * 460;
  const lastPoolUpdatePos = new THREE.Vector3(1e9, 1e9, 1e9);
  let lastPoolFwdX = 0;
  let lastPoolFwdZ = 0;

  const updateVisibilityWindow = (
    focusPos: THREE.Vector3,
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
    const dirDot = hasCamDir ? fwdX * lastPoolFwdX + fwdZ * lastPoolFwdZ : 1;
    if (!force && lastPoolUpdatePos.distanceToSquared(focusPos) < 400 && dirDot > 0.96) return;
    lastPoolUpdatePos.copy(focusPos);
    if (hasCamDir) {
      lastPoolFwdX = fwdX;
      lastPoolFwdZ = fwdZ;
    }

    const isBehindCam = (pos: THREE.Vector3): boolean => {
      if (!hasCamDir || !camPos) return false;
      const dx = pos.x - camPos.x;
      const dz = pos.z - camPos.z;
      return dx * fwdX + dz * fwdZ < -14;
    };

    let cSlot = 0;
    for (let i = 0; i < chevronDescs.length && cSlot < chevronPoolSlots.length; i++) {
      const desc = chevronDescs[i];
      if (!isBehindCam(desc.pos) && desc.pos.distanceToSquared(focusPos) <= propWindowDistSq) {
        const slot = chevronPoolSlots[cSlot++];
        slot.group.position.copy(desc.pos);
        slot.group.quaternion.copy(desc.quat);
        slot.board.scale.x = desc.flipX ? -1 : 1;
        slot.group.visible = true;
      }
    }
    for (let i = cSlot; i < chevronPoolSlots.length; i++) {
      chevronPoolSlots[i].group.visible = false;
    }

    let dSlot = 0;
    for (let i = 0; i < distBoardDescs.length && dSlot < distPoolSlots.length; i++) {
      const desc = distBoardDescs[i];
      if (!isBehindCam(desc.pos) && desc.pos.distanceToSquared(focusPos) <= propWindowDistSq) {
        const slot = distPoolSlots[dSlot++];
        slot.group.position.copy(desc.pos);
        slot.group.quaternion.copy(desc.quat);
        slot.mats[4] = distMats[desc.boardIdx];
        slot.group.visible = true;
      }
    }
    for (let i = dSlot; i < distPoolSlots.length; i++) {
      distPoolSlots[i].group.visible = false;
    }

    let tSlot = 0;
    for (let i = 0; i < speedTrapDescs.length && tSlot < speedTrapSlots.length; i++) {
      const desc = speedTrapDescs[i];
      if (!isBehindCam(desc.pos) && desc.pos.distanceToSquared(focusPos) <= propWindowDistSq * 1.45) {
        const slot = speedTrapSlots[tSlot++];
        slot.group.position.copy(desc.pos);
        slot.group.quaternion.copy(desc.quat);
        slot.group.visible = true;
      }
    }
    for (let i = tSlot; i < speedTrapSlots.length; i++) {
      speedTrapSlots[i].group.visible = false;
    }
    void polePositions;
  };

  const setGraphicsQuality = (quality: PropsQualityTier) => {
    currentQuality = quality;
    const allowShadows = quality !== 'performance';
    const winDist = quality === 'performance' ? 300 : quality === 'balanced' ? 460 : 680;
    propWindowDistSq = winDist * winDist;
    if (poleInst) poleInst.castShadow = allowShadows;
    if (tireInst) {
      const ratio = quality === 'performance' ? 0.6 : quality === 'balanced' ? 0.85 : 1.0;
      tireInst.count = Math.max(1, Math.round(tireMatrices.length * ratio));
      tireInst.castShadow = allowShadows;
    }
    const glbRatio = quality === 'performance' ? 0.6 : quality === 'balanced' ? 0.85 : 1.0;
    for (const entry of glbBarrierRegistry) {
      entry.mesh.count = Math.max(1, Math.round(entry.fullCount * glbRatio));
      entry.mesh.castShadow = entry.allowsShadow && allowShadows;
    }
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
    updateVisibilityWindow(lastPoolUpdatePos, true);
  };

  updateVisibilityWindow(sfSample.position, true);

  return {
    setNightFactor: (nightFactor: number) => {
      lumMat.emissiveIntensity = 0.16 + nightFactor * 2.7;
      bannerFaceMat.emissiveIntensity = 0.12 + nightFactor * 1.35;
      glassDeckMat.emissiveIntensity = 0.06 + nightFactor * 1.1;
      chevronMat.emissiveIntensity = 0.05 + nightFactor * 0.9;
      podLensMat.emissiveIntensity = 0.08 + nightFactor * 1.25;
      const showPl = nightFactor > 0.01;
      gantryNightLight.intensity = nightFactor * 3.8;
      gantryNightLight.visible = showPl;
      for (const fm of extraFloodMats) fm.emissiveIntensity = 0.18 + nightFactor * 2.9;
      for (const fl of extraFloodLights) {
        fl.intensity = nightFactor * 5.2;
        fl.visible = showPl;
      }
    },
    updateVisibilityWindow: (focusPos: THREE.Vector3, camPos?: THREE.Vector3, camFwd?: THREE.Vector3) =>
      updateVisibilityWindow(focusPos, false, camPos, camFwd),
    setGraphicsQuality,
    dispose: () => {
      isDisposed = true;
      for (const cb of cleanupCallbacks) cb();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}

export interface CornerFanZoneRig {
  update: (deltaSec: number, elapsedSec: number, telemetry: CrowdTelemetryInput) => void;
  setNightFactor: (nightFactor: number) => void;
  setWireframe: (wire: boolean) => void;
  dispose: () => void;
}

/**
 * Places 3-4 compact Trackside Corner Fan Zones at high-curvature corners outside the road/pit envelope.
 * Each stand animates independently via its local player proximity & cornering G / pace excitement.
 */
export function buildCornerFanZoneRigs(
  parentGroup: THREE.Group,
  weatherUniforms: WeatherUniforms,
  waterLevel: number,
  theme: TracksideThemeId,
): CornerFanZoneRig {
  const palette = getTracksidePalette(theme);
  const circuit = getCircuitData();
  const samples = circuit.samples;
  const N = samples.length;
  const roadHalf = circuit.roadHalfWidth;

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

  const plinthMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x383e47,
      roughness: 0.88,
      metalness: 0.08,
    }),
  );
  const tierMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.seatHex,
      roughness: 0.72,
      metalness: 0.12,
    }),
  );
  const frameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.structureDarkHex,
      roughness: 0.42,
      metalness: 0.72,
    }),
  );
  const fasciaMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: palette.accentHex,
      emissive: palette.bannerEmissiveHex,
      emissiveIntensity: 0.12,
      roughness: 0.35,
      metalness: 0.25,
    }),
  );
  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: palette.glassHex,
      roughness: 0.08,
      metalness: 0.15,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      clearcoat: 0.9,
    }),
  );

  // Score candidate high-curvature outer corners well away from S/F straight, pit lane & bridges
  interface CornerCandidate {
    idx: number;
    score: number;
    wx: number;
    wy: number;
    wz: number;
    outX: number;
    outZ: number;
  }
  const candidates: CornerCandidate[] = [];
  const tunnelFanList = samples.filter((s) => s.isTunnel);
  for (let i = 0; i < N; i += 8) {
    const s = samples[i];
    if (s.isBridge || s.isTunnel || s.isStraight) continue;
    const absCurv = Math.abs(s.curvature);
    if (absCurv < 0.0085) continue;

    const outSide = s.curvature >= 0 ? 1 : -1;
    const latOffset = outSide * (roadHalf + SHOULDER_WIDTH + 14.2);
    const wx = s.position.x + s.right.x * latOffset;
    const wz = s.position.z + s.right.z * latOffset;

    const q = circuit.queryNearest(wx, wz);
    if (q.absDistance < roadHalf + SHOULDER_WIDTH + 9.2) continue;
    let nearTun = false;
    for (let t = 0; t < tunnelFanList.length; t++) {
      const ts = tunnelFanList[t];
      if (Math.hypot(wx - ts.position.x, wz - ts.position.z) < roadHalf + SHOULDER_WIDTH + 16.0) {
        nearTun = true;
        break;
      }
    }
    if (nearTun) continue;

    const fy = groundHeightAt(wx, wz);
    if (fy < waterLevel + 0.9 || fy > s.position.y + 8.0) continue;
    if (isPointInPitBounds(circuit.pitLaneBounds, wx, fy, wz, 14, 14)) continue;

    // Require relatively level pad footprint
    const outDirX = outSide * s.right.x;
    const outDirZ = outSide * s.right.z;
    const outLen = Math.hypot(outDirX, outDirZ) || 1;
    const nx = outDirX / outLen;
    const nz = outDirZ / outLen;
    const backY = groundHeightAt(wx + nx * 4.5, wz + nz * 4.5);
    const frontY = groundHeightAt(wx - nx * 4.5, wz - nz * 4.5);
    if (Math.abs(backY - fy) > 3.6 || Math.abs(frontY - fy) > 3.6) continue;

    const standY = Math.max(fy, s.position.y - 0.8);
    candidates.push({
      idx: i,
      score: absCurv,
      wx,
      wy: standY,
      wz,
      outX: nx,
      outZ: nz,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected: CornerCandidate[] = [];
  for (const c of candidates) {
    if (selected.length >= 4) break;
    let tooClose = false;
    for (const ex of selected) {
      if (Math.hypot(c.wx - ex.wx, c.wz - ex.wz) < 175) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) selected.push(c);
  }

  const fanLen = 22.0;
  const fanDepth = 6.2;
  const stepCount = 4;
  const stepH = 0.58;
  const stepD = 1.32;

  const plinthGeo = new THREE.BoxGeometry(fanLen + 1.8, 2.4, fanDepth + 1.6);
  const tierGeo = new THREE.BoxGeometry(fanLen, stepH, stepD);
  const railGeo = new THREE.BoxGeometry(fanLen - 0.8, 0.95, 0.12);
  const fasciaGeo = new THREE.BoxGeometry(fanLen + 0.8, 0.52, 0.16);
  const postGeo = new THREE.BoxGeometry(0.32, 4.2, 0.36);

  const plinthParts: THREE.BufferGeometry[] = [];
  const tierParts: THREE.BufferGeometry[] = [];
  const railParts: THREE.BufferGeometry[] = [];
  const fasciaParts: THREE.BufferGeometry[] = [];
  const postParts: THREE.BufferGeometry[] = [];

  const zones: Array<{
    worldX: number;
    worldZ: number;
    group: THREE.Group;
    crowdRig: GrandstandCrowdRig;
    light: THREE.PointLight;
  }> = [];

  const upVec = new THREE.Vector3(0, 1, 0);
  const basisMat = new THREE.Matrix4();
  const xVec = new THREE.Vector3();
  const zVec = new THREE.Vector3();
  const zQuat = new THREE.Quaternion();
  const zScale = new THREE.Vector3(1, 1, 1);
  const partMat4 = new THREE.Matrix4();
  const fanContainer = new THREE.Group();
  fanContainer.name = 'CornerFanZonesBatched';
  parentGroup.add(fanContainer);

  for (const c of selected) {
    const zGroup = new THREE.Group();
    zGroup.name = `CornerFanZone_${c.idx}`;
    zVec.set(c.outX, 0, c.outZ).normalize(); // +Z faces away from track so -Z faces inward toward track
    xVec.crossVectors(upVec, zVec).normalize();
    basisMat.makeBasis(xVec, upVec, zVec);
    zQuat.setFromRotationMatrix(basisMat);
    zGroup.position.set(c.wx, c.wy, c.wz);
    zGroup.quaternion.copy(zQuat);

    const addWorldPart = (src: THREE.BufferGeometry, target: THREE.BufferGeometry[], lx: number, ly: number, lz: number) => {
      const wp = new THREE.Vector3(lx, ly, lz).applyQuaternion(zQuat).add(zGroup.position);
      partMat4.compose(wp, zQuat, zScale);
      const clone = src.clone();
      clone.applyMatrix4(partMat4);
      target.push(clone);
    };

    addWorldPart(plinthGeo, plinthParts, 0, -0.8, 0);
    for (let t = 0; t < stepCount; t++) {
      addWorldPart(tierGeo, tierParts, 0, 0.4 + t * stepH + stepH * 0.5, -fanDepth * 0.5 + 0.95 + t * stepD);
    }
    addWorldPart(railGeo, railParts, 0, 0.92, -fanDepth * 0.5 + 0.25);
    addWorldPart(fasciaGeo, fasciaParts, 0, 0.28, -fanDepth * 0.5 - 0.72);
    for (const sx of [-fanLen * 0.45, fanLen * 0.45]) {
      addWorldPart(postGeo, postParts, sx, 2.5, fanDepth * 0.5 - 0.35);
    }

    const flood = new THREE.PointLight(palette.nightLightHex, 0, 44, 1.45);
    flood.position.set(0, 4.6, fanDepth * 0.25);
    flood.visible = false;
    zGroup.add(flood);

    const crowdRig = buildGrandstandCrowdRig(
      {
        parentGroup: zGroup,
        centerX: 0,
        baseY: 0.4,
        centerZ: 0,
        lengthX: fanLen,
        depthZ: fanDepth,
        tierCount: stepCount,
        stepHeight: stepH,
        stepDepth: stepD,
        frontTierOffsetZ: 0.95,
        accentHex: palette.accentHex,
        secondaryHex: palette.structureDarkHex,
      },
      undefined,
      weatherUniforms,
    );

    parentGroup.add(zGroup);
    worldColliders.addObb(
      c.wx,
      c.wz,
      fanLen * 0.5 + 1.0,
      fanDepth * 0.5 + 1.0,
      xVec.x,
      xVec.z,
      'concrete',
      c.wy - 2.0,
      c.wy + 6.5,
    );

    zones.push({
      worldX: c.wx,
      worldZ: c.wz,
      group: zGroup,
      crowdRig,
      light: flood,
    });
  }

  plinthGeo.dispose();
  tierGeo.dispose();
  railGeo.dispose();
  fasciaGeo.dispose();
  postGeo.dispose();

  const addMergedFanGroup = (parts: THREE.BufferGeometry[], mat: THREE.Material, castShadow: boolean, receiveShadow: boolean) => {
    if (parts.length === 0) return;
    const merged = trackGeo(BufferGeometryUtils.mergeGeometries(parts, false));
    parts.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    fanContainer.add(mesh);
  };
  addMergedFanGroup(plinthParts, plinthMat, true, true);
  addMergedFanGroup(tierParts, tierMat, true, true);
  addMergedFanGroup(railParts, glassMat, false, false);
  addMergedFanGroup(fasciaParts, fasciaMat, false, false);
  addMergedFanGroup(postParts, frameMat, true, false);

  return {
    update: (deltaSec: number, elapsedSec: number, telemetry: CrowdTelemetryInput) => {
      const px = telemetry.playerPos?.x;
      const pz = telemetry.playerPos?.z;
      for (let i = 0; i < zones.length; i++) {
        const z = zones[i];
        const dist =
          px !== undefined && pz !== undefined
            ? Math.hypot(px - z.worldX, pz - z.worldZ)
            : telemetry.playerDistToGrandstand;
        z.crowdRig.update(deltaSec, elapsedSec, telemetry, dist);
      }
    },
    setNightFactor: (nightFactor: number) => {
      fasciaMat.emissiveIntensity = 0.12 + nightFactor * 1.4;
      const showPl = nightFactor > 0.01;
      for (let i = 0; i < zones.length; i++) {
        zones[i].light.intensity = nightFactor * 2.4;
        zones[i].light.visible = showPl;
      }
    },
    setWireframe: (wire: boolean) => {
      plinthMat.wireframe = wire;
      tierMat.wireframe = wire;
      frameMat.wireframe = wire;
      fasciaMat.wireframe = wire;
      for (let i = 0; i < zones.length; i++) {
        zones[i].crowdRig.setWireframe(wire);
      }
    },
    dispose: () => {
      parentGroup.remove(fanContainer);
      for (let i = 0; i < zones.length; i++) {
        zones[i].crowdRig.dispose();
        parentGroup.remove(zones[i].group);
      }
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}
