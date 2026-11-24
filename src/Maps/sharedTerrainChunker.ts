import * as THREE from 'three';

export interface TerrainChunkTile {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  cx: number;
  cy: number;
  cz: number;
  horizRadius: number;
}

export interface ChunkedTerrainHandle {
  group: THREE.Group;
  primaryMesh: THREE.Mesh;
  tiles: TerrainChunkTile[];
  updateVisibilityWindow: (
    focusPos: THREE.Vector3,
    radiusM?: number,
    force?: boolean,
    camPos?: THREE.Vector3,
    camFwd?: THREE.Vector3,
  ) => void;
  dispose: () => void;
}

/**
 * Splits a completed PlaneGeometry terrain mesh into compacted, cache-friendly ~200-250m grid tiles.
 * Each tile receives its own dense local vertex slice so:
 * - Indices pack into Uint16Array (50% smaller index buffers, optimal GPU post-transform cache)
 * - 3-component vertex colors compress from Float32 to normalized Uint8 (75% smaller color buffers)
 * - The monolithic source PlaneGeometry is freed immediately after splitting
 * - Tiles are both radius-culled and behind-camera directionally culled each frame
 */
export function buildChunkedTerrainTiles(
  geo: THREE.PlaneGeometry,
  material: THREE.Material,
  terrainSizeM: number,
  segs: number,
  options?: {
    chunkSizeM?: number;
    receiveShadow?: boolean;
    castShadow?: boolean;
    name?: string;
  },
): ChunkedTerrainHandle {
  const chunkSizeM = options?.chunkSizeM ?? 200;
  const receiveShadow = options?.receiveShadow ?? true;
  const castShadow = options?.castShadow ?? false;

  const group = new THREE.Group();
  group.name = options?.name ?? 'ChunkedTerrain';

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const srcIndex = geo.getIndex();
  if (!srcIndex) {
    const single = new THREE.Mesh(geo, material);
    single.receiveShadow = receiveShadow;
    single.castShadow = castShadow;
    group.add(single);
    return {
      group,
      primaryMesh: single,
      tiles: [],
      updateVisibilityWindow: () => {},
      dispose: () => {
        geo.dispose();
      },
    };
  }

  const cellSizeM = terrainSizeM / Math.max(1, segs);
  // Clamp quadsPerTile <= 64 so (quads+1)^2 <= 4,225 vertices, guaranteeing Uint16Array indices
  const quadsPerTile = Math.min(64, Math.max(4, Math.round(chunkSizeM / cellSizeM)));
  const stride = segs + 1;
  const attrNames = Object.keys(geo.attributes);

  const tiles: TerrainChunkTile[] = [];
  let primaryMesh: THREE.Mesh | null = null;

  for (let r0 = 0; r0 < segs; r0 += quadsPerTile) {
    const r1 = Math.min(segs, r0 + quadsPerTile);
    const localRows = r1 - r0 + 1;

    for (let c0 = 0; c0 < segs; c0 += quadsPerTile) {
      const c1 = Math.min(segs, c0 + quadsPerTile);
      const localCols = c1 - c0 + 1;
      const localVertCount = localRows * localCols;
      const quadCount = (r1 - r0) * (c1 - c0);
      const triIndices = new Uint16Array(quadCount * 6);

      const tileGeo = new THREE.BufferGeometry();

      // Copy & compress each attribute into the tile's dense local vertex slice
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;

      for (let a = 0; a < attrNames.length; a++) {
        const name = attrNames[a];
        const srcAttr = geo.attributes[name] as THREE.BufferAttribute;
        const itemSize = srcAttr.itemSize;
        const srcArr = srcAttr.array as Float32Array;

        if (name === 'color' && itemSize === 3) {
          const colU8 = new Uint8Array(localVertCount * 3);
          let dstV = 0;
          for (let r = r0; r <= r1; r++) {
            const rowOff = r * stride + c0;
            for (let c = 0; c < localCols; c++) {
              const sBase = (rowOff + c) * 3;
              const dBase = dstV * 3;
              const rVal = srcArr[sBase];
              const gVal = srcArr[sBase + 1];
              const bVal = srcArr[sBase + 2];
              colU8[dBase] = rVal <= 0 ? 0 : rVal >= 1 ? 255 : Math.round(rVal * 255);
              colU8[dBase + 1] = gVal <= 0 ? 0 : gVal >= 1 ? 255 : Math.round(gVal * 255);
              colU8[dBase + 2] = bVal <= 0 ? 0 : bVal >= 1 ? 255 : Math.round(bVal * 255);
              dstV++;
            }
          }
          tileGeo.setAttribute(name, new THREE.Uint8BufferAttribute(colU8, 3, true));
        } else {
          const dstArr = new Float32Array(localVertCount * itemSize);
          let dstV = 0;
          const isPos = name === 'position';
          for (let r = r0; r <= r1; r++) {
            const rowOff = r * stride + c0;
            for (let c = 0; c < localCols; c++) {
              const sBase = (rowOff + c) * itemSize;
              const dBase = dstV * itemSize;
              for (let k = 0; k < itemSize; k++) {
                dstArr[dBase + k] = srcArr[sBase + k];
              }
              if (isPos) {
                const vx = srcArr[sBase];
                const vy = srcArr[sBase + 1];
                const vz = srcArr[sBase + 2];
                if (vx < minX) minX = vx;
                if (vy < minY) minY = vy;
                if (vz < minZ) minZ = vz;
                if (vx > maxX) maxX = vx;
                if (vy > maxY) maxY = vy;
                if (vz > maxZ) maxZ = vz;
              }
              dstV++;
            }
          }
          tileGeo.setAttribute(name, new THREE.BufferAttribute(dstArr, itemSize));
        }
      }

      // Build dense local Uint16 triangle indices (matches PlaneGeometry CCW winding)
      let ptr = 0;
      for (let lr = 0; lr < localRows - 1; lr++) {
        for (let lc = 0; lc < localCols - 1; lc++) {
          const a = lr * localCols + lc;
          const b = (lr + 1) * localCols + lc;
          const c = (lr + 1) * localCols + (lc + 1);
          const d = lr * localCols + (lc + 1);
          triIndices[ptr++] = a;
          triIndices[ptr++] = b;
          triIndices[ptr++] = d;
          triIndices[ptr++] = b;
          triIndices[ptr++] = c;
          triIndices[ptr++] = d;
        }
      }

      const cx = (minX + maxX) * 0.5;
      const cy = (minY + maxY) * 0.5;
      const cz = (minZ + maxZ) * 0.5;
      const halfX = (maxX - minX) * 0.5;
      const halfY = (maxY - minY) * 0.5;
      const halfZ = (maxZ - minZ) * 0.5;
      const horizRadius = Math.hypot(halfX, halfZ);
      const sphereRadius = Math.hypot(halfX, halfY, halfZ);

      tileGeo.setIndex(new THREE.BufferAttribute(triIndices, 1));
      tileGeo.boundingBox = new THREE.Box3(
        new THREE.Vector3(minX, minY, minZ),
        new THREE.Vector3(maxX, maxY, maxZ),
      );
      tileGeo.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(cx, cy, cz),
        sphereRadius,
      );

      const tileMesh = new THREE.Mesh(tileGeo, material);
      tileMesh.receiveShadow = receiveShadow;
      tileMesh.castShadow = castShadow;
      group.add(tileMesh);
      if (!primaryMesh) primaryMesh = tileMesh;

      tiles.push({
        mesh: tileMesh,
        geo: tileGeo,
        cx,
        cy,
        cz,
        horizRadius,
      });
    }
  }

  // Free monolithic source PlaneGeometry buffers immediately
  void posAttr;
  geo.dispose();

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
    force = false,
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
    const dirDot = hasCamDir && lastHasCam ? fwdX * lastFwdX + fwdZ * lastFwdZ : hasCamDir !== lastHasCam ? 0 : 1;

    if (
      !force &&
      radiusM === lastRadiusM &&
      dxMove * dxMove + dzMove * dzMove < 196 &&
      camDx * camDx + camDz * camDz < 196 &&
      dirDot > 0.985
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

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const dx = tile.cx - focusPos.x;
      const dz = tile.cz - focusPos.z;
      const limit = radiusM + tile.horizRadius;
      if (dx * dx + dz * dz > limit * limit) {
        tile.mesh.visible = false;
        continue;
      }
      if (hasCamDir && camPos) {
        const cdx = tile.cx - camPos.x;
        const cdz = tile.cz - camPos.z;
        const alongCam = cdx * fwdX + cdz * fwdZ;
        if (alongCam < -(tile.horizRadius + 48)) {
          tile.mesh.visible = false;
          continue;
        }
      }
      tile.mesh.visible = true;
    }
  };

  return {
    group,
    primaryMesh: primaryMesh!,
    tiles,
    updateVisibilityWindow,
    dispose: () => {
      for (let i = 0; i < tiles.length; i++) {
        tiles[i].geo.dispose();
      }
    },
  };
}
