import * as THREE from 'three';
import {
  createCircuitQueryScratch,
  getCircuitData,
  SHOULDER_WIDTH,
} from '../Aurelia Ridge/circuitSpline';
import { clamp, createSeededRandom, fbm2D, lerp, smoothstep } from '../../engine/mathNoise';
import { ProceduralTextureSuite } from '../Aurelia Ridge/proceduralTextures';
import { type WeatherUniforms } from '../Aurelia Ridge/skyAndLighting';
import { groundHeightAt, groundNormalAtInto } from '../Aurelia Ridge/terrainField';
import { worldColliders } from '../Aurelia Ridge/worldColliders';
import { buildChunkedTerrainTiles } from '../sharedTerrainChunker';
import { buildSpatialChunkedRoadMesh } from '../sharedRoadChunker';
import { patchWeatheredAsphaltMaterial } from '../sharedRoadDetailKit';
import type { TerrainRig, InspectMode } from '../Aurelia Ridge/terrainBuilder';
import type { RoadAndBridgeRig } from '../Aurelia Ridge/roadAndBridgeBuilder';
import type { LandmarksAndCampusRig } from '../Aurelia Ridge/landmarksAndCampusBuilder';
import type { PropsAndFoliageRig, PropsQualityTier } from '../Aurelia Ridge/propsAndFoliageBuilder';
import { MAP_REGISTRY } from '../mapRegistry';

export function buildTougeTerrainRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
  _mistUniforms?: unknown,
  isSoftwareGl = false,
): TerrainRig {
  const group = new THREE.Group();
  group.name = 'TougeTerrainRig';

  const circuit = getCircuitData();
  const isMyogi = circuit.mapId === 'myogi_pass';
  const isAkagi = circuit.mapId === 'akagi_pass';
  const terrainSizeM = 2250;
  const segs = isSoftwareGl ? 128 : 220;
  const geo = new THREE.PlaneGeometry(terrainSizeM, terrainSizeM, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const queryScratch = createCircuitQueryScratch(circuit.samples[0]);

  const cForestDark = new THREE.Color(isMyogi ? 0x1a281d : isAkagi ? 0x223220 : 0x1b2c1d);
  const cForestMoss = new THREE.Color(isMyogi ? 0x273524 : isAkagi ? 0x344626 : 0x293b25);
  const cSlateRock = new THREE.Color(isMyogi ? 0x3b3e45 : 0x454a52);
  const cGravelVerge = new THREE.Color(0x52555a);
  const tmpCol = new THREE.Color();
  const tmpNorm = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeightAt(x, z);
    pos.setY(i, y);

    const q = circuit.queryNearestGroundTrackInto(x, z, queryScratch);
    const dist = q.absDistance;
    groundNormalAtInto(x, z, 4.0, tmpNorm);
    const slopeSteep = 1 - clamp(tmpNorm.y, 0, 1);

    const patchN = fbm2D(x * 0.008, z * 0.008, 2, 2.0, 0.5, 711) * 0.5 + 0.5;
    tmpCol.copy(cForestDark).lerp(cForestMoss, patchN);
    const rockMix = smoothstep(0.16, 0.42, slopeSteep);
    tmpCol.lerp(cSlateRock, rockMix);

    if (dist < circuit.roadHalfWidth + SHOULDER_WIDTH + 6.5) {
      const vergeW = 1 - smoothstep(circuit.roadHalfWidth + 1.5, circuit.roadHalfWidth + SHOULDER_WIDTH + 6.5, dist);
      tmpCol.lerp(cGravelVerge, vergeW * 0.68);
    }

    colors[i * 3] = tmpCol.r;
    colors[i * 3 + 1] = tmpCol.g;
    colors[i * 3 + 2] = tmpCol.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const sharedWeather = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };

  const terrainMat = new THREE.MeshStandardMaterial({
    map: textures.terrainGrassAlbedo,
    normalMap: textures.terrainGrassNormal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
  });
  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = sharedWeather.uWetness;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uWetness;`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.36, uWetness * 0.55);`,
      );
  };

  const chunked = buildChunkedTerrainTiles(geo, terrainMat, terrainSizeM, segs, {
    chunkSizeM: 210,
    receiveShadow: true,
    castShadow: false,
    name: 'TougeMountainChunks',
  });
  group.add(chunked.group);

  const dummyWaterGeo = new THREE.BufferGeometry();
  const dummyWaterMat = new THREE.MeshBasicMaterial({ visible: false });
  const waterMesh = new THREE.Mesh(dummyWaterGeo, dummyWaterMat);
  waterMesh.visible = false;
  const skirtGeo = new THREE.BufferGeometry();
  const skirtMat = new THREE.MeshBasicMaterial({ visible: false });
  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
  skirtMesh.visible = false;

  return {
    group,
    terrainMesh: chunked.primaryMesh,
    skirtMesh,
    waterMesh,
    updateWater: () => {},
    updateVisibilityWindow: (
      focusPos: THREE.Vector3,
      radiusM = 560,
      camPos?: THREE.Vector3,
      camFwd?: THREE.Vector3,
    ) => {
      chunked.updateVisibilityWindow(focusPos, radiusM, false, camPos, camFwd);
    },
    setInspectMode: (mode: InspectMode) => {
      terrainMat.wireframe = mode === 'wireframe';
    },
    dispose: () => {
      chunked.dispose();
      terrainMat.dispose();
      dummyWaterGeo.dispose();
      dummyWaterMat.dispose();
      skirtGeo.dispose();
      skirtMat.dispose();
    },
  };
}

export function buildTougeRoadRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): RoadAndBridgeRig {
  const group = new THREE.Group();
  group.name = 'TougeRoadRig';

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
  const disposableTex: THREE.Texture[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };

  // Procedural 2-lane Japanese touge road markings texture (white edges + dashed/solid center yellow)
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 256;
  stripeCanvas.height = 512;
  const sCtx = stripeCanvas.getContext('2d')!;
  sCtx.clearRect(0, 0, 256, 512);
  // White outer edge lines
  sCtx.fillStyle = 'rgba(241, 245, 249, 0.92)';
  sCtx.fillRect(10, 0, 7, 512);
  sCtx.fillRect(239, 0, 7, 512);
  // Japanese orange-yellow touge center line (dashed on fast sections, solid look)
  sCtx.fillStyle = 'rgba(245, 158, 11, 0.95)';
  sCtx.fillRect(124, 24, 8, 340);
  const stripeTex = new THREE.CanvasTexture(stripeCanvas);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.wrapS = THREE.ClampToEdgeWrapping;
  stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.anisotropy = 4;
  disposableTex.push(stripeTex);

  const halfAsp = circuit.roadHalfWidth;
  const shoulderExtra = 1.6;
  const halfFull = halfAsp + shoulderExtra;
  const cols = 5;
  const vertCount = N * cols;
  const roadPos = new Float32Array(vertCount * 3);
  const roadUv = new Float32Array(vertCount * 2);
  const roadApexBias = new Float32Array(vertCount);
  const vScale = circuit.totalLength / 14.0;

  for (let i = 0; i < N; i++) {
    const s = samples[i];
    const v = (i / (N - 1)) * vScale;
    const p = s.position;
    const r = s.right;
    const u = s.up;
    const offsets = [-halfFull, -halfAsp, 0, halfAsp, halfFull];
    const uCoords = [-0.14, 0, 0.5, 1, 1.14];
    const hDrops = [-0.16, 0.0, 0.035, 0.0, -0.16];
    for (let c = 0; c < cols; c++) {
      const idx = i * cols + c;
      const lat = offsets[c];
      const h = hDrops[c];
      roadPos[idx * 3] = p.x + r.x * lat + u.x * h;
      roadPos[idx * 3 + 1] = p.y + r.y * lat + u.y * h;
      roadPos[idx * 3 + 2] = p.z + r.z * lat + u.z * h;
      roadUv[idx * 2] = uCoords[c];
      roadUv[idx * 2 + 1] = v;
      roadApexBias[idx] = c === 1 || c === 3 ? 0.55 : c === 2 ? 0.85 : 0.15;
    }
  }

  const asphaltIndices: number[] = [];
  const shoulderIndices: number[] = [];
  for (let i = 0; i < N - 1; i++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = i * cols + c;
      const b = a + 1;
      const d = (i + 1) * cols + c;
      const e = d + 1;
      const target = c === 0 || c === cols - 2 ? shoulderIndices : asphaltIndices;
      target.push(a, b, d, b, e, d);
    }
  }

  const roadGeo = trackGeo(new THREE.BufferGeometry());
  roadGeo.setAttribute('position', new THREE.BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(roadUv, 2));
  roadGeo.setAttribute('aApexBias', new THREE.BufferAttribute(roadApexBias, 1));
  roadGeo.setIndex([...asphaltIndices, ...shoulderIndices]);
  roadGeo.addGroup(0, asphaltIndices.length, 0);
  roadGeo.addGroup(asphaltIndices.length, shoulderIndices.length, 1);
  roadGeo.computeVertexNormals();

  const uRubberLevel = { value: 0.12 };
  const uAsphaltWear = { value: 0.45 };
  const asphaltMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.asphaltAlbedo,
      normalMap: textures.asphaltNormal,
      normalScale: new THREE.Vector2(1.05, 1.05),
      roughnessMap: textures.asphaltRoughness,
      roughness: 0.88,
      metalness: 0.05,
    }),
  );
  patchWeatheredAsphaltMaterial(asphaltMat, {
    cacheKey: 'touge-asphalt-weathered-v1',
    sharedWeather,
    uRubberLevel,
    uAsphaltWear,
    asphaltORM: textures.asphaltORM,
  });

  const shoulderMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.gravelAlbedo,
      roughness: 0.94,
      metalness: 0.02,
    }),
  );

  const chunkedRoad = buildSpatialChunkedRoadMesh(roadGeo, [asphaltMat, shoulderMat], {
    cellSizeM: 120,
    receiveShadow: true,
    castShadow: false,
    name: 'TougeAsphaltChunks',
    disposeSource: false,
  });
  group.add(chunkedRoad.group);

  // Touge centerline + edge markings overlay mesh
  const markPos = new Float32Array(N * 2 * 3);
  const markUv = new Float32Array(N * 2 * 2);
  const markIdx: number[] = [];
  for (let i = 0; i < N; i++) {
    const s = samples[i];
    const v = (i / (N - 1)) * (circuit.totalLength / 11.0);
    for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
      const lat = sideIdx === 0 ? -halfAsp + 0.12 : halfAsp - 0.12;
      const vi = i * 2 + sideIdx;
      markPos[vi * 3] = s.position.x + s.right.x * lat + s.up.x * 0.048;
      markPos[vi * 3 + 1] = s.position.y + s.right.y * lat + s.up.y * 0.048;
      markPos[vi * 3 + 2] = s.position.z + s.right.z * lat + s.up.z * 0.048;
      markUv[vi * 2] = sideIdx;
      markUv[vi * 2 + 1] = v;
    }
    if (i < N - 1) {
      const a = i * 2;
      const b = a + 1;
      const d = (i + 1) * 2;
      const e = d + 1;
      markIdx.push(a, b, d, b, e, d);
    }
  }
  const markGeo = trackGeo(new THREE.BufferGeometry());
  markGeo.setAttribute('position', new THREE.BufferAttribute(markPos, 3));
  markGeo.setAttribute('uv', new THREE.BufferAttribute(markUv, 2));
  markGeo.setIndex(markIdx);
  markGeo.computeVertexNormals();
  const markMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: stripeTex,
      transparent: true,
      alphaTest: 0.15,
      roughness: 0.78,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
  const markMesh = new THREE.Mesh(markGeo, markMat);
  markMesh.receiveShadow = true;
  group.add(markMesh);

  // Inner Japanese Touge Concrete Drainage Gutters on sharp hairpins (for Akina gutter-hook feel)
  const gutterPos: number[] = [];
  const gutterIdx: number[] = [];
  const gutterMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      color: 0x9ca3af,
      roughness: 0.85,
      metalness: 0.05,
    }),
  );

  let inGutter = false;
  let gutterStart = 0;
  let gutterSide: -1 | 1 = -1;
  const emitGutterRun = (startIdx: number, endIdx: number, side: -1 | 1) => {
    if (endIdx - startIdx < 4) return;
    const baseVert = gutterPos.length / 3;
    const steps = endIdx - startIdx + 1;
    for (let k = 0; k < steps; k++) {
      const s = samples[startIdx + k];
      const lat0 = side * (halfAsp - 0.15);
      const lat1 = side * (halfAsp + 0.55);
      const lat2 = side * (halfAsp + 1.05);
      // Outer lip, recessed trench, outer curb lip
      gutterPos.push(
        s.position.x + s.right.x * lat0 + s.up.x * 0.03,
        s.position.y + s.right.y * lat0 + s.up.y * 0.03,
        s.position.z + s.right.z * lat0 + s.up.z * 0.03,
        s.position.x + s.right.x * lat1 - s.up.x * 0.10,
        s.position.y + s.right.y * lat1 - s.up.y * 0.10,
        s.position.z + s.right.z * lat1 - s.up.z * 0.10,
        s.position.x + s.right.x * lat2 + s.up.x * 0.08,
        s.position.y + s.right.y * lat2 + s.up.y * 0.08,
        s.position.z + s.right.z * lat2 + s.up.z * 0.08,
      );
      if (k < steps - 1) {
        const rowA = baseVert + k * 3;
        const rowB = baseVert + (k + 1) * 3;
        if (side === 1) {
          gutterIdx.push(rowA, rowA + 1, rowB, rowA + 1, rowB + 1, rowB);
          gutterIdx.push(rowA + 1, rowA + 2, rowB + 1, rowA + 2, rowB + 2, rowB + 1);
        } else {
          gutterIdx.push(rowA, rowB, rowA + 1, rowA + 1, rowB, rowB + 1);
          gutterIdx.push(rowA + 1, rowB + 1, rowA + 2, rowA + 2, rowB + 1, rowB + 2);
        }
      }
    }
  };

  for (let i = 0; i < N; i++) {
    const absC = Math.abs(samples[i].curvature);
    const desiredSide: -1 | 1 = samples[i].curvature >= 0 ? -1 : 1; // Inside apex side
    if (absC > 0.0075) {
      if (!inGutter) {
        inGutter = true;
        gutterStart = i;
        gutterSide = desiredSide;
      } else if (desiredSide !== gutterSide) {
        emitGutterRun(gutterStart, i, gutterSide);
        gutterStart = i;
        gutterSide = desiredSide;
      }
    } else if (inGutter) {
      emitGutterRun(gutterStart, i, gutterSide);
      inGutter = false;
    }
  }
  if (inGutter) emitGutterRun(gutterStart, N - 1, gutterSide);

  if (gutterPos.length > 0) {
    const gGeo = trackGeo(new THREE.BufferGeometry());
    gGeo.setAttribute('position', new THREE.Float32BufferAttribute(gutterPos, 3));
    gGeo.setIndex(gutterIdx);
    gGeo.computeVertexNormals();
    const gMesh = new THREE.Mesh(gGeo, gutterMat);
    gMesh.receiveShadow = true;
    group.add(gMesh);
  }

  // Japanese Touge W-Beam Steel Guardrails + Colliders + Night Reflectors
  const railOffset = halfAsp + 1.45;
  worldColliders.initSplineBarriers(N);
  const railMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xcfd6df,
      roughness: 0.42,
      metalness: 0.72,
    }),
  );
  const reflectorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffa600,
      emissive: 0xff7b00,
      emissiveIntensity: 0.25,
      roughness: 0.25,
    }),
  );

  const railVerts: number[] = [];
  const railIdx: number[] = [];
  const postMatrices: THREE.Matrix4[] = [];
  const refMatrices: THREE.Matrix4[] = [];
  const upVec = new THREE.Vector3(0, 1, 0);

  for (const side of [-1, 1] as const) {
    let segStart = -1;
    for (let i = 0; i < N; i++) {
      const s = samples[i];
      const probeX = s.position.x + s.right.x * side * (railOffset + 4.5);
      const probeZ = s.position.z + s.right.z * side * (railOffset + 4.5);
      const isOuter = s.curvature * side > 0.0022;
      const isDrop = groundHeightAt(probeX, probeZ) < s.position.y - 1.25;
      const needsRail = isOuter || isDrop || i < 45 || i > N - 45;

      if (needsRail) {
        worldColliders.setSplineBarrier(i, side, railOffset, 'metal');
        if (segStart < 0) segStart = i;
      } else if (segStart >= 0) {
        emitRailSpan(segStart, i - 1, side);
        segStart = -1;
      }
    }
    if (segStart >= 0) {
      emitRailSpan(segStart, N - 1, side);
    }
  }

  function emitRailSpan(startIdx: number, endIdx: number, side: -1 | 1) {
    if (endIdx - startIdx < 3) return;
    const baseV = railVerts.length / 3;
    const len = endIdx - startIdx + 1;
    for (let k = 0; k < len; k++) {
      const i = startIdx + k;
      const s = samples[i];
      const rx = s.position.x + s.right.x * side * railOffset;
      const ry = s.position.y + s.right.y * side * railOffset;
      const rz = s.position.z + s.right.z * side * railOffset;
      const inX = -s.right.x * side * 0.08;
      const inZ = -s.right.z * side * 0.08;

      // 2 vertical ribbon vertices for top/bottom of W-beam (double-sided visual thickness)
      railVerts.push(
        rx + inX, ry + 0.34, rz + inZ,
        rx + inX, ry + 0.72, rz + inZ,
        rx - inX, ry + 0.72, rz - inZ,
        rx - inX, ry + 0.34, rz - inZ,
      );
      if (k < len - 1) {
        const a = baseV + k * 4;
        const b = baseV + (k + 1) * 4;
        // front, top, back faces
        railIdx.push(a, a + 1, b, a + 1, b + 1, b);
        railIdx.push(a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
        railIdx.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);
      }

      if (k % 3 === 0) {
        const q = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(s.right, upVec, s.tangent),
        );
        postMatrices.push(
          new THREE.Matrix4().compose(new THREE.Vector3(rx, ry + 0.40, rz), q, new THREE.Vector3(1, 1, 1)),
        );
        if (k % 6 === 0) {
          refMatrices.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(rx + inX * 1.4, ry + 0.68, rz + inZ * 1.4),
              q,
              new THREE.Vector3(1, 1, 1),
            ),
          );
        }
      }
    }
  }

  if (railVerts.length > 0) {
    const rGeo = trackGeo(new THREE.BufferGeometry());
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(railVerts, 3));
    rGeo.setIndex(railIdx);
    rGeo.computeVertexNormals();
    const rMesh = new THREE.Mesh(rGeo, railMat);
    rMesh.castShadow = true;
    rMesh.receiveShadow = true;
    group.add(rMesh);
  }
  if (postMatrices.length > 0) {
    const postGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.92, 0.11));
    const posts = new THREE.InstancedMesh(postGeo, railMat, postMatrices.length);
    postMatrices.forEach((m, idx) => posts.setMatrixAt(idx, m));
    posts.instanceMatrix.needsUpdate = true;
    group.add(posts);
  }
  if (refMatrices.length > 0) {
    const refGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.11, 0.14));
    const refs = new THREE.InstancedMesh(refGeo, reflectorMat, refMatrices.length);
    refMatrices.forEach((m, idx) => refs.setMatrixAt(idx, m));
    refs.instanceMatrix.needsUpdate = true;
    group.add(refs);
  }

  return {
    group,
    setWireframe: (wire: boolean) => {
      asphaltMat.wireframe = wire;
      shoulderMat.wireframe = wire;
      gutterMat.wireframe = wire;
      railMat.wireframe = wire;
    },
    setNightFactor: (nightFactor: number) => {
      reflectorMat.emissiveIntensity = 0.25 + nightFactor * 2.85;
    },
    setRubberLevel: (level: number) => {
      uRubberLevel.value = clamp(level, 0, 1);
    },
    setAsphaltWear: (wear: number) => {
      uAsphaltWear.value = clamp(wear, 0, 1);
    },
    updateVisibilityWindow: (focusPos, radiusM, camPos, camFwd) => {
      chunkedRoad.updateVisibilityWindow(focusPos, radiusM, camPos, camFwd);
    },
    dispose: () => {
      chunkedRoad.dispose();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
      for (const t of disposableTex) t.dispose();
    },
  };
}

export function buildTougeLandmarksRig(
  _textures: ProceduralTextureSuite,
  _weatherUniforms?: WeatherUniforms,
): LandmarksAndCampusRig {
  const group = new THREE.Group();
  group.name = 'TougeLandmarksRig';
  const circuit = getCircuitData();
  const samples = circuit.samples;
  const meta = MAP_REGISTRY[circuit.mapId];

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const disposableTex: THREE.Texture[] = [];

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.78,
  });
  const signPostMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.5,
    metalness: 0.65,
  });
  const sodiumBulbMat = new THREE.MeshStandardMaterial({
    color: 0xffcf87,
    emissive: 0xffa73b,
    emissiveIntensity: 0.25,
    roughness: 0.2,
  });
  disposableMats.push(steelMat, signPostMat, sodiumBulbMat);

  const makeBannerTexture = (title: string, sub: string, accent: string) => {
    const cv = document.createElement('canvas');
    cv.width = 1024;
    cv.height = 192;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 1024, 192);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 1024, 18);
    ctx.fillRect(0, 174, 1024, 18);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 58px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, 512, 92);
    ctx.fillStyle = accent;
    ctx.font = 'bold 30px monospace';
    ctx.fillText(sub, 512, 145);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    disposableTex.push(tex);
    return tex;
  };

  // Start & Finish Touge Gantry Arches
  const buildGate = (sampleIdx: number, title: string, sub: string) => {
    const s = samples[clamp(sampleIdx, 0, samples.length - 1)];
    const g = new THREE.Group();
    const span = circuit.roadWidth + 4.4;
    const legGeo = new THREE.CylinderGeometry(0.24, 0.28, 7.6, 8);
    const beamGeo = new THREE.BoxGeometry(span + 0.8, 0.55, 0.55);
    const boardGeo = new THREE.PlaneGeometry(span - 0.8, 1.85);
    disposableGeos.push(legGeo, beamGeo, boardGeo);

    const tex = makeBannerTexture(title, sub, meta.accentHex);
    const boardMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: 0xffffff,
      emissiveIntensity: 0.35,
      roughness: 0.45,
    });
    disposableMats.push(boardMat);

    const lLeg = new THREE.Mesh(legGeo, steelMat);
    lLeg.position.set(-span * 0.5, 3.8, 0);
    const rLeg = new THREE.Mesh(legGeo, steelMat);
    rLeg.position.set(span * 0.5, 3.8, 0);
    const beam = new THREE.Mesh(beamGeo, steelMat);
    beam.position.set(0, 7.45, 0);
    const boardF = new THREE.Mesh(boardGeo, boardMat);
    boardF.position.set(0, 6.45, 0.32);
    const boardB = new THREE.Mesh(boardGeo, boardMat);
    boardB.position.set(0, 6.45, -0.32);
    boardB.rotation.y = Math.PI;
    g.add(lLeg, rLeg, beam, boardF, boardB);

    const q = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(s.right, new THREE.Vector3(0, 1, 0), s.tangent.clone().negate()),
    );
    g.position.copy(s.position);
    g.quaternion.copy(q);
    group.add(g);
  };

  buildGate(circuit.startFinishIndex, meta.shortName.toUpperCase(), 'START GATE // GUNMA TOUGE');
  buildGate(samples.length - 12, 'FINISH LINE', `${meta.shortName.toUpperCase()} SECTOR END`);

  // Hairpin Warning Chevron Signs & Sparse Sodium Hairpin Lamps
  const chevCanvas = document.createElement('canvas');
  chevCanvas.width = 128;
  chevCanvas.height = 128;
  const cCtx = chevCanvas.getContext('2d')!;
  cCtx.fillStyle = '#0f172a';
  cCtx.fillRect(0, 0, 128, 128);
  cCtx.strokeStyle = '#f59e0b';
  cCtx.lineWidth = 18;
  cCtx.beginPath();
  cCtx.moveTo(42, 24);
  cCtx.lineTo(86, 64);
  cCtx.lineTo(42, 104);
  cCtx.stroke();
  const chevTex = new THREE.CanvasTexture(chevCanvas);
  chevTex.colorSpace = THREE.SRGBColorSpace;
  disposableTex.push(chevTex);
  const chevMat = new THREE.MeshStandardMaterial({
    map: chevTex,
    emissiveMap: chevTex,
    emissive: 0xffb347,
    emissiveIntensity: 0.35,
    roughness: 0.4,
  });
  disposableMats.push(chevMat);

  const chevSignGeo = new THREE.BoxGeometry(1.1, 1.1, 0.08);
  const chevPoleGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6);
  const lampPoleGeo = new THREE.CylinderGeometry(0.08, 0.11, 6.2, 6);
  const lampArmGeo = new THREE.BoxGeometry(1.6, 0.09, 0.09);
  const lampHeadGeo = new THREE.BoxGeometry(0.45, 0.12, 0.24);
  disposableGeos.push(chevSignGeo, chevPoleGeo, lampPoleGeo, lampArmGeo, lampHeadGeo);

  const hairpinPointLights: THREE.PointLight[] = [];
  let lastLampIdx = -60;
  for (let i = 30; i < samples.length - 30; i += 9) {
    const s = samples[i];
    const absC = Math.abs(s.curvature);
    if (absC > 0.0082) {
      const outSide = s.curvature >= 0 ? 1 : -1;
      const lat = outSide * (circuit.roadHalfWidth + 2.3);
      const q = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(s.right, new THREE.Vector3(0, 1, 0), s.tangent.clone().negate()),
      );
      const px = s.position.x + s.right.x * lat;
      const py = s.position.y + s.right.y * lat;
      const pz = s.position.z + s.right.z * lat;

      const pole = new THREE.Mesh(chevPoleGeo, signPostMat);
      pole.position.set(px, py + 1.1, pz);
      group.add(pole);

      const sign = new THREE.Mesh(chevSignGeo, chevMat);
      sign.position.set(px, py + 1.9, pz);
      sign.quaternion.copy(q);
      if (outSide < 0) sign.rotateY(Math.PI);
      group.add(sign);

      // Sparse hairpin sodium lamp (~1 per hairpin cluster, leaves forest runs dark!)
      if (i - lastLampIdx > 95 && hairpinPointLights.length < 7) {
        lastLampIdx = i;
        const lPole = new THREE.Mesh(lampPoleGeo, signPostMat);
        lPole.position.set(px, py + 3.1, pz);
        group.add(lPole);
        const lArm = new THREE.Mesh(lampArmGeo, signPostMat);
        lArm.position.set(px - s.right.x * outSide * 0.7, py + 6.1, pz - s.right.z * outSide * 0.7);
        lArm.quaternion.copy(q);
        group.add(lArm);
        const lHead = new THREE.Mesh(lampHeadGeo, sodiumBulbMat);
        lHead.position.set(px - s.right.x * outSide * 1.4, py + 6.0, pz - s.right.z * outSide * 1.4);
        lHead.quaternion.copy(q);
        group.add(lHead);

        const pl = new THREE.PointLight(0xffb45a, 0, 26, 1.4);
        pl.position.set(px - s.right.x * outSide * 1.4, py + 5.7, pz - s.right.z * outSide * 1.4);
        pl.visible = false;
        group.add(pl);
        hairpinPointLights.push(pl);
      }
    }
  }

  return {
    group,
    update: () => {},
    setNightFactor: (nightFactor: number) => {
      sodiumBulbMat.emissiveIntensity = 0.25 + nightFactor * 3.2;
      chevMat.emissiveIntensity = 0.25 + nightFactor * 1.25;
      const on = nightFactor > 0.2;
      for (let i = 0; i < hairpinPointLights.length; i++) {
        hairpinPointLights[i].intensity = on ? nightFactor * 7.5 : 0;
        hairpinPointLights[i].visible = on;
      }
    },
    setWireframe: (wire: boolean) => {
      steelMat.wireframe = wire;
      signPostMat.wireframe = wire;
    },
    getGrandstandWorldPos: () => samples[circuit.startFinishIndex].position.clone(),
    dispose: () => {
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
      for (const t of disposableTex) t.dispose();
    },
  };
}

export function buildTougePropsAndFoliageRig(
  _textures: ProceduralTextureSuite,
  _weatherUniforms?: WeatherUniforms,
): PropsAndFoliageRig {
  const group = new THREE.Group();
  group.name = 'TougePropsAndFoliageRig';

  const circuit = getCircuitData();
  const qScratch = createCircuitQueryScratch(circuit.samples[0]);
  const rand = createSeededRandom(circuit.mapId === 'akina_pass' ? 8601 : circuit.mapId === 'akagi_pass' ? 8602 : 8603);

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.38, 4.2, 6);
  trunkGeo.translate(0, 2.1, 0);
  const foliageGeo = new THREE.ConeGeometry(2.5, 9.5, 7);
  foliageGeo.translate(0, 7.6, 0);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.94 });
  const foliageMat = new THREE.MeshStandardMaterial({
    color: circuit.mapId === 'myogi_pass' ? 0x172b1c : 0x1c3422,
    roughness: 0.88,
  });

  const maxTrees = 950;
  const trunkMatrices: THREE.Matrix4[] = [];
  const treePositions: Array<{ x: number; z: number; scale: number }> = [];
  const dummy = new THREE.Object3D();

  for (let attempt = 0; attempt < 4200 && trunkMatrices.length < maxTrees; attempt++) {
    const wx = (rand() - 0.5) * 1950;
    const wz = (rand() - 0.5) * 1950;
    const q = circuit.queryNearestGroundTrackInto(wx, wz, qScratch);
    if (q.absDistance < circuit.roadHalfWidth + SHOULDER_WIDTH + 6.5 || q.absDistance > 165) {
      continue;
    }
    const gy = groundHeightAt(wx, wz);
    const scale = 0.78 + rand() * 0.72;
    dummy.position.set(wx, gy - 0.25, wz);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale * (0.9 + rand() * 0.35), scale);
    dummy.updateMatrix();
    trunkMatrices.push(dummy.matrix.clone());
    treePositions.push({ x: wx, z: wz, scale });
  }

  const trunksMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trunkMatrices.length);
  const foliageMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, trunkMatrices.length);
  foliageMesh.castShadow = true;
  foliageMesh.receiveShadow = true;
  for (let i = 0; i < trunkMatrices.length; i++) {
    trunksMesh.setMatrixAt(i, trunkMatrices[i]);
    foliageMesh.setMatrixAt(i, trunkMatrices[i]);
  }
  trunksMesh.instanceMatrix.needsUpdate = true;
  foliageMesh.instanceMatrix.needsUpdate = true;
  group.add(trunksMesh, foliageMesh);

  // Also add light roadside collision trunks only for closest corridor trees? No — guardrails keep cars off slopes safely.
  void treePositions;
  let activeQuality: PropsQualityTier = 'balanced';
  let activeDensity = 1.0;

  const updateDrawCount = () => {
    const qScale = activeQuality === 'performance' ? 0.55 : activeQuality === 'balanced' ? 0.82 : 1.0;
    const count = clamp(Math.round(trunkMatrices.length * qScale * activeDensity), 0, trunkMatrices.length);
    trunksMesh.count = count;
    foliageMesh.count = count;
  };
  updateDrawCount();

  return {
    group,
    setNightFactor: () => {},
    updateVisibilityWindow: () => {},
    setGraphicsQuality: (q) => {
      activeQuality = q;
      updateDrawCount();
    },
    setFoliageDensity: (density) => {
      activeDensity = clamp(density, 0.35, 1.25);
      updateDrawCount();
    },
    dispose: () => {
      trunkGeo.dispose();
      foliageGeo.dispose();
      trunkMat.dispose();
      foliageMat.dispose();
    },
  };
}
