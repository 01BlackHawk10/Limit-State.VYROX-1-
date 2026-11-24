import {
  clamp,
  computeTerrainSlope,
  fbm2D,
  gaussian2D,
  lerp,
  orientedPadWeight,
  ridged2D,
  smoothstep,
  valueNoise2D,
} from './terrainField';
import type { TerrainField } from './types';

export const CORAL_BAY_WATER_LEVEL = 0.0;
export const CORAL_BAY_MIN_Y = -11.0;
export const CORAL_BAY_MAX_Y = 120.0;

/**
 * Continuous heightfield for Coral Bay Coastal GT:
 * - Base peninsula shelf: +4.8 m to +15 m, north cliff rise +20 m
 * - Central Emerald Volcanic Caldera Massif (15, -45) rising up to +78 m
 * - Southern Jungle Knoll (28, 72) up to +32 m
 * - NW Limestone Bluff (-225, -335) up to +22 m
 * - East Headland Lighthouse Bluff (408, 28) at +15.5 m
 * - Waterfall Basalt Headwall (-32, -92) at +46 m -> Plunge Pool Cove (14, -148) at -6.2 m
 * - NE Turquoise Coral Lagoon & Channel (85, -245) carved to -28 m with shallow sandbar reefs (-7.8 m)
 * - Western Resort Marina Harbor Cove (-238, 92) carved to -15.5 m
 * - South Sandy Beachfront (z > 325) & Outer Ocean Drop (radial > 425 m -> -9.5 m)
 * - Flattened terrace pads carved under pit lane apron and opposite main grandstand
 */
function evaluateRawCoralBayHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);

  // Base peninsula shelf (+4.8m .. +15m) with gentle coastal undulation
  let h =
    6.4 +
    fbm2D(x * 0.0042 + 3.1, z * 0.0042 - 1.7, 4) * 4.4 +
    fbm2D(x * 0.015, z * 0.015, 3) * 1.4;

  // North cliff shelf rise (+20m toward north headland)
  const northCliff = smoothstep(-40, -290, z) * 14.5;
  h += northCliff;

  // Central Emerald Volcanic Caldera Massif (15, -45) up to +78m with subtle crater rim
  const dCaldera = Math.hypot(x - 15, z + 45);
  const calderaCone = Math.exp(-(dCaldera * dCaldera) / (92 * 92)) * 74.0;
  const calderaCrater = Math.exp(-(dCaldera * dCaldera) / (26 * 26)) * 14.0;
  const calderaRidges = ridged2D(x * 0.018, z * 0.018, 3) * 8.5 * Math.exp(-(dCaldera * dCaldera) / (110 * 110));
  h += calderaCone - calderaCrater + calderaRidges;

  // Southern Jungle Knoll (28, 72) up to +32m
  h += gaussian2D(x, z, 28, 72, 68, 58) * 24.5;

  // NW Limestone Bluff (-225, -335) up to +22m
  const nwBluff = gaussian2D(x, z, -225, -335, 78, 62);
  h = lerp(h, 22.0 + fbm2D(x * 0.02, z * 0.02, 3) * 2.5, smoothstep(0.18, 0.72, nwBluff));

  // East Headland Lighthouse Bluff (408, 28) plateau at +15.5m
  const eastHeadland = gaussian2D(x, z, 408, 28, 76, 68);
  h = lerp(h, 15.5, smoothstep(0.22, 0.68, eastHeadland));

  // Waterfall Basalt Headwall (-32, -92) at +46m
  const headwall = gaussian2D(x, z, -32, -92, 42, 34);
  h = lerp(h, 46.0 + ridged2D(x * 0.03, z * 0.03, 2) * 3.0, smoothstep(0.24, 0.76, headwall));

  // Deep Plunge Pool Cove (14, -148) carved down to -6.2m
  const plungePool = gaussian2D(x, z, 14, -148, 34, 34);
  h = lerp(h, -6.2, smoothstep(0.18, 0.68, plungePool));

  // NE Turquoise Coral Lagoon & Channel (85, -245) carved to -28m, with shallow sandbar reefs (-7.8m)
  const lagoonBowl = gaussian2D(x, z, 85, -245, 92, 74);
  if (lagoonBowl > 0.04) {
    const reefNoise = valueNoise2D(x * 0.042 + 8.3, z * 0.042 - 4.1);
    const sandbarMask = smoothstep(0.58, 0.78, reefNoise) * smoothstep(0.15, 0.55, lagoonBowl);
    const lagoonTarget = lerp(-28.0, -7.8, sandbarMask * 0.88);
    h = lerp(h, lagoonTarget, smoothstep(0.1, 0.64, lagoonBowl));
  }

  // Western Resort Marina Harbor Cove (-238, 92) carved to -15.5m
  const marinaCove = gaussian2D(x, z, -238, 92, 62, 56);
  h = lerp(h, -15.5, smoothstep(0.2, 0.68, marinaCove));

  // South Sandy Beachfront (z > 325) sloping gently into surf
  if (z > 255) {
    const beachSlope = smoothstep(255, 365, z);
    const gentleSand = 5.4 - beachSlope * 8.2 + fbm2D(x * 0.018, z * 0.018, 2) * 0.6;
    h = lerp(h, gentleSand, smoothstep(255, 315, z));
  }

  // Outer Ocean Drop (radial > 425m -> -9.5m)
  const outerOcean = smoothstep(410, 505, r);
  h = lerp(h, -9.5 + fbm2D(x * 0.02, z * 0.02, 2) * 1.1, outerOcean);

  return clamp(h, CORAL_BAY_MIN_Y, CORAL_BAY_MAX_Y);
}

function getCoralBayPadWeight(x: number, z: number): number {
  // Pit lane apron pad centered at (-20, 214.5), tangent (1,0), right (0,1)
  const pitPad = orientedPadWeight(x, z, -20, 214.5, 1, 0, 0, 1, 136, 28, 22);
  // Opposite main grandstand & main straight pad centered at (-20, 174)
  const grandPad = orientedPadWeight(x, z, -20, 174.0, 1, 0, 0, 1, 140, 24, 22);
  // Resort villa beachfront promenade strip (x = -195..145, z ~ 316)
  const promPad = orientedPadWeight(x, z, -25, 316, 1, 0, 0, 1, 175, 14, 18);
  return Math.max(pitPad, grandPad, promPad * 0.65);
}

export function createCoralBayTerrainField(): TerrainField {
  const getRawHeight = (x: number, z: number) => evaluateRawCoralBayHeight(x, z);

  const getHeight = (x: number, z: number) => {
    const raw = evaluateRawCoralBayHeight(x, z);
    const pitPad = orientedPadWeight(x, z, -20, 214.5, 1, 0, 0, 1, 136, 28, 22);
    const grandPad = orientedPadWeight(x, z, -20, 174.0, 1, 0, 0, 1, 140, 24, 22);
    const promPad = orientedPadWeight(x, z, -25, 316, 1, 0, 0, 1, 175, 14, 18);

    let h = raw;
    if (pitPad > 0.001) h = lerp(h, 6.42, pitPad);
    if (grandPad > 0.001) h = lerp(h, 6.42, grandPad);
    if (promPad > 0.001) h = lerp(h, 2.35, promPad * 0.72);
    return clamp(h, CORAL_BAY_MIN_Y, CORAL_BAY_MAX_Y);
  };

  return {
    mapId: 'coral_bay',
    waterLevel: CORAL_BAY_WATER_LEVEL,
    minHeight: CORAL_BAY_MIN_Y,
    maxHeight: CORAL_BAY_MAX_Y,
    getRawHeight,
    getHeight,
    getSlope: (x: number, z: number) => computeTerrainSlope(getHeight, x, z),
    isPitOrGrandstandPad: getCoralBayPadWeight,
  };
}
