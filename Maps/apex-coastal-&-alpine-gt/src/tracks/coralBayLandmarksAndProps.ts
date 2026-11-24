import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CORAL_BAY_WATER_LEVEL } from './coralBayTerrainField';
import type { ProceduralTextureSet } from './proceduralTextures';
import {
  buildCornerFanZoneRigs,
  buildOrientedPitAndGrandstandAddon,
  buildSharedTracksideInfra,
} from './sharedTracksideKit';
import { clamp, createTrackSpatialQuery, hash2 } from './terrainField';
import type {
  ColliderRegistry,
  MapDefinition,
  TerrainField,
  TrackSample,
} from './types';

export interface CoralBayPropsHandle {
  update: (elapsed: number, playerPos: THREE.Vector3, crowdExcitement: number) => void;
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

export function buildCoralBayLandmarksAndProps(
  parent: THREE.Group,
  mapDef: MapDefinition,
  samples: TrackSample[],
  terrain: TerrainField,
  registry: ColliderRegistry,
  textures: ProceduralTextureSet
): CoralBayPropsHandle {
  const disposables: { dispose: () => void }[] = [];
  const trackQuery = createTrackSpatialQuery(samples, 26);
  const hw = mapDef.roadHalfWidth;

  // 1. Oriented Asphalt Pit Apron (245 x 22 m), yellow stripe, 6 cyan pit boxes (10.5 x 4.6 m)
  const { pitFrame } = mapDef;
  const pitApronGroup = new THREE.Group();
  pitApronGroup.position.set(pitFrame.centerX, pitFrame.y + 0.02, pitFrame.centerZ);
  pitApronGroup.rotation.y = -Math.atan2(pitFrame.tangentZ, pitFrame.tangentX);
  parent.add(pitApronGroup);

  const apronGeo = new THREE.PlaneGeometry(245, 22);
  apronGeo.rotateX(-Math.PI / 2);
  const apronMat = new THREE.MeshStandardMaterial({
    color: 0x3b4048,
    map: textures.asphaltMap,
    roughness: 0.85,
  });
  const apronMesh = new THREE.Mesh(apronGeo, apronMat);
  apronMesh.receiveShadow = true;
  pitApronGroup.add(apronMesh);

  const stripeGeo = new THREE.PlaneGeometry(235, 0.35);
  stripeGeo.rotateX(-Math.PI / 2);
  const yellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const yellowLine = new THREE.Mesh(stripeGeo, yellowMat);
  yellowLine.position.set(0, 0.02, -8.8);
  pitApronGroup.add(yellowLine);

  const boxEdgeMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
  const boxLongGeo = new THREE.PlaneGeometry(10.5, 0.25);
  boxLongGeo.rotateX(-Math.PI / 2);
  const boxShortGeo = new THREE.PlaneGeometry(0.25, 4.6);
  boxShortGeo.rotateX(-Math.PI / 2);
  for (let b = 0; b < 6; b++) {
    const bx = (b - 2.5) * 18.4;
    const topL = new THREE.Mesh(boxLongGeo, boxEdgeMat);
    topL.position.set(bx, 0.025, 2.3);
    const botL = new THREE.Mesh(boxLongGeo, boxEdgeMat);
    botL.position.set(bx, 0.025, -2.3);
    const lEdge = new THREE.Mesh(boxShortGeo, boxEdgeMat);
    lEdge.position.set(bx - 5.15, 0.025, 0);
    const rEdge = new THREE.Mesh(boxShortGeo, boxEdgeMat);
    rEdge.position.set(bx + 5.15, 0.025, 0);
    pitApronGroup.add(topL, botL, lEdge, rEdge);
  }
  disposables.push(apronGeo, apronMat, stripeGeo, yellowMat, boxEdgeMat, boxLongGeo, boxShortGeo);

  // Shared FIA Pit Complex, Grandstand, Corner Fan-Zones, Gantries
  const pitAddon = buildOrientedPitAndGrandstandAddon(
    parent,
    mapDef,
    terrain,
    registry,
    textures,
    'coral_bay'
  );
  const fanZones = buildCornerFanZoneRigs(parent, samples, terrain, registry, 'coral_bay');
  const sharedInfra = buildSharedTracksideInfra(parent, samples, mapDef);

  // 2. Monumental Coastal Limestone Sea Arch spanning north headland road (spanHalf: 17.2m, archHeight: 19.4m)
  const archSample = samples[Math.floor(samples.length * 0.62)];
  const seaArchGroup = new THREE.Group();
  seaArchGroup.position.set(archSample.x, archSample.y - 1.5, archSample.z);
  seaArchGroup.rotation.y = -Math.atan2(archSample.tangentZ, archSample.tangentX);
  parent.add(seaArchGroup);

  const limestoneMat = new THREE.MeshStandardMaterial({
    color: 0xc2b299,
    roughness: 0.92,
    metalness: 0.02,
  });
  disposables.push(limestoneMat);

  const spanHalf = 17.2;
  const archHeight = 19.4;
  const pillarGeo = new THREE.CylinderGeometry(3.4, 5.2, archHeight * 0.72, 9);
  const archCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, archHeight * 0.55, -spanHalf),
    new THREE.Vector3(0, archHeight * 0.96, -spanHalf * 0.45),
    new THREE.Vector3(0, archHeight + 1.2, 0),
    new THREE.Vector3(0, archHeight * 0.96, spanHalf * 0.45),
    new THREE.Vector3(0, archHeight * 0.55, spanHalf),
  ]);
  const archVaultGeo = new THREE.TubeGeometry(archCurve, 20, 3.6, 8, false);
  disposables.push(pillarGeo, archVaultGeo);

  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, limestoneMat);
    pillar.position.set(0, archHeight * 0.34, side * spanHalf);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    seaArchGroup.add(pillar);

    // Rock pillar colliders
    const wx = archSample.x + archSample.rightX * side * spanHalf;
    const wz = archSample.z + archSample.rightZ * side * spanHalf;
    registry.circles.push({
      id: `cb_sea_arch_pillar_${side}`,
      kind: 'rock',
      x: wx,
      z: wz,
      radius: 4.5,
      minY: archSample.y - 4,
      maxY: archSample.y + archHeight,
    });
  }
  const vaultMesh = new THREE.Mesh(archVaultGeo, limestoneMat);
  vaultMesh.castShadow = true;
  seaArchGroup.add(vaultMesh);

  const archLight = new THREE.PointLight(0x38bdf8, 12, 65, 1.8);
  archLight.position.set(0, archHeight - 2.2, 0);
  seaArchGroup.add(archLight);

  // 3. East Headland Lighthouse (398, 28) + Twin Volumetric Sweeping Beam Cones + 3 Crepuscular Sunbeams
  const lhX = 398;
  const lhZ = 28;
  const lhBaseY = terrain.getHeight(lhX, lhZ);
  const lhGroup = new THREE.Group();
  lhGroup.position.set(lhX, lhBaseY, lhZ);
  parent.add(lhGroup);

  const lhTowerGeo = new THREE.CylinderGeometry(2.3, 3.8, 24, 16);
  const lhTowerMat = new THREE.MeshStandardMaterial({
    map: textures.lighthouseStripeMap,
    roughness: 0.65,
  });
  const lhTower = new THREE.Mesh(lhTowerGeo, lhTowerMat);
  lhTower.position.y = 12;
  lhTower.castShadow = true;
  lhGroup.add(lhTower);

  const lhGalleryGeo = new THREE.CylinderGeometry(3.4, 3.1, 1.1, 16);
  const lhMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.7 });
  const lhGallery = new THREE.Mesh(lhGalleryGeo, lhMetalMat);
  lhGallery.position.y = 24.4;
  lhGroup.add(lhGallery);

  const lanternRotor = new THREE.Group();
  lanternRotor.position.y = 26.8;
  lhGroup.add(lanternRotor);

  const lhGlassGeo = new THREE.CylinderGeometry(1.8, 1.8, 3.2, 12);
  const lhGlassMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfde047,
    emissiveIntensity: 2.2,
    roughness: 0.15,
  });
  const lhRoofGeo = new THREE.ConeGeometry(2.4, 2.2, 12);
  const lhRoof = new THREE.Mesh(lhRoofGeo, new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 }));
  lhRoof.position.y = 2.6;
  lanternRotor.add(new THREE.Mesh(lhGlassGeo, lhGlassMat), lhRoof);

  // Twin soft-feathered volumetric lighthouse rays blending organically with sky & sun light
  const beamGeo = new THREE.ConeGeometry(16.0, 155, 24, 1, true);
  // Shift cone so apex (radial 0) is at lantern center and wide open mouth points +X
  beamGeo.translate(0, -77.5, 0);
  beamGeo.rotateZ(-Math.PI / 2);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uOpacity: { value: 0.24 },
      uColor: { value: new THREE.Color(0xffe4a6) },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mv.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        float facing = abs(dot(normalize(vNormalView), normalize(vViewPos)));
        float radialFade = pow(facing, 1.85);
        // vUv.y = 1 at apex (lantern), 0 at far open tip
        float axial = 1.0 - vUv.y;
        float distFade = smoothstep(0.0, 0.05, axial) * pow(1.0 - axial, 1.45);
        gl_FragColor = vec4(uColor, radialFade * distFade * uOpacity);
      }
    `,
  });
  const beamA = new THREE.Mesh(beamGeo, beamMat);
  const beamB = new THREE.Mesh(beamGeo, beamMat);
  beamB.rotation.y = Math.PI;
  lanternRotor.add(beamA, beamB);

  // Soft solar-corona glow sphere around the lantern lens so beams merge smoothly with sky light
  const coronaGeo = new THREE.SphereGeometry(7.2, 16, 12);
  const coronaMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 0.26 },
      uColor: { value: new THREE.Color(0xffdfa0) },
    },
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = normalize(-mv.xyz);
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec3 vNormalView;
      varying vec3 vViewPos;
      void main() {
        float d = clamp(dot(normalize(vNormalView), normalize(vViewPos)), 0.0, 1.0);
        float glow = pow(d, 3.4);
        gl_FragColor = vec4(uColor, glow * uOpacity);
      }
    `,
  });
  const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
  lanternRotor.add(coronaMesh);

  const lhPointLight = new THREE.PointLight(0xffdf9e, 18, 120, 1.8);
  lhPointLight.position.set(0, 27, 0);
  lhGroup.add(lhPointLight);

  registry.obbs.push({
    id: 'cb_lighthouse',
    kind: 'landmark',
    centerX: lhX,
    centerZ: lhZ,
    halfW: 4.5,
    halfD: 4.5,
    axisX: 1,
    axisZ: 0,
    minY: lhBaseY - 2,
    maxY: lhBaseY + 30,
  });
  disposables.push(lhTowerGeo, lhTowerMat, lhGalleryGeo, lhMetalMat, lhGlassGeo, lhGlassMat, lhRoofGeo, beamGeo, beamMat, coronaGeo, coronaMat);

  // 4. Resort Marina & Boats (-222..-248, 58..126): 4 timber piers + 6 motor yachts + 4 sailing catamarans
  const marinaGroup = new THREE.Group();
  parent.add(marinaGroup);

  const pierWoodMat = new THREE.MeshStandardMaterial({
    color: 0xa1825e,
    map: textures.timberMap,
    roughness: 0.85,
  });
  const pilingMat = new THREE.MeshStandardMaterial({ color: 0x453525, roughness: 0.9 });
  const deckGeo = new THREE.BoxGeometry(28, 0.4, 3.2);
  const pilingGeo = new THREE.CylinderGeometry(0.22, 0.25, 8.5, 8);
  const bollardMGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.6, 8);
  disposables.push(pierWoodMat, pilingMat, deckGeo, pilingGeo, bollardMGeo);

  for (let p = 0; p < 4; p++) {
    const pz = 64 + p * 18;
    const px = -236;
    const deck = new THREE.Mesh(deckGeo, pierWoodMat);
    deck.position.set(px, CORAL_BAY_WATER_LEVEL + 0.9, pz);
    deck.castShadow = true;
    deck.receiveShadow = true;
    marinaGroup.add(deck);
    for (let xOff = -12; xOff <= 12; xOff += 6) {
      for (const zOff of [-1.25, 1.25]) {
        const pil = new THREE.Mesh(pilingGeo, pilingMat);
        pil.position.set(px + xOff, CORAL_BAY_WATER_LEVEL - 2.6, pz + zOff);
        marinaGroup.add(pil);
      }
      const bol = new THREE.Mesh(bollardMGeo, lhMetalMat);
      bol.position.set(px + xOff, CORAL_BAY_WATER_LEVEL + 1.35, pz - 1.2);
      marinaGroup.add(bol);
    }
  }

  // 6 Bobbing Luxury Motor Yachts & 4 Moored Sailing Catamarans
  const yachtHullMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.22, metalness: 0.12 });
  const yachtNavyMat = new THREE.MeshStandardMaterial({ color: 0x0f2744, roughness: 0.28, metalness: 0.15 });
  const cabinGlassMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.12, metalness: 0.85 });
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.72, side: THREE.DoubleSide });
  disposables.push(yachtHullMat, yachtNavyMat, cabinGlassMat, sailMat);

  const bobbingBoats: { group: THREE.Group; baseY: number; phase: number }[] = [];
  const hullGeo = new THREE.BoxGeometry(11.5, 1.8, 3.8);
  const cabinGeo = new THREE.BoxGeometry(6.2, 1.6, 2.8);
  const flyGeo = new THREE.BoxGeometry(3.6, 0.9, 2.2);
  const mastGeo = new THREE.CylinderGeometry(0.12, 0.16, 17.5, 8);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 15.5, 0, 5.2, 0.5, 0]), 3)
  );
  sailGeo.computeVertexNormals();
  disposables.push(hullGeo, cabinGeo, flyGeo, mastGeo, sailGeo);

  for (let y = 0; y < 6; y++) {
    const yg = new THREE.Group();
    const bx = -255 - (y % 2) * 16;
    const bz = 58 + y * 12;
    yg.position.set(bx, CORAL_BAY_WATER_LEVEL + 0.3, bz);
    yg.rotation.y = (y % 2 === 0 ? 0.15 : -0.18);

    const hull = new THREE.Mesh(hullGeo, y % 2 === 0 ? yachtHullMat : yachtNavyMat);
    const teak = new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.15, 3.3), pierWoodMat);
    teak.position.y = 0.95;
    const cab = new THREE.Mesh(cabinGeo, cabinGlassMat);
    cab.position.set(-0.6, 1.75, 0);
    const fly = new THREE.Mesh(flyGeo, yachtHullMat);
    fly.position.set(-1.1, 2.85, 0);
    yg.add(hull, teak, cab, fly);
    marinaGroup.add(yg);
    bobbingBoats.push({ group: yg, baseY: CORAL_BAY_WATER_LEVEL + 0.3, phase: y * 1.1 });
  }

  for (let c = 0; c < 4; c++) {
    const cg = new THREE.Group();
    const cx = -282 - (c % 2) * 22;
    const cz = 66 + c * 19;
    cg.position.set(cx, CORAL_BAY_WATER_LEVEL + 0.25, cz);
    cg.rotation.y = 0.25 * (c % 2 === 0 ? 1 : -1);

    const pontoonGeo = new THREE.BoxGeometry(12.2, 1.2, 1.25);
    const p1 = new THREE.Mesh(pontoonGeo, yachtHullMat);
    p1.position.z = -1.85;
    const p2 = new THREE.Mesh(pontoonGeo, yachtHullMat);
    p2.position.z = 1.85;
    const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.5, 4.8), pierWoodMat);
    bridgeDeck.position.y = 0.7;
    const mast = new THREE.Mesh(mastGeo, lhMetalMat);
    mast.position.set(0.5, 9.5, 0);
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.set(0.5, 2.0, 0);
    cg.add(p1, p2, bridgeDeck, mast, sail);
    marinaGroup.add(cg);
    bobbingBoats.push({ group: cg, baseY: CORAL_BAY_WATER_LEVEL + 0.25, phase: c * 1.7 + 0.5 });
  }

  // 5. Beachfront Promenade (x = -195..145, z ~ 316), Watchtowers ([76, 326], [-108, 322]), 9 Cabana Villas
  const promGroup = new THREE.Group();
  parent.add(promGroup);

  const promGeo = new THREE.BoxGeometry(340, 0.55, 5.2);
  const promY = terrain.getHeight(-25, 316);
  const promMesh = new THREE.Mesh(promGeo, pierWoodMat);
  promMesh.position.set(-25, Math.max(promY, 1.8) + 0.25, 316);
  promMesh.receiveShadow = true;
  promGroup.add(promMesh);
  disposables.push(promGeo);

  // Parasols, loungers, tiki torches
  const parasolGeo = new THREE.ConeGeometry(1.75, 0.75, 8);
  const parasolPoleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6);
  const parasolMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.7 });
  const torchFlameMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xf97316,
    emissiveIntensity: 1.8,
  });
  disposables.push(parasolGeo, parasolPoleGeo, parasolMat, torchFlameMat);

  for (let bx = -175; bx <= 130; bx += 22) {
    const bz = 328 + Math.sin(bx * 0.03) * 4;
    const by = terrain.getHeight(bx, bz);
    if (by < 0.3) continue;
    const pole = new THREE.Mesh(parasolPoleGeo, pierWoodMat);
    pole.position.set(bx, by + 1.2, bz);
    const top = new THREE.Mesh(parasolGeo, parasolMat);
    top.position.set(bx, by + 2.45, bz);
    promGroup.add(pole, top);

    // Tiki torch along boardwalk
    const tPole = new THREE.Mesh(parasolPoleGeo, pilingMat);
    tPole.position.set(bx + 4, Math.max(promY, 1.8) + 1.1, 313.6);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), torchFlameMat);
    flame.position.set(bx + 4, Math.max(promY, 1.8) + 2.35, 313.6);
    promGroup.add(tPole, flame);
  }

  // 2 Elevated Lifeguard Watchtowers ([76, 326], [-108, 322])
  const lgCoords: [number, number][] = [
    [76, 326],
    [-108, 322],
  ];
  const lgCabGeo = new THREE.BoxGeometry(3.2, 2.6, 3.2);
  const lgRoofGeo = new THREE.ConeGeometry(2.9, 1.5, 4);
  const lgLegGeo = new THREE.CylinderGeometry(0.14, 0.16, 4.4, 6);
  const lgPaintMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55 });
  const lgRoofMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.55 });
  disposables.push(lgCabGeo, lgRoofGeo, lgLegGeo, lgPaintMat, lgRoofMat);

  for (let i = 0; i < lgCoords.length; i++) {
    const [lx, lz] = lgCoords[i];
    const ly = terrain.getHeight(lx, lz);
    const lg = new THREE.Group();
    lg.position.set(lx, ly, lz);
    for (const sx of [-1.2, 1.2]) {
      for (const sz of [-1.2, 1.2]) {
        const leg = new THREE.Mesh(lgLegGeo, pierWoodMat);
        leg.position.set(sx, 2.0, sz);
        lg.castShadow = true;
        lg.add(leg);
      }
    }
    const cab = new THREE.Mesh(lgCabGeo, lgPaintMat);
    cab.position.y = 5.1;
    const roof = new THREE.Mesh(lgRoofGeo, lgRoofMat);
    roof.position.y = 7.1;
    roof.rotation.y = Math.PI / 4;
    lg.add(cab, roof);
    promGroup.add(lg);
  }

  // 9 Multi-Part Resort Cabana Villas with warm emissive windows
  const villaWallGeo = new THREE.BoxGeometry(8.6, 4.2, 6.8);
  const villaRoofGeo = new THREE.ConeGeometry(6.8, 3.0, 4);
  const villaDeckGeo = new THREE.BoxGeometry(9.6, 0.8, 8.2);
  const villaWinGeo = new THREE.BoxGeometry(2.6, 1.6, 0.2);
  const villaWallMat = new THREE.MeshStandardMaterial({ color: 0xf5efe6, roughness: 0.78 });
  const villaRoofMat = new THREE.MeshStandardMaterial({ color: 0x9a6b42, roughness: 0.88 });
  const warmWinMat = new THREE.MeshStandardMaterial({
    color: 0xfde68a,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.75,
    roughness: 0.2,
  });
  disposables.push(
    villaWallGeo,
    villaRoofGeo,
    villaDeckGeo,
    villaWinGeo,
    villaWallMat,
    villaRoofMat,
    warmWinMat
  );

  for (let v = 0; v < 9; v++) {
    const vx = -168 + v * 39;
    const vz = 294 + (v % 2) * 8;
    if (trackQuery.minDist(vx, vz) < hw + 11.5) continue;
    const vy = terrain.getHeight(vx, vz);
    const vg = new THREE.Group();
    vg.position.set(vx, vy, vz);
    const deck = new THREE.Mesh(villaDeckGeo, pierWoodMat);
    deck.position.y = 0.2;
    const wall = new THREE.Mesh(villaWallGeo, villaWallMat);
    wall.position.y = 2.6;
    wall.castShadow = true;
    const roof = new THREE.Mesh(villaRoofGeo, villaRoofMat);
    roof.position.y = 6.1;
    roof.rotation.y = Math.PI / 4;
    const win = new THREE.Mesh(villaWinGeo, warmWinMat);
    win.position.set(0, 2.7, 3.45);
    vg.add(deck, wall, roof, win);
    promGroup.add(vg);

    registry.obbs.push({
      id: `cb_villa_${v}`,
      kind: 'building',
      centerX: vx,
      centerZ: vz,
      halfW: 4.8,
      halfD: 4.1,
      axisX: 1,
      axisZ: 0,
      minY: vy - 1,
      maxY: vy + 8,
    });
  }

  // 6. Animated Wildlife: 16 Flocking Coastal Seabirds + up to 36 Articulated Beach Crabs
  const birdCount = 16;
  const birdBody = normalizeGeoForMerge(new THREE.ConeGeometry(0.28, 1.3, 5));
  birdBody.rotateX(Math.PI / 2);
  const birdWingL = normalizeGeoForMerge(new THREE.BoxGeometry(1.6, 0.06, 0.48));
  birdWingL.translate(-0.85, 0, 0);
  const birdWingR = normalizeGeoForMerge(new THREE.BoxGeometry(1.6, 0.06, 0.48));
  birdWingR.translate(0.85, 0, 0);
  const birdGeo = mergeGeometries([birdBody, birdWingL, birdWingR]);
  const birdMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55 });
  const seabirdInst = new THREE.InstancedMesh(birdGeo, birdMat, birdCount);
  seabirdInst.frustumCulled = false;
  parent.add(seabirdInst);
  disposables.push(birdGeo, birdMat);

  const crabCount = 36;
  const crabBody = normalizeGeoForMerge(new THREE.SphereGeometry(0.26, 8, 6));
  crabBody.scale(1.3, 0.55, 1.0);
  const crabClawL = normalizeGeoForMerge(new THREE.BoxGeometry(0.16, 0.1, 0.24));
  crabClawL.translate(-0.24, 0.04, 0.22);
  const crabClawR = normalizeGeoForMerge(new THREE.BoxGeometry(0.16, 0.1, 0.24));
  crabClawR.translate(0.24, 0.04, 0.22);
  const crabGeo = mergeGeometries([crabBody, crabClawL, crabClawR]);
  const crabMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.48 });
  const crabInst = new THREE.InstancedMesh(crabGeo, crabMat, crabCount);
  crabInst.frustumCulled = false;

  const crabStates: { x: number; z: number; homeX: number; homeZ: number; yaw: number }[] = [];
  for (let c = 0; c < crabCount; c++) {
    const cx = -180 + c * 10.2;
    const cz = 326 + ((c * 19) % 14);
    crabStates.push({ x: cx, z: cz, homeX: cx, homeZ: cz, yaw: (c * 1.1) % (Math.PI * 2) });
  }
  const wDummy = new THREE.Object3D();
  crabStates.forEach((cr, i) => {
    wDummy.position.set(cr.x, terrain.getHeight(cr.x, cr.z) + 0.12, cr.z);
    wDummy.updateMatrix();
    crabInst.setMatrixAt(i, wDummy.matrix);
  });
  crabInst.instanceMatrix.needsUpdate = true;
  crabInst.computeBoundingSphere();
  parent.add(crabInst);
  disposables.push(crabGeo, crabMat);

  // 7. Static Tropical Foliage, Beach Umbrellas & Coastal Rocks (ZERO wind turning/sway!)
  // A. Lush Coconut Palms: 8-segment curved ringed trunk, 5 coconuts, 16 curved feathered botanical fronds
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x6b5039,
    normalMap: textures.barkNormal,
    roughness: 0.9,
  });
  const frondMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.palmFrondMap,
    alphaTest: 0.36,
    roughness: 0.62,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const palmTrunkParts: THREE.BufferGeometry[] = [];
  const palmFrondParts: THREE.BufferGeometry[] = [];

  for (let seg = 0; seg < 8; seg++) {
    const t0 = seg / 8;
    const t1 = (seg + 1) / 8;
    const rBot = 0.38 - t0 * 0.18;
    const rTop = 0.38 - t1 * 0.18;
    const sGeo = normalizeGeoForMerge(new THREE.CylinderGeometry(rTop, rBot, 1.28, 7));
    const leanX = seg * seg * 0.038;
    sGeo.rotateZ(-seg * 0.036);
    sGeo.translate(leanX, seg * 1.2 + 0.62, 0);
    palmTrunkParts.push(sGeo);
  }
  const crownX = 7 * 7 * 0.038 + 0.14;
  const crownY = 8 * 1.2;
  for (let c = 0; c < 5; c++) {
    const ang = (c / 5) * Math.PI * 2;
    const coco = normalizeGeoForMerge(new THREE.SphereGeometry(0.26, 7, 5));
    coco.translate(crownX + Math.cos(ang) * 0.35, crownY - 0.18, Math.sin(ang) * 0.35);
    palmTrunkParts.push(coco);
  }

  // Sculpted arched V-creased pinnate frond ribbon geometry mapped to textures.palmFrondMap
  const buildCurvedFrond = (len: number, width: number, archLift: number, droop: number): THREE.BufferGeometry => {
    const segs = 7;
    const positions = new Float32Array((segs + 1) * 3 * 3);
    const uvs = new Float32Array((segs + 1) * 3 * 2);
    const idx: number[] = [];
    const halfW = width * 0.5;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const dist = t * len;
      const y = Math.sin(t * Math.PI * 0.72) * archLift - t * t * droop;
      const wScale = 0.72 + Math.sin(t * Math.PI) * 0.35;
      const hwLeaf = halfW * wScale;
      const creaseDrop = hwLeaf * 0.24;

      const base = i * 3;
      // Left edge, central spine (slightly elevated for V-fold), right edge
      positions[base * 3] = dist;
      positions[base * 3 + 1] = y - creaseDrop;
      positions[base * 3 + 2] = -hwLeaf;

      positions[(base + 1) * 3] = dist;
      positions[(base + 1) * 3 + 1] = y;
      positions[(base + 1) * 3 + 2] = 0;

      positions[(base + 2) * 3] = dist;
      positions[(base + 2) * 3 + 1] = y - creaseDrop;
      positions[(base + 2) * 3 + 2] = hwLeaf;

      uvs[base * 2] = 0.0;
      uvs[base * 2 + 1] = t;
      uvs[(base + 1) * 2] = 0.5;
      uvs[(base + 1) * 2 + 1] = t;
      uvs[(base + 2) * 2] = 1.0;
      uvs[(base + 2) * 2 + 1] = t;

      if (i < segs) {
        const a = base;
        const b = base + 1;
        const c = base + 2;
        const d = base + 3;
        const e = base + 4;
        const f = base + 5;
        idx.push(a, d, b, b, d, e, b, e, c, c, e, f);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return normalizeGeoForMerge(g);
  };

  // Lower drooping lush fronds (11) + upper sunlit arching fronds (7)
  for (let f = 0; f < 11; f++) {
    const yaw = (f / 11) * Math.PI * 2 + (f % 2) * 0.14;
    const blade = buildCurvedFrond(5.3, 2.15, 1.25, 2.45);
    blade.rotateY(yaw);
    blade.translate(crownX, crownY + 0.14, 0);
    palmFrondParts.push(blade);
  }
  for (let f = 0; f < 7; f++) {
    const yaw = (f / 7) * Math.PI * 2 + 0.28;
    const blade = buildCurvedFrond(4.3, 1.85, 1.95, 1.55);
    blade.rotateY(yaw);
    blade.translate(crownX, crownY + 0.34, 0);
    palmFrondParts.push(blade);
  }

  const mergedPalmTrunk = mergeGeometries(palmTrunkParts);
  const mergedPalmFronds = mergeGeometries(palmFrondParts);
  disposables.push(trunkMat, frondMat, mergedPalmTrunk, mergedPalmFronds);

  const palmTrunkMatrices: THREE.Matrix4[] = [];
  const palmColorTints: THREE.Color[] = [];
  const foliageDummy = new THREE.Object3D();

  // ~1,350 placement attempts for Coconut Palms (strict road clearance >= hw + 6.8)
  for (let a = 0; a < 1350; a++) {
    const h1 = hash2(a, 11);
    const h2 = hash2(a, 29);
    const x = (h1 - 0.5) * 920;
    const z = (h2 - 0.5) * 920;
    const y = terrain.getHeight(x, z);
    if (y < 0.7 || y > 26) continue;
    if (terrain.getSlope(x, z) > 0.65) continue;
    if (terrain.isPitOrGrandstandPad(x, z) > 0.15) continue;
    const dRoad = trackQuery.minDist(x, z);
    if (dRoad < hw + 6.8) continue;

    const sc = 0.88 + hash2(a, 53) * 0.48;
    foliageDummy.position.set(x, y - 0.18, z);
    foliageDummy.rotation.set(0, hash2(a, 71) * Math.PI * 2, (hash2(a, 83) - 0.5) * 0.14);
    foliageDummy.scale.set(sc, sc, sc);
    foliageDummy.updateMatrix();
    palmTrunkMatrices.push(foliageDummy.matrix.clone());
    palmColorTints.push(new THREE.Color().setHSL(0.28 + (hash2(a, 97) - 0.5) * 0.04, 0.44, 0.76 + hash2(a, 101) * 0.22));

    if (dRoad < 65) {
      registry.circles.push({
        id: `cb_palm_${a}`,
        kind: 'wood',
        x,
        z,
        radius: 0.48 * sc,
        minY: y - 1,
        maxY: y + 10.5 * sc,
      });
    }
  }

  if (palmTrunkMatrices.length > 0) {
    const pTrunkInst = new THREE.InstancedMesh(mergedPalmTrunk, trunkMat, palmTrunkMatrices.length);
    const pFrondInst = new THREE.InstancedMesh(mergedPalmFronds, frondMat, palmTrunkMatrices.length);
    for (let i = 0; i < palmTrunkMatrices.length; i++) {
      pTrunkInst.setMatrixAt(i, palmTrunkMatrices[i]);
      pFrondInst.setMatrixAt(i, palmTrunkMatrices[i]);
      pFrondInst.setColorAt(i, palmColorTints[i]);
    }
    pTrunkInst.instanceMatrix.needsUpdate = true;
    pFrondInst.instanceMatrix.needsUpdate = true;
    if (pFrondInst.instanceColor) pFrondInst.instanceColor.needsUpdate = true;
    pTrunkInst.castShadow = true;
    pFrondInst.castShadow = false;
    pTrunkInst.computeBoundingSphere();
    pFrondInst.computeBoundingSphere();
    parent.add(pTrunkInst, pFrondInst);
  }

  // Beach Vibe Umbrellas & Sun Loungers across ALL sandy lagoon/cove & south beaches
  const umbCanopyGeo = new THREE.ConeGeometry(1.85, 0.72, 8);
  umbCanopyGeo.translate(0, 2.2, 0);
  const umbPoleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.35, 6);
  umbPoleGeo.translate(0, 1.15, 0);
  const loungerGeo = new THREE.BoxGeometry(0.85, 0.22, 2.0);
  loungerGeo.translate(0, 0.22, 0);
  const umbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.65 });
  const teakMat = new THREE.MeshStandardMaterial({ color: 0x8b6238, roughness: 0.85 });
  disposables.push(umbCanopyGeo, umbPoleGeo, loungerGeo, umbMat, teakMat);

  const umbMats: THREE.Matrix4[] = [];
  const umbTints: THREE.Color[] = [];
  const loungeMats: THREE.Matrix4[] = [];
  const beachPalette = [0x06b6d4, 0xf97316, 0xf8fafc, 0x14b8a6, 0xef4444];
  for (let b = 0; b < 140; b++) {
    const bx = b < 68 ? -260 + hash2(b, 31) * 480 : (hash2(b, 19) - 0.5) * 820;
    const bz = b < 68 ? 265 + hash2(b, 47) * 72 : (hash2(b, 23) - 0.5) * 760;
    const by = terrain.getHeight(bx, bz);
    if (by < 0.65 || by > 5.0) continue;
    if (terrain.getSlope(bx, bz) > 0.42) continue;
    if (terrain.isPitOrGrandstandPad(bx, bz) > 0.1) continue;
    if (trackQuery.minDist(bx, bz) < hw + 10.5) continue;
    foliageDummy.position.set(bx, by - 0.08, bz);
    foliageDummy.rotation.set(0, hash2(b, 61) * Math.PI * 2, (hash2(b, 67) - 0.5) * 0.14);
    foliageDummy.scale.setScalar(1.0);
    foliageDummy.updateMatrix();
    umbMats.push(foliageDummy.matrix.clone());
    umbTints.push(new THREE.Color(beachPalette[b % beachPalette.length]));

    foliageDummy.position.set(bx + 1.35, by - 0.04, bz + 0.35);
    foliageDummy.rotation.set(0, hash2(b, 61) * Math.PI * 2, 0);
    foliageDummy.updateMatrix();
    loungeMats.push(foliageDummy.matrix.clone());
  }
  if (umbMats.length > 0) {
    const uCanInst = new THREE.InstancedMesh(umbCanopyGeo, umbMat, umbMats.length);
    const uPoleInst = new THREE.InstancedMesh(umbPoleGeo, teakMat, umbMats.length);
    const lInst = new THREE.InstancedMesh(loungerGeo, teakMat, loungeMats.length);
    for (let i = 0; i < umbMats.length; i++) {
      uCanInst.setMatrixAt(i, umbMats[i]);
      uCanInst.setColorAt(i, umbTints[i]);
      uPoleInst.setMatrixAt(i, umbMats[i]);
      lInst.setMatrixAt(i, loungeMats[i]);
    }
    uCanInst.instanceMatrix.needsUpdate = true;
    if (uCanInst.instanceColor) uCanInst.instanceColor.needsUpdate = true;
    uPoleInst.instanceMatrix.needsUpdate = true;
    lInst.instanceMatrix.needsUpdate = true;
    uCanInst.castShadow = true;
    parent.add(uCanInst, uPoleInst, lInst);
  }

  // B. Rounded Tropical Umbrella-Canopy Banyan Trees (no pine cones in tropical Coral Bay!)
  const banyanParts: THREE.BufferGeometry[] = [];
  const tierCoords: [number, number, number, number][] = [
    [0, 4.8, 0, 2.25],
    [1.35, 4.1, 0.9, 1.65],
    [-1.25, 4.2, -0.8, 1.7],
    [0.45, 5.7, -0.55, 1.45],
    [-0.55, 3.8, 1.15, 1.5],
  ];
  for (const [tx, ty, tz, rad] of tierCoords) {
    const puff = normalizeGeoForMerge(new THREE.IcosahedronGeometry(rad, 1));
    puff.scale(1.18, 0.72, 1.18);
    puff.translate(tx, ty, tz);
    banyanParts.push(puff);
  }
  const banyanCrownGeo = mergeGeometries(banyanParts);
  const banyanTrunkGeo = normalizeGeoForMerge(new THREE.CylinderGeometry(0.28, 0.52, 3.4, 7));
  banyanTrunkGeo.translate(0, 1.7, 0);
  const banyanMat = new THREE.MeshStandardMaterial({
    color: 0x204b24,
    roughness: 0.86,
    flatShading: true,
  });
  disposables.push(banyanCrownGeo, banyanTrunkGeo, banyanMat);

  const banyanMats: THREE.Matrix4[] = [];
  const banyanTints: THREE.Color[] = [];
  for (let a = 0; a < 2100 && banyanMats.length < 1550; a++) {
    const x = (hash2(a + 2000, 17) - 0.5) * 900;
    const z = (hash2(a + 2000, 31) - 0.5) * 900;
    const y = terrain.getHeight(x, z);
    if (y < 2.2 || y > 58) continue;
    if (terrain.getSlope(x, z) > 0.72) continue;
    if (terrain.isPitOrGrandstandPad(x, z) > 0.12) continue;
    const dRoad = trackQuery.minDist(x, z);
    if (dRoad < hw + 7.2) continue;

    const sc = 0.75 + hash2(a + 2000, 47) * 0.65;
    foliageDummy.position.set(x, y - 0.15, z);
    foliageDummy.rotation.set(0, hash2(a + 2000, 61) * Math.PI * 2, 0);
    foliageDummy.scale.set(sc, sc, sc);
    foliageDummy.updateMatrix();
    banyanMats.push(foliageDummy.matrix.clone());
    banyanTints.push(new THREE.Color().setHSL(0.28 + (hash2(a, 79) - 0.5) * 0.05, 0.38, 0.22));

    if (dRoad < 55) {
      registry.circles.push({
        id: `cb_banyan_${a}`,
        kind: 'wood',
        x,
        z,
        radius: 0.65 * sc,
        minY: y - 1,
        maxY: y + 7 * sc,
      });
    }
  }
  if (banyanMats.length > 0) {
    const btInst = new THREE.InstancedMesh(banyanTrunkGeo, trunkMat, banyanMats.length);
    const bcInst = new THREE.InstancedMesh(banyanCrownGeo, banyanMat, banyanMats.length);
    for (let i = 0; i < banyanMats.length; i++) {
      btInst.setMatrixAt(i, banyanMats[i]);
      bcInst.setMatrixAt(i, banyanMats[i]);
      bcInst.setColorAt(i, banyanTints[i]);
    }
    btInst.instanceMatrix.needsUpdate = true;
    bcInst.instanceMatrix.needsUpdate = true;
    if (bcInst.instanceColor) bcInst.instanceColor.needsUpdate = true;
    btInst.computeBoundingSphere();
    bcInst.computeBoundingSphere();
    parent.add(btInst, bcInst);
  }

  // C. Coastal Hibiscus / Monstera Shrubs (up to 2,450 instances)
  const shrubGeo = new THREE.DodecahedronGeometry(0.95, 0);
  shrubGeo.translate(0, 0.6, 0);
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x26542a, roughness: 0.88, flatShading: true });
  disposables.push(shrubGeo, shrubMat);
  const shrubMats: THREE.Matrix4[] = [];
  const shrubTints: THREE.Color[] = [];
  for (let a = 0; a < 3100 && shrubMats.length < 2450; a++) {
    const x = (hash2(a + 5000, 13) - 0.5) * 900;
    const z = (hash2(a + 5000, 29) - 0.5) * 900;
    const y = terrain.getHeight(x, z);
    if (y < 1.2 || y > 48) continue;
    if (terrain.getSlope(x, z) > 0.75) continue;
    if (terrain.isPitOrGrandstandPad(x, z) > 0.1) continue;
    if (trackQuery.minDist(x, z) < hw + 5.6) continue;
    const sc = 0.65 + hash2(a + 5000, 41) * 0.7;
    foliageDummy.position.set(x, y - 0.1, z);
    foliageDummy.rotation.set(0, hash2(a + 5000, 59) * Math.PI * 2, 0);
    foliageDummy.scale.set(sc * 1.15, sc * 0.85, sc * 1.15);
    foliageDummy.updateMatrix();
    shrubMats.push(foliageDummy.matrix.clone());
    shrubTints.push(
      hash2(a + 5000, 83) > 0.9
        ? new THREE.Color(0xc83e56) // hibiscus bloom accent
        : new THREE.Color().setHSL(0.29, 0.36, 0.22 + hash2(a, 7) * 0.08)
    );
  }
  if (shrubMats.length > 0) {
    const sInst = new THREE.InstancedMesh(shrubGeo, shrubMat, shrubMats.length);
    for (let i = 0; i < shrubMats.length; i++) {
      sInst.setMatrixAt(i, shrubMats[i]);
      sInst.setColorAt(i, shrubTints[i]);
    }
    sInst.instanceMatrix.needsUpdate = true;
    if (sInst.instanceColor) sInst.instanceColor.needsUpdate = true;
    sInst.computeBoundingSphere();
    parent.add(sInst);
  }

  // D. Golden Beach Dune Grass (up to 1,350 instanced tufts)
  const grassBladeA = normalizeGeoForMerge(new THREE.ConeGeometry(0.28, 0.9, 4));
  grassBladeA.translate(0, 0.45, 0);
  const grassBladeB = normalizeGeoForMerge(new THREE.ConeGeometry(0.24, 0.82, 4));
  grassBladeB.rotateZ(0.26);
  grassBladeB.translate(0.18, 0.4, 0.1);
  const grassGeo = mergeGeometries([grassBladeA, grassBladeB]);
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x9b8e52, roughness: 0.92 });
  disposables.push(grassGeo, grassMat);

  const grassMats: THREE.Matrix4[] = [];
  for (let a = 0; a < 2200 && grassMats.length < 1350; a++) {
    const x = (hash2(a + 9000, 19) - 0.5) * 860;
    const z = 190 + hash2(a + 9000, 37) * 185; // concentrated on southern sandy dunes & coast
    const y = terrain.getHeight(x, z);
    if (y < 0.5 || y > 7.5) continue;
    if (terrain.isPitOrGrandstandPad(x, z) > 0.1) continue;
    if (trackQuery.minDist(x, z) < hw + 5.2) continue;
    const sc = 0.75 + hash2(a + 9000, 43) * 0.6;
    foliageDummy.position.set(x, y - 0.05, z);
    foliageDummy.rotation.set(0, hash2(a + 9000, 71) * Math.PI * 2, 0);
    foliageDummy.scale.set(sc, sc, sc);
    foliageDummy.updateMatrix();
    grassMats.push(foliageDummy.matrix.clone());
  }
  if (grassMats.length > 0) {
    const gInst = new THREE.InstancedMesh(grassGeo, grassMat, grassMats.length);
    for (let i = 0; i < grassMats.length; i++) gInst.setMatrixAt(i, grassMats[i]);
    gInst.instanceMatrix.needsUpdate = true;
    gInst.computeBoundingSphere();
    parent.add(gInst);
  }

  // E. Stratified Coral Limestone Boulders (up to 520 instances, rock colliders) + 16 Offshore Sea Stacks
  const boulderGeo = new THREE.DodecahedronGeometry(1.45, 0);
  const boulderMat = new THREE.MeshStandardMaterial({
    color: 0x6e685e,
    roughness: 0.9,
    flatShading: true,
  });
  disposables.push(boulderGeo, boulderMat);

  const boulderMats: THREE.Matrix4[] = [];
  for (let a = 0; a < 900 && boulderMats.length < 520; a++) {
    const x = (hash2(a + 12000, 23) - 0.5) * 920;
    const z = (hash2(a + 12000, 41) - 0.5) * 920;
    const y = terrain.getHeight(x, z);
    if (y < -1.0 || y > 75) continue;
    const slope = terrain.getSlope(x, z);
    if (slope > 0.62) continue;
    if (terrain.isPitOrGrandstandPad(x, z) > 0.1) continue;
    const dRoad = trackQuery.minDist(x, z);
    if (dRoad < hw + 6.0) continue;

    const sx = 0.75 + hash2(a + 12000, 61) * 1.4;
    const sy = 0.6 + hash2(a + 12000, 67) * 1.1;
    const sz = 0.75 + hash2(a + 12000, 73) * 1.3;
    foliageDummy.position.set(x, y - sy * 0.2 - slope * 0.8, z);
    foliageDummy.rotation.set(
      hash2(a, 3) * 0.4,
      hash2(a, 5) * Math.PI * 2,
      hash2(a, 7) * 0.4
    );
    foliageDummy.scale.set(sx, sy, sz);
    foliageDummy.updateMatrix();
    boulderMats.push(foliageDummy.matrix.clone());

    if (dRoad < 55) {
      registry.circles.push({
        id: `cb_boulder_${a}`,
        kind: 'rock',
        x,
        z,
        radius: Math.max(sx, sz) * 1.15,
        minY: y - 1,
        maxY: y + sy * 2.4,
      });
    }
  }
  if (boulderMats.length > 0) {
    const bInst = new THREE.InstancedMesh(boulderGeo, boulderMat, boulderMats.length);
    for (let i = 0; i < boulderMats.length; i++) bInst.setMatrixAt(i, boulderMats[i]);
    bInst.instanceMatrix.needsUpdate = true;
    bInst.castShadow = true;
    bInst.receiveShadow = true;
    bInst.computeBoundingSphere();
    parent.add(bInst);
  }

  // Natural Jagged Volcanic Sea Rock Outcrops (deep ocean only, never protruding on land)
  const cragA = normalizeGeoForMerge(new THREE.DodecahedronGeometry(6.8, 1));
  cragA.scale(1.15, 1.35, 0.95);
  cragA.translate(0, 4.2, 0);
  const cragB = normalizeGeoForMerge(new THREE.DodecahedronGeometry(4.8, 0));
  cragB.scale(1.25, 0.85, 1.1);
  cragB.translate(4.8, 1.8, 2.2);
  const stackGeo = mergeGeometries([cragA, cragB]);
  const basaltRockMat = new THREE.MeshStandardMaterial({
    color: 0x45413b,
    roughness: 0.92,
    flatShading: true,
  });
  disposables.push(stackGeo, basaltRockMat);
  for (let s = 0; s < 14; s++) {
    const ang = (s / 14) * Math.PI * 2 + 0.24;
    const rad = 465 + (s % 3) * 34;
    const sx = Math.cos(ang) * rad;
    const sz = Math.sin(ang) * rad;
    if (terrain.getHeight(sx, sz) > -1.8) continue;
    const sy = CORAL_BAY_WATER_LEVEL - 2.2;
    const stack = new THREE.Mesh(stackGeo, basaltRockMat);
    stack.position.set(sx, sy, sz);
    stack.scale.set(0.85 + (s % 4) * 0.22, 0.8 + (s % 3) * 0.28, 0.85 + ((s + 1) % 4) * 0.22);
    stack.rotation.y = s * 1.1;
    parent.add(stack);
  }

  return {
    update: (elapsed, playerPos, crowdExcitement) => {
      pitAddon.updateCrowd(elapsed, crowdExcitement);
      fanZones.updateFlags(elapsed);

      // Rotating lighthouse lantern
      lanternRotor.rotation.y = elapsed * 0.85;

      // Gentle bobbing yachts & catamarans
      for (let i = 0; i < bobbingBoats.length; i++) {
        const b = bobbingBoats[i];
        b.group.position.y = b.baseY + Math.sin(elapsed * 1.45 + b.phase) * 0.18;
        b.group.rotation.z = Math.sin(elapsed * 1.15 + b.phase) * 0.035;
      }

      // Flocking coastal seabirds circling bay & headlands
      for (let i = 0; i < birdCount; i++) {
        const ang = elapsed * (0.28 + (i % 4) * 0.04) + (i / birdCount) * Math.PI * 2;
        const rad = 110 + (i % 5) * 42;
        const bx = 55 + Math.cos(ang) * rad;
        const bz = -60 + Math.sin(ang) * rad * 0.85;
        const by = 42 + Math.sin(elapsed * 1.6 + i) * 5.5 + (i % 3) * 6;
        wDummy.position.set(bx, by, bz);
        wDummy.rotation.set(0, -ang, Math.sin(elapsed * 5.5 + i) * 0.22);
        wDummy.scale.setScalar(1.0);
        wDummy.updateMatrix();
        seabirdInst.setMatrixAt(i, wDummy.matrix);
      }
      seabirdInst.instanceMatrix.needsUpdate = true;

      // Articulated beach crabs patrolling sand and scattering away from playerPos
      for (let i = 0; i < crabCount; i++) {
        const cr = crabStates[i];
        const dx = cr.x - playerPos.x;
        const dz = cr.z - playerPos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 16 && dist > 0.1) {
          cr.x += (dx / dist) * 0.28;
          cr.z += (dz / dist) * 0.28;
          cr.yaw = Math.atan2(dx, dz);
        } else {
          const patrolX = cr.homeX + Math.sin(elapsed * 0.7 + i * 1.3) * 2.8;
          const patrolZ = cr.homeZ + Math.cos(elapsed * 0.6 + i * 0.9) * 1.8;
          cr.x += (patrolX - cr.x) * 0.04;
          cr.z += (patrolZ - cr.z) * 0.04;
        }
        cr.x = clamp(cr.x, -210, 175);
        cr.z = clamp(cr.z, 318, 355);
        const cy = terrain.getHeight(cr.x, cr.z);
        wDummy.position.set(cr.x, Math.max(cy, 0.05) + 0.14, cr.z);
        wDummy.rotation.set(0, cr.yaw, 0);
        wDummy.scale.setScalar(1.0);
        wDummy.updateMatrix();
        crabInst.setMatrixAt(i, wDummy.matrix);
      }
      crabInst.instanceMatrix.needsUpdate = true;
    },
    setNightFactor: (night) => {
      pitAddon.setNightFactor(night);
      sharedInfra.setNightFactor(night);
      lhPointLight.intensity = 10 + night * 28;
      beamMat.uniforms.uOpacity.value = 0.24 + night * 0.26;
      coronaMat.uniforms.uOpacity.value = 0.26 + night * 0.28;
      warmWinMat.emissiveIntensity = 0.4 + night * 1.4;
      archLight.intensity = 4 + night * 18;
    },
    dispose: () => {
      pitAddon.dispose();
      fanZones.dispose();
      sharedInfra.dispose();
      disposables.forEach((d) => d.dispose());
    },
  };
}
