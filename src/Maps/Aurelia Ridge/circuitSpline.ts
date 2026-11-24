import * as THREE from 'three';
import { clamp } from '../../engine/mathNoise';
import type { CustomMapBlueprint } from '../../shared/socialTypes';
import { MAP_REGISTRY, type MapId, type MapPitBounds } from '../mapRegistry';
import {
  AKINA_CONTROL_POINTS,
  AKAGI_CONTROL_POINTS,
  MYOGI_CONTROL_POINTS,
  AKINA_EDITABLE_WAYPOINTS,
  AKAGI_EDITABLE_WAYPOINTS,
  MYOGI_EDITABLE_WAYPOINTS,
  EMPTY_TOUGE_DELTAS,
  isTougeMapId,
  type TougeDirection,
} from '../Touge/tougePassData';

export type { TougeDirection };

export type CircuitLayoutPreset =
  | 'original'
  | 'technical_chicanes'
  | 'high_speed'
  | 'drift_canyon';

export interface CustomTrackFeatures {
  nightFloodlights: boolean;
  speedTrapGates: boolean;
  chicaneBarriers: boolean;
  driftClippingZones: boolean;
}

export interface MapCustomizationConfig {
  preset: CircuitLayoutPreset;
  roadWidth: number; // 12..20m
  splineTension: number; // 0.15..0.75
  bankingScale: number; // 0.4..1.6
  gripScale: number; // 0.75..1.20
  kerbHeightScale: number; // 0.5..1.8
  asphaltWear?: number; // 0..1 surface aggregate weathering
  waterChop?: number; // 0..1 wave chop / swell amplitude
  waterClarity?: number; // 0..1 optical water clarity
  snowSheen?: number; // 0..1 alpine snow/glacier ice sheen
  snowAccumRate?: number; // 0..2 road snow accumulation speed multiplier on Frostpeak
  foliageDensity?: number; // 0.35..1.25 tree/foliage coverage scale
  waypointOffsets: Record<number, { dx: number; dz: number }>;
  waypointBanking: Record<number, number>; // -12..+18 degrees extra corner banking
  features: CustomTrackFeatures;
}

export interface CircuitSample {
  index: number;
  t: number;
  arcLength: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  bankAngle: number;
  curvature: number;
  isBridge: boolean;
  isTunnel: boolean;
  isStraight: boolean;
  isCatchFenceZone: boolean;
}

export interface CircuitQueryResult {
  sample: CircuitSample;
  nextSample: CircuitSample;
  localAlpha: number;
  centerPos: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  tangent: THREE.Vector3;
  signedLateral: number;
  absDistance: number;
  isBridge: boolean;
  curvature: number;
  t: number;
}

export function createCircuitQueryScratch(seedSample?: CircuitSample): CircuitQueryResult {
  const placeholder =
    seedSample ??
    ({
      index: 0,
      t: 0,
      arcLength: 0,
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
      bankAngle: 0,
      curvature: 0,
      isBridge: false,
      isTunnel: false,
      isStraight: false,
      isCatchFenceZone: false,
    } as CircuitSample);
  return {
    sample: placeholder,
    nextSample: placeholder,
    localAlpha: 0,
    centerPos: new THREE.Vector3(),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    tangent: new THREE.Vector3(0, 0, 1),
    signedLateral: 0,
    absDistance: 0,
    isBridge: false,
    curvature: 0,
    t: 0,
  };
}

export const ROAD_WIDTH = 15.0;
export const ROAD_HALF_WIDTH = ROAD_WIDTH * 0.5;
export const SHOULDER_WIDTH = 2.8;
export const WATER_LEVEL = -4.0;

/**
 * Editable corner control point indices (keeps Pit Straight 0..2 and Suspension Bridge 5..7 anchored).
 */
export const EDITABLE_WAYPOINT_INDICES: ReadonlyArray<{ index: number; label: string }> = [
  { index: 3, label: 'T1 Compression Dip' },
  { index: 4, label: 'T2 Blind Crest' },
  { index: 8, label: 'T4 West Canyon' },
  { index: 10, label: 'T6 Karussell Apex' },
  { index: 12, label: 'T8 North Summit' },
  { index: 13, label: 'T9 Canyon Esses L' },
  { index: 14, label: 'T10 Canyon Esses R' },
  { index: 16, label: 'T12 West Straight' },
  { index: 17, label: 'T13 Final Chicane' },
];

const BASE_CONTROL_POINTS: Array<[number, number, number]> = [
  [-215, 20.0, 240], // 0: Pit Straight West Entry
  [-25, 20.0, 240], // 1: Start / Finish Gantry
  [165, 20.0, 240], // 2: End of Pit Straight
  [275, 12.2, 195], // 3: Downhill Compression Dip
  [305, 24.5, 92], // 4: Blind Uphill Crest Sweeper
  [218, 21.8, 22], // 5: Cable-Stayed Bridge East Abutment
  [75, 22.4, 2], // 6: Cable-Stayed Bridge Center Span
  [-68, 22.8, -18], // 7: Cable-Stayed Bridge West Abutment
  [-138, 26.5, -96], // 8: West Canyon Bend
  [-32, 34.5, -158], // 9: Karussell Banked Bowl Entry
  [135, 37.5, -135], // 10: Karussell 180° Banked Bowl Apex
  [245, 42.5, -212], // 11: Karussell Exit Climb
  [152, 48.0, -295], // 12: North Summit Crest
  [8, 40.0, -248], // 13: Canyon Esses Left
  [-128, 34.5, -294], // 14: Canyon Esses Right
  [-276, 29.0, -224], // 15: North-West Ridge Sweeper
  [-325, 24.5, -52], // 16: Blistering West Backstraight
  [-310, 21.0, 125], // 17: Final Chicane Approach
  [-270, 20.0, 195], // 18: Final Hairpin onto Pit Straight
];

export const CORAL_BAY_CONTROL_POINTS: Array<[number, number, number]> = [
  [-170, 6.5, 235], // 0: Southern Harborfront Pit Straight West Entry (heading +X)
  [-20, 6.5, 235], // 1: Start / Finish Coastal Arch Gantry
  [130, 6.5, 235], // 2: End of Beachfront Pit Straight
  [265, 8.0, 200], // 3: T1 Palm Bay Sweeper
  [350, 12.5, 95], // 4: T2 East Headland Lighthouse Bend
  [330, 16.5, -25], // 5: T3 Reef Point Ess Entry
  [220, 11.5, -65], // 6: T4 Inner Lagoon Chicane Apex
  [295, 13.0, -175], // 7: T5 North-East Spit Hairpin
  [195, 11.2, -235], // 8: Lagoon Causeway East Abutment (Bridge)
  [85, 12.0, -245], // 9: Lagoon Causeway Center Span (NE Coral Lagoon)
  [-25, 11.2, -255], // 10: Lagoon Causeway West Abutment (Bridge)
  [-155, 22.0, -295], // 11: T7 Caldera Cliff Crest Climb
  [-295, 28.0, -235], // 12: T8 Volcanic Bluff Overlook Hairpin
  [-340, 18.0, -105], // 13: T9 West Cliff Fast Sweeper
  [-225, 11.5, -45], // 14: T10 Cove Waterfall Hairpin
  [-335, 7.5, 50], // 15: T11 Palm Sanctuary Esses
  [-330, 5.8, 135], // 16: T12 Yacht Marina Harbor Curve
  [-265, 6.5, 218], // 17: T13 Marina Exit Chicane onto Pit Straight
];

export const FROSTPEAK_CONTROL_POINTS: Array<[number, number, number]> = [
  [125, 42.0, -245], // 0: North Ridge Pit Straight East Entry (heading -X)
  [-15, 42.0, -245], // 1: Start / Finish Alpine Gantry
  [-155, 42.0, -245], // 2: End of Ridge Pit Straight
  [-305, 48.0, -225], // 3: T1 Glacier Crest Fast Left
  [-360, 44.0, -105], // 4: T2 Ice Wall Banked Sweeper
  [-240, 34.0, -45], // 5: T3 Gondola Switchback 1 (Inner Hairpin)
  [-345, 26.0, 55], // 6: T4 Gondola Switchback 2 (West Shelf)
  [-290, 21.0, 175], // 7: T5 Ski Village Downhill Sweeper
  [-185, 19.5, 265], // 8: T6 Powder Bowl Hairpin
  [-65, 20.5, 225], // 9: Frozen Glacial Lake Steel-Arch Bridge West Abutment
  [55, 21.5, 185], // 10: Frozen Glacial Lake Steel-Arch Bridge Center Span
  [175, 20.5, 145], // 11: Frozen Glacial Lake Steel-Arch Bridge East Abutment
  [315, 23.0, 185], // 12: T8 East Fjord Crevasse Hairpin
  [355, 31.0, 45], // 13: T9 Granite Wall Sweeper
  [245, 37.0, -20], // 14: T10 Avalanche Chute Inner Apex
  [340, 44.0, -135], // 15: T11 North-East Summit Switchback
  [245, 45.0, -225], // 16: T12 Lodge Chicane onto Pit Straight
];

const AURELIA_PRESET_DELTAS: Record<
  CircuitLayoutPreset,
  Record<number, [number, number, number]>
> = {
  original: {},
  technical_chicanes: {
    3: [-25, -1.5, -10],
    4: [22, 1.5, 14],
    10: [12, -1.5, 28],
    13: [18, 0, -28],
    14: [-22, 0, 24],
    16: [48, 0, 0],
    17: [-32, 0, -14],
  },
  high_speed: {
    3: [25, 1.0, 8],
    4: [18, -1.0, -12],
    8: [-18, 0, 14],
    10: [-22, 0, -24],
    12: [0, -2.0, -22],
    13: [-14, 0, -26],
    14: [14, 0, 18],
    16: [-20, 0, 0],
    17: [-12, 0, 14],
  },
  drift_canyon: {
    3: [16, 0, 20],
    8: [-28, 0, -12],
    9: [-16, 0, 18],
    10: [24, 1.5, 26],
    11: [20, 0, -18],
    13: [26, 0, -32],
    14: [-24, 0, 30],
    16: [28, 0, -10],
    17: [-28, 0, -20],
  },
};

const CORAL_BAY_PRESET_DELTAS: Record<
  CircuitLayoutPreset,
  Record<number, [number, number, number]>
> = {
  original: {},
  technical_chicanes: {
    3: [-18, 0, -16],
    6: [-24, 0, -14],
    7: [-16, 0, 18],
    12: [22, 0, 20],
    14: [-20, 0, -14],
    16: [24, 0, 12],
  },
  high_speed: {
    3: [22, 0, 14],
    4: [18, 0, -8],
    6: [32, 0, 16],
    12: [-14, -2, -16],
    14: [-30, 0, -16],
    16: [-22, 0, -10],
  },
  drift_canyon: {
    3: [18, 0, 16],
    5: [16, 0, 20],
    6: [-20, 0, 18],
    12: [-22, 0, 18],
    14: [18, 0, -16],
    16: [20, 0, 14],
  },
};

const FROSTPEAK_PRESET_DELTAS: Record<
  CircuitLayoutPreset,
  Record<number, [number, number, number]>
> = {
  original: {},
  technical_chicanes: {
    3: [16, 0, 14],
    5: [22, 0, -14],
    6: [-16, 0, 16],
    8: [-18, 0, -16],
    12: [-22, 0, 14],
    14: [-24, 0, -14],
    15: [-18, 0, 16],
  },
  high_speed: {
    3: [-20, 0, -12],
    5: [-30, 0, 10],
    8: [16, 0, 14],
    12: [18, 0, -12],
    14: [32, 0, 12],
    15: [18, 0, -14],
  },
  drift_canyon: {
    4: [-16, 0, 16],
    5: [18, 0, 18],
    7: [16, 0, -14],
    12: [20, 0, 20],
    14: [-20, 0, 18],
    15: [18, 0, -16],
  },
};

export const CORAL_BAY_EDITABLE_WAYPOINT_INDICES: ReadonlyArray<{ index: number; label: string }> = [
  { index: 3, label: 'T1 Palm Sweeper' },
  { index: 4, label: 'T2 Headland Lighthouse' },
  { index: 5, label: 'T3 Reef Point' },
  { index: 6, label: 'T4 Inner Lagoon Apex' },
  { index: 7, label: 'T5 NE Spit Hairpin' },
  { index: 11, label: 'T7 Caldera Cliff' },
  { index: 12, label: 'T8 Volcanic Overlook' },
  { index: 14, label: 'T10 Cove Waterfall' },
  { index: 16, label: 'T12 Marina Curve' },
];

export const FROSTPEAK_EDITABLE_WAYPOINT_INDICES: ReadonlyArray<{ index: number; label: string }> = [
  { index: 3, label: 'T1 Glacier Crest' },
  { index: 4, label: 'T2 Ice Wall' },
  { index: 5, label: 'T3 Switchback Inner' },
  { index: 6, label: 'T4 Switchback West' },
  { index: 7, label: 'T5 Ski Village' },
  { index: 8, label: 'T6 Powder Bowl' },
  { index: 12, label: 'T8 East Fjord' },
  { index: 14, label: 'T10 Avalanche Chute' },
  { index: 15, label: 'T11 Summit Switchback' },
];

export const KESTREL_PEAKS_CONTROL_POINTS: Array<[number, number, number]> = [
  [-220, 18.0, 610], // 0: South Valley Basecamp Paddock Entry (heading +X)
  [-60, 18.0, 610], // 1: Start / Basecamp Summit Climb Gantry
  [100, 18.0, 610], // 2: End of Valley Basecamp Straight
  [290, 22.0, 565], // 3: T1 Meadow Fast Sweeper
  [480, 38.0, 445], // 4: T2 East Foothill Ascent
  [600, 60.0, 275], // 5: T3 Loch Approach Hairpin
  [590, 76.0, 120], // 6: Highland Stone-Arch Viaduct South Abutment
  [570, 82.0, -10], // 7: Highland Stone-Arch Viaduct Center Span
  [545, 88.0, -140], // 8: Highland Stone-Arch Viaduct North Abutment
  [645, 114.0, -310], // 9: T4 Switchback 1 Right — East Granite Shelf
  [285, 144.0, -345], // 10: T5 Switchback 2 Left — Waterfall Overlook Bench
  [585, 174.0, -545], // 11: T6 Switchback 3 Right — Upper Dolomite Hairpin
  [195, 202.0, -645], // 12: T7 North Saddle Timberline Hairpin
  [-190, 220.0, -525], // 13: T8 Mid-Mountain Traverse Ridge
  [-545, 236.0, -645], // 14: T9 West Spur Alpine Hairpin
  [-260, 254.0, -785], // 15: T10 Rock-Cut Avalanche Gallery Entry
  [175, 268.0, -785], // 16: T11 Rock-Cut Avalanche Gallery Exit
  [430, 278.0, -685], // 17: T12 Upper East Ridge Hairpin
  [165, 286.0, -490], // 18: T13 High Summit Couloir Gorge (Overpass Bridge Span)
  [-135, 298.0, -345], // 19: T14 South Summit Shoulder
  [-295, 310.0, -155], // 20: T15 Crown Approach Hairpin
  [-90, 320.0, -65], // 21: T16 Final Summit Ridge Climb
  [35, 326.0, -175], // 22: T17 Summit Peak Observatory Crest (326 m)
  [165, 286.0, -115], // 23: T18 East Summit Crest Descent
  [115, 230.0, 65], // 24: T19 Central Valley Balcony
  [-165, 175.0, 125], // 25: T20 West Alpine Balcony
  [-510, 124.0, 25], // 26: T21 Western Dolomite Ridge Sweeper
  [-675, 82.0, 225], // 27: T22 West Alpine Hairpin
  [-445, 50.0, 390], // 28: T23 West Meadow Fast Bend
  [-615, 28.0, 540], // 29: T24 Lower Valley Hairpin
  [-425, 18.0, 610], // 30: T25 Basecamp Straight West Approach
];

const KESTREL_PEAKS_PRESET_DELTAS: Record<
  CircuitLayoutPreset,
  Record<number, [number, number, number]>
> = {
  original: {},
  technical_chicanes: {
    3: [-24, 0, -18],
    9: [-22, 0, 16],
    11: [-24, 0, 18],
    14: [24, 0, 20],
    17: [-24, 0, 14],
    20: [24, 0, -18],
  },
  high_speed: {
    3: [22, 0, 14],
    9: [26, 0, -14],
    11: [24, 0, -16],
    14: [-20, 0, -18],
    17: [20, 0, -14],
    20: [-20, 0, 14],
  },
  drift_canyon: {
    4: [22, 0, 18],
    10: [22, 0, 20],
    12: [20, 0, 22],
    14: [-18, 0, 20],
    19: [-20, 0, -18],
    20: [22, 0, -16],
  },
};

export const KESTREL_PEAKS_EDITABLE_WAYPOINT_INDICES: ReadonlyArray<{ index: number; label: string }> = [
  { index: 3, label: 'T1 Valley Sweeper' },
  { index: 4, label: 'T2 Foothill Ascent' },
  { index: 9, label: 'T4 East Switchback 1' },
  { index: 10, label: 'T5 Waterfall Bench' },
  { index: 11, label: 'T6 Dolomite Hairpin' },
  { index: 12, label: 'T7 Timberline Saddle' },
  { index: 14, label: 'T9 West Spur Hairpin' },
  { index: 17, label: 'T12 Upper Ridge' },
  { index: 20, label: 'T15 Summit Crown' },
];

interface MapSplineDescriptor {
  controlPoints: Array<[number, number, number]>;
  lockedIndices: ReadonlySet<number>;
  closedLoop?: boolean;
  sfHub: { x: number; z: number };
  bridgeHub: { x: number; z: number; minY?: number };
  bridgeHalfSamples: number;
  straightHalfMeters: number;
  editableWaypoints: ReadonlyArray<{ index: number; label: string }>;
  presetDeltas: Record<CircuitLayoutPreset, Record<number, [number, number, number]>>;
  minYClamp: number;
  maxCoordExtent?: number;
}

const MAP_SPLINE_DESCRIPTORS: Record<MapId, MapSplineDescriptor> = {
  aurelia_ridge: {
    controlPoints: BASE_CONTROL_POINTS,
    lockedIndices: new Set([0, 1, 2, 5, 6, 7]),
    closedLoop: true,
    sfHub: { x: -25, z: 240 },
    bridgeHub: { x: 75, z: 2 },
    bridgeHalfSamples: 138,
    straightHalfMeters: 175,
    editableWaypoints: EDITABLE_WAYPOINT_INDICES,
    presetDeltas: AURELIA_PRESET_DELTAS,
    minYClamp: -2.0,
  },
  coral_bay: {
    controlPoints: CORAL_BAY_CONTROL_POINTS,
    lockedIndices: new Set([0, 1, 2, 8, 9, 10]),
    closedLoop: true,
    sfHub: { x: -20, z: 235 },
    bridgeHub: { x: 85, z: -245 },
    bridgeHalfSamples: 135,
    straightHalfMeters: 145,
    editableWaypoints: CORAL_BAY_EDITABLE_WAYPOINT_INDICES,
    presetDeltas: CORAL_BAY_PRESET_DELTAS,
    minYClamp: 3.5,
  },
  frostpeak_pass: {
    controlPoints: FROSTPEAK_CONTROL_POINTS,
    lockedIndices: new Set([0, 1, 2, 9, 10, 11]),
    closedLoop: true,
    sfHub: { x: -15, z: -245 },
    bridgeHub: { x: 55, z: 185 },
    bridgeHalfSamples: 145,
    straightHalfMeters: 145,
    editableWaypoints: FROSTPEAK_EDITABLE_WAYPOINT_INDICES,
    presetDeltas: FROSTPEAK_PRESET_DELTAS,
    minYClamp: 14.0,
  },
  kestrel_peaks: {
    controlPoints: KESTREL_PEAKS_CONTROL_POINTS,
    lockedIndices: new Set([0, 1, 2, 6, 7, 8, 15, 16, 17, 18, 21, 22, 30]),
    closedLoop: true,
    sfHub: { x: -60, z: 610 },
    bridgeHub: { x: 570, z: -10 },
    bridgeHalfSamples: 128,
    straightHalfMeters: 165,
    editableWaypoints: KESTREL_PEAKS_EDITABLE_WAYPOINT_INDICES,
    presetDeltas: KESTREL_PEAKS_PRESET_DELTAS,
    minYClamp: 14.5,
    maxCoordExtent: 1020,
  },
  akina_pass: {
    controlPoints: AKINA_CONTROL_POINTS,
    lockedIndices: new Set([0, 1, 17, 18]),
    closedLoop: false,
    sfHub: { x: -720, z: -760 },
    bridgeHub: { x: 0, z: 0 },
    bridgeHalfSamples: 0,
    straightHalfMeters: 120,
    editableWaypoints: AKINA_EDITABLE_WAYPOINTS,
    presetDeltas: EMPTY_TOUGE_DELTAS,
    minYClamp: 10.0,
    maxCoordExtent: 1020,
  },
  akagi_pass: {
    controlPoints: AKAGI_CONTROL_POINTS,
    lockedIndices: new Set([0, 1, 14, 15]),
    closedLoop: false,
    sfHub: { x: -680, z: 660 },
    bridgeHub: { x: 0, z: 0 },
    bridgeHalfSamples: 0,
    straightHalfMeters: 120,
    editableWaypoints: AKAGI_EDITABLE_WAYPOINTS,
    presetDeltas: EMPTY_TOUGE_DELTAS,
    minYClamp: 10.0,
    maxCoordExtent: 1020,
  },
  myogi_pass: {
    controlPoints: MYOGI_CONTROL_POINTS,
    lockedIndices: new Set([0, 1, 13, 14]),
    closedLoop: false,
    sfHub: { x: 680, z: -700 },
    bridgeHub: { x: 0, z: 0 },
    bridgeHalfSamples: 0,
    straightHalfMeters: 120,
    editableWaypoints: MYOGI_EDITABLE_WAYPOINTS,
    presetDeltas: EMPTY_TOUGE_DELTAS,
    minYClamp: 10.0,
    maxCoordExtent: 1020,
  },
};

export function getDefaultMapCustomization(roadWidth = 15.0): MapCustomizationConfig {
  return {
    preset: 'original',
    roadWidth,
    splineTension: 0.45,
    bankingScale: 1.0,
    gripScale: 1.0,
    kerbHeightScale: 1.0,
    asphaltWear: 0.35,
    waterChop: 0.45,
    waterClarity: 0.65,
    snowSheen: 0.65,
    snowAccumRate: 1.0,
    foliageDensity: 1.0,
    waypointOffsets: {},
    waypointBanking: {},
    features: {
      nightFloodlights: true,
      speedTrapGates: true,
      chicaneBarriers: false,
      driftClippingZones: true,
    },
  };
}

const SAMPLE_COUNT = 1400;
const GRID_MIN = -1150;
const GRID_MAX = 1150;
const GRID_CELL = 16;
const GRID_DIM = Math.ceil((GRID_MAX - GRID_MIN) / GRID_CELL);

export interface CircuitData {
  mapId: MapId;
  closedLoop: boolean;
  curve: THREE.CatmullRomCurve3;
  samples: CircuitSample[];
  controlPoints: THREE.Vector3[];
  totalLength: number;
  roadWidth: number;
  roadHalfWidth: number;
  gripScale: number;
  kerbHeightScale: number;
  features: CustomTrackFeatures;
  minElevation: number;
  maxElevation: number;
  waterLevel: number;
  pitLaneBounds: MapPitBounds;
  pitBoxBounds: MapPitBounds;
  bridgeRange: [number, number];
  tunnelRanges: Array<[number, number]>;
  straightRange: [number, number];
  startFinishIndex: number;
  speedTrapTs: number[];
  driftZoneTs: number[];
  chicaneTs: number[];
  queryNearest: (x: number, z: number, referenceY?: number) => CircuitQueryResult;
  queryNearestGroundTrack: (x: number, z: number) => CircuitQueryResult;
  queryNearestInto: (
    x: number,
    z: number,
    out: CircuitQueryResult,
    referenceY?: number,
  ) => CircuitQueryResult;
  queryNearestGroundTrackInto: (
    x: number,
    z: number,
    out: CircuitQueryResult,
  ) => CircuitQueryResult;
  sampleAtT: (t: number) => CircuitSample;
}

let activeMapId: MapId = 'aurelia_ridge';
let activeCustomBlueprint: CustomMapBlueprint | null = null;
let tougeDirection: TougeDirection = 'downhill';
const perMapConfigs: Record<MapId, MapCustomizationConfig> = {
  aurelia_ridge: getDefaultMapCustomization(15.0),
  coral_bay: getDefaultMapCustomization(15.0),
  frostpeak_pass: getDefaultMapCustomization(15.0),
  kestrel_peaks: getDefaultMapCustomization(15.0),
  akina_pass: getDefaultMapCustomization(12.2),
  akagi_pass: getDefaultMapCustomization(12.2),
  myogi_pass: getDefaultMapCustomization(12.2),
};
let currentConfig: MapCustomizationConfig = perMapConfigs.aurelia_ridge;
let cachedCircuit: CircuitData | null = null;
const cachedCircuitsByMap = new Map<MapId, CircuitData>();

export function getTougeDirection(): TougeDirection {
  return tougeDirection;
}

export function setTougeDirection(dir: TougeDirection): CircuitData {
  if (tougeDirection !== dir) {
    tougeDirection = dir;
    cachedCircuitsByMap.delete('akina_pass');
    cachedCircuitsByMap.delete('akagi_pass');
    cachedCircuitsByMap.delete('myogi_pass');
    if (isTougeMapId(activeMapId)) {
      cachedCircuit = null;
    }
  }
  return getCircuitData();
}

export function setCustomBlueprint(bp: CustomMapBlueprint | null): CircuitData {
  activeCustomBlueprint = bp;
  cachedCircuitsByMap.delete('aurelia_ridge');
  if (activeMapId === 'aurelia_ridge') {
    cachedCircuit = null;
  }
  return getCircuitData();
}

export function getCustomBlueprint(): CustomMapBlueprint | null {
  return activeCustomBlueprint;
}

function cloneConfig(cfg: MapCustomizationConfig): MapCustomizationConfig {
  return {
    ...cfg,
    waypointOffsets: { ...cfg.waypointOffsets },
    waypointBanking: { ...(cfg.waypointBanking ?? {}) },
    features: { ...cfg.features },
  };
}

export function getActiveMapId(): MapId {
  return activeMapId;
}

export function getWaterLevel(): number {
  return MAP_REGISTRY[activeMapId].waterLevel;
}

export function setActiveMapId(mapId: MapId): CircuitData {
  if (activeMapId !== mapId) {
    activeMapId = mapId;
    currentConfig =
      perMapConfigs[mapId] ?? getDefaultMapCustomization(isTougeMapId(mapId) ? 12.2 : 15.0);
    perMapConfigs[mapId] = currentConfig;
    cachedCircuit = cachedCircuitsByMap.get(mapId) ?? null;
  }
  return getCircuitData();
}

export function getEditableWaypointsForActiveMap(): ReadonlyArray<{ index: number; label: string }> {
  return MAP_SPLINE_DESCRIPTORS[activeMapId].editableWaypoints;
}

export function getCircuitPreviewData(mapId: MapId): {
  points: Array<{ x: number; z: number }>;
  bridgeSegment: Array<{ x: number; z: number }>;
  startPoint: { x: number; z: number };
  closedLoop: boolean;
} {
  const desc = MAP_SPLINE_DESCRIPTORS[mapId];
  const rawPts =
    isTougeMapId(mapId) && tougeDirection === 'uphill'
      ? [...desc.controlPoints].reverse()
      : desc.controlPoints;
  const vecs = rawPts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const isClosed = desc.closedLoop ?? true;
  const c = new THREE.CatmullRomCurve3(vecs, isClosed, 'catmullrom', 0.45);
  const points: Array<{ x: number; z: number }> = [];
  const bridgeSegment: Array<{ x: number; z: number }> = [];
  const N = 140;
  for (let i = 0; i < N; i++) {
    const t = isClosed ? i / N : i / (N - 1);
    const p = c.getPointAt(t);
    points.push({ x: p.x, z: p.z });
    if (
      desc.bridgeHalfSamples > 0 &&
      Math.hypot(p.x - desc.bridgeHub.x, p.z - desc.bridgeHub.z) < 145 &&
      (desc.bridgeHub.minY === undefined || p.y >= desc.bridgeHub.minY)
    ) {
      bridgeSegment.push({ x: p.x, z: p.z });
    }
  }
  const startCoord = isTougeMapId(mapId)
    ? { x: rawPts[0][0], z: rawPts[0][2] }
    : { x: desc.sfHub.x, z: desc.sfHub.z };
  return {
    points,
    bridgeSegment,
    startPoint: startCoord,
    closedLoop: isClosed,
  };
}

export function getCircuitCustomization(mapId: MapId = activeMapId): MapCustomizationConfig {
  const src = perMapConfigs[mapId] ?? currentConfig;
  return cloneConfig(src);
}

export function rebuildCircuitData(
  config?: MapCustomizationConfig,
  targetMapId: MapId = activeMapId,
): CircuitData {
  if (config) {
    const normalized: MapCustomizationConfig = {
      preset: config.preset,
      roadWidth: clamp(config.roadWidth, 12.0, 20.0),
      splineTension: clamp(config.splineTension ?? 0.45, 0.15, 0.75),
      bankingScale: clamp(config.bankingScale, 0.4, 1.6),
      gripScale: clamp(config.gripScale, 0.75, 1.2),
      kerbHeightScale: clamp(config.kerbHeightScale, 0.5, 1.8),
      asphaltWear: clamp(config.asphaltWear ?? 0.35, 0, 1),
      waterChop: clamp(config.waterChop ?? 0.45, 0, 1),
      waterClarity: clamp(config.waterClarity ?? 0.65, 0, 1),
      snowSheen: clamp(config.snowSheen ?? 0.65, 0, 1),
      snowAccumRate: clamp(config.snowAccumRate ?? 1.0, 0, 2),
      foliageDensity: clamp(config.foliageDensity ?? 1.0, 0.35, 1.25),
      waypointOffsets: { ...config.waypointOffsets },
      waypointBanking: { ...(config.waypointBanking ?? {}) },
      features: { ...config.features },
    };
    perMapConfigs[targetMapId] = normalized;
    if (targetMapId === activeMapId) {
      currentConfig = normalized;
    }
  }
    cachedCircuitsByMap.delete(targetMapId);
    if (targetMapId === activeMapId) {
      cachedCircuit = null;
    }
    return getCircuitData();
  }

  export function getCircuitData(): CircuitData {
    if (cachedCircuit) return cachedCircuit;
    const fromMap = cachedCircuitsByMap.get(activeMapId);
    if (fromMap) {
      cachedCircuit = fromMap;
      return fromMap;
    }

  const customBp = activeMapId === 'aurelia_ridge' ? activeCustomBlueprint : null;
  const desc = MAP_SPLINE_DESCRIPTORS[activeMapId];
  const isClosed = customBp ? customBp.closedLoop : (desc.closedLoop ?? true);

  const isUphillTouge = !customBp && isTougeMapId(activeMapId) && tougeDirection === 'uphill';
  const rawControlPoints = isUphillTouge ? [...desc.controlPoints].reverse() : desc.controlPoints;
  const effectiveLocked = isUphillTouge
    ? new Set([0, 1, rawControlPoints.length - 2, rawControlPoints.length - 1])
    : desc.lockedIndices;
  const effectiveSfHub = !customBp && isTougeMapId(activeMapId)
    ? { x: rawControlPoints[0][0], z: rawControlPoints[0][2] }
    : desc.sfHub;

  const presetDeltas = desc.presetDeltas[currentConfig.preset] ?? {};
  const maxExt = desc.maxCoordExtent ?? 380;
  const maxZMin = desc.maxCoordExtent ? -desc.maxCoordExtent : -350;
  const maxZMax = desc.maxCoordExtent ? desc.maxCoordExtent : 330;
  const points = customBp
    ? (customBp.controlPoints.length >= 4 ? customBp.controlPoints : desc.controlPoints.slice(0, 6).map(([x, y, z]) => ({ x, y, z, bankDeg: 0 }))).map(
        (cp) =>
          new THREE.Vector3(
            clamp(cp.x, -680, 680),
            clamp(cp.y, 2.0, 220),
            clamp(cp.z, -680, 680),
          ),
      )
    : rawControlPoints.map(([bx, by, bz], idx) => {
        const pd = presetDeltas[idx];
        const uo = currentConfig.waypointOffsets[idx];
        const locked = effectiveLocked.has(idx);
        const x = locked
          ? bx
          : clamp(bx + (pd ? pd[0] : 0) + (uo ? uo.dx : 0), -maxExt, maxExt);
        const y = locked
          ? by
          : Math.max(desc.minYClamp, by + (pd ? pd[1] : 0));
        const z = locked
          ? bz
          : clamp(bz + (pd ? pd[2] : 0) + (uo ? uo.dz : 0), maxZMin, maxZMax);
        return new THREE.Vector3(x, y, z);
      });

  const effTension = customBp
    ? clamp(customBp.splineTension ?? 0.45, 0.15, 0.75)
    : clamp(currentConfig.splineTension ?? 0.45, 0.15, 0.75);
  const curve = new THREE.CatmullRomCurve3(points, isClosed, 'catmullrom', effTension);
  const totalLength = Math.max(120, curve.getLength());
  const roadWidth = customBp ? clamp(customBp.roadWidth ?? 15, 12, 24) : currentConfig.roadWidth;
  const roadHalfWidth = roadWidth * 0.5;
  const effBankingScale = customBp ? clamp(customBp.bankingScale ?? 1, 0.4, 1.8) : currentConfig.bankingScale;
  const effGripScale = customBp ? clamp(customBp.gripScale ?? 1, 0.7, 1.3) : currentConfig.gripScale;
  const effKerbScale = customBp ? clamp(customBp.kerbHeightScale ?? 1, 0.4, 2.0) : currentConfig.kerbHeightScale;

  const rawPositions: THREE.Vector3[] = [];
  const rawTangents: THREE.Vector3[] = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = isClosed ? i / SAMPLE_COUNT : i / (SAMPLE_COUNT - 1);
    rawPositions.push(curve.getPointAt(t));
    rawTangents.push(curve.getTangentAt(t).normalize());
  }

  // Locate Bridge/Causeway interval centered around map bridge hub (skip for custom blueprints or when bridgeHalfSamples <= 0)
  let bridgeStartT = -1;
  let bridgeEndT = -1;
  if (!customBp && desc.bridgeHalfSamples > 0) {
    let bridgeCenterIdx = 0;
    let bestBridgeDist = Infinity;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const p = rawPositions[i];
      if (desc.bridgeHub.minY !== undefined && p.y < desc.bridgeHub.minY) continue;
      const d = Math.hypot(p.x - desc.bridgeHub.x, p.z - desc.bridgeHub.z);
      if (d < bestBridgeDist) {
        bestBridgeDist = d;
        bridgeCenterIdx = i;
      }
    }
    const bridgeHalfSamples = Math.round((desc.bridgeHalfSamples / totalLength) * SAMPLE_COUNT);
    bridgeStartT =
      ((bridgeCenterIdx - bridgeHalfSamples + SAMPLE_COUNT) % SAMPLE_COUNT) / SAMPLE_COUNT;
    bridgeEndT = ((bridgeCenterIdx + bridgeHalfSamples) % SAMPLE_COUNT) / SAMPLE_COUNT;
  }

  // Locate Start / Finish straight centered near map S/F gantry
  let sfIdx = 0;
  if (customBp) {
    sfIdx = isClosed ? Math.round(SAMPLE_COUNT * 0.04) : Math.round(SAMPLE_COUNT * 0.03);
  } else if (isTougeMapId(activeMapId)) {
    sfIdx = Math.round(SAMPLE_COUNT * 0.015);
  } else {
    let bestSfDist = Infinity;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const p = rawPositions[i];
      const d = Math.hypot(p.x - effectiveSfHub.x, p.z - effectiveSfHub.z);
      if (d < bestSfDist) {
        bestSfDist = d;
        sfIdx = i;
      }
    }
  }
  const straightHalfSamples = Math.round(((customBp ? 85 : desc.straightHalfMeters) / totalLength) * SAMPLE_COUNT);
  const straightStartT = isClosed
    ? ((sfIdx - straightHalfSamples + SAMPLE_COUNT) % SAMPLE_COUNT) / SAMPLE_COUNT
    : Math.max(0, sfIdx - straightHalfSamples) / SAMPLE_COUNT;
  const straightEndT = isClosed
    ? ((sfIdx + straightHalfSamples) % SAMPLE_COUNT) / SAMPLE_COUNT
    : Math.min(SAMPLE_COUNT - 1, sfIdx + straightHalfSamples) / SAMPLE_COUNT;

  const isTinRange = (t: number, start: number, end: number) =>
    start >= 0 && end >= 0 && (start <= end ? t >= start && t <= end : t >= start || t <= end);

  // Signed curvature in XZ plane
  const rawCurvature = new Float32Array(SAMPLE_COUNT);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const pIdx = isClosed ? (i - 2 + SAMPLE_COUNT) % SAMPLE_COUNT : Math.max(0, i - 2);
    const nIdx = isClosed ? (i + 2) % SAMPLE_COUNT : Math.min(SAMPLE_COUNT - 1, i + 2);
    const prev = rawTangents[pIdx];
    const next = rawTangents[nIdx];
    const crossY = prev.z * next.x - prev.x * next.z;
    const ds = (4 / SAMPLE_COUNT) * totalLength;
    rawCurvature[i] = crossY / ds;
  }

  const smoothCurvature = new Float32Array(SAMPLE_COUNT);
  const smoothRad = 16;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    let acc = 0;
    for (let k = -smoothRad; k <= smoothRad; k++) {
      const idx = isClosed
        ? (i + k + SAMPLE_COUNT) % SAMPLE_COUNT
        : clamp(i + k, 0, SAMPLE_COUNT - 1);
      acc += rawCurvature[idx];
    }
    smoothCurvature[i] = acc / (smoothRad * 2 + 1);
  }

  // Map each editable waypoint to its nearest spline t so per-corner banking blends smoothly
  const waypointBankTargets: Array<{ t: number; rad: number }> = [];
  if (customBp) {
    for (let pIdx = 0; pIdx < customBp.controlPoints.length; pIdx++) {
      const deg = customBp.controlPoints[pIdx]?.bankDeg ?? 0;
      if (Math.abs(deg) > 0.05 && points[pIdx]) {
        const wpPos = points[pIdx];
        let bestI = 0;
        let bestD = Infinity;
        for (let i = 0; i < SAMPLE_COUNT; i += 2) {
          const d = wpPos.distanceToSquared(rawPositions[i]);
          if (d < bestD) {
            bestD = d;
            bestI = i;
          }
        }
        waypointBankTargets.push({
          t: bestI / SAMPLE_COUNT,
          rad: THREE.MathUtils.degToRad(clamp(deg, -16, 20)),
        });
      }
    }
  } else {
    for (const wp of desc.editableWaypoints) {
      const deg = currentConfig.waypointBanking?.[wp.index] ?? 0;
      if (Math.abs(deg) > 0.05) {
        const wpPos = points[wp.index];
        let bestI = 0;
        let bestD = Infinity;
        for (let i = 0; i < SAMPLE_COUNT; i += 2) {
          const d = wpPos.distanceToSquared(rawPositions[i]);
          if (d < bestD) {
            bestD = d;
            bestI = i;
          }
        }
        waypointBankTargets.push({
          t: bestI / SAMPLE_COUNT,
          rad: THREE.MathUtils.degToRad(clamp(deg, -12, 18)),
        });
      }
    }
  }

  const autoTunnelFlags = new Uint8Array(SAMPLE_COUNT);
  const autoBridgeFlags = new Uint8Array(SAMPLE_COUNT);

  // Automatic 3D Tunnel & Overpass Detection:
  // Whenever any road segment passes underneath an elevated road (>= 4.2m clearance above it)
  // or under tall sculpted terrain stamps, auto-convert the lower pass into an enclosed Tunnel
  // and the upper pass into an Overpass Bridge Deck so terrain never blocks the underpass.
  const enableAutoTunnels = customBp ? customBp.autoTunnels !== false : true;
  if (enableAutoTunnels) {
    const minIndexGap = Math.round(SAMPLE_COUNT * 0.045);
    const horzThresh = roadWidth + 16.0;
    const horzThreshSq = horzThresh * horzThresh;
    const padHalf = 18;

    for (let i = 0; i < SAMPLE_COUNT; i += 2) {
      const pi = rawPositions[i];
      for (let j = i + minIndexGap; j < SAMPLE_COUNT; j += 2) {
        if (isClosed && SAMPLE_COUNT - (j - i) < minIndexGap) continue;
        const pj = rawPositions[j];
        const dx = pi.x - pj.x;
        const dz = pi.z - pj.z;
        if (dx * dx + dz * dz > horzThreshSq) continue;
        const dy = pj.y - pi.y;
        if (Math.abs(dy) >= 4.2 && Math.abs(dy) <= 130.0) {
          const lowerIdx = dy > 0 ? i : j;
          const upperIdx = dy > 0 ? j : i;
          for (let k = -padHalf; k <= padHalf; k++) {
            const li = isClosed
              ? (lowerIdx + k + SAMPLE_COUNT) % SAMPLE_COUNT
              : clamp(lowerIdx + k, 0, SAMPLE_COUNT - 1);
            const ui = isClosed
              ? (upperIdx + k + SAMPLE_COUNT) % SAMPLE_COUNT
              : clamp(upperIdx + k, 0, SAMPLE_COUNT - 1);
            autoTunnelFlags[li] = 1;
            autoBridgeFlags[ui] = 1;
          }
        }
      }
    }

    if (customBp && customBp.terrainStamps.length > 0) {
      for (let i = 0; i < SAMPLE_COUNT; i += 2) {
        const pi = rawPositions[i];
        let stampH = 20.0;
        // Estimate sculpted hill height over the road center
        for (let sIdx = 0; sIdx < customBp.terrainStamps.length; sIdx++) {
          const st = customBp.terrainStamps[sIdx];
          const d = Math.hypot(pi.x - st.x, pi.z - st.z);
          if (d < st.radius && st.mode === 'raise') {
            const w = 1 - Math.min(1, d / Math.max(1, st.radius));
            stampH += Math.abs(st.deltaY) * w * w;
          }
        }
        if (stampH - pi.y >= 8.5) {
          for (let k = -8; k <= 8; k++) {
            const li = isClosed
              ? (i + k + SAMPLE_COUNT) % SAMPLE_COUNT
              : clamp(i + k, 0, SAMPLE_COUNT - 1);
            autoTunnelFlags[li] = 1;
          }
        }
      }
    }
  }

  // Kestrel Peaks dedicated Rock-Cut Alpine Tunnel (CP15 [-260, 254, -785] -> CP16 [175, 268, -785])
  if (!customBp && activeMapId === 'kestrel_peaks') {
    let bestA = 0;
    let bestAD = Infinity;
    let bestB = 0;
    let bestBD = Infinity;
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const p = rawPositions[i];
      const dA = Math.hypot(p.x + 260, p.z + 785);
      if (dA < bestAD) {
        bestAD = dA;
        bestA = i;
      }
      const dB = Math.hypot(p.x - 175, p.z + 785);
      if (dB < bestBD) {
        bestBD = dB;
        bestB = i;
      }
    }
    const tStart = Math.min(bestA, bestB);
    const tEnd = Math.max(bestA, bestB);
    for (let i = tStart; i <= tEnd; i++) {
      autoTunnelFlags[i] = 1;
    }
  }

  const worldUp = new THREE.Vector3(0, 1, 0);
  const samples: CircuitSample[] = [];
  let minElevation = Infinity;
  let maxElevation = -Infinity;

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = isClosed ? i / SAMPLE_COUNT : i / (SAMPLE_COUNT - 1);
    const pos = rawPositions[i];
    const tangent = rawTangents[i];
    const flatRight = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
    const isBridge = isTinRange(t, bridgeStartT, bridgeEndT) || autoBridgeFlags[i] === 1;
    const isTunnel = !isBridge && autoTunnelFlags[i] === 1;
    const isStraight = isTinRange(t, straightStartT, straightEndT);

    // Progressive banking: scaled by user's banking customization + per-corner custom banking
    const curv = smoothCurvature[i];
    const inKarussell =
      !customBp &&
      activeMapId === 'aurelia_ridge' &&
      pos.x > -45 &&
      pos.x < 245 &&
      pos.z < -105 &&
      pos.z > -225;
    const highCurvBankBoost = Math.abs(curv) > 0.011 && !isStraight && !isBridge;
    const bankGain = (inKarussell ? 12.0 : highCurvBankBoost ? 8.2 : 6.8) * effBankingScale;
    const maxBank = (inKarussell ? 0.22 : 0.145) * Math.max(0.75, effBankingScale);
    const bridgeFade = isBridge || isTunnel ? 0.0 : 1.0;
    const straightFade = isStraight ? 0.0 : 1.0;

    let extraCornerBank = 0;
    for (let b = 0; b < waypointBankTargets.length; b++) {
      const target = waypointBankTargets[b];
      let dt = Math.abs(t - target.t);
      if (isClosed && dt > 0.5) dt = 1 - dt;
      if (dt < 0.075) {
        const w = Math.exp(-Math.pow(dt / 0.028, 2));
        // Positive user banking tilts inside of turn downward
        const sign = curv >= 0 ? -1 : 1;
        extraCornerBank += sign * target.rad * w;
      }
    }

    const baseBank = -clamp(curv * bankGain, -maxBank, maxBank);
    const bankAngle =
      clamp(baseBank + extraCornerBank, -0.34, 0.34) * bridgeFade * straightFade;

    const right = flatRight.clone().applyAxisAngle(tangent, bankAngle).normalize();
    const up = new THREE.Vector3().crossVectors(right, tangent).normalize();

    if (pos.y < minElevation) minElevation = pos.y;
    if (pos.y > maxElevation) maxElevation = pos.y;

    const isCatchFenceZone = !isBridge && !isTunnel && (isStraight || Math.abs(curv) > 0.0072);

    samples.push({
      index: i,
      t,
      arcLength: t * totalLength,
      position: pos,
      tangent,
      right,
      up,
      bankAngle,
      curvature: curv,
      isBridge,
      isTunnel,
      isStraight,
      isCatchFenceZone,
    });
  }

  // Collect contiguous tunnel ranges
  const tunnelRanges: Array<[number, number]> = [];
  let tRunStart = -1;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    if (samples[i].isTunnel && tRunStart < 0) {
      tRunStart = samples[i].t;
    } else if (!samples[i].isTunnel && tRunStart >= 0) {
      tunnelRanges.push([tRunStart, samples[i - 1].t]);
      tRunStart = -1;
    }
  }
  if (tRunStart >= 0) {
    tunnelRanges.push([tRunStart, samples[SAMPLE_COUNT - 1].t]);
  }

  // Locate Speed Trap Gate Ts (Pit Straight exit & West Backstraight)
  const speedTrapTs: number[] = [];
  const chicaneTs: number[] = [];
  const driftZoneTs: number[] = [];

  if (currentConfig.features.speedTrapGates) {
    speedTrapTs.push(((sfIdx + Math.round(SAMPLE_COUNT * 0.06)) % SAMPLE_COUNT) / SAMPLE_COUNT);
    speedTrapTs.push(((sfIdx + Math.round(SAMPLE_COUNT * 0.84)) % SAMPLE_COUNT) / SAMPLE_COUNT);
  }
  if (currentConfig.features.chicaneBarriers) {
    chicaneTs.push(((sfIdx + Math.round(SAMPLE_COUNT * 0.82)) % SAMPLE_COUNT) / SAMPLE_COUNT);
    chicaneTs.push(((sfIdx + Math.round(SAMPLE_COUNT * 0.835)) % SAMPLE_COUNT) / SAMPLE_COUNT);
  }
  if (currentConfig.features.driftClippingZones) {
    driftZoneTs.push(((sfIdx + Math.round(SAMPLE_COUNT * 0.15)) % SAMPLE_COUNT) / SAMPLE_COUNT);
    driftZoneTs.push(((sfIdx + Math.round(SAMPLE_COUNT * 0.50)) % SAMPLE_COUNT) / SAMPLE_COUNT);
    driftZoneTs.push(((sfIdx + Math.round(SAMPLE_COUNT * 0.92)) % SAMPLE_COUNT) / SAMPLE_COUNT);
  }

  // Build 2D spatial grid acceleration lookup
  const grid: number[][] = Array.from({ length: GRID_DIM * GRID_DIM }, () => []);
  for (let gx = 0; gx < GRID_DIM; gx++) {
    const cx = GRID_MIN + (gx + 0.5) * GRID_CELL;
    for (let gz = 0; gz < GRID_DIM; gz++) {
      const cz = GRID_MIN + (gz + 0.5) * GRID_CELL;
      let bestIdx = 0;
      let bestD2 = Infinity;
      for (let i = 0; i < SAMPLE_COUNT; i += 2) {
        const p = samples[i].position;
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = i;
        }
      }
      const bucket = grid[gz * GRID_DIM + gx];
      for (let k = -12; k <= 12; k++) {
        const idx = isClosed
          ? (bestIdx + k + SAMPLE_COUNT) % SAMPLE_COUNT
          : clamp(bestIdx + k, 0, SAMPLE_COUNT - 1);
        bucket.push(idx);
      }
    }
  }

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const p = samples[i].position;
    const gx = clamp(Math.floor((p.x - GRID_MIN) / GRID_CELL), 0, GRID_DIM - 1);
    const gz = clamp(Math.floor((p.z - GRID_MIN) / GRID_CELL), 0, GRID_DIM - 1);
    for (let ox = -2; ox <= 2; ox++) {
      for (let oz = -2; oz <= 2; oz++) {
        const nx = clamp(gx + ox, 0, GRID_DIM - 1);
        const nz = clamp(gz + oz, 0, GRID_DIM - 1);
        const bucket = grid[nz * GRID_DIM + nx];
        if (!bucket.includes(i)) bucket.push(i);
      }
    }
  }

  function queryNearestIntoInternal(
    x: number,
    z: number,
    out: CircuitQueryResult,
    referenceY?: number,
    excludeBridge = false,
  ): CircuitQueryResult {
    const gx = clamp(Math.floor((x - GRID_MIN) / GRID_CELL), 0, GRID_DIM - 1);
    const gz = clamp(Math.floor((z - GRID_MIN) / GRID_CELL), 0, GRID_DIM - 1);
    const candidates = grid[gz * GRID_DIM + gx];

    let bestIdx = candidates[0] ?? 0;
    let bestD2 = Infinity;

    for (let c = 0; c < candidates.length; c++) {
      const idx = candidates[c];
      const s = samples[idx];
      if (excludeBridge && s.isBridge) continue;
      const p = s.position;
      const dx = p.x - x;
      const dz = p.z - z;
      let d2 = dx * dx + dz * dz;
      if (referenceY !== undefined) {
        const dy = p.y - referenceY;
        d2 += dy * dy * 9.0;
      }
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIdx = idx;
      }
    }

    if (bestD2 === Infinity && excludeBridge) {
      for (let idx = 0; idx < SAMPLE_COUNT; idx += 2) {
        const s = samples[idx];
        if (s.isBridge) continue;
        const dx = s.position.x - x;
        const dz = s.position.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = idx;
        }
      }
    }

    const prevIdx = isClosed ? (bestIdx - 1 + SAMPLE_COUNT) % SAMPLE_COUNT : Math.max(0, bestIdx - 1);
    const nextIdx = isClosed ? (bestIdx + 1) % SAMPLE_COUNT : Math.min(SAMPLE_COUNT - 1, bestIdx + 1);
    const sPrev = samples[prevIdx];
    const sCurr = samples[bestIdx];
    const sNext = samples[nextIdx];

    const seg1x = sNext.position.x - sCurr.position.x;
    const seg1z = sNext.position.z - sCurr.position.z;
    const len1Sq = seg1x * seg1x + seg1z * seg1z || 1;
    const proj1 = clamp(
      ((x - sCurr.position.x) * seg1x + (z - sCurr.position.z) * seg1z) / len1Sq,
      0,
      1,
    );

    const seg0x = sCurr.position.x - sPrev.position.x;
    const seg0z = sCurr.position.z - sPrev.position.z;
    const len0Sq = seg0x * seg0x + seg0z * seg0z || 1;
    const proj0 = clamp(
      ((x - sPrev.position.x) * seg0x + (z - sPrev.position.z) * seg0z) / len0Sq,
      0,
      1,
    );

    const p1x = sCurr.position.x + seg1x * proj1;
    const p1z = sCurr.position.z + seg1z * proj1;
    const d1Sq = (p1x - x) * (p1x - x) + (p1z - z) * (p1z - z);

    const p0x = sPrev.position.x + seg0x * proj0;
    const p0z = sPrev.position.z + seg0z * proj0;
    const d0Sq = (p0x - x) * (p0x - x) + (p0z - z) * (p0z - z);

    let sA: CircuitSample;
    let sB: CircuitSample;
    let alpha: number;
    if (d1Sq <= d0Sq) {
      sA = sCurr;
      sB = sNext;
      alpha = proj1;
    } else {
      sA = sPrev;
      sB = sCurr;
      alpha = proj0;
    }

    out.centerPos.lerpVectors(sA.position, sB.position, alpha);
    out.right.lerpVectors(sA.right, sB.right, alpha).normalize();
    out.up.lerpVectors(sA.up, sB.up, alpha).normalize();
    out.tangent.lerpVectors(sA.tangent, sB.tangent, alpha).normalize();

    const dx = x - out.centerPos.x;
    const dz = z - out.centerPos.z;
    out.sample = sA;
    out.nextSample = sB;
    out.localAlpha = alpha;
    out.signedLateral = dx * out.right.x + dz * out.right.z;
    out.absDistance = Math.hypot(dx, dz);
    out.isBridge = alpha < 0.5 ? sA.isBridge : sB.isBridge;
    out.curvature = sA.curvature + (sB.curvature - sA.curvature) * alpha;
    out.t = isClosed ? sA.t + ((sB.t - sA.t + 1) % 1) * alpha : sA.t + (sB.t - sA.t) * alpha;
    return out;
  }

  function queryNearestInternal(
    x: number,
    z: number,
    referenceY?: number,
    excludeBridge = false,
  ): CircuitQueryResult {
    const res = createCircuitQueryScratch(samples[0]);
    return queryNearestIntoInternal(x, z, res, referenceY, excludeBridge);
  }

  function queryNearest(x: number, z: number, referenceY?: number): CircuitQueryResult {
    return queryNearestInternal(x, z, referenceY, false);
  }

  function queryNearestGroundTrack(x: number, z: number): CircuitQueryResult {
    return queryNearestInternal(x, z, undefined, true);
  }

  function queryNearestInto(
    x: number,
    z: number,
    out: CircuitQueryResult,
    referenceY?: number,
  ): CircuitQueryResult {
    return queryNearestIntoInternal(x, z, out, referenceY, false);
  }

  function queryNearestGroundTrackInto(
    x: number,
    z: number,
    out: CircuitQueryResult,
  ): CircuitQueryResult {
    return queryNearestIntoInternal(x, z, out, undefined, true);
  }

  function sampleAtT(t: number): CircuitSample {
    if (!isClosed) {
      const idx = clamp(Math.round(clamp(t, 0, 1) * (SAMPLE_COUNT - 1)), 0, SAMPLE_COUNT - 1);
      return samples[idx];
    }
    const wrapped = ((t % 1) + 1) % 1;
    const idx = Math.floor(wrapped * SAMPLE_COUNT) % SAMPLE_COUNT;
    return samples[idx];
  }

  const mapMeta = MAP_REGISTRY[activeMapId];
  cachedCircuit = {
    mapId: activeMapId,
    closedLoop: isClosed,
    curve,
    samples,
    controlPoints: points,
    totalLength,
    roadWidth,
    roadHalfWidth,
    gripScale: effGripScale,
    kerbHeightScale: effKerbScale,
    features: { ...currentConfig.features },
    minElevation,
    maxElevation,
    waterLevel: mapMeta.waterLevel,
    pitLaneBounds: mapMeta.pitLaneBounds,
    pitBoxBounds: mapMeta.pitBoxBounds,
    bridgeRange: [bridgeStartT, bridgeEndT],
    tunnelRanges,
    straightRange: [straightStartT, straightEndT],
    startFinishIndex: sfIdx,
    speedTrapTs,
    driftZoneTs,
    chicaneTs,
    queryNearest,
    queryNearestGroundTrack,
    queryNearestInto,
    queryNearestGroundTrackInto,
    sampleAtT,
  };

  cachedCircuitsByMap.set(activeMapId, cachedCircuit);
  return cachedCircuit;
}
