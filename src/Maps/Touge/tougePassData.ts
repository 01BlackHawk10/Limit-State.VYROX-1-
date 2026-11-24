import type { MapId } from '../mapRegistry';
import type { CircuitLayoutPreset } from '../Aurelia Ridge/circuitSpline';
import { fbm2D, ridgedNoise2D, smoothstep } from '../../engine/mathNoise';

export type TougeDirection = 'downhill' | 'uphill';

export function isTougeMapId(mapId: MapId | string): boolean {
  return mapId === 'akina_pass' || mapId === 'akagi_pass' || mapId === 'myogi_pass';
}

export const AKINA_CONTROL_POINTS: Array<[number, number, number]> = [
  [-720, 224.0, -760], // 0: Lake Haruna Summit Starting Gate
  [-500, 218.0, -740], // 1: Summit Opening Straight
  [-260, 206.0, -680], // 2: High-Speed Opening Sweeper
  [-80, 190.0, -560],  // 3: Entry Esses Left
  [140, 172.0, -620],  // 4: High Ridge Sweeper
  [380, 154.0, -520],  // 5: Brake Marker Chute
  [520, 138.0, -360],  // 6: Five Hairpins #1 (Outer Gutter)
  [220, 124.0, -300],  // 7: Hairpin #1 Exit Bench
  [-110, 110.0, -240], // 8: Hairpin #2 Approach
  [-340, 98.0, -120],  // 9: Five Hairpins #2 (Inner Gutter)
  [-80, 86.0, -20],    // 10: Hairpin #3 Transition
  [280, 74.0, 30],     // 11: Five Hairpins #3 (Tight Right)
  [420, 62.0, 160],    // 12: Five Hairpins #4 (Wide Entry)
  [110, 50.0, 220],    // 13: Hairpin #4 Exit Chute
  [-230, 39.0, 290],   // 14: Five Hairpins #5 (Final Switchback)
  [-380, 31.0, 440],   // 15: Lower S-Bends Left
  [-160, 26.0, 590],   // 16: Pine Corridor Right
  [150, 24.0, 680],    // 17: Valley Bridge Approach
  [460, 24.0, 720],    // 18: Finish Line Flat Straight
];

export const AKAGI_CONTROL_POINTS: Array<[number, number, number]> = [
  [-680, 208.0, 660],  // 0: Akagi Summit Observatory Gate
  [-480, 202.0, 580],  // 1: Start Run Straight
  [-220, 188.0, 520],  // 2: Sweeping Right Crest
  [40, 172.0, 620],    // 3: Southern Ridge Fast Sweeper
  [310, 156.0, 510],   // 4: Double-Apex Bowl Entry
  [460, 140.0, 290],   // 5: Double-Apex Bowl Exit
  [240, 124.0, 140],   // 6: Mid-Pass Technical Chute
  [-80, 108.0, 170],   // 7: White Comet Left Hairpin
  [-360, 92.0, 20],    // 8: Blind Crest Straight
  [-180, 76.0, -150],  // 9: Canyon Right Switchback
  [180, 62.0, -170],   // 10: Flowing Esses Entry
  [440, 48.0, -320],   // 11: High-Speed Left Transition
  [260, 36.0, -520],   // 12: Final Valley Hairpin
  [-80, 27.0, -580],   // 13: Lower Forest Straight
  [-420, 23.0, -640],  // 14: Foothill Sweep
  [-700, 22.0, -660],  // 15: Akagi Base Finish Gate
];

export const MYOGI_CONTROL_POINTS: Array<[number, number, number]> = [
  [680, 214.0, -700],  // 0: Myogi Crag Summit Gate
  [480, 206.0, -640],  // 1: Crag Launch Chute
  [240, 188.0, -560],  // 2: Steep Drop Left
  [40, 168.0, -680],   // 3: Rock Face Hairpin Right
  [-240, 150.0, -540], // 4: Tight Canyon Esses
  [-480, 132.0, -380], // 5: Cliffside Hairpin 1
  [-220, 114.0, -220], // 6: Steep Chute Straight
  [140, 96.0, -260],   // 7: Night Kids Hairpin 2
  [380, 80.0, -80],    // 8: Gorge Curve Right
  [120, 64.0, 80],     // 9: Tight Chicane Left
  [-220, 50.0, 120],   // 10: Lower Gorge Hairpin
  [-440, 38.0, 320],   // 11: Pine Canopy Sweeper
  [-180, 28.0, 480],   // 12: Valley Exit Bend
  [180, 21.0, 560],    // 13: Guardrail Straight
  [520, 18.0, 620],    // 14: Myogi Valley Finish Gate
];

export const AKINA_EDITABLE_WAYPOINTS: ReadonlyArray<{ index: number; label: string }> = [
  { index: 3, label: 'Opening Esses' },
  { index: 6, label: 'Hairpin 1 (Gutter)' },
  { index: 9, label: 'Hairpin 2' },
  { index: 11, label: 'Hairpin 3' },
  { index: 12, label: 'Hairpin 4' },
  { index: 14, label: 'Hairpin 5' },
  { index: 16, label: 'Lower Corridor' },
];

export const AKAGI_EDITABLE_WAYPOINTS: ReadonlyArray<{ index: number; label: string }> = [
  { index: 3, label: 'South Ridge Sweep' },
  { index: 5, label: 'Double-Apex Bowl' },
  { index: 7, label: 'White Comet Hairpin' },
  { index: 9, label: 'Canyon Switchback' },
  { index: 12, label: 'Valley Hairpin' },
];

export const MYOGI_EDITABLE_WAYPOINTS: ReadonlyArray<{ index: number; label: string }> = [
  { index: 3, label: 'Rock Face Hairpin' },
  { index: 5, label: 'Cliffside Hairpin 1' },
  { index: 7, label: 'Night Kids Hairpin' },
  { index: 10, label: 'Lower Gorge Hairpin' },
  { index: 12, label: 'Valley Exit Bend' },
];

export const EMPTY_TOUGE_DELTAS: Record<
  CircuitLayoutPreset,
  Record<number, [number, number, number]>
> = {
  original: {},
  technical_chicanes: {},
  high_speed: {},
  drift_canyon: {},
};

export function akinaRawHeight(x: number, z: number): number {
  const macro = fbm2D(x * 0.0016, z * 0.0016, 4, 2.05, 0.5, 4201);
  const ridge = ridgedNoise2D(x * 0.0024, z * 0.0024, 4, 2.1, 0.52, 4219);
  const detail = fbm2D(x * 0.011, z * 0.011, 2, 2.0, 0.48, 4243) * 4.5;
  const slopeNwToSe = smoothstep(820, -820, z) * 165.0 + smoothstep(750, -750, x) * 42.0;
  const peakRim = smoothstep(520, 960, Math.hypot(x, z)) * 55.0;
  return 12.0 + slopeNwToSe + macro * 26.0 + ridge * 38.0 + detail + peakRim;
}

export function akagiRawHeight(x: number, z: number): number {
  const macro = fbm2D(x * 0.0017, z * 0.0017, 4, 2.05, 0.5, 5101);
  const ridge = ridgedNoise2D(x * 0.0022, z * 0.0022, 4, 2.1, 0.52, 5119);
  const detail = fbm2D(x * 0.012, z * 0.012, 2, 2.0, 0.48, 5147) * 4.2;
  const slopeSwToNe = smoothstep(-760, 760, z) * 155.0 + smoothstep(720, -720, x) * 32.0;
  const peakRim = smoothstep(500, 950, Math.hypot(x, z)) * 48.0;
  return 14.0 + slopeSwToNe + macro * 24.0 + ridge * 34.0 + detail + peakRim;
}

export function myogiRawHeight(x: number, z: number): number {
  const macro = fbm2D(x * 0.0018, z * 0.0018, 4, 2.08, 0.52, 6203);
  const ridge = ridgedNoise2D(x * 0.0031, z * 0.0031, 4, 2.15, 0.55, 6229);
  const detail = fbm2D(x * 0.014, z * 0.014, 2, 2.0, 0.5, 6257) * 5.2;
  const slopeNeToSw = smoothstep(780, -780, z) * 160.0 + smoothstep(-740, 740, x) * 36.0;
  const crags = smoothstep(0.45, 0.9, ridge) * 42.0;
  return 10.0 + slopeNeToSw + macro * 22.0 + ridge * 46.0 + crags + detail;
}
