import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getCircuitData, ROAD_HALF_WIDTH, SHOULDER_WIDTH } from '../Aurelia Ridge/circuitSpline';
import { CORAL_BAY_WATER_LEVEL } from './coralBayTerrainField';
import { ProceduralTextureSuite } from '../Aurelia Ridge/proceduralTextures';
import { type WeatherUniforms } from '../Aurelia Ridge/skyAndLighting';
import { groundHeightAt } from '../Aurelia Ridge/terrainField';
import { worldColliders } from '../Aurelia Ridge/worldColliders';
import { type RoadAndBridgeRig } from '../Aurelia Ridge/roadAndBridgeBuilder';
import { isPointInPitBounds } from '../mapRegistry';
import {
  buildRecessedDrainGrates,
  buildSegmented3DFiaCurbs,
  compactIndexBuffer,
  patchWeatheredAsphaltMaterial,
} from '../sharedRoadDetailKit';
import { buildSpatialChunkedRoadMesh } from '../sharedRoadChunker';

/**
 * Builds Coral Bay's coastal highway, timber boardwalk shoulders, red/white apex curbs,
 * marine guardrails, and the elevated Ocean Causeway Bridge spanning the turquoise lagoon.
 */
export function buildCoralBayRoadAndBridgeRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): RoadAndBridgeRig {
  const group = new THREE.Group();
  group.name = 'CoralBayRoadAndBridgeRig';

  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };
  const uRubberLevel = { value: 0.0 };
  const uAsphaltWear = { value: 0.35 };

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
  // 1. CONTINUOUS COASTAL ASPHALT & WARM BOARDWALK SHOULDER RIBBON
  // ---------------------------------------------------------------------------
  const halfAsp = circuit.roadHalfWidth;
  const halfTot = halfAsp + SHOULDER_WIDTH;
  const cols = 7;

  const posArr = new Float32Array(N * cols * 3);
  const uvArr = new Float32Array(N * cols * 2);
  const apexBiasArr = new Float32Array(N * cols);
  const aspIdx: number[] = [];
  const shIdx: number[] = [];

  for (let i = 0; i < N; i++) {
    const s = samples[i];
    const vCoord = s.arcLength / 11.5;
    const offsets = [-halfTot, -halfAsp, -halfAsp, 0, halfAsp, halfAsp, halfTot];
    const uCoords = [0.0, 0.22, 0.0, 0.5, 1.0, 0.78, 1.0];
    const lifts = [-0.05, 0.0, 0.015, 0.055, 0.015, 0.0, -0.05];
    const apexTarget = Math.max(-1, Math.min(1, s.curvature * 75));

    for (let c = 0; c < cols; c++) {
      const vi = i * cols + c;
      const lat = offsets[c];
      const lift = lifts[c];
      const px = s.position.x + s.right.x * lat + s.up.x * lift;
      const py = s.position.y + s.right.y * lat + s.up.y * lift + 0.04;
      const pz = s.position.z + s.right.z * lat + s.up.z * lift;

      posArr[vi * 3] = px;
      posArr[vi * 3 + 1] = py;
      posArr[vi * 3 + 2] = pz;
      uvArr[vi * 2] = uCoords[c];
      uvArr[vi * 2 + 1] = vCoord;
      apexBiasArr[vi] = apexTarget;
    }

    const next = (i + 1) % N;
    const pushQuad = (c0: number, c1: number, target: number[]) => {
      const a = i * cols + c0;
      const b = i * cols + c1;
      const d = next * cols + c0;
      const e = next * cols + c1;
      target.push(a, b, d, b, e, d);
    };
    pushQuad(0, 1, shIdx);
    pushQuad(2, 3, aspIdx);
    pushQuad(3, 4, aspIdx);
    pushQuad(5, 6, shIdx);
  }

  const roadGeo = trackGeo(new THREE.BufferGeometry());
  roadGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  roadGeo.setAttribute('aApexBias', new THREE.BufferAttribute(apexBiasArr, 1));
  roadGeo.setIndex(
    new THREE.BufferAttribute(compactIndexBuffer([...aspIdx, ...shIdx], N * cols), 1),
  );
  roadGeo.addGroup(0, aspIdx.length, 0);
  roadGeo.addGroup(aspIdx.length, shIdx.length, 1);
  roadGeo.computeVertexNormals();

  const asphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.asphaltAlbedo,
      normalMap: textures.asphaltNormal,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughnessMap: textures.asphaltRoughness,
      roughness: 0.82,
      metalness: 0.05,
      envMapIntensity: 1.15,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  patchWeatheredAsphaltMaterial(asphaltMat, {
    cacheKey: 'coral-bay-asphalt-v5-gt7-vinewood',
    sharedWeather,
    uRubberLevel,
    uAsphaltWear,
    asphaltORM: textures.asphaltORM,
    highwayStripeStyle: 'double_yellow',
    sparkleStrength: 0.88,
    edgeDustRgb: [0.64, 0.58, 0.44],
    camberContrast: 0.09,
  });

  // Sun-bleached coastal timber & sandstone boardwalk shoulder
  const shoulderMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.gravelAlbedo,
      normalMap: textures.terrainRockNormal,
      normalScale: new THREE.Vector2(0.65, 0.65),
      color: 0xbda27e,
      roughness: 0.84,
      metalness: 0.04,
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
    name: 'CoralRoadChunks',
  });
  chunkedUpdaters.push(roadChunked);
  group.add(roadChunked.group);

  // Start / Finish checkered grid decal
  const sfSample = samples[circuit.startFinishIndex];
  const sfGeo = trackGeo(new THREE.PlaneGeometry(halfAsp * 1.9, 28));
  sfGeo.rotateX(-Math.PI / 2);
  const sfMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.startGridAlbedo,
      transparent: true,
      roughness: 0.62,
      metalness: 0.05,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  const sfMesh = new THREE.Mesh(sfGeo, sfMat);
  sfMesh.position.copy(sfSample.position).addScaledVector(sfSample.up, 0.09);
  sfMesh.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(sfSample.right, sfSample.up, sfSample.tangent.clone().negate()),
  );
  sfMesh.receiveShadow = true;
  group.add(sfMesh);

  // ---------------------------------------------------------------------------
  // 2. SEGMENTED 3D BEVELED CYAN & WHITE COASTAL APEX CURBS
  // ---------------------------------------------------------------------------
  const builtCurbs = buildSegmented3DFiaCurbs({
    samples,
    closedLoop: circuit.closedLoop,
    halfAsp,
    totalLength: circuit.totalLength,
    kerbHeightScale: circuit.kerbHeightScale,
    colorAHex: 0x0ea5e9,
    colorBHex: 0xf8fafc,
    pitLaneBounds: circuit.pitLaneBounds,
    normalMap: textures.curbNormal,
    trackGeo,
    trackMat,
  });
  const curbMat = builtCurbs.material;
  if (builtCurbs.mesh && curbMat) {
    const curbChunked = buildSpatialChunkedRoadMesh(builtCurbs.mesh.geometry, curbMat, {
      cellSizeM: 120,
      castShadow: true,
      receiveShadow: true,
      name: 'CoralCurbChunks',
    });
    chunkedUpdaters.push(curbChunked);
    group.add(curbChunked.group);
  }

  // ---------------------------------------------------------------------------
  // 3. MULTI-SPAN OCEAN CAUSEWAY BRIDGE (Over Turquoise Lagoon)
  // ---------------------------------------------------------------------------
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.concreteNormal,
      color: 0xe2e8f0,
      roughness: 0.78,
      metalness: 0.08,
    }),
  );
  const brushedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.28,
      metalness: 0.85,
      envMapIntensity: 1.35,
    }),
  );
  const archAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.35,
      metalness: 0.45,
    }),
  );
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.25,
      roughness: 0.2,
    }),
  );

  const bridgeIndices: number[] = [];
  for (let i = 0; i < N; i++) {
    if (samples[i].isBridge) bridgeIndices.push(i);
  }
  let orderedBridge: number[] = [];
  if (bridgeIndices.length > 0) {
    let split = 0;
    for (let k = 1; k < bridgeIndices.length; k++) {
      if (bridgeIndices[k] - bridgeIndices[k - 1] > 10) {
        split = k;
        break;
      }
    }
    orderedBridge =
      split > 0
        ? [...bridgeIndices.slice(split), ...bridgeIndices.slice(0, split)]
        : bridgeIndices;
  }

  const bridgeLights: THREE.PointLight[] = [];

  if (orderedBridge.length > 10) {
    const bLen = orderedBridge.length;
    const deckW = halfTot + 0.65;
    const deckThick = 1.45;
    const parapetH = 1.1;

    // Closed solid concrete box-girder causeway deck under asphalt
    const deckPos: number[] = [];
    const deckIdx: number[] = [];
    const ringProfile: Array<[number, number]> = [
      [-deckW, 0.04],
      [-deckW - 0.15, -deckThick * 0.45],
      [-deckW * 0.72, -deckThick],
      [deckW * 0.72, -deckThick],
      [deckW + 0.15, -deckThick * 0.45],
      [deckW, 0.04],
    ];
    for (let k = 0; k < bLen; k++) {
      const s = samples[orderedBridge[k]];
      for (const [lat, yOff] of ringProfile) {
        deckPos.push(
          s.position.x + s.right.x * lat + s.up.x * yOff,
          s.position.y + s.right.y * lat + s.up.y * yOff,
          s.position.z + s.right.z * lat + s.up.z * yOff,
        );
      }
      if (k < bLen - 1) {
        const ring = ringProfile.length;
        for (let r = 0; r < ring - 1; r++) {
          const a = k * ring + r;
          const b = a + 1;
          const d = (k + 1) * ring + r;
          const e = d + 1;
          deckIdx.push(a, d, b, b, d, e);
        }
      }
    }
    const deckGeo = trackGeo(new THREE.BufferGeometry());
    deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
    deckGeo.setIndex(deckIdx);
    deckGeo.computeVertexNormals();
    const deckMesh = new THREE.Mesh(deckGeo, concreteMat);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    group.add(deckMesh);

    // Coastal Causeway Side Parapet Walls + Steel Safety Rails + Pier Support Caissons
    const pierGeos: THREE.BufferGeometry[] = [];
    const railPostGeos: THREE.BufferGeometry[] = [];
    const lampPostGeos: THREE.BufferGeometry[] = [];
    const lampBulbGeos: THREE.BufferGeometry[] = [];

    const pierStride = Math.max(10, Math.floor(bLen / 7));
    for (let k = 4; k < bLen - 4; k += pierStride) {
      const s = samples[orderedBridge[k]];
      const qBasis = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
      );
      const bedY = Math.min(groundHeightAt(s.position.x, s.position.z), CORAL_BAY_WATER_LEVEL - 4.5);
      const deckBotY = s.position.y - deckThick;
      const colH = Math.max(4.0, deckBotY - bedY + 1.5);

      for (const sideX of [-deckW * 0.48, deckW * 0.48]) {
        const px = s.position.x + s.right.x * sideX;
        const pz = s.position.z + s.right.z * sideX;
        const col = new THREE.CylinderGeometry(0.95, 1.25, colH, 10);
        col.translate(px, deckBotY - colH * 0.5 + 0.5, pz);
        pierGeos.push(col);
      }

      // Crossbeam pier cap
      const cap = new THREE.BoxGeometry(deckW * 1.4, 1.15, 2.2);
      cap.applyQuaternion(qBasis);
      cap.translate(s.position.x, deckBotY - 0.35, s.position.z);
      pierGeos.push(cap);

      // Decorative marine arch ribs on center 3 spans
      if (Math.abs(k - bLen * 0.5) < bLen * 0.28) {
        for (const side of [-1, 1] as const) {
          const archLat = side * (deckW + 0.25);
          const ax = s.position.x + s.right.x * archLat;
          const az = s.position.z + s.right.z * archLat;
          const post = new THREE.BoxGeometry(0.45, 7.5, 0.9);
          post.applyQuaternion(qBasis);
          post.translate(ax, s.position.y + 3.6, az);
          railPostGeos.push(post);
        }
      }
    }

    // Continuous causeway side railings + lighting bollards
    for (let k = 0; k < bLen; k += 4) {
      const s = samples[orderedBridge[k]];
      const qBasis = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
      );
      for (const side of [-1, 1] as const) {
        const lat = side * (halfTot + 0.35);
        const px = s.position.x + s.right.x * lat;
        const py = s.position.y + s.right.y * lat;
        const pz = s.position.z + s.right.z * lat;

        const post = new THREE.BoxGeometry(0.18, parapetH, 0.22);
        post.applyQuaternion(qBasis);
        post.translate(px, py + parapetH * 0.5, pz);
        railPostGeos.push(post);

        if (k % 12 === 0) {
          const lPost = new THREE.CylinderGeometry(0.08, 0.11, 4.6, 8);
          lPost.translate(px, py + 2.3, pz);
          lampPostGeos.push(lPost);

          const lBulb = new THREE.BoxGeometry(0.48, 0.14, 0.24);
          lBulb.applyQuaternion(qBasis);
          lBulb.translate(px - s.right.x * side * 0.6, py + 4.55, pz - s.right.z * side * 0.6);
          lampBulbGeos.push(lBulb);
        }
      }
    }

    // Center causeway warm-cyan beacon lights
    const midS = samples[orderedBridge[Math.floor(bLen * 0.5)]];
    const centerLight = new THREE.PointLight(0x38bdf8, 0, 70, 1.5);
    centerLight.position.set(midS.position.x, midS.position.y + 8.0, midS.position.z);
    centerLight.visible = false;
    group.add(centerLight);
    bridgeLights.push(centerLight);

    if (pierGeos.length > 0) {
      const m = trackGeo(BufferGeometryUtils.mergeGeometries(pierGeos, false));
      pierGeos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(m, concreteMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (railPostGeos.length > 0) {
      const m = trackGeo(BufferGeometryUtils.mergeGeometries(railPostGeos, false));
      railPostGeos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(m, brushedSteelMat);
      mesh.castShadow = true;
      group.add(mesh);
    }
    if (lampPostGeos.length > 0) {
      const m = trackGeo(BufferGeometryUtils.mergeGeometries(lampPostGeos, false));
      lampPostGeos.forEach((g) => g.dispose());
      group.add(new THREE.Mesh(m, archAccentMat));
    }
    if (lampBulbGeos.length > 0) {
      const m = trackGeo(BufferGeometryUtils.mergeGeometries(lampBulbGeos, false));
      lampBulbGeos.forEach((g) => g.dispose());
      group.add(new THREE.Mesh(m, beaconMat));
    }
  }

  // ---------------------------------------------------------------------------
  // 4. PROFILED DOUBLE-TIER COASTAL GUARDRAILS + POSTS + REFLECTORS + CAT-EYES
  // ---------------------------------------------------------------------------
  const barrierMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.34,
      metalness: 0.84,
      envMapIntensity: 1.35,
    }),
  );
  const reflectorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.32,
      roughness: 0.2,
      metalness: 0.2,
    }),
  );

  const railOffset = halfTot + 0.52;
  const doubleRailGeos: THREE.BufferGeometry[] = [];
  const postMatrices: THREE.Matrix4[] = [];
  const reflectorMatrices: THREE.Matrix4[] = [];
  const railPostGeo = trackGeo(new THREE.BoxGeometry(0.14, 1.12, 0.14));
  const reflectorTabGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.14, 0.22));

  worldColliders.initSplineBarriers(N);

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

  const buildGuardrailSegment = (startIdx: number, endIdx: number, side: -1 | 1, isBridgeSeg: boolean) => {
    const pts: THREE.Vector3[] = [];
    const rightVecs: THREE.Vector3[] = [];
    const off = isBridgeSeg ? halfTot + 0.35 : railOffset;
    for (let i = startIdx; i <= endIdx; i++) {
      const s = samples[i % N];
      const gx = s.position.x + s.right.x * side * off;
      const gz = s.position.z + s.right.z * side * off;
      const gy = s.position.y + s.right.y * side * off;
      pts.push(new THREE.Vector3(gx, gy, gz));
      rightVecs.push(s.right);

      if ((i - startIdx) % 2 === 0 && !isBridgeSeg) {
        const basisQuat = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(
            s.right.clone().multiplyScalar(side),
            new THREE.Vector3(0, 1, 0),
            s.tangent.clone().multiplyScalar(-side),
          ),
        );
        postMatrices.push(
          new THREE.Matrix4().compose(new THREE.Vector3(gx, gy + 0.34, gz), basisQuat, new THREE.Vector3(1, 1, 1)),
        );
        if ((i - startIdx) % 4 === 0) {
          const refPos = new THREE.Vector3(gx, gy + 0.94, gz).addScaledVector(s.right, -side * 0.12);
          reflectorMatrices.push(
            new THREE.Matrix4().compose(refPos, basisQuat, new THREE.Vector3(1, 1, 1)),
          );
        }
      }
    }
    buildExtrudedRailBox(pts, rightVecs, isBridgeSeg ? 0.96 : 0.44, side);
    if (!isBridgeSeg) {
      buildExtrudedRailBox(pts, rightVecs, 0.86, side);
    }
  };

  for (const side of [-1, 1] as const) {
    let inRail = false;
    let railStart = 0;
    let railBridge = false;
    for (let i = 0; i < N; i++) {
      const s = samples[i];
      const inPitEntryGap =
        side === -1 &&
        s.isStraight &&
        isPointInPitBounds(circuit.pitLaneBounds, s.position.x, s.position.y, s.position.z, 18, 28);
      const wantRail = !inPitEntryGap;
      if (wantRail) {
        worldColliders.setSplineBarrier(i, side, (s.isBridge ? halfTot + 0.25 : railOffset - 0.08), s.isBridge ? 'concrete' : 'metal');
      }
      if (wantRail && !inRail) {
        inRail = true;
        railStart = i;
        railBridge = s.isBridge;
      } else if ((!wantRail || s.isBridge !== railBridge) && inRail) {
        if (i - railStart > 4) buildGuardrailSegment(railStart, i, side, railBridge);
        inRail = wantRail;
        railStart = i;
        railBridge = s.isBridge;
      }
    }
    if (inRail && N - 1 - railStart > 4) buildGuardrailSegment(railStart, N - 1, side, railBridge);
  }

  if (doubleRailGeos.length > 0) {
    const mergedRails = trackGeo(BufferGeometryUtils.mergeGeometries(doubleRailGeos, false));
    for (const g of doubleRailGeos) g.dispose();
    const railsMesh = new THREE.Mesh(mergedRails, barrierMat);
    railsMesh.castShadow = true;
    railsMesh.receiveShadow = true;
    group.add(railsMesh);
  }
  if (postMatrices.length > 0) {
    const postsInst = new THREE.InstancedMesh(railPostGeo, barrierMat, postMatrices.length);
    for (let i = 0; i < postMatrices.length; i++) postsInst.setMatrixAt(i, postMatrices[i]);
    postsInst.instanceMatrix.needsUpdate = true;
    postsInst.computeBoundingSphere();
    postsInst.castShadow = true;
    group.add(postsInst);
  }
  if (reflectorMatrices.length > 0) {
    const refInst = new THREE.InstancedMesh(reflectorTabGeo, reflectorMat, reflectorMatrices.length);
    for (let i = 0; i < reflectorMatrices.length; i++) refInst.setMatrixAt(i, reflectorMatrices[i]);
    refInst.instanceMatrix.needsUpdate = true;
    refInst.computeBoundingSphere();
    group.add(refInst);
  }

  // Pavement cat-eye studs
  const catEyeGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.045, 0.24));
  const catEyeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.14,
      roughness: 0.2,
      metalness: 0.35,
    }),
  );
  const catMatrices: THREE.Matrix4[] = [];
  const catColors: THREE.Color[] = [];
  const colCyanStud = new THREE.Color(0x38bdf8);
  const colWhiteStud = new THREE.Color(0xf8fafc);
  for (let i = 0; i < N; i += 6) {
    const s = samples[i];
    const isTurn = Math.abs(s.curvature) > 0.006;
    const studColor = isTurn ? colCyanStud : colWhiteStud;
    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
    );
    for (const side of [-1, 1] as const) {
      const lat = side * (halfAsp - 0.32);
      const pos = s.position.clone().addScaledVector(s.right, lat).addScaledVector(s.up, 0.045);
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

  // Recessed trackside & pit-gutter cast-iron storm-drain grates
  group.add(
    buildRecessedDrainGrates({
      samples,
      halfAsp,
      pitLaneBounds: circuit.pitLaneBounds,
      spacingSamples: 16,
      trackGeo,
      trackMat,
    }),
  );

  void ROAD_HALF_WIDTH;

  return {
    group,
    setWireframe: (wire: boolean) => {
      asphaltMat.wireframe = wire;
      shoulderMat.wireframe = wire;
      concreteMat.wireframe = wire;
      brushedSteelMat.wireframe = wire;
      barrierMat.wireframe = wire;
      if (curbMat) curbMat.wireframe = wire;
    },
    setNightFactor: (nightFactor: number) => {
      beaconMat.emissiveIntensity = 0.24 + nightFactor * 2.85;
      reflectorMat.emissiveIntensity = 0.28 + nightFactor * 2.3;
      catEyeMat.emissiveIntensity = 0.14 + nightFactor * 2.6;
      const showPl = nightFactor > 0.01;
      for (const pl of bridgeLights) {
        pl.intensity = nightFactor * 2.9;
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
