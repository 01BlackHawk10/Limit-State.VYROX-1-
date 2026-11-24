import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createCircuitQueryScratch,
  getCircuitData,
  SHOULDER_WIDTH,
} from '../Aurelia Ridge/circuitSpline';
import { KESTREL_BRIDGE_HUB, KESTREL_WATER_LEVEL } from './kestrelTerrainField';
import { clamp, createSeededRandom, fbm2D, ridgedNoise2D } from '../../engine/mathNoise';
import { ProceduralTextureSuite } from '../Aurelia Ridge/proceduralTextures';
import { type WeatherUniforms } from '../Aurelia Ridge/skyAndLighting';
import { groundHeightAt } from '../Aurelia Ridge/terrainField';
import { type InspectMode, type MistUniforms, type TerrainRig } from '../Aurelia Ridge/terrainBuilder';
import { buildChunkedTerrainTiles } from '../sharedTerrainChunker';

/**
 * Builds Kestrel Peaks' towering high-detail Dolomite mountain landscape:
 * - High-density terrain grid (up to 360x360) with crisp triplanar Dolomite limestone, dark slate granite,
 *   lush emerald alpine meadows, mossy pockets, and sunlit high-altitude summit snow/frost
 * - Expansive outer mountain massif silhouette ring out to 3,200 m (zero desert/sand)
 * - Deep turquoise Highland Glacial Loch beneath the multi-arch stone viaduct
 * - Twin-tier animated cliff waterfall plunging into a sunlit turquoise mist basin
 */
export function buildKestrelTerrainRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
  mistUniforms?: MistUniforms,
  isSoftwareGl = false,
  segsOverride?: number,
): TerrainRig {
  const group = new THREE.Group();
  group.name = 'KestrelTerrainRig';

  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };
  const sharedMist: MistUniforms = mistUniforms ?? {
    uMistColor: { value: new THREE.Color(0xcbd9e8) },
    uMistStrength: { value: 0.32 },
  };

  const inspectUniforms = {
    uInspectMode: { value: 0 },
  };

  const circuit = getCircuitData();
  const roadHalf = circuit.roadHalfWidth;
  const size = 2360;
  const segs = segsOverride ?? (isSoftwareGl ? 176 : 300);

  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
  const count = posAttr.count;
  const stride = segs + 1;

  const colors = new Float32Array(count * 3);
  const snowWeights = new Float32Array(count);
  const rockWeights = new Float32Array(count);
  const cavityAO = new Float32Array(count);
  const roadDists = new Float32Array(count);

  const qClampScratch = createCircuitQueryScratch(circuit.samples[0]);
  const clampCellReach = Math.SQRT2 * (size / segs) * 1.45;
  const clampBand = roadHalf + SHOULDER_WIDTH + clampCellReach;
  const nCircuitSamples = circuit.samples.length;
  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    let y = groundHeightAt(x, z);
    const gq = circuit.queryNearestGroundTrackInto(x, z, qClampScratch);
    if (gq.absDistance <= clampBand) {
      const sIdx = gq.sample.index;
      let minLocalY =
        gq.centerPos.y +
        gq.right.y * clamp(gq.signedLateral, -(roadHalf + SHOULDER_WIDTH), roadHalf + SHOULDER_WIDTH);
      for (let off = -8; off <= 8; off++) {
        if (off === 0) continue;
        const j = circuit.closedLoop
          ? ((sIdx + off) % nCircuitSamples + nCircuitSamples) % nCircuitSamples
          : clamp(sIdx + off, 0, nCircuitSamples - 1);
        const sj = circuit.samples[j];
        if (sj.isBridge) continue;
        const latJ = (x - sj.position.x) * sj.right.x + (z - sj.position.z) * sj.right.z;
        const cy =
          sj.position.y +
          sj.right.y * clamp(latJ, -(roadHalf + SHOULDER_WIDTH), roadHalf + SHOULDER_WIDTH);
        if (cy < minLocalY) minLocalY = cy;
      }
      const inTun = gq.sample.isTunnel || gq.nextSample.isTunnel;
      y = Math.min(y, minLocalY - (inTun ? 1.25 : 1.08));
    }
    posAttr.setY(i, y);
    uvAttr.setXY(i, x * 0.042, z * 0.042);
  }
  geo.computeVertexNormals();
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;

  const rand = createSeededRandom(31907);
  const colHighlandMoss = new THREE.Color(0x284e2a);
  const colAlpineMeadow = new THREE.Color(0x3f6835);
  const colDolomiteLimestone = new THREE.Color(0xa6afb9);
  const colSlateGranite = new THREE.Color(0x434d5a);
  const colSummitFrost = new THREE.Color(0xeef4fb);
  const colWetShoreSlate = new THREE.Color(0x303c44);
  const colRoadShoulder = new THREE.Color(0x525a64);
  const cTmp = new THREE.Color();

  const qScratch = createCircuitQueryScratch(circuit.samples[0]);
  const cCliffTmp = new THREE.Color();

  for (let row = 0; row <= segs; row++) {
    for (let col = 0; col <= segs; col++) {
      const i = row * stride + col;
      const x = posAttr.getX(i);
      const h = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const ny = Math.max(0, Math.min(1, normAttr.getY(i)));
      const slope = 1.0 - ny;
      const q = circuit.queryNearestInto(x, z, qScratch);
      const dRoad = q.absDistance;
      roadDists[i] = q.isBridge ? 120.0 : Math.max(0.0, dRoad - roadHalf);

      const patch = fbm2D(x * 0.012, z * 0.012, 3, 2.0, 0.5, 421);
      const strataMix = fbm2D(x * 0.025, h * 0.085, 2, 2.0, 0.5, 887);
      const heightAboveWater = h - KESTREL_WATER_LEVEL;

      const rockCliff = THREE.MathUtils.smoothstep(slope, 0.10, 0.28);
      const highAltRock = THREE.MathUtils.smoothstep(h, 152, 242) * 0.82;
      const lochBedRock = 1.0 - THREE.MathUtils.smoothstep(heightAboveWater, -0.8, 1.8);
      const totalRock = Math.min(1.0, Math.max(rockCliff, highAltRock, lochBedRock * 0.92));
      const summitFrost =
        THREE.MathUtils.smoothstep(h, 240, 345) * (1.0 - THREE.MathUtils.smoothstep(slope, 0.25, 0.56));

      snowWeights[i] = summitFrost;
      rockWeights[i] = totalRock;

      const rM = Math.max(0, row - 1);
      const rP = Math.min(segs, row + 1);
      const cM = Math.max(0, col - 1);
      const cP = Math.min(segs, col + 1);
      const avgNeighborH =
        (posAttr.getY(rM * stride + col) +
          posAttr.getY(rP * stride + col) +
          posAttr.getY(row * stride + cM) +
          posAttr.getY(row * stride + cP)) *
        0.25;
      const hLaplacian = (avgNeighborH - h) * 3.8;
      cavityAO[i] = THREE.MathUtils.clamp(1.0 - hLaplacian * 0.095, 0.54, 1.10);

      cTmp.copy(colHighlandMoss).lerp(colAlpineMeadow, 0.24 + 0.66 * patch);
      if (heightAboveWater < 2.6) {
        cTmp.lerp(colWetShoreSlate, 1.0 - THREE.MathUtils.smoothstep(heightAboveWater, -0.5, 2.6));
      }
      if (totalRock > 0.02) {
        cCliffTmp.copy(colSlateGranite).lerp(colDolomiteLimestone, 0.30 + 0.56 * strataMix);
        cTmp.lerp(cCliffTmp, totalRock);
      }
      if (summitFrost > 0.02) {
        cTmp.lerp(colSummitFrost, summitFrost * 0.86);
      }
      if (dRoad < roadHalf + SHOULDER_WIDTH + 8.0 && !q.isBridge) {
        const roadEdge =
          1.0 - THREE.MathUtils.smoothstep(dRoad, roadHalf + 1.5, roadHalf + SHOULDER_WIDTH + 8.0);
        cTmp.lerp(colRoadShoulder, roadEdge * (0.58 + totalRock * 0.24));
      }

      const grain = 0.96 + rand() * 0.08;
      colors[i * 3] = cTmp.r * grain;
      colors[i * 3 + 1] = cTmp.g * grain;
      colors[i * 3 + 2] = cTmp.b * grain;
    }
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSnowWeight', new THREE.BufferAttribute(snowWeights, 1));
  geo.setAttribute('aRockWeight', new THREE.BufferAttribute(rockWeights, 1));
  geo.setAttribute('aCavityAO', new THREE.BufferAttribute(cavityAO, 1));
  geo.setAttribute('aRoadDist', new THREE.BufferAttribute(roadDists, 1));
  geo.computeBoundingSphere();

  const terrainUniforms = {
    uRockMap: { value: textures.terrainRockAlbedo },
    uRockNormalMap: { value: textures.terrainRockNormal },
    uRockRoughMap: { value: textures.terrainRockRoughness },
    uRockORM: { value: textures.terrainRockORM },
    uDetailMap: { value: textures.terrainDetailMap },
    uDetailNormal: { value: textures.terrainDetailNormal },
    uGravelMap: { value: textures.gravelAlbedo },
    uMistColor: sharedMist.uMistColor,
    uMistStrength: sharedMist.uMistStrength,
    uWaterLevel: { value: KESTREL_WATER_LEVEL },
  };

  const terrainMat = new THREE.MeshStandardMaterial({
    map: textures.terrainGrassAlbedo,
    normalMap: textures.terrainGrassNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.84,
    metalness: 0.02,
    vertexColors: true,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uInspectMode = inspectUniforms.uInspectMode;
    shader.uniforms.uRockMap = terrainUniforms.uRockMap;
    shader.uniforms.uRockNormalMap = terrainUniforms.uRockNormalMap;
    shader.uniforms.uRockRoughMap = terrainUniforms.uRockRoughMap;
    shader.uniforms.uRockORM = terrainUniforms.uRockORM;
    shader.uniforms.uDetailMap = terrainUniforms.uDetailMap;
    shader.uniforms.uDetailNormal = terrainUniforms.uDetailNormal;
    shader.uniforms.uGravelMap = terrainUniforms.uGravelMap;
    shader.uniforms.uMistColor = terrainUniforms.uMistColor;
    shader.uniforms.uMistStrength = terrainUniforms.uMistStrength;
    shader.uniforms.uWaterLevel = terrainUniforms.uWaterLevel;
    shader.uniforms.uWetness = sharedWeather.uWetness;
    shader.uniforms.uOvercast = sharedWeather.uOvercast;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSnowWeight;
        attribute float aRockWeight;
        attribute float aCavityAO;
        attribute float aRoadDist;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying float vSnowW;
        varying float vRockW;
        varying float vCavityAO;
        varying float vRoadDist;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSnowW = aSnowWeight;
        vRockW = aRockWeight;
        vCavityAO = aCavityAO;
        vRoadDist = aRoadDist;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform int uInspectMode;
        uniform sampler2D uRockMap;
        uniform sampler2D uRockNormalMap;
        uniform sampler2D uRockRoughMap;
        uniform sampler2D uRockORM;
        uniform sampler2D uDetailMap;
        uniform sampler2D uDetailNormal;
        uniform sampler2D uGravelMap;
        uniform vec3 uMistColor;
        uniform float uMistStrength;
        uniform float uWaterLevel;
        uniform float uWetness;
        uniform float uOvercast;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying float vSnowW;
        varying float vRockW;
        varying float vCavityAO;
        varying float vRoadDist;

        float kestrelHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float kestrelNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(kestrelHash(i), kestrelHash(i + vec2(1.0, 0.0)), u.x),
            mix(kestrelHash(i + vec2(0.0, 1.0)), kestrelHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        vec3 kTriSample(sampler2D tex, vec3 wp, vec3 w, float sc) {
          vec3 acc = vec3(0.0);
          if (w.x > 0.015) acc += texture2D(tex, wp.zy * sc).rgb * w.x;
          if (w.y > 0.015) acc += texture2D(tex, wp.xz * sc).rgb * w.y;
          if (w.z > 0.015) acc += texture2D(tex, wp.xy * sc).rgb * w.z;
          return acc;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 triW = abs(normalize(vWorldNormal));
        triW = pow(triW, vec3(4.0));
        triW /= max(triW.x + triW.y + triW.z, 1e-4);

        vec3 rockCoarse = kTriSample(uRockMap, vWorldPos, triW, 0.052);
        vec3 rockFine = kTriSample(uRockMap, vWorldPos, triW, 0.165);
        vec3 rockOrmK = kTriSample(uRockORM, vWorldPos, triW, 0.056);
        vec3 rockTri = rockCoarse * 0.56 + rockFine * 0.44;
        float detailMacro = kTriSample(uDetailMap, vWorldPos, triW, 0.058).r;
        float detailMicro = kTriSample(uDetailMap, vWorldPos, triW, 0.28).r;
        float detailFactor = mix(detailMacro, detailMicro, 0.60);

        float macroVar = kestrelNoise(vWorldPos.xz * 0.015);
        float microMoss = kestrelNoise(vWorldPos.xz * 0.24);
        float strataBand = 0.78 + 0.34 * sin(vWorldPos.y * 1.65 + macroVar * 3.4 + detailMacro * 2.4);
        float fineStrata = 0.90 + 0.16 * sin(vWorldPos.y * 4.8 + detailMicro * 3.2);
        vec3 limestoneRock = mix(rockTri * vec3(0.68, 0.72, 0.78), rockTri * vec3(1.22, 1.24, 1.26), strataBand * 0.56) * fineStrata;
        limestoneRock *= (0.76 + detailFactor * 0.48) * mix(0.76, 1.08, rockOrmK.r);
        limestoneRock += vec3(0.05, 0.052, 0.056) * smoothstep(0.70, 0.96, rockOrmK.b) * smoothstep(140.0, 290.0, vWorldPos.y);

        diffuseColor.rgb *= mix(0.84, 1.12, macroVar) * (0.80 + detailMicro * 0.40);
        diffuseColor.rgb = mix(diffuseColor.rgb, limestoneRock * vColor.rgb * 1.48, clamp(vRockW * 0.92, 0.0, 0.96));

        // High-detail roadside crushed Dolomite gravel verge, talus scree, and rock-cut slope seepage
        float slopeAmt = 1.0 - max(0.0, vWorldNormal.y);
        float vergeMask = (1.0 - smoothstep(2.0, 8.8, vRoadDist)) * (1.0 - smoothstep(0.30, 0.56, slopeAmt));
        float roadsideCutMask = 1.0 - smoothstep(3.5, 42.0, vRoadDist);
        float talusMask = smoothstep(0.14, 0.38, slopeAmt) * (1.0 - smoothstep(0.45, 0.72, slopeAmt)) * roadsideCutMask;
        vec3 crushedGravel = texture2D(uGravelMap, vWorldPos.xz * 0.28).rgb * (0.76 + detailMicro * 0.48) * vec3(0.92, 0.94, 0.98);
        diffuseColor.rgb = mix(diffuseColor.rgb, crushedGravel, clamp(vergeMask * 0.78, 0.0, 0.82));
        diffuseColor.rgb = mix(diffuseColor.rgb, crushedGravel * vec3(0.86, 0.89, 0.94) * strataBand, clamp(talusMask * 0.42, 0.0, 0.48));

        // Damp fissure seepage dark streaks & vertical fracture shadows along road-cut cliffs
        float seepStreak = smoothstep(0.42, 0.80, kestrelNoise(vec2(vWorldPos.x * 0.28, vWorldPos.z * 0.28))) * roadsideCutMask * vRockW;
        float fractureV = smoothstep(0.60, 0.92, kestrelNoise(vec2(vWorldPos.x * 0.55 + vWorldPos.z * 0.55, vWorldPos.y * 0.14))) * roadsideCutMask;
        diffuseColor.rgb *= mix(1.0, 0.58, clamp(seepStreak * (0.38 + uWetness * 0.55) + fractureV * 0.24, 0.0, 0.72));

        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.91, 0.95, 0.99), clamp(vSnowW * 0.78, 0.0, 0.78));

        float mossMask = (1.0 - smoothstep(125.0, 215.0, vWorldPos.y)) * (1.0 - vRockW * 0.70) * smoothstep(0.28, 0.74, microMoss);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.29, 0.15), mossMask * (0.38 + roadsideCutMask * 0.18));

        float shoreBand = 1.0 - smoothstep(-0.3, 1.8, vWorldPos.y - uWaterLevel);
        diffuseColor.rgb *= mix(1.0, 0.50, shoreBand * 0.72);
        diffuseColor.rgb *= mix(1.0, 0.68, uWetness * 0.65);
        diffuseColor.rgb *= clamp(vCavityAO, 0.50, 1.10);

        if (uInspectMode == 2) {
          float hNorm = clamp((vWorldPos.y - 10.0) / 260.0, 0.0, 1.0);
          diffuseColor.rgb = mix(vec3(0.08, 0.32, 0.52), vec3(0.95, 0.96, 1.0), hNorm);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float rockRough = texture2D(uRockRoughMap, vWorldPos.xz * 0.052).g;
        float rockOrmRoughK = rockOrmK.g;
        roughnessFactor = mix(roughnessFactor, clamp(0.60 + mix(rockRough, rockOrmRoughK, 0.45) * 0.30, 0.38, 0.96), vRockW);
        float shoreWetR = 1.0 - smoothstep(-0.3, 1.6, vWorldPos.y - uWaterLevel);
        roughnessFactor = mix(roughnessFactor, 0.15, shoreWetR * 0.88);
        roughnessFactor = mix(roughnessFactor, 0.20, clamp(uWetness * 0.82, 0.0, 0.85));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float roadDetailBoost = 1.0 - smoothstep(2.0, 32.0, vRoadDist);
        float detailWeightK = 0.42 + roadDetailBoost * 0.52;
        vec3 rnx = triW.x > 0.015 ? (texture2D(uRockNormalMap, vWorldPos.zy * 0.054).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 rny = triW.y > 0.015 ? (texture2D(uRockNormalMap, vWorldPos.xz * 0.054).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 rnz = triW.z > 0.015 ? (texture2D(uRockNormalMap, vWorldPos.xy * 0.054).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 dnx = triW.x > 0.015 ? (texture2D(uDetailNormal, vWorldPos.zy * 0.24).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 dny = triW.y > 0.015 ? (texture2D(uDetailNormal, vWorldPos.xz * 0.24).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 dnz = triW.z > 0.015 ? (texture2D(uDetailNormal, vWorldPos.xy * 0.24).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 cnx = rnx * 0.85 + dnx * detailWeightK;
        vec3 cny = rny * 0.85 + dny * detailWeightK;
        vec3 cnz = rnz * 0.85 + dnz * detailWeightK;
        vec3 triSign = sign(vWorldNormal);
        vec3 wPerturb =
          vec3(0.0, cnx.y, cnx.x * triSign.x) * triW.x +
          vec3(cny.x, 0.0, cny.y * triSign.y) * triW.y +
          vec3(cnz.x * triSign.z, cnz.y, 0.0) * triW.z;
        vec3 rawCliffN = normal + (viewMatrix * vec4(wPerturb * 0.95, 0.0)).xyz;
        float rcLen = length(rawCliffN);
        vec3 viewCliffNorm = rcLen > 1e-5 ? (rawCliffN / rcLen) : vec3(0.0, 0.0, 1.0);
        float normBlend = max(clamp(vRockW, 0.0, 1.0), roadDetailBoost * 0.62);
        vec3 mixedCliffN = mix(normal, viewCliffNorm, normBlend);
        float mcLen = length(mixedCliffN);
        normal = mcLen > 1e-5 ? (mixedCliffN / mcLen) : vec3(0.0, 0.0, 1.0);`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        float distFromCam = length(cameraPosition - vWorldPos);
        float valleyMist = (1.0 - smoothstep(15.0, 138.0, vWorldPos.y)) * smoothstep(230.0, 1080.0, distFromCam);
        float ridgeMist = smoothstep(460.0, 1850.0, distFromCam);
        float mistAmt = clamp((valleyMist * 0.48 + ridgeMist * 0.56) * (uMistStrength + uOvercast * 0.24), 0.0, 0.70);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, mistAmt);`,
      );
  };
  terrainMat.customProgramCacheKey = () => 'kestrel-alpine-dolomite-terrain-v6';

  const chunkedTerrain = buildChunkedTerrainTiles(geo, terrainMat, size, segs, {
    chunkSizeM: 210,
    receiveShadow: true,
    castShadow: false,
    name: 'KestrelChunkedTerrain',
  });
  const terrainMesh = chunkedTerrain.primaryMesh;
  group.add(chunkedTerrain.group);

  // Outer Distant Towering Mountain Range Ring (1120m -> 3200m, soaring up to 540m alpine peaks)
  const skirtGeo = new THREE.RingGeometry(1100, 3200, 128, 30);
  skirtGeo.rotateX(-Math.PI / 2);
  const spAttr = skirtGeo.attributes.position as THREE.BufferAttribute;
  const skirtCols = new Float32Array(spAttr.count * 3);
  const cOuterGreen = new THREE.Color(0x1f3624);
  const cOuterSlate = new THREE.Color(0x495360);
  const cOuterLimestone = new THREE.Color(0xb8c2ce);
  const cOuterFrost = new THREE.Color(0xeaf1f8);
  for (let i = 0; i < spAttr.count; i++) {
    const x = spAttr.getX(i);
    const z = spAttr.getZ(i);
    const r = Math.hypot(x, z);
    const edgeMatch = THREE.MathUtils.smoothstep(r, 1100, 1400);
    const innerH = groundHeightAt(clamp(x, -1140, 1140), clamp(z, -1140, 1140));
    const macroR = ridgedNoise2D(x * 0.00145 + 1.3, z * 0.00145 - 0.8, 4, 2.15, 0.54, 5171);
    const subPeak = ridgedNoise2D(x * 0.0029 - 2.7, z * 0.0029 + 1.4, 3, 2.1, 0.5, 9013);
    const farPeakH = 165 + (macroR * 275 + subPeak * 185) * THREE.MathUtils.smoothstep(r, 1160, 2350);
    const finalY = THREE.MathUtils.lerp(innerH - 1.5, Math.max(innerH, farPeakH), edgeMatch);
    spAttr.setY(i, finalY);

    cTmp.copy(cOuterGreen).lerp(cOuterSlate, THREE.MathUtils.smoothstep(finalY, 105, 240));
    cTmp.lerp(cOuterLimestone, THREE.MathUtils.smoothstep(finalY, 230, 370) * 0.74);
    cTmp.lerp(cOuterFrost, THREE.MathUtils.smoothstep(finalY, 375, 510) * 0.86);
    skirtCols[i * 3] = cTmp.r;
    skirtCols[i * 3 + 1] = cTmp.g;
    skirtCols[i * 3 + 2] = cTmp.b;
  }
  skirtGeo.setAttribute('color', new THREE.BufferAttribute(skirtCols, 3));
  skirtGeo.computeVertexNormals();

  const skirtMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.90,
    metalness: 0.02,
  });
  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
  skirtMesh.receiveShadow = false;
  group.add(skirtMesh);

  // Deep Highland Glacial Loch Water Surface around KESTREL_BRIDGE_HUB (575, KESTREL_WATER_LEVEL, -45)
  const waterGeo = new THREE.PlaneGeometry(680, 680, 72, 72);
  waterGeo.rotateX(-Math.PI / 2);
  const wPos = waterGeo.attributes.position as THREE.BufferAttribute;
  const wDepth = new Float32Array(wPos.count);
  for (let i = 0; i < wPos.count; i++) {
    const wx = KESTREL_BRIDGE_HUB.x + wPos.getX(i);
    const wz = KESTREL_BRIDGE_HUB.z + wPos.getZ(i);
    const gh = groundHeightAt(wx, wz);
    wDepth[i] = Math.max(0, KESTREL_WATER_LEVEL - gh);
  }
  waterGeo.setAttribute('aWaterDepth', new THREE.BufferAttribute(wDepth, 1));

  const waterUniforms = {
    uTime: sharedWeather.uTime,
    uMistColor: sharedMist.uMistColor,
    uMistStrength: sharedMist.uMistStrength,
    uWaterChop: { value: 0.45 },
    uWaterClarity: { value: 0.65 },
  };

  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b4f5c,
    roughness: 0.08,
    metalness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    depthWrite: false,
    opacity: 0.88,
    envMapIntensity: 1.55,
  });

  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.uniforms.uMistColor = waterUniforms.uMistColor;
    shader.uniforms.uMistStrength = waterUniforms.uMistStrength;
    shader.uniforms.uWaterChop = waterUniforms.uWaterChop;
    shader.uniforms.uWaterClarity = waterUniforms.uWaterClarity;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aWaterDepth;
        uniform float uTime;
        uniform float uWaterChop;
        varying float vWaterDepth;
        varying vec3 vWaterWorldPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWaterDepth = aWaterDepth;
        vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float chop = mix(0.03, 0.16, uWaterChop);
        transformed.y += (sin(wp.x * 0.22 + uTime * 1.45) + cos(wp.z * 0.19 - uTime * 1.15)) * chop * smoothstep(0.0, 2.0, aWaterDepth);
        vWaterWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uMistColor;
        uniform float uMistStrength;
        uniform float uWaterClarity;
        varying float vWaterDepth;
        varying vec3 vWaterWorldPos;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        if (vWaterDepth <= 0.01) discard;
        float ripple = 0.5 + 0.5 * sin(vWaterWorldPos.x * 0.65 + uTime * 2.1) * cos(vWaterWorldPos.z * 0.58 - uTime * 1.7);
        vec3 shallowTurquoise = vec3(0.08, 0.50, 0.52);
        vec3 deepLochBlue = vec3(0.03, 0.16, 0.27);
        float depthMix = smoothstep(0.3, 7.5, vWaterDepth);
        vec3 lochCol = mix(shallowTurquoise, deepLochBlue, depthMix * mix(0.85, 0.52, uWaterClarity));
        lochCol += vec3(0.07, 0.16, 0.18) * ripple * 0.50;
        float foamEdge = (1.0 - smoothstep(0.02, 0.95, vWaterDepth));
        vec3 viewW = normalize(cameraPosition - vWaterWorldPos);
        float fresnelSky = pow(max(1.0 - clamp(abs(viewW.y), 0.0, 1.0), 1e-4), 3.0);
        lochCol = mix(lochCol, mix(uMistColor, vec3(0.80, 0.90, 0.98), 0.36), clamp(fresnelSky * 0.62, 0.0, 0.64));
        lochCol = mix(lochCol, vec3(0.90, 0.96, 1.0), foamEdge * 0.62);
        diffuseColor.rgb = lochCol;
        diffuseColor.a = clamp(0.60 + depthMix * 0.36, 0.60, 0.97);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float wx = cos(vWaterWorldPos.x * 0.65 + uTime * 1.4) * 0.045 + cos(vWaterWorldPos.z * 1.15 - uTime * 1.8) * 0.024;
        float wz = sin(vWaterWorldPos.z * 0.72 - uTime * 1.3) * 0.045 + sin((vWaterWorldPos.x - vWaterWorldPos.z) * 1.05 + uTime * 1.6) * 0.024;
        normal = normalize(normal + vec3(wx, 0.0, wz));`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        float distCamW = length(cameraPosition - vWaterWorldPos);
        float lochMist = clamp(smoothstep(160.0, 960.0, distCamW) * uMistStrength * 0.72, 0.0, 0.68);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, lochMist);`,
      );
  };
  waterMat.customProgramCacheKey = () => 'kestrel-highland-loch-water-v3';

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(KESTREL_BRIDGE_HUB.x, KESTREL_WATER_LEVEL, KESTREL_BRIDGE_HUB.z);
  waterMesh.receiveShadow = true;
  waterMesh.renderOrder = 1;
  group.add(waterMesh);

  // Sculpted Horseshoe Gorge Headwall & Multi-Ribbon Waterfall plunging into Highland Loch
  const wfTopX = 372;
  const wfTopZ = -125;
  const wfBotX = 436;
  const wfBotZ = -96;
  const wfTopY = Math.max(groundHeightAt(wfTopX, wfTopZ) + 2.0, KESTREL_WATER_LEVEL + 58.0);

  const wetRockMat = new THREE.MeshStandardMaterial({
    map: textures.terrainRockAlbedo,
    normalMap: textures.terrainRockNormal,
    normalScale: new THREE.Vector2(1.4, 1.4),
    color: 0x525b63,
    roughness: 0.18,
    metalness: 0.08,
    envMapIntensity: 1.4,
  });
  const wfMossMat = new THREE.MeshStandardMaterial({
    map: textures.terrainGrassAlbedo,
    normalMap: textures.terrainGrassNormal,
    normalScale: new THREE.Vector2(1.1, 1.1),
    color: 0x2c5228,
    roughness: 0.24,
    metalness: 0.04,
  });

  const wfRockParts: THREE.BufferGeometry[] = [];
  const wfMossParts: THREE.BufferGeometry[] = [];
  for (let b = 0; b < 5; b++) {
    const angle = ((b - 2) / 2.1) * 0.72;
    const bx = wfTopX + Math.sin(angle) * 10.5 - 3.5;
    const bz = wfTopZ - Math.cos(angle) * 5.2 - 3.0;
    const backRock = new THREE.DodecahedronGeometry(8.2 - Math.abs(b - 2) * 0.75, 2);
    backRock.scale(1.32, 1.95, 1.18);
    backRock.translate(bx, wfTopY - 8.5 - Math.abs(b - 2) * 1.1, bz);
    wfRockParts.push(backRock);
  }
  for (const shelf of [
    { x: 394, y: wfTopY - 18.0, z: -115, sx: 6.4, sy: 3.4, sz: 5.0 },
    { x: 416, y: KESTREL_WATER_LEVEL + 16.5, z: -105, sx: 7.2, sy: 3.8, sz: 5.2 },
    { x: 424, y: KESTREL_WATER_LEVEL + 0.5, z: -108, sx: 3.6, sy: 1.8, sz: 3.4 },
    { x: 446, y: KESTREL_WATER_LEVEL + 0.4, z: -90, sx: 3.8, sy: 1.9, sz: 3.6 },
  ]) {
    const sr = new THREE.DodecahedronGeometry(1.0, 1);
    sr.scale(shelf.sx, shelf.sy, shelf.sz);
    sr.translate(shelf.x, shelf.y, shelf.z);
    wfRockParts.push(sr);
  }
  for (let l = 0; l < 6; l++) {
    const t = l / 5;
    const lx = THREE.MathUtils.lerp(wfTopX, wfBotX, t);
    const lz = THREE.MathUtils.lerp(wfTopZ, wfBotZ, t);
    const ly = THREE.MathUtils.lerp(wfTopY - 2.5, KESTREL_WATER_LEVEL + 1.0, t);
    for (const sideShift of [-8.8 - t * 2.8, 8.8 + t * 2.8]) {
      const flank = new THREE.DodecahedronGeometry(5.6 - t * 0.5, 1);
      flank.scale(1.15, 1.65, 1.15);
      flank.rotateY((l + sideShift) * 0.5);
      flank.translate(lx - sideShift * 0.44, ly - 1.5, lz + sideShift * 0.88);
      wfRockParts.push(flank);

      const mossPad = new THREE.DodecahedronGeometry(2.9 - t * 0.35, 1);
      mossPad.scale(1.25, 0.52, 1.15);
      mossPad.translate(lx - sideShift * 0.38, ly + 3.2, lz + sideShift * 0.78);
      wfMossParts.push(mossPad);
    }
  }
  const wfGeos: THREE.BufferGeometry[] = [];
  if (wfRockParts.length > 0) {
    const mergedWfRockGeo = BufferGeometryUtils.mergeGeometries(wfRockParts, false);
    wfRockParts.forEach((g) => g.dispose());
    if (mergedWfRockGeo) {
      wfGeos.push(mergedWfRockGeo);
      const rockMesh = new THREE.Mesh(mergedWfRockGeo, wetRockMat);
      rockMesh.castShadow = true;
      rockMesh.receiveShadow = true;
      group.add(rockMesh);
    }
  }
  if (wfMossParts.length > 0) {
    const mergedWfMossGeo = BufferGeometryUtils.mergeGeometries(wfMossParts, false);
    wfMossParts.forEach((g) => g.dispose());
    if (mergedWfMossGeo) {
      wfGeos.push(mergedWfMossGeo);
      const mossMesh = new THREE.Mesh(mergedWfMossGeo, wfMossMat);
      mossMesh.castShadow = true;
      mossMesh.receiveShadow = true;
      group.add(mossMesh);
    }
  }
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
      const widthFlare = 1.0 + u * 0.42;
      for (let c = 0; c < cols; c++) {
        const cu = c / (cols - 1);
        const lat = (cu - 0.5) * 2 * halfW * widthFlare;
        const vi = r * cols + c;
        const arch = Math.sin(cu * Math.PI) * 0.34 + Math.cos(u * 12.0 + cu * 5.0) * 0.05;
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
    const rGeo = new THREE.BufferGeometry();
    rGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    rGeo.setAttribute('aNormV', new THREE.BufferAttribute(normV, 1));
    rGeo.setIndex(idx);
    rGeo.computeVertexNormals();
    wfGeos.push(rGeo);
    return rGeo;
  };

  const mainCurtainGeo = buildCascadeRibbon(
    [
      new THREE.Vector3(wfTopX, wfTopY, wfTopZ),
      new THREE.Vector3(THREE.MathUtils.lerp(wfTopX, wfBotX, 0.32), wfTopY - 14.5, THREE.MathUtils.lerp(wfTopZ, wfBotZ, 0.30)),
      new THREE.Vector3(THREE.MathUtils.lerp(wfTopX, wfBotX, 0.56), wfTopY - 31.0, THREE.MathUtils.lerp(wfTopZ, wfBotZ, 0.54)),
      new THREE.Vector3(THREE.MathUtils.lerp(wfTopX, wfBotX, 0.80), KESTREL_WATER_LEVEL + 13.5, THREE.MathUtils.lerp(wfTopZ, wfBotZ, 0.78)),
      new THREE.Vector3(wfBotX, KESTREL_WATER_LEVEL - 0.6, wfBotZ),
    ],
    5.4,
    72,
    22,
    5.2,
  );
  const leftChuteGeo = buildCascadeRibbon(
    [
      new THREE.Vector3(wfTopX - 3.6, wfTopY - 1.2, wfTopZ + 5.2),
      new THREE.Vector3(THREE.MathUtils.lerp(wfTopX, wfBotX, 0.5) - 4.2, wfTopY - 26.0, THREE.MathUtils.lerp(wfTopZ, wfBotZ, 0.5) + 6.4),
      new THREE.Vector3(wfBotX - 4.8, KESTREL_WATER_LEVEL - 0.5, wfBotZ + 6.2),
    ],
    2.4,
    44,
    14,
    4.2,
  );
  const rightChuteGeo = buildCascadeRibbon(
    [
      new THREE.Vector3(wfTopX + 3.4, wfTopY - 1.6, wfTopZ - 4.8),
      new THREE.Vector3(THREE.MathUtils.lerp(wfTopX, wfBotX, 0.5) + 4.4, wfTopY - 28.0, THREE.MathUtils.lerp(wfTopZ, wfBotZ, 0.5) - 6.0),
      new THREE.Vector3(wfBotX + 4.6, KESTREL_WATER_LEVEL - 0.5, wfBotZ - 5.8),
    ],
    2.2,
    44,
    14,
    4.2,
  );

  const wfUniforms = {
    uTime: sharedWeather.uTime,
    uWetness: sharedWeather.uWetness,
    uOvercast: sharedWeather.uOvercast,
  };
  const wfMat = new THREE.ShaderMaterial({
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

      float kestrelWfDisp(float uCoord, float vFlow, float normV) {
        float speed = 2.4 + uWetness * 0.7;
        float tFlow = vFlow - uTime * speed * 2.2;
        float w1 = sin(uCoord * 18.0 + tFlow * 4.4) * cos(tFlow * 2.6 + uCoord * 6.0) * 0.24;
        float w2 = sin(uCoord * 31.0 - tFlow * 7.8) * 0.11;
        float ld1 = (normV - 0.34) * 6.5;
        float ld2 = (normV - 0.66) * 6.5;
        float ledge1 = exp(-(ld1 * ld1)) * (0.65 + 0.22 * sin(uCoord * 14.0 - uTime * 9.5));
        float ledge2 = exp(-(ld2 * ld2)) * (0.72 + 0.24 * cos(uCoord * 16.0 - uTime * 11.0));
        float plunge = smoothstep(0.84, 1.0, normV) * (0.44 + 0.16 * sin(uCoord * 22.0 - uTime * 13.0));
        return (w1 + w2) * smoothstep(0.0, 0.12, normV) + ledge1 + ledge2 + plunge;
      }

      void main() {
        vUv = uv;
        vNormV = aNormV;
        float dC = kestrelWfDisp(uv.x, uv.y, aNormV);
        vSplashHeight = clamp(dC, -0.4, 1.3);
        vec3 p = position + normal * dC;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uWetness;
      uniform float uOvercast;
      varying vec2 vUv;
      varying float vNormV;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying float vSplashHeight;

      float kWfHash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }
      float kWfNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(kWfHash(i), kWfHash(i + vec2(1.0, 0.0)), u.x),
          mix(kWfHash(i + vec2(0.0, 1.0)), kWfHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      void main() {
        float speed = 2.55 + uWetness * 0.72;
        float flow = vUv.y * (1.0 + vNormV * 0.30) - uTime * speed;
        float f1 = kWfNoise(vec2(vUv.x * 16.0, flow * 4.2));
        float f2 = kWfNoise(vec2(vUv.x * 34.0 + 3.1, flow * 8.4));
        float f3 = kWfNoise(vec2(vUv.x * 64.0 - 1.7, flow * 15.2));
        float filaments = f1 * 0.46 + f2 * 0.34 + f3 * 0.20;

        float cr1 = (vNormV - 0.34) * 5.8;
        float cr2 = (vNormV - 0.66) * 5.8;
        float foam = smoothstep(0.30, 0.76, filaments + exp(-(cr1 * cr1)) * 0.56 + exp(-(cr2 * cr2)) * 0.62 + smoothstep(0.76, 1.0, vNormV) * 0.68 + clamp(vSplashHeight * 0.42, 0.0, 0.4));

        vec3 wN = normalize(vWorldNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(max(1.0 - clamp(abs(dot(wN, viewDir)), 0.0, 1.0), 1e-4), 2.3);
        vec3 deepWater = mix(vec3(0.12, 0.48, 0.56), vec3(0.22, 0.34, 0.40), uOvercast);
        vec3 aeratedFoam = mix(vec3(0.95, 0.99, 1.0), vec3(0.78, 0.84, 0.90), uOvercast * 0.55);
        vec3 col = mix(deepWater, aeratedFoam, clamp(foam + fresnel * 0.35, 0.0, 1.0));
        float edgeFade = smoothstep(0.0, 0.13, vUv.x) * (1.0 - smoothstep(0.87, 1.0, vUv.x));
        gl_FragColor = vec4(col, clamp((0.64 + foam * 0.34 + fresnel * 0.18) * edgeFade, 0.0, 0.96));
      }
    `,
  });
  group.add(
    new THREE.Mesh(mainCurtainGeo, wfMat),
    new THREE.Mesh(leftChuteGeo, wfMat),
    new THREE.Mesh(rightChuteGeo, wfMat),
  );

  // 22m Radial Lacy Foam Boil Apron at the Waterfall Plunge Basin
  const foamRingGeo = new THREE.CircleGeometry(22.0, 56);
  foamRingGeo.rotateX(-Math.PI / 2);
  const foamRingMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedWeather.uTime,
      uOvercast: sharedWeather.uOvercast,
      uFoamMap: { value: textures.waterFoamAlbedo },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime;
      uniform float uOvercast;
      uniform sampler2D uFoamMap;
      varying vec2 vUv;
      void main() {
        vec2 d = (vUv - 0.5) * 2.0;
        float r = length(d);
        if (r > 1.0) discard;
        vec2 dir = r > 0.001 ? d / r : vec2(0.0, 1.0);
        float texA = texture2D(uFoamMap, d * 1.45 - dir * (uTime * 0.38)).r;
        float texB = texture2D(uFoamMap, d * 2.35 - dir * (uTime * 0.54) + vec2(0.31, 0.67)).g;
        float froth = smoothstep(0.26, 0.78, texA * 0.6 + texB * 0.4);
        float radialMask = 1.0 - smoothstep(0.14, 1.0, r);
        float coreBoil = 1.0 - smoothstep(0.0, 0.36, r);
        float boil = clamp(froth * 0.85 + coreBoil * 0.72, 0.0, 1.0);
        vec3 col = mix(vec3(0.86, 0.96, 1.0), vec3(0.72, 0.80, 0.86), uOvercast * 0.5);
        gl_FragColor = vec4(col, clamp(radialMask * boil * 0.84, 0.0, 0.92));
      }
    `,
  });
  const foamRing = new THREE.Mesh(foamRingGeo, foamRingMat);
  foamRing.position.set(wfBotX + 2.0, KESTREL_WATER_LEVEL + 0.12, wfBotZ + 1.5);
  group.add(foamRing);

  // GPU Volumetric Mist Plume Emitter rising from the waterfall basin
  const mistCount = 220;
  const mistPos = new Float32Array(mistCount * 3);
  const mistOrigin = new Float32Array(mistCount * 3);
  const mistSeed = new Float32Array(mistCount * 3);
  for (let i = 0; i < mistCount; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = 1.5 + Math.pow(rand(), 0.75) * 14.0;
    const bx = wfBotX + 2.0 + Math.cos(ang) * rad;
    const by = KESTREL_WATER_LEVEL + 0.4 + rand() * 3.0;
    const bz = wfBotZ + 1.5 + Math.sin(ang) * rad * 0.88;
    mistPos[i * 3] = bx;
    mistPos[i * 3 + 1] = by;
    mistPos[i * 3 + 2] = bz;
    mistOrigin[i * 3] = bx;
    mistOrigin[i * 3 + 1] = by;
    mistOrigin[i * 3 + 2] = bz;
    mistSeed[i * 3] = rand();
    mistSeed[i * 3 + 1] = 0.75 + rand() * 0.55;
    mistSeed[i * 3 + 2] = 0.85 + rand() * 0.75;
  }
  const wfMistGeo = new THREE.BufferGeometry();
  wfMistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  wfMistGeo.setAttribute('aOrigin', new THREE.BufferAttribute(mistOrigin, 3));
  wfMistGeo.setAttribute('aMistSeed', new THREE.BufferAttribute(mistSeed, 3));
  const wfMistMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: sharedWeather.uTime,
      uWindSpeed: sharedWeather.uWindSpeed,
      uWindDir: sharedWeather.uWindDir,
      uOvercast: sharedWeather.uOvercast,
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
      void main() {
        float life = fract(uTime * (0.18 * aMistSeed.y) + aMistSeed.x);
        vLife = life;
        vec3 p = aOrigin;
        p.x += uWindDir.x * uWindSpeed * life * 8.0 + sin(uTime + aMistSeed.x * 6.28) * 1.4 * life;
        p.y += life * 11.0;
        p.z += uWindDir.y * uWindSpeed * life * 8.0 + cos(uTime * 0.9 + aMistSeed.x * 6.28) * 1.1 * life;
        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPos;
        float baseSize = (8.5 + life * 8.0) * aMistSeed.z;
        gl_PointSize = clamp(baseSize * (420.0 / max(-mvPos.z, 1.0)), 4.0, 108.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMistMap;
      uniform float uOvercast;
      varying float vLife;
      void main() {
        vec4 tex = texture2D(uMistMap, gl_PointCoord);
        if (tex.a < 0.02) discard;
        float env = sin(clamp(vLife, 0.0, 1.0) * 3.14159265);
        vec3 col = mix(vec3(0.92, 0.97, 1.0), vec3(0.76, 0.82, 0.88), uOvercast * 0.55);
        gl_FragColor = vec4(col, tex.a * env * 0.34);
      }
    `,
  });
  const wfMistPoints = new THREE.Points(wfMistGeo, wfMistMat);
  wfMistPoints.frustumCulled = false;
  group.add(wfMistPoints);

  return {
    group,
    terrainMesh,
    skirtMesh,
    waterMesh,
    updateWater: (elapsedSec: number) => {
      waterUniforms.uTime.value = elapsedSec;
      wfUniforms.uTime.value = elapsedSec;
    },
    updateVisibilityWindow: (
      focusPos: THREE.Vector3,
      radiusM = 600,
      camPos?: THREE.Vector3,
      camFwd?: THREE.Vector3,
    ) => {
      chunkedTerrain.updateVisibilityWindow(focusPos, radiusM, false, camPos, camFwd);
    },
    setInspectMode: (mode: InspectMode) => {
      const isWire = mode === 'wireframe';
      terrainMat.wireframe = isWire;
      skirtMat.wireframe = isWire;
      inspectUniforms.uInspectMode.value = mode === 'elevation' ? 2 : isWire ? 1 : 0;
    },
    setSurfaceLook: (look) => {
      if (look.waterChop !== undefined) {
        waterUniforms.uWaterChop.value = clamp(look.waterChop, 0, 1);
      }
      if (look.waterClarity !== undefined) {
        waterUniforms.uWaterClarity.value = clamp(look.waterClarity, 0, 1);
      }
    },
    dispose: () => {
      chunkedTerrain.dispose();
      terrainMat.dispose();
      skirtGeo.dispose();
      skirtMat.dispose();
      waterGeo.dispose();
      waterMat.dispose();
      for (const wg of wfGeos) wg.dispose();
      wetRockMat.dispose();
      wfMossMat.dispose();
      wfMat.dispose();
      foamRingGeo.dispose();
      foamRingMat.dispose();
      wfMistGeo.dispose();
      wfMistMat.dispose();
    },
  };
}
