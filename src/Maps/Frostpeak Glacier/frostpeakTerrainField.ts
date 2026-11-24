import { clamp, lerp, smoothstep } from '../../engine/mathNoise';

export const FROSTPEAK_WATER_LEVEL = 4.0;
export const FROSTPEAK_MIN_Y = -9.0;
export const FROSTPEAK_MAX_Y = 235.0;

function hash2_01(ix: number, iz: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise01(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2_01(ix, iz);
  const b = hash2_01(ix + 1, iz);
  const c = hash2_01(ix, iz + 1);
  const d = hash2_01(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

function fbmSigned(x: number, z: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += (valueNoise01(x * freq, z * freq) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function ridged01(x: number, z: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise01(x * freq, z * freq) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.07;
  }
  return sum / norm;
}

function gaussian2D(
  x: number,
  z: number,
  cx: number,
  cz: number,
  rx: number,
  rz: number,
): number {
  const dx = (x - cx) / rx;
  const dz = (z - cz) / rz;
  return Math.exp(-(dx * dx + dz * dz));
}

/**
 * Continuous heightfield for Frostpeak Glacier GT (ported from user's Frostpeak map):
 * - South-to-north alpine elevation rise (+31 m), global clamp [-9.0, 235.0] m
 * - Central Glacier Granite Spur & Ice Peak (-8, -32) rising to +132 m
 * - Outer Jagged Granite Cirque Ring (radial > 365 m) framing valley horizon
 * - Summit Ski Lodge Knoll (255, -310) elevated at +52.5 m shelf
 * - Recessed Frozen Glacial Lake Basin (55, 185) (-37.5 m carve, bed down to -6.5 m)
 * - Northern Meltwater Cove & Plunge Pool (42, 92)
 * - Icefall Granite Cliff Headwall (16, 36) rising to +64 m
 * - Leveled SW Ski Village Terrace (-175, 128)
 */
export function frostpeakRawHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);

  // Base alpine valley shelf + south-to-north alpine elevation rise (+31m)
  const northRise = smoothstep(260, -240, z) * 31.0;
  let h =
    11.5 +
    northRise +
    fbmSigned(x * 0.0048 - 2.3, z * 0.0048 + 4.4, 4) * 5.2 +
    fbmSigned(x * 0.017, z * 0.017, 3) * 1.8;

  // Central Glacier Granite Spur & Ice Peak (-8, -32) rising to +132m
  const dPeak = Math.hypot(x + 8, z + 32);
  const glacierSpur = Math.exp(-(dPeak * dPeak) / (105 * 105)) * 98.0;
  const jaggedCrest =
    ridged01(x * 0.014 + 1.2, z * 0.014 - 0.8, 4) *
    28.0 *
    Math.exp(-(dPeak * dPeak) / (140 * 140));
  h += glacierSpur + jaggedCrest;

  // Outer Jagged Granite Cirque Ring (radial > 375..535m) framing the horizon
  if (r > 365) {
    const ringFactor = smoothstep(375, 535, r);
    const cirqueRidge = 42.0 + ridged01(x * 0.011, z * 0.011, 4) * 112.0;
    h += ringFactor * cirqueRidge;
  }

  // Summit Ski Lodge Knoll (255, -310) elevated at +52.5m shelf
  const lodgeKnoll = gaussian2D(x, z, 255, -310, 56, 48);
  h = lerp(h, 52.5 + fbmSigned(x * 0.02, z * 0.02, 2) * 1.1, smoothstep(0.22, 0.72, lodgeKnoll));

  // Icefall Granite Cliff Headwall (16, 36) rising to +64m
  const icefallCliff = gaussian2D(x, z, 16, 36, 44, 34);
  h = lerp(h, 64.0 + ridged01(x * 0.025, z * 0.025, 2) * 4.0, smoothstep(0.25, 0.78, icefallCliff));

  // Northern Meltwater Cove & Plunge Pool (42, 92)
  const meltwaterPool = gaussian2D(x, z, 42, 92, 34, 34);
  h = lerp(h, -2.5, smoothstep(0.22, 0.7, meltwaterPool));

  // Recessed Frozen Glacial Lake Basin (55, 185) (-37.5m carve, bed down to -6.5m)
  const lakeBasin = gaussian2D(x, z, 55, 185, 108, 76);
  if (lakeBasin > 0.05) {
    const carve = smoothstep(0.08, 0.62, lakeBasin) * 37.5;
    h = Math.min(h - carve * 0.45, lerp(h, -6.5, smoothstep(0.18, 0.66, lakeBasin)));
  }

  // Leveled SW Ski Village Terrace (-175, 128)
  const villageTerrace = gaussian2D(x, z, -175, 128, 74, 58);
  h = lerp(h, 21.8, smoothstep(0.2, 0.68, villageTerrace));

  return clamp(h, FROSTPEAK_MIN_Y, FROSTPEAK_MAX_Y);
}
