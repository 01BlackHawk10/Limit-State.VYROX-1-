import type * as THREE from 'three';

export type MapId = 'coral_bay' | 'frostpeak_pass';

export type LayoutPresetId =
  | 'original'
  | 'technical_chicanes'
  | 'high_speed'
  | 'drift_canyon';

export type CameraVantageId =
  | 'chase'
  | 'overview'
  | 'straight'
  | 'roadlevel'
  | 'bridgedeck'
  | 'bridge'
  | 'bowl'
  | 'esses';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface PitFrameSpec {
  centerX: number;
  centerZ: number;
  tangentX: number;
  tangentZ: number;
  rightX: number;
  rightZ: number;
  y: number;
  toleranceY: number;
  halfLength: number;
  halfWidth: number;
}

export interface SectorSpec {
  id: 'S1' | 'S2' | 'S3';
  name: string;
  startT: number;
  endT: number;
}

export interface EditableWaypoint {
  index: number;
  label: string;
}

export interface CameraVantageSpec {
  id: Exclude<CameraVantageId, 'chase'>;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

export interface AtmospherePreset {
  solarDeg: number;
  haze: number;
  waterLevel: number;
  skyTopColor: string;
  skyHorizonColor: string;
  fogColor: string;
  fogDensity: number;
  sunColor: string;
  hemiSkyColor: string;
  hemiGroundColor: string;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  subtitle: string;
  accent: string;
  closedLoop: true;
  targetLengthKm: number;
  elevationDeltaM: number;
  minSplineY: number;
  roadWidth: number;
  roadHalfWidth: number;
  straightHalfLength: number;
  lockedControlIndices: number[];
  editableWaypoints: EditableWaypoint[];
  layoutPresets: { id: LayoutPresetId; label: string }[];
  sectors: SectorSpec[];
  pitFrame: PitFrameSpec;
  podiumPosition: [number, number, number];
  bridgeHub: { x: number; z: number };
  bridgeHalfSamples: number;
  waterLevel: number;
  defaultSolarDeg: number;
  defaultHaze: number;
  vantages: CameraVantageSpec[];
}

export interface TrackSample {
  index: number;
  t: number;
  distance: number;
  x: number;
  y: number;
  z: number;
  tangentX: number;
  tangentY: number;
  tangentZ: number;
  rightX: number;
  rightZ: number;
  curvature: number;
  isBridge: boolean;
  hasRightPitGap: boolean;
  sectorIndex: 0 | 1 | 2;
}

export interface TrackSplineData {
  controlPoints: [number, number, number][];
  samples: TrackSample[];
  totalLength: number;
  minY: number;
  maxY: number;
  elevationDelta: number;
}

export interface ObbCollider {
  id: string;
  kind: 'building' | 'pitwall' | 'landmark';
  centerX: number;
  centerZ: number;
  halfW: number;
  halfD: number;
  axisX: number;
  axisZ: number;
  minY: number;
  maxY: number;
}

export interface CircleCollider {
  id: string;
  kind: 'wood' | 'rock' | 'prop';
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
}

export interface SplineWallCollider {
  id: string;
  kind: 'guardrail' | 'bridge';
  ax: number;
  az: number;
  bx: number;
  bz: number;
  y: number;
  radius: number;
}

export interface ColliderRegistry {
  obbs: ObbCollider[];
  circles: CircleCollider[];
  walls: SplineWallCollider[];
}

export interface TerrainField {
  mapId: MapId;
  waterLevel: number;
  minHeight: number;
  maxHeight: number;
  getHeight: (x: number, z: number) => number;
  getRawHeight: (x: number, z: number) => number;
  getSlope: (x: number, z: number) => number;
  isPitOrGrandstandPad: (x: number, z: number) => number;
}

export interface TrackSurfaceContext {
  update: (
    elapsed: number,
    dt: number,
    playerPos: THREE.Vector3,
    carSpeedRatio: number,
    solarDeg: number,
    haze: number
  ) => void;
  setWetness: (wetness: number) => void;
  setSnowAccumulation: (snow: number) => void;
  setWaterChop: (chop: number) => void;
  setWaterClarity: (clarity: number) => void;
  setCrowdExcitement: (level: number) => void;
  updateChunkCulling: (cameraPos: THREE.Vector3) => void;
  dispose: () => void;
}
