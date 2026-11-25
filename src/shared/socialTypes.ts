export type WeatherPresetId = 'dry' | 'overcast' | 'rain' | 'sunset_storm' | 'deep_morning_mist';
export type HazePresetId = 'low' | 'golden' | 'heavy';

export interface HudVisibilityConfig {
  showSpeedometer: boolean;
  showGearRpm: boolean;
  showLapAndPosition: boolean;
  showSectorTimes: boolean;
  showMinimap: boolean;
  showTelemetryGraph: boolean;
  showPartyHud: boolean;
  showTrackWeatherStatus: boolean;
  showTopActionButtons: boolean;
  showMfdDials: boolean;
  showEngineHealth: boolean;
  showTrackRubber: boolean;
}

export const DEFAULT_HUD_VISIBILITY: HudVisibilityConfig = {
  showSpeedometer: true,
  showGearRpm: true,
  showLapAndPosition: true,
  showSectorTimes: true,
  showMinimap: true,
  showTelemetryGraph: true,
  showPartyHud: true,
  showTrackWeatherStatus: false,
  showTopActionButtons: false,
  showMfdDials: false,
  showEngineHealth: false,
  showTrackRubber: false,
};

export type BuilderPropType =
  | 'ramp'
  | 'mega_ramp'
  | 'jump_gap'
  | 'loop_ring'
  | 'boost_pad'
  | 'speed_trap'
  | 'drift_zone'
  | 'checkpoint'
  | 'tunnel_portal'
  | 'bridge_truss'
  | 'pit_garage'
  | 'light_gantry'
  | 'tire_barrier'
  | 'tecpro_barrier'
  | 'guardrail'
  | 'race_fence'
  | 'track_fence'
  | 'protective_fence'
  | 'cone'
  | 'curb_strip'
  | 'arch'
  | 'grandstand'
  | 'floodlight'
  | 'billboard'
  | 'tree'
  | 'palm_tree'
  | 'boulder';

export type StudioMaterialId =
  | 'default'
  | 'plastic'
  | 'metal'
  | 'carbon'
  | 'neon'
  | 'concrete'
  | 'wood'
  | 'glass'
  | 'ice';

export type TerrainMaterialId =
  | 'grass'
  | 'asphalt'
  | 'sand'
  | 'rock'
  | 'snow'
  | 'concrete'
  | 'dirt'
  | 'cobble'
  | 'ice'
  | 'neon_grid';

export type StudioToolMode = 'select' | 'move' | 'scale' | 'rotate' | 'place' | 'terrain';

export interface CustomControlPoint {
  x: number;
  y: number;
  z: number;
  bankDeg?: number;
}

export interface TerrainSculptStamp {
  id: string;
  x: number;
  z: number;
  radius: number;
  deltaY: number;
  mode: 'raise' | 'lower' | 'flatten' | 'smooth';
  targetY?: number;
}

export interface TerrainMaterialStamp {
  id: string;
  x: number;
  z: number;
  radius: number;
  material: TerrainMaterialId;
  colorHex?: string;
  strength?: number;
}

export interface BuilderPropInstance {
  id: string;
  type: BuilderPropType;
  name?: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  rotX?: number;
  rotZ?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  colorHex?: string;
  material?: StudioMaterialId;
  canCollide?: boolean;
  locked?: boolean;
  castShadow?: boolean;
}

export type MapTemplateId =
  | 'blank_loop'
  | 'speed_oval'
  | 'canyon_switchback'
  | 'figure_eight'
  | 'technical_gp'
  | 'aurelia_remix';

export type MapTypeTag = 'circuit' | 'sprint' | 'drift' | 'stunt';
export type MapDifficultyTag = 'easy' | 'medium' | 'hard' | 'extreme';
export type BaseplateTheme =
  | 'studio_grid'
  | 'asphalt_pad'
  | 'grassland'
  | 'desert_sand'
  | 'alpine_slate';
export type RoadSurfaceTheme = 'asphalt' | 'concrete' | 'dirt' | 'snow_tarmac' | 'neon_grid';
export type KerbTheme = 'red_white' | 'blue_white' | 'yellow_black' | 'monochrome' | 'none';

export interface CustomMapBlueprint {
  id: string;
  title: string;
  description: string;
  authorId: string;
  authorUsername: string;
  isPublished: boolean;
  closedLoop: boolean;
  templateId: MapTemplateId;
  mapType?: MapTypeTag;
  difficulty?: MapDifficultyTag;
  baseplateTheme?: BaseplateTheme;
  roadSurfaceTheme?: RoadSurfaceTheme;
  kerbTheme?: KerbTheme;
  autoTunnels?: boolean;
  waterEnabled?: boolean;
  waterLevel?: number;
  roadWidth: number;
  splineTension: number;
  bankingScale: number;
  gripScale: number;
  kerbHeightScale: number;
  asphaltWear: number;
  foliageDensity: number;
  defaultWeather: WeatherPresetId;
  defaultSolarDeg: number;
  defaultHaze: HazePresetId;
  controlPoints: CustomControlPoint[];
  terrainStamps: TerrainSculptStamp[];
  terrainMaterialStamps?: TerrainMaterialStamp[];
  placedProps: BuilderPropInstance[];
  likesCount: number;
  playsCount: number;
  likedByMe?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AuthUser {
  id: string;
  username: string;
  createdAt: number;
  email?: string | null;
  authProvider?: 'google' | 'local';
}

export interface UserCareerStats {
  racesCompleted: number;
  racesWon: number;
  totalDistanceKm: number;
  totalDriftScore: number;
}

export interface DriverAnalyticsSession {
  id: string;
  mapId: string;
  mapName: string;
  carId: string;
  mode: string;
  recordedAt: number;
  durationSec: number;
  distanceKm: number;
  cornersRecorded: number;
  avgTurnInAngleDeg: number;
  avgThrottleToBrakeMs: number | null;
  bestThrottleToBrakeMs: number | null;
  driftToGripEfficiencyPct: number;
  trailBrakingPct: number;
  peakLatG: number;
  cleanDrivingPct: number;
}

export interface DriverAnalyticsData {
  totalSessions: number;
  totalDriveTimeSec: number;
  totalDistanceKm: number;
  totalCorners: number;
  turnInAngleSumDeg: number;
  turnInAngleSamples: number;
  turnInHistogram: [number, number, number, number, number];
  throttleToBrakeSumMs: number;
  throttleToBrakeCount: number;
  bestThrottleToBrakeMs: number | null;
  recentThrottleToBrakeMs: number[];
  driftExitCount: number;
  driftToGripEfficiencySumPct: number;
  trailBrakingCorners: number;
  peakLatG: number;
  cleanTimeSec: number;
  trackTimeSec: number;
  recentSessions: DriverAnalyticsSession[];
  updatedAt: number;
}

export interface UserProgressData {
  selectedCarId: string;
  activeMapId: string;
  driverBio?: string;
  homeCircuitId?: string;
  creditsCr?: number;
  ownedPartsByCar?: Record<string, string[]>;
  carSetups: Record<string, unknown>;
  visualCustomizations: Record<string, unknown>;
  mapCustomizations: Record<string, unknown>;
  bestLaps: Record<string, number>;
  bestDrifts: Record<string, number>;
  speedTrapRecords: Record<string, number>;
  draftMaps: CustomMapBlueprint[];
  assists?: Record<string, unknown>;
  drivingCamera?: string;
  graphicsQuality?: string;
  shadowQuality?: string;
  textureSize?: number;
  renderScale?: number;
  audioVolume?: number;
  audioMuted?: boolean;
  surfaceAudioEnabled?: boolean;
  hudVisibility?: HudVisibilityConfig;
  cinematicSettings?: Record<string, unknown>;
  preferredWeather?: WeatherPresetId;
  preferredSolarDeg?: number;
  preferredRaceConfig?: Record<string, unknown>;
  tofuStoryProgress?: Record<
    string,
    {
      grade: 'S' | 'A' | 'B' | 'C';
      bestTimeMs: number;
      bestIntegrityPct: number;
    }
  >;
  driverAnalytics?: DriverAnalyticsData;
  stats: UserCareerStats;
}

export interface PublicPlayerProfile {
  userId: string;
  username: string;
  createdAt: number;
  lastSeenAt: number;
  online: boolean;
  partyCode?: string | null;
  partyName?: string | null;
  isSelf: boolean;
  isFriend: boolean;
  hasIncomingFriendRequest: boolean;
  hasOutgoingFriendRequest: boolean;
  driverBio: string;
  homeCircuitId: string;
  selectedCarId: string;
  creditsCr: number;
  stats: UserCareerStats;
  driverAnalytics: DriverAnalyticsData | null;
  tofuChaptersCompleted: number;
  tofuBestGrades: Record<string, 'S' | 'A' | 'B' | 'C'>;
  topLapRecords: LeaderboardRecord[];
  topDriftRecords: LeaderboardRecord[];
  publishedMaps: CustomMapBlueprint[];
  totalMapLikes: number;
  totalMapPlays: number;
}

export function createEmptyUserProgress(): UserProgressData {
  return {
    selectedCarId: 'bmw-m4-gt3-evo',
    activeMapId: 'aurelia_ridge',
    driverBio: '',
    homeCircuitId: 'aurelia_ridge',
    creditsCr: 35000,
    ownedPartsByCar: {},
    carSetups: {},
    visualCustomizations: {},
    mapCustomizations: {},
    bestLaps: {},
    bestDrifts: {},
    speedTrapRecords: {},
    draftMaps: [],
    hudVisibility: { ...DEFAULT_HUD_VISIBILITY },
    audioVolume: 0.72,
    audioMuted: false,
    surfaceAudioEnabled: true,
    preferredWeather: 'dry',
    preferredSolarDeg: 168,
    tofuStoryProgress: {},
    stats: {
      racesCompleted: 0,
      racesWon: 0,
      totalDistanceKm: 0,
      totalDriftScore: 0,
    },
  };
}

export interface LeaderboardRecord {
  id: string;
  userId: string;
  username: string;
  mapId: string;
  mapName: string;
  carId: string;
  mode: 'time_trial' | 'drift';
  bestLapMs: number | null;
  driftScore: number;
  weatherPreset: WeatherPresetId;
  tireCompound: string;
  ppRating: number;
  recordedAt: number;
}

export interface FriendEntry {
  userId: string;
  username: string;
  status: 'online' | 'in_party' | 'offline';
  partyCode?: string | null;
  partyName?: string | null;
  since: number;
}

export interface FriendRequestEntry {
  id: string;
  fromUserId: string;
  fromUsername: string;
  toUserId: string;
  toUsername: string;
  direction: 'incoming' | 'outgoing';
  createdAt: number;
}

export interface FriendsOverview {
  friends: FriendEntry[];
  requests: FriendRequestEntry[];
}

export type PartyVisibility = 'public' | 'friends' | 'private';
export type PartyActivityMode =
  | 'explore'
  | 'race'
  | 'ai_race'
  | 'drift'
  | 'tandem_drift'
  | 'time_trial'
  | 'endurance';
export type PartyAiDifficulty = 'novice' | 'pro' | 'elite';
export type PartyCollisionMode = 'ghost' | 'collide' | 'race_only';
export type PartySessionStatus = 'lobby' | 'countdown' | 'active' | 'finished';

export interface PartyModeDescriptor {
  id: PartyActivityMode;
  label: string;
  shortLabel: string;
  description: string;
  defaultLaps: number;
  allowsLaps: boolean;
  hasAiDifficulty: boolean;
}

export const PARTY_ACTIVITY_MODES: PartyModeDescriptor[] = [
  {
    id: 'explore',
    label: 'No Mode (Free Roam)',
    shortLabel: 'No Mode',
    description: 'Open cruise with friends, zero laps & instant track entry',
    defaultLaps: 0,
    allowsLaps: false,
    hasAiDifficulty: false,
  },
  {
    id: 'race',
    label: 'PVP Race',
    shortLabel: 'PVP Race',
    description: 'Players-only competitive race (no AI traffic)',
    defaultLaps: 3,
    allowsLaps: true,
    hasAiDifficulty: false,
  },
  {
    id: 'ai_race',
    label: 'AI Mode',
    shortLabel: 'AI Mode',
    description: 'Multiplayer drivers plus competitive AI grid rivals',
    defaultLaps: 3,
    allowsLaps: true,
    hasAiDifficulty: true,
  },
  {
    id: 'drift',
    label: 'Drift Mode',
    shortLabel: 'Drift Mode',
    description: 'High-angle slip-score battle on any track or touge',
    defaultLaps: 3,
    allowsLaps: true,
    hasAiDifficulty: false,
  },
  {
    id: 'tandem_drift',
    label: 'Tandem Drift',
    shortLabel: 'Tandem Drift',
    description: 'Door-to-door proximity drift chains with x3.5 multipliers',
    defaultLaps: 3,
    allowsLaps: true,
    hasAiDifficulty: false,
  },
  {
    id: 'time_trial',
    label: 'Time Trial',
    shortLabel: 'Time Trial',
    description: 'Clean shared hotlap session to set fastest sector times',
    defaultLaps: 0,
    allowsLaps: true,
    hasAiDifficulty: false,
  },
  {
    id: 'endurance',
    label: 'Endurance',
    shortLabel: 'Endurance',
    description: '2.25x tire wear, fuel burn & mandatory pit lane strategy',
    defaultLaps: 5,
    allowsLaps: true,
    hasAiDifficulty: false,
  },
];

export function getPartyModeMeta(mode: PartyActivityMode): PartyModeDescriptor {
  return PARTY_ACTIVITY_MODES.find((m) => m.id === mode) ?? PARTY_ACTIVITY_MODES[0];
}

export interface PartyMemberState {
  userId: string;
  username: string;
  carId: string;
  paintHex: string;
  ready: boolean;
  isHost: boolean;
  lap: number;
  trackT: number;
  totalProgress: number;
  bestLapMs: number | null;
  driftScore: number;
  tandemPartnerId?: string | null;
  tandemPartnerUsername?: string | null;
  tandemMultiplier?: number;
  finished: boolean;
  finishTimeMs: number | null;
}

export interface PartyChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface MultiplayerCarPose {
  userId: string;
  username: string;
  carId: string;
  paintHex: string;
  x: number;
  y: number;
  z: number;
  headingRad: number;
  pitchRad: number;
  rollRad: number;
  steerNorm: number;
  speedMps: number;
  throttle: number;
  braking: boolean;
  headlightsOn: boolean;
  hornActive: boolean;
  lap: number;
  trackT: number;
  totalProgress: number;
  finished: boolean;
  finishTimeMs: number | null;
  bestLapMs: number | null;
  driftScore: number;
  isDrifting?: boolean;
  driftAngleDeg?: number;
  tandemPartnerId?: string | null;
  tandemPartnerUsername?: string | null;
  tandemMultiplier?: number;
  timestamp: number;
}

export interface PartyRoomSummary {
  id: string;
  code: string;
  name: string;
  hostUserId: string;
  hostUsername: string;
  visibility: PartyVisibility;
  activityMode: PartyActivityMode;
  aiDifficulty?: PartyAiDifficulty;
  collisionMode: PartyCollisionMode;
  mapId: string;
  tougeDirection?: 'downhill' | 'uphill';
  customMapId: string | null;
  customMapTitle: string | null;
  weatherPreset: WeatherPresetId;
  solarDeg: number;
  laps: number;
  status: PartySessionStatus;
  memberCount: number;
  maxMembers: number;
}

export interface PartyRoomState extends PartyRoomSummary {
  customBlueprint: CustomMapBlueprint | null;
  countdownRemainingSec: number;
  members: PartyMemberState[];
  chat: PartyChatMessage[];
}

export interface PartyInviteNotification {
  id: string;
  fromUserId: string;
  fromUsername: string;
  roomId: string;
  roomCode: string;
  roomName: string;
  activityMode: PartyActivityMode;
  aiDifficulty?: PartyAiDifficulty;
  mapId?: string;
  mapTitle: string;
  mapType?: MapTypeTag;
  difficulty?: MapDifficultyTag;
  isDirectChallenge?: boolean;
  expiresAt?: number;
  createdAt: number;
}
