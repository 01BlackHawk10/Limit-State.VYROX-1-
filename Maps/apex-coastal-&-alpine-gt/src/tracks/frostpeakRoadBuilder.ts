import * as THREE from 'three';
import { FROSTPEAK_WATER_LEVEL } from './frostpeakTerrainField';
import type { ProceduralTextureSet } from './proceduralTextures';
import { buildSharedRoadDetails } from './sharedRoadDetailKit';
import type { ColliderRegistry, MapDefinition, TrackSample } from './types';

export interface FrostpeakRoadHandle {
  update: (elapsed: number) => void;
  setWetness: (wetness: number) => void;
  setSnowAccumulation: (snow: number) => void;
  setNightFactor: (night: number) => void;
  dispose: () => void;
}

/**
 * Winter tarmac shader with tar crack lines, wear patches, salted racing line contrast,
 * meltwater puddles (uWetness with animated raindrop splash rings),
 * and dynamic edge snow accumulation (uRoadSnowAccum) cleared along the rubbered apex groove.
 */
function patchWinterAsphaltMaterial(mat: THREE.MeshStandardMaterial): {
  uTime: { value: number };
  uWetness: { value: number };
  uRoadSnowAccum: { value: number };
} {
  const uniforms = {
    uTime: { value: 0 },
    uWetness: { value: 0.15 },
    uRoadSnowAccum: { value: 0.55 },
  };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWetness = uniforms.uWetness;
    shader.uniforms.uRoadSnowAccum = uniforms.uRoadSnowAccum;

    shader.vertexShader =
      `
      varying vec2 vRoadUv;
      varying vec3 vRoadWorldPos;
      ` +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        vRoadUv = uv;
        vRoadWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `
      );

    shader.fragmentShader =
      `
      uniform float uTime;
      uniform float uWetness;
      uniform float uRoadSnowAccum;
      varying vec2 vRoadUv;
      varying vec3 vRoadWorldPos;

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
      ` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `
          #include <color_fragment>
          float centerDist = abs(vRoadUv.x - 0.5) * 2.0;

          // Salted racing groove & tar crack lines
          float apexClear = exp(-pow(centerDist * 2.4, 2.0));
          float tarCrack = 1.0 - smoothstep(0.0, 0.032, abs(wNoise(vRoadWorldPos.xz * 0.35) - 0.5));
          float saltDust = smoothstep(0.42, 0.85, centerDist) * 0.24;

          // Dynamic edge snow accumulation cleared along the rubbered apex groove
          float snowNoise = wNoise(vRoadWorldPos.xz * 0.28);
          float edgeSnow = smoothstep(0.62 - uRoadSnowAccum * 0.24, 0.98, centerDist + (snowNoise - 0.5) * 0.22) * uRoadSnowAccum * (1.0 - apexClear * 0.9);

          // Meltwater puddles & animated raindrop splash rings
          float puddleMask = smoothstep(0.55, 0.72, wNoise(vRoadWorldPos.xz * 0.12)) * uWetness;
          vec2 dropCell = floor(vRoadWorldPos.xz * 1.9);
          vec2 dropUv = fract(vRoadWorldPos.xz * 1.9) - 0.5;
          float dropPhase = fract(uTime * 1.8 + wHash(dropCell));
          float ring = 1.0 - smoothstep(0.0, 0.09, abs(length(dropUv) - dropPhase * 0.45));
          float splash = ring * (1.0 - dropPhase) * puddleMask;

          float edgeLine = smoothstep(0.905, 0.922, centerDist) * (1.0 - smoothstep(0.952, 0.968, centerDist));
          float centerDash = (1.0 - smoothstep(0.012, 0.024, centerDist)) * step(0.55, fract(vRoadUv.y * 0.14));

          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.008, 0.010, 0.015), tarCrack * 0.68);
          diffuseColor.rgb += vec3(saltDust * 0.08);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.90, 0.95), max(edgeLine, centerDash * 0.72));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.74, 0.82), clamp(edgeSnow * 0.85, 0.0, 0.72));
          diffuseColor.rgb *= mix(0.62, 0.42, clamp(puddleMask * 0.65 + uWetness * 0.45, 0.0, 1.0));
          diffuseColor.rgb += vec3(0.24, 0.36, 0.48) * splash * 0.32;
          `
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `
          #include <roughnessmap_fragment>
          float pMask = smoothstep(0.50, 0.74, wNoise(vRoadWorldPos.xz * 0.16)) * uWetness;
          float rCenter = abs(vRoadUv.x - 0.5) * 2.0;
          float rGroove = exp(-pow(rCenter * 2.6, 2.0));
          float microVar = wNoise(vRoadWorldPos.xz * 0.35);
          roughnessFactor = mix(roughnessFactor, 0.34 + (1.0 - microVar) * 0.16, clamp(pMask + uWetness * 0.46 + rGroove * 0.18, 0.0, 0.78));
          `
        );
  };

  return uniforms;
}

export function buildFrostpeakRoadAndArchBridge(
  parent: THREE.Group,
  mapDef: MapDefinition,
  samples: TrackSample[],
  textures: ProceduralTextureSet,
  registry: ColliderRegistry
): FrostpeakRoadHandle {
  const disposables: { dispose: () => void }[] = [];
  const count = samples.length;
  const hw = mapDef.roadHalfWidth;

  // 1. Crown-Cambered Winter Asphalt Road Deck
  const crossProfile = [
    { lat: -hw, lift: -0.05, u: 0.0 },
    { lat: -hw * 0.5, lift: 0.018, u: 0.25 },
    { lat: 0, lift: 0.055, u: 0.5 },
    { lat: hw * 0.5, lift: 0.018, u: 0.75 },
    { lat: hw, lift: -0.05, u: 1.0 },
  ];
  const cols = crossProfile.length;
  const ringCount = count + 1;

  const roadPos = new Float32Array(ringCount * cols * 3);
  const roadUv = new Float32Array(ringCount * cols * 2);
  const roadIdx: number[] = [];

  for (let i = 0; i <= count; i++) {
    const s = samples[i % count];
    const distV = i === count ? samples[count - 1].distance + 1.0 : s.distance;
    for (let c = 0; c < cols; c++) {
      const p = crossProfile[c];
      const idx = i * cols + c;
      roadPos[idx * 3] = s.x + s.rightX * p.lat;
      roadPos[idx * 3 + 1] = s.y + p.lift;
      roadPos[idx * 3 + 2] = s.z + s.rightZ * p.lat;
      roadUv[idx * 2] = p.u;
      roadUv[idx * 2 + 1] = distV * 0.08;
    }
    if (i < count) {
      for (let c = 0; c < cols - 1; c++) {
        const a = i * cols + c;
        const b = a + 1;
        const d = (i + 1) * cols + c;
        const e = d + 1;
        roadIdx.push(a, b, d, b, e, d);
      }
    }
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.BufferAttribute(roadPos, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(roadUv, 2));
  roadGeo.setIndex(roadIdx);
  roadGeo.computeVertexNormals();
  disposables.push(roadGeo);

  const winterMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.asphaltMap,
    roughnessMap: textures.asphaltRoughness,
    normalMap: textures.asphaltNormal,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.84,
    metalness: 0.02,
    specularIntensity: 0.34,
    specularColor: new THREE.Color(0xc8daec),
    envMapIntensity: 0.42,
  });
  const winterUniforms = patchWinterAsphaltMaterial(winterMat);
  disposables.push(winterMat);

  const roadMesh = new THREE.Mesh(roadGeo, winterMat);
  roadMesh.receiveShadow = true;
  parent.add(roadMesh);

  // 2. Frosted Icy Road Shoulders (0x9cb4ca)
  const shoulderMat = new THREE.MeshStandardMaterial({
    color: 0x9cb4ca,
    roughness: 0.72,
    metalness: 0.08,
  });
  disposables.push(shoulderMat);

  for (const side of [-1, 1]) {
    const sPos = new Float32Array(ringCount * 2 * 3);
    const sUv = new Float32Array(ringCount * 2 * 2);
    const sIdx: number[] = [];
    for (let i = 0; i <= count; i++) {
      const s = samples[i % count];
      const inner = side * (hw + 0.82);
      const outer = side * (hw + 2.55);
      const base = i * 2;
      sPos[base * 3] = s.x + s.rightX * inner;
      sPos[base * 3 + 1] = s.y - 0.08;
      sPos[base * 3 + 2] = s.z + s.rightZ * inner;
      sPos[(base + 1) * 3] = s.x + s.rightX * outer;
      sPos[(base + 1) * 3 + 1] = s.y - 0.44;
      sPos[(base + 1) * 3 + 2] = s.z + s.rightZ * outer;
      sUv[base * 2] = 0;
      sUv[base * 2 + 1] = i * 0.1;
      sUv[(base + 1) * 2] = 1;
      sUv[(base + 1) * 2 + 1] = i * 0.1;

      if (i < count) {
        const a = base;
        const b = base + 1;
        const c = base + 2;
        const d = base + 3;
        if (side === 1) sIdx.push(a, b, c, b, d, c);
        else sIdx.push(a, c, b, b, c, d);
      }
    }
    const shGeo = new THREE.BufferGeometry();
    shGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    shGeo.setAttribute('uv', new THREE.BufferAttribute(sUv, 2));
    shGeo.setIndex(sIdx);
    shGeo.computeVertexNormals();
    disposables.push(shGeo);

    const shMesh = new THREE.Mesh(shGeo, shoulderMat);
    shMesh.receiveShadow = true;
    parent.add(shMesh);
  }

  // 3. S/F Checkered Grid Decal
  const sfSample = samples[0];
  const sfGeo = new THREE.PlaneGeometry(4.2, mapDef.roadWidth - 1.2);
  sfGeo.rotateX(-Math.PI / 2);
  const sfMat = new THREE.MeshStandardMaterial({
    map: textures.checkeredMap,
    roughness: 0.72,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const sfDecal = new THREE.Mesh(sfGeo, sfMat);
  sfDecal.position.set(sfSample.x, sfSample.y + 0.075, sfSample.z);
  sfDecal.rotation.y = -Math.atan2(sfSample.tangentZ, sfSample.tangentX);
  parent.add(sfDecal);
  disposables.push(sfGeo, sfMat);

  // 4. Twin Brushed-Steel Parabolic Arch Bridge (bridgeHub: (55, 185), deckThick: 1.5m, 19.5m arch peak)
  const bridgeSamples = samples.filter((s) => s.isBridge);
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.78,
    metalness: 0.08,
  });
  const brushedSteelMat = new THREE.MeshPhysicalMaterial({
    color: 0x64748b,
    roughness: 0.40,
    metalness: 0.84,
    envMapIntensity: 0.62,
  });
  const bollardGlowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.5,
  });
  disposables.push(concreteMat, brushedSteelMat, bollardGlowMat);

  if (bridgeSamples.length > 10) {
    const deckThick = 1.5;
    const deckSegGeo = new THREE.BoxGeometry(3.2, deckThick, mapDef.roadWidth + 3.4);
    const railBarGeo = new THREE.BoxGeometry(3.2, 0.16, 0.16);
    const bollardGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.15, 8);
    const pierGeo = new THREE.CylinderGeometry(1.3, 1.7, 1, 10);
    const hangerGeo = new THREE.CylinderGeometry(0.11, 0.11, 1, 6);
    disposables.push(deckSegGeo, railBarGeo, bollardGeo, pierGeo, hangerGeo);

    const dummy = new THREE.Object3D();
    const deckMats: THREE.Matrix4[] = [];
    const railMats: THREE.Matrix4[] = [];
    const bollardMats: THREE.Matrix4[] = [];

    for (let i = 0; i < bridgeSamples.length - 1; i += 2) {
      const s = bridgeSamples[i];
      const yaw = -Math.atan2(s.tangentZ, s.tangentX);

      dummy.position.set(s.x, s.y - deckThick * 0.5 - 0.04, s.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      deckMats.push(dummy.matrix.clone());

      const next = bridgeSamples[Math.min(i + 2, bridgeSamples.length - 1)];
      for (const side of [-1, 1]) {
        const rx = s.x + s.rightX * side * (hw + 1.2);
        const rz = s.z + s.rightZ * side * (hw + 1.2);
        dummy.position.set(rx, s.y + 0.95, rz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        railMats.push(dummy.matrix.clone());

        if (i % 12 === 0) {
          dummy.position.set(rx, s.y + 0.58, rz);
          dummy.updateMatrix();
          bollardMats.push(dummy.matrix.clone());
        }

        registry.walls.push({
          id: `fp_bridge_wall_${side}_${i}`,
          kind: 'bridge',
          ax: rx,
          az: rz,
          bx: next.x + next.rightX * side * (hw + 1.2),
          bz: next.z + next.rightZ * side * (hw + 1.2),
          y: s.y,
          radius: 0.55,
        });
      }
    }

    const deckInst = new THREE.InstancedMesh(deckSegGeo, concreteMat, deckMats.length);
    deckMats.forEach((m, idx) => deckInst.setMatrixAt(idx, m));
    deckInst.instanceMatrix.needsUpdate = true;
    deckInst.receiveShadow = true;
    deckInst.computeBoundingSphere();
    parent.add(deckInst);

    const railInst = new THREE.InstancedMesh(railBarGeo, brushedSteelMat, railMats.length);
    railMats.forEach((m, idx) => railInst.setMatrixAt(idx, m));
    railInst.instanceMatrix.needsUpdate = true;
    railInst.computeBoundingSphere();
    parent.add(railInst);

    const bolInst = new THREE.InstancedMesh(bollardGeo, bollardGlowMat, bollardMats.length);
    bollardMats.forEach((m, idx) => bolInst.setMatrixAt(idx, m));
    bolInst.instanceMatrix.needsUpdate = true;
    bolInst.computeBoundingSphere();
    parent.add(bolInst);

    // Ice-breaker concrete piers reaching below lake bed (-8m)
    const pierAnchorY = FROSTPEAK_WATER_LEVEL - 14;
    for (let i = 20; i < bridgeSamples.length - 20; i += 44) {
      const s = bridgeSamples[i];
      const deckBot = s.y - deckThick;
      const h = Math.max(4, deckBot - pierAnchorY);
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(pierGeo, concreteMat);
        p.scale.set(1, h, 1);
        p.position.set(
          s.x + s.rightX * side * (hw * 0.72),
          pierAnchorY + h * 0.5,
          s.z + s.rightZ * side * (hw * 0.72)
        );
        parent.add(p);
      }
    }

    // Twin overhead parabolic brushed-steel arch ribs (19.5m peak height) + vertical tie-rod hangers + wind-bracing struts
    const midIdx = Math.floor(bridgeSamples.length / 2);
    const archStart = bridgeSamples[Math.max(0, midIdx - 70)];
    const archEnd = bridgeSamples[Math.min(bridgeSamples.length - 1, midIdx + 70)];
    const archCenter = bridgeSamples[midIdx];
    const spanPts = 24;
    const archPeak = 19.5;

    for (const side of [-1, 1]) {
      const curvePts: THREE.Vector3[] = [];
      for (let k = 0; k <= spanPts; k++) {
        const u = k / spanPts;
        const sIdx = Math.round(
          THREE.MathUtils.lerp(Math.max(0, midIdx - 70), Math.min(bridgeSamples.length - 1, midIdx + 70), u)
        );
        const s = bridgeSamples[sIdx];
        const parabola = 4 * u * (1 - u);
        const px = s.x + s.rightX * side * (hw + 1.05);
        const py = s.y + parabola * archPeak;
        const pz = s.z + s.rightZ * side * (hw + 1.05);
        curvePts.push(new THREE.Vector3(px, py, pz));

        // Vertical tie-rod hangers every 2 steps
        if (k > 1 && k < spanPts - 1 && k % 2 === 0) {
          const rodH = parabola * archPeak;
          const hanger = new THREE.Mesh(hangerGeo, brushedSteelMat);
          hanger.scale.set(1, rodH, 1);
          hanger.position.set(px, s.y + rodH * 0.5, pz);
          parent.add(hanger);
        }
      }
      const archCurve = new THREE.CatmullRomCurve3(curvePts);
      const archGeo = new THREE.TubeGeometry(archCurve, 32, 0.52, 8, false);
      disposables.push(archGeo);
      const archMesh = new THREE.Mesh(archGeo, brushedSteelMat);
      archMesh.castShadow = true;
      parent.add(archMesh);
    }

    // Overhead wind-bracing cross struts connecting twin arch ribs
    const strutGeo = new THREE.CylinderGeometry(0.22, 0.22, (hw + 1.05) * 2, 8);
    disposables.push(strutGeo);
    for (const frac of [0.28, 0.4, 0.5, 0.6, 0.72]) {
      const sIdx = Math.round(
        THREE.MathUtils.lerp(Math.max(0, midIdx - 70), Math.min(bridgeSamples.length - 1, midIdx + 70), frac)
      );
      const s = bridgeSamples[sIdx];
      const parabola = 4 * frac * (1 - frac);
      const strut = new THREE.Mesh(strutGeo, brushedSteelMat);
      strut.position.set(s.x, s.y + parabola * archPeak, s.z);
      strut.rotation.x = Math.PI / 2;
      strut.rotation.z = Math.atan2(s.tangentZ, s.tangentX);
      parent.add(strut);
    }

    // Center beacon PointLight
    const centerBeacon = new THREE.PointLight(0x38bdf8, 18, 95, 1.8);
    centerBeacon.position.set(archCenter.x, archCenter.y + 8.5, archCenter.z);
    parent.add(centerBeacon);
    void archStart;
    void archEnd;
  }

  // 5. Shared 3D FIA Curbs, Concrete Drainage Gutters, Storm-Drain Grates, Double-Tier W-beam Guardrails & Cat-Eyes
  const details = buildSharedRoadDetails(parent, {
    mapId: 'frostpeak_pass',
    roadHalfWidth: hw,
    samples,
    registry,
    textures,
    curbPrimaryHex: 0x0284c7,
    curbSecondaryHex: 0xdbeafe,
    reflectorHex: 0x38bdf8,
  });

  return {
    update: (elapsed: number) => {
      winterUniforms.uTime.value = elapsed;
    },
    setWetness: (wetness: number) => {
      winterUniforms.uWetness.value = wetness;
      details.setWetness(wetness);
    },
    setSnowAccumulation: (snow: number) => {
      winterUniforms.uRoadSnowAccum.value = snow;
    },
    setNightFactor: (night: number) => {
      bollardGlowMat.emissiveIntensity = 0.8 + night * 1.8;
    },
    dispose: () => {
      details.dispose();
      disposables.forEach((d) => d.dispose());
    },
  };
}
