import * as THREE from 'three';
import { getCircuitData } from '../Aurelia Ridge/circuitSpline';
import { FROSTPEAK_WATER_LEVEL } from './frostpeakTerrainField';
import { clamp, fbm2D, ridgedNoise2D } from '../../engine/mathNoise';
import { ProceduralTextureSuite } from '../Aurelia Ridge/proceduralTextures';
import { type WeatherUniforms } from '../Aurelia Ridge/skyAndLighting';
import { groundHeightAt } from '../Aurelia Ridge/terrainField';
import { type InspectMode, type MistUniforms, type TerrainRig } from '../Aurelia Ridge/terrainBuilder';
import { buildChunkedTerrainTiles } from '../sharedTerrainChunker';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Builds Frostpeak Glacier's alpine snow/granite/sapphire-ice-wall terrain,
 * Sub-Surface Parallax Frozen Glacial Lake, and Glacier Icefall ported from
 * user's Frostpeak map, wrapped with TerrainRig horizon cirque skirt & controls.
 */
export function buildFrostpeakTerrainRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
  mistUniforms?: MistUniforms,
  isSoftwareGl = false,
): TerrainRig {
  const group = new THREE.Group();
  group.name = 'FrostpeakTerrainRig';

  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };
  const sharedMist: MistUniforms = mistUniforms ?? {
    uMistColor: { value: new THREE.Color(0xc8dff5) },
    uMistStrength: { value: 0.28 },
  };
  const inspectUniforms = { uInspectMode: { value: 0 } };

  const disposables: { dispose: () => void }[] = [];
  const circuit = getCircuitData();
  const pitFrame = circuit.pitLaneBounds.frame;

  const evalPadWeight = (x: number, z: number): number => {
    if (!pitFrame) return 0;
    const dx = x - pitFrame.centerX;
    const dz = z - pitFrame.centerZ;
    const along = Math.abs(dx * pitFrame.tanX + dz * pitFrame.tanZ);
    const across = dx * pitFrame.rightX + dz * pitFrame.rightZ;
    const wAlong = 1 - smoothstep(pitFrame.halfLength + 10, pitFrame.halfLength + 30, along);
    const pitAcross =
      smoothstep(-(pitFrame.halfWidth + 30), -(pitFrame.halfWidth + 12), across) *
      (1 - smoothstep(pitFrame.halfWidth + 2, pitFrame.halfWidth + 14, across));
    const gsAcross =
      smoothstep(pitFrame.halfWidth + 12, pitFrame.halfWidth + 24, across) *
      (1 - smoothstep(pitFrame.halfWidth + 46, pitFrame.halfWidth + 64, across));
    return Math.max(wAlong * pitAcross, wAlong * gsAcross);
  };

  // 1. Alpine Terrain Shader: triplanar fractured granite, wind-scoured snowdrifts, sapphire glacier ice walls
  const size = 1120;
  const segs = isSoftwareGl ? 160 : 240;

  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
  const count = posAttr.count;
  const snowWeights = new Float32Array(count);
  const rockWeights = new Float32Array(count);
  const cavityAO = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    posAttr.setY(i, groundHeightAt(x, z));
    uvAttr.setXY(i, (x + size * 0.5) / size, (z + size * 0.5) / size);
  }
  geo.computeVertexNormals();
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const nx = normAttr.getX(i);
    const ny = Math.max(0.05, normAttr.getY(i));
    const nz = normAttr.getZ(i);
    const slope = Math.hypot(nx, nz) / ny;
    const padW = evalPadWeight(x, z);

    snowWeights[i] = clamp((1 - smoothstep(0.48, 1.15, slope)) * (1 - padW * 0.45), 0.08, 1);
    rockWeights[i] = clamp(smoothstep(0.55, 1.25, slope), 0, 1);
    cavityAO[i] = clamp(
      0.66 + fbm2D(x * 0.03, z * 0.03, 2, 2.0, 0.5, 617) * 0.16 + smoothstep(8, 65, y) * 0.18,
      0.48,
      1.0,
    );
  }

  geo.setAttribute('aSnowWeight', new THREE.BufferAttribute(snowWeights, 1));
  geo.setAttribute('aRockWeight', new THREE.BufferAttribute(rockWeights, 1));
  geo.setAttribute('aCavityAO', new THREE.BufferAttribute(cavityAO, 1));
  geo.computeBoundingSphere();

  let baseSnowSheen = 0.78;
  const terrainUniforms = {
    uSnowSheen: { value: baseSnowSheen },
    uSnowAccum: { value: 0.65 },
    uWetness: sharedWeather.uWetness,
    uSunDir: { value: new THREE.Vector3(0.55, 0.6, 0.45).normalize() },
    uDetailMap: { value: textures.terrainDetailMap },
    uDetailNormal: { value: textures.terrainDetailNormal },
    uRockORM: { value: textures.terrainRockORM },
    uInspectMode: inspectUniforms.uInspectMode,
    uMistColor: sharedMist.uMistColor,
    uMistStrength: sharedMist.uMistStrength,
    uIceLevel: { value: FROSTPEAK_WATER_LEVEL },
  };

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.0,
    envMapIntensity: 0.24,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSnowSheen = terrainUniforms.uSnowSheen;
    shader.uniforms.uSnowAccum = terrainUniforms.uSnowAccum;
    shader.uniforms.uWetness = terrainUniforms.uWetness;
    shader.uniforms.uSunDir = terrainUniforms.uSunDir;
    shader.uniforms.uDetailMap = terrainUniforms.uDetailMap;
    shader.uniforms.uDetailNormal = terrainUniforms.uDetailNormal;
    shader.uniforms.uRockORM = terrainUniforms.uRockORM;
    shader.uniforms.uInspectMode = terrainUniforms.uInspectMode;
    shader.uniforms.uMistColor = terrainUniforms.uMistColor;
    shader.uniforms.uMistStrength = terrainUniforms.uMistStrength;
    shader.uniforms.uIceLevel = terrainUniforms.uIceLevel;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSnowWeight;
        attribute float aRockWeight;
        attribute float aCavityAO;
        varying float vSnowWeight;
        varying float vRockWeight;
        varying float vCavityAO;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec3 vViewAxisX;
        varying vec3 vViewAxisZ;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSnowWeight = aSnowWeight;
        vRockWeight = aRockWeight;
        vCavityAO = aCavityAO;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        vViewAxisX = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vViewAxisZ = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSnowSheen;
        uniform float uSnowAccum;
        uniform float uWetness;
        uniform vec3 uSunDir;
        uniform sampler2D uDetailMap;
        uniform sampler2D uDetailNormal;
        uniform sampler2D uRockORM;
        uniform float uInspectMode;
        uniform vec3 uMistColor;
        uniform float uMistStrength;
        uniform float uIceLevel;
        varying float vSnowWeight;
        varying float vRockWeight;
        varying float vCavityAO;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec3 vViewAxisX;
        varying vec3 vViewAxisZ;
        float fpHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float fpNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(fpHash(i), fpHash(i + vec2(1.0, 0.0)), u.x),
            mix(fpHash(i + vec2(0.0, 1.0)), fpHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float fpBump(vec2 xz) {
          return fpNoise(xz * 0.36) * 0.52 + fpNoise(xz * 1.45) * 0.32 + fpNoise(xz * 3.8) * 0.16;
        }
        vec3 fpTriSampleW(sampler2D tex, vec3 wp, vec3 b, float scale) {
          vec3 acc = vec3(0.0);
          if (b.z > 0.015) acc += texture2D(tex, wp.xy * scale).rgb * b.z;
          if (b.x > 0.015) acc += texture2D(tex, wp.zy * scale).rgb * b.x;
          if (b.y > 0.015) acc += texture2D(tex, wp.xz * scale).rgb * b.y;
          return acc;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 fpTriW = pow(abs(vWorldNormal), vec3(3.0));
        fpTriW /= max(fpTriW.x + fpTriW.y + fpTriW.z, 0.001);
        // Wind-scoured sastrugi drift ripples & triplanar geological rock fractures
        float sastrugi = fpNoise(vec2(vWorldPos.x * 0.14 + vWorldPos.z * 0.06, vWorldPos.z * 0.32));
        float micro = fpNoise(vWorldPos.xz * 1.8);
        float detailMacro = fpTriSampleW(uDetailMap, vWorldPos, fpTriW, 0.044).r;
        float detailMicro = fpTriSampleW(uDetailMap, vWorldPos, fpTriW, 0.26).r;
        float rockTex = mix(detailMacro, detailMicro, 0.56);

        vec3 rockOrmFP = fpTriSampleW(uRockORM, vWorldPos, fpTriW, 0.048);
        vec3 alpineSnow = mix(vec3(0.20, 0.30, 0.46), vec3(0.56, 0.61, 0.69), sastrugi * 0.65 + 0.35);
        alpineSnow *= (0.86 + detailMicro * 0.24);

        float strataWarp = fpNoise(vWorldPos.xz * 0.035) * 8.0 + detailMacro * 5.2;
        float graniteStrata = fpNoise(vec2(vWorldPos.y * 0.5 + strataWarp, (vWorldPos.x - vWorldPos.z) * 0.045));
        vec3 granite = mix(vec3(0.022, 0.026, 0.036), vec3(0.175, 0.195, 0.225), smoothstep(0.22, 0.80, mix(rockTex, graniteStrata, 0.42)));
        granite *= mix(0.76, 1.08, rockOrmFP.r);

        // Translucent sapphire glacier ice walls between 55m and 128m
        float glacierBand = smoothstep(55.0, 82.0, vWorldPos.y) * (1.0 - smoothstep(115.0, 132.0, vWorldPos.y));
        vec3 sapphireIce = mix(vec3(0.06, 0.30, 0.54), vec3(0.24, 0.58, 0.76), micro);
        vec3 cliffCol = mix(granite, sapphireIce, glacierBand * 0.58 * (1.0 - vWorldNormal.y));

        // Natural snow catching on upward-facing granite cliff ledges + icy blue crevice SSS tint
        float ledgeSnow = smoothstep(0.42, 0.74, vWorldNormal.y) * smoothstep(0.25, 0.72, uSnowAccum);
        float snowCover = clamp(max(vSnowWeight * (0.68 + uSnowAccum * 0.42), ledgeSnow * 0.88), 0.0, 1.0);
        vec3 baseCol = mix(cliffCol, alpineSnow, snowCover * (1.0 - vRockWeight * (1.0 - ledgeSnow * 0.75) * 0.76));
        baseCol = mix(baseCol, baseCol * vec3(0.84, 0.94, 1.12), (1.0 - vCavityAO) * snowCover * 0.42);

        // Crisp GT7 sunlit snow crystal micro-sparkle (non-blinding)
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 halfV = normalize(uSunDir + viewDir);
        float sparkle = step(0.952, fpHash(floor(vWorldPos.xz * 4.8))) * pow(max(dot(vWorldNormal, halfV), 0.0), 18.0);
        baseCol += vec3(0.62, 0.72, 0.86) * sparkle * snowCover * uSnowSheen * 0.22;

        baseCol *= mix(0.44, 1.06, vCavityAO);
        if (uInspectMode > 1.5) {
          float hNorm = clamp((vWorldPos.y + 8.0) / 140.0, 0.0, 1.0);
          baseCol = mix(vec3(0.08, 0.42, 0.68), vec3(0.95, 0.98, 1.0), hNorm);
        }
        diffuseColor.rgb *= baseCol;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float hC = fpBump(vWorldPos.xz);
        float hX = fpBump(vWorldPos.xz + vec2(0.35, 0.0));
        float hZ = fpBump(vWorldPos.xz + vec2(0.0, 0.35));
        vec3 triNrm = fpTriSampleW(uDetailNormal, vWorldPos, fpTriW, 0.25) * 2.0 - 1.0;
        float flatFade = clamp(vWorldNormal.y * 1.45, 0.14, 1.0);
        float bumpAmp = mix(0.55, 1.25, vRockWeight) * flatFade;
        float gx = (hC - hX) * bumpAmp + triNrm.x * mix(0.30, 0.88, vRockWeight);
        float gz = (hC - hZ) * bumpAmp + triNrm.y * mix(0.30, 0.88, vRockWeight);
        normal = normalize(normal + vViewAxisX * gx + vViewAxisZ * gz);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float glacierBandR = smoothstep(55.0, 82.0, vWorldPos.y) * (1.0 - smoothstep(115.0, 132.0, vWorldPos.y));
        roughnessFactor = mix(roughnessFactor, mix(0.60, rockOrmFP.g, 0.48), vRockWeight * 0.55 + uWetness * 0.24);
        roughnessFactor = mix(roughnessFactor, 0.22, glacierBandR * (1.0 - vWorldNormal.y) * 0.65);`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        if (uInspectMode < 0.5) {
          float distToCam = length(cameraPosition - vWorldPos);
          float valleyMistH = 1.0 - smoothstep(uIceLevel - 2.0, uIceLevel + 28.0, vWorldPos.y);
          float mistDist = smoothstep(42.0, 360.0, distToCam);
          float mistMix = clamp(valleyMistH * mistDist * uMistStrength, 0.0, 0.68);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, mistMix);
        }`,
      );
  };
  terrainMat.customProgramCacheKey = () => 'frostpeak-crossover-terrain-v2';
  disposables.push(terrainMat);

  const chunkedTerrain = buildChunkedTerrainTiles(geo, terrainMat, size, segs, {
    chunkSizeM: 250,
    receiveShadow: true,
    castShadow: false,
    name: 'FrostpeakChunkedTerrain',
  });
  const terrainMesh = chunkedTerrain.primaryMesh;
  group.add(chunkedTerrain.group);

  // Outer soaring glacier alpine massif horizon skirt (520m -> 2400m)
  const skirtGeo = new THREE.RingGeometry(520, 2400, 128, 22);
  skirtGeo.rotateX(-Math.PI / 2);
  const skirtPos = skirtGeo.attributes.position as THREE.BufferAttribute;
  const skirtCols = new Float32Array(skirtPos.count * 3);
  const cFrostRock = new THREE.Color(0x475569);
  const cFrostSnow = new THREE.Color(0xeef5fc);
  const cTmp = new THREE.Color();
  for (let i = 0; i < skirtPos.count; i++) {
    const sx = skirtPos.getX(i);
    const sz = skirtPos.getZ(i);
    const r = Math.hypot(sx, sz);
    const ringT = smoothstep(520, 2000, r);
    const rid = ridgedNoise2D(sx * 0.0018 + 1.1, sz * 0.0018 - 0.7, 4, 2.1, 0.52, 7421);
    const sub = ridgedNoise2D(sx * 0.0036 - 2.3, sz * 0.0036 + 1.5, 3, 2.05, 0.5, 3191);
    const finalY = 28.0 + ringT * (65.0 + rid * 240.0 + sub * 115.0);
    skirtPos.setY(i, finalY);
    cTmp.copy(cFrostRock).lerp(cFrostSnow, smoothstep(95, 220, finalY) * 0.88 + 0.12);
    skirtCols[i * 3] = cTmp.r;
    skirtCols[i * 3 + 1] = cTmp.g;
    skirtCols[i * 3 + 2] = cTmp.b;
  }
  skirtGeo.setAttribute('color', new THREE.BufferAttribute(skirtCols, 3));
  skirtGeo.computeVertexNormals();
  const skirtMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.03,
  });
  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
  skirtMesh.receiveShadow = true;
  group.add(skirtMesh);
  disposables.push(skirtGeo, skirtMat);

  // 2. Sub-Surface Parallax Frozen Glacial Lake (55, 4.0, 145)
  const lakeGeo = new THREE.PlaneGeometry(520, 420, 32, 32);
  lakeGeo.rotateX(-Math.PI / 2);
  const lakeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSnowSheen: { value: baseSnowSheen },
      uSunDir: { value: new THREE.Vector3(0.55, 0.6, 0.45).normalize() },
      uMistColor: sharedMist.uMistColor,
      uMistStrength: sharedMist.uMistStrength,
    },
    vertexShader: `
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSnowSheen;
      uniform vec3 uSunDir;
      uniform vec3 uMistColor;
      uniform float uMistStrength;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      float iHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float iNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(iHash(i), iHash(i + vec2(1.0, 0.0)), u.x),
          mix(iHash(i + vec2(0.0, 1.0)), iHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      float crackPattern(vec2 p) {
        float n1 = abs(iNoise(p * 0.14) - 0.5);
        float n2 = abs(iNoise(p * 0.31 + vec2(7.3, -4.1)) - 0.5);
        return 1.0 - smoothstep(0.0, 0.055, min(n1, n2));
      }
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        // Multi-layer view-parallax interior ice fractures (pOff1, pOff2)
        vec2 pOff1 = (viewDir.xz / max(abs(viewDir.y), 0.28)) * 2.2;
        vec2 pOff2 = (viewDir.xz / max(abs(viewDir.y), 0.28)) * 5.2;
        float surfCrack = crackPattern(vWorldPos.xz);
        float deepCrack1 = crackPattern(vWorldPos.xz - pOff1);
        float deepCrack2 = crackPattern(vWorldPos.xz - pOff2);

        // Deep cobalt crevasses + translucent glacial ice
        vec3 deepCobalt = vec3(0.05, 0.19, 0.38);
        vec3 iceMid = vec3(0.24, 0.62, 0.84);
        vec3 frostTop = vec3(0.84, 0.94, 0.99);
        float frostNoise = iNoise(vWorldPos.xz * 0.07);
        vec3 col = mix(deepCobalt, iceMid, 0.55 + frostNoise * 0.35);
        col = mix(col, vec3(0.03, 0.11, 0.26), deepCrack2 * 0.65);
        col = mix(col, vec3(0.68, 0.91, 1.0), deepCrack1 * 0.55);
        col = mix(col, frostTop, surfCrack * 0.72);

        // Crystalline micro-facet sparkle (uSnowSheen) + balanced Fresnel ice glaze
        float sparkle = step(0.955, iHash(floor(vWorldPos.xz * 4.1))) * uSnowSheen;
        float fresnel = pow(1.0 - max(viewDir.y, 0.0), 3.2);
        vec3 halfV = normalize(uSunDir + viewDir);
        float spec = pow(max(halfV.y, 0.0), 140.0);
        col += vec3(0.78, 0.90, 1.0) * (sparkle * 0.48 + spec * 0.62);
        col = mix(col, vec3(0.60, 0.76, 0.90), fresnel * 0.48);

        float distCamW = length(cameraPosition - vWorldPos);
        float iceMist = clamp(smoothstep(95.0, 460.0, distCamW) * uMistStrength * 0.65, 0.0, 0.55);
        col = mix(col, uMistColor, iceMist);

        gl_FragColor = vec4(col, 0.94);
      }
    `,
  });
  const waterMesh = new THREE.Mesh(lakeGeo, lakeMat);
  waterMesh.position.set(55, FROSTPEAK_WATER_LEVEL, 145);
  waterMesh.renderOrder = 1;
  group.add(waterMesh);
  disposables.push(lakeGeo, lakeMat);

  // 3. Glacier Icefall ((16, 36) -> (42, 92)): granite headwall, sapphire icicle pillars, 3 meltwater ribbons, 22m splash boil ring, 220 mist particles
  const icefallGroup = new THREE.Group();
  icefallGroup.name = 'FrostpeakGlacierIcefall';
  group.add(icefallGroup);

  const icicleFlankMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.25,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: isSoftwareGl ? 0.72 : 0.85,
    depthWrite: false,
    flatShading: true,
  });
  disposables.push(icicleFlankMat);

  const icicleGeo = new THREE.ConeGeometry(2.2, 18, 6);
  icicleGeo.rotateX(Math.PI);
  disposables.push(icicleGeo);
  for (let ic = 0; ic < 10; ic++) {
    const side = ic < 5 ? -1 : 1;
    const idx = ic % 5;
    const ix = 22 + side * (7 + idx * 2.4);
    const iz = 46 + idx * 4.5;
    const iy = groundHeightAt(ix, iz);
    const pillar = new THREE.Mesh(icicleGeo, icicleFlankMat);
    pillar.position.set(ix, Math.max(iy, 26) + 4, iz);
    pillar.scale.set(0.8 + (idx % 3) * 0.25, 0.8 + (idx % 2) * 0.4, 0.8);
    pillar.renderOrder = 2;
    icefallGroup.add(pillar);
  }

  const iceUniforms = { uTime: { value: 0 } };
  const meltRibbonMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: iceUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float flow = fract(vUv.y * 3.4 + uTime * 1.45);
        float streak = sin(vUv.x * 24.0 + uTime * 2.2) * 0.5 + 0.5;
        float edge = smoothstep(0.0, 0.16, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));
        vec3 col = mix(vec3(0.32, 0.78, 0.98), vec3(0.94, 0.99, 1.0), streak * 0.55 + flow * 0.25);
        gl_FragColor = vec4(col, (0.55 + streak * 0.3) * edge);
      }
    `,
  });
  disposables.push(meltRibbonMat);

  const buildIcefallRibbon = (start: THREE.Vector3, end: THREE.Vector3, width: number) => {
    const curve = new THREE.CatmullRomCurve3([
      start,
      start.clone().lerp(end, 0.4).add(new THREE.Vector3(0, 4, 0)),
      end,
    ]);
    const cSegs = 22;
    const pts = curve.getPoints(cSegs);
    const positions = new Float32Array((cSegs + 1) * 2 * 3);
    const uvs = new Float32Array((cSegs + 1) * 2 * 2);
    const indices: number[] = [];
    const dir = new THREE.Vector3().subVectors(end, start).setY(0).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width * 0.5);
    for (let i = 0; i <= cSegs; i++) {
      const p = pts[i];
      const v = i / cSegs;
      positions[i * 6] = p.x - perp.x;
      positions[i * 6 + 1] = p.y;
      positions[i * 6 + 2] = p.z - perp.z;
      positions[i * 6 + 3] = p.x + perp.x;
      positions[i * 6 + 4] = p.y;
      positions[i * 6 + 5] = p.z + perp.z;
      uvs[i * 4] = 0;
      uvs[i * 4 + 1] = 1 - v;
      uvs[i * 4 + 2] = 1;
      uvs[i * 4 + 3] = 1 - v;
      if (i < cSegs) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };

  const iceRibbonA = buildIcefallRibbon(
    new THREE.Vector3(20, 56, 42),
    new THREE.Vector3(41, FROSTPEAK_WATER_LEVEL + 0.1, 88),
    9.5,
  );
  const iceRibbonB = buildIcefallRibbon(
    new THREE.Vector3(14, 54, 46),
    new THREE.Vector3(35, FROSTPEAK_WATER_LEVEL + 0.1, 90),
    5.2,
  );
  const iceRibbonC = buildIcefallRibbon(
    new THREE.Vector3(26, 53, 40),
    new THREE.Vector3(47, FROSTPEAK_WATER_LEVEL + 0.1, 85),
    5.0,
  );
  disposables.push(iceRibbonA, iceRibbonB, iceRibbonC);
  for (const rGeo of [iceRibbonA, iceRibbonB, iceRibbonC]) {
    const m = new THREE.Mesh(rGeo, meltRibbonMat);
    m.renderOrder = 3;
    icefallGroup.add(m);
  }

  // 22m icy splash boil ring at plunge pool (42, 4.12, 92)
  const boilGeo = new THREE.RingGeometry(2.2, 11.0, 32, 1);
  boilGeo.rotateX(-Math.PI / 2);
  const boilMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: iceUniforms,
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vPos;
      void main() {
        float r = length(vPos.xz) / 11.0;
        float wave = sin(r * 16.0 - uTime * 4.2) * 0.5 + 0.5;
        float alpha = (1.0 - smoothstep(0.25, 1.0, r)) * (0.4 + wave * 0.4);
        gl_FragColor = vec4(0.86, 0.96, 1.0, alpha);
      }
    `,
  });
  const boilMesh = new THREE.Mesh(boilGeo, boilMat);
  boilMesh.position.set(42, FROSTPEAK_WATER_LEVEL + 0.12, 92);
  boilMesh.renderOrder = 3;
  icefallGroup.add(boilMesh);
  disposables.push(boilGeo, boilMat);

  // 220 freezing mist particles
  const mistCount = 220;
  const mistGeo = new THREE.BufferGeometry();
  const mistBase = new Float32Array(mistCount * 3);
  const mistSeeds = new Float32Array(mistCount * 3);
  for (let i = 0; i < mistCount; i++) {
    const ang = (i * 2.39996) % (Math.PI * 2);
    const rad = (((i * 19) % 100) / 100) * 11.0;
    mistBase[i * 3] = 42 + Math.cos(ang) * rad;
    mistBase[i * 3 + 1] = FROSTPEAK_WATER_LEVEL + 0.4;
    mistBase[i * 3 + 2] = 92 + Math.sin(ang) * rad;
    mistSeeds[i * 3] = (i % 43) / 43;
    mistSeeds[i * 3 + 1] = 0.65 + ((i * 7) % 10) * 0.1;
    mistSeeds[i * 3 + 2] = ang;
  }
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistBase, 3));
  mistGeo.setAttribute('aSeed', new THREE.BufferAttribute(mistSeeds, 3));
  const mistMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: iceUniforms,
    vertexShader: `
      attribute vec3 aSeed;
      uniform float uTime;
      varying float vLife;
      void main() {
        float life = fract(aSeed.x + uTime * 0.26 * aSeed.y);
        vLife = life;
        vec3 p = position;
        p.y += life * 10.5;
        p.x += cos(aSeed.z) * life * 4.2;
        p.z += sin(aSeed.z) * life * 4.2;
        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp((15.0 + life * 22.0) * (120.0 / max(-mvPos.z, 1.0)), 2.0, 34.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float soft = 1.0 - d * 2.0;
        gl_FragColor = vec4(0.88, 0.96, 1.0, soft * soft * sin(vLife * 3.14159) * 0.44);
      }
    `,
  });
  const mistPoints = new THREE.Points(mistGeo, mistMat);
  mistPoints.frustumCulled = false;
  mistPoints.renderOrder = 4;
  icefallGroup.add(mistPoints);
  disposables.push(mistGeo, mistMat);

  return {
    group,
    terrainMesh,
    skirtMesh,
    waterMesh,
    updateWater: (elapsedSec: number) => {
      iceUniforms.uTime.value = elapsedSec;
      lakeMat.uniforms.uTime.value = elapsedSec;
      const pulse = baseSnowSheen + Math.sin(elapsedSec * 0.4) * 0.08;
      terrainUniforms.uSnowSheen.value = clamp(pulse, 0, 1);
      lakeMat.uniforms.uSnowSheen.value = clamp(pulse, 0, 1);
    },
    updateVisibilityWindow: (
      focusPos: THREE.Vector3,
      radiusM = 620,
      camPos?: THREE.Vector3,
      camFwd?: THREE.Vector3,
    ) => {
      chunkedTerrain.updateVisibilityWindow(focusPos, radiusM, false, camPos, camFwd);
    },
    setInspectMode: (mode: InspectMode) => {
      inspectUniforms.uInspectMode.value = mode === 'elevation' ? 2 : mode === 'wireframe' ? 1 : 0;
      const isWire = mode === 'wireframe';
      terrainMat.wireframe = isWire;
      skirtMat.wireframe = isWire;
    },
    setSurfaceLook: (look) => {
      if (typeof look.snowSheen === 'number') {
        baseSnowSheen = clamp(look.snowSheen, 0, 1);
        terrainUniforms.uSnowSheen.value = baseSnowSheen;
        lakeMat.uniforms.uSnowSheen.value = baseSnowSheen;
      }
    },
    dispose: () => {
      chunkedTerrain.dispose();
      disposables.forEach((d) => d.dispose());
    },
  };
}
