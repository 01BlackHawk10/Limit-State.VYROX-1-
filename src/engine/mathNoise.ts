/**
 * Deterministic procedural noise and interpolation utilities for terrain sculpting.
 */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Deterministic hash in [0, 1) from 2D integer grid coordinates */
function hash2(ix: number, iz: number, seed: number): number {
  let n = ix * 374761393 + iz * 668265263 + seed * 1442695041;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return (n >>> 0) / 4294967296;
}

/** Smooth 2D value noise in [-1, 1] */
export function valueNoise2D(x: number, z: number, seed = 1337): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;

  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);

  const v = lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
  return v * 2 - 1;
}

/** Multi-octave fractional Brownian motion in roughly [-1, 1] */
export function fbm2D(
  x: number,
  z: number,
  octaves = 5,
  lacunarity = 2.04,
  gain = 0.5,
  seed = 1337,
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, z * freq, seed + i * 97);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal noise in [0, 1] for sharp alpine limestone ridges */
export function ridgedNoise2D(
  x: number,
  z: number,
  octaves = 4,
  lacunarity = 2.1,
  gain = 0.52,
  seed = 4099,
): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2D(x * freq, z * freq, seed + i * 131));
    sum += amp * n * n;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Deterministic PRNG for scattering props and foliage */
export function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Computes uniform normalization scale to bring an exported car GLB (including nested cm->m 0.01 nodes)
 * to its true real-world bumper-to-bumper length in meters.
 */
export function computeCarNormalizationScale(
  initialLengthZ: number,
  targetLengthM: number,
): number {
  if (!(initialLengthZ > 0.001) || !Number.isFinite(initialLengthZ)) {
    return 1.0;
  }
  return Math.min(5000, Math.max(0.0001, targetLengthM / initialLengthZ));
}

