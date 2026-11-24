import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type UserAssetId =
  | 'palm_tree'
  | 'pine_tree_1'
  | 'pine_tree_2'
  | 'tire_wall'
  | 'guardrail'
  | 'guardrail_terminal'
  | 'race_fence'
  | 'asset_fence'
  | 'protective_fence';

export interface NormalizedUserAsset {
  id: UserAssetId;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  size: THREE.Vector3;
  halfExtents: THREE.Vector3;
}

interface AssetSpec {
  url: string;
  meshFilter?: RegExp;
  nodeFilter?: RegExp;
  preRotateY?: number;
  targetHeightM?: number;
  uniformScale?: number;
  forceOpaque?: boolean;
  alphaCutoff?: number;
  doubleSided?: boolean;
  roughnessFloor?: number;
  maxMetalness?: number;
}

const USER_ASSET_SPECS: Record<UserAssetId, AssetSpec> = {
  palm_tree: {
    url: '/Assets-user/low_poly_palm_tree.glb',
    targetHeightM: 9.4,
    alphaCutoff: 0.35,
    doubleSided: true,
    roughnessFloor: 0.78,
    maxMetalness: 0.04,
  },
  pine_tree_1: {
    url: '/Assets-user/tree_low_poly_lowpoly.glb',
    meshFilter: /Tree 1/i,
    targetHeightM: 9.2,
    forceOpaque: true,
    doubleSided: true,
    roughnessFloor: 0.82,
    maxMetalness: 0.05,
  },
  pine_tree_2: {
    url: '/Assets-user/tree_low_poly_lowpoly.glb',
    meshFilter: /Tree 2/i,
    targetHeightM: 8.7,
    forceOpaque: true,
    doubleSided: true,
    roughnessFloor: 0.82,
    maxMetalness: 0.05,
  },
  tire_wall: {
    url: '/Assets-user/race_track_tire_wall.glb',
    uniformScale: 1.0,
    roughnessFloor: 0.72,
    maxMetalness: 0.1,
  },
  guardrail: {
    url: '/Assets-user/guardrail_and_terminal.glb',
    meshFilter: /GuardRail_CrashBarrier/i,
    uniformScale: 1.0,
    doubleSided: true,
  },
  guardrail_terminal: {
    url: '/Assets-user/guardrail_and_terminal.glb',
    meshFilter: /GuardRail_terminal/i,
    uniformScale: 1.0,
    doubleSided: true,
  },
  race_fence: {
    url: '/Assets-user/race_fence.glb',
    uniformScale: 0.01,
    alphaCutoff: 0.28,
    doubleSided: true,
  },
  asset_fence: {
    url: '/Assets-user/fence_single_model_from_asset_pack.glb',
    uniformScale: 1.0,
    alphaCutoff: 0.28,
    doubleSided: true,
  },
  protective_fence: {
    url: '/Assets-user/fence_protective_fence_metallic_avenue_farm.glb',
    // Pick only the straight flat 3m x 2.1m metallic chainlink panel (~41k tris instead of 124k)
    nodeFilter: /^Object_2$/i,
    preRotateY: Math.PI * 0.5,
    uniformScale: 0.01,
    doubleSided: true,
  },
};

let sharedDraco: DRACOLoader | null = null;
let sharedLoader: GLTFLoader | null = null;

function getLoader(): GLTFLoader {
  if (!sharedLoader) {
    if (!sharedDraco) {
      sharedDraco = new DRACOLoader();
      sharedDraco.setDecoderPath('/draco/');
    }
    sharedLoader = new GLTFLoader();
    sharedLoader.setDRACOLoader(sharedDraco);
    sharedLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  return sharedLoader;
}

const rawGltfCache = new Map<string, Promise<GLTF>>();
const normalizedCache = new Map<UserAssetId, NormalizedUserAsset>();
const inFlightAssets = new Map<UserAssetId, Promise<NormalizedUserAsset>>();

export type UserAssetBudgetMode = 'minimal' | 'compact' | 'full';
let currentBudgetMode: UserAssetBudgetMode = 'full';

export function setUserAssetBudgetMode(mode: UserAssetBudgetMode): void {
  currentBudgetMode = mode;
}

const SKIP_ON_MINIMAL: ReadonlySet<UserAssetId> = new Set<UserAssetId>([
  'protective_fence',
  'race_fence',
  'guardrail',
  'guardrail_terminal',
  'asset_fence',
  'tire_wall',
]);

const SKIP_ON_COMPACT: ReadonlySet<UserAssetId> = new Set<UserAssetId>([
  'protective_fence',
]);

function loadRawGltf(url: string): Promise<GLTF> {
  const existing = rawGltfCache.get(url);
  if (existing) return existing;
  const loader = getLoader();
  const promise = new Promise<GLTF>((resolve, reject) => {
    loader.load(
      url,
      (gltf) => resolve(gltf),
      undefined,
      (err) => {
        rawGltfCache.delete(url);
        reject(err);
      },
    );
  });
  rawGltfCache.set(url, promise);
  return promise;
}

function normalizeMaterial(
  srcMat: THREE.Material | THREE.Material[] | undefined,
  spec: AssetSpec,
): THREE.MeshStandardMaterial {
  const base = Array.isArray(srcMat) ? srcMat[0] : srcMat;
  const mat = base
    ? (base.clone() as THREE.MeshStandardMaterial)
    : new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.7, metalness: 0.1 });

  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
    mat.map.anisotropy = Math.min(8, Math.max(4, mat.map.anisotropy || 4));
    mat.map.needsUpdate = true;
  }
  if (mat.emissiveMap) {
    mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    mat.emissiveMap.needsUpdate = true;
  }
  if (mat.color) {
    mat.color.setHex(0xffffff);
  }

  if (spec.forceOpaque) {
    mat.transparent = false;
    mat.opacity = 1.0;
    mat.alphaTest = 0;
    mat.depthWrite = true;
  } else if (spec.alphaCutoff !== undefined) {
    mat.transparent = false;
    mat.opacity = 1.0;
    mat.alphaTest = spec.alphaCutoff;
    mat.depthWrite = true;
  }

  if (spec.doubleSided) {
    mat.side = THREE.DoubleSide;
  }
  if (spec.roughnessFloor !== undefined) {
    mat.roughness = Math.max(spec.roughnessFloor, mat.roughness ?? 0.8);
  }
  if (spec.maxMetalness !== undefined) {
    mat.metalness = Math.min(spec.maxMetalness, mat.metalness ?? 0.05);
  }
  mat.needsUpdate = true;
  return mat;
}

function buildNormalizedAsset(id: UserAssetId, gltf: GLTF): NormalizedUserAsset {
  const spec = USER_ASSET_SPECS[id];
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const matchedMeshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return;
    if (spec.nodeFilter && !spec.nodeFilter.test(obj.name) && !spec.nodeFilter.test(obj.parent?.name ?? '')) {
      return;
    }
    if (spec.meshFilter && !spec.meshFilter.test(obj.name) && !spec.meshFilter.test(obj.parent?.name ?? '')) {
      return;
    }
    matchedMeshes.push(obj);
  });

  if (matchedMeshes.length === 0) {
    throw new Error(`No matching meshes found in ${spec.url} for user asset "${id}"`);
  }

  let finalGeo: THREE.BufferGeometry;
  if (matchedMeshes.length === 1) {
    const m = matchedMeshes[0];
    finalGeo = m.geometry.clone();
    finalGeo.applyMatrix4(m.matrixWorld);
  } else {
    const parts: THREE.BufferGeometry[] = [];
    for (const m of matchedMeshes) {
      let g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      if (g.index) {
        const nonIdx = g.toNonIndexed();
        g.dispose();
        g = nonIdx;
      }
      // Keep core attributes consistent across multi-plane merges
      for (const attr of Object.keys(g.attributes)) {
        if (attr !== 'position' && attr !== 'normal' && attr !== 'uv') {
          g.deleteAttribute(attr);
        }
      }
      if (!g.attributes.normal) g.computeVertexNormals();
      parts.push(g);
    }
    finalGeo = BufferGeometryUtils.mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
  }

  if (!finalGeo.attributes.normal) {
    finalGeo.computeVertexNormals();
  }

  if (spec.preRotateY) {
    finalGeo.rotateY(spec.preRotateY);
  }

  finalGeo.computeBoundingBox();
  const rawBox = finalGeo.boundingBox ?? new THREE.Box3();
  const rawSize = new THREE.Vector3();
  rawBox.getSize(rawSize);

  let scaleFactor = spec.uniformScale ?? 1.0;
  if (spec.targetHeightM && rawSize.y > 1e-4) {
    scaleFactor = spec.targetHeightM / rawSize.y;
  }

  if (Math.abs(scaleFactor - 1.0) > 1e-4) {
    finalGeo.scale(scaleFactor, scaleFactor, scaleFactor);
  }

  finalGeo.computeBoundingBox();
  const normBox = finalGeo.boundingBox ?? new THREE.Box3();
  const center = new THREE.Vector3();
  normBox.getCenter(center);
  // Pivot at bottom-center: X=0, Z=0, min.y=0
  finalGeo.translate(-center.x, -normBox.min.y, -center.z);

  finalGeo.computeBoundingBox();
  finalGeo.computeBoundingSphere();

  const finalSize = new THREE.Vector3();
  (finalGeo.boundingBox ?? new THREE.Box3()).getSize(finalSize);
  const halfExtents = finalSize.clone().multiplyScalar(0.5);

  const material = normalizeMaterial(matchedMeshes[0].material, spec);
  const result: NormalizedUserAsset = {
    id,
    geometry: finalGeo,
    material,
    size: finalSize,
    halfExtents,
  };
  normalizedCache.set(id, result);
  return result;
}

export function getCachedUserAsset(id: UserAssetId): NormalizedUserAsset | null {
  return normalizedCache.get(id) ?? null;
}

export function loadUserAsset(id: UserAssetId): Promise<NormalizedUserAsset> {
  const cached = normalizedCache.get(id);
  if (cached) return Promise.resolve(cached);

  const active = inFlightAssets.get(id);
  if (active) return active;

  const spec = USER_ASSET_SPECS[id];
  const promise = loadRawGltf(spec.url)
    .then((gltf) => buildNormalizedAsset(id, gltf))
    .finally(() => {
      inFlightAssets.delete(id);
    });

  inFlightAssets.set(id, promise);
  return promise;
}

export interface AttachInstancedUserAssetOptions {
  assetId: UserAssetId;
  parentGroup: THREE.Group;
  matrices: THREE.Matrix4[];
  colors?: THREE.Color[];
  fallbackMeshes?: THREE.Object3D[];
  localTransform?: THREE.Matrix4;
  scaledRegistry?: Array<{
    mesh: THREE.InstancedMesh;
    fullCount: number;
    allowsShadow: boolean;
    cellCenterX?: number;
    cellCenterZ?: number;
  }>;
  cellCenterX?: number;
  cellCenterZ?: number;
  allowsShadow?: boolean;
  initialVisible?: boolean;
  isDisposed: () => boolean;
  getQualityState?: () => {
    keepRatio: number;
    foliageDensityScale: number;
    allowShadows: boolean;
  };
  cleanupCallbacks?: Array<() => void>;
}

/**
 * Upgrades procedural trackside/foliage InstancedMeshes with normalized /Assets-user/*.glb
 * meshes once downloaded, preserving exact Matrix4 transforms and quality/visibility state.
 */
export function attachInstancedUserAsset(opts: AttachInstancedUserAssetOptions): void {
  if (opts.matrices.length === 0) return;
  if (currentBudgetMode === 'minimal' && SKIP_ON_MINIMAL.has(opts.assetId)) {
    return;
  }
  if (currentBudgetMode === 'compact' && SKIP_ON_COMPACT.has(opts.assetId)) {
    return;
  }

  const mount = (asset: NormalizedUserAsset) => {
    if (opts.isDisposed()) return;

    const inst = new THREE.InstancedMesh(asset.geometry, asset.material, opts.matrices.length);
    const composed = new THREE.Matrix4();
    for (let i = 0; i < opts.matrices.length; i++) {
      if (opts.localTransform) {
        composed.multiplyMatrices(opts.matrices[i], opts.localTransform);
        inst.setMatrixAt(i, composed);
      } else {
        inst.setMatrixAt(i, opts.matrices[i]);
      }
      if (opts.colors && opts.colors[i]) {
        inst.setColorAt(i, opts.colors[i]);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();

    const qState = opts.getQualityState?.();
    const allowShadows = opts.allowsShadow ?? true;
    if (qState) {
      inst.count = Math.max(
        1,
        Math.min(
          opts.matrices.length,
          Math.round(opts.matrices.length * qState.keepRatio * qState.foliageDensityScale),
        ),
      );
      inst.castShadow = allowShadows && qState.allowShadows;
    } else {
      inst.castShadow = allowShadows;
    }
    inst.receiveShadow = true;
    inst.visible = opts.initialVisible ?? true;

    opts.parentGroup.add(inst);

    if (opts.scaledRegistry) {
      opts.scaledRegistry.push({
        mesh: inst,
        fullCount: opts.matrices.length,
        allowsShadow: allowShadows,
        cellCenterX: opts.cellCenterX,
        cellCenterZ: opts.cellCenterZ,
      });
    }

    if (opts.fallbackMeshes) {
      for (const fb of opts.fallbackMeshes) {
        fb.visible = false;
        opts.parentGroup.remove(fb);
      }
    }

    opts.cleanupCallbacks?.push(() => {
      opts.parentGroup.remove(inst);
      inst.dispose();
    });
  };

  const cached = getCachedUserAsset(opts.assetId);
  if (cached) {
    mount(cached);
    return;
  }

  void loadUserAsset(opts.assetId)
    .then(mount)
    .catch((err) => {
      // Procedural fallback remains visible if an asset fails to fetch
      console.warn(`Optional user asset "${opts.assetId}" unavailable:`, err);
    });
}
