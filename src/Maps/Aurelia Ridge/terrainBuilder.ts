import * as THREE from 'three';
import {
  createCircuitQueryScratch,
  getCircuitData,
  getCustomBlueprint,
  WATER_LEVEL,
} from './circuitSpline';
import { TERRAIN_MATERIAL_MAP } from '../../engine/customMapBuilder';
import { clamp, fbm2D, smoothstep } from '../../engine/mathNoise';
import type { CustomMapBlueprint } from '../../shared/socialTypes';
import { ProceduralTextureSuite } from './proceduralTextures';
import { type WeatherUniforms } from './skyAndLighting';
import { groundHeightAt, groundNormalAt } from './terrainField';
import { buildChunkedTerrainTiles } from '../sharedTerrainChunker';

export type InspectMode = 'lit' | 'wireframe' | 'elevation';

export interface MistUniforms {
  uMistColor: { value: THREE.Color };
  uMistStrength: { value: number };
}

export interface TerrainRig {
  group: THREE.Group;
  terrainMesh: THREE.Mesh;
  skirtMesh: THREE.Mesh;
  waterMesh: THREE.Mesh;
  updateWater: (elapsedSec: number) => void;
  updateVisibilityWindow?: (
    focusPos: THREE.Vector3,
    radiusM?: number,
    camPos?: THREE.Vector3,
    camFwd?: THREE.Vector3,
  ) => void;
  setInspectMode: (mode: InspectMode) => void;
  setSurfaceLook?: (look: {
    waterChop?: number;
    waterClarity?: number;
    snowSheen?: number;
  }) => void;
  updateCustomTerrainLook?: (bp: CustomMapBlueprint) => void;
  dispose: () => void;
}

/**
 * Builds the 400×400 geological terrain heightmap mesh with anti-tiling multi-scale PBR
 * & height-stratified valley mist, distant mountain horizon skirt, and Beer-Lambert
 * optical depth alpine gorge lake water with shoreline foam.
 */
export function buildTerrainRig(
  textures: ProceduralTextureSuite,
  mistUniforms?: MistUniforms,
  isSoftwareGl = false,
  weatherUniforms?: WeatherUniforms,
): TerrainRig {
  const customBp = getCustomBlueprint();
  if (customBp && customBp.templateId !== 'aurelia_remix') {
    return buildBaseplateTerrainRig(customBp, isSoftwareGl);
  }

  const group = new THREE.Group();
  group.name = 'TerrainRig';

  const circuit = getCircuitData();
  const roadHalf = circuit.roadHalfWidth;
  const terrainSize = 1120;
  const segments = isSoftwareGl ? 160 : 208;
  const geo = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const count = posAttr.count;
  const stride = segments + 1;
  const colors = new Float32Array(count * 3);
  const rockWeights = new Float32Array(count);
  const screeWeights = new Float32Array(count);
  const cavityAO = new Float32Array(count);
  const roadDists = new Float32Array(count);

  const qClampScratch = createCircuitQueryScratch();
  const clampCellReach = (terrainSize / segments) * 0.85;
  const clampBand = roadHalf + 1.75 + clampCellReach;
  const nCircuitSamples = circuit.samples.length;
  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    let y = groundHeightAt(x, z);
    const gq = circuit.queryNearestGroundTrackInto(x, z, qClampScratch);
    if (gq.absDistance <= clampBand) {
      const sIdx = gq.sample.index;
      let minLocalY = gq.centerPos.y + gq.right.y * clamp(gq.signedLateral, -roadHalf - 2.2, roadHalf + 2.2);
      for (let off = -3; off <= 3; off++) {
        if (off === 0) continue;
        const j = circuit.closedLoop
          ? ((sIdx + off) % nCircuitSamples + nCircuitSamples) % nCircuitSamples
          : clamp(sIdx + off, 0, nCircuitSamples - 1);
        const sj = circuit.samples[j];
        if (sj.isBridge) continue;
        const latJ = (x - sj.position.x) * sj.right.x + (z - sj.position.z) * sj.right.z;
        const cy = sj.position.y + sj.right.y * clamp(latJ, -roadHalf - 2.2, roadHalf + 2.2);
        if (cy < minLocalY) minLocalY = cy;
      }
      const inTun = gq.sample.isTunnel || gq.nextSample.isTunnel;
      y = Math.min(y, minLocalY - (inTun ? 0.72 : 0.56));
    }
    posAttr.setY(i, y);
  }
  geo.computeVertexNormals();

  const normAttr = geo.attributes.normal as THREE.BufferAttribute;

  const colGrassLush = new THREE.Color(0x4a6636);
  const colGrassWarm = new THREE.Color(0x818649);
  const colLimestone = new THREE.Color(0xa98e6b);
  const colCliffDark = new THREE.Color(0x5b4d3f);
  const colScree = new THREE.Color(0x887d6d);
  const colMoss = new THREE.Color(0x36522e);
  const colShoreSand = new THREE.Color(0xb8a381);
  const colWetBed = new THREE.Color(0x2c3934);
  const tmpCol = new THREE.Color();
  const cCliffTmp = new THREE.Color();
  const qScratch = createCircuitQueryScratch();

  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const i = row * stride + col;
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const ny = clamp(normAttr.getY(i), 0, 1);
      const slope = 1 - ny;
      const q = circuit.queryNearestInto(x, z, qScratch);
      roadDists[i] = q.isBridge ? 120.0 : Math.max(0.0, q.absDistance - roadHalf);

      // Neighbor Laplacian curvature -> natural gully/crevice ambient occlusion
      const rM = Math.max(0, row - 1);
      const rP = Math.min(segments, row + 1);
      const cM = Math.max(0, col - 1);
      const cP = Math.min(segments, col + 1);
      const avgNeighborY =
        (posAttr.getY(rM * stride + col) +
          posAttr.getY(rP * stride + col) +
          posAttr.getY(row * stride + cM) +
          posAttr.getY(row * stride + cP)) *
        0.25;
      const curvature = y - avgNeighborY;
      cavityAO[i] = clamp(0.86 + curvature * 0.65, 0.42, 1.12);

      const patch = fbm2D(x * 0.015, z * 0.015, 3, 2.0, 0.5, 515) * 0.5 + 0.5;
      const microVar = fbm2D(x * 0.055, z * 0.055, 2, 2.0, 0.5, 911) * 0.14;
      const rockFactor = smoothstep(0.085, 0.27, slope + smoothstep(42, 78, y) * 0.14 + microVar * 0.35);
      const screeFactor =
        smoothstep(0.05, 0.14, slope) * (1 - smoothstep(0.22, 0.36, slope)) * smoothstep(20, 56, y);
      rockWeights[i] = rockFactor;
      screeWeights[i] = screeFactor;

      // Base Mediterranean-alpine meadow tint
      tmpCol.copy(colGrassLush).lerp(colGrassWarm, clamp(patch + microVar, 0, 1));

      // Talus gravel scree apron
      tmpCol.lerp(colScree, screeFactor * 0.68);

      // Stratified limestone on steep ridges and cliff walls
      cCliffTmp.copy(colLimestone).lerp(colCliffDark, smoothstep(0.16, 0.46, slope));
      tmpCol.lerp(cCliffTmp, rockFactor);

      // Lush damp moss around the bridge waterfall gorge
      const wfDist = Math.hypot(x - 46, z + 42);
      const gorgeMoss = (1 - smoothstep(10, 32, wfDist)) * smoothstep(WATER_LEVEL + 0.2, WATER_LEVEL + 16, y);
      tmpCol.lerp(colMoss, gorgeMoss * (1 - rockFactor * 0.55) * 0.72);

      // Wet shoreline pebbles & submerged gorge lake bed
      const shoreMask = 1 - smoothstep(WATER_LEVEL + 0.35, WATER_LEVEL + 3.2, y);
      tmpCol.lerp(colShoreSand, shoreMask * 0.85);
      const submergedMask = 1 - smoothstep(WATER_LEVEL - 3.6, WATER_LEVEL + 0.35, y);
      tmpCol.lerp(colWetBed, submergedMask * 0.92);

      // Blend Studio terrain material stamps on Aurelia Remix
      if (customBp?.terrainMaterialStamps && customBp.terrainMaterialStamps.length > 0) {
        const stamps = customBp.terrainMaterialStamps;
        for (let si = 0; si < stamps.length; si++) {
          const st = stamps[si];
          const d = Math.hypot(x - st.x, z - st.z);
          if (d < st.radius) {
            const w = (1 - smoothstep(st.radius * 0.3, st.radius, d)) * clamp(st.strength ?? 0.9, 0.15, 1);
            const matDef = TERRAIN_MATERIAL_MAP[st.material] ?? TERRAIN_MATERIAL_MAP.grass;
            const paintCol = new THREE.Color(st.colorHex && /^#[0-9a-fA-F]{6}$/.test(st.colorHex) ? st.colorHex : matDef.hex);
            tmpCol.lerp(paintCol, w * 0.88);
          }
        }
      }

      colors[i * 3] = tmpCol.r;
      colors[i * 3 + 1] = tmpCol.g;
      colors[i * 3 + 2] = tmpCol.b;
    }
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aRockWeight', new THREE.BufferAttribute(rockWeights, 1));
  geo.setAttribute('aScreeWeight', new THREE.BufferAttribute(screeWeights, 1));
  geo.setAttribute('aCavityAO', new THREE.BufferAttribute(cavityAO, 1));
  geo.setAttribute('aRoadDist', new THREE.BufferAttribute(roadDists, 1));

  const sharedMist: MistUniforms = mistUniforms ?? {
    uMistColor: { value: new THREE.Color(0xe4ae78) },
    uMistStrength: { value: 0.32 },
  };
  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };

  const inspectUniforms = {
    uInspectMode: { value: 0 },
    uGrassNormalMap: { value: textures.terrainGrassNormal },
    uGrassRoughMap: { value: textures.terrainGrassRoughness },
    uRockMap: { value: textures.terrainRockAlbedo },
    uRockNormalMap: { value: textures.terrainRockNormal },
    uRockRoughMap: { value: textures.terrainRockRoughness },
    uRockORM: { value: textures.terrainRockORM },
    uDetailMap: { value: textures.terrainDetailMap },
    uDetailNormal: { value: textures.terrainDetailNormal },
    uGravelMap: { value: textures.gravelAlbedo },
    uWaterLevel: { value: WATER_LEVEL },
    uMistColor: sharedMist.uMistColor,
    uMistStrength: sharedMist.uMistStrength,
    uWetness: sharedWeather.uWetness,
  };

  const terrainMat = new THREE.MeshStandardMaterial({
    map: textures.terrainGrassAlbedo,
    normalMap: textures.terrainGrassNormal,
    normalScale: new THREE.Vector2(1.18, 1.18),
    roughnessMap: textures.terrainGrassRoughness,
    vertexColors: true,
    roughness: 1.0,
    metalness: 0.02,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uInspectMode = inspectUniforms.uInspectMode;
    shader.uniforms.uGrassNormalMap = inspectUniforms.uGrassNormalMap;
    shader.uniforms.uGrassRoughMap = inspectUniforms.uGrassRoughMap;
    shader.uniforms.uRockMap = inspectUniforms.uRockMap;
    shader.uniforms.uRockNormalMap = inspectUniforms.uRockNormalMap;
    shader.uniforms.uRockRoughMap = inspectUniforms.uRockRoughMap;
    shader.uniforms.uRockORM = inspectUniforms.uRockORM;
    shader.uniforms.uDetailMap = inspectUniforms.uDetailMap;
    shader.uniforms.uDetailNormal = inspectUniforms.uDetailNormal;
    shader.uniforms.uGravelMap = inspectUniforms.uGravelMap;
    shader.uniforms.uWaterLevel = inspectUniforms.uWaterLevel;
    shader.uniforms.uMistColor = inspectUniforms.uMistColor;
    shader.uniforms.uMistStrength = inspectUniforms.uMistStrength;
    shader.uniforms.uWetness = inspectUniforms.uWetness;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aRockWeight;
        attribute float aScreeWeight;
        attribute float aCavityAO;
        attribute float aRoadDist;
        varying float vRockWeight;
        varying float vScreeWeight;
        varying float vCavityAO;
        varying float vRoadDist;
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNorm;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vRockWeight = aRockWeight;
        vScreeWeight = aScreeWeight;
        vCavityAO = aCavityAO;
        vRoadDist = aRoadDist;
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorldNorm = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uInspectMode;
        uniform sampler2D uGrassNormalMap;
        uniform sampler2D uGrassRoughMap;
        uniform sampler2D uRockMap;
        uniform sampler2D uRockNormalMap;
        uniform sampler2D uRockRoughMap;
        uniform sampler2D uRockORM;
        uniform sampler2D uDetailMap;
        uniform sampler2D uDetailNormal;
        uniform sampler2D uGravelMap;
        uniform float uWaterLevel;
        uniform vec3 uMistColor;
        uniform float uMistStrength;
        uniform float uWetness;
        varying float vRockWeight;
        varying float vScreeWeight;
        varying float vCavityAO;
        varying float vRoadDist;
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNorm;

        vec3 sampleTriplanar(sampler2D tex, vec3 wp, vec3 w) {
          vec3 acc = vec3(0.0);
          if (w.x > 0.015) acc += texture2D(tex, wp.zy).rgb * w.x;
          if (w.y > 0.015) acc += texture2D(tex, wp.xz).rgb * w.y;
          if (w.z > 0.015) acc += texture2D(tex, wp.xy).rgb * w.z;
          return acc;
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `float triRockBlend = clamp(vRockWeight, 0.0, 1.0);
        float wnLen = length(vTerrainWorldNorm);
        vec3 safeWNorm = wnLen > 1e-5 ? (vTerrainWorldNorm / wnLen) : vec3(0.0, 1.0, 0.0);
        vec3 absN = abs(safeWNorm);
        vec3 n2 = absN * absN;
        vec3 triW = n2 * n2;
        triW /= max(triW.x + triW.y + triW.z, 0.0001);
        #ifdef USE_MAP
          // Anti-tiling dual-scale rotated 4K meadow lookup
          mat2 uvRot = mat2(0.8, -0.6, 0.6, 0.8);
          vec2 uvMacro = uvRot * (vMapUv * 0.27);
          float macroBreak = 0.5 + 0.5 * sin(vTerrainWorldPos.x * 0.032 + cos(vTerrainWorldPos.z * 0.028) * 1.6);

          vec4 grassDetail = texture2D( map, vMapUv );
          vec4 grassMacro = texture2D( map, uvMacro );
          vec4 grassSample = mix( grassDetail, grassMacro, 0.44 * macroBreak );

          // Dual-scale world-space Triplanar projection for limestone strata + packed ORM crevice AO & quartz glints
          vec3 rockCoarse = sampleTriplanar(uRockMap, vTerrainWorldPos * 0.042, triW);
          vec3 rockFine = sampleTriplanar(uRockMap, vTerrainWorldPos * 0.145, triW);
          vec3 rockOrmTri = sampleTriplanar(uRockORM, vTerrainWorldPos * 0.048, triW);
          vec3 rockTri = rockCoarse * 0.58 + rockFine * 0.42;
          float detMacro = sampleTriplanar(uDetailMap, vTerrainWorldPos * 0.062, triW).r;
          float detMicro = sampleTriplanar(uDetailMap, vTerrainWorldPos * 0.26, triW).r;
          float detailFactor = mix(detMacro, detMicro, 0.58);

          // Sedimentary limestone horizontal bedding strata contrast + fracture crevices + mineral glints
          float strataBand = 0.82 + 0.28 * sin(vTerrainWorldPos.y * 1.55 + detMacro * 2.1 + sin(vTerrainWorldPos.x * 0.075 + vTerrainWorldPos.z * 0.075) * 1.9);
          rockTri *= strataBand * (0.76 + detailFactor * 0.48) * mix(0.75, 1.08, rockOrmTri.r);
          rockTri += vec3(0.055, 0.054, 0.048) * smoothstep(0.72, 0.96, rockOrmTri.b);

          // Height-modulated organic vegetation-to-limestone transition mask
          triRockBlend = smoothstep(0.24, 0.72, clamp(vRockWeight, 0.0, 1.0) + (rockCoarse.r - 0.5) * 0.34);

          // Loose talus gravel scree blend + crisp roadside crushed gravel verge
          vec4 screeSample = texture2D( uGravelMap, vTerrainWorldPos.xz * 0.14 );
          vec4 meadowPlusScree = mix( grassSample * (0.86 + detMicro * 0.28), screeSample, clamp(vScreeWeight * 0.72, 0.0, 1.0) );
          vec4 blendedTex = mix( meadowPlusScree, vec4(rockTri, 1.0), triRockBlend );

          float vergeMask = (1.0 - smoothstep(1.8, 6.4, vRoadDist)) * smoothstep(0.45, 0.78, safeWNorm.y);
          vec3 vergeGravel = texture2D(uGravelMap, vTerrainWorldPos.xz * 0.24).rgb * (0.80 + detMicro * 0.42);
          blendedTex.rgb = mix(blendedTex.rgb, vergeGravel, clamp(vergeMask * 0.72, 0.0, 0.76));

          diffuseColor *= blendedTex;
          diffuseColor.rgb *= clamp(vCavityAO, 0.46, 1.12);

          // Seamless wet shoreline + waterfall gorge spray-zone darkening, moss enrichment & slick stone sheen
          float shoreJitter = 0.25 * sin(vTerrainWorldPos.x * 0.28 + vTerrainWorldPos.z * 0.22);
          float wfSprayDist = length(vTerrainWorldPos.xz - vec2(47.5, -31.0));
          float wfWet = (1.0 - smoothstep(8.0, 34.0, wfSprayDist)) * (1.0 - smoothstep(10.0, 26.0, vTerrainWorldPos.y));
          float capillaryShore = 1.0 - smoothstep(uWaterLevel - 0.4, uWaterLevel + 1.45 + shoreJitter, vTerrainWorldPos.y);
          float wetBand = clamp(max(capillaryShore, wfWet * 0.92), 0.0, 1.0);
          float dampMossBand = clamp(wfWet * 0.85 + capillaryShore * 0.35, 0.0, 1.0) * smoothstep(uWaterLevel + 0.05, uWaterLevel + 1.8, vTerrainWorldPos.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.46, 0.58, 0.44), dampMossBand * 0.55);
          diffuseColor.rgb *= mix(1.0, 0.48, wetBand);
          diffuseColor.rgb *= mix(1.0, mix(0.56, 0.68, triRockBlend), uWetness);
        #endif
        if (uInspectMode > 1.5) {
          float hNorm = clamp((vTerrainWorldPos.y + 14.0) / 85.0, 0.0, 1.0);
          vec3 lowC = vec3(0.08, 0.32, 0.45);
          vec3 midC = vec3(0.22, 0.65, 0.42);
          vec3 highC = vec3(0.94, 0.64, 0.16);
          vec3 elevCol = hNorm < 0.5
            ? mix(lowC, midC, hNorm * 2.0)
            : mix(midC, highC, (hNorm - 0.5) * 2.0);
          float contour = 1.0 - smoothstep(0.0, 0.08, abs(fract(vTerrainWorldPos.y * 0.25) - 0.5));
          diffuseColor.rgb = mix(elevCol, vec3(0.98), contour * 0.45);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        #ifdef USE_MAP
        float rockOrmG = rockOrmTri.g;
        #else
        float rockOrmG = sampleTriplanar(uRockORM, vTerrainWorldPos * 0.048, triW).g;
        #endif
        float rockRoughTri = mix(dot(sampleTriplanar(uRockRoughMap, vTerrainWorldPos * 0.042, triW), vec3(0.3333)), rockOrmG, 0.52);
        roughnessFactor = mix(roughnessFactor, rockRoughTri, triRockBlend);
        float shoreJitterR = 0.25 * sin(vTerrainWorldPos.x * 0.28 + vTerrainWorldPos.z * 0.22);
        float wfSprayR = (1.0 - smoothstep(8.0, 34.0, length(vTerrainWorldPos.xz - vec2(47.5, -31.0)))) * (1.0 - smoothstep(10.0, 26.0, vTerrainWorldPos.y));
        float wetRoughMask = clamp(max(1.0 - smoothstep(uWaterLevel - 0.35, uWaterLevel + 1.35 + shoreJitterR, vTerrainWorldPos.y), wfSprayR), 0.0, 1.0);
        roughnessFactor = mix(roughnessFactor, 0.14, wetRoughMask * 0.94);
        roughnessFactor = mix(roughnessFactor, mix(0.44, 0.18, triRockBlend), uWetness * 0.9);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // True world-space Triplanar cliff + roadside detail normal perturbation projected into view space
        float roadDetailW = 1.0 - smoothstep(2.0, 30.0, vRoadDist);
        float detailWeightN = 0.40 + roadDetailW * 0.50;
        vec3 rnx = triW.x > 0.015 ? (texture2D(uRockNormalMap, vTerrainWorldPos.zy * 0.048).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 rny = triW.y > 0.015 ? (texture2D(uRockNormalMap, vTerrainWorldPos.xz * 0.048).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 rnz = triW.z > 0.015 ? (texture2D(uRockNormalMap, vTerrainWorldPos.xy * 0.048).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 dnx = triW.x > 0.015 ? (texture2D(uDetailNormal, vTerrainWorldPos.zy * 0.22).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 dny = triW.y > 0.015 ? (texture2D(uDetailNormal, vTerrainWorldPos.xz * 0.22).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 dnz = triW.z > 0.015 ? (texture2D(uDetailNormal, vTerrainWorldPos.xy * 0.22).xyz * 2.0 - 1.0) : vec3(0.0, 0.0, 1.0);
        vec3 cnx = rnx * 0.85 + dnx * detailWeightN;
        vec3 cny = rny * 0.85 + dny * detailWeightN;
        vec3 cnz = rnz * 0.85 + dnz * detailWeightN;
        float wNormLenN = length(vTerrainWorldNorm);
        vec3 wNorm = wNormLenN > 1e-5 ? (vTerrainWorldNorm / wNormLenN) : vec3(0.0, 1.0, 0.0);
        vec3 triSign = sign(wNorm);
        vec3 wPerturb =
          vec3(0.0, cnx.y, cnx.x * triSign.x) * triW.x +
          vec3(cny.x, 0.0, cny.y * triSign.y) * triW.y +
          vec3(cnz.x * triSign.z, cnz.y, 0.0) * triW.z;
        vec3 rawCliffN = normal + (viewMatrix * vec4(wPerturb * 0.95, 0.0)).xyz;
        float rcLen = length(rawCliffN);
        vec3 viewCliffNorm = rcLen > 1e-5 ? (rawCliffN / rcLen) : vec3(0.0, 0.0, 1.0);
        vec3 mixedCliffN = mix(normal, viewCliffNorm, max(triRockBlend, roadDetailW * 0.62));
        float mcLen = length(mixedCliffN);
        normal = mcLen > 1e-5 ? (mixedCliffN / mcLen) : vec3(0.0, 0.0, 1.0);`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        if (uInspectMode < 0.5) {
          float distToCam = length(cameraPosition - vTerrainWorldPos);
          float gorgeMistH = 1.0 - smoothstep(uWaterLevel - 2.0, uWaterLevel + 18.0, vTerrainWorldPos.y);
          float mistDist = smoothstep(95.0, 390.0, distToCam);
          float mistMix = clamp(gorgeMistH * mistDist * uMistStrength * 0.85, 0.0, 0.58);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, mistMix);
        }`,
      );
  };
  terrainMat.customProgramCacheKey = () => 'aurelia-terrain-triplanar-pbr-4k-v7';

  const chunkedTerrain = buildChunkedTerrainTiles(geo, terrainMat, terrainSize, segments, {
    chunkSizeM: 250,
    receiveShadow: true,
    castShadow: false,
    name: 'AureliaChunkedTerrain',
  });
  const terrainMesh = chunkedTerrain.primaryMesh;
  group.add(chunkedTerrain.group);

  // ---------------------------------------------------------------------------
  // Distant Mountain Horizon Skirt (1120m -> 2600m)
  // ---------------------------------------------------------------------------
  const skirtGeo = new THREE.RingGeometry(530, 1450, 96, 12);
  skirtGeo.rotateX(-Math.PI / 2);
  const sPos = skirtGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sPos.count; i++) {
    const x = sPos.getX(i);
    const z = sPos.getZ(i);
    const r = Math.hypot(x, z);
    const blendInner = 1 - smoothstep(535, 650, r);
    const innerH = groundHeightAt(clamp(x, -540, 540), clamp(z, -540, 540));
    const outerPeak =
      62 +
      fbm2D(x * 0.0018, z * 0.0018, 4, 2.1, 0.52, 303) * 58 +
      smoothstep(700, 1350, r) * 55;
    sPos.setY(i, innerH * blendInner + outerPeak * (1 - blendInner) - 0.6);
  }
  skirtGeo.computeVertexNormals();
  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0x6f685a,
    roughness: 0.95,
    metalness: 0.0,
  });
  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
  skirtMesh.receiveShadow = false;
  skirtMesh.castShadow = false;
  group.add(skirtMesh);

  // ---------------------------------------------------------------------------
  // Optical Beer-Lambert Alpine Gorge Lake Water + Shoreline Foam + Rain Ripples
  // ---------------------------------------------------------------------------
  const waterSegs = isSoftwareGl ? 64 : 96;
  const waterGeo = new THREE.PlaneGeometry(560, 480, waterSegs, waterSegs);
  waterGeo.rotateX(-Math.PI / 2);

  const waterCenterX = 65;
  const waterCenterZ = 4;
  const wPos = waterGeo.attributes.position as THREE.BufferAttribute;
  const waterDepths = new Float32Array(wPos.count);
  for (let i = 0; i < wPos.count; i++) {
    const wx = wPos.getX(i) + waterCenterX;
    const wz = wPos.getZ(i) + waterCenterZ;
    const bedH = groundHeightAt(wx, wz);
    waterDepths[i] = Math.max(0, WATER_LEVEL - bedH);
  }
  waterGeo.setAttribute('aWaterDepth', new THREE.BufferAttribute(waterDepths, 1));

  const waterUniforms = {
    uTime: { value: 0 },
    uMistColor: sharedMist.uMistColor,
    uMistStrength: sharedMist.uMistStrength,
    uWetness: sharedWeather.uWetness,
    uFoamMap: { value: textures.waterFoamAlbedo },
    uWaterfallImpact: { value: new THREE.Vector2(48.0, -24.5) },
    uWaterChop: { value: 0.45 },
    uWaterClarity: { value: 0.65 },
  };

  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x165e63,
    roughness: 0.055,
    metalness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    reflectivity: 0.98,
    envMapIntensity: 1.35,
    transparent: true,
    depthWrite: false,
    opacity: 0.94,
  });

  waterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterUniforms.uTime;
    shader.uniforms.uMistColor = waterUniforms.uMistColor;
    shader.uniforms.uMistStrength = waterUniforms.uMistStrength;
    shader.uniforms.uWetness = waterUniforms.uWetness;
    shader.uniforms.uFoamMap = waterUniforms.uFoamMap;
    shader.uniforms.uWaterfallImpact = waterUniforms.uWaterfallImpact;
    shader.uniforms.uWaterChop = waterUniforms.uWaterChop;
    shader.uniforms.uWaterClarity = waterUniforms.uWaterClarity;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec2 uWaterfallImpact;
        uniform float uWaterChop;
        attribute float aWaterDepth;
        varying vec3 vWaterWorldPos;
        varying float vWaterDepth;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vWaterDepth = aWaterDepth;
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        float swellDamp = clamp(aWaterDepth * 0.45, 0.15, 1.0);
        float chopScale = mix(0.35, 1.95, clamp(uWaterChop, 0.0, 1.0));
        float w1 = sin(wp.x * 0.19 + uTime * 1.15) * cos(wp.z * 0.16 - uTime * 0.85) * 0.055;
        float w2 = sin((wp.x + wp.z) * 0.36 - uTime * 1.55) * 0.025;
        // Subtle radial concentric swells radiating from the waterfall impact zone
        float wfR = length(wp.xz - uWaterfallImpact);
        float wfZone = exp(-wfR * 0.042) * clamp(aWaterDepth * 0.65, 0.1, 1.0);
        float wfSwell = sin(wfR * 1.55 - uTime * 4.2) * 0.042 * wfZone;
        transformed.y += (w1 + w2) * swellDamp * chopScale + wfSwell;
        vWaterWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uMistColor;
        uniform float uMistStrength;
        uniform float uWetness;
        uniform sampler2D uFoamMap;
        uniform vec2 uWaterfallImpact;
        uniform float uWaterChop;
        uniform float uWaterClarity;
        varying vec3 vWaterWorldPos;
        varying float vWaterDepth;

        vec2 lakeHash22(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.xx + p3.yz) * p3.zy);
        }
        vec2 lakeRainLayer(vec2 uv, float t) {
          vec2 cell = floor(uv);
          vec2 f = fract(uv);
          vec2 rnd = lakeHash22(cell);
          float age = fract(t * (1.2 + rnd.x * 0.6) + rnd.y);
          vec2 center = 0.25 + 0.5 * rnd;
          vec2 d = f - center;
          float dist = length(d) + 0.0001;
          float rad = age * 0.44;
          float rDiff = (dist - rad) * 20.0;
          float ring = exp(-(rDiff * rDiff)) * (1.0 - age) * sin((dist - rad) * 44.0);
          return (d / dist) * ring;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Beer-Lambert optical water depth transition (shallow limestone -> turquoise -> deep emerald)
        float clarity = clamp(uWaterClarity, 0.0, 1.0);
        float absorbRate = mix(0.85, 0.24, clarity);
        float absorb = 1.0 - exp(-vWaterDepth * absorbRate);
        vec3 shallowTint = vec3(0.26, 0.38, 0.32);
        vec3 midTint = mix(vec3(0.08, 0.24, 0.26), vec3(0.06, 0.34, 0.36), clarity);
        vec3 deepTint = vec3(0.02, 0.11, 0.15);
        vec3 waterBody = mix(shallowTint, midTint, smoothstep(0.0, mix(1.4, 3.0, clarity), vWaterDepth));
        waterBody = mix(waterBody, deepTint, smoothstep(2.0, mix(5.5, 9.5, clarity), vWaterDepth));

        // Gentle animated shoreline foam where depth < 0.72m
        float shoreWave = sin(vWaterWorldPos.x * 0.65 + vWaterWorldPos.z * 0.55 - uTime * 2.2) * 0.5 + 0.5;
        float foamEdge = (1.0 - smoothstep(0.04, 0.72, vWaterDepth)) * step(0.005, vWaterDepth);
        float foamPattern = smoothstep(0.32, 0.85, shoreWave) * foamEdge;

        // Dynamic radially-advected procedural lacy foam drifting across the lake from the waterfall impact zone
        vec2 wfDelta = vWaterWorldPos.xz - uWaterfallImpact;
        float wfDist = length(wfDelta);
        vec2 wfDir = wfDelta / max(wfDist, 0.001);
        vec2 foamUv1 = vWaterWorldPos.xz * 0.052 - wfDir * (uTime * 0.15);
        vec2 foamUv2 = vWaterWorldPos.xz * 0.105 - wfDir * (uTime * 0.24) + vec2(0.37, 0.71);
        float foamTex1 = texture2D(uFoamMap, foamUv1).r;
        float foamTex2 = texture2D(uFoamMap, foamUv2).g;
        float lacyFoam = smoothstep(0.36, 0.82, foamTex1 * 0.62 + foamTex2 * 0.38);
        float wfFoamReach = exp(-wfDist * 0.052) * (1.0 - smoothstep(28.0, 54.0, wfDist));
        float wfBoilCore = exp(-wfDist * 0.14);
        float wfFoam = clamp(lacyFoam * wfFoamReach * (1.18 + uWetness * 0.4) + wfBoilCore * 0.48, 0.0, 0.9);
        float combinedFoam = clamp(max(foamPattern * 0.72, wfFoam), 0.0, 0.92);

        vec3 foamTint = mix(vec3(0.86, 0.91, 0.94), vec3(0.96, 0.99, 1.0), wfFoam);
        vec3 viewW = normalize(cameraPosition - vWaterWorldPos);
        float fresnelSky = pow(max(1.0 - clamp(abs(viewW.y), 0.0, 1.0), 1e-4), 3.1);
        vec3 lakeSkyBounce = mix(uMistColor, vec3(0.92, 0.84, 0.70), 0.30);
        vec3 reflectedWater = mix(waterBody, lakeSkyBounce, clamp(fresnelSky * 0.62, 0.0, 0.64));
        diffuseColor.rgb = mix(reflectedWater, foamTint, combinedFoam);
        diffuseColor.a = clamp(0.28 + absorb * 0.68 + combinedFoam * 0.38, 0.24, 0.98);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        // Aerated waterfall foam & shore froth soften specular mirror into frothy sheen
        vec2 wfDeltaR = vWaterWorldPos.xz - uWaterfallImpact;
        float wfDistR = length(wfDeltaR);
        float wfFoamMaskR = exp(-wfDistR * 0.065) * (1.0 - smoothstep(24.0, 48.0, wfDistR));
        roughnessFactor = clamp(roughnessFactor + wfFoamMaskR * 0.24, 0.04, 0.65);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float rx = cos(vWaterWorldPos.x * 0.75 + uTime * 1.55) * 0.055 + cos(vWaterWorldPos.z * 1.25 - uTime * 2.0) * 0.032 + cos((vWaterWorldPos.x + vWaterWorldPos.z) * 2.4 + uTime * 2.7) * 0.018;
        float rz = sin(vWaterWorldPos.z * 0.88 - uTime * 1.35) * 0.055 + sin((vWaterWorldPos.x - vWaterWorldPos.z) * 1.1 + uTime * 1.65) * 0.032 + sin((vWaterWorldPos.x - vWaterWorldPos.z) * 2.6 - uTime * 2.4) * 0.018;

        // Subtle dynamic ripples radiating outward from the waterfall impact zone
        vec2 wfD = vWaterWorldPos.xz - uWaterfallImpact;
        float wfR = length(wfD);
        vec2 wfRadialDir = wfD / max(wfR, 0.001);
        float wfAngle = atan(wfD.y, wfD.x);
        float wfRippleEnv = exp(-wfR * 0.034) * (1.0 - smoothstep(46.0, 82.0, wfR));
        float wPhase1 = wfR * 2.15 - uTime * 4.5 + sin(wfAngle * 4.0 + uTime * 0.75) * 0.65;
        float wPhase2 = wfR * 3.85 - uTime * 6.9 + cos(wfAngle * 7.0 - uTime * 1.1) * 0.45;
        float wfSlope = (cos(wPhase1) * 0.072 + cos(wPhase2) * 0.038) * wfRippleEnv;
        vec3 wfRippleView = (viewMatrix * vec4(wfRadialDir.x * wfSlope, 0.0, wfRadialDir.y * wfSlope, 0.0)).xyz;

        float chopNormScale = mix(0.45, 1.85, clamp(uWaterChop, 0.0, 1.0));
        vec3 baseWavePerturb = vec3(rx, 0.0, rz) * chopNormScale + wfRippleView;
        if (uWetness > 0.05) {
          vec2 rainImp = lakeRainLayer(vWaterWorldPos.xz * 0.85, uTime) + lakeRainLayer(vWaterWorldPos.xz * 1.45 + vec2(3.7, -2.1), uTime * 1.12);
          vec3 viewRain = (viewMatrix * vec4(rainImp.x, 0.0, rainImp.y, 0.0)).xyz;
          normal = normalize(normal + baseWavePerturb + viewRain * 0.14 * uWetness);
        } else {
          normal = normalize(normal + baseWavePerturb);
        }`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        float distCamW = length(cameraPosition - vWaterWorldPos);
        float lakeMist = clamp(smoothstep(45.0, 320.0, distCamW) * uMistStrength * 0.78, 0.0, 0.62);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, lakeMist);`,
      );
  };
  waterMat.customProgramCacheKey = () => 'aurelia-lake-water-v6-fresnel-sky';

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.set(waterCenterX, WATER_LEVEL, waterCenterZ);
  waterMesh.receiveShadow = true;
  waterMesh.renderOrder = 1;
  group.add(waterMesh);

  void groundNormalAt;

  return {
    group,
    terrainMesh,
    skirtMesh,
    waterMesh,
    updateWater: (elapsedSec: number) => {
      waterUniforms.uTime.value = elapsedSec;
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
    },
  };
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 6 ? clean : '3b6e32', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildBaseplateTerrainRig(
  customBp: NonNullable<ReturnType<typeof getCustomBlueprint>>,
  isSoftwareGl: boolean,
): TerrainRig {
  const group = new THREE.Group();
  group.name = 'StudioBaseplateTerrainRig';

  const baseplateSize = 1800;
  const halfSize = baseplateSize * 0.5;
  const hasStamps = customBp.terrainStamps.length > 0;
  const segs = isSoftwareGl ? (hasStamps ? 120 : 80) : hasStamps ? 192 : 128;
  const geo = new THREE.PlaneGeometry(baseplateSize, baseplateSize, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, groundHeightAt(x, z));
  }
  geo.computeVertexNormals();

  const texSize = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = texSize;
  canvas.height = texSize;
  const ctx = canvas.getContext('2d');

  const baseTex = new THREE.CanvasTexture(canvas);
  baseTex.colorSpace = THREE.SRGBColorSpace;
  baseTex.wrapS = THREE.ClampToEdgeWrapping;
  baseTex.wrapT = THREE.ClampToEdgeWrapping;
  baseTex.anisotropy = isSoftwareGl ? 1 : 8;

  const redrawCanvas = (bp: CustomMapBlueprint) => {
    if (!ctx) return;
    const theme = bp.baseplateTheme ?? 'studio_grid';
    const tilePx = (40 / baseplateSize) * texSize; // 40m per Studio grid cell

    if (theme === 'asphalt_pad') {
      ctx.fillStyle = '#202630';
      ctx.fillRect(0, 0, texSize, texSize);
      ctx.strokeStyle = 'rgba(148,163,184,0.14)';
      ctx.lineWidth = 1;
      for (let g = 0; g <= texSize; g += tilePx) {
        ctx.beginPath();
        ctx.moveTo(g, 0);
        ctx.lineTo(g, texSize);
        ctx.moveTo(0, g);
        ctx.lineTo(texSize, g);
        ctx.stroke();
      }
    } else if (theme === 'grassland') {
      ctx.fillStyle = '#3b5d2e';
      ctx.fillRect(0, 0, texSize, texSize);
      ctx.fillStyle = 'rgba(92,130,68,0.16)';
      const cells = Math.ceil(texSize / tilePx);
      for (let r = 0; r < cells; r++) {
        for (let c = 0; c < cells; c++) {
          if ((r + c) % 2 === 0) {
            ctx.fillRect(c * tilePx, r * tilePx, tilePx, tilePx);
          }
        }
      }
    } else if (theme === 'desert_sand') {
      ctx.fillStyle = '#b99c72';
      ctx.fillRect(0, 0, texSize, texSize);
      ctx.strokeStyle = 'rgba(120,92,55,0.12)';
      ctx.lineWidth = 1;
      for (let g = 0; g <= texSize; g += tilePx) {
        ctx.beginPath();
        ctx.moveTo(g, 0);
        ctx.lineTo(g, texSize);
        ctx.moveTo(0, g);
        ctx.lineTo(texSize, g);
        ctx.stroke();
      }
    } else if (theme === 'alpine_slate') {
      ctx.fillStyle = '#434d5b';
      ctx.fillRect(0, 0, texSize, texSize);
      ctx.strokeStyle = 'rgba(203,213,225,0.12)';
      ctx.lineWidth = 1;
      for (let g = 0; g <= texSize; g += tilePx) {
        ctx.beginPath();
        ctx.moveTo(g, 0);
        ctx.lineTo(g, texSize);
        ctx.moveTo(0, g);
        ctx.lineTo(texSize, g);
        ctx.stroke();
      }
    } else {
      // studio_grid
      ctx.fillStyle = '#19212e';
      ctx.fillRect(0, 0, texSize, texSize);
      const subStep = tilePx * 0.5;
      ctx.strokeStyle = 'rgba(56,189,248,0.08)';
      ctx.lineWidth = 1;
      for (let g = 0; g <= texSize; g += subStep) {
        ctx.beginPath();
        ctx.moveTo(g, 0);
        ctx.lineTo(g, texSize);
        ctx.moveTo(0, g);
        ctx.lineTo(texSize, g);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(56,189,248,0.22)';
      ctx.lineWidth = 1.4;
      for (let g = 0; g <= texSize; g += tilePx) {
        ctx.beginPath();
        ctx.moveTo(g, 0);
        ctx.lineTo(g, texSize);
        ctx.moveTo(0, g);
        ctx.lineTo(texSize, g);
        ctx.stroke();
      }
    }

    // Paint user-created terrain material stamps in world space
    const matStamps = bp.terrainMaterialStamps ?? [];
    for (let i = 0; i < matStamps.length; i++) {
      const st = matStamps[i];
      const def = TERRAIN_MATERIAL_MAP[st.material] ?? TERRAIN_MATERIAL_MAP.grass;
      const hex =
        st.colorHex && /^#[0-9a-fA-F]{6}$/.test(st.colorHex) ? st.colorHex : def.hex;
      const [r, g, b] = parseHexRgb(hex);
      const cx = ((st.x + halfSize) / baseplateSize) * texSize;
      const cy = ((st.z + halfSize) / baseplateSize) * texSize;
      const pr = Math.max(3, (st.radius / baseplateSize) * texSize);
      const alpha = clamp(st.strength ?? 0.92, 0.15, 1.0);

      const grad = ctx.createRadialGradient(cx, cy, pr * 0.28, cx, cy, pr);
      grad.addColorStop(0, `rgba(${r},${g},${b},${alpha.toFixed(2)})`);
      grad.addColorStop(0.7, `rgba(${r},${g},${b},${(alpha * 0.78).toFixed(2)})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, Math.PI * 2);
      ctx.fill();

      // Subtle material texture accent inside inner radius
      const [sr, sg, sb] = parseHexRgb(def.secondaryHex);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, pr * 0.82, 0, Math.PI * 2);
      ctx.clip();
      if (st.material === 'neon_grid') {
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(alpha * 0.55).toFixed(2)})`;
        ctx.lineWidth = 1;
        const step = 10;
        const startX = Math.floor((cx - pr) / step) * step;
        const startY = Math.floor((cy - pr) / step) * step;
        for (let gx = startX; gx <= cx + pr; gx += step) {
          ctx.beginPath();
          ctx.moveTo(gx, cy - pr);
          ctx.lineTo(gx, cy + pr);
          ctx.stroke();
        }
        for (let gy = startY; gy <= cy + pr; gy += step) {
          ctx.beginPath();
          ctx.moveTo(cx - pr, gy);
          ctx.lineTo(cx + pr, gy);
          ctx.stroke();
        }
      } else if (st.material === 'cobble' || st.material === 'concrete') {
        ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(alpha * 0.3).toFixed(2)})`;
        ctx.lineWidth = 1;
        const step = st.material === 'cobble' ? 8 : 18;
        const startX = Math.floor((cx - pr) / step) * step;
        const startY = Math.floor((cy - pr) / step) * step;
        for (let gx = startX; gx <= cx + pr; gx += step) {
          ctx.beginPath();
          ctx.moveTo(gx, cy - pr);
          ctx.lineTo(gx, cy + pr);
          ctx.stroke();
        }
        for (let gy = startY; gy <= cy + pr; gy += step) {
          ctx.beginPath();
          ctx.moveTo(cx - pr, gy);
          ctx.lineTo(cx + pr, gy);
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = `rgba(${sr},${sg},${sb},${(alpha * 0.25).toFixed(2)})`;
        const dots = Math.min(28, Math.max(6, Math.round(pr * 0.45)));
        for (let k = 0; k < dots; k++) {
          const ang = (k * 2.39996 + i * 1.13) % (Math.PI * 2);
          const dist = ((k + 0.5) / dots) * pr * 0.72;
          ctx.fillRect(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, 2, 2);
        }
      }
      ctx.restore();
    }

    baseTex.needsUpdate = true;
  };

  redrawCanvas(customBp);

  const baseTheme = customBp.baseplateTheme ?? 'studio_grid';
  const baseMat = new THREE.MeshStandardMaterial({
    map: baseTex,
    roughness: baseTheme === 'asphalt_pad' ? 0.72 : 0.86,
    metalness: baseTheme === 'studio_grid' ? 0.14 : 0.04,
  });

  const chunked = buildChunkedTerrainTiles(geo, baseMat, baseplateSize, segs, {
    chunkSizeM: 250,
    receiveShadow: true,
    castShadow: false,
    name: 'StudioBaseplateChunks',
  });
  group.add(chunked.group);

  // Studio Water Plane (toggled by customBp.waterEnabled & waterLevel)
  const waterGeo = new THREE.PlaneGeometry(baseplateSize, baseplateSize, isSoftwareGl ? 16 : 32, isSoftwareGl ? 16 : 32);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x168aad,
    roughness: 0.14,
    metalness: 0.18,
    transparent: true,
    opacity: 0.72,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.name = 'StudioWaterPlane';
  waterMesh.position.set(0, customBp.waterLevel ?? 17.5, 0);
  waterMesh.visible = Boolean(customBp.waterEnabled);
  waterMesh.receiveShadow = true;
  group.add(waterMesh);

  // Invisible minimal placeholder for distant skirt to satisfy TerrainRig contract
  const dummyGeo = new THREE.BufferGeometry();
  const dummyMat = new THREE.MeshBasicMaterial({ visible: false });
  const skirtMesh = new THREE.Mesh(dummyGeo, dummyMat);
  skirtMesh.visible = false;

  let activeWaterBaseY = customBp.waterLevel ?? 17.5;

  return {
    group,
    terrainMesh: chunked.primaryMesh,
    skirtMesh,
    waterMesh,
    updateWater: (elapsedSec: number) => {
      if (waterMesh.visible) {
        waterMesh.position.y = activeWaterBaseY + Math.sin(elapsedSec * 1.4) * 0.06;
      }
    },
    updateVisibilityWindow: (
      focusPos: THREE.Vector3,
      radiusM = 520,
      camPos?: THREE.Vector3,
      camFwd?: THREE.Vector3,
    ) => {
      chunked.updateVisibilityWindow(focusPos, radiusM, false, camPos, camFwd);
    },
    setInspectMode: (mode: InspectMode) => {
      baseMat.wireframe = mode === 'wireframe';
    },
    updateCustomTerrainLook: (bp: CustomMapBlueprint) => {
      redrawCanvas(bp);
      activeWaterBaseY = bp.waterLevel ?? 17.5;
      waterMesh.visible = Boolean(bp.waterEnabled);
      waterMesh.position.y = activeWaterBaseY;
      baseMat.roughness = (bp.baseplateTheme ?? 'studio_grid') === 'asphalt_pad' ? 0.72 : 0.86;
      baseMat.metalness = (bp.baseplateTheme ?? 'studio_grid') === 'studio_grid' ? 0.14 : 0.04;
    },
    dispose: () => {
      chunked.dispose();
      baseTex.dispose();
      baseMat.dispose();
      waterGeo.dispose();
      waterMat.dispose();
      dummyGeo.dispose();
      dummyMat.dispose();
    },
  };
}
