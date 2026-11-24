import * as THREE from 'three';

export interface SpatialRoadChunkMesh {
  mesh: THREE.Mesh;
  cx: number;
  cz: number;
  horizRadius: number;
}

export interface ChunkedRoadSurfaceRig {
  group: THREE.Group;
  meshes: THREE.Mesh[];
  chunks: SpatialRoadChunkMesh[];
  updateVisibilityWindow: (
    focusPos: THREE.Vector3,
    radiusM?: number,
    camPos?: THREE.Vector3,
    camFwd?: THREE.Vector3,
  ) => void;
  dispose: () => void;
}

/**
 * Splits a continuous indexed BufferGeometry (preserving multi-material groups and all
 * custom vertex attributes such as aApexBias/color/uv/normal) into spatial XZ cell chunks
 * so behind-camera and out-of-range road segments are completely skipped from rendering.
 */
export function buildSpatialChunkedRoadMesh(
  sourceGeo: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  options: {
    cellSizeM?: number;
    castShadow?: boolean;
    receiveShadow?: boolean;
    name?: string;
    disposeSource?: boolean;
  } = {},
): ChunkedRoadSurfaceRig {
  const cellSizeM = options.cellSizeM ?? 115;
  const castShadow = options.castShadow ?? false;
  const receiveShadow = options.receiveShadow ?? true;
  const group = new THREE.Group();
  group.name = options.name ?? 'ChunkedRoadSurface';

  const posAttr = sourceGeo.getAttribute('position') as THREE.BufferAttribute | undefined;
  const indexAttr = sourceGeo.getIndex();
  if (!posAttr || !indexAttr || indexAttr.count < 3) {
    const fallback = new THREE.Mesh(sourceGeo, material);
    fallback.castShadow = castShadow;
    fallback.receiveShadow = receiveShadow;
    group.add(fallback);
    return {
      group,
      meshes: [fallback],
      chunks: [{ mesh: fallback, cx: 0, cz: 0, horizRadius: 2000 }],
      updateVisibilityWindow: () => {},
      dispose: () => {
        if (options.disposeSource !== false) sourceGeo.dispose();
      },
    };
  }

  const groups =
    sourceGeo.groups.length > 0
      ? sourceGeo.groups
      : [{ start: 0, count: indexAttr.count, materialIndex: 0 }];

  const attrNames = Object.keys(sourceGeo.attributes);
  const idxArr = indexAttr.array;

  // Map spatial cell key -> per-material-group triangle index lists (referencing source vertices)
  interface CellBucket {
    matTris: Map<number, number[]>;
  }
  const cellMap = new Map<string, CellBucket>();

  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const matIdx = grp.materialIndex ?? 0;
    const end = Math.min(indexAttr.count, grp.start + grp.count);
    for (let t = grp.start; t + 2 < end; t += 3) {
      const i0 = idxArr[t];
      const i1 = idxArr[t + 1];
      const i2 = idxArr[t + 2];
      const cx = (posAttr.getX(i0) + posAttr.getX(i1) + posAttr.getX(i2)) / 3;
      const cz = (posAttr.getZ(i0) + posAttr.getZ(i1) + posAttr.getZ(i2)) / 3;
      const gx = Math.floor(cx / cellSizeM);
      const gz = Math.floor(cz / cellSizeM);
      const key = `${gx},${gz}`;
      let bucket = cellMap.get(key);
      if (!bucket) {
        bucket = { matTris: new Map<number, number[]>() };
        cellMap.set(key, bucket);
      }
      let triList = bucket.matTris.get(matIdx);
      if (!triList) {
        triList = [];
        bucket.matTris.set(matIdx, triList);
      }
      triList.push(i0, i1, i2);
    }
  }

  const chunkGeos: THREE.BufferGeometry[] = [];
  const meshes: THREE.Mesh[] = [];
  const chunks: SpatialRoadChunkMesh[] = [];

  for (const [, bucket] of cellMap) {
    const remap = new Map<number, number>();
    const localVertices: number[] = [];
    const chunkIndices: number[] = [];
    const chunkGroups: Array<{ start: number; count: number; materialIndex: number }> = [];

    for (const [matIdx, tris] of bucket.matTris) {
      if (tris.length === 0) continue;
      const start = chunkIndices.length;
      for (let k = 0; k < tris.length; k++) {
        const srcV = tris[k];
        let dstV = remap.get(srcV);
        if (dstV === undefined) {
          dstV = localVertices.length;
          remap.set(srcV, dstV);
          localVertices.push(srcV);
        }
        chunkIndices.push(dstV);
      }
      chunkGroups.push({ start, count: tris.length, materialIndex: matIdx });
    }

    if (chunkIndices.length === 0 || localVertices.length === 0) continue;

    const cGeo = new THREE.BufferGeometry();
    const vCount = localVertices.length;

    for (let a = 0; a < attrNames.length; a++) {
      const name = attrNames[a];
      const srcAttr = sourceGeo.getAttribute(name) as THREE.BufferAttribute;
      const itemSize = srcAttr.itemSize;
      const dstArray = new Float32Array(vCount * itemSize);
      for (let v = 0; v < vCount; v++) {
        const srcIdx = localVertices[v] * itemSize;
        const dstIdx = v * itemSize;
        for (let c = 0; c < itemSize; c++) {
          dstArray[dstIdx + c] = srcAttr.array[srcIdx + c];
        }
      }
      cGeo.setAttribute(name, new THREE.BufferAttribute(dstArray, itemSize, srcAttr.normalized));
    }

    cGeo.setIndex(
      new THREE.BufferAttribute(
        vCount < 65536 ? new Uint16Array(chunkIndices) : new Uint32Array(chunkIndices),
        1,
      ),
    );
    if (sourceGeo.groups.length > 0) {
      for (let g = 0; g < chunkGroups.length; g++) {
        const cg = chunkGroups[g];
        cGeo.addGroup(cg.start, cg.count, cg.materialIndex);
      }
    }

    // Compute exact XZ centroid and bounding radius
    const cPos = cGeo.getAttribute('position') as THREE.BufferAttribute;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let v = 0; v < vCount; v++) {
      const vx = cPos.getX(v);
      const vz = cPos.getZ(v);
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vz < minZ) minZ = vz;
      if (vz > maxZ) maxZ = vz;
    }
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    let maxR2 = 0;
    for (let v = 0; v < vCount; v++) {
      const dx = cPos.getX(v) - cx;
      const dz = cPos.getZ(v) - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > maxR2) maxR2 = d2;
    }
    const horizRadius = Math.sqrt(maxR2) + 2.0;

    cGeo.computeBoundingBox();
    cGeo.computeBoundingSphere();

    const mesh = new THREE.Mesh(cGeo, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    group.add(mesh);
    chunkGeos.push(cGeo);
    meshes.push(mesh);
    chunks.push({ mesh, cx, cz, horizRadius });
  }

  if (options.disposeSource !== false) {
    sourceGeo.dispose();
  }

  let lastFocusX = 1e9;
  let lastFocusZ = 1e9;
  let lastCamX = 1e9;
  let lastCamZ = 1e9;
  let lastFwdX = 0;
  let lastFwdZ = 0;
  let lastHasCam = false;
  let lastRadiusM = -1;

  const updateVisibilityWindow = (
    focusPos: THREE.Vector3,
    radiusM = 460,
    camPos?: THREE.Vector3,
    camFwd?: THREE.Vector3,
  ) => {
    let fwdX = 0;
    let fwdZ = 0;
    let hasCamDir = false;
    if (camPos && camFwd) {
      const fLen = Math.hypot(camFwd.x, camFwd.z);
      if (fLen > 0.05) {
        fwdX = camFwd.x / fLen;
        fwdZ = camFwd.z / fLen;
        hasCamDir = true;
      }
    }

    const dxMove = focusPos.x - lastFocusX;
    const dzMove = focusPos.z - lastFocusZ;
    const camDx = camPos ? camPos.x - lastCamX : 0;
    const camDz = camPos ? camPos.z - lastCamZ : 0;
    const dirDot =
      hasCamDir && lastHasCam ? fwdX * lastFwdX + fwdZ * lastFwdZ : hasCamDir !== lastHasCam ? 0 : 1;

    if (
      radiusM === lastRadiusM &&
      dxMove * dxMove + dzMove * dzMove < 100 &&
      camDx * camDx + camDz * camDz < 100 &&
      dirDot > 0.992
    ) {
      return;
    }

    lastFocusX = focusPos.x;
    lastFocusZ = focusPos.z;
    if (camPos) {
      lastCamX = camPos.x;
      lastCamZ = camPos.z;
    }
    lastFwdX = fwdX;
    lastFwdZ = fwdZ;
    lastHasCam = hasCamDir;
    lastRadiusM = radiusM;

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const dx = c.cx - focusPos.x;
      const dz = c.cz - focusPos.z;
      const limit = radiusM + c.horizRadius;
      if (dx * dx + dz * dz > limit * limit) {
        c.mesh.visible = false;
        continue;
      }
      if (hasCamDir && camPos) {
        const alongCam = (c.cx - camPos.x) * fwdX + (c.cz - camPos.z) * fwdZ;
        // Generous behind-camera margin: keep curved chunks extending past camera edges
        if (alongCam < -(c.horizRadius + 36)) {
          c.mesh.visible = false;
          continue;
        }
      }
      c.mesh.visible = true;
    }
  };

  return {
    group,
    meshes,
    chunks,
    updateVisibilityWindow,
    dispose: () => {
      for (let i = 0; i < chunkGeos.length; i++) {
        chunkGeos[i].dispose();
      }
    },
  };
}
