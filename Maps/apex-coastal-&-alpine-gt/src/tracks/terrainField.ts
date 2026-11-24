import type { TerrainField, TrackSample } from './types';

export function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic 2D hash returning [0, 1) */
export function hash2(ix: number, iz: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [0, 1] */
export function valueNoise2D(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);

  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

/** Signed fractal Brownian motion in [-1, 1] */
export function fbm2D(x: number, z: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise2D(x * freq, z * freq) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/** Ridged multifractal noise in [0, 1] for sharp alpine granite ridges */
export function ridged2D(x: number, z: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2D(x * freq, z * freq) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

/** Gaussian radial mound or depression */
export function gaussian2D(
  x: number,
  z: number,
  cx: number,
  cz: number,
  rx: number,
  rz: number
): number {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.exp(-(dx * dx + dz * dz));
}

/** Oriented rectangle blend factor in [0, 1] for engineered pads */
export function orientedPadWeight(
  x: number,
  z: number,
  cx: number,
  cz: number,
  tx: number,
  tz: number,
  rx: number,
  rz: number,
  halfLen: number,
  halfWid: number,
  feather: number
): number {
  const dx = x - cx;
  const dz = z - cz;
  const along = Math.abs(dx * tx + dz * tz);
  const across = Math.abs(dx * rx + dz * rz);
  const wAlong = 1 - smoothstep(halfLen, halfLen + feather, along);
  const wAcross = 1 - smoothstep(halfWid, halfWid + feather, across);
  return wAlong * wAcross;
}

export function computeTerrainSlope(
  getHeight: (x: number, z: number) => number,
  x: number,
  z: number,
  eps = 1.5
): number {
  const hL = getHeight(x - eps, z);
  const hR = getHeight(x + eps, z);
  const hD = getHeight(x, z - eps);
  const hU = getHeight(x, z + eps);
  const dhdx = (hR - hL) / (2 * eps);
  const dhdz = (hU - hD) / (2 * eps);
  return Math.sqrt(dhdx * dhdx + dhdz * dhdz);
}

export interface TrackSpatialQuery {
  minDist: (x: number, z: number) => number;
  nearestInfo: (
    x: number,
    z: number
  ) => {
    nonBridgeDist: number;
    nonBridgeSample: TrackSample | null;
    bridgeDist: number;
    bridgeSample: TrackSample | null;
  };
}

/** Fast O(1) 2D spatial grid index for track samples within +/-36m */
export function createTrackSpatialQuery(
  samples: TrackSample[],
  cellSize = 26
): TrackSpatialQuery {
  const grid = new Map<number, TrackSample[]>();
  const keyFor = (cx: number, cz: number) => ((cx + 256) << 12) | (cz + 256);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const cx = Math.floor(s.x / cellSize);
    const cz = Math.floor(s.z / cellSize);
    const key = keyFor(cx, cz);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(s);
  }

  const nearestInfo = (x: number, z: number) => {
    const cx = Math.floor(x / cellSize);
    const cz = Math.floor(z / cellSize);
    let nonBridgeDistSq = Infinity;
    let nonBridgeSample: TrackSample | null = null;
    let bridgeDistSq = Infinity;
    let bridgeSample: TrackSample | null = null;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = grid.get(keyFor(cx + dx, cz + dz));
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k++) {
          const s = bucket[k];
          const ddx = x - s.x;
          const ddz = z - s.z;
          const d2 = ddx * ddx + ddz * ddz;
          if (s.isBridge) {
            if (d2 < bridgeDistSq) {
              bridgeDistSq = d2;
              bridgeSample = s;
            }
          } else {
            if (d2 < nonBridgeDistSq) {
              nonBridgeDistSq = d2;
              nonBridgeSample = s;
            }
          }
        }
      }
    }

    return {
      nonBridgeDist: nonBridgeSample ? Math.sqrt(nonBridgeDistSq) : Infinity,
      nonBridgeSample,
      bridgeDist: bridgeSample ? Math.sqrt(bridgeDistSq) : Infinity,
      bridgeSample,
    };
  };

  const minDist = (x: number, z: number) => {
    const info = nearestInfo(x, z);
    return Math.min(info.nonBridgeDist, info.bridgeDist);
  };

  return { minDist, nearestInfo };
}

/**
 * Wraps a base terrain heightfield with continuous roadbed cutting/embankment
 * along the track spline so mountains/hills never bury the asphalt road deck
 * while leaving lagoons/lakes deeply carved underneath bridges.
 */
export function withRoadCorridorCarving(
  base: TerrainField,
  samples: TrackSample[],
  roadHalfWidth: number
): TerrainField {
  const cellSize = 28;
  const grid = new Map<number, TrackSample[]>();
  const keyFor = (cx: number, cz: number) => ((cx + 256) << 12) | (cz + 256);

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const cx = Math.floor(s.x / cellSize);
    const cz = Math.floor(s.z / cellSize);
    const key = keyFor(cx, cz);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(s);
  }

  const flatHalf = roadHalfWidth + 4.4;
  const blendHalf = roadHalfWidth + 18.5;
  const flatHalfSq = flatHalf * flatHalf;
  const blendHalfSq = blendHalf * blendHalf;
  const bridgeCheckDist = roadHalfWidth + 6.5;
  const bridgeCheckDistSq = bridgeCheckDist * bridgeCheckDist;

  const getHeight = (x: number, z: number): number => {
    let h = base.getHeight(x, z);
    const cx = Math.floor(x / cellSize);
    const cz = Math.floor(z / cellSize);

    let minNonBridgeSq = Infinity;
    let minFlatTargetY = Infinity;
    let idwSum = 0;
    let idwWeight = 0;

    let minBridgeSq = Infinity;
    let minBridgeTargetY = Infinity;

    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = grid.get(keyFor(cx + dx, cz + dz));
        if (!bucket) continue;
        for (let k = 0; k < bucket.length; k++) {
          const s = bucket[k];
          const ddx = x - s.x;
          const ddz = z - s.z;
          const d2 = ddx * ddx + ddz * ddz;
          if (s.isBridge) {
            if (d2 < bridgeCheckDistSq) {
              if (d2 < minBridgeSq) minBridgeSq = d2;
              const bCap = s.y - 2.4;
              if (bCap < minBridgeTargetY) minBridgeTargetY = bCap;
            }
          } else if (d2 < blendHalfSq) {
            if (d2 < minNonBridgeSq) minNonBridgeSq = d2;
            const ty = s.y - 0.45;
            if (d2 <= flatHalfSq && ty < minFlatTargetY) {
              minFlatTargetY = ty;
            }
            const invW = 1 / (d2 + 1.0);
            idwSum += ty * invW;
            idwWeight += invW;
          }
        }
      }
    }

    if (minNonBridgeSq < blendHalfSq) {
      const dist = Math.sqrt(minNonBridgeSq);
      const w = 1 - smoothstep(flatHalf, blendHalf, dist);
      const idwY = idwSum / Math.max(idwWeight, 1e-6);
      const targetY =
        minFlatTargetY < Infinity
          ? lerp(minFlatTargetY, idwY, smoothstep(flatHalf * 0.85, blendHalf, dist))
          : idwY;
      const padW = base.isPitOrGrandstandPad(x, z);
      if (padW > 0.2) {
        h = Math.min(h, lerp(h, targetY, w));
      } else {
        h = lerp(h, targetY, w);
      }
    }

    if (minBridgeSq < bridgeCheckDistSq && h > minBridgeTargetY) {
      const bDist = Math.sqrt(minBridgeSq);
      const bw = 1 - smoothstep(roadHalfWidth + 2.5, bridgeCheckDist, bDist);
      h = lerp(h, minBridgeTargetY, bw);
    }

    return clamp(h, base.minHeight, base.maxHeight);
  };

  return {
    mapId: base.mapId,
    waterLevel: base.waterLevel,
    minHeight: base.minHeight,
    maxHeight: base.maxHeight,
    getRawHeight: base.getRawHeight,
    getHeight,
    getSlope: (x: number, z: number) => computeTerrainSlope(getHeight, x, z),
    isPitOrGrandstandPad: base.isPitOrGrandstandPad,
  };
}

export type { TerrainField };
