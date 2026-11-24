import * as THREE from 'three';
import { CORAL_BAY_WATER_LEVEL } from './coralBayTerrainField';
import type { ProceduralTextureSet } from './proceduralTextures';
import { buildSharedRoadDetails } from './sharedRoadDetailKit';
import type { ColliderRegistry, MapDefinition, TrackSample } from './types';

export interface CoralBayRoadHandle {
  setWetness: (wetness: number) => void;
  setNightFactor: (night: number) => void;
  dispose: () => void;
}

/**
 * Patches MeshStandardMaterial with weathered coastal asphalt wear,
 * tire rubbering along racing groove, and sandy shoulder dust (edgeDustRgb).
 */
export function patchWeatheredAsphaltMaterial(
  mat: THREE.MeshStandardMaterial,
  edgeDustRgb: [number, number, number]
): {
  uRubberLevel: { value: number };
  uAsphaltWear: { value: number };
  uWetness: { value: number };
} {
  const uniforms = {
    uRubberLevel: { value: 0.72 },
    uAsphaltWear: { value: 0.48 },
    uWetness: { value: 0.0 },
  };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRubberLevel = uniforms.uRubberLevel;
    shader.uniforms.uAsphaltWear = uniforms.uAsphaltWear;
    shader.uniforms.uWetness = uniforms.uWetness;

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
      uniform float uRubberLevel;
      uniform float uAsphaltWear;
      uniform float uWetness;
      varying vec2 vRoadUv;
      varying vec3 vRoadWorldPos;

      float rHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float rNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(rHash(i), rHash(i + vec2(1.0, 0.0)), u.x),
          mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      ` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `
          #include <color_fragment>
          // Cross-section U is in [0, 1] across the 15m deck
          float centerDist = abs(vRoadUv.x - 0.5) * 2.0;
          float groove = exp(-pow((centerDist - 0.24) * 4.5, 2.0)) * uRubberLevel;
          float edgeDust = smoothstep(0.84, 1.0, centerDist);
          float microGrain = (rNoise(vRoadWorldPos.xz * 3.5) - 0.5) * 0.035 * uAsphaltWear;

          // Crisp white edge stripes & center dashed guide
          float edgeLine = smoothstep(0.905, 0.922, centerDist) * (1.0 - smoothstep(0.952, 0.968, centerDist));
          float centerDash = (1.0 - smoothstep(0.012, 0.024, centerDist)) * step(0.55, fract(vRoadUv.y * 0.14));

          vec3 dustCol = vec3(${edgeDustRgb[0].toFixed(2)}, ${edgeDustRgb[1].toFixed(2)}, ${edgeDustRgb[2].toFixed(2)}) * 0.42;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.008, 0.010, 0.014), groove * 0.62);
          diffuseColor.rgb = max(diffuseColor.rgb + microGrain * 1.35, vec3(0.006));
          diffuseColor.rgb = mix(diffuseColor.rgb, dustCol * 0.85, edgeDust * 0.34);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.90, 0.93, 0.96), max(edgeLine, centerDash * 0.72));
          diffuseColor.rgb *= mix(0.68, 0.44, uWetness * 0.75);
          `
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `
          #include <roughnessmap_fragment>
          float cDist = abs(vRoadUv.x - 0.5) * 2.0;
          float rGroove = exp(-pow((cDist - 0.24) * 4.5, 2.0)) * uRubberLevel;
          float dampVar = rNoise(vRoadWorldPos.xz * 0.22);
          float dampMask = clamp(uWetness * (0.62 + dampVar * 0.52) + rGroove * 0.28, 0.0, 1.0);
          roughnessFactor = mix(roughnessFactor, 0.30 + (1.0 - dampVar) * 0.16, dampMask * 0.80);
          `
        );
  };

  return uniforms;
}

export function buildCoralBayRoadAndCauseway(
  parent: THREE.Group,
  mapDef: MapDefinition,
  samples: TrackSample[],
  textures: ProceduralTextureSet,
  registry: ColliderRegistry
): CoralBayRoadHandle {
  const disposables: { dispose: () => void }[] = [];
  const count = samples.length;
  const hw = mapDef.roadHalfWidth;

  // 1. Crown-Cambered Road Cross-Section (lifts: [-0.05 .. +0.055])
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

  const asphaltMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: textures.asphaltMap,
    roughnessMap: textures.asphaltRoughness,
    normalMap: textures.asphaltNormal,
    normalScale: new THREE.Vector2(1.05, 1.05),
    roughness: 0.80,
    metalness: 0.02,
    specularIntensity: 0.46,
    specularColor: new THREE.Color(0xffe0b8),
    envMapIntensity: 0.58,
  });
  const roadUniforms = patchWeatheredAsphaltMaterial(asphaltMat, [0.64, 0.58, 0.44]);
  disposables.push(asphaltMat);

  const roadMesh = new THREE.Mesh(roadGeo, asphaltMat);
  roadMesh.receiveShadow = true;
  parent.add(roadMesh);

  // 2. Sun-Bleached Timber / Sandstone Boardwalk Shoulders (0xbda27e)
  const shoulderMat = new THREE.MeshStandardMaterial({
    color: 0xbda27e,
    map: textures.timberMap,
    roughness: 0.88,
    metalness: 0.02,
  });
  disposables.push(shoulderMat);

  for (const side of [-1, 1]) {
    const sPos = new Float32Array(ringCount * 2 * 3);
    const sUv = new Float32Array(ringCount * 2 * 2);
    const sIdx: number[] = [];
    for (let i = 0; i <= count; i++) {
      const s = samples[i % count];
      const distV = i === count ? samples[count - 1].distance + 1.0 : s.distance;
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
      sUv[base * 2 + 1] = distV * 0.12;
      sUv[(base + 1) * 2] = 1;
      sUv[(base + 1) * 2 + 1] = distV * 0.12;

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

  // 3. Start/Finish Checkered Grid Decal
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

  // 4. Multi-Span Coral Lagoon Causeway Bridge (bridgeHub: (85, -245), deckThick: 1.45m)
  const bridgeSamples = samples.filter((s) => s.isBridge);
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.78,
    metalness: 0.08,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.28,
    metalness: 0.88,
  });
  const bollardGlowMat = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  disposables.push(concreteMat, steelMat, bollardGlowMat);

  if (bridgeSamples.length > 10) {
    const deckThick = 1.45;
    const deckSegGeo = new THREE.BoxGeometry(3.2, deckThick, mapDef.roadWidth + 3.2);
    const railPostGeo = new THREE.BoxGeometry(0.18, 1.15, 0.18);
    const railBarGeo = new THREE.BoxGeometry(3.2, 0.14, 0.14);
    const pierCylGeo = new THREE.CylinderGeometry(1.15, 1.35, 1, 14);
    const pierCapGeo = new THREE.BoxGeometry(2.8, 1.2, mapDef.roadWidth + 2.2);
    const bollardGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.1, 8);
    disposables.push(deckSegGeo, railPostGeo, railBarGeo, pierCylGeo, pierCapGeo, bollardGeo);

    const dummy = new THREE.Object3D();
    const deckMats: THREE.Matrix4[] = [];
    const railMats: THREE.Matrix4[] = [];
    const bollardMats: THREE.Matrix4[] = [];

    for (let i = 0; i < bridgeSamples.length - 1; i += 2) {
      const s = bridgeSamples[i];
      const yaw = -Math.atan2(s.tangentZ, s.tangentX);

      // Box-girder deck segment
      dummy.position.set(s.x, s.y - deckThick * 0.5 - 0.04, s.z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      deckMats.push(dummy.matrix.clone());

      // Brushed steel bridge rails & concrete bridge spline colliders
      const next = bridgeSamples[Math.min(i + 2, bridgeSamples.length - 1)];
      for (const side of [-1, 1]) {
        const rx = s.x + s.rightX * side * (hw + 1.15);
        const rz = s.z + s.rightZ * side * (hw + 1.15);
        dummy.position.set(rx, s.y + 0.95, rz);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        railMats.push(dummy.matrix.clone());

        if (i % 12 === 0) {
          dummy.position.set(rx, s.y + 0.55, rz);
          dummy.updateMatrix();
          bollardMats.push(dummy.matrix.clone());
        }

        registry.walls.push({
          id: `cb_bridge_wall_${side}_${i}`,
          kind: 'bridge',
          ax: rx,
          az: rz,
          bx: next.x + next.rightX * side * (hw + 1.15),
          bz: next.z + next.rightZ * side * (hw + 1.15),
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

    const railInst = new THREE.InstancedMesh(railBarGeo, steelMat, railMats.length);
    railMats.forEach((m, idx) => railInst.setMatrixAt(idx, m));
    railInst.instanceMatrix.needsUpdate = true;
    railInst.computeBoundingSphere();
    parent.add(railInst);

    const bolInst = new THREE.InstancedMesh(bollardGeo, bollardGlowMat, bollardMats.length);
    bollardMats.forEach((m, idx) => bolInst.setMatrixAt(idx, m));
    bolInst.instanceMatrix.needsUpdate = true;
    bolInst.computeBoundingSphere();
    parent.add(bolInst);

    // Cylindrical caisson piers anchored below lagoon floor (CORAL_BAY_WATER_LEVEL - 4.5) + crossbeam caps
    const pierStep = 34;
    const pierAnchorY = CORAL_BAY_WATER_LEVEL - 4.5 - 24; // anchored well beneath -28m lagoon floor
    const pierIndices: number[] = [];
    for (let i = 16; i < bridgeSamples.length - 16; i += pierStep) {
      pierIndices.push(i);
      const s = bridgeSamples[i];
      const yaw = -Math.atan2(s.tangentZ, s.tangentX);
      const deckBottomY = s.y - deckThick;
      const pierH = Math.max(4, deckBottomY - pierAnchorY);

      const cap = new THREE.Mesh(pierCapGeo, concreteMat);
      cap.position.set(s.x, deckBottomY - 0.5, s.z);
      cap.rotation.y = yaw;
      parent.add(cap);

      for (const side of [-1, 1]) {
        const cyl = new THREE.Mesh(pierCylGeo, concreteMat);
        cyl.scale.set(1, pierH, 1);
        cyl.position.set(
          s.x + s.rightX * side * (hw * 0.68),
          pierAnchorY + pierH * 0.5,
          s.z + s.rightZ * side * (hw * 0.68)
        );
        parent.add(cyl);
      }
    }

    // Decorative marine arch ribs on center 3 spans
    const midPierIdx = Math.floor(pierIndices.length / 2);
    for (let k = Math.max(0, midPierIdx - 1); k < Math.min(pierIndices.length - 1, midPierIdx + 2); k++) {
      const sA = bridgeSamples[pierIndices[k]];
      const sB = bridgeSamples[pierIndices[k + 1]];
      const midX = (sA.x + sB.x) * 0.5;
      const midZ = (sA.z + sB.z) * 0.5;
      const spanLen = Math.hypot(sB.x - sA.x, sB.z - sA.z);
      const yaw = -Math.atan2(sB.z - sA.z, sB.x - sA.x);

      for (const side of [-1, 1]) {
        const archCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-spanLen * 0.48, sA.y - 3.6, 0),
          new THREE.Vector3(0, sA.y - 1.2, 0),
          new THREE.Vector3(spanLen * 0.48, sB.y - 3.6, 0),
        ]);
        const archGeo = new THREE.TubeGeometry(archCurve, 16, 0.48, 8, false);
        disposables.push(archGeo);
        const arch = new THREE.Mesh(archGeo, concreteMat);
        arch.position.set(
          midX + sA.rightX * side * (hw * 0.68),
          0,
          midZ + sA.rightZ * side * (hw * 0.68)
        );
        arch.rotation.y = yaw;
        parent.add(arch);
      }
    }

    // Center beacon PointLight on Causeway Bridge
    const centerSample = bridgeSamples[Math.floor(bridgeSamples.length / 2)];
    const centerBeacon = new THREE.PointLight(0x06b6d4, 18, 95, 1.8);
    centerBeacon.position.set(centerSample.x, centerSample.y + 6.5, centerSample.z);
    parent.add(centerBeacon);
  }

  // 5. Shared 3D FIA Curbs, Concrete Drainage Gutters, Storm-Drain Grates, Double-Tier Guardrails & Cat-Eye Studs
  const details = buildSharedRoadDetails(parent, {
    mapId: 'coral_bay',
    roadHalfWidth: hw,
    samples,
    registry,
    textures,
    curbPrimaryHex: 0x0284c7,
    curbSecondaryHex: 0xe2e8f0,
    reflectorHex: 0x06b6d4,
  });

  return {
    setWetness: (wetness: number) => {
      roadUniforms.uWetness.value = wetness;
      details.setWetness(wetness);
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
