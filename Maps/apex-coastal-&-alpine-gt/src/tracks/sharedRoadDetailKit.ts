import * as THREE from 'three';
import type { ProceduralTextureSet } from './proceduralTextures';
import type { ColliderRegistry, MapId, TrackSample } from './types';

export interface RoadDetailOptions {
  mapId: MapId;
  roadHalfWidth: number;
  samples: TrackSample[];
  registry: ColliderRegistry;
  textures: ProceduralTextureSet;
  curbPrimaryHex: number;
  curbSecondaryHex: number;
  reflectorHex: number;
}

/**
 * Shared 3D FIA road detail kit:
 * - Continuous weathered concrete roadside drainage gutter & curb lip
 * - Textured 3D beveled FIA curbs (concrete aggregate + joint seams)
 * - Flush cast-iron slotted storm-drain grates embedded inside the gutter trough
 * - Profiled double-tier guardrails (0.44m & 0.86..0.88m) with I-posts & pit-entry cutout
 * - Night retroreflector cat-eye studs
 * - Exact spline guardrail colliders registered in ColliderRegistry
 */
export function buildSharedRoadDetails(
  parent: THREE.Group,
  opts: RoadDetailOptions
): { setWetness: (wetness: number) => void; dispose: () => void } {
  const { samples, roadHalfWidth, registry, textures, curbPrimaryHex, curbSecondaryHex, reflectorHex, mapId } =
    opts;
  const disposables: { dispose: () => void }[] = [];
  const count = samples.length;

  // 0. Continuous Weathered Concrete Roadside Drainage Gutter & Sculpted Curb Stone
  const gutterMat = new THREE.MeshStandardMaterial({
    color: mapId === 'frostpeak_pass' ? 0x747e8c : 0x85837c,
    map: textures.concreteMap,
    normalMap: textures.concreteNormal,
    normalScale: new THREE.Vector2(1.35, 1.35),
    roughness: 0.68,
    metalness: 0.06,
    envMapIntensity: 0.48,
  });
  disposables.push(gutterMat);

  // Gutter cross-section from road asphalt edge (-0.04) outward:
  // sharp asphalt-concrete seam -> recessed drainage trough -> crisp chamfered curb stone -> outer shoulder tuck
  const gutterCross = [
    { lat: -0.04, lift: -0.052, u: 0.0 },
    { lat: 0.08, lift: -0.072, u: 0.14 },
    { lat: 0.34, lift: -0.105, u: 0.38 },
    { lat: 0.54, lift: -0.072, u: 0.56 },
    { lat: 0.62, lift: 0.062, u: 0.74 },
    { lat: 0.84, lift: 0.072, u: 0.90 },
    { lat: 0.94, lift: -0.12, u: 1.0 },
  ];
  const gCols = gutterCross.length;
  for (const side of [-1, 1]) {
    const gPos = new Float32Array((count + 1) * gCols * 3);
    const gUv = new Float32Array((count + 1) * gCols * 2);
    const gIdx: number[] = [];

    for (let i = 0; i <= count; i++) {
      const s = samples[i % count];
      const distV = i === count ? samples[count - 1].distance + 1.0 : s.distance;
      for (let c = 0; c < gCols; c++) {
        const gp = gutterCross[c];
        const latPos = side * (roadHalfWidth + gp.lat);
        const idx = i * gCols + c;
        gPos[idx * 3] = s.x + s.rightX * latPos;
        gPos[idx * 3 + 1] = s.y + gp.lift;
        gPos[idx * 3 + 2] = s.z + s.rightZ * latPos;
        gUv[idx * 2] = gp.u;
        gUv[idx * 2 + 1] = distV * 0.16;
      }
      if (i < count) {
        const sCurr = samples[i];
        const sNext = samples[(i + 1) % count];
        if ((sCurr.isBridge && sNext.isBridge) || (side === 1 && (sCurr.hasRightPitGap || sNext.hasRightPitGap))) {
          continue;
        }
        for (let c = 0; c < gCols - 1; c++) {
          const a = i * gCols + c;
          const b = a + 1;
          const d = (i + 1) * gCols + c;
          const e = d + 1;
          if (side === 1) gIdx.push(a, b, d, b, e, d);
          else gIdx.push(a, d, b, b, d, e);
        }
      }
    }
    if (gIdx.length > 0) {
      const gutterGeo = new THREE.BufferGeometry();
      gutterGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
      gutterGeo.setAttribute('uv', new THREE.BufferAttribute(gUv, 2));
      gutterGeo.setIndex(gIdx);
      gutterGeo.computeVertexNormals();
      disposables.push(gutterGeo);
      const gutterMesh = new THREE.Mesh(gutterGeo, gutterMat);
      gutterMesh.receiveShadow = true;
      parent.add(gutterMesh);
    }
  }

  // 1. Sculpted Beveled 3D FIA Wedge Curbs textured with weathered concrete grain
  const curbShape = new THREE.Shape();
  curbShape.moveTo(-0.46, 0.0);
  curbShape.lineTo(0.46, 0.0);
  curbShape.lineTo(0.46, 0.13);
  curbShape.lineTo(-0.18, 0.06);
  curbShape.closePath();
  const curbGeo = new THREE.ExtrudeGeometry(curbShape, {
    depth: 2.55,
    bevelEnabled: false,
    steps: 1,
  });
  curbGeo.rotateY(Math.PI / 2);
  curbGeo.translate(-1.275, 0.0, 0);
  curbGeo.computeVertexNormals();
  disposables.push(curbGeo);

  const curbPrimaryMat = new THREE.MeshStandardMaterial({
    color: curbPrimaryHex,
    map: textures.concreteMap,
    normalMap: textures.concreteNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.56,
    metalness: 0.05,
    envMapIntensity: 0.48,
  });
  const curbSecondaryMat = new THREE.MeshStandardMaterial({
    color: curbSecondaryHex,
    map: textures.concreteMap,
    normalMap: textures.concreteNormal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.56,
    metalness: 0.05,
    envMapIntensity: 0.48,
  });
  disposables.push(curbPrimaryMat, curbSecondaryMat);

  const primaryTransforms: THREE.Matrix4[] = [];
  const secondaryTransforms: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  const curbStep = 4;
  let curbToggle = 0;
  for (let i = 0; i < count; i += curbStep) {
    const s = samples[i];
    // Place curbs on corners (curvature threshold) and bridge approaches
    if (Math.abs(s.curvature) < 0.0028 && !s.isBridge) continue;
    const sides = s.hasRightPitGap ? [-1] : [-1, 1];
    for (const side of sides) {
      const offset = side * (roadHalfWidth + 0.56);
      dummy.position.set(s.x + s.rightX * offset, s.y - 0.02, s.z + s.rightZ * offset);
      dummy.rotation.set(0, -Math.atan2(s.tangentZ, s.tangentX), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      if (curbToggle % 2 === 0) primaryTransforms.push(dummy.matrix.clone());
      else secondaryTransforms.push(dummy.matrix.clone());
    }
    curbToggle++;
  }

  if (primaryTransforms.length > 0) {
    const instA = new THREE.InstancedMesh(curbGeo, curbPrimaryMat, primaryTransforms.length);
    primaryTransforms.forEach((m, idx) => instA.setMatrixAt(idx, m));
    instA.instanceMatrix.needsUpdate = true;
    instA.receiveShadow = true;
    instA.computeBoundingSphere();
    parent.add(instA);
  }
  if (secondaryTransforms.length > 0) {
    const instB = new THREE.InstancedMesh(curbGeo, curbSecondaryMat, secondaryTransforms.length);
    secondaryTransforms.forEach((m, idx) => instB.setMatrixAt(idx, m));
    instB.instanceMatrix.needsUpdate = true;
    instB.receiveShadow = true;
    instB.computeBoundingSphere();
    parent.add(instB);
  }

  // 2. Recessed cast-iron slotted storm-drain grates flush inside the concrete gutter trough
  const grateGeo = new THREE.BoxGeometry(1.45, 0.032, 0.44);
  const grateMat = new THREE.MeshStandardMaterial({
    color: 0xaab4c2,
    map: textures.grateMap,
    normalMap: textures.grateNormal,
    normalScale: new THREE.Vector2(1.55, 1.55),
    roughness: 0.38,
    metalness: 0.86,
    envMapIntensity: 0.62,
  });
  disposables.push(grateGeo, grateMat);

  const grateTransforms: THREE.Matrix4[] = [];
  for (let i = 0; i < count; i += 12) {
    const s = samples[i];
    if (s.isBridge) continue;
    for (const side of [-1, 1]) {
      if (side === 1 && s.hasRightPitGap) continue;
      const offset = side * (roadHalfWidth + 0.34);
      dummy.position.set(s.x + s.rightX * offset, s.y - 0.084, s.z + s.rightZ * offset);
      dummy.rotation.set(0, -Math.atan2(s.tangentZ, s.tangentX), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      grateTransforms.push(dummy.matrix.clone());
    }
  }
  if (grateTransforms.length > 0) {
    const grateInst = new THREE.InstancedMesh(grateGeo, grateMat, grateTransforms.length);
    grateTransforms.forEach((m, idx) => grateInst.setMatrixAt(idx, m));
    grateInst.instanceMatrix.needsUpdate = true;
    grateInst.receiveShadow = true;
    grateInst.computeBoundingSphere();
    parent.add(grateInst);
  }

  // 3. Profiled Double-Tier Guardrails (0.44m & 0.86..0.88m) + I-Posts + Reflector Tabs + Cat-Eye Studs
  const upperTierY = mapId === 'frostpeak_pass' ? 0.88 : 0.86;
  const lowerTierY = 0.44;
  const railOffset = roadHalfWidth + 1.55;

  const railMat = new THREE.MeshStandardMaterial({
    color: mapId === 'frostpeak_pass' ? 0x94a3b8 : 0xb0bac5,
    roughness: 0.42,
    metalness: 0.78,
    envMapIntensity: 0.75,
  });
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.58,
    metalness: 0.72,
  });
  const reflectorMat = new THREE.MeshStandardMaterial({
    color: reflectorHex,
    emissive: reflectorHex,
    emissiveIntensity: 1.4,
    roughness: 0.2,
    metalness: 0.2,
  });
  const catEyeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    emissive: reflectorHex,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });
  disposables.push(railMat, postMat, reflectorMat, catEyeMat);

  const postGeo = new THREE.BoxGeometry(0.14, 1.02, 0.14);
  postGeo.translate(0, 0.48, 0);
  const reflGeo = new THREE.BoxGeometry(0.18, 0.09, 0.05);
  const catGeo = new THREE.BoxGeometry(0.16, 0.04, 0.16);
  const railSegGeo = new THREE.BoxGeometry(1, 0.18, 0.1);
  disposables.push(postGeo, reflGeo, catGeo, railSegGeo);

  const railMatrices: THREE.Matrix4[] = [];
  const postMatrices: THREE.Matrix4[] = [];
  const reflMatrices: THREE.Matrix4[] = [];
  const catMatrices: THREE.Matrix4[] = [];

  const railStep = 8;
  for (let i = 0; i < count; i += railStep) {
    const s0 = samples[i];
    const s1 = samples[(i + railStep) % count];
    if (s0.isBridge && s1.isBridge) continue;

    for (const side of [-1, 1]) {
      // Pit-entry/exit guardrail cutout on pit side
      if (side === 1 && (s0.hasRightPitGap || s1.hasRightPitGap)) continue;

      const ax = s0.x + s0.rightX * side * railOffset;
      const az = s0.z + s0.rightZ * side * railOffset;
      const ay = s0.y;

      const bx = s1.x + s1.rightX * side * railOffset;
      const bz = s1.z + s1.rightZ * side * railOffset;
      const by = s1.y;

      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const segLen = Math.hypot(dx, dy, dz);
      if (segLen < 0.2 || segLen > 25) continue;

      const midX = (ax + bx) * 0.5;
      const midY = (ay + by) * 0.5;
      const midZ = (az + bz) * 0.5;
      const yaw = -Math.atan2(dz, dx);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));

      // Lower and Upper rail tiers
      for (const tierY of [lowerTierY, upperTierY]) {
        dummy.position.set(midX, midY + tierY, midZ);
        dummy.rotation.set(0, yaw, pitch);
        dummy.scale.set(segLen + 0.12, 1, 1);
        dummy.updateMatrix();
        railMatrices.push(dummy.matrix.clone());
      }

      // Support I-post
      dummy.position.set(ax, ay - 0.1, az);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postMatrices.push(dummy.matrix.clone());

      // Reflector tab every 16 samples
      if (i % 16 === 0) {
        dummy.position.set(ax - s0.rightX * side * 0.08, ay + upperTierY, az - s0.rightZ * side * 0.08);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        reflMatrices.push(dummy.matrix.clone());
      }

      // Physics spline wall collider
      registry.walls.push({
        id: `rail_${side}_${i}`,
        kind: 'guardrail',
        ax,
        az,
        bx,
        bz,
        y: midY,
        radius: 0.45,
      });
    }

    // Center & edge night retroreflector cat-eye studs
    if (i % 16 === 0) {
      for (const cSide of [-1, 1]) {
        const cx = s0.x + s0.rightX * cSide * (roadHalfWidth - 0.18);
        const cz = s0.z + s0.rightZ * cSide * (roadHalfWidth - 0.18);
        dummy.position.set(cx, s0.y + 0.025, cz);
        dummy.rotation.set(0, -Math.atan2(s0.tangentZ, s0.tangentX), 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        catMatrices.push(dummy.matrix.clone());
      }
    }
  }

  const addInst = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], shadow = false) => {
    if (mats.length === 0) return;
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    for (let k = 0; k < mats.length; k++) im.setMatrixAt(k, mats[k]);
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    parent.add(im);
  };

  addInst(railSegGeo, railMat, railMatrices, true);
  addInst(postGeo, postMat, postMatrices, false);
  addInst(reflGeo, reflectorMat, reflMatrices, false);
  addInst(catGeo, catEyeMat, catMatrices, false);

  return {
    setWetness: (wetness: number) => {
      gutterMat.roughness = THREE.MathUtils.lerp(0.68, 0.42, wetness);
      grateMat.roughness = THREE.MathUtils.lerp(0.42, 0.28, wetness);
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
