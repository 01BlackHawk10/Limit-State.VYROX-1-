import {
  clamp,
  computeTerrainSlope,
  fbm2D,
  gaussian2D,
  lerp,
  orientedPadWeight,
  ridged2D,
  smoothstep,
} from './terrainField';
import type { TerrainField } from './types';

export const FROSTPEAK_WATER_LEVEL = 4.0;
export const FROSTPEAK_MIN_Y = -9.0;
export const FROSTPEAK_MAX_Y = 235.0;

/**
 * Continuous heightfield for Frostpeak Glacier GT:
 * - South-to-north alpine elevation rise (+31 m), global clamp [-9.0, 235.0] m
 * - Central Glacier Granite Spur & Ice Peak (-8, -32) rising to +132 m
 * - Outer Jagged Granite Cirque Ring (radial > 395..635 m) framing valley horizon
 * - Summit Ski Lodge Knoll (255, -310) elevated at +12.5 m relative shelf
 * - Recessed Frozen Glacial Lake Basin (55, 185) (-37.5 m carve, bed down to -6.5 m)
 * - Northern Meltwater Cove & Plunge Pool (42, 92)
 * - Icefall Granite Cliff Headwall (16, 36) rising to +64 m
 * - Leveled SW Ski Village Terrace (-175, 128)
 * - Engineered pads under North Heated Ridge pit complex (-15, -224.5, y: 42.0) and opposite grandstand
 */
function evaluateRawFrostpeakHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);

  // Base alpine valley shelf + south-to-north alpine elevation rise (+31m)
  const northRise = smoothstep(260, -240, z) * 31.0;
  let h =
    11.5 +
    northRise +
    fbm2D(x * 0.0048 - 2.3, z * 0.0048 + 4.4, 4) * 5.2 +
    fbm2D(x * 0.017, z * 0.017, 3) * 1.8;

  // Central Glacier Granite Spur & Ice Peak (-8, -32) rising to +132m
  const dPeak = Math.hypot(x + 8, z + 32);
  const glacierSpur = Math.exp(-(dPeak * dPeak) / (105 * 105)) * 98.0;
  const jaggedCrest =
    ridged2D(x * 0.014 + 1.2, z * 0.014 - 0.8, 4) *
    28.0 *
    Math.exp(-(dPeak * dPeak) / (140 * 140));
  h += glacierSpur + jaggedCrest;

  // Outer Jagged Granite Cirque Ring (radial > 395..635m) framing the horizon
  if (r > 365) {
    const ringFactor = smoothstep(375, 535, r);
    const cirqueRidge = 42.0 + ridged2D(x * 0.011, z * 0.011, 4) * 112.0;
    h += ringFactor * cirqueRidge;
  }

  // Summit Ski Lodge Knoll (255, -310) elevated at +12.5m relative shelf
  const lodgeKnoll = gaussian2D(x, z, 255, -310, 56, 48);
  h = lerp(h, 52.5 + fbm2D(x * 0.02, z * 0.02, 2) * 1.1, smoothstep(0.22, 0.72, lodgeKnoll));

  // Icefall Granite Cliff Headwall (16, 36) rising to +64m
  const icefallCliff = gaussian2D(x, z, 16, 36, 44, 34);
  h = lerp(h, 64.0 + ridged2D(x * 0.025, z * 0.025, 2) * 4.0, smoothstep(0.25, 0.78, icefallCliff));

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

function getFrostpeakPadWeight(x: number, z: number): number {
  // North Heated Ridge pit complex centered at (-15, -224.5), tangent (-1, 0), right (0, -1), y = 42.0
  const pitPad = orientedPadWeight(x, z, -15, -224.5, -1, 0, 0, -1, 136, 28, 22);
  // Opposite heated grandstand & straight centered at (-15, -178)
  const grandPad = orientedPadWeight(x, z, -15, -178.0, -1, 0, 0, -1, 140, 24, 22);
  return Math.max(pitPad, grandPad);
}

export function createFrostpeakTerrainField(): TerrainField {
  const getRawHeight = (x: number, z: number) => evaluateRawFrostpeakHeight(x, z);

  const getHeight = (x: number, z: number) => {
    const raw = evaluateRawFrostpeakHeight(x, z);
    const pitPad = orientedPadWeight(x, z, -15, -224.5, -1, 0, 0, -1, 136, 28, 22);
    const grandPad = orientedPadWeight(x, z, -15, -178.0, -1, 0, 0, -1, 140, 24, 22);

    let h = raw;
    if (pitPad > 0.001) h = lerp(h, 41.92, pitPad);
    if (grandPad > 0.001) h = lerp(h, 41.92, grandPad);
    return clamp(h, FROSTPEAK_MIN_Y, FROSTPEAK_MAX_Y);
  };

  return {
    mapId: 'frostpeak_pass',
    waterLevel: FROSTPEAK_WATER_LEVEL,
    minHeight: FROSTPEAK_MIN_Y,
    maxHeight: FROSTPEAK_MAX_Y,
    getRawHeight,
    getHeight,
    getSlope: (x: number, z: number) => computeTerrainSlope(getHeight, x, z),
    isPitOrGrandstandPad: getFrostpeakPadWeight,
  };
}
