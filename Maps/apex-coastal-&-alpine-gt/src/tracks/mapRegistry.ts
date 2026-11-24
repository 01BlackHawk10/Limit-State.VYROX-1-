import { clamp, lerp } from './terrainField';
import type { AtmospherePreset, MapDefinition, MapId } from './types';

export const MAP_REGISTRY: Record<MapId, MapDefinition> = {
  coral_bay: {
    id: 'coral_bay',
    name: 'Coral Bay Coastal GT',
    subtitle: 'Tropical Peninsula, Coral Lagoon Causeway & Caldera Ridge',
    accent: '#06b6d4',
    closedLoop: true,
    targetLengthKm: 2.7,
    elevationDeltaM: 23,
    minSplineY: 3.5,
    roadWidth: 15.0,
    roadHalfWidth: 7.5,
    straightHalfLength: 145,
    lockedControlIndices: [0, 1, 2, 8, 9, 10],
    editableWaypoints: [
      { index: 3, label: 'T1 Palm Sweeper' },
      { index: 4, label: 'T2 Headland Lighthouse' },
      { index: 5, label: 'T3 Reef Point' },
      { index: 6, label: 'T4 Inner Lagoon Apex' },
      { index: 11, label: 'T5 NE Spit Hairpin' },
      { index: 12, label: 'T7 Caldera Cliff' },
      { index: 13, label: 'T8 Volcanic Overlook' },
      { index: 14, label: 'T10 Cove Waterfall' },
      { index: 16, label: 'T12 Marina Curve' },
    ],
    layoutPresets: [
      { id: 'original', label: 'Original' },
      { id: 'technical_chicanes', label: 'Technical Chicanes' },
      { id: 'high_speed', label: 'High Speed' },
      { id: 'drift_canyon', label: 'Drift Canyon' },
    ],
    sectors: [
      { id: 'S1', name: 'Harborfront Straight & East Headland', startT: 0, endT: 0.34 },
      { id: 'S2', name: 'Coral Lagoon Causeway & Caldera Cliff', startT: 0.34, endT: 0.69 },
      { id: 'S3', name: 'Cove Waterfall & Marina Chicane', startT: 0.69, endT: 1.0 },
    ],
    pitFrame: {
      centerX: -20,
      centerZ: 214.5,
      tangentX: 1,
      tangentZ: 0,
      rightX: 0,
      rightZ: 1,
      y: 6.5,
      toleranceY: 4.5,
      halfLength: 120,
      halfWidth: 10.5,
    },
    podiumPosition: [-20, 6.5, 235],
    bridgeHub: { x: 85, z: -245 },
    bridgeHalfSamples: 135,
    waterLevel: 0.0,
    defaultSolarDeg: 14,
    defaultHaze: 0.28,
    vantages: [
      {
        id: 'overview',
        label: 'Full Coastal Circuit',
        position: [0, 325, 420],
        target: [0, 12, -20],
        fov: 48,
      },
      {
        id: 'straight',
        label: 'Harborfront Straight',
        position: [-195, 28, 224],
        target: [40, 8, 192],
        fov: 46,
      },
      {
        id: 'roadlevel',
        label: 'Boardwalk Level',
        position: [-95, 11.5, 206],
        target: [65, 7.5, 192],
        fov: 52,
      },
      {
        id: 'bridgedeck',
        label: 'Causeway Deck',
        position: [158, 14.5, -245],
        target: [35, 8.2, -245],
        fov: 50,
      },
      {
        id: 'bridge',
        label: 'Coral Causeway',
        position: [205, 52, -145],
        target: [85, 7.5, -245],
        fov: 46,
      },
      {
        id: 'bowl',
        label: 'Headland Lighthouse',
        position: [452, 46, 138],
        target: [365, 16, 20],
        fov: 48,
      },
      {
        id: 'esses',
        label: 'Marina & Waterfall',
        position: [-265, 76, -32],
        target: [-95, 10, -72],
        fov: 50,
      },
    ],
  },

  frostpeak_pass: {
    id: 'frostpeak_pass',
    name: 'Frostpeak Glacier GT',
    subtitle: 'Alpine Heated Ridge, Glacial Lake Arch Bridge & Ski Village',
    accent: '#38bdf8',
    closedLoop: true,
    targetLengthKm: 2.7,
    elevationDeltaM: 30,
    minSplineY: 14.0,
    roadWidth: 15.0,
    roadHalfWidth: 7.5,
    straightHalfLength: 145,
    lockedControlIndices: [0, 1, 2, 9, 10, 11],
    editableWaypoints: [
      { index: 3, label: 'T1 Glacier Crest' },
      { index: 4, label: 'T2 Avalanche Chute' },
      { index: 5, label: 'T3 Iceberg Corner' },
      { index: 6, label: 'T4 Chalet Curve' },
      { index: 7, label: 'T5 Frozen Lake Approach' },
      { index: 12, label: 'T6 Timberline Sweeper' },
      { index: 13, label: 'T7 Fjord Hairpin' },
      { index: 14, label: 'T9 Alpine Chicane' },
      { index: 15, label: 'T11 Summit Switchback' },
    ],
    layoutPresets: [
      { id: 'original', label: 'Original' },
      { id: 'technical_chicanes', label: 'Technical Chicanes' },
      { id: 'high_speed', label: 'High Speed' },
      { id: 'drift_canyon', label: 'Drift Canyon' },
    ],
    sectors: [
      { id: 'S1', name: 'North Ridge Paddock & West Switchbacks', startT: 0, endT: 0.36 },
      { id: 'S2', name: 'Ski Village & Frozen Lake Arch Bridge', startT: 0.36, endT: 0.71 },
      { id: 'S3', name: 'East Fjord Hairpin & Summit Climb', startT: 0.71, endT: 1.0 },
    ],
    pitFrame: {
      centerX: -15,
      centerZ: -224.5,
      tangentX: -1,
      tangentZ: 0,
      rightX: 0,
      rightZ: -1,
      y: 42.0,
      toleranceY: 5.0,
      halfLength: 120,
      halfWidth: 10.5,
    },
    podiumPosition: [-15, 42.0, -245],
    bridgeHub: { x: 55, z: 185 },
    bridgeHalfSamples: 145,
    waterLevel: 4.0,
    defaultSolarDeg: 16,
    defaultHaze: 0.26,
    vantages: [
      {
        id: 'overview',
        label: 'Full Alpine Circuit',
        position: [0, 345, 440],
        target: [0, 26, 0],
        fov: 48,
      },
      {
        id: 'straight',
        label: 'Ridge Pit Straight',
        position: [155, 64, -238],
        target: [-65, 43, -202],
        fov: 46,
      },
      {
        id: 'roadlevel',
        label: 'Ridge Tarmac Level',
        position: [65, 46.5, -214],
        target: [-95, 43, -202],
        fov: 52,
      },
      {
        id: 'bridgedeck',
        label: 'Frost Bridge Deck',
        position: [-28, 28, 185],
        target: [85, 22, 185],
        fov: 50,
      },
      {
        id: 'bridge',
        label: 'Frozen Lake Span',
        position: [-65, 68, 285],
        target: [55, 22, 185],
        fov: 46,
      },
      {
        id: 'bowl',
        label: 'West Switchbacks',
        position: [-435, 92, -125],
        target: [-310, 36, -15],
        fov: 48,
      },
      {
        id: 'esses',
        label: 'Ski Village & Fjord',
        position: [-145, 78, 310],
        target: [-155, 24, 130],
        fov: 50,
      },
    ],
  },
};

export function getMapDefinition(mapId: MapId): MapDefinition {
  return MAP_REGISTRY[mapId];
}

export function getPresetAtmosphere(
  mapId: MapId,
  solarDeg: number,
  haze: number
): AtmospherePreset {
  const mapDef = MAP_REGISTRY[mapId];
  const dayFactor = clamp((solarDeg + 4) / 48, 0, 1);
  const goldenFactor = clamp(1 - Math.abs(solarDeg - 15) / 16, 0, 1);

  if (mapId === 'coral_bay') {
    const rSky = Math.round(lerp(16, lerp(68, 42, dayFactor), clamp(dayFactor + 0.2, 0, 1)));
    const gSky = Math.round(lerp(24, lerp(112, 152, dayFactor), clamp(dayFactor + 0.2, 0, 1)));
    const bSky = Math.round(lerp(48, lerp(164, 224, dayFactor), clamp(dayFactor + 0.2, 0, 1)));
    const skyTop = `rgb(${rSky}, ${gSky}, ${bSky})`;

    const hR = Math.round(lerp(36, 174 + goldenFactor * 64, clamp(dayFactor + 0.25, 0, 1)));
    const hG = Math.round(lerp(44, 198 - goldenFactor * 12, clamp(dayFactor + 0.25, 0, 1)));
    const hB = Math.round(lerp(66, 224 - goldenFactor * 62, clamp(dayFactor + 0.25, 0, 1)));
    const skyHorizon = `rgb(${hR}, ${hG}, ${hB})`;

    return {
      solarDeg,
      haze,
      waterLevel: mapDef.waterLevel,
      skyTopColor: skyTop,
      skyHorizonColor: skyHorizon,
      fogColor: skyHorizon,
      fogDensity: 0.00055 + haze * 0.00145,
      sunColor: solarDeg < 22 ? '#ffc884' : '#fff4dd',
      hemiSkyColor: solarDeg < 8 ? '#3b5998' : lerpColorHex(goldenFactor),
      hemiGroundColor: '#222b1e',
    };
  }

  // frostpeak_pass
  const fTopR = Math.round(lerp(14, 58, clamp(dayFactor + 0.2, 0, 1)));
  const fTopG = Math.round(lerp(22, 106, clamp(dayFactor + 0.2, 0, 1)));
  const fTopB = Math.round(lerp(44, 174, clamp(dayFactor + 0.2, 0, 1)));
  const fHorR = Math.round(lerp(28, 178 + goldenFactor * 48, clamp(dayFactor + 0.25, 0, 1)));
  const fHorG = Math.round(lerp(38, 196 + goldenFactor * 4, clamp(dayFactor + 0.25, 0, 1)));
  const fHorB = Math.round(lerp(62, 224 - goldenFactor * 36, clamp(dayFactor + 0.25, 0, 1)));
  const fHor = `rgb(${fHorR}, ${fHorG}, ${fHorB})`;

  return {
    solarDeg,
    haze,
    waterLevel: mapDef.waterLevel,
    skyTopColor: `rgb(${fTopR}, ${fTopG}, ${fTopB})`,
    skyHorizonColor: fHor,
    fogColor: fHor,
    fogDensity: 0.0006 + haze * 0.0016,
    sunColor: solarDeg < 22 ? '#ffd29e' : '#f2f7ff',
    hemiSkyColor: solarDeg < 8 ? '#35507d' : goldenFactor > 0.4 ? '#d8c8be' : '#9ed4f5',
    hemiGroundColor: '#3a4654',
  };
}

function lerpColorHex(golden: number): string {
  return golden > 0.45 ? '#d9bfa8' : '#7dd3fc';
}
