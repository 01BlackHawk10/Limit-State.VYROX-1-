import * as THREE from 'three';
import { CORAL_BAY_WATER_LEVEL } from './coralBayTerrainField';
import type { ProceduralTextureSet } from './proceduralTextures';
import { clamp, fbm2D, smoothstep } from './terrainField';
import type { TerrainField } from './types';

export interface TerrainTile {
  mesh: THREE.Mesh;
  centerX: number;
  centerZ: number;
}

export interface CoralBayTerrainHandle {
  tiles: TerrainTile[];
  update: (
    elapsed: number,
    solarDeg: number,
    waterChop: number,
    waterClarity: number,
    wetness: number
  ) => void;
  updateChunkCulling: (cameraPos: THREE.Vector3) => void;
  dispose: () => void;
}

/**
 * Shared chunked terrain builder (1120x1120m span, 240x240 segments or 160x160 on software GL)
 * partitioned into 8x8 spatial tiles culled within 600m visibility radius.
 */
export function buildChunkedTerrainTiles(
  parent: THREE.Group,
  terrain: TerrainField,
  isSoftwareGl: boolean,
  material: THREE.Material,
  computeVertexData: (
    x: number,
    y: number,
    z: number,
    slope: number,
    padWeight: number
  ) => [number, number, number]
): { tiles: TerrainTile[]; geometries: THREE.BufferGeometry[] } {
  const totalSpan = 1120;
  const halfSpan = totalSpan / 2;
  const totalSegs = isSoftwareGl ? 160 : 240;
  const chunksPerAxis = 8;
  const segsPerChunk = totalSegs / chunksPerAxis;
  const chunkSpan = totalSpan / chunksPerAxis;

  const tiles: TerrainTile[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  for (let cz = 0; cz < chunksPerAxis; cz++) {
    for (let cx = 0; cx < chunksPerAxis; cx++) {
      const startX = -halfSpan + cx * chunkSpan;
      const startZ = -halfSpan + cz * chunkSpan;
      const vertsPerSide = segsPerChunk + 1;
      const vertCount = vertsPerSide * vertsPerSide;

      const positions = new Float32Array(vertCount * 3);
      const uvs = new Float32Array(vertCount * 2);
      const attrA = new Float32Array(vertCount);
      const attrB = new Float32Array(vertCount);
      const attrC = new Float32Array(vertCount);

      let ptr = 0;
      for (let j = 0; j < vertsPerSide; j++) {
        const vz = startZ + (j / segsPerChunk) * chunkSpan;
        for (let i = 0; i < vertsPerSide; i++) {
          const vx = startX + (i / segsPerChunk) * chunkSpan;
          const vy = terrain.getHeight(vx, vz);
          const slope = terrain.getSlope(vx, vz);
          const padW = terrain.isPitOrGrandstandPad(vx, vz);
          const [a, b, c] = computeVertexData(vx, vy, vz, slope, padW);

          positions[ptr * 3] = vx;
          positions[ptr * 3 + 1] = vy;
          positions[ptr * 3 + 2] = vz;

          uvs[ptr * 2] = (vx + halfSpan) / totalSpan;
          uvs[ptr * 2 + 1] = (vz + halfSpan) / totalSpan;

          attrA[ptr] = a;
          attrB[ptr] = b;
          attrC[ptr] = c;
          ptr++;
        }
      }

      const indices = new Uint16Array(segsPerChunk * segsPerChunk * 6);
      let idxPtr = 0;
      for (let j = 0; j < segsPerChunk; j++) {
        for (let i = 0; i < segsPerChunk; i++) {
          const a = j * vertsPerSide + i;
          const b = a + 1;
          const c = (j + 1) * vertsPerSide + i;
          const d = c + 1;
          indices[idxPtr++] = a;
          indices[idxPtr++] = c;
          indices[idxPtr++] = b;
          indices[idxPtr++] = b;
          indices[idxPtr++] = c;
          indices[idxPtr++] = d;
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      const attrNameA = terrain.mapId === 'coral_bay' ? 'aSandWeight' : 'aSnowWeight';
      geo.setAttribute(attrNameA, new THREE.BufferAttribute(attrA, 1));
      geo.setAttribute('aRockWeight', new THREE.BufferAttribute(attrB, 1));
      geo.setAttribute('aCavityAO', new THREE.BufferAttribute(attrC, 1));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      geo.computeVertexNormals();
      geometries.push(geo);

      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      parent.add(mesh);

      tiles.push({
        mesh,
        centerX: startX + chunkSpan * 0.5,
        centerZ: startZ + chunkSpan * 0.5,
      });
    }
  }

  return { tiles, geometries };
}

export function buildCoralBayTerrainAndWater(
  parent: THREE.Group,
  terrain: TerrainField,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): CoralBayTerrainHandle {
  const disposables: { dispose: () => void }[] = [];

  // 1. Coral Bay Coastal PBR Terrain Material with triplanar strata/turf detail maps, sand ripples & basalt cliffs
  const terrainUniforms = {
    uWetness: { value: 0.0 },
    uTime: { value: 0.0 },
    uDetailMap: { value: textures.terrainDetailMap },
    uDetailNormal: { value: textures.terrainDetailNormal },
  };

  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.02,
    envMapIntensity: 0.36,
  });

  terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWetness = terrainUniforms.uWetness;
    shader.uniforms.uTime = terrainUniforms.uTime;
    shader.uniforms.uDetailMap = terrainUniforms.uDetailMap;
    shader.uniforms.uDetailNormal = terrainUniforms.uDetailNormal;

    shader.vertexShader =
      `
      attribute float aSandWeight;
      attribute float aRockWeight;
      attribute float aCavityAO;
      varying float vSandWeight;
      varying float vRockWeight;
      varying float vCavityAO;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;
      varying vec3 vViewAxisX;
      varying vec3 vViewAxisZ;
      ` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vSandWeight = aSandWeight;
        vRockWeight = aRockWeight;
        vCavityAO = aCavityAO;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        vViewAxisX = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vViewAxisZ = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        `
      );

    shader.fragmentShader =
      `
      uniform float uWetness;
      uniform float uTime;
      uniform sampler2D uDetailMap;
      uniform sampler2D uDetailNormal;
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
      vec3 cbTriSample(sampler2D tex, vec3 wp, vec3 wN, float scale) {
        vec3 b = pow(abs(wN), vec3(3.0));
        b /= max(b.x + b.y + b.z, 0.001);
        return texture2D(tex, wp.xy * scale).rgb * b.z
             + texture2D(tex, wp.zy * scale).rgb * b.x
             + texture2D(tex, wp.xz * scale).rgb * b.y;
      }
      ` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `
          #include <color_fragment>
          // Multi-scale anti-tiling geological & botanical micro-detail
          float nLarge = cbNoise(vWorldPos.xz * 0.028);
          float nMid = cbNoise(vWorldPos.xz * 0.14 + vec2(4.2, 1.9));
          float nFine = cbNoise(vWorldPos.xz * 0.68);
          float nGrain = cbNoise(vWorldPos.xz * 2.8);

          float detailMacro = cbTriSample(uDetailMap, vWorldPos, vWorldNormal, 0.048).r;
          float detailMicro = cbTriSample(uDetailMap, vWorldPos, vWorldNormal, 0.28).r;
          float texDetail = mix(detailMacro, detailMicro, 0.56);

          // Wind-rippled coral beach sand, shell shingle transition & wet tidal zone
          float sandRipple = sin(vWorldPos.x * 2.4 + vWorldPos.z * 0.6 + cbNoise(vWorldPos.xz * 0.35) * 3.8) * 0.055;
          vec3 sandDry = mix(vec3(0.76, 0.63, 0.41), vec3(0.50, 0.40, 0.25), nLarge * 0.52 + nFine * 0.48);
          sandDry *= (0.84 + detailMicro * 0.32 + sandRipple);
          vec3 shingle = mix(vec3(0.32, 0.27, 0.20), vec3(0.46, 0.40, 0.31), detailMicro);
          float shingleBand = smoothstep(0.18, 0.48, vSandWeight) * (1.0 - smoothstep(0.52, 0.85, vSandWeight));
          sandDry = mix(sandDry, shingle, shingleBand * 0.62);
          vec3 sandWet = vec3(0.22, 0.16, 0.09);
          float tidalWet = 1.0 - smoothstep(-0.1, 1.42, vWorldPos.y);
          vec3 sandCol = mix(sandDry, sandWet, clamp(tidalWet + uWetness * 0.36, 0.0, 1.0));

          // Sunlit tropical meadow, golden coastal dry-grass & volcanic loam soil pockets
          vec3 lushGrass = vec3(0.036, 0.115, 0.026);
          vec3 sunlitGrass = vec3(0.115, 0.155, 0.036);
          vec3 drySavanna = vec3(0.165, 0.132, 0.048);
          vec3 coastalLoam = vec3(0.088, 0.058, 0.032);
          vec3 turfEmerald = mix(lushGrass, sunlitGrass, clamp(nLarge * 0.65 + nMid * 0.35, 0.0, 1.0));
          turfEmerald = mix(turfEmerald, drySavanna, smoothstep(0.54, 0.88, nLarge) * 0.56);
          turfEmerald = mix(turfEmerald, coastalLoam, smoothstep(0.56, 0.90, nMid) * 0.52);
          turfEmerald *= (0.68 + detailMicro * 0.58) * (0.82 + nGrain * 0.36);

          // Layered volcanic basalt cliff strata with weathered iron veins & mossy rock ledges (domain-warped, non-ringed)
          float strataWarp = nLarge * 7.5 + nMid * 3.8 + detailMacro * 4.5;
          float strataBand = cbNoise(vec2(vWorldPos.y * 0.55 + strataWarp, (vWorldPos.x + vWorldPos.z) * 0.04));
          vec3 basaltDark = vec3(0.026, 0.026, 0.031);
          vec3 basaltWarm = vec3(0.145, 0.112, 0.086);
          vec3 basaltCliff = mix(basaltDark, basaltWarm, smoothstep(0.22, 0.80, mix(texDetail, strataBand, 0.45)));
          float ledgeMoss = smoothstep(0.42, 0.78, vWorldNormal.y) * (1.0 - smoothstep(32.0, 62.0, vWorldPos.y));
          basaltCliff = mix(basaltCliff, vec3(0.048, 0.105, 0.032), ledgeMoss * 0.58);
          basaltCliff *= (0.70 + detailMicro * 0.58);

          vec3 col = mix(turfEmerald, sandCol, vSandWeight);
          col = mix(col, basaltCliff, vRockWeight);
          col *= mix(0.42, 1.16, vCavityAO);
          diffuseColor.rgb *= col;
          `
        )
        .replace(
          '#include <normal_fragment_maps>',
          `
          #include <normal_fragment_maps>
          float hC = cbTerrainBump(vWorldPos.xz);
          float hX = cbTerrainBump(vWorldPos.xz + vec2(0.35, 0.0));
          float hZ = cbTerrainBump(vWorldPos.xz + vec2(0.0, 0.35));
          vec3 triNrm = cbTriSample(uDetailNormal, vWorldPos, vWorldNormal, 0.25) * 2.0 - 1.0;
          float flatFade = clamp(vWorldNormal.y * 1.45, 0.14, 1.0);
          float bumpAmp = mix(0.85, 1.45, vRockWeight) * (1.0 - vSandWeight * 0.45) * flatFade;
          float gx = (hC - hX) * bumpAmp + triNrm.x * mix(0.42, 0.88, vRockWeight);
          float gz = (hC - hZ) * bumpAmp + triNrm.y * mix(0.42, 0.88, vRockWeight);
          normal = normalize(normal + vViewAxisX * gx + vViewAxisZ * gz);
          `
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `
          #include <roughnessmap_fragment>
          float wetBand = (1.0 - smoothstep(-0.1, 1.4, vWorldPos.y)) * vSandWeight;
          roughnessFactor = mix(roughnessFactor, 0.18, clamp(wetBand * 0.9 + uWetness * 0.48, 0.0, 0.9));
          `
        );
  };
  disposables.push(terrainMat);

  const { tiles, geometries } = buildChunkedTerrainTiles(
    parent,
    terrain,
    isSoftwareGl,
    terrainMat,
    (x, y, z, slope, padW) => {
      const beachProx = smoothstep(200, 295, z);
      const lowShore = 1 - smoothstep(1.2, 6.2, y);
      const sandW = clamp(Math.max(lowShore, beachProx * (1 - smoothstep(9, 18, y))) * (1 - padW * 0.85), 0, 1);
      const rockW = clamp(smoothstep(0.55, 1.28, slope) + smoothstep(34, 66, y) * 0.6, 0, 1);
      const ao = clamp(0.68 + fbm2D(x * 0.03, z * 0.03, 2) * 0.18 + smoothstep(0, 18, y) * 0.16 - rockW * 0.14, 0.45, 1.0);
      return [sandW, rockW, ao];
    }
  );
  geometries.forEach((g) => disposables.push(g));

  // 2. Tropical Ocean & Coral Lagoon Water Shader (y = 0.0 m)
  const waterGeo = new THREE.PlaneGeometry(1800, 1800, isSoftwareGl ? 96 : 140, isSoftwareGl ? 96 : 140);
  waterGeo.rotateX(-Math.PI / 2);
  disposables.push(waterGeo);

  // Sample bed depth at water vertices for Beer-Lambert absorption
  const wPos = waterGeo.attributes.position;
  const depths = new Float32Array(wPos.count);
  for (let i = 0; i < wPos.count; i++) {
    const wx = wPos.getX(i);
    const wz = wPos.getZ(i);
    const bedY = Math.abs(wx) <= 555 && Math.abs(wz) <= 555 ? terrain.getHeight(wx, wz) : -10.5;
    depths[i] = Math.max(0, CORAL_BAY_WATER_LEVEL - bedY);
  }
  waterGeo.setAttribute('aWaterDepth', new THREE.BufferAttribute(depths, 1));

  const waterMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.6, 0.55, 0.4).normalize() },
      uWaterChop: { value: 0.45 },
      uWaterClarity: { value: 0.82 },
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
        float caustic = pow(clamp(1.0 - abs(c1 - c2) * 4.0, 0.0, 1.0), 3.0);
        baseCol += vec3(0.20, 0.48, 0.52) * caustic * (1.0 - smoothstep(0.8, 7.5, vDepth)) * uWaterClarity;

        // Organic wind-swept ocean ripple normals (zero repeating grid spots)
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
        float fresnel = pow(1.0 - max(dot(viewDir, nrm), 0.0), 3.8);
        vec3 skyRefl = mix(vec3(0.24, 0.48, 0.68), vec3(0.84, 0.64, 0.46), pow(max(dot(reflect(-viewDir, nrm), uSunDir), 0.0), 2.5));
        vec3 halfVec = normalize(uSunDir + viewDir);
        float glitter = pow(max(dot(nrm, halfVec), 0.0), 160.0) * 1.15;

        vec3 finalCol = mix(baseCol, skyRefl, fresnel * 0.52) + vec3(1.0, 0.86, 0.62) * glitter;
        finalCol = mix(finalCol, vec3(0.92, 0.96, 0.99), foam * 0.82);

        float horizonFade = 1.0 - smoothstep(700.0, 885.0, length(vWorldPos.xz));
        float alpha = clamp(0.48 + absorb * 0.48 + foam * 0.34, 0.52, 0.95) * horizonFade;
        gl_FragColor = vec4(finalCol, alpha);
      }
    `,
  });
  disposables.push(waterMat);

  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = CORAL_BAY_WATER_LEVEL;
  waterMesh.renderOrder = 2;
  parent.add(waterMesh);

  // 3. Cove Waterfall ((-32, -92) -> (14, -148))
  // Basalt headwall rock ledges + 3 animated translucent cascade ribbons + 22m radial foam boil ring + 220 GPU mist particles
  const wfGroup = new THREE.Group();
  parent.add(wfGroup);

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
    const ly = terrain.getHeight(lx, lz);
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
    const segs = 24;
    const pts = curve.getPoints(segs);
    const positions = new Float32Array((segs + 1) * 2 * 3);
    const uvs = new Float32Array((segs + 1) * 2 * 2);
    const indices: number[] = [];

    const dir = new THREE.Vector3().subVectors(end, start).setY(0).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width * 0.5);

    for (let i = 0; i <= segs; i++) {
      const p = pts[i];
      const v = i / segs;
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

      if (i < segs) {
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
    11.5
  );
  const leftChuteGeo = buildCascadeRibbon(
    new THREE.Vector3(-25, 34, -108),
    new THREE.Vector3(3, 0.1, -144),
    6.2
  );
  const rightChuteGeo = buildCascadeRibbon(
    new THREE.Vector3(-12, 33, -99),
    new THREE.Vector3(16, 0.1, -138),
    5.8
  );
  disposables.push(mainCurtainGeo, leftChuteGeo, rightChuteGeo);

  const mainRibbon = new THREE.Mesh(mainCurtainGeo, cascadeMat);
  const leftRibbon = new THREE.Mesh(leftChuteGeo, cascadeMat);
  const rightRibbon = new THREE.Mesh(rightChuteGeo, cascadeMat);
  mainRibbon.renderOrder = 3;
  leftRibbon.renderOrder = 3;
  rightRibbon.renderOrder = 3;
  wfGroup.add(mainRibbon, leftRibbon, rightRibbon);

  // 22m radial foam boil ring at plunge impact (14, 0.08, -148)
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
    const rad = ((i * 17) % 100) / 100 * 11.5;
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
        float soft = (1.0 - d * 2.0);
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
    tiles,
    update: (elapsed, solarDeg, waterChop, waterClarity, wetness) => {
      terrainUniforms.uTime.value = elapsed;
      terrainUniforms.uWetness.value = wetness;
      waterMat.uniforms.uTime.value = elapsed;
      waterMat.uniforms.uWaterChop.value = waterChop;
      waterMat.uniforms.uWaterClarity.value = waterClarity;
      const elevRad = THREE.MathUtils.degToRad(Math.max(2, solarDeg));
      waterMat.uniforms.uSunDir.value
        .set(Math.cos(elevRad) * 0.72, Math.sin(elevRad), Math.cos(elevRad) * 0.68)
        .normalize();
      wfUniforms.uTime.value = elapsed;
    },
    updateChunkCulling: (cameraPos) => {
      const maxDistSq = 1250 * 1250;
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i];
        const dx = cameraPos.x - t.centerX;
        const dz = cameraPos.z - t.centerZ;
        t.mesh.visible = dx * dx + dz * dz <= maxDistSq;
      }
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
