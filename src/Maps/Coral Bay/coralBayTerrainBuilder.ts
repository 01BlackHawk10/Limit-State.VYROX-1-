import * as THREE from 'three';
import { getCircuitData } from '../Aurelia Ridge/circuitSpline';
import { CORAL_BAY_WATER_LEVEL } from './coralBayTerrainField';
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
 * Builds Coral Bay's coastal terrain + Beer-Lambert crystal tropical ocean + Cove Waterfall
 * ported from user's Coral Bay map, wrapped with TerrainRig horizon skirt, chunked culling,
 * aerial mist, and surface look / inspect controls.
 */
export function buildCoralBayTerrainRig(
  textures: ProceduralTextureSuite,
  weatherUniforms?: WeatherUniforms,
  mistUniforms?: MistUniforms,
  isSoftwareGl = false,
): TerrainRig {
  const group = new THREE.Group();
  group.name = 'CoralBayTerrainRig';

  const sharedWeather: WeatherUniforms = weatherUniforms ?? {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51) },
  };
  const sharedMist: MistUniforms = mistUniforms ?? {
    uMistColor: { value: new THREE.Color(0xbce8fc) },
    uMistStrength: { value: 0.24 },
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

  // 1. Coral Bay Coastal PBR Terrain Material with triplanar strata/turf detail maps, sand ripples & basalt cliffs
  const size = 1120;
  const segs = isSoftwareGl ? 160 : 240;

  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute;
  const count = posAttr.count;
  const sandWeights = new Float32Array(count);
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

    const beachProx = smoothstep(200, 295, z);
    const lowShore = 1 - smoothstep(1.2, 6.2, y);
    sandWeights[i] = clamp(
      Math.max(lowShore, beachProx * (1 - smoothstep(9, 18, y))) * (1 - padW * 0.85),
      0,
      1,
    );
    rockWeights[i] = clamp(smoothstep(0.55, 1.28, slope) + smoothstep(34, 66, y) * 0.6, 0, 1);
    cavityAO[i] = clamp(
      0.68 + fbm2D(x * 0.03, z * 0.03, 2, 2.0, 0.5, 412) * 0.18 + smoothstep(0, 18, y) * 0.16 - rockWeights[i] * 0.14,
      0.45,
      1.0,
    );
  }

  geo.setAttribute('aSandWeight', new THREE.BufferAttribute(sandWeights, 1));
  geo.setAttribute('aRockWeight', new THREE.BufferAttribute(rockWeights, 1));
  geo.setAttribute('aCavityAO', new THREE.BufferAttribute(cavityAO, 1));
  geo.computeBoundingSphere();

  const terrainUniforms = {
    uWetness: sharedWeather.uWetness,
    uTime: { value: 0.0 },
    uDetailMap: { value: textures.terrainDetailMap },
    uDetailNormal: { value: textures.terrainDetailNormal },
    uRockORM: { value: textures.terrainRockORM },
    uInspectMode: inspectUniforms.uInspectMode,
    uMistColor: sharedMist.uMistColor,
    uMistStrength: sharedMist.uMistStrength,
    uWaterLevel: { value: CORAL_BAY_WATER_LEVEL },
  };

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.02,
    envMapIntensity: 0.38,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = terrainUniforms.uWetness;
    shader.uniforms.uTime = terrainUniforms.uTime;
    shader.uniforms.uDetailMap = terrainUniforms.uDetailMap;
    shader.uniforms.uDetailNormal = terrainUniforms.uDetailNormal;
    shader.uniforms.uRockORM = terrainUniforms.uRockORM;
    shader.uniforms.uInspectMode = terrainUniforms.uInspectMode;
    shader.uniforms.uMistColor = terrainUniforms.uMistColor;
    shader.uniforms.uMistStrength = terrainUniforms.uMistStrength;
    shader.uniforms.uWaterLevel = terrainUniforms.uWaterLevel;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSandWeight;
        attribute float aRockWeight;
        attribute float aCavityAO;
        varying float vSandWeight;
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
        vSandWeight = aSandWeight;
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
        uniform float uWetness;
        uniform float uTime;
        uniform sampler2D uDetailMap;
        uniform sampler2D uDetailNormal;
        uniform sampler2D uRockORM;
        uniform float uInspectMode;
        uniform vec3 uMistColor;
        uniform float uMistStrength;
        uniform float uWaterLevel;
        varying float vSandWeight;
        varying float vRockWeight;
        varying float vCavityAO;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        varying vec3 vViewAxisX;
        varying vec3 vViewAxisZ;
        float cbHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float cbNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(cbHash(i), cbHash(i + vec2(1.0, 0.0)), u.x),
            mix(cbHash(i + vec2(0.0, 1.0)), cbHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float cbTerrainBump(vec2 xz) {
          return cbNoise(xz * 0.42) * 0.5 + cbNoise(xz * 1.65) * 0.32 + cbNoise(xz * 4.4) * 0.18;
        }
        vec3 cbTriSampleW(sampler2D tex, vec3 wp, vec3 b, float scale) {
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
        vec3 cbTriW = pow(abs(vWorldNormal), vec3(3.0));
        cbTriW /= max(cbTriW.x + cbTriW.y + cbTriW.z, 0.001);
        float nLarge = cbNoise(vWorldPos.xz * 0.025);
        float nMid = cbNoise(vWorldPos.xz * 0.11);
        float nFine = cbNoise(vWorldPos.xz * 0.48);
        float nGrain = cbNoise(vWorldPos.xz * 2.1);
        float detailMacro = cbTriSampleW(uDetailMap, vWorldPos, cbTriW, 0.048).r;
        float detailMicro = cbTriSampleW(uDetailMap, vWorldPos, cbTriW, 0.28).r;
        float texDetail = mix(detailMacro, detailMicro, 0.55);

        // Wind-rippled coral sand, wet tidal zone, coarse shell-shingle shore band & silica sparkle
        float sandRipple = sin(vWorldPos.x * 2.4 + vWorldPos.z * 0.6 + cbNoise(vWorldPos.xz * 0.35) * 3.8) * 0.055;
        vec3 sandDry = mix(vec3(0.78, 0.64, 0.42), vec3(0.50, 0.40, 0.25), nLarge * 0.52 + nFine * 0.48);
        sandDry *= (0.84 + detailMicro * 0.32 + sandRipple);
        float sandSparkle = step(0.955, cbHash(floor(vWorldPos.xz * 26.0)));
        sandDry += vec3(0.18, 0.16, 0.12) * sandSparkle * (1.0 - uWetness);
        vec3 shingle = mix(vec3(0.32, 0.27, 0.20), vec3(0.46, 0.40, 0.31), detailMicro);
        float shingleBand = smoothstep(0.18, 0.48, vSandWeight) * (1.0 - smoothstep(0.52, 0.85, vSandWeight));
        sandDry = mix(sandDry, shingle, shingleBand * 0.62);
        vec3 sandWet = vec3(0.20, 0.145, 0.085);
        float tidalWet = 1.0 - smoothstep(-0.1, 1.48, vWorldPos.y);
        vec3 sandCol = mix(sandDry, sandWet, clamp(tidalWet + uWetness * 0.36, 0.0, 1.0));

        // Sunlit tropical meadow, GTA V Vinewood golden coastal dry-grass & volcanic loam soil pockets
        vec3 lushGrass = vec3(0.036, 0.118, 0.026);
        vec3 sunlitGrass = vec3(0.128, 0.162, 0.038);
        vec3 drySavanna = vec3(0.175, 0.136, 0.048);
        vec3 coastalLoam = vec3(0.088, 0.058, 0.032);
        vec3 turfEmerald = mix(lushGrass, sunlitGrass, clamp(nLarge * 0.65 + nMid * 0.35, 0.0, 1.0));
        turfEmerald = mix(turfEmerald, drySavanna, smoothstep(0.54, 0.88, nLarge) * 0.56);
        turfEmerald = mix(turfEmerald, coastalLoam, smoothstep(0.56, 0.90, nMid) * 0.52);
        turfEmerald *= (0.68 + detailMicro * 0.58) * (0.82 + nGrain * 0.36);

        // Layered volcanic basalt cliff strata with packed ORM cavity shading & mossy rock ledges
        float strataWarp = nLarge * 7.5 + nMid * 3.8 + detailMacro * 4.5;
        float strataBand = cbNoise(vec2(vWorldPos.y * 0.55 + strataWarp, (vWorldPos.x + vWorldPos.z) * 0.04));
        vec3 rockOrmCB = cbTriSampleW(uRockORM, vWorldPos, cbTriW, 0.052);
        vec3 basaltDark = vec3(0.024, 0.025, 0.030);
        vec3 basaltWarm = vec3(0.15, 0.116, 0.088);
        vec3 basaltCliff = mix(basaltDark, basaltWarm, smoothstep(0.22, 0.80, mix(texDetail, strataBand, 0.45)));
        float ledgeMoss = smoothstep(0.42, 0.78, vWorldNormal.y) * (1.0 - smoothstep(32.0, 62.0, vWorldPos.y));
        basaltCliff = mix(basaltCliff, vec3(0.048, 0.108, 0.032), ledgeMoss * 0.58);
        basaltCliff *= (0.70 + detailMicro * 0.58) * mix(0.76, 1.08, rockOrmCB.r);

        vec3 col = mix(turfEmerald, sandCol, vSandWeight);
        col = mix(col, basaltCliff, vRockWeight);
        col *= mix(0.42, 1.16, vCavityAO);
        if (uInspectMode > 1.5) {
          float hNorm = clamp((vWorldPos.y + 10.0) / 55.0, 0.0, 1.0);
          col = mix(vec3(0.06, 0.36, 0.54), vec3(0.95, 0.72, 0.22), hNorm);
        }
        diffuseColor.rgb *= col;`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float hC = cbTerrainBump(vWorldPos.xz);
        float hX = cbTerrainBump(vWorldPos.xz + vec2(0.35, 0.0));
        float hZ = cbTerrainBump(vWorldPos.xz + vec2(0.0, 0.35));
        vec3 triNrm = cbTriSampleW(uDetailNormal, vWorldPos, cbTriW, 0.25) * 2.0 - 1.0;
        float flatFade = clamp(vWorldNormal.y * 1.45, 0.14, 1.0);
        float bumpAmp = mix(0.85, 1.45, vRockWeight) * (1.0 - vSandWeight * 0.45) * flatFade;
        float gx = (hC - hX) * bumpAmp + triNrm.x * mix(0.42, 0.88, vRockWeight);
        float gz = (hC - hZ) * bumpAmp + triNrm.y * mix(0.42, 0.88, vRockWeight);
        normal = normalize(normal + vViewAxisX * gx + vViewAxisZ * gz);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float wetBand = (1.0 - smoothstep(-0.1, 1.45, vWorldPos.y)) * vSandWeight;
        roughnessFactor = mix(roughnessFactor, rockOrmCB.g, vRockWeight * 0.48);
        roughnessFactor = mix(roughnessFactor, 0.075, clamp(wetBand * 0.94 + uWetness * 0.48, 0.0, 0.94));`,
      )
      .replace(
        '#include <fog_fragment>',
        `#include <fog_fragment>
        if (uInspectMode < 0.5) {
          float distToCam = length(cameraPosition - vWorldPos);
          float coastalMistH = 1.0 - smoothstep(uWaterLevel - 1.0, uWaterLevel + 24.0, vWorldPos.y);
          float mistDist = smoothstep(55.0, 420.0, distToCam);
          float mistMix = clamp(coastalMistH * mistDist * uMistStrength, 0.0, 0.62);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistColor, mistMix);
        }`,
      );
  };
  terrainMat.customProgramCacheKey = () => 'coral-bay-crossover-terrain-v2';
  disposables.push(terrainMat);

  const chunkedTerrain = buildChunkedTerrainTiles(geo, terrainMat, size, segs, {
    chunkSizeM: 250,
    receiveShadow: true,
    castShadow: false,
    name: 'CoralBayChunkedTerrain',
  });
  const terrainMesh = chunkedTerrain.primaryMesh;
  group.add(chunkedTerrain.group);

  // Endless turquoise ocean + distant tropical volcanic archipelago islands (520m -> 2450m)
  const skirtGeo = new THREE.RingGeometry(520, 2450, 128, 18);
  skirtGeo.rotateX(-Math.PI / 2);
  const sPos = skirtGeo.attributes.position as THREE.BufferAttribute;
  const sCol = new Float32Array(sPos.count * 3);
  const cOcean = new THREE.Color(0x0b526e);
  const cAtollSand = new THREE.Color(0xd9c79b);
  const cJungle = new THREE.Color(0x28562d);
  const cPeak = new THREE.Color(0x5d645d);
  const cTmp = new THREE.Color();
  for (let i = 0; i < sPos.count; i++) {
    const sx = sPos.getX(i);
    const sz = sPos.getZ(i);
    const r = Math.hypot(sx, sz);
    const ang = Math.atan2(sz, sx);
    const islandArch =
      Math.max(0, Math.sin(ang * 3.0 + 0.7) * Math.cos(ang * 2.0 - 0.5)) *
      smoothstep(980, 1520, r) *
      (1.0 - smoothstep(1780, 2320, r));
    const peakH = islandArch * (85.0 + 55.0 * Math.abs(Math.sin(sx * 0.004 + sz * 0.003)));
    sPos.setY(i, peakH > 0.35 ? peakH : -0.12);
    if (peakH <= 0.6) {
      cTmp.copy(cOcean);
    } else if (peakH < 6.0) {
      cTmp.copy(cAtollSand).lerp(cJungle, peakH / 6.0);
    } else {
      cTmp.copy(cJungle).lerp(cPeak, smoothstep(55.0, 125.0, peakH));
    }
    sCol[i * 3] = cTmp.r;
    sCol[i * 3 + 1] = cTmp.g;
    sCol[i * 3 + 2] = cTmp.b;
  }
  skirtGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  skirtGeo.computeVertexNormals();
  const skirtMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.42,
    metalness: 0.08,
  });
  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
  skirtMesh.position.y = CORAL_BAY_WATER_LEVEL;
  skirtMesh.receiveShadow = true;
  group.add(skirtMesh);
  disposables.push(skirtGeo, skirtMat);

  // 2. Tropical Ocean & Coral Lagoon Water Shader (y = 0.0 m)
  const waterSegs = isSoftwareGl ? 96 : 140;
  const waterGeo = new THREE.PlaneGeometry(1800, 1800, waterSegs, waterSegs);
  waterGeo.rotateX(-Math.PI / 2);
  disposables.push(waterGeo);

  const wPos = waterGeo.attributes.position as THREE.BufferAttribute;
  const depths = new Float32Array(wPos.count);
  for (let i = 0; i < wPos.count; i++) {
    const wx = wPos.getX(i);
    const wz = wPos.getZ(i);
    const bedY = Math.abs(wx) <= 555 && Math.abs(wz) <= 555 ? groundHeightAt(wx, wz) : -10.5;
    depths[i] = Math.max(0, CORAL_BAY_WATER_LEVEL - bedY);
  }
  waterGeo.setAttribute('aWaterDepth', new THREE.BufferAttribute(depths, 1));
  waterGeo.computeBoundingSphere();

  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.6, 0.55, 0.4).normalize() },
      uWaterChop: { value: 0.45 },
      uWaterClarity: { value: 0.82 },
      uMistColor: sharedMist.uMistColor,
      uMistStrength: sharedMist.uMistStrength,
    },
    vertexShader: `
      attribute float aWaterDepth;
      uniform float uTime;
      uniform float uWaterChop;
      varying float vDepth;
      varying vec3 vWorldPos;
      varying vec3 vWaveNormal;
      void main() {
        vDepth = aWaterDepth;
        vec3 pos = position;
        float amp = (0.08 + uWaterChop * 0.24) * smoothstep(0.15, 2.5, aWaterDepth);
        float w1 = sin(pos.x * 0.085 + uTime * 1.65) * cos(pos.z * 0.07 + uTime * 1.25);
        float w2 = sin((pos.x + pos.z) * 0.16 - uTime * 2.2) * 0.45;
        pos.y += (w1 + w2) * amp;
        float dx = cos(pos.x * 0.085 + uTime * 1.65) * 0.085 * amp;
        float dz = -sin(pos.z * 0.07 + uTime * 1.25) * 0.07 * amp;
        vWaveNormal = normalize(vec3(-dx, 1.0, -dz));
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uWaterChop;
      uniform float uWaterClarity;
      uniform vec3 uMistColor;
      uniform float uMistStrength;
      varying float vDepth;
      varying vec3 vWorldPos;
      varying vec3 vWaveNormal;
      float wHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float wNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x),
          mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      void main() {
        if (vDepth <= 0.005) discard;
        // Beer-Lambert depth-graded crystal tropical turquoise -> emerald teal -> deep sapphire
        vec3 shallowTurquoise = vec3(0.04, 0.64, 0.60);
        vec3 midCyan = vec3(0.01, 0.34, 0.52);
        vec3 deepCobalt = vec3(0.01, 0.10, 0.25);
        float absorb = 1.0 - exp(-vDepth * (0.28 - uWaterClarity * 0.10));
        vec3 baseCol = mix(shallowTurquoise, midCyan, smoothstep(0.25, 4.2, vDepth));
        baseCol = mix(baseCol, deepCobalt, smoothstep(4.2, 15.0, vDepth));

        // Shimmering sandy reef shoals in shallow lagoon
        float coralPatch = wNoise(vWorldPos.xz * 0.08 + vec2(3.1, -2.4));
        float reefMask = smoothstep(0.54, 0.86, coralPatch) * (1.0 - smoothstep(1.5, 7.5, vDepth));
        baseCol = mix(baseCol, vec3(0.42, 0.64, 0.50), reefMask * 0.34 * uWaterClarity);

        // Animated underwater solar caustics
        float c1 = wNoise(vWorldPos.xz * 0.45 + vec2(uTime * 0.45, -uTime * 0.32));
        float c2 = wNoise(vWorldPos.xz * 0.48 - vec2(uTime * 0.38, uTime * 0.41));
        float caustic = pow(clamp(1.0 - abs(c1 - c2) * 3.8, 0.0, 1.0), 2.8);
        baseCol += vec3(0.24, 0.56, 0.58) * caustic * (1.0 - smoothstep(0.8, 8.2, vDepth)) * uWaterClarity;

        // Organic wind-swept ocean ripple normals
        vec2 p = vWorldPos.xz;
        float r1 = wNoise(p * vec2(0.22, 0.48) + vec2(uTime * 0.35, -uTime * 0.25));
        float r2 = wNoise(p * vec2(0.55, 0.34) - vec2(uTime * 0.28, uTime * 0.42));
        float r3 = wNoise(p * 1.15 + vec2(uTime * 0.52, uTime * 0.31));
        vec3 rippleNrm = vec3(
          ((r1 - 0.5) * 0.14 + (r3 - 0.5) * 0.08) * (0.65 + uWaterChop * 0.7),
          1.0,
          ((r2 - 0.5) * 0.14 - (r3 - 0.5) * 0.08) * (0.65 + uWaterChop * 0.7)
        );
        vec3 nrm = normalize(vWaveNormal + rippleNrm * 0.65);

        // Lacy shoreline surf foam ONLY along beaches & coves (vDepth < 1.15m)
        float surfWave = sin(vDepth * 6.0 - uTime * 2.6) * 0.5 + 0.5;
        float lace = wNoise(vWorldPos.xz * 1.55 + vec2(uTime * 0.22, -uTime * 0.18));
        float shoreFoam = (1.0 - smoothstep(0.05, 1.15, vDepth)) * smoothstep(0.30, 0.72, surfWave * 0.62 + lace * 0.55);
        float foam = clamp(shoreFoam, 0.0, 0.90);

        // Golden-hour Fresnel sky reflection + natural sun glitter
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(viewDir, nrm), 0.0), 3.6);
        vec3 skyRefl = mix(vec3(0.24, 0.48, 0.68), vec3(0.90, 0.68, 0.46), pow(max(dot(reflect(-viewDir, nrm), uSunDir), 0.0), 2.3));
        vec3 halfVec = normalize(uSunDir + viewDir);
        float glitter = pow(max(dot(nrm, halfVec), 0.0), 190.0) * 1.35 + pow(max(dot(nrm, halfVec), 0.0), 36.0) * 0.18;

        vec3 finalCol = mix(baseCol, skyRefl, fresnel * 0.56) + vec3(1.0, 0.88, 0.64) * glitter;
        finalCol = mix(finalCol, vec3(0.94, 0.98, 1.0), foam * 0.84);

        float distCamW = length(cameraPosition - vWorldPos);
        float horizonMist = clamp(smoothstep(140.0, 620.0, distCamW) * uMistStrength * 0.6, 0.0, 0.52);
        finalCol = mix(finalCol, uMistColor, horizonMist);

        float horizonFade = 1.0 - smoothstep(700.0, 885.0, length(vWorldPos.xz));
        float alpha = clamp(0.48 + absorb * 0.48 + foam * 0.34, 0.52, 0.95) * horizonFade;
        gl_FragColor = vec4(finalCol, alpha);
      }
    `,
  });
  disposables.push(waterMat);
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = CORAL_BAY_WATER_LEVEL;
  waterMesh.renderOrder = 1;
  group.add(waterMesh);

  // 3. Cove Waterfall ((-32, -92) -> (14, -148))
  // Basalt headwall rock ledges + 3 animated translucent cascade ribbons + 22m radial foam boil ring + 220 GPU mist particles
  const wfGroup = new THREE.Group();
  wfGroup.name = 'CoralBayCoveWaterfall';
  group.add(wfGroup);

  const basaltMat = new THREE.MeshStandardMaterial({
    color: 0x26292e,
    roughness: 0.35,
    metalness: 0.12,
  });
  const mossMat = new THREE.MeshStandardMaterial({
    color: 0x166534,
    roughness: 0.82,
  });
  disposables.push(basaltMat, mossMat);

  const ledgeGeo = new THREE.DodecahedronGeometry(6.5, 1);
  disposables.push(ledgeGeo);
  for (let l = 0; l < 7; l++) {
    const t = l / 6;
    const lx = -32 + (14 - -32) * t * 0.42 + Math.sin(l * 2.1) * 7;
    const lz = -92 + (-148 - -92) * t * 0.42 + Math.cos(l * 1.7) * 5;
    const ly = groundHeightAt(lx, lz);
    const ledge = new THREE.Mesh(ledgeGeo, l % 2 === 0 ? basaltMat : mossMat);
    ledge.position.set(lx, ly - 1.2, lz);
    ledge.scale.set(1.4, 0.85, 1.2);
    wfGroup.add(ledge);
  }

  const wfUniforms = { uTime: { value: 0 } };
  const cascadeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: wfUniforms,
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
        float flow = fract(vUv.y * 3.0 + uTime * 1.55);
        float streak = sin(vUv.x * 26.0 + sin(vUv.y * 12.0 + uTime * 2.0)) * 0.5 + 0.5;
        float foamEdge = smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
        float splashBottom = 1.0 - smoothstep(0.0, 0.25, vUv.y);
        float alpha = (0.48 + streak * 0.32 + splashBottom * 0.25) * foamEdge;
        vec3 col = mix(vec3(0.45, 0.88, 0.96), vec3(0.95, 0.99, 1.0), clamp(streak * 0.5 + flow * 0.3 + splashBottom * 0.5, 0.0, 1.0));
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.88));
      }
    `,
  });
  disposables.push(cascadeMat);

  const buildCascadeRibbon = (start: THREE.Vector3, end: THREE.Vector3, width: number) => {
    const curve = new THREE.CatmullRomCurve3([
      start,
      start.clone().lerp(end, 0.35).add(new THREE.Vector3(0, 6, 0)),
      start.clone().lerp(end, 0.72).add(new THREE.Vector3(0, -4, 0)),
      end,
    ]);
    const cSegs = 24;
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
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };

  const mainCurtainGeo = buildCascadeRibbon(
    new THREE.Vector3(-18, 36, -104),
    new THREE.Vector3(10, 0.1, -142),
    11.5,
  );
  const leftChuteGeo = buildCascadeRibbon(
    new THREE.Vector3(-25, 34, -108),
    new THREE.Vector3(3, 0.1, -144),
    6.2,
  );
  const rightChuteGeo = buildCascadeRibbon(
    new THREE.Vector3(-12, 33, -99),
    new THREE.Vector3(16, 0.1, -138),
    5.8,
  );
  disposables.push(mainCurtainGeo, leftChuteGeo, rightChuteGeo);
  const mainRibbon = new THREE.Mesh(mainCurtainGeo, cascadeMat);
  const leftRibbon = new THREE.Mesh(leftChuteGeo, cascadeMat);
  const rightRibbon = new THREE.Mesh(rightChuteGeo, cascadeMat);
  mainRibbon.renderOrder = 3;
  leftRibbon.renderOrder = 3;
  rightRibbon.renderOrder = 3;
  wfGroup.add(mainRibbon, leftRibbon, rightRibbon);

  // 22m radial foam boil ring at plunge impact (10, 0.12, -142)
  const boilGeo = new THREE.RingGeometry(2.5, 11.0, 32, 1);
  boilGeo.rotateX(-Math.PI / 2);
  const boilMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: wfUniforms,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vPos;
      void main() {
        float r = length(vPos.xz) / 11.0;
        float wave = sin(r * 18.0 - uTime * 4.5) * 0.5 + 0.5;
        float alpha = (1.0 - smoothstep(0.25, 1.0, r)) * (0.35 + wave * 0.45);
        gl_FragColor = vec4(vec3(0.92, 0.98, 1.0), alpha);
      }
    `,
  });
  const boilRing = new THREE.Mesh(boilGeo, boilMat);
  boilRing.position.set(10, 0.12, -142);
  boilRing.renderOrder = 3;
  wfGroup.add(boilRing);
  disposables.push(boilGeo, boilMat);

  // 220 GPU mist particles rising from plunge pool
  const mistCount = 220;
  const mistGeo = new THREE.BufferGeometry();
  const mistSeeds = new Float32Array(mistCount * 3);
  const mistBase = new Float32Array(mistCount * 3);
  for (let i = 0; i < mistCount; i++) {
    const ang = (i * 2.39996) % (Math.PI * 2);
    const rad = (((i * 17) % 100) / 100) * 11.5;
    mistBase[i * 3] = 10 + Math.cos(ang) * rad;
    mistBase[i * 3 + 1] = 0.4;
    mistBase[i * 3 + 2] = -142 + Math.sin(ang) * rad;
    mistSeeds[i * 3] = (i % 41) / 41;
    mistSeeds[i * 3 + 1] = 0.6 + ((i * 7) % 10) * 0.12;
    mistSeeds[i * 3 + 2] = ang;
  }
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistBase, 3));
  mistGeo.setAttribute('aSeed', new THREE.BufferAttribute(mistSeeds, 3));
  const mistMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: wfUniforms,
    vertexShader: `
      attribute vec3 aSeed;
      uniform float uTime;
      varying float vLife;
      void main() {
        float life = fract(aSeed.x + uTime * 0.28 * aSeed.y);
        vLife = life;
        vec3 p = position;
        p.y += life * 11.0;
        p.x += cos(aSeed.z) * life * 4.5;
        p.z += sin(aSeed.z) * life * 4.5;
        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp((16.0 + life * 24.0) * (120.0 / max(-mvPos.z, 1.0)), 2.0, 36.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      varying float vLife;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float soft = 1.0 - d * 2.0;
        float alpha = soft * soft * sin(vLife * 3.14159) * 0.42;
        gl_FragColor = vec4(0.92, 0.98, 1.0, alpha);
      }
    `,
  });
  const mistPoints = new THREE.Points(mistGeo, mistMat);
  mistPoints.frustumCulled = false;
  mistPoints.renderOrder = 4;
  wfGroup.add(mistPoints);
  disposables.push(mistGeo, mistMat);

  return {
    group,
    terrainMesh,
    skirtMesh,
    waterMesh,
    updateWater: (elapsedSec: number) => {
      terrainUniforms.uTime.value = elapsedSec;
      waterMat.uniforms.uTime.value = elapsedSec;
      wfUniforms.uTime.value = elapsedSec;
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
      if (typeof look.waterChop === 'number') {
        waterMat.uniforms.uWaterChop.value = clamp(look.waterChop, 0, 1);
      }
      if (typeof look.waterClarity === 'number') {
        waterMat.uniforms.uWaterClarity.value = clamp(look.waterClarity, 0, 1);
      }
    },
    dispose: () => {
      chunkedTerrain.dispose();
      disposables.forEach((d) => d.dispose());
    },
  };
}
