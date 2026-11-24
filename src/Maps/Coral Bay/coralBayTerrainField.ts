import { clamp, lerp, smoothstep } from '../../engine/mathNoise';

export const CORAL_BAY_WATER_LEVEL = 0.0;
export const CORAL_BAY_MIN_Y = -11.0;
export const CORAL_BAY_MAX_Y = 120.0;

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

function orientedPadWeight(
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
  feather: number,
): number {
  const dx = x - cx;
  const dz = z - cz;
  const along = Math.abs(dx * tx + dz * tz);
  const across = Math.abs(dx * rx + dz * rz);
  const wAlong = 1 - smoothstep(halfLen, halfLen + feather, along);
  const wAcross = 1 - smoothstep(halfWid, halfWid + feather, across);
  return wAlong * wAcross;
}

/**
 * Continuous heightfield for Coral Bay Coastal GT (ported from user's Coral Bay map):
 * - Base peninsula shelf: +4.8 m to +15 m, north cliff rise +14.5 m
 * - Central Emerald Volcanic Caldera Massif (15, -45) rising up to +78 m
 * - Southern Jungle Knoll (28, 72) up to +32 m
 * - NW Limestone Bluff (-225, -335) up to +22 m
 * - East Headland Lighthouse Bluff (408, 28) at +15.5 m
 * - Waterfall Basalt Headwall (-32, -92) at +46 m -> Plunge Pool Cove (14, -148) at -6.2 m
 * - NE Turquoise Coral Lagoon & Channel (85, -245) carved to -28 m with shallow sandbar reefs (-7.8 m)
 * - Western Resort Marina Harbor Cove (-238, 92) carved to -15.5 m
 * - South Sandy Beachfront (z > 255) & Outer Ocean Drop (radial > 410 m -> -9.5 m)
 * - Resort beachfront promenade strip gently terraced around (-25, 316)
 */
export function coralBayRawHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);

  // Base peninsula shelf (+4.8m .. +15m) with gentle coastal undulation
  let h =
    6.4 +
    fbmSigned(x * 0.0042 + 3.1, z * 0.0042 - 1.7, 4) * 4.4 +
    fbmSigned(x * 0.015, z * 0.015, 3) * 1.4;

  // North cliff shelf rise (+14.5m toward north headland)
  const northCliff = smoothstep(-40, -290, z) * 14.5;
  h += northCliff;

  // Central Emerald Volcanic Caldera Massif (15, -45) up to +78m with subtle crater rim
  const dCaldera = Math.hypot(x - 15, z + 45);
  const calderaCone = Math.exp(-(dCaldera * dCaldera) / (92 * 92)) * 74.0;
  const calderaCrater = Math.exp(-(dCaldera * dCaldera) / (26 * 26)) * 14.0;
  const calderaRidges =
    ridged01(x * 0.018, z * 0.018, 3) * 8.5 * Math.exp(-(dCaldera * dCaldera) / (110 * 110));
  h += calderaCone - calderaCrater + calderaRidges;

  // Southern Jungle Knoll (28, 72) up to +32m
  h += gaussian2D(x, z, 28, 72, 68, 58) * 24.5;

  // NW Limestone Bluff (-225, -335) up to +22m
  const nwBluff = gaussian2D(x, z, -225, -335, 78, 62);
  h = lerp(h, 22.0 + fbmSigned(x * 0.02, z * 0.02, 3) * 2.5, smoothstep(0.18, 0.72, nwBluff));

  // East Headland Lighthouse Bluff (408, 28) plateau at +15.5m
  const eastHeadland = gaussian2D(x, z, 408, 28, 76, 68);
  h = lerp(h, 15.5, smoothstep(0.22, 0.68, eastHeadland));

  // Waterfall Basalt Headwall (-32, -92) at +46m
  const headwall = gaussian2D(x, z, -32, -92, 42, 34);
  h = lerp(h, 46.0 + ridged01(x * 0.03, z * 0.03, 2) * 3.0, smoothstep(0.24, 0.76, headwall));

  // Deep Plunge Pool Cove (14, -148) carved down to -6.2m
  const plungePool = gaussian2D(x, z, 14, -148, 34, 34);
  h = lerp(h, -6.2, smoothstep(0.18, 0.68, plungePool));

  // NE Turquoise Coral Lagoon & Channel (85, -245) carved to -28m, with shallow sandbar reefs (-7.8m)
  const lagoonBowl = gaussian2D(x, z, 85, -245, 92, 74);
  if (lagoonBowl > 0.04) {
    const reefNoise = valueNoise01(x * 0.042 + 8.3, z * 0.042 - 4.1);
    const sandbarMask = smoothstep(0.58, 0.78, reefNoise) * smoothstep(0.15, 0.55, lagoonBowl);
    const lagoonTarget = lerp(-28.0, -7.8, sandbarMask * 0.88);
    h = lerp(h, lagoonTarget, smoothstep(0.1, 0.64, lagoonBowl));
  }

  // Western Resort Marina Harbor Cove (-238, 92) carved to -15.5m
  const marinaCove = gaussian2D(x, z, -238, 92, 62, 56);
  h = lerp(h, -15.5, smoothstep(0.2, 0.68, marinaCove));

  // South Sandy Beachfront (z > 255) sloping gently into surf
  if (z > 255) {
    const beachSlope = smoothstep(255, 365, z);
    const gentleSand = 5.4 - beachSlope * 8.2 + fbmSigned(x * 0.018, z * 0.018, 2) * 0.6;
    h = lerp(h, gentleSand, smoothstep(255, 315, z));
  }

  // Resort villa beachfront promenade strip (x = -195..145, z ~ 316)
  const promPad = orientedPadWeight(x, z, -25, 316, 1, 0, 0, 1, 175, 14, 18);
  if (promPad > 0.001) {
    h = lerp(h, 2.35, promPad * 0.72);
  }

  // Outer Ocean Drop (radial > 410m -> -9.5m)
  const outerOcean = smoothstep(410, 505, r);
  h = lerp(h, -9.5 + fbmSigned(x * 0.02, z * 0.02, 2) * 1.1, outerOcean);

  return clamp(h, CORAL_BAY_MIN_Y, CORAL_BAY_MAX_Y);
}
