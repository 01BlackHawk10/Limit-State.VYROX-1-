import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getCircuitData, ROAD_HALF_WIDTH, SHOULDER_WIDTH } from '../Aurelia Ridge/circuitSpline';
import { KESTREL_WATER_LEVEL } from './kestrelTerrainField';
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
 * Builds Kestrel Peaks Dolomite Mountain Pass asphalt loop (~5.8 km):
 * - High-altitude mountain pass tarmac with wet puddle splashes, rubbered-in apex line & alpine stone shoulders
 * - Emerald & ivory apex curbs + glowing night cat-eye pavement studs
 * - Multi-span Highland Stone-Arch Loch Viaduct with stone parapets, steel handrails & vintage bridge lamps
 * - Ribbed Rock-Cut Alpine Avalanche Gallery along T12–T14 overlooking the western abyss
 * - Profiled double-tier W-beam Armco steel guardrails, galvanized I-posts & reflector tabs
 */
export function buildKestrelRoadAndBridgeRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
): RoadAndBridgeRig {
  const group = new THREE.Group();
  group.name = 'KestrelRoadAndBridgeRig';

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
  const disposableTex: THREE.Texture[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    disposableTex.push(t);
    return t;
  };

  // 1. CONTINUOUS CROWN-CAMBERED TARMAC & ALPINE STONE SHOULDERS
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
    const lifts = [-0.045, 0.015, 0.015, 0.055, 0.015, 0.015, -0.045];
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

    if (i < N - 1 || circuit.closedLoop) {
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
      normalScale: new THREE.Vector2(1.08, 1.08),
      roughnessMap: textures.asphaltRoughness,
      roughness: 0.92,
      metalness: 0.06,
      envMapIntensity: 1.25,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  patchWeatheredAsphaltMaterial(asphaltMat, {
    cacheKey: 'kestrel-mountain-asphalt-v5-gt7',
    sharedWeather,
    uRubberLevel,
    uAsphaltWear,
    asphaltORM: textures.asphaltORM,
    highwayStripeStyle: 'dashed_yellow',
    sparkleStrength: 0.78,
    edgeDustRgb: [0.32, 0.34, 0.30],
    camberContrast: 0.09,
  });

  const shoulderMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.gravelAlbedo,
      color: 0x626b73,
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
    cellSizeM: 115,
    castShadow: false,
    receiveShadow: true,
    name: 'KestrelRoadChunks',
  });
  chunkedUpdaters.push(roadChunked);
  group.add(roadChunked.group);

  // 1B. HIGH-RESOLUTION ROADSIDE CUTBANK, DRAINAGE SWALE & LIMESTONE TALUS SKIRT
  // Bridges the ~8.4m heightmap grid smoothly onto the exact tarmac shoulder at ~4m spline fidelity.
  {
    const skirtMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: textures.terrainRockAlbedo,
        normalMap: textures.terrainRockNormal,
        normalScale: new THREE.Vector2(1.25, 1.25),
        roughnessMap: textures.terrainRockRoughness,
        roughness: 0.90,
        metalness: 0.03,
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    );
    skirtMat.onBeforeCompile = (shader) => {
      shader.uniforms.uWetness = sharedWeather.uWetness;
      shader.uniforms.uGravelMap = { value: textures.gravelAlbedo };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vSkirtWorldPos;
          varying vec3 vSkirtWorldNormal;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vSkirtWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vSkirtWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uWetness;
          uniform sampler2D uGravelMap;
          varying vec3 vSkirtWorldPos;
          varying vec3 vSkirtWorldNormal;`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float strata = 0.84 + 0.24 * sin(vSkirtWorldPos.y * 1.65 + vSkirtWorldPos.x * 0.04);
          vec3 vergeGravel = texture2D(uGravelMap, vSkirtWorldPos.xz * 0.24).rgb * vec3(0.88, 0.91, 0.96);
          float flatVerge = smoothstep(0.55, 0.92, max(0.0, vSkirtWorldNormal.y));
          diffuseColor.rgb = mix(diffuseColor.rgb * strata, vergeGravel, flatVerge * 0.52);
          diffuseColor.rgb *= mix(1.0, 0.66, uWetness * 0.65);`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.24, clamp(uWetness * 0.8, 0.0, 0.82));`,
        );
    };
    skirtMat.customProgramCacheKey = () => 'kestrel-roadside-cutbank-skirt-v1';

    const skirtParts: THREE.BufferGeometry[] = [];
    const latCols = [0.0, 1.35, 3.6, 7.6, 13.5]; // relative outward from halfTot
    const kCols = latCols.length;
    const cGravel = new THREE.Color(0x6b727a);
    const cTalus = new THREE.Color(0x88919c);
    const cDarkSlate = new THREE.Color(0x4b545e);
    const cMossEdge = new THREE.Color(0x3a5b34);
    const cTmp = new THREE.Color();

    for (const side of [-1, 1] as const) {
      let segStart = -1;
      for (let i = 0; i <= N; i++) {
        const s = i < N ? samples[i] : null;
        const inPitSide =
          s !== null &&
          side === -1 &&
          s.isStraight &&
          isPointInPitBounds(circuit.pitLaneBounds, s.position.x, s.position.y, s.position.z, 16, 28);
        const wantSkirt = s !== null && !s.isBridge && !s.isTunnel && !inPitSide;
        if (wantSkirt && segStart < 0) {
          segStart = i;
        } else if (!wantSkirt && segStart >= 0) {
          const segEnd = i - 1;
          const len = segEnd - segStart + 1;
          if (len >= 3) {
            const pArr = new Float32Array(len * kCols * 3);
            const uArr = new Float32Array(len * kCols * 2);
            const colArr = new Float32Array(len * kCols * 3);
            const idxArr: number[] = [];

            for (let k = 0; k < len; k++) {
              const ss = samples[segStart + k];
              const edgeY = ss.position.y + ss.right.y * side * halfTot - 0.06;
              const farX = ss.position.x + ss.right.x * side * (halfTot + 13.5);
              const farZ = ss.position.z + ss.right.z * side * (halfTot + 13.5);
              const farGroundY = groundHeightAt(farX, farZ);
              const isCutbank = farGroundY > edgeY + 0.85;
              const isHighSlope = ss.position.y > 160;

              for (let j = 0; j < kCols; j++) {
                const lat = side * (halfTot + 0.02 + latCols[j]);
                const px = ss.position.x + ss.right.x * lat;
                const pz = ss.position.z + ss.right.z * lat;
                const gy = groundHeightAt(px, pz);

                let py: number;
                if (j === 0) {
                  py = edgeY;
                } else if (j === 1) {
                  // Crisp roadside drainage swale / berm
                  py = isCutbank ? edgeY - 0.24 : edgeY - 0.18;
                } else if (j === 2) {
                  const rawMid = gy - 0.08;
                  py = isCutbank
                    ? Math.max(edgeY + 0.65, rawMid)
                    : Math.min(edgeY - 0.45, rawMid);
                } else if (j === 3) {
                  py = isCutbank ? Math.max(edgeY + 1.2, gy - 0.06) : gy - 0.18;
                } else {
                  // Outer lip dips gently beneath coarse terrain tile to eliminate seams
                  py = gy - 0.58;
                }

                const vi = k * kCols + j;
                pArr[vi * 3] = px;
                pArr[vi * 3 + 1] = py;
                pArr[vi * 3 + 2] = pz;
                uArr[vi * 2] = latCols[j] * 0.22;
                uArr[vi * 2 + 1] = ss.arcLength * 0.18;

                if (j <= 1) {
                  cTmp.copy(cGravel);
                } else if (isCutbank) {
                  cTmp.copy(cDarkSlate).lerp(cTalus, j === 2 ? 0.38 : 0.68);
                } else if (isHighSlope || j === 2) {
                  cTmp.copy(cTalus).lerp(cDarkSlate, 0.28);
                } else {
                  cTmp.copy(cTalus).lerp(cMossEdge, 0.58);
                }
                colArr[vi * 3] = cTmp.r;
                colArr[vi * 3 + 1] = cTmp.g;
                colArr[vi * 3 + 2] = cTmp.b;
              }

              if (k < len - 1) {
                for (let j = 0; j < kCols - 1; j++) {
                  const a = k * kCols + j;
                  const b = a + 1;
                  const d = (k + 1) * kCols + j;
                  const e = d + 1;
                  if (side > 0) {
                    idxArr.push(a, b, d, b, e, d);
                  } else {
                    idxArr.push(a, d, b, b, d, e);
                  }
                }
              }
            }

            const sGeo = new THREE.BufferGeometry();
            sGeo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
            sGeo.setAttribute('uv', new THREE.BufferAttribute(uArr, 2));
            sGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
            sGeo.setIndex(idxArr);
            sGeo.computeVertexNormals();
            skirtParts.push(sGeo);
          }
          segStart = -1;
        }
      }
    }

    if (skirtParts.length > 0) {
      const mergedSkirt = trackGeo(BufferGeometryUtils.mergeGeometries(skirtParts, false));
      skirtParts.forEach((g) => g.dispose());
      const skirtChunked = buildSpatialChunkedRoadMesh(mergedSkirt, skirtMat, {
        cellSizeM: 115,
        castShadow: false,
        receiveShadow: true,
        name: 'KestrelSkirtChunks',
      });
      chunkedUpdaters.push(skirtChunked);
      group.add(skirtChunked.group);
    }
  }

  // 2. SEGMENTED 3D BEVELED EMERALD & IVORY FIA CURBS
  const builtCurbs = buildSegmented3DFiaCurbs({
    samples,
    closedLoop: circuit.closedLoop,
    halfAsp,
    totalLength: circuit.totalLength,
    kerbHeightScale: circuit.kerbHeightScale,
    colorAHex: 0x10b981,
    colorBHex: 0xf8fafc,
    pitLaneBounds: circuit.pitLaneBounds,
    normalMap: textures.curbNormal,
    trackGeo,
    trackMat,
  });
  const curbMat = builtCurbs.material;
  if (builtCurbs.mesh) {
    const curbChunked = buildSpatialChunkedRoadMesh(builtCurbs.mesh.geometry, curbMat!, {
      cellSizeM: 115,
      castShadow: false,
      receiveShadow: true,
      name: 'KestrelCurbChunks',
      disposeSource: false,
    });
    chunkedUpdaters.push(curbChunked);
    group.add(curbChunked.group);
  }

  // 3. SCOTTISH HIGHLAND STONE-ARCH LOCH VIADUCT BRIDGE WITH PARAPETS & HANDRAILS
  const stoneMasonryMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.terrainRockNormal,
      color: 0x8a9097,
      roughness: 0.86,
      metalness: 0.04,
    }),
  );
  const ironLampMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x222930,
      roughness: 0.36,
      metalness: 0.84,
    }),
  );
  const viaductLampGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0xffb347,
      emissiveIntensity: 0.45,
      roughness: 0.2,
    }),
  );

  const extractContiguousRuns = (pred: (s: (typeof samples)[number]) => boolean): number[][] => {
    const runs: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < N; i++) {
      if (pred(samples[i])) {
        cur.push(i);
      } else if (cur.length > 0) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length > 0) {
      if (circuit.closedLoop && runs.length > 0 && runs[0][0] === 0) {
        runs[0] = [...cur, ...runs[0]];
      } else {
        runs.push(cur);
      }
    }
    return runs;
  };

  const hasNonAdjacentRoadNear = (wx: number, wz: number, originIdx: number, minGapIdx: number, minDist: number) => {
    const minDistSq = minDist * minDist;
    for (let j = 0; j < N; j += 2) {
      const idxDiff = Math.abs(j - originIdx);
      const wrapDiff = circuit.closedLoop ? Math.min(idxDiff, N - idxDiff) : idxDiff;
      if (wrapDiff <= minGapIdx) continue;
      const o = samples[j];
      const dx = wx - o.position.x;
      const dz = wz - o.position.z;
      if (dx * dx + dz * dz < minDistSq) return true;
    }
    return false;
  };

  worldColliders.initSplineBarriers(N);

  const bridgeLights: THREE.PointLight[] = [];
  const stoneParts: THREE.BufferGeometry[] = [];
  const viaductPostMats: THREE.Matrix4[] = [];
  const viaductBulbMats: THREE.Matrix4[] = [];
  const mat4 = new THREE.Matrix4();
  const qTmp = new THREE.Quaternion();

  const bridgeRuns = extractContiguousRuns((s) => s.isBridge);
  for (const orderedBridge of bridgeRuns) {
    if (orderedBridge.length <= 4) continue;
    const bLen = orderedBridge.length;
    const deckHalfW = halfTot + 1.05;
    const parapetH = 1.15;

    // Extruded stone parapet walls + deck soffit profile
    const deckCols = 11;
    const deckPos = new Float32Array(bLen * deckCols * 3);
    const deckUv = new Float32Array(bLen * deckCols * 2);
    const deckIdx: number[] = [];
    const pts2D: Array<[number, number]> = [
      [-deckHalfW, parapetH],
      [-deckHalfW + 0.68, parapetH],
      [-deckHalfW + 0.74, -0.16],
      [deckHalfW - 0.74, -0.16],
      [deckHalfW - 0.68, parapetH],
      [deckHalfW, parapetH],
      [deckHalfW + 0.35, -0.65],
      [deckHalfW - 2.1, -2.6],
      [-deckHalfW + 2.1, -2.6],
      [-deckHalfW - 0.35, -0.65],
      [-deckHalfW, parapetH],
    ];

    for (let k = 0; k < bLen; k++) {
      const sIdx = orderedBridge[k];
      worldColliders.setSplineBarrier(sIdx, -1, deckHalfW - 0.72, 'concrete');
      worldColliders.setSplineBarrier(sIdx, 1, deckHalfW - 0.72, 'concrete');
      const s = samples[sIdx];
      const v = (k * (circuit.totalLength / N)) / 8.0;
      for (let j = 0; j < deckCols; j++) {
        const [lx, ly] = pts2D[j];
        const vi = k * deckCols + j;
        deckPos[vi * 3] = s.position.x + s.right.x * lx + s.up.x * ly;
        deckPos[vi * 3 + 1] = s.position.y + s.right.y * lx + s.up.y * ly;
        deckPos[vi * 3 + 2] = s.position.z + s.right.z * lx + s.up.z * ly;
        deckUv[vi * 2] = j / (deckCols - 1);
        deckUv[vi * 2 + 1] = v;
      }
      if (k < bLen - 1) {
        for (let j = 0; j < deckCols - 1; j++) {
          const a = k * deckCols + j;
          const b = a + 1;
          const d = (k + 1) * deckCols + j;
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
    const deckMesh = new THREE.Mesh(deckGeo, stoneMasonryMat);
    deckMesh.castShadow = true;
    deckMesh.receiveShadow = true;
    group.add(deckMesh);

    // Tall masonry viaduct piers every 18 samples (never dropping piers into non-adjacent roads/tunnels!)
    for (let idx = 0; idx < bLen; idx += 18) {
      const sIdx = orderedBridge[idx];
      const s = samples[sIdx];
      qTmp.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent.clone().setY(0).normalize());

      const blocksLowerRoad = hasNonAdjacentRoadNear(
        s.position.x,
        s.position.z,
        sIdx,
        24,
        halfTot + 12.5,
      );
      if (!blocksLowerRoad) {
        const rawGroundY = groundHeightAt(s.position.x, s.position.z);
        const gh =
          rawGroundY < KESTREL_WATER_LEVEL + 1.5 ? KESTREL_WATER_LEVEL - 4 : rawGroundY - 2.5;
        const pierTopY = s.position.y - 0.85;
        const pierH = pierTopY - gh;
        if (pierH > 0.8) {
          const pier = new THREE.BoxGeometry(halfTot * 1.72, pierH, 5.4);
          mat4.compose(
            new THREE.Vector3(s.position.x, gh + pierH * 0.5, s.position.z),
            qTmp,
            new THREE.Vector3(1, 1, 1),
          );
          pier.applyMatrix4(mat4);
          stoneParts.push(pier);
        }

        // Arched spandrel buttresses flanking strictly outside the parapet wall
        for (const side of [-1, 1]) {
          const cap = new THREE.BoxGeometry(0.85, 3.6, 6.2);
          mat4.compose(
            new THREE.Vector3(
              s.position.x + s.right.x * side * (deckHalfW - 0.12),
              s.position.y - 1.05,
              s.position.z + s.right.z * side * (deckHalfW - 0.12),
            ),
            qTmp,
            new THREE.Vector3(1, 1, 1),
          );
          cap.applyMatrix4(mat4);
          stoneParts.push(cap);
        }
      }

      // Vintage iron viaduct lamps ONLY on lower Loch Viaduct (skip upper Bridge 2 crossover)
      if (s.position.y < 155) {
        for (const side of [-1, 1]) {
          const lx = s.position.x + s.right.x * side * (deckHalfW - 0.34);
          const lz = s.position.z + s.right.z * side * (deckHalfW - 0.34);
          viaductPostMats.push(
            new THREE.Matrix4().makeTranslation(lx, s.position.y + parapetH + 2.1, lz),
          );
          viaductBulbMats.push(
            new THREE.Matrix4().makeTranslation(lx, s.position.y + parapetH + 4.4, lz),
          );
        }
      }

      if (bridgeLights.length < 4 && idx > 12 && idx < bLen - 12) {
        const pl = new THREE.PointLight(0xffcf88, 0, 72, 1.45);
        pl.position.set(s.position.x, s.position.y + 5.8, s.position.z);
        pl.visible = false;
        group.add(pl);
        bridgeLights.push(pl);
      }
    }
  }

  if (viaductPostMats.length > 0) {
    const postInst = new THREE.InstancedMesh(
      trackGeo(new THREE.CylinderGeometry(0.11, 0.15, 4.4, 8)),
      ironLampMat,
      viaductPostMats.length,
    );
    postInst.castShadow = true;
    const bulbInst = new THREE.InstancedMesh(
      trackGeo(new THREE.SphereGeometry(0.24, 10, 8)),
      viaductLampGlowMat,
      viaductBulbMats.length,
    );
    for (let k = 0; k < viaductPostMats.length; k++) {
      postInst.setMatrixAt(k, viaductPostMats[k]);
      bulbInst.setMatrixAt(k, viaductBulbMats[k]);
    }
    postInst.instanceMatrix.needsUpdate = true;
    bulbInst.instanceMatrix.needsUpdate = true;
    postInst.computeBoundingSphere();
    bulbInst.computeBoundingSphere();
    group.add(postInst, bulbInst);
  }

  if (stoneParts.length > 0) {
    const mergedStone = trackGeo(BufferGeometryUtils.mergeGeometries(stoneParts, false));
    stoneParts.forEach((g) => g.dispose());
    const stoneMesh = new THREE.Mesh(mergedStone, stoneMasonryMat);
    stoneMesh.castShadow = true;
    stoneMesh.receiveShadow = true;
    group.add(stoneMesh);
  }

  // 4. ROCK-CUT ALPINE MOUNTAIN TUNNEL (West Descent T10 -> T11: Continuous Horseshoe Vault + Dolomite Mountain Overburden + Flared Portals)
  const tunnelStripMats: THREE.Matrix4[] = [];
  const tunnelWallReflectMats: THREE.Matrix4[] = [];
  const tunnelConcreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.concreteNormal,
      color: 0x626b75,
      roughness: 0.84,
      metalness: 0.08,
      side: THREE.DoubleSide,
    }),
  );
  const tunnelPortalStoneMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.concreteAlbedo,
      normalMap: textures.terrainRockNormal,
      color: 0x7b838d,
      roughness: 0.86,
      metalness: 0.05,
    }),
  );
  const tunnelRockShellMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: textures.terrainRockAlbedo,
      normalMap: textures.terrainRockNormal,
      normalScale: new THREE.Vector2(1.2, 1.2),
      color: 0x7a838e,
      roughness: 0.92,
      metalness: 0.03,
      side: THREE.DoubleSide,
    }),
  );
  const tunnelBeaconMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffb020,
      emissive: 0xff8800,
      emissiveIntensity: 0.85,
      roughness: 0.2,
      metalness: 0.15,
    }),
  );
  const tunnelWallStripeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.38,
      roughness: 0.35,
    }),
  );

  const tunInnerHalf = halfTot + 0.65;
  const tunOuterHalf = tunInnerHalf + 1.15;
  const tunCrownInner = 6.75;
  const tunCrownOuter = 7.75;

  const findNearestSampleIdx = (tx: number, tz: number) => {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < N; i++) {
      const s = samples[i];
      const d = Math.hypot(s.position.x - tx, s.position.z - tz);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  };

  // Shared Tunnel Portal Clearance Sign Texture
  const tunSignCanvas = document.createElement('canvas');
  tunSignCanvas.width = 512;
  tunSignCanvas.height = 128;
  const tCtx = tunSignCanvas.getContext('2d');
  if (tCtx) {
    tCtx.fillStyle = '#0f172a';
    tCtx.fillRect(0, 0, 512, 128);
    tCtx.strokeStyle = '#f59e0b';
    tCtx.lineWidth = 6;
    tCtx.strokeRect(6, 6, 500, 116);
    tCtx.fillStyle = '#f59e0b';
    tCtx.font = 'bold 28px sans-serif';
    tCtx.textAlign = 'center';
    tCtx.fillText('MT. KESTREL ALPINE TUNNEL', 256, 52);
    tCtx.fillStyle = '#f8fafc';
    tCtx.font = 'bold 24px monospace';
    tCtx.fillText('CLEARANCE 5.2M  //  LIGHTS ON', 256, 94);
  }
  const tunSignTex = trackTex(new THREE.CanvasTexture(tunSignCanvas));
  tunSignTex.colorSpace = THREE.SRGBColorSpace;
  tunSignTex.anisotropy = Math.min(8, textures.gantryBannerAlbedo.anisotropy || 4);
  tunSignTex.needsUpdate = true;
  const tunSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: tunSignTex,
      emissiveMap: tunSignTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.42,
      roughness: 0.35,
    }),
  );
  const portalSignGeo = trackGeo(new THREE.BoxGeometry(8.8, 1.5, 0.22));
  const darkThroatMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x181d24,
      roughness: 0.94,
      metalness: 0.04,
    }),
  );
  const crossoverSignCanvas = document.createElement('canvas');
  crossoverSignCanvas.width = 512;
  crossoverSignCanvas.height = 128;
  const cxCtx = crossoverSignCanvas.getContext('2d');
  if (cxCtx) {
    cxCtx.fillStyle = '#0f172a';
    cxCtx.fillRect(0, 0, 512, 128);
    cxCtx.strokeStyle = '#38bdf8';
    cxCtx.lineWidth = 6;
    cxCtx.strokeRect(6, 6, 500, 116);
    cxCtx.fillStyle = '#38bdf8';
    cxCtx.font = 'bold 26px sans-serif';
    cxCtx.textAlign = 'center';
    cxCtx.fillText('CROSSOVER UNDERPASS // GALLERY 01', 256, 52);
    cxCtx.fillStyle = '#f8fafc';
    cxCtx.font = 'bold 22px monospace';
    cxCtx.fillText('CONCRETE OVERPASS TUNNEL  //  STAY IN LANE', 256, 94);
  }
  const crossoverSignTex = trackTex(new THREE.CanvasTexture(crossoverSignCanvas));
  crossoverSignTex.colorSpace = THREE.SRGBColorSpace;
  crossoverSignTex.anisotropy = Math.min(8, textures.gantryBannerAlbedo.anisotropy || 4);
  crossoverSignTex.needsUpdate = true;
  const crossoverSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: crossoverSignTex,
      emissiveMap: crossoverSignTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.42,
      roughness: 0.35,
    }),
  );

  const portalStoneParts: THREE.BufferGeometry[] = [];
  const portalBeaconParts: THREE.BufferGeometry[] = [];
  const portalDarkLinerParts: THREE.BufferGeometry[] = [];
  const crossoverRibParts: THREE.BufferGeometry[] = [];

  const tunnelRuns = extractContiguousRuns((s) => s.isTunnel);
  for (const tunnelRun of tunnelRuns) {
    const tunSpan = tunnelRun.length;
    if (tunSpan <= 4) continue;

    // Detect whether this tunnel passes beneath another elevated road/bridge crossover
    let isCrossoverTunnel = false;
    for (let k = 0; k < tunSpan && !isCrossoverTunnel; k += 2) {
      const sIdx = tunnelRun[k];
      const s = samples[sIdx];
      for (let oj = 0; oj < N; oj += 3) {
        const idxDiff = Math.abs(oj - sIdx);
        const wrapDiff = circuit.closedLoop ? Math.min(idxDiff, N - idxDiff) : idxDiff;
        if (wrapDiff <= 22) continue;
        const os = samples[oj];
        if (os.position.y > s.position.y + 8.0) {
          const dx = os.position.x - s.position.x;
          const dz = os.position.z - s.position.z;
          if (dx * dx + dz * dz < 48 * 48) {
            isCrossoverTunnel = true;
            break;
          }
        }
      }
    }

    const boxOuterHalf = tunOuterHalf + (isCrossoverTunnel ? 0.65 : 0);
    const boxCrownOuter = tunCrownOuter + (isCrossoverTunnel ? 0.85 : 0);
    const archPts: Array<[number, number]> = isCrossoverTunnel
      ? [
          [-boxOuterHalf, -1.5],
          [-tunInnerHalf, -1.5],
          [-tunInnerHalf, 0.34],
          [-tunInnerHalf + 0.38, 0.34],
          [-tunInnerHalf + 0.38, 0.0],
          [-tunInnerHalf + 0.38, 0.34],
          [-tunInnerHalf, 0.34],
          [-tunInnerHalf, 5.25],
          [-tunInnerHalf * 0.78, 6.45],
          [0, tunCrownInner],
          [tunInnerHalf * 0.78, 6.45],
          [tunInnerHalf, 5.25],
          [tunInnerHalf, 0.34],
          [tunInnerHalf, -1.5],
          [boxOuterHalf, -1.5],
          [boxOuterHalf, 6.55],
          [boxOuterHalf * 0.72, boxCrownOuter],
          [-boxOuterHalf * 0.72, boxCrownOuter],
          [-boxOuterHalf, 6.55],
          [-boxOuterHalf, -1.5],
        ]
      : [
          [-tunOuterHalf, -1.5],
          [-tunInnerHalf, -1.5],
          [-tunInnerHalf, 0.34],
          [-tunInnerHalf + 0.38, 0.34],
          [-tunInnerHalf + 0.38, 0.0],
          [-tunInnerHalf + 0.38, 0.34],
          [-tunInnerHalf, 0.34],
          [-tunInnerHalf, 3.85],
          [-tunInnerHalf * 0.84, 5.42],
          [-tunInnerHalf * 0.48, 6.40],
          [0, tunCrownInner],
          [tunInnerHalf * 0.48, 6.40],
          [tunInnerHalf * 0.84, 5.42],
          [tunInnerHalf, 3.85],
          [tunInnerHalf, 0.34],
          [tunInnerHalf, -1.5],
          [tunOuterHalf, -1.5],
          [tunOuterHalf, 4.15],
          [tunOuterHalf * 0.85, 6.05],
          [tunOuterHalf * 0.48, 7.25],
          [0, tunCrownOuter],
          [-tunOuterHalf * 0.48, 7.25],
          [-tunOuterHalf * 0.85, 6.05],
          [-tunOuterHalf, 4.15],
          [-tunOuterHalf, -1.5],
        ];
    const aCols = archPts.length;
    const tPos = new Float32Array(tunSpan * aCols * 3);
    const tUv = new Float32Array(tunSpan * aCols * 2);
    const tIdx: number[] = [];

    for (let k = 0; k < tunSpan; k++) {
      const sIdx = tunnelRun[k];
      const s = samples[sIdx];
      worldColliders.setSplineBarrier(sIdx, -1, tunInnerHalf - 0.38, 'concrete');
      worldColliders.setSplineBarrier(sIdx, 1, tunInnerHalf - 0.38, 'concrete');
      const vCoord = (k * (circuit.totalLength / N)) / 6.0;
      for (let j = 0; j < aCols; j++) {
        const [lx, ly] = archPts[j];
        const vi = k * aCols + j;
        tPos[vi * 3] = s.position.x + s.right.x * lx + s.up.x * ly;
        tPos[vi * 3 + 1] = s.position.y + s.right.y * lx + s.up.y * ly;
        tPos[vi * 3 + 2] = s.position.z + s.right.z * lx + s.up.z * ly;
        tUv[vi * 2] = (j / (aCols - 1)) * 4.0;
        tUv[vi * 2 + 1] = vCoord;
      }
      if (k < tunSpan - 1) {
        for (let j = 0; j < aCols - 1; j++) {
          const a = k * aCols + j;
          const b = a + 1;
          const d = (k + 1) * aCols + j;
          const e = d + 1;
          tIdx.push(a, d, b, b, d, e);
        }
      }

      if (isCrossoverTunnel && k % 4 === 0 && k > 0 && k < tunSpan - 1) {
        qTmp.setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
        );
        for (const side of [-1, 1] as const) {
          const rib = new THREE.BoxGeometry(0.95, boxCrownOuter + 1.2, 1.15);
          mat4.compose(
            s.position
              .clone()
              .addScaledVector(s.right, side * (boxOuterHalf + 0.35))
              .addScaledVector(s.up, (boxCrownOuter - 1.2) * 0.5),
            qTmp,
            new THREE.Vector3(1, 1, 1),
          );
          rib.applyMatrix4(mat4);
          crossoverRibParts.push(rib);
        }
      }

      if (k % 3 === 0) {
        const lq = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(s.right, s.up, s.tangent.clone().negate()),
        );
        tunnelStripMats.push(
          new THREE.Matrix4().compose(
            s.position.clone().addScaledVector(s.up, tunCrownInner - 0.24),
            lq,
            new THREE.Vector3(3.6, 0.20, 1.35),
          ),
        );
        for (const side of [-1, 1] as const) {
          tunnelWallReflectMats.push(
            new THREE.Matrix4().compose(
              s.position
                .clone()
                .addScaledVector(s.right, side * (tunInnerHalf - 0.08))
                .addScaledVector(s.up, 1.15),
              lq,
              new THREE.Vector3(0.08, 0.14, 1.1),
            ),
          );
        }
        if (k % 24 === 9 && bridgeLights.length < 10) {
          const tl = new THREE.PointLight(0xffb85c, 0, 68, 1.4);
          tl.position.set(s.position.x, s.position.y + 5.6, s.position.z);
          tl.visible = false;
          group.add(tl);
          bridgeLights.push(tl);
        }
      }
    }

    const tunnelVaultGeo = trackGeo(new THREE.BufferGeometry());
    tunnelVaultGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
    tunnelVaultGeo.setAttribute('uv', new THREE.BufferAttribute(tUv, 2));
    tunnelVaultGeo.setIndex(tIdx);
    tunnelVaultGeo.computeVertexNormals();
    const tunnelMesh = new THREE.Mesh(tunnelVaultGeo, tunnelConcreteMat);
    tunnelMesh.castShadow = true;
    tunnelMesh.receiveShadow = true;
    group.add(tunnelMesh);

    // Sculpted 3D Dolomite Mountain Rock Overburden Shell ONLY for mountain-cut tunnels (never crossover box tunnel)
    if (!isCrossoverTunnel && tunSpan > 10) {
      const rockStartK = 3;
      const rockEndK = tunSpan - 4;
      const rockSpan = rockEndK - rockStartK + 1;
      const rockProf: Array<[number, number]> = [
        [-tunOuterHalf - 22.0, -20.0],
        [-tunOuterHalf - 11.5, -2.0],
        [-tunOuterHalf - 4.2, 8.6],
        [-tunOuterHalf * 0.64, 13.8],
        [0, 19.5],
        [tunOuterHalf * 0.64, 14.0],
        [tunOuterHalf + 4.2, 8.6],
        [tunOuterHalf + 11.5, -2.5],
        [tunOuterHalf + 22.0, -20.0],
      ];
      const rCols = rockProf.length;
      const rPos = new Float32Array(rockSpan * rCols * 3);
      const rUv = new Float32Array(rockSpan * rCols * 2);
      const rIdx: number[] = [];

      for (let k = 0; k < rockSpan; k++) {
        const sIdx = tunnelRun[rockStartK + k];
        const s = samples[sIdx];
        let maxOverburdenLift = 26.0;
        for (let oj = 0; oj < N; oj += 3) {
          const idxDiff = Math.abs(oj - sIdx);
          const wrapDiff = circuit.closedLoop ? Math.min(idxDiff, N - idxDiff) : idxDiff;
          if (wrapDiff <= 22) continue;
          const os = samples[oj];
          if (os.position.y > s.position.y + 4.0) {
            const dx = os.position.x - s.position.x;
            const dz = os.position.z - s.position.z;
            if (dx * dx + dz * dz < 36 * 36) {
              maxOverburdenLift = Math.min(maxOverburdenLift, os.position.y - s.position.y - 4.0);
            }
          }
        }
        const endTaper = Math.min(1.0, Math.min(k, rockSpan - 1 - k) / 5.0);
        const isCapEnd = k === 0 || k === rockSpan - 1;
        const ridgeScale = isCapEnd ? 0.0 : 0.45 + 0.55 * endTaper;
        for (let j = 0; j < rCols; j++) {
          const [bx, by] = rockProf[j];
          const jagX = !isCapEnd && j > 0 && j < rCols - 1 ? Math.sin(k * 0.72 + j * 1.9) * 1.15 * endTaper : 0;
          const jagY =
            !isCapEnd && j >= 2 && j <= 6
              ? Math.max(0, Math.sin(k * 0.55 + j * 2.3) * 2.1 + Math.cos(k * 1.15 - j) * 0.9) * endTaper
              : 0;
          let lx = bx + jagX;
          if (Math.abs(lx) < tunOuterHalf + 0.75 && by <= tunCrownOuter + 0.85) {
            lx = (bx < 0 ? -1 : 1) * (tunOuterHalf + 0.95);
          }
          const rawLy = by > 0 ? Math.max(tunCrownOuter + 0.85, by * ridgeScale + jagY) : by;
          const ly = by > 0 ? Math.min(maxOverburdenLift, rawLy) : by;
          const vi = k * rCols + j;
          rPos[vi * 3] = s.position.x + s.right.x * lx + s.up.x * ly;
          rPos[vi * 3 + 1] = s.position.y + s.right.y * lx + s.up.y * ly;
          rPos[vi * 3 + 2] = s.position.z + s.right.z * lx + s.up.z * ly;
          rUv[vi * 2] = (j / (rCols - 1)) * 5.0;
          rUv[vi * 2 + 1] = k * 0.35;
        }
        if (k < rockSpan - 1) {
          for (let j = 0; j < rCols - 1; j++) {
            const a = k * rCols + j;
            const b = a + 1;
            const d = (k + 1) * rCols + j;
            const e = d + 1;
            rIdx.push(a, d, b, b, d, e);
          }
        }
      }
      const rockShellGeo = trackGeo(new THREE.BufferGeometry());
      rockShellGeo.setAttribute('position', new THREE.BufferAttribute(rPos, 3));
      rockShellGeo.setAttribute('uv', new THREE.BufferAttribute(rUv, 2));
      rockShellGeo.setIndex(rIdx);
      rockShellGeo.computeVertexNormals();
      const rockShellMesh = new THREE.Mesh(rockShellGeo, tunnelRockShellMat);
      rockShellMesh.castShadow = true;
      rockShellMesh.receiveShadow = true;
      group.add(rockShellMesh);
    }

    // Monumental Stone & Concrete Entrance & Exit Portals + Splayed Retaining Wingwalls
    for (const endPair of [
      { idx: tunnelRun[0], outwardDir: -1 },
      { idx: tunnelRun[tunSpan - 1], outwardDir: 1 },
    ] as const) {
      const es = samples[endPair.idx];
      const outTan = es.tangent.clone().multiplyScalar(endPair.outwardDir).setY(0).normalize();
      const outRight = new THREE.Vector3().crossVectors(outTan, new THREE.Vector3(0, 1, 0)).normalize();
      const pq = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(outRight, new THREE.Vector3(0, 1, 0), outTan.clone().negate()),
      );

      for (const side of [-1, 1] as const) {
        const jamb = new THREE.BoxGeometry(2.8, 9.6, 3.6);
        mat4.compose(
          es.position
            .clone()
            .addScaledVector(outRight, side * (boxOuterHalf + 0.72))
            .addScaledVector(es.up, 4.1),
          pq,
          new THREE.Vector3(1, 1, 1),
        );
        jamb.applyMatrix4(mat4);
        portalStoneParts.push(jamb);

        const innerWall = new THREE.BoxGeometry(0.45, 4.6, 3.8);
        mat4.compose(
          es.position
            .clone()
            .addScaledVector(outRight, side * (tunInnerHalf - 0.14))
            .addScaledVector(es.up, 2.3),
          pq,
          new THREE.Vector3(1, 1, 1),
        );
        innerWall.applyMatrix4(mat4);
        portalDarkLinerParts.push(innerWall);

        // Only add long splayed retaining wingwall if clear of nearby adjacent roads
        const wingPos = es.position
          .clone()
          .addScaledVector(outRight, side * (boxOuterHalf + 4.0))
          .addScaledVector(outTan, 5.2);
        if (!hasNonAdjacentRoadNear(wingPos.x, wingPos.z, endPair.idx, 18, halfTot + 6.0)) {
          const wingAngle = side * -0.46;
          const wingQuat = pq
            .clone()
            .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), wingAngle));
          const wing = new THREE.BoxGeometry(1.85, 10.2, 11.4);
          mat4.compose(
            wingPos.clone().addScaledVector(es.up, 2.0),
            wingQuat,
            new THREE.Vector3(1, 1, 1),
          );
          wing.applyMatrix4(mat4);
          portalStoneParts.push(wing);
        }

        const beacon = new THREE.SphereGeometry(0.32, 8, 8);
        mat4.compose(
          es.position
            .clone()
            .addScaledVector(outRight, side * (tunInnerHalf - 1.2))
            .addScaledVector(outTan, 1.95)
            .addScaledVector(es.up, 6.95),
          pq,
          new THREE.Vector3(1, 1, 1),
        );
        beacon.applyMatrix4(mat4);
        portalBeaconParts.push(beacon);
      }

      const headwall = new THREE.BoxGeometry((boxOuterHalf + 2.6) * 2, 4.4, 3.6);
      mat4.compose(es.position.clone().addScaledVector(es.up, tunCrownInner + 2.25), pq, new THREE.Vector3(1, 1, 1));
      headwall.applyMatrix4(mat4);
      portalStoneParts.push(headwall);

      const coping = new THREE.BoxGeometry((boxOuterHalf + 3.0) * 2, 0.68, 4.0);
      mat4.compose(es.position.clone().addScaledVector(es.up, tunCrownInner + 4.65), pq, new THREE.Vector3(1, 1, 1));
      coping.applyMatrix4(mat4);
      portalStoneParts.push(coping);

      const soffitBand = new THREE.BoxGeometry(tunInnerHalf * 2 + 0.4, 0.72, 3.8);
      mat4.compose(es.position.clone().addScaledVector(es.up, tunCrownInner + 0.15), pq, new THREE.Vector3(1, 1, 1));
      soffitBand.applyMatrix4(mat4);
      portalDarkLinerParts.push(soffitBand);

      const signMesh = new THREE.Mesh(
        portalSignGeo,
        isCrossoverTunnel ? crossoverSignMat : tunSignMat,
      );
      signMesh.position
        .copy(es.position)
        .addScaledVector(es.up, tunCrownInner + 1.45)
        .addScaledVector(outTan, 1.92);
      signMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), outTan);
      group.add(signMesh);
    }
  }

  if (crossoverRibParts.length > 0) {
    const mergedRibs = trackGeo(BufferGeometryUtils.mergeGeometries(crossoverRibParts, false));
    crossoverRibParts.forEach((g) => g.dispose());
    const ribMesh = new THREE.Mesh(mergedRibs, tunnelConcreteMat);
    ribMesh.castShadow = true;
    ribMesh.receiveShadow = true;
    group.add(ribMesh);
  }

  if (portalStoneParts.length > 0) {
    const mergedPortals = trackGeo(BufferGeometryUtils.mergeGeometries(portalStoneParts, false));
    portalStoneParts.forEach((g) => g.dispose());
    const portalMesh = new THREE.Mesh(mergedPortals, tunnelPortalStoneMat);
    portalMesh.castShadow = true;
    portalMesh.receiveShadow = true;
    group.add(portalMesh);
  }
  if (portalDarkLinerParts.length > 0) {
    const mergedLiners = trackGeo(BufferGeometryUtils.mergeGeometries(portalDarkLinerParts, false));
    portalDarkLinerParts.forEach((g) => g.dispose());
    const linerMesh = new THREE.Mesh(mergedLiners, darkThroatMat);
    linerMesh.receiveShadow = true;
    group.add(linerMesh);
  }
  if (portalBeaconParts.length > 0) {
    const mergedBeacons = trackGeo(BufferGeometryUtils.mergeGeometries(portalBeaconParts, false));
    portalBeaconParts.forEach((g) => g.dispose());
    group.add(new THREE.Mesh(mergedBeacons, tunnelBeaconMat));
  }

  // 4B. UPPER-RIDGE CONCRETE & AVALANCHE SNOW-SHED GALLERY (Continuous Profile + Stone Portals + Canyon Buttress Piers)
  const shedParts: THREE.BufferGeometry[] = [];
  const idxShed17 = findNearestSampleIdx(430, -685);
  const idxShed18 = findNearestSampleIdx(165, -490);
  const shedSpan = Math.max(10, idxShed18 - idxShed17);
  const shedStartIdx = Math.round(idxShed17 + shedSpan * 0.16);
  const shedEndIdx = Math.round(idxShed17 + shedSpan * 0.56);
  const shedSamplesLen = shedEndIdx - shedStartIdx + 1;
  if (shedSamplesLen > 4) {
    // Continuous mountain-side retaining wall + slanted deflector canopy roof
    const shedProf: Array<[number, number]> = [
      [-tunInnerHalf - 1.15, -0.4],
      [-tunInnerHalf, -0.4],
      [-tunInnerHalf, 6.4],
      [tunInnerHalf + 0.35, 5.55],
      [tunInnerHalf + 0.55, 6.45],
      [-tunInnerHalf - 1.25, 7.65],
      [-tunInnerHalf - 1.15, -0.4],
    ];
    const sCols = shedProf.length;
    const sPos = new Float32Array(shedSamplesLen * sCols * 3);
    const sUv = new Float32Array(shedSamplesLen * sCols * 2);
    const sIdx: number[] = [];

    for (let k = 0; k < shedSamplesLen; k++) {
      const s = samples[shedStartIdx + k];
      const vCoord = (k * (circuit.totalLength / N)) / 6.0;
      for (let j = 0; j < sCols; j++) {
        const [lx, ly] = shedProf[j];
        const vi = k * sCols + j;
        sPos[vi * 3] = s.position.x + s.right.x * lx + s.up.x * ly;
        sPos[vi * 3 + 1] = s.position.y + s.right.y * lx + s.up.y * ly;
        sPos[vi * 3 + 2] = s.position.z + s.right.z * lx + s.up.z * ly;
        sUv[vi * 2] = (j / (sCols - 1)) * 3.0;
        sUv[vi * 2 + 1] = vCoord;
      }
      if (k < shedSamplesLen - 1) {
        for (let j = 0; j < sCols - 1; j++) {
          const a = k * sCols + j;
          const b = a + 1;
          const d = (k + 1) * sCols + j;
          const e = d + 1;
          sIdx.push(a, d, b, b, d, e);
        }
      }
      if (k % 4 === 0) {
        const dirXZ = s.tangent.clone().setY(0).normalize();
        qTmp.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirXZ);
        const post = new THREE.BoxGeometry(0.95, 6.3, 1.35);
        mat4.compose(
          new THREE.Vector3(
            s.position.x + s.right.x * (tunInnerHalf + 0.35),
            s.position.y + 2.85,
            s.position.z + s.right.z * (tunInnerHalf + 0.35),
          ),
          qTmp,
          new THREE.Vector3(1, 1, 1),
        );
        post.applyMatrix4(mat4);
        shedParts.push(post);

        const sm = new THREE.Matrix4();
        sm.compose(
          new THREE.Vector3(s.position.x, s.position.y + 5.75, s.position.z),
          qTmp,
          new THREE.Vector3(3.2, 0.2, 1.15),
        );
        tunnelStripMats.push(sm);
      }
    }

    const shedVaultGeo = trackGeo(new THREE.BufferGeometry());
    shedVaultGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    shedVaultGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2));
    shedVaultGeo.setIndex(sIdx);
    shedVaultGeo.computeVertexNormals();
    shedParts.push(shedVaultGeo);

    // Portal collars anchoring both ends of the Snow-Shed
    for (const endIdx of [shedStartIdx, shedEndIdx]) {
      const es = samples[endIdx];
      const dirXZ = es.tangent.clone().setY(0).normalize();
      qTmp.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dirXZ);
      const header = new THREE.BoxGeometry((tunInnerHalf + 1.3) * 2, 1.9, 2.2);
      mat4.compose(new THREE.Vector3(es.position.x, es.position.y + 6.7, es.position.z), qTmp, new THREE.Vector3(1, 1, 1));
      header.applyMatrix4(mat4);
      shedParts.push(header);
      for (const side of [-1, 1] as const) {
        const pier = new THREE.BoxGeometry(1.4, 7.6, 2.2);
        mat4.compose(
          new THREE.Vector3(
            es.position.x + es.right.x * side * (tunInnerHalf + 0.55),
            es.position.y + 3.4,
            es.position.z + es.right.z * side * (tunInnerHalf + 0.55),
          ),
          qTmp,
          new THREE.Vector3(1, 1, 1),
        );
        pier.applyMatrix4(mat4);
        shedParts.push(pier);
      }
    }
  }
  if (tunnelStripMats.length > 0) {
    const stripInst = new THREE.InstancedMesh(
      trackGeo(new THREE.BoxGeometry(1, 1, 1)),
      viaductLampGlowMat,
      tunnelStripMats.length,
    );
    for (let k = 0; k < tunnelStripMats.length; k++) {
      stripInst.setMatrixAt(k, tunnelStripMats[k]);
    }
    stripInst.instanceMatrix.needsUpdate = true;
    stripInst.computeBoundingSphere();
    group.add(stripInst);
  }
  if (tunnelWallReflectMats.length > 0) {
    const wallStripInst = new THREE.InstancedMesh(
      trackGeo(new THREE.BoxGeometry(1, 1, 1)),
      tunnelWallStripeMat,
      tunnelWallReflectMats.length,
    );
    for (let k = 0; k < tunnelWallReflectMats.length; k++) {
      wallStripInst.setMatrixAt(k, tunnelWallReflectMats[k]);
    }
    wallStripInst.instanceMatrix.needsUpdate = true;
    wallStripInst.computeBoundingSphere();
    group.add(wallStripInst);
  }
  if (shedParts.length > 0) {
    const mergedShed = trackGeo(BufferGeometryUtils.mergeGeometries(shedParts, false));
    shedParts.forEach((g) => g.dispose());
    const shedMesh = new THREE.Mesh(mergedShed, tunnelConcreteMat);
    shedMesh.castShadow = true;
    shedMesh.receiveShadow = true;
    group.add(shedMesh);
  }

  // 4C. SWITCHBACK HAIRPIN CHEVRON GUIDEPOSTS (Outside Shoulder, High-Curvature Bends)
  const chevronCanvas = document.createElement('canvas');
  chevronCanvas.width = 128;
  chevronCanvas.height = 128;
  const cCtx = chevronCanvas.getContext('2d');
  if (cCtx) {
    cCtx.fillStyle = '#111827';
    cCtx.fillRect(0, 0, 128, 128);
    cCtx.fillStyle = '#f59e0b';
    cCtx.beginPath();
    cCtx.moveTo(22, 18);
    cCtx.lineTo(66, 18);
    cCtx.lineTo(106, 64);
    cCtx.lineTo(66, 110);
    cCtx.lineTo(22, 110);
    cCtx.lineTo(62, 64);
    cCtx.closePath();
    cCtx.fill();
  }
  const chevronTex = trackTex(new THREE.CanvasTexture(chevronCanvas));
  chevronTex.colorSpace = THREE.SRGBColorSpace;
  chevronTex.anisotropy = Math.min(8, textures.gantryBannerAlbedo.anisotropy || 4);
  chevronTex.needsUpdate = true;
  const chevronSignGeo = trackGeo(new THREE.BoxGeometry(0.95, 1.05, 0.14));
  const chevronPostGeo = trackGeo(new THREE.BoxGeometry(0.12, 1.85, 0.12));
  const chevronSignMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: chevronTex,
      emissive: 0xf59e0b,
      emissiveMap: chevronTex,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.25,
    }),
  );
  const chevronPostMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.75 }),
  );
  const chevronSignMats: THREE.Matrix4[] = [];
  const chevronPostMats: THREE.Matrix4[] = [];

  for (let i = 0; i < N; i += 8) {
    const s = samples[i];
    if (s.isBridge || s.isTunnel || Math.abs(s.curvature) < 0.014) continue;
    if (i >= shedStartIdx - 3 && i <= shedEndIdx + 3) continue;
    // Skip right next to tunnel entrances/exits
    let nearTunnelMouth = false;
    for (let k = -4; k <= 4; k++) {
      const nIdx = (i + k + N) % N;
      if (samples[nIdx].isTunnel || samples[nIdx].isBridge) {
        nearTunnelMouth = true;
        break;
      }
    }
    if (nearTunnelMouth) continue;
    const outerSide: -1 | 1 = s.curvature > 0 ? -1 : 1;
    const lat = outerSide * (halfTot + 1.25);
    const px = s.position.x + s.right.x * lat;
    const py = s.position.y + s.right.y * lat;
    const pz = s.position.z + s.right.z * lat;
    if (hasNonAdjacentRoadNear(px, pz, i, 20, halfTot + 3.0)) continue;
    const faceDir = s.tangent.clone().multiplyScalar(-1).setY(0).normalize();
    const signQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), faceDir);
    if (s.curvature < 0) {
      signQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
    }
    chevronSignMats.push(
      new THREE.Matrix4().compose(new THREE.Vector3(px, py + 1.85, pz), signQuat, new THREE.Vector3(1, 1, 1)),
    );
    chevronPostMats.push(
      new THREE.Matrix4().compose(new THREE.Vector3(px, py + 0.92, pz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)),
    );
  }
  if (chevronSignMats.length > 0) {
    const signInst = new THREE.InstancedMesh(chevronSignGeo, chevronSignMat, chevronSignMats.length);
    const postInst = new THREE.InstancedMesh(chevronPostGeo, chevronPostMat, chevronPostMats.length);
    for (let i = 0; i < chevronSignMats.length; i++) {
      signInst.setMatrixAt(i, chevronSignMats[i]);
      postInst.setMatrixAt(i, chevronPostMats[i]);
    }
    signInst.instanceMatrix.needsUpdate = true;
    postInst.instanceMatrix.needsUpdate = true;
    signInst.computeBoundingSphere();
    postInst.computeBoundingSphere();
    group.add(signInst, postInst);
  }

  // 5. PROFILED DOUBLE-TIER W-BEAM ARMCO STEEL GUARDRAILS + POSTS + REFLECTOR TABS
  const galvanizedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xa6aeb8,
      roughness: 0.34,
      metalness: 0.85,
      envMapIntensity: 1.35,
    }),
  );
  const reflectorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffaa33,
      emissive: 0xff8800,
      emissiveIntensity: 0.35,
      roughness: 0.2,
      metalness: 0.2,
    }),
  );

  const railOffset = halfTot + 0.35;
  const doubleRailGeos: THREE.BufferGeometry[] = [];
  const postMatrices: THREE.Matrix4[] = [];
  const reflectorMatrices: THREE.Matrix4[] = [];

  const railPostGeo = trackGeo(new THREE.BoxGeometry(0.14, 1.15, 0.14));
  const reflectorTabGeo = trackGeo(new THREE.BoxGeometry(0.06, 0.14, 0.22));

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
      const gy = s.position.y + s.right.y * side * railOffset;
      pts.push(new THREE.Vector3(gx, gy, gz));
      rightVecs.push(s.right);

      if ((i - startIdx) % 2 === 0) {
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
          const refPos = new THREE.Vector3(gx, gy + 0.96, gz).addScaledVector(s.right, -side * 0.12);
          reflectorMatrices.push(
            new THREE.Matrix4().compose(refPos, basisQuat, new THREE.Vector3(1, 1, 1)),
          );
        }
      }
    }
    buildExtrudedRailBox(pts, rightVecs, 0.44, side);
    buildExtrudedRailBox(pts, rightVecs, 0.86, side);
  };

  for (const side of [-1, 1] as const) {
    let inRail = false;
    let railStart = 0;
    for (let i = 0; i < N; i++) {
      const s = samples[i];
      const inPitEntryGap =
        side === -1 &&
        s.isStraight &&
        isPointInPitBounds(circuit.pitLaneBounds, s.position.x, s.position.y, s.position.z, 18, 28);
      const inShedLeftWall = side === -1 && i >= shedStartIdx && i <= shedEndIdx;
      const gx = s.position.x + s.right.x * side * railOffset;
      const gz = s.position.z + s.right.z * side * railOffset;
      const nearOtherRoad = hasNonAdjacentRoadNear(gx, gz, i, 20, halfTot + 2.4);
      const wantRail = !s.isBridge && !s.isTunnel && !inPitEntryGap && !inShedLeftWall && !nearOtherRoad;
      if (wantRail) {
        worldColliders.setSplineBarrier(i, side, railOffset - 0.08, 'metal');
      } else if (inShedLeftWall) {
        worldColliders.setSplineBarrier(i, -1, tunInnerHalf - 0.15, 'concrete');
      }
      if (wantRail && !inRail) {
        inRail = true;
        railStart = i;
      } else if (!wantRail && inRail) {
        inRail = false;
        if (i - 1 - railStart > 4) buildGuardrailSegment(railStart, i - 1, side);
      }
    }
    if (inRail && N - 1 - railStart > 4) buildGuardrailSegment(railStart, N - 1, side);
  }

  if (doubleRailGeos.length > 0) {
    const mergedRails = trackGeo(BufferGeometryUtils.mergeGeometries(doubleRailGeos, false));
    for (const g of doubleRailGeos) g.dispose();
    const railsChunked = buildSpatialChunkedRoadMesh(mergedRails, galvanizedSteelMat, {
      cellSizeM: 115,
      castShadow: false,
      receiveShadow: true,
      name: 'KestrelRailChunks',
    });
    chunkedUpdaters.push(railsChunked);
    group.add(railsChunked.group);
  }
  if (postMatrices.length > 0) {
    const postsInst = new THREE.InstancedMesh(railPostGeo, galvanizedSteelMat, postMatrices.length);
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

  // 6. ROAD BOUNDARY CAT-EYE PAVEMENT STUDS (Illuminated at Night!)
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
      spacingSamples: 18,
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
      stoneMasonryMat.wireframe = wire;
      tunnelConcreteMat.wireframe = wire;
      galvanizedSteelMat.wireframe = wire;
      if (curbMat) curbMat.wireframe = wire;
    },
    setNightFactor: (nightFactor: number) => {
      viaductLampGlowMat.emissiveIntensity = 0.42 + nightFactor * 2.85;
      catEyeMat.emissiveIntensity = 0.14 + nightFactor * 2.55;
      reflectorMat.emissiveIntensity = 0.28 + nightFactor * 2.3;
      tunnelBeaconMat.emissiveIntensity = 0.85 + nightFactor * 2.65;
      tunnelWallStripeMat.emissiveIntensity = 0.38 + nightFactor * 1.95;
      const showPl = nightFactor > 0.01;
      for (const pl of bridgeLights) {
        pl.intensity = nightFactor * 3.2;
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
      radiusM = 620,
      camPos?: THREE.Vector3,
      camFwd?: THREE.Vector3,
    ) => {
      for (let i = 0; i < chunkedUpdaters.length; i++) {
        chunkedUpdaters[i].updateVisibilityWindow(focusPos, radiusM, camPos, camFwd);
      }
    },
    dispose: () => {
      for (let i = 0; i < chunkedUpdaters.length; i++) chunkedUpdaters[i].dispose();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
      for (const t of disposableTex) t.dispose();
    },
  };
}
