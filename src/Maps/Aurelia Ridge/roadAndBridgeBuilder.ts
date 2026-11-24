import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  getCircuitData,
  getCustomBlueprint,
  ROAD_HALF_WIDTH,
  SHOULDER_WIDTH,
} from './circuitSpline';
import { lerp } from '../../engine/mathNoise';
import { ProceduralTextureSuite } from './proceduralTextures';
import { type WeatherUniforms } from './skyAndLighting';
import { groundHeightAt } from './terrainField';
import { worldColliders } from './worldColliders';
import {
  buildRecessedDrainGrates,
  buildSegmented3DFiaCurbs,
  compactIndexBuffer,
  patchWeatheredAsphaltMaterial,
} from '../sharedRoadDetailKit';
import { buildSpatialChunkedRoadMesh } from '../sharedRoadChunker';

export interface RoadAndBridgeRig {
  group: THREE.Group;
  setWireframe: (wire: boolean) => void;
  setNightFactor: (nightFactor: number) => void;
  setRubberLevel: (level: number) => void;
  setAsphaltWear?: (wear: number) => void;
  setSnowAccumulation?: (level: number) => void;
  updateVisibilityWindow?: (
    focusPos: THREE.Vector3,
    radiusM?: number,
    camPos?: THREE.Vector3,
    camFwd?: THREE.Vector3,
  ) => void;
  dispose: () => void;
}

/**
 * Builds the entire motorsport race-track surface, bridge, and barrier system:
 * - Solid upward-wound 15m banked asphalt carriageway + shoulders + white track limits
 * - Toggleable wet-road puddle mirror reflections & raindrop normal ripples
 * - Start/Finish checkered line & empty grid decal
 * - FIA red/white apex rumble curbs + gravel runoff traps
 * - Twin-Pylon Cable-Stayed Suspension Bridge with solid deck slab, lake caisson pillars,
 *   secondary approach piers, yaw-aligned A-frame towers, and 64 symmetric stay cables
 * - Double-tier 3D steel guardrails (with Pit-Lane entry/exit cutout), FIA catch-fencing,
 *   red/white hairpin tire-barrier stacks, storm-drain grates, post reflectors, and cat-eyes
 */
export function buildRoadAndBridgeRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): RoadAndBridgeRig {
  const group = new THREE.Group();
  group.name = 'RoadAndBridgeRig';

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
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };

  // ---------------------------------------------------------------------------
  // 1. CONTINUOUS BANKED ASPHALT CARRIAGEWAY + CROWN CAMBER + SHOULDER SKIRTS
  // Winding rule: columns go -right -> +right, rings go +tangent.
  // Triangles (a, b, d) and (b, e, d) yield (+right) x (+tangent) = +up!
  // ---------------------------------------------------------------------------
  const cols = 7;
  const vertCount = (N + 1) * cols;
  const roadPos = new Float32Array(vertCount * 3);
  const roadUv = new Float32Array(vertCount * 2);
  const roadApexBias = new Float32Array(vertCount);

  const shoulderExtra = 1.75;
  const halfAsp = circuit.roadHalfWidth;
  const halfFull = halfAsp + shoulderExtra;
  const vScale = circuit.totalLength / 14.0;

  const roadSegCount = circuit.closedLoop ? N : N - 1;
  for (let i = 0; i <= N; i++) {
    const s = samples[circuit.closedLoop ? i % N : Math.min(i, N - 1)];
    const v = (i / N) * vScale;
    const p = s.position;
    const r = s.right;
    const u = s.up;
    // Curvature shifts the ideal rubbered racing groove toward the inside apex
    const apexShift = Math.max(-1, Math.min(1, s.curvature * 75));

    const offsets: Array<{ lat: number; lift: number; uCoord: number }> = [
      { lat: -halfFull - 0.35, lift: -0.35, uCoord: 0.0 },
      { lat: -halfFull, lift: -0.01, uCoord: 0.0 },
      { lat: -halfAsp, lift: 0.02, uCoord: 0.0 },
      { lat: 0, lift: 0.075, uCoord: 0.5 },
      { lat: halfAsp, lift: 0.02, uCoord: 1.0 },
      { lat: halfFull, lift: -0.01, uCoord: 1.0 },
      { lat: halfFull + 0.35, lift: -0.35, uCoord: 1.0 },
    ];

    for (let c = 0; c < cols; c++) {
      const o = offsets[c];
      const idx = i * cols + c;
      roadPos[idx * 3] = p.x + r.x * o.lat + u.x * o.lift;
      roadPos[idx * 3 + 1] = p.y + r.y * o.lat + u.y * o.lift;
      roadPos[idx * 3 + 2] = p.z + r.z * o.lat + u.z * o.lift;
      roadUv[idx * 2] = o.uCoord;
      roadUv[idx * 2 + 1] = v;
      roadApexBias[idx] = apexShift;
    }
  }

  const asphaltIndices: number[] = [];
  const shoulderIndices: number[] = [];
  for (let i = 0; i < roadSegCount; i++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c;
      const b = a + 1;
      const d = (i + 1) * cols + c;
      const e = d + 1;
      if (c === 2 || c === 3) {
        asphaltIndices.push(a, b, d, b, e, d);
      } else {
        shoulderIndices.push(a, b, d, b, e, d);
      }
    }
  }

  const roadGeo = trackGeo(new THREE.BufferGeometry());
  roadGeo.setAttribute('position', new THREE.BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(roadUv, 2));
  roadGeo.setAttribute('aApexBias', new THREE.BufferAttribute(roadApexBias, 1));
  roadGeo.setIndex(
    new THREE.BufferAttribute(
      compactIndexBuffer([...asphaltIndices, ...shoulderIndices], vertCount),
      1,
    ),
  );
  roadGeo.clearGroups();
  roadGeo.addGroup(0, asphaltIndices.length, 0);
  roadGeo.addGroup(asphaltIndices.length, shoulderIndices.length, 1);
  roadGeo.computeVertexNormals();

  const customBp = circuit.mapId === 'aurelia_ridge' ? getCustomBlueprint() : null;
  const roadSurfaceTheme = customBp?.roadSurfaceTheme ?? 'asphalt';
  const kerbTheme = customBp?.kerbTheme ?? 'red_white';

  const roadTintColor =
    roadSurfaceTheme === 'concrete'
      ? 0xcbd5e1
      : roadSurfaceTheme === 'dirt'
      ? 0x8d6e4c
      : roadSurfaceTheme === 'snow_tarmac'
      ? 0xdce7f5
      : roadSurfaceTheme === 'neon_grid'
      ? 0x162238
      : 0xffffff;

  const asphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: roadTintColor,
      map: roadSurfaceTheme === 'dirt' ? textures.gravelAlbedo : textures.asphaltAlbedo,
      normalMap: textures.asphaltNormal,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughnessMap: textures.asphaltRoughness,
      roughness: roadSurfaceTheme === 'concrete' ? 0.85 : roadSurfaceTheme === 'dirt' ? 0.96 : 1.0,
      metalness: roadSurfaceTheme === 'neon_grid' ? 0.25 : 0.05,
      emissive: roadSurfaceTheme === 'neon_grid' ? 0x063b54 : 0x000000,
      emissiveIntensity: roadSurfaceTheme === 'neon_grid' ? 0.35 : 0,
      envMapIntensity: 1.15,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const uRubberLevel = { value: 0.08 };
  const uAsphaltWear = { value: 0.35 };

  patchWeatheredAsphaltMaterial(asphaltMat, {
    cacheKey: 'aurelia-asphalt-weathered-wet-rubber-v8',
    sharedWeather,
    uRubberLevel,
    uAsphaltWear,
    asphaltORM: textures.asphaltORM,
    highwayStripeStyle:
      roadSurfaceTheme === 'dirt' || roadSurfaceTheme === 'neon_grid'
        ? 'none'
        : 'white_dashed',
    sparkleStrength: roadSurfaceTheme === 'dirt' ? 0.15 : 0.72,
    frostEdgeRime: roadSurfaceTheme === 'snow_tarmac' ? 0.7 : 0.0,
    edgeDustRgb: [0.28, 0.27, 0.24],
    camberContrast: 0.08,
  });

  const shoulderMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x383b40,
      roughness: 0.9,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const chunkedUpdaters: Array<{
    updateVisibilityWindow: (
      focusPos: THREE.Vector3,
      radiusM?: number,
      camPos?: THREE.Vector3,
      camFwd?: THREE.Vector3,
    ) => void;
    dispose: () => void;
  }> = [];

  const roadChunked = buildSpatialChunkedRoadMesh(roadGeo, [asphaltMat, shoulderMat], {
    cellSizeM: 110,
    castShadow: false,
    receiveShadow: true,
    name: 'AureliaRoadChunks',
  });
  chunkedUpdaters.push(roadChunked);
  group.add(roadChunked.group);

  // ---------------------------------------------------------------------------
  // 2. START / FINISH CHECKERED STRIP & EMPTY GRID DECAL
  // ---------------------------------------------------------------------------
  const sfCenterSample = samples[circuit.startFinishIndex];
  const sfDecalGeo = trackGeo(new THREE.PlaneGeometry(halfAsp * 1.9, 28));
  sfDecalGeo.rotateX(-Math.PI / 2);
  const sfDecalMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.startGridAlbedo,
      transparent: true,
      roughness: 0.65,
      metalness: 0.05,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const sfDecalMesh = new THREE.Mesh(sfDecalGeo, sfDecalMat);
  sfDecalMesh.position.copy(sfCenterSample.position).addScaledVector(sfCenterSample.up, 0.09);
  const sfBasis = new THREE.Matrix4().makeBasis(
    sfCenterSample.right,
    sfCenterSample.up,
    sfCenterSample.tangent.clone().negate(),
  );
  sfDecalMesh.quaternion.setFromRotationMatrix(sfBasis);
  sfDecalMesh.receiveShadow = true;
  group.add(sfDecalMesh);

  // ---------------------------------------------------------------------------
  // 3. SEGMENTED 3D BEVELED FIA APEX RUMBLE CURBS
  // ---------------------------------------------------------------------------
  let curbMat: THREE.MeshStandardMaterial | null = null;
  if (kerbTheme !== 'none') {
    const colorAHex =
      kerbTheme === 'blue_white'
        ? 0x2563eb
        : kerbTheme === 'yellow_black'
        ? 0xfacc15
        : kerbTheme === 'monochrome'
        ? 0xd4d4d8
        : 0xdc2626;
    const colorBHex =
      kerbTheme === 'yellow_black'
        ? 0x1e293b
        : kerbTheme === 'monochrome'
        ? 0x3f3f46
        : 0xf8fafc;
    const builtCurbs = buildSegmented3DFiaCurbs({
      samples,
      closedLoop: circuit.closedLoop,
      halfAsp,
      totalLength: circuit.totalLength,
      kerbHeightScale: circuit.kerbHeightScale,
      colorAHex,
      colorBHex,
      pitLaneBounds: circuit.pitLaneBounds,
      normalMap: textures.curbNormal,
      trackGeo,
      trackMat,
    });
    curbMat = builtCurbs.material;
    if (builtCurbs.mesh && curbMat) {
      const curbChunked = buildSpatialChunkedRoadMesh(builtCurbs.mesh.geometry, curbMat, {
        cellSizeM: 120,
        castShadow: true,
        receiveShadow: true,
        name: 'AureliaCurbChunks',
      });
      chunkedUpdaters.push(curbChunked);
      group.add(curbChunked.group);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. GRAVEL RUNOFF BEDS AT SHARPEST HAIRPIN EXITS
  // ---------------------------------------------------------------------------
  const gravelGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < N; i += 4) {
    const s = samples[i];
    if (!s.isBridge && Math.abs(s.curvature) > 0.0135) {
      // Positive curvature turns left (-right), so outside runoff is +1
      const outSide = s.curvature > 0 ? 1 : -1;
      const gPatch = new THREE.PlaneGeometry(7.5, 9.5, 2, 2);
      gPatch.rotateX(-Math.PI / 2);
      const lat = outSide * (halfAsp + SHOULDER_WIDTH + 4.4);
      const cx = s.position.x + s.right.x * lat;
      const cz = s.position.z + s.right.z * lat;
      const cy = groundHeightAt(cx, cz) + 0.06;
      const mat4 = new THREE.Matrix4().compose(
        new THREE.Vector3(cx, cy, cz),
        new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
        ),
        new THREE.Vector3(1, 1, 1),
      );
      gPatch.applyMatrix4(mat4);
      gravelGeos.push(gPatch);
    }
  }
  let gravelMat: THREE.MeshStandardMaterial | null = null;
  if (gravelGeos.length > 0) {
    const mergedGravel = trackGeo(BufferGeometryUtils.mergeGeometries(gravelGeos, false));
    for (const g of gravelGeos) g.dispose();
    gravelMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.gravelAlbedo,
        roughness: 0.96,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    const gravelMesh = new THREE.Mesh(mergedGravel, gravelMat);
    gravelMesh.receiveShadow = true;
    group.add(gravelMesh);
  }

  // ---------------------------------------------------------------------------
  // 5. FIXED TWIN-PYLON CABLE-STAYED SUSPENSION BRIDGE
  // - Closed solid box-girder deck slab directly beneath the road asphalt
  // - Twin sculpted A-frame pylons built in local bridge space (zero yaw twist!)
  // - Submerged lake caisson pillars + secondary approach piers under the deck
  // - 64 symmetric stay cables anchored exactly into tower leg centerlines
  // ---------------------------------------------------------------------------
  const bridgeGroup = new THREE.Group();
  bridgeGroup.name = 'CableStayedBridge';

  const bridgeIndices: number[] = [];
  for (let i = 0; i < N; i++) {
    if (samples[i].isBridge) bridgeIndices.push(i);
  }
  let orderedBridge: number[] = [];
  if (bridgeIndices.length > 0) {
    let split = 0;
    for (let k = 1; k < bridgeIndices.length; k++) {
      if (bridgeIndices[k] - bridgeIndices[k - 1] > 1) {
        split = k;
        break;
      }
    }
    orderedBridge =
      split === 0
        ? bridgeIndices
        : [...bridgeIndices.slice(split), ...bridgeIndices.slice(0, split)];
  }

  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.concreteNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.78,
      metalness: 0.05,
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
  concreteMat.customProgramCacheKey = () => 'aurelia-bridge-concrete-wet-v2';

  const brushedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb2bac4,
      roughness: 0.28,
      metalness: 0.86,
      envMapIntensity: 1.25,
    }),
  );

  const stayCableMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd8e0ea,
      roughness: 0.24,
      metalness: 0.9,
      envMapIntensity: 1.35,
    }),
  );

  const pylonUplightMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffd18c,
      emissive: 0xffa838,
      emissiveIntensity: 0.15,
      roughness: 0.25,
    }),
  );
  const aviationBeaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xff3b30,
      emissive: 0xff2820,
      emissiveIntensity: 0.2,
      roughness: 0.2,
    }),
  );

  const bridgeDeckEdgeLights: THREE.PointLight[] = [];
  worldColliders.initSplineBarriers(N);

  if (orderedBridge.length > 8) {
    const bLen = orderedBridge.length;
    const deckHalfW = halfFull + 1.15;
    const parapetH = 1.18;
    const deckDepth = 2.45;
    // Register solid concrete bridge parapets along both sides of the bridge deck
    const parapetInnerFace = deckHalfW - 0.74;
    for (let k = 0; k < bLen; k++) {
      const sIdx = orderedBridge[k];
      worldColliders.setSplineBarrier(sIdx, -1, parapetInnerFace, 'concrete');
      worldColliders.setSplineBarrier(sIdx, 1, parapetInnerFace, 'concrete');
    }

    // Closed 11-point CLOCKWISE cross-section in (+right, +up)
    // Includes solid top concrete deck slab (pts 2->3) directly under roadGeo!
    const deckProfileCols = 11;
    const deckPos = new Float32Array(bLen * deckProfileCols * 3);
    const deckUv = new Float32Array(bLen * deckProfileCols * 2);
    const deckIdx: number[] = [];

    const pts2D: Array<[number, number]> = [
      [-deckHalfW, parapetH],            // 0: left parapet outer top
      [-deckHalfW + 0.7, parapetH],      // 1: left parapet inner top
      [-deckHalfW + 0.78, -0.05],        // 2: left deck floor edge
      [deckHalfW - 0.78, -0.05],         // 3: right deck floor edge
      [deckHalfW - 0.7, parapetH],       // 4: right parapet inner top
      [deckHalfW, parapetH],             // 5: right parapet outer top
      [deckHalfW + 0.4, -0.55],          // 6: right cantilevered wing
      [deckHalfW - 2.6, -deckDepth],     // 7: right box-girder soffit
      [-deckHalfW + 2.6, -deckDepth],    // 8: left box-girder soffit
      [-deckHalfW - 0.4, -0.55],         // 9: left cantilevered wing
      [-deckHalfW, parapetH],            // 10: close loop
    ];

    for (let k = 0; k < bLen; k++) {
      const s = samples[orderedBridge[k]];
      const v = (k * (circuit.totalLength / N)) / 8.0;
      const p = s.position;
      const r = s.right;
      const u = s.up;

      for (let j = 0; j < deckProfileCols; j++) {
        const [lx, ly] = pts2D[j];
        const vi = k * deckProfileCols + j;
        deckPos[vi * 3] = p.x + r.x * lx + u.x * ly;
        deckPos[vi * 3 + 1] = p.y + r.y * lx + u.y * ly;
        deckPos[vi * 3 + 2] = p.z + r.z * lx + u.z * ly;
        deckUv[vi * 2] = j / (deckProfileCols - 1);
        deckUv[vi * 2 + 1] = v;
      }

      if (k < bLen - 1) {
        for (let j = 0; j < deckProfileCols - 1; j++) {
          const a = k * deckProfileCols + j;
          const b = a + 1;
          const d = (k + 1) * deckProfileCols + j;
          const e = d + 1;
          deckIdx.push(a, b, d, b, e, d);
        }
      }
    }

    const deckGeo = trackGeo(new THREE.BufferGeometry());
    deckGeo.setAttribute('position', new THREE.BufferAttribute(deckPos, 3));
    deckGeo.setAttribute('uv', new THREE.BufferAttribute(deckUv, 2));
    deckGeo.setIndex(deckIdx);
    deckGeo.computeVertexNormals();
    const deckMesh = new THREE.Mesh(deckGeo, concreteMat);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    bridgeGroup.add(deckMesh);

    // Top tubular steel handrails on both parapets
    for (const side of [-1, 1] as const) {
      const railPts: THREE.Vector3[] = [];
      for (let k = 0; k < bLen; k += 2) {
        const s = samples[orderedBridge[k]];
        railPts.push(
          s.position
            .clone()
            .addScaledVector(s.right, side * (deckHalfW - 0.35))
            .addScaledVector(s.up, parapetH + 0.42),
        );
      }
      const railCurve = new THREE.CatmullRomCurve3(railPts);
      const railGeo = trackGeo(new THREE.TubeGeometry(railCurve, 64, 0.09, 6, false));
      const railMesh = new THREE.Mesh(railGeo, brushedSteelMat);
      railMesh.castShadow = true;
      bridgeGroup.add(railMesh);
    }

    const isCustomOverpassOnly = Boolean(customBp && customBp.templateId !== 'aurelia_remix');
    // Main Twin A-Frame Pylons + Submerged Lake Pillars + Secondary Approach Piers (Aurelia / Remix only)
    const pylonFractions = isCustomOverpassOnly ? [] : [0.27, 0.73];
    const approachPierFractions = isCustomOverpassOnly ? [0.12, 0.88] : [0.09, 0.91];
    const stayCableGeos: THREE.BufferGeometry[] = [];
    const pylonConcreteGeos: THREE.BufferGeometry[] = [];
    const pylonSteelGeos: THREE.BufferGeometry[] = [];
    const uplightGeos: THREE.BufferGeometry[] = [];
    const beaconGeos: THREE.BufferGeometry[] = [];
    const cableUpVec = new THREE.Vector3(0, 1, 0);

    const mapWaterLevel = circuit.waterLevel;

    // Build concrete abutment bulkheads + wingwalls at both bridge ends so there is zero seam/gap
    for (const endIdx of [orderedBridge[0], orderedBridge[bLen - 1]]) {
      const es = samples[endIdx];
      const abutFrame = new THREE.Matrix4().makeBasis(
        es.right,
        new THREE.Vector3(0, 1, 0),
        es.tangent.clone().negate(),
      );
      const abutQ = new THREE.Quaternion().setFromRotationMatrix(abutFrame);
      const slab = new THREE.BoxGeometry(deckHalfW * 2 + 0.8, deckDepth + 3.2, 4.6);
      slab.applyQuaternion(abutQ);
      slab.translate(es.position.x, es.position.y - (deckDepth + 3.2) * 0.5 - 0.04, es.position.z);
      pylonConcreteGeos.push(slab);
      for (const side of [-1, 1] as const) {
        const wing = new THREE.BoxGeometry(1.15, parapetH + 3.4, 5.2);
        wing.applyQuaternion(abutQ);
        wing.translate(
          es.position.x + es.right.x * side * (deckHalfW - 0.35),
          es.position.y + (parapetH - 3.4) * 0.5,
          es.position.z + es.right.z * side * (deckHalfW - 0.35),
        );
        pylonConcreteGeos.push(wing);
      }
    }

    // Build secondary concrete support piers under approach spans
    for (const frac of approachPierFractions) {
      const pIdx = Math.floor(frac * (bLen - 1));
      const s = samples[orderedBridge[pIdx]];
      const frame = new THREE.Matrix4().makeBasis(
        s.right,
        new THREE.Vector3(0, 1, 0),
        s.tangent.clone().negate(),
      );
      const q = new THREE.Quaternion().setFromRotationMatrix(frame);
      const pos = s.position;
      const bedY = Math.min(groundHeightAt(pos.x, pos.z) - 2.5, mapWaterLevel - 4.0);
      const topY = pos.y - deckDepth + 0.1;
      const h = topY - bedY;
      if (h > 1.5) {
        for (const side of [-1, 1] as const) {
          const shaft = new THREE.BoxGeometry(2.6, h, 2.8);
          const localOff = new THREE.Vector3(side * (deckHalfW - 3.6), bedY + h * 0.5 - pos.y, 0).applyQuaternion(q);
          shaft.applyQuaternion(q);
          shaft.translate(pos.x + localOff.x, pos.y + localOff.y, pos.z + localOff.z);
          pylonConcreteGeos.push(shaft);
        }
        const cap = new THREE.BoxGeometry(deckHalfW * 2 - 2.6, 1.5, 3.4);
        cap.applyQuaternion(q);
        cap.translate(pos.x, topY - 0.75, pos.z);
        pylonConcreteGeos.push(cap);
      }
    }

    // Build Main Twin A-Frame Pylons in local bridge coordinates (zero yaw twist!)
    for (const frac of pylonFractions) {
      const pIdx = Math.floor(frac * (bLen - 1));
      const s = samples[orderedBridge[pIdx]];
      const pylonFrame = new THREE.Matrix4().makeBasis(
        s.right,
        new THREE.Vector3(0, 1, 0),
        s.tangent.clone().negate(),
      );
      const pylonQuat = new THREE.Quaternion().setFromRotationMatrix(pylonFrame);
      const deckPos3 = s.position.clone();
      const bedY = Math.min(groundHeightAt(deckPos3.x, deckPos3.z) - 3.0, mapWaterLevel - 6.0);
      const localBedY = bedY - deckPos3.y;

      const pylonTopY = 42.0;
      const legFootX = deckHalfW + 1.45;
      const legKneeY = 12.5;
      const legKneeX = deckHalfW + 0.75;
      const legCrownY = 39.0;
      const legCrownX = 1.6;

      // Helper: builds a box segment strictly in PYLON-LOCAL XY plane, then rotates once by pylonQuat
      const addLocalSegment = (
        localA: THREE.Vector3,
        localB: THREE.Vector3,
        wX: number,
        wZ: number,
        targetArr: THREE.BufferGeometry[],
      ) => {
        const localMid = localA.clone().add(localB).multiplyScalar(0.5);
        const dir = localB.clone().sub(localA);
        const segLen = dir.length();
        const tiltZ = Math.atan2(dir.y, dir.x) - Math.PI / 2;

        const segGeo = new THREE.BoxGeometry(wX, segLen, wZ);
        segGeo.rotateZ(tiltZ);
        segGeo.translate(localMid.x, localMid.y, localMid.z);
        segGeo.applyQuaternion(pylonQuat);
        segGeo.translate(deckPos3.x, deckPos3.y, deckPos3.z);
        targetArr.push(segGeo);
      };

      // Submerged Lake Caisson Footing + Waterline Plinth Collar + Twin Pier Columns
      const footingH = Math.max(4.0, mapWaterLevel + 2.2 - bedY);
      const footing = new THREE.BoxGeometry(deckHalfW * 2 + 6.5, footingH, 7.6);
      footing.translate(0, localBedY + footingH * 0.5, 0);
      footing.applyQuaternion(pylonQuat);
      footing.translate(deckPos3.x, deckPos3.y, deckPos3.z);
      pylonConcreteGeos.push(footing);

      const pierTopLocalY = -1.8;
      const pierBotLocalY = Math.min(pierTopLocalY - 0.5, mapWaterLevel - deckPos3.y + 1.4);
      const pierColH = pierTopLocalY - pierBotLocalY;

      for (const side of [-1, 1] as const) {
        // Twin submerged concrete pier columns rising from waterline plinth to deck pedestal
        const pierCol = new THREE.BoxGeometry(3.1, pierColH, 4.4);
        pierCol.translate(side * legFootX, pierBotLocalY + pierColH * 0.5, 0);
        pierCol.applyQuaternion(pylonQuat);
        pierCol.translate(deckPos3.x, deckPos3.y, deckPos3.z);
        pylonConcreteGeos.push(pierCol);

        // Lower flared tower leg (pedestal -> knee)
        addLocalSegment(
          new THREE.Vector3(side * legFootX, -2.0, 0),
          new THREE.Vector3(side * legKneeX, legKneeY, 0),
          2.35,
          3.4,
          pylonConcreteGeos,
        );

        // Upper inward-sloping A-frame tower leg (knee -> crown)
        addLocalSegment(
          new THREE.Vector3(side * legKneeX, legKneeY - 0.5, 0),
          new THREE.Vector3(side * legCrownX, legCrownY, 0),
          1.85,
          2.75,
          pylonConcreteGeos,
        );

        // Architectural uplight strip mounted along inner face of upper leg
        addLocalSegment(
          new THREE.Vector3(side * (legKneeX - 0.92), legKneeY + 1.0, 0),
          new THREE.Vector3(side * (legCrownX - 0.8), legCrownY - 2.0, 0),
          0.22,
          0.35,
          uplightGeos,
        );
      }

      // Lower structural crossbeam beneath box girder + Upper portal crossbeam over road
      const lowerBeam = new THREE.BoxGeometry(legFootX * 2 + 2.4, 2.3, 4.2);
      lowerBeam.translate(0, -1.75, 0);
      lowerBeam.applyQuaternion(pylonQuat);
      lowerBeam.translate(deckPos3.x, deckPos3.y, deckPos3.z);
      pylonConcreteGeos.push(lowerBeam);

      const portalBeam = new THREE.BoxGeometry(legKneeX * 2 + 0.6, 1.9, 2.6);
      portalBeam.translate(0, legKneeY + 0.4, 0);
      portalBeam.applyQuaternion(pylonQuat);
      portalBeam.translate(deckPos3.x, deckPos3.y, deckPos3.z);
      pylonConcreteGeos.push(portalBeam);

      const portalLightGeo = new THREE.BoxGeometry(legKneeX * 1.7, 0.24, 0.48);
      portalLightGeo.translate(0, legKneeY - 0.56, 0);
      portalLightGeo.applyQuaternion(pylonQuat);
      portalLightGeo.translate(deckPos3.x, deckPos3.y, deckPos3.z);
      uplightGeos.push(portalLightGeo);

      // Upper Diamond Spire Finial & Aviation Beacon
      const spireGeo = new THREE.BoxGeometry(3.8, 5.4, 2.85);
      spireGeo.translate(0, pylonTopY - 1.5, 0);
      spireGeo.applyQuaternion(pylonQuat);
      spireGeo.translate(deckPos3.x, deckPos3.y, deckPos3.z);
      pylonConcreteGeos.push(spireGeo);

      const capSpire = new THREE.ConeGeometry(1.85, 4.6, 4);
      capSpire.rotateY(Math.PI / 4);
      capSpire.translate(0, pylonTopY + 3.2, 0);
      capSpire.applyQuaternion(pylonQuat);
      capSpire.translate(deckPos3.x, deckPos3.y, deckPos3.z);
      pylonSteelGeos.push(capSpire);

      const beaconGeo = new THREE.SphereGeometry(0.45, 10, 8);
      beaconGeo.translate(0, pylonTopY + 5.6, 0);
      beaconGeo.applyQuaternion(pylonQuat);
      beaconGeo.translate(deckPos3.x, deckPos3.y, deckPos3.z);
      beaconGeos.push(beaconGeo);

      const pbWorld = new THREE.Vector3(0, legKneeY + 6.5, 0).applyQuaternion(pylonQuat).add(deckPos3);
      const pylonGlowLight = new THREE.PointLight(0xffb454, 0, 105, 1.4);
      pylonGlowLight.position.copy(pbWorld);
      pylonGlowLight.visible = false;
      bridgeGroup.add(pylonGlowLight);
      bridgeDeckEdgeLights.push(pylonGlowLight);

      // 8 Symmetric Stay Cable Pairs Forward + 8 Backward (64 cables total, anchored INSIDE tower leg!)
      const cablePairs = 8;
      const stepSamples = 4;
      for (const dirSign of [-1, 1] as const) {
        for (let c = 1; c <= cablePairs; c++) {
          const anchorIdx = pIdx + dirSign * (c * stepSamples + 2);
          if (anchorIdx < 1 || anchorIdx >= bLen - 1) continue;
          const anchorSample = samples[orderedBridge[anchorIdx]];
          const anchorHeightOnTower = 21.0 + (c / cablePairs) * 16.5;
          const legAlpha = (anchorHeightOnTower - (legKneeY - 0.5)) / (legCrownY - (legKneeY - 0.5));
          const exactTowerX = lerp(legKneeX, legCrownX, legAlpha);

          for (const side of [-1, 1] as const) {
            const towerAnchor = new THREE.Vector3(side * exactTowerX, anchorHeightOnTower, 0)
              .applyQuaternion(pylonQuat)
              .add(deckPos3);

            const deckAnchor = anchorSample.position
              .clone()
              .addScaledVector(anchorSample.right, side * (deckHalfW - 0.15))
              .addScaledVector(anchorSample.up, 0.25);

            const cDir = deckAnchor.clone().sub(towerAnchor);
            const cLen = cDir.length();
            const cMid = towerAnchor.clone().add(deckAnchor).multiplyScalar(0.5);
            const cQuat = new THREE.Quaternion().setFromUnitVectors(cableUpVec, cDir.normalize());
            const cableGeo = new THREE.CylinderGeometry(0.07, 0.07, cLen, 5);
            cableGeo.applyQuaternion(cQuat);
            cableGeo.translate(cMid.x, cMid.y, cMid.z);
            stayCableGeos.push(cableGeo);
          }
        }
      }
    }

    // Heavy Concrete Abutment Headwalls + Steel Expansion Joint Plates sealing both ends
    for (const endIdx of [orderedBridge[0], orderedBridge[bLen - 1]]) {
      const s = samples[endIdx];
      const abFrame = new THREE.Matrix4().makeBasis(
        s.right,
        new THREE.Vector3(0, 1, 0),
        s.tangent.clone().negate(),
      );
      const abGeo = new THREE.BoxGeometry(deckHalfW * 2 + 2.8, 12.0, 5.4);
      abGeo.applyMatrix4(abFrame);
      abGeo.translate(s.position.x, s.position.y - 6.18, s.position.z);
      pylonConcreteGeos.push(abGeo);

      // Flush brushed-steel bridge deck expansion joint seam across carriageway
      const expJointGeo = new THREE.BoxGeometry(halfAsp * 2 + 1.2, 0.05, 0.42);
      expJointGeo.applyMatrix4(abFrame);
      expJointGeo.translate(s.position.x, s.position.y + 0.036, s.position.z);
      pylonSteelGeos.push(expJointGeo);
    }

    if (pylonConcreteGeos.length > 0) {
      const mergedTowers = trackGeo(BufferGeometryUtils.mergeGeometries(pylonConcreteGeos, false));
      for (const g of pylonConcreteGeos) g.dispose();
      const towersMesh = new THREE.Mesh(mergedTowers, concreteMat);
      towersMesh.castShadow = true;
      towersMesh.receiveShadow = true;
      bridgeGroup.add(towersMesh);
    }
    if (pylonSteelGeos.length > 0) {
      const mergedSteel = trackGeo(BufferGeometryUtils.mergeGeometries(pylonSteelGeos, false));
      for (const g of pylonSteelGeos) g.dispose();
      const steelSpires = new THREE.Mesh(mergedSteel, brushedSteelMat);
      steelSpires.castShadow = true;
      bridgeGroup.add(steelSpires);
    }
    if (stayCableGeos.length > 0) {
      const mergedCables = trackGeo(BufferGeometryUtils.mergeGeometries(stayCableGeos, false));
      for (const g of stayCableGeos) g.dispose();
      const cablesMesh = new THREE.Mesh(mergedCables, stayCableMat);
      cablesMesh.castShadow = true;
      bridgeGroup.add(cablesMesh);
    }
    if (uplightGeos.length > 0) {
      const mergedUplights = trackGeo(BufferGeometryUtils.mergeGeometries(uplightGeos, false));
      for (const g of uplightGeos) g.dispose();
      bridgeGroup.add(new THREE.Mesh(mergedUplights, pylonUplightMat));
    }
    if (beaconGeos.length > 0) {
      const mergedBeacons = trackGeo(BufferGeometryUtils.mergeGeometries(beaconGeos, false));
      for (const g of beaconGeos) g.dispose();
      bridgeGroup.add(new THREE.Mesh(mergedBeacons, aviationBeaconMat));
    }
  }
  group.add(bridgeGroup);

  // ---------------------------------------------------------------------------
  // 5B. AUTOMATIC 3D TUNNELS (Built wherever lower roads cross under overpasses or hills)
  // ---------------------------------------------------------------------------
  const tunnelIndices: number[] = [];
  for (let i = 0; i < N; i++) {
    if (samples[i].isTunnel) tunnelIndices.push(i);
  }
  if (tunnelIndices.length > 4) {
    const tunnelSpans: number[][] = [];
    let currentSpan: number[] = [tunnelIndices[0]];
    for (let k = 1; k < tunnelIndices.length; k++) {
      if (tunnelIndices[k] - tunnelIndices[k - 1] <= 3) {
        currentSpan.push(tunnelIndices[k]);
      } else {
        if (currentSpan.length > 3) tunnelSpans.push(currentSpan);
        currentSpan = [tunnelIndices[k]];
      }
    }
    if (currentSpan.length > 3) tunnelSpans.push(currentSpan);

    const tunnelHalfW = halfFull + 0.95;
    const tunnelWallH = 4.1;
    const tunnelCrownH = 6.35;
    // Closed cross-section ring (outer wall + arch crown)
    const archPts: Array<[number, number]> = [
      [-tunnelHalfW - 0.65, -0.35],
      [-tunnelHalfW, -0.35],
      [-tunnelHalfW, tunnelWallH],
      [-tunnelHalfW * 0.62, tunnelCrownH * 0.88],
      [0, tunnelCrownH],
      [tunnelHalfW * 0.62, tunnelCrownH * 0.88],
      [tunnelHalfW, tunnelWallH],
      [tunnelHalfW, -0.35],
      [tunnelHalfW + 0.65, -0.35],
      [tunnelHalfW + 0.65, tunnelWallH + 0.45],
      [tunnelHalfW * 0.68, tunnelCrownH + 0.62],
      [0, tunnelCrownH + 0.85],
      [-tunnelHalfW * 0.68, tunnelCrownH + 0.62],
      [-tunnelHalfW - 0.65, tunnelWallH + 0.45],
      [-tunnelHalfW - 0.65, -0.35],
    ];
    const tCols = archPts.length;
    const tunnelMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.concreteAlbedo,
        normalMap: textures.concreteNormal,
        color: 0x64748b,
        roughness: 0.85,
        metalness: 0.08,
        side: THREE.DoubleSide,
      }),
    );
    const darkThroatMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x05070a,
        roughness: 0.96,
        metalness: 0.02,
      }),
    );
    const tunnelPortalGeos: THREE.BufferGeometry[] = [];
    const tunnelThroatGeos: THREE.BufferGeometry[] = [];
    const tunnelBeaconGeos: THREE.BufferGeometry[] = [];
    const tunnelLedMatrices: THREE.Matrix4[] = [];
    const tunnelLedGeo = trackGeo(new THREE.BoxGeometry(2.8, 0.16, 0.36));

    for (const span of tunnelSpans) {
      const sLen = span.length;
      const tPos = new Float32Array(sLen * tCols * 3);
      const tUv = new Float32Array(sLen * tCols * 2);
      const tIdx: number[] = [];

      for (let k = 0; k < sLen; k++) {
        const sIdx = span[k];
        worldColliders.setSplineBarrier(sIdx, -1, tunnelHalfW - 0.35, 'concrete');
        worldColliders.setSplineBarrier(sIdx, 1, tunnelHalfW - 0.35, 'concrete');
        const s = samples[sIdx];
        const v = (k * (circuit.totalLength / N)) / 6.0;
        for (let j = 0; j < tCols; j++) {
          const [lx, ly] = archPts[j];
          const vi = k * tCols + j;
          tPos[vi * 3] = s.position.x + s.right.x * lx + s.up.x * ly;
          tPos[vi * 3 + 1] = s.position.y + s.right.y * lx + s.up.y * ly;
          tPos[vi * 3 + 2] = s.position.z + s.right.z * lx + s.up.z * ly;
          tUv[vi * 2] = j / (tCols - 1);
          tUv[vi * 2 + 1] = v;
        }
        if (k < sLen - 1) {
          for (let j = 0; j < tCols - 1; j++) {
            const a = k * tCols + j;
            const b = a + 1;
            const d = (k + 1) * tCols + j;
            const e = d + 1;
            tIdx.push(a, d, b, b, d, e);
          }
        }
        if (k % 5 === 0) {
          const lq = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
          );
          tunnelLedMatrices.push(
            new THREE.Matrix4().compose(
              s.position.clone().addScaledVector(s.up, tunnelCrownH - 0.25),
              lq,
              new THREE.Vector3(1, 1, 1),
            ),
          );
        }
      }

      const tunnelGeo = trackGeo(new THREE.BufferGeometry());
      tunnelGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
      tunnelGeo.setAttribute('uv', new THREE.BufferAttribute(tUv, 2));
      tunnelGeo.setIndex(tIdx);
      tunnelGeo.computeVertexNormals();
      const tunnelMesh = new THREE.Mesh(tunnelGeo, tunnelMat);
      tunnelMesh.castShadow = true;
      tunnelMesh.receiveShadow = true;
      group.add(tunnelMesh);

      // Monumental Entrance & Exit Portals with jamb buttresses + splayed retaining wingwalls + dark throat collar + beacons
      for (const endPair of [
        { idx: span[0], outwardDir: -1 },
        { idx: span[sLen - 1], outwardDir: 1 },
      ] as const) {
        const es = samples[endPair.idx];
        const outTan = es.tangent.clone().multiplyScalar(endPair.outwardDir).setY(0).normalize();
        const outRight = new THREE.Vector3().crossVectors(outTan, new THREE.Vector3(0, 1, 0)).normalize();
        const eq = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(outRight, new THREE.Vector3(0, 1, 0), outTan.clone().negate()),
        );
        const headwall = new THREE.BoxGeometry((tunnelHalfW + 1.8) * 2, 2.35, 2.2);
        headwall.applyQuaternion(eq);
        headwall.translate(es.position.x, es.position.y + tunnelCrownH + 0.9, es.position.z);
        tunnelPortalGeos.push(headwall);

        // Dark recessed inner soffit beam just inside the portal mouth for crisp tunnel depth
        const throatSoffit = new THREE.BoxGeometry(tunnelHalfW * 2.02, 0.9, 3.2);
        throatSoffit.applyQuaternion(eq);
        throatSoffit.translate(
          es.position.x - outTan.x * 1.4,
          es.position.y + tunnelCrownH - 0.35,
          es.position.z - outTan.z * 1.4,
        );
        tunnelThroatGeos.push(throatSoffit);

        for (const side of [-1, 1] as const) {
          const jamb = new THREE.BoxGeometry(2.1, 8.2, 2.2);
          jamb.applyQuaternion(eq);
          jamb.translate(
            es.position.x + outRight.x * side * (tunnelHalfW + 0.85),
            es.position.y + 3.6,
            es.position.z + outRight.z * side * (tunnelHalfW + 0.85),
          );
          tunnelPortalGeos.push(jamb);

          const throatCollar = new THREE.BoxGeometry(0.45, tunnelWallH + 1.6, 3.2);
          throatCollar.applyQuaternion(eq);
          throatCollar.translate(
            es.position.x + outRight.x * side * (tunnelHalfW - 0.05) - outTan.x * 1.4,
            es.position.y + (tunnelWallH + 1.6) * 0.5 - 0.35,
            es.position.z + outRight.z * side * (tunnelHalfW - 0.05) - outTan.z * 1.4,
          );
          tunnelThroatGeos.push(throatCollar);

          const wingQuat = eq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * -0.4));
          const wing = new THREE.BoxGeometry(1.35, 8.2, 7.6);
          wing.applyQuaternion(wingQuat);
          wing.translate(
            es.position.x + outRight.x * side * (tunnelHalfW + 2.8) + outTan.x * 3.4,
            es.position.y + 2.2,
            es.position.z + outRight.z * side * (tunnelHalfW + 2.8) + outTan.z * 3.4,
          );
          tunnelPortalGeos.push(wing);

          const beacon = new THREE.SphereGeometry(0.28, 8, 8);
          beacon.translate(
            es.position.x + outRight.x * side * (tunnelHalfW - 0.9) + outTan.x * 1.15,
            es.position.y + tunnelCrownH + 0.2,
            es.position.z + outRight.z * side * (tunnelHalfW - 0.9) + outTan.z * 1.15,
          );
          tunnelBeaconGeos.push(beacon);
        }
      }
    }

    if (tunnelPortalGeos.length > 0) {
      const mergedPortals = trackGeo(BufferGeometryUtils.mergeGeometries(tunnelPortalGeos, false));
      for (const g of tunnelPortalGeos) g.dispose();
      const portalMesh = new THREE.Mesh(mergedPortals, concreteMat);
      portalMesh.castShadow = true;
      portalMesh.receiveShadow = true;
      group.add(portalMesh);
    }
    if (tunnelThroatGeos.length > 0) {
      const mergedThroats = trackGeo(BufferGeometryUtils.mergeGeometries(tunnelThroatGeos, false));
      for (const g of tunnelThroatGeos) g.dispose();
      const throatMesh = new THREE.Mesh(mergedThroats, darkThroatMat);
      throatMesh.receiveShadow = true;
      group.add(throatMesh);
    }
    if (tunnelBeaconGeos.length > 0) {
      const mergedTunBeacons = trackGeo(BufferGeometryUtils.mergeGeometries(tunnelBeaconGeos, false));
      for (const g of tunnelBeaconGeos) g.dispose();
      group.add(new THREE.Mesh(mergedTunBeacons, aviationBeaconMat));
    }

    if (tunnelLedMatrices.length > 0) {
      const ledInst = new THREE.InstancedMesh(tunnelLedGeo, pylonUplightMat, tunnelLedMatrices.length);
      for (let i = 0; i < tunnelLedMatrices.length; i++) ledInst.setMatrixAt(i, tunnelLedMatrices[i]);
      ledInst.instanceMatrix.needsUpdate = true;
      ledInst.computeBoundingSphere();
      group.add(ledInst);
    }
  }

  // ---------------------------------------------------------------------------
  // 6. RACE-TRACK PERIMETER FENCING:
  // - Smooth track-elevation double-tier 3D steel guardrails (verified outward winding)
  // - FIA catch-fence stanchions + 4 continuous 3D horizontal steel tension cables + mesh
  // - Motorsport Red & White Tire-Wall Barrier Stacks on sharp hairpin braking zones
  // - Post retroreflectors & road boundary cat-eye studs
  // ---------------------------------------------------------------------------
  const railOffset = halfAsp + SHOULDER_WIDTH + 0.25;
  const railPostGeo = trackGeo(new THREE.BoxGeometry(0.15, 1.55, 0.16)); // Extends 0.55m into embankment
  const catchStanchionGeo = trackGeo(createCatchStanchionGeometry());
  const reflectorTabGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.12, 0.08));

  const postMatrices: THREE.Matrix4[] = [];
  const stanchionMatrices: THREE.Matrix4[] = [];
  const reflectorMatrices: THREE.Matrix4[] = [];
  const doubleRailGeos: THREE.BufferGeometry[] = [];
  const catchMeshGeos: THREE.BufferGeometry[] = [];
  const tensionCableGeos: THREE.BufferGeometry[] = [];

  const galvanizedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xb6bec8,
      roughness: 0.3,
      metalness: 0.85,
      envMapIntensity: 1.25,
    }),
  );

  const catchMeshMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.catchFenceAlbedo,
      alphaTest: 0.26,
      side: THREE.DoubleSide,
      roughness: 0.4,
      metalness: 0.78,
    }),
  );

  const reflectorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffb32c,
      emissive: 0xff8c1a,
      emissiveIntensity: 0.25,
      roughness: 0.25,
      metalness: 0.2,
    }),
  );

  /**
   * Extrudes a realistic 8-point profiled W-Beam Armco guardrail in (+right, +up)
   * using strictly CLOCKWISE vertex ordering so (a, b, d), (b, e, d) faces 100% outward!
   */
  const buildExtrudedRailBox = (
    pts: THREE.Vector3[],
    rightVecs: THREE.Vector3[],
    heightCenter: number,
    side: -1 | 1,
  ) => {
    if (pts.length < 3) return;
    const rLen = pts.length;
    const prof: Array<[number, number]> =
      side > 0
        ? [
            [0.045, 0.14],
            [0.045, -0.14],
            [-0.06, -0.14],
            [-0.085, -0.075],
            [-0.025, 0.0],
            [-0.085, 0.075],
            [-0.06, 0.14],
            [0.045, 0.14],
          ]
        : [
            [-0.045, 0.14],
            [0.06, 0.14],
            [0.085, 0.075],
            [0.025, 0.0],
            [0.085, -0.075],
            [0.06, -0.14],
            [-0.045, -0.14],
            [-0.045, 0.14],
          ];
    const pCols = prof.length;
    const verts = new Float32Array(rLen * pCols * 3);
    const idxs: number[] = [];

    for (let k = 0; k < rLen; k++) {
      const p = pts[k];
      const r = rightVecs[k];
      for (let j = 0; j < pCols; j++) {
        const vi = k * pCols + j;
        verts[vi * 3] = p.x + r.x * prof[j][0];
        verts[vi * 3 + 1] = p.y + heightCenter + prof[j][1];
        verts[vi * 3 + 2] = p.z + r.z * prof[j][0];
      }
      if (k < rLen - 1) {
        for (let j = 0; j < pCols - 1; j++) {
          const a = k * pCols + j;
          const b = a + 1;
          const d = (k + 1) * pCols + j;
          const e = d + 1;
          idxs.push(a, b, d, b, e, d);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    g.setIndex(idxs);
    g.computeVertexNormals();
    doubleRailGeos.push(g);
  };

  const buildGuardrailSegment = (startIdx: number, endIdx: number, side: -1 | 1) => {
    const pts: THREE.Vector3[] = [];
    const rightVecs: THREE.Vector3[] = [];

    for (let i = startIdx; i <= endIdx; i++) {
      const s = samples[circuit.closedLoop ? i % N : Math.min(i, N - 1)];
      const gx = s.position.x + s.right.x * side * railOffset;
      const gz = s.position.z + s.right.z * side * railOffset;
      // Anchor smoothly to track-edge roadbed elevation (eliminates bumpy terrain spikes)
      const gy = s.position.y + s.right.y * side * railOffset;

      pts.push(new THREE.Vector3(gx, gy, gz));
      rightVecs.push(s.right);

      const basisQuat = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(
          s.right.clone().multiplyScalar(side),
          new THREE.Vector3(0, 1, 0),
          s.tangent.clone().multiplyScalar(-side),
        ),
      );

      if ((i - startIdx) % 2 === 0) {
        postMatrices.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(gx, gy + 0.25, gz),
            basisQuat,
            new THREE.Vector3(1, 1, 1),
          ),
        );
        if ((i - startIdx) % 4 === 0) {
          const refPos = new THREE.Vector3(gx, gy + 0.96, gz).addScaledVector(s.right, -side * 0.12);
          reflectorMatrices.push(
            new THREE.Matrix4().compose(refPos, basisQuat, new THREE.Vector3(1, 1, 1)),
          );
        }
      }
    }

    // Double-tier profiled W-beam Armco steel rails
    buildExtrudedRailBox(pts, rightVecs, 0.42, side);
    buildExtrudedRailBox(pts, rightVecs, 0.86, side);
  };

  const buildCatchFenceSegment = (startIdx: number, endIdx: number, side: -1 | 1) => {
    const pts: THREE.Vector3[] = [];
    const rightVecs: THREE.Vector3[] = [];
    const segLenM = circuit.totalLength / N;

    for (let i = startIdx; i <= endIdx; i++) {
      const s = samples[circuit.closedLoop ? i % N : Math.min(i, N - 1)];
      const gx = s.position.x + s.right.x * side * (railOffset + 0.28);
      const gz = s.position.z + s.right.z * side * (railOffset + 0.28);
      const gy = s.position.y + s.right.y * side * (railOffset + 0.28);

      pts.push(new THREE.Vector3(gx, gy, gz));
      rightVecs.push(s.right);

      if ((i - startIdx) % 3 === 0 || i === endIdx) {
        const basisQuat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(
            s.right.clone().multiplyScalar(side),
            new THREE.Vector3(0, 1, 0),
            s.tangent.clone().multiplyScalar(-side),
          ),
        );
        stanchionMatrices.push(
          new THREE.Matrix4().compose(new THREE.Vector3(gx, gy, gz), basisQuat, new THREE.Vector3(1, 1, 1)),
        );
      }
    }

    if (pts.length < 4) return;

    // 4 solid 3D steel tension cables along the catch-fence (always crisp at every distance!)
    for (const cableY of [1.4, 1.95, 2.5, 3.0]) {
      const cableGeoTarget = doubleRailGeos; // Reuse galvanized steel material
      void cableGeoTarget;
      const rLen = pts.length;
      const prof: Array<[number, number]> = [
        [-0.025, 0.025],
        [0.025, 0.025],
        [0.025, -0.025],
        [-0.025, -0.025],
        [-0.025, 0.025],
      ];
      const verts = new Float32Array(rLen * 5 * 3);
      const idxs: number[] = [];
      for (let k = 0; k < rLen; k++) {
        const p = pts[k];
        const r = rightVecs[k];
        const overhangShift = cableY > 2.8 ? -side * 0.2 : 0;
        for (let j = 0; j < 5; j++) {
          const vi = k * 5 + j;
          verts[vi * 3] = p.x + r.x * (prof[j][0] + overhangShift);
          verts[vi * 3 + 1] = p.y + cableY + prof[j][1];
          verts[vi * 3 + 2] = p.z + r.z * (prof[j][0] + overhangShift);
        }
        if (k < rLen - 1) {
          for (let j = 0; j < 4; j++) {
            const a = k * 5 + j;
            const b = a + 1;
            const d = (k + 1) * 5 + j;
            const e = d + 1;
            idxs.push(a, b, d, b, e, d);
          }
        }
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      cg.setIndex(idxs);
      cg.computeVertexNormals();
      tensionCableGeos.push(cg);
    }

    // Galvanized chain-link mesh panel
    const mLen = pts.length;
    const mPos = new Float32Array(mLen * 3 * 3);
    const mUv = new Float32Array(mLen * 3 * 2);
    const mIdx: number[] = [];

    for (let k = 0; k < mLen; k++) {
      const p = pts[k];
      const r = rightVecs[k];
      const vCoord = (k * segLenM) / 2.6;

      const p0 = new THREE.Vector3(p.x, p.y + 1.0, p.z);
      const p1 = new THREE.Vector3(p.x, p.y + 2.85, p.z);
      const p2 = new THREE.Vector3(p.x - r.x * side * 0.52, p.y + 3.35, p.z - r.z * side * 0.52);

      const rowPts = [p0, p1, p2];
      const uCoords = [0, 0.78, 1.0];
      for (let j = 0; j < 3; j++) {
        const vi = k * 3 + j;
        mPos[vi * 3] = rowPts[j].x;
        mPos[vi * 3 + 1] = rowPts[j].y;
        mPos[vi * 3 + 2] = rowPts[j].z;
        mUv[vi * 2] = uCoords[j];
        mUv[vi * 2 + 1] = vCoord;
      }

      if (k < mLen - 1) {
        for (let j = 0; j < 2; j++) {
          const a = k * 3 + j;
          const b = a + 1;
          const d = (k + 1) * 3 + j;
          const e = d + 1;
          mIdx.push(a, b, d, b, e, d);
        }
      }
    }

    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
    mg.setAttribute('uv', new THREE.BufferAttribute(mUv, 2));
    mg.setIndex(mIdx);
    mg.computeVertexNormals();
    catchMeshGeos.push(mg);
  };

  // Emit double-tier guardrails and FIA catch-fencing cleanly per sector (no bleed!)
  for (const side of [-1, 1] as const) {
    let inRail = false;
    let railStart = 0;
    let inCatch = false;
    let catchStart = 0;

    for (let i = 0; i < N; i++) {
      const s = samples[i];
      // Positive curvature turns toward -right (left turn), so outside wall is side = +1 (curvature * side > 0)
      const isOuterCurve = !s.isBridge && !s.isTunnel && s.curvature * side > 0.0038;
      // Also guard steep roadside embankments & bridge approaches on both sides
      const probeX = s.position.x + s.right.x * side * (railOffset + 5.0);
      const probeZ = s.position.z + s.right.z * side * (railOffset + 5.0);
      const isDropOff = !s.isBridge && !s.isTunnel && groundHeightAt(probeX, probeZ) < s.position.y - 1.6;
      // Leave Pit-Lane entry/exit open on the pit-facing side of Pit Straight
      const pf = circuit.pitLaneBounds.frame;
      let isPitFacingSide = side === -1;
      let inPitCutout = false;
      if (pf) {
        const dxPit = pf.centerX - s.position.x;
        const dzPit = pf.centerZ - s.position.z;
        const toPitDot = dxPit * s.right.x + dzPit * s.right.z;
        isPitFacingSide = toPitDot * side > 0;
        const alongPit =
          (s.position.x - pf.centerX) * pf.tanX + (s.position.z - pf.centerZ) * pf.tanZ;
        inPitCutout =
          s.isStraight &&
          isPitFacingSide &&
          Math.abs(alongPit) <= pf.halfLength + 10 &&
          Math.abs(s.position.y - circuit.pitLaneBounds.y) <= circuit.pitLaneBounds.toleranceY;
      } else {
        inPitCutout =
          side === -1 &&
          s.isStraight &&
          s.position.z > 220 &&
          s.position.x > -126 &&
          s.position.x < 102;
      }
      const wantRail = !s.isTunnel && !inPitCutout && (isOuterCurve || isDropOff || (!s.isBridge && s.isStraight));
      const wantCatch =
        !s.isTunnel && !inPitCutout && !s.isBridge && ((s.isCatchFenceZone && isOuterCurve) || (s.isStraight && !isPitFacingSide));

      if (!s.isBridge && !s.isTunnel && (wantRail || wantCatch)) {
        const barrierDist = wantRail ? railOffset - 0.08 : railOffset + 0.22;
        worldColliders.setSplineBarrier(i, side, barrierDist, 'metal');
      }

      if (wantRail && !inRail) {
        inRail = true;
        railStart = i;
      } else if (!wantRail && inRail) {
        inRail = false;
        if (i - railStart > 6) buildGuardrailSegment(railStart, i, side);
      }

      if (wantCatch && !inCatch) {
        inCatch = true;
        catchStart = i;
      } else if (!wantCatch && inCatch) {
        inCatch = false;
        if (i - catchStart > 8) buildCatchFenceSegment(catchStart, i, side);
      }
    }

    if (inRail && N - 1 - railStart > 6) buildGuardrailSegment(railStart, N - 1, side);
    if (inCatch && N - 1 - catchStart > 8) buildCatchFenceSegment(catchStart, N - 1, side);
  }

  const allRailAndCableGeos = [...doubleRailGeos, ...tensionCableGeos];
  if (allRailAndCableGeos.length > 0) {
    const mergedRails = BufferGeometryUtils.mergeGeometries(allRailAndCableGeos, false);
    for (const g of allRailAndCableGeos) g.dispose();
    const railsChunked = buildSpatialChunkedRoadMesh(mergedRails, galvanizedSteelMat, {
      cellSizeM: 120,
      castShadow: true,
      receiveShadow: true,
      name: 'AureliaRailsChunks',
    });
    chunkedUpdaters.push(railsChunked);
    group.add(railsChunked.group);
  }

  if (catchMeshGeos.length > 0) {
    const mergedCatch = BufferGeometryUtils.mergeGeometries(catchMeshGeos, false);
    for (const g of catchMeshGeos) g.dispose();
    const catchChunked = buildSpatialChunkedRoadMesh(mergedCatch, catchMeshMat, {
      cellSizeM: 120,
      castShadow: false,
      receiveShadow: false,
      name: 'AureliaCatchChunks',
    });
    chunkedUpdaters.push(catchChunked);
    group.add(catchChunked.group);
  }

  if (postMatrices.length > 0) {
    const postsInst = new THREE.InstancedMesh(railPostGeo, galvanizedSteelMat, postMatrices.length);
    for (let i = 0; i < postMatrices.length; i++) postsInst.setMatrixAt(i, postMatrices[i]);
    postsInst.instanceMatrix.needsUpdate = true;
    postsInst.computeBoundingSphere();
    postsInst.castShadow = true;
    group.add(postsInst);
  }

  if (stanchionMatrices.length > 0) {
    const stanchInst = new THREE.InstancedMesh(catchStanchionGeo, galvanizedSteelMat, stanchionMatrices.length);
    for (let i = 0; i < stanchionMatrices.length; i++) stanchInst.setMatrixAt(i, stanchionMatrices[i]);
    stanchInst.instanceMatrix.needsUpdate = true;
    stanchInst.computeBoundingSphere();
    stanchInst.castShadow = true;
    group.add(stanchInst);
  }

  if (reflectorMatrices.length > 0) {
    const refInst = new THREE.InstancedMesh(reflectorTabGeo, reflectorMat, reflectorMatrices.length);
    for (let i = 0; i < reflectorMatrices.length; i++) refInst.setMatrixAt(i, reflectorMatrices[i]);
    refInst.instanceMatrix.needsUpdate = true;
    refInst.computeBoundingSphere();
    group.add(refInst);
  }

  // ---------------------------------------------------------------------------
  // 7. MOTORSPORT RED & WHITE TIRE-WALL BARRIER STACKS ON SHARP HAIRPINS
  // ---------------------------------------------------------------------------
  const tireStackGeo = trackGeo(createTireStackGeometry());
  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.05,
    }),
  );
  const tireMatrices: THREE.Matrix4[] = [];
  const tireColors: THREE.Color[] = [];
  const colTireRed = new THREE.Color(0xc42622);
  const colTireWhite = new THREE.Color(0xdedad2);
  const colTireRubber = new THREE.Color(0x1f2226);

  let stackCounter = 0;
  for (let i = 0; i < N; i += 2) {
    const s = samples[i];
    if (s.isBridge || Math.abs(s.curvature) < 0.0125) continue;
    // Positive curvature turns left (-right), so outside barrier wall is +1
    const outSide = s.curvature > 0 ? 1 : -1;
    const lat = outSide * (railOffset - 0.55);
    const tx = s.position.x + s.right.x * lat;
    const tz = s.position.z + s.right.z * lat;
    const ty = s.position.y + s.right.y * lat;
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
    );
    tireMatrices.push(new THREE.Matrix4().compose(new THREE.Vector3(tx, ty, tz), q, new THREE.Vector3(1, 1, 1)));
    worldColliders.addCircle(tx, tz, 0.42, 'tire', ty - 0.5, ty + 1.8);
    const mod = stackCounter % 4;
    tireColors.push(mod === 0 ? colTireRed : mod === 2 ? colTireWhite : colTireRubber);
    stackCounter++;
  }

  if (tireMatrices.length > 0) {
    const tireInst = new THREE.InstancedMesh(tireStackGeo, tireMat, tireMatrices.length);
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
  }

  // ---------------------------------------------------------------------------
  // 8. ROAD BOUNDARY CAT-EYE PAVEMENT STUDS (Illuminated at Night!)
  // ---------------------------------------------------------------------------
  const catEyeGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.045, 0.24));
  const catEyeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffd27d,
      emissiveIntensity: 0.12,
      roughness: 0.2,
      metalness: 0.35,
    }),
  );
  const catMatrices: THREE.Matrix4[] = [];
  const catColors: THREE.Color[] = [];
  const colAmberStud = new THREE.Color(0xffaa33);
  const colWhiteStud = new THREE.Color(0xf8fafc);

  for (let i = 0; i < N; i += 6) {
    const s = samples[i];
    const isTurn = Math.abs(s.curvature) > 0.006;
    const studColor = isTurn ? colAmberStud : colWhiteStud;
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
    );

    for (const side of [-1, 1] as const) {
      const lat = side * (halfAsp - 0.32);
      const pos = s.position
        .clone()
        .addScaledVector(s.right, lat)
        .addScaledVector(s.up, 0.045);
      catMatrices.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
      catColors.push(studColor);
    }
  }

  if (catMatrices.length > 0) {
    const catInst = new THREE.InstancedMesh(catEyeGeo, catEyeMat, catMatrices.length);
    for (let i = 0; i < catMatrices.length; i++) {
      catInst.setMatrixAt(i, catMatrices[i]);
      catInst.setColorAt(i, catColors[i]);
    }
    catInst.instanceMatrix.needsUpdate = true;
    if (catInst.instanceColor) catInst.instanceColor.needsUpdate = true;
    catInst.computeBoundingSphere();
    group.add(catInst);
  }

  // ---------------------------------------------------------------------------
  // 9. RECESSED TRACKSIDE STORM-DRAIN GRATES (Close-up Motorsport Detail)
  // ---------------------------------------------------------------------------
  group.add(
    buildRecessedDrainGrates({
      samples,
      halfAsp,
      pitLaneBounds: circuit.pitLaneBounds,
      spacingSamples: 14,
      trackGeo,
      trackMat,
    }),
  );

  // ---------------------------------------------------------------------------
  // 10. CUSTOM TRACK MODULES: APEX CHICANE BARRIERS & DRIFT CLIPPING ZONES
  // ---------------------------------------------------------------------------
  const driftClipMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.75,
      roughness: 0.22,
      metalness: 0.35,
    }),
  );

  if (circuit.features.chicaneBarriers && circuit.chicaneTs.length > 0) {
    const blockGeo = trackGeo(new THREE.BoxGeometry(2.6, 0.92, 0.85));
    const redBlockMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55, metalness: 0.1 }),
    );
    const whiteBlockMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.52, metalness: 0.08 }),
    );

    circuit.chicaneTs.forEach((ct, cIdx) => {
      const s = circuit.sampleAtT(ct);
      const side = cIdx % 2 === 0 ? -1 : 1;
      const latCenter = side * (halfAsp * 0.42);
      const q = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
      );

      for (let b = 0; b < 2; b++) {
        const lat = latCenter + side * b * 2.7;
        const bx = s.position.x + s.right.x * lat;
        const bz = s.position.z + s.right.z * lat;
        const by = s.position.y + s.right.y * lat + 0.46;
        const mesh = new THREE.Mesh(blockGeo, b % 2 === 0 ? redBlockMat : whiteBlockMat);
        mesh.position.set(bx, by, bz);
        mesh.quaternion.copy(q);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        worldColliders.addObb(
          bx,
          bz,
          1.35,
          0.48,
          s.right.x,
          s.right.z,
          'tire',
          by - 1.0,
          by + 1.5,
        );
      }
    });
  }

  if (circuit.features.driftClippingZones && circuit.driftZoneTs.length > 0) {
    const pylonGeo = trackGeo(new THREE.BoxGeometry(0.28, 1.35, 3.8));
    const poleGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8));
    const goldMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.65,
        roughness: 0.25,
      }),
    );

    circuit.driftZoneTs.forEach((dtVal) => {
      const s = circuit.sampleAtT(dtVal);
      const outSide = s.curvature >= 0 ? 1 : -1;
      const lat = outSide * (halfAsp + SHOULDER_WIDTH - 0.15);
      const q = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
      );
      const px = s.position.x + s.right.x * lat;
      const pz = s.position.z + s.right.z * lat;
      const py = s.position.y + s.right.y * lat;

      const board = new THREE.Mesh(pylonGeo, driftClipMat);
      board.position.set(px, py + 0.72, pz);
      board.quaternion.copy(q);
      board.castShadow = true;
      group.add(board);

      const beacon = new THREE.Mesh(poleGeo, goldMat);
      beacon.position.set(px, py + 1.15, pz);
      group.add(beacon);
    });
  }

  void ROAD_HALF_WIDTH;

  return {
    group,
    setWireframe: (wire: boolean) => {
      asphaltMat.wireframe = wire;
      shoulderMat.wireframe = wire;
      concreteMat.wireframe = wire;
      brushedSteelMat.wireframe = wire;
      stayCableMat.wireframe = wire;
      galvanizedSteelMat.wireframe = wire;
      if (curbMat) curbMat.wireframe = wire;
      if (gravelMat) gravelMat.wireframe = wire;
    },
    setNightFactor: (nightFactor: number) => {
      pylonUplightMat.emissiveIntensity = 0.14 + nightFactor * 2.55;
      aviationBeaconMat.emissiveIntensity = 0.28 + nightFactor * 3.35;
      reflectorMat.emissiveIntensity = 0.18 + nightFactor * 2.5;
      catEyeMat.emissiveIntensity = 0.12 + nightFactor * 2.65;
      const showPl = nightFactor > 0.01;
      for (const pl of bridgeDeckEdgeLights) {
        pl.intensity = nightFactor * 3.0;
        pl.visible = showPl;
      }
    },
    setRubberLevel: (level: number) => {
      uRubberLevel.value = Math.max(0, Math.min(1, level));
    },
    setAsphaltWear: (wear: number) => {
      uAsphaltWear.value = Math.max(0, Math.min(1, wear));
    },
    updateVisibilityWindow: (
      focusPos: THREE.Vector3,
      radiusM = 460,
      camPos?: THREE.Vector3,
      camFwd?: THREE.Vector3,
    ) => {
      for (let i = 0; i < chunkedUpdaters.length; i++) {
        chunkedUpdaters[i].updateVisibilityWindow(focusPos, radiusM, camPos, camFwd);
      }
    },
    dispose: () => {
      for (const cu of chunkedUpdaters) cu.dispose();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
    },
  };
}

function createCatchStanchionGeometry(): THREE.BufferGeometry {
  const upright = new THREE.BoxGeometry(0.14, 3.45, 0.16);
  upright.translate(0, 1.15, 0); // Extends -0.57m down into embankment up to +2.88m

  const overhang = new THREE.BoxGeometry(0.12, 0.82, 0.14);
  overhang.rotateZ(0.62);
  overhang.translate(-0.26, 3.12, 0);

  const merged = BufferGeometryUtils.mergeGeometries([upright, overhang], false);
  upright.dispose();
  overhang.dispose();
  return merged;
}

function createTireStackGeometry(): THREE.BufferGeometry {
  const t1 = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  t1.translate(0, 0.14, 0);
  const t2 = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  t2.translate(0, 0.43, 0);
  const t3 = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
  t3.translate(0, 0.72, 0);
  const merged = BufferGeometryUtils.mergeGeometries([t1, t2, t3], false);
  t1.dispose();
  t2.dispose();
  t3.dispose();
  return merged;
}
