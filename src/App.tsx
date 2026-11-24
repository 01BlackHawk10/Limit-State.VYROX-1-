/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Camera, ChevronLeft, ChevronRight, Eye, EyeOff, Home, Settings } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthModal } from './components/AuthModal';
import { CarSelectModal } from './components/CarSelectModal';
import { EngineeringLabModal, type LiveRubberSample } from './components/EngineeringLabModal';
import { GarageTuningDrawer, type TuningDrawerTab } from './components/GarageTuningDrawer';
import { Gt7DrivingHud } from './components/Gt7DrivingHud';
import { LoadingOverlay } from './components/LoadingOverlay';
import { GARAGE_CARS, MainScreenOverlay } from './components/MainScreenOverlay';
import {
  MapBuilderStudio,
  type StudioRebuildMode,
  type StudioTerrainToolConfig,
} from './components/MapBuilderStudio';
import { MapCustomizerOverlay } from './components/MapCustomizerOverlay';
import {
  MobileControlsOverlay,
  type MobileSteerMode,
  type MobileVisibilityMode,
} from './components/MobileControlsOverlay';
import { PerformanceCornerBar } from './components/PerformanceCornerBar';
import {
  type CapturedPhoto,
  getPhotoViewLabel,
  PhotoModeOverlay,
} from './components/PhotoModeOverlay';
import { PlayerProfileModal } from './components/PlayerProfileModal';
import { PodiumCeremonyOverlay } from './components/PodiumCeremonyOverlay';
import { RaceInviteToast } from './components/RaceInviteToast';
import { RaceSetupModal } from './components/RaceSetupModal';
import { ReplayOverlay } from './components/ReplayOverlay';
import { SettingsModal, type SettingsTab } from './components/SettingsModal';
import { SocialHubModal, type SocialHubTab } from './components/SocialHubModal';
import { TrackSelectModal } from './components/TrackSelectModal';
import { UserTutorialOverlay } from './components/UserTutorialOverlay';
import {
  calculateRaceRewardCr,
  computeEffectiveSpecs,
  DEFAULT_STARTING_CREDITS_CR,
  isPartOwnedForCar,
  type PartCategoryId,
  type RaceRewardBreakdown,
} from './engine/carCustomization';
import { createBlueprintFromTemplate } from './engine/customMapBuilder';
import {
  createEmptyDriverAnalytics,
  loadDriverAnalyticsFromStorage,
  mergeDriverAnalytics,
  normalizeDriverAnalytics,
  recordSessionIntoAnalytics,
  saveDriverAnalyticsToStorage,
} from './engine/driverAnalytics';
import { normalizeCarModelId } from './engine/mclarenCarLoader';
import { loadLatestReplayFromDb, REPLAY_CAMERA_OPTIONS } from './engine/replayManager';
import {
  evaluateCarLegality,
  type LegalityEnforcementMode,
} from './engine/ppAndLegality';
import {
  AppScreenMode,
  CameraPresetId,
  CarModelId,
  CarSetupConfig,
  CarVisualCustomization,
  CctvStationInfo,
  CinematicSettings,
  CircuitMetrics,
  CockpitDialState,
  ContinuousWeatherState,
  DEFAULT_CINEMATIC_SETTINGS,
  DrivingCameraMode,
  EngineerRadioCaption,
  GarageCameraPreset,
  getActiveMapId,
  getCircuitCustomization,
  getCircuitMetrics,
  getDefaultCarSetup,
  getDefaultCockpitDials,
  getDefaultMapCustomization,
  getDefaultPitStrategy,
  getDefaultRenderScaleForPreset,
  getDefaultShadowQualityForPreset,
  getDefaultTextureSizeForPreset,
  getDefaultVisualCustomization,
  getEditableWaypointsForActiveMap,
  GraphicsQuality,
  MAP_REGISTRY,
  MapCustomizationConfig,
  MapId,
  MobileControlsInput,
  mountTerrainScene,
  NON_DETERMINISTIC_MATH_WARNING,
  PerformanceSnapshot,
  PhotoModeState,
  PhotoViewMode,
  PitStrategyPlan,
  PodiumCameraAngle,
  RaceConfig,
  readBestLapMsForMapCar,
  RenderScaleOption,
  ReplayCameraMode,
  ReplayUiState,
  SceneControllerAPI,
  ShadowQualityOption,
  TextureSizeOption,
  VEHICLE_SPECS,
  VehicleAssists,
  VehicleTelemetry,
} from './engine/SceneController';
import {
  TOFU_STORY_CHAPTERS,
  type TofuGrade,
  type TofuStoryChapter,
} from './data/tofuStory';
import { type GhostBattleMode } from './engine/ghostManager';
import { getBestLapStorageKeyFor } from './engine/vehiclePhysics';
import {
  AURELIA_WEATHER_SOLAR_SYNC,
  isTougeMapId,
  type TougeDirection,
} from './Maps/mapRegistry';
import {
  HazePreset,
  SnowAtmospherePreset,
  WeatherPreset,
} from './Maps/Aurelia Ridge/skyAndLighting';
import { InspectMode } from './Maps/Aurelia Ridge/terrainBuilder';
import {
  deleteCustomMapById,
  fetchCurrentUser,
  fetchMyMaps,
  getLastSignedInUsername,
  getStoredAuthToken,
  loadLocalProgressVault,
  loginWithUsername,
  logoutAccount,
  saveLocalProgressVault,
  saveOrPublishCustomMap,
  saveUserProgressCloud,
  signupWithUsername,
  submitLeaderboardRecord,
} from './services/apiClient';
import { multiplayerClient } from './services/multiplayerClient';
import { ALL_ACTIVE_CAR_IDS } from './shared/carTypes';
import {
  createEmptyUserProgress,
  DEFAULT_HUD_VISIBILITY,
  type AuthUser,
  type BuilderPropInstance,
  type BuilderPropType,
  type CustomMapBlueprint,
  type DriverAnalyticsData,
  type HudVisibilityConfig,
  type MapTemplateId,
  type PartyCollisionMode,
  type PartyInviteNotification,
  type PartyRoomState,
  type PartyRoomSummary,
  type StudioToolMode,
  type TerrainMaterialStamp,
  type TerrainSculptStamp,
  type UserCareerStats,
  type UserProgressData,
  type WeatherPresetId,
} from './shared/socialTypes';
import {
  resolveDeviceExperienceProfile,
  useDeviceExperience,
} from './utils/deviceExperience';

const INITIAL_TELEMETRY: VehicleTelemetry = {
  speedKmh: 0,
  speedMps: 0,
  rpm: 1150,
  redlineRpm: 8800,
  gear: 1,
  gearMaxSpeedKmh: 62,
  throttle: 0,
  brake: 0,
  steerNorm: 0,
  handbrake: false,
  isBraking: false,
  latG: 0,
  lonG: 0,
  absActive: false,
  tcsActive: false,
  shiftFlash: false,
  surface: 'tarmac',
  audioSurface: 'asphalt',
  gripPct: 100,
  avgTireLifePct: 100,
  minTireLifePct: 100,
  tireCompoundShort: 'RH',
  fuelLiters: 92,
  fuelMaxLiters: 92,
  fuelPct: 100,
  fuelLapsEst: 10.0,
  fuelState: 'normal',
  engineCranking: false,
  powerSteeringLost: false,
  stintLapsTarget: 10,
  stintFuelPerLap: 9.2,
  stintWearPerLapPct: 10,
  pitRequired: false,
  pitOverspeed: false,
  oilTempC: 84.0,
  waterTempC: 80.5,
  tirePressuresPsi: [27.2, 27.2, 26.8, 26.8],
  bodyHeave: 0,
  downforceKgf: 0,
  activeAeroEnabled: true,
  activeAeroMode: 'auto',
  aeroDeployed: true,
  slopeGradePct: 0,
  lsdLockPct: 0,
  ffbTorqueNorm: 0,
  shreddedCount: 0,
  brakeFadeCount: 0,
  cockpitDials: getDefaultCockpitDials(),
  pitStrategy: getDefaultPitStrategy(),
  speedTrapKmh: null,
  speedTrapRecordKmh: 0,
  inDriftClippingZone: false,
  tires: {
    fl: { loadNorm: 0.55, gripLossPct: 0, slip: 0, lifePct: 100, kappa: 0, alphaDeg: 0, travelMm: 0, normalFzN: 2400, grounded: true, brakeTempC: 110, brakeFaded: false, shredded: false, deflationFrac: 0 },
    fr: { loadNorm: 0.55, gripLossPct: 0, slip: 0, lifePct: 100, kappa: 0, alphaDeg: 0, travelMm: 0, normalFzN: 2400, grounded: true, brakeTempC: 110, brakeFaded: false, shredded: false, deflationFrac: 0 },
    rl: { loadNorm: 0.65, gripLossPct: 0, slip: 0, lifePct: 100, kappa: 0, alphaDeg: 0, travelMm: 0, normalFzN: 2500, grounded: true, brakeTempC: 110, brakeFaded: false, shredded: false, deflationFrac: 0 },
    rr: { loadNorm: 0.65, gripLossPct: 0, slip: 0, lifePct: 100, kappa: 0, alphaDeg: 0, travelMm: 0, normalFzN: 2500, grounded: true, brakeTempC: 110, brakeFaded: false, shredded: false, deflationFrac: 0 },
  },
  wheelSlips: [0, 0, 0, 0],
  lap: 1,
  lapTimeMs: 0,
  lastLapMs: null,
  bestLapMs: null,
  sector: 1,
  sectorTimesMs: [null, null, null],
  sectorRecordPulse: 0,
  deltaMs: null,
  cleanLap: true,
  countdownSec: 3.2,
  countdownLabel: '3',
  trackT: 0,
  posX: -39,
  posZ: 240,
  headingRad: Math.PI * 0.5,
  flagState: 'green',
  hazardTrackT: null,
  hazardReason: '',
  pitStatus: 'none',
  pitServiceProgress: 0,
  pitCompletePulse: 0,
  dirtLevel: 0,
  rubberInProgress: 0.08,
  wallImpactImpulse: 0,
  wallScrapeIntensity: 0,
  tireSquealIntensity: 0,
  kerbRumble: 0,
  gearShiftPulse: 0,
  turboBlowOffPulse: 0,
  brakeSkidIntensity: 0,
  sparkEvents: [],
  gameMode: 'sprint',
  lapTarget: 20,
  racePosition: 1,
  totalRacers: 1,
  rivals: [],
  driftPoints: 0,
  driftActivePoints: 0,
  driftCombo: 1,
  driftAngleDeg: 0,
  tofuIntegrityPct: 100,
  tofuCupTiltX: 0,
  tofuCupTiltZ: 0,
  tofuSpilling: false,
  tofuFailed: false,
  tofuFailureReason: '',
  tofuGrade: null,
  ghostActive: false,
  ghostName: '',
  ghostDeltaSec: null,
  ghostGapMeters: null,
  tandemPartnerUsername: null,
  tandemRole: null,
  tandemMultiplier: 1,
  tandemBonusPoints: 0,
  raceFinished: false,
  finishSummary: null,
  carId: 'bmw-m4-gt3-evo',
  carName: '2025 BMW M4 GT3 Evo',
  diagnostics: {
    chassisHz: 120,
    tireSubstepHz: 960,
    substepsPerChassis: 8,
    forceCombination: 'averaged_substep_forces',
    lastStepCpuMs: 0,
    maxStepCpuMs: 0,
    groundedWheels: [true, true, true, true],
    groundedCount: 4,
    clutchEngage: 1,
    escTorqueNm: 0,
    rolloverSsf: 3.1,
    rolloverRiskRatio: 0.45,
    rolloverWarning: false,
    physicsPreset: 'simcade',
    determinismWarning: NON_DETERMINISTIC_MATH_WARNING,
    cornerFzN: [2400, 2400, 2500, 2500],
    testMode: false,
    bottomingEvents: 0,
    govCapDeg: 0,
    cstAssistDeg: 0,
    slipBodyDeg: 0,
  },
};

const INITIAL_PERFORMANCE: PerformanceSnapshot = {
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
  lastTransitionLabel: 'Boot',
  lastTransitionMs: 0,
  recentSpikes: [],
  autoManageEnabled: true,
  autoThrottleLevel: 0,
  drsScale: 1,
  effectiveDpr: 1,
  activeMapId: 'aurelia_ridge',
};

const CINEMATIC_STORAGE_KEY = 'aurelia_cinematic_settings_v1';
const GRAPHICS_QUALITY_STORAGE_KEY = 'aurelia_graphics_quality_v2';
const SHADOW_QUALITY_STORAGE_KEY = 'aurelia_shadow_quality_v1';
const TEXTURE_SIZE_STORAGE_KEY = 'aurelia_texture_size_v1';
const RENDER_SCALE_STORAGE_KEY = 'aurelia_render_scale_v1';
const MOBILE_VIS_STORAGE_KEY = 'aurelia_mobile_vis_v1';
const MOBILE_STEER_STORAGE_KEY = 'aurelia_mobile_steer_v1';
const MOBILE_STEER_SENS_STORAGE_KEY = 'aurelia_mobile_steer_sens_v1';
const MOBILE_AUTO_GAS_STORAGE_KEY = 'aurelia_mobile_auto_gas_v1';
const TUTORIAL_COMPLETED_STORAGE_KEY = 'aurelia_tutorial_completed_v1';
const ASSISTS_STORAGE_KEY = 'aurelia_assists_v1';
const AUDIO_STORAGE_KEY = 'aurelia_audio_config_v1';
const CAR_SETUP_STORAGE_KEY = 'aurelia_car_setups_v1';
const CAR_VISUAL_STORAGE_KEY = 'aurelia_car_visuals_v1';
const HUD_VISIBILITY_STORAGE_KEY = 'aurelia_hud_visibility_v1';
const CREDITS_CR_STORAGE_KEY = 'aurelia_credits_cr_v1';
const OWNED_PARTS_STORAGE_KEY = 'aurelia_owned_parts_v1';
const TOFU_PROGRESS_STORAGE_KEY = 'aurelia_tofu_story_v1';
const TOUGE_DIRECTION_STORAGE_KEY = 'aurelia_touge_dir_v1';
const GHOST_MODE_STORAGE_KEY = 'aurelia_ghost_mode_v1';

const OFFICIAL_MAP_IDS: MapId[] = [
  'aurelia_ridge',
  'coral_bay',
  'frostpeak_pass',
  'kestrel_peaks',
  'akina_pass',
  'akagi_pass',
  'myogi_pass',
];

const TOFU_GRADE_RANK: Record<TofuGrade, number> = {
  S: 4,
  A: 3,
  B: 2,
  C: 1,
};

type TofuProgressMap = NonNullable<UserProgressData['tofuStoryProgress']>;

function loadTofuStoryProgress(): TofuProgressMap {
  try {
    const raw = window.localStorage.getItem(TOFU_PROGRESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as TofuProgressMap) : {};
  } catch {
    return {};
  }
}

function mergeTofuStoryProgress(
  a?: TofuProgressMap,
  b?: TofuProgressMap,
): TofuProgressMap {
  const out: TofuProgressMap = { ...(b ?? {}) };
  for (const [k, v] of Object.entries(a ?? {})) {
    if (!v) continue;
    const prev = out[k];
    if (!prev) {
      out[k] = v;
      continue;
    }
    const prevRank = TOFU_GRADE_RANK[prev.grade] ?? 0;
    const nextRank = TOFU_GRADE_RANK[v.grade] ?? 0;
    out[k] = {
      grade: nextRank >= prevRank ? v.grade : prev.grade,
      bestTimeMs:
        v.bestTimeMs && prev.bestTimeMs
          ? Math.min(v.bestTimeMs, prev.bestTimeMs)
          : v.bestTimeMs ?? prev.bestTimeMs,
      bestIntegrityPct: Math.max(prev.bestIntegrityPct ?? 0, v.bestIntegrityPct ?? 0),
    };
  }
  return out;
}

const VALID_GRAPHICS_QUALITIES: GraphicsQuality[] = [
  'low',
  'recommended',
  'balanced',
  'medium',
  'high',
  'max',
  'ultra',
];

function parseInitialLapsFromUrl(): number | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('laps');
    if (!raw) return null;
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'unlimited' || normalized === 'inf' || normalized === '0') {
      return 0;
    }
    const parsed = Number.parseInt(normalized, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.min(999, parsed);
    }
  } catch {
    // Ignore URL parsing issues
  }
  return null;
}

function syncUrlLapsParam(laps: number): void {
  try {
    const url = new URL(window.location.href);
    const value = laps <= 0 ? 'unlimited' : String(Math.max(1, Math.min(999, Math.round(laps))));
    if (url.searchParams.get('laps') === value) return;
    url.searchParams.set('laps', value);
    window.history.replaceState(null, '', url.toString());
  } catch {
    // Ignore history API errors
  }
}

function hasSavedGraphicsQuality(): boolean {
  try {
    const raw = window.localStorage.getItem(GRAPHICS_QUALITY_STORAGE_KEY);
    return Boolean(
      raw && (raw === 'performance' || (VALID_GRAPHICS_QUALITIES as string[]).includes(raw)),
    );
  } catch {
    return false;
  }
}

function loadGraphicsQuality(): GraphicsQuality {
  try {
    const raw = window.localStorage.getItem(GRAPHICS_QUALITY_STORAGE_KEY);
    if (raw === 'performance') return 'low';
    if (raw && (VALID_GRAPHICS_QUALITIES as string[]).includes(raw)) {
      return raw as GraphicsQuality;
    }
  } catch {
    // Ignore storage access errors
  }
  const isMobile = resolveDeviceExperienceProfile().isMobileExperience;
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 8) : 8;
  const memGb =
    typeof navigator !== 'undefined'
      ? ((navigator as { deviceMemory?: number }).deviceMemory ?? 8)
      : 8;
  if (isMobile || cores <= 2 || memGb <= 2) {
    return 'low';
  }
  return 'recommended';
}

function loadShadowQuality(preset: GraphicsQuality): ShadowQualityOption {
  try {
    const raw = window.localStorage.getItem(SHADOW_QUALITY_STORAGE_KEY);
    if (raw === 'off' || raw === 'low' || raw === 'medium' || raw === 'high') {
      return raw;
    }
  } catch {
    // Ignore storage access errors
  }
  return getDefaultShadowQualityForPreset(preset);
}

function loadTextureSize(preset: GraphicsQuality): TextureSizeOption {
  try {
    const raw = window.localStorage.getItem(TEXTURE_SIZE_STORAGE_KEY);
    if (raw === '512' || raw === '1024' || raw === '2048') {
      return raw;
    }
  } catch {
    // Ignore storage access errors
  }
  return getDefaultTextureSizeForPreset(preset);
}

function loadRenderScale(preset: GraphicsQuality): RenderScaleOption {
  try {
    const raw = window.localStorage.getItem(RENDER_SCALE_STORAGE_KEY);
    if (raw === 'fast' || raw === 'balanced' || raw === 'native') {
      return raw;
    }
  } catch {
    // Ignore storage access errors
  }
  return getDefaultRenderScaleForPreset(preset);
}

const DEFAULT_ASSISTS_STATE: VehicleAssists = {
  autoGear: true,
  abs: true,
  tcs: true,
  steerSensitivity: 1.0,
  autoPitService: false,
  hillClimbAssist: true,
  ffbIntensity: 0.75,
  physicsPreset: 'simcade',
  steeringGovernor: true,
  countersteerAssist: true,
};

function loadAssists(): VehicleAssists {
  try {
    const raw = window.localStorage.getItem(ASSISTS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_ASSISTS_STATE, ...(JSON.parse(raw) as Partial<VehicleAssists>) };
    }
  } catch {
    // Ignore storage access errors
  }
  return { ...DEFAULT_ASSISTS_STATE };
}

interface SavedAudioConfig {
  volume: number;
  muted: boolean;
  surfaceAudioEnabled: boolean;
}

function loadAudioConfig(): SavedAudioConfig {
  try {
    const raw = window.localStorage.getItem(AUDIO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedAudioConfig>;
      return {
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 0.72,
        muted: Boolean(parsed.muted),
        surfaceAudioEnabled: parsed.surfaceAudioEnabled !== false,
      };
    }
  } catch {
    // Ignore storage access errors
  }
  return { volume: 0.72, muted: false, surfaceAudioEnabled: true };
}

const ALL_CAR_IDS: readonly CarModelId[] = ALL_ACTIVE_CAR_IDS;

function loadCarSetups(): Record<CarModelId, CarSetupConfig> {
  const base = Object.fromEntries(
    ALL_CAR_IDS.map((id) => [id, getDefaultCarSetup(id)]),
  ) as Record<CarModelId, CarSetupConfig>;
  try {
    const raw = window.localStorage.getItem(CAR_SETUP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<string, Partial<CarSetupConfig>>>;
      for (const id of ALL_CAR_IDS) {
        if (parsed[id]) {
          base[id] = { ...base[id], ...parsed[id] };
        }
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return base;
}

function loadCreditsCr(): number {
  try {
    const raw = window.localStorage.getItem(CREDITS_CR_STORAGE_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) return Math.round(parsed);
    }
  } catch {
    // Ignore storage access errors
  }
  return DEFAULT_STARTING_CREDITS_CR;
}

function loadOwnedPartsByCar(
  setups: Record<CarModelId, CarSetupConfig>,
): Record<CarModelId, string[]> {
  const base = Object.fromEntries(
    ALL_CAR_IDS.map((id) => [id, [] as string[]]),
  ) as Record<CarModelId, string[]>;
  try {
    const raw = window.localStorage.getItem(OWNED_PARTS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
      for (const id of ALL_CAR_IDS) {
        const list = parsed[id];
        if (Array.isArray(list)) {
          base[id] = list.filter((x): x is string => typeof x === 'string');
        }
      }
    }
  } catch {
    // Ignore storage access errors
  }
  // Ensure any non-OEM part already equipped in localStorage setups counts as owned
  for (const id of ALL_CAR_IDS) {
    const eq = setups[id]?.equippedParts;
    if (!eq) continue;
    const set = new Set(base[id]);
    for (const partId of Object.values(eq)) {
      if (partId && !partId.endsWith('_oem') && partId !== 'wheels_oem_19') {
        set.add(partId);
      }
    }
    base[id] = Array.from(set);
  }
  return base;
}

function loadInitialBestLapsByKey(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const mId of OFFICIAL_MAP_IDS) {
    for (const cId of ALL_CAR_IDS) {
      const ms = readBestLapMsForMapCar(mId, cId);
      if (ms !== null && ms > 10000) {
        out[`${mId}::${cId}`] = ms;
      }
    }
  }
  return out;
}

function mergeProgressSnapshots(
  primary: UserProgressData,
  fallback: UserProgressData | null,
): UserProgressData {
  if (!fallback) return primary;
  const mergedBestLaps: Record<string, number> = { ...(fallback.bestLaps ?? {}) };
  for (const [k, ms] of Object.entries(primary.bestLaps ?? {})) {
    if (typeof ms === 'number' && ms > 10000) {
      const prev = mergedBestLaps[k];
      mergedBestLaps[k] = typeof prev === 'number' && prev > 10000 ? Math.min(prev, ms) : ms;
    }
  }
  const mergedBestDrifts: Record<string, number> = { ...(fallback.bestDrifts ?? {}) };
  for (const [k, pts] of Object.entries(primary.bestDrifts ?? {})) {
    if (typeof pts === 'number') {
      mergedBestDrifts[k] = Math.max(mergedBestDrifts[k] ?? 0, pts);
    }
  }
  const mergedSpeedTraps: Record<string, number> = { ...(fallback.speedTrapRecords ?? {}) };
  for (const [k, kmh] of Object.entries(primary.speedTrapRecords ?? {})) {
    if (typeof kmh === 'number') {
      mergedSpeedTraps[k] = Math.max(mergedSpeedTraps[k] ?? 0, kmh);
    }
  }
  const mergedOwned: Record<string, string[]> = { ...(fallback.ownedPartsByCar ?? {}) };
  for (const [cId, list] of Object.entries(primary.ownedPartsByCar ?? {})) {
    const set = new Set<string>(Array.isArray(mergedOwned[cId]) ? mergedOwned[cId] : []);
    if (Array.isArray(list)) {
      list.forEach((p) => {
        if (typeof p === 'string') set.add(p);
      });
    }
    mergedOwned[cId] = Array.from(set);
  }
  const draftById = new Map<string, CustomMapBlueprint>();
  for (const m of fallback.draftMaps ?? []) {
    if (m?.id) draftById.set(m.id, m);
  }
  for (const m of primary.draftMaps ?? []) {
    if (!m?.id) continue;
    const prev = draftById.get(m.id);
    if (!prev || (m.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) {
      draftById.set(m.id, m);
    }
  }
  const primaryIsFresh =
    (primary.stats?.racesCompleted ?? 0) === 0 &&
    Object.keys(primary.bestLaps ?? {}).length === 0 &&
    Object.keys(primary.ownedPartsByCar ?? {}).length === 0 &&
    (primary.creditsCr ?? DEFAULT_STARTING_CREDITS_CR) === DEFAULT_STARTING_CREDITS_CR;
  return {
    ...fallback,
    ...primary,
    creditsCr: primaryIsFresh
      ? Math.max(primary.creditsCr ?? 0, fallback.creditsCr ?? DEFAULT_STARTING_CREDITS_CR)
      : primary.creditsCr ?? fallback.creditsCr ?? DEFAULT_STARTING_CREDITS_CR,
    ownedPartsByCar: mergedOwned,
    carSetups: { ...(fallback.carSetups ?? {}), ...(primary.carSetups ?? {}) },
    visualCustomizations: {
      ...(fallback.visualCustomizations ?? {}),
      ...(primary.visualCustomizations ?? {}),
    },
    mapCustomizations: { ...(fallback.mapCustomizations ?? {}), ...(primary.mapCustomizations ?? {}) },
    bestLaps: mergedBestLaps,
    bestDrifts: mergedBestDrifts,
    speedTrapRecords: mergedSpeedTraps,
    draftMaps: Array.from(draftById.values()),
    tofuStoryProgress: mergeTofuStoryProgress(primary.tofuStoryProgress, fallback.tofuStoryProgress),
    driverBio: primary.driverBio?.trim() ? primary.driverBio : (fallback.driverBio ?? ''),
    homeCircuitId: primary.homeCircuitId || fallback.homeCircuitId || 'aurelia_ridge',
    driverAnalytics: mergeDriverAnalytics(primary.driverAnalytics, fallback.driverAnalytics),
    stats: {
      racesCompleted: Math.max(primary.stats?.racesCompleted ?? 0, fallback.stats?.racesCompleted ?? 0),
      racesWon: Math.max(primary.stats?.racesWon ?? 0, fallback.stats?.racesWon ?? 0),
      totalDistanceKm: Math.max(primary.stats?.totalDistanceKm ?? 0, fallback.stats?.totalDistanceKm ?? 0),
      totalDriftScore: Math.max(primary.stats?.totalDriftScore ?? 0, fallback.stats?.totalDriftScore ?? 0),
    },
  };
}

function loadCarVisuals(): Record<CarModelId, CarVisualCustomization> {
  const base = Object.fromEntries(
    ALL_CAR_IDS.map((id) => [id, getDefaultVisualCustomization(id)]),
  ) as Record<CarModelId, CarVisualCustomization>;
  try {
    const raw = window.localStorage.getItem(CAR_VISUAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<string, Partial<CarVisualCustomization>>>;
      for (const id of ALL_CAR_IDS) {
        if (parsed[id]) {
          base[id] = { ...base[id], ...parsed[id] };
        }
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return base;
}

function loadMobileVisibility(): MobileVisibilityMode {
  try {
    const raw = window.localStorage.getItem(MOBILE_VIS_STORAGE_KEY);
    if (raw === 'auto' || raw === 'always' || raw === 'off') return raw;
  } catch {
    // Ignore storage access errors
  }
  return 'auto';
}

function loadMobileSteerMode(): MobileSteerMode {
  try {
    const raw = window.localStorage.getItem(MOBILE_STEER_STORAGE_KEY);
    if (raw === 'arrows' || raw === 'wheel' || raw === 'slider' || raw === 'tilt') return raw;
  } catch {
    // Ignore storage access errors
  }
  return 'arrows';
}

function loadMobileAutoGas(): boolean {
  try {
    return window.localStorage.getItem(MOBILE_AUTO_GAS_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function loadMobileSteerSensitivity(): number {
  try {
    const raw = window.localStorage.getItem(MOBILE_STEER_SENS_STORAGE_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return Math.max(0.5, Math.min(2.0, Math.round(parsed * 20) / 20));
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return 1.0;
}

function loadTutorialInitialActive(): boolean {
  try {
    return !window.localStorage.getItem(TUTORIAL_COMPLETED_STORAGE_KEY);
  } catch {
    return true;
  }
}

function loadCinematicSettings(): CinematicSettings {
  try {
    const raw = window.localStorage.getItem(CINEMATIC_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CINEMATIC_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<CinematicSettings>;
    return {
      ...DEFAULT_CINEMATIC_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_CINEMATIC_SETTINGS };
  }
}

function loadHudVisibility(): HudVisibilityConfig {
  try {
    const raw = window.localStorage.getItem(HUD_VISIBILITY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_HUD_VISIBILITY };
    return {
      ...DEFAULT_HUD_VISIBILITY,
      ...(JSON.parse(raw) as Partial<HudVisibilityConfig>),
    };
  } catch {
    return { ...DEFAULT_HUD_VISIBILITY };
  }
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<SceneControllerAPI | null>(null);

  // Circuit Metrics & Multi-Map Customizer State
  const [activeMapId, setActiveMapIdState] = useState<MapId>(() => getActiveMapId());
  const [metrics, setMetrics] = useState<CircuitMetrics>(() => getCircuitMetrics());
  const [mapRevision, setMapRevision] = useState(0);
  const [mapConfig, setMapConfig] = useState<MapCustomizationConfig>(() =>
    getCircuitCustomization(),
  );
  const [selectedWaypoint, setSelectedWaypoint] = useState<number>(
    () => getEditableWaypointsForActiveMap()[0].index,
  );
  const [trackSelectOpen, setTrackSelectOpen] = useState(false);
  const [carSelectOpen, setCarSelectOpen] = useState(false);
  const [pendingRaceLaunch, setPendingRaceLaunch] = useState<
    | { kind: 'official_track'; mapId: MapId }
    | { kind: 'current_customized' }
    | { kind: 'custom_blueprint'; blueprint: CustomMapBlueprint; fromBuilder: boolean }
    | null
  >(null);
  const raceSetupModalOpen = pendingRaceLaunch !== null;

  // Screen & Garage state
  const [appMode, setAppMode] = useState<AppScreenMode>('garage');
  const [carIndex, setCarIndex] = useState(0);
  const carIndexRef = useRef(0);
  carIndexRef.current = carIndex;
  const [selectedCarId, setSelectedCarId] = useState<CarModelId>('bmw-m4-gt3-evo');
  const [carLoadPct, setCarLoadPct] = useState(0);
  const [carReady, setCarReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsOpenRef = useRef(false);
  settingsOpenRef.current = settingsOpen;
  const lastPerfUiSyncRef = useRef(0);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('cameras');
  const {
    profile: deviceProfile,
    setDeviceOverride,
  } = useDeviceExperience();
  const [raceConfig, setRaceConfig] = useState<RaceConfig>(() => {
    const urlLaps = parseInitialLapsFromUrl();
    const initialLaps = urlLaps !== null ? urlLaps : 20;
    return {
      mode: urlLaps === 0 ? 'time_trial' : 'sprint',
      lapCount: initialLaps,
      difficulty: 'pro',
      targetStints: 2,
      strategyPreset: urlLaps === 0 ? 'endurance' : 'sprint',
      startCountdownMode: resolveDeviceExperienceProfile().isMobileExperience ? 'quick' : 'full',
    };
  });
  const raceConfigRef = useRef<RaceConfig>(raceConfig);
  raceConfigRef.current = raceConfig;
  const [tougeDirection, setTougeDirectionState] = useState<TougeDirection>(() => {
    try {
      const saved = window.localStorage.getItem(TOUGE_DIRECTION_STORAGE_KEY);
      return saved === 'uphill' ? 'uphill' : 'downhill';
    } catch {
      return 'downhill';
    }
  });
  const tougeDirectionRef = useRef<TougeDirection>(tougeDirection);
  tougeDirectionRef.current = tougeDirection;
  const [ghostMode, setGhostModeState] = useState<GhostBattleMode>(() => {
    try {
      const saved = window.localStorage.getItem(GHOST_MODE_STORAGE_KEY);
      return saved === 'pb' || saved === 'rival' ? saved : 'off';
    } catch {
      return 'off';
    }
  });
  const ghostModeRef = useRef<GhostBattleMode>(ghostMode);
  ghostModeRef.current = ghostMode;
  const [tofuStoryProgress, setTofuStoryProgress] = useState<TofuProgressMap>(loadTofuStoryProgress);
  const [minimapMode, setMinimapMode] = useState<'overview' | 'ahead'>('overview');
  const [garageCamPreset, setGarageCamPreset] = useState<GarageCameraPreset>('hero');
  const [preRaceIntroActive, setPreRaceIntroActive] = useState(false);
  const [podiumCameraAngle, setPodiumCameraAngle] = useState<PodiumCameraAngle>('auto');
  const [engineerCaption, setEngineerCaption] = useState<EngineerRadioCaption | null>(null);
  const [perfSnapshot, setPerfSnapshot] = useState<PerformanceSnapshot>(INITIAL_PERFORMANCE);
  const perfSubscribersRef = useRef<Set<(snap: PerformanceSnapshot) => void>>(new Set());
  const subscribePerfSnapshot = useCallback((listener: (snap: PerformanceSnapshot) => void) => {
    perfSubscribersRef.current.add(listener);
    return () => {
      perfSubscribersRef.current.delete(listener);
    };
  }, []);

  // Driving Assists, GT7 Car Setup, Career CR Economy, Cockpit Dials & Pit Strategy
  const [assists, setAssists] = useState<VehicleAssists>(loadAssists);
  const assistsRef = useRef<VehicleAssists>(assists);
  assistsRef.current = assists;
  const [cockpitDials, setCockpitDials] = useState<CockpitDialState>(() => getDefaultCockpitDials());
  const [pitStrategy, setPitStrategy] = useState<PitStrategyPlan>(() => getDefaultPitStrategy());
  const [advancedTelemetryEnabled, setAdvancedTelemetryEnabled] = useState(false);
  const [carSetupByCar, setCarSetupByCar] = useState<Record<CarModelId, CarSetupConfig>>(loadCarSetups);
  const [creditsCr, setCreditsCr] = useState<number>(loadCreditsCr);
  const creditsCrRef = useRef<number>(creditsCr);
  creditsCrRef.current = creditsCr;
  const [ownedPartsByCar, setOwnedPartsByCar] = useState<Record<CarModelId, string[]>>(() =>
    loadOwnedPartsByCar(carSetupByCar),
  );
  const ownedPartsByCarRef = useRef<Record<CarModelId, string[]>>(ownedPartsByCar);
  ownedPartsByCarRef.current = ownedPartsByCar;
  const [lastRaceReward, setLastRaceReward] = useState<RaceRewardBreakdown | null>(null);
  const [visualConfigByCar, setVisualConfigByCar] = useState<Record<CarModelId, CarVisualCustomization>>(loadCarVisuals);
  const [tuningOpen, setTuningOpen] = useState(false);
  const [engLabOpen, setEngLabOpen] = useState(false);
  const [customMapCameraMode, setCustomMapCameraMode] = useState<'overview' | 'top_down'>('overview');
  const [legalityRuleId, setLegalityRuleId] = useState<string>('open_prototype');
  const [legalityEnforcement, setLegalityEnforcement] = useState<LegalityEnforcementMode>('relaxed');
  const [testModeEnabled, setTestModeEnabled] = useState(false);
  const carSetup = carSetupByCar[selectedCarId];
  const carSetupRef = useRef<CarSetupConfig>(carSetup);
  carSetupRef.current = carSetup;
  const visualConfig = visualConfigByCar[selectedCarId];
  const visualConfigRef = useRef<CarVisualCustomization>(visualConfig);
  visualConfigRef.current = visualConfig;
  const [drivingCamera, setDrivingCamera] = useState<DrivingCameraMode>('chase');
  const [initialAudio] = useState<SavedAudioConfig>(loadAudioConfig);
  const [audioVolume, setAudioVolume] = useState(initialAudio.volume);
  const audioVolumeRef = useRef(audioVolume);
  audioVolumeRef.current = audioVolume;
  const [audioMuted, setAudioMuted] = useState(initialAudio.muted);
  const audioMutedRef = useRef(audioMuted);
  audioMutedRef.current = audioMuted;
  const [surfaceAudioEnabled, setSurfaceAudioEnabled] = useState(initialAudio.surfaceAudioEnabled);
  const surfaceAudioEnabledRef = useRef(surfaceAudioEnabled);
  surfaceAudioEnabledRef.current = surfaceAudioEnabled;
  const [telemetry, setTelemetry] = useState<VehicleTelemetry>(() => ({
    ...INITIAL_TELEMETRY,
    bestLapMs: readBestLapMsForMapCar('aurelia_ridge', 'bmw-m4-gt3-evo'),
  }));
  const telemetryRef = useRef<VehicleTelemetry>(telemetry);
  const telemetrySubscribersRef = useRef<Set<(tlm: VehicleTelemetry) => void>>(new Set());
  const subscribeTelemetry = useCallback((listener: (tlm: VehicleTelemetry) => void) => {
    telemetrySubscribersRef.current.add(listener);
    return () => {
      telemetrySubscribersRef.current.delete(listener);
    };
  }, []);
  const [rubberHistory, setRubberHistory] = useState<LiveRubberSample[]>([]);
  const rubberHistoryRef = useRef<LiveRubberSample[]>([]);
  const weatherLabelRef = useRef<string>('Dry');

  // World & Total Map Spectator Controls
  const [activePreset, setActivePreset] = useState<CameraPresetId | null>(null);
  const [isFlyover, setIsFlyover] = useState(false);
  const [isCctv, setIsCctv] = useState(false);
  const [cctvStations, setCctvStations] = useState<CctvStationInfo[]>([]);
  const [cctvStationIndex, setCctvStationIndex] = useState(0);
  const [cctvAutoSwitch, setCctvAutoSwitch] = useState(true);
  const [solarAngle, setSolarAngle] = useState(168);
  const [phaseLabel, setPhaseLabel] = useState('Golden Hour');
  const [isAutoCycle, setIsAutoCycle] = useState(false);
  const [hazePreset, setHazePreset] = useState<HazePreset>('golden');
  const [weatherPreset, setWeatherPreset] = useState<WeatherPreset>('dry');
  const [snowAtmosphere, setSnowAtmosphere] = useState<SnowAtmospherePreset>('alpine_snow');
  const [inspectMode, setInspectMode] = useState<InspectMode>('lit');
  const [postFxEnabled, setPostFxEnabled] = useState(true);
  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>(loadGraphicsQuality);
  const graphicsQualityRef = useRef<GraphicsQuality>(graphicsQuality);
  graphicsQualityRef.current = graphicsQuality;
  const [shadowQuality, setShadowQuality] = useState<ShadowQualityOption>(() =>
    loadShadowQuality(loadGraphicsQuality()),
  );
  const shadowQualityRef = useRef<ShadowQualityOption>(shadowQuality);
  shadowQualityRef.current = shadowQuality;
  const [textureSize, setTextureSize] = useState<TextureSizeOption>(() =>
    loadTextureSize(loadGraphicsQuality()),
  );
  const textureSizeRef = useRef<TextureSizeOption>(textureSize);
  textureSizeRef.current = textureSize;
  const [renderScale, setRenderScale] = useState<RenderScaleOption>(() =>
    loadRenderScale(loadGraphicsQuality()),
  );
  const renderScaleRef = useRef<RenderScaleOption>(renderScale);
  renderScaleRef.current = renderScale;
  const [garageAeroPreview, setGarageAeroPreview] = useState(true);
  const [mobileVisibility, setMobileVisibility] = useState<MobileVisibilityMode>(loadMobileVisibility);
  const [mobileSteerMode, setMobileSteerMode] = useState<MobileSteerMode>(loadMobileSteerMode);
  const [mobileSteerSensitivity, setMobileSteerSensitivity] = useState<number>(
    loadMobileSteerSensitivity,
  );
  const [mobileAutoGas, setMobileAutoGas] = useState<boolean>(loadMobileAutoGas);
  const isTouchDevice = deviceProfile.isMobileExperience || deviceProfile.hasTouchInput;
  const [tutorialActive, setTutorialActive] = useState<boolean>(loadTutorialInitialActive);
  const tutorialActiveRef = useRef<boolean>(tutorialActive);
  tutorialActiveRef.current = tutorialActive;
  const engLabOpenRef = useRef<boolean>(engLabOpen);
  engLabOpenRef.current = engLabOpen;
  const [tutorialRunId, setTutorialRunId] = useState(0);
  const [cinematicSettings, setCinematicSettings] = useState<CinematicSettings>(loadCinematicSettings);
  const cinematicSettingsRef = useRef<CinematicSettings>(cinematicSettings);
  cinematicSettingsRef.current = cinematicSettings;
  const [liveWeatherState, setLiveWeatherState] = useState<ContinuousWeatherState | null>(null);
  const [isHudHidden, setIsHudHidden] = useState(false);
  const [hudVisibility, setHudVisibility] = useState<HudVisibilityConfig>(loadHudVisibility);
  const [hudMenuOpen, setHudMenuOpen] = useState(false);
  const [studioModalFrozen, setStudioModalFrozen] = useState(false);
  const [garageTab, setGarageTab] = useState<'showroom' | 'events' | 'controls'>('showroom');
  const [photoState, setPhotoState] = useState<PhotoModeState>({
    active: false,
    viewMode: 'drone',
    carFrozen: true,
    fovDeg: 38,
    rollDeg: 0,
    moveSpeed: 8.5,
  });
  const photoStateRef = useRef<PhotoModeState>(photoState);
  photoStateRef.current = photoState;
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);
  const [photoPreviewId, setPhotoPreviewId] = useState<string | null>(null);
  const photoPreviewIdRef = useRef<string | null>(photoPreviewId);
  photoPreviewIdRef.current = photoPreviewId;
  const [autoPreviewPhoto, setAutoPreviewPhoto] = useState<boolean>(true);
  const autoPreviewPhotoRef = useRef<boolean>(autoPreviewPhoto);
  autoPreviewPhotoRef.current = autoPreviewPhoto;
  const [photoFlashCounter, setPhotoFlashCounter] = useState(0);
  const [loadingState, setLoadingState] = useState<{
    active: boolean;
    title: string;
    subtitle?: string;
    progressPct?: number | null;
  }>({ active: false, title: '' });

  // Account, Cloud Progress, Multiplayer Party & Custom Map Studio State
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(() => Boolean(getStoredAuthToken()));
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [headlightsOn, setHeadlightsOn] = useState(false);
  const [socialHubOpen, setSocialHubOpen] = useState(false);
  const [socialHubTab, setSocialHubTab] = useState<SocialHubTab>('parties');
  const [activeParty, setActiveParty] = useState<PartyRoomState | null>(null);
  const [liveParties, setLiveParties] = useState<PartyRoomSummary[]>([]);
  const [incomingInvite, setIncomingInvite] = useState<PartyInviteNotification | null>(null);
  const [socialNotice, setSocialNotice] = useState<string | null>(null);
  const [builderStudioOpen, setBuilderStudioOpen] = useState(false);
  const [activeCustomBlueprint, setActiveCustomBlueprint] = useState<CustomMapBlueprint | null>(null);
  const [builderDraftBlueprint, setBuilderDraftBlueprint] = useState<CustomMapBlueprint>(() =>
    createBlueprintFromTemplate('blank_loop'),
  );
  const [savedDraftTimestamps, setSavedDraftTimestamps] = useState<Record<string, number>>({});
  const [studioToolMode, setStudioToolMode] = useState<StudioToolMode>('select');
  const [selectedBuilderPropId, setSelectedBuilderPropId] = useState<string | null>(null);
  const [selectedStudioNodeIdx, setSelectedStudioNodeIdx] = useState<number>(0);
  const [activePropType, setActivePropType] = useState<BuilderPropType>('ramp');
  const [autoAlignTrack, setAutoAlignTrack] = useState<boolean>(true);
  const [studioStatusMessage, setStudioStatusMessage] = useState<string | null>(null);
  const [terrainToolConfig, setTerrainToolConfig] = useState<StudioTerrainToolConfig>({
    mode: 'material',
    sculptOp: 'raise',
    materialId: 'asphalt',
    colorHex: '',
    radius: 44,
    strength: 10,
  });
  const [studioUndoStack, setStudioUndoStack] = useState<CustomMapBlueprint[]>([]);
  const [studioRedoStack, setStudioRedoStack] = useState<CustomMapBlueprint[]>([]);
  const [userStats, setUserStats] = useState<UserCareerStats>(() => createEmptyUserProgress().stats);
  const [driverAnalytics, setDriverAnalytics] = useState<DriverAnalyticsData>(
    loadDriverAnalyticsFromStorage,
  );
  const [driverBio, setDriverBio] = useState<string>('');
  const [homeCircuitId, setHomeCircuitId] = useState<string>('aurelia_ridge');
  const [tuningInitialTab, setTuningInitialTab] = useState<TuningDrawerTab>('parts');
  const [hasLastReplay, setHasLastReplay] = useState<boolean>(false);
  const [replayState, setReplayState] = useState<ReplayUiState | null>(null);
  const replayStateRef = useRef<ReplayUiState | null>(null);
  replayStateRef.current = replayState;
  const replayReturnModeRef = useRef<AppScreenMode>('garage');
  const [profileViewerOpen, setProfileViewerOpen] = useState<boolean>(false);
  const [profileViewerTarget, setProfileViewerTarget] = useState<string | null>(null);
  const [bestLapsByKey, setBestLapsByKey] = useState<Record<string, number>>(loadInitialBestLapsByKey);
  const [bestDriftsByKey, setBestDriftsByKey] = useState<Record<string, number>>({});
  const bestDriftsByKeyRef = useRef<Record<string, number>>(bestDriftsByKey);
  bestDriftsByKeyRef.current = bestDriftsByKey;
  const [speedTrapByKey, setSpeedTrapByKey] = useState<Record<string, number>>({});
  const [draftMaps, setDraftMaps] = useState<CustomMapBlueprint[]>([]);
  const [mapCustomizationsByMap, setMapCustomizationsByMap] = useState<Record<string, MapCustomizationConfig>>({});

  useEffect(() => {
    void loadLatestReplayFromDb().then((rec) => {
      if (rec) setHasLastReplay(true);
    });
  }, []);

  const authUserRef = useRef<AuthUser | null>(null);
  authUserRef.current = authUser;
  const activePartyRef = useRef<PartyRoomState | null>(null);
  activePartyRef.current = activeParty;
  const activeCustomBlueprintRef = useRef<CustomMapBlueprint | null>(null);
  activeCustomBlueprintRef.current = activeCustomBlueprint;
  const builderDraftBlueprintRef = useRef<CustomMapBlueprint>(builderDraftBlueprint);
  builderDraftBlueprintRef.current = builderDraftBlueprint;
  const selectedBuilderPropIdRef = useRef<string | null>(selectedBuilderPropId);
  selectedBuilderPropIdRef.current = selectedBuilderPropId;
  const terrainToolConfigRef = useRef<StudioTerrainToolConfig>(terrainToolConfig);
  terrainToolConfigRef.current = terrainToolConfig;
  const activePropTypeRef = useRef<BuilderPropType>(activePropType);
  activePropTypeRef.current = activePropType;
  const autoAlignTrackRef = useRef<boolean>(autoAlignTrack);
  autoAlignTrackRef.current = autoAlignTrack;
  const studioBrushStartBpRef = useRef<CustomMapBlueprint | null>(null);
  const studioNodeDragStartBpRef = useRef<CustomMapBlueprint | null>(null);
  const activeMapIdRef = useRef<MapId>(activeMapId);
  activeMapIdRef.current = activeMapId;
  const selectedCarIdRef = useRef<CarModelId>(selectedCarId);
  selectedCarIdRef.current = selectedCarId;
  const weatherPresetRef = useRef<WeatherPreset>(weatherPreset);
  weatherPresetRef.current = weatherPreset;
  const appModeRef = useRef<AppScreenMode>(appMode);
  appModeRef.current = appMode;
  const legalityEvalPpRef = useRef<number>(912.4);
  const raceStartDistKmRef = useRef<number>(0);
  const lastFrameDistTsRef = useRef<number>(0);
  const currentRaceDistanceKmRef = useRef<number>(0);
  const cloudHydratedRef = useRef<boolean>(false);
  const hasUserSelectedCarRef = useRef<boolean>(false);
  const launchedPartySessionRef = useRef<string | null>(null);
  const buildUserProgressSnapshotRef = useRef<(() => UserProgressData) | null>(null);

  const pendingActionRafRef = useRef<number | null>(null);
  const loadingJobSeqRef = useRef<number>(0);

  const nextFrame = () =>
    new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

  const scheduleAfterPaint = useCallback((fn: () => void) => {
    if (pendingActionRafRef.current !== null) {
      window.cancelAnimationFrame(pendingActionRafRef.current);
    }
    pendingActionRafRef.current = window.requestAnimationFrame(() => {
      pendingActionRafRef.current = null;
      fn();
    });
  }, []);

  const runWithLoadingScreen = useCallback(
    (
      title: string,
      subtitle: string | undefined,
      work: (reportProgress?: (pct: number, nextSubtitle?: string) => void) => void | Promise<void>,
    ) => {
      if (pendingActionRafRef.current !== null) {
        window.cancelAnimationFrame(pendingActionRafRef.current);
        pendingActionRafRef.current = null;
      }
      const seq = ++loadingJobSeqRef.current;
      setLoadingState({ active: true, title, subtitle, progressPct: 35 });
      void (async () => {
        await nextFrame();
        if (loadingJobSeqRef.current !== seq) return;
        setLoadingState({ active: true, title, subtitle, progressPct: 75 });
        try {
          await work((pct, nextSubtitle) => {
            if (loadingJobSeqRef.current === seq) {
              setLoadingState({
                active: true,
                title,
                subtitle: nextSubtitle ?? subtitle,
                progressPct: Math.max(0, Math.min(100, pct)),
              });
            }
          });
        } finally {
          if (loadingJobSeqRef.current === seq) {
            setLoadingState({ active: false, title: '' });
          }
        }
      })();
    },
    [],
  );

  useEffect(() => {
    return () => {
      loadingJobSeqRef.current += 1;
      if (pendingActionRafRef.current !== null) {
        window.cancelAnimationFrame(pendingActionRafRef.current);
      }
    };
  }, []);

  const [contextLost, setContextLost] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(CINEMATIC_STORAGE_KEY, JSON.stringify(cinematicSettings));
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }, [cinematicSettings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(ASSISTS_STORAGE_KEY, JSON.stringify(assists));
    } catch {
      // Ignore storage quota errors
    }
  }, [assists]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        AUDIO_STORAGE_KEY,
        JSON.stringify({ volume: audioVolume, muted: audioMuted, surfaceAudioEnabled }),
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [audioVolume, audioMuted, surfaceAudioEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CAR_SETUP_STORAGE_KEY, JSON.stringify(carSetupByCar));
    } catch {
      // Ignore storage quota errors
    }
  }, [carSetupByCar]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CREDITS_CR_STORAGE_KEY, String(creditsCr));
    } catch {
      // Ignore storage quota errors
    }
  }, [creditsCr]);

  useEffect(() => {
    try {
      window.localStorage.setItem(OWNED_PARTS_STORAGE_KEY, JSON.stringify(ownedPartsByCar));
    } catch {
      // Ignore storage quota errors
    }
  }, [ownedPartsByCar]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CAR_VISUAL_STORAGE_KEY, JSON.stringify(visualConfigByCar));
    } catch {
      // Ignore storage quota errors
    }
  }, [visualConfigByCar]);

  useEffect(() => {
    try {
      window.localStorage.setItem(HUD_VISIBILITY_STORAGE_KEY, JSON.stringify(hudVisibility));
    } catch {
      // Ignore storage quota errors
    }
  }, [hudVisibility]);

  // Unlock Web Audio cleanly on first user gesture (especially important on iOS/Android mobile)
  useEffect(() => {
    const unlockOnce = () => {
      controllerRef.current?.unlockAudio();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('touchstart', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });
    window.addEventListener('touchstart', unlockOnce, { passive: true });
    window.addEventListener('keydown', unlockOnce);
    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('touchstart', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
  }, []);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const initialTouch = resolveDeviceExperienceProfile().isMobileExperience;
    const api = mountTerrainScene(mountEl, {
      initialGraphicsQuality: graphicsQualityRef.current,
      initialShadowQuality: shadowQualityRef.current,
      initialTextureSize: textureSizeRef.current,
      initialRenderScale: renderScaleRef.current,
      isTouchDevice: initialTouch,
      startupBenchmarkPinned: hasSavedGraphicsQuality(),
      onContextLost: (lost) => setContextLost(lost),
      onUserInterrupt: () => {
        setIsFlyover(false);
        setActivePreset(null);
      },
      onSolarSync: (angleDeg, label) => {
        setSolarAngle(angleDeg);
        setPhaseLabel(label);
      },
      onCctvStationSync: (stationIdx) => {
        setCctvStationIndex(stationIdx);
      },
      onCarLoadProgress: (pct, ready) => {
        setCarLoadPct(pct);
        setCarReady(ready);
      },
      onTelemetry: (tlm) => {
        const prevTlm = telemetryRef.current;
        telemetryRef.current = tlm;
        telemetrySubscribersRef.current.forEach((listener) => listener(tlm));

        const prevCdCeil = prevTlm.countdownSec > 0 ? Math.ceil(prevTlm.countdownSec) : 0;
        const nextCdCeil = tlm.countdownSec > 0 ? Math.ceil(tlm.countdownSec) : 0;
        const shouldSyncRoot =
          appModeRef.current !== 'racing' ||
          tutorialActiveRef.current ||
          engLabOpenRef.current ||
          tlm.lap !== prevTlm.lap ||
          nextCdCeil !== prevCdCeil ||
          tlm.pitStatus !== prevTlm.pitStatus ||
          tlm.raceFinished !== prevTlm.raceFinished ||
          tlm.carId !== prevTlm.carId ||
          tlm.activeAeroEnabled !== prevTlm.activeAeroEnabled ||
          tlm.activeAeroMode !== prevTlm.activeAeroMode ||
          tlm.aeroDeployed !== prevTlm.aeroDeployed ||
          tlm.bestLapMs !== prevTlm.bestLapMs ||
          (tlm.finishSummary !== null) !== (prevTlm.finishSummary !== null);
        if (shouldSyncRoot) {
          setTelemetry(tlm);
        }

        const nowTs = performance.now();
        if (lastFrameDistTsRef.current > 0 && tlm.countdownSec <= 0 && !tlm.raceFinished) {
          const dtSec = Math.min(0.25, (nowTs - lastFrameDistTsRef.current) / 1000);
          currentRaceDistanceKmRef.current += (tlm.speedMps * dtSec) / 1000;
        }
        lastFrameDistTsRef.current = nowTs;

        const mapKey = activeCustomBlueprintRef.current
          ? `custom:${activeCustomBlueprintRef.current.id}`
          : activeMapIdRef.current;
        const pbKey = `${mapKey}::${selectedCarIdRef.current}`;
        if (tlm.bestLapMs !== null && tlm.bestLapMs > 10000) {
          setBestLapsByKey((prev) => {
            const cur = prev[pbKey];
            if (cur === undefined || tlm.bestLapMs! < cur) {
              return { ...prev, [pbKey]: tlm.bestLapMs! };
            }
            return prev;
          });
        }
        if (tlm.driftPoints > 0) {
          const roundedDrift = Math.round(tlm.driftPoints);
          const curSavedDrift = bestDriftsByKeyRef.current[pbKey] ?? 0;
          if (roundedDrift > curSavedDrift && (tlm.raceFinished || roundedDrift - curSavedDrift >= 250)) {
            setBestDriftsByKey((prev) => {
              const cur = prev[pbKey] ?? 0;
              if (roundedDrift > cur) {
                return { ...prev, [pbKey]: roundedDrift };
              }
              return prev;
            });
          }
        }
        if (tlm.speedTrapRecordKmh > 0) {
          setSpeedTrapByKey((prev) => {
            const cur = prev[pbKey] ?? 0;
            if (tlm.speedTrapRecordKmh > cur) {
              return { ...prev, [pbKey]: Math.round(tlm.speedTrapRecordKmh) };
            }
            return prev;
          });
        }

        if (tlm.countdownSec <= 0 && !tlm.raceFinished) {
          const lapProgress = Number(Math.max(0, tlm.lap - 1 + tlm.trackT).toFixed(2));
          const buf = rubberHistoryRef.current;
          const last = buf[buf.length - 1];
          if (
            !last ||
            lapProgress >= last.lapProgress + 0.12 ||
            tlm.lap > last.lap
          ) {
            buf.push({
              lapProgress,
              lap: tlm.lap,
              rubberPct: Number((tlm.rubberInProgress * 100).toFixed(1)),
              gripMu: Number(((tlm.gripPct / 100) * 1.44).toFixed(3)),
              weatherLabel: weatherLabelRef.current,
            });
            if (buf.length > 260) {
              buf.splice(0, buf.length - 260);
            }
          }
        }
      },
      onPreRaceIntroSync: (active) => {
        setPreRaceIntroActive(active);
      },
      onDrivingCameraSync: (cam) => {
        setDrivingCamera(cam);
      },
      onWaypointSelected: (wpIdx) => {
        setSelectedWaypoint(wpIdx);
      },
      onWaypointDragged: (wpIdx, dx, dz) => {
        setSelectedWaypoint(wpIdx);
        setMapConfig((prev) => ({
          ...prev,
          waypointOffsets: {
            ...prev.waypointOffsets,
            [wpIdx]: { dx, dz },
          },
        }));
      },
      onRaceFinished: (tlm) => {
        setTelemetry(tlm);
        setSettingsOpen(false);
        setHudMenuOpen(false);
        setIsHudHidden(false);
        setIsCctv(false);
        setIsFlyover(false);
        setActivePreset(null);
        setPodiumCameraAngle('auto');
        setEngineerCaption(null);
        setRubberHistory([...rubberHistoryRef.current]);
        setAppMode('podium');

        const sessionDistKm = Math.max(0, currentRaceDistanceKmRef.current);
        currentRaceDistanceKmRef.current = 0;
        const pos = tlm.finishSummary?.position ?? tlm.racePosition;
        const driftEarned = Math.round(tlm.finishSummary?.driftPoints ?? tlm.driftPoints ?? 0);
        const tofuFailed = Boolean(tlm.finishSummary?.tofuFailed ?? tlm.tofuFailed);
        const tofuIntegrity = Math.round(
          tlm.finishSummary?.tofuIntegrityPct ?? tlm.tofuIntegrityPct ?? 0,
        );
        const tofuGrade = tlm.finishSummary?.tofuGrade ?? tlm.tofuGrade ?? undefined;

        const reward = calculateRaceRewardCr({
          mode: raceConfigRef.current.mode,
          position: pos,
          totalRacers: tlm.finishSummary?.leaderboard.length ?? Math.max(1, tlm.totalRacers),
          lapCount: tlm.finishSummary?.lapCount ?? tlm.lap,
          driftPoints: driftEarned,
          distanceKm: sessionDistKm,
          difficulty: raceConfigRef.current.difficulty,
          tofuGrade: tofuGrade ?? undefined,
          tofuIntegrityPct: tofuIntegrity,
          tofuFailed,
          tofuChapterRewardCr: raceConfigRef.current.tofuChapterRewardCr,
        });
        setLastRaceReward(reward);
        setCreditsCr((prev) => prev + reward.totalCr);

        if (
          raceConfigRef.current.mode === 'tofu_delivery' &&
          !tofuFailed &&
          raceConfigRef.current.tofuChapterId &&
          tofuGrade
        ) {
          const chapId = raceConfigRef.current.tofuChapterId;
          const finishMs = tlm.finishSummary?.totalTimeMs ?? tlm.lapTimeMs;
          setTofuStoryProgress((prev) => {
            const next = mergeTofuStoryProgress(
              {
                [chapId]: {
                  grade: tofuGrade,
                  bestTimeMs: finishMs,
                  bestIntegrityPct: tofuIntegrity,
                },
              },
              prev,
            );
            try {
              window.localStorage.setItem(TOFU_PROGRESS_STORAGE_KEY, JSON.stringify(next));
            } catch {
              // Ignore storage quota errors
            }
            return next;
          });
        }

        setUserStats((prev) => ({
          racesCompleted: prev.racesCompleted + 1,
          racesWon: prev.racesWon + (pos === 1 ? 1 : 0),
          totalDistanceKm: Number((prev.totalDistanceKm + sessionDistKm).toFixed(2)),
          totalDriftScore: prev.totalDriftScore + driftEarned,
        }));

        if (activePartyRef.current) {
          multiplayerClient.reportLapOrFinish({
            bestLapMs: tlm.bestLapMs,
            driftScore: driftEarned,
            finished: true,
            finishTimeMs: tlm.finishSummary?.totalTimeMs ?? tlm.lapTimeMs,
          });
        }

        if (authUserRef.current) {
          const customBp = activeCustomBlueprintRef.current;
          const mapIdForLb = customBp ? `custom:${customBp.id}` : activeMapIdRef.current;
          const mapNameForLb = customBp
            ? customBp.title
            : MAP_REGISTRY[activeMapIdRef.current]?.name ?? activeMapIdRef.current;
          const modeForLb: 'time_trial' | 'drift' =
            tlm.gameMode === 'drift' ? 'drift' : 'time_trial';
          if (
            (modeForLb === 'drift' && driftEarned > 0) ||
            (tlm.bestLapMs !== null && tlm.bestLapMs > 10000)
          ) {
            void submitLeaderboardRecord({
              mapId: mapIdForLb,
              mapName: mapNameForLb,
              carId: selectedCarIdRef.current,
              mode: modeForLb,
              bestLapMs: tlm.bestLapMs,
              driftScore: driftEarned,
              weatherPreset: weatherPresetRef.current as WeatherPresetId,
              tireCompound: tlm.tireCompoundShort,
              ppRating: legalityEvalPpRef.current,
            }).catch(() => {});
          }
        }
      },
      onReplayStateSync: (state) => {
        setReplayState(state);
      },
      onReplayAvailable: (available) => {
        setHasLastReplay(available);
      },
      onDriverAnalyticsCommit: (acc) => {
        setDriverAnalytics((prev) => {
          const next = recordSessionIntoAnalytics(prev, acc);
          saveDriverAnalyticsToStorage(next);
          return next;
        });
      },
      onEngineerCaption: (cap) => {
        setEngineerCaption(cap);
      },
      onPauseRequest: () => {
        setSettingsInitialTab('cameras');
        setSettingsOpen((prev) => {
          const next = !prev;
          controllerRef.current?.setPaused(next);
          return next;
        });
      },
      onPerformanceUpdate: (snap) => {
        const nowTs = performance.now();
        if (
          settingsOpenRef.current ||
          appModeRef.current !== 'racing' ||
          nowTs - lastPerfUiSyncRef.current >= 950
        ) {
          lastPerfUiSyncRef.current = nowTs;
          perfSubscribersRef.current.forEach((listener) => listener(snap));
          // Only update root App state when Settings Profiler tab is open, avoiding 1Hz full-tree re-renders mid-race
          if (settingsOpenRef.current) {
            setPerfSnapshot(snap);
          }
        }
      },
      onQualityAutoAdjust: (quality) => {
        setGraphicsQuality(quality);
        setShadowQuality(getDefaultShadowQualityForPreset(quality));
        setTextureSize(getDefaultTextureSizeForPreset(quality));
        setRenderScale(getDefaultRenderScaleForPreset(quality));
      },
      onWeatherTelemetry: (wState) => {
        setLiveWeatherState(wState);
        setCinematicSettings((prev) =>
          !prev.dynamicWeatherEnabled && prev.weatherAutoEnabled !== wState.autoEnabled
            ? { ...prev, weatherAutoEnabled: wState.autoEnabled }
            : prev,
        );
      },
      onCockpitDialsSync: (dials) => {
        setCockpitDials(dials);
      },
      onPitStrategySync: (strategy) => {
        setPitStrategy(strategy);
      },
      onHeadlightsSync: (on) => {
        setHeadlightsOn(on);
      },
      onPhotoStateSync: (nextPhoto) => {
        setPhotoState(nextPhoto);
      },
      onStudioPropSelected: (propId) => {
        setSelectedBuilderPropId(propId);
        controllerRef.current?.syncSelectedBuilderProp(propId);
      },
      onStudioPropTransformLive: (propId, patch) => {
        const cur = builderDraftBlueprintRef.current;
        const nextProps = cur.placedProps.map((p) =>
          p.id === propId
            ? {
                ...p,
                x: patch.x,
                y: patch.y,
                z: patch.z,
                rotX: patch.rotX,
                rotY: patch.rotY,
                rotZ: patch.rotZ,
                scaleX: patch.scaleX,
                scaleY: patch.scaleY,
                scaleZ: patch.scaleZ,
                scale: Number(((patch.scaleX + patch.scaleY + patch.scaleZ) / 3).toFixed(2)),
              }
            : p,
        );
        const nextBp: CustomMapBlueprint = { ...cur, placedProps: nextProps, updatedAt: Date.now() };
        builderDraftBlueprintRef.current = nextBp;
        setBuilderDraftBlueprint(nextBp);
        setActiveCustomBlueprint(nextBp);
      },
      onStudioPropTransformCommit: (propId, patch) => {
        const prevBp = builderDraftBlueprintRef.current;
        setStudioUndoStack((prev) => [...prev.slice(-39), prevBp]);
        setStudioRedoStack([]);
        const nextProps = prevBp.placedProps.map((p) =>
          p.id === propId
            ? {
                ...p,
                x: patch.x,
                y: patch.y,
                z: patch.z,
                rotX: patch.rotX,
                rotY: patch.rotY,
                rotZ: patch.rotZ,
                scaleX: patch.scaleX,
                scaleY: patch.scaleY,
                scaleZ: patch.scaleZ,
                scale: Number(((patch.scaleX + patch.scaleY + patch.scaleZ) / 3).toFixed(2)),
              }
            : p,
        );
        const nextBp: CustomMapBlueprint = { ...prevBp, placedProps: nextProps, updatedAt: Date.now() };
        builderDraftBlueprintRef.current = nextBp;
        setBuilderDraftBlueprint(nextBp);
        setActiveCustomBlueprint(nextBp);
        controllerRef.current?.loadCustomBlueprint(nextBp, false, propId);
      },
      onStudioPlacePropAt: (x, y, z) => {
        const prevBp = builderDraftBlueprintRef.current;
        setStudioUndoStack((prev) => [...prev.slice(-39), prevBp]);
        setStudioRedoStack([]);
        let spawnX = x;
        let spawnY = y;
        let spawnZ = z;
        let rotY = 0;
        if (autoAlignTrackRef.current) {
          const roadSnap = controllerRef.current?.snapPointToRoad(x, z);
          if (roadSnap) {
            rotY = roadSnap.rotY;
            if (Math.hypot(x - roadSnap.x, z - roadSnap.z) <= 28) {
              spawnY = roadSnap.y;
            }
          } else if (prevBp.controlPoints.length >= 2) {
            let bestDist = Infinity;
            for (let i = 0; i < prevBp.controlPoints.length; i++) {
              const a = prevBp.controlPoints[i];
              const b = prevBp.controlPoints[(i + 1) % prevBp.controlPoints.length];
              const mx = (a.x + b.x) * 0.5;
              const mz = (a.z + b.z) * 0.5;
              const d = Math.hypot(x - mx, z - mz);
              if (d < bestDist) {
                bestDist = d;
                rotY = Math.atan2(b.x - a.x, b.z - a.z);
              }
            }
          }
        }
        const propType = activePropTypeRef.current;
        const prop: BuilderPropInstance = {
          id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: propType,
          x: spawnX,
          y: spawnY,
          z: spawnZ,
          rotY: Number(rotY.toFixed(3)),
          scale: 1,
          canCollide: true,
          castShadow: true,
        };
        const nextBp: CustomMapBlueprint = {
          ...prevBp,
          placedProps: [...prevBp.placedProps, prop],
          updatedAt: Date.now(),
        };
        builderDraftBlueprintRef.current = nextBp;
        setBuilderDraftBlueprint(nextBp);
        setActiveCustomBlueprint(nextBp);
        setSelectedBuilderPropId(prop.id);
        controllerRef.current?.loadCustomBlueprint(nextBp, false, prop.id);
        setStudioStatusMessage(`Placed ${propType.replace('_', ' ')} at (${Math.round(spawnX)}, ${Math.round(spawnZ)})`);
      },
      onStudioControlPointSelected: (ptIndex) => {
        const cur = builderDraftBlueprintRef.current;
        studioNodeDragStartBpRef.current = {
          ...cur,
          controlPoints: cur.controlPoints.map((pt) => ({ ...pt })),
        };
        setSelectedStudioNodeIdx(ptIndex);
        setSelectedBuilderPropId(null);
        controllerRef.current?.syncSelectedBuilderProp(null);
        setStudioStatusMessage(`Node #${ptIndex + 1} selected · Drag to move · Shift+Drag for Elevation Y`);
      },
      onStudioControlPointMoved: (ptIndex, pos, commit) => {
        const cur = builderDraftBlueprintRef.current;
        const nextPts = cur.controlPoints.map((pt, i) =>
          i === ptIndex ? { ...pt, x: pos.x, y: pos.y, z: pos.z } : pt,
        );
        const nextBp: CustomMapBlueprint = {
          ...cur,
          controlPoints: nextPts,
          updatedAt: Date.now(),
        };
        builderDraftBlueprintRef.current = nextBp;
        setBuilderDraftBlueprint(nextBp);
        setActiveCustomBlueprint(nextBp);
        if (commit) {
          const snapshotBefore = studioNodeDragStartBpRef.current ?? cur;
          studioNodeDragStartBpRef.current = null;
          setStudioUndoStack((prev) => [...prev.slice(-39), snapshotBefore]);
          setStudioRedoStack([]);
          const updated = controllerRef.current?.loadCustomBlueprint(
            nextBp,
            true,
            selectedBuilderPropIdRef.current,
          );
          if (updated) {
            setMetrics(updated);
            setMapRevision((rev) => rev + 1);
          }
          setStudioStatusMessage(`Node #${ptIndex + 1} moved to (${Math.round(pos.x)}, ${pos.y}m, ${Math.round(pos.z)})`);
        }
      },
      onStudioTerrainBrushHit: (x, y, z, isDragStroke) => {
        const cur = builderDraftBlueprintRef.current;
        if (!isDragStroke) {
          studioBrushStartBpRef.current = cur;
        }
        const cfg = terrainToolConfigRef.current;
        if (cfg.mode === 'material') {
          const stamp: TerrainMaterialStamp = {
            id: `mat_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            x,
            z,
            radius: cfg.radius,
            material: cfg.materialId,
            colorHex: cfg.colorHex || undefined,
            strength: Math.min(1, Math.max(0.25, cfg.strength / 10)),
          };
          const nextBp: CustomMapBlueprint = {
            ...cur,
            terrainMaterialStamps: [...(cur.terrainMaterialStamps ?? []), stamp],
            updatedAt: Date.now(),
          };
          builderDraftBlueprintRef.current = nextBp;
          setBuilderDraftBlueprint(nextBp);
          setActiveCustomBlueprint(nextBp);
          controllerRef.current?.updateCustomTerrainMaterialPreview(nextBp);
          setStudioStatusMessage(`Painted ${cfg.materialId.replace('_', ' ')} at (${Math.round(x)}, ${Math.round(z)})`);
        } else {
          const stamp: TerrainSculptStamp = {
            id: `sc_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            x,
            z,
            radius: cfg.radius,
            deltaY: cfg.sculptOp === 'lower' ? -cfg.strength : cfg.strength,
            mode: cfg.sculptOp,
            targetY: y,
          };
          const nextBp: CustomMapBlueprint = {
            ...cur,
            terrainStamps: [...cur.terrainStamps, stamp],
            updatedAt: Date.now(),
          };
          builderDraftBlueprintRef.current = nextBp;
          setBuilderDraftBlueprint(nextBp);
          setActiveCustomBlueprint(nextBp);
          controllerRef.current?.updateCustomTerrainGeometryFast(nextBp);
          setStudioStatusMessage(`Sculpt ${cfg.sculptOp} at (${Math.round(x)}, ${Math.round(z)})`);
        }
      },
      onStudioTerrainBrushEnd: () => {
        const startBp = studioBrushStartBpRef.current;
        studioBrushStartBpRef.current = null;
        if (startBp) {
          setStudioUndoStack((prev) => [...prev.slice(-39), startBp]);
          setStudioRedoStack([]);
        }
      },
      onError: (msg) => setWebglError(msg),
    });
    controllerRef.current = api;
    api.setRaceConfig(raceConfigRef.current);
    api.setAssists(assistsRef.current);
    api.setCarSetup(carSetupRef.current);
    api.setVisualCustomization(visualConfigRef.current);
    api.setCinematicSettings(cinematicSettingsRef.current);
    api.setAudioConfig(audioVolumeRef.current, audioMutedRef.current);
    api.setSurfaceAudioEnabled(surfaceAudioEnabledRef.current);
    api.setTougeDirection(tougeDirectionRef.current);
    api.setGhostMode(ghostModeRef.current);
    setCctvStations(api.getCctvStations());
    setPerfSnapshot(api.getPerformanceSnapshot());

    return () => {
      api.dispose();
      controllerRef.current = null;
    };
  }, []);

  const handleCaptureScreenshot = useCallback(() => {
    const dataUrl = controllerRef.current?.captureCleanScreenshot();
    if (!dataUrl) return;
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `${activeMapId}-gt-${stamp}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [activeMapId]);

  const handleEnterPhotoMode = useCallback(() => {
    const mode = appModeRef.current;
    if (mode !== 'garage' && mode !== 'racing') return;
    setIsCctv(false);
    setIsFlyover(false);
    setActivePreset(null);
    setHudMenuOpen(false);
    setIsHudHidden(false);
    setPhotoPreviewId(null);
    const next = controllerRef.current?.setPhotoMode(true);
    if (next) setPhotoState(next);
  }, []);

  const handleExitPhotoMode = useCallback(() => {
    setPhotoPreviewId(null);
    setIsHudHidden(false);
    const next = controllerRef.current?.setPhotoMode(false);
    if (next) setPhotoState(next);
  }, []);

  const handleTakePhoto = useCallback(() => {
    const dataUrl = controllerRef.current?.captureCleanScreenshot();
    if (!dataUrl) return;
    const curCarSlot = GARAGE_CARS[carIndexRef.current] ?? GARAGE_CARS[0];
    const curState = photoStateRef.current;
    const locationName =
      appModeRef.current === 'garage'
        ? 'Hangar Showroom'
        : activeCustomBlueprintRef.current?.title ??
          MAP_REGISTRY[activeMapIdRef.current]?.name ??
          activeMapIdRef.current;
    const newPhoto: CapturedPhoto = {
      id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      dataUrl,
      timestamp: Date.now(),
      carName: curCarSlot?.name ?? selectedCarIdRef.current,
      locationName,
      viewLabel: getPhotoViewLabel(curState.viewMode),
      fovDeg: Math.round(curState.fovDeg),
    };
    setPhotoFlashCounter((c) => c + 1);
    setCapturedPhotos((prev) => [newPhoto, ...prev].slice(0, 24));
    if (autoPreviewPhotoRef.current) {
      setPhotoPreviewId(newPhoto.id);
    }
  }, []);

  const handleDownloadCapturedPhoto = useCallback((photo: CapturedPhoto) => {
    const link = document.createElement('a');
    const stamp = new Date(photo.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const safeCar = photo.carName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    link.download = `vyrox-${safeCar || 'photo'}-${stamp}.png`;
    link.href = photo.dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleDeleteCapturedPhoto = useCallback((photoId: string) => {
    setCapturedPhotos((prev) => {
      const idx = prev.findIndex((p) => p.id === photoId);
      const next = prev.filter((p) => p.id !== photoId);
      setPhotoPreviewId((curId) => {
        if (curId !== photoId) return curId;
        if (next.length === 0) return null;
        return next[Math.min(idx, next.length - 1)]?.id ?? null;
      });
      return next;
    });
  }, []);

  const handleExitReplay = useCallback(() => {
    const returnTo: AppScreenMode =
      replayReturnModeRef.current === 'podium' && telemetry.finishSummary ? 'podium' : 'garage';
    controllerRef.current?.exitReplay(returnTo);
    setReplayState(null);
    setIsHudHidden(false);
    setAppMode(returnTo);
  }, [telemetry.finishSummary]);

  // Global P/H/M/Enter/Escape & Replay keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const modalBlocking =
        authModalOpen ||
        socialHubOpen ||
        profileViewerOpen ||
        carSelectOpen ||
        trackSelectOpen ||
        engLabOpen ||
        tuningOpen ||
        settingsOpen ||
        Boolean(pendingRaceLaunch);

      if (appMode === 'replay' && !modalBlocking) {
        if (e.key === ' ' && !e.repeat) {
          e.preventDefault();
          const playing = Boolean(replayStateRef.current?.playing);
          controllerRef.current?.setReplayPlaying(!playing);
          return;
        }
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          const cur = replayStateRef.current?.currentTimeMs ?? 0;
          controllerRef.current?.seekReplayMs(Math.max(0, cur - 5000));
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          const cur = replayStateRef.current?.currentTimeMs ?? 0;
          const dur = replayStateRef.current?.durationMs ?? 0;
          controllerRef.current?.seekReplayMs(Math.min(dur, cur + 5000));
          return;
        }
        if ((e.key === 'c' || e.key === 'C') && !e.repeat) {
          e.preventDefault();
          const curCam = replayStateRef.current?.cameraMode ?? 'cinematic_chase';
          const idx = REPLAY_CAMERA_OPTIONS.findIndex((c) => c.id === curCam);
          const nextCam = REPLAY_CAMERA_OPTIONS[(idx + 1) % REPLAY_CAMERA_OPTIONS.length].id;
          controllerRef.current?.setReplayCameraMode(nextCam);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          handleExitReplay();
          return;
        }
      }

      if (e.key === 'h' || e.key === 'H') {
        if (photoPreviewIdRef.current) return;
        if (appMode !== 'garage' || isCctv || isFlyover || activePreset !== null || photoState.active) {
          setIsHudHidden((prev) => !prev);
        }
      } else if ((e.key === 'p' || e.key === 'P') && !e.repeat) {
        if (modalBlocking || photoPreviewIdRef.current) return;
        if (appMode === 'garage' || appMode === 'racing') {
          e.preventDefault();
          if (photoState.active) {
            handleExitPhotoMode();
          } else {
            handleEnterPhotoMode();
          }
        }
      } else if (
        (e.key === 'Enter' || e.key === ' ') &&
        !e.repeat &&
        photoState.active &&
        !photoPreviewIdRef.current &&
        !modalBlocking &&
        (appMode === 'garage' || photoState.carFrozen)
      ) {
        e.preventDefault();
        handleTakePhoto();
      } else if ((e.key === 'm' || e.key === 'M') && appMode === 'racing' && !photoState.active) {
        setMinimapMode((prev) => (prev === 'overview' ? 'ahead' : 'overview'));
      } else if (e.key === 'Escape') {
        if (profileViewerOpen) {
          setProfileViewerOpen(false);
        } else if (authModalOpen) {
          if (authUser) setAuthModalOpen(false);
        } else if (socialHubOpen) {
          setSocialHubOpen(false);
        } else if (carSelectOpen) {
          setCarSelectOpen(false);
        } else if (tuningOpen) {
          setTuningOpen(false);
          if (appMode === 'racing' && !settingsOpen) {
            controllerRef.current?.setPaused(false);
          }
        } else if (pendingRaceLaunch) {
          setPendingRaceLaunch(null);
        } else if (photoPreviewIdRef.current) {
          setPhotoPreviewId(null);
        } else if (photoState.active) {
          handleExitPhotoMode();
        } else if (appMode !== 'racing') {
          if (trackSelectOpen) setTrackSelectOpen(false);
          else if (engLabOpen) setEngLabOpen(false);
          else if (settingsOpen) setSettingsOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    appMode,
    settingsOpen,
    trackSelectOpen,
    carSelectOpen,
    engLabOpen,
    tuningOpen,
    authModalOpen,
    authUser,
    socialHubOpen,
    profileViewerOpen,
    pendingRaceLaunch,
    isCctv,
    isFlyover,
    activePreset,
    photoState.active,
    photoState.carFrozen,
    handleEnterPhotoMode,
    handleExitPhotoMode,
    handleExitReplay,
    handleTakePhoto,
  ]);

  const applyActiveMapImmediate = useCallback(
    (nextMapId: MapId) => {
      const updated = controllerRef.current?.setActiveMap(nextMapId);
      if (updated) {
        setMetrics(updated);
      }
      setMapConfig(getCircuitCustomization(nextMapId));
      setCustomMapCameraMode('overview');
      setSelectedWaypoint(getEditableWaypointsForActiveMap()[0]?.index ?? 0);
      setMapRevision((r) => r + 1);
      const stations = controllerRef.current?.getCctvStations();
      if (stations) setCctvStations(stations);
      setTelemetry((t) => ({
        ...t,
        bestLapMs: readBestLapMsForMapCar(nextMapId, selectedCarId),
      }));
    },
    [selectedCarId],
  );

  const handleSelectActiveMap = useCallback(
    (nextMapId: MapId) => {
      const needsSwap = nextMapId !== activeMapId || Boolean(activeCustomBlueprint);
      const isGarageIdle = appMode === 'garage' && !isCctv && !isFlyover && activePreset === null;
      if (!needsSwap || isGarageIdle) {
        setActiveCustomBlueprint(null);
        setActiveMapIdState(nextMapId);
        applyActiveMapImmediate(nextMapId);
        return;
      }
      const mapTitle = MAP_REGISTRY[nextMapId]?.name ?? nextMapId;
      runWithLoadingScreen(
        `Loading ${mapTitle}`,
        'Building track geometry, surface shaders, and lighting rig...',
        () => {
          setActiveCustomBlueprint(null);
          setActiveMapIdState(nextMapId);
          applyActiveMapImmediate(nextMapId);
        },
      );
    },
    [activeCustomBlueprint, activeMapId, activePreset, appMode, applyActiveMapImmediate, isCctv, isFlyover, runWithLoadingScreen],
  );

  const liveEffectiveSpecs = useMemo(
    () => computeEffectiveSpecs(VEHICLE_SPECS[selectedCarId], carSetup, visualConfig),
    [selectedCarId, carSetup, visualConfig],
  );

  const legalityEval = useMemo(
    () =>
      evaluateCarLegality({
        carId: selectedCarId,
        setup: carSetup,
        visual: visualConfig,
        ruleId: legalityRuleId,
        enforcementMode: legalityEnforcement,
      }),
    [selectedCarId, carSetup, visualConfig, legalityRuleId, legalityEnforcement],
  );
  legalityEvalPpRef.current = legalityEval.ppReport.pp;

  const legalityBlockedReason = null;
  const legalityWarning =
    legalityEval.warnings.length > 0 ? legalityEval.warnings[0] : null;

  const handleSelectCarById = useCallback(
    (nextId: CarModelId) => {
      const idx = GARAGE_CARS.findIndex((c) => c.carModelId === nextId);
      if (idx < 0) return;
      const slot = GARAGE_CARS[idx];
      hasUserSelectedCarRef.current = true;
      carIndexRef.current = idx;
      setCarIndex(idx);
      controllerRef.current?.setGarageCarAvailable(slot.available);
      if (slot.available && slot.carModelId) {
        selectedCarIdRef.current = nextId;
        setSelectedCarId(nextId);
        controllerRef.current?.setSelectedCar(nextId);
        controllerRef.current?.setCarSetup(carSetupByCar[nextId]);
        controllerRef.current?.setVisualCustomization(visualConfigByCar[nextId]);
        controllerRef.current?.setGarageAeroPreview(garageAeroPreview);
        setTelemetry((t) => ({
          ...t,
          carId: nextId,
          carName: slot.name,
          bestLapMs: readBestLapMsForMapCar(activeMapId, nextId),
        }));
      }
    },
    [activeMapId, carSetupByCar, visualConfigByCar, garageAeroPreview],
  );

  const handleCycleCar = useCallback(
    (delta: number) => {
      const len = GARAGE_CARS.length;
      const next = ((carIndexRef.current + delta) % len + len) % len;
      const slot = GARAGE_CARS[next];
      if (slot?.carModelId) {
        handleSelectCarById(slot.carModelId);
      }
    },
    [handleSelectCarById],
  );

  useEffect(() => {
    const onGarageArrowKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (
        appMode !== 'garage' ||
        !authUser ||
        isCctv ||
        isFlyover ||
        activePreset !== null ||
        photoState.active ||
        photoPreviewId !== null ||
        carSelectOpen ||
        trackSelectOpen ||
        raceSetupModalOpen ||
        tuningOpen ||
        engLabOpen ||
        settingsOpen ||
        socialHubOpen ||
        authModalOpen ||
        garageTab !== 'showroom'
      ) {
        return;
      }
      e.preventDefault();
      handleCycleCar(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onGarageArrowKey);
    return () => window.removeEventListener('keydown', onGarageArrowKey);
  }, [
    appMode,
    authUser,
    isCctv,
    isFlyover,
    activePreset,
    photoState.active,
    photoPreviewId,
    carSelectOpen,
    trackSelectOpen,
    raceSetupModalOpen,
    tuningOpen,
    engLabOpen,
    settingsOpen,
    socialHubOpen,
    authModalOpen,
    garageTab,
    handleCycleCar,
  ]);

  const handleRaceConfigChange = useCallback((config: RaceConfig) => {
    setRaceConfig(config);
    syncUrlLapsParam(config.lapCount);
    controllerRef.current?.setRaceConfig(config);
  }, []);

  const handleGarageCamPresetChange = useCallback((preset: GarageCameraPreset) => {
    setGarageCamPreset(preset);
    controllerRef.current?.setGarageCameraPreset(preset);
  }, []);

  const launchRaceOnCurrentMap = useCallback(() => {
    const selected = GARAGE_CARS[carIndex];
    if (!selected?.available || !carReady) return;
    const mapTitle = activeCustomBlueprint?.title ?? MAP_REGISTRY[activeMapId]?.name ?? 'Circuit';
    runWithLoadingScreen(
      `Starting Session · ${mapTitle}`,
      `Preparing ${selected.name} and race grid telemetry...`,
      () => {
        setTrackSelectOpen(false);
        setCarSelectOpen(false);
        setTuningOpen(false);
        setEngLabOpen(false);
        setSettingsOpen(false);
        setIsHudHidden(false);
        setIsCctv(false);
        setIsFlyover(false);
        setActivePreset(null);
        setPodiumCameraAngle('auto');
        setEngineerCaption(null);
        setLastRaceReward(null);
        rubberHistoryRef.current = [];
        setRubberHistory([]);
        setAppMode('racing');
        controllerRef.current?.startNewRace(raceConfig);
        const stations = controllerRef.current?.getCctvStations();
        if (stations && stations.length > 0) setCctvStations(stations);
      },
    );
  }, [
    activeCustomBlueprint,
    activeMapId,
    carIndex,
    carReady,
    raceConfig,
    runWithLoadingScreen,
  ]);

  const handleStartRaceFromGarage = useCallback(() => {
    const selected = GARAGE_CARS[carIndex];
    if (!selected?.available || !carReady) return;
    setTuningOpen(false);
    setEngLabOpen(false);
    setTrackSelectOpen(true);
  }, [carIndex, carReady]);

  const handleSelectTrackForRaceSetup = useCallback(
    (mapId: MapId) => {
      const selected = GARAGE_CARS[carIndex];
      if (!selected?.available || !carReady) return;
      if (mapId !== activeMapId || activeCustomBlueprint) {
        setActiveCustomBlueprint(null);
        setActiveMapIdState(mapId);
        applyActiveMapImmediate(mapId);
      }
      if (
        isTougeMapId(mapId) &&
        (raceConfigRef.current.mode === 'sprint' || raceConfigRef.current.mode === 'endurance')
      ) {
        const nextCfg: RaceConfig = {
          ...raceConfigRef.current,
          mode: 'time_trial',
          lapCount: 0,
        };
        setRaceConfig(nextCfg);
        controllerRef.current?.setRaceConfig(nextCfg);
      }
      setTrackSelectOpen(false);
      setPendingRaceLaunch({ kind: 'official_track', mapId });
    },
    [activeCustomBlueprint, activeMapId, applyActiveMapImmediate, carIndex, carReady],
  );

  const handleOpenCustomizerRaceSetup = useCallback(() => {
    const selected = GARAGE_CARS[carIndex];
    if (!selected?.available || !carReady) return;
    setPendingRaceLaunch({ kind: 'current_customized' });
  }, [carIndex, carReady]);

  const handleConfirmTrackAndLaunch = useCallback(
    (mapId: MapId) => {
      const selected = GARAGE_CARS[carIndex];
      if (!selected?.available || !carReady) return;
      const mapTitle = MAP_REGISTRY[mapId]?.name ?? mapId;
      const hadCustom = Boolean(activeCustomBlueprint);
      setTrackSelectOpen(false);
      setPendingRaceLaunch(null);
      runWithLoadingScreen(
        `Launching ${mapTitle}`,
        `Staging ${selected.name} on the starting grid...`,
        () => {
          if (hadCustom) {
            setActiveCustomBlueprint(null);
          }
          setCarSelectOpen(false);
          setTuningOpen(false);
          setEngLabOpen(false);
          setSettingsOpen(false);
          setIsHudHidden(false);
          setIsCctv(false);
          setIsFlyover(false);
          setActivePreset(null);
          setPodiumCameraAngle('auto');
          setEngineerCaption(null);
          setLastRaceReward(null);
          rubberHistoryRef.current = [];
          setRubberHistory([]);
          if (mapId !== activeMapId) {
            setActiveMapIdState(mapId);
          }
          if (mapId !== activeMapId || hadCustom) {
            applyActiveMapImmediate(mapId);
          }
          setAppMode('racing');
          controllerRef.current?.startNewRace(raceConfig);
          const stations = controllerRef.current?.getCctvStations();
          if (stations && stations.length > 0) setCctvStations(stations);
        },
      );
    },
    [
      activeCustomBlueprint,
      activeMapId,
      applyActiveMapImmediate,
      carIndex,
      carReady,
      legalityEval.canLaunch,
      raceConfig,
      runWithLoadingScreen,
    ],
  );

  const handleOpenCustomMap = useCallback(() => {
    const hadCustom = Boolean(activeCustomBlueprint);
    runWithLoadingScreen(
      'Opening Track Customizer',
      'Loading circuit geometry and layout waypoints...',
      () => {
        setActiveCustomBlueprint(null);
        setBuilderStudioOpen(false);
        setStudioModalFrozen(false);
        setTrackSelectOpen(false);
        setCarSelectOpen(false);
        setTuningOpen(false);
        setEngLabOpen(false);
        setSettingsOpen(false);
        setIsHudHidden(false);
        setIsCctv(false);
        setIsFlyover(false);
        setActivePreset(null);
        setCustomMapCameraMode('overview');
        if (hadCustom) {
          applyActiveMapImmediate(activeMapIdRef.current);
        }
        setAppMode('custom_map');
        controllerRef.current?.setAppMode('custom_map');
      },
    );
  }, [activeCustomBlueprint, applyActiveMapImmediate, runWithLoadingScreen]);

  const upsertDraftSlot = useCallback((bp: CustomMapBlueprint) => {
    setDraftMaps((prev) => {
      const idx = prev.findIndex((m) => m.id === bp.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = bp;
        return next;
      }
      return [bp, ...prev].slice(0, 24);
    });
  }, []);

  const mergeCloudDraftMaps = useCallback((maps: CustomMapBlueprint[]) => {
    if (!Array.isArray(maps) || maps.length === 0) return;
    setDraftMaps((prev) => {
      const byId = new Map<string, CustomMapBlueprint>();
      for (const m of prev) {
        if (m && m.id) byId.set(m.id, m);
      }
      for (const m of maps) {
        if (!m || !m.id) continue;
        const existing = byId.get(m.id);
        if (!existing || (m.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
          byId.set(m.id, m);
        }
      }
      return Array.from(byId.values())
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, 24);
    });
    setSavedDraftTimestamps((prev) => {
      const next = { ...prev };
      for (const m of maps) {
        if (m && m.id) next[m.id] = Math.max(next[m.id] ?? 0, m.updatedAt ?? 0);
      }
      return next;
    });
  }, []);

  const applyBlueprintInStudioViewport = useCallback(
    (nextBp: CustomMapBlueprint, statusMsg?: string) => {
      builderDraftBlueprintRef.current = nextBp;
      setBuilderDraftBlueprint(nextBp);
      setActiveCustomBlueprint(nextBp);
      setSelectedBuilderPropId(null);
      setStudioUndoStack([]);
      setStudioRedoStack([]);
      if (statusMsg !== undefined) {
        setStudioStatusMessage(statusMsg);
      }
      const updatedMetrics = controllerRef.current?.loadCustomBlueprint(nextBp, true, null);
      if (updatedMetrics) {
        setMetrics(updatedMetrics);
        setMapRevision((r) => r + 1);
      }
      if (nextBp.defaultWeather !== weatherPresetRef.current) {
        setWeatherPreset(nextBp.defaultWeather);
        controllerRef.current?.setWeatherPreset(nextBp.defaultWeather);
      }
      if (nextBp.defaultHaze !== hazePreset) {
        setHazePreset(nextBp.defaultHaze);
        controllerRef.current?.setHazePreset(nextBp.defaultHaze);
      }
      if (Math.abs(nextBp.defaultSolarDeg - solarAngle) > 1) {
        setSolarAngle(nextBp.defaultSolarDeg);
        const label = controllerRef.current?.setSolarAngle(nextBp.defaultSolarDeg);
        if (label) setPhaseLabel(label);
      }
    },
    [hazePreset, solarAngle],
  );

  const handleOpenMapBuilder = useCallback(
    (initialBlueprint?: CustomMapBlueprint) => {
      const nextBp =
        initialBlueprint ??
        draftMaps[0] ??
        createBlueprintFromTemplate(
          'blank_loop',
          authUser?.id ?? 'local',
          authUser?.username ?? 'Driver',
        );
      runWithLoadingScreen(
        'Opening Map Builder Studio',
        `Compiling terrain and track blueprint for ${nextBp.title}...`,
        () => {
          upsertDraftSlot(nextBp);
          if (initialBlueprint && draftMaps.some((m) => m.id === initialBlueprint.id)) {
            setSavedDraftTimestamps((prev) => ({
              ...prev,
              [initialBlueprint.id]: prev[initialBlueprint.id] ?? initialBlueprint.updatedAt,
            }));
          }
          setStudioToolMode('select');
          applyBlueprintInStudioViewport(nextBp, '');
          setBuilderStudioOpen(true);
          setSocialHubOpen(false);
          setTrackSelectOpen(false);
          setCarSelectOpen(false);
          setTuningOpen(false);
          setEngLabOpen(false);
          setSettingsOpen(false);
          setIsHudHidden(false);
          setIsCctv(false);
          setIsFlyover(false);
          setActivePreset(null);
          setCustomMapCameraMode('overview');
          controllerRef.current?.setStudioToolMode('select');
          setAppMode('custom_map');
          controllerRef.current?.setAppMode('custom_map');
        },
      );
    },
    [applyBlueprintInStudioViewport, authUser, draftMaps, runWithLoadingScreen, upsertDraftSlot],
  );

  const handleChangeBuilderBlueprint = useCallback(
    (
      nextBp: CustomMapBlueprint,
      rebuildMode: StudioRebuildMode = 'none',
      selectedPropId?: string | null,
      recordUndo = false,
    ) => {
      if (recordUndo) {
        const prevSnapshot = builderDraftBlueprintRef.current;
        setStudioUndoStack((prev) => [...prev.slice(-39), prevSnapshot]);
        setStudioRedoStack([]);
      }
      builderDraftBlueprintRef.current = nextBp;
      setBuilderDraftBlueprint(nextBp);
      setActiveCustomBlueprint(nextBp);
      upsertDraftSlot(nextBp);
      if (selectedPropId !== undefined) {
        setSelectedBuilderPropId(selectedPropId);
      }
      const targetProp = selectedPropId !== undefined ? selectedPropId : selectedBuilderPropIdRef.current;
      if (rebuildMode === 'full') {
        const updatedMetrics = controllerRef.current?.loadCustomBlueprint(
          nextBp,
          true,
          targetProp,
        );
        if (updatedMetrics) {
          setMetrics(updatedMetrics);
          setMapRevision((r) => r + 1);
        }
      } else if (rebuildMode === 'props') {
        controllerRef.current?.loadCustomBlueprint(nextBp, false, targetProp);
      } else if (rebuildMode === 'terrain_look') {
        controllerRef.current?.updateCustomTerrainMaterialPreview(nextBp);
      } else if (rebuildMode === 'terrain_geo') {
        controllerRef.current?.updateCustomTerrainGeometryFast(nextBp);
      }
      if (nextBp.defaultWeather !== weatherPresetRef.current) {
        setWeatherPreset(nextBp.defaultWeather);
        controllerRef.current?.setWeatherPreset(nextBp.defaultWeather);
      }
      if (nextBp.defaultHaze !== hazePreset) {
        setHazePreset(nextBp.defaultHaze);
        controllerRef.current?.setHazePreset(nextBp.defaultHaze);
      }
      if (Math.abs(nextBp.defaultSolarDeg - solarAngle) > 1) {
        setSolarAngle(nextBp.defaultSolarDeg);
        const label = controllerRef.current?.setSolarAngle(nextBp.defaultSolarDeg);
        if (label) setPhaseLabel(label);
      }
    },
    [hazePreset, solarAngle, upsertDraftSlot],
  );

  const handleStudioUndo = useCallback(() => {
    setStudioUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      const current = builderDraftBlueprintRef.current;
      setStudioRedoStack((r) => [...r.slice(-39), current]);
      builderDraftBlueprintRef.current = target;
      setBuilderDraftBlueprint(target);
      setActiveCustomBlueprint(target);
      upsertDraftSlot(target);
      const updated = controllerRef.current?.loadCustomBlueprint(
        target,
        true,
        selectedBuilderPropIdRef.current,
      );
      if (updated) {
        setMetrics(updated);
        setMapRevision((rev) => rev + 1);
      }
      setStudioStatusMessage('Undo applied.');
      return prev.slice(0, -1);
    });
  }, [upsertDraftSlot]);

  const handleStudioRedo = useCallback(() => {
    setStudioRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      const current = builderDraftBlueprintRef.current;
      setStudioUndoStack((u) => [...u.slice(-39), current]);
      builderDraftBlueprintRef.current = target;
      setBuilderDraftBlueprint(target);
      setActiveCustomBlueprint(target);
      upsertDraftSlot(target);
      const updated = controllerRef.current?.loadCustomBlueprint(
        target,
        true,
        selectedBuilderPropIdRef.current,
      );
      if (updated) {
        setMetrics(updated);
        setMapRevision((rev) => rev + 1);
      }
      setStudioStatusMessage('Redo applied.');
      return prev.slice(0, -1);
    });
  }, [upsertDraftSlot]);

  const handleClearCustomBlueprint = useCallback(() => {
    runWithLoadingScreen(
      'Restoring Official Circuit',
      'Rebuilding standard track layout and world scenery...',
      () => {
        setActiveCustomBlueprint(null);
        setBuilderStudioOpen(false);
        const updated = controllerRef.current?.loadCustomBlueprint(null, true);
        if (updated) setMetrics(updated);
        applyActiveMapImmediate(activeMapIdRef.current);
      },
    );
  }, [applyActiveMapImmediate, runWithLoadingScreen]);

  const handleSaveBuilderDraft = useCallback(
    async (bp: CustomMapBlueprint) => {
      const stamped: CustomMapBlueprint = {
        ...bp,
        authorId: authUser?.id ?? bp.authorId,
        authorUsername: authUser?.username ?? bp.authorUsername,
        updatedAt: Date.now(),
      };
      let finalSaved = stamped;
      if (authUser) {
        finalSaved = await saveOrPublishCustomMap(stamped, stamped.isPublished);
      }
      builderDraftBlueprintRef.current = finalSaved;
      setBuilderDraftBlueprint(finalSaved);
      setActiveCustomBlueprint(finalSaved);
      upsertDraftSlot(finalSaved);
      setSavedDraftTimestamps((prev) => ({ ...prev, [finalSaved.id]: finalSaved.updatedAt }));
      if (authUser && buildUserProgressSnapshotRef.current) {
        const snapshot = buildUserProgressSnapshotRef.current();
        const nextDrafts = [
          finalSaved,
          ...snapshot.draftMaps.filter((m) => m.id !== finalSaved.id),
        ].slice(0, 24);
        await saveUserProgressCloud({ ...snapshot, draftMaps: nextDrafts }).catch(() => {});
      }
    },
    [authUser, upsertDraftSlot],
  );

  const handleSwitchBuildSlot = useCallback(
    (slotId: string) => {
      const current = builderDraftBlueprintRef.current;
      upsertDraftSlot(current);
      const target = draftMaps.find((m) => m.id === slotId);
      if (!target) return;
      applyBlueprintInStudioViewport(target, `Loaded slot: ${target.title}`);
    },
    [applyBlueprintInStudioViewport, draftMaps, upsertDraftSlot],
  );

  const handleCreateNewBuildSlot = useCallback(
    (templateId: MapTemplateId, customTitle?: string) => {
      const current = builderDraftBlueprintRef.current;
      upsertDraftSlot(current);
      const created = createBlueprintFromTemplate(
        templateId,
        authUser?.id ?? 'local',
        authUser?.username ?? 'Driver',
      );
      const nextBp: CustomMapBlueprint = customTitle
        ? { ...created, title: customTitle.slice(0, 48) }
        : {
            ...created,
            title: `${created.title} #${draftMaps.length + 1}`,
          };
      upsertDraftSlot(nextBp);
      applyBlueprintInStudioViewport(nextBp, `Created build slot: ${nextBp.title}`);
    },
    [applyBlueprintInStudioViewport, authUser, draftMaps.length, upsertDraftSlot],
  );

  const handleDuplicateBuildSlot = useCallback(
    (slotId: string) => {
      const current = builderDraftBlueprintRef.current;
      upsertDraftSlot(current);
      const source =
        slotId === current.id ? current : draftMaps.find((m) => m.id === slotId);
      if (!source) return;
      const cloned: CustomMapBlueprint = {
        ...JSON.parse(JSON.stringify(source)),
        id: `bp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: `${source.title.slice(0, 41)} Copy`,
        authorId: authUser?.id ?? source.authorId,
        authorUsername: authUser?.username ?? source.authorUsername,
        isPublished: false,
        likesCount: 0,
        playsCount: 0,
        updatedAt: Date.now(),
      };
      upsertDraftSlot(cloned);
      applyBlueprintInStudioViewport(cloned, `Duplicated into slot: ${cloned.title}`);
    },
    [applyBlueprintInStudioViewport, authUser, draftMaps, upsertDraftSlot],
  );

  const handleDeleteBuildSlot = useCallback(
    async (slotId: string) => {
      if (authUser) {
        await deleteCustomMapById(slotId).catch(() => {});
      }
      const remaining = draftMaps.filter((m) => m.id !== slotId);
      let nextSlots = remaining;
      if (nextSlots.length === 0) {
        const fresh = createBlueprintFromTemplate(
          'blank_loop',
          authUser?.id ?? 'local',
          authUser?.username ?? 'Driver',
        );
        nextSlots = [fresh];
      }
      setDraftMaps(nextSlots);
      setSavedDraftTimestamps((prev) => {
        const copy = { ...prev };
        delete copy[slotId];
        return copy;
      });
      if (builderDraftBlueprintRef.current.id === slotId) {
        const fallback = nextSlots[0];
        applyBlueprintInStudioViewport(fallback, `Switched to slot: ${fallback.title}`);
      }
      if (authUser && buildUserProgressSnapshotRef.current) {
        const snapshot = buildUserProgressSnapshotRef.current();
        await saveUserProgressCloud({ ...snapshot, draftMaps: nextSlots }).catch(() => {});
      }
    },
    [applyBlueprintInStudioViewport, authUser, draftMaps],
  );

  const handlePublishBuilderMap = useCallback(
    async (bp: CustomMapBlueprint) => {
      if (!authUser) {
        setAuthModalOpen(true);
        throw new Error('Sign in to publish your track to Explore Maps.');
      }
      const published = await saveOrPublishCustomMap(
        {
          ...bp,
          authorId: authUser.id,
          authorUsername: authUser.username,
          isPublished: true,
          updatedAt: Date.now(),
        },
        true,
      );
      builderDraftBlueprintRef.current = published;
      setBuilderDraftBlueprint(published);
      setActiveCustomBlueprint(published);
      upsertDraftSlot(published);
      setSavedDraftTimestamps((prev) => ({ ...prev, [published.id]: published.updatedAt }));
    },
    [authUser, upsertDraftSlot],
  );

  const handleTestDriveBlueprint = useCallback(
    (bp: CustomMapBlueprint) => {
      const chosenWeather = weatherPresetRef.current;
      const chosenHaze = hazePreset;
      const chosenSolarDeg = solarAngle;
      runWithLoadingScreen(
        `Launching ${bp.title}`,
        'Compiling custom terrain, props, and starting grid...',
        () => {
          upsertDraftSlot(bp);
          setBuilderStudioOpen(false);
          setPendingRaceLaunch(null);
          setActiveCustomBlueprint(bp);
          setLastRaceReward(null);
          rubberHistoryRef.current = [];
          setRubberHistory([]);
          currentRaceDistanceKmRef.current = 0;
          const validMode =
            bp.closedLoop || raceConfig.mode === 'time_trial' || raceConfig.mode === 'drift'
              ? raceConfig.mode
              : 'time_trial';
          const testRaceCfg: RaceConfig = {
            ...raceConfig,
            mode: validMode,
            lapCount: bp.closedLoop
              ? validMode === 'sprint' || validMode === 'endurance'
                ? Math.max(1, raceConfig.lapCount || 3)
                : raceConfig.lapCount
              : 0,
          };
          setRaceConfig(testRaceCfg);
          const updatedMetrics = controllerRef.current?.loadCustomBlueprint(bp, true);
          if (updatedMetrics) {
            setMetrics(updatedMetrics);
            setMapRevision((r) => r + 1);
          }
          controllerRef.current?.setWeatherPreset(chosenWeather);
          controllerRef.current?.setHazePreset(chosenHaze);
          const label = controllerRef.current?.setSolarAngle(chosenSolarDeg);
          if (label) setPhaseLabel(label);
          setAppMode('racing');
          controllerRef.current?.startNewRace(testRaceCfg);
          const stations = controllerRef.current?.getCctvStations();
          if (stations && stations.length > 0) setCctvStations(stations);
        },
      );
    },
    [hazePreset, raceConfig, runWithLoadingScreen, solarAngle, upsertDraftSlot],
  );

  const handleRequestBlueprintRaceSetup = useCallback(
    (bp: CustomMapBlueprint, fromBuilder: boolean) => {
      const selected = GARAGE_CARS[carIndex];
      if (!selected?.available || !carReady) return;
      if (!fromBuilder) {
        setSocialHubOpen(false);
      }
      setWeatherPreset(bp.defaultWeather);
      controllerRef.current?.setWeatherPreset(bp.defaultWeather);
      setHazePreset(bp.defaultHaze);
      controllerRef.current?.setHazePreset(bp.defaultHaze);
      setSolarAngle(bp.defaultSolarDeg);
      const label = controllerRef.current?.setSolarAngle(bp.defaultSolarDeg);
      if (label) setPhaseLabel(label);
      if (!bp.closedLoop && (raceConfig.mode === 'sprint' || raceConfig.mode === 'endurance')) {
        const nextCfg: RaceConfig = {
          ...raceConfig,
          mode: 'time_trial',
          lapCount: 0,
        };
        setRaceConfig(nextCfg);
        controllerRef.current?.setRaceConfig(nextCfg);
      }
      setPendingRaceLaunch({ kind: 'custom_blueprint', blueprint: bp, fromBuilder });
    },
    [carIndex, carReady, raceConfig],
  );

  const handleConfirmPendingRaceLaunch = useCallback(() => {
    const pending = pendingRaceLaunch;
    if (!pending) return;
    if (pending.kind === 'official_track') {
      handleConfirmTrackAndLaunch(pending.mapId);
    } else if (pending.kind === 'current_customized') {
      setPendingRaceLaunch(null);
      launchRaceOnCurrentMap();
    } else {
      handleTestDriveBlueprint(pending.blueprint);
    }
  }, [
    handleConfirmTrackAndLaunch,
    handleTestDriveBlueprint,
    launchRaceOnCurrentMap,
    pendingRaceLaunch,
  ]);

  const handleCustomMapCameraModeChange = useCallback((mode: 'overview' | 'top_down') => {
    setCustomMapCameraMode(mode);
    controllerRef.current?.setCustomMapCameraMode(mode);
  }, []);

  const handleMapConfigChange = useCallback(
    (next: MapCustomizationConfig, rebuildImmediate = false) => {
      setMapConfig(next);
      setMapCustomizationsByMap((prev) => ({ ...prev, [activeMapIdRef.current]: next }));
      if (rebuildImmediate) {
        scheduleAfterPaint(() => {
          const updatedMetrics = controllerRef.current?.applyMapCustomization(next);
          if (updatedMetrics) {
            setMetrics(updatedMetrics);
            setMapRevision((r) => r + 1);
          }
        });
      } else {
        controllerRef.current?.previewMapCustomization(next);
      }
    },
    [scheduleAfterPaint],
  );

  const handleApplyMapRebuild = useCallback(() => {
    runWithLoadingScreen(
      'Rebuilding Circuit Layout',
      'Updating spline geometry, road kerbs, and elevation...',
      () => {
        const updatedMetrics = controllerRef.current?.applyMapCustomization(mapConfig);
        if (updatedMetrics) {
          setMetrics(updatedMetrics);
          setMapRevision((r) => r + 1);
        }
      },
    );
  }, [mapConfig, runWithLoadingScreen]);

  const handleResetDefaultMap = useCallback(() => {
    const def = getDefaultMapCustomization();
    setMapConfig(def);
    setMapCustomizationsByMap((prev) => ({ ...prev, [activeMapIdRef.current]: def }));
    setSelectedWaypoint(getEditableWaypointsForActiveMap()[0]?.index ?? 0);
    const updatedMetrics = controllerRef.current?.applyMapCustomization(def);
    if (updatedMetrics) {
      setMetrics(updatedMetrics);
      setMapRevision((r) => r + 1);
    }
  }, []);

  const handleSelectWaypoint = useCallback((wpIdx: number) => {
    setSelectedWaypoint(wpIdx);
    controllerRef.current?.setSelectedWaypoint(wpIdx);
  }, []);

  const handleOpenSettings = useCallback(
    (tab: SettingsTab = 'cameras') => {
      controllerRef.current?.unlockAudio();
      if (appMode === 'racing') {
        controllerRef.current?.setPaused(true);
      }
      const freshPerf = controllerRef.current?.getPerformanceSnapshot();
      if (freshPerf) {
        lastPerfUiSyncRef.current = performance.now();
        setPerfSnapshot(freshPerf);
      }
      setSettingsInitialTab(tab);
      setSettingsOpen(true);
    },
    [appMode],
  );

  const handleToggleAutoManageResources = useCallback(() => {
    const next = !perfSnapshot.autoManageEnabled;
    controllerRef.current?.setAutoManageResources(next);
    const snap = controllerRef.current?.getPerformanceSnapshot();
    if (snap) setPerfSnapshot(snap);
  }, [perfSnapshot.autoManageEnabled]);

  const handlePurgeUnusedResources = useCallback(() => {
    controllerRef.current?.purgeUnusedResources();
  }, []);

  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    if (appMode === 'racing' && !tuningOpen) {
      controllerRef.current?.setPaused(false);
    }
  }, [appMode, tuningOpen]);

  const handleOpenTuning = useCallback(() => {
    controllerRef.current?.unlockAudio();
    setEngLabOpen(false);
    setTuningInitialTab('parts');
    if (appMode === 'racing') {
      controllerRef.current?.setPaused(true);
    }
    setTuningOpen(true);
  }, [appMode]);

  const handleOpenAnalytics = useCallback(() => {
    controllerRef.current?.unlockAudio();
    setEngLabOpen(false);
    setTuningInitialTab('analytics');
    if (appMode === 'racing') {
      controllerRef.current?.setPaused(true);
    }
    setTuningOpen(true);
  }, [appMode]);

  const handleResetDriverAnalytics = useCallback(() => {
    const empty = createEmptyDriverAnalytics();
    setDriverAnalytics(empty);
    saveDriverAnalyticsToStorage(empty);
  }, []);

  const handleWatchReplay = useCallback(() => {
    if (!controllerRef.current?.hasLastReplay()) {
      setSocialNotice('Complete a short run first to record telemetry for Race Replay.');
      return;
    }
    replayReturnModeRef.current = appModeRef.current === 'podium' ? 'podium' : 'garage';
    setSettingsOpen(false);
    setTuningOpen(false);
    setCarSelectOpen(false);
    setTrackSelectOpen(false);
    setEngLabOpen(false);
    setSocialHubOpen(false);
    setProfileViewerOpen(false);
    setIsHudHidden(false);
    const started = controllerRef.current.startReplay();
    if (started) {
      setAppMode('replay');
    }
  }, []);

  const handleOpenPlayerProfile = useCallback((identifier: string) => {
    setProfileViewerTarget(identifier);
    setProfileViewerOpen(true);
  }, []);

  const handleUpdateLocalBio = useCallback((bio: string, homeId: string) => {
    setDriverBio(bio);
    setHomeCircuitId(homeId);
  }, []);

  const handleChallengePlayer = useCallback(
    (username: string) => {
      setProfileViewerOpen(false);
      if (!authUserRef.current) {
        setAuthModalOpen(true);
        return;
      }
      setSocialHubTab('parties');
      setSocialHubOpen(true);
      setSocialNotice(`Ready to challenge @${username} — host or open a Party room to invite them.`);
    },
    [],
  );

  const handleOpenTuningFromSettings = useCallback(() => {
    controllerRef.current?.unlockAudio();
    setSettingsOpen(false);
    setTuningInitialTab('parts');
    if (appMode === 'racing') {
      controllerRef.current?.setPaused(true);
    }
    setTuningOpen(true);
  }, [appMode]);

  const handleCloseTuning = useCallback(() => {
    setTuningOpen(false);
    if (appMode === 'racing' && !settingsOpen) {
      controllerRef.current?.setPaused(false);
    }
  }, [appMode, settingsOpen]);

  const handleExitToGarage = useCallback(() => {
    setSettingsOpen(false);
    setTuningOpen(false);
    setCarSelectOpen(false);
    setBuilderStudioOpen(false);
    setStudioModalFrozen(false);
    setHudMenuOpen(false);
    setReplayState(null);
    setGarageTab('showroom');
    setIsHudHidden(false);
    setIsCctv(false);
    setIsFlyover(false);
    setActivePreset(null);
    setAppMode('garage');
    controllerRef.current?.setPaused(false);
    controllerRef.current?.setAppMode('garage');
  }, []);

  const handleRestartRace = useCallback(() => {
    setSettingsOpen(false);
    setIsHudHidden(false);
    setIsCctv(false);
    setIsFlyover(false);
    setActivePreset(null);
    setPodiumCameraAngle('auto');
    setEngineerCaption(null);
    setLastRaceReward(null);
    rubberHistoryRef.current = [];
    setRubberHistory([]);
    setAppMode('racing');
    controllerRef.current?.startNewRace(raceConfig);
  }, [raceConfig]);

  const handleTougeDirectionChange = useCallback(
    (dir: TougeDirection) => {
      setTougeDirectionState(dir);
      try {
        window.localStorage.setItem(TOUGE_DIRECTION_STORAGE_KEY, dir);
      } catch {
        // Ignore storage quota errors
      }
      const updated = controllerRef.current?.setTougeDirection(dir);
      if (updated) {
        setMetrics(updated);
        setMapRevision((r) => r + 1);
      }
      setTelemetry((t) => ({
        ...t,
        bestLapMs: readBestLapMsForMapCar(activeMapIdRef.current, selectedCarIdRef.current),
      }));
    },
    [],
  );

  const handleGhostModeChange = useCallback((mode: GhostBattleMode) => {
    setGhostModeState(mode);
    try {
      window.localStorage.setItem(GHOST_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage quota errors
    }
    controllerRef.current?.setGhostMode(mode);
  }, []);

  const handleSelectTofuChapter = useCallback(
    (chapter: TofuStoryChapter) => {
      const nextCfg: RaceConfig = {
        ...raceConfigRef.current,
        mode: 'tofu_delivery',
        lapCount: 1,
        tofuChapterId: chapter.id,
        tofuFragility: chapter.spillSensitivity,
        tofuChapterRewardCr: chapter.rewardCr,
      };
      setRaceConfig(nextCfg);
      controllerRef.current?.setRaceConfig(nextCfg);

      if (activeCustomBlueprintRef.current || activeMapIdRef.current !== chapter.mapId) {
        setActiveCustomBlueprint(null);
        setActiveMapIdState(chapter.mapId);
        applyActiveMapImmediate(chapter.mapId);
      }
      handleTougeDirectionChange(chapter.direction);

      setWeatherPreset(chapter.weather);
      controllerRef.current?.setWeatherPreset(chapter.weather);
      setIsAutoCycle(false);
      controllerRef.current?.setAutoCycle(false);
      setSolarAngle(chapter.solarDeg);
      const label = controllerRef.current?.setSolarAngle(chapter.solarDeg);
      if (label) setPhaseLabel(label);
      if (chapter.headlightsRequired) {
        controllerRef.current?.setHeadlightsEnabled(true);
        setHeadlightsOn(true);
      }

      if (selectedCarIdRef.current !== 'toyota-ae86-trueno') {
        handleSelectCarById('toyota-ae86-trueno');
      }

      setPendingRaceLaunch((prev) =>
        prev?.kind === 'official_track'
          ? { kind: 'official_track', mapId: chapter.mapId }
          : prev,
      );
    },
    [applyActiveMapImmediate, handleSelectCarById, handleTougeDirectionChange],
  );

  const handleAssistsChange = useCallback((next: VehicleAssists) => {
    setAssists(next);
    controllerRef.current?.setAssists(next);
  }, []);

  const handleCarSetupChange = useCallback(
    (next: CarSetupConfig) => {
      setCarSetupByCar((prev) => ({
        ...prev,
        [selectedCarId]: next,
      }));
      setCockpitDials((prev) =>
        prev.brakeBalance === next.brakeBalance
          ? prev
          : { ...prev, brakeBalance: next.brakeBalance },
      );
      controllerRef.current?.setCarSetup(next);
    },
    [selectedCarId],
  );

  const handlePurchaseAndEquipPart = useCallback(
    (cat: PartCategoryId, partId: string, _costCr: number): boolean => {
      const carId = selectedCarIdRef.current;
      setOwnedPartsByCar((prev) => {
        const existing = prev[carId] ?? [];
        if (existing.includes(partId)) return prev;
        return {
          ...prev,
          [carId]: [...existing, partId],
        };
      });
      const curSetup = carSetupRef.current;
      const nextSetup: CarSetupConfig = {
        ...curSetup,
        equippedParts: {
          ...(curSetup.equippedParts ?? {}),
          [cat]: partId,
        },
      };
      setCarSetupByCar((prev) => ({
        ...prev,
        [carId]: nextSetup,
      }));
      controllerRef.current?.setCarSetup(nextSetup);
      return true;
    },
    [],
  );

  const handlePrewarmMap = useCallback((mapId: MapId) => {
    controllerRef.current?.prewarmMap(mapId);
  }, []);

  const handleCloseTrackSelect = useCallback(() => {
    setTrackSelectOpen(false);
  }, []);

  const handleOpenEngLab = useCallback(() => {
    setTuningOpen(false);
    setRubberHistory([...rubberHistoryRef.current]);
    setEngLabOpen(true);
  }, []);

  const handleStudioToolModeChange = useCallback((mode: StudioToolMode) => {
    setStudioToolMode(mode);
    controllerRef.current?.setStudioToolMode(mode);
  }, []);

  const handleStudioSelectProp = useCallback((propId: string | null) => {
    setSelectedBuilderPropId(propId);
    controllerRef.current?.syncSelectedBuilderProp(propId);
  }, []);

  const handleStudioFocusProp = useCallback((propId: string) => {
    controllerRef.current?.focusStudioCameraOnProp(propId);
  }, []);

  const handleSelectStudioNode = useCallback((ptIndex: number) => {
    setSelectedStudioNodeIdx(ptIndex);
    controllerRef.current?.setSelectedBlueprintNode(ptIndex);
  }, []);

  const handleStudioFocusNode = useCallback((ptIndex: number) => {
    setSelectedStudioNodeIdx(ptIndex);
    controllerRef.current?.focusStudioCameraOnNode(ptIndex);
  }, []);

  const handleStudioSnapPropToRoad = useCallback((propId: string) => {
    const prevBp = builderDraftBlueprintRef.current;
    const target = prevBp.placedProps.find((p) => p.id === propId);
    if (!target || target.locked) return;
    const snap = controllerRef.current?.snapPointToRoad(target.x, target.z);
    if (!snap) return;
    setStudioUndoStack((prev) => [...prev.slice(-39), prevBp]);
    setStudioRedoStack([]);
    const nextProps = prevBp.placedProps.map((p) =>
      p.id === propId
        ? {
            ...p,
            x: snap.x,
            y: snap.y,
            z: snap.z,
            rotX: snap.rotX,
            rotY: snap.rotY,
            rotZ: snap.rotZ,
          }
        : p,
    );
    const nextBp: CustomMapBlueprint = {
      ...prevBp,
      placedProps: nextProps,
      updatedAt: Date.now(),
    };
    builderDraftBlueprintRef.current = nextBp;
    setBuilderDraftBlueprint(nextBp);
    setActiveCustomBlueprint(nextBp);
    controllerRef.current?.loadCustomBlueprint(nextBp, false, propId);
    setStudioStatusMessage(`Snapped ${target.type.replace('_', ' ')} flush & aligned to road.`);
  }, []);

  const handleStudioGetCameraTarget = useCallback(() => {
    return controllerRef.current?.getStudioCameraTarget() ?? { x: 0, y: 20, z: 0 };
  }, []);

  const handleStudioSetTransformConfig = useCallback(
    (cfg: Parameters<SceneControllerAPI['setStudioTransformConfig']>[0]) => {
      controllerRef.current?.setStudioTransformConfig(cfg);
    },
    [],
  );

  const handleRequireAuth = useCallback(() => {
    setAuthModalOpen(true);
  }, []);

  const handleVisualConfigChange = useCallback(
    (next: CarVisualCustomization) => {
      setVisualConfigByCar((prev) => ({
        ...prev,
        [selectedCarId]: next,
      }));
      controllerRef.current?.setVisualCustomization(next);
    },
    [selectedCarId],
  );

  const handleTestModeChange = useCallback((enabled: boolean) => {
    setTestModeEnabled(enabled);
    controllerRef.current?.setTestMode(enabled);
  }, []);

  const handleCockpitDialsChange = useCallback(
    (next: CockpitDialState) => {
      setCockpitDials(next);
      setCarSetupByCar((prev) => {
        const cur = prev[selectedCarId];
        if (!cur || cur.brakeBalance === next.brakeBalance) return prev;
        return {
          ...prev,
          [selectedCarId]: { ...cur, brakeBalance: next.brakeBalance },
        };
      });
      controllerRef.current?.setCockpitDials(next);
    },
    [selectedCarId],
  );

  const handlePitStrategyChange = useCallback((next: PitStrategyPlan) => {
    setPitStrategy(next);
    controllerRef.current?.setPitStrategy(next);
  }, []);

  const handleToggleAdvancedTelemetry = useCallback(() => {
    setAdvancedTelemetryEnabled((prev) => {
      const next = !prev;
      controllerRef.current?.setAdvancedTelemetryEnabled(next);
      return next;
    });
  }, []);

  const handleDownloadTelemetryCsv = useCallback(() => {
    const res = controllerRef.current?.exportTelemetryCsv();
    if (!res || !res.csv || res.sampleCount === 0) return;
    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.href = url;
    link.download = `${activeMapId}-telemetry-25hz-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [activeMapId]);

  const handleDrivingCameraChange = useCallback((cam: DrivingCameraMode) => {
    setDrivingCamera(cam);
    setIsCctv(false);
    setIsFlyover(false);
    setActivePreset(null);
    controllerRef.current?.setDrivingCamera(cam);
  }, []);

  const handleCycleDrivingCamera = useCallback(() => {
    const next = controllerRef.current?.cycleDrivingCamera();
    if (next) setDrivingCamera(next);
  }, []);

  const handleAudioVolumeChange = useCallback(
    (vol: number) => {
      setAudioVolume(vol);
      controllerRef.current?.unlockAudio();
      controllerRef.current?.setAudioConfig(vol, audioMuted);
    },
    [audioMuted],
  );

  const handleAudioMuteToggle = useCallback(() => {
    setAudioMuted((prev) => {
      const next = !prev;
      controllerRef.current?.unlockAudio();
      controllerRef.current?.setAudioConfig(audioVolume, next);
      return next;
    });
  }, [audioVolume]);

  const handleSurfaceAudioToggle = useCallback(() => {
    setSurfaceAudioEnabled((prev) => {
      const next = !prev;
      controllerRef.current?.unlockAudio();
      controllerRef.current?.setSurfaceAudioEnabled(next);
      return next;
    });
  }, []);

  const handleToggleCctv = useCallback(() => {
    setIsCctv((prev) => {
      const next = !prev;
      if (next) {
        setIsFlyover(false);
        setActivePreset(null);
      }
      controllerRef.current?.setCctvEnabled(next);
      if (next) {
        const stations = controllerRef.current?.getCctvStations();
        if (stations && stations.length > 0) setCctvStations(stations);
      }
      return next;
    });
  }, []);

  const handleCycleCctv = useCallback(
    (delta: number) => {
      const count = cctvStations.length || 6;
      setCctvAutoSwitch(false);
      controllerRef.current?.setCctvAutoSwitch(false);
      setCctvStationIndex((prev) => {
        const nextIdx = ((prev + delta) % count + count) % count;
        controllerRef.current?.setCctvStationIndex(nextIdx);
        return nextIdx;
      });
    },
    [cctvStations.length],
  );

  const handleToggleCctvAutoSwitch = useCallback(() => {
    setCctvAutoSwitch((prev) => {
      const next = !prev;
      controllerRef.current?.setCctvAutoSwitch(next);
      return next;
    });
  }, []);

  const handleSelectPreset = useCallback((preset: CameraPresetId) => {
    setIsFlyover(false);
    setIsCctv(false);
    setActivePreset(preset);
    controllerRef.current?.setCameraPreset(preset);
  }, []);

  const handleToggleFlyover = useCallback(() => {
    setIsFlyover((prev) => {
      const next = !prev;
      if (next) {
        setActivePreset(null);
        setIsCctv(false);
      }
      controllerRef.current?.setFlyoverActive(next);
      return next;
    });
  }, []);

  const handleReturnToDrive = useCallback(() => {
    setIsCctv(false);
    setIsFlyover(false);
    setActivePreset(null);
    controllerRef.current?.returnToDriveCamera();
  }, []);

  const handleSolarChange = useCallback((deg: number) => {
    setIsAutoCycle(false);
    controllerRef.current?.setAutoCycle(false);
    setSolarAngle(deg);
    const label = controllerRef.current?.setSolarAngle(deg);
    if (label) setPhaseLabel(label);
  }, []);

  const handleToggleAutoCycle = useCallback(() => {
    setIsAutoCycle((prev) => {
      const next = !prev;
      controllerRef.current?.setAutoCycle(next);
      return next;
    });
  }, []);

  const handleHazeChange = useCallback((haze: HazePreset) => {
    setHazePreset(haze);
    controllerRef.current?.setHazePreset(haze);
  }, []);

  const handleWeatherChange = useCallback((weather: WeatherPreset) => {
    setWeatherPreset(weather);
    controllerRef.current?.setWeatherPreset(weather);
    if (
      activeMapIdRef.current === 'aurelia_ridge' ||
      weather === 'sunset_storm' ||
      weather === 'deep_morning_mist'
    ) {
      const sync = AURELIA_WEATHER_SOLAR_SYNC[weather];
      if (sync) {
        setIsAutoCycle(false);
        controllerRef.current?.setAutoCycle(false);
        setSolarAngle(sync.solarDeg);
        const label = controllerRef.current?.setSolarAngle(sync.solarDeg);
        if (label) setPhaseLabel(label);
        setHazePreset(sync.haze);
        controllerRef.current?.setHazePreset(sync.haze);
      }
    }
  }, []);

  const handleSnowAtmosphereChange = useCallback((preset: SnowAtmospherePreset) => {
    setSnowAtmosphere(preset);
    setIsAutoCycle(false);
    controllerRef.current?.setAutoCycle(false);
    const sync = controllerRef.current?.setSnowAtmosphere(preset);
    if (sync) {
      setSolarAngle(sync.solarAngleDeg);
      setPhaseLabel(sync.phaseLabel);
    }
  }, []);

  const handleInspectChange = useCallback((mode: InspectMode) => {
    setInspectMode(mode);
    controllerRef.current?.setInspectMode(mode);
  }, []);

  const handleTogglePostFx = useCallback(() => {
    setPostFxEnabled((prev) => {
      const next = !prev;
      controllerRef.current?.setPostFxEnabled(next);
      return next;
    });
  }, []);

  const handleGraphicsQualityChange = useCallback((quality: GraphicsQuality) => {
    const nextShadow = getDefaultShadowQualityForPreset(quality);
    const nextTex = getDefaultTextureSizeForPreset(quality);
    const nextScale = getDefaultRenderScaleForPreset(quality);
    setGraphicsQuality(quality);
    setShadowQuality(nextShadow);
    setTextureSize(nextTex);
    setRenderScale(nextScale);
    try {
      window.localStorage.setItem(GRAPHICS_QUALITY_STORAGE_KEY, quality);
      window.localStorage.setItem(SHADOW_QUALITY_STORAGE_KEY, nextShadow);
      window.localStorage.setItem(TEXTURE_SIZE_STORAGE_KEY, nextTex);
      window.localStorage.setItem(RENDER_SCALE_STORAGE_KEY, nextScale);
    } catch {
      // Ignore storage quota errors
    }
    controllerRef.current?.setStartupBenchmarkPinned(true);
    controllerRef.current?.setGraphicsQuality(quality);
  }, []);

  const handleShadowQualityChange = useCallback((shadow: ShadowQualityOption) => {
    setShadowQuality(shadow);
    try {
      window.localStorage.setItem(SHADOW_QUALITY_STORAGE_KEY, shadow);
    } catch {
      // Ignore storage quota errors
    }
    controllerRef.current?.setStartupBenchmarkPinned(true);
    controllerRef.current?.setShadowQuality(shadow);
  }, []);

  const handleTextureSizeChange = useCallback((size: TextureSizeOption) => {
    setTextureSize(size);
    try {
      window.localStorage.setItem(TEXTURE_SIZE_STORAGE_KEY, size);
    } catch {
      // Ignore storage quota errors
    }
    controllerRef.current?.setStartupBenchmarkPinned(true);
    controllerRef.current?.setTextureSize(size);
  }, []);

  const handleRenderScaleChange = useCallback((scale: RenderScaleOption) => {
    setRenderScale(scale);
    try {
      window.localStorage.setItem(RENDER_SCALE_STORAGE_KEY, scale);
    } catch {
      // Ignore storage quota errors
    }
    controllerRef.current?.setStartupBenchmarkPinned(true);
    controllerRef.current?.setRenderScale(scale);
  }, []);

  const handleToggleGarageAeroPreview = useCallback((deployed: boolean) => {
    setGarageAeroPreview(deployed);
    controllerRef.current?.setGarageAeroPreview(deployed);
  }, []);

  const handleToggleActiveAero = useCallback(() => {
    controllerRef.current?.toggleActiveAero();
  }, []);

  const handleToggleLiveAeroInDrawer = useCallback(() => {
    const curMode =
      carSetup.activeAeroMode ?? (carSetup.activeAeroEnabled === false ? 'off' : 'auto');
    if (curMode === 'off') {
      const nextSetup: CarSetupConfig = {
        ...carSetup,
        activeAeroEnabled: true,
        activeAeroMode: 'manual',
      };
      handleCarSetupChange(nextSetup);
      controllerRef.current?.setAeroDeployed(false);
      return;
    }
    const nextDeployed = !telemetryRef.current.aeroDeployed;
    controllerRef.current?.setAeroDeployed(nextDeployed);
  }, [carSetup, handleCarSetupChange]);

  const handleMobileVisibilityChange = useCallback((vis: MobileVisibilityMode) => {
    setMobileVisibility(vis);
    try {
      window.localStorage.setItem(MOBILE_VIS_STORAGE_KEY, vis);
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const handleMobileSteerModeChange = useCallback((mode: MobileSteerMode) => {
    setMobileSteerMode(mode);
    try {
      window.localStorage.setItem(MOBILE_STEER_STORAGE_KEY, mode);
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const handleMobileSteerSensitivityChange = useCallback((nextVal: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, Math.round(nextVal * 20) / 20));
    setMobileSteerSensitivity(clamped);
    try {
      window.localStorage.setItem(MOBILE_STEER_SENS_STORAGE_KEY, String(clamped));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const handleMobileAutoGasChange = useCallback((enabled: boolean) => {
    setMobileAutoGas(enabled);
    try {
      window.localStorage.setItem(MOBILE_AUTO_GAS_STORAGE_KEY, enabled ? '1' : '0');
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const handleMobileInput = useCallback((inp: MobileControlsInput) => {
    controllerRef.current?.setMobileInput(inp);
  }, []);

  const handleCloseTutorial = useCallback(() => {
    setTutorialActive(false);
    try {
      window.localStorage.setItem(TUTORIAL_COMPLETED_STORAGE_KEY, '1');
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const handleReplayTutorial = useCallback(() => {
    setSettingsOpen(false);
    if (appMode === 'racing') {
      controllerRef.current?.setPaused(false);
    }
    setTutorialRunId((id) => id + 1);
    setTutorialActive(true);
  }, [appMode]);

  useEffect(() => {
    if (hasSavedGraphicsQuality()) return;
    const autoQ: GraphicsQuality = deviceProfile.isMobileExperience ? 'low' : 'recommended';
    if (graphicsQualityRef.current !== autoQ) {
      setGraphicsQuality(autoQ);
      setShadowQuality(getDefaultShadowQualityForPreset(autoQ));
      setTextureSize(getDefaultTextureSizeForPreset(autoQ));
      setRenderScale(getDefaultRenderScaleForPreset(autoQ));
      controllerRef.current?.setGraphicsQuality(autoQ);
    }
  }, [deviceProfile.isMobileExperience]);

  const handleCinematicSettingsChange = useCallback((next: CinematicSettings) => {
    setCinematicSettings(next);
    controllerRef.current?.setCinematicSettings(next);
  }, []);

  const fallbackWeatherLabel =
    activeMapId === 'frostpeak_pass'
      ? snowAtmosphere === 'alpine_snow'
        ? 'Crisp Alpine'
        : snowAtmosphere === 'twilight_storm'
        ? 'Twilight Storm'
        : 'Glacier Sun'
      : weatherPreset === 'dry'
      ? 'Dry'
      : weatherPreset === 'overcast'
      ? 'Overcast'
      : weatherPreset === 'sunset_storm'
      ? 'Sunset Storm'
      : weatherPreset === 'deep_morning_mist'
      ? 'Morning Mist'
      : 'Wet Rain';
  const weatherLabel =
    (cinematicSettings.weatherAutoEnabled || cinematicSettings.dynamicWeatherEnabled) &&
    (appMode === 'racing' || appMode === 'podium') &&
    liveWeatherState
      ? liveWeatherState.activeLabel
      : fallbackWeatherLabel;
  weatherLabelRef.current = weatherLabel;
  const handleToggleHeadlights = useCallback(() => {
    const next = controllerRef.current?.toggleHeadlights();
    if (typeof next === 'boolean') {
      setHeadlightsOn(next);
    }
  }, []);

  const requiresMandatoryAuth = !authUser && !authChecking;
  const availableBuilderCars = useMemo(
    () =>
      GARAGE_CARS.filter((c) => c.available && c.carModelId).map((c) => ({
        id: c.carModelId!,
        name: c.name,
        category: c.category,
      })),
    [],
  );
  const hasUnsavedBuilderChanges = useMemo(() => {
    const savedAt = savedDraftTimestamps[builderDraftBlueprint.id];
    return savedAt === undefined || savedAt !== builderDraftBlueprint.updatedAt;
  }, [builderDraftBlueprint.id, builderDraftBlueprint.updatedAt, savedDraftTimestamps]);

  const isSpectator = isCctv || isFlyover || activePreset !== null;
  const isGarageSpectating = appMode === 'garage' && isSpectator;
  const shouldFreezeBackground =
    requiresMandatoryAuth ||
    carSelectOpen ||
    trackSelectOpen ||
    raceSetupModalOpen ||
    socialHubOpen ||
    authModalOpen ||
    settingsOpen ||
    Boolean(photoPreviewId) ||
    (tuningOpen && appMode !== 'garage') ||
    engLabOpen ||
    hudMenuOpen ||
    (appMode === 'custom_map' && builderStudioOpen && studioModalFrozen) ||
    (appMode === 'garage' && !isGarageSpectating && !photoState.active && garageTab !== 'showroom');

  useEffect(() => {
    controllerRef.current?.setBackgroundFrozen(shouldFreezeBackground);
  }, [shouldFreezeBackground]);

  const currentStation = cctvStations[cctvStationIndex];
  const showMobileControls =
    !webglError &&
    !requiresMandatoryAuth &&
    appMode === 'racing' &&
    !photoState.active &&
    !photoPreviewId &&
    !settingsOpen &&
    !tuningOpen &&
    !authModalOpen &&
    !socialHubOpen &&
    !isHudHidden &&
    !isSpectator &&
    !preRaceIntroActive &&
    !telemetry.raceFinished &&
    (mobileVisibility === 'always' ||
      (mobileVisibility === 'auto' &&
        (deviceProfile.isMobileExperience || deviceProfile.hasTouchInput)));

  // Build snapshot of all user progress for persistent cross-device cloud save
  const buildUserProgressSnapshot = useCallback((): UserProgressData => {
    return {
      selectedCarId,
      activeMapId,
      carSetups: carSetupByCar as unknown as Record<string, unknown>,
      visualCustomizations: visualConfigByCar as unknown as Record<string, unknown>,
      mapCustomizations: mapCustomizationsByMap as unknown as Record<string, unknown>,
      bestLaps: bestLapsByKey,
      bestDrifts: bestDriftsByKey,
      speedTrapRecords: speedTrapByKey,
      draftMaps,
      assists: assists as unknown as Record<string, unknown>,
      drivingCamera,
      graphicsQuality,
      audioVolume,
      hudVisibility,
      stats: userStats,
      creditsCr,
      ownedPartsByCar,
      tofuStoryProgress,
      driverBio,
      homeCircuitId,
      driverAnalytics,
    };
  }, [
    activeMapId,
    assists,
    audioVolume,
    bestDriftsByKey,
    bestLapsByKey,
    carSetupByCar,
    creditsCr,
    draftMaps,
    driverAnalytics,
    driverBio,
    drivingCamera,
    graphicsQuality,
    homeCircuitId,
    hudVisibility,
    mapCustomizationsByMap,
    ownedPartsByCar,
    selectedCarId,
    speedTrapByKey,
    tofuStoryProgress,
    userStats,
    visualConfigByCar,
  ]);
  buildUserProgressSnapshotRef.current = buildUserProgressSnapshot;

  // Apply cloud UserProgressData when logging in on any device
  const applyCloudProgress = useCallback(
    (progress: UserProgressData) => {
      if (!progress) return;
      if (progress.carSetups && Object.keys(progress.carSetups).length > 0) {
        const mergedSetups = loadCarSetups();
        for (const id of ALL_CAR_IDS) {
          const raw = progress.carSetups[id] as Partial<CarSetupConfig> | undefined;
          if (raw) mergedSetups[id] = { ...mergedSetups[id], ...raw };
        }
        setCarSetupByCar(mergedSetups);
      }
      if (progress.visualCustomizations && Object.keys(progress.visualCustomizations).length > 0) {
        const mergedVisuals = loadCarVisuals();
        for (const id of ALL_CAR_IDS) {
          const raw = progress.visualCustomizations[id] as Partial<CarVisualCustomization> | undefined;
          if (raw) mergedVisuals[id] = { ...mergedVisuals[id], ...raw };
        }
        setVisualConfigByCar(mergedVisuals);
      }
      if (typeof progress.creditsCr === 'number' && Number.isFinite(progress.creditsCr) && progress.creditsCr >= 0) {
        setCreditsCr(Math.round(progress.creditsCr));
      }
      if (progress.ownedPartsByCar && typeof progress.ownedPartsByCar === 'object') {
        setOwnedPartsByCar((prev) => {
          const merged: Record<CarModelId, string[]> = { ...prev };
          for (const id of ALL_CAR_IDS) {
            const cloudList = progress.ownedPartsByCar?.[id];
            const set = new Set<string>(merged[id] ?? []);
            if (Array.isArray(cloudList)) {
              for (const p of cloudList) {
                if (typeof p === 'string') set.add(p);
              }
            }
            merged[id] = Array.from(set);
          }
          return merged;
        });
      }
      if (progress.selectedCarId && !hasUserSelectedCarRef.current) {
        const carId = normalizeCarModelId(progress.selectedCarId);
        const idx = GARAGE_CARS.findIndex((c) => c.carModelId === carId);
        if (idx >= 0) {
          carIndexRef.current = idx;
          setCarIndex(idx);
          controllerRef.current?.setGarageCarAvailable(GARAGE_CARS[idx].available);
        }
        selectedCarIdRef.current = carId;
        setSelectedCarId(carId);
        controllerRef.current?.setSelectedCar(carId);
        const slot = idx >= 0 ? GARAGE_CARS[idx] : undefined;
        if (slot) {
          setTelemetry((t) => ({
            ...t,
            carId,
            carName: slot.name,
          }));
        }
        const setupForCar =
          (progress.carSetups?.[carId] as Partial<CarSetupConfig> | undefined) ?? undefined;
        if (setupForCar) {
          controllerRef.current?.setCarSetup({
            ...getDefaultCarSetup(carId),
            ...setupForCar,
          });
        }
        const visForCar =
          (progress.visualCustomizations?.[carId] as Partial<CarVisualCustomization> | undefined) ??
          undefined;
        if (visForCar) {
          controllerRef.current?.setVisualCustomization({
            ...getDefaultVisualCustomization(carId),
            ...visForCar,
          });
        }
      }
      if (progress.bestLaps) {
        setBestLapsByKey((prev) => {
          const merged = { ...prev };
          for (const [k, ms] of Object.entries(progress.bestLaps)) {
            if (typeof ms === 'number' && ms > 10000) {
              merged[k] = typeof merged[k] === 'number' && merged[k] > 10000 ? Math.min(merged[k], ms) : ms;
            }
          }
          return merged;
        });
        for (const [k, ms] of Object.entries(progress.bestLaps)) {
          if (typeof ms !== 'number' || ms <= 10000) continue;
          const [mId, cId] = k.split('::');
          if (
            mId &&
            cId &&
            (OFFICIAL_MAP_IDS as string[]).includes(mId) &&
            (ALL_CAR_IDS as string[]).includes(cId)
          ) {
            try {
              const storageKey = getBestLapStorageKeyFor(mId as MapId, cId as CarModelId);
              const existing = readBestLapMsForMapCar(mId as MapId, cId as CarModelId);
              if (existing === null || ms < existing) {
                window.localStorage.setItem(
                  storageKey,
                  JSON.stringify({ bestLapMs: ms, deltaBuckets: [] }),
                );
              }
            } catch {
              // Ignore localStorage quota errors
            }
          }
        }
      }
      if (progress.bestDrifts) {
        setBestDriftsByKey((prev) => {
          const merged = { ...prev };
          for (const [k, pts] of Object.entries(progress.bestDrifts)) {
            if (typeof pts === 'number') merged[k] = Math.max(merged[k] ?? 0, pts);
          }
          return merged;
        });
      }
      if (progress.speedTrapRecords) {
        setSpeedTrapByKey((prev) => {
          const merged = { ...prev };
          for (const [k, kmh] of Object.entries(progress.speedTrapRecords)) {
            if (typeof kmh === 'number') merged[k] = Math.max(merged[k] ?? 0, kmh);
          }
          return merged;
        });
      }
      if (Array.isArray(progress.draftMaps)) {
        setDraftMaps((prev) => {
          const byId = new Map<string, CustomMapBlueprint>();
          prev.forEach((m) => {
            if (m?.id) byId.set(m.id, m);
          });
          progress.draftMaps.forEach((m) => {
            if (!m?.id) return;
            const existing = byId.get(m.id);
            if (!existing || (m.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
              byId.set(m.id, m);
            }
          });
          return Array.from(byId.values());
        });
        setSavedDraftTimestamps((prev) => {
          const next = { ...prev };
          for (const m of progress.draftMaps) {
            if (m && m.id) next[m.id] = m.updatedAt ?? 0;
          }
          return next;
        });
      }
      if (progress.mapCustomizations) {
        setMapCustomizationsByMap((prev) => ({
          ...prev,
          ...(progress.mapCustomizations as Record<string, MapCustomizationConfig>),
        }));
      }
      if (progress.assists && Object.keys(progress.assists).length > 0) {
        const mergedAssists = {
          ...DEFAULT_ASSISTS_STATE,
          ...(progress.assists as Partial<VehicleAssists>),
        };
        setAssists(mergedAssists);
        controllerRef.current?.setAssists(mergedAssists);
      }
      if (progress.drivingCamera) {
        const cam = progress.drivingCamera as DrivingCameraMode;
        setDrivingCamera(cam);
        controllerRef.current?.setDrivingCamera(cam);
      }
      if (
        !hasSavedGraphicsQuality() &&
        progress.graphicsQuality &&
        (VALID_GRAPHICS_QUALITIES as string[]).includes(progress.graphicsQuality)
      ) {
        const gq = progress.graphicsQuality as GraphicsQuality;
        setGraphicsQuality(gq);
        setShadowQuality(getDefaultShadowQualityForPreset(gq));
        setTextureSize(getDefaultTextureSizeForPreset(gq));
        setRenderScale(getDefaultRenderScaleForPreset(gq));
        controllerRef.current?.setGraphicsQuality(gq);
      }
      if (typeof progress.audioVolume === 'number') {
        const vol = Math.max(0, Math.min(1, progress.audioVolume));
        setAudioVolume(vol);
        controllerRef.current?.setAudioConfig(vol, audioMutedRef.current);
      }
      if (progress.hudVisibility) {
        setHudVisibility({
          ...DEFAULT_HUD_VISIBILITY,
          ...progress.hudVisibility,
        });
      }
      if (progress.stats) {
        setUserStats((prev) => ({
          racesCompleted: Math.max(prev.racesCompleted, progress.stats.racesCompleted ?? 0),
          racesWon: Math.max(prev.racesWon, progress.stats.racesWon ?? 0),
          totalDistanceKm: Math.max(prev.totalDistanceKm, progress.stats.totalDistanceKm ?? 0),
          totalDriftScore: Math.max(prev.totalDriftScore, progress.stats.totalDriftScore ?? 0),
        }));
      }
      if (progress.tofuStoryProgress && typeof progress.tofuStoryProgress === 'object') {
        setTofuStoryProgress((prev) => {
          const merged = mergeTofuStoryProgress(progress.tofuStoryProgress, prev);
          try {
            window.localStorage.setItem(TOFU_PROGRESS_STORAGE_KEY, JSON.stringify(merged));
          } catch {
            // Ignore storage quota errors
          }
          return merged;
        });
      }
      if (typeof progress.driverBio === 'string') {
        setDriverBio(progress.driverBio);
      }
      if (typeof progress.homeCircuitId === 'string' && progress.homeCircuitId) {
        setHomeCircuitId(progress.homeCircuitId);
      }
      if (progress.driverAnalytics && typeof progress.driverAnalytics === 'object') {
        setDriverAnalytics((prev) => {
          const merged = mergeDriverAnalytics(prev, normalizeDriverAnalytics(progress.driverAnalytics));
          saveDriverAnalyticsToStorage(merged);
          return merged;
        });
      }
      if (
        progress.activeMapId &&
        (OFFICIAL_MAP_IDS as string[]).includes(progress.activeMapId)
      ) {
        const mId = progress.activeMapId as MapId;
        setActiveMapIdState(mId);
        applyActiveMapImmediate(mId);
        const savedMapCfg = progress.mapCustomizations?.[mId] as MapCustomizationConfig | undefined;
        if (savedMapCfg) {
          setMapConfig(savedMapCfg);
          controllerRef.current?.applyMapCustomization(savedMapCfg);
        }
      }
      cloudHydratedRef.current = true;
    },
    [applyActiveMapImmediate],
  );

  // Restore stored auth session & connect WebSocket on boot
  useEffect(() => {
    const token = getStoredAuthToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    let cancelled = false;
    void fetchCurrentUser()
      .then(({ user, progress }) => {
        if (cancelled) return;
        setAuthUser(user);
        applyCloudProgress(progress);
        multiplayerClient.connect(token);
        void fetchMyMaps()
          .then((serverMaps) => {
            if (!cancelled) mergeCloudDraftMaps(serverMaps);
          })
          .catch(() => {});
      })
      .catch(() => {
        // Token expired or invalid -> fall back to mandatory auth gate
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyCloudProgress, mergeCloudDraftMaps]);

  // Auto-save cloud progress & local backup vault so updates never reset progress
  useEffect(() => {
    if (!authUser || !cloudHydratedRef.current) return;
    const snapshot = buildUserProgressSnapshot();
    saveLocalProgressVault(authUser.username, snapshot);
    if (appMode === 'racing') return;
    const timer = window.setTimeout(() => {
      void saveUserProgressCloud(snapshot).catch(() => {});
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [appMode, authUser, buildUserProgressSnapshot]);

  // Launch 3D multiplayer party session (either race or explore free-roam)
  const launchPartyDrive = useCallback(
    (room: PartyRoomState) => {
      const selected = GARAGE_CARS[carIndex];
      if (!selected?.available) return;
      runWithLoadingScreen(
        `Joining Party Session · ${room.code}`,
        `Synchronizing circuit and ${selected.name} telemetry...`,
        () => {
          setSocialHubOpen(false);
          setTrackSelectOpen(false);
          setCarSelectOpen(false);
          setTuningOpen(false);
          setEngLabOpen(false);
          setSettingsOpen(false);
          setBuilderStudioOpen(false);
          setIsHudHidden(false);
          setIsCctv(false);
          setIsFlyover(false);
          setActivePreset(null);
          setPodiumCameraAngle('auto');
          setEngineerCaption(null);
          setLastRaceReward(null);
          rubberHistoryRef.current = [];
          setRubberHistory([]);
          currentRaceDistanceKmRef.current = 0;

          const collisionActive =
            room.collisionMode === 'collide' ||
            (room.collisionMode === 'race_only' && room.activityMode === 'race');

          const partyRaceConfig: RaceConfig = {
            ...raceConfig,
            mode:
              room.activityMode === 'explore'
                ? 'time_trial'
                : room.activityMode === 'tandem_drift'
                ? 'drift'
                : 'sprint',
            lapCount:
              room.activityMode === 'explore'
                ? 0
                : room.activityMode === 'tandem_drift'
                ? Math.max(0, room.laps)
                : Math.max(1, room.laps),
            startCountdownMode: room.activityMode === 'explore' ? 'instant' : 'quick',
          };
          setRaceConfig(partyRaceConfig);
          setWeatherPreset(room.weatherPreset as WeatherPreset);
          setSolarAngle(room.solarDeg);

          controllerRef.current?.clearRemotePlayers();
          controllerRef.current?.setMultiplayerCollisionEnabled(collisionActive);
          if (room.customBlueprint) {
            setActiveCustomBlueprint(room.customBlueprint);
            const updated = controllerRef.current?.loadCustomBlueprint(room.customBlueprint, true);
            if (updated) {
              setMetrics(updated);
              setMapRevision((r) => r + 1);
            }
          } else {
            setActiveCustomBlueprint(null);
            const officialMapId = ((OFFICIAL_MAP_IDS as string[]).includes(room.mapId)
              ? room.mapId
              : 'aurelia_ridge') as MapId;
            setActiveMapIdState(officialMapId);
            controllerRef.current?.loadCustomBlueprint(null, false);
            applyActiveMapImmediate(officialMapId);
          }
          controllerRef.current?.setWeatherPreset(room.weatherPreset as WeatherPreset);
          const label = controllerRef.current?.setSolarAngle(room.solarDeg);
          if (label) setPhaseLabel(label);
          setAppMode('racing');
          controllerRef.current?.startNewRace(partyRaceConfig);
          const stations = controllerRef.current?.getCctvStations();
          if (stations && stations.length > 0) setCctvStations(stations);
        },
      );
    },
    [applyActiveMapImmediate, carIndex, raceConfig, runWithLoadingScreen],
  );

  // Subscribe to WebSocket multiplayer events
  useEffect(() => {
    const unsub = multiplayerClient.subscribe((evt) => {
      if (evt.type === 'connected') {
        setLiveParties(evt.parties);
      } else if (evt.type === 'party:list') {
        setLiveParties(evt.parties);
      } else if (evt.type === 'party:state') {
        setActiveParty(evt.room);
        const collisionEnabled =
          evt.room.collisionMode === 'collide' ||
          (evt.room.collisionMode === 'race_only' && evt.room.activityMode === 'race');
        controllerRef.current?.setMultiplayerCollisionEnabled(collisionEnabled);

        const sessionKey = `${evt.room.id}:${evt.room.mapId}:${evt.room.customMapId ?? ''}:${evt.room.activityMode}`;
        if (
          (evt.room.status === 'active' || evt.room.status === 'countdown') &&
          launchedPartySessionRef.current !== sessionKey
        ) {
          launchedPartySessionRef.current = sessionKey;
          launchPartyDrive(evt.room);
        } else if (evt.room.status === 'lobby' || evt.room.status === 'finished') {
          launchedPartySessionRef.current = null;
        }
      } else if (evt.type === 'party:chat') {
        setActiveParty((prev) => {
          if (!prev) return prev;
          if (prev.chat.some((m) => m.id === evt.message.id)) return prev;
          return {
            ...prev,
            chat: [...prev.chat, evt.message].slice(-50),
          };
        });
      } else if (evt.type === 'party:pose') {
        if (evt.pose.userId !== authUserRef.current?.id) {
          controllerRef.current?.syncRemotePlayerPose(evt.pose);
        }
      } else if (evt.type === 'party:member_left') {
        controllerRef.current?.removeRemotePlayer(evt.userId);
      } else if (evt.type === 'party:left') {
        setActiveParty(null);
        launchedPartySessionRef.current = null;
        controllerRef.current?.clearRemotePlayers();
      } else if (evt.type === 'party:invite') {
        setIncomingInvite(evt.invite);
      } else if (evt.type === 'error') {
        setSocialNotice(evt.message);
        window.setTimeout(() => setSocialNotice(null), 4000);
      }
    });
    return unsub;
  }, [launchPartyDrive]);

  // 20Hz live multiplayer car pose broadcast
  useEffect(() => {
    if (!activeParty || !authUser) return;
    if (appMode !== 'racing' && appMode !== 'podium') return;
    const timer = window.setInterval(() => {
      if (!multiplayerClient.isConnected() || !controllerRef.current) return;
      const pose = controllerRef.current.getLocalMultiplayerPose(
        authUser.id,
        authUser.username,
        selectedCarIdRef.current,
        visualConfigRef.current.paintHex,
      );
      multiplayerClient.sendPose(pose);
    }, 50);
    return () => window.clearInterval(timer);
  }, [activeParty, authUser, appMode]);

  const handleLoginSubmit = useCallback(
    async (username: string, password: string) => {
      const res = await loginWithUsername(username, password);
      const localVault = loadLocalProgressVault(res.user.username);
      const mergedProgress = mergeProgressSnapshots(res.progress, localVault);
      setAuthUser(res.user);
      setAuthChecking(false);
      setAuthModalOpen(false);
      applyCloudProgress(mergedProgress);
      saveLocalProgressVault(res.user.username, mergedProgress);
      if (res.restoredFromVault || (localVault && (res.progress.stats?.racesCompleted ?? 0) === 0 && (localVault.stats?.racesCompleted ?? 0) > 0)) {
        void saveUserProgressCloud(mergedProgress).catch(() => {});
      }
      multiplayerClient.connect(res.token);
      void fetchMyMaps()
        .then((serverMaps) => mergeCloudDraftMaps(serverMaps))
        .catch(() => {});
    },
    [applyCloudProgress, mergeCloudDraftMaps],
  );

  const handleSignupSubmit = useCallback(
    async (username: string, password: string) => {
      const localSnapshot = buildUserProgressSnapshot();
      const existingVault = loadLocalProgressVault(username);
      const seedSnapshot = mergeProgressSnapshots(localSnapshot, existingVault);
      const res = await signupWithUsername(username, password, seedSnapshot);
      setAuthUser(res.user);
      setAuthChecking(false);
      setAuthModalOpen(false);
      applyCloudProgress(res.progress);
      saveLocalProgressVault(res.user.username, res.progress);
      cloudHydratedRef.current = true;
      await saveUserProgressCloud(res.progress).catch(() => {});
      multiplayerClient.connect(res.token);
    },
    [applyCloudProgress, buildUserProgressSnapshot],
  );

  const handleLogout = useCallback(async () => {
    if (authUser) {
      const snap = buildUserProgressSnapshot();
      saveLocalProgressVault(authUser.username, snap);
      await saveUserProgressCloud(snap).catch(() => {});
    }
    multiplayerClient.disconnect();
    await logoutAccount();
    cloudHydratedRef.current = false;
    hasUserSelectedCarRef.current = false;
    setActiveParty(null);
    setBuilderStudioOpen(false);
    setSocialHubOpen(false);
    setCarSelectOpen(false);
    setTrackSelectOpen(false);
    setPendingRaceLaunch(null);
    setTuningOpen(false);
    setEngLabOpen(false);
    setSettingsOpen(false);
    setActiveCustomBlueprint(null);
    setDraftMaps([]);
    setSavedDraftTimestamps({});
    setBestDriftsByKey({});
    setSpeedTrapByKey({});
    setDriverBio('');
    setHomeCircuitId('aurelia_ridge');
    setProfileViewerOpen(false);
    setReplayState(null);
    setUserStats(createEmptyUserProgress().stats);
    setAppMode('garage');
    controllerRef.current?.setAppMode('garage');
    controllerRef.current?.clearRemotePlayers();
    setAuthChecking(false);
    setAuthUser(null);
    setAuthModalOpen(true);
  }, [authUser, buildUserProgressSnapshot]);

  const handleAcceptInvite = useCallback(
    (invite: PartyInviteNotification) => {
      setIncomingInvite(null);
      if (!authUser) {
        setAuthModalOpen(true);
        return;
      }
      multiplayerClient.joinParty({
        roomId: invite.roomId,
        code: invite.roomCode,
        carId: selectedCarId,
        paintHex: visualConfig.paintHex,
      });
      setSocialHubTab('parties');
      setSocialHubOpen(true);
    },
    [authUser, selectedCarId, visualConfig.paintHex],
  );

  const handleDismissInvite = useCallback(() => {
    setIncomingInvite(null);
  }, []);

  const handleTogglePartyCollisionMode = useCallback((mode: PartyCollisionMode) => {
    multiplayerClient.updatePartySettings({ collisionMode: mode });
  }, []);

  const handleLeaveParty = useCallback(() => {
    multiplayerClient.leaveParty();
    setActiveParty(null);
    launchedPartySessionRef.current = null;
    controllerRef.current?.clearRemotePlayers();
    if (appModeRef.current === 'racing') {
      handleExitToGarage();
    }
  }, [handleExitToGarage]);

  const handleSendPartyChat = useCallback((text: string) => {
    multiplayerClient.sendChat(text);
  }, []);

  const handleToggleMinimapMode = useCallback(() => {
    setMinimapMode((prev) => (prev === 'overview' ? 'ahead' : 'overview'));
  }, []);

  const handleSkipPreRaceIntro = useCallback(() => {
    controllerRef.current?.skipPreRaceIntro();
  }, []);

  const handleResetTrack = useCallback(() => {
    controllerRef.current?.resetCarToTrack();
  }, []);

  const handleOpenCameraSettings = useCallback(() => {
    handleOpenSettings('cameras');
  }, [handleOpenSettings]);

  const handleOpenPerfProfiler = useCallback(() => {
    handleOpenSettings('performance');
  }, [handleOpenSettings]);

  const handleShiftUp = useCallback(() => {
    controllerRef.current?.shiftUp();
  }, []);

  const handleShiftDown = useCallback(() => {
    controllerRef.current?.shiftDown();
  }, []);

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-[#0c0f14]">
      <div
        ref={canvasMountRef}
        className="fixed inset-0 h-full w-full"
        aria-label="Limit state .VYROX 3D Racing Viewport"
      />

      {(webglError || contextLost) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#06080c]/95 p-6">
          <div className="gt5-panel gt5-horizon-rule max-w-md p-6 text-center">
            <h2 className="font-display text-lg font-bold tracking-wider text-white uppercase">
              {webglError ? '3D Viewport Unavailable' : 'Restoring 3D Viewport'}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              {webglError ??
                'The WebGL graphics context was interrupted and is attempting to restore automatically.'}
            </p>
          </div>
        </div>
      )}

      {/* Garage Showroom UI (Hides cleanly until signed in, or if spectating/tuning/photo mode) */}
      {!webglError && Boolean(authUser) && appMode === 'garage' && !isGarageSpectating && !tuningOpen && !photoState.active && !photoPreviewId && (
        <MainScreenOverlay
          activeMapId={activeMapId}
          metrics={metrics}
          carIndex={carIndex}
          carLoadPct={carLoadPct}
          carReady={carReady}
          bestLapMs={telemetry.bestLapMs}
          weatherLabel={weatherLabel}
          phaseLabel={phaseLabel}
          raceConfig={raceConfig}
          carSetup={carSetup}
          visualConfig={visualConfig}
          garageCamPreset={garageCamPreset}
          liveSpecs={{
            powerLabel: `${legalityEval.ppReport.peakHp.toLocaleString()} HP`,
            torqueLabel: `${Math.round(liveEffectiveSpecs.v8TorqueNm * liveEffectiveSpecs.topEndTorqueMult + liveEffectiveSpecs.electricFillNm)} Nm`,
            weightLabel: `${legalityEval.ppReport.massKg.toLocaleString()} kg`,
            ppLabel: `${legalityEval.ppReport.pp.toFixed(1)}`,
            bracketLabel: `PP · ${legalityEval.ppReport.bracket}`,
          }}
          legalityBlockedReason={legalityBlockedReason}
          legalityWarning={legalityWarning}
          testModeEnabled={testModeEnabled}
          user={authUser}
          creditsCr={creditsCr}
          activeParty={activeParty}
          livePartyCount={liveParties.length}
          activeCustomBlueprint={activeCustomBlueprint}
          onCycleCar={handleCycleCar}
          onOpenCarSelect={() => setCarSelectOpen(true)}
          onRaceConfigChange={handleRaceConfigChange}
          onGarageCamPresetChange={handleGarageCamPresetChange}
          onStartRace={handleStartRaceFromGarage}
          onOpenCustomMap={handleOpenCustomMap}
          onOpenMapBuilder={() => handleOpenMapBuilder()}
          onClearCustomBlueprint={handleClearCustomBlueprint}
          onOpenAuth={handleRequireAuth}
          onOpenProfile={() => handleOpenPlayerProfile(authUser ? authUser.username : '__local__')}
          onOpenSocialHub={(tab) => {
            setSocialHubTab(tab);
            setSocialHubOpen(true);
          }}
          onOpenTuning={handleOpenTuning}
          onOpenAnalytics={handleOpenAnalytics}
          onOpenEngLab={handleOpenEngLab}
          onOpenPhotoMode={handleEnterPhotoMode}
          hasReplay={hasLastReplay}
          onWatchReplay={handleWatchReplay}
          onOpenSettings={() => handleOpenSettings('cameras')}
          onActiveTabChange={setGarageTab}
          mobileVisibility={mobileVisibility}
          mobileSteerMode={mobileSteerMode}
          mobileSteerSensitivity={mobileSteerSensitivity}
          mobileAutoGas={mobileAutoGas}
          onMobileVisibilityChange={handleMobileVisibilityChange}
          onMobileSteerModeChange={handleMobileSteerModeChange}
          onMobileSteerSensitivityChange={handleMobileSteerSensitivityChange}
          onMobileAutoGasChange={handleMobileAutoGasChange}
          deviceProfile={deviceProfile}
        />
      )}

      {/* Total Map Viewing Floating Bar when inspecting map from Garage */}
      {!webglError && isGarageSpectating && !isHudHidden && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-wrap items-center justify-between gap-2 p-2.5 sm:p-5"
          style={{
            paddingTop: 'max(0.625rem, env(safe-area-inset-top))',
            paddingLeft: 'max(0.625rem, env(safe-area-inset-left))',
            paddingRight: 'max(0.625rem, env(safe-area-inset-right))',
          }}
        >
          <div className="gt5-panel gt5-horizon-rule pointer-events-auto flex min-h-[40px] sm:min-h-0 items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs text-slate-100">
            <Camera className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span className="font-semibold tracking-wider text-sky-300 uppercase truncate max-w-[180px] sm:max-w-none">
              {isCctv && currentStation
                ? `${currentStation.code} · ${currentStation.label}`
                : isFlyover
                ? 'Aerial Circuit Tour'
                : 'Total Map Explorer'}
            </span>
            {isCctv && (
              <>
                <button
                  type="button"
                  onClick={() => handleCycleCctv(-1)}
                  aria-label="Previous CCTV"
                  className="flex h-8 w-8 sm:h-6 sm:w-6 items-center justify-center hover:bg-white/10"
                >
                  <ChevronLeft className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleCycleCctv(1)}
                  aria-label="Next CCTV"
                  className="flex h-8 w-8 sm:h-6 sm:w-6 items-center justify-center hover:bg-white/10"
                >
                  <ChevronRight className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </button>
              </>
            )}
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setIsHudHidden((p) => !p)}
              aria-label="Hide UI"
              title="Hide UI (H)"
              className="gt5-panel inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center text-sky-300 hover:border-sky-400/50 hover:text-white shrink-0"
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleCaptureScreenshot}
              className="gt5-panel inline-flex h-10 sm:h-auto items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-sky-400/50 hover:text-white whitespace-nowrap shrink-0"
            >
              <Camera className="h-3.5 w-3.5 text-sky-400" />
              <span className="hidden sm:inline">Screenshot</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenSettings('cameras')}
              className="gt5-panel inline-flex h-10 sm:h-auto items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-sky-400/50 hover:text-white whitespace-nowrap shrink-0"
            >
              <Settings className="h-3.5 w-3.5 text-sky-400" />
              <span>Cameras</span>
            </button>
            <button
              type="button"
              onClick={handleReturnToDrive}
              className="inline-flex h-10 sm:h-auto items-center gap-1.5 bg-sky-500 px-3.5 py-1.5 text-xs font-bold tracking-wider text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap shrink-0"
            >
              <Home className="h-3.5 w-3.5" />
              <span className="sm:hidden">Garage</span>
              <span className="hidden sm:inline">Return to Garage</span>
            </button>
          </div>
        </div>
      )}

      {/* Pre-Race 3D Map Customizer or Full Map Builder Studio */}
      {!webglError && appMode === 'custom_map' && builderStudioOpen && (
        <MapBuilderStudio
          blueprint={builderDraftBlueprint}
          user={authUser}
          studioToolMode={studioToolMode}
          selectedPropId={selectedBuilderPropId}
          selectedNodeIdx={selectedStudioNodeIdx}
          canUndo={studioUndoStack.length > 0}
          canRedo={studioRedoStack.length > 0}
          terrainToolConfig={terrainToolConfig}
          activePropType={activePropType}
          autoAlignTrack={autoAlignTrack}
          statusMessage={studioStatusMessage}
          onChangeStudioToolMode={handleStudioToolModeChange}
          onSelectProp={handleStudioSelectProp}
          onFocusProp={handleStudioFocusProp}
          onSelectNode={handleSelectStudioNode}
          onFocusNode={handleStudioFocusNode}
          onSnapPropToRoad={handleStudioSnapPropToRoad}
          onGetCameraTarget={handleStudioGetCameraTarget}
          onSetTransformConfig={handleStudioSetTransformConfig}
          onChangeTerrainToolConfig={setTerrainToolConfig}
          onChangeActivePropType={setActivePropType}
          onChangeAutoAlignTrack={setAutoAlignTrack}
          onUndo={handleStudioUndo}
          onRedo={handleStudioRedo}
          onChangeBlueprint={handleChangeBuilderBlueprint}
          onSetCameraMode={handleCustomMapCameraModeChange}
          selectedCarId={selectedCarId}
          availableCars={availableBuilderCars}
          buildSlots={draftMaps}
          hasUnsavedChanges={hasUnsavedBuilderChanges}
          onSelectCar={handleSelectCarById}
          onOpenCarSelect={() => setCarSelectOpen(true)}
          onSwitchSlot={handleSwitchBuildSlot}
          onCreateNewSlot={handleCreateNewBuildSlot}
          onDuplicateSlot={handleDuplicateBuildSlot}
          onDeleteSlot={handleDeleteBuildSlot}
          onSaveDraft={handleSaveBuilderDraft}
          onPublishMap={handlePublishBuilderMap}
          onTestDrive={(bp) => handleRequestBlueprintRaceSetup(bp, true)}
          onExitStudio={handleExitToGarage}
          onRequireAuth={handleRequireAuth}
          onStudioModalStateChange={setStudioModalFrozen}
        />
      )}

      {!webglError && appMode === 'custom_map' && !builderStudioOpen && (
        <MapCustomizerOverlay
          activeMapId={activeMapId}
          config={mapConfig}
          metrics={metrics}
          selectedWaypoint={selectedWaypoint}
          weatherPreset={weatherPreset}
          snowAtmosphere={snowAtmosphere}
          solarAngle={solarAngle}
          phaseLabel={phaseLabel}
          isHudHidden={isHudHidden}
          onToggleHudHidden={() => setIsHudHidden((p) => !p)}
          cameraMode={customMapCameraMode}
          onCameraModeChange={handleCustomMapCameraModeChange}
          onSelectActiveMap={handleSelectActiveMap}
          onConfigChange={handleMapConfigChange}
          onSelectWaypoint={handleSelectWaypoint}
          onApplyRebuild={handleApplyMapRebuild}
          onResetDefault={handleResetDefaultMap}
          onWeatherChange={handleWeatherChange}
          onSnowAtmosphereChange={handleSnowAtmosphereChange}
          onSolarChange={handleSolarChange}
          onCaptureScreenshot={handleCaptureScreenshot}
          onStartRace={handleOpenCustomizerRaceSetup}
          onBackToGarage={handleExitToGarage}
        />
      )}

      {/* Universal Show-UI recovery button when UI is hidden across Racing, Spectator, Podium, Customizer, or Garage Spectate */}
      {!webglError && !settingsOpen && !loadingState.active && !photoState.active && !photoPreviewId && isHudHidden && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-end p-2 desktop:p-5"
          style={{
            paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
            paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
          }}
        >
          <button
            type="button"
            onClick={() => setIsHudHidden(false)}
            aria-label="Show UI"
            title="Show UI (H)"
            data-testid="hud-eye-toggle"
            className="gt7-hud-box pointer-events-auto inline-flex h-11 w-11 landscape-short:h-9 landscape-short:w-9 items-center justify-center border border-amber-400/80 bg-[#070b12]/80 text-amber-300 shadow-xl transition-colors hover:border-sky-400 hover:text-white desktop:h-9 desktop:w-9"
          >
            <EyeOff className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* GT7 Camera-Adaptive Driving HUD & Engineer Captions */}
      {!webglError && appMode === 'racing' && !photoState.active && !photoPreviewId && (
        <Gt7DrivingHud
          activeMapId={activeMapId}
          activeCustomBlueprint={activeCustomBlueprint}
          telemetry={telemetry}
          subscribeTelemetry={subscribeTelemetry}
          assists={assists}
          drivingCamera={drivingCamera}
          weatherLabel={weatherLabel}
          weatherAutoEnabled={cinematicSettings.weatherAutoEnabled}
          weatherProgressPct={liveWeatherState?.progressPct ?? 0}
          phaseLabel={phaseLabel}
          mapRevision={mapRevision}
          isHudHidden={isHudHidden}
          hudVisibility={hudVisibility}
          minimapMode={minimapMode}
          isSpectator={isSpectator}
          isCctv={isCctv}
          headlightsOn={headlightsOn}
          cctvStations={cctvStations}
          cctvStationIndex={cctvStationIndex}
          preRaceIntroActive={preRaceIntroActive}
          engineerCaption={engineerCaption}
          advancedTelemetryEnabled={advancedTelemetryEnabled}
          cockpitDials={cockpitDials}
          pitStrategy={pitStrategy}
          activeParty={activeParty}
          currentUserId={authUser?.id ?? null}
          onChangeHudVisibility={setHudVisibility}
          onHudMenuOpenChange={setHudMenuOpen}
          onTogglePartyCollisionMode={handleTogglePartyCollisionMode}
          onSendPartyChat={handleSendPartyChat}
          onLeaveParty={handleLeaveParty}
          onCockpitDialsChange={handleCockpitDialsChange}
          onPitStrategyChange={handlePitStrategyChange}
          onToggleMinimapMode={handleToggleMinimapMode}
          onExportTelemetryCsv={handleDownloadTelemetryCsv}
          onSkipPreRaceIntro={handleSkipPreRaceIntro}
          onCycleDrivingCamera={handleCycleDrivingCamera}
          onCycleCctv={handleCycleCctv}
          onReturnToDrive={handleReturnToDrive}
          onResetTrack={handleResetTrack}
          onToggleHeadlights={handleToggleHeadlights}
          onToggleActiveAero={handleToggleActiveAero}
          onOpenTuning={handleOpenTuning}
          onEnterPhotoMode={handleEnterPhotoMode}
          onOpenSettings={handleOpenCameraSettings}
          onToggleHudHidden={() => setIsHudHidden((p) => !p)}
        />
      )}

      {/* Photography Mode Studio (Free Walk, Inside Car, View Cycling, Clean Shot & Photo Preview) */}
      {!webglError && (photoState.active || Boolean(photoPreviewId)) && (
        <PhotoModeOverlay
          photoState={photoState}
          appMode={appMode}
          activeMapId={activeMapId}
          isHudHidden={isHudHidden}
          carName={(GARAGE_CARS[carIndex] ?? GARAGE_CARS[0])?.name ?? selectedCarId}
          locationName={
            appMode === 'garage'
              ? 'Hangar Showroom'
              : activeCustomBlueprint?.title ?? MAP_REGISTRY[activeMapId]?.name ?? activeMapId
          }
          photos={capturedPhotos}
          previewPhotoId={photoPreviewId}
          autoPreview={autoPreviewPhoto}
          flashCounter={photoFlashCounter}
          isMobileTouch={isTouchDevice}
          solarAngle={solarAngle}
          phaseLabel={phaseLabel}
          isAutoCycle={isAutoCycle}
          hazePreset={hazePreset}
          weatherPreset={weatherPreset}
          snowAtmosphere={snowAtmosphere}
          headlightsOn={headlightsOn}
          graphicsQuality={graphicsQuality}
          shadowQuality={shadowQuality}
          textureSize={textureSize}
          renderScale={renderScale}
          postFxEnabled={postFxEnabled}
          inspectMode={inspectMode}
          cinematicSettings={cinematicSettings}
          onSolarChange={handleSolarChange}
          onToggleAutoCycle={handleToggleAutoCycle}
          onHazeChange={handleHazeChange}
          onWeatherChange={handleWeatherChange}
          onSnowAtmosphereChange={handleSnowAtmosphereChange}
          onToggleHeadlights={handleToggleHeadlights}
          onGraphicsQualityChange={handleGraphicsQualityChange}
          onShadowQualityChange={handleShadowQualityChange}
          onTextureSizeChange={handleTextureSizeChange}
          onRenderScaleChange={handleRenderScaleChange}
          onTogglePostFx={handleTogglePostFx}
          onInspectChange={handleInspectChange}
          onCinematicSettingsChange={handleCinematicSettingsChange}
          onTakePhoto={handleTakePhoto}
          onCycleView={() => {
            const next = controllerRef.current?.cyclePhotoView();
            if (next) setPhotoState(next);
          }}
          onSelectView={(view: PhotoViewMode) => {
            const next = controllerRef.current?.setPhotoViewMode(view);
            if (next) setPhotoState(next);
          }}
          onToggleFreeze={() => {
            const next = controllerRef.current?.setPhotoCarFrozen(!photoState.carFrozen);
            if (next) setPhotoState(next);
          }}
          onLensChange={(patch) => {
            const next = controllerRef.current?.setPhotoLens(patch);
            if (next) setPhotoState(next);
          }}
          onResetCamera={() => {
            const next = controllerRef.current?.resetPhotoCamera();
            if (next) setPhotoState(next);
          }}
          onToggleHudHidden={() => setIsHudHidden((p) => !p)}
          onToggleAutoPreview={() => setAutoPreviewPhoto((p) => !p)}
          onOpenPreview={(id) => {
            const target = id ?? capturedPhotos[0]?.id ?? null;
            if (target) setPhotoPreviewId(target);
          }}
          onClosePreview={() => setPhotoPreviewId(null)}
          onDownloadPhoto={handleDownloadCapturedPhoto}
          onDeletePhoto={handleDeleteCapturedPhoto}
          onPhotoMoveInput={(input) => controllerRef.current?.setPhotoMoveInput(input)}
          onExit={handleExitPhotoMode}
        />
      )}

      {/* Multi-Mode Mobile Touch Controls (Arrows / Wheel / Slider / Tilt) */}
      <MobileControlsOverlay
        visible={showMobileControls}
        steerMode={mobileSteerMode}
        steerSensitivity={mobileSteerSensitivity}
        autoGas={mobileAutoGas}
        gearLabel={telemetry.gear <= 0 ? 'R' : String(telemetry.gear)}
        autoGear={assists.autoGear}
        subscribeTelemetry={subscribeTelemetry}
        onShiftUp={handleShiftUp}
        onShiftDown={handleShiftDown}
        onSteerModeChange={handleMobileSteerModeChange}
        onAutoGasChange={handleMobileAutoGasChange}
        onInputChange={handleMobileInput}
      />

      {/* Full Race Replay Mode Overlay (Scrubber, Speed, Multi-Angle & CCTV Stations) */}
      {!webglError && appMode === 'replay' && replayState && (
        <ReplayOverlay
          state={replayState}
          onTogglePlay={() => {
            controllerRef.current?.setReplayPlaying(!replayState.playing);
          }}
          onSeekMs={(targetMs) => {
            controllerRef.current?.seekReplayMs(targetMs);
          }}
          onStepFrames={(delta) => {
            controllerRef.current?.stepReplayFrames(delta);
          }}
          onSpeedChange={(spd) => {
            controllerRef.current?.setReplaySpeed(spd);
          }}
          onCameraChange={(cam: ReplayCameraMode) => {
            controllerRef.current?.setReplayCameraMode(cam);
          }}
          onCctvStationChange={(idx) => {
            controllerRef.current?.setReplayCctvStationIndex(idx);
          }}
          onCaptureScreenshot={handleCaptureScreenshot}
          onExit={handleExitReplay}
        />
      )}

      {/* Post-Race Top-3 Podium Showcase & Standings */}
      {!webglError && appMode === 'podium' && telemetry.finishSummary && (
        <PodiumCeremonyOverlay
          summary={telemetry.finishSummary}
          isHudHidden={isHudHidden}
          cameraAngle={podiumCameraAngle}
          lastRaceReward={lastRaceReward}
          creditsCr={creditsCr}
          hasReplay={hasLastReplay}
          onCameraAngleChange={(ang) => {
            setPodiumCameraAngle(ang);
            controllerRef.current?.setPodiumCameraAngle(ang);
          }}
          onToggleHudHidden={() => setIsHudHidden((p) => !p)}
          onCaptureScreenshot={handleCaptureScreenshot}
          onWatchReplay={handleWatchReplay}
          onRestartRace={handleRestartRace}
          onExitToGarage={handleExitToGarage}
        />
      )}

      {/* Always-visible compact corner FPS / frame ms / memory profiler strip (desktop viewports only) */}
      {!webglError && (
        <PerformanceCornerBar
          snapshot={perfSnapshot}
          subscribeSnapshot={subscribePerfSnapshot}
          isHudHidden={isHudHidden || photoState.active || Boolean(photoPreviewId) || appMode === 'replay'}
          hideOnMobile
          onOpenProfiler={handleOpenPerfProfiler}
        />
      )}

      <CarSelectModal
        open={carSelectOpen}
        cars={GARAGE_CARS}
        selectedCarId={selectedCarId}
        onSelectCar={handleSelectCarById}
        onClose={() => setCarSelectOpen(false)}
      />

      <TrackSelectModal
        open={trackSelectOpen}
        activeMapId={activeMapId}
        selectedCarId={selectedCarId}
        selectedCarName={GARAGE_CARS[carIndex]?.name ?? '2025 BMW M4 GT3 Evo'}
        eventSummary={`${raceConfig.mode.replace('_', ' ').toUpperCase()} · ${
          raceConfig.lapCount === 0 ? 'Unlimited' : `${raceConfig.lapCount} Laps`
        }`}
        snowAtmosphere={snowAtmosphere}
        onSnowAtmosphereChange={handleSnowAtmosphereChange}
        onSelectMap={handleSelectActiveMap}
        onPrewarmMap={handlePrewarmMap}
        onLaunchRace={handleSelectTrackForRaceSetup}
        onClose={handleCloseTrackSelect}
      />

      <RaceSetupModal
        open={raceSetupModalOpen}
        targetTitle={
          pendingRaceLaunch?.kind === 'custom_blueprint'
            ? pendingRaceLaunch.blueprint.title
            : pendingRaceLaunch?.kind === 'official_track'
            ? MAP_REGISTRY[pendingRaceLaunch.mapId]?.name ?? 'Circuit'
            : activeCustomBlueprint?.title ?? MAP_REGISTRY[activeMapId]?.name ?? 'Circuit'
        }
        targetSubtitle={
          pendingRaceLaunch?.kind === 'custom_blueprint'
            ? `${pendingRaceLaunch.blueprint.closedLoop ? 'Custom Circuit' : 'Point-to-Point Sprint'} · by @${pendingRaceLaunch.blueprint.authorUsername}`
            : pendingRaceLaunch?.kind === 'official_track'
            ? `${MAP_REGISTRY[pendingRaceLaunch.mapId]?.region ?? ''} · ${MAP_REGISTRY[pendingRaceLaunch.mapId]?.lengthLabel ?? ''}`
            : `${MAP_REGISTRY[activeMapId]?.region ?? ''} · ${metrics.lengthKm} km Custom Layout`
        }
        isCustomBlueprint={pendingRaceLaunch?.kind === 'custom_blueprint'}
        closedLoop={
          pendingRaceLaunch?.kind === 'custom_blueprint'
            ? pendingRaceLaunch.blueprint.closedLoop
            : !isTougeMapId(
                pendingRaceLaunch?.kind === 'official_track'
                  ? pendingRaceLaunch.mapId
                  : activeMapId,
              )
        }
        activeMapId={
          pendingRaceLaunch?.kind === 'official_track' ? pendingRaceLaunch.mapId : activeMapId
        }
        selectedCarId={selectedCarId}
        selectedCarName={GARAGE_CARS[carIndex]?.name ?? '2025 BMW M4 GT3 Evo'}
        carPpLabel={legalityEval.ppReport.pp.toFixed(1)}
        raceConfig={raceConfig}
        weatherPreset={weatherPreset}
        snowAtmosphere={snowAtmosphere}
        solarAngle={solarAngle}
        tougeDirection={tougeDirection}
        ghostMode={ghostMode}
        tofuStoryProgress={tofuStoryProgress}
        canChangeTrack={pendingRaceLaunch?.kind === 'official_track'}
        onRaceConfigChange={handleRaceConfigChange}
        onWeatherChange={handleWeatherChange}
        onSnowAtmosphereChange={handleSnowAtmosphereChange}
        onSolarChange={handleSolarChange}
        onTougeDirectionChange={handleTougeDirectionChange}
        onGhostModeChange={handleGhostModeChange}
        onSelectTofuChapter={handleSelectTofuChapter}
        onChangeTrack={() => {
          setPendingRaceLaunch(null);
          setTrackSelectOpen(true);
        }}
        onOpenCarSelect={() => setCarSelectOpen(true)}
        onConfirmStartMatch={handleConfirmPendingRaceLaunch}
        onClose={() => setPendingRaceLaunch(null)}
      />

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsInitialTab}
        appMode={appMode}
        activeMapId={activeMapId}
        selectedCarId={selectedCarId}
        raceConfig={raceConfig}
        isSpectatingFromGarage={isGarageSpectating}
        assists={assists}
        carSetup={carSetup}
        drivingCamera={drivingCamera}
        audioVolume={audioVolume}
        audioMuted={audioMuted}
        activePreset={activePreset}
        isFlyover={isFlyover}
        isCctv={isCctv}
        cctvStations={cctvStations}
        cctvStationIndex={cctvStationIndex}
        cctvAutoSwitch={cctvAutoSwitch}
        solarAngle={solarAngle}
        phaseLabel={phaseLabel}
        isAutoCycle={isAutoCycle}
        hazePreset={hazePreset}
        weatherPreset={weatherPreset}
        snowAtmosphere={snowAtmosphere}
        inspectMode={inspectMode}
        postFxEnabled={postFxEnabled}
        graphicsQuality={graphicsQuality}
        shadowQuality={shadowQuality}
        textureSize={textureSize}
        renderScale={renderScale}
        cinematicSettings={cinematicSettings}
        weatherAutoProgressPct={liveWeatherState?.progressPct ?? 0}
        performanceSnapshot={perfSnapshot}
        advancedTelemetryEnabled={advancedTelemetryEnabled}
        onClose={handleCloseSettings}
        onSelectActiveMap={handleSelectActiveMap}
        onToggleAutoManageResources={handleToggleAutoManageResources}
        onPurgeUnusedResources={handlePurgeUnusedResources}
        onToggleAdvancedTelemetry={handleToggleAdvancedTelemetry}
        onRaceConfigChange={handleRaceConfigChange}
        onAssistsChange={handleAssistsChange}
        onCarSetupChange={handleCarSetupChange}
        onDrivingCameraChange={handleDrivingCameraChange}
        onAudioVolumeChange={handleAudioVolumeChange}
        onAudioMuteToggle={handleAudioMuteToggle}
        onSelectPreset={handleSelectPreset}
        onToggleFlyover={handleToggleFlyover}
        onToggleCctv={handleToggleCctv}
        onCycleCctv={handleCycleCctv}
        onToggleCctvAutoSwitch={handleToggleCctvAutoSwitch}
        onReturnToDrive={handleReturnToDrive}
        onSolarChange={handleSolarChange}
        onToggleAutoCycle={handleToggleAutoCycle}
        onHazeChange={handleHazeChange}
        onWeatherChange={handleWeatherChange}
        onSnowAtmosphereChange={handleSnowAtmosphereChange}
        onInspectChange={handleInspectChange}
        onTogglePostFx={handleTogglePostFx}
        onGraphicsQualityChange={handleGraphicsQualityChange}
        onShadowQualityChange={handleShadowQualityChange}
        onTextureSizeChange={handleTextureSizeChange}
        onRenderScaleChange={handleRenderScaleChange}
        onCinematicSettingsChange={handleCinematicSettingsChange}
        onCaptureScreenshot={handleCaptureScreenshot}
        onRestartRace={handleRestartRace}
        onExitToGarage={handleExitToGarage}
        mobileVisibility={mobileVisibility}
        mobileSteerMode={mobileSteerMode}
        mobileSteerSensitivity={mobileSteerSensitivity}
        mobileAutoGas={mobileAutoGas}
        onMobileVisibilityChange={handleMobileVisibilityChange}
        onMobileSteerModeChange={handleMobileSteerModeChange}
        onMobileSteerSensitivityChange={handleMobileSteerSensitivityChange}
        onMobileAutoGasChange={handleMobileAutoGasChange}
        onReplayTutorial={handleReplayTutorial}
        surfaceAudioEnabled={surfaceAudioEnabled}
        onSurfaceAudioToggle={handleSurfaceAudioToggle}
        onOpenTuning={handleOpenTuningFromSettings}
        hudVisibility={hudVisibility}
        onHudVisibilityChange={setHudVisibility}
        activeCustomBlueprintTitle={activeCustomBlueprint?.title ?? null}
        deviceProfile={deviceProfile}
        onDeviceOverrideChange={setDeviceOverride}
      />

      <GarageTuningDrawer
        open={tuningOpen && (appMode === 'garage' || appMode === 'racing')}
        appMode={appMode}
        initialTab={tuningInitialTab}
        carId={selectedCarId}
        carName={GARAGE_CARS[carIndex]?.name ?? '2025 BMW M4 GT3 Evo'}
        carSetup={carSetup}
        visualConfig={visualConfig}
        legalityRuleId={legalityRuleId}
        legalityEnforcement={legalityEnforcement}
        creditsCr={creditsCr}
        ownedPartIds={ownedPartsByCar[selectedCarId]}
        driverAnalytics={driverAnalytics}
        onResetDriverAnalytics={handleResetDriverAnalytics}
        garageAeroPreview={garageAeroPreview}
        liveAeroDeployed={telemetry.aeroDeployed}
        onToggleGarageAeroPreview={handleToggleGarageAeroPreview}
        onToggleLiveAero={handleToggleLiveAeroInDrawer}
        onCarSetupChange={handleCarSetupChange}
        onPurchaseAndEquipPart={handlePurchaseAndEquipPart}
        onVisualConfigChange={handleVisualConfigChange}
        onLegalityRuleChange={setLegalityRuleId}
        onLegalityEnforcementChange={setLegalityEnforcement}
        onClose={handleCloseTuning}
      />

      <EngineeringLabModal
        open={engLabOpen && appMode === 'garage'}
        activeMapId={activeMapId}
        carId={selectedCarId}
        carName={GARAGE_CARS[carIndex]?.name ?? '2025 BMW M4 GT3 Evo'}
        carSetup={carSetup}
        testModeEnabled={testModeEnabled}
        liveTelemetry={telemetry}
        liveRubberHistory={rubberHistory}
        liveWeatherLabel={weatherLabel}
        onTestModeChange={handleTestModeChange}
        onClose={() => setEngLabOpen(false)}
      />

      <UserTutorialOverlay
        key={tutorialRunId}
        active={
          !webglError &&
          Boolean(authUser) &&
          tutorialActive &&
          !settingsOpen &&
          !carSelectOpen &&
          !trackSelectOpen &&
          !raceSetupModalOpen &&
          !tuningOpen &&
          !engLabOpen &&
          !authModalOpen &&
          !requiresMandatoryAuth &&
          !socialHubOpen &&
          !profileViewerOpen &&
          !builderStudioOpen &&
          appMode !== 'replay'
        }
        appMode={appMode}
        preRaceIntroActive={preRaceIntroActive}
        telemetry={telemetry}
        isMobileTouch={isTouchDevice}
        onComplete={handleCloseTutorial}
        onDismiss={handleCloseTutorial}
      />

      <AuthModal
        isOpen={authModalOpen || requiresMandatoryAuth}
        mandatory={!authUser}
        defaultUsername={getLastSignedInUsername()}
        user={authUser}
        stats={userStats}
        onClose={() => {
          if (authUserRef.current) setAuthModalOpen(false);
        }}
        onOpenProfile={() => {
          setAuthModalOpen(false);
          handleOpenPlayerProfile(authUser ? authUser.username : '__local__');
        }}
        onLogin={handleLoginSubmit}
        onSignup={handleSignupSubmit}
        onLogout={handleLogout}
      />

      <SocialHubModal
        isOpen={socialHubOpen}
        initialTab={socialHubTab}
        initialRoomLaps={raceConfig.lapCount > 0 ? raceConfig.lapCount : 3}
        user={authUser}
        selectedCarId={selectedCarId}
        selectedPaintHex={visualConfig.paintHex}
        activeParty={activeParty}
        liveParties={liveParties}
        onClose={() => setSocialHubOpen(false)}
        onRequireAuth={() => {
          setSocialHubOpen(false);
          setAuthModalOpen(true);
        }}
        onPlayCustomMapSolo={(bp) => handleRequestBlueprintRaceSetup(bp, false)}
        onEditCustomMap={(bp) => handleOpenMapBuilder(bp)}
        onLaunchPartyDrive={launchPartyDrive}
        onSyncUrlLaps={syncUrlLapsParam}
        onViewPlayerProfile={(identifier) => handleOpenPlayerProfile(identifier)}
      />

      <PlayerProfileModal
        open={profileViewerOpen}
        targetIdentifier={profileViewerTarget}
        authUser={authUser}
        localStats={userStats}
        localAnalytics={driverAnalytics}
        localBio={driverBio}
        localHomeCircuitId={homeCircuitId}
        localSelectedCarId={selectedCarId}
        localCreditsCr={creditsCr}
        localTofuGrades={tofuStoryProgress}
        onClose={() => setProfileViewerOpen(false)}
        onUpdateLocalBio={handleUpdateLocalBio}
        onOpenAccountSettings={() => {
          setProfileViewerOpen(false);
          setAuthModalOpen(true);
        }}
        onDriveCustomMap={(bp) => {
          setProfileViewerOpen(false);
          handleRequestBlueprintRaceSetup(bp, false);
        }}
        onChallengePlayer={handleChallengePlayer}
      />

      <RaceInviteToast
        invite={incomingInvite}
        onAccept={handleAcceptInvite}
        onDismiss={handleDismissInvite}
      />

      {socialNotice && (
        <div className="fixed bottom-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.75rem))] right-3 left-3 sm:left-auto sm:right-4 sm:max-w-sm z-50 border border-amber-400/50 bg-[#0d1119]/95 px-4 py-2 text-center sm:text-left text-xs font-semibold text-amber-200 shadow-2xl">
          {socialNotice}
        </div>
      )}

      <LoadingOverlay
        visible={!webglError && loadingState.active}
        title={loadingState.title}
        subtitle={loadingState.subtitle}
        progressPct={loadingState.progressPct ?? null}
      />
    </main>
  );
}
