import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getCircuitData,
  SHOULDER_WIDTH,
  WATER_LEVEL,
} from './circuitSpline';
import { createSeededRandom, lerp } from '../../engine/mathNoise';
import { ProceduralTextureSuite } from './proceduralTextures';
import { type WeatherUniforms } from './skyAndLighting';
import { groundHeightAt, groundNormalAt } from './terrainField';
import { worldColliders } from './worldColliders';
import {
  buildGrandstandCrowdRig,
  type CrowdTelemetryInput,
} from '../sharedGrandstandCrowd';
import { buildCornerFanZoneRigs } from '../sharedTracksideKit';

export interface LandmarksAndCampusRig {
  group: THREE.Group;
  update: (elapsedSec: number, deltaSec?: number, crowdInput?: CrowdTelemetryInput) => void;
  setNightFactor: (nightFactor: number) => void;
  setWireframe: (wire: boolean) => void;
  getGrandstandWorldPos?: () => THREE.Vector3 | null;
  dispose: () => void;
}

/**
 * Builds Level 2 Real-World Structures & Natural Landmarks around Aurelia Ridge:
 * 1. Dedicated Pit-Lane Asphalt Apron (entry/exit tapers, empty pit boxes, Pit Wall, catch-fence)
 * 2. 6-Bay Team Paddock Garages (concrete podium, open dark bays, illuminated glass hospitality)
 * 3. Covered Spectator Grandstand overlooking Pit Straight / Turn 1
 * 4. 5 Corner Marshal Towers with GPU wind-animated flags
 * 5. Natural Limestone Canyon Rock Arch spanning North Summit Crest (16.5m+ clearance)
 * 6. Cascading Alpine Gorge Waterfall & Splash Mist plunging into the central lake
 * 7. Distant Alpine Valley Village (34 hillside chalets with lit night windows) &
 *    7 High-Voltage Steel Lattice Power Transmission Pylons + sagging catenary wires
 */
export function buildLandmarksAndCampusRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): LandmarksAndCampusRig {
  const group = new THREE.Group();
  group.name = 'LandmarksAndCampusRig';

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
  const rand = createSeededRandom(55109);

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const disposableTex: THREE.Texture[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };

  const wireframeMats: THREE.MeshStandardMaterial[] = [];
  const registerWire = <T extends THREE.MeshStandardMaterial>(m: T): T => {
    wireframeMats.push(m);
    return trackMat(m);
  };

  const concreteMat = registerWire(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.concreteNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.82,
      metalness: 0.04,
    }),
  );
  concreteMat.onBeforeCompile = (shader) => {
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
        diffuseColor.rgb *= mix(1.0, 0.68, uWetness);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.32, uWetness * 0.82);`,
      );
  };
  concreteMat.customProgramCacheKey = () => 'aurelia-campus-concrete-wet-v1';

  const darkSteelMat = registerWire(
    new THREE.MeshStandardMaterial({
      color: 0x20262f,
      roughness: 0.38,
      metalness: 0.72,
      envMapIntensity: 1.15,
    }),
  );

  const brushedSteelMat = registerWire(
    new THREE.MeshStandardMaterial({
      color: 0xaab4c0,
      roughness: 0.3,
      metalness: 0.86,
      envMapIntensity: 1.25,
    }),
  );

  const amberTrimMat = registerWire(
    new THREE.MeshStandardMaterial({
      color: 0xe69517,
      roughness: 0.36,
      metalness: 0.25,
    }),
  );

  const pitCanopyRoofMat = registerWire(
    new THREE.MeshStandardMaterial({
      color: 0x2f353f,
      roughness: 0.55,
      metalness: 0.45,
    }),
  );

  const garageLightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfff0d4,
      emissive: 0xffd28c,
      emissiveIntensity: 0.25,
      roughness: 0.2,
    }),
  );

  const hospitalityGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x223644,
      emissive: 0xffb75c,
      emissiveIntensity: 0.06,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
    }),
  );

  const nightSpotLights: THREE.PointLight[] = [];

  // ---------------------------------------------------------------------------
  // 1. DEDICATED PIT-LANE APRON & 6-BAY TEAM PADDOCK GARAGES (North of Pit Straight)
  // ---------------------------------------------------------------------------
  const pitApronMat = registerWire(
    new THREE.MeshStandardMaterial({
      map: textures.asphaltAlbedo,
      normalMap: textures.asphaltNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: textures.asphaltRoughness,
      roughness: 0.95,
      metalness: 0.04,
      envMapIntensity: 1.1,
    }),
  );
  pitApronMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = sharedWeather.uWetness;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPitWorldPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPitWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWetness;
        varying vec3 vPitWorldPos;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float puddlePit = smoothstep(0.45, 0.78, 0.5 + 0.5 * sin(vPitWorldPos.x * 0.14) * cos(vPitWorldPos.z * 0.18));
        diffuseColor.rgb *= mix(1.0, mix(0.56, 0.42, puddlePit), uWetness);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float puddlePitR = smoothstep(0.45, 0.78, 0.5 + 0.5 * sin(vPitWorldPos.x * 0.14) * cos(vPitWorldPos.z * 0.18));
        roughnessFactor = mix(roughnessFactor, mix(0.28, 0.045, puddlePitR), uWetness * 0.95);`,
      );
  };
  pitApronMat.customProgramCacheKey = () => 'aurelia-pit-apron-wet-v1';

  const pitGroup = new THREE.Group();
  pitGroup.name = 'PitLaneCampus';

  // Main Pit Apron slab (flush at y = 19.99, matching graded terrace shelf)
  const pitSlabGeo = trackGeo(new THREE.BoxGeometry(200, 0.45, 16.5));
  {
    const uvAttr = pitSlabGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uvAttr.count; i++) {
      uvAttr.setXY(i, uvAttr.getX(i) * 12, uvAttr.getY(i) * 1.3);
    }
    uvAttr.needsUpdate = true;
  }
  const pitSlab = new THREE.Mesh(pitSlabGeo, pitApronMat);
  pitSlab.position.set(-14, 19.775, 223.8);
  pitSlab.receiveShadow = true;
  pitGroup.add(pitSlab);

  // Tapered Pit Entry (West, x = -132 -> -114) & Pit Exit (East, x = 86 -> 104) asphalt wedges
  const buildPitTaper = (xStart: number, xEnd: number) => {
    const taperGeo = new THREE.PlaneGeometry(Math.abs(xEnd - xStart), 13.5, 8, 2);
    taperGeo.rotateX(-Math.PI / 2);
    const pos = taperGeo.attributes.position as THREE.BufferAttribute;
    const isEntry = xStart < 0;
    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const u = (lx + Math.abs(xEnd - xStart) * 0.5) / Math.abs(xEnd - xStart);
      const t = isEntry ? u : 1 - u;
      const worldX = lerp(xStart, xEnd, u);
      const targetZ = lerp(231.0, 223.8 + lz * 0.65, t);
      pos.setXYZ(i, worldX, 19.995, targetZ);
    }
    taperGeo.computeVertexNormals();
    return trackGeo(taperGeo);
  };
  const entryTaper = new THREE.Mesh(buildPitTaper(-132, -110), pitApronMat);
  entryTaper.receiveShadow = true;
  const exitTaper = new THREE.Mesh(buildPitTaper(84, 106), pitApronMat);
  exitTaper.receiveShadow = true;
  pitGroup.add(entryTaper, exitTaper);

  // Painted Pit-Lane White Speed Line & 6 Yellow Empty Pit-Box Markings
  const paintWhiteMat = registerWire(
    new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.65 }),
  );
  const paintYellowMat = registerWire(
    new THREE.MeshStandardMaterial({ color: 0xf4b41a, roughness: 0.62 }),
  );

  const speedLine = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(186, 0.24)), paintWhiteMat);
  speedLine.rotation.x = -Math.PI / 2;
  speedLine.position.set(-14, 20.015, 226.8);
  pitGroup.add(speedLine);

  const boxWidth = 10.5;
  const boxDepth = 4.2;
  const boxCentersX = [-72, -48, -24, 0, 24, 48];
  const pitLineGeos: THREE.BufferGeometry[] = [];
  for (const bx of boxCentersX) {
    const front = new THREE.PlaneGeometry(0.22, boxDepth);
    front.rotateX(-Math.PI / 2);
    front.translate(bx + boxWidth * 0.5, 20.016, 221.6);
    const back = new THREE.PlaneGeometry(0.22, boxDepth);
    back.rotateX(-Math.PI / 2);
    back.translate(bx - boxWidth * 0.5, 20.016, 221.6);
    const inner = new THREE.PlaneGeometry(boxWidth, 0.22);
    inner.rotateX(-Math.PI / 2);
    inner.translate(bx, 20.016, 223.7);
    pitLineGeos.push(front, back, inner);
  }
  const mergedPitLines = trackGeo(BufferGeometryUtils.mergeGeometries(pitLineGeos, false));
  for (const g of pitLineGeos) g.dispose();
  pitGroup.add(new THREE.Mesh(mergedPitLines, paintYellowMat));

  // High-visibility Pit Entry chevrons & illuminated Pit Box service overhead beacons
  const pitBeaconMat = registerWire(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.65,
      roughness: 0.2,
    }),
  );
  const pitAmberSignMat = registerWire(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 1.5,
      roughness: 0.25,
    }),
  );
  for (let c = 0; c < 4; c++) {
    const chev = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(3.2, 0.36)),
      pitAmberSignMat,
    );
    chev.rotation.x = -Math.PI / 2;
    chev.rotation.z = -0.35;
    chev.position.set(-129 + c * 6.5, 20.025, 229.6 - c * 1.1);
    pitGroup.add(chev);
  }
  // West Pit Entry Signal Portal (x = -114, spanning Pit Lane z = 216.5..229.5)
  const portalLegGeo = trackGeo(new THREE.BoxGeometry(0.45, 5.2, 0.45));
  const portalLegL = new THREE.Mesh(portalLegGeo, darkSteelMat);
  portalLegL.position.set(-112, 22.6, 217.0);
  const portalLegR = new THREE.Mesh(portalLegGeo, darkSteelMat);
  portalLegR.position.set(-112, 22.6, 229.4);
  const portalBeam = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.55, 0.9, 13.0)),
    darkSteelMat,
  );
  portalBeam.position.set(-112, 25.0, 223.2);
  const portalSign = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.62, 0.52, 5.4)),
    pitAmberSignMat,
  );
  portalSign.position.set(-112, 25.0, 223.2);
  pitGroup.add(portalLegL, portalLegR, portalBeam, portalSign);

  // Illuminated Pit Box Service Overhead Markers
  const boxBeaconGeo = trackGeo(new THREE.BoxGeometry(4.2, 0.16, 0.28));
  for (const bx of boxCentersX) {
    const marker = new THREE.Mesh(boxBeaconGeo, pitBeaconMat);
    marker.position.set(bx, 24.1, 221.6);
    pitGroup.add(marker);
  }

  // Concrete Pit Wall separating Pit Straight (z = 240) from Pit Lane (z = 223.8)
  const pitWallGeo = trackGeo(new THREE.BoxGeometry(178, 1.55, 0.78));
  const pitWallMesh = new THREE.Mesh(pitWallGeo, concreteMat);
  pitWallMesh.position.set(-14, 20.32, 230.2);
  pitWallMesh.castShadow = true;
  pitWallMesh.receiveShadow = true;
  pitGroup.add(pitWallMesh);
  worldColliders.addObb(-14, 230.2, 89.2, 0.46, 1, 0, 'concrete', 18.0, 26.0);

  // Pit-Wall Debris Fence Stanchions + Horizontal Cables
  const pwPostGeo = trackGeo(new THREE.BoxGeometry(0.12, 2.2, 0.14));
  const pwCableGeo = trackGeo(new THREE.BoxGeometry(176, 0.04, 0.04));
  const pwPostGeos: THREE.BufferGeometry[] = [];
  for (let px = -100; px <= 72; px += 8) {
    const g = pwPostGeo.clone();
    g.translate(px, 21.6, 230.2);
    pwPostGeos.push(g);
  }
  for (const cy of [21.35, 21.85, 22.35]) {
    const c = pwCableGeo.clone();
    c.translate(-14, cy, 230.2);
    pwPostGeos.push(c);
  }
  const mergedPwFence = trackGeo(BufferGeometryUtils.mergeGeometries(pwPostGeos, false));
  for (const g of pwPostGeos) g.dispose();
  const pwFenceMesh = new THREE.Mesh(mergedPwFence, brushedSteelMat);
  pwFenceMesh.castShadow = true;
  pitGroup.add(pwFenceMesh);

  // 6 Pit-Wall Strategist Timing Consoles (inside pit wall z = 228.5 facing garage bays)
  const consoleParts: THREE.BufferGeometry[] = [];
  const consoleScreenParts: THREE.BufferGeometry[] = [];
  for (const bx of boxCentersX) {
    const desk = new THREE.BoxGeometry(4.2, 1.05, 1.15);
    desk.translate(bx, 20.52, 228.65);
    consoleParts.push(desk);
    const roof = new THREE.BoxGeometry(4.8, 0.16, 1.9);
    roof.translate(bx, 22.45, 228.7);
    consoleParts.push(roof);
    for (const px of [-2.05, 2.05]) {
      const col = new THREE.BoxGeometry(0.12, 2.45, 0.14);
      col.translate(bx + px, 21.22, 229.25);
      consoleParts.push(col);
    }
    const screen = new THREE.BoxGeometry(3.4, 0.42, 0.08);
    screen.rotateX(-0.35);
    screen.translate(bx, 21.28, 228.5);
    consoleScreenParts.push(screen);
  }
  const mergedConsoles = trackGeo(BufferGeometryUtils.mergeGeometries(consoleParts, false));
  for (const g of consoleParts) g.dispose();
  const consolesMesh = new THREE.Mesh(mergedConsoles, darkSteelMat);
  consolesMesh.castShadow = true;
  consolesMesh.receiveShadow = true;
  pitGroup.add(consolesMesh);

  const mergedConsoleScreens = trackGeo(BufferGeometryUtils.mergeGeometries(consoleScreenParts, false));
  for (const g of consoleScreenParts) g.dispose();
  pitGroup.add(new THREE.Mesh(mergedConsoleScreens, pitBeaconMat));

  // 6-Bay Team Paddock Garages (z = 201..216.2, x = -90..66) anchored down to y = 6.0
  const garX = -12;
  const garZ = 208.5;
  const garLen = 156;
  const garDepth = 15.0;

  const garPodiumGeo = trackGeo(new THREE.BoxGeometry(garLen + 4, 14.1, garDepth + 3.5));
  const garPodium = new THREE.Mesh(garPodiumGeo, concreteMat);
  garPodium.position.set(garX, 13.0, garZ);
  garPodium.castShadow = true;
  garPodium.receiveShadow = true;
  pitGroup.add(garPodium);
  worldColliders.addObb(garX, garZ - 0.5, garLen * 0.5 + 0.8, garDepth * 0.5 + 0.6, 1, 0, 'concrete', 14.0, 30.0);

  // Garage Rear Core & Side Partition Walls (dark recessed bays facing Pit Lane +Z)
  const garBackWall = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garLen, 4.4, 2.4)),
    concreteMat,
  );
  garBackWall.position.set(garX, 22.25, garZ - garDepth * 0.5 + 1.2);
  garBackWall.castShadow = true;
  garBackWall.receiveShadow = true;
  pitGroup.add(garBackWall);

  const bayColGeos: THREE.BufferGeometry[] = [];
  const bayShutterGeos: THREE.BufferGeometry[] = [];
  const bayLightGeos: THREE.BufferGeometry[] = [];
  const bayInteriorDarkMat = registerWire(
    new THREE.MeshStandardMaterial({ color: 0x0e1118, roughness: 0.88, metalness: 0.16 }),
  );
  const bayShutterMat = registerWire(
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.44, metalness: 0.72 }),
  );
  const bayInteriorFloor = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garLen - 2, 0.2, garDepth - 2)),
    bayInteriorDarkMat,
  );
  bayInteriorFloor.position.set(garX, 20.1, garZ);
  bayInteriorFloor.receiveShadow = true;
  pitGroup.add(bayInteriorFloor);

  for (let b = 0; b <= 6; b++) {
    const colX = -88 + b * 25.33;
    // Front & mid steel piers
    for (const cz of [garZ + garDepth * 0.5 - 0.6, garZ]) {
      const col = new THREE.BoxGeometry(0.95, 4.5, 0.95);
      col.translate(colX, 22.3, cz);
      bayColGeos.push(col);
    }
    if (b < 6) {
      const centerBayX = colX + 12.66;
      const strip = new THREE.BoxGeometry(16.0, 0.14, 0.5);
      strip.translate(centerBayX, 24.15, garZ + garDepth * 0.5 - 1.4);
      bayLightGeos.push(strip);

      // Partially raised corrugated roll-up shutter lintel + interior mechanic workbench
      const shutter = new THREE.BoxGeometry(22.6, 1.15, 0.36);
      shutter.translate(centerBayX, 23.95, garZ + garDepth * 0.5 - 0.42);
      bayShutterGeos.push(shutter);

      const bench = new THREE.BoxGeometry(10.5, 1.05, 1.45);
      bench.translate(centerBayX, 20.52, garZ - garDepth * 0.5 + 3.2);
      bayShutterGeos.push(bench);

      // Partition divider behind garage face
      if (b > 0) {
        const divWall = new THREE.BoxGeometry(0.5, 4.25, garDepth - 3.6);
        divWall.translate(colX, 22.15, garZ - 0.6);
        bayColGeos.push(divWall);
      }
    }
  }
  const mergedCols = trackGeo(BufferGeometryUtils.mergeGeometries(bayColGeos, false));
  for (const g of bayColGeos) g.dispose();
  const bayColsMesh = new THREE.Mesh(mergedCols, darkSteelMat);
  bayColsMesh.castShadow = true;
  bayColsMesh.receiveShadow = true;
  pitGroup.add(bayColsMesh);

  const mergedShutters = trackGeo(BufferGeometryUtils.mergeGeometries(bayShutterGeos, false));
  for (const g of bayShutterGeos) g.dispose();
  const bayShuttersMesh = new THREE.Mesh(mergedShutters, bayShutterMat);
  bayShuttersMesh.castShadow = true;
  pitGroup.add(bayShuttersMesh);

  const mergedBayLights = trackGeo(BufferGeometryUtils.mergeGeometries(bayLightGeos, false));
  for (const g of bayLightGeos) g.dispose();
  pitGroup.add(new THREE.Mesh(mergedBayLights, garageLightMat));

  // Upper Paddock Hospitality Level (Glass facade + VIP Balcony Rail + Steel slab + Cantilevered Pit Canopy)
  const midSlab = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garLen + 2, 0.65, garDepth + 3.6)),
    darkSteelMat,
  );
  midSlab.position.set(garX, 24.7, garZ + 1.2);
  midSlab.castShadow = true;
  pitGroup.add(midSlab);

  const hospGlass = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garLen - 4, 3.2, garDepth - 2.2)),
    hospitalityGlassMat,
  );
  hospGlass.position.set(garX, 26.6, garZ - 0.4);
  pitGroup.add(hospGlass);

  const vipBalconyRail = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garLen + 1.5, 1.05, 0.14)),
    hospitalityGlassMat,
  );
  vipBalconyRail.position.set(garX, 25.55, garZ + garDepth * 0.5 + 2.8);
  pitGroup.add(vipBalconyRail);

  const garRoof = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garLen + 4, 0.55, garDepth + 5.8)),
    pitCanopyRoofMat,
  );
  garRoof.position.set(garX, 28.45, garZ + 2.0);
  garRoof.castShadow = true;
  pitGroup.add(garRoof);

  const garRoofTrim = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(garLen + 4.2, 0.28, 0.45)),
    amberTrimMat,
  );
  garRoofTrim.position.set(garX, 28.45, garZ + 2.0 + (garDepth + 5.8) * 0.5);
  pitGroup.add(garRoofTrim);

  // Race Control & Timing Pavilion on West Pit Entry Flank (x = -104, z = 208.5)
  const rcX = -104;
  const rcZ = 208.5;
  const rcPlinth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.5, 16.0, 15.0)), concreteMat);
  rcPlinth.position.set(rcX, 15.4, rcZ);
  rcPlinth.castShadow = true;
  rcPlinth.receiveShadow = true;
  const rcDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.6, 0.55, 16.6)), darkSteelMat);
  rcDeck.position.set(rcX, 23.55, rcZ + 0.5);
  rcDeck.castShadow = true;
  const rcGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.0, 3.8, 14.8)), hospitalityGlassMat);
  rcGlass.position.set(rcX, 25.7, rcZ + 0.5);
  const rcRoof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.6, 0.52, 17.8)), brushedSteelMat);
  rcRoof.position.set(rcX, 27.85, rcZ + 0.8);
  rcRoof.castShadow = true;
  const rcTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.7, 0.24, 17.9)), amberTrimMat);
  rcTrim.position.set(rcX, 27.52, rcZ + 0.8);
  const rcMast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.1, 0.18, 5.2, 8)), brushedSteelMat);
  rcMast.position.set(rcX - 2.2, 30.4, rcZ - 3.0);
  rcMast.castShadow = true;
  pitGroup.add(rcPlinth, rcDeck, rcGlass, rcRoof, rcTrim, rcMast);
  worldColliders.addObb(rcX, rcZ, 6.4, 8.2, 1, 0, 'concrete', 14.0, 32.0);

  for (const lx of [-55, -12, 32]) {
    const pLight = new THREE.PointLight(0xffcf88, 0, 58, 1.5);
    pLight.position.set(lx, 23.8, 219.5);
    pLight.visible = false;
    pitGroup.add(pLight);
    nightSpotLights.push(pLight);
  }
  group.add(pitGroup);

  // ---------------------------------------------------------------------------
  // 2. 10-TIER COVERED OPPOSITE MAIN GRANDSTAND + BROADCAST JUMBOTRON
  // ---------------------------------------------------------------------------
  const gsGroup = new THREE.Group();
  gsGroup.name = 'MainGrandstand';
  const gsX = -8;
  const gsZ = 276;
  const gsLen = 96;
  const gsDepth = 22;

  // Grounded concrete retaining podium extending down to y = 6.0 (zero floating corners)
  const gsPodium = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(gsLen + 4, 14.8, gsDepth + 4)),
    concreteMat,
  );
  gsPodium.position.set(gsX, 13.0, gsZ);
  gsPodium.castShadow = true;
  gsPodium.receiveShadow = true;
  gsGroup.add(gsPodium);
  worldColliders.addObb(gsX, gsZ, gsLen * 0.5 + 1.5, gsDepth * 0.5 + 1.5, 1, 0, 'concrete', 14.0, 36.0);

  // 10 Stepped Seating Tiers & 4 Concrete Access Stairways facing North (-Z) toward Pit Straight
  const tierSeatMat = registerWire(
    new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.68, metalness: 0.1 }),
  );
  const gsStairMat = registerWire(
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.84, metalness: 0.08 }),
  );
  const tierGeos: THREE.BufferGeometry[] = [];
  const stairGeos: THREE.BufferGeometry[] = [];
  const stepCount = 10;
  const stepH = 0.62;
  const stepD = 1.9;
  const frontTierOffsetZ = 1.6;
  for (let sIdx = 0; sIdx < stepCount; sIdx++) {
    const tz = gsZ - gsDepth * 0.5 + frontTierOffsetZ + sIdx * stepD;
    const ty = 20.6 + sIdx * stepH;
    const stepGeo = new THREE.BoxGeometry(gsLen - 2, stepH + sIdx * 0.08, stepD + 0.08);
    stepGeo.translate(gsX, ty, tz);
    tierGeos.push(stepGeo);

    for (const sxOff of [-38, -18, 18, 38]) {
      const st = new THREE.BoxGeometry(1.75, stepH + 0.06, stepD + 0.14);
      st.translate(gsX + sxOff, ty + 0.04, tz);
      stairGeos.push(st);
    }
  }
  const mergedTiers = trackGeo(BufferGeometryUtils.mergeGeometries(tierGeos, false));
  for (const g of tierGeos) g.dispose();
  const tiersMesh = new THREE.Mesh(mergedTiers, tierSeatMat);
  tiersMesh.castShadow = true;
  tiersMesh.receiveShadow = true;
  gsGroup.add(tiersMesh);

  const mergedStairs = trackGeo(BufferGeometryUtils.mergeGeometries(stairGeos, false));
  for (const g of stairGeos) g.dispose();
  const stairsMesh = new THREE.Mesh(mergedStairs, gsStairMat);
  stairsMesh.receiveShadow = true;
  gsGroup.add(stairsMesh);

  // Back wall + Steel Raker Columns + Cantilevered Canopy Roof + Fascia Trim
  const gsBackWall = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(gsLen + 1, 10.6, 1.2)),
    concreteMat,
  );
  gsBackWall.position.set(gsX, 25.5, gsZ + gsDepth * 0.5 - 0.55);
  gsBackWall.castShadow = true;
  gsGroup.add(gsBackWall);

  const gsColGeos: THREE.BufferGeometry[] = [];
  for (let colX = gsX - gsLen * 0.46; colX <= gsX + gsLen * 0.46 + 0.1; colX += gsLen * 0.115) {
    const post = new THREE.BoxGeometry(0.66, 12.4, 0.85);
    post.translate(colX, 26.4, gsZ + gsDepth * 0.5 - 1.15);
    gsColGeos.push(post);

    const truss = new THREE.BoxGeometry(0.46, 0.78, gsDepth + 4.8);
    truss.rotateX(-0.085);
    truss.translate(colX, 31.95, gsZ - 1.3);
    gsColGeos.push(truss);
  }
  const mergedGsCols = trackGeo(BufferGeometryUtils.mergeGeometries(gsColGeos, false));
  for (const g of gsColGeos) g.dispose();
  const gsColsMesh = new THREE.Mesh(mergedGsCols, darkSteelMat);
  gsColsMesh.castShadow = true;
  gsGroup.add(gsColsMesh);

  const gsCanopy = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(gsLen + 5, 0.46, gsDepth + 5.6)),
    pitCanopyRoofMat,
  );
  gsCanopy.rotation.x = -0.085;
  gsCanopy.position.set(gsX, 32.55, gsZ - 1.3);
  gsCanopy.castShadow = true;
  gsGroup.add(gsCanopy);

  const gsFascia = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(gsLen + 5.2, 0.42, 0.36)),
    amberTrimMat,
  );
  gsFascia.position.set(gsX, 31.4, gsZ - gsDepth * 0.5 - 3.9);
  gsGroup.add(gsFascia);

  const gsFrontRail = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(gsLen - 2, 1.1, 0.14)),
    hospitalityGlassMat,
  );
  gsFrontRail.position.set(gsX, 20.8, gsZ - gsDepth * 0.5 + 0.75);
  gsGroup.add(gsFrontRail);

  // Trackside Elevated Broadcast Jumbotron Tower flanking West wing of Opposite Grandstand
  const jumboCanvas = document.createElement('canvas');
  jumboCanvas.width = 512;
  jumboCanvas.height = 256;
  const jCtx = jumboCanvas.getContext('2d');
  if (jCtx) {
    jCtx.fillStyle = '#070b12';
    jCtx.fillRect(0, 0, 512, 256);
    jCtx.fillStyle = '#f59e0b';
    jCtx.fillRect(0, 0, 512, 42);
    jCtx.fillStyle = '#070b12';
    jCtx.font = 'bold 24px sans-serif';
    jCtx.textBaseline = 'middle';
    jCtx.fillText('FIA GT TELEMETRY // AURELIA RIDGE', 18, 22);
    jCtx.fillStyle = '#111827';
    jCtx.fillRect(16, 56, 310, 182);
    jCtx.fillRect(340, 56, 156, 182);
    const rows = [
      ['P1', 'A. VANCE', '1:22.840'],
      ['P2', 'K. MORI', '+0.388'],
      ['P3', 'L. ROSSI', '+0.942'],
      ['P4', 'M. SOLBERG', '+1.615'],
      ['P5', 'S. KLINE', '+2.190'],
    ];
    jCtx.font = 'bold 18px monospace';
    rows.forEach(([pos, name, gap], idx) => {
      const yy = 78 + idx * 32;
      jCtx.fillStyle = idx === 0 ? '#f59e0b' : '#e2e8f0';
      jCtx.fillText(pos, 26, yy);
      jCtx.fillStyle = '#f8fafc';
      jCtx.fillText(name, 74, yy);
      jCtx.fillStyle = idx === 0 ? '#34d399' : '#94a3b8';
      jCtx.fillText(gap, 214, yy);
    });
    jCtx.fillStyle = '#f59e0b';
    jCtx.font = 'bold 16px sans-serif';
    jCtx.fillText('TRACK STATUS', 354, 82);
    jCtx.fillStyle = '#10b981';
    jCtx.fillRect(354, 96, 128, 30);
    jCtx.fillStyle = '#052e16';
    jCtx.font = 'bold 16px monospace';
    jCtx.fillText('GREEN FLAG', 366, 112);
    jCtx.fillStyle = '#94a3b8';
    jCtx.font = '14px monospace';
    jCtx.fillText('SECTOR 1 · LIVE', 354, 158);
    jCtx.fillText('DRS ENABLED', 354, 186);
    jCtx.fillText('PIT LANE OPEN', 354, 214);
  }
  const jumboTex = new THREE.CanvasTexture(jumboCanvas);
  jumboTex.colorSpace = THREE.SRGBColorSpace;
  jumboTex.anisotropy = Math.min(8, textures.gantryBannerAlbedo.anisotropy || 4);
  jumboTex.needsUpdate = true;
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
  jumboTower.position.set(gsX - gsLen * 0.5 - 11.5, 20.2, gsZ - 2.5);
  const jPylon = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.4, 15.0, 1.4)), darkSteelMat);
  jPylon.position.y = 4.0;
  jPylon.castShadow = true;
  const jBezel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(15.6, 8.2, 0.9)), darkSteelMat);
  jBezel.position.y = 11.5;
  jBezel.castShadow = true;
  const jFace = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(14.6, 7.3)), jumboMat);
  jFace.position.set(0, 11.5, -0.48);
  jFace.rotation.y = Math.PI;
  jumboTower.add(jPylon, jBezel, jFace);
  gsGroup.add(jumboTower);

  for (const lx of [-28, 0, 28]) {
    const gsNightLight = new THREE.PointLight(0xffd088, 0, 76, 1.45);
    gsNightLight.position.set(gsX + lx, 30.8, gsZ - 2.4);
    gsNightLight.visible = false;
    gsGroup.add(gsNightLight);
    nightSpotLights.push(gsNightLight);
  }

  const gsWorldPos = new THREE.Vector3(gsX, 20.5, gsZ);
  const crowdRig = buildGrandstandCrowdRig(
    {
      parentGroup: gsGroup,
      centerX: gsX,
      baseY: 20.78,
      centerZ: gsZ,
      lengthX: gsLen,
      depthZ: gsDepth,
      tierCount: stepCount,
      stepHeight: stepH,
      stepDepth: stepD,
      frontTierOffsetZ,
      accentHex: 0xf59e0b,
      secondaryHex: 0x1e293b,
    },
    undefined,
    sharedWeather,
  );
  const cornerFanZones = buildCornerFanZoneRigs(
    group,
    sharedWeather,
    WATER_LEVEL,
    'aurelia_ridge',
  );
  group.add(gsGroup);

  // ---------------------------------------------------------------------------
  // 3. CORNER MARSHAL TOWERS + GLOBAL-WIND PBR CLOTH FLAGS (5 Corners)
  // ---------------------------------------------------------------------------
  const flagNightUniform = { value: 0 };
  const flagMat = registerWire(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.04,
      side: THREE.DoubleSide,
    }),
  );
  flagMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sharedWeather.uTime;
    shader.uniforms.uWetness = sharedWeather.uWetness;
    shader.uniforms.uWindSpeed = sharedWeather.uWindSpeed;
    shader.uniforms.uWindDir = sharedWeather.uWindDir;
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

          // Align loose fabric trail toward the true 3D global wind vector while fluttering perpendicularly
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
        // Crisp woven motorsport safety/checkered pennant with hoist reinforcement seam
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
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.42, uWetness * 0.75);`,
      );
  };
  flagMat.customProgramCacheKey = () => 'aurelia-marshal-cloth-pbr-v2';

  const marshalFractions = [0.16, 0.41, 0.57, 0.74, 0.91];
  const marshalConcreteGeos: THREE.BufferGeometry[] = [];
  const marshalSteelGeos: THREE.BufferGeometry[] = [];
  const marshalGlassGeos: THREE.BufferGeometry[] = [];
  const marshalTrimGeos: THREE.BufferGeometry[] = [];

  for (const frac of marshalFractions) {
    const idx = Math.floor(frac * N) % N;
    const s = samples[idx];
    if (s.isBridge) continue;
    const outSide = s.curvature >= 0 ? 1 : -1;
    const lat = outSide * (circuit.roadHalfWidth + SHOULDER_WIDTH + 5.2);
    const mx = s.position.x + s.right.x * lat;
    const mz = s.position.z + s.right.z * lat;
    const my = groundHeightAt(mx, mz);

    const basis = new THREE.Matrix4().makeBasis(
      s.right.clone().multiplyScalar(outSide),
      new THREE.Vector3(0, 1, 0),
      s.tangent.clone().multiplyScalar(-outSide),
    );
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);

    const plinth = new THREE.BoxGeometry(3.2, 4.4, 3.2);
    plinth.translate(0, 1.2, 0);
    plinth.applyQuaternion(quat);
    plinth.translate(mx, my, mz);
    marshalConcreteGeos.push(plinth);
    worldColliders.addObb(mx, mz, 1.65, 1.65, s.right.x * outSide, s.right.z * outSide, 'concrete', my - 2, my + 7);

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

    // Finial sphere & twin halyard grommet rings anchoring the cloth hoist edge
    const finial = new THREE.SphereGeometry(0.11, 8, 6);
    finial.translate(-1.1, 10.12, 1.1);
    finial.applyQuaternion(quat);
    finial.translate(mx, my, mz);
    marshalTrimGeos.push(finial);

    for (const ry of [9.02, 9.88]) {
      const grommet = new THREE.TorusGeometry(0.085, 0.02, 6, 10);
      grommet.rotateX(Math.PI * 0.5);
      grommet.translate(-1.1, ry, 1.1);
      grommet.applyQuaternion(quat);
      grommet.translate(mx, my, mz);
      marshalTrimGeos.push(grommet);
    }

    const flagGeo = trackGeo(new THREE.PlaneGeometry(1.9, 1.02, 24, 8));
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
    for (const g of marshalConcreteGeos) g.dispose();
    const mConcMesh = new THREE.Mesh(mConc, concreteMat);
    mConcMesh.castShadow = true;
    mConcMesh.receiveShadow = true;
    group.add(mConcMesh);
  }
  if (marshalSteelGeos.length > 0) {
    const mSteel = trackGeo(BufferGeometryUtils.mergeGeometries(marshalSteelGeos, false));
    for (const g of marshalSteelGeos) g.dispose();
    const mSteelMesh = new THREE.Mesh(mSteel, darkSteelMat);
    mSteelMesh.castShadow = true;
    group.add(mSteelMesh);
  }
  if (marshalTrimGeos.length > 0) {
    const mTrim = trackGeo(BufferGeometryUtils.mergeGeometries(marshalTrimGeos, false));
    for (const g of marshalTrimGeos) g.dispose();
    group.add(new THREE.Mesh(mTrim, amberTrimMat));
  }
  if (marshalGlassGeos.length > 0) {
    const mGlass = trackGeo(BufferGeometryUtils.mergeGeometries(marshalGlassGeos, false));
    for (const g of marshalGlassGeos) g.dispose();
    group.add(new THREE.Mesh(mGlass, hospitalityGlassMat));
  }

  // ---------------------------------------------------------------------------
  // 4. NATURAL LIMESTONE CANYON ROCK ARCH (North Summit Crest, 16.5m+ clearance)
  // ---------------------------------------------------------------------------
  let archIdx = Math.floor(0.65 * N);
  let bestSummitY = -Infinity;
  for (let i = Math.floor(0.6 * N); i < Math.floor(0.72 * N); i++) {
    const s = samples[i % N];
    if (!s.isBridge && s.position.y > bestSummitY && Math.abs(s.curvature) < 0.009) {
      bestSummitY = s.position.y;
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

  const rockArchMat = registerWire(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      normalMap: textures.terrainNormal,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughness: 0.9,
      metalness: 0.03,
    }),
  );
  rockArchMat.onBeforeCompile = (shader) => {
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
        diffuseColor.rgb *= mix(1.0, 0.66, uWetness);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.24, uWetness * 0.85);`,
      );
  };
  rockArchMat.customProgramCacheKey = () => 'aurelia-rock-arch-wet-v1';

  const archGeos: THREE.BufferGeometry[] = [];
  const archSegments = 15;
  const spanHalf = 16.8; // Footings outside road+shoulder+guardrails (+-10.55m)
  const archHeight = 19.2; // 16.5m+ clear tunnel crown over road asphalt

  for (let i = 0; i <= archSegments; i++) {
    const a = (i / archSegments) * Math.PI;
    const lx = Math.cos(a) * spanHalf;
    const ly = Math.sin(a) * archHeight - 2.0; // Anchor feet below ground
    const thickness = 5.4 - Math.sin(a) * 1.4 + (rand() - 0.5) * 0.8;
    const depth = 11.5 - Math.sin(a) * 2.5;

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
    segGeo.translate(lx, ly, (rand() - 0.5) * 1.4);
    segGeo.applyQuaternion(archQuat);
    segGeo.translate(archSample.position.x, archSample.position.y, archSample.position.z);
    archGeos.push(segGeo);
  }
  const mergedArch = trackGeo(BufferGeometryUtils.mergeGeometries(archGeos, false));
  for (const g of archGeos) g.dispose();
  const archMesh = new THREE.Mesh(mergedArch, rockArchMat);
  archMesh.castShadow = true;
  archMesh.receiveShadow = true;
  group.add(archMesh);

  // Register solid Limestone Canyon Rock Arch piers on both outer shoulders (leaving tunnel open)
  for (const archSide of [-1, 1] as const) {
    const px = archSample.position.x + archSample.right.x * archSide * spanHalf;
    const pz = archSample.position.z + archSample.right.z * archSide * spanHalf;
    worldColliders.addCircle(px, pz, 4.6, 'rock', archSample.position.y - 4.0, archSample.position.y + 8.5);
  }

  // Subtle night portal uplight illuminating underside of the limestone canyon arch
  const archNightLight = new THREE.PointLight(0xffb45c, 0, 55, 1.5);
  archNightLight.position.copy(archSample.position).add(new THREE.Vector3(0, 7.5, 0));
  archNightLight.visible = false;
  group.add(archNightLight);
  nightSpotLights.push(archNightLight);

  // ---------------------------------------------------------------------------
  // 5. HYPER-REALISTIC HORSESHOE GORGE WATERFALL & PLUNGE POOL (Beside Bridge)
  // ---------------------------------------------------------------------------
  const wfGroup = new THREE.Group();
  wfGroup.name = 'GorgeWaterfall';
  const wfTopX = 44;
  const wfTopZ = -58;
  const wfBotX = 48;
  const wfBotZ = -25;
  const wfTopY = Math.max(groundHeightAt(wfTopX, wfTopZ) + 1.2, 18.2);

  // Permanent wet-sheen gorge rock material (low roughness + darkened splash stone)
  const wetGorgeRockMat = registerWire(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      normalMap: textures.terrainRockNormal,
      normalScale: new THREE.Vector2(1.45, 1.45),
      color: 0x5c636a,
      roughness: 0.19,
      metalness: 0.08,
      envMapIntensity: 1.4,
    }),
  );

  const gorgeMossMat = registerWire(
    new THREE.MeshStandardMaterial({
      map: textures.terrainGrassAlbedo,
      normalMap: textures.terrainGrassNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      color: 0x2c4b26,
      roughness: 0.24,
      metalness: 0.04,
      envMapIntensity: 1.2,
    }),
  );

  const gorgeCliffGeos: THREE.BufferGeometry[] = [];
  const gorgeMossGeos: THREE.BufferGeometry[] = [];

  // Sculpted horseshoe headwall & stepped cascading rock shelves
  for (let b = 0; b < 5; b++) {
    const angle = ((b - 2) / 2.2) * 0.72;
    const bx = wfTopX + Math.sin(angle) * 8.5;
    const bz = wfTopZ - 4.8 - Math.cos(angle) * 2.8;
    const backRock = new THREE.DodecahedronGeometry(6.8 - Math.abs(b - 2) * 0.65, 2);
    const bPos = backRock.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < bPos.count; v++) {
      const vx = bPos.getX(v);
      const vy = bPos.getY(v);
      const vz = bPos.getZ(v);
      const strata = 0.88 + Math.sin(vy * 2.2 + b) * 0.1 + Math.cos(vx * 1.4 + vz) * 0.08;
      bPos.setXYZ(v, vx * 1.35 * strata, vy * 1.55 * strata, vz * 1.12 * strata);
    }
    backRock.computeVertexNormals();
    backRock.translate(bx, wfTopY - 4.2 - Math.abs(b - 2) * 0.7, bz);
    gorgeCliffGeos.push(backRock);
  }

  // Stepped mid-cascade rock shelves (water strikes and aerates over these ledges)
  for (const shelf of [
    { x: 45.2, y: wfTopY - 6.8, z: -47.5, sx: 4.9, sy: 2.6, sz: 3.5 },
    { x: 47.0, y: WATER_LEVEL + 5.2, z: -36.0, sx: 5.5, sy: 2.8, sz: 3.7 },
    { x: 42.5, y: WATER_LEVEL + 2.2, z: -33.0, sx: 3.2, sy: 3.1, sz: 3.0 },
  ]) {
    const sRock = new THREE.DodecahedronGeometry(1.0, 1);
    sRock.scale(shelf.sx, shelf.sy, shelf.sz);
    sRock.translate(shelf.x, shelf.y, shelf.z);
    gorgeCliffGeos.push(sRock);
  }

  // Wet partially submerged splash boulders framing the plunge pool around (48, WATER_LEVEL, -24)
  for (const splashB of [
    { x: 41.8, y: WATER_LEVEL + 0.35, z: -26.5, r: 2.3 },
    { x: 54.4, y: WATER_LEVEL + 0.45, z: -25.8, r: 2.5 },
    { x: 44.6, y: WATER_LEVEL - 0.15, z: -20.5, r: 1.7 },
    { x: 52.2, y: WATER_LEVEL - 0.1, z: -21.2, r: 1.9 },
  ]) {
    const sb = new THREE.DodecahedronGeometry(splashB.r, 1);
    sb.scale(1.25, 0.78, 1.1);
    sb.rotateY(splashB.x * 0.7);
    sb.translate(splashB.x, splashB.y, splashB.z);
    gorgeCliffGeos.push(sb);
    worldColliders.addCircle(splashB.x, splashB.z, splashB.r * 1.15, 'rock', WATER_LEVEL - 2, WATER_LEVEL + 4);
  }

  // Amphitheater flanking gorge walls + glistening wet moss cushions framing chute
  for (let l = 0; l < 6; l++) {
    const t = l / 5;
    const lx = lerp(wfTopX, wfBotX, t);
    const lz = lerp(wfTopZ, wfBotZ, t);
    const ly = lerp(wfTopY - 1.5, WATER_LEVEL + 0.4, t);
    for (const sideShift of [-6.8 - t * 2.4, 6.8 + t * 2.4]) {
      const cliffBlock = new THREE.DodecahedronGeometry(4.6 - t * 0.4, 1);
      cliffBlock.scale(1.18, 1.42, 1.15);
      cliffBlock.rotateY((l + sideShift) * 0.5);
      cliffBlock.translate(lx + sideShift, ly - 1.2, lz);
      gorgeCliffGeos.push(cliffBlock);

      // Wet emerald moss cushion clinging to spray-zone rock crowns
      const mossPad = new THREE.DodecahedronGeometry(2.45 - t * 0.35, 1);
      mossPad.scale(1.25, 0.52, 1.15);
      mossPad.rotateY(l * 0.9 + sideShift);
      mossPad.translate(lx + sideShift * 0.86, ly + 2.8, lz + (l % 2 === 0 ? 0.6 : -0.5));
      gorgeMossGeos.push(mossPad);
    }
  }

  const mergedWfLedges = trackGeo(BufferGeometryUtils.mergeGeometries(gorgeCliffGeos, false));
  for (const g of gorgeCliffGeos) g.dispose();
  const wfLedgeMesh = new THREE.Mesh(mergedWfLedges, wetGorgeRockMat);
  wfLedgeMesh.castShadow = true;
  wfLedgeMesh.receiveShadow = true;
  wfGroup.add(wfLedgeMesh);

  if (gorgeMossGeos.length > 0) {
    const mergedMoss = trackGeo(BufferGeometryUtils.mergeGeometries(gorgeMossGeos, false));
    for (const g of gorgeMossGeos) g.dispose();
    const mossMesh = new THREE.Mesh(mergedMoss, gorgeMossMat);
    mossMesh.castShadow = true;
    mossMesh.receiveShadow = true;
    wfGroup.add(mossMesh);
  }

  // Build high-density multi-ribbon cascading waterfall geometry helper with normalized flow aNormV
  const buildCascadeRibbon = (
    pts: THREE.Vector3[],
    halfW: number,
    rows: number,
    cols: number,
    uvVScale: number,
  ) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const vertCount = (rows + 1) * cols;
    const pos = new Float32Array(vertCount * 3);
    const uv = new Float32Array(vertCount * 2);
    const normV = new Float32Array(vertCount);
    const idx: number[] = [];

    for (let r = 0; r <= rows; r++) {
      const u = r / rows;
      const pt = curve.getPointAt(u);
      const tan = curve.getTangentAt(u).normalize();
      const right = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
      const widthFlare = 1.0 + u * 0.36;
      for (let c = 0; c < cols; c++) {
        const cu = c / (cols - 1);
        const lat = (cu - 0.5) * 2 * halfW * widthFlare;
        const vi = r * cols + c;
        // Bowed cross-section with slightly scalloped edge drape
        const arch = Math.sin(cu * Math.PI) * 0.28 + Math.cos(u * 12.0 + cu * 5.0) * 0.04;
        pos[vi * 3] = pt.x + right.x * lat;
        pos[vi * 3 + 1] = pt.y + arch;
        pos[vi * 3 + 2] = pt.z + right.z * lat;
        uv[vi * 2] = cu;
        uv[vi * 2 + 1] = u * uvVScale;
        normV[vi] = u;
      }
      if (r < rows) {
        for (let c = 0; c < cols - 1; c++) {
          const a = r * cols + c;
          const b = a + 1;
          const d = (r + 1) * cols + c;
          const e = d + 1;
          idx.push(a, d, b, b, d, e);
        }
      }
    }
    const geo = trackGeo(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aNormV', new THREE.BufferAttribute(normV, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };

  // High-Density Ribbons: Upper Feeder Creek + Primary Main Curtain (72×22) + 2 Stepped Side Chutes (44×14)
  const feederGeo = buildCascadeRibbon(
    [
      new THREE.Vector3(wfTopX - 2.2, wfTopY + 1.6, wfTopZ - 14.0),
      new THREE.Vector3(wfTopX - 1.0, wfTopY + 0.7, wfTopZ - 7.0),
      new THREE.Vector3(wfTopX, wfTopY, wfTopZ + 0.4),
    ],
    2.65,
    36,
    12,
    1.8,
  );
  const mainCurtainGeo = buildCascadeRibbon(
    [
      new THREE.Vector3(wfTopX, wfTopY, wfTopZ),
      new THREE.Vector3(lerp(wfTopX, wfBotX, 0.32), wfTopY - 4.3, lerp(wfTopZ, wfBotZ, 0.3)),
      new THREE.Vector3(lerp(wfTopX, wfBotX, 0.54), wfTopY - 8.1, lerp(wfTopZ, wfBotZ, 0.52)),
      new THREE.Vector3(lerp(wfTopX, wfBotX, 0.78), WATER_LEVEL + 5.9, lerp(wfTopZ, wfBotZ, 0.76)),
      new THREE.Vector3(wfBotX, WATER_LEVEL - 0.55, wfBotZ),
    ],
    3.95,
    72,
    22,
    4.6,
  );
  const leftSideCascadeGeo = buildCascadeRibbon(
    [
      new THREE.Vector3(wfTopX - 4.1, wfTopY - 0.5, wfTopZ + 1.0),
      new THREE.Vector3(wfTopX - 3.6, wfTopY - 6.7, wfTopZ + 12.0),
      new THREE.Vector3(wfBotX - 4.4, WATER_LEVEL - 0.4, wfBotZ - 1.5),
    ],
    1.85,
    44,
    14,
    3.6,
  );
  const rightSideCascadeGeo = buildCascadeRibbon(
    [
      new THREE.Vector3(wfTopX + 4.1, wfTopY - 0.8, wfTopZ + 1.4),
      new THREE.Vector3(wfTopX + 4.4, wfTopY - 7.4, wfTopZ + 13.5),
      new THREE.Vector3(wfBotX + 4.6, WATER_LEVEL - 0.4, wfBotZ - 1.2),
    ],
    1.7,
    44,
    14,
    3.6,
  );

  const wfUniforms = {
    uTime: sharedWeather.uTime,
    uNight: flagNightUniform,
    uWetness: sharedWeather.uWetness,
    uOvercast: sharedWeather.uOvercast,
  };

  const wfMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: wfUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `
        attribute float aNormV;
        uniform float uTime;
        uniform float uWetness;
        varying vec2 vUv;
        varying float vNormV;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying float vSplashHeight;

        float wfDispScalar(float uCoord, float vFlow, float normV) {
          float speed = 2.35 + uWetness * 0.7;
          float tFlow = vFlow - uTime * speed * 2.2;
          // Accelerating gravity waves down the cascade
          float wave1 = sin(uCoord * 18.0 + tFlow * 4.4) * cos(tFlow * 2.6 + uCoord * 6.0) * 0.19;
          float wave2 = sin(uCoord * 31.0 - tFlow * 7.8) * 0.085;
          // Outward splash billows over stepped ledges at 34% and 64% drop
          float ld1 = (normV - 0.34) * 6.5;
          float ld2 = (normV - 0.64) * 6.5;
          float ledge1 = exp(-(ld1 * ld1)) * (0.48 + 0.18 * sin(uCoord * 14.0 - uTime * 9.5));
          float ledge2 = exp(-(ld2 * ld2)) * (0.52 + 0.20 * cos(uCoord * 16.0 - uTime * 11.0));
          float plungeCurl = smoothstep(0.84, 1.0, normV) * (0.36 + 0.14 * sin(uCoord * 22.0 - uTime * 13.0));
          float edgeFlutter = (1.0 - sin(uCoord * 3.14159)) * 0.16 * sin(tFlow * 5.2);
          float startRamp = smoothstep(0.0, 0.12, normV);
          return (wave1 + wave2 + edgeFlutter) * startRamp + ledge1 + ledge2 + plungeCurl;
        }

        void main() {
          vUv = uv;
          vNormV = aNormV;
          float dC = wfDispScalar(uv.x, uv.y, aNormV);
          float dU = wfDispScalar(uv.x + 0.03, uv.y, aNormV);
          float dV = wfDispScalar(uv.x, uv.y + 0.05, clamp(aNormV + 0.014, 0.0, 1.0));
          vSplashHeight = clamp(dC, -0.4, 1.2);

          vec3 p = position + normal * dC;
          // Finite-difference perturbed world normal for crisp glinting cascade ridges
          vec3 rightApprox = normalize(cross(normal, vec3(0.0, 1.0, 0.0)) + vec3(0.0001, 0.0, 0.0001));
          vec3 downApprox = normalize(cross(rightApprox, normal));
          vec3 perturbedN = normalize(normal - rightApprox * ((dU - dC) * 3.6) - downApprox * ((dV - dC) * 3.2));

          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          vWorldNormal = normalize(mat3(modelMatrix) * perturbedN);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uNight;
        uniform float uWetness;
        uniform float uOvercast;
        varying vec2 vUv;
        varying float vNormV;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying float vSplashHeight;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float vNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          float speed = 2.45 + uWetness * 0.72;
          // Gravity-warped acceleration down the sheet
          float flow = vUv.y * (1.0 + vNormV * 0.28) - uTime * speed;
          float streak1 = vNoise(vec2(vUv.x * 16.0, flow * 4.2));
          float streak2 = vNoise(vec2(vUv.x * 34.0 + 3.1, flow * 8.4));
          float streak3 = vNoise(vec2(vUv.x * 64.0 - 1.7, flow * 15.2));
          float filaments = streak1 * 0.46 + streak2 * 0.34 + streak3 * 0.20;

          // Stepped ledge-impact oxygenation bursts matching vertex bulges
          float cr1 = (vNormV - 0.34) * 5.8;
          float cr2 = (vNormV - 0.64) * 5.8;
          float crest1 = exp(-(cr1 * cr1)) * 0.56;
          float crest2 = exp(-(cr2 * cr2)) * 0.62;
          float splashBot = smoothstep(0.76, 1.0, vNormV) * 0.65;
          float lipAeration = (1.0 - smoothstep(0.0, 0.14, vNormV)) * 0.36;
          float crestWhite = clamp(vSplashHeight * 0.45, 0.0, 0.4);

          float foam = smoothstep(0.32, 0.76, filaments + crest1 + crest2 + splashBot + lipAeration + crestWhite);

          vec3 wN = normalize(vWorldNormal);
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(max(1.0 - clamp(abs(dot(wN, viewDir)), 0.0, 1.0), 1e-4), 2.3);

          // Crisp sunlight specular glints on 3D displaced water crests
          vec3 sunDirApprox = normalize(vec3(0.72, 0.48, -0.50));
          vec3 halfV = normalize(sunDirApprox + viewDir);
          float spec = pow(max(dot(wN, halfV), 1e-4), 54.0) * (1.0 - uOvercast * 0.72) * 0.95;

          vec3 deepWater = mix(vec3(0.14, 0.43, 0.49), vec3(0.20, 0.32, 0.38), uOvercast);
          vec3 aeratedFoam = mix(vec3(0.94, 0.98, 1.0), vec3(0.78, 0.84, 0.89), uOvercast * 0.55);
          vec3 col = mix(deepWater, aeratedFoam, clamp(foam + fresnel * 0.35, 0.0, 1.0));
          col += vec3(1.0, 0.95, 0.88) * spec;
          col *= mix(1.0, 0.34, uNight);

          float edgeFade = smoothstep(0.0, 0.13, vUv.x) * (1.0 - smoothstep(0.87, 1.0, vUv.x));
          float alpha = clamp((0.62 + foam * 0.36 + fresnel * 0.18) * edgeFade, 0.0, 0.96);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    }),
  );

  wfGroup.add(
    new THREE.Mesh(feederGeo, wfMat),
    new THREE.Mesh(mainCurtainGeo, wfMat),
    new THREE.Mesh(leftSideCascadeGeo, wfMat),
    new THREE.Mesh(rightSideCascadeGeo, wfMat),
  );

  // Expanded Textured Plunge-Pool Apron Flow Shader (19.0m radius, radial lacy foam advection)
  const plungeBoilGeo = trackGeo(new THREE.CircleGeometry(19.0, 56));
  plungeBoilGeo.rotateX(-Math.PI / 2);
  const plungeBoilMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: sharedWeather.uTime,
        uNight: flagNightUniform,
        uOvercast: sharedWeather.uOvercast,
        uWetness: sharedWeather.uWetness,
        uFoamMap: { value: textures.waterFoamAlbedo },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uNight;
        uniform float uOvercast;
        uniform float uWetness;
        uniform sampler2D uFoamMap;
        varying vec2 vUv;
        void main() {
          vec2 d = (vUv - 0.5) * 2.0;
          float r = length(d);
          if (r > 1.0) discard;
          float ang = atan(d.y, d.x);
          vec2 dir = r > 0.001 ? d / r : vec2(0.0, 1.0);

          // Two counter-advected lacy foam layers flowing radially outward from plunge impact
          vec2 uvA = d * 1.45 - dir * (uTime * 0.38);
          vec2 uvB = d * 2.35 - dir * (uTime * 0.54) + vec2(0.31, 0.67);
          float texA = texture2D(uFoamMap, uvA).r;
          float texB = texture2D(uFoamMap, uvB).g;
          float froth = smoothstep(0.28, 0.78, texA * 0.6 + texB * 0.4);

          float waveRing = 0.5 + 0.5 * sin(r * 26.0 - uTime * 5.2 + sin(ang * 5.0) * 1.2);
          float radialMask = 1.0 - smoothstep(0.14, 1.0, r);
          float coreBoil = 1.0 - smoothstep(0.0, 0.36, r);
          float boil = clamp(froth * (0.68 + 0.32 * waveRing) + coreBoil * 0.72, 0.0, 1.0);

          vec3 foamDay = mix(vec3(0.84, 0.93, 0.96), vec3(0.96, 0.99, 1.0), froth * 0.7 + coreBoil * 0.3);
          vec3 col = mix(foamDay, vec3(0.72, 0.80, 0.86), uOvercast * 0.55);
          col *= mix(1.0, 0.32, uNight);

          float alpha = clamp(radialMask * boil * (0.78 + uWetness * 0.14), 0.0, 0.92);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    }),
  );
  const plungeBoilMesh = new THREE.Mesh(plungeBoilGeo, plungeBoilMat);
  plungeBoilMesh.position.set(wfBotX, WATER_LEVEL + 0.08, wfBotZ + 0.6);
  wfGroup.add(plungeBoilMesh);

  // GPU-Animated Volumetric Wind-Driven Base Mist Plume Emitter (240 rising billowing sprites)
  const mistCount = 240;
  const mistPos = new Float32Array(mistCount * 3);
  const mistOrigin = new Float32Array(mistCount * 3);
  const mistSeed = new Float32Array(mistCount * 3); // [phase, speedMult, sizeMult]
  for (let i = 0; i < mistCount; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = 1.2 + Math.pow(rand(), 0.72) * 11.5;
    const bx = wfBotX + Math.cos(ang) * rad;
    const by = WATER_LEVEL + 0.35 + rand() * 2.4;
    const bz = wfBotZ + 0.8 + Math.sin(ang) * rad * 0.85;
    mistPos[i * 3] = bx;
    mistPos[i * 3 + 1] = by;
    mistPos[i * 3 + 2] = bz;
    mistOrigin[i * 3] = bx;
    mistOrigin[i * 3 + 1] = by;
    mistOrigin[i * 3 + 2] = bz;
    mistSeed[i * 3] = rand();
    mistSeed[i * 3 + 1] = 0.75 + rand() * 0.55;
    mistSeed[i * 3 + 2] = 0.75 + rand() * 0.65;
  }
  const mistGeo = trackGeo(new THREE.BufferGeometry());
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  mistGeo.setAttribute('aOrigin', new THREE.BufferAttribute(mistOrigin, 3));
  mistGeo.setAttribute('aMistSeed', new THREE.BufferAttribute(mistSeed, 3));
  const mistMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: sharedWeather.uTime,
        uWindSpeed: sharedWeather.uWindSpeed,
        uWindDir: sharedWeather.uWindDir,
        uNight: flagNightUniform,
        uOvercast: sharedWeather.uOvercast,
        uWetness: sharedWeather.uWetness,
        uMistMap: { value: textures.mistSpriteAlbedo },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec3 aOrigin;
        attribute vec3 aMistSeed;
        uniform float uTime;
        uniform float uWindSpeed;
        uniform vec2 uWindDir;
        varying float vLife;
        varying float vSeed;
        void main() {
          float life = fract(uTime * (0.19 * aMistSeed.y) + aMistSeed.x);
          vLife = life;
          vSeed = aMistSeed.x * 6.28318;
          float swirlX = sin(uTime * 1.2 + vSeed + life * 3.0) * 1.15 * life;
          float swirlZ = cos(uTime * 1.05 + vSeed * 1.3 + life * 2.5) * 0.95 * life;
          vec3 p = aOrigin;
          p.x += uWindDir.x * uWindSpeed * life * 6.8 + swirlX;
          p.y += life * 7.2;
          p.z += uWindDir.y * uWindSpeed * life * 6.8 + swirlZ;
          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPos;
          float baseSize = (7.2 + life * 6.5) * aMistSeed.z;
          gl_PointSize = clamp(baseSize * (420.0 / max(-mvPos.z, 1.0)), 4.0, 96.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMistMap;
        uniform float uNight;
        uniform float uOvercast;
        uniform float uWetness;
        varying float vLife;
        void main() {
          vec4 tex = texture2D(uMistMap, gl_PointCoord);
          if (tex.a < 0.02) discard;
          float env = sin(clamp(vLife, 0.0, 1.0) * 3.14159265);
          vec3 col = mix(vec3(0.92, 0.97, 1.0), vec3(0.76, 0.82, 0.87), uOvercast * 0.55);
          col *= mix(1.0, 0.34, uNight);
          float alpha = tex.a * env * (0.34 + uWetness * 0.14) * (1.0 - uNight * 0.5);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    }),
  );
  const mistPoints = new THREE.Points(mistGeo, mistMat);
  mistPoints.frustumCulled = false;
  wfGroup.add(mistPoints);

  // GPU-Accelerated Ballistic Splash Droplet Bursts (340 droplets following v0*t - 0.5*g*t^2 arcs)
  const sprayCount = 340;
  const sprayPos = new Float32Array(sprayCount * 3);
  const sprayOrigin = new Float32Array(sprayCount * 3);
  const sprayVel = new Float32Array(sprayCount * 3);
  const spraySeed = new Float32Array(sprayCount * 3); // [phase, period, sizeScale]
  for (let i = 0; i < sprayCount; i++) {
    const zoneRoll = i % 5;
    let ox = wfBotX;
    let oy = WATER_LEVEL + 0.3;
    let oz = wfBotZ + 0.6;
    let vx = 0;
    let vy = 6.5;
    let vz = 0;

    if (zoneRoll === 0) {
      // Upper stepped rock ledge burst (34% drop)
      ox = lerp(wfTopX, wfBotX, 0.34) + (rand() - 0.5) * 6.0;
      oy = wfTopY - 4.8 + (rand() - 0.5) * 1.2;
      oz = lerp(wfTopZ, wfBotZ, 0.34) + (rand() - 0.5) * 3.0;
      const a = rand() * Math.PI * 2;
      const hSpd = 1.4 + rand() * 2.8;
      vx = Math.cos(a) * hSpd;
      vy = 3.2 + rand() * 3.4;
      vz = Math.abs(Math.sin(a)) * hSpd * 0.9 + 1.2;
    } else if (zoneRoll === 1) {
      // Lower stepped rock ledge burst (64% drop)
      ox = lerp(wfTopX, wfBotX, 0.64) + (rand() - 0.5) * 6.8;
      oy = WATER_LEVEL + 5.6 + (rand() - 0.5) * 1.4;
      oz = lerp(wfTopZ, wfBotZ, 0.64) + (rand() - 0.5) * 3.4;
      const a = rand() * Math.PI * 2;
      const hSpd = 1.6 + rand() * 3.2;
      vx = Math.cos(a) * hSpd;
      vy = 3.6 + rand() * 3.8;
      vz = Math.abs(Math.sin(a)) * hSpd + 1.5;
    } else {
      // High-energy plunge pool impact ballistic bursts
      const ang = rand() * Math.PI * 2;
      const rad = 0.8 + rand() * 6.2;
      ox = wfBotX + Math.cos(ang) * rad;
      oy = WATER_LEVEL + 0.15 + rand() * 0.6;
      oz = wfBotZ + 0.6 + Math.sin(ang) * rad * 0.85;
      const radialSpd = 2.0 + rand() * 4.4;
      vx = Math.cos(ang) * radialSpd + (rand() - 0.5) * 1.2;
      vy = 4.6 + rand() * 5.2;
      vz = Math.sin(ang) * radialSpd + 0.8 + (rand() - 0.5) * 1.2;
    }

    sprayPos[i * 3] = ox;
    sprayPos[i * 3 + 1] = oy;
    sprayPos[i * 3 + 2] = oz;
    sprayOrigin[i * 3] = ox;
    sprayOrigin[i * 3 + 1] = oy;
    sprayOrigin[i * 3 + 2] = oz;
    sprayVel[i * 3] = vx;
    sprayVel[i * 3 + 1] = vy;
    sprayVel[i * 3 + 2] = vz;
    spraySeed[i * 3] = rand() * 3.0;
    spraySeed[i * 3 + 1] = 0.95 + rand() * 0.75;
    spraySeed[i * 3 + 2] = 0.75 + rand() * 0.85;
  }
  const sprayGeo = trackGeo(new THREE.BufferGeometry());
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  sprayGeo.setAttribute('aOrigin', new THREE.BufferAttribute(sprayOrigin, 3));
  sprayGeo.setAttribute('aVelocity', new THREE.BufferAttribute(sprayVel, 3));
  sprayGeo.setAttribute('aSeed', new THREE.BufferAttribute(spraySeed, 3));
  const sprayMat = trackMat(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: sharedWeather.uTime,
        uWindSpeed: sharedWeather.uWindSpeed,
        uWindDir: sharedWeather.uWindDir,
        uNight: flagNightUniform,
        uOvercast: sharedWeather.uOvercast,
        uWetness: sharedWeather.uWetness,
        uWaterLevel: { value: WATER_LEVEL },
        uDropletMap: { value: textures.mistSpriteAlbedo },
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute vec3 aOrigin;
        attribute vec3 aVelocity;
        attribute vec3 aSeed;
        uniform float uTime;
        uniform float uWindSpeed;
        uniform vec2 uWindDir;
        uniform float uWaterLevel;
        varying float vLife;
        varying float vSubmergedFade;
        void main() {
          float period = max(aSeed.y, 0.4);
          float t = mod(uTime + aSeed.x, period);
          float life = clamp(t / period, 0.0, 1.0);
          vLife = life;
          // True parabolic ballistic arc: p0 + v0*t - 0.5*g*t^2 + wind acceleration
          vec3 p = aOrigin + aVelocity * t;
          p.y -= 4.9 * t * t;
          p.x += uWindDir.x * uWindSpeed * 0.85 * t * t;
          p.z += uWindDir.y * uWindSpeed * 0.85 * t * t;
          vSubmergedFade = smoothstep(uWaterLevel - 0.45, uWaterLevel + 0.1, p.y);
          vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPos;
          float dropSize = (1.35 + (1.0 - life) * 0.65) * aSeed.z;
          gl_PointSize = clamp(dropSize * (360.0 / max(-mvPos.z, 1.0)), 1.5, 24.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uDropletMap;
        uniform float uNight;
        uniform float uOvercast;
        uniform float uWetness;
        varying float vLife;
        varying float vSubmergedFade;
        void main() {
          vec4 tex = texture2D(uDropletMap, gl_PointCoord);
          if (tex.a < 0.03) discard;
          float env = smoothstep(0.0, 0.08, vLife) * (1.0 - smoothstep(0.72, 1.0, vLife));
          vec3 col = mix(vec3(0.95, 0.99, 1.0), vec3(0.80, 0.87, 0.92), uOvercast * 0.5);
          col *= mix(1.0, 0.35, uNight);
          float alpha = tex.a * env * vSubmergedFade * (0.72 + uWetness * 0.2) * (1.0 - uNight * 0.55);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    }),
  );
  const sprayPoints = new THREE.Points(sprayGeo, sprayMat);
  sprayPoints.frustumCulled = false;
  wfGroup.add(sprayPoints);

  group.add(wfGroup);

  // ---------------------------------------------------------------------------
  // 6. ARCHITECTURAL ALPINE VILLAS (Multi-Part Composite Hillside Village)
  // ---------------------------------------------------------------------------
  const villaStoneGeos: THREE.BufferGeometry[] = [];
  const villaStuccoGeos: THREE.BufferGeometry[] = [];
  const villaTimberGeos: THREE.BufferGeometry[] = [];
  const villaRoofGeos: THREE.BufferGeometry[] = [];
  const villaWindowGeos: THREE.BufferGeometry[] = [];
  const villaTreeGeos: THREE.BufferGeometry[] = [];

  const pushColoredGeo = (
    targetList: THREE.BufferGeometry[],
    rawGeo: THREE.BufferGeometry,
    tintHex: number,
  ) => {
    const geo = rawGeo.index ? rawGeo.toNonIndexed() : rawGeo;
    if (geo !== rawGeo) rawGeo.dispose();
    const c = new THREE.Color(tintHex);
    const count = geo.attributes.position.count;
    const cols = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      cols[i * 3] = c.r;
      cols[i * 3 + 1] = c.g;
      cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    targetList.push(geo);
  };

  const stuccoPalettes = [0xe4d9c8, 0xd8cbb8, 0xe8ded0, 0xcfc4b4, 0xdac3a8];
  const roofPalettes = [0x6e3a2c, 0x7d4432, 0x434952, 0x563e34];

  const villageClusters: Array<{ cx: number; cz: number; radius: number; target: number }> = [
    { cx: -205, cz: 78, radius: 74, target: 20 },
    { cx: 285, cz: -72, radius: 78, target: 18 },
  ];

  const buildGabledRoofPrism = (spanX: number, ridgeLenZ: number, peakH: number) => {
    const hw = spanX * 0.5;
    const shape = new THREE.Shape();
    shape.moveTo(-hw, 0);
    shape.lineTo(0, peakH);
    shape.lineTo(hw, 0);
    shape.lineTo(hw - 0.14, -0.18);
    shape.lineTo(0, peakH - 0.22);
    shape.lineTo(-hw + 0.14, -0.18);
    shape.closePath();

    const g = new THREE.ExtrudeGeometry(shape, {
      depth: ridgeLenZ,
      bevelEnabled: false,
    });
    g.translate(0, 0, -ridgeLenZ * 0.5);
    return g;
  };

  for (const cluster of villageClusters) {
    let placed = 0;
    let tries = 0;
    while (placed < cluster.target && tries < 280) {
      tries++;
      const ang = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * cluster.radius;
      const vx = cluster.cx + Math.cos(ang) * dist;
      const vz = cluster.cz + Math.sin(ang) * dist;

      const q = circuit.queryNearest(vx, vz);
      if (q.absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 32) continue;

      const vy = groundHeightAt(vx, vz);
      if (vy < WATER_LEVEL + 3.5 || vy > 56) continue;
      const n = groundNormalAt(vx, vz, 2.2);
      if (n.y < 0.78) continue;

      const w = 7.4 + rand() * 3.8;
      const d = 6.2 + rand() * 3.2;
      const h = 4.6 + rand() * 2.1;
      const eaveOverhang = 0.65;
      const roofPeakH = 2.6 + rand() * 0.9;
      const yaw = Math.atan2(cluster.cx - vx, cluster.cz - vz) + (rand() - 0.5) * 1.1;
      const rotQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

      const stuccoTint = stuccoPalettes[Math.floor(rand() * stuccoPalettes.length)];
      const roofTint = roofPalettes[Math.floor(rand() * roofPalettes.length)];

      const placeGeo = (g: THREE.BufferGeometry) => {
        g.applyQuaternion(rotQ);
        g.translate(vx, vy, vz);
        return g;
      };
      worldColliders.addObb(
        vx,
        vz,
        w * 0.5 + 0.35,
        d * 0.5 + 0.35,
        Math.cos(yaw),
        -Math.sin(yaw),
        'concrete',
        vy - 3,
        vy + h + 4,
      );

      // 1. Deep Stone Masonry Foundation Plinth + Raised Terrace Yard Wall
      const plinth = placeGeo(
        new THREE.BoxGeometry(w + 0.6, 5.4, d + 0.6).translate(0, -1.65, 0),
      );
      villaStoneGeos.push(plinth);

      const terrace = placeGeo(
        new THREE.BoxGeometry(w + 2.4, 3.6, 2.6).translate(0, -1.7, d * 0.5 + 1.1),
      );
      villaStoneGeos.push(terrace);

      // Stone Chimney Stack + Cap Collar rising through roof slope
      const chimney = placeGeo(
        new THREE.BoxGeometry(0.9, h + roofPeakH + 1.6, 0.9).translate(
          -w * 0.28,
          (h + roofPeakH) * 0.5 + 0.4,
          -d * 0.2,
        ),
      );
      const chimneyCap = placeGeo(
        new THREE.BoxGeometry(1.16, 0.2, 1.16).translate(
          -w * 0.28,
          h + roofPeakH + 1.25,
          -d * 0.2,
        ),
      );
      villaStoneGeos.push(chimney, chimneyCap);

      // 2. Main Stucco House Facade + Gable Attic Triangle
      const body = placeGeo(
        new THREE.BoxGeometry(w, h, d).translate(0, 1.05 + h * 0.5, 0),
      );
      pushColoredGeo(villaStuccoGeos, body, stuccoTint);

      const gableShape = new THREE.Shape();
      gableShape.moveTo(-w * 0.5, 0);
      gableShape.lineTo(0, roofPeakH - 0.15);
      gableShape.lineTo(w * 0.5, 0);
      gableShape.closePath();
      const gablePrism = new THREE.ExtrudeGeometry(gableShape, { depth: d, bevelEnabled: false });
      gablePrism.translate(0, 1.05 + h, -d * 0.5);
      pushColoredGeo(villaStuccoGeos, placeGeo(gablePrism), stuccoTint);

      // 3. Overhanging Gabled Roof + Ridge Beam + Timber Rafters & Porch
      const roof = placeGeo(
        buildGabledRoofPrism(w + eaveOverhang * 2, d + eaveOverhang * 2, roofPeakH).translate(
          0,
          1.05 + h,
          0,
        ),
      );
      pushColoredGeo(villaRoofGeos, roof, roofTint);

      const ridgeCap = placeGeo(
        new THREE.BoxGeometry(0.28, 0.22, d + eaveOverhang * 2.1).translate(
          0,
          1.05 + h + roofPeakH - 0.04,
          0,
        ),
      );
      pushColoredGeo(villaRoofGeos, ridgeCap, roofTint);

      // Timber Corner Posts, Exposed Rafter Tails, Horizontal Floor Fascia & Cantilevered Balcony
      const midFascia = placeGeo(
        new THREE.BoxGeometry(w + 0.16, 0.22, d + 0.16).translate(0, 1.05 + h * 0.52, 0),
      );
      villaTimberGeos.push(midFascia);

      for (const sideX of [-1, 1] as const) {
        for (const rOffZ of [-d * 0.34, 0, d * 0.34]) {
          const rafterTail = placeGeo(
            new THREE.BoxGeometry(0.62, 0.16, 0.18)
              .rotateZ(sideX * -0.45)
              .translate(sideX * (w * 0.5 + 0.32), 1.05 + h - 0.12, rOffZ),
          );
          villaTimberGeos.push(rafterTail);
        }
      }

      for (const sx of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          const cornerPost = placeGeo(
            new THREE.BoxGeometry(0.24, h, 0.24).translate(
              sx * (w * 0.5 - 0.06),
              1.05 + h * 0.5,
              sz * (d * 0.5 - 0.06),
            ),
          );
          villaTimberGeos.push(cornerPost);
        }
      }

      // Cantilevered wooden front balcony & railings
      const balconyDeck = placeGeo(
        new THREE.BoxGeometry(w * 0.72, 0.18, 1.45).translate(0, 1.05 + h * 0.52, d * 0.5 + 0.7),
      );
      const balconyRail = placeGeo(
        new THREE.BoxGeometry(w * 0.72, 0.85, 0.1).translate(0, 1.05 + h * 0.52 + 0.48, d * 0.5 + 1.38),
      );
      villaTimberGeos.push(balconyDeck, balconyRail);

      // 4. Recessed Multi-Pane Casement Windows + Dark Frames (Front, Back, Left, Right)
      const winCols = w > 9.0 ? 3 : 2;
      for (const floorFrac of [0.3, 0.74]) {
        const wy = 1.05 + h * floorFrac;
        for (let wc = 0; wc < winCols; wc++) {
          const wx = ((wc + 0.5) / winCols - 0.5) * (w * 0.68);
          // Front facade window frame + glass pane
          const fFrame = placeGeo(
            new THREE.BoxGeometry(1.18, 1.32, 0.16).translate(wx, wy, d * 0.5 + 0.02),
          );
          const fGlass = placeGeo(
            new THREE.BoxGeometry(0.92, 1.08, 0.19).translate(wx, wy, d * 0.5 + 0.03),
          );
          villaTimberGeos.push(fFrame);
          villaWindowGeos.push(fGlass);

          // Rear facade windows
          const rFrame = placeGeo(
            new THREE.BoxGeometry(1.1, 1.24, 0.16).translate(wx, wy, -d * 0.5 - 0.02),
          );
          const rGlass = placeGeo(
            new THREE.BoxGeometry(0.86, 1.0, 0.19).translate(wx, wy, -d * 0.5 - 0.03),
          );
          villaTimberGeos.push(rFrame);
          villaWindowGeos.push(rGlass);
        }

        // Left & Right side-wall casement windows
        for (const sideX of [-1, 1] as const) {
          for (const szOff of [-d * 0.22, d * 0.22]) {
            const sFrame = placeGeo(
              new THREE.BoxGeometry(0.16, 1.22, 1.06).translate(sideX * (w * 0.5 + 0.02), wy, szOff),
            );
            const sGlass = placeGeo(
              new THREE.BoxGeometry(0.19, 0.98, 0.84).translate(sideX * (w * 0.5 + 0.03), wy, szOff),
            );
            villaTimberGeos.push(sFrame);
            villaWindowGeos.push(sGlass);
          }
        }
      }

      // Gable attic window
      const gableFrame = placeGeo(
        new THREE.BoxGeometry(1.05, 1.05, 0.16).translate(0, 1.05 + h + roofPeakH * 0.38, d * 0.5 + 0.02),
      );
      const gableGlass = placeGeo(
        new THREE.BoxGeometry(0.82, 0.82, 0.19).translate(0, 1.05 + h + roofPeakH * 0.38, d * 0.5 + 0.03),
      );
      villaTimberGeos.push(gableFrame);
      villaWindowGeos.push(gableGlass);

      // Front wooden entry door
      const door = placeGeo(
        new THREE.BoxGeometry(1.15, 2.05, 0.18).translate(0, 1.05 + 1.02, d * 0.5 + 0.03),
      );
      villaTimberGeos.push(door);

      // 5. Courtyard Alpine Cypress Accent Tree next to 65% of villas
      if (rand() < 0.65) {
        const cypress = placeGeo(
          new THREE.ConeGeometry(0.95 + rand() * 0.35, 5.2 + rand() * 2.2, 7).translate(
            (rand() > 0.5 ? 1 : -1) * (w * 0.68 + 1.1),
            2.4,
            d * 0.45,
          ),
        );
        villaTreeGeos.push(cypress);
      }

      placed++;
    }
  }

  const villaStoneMat = registerWire(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      normalMap: textures.terrainNormal,
      normalScale: new THREE.Vector2(1.05, 1.05),
      color: 0x8b8a84,
      roughness: 0.9,
      metalness: 0.03,
    }),
  );
  const stuccoMat = registerWire(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );
  const villaTimberMat = registerWire(
    new THREE.MeshStandardMaterial({
      color: 0x3b2a20,
      roughness: 0.76,
      metalness: 0.05,
    }),
  );
  const slateRoofMat = registerWire(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.08,
    }),
  );
  slateRoofMat.onBeforeCompile = (shader) => {
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
        roughnessFactor = mix(roughnessFactor, 0.18, uWetness * 0.85);`,
      );
  };
  slateRoofMat.customProgramCacheKey = () => 'aurelia-villa-slate-wet-v1';
  const villageWindowMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1c2834,
      emissive: 0xffb347,
      emissiveIntensity: 0.04,
      roughness: 0.08,
      metalness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    }),
  );
  const villaFoliageMat = registerWire(
    new THREE.MeshStandardMaterial({
      color: 0x2a4526,
      roughness: 0.88,
      metalness: 0.02,
    }),
  );

  for (const [geos, mat, castShadow] of [
    [villaStoneGeos, villaStoneMat, true],
    [villaStuccoGeos, stuccoMat, true],
    [villaTimberGeos, villaTimberMat, true],
    [villaRoofGeos, slateRoofMat, true],
    [villaWindowGeos, villageWindowMat, false],
    [villaTreeGeos, villaFoliageMat, true],
  ] as const) {
    if (geos.length > 0) {
      const merged = trackGeo(BufferGeometryUtils.mergeGeometries(geos, false));
      for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  // ---------------------------------------------------------------------------
  // 7. HIGH-VOLTAGE STEEL LATTICE TRANSMISSION PYLONS & CATENARY POWER LINES
  // ---------------------------------------------------------------------------
  const pylonSitesRaw: Array<[number, number]> = [
    [-415, 290],
    [-425, 110],
    [-415, -90],
    [-355, -315],
    [-160, -405],
    [65, -420],
    [290, -375],
  ];
  const validPylonNodes: Array<{ base: THREE.Vector3; yaw: number; armTips: THREE.Vector3[] }> = [];

  for (let i = 0; i < pylonSitesRaw.length; i++) {
    const [px, pz] = pylonSitesRaw[i];
    const q = circuit.queryNearest(px, pz);
    if (q.absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 30) continue;

    const py = groundHeightAt(px, pz);
    const nextPt = pylonSitesRaw[Math.min(i + 1, pylonSitesRaw.length - 1)];
    const prevPt = pylonSitesRaw[Math.max(i - 1, 0)];
    const dirX = nextPt[0] - prevPt[0];
    const dirZ = nextPt[1] - prevPt[1];
    const yaw = Math.atan2(dirX, dirZ);
    const pQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

    const armOffsets = [
      new THREE.Vector3(-5.8, 22.0, 0),
      new THREE.Vector3(5.8, 22.0, 0),
      new THREE.Vector3(0, 27.2, 0),
    ];
    const armTips = armOffsets.map((o) =>
      o.clone().applyQuaternion(pQuat).add(new THREE.Vector3(px, py, pz)),
    );
    validPylonNodes.push({ base: new THREE.Vector3(px, py, pz), yaw, armTips });
    worldColliders.addCircle(px, pz, 3.6, 'metal', py - 2, py + 10);
  }

  const powerTowerGeos: THREE.BufferGeometry[] = [];
  const wirePoints: THREE.Vector3[] = [];

  for (const node of validPylonNodes) {
    const pQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), node.yaw);
    const baseW = 3.2;
    const topW = 0.65;
    const h = 28.5;

    // 4 tapered corner steel legs planted 2m into mountain ridge
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const pA = new THREE.Vector3(sx * baseW, -2.0, sz * baseW);
        const pB = new THREE.Vector3(sx * topW, h, sz * topW);
        const mid = pA.clone().add(pB).multiplyScalar(0.5);
        const dir = pB.clone().sub(pA);
        const leg = new THREE.CylinderGeometry(0.14, 0.24, dir.length(), 4);
        leg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
        leg.translate(mid.x, mid.y, mid.z);
        leg.applyQuaternion(pQuat);
        leg.translate(node.base.x, node.base.y, node.base.z);
        powerTowerGeos.push(leg);
      }
    }

    // Horizontal lattice cross-bracing rings & upper insulator cross-arm
    for (const ringY of [7, 14, 21.5]) {
      const rw = lerp(baseW, topW, ringY / h) * 2.05;
      const ring = new THREE.BoxGeometry(rw, 0.28, rw);
      ring.translate(0, ringY, 0);
      ring.applyQuaternion(pQuat);
      ring.translate(node.base.x, node.base.y, node.base.z);
      powerTowerGeos.push(ring);
    }

    const mainArm = new THREE.BoxGeometry(12.2, 0.42, 0.65);
    mainArm.translate(0, 22.0, 0);
    mainArm.applyQuaternion(pQuat);
    mainArm.translate(node.base.x, node.base.y, node.base.z);
    powerTowerGeos.push(mainArm);

    const earthPeak = new THREE.ConeGeometry(0.9, 3.2, 4);
    earthPeak.rotateY(Math.PI / 4);
    earthPeak.translate(0, h + 1.4, 0);
    earthPeak.applyQuaternion(pQuat);
    earthPeak.translate(node.base.x, node.base.y, node.base.z);
    powerTowerGeos.push(earthPeak);
  }

  // Parabolic Catenary Power Lines connecting adjacent pylons
  for (let i = 0; i < validPylonNodes.length - 1; i++) {
    const a = validPylonNodes[i];
    const b = validPylonNodes[i + 1];
    for (let wireIdx = 0; wireIdx < 3; wireIdx++) {
      const p0 = a.armTips[wireIdx];
      const p1 = b.armTips[wireIdx];
      const segs = 12;
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs;
        const t1 = (s + 1) / segs;
        const sag0 = Math.sin(t0 * Math.PI) * 5.2;
        const sag1 = Math.sin(t1 * Math.PI) * 5.2;
        wirePoints.push(
          new THREE.Vector3(lerp(p0.x, p1.x, t0), lerp(p0.y, p1.y, t0) - sag0, lerp(p0.z, p1.z, t0)),
          new THREE.Vector3(lerp(p0.x, p1.x, t1), lerp(p0.y, p1.y, t1) - sag1, lerp(p0.z, p1.z, t1)),
        );
      }
    }
  }

  if (powerTowerGeos.length > 0) {
    const mergedPylons = trackGeo(BufferGeometryUtils.mergeGeometries(powerTowerGeos, false));
    for (const g of powerTowerGeos) g.dispose();
    const pylonsMesh = new THREE.Mesh(mergedPylons, brushedSteelMat);
    pylonsMesh.castShadow = true;
    group.add(pylonsMesh);
  }
  if (wirePoints.length > 0) {
    const wireGeo = trackGeo(new THREE.BufferGeometry().setFromPoints(wirePoints));
    const wireMat = trackMat(new THREE.LineBasicMaterial({ color: 0x3b424c, transparent: true, opacity: 0.78 }));
    group.add(new THREE.LineSegments(wireGeo, wireMat));
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
    group,
    update: (elapsedSec: number, deltaSec = 0.016, crowdInput?: CrowdTelemetryInput) => {
      const ci = crowdInput ?? defaultCrowdInput;
      crowdRig.update(deltaSec, elapsedSec, ci);
      cornerFanZones.update(deltaSec, elapsedSec, ci);
    },
    setNightFactor: (nightFactor: number) => {
      flagNightUniform.value = nightFactor;
      garageLightMat.emissiveIntensity = 0.25 + nightFactor * 2.8;
      hospitalityGlassMat.emissiveIntensity = 0.05 + nightFactor * 1.1;
      villageWindowMat.emissiveIntensity = 0.04 + nightFactor * 2.4;
      const showPl = nightFactor > 0.01;
      for (const pl of nightSpotLights) {
        pl.intensity = nightFactor * 3.0;
        pl.visible = showPl;
      }
      cornerFanZones.setNightFactor(nightFactor);
    },
    setWireframe: (wire: boolean) => {
      for (const m of wireframeMats) m.wireframe = wire;
      crowdRig.setWireframe(wire);
      cornerFanZones.setWireframe(wire);
    },
    getGrandstandWorldPos: () => gsWorldPos,
    dispose: () => {
      crowdRig.dispose();
      cornerFanZones.dispose();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
      for (const t of disposableTex) t.dispose();
    },
  };
}
