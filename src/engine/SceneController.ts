import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { buildAiRivalsRig } from '../Maps/Aurelia Ridge/aiRivalsRig';
import { GtAudioEngine } from './audioEngine';
import { CarSsrAndLutPass } from './carPostFx';
import { buildCctvAndPaceRig, CctvStationInfo } from '../Maps/Aurelia Ridge/cctvAndPaceRig';
import {
  CircuitLayoutPreset,
  CustomTrackFeatures,
  EDITABLE_WAYPOINT_INDICES,
  getActiveMapId,
  getCircuitCustomization,
  getCircuitData,
  getCircuitPreviewData,
  getCustomBlueprint,
  getDefaultMapCustomization,
  getEditableWaypointsForActiveMap,
  getTougeDirection,
  MapCustomizationConfig,
  rebuildCircuitData,
  setActiveMapId,
  setCustomBlueprint,
  setTougeDirection,
  type TougeDirection,
} from '../Maps/Aurelia Ridge/circuitSpline';
import { buildFlagMarshalsRig } from '../Maps/Aurelia Ridge/flagMarshalsBuilder';
import { buildGarageStage, GARAGE_CAMERA_POSES, GarageCameraPreset } from '../Maps/Garage/garageStage';
import { buildLandmarksAndCampusRig } from '../Maps/Aurelia Ridge/landmarksAndCampusBuilder';
import { clamp, lerp } from './mathNoise';
import {
  type CarVisualCustomization,
  computeEffectiveSpecs,
  getDefaultVisualCustomization,
} from './carCustomization';
import { ALL_ACTIVE_CAR_IDS } from '../shared/carTypes';
import {
  abortCarTemplateLoad,
  CarLiveryVariant,
  CarModelId,
  createCarPlaceholderInstance,
  loadCarTemplate,
  McLarenCarInstance,
  McLarenTemplate,
  normalizeCarModelId,
  pumpGpuTextureQueue,
} from './mclarenCarLoader';
import { buildPodiumCeremonyRig, PodiumCameraAngle } from '../Maps/Aurelia Ridge/podiumRig';
import {
  createProceduralTextureSuite,
  type ProceduralTextureSuite,
} from '../Maps/Aurelia Ridge/proceduralTextures';
import { setUserAssetBudgetMode, type UserAssetBudgetMode } from './userAssetsLoader';
import { buildPropsAndFoliageRig } from '../Maps/Aurelia Ridge/propsAndFoliageBuilder';
import { EngineerRadioCaption, RaceEngineerRadio } from './raceEngineerAudio';
import { buildRoadAndBridgeRig } from '../Maps/Aurelia Ridge/roadAndBridgeBuilder';
import {
  buildSkyAndLightingRig,
  HazePreset,
  SnowAtmospherePreset,
  WeatherPreset,
} from '../Maps/Aurelia Ridge/skyAndLighting';
import { buildTerrainRig, InspectMode } from '../Maps/Aurelia Ridge/terrainBuilder';
import {
  beginTerrainHeightCache,
  endTerrainHeightCache,
  groundHeightAt,
} from '../Maps/Aurelia Ridge/terrainField';
import {
  ActiveAeroMode,
  CarSetupConfig,
  CockpitDialState,
  COORDINATE_FRAME_CONTRACT,
  DrivingCameraMode,
  FinishSummary,
  FuelStarvationState,
  type FullCarSpecSheet,
  GameMode,
  getDefaultCarSetup,
  getDefaultCockpitDials,
  getDefaultPitStrategy,
  getFullCarSpecSheet,
  LeaderboardEntry,
  NON_DETERMINISTIC_MATH_WARNING,
  PhysicsDiagnosticsTelemetry,
  PhysicsPreset,
  PitStrategyPlan,
  RaceConfig,
  RaceDifficulty,
  readBestLapMsForMapCar,
  resolveStintEconomics,
  RivalTelemetry,
  StartCountdownMode,
  StintEconomics,
  StintStrategyPreset,
  TIRE_COMPOUNDS,
  TireCompoundId,
  VEHICLE_SPECS,
  VehicleAssists,
  VehicleControlsInput,
  VehiclePhysicsEngine,
  VehicleTelemetry,
} from './vehiclePhysics';
import { worldColliders } from '../Maps/Aurelia Ridge/worldColliders';
import {
  AURELIA_WEATHER_SOLAR_SYNC,
  type CameraPresetId,
  isTougeMapId,
  MAP_LIST,
  MAP_REGISTRY,
  type MapId,
} from '../Maps/mapRegistry';
import { getTofuChapterById } from '../data/tofuStory';
import { GhostBattleManager, type GhostBattleMode } from './ghostManager';
import {
  MainLoopProfiler,
  type PerformanceSnapshot,
} from './performanceManager';
import {
  type ContinuousWeatherState,
  type WeatherAutoPace,
  WeatherTransitionManager,
} from './weatherTransitionManager';
import { type CrowdTelemetryInput } from '../Maps/sharedGrandstandCrowd';
import { buildCoralBayTerrainRig } from '../Maps/Coral Bay/coralBayTerrainBuilder';
import {
  buildCoralBayLandmarksRig,
  buildCoralBayPropsAndFoliageRig,
} from '../Maps/Coral Bay/coralBayLandmarksAndProps';
import { buildFrostpeakTerrainRig } from '../Maps/Frostpeak Glacier/frostpeakTerrainBuilder';
import {
  buildFrostpeakLandmarksRig,
  buildFrostpeakPropsAndFoliageRig,
} from '../Maps/Frostpeak Glacier/frostpeakLandmarksAndProps';
import { buildKestrelTerrainRig } from '../Maps/Kestrel Peaks/kestrelTerrainBuilder';
import { buildKestrelRoadAndBridgeRig } from '../Maps/Kestrel Peaks/kestrelRoadBuilder';
import {
  buildKestrelLandmarksRig,
  buildKestrelPropsAndFoliageRig,
} from '../Maps/Kestrel Peaks/kestrelLandmarksAndProps';
import { buildCustomPropsRig, setActiveBlueprintEffects } from './customMapBuilder';
import { RemotePlayersRig } from './remotePlayersRig';
import type {
  CustomMapBlueprint,
  MultiplayerCarPose,
  StudioToolMode,
} from '../shared/socialTypes';
import {
  type AnalyticsSessionAccumulator,
  DriverAnalyticsTracker,
} from './driverAnalytics';
import {
  loadLatestReplayFromDb,
  type RaceReplayRecording,
  RaceReplayRecorder,
  type ReplayCameraMode,
  ReplayPlayer,
  type ReplayUiState,
  saveReplayToDb,
} from './replayManager';

export type {
  ActiveAeroMode,
  AnalyticsSessionAccumulator,
  CameraPresetId,
  CarModelId,
  CarSetupConfig,
  CarVisualCustomization,
  CctvStationInfo,
  CircuitLayoutPreset,
  CockpitDialState,
  ContinuousWeatherState,
  CustomTrackFeatures,
  DrivingCameraMode,
  EngineerRadioCaption,
  FinishSummary,
  FuelStarvationState,
  FullCarSpecSheet,
  GameMode,
  GarageCameraPreset,
  LeaderboardEntry,
  MapCustomizationConfig,
  MapId,
  PerformanceSnapshot,
  PhysicsDiagnosticsTelemetry,
  PhysicsPreset,
  PitStrategyPlan,
  PodiumCameraAngle,
  RaceConfig,
  RaceDifficulty,
  RaceReplayRecording,
  ReplayCameraMode,
  ReplayUiState,
  RivalTelemetry,
  SnowAtmospherePreset,
  StartCountdownMode,
  StintEconomics,
  StintStrategyPreset,
  TireCompoundId,
  VehicleAssists,
  VehicleTelemetry,
  WeatherAutoPace,
};
export {
  COORDINATE_FRAME_CONTRACT,
  EDITABLE_WAYPOINT_INDICES,
  getActiveMapId,
  getCircuitCustomization,
  getCircuitPreviewData,
  getDefaultCarSetup,
  getDefaultCockpitDials,
  getDefaultMapCustomization,
  getDefaultPitStrategy,
  getDefaultVisualCustomization,
  getEditableWaypointsForActiveMap,
  getFullCarSpecSheet,
  MAP_LIST,
  MAP_REGISTRY,
  NON_DETERMINISTIC_MATH_WARNING,
  readBestLapMsForMapCar,
  resolveStintEconomics,
  TIRE_COMPOUNDS,
  VEHICLE_SPECS,
};

export type AppScreenMode = 'garage' | 'custom_map' | 'racing' | 'podium' | 'replay';
export type GraphicsQuality =
  | 'low'
  | 'recommended'
  | 'balanced'
  | 'medium'
  | 'high'
  | 'max'
  | 'ultra';
export type ShadowQualityOption = 'off' | 'low' | 'medium' | 'high';
export type TextureSizeOption = '512' | '1024' | '2048';
export type RenderScaleOption = 'fast' | 'balanced' | 'native';

export function getDefaultShadowQualityForPreset(q: GraphicsQuality): ShadowQualityOption {
  if (q === 'low') return 'off';
  if (q === 'recommended') return 'low';
  if (q === 'balanced' || q === 'medium') return 'medium';
  return 'high';
}

export function getDefaultTextureSizeForPreset(q: GraphicsQuality): TextureSizeOption {
  if (q === 'low' || q === 'recommended') return '512';
  if (q === 'balanced' || q === 'medium' || q === 'high') return '1024';
  return '2048';
}

export function getDefaultRenderScaleForPreset(q: GraphicsQuality): RenderScaleOption {
  if (q === 'low' || q === 'recommended') return 'fast';
  if (q === 'balanced' || q === 'medium') return 'balanced';
  return 'native';
}

export type FilmGradePreset = 'natural' | 'broadcast' | 'kodak_gold' | 'cool_gt' | 'noir';

export type PhotoViewMode = 'drone' | 'orbit' | 'interior' | 'front_low' | 'rear_aero';

export interface PhotoModeState {
  active: boolean;
  viewMode: PhotoViewMode;
  carFrozen: boolean;
  fovDeg: number;
  rollDeg: number;
  moveSpeed: number;
}

export interface MobileControlsInput {
  throttleVal: number;
  brakeVal: number;
  steerAxis: number;
  handbrakeVal: number;
  lookBack: boolean;
}

export interface CinematicSettings {
  exposure: number;         // 0.70 .. 1.45
  bloomStrength: number;    // 0.00 .. 0.45
  bloomThreshold: number;   // 0.70 .. 1.15
  vignetteStrength: number; // 0.00 .. 0.55
  filmGrade: FilmGradePreset;
  baseFovDeg: number;       // 46 .. 74
  speedFovBoost: number;    // 0.0 .. 1.6
  cameraShake: number;      // 0.0 .. 1.5
  weatherAutoEnabled: boolean;
  weatherPace: WeatherAutoPace;
  dynamicWeatherEnabled: boolean;
  crowdReactivity: number;  // 0.25 .. 1.5
  crowdDensity: number;     // 0.25 .. 1.0
}

export const DEFAULT_CINEMATIC_SETTINGS: CinematicSettings = {
  exposure: 1.06,
  bloomStrength: 0.20,
  bloomThreshold: 0.95,
  vignetteStrength: 0.22,
  filmGrade: 'natural',
  baseFovDeg: 58,
  speedFovBoost: 1.0,
  cameraShake: 0.7,
  weatherAutoEnabled: true,
  weatherPace: 'sprint',
  dynamicWeatherEnabled: false,
  crowdReactivity: 1.0,
  crowdDensity: 1.0,
};

// CameraPresetId imported & re-exported from ../Maps/mapRegistry

export interface CircuitMetrics {
  lengthKm: string;
  roadWidthM: number;
  elevationDeltaM: number;
}

export interface MinimapData {
  svgPath: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  startX: number;
  startZ: number;
  sector1X: number;
  sector1Z: number;
  sector2X: number;
  sector2Z: number;
}

export interface SceneControllerAPI {
  setAppMode: (mode: AppScreenMode) => void;
  setSelectedCar: (carId: CarModelId) => void;
  getSelectedCar: () => CarModelId;
  setGarageCarAvailable: (available: boolean) => void;
  setGarageCameraPreset: (preset: GarageCameraPreset) => void;
  setRaceConfig: (config: RaceConfig) => void;
  startNewRace: (config?: RaceConfig) => void;
  skipPreRaceIntro: () => void;
  resetCarToTrack: () => void;
  setPaused: (paused: boolean) => void;
  setBackgroundFrozen: (frozen: boolean) => void;
  setDrivingCamera: (cam: DrivingCameraMode) => void;
  cycleDrivingCamera: () => DrivingCameraMode;
  setAssists: (assists: VehicleAssists) => void;
  setCarSetup: (setup: CarSetupConfig) => void;
  setVisualCustomization: (cfg: CarVisualCustomization) => void;
  setTestMode: (enabled: boolean, fixedFuelLiters?: number) => void;
  setCockpitDials: (dials: CockpitDialState) => void;
  setPitStrategy: (strategy: PitStrategyPlan) => void;
  setAdvancedTelemetryEnabled: (enabled: boolean) => void;
  exportTelemetryCsv: () => { csv: string; sampleCount: number };
  setAudioConfig: (volume: number, muted: boolean) => void;
  setSurfaceAudioEnabled: (enabled: boolean) => void;
  unlockAudio: () => void;
  setStartupBenchmarkPinned: (pinned: boolean) => void;
  toggleHeadlights: () => boolean;
  setHeadlightsEnabled: (enabled: boolean) => boolean;
  toggleActiveAero: () => boolean;
  setAeroDeployed: (deployed: boolean) => void;
  setGarageAeroPreview: (deployed: boolean) => void;
  setMobileInput: (input: MobileControlsInput) => void;
  shiftUp: () => void;
  shiftDown: () => void;
  returnToDriveCamera: () => void;
  setCameraPreset: (preset: CameraPresetId) => void;
  setFlyoverActive: (active: boolean) => void;
  getCctvStations: () => CctvStationInfo[];
  setCctvEnabled: (enabled: boolean) => void;
  setCctvStationIndex: (index: number) => void;
  setCctvAutoSwitch: (auto: boolean) => void;
  setPodiumCameraAngle: (angle: PodiumCameraAngle) => void;
  setSolarAngle: (deg: number) => string;
  setAutoCycle: (active: boolean) => void;
  setHazePreset: (haze: HazePreset) => void;
  setWeatherPreset: (weather: WeatherPreset) => void;
  setSnowAtmosphere: (preset: SnowAtmospherePreset) => { solarAngleDeg: number; phaseLabel: string };
  setInspectMode: (mode: InspectMode) => void;
  setPostFxEnabled: (enabled: boolean) => void;
  setGraphicsQuality: (quality: GraphicsQuality) => void;
  setShadowQuality: (shadow: ShadowQualityOption) => void;
  setTextureSize: (size: TextureSizeOption) => void;
  setRenderScale: (scale: RenderScaleOption) => void;
  setCinematicSettings: (next: CinematicSettings) => void;
  setSelectedWaypoint: (wpIndex: number | null) => void;
  setSelectedBlueprintNode: (ptIndex: number | null) => void;
  focusStudioCameraOnNode: (ptIndex: number) => void;
  snapPointToRoad: (
    x: number,
    z: number,
  ) => { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number } | null;
  setCustomMapCameraMode: (mode: 'overview' | 'top_down') => void;
  previewMapCustomization: (config: MapCustomizationConfig) => void;
  applyMapCustomization: (config: MapCustomizationConfig) => CircuitMetrics;
  loadCustomBlueprint: (
    blueprint: CustomMapBlueprint | null,
    fullWorldRebuild?: boolean,
    selectedPropId?: string | null,
  ) => CircuitMetrics;
  setCustomMapBuilderPickMode: (active: boolean) => void;
  setStudioToolMode: (mode: StudioToolMode) => void;
  setStudioTransformConfig: (cfg: {
    space: 'world' | 'local';
    snapMove: number;
    snapRotateDeg: number;
    snapScale: number;
    brushRadius?: number;
  }) => void;
  syncSelectedBuilderProp: (propId: string | null) => void;
  focusStudioCameraOnProp: (propId: string) => void;
  getStudioCameraTarget: () => { x: number; y: number; z: number };
  updateCustomTerrainMaterialPreview: (blueprint: CustomMapBlueprint) => void;
  updateCustomTerrainGeometryFast: (blueprint: CustomMapBlueprint) => void;
  raycastTrackWorld: (
    clientX: number,
    clientY: number,
  ) => { x: number; y: number; z: number; propId?: string } | null;
  setMultiplayerCollisionEnabled: (enabled: boolean) => void;
  syncRemotePlayerPose: (pose: MultiplayerCarPose) => void;
  removeRemotePlayer: (userId: string) => void;
  clearRemotePlayers: () => void;
  getLocalMultiplayerPose: (
    userId: string,
    username: string,
    carId: string,
    paintHex: string,
  ) => MultiplayerCarPose;
  setActiveMap: (mapId: MapId) => CircuitMetrics;
  getActiveMap: () => MapId;
  setTougeDirection: (dir: TougeDirection) => CircuitMetrics;
  getTougeDirection: () => TougeDirection;
  setGhostMode: (mode: GhostBattleMode) => void;
  getGhostMode: () => GhostBattleMode;
  prewarmMap: (mapId: MapId) => void;
  setAutoManageResources: (enabled: boolean) => void;
  purgeUnusedResources: () => void;
  getPerformanceSnapshot: () => PerformanceSnapshot;
  setPhotoMode: (enabled: boolean) => PhotoModeState;
  cyclePhotoView: () => PhotoModeState;
  setPhotoViewMode: (view: PhotoViewMode) => PhotoModeState;
  setPhotoCarFrozen: (frozen: boolean) => PhotoModeState;
  setPhotoLens: (patch: { fovDeg?: number; rollDeg?: number; moveSpeed?: number }) => PhotoModeState;
  resetPhotoCamera: () => PhotoModeState;
  setPhotoMoveInput: (input: { forward?: number; right?: number; up?: number; boost?: boolean }) => void;
  captureCleanScreenshot: () => string;
  hasLastReplay: () => boolean;
  getLastReplayMeta: () => {
    id: string;
    mapId: string;
    mapName: string;
    carId: CarModelId;
    carName: string;
    durationMs: number;
    frameCount: number;
  } | null;
  startReplay: () => boolean;
  exitReplay: (returnMode?: AppScreenMode) => void;
  setReplayPlaying: (playing: boolean) => void;
  seekReplayMs: (targetMs: number) => void;
  stepReplayFrames: (frameDelta: number) => void;
  setReplaySpeed: (speed: number) => void;
  setReplayCameraMode: (mode: ReplayCameraMode) => void;
  setReplayCctvStationIndex: (index: number) => void;
  dispose: () => void;
}

const _vantagePosScratch = new THREE.Vector3();
const _vantageTargetScratch = new THREE.Vector3();

function getActiveVantage(preset: CameraPresetId): { position: THREE.Vector3; target: THREE.Vector3 } {
  const meta = MAP_REGISTRY[getActiveMapId()];
  const match = meta.cameraVantages.find((v) => v.id === preset) ?? meta.cameraVantages[0];
  _vantagePosScratch.set(match.pos[0], match.pos[1], match.pos[2]);
  _vantageTargetScratch.set(match.target[0], match.target[1], match.target[2]);
  return { position: _vantagePosScratch, target: _vantageTargetScratch };
}

/**
 * Pre-bloom HDR safety clamp: prevents any single NaN/Inf/sub-zero HDR fragment
 * (from grazing fresnel, HalfFloat division, or specular mip) from spreading
 * black NaN blocks across UnrealBloomPass blur pyramids.
 */
const HDR_SANITIZE_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;
      c.r = (c.r >= 0.0 && c.r <= 64.0) ? c.r : 0.0;
      c.g = (c.g >= 0.0 && c.g <= 64.0) ? c.g : 0.0;
      c.b = (c.b >= 0.0 && c.b <= 64.0) ? c.b : 0.0;
      gl_FragColor = vec4(clamp(c, vec3(0.0), vec3(24.0)), 1.0);
    }
  `,
};

const CINEMA_LENS_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uVignetteStrength: { value: 0.22 },
    uContrast: { value: 0.14 },
    uGradeMode: { value: 0.0 },
    uChromatic: { value: 0.0008 },
    uShadowDepth: { value: 0.18 },
    uSplitWarm: { value: new THREE.Color(0xfff1dc) },
    uSplitCool: { value: new THREE.Color(0xdcebff) },
    uSplitBalance: { value: 0.16 },
    uTime: { value: 0.0 },
    uRainAmount: { value: 0.0 },
    uSunScreenUv: { value: new THREE.Vector2(0.5, 0.72) },
    uSunScreenVis: { value: 0.0 },
    uNightFactor: { value: 0.0 },
    uSunGlowColor: { value: new THREE.Color(0xffc988) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignetteStrength;
    uniform float uContrast;
    uniform float uGradeMode;
    uniform float uChromatic;
    uniform float uShadowDepth;
    uniform vec3 uSplitWarm;
    uniform vec3 uSplitCool;
    uniform float uSplitBalance;
    uniform float uTime;
    uniform float uRainAmount;
    uniform vec2 uSunScreenUv;
    uniform float uSunScreenVis;
    uniform float uNightFactor;
    uniform vec3 uSunGlowColor;
    varying vec2 vUv;

    vec3 sanitizeRgb(vec3 c) {
      return vec3(
        (c.r >= 0.0 && c.r <= 64.0) ? c.r : 0.0,
        (c.g >= 0.0 && c.g <= 64.0) ? c.g : 0.0,
        (c.b >= 0.0 && c.b <= 64.0) ? c.b : 0.0
      );
    }

    vec2 rainDropOffset(vec2 uv, float scale, float t) {
      vec2 grid = vec2(scale * 1.45, scale);
      vec2 st = uv * grid;
      float colId = floor(st.x);
      float yDrift = t * (0.65 + fract(sin(colId * 91.7) * 437.5) * 0.85);
      st.y += yDrift;
      vec2 cell = floor(st);
      vec2 f = fract(st) - 0.5;
      float rnd = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
      if (rnd < 0.72) return vec2(0.0);
      vec2 jitter = vec2(fract(rnd * 17.3) - 0.5, fract(rnd * 39.1) - 0.5) * 0.44;
      vec2 d = f - jitter;
      d.y *= 0.62;
      float r = length(d);
      float dropMask = smoothstep(0.24, 0.06, r);
      return d * (-0.028 * dropMask);
    }

    void main() {
      vec2 rainRefract = vec2(0.0);
      if (uRainAmount > 0.04) {
        rainRefract =
          (rainDropOffset(vUv, 14.0, uTime) + rainDropOffset(vUv + vec2(0.37, 0.19), 23.0, uTime * 1.25)) *
          clamp(uRainAmount, 0.0, 1.0);
      }
      vec2 sampleUv = clamp(vUv + rainRefract, 0.001, 0.999);
      vec2 centered = sampleUv - 0.5;
      float r2 = dot(centered, centered);
      float fringe = uChromatic * smoothstep(0.14, 0.72, r2);
      vec2 dir = centered * fringe;
      vec3 baseRgb = sanitizeRgb(texture2D(tDiffuse, sampleUv).rgb);
      if (fringe > 0.00005) {
        float rCh = sanitizeRgb(texture2D(tDiffuse, clamp(sampleUv + dir, 0.001, 0.999)).rgb).r;
        float bCh = sanitizeRgb(texture2D(tDiffuse, clamp(sampleUv - dir, 0.001, 0.999)).rgb).b;
        baseRgb = vec3(rCh, baseRgb.g, bCh);
      }
      if (length(rainRefract) > 0.0006) {
        baseRgb += vec3(0.045, 0.055, 0.070) * clamp(length(rainRefract) * 42.0, 0.0, 0.45);
      }

      // Single-pass radial volumetric sun shafts + subtle horizontal anamorphic solar flare
      if (uSunScreenVis > 0.005) {
        vec2 toSun = uSunScreenUv - sampleUv;
        float sunDist = length(toSun);
        vec2 stepRay = toSun * 0.115;
        vec2 rayUv = sampleUv;
        vec3 shaftAccum = vec3(0.0);
        float weight = 0.28;
        for (int i = 0; i < 6; i++) {
          rayUv += stepRay;
          vec3 tap = sanitizeRgb(texture2D(tDiffuse, clamp(rayUv, 0.002, 0.998)).rgb);
          float tapLuma = dot(tap, vec3(0.2126, 0.7152, 0.0722));
          float skyMask = smoothstep(0.62, 1.08, tapLuma);
          shaftAccum += tap * skyMask * weight;
          weight *= 0.80;
        }
        float sunProximity = exp(-sunDist * 1.95);
        baseRgb += shaftAccum * uSunGlowColor * (0.28 * sunProximity * uSunScreenVis);

        // Anamorphic horizontal solar flare streak across bright horizon core
        float horzStreak = exp(-abs(sampleUv.y - uSunScreenUv.y) * 54.0) * exp(-abs(sampleUv.x - uSunScreenUv.x) * 3.4);
        float discHalo = exp(-sunDist * 7.5);
        baseRgb += mix(uSunGlowColor, vec3(1.0, 0.94, 0.84), 0.45) * (horzStreak * 0.16 + discHalo * 0.11) * uSunScreenVis;
      }

      // GTA VI night halation glow around headlights, sodium streetlamps & tunnel beacons
      if (uNightFactor > 0.02) {
        vec2 haloOff = vec2(0.0032, 0.0054);
        vec3 h1 = sanitizeRgb(texture2D(tDiffuse, clamp(sampleUv + vec2(haloOff.x, 0.0), 0.002, 0.998)).rgb);
        vec3 h2 = sanitizeRgb(texture2D(tDiffuse, clamp(sampleUv - vec2(haloOff.x, 0.0), 0.002, 0.998)).rgb);
        vec3 h3 = sanitizeRgb(texture2D(tDiffuse, clamp(sampleUv + vec2(0.0, haloOff.y), 0.002, 0.998)).rgb);
        vec3 h4 = sanitizeRgb(texture2D(tDiffuse, clamp(sampleUv - vec2(0.0, haloOff.y), 0.002, 0.998)).rgb);
        vec3 hiGlow =
          max(h1 - vec3(0.66), vec3(0.0)) +
          max(h2 - vec3(0.66), vec3(0.0)) +
          max(h3 - vec3(0.66), vec3(0.0)) +
          max(h4 - vec3(0.66), vec3(0.0));
        baseRgb += hiGlow * (0.11 * uNightFactor);
      }

      float vignette = 1.0 - smoothstep(0.20, 0.78, r2) * uVignetteStrength;
      vec3 col = max(baseRgb * vignette, vec3(0.0));

      // Deep motorsport shadow toe compression + soft highlight shoulder roll-off
      float rawLuma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      float shadowMask = 1.0 - smoothstep(0.015, 0.36, rawLuma);
      col *= mix(1.0, 1.0 - uShadowDepth * 0.48, shadowMask);
      col = mix(col, pow(max(col, vec3(0.0001)), vec3(1.0 + uShadowDepth * 0.34)), shadowMask * 0.80);

      // Subtle photographic split-tone: cool cobalt shadows vs warm sunlit highlights
      float hiMask = smoothstep(0.30, 0.88, rawLuma);
      col *= mix(vec3(1.0), uSplitCool, shadowMask * uSplitBalance);
      col *= mix(vec3(1.0), uSplitWarm, hiMask * (uSplitBalance * 0.88));

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      if (uGradeMode > 0.5 && uGradeMode < 1.5) {
        // 1: Broadcast Crisp (punchy saturation & cool shadow lift)
        col = mix(vec3(luma), col, 1.15);
        col = mix(col, smoothstep(0.0, 1.0, col), clamp(uContrast + 0.10, 0.0, 0.44));
      } else if (uGradeMode >= 1.5 && uGradeMode < 2.5) {
        // 2: Kodak Gold Warmth
        col = vec3(col.r * 1.05, col.g * 1.01, col.b * 0.92);
        col += vec3(0.014, 0.008, -0.006) * (1.0 - smoothstep(0.2, 0.9, luma));
        col = mix(col, smoothstep(0.0, 1.0, col), clamp(uContrast + 0.05, 0.0, 0.38));
      } else if (uGradeMode >= 2.5 && uGradeMode < 3.5) {
        // 3: Cool GT Telemetry
        col = vec3(col.r * 0.94, col.g * 0.99, col.b * 1.08);
        col = mix(vec3(luma), col, 1.07);
        col = mix(col, smoothstep(0.0, 1.0, col), clamp(uContrast + 0.06, 0.0, 0.38));
      } else if (uGradeMode >= 3.5) {
        // 4: Noir High Contrast
        col = mix(vec3(luma), col, 0.42);
        col = mix(col, smoothstep(0.0, 1.0, col), clamp(uContrast + 0.24, 0.0, 0.52));
      } else {
        // 0: Natural photoreal motorsport + GTA V Vinewood sunset warmth contrast
        col = mix(vec3(luma), col, 1.08);
        col = mix(col, smoothstep(0.0, 1.0, col), clamp(uContrast + 0.04, 0.0, 0.42));
      }

      // Highlight shoulder protection to avoid blown-out snow or sun-glitter clipping
      vec3 overHi = max(col - vec3(0.90), vec3(0.0));
      col = min(col, vec3(0.90)) + overHi / (vec3(1.0) + overHi * 1.42);

      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }
  `,
};

const DRIVING_CAMERA_ORDER: DrivingCameraMode[] = [
  'chase',
  'chaseFar',
  'cockpit',
  'windshield',
  'hood',
  'bumper',
];

const _flyPos = new THREE.Vector3();
const _flyTarget = new THREE.Vector3();
const _cctvPos = new THREE.Vector3();
const _cctvTarget = new THREE.Vector3();
const _chaseCarPos = new THREE.Vector3();
const _chaseTan = new THREE.Vector3();
const _chaseRight = new THREE.Vector3();
const _sunDirScratch = new THREE.Vector3();
const _sunCamFwdScratch = new THREE.Vector3();
const _sunProjScratch = new THREE.Vector3();
const _sunWarmFallback = new THREE.Color(0xffbe78);
const _chaseUp = new THREE.Vector3();
const _driveDesiredPos = new THREE.Vector3();
const _driveDesiredLook = new THREE.Vector3();
const _chaseVelDir = new THREE.Vector3();
const _chaseBlendDir = new THREE.Vector3();
const _wpPlaneNormal = new THREE.Vector3(0, 1, 0);
const _wpDragHit = new THREE.Vector3();
const _podiumCamPos = new THREE.Vector3();
const _podiumCamTarget = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();
const _fallbackCockpitEye = new THREE.Vector3(0, 0.85, 0.30);
const _fallbackWindshieldPos = new THREE.Vector3(0, 0.87, 1.18);
const _fallbackHoodPos = new THREE.Vector3(0, 1.04, 0.35);
const _fallbackBumperPos = new THREE.Vector3(0, 0.50, 2.25);
const _cockpitSpringEuler = new THREE.Euler();
const _cockpitSpringQuat = new THREE.Quaternion();
const _cockpitCamUp = new THREE.Vector3();
const _cockpitLocalLook = new THREE.Vector3();
const _introCamPos = new THREE.Vector3();
const _introCamLook = new THREE.Vector3();
const _podiumParkQuat = new THREE.Quaternion();
const _podiumFwd = new THREE.Vector3();
const _podiumRight = new THREE.Vector3();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _streamCamFwdScratch = new THREE.Vector3();
const _streamFocusScratch = new THREE.Vector3();
const _replayCamPos = new THREE.Vector3();
const _replayCamTarget = new THREE.Vector3();
const _replayLocalEye = new THREE.Vector3();
const _replayOrbitDelta = new THREE.Vector3();
const _replayPrevCarPos = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function getCircuitMetrics(): CircuitMetrics {
  const c = getCircuitData();
  return {
    lengthKm: (c.totalLength / 1000).toFixed(2),
    roadWidthM: Number(c.roadWidth.toFixed(1)),
    elevationDeltaM: Math.round(c.maxElevation - c.minElevation),
  };
}

let cachedMinimap: MinimapData | null = null;
export function getCircuitMinimapData(): MinimapData {
  if (cachedMinimap) return cachedMinimap;
  const c = getCircuitData();
  const samples = c.samples;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    const p = samples[i].position;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const pad = 26;
  minX -= pad;
  maxX += pad;
  minZ -= pad;
  maxZ += pad;

  const pts: string[] = [];
  const step = 10;
  for (let i = 0; i < samples.length; i += step) {
    const p = samples[i].position;
    pts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  }
  pts.push('Z');

  const sfT = samples[c.startFinishIndex].t;
  const sf = c.sampleAtT(sfT);
  const s1 = c.sampleAtT((sfT + 0.3333) % 1);
  const s2 = c.sampleAtT((sfT + 0.6667) % 1);

  cachedMinimap = {
    svgPath: pts.join(' '),
    minX,
    maxX,
    minZ,
    maxZ,
    startX: sf.position.x,
    startZ: sf.position.z,
    sector1X: s1.position.x,
    sector1Z: s1.position.z,
    sector2X: s2.position.x,
    sector2Z: s2.position.z,
  };
  return cachedMinimap;
}

export function mountTerrainScene(
  container: HTMLElement,
  callbacks: {
    onContextLost: (lost: boolean) => void;
    onUserInterrupt: () => void;
    onSolarSync: (angleDeg: number, phaseLabel: string) => void;
    onCctvStationSync?: (stationIndex: number) => void;
    onCarLoadProgress?: (pct: number, ready: boolean) => void;
    onTelemetry?: (tlm: VehicleTelemetry) => void;
    onPreRaceIntroSync?: (active: boolean) => void;
    onDrivingCameraSync?: (cam: DrivingCameraMode) => void;
    onWaypointSelected?: (wpIndex: number) => void;
    onWaypointDragged?: (wpIndex: number, dx: number, dz: number) => void;
    onRaceFinished?: (tlm: VehicleTelemetry) => void;
    onReplayStateSync?: (state: ReplayUiState) => void;
    onReplayAvailable?: (available: boolean) => void;
    onDriverAnalyticsCommit?: (acc: AnalyticsSessionAccumulator) => void;
    onEngineerCaption?: (caption: EngineerRadioCaption | null) => void;
    onPauseRequest?: () => void;
    onPerformanceUpdate?: (snap: PerformanceSnapshot) => void;
    onWeatherTelemetry?: (state: ContinuousWeatherState) => void;
    onCockpitDialsSync?: (dials: CockpitDialState) => void;
    onPitStrategySync?: (strategy: PitStrategyPlan) => void;
    onHeadlightsSync?: (on: boolean) => void;
    onPhotoStateSync?: (state: PhotoModeState) => void;
    onQualityAutoAdjust?: (quality: GraphicsQuality) => void;
    onStudioPropSelected?: (propId: string | null) => void;
    onStudioPropTransformLive?: (
      propId: string,
      patch: {
        x: number;
        y: number;
        z: number;
        rotX: number;
        rotY: number;
        rotZ: number;
        scaleX: number;
        scaleY: number;
        scaleZ: number;
      },
    ) => void;
    onStudioPropTransformCommit?: (
      propId: string,
      patch: {
        x: number;
        y: number;
        z: number;
        rotX: number;
        rotY: number;
        rotZ: number;
        scaleX: number;
        scaleY: number;
        scaleZ: number;
      },
    ) => void;
    onStudioPlacePropAt?: (x: number, y: number, z: number) => void;
    onStudioTerrainBrushHit?: (x: number, y: number, z: number, isDragStroke: boolean) => void;
    onStudioTerrainBrushEnd?: () => void;
    onStudioControlPointSelected?: (ptIndex: number) => void;
    onStudioControlPointMoved?: (
      ptIndex: number,
      pos: { x: number; y: number; z: number },
      commit: boolean,
    ) => void;
    onError: (msg: string) => void;
    initialGraphicsQuality?: GraphicsQuality;
    initialShadowQuality?: ShadowQualityOption;
    initialTextureSize?: TextureSizeOption;
    initialRenderScale?: RenderScaleOption;
    isTouchDevice?: boolean;
    startupBenchmarkPinned?: boolean;
  },
): SceneControllerAPI {
  const isSoftwareGl = detectSoftwareWebGL();
  let renderer: THREE.WebGLRenderer;
  const profiler = new MainLoopProfiler();

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
  } catch {
    callbacks.onError('WebGL2 hardware or software rendering is unavailable in this browser.');
    return {
      setAppMode: () => {},
      setSelectedCar: () => {},
      getSelectedCar: () => 'bmw-m4-gt3-evo',
      setGarageCarAvailable: () => {},
      setGarageCameraPreset: () => {},
      setRaceConfig: () => {},
      startNewRace: () => {},
      skipPreRaceIntro: () => {},
      resetCarToTrack: () => {},
      setPaused: () => {},
      setBackgroundFrozen: () => {},
      setDrivingCamera: () => {},
      cycleDrivingCamera: () => 'chase',
      setAssists: () => {},
      setCarSetup: () => {},
      setVisualCustomization: () => {},
      setTestMode: () => {},
      setCockpitDials: () => {},
      setPitStrategy: () => {},
      setAdvancedTelemetryEnabled: () => {},
      exportTelemetryCsv: () => ({ csv: '', sampleCount: 0 }),
      setAudioConfig: () => {},
      setSurfaceAudioEnabled: () => {},
      unlockAudio: () => {},
      setStartupBenchmarkPinned: () => {},
      toggleHeadlights: () => false,
      setHeadlightsEnabled: () => false,
      toggleActiveAero: () => false,
      setAeroDeployed: () => {},
      setGarageAeroPreview: () => {},
      setMobileInput: () => {},
      shiftUp: () => {},
      shiftDown: () => {},
      returnToDriveCamera: () => {},
      setCameraPreset: () => {},
      setFlyoverActive: () => {},
      getCctvStations: () => [],
      setCctvEnabled: () => {},
      setCctvStationIndex: () => {},
      setCctvAutoSwitch: () => {},
      setPodiumCameraAngle: () => {},
      setSolarAngle: () => 'Golden Hour',
      setAutoCycle: () => {},
      setHazePreset: () => {},
      setWeatherPreset: () => {},
      setSnowAtmosphere: () => ({ solarAngleDeg: 34, phaseLabel: 'Daylight' }),
      setInspectMode: () => {},
      setPostFxEnabled: () => {},
      setGraphicsQuality: () => {},
      setShadowQuality: () => {},
      setTextureSize: () => {},
      setRenderScale: () => {},
      setCinematicSettings: () => {},
      setSelectedWaypoint: () => {},
      setSelectedBlueprintNode: () => {},
      focusStudioCameraOnNode: () => {},
      snapPointToRoad: () => null,
      setCustomMapCameraMode: () => {},
      previewMapCustomization: () => {},
      applyMapCustomization: () => getCircuitMetrics(),
      loadCustomBlueprint: () => getCircuitMetrics(),
      setCustomMapBuilderPickMode: () => {},
      setStudioToolMode: () => {},
      setStudioTransformConfig: () => {},
      syncSelectedBuilderProp: () => {},
      focusStudioCameraOnProp: () => {},
      getStudioCameraTarget: () => ({ x: 0, y: 20, z: 0 }),
      updateCustomTerrainMaterialPreview: () => {},
      updateCustomTerrainGeometryFast: () => {},
      raycastTrackWorld: () => null,
      setMultiplayerCollisionEnabled: () => {},
      syncRemotePlayerPose: () => {},
      removeRemotePlayer: () => {},
      clearRemotePlayers: () => {},
      getLocalMultiplayerPose: (userId, username, carId, paintHex) => ({
        userId,
        username,
        carId,
        paintHex,
        x: 0,
        y: 0,
        z: 0,
        headingRad: 0,
        pitchRad: 0,
        rollRad: 0,
        steerNorm: 0,
        speedMps: 0,
        throttle: 0,
        braking: false,
        headlightsOn: false,
        hornActive: false,
        lap: 1,
        trackT: 0,
        totalProgress: 0,
        finished: false,
        finishTimeMs: null,
        bestLapMs: null,
        driftScore: 0,
        timestamp: Date.now(),
      }),
      setActiveMap: () => getCircuitMetrics(),
      prewarmMap: () => {},
      getActiveMap: () => getActiveMapId(),
      setTougeDirection: () => getCircuitMetrics(),
      getTougeDirection: () => getTougeDirection(),
      setGhostMode: () => {},
      getGhostMode: () => 'off',
      setAutoManageResources: () => {},
      purgeUnusedResources: () => {},
      getPerformanceSnapshot: () => ({
        fps: 60,
        avgFrameMs: 16.6,
        p95FrameMs: 16.6,
        physicsMs: 0,
        worldMs: 0,
        renderMs: 0,
        uiSyncMs: 0,
        drawCalls: 0,
        triangles: 0,
        geometries: 0,
        textures: 0,
        programs: 0,
        pooledCars: 0,
        lastTransitionLabel: 'Unavailable',
        lastTransitionMs: 0,
        recentSpikes: [],
        autoManageEnabled: true,
        autoThrottleLevel: 0,
        drsScale: 1,
        effectiveDpr: 1,
        activeMapId: getActiveMapId(),
      }),
      setPhotoMode: () => ({
        active: false,
        viewMode: 'drone',
        carFrozen: true,
        fovDeg: 42,
        rollDeg: 0,
        moveSpeed: 8.5,
      }),
      cyclePhotoView: () => ({
        active: false,
        viewMode: 'drone',
        carFrozen: true,
        fovDeg: 42,
        rollDeg: 0,
        moveSpeed: 8.5,
      }),
      setPhotoViewMode: () => ({
        active: false,
        viewMode: 'drone',
        carFrozen: true,
        fovDeg: 42,
        rollDeg: 0,
        moveSpeed: 8.5,
      }),
      setPhotoCarFrozen: () => ({
        active: false,
        viewMode: 'drone',
        carFrozen: true,
        fovDeg: 42,
        rollDeg: 0,
        moveSpeed: 8.5,
      }),
      setPhotoLens: () => ({
        active: false,
        viewMode: 'drone',
        carFrozen: true,
        fovDeg: 42,
        rollDeg: 0,
        moveSpeed: 8.5,
      }),
      resetPhotoCamera: () => ({
        active: false,
        viewMode: 'drone',
        carFrozen: true,
        fovDeg: 42,
        rollDeg: 0,
        moveSpeed: 8.5,
      }),
      setPhotoMoveInput: () => {},
      captureCleanScreenshot: () => '',
      hasLastReplay: () => false,
      getLastReplayMeta: () => null,
      startReplay: () => false,
      exitReplay: () => {},
      setReplayPlaying: () => {},
      seekReplayMs: () => {},
      stepReplayFrames: () => {},
      setReplaySpeed: () => {},
      setReplayCameraMode: () => {},
      setReplayCctvStationIndex: () => {},
      dispose: () => {},
    };
  }

  let graphicsQuality: GraphicsQuality = isSoftwareGl
    ? 'low'
    : callbacks.initialGraphicsQuality ?? (callbacks.isTouchDevice ? 'low' : 'recommended');
  let shadowQualityOpt: ShadowQualityOption = isSoftwareGl
    ? 'off'
    : (callbacks.initialShadowQuality ?? getDefaultShadowQualityForPreset(graphicsQuality));
  let textureSizeOpt: TextureSizeOption = isSoftwareGl
    ? '512'
    : (callbacks.initialTextureSize ?? getDefaultTextureSizeForPreset(graphicsQuality));
  let renderScaleOpt: RenderScaleOption = isSoftwareGl
    ? 'fast'
    : (callbacks.initialRenderScale ?? getDefaultRenderScaleForPreset(graphicsQuality));
  let graphicsInitialized = true;
  let userPinnedQuality = Boolean(callbacks.startupBenchmarkPinned);
  let composerBroken = false;
  const toSubQualityTier = (q: GraphicsQuality): 'performance' | 'balanced' | 'ultra' =>
    q === 'low' || q === 'recommended' || q === 'balanced'
      ? 'performance'
      : q === 'medium' || q === 'high'
      ? 'balanced'
      : 'ultra';
  const getTextureTierForOption = (): 'performance' | 'balanced' | 'ultra' =>
    textureSizeOpt === '512' ? 'performance' : textureSizeOpt === '1024' ? 'balanced' : 'ultra';
  const getUserAssetBudgetFor = (q: GraphicsQuality): UserAssetBudgetMode =>
    isSoftwareGl || q === 'low' || Boolean(callbacks.isTouchDevice)
      ? 'minimal'
      : q === 'recommended' || q === 'balanced'
      ? 'compact'
      : 'full';
  setUserAssetBudgetMode(getUserAssetBudgetFor(graphicsQuality));
  const isComposerQuality = (q: GraphicsQuality): boolean =>
    !isSoftwareGl && (q === 'medium' || q === 'high' || q === 'max' || q === 'ultra');
  const getKestrelTerrainSegs = (q: GraphicsQuality): number =>
    isSoftwareGl || q === 'low'
      ? 144
      : q === 'recommended'
      ? 164
      : q === 'balanced'
      ? 216
      : q === 'medium' || q === 'high'
      ? 260
      : 320;
  const getShadowMapDimForOption = (opt: ShadowQualityOption): number =>
    opt === 'off' ? 0 : opt === 'low' ? 512 : opt === 'medium' ? 1024 : 2048;
  const getDprCap = (q: GraphicsQuality) => {
    if (isSoftwareGl) return 1;
    const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (renderScaleOpt === 'fast') {
      return Math.max(0.75, Math.min(rawDpr * 0.8, 1.0));
    }
    if (renderScaleOpt === 'balanced') {
      return Math.max(0.9, Math.min(rawDpr, callbacks.isTouchDevice ? 1.0 : 1.15));
    }
    if (callbacks.isTouchDevice) {
      if (q === 'low') return 1;
      if (q === 'recommended') return Math.max(1, Math.min(rawDpr, 1.25));
      if (q === 'balanced') return Math.max(1, Math.min(rawDpr, 1.35));
      return Math.max(1, Math.min(rawDpr, 1.5));
    }
    if (q === 'low') return 1;
    if (q === 'recommended') return Math.max(1, Math.min(rawDpr, 1.25));
    if (q === 'balanced') return Math.max(1, Math.min(rawDpr, 1.5));
    return Math.max(1, Math.min(rawDpr, 2.0));
  };
  const getFogScaleForQuality = (q: GraphicsQuality): number =>
    q === 'low'
      ? 0.95
      : q === 'recommended'
      ? 1.12
      : q === 'balanced'
      ? 1.05
      : q === 'medium'
      ? 0.96
      : q === 'high'
      ? 0.92
      : q === 'max'
      ? 0.88
      : 0.85;
  const getChunkStreamRadius = (q: GraphicsQuality): number =>
    q === 'low'
      ? 580
      : q === 'recommended'
      ? 680
      : q === 'balanced'
      ? 780
      : q === 'medium'
      ? 880
      : q === 'high'
      ? 960
      : q === 'max'
      ? 1080
      : 1150;

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  const initialDpr = getDprCap(graphicsQuality);
  profiler.setEffectiveDpr(initialDpr);
  renderer.setPixelRatio(initialDpr);
  renderer.setSize(
    container.clientWidth || window.innerWidth,
    container.clientHeight || window.innerHeight,
  );
  renderer.shadowMap.enabled = !isSoftwareGl && shadowQualityOpt !== 'off';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  const initialVantage = getActiveVantage('overview');
  // 1. Track Scene & Cameras
  const trackScene = new THREE.Scene();
  const trackCamera = new THREE.PerspectiveCamera(52, width / height, 0.5, 4200);
  trackCamera.position.copy(initialVantage.position);

  const trackControls = new OrbitControls(trackCamera, renderer.domElement);
  trackControls.target.copy(initialVantage.target);
  trackControls.enableDamping = !isSoftwareGl;
  trackControls.dampingFactor = 0.065;
  trackControls.minDistance = 8;
  trackControls.maxDistance = 1450;
  trackControls.maxPolarAngle = Math.PI * 0.485;
  trackControls.enabled = false;
  trackControls.update();

  // 2. Garage Showroom Scene & Camera
  const garageStage = buildGarageStage(renderer, isSoftwareGl, graphicsQuality);
  garageStage.setShadowQuality(shadowQualityOpt);
  const garageCamera = new THREE.PerspectiveCamera(38, width / height, 0.15, 120);
  garageCamera.position.set(4.6, 1.55, 4.9);

  const garageControls = new OrbitControls(garageCamera, renderer.domElement);
  garageControls.target.set(0, 0.58, 0.1);
  garageControls.enablePan = false;
  garageControls.enableDamping = !isSoftwareGl;
  garageControls.dampingFactor = 0.07;
  garageControls.minDistance = 3.2;
  garageControls.maxDistance = 8.6;
  garageControls.minPolarAngle = 0.25;
  garageControls.maxPolarAngle = Math.PI * 0.47;
  garageControls.update();

  // 3. Build Active Map 3D World (Defer procedural track textures until Track/Rivals/Preview builds)
  worldColliders.resetAll();
  let textures: ProceduralTextureSuite | null = null;
  const getTextures = (): ProceduralTextureSuite => {
    if (!textures) {
      textures = createProceduralTextureSuite(
        renderer.capabilities.getMaxAnisotropy(),
        renderer.capabilities.maxTextureSize,
        isSoftwareGl,
        getTextureTierForOption(),
      );
    }
    return textures;
  };
  const skyRig = buildSkyAndLightingRig(trackScene, renderer, isSoftwareGl);
  skyRig.setShadowsEnabled(!isSoftwareGl && shadowQualityOpt !== 'off');
  if (shadowQualityOpt !== 'off') {
    skyRig.setShadowQuality(getShadowMapDimForOption(shadowQualityOpt));
  }
  skyRig.setPerformanceFogScale(getFogScaleForQuality(graphicsQuality));
  const weatherUniforms = skyRig.getWeatherUniforms();
  const initMapId = getActiveMapId();
  let currentBuiltMapId: MapId | null = null;
  let trackWorldInitialized = false;

  interface MapWorldCacheEntry {
    terrainRig: ReturnType<typeof buildTerrainRig>;
    roadRig: ReturnType<typeof buildRoadAndBridgeRig>;
    landmarksRig: ReturnType<typeof buildLandmarksAndCampusRig>;
    propsRig: ReturnType<typeof buildPropsAndFoliageRig>;
    flagMarshalsRig: ReturnType<typeof buildFlagMarshalsRig>;
    cctvRig: ReturnType<typeof buildCctvAndPaceRig>;
    colliderSnapshot: ReturnType<typeof worldColliders.exportSnapshot>;
    grandstandPos: THREE.Vector3 | null;
    builtGraphicsQuality: GraphicsQuality;
    customRevisionKey: string;
  }

  const mapRigCache = new Map<MapId, MapWorldCacheEntry>();

  const getCustomRevisionKey = (mapId: MapId): string => {
    const bp = getCustomBlueprint();
    const bpKey = bp
      ? `${bp.id}:${bp.updatedAt}:${bp.templateId}:${bp.baseplateTheme ?? 'studio_grid'}:${bp.roadSurfaceTheme ?? 'gp_asphalt'}:${bp.kerbTheme ?? 'fia_red_white'}:${bp.autoTunnels !== false}:${bp.controlPoints.length}:${bp.terrainStamps.length}:${bp.roadWidth}`
      : 'official';
    return `${JSON.stringify(getCircuitCustomization(mapId))}|${bpKey}`;
  };

  const MAX_MAP_RIG_CACHE = isSoftwareGl || Boolean(callbacks.isTouchDevice) ? 1 : 2;
  const trimMapRigCache = (preserveKey?: MapId) => {
    for (const [k, v] of mapRigCache.entries()) {
      if (mapRigCache.size <= MAX_MAP_RIG_CACHE) break;
      if (k === preserveKey) continue;
      disposeMapCacheEntry(v);
      mapRigCache.delete(k);
    }
  };

  const disposeMapCacheEntry = (entry: MapWorldCacheEntry) => {
    entry.terrainRig.dispose();
    entry.roadRig.dispose();
    entry.landmarksRig.dispose();
    entry.propsRig.dispose();
    entry.flagMarshalsRig.dispose();
    entry.cctvRig.dispose();
  };

  const buildEmptyLandmarksStub = (): ReturnType<typeof buildLandmarksAndCampusRig> => ({
    group: new THREE.Group(),
    update: () => {},
    setNightFactor: () => {},
    setWireframe: () => {},
    getGrandstandWorldPos: () => null,
    dispose: () => {},
  });

  const buildEmptyPropsStub = (): ReturnType<typeof buildPropsAndFoliageRig> => ({
    group: new THREE.Group(),
    setNightFactor: () => {},
    updateVisibilityWindow: () => {},
    setGraphicsQuality: () => {},
    setFoliageDensity: () => {},
    dispose: () => {},
  });

  const buildRigsForMapId = (targetMapId: MapId, withCctv: boolean) => {
    const texSuite = getTextures();
    const meta = MAP_REGISTRY[targetMapId];
    texSuite.setCircuitBranding?.(meta.name, meta.region, meta.accentHex);
    const activeBp = targetMapId === 'aurelia_ridge' ? getCustomBlueprint() : null;
    const isBaseplateStudio = Boolean(activeBp && activeBp.templateId !== 'aurelia_remix');
    beginTerrainHeightCache();
    try {
      const tRig =
        targetMapId === 'coral_bay'
          ? buildCoralBayTerrainRig(texSuite, weatherUniforms, skyRig.getMistUniforms(), isSoftwareGl)
          : targetMapId === 'frostpeak_pass'
          ? buildFrostpeakTerrainRig(texSuite, weatherUniforms, skyRig.getMistUniforms(), isSoftwareGl)
          : targetMapId === 'kestrel_peaks'
          ? buildKestrelTerrainRig(
              texSuite,
              weatherUniforms,
              skyRig.getMistUniforms(),
              isSoftwareGl,
              getKestrelTerrainSegs(graphicsQuality),
            )
          : buildTerrainRig(texSuite, skyRig.getMistUniforms(), isSoftwareGl, weatherUniforms);
      const rRig =
        targetMapId === 'kestrel_peaks'
          ? buildKestrelRoadAndBridgeRig(texSuite, weatherUniforms)
          : buildRoadAndBridgeRig(texSuite, weatherUniforms);
      const lRig =
        targetMapId === 'coral_bay'
          ? buildCoralBayLandmarksRig(texSuite, weatherUniforms)
          : targetMapId === 'frostpeak_pass'
          ? buildFrostpeakLandmarksRig(texSuite, weatherUniforms)
          : targetMapId === 'kestrel_peaks'
          ? buildKestrelLandmarksRig(texSuite, weatherUniforms)
          : isBaseplateStudio
          ? buildEmptyLandmarksStub()
          : buildLandmarksAndCampusRig(texSuite, weatherUniforms);
      const pRig =
        targetMapId === 'coral_bay'
          ? buildCoralBayPropsAndFoliageRig(texSuite, weatherUniforms)
          : targetMapId === 'frostpeak_pass'
          ? buildFrostpeakPropsAndFoliageRig(texSuite, weatherUniforms)
          : targetMapId === 'kestrel_peaks'
          ? buildKestrelPropsAndFoliageRig(texSuite, weatherUniforms)
          : isBaseplateStudio
          ? buildEmptyPropsStub()
          : buildPropsAndFoliageRig(texSuite, weatherUniforms);
      pRig.setGraphicsQuality(toSubQualityTier(graphicsQuality));
      const fRig = buildFlagMarshalsRig(weatherUniforms);
      const cRig = withCctv ? buildCctvAndPaceRig(texSuite, weatherUniforms) : null;
      return { tRig, rRig, lRig, pRig, fRig, cRig };
    } finally {
      endTerrainHeightCache();
    }
  };

  const buildEmptyTerrainStub = (): ReturnType<typeof buildTerrainRig> => ({
    group: new THREE.Group(),
    terrainMesh: new THREE.Mesh(),
    skirtMesh: new THREE.Mesh(),
    waterMesh: new THREE.Mesh(),
    updateWater: () => {},
    setInspectMode: () => {},
    dispose: () => {},
  });

  const buildEmptyRoadStub = (): ReturnType<typeof buildRoadAndBridgeRig> => ({
    group: new THREE.Group(),
    setWireframe: () => {},
    setNightFactor: () => {},
    setRubberLevel: () => {},
    dispose: () => {},
  });

  const buildEmptyFlagMarshalsStub = (): ReturnType<typeof buildFlagMarshalsRig> => ({
    group: new THREE.Group(),
    update: () => {},
    setWireframe: () => {},
    dispose: () => {},
  });

  const buildEmptyCctvStub = (): ReturnType<typeof buildCctvAndPaceRig> => ({
    group: new THREE.Group(),
    attachCar: () => {},
    getCarRoot: () => null,
    applyPlayerState: () => {},
    emitCollisionSparks: () => {},
    getStations: () => [],
    getStationCount: () => 0,
    getNearestStationIndex: () => 0,
    getActiveViewPose: () => {},
    getChaseViewPose: () => {},
    update: () => {},
    setPlayerControlled: () => {},
    setCarVisible: () => {},
    setNightFactor: () => {},
    setWireframe: () => {},
    refreshCircuit: () => {},
    dispose: () => {},
  });

  // Boot directly into the Garage with lightweight stubs; full world builds strictly on demand.
  let terrainRig: ReturnType<typeof buildTerrainRig> = buildEmptyTerrainStub();
  let roadRig: ReturnType<typeof buildRoadAndBridgeRig> = buildEmptyRoadStub();
  let landmarksRig: ReturnType<typeof buildLandmarksAndCampusRig> = buildEmptyLandmarksStub();
  let propsRig: ReturnType<typeof buildPropsAndFoliageRig> = buildEmptyPropsStub();
  let flagMarshalsRig: ReturnType<typeof buildFlagMarshalsRig> = buildEmptyFlagMarshalsStub();
  let cctvRig: ReturnType<typeof buildCctvAndPaceRig> = buildEmptyCctvStub();
  const aiRivalsRig = buildAiRivalsRig(() => textures?.mistSpriteAlbedo ?? null);
  const podiumRig = buildPodiumCeremonyRig();
  let selectedBuilderPropId: string | null = null;
  let builderPickMode = false;
  let customPropsRig = buildCustomPropsRig(null, true, null);

  const applySurfaceLookFromConfig = (cfg: MapCustomizationConfig) => {
    roadRig.setAsphaltWear?.(clamp(cfg.asphaltWear ?? 0.35, 0, 1));
    propsRig.setFoliageDensity?.(clamp(cfg.foliageDensity ?? 1.0, 0.35, 1.25));
    terrainRig.setSurfaceLook?.({
      waterChop: clamp(cfg.waterChop ?? 0.45, 0, 1),
      waterClarity: clamp(cfg.waterClarity ?? 0.65, 0, 1),
      snowSheen: clamp(cfg.snowSheen ?? 0.65, 0, 1),
    });
  };

  let cachedGrandstandPos: THREE.Vector3 | null = null;

  trackScene.add(terrainRig.group);
  trackScene.add(roadRig.group);
  trackScene.add(landmarksRig.group);
  trackScene.add(propsRig.group);
  trackScene.add(flagMarshalsRig.group);
  trackScene.add(cctvRig.group);
  trackScene.add(aiRivalsRig.group);
  trackScene.add(podiumRig.group);
  trackScene.add(customPropsRig.group);

  // 3A. Roblox Studio-Style 3D Selection BoxHelper, TransformControls Gizmo & Terrain Brush Ring
  let studioToolMode: StudioToolMode = 'select';
  let studioTransformSpace: 'world' | 'local' = 'world';
  let studioSnapMove = 1;
  let studioSnapRotateDeg = 15;
  let studioSnapScale = 0.1;
  let studioBrushRadius = 40;
  let isGizmoDragging = false;
  let isTerrainBrushing = false;
  let lastBrushWorldX = 0;
  let lastBrushWorldZ = 0;
  const _gizmoEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  const selectionBoxHelper = new THREE.BoxHelper(new THREE.Object3D(), 0x38bdf8);
  selectionBoxHelper.visible = false;
  (selectionBoxHelper.material as THREE.LineBasicMaterial).depthTest = false;
  selectionBoxHelper.renderOrder = 999;
  trackScene.add(selectionBoxHelper);

  const brushRingGeo = new THREE.RingGeometry(0.92, 1.0, 48);
  brushRingGeo.rotateX(-Math.PI * 0.5);
  const brushRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
    depthTest: false,
  });
  const brushRingMesh = new THREE.Mesh(brushRingGeo, brushRingMat);
  brushRingMesh.visible = false;
  brushRingMesh.renderOrder = 998;
  trackScene.add(brushRingMesh);

  const transformControls = new TransformControls(trackCamera, renderer.domElement);
  const transformGizmoHelper = transformControls.getHelper();
  transformGizmoHelper.visible = false;
  trackScene.add(transformGizmoHelper);

  const extractHolderTransformPatch = (holder: THREE.Object3D) => {
    _gizmoEuler.setFromQuaternion(holder.quaternion, 'YXZ');
    return {
      x: Number(holder.position.x.toFixed(2)),
      y: Number(holder.position.y.toFixed(2)),
      z: Number(holder.position.z.toFixed(2)),
      rotX: Number(_gizmoEuler.x.toFixed(3)),
      rotY: Number(_gizmoEuler.y.toFixed(3)),
      rotZ: Number(_gizmoEuler.z.toFixed(3)),
      scaleX: Number(clamp(holder.scale.x, 0.2, 6.0).toFixed(2)),
      scaleY: Number(clamp(holder.scale.y, 0.2, 6.0).toFixed(2)),
      scaleZ: Number(clamp(holder.scale.z, 0.2, 6.0).toFixed(2)),
    };
  };

  let syncControlModesRef: (() => void) | null = null;
  const syncStudioGizmoAttachment = () => {
    const bp = getCustomBlueprint();
    const inStudioBp = appMode === 'custom_map' && Boolean(bp) && !isPaused;
    if (!inStudioBp || !bp) {
      selectionBoxHelper.visible = false;
      transformControls.detach();
      transformGizmoHelper.visible = false;
      brushRingMesh.visible = false;
      return;
    }

    const holder = selectedBuilderPropId
      ? customPropsRig.propGroupsById.get(selectedBuilderPropId)
      : undefined;
    const propData = selectedBuilderPropId
      ? bp.placedProps.find((p) => p.id === selectedBuilderPropId)
      : undefined;

    if (holder && propData) {
      selectionBoxHelper.setFromObject(holder);
      (selectionBoxHelper.material as THREE.LineBasicMaterial).color.setHex(
        propData.locked ? 0xf59e0b : 0x38bdf8,
      );
      selectionBoxHelper.visible = true;
    } else {
      selectionBoxHelper.visible = false;
    }

    const gizmoMode: 'translate' | 'scale' | 'rotate' | null =
      studioToolMode === 'move'
        ? 'translate'
        : studioToolMode === 'scale'
          ? 'scale'
          : studioToolMode === 'rotate'
            ? 'rotate'
            : null;
    if (holder && propData && !propData.locked && gizmoMode) {
      transformControls.setMode(gizmoMode);
      transformControls.setSpace(gizmoMode === 'scale' ? 'local' : studioTransformSpace);
      transformControls.setTranslationSnap(studioSnapMove > 0 ? studioSnapMove : null);
      transformControls.setRotationSnap(
        studioSnapRotateDeg > 0 ? THREE.MathUtils.degToRad(studioSnapRotateDeg) : null,
      );
      transformControls.setScaleSnap(studioSnapScale > 0 ? studioSnapScale : null);
      if (transformControls.object !== holder) {
        transformControls.attach(holder);
      }
      transformGizmoHelper.visible = true;
    } else {
      transformControls.detach();
      transformGizmoHelper.visible = false;
    }

    if (studioToolMode !== 'terrain') {
      brushRingMesh.visible = false;
    }
  };

  const onTransformDraggingChanged = (event: { value?: unknown }) => {
    isGizmoDragging = Boolean(event.value);
    syncControlModesRef?.();
    if (!isGizmoDragging && selectedBuilderPropId && transformControls.object) {
      const patch = extractHolderTransformPatch(transformControls.object);
      callbacks.onStudioPropTransformCommit?.(selectedBuilderPropId, patch);
    }
  };
  const onTransformObjectChange = () => {
    if (selectionBoxHelper.visible) {
      selectionBoxHelper.update();
    }
    if (isGizmoDragging && selectedBuilderPropId && transformControls.object) {
      const patch = extractHolderTransformPatch(transformControls.object);
      callbacks.onStudioPropTransformLive?.(selectedBuilderPropId, patch);
    }
  };
  transformControls.addEventListener('dragging-changed', onTransformDraggingChanged);
  transformControls.addEventListener('objectChange', onTransformObjectChange);

  // 3B. Interactive 3D Custom Map Waypoint Editor Markers & Live Spline Preview
  const waypointEditorGroup = new THREE.Group();
  waypointEditorGroup.name = 'CustomMapWaypointEditor';
  waypointEditorGroup.visible = false;
  trackScene.add(waypointEditorGroup);

  const wpPinDefaultMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const wpPinSelectedMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
  const wpPinGeos: THREE.BufferGeometry[] = [];
  const wpClickableMeshes: THREE.Mesh[] = [];
  const wpMarkers = new Map<number, { group: THREE.Group; cap: THREE.Mesh; ring: THREE.Mesh; grabOrb: THREE.Mesh }>();

  const pinConeGeo = new THREE.ConeGeometry(2.8, 5.4, 8);
  pinConeGeo.rotateX(Math.PI);
  const pinPoleGeo = new THREE.CylinderGeometry(0.32, 0.32, 12.2, 8);
  const pinRingGeo = new THREE.RingGeometry(3.6, 5.0, 24);
  pinRingGeo.rotateX(-Math.PI * 0.5);
  const pinGrabGeo = new THREE.SphereGeometry(3.0, 12, 10);
  wpPinGeos.push(pinConeGeo, pinPoleGeo, pinRingGeo, pinGrabGeo);

  let wpBuiltForBlueprintId: string | null = null;
  let wpBuiltForBlueprintCount = -1;

  const rebuildWaypointMarkers = () => {
    wpMarkers.forEach((entry) => {
      waypointEditorGroup.remove(entry.group);
    });
    wpMarkers.clear();
    wpClickableMeshes.length = 0;

    const bp = getCustomBlueprint();
    if (bp) {
      wpBuiltForBlueprintId = bp.id;
      wpBuiltForBlueprintCount = bp.controlPoints.length;
      for (let idx = 0; idx < bp.controlPoints.length; idx++) {
        const markerGrp = new THREE.Group();
        markerGrp.userData.blueprintNodeIndex = idx;

        const pole = new THREE.Mesh(pinPoleGeo, wpPinDefaultMat);
        pole.position.y = 6.1;
        pole.userData.blueprintNodeIndex = idx;

        const cap = new THREE.Mesh(pinConeGeo, wpPinDefaultMat);
        cap.position.y = 14.4;
        cap.userData.blueprintNodeIndex = idx;

        const ring = new THREE.Mesh(pinRingGeo, wpPinDefaultMat);
        ring.position.y = 0.65;
        ring.userData.blueprintNodeIndex = idx;

        const grabOrb = new THREE.Mesh(pinGrabGeo, wpPinDefaultMat);
        grabOrb.position.y = 9.2;
        grabOrb.visible = true;
        grabOrb.userData.blueprintNodeIndex = idx;

        markerGrp.add(pole, cap, ring, grabOrb);
        waypointEditorGroup.add(markerGrp);
        wpClickableMeshes.push(cap, pole, ring, grabOrb);
        wpMarkers.set(idx, { group: markerGrp, cap, ring, grabOrb });
      }
      return;
    }

    wpBuiltForBlueprintId = null;
    wpBuiltForBlueprintCount = -1;
    const editableList = getEditableWaypointsForActiveMap();
    for (const wpMeta of editableList) {
      const markerGrp = new THREE.Group();
      markerGrp.userData.waypointIndex = wpMeta.index;

      const pole = new THREE.Mesh(pinPoleGeo, wpPinDefaultMat);
      pole.position.y = 6.1;
      pole.userData.waypointIndex = wpMeta.index;

      const cap = new THREE.Mesh(pinConeGeo, wpPinDefaultMat);
      cap.position.y = 14.4;
      cap.userData.waypointIndex = wpMeta.index;

      const ring = new THREE.Mesh(pinRingGeo, wpPinDefaultMat);
      ring.position.y = 0.65;
      ring.userData.waypointIndex = wpMeta.index;

      const grabOrb = new THREE.Mesh(pinGrabGeo, wpPinDefaultMat);
      grabOrb.position.y = 9.2;
      grabOrb.visible = false;
      grabOrb.userData.waypointIndex = wpMeta.index;

      markerGrp.add(pole, cap, ring, grabOrb);
      waypointEditorGroup.add(markerGrp);
      wpClickableMeshes.push(cap, pole, ring, grabOrb);
      wpMarkers.set(wpMeta.index, { group: markerGrp, cap, ring, grabOrb });
    }
  };
  rebuildWaypointMarkers();

  const PREVIEW_STEPS = 190;
  const previewLinePositions = new Float32Array((PREVIEW_STEPS + 1) * 3);
  const previewLinePosAttr = new THREE.BufferAttribute(previewLinePositions, 3);
  previewLinePosAttr.setUsage(THREE.DynamicDrawUsage);
  const previewLineGeo = new THREE.BufferGeometry();
  previewLineGeo.setAttribute('position', previewLinePosAttr);
  const previewCtrlPts: THREE.Vector3[] = [];
  const previewLineMat = new THREE.LineBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.92,
  });
  const previewSplineLine = new THREE.Line(previewLineGeo, previewLineMat);
  previewSplineLine.visible = false;
  waypointEditorGroup.add(previewSplineLine);

  let appMode: AppScreenMode = 'garage';
  let selectedWaypointIdx: number | null = getEditableWaypointsForActiveMap()[0]?.index ?? 0;
  let draggingWaypointIdx: number | null = null;
  let selectedBlueprintNodeIdx: number | null = 0;
  let draggingBlueprintNodeIdx: number | null = null;
  let bpDragVerticalMode = false;
  let bpDragStartY = 20;
  let bpDragStartScreenY = 0;
  let latestPreviewCfg: MapCustomizationConfig | null = null;

  const syncBlueprintSplinePreviewLine = (bp: CustomMapBlueprint) => {
    if (bp.controlPoints.length < 2) {
      previewSplineLine.visible = false;
      return;
    }
    while (previewCtrlPts.length < bp.controlPoints.length) {
      previewCtrlPts.push(new THREE.Vector3());
    }
    previewCtrlPts.length = bp.controlPoints.length;
    for (let i = 0; i < bp.controlPoints.length; i++) {
      const p = bp.controlPoints[i];
      previewCtrlPts[i].set(p.x, p.y + 1.8, p.z);
    }
    const previewCurve = new THREE.CatmullRomCurve3(
      previewCtrlPts,
      bp.closedLoop,
      'catmullrom',
      clamp(bp.splineTension ?? 0.45, 0.15, 0.75),
    );
    for (let i = 0; i <= PREVIEW_STEPS; i++) {
      previewCurve.getPointAt(i / PREVIEW_STEPS, _tmpVec);
      const b = i * 3;
      previewLinePositions[b] = _tmpVec.x;
      previewLinePositions[b + 1] = _tmpVec.y;
      previewLinePositions[b + 2] = _tmpVec.z;
    }
    previewLinePosAttr.needsUpdate = true;
    previewSplineLine.visible = true;
  };

  const syncWaypointMarkerPositions = (previewCfg?: MapCustomizationConfig) => {
    const bp = getCustomBlueprint();
    if (bp) {
      if (wpBuiltForBlueprintId !== bp.id || wpBuiltForBlueprintCount !== bp.controlPoints.length) {
        rebuildWaypointMarkers();
      }
      for (let i = 0; i < bp.controlPoints.length; i++) {
        const entry = wpMarkers.get(i);
        const pt = bp.controlPoints[i];
        if (!entry || !pt) continue;
        entry.group.position.set(pt.x, pt.y + 0.4, pt.z);
        const isSel = selectedBlueprintNodeIdx === i;
        const mat = isSel ? wpPinSelectedMat : wpPinDefaultMat;
        entry.cap.material = mat;
        entry.ring.material = mat;
        entry.grabOrb.material = mat;
        entry.cap.scale.setScalar(isSel ? 1.42 : 1.0);
        entry.grabOrb.scale.setScalar(isSel ? 1.35 : 0.95);
      }
      syncBlueprintSplinePreviewLine(bp);
      return;
    }

    if (wpBuiltForBlueprintId !== null) {
      rebuildWaypointMarkers();
    }

    if (previewCfg) {
      latestPreviewCfg = {
        ...previewCfg,
        waypointOffsets: { ...previewCfg.waypointOffsets },
        waypointBanking: { ...previewCfg.waypointBanking },
      };
    } else if (previewCfg === undefined && appMode !== 'custom_map') {
      latestPreviewCfg = null;
    }

    const activeCfg = previewCfg ?? latestPreviewCfg;
    const circuit = getCircuitData();
    const cps = circuit.controlPoints;
    const appliedOffsets = getCircuitCustomization().waypointOffsets;
    const baseOffsets = activeCfg?.waypointOffsets ?? appliedOffsets;

    for (const wpMeta of getEditableWaypointsForActiveMap()) {
      const entry = wpMarkers.get(wpMeta.index);
      const pt = cps[wpMeta.index];
      if (!entry || !pt) continue;
      const off = activeCfg
        ? baseOffsets[wpMeta.index] ?? { dx: 0, dz: 0 }
        : { dx: 0, dz: 0 };
      const curOff = activeCfg ? appliedOffsets[wpMeta.index] ?? { dx: 0, dz: 0 } : { dx: 0, dz: 0 };
      const worldX = pt.x + (activeCfg ? off.dx - curOff.dx : 0);
      const worldZ = pt.z + (activeCfg ? off.dz - curOff.dz : 0);
      entry.group.position.set(worldX, pt.y + 0.5, worldZ);

      const isSel = selectedWaypointIdx === wpMeta.index;
      const mat = isSel ? wpPinSelectedMat : wpPinDefaultMat;
      entry.cap.material = mat;
      entry.ring.material = mat;
      entry.cap.scale.setScalar(isSel ? 1.42 : 1.0);
    }

    if (activeCfg) {
      while (previewCtrlPts.length < cps.length) {
        previewCtrlPts.push(new THREE.Vector3());
      }
      previewCtrlPts.length = cps.length;
      for (let i = 0; i < cps.length; i++) {
        const p = cps[i];
        const curOff = appliedOffsets[i] ?? { dx: 0, dz: 0 };
        const tgtOff = activeCfg.waypointOffsets[i] ?? { dx: 0, dz: 0 };
        previewCtrlPts[i].set(
          p.x + (tgtOff.dx - curOff.dx),
          p.y + 2.4,
          p.z + (tgtOff.dz - curOff.dz),
        );
      }
      const previewCurve = new THREE.CatmullRomCurve3(
        previewCtrlPts,
        true,
        'catmullrom',
        clamp(activeCfg.splineTension ?? 0.45, 0.15, 0.75),
      );
      for (let i = 0; i <= PREVIEW_STEPS; i++) {
        previewCurve.getPointAt(i / PREVIEW_STEPS, _tmpVec);
        const b = i * 3;
        previewLinePositions[b] = _tmpVec.x;
        previewLinePositions[b + 1] = _tmpVec.y;
        previewLinePositions[b + 2] = _tmpVec.z;
      }
      previewLinePosAttr.needsUpdate = true;
      previewSplineLine.visible = true;
    } else {
      previewSplineLine.visible = false;
    }
  };
  syncWaypointMarkerPositions();

  // 4. Vehicle Physics, Procedural GT Audio & Race Engineer Radio
  const physics = new VehiclePhysicsEngine();
  const audio = new GtAudioEngine();
  audio.setLowCpuAudio(graphicsQuality === 'low');
  const engineerRadio = new RaceEngineerRadio();
  engineerRadio.setCaptionListener((cap) => {
    callbacks.onEngineerCaption?.(cap);
  });

  let currentRaceConfig: RaceConfig = {
    mode: 'sprint',
    lapCount: 20,
    difficulty: 'pro',
    targetStints: 2,
    strategyPreset: 'sprint',
  };
  let lastCountdownSec = 3.2;
  let lastBroadcastCountdownCeil = 4;
  let lastBroadcastGear = 1;
  let lastBroadcastPitStatus = 'on_track';
  let isBackgroundFrozen = false;
  let preRaceIntroSec = 0;
  let currentNightFactor = 0;
  let podiumCameraAngle: PodiumCameraAngle = 'auto';

  let assists: VehicleAssists = {
    autoGear: true,
    abs: true,
    tcs: true,
    steerSensitivity: 1.0,
    autoPitService: false,
    ffbIntensity: 0.75,
    physicsPreset: 'simcade',
    steeringGovernor: true,
    countersteerAssist: true,
    hillClimbAssist: true,
  };
  const keyInput: VehicleControlsInput = {
    throttle: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    handbrake: false,
    lookBack: false,
  };
  const mergedInput: VehicleControlsInput = {
    throttle: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    handbrake: false,
    lookBack: false,
    throttleVal: 0,
    brakeVal: 0,
    steerAxis: 0,
    handbrakeVal: 0,
  };
  let prevPadShiftUp = false;
  let prevPadShiftDown = false;
  let prevPadCam = false;
  let lastFfbSentAt = -1;

  let headlightsOn = false;
  let drivingCameraMode: DrivingCameraMode = 'chase';
  let isPaused = false;
  let garageAutoRotate = true;
  let garageAeroDeployedPreview = true;

  // 4A. Photography Mode Camera State (Free Walk/Drone, Orbit, Inside Car Interior, Hero Angles)
  const PHOTO_VIEW_ORDER: PhotoViewMode[] = ['drone', 'orbit', 'interior', 'front_low', 'rear_aero'];
  let photoModeActive = false;
  let photoViewMode: PhotoViewMode = 'drone';
  let photoCarFrozen = true;
  let photoFovDeg = 42;
  let photoRollDeg = 0;
  let photoMoveSpeed = 8.5;
  const photoCamPos = new THREE.Vector3();
  let photoYaw = 0;
  let photoPitch = 0;
  let photoOrbitYaw = 0.62;
  let photoOrbitPitch = 0.22;
  let photoOrbitDist = 5.0;
  const photoOrbitOffset = new THREE.Vector3();
  let photoSavedGarageFov = 38;
  let photoSavedGarageNear = 0.15;
  let photoDragActive = false;
  let photoDragButton = 0;
  let photoLastPointerX = 0;
  let photoLastPointerY = 0;
  let photoTouchId: number | null = null;
  let lastRainIntensityForPostFx = 0;
  const photoKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    fast: false,
    slow: false,
  };
  const photoTouchMove = {
    forward: 0,
    right: 0,
    up: 0,
    boost: false,
  };
  const _photoCarPos = new THREE.Vector3();
  const _photoCarQuat = new THREE.Quaternion();
  const _photoCarFwd = new THREE.Vector3();
  const _photoCarRight = new THREE.Vector3();
  const _photoCarUp = new THREE.Vector3();
  const _photoEyeLocal = new THREE.Vector3();
  const _photoCamFwd = new THREE.Vector3();
  const _photoCamRight = new THREE.Vector3();
  const _photoLookTarget = new THREE.Vector3();
  const _photoLocalScratch = new THREE.Vector3();
  const _photoInvQuat = new THREE.Quaternion();

  const getPhotoModeState = (): PhotoModeState => ({
    active: photoModeActive,
    viewMode: photoViewMode,
    carFrozen: photoCarFrozen,
    fovDeg: photoFovDeg,
    rollDeg: photoRollDeg,
    moveSpeed: photoMoveSpeed,
  });

  const emitPhotoState = (): PhotoModeState => {
    const snap = getPhotoModeState();
    callbacks.onPhotoStateSync?.(snap);
    return snap;
  };

  const getActivePhotoTarget = () => {
    const isGarageTarget = appMode === 'garage' && !isSpectatorMode();
    if (isGarageTarget) {
      garageStage.turntableGroup.updateWorldMatrix(true, false);
      garageStage.turntableGroup.getWorldPosition(_photoCarPos);
      garageStage.turntableGroup.getWorldQuaternion(_photoCarQuat);
      _photoCarFwd.set(0, 0, 1).applyQuaternion(_photoCarQuat).normalize();
      _photoCarRight.set(1, 0, 0).applyQuaternion(_photoCarQuat).normalize();
      _photoCarUp.set(0, 1, 0).applyQuaternion(_photoCarQuat).normalize();
      _photoEyeLocal.copy(garageCarInstance?.cockpitEyePos ?? _fallbackCockpitEye);
    } else {
      _photoCarPos.copy(physics.pos);
      _photoCarQuat.copy(physics.worldQuaternion);
      _photoCarFwd.copy(physics.forwardDir).normalize();
      _photoCarRight.copy(physics.rightDir).normalize();
      _photoCarUp.copy(physics.upDir).normalize();
      _photoEyeLocal.copy(trackCarInstance?.cockpitEyePos ?? _fallbackCockpitEye);
    }
    return isGarageTarget;
  };

  const seedPhotoViewPose = (view: PhotoViewMode, preserveFromActiveCam: boolean) => {
    const isGarageTarget = getActivePhotoTarget();
    const activeCam = isGarageTarget ? garageCamera : trackCamera;
    const carHeadingYaw = Math.atan2(_photoCarFwd.x, _photoCarFwd.z);

    if (view === 'drone') {
      if (preserveFromActiveCam) {
        photoCamPos.copy(activeCam.position);
        activeCam.getWorldDirection(_photoCamFwd);
        photoPitch = Math.asin(clamp(_photoCamFwd.y, -0.98, 0.98));
        photoYaw = Math.atan2(_photoCamFwd.x, _photoCamFwd.z);
      } else {
        const yaw = carHeadingYaw + 0.58;
        photoCamPos
          .copy(_photoCarPos)
          .addScaledVector(_photoCarFwd, 4.4)
          .addScaledVector(_photoCarRight, 2.5)
          .addScaledVector(_worldUp, 1.35);
        _photoLookTarget.copy(_photoCarPos).addScaledVector(_worldUp, 0.62);
        _photoCamFwd.copy(_photoLookTarget).sub(photoCamPos).normalize();
        photoPitch = Math.asin(clamp(_photoCamFwd.y, -0.98, 0.98));
        photoYaw = Math.atan2(_photoCamFwd.x, _photoCamFwd.z);
        void yaw;
      }
      if (!isGarageTarget) {
        const floorY = groundHeightAt(photoCamPos.x, photoCamPos.z) + 0.16;
        if (photoCamPos.y < floorY) photoCamPos.y = floorY;
      } else if (photoCamPos.y < 0.16) {
        photoCamPos.y = 0.16;
      }
    } else if (view === 'interior') {
      _photoLocalScratch.copy(_photoEyeLocal).applyQuaternion(_photoCarQuat).add(_photoCarPos);
      photoCamPos.copy(_photoLocalScratch);
      photoYaw = carHeadingYaw;
      photoPitch = Math.asin(clamp(_photoCarFwd.y, -0.5, 0.5)) - 0.04;
      photoFovDeg = 64;
    } else if (view === 'orbit') {
      photoOrbitOffset.set(0, 0, 0);
      if (preserveFromActiveCam) {
        _photoLookTarget.copy(_photoCarPos).addScaledVector(_worldUp, 0.62);
        _photoCamFwd.copy(activeCam.position).sub(_photoLookTarget);
        const dist = _photoCamFwd.length();
        if (dist >= 1.6 && dist <= 40) {
          photoOrbitDist = dist;
          photoOrbitPitch = clamp(Math.asin(clamp(_photoCamFwd.y / dist, -0.95, 0.95)), -0.18, 1.32);
          photoOrbitYaw = Math.atan2(_photoCamFwd.x, _photoCamFwd.z);
        } else {
          photoOrbitDist = 5.0;
          photoOrbitYaw = carHeadingYaw + 0.62;
          photoOrbitPitch = 0.22;
        }
      } else {
        photoOrbitDist = 5.0;
        photoOrbitYaw = carHeadingYaw + 0.62;
        photoOrbitPitch = 0.22;
      }
      if (photoFovDeg > 56) photoFovDeg = 42;
    } else if (view === 'front_low') {
      photoOrbitOffset.set(0, 0, 0);
      photoOrbitDist = 4.65;
      photoOrbitYaw = carHeadingYaw + 0.52;
      photoOrbitPitch = 0.05;
      photoFovDeg = 38;
    } else if (view === 'rear_aero') {
      photoOrbitOffset.set(0, 0, 0);
      photoOrbitDist = 4.75;
      photoOrbitYaw = carHeadingYaw + Math.PI - 0.48;
      photoOrbitPitch = 0.13;
      photoFovDeg = 40;
    }
  };

  const applyPhotoInteriorFlags = () => {
    const isInterior = photoModeActive && photoViewMode === 'interior';
    if (appMode === 'garage' && !isSpectatorMode()) {
      garageCarInstance?.setInteriorMode(isInterior);
    } else if (appMode === 'racing') {
      if (photoModeActive && photoCarFrozen) {
        trackCarInstance?.setInteriorMode(isInterior);
      } else {
        const drvInterior = drivingCameraMode === 'cockpit' || drivingCameraMode === 'windshield';
        trackCarInstance?.setInteriorMode(drvInterior);
      }
    }
  };

  const updatePhotoCamera = (deltaSec: number) => {
    const isGarageTarget = getActivePhotoTarget();
    const cam = isGarageTarget ? garageCamera : trackCamera;
    const isFrozenCam = photoCarFrozen || isGarageTarget;
    if (!isFrozenCam) return;

    applyPhotoInteriorFlags();

    if (isGarageTarget) {
      garageCamera.fov = clamp(photoFovDeg, 20, 95);
      garageCamera.near = 0.08;
      garageCamera.far = 140;
      garageCamera.updateProjectionMatrix();
    } else {
      syncTrackProjection(clamp(photoFovDeg, 20, 95), 0.08);
    }

    const fMove = clamp((photoKeys.forward ? 1 : 0) - (photoKeys.backward ? 1 : 0) + photoTouchMove.forward, -1, 1);
    const rMove = clamp((photoKeys.right ? 1 : 0) - (photoKeys.left ? 1 : 0) + photoTouchMove.right, -1, 1);
    const uMove = clamp((photoKeys.up ? 1 : 0) - (photoKeys.down ? 1 : 0) + photoTouchMove.up, -1, 1);
    const spdScale = (photoKeys.fast || photoTouchMove.boost) ? 2.6 : photoKeys.slow ? 0.35 : 1.0;

    if (photoViewMode === 'drone' || photoViewMode === 'interior') {
      _photoCamFwd.set(
        Math.cos(photoPitch) * Math.sin(photoYaw),
        Math.sin(photoPitch),
        Math.cos(photoPitch) * Math.cos(photoYaw),
      ).normalize();
      _photoCamRight.crossVectors(_photoCamFwd, _worldUp);
      if (_photoCamRight.lengthSq() < 1e-5) {
        _photoCamRight.set(1, 0, 0);
      } else {
        _photoCamRight.normalize();
      }

      const stepSpeed = (photoViewMode === 'interior' ? 1.15 : photoMoveSpeed) * spdScale * deltaSec;
      photoCamPos.addScaledVector(_photoCamFwd, fMove * stepSpeed);
      photoCamPos.addScaledVector(_photoCamRight, rMove * stepSpeed);
      photoCamPos.addScaledVector(_worldUp, uMove * stepSpeed);

      if (photoViewMode === 'interior') {
        _photoInvQuat.copy(_photoCarQuat).invert();
        _photoLocalScratch.copy(photoCamPos).sub(_photoCarPos).applyQuaternion(_photoInvQuat);
        _photoLocalScratch.x = clamp(_photoLocalScratch.x, _photoEyeLocal.x - 0.62, _photoEyeLocal.x + 0.62);
        _photoLocalScratch.y = clamp(_photoLocalScratch.y, _photoEyeLocal.y - 0.22, _photoEyeLocal.y + 0.32);
        _photoLocalScratch.z = clamp(_photoLocalScratch.z, _photoEyeLocal.z - 0.72, _photoEyeLocal.z + 0.55);
        photoCamPos.copy(_photoLocalScratch).applyQuaternion(_photoCarQuat).add(_photoCarPos);
        cam.position.copy(photoCamPos);
        cam.up.copy(_photoCarUp);
        _photoLookTarget.copy(photoCamPos).add(_photoCamFwd);
        cam.lookAt(_photoLookTarget);
      } else {
        if (isGarageTarget) {
          photoCamPos.y = clamp(photoCamPos.y, 0.12, 8.2);
          const horizR = Math.hypot(photoCamPos.x, photoCamPos.z);
          if (horizR > 24) {
            const s = 24 / horizR;
            photoCamPos.x *= s;
            photoCamPos.z *= s;
          }
        } else {
          const floorY = groundHeightAt(photoCamPos.x, photoCamPos.z) + 0.12;
          if (photoCamPos.y < floorY) photoCamPos.y = floorY;
        }
        cam.position.copy(photoCamPos);
        cam.up.set(0, 1, 0);
        _photoLookTarget.copy(photoCamPos).add(_photoCamFwd);
        cam.lookAt(_photoLookTarget);
      }
    } else {
      // Orbit / Front 3/4 / Rear Wing
      const panSpeed = 4.5 * spdScale * deltaSec;
      if (fMove !== 0 || rMove !== 0 || uMove !== 0) {
        const cosP = Math.cos(photoOrbitPitch);
        _photoCamFwd.set(-cosP * Math.sin(photoOrbitYaw), 0, -cosP * Math.cos(photoOrbitYaw));
        if (_photoCamFwd.lengthSq() < 1e-5) _photoCamFwd.set(0, 0, -1);
        _photoCamFwd.normalize();
        _photoCamRight.crossVectors(_photoCamFwd, _worldUp).normalize();
        photoOrbitOffset.addScaledVector(_photoCamFwd, fMove * panSpeed);
        photoOrbitOffset.addScaledVector(_photoCamRight, rMove * panSpeed);
        photoOrbitOffset.y = clamp(photoOrbitOffset.y + uMove * panSpeed, -1.0, 12.0);
        const maxPan = isGarageTarget ? 10 : 48;
        if (photoOrbitOffset.length() > maxPan) {
          photoOrbitOffset.setLength(maxPan);
        }
      }

      _photoLookTarget.copy(_photoCarPos).addScaledVector(_worldUp, 0.62).add(photoOrbitOffset);
      const cp = Math.cos(photoOrbitPitch);
      photoCamPos.set(
        _photoLookTarget.x + cp * Math.sin(photoOrbitYaw) * photoOrbitDist,
        _photoLookTarget.y + Math.sin(photoOrbitPitch) * photoOrbitDist,
        _photoLookTarget.z + cp * Math.cos(photoOrbitYaw) * photoOrbitDist,
      );
      if (isGarageTarget) {
        photoCamPos.y = clamp(photoCamPos.y, 0.12, 8.2);
      } else {
        const floorY = groundHeightAt(photoCamPos.x, photoCamPos.z) + 0.12;
        if (photoCamPos.y < floorY) photoCamPos.y = floorY;
      }
      cam.position.copy(photoCamPos);
      cam.up.set(0, 1, 0);
      cam.lookAt(_photoLookTarget);
    }

    if (Math.abs(photoRollDeg) > 0.01) {
      cam.rotateZ(THREE.MathUtils.degToRad(photoRollDeg));
    }
  };

  const clearPhotoInputs = () => {
    photoKeys.forward = false;
    photoKeys.backward = false;
    photoKeys.left = false;
    photoKeys.right = false;
    photoKeys.up = false;
    photoKeys.down = false;
    photoKeys.fast = false;
    photoKeys.slow = false;
    photoTouchMove.forward = 0;
    photoTouchMove.right = 0;
    photoTouchMove.up = 0;
    photoTouchMove.boost = false;
    photoDragActive = false;
    photoTouchId = null;
  };

  const setPhotoModeInternal = (enabled: boolean): PhotoModeState => {
    if (enabled === photoModeActive) return getPhotoModeState();
    clearInputsOnBlur();
    clearPhotoInputs();
    if (enabled) {
      if (appMode !== 'garage' && appMode !== 'racing') {
        return getPhotoModeState();
      }
      if (appMode === 'garage' && isSpectatorMode()) {
        cctvEnabled = false;
        flyoverActive = false;
        orbitSpectatorActive = false;
      }
      if (appMode === 'racing' && preRaceIntroSec > 0) {
        preRaceIntroSec = 0;
        callbacks.onPreRaceIntroSync?.(false);
      }
      photoSavedGarageFov = garageCamera.fov;
      photoSavedGarageNear = garageCamera.near;
      photoModeActive = true;
      photoCarFrozen = true;
      photoRollDeg = 0;
      photoViewMode = 'drone';
      photoFovDeg = appMode === 'garage' ? 38 : 44;
      seedPhotoViewPose('drone', true);
      applyPhotoInteriorFlags();
      audio.silence();
      engineerRadio.silence();
      syncControlModes();
      updatePhotoCamera(0.016);
    } else {
      photoModeActive = false;
      photoCarFrozen = true;
      photoRollDeg = 0;
      garageCarInstance?.setInteriorMode(false);
      garageCamera.fov = photoSavedGarageFov;
      garageCamera.near = photoSavedGarageNear;
      garageCamera.up.set(0, 1, 0);
      garageCamera.updateProjectionMatrix();
      trackCamera.up.set(0, 1, 0);
      snapDriveCameraNext = true;
      applyPhotoInteriorFlags();
      syncControlModes();
    }
    if (isBackgroundFrozen || frameId === 0) {
      renderCurrentFrozenFrame();
    }
    return emitPhotoState();
  };
  const mobileInput: MobileControlsInput = {
    throttleVal: 0,
    brakeVal: 0,
    steerAxis: 0,
    handbrakeVal: 0,
    lookBack: false,
  };
  let garageCamGoalPos: THREE.Vector3 | null = null;
  let garageCamGoalTarget: THREE.Vector3 | null = null;
  let selectedCarId: CarModelId = 'bmw-m4-gt3-evo';
  let activeGarageLoadCarId: CarModelId | null = 'bmw-m4-gt3-evo';
  let garageLoadDebounceTimer: number | null = null;
  const carTemplateMap = new Map<CarModelId, McLarenTemplate>();
  const playerCarPool = new Map<
    CarModelId,
    { garageCar: McLarenCarInstance; trackCar: McLarenCarInstance }
  >();
  let garageCarInstance: McLarenCarInstance | null = null;
  let trackCarInstance: McLarenCarInstance | null = null;
  const requestedRemoteTemplates = new Set<CarModelId>();
  const remotePlayersRig = new RemotePlayersRig(
    (carId) => carTemplateMap.get(carId),
    (carId) => {
      if (requestedRemoteTemplates.has(carId) || carTemplateMap.has(carId)) return;
      requestedRemoteTemplates.add(carId);
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      loadCarTemplate(carId, undefined, getTextureTierForOption(), maxAniso)
        .then((tpl) => {
          if (disposed) {
            tpl.dispose();
            return;
          }
          carTemplateMap.set(carId, tpl);
          tpl.setTextureQuality(getTextureTierForOption(), maxAniso);
          ensurePooledCarPair(carId, tpl);
        })
        .catch(() => {
          requestedRemoteTemplates.delete(carId);
        });
    },
  );
  trackScene.add(remotePlayersRig.group);
  const ghostBattleManager = new GhostBattleManager();
  trackScene.add(ghostBattleManager.group);
  let activeGhostMode: GhostBattleMode = 'off';
  let tandemPartnerIdForMp: string | null = null;
  let tandemPartnerNameForMp: string | null = null;
  let tandemMultiplierForMp = 1;
  let tandemHoldSec = 0;
  const _mpPoseEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  let lastBestLapMsForMp: number | null = null;
  let lastDriftPointsForMp = 0;
  let lastRaceFinishedForMp = false;
  const prewarmTimers = new Set<number>();
  const schedulePrewarmTimer = (fn: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      prewarmTimers.delete(id);
      if (!disposed) {
        fn();
      }
    }, delayMs);
    prewarmTimers.add(id);
    return id;
  };
  let trackShadersDirty = false;
  let disposed = false;

  // 5. HDR Post-Processing Composers (Track Scene & Garage Pavilion)
  let postFxEnabled = !isSoftwareGl;
  let currentInspectMode: InspectMode = 'lit';
  let composer: EffectComposer | null = null;
  let carPostFxPass: CarSsrAndLutPass | null = null;
  let gtaoPass: GTAOPass | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  let cinemaPass: ShaderPass | null = null;
  let smaaPass: SMAAPass | null = null;
  let outputPass: OutputPass | null = null;

  let garageComposer: EffectComposer | null = null;
  let garageSanitizePass: ShaderPass | null = null;
  let garageBloomPass: UnrealBloomPass | null = null;
  let garageCinemaPass: ShaderPass | null = null;
  let garageSmaaPass: SMAAPass | null = null;
  let garageOutputPass: OutputPass | null = null;

  const ensureGtaoPass = () => {
    if (gtaoPass || !composer || isSoftwareGl) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    gtaoPass = new GTAOPass(trackScene, trackCamera, w, h);
    gtaoPass.output = GTAOPass.OUTPUT.Default;
    gtaoPass.blendIntensity = 0.54;
    gtaoPass.updateGtaoMaterial({
      radius: 1.85,
      distanceExponent: 1.5,
      thickness: 2.2,
      distanceFallOff: 0.9,
      scale: 1.0,
      samples: 12,
    });
    const bloomIdx = bloomPass ? composer.passes.indexOf(bloomPass) : 2;
    composer.insertPass(gtaoPass, bloomIdx >= 0 ? bloomIdx + 1 : 3);
  };

  const getLiveryForCar = (carId: CarModelId): CarLiveryVariant => {
    switch (carId) {
      case 'bmw-m4-gt3-evo':
      case 'audi-r8-lms-evo':
      case 'mercedes-amg-gt3-evo':
      case 'toyota-gt-one-ts020':
      case 'bmw-m-hybrid-v8':
      case 'honda-ra272-f1':
      case 'koenigsegg-agera-rs':
      case 'toyota-ae86-trueno':
        return 'platinum_silver';
      case 'bmw-m4-widebody':
      case 'de-tomaso-p900':
      case 'ferrari-250-testa-rossa':
      case 'ferrari-f40-lbwk':
      case 'subaru-wrx-sti':
      case 'acura-nsx-gt3':
      case 'vw-golf-gti-mk2':
        return 'obsidian_bronze';
      case 'aston-vantage-gt3':
      case 'mazda-furai':
      case 'bugatti-bolide':
      case 'vw-polo-r-wrx':
        return 'stealth_black';
      case 'aston-vulcan-amr':
      case 'cadillac-v-series-r':
      case 'lambo-huracan-gt3-evo2':
      case 'mclaren-720s-gt3':
      case 'mclaren-f1-gtr-longtail':
      case 'mazda-787b':
      case 'honda-s2000':
        return 'papaya_orange';
    }
  };

  const getCarShortLabel = (carId: CarModelId): string => {
    switch (carId) {
      case 'bmw-m4-gt3-evo':
        return 'M4 GT3 Evo';
      case 'bmw-m4-widebody':
        return 'M4 Widebody';
      case 'aston-vantage-gt3':
        return 'Vantage GT3';
      case 'aston-vulcan-amr':
        return 'Vulcan AMR';
      case 'audi-r8-lms-evo':
        return 'R8 LMS Evo';
      case 'lambo-huracan-gt3-evo2':
        return 'Huracan EVO2';
      case 'mclaren-720s-gt3':
        return '720S GT3';
      case 'acura-nsx-gt3':
        return 'NSX GT3';
      case 'mercedes-amg-gt3-evo':
        return 'AMG GT3 Evo';
      case 'toyota-gt-one-ts020':
        return 'GT-One TS020';
      case 'mazda-furai':
        return 'Mazda Furai';
      case 'bmw-m-hybrid-v8':
        return 'M Hybrid V8';
      case 'cadillac-v-series-r':
        return 'Cadillac V-Series.R';
      case 'mazda-787b':
        return 'Mazda 787B';
      case 'honda-ra272-f1':
        return 'Honda RA272';
      case 'ferrari-250-testa-rossa':
        return '250 Testa Rossa';
      case 'koenigsegg-agera-rs':
        return 'Agera RS';
      case 'bugatti-bolide':
        return 'Bugatti Bolide';
      case 'de-tomaso-p900':
        return 'P900 V12';
      case 'mclaren-f1-gtr-longtail':
        return 'F1 GTR LT';
      case 'ferrari-f40-lbwk':
        return 'F40 LBWK';
      case 'subaru-wrx-sti':
        return 'WRX STI';
      case 'honda-s2000':
        return 'S2000 AP1';
      case 'vw-polo-r-wrx':
        return 'Polo R WRX';
      case 'vw-golf-gti-mk2':
        return 'Golf GTI Mk2';
      case 'toyota-ae86-trueno':
        return 'AE86 Trueno';
    }
  };

  const syncAiTemplatesFromCache = () => {
    const mapObj: Partial<Record<CarModelId, McLarenTemplate>> = {};
    for (const id of ALL_ACTIVE_CAR_IDS) {
      const tpl = carTemplateMap.get(id);
      if (tpl) mapObj[id] = tpl;
    }
    aiRivalsRig.attachTemplates(mapObj);
  };

  const visualCustomByCar = new Map<CarModelId, CarVisualCustomization>();

  const getVisualForCar = (carId: CarModelId): CarVisualCustomization => {
    let cfg = visualCustomByCar.get(carId);
    if (!cfg) {
      cfg = getDefaultVisualCustomization(carId);
      visualCustomByCar.set(carId, cfg);
    }
    return cfg;
  };

  const syncStanceToInstances = (garageCar: McLarenCarInstance | null, trackCar: McLarenCarInstance | null) => {
    const s = physics.getCarSetup();
    const cf = s.camberFrontDeg ?? -2.4;
    const cr = s.camberRearDeg ?? -1.8;
    const rh = s.rideHeightMm ?? 60;
    const activeId: CarModelId = trackCar?.carId ?? garageCar?.carId ?? selectedCarId;
    const vCfg = getVisualForCar(activeId);
    const eff = computeEffectiveSpecs(VEHICLE_SPECS[activeId] ?? VEHICLE_SPECS['bmw-m4-gt3-evo'], s, vCfg);
    garageCar?.setStance(cf, cr, rh, eff.wheelDiameterIn);
    trackCar?.setStance(cf, cr, rh, eff.wheelDiameterIn);
  };

  const getMaxPooledPlayerCars = () =>
    isSoftwareGl || callbacks.isTouchDevice
      ? 2
      : graphicsQuality === 'low' || graphicsQuality === 'recommended'
      ? 3
      : 5;
  const ensurePooledCarPair = (carId: CarModelId, tpl: McLarenTemplate) => {
    const existing = playerCarPool.get(carId);
    if (existing) {
      // Refresh LRU order
      playerCarPool.delete(carId);
      playerCarPool.set(carId, existing);
      return existing;
    }
    const maxPooled = getMaxPooledPlayerCars();
    if (playerCarPool.size >= maxPooled) {
      for (const [evictId, evictPair] of playerCarPool) {
        if (
          evictId !== selectedCarId &&
          evictId !== carId &&
          evictPair.garageCar !== garageCarInstance &&
          evictPair.trackCar !== trackCarInstance
        ) {
          playerCarPool.delete(evictId);
          evictPair.garageCar.dispose();
          evictPair.trackCar.dispose();
          if (playerCarPool.size < maxPooled) break;
        }
      }
    }
    const livery = getLiveryForCar(carId);
    const garageCar = tpl.createInstance(false, livery);
    const trackCar = tpl.createInstance(true, livery);
    const vCfg = getVisualForCar(carId);
    garageCar.setVisualCustomization(vCfg);
    trackCar.setVisualCustomization(vCfg);
    syncStanceToInstances(garageCar, trackCar);
    const pair = { garageCar, trackCar };
    playerCarPool.set(carId, pair);
    trackShadersDirty = true;
    return pair;
  };

  let activeGaragePlaceholder: McLarenCarInstance | null = null;
  let activeTrackPlaceholder: McLarenCarInstance | null = null;

  const clearCarPlaceholders = () => {
    if (activeGaragePlaceholder) {
      if (garageCarInstance === activeGaragePlaceholder) {
        garageCarInstance = null;
      }
      activeGaragePlaceholder.dispose();
      activeGaragePlaceholder = null;
    }
    if (activeTrackPlaceholder) {
      if (trackCarInstance === activeTrackPlaceholder) {
        trackCarInstance = null;
      }
      activeTrackPlaceholder.dispose();
      activeTrackPlaceholder = null;
    }
  };

  const applyPlayerTemplate = (carId: CarModelId, tpl: McLarenTemplate) => {
    if (disposed) return;
    clearCarPlaceholders();
    const pair = ensurePooledCarPair(carId, tpl);
    const vCfg = getVisualForCar(carId);
    pair.garageCar.setVisualCustomization(vCfg);
    pair.trackCar.setVisualCustomization(vCfg);
    physics.setCarModel(carId);
    physics.setVisualCustomization(vCfg);
    syncStanceToInstances(pair.garageCar, pair.trackCar);

    garageCarInstance = pair.garageCar;
    trackCarInstance = pair.trackCar;

    garageStage.attachCar(pair.garageCar);
    cctvRig.attachCar(pair.trackCar);
    carPostFxPass?.setCarRoot(pair.trackCar.root);

    if (!isSoftwareGl && typeof renderer.compileAsync === 'function') {
      void renderer.compileAsync(garageStage.scene, garageCamera).catch(() => {});
    }
  };

  const applyCarPlaceholder = (carId: CarModelId) => {
    if (disposed) return;
    clearCarPlaceholders();
    const gPh = createCarPlaceholderInstance(carId);
    const tPh = createCarPlaceholderInstance(carId);
    const vCfg = getVisualForCar(carId);
    gPh.setVisualCustomization(vCfg);
    tPh.setVisualCustomization(vCfg);
    activeGaragePlaceholder = gPh;
    activeTrackPlaceholder = tPh;
    garageCarInstance = gPh;
    trackCarInstance = tPh;
    garageStage.attachCar(gPh);
    cctvRig.attachCar(tPh);
    carPostFxPass?.setCarRoot(tPh.root);
  };

  const prewarmTrackShadersAsync = () => {
    if (disposed || isSoftwareGl) return;
    if (typeof renderer.compileAsync === 'function') {
      void renderer
        .compileAsync(trackScene, trackCamera)
        .then(() => {
          trackShadersDirty = false;
        })
        .catch(() => {});
    } else {
      trackShadersDirty = false;
    }
  };

  const prewarmTrackShadersIfNeeded = () => {
    if (disposed || isSoftwareGl || !trackShadersDirty) return;
    trackShadersDirty = false;
    prewarmTrackShadersAsync();
  };

  const loadAndSelectCar = (carId: CarModelId, emitProgress: boolean) => {
    const switchStartMs = performance.now();
    if (garageLoadDebounceTimer !== null) {
      window.clearTimeout(garageLoadDebounceTimer);
      garageLoadDebounceTimer = null;
    }
    selectedCarId = carId;
    physics.setCarModel(carId);
    const cached = carTemplateMap.get(carId);
    if (cached) {
      if (
        activeGarageLoadCarId &&
        activeGarageLoadCarId !== carId &&
        !carTemplateMap.has(activeGarageLoadCarId)
      ) {
        abortCarTemplateLoad(activeGarageLoadCarId);
      }
      activeGarageLoadCarId = null;
      applyPlayerTemplate(carId, cached);
      if (isBackgroundFrozen) {
        renderCurrentFrozenFrame();
      }
      profiler.recordTransitionDuration(
        `Car Switch (${getCarShortLabel(carId)})`,
        performance.now() - switchStartMs,
        clock.elapsedTime,
      );
      if (emitProgress) {
        callbacks.onCarLoadProgress?.(100, true);
      }
      return;
    }

    if (activeGarageLoadCarId === carId && activeGaragePlaceholder?.carId === carId) {
      return;
    }

    if (
      activeGarageLoadCarId &&
      activeGarageLoadCarId !== carId &&
      !carTemplateMap.has(activeGarageLoadCarId)
    ) {
      abortCarTemplateLoad(activeGarageLoadCarId);
    }

    activeGarageLoadCarId = carId;
    // Show instant wireframe-accented silhouette placeholder while the real GLB streams live
    applyCarPlaceholder(carId);
    if (isBackgroundFrozen) {
      renderCurrentFrozenFrame();
    }
    if (emitProgress) {
      callbacks.onCarLoadProgress?.(2, false);
    }

    garageLoadDebounceTimer = window.setTimeout(() => {
      garageLoadDebounceTimer = null;
      if (disposed || selectedCarId !== carId) return;
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      loadCarTemplate(
        carId,
        (pct) => {
          if (!disposed && emitProgress && selectedCarId === carId) {
            callbacks.onCarLoadProgress?.(Math.max(2, pct), false);
          }
        },
        getTextureTierForOption(),
        maxAniso,
      )
        .then((tpl) => {
          if (disposed) {
            tpl.dispose();
            return;
          }
          if (activeGarageLoadCarId === carId) {
            activeGarageLoadCarId = null;
          }
          carTemplateMap.set(carId, tpl);
          tpl.setTextureQuality(getTextureTierForOption(), maxAniso);
          ensurePooledCarPair(carId, tpl);
          if (selectedCarId === carId) {
            applyPlayerTemplate(carId, tpl);
            if (isBackgroundFrozen) {
              renderCurrentFrozenFrame();
            }
            profiler.recordTransitionDuration(
              `Car Load (${getCarShortLabel(carId)})`,
              performance.now() - switchStartMs,
              clock.elapsedTime,
            );
            if (emitProgress) {
              callbacks.onCarLoadProgress?.(100, true);
            }
          }
        })
        .catch((err) => {
          if (err instanceof Error && err.name === 'AbortError') {
            return;
          }
          if (activeGarageLoadCarId === carId) {
            activeGarageLoadCarId = null;
          }
          console.warn(`Failed to load car GLB (${carId}) — keeping GT placeholder:`, err);
          if (emitProgress && selectedCarId === carId) {
            callbacks.onCarLoadProgress?.(100, true);
          }
        });
    }, 65);
  };

  // Staged Background Pre-Warm:
  // Slice 0: Lead 2020 Audi R8 LMS Evo car immediately
  // Slice 1: Sequential one-car-at-a-time preload in Garage (650S GT3 -> BMW M4 GT3 Evo -> BMW M4 Widebody) + async shader warmup
  // Slice 2-3: Off-stage idle build & async shader pre-compile of remaining circuits while in Garage
  const prewarmMapProgramCache = (entry: MapWorldCacheEntry) => {
    if (disposed || isSoftwareGl || typeof renderer.compileAsync !== 'function') return;
    const scratchScene = new THREE.Scene();
    scratchScene.add(entry.terrainRig.group);
    scratchScene.add(entry.roadRig.group);
    scratchScene.add(entry.landmarksRig.group);
    scratchScene.add(entry.propsRig.group);
    scratchScene.add(entry.flagMarshalsRig.group);
    scratchScene.add(entry.cctvRig.group);
    void renderer
      .compileAsync(scratchScene, trackCamera)
      .catch(() => {})
      .finally(() => {
        scratchScene.clear();
      });
  };

  let offstagePrewarmTimer: number | null = null;
  const clearPendingOffstagePrewarm = () => {
    if (offstagePrewarmTimer !== null) {
      window.clearTimeout(offstagePrewarmTimer);
      offstagePrewarmTimer = null;
    }
  };

  const prewarmOffstageMap = (targetMapId: MapId) => {
    clearPendingOffstagePrewarm();
    if (
      disposed ||
      isSoftwareGl ||
      Boolean(callbacks.isTouchDevice) ||
      graphicsQuality === 'low' ||
      appMode !== 'garage' ||
      isSpectatorMode() ||
      targetMapId === currentBuiltMapId ||
      mapRigCache.has(targetMapId)
    ) {
      return;
    }
    offstagePrewarmTimer = window.setTimeout(() => {
      offstagePrewarmTimer = null;
      if (
        disposed ||
        isSoftwareGl ||
        appMode !== 'garage' ||
        isSpectatorMode() ||
        targetMapId === currentBuiltMapId ||
        mapRigCache.has(targetMapId)
      ) {
        return;
      }
      const savedActiveMap = getActiveMapId();
      const savedColliders = worldColliders.exportSnapshot();
      const savedMeta = MAP_REGISTRY[savedActiveMap];
      try {
        setActiveMapId(targetMapId);
        worldColliders.resetAll();
        const built = buildRigsForMapId(targetMapId, true);
        const revKey = getCustomRevisionKey(targetMapId);
        const customCfg = getCircuitCustomization(targetMapId);
        built.rRig.setAsphaltWear?.(clamp(customCfg.asphaltWear ?? 0.35, 0, 1));
        built.pRig.setFoliageDensity?.(clamp(customCfg.foliageDensity ?? 1.0, 0.35, 1.25));
        built.tRig.setSurfaceLook?.({
          waterChop: clamp(customCfg.waterChop ?? 0.45, 0, 1),
          waterClarity: clamp(customCfg.waterClarity ?? 0.65, 0, 1),
          snowSheen: clamp(customCfg.snowSheen ?? 0.65, 0, 1),
        });
        const cachedEntry: MapWorldCacheEntry = {
          terrainRig: built.tRig,
          roadRig: built.rRig,
          landmarksRig: built.lRig,
          propsRig: built.pRig,
          flagMarshalsRig: built.fRig,
          cctvRig: built.cRig!,
          colliderSnapshot: worldColliders.exportSnapshot(),
          grandstandPos: built.lRig.getGrandstandWorldPos?.() ?? null,
          builtGraphicsQuality: graphicsQuality,
          customRevisionKey: revKey,
        };
        mapRigCache.set(targetMapId, cachedEntry);
        trimMapRigCache(targetMapId);
        prewarmMapProgramCache(cachedEntry);
      } finally {
        setActiveMapId(savedActiveMap);
        worldColliders.restoreSnapshot(savedColliders);
        textures?.setCircuitBranding?.(savedMeta.name, savedMeta.region, savedMeta.accentHex);
      }
    }, 180);
  };

  const bootMaxAniso = renderer.capabilities.getMaxAnisotropy();
  applyCarPlaceholder('bmw-m4-gt3-evo');
  const HERO_SPRINT_RIVAL_CARS: CarModelId[] = [
    'lambo-huracan-gt3-evo2',
    'cadillac-v-series-r',
    'audi-r8-lms-evo',
  ];
  const COMPACT_SPRINT_RIVAL_CARS: CarModelId[] = [
    'acura-nsx-gt3',
    'aston-vantage-gt3',
  ];
  let sprintRivalsLoading = false;
  const ensureSprintRivalsOnDemand = () => {
    syncAiTemplatesFromCache();
    if (sprintRivalsLoading || activeGarageLoadCarId !== null) return;
    const useCompactRivals =
      isSoftwareGl ||
      Boolean(callbacks.isTouchDevice) ||
      graphicsQuality === 'low' ||
      graphicsQuality === 'recommended' ||
      graphicsQuality === 'balanced';
    const rivalList = useCompactRivals ? COMPACT_SPRINT_RIVAL_CARS : HERO_SPRINT_RIVAL_CARS;
    const missing = rivalList.filter((id) => !carTemplateMap.has(id));
    if (missing.length === 0) return;
    sprintRivalsLoading = true;
    const loadNextRival = (idx: number) => {
      if (disposed || idx >= rivalList.length) {
        sprintRivalsLoading = false;
        return;
      }
      const nextId = rivalList[idx];
      if (carTemplateMap.has(nextId)) {
        syncAiTemplatesFromCache();
        loadNextRival(idx + 1);
        return;
      }
      const aniso = renderer.capabilities.getMaxAnisotropy();
      const carSubQ = getTextureTierForOption();
      loadCarTemplate(nextId, undefined, carSubQ, aniso)
        .then((carTpl) => {
          if (disposed) {
            carTpl.dispose();
            return;
          }
          carTemplateMap.set(nextId, carTpl);
          carTpl.setTextureQuality(carSubQ, aniso);
          syncAiTemplatesFromCache();
          loadNextRival(idx + 1);
        })
        .catch(() => {
          loadNextRival(idx + 1);
        });
    };
    loadNextRival(0);
  };

  loadCarTemplate(
    'bmw-m4-gt3-evo',
    (pct) => {
      if (!disposed && selectedCarId === 'bmw-m4-gt3-evo') {
        callbacks.onCarLoadProgress?.(pct, false);
      }
    },
    getTextureTierForOption(),
    bootMaxAniso,
  )
    .then((tpl) => {
      if (disposed) {
        tpl.dispose();
        return;
      }
      if (activeGarageLoadCarId === 'bmw-m4-gt3-evo') {
        activeGarageLoadCarId = null;
      }
      carTemplateMap.set('bmw-m4-gt3-evo', tpl);
      ensurePooledCarPair('bmw-m4-gt3-evo', tpl);
      if (selectedCarId === 'bmw-m4-gt3-evo') {
        applyPlayerTemplate('bmw-m4-gt3-evo', tpl);
        callbacks.onCarLoadProgress?.(100, true);
      }
    })
    .catch((err) => {
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      if (activeGarageLoadCarId === 'bmw-m4-gt3-evo') {
        activeGarageLoadCarId = null;
      }
      console.warn('Failed to load 2025 BMW M4 GT3 Evo GLB — keeping GT placeholder:', err);
      if (selectedCarId === 'bmw-m4-gt3-evo') {
        callbacks.onCarLoadProgress?.(100, true);
      }
    });

  const ensureTrackComposer = (): EffectComposer | null => {
    if (isSoftwareGl || composerBroken) return null;
    if (composer) return composer;
    const curW = container.clientWidth || window.innerWidth;
    const curH = container.clientHeight || window.innerHeight;
    const curDpr = renderer.getPixelRatio();
    const rtW = Math.max(1, Math.floor(curW * curDpr));
    const rtH = Math.max(1, Math.floor(curH * curDpr));
    const depthTex = new THREE.DepthTexture(rtW, rtH, THREE.UnsignedIntType);
    const composerRt = new THREE.WebGLRenderTarget(rtW, rtH, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      depthTexture: depthTex,
    });

    composer = new EffectComposer(renderer, composerRt);
    if (!composer.renderTarget2.depthTexture || composer.renderTarget2.depthTexture === depthTex) {
      composer.renderTarget2.depthTexture = new THREE.DepthTexture(rtW, rtH, THREE.UnsignedIntType);
    }
    composer.setPixelRatio(curDpr);
    composer.setSize(curW, curH);

    const renderPass = new RenderPass(trackScene, trackCamera);
    composer.addPass(renderPass);

    carPostFxPass = new CarSsrAndLutPass(trackScene, trackCamera, rtW, rtH);
    const loadedCarRoot = cctvRig.getCarRoot() ?? trackCarInstance?.root ?? null;
    if (loadedCarRoot) {
      carPostFxPass.setCarRoot(loadedCarRoot);
    }
    composer.addPass(carPostFxPass);

    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, Math.floor(curW * 0.5)), Math.max(1, Math.floor(curH * 0.5))),
      0.20,
      0.40,
      0.95,
    );
    composer.addPass(bloomPass);

    cinemaPass = new ShaderPass(CINEMA_LENS_SHADER);
    composer.addPass(cinemaPass);

    smaaPass = new SMAAPass();
    composer.addPass(smaaPass);

    outputPass = new OutputPass();
    composer.addPass(outputPass);

    if (graphicsQuality === 'max' || graphicsQuality === 'ultra') {
      ensureGtaoPass();
    }
    updateAdaptivePostFx(true);
    return composer;
  };

  const ensureGarageComposer = (): EffectComposer | null => {
    if (isSoftwareGl || composerBroken) return null;
    if (garageComposer) return garageComposer;
    const curW = container.clientWidth || window.innerWidth;
    const curH = container.clientHeight || window.innerHeight;
    const curDpr = renderer.getPixelRatio();
    const rtW = Math.max(1, Math.floor(curW * curDpr));
    const rtH = Math.max(1, Math.floor(curH * curDpr));

    const garageRt = new THREE.WebGLRenderTarget(rtW, rtH, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      samples: renderer.capabilities.isWebGL2 && !isSoftwareGl ? 2 : 0,
    });
    garageComposer = new EffectComposer(renderer, garageRt);
    garageComposer.setPixelRatio(curDpr);
    garageComposer.setSize(curW, curH);
    garageComposer.addPass(new RenderPass(garageStage.scene, garageCamera));
    garageSanitizePass = new ShaderPass(HDR_SANITIZE_SHADER);
    garageComposer.addPass(garageSanitizePass);
    garageBloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.max(1, Math.floor(curW * 0.5)), Math.max(1, Math.floor(curH * 0.5))),
      0.18,
      0.36,
      0.92,
    );
    garageComposer.addPass(garageBloomPass);
    garageCinemaPass = new ShaderPass(CINEMA_LENS_SHADER);
    garageComposer.addPass(garageCinemaPass);
    garageSmaaPass = new SMAAPass();
    garageComposer.addPass(garageSmaaPass);
    garageOutputPass = new OutputPass();
    garageComposer.addPass(garageOutputPass);

    updateAdaptivePostFx(true);
    return garageComposer;
  };

  let currentSolarDeg = 168;
  let currentHaze: HazePreset = 'golden';
  let currentWeather: WeatherPreset = 'dry';
  let dynamicWeatherBasePreset: WeatherPreset = currentWeather;
  let currentSnowAtmosphere: SnowAtmospherePreset = 'alpine_snow';
  let autoCycle = false;

  let cinematicSettings: CinematicSettings = { ...DEFAULT_CINEMATIC_SETTINGS };
  const weatherManager = new WeatherTransitionManager();
  weatherManager.configure({
    autoEnabled: cinematicSettings.weatherAutoEnabled && !cinematicSettings.dynamicWeatherEnabled,
    pace: cinematicSettings.weatherPace,
    manualTarget: currentWeather,
  });

  const GRADE_MODE_MAP: Record<FilmGradePreset, number> = {
    natural: 0,
    broadcast: 1,
    kodak_gold: 2,
    cool_gt: 3,
    noir: 4,
  };

  let updateAdaptivePostFx = (_force = false) => {};

  const applyCinematicToPasses = () => {
    weatherManager.configure({
      autoEnabled: cinematicSettings.weatherAutoEnabled && !cinematicSettings.dynamicWeatherEnabled,
      pace: cinematicSettings.weatherPace,
    });
    updateAdaptivePostFx(true);
  };
  applyCinematicToPasses();

  let lastCamFov = trackCamera.fov;
  let lastCamNear = trackCamera.near;
  const syncTrackProjection = (fovDeg: number, nearDist: number) => {
    if (Math.abs(fovDeg - lastCamFov) > 0.03 || Math.abs(nearDist - lastCamNear) > 0.005) {
      trackCamera.fov = fovDeg;
      trackCamera.near = nearDist;
      lastCamFov = fovDeg;
      lastCamNear = nearDist;
      trackCamera.updateProjectionMatrix();
    }
  };

  let prevRacePosition = 1;
  let overtakePulse = 0;
  let isCloseFinishFlag = false;
  let lastWeatherEmitAt = -10;
  let lastEmittedWeatherLabel = '';
  let lastEmittedWeatherAuto = cinematicSettings.weatherAutoEnabled;
  let lastEmittedWeatherPct = -1;

  const crowdPlayerPosScratch = { x: 0, z: 0 };
  const crowdTelemetryScratch: CrowdTelemetryInput = {
    closestRivalGapSec: null,
    speedMps: 0,
    playerDistToGrandstand: 999,
    playerPos: crowdPlayerPosScratch,
    isFinalLap: false,
    isRacing: false,
    isPodium: false,
    isFinished: false,
    isCloseFinish: false,
    positionChangedPulse: 0,
    reactivityScale: cinematicSettings.crowdReactivity,
    densityScale: cinematicSettings.crowdDensity,
  };

  const applyAtmosphere = (deg: number, haze: HazePreset, weather: WeatherPreset) => {
    const mapId = getActiveMapId();
    const isFrostpeak = mapId === 'frostpeak_pass';
    const snowArg = isFrostpeak ? currentSnowAtmosphere : null;
    skyRig.setSnowAtmosphere(snowArg);
    const snap = weatherManager.getSnapshot(mapId, snowArg);
    const state = skyRig.updateContinuousWeather(deg, haze, snap, snowArg);
    currentNightFactor = state.nightFactor;
    roadRig.setNightFactor(state.nightFactor);
    landmarksRig.setNightFactor(state.nightFactor);
    propsRig.setNightFactor(state.nightFactor);
    cctvRig.setNightFactor(state.nightFactor);
    return state;
  };

  if (!isSoftwareGl) {
    if (typeof renderer.compileAsync === 'function') {
      void renderer.compileAsync(garageStage.scene, garageCamera).catch(() => {});
    } else {
      renderer.compile(garageStage.scene, garageCamera);
    }
  }

  // Spectator / Camera sub-state (available from BOTH Garage and Race!)
  let isTransitioning = false;
  const targetCamPos = initialVantage.position.clone();
  const targetLookAt = initialVantage.target.clone();
  let flyoverActive = false;
  let cctvEnabled = false;
  let orbitSpectatorActive = false;
  let cctvStationIndex = 0;
  let cctvAutoSwitch = true;
  let cctvSnapNextFrame = false;
  let lastCctvSwitchTime = -10;
  let snapDriveCameraNext = true;
  let lastFlagState: 'green' | 'yellow' = 'green';
  let lastHazardTrackT: number | null = null;
  let lastDirtLevel = 0;
  let lastRubberLevel = 0.08;
  let lastSnowAccumLevel = 0;
  let lastLatG = 0;
  let lastInDriftZone = false;
  let lastNearBestPace = false;
  let lastRaceFinished = false;
  let lastTrackT = 0;
  let lastLatestTlmLap = 1;
  let lastLatestSpeedMps = 0;
  let lastKerbRumble = 0;
  let lastWallImpact = 0;
  let lastTotalProgress = 0;
  let lastClosestGapSec: number | null = null;

  // Inside-car RMB drag free-look state
  let isInteriorRmbDown = false;
  let lookTargetYaw = 0;
  let lookTargetPitch = 0;
  let lookYaw = 0;
  let lookPitch = 0;

  const isSpectatorMode = () => cctvEnabled || flyoverActive || orbitSpectatorActive;

  // Replay Recorder, Playback & Driver Analytics
  const replayRecorder = new RaceReplayRecorder();
  const replayPlayer = new ReplayPlayer();
  const driverAnalyticsTracker = new DriverAnalyticsTracker();
  let lastRecordedReplay: RaceReplayRecording | null = null;
  let replayCameraMode: ReplayCameraMode = 'cinematic_chase';
  let lastReplayUiEmitAt = -10;
  let replaySnapNextFrame = true;
  let hasPrevReplayCarPos = false;
  let replayReturnMode: AppScreenMode = 'garage';
  const replayAudioTelemetryScratch: VehicleTelemetry = physics.step(
    0.001,
    keyInput,
    assists,
    'dry',
    [],
    null,
    undefined,
    0,
  );
  // Restore previous replay from IndexedDB asynchronously if no live recording exists yet
  void loadLatestReplayFromDb().then((stored) => {
    if (!disposed && stored && !lastRecordedReplay) {
      lastRecordedReplay = stored;
      callbacks.onReplayAvailable?.(true);
    }
  });

  const emitReplayState = () => {
    const rec = replayPlayer.getRecording();
    const snap = replayPlayer.sample();
    if (!rec) return;
    callbacks.onReplayStateSync?.({
      active: appMode === 'replay',
      playing: replayPlayer.isPlaying(),
      currentTimeMs: Math.round(replayPlayer.getCurrentTimeMs()),
      durationMs: rec.durationMs,
      playbackSpeed: replayPlayer.getSpeed(),
      cameraMode: replayCameraMode,
      cctvStationIndex,
      cctvStations: cctvRig.getStations(),
      mapId: rec.mapId,
      mapName: rec.mapName,
      carName: rec.carName,
      mode: rec.mode,
      speedKmh: Math.round(snap?.speedKmh ?? 0),
      rpm: Math.round(snap?.rpm ?? 900),
      redlineRpm: Math.round(snap?.redlineRpm ?? 8000),
      gear: snap?.gear ?? 1,
      throttle: snap?.throttle ?? 0,
      brake: snap?.brake ?? 0,
      latG: Number((snap?.latG ?? 0).toFixed(2)),
      driftAngleDeg: Math.round(snap?.driftAngleDeg ?? 0),
      lap: snap?.lap ?? 1,
      tracePoints: replayPlayer.getTracePoints(),
    });
  };

  const finalizeRaceSessionTelemetry = () => {
    const analyticsAcc = driverAnalyticsTracker.finalize();
    if (analyticsAcc) {
      callbacks.onDriverAnalyticsCommit?.(analyticsAcc);
    }
    const recorded = replayRecorder.finish();
    if (recorded) {
      lastRecordedReplay = recorded;
      callbacks.onReplayAvailable?.(true);
      void saveReplayToDb(recorded);
    }
  };

  let lastPostFxNight = -1;
  let lastPostFxOvercast = -1;
  let lastPostFxMap: MapId | '' = '';
  let lastPostFxGarage = false;

  updateAdaptivePostFx = (force = false) => {
    const activeMap = getActiveMapId();
    const isGarageView = appMode === 'garage' && !isSpectatorMode();
    const snap = weatherManager.getSnapshot(
      activeMap,
      activeMap === 'frostpeak_pass' ? currentSnowAtmosphere : null,
    );
    const nf = clamp(currentNightFactor, 0, 1);
    const ov = clamp(snap.overcast, 0, 1);

    if (
      !force &&
      activeMap === lastPostFxMap &&
      isGarageView === lastPostFxGarage &&
      Math.abs(nf - lastPostFxNight) < 0.025 &&
      Math.abs(ov - lastPostFxOvercast) < 0.03
    ) {
      return;
    }
    lastPostFxMap = activeMap;
    lastPostFxGarage = isGarageView;
    lastPostFxNight = nf;
    lastPostFxOvercast = ov;

    const baseExp = clamp(cinematicSettings.exposure, 0.7, 1.45);
    const baseBloom = clamp(cinematicSettings.bloomStrength, 0, 0.45);
    const baseThresh = clamp(cinematicSettings.bloomThreshold, 0.65, 1.15);
    const baseVig = clamp(cinematicSettings.vignetteStrength, 0, 0.55);
    const gradeNum = GRADE_MODE_MAP[cinematicSettings.filmGrade] ?? 0;
    const baseContrast =
      cinematicSettings.filmGrade === 'noir'
        ? 0.26
        : cinematicSettings.filmGrade === 'broadcast'
        ? 0.22
        : 0.19;
    const baseChromatic = 0.0;

    if (isGarageView) {
      renderer.toneMappingExposure = clamp(baseExp * 0.74, 0.58, 1.12);
    } else if (activeMap === 'frostpeak_pass') {
      renderer.toneMappingExposure = clamp(baseExp * (0.98 + nf * 0.09), 0.72, 1.48);
    } else if (activeMap === 'coral_bay') {
      renderer.toneMappingExposure = clamp(baseExp * (1.03 + nf * 0.06), 0.72, 1.48);
    } else {
      renderer.toneMappingExposure = clamp(baseExp * (1.01 + nf * 0.05), 0.72, 1.48);
    }

    if (garageBloomPass) {
      garageBloomPass.strength = clamp(baseBloom * 0.42, 0, 0.16);
      garageBloomPass.threshold = clamp(baseThresh + 0.26, 1.06, 1.36);
    }
    if (garageCinemaPass) {
      garageCinemaPass.uniforms.uVignetteStrength.value = clamp(baseVig * 1.05, 0, 0.52);
      garageCinemaPass.uniforms.uGradeMode.value = gradeNum;
      garageCinemaPass.uniforms.uContrast.value = clamp(Math.max(baseContrast, 0.18), 0.16, 0.24);
      garageCinemaPass.uniforms.uChromatic.value = baseChromatic * 0.78;
      garageCinemaPass.uniforms.uShadowDepth.value = 0.28;
      garageCinemaPass.uniforms.uSplitWarm.value.setHex(0xfff1dc);
      garageCinemaPass.uniforms.uSplitCool.value.setHex(0xbcd5f8);
      garageCinemaPass.uniforms.uSplitBalance.value = 0.24;
      garageCinemaPass.uniforms.uSunScreenVis.value = 0.0;
      garageCinemaPass.uniforms.uNightFactor.value = 0.0;
    }

    if (bloomPass) {
      const envThreshShift =
        activeMap === 'frostpeak_pass'
          ? lerp(0.06, -0.12, nf)
          : activeMap === 'coral_bay'
          ? lerp(-0.04, -0.14, nf)
          : lerp(-0.02, -0.14, nf);
      const envStrengthBoost = nf * 0.12 + ov * 0.035 + 0.025;
      bloomPass.strength = clamp(baseBloom + envStrengthBoost, 0, 0.52);
      bloomPass.threshold = clamp(baseThresh + envThreshShift, 0.62, 1.14);
    }

    if (cinemaPass) {
      cinemaPass.uniforms.uVignetteStrength.value = clamp(baseVig + nf * 0.05, 0, 0.56);
      cinemaPass.uniforms.uGradeMode.value = gradeNum;
      cinemaPass.uniforms.uContrast.value = clamp(baseContrast + nf * 0.045, 0.12, 0.34);
      cinemaPass.uniforms.uChromatic.value = baseChromatic;
      if (activeMap === 'frostpeak_pass') {
        cinemaPass.uniforms.uShadowDepth.value = 0.23 + nf * 0.06;
        cinemaPass.uniforms.uSplitWarm.value.setHex(0xffe7c8);
        cinemaPass.uniforms.uSplitCool.value.setHex(0xbad9ff);
        cinemaPass.uniforms.uSplitBalance.value = 0.23 + nf * 0.05;
      } else if (activeMap === 'coral_bay') {
        cinemaPass.uniforms.uShadowDepth.value = 0.21 + nf * 0.05;
        cinemaPass.uniforms.uSplitWarm.value.setHex(0xffd9a3);
        cinemaPass.uniforms.uSplitCool.value.setHex(0xbce3f8);
        cinemaPass.uniforms.uSplitBalance.value = 0.23 + nf * 0.04;
      } else {
        cinemaPass.uniforms.uShadowDepth.value = 0.22 + nf * 0.05;
        cinemaPass.uniforms.uSplitWarm.value.setHex(0xffe3b8);
        cinemaPass.uniforms.uSplitCool.value.setHex(0xc8defa);
        cinemaPass.uniforms.uSplitBalance.value = 0.21 + nf * 0.04;
      }
    }
  };
  updateAdaptivePostFx(true);

  const syncControlModes = () => {
    const spectating = isSpectatorMode();
    const showingTrackViewport = appMode !== 'garage' || spectating;

    garageControls.enabled = appMode === 'garage' && !spectating && !isPaused && !photoModeActive;
    trackControls.enabled =
      !photoModeActive &&
      draggingWaypointIdx === null &&
      draggingBlueprintNodeIdx === null &&
      !isGizmoDragging &&
      !isTerrainBrushing &&
      ((appMode === 'custom_map' && !isPaused) ||
        (appMode === 'replay' && replayCameraMode === 'orbit' && !isPaused) ||
        (showingTrackViewport && spectating && !cctvEnabled && !isPaused));

    if (appMode === 'custom_map') {
      trackControls.panSpeed = 1.45;
      trackControls.zoomSpeed = 1.3;
      trackControls.rotateSpeed = 0.85;
    } else {
      trackControls.panSpeed = 1.0;
      trackControls.zoomSpeed = 1.0;
      trackControls.rotateSpeed = 1.0;
    }

    waypointEditorGroup.visible =
      appMode === 'custom_map' &&
      !builderPickMode &&
      (!getCustomBlueprint() || studioToolMode !== 'terrain');
    syncStudioGizmoAttachment();
    remotePlayersRig.group.visible = appMode === 'racing' || appMode === 'podium';

    if (appMode === 'podium') {
      podiumRig.activate();
      cctvRig.setPlayerControlled(true);
      cctvRig.setCarVisible(true);
      aiRivalsRig.setActive(currentRaceConfig.mode === 'sprint');
    } else if (appMode === 'replay') {
      podiumRig.deactivate();
      cctvRig.setPlayerControlled(true);
      cctvRig.setCarVisible(true);
      aiRivalsRig.setActive(Boolean(replayPlayer.getRecording()?.hasRivals));
    } else {
      podiumRig.deactivate();
      cctvRig.setPlayerControlled(
        appMode === 'racing' && (!spectating || orbitSpectatorActive),
      );
      cctvRig.setCarVisible(
        appMode === 'racing' || (appMode === 'garage' && spectating),
      );
      aiRivalsRig.setActive(
        appMode === 'racing' && currentRaceConfig.mode === 'sprint',
      );
    }

    if (appMode !== 'racing' || isPaused || spectating || photoModeActive) {
      isInteriorRmbDown = false;
    }
  };
  syncControlModesRef = syncControlModes;
  syncControlModes();

  const onTrackControlsStart = () => {
    if (isTransitioning || flyoverActive) {
      isTransitioning = false;
      flyoverActive = false;
      callbacks.onUserInterrupt();
    }
  };
  trackControls.addEventListener('start', onTrackControlsStart);

  const onGarageControlsStart = () => {
    garageAutoRotate = false;
    garageCamGoalPos = null;
    garageCamGoalTarget = null;
  };
  const onGarageControlsEnd = () => {
    garageAutoRotate = true;
  };
  garageControls.addEventListener('start', onGarageControlsStart);
  garageControls.addEventListener('end', onGarageControlsEnd);

  const studioMoveKeys = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
    fast: false,
  };
  const _studioCamFwd = new THREE.Vector3();
  const _studioCamRight = new THREE.Vector3();

  // Keyboard Driving & Studio Camera Input Listener
  const onKeyDown = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return;
    }

    if (appMode === 'custom_map' && !isPaused) {
      studioMoveKeys.fast = e.shiftKey;
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const code = e.code;
        if (code === 'KeyW') studioMoveKeys.forward = true;
        else if (code === 'KeyS') studioMoveKeys.backward = true;
        else if (code === 'KeyA') studioMoveKeys.left = true;
        else if (code === 'KeyD') studioMoveKeys.right = true;
        else if (code === 'KeyE') studioMoveKeys.up = true;
        else if (code === 'KeyQ') studioMoveKeys.down = true;
      }
      return;
    }

    audio.unlock();
    engineerRadio.bindAudio(audio.getAudioContext(), audio.getMasterGain());

    if (photoModeActive && !isPaused) {
      const code = e.code;
      if (code === 'KeyV' && !e.repeat) {
        const idx = PHOTO_VIEW_ORDER.indexOf(photoViewMode);
        photoViewMode = PHOTO_VIEW_ORDER[(idx + 1) % PHOTO_VIEW_ORDER.length];
        seedPhotoViewPose(photoViewMode, photoViewMode === 'orbit');
        applyPhotoInteriorFlags();
        emitPhotoState();
        return;
      }
      if (code === 'KeyF' && !e.repeat && appMode === 'racing') {
        photoCarFrozen = !photoCarFrozen;
        clearInputsOnBlur();
        clearPhotoInputs();
        if (photoCarFrozen) {
          seedPhotoViewPose(photoViewMode, photoViewMode === 'drone' || photoViewMode === 'orbit');
        } else {
          trackCarInstance?.setInteriorMode(
            drivingCameraMode === 'cockpit' || drivingCameraMode === 'windshield',
          );
          snapDriveCameraNext = true;
        }
        applyPhotoInteriorFlags();
        emitPhotoState();
        return;
      }
      if (photoCarFrozen || appMode === 'garage') {
        photoKeys.fast = e.shiftKey;
        photoKeys.slow = e.altKey;
        if (code === 'KeyW' || code === 'ArrowUp') photoKeys.forward = true;
        else if (code === 'KeyS' || code === 'ArrowDown') photoKeys.backward = true;
        else if (code === 'KeyA' || code === 'ArrowLeft') photoKeys.left = true;
        else if (code === 'KeyD' || code === 'ArrowRight') photoKeys.right = true;
        else if (code === 'KeyE') photoKeys.up = true;
        else if (code === 'KeyQ') photoKeys.down = true;
        return;
      }
    }

    if (e.key === 'Escape' && appMode === 'racing' && !photoModeActive) {
      callbacks.onPauseRequest?.();
      return;
    }

    if (appMode !== 'racing') return;

    if (isPaused) return;

    const code = e.code;
    if (preRaceIntroSec > 0 && code === 'Space' && !e.repeat) {
      e.preventDefault();
      preRaceIntroSec = 0;
      snapDriveCameraNext = true;
      callbacks.onPreRaceIntroSync?.(false);
      return;
    }

    if (code === 'KeyW' || code === 'ArrowUp') {
      keyInput.throttle = true;
    } else if (code === 'KeyS' || code === 'ArrowDown') {
      keyInput.brake = true;
    } else if (code === 'KeyA' || code === 'ArrowLeft') {
      keyInput.steerLeft = true;
    } else if (code === 'KeyD' || code === 'ArrowRight') {
      keyInput.steerRight = true;
    } else if (code === 'Space') {
      e.preventDefault();
      keyInput.handbrake = true;
    } else if (code === 'KeyB') {
      keyInput.lookBack = true;
    } else if (code === 'KeyE' && !e.repeat) {
      physics.shiftUp(assists);
    } else if (code === 'KeyQ' && !e.repeat) {
      physics.shiftDown(assists);
    } else if (code === 'KeyR' && !e.repeat) {
      physics.resetToNearestTrack();
      snapDriveCameraNext = true;
    } else if (code === 'KeyL' && !e.repeat) {
      headlightsOn = !headlightsOn;
      callbacks.onHeadlightsSync?.(headlightsOn);
    } else if (code === 'KeyX' && !e.repeat) {
      if (preRaceIntroSec <= 0) {
        physics.toggleActiveAero();
      }
    } else if (code === 'Digit1' && !e.repeat) {
      const cur = physics.getCockpitDials();
      const next = { ...cur, brakeBalance: clamp(Math.round((cur.brakeBalance - 0.5) * 10) / 10, -5, 5) };
      physics.setCockpitDials(next);
      callbacks.onCockpitDialsSync?.(next);
    } else if (code === 'Digit2' && !e.repeat) {
      const cur = physics.getCockpitDials();
      const next = { ...cur, brakeBalance: clamp(Math.round((cur.brakeBalance + 0.5) * 10) / 10, -5, 5) };
      physics.setCockpitDials(next);
      callbacks.onCockpitDialsSync?.(next);
    } else if (code === 'Digit3' && !e.repeat) {
      const cur = physics.getCockpitDials();
      const next = { ...cur, tcsLevel: (cur.tcsLevel + 1) % 6 };
      physics.setCockpitDials(next);
      callbacks.onCockpitDialsSync?.(next);
    } else if (code === 'Digit4' && !e.repeat) {
      const cur = physics.getCockpitDials();
      const next = { ...cur, absLevel: (cur.absLevel + 1) % 4 };
      physics.setCockpitDials(next);
      callbacks.onCockpitDialsSync?.(next);
    } else if (code === 'Digit5' && !e.repeat) {
      const cur = physics.getCockpitDials();
      const nextMap = (cur.engineMap === 3 ? 1 : cur.engineMap + 1) as 1 | 2 | 3;
      const next = { ...cur, engineMap: nextMap };
      physics.setCockpitDials(next);
      callbacks.onCockpitDialsSync?.(next);
    } else if (code === 'Digit6' && !e.repeat) {
      const cur = physics.getCockpitDials();
      const next = { ...cur, diffPreload: (cur.diffPreload % 5) + 1 };
      physics.setCockpitDials(next);
      callbacks.onCockpitDialsSync?.(next);
    } else if (code === 'KeyC' && !e.repeat) {
      if (isSpectatorMode()) {
        cctvEnabled = false;
        flyoverActive = false;
        orbitSpectatorActive = false;
        syncControlModes();
        snapDriveCameraNext = true;
      } else {
        const idx = DRIVING_CAMERA_ORDER.indexOf(drivingCameraMode);
        drivingCameraMode = DRIVING_CAMERA_ORDER[(idx + 1) % DRIVING_CAMERA_ORDER.length];
        lookTargetYaw = 0;
        lookTargetPitch = 0;
        lookYaw = 0;
        lookPitch = 0;
        isInteriorRmbDown = false;
        snapDriveCameraNext = true;
        callbacks.onDrivingCameraSync?.(drivingCameraMode);
      }
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    const code = e.code;
    studioMoveKeys.fast = e.shiftKey;
    if (code === 'KeyW') studioMoveKeys.forward = false;
    else if (code === 'KeyS') studioMoveKeys.backward = false;
    else if (code === 'KeyA') studioMoveKeys.left = false;
    else if (code === 'KeyD') studioMoveKeys.right = false;
    else if (code === 'KeyE') studioMoveKeys.up = false;
    else if (code === 'KeyQ') studioMoveKeys.down = false;

    photoKeys.fast = e.shiftKey;
    photoKeys.slow = e.altKey;
    if (code === 'KeyW' || code === 'ArrowUp') photoKeys.forward = false;
    else if (code === 'KeyS' || code === 'ArrowDown') photoKeys.backward = false;
    else if (code === 'KeyA' || code === 'ArrowLeft') photoKeys.left = false;
    else if (code === 'KeyD' || code === 'ArrowRight') photoKeys.right = false;
    else if (code === 'KeyE') photoKeys.up = false;
    else if (code === 'KeyQ') photoKeys.down = false;

    if (code === 'KeyW' || code === 'ArrowUp') keyInput.throttle = false;
    else if (code === 'KeyS' || code === 'ArrowDown') keyInput.brake = false;
    else if (code === 'KeyA' || code === 'ArrowLeft') keyInput.steerLeft = false;
    else if (code === 'KeyD' || code === 'ArrowRight') keyInput.steerRight = false;
    else if (code === 'Space') keyInput.handbrake = false;
    else if (code === 'KeyB') keyInput.lookBack = false;
  };

  const clearInputsOnBlur = () => {
    keyInput.throttle = false;
    keyInput.brake = false;
    keyInput.steerLeft = false;
    keyInput.steerRight = false;
    keyInput.handbrake = false;
    keyInput.lookBack = false;
    studioMoveKeys.forward = false;
    studioMoveKeys.backward = false;
    studioMoveKeys.left = false;
    studioMoveKeys.right = false;
    studioMoveKeys.up = false;
    studioMoveKeys.down = false;
    studioMoveKeys.fast = false;
    isInteriorRmbDown = false;
    clearPhotoInputs();
  };

  // Waypoint 3D drag-and-drop & click editing in custom_map + interior RMB look in racing
  const pointerDownPos = { x: 0, y: 0 };
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const wpDragPlane = new THREE.Plane(_wpPlaneNormal, 0);
  let wpDragBaseX = 0;
  let wpDragBaseZ = 0;

  const setPointerNdc = (clientX: number, clientY: number) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
  };

  const raycastTrackWorldInternal = (
    clientX: number,
    clientY: number,
  ): { x: number; y: number; z: number; propId?: string } | null => {
    setPointerNdc(clientX, clientY);
    raycaster.setFromCamera(pointerNdc, trackCamera);
    const propHits = raycaster.intersectObjects(customPropsRig.group.children, true);
    let hitPropId: string | undefined;
    if (propHits.length > 0) {
      let cur: THREE.Object3D | null = propHits[0].object;
      while (cur && !cur.userData?.builderPropId) {
        cur = cur.parent;
      }
      if (cur?.userData?.builderPropId) {
        hitPropId = String(cur.userData.builderPropId);
      }
    }
    const worldHits = raycaster.intersectObjects([roadRig.group, terrainRig.group], true);
    if (worldHits.length > 0) {
      const pt = worldHits[0].point;
      return {
        x: Number(pt.x.toFixed(2)),
        y: Number(pt.y.toFixed(2)),
        z: Number(pt.z.toFixed(2)),
        propId: hitPropId,
      };
    }
    const fallbackPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -20);
    const out = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(fallbackPlane, out)) {
      return {
        x: Number(out.x.toFixed(2)),
        y: Number(groundHeightAt(out.x, out.z).toFixed(2)),
        z: Number(out.z.toFixed(2)),
        propId: hitPropId,
      };
    }
    return null;
  };

  const onCanvasMouseDown = (e: MouseEvent) => {
    pointerDownPos.x = e.clientX;
    pointerDownPos.y = e.clientY;

    const customBp = getCustomBlueprint();
    if (
      e.button === 0 &&
      appMode === 'custom_map' &&
      !isPaused &&
      Boolean(customBp) &&
      customBp
    ) {
      if (isGizmoDragging || transformControls.axis !== null) {
        return;
      }
      if (studioToolMode === 'terrain') {
        setPointerNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNdc, trackCamera);
        const hits = raycaster.intersectObjects([terrainRig.group, roadRig.group], true);
        if (hits.length > 0) {
          const pt = hits[0].point;
          isTerrainBrushing = true;
          lastBrushWorldX = pt.x;
          lastBrushWorldZ = pt.z;
          syncControlModes();
          callbacks.onStudioTerrainBrushHit?.(
            Number(pt.x.toFixed(2)),
            Number(pt.y.toFixed(2)),
            Number(pt.z.toFixed(2)),
            false,
          );
        }
        return;
      }
      if (studioToolMode !== 'place') {
        setPointerNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNdc, trackCamera);
        const nodeHits = raycaster.intersectObjects(wpClickableMeshes, false);
        if (nodeHits.length > 0) {
          const nodeIdx = nodeHits[0].object.userData.blueprintNodeIndex;
          if (typeof nodeIdx === 'number' && customBp.controlPoints[nodeIdx]) {
            selectedBlueprintNodeIdx = nodeIdx;
            draggingBlueprintNodeIdx = nodeIdx;
            bpDragVerticalMode = e.shiftKey;
            bpDragStartY = customBp.controlPoints[nodeIdx].y;
            bpDragStartScreenY = e.clientY;
            trackControls.enabled = false;
            renderer.domElement.style.cursor = bpDragVerticalMode ? 'ns-resize' : 'grabbing';
            wpDragPlane.set(_wpPlaneNormal, -bpDragStartY);
            syncWaypointMarkerPositions();
            callbacks.onStudioControlPointSelected?.(nodeIdx);
            return;
          }
        }
      }
    }

    if (
      e.button === 0 &&
      appMode === 'custom_map' &&
      !isPaused &&
      !customBp
    ) {
      setPointerNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, trackCamera);
      const hits = raycaster.intersectObjects(wpClickableMeshes, false);
      if (hits.length > 0) {
        const wpIdx = hits[0].object.userData.waypointIndex;
        if (typeof wpIdx === 'number') {
          selectedWaypointIdx = wpIdx;
          draggingWaypointIdx = wpIdx;
          trackControls.enabled = false;
          renderer.domElement.style.cursor = 'grabbing';

          const cp = getCircuitData().controlPoints[wpIdx];
          const curApplied = getCircuitCustomization().waypointOffsets[wpIdx] ?? { dx: 0, dz: 0 };
          wpDragBaseX = cp ? cp.x - curApplied.dx : 0;
          wpDragBaseZ = cp ? cp.z - curApplied.dz : 0;
          wpDragPlane.set(_wpPlaneNormal, -(cp ? cp.y : 20));

          syncWaypointMarkerPositions();
          callbacks.onWaypointSelected?.(wpIdx);
        }
      }
    }

    if (photoModeActive && !isPaused && (photoCarFrozen || appMode === 'garage')) {
      photoDragActive = true;
      photoDragButton = e.button;
      photoLastPointerX = e.clientX;
      photoLastPointerY = e.clientY;
      return;
    }

    if (
      e.button === 2 &&
      appMode === 'racing' &&
      !isPaused &&
      !isSpectatorMode() &&
      (drivingCameraMode === 'cockpit' || drivingCameraMode === 'windshield')
    ) {
      isInteriorRmbDown = true;
    }
  };

  const onWindowMouseMove = (e: MouseEvent) => {
    const customBp = getCustomBlueprint();
    if (draggingBlueprintNodeIdx !== null && customBp && appMode === 'custom_map' && !isPaused) {
      const node = customBp.controlPoints[draggingBlueprintNodeIdx];
      if (!node) return;
      let nextX = node.x;
      let nextY = node.y;
      let nextZ = node.z;
      const snapStep = studioSnapMove > 0 ? studioSnapMove : 1;
      if (bpDragVerticalMode || e.shiftKey) {
        const rawY = bpDragStartY + (bpDragStartScreenY - e.clientY) * 0.28;
        nextY = Number(clamp(Math.round(rawY * 2) / 2, 2, 260).toFixed(1));
      } else {
        setPointerNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNdc, trackCamera);
        if (raycaster.ray.intersectPlane(wpDragPlane, _wpDragHit)) {
          nextX = clamp(Math.round(_wpDragHit.x / snapStep) * snapStep, -620, 620);
          nextZ = clamp(Math.round(_wpDragHit.z / snapStep) * snapStep, -620, 620);
        }
      }
      node.x = nextX;
      node.y = nextY;
      node.z = nextZ;
      syncWaypointMarkerPositions();
      callbacks.onStudioControlPointMoved?.(
        draggingBlueprintNodeIdx,
        { x: nextX, y: nextY, z: nextZ },
        false,
      );
      return;
    }

    if (appMode === 'custom_map' && !isPaused && Boolean(customBp) && studioToolMode === 'terrain') {
      const target = e.target as HTMLElement | null;
      if (target === renderer.domElement || isTerrainBrushing) {
        setPointerNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNdc, trackCamera);
        const hits = raycaster.intersectObjects([terrainRig.group, roadRig.group], true);
        if (hits.length > 0) {
          const pt = hits[0].point;
          brushRingMesh.position.set(pt.x, pt.y + 0.35, pt.z);
          brushRingMesh.scale.setScalar(studioBrushRadius);
          brushRingMesh.visible = true;
          if (isTerrainBrushing) {
            const moveDist = Math.hypot(pt.x - lastBrushWorldX, pt.z - lastBrushWorldZ);
            if (moveDist >= Math.max(4, studioBrushRadius * 0.28)) {
              lastBrushWorldX = pt.x;
              lastBrushWorldZ = pt.z;
              callbacks.onStudioTerrainBrushHit?.(
                Number(pt.x.toFixed(2)),
                Number(pt.y.toFixed(2)),
                Number(pt.z.toFixed(2)),
                true,
              );
            }
          }
        } else {
          brushRingMesh.visible = false;
        }
      } else {
        brushRingMesh.visible = false;
      }
    } else if (brushRingMesh.visible) {
      brushRingMesh.visible = false;
    }

    if (draggingWaypointIdx !== null && appMode === 'custom_map' && !isPaused) {
      setPointerNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, trackCamera);
      if (raycaster.ray.intersectPlane(wpDragPlane, _wpDragHit)) {
        const dx = Math.round(clamp(_wpDragHit.x - wpDragBaseX, -65, 65));
        const dz = Math.round(clamp(_wpDragHit.z - wpDragBaseZ, -65, 65));
        const baseCfg = latestPreviewCfg ?? getCircuitCustomization();
        const nextCfg: MapCustomizationConfig = {
          ...baseCfg,
          waypointOffsets: {
            ...baseCfg.waypointOffsets,
            [draggingWaypointIdx]: { dx, dz },
          },
          waypointBanking: { ...baseCfg.waypointBanking },
        };
        syncWaypointMarkerPositions(nextCfg);
        callbacks.onWaypointDragged?.(draggingWaypointIdx, dx, dz);
      }
      return;
    }

    if (photoModeActive && photoDragActive && !isPaused && (photoCarFrozen || appMode === 'garage')) {
      const dx = e.clientX - photoLastPointerX;
      const dy = e.clientY - photoLastPointerY;
      photoLastPointerX = e.clientX;
      photoLastPointerY = e.clientY;
      applyPhotoPointerDelta(dx, dy, photoDragButton === 2);
      return;
    }

    if (!isInteriorRmbDown) return;
    lookTargetYaw = clamp(lookTargetYaw - e.movementX * 0.0042, -2.35, 2.35);
    lookTargetPitch = clamp(lookTargetPitch - e.movementY * 0.0036, -0.45, 0.72);
  };

  const applyPhotoPointerDelta = (dx: number, dy: number, isPanButton: boolean) => {
    if (photoViewMode === 'drone' || photoViewMode === 'interior') {
      if (isPanButton) {
        _photoCamFwd.set(
          Math.cos(photoPitch) * Math.sin(photoYaw),
          Math.sin(photoPitch),
          Math.cos(photoPitch) * Math.cos(photoYaw),
        ).normalize();
        _photoCamRight.crossVectors(_photoCamFwd, _worldUp).normalize();
        const panAmt = photoViewMode === 'interior' ? 0.0025 : 0.014;
        photoCamPos.addScaledVector(_photoCamRight, -dx * panAmt);
        photoCamPos.y += dy * panAmt;
      } else {
        photoYaw -= dx * 0.0046;
        photoPitch = clamp(photoPitch - dy * 0.0040, -1.48, 1.48);
      }
    } else {
      if (isPanButton) {
        const cosP = Math.cos(photoOrbitPitch);
        _photoCamFwd.set(-cosP * Math.sin(photoOrbitYaw), 0, -cosP * Math.cos(photoOrbitYaw)).normalize();
        _photoCamRight.crossVectors(_photoCamFwd, _worldUp).normalize();
        photoOrbitOffset.addScaledVector(_photoCamRight, -dx * 0.012);
        photoOrbitOffset.y = clamp(photoOrbitOffset.y + dy * 0.012, -1.0, 12.0);
      } else {
        photoOrbitYaw -= dx * 0.0055;
        photoOrbitPitch = clamp(photoOrbitPitch + dy * 0.0048, -0.22, 1.38);
      }
    }
  };

  const onCanvasWheel = (e: WheelEvent) => {
    if (!photoModeActive || isPaused || (!photoCarFrozen && appMode !== 'garage')) return;
    e.preventDefault();
    const step = clamp(e.deltaY, -120, 120) / 100;
    if (e.shiftKey) {
      photoFovDeg = clamp(photoFovDeg + step * 2.5, 20, 95);
      emitPhotoState();
      return;
    }
    if (photoViewMode === 'drone' || photoViewMode === 'interior') {
      _photoCamFwd.set(
        Math.cos(photoPitch) * Math.sin(photoYaw),
        Math.sin(photoPitch),
        Math.cos(photoPitch) * Math.cos(photoYaw),
      ).normalize();
      const dolly = photoViewMode === 'interior' ? 0.12 : 0.65;
      photoCamPos.addScaledVector(_photoCamFwd, -step * dolly);
    } else {
      photoOrbitDist = clamp(photoOrbitDist + step * 0.55, 1.4, 42);
    }
  };

  const onCanvasTouchStart = (e: TouchEvent) => {
    if (!photoModeActive || isPaused || (!photoCarFrozen && appMode !== 'garage')) return;
    if (photoTouchId === null && e.changedTouches.length > 0) {
      const t = e.changedTouches[0];
      photoTouchId = t.identifier;
      photoDragActive = true;
      photoDragButton = 0;
      photoLastPointerX = t.clientX;
      photoLastPointerY = t.clientY;
    }
  };

  const onWindowTouchMove = (e: TouchEvent) => {
    if (!photoModeActive || !photoDragActive || photoTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === photoTouchId) {
        const dx = t.clientX - photoLastPointerX;
        const dy = t.clientY - photoLastPointerY;
        photoLastPointerX = t.clientX;
        photoLastPointerY = t.clientY;
        applyPhotoPointerDelta(dx, dy, false);
        break;
      }
    }
  };

  const onWindowTouchEnd = (e: TouchEvent) => {
    if (photoTouchId === null) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === photoTouchId) {
        photoTouchId = null;
        photoDragActive = false;
        break;
      }
    }
  };

  const onWindowMouseUp = (e: MouseEvent) => {
    photoDragActive = false;
    if (e.button === 2) {
      isInteriorRmbDown = false;
    }
    if (e.button === 0 && draggingBlueprintNodeIdx !== null) {
      const idx = draggingBlueprintNodeIdx;
      const customBp = getCustomBlueprint();
      const pt = customBp?.controlPoints[idx];
      draggingBlueprintNodeIdx = null;
      bpDragVerticalMode = false;
      renderer.domElement.style.cursor = 'default';
      syncControlModes();
      if (pt) {
        callbacks.onStudioControlPointMoved?.(idx, { x: pt.x, y: pt.y, z: pt.z }, true);
      }
      return;
    }
    if (e.button === 0 && isTerrainBrushing) {
      isTerrainBrushing = false;
      syncControlModes();
      callbacks.onStudioTerrainBrushEnd?.();
      return;
    }
    if (e.button === 0 && draggingWaypointIdx !== null) {
      draggingWaypointIdx = null;
      renderer.domElement.style.cursor = 'default';
      syncControlModes();
      return;
    }
    if (e.button === 0 && appMode === 'custom_map' && !isPaused) {
      if (getCustomBlueprint()) {
        if (isGizmoDragging || transformControls.axis !== null) return;
        if (e.target !== renderer.domElement) return;
        const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if (moved < 6) {
          const hit = raycastTrackWorldInternal(e.clientX, e.clientY);
          if (studioToolMode === 'place') {
            if (hit?.propId) {
              callbacks.onStudioPropSelected?.(hit.propId);
            } else if (hit) {
              callbacks.onStudioPlacePropAt?.(hit.x, hit.y, hit.z);
            }
          } else if (studioToolMode !== 'terrain') {
            callbacks.onStudioPropSelected?.(hit?.propId ?? null);
          }
        }
        return;
      }

      const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (moved < 6) {
        setPointerNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNdc, trackCamera);
        const hits = raycaster.intersectObjects(wpClickableMeshes, false);
        if (hits.length > 0) {
          const wpIdx = hits[0].object.userData.waypointIndex;
          if (typeof wpIdx === 'number') {
            selectedWaypointIdx = wpIdx;
            syncWaypointMarkerPositions();
            callbacks.onWaypointSelected?.(wpIdx);
          }
        }
      }
    }
  };
  const onCanvasContextMenu = (e: MouseEvent) => {
    if ((appMode === 'racing' && !isSpectatorMode()) || photoModeActive) {
      e.preventDefault();
    }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearInputsOnBlur);
  window.addEventListener('mousemove', onWindowMouseMove);
  window.addEventListener('mouseup', onWindowMouseUp);
  window.addEventListener('touchmove', onWindowTouchMove, { passive: true });
  window.addEventListener('touchend', onWindowTouchEnd);
  window.addEventListener('touchcancel', onWindowTouchEnd);
  renderer.domElement.addEventListener('mousedown', onCanvasMouseDown);
  renderer.domElement.addEventListener('wheel', onCanvasWheel, { passive: false });
  renderer.domElement.addEventListener('touchstart', onCanvasTouchStart, { passive: true });
  renderer.domElement.addEventListener('contextmenu', onCanvasContextMenu);

  const onContextLost = (e: Event) => {
    e.preventDefault();
    callbacks.onContextLost(true);
  };
  const onContextRestored = () => {
    callbacks.onContextLost(false);
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

  const onResize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (!w || !h || w < 2 || h < 2) return;
    trackCamera.aspect = w / h;
    trackCamera.updateProjectionMatrix();
    garageCamera.aspect = w / h;
    garageCamera.updateProjectionMatrix();
    const dpr = renderer.getPixelRatio();
    renderer.setSize(w, h);
    if (composer) {
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      bloomPass?.resolution.set(Math.max(1, Math.floor(w * 0.5)), Math.max(1, Math.floor(h * 0.5)));
    }
    if (garageComposer) {
      garageComposer.setPixelRatio(dpr);
      garageComposer.setSize(w, h);
      garageBloomPass?.resolution.set(Math.max(1, Math.floor(w * 0.5)), Math.max(1, Math.floor(h * 0.5)));
    }
    if (isBackgroundFrozen) {
      renderCurrentFrozenFrame();
    }
  };
  window.addEventListener('resize', onResize);

  let frameId = 0;
  let lastUiSync = -1;
  let lastHudSync = -1;
  const clock = new THREE.Clock();

  function renderCurrentFrozenFrame() {
    if (disposed) return;
    if (appMode === 'garage' && !isSpectatorMode()) {
      renderGarageFrame();
    } else {
      const interiorActive =
        appMode === 'racing' &&
        !isSpectatorMode() &&
        ((photoModeActive && photoViewMode === 'interior') ||
          (!photoModeActive && (drivingCameraMode === 'cockpit' || drivingCameraMode === 'windshield')));
      renderTrackFrame(
        interiorActive,
        appMode === 'racing' ? lastDirtLevel : 0,
        clock.elapsedTime,
        lastRainIntensityForPostFx,
      );
    }
  }

  function afterDraw(cb: () => void) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 80);
      }
    };
    frameId = window.setTimeout(poll, 5);
  }

  function updateDrivingCamera(delta: number, speedMps: number, elapsedSec = 0) {
    const speedRatio = clamp(speedMps / 95, 0, 1);
    const isInterior = drivingCameraMode === 'cockpit' || drivingCameraMode === 'windshield';

    const targetNear = isInterior ? 0.16 : 0.50;
    const fovOffset = clamp(cinematicSettings.baseFovDeg - 58, -12, 16);
    const baseFov =
      (drivingCameraMode === 'cockpit'
        ? 70
        : drivingCameraMode === 'windshield'
        ? 60
        : drivingCameraMode === 'hood' || drivingCameraMode === 'bumper'
        ? 58
        : 50) + fovOffset;
    const fovSpread =
      (drivingCameraMode === 'cockpit' ? 6.0 : drivingCameraMode === 'windshield' ? 8.0 : 14.0) *
      clamp(cinematicSettings.speedFovBoost, 0, 1.6);
    const targetFov = clamp(baseFov + speedRatio * fovSpread, 38, 92);
    const smoothedFov = lerp(lastCamFov, targetFov, 1 - Math.exp(-7.0 * delta));
    syncTrackProjection(smoothedFov, targetNear);

    if (!isInteriorRmbDown) {
      const recenterAlpha = 1 - Math.exp(-7.5 * delta);
      lookTargetYaw = lerp(lookTargetYaw, 0, recenterAlpha);
      lookTargetPitch = lerp(lookTargetPitch, 0, recenterAlpha);
    }
    const lookSmooth = 1 - Math.exp(-16.0 * delta);
    lookYaw = lerp(lookYaw, lookTargetYaw, lookSmooth);
    lookPitch = lerp(lookPitch, lookTargetPitch, lookSmooth);

    const p = physics.pos;
    const fwd = physics.forwardDir;
    const up = physics.upDir;

    if (keyInput.lookBack) {
      trackCamera.up.set(0, 1, 0);
      _driveDesiredPos
        .copy(p)
        .addScaledVector(fwd, 5.8)
        .addScaledVector(up, 2.05);
      _driveDesiredLook
        .copy(p)
        .addScaledVector(fwd, -4.0)
        .addScaledVector(up, 0.85);
      trackCamera.position.copy(_driveDesiredPos);
      trackCamera.lookAt(_driveDesiredLook);
      return;
    }

    if (isInterior) {
      _cockpitSpringEuler.set(physics.bodyPitch * 0.45, 0, physics.bodyRoll * 0.45);
      _cockpitSpringQuat.setFromEuler(_cockpitSpringEuler);

      const localAnchor =
        drivingCameraMode === 'cockpit'
          ? (trackCarInstance?.cockpitEyePos ?? _fallbackCockpitEye)
          : (trackCarInstance?.windshieldPos ?? _fallbackWindshieldPos);

      _driveDesiredPos
        .copy(localAnchor)
        .applyQuaternion(_cockpitSpringQuat)
        .applyQuaternion(physics.worldQuaternion)
        .add(p);

      _cockpitCamUp
        .set(0, 1, 0)
        .applyQuaternion(_cockpitSpringQuat)
        .applyQuaternion(physics.worldQuaternion)
        .normalize();
      trackCamera.up.copy(_cockpitCamUp);

      const basePitchBias =
        drivingCameraMode === 'cockpit'
          ? -0.046
          : drivingCameraMode === 'windshield'
          ? -0.020
          : 0;
      const effPitch = lookPitch + basePitchBias;
      _cockpitLocalLook.set(
        Math.cos(effPitch) * Math.sin(lookYaw),
        Math.sin(effPitch),
        Math.cos(effPitch) * Math.cos(lookYaw),
      );
      _cockpitLocalLook
        .applyQuaternion(_cockpitSpringQuat)
        .applyQuaternion(physics.worldQuaternion);

      _driveDesiredLook.copy(_driveDesiredPos).addScaledVector(_cockpitLocalLook, 16.0);
      trackCamera.position.copy(_driveDesiredPos);
      trackCamera.lookAt(_driveDesiredLook);
      return;
    }

    trackCamera.up.set(0, 1, 0);

    if (drivingCameraMode === 'hood') {
      const localHood = trackCarInstance?.hoodCamPos ?? _fallbackHoodPos;
      _driveDesiredPos
        .copy(localHood)
        .applyQuaternion(physics.worldQuaternion)
        .add(p);
      _driveDesiredLook
        .copy(_driveDesiredPos)
        .addScaledVector(fwd, 28.0)
        .addScaledVector(up, -0.34);
      trackCamera.position.copy(_driveDesiredPos);
      trackCamera.lookAt(_driveDesiredLook);
      return;
    }

    if (drivingCameraMode === 'bumper') {
      const localBumper = trackCarInstance?.bumperCamPos ?? _fallbackBumperPos;
      _driveDesiredPos
        .copy(localBumper)
        .applyQuaternion(physics.worldQuaternion)
        .add(p);
      _driveDesiredLook
        .copy(_driveDesiredPos)
        .addScaledVector(fwd, 30.0)
        .addScaledVector(up, -0.10);
      trackCamera.position.copy(_driveDesiredPos);
      trackCamera.lookAt(_driveDesiredLook);
      return;
    }

    const carLenScale = clamp((trackCarInstance?.carLengthM ?? 4.65) / 4.65, 0.84, 1.24);
    const distBack = ((drivingCameraMode === 'chaseFar' ? 8.8 : 6.2) * carLenScale) + speedRatio * 0.85;
    const heightUp = (drivingCameraMode === 'chaseFar' ? 2.95 : 2.12) * lerp(1, carLenScale, 0.35);
    const lookAhead = drivingCameraMode === 'chaseFar' ? 10.2 : 8.6;

    // Velocity-blended chase camera: lags slightly behind slip angle for crisp cornering feedback
    _chaseBlendDir.copy(fwd);
    if (speedMps > 4.5) {
      const horizSpeed = Math.hypot(physics.vx, physics.vz);
      if (horizSpeed > 3.5) {
        _chaseVelDir.set(physics.vx / horizSpeed, fwd.y * 0.35, physics.vz / horizSpeed).normalize();
        const blendFactor = clamp((horizSpeed - 4.5) / 24, 0, 1) * 0.34;
        _chaseBlendDir.lerp(_chaseVelDir, blendFactor).normalize();
      }
    }

    _driveDesiredPos
      .copy(p)
      .addScaledVector(_chaseBlendDir, -distBack)
      .addScaledVector(up, heightUp);

    const terrainFloor = groundHeightAt(_driveDesiredPos.x, _driveDesiredPos.z) + 1.15;
    if (_driveDesiredPos.y < terrainFloor) {
      _driveDesiredPos.y = terrainFloor;
    }

    _driveDesiredLook
      .copy(p)
      .addScaledVector(_chaseBlendDir, lookAhead)
      .addScaledVector(up, 0.92);

    if (snapDriveCameraNext) {
      trackCamera.position.copy(_driveDesiredPos);
      trackControls.target.copy(_driveDesiredLook);
      snapDriveCameraNext = false;
    } else {
      const posAlpha = 1 - Math.exp(-12.5 * delta);
      const lookAlpha = 1 - Math.exp(-16.5 * delta);
      trackCamera.position.lerp(_driveDesiredPos, posAlpha);
      trackControls.target.lerp(_driveDesiredLook, lookAlpha);
    }

    const shakeWeight = clamp(cinematicSettings.cameraShake, 0, 1.5);
    if (shakeWeight > 0.01 && speedMps > 4) {
      const amp =
        (speedRatio * speedRatio * 0.022 + lastKerbRumble * 0.032 + lastWallImpact * 0.075) *
        shakeWeight;
      if (amp > 0.0005) {
        trackCamera.position.x += Math.sin(elapsedSec * 41.3) * amp;
        trackCamera.position.y += Math.cos(elapsedSec * 53.7) * amp * 0.72;
      }
    }
    trackCamera.lookAt(trackControls.target);
  }

  const syncComposerPassesForState = (throttleLevel: 0 | 1 | 2) => {
    const useComposer =
      !composerBroken &&
      !isSoftwareGl &&
      postFxEnabled &&
      isComposerQuality(graphicsQuality);
    const hasPostColorFx =
      graphicsQuality !== 'low' &&
      graphicsQuality !== 'recommended' &&
      graphicsQuality !== 'balanced';
    const isMaxPlus = graphicsQuality === 'max' || graphicsQuality === 'ultra';

    if (composer) {
      if (carPostFxPass) {
        carPostFxPass.enabled = useComposer && hasPostColorFx && throttleLevel < 2;
      }
      if (bloomPass) {
        bloomPass.enabled = useComposer && graphicsQuality !== 'low' && throttleLevel < 2;
      }
      if (cinemaPass) {
        cinemaPass.enabled = useComposer && hasPostColorFx;
      }
      if (smaaPass) {
        smaaPass.enabled = useComposer;
      }
      if (gtaoPass) {
        gtaoPass.enabled =
          useComposer &&
          isMaxPlus &&
          currentInspectMode === 'lit' &&
          throttleLevel === 0;
        if (gtaoPass.enabled) {
          gtaoPass.updateGtaoMaterial({
            samples: graphicsQuality === 'ultra' ? 12 : 8,
          });
        }
      }
    }

    if (garageComposer) {
      if (garageSanitizePass) {
        garageSanitizePass.enabled = useComposer;
      }
      if (garageBloomPass) {
        garageBloomPass.enabled = useComposer && graphicsQuality !== 'low' && throttleLevel < 2;
      }
      if (garageCinemaPass) {
        garageCinemaPass.enabled = useComposer && hasPostColorFx;
      }
      if (garageSmaaPass) {
        garageSmaaPass.enabled = useComposer;
      }
    }
  };

  const applyAdaptiveQualitySettings = (throttleLevel: 0 | 1 | 2) => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return;
    const nativeDpr = getDprCap(graphicsQuality);
    const effDpr = isSoftwareGl
      ? 1
      : Math.max(0.75, Math.min(nativeDpr, nativeDpr * profiler.getDrsScale()));
    profiler.setEffectiveDpr(effDpr);
    audio.setLowCpuAudio(graphicsQuality === 'low' || throttleLevel >= 2);
    renderer.setPixelRatio(effDpr);
    renderer.setSize(w, h);
    if (composer) {
      composer.setPixelRatio(effDpr);
      composer.setSize(w, h);
    }
    if (garageComposer) {
      garageComposer.setPixelRatio(effDpr);
      garageComposer.setSize(w, h);
    }
    syncComposerPassesForState(throttleLevel);
  };

  const applyShadowSettingsInternal = () => {
    const shadowsEnabled = !isSoftwareGl && shadowQualityOpt !== 'off';
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.needsUpdate = shadowsEnabled;
    skyRig.setShadowsEnabled(shadowsEnabled);
    if (shadowsEnabled) {
      skyRig.setShadowQuality(getShadowMapDimForOption(shadowQualityOpt));
    }
    garageStage.setShadowQuality(shadowQualityOpt);
    if (isBackgroundFrozen) {
      renderCurrentFrozenFrame();
    }
  };

  const applyTextureSizeInternal = () => {
    const texTier = getTextureTierForOption();
    textures?.setQualityProfile(texTier);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    carTemplateMap.forEach((tpl) => tpl.setTextureQuality(texTier, maxAniso));
    if (isBackgroundFrozen) {
      renderCurrentFrozenFrame();
    }
  };

  const applyRenderResolutionInternal = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (w < 2 || h < 2) return;
    const nextDpr = getDprCap(graphicsQuality);
    profiler.setEffectiveDpr(nextDpr);
    renderer.setPixelRatio(nextDpr);
    renderer.setSize(w, h);
    if (composer) {
      composer.setPixelRatio(nextDpr);
      composer.setSize(w, h);
      bloomPass?.resolution.set(
        Math.max(1, Math.floor(w * 0.5)),
        Math.max(1, Math.floor(h * 0.5)),
      );
    }
    if (garageComposer) {
      garageComposer.setPixelRatio(nextDpr);
      garageComposer.setSize(w, h);
      garageBloomPass?.resolution.set(
        Math.max(1, Math.floor(w * 0.5)),
        Math.max(1, Math.floor(h * 0.5)),
      );
    }
    if (isBackgroundFrozen) {
      renderCurrentFrozenFrame();
    }
  };

  const applyGraphicsQualityInternal = (quality: GraphicsQuality, force = false) => {
    const nextQuality: GraphicsQuality = quality;
    if (!force && graphicsInitialized && nextQuality === graphicsQuality) return;
    graphicsInitialized = true;
    profiler.beginTransition(`Quality -> ${nextQuality}`);
    graphicsQuality = nextQuality;
    profiler.resetAllThrottle();
    setUserAssetBudgetMode(getUserAssetBudgetFor(graphicsQuality));
    const subQ = toSubQualityTier(graphicsQuality);
    const nextDpr = getDprCap(graphicsQuality);
    profiler.setEffectiveDpr(nextDpr);
    audio.setLowCpuAudio(graphicsQuality === 'low');
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(nextDpr);
    renderer.setSize(w, h);
    if (isComposerQuality(graphicsQuality)) {
      if (appMode === 'garage' && !isSpectatorMode()) {
        ensureGarageComposer();
      } else {
        ensureTrackComposer();
      }
      if (graphicsQuality === 'max' || graphicsQuality === 'ultra') {
        ensureGtaoPass();
      }
    }
    if (composer) {
      composer.setPixelRatio(nextDpr);
      composer.setSize(w, h);
      bloomPass?.resolution.set(
        Math.max(1, Math.floor(w * 0.5)),
        Math.max(1, Math.floor(h * 0.5)),
      );
    }
    if (garageComposer) {
      garageComposer.setPixelRatio(nextDpr);
      garageComposer.setSize(w, h);
      garageBloomPass?.resolution.set(
        Math.max(1, Math.floor(w * 0.5)),
        Math.max(1, Math.floor(h * 0.5)),
      );
    }
    syncComposerPassesForState(0);
    skyRig.setPerformanceFogScale(getFogScaleForQuality(graphicsQuality));
    garageStage.setGraphicsQuality(graphicsQuality);
    propsRig.setGraphicsQuality(subQ);
    applyShadowSettingsInternal();
    applyTextureSizeInternal();
    profiler.endTransition(clock.elapsedTime);
    if (isBackgroundFrozen) {
      renderCurrentFrozenFrame();
    }
  };

  const renderGarageFrame = () => {
    const useGarageComposer =
      !composerBroken &&
      !isSoftwareGl &&
      postFxEnabled &&
      isComposerQuality(graphicsQuality);
    const activeGarageComposer = useGarageComposer
      ? (garageComposer ?? ensureGarageComposer())
      : null;
    if (activeGarageComposer) {
      try {
        activeGarageComposer.render();
      } catch {
        composerBroken = true;
        renderer.render(garageStage.scene, garageCamera);
      }
    } else {
      renderer.render(garageStage.scene, garageCamera);
    }
  };

  const renderTrackFrame = (
    interiorActive: boolean,
    dirtLevel: number,
    elapsedSec = 0,
    rainAmount = 0,
  ) => {
    // Guard against any non-finite camera coordinate reaching G-Buffer / shadow matrices
    if (
      !Number.isFinite(trackCamera.position.x) ||
      !Number.isFinite(trackCamera.position.y) ||
      !Number.isFinite(trackCamera.position.z)
    ) {
      const safe = getActiveVantage('overview');
      trackCamera.position.copy(safe.position);
      trackControls.target.copy(safe.target);
      trackCamera.lookAt(trackControls.target);
    }

    if (cinemaPass) {
      cinemaPass.uniforms.uTime.value = elapsedSec;
      cinemaPass.uniforms.uRainAmount.value = rainAmount;
      const nf = clamp(currentNightFactor, 0, 1);
      cinemaPass.uniforms.uNightFactor.value = nf;
      skyRig.getSunDirection(_sunDirScratch);
      trackCamera.getWorldDirection(_sunCamFwdScratch);
      const facingSun = _sunCamFwdScratch.dot(_sunDirScratch);
      const sunAbove = clamp((_sunDirScratch.y + 0.06) / 0.22, 0, 1);
      const ovFactor = lastPostFxOvercast >= 0 ? lastPostFxOvercast : 0;
      const sunVis =
        facingSun > 0.08 && sunAbove > 0.01 && currentInspectMode === 'lit'
          ? clamp((facingSun - 0.08) / 0.65, 0, 1) *
            sunAbove *
            (1 - nf * 0.85) *
            (1 - clamp(ovFactor, 0, 1) * 0.82)
          : 0;
      cinemaPass.uniforms.uSunScreenVis.value = sunVis;
      if (sunVis > 0.005) {
        _sunProjScratch
          .copy(trackCamera.position)
          .addScaledVector(_sunDirScratch, 1000)
          .project(trackCamera);
        cinemaPass.uniforms.uSunScreenUv.value.set(
          _sunProjScratch.x * 0.5 + 0.5,
          _sunProjScratch.y * 0.5 + 0.5,
        );
        const skyPal = skyRig.getSkyPalette();
        cinemaPass.uniforms.uSunGlowColor.value
          .copy(skyPal.horizon)
          .lerp(_sunWarmFallback, 0.55);
      }
    }

    const useComposer =
      !composerBroken &&
      !isSoftwareGl &&
      postFxEnabled &&
      isComposerQuality(graphicsQuality);
    const activeComposer = useComposer ? (composer ?? ensureTrackComposer()) : null;
    const hasPostColorFx =
      graphicsQuality !== 'low' &&
      graphicsQuality !== 'recommended' &&
      graphicsQuality !== 'balanced';
    if (carPostFxPass) {
      const skyPal = skyRig.getSkyPalette();
      const ssrDisabled = !useComposer || !hasPostColorFx || graphicsQuality === 'medium';
      carPostFxPass.setSceneParams({
        dirtLevel,
        isInteriorView: interiorActive,
        skyZenith: skyPal.zenith,
        skyHorizon: skyPal.horizon,
        ssrStrength: ssrDisabled
          ? 0.0
          : graphicsQuality === 'high'
          ? 0.85
          : graphicsQuality === 'max'
          ? 0.95
          : 1.0,
        lutStrength: useComposer && hasPostColorFx ? 1.0 : 0.0,
        ssrSteps: ssrDisabled
          ? 0
          : graphicsQuality === 'high'
          ? 4
          : graphicsQuality === 'max'
          ? 6
          : 8,
        farBlurStrength: 0.0,
      });
    }

    if (activeComposer && postFxEnabled && useComposer) {
      try {
        activeComposer.render();
      } catch {
        composerBroken = true;
        renderer.render(trackScene, trackCamera);
      }
    } else {
      renderer.render(trackScene, trackCamera);
    }
  };

  const rebuildWorldForCurrentCircuit = (rebuildCctv: boolean, useCache = true) => {
    getTextures().hydrateWorldPhotoTextures?.();
    cachedMinimap = null;
    const activeId = getActiveMapId();
    const outgoingMapId = currentBuiltMapId;

    trackScene.remove(terrainRig.group);
    trackScene.remove(roadRig.group);
    trackScene.remove(landmarksRig.group);
    trackScene.remove(propsRig.group);
    trackScene.remove(flagMarshalsRig.group);
    trackScene.remove(customPropsRig.group);
    customPropsRig.dispose();
    if (rebuildCctv) {
      trackScene.remove(cctvRig.group);
    }

    if (useCache && rebuildCctv && outgoingMapId !== null && outgoingMapId !== activeId) {
      const prevEntry = mapRigCache.get(outgoingMapId);
      if (prevEntry) {
        disposeMapCacheEntry(prevEntry);
      }
      mapRigCache.set(outgoingMapId, {
        terrainRig,
        roadRig,
        landmarksRig,
        propsRig,
        flagMarshalsRig,
        cctvRig,
        colliderSnapshot: worldColliders.exportSnapshot(),
        grandstandPos: cachedGrandstandPos,
        builtGraphicsQuality: graphicsQuality,
        customRevisionKey: getCustomRevisionKey(outgoingMapId),
      });
      trimMapRigCache(outgoingMapId);
    } else {
      terrainRig.dispose();
      roadRig.dispose();
      landmarksRig.dispose();
      propsRig.dispose();
      flagMarshalsRig.dispose();
      if (rebuildCctv) {
        cctvRig.dispose();
      }
      if (!useCache) {
        const stale = mapRigCache.get(activeId);
        if (stale) {
          disposeMapCacheEntry(stale);
          mapRigCache.delete(activeId);
        }
      }
    }

    const activeMeta = MAP_REGISTRY[activeId];
    getTextures().setCircuitBranding?.(activeMeta.name, activeMeta.region, activeMeta.accentHex);

    const revKey = getCustomRevisionKey(activeId);
    const cachedEntry = useCache && rebuildCctv ? mapRigCache.get(activeId) : undefined;

    if (cachedEntry && cachedEntry.customRevisionKey === revKey) {
      mapRigCache.delete(activeId);
      terrainRig = cachedEntry.terrainRig;
      roadRig = cachedEntry.roadRig;
      landmarksRig = cachedEntry.landmarksRig;
      propsRig = cachedEntry.propsRig;
      flagMarshalsRig = cachedEntry.flagMarshalsRig;
      cctvRig = cachedEntry.cctvRig;
      worldColliders.restoreSnapshot(cachedEntry.colliderSnapshot);
      cachedGrandstandPos = cachedEntry.grandstandPos;
      if (cachedEntry.builtGraphicsQuality !== graphicsQuality) {
        propsRig.setGraphicsQuality(toSubQualityTier(graphicsQuality));
      }
    } else {
      if (cachedEntry) {
        disposeMapCacheEntry(cachedEntry);
        mapRigCache.delete(activeId);
      }
      worldColliders.resetAll();
      const built = buildRigsForMapId(activeId, rebuildCctv);
      terrainRig = built.tRig;
      roadRig = built.rRig;
      landmarksRig = built.lRig;
      propsRig = built.pRig;
      flagMarshalsRig = built.fRig;
      if (rebuildCctv && built.cRig) {
        cctvRig = built.cRig;
      }
      cachedGrandstandPos = landmarksRig.getGrandstandWorldPos?.() ?? null;
    }

    currentBuiltMapId = activeId;
    trackWorldInitialized = true;

    trackScene.add(terrainRig.group);
    trackScene.add(roadRig.group);
    trackScene.add(landmarksRig.group);
    trackScene.add(propsRig.group);
    trackScene.add(flagMarshalsRig.group);
    customPropsRig = buildCustomPropsRig(getCustomBlueprint(), true, selectedBuilderPropId);
    trackScene.add(customPropsRig.group);
    syncStudioGizmoAttachment();

    if (rebuildCctv) {
      trackScene.add(cctvRig.group);
      if (trackCarInstance) {
        cctvRig.attachCar(trackCarInstance);
        carPostFxPass?.setCarRoot(trackCarInstance.root);
      }
      const rebuiltCircuit = getCircuitData();
      const rebuiltSf = rebuiltCircuit.samples[rebuiltCircuit.startFinishIndex];
      podiumRig.setPodiumPose(
        ...MAP_REGISTRY[activeId].podiumCenter,
        rebuiltSf.tangent.x,
        rebuiltSf.tangent.z,
      );
      rebuildWaypointMarkers();
      selectedWaypointIdx = getEditableWaypointsForActiveMap()[0]?.index ?? 0;
      latestPreviewCfg = getCircuitCustomization(activeId);
      syncControlModes();
    }

    applySurfaceLookFromConfig(getCircuitCustomization(activeId));
    applyAtmosphere(currentSolarDeg, currentHaze, currentWeather);

    terrainRig.setInspectMode(currentInspectMode);
    roadRig.setWireframe(currentInspectMode === 'wireframe');
    landmarksRig.setWireframe(currentInspectMode === 'wireframe');
    flagMarshalsRig.setWireframe(currentInspectMode === 'wireframe');
    cctvRig.setWireframe(currentInspectMode === 'wireframe');
    roadRig.setNightFactor(currentNightFactor);
    roadRig.setRubberLevel(0.08);
    landmarksRig.setNightFactor(currentNightFactor);
    propsRig.setNightFactor(currentNightFactor);
    cctvRig.setNightFactor(currentNightFactor);

    if (!rebuildCctv) {
      cctvRig.refreshCircuit();
    }
    aiRivalsRig.refreshCircuit();
    physics.refreshCircuit();
    syncWaypointMarkerPositions();

    if (!isSoftwareGl && !cachedEntry) {
      prewarmTrackShadersAsync();
    }
  };

  const ensureTrackWorldBuilt = () => {
    const activeId = getActiveMapId();
    if (!trackWorldInitialized || currentBuiltMapId !== activeId) {
      rebuildWorldForCurrentCircuit(true, true);
    }
  };

  function tick() {
    if (disposed || isBackgroundFrozen) {
      frameId = 0;
      return;
    }

    const frameStartMs = performance.now();
    const delta = Math.min(clock.getDelta(), 0.08);
    const elapsed = clock.elapsedTime;
    const activeSpectator = isSpectatorMode();

    if (!isSoftwareGl) {
      pumpGpuTextureQueue(renderer, appMode === 'racing' ? 1 : 2);
    }

    let physicsMs = 0;
    let worldMs = 0;
    let renderMs = 0;
    let uiSyncMs = 0;

    if (appMode === 'garage' && !activeSpectator) {
      audio.silence();
      const wStart = performance.now();
      if (photoModeActive) {
        garageStage.update(delta, elapsed, false);
        updatePhotoCamera(delta);
      } else {
        if (garageCamGoalPos && garageCamGoalTarget) {
          const camAlpha = 1 - Math.exp(-7.2 * delta);
          garageCamera.position.lerp(garageCamGoalPos, camAlpha);
          garageControls.target.lerp(garageCamGoalTarget, camAlpha);
          if (
            garageCamera.position.distanceToSquared(garageCamGoalPos) < 0.0004 &&
            garageControls.target.distanceToSquared(garageCamGoalTarget) < 0.0004
          ) {
            garageCamGoalPos = null;
            garageCamGoalTarget = null;
          }
        }
        garageStage.update(delta, elapsed, garageAutoRotate && !isPaused);
        garageControls.update();
      }
      garageCarInstance?.setActiveAeroState(
        physics.getCarSetup().activeAeroEnabled ?? true,
        garageAeroDeployedPreview,
        delta,
      );
      worldMs = performance.now() - wStart;

      const rStart = performance.now();
      renderGarageFrame();
      renderMs = performance.now() - rStart;
    } else {
      const wStart = performance.now();
      prewarmTrackShadersIfNeeded();
      terrainRig.updateWater(elapsed);

      const activeMap = getActiveMapId();
      const activeSnow = activeMap === 'frostpeak_pass' ? currentSnowAtmosphere : null;
      const isLiveRace =
        appMode === 'racing' &&
        !activeSpectator &&
        preRaceIntroSec <= 0 &&
        !isPaused &&
        !(photoModeActive && photoCarFrozen) &&
        !lastRaceFinished;

      if (autoCycle) {
        currentSolarDeg = (currentSolarDeg + delta * 12.0) % 360;
      }

      const contWeather = weatherManager.update(delta, isLiveRace, activeMap, activeSnow);
      currentWeather = contWeather.nearestPreset;
      lastRainIntensityForPostFx = activeSnow ? 0 : contWeather.rainIntensity;

      const atmoState = skyRig.updateContinuousWeather(
        currentSolarDeg,
        currentHaze,
        contWeather,
        activeSnow,
      );
      if (Math.abs(atmoState.nightFactor - currentNightFactor) > 0.008) {
        currentNightFactor = atmoState.nightFactor;
        roadRig.setNightFactor(currentNightFactor);
        landmarksRig.setNightFactor(currentNightFactor);
        propsRig.setNightFactor(currentNightFactor);
        cctvRig.setNightFactor(currentNightFactor);
      }
      updateAdaptivePostFx(false);
      if (autoCycle && elapsed - lastUiSync > 0.12) {
        lastUiSync = elapsed;
        callbacks.onSolarSync(Math.round(currentSolarDeg), atmoState.phaseLabel);
      }

      if (
        contWeather.activeLabel !== lastEmittedWeatherLabel ||
        contWeather.autoEnabled !== lastEmittedWeatherAuto ||
        Math.abs(contWeather.progressPct - lastEmittedWeatherPct) >= 4 ||
        elapsed - lastWeatherEmitAt > 0.65
      ) {
        lastWeatherEmitAt = elapsed;
        lastEmittedWeatherLabel = contWeather.activeLabel;
        lastEmittedWeatherAuto = contWeather.autoEnabled;
        lastEmittedWeatherPct = contWeather.progressPct;
        callbacks.onWeatherTelemetry?.({ ...contWeather });
      }

      overtakePulse = Math.max(0, overtakePulse - delta * 0.42);
      const focusCarPos = physics.pos;
      const distToGs = cachedGrandstandPos ? focusCarPos.distanceTo(cachedGrandstandPos) : 999;

      crowdTelemetryScratch.closestRivalGapSec = lastClosestGapSec;
      crowdTelemetryScratch.speedMps = lastLatestSpeedMps;
      crowdTelemetryScratch.playerDistToGrandstand = distToGs;
      crowdTelemetryScratch.latG = lastLatG;
      crowdTelemetryScratch.inDriftZone = lastInDriftZone;
      crowdTelemetryScratch.nearBestPace = lastNearBestPace;
      crowdPlayerPosScratch.x = focusCarPos.x;
      crowdPlayerPosScratch.z = focusCarPos.z;
      crowdTelemetryScratch.playerPos = crowdPlayerPosScratch;
      crowdTelemetryScratch.isFinalLap =
        currentRaceConfig.lapCount > 0 && lastLatestTlmLap >= currentRaceConfig.lapCount;
      crowdTelemetryScratch.isRacing = appMode === 'racing' && preRaceIntroSec <= 0;
      crowdTelemetryScratch.isPodium = appMode === 'podium';
      crowdTelemetryScratch.isFinished = lastRaceFinished;
      crowdTelemetryScratch.isCloseFinish = isCloseFinishFlag;
      crowdTelemetryScratch.positionChangedPulse = overtakePulse;
      crowdTelemetryScratch.reactivityScale = cinematicSettings.crowdReactivity;
      crowdTelemetryScratch.densityScale = cinematicSettings.crowdDensity;

      if (activeMap === 'frostpeak_pass') {
        const snowAccumRate = clamp(getCircuitCustomization(activeMap).snowAccumRate ?? 1.0, 0, 2);
        const snowIntensity =
          currentSnowAtmosphere === 'twilight_storm'
            ? 0.016
            : currentSnowAtmosphere === 'alpine_snow'
            ? 0.008
            : -0.006;
        if (isLiveRace || snowIntensity < 0) {
          lastSnowAccumLevel = clamp(lastSnowAccumLevel + snowIntensity * snowAccumRate * delta, 0, 1);
        }
        roadRig.setSnowAccumulation?.(lastSnowAccumLevel);
      } else if (lastSnowAccumLevel !== 0) {
        lastSnowAccumLevel = 0;
        roadRig.setSnowAccumulation?.(0);
      }

      landmarksRig.update(elapsed, delta, crowdTelemetryScratch);
      remotePlayersRig.update(delta, currentNightFactor, contWeather.wetness);
      worldMs = performance.now() - wStart;

      let interiorViewForPostFx = false;
      let dirtForPostFx = 0;

      if (appMode === 'podium') {
        audio.silence();
        audio.updateSpatialAmbience(trackCamera.position, 0, 0, 'podium', elapsed, activeMap, currentWeather);
        podiumRig.update(delta, elapsed);
        flagMarshalsRig.update(delta, elapsed, 'checkered', null);

        const park = podiumRig.getCarParkPose();
        _podiumParkQuat.setFromAxisAngle(_worldUp, park.yaw);
        _podiumFwd.set(Math.sin(park.yaw), 0, Math.cos(park.yaw));
        _podiumRight.set(-Math.cos(park.yaw), 0, Math.sin(park.yaw));
        cctvRig.applyPlayerState({
          pos: park.pos,
          quat: _podiumParkQuat,
          forward: _podiumFwd,
          right: _podiumRight,
          up: _worldUp,
          bodyPitch: 0,
          bodyRoll: 0,
          bodyHeave: 0,
          wheelSpin: 0,
          steerAngle: -0.22,
          speedMps: 0,
          brakeSkidIntensity: 0,
          brakePedal: 0,
          handbrake: false,
          headlightsOn: true,
          dirtLevel: lastDirtLevel * 0.4,
          wetness: contWeather.wetness,
          isInteriorView: false,
          activeAeroEnabled: true,
          aeroDeployed: true,
          deltaSec: delta,
        });
        cctvRig.update(delta, elapsed);

        podiumRig.getPodiumPose(
          _podiumCamPos,
          _podiumCamTarget,
          podiumCameraAngle,
        );
        trackCamera.up.set(0, 1, 0);
        syncTrackProjection(44, 0.25);
        trackCamera.position.lerp(_podiumCamPos, 1 - Math.exp(-5.0 * delta));
        trackControls.target.lerp(_podiumCamTarget, 1 - Math.exp(-6.0 * delta));
        trackCamera.lookAt(trackControls.target);
        skyRig.setShadowBounds(105);
        skyRig.updateShadowCenter(trackControls.target);
      } else if (appMode === 'replay') {
        if (!isPaused) {
          replayPlayer.advance(delta);
        }
        const snap = replayPlayer.sample();
        const rec = replayPlayer.getRecording();
        if (snap && rec) {
          const isCockpitCam = replayCameraMode === 'cockpit';
          interiorViewForPostFx = isCockpitCam;
          dirtForPostFx = snap.dirtLevel;
          cctvRig.applyPlayerState({
            pos: snap.pos,
            quat: snap.quat,
            forward: snap.forward,
            right: snap.right,
            up: snap.up,
            bodyPitch: snap.bodyPitch,
            bodyRoll: snap.bodyRoll,
            bodyHeave: snap.bodyHeave,
            wheelSpin: snap.wheelSpin,
            wheelSpins: snap.wheelSpins,
            wheelSuspOffsets: snap.wheelSuspOffsets,
            steerAngle: snap.steerAngle,
            steerAngleFL: snap.steerAngleFL,
            steerAngleFR: snap.steerAngleFR,
            speedMps: snap.speedMps,
            brakeSkidIntensity: snap.brakeSkidIntensity,
            brakePedal: snap.brake,
            handbrake: snap.handbrake,
            surface: 'tarmac',
            headlightsOn: snap.headlightsOn,
            dirtLevel: snap.dirtLevel,
            wetness: contWeather.wetness,
            isInteriorView: isCockpitCam,
            activeAeroEnabled: true,
            aeroDeployed: snap.aeroDeployed,
            deltaSec: delta,
          });
          if (rec.hasRivals && snap.rivalsCount > 0) {
            aiRivalsRig.applyReplayPoses(
              snap.rivals,
              snap.rivalsCount,
              currentNightFactor,
              contWeather.wetness,
            );
          }
          cctvRig.update(delta, elapsed);
          flagMarshalsRig.update(delta, elapsed, 'green', null);

          if (
            replayPlayer.isPlaying() &&
            !isPaused &&
            Math.abs(replayPlayer.getSpeed() - 1.0) <= 0.55 &&
            snap.speedMps > 0.4
          ) {
            replayAudioTelemetryScratch.speedKmh = snap.speedKmh;
            replayAudioTelemetryScratch.speedMps = snap.speedMps;
            replayAudioTelemetryScratch.rpm = snap.rpm;
            replayAudioTelemetryScratch.redlineRpm = snap.redlineRpm;
            replayAudioTelemetryScratch.gear = snap.gear;
            replayAudioTelemetryScratch.throttle = snap.throttle;
            replayAudioTelemetryScratch.brake = snap.brake;
            replayAudioTelemetryScratch.handbrake = snap.handbrake;
            replayAudioTelemetryScratch.countdownLabel = '';
            replayAudioTelemetryScratch.fuelState = 'normal';
            replayAudioTelemetryScratch.engineCranking = false;
            replayAudioTelemetryScratch.surface = 'tarmac';
            replayAudioTelemetryScratch.audioSurface = 'asphalt';
            replayAudioTelemetryScratch.tireSquealIntensity = clamp(
              Math.abs(snap.driftAngleDeg) / 28,
              0,
              0.85,
            );
            audio.update(replayAudioTelemetryScratch, true, contWeather.wetness);
          } else {
            audio.silence();
          }
          audio.updateSpatialAmbience(
            trackCamera.position,
            snap.trackT,
            snap.speedKmh,
            'racing',
            elapsed,
            activeMap,
            currentWeather,
          );

          if (replayCameraMode === 'cockpit') {
            trackCarInstance?.setInteriorMode(true);
            const eyeLocal = trackCarInstance?.cockpitEyePos ?? _fallbackCockpitEye;
            _replayLocalEye.copy(eyeLocal).applyQuaternion(snap.quat).add(snap.pos);
            _replayCamTarget
              .copy(snap.pos)
              .addScaledVector(snap.forward, 26)
              .addScaledVector(snap.up, 0.88);
            trackCamera.position.copy(_replayLocalEye);
            trackCamera.up.copy(snap.up);
            trackCamera.lookAt(_replayCamTarget);
            syncTrackProjection(62, 0.08);
          } else if (replayCameraMode === 'hood') {
            trackCarInstance?.setInteriorMode(false);
            _replayLocalEye.copy(_fallbackHoodPos).applyQuaternion(snap.quat).add(snap.pos);
            _replayCamTarget
              .copy(snap.pos)
              .addScaledVector(snap.forward, 28)
              .addScaledVector(snap.up, 0.72);
            trackCamera.position.copy(_replayLocalEye);
            trackCamera.up.copy(snap.up);
            trackCamera.lookAt(_replayCamTarget);
            syncTrackProjection(56, 0.12);
          } else if (replayCameraMode === 'bumper') {
            trackCarInstance?.setInteriorMode(false);
            _replayLocalEye.copy(_fallbackBumperPos).applyQuaternion(snap.quat).add(snap.pos);
            _replayCamTarget
              .copy(snap.pos)
              .addScaledVector(snap.forward, 30)
              .addScaledVector(snap.up, 0.45);
            trackCamera.position.copy(_replayLocalEye);
            trackCamera.up.copy(snap.up);
            trackCamera.lookAt(_replayCamTarget);
            syncTrackProjection(58, 0.12);
          } else if (replayCameraMode === 'cctv_auto' || replayCameraMode === 'cctv_manual') {
            trackCarInstance?.setInteriorMode(false);
            trackCamera.up.set(0, 1, 0);
            syncTrackProjection(lerp(lastCamFov, 34, 1 - Math.exp(-8.5 * delta)), 0.45);
            if (replayCameraMode === 'cctv_auto' && elapsed - lastCctvSwitchTime > 2.0) {
              const nearest = cctvRig.getNearestStationIndex();
              if (nearest !== cctvStationIndex) {
                cctvStationIndex = nearest;
                replaySnapNextFrame = true;
                lastCctvSwitchTime = elapsed;
                callbacks.onCctvStationSync?.(cctvStationIndex);
              }
            }
            cctvRig.getActiveViewPose(cctvStationIndex, _cctvPos, _cctvTarget);
            trackCamera.position.copy(_cctvPos);
            if (replaySnapNextFrame) {
              trackControls.target.copy(_cctvTarget);
              replaySnapNextFrame = false;
            } else {
              trackControls.target.lerp(_cctvTarget, 1 - Math.exp(-12 * delta));
            }
            trackCamera.lookAt(trackControls.target);
          } else if (replayCameraMode === 'helicopter') {
            trackCarInstance?.setInteriorMode(false);
            trackCamera.up.set(0, 1, 0);
            syncTrackProjection(lerp(lastCamFov, 46, 1 - Math.exp(-7 * delta)), 0.5);
            const hoverLat = Math.sin(elapsed * 0.45) * 3.8;
            _replayCamPos
              .copy(snap.pos)
              .addScaledVector(snap.forward, -14.5)
              .addScaledVector(_worldUp, 11.2)
              .addScaledVector(snap.right, hoverLat);
            const minGround = groundHeightAt(_replayCamPos.x, _replayCamPos.z) + 3.2;
            if (_replayCamPos.y < minGround) _replayCamPos.y = minGround;
            _replayCamTarget
              .copy(snap.pos)
              .addScaledVector(snap.forward, 8.0)
              .addScaledVector(_worldUp, 1.0);
            if (replaySnapNextFrame) {
              trackCamera.position.copy(_replayCamPos);
              trackControls.target.copy(_replayCamTarget);
              replaySnapNextFrame = false;
            } else {
              const alpha = 1 - Math.exp(-5.0 * delta);
              trackCamera.position.lerp(_replayCamPos, alpha);
              trackControls.target.lerp(_replayCamTarget, alpha);
            }
            trackCamera.lookAt(trackControls.target);
          } else if (replayCameraMode === 'orbit') {
            trackCarInstance?.setInteriorMode(false);
            trackCamera.up.set(0, 1, 0);
            syncTrackProjection(lerp(lastCamFov, 48, 1 - Math.exp(-8 * delta)), 0.25);
            if (replaySnapNextFrame || !hasPrevReplayCarPos) {
              trackControls.target.copy(snap.pos).addScaledVector(_worldUp, 0.75);
              trackCamera.position
                .copy(snap.pos)
                .addScaledVector(snap.forward, -6.2)
                .addScaledVector(snap.right, 2.8)
                .addScaledVector(_worldUp, 2.3);
              _replayPrevCarPos.copy(snap.pos);
              hasPrevReplayCarPos = true;
              replaySnapNextFrame = false;
            } else {
              _replayOrbitDelta.copy(snap.pos).sub(_replayPrevCarPos);
              trackControls.target.add(_replayOrbitDelta);
              trackCamera.position.add(_replayOrbitDelta);
              _replayPrevCarPos.copy(snap.pos);
            }
            trackControls.update();
            const minOrbitY = groundHeightAt(trackCamera.position.x, trackCamera.position.z) + 0.65;
            if (trackCamera.position.y < minOrbitY) {
              trackCamera.position.y = minOrbitY;
            }
          } else {
            // 'cinematic_chase' default dynamic broadcast chase camera
            trackCarInstance?.setInteriorMode(false);
            trackCamera.up.set(0, 1, 0);
            const targetFov = 50 + clamp(snap.speedMps * 0.22, 0, 14);
            syncTrackProjection(lerp(lastCamFov, targetFov, 1 - Math.exp(-7 * delta)), 0.2);
            const orbitSway = Math.sin(elapsed * 0.35) * 1.35;
            _replayCamPos
              .copy(snap.pos)
              .addScaledVector(snap.forward, -6.4 - clamp(snap.speedMps * 0.03, 0, 1.8))
              .addScaledVector(_worldUp, 2.15)
              .addScaledVector(snap.right, orbitSway);
            const minFloor = groundHeightAt(_replayCamPos.x, _replayCamPos.z) + 0.85;
            if (_replayCamPos.y < minFloor) _replayCamPos.y = minFloor;
            _replayCamTarget
              .copy(snap.pos)
              .addScaledVector(snap.forward, 6.2)
              .addScaledVector(_worldUp, 0.85);
            if (replaySnapNextFrame) {
              trackCamera.position.copy(_replayCamPos);
              trackControls.target.copy(_replayCamTarget);
              replaySnapNextFrame = false;
            } else {
              const posAlpha = 1 - Math.exp(-8.0 * delta);
              const tgtAlpha = 1 - Math.exp(-10.5 * delta);
              trackCamera.position.lerp(_replayCamPos, posAlpha);
              trackControls.target.lerp(_replayCamTarget, tgtAlpha);
            }
            trackCamera.lookAt(trackControls.target);
          }

          if (renderer.shadowMap.enabled) {
            skyRig.setShadowBounds(105);
            skyRig.updateShadowCenter(
              _tmpVec.copy(snap.pos).addScaledVector(snap.forward, 12),
            );
          }

          if (elapsed - lastReplayUiEmitAt >= 0.066 || !replayPlayer.isPlaying()) {
            lastReplayUiEmitAt = elapsed;
            emitReplayState();
          }
        }
      } else if (appMode === 'custom_map') {
        audio.silence();
        trackCamera.up.set(0, 1, 0);
        syncTrackProjection(lerp(lastCamFov, 50, 1 - Math.exp(-8 * delta)), 0.5);
        if (isTransitioning) {
          const lambda = 5.2;
          trackCamera.position.x = THREE.MathUtils.damp(trackCamera.position.x, targetCamPos.x, lambda, delta);
          trackCamera.position.y = THREE.MathUtils.damp(trackCamera.position.y, targetCamPos.y, lambda, delta);
          trackCamera.position.z = THREE.MathUtils.damp(trackCamera.position.z, targetCamPos.z, lambda, delta);
          trackControls.target.x = THREE.MathUtils.damp(trackControls.target.x, targetLookAt.x, lambda, delta);
          trackControls.target.y = THREE.MathUtils.damp(trackControls.target.y, targetLookAt.y, lambda, delta);
          trackCamera.position.y = Math.max(trackCamera.position.y, groundHeightAt(trackCamera.position.x, trackCamera.position.z) + 2.5);
          trackControls.target.z = THREE.MathUtils.damp(trackControls.target.z, targetLookAt.z, lambda, delta);
          if (
            trackCamera.position.distanceTo(targetCamPos) < 0.5 &&
            trackControls.target.distanceTo(targetLookAt) < 0.5
          ) {
            isTransitioning = false;
          }
        }
        if (!isPaused) {
          const hasMove =
            studioMoveKeys.forward ||
            studioMoveKeys.backward ||
            studioMoveKeys.left ||
            studioMoveKeys.right ||
            studioMoveKeys.up ||
            studioMoveKeys.down;
          if (hasMove) {
            isTransitioning = false;
            const camDist = trackCamera.position.distanceTo(trackControls.target);
            const moveSpd =
              clamp(camDist * 0.65, 36, 260) * (studioMoveKeys.fast ? 2.4 : 1.0) * delta;
            trackCamera.getWorldDirection(_studioCamFwd);
            _studioCamFwd.y = 0;
            if (_studioCamFwd.lengthSq() < 1e-4) _studioCamFwd.set(0, 0, -1);
            _studioCamFwd.normalize();
            _studioCamRight.crossVectors(_studioCamFwd, _worldUp).normalize();
            const fMove = (studioMoveKeys.forward ? 1 : 0) - (studioMoveKeys.backward ? 1 : 0);
            const rMove = (studioMoveKeys.right ? 1 : 0) - (studioMoveKeys.left ? 1 : 0);
            const uMove = (studioMoveKeys.up ? 1 : 0) - (studioMoveKeys.down ? 1 : 0);
            _tmpVec
              .set(0, 0, 0)
              .addScaledVector(_studioCamFwd, fMove * moveSpd)
              .addScaledVector(_studioCamRight, rMove * moveSpd);
            _tmpVec.y += uMove * moveSpd * 0.72;
            trackCamera.position.add(_tmpVec);
            trackControls.target.add(_tmpVec);
          }
        }
        trackControls.update();
        const floorH = groundHeightAt(trackCamera.position.x, trackCamera.position.z) + 2.5;
        if (trackCamera.position.y < floorH) {
          trackCamera.position.y = floorH;
        }
        flagMarshalsRig.update(delta, elapsed, 'green', null);
        skyRig.setShadowBounds(195);
        skyRig.updateShadowCenter(trackControls.target);
      } else if (appMode === 'racing' && !activeSpectator) {
        if (preRaceIntroSec > 0) {
          audio.silence();
          audio.updateSpatialAmbience(trackCamera.position, 0, 0, 'spectator', elapsed, activeMap, currentWeather);
          if (!isPaused) {
            preRaceIntroSec = Math.max(0, preRaceIntroSec - delta);
          }
          const introElapsed = 9.0 - preRaceIntroSec;
          trackCamera.up.set(0, 1, 0);
          syncTrackProjection(42, 0.25);

          if (introElapsed < 2.4) {
            // Shot 1 (0-2.4s): High gantry pan sweeping down the starting grid
            const u = introElapsed / 2.4;
            _introCamPos
              .copy(physics.pos)
              .addScaledVector(physics.forwardDir, 16.5 - u * 4.5)
              .addScaledVector(physics.rightDir, 5.4 - u * 2.2)
              .addScaledVector(_worldUp, 4.4 - u * 1.1);
            _introCamLook
              .copy(physics.pos)
              .addScaledVector(physics.forwardDir, 2.0)
              .addScaledVector(_worldUp, 0.85);
          } else if (introElapsed < 5.0) {
            // Shot 2 (2.4-5.0s): Low trackside dolly rolling past the rival grid pack
            const u = (introElapsed - 2.4) / 2.6;
            _introCamPos
              .copy(physics.pos)
              .addScaledVector(physics.forwardDir, -10.5 + u * 14.0)
              .addScaledVector(physics.rightDir, -4.6 + u * 1.1)
              .addScaledVector(_worldUp, 1.18);
            _introCamLook
              .copy(physics.pos)
              .addScaledVector(physics.forwardDir, 3.0 - u * 2.5)
              .addScaledVector(_worldUp, 0.72);
          } else if (introElapsed < 7.2) {
            // Shot 3 (5.0-7.2s): Tight hero front-3/4 reveal over player's aero splitter & headlights
            const u = (introElapsed - 5.0) / 2.2;
            _introCamPos
              .copy(physics.pos)
              .addScaledVector(physics.forwardDir, 4.6 - u * 1.6)
              .addScaledVector(physics.rightDir, 2.8 - u * 1.1)
              .addScaledVector(_worldUp, 1.05 + u * 0.2);
            _introCamLook
              .copy(physics.pos)
              .addScaledVector(physics.forwardDir, 0.35)
              .addScaledVector(_worldUp, 0.65);
          } else {
            // Shot 4 (7.2-9.0s): Elevated crane settling behind grid overlooking Turn 1
            const u = (introElapsed - 7.2) / 1.8;
            _introCamPos
              .copy(physics.pos)
              .addScaledVector(physics.forwardDir, -12.0 + u * 5.2)
              .addScaledVector(physics.rightDir, 3.6 - u * 3.4)
              .addScaledVector(_worldUp, 5.4 - u * 3.1);
            _introCamLook
              .copy(physics.pos)
              .addScaledVector(physics.forwardDir, 20.0)
              .addScaledVector(_worldUp, 1.0);
          }

          trackCamera.position.copy(_introCamPos);
          trackCamera.lookAt(_introCamLook);
          cctvRig.update(delta, elapsed);
          flagMarshalsRig.update(delta, elapsed, 'green', null);
          skyRig.setShadowBounds(
            graphicsQuality === 'recommended' || graphicsQuality === 'low'
              ? callbacks.isTouchDevice
                ? 68
                : 80
              : 115,
          );
          skyRig.updateShadowCenter(
            _tmpVec
              .copy(physics.pos)
              .addScaledVector(
                physics.forwardDir,
                graphicsQuality === 'recommended' ? 24 : 12,
              ),
          );

          if (preRaceIntroSec <= 0) {
            snapDriveCameraNext = true;
            callbacks.onPreRaceIntroSync?.(false);
          }
        } else {
          const isPhotoFrozenTrack = photoModeActive && photoCarFrozen;
          const interiorActive = photoModeActive
            ? isPhotoFrozenTrack
              ? photoViewMode === 'interior'
              : drivingCameraMode === 'cockpit' || drivingCameraMode === 'windshield'
            : drivingCameraMode === 'cockpit' || drivingCameraMode === 'windshield';
          interiorViewForPostFx = interiorActive;
          if (!isPaused && !isPhotoFrozenTrack) {
            const pStart = performance.now();
            if (currentRaceConfig.mode === 'sprint') {
              aiRivalsRig.update(
                delta,
                lastCountdownSec,
                contWeather.nearestPreset,
                currentNightFactor,
                physics.pos,
                lastTrackT,
                lastLatestSpeedMps,
                lastTotalProgress,
                { wetness: contWeather.wetness, speedScale: contWeather.aiSpeedScale },
                currentRaceConfig.lapCount,
              );
            }
            const rivalsSnap = aiRivalsRig.getSnapshots();

            // Zero-GC Gamepad API polling merged seamlessly with keyboard controls
            let padConnected = false;
            let activePad: Gamepad | null = null;
            if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
              const pads = navigator.getGamepads();
              for (let pIdx = 0; pIdx < pads.length; pIdx++) {
                const p = pads[pIdx];
                if (p && p.connected) {
                  activePad = p;
                  padConnected = true;
                  break;
                }
              }
            }
            let padSteer = 0;
            let padThrottle = 0;
            let padBrake = 0;
            let padHandbrake = 0;
            let padLookBack = false;
            if (padConnected && activePad) {
              const rawAxis = activePad.axes[0] ?? 0;
              const padDead = 0.14;
              padSteer =
                Math.abs(rawAxis) < padDead
                  ? 0
                  : clamp((-(rawAxis - Math.sign(rawAxis) * padDead)) / (1 - padDead), -1, 1);
              padThrottle = activePad.buttons[7]?.value ?? 0;
              padBrake = activePad.buttons[6]?.value ?? 0;
              padHandbrake = (activePad.buttons[0]?.pressed || activePad.buttons[2]?.pressed) ? 1 : 0;
              padLookBack = Boolean(activePad.buttons[1]?.pressed);
              const padShiftUp = Boolean(activePad.buttons[5]?.pressed);
              const padShiftDown = Boolean(activePad.buttons[4]?.pressed);
              const padCam = Boolean(activePad.buttons[3]?.pressed);

              if (padShiftUp && !prevPadShiftUp) physics.shiftUp(assists);
              if (padShiftDown && !prevPadShiftDown) physics.shiftDown(assists);
              if (padCam && !prevPadCam) {
                const idx = DRIVING_CAMERA_ORDER.indexOf(drivingCameraMode);
                drivingCameraMode = DRIVING_CAMERA_ORDER[(idx + 1) % DRIVING_CAMERA_ORDER.length];
                snapDriveCameraNext = true;
                callbacks.onDrivingCameraSync?.(drivingCameraMode);
              }
              prevPadShiftUp = padShiftUp;
              prevPadShiftDown = padShiftDown;
              prevPadCam = padCam;
            } else {
              prevPadShiftUp = false;
              prevPadShiftDown = false;
              prevPadCam = false;
            }

            const kbSteer = (keyInput.steerLeft ? 1 : 0) - (keyInput.steerRight ? 1 : 0);
            const effThrottle = clamp(
              Math.max(keyInput.throttle ? 1 : 0, padThrottle, mobileInput.throttleVal),
              0,
              1,
            );
            const effBrake = clamp(
              Math.max(keyInput.brake ? 1 : 0, padBrake, mobileInput.brakeVal),
              0,
              1,
            );
            const effHandbrake = clamp(
              Math.max(keyInput.handbrake ? 1 : 0, padHandbrake, mobileInput.handbrakeVal),
              0,
              1,
            );
            const effSteer =
              Math.abs(kbSteer) > 0.05
                ? kbSteer
                : Math.abs(padSteer) > 0.05
                ? padSteer
                : clamp(mobileInput.steerAxis, -1, 1);

            mergedInput.throttle = effThrottle > 0.05;
            mergedInput.brake = effBrake > 0.05;
            mergedInput.steerLeft = effSteer > 0.05;
            mergedInput.steerRight = effSteer < -0.05;
            mergedInput.handbrake = effHandbrake > 0.5;
            mergedInput.lookBack = keyInput.lookBack || padLookBack || mobileInput.lookBack;
            mergedInput.throttleVal = effThrottle;
            mergedInput.brakeVal = effBrake;
            mergedInput.steerAxis = effSteer;
            mergedInput.handbrakeVal = effHandbrake;

            physics.setRemoteCarColliders(remotePlayersRig.getColliderSnapshots());

            const tlm = physics.step(
              delta,
              mergedInput,
              assists,
              contWeather.nearestPreset,
              rivalsSnap,
              activeSnow,
              {
                wetness: contWeather.wetness,
                roadFrictionScale: contWeather.roadFrictionScale,
                offroadFrictionScale: contWeather.offroadFrictionScale,
              },
              activeMap === 'frostpeak_pass' ? lastSnowAccumLevel : 0,
            );
            if (currentRaceConfig.mode === 'sprint') {
              const rivalImpacts = physics.consumeRivalImpacts();
              if (rivalImpacts.length > 0) {
                aiRivalsRig.applyCarImpacts(rivalImpacts);
              }
            }
            driverAnalyticsTracker.ingest(delta, physics, tlm);
            replayRecorder.maybeRecord(delta, physics, tlm, aiRivalsRig, headlightsOn);

            // Ghost Battle recording, playback & live gap telemetry
            if (activeGhostMode !== 'off' && tlm.countdownSec <= 0 && !tlm.raceFinished) {
              const ghostElapsedMs =
                isTougeMapId(activeMap) || currentRaceConfig.mode === 'tofu_delivery'
                  ? tlm.lapTimeMs
                  : tlm.lapTimeMs;
              ghostBattleManager.recordSample(
                ghostElapsedMs,
                physics.pos.x,
                physics.pos.y,
                physics.pos.z,
                physics.yaw,
                tlm.steerNorm,
                tlm.speedMps,
                tlm.trackT,
              );
              const gStatus = ghostBattleManager.update(
                delta,
                ghostElapsedMs,
                physics.pos.x,
                physics.pos.z,
                tlm.trackT,
                currentNightFactor,
              );
              physics.setGhostTelemetry(
                gStatus.active,
                gStatus.ghostName,
                gStatus.deltaSec,
                gStatus.gapMeters,
              );
              tlm.ghostActive = gStatus.active;
              tlm.ghostName = gStatus.ghostName;
              tlm.ghostDeltaSec = gStatus.deltaSec;
              tlm.ghostGapMeters = gStatus.gapMeters;
            } else if (activeGhostMode === 'off') {
              ghostBattleManager.group.visible = false;
              physics.setGhostTelemetry(false, '', null, null);
            }

            // Multiplayer Tandem Drift detection (within 28m, aligned heading >= 0.45, both sliding/fast)
            if (currentRaceConfig.mode === 'drift' && tlm.countdownSec <= 0 && !tlm.raceFinished) {
              const candidates = remotePlayersRig.getTandemCandidates();
              let bestCand: (typeof candidates)[number] | null = null;
              let bestDist = 28.0;
              const pFwdX = Math.sin(physics.yaw);
              const pFwdZ = Math.cos(physics.yaw);
              const playerSliding = tlm.speedMps > 9.5 && tlm.driftAngleDeg >= 7;
              for (let c = 0; c < candidates.length; c++) {
                const cand = candidates[c];
                if (cand.speedMps < 8.5) continue;
                const dx = cand.x - physics.pos.x;
                const dz = cand.z - physics.pos.z;
                const dist = Math.hypot(dx, dz);
                if (dist > bestDist) continue;
                const cFwdX = Math.sin(cand.headingRad);
                const cFwdZ = Math.cos(cand.headingRad);
                const headingAlign = pFwdX * cFwdX + pFwdZ * cFwdZ;
                if (headingAlign >= 0.45) {
                  bestDist = dist;
                  bestCand = cand;
                }
              }
              if (bestCand && playerSliding) {
                tandemHoldSec += delta;
                const proxMult = bestDist < 9 ? 3.5 : bestDist < 16 ? 2.5 : 1.75;
                const chainMult = tandemHoldSec > 4.5 ? 0.5 : tandemHoldSec > 2.0 ? 0.25 : 0;
                const mult = Number((proxMult + chainMult).toFixed(2));
                const relForward =
                  (bestCand.x - physics.pos.x) * pFwdX + (bestCand.z - physics.pos.z) * pFwdZ;
                const role: 'LEAD' | 'CHASE' = relForward > 0 ? 'CHASE' : 'LEAD';
                const bonusDelta = (tlm.driftAngleDeg * 1.4 + tlm.speedMps * 2.2) * mult * delta;
                tandemPartnerIdForMp = bestCand.userId;
                tandemPartnerNameForMp = bestCand.username;
                tandemMultiplierForMp = mult;
                physics.setTandemTelemetry(bestCand.username, role, mult, bonusDelta);
                tlm.tandemPartnerUsername = bestCand.username;
                tlm.tandemRole = role;
                tlm.tandemMultiplier = mult;
                tlm.driftPoints = Math.round(tlm.driftPoints + bonusDelta);
              } else {
                tandemHoldSec = 0;
                tandemPartnerIdForMp = null;
                tandemPartnerNameForMp = null;
                tandemMultiplierForMp = 1;
                physics.setTandemTelemetry(null, null, 1, 0);
                tlm.tandemPartnerUsername = null;
                tlm.tandemRole = null;
                tlm.tandemMultiplier = 1;
              }
            } else {
              tandemHoldSec = 0;
              tandemPartnerIdForMp = null;
              tandemPartnerNameForMp = null;
              tandemMultiplierForMp = 1;
            }

            if (tlm.raceFinished && !tlm.finishSummary?.tofuFailed && tlm.bestLapMs) {
              ghostBattleManager.commitBestRunIfFaster(
                activeMap,
                getTougeDirection(),
                selectedCarId,
                tlm.bestLapMs,
              );
            }

            lastBestLapMsForMp = tlm.bestLapMs;
            lastDriftPointsForMp = tlm.driftPoints;
            lastRaceFinishedForMp = tlm.raceFinished;
            physicsMs = performance.now() - pStart;

            // Gentle throttled Gamepad FFB rumble (~14 Hz)
            const ffbScale = clamp(assists.ffbIntensity ?? 0.75, 0, 1.5);
            if (activePad && ffbScale > 0.02 && elapsed - lastFfbSentAt > 0.07) {
              const actuator = (activePad as unknown as {
                vibrationActuator?: {
                  playEffect?: (type: string, params: Record<string, number>) => Promise<void>;
                };
              }).vibrationActuator;
              if (actuator && typeof actuator.playEffect === 'function') {
                lastFfbSentAt = elapsed;
                const shredVib = tlm.shreddedCount > 0 ? clamp(tlm.speedMps / 40, 0, 0.45) : 0;
                const strongMag = clamp(
                  (tlm.wallImpactImpulse * 0.85 + shredVib * 0.65 + tlm.kerbRumble * 0.35) * ffbScale,
                  0,
                  1,
                );
                const weakMag = clamp(
                  (Math.abs(tlm.ffbTorqueNorm) * 0.25 + tlm.tireSquealIntensity * 0.22 + shredVib * 0.5) *
                    ffbScale,
                  0,
                  1,
                );
                if (strongMag > 0.03 || weakMag > 0.03) {
                  void actuator
                    .playEffect('dual-rumble', {
                      startDelay: 0,
                      duration: 85,
                      weakMagnitude: weakMag,
                      strongMagnitude: strongMag,
                    })
                    .catch(() => {});
                }
              }
            }

            if (
              tlm.countdownSec <= 0 &&
              tlm.racePosition < prevRacePosition &&
              currentRaceConfig.mode === 'sprint'
            ) {
              overtakePulse = 1.0;
            }
            if (
              cinematicSettings.dynamicWeatherEnabled &&
              isLiveRace &&
              tlm.lap > lastLatestTlmLap
            ) {
              if (Math.random() < 0.10) {
                const activeTarget = weatherManager.getSnapshot(activeMap, activeSnow).nearestPreset;
                let nextWeather: WeatherPreset;
                if (activeTarget === 'rain' || activeTarget === 'deep_morning_mist') {
                  nextWeather =
                    dynamicWeatherBasePreset !== 'rain' &&
                    dynamicWeatherBasePreset !== 'deep_morning_mist'
                      ? dynamicWeatherBasePreset
                      : activeTarget === 'rain'
                        ? 'deep_morning_mist'
                        : 'dry';
                } else {
                  nextWeather = Math.random() < 0.5 ? 'rain' : 'deep_morning_mist';
                }
                if (nextWeather === 'rain' || nextWeather === 'deep_morning_mist') {
                  headlightsOn = true;
                  callbacks.onHeadlightsSync?.(true);
                }
                weatherManager.setManualWeather(nextWeather, false);
                const dynSnap = weatherManager.getSnapshot(activeMap, activeSnow);
                callbacks.onWeatherTelemetry?.({ ...dynSnap });
              }
            }
            prevRacePosition = tlm.racePosition;
            lastLatestTlmLap = tlm.lap;
            lastLatestSpeedMps = tlm.speedMps;
            lastKerbRumble = tlm.kerbRumble;
            lastWallImpact = tlm.wallImpactImpulse;
            lastTotalProgress = tlm.lap - 1 + tlm.trackT;
            lastLatG = tlm.latG;
            lastInDriftZone = tlm.inDriftClippingZone;
            lastNearBestPace =
              tlm.bestLapMs !== null &&
              tlm.deltaMs !== null &&
              tlm.deltaMs <= 450 &&
              tlm.speedMps > 20;

            let minGapSec: number | null = null;
            if (currentRaceConfig.mode === 'sprint' && rivalsSnap.length > 0) {
              const effSpd = Math.max(24, tlm.speedMps);
              for (let r = 0; r < rivalsSnap.length; r++) {
                const rv = rivalsSnap[r];
                const d = Math.hypot(rv.x - physics.pos.x, rv.z - physics.pos.z);
                const gSec = d / effSpd;
                if (minGapSec === null || gSec < minGapSec) minGapSec = gSec;
              }
            }
            lastClosestGapSec = minGapSec;

            lastCountdownSec = tlm.countdownSec;
            for (let i = 0; i < tlm.sparkEvents.length; i++) {
              const ev = tlm.sparkEvents[i];
              cctvRig.emitCollisionSparks(ev.x, ev.y, ev.z, ev.nx, ev.nz, ev.vx, ev.vz, ev.intensity);
            }
            lastFlagState = tlm.flagState;
            lastHazardTrackT = tlm.hazardTrackT;
            lastDirtLevel = tlm.dirtLevel;
            lastRubberLevel = tlm.rubberInProgress;
            lastRaceFinished = tlm.raceFinished;
            lastTrackT = tlm.trackT;
            dirtForPostFx = tlm.dirtLevel;
            roadRig.setRubberLevel(tlm.rubberInProgress);

            cctvRig.applyPlayerState({
              pos: physics.pos,
              quat: physics.worldQuaternion,
              forward: physics.forwardDir,
              right: physics.rightDir,
              up: physics.upDir,
              bodyPitch: physics.bodyPitch,
              bodyRoll: physics.bodyRoll,
              bodyHeave: physics.bodyHeave,
              wheelSpin: physics.wheelSpin,
              wheelSpins: physics.wheelSpins,
              wheelSuspOffsets: physics.wheelSuspOffsets,
              steerAngle: physics.steerAngle,
              steerAngleFL: physics.steerAngleFL,
              steerAngleFR: physics.steerAngleFR,
              speedMps: tlm.speedMps,
              brakeSkidIntensity: tlm.brakeSkidIntensity,
              brakePedal: tlm.brake,
              handbrake: tlm.handbrake,
              wheelSlips: tlm.wheelSlips,
              surface: tlm.surface,
              headlightsOn,
              dirtLevel: tlm.dirtLevel,
              wetness: contWeather.wetness,
              isInteriorView: interiorActive,
              activeAeroEnabled: tlm.activeAeroEnabled,
              aeroDeployed: tlm.aeroDeployed,
              deltaSec: delta,
            });
            engineerRadio.bindAudio(audio.getAudioContext(), audio.getMasterGain());
            engineerRadio.update(tlm, !isPaused);
            audio.setRadioDucking(engineerRadio.isTransmitting());
            audio.update(tlm, true, contWeather.wetness);
            audio.updateSpatialAmbience(
              trackCamera.position,
              tlm.trackT,
              tlm.speedKmh,
              'racing',
              elapsed,
              activeMap,
              currentWeather,
            );
            updateDrivingCamera(delta, tlm.speedMps, elapsed);

            const uiStart = performance.now();

            // Throttled React HUD telemetry (~12.5 Hz) with immediate sync on countdown/gear/pit/finish
            const countdownCeil = Math.ceil(tlm.countdownSec);
            if (
              elapsed - lastHudSync >= 0.08 ||
              tlm.raceFinished ||
              countdownCeil !== lastBroadcastCountdownCeil ||
              tlm.gear !== lastBroadcastGear ||
              tlm.pitStatus !== lastBroadcastPitStatus
            ) {
              lastHudSync = elapsed;
              lastBroadcastCountdownCeil = countdownCeil;
              lastBroadcastGear = tlm.gear;
              lastBroadcastPitStatus = tlm.pitStatus;
              callbacks.onTelemetry?.(tlm);
            }
            uiSyncMs = performance.now() - uiStart;

            if (tlm.raceFinished) {
              isCloseFinishFlag =
                (tlm.finishSummary?.position ?? 1) <= 2 ||
                (lastClosestGapSec !== null && lastClosestGapSec < 2.2);
              finalizeRaceSessionTelemetry();
              appMode = 'podium';
              podiumCameraAngle = 'auto';
              clearInputsOnBlur();
              audio.silence();
              engineerRadio.silence();
              syncControlModes();
              aiRivalsRig.setActive(false);
              callbacks.onRaceFinished?.(tlm);
            }
          } else {
            audio.silence();
            engineerRadio.silence();
            if (isPhotoFrozenTrack && !isPaused) {
              updatePhotoCamera(delta);
              trackCarInstance?.setLights(headlightsOn, 0, currentNightFactor);
              trackCarInstance?.setDirtAndWeather(lastDirtLevel, contWeather.wetness);
            }
          }
          if (!isPhotoFrozenTrack) {
            cctvRig.update(delta, elapsed);
            flagMarshalsRig.update(
              delta,
              elapsed,
              lastRaceFinished ? 'checkered' : lastFlagState,
              lastHazardTrackT,
            );
          }
          if (renderer.shadowMap.enabled) {
            skyRig.setShadowBounds(
              shadowQualityOpt === 'low' || graphicsQuality === 'recommended'
                ? callbacks.isTouchDevice
                  ? 64
                  : 78
                : 112,
            );
            skyRig.updateShadowCenter(
              _tmpVec
                .copy(physics.pos)
                .addScaledVector(
                  physics.forwardDir,
                  graphicsQuality === 'recommended' ? 24 : 12,
                ),
            );
          }
        }
      } else {
        // Total Map Viewing / Spectator Modes (Accessible from BOTH Garage & Racing!)
        audio.silence();
        audio.updateSpatialAmbience(trackCamera.position, lastTrackT, 0, 'spectator', elapsed, activeMap, currentWeather);
        trackCamera.up.set(0, 1, 0);
        lastFlagState = 'green';
        lastHazardTrackT = null;
        lastDirtLevel = 0;
        cctvRig.update(delta, elapsed);
        flagMarshalsRig.update(delta, elapsed, 'green', null);

        const desiredFov = cctvEnabled ? 34 : 48;
        syncTrackProjection(lerp(lastCamFov, desiredFov, 1 - Math.exp(-8.5 * delta)), 0.5);

        if (cctvEnabled) {
          if (cctvAutoSwitch && elapsed - lastCctvSwitchTime > 2.2) {
            const nearest = cctvRig.getNearestStationIndex();
            if (nearest !== cctvStationIndex) {
              cctvStationIndex = nearest;
              cctvSnapNextFrame = true;
              lastCctvSwitchTime = elapsed;
              callbacks.onCctvStationSync?.(cctvStationIndex);
            }
          }
          cctvRig.getActiveViewPose(cctvStationIndex, _cctvPos, _cctvTarget);
          trackCamera.position.copy(_cctvPos);
          if (cctvSnapNextFrame) {
            trackControls.target.copy(_cctvTarget);
            cctvSnapNextFrame = false;
          } else {
            trackControls.target.lerp(_cctvTarget, 1 - Math.exp(-12.0 * delta));
          }
          trackCamera.lookAt(trackControls.target);
        } else if (flyoverActive) {
          cctvRig.getChaseViewPose(_chaseCarPos, _chaseTan, _chaseRight, _chaseUp);

          const swayLat = Math.sin(elapsed * 0.52) * 2.1;
          _flyPos
            .copy(_chaseCarPos)
            .addScaledVector(_chaseTan, -14.2)
            .addScaledVector(_chaseUp, 5.25)
            .addScaledVector(_chaseRight, swayLat);

          const minGround = groundHeightAt(_flyPos.x, _flyPos.z) + 2.2;
          if (_flyPos.y < minGround) _flyPos.y = minGround;

          _flyTarget
            .copy(_chaseCarPos)
            .addScaledVector(_chaseTan, 7.5)
            .addScaledVector(_chaseUp, 1.15);

          const alpha = 1 - Math.exp(-5.2 * delta);
          trackCamera.position.lerp(_flyPos, alpha);
          trackControls.target.lerp(_flyTarget, alpha);
          trackControls.update();
        } else if (isTransitioning) {
          const lambda = 5.2;
          trackCamera.position.x = THREE.MathUtils.damp(trackCamera.position.x, targetCamPos.x, lambda, delta);
          trackCamera.position.y = THREE.MathUtils.damp(trackCamera.position.y, targetCamPos.y, lambda, delta);
          trackCamera.position.z = THREE.MathUtils.damp(trackCamera.position.z, targetCamPos.z, lambda, delta);

          trackControls.target.x = THREE.MathUtils.damp(trackControls.target.x, targetLookAt.x, lambda, delta);
          trackControls.target.y = THREE.MathUtils.damp(trackControls.target.y, targetLookAt.y, lambda, delta);
          trackControls.target.z = THREE.MathUtils.damp(trackControls.target.z, targetLookAt.z, lambda, delta);
          trackControls.update();

          const distPos = trackCamera.position.distanceTo(targetCamPos);
          const distTarget = trackControls.target.distanceTo(targetLookAt);
          if (distPos < 0.35 && distTarget < 0.35) {
            isTransitioning = false;
          }
        } else {
          trackControls.update();
        }

        if (!cctvEnabled) {
          const floorH = groundHeightAt(trackCamera.position.x, trackCamera.position.z) + 1.45;
          if (trackCamera.position.y < floorH) {
            trackCamera.position.y = floorH;
          }
          trackControls.target.y = clamp(trackControls.target.y, -10, 240);
        }
        skyRig.setShadowBounds(195);
        skyRig.updateShadowCenter(_tmpVec.copy(trackControls.target));
      }

      const baseStreamRadius = getChunkStreamRadius(graphicsQuality);
      _streamCamFwdScratch.set(0, 0, -1).applyQuaternion(trackCamera.quaternion);
      const baseFocus =
        appMode === 'racing' && !activeSpectator
          ? physics.pos
          : appMode === 'custom_map'
          ? trackControls.target
          : trackCamera.position;
      const streamFocus =
        appMode === 'custom_map'
          ? baseFocus
          : _streamFocusScratch.copy(baseFocus).addScaledVector(_streamCamFwdScratch, 130);
      const streamRadius =
        appMode === 'custom_map' ? Math.max(baseStreamRadius, 820) : baseStreamRadius;
      terrainRig.updateVisibilityWindow?.(
        streamFocus,
        streamRadius,
        trackCamera.position,
        _streamCamFwdScratch,
      );
      roadRig.updateVisibilityWindow?.(
        streamFocus,
        streamRadius,
        trackCamera.position,
        _streamCamFwdScratch,
      );
      propsRig.updateVisibilityWindow(
        streamFocus,
        streamRadius,
        trackCamera.position,
        _streamCamFwdScratch,
      );

      skyRig.updateAtmosphereTime(elapsed, trackCamera.position);
      const rStart = performance.now();
      renderTrackFrame(
        interiorViewForPostFx,
        dirtForPostFx,
        elapsed,
        activeSnow ? 0 : contWeather.rainIntensity,
      );
      renderMs = performance.now() - rStart;
    }

    const totalFrameMs = performance.now() - frameStartMs;
    const { throttleChanged, drsChanged, newLevel, startupDowngradeRecommended } = profiler.recordFrame(
      totalFrameMs,
      physicsMs,
      worldMs,
      renderMs,
      uiSyncMs,
      elapsed,
    );
    if (
      startupDowngradeRecommended &&
      !userPinnedQuality &&
      (graphicsQuality === 'recommended' || graphicsQuality === 'balanced') &&
      !isSoftwareGl
    ) {
      applyGraphicsQualityInternal('low');
      callbacks.onQualityAutoAdjust?.('low');
    } else if (throttleChanged || drsChanged) {
      applyAdaptiveQualitySettings(newLevel);
    }
    if (profiler.shouldEmit(performance.now(), 250)) {
      const uStart = performance.now();
      callbacks.onPerformanceUpdate?.(
        profiler.buildSnapshot(renderer, playerCarPool.size, getActiveMapId()),
      );
      void uStart;
    }

    if (isBackgroundFrozen || disposed) {
      frameId = 0;
      return;
    }
    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  }

  tick();

  return {
    setAppMode: (mode: AppScreenMode) => {
      clearPendingOffstagePrewarm();
      profiler.beginTransition(`Mode -> ${mode}`);
      if (photoModeActive && mode !== appMode) {
        setPhotoModeInternal(false);
      }
      if (appMode === 'racing' && mode !== 'racing' && mode !== 'podium') {
        finalizeRaceSessionTelemetry();
      }
      if (mode !== 'garage') {
        ensureTrackWorldBuilt();
      }
      appMode = mode;
      clearInputsOnBlur();
      if (mode === 'garage') {
        audio.silence();
        engineerRadio.silence();
        cctvEnabled = false;
        flyoverActive = false;
        orbitSpectatorActive = false;
        preRaceIntroSec = 0;
        callbacks.onPreRaceIntroSync?.(false);
        trackCarInstance?.setInteriorMode(false);
      } else if (mode === 'custom_map') {
        audio.silence();
        engineerRadio.silence();
        cctvEnabled = false;
        flyoverActive = false;
        orbitSpectatorActive = false;
        preRaceIntroSec = 0;
        callbacks.onPreRaceIntroSync?.(false);
        trackCarInstance?.setInteriorMode(false);
        const meta = MAP_REGISTRY[getActiveMapId()];
        targetCamPos.set(...meta.customizerOverviewPos);
        targetLookAt.set(...meta.customizerOverviewTarget);
        trackCamera.position.copy(targetCamPos);
        trackControls.target.copy(targetLookAt);
        isTransitioning = false;
        syncWaypointMarkerPositions();
      } else {
        snapDriveCameraNext = true;
      }
      syncControlModes();
      updateAdaptivePostFx(true);
      clock.getDelta();
      if (isBackgroundFrozen || frameId === 0) {
        renderCurrentFrozenFrame();
      }
      profiler.endTransition(clock.elapsedTime);
    },
    setSelectedCar: (carId: CarModelId) => {
      const resolvedId = normalizeCarModelId(carId);
      if (resolvedId === selectedCarId && carTemplateMap.has(resolvedId)) {
        callbacks.onCarLoadProgress?.(100, true);
        return;
      }
      if (resolvedId === selectedCarId && activeGarageLoadCarId === resolvedId) {
        return;
      }
      loadAndSelectCar(resolvedId, true);
    },
    getSelectedCar: () => selectedCarId,
    setGarageCarAvailable: (available: boolean) => {
      garageStage.setShowCar(available);
    },
    setGarageCameraPreset: (preset: GarageCameraPreset) => {
      const pose = GARAGE_CAMERA_POSES[preset];
      garageCamGoalPos = pose.position.clone();
      garageCamGoalTarget = pose.target.clone();
      garageAutoRotate = preset === 'hero';
    },
    setRaceConfig: (config: RaceConfig) => {
      currentRaceConfig = { ...config };
      physics.setRaceConfig(currentRaceConfig);
      if (config.difficulty) {
        aiRivalsRig.setDifficulty(config.difficulty);
      }
    },
    startNewRace: (config?: RaceConfig) => {
      clearPendingOffstagePrewarm();
      ensureTrackWorldBuilt();
      if (config) {
        currentRaceConfig = { ...config };
      }
      audio.unlock();
      engineerRadio.bindAudio(audio.getAudioContext(), audio.getMasterGain());
      engineerRadio.resetSession();
      appMode = 'racing';
      isPaused = false;
      const cdMode = currentRaceConfig.startCountdownMode ?? 'full';
      preRaceIntroSec = cdMode === 'full' ? 9.0 : 0;
      callbacks.onPreRaceIntroSync?.(cdMode === 'full');
      cctvEnabled = false;
      flyoverActive = false;
      orbitSpectatorActive = false;
      clearInputsOnBlur();
      physics.setCarModel(selectedCarId);
      physics.setVisualCustomization(getVisualForCar(selectedCarId));
      syncStanceToInstances(garageCarInstance, trackCarInstance);
      physics.resetToGrid(cdMode !== 'instant', currentRaceConfig);
      if (currentRaceConfig.mode === 'sprint') {
        ensureSprintRivalsOnDemand();
      }
      aiRivalsRig.setDifficulty(currentRaceConfig.difficulty ?? 'pro');
      aiRivalsRig.setActive(currentRaceConfig.mode === 'sprint');
      aiRivalsRig.resetGrid();
      prewarmTrackShadersIfNeeded();
      lastCountdownSec = cdMode === 'instant' ? 0 : cdMode === 'quick' ? 1.2 : 3.2;
      lastBroadcastCountdownCeil = Math.ceil(lastCountdownSec);
      lastFlagState = 'green';
      lastHazardTrackT = null;
      lastDirtLevel = 0;
      lastRubberLevel = 0.08;
      lastSnowAccumLevel = 0;
      lastLatG = 0;
      lastInDriftZone = false;
      lastNearBestPace = false;
      lastRaceFinished = false;
      lastTrackT = 0;
      lastLatestTlmLap = 1;
      lastLatestSpeedMps = 0;
      lastTotalProgress = 0;
      lastClosestGapSec = null;
      lastBestLapMsForMp = null;
      lastDriftPointsForMp = 0;
      lastRaceFinishedForMp = false;
      prevRacePosition = 1;
      overtakePulse = 0;
      isCloseFinishFlag = false;
      const raceMapId = getActiveMapId();
      const raceSnow = raceMapId === 'frostpeak_pass' ? currentSnowAtmosphere : null;
      currentWeather = dynamicWeatherBasePreset;
      weatherManager.resetForNewRace(currentWeather, raceMapId, raceSnow);
      const resetSnap = weatherManager.getSnapshot(raceMapId, raceSnow);
      const tofuMeta = currentRaceConfig.tofuChapterId
        ? getTofuChapterById(currentRaceConfig.tofuChapterId)
        : undefined;
      if (
        currentNightFactor > 0.35 ||
        currentWeather === 'rain' ||
        currentWeather === 'sunset_storm' ||
        currentWeather === 'deep_morning_mist' ||
        tofuMeta?.headlightsRequired
      ) {
        headlightsOn = true;
        callbacks.onHeadlightsSync?.(true);
      }
      tandemHoldSec = 0;
      tandemPartnerIdForMp = null;
      tandemPartnerNameForMp = null;
      tandemMultiplierForMp = 1;
      ghostBattleManager.startSession(
        activeGhostMode,
        raceMapId,
        getTougeDirection(),
        selectedCarId,
      );
      const raceMapMeta = MAP_REGISTRY[raceMapId];
      const raceCarSpec = VEHICLE_SPECS[selectedCarId];
      driverAnalyticsTracker.startSession({
        mapId: raceMapId,
        mapName: raceMapMeta?.name ?? raceMapId,
        carId: selectedCarId,
        mode: currentRaceConfig.mode,
      });
      replayRecorder.start({
        mapId: raceMapId,
        mapName: raceMapMeta?.name ?? raceMapId,
        carId: selectedCarId,
        carName: raceCarSpec?.name ?? selectedCarId,
        mode: currentRaceConfig.mode,
        weatherPreset: currentWeather,
        hasRivals: currentRaceConfig.mode === 'sprint',
      });
      callbacks.onWeatherTelemetry?.({ ...resetSnap });
      roadRig.setRubberLevel(0.08);
      roadRig.setSnowAccumulation?.(0);
      lookTargetYaw = 0;
      lookTargetPitch = 0;
      lookYaw = 0;
      lookPitch = 0;
      isInteriorRmbDown = false;
      snapDriveCameraNext = true;
      const tlm = physics.step(
        0.016,
        keyInput,
        assists,
        resetSnap.nearestPreset,
        aiRivalsRig.getSnapshots(),
        raceSnow,
        {
          wetness: resetSnap.wetness,
          roadFrictionScale: resetSnap.roadFrictionScale,
          offroadFrictionScale: resetSnap.offroadFrictionScale,
        },
        0,
      );
      const interiorActive =
        drivingCameraMode === 'cockpit' || drivingCameraMode === 'windshield';
      cctvRig.applyPlayerState({
        pos: physics.pos,
        quat: physics.worldQuaternion,
        forward: physics.forwardDir,
        right: physics.rightDir,
        up: physics.upDir,
        bodyPitch: physics.bodyPitch,
        bodyRoll: physics.bodyRoll,
        bodyHeave: physics.bodyHeave,
        wheelSpin: physics.wheelSpin,
        wheelSpins: physics.wheelSpins,
        wheelSuspOffsets: physics.wheelSuspOffsets,
        steerAngle: physics.steerAngle,
        steerAngleFL: physics.steerAngleFL,
        steerAngleFR: physics.steerAngleFR,
        speedMps: tlm.speedMps,
        brakeSkidIntensity: 0,
        brakePedal: 0,
        handbrake: false,
        wheelSlips: tlm.wheelSlips,
        surface: tlm.surface,
        headlightsOn,
        dirtLevel: tlm.dirtLevel,
        wetness: resetSnap.wetness,
        isInteriorView: interiorActive,
        activeAeroEnabled: tlm.activeAeroEnabled,
        aeroDeployed: tlm.aeroDeployed,
        deltaSec: 0.016,
      });
      if (preRaceIntroSec > 0) {
        _introCamPos
          .copy(physics.pos)
          .addScaledVector(physics.forwardDir, 16.5)
          .addScaledVector(physics.rightDir, 5.4)
          .addScaledVector(_worldUp, 4.4);
        _introCamLook
          .copy(physics.pos)
          .addScaledVector(physics.forwardDir, 2.0)
          .addScaledVector(_worldUp, 0.85);
        trackCamera.position.copy(_introCamPos);
        trackCamera.lookAt(_introCamLook);
      } else {
        updateDrivingCamera(0.016, 0);
      }
      skyRig.setShadowBounds(
        graphicsQuality === 'recommended' || graphicsQuality === 'low' ? 80 : 115,
      );
      skyRig.updateShadowCenter(
        _tmpVec
          .copy(physics.pos)
          .addScaledVector(
            physics.forwardDir,
            graphicsQuality === 'recommended' ? 24 : 12,
          ),
      );
      callbacks.onTelemetry?.(tlm);
      syncControlModes();
      updateAdaptivePostFx(true);
      clock.getDelta();
      if (isBackgroundFrozen || frameId === 0) {
        renderCurrentFrozenFrame();
      }
    },
    skipPreRaceIntro: () => {
      if (preRaceIntroSec > 0) {
        preRaceIntroSec = 0;
        snapDriveCameraNext = true;
        callbacks.onPreRaceIntroSync?.(false);
      }
    },
    resetCarToTrack: () => {
      physics.resetToNearestTrack();
      lastFlagState = 'green';
      lastHazardTrackT = null;
      snapDriveCameraNext = true;
    },
    setPaused: (paused: boolean) => {
      isPaused = paused;
      if (paused) {
        clearInputsOnBlur();
        audio.silence();
        engineerRadio.silence();
      }
      syncControlModes();
    },
    setBackgroundFrozen: (frozen: boolean) => {
      if (frozen === isBackgroundFrozen) return;
      isBackgroundFrozen = frozen;
      if (frozen) {
        renderCurrentFrozenFrame();
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        frameId = 0;
        clearInputsOnBlur();
        audio.silence();
        engineerRadio.silence();
      } else if (!disposed) {
        // Discard accumulated delta while background was frozen so physics/camera never jump
        clock.getDelta();
        if (frameId === 0) {
          tick();
        }
      }
    },
    setDrivingCamera: (cam: DrivingCameraMode) => {
      drivingCameraMode = cam;
      cctvEnabled = false;
      flyoverActive = false;
      orbitSpectatorActive = false;
      lookTargetYaw = 0;
      lookTargetPitch = 0;
      lookYaw = 0;
      lookPitch = 0;
      isInteriorRmbDown = false;
      snapDriveCameraNext = true;
      syncControlModes();
      if (isPaused && appMode === 'racing') {
        trackCarInstance?.setInteriorMode(cam === 'cockpit' || cam === 'windshield');
        updateDrivingCamera(0.016, 0);
      }
    },
    cycleDrivingCamera: () => {
      const idx = DRIVING_CAMERA_ORDER.indexOf(drivingCameraMode);
      drivingCameraMode = DRIVING_CAMERA_ORDER[(idx + 1) % DRIVING_CAMERA_ORDER.length];
      lookTargetYaw = 0;
      lookTargetPitch = 0;
      lookYaw = 0;
      lookPitch = 0;
      isInteriorRmbDown = false;
      snapDriveCameraNext = true;
      if (isPaused && appMode === 'racing') {
        trackCarInstance?.setInteriorMode(
          drivingCameraMode === 'cockpit' || drivingCameraMode === 'windshield',
        );
        updateDrivingCamera(0.016, 0);
      }
      return drivingCameraMode;
    },
    setAssists: (next: VehicleAssists) => {
      assists = { ...next };
    },
    setCarSetup: (setup: CarSetupConfig) => {
      physics.setCarSetup(setup);
      syncStanceToInstances(garageCarInstance, trackCarInstance);
    },
    setVisualCustomization: (cfg: CarVisualCustomization) => {
      visualCustomByCar.set(selectedCarId, { ...cfg });
      physics.setVisualCustomization(cfg);
      garageCarInstance?.setVisualCustomization(cfg);
      trackCarInstance?.setVisualCustomization(cfg);
    },
    setTestMode: (enabled: boolean, fixedFuelLiters?: number) => {
      physics.setTestMode(enabled, fixedFuelLiters);
      if (enabled) {
        currentWeather = 'dry';
        weatherManager.setManualWeather('dry', true);
        applyAtmosphere(currentSolarDeg, currentHaze, 'dry');
      }
    },
    setCockpitDials: (dials: CockpitDialState) => {
      physics.setCockpitDials(dials);
      callbacks.onCockpitDialsSync?.(physics.getCockpitDials());
    },
    setPitStrategy: (strategy: PitStrategyPlan) => {
      physics.setPitStrategy(strategy);
      callbacks.onPitStrategySync?.(physics.getPitStrategy());
    },
    setAdvancedTelemetryEnabled: (enabled: boolean) => {
      physics.setTelemetryLoggerEnabled(enabled);
    },
    exportTelemetryCsv: () => ({
      csv: physics.exportTelemetryCsv(),
      sampleCount: physics.getTelemetryCsvSampleCount(),
    }),
    setAudioConfig: (volume: number, muted: boolean) => {
      audio.setVolume(volume, muted);
      engineerRadio.setAudioConfig(volume, muted);
    },
    setSurfaceAudioEnabled: (enabled: boolean) => {
      audio.setSurfaceAudioEnabled(enabled);
    },
    unlockAudio: () => {
      audio.unlock();
      engineerRadio.bindAudio(audio.getAudioContext(), audio.getMasterGain());
    },
    setStartupBenchmarkPinned: (pinned: boolean) => {
      userPinnedQuality = pinned;
      if (pinned) profiler.markStartupEvaluated();
    },
    toggleHeadlights: () => {
      headlightsOn = !headlightsOn;
      callbacks.onHeadlightsSync?.(headlightsOn);
      if (isBackgroundFrozen || (photoModeActive && photoCarFrozen)) {
        trackCarInstance?.setLights(headlightsOn, 0, currentNightFactor);
        renderCurrentFrozenFrame();
      }
      return headlightsOn;
    },
    setHeadlightsEnabled: (enabled: boolean) => {
      headlightsOn = Boolean(enabled);
      callbacks.onHeadlightsSync?.(headlightsOn);
      if (isBackgroundFrozen || (photoModeActive && photoCarFrozen)) {
        trackCarInstance?.setLights(headlightsOn, 0, currentNightFactor);
        renderCurrentFrozenFrame();
      }
      return headlightsOn;
    },
    toggleActiveAero: () => physics.toggleActiveAero(),
    setAeroDeployed: (deployed: boolean) => {
      physics.setAeroDeployed(deployed);
    },
    setGarageAeroPreview: (deployed: boolean) => {
      garageAeroDeployedPreview = deployed;
      garageCarInstance?.setActiveAeroState(
        physics.getCarSetup().activeAeroEnabled ?? true,
        deployed,
        1.0,
      );
    },
    setMobileInput: (input: MobileControlsInput) => {
      mobileInput.throttleVal = input.throttleVal;
      mobileInput.brakeVal = input.brakeVal;
      mobileInput.steerAxis = input.steerAxis;
      mobileInput.handbrakeVal = input.handbrakeVal;
      mobileInput.lookBack = input.lookBack;
    },
    shiftUp: () => {
      physics.shiftUp(assists);
    },
    shiftDown: () => {
      physics.shiftDown(assists);
    },
    returnToDriveCamera: () => {
      cctvEnabled = false;
      flyoverActive = false;
      orbitSpectatorActive = false;
      snapDriveCameraNext = true;
      syncControlModes();
    },
    setCameraPreset: (preset: CameraPresetId) => {
      ensureTrackWorldBuilt();
      const v = getActiveVantage(preset);
      flyoverActive = false;
      cctvEnabled = false;
      orbitSpectatorActive = true;
      targetCamPos.copy(v.position);
      targetLookAt.copy(v.target);
      isTransitioning = true;
      syncControlModes();
    },
    setFlyoverActive: (active: boolean) => {
      if (active) ensureTrackWorldBuilt();
      flyoverActive = active;
      orbitSpectatorActive = active;
      if (active) {
        isTransitioning = false;
        cctvEnabled = false;
      }
      syncControlModes();
    },
    getCctvStations: () => cctvRig.getStations(),
    setCctvEnabled: (enabled: boolean) => {
      if (enabled) ensureTrackWorldBuilt();
      cctvEnabled = enabled;
      orbitSpectatorActive = enabled;
      if (enabled) {
        flyoverActive = false;
        isTransitioning = false;
        if (cctvAutoSwitch) {
          cctvStationIndex = cctvRig.getNearestStationIndex();
          callbacks.onCctvStationSync?.(cctvStationIndex);
        }
        cctvSnapNextFrame = true;
      } else {
        const overviewV = getActiveVantage('overview');
        targetCamPos.copy(overviewV.position);
        targetLookAt.copy(overviewV.target);
        isTransitioning = true;
      }
      syncControlModes();
    },
    setCctvStationIndex: (index: number) => {
      const count = cctvRig.getStationCount();
      cctvStationIndex = ((index % count) + count) % count;
      cctvSnapNextFrame = true;
      lastCctvSwitchTime = clock.elapsedTime;
    },
    setCctvAutoSwitch: (auto: boolean) => {
      cctvAutoSwitch = auto;
    },
    setPodiumCameraAngle: (angle: PodiumCameraAngle) => {
      podiumCameraAngle = angle;
    },
    setSolarAngle: (deg: number) => {
      currentSolarDeg = ((deg % 360) + 360) % 360;
      const state = applyAtmosphere(currentSolarDeg, currentHaze, currentWeather);
      updateAdaptivePostFx(true);
      if (isBackgroundFrozen || (photoModeActive && photoCarFrozen)) {
        trackCarInstance?.setLights(headlightsOn, 0, currentNightFactor);
        renderCurrentFrozenFrame();
      }
      return state.phaseLabel;
    },
    setAutoCycle: (active: boolean) => {
      autoCycle = active;
    },
    setHazePreset: (haze: HazePreset) => {
      currentHaze = haze;
      applyAtmosphere(currentSolarDeg, currentHaze, currentWeather);
      if (isBackgroundFrozen || (photoModeActive && photoCarFrozen)) {
        renderCurrentFrozenFrame();
      }
    },
    setWeatherPreset: (weather: WeatherPreset) => {
      currentWeather = weather;
      dynamicWeatherBasePreset = weather;
      const mapId = getActiveMapId();
      const snowArg = mapId === 'frostpeak_pass' ? currentSnowAtmosphere : null;
      if (appMode === 'racing' && cinematicSettings.weatherAutoEnabled) {
        cinematicSettings = { ...cinematicSettings, weatherAutoEnabled: false };
        weatherManager.configure({ autoEnabled: false });
      }
      if (mapId === 'aurelia_ridge' || weather === 'sunset_storm' || weather === 'deep_morning_mist') {
        const sync = AURELIA_WEATHER_SOLAR_SYNC[weather];
        currentSolarDeg = sync.solarDeg;
        currentHaze = sync.haze;
        headlightsOn = sync.headlights;
        callbacks.onHeadlightsSync?.(headlightsOn);
      }
      weatherManager.setManualWeather(weather, appMode !== 'racing' || photoModeActive);
      const atmoState = applyAtmosphere(currentSolarDeg, currentHaze, currentWeather);
      updateAdaptivePostFx(true);
      callbacks.onSolarSync(Math.round(currentSolarDeg), atmoState.phaseLabel);
      const snap = weatherManager.getSnapshot(mapId, snowArg);
      callbacks.onWeatherTelemetry?.({ ...snap });
      if (isBackgroundFrozen || (photoModeActive && photoCarFrozen)) {
        trackCarInstance?.setLights(headlightsOn, 0, currentNightFactor);
        trackCarInstance?.setDirtAndWeather(lastDirtLevel, snap.wetness);
        renderCurrentFrozenFrame();
      }
    },
    setSnowAtmosphere: (preset: SnowAtmospherePreset) => {
      currentSnowAtmosphere = preset;
      const mappedWeather: WeatherPreset =
        preset === 'twilight_storm' ? 'rain' : preset === 'alpine_snow' ? 'overcast' : 'dry';
      currentWeather = mappedWeather;
      dynamicWeatherBasePreset = mappedWeather;
      if (preset === 'alpine_snow') {
        currentSolarDeg = 34;
        currentHaze = 'low';
        headlightsOn = false;
      } else if (preset === 'twilight_storm') {
        currentSolarDeg = 196;
        currentHaze = 'heavy';
        headlightsOn = true;
      } else {
        currentSolarDeg = 64;
        currentHaze = 'low';
        headlightsOn = false;
      }
      callbacks.onHeadlightsSync?.(headlightsOn);
      weatherManager.setManualWeather(mappedWeather, appMode !== 'racing' || photoModeActive);
      const state = applyAtmosphere(currentSolarDeg, currentHaze, currentWeather);
      updateAdaptivePostFx(true);
      const snap = weatherManager.getSnapshot(getActiveMapId(), currentSnowAtmosphere);
      callbacks.onWeatherTelemetry?.({ ...snap });
      if (isBackgroundFrozen || (photoModeActive && photoCarFrozen)) {
        trackCarInstance?.setLights(headlightsOn, 0, currentNightFactor);
        renderCurrentFrozenFrame();
      }
      return {
        solarAngleDeg: Math.round(currentSolarDeg),
        phaseLabel: state.phaseLabel,
      };
    },
    setInspectMode: (mode: InspectMode) => {
      currentInspectMode = mode;
      terrainRig.setInspectMode(mode);
      roadRig.setWireframe(mode === 'wireframe');
      landmarksRig.setWireframe(mode === 'wireframe');
      flagMarshalsRig.setWireframe(mode === 'wireframe');
      cctvRig.setWireframe(mode === 'wireframe');
      if (gtaoPass) {
        gtaoPass.enabled =
          (graphicsQuality === 'max' || graphicsQuality === 'ultra') && mode === 'lit';
      }
      if (isBackgroundFrozen || (photoModeActive && photoCarFrozen)) {
        renderCurrentFrozenFrame();
      }
    },
    setPostFxEnabled: (enabled: boolean) => {
      postFxEnabled = enabled && !isSoftwareGl;
      syncComposerPassesForState(profiler.getAutoThrottleLevel());
      if (isBackgroundFrozen || (photoModeActive && photoCarFrozen)) {
        renderCurrentFrozenFrame();
      }
    },
    setGraphicsQuality: (quality: GraphicsQuality) => {
      userPinnedQuality = true;
      applyGraphicsQualityInternal(quality, true);
    },
    setShadowQuality: (shadow: ShadowQualityOption) => {
      userPinnedQuality = true;
      shadowQualityOpt = isSoftwareGl ? 'off' : shadow;
      applyShadowSettingsInternal();
    },
    setTextureSize: (size: TextureSizeOption) => {
      userPinnedQuality = true;
      textureSizeOpt = isSoftwareGl ? '512' : size;
      applyTextureSizeInternal();
    },
    setRenderScale: (scale: RenderScaleOption) => {
      userPinnedQuality = true;
      renderScaleOpt = isSoftwareGl ? 'fast' : scale;
      profiler.resetAllThrottle();
      applyRenderResolutionInternal();
    },
    setCinematicSettings: (next: CinematicSettings) => {
      const prevAuto = cinematicSettings.weatherAutoEnabled;
      const prevPace = cinematicSettings.weatherPace;
      const prevDynamic = cinematicSettings.dynamicWeatherEnabled;
      cinematicSettings = { ...next };
      if (!prevDynamic && next.dynamicWeatherEnabled) {
        dynamicWeatherBasePreset = currentWeather;
        weatherManager.setManualWeather(currentWeather, appMode !== 'racing' || photoModeActive);
      } else if (prevDynamic && !next.dynamicWeatherEnabled && !next.weatherAutoEnabled) {
        currentWeather = dynamicWeatherBasePreset;
        weatherManager.setManualWeather(dynamicWeatherBasePreset, appMode !== 'racing' || photoModeActive);
      }
      applyCinematicToPasses();
      if (
        prevAuto !== next.weatherAutoEnabled ||
        prevPace !== next.weatherPace ||
        prevDynamic !== next.dynamicWeatherEnabled
      ) {
        const mapId = getActiveMapId();
        const snowArg = mapId === 'frostpeak_pass' ? currentSnowAtmosphere : null;
        const snap = weatherManager.getSnapshot(mapId, snowArg);
        callbacks.onWeatherTelemetry?.({ ...snap });
      }
      if (isBackgroundFrozen || (photoModeActive && photoCarFrozen)) {
        renderCurrentFrozenFrame();
      }
    },
    setSelectedWaypoint: (wpIndex: number | null) => {
      selectedWaypointIdx = wpIndex;
      syncWaypointMarkerPositions();
    },
    setSelectedBlueprintNode: (ptIndex: number | null) => {
      selectedBlueprintNodeIdx = ptIndex;
      syncWaypointMarkerPositions();
    },
    focusStudioCameraOnNode: (ptIndex: number) => {
      const bp = getCustomBlueprint();
      const pt = bp?.controlPoints[ptIndex];
      if (!pt) return;
      selectedBlueprintNodeIdx = ptIndex;
      syncWaypointMarkerPositions();
      targetLookAt.set(pt.x, pt.y + 1.5, pt.z);
      targetCamPos.set(pt.x + 56, pt.y + 42, pt.z + 56);
      isTransitioning = true;
    },
    snapPointToRoad: (x: number, z: number) => {
      const circuit = getCircuitData();
      if (!circuit || circuit.samples.length === 0) return null;
      const q = circuit.queryNearest(x, z);
      const tan = q.tangent;
      const rotY = Math.atan2(tan.x, tan.z);
      const horiz = Math.max(1e-4, Math.hypot(tan.x, tan.z));
      const rotX = -Math.atan2(tan.y, horiz);
      const rotZ = q.sample.bankAngle || 0;
      return {
        x: Number(q.centerPos.x.toFixed(2)),
        y: Number(q.centerPos.y.toFixed(2)),
        z: Number(q.centerPos.z.toFixed(2)),
        rotX: Number(rotX.toFixed(3)),
        rotY: Number(rotY.toFixed(3)),
        rotZ: Number(rotZ.toFixed(3)),
      };
    },
    setCustomMapCameraMode: (mode: 'overview' | 'top_down') => {
      const meta = MAP_REGISTRY[getActiveMapId()];
      const ovPos = meta.customizerOverviewPos;
      const ovTgt = meta.customizerOverviewTarget;
      if (mode === 'top_down') {
        const span = Math.max(620, Math.hypot(ovPos[0] - ovTgt[0], ovPos[2] - ovTgt[2]) * 1.48);
        targetLookAt.set(ovTgt[0], ovTgt[1], ovTgt[2]);
        targetCamPos.set(ovTgt[0], ovTgt[1] + span, ovTgt[2] + 18);
      } else {
        targetCamPos.set(...ovPos);
        targetLookAt.set(...ovTgt);
      }
      isTransitioning = true;
    },
    previewMapCustomization: (config: MapCustomizationConfig) => {
      syncWaypointMarkerPositions(config);
      applySurfaceLookFromConfig(config);
    },
    applyMapCustomization: (config: MapCustomizationConfig) => {
      profiler.beginTransition('Rebuild Custom Circuit');
      rebuildCircuitData(config);
      rebuildWorldForCurrentCircuit(false, false);
      profiler.endTransition(clock.elapsedTime);
      clock.getDelta();
      renderCurrentFrozenFrame();
      return getCircuitMetrics();
    },
    loadCustomBlueprint: (
      blueprint: CustomMapBlueprint | null,
      fullWorldRebuild = true,
      selectedPropId: string | null = null,
    ) => {
      selectedBuilderPropId = selectedPropId ?? null;
      setCustomBlueprint(blueprint);
      setActiveBlueprintEffects(blueprint);
      if (blueprint) {
        if (getActiveMapId() !== 'aurelia_ridge') {
          setActiveMapId('aurelia_ridge');
        }
        if (fullWorldRebuild || !trackWorldInitialized) {
          profiler.beginTransition('Rebuild Custom Studio Map');
          rebuildCircuitData(getCircuitCustomization('aurelia_ridge'));
          rebuildWorldForCurrentCircuit(true, false);
          profiler.endTransition(clock.elapsedTime);
        } else {
          transformControls.detach();
          trackScene.remove(customPropsRig.group);
          customPropsRig.dispose();
          customPropsRig = buildCustomPropsRig(blueprint, true, selectedBuilderPropId);
          trackScene.add(customPropsRig.group);
          syncWaypointMarkerPositions();
          syncStudioGizmoAttachment();
        }
        currentWeather = blueprint.defaultWeather;
        currentSolarDeg = blueprint.defaultSolarDeg;
        currentHaze = blueprint.defaultHaze;
        weatherManager.setManualWeather(currentWeather, true);
        const atmoState = applyAtmosphere(currentSolarDeg, currentHaze, currentWeather);
        callbacks.onSolarSync(Math.round(currentSolarDeg), atmoState.phaseLabel);
        callbacks.onWeatherTelemetry?.({ ...weatherManager.getSnapshot(getActiveMapId(), null) });
      } else if (fullWorldRebuild) {
        transformControls.detach();
        selectionBoxHelper.visible = false;
        profiler.beginTransition('Restore Official Circuit');
        rebuildCircuitData(getCircuitCustomization(getActiveMapId()));
        if (trackWorldInitialized) {
          rebuildWorldForCurrentCircuit(true, false);
        }
        profiler.endTransition(clock.elapsedTime);
      }
      clock.getDelta();
      renderCurrentFrozenFrame();
      return getCircuitMetrics();
    },
    setCustomMapBuilderPickMode: (active: boolean) => {
      builderPickMode = active;
      syncControlModes();
    },
    setStudioToolMode: (mode: StudioToolMode) => {
      studioToolMode = mode;
      syncControlModes();
    },
    setStudioTransformConfig: (cfg) => {
      studioTransformSpace = cfg.space;
      studioSnapMove = cfg.snapMove;
      studioSnapRotateDeg = cfg.snapRotateDeg;
      studioSnapScale = cfg.snapScale;
      if (cfg.brushRadius !== undefined) {
        studioBrushRadius = cfg.brushRadius;
        if (brushRingMesh.visible) {
          brushRingMesh.scale.setScalar(studioBrushRadius);
        }
      }
      syncStudioGizmoAttachment();
    },
    syncSelectedBuilderProp: (propId: string | null) => {
      selectedBuilderPropId = propId;
      syncStudioGizmoAttachment();
      if (isBackgroundFrozen) {
        renderCurrentFrozenFrame();
      }
    },
    focusStudioCameraOnProp: (propId: string) => {
      const bp = getCustomBlueprint();
      const prop = bp?.placedProps.find((p) => p.id === propId);
      if (!prop) return;
      targetLookAt.set(prop.x, prop.y + 2.5, prop.z);
      targetCamPos.set(prop.x + 28, prop.y + 18, prop.z + 28);
      isTransitioning = true;
    },
    getStudioCameraTarget: () => ({
      x: Number(trackControls.target.x.toFixed(2)),
      y: Number(groundHeightAt(trackControls.target.x, trackControls.target.z).toFixed(2)),
      z: Number(trackControls.target.z.toFixed(2)),
    }),
    updateCustomTerrainMaterialPreview: (blueprint: CustomMapBlueprint) => {
      setCustomBlueprint(blueprint);
      setActiveBlueprintEffects(blueprint);
      terrainRig.updateCustomTerrainLook?.(blueprint);
      if (isBackgroundFrozen) {
        renderCurrentFrozenFrame();
      }
    },
    updateCustomTerrainGeometryFast: (blueprint: CustomMapBlueprint) => {
      setCustomBlueprint(blueprint);
      setActiveBlueprintEffects(blueprint);
      rebuildWorldForCurrentCircuit(false, false);
      if (isBackgroundFrozen) {
        renderCurrentFrozenFrame();
      }
    },
    raycastTrackWorld: (clientX: number, clientY: number) =>
      raycastTrackWorldInternal(clientX, clientY),
    setMultiplayerCollisionEnabled: (enabled: boolean) => {
      remotePlayersRig.setGhostMode(!enabled);
    },
    syncRemotePlayerPose: (pose: MultiplayerCarPose) => {
      remotePlayersRig.upsertPose(pose);
    },
    removeRemotePlayer: (userId: string) => {
      remotePlayersRig.removePlayer(userId);
    },
    clearRemotePlayers: () => {
      remotePlayersRig.clearAll();
    },
    getLocalMultiplayerPose: (
      userId: string,
      username: string,
      carId: string,
      paintHex: string,
    ): MultiplayerCarPose => {
      _mpPoseEuler.setFromQuaternion(physics.worldQuaternion, 'YXZ');
      return {
        userId,
        username,
        carId,
        paintHex,
        x: Number(physics.pos.x.toFixed(3)),
        y: Number(physics.pos.y.toFixed(3)),
        z: Number(physics.pos.z.toFixed(3)),
        headingRad: Number(_mpPoseEuler.y.toFixed(4)),
        pitchRad: Number(_mpPoseEuler.x.toFixed(4)),
        rollRad: Number(_mpPoseEuler.z.toFixed(4)),
        steerNorm: Number((mergedInput.steerAxis ?? 0).toFixed(3)),
        speedMps: Number(lastLatestSpeedMps.toFixed(2)),
        throttle: Number((mergedInput.throttleVal ?? 0).toFixed(2)),
        braking: Boolean(mergedInput.brake),
        headlightsOn,
        hornActive: false,
        lap: lastLatestTlmLap,
        trackT: Number(lastTrackT.toFixed(4)),
        totalProgress: Number(lastTotalProgress.toFixed(4)),
        finished: lastRaceFinishedForMp,
        finishTimeMs: null,
        bestLapMs: lastBestLapMsForMp,
        driftScore: lastDriftPointsForMp,
        tandemPartnerId: tandemPartnerIdForMp,
        tandemPartnerUsername: tandemPartnerNameForMp,
        tandemMultiplier: tandemMultiplierForMp,
        timestamp: Date.now(),
      };
    },
    setActiveMap: (mapId: MapId) => {
      clearPendingOffstagePrewarm();
      const hadCustomBlueprint = Boolean(getCustomBlueprint());
      if (mapId === getActiveMapId() && !hadCustomBlueprint) {
        return getCircuitMetrics();
      }
      profiler.beginTransition(`Map Switch -> ${MAP_REGISTRY[mapId].shortName}`);
      if (hadCustomBlueprint) {
        setCustomBlueprint(null);
        setActiveBlueprintEffects(null);
      }
      setActiveMapId(mapId);
      if (hadCustomBlueprint || (appMode === 'garage' && !isSpectatorMode())) {
        rebuildCircuitData(getCircuitCustomization(mapId), mapId);
      }
      if (appMode !== 'garage' || isSpectatorMode()) {
        rebuildWorldForCurrentCircuit(true, !hadCustomBlueprint);
      } else {
        currentBuiltMapId = null;
      }
      if (mapId === 'frostpeak_pass') {
        if (currentSnowAtmosphere === 'alpine_snow') {
          currentSolarDeg = 34;
          currentHaze = 'low';
          headlightsOn = false;
        } else if (currentSnowAtmosphere === 'twilight_storm') {
          currentSolarDeg = 196;
          currentHaze = 'heavy';
          headlightsOn = true;
        } else {
          currentSolarDeg = 64;
          currentHaze = 'low';
          headlightsOn = false;
        }
      } else if (mapId === 'aurelia_ridge') {
        const sync = AURELIA_WEATHER_SOLAR_SYNC[currentWeather];
        currentSolarDeg = sync.solarDeg;
        currentHaze = sync.haze;
        headlightsOn = sync.headlights;
      } else {
        currentSolarDeg = MAP_REGISTRY[mapId].defaultSolarDeg;
        currentHaze = 'golden';
        headlightsOn = false;
      }
      callbacks.onHeadlightsSync?.(headlightsOn);
      weatherManager.setManualWeather(currentWeather, true);
      const atmoState = applyAtmosphere(currentSolarDeg, currentHaze, currentWeather);
      updateAdaptivePostFx(true);
      callbacks.onSolarSync(Math.round(currentSolarDeg), atmoState.phaseLabel);
      const mapSnap = weatherManager.getSnapshot(
        mapId,
        mapId === 'frostpeak_pass' ? currentSnowAtmosphere : null,
      );
      callbacks.onWeatherTelemetry?.({ ...mapSnap });
      const ov = getActiveVantage('overview');
      targetCamPos.copy(ov.position);
      targetLookAt.copy(ov.target);
      if (appMode === 'custom_map') {
        const meta = MAP_REGISTRY[mapId];
        targetCamPos.set(...meta.customizerOverviewPos);
        targetLookAt.set(...meta.customizerOverviewTarget);
        trackCamera.position.copy(targetCamPos);
        trackControls.target.copy(targetLookAt);
      }
      snapDriveCameraNext = true;
      profiler.endTransition(clock.elapsedTime);
      clock.getDelta();
      if ((appMode !== 'garage' || isSpectatorMode()) && (isBackgroundFrozen || frameId === 0)) {
        renderCurrentFrozenFrame();
      }
      return getCircuitMetrics();
    },
    getActiveMap: () => getActiveMapId(),
    setTougeDirection: (dir: TougeDirection) => {
      if (dir !== getTougeDirection()) {
        setTougeDirection(dir);
        if (trackWorldInitialized && isTougeMapId(getActiveMapId())) {
          rebuildWorldForCurrentCircuit(false, false);
          if (appMode === 'racing') {
            physics.resetToGrid(false, currentRaceConfig);
          }
          if (isBackgroundFrozen || frameId === 0) {
            renderCurrentFrozenFrame();
          }
        }
      }
      return getCircuitMetrics();
    },
    getTougeDirection: () => getTougeDirection(),
    setGhostMode: (mode: GhostBattleMode) => {
      activeGhostMode = mode;
      if (mode === 'off') {
        ghostBattleManager.group.visible = false;
      } else if (appMode === 'racing') {
        ghostBattleManager.startSession(
          mode,
          getActiveMapId(),
          getTougeDirection(),
          selectedCarId,
        );
      }
    },
    getGhostMode: () => activeGhostMode,
    prewarmMap: (mapId: MapId) => {
      prewarmOffstageMap(mapId);
    },
    setAutoManageResources: (enabled: boolean) => {
      profiler.setAutoManage(enabled);
      if (!enabled) {
        applyAdaptiveQualitySettings(0);
      }
    },
    purgeUnusedResources: () => {
      const start = performance.now();
      playerCarPool.forEach((pair, id) => {
        if (id !== selectedCarId) {
          pair.garageCar.dispose();
          pair.trackCar.dispose();
          playerCarPool.delete(id);
        }
      });
      mapRigCache.forEach((entry) => disposeMapCacheEntry(entry));
      mapRigCache.clear();
      cachedMinimap = null;
      renderer.renderLists.dispose();
      profiler.recordTransitionDuration(
        'Purge Unused Cache',
        performance.now() - start,
        clock.elapsedTime,
      );
      callbacks.onPerformanceUpdate?.(
        profiler.buildSnapshot(renderer, playerCarPool.size, getActiveMapId()),
      );
    },
    getPerformanceSnapshot: () =>
      profiler.buildSnapshot(renderer, playerCarPool.size, getActiveMapId()),
    setPhotoMode: (enabled: boolean) => setPhotoModeInternal(enabled),
    cyclePhotoView: () => {
      const idx = PHOTO_VIEW_ORDER.indexOf(photoViewMode);
      photoViewMode = PHOTO_VIEW_ORDER[(idx + 1) % PHOTO_VIEW_ORDER.length];
      seedPhotoViewPose(photoViewMode, photoViewMode === 'orbit');
      applyPhotoInteriorFlags();
      updatePhotoCamera(0.016);
      if (isBackgroundFrozen || frameId === 0) renderCurrentFrozenFrame();
      return emitPhotoState();
    },
    setPhotoViewMode: (view: PhotoViewMode) => {
      photoViewMode = view;
      seedPhotoViewPose(view, false);
      applyPhotoInteriorFlags();
      updatePhotoCamera(0.016);
      if (isBackgroundFrozen || frameId === 0) renderCurrentFrozenFrame();
      return emitPhotoState();
    },
    setPhotoCarFrozen: (frozen: boolean) => {
      if (appMode !== 'racing') return getPhotoModeState();
      photoCarFrozen = frozen;
      clearInputsOnBlur();
      clearPhotoInputs();
      if (frozen) {
        seedPhotoViewPose(photoViewMode, photoViewMode === 'drone' || photoViewMode === 'orbit');
        updatePhotoCamera(0.016);
      } else {
        trackCarInstance?.setInteriorMode(
          drivingCameraMode === 'cockpit' || drivingCameraMode === 'windshield',
        );
        snapDriveCameraNext = true;
      }
      applyPhotoInteriorFlags();
      return emitPhotoState();
    },
    setPhotoLens: (patch: { fovDeg?: number; rollDeg?: number; moveSpeed?: number }) => {
      if (typeof patch.fovDeg === 'number' && Number.isFinite(patch.fovDeg)) {
        photoFovDeg = clamp(patch.fovDeg, 20, 95);
      }
      if (typeof patch.rollDeg === 'number' && Number.isFinite(patch.rollDeg)) {
        photoRollDeg = clamp(patch.rollDeg, -35, 35);
      }
      if (typeof patch.moveSpeed === 'number' && Number.isFinite(patch.moveSpeed)) {
        photoMoveSpeed = clamp(patch.moveSpeed, 1.5, 36);
      }
      if (photoModeActive && (photoCarFrozen || appMode === 'garage')) {
        updatePhotoCamera(0.016);
        if (isBackgroundFrozen || frameId === 0) renderCurrentFrozenFrame();
      }
      return emitPhotoState();
    },
    resetPhotoCamera: () => {
      photoRollDeg = 0;
      photoFovDeg = photoViewMode === 'interior' ? 64 : appMode === 'garage' ? 38 : 42;
      seedPhotoViewPose(photoViewMode, false);
      applyPhotoInteriorFlags();
      if (photoModeActive && (photoCarFrozen || appMode === 'garage')) {
        updatePhotoCamera(0.016);
        if (isBackgroundFrozen || frameId === 0) renderCurrentFrozenFrame();
      }
      return emitPhotoState();
    },
    setPhotoMoveInput: (input: { forward?: number; right?: number; up?: number; boost?: boolean }) => {
      if (typeof input.forward === 'number') photoTouchMove.forward = clamp(input.forward, -1, 1);
      if (typeof input.right === 'number') photoTouchMove.right = clamp(input.right, -1, 1);
      if (typeof input.up === 'number') photoTouchMove.up = clamp(input.up, -1, 1);
      if (typeof input.boost === 'boolean') photoTouchMove.boost = input.boost;
    },
    captureCleanScreenshot: () => {
      const spectating = isSpectatorMode();
      if (appMode === 'garage' && !spectating) {
        renderGarageFrame();
      } else {
        const interiorActive =
          (appMode === 'racing' &&
            !spectating &&
            ((photoModeActive && photoViewMode === 'interior') ||
              (!photoModeActive && (drivingCameraMode === 'cockpit' || drivingCameraMode === 'windshield')))) ||
          (appMode === 'replay' && replayCameraMode === 'cockpit');
        renderTrackFrame(
          interiorActive,
          appMode === 'racing' || appMode === 'replay' ? lastDirtLevel : 0,
          clock.elapsedTime,
          lastRainIntensityForPostFx,
        );
      }
      return renderer.domElement.toDataURL('image/png');
    },
    hasLastReplay: () => Boolean(lastRecordedReplay && lastRecordedReplay.frames.length >= 15),
    getLastReplayMeta: () => {
      if (!lastRecordedReplay) return null;
      return {
        id: lastRecordedReplay.id,
        mapId: lastRecordedReplay.mapId,
        mapName: lastRecordedReplay.mapName,
        carId: lastRecordedReplay.carId,
        carName: lastRecordedReplay.carName,
        durationMs: lastRecordedReplay.durationMs,
        frameCount: lastRecordedReplay.frameCount,
      };
    },
    startReplay: () => {
      if (!lastRecordedReplay || lastRecordedReplay.frames.length < 15) return false;
      replayReturnMode = appMode === 'podium' ? 'podium' : 'garage';
      if (photoModeActive) {
        setPhotoModeInternal(false);
      }
      const targetMapId = (MAP_REGISTRY[lastRecordedReplay.mapId as MapId]
        ? lastRecordedReplay.mapId
        : getActiveMapId()) as MapId;
      if (targetMapId !== getActiveMapId()) {
        setCustomBlueprint(null);
        setActiveBlueprintEffects(null);
        setActiveMapId(targetMapId);
        rebuildCircuitData(getCircuitCustomization(targetMapId), targetMapId);
        rebuildWorldForCurrentCircuit(true, true);
      }
      if (lastRecordedReplay.carId !== selectedCarId && carTemplateMap.has(lastRecordedReplay.carId)) {
        loadAndSelectCar(lastRecordedReplay.carId, true);
      }
      ensureTrackWorldBuilt();
      if (lastRecordedReplay.hasRivals) {
        ensureSprintRivalsOnDemand();
      }
      replayPlayer.load(lastRecordedReplay);
      replayCameraMode = 'cinematic_chase';
      replaySnapNextFrame = true;
      hasPrevReplayCarPos = false;
      cctvEnabled = false;
      flyoverActive = false;
      orbitSpectatorActive = false;
      isPaused = false;
      appMode = 'replay';
      audio.unlock();
      syncControlModes();
      lastReplayUiEmitAt = -10;
      emitReplayState();
      return true;
    },
    exitReplay: (returnMode?: AppScreenMode) => {
      if (appMode !== 'replay') return;
      audio.silence();
      engineerRadio.silence();
      trackCarInstance?.setInteriorMode(false);
      const target = returnMode ?? replayReturnMode ?? 'garage';
      appMode = target;
      syncControlModes();
      if (target === 'garage') {
        renderGarageFrame();
      }
    },
    setReplayPlaying: (playing: boolean) => {
      replayPlayer.setPlaying(playing);
      if (!playing) {
        audio.silence();
      } else {
        audio.unlock();
      }
      emitReplayState();
    },
    seekReplayMs: (targetMs: number) => {
      replayPlayer.seekMs(targetMs);
      replaySnapNextFrame = true;
      hasPrevReplayCarPos = false;
      emitReplayState();
    },
    stepReplayFrames: (frameDelta: number) => {
      replayPlayer.stepFrames(frameDelta);
      audio.silence();
      replaySnapNextFrame = true;
      emitReplayState();
    },
    setReplaySpeed: (speed: number) => {
      replayPlayer.setSpeed(speed);
      if (Math.abs(speed - 1.0) > 0.55) {
        audio.silence();
      }
      emitReplayState();
    },
    setReplayCameraMode: (mode: ReplayCameraMode) => {
      replayCameraMode = mode;
      replaySnapNextFrame = true;
      hasPrevReplayCarPos = false;
      if (mode === 'cctv_auto') {
        cctvStationIndex = cctvRig.getNearestStationIndex();
        lastCctvSwitchTime = clock.elapsedTime;
        callbacks.onCctvStationSync?.(cctvStationIndex);
      }
      syncControlModes();
      emitReplayState();
    },
    setReplayCctvStationIndex: (index: number) => {
      const count = cctvRig.getStationCount();
      if (count > 0) {
        cctvStationIndex = ((index % count) + count) % count;
        replayCameraMode = 'cctv_manual';
        replaySnapNextFrame = true;
        callbacks.onCctvStationSync?.(cctvStationIndex);
        syncControlModes();
        emitReplayState();
      }
    },
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      if (garageLoadDebounceTimer !== null) {
        window.clearTimeout(garageLoadDebounceTimer);
        garageLoadDebounceTimer = null;
      }
      if (activeGarageLoadCarId) {
        abortCarTemplateLoad(activeGarageLoadCarId);
        activeGarageLoadCarId = null;
      }
      clearPendingOffstagePrewarm();
      prewarmTimers.forEach((id) => clearTimeout(id));
      prewarmTimers.clear();
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputsOnBlur);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('touchmove', onWindowTouchMove);
      window.removeEventListener('touchend', onWindowTouchEnd);
      window.removeEventListener('touchcancel', onWindowTouchEnd);
      renderer.domElement.removeEventListener('mousedown', onCanvasMouseDown);
      renderer.domElement.removeEventListener('wheel', onCanvasWheel);
      renderer.domElement.removeEventListener('touchstart', onCanvasTouchStart);
      renderer.domElement.removeEventListener('contextmenu', onCanvasContextMenu);
      trackControls.removeEventListener('start', onTrackControlsStart);
      garageControls.removeEventListener('start', onGarageControlsStart);
      garageControls.removeEventListener('end', onGarageControlsEnd);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      for (const g of wpPinGeos) g.dispose();
      previewLineGeo.dispose();
      previewLineMat.dispose();
      wpPinDefaultMat.dispose();
      wpPinSelectedMat.dispose();
      carPostFxPass?.dispose();
      gtaoPass?.dispose();
      bloomPass?.dispose();
      cinemaPass?.dispose();
      smaaPass?.dispose();
      outputPass?.dispose();
      composer?.dispose();
      garageSanitizePass?.dispose();
      garageBloomPass?.dispose();
      garageCinemaPass?.dispose();
      garageSmaaPass?.dispose();
      garageOutputPass?.dispose();
      garageComposer?.dispose();
      mapRigCache.forEach((entry) => disposeMapCacheEntry(entry));
      mapRigCache.clear();
      trackControls.dispose();
      garageControls.dispose();
      clearCarPlaceholders();
      playerCarPool.forEach((pair) => {
        pair.garageCar.dispose();
        pair.trackCar.dispose();
      });
      playerCarPool.clear();
      garageCarInstance = null;
      trackCarInstance = null;
      transformControls.removeEventListener('dragging-changed', onTransformDraggingChanged);
      transformControls.removeEventListener('objectChange', onTransformObjectChange);
      transformControls.dispose();
      selectionBoxHelper.dispose();
      brushRingGeo.dispose();
      brushRingMat.dispose();
      podiumRig.dispose();
      aiRivalsRig.dispose();
      remotePlayersRig.dispose();
      ghostBattleManager.dispose();
      customPropsRig.dispose();
      carTemplateMap.forEach((tpl) => tpl.dispose());
      carTemplateMap.clear();
      garageStage.dispose();
      terrainRig.dispose();
      roadRig.dispose();
      landmarksRig.dispose();
      propsRig.dispose();
      flagMarshalsRig.dispose();
      cctvRig.dispose();
      skyRig.dispose();
      textures?.dispose();
      engineerRadio.silence();
      audio.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
