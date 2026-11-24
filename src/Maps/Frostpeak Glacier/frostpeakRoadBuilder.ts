import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getCircuitData, ROAD_HALF_WIDTH, SHOULDER_WIDTH } from '../Aurelia Ridge/circuitSpline';
import { FROSTPEAK_WATER_LEVEL } from './frostpeakTerrainField';
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
 * Builds Frostpeak Glacier's cold salted racing tarmac, frosted icy shoulders,
 * glacier-blue & snow-white apex curbs, snow-dusted guardrails, and the Steel-Arch
 * Frozen Glacial Lake Bridge spanning the recessed glacial basin.
 */
export function buildFrostpeakRoadAndBridgeRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): RoadAndBridgeRig {
  const group = new THREE.Group();
  group.name = 'FrostpeakRoadAndBridgeRig';

  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };
  const uRubberLevel = { value: 0.0 };
  const uAsphaltWear = { value: 0.35 };
  const uRoadSnowAccum = { value: 0.0 };

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
  // 1. COLD SALTED TARMAC + FROSTED ICY SHOULDERS
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
      roughness: 0.72,
      metalness: 0.08,
      envMapIntensity: 1.28,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  patchWeatheredAsphaltMaterial(asphaltMat, {
    cacheKey: 'frostpeak-cold-asphalt-v7-unified',
    sharedWeather,
    uRubberLevel,
    uAsphaltWear,
    asphaltORM: textures.asphaltORM,
    highwayStripeStyle: 'white_dashed',
    uRoadSnowAccum,
    frostEdgeRime: 0.95,
    sparkleStrength: 0.78,
    edgeDustRgb: [0.64, 0.72, 0.84],
    camberContrast: 0.085,
  });

  // Packed ice & slush roadside shoulder
  const shoulderMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      map: textures.gravelAlbedo,
      normalMap: textures.terrainRockNormal,
      normalScale: new THREE.Vector2(0.55, 0.55),
      color: 0xc2d5e8,
      roughness: 0.28,
      metalness: 0.06,
      clearcoat: 0.65,
      clearcoatRoughness: 0.18,
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
    name: 'FrostRoadChunks',
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
      roughness: 0.58,
      metalness: 0.06,
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
  // 2. SEGMENTED 3D BEVELED GLACIER BLUE & SNOW-WHITE APEX CURBS
  // ---------------------------------------------------------------------------
  const builtCurbs = buildSegmented3DFiaCurbs({
    samples,
    closedLoop: circuit.closedLoop,
    halfAsp,
    totalLength: circuit.totalLength,
    kerbHeightScale: circuit.kerbHeightScale,
    colorAHex: 0x0284c7,
    colorBHex: 0xf0f9ff,
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
      name: 'FrostCurbChunks',
    });
    chunkedUpdaters.push(curbChunked);
    group.add(curbChunked.group);
  }

  // ---------------------------------------------------------------------------
  // 3. STEEL-ARCH FROST BRIDGE OVER FROZEN GLACIAL LAKE
  // ---------------------------------------------------------------------------
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.concreteNormal,
      color: 0xd8e3ee,
      roughness: 0.76,
      metalness: 0.06,
    }),
  );
  const brushedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcbe0f2,
      roughness: 0.28,
      metalness: 0.84,
      envMapIntensity: 1.4,
    }),
  );
  const archAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.32,
      metalness: 0.55,
    }),
  );
  const beaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.32,
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
    const deckThick = 1.5;
    const parapetH = 1.1;

    const deckPos: number[] = [];
    const deckIdx: number[] = [];
    const ringProfile: Array<[number, number]> = [
      [-deckW, 0.04],
      [-deckW - 0.16, -deckThick * 0.45],
      [-deckW * 0.72, -deckThick],
      [deckW * 0.72, -deckThick],
      [deckW + 0.16, -deckThick * 0.45],
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

    const pierGeos: THREE.BufferGeometry[] = [];
    const archSteelGeos: THREE.BufferGeometry[] = [];
    const lampPostGeos: THREE.BufferGeometry[] = [];
    const lampBulbGeos: THREE.BufferGeometry[] = [];

    // Ice-breaker concrete lake piers reaching through frozen lake ice
    const pierStride = Math.max(10, Math.floor(bLen / 6));
    for (let k = 4; k < bLen - 4; k += pierStride) {
      const s = samples[orderedBridge[k]];
      const qBasis = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
      );
      const bedY = Math.min(groundHeightAt(s.position.x, s.position.z), FROSTPEAK_WATER_LEVEL - 4.0);
      const deckBotY = s.position.y - deckThick;
      const colH = Math.max(5.0, deckBotY - bedY + 1.5);

      for (const sideX of [-deckW * 0.46, deckW * 0.46]) {
        const px = s.position.x + s.right.x * sideX;
        const pz = s.position.z + s.right.z * sideX;
        const col = new THREE.CylinderGeometry(0.95, 1.35, colH, 10);
        col.translate(px, deckBotY - colH * 0.5 + 0.5, pz);
        pierGeos.push(col);
      }

      const cap = new THREE.BoxGeometry(deckW * 1.42, 1.2, 2.3);
      cap.applyQuaternion(qBasis);
      cap.translate(s.position.x, deckBotY - 0.35, s.position.z);
      pierGeos.push(cap);
    }

    // Overhead Twin Brushed-Steel Parabolic Arch Ribs + Vertical Tie Hangers across central lake span
    const archStart = Math.floor(bLen * 0.14);
    const archEnd = Math.floor(bLen * 0.86);
    const archSamples = archEnd - archStart;
    const prevLeft = new THREE.Vector3();
    const prevRight = new THREE.Vector3();
    const currLeft = new THREE.Vector3();
    const currRight = new THREE.Vector3();
    const segDir = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const segQuat = new THREE.Quaternion();

    for (let k = archStart; k <= archEnd; k++) {
      const s = samples[orderedBridge[k]];
      const u = (k - archStart) / Math.max(1, archSamples);
      const archH = Math.sin(u * Math.PI) * 19.5;
      const archLat = deckW + 0.35;

      currLeft.set(
        s.position.x - s.right.x * archLat,
        s.position.y + archH + 0.8,
        s.position.z - s.right.z * archLat,
      );
      currRight.set(
        s.position.x + s.right.x * archLat,
        s.position.y + archH + 0.8,
        s.position.z + s.right.z * archLat,
      );

      if (k > archStart) {
        for (const [a, b] of [
          [prevLeft, currLeft],
          [prevRight, currRight],
        ]) {
          segDir.subVectors(b, a);
          const len = segDir.length();
          if (len > 0.1) {
            segDir.divideScalar(len);
            segQuat.setFromUnitVectors(yAxis, segDir);
            const rib = new THREE.BoxGeometry(0.75, len + 0.12, 0.95);
            rib.applyQuaternion(segQuat);
            rib.translate((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
            archSteelGeos.push(rib);
          }
        }
      }

      // Vertical tie-rod hangers + top wind-bracing struts
      if ((k - archStart) % 4 === 0 && archH > 2.0) {
        for (const pt of [currLeft, currRight]) {
          const hanger = new THREE.CylinderGeometry(0.1, 0.1, archH, 6);
          hanger.translate(pt.x, s.position.y + archH * 0.5 + 0.8, pt.z);
          archSteelGeos.push(hanger);
        }
        if ((k - archStart) % 8 === 0 && archH > 8.0) {
          segDir.subVectors(currRight, currLeft);
          const span = segDir.length();
          if (span > 1.0) {
            segDir.divideScalar(span);
            segQuat.setFromUnitVectors(yAxis, segDir);
            const brace = new THREE.CylinderGeometry(0.18, 0.18, span, 6);
            brace.applyQuaternion(segQuat);
            brace.translate(
              (currLeft.x + currRight.x) * 0.5,
              (currLeft.y + currRight.y) * 0.5,
              (currLeft.z + currRight.z) * 0.5,
            );
            archSteelGeos.push(brace);
          }
        }
      }

      prevLeft.copy(currLeft);
      prevRight.copy(currRight);
    }

    // Bridge side posts & icy cyan lighting bollards
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
        archSteelGeos.push(post);

        if (k % 12 === 0) {
          const lPost = new THREE.CylinderGeometry(0.08, 0.11, 4.8, 8);
          lPost.translate(px, py + 2.4, pz);
          lampPostGeos.push(lPost);

          const lBulb = new THREE.BoxGeometry(0.5, 0.14, 0.25);
          lBulb.applyQuaternion(qBasis);
          lBulb.translate(px - s.right.x * side * 0.6, py + 4.75, pz - s.right.z * side * 0.6);
          lampBulbGeos.push(lBulb);
        }
      }
    }

    const midS = samples[orderedBridge[Math.floor(bLen * 0.5)]];
    const centerLight = new THREE.PointLight(0x7dd3fc, 0, 80, 1.5);
    centerLight.position.set(midS.position.x, midS.position.y + 11.0, midS.position.z);
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
    if (archSteelGeos.length > 0) {
      const m = trackGeo(BufferGeometryUtils.mergeGeometries(archSteelGeos, false));
      archSteelGeos.forEach((g) => g.dispose());
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
  // 4. PROFILED DOUBLE-TIER W-BEAM ALPINE GUARDRAILS + POSTS + CAT-EYES
  // ---------------------------------------------------------------------------
  const barrierMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd0dce8,
      roughness: 0.34,
      metalness: 0.85,
      envMapIntensity: 1.35,
    }),
  );
  const reflectorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.38,
      roughness: 0.2,
      metalness: 0.2,
    }),
  );

  const railOffset = halfTot + 0.52;
  const doubleRailGeos: THREE.BufferGeometry[] = [];
  const postMatrices: THREE.Matrix4[] = [];
  const reflectorMatrices: THREE.Matrix4[] = [];
  const railPostGeo = trackGeo(new THREE.BoxGeometry(0.14, 1.15, 0.14));
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
    buildExtrudedRailBox(pts, rightVecs, isBridgeSeg ? 0.98 : 0.44, side);
    if (!isBridgeSeg) {
      buildExtrudedRailBox(pts, rightVecs, 0.88, side);
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

  const catEyeGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.045, 0.24));
  const catEyeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x7dd3fc,
      emissiveIntensity: 0.16,
      roughness: 0.2,
      metalness: 0.35,
    }),
  );
  const catMatrices: THREE.Matrix4[] = [];
  const catColors: THREE.Color[] = [];
  const colIceStud = new THREE.Color(0x7dd3fc);
  const colWhiteStud = new THREE.Color(0xf8fafc);
  for (let i = 0; i < N; i += 6) {
    const s = samples[i];
    const isTurn = Math.abs(s.curvature) > 0.006;
    const studColor = isTurn ? colIceStud : colWhiteStud;
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
      beaconMat.emissiveIntensity = 0.28 + nightFactor * 2.9;
      reflectorMat.emissiveIntensity = 0.30 + nightFactor * 2.35;
      catEyeMat.emissiveIntensity = 0.16 + nightFactor * 2.6;
      const showPl = nightFactor > 0.01;
      for (const pl of bridgeLights) {
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
    setSnowAccumulation: (level: number) => {
      uRoadSnowAccum.value = Math.max(0, Math.min(1, level));
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
