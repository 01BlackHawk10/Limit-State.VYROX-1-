export type MapId =
  | 'aurelia_ridge'
  | 'coral_bay'
  | 'frostpeak_pass'
  | 'kestrel_peaks'
  | 'akina_pass'
  | 'akagi_pass'
  | 'myogi_pass';

export type CameraPresetId =
  | 'overview'
  | 'straight'
  | 'roadlevel'
  | 'bridgedeck'
  | 'bridge'
  | 'bowl'
  | 'esses';

export interface MapCameraVantage {
  id: CameraPresetId;
  label: string;
  subtitle: string;
  pos: [number, number, number];
  target: [number, number, number];
}

export interface MapPitFrame {
  centerX: number;
  centerZ: number;
  tanX: number;
  tanZ: number;
  rightX: number;
  rightZ: number;
  halfLength: number;
  halfWidth: number;
}

export interface MapPitBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
  toleranceY: number;
  frame?: MapPitFrame;
}

export function isPointInPitBounds(
  bounds: MapPitBounds,
  x: number,
  y: number,
  z: number,
  marginAlong = 0,
  marginAcross = 0,
): boolean {
  if (Math.abs(y - bounds.y) >= bounds.toleranceY) return false;
  const f = bounds.frame;
  if (f) {
    const dx = x - f.centerX;
    const dz = z - f.centerZ;
    const along = dx * f.tanX + dz * f.tanZ;
    const across = dx * f.rightX + dz * f.rightZ;
    return (
      Math.abs(along) <= f.halfLength + marginAlong &&
      Math.abs(across) <= f.halfWidth + marginAcross
    );
  }
  return (
    x > bounds.minX - marginAlong &&
    x < bounds.maxX + marginAlong &&
    z > bounds.minZ - marginAcross &&
    z < bounds.maxZ + marginAcross
  );
}

export interface MapMetadata {
  id: MapId;
  name: string;
  shortName: string;
  region: string;
  tagline: string;
  lengthLabel: string;
  elevationLabel: string;
  sectorLabels: [string, string, string];
  highlights: string[];
  accentHex: string;
  defaultSolarDeg: number;
  defaultHaze: number;
  defaultWeatherPreset?: 'dry' | 'overcast' | 'rain' | 'sunset_storm' | 'deep_morning_mist';
  waterLevel: number;
  pitLaneBounds: MapPitBounds;
  pitBoxBounds: MapPitBounds;
  podiumCenter: [number, number, number];
  customizerOverviewPos: [number, number, number];
  customizerOverviewTarget: [number, number, number];
  cameraVantages: MapCameraVantage[];
  isTouge?: boolean;
  closedLoop?: boolean;
  defaultTougeDirection?: 'downhill' | 'uphill';
}

export const AURELIA_WEATHER_SOLAR_SYNC: Record<
  'dry' | 'overcast' | 'rain' | 'sunset_storm' | 'deep_morning_mist',
  { solarDeg: number; haze: 'low' | 'golden' | 'heavy'; headlights: boolean }
> = {
  dry: { solarDeg: 30, haze: 'golden', headlights: false },
  overcast: { solarDeg: 58, haze: 'low', headlights: false },
  rain: { solarDeg: 145, haze: 'heavy', headlights: true },
  sunset_storm: { solarDeg: 176, haze: 'golden', headlights: true },
  deep_morning_mist: { solarDeg: 11, haze: 'heavy', headlights: true },
};

export const MAP_REGISTRY: Record<MapId, MapMetadata> = {
  aurelia_ridge: {
    id: 'aurelia_ridge',
    name: 'Aurelia Ridge GT',
    shortName: 'Aurelia Ridge',
    region: 'Dolomite Alpine Circuit',
    tagline: 'High-altitude mountain pass with cable-stayed lake bridge and technical forest hairpins.',
    lengthLabel: '2.9 km',
    elevationLabel: '58 m delta',
    sectorLabels: [
      'S1 · Pit Straight & Gorge Bridge',
      'S2 · Karussell Bowl & Alpine Crest',
      'S3 · Canyon Esses & Final Hairpin',
    ],
    highlights: ['Cable-Stayed Gorge Bridge', 'Alpine Village & Chalets', 'Steep Karussell Banking'],
    accentHex: '#f59e0b',
    defaultSolarDeg: 30,
    defaultHaze: 0.28,
    defaultWeatherPreset: 'dry',
    waterLevel: -4.0,
    pitLaneBounds: {
      minX: -136,
      maxX: 110,
      minZ: 214,
      maxZ: 231.5,
      y: 20.0,
      toleranceY: 4.5,
    },
    pitBoxBounds: {
      minX: -62,
      maxX: 52,
      minZ: 214.5,
      maxZ: 229.5,
      y: 20.0,
      toleranceY: 4.5,
    },
    podiumCenter: [-22, 20, 240],
    customizerOverviewPos: [-240, 225, 340],
    customizerOverviewTarget: [0, 18, -10],
    cameraVantages: [
      {
        id: 'overview',
        label: 'Overview',
        subtitle: 'Elevated circuit + gorge lake vista',
        pos: [-265, 162, 342],
        target: [10, 20, 4],
      },
      {
        id: 'straight',
        label: 'Pit Straight',
        subtitle: 'Start gantry & 6-bay paddock apron',
        pos: [-152, 29, 256],
        target: [38, 22, 232],
      },
      {
        id: 'roadlevel',
        label: 'Road Level',
        subtitle: 'Low tarmac chase vantage',
        pos: [-92, 22.15, 241.5],
        target: [85, 22.8, 234],
      },
      {
        id: 'bridgedeck',
        label: 'Bridge Deck',
        subtitle: 'On-deck gorge crossing perspective',
        pos: [14, 24.8, -6.2],
        target: [128, 27.6, 9.5],
      },
      {
        id: 'bridge',
        label: 'Cable Bridge',
        subtitle: 'Twin-pylon deck over alpine gorge',
        pos: [212, 54, -112],
        target: [75, 28, 2],
      },
      {
        id: 'bowl',
        label: 'Karussell Bowl',
        subtitle: 'Banked alpine bowl',
        pos: [-92, 60, -108],
        target: [98, 35, -155],
      },
      {
        id: 'esses',
        label: 'Canyon Esses',
        subtitle: 'North summit canyon sweepers',
        pos: [-155, 84, -352],
        target: [38, 46, -268],
      },
    ],
  },
  coral_bay: {
    id: 'coral_bay',
    name: 'Coral Bay Coastal GT',
    shortName: 'Coral Bay',
    region: 'Tropical Archipelago & Reef Causeway',
    tagline:
      'Harborfront coastal straight sweeping into the East Headland Lighthouse, NE Turquoise Lagoon Causeway, volcanic bluff overlook, and Yacht Marina chicane.',
    lengthLabel: '2.7 km',
    elevationLabel: '23 m delta',
    sectorLabels: [
      'S1 · Harborfront Straight & East Headland',
      'S2 · Coral Lagoon Causeway & Caldera Cliff',
      'S3 · Cove Waterfall & Marina Chicane',
    ],
    highlights: ['NE Coral Lagoon Causeway', 'East Headland Lighthouse', 'Cove Waterfall & Yacht Marina'],
    accentHex: '#06b6d4',
    defaultSolarDeg: 38,
    defaultHaze: 0.22,
    waterLevel: 0.0,
    pitLaneBounds: {
      minX: -145,
      maxX: 105,
      minZ: 196,
      maxZ: 228,
      y: 6.5,
      toleranceY: 4.5,
      frame: {
        centerX: -20.0,
        centerZ: 214.5,
        tanX: 1,
        tanZ: 0,
        rightX: 0,
        rightZ: 1,
        halfLength: 120,
        halfWidth: 10.5,
      },
    },
    pitBoxBounds: {
      minX: -85,
      maxX: 45,
      minZ: 204,
      maxZ: 224,
      y: 6.5,
      toleranceY: 4.5,
      frame: {
        centerX: -20.0,
        centerZ: 214.5,
        tanX: 1,
        tanZ: 0,
        rightX: 0,
        rightZ: 1,
        halfLength: 60,
        halfWidth: 9.0,
      },
    },
    podiumCenter: [-20, 6.5, 235],
    customizerOverviewPos: [-235, 215, 365],
    customizerOverviewTarget: [15, 10, -25],
    cameraVantages: [
      {
        id: 'overview',
        label: 'Archipelago Overview',
        subtitle: 'Aerial view over Caldera Peak, Yacht Marina & Lagoon Causeway',
        pos: [-240, 175, 360],
        target: [18, 10, -20],
      },
      {
        id: 'straight',
        label: 'Harborfront Straight',
        subtitle: 'Beachfront straight, 6-bay FIA paddock & covered grandstand',
        pos: [-165, 26, 256],
        target: [32, 10, 224],
      },
      {
        id: 'roadlevel',
        label: 'Boardwalk Level',
        subtitle: 'Low-slung coastal asphalt perspective',
        pos: [-95, 8.7, 236],
        target: [75, 8.8, 235],
      },
      {
        id: 'bridgedeck',
        label: 'Causeway Deck',
        subtitle: 'Overwater crossing above turquoise coral reef',
        pos: [175, 14.2, -238],
        target: [-10, 13.4, -254],
      },
      {
        id: 'bridge',
        label: 'Coral Causeway',
        subtitle: 'Multi-span lagoon bridge from north reef overlook',
        pos: [192, 46, -328],
        target: [85, 12, -245],
      },
      {
        id: 'bowl',
        label: 'Headland Lighthouse',
        subtitle: 'East coastal lighthouse cliffs & reef ess bends',
        pos: [418, 48, 92],
        target: [320, 14, -20],
      },
      {
        id: 'esses',
        label: 'Marina & Waterfall',
        subtitle: 'West yacht harbor cove & volcanic waterfall plunge',
        pos: [-135, 36, 48],
        target: [-295, 8, 65],
      },
    ],
  },
  frostpeak_pass: {
    id: 'frostpeak_pass',
    name: 'Frostpeak Glacier GT',
    shortName: 'Frostpeak Glacier',
    region: 'Twin-Fjord Alpine Serpent',
    tagline:
      'High-north heated ridge paddock dropping through glacier switchbacks, a southern frozen lake steel-arch bridge, ski chalet village, and eastern canyon climbs.',
    lengthLabel: '2.7 km',
    elevationLabel: '30 m delta',
    sectorLabels: [
      'S1 · North Ridge Paddock & West Switchbacks',
      'S2 · Ski Village & Frozen Lake Arch Bridge',
      'S3 · East Fjord Hairpin & Summit Climb',
    ],
    highlights: ['North Heated Ridge Paddock', 'Glacier Gondola Switchbacks', 'South Frozen Lake Span'],
    accentHex: '#38bdf8',
    defaultSolarDeg: 34,
    defaultHaze: 0.25,
    waterLevel: 4.0,
    pitLaneBounds: {
      minX: -140,
      maxX: 110,
      minZ: -242,
      maxZ: -206,
      y: 42.0,
      toleranceY: 5.0,
      frame: {
        centerX: -15.0,
        centerZ: -224.5,
        tanX: -1,
        tanZ: 0,
        rightX: 0,
        rightZ: -1,
        halfLength: 120,
        halfWidth: 10.5,
      },
    },
    pitBoxBounds: {
      minX: -80,
      maxX: 50,
      minZ: -236,
      maxZ: -212,
      y: 42.0,
      toleranceY: 5.0,
      frame: {
        centerX: -15.0,
        centerZ: -224.5,
        tanX: -1,
        tanZ: 0,
        rightX: 0,
        rightZ: -1,
        halfLength: 60,
        halfWidth: 9.0,
      },
    },
    podiumCenter: [-15, 42.0, -245],
    customizerOverviewPos: [185, 235, 375],
    customizerOverviewTarget: [-10, 26, -15],
    cameraVantages: [
      {
        id: 'overview',
        label: 'Glacier Overview',
        subtitle: 'Twin-fjord alpine serpent, switchbacks & frozen basin',
        pos: [215, 188, 365],
        target: [-10, 28, -10],
      },
      {
        id: 'straight',
        label: 'Ridge Pit Straight',
        subtitle: 'North alpine straight, 6-bay FIA paddock & covered grandstand',
        pos: [125, 56, -264],
        target: [-60, 44, -238],
      },
      {
        id: 'roadlevel',
        label: 'Ridge Tarmac Level',
        subtitle: 'High-altitude winter tarmac overlooking the valley',
        pos: [75, 44.2, -244],
        target: [-125, 43.2, -245],
      },
      {
        id: 'bridgedeck',
        label: 'Frost Bridge Deck',
        subtitle: 'Twin steel-arch deck across frozen glacial lake',
        pos: [-45, 23.6, 218],
        target: [135, 22.8, 158],
      },
      {
        id: 'bridge',
        label: 'Frozen Lake Span',
        subtitle: 'Southern glacier lake crossing & ice fractures',
        pos: [90, 56, 336],
        target: [55, 21, 185],
      },
      {
        id: 'bowl',
        label: 'West Switchbacks',
        subtitle: 'Triple alpine hairpin descent & gondola cableway',
        pos: [-148, 78, -32],
        target: [-320, 34, -20],
      },
      {
        id: 'esses',
        label: 'Ski Village & Fjord',
        subtitle: 'Timber A-frame chalets & eastern canyon climb',
        pos: [-105, 52, 165],
        target: [-260, 24, 130],
      },
    ],
  },
  kestrel_peaks: {
    id: 'kestrel_peaks',
    name: 'Kestrel Peaks Alpine Circuit',
    shortName: 'Kestrel Peaks',
    region: 'Dolomites Alpine Circuit',
    tagline:
      'Full-lap 8.1 km Dolomite mountain circuit climbing 308 m from Valley Basecamp across the Highland Stone Viaduct, stacked switchbacks, dual Alpine Tunnels & 326m Summit Crest, then diving down the West Alpine Descent back to Basecamp.',
    lengthLabel: '8.1 km',
    elevationLabel: '308 m delta',
    sectorLabels: [
      'S1 · Basecamp & Highland Stone Viaduct',
      'S2 · Dolomite Switchbacks & Twin Tunnels',
      'S3 · 326m Summit Crest & West Descent',
    ],
    highlights: [
      'Closed-Lap 308m Mountain Pass',
      'Highland Stone-Arch Loch Viaduct',
      'Crossover Tunnel & Rock-Cut Gallery',
    ],
    accentHex: '#10b981',
    defaultSolarDeg: 34,
    defaultHaze: 0.24,
    waterLevel: 12.0,
    pitLaneBounds: {
      minX: -185,
      maxX: 65,
      minZ: 572,
      maxZ: 604,
      y: 18.0,
      toleranceY: 5.0,
      frame: {
        centerX: -60,
        centerZ: 589.5,
        tanX: 1,
        tanZ: 0,
        rightX: 0,
        rightZ: 1,
        halfLength: 120,
        halfWidth: 10.5,
      },
    },
    pitBoxBounds: {
      minX: -125,
      maxX: 5,
      minZ: 578,
      maxZ: 600,
      y: 18.0,
      toleranceY: 5.0,
      frame: {
        centerX: -60,
        centerZ: 589.5,
        tanX: 1,
        tanZ: 0,
        rightX: 0,
        rightZ: 1,
        halfLength: 60,
        halfWidth: 9.0,
      },
    },
    podiumCenter: [-60, 18.0, 610],
    customizerOverviewPos: [-480, 680, 880],
    customizerOverviewTarget: [40, 140, -160],
    cameraVantages: [
      {
        id: 'overview',
        label: 'Alpine Circuit Overview',
        subtitle: 'Closed-lap 326m Dolomite circuit from Basecamp around Peak & West Descent',
        pos: [-520, 690, 910],
        target: [40, 145, -165],
      },
      {
        id: 'straight',
        label: 'Basecamp Paddock',
        subtitle: 'South-West start gantry, 6-bay paddock & opposite grandstand',
        pos: [-215, 42, 636],
        target: [35, 22, 600],
      },
      {
        id: 'roadlevel',
        label: 'Start Tarmac Level',
        subtitle: 'Low Valley Basecamp launch vantage',
        pos: [-140, 20.6, 612],
        target: [80, 20.5, 610],
      },
      {
        id: 'bridgedeck',
        label: 'Viaduct Deck',
        subtitle: 'Stone-arch viaduct crossing above turquoise highland loch',
        pos: [588, 86.0, 95],
        target: [548, 88.0, -120],
      },
      {
        id: 'bridge',
        label: 'Stone Viaduct & Waterfall',
        subtitle: 'Multi-arch masonry viaduct & glacial waterfall basin',
        pos: [385, 215, 145],
        target: [570, 82, -10],
      },
      {
        id: 'bowl',
        label: 'Dolomite Switchbacks',
        subtitle: 'Stacked mountain climb overlooking the eastern abyss',
        pos: [240, 480, -260],
        target: [480, 180, -450],
      },
      {
        id: 'esses',
        label: 'Summit Couloir & Peak',
        subtitle: 'High canyon notch ascending to the 326m Alpine Summit Crest',
        pos: [-220, 495, -560],
        target: [35, 315, -195],
      },
    ],
  },
  akina_pass: {
    id: 'akina_pass',
    name: 'Mount Akina Touge',
    shortName: 'Mt. Akina',
    region: 'Gunma Prefecture · Point-to-Point Touge',
    tagline:
      'Iconic 4.8 km point-to-point mountain pass featuring the Five Consecutive Hairpins, concrete inner drainage gutters, and pitch-black cedar forest sections.',
    lengthLabel: '4.8 km (P2P)',
    elevationLabel: '200 m drop',
    sectorLabels: [
      'S1 · Haruna Summit Gate & Ridge Sweepers',
      'S2 · Five Consecutive Gutter Hairpins',
      'S3 · Pine Corridor & Valley Finish',
    ],
    highlights: ['Five Consecutive Hairpins', 'Concrete Inner Gutters', 'Downhill & Uphill Layouts'],
    accentHex: '#f8fafc',
    defaultSolarDeg: 222,
    defaultHaze: 0.24,
    defaultWeatherPreset: 'dry',
    waterLevel: -20.0,
    isTouge: true,
    closedLoop: false,
    defaultTougeDirection: 'downhill',
    pitLaneBounds: { minX: -760, maxX: -680, minZ: -800, maxZ: -720, y: 224.0, toleranceY: 8.0 },
    pitBoxBounds: { minX: -750, maxX: -690, minZ: -790, maxZ: -730, y: 224.0, toleranceY: 8.0 },
    podiumCenter: [460, 24.0, 720],
    customizerOverviewPos: [-480, 560, 780],
    customizerOverviewTarget: [0, 95, -20],
    cameraVantages: [
      {
        id: 'overview',
        label: 'Akina Overview',
        subtitle: 'Full summit-to-valley touge panorama',
        pos: [-520, 520, 760],
        target: [0, 95, -20],
      },
      {
        id: 'straight',
        label: 'Summit Start Gate',
        subtitle: 'Lake Haruna downhill launch gantry',
        pos: [-740, 236, -720],
        target: [-500, 218, -740],
      },
      {
        id: 'roadlevel',
        label: 'Gutter Hairpin #1',
        subtitle: 'Low touge tarmac chase entering hairpin #1',
        pos: [450, 146, -420],
        target: [320, 132, -320],
      },
      {
        id: 'bowl',
        label: 'Five Hairpins Overlook',
        subtitle: 'Stacked switchback descent down the Gunma ridge',
        pos: [-220, 220, 110],
        target: [120, 82, 0],
      },
    ],
  },
  akagi_pass: {
    id: 'akagi_pass',
    name: 'Mount Akagi Touge',
    shortName: 'Mt. Akagi',
    region: 'RedSuns Home Course · Point-to-Point Touge',
    tagline:
      'High-speed twilight mountain pass built around sweeping double-apex bowls, blind canyon crests, and technical late-braking hairpins.',
    lengthLabel: '4.5 km (P2P)',
    elevationLabel: '186 m drop',
    sectorLabels: [
      'S1 · Akagi Observatory & Southern Ridge',
      'S2 · Double-Apex Bowl & White Comet Hairpin',
      'S3 · Canyon Switchbacks & Valley Exit',
    ],
    highlights: ['Double-Apex Bowl', 'High-Speed Blind Crests', 'Twilight Touge Flow'],
    accentHex: '#fbbf24',
    defaultSolarDeg: 174,
    defaultHaze: 0.30,
    defaultWeatherPreset: 'dry',
    waterLevel: -20.0,
    isTouge: true,
    closedLoop: false,
    defaultTougeDirection: 'downhill',
    pitLaneBounds: { minX: -720, maxX: -640, minZ: 620, maxZ: 700, y: 208.0, toleranceY: 8.0 },
    pitBoxBounds: { minX: -710, maxX: -650, minZ: 630, maxZ: 690, y: 208.0, toleranceY: 8.0 },
    podiumCenter: [-700, 22.0, -660],
    customizerOverviewPos: [560, 520, 540],
    customizerOverviewTarget: [-20, 95, -40],
    cameraVantages: [
      {
        id: 'overview',
        label: 'Akagi Overview',
        subtitle: 'Full twilight ridge-to-valley touge overview',
        pos: [560, 520, 540],
        target: [-20, 95, -40],
      },
      {
        id: 'straight',
        label: 'Observatory Gate',
        subtitle: 'Akagi summit start gantry',
        pos: [-700, 220, 690],
        target: [-480, 202, 580],
      },
      {
        id: 'bowl',
        label: 'Double-Apex Bowl',
        subtitle: 'Fast sweeping outer ridge bowl',
        pos: [510, 175, 420],
        target: [280, 145, 290],
      },
    ],
  },
  myogi_pass: {
    id: 'myogi_pass',
    name: 'Mount Myogi Touge',
    shortName: 'Mt. Myogi',
    region: 'Night Kids Gorge · Point-to-Point Touge',
    tagline:
      'Steep, jagged cliffside touge shrouded in dawn mountain mist—demanding crisp trail braking between tight rock-cut chicanes and unforgiving W-beam guardrails.',
    lengthLabel: '4.3 km (P2P)',
    elevationLabel: '196 m drop',
    sectorLabels: [
      'S1 · Crag Summit & Steep Drop',
      'S2 · Cliffside Gorge Hairpins',
      'S3 · Misty Pine Canopy Finish',
    ],
    highlights: ['Jagged Gorge Cliffs', 'Morning Mountain Mist', 'Guardrail Precision Run'],
    accentHex: '#f43f5e',
    defaultSolarDeg: 20,
    defaultHaze: 0.42,
    defaultWeatherPreset: 'deep_morning_mist',
    waterLevel: -20.0,
    isTouge: true,
    closedLoop: false,
    defaultTougeDirection: 'downhill',
    pitLaneBounds: { minX: 640, maxX: 720, minZ: -740, maxZ: -660, y: 214.0, toleranceY: 8.0 },
    pitBoxBounds: { minX: 650, maxX: 710, minZ: -730, maxZ: -670, y: 214.0, toleranceY: 8.0 },
    podiumCenter: [520, 18.0, 620],
    customizerOverviewPos: [-560, 510, -540],
    customizerOverviewTarget: [10, 95, -20],
    cameraVantages: [
      {
        id: 'overview',
        label: 'Myogi Overview',
        subtitle: 'Craggy gorge cliffs & mist-draped valley descent',
        pos: [-560, 510, -540],
        target: [10, 95, -20],
      },
      {
        id: 'straight',
        label: 'Crag Summit Gate',
        subtitle: 'High cliffside start gantry',
        pos: [710, 228, -730],
        target: [480, 206, -640],
      },
      {
        id: 'bowl',
        label: 'Gorge Hairpins',
        subtitle: 'Steep granite canyon switchbacks',
        pos: [240, 130, -180],
        target: [-160, 82, 20],
      },
    ],
  },
};

export type TougeDirection = 'downhill' | 'uphill';

export function isTougeMapId(mapId: MapId | string): boolean {
  return Boolean(MAP_REGISTRY[mapId as MapId]?.isTouge);
}

export const MAP_LIST: MapMetadata[] = [
  MAP_REGISTRY.aurelia_ridge,
  MAP_REGISTRY.coral_bay,
  MAP_REGISTRY.frostpeak_pass,
  MAP_REGISTRY.kestrel_peaks,
  MAP_REGISTRY.akina_pass,
  MAP_REGISTRY.akagi_pass,
  MAP_REGISTRY.myogi_pass,
];

