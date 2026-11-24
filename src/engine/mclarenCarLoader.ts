import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { USDLoader } from 'three/addons/loaders/USDLoader.js';
import type { CarVisualCustomization } from './carCustomization';
import { createCarDriverInstance } from './carDriverRig';
import { computeCarNormalizationScale } from './mathNoise';
export { computeCarNormalizationScale };
const bmwM4Gt3Url = '/Car/2025-bmw-m4-gt3-evo-g82/source/2025_bmw_m4_gt3_evo_g82.glb';
const bmwM4WidebodyUrl = '/Car/bmw-m4-widebody-modified/source/BMW_M4_MOD.glb';
const astonVantageUrl = '/Car/2020_aston_martin_vantage_59_amr/2020_aston_martin_vantage_59_amr.glb';
const astonVulcanUrl = '/Car/aston-martin-vulcan-amr-pro-wwwvecarzcom/source/aston_vulcan_amr.glb';
const audiR8Url = '/Car/2020_audi_r8_lms_evo/2020_audi_r8_lms_evo.glb';
const lamboHuracanUrl = '/Car/2023_lamborghini_huracan_gt3_evo2/2023_lamborghini_huracan_gt3_evo2.glb';
const mclaren720sUrl = '/Car/2019_mclaren_720s_gt3/2019_mclaren_720s_gt3.glb';
const acuraNsxUrl = '/Car/2018_acura_nsx_gt3/2018_acura_nsx_gt3.glb';
const toyotaGtOneUrl = '/Car/1998_toyota_gt-one_road_version_ts020/1998_toyota_gt-one_road_version_ts020.glb';
const mazdaFuraiUrl = '/Car/2008__mazda_furai/2008__mazda_furai.glb';
const bmwMHybridV8Url = '/Car/bmw_m_hybrid_v8__www.vecarz.com/bmw_m_hybrid_v8__www.vecarz.com.glb';
const cadillacVSeriesUrl = '/Car/2023_cadillac_v-series.r/2023_cadillac_v-series.r.glb';
const koenigseggAgeraUrl = '/Car/2015_koenigsegg_agera_rs_exposed_carbon_fiber/2015_koenigsegg_agera_rs_exposed_carbon_fiber.glb';
const bugattiBolideUrl = '/Car/2021_bugatti_bolide/2021_bugatti_bolide.glb';
const deTomasoP900Url = '/Car/2023_de_tomaso_p900/2023_de_tomaso_p900.glb';
const subaruWrxUrl = '/Car/2018_subaru_wrx_sti/2018_subaru_wrx_sti.glb';
const hondaS2000Url = '/Car/honda_s2000/honda_s2000.glb';
const vwPoloRUrl = '/Car/volkswagen_polo_r_wrx__www.vecarz.com/volkswagen_polo_r_wrx__www.vecarz.com.glb';
const mercedesAmgGt3Url = '/Car/mercedes-amg-gt3-evo/source/mercedes-amg_gt3_evo.glb';
const mclarenF1GtrUrl = '/Car/mclaren-f1-gtr-longtail-wwwvecarzcom/source/001.glb';
const ferrariF40LbwkUrl = '/Car/lb-works-ferrari-f40-wwwvecarzcom/source/lb-works_ferrari_f40_-__free.glb';
const ferrari250TrUrl = '/Car/ferrari-250-testa-rossa-wwwvecarzcom/source/Sketchfab_2026_10_23_12_47_42.glb';
const mazda787bUrl = '/Car/1991-mazda-787b/source/Mazda 787B.glb';
const hondaRa272Url = '/Car/1965-honda-ra272/source/f1_1965_honda_ra272.glb';
const vwGolfGtiMk2Url = '/Car/1992_volkswagen_golf_gti_mk2/1992_volkswagen_golf_gti_mk2.glb';
const toyotaAe86Url = '/Car/1983-toyota-sprinter-trueno-gt-apex-ae86/source/1983 Toyota Sprinter Trueno GT-Apex (AE86).glb';

import { type CarModelId, normalizeCarModelId } from '../shared/carTypes';
export type { CarModelId };
export { normalizeCarModelId };
export type CarTextureQualityTier = 'performance' | 'balanced' | 'ultra';

export interface McLarenCarInstance {
  carId: CarModelId;
  root: THREE.Group;
  bodySpringGroup: THREE.Group;
  chassisVisualGroup: THREE.Group;
  frontWheelSteerPivots: THREE.Group[];
  wheelCamberPivots: [THREE.Group, THREE.Group, THREE.Group, THREE.Group];
  wheelSpinPivots: THREE.Group[];
  wheelBaseYs: [number, number, number, number];
  wheelBaseXs: [number, number, number, number];
  steeringSpinPivot: THREE.Group | null;
  cockpitEyePos: THREE.Vector3;
  windshieldPos: THREE.Vector3;
  hoodCamPos: THREE.Vector3;
  bumperCamPos: THREE.Vector3;
  carLengthM: number;
  headlightSpotLeft: THREE.SpotLight;
  headlightSpotRight: THREE.SpotLight;
  wheelRadius: number;
  setLights: (headlightsOn: boolean, brakingIntensity: number, nightFactor: number) => void;
  setInteriorMode: (isInterior: boolean) => void;
  setSteeringWheelAngle: (steerRad: number) => void;
  setDirtAndWeather: (dirtLevel: number, wetness: number) => void;
  setVisualCustomization: (cfg: CarVisualCustomization) => void;
  setStance: (
    camberFrontDeg: number,
    camberRearDeg: number,
    rideHeightMm: number,
    wheelDiameterIn?: number,
  ) => void;
  setActiveAeroState: (enabled: boolean, deployed: boolean, deltaSec?: number) => void;
  setWireframe: (wire: boolean) => void;
  dispose: () => void;
}

export type CarLiveryVariant =
  | 'stealth_black'
  | 'platinum_silver'
  | 'titanium_gunmetal'
  | 'obsidian_bronze'
  | 'papaya_orange';

export interface McLarenTemplate {
  carId: CarModelId;
  createInstance: (
    withHeadlightSpots?: boolean,
    livery?: CarLiveryVariant,
  ) => McLarenCarInstance;
  setTextureQuality: (quality: CarTextureQualityTier, maxAnisotropy?: number) => void;
  dispose: () => void;
}

interface CarProfile {
  url: string;
  format?: 'glb' | 'usdz';
  targetLengthM: number;
  yawAdjustRad?: number;
  opaqueNonGlass?: boolean;
  replaceBaseMapOnPaint?: boolean;
  wheelMatNames: Set<string>;
  rimMatNames: Set<string>;
  caliperMatNames?: Set<string>;
  trimMatNames: Set<string>;
  exhaustMatNames: Set<string>;
  brakeLightMatNames: Set<string>;
  headlightMatNames: Set<string>;
  headlightGlassMatNames: Set<string>;
  displayMatNames: Set<string>;
  paintExteriorMatNames: Set<string>;
  glassMatNames: Set<string>;
  steeringMatNames: Set<string>;
  steeringNodeRegex?: RegExp;
  skipNodeRegex?: RegExp;
  caliperNodeRegex?: RegExp;
  skipMatNames: Set<string>;
  dirtReceiverMatNames: Set<string>;
  defaultHeadlightPos: [number, number, number];
  defaultSteeringCenter: [number, number, number];
  steeringTiltRad: number;
}

const CAR_PROFILES: Record<CarModelId, CarProfile> = {
  'bmw-m4-gt3-evo': {
    url: bmwM4Gt3Url,
    format: 'glb',
    targetLengthM: 4.96,
    wheelMatNames: new Set([
      'TireBMW_M4GT3_2022_Wheel1A_3D_3DWheel1A_Material1',
      'BMWMAT_Tire_Hub1',
      'BMWMAT_Tire_Disk1',
    ]),
    rimMatNames: new Set(['BMWMAT_Tire_Hub1']),
    caliperMatNames: new Set(['BMWMAT_Tire_Brake1']),
    trimMatNames: new Set([
      'carbon_1BMW_M4_GT3_EVO_Carbon1',
      'BMWMAT_Details_EXT1',
      'BMWMAT_Details_MAT1',
      'BMWMAT_Details_Grid_01_002',
      'BMWMAT_Details_Chassis1',
      'BMWMAT_Details_Add_02',
      'BMWMAT_Details_Add_04',
      'BMWMAT_Details_Add_06',
    ]),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['BMWMAT_Lights1']),
    headlightMatNames: new Set(['BMWMAT_Lights1']),
    headlightGlassMatNames: new Set(['BMWMAT_Glass_002']),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['BMWMAT_GT3_EVO_car_paint1']),
    glassMatNames: new Set(['glassMAT_Glass1', 'BMWMAT_Glass_002', 'BMWMAT_Glass_004']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /ANC_SteeringWheel/i,
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set([
      'BMWMAT_GT3_EVO_car_paint1',
      'carbon_1BMW_M4_GT3_EVO_Carbon1',
      'BMWMAT_Details_EXT1',
      'BMWMAT_Details_MAT1',
      'BMWMAT_Details_Chassis1',
    ]),
    defaultHeadlightPos: [0.72, 0.56, 2.18],
    defaultSteeringCenter: [0.33, 0.68, 0.28],
    steeringTiltRad: 0.22,
  },
  'bmw-m4-widebody': {
    url: bmwM4WidebodyUrl,
    format: 'glb',
    targetLengthM: 4.82,
    wheelMatNames: new Set([
      'EXT_RIM.001',
      'apex_rim.001',
      'EXT_tyre.001',
      'Brake_Disk.001',
      'Brake_Disk_rear.001',
    ]),
    rimMatNames: new Set(['EXT_RIM.001', 'apex_rim.001']),
    caliperMatNames: new Set(['brake_calipers.001']),
    trimMatNames: new Set([
      'EXT_CARBON',
      'Carbonblack',
      'bBMW_M4CompetitionG82TNR0_2021Carbon1_Material1',
      'EXT_PLASTIC_GLOSS',
      'EXT_GLOSSY_PL_AO',
      'ext_pl_gloss',
      'EXT_BLACK',
    ]),
    exhaustMatNames: new Set(['EXT_EXHAUST_TITANIUM']),
    brakeLightMatNames: new Set(['EXT_TL_EMISSIVE_AO', 'EXT_tl_emissives2', 'wmit_red', 'red_glass']),
    headlightMatNames: new Set(['Lightfr', 'EXT_HL_DRL_FRONT_NM']),
    headlightGlassMatNames: new Set([
      'EXT_HL_DRL_GLASS',
      'EXT_HL_DRL_GLASS_LESS_TRANSPARENT',
      'EXT_HL_BULB_GLASS',
    ]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set([
      'bBMW_M4CompetitionG82TNR0_2021PaintTNR_Material_004',
      'bBMW_M4CompetitionG82TNR0_2021Coloured_Material_004',
    ]),
    glassMatNames: new Set([
      'glasswindshiled',
      'glass',
      'EXT_GLASS_EXTRA',
      'EXT_HL_DRL_GLASS',
      'EXT_HL_DRL_GLASS_LESS_TRANSPARENT',
      'EXT_HL_BULB_GLASS',
      'EXT_TL_GLASS',
      'EXT_TL_CLEAR_GLASS',
    ]),
    steeringMatNames: new Set([]),
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set([
      'bBMW_M4CompetitionG82TNR0_2021PaintTNR_Material_004',
      'bBMW_M4CompetitionG82TNR0_2021Coloured_Material_004',
      'EXT_CARBON',
      'Carbonblack',
      'bBMW_M4CompetitionG82TNR0_2021Carbon1_Material1',
      'EXT_PLASTIC_GLOSS',
      'EXT_BLACK',
    ]),
    defaultHeadlightPos: [0.71, 0.56, 2.15],
    defaultSteeringCenter: [0.34, 0.72, 0.30],
    steeringTiltRad: 0.24,
  },
  'aston-vantage-gt3': {
    url: astonVantageUrl,
    format: 'glb',
    targetLengthM: 4.64,
    wheelMatNames: new Set([
      'vantageVehicle_Exterior_mm_tyre1',
      'vantageVehicle_Exterior_mm_wheel1',
      'vantageVehicle_Exterior_mm_rotor1',
    ]),
    rimMatNames: new Set(['vantageVehicle_Exterior_mm_wheel1']),
    caliperMatNames: new Set(['ASTON_VANTAGE_CALIPER']),
    trimMatNames: new Set(['carbon', 'vantageVehicle_Exterior_mm_misc1', 'vantageVehicle_Exterior_mm_chassis1']),
    exhaustMatNames: new Set(['ASTON_VANTAGE_EXHAUST']),
    brakeLightMatNames: new Set(['ASTON_VANTAGE_REAR_LIGHTS']),
    headlightMatNames: new Set(['ASTON_VANTAGE_FRONT_LIGHTS']),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['vantageVehicle_Exterior_mm_ext1']),
    glassMatNames: new Set(['vantageVehicle_Exterior_mm_windows1', 'glass_surr']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /STEER/i,
    skipNodeRegex: /BONNETCAM/i,
    caliperNodeRegex: /BRAKE_CALIPER/i,
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set([
      'vantageVehicle_Exterior_mm_ext1',
      'carbon',
      'vantageVehicle_Exterior_mm_misc1',
      'vantageVehicle_Exterior_mm_chassis1',
    ]),
    defaultHeadlightPos: [0.72, 0.52, 2.04],
    defaultSteeringCenter: [0.32, 0.67, 0.28],
    steeringTiltRad: 0.22,
  },
  'aston-vulcan-amr': {
    url: astonVulcanUrl,
    format: 'glb',
    targetLengthM: 4.86,
    replaceBaseMapOnPaint: true,
    wheelMatNames: new Set(['Tyre', 'Rim', 'Brake_Disk']),
    rimMatNames: new Set(['Rim']),
    caliperMatNames: new Set(['Brake_Caliper']),
    trimMatNames: new Set([
      'Carbon1_Material',
      'Carbon1M_Material',
      'Grille1_Material',
      'Grille2_Material',
      'Grille3_Material',
      'black',
      'Base_Material',
    ]),
    exhaustMatNames: new Set(['Details', 'Mechanics']),
    brakeLightMatNames: new Set(['LightEmissive_Material', 'Light_Material']),
    headlightMatNames: new Set(['LightEmissive_Material', 'Light_Material']),
    headlightGlassMatNames: new Set(['Glass_Material']),
    displayMatNames: new Set(['hud', 'Motec_LEDS']),
    paintExteriorMatNames: new Set(['Paint_Material', 'Paint_Material3', 'Paint_Material4', 'Coloured_Material']),
    glassMatNames: new Set(['Window_Material', 'WindowInside_Material', 'Glass_Material']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /STEER_HR|STEER_WHEEL/i,
    skipNodeRegex: /RIM_BLUR|Rim_Blurred/i,
    skipMatNames: new Set(['Rim_Blurred']),
    dirtReceiverMatNames: new Set([
      'Paint_Material',
      'Paint_Material3',
      'Paint_Material4',
      'Coloured_Material',
      'Carbon1_Material',
      'Carbon1M_Material',
      'Base_Material',
    ]),
    defaultHeadlightPos: [0.74, 0.49, 2.12],
    defaultSteeringCenter: [0.32, 0.64, 0.26],
    steeringTiltRad: 0.22,
  },
  'audi-r8-lms-evo': {
    url: audiR8Url,
    format: 'glb',
    targetLengthM: 4.56,
    wheelMatNames: new Set(['R8_WHEEL', 'R8_RIM']),
    rimMatNames: new Set(['R8_RIM']),
    caliperMatNames: new Set(['R8_CALIPER']),
    trimMatNames: new Set(['R8_TRIM']),
    exhaustMatNames: new Set(['R8_EXHAUST']),
    brakeLightMatNames: new Set(['R8_BRAKE_LIGHT']),
    headlightMatNames: new Set(['R8_HEADLIGHT']),
    headlightGlassMatNames: new Set(['R8_HEADLIGHT_GLASS']),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['R8_CARPAINT']),
    glassMatNames: new Set(['R8_GLASS', 'R8_HEADLIGHT_GLASS']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /STEER_HR|STEER_WHEEL/i,
    skipNodeRegex: /RIM_BLUR|GEO_Rim_blur|DAMAGE|Trigger_/i,
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['R8_CARPAINT', 'R8_TRIM']),
    defaultHeadlightPos: [0.68, 0.50, 2.04],
    defaultSteeringCenter: [0.32, 0.63, 0.34],
    steeringTiltRad: 0.22,
  },
  'lambo-huracan-gt3-evo2': {
    url: lamboHuracanUrl,
    format: 'glb',
    targetLengthM: 4.55,
    wheelMatNames: new Set(['MI_Tyre_Flex_Dry_L.005', 'EXT_RIM.005', 'EXT_Disc.003']),
    rimMatNames: new Set(['EXT_RIM.005']),
    caliperMatNames: new Set(['EXT_CALIPER.003']),
    trimMatNames: new Set([
      'EXT_Grid_2.005',
      'EXT_Grid.005',
      'EXT_Mechanics.005',
      'EXT_Details.005',
      'EXT_Banner.005',
      'METAL_BLACK.005',
      'CHASIS_KEVLAR.005',
      'INT_Carbon.005',
      'INT_CARBON_BLACK.005',
      'INT_Carbon_Kevlar.003',
    ]),
    exhaustMatNames: new Set(['EXALTS.005', 'HURACAN_EXHAUST']),
    brakeLightMatNames: new Set(['EXT_Emissive_Light_Rear.005']),
    headlightMatNames: new Set(['EXT_Emissive_Light_Front.005', 'AUX_LIGHT.005']),
    headlightGlassMatNames: new Set(['EXT_Glass_Emissive_Front.005', 'EXT_Glass_Emissive_Rear.005']),
    displayMatNames: new Set(['DISPLAY.003', 'LED_RACELOGIC.001', 'INT_LED.001']),
    paintExteriorMatNames: new Set(['EXT_Carpaint_Inst.007']),
    glassMatNames: new Set([
      'EXT_Windows.005',
      'INT_Glass.001',
      'INT_Windshield.001',
      'INT_Windows.005',
      'EXT_Glass_Emissive_Front.005',
      'EXT_Glass_Emissive_Rear.005',
    ]),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /STEER|Steering/i,
    skipNodeRegex: /EXT_RIM_BLUR|RIM_BLUR/i,
    skipMatNames: new Set(['EXT_RIM_BLUR.003', 'WorldGridMaterial.005']),
    dirtReceiverMatNames: new Set(['EXT_Carpaint_Inst.007', 'EXT_Details.005', 'EXT_Banner.005']),
    defaultHeadlightPos: [0.71, 0.48, 1.98],
    defaultSteeringCenter: [0.32, 0.63, 0.36],
    steeringTiltRad: 0.22,
  },
  'mclaren-720s-gt3': {
    url: mclaren720sUrl,
    format: 'glb',
    targetLengthM: 4.66,
    wheelMatNames: new Set(['McLaren_720SGT3_2019_Wheel1A_3D_3DWheel1A_Material']),
    rimMatNames: new Set([]),
    caliperMatNames: new Set(['McLaren_720SGT3_2019_CallipersCalliperA_Zone_Material']),
    trimMatNames: new Set(['McLaren_720SGT3_2019Carbon1_Material', 'McLaren_720SGT3_2019Base_Material', 'McLaren_720SGT3_2019Grille1_Material']),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['McLaren_720SGT3_2019LightA_Material']),
    headlightMatNames: new Set(['McLaren_720SGT3_2019LightA_Material']),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['McLaren_720SGT3_2019Paint_Material', 'McLaren_720SGT3_2019Coloured_Material']),
    glassMatNames: new Set(['McLaren_720SGT3_2019Window_Material', 'McLaren_720SGT3_2019WindowInside_Material']),
    steeringMatNames: new Set([]),
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['McLaren_720SGT3_2019Paint_Material', 'McLaren_720SGT3_2019Coloured_Material', 'McLaren_720SGT3_2019Carbon1_Material']),
    defaultHeadlightPos: [0.72, 0.50, 2.04],
    defaultSteeringCenter: [0.32, 0.63, 0.34],
    steeringTiltRad: 0.22,
  },
  'acura-nsx-gt3': {
    url: acuraNsxUrl,
    format: 'glb',
    targetLengthM: 4.61,
    yawAdjustRad: Math.PI,
    wheelMatNames: new Set(['Vehicle_Exterior_mm_tyre', 'Vehicle_Exterior_mm_wheel', 'Vehicle_Exterior_mm_rotor']),
    rimMatNames: new Set(['Vehicle_Exterior_mm_wheel']),
    caliperMatNames: new Set(['FORZA_CALIPER']),
    trimMatNames: new Set(['Vehicle_Exterior_mm_misc', 'Vehicle_Exterior_mm_chassis']),
    exhaustMatNames: new Set(['FORZA_EXHAUST']),
    brakeLightMatNames: new Set(['FORZA_REAR_LIGHTS']),
    headlightMatNames: new Set(['FORZA_FRONT_LIGHTS']),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['Vehicle_Exterior_mm_ext']),
    glassMatNames: new Set(['Vehicle_Exterior_mm_windows']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /STEER/i,
    skipNodeRegex: /DAMAGE|BROKEN|Trigger|RIM_BLUR/i,
    caliperNodeRegex: /CALIPER/i,
    skipMatNames: new Set(['Vehicle_Exterior_mm_scratches']),
    dirtReceiverMatNames: new Set(['Vehicle_Exterior_mm_ext', 'Vehicle_Exterior_mm_misc']),
    defaultHeadlightPos: [0.71, 0.49, 2.02],
    defaultSteeringCenter: [0.32, 0.63, 0.34],
    steeringTiltRad: 0.22,
  },
  'toyota-gt-one-ts020': {
    url: toyotaGtOneUrl,
    format: 'glb',
    targetLengthM: 4.84,
    wheelMatNames: new Set([
      'GTshared_tires_racing1',
      'rim_Color',
      'GTONE_RIM',
      'GTONE_WHEEL_DETAIL',
      'GTcar_Toyota_GT_One_Road_Version_emissive_mesh1',
    ]),
    rimMatNames: new Set(['rim_Color', 'GTONE_RIM']),
    caliperMatNames: new Set(['GTshared_calipers_05']),
    trimMatNames: new Set([
      'GTMaterialcar_Toyota_GT_One_Road_Version_tiled_carbon1',
      'GTMaterialcar_Toyota_GT_One_Road_Version_tiled_mesh1',
      'GTshared_underside_chassis1',
      'GTcar_Toyota_GT_One_Road_Version_details1',
      'GTcar_Toyota_GT_One_Road_Version_details_normal1',
    ]),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['DET_emiss', 'Det_N_Emiss']),
    headlightMatNames: new Set(['DET_emiss', 'Det_N_Emiss']),
    headlightGlassMatNames: new Set(['light_glass']),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['GTcar_Toyota_GT_One_Road_Version_carpaint1', 'GTcar_Toyota_GT_One_Road_Version_carpaint2']),
    glassMatNames: new Set(['GTcar_Toyota_GT_One_Road_Version_glass1', 'light_glass', 'orange_glass', 'red_glass']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /steering_wheel/i,
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['GTcar_Toyota_GT_One_Road_Version_carpaint1', 'GTcar_Toyota_GT_One_Road_Version_carpaint2']),
    defaultHeadlightPos: [0.72, 0.46, 2.12],
    defaultSteeringCenter: [0.32, 0.58, 0.34],
    steeringTiltRad: 0.20,
  },
  'mazda-furai': {
    url: mazdaFuraiUrl,
    format: 'glb',
    targetLengthM: 4.56,
    wheelMatNames: new Set(['tyre_fx', 'outer_rim', 'inner_rim', 'rotor']),
    rimMatNames: new Set(['outer_rim', 'inner_rim']),
    caliperMatNames: new Set(['caliper']),
    trimMatNames: new Set(['carbon_fiber', 'matte_colors', 'black', 'plastic', 'plastic2', 'plastic3', 'undercarriage', 'wheel_black', 'frame']),
    exhaustMatNames: new Set(['ext_chrome', 'rear_chrome']),
    brakeLightMatNames: new Set(['tail_light_lod0', 'redon']),
    headlightMatNames: new Set(['head_light']),
    headlightGlassMatNames: new Set(['detail_glass_clear']),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['body']),
    glassMatNames: new Set(['window', 'glass', 'black_glass', 'detail_glass_clear']),
    steeringMatNames: new Set([]),
    skipMatNames: new Set(['windirt']),
    dirtReceiverMatNames: new Set(['body', 'carbon_fiber', 'matte_colors']),
    defaultHeadlightPos: [0.72, 0.44, 2.02],
    defaultSteeringCenter: [0.0, 0.58, 0.34],
    steeringTiltRad: 0.20,
  },
  'bmw-m-hybrid-v8': {
    url: bmwMHybridV8Url,
    format: 'glb',
    targetLengthM: 4.99,
    wheelMatNames: new Set(['EXT_Tyre', 'RIMS', 'brake_disk', 'Wheels']),
    rimMatNames: new Set(['RIMS', 'Wheels']),
    caliperMatNames: new Set(['caliper']),
    trimMatNames: new Set(['carbon', 'Carbon', 'BLACK', 'ext_matt', 'Bottom', 'main', 'MIRRORS']),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['rearlights']),
    headlightMatNames: new Set(['lighting_grill', 'MI_Hybrid_Light', 'GLOW', 'GLOW.001']),
    headlightGlassMatNames: new Set(['963_CLEARLED']),
    displayMatNames: new Set(['DISPLAY', 'DISPLAY2', 'shift_lights', 'kers_green', 'kers_yellow', 'kers_red']),
    paintExteriorMatNames: new Set(['Body', 'Body.001']),
    glassMatNames: new Set(['TRANSPARENTE', 'Glass', 'glass', '963_CLEARLED', 'DISPLAY_TRANSPARENTE']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /^(sw_|963_sw_)/i,
    skipNodeRegex: /EXT_Rim_Blur|RIM_BLUR/i,
    skipMatNames: new Set(['EXT_Rim_Blur', 'EXT_Rim_Blur_2']),
    dirtReceiverMatNames: new Set(['Body', 'Body.001', 'carbon']),
    defaultHeadlightPos: [0.74, 0.46, 2.18],
    defaultSteeringCenter: [0.15, 0.61, 0.62],
    steeringTiltRad: 0.20,
  },
  'cadillac-v-series-r': {
    url: cadillacVSeriesUrl,
    format: 'glb',
    targetLengthM: 4.99,
    replaceBaseMapOnPaint: true,
    wheelMatNames: new Set(['EXT_RIM', 'EXT_Tyres', 'EXT_RIM_DECALS', 'BRAKE_DISC']),
    rimMatNames: new Set(['EXT_RIM', 'EXT_RIM_DECALS']),
    caliperMatNames: new Set(['EXT_CALIPER']),
    trimMatNames: new Set([
      'CHASSIS_CARBON',
      'CHASSIS_MISC',
      'EXT_DECALS',
      'EXT_GRILL',
      'EXT_WINDOWS_BLACK',
      'MIRROR',
    ]),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['LIGHTS', 'LIGHTS_POS']),
    headlightMatNames: new Set(['LIGHTS', 'LIGHTS_POS']),
    headlightGlassMatNames: new Set(['LIGHTS_GLASS']),
    displayMatNames: new Set(['STEER_DISPLAY', 'DISPLAY_GLASS', 'LEDGREEN', 'LEDYELLOW', 'LEDRED']),
    paintExteriorMatNames: new Set(['CARPAINT']),
    glassMatNames: new Set(['EXT_GLASS', 'LIGHTS_GLASS']),
    steeringMatNames: new Set(['STEER_DECALS', 'STEER_BUTTON', 'STEER_DISPLAY', 'STEER_CARBON', 'STEER_COLOR']),
    steeringNodeRegex: /STEER_HR|STEER_DECALS|STEER_BUTTONS|STEER_GLASS|STEER_CARBON|STEER_COLOR/i,
    skipNodeRegex: /GEO_RIM_STATIC|RIM_BLUR|DAMAGE/i,
    caliperNodeRegex: /GEO_CALIPER/i,
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['CARPAINT', 'CHASSIS_CARBON', 'EXT_DECALS']),
    defaultHeadlightPos: [0.74, 0.46, 2.18],
    defaultSteeringCenter: [0.22, 0.56, 0.38],
    steeringTiltRad: 0.20,
  },
  'koenigsegg-agera-rs': {
    url: koenigseggAgeraUrl,
    format: 'glb',
    targetLengthM: 4.29,
    wheelMatNames: new Set(['Koenigsegg_AgeraRSRewardRecycled_2017_Wheel1A_3D_3DWheel1A_Material']),
    rimMatNames: new Set([]),
    caliperMatNames: new Set([
      'Koenigsegg_AgeraRSRewardRecycled_2017CalliperGloss_Material',
      'Koenigsegg_AgeraRSRewardRecycled_2017CalliperGloss_Material_0',
    ]),
    trimMatNames: new Set([
      'Koenigsegg_AgeraRSRewardRecycled_2017Carbon1_Material',
      'Koenigsegg_AgeraRSRewardRecycled_2017Base_Material',
      'Koenigsegg_AgeraRSRewardRecycled_2017Grille1A_Material',
      'Koenigsegg_AgeraRSRewardRecycled_2017Grille2A_Material',
      'Koenigsegg_AgeraRSRewardRecycled_2017Grille3A_Material',
      'phong3',
    ]),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['phong1']),
    headlightMatNames: new Set(['phong1']),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['Koenigsegg_AgeraRSRewardRecycled_2017Paint_Material', 'Koenigsegg_AgeraRSRewardRecycled_2017Coloured_Material']),
    glassMatNames: new Set(['Koenigsegg_AgeraRSRewardRecycled_2017Window_Material']),
    steeringMatNames: new Set([]),
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['Koenigsegg_AgeraRSRewardRecycled_2017Paint_Material', 'Koenigsegg_AgeraRSRewardRecycled_2017Coloured_Material', 'Koenigsegg_AgeraRSRewardRecycled_2017Carbon1_Material']),
    defaultHeadlightPos: [0.71, 0.50, 1.94],
    defaultSteeringCenter: [0.32, 0.64, 0.30],
    steeringTiltRad: 0.22,
  },
  'bugatti-bolide': {
    url: bugattiBolideUrl,
    format: 'glb',
    targetLengthM: 4.76,
    yawAdjustRad: Math.PI,
    wheelMatNames: new Set(['Vehicle_Exterior_mm_tyre', 'Vehicle_Exterior_mm_wheel', 'Vehicle_Exterior_mm_rotor']),
    rimMatNames: new Set(['Vehicle_Exterior_mm_wheel']),
    caliperMatNames: new Set(['FORZA_CALIPER']),
    trimMatNames: new Set(['Vehicle_Exterior_mm_misc', 'Vehicle_Exterior_mm_chassis']),
    exhaustMatNames: new Set(['FORZA_EXHAUST']),
    brakeLightMatNames: new Set(['FORZA_REAR_LIGHTS']),
    headlightMatNames: new Set(['FORZA_FRONT_LIGHTS']),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['Vehicle_Exterior_mm_ext']),
    glassMatNames: new Set(['Vehicle_Exterior_mm_windows']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /STEER/i,
    skipNodeRegex: /DAMAGE|BROKEN|Trigger|RIM_BLUR/i,
    caliperNodeRegex: /CALIPER/i,
    skipMatNames: new Set(['Vehicle_Exterior_mm_scratches']),
    dirtReceiverMatNames: new Set(['Vehicle_Exterior_mm_ext', 'Vehicle_Exterior_mm_misc']),
    defaultHeadlightPos: [0.74, 0.45, 2.10],
    defaultSteeringCenter: [0.30, 0.58, 0.34],
    steeringTiltRad: 0.20,
  },
  'de-tomaso-p900': {
    url: deTomasoP900Url,
    format: 'glb',
    targetLengthM: 4.64,
    wheelMatNames: new Set(['dtP900shared_tire_racing1', 'P900_RIM', 'P900_WHEEL_DETAIL', 'P900_DISC']),
    rimMatNames: new Set(['P900_RIM']),
    caliperMatNames: new Set(['dtP900shared_calipers_05']),
    trimMatNames: new Set([
      'dtP900car_DeTomaso_P900_tiled_carbon1',
      'dtP900shared_underside_chassis1',
      'dtP900car_DeTomaso_P900_details1',
      'dtP900car_DeTomaso_P900_details_normal1',
      'dtP900car_DeTomaso_P900_grid1',
    ]),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['emiss_light', 'dtP900car_DeTomaso_P900_emissive_brakesonly1']),
    headlightMatNames: new Set(['emiss_light']),
    headlightGlassMatNames: new Set(['Light_glass']),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['dtP900car_DeTomaso_P900_carpaint1']),
    glassMatNames: new Set(['dtP900car_DeTomaso_P900_glass1', 'Light_glass', 'red_glass']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /steering_wheel/i,
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['dtP900car_DeTomaso_P900_carpaint1', 'dtP900car_DeTomaso_P900_tiled_carbon1']),
    defaultHeadlightPos: [0.71, 0.48, 2.04],
    defaultSteeringCenter: [0.31, 0.62, 0.34],
    steeringTiltRad: 0.22,
  },
  'subaru-wrx-sti': {
    url: subaruWrxUrl,
    format: 'glb',
    targetLengthM: 4.60,
    replaceBaseMapOnPaint: true,
    wheelMatNames: new Set([
      'TNRRims_89A18NaTireBlur_Material',
      'TNRRims_89A18NaTNR_Rim89A_Material',
      'TNRRims_89A18NaBrakeDisc_ForgedDrilled_Material',
    ]),
    rimMatNames: new Set(['TNRRims_89A18NaTNR_Rim89A_Material']),
    caliperMatNames: new Set(['subSubaru_WRXSTITNR0_2018_CallipersCalliperGloss_Material1']),
    trimMatNames: new Set([
      'subSubaru_WRXSTITNR0_2018Carbon1M_Material1',
      'subSubaru_WRXSTITNR0_2018Base_Material1',
      'subSubaru_WRXSTITNR0_2018Grille1A_Material1',
      'subSubaru_WRXSTITNR0_2018Grille2A_Material1',
      'subSubaru_WRXSTITNR0_2018Grille4A_Material1',
      'subSubaru_WRXSTITNR0_2018Grille8A_Material1',
      'subSubaru_WRXSTITNR0_2018Grille9A_Material1',
      'subSubaru_WRXSTITNR0_2018Hood0a_Grille1_Material1',
    ]),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['subSubaru_WRXSTITNR0_2018LightA_Material1']),
    headlightMatNames: new Set(['subSubaru_WRXSTITNR0_2018LightA_Material1']),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set([
      'subSubaru_WRXSTITNR0_2018PaintTNR_Material1',
      'subSubaru_WRXSTITNR0_2018Coloured_Material1',
    ]),
    glassMatNames: new Set(['subSubaru_WRXSTITNR0_2018Window_Material1', 'glass_surr', 'glass_light']),
    steeringMatNames: new Set([]),
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set([
      'subSubaru_WRXSTITNR0_2018PaintTNR_Material1',
      'subSubaru_WRXSTITNR0_2018Coloured_Material1',
      'subSubaru_WRXSTITNR0_2018Carbon1M_Material1',
    ]),
    defaultHeadlightPos: [0.70, 0.58, 2.02],
    defaultSteeringCenter: [0.33, 0.72, 0.28],
    steeringTiltRad: 0.24,
  },
  'honda-s2000': {
    url: hondaS2000Url,
    format: 'glb',
    targetLengthM: 4.14,
    replaceBaseMapOnPaint: true,
    wheelMatNames: new Set([
      'w_TNRRims_91A18NaTireBlur_Material1',
      'w_TNRRims_91A18NaTNR_Rim91A_Material1',
      'w_TNRRims_91A18NaBrakeDisc_ForgedDrilled_Material1',
    ]),
    rimMatNames: new Set(['w_TNRRims_91A18NaTNR_Rim91A_Material1']),
    caliperMatNames: new Set(['hHonda_S2000TNR0_2001_CallipersCalliperGloss_Material1']),
    trimMatNames: new Set([
      'hHonda_S2000TNR0_2001Carbon1_Material1',
      'hHonda_S2000TNR0_2001Base_Material1',
      'hHonda_S2000TNR0_2001Grille7A_Material1',
      'hHonda_S2000TNR0_2001Grille8A_Material1',
      'hHonda_S2000TNR0_2001Grille9A_Material1',
    ]),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['hHonda_S2000TNR0_2001LightA_Material1']),
    headlightMatNames: new Set(['hHonda_S2000TNR0_2001LightA_Material1']),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set([
      'hHonda_S2000TNR0_2001PaintTNR_Material1',
      'hHonda_S2000TNR0_2001Coloured_Material1',
    ]),
    glassMatNames: new Set(['hHonda_S2000TNR0_2001Window_Material1', 'glass_surr']),
    steeringMatNames: new Set([]),
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set([
      'hHonda_S2000TNR0_2001PaintTNR_Material1',
      'hHonda_S2000TNR0_2001Coloured_Material1',
      'hHonda_S2000TNR0_2001Carbon1_Material1',
    ]),
    defaultHeadlightPos: [0.66, 0.52, 1.84],
    defaultSteeringCenter: [0.32, 0.66, 0.24],
    steeringTiltRad: 0.22,
  },
  'vw-polo-r-wrx': {
    url: vwPoloRUrl,
    format: 'glb',
    targetLengthM: 4.25,
    wheelMatNames: new Set(['POLO_TIRE', 'mat_8']),
    rimMatNames: new Set(['mat_8']),
    caliperMatNames: new Set([]),
    trimMatNames: new Set(['POLO_CHASSIS', 'mat_0', 'mat_1', 'mat_2', 'mat_4', 'mat_5', 'mat_6', 'mat_9']),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set([]),
    headlightMatNames: new Set([]),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['mat_3']),
    glassMatNames: new Set(['mat_10', 'mat_11']),
    steeringMatNames: new Set([]),
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['mat_3', 'POLO_CHASSIS', 'mat_0']),
    defaultHeadlightPos: [0.68, 0.58, 1.82],
    defaultSteeringCenter: [0.32, 0.74, 0.26],
    steeringTiltRad: 0.24,
  },
  'mercedes-amg-gt3-evo': {
    url: mercedesAmgGt3Url,
    format: 'glb',
    targetLengthM: 4.80,
    wheelMatNames: new Set(['AMG_WHEEL', 'AMG_RIM']),
    rimMatNames: new Set(['AMG_RIM']),
    caliperMatNames: new Set(['AMG_CALIPER']),
    trimMatNames: new Set(['AMG_TRIM']),
    exhaustMatNames: new Set(['AMG_EXHAUST']),
    brakeLightMatNames: new Set(['AMG_BRAKE_LIGHT']),
    headlightMatNames: new Set(['AMG_HEADLIGHT']),
    headlightGlassMatNames: new Set(['AMG_HEADLIGHT_GLASS']),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['AMG_CARPAINT']),
    glassMatNames: new Set(['AMG_GLASS', 'AMG_HEADLIGHT_GLASS']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /INT_Steer|STEER_HR/i,
    skipNodeRegex: /COCKPIT_LR|STEER_LR|Caliperdecal|RIM_BLUR/i,
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['AMG_CARPAINT', 'AMG_TRIM']),
    defaultHeadlightPos: [0.72, 0.54, 2.12],
    defaultSteeringCenter: [0.35, 0.66, 0.34],
    steeringTiltRad: 0.22,
  },
  'mclaren-f1-gtr-longtail': {
    url: mclarenF1GtrUrl,
    format: 'glb',
    targetLengthM: 4.92,
    replaceBaseMapOnPaint: true,
    wheelMatNames: new Set(['generic_tread', 'generic_tyre', 'mclaren_f1gtr_wheel', 'mclaren_f1gtr_disc']),
    rimMatNames: new Set(['mclaren_f1gtr_wheel']),
    caliperMatNames: new Set(['F1GTR_CALIPER']),
    trimMatNames: new Set([
      'mclaren_f1gtr_paint_carbon_matte',
      'generic_carbon_matte_2',
      'generic_carbon',
      'mclaren_f1gtr_misc',
      'mclaren_f1gtr_badges',
      'mclaren_f1gtr_misc_skin',
    ]),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['lightB', 'lightBackColor', 'lightBSmall', 'mclaren_f1gtr_taillight', 'mclaren_f1gtr_lights']),
    headlightMatNames: new Set(['lightHead', 'mclaren_f1gtr_lights', 'mclaren_f1gtr_taillight']),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['mclaren_f1gtr_paint']),
    glassMatNames: new Set(['mclaren_f1gtr_windows', 'mclaren_f1gtr_windows2']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /steeringwheel/i,
    skipNodeRegex: /_blur_|RIM_BLUR/i,
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['mclaren_f1gtr_paint', 'mclaren_f1gtr_paint_carbon_matte', 'generic_carbon_matte_2']),
    defaultHeadlightPos: [0.70, 0.46, 2.14],
    defaultSteeringCenter: [0.0, 0.58, 0.34],
    steeringTiltRad: 0.20,
  },
  'ferrari-f40-lbwk': {
    url: ferrariF40LbwkUrl,
    format: 'glb',
    targetLengthM: 4.43,
    wheelMatNames: new Set(['Tires', 'material', 'BrakeDisc1', 'BrakeDisc2']),
    rimMatNames: new Set(['material']),
    caliperMatNames: new Set(['Brake', 'Brembo']),
    trimMatNames: new Set(['Carbon', 'Black', 'Grid', 'Mechanics', 'Logos', 'Springs']),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['RearLights']),
    headlightMatNames: new Set(['Headlight', 'hl inside']),
    headlightGlassMatNames: new Set(['Glass.front', 'll shell']),
    displayMatNames: new Set(['Dials']),
    paintExteriorMatNames: new Set(['Paint']),
    glassMatNames: new Set(['Windows', 'Glass', 'GlassBack', 'Glass.front', 'll shell', 'RearLightsGlass']),
    steeringMatNames: new Set([]),
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['Paint', 'Carbon', 'Black']),
    defaultHeadlightPos: [0.72, 0.48, 1.98],
    defaultSteeringCenter: [0.32, 0.62, 0.30],
    steeringTiltRad: 0.22,
  },
  'ferrari-250-testa-rossa': {
    url: ferrari250TrUrl,
    format: 'glb',
    targetLengthM: 4.05,
    wheelMatNames: new Set([
      'cobratire_fx',
      'inner_rim',
      'outer_rim',
      'rim',
      'chrome_rim',
      'drum',
      'wheel_black',
      'wheel_emblem',
    ]),
    rimMatNames: new Set(['rim', 'outer_rim', 'inner_rim', 'chrome_rim']),
    caliperMatNames: new Set([]),
    trimMatNames: new Set([
      'black',
      'black.001',
      'frame',
      'grille1_alpha',
      'misc',
      'matte_colors',
      'undercarriage',
      'rubber_trim',
      'weatherstrip',
      'badge',
      'emblem',
    ]),
    exhaustMatNames: new Set(['chrome', 'EXT_metal_chrome']),
    brakeLightMatNames: new Set(['tail_light_lod0', 'detail_glass_red']),
    headlightMatNames: new Set(['head_light']),
    headlightGlassMatNames: new Set(['headlight glass', 'headlgnt detail glass']),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['body']),
    glassMatNames: new Set(['window', 'headlight glass', 'headlgnt detail glass', 'detail_glass_red']),
    steeringMatNames: new Set([]),
    steeringNodeRegex: /STEER_HR|steering_wheel/i,
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['body', 'undercarriage', 'black']),
    defaultHeadlightPos: [0.64, 0.52, 1.80],
    defaultSteeringCenter: [0.30, 0.64, 0.22],
    steeringTiltRad: 0.24,
  },
  'mazda-787b': {
    url: mazda787bUrl,
    format: 'glb',
    targetLengthM: 4.78,
    yawAdjustRad: Math.PI,
    opaqueNonGlass: true,
    wheelMatNames: new Set(['Mesh1Mtl.001', 'Mesh24Mtl.001']),
    rimMatNames: new Set(['Mesh1Mtl.001']),
    caliperMatNames: new Set([]),
    trimMatNames: new Set([
      'Mesh2Mtl.001',
      'Mesh3Mtl.001',
      'Mesh4Mtl.001',
      'Mesh5Mtl.001',
      'Mesh7Mtl.001',
      'Mesh16Mtl.001',
      'Mesh20Mtl.001',
      'Mesh22Mtl.001',
    ]),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set([]),
    headlightMatNames: new Set([]),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['Mesh9Mtl.001', 'Mesh10Mtl.001']),
    glassMatNames: new Set(['Mesh8Mtl.001']),
    steeringMatNames: new Set([]),
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['Mesh9Mtl.001', 'Mesh10Mtl.001', 'Mesh5Mtl.001']),
    defaultHeadlightPos: [0.70, 0.44, 2.12],
    defaultSteeringCenter: [-0.22, 0.59, 0.71],
    steeringTiltRad: 0.20,
  },
  'honda-ra272-f1': {
    url: hondaRa272Url,
    format: 'glb',
    targetLengthM: 3.86,
    wheelMatNames: new Set(['EXT_tyre.001', 'EXT_rim.001', 'EXT_brakes_001.001']),
    rimMatNames: new Set(['EXT_rim.001']),
    caliperMatNames: new Set([]),
    trimMatNames: new Set([
      'BLACK.001',
      'BLACK_METAL.001',
      'EXT_carparts_001.001',
      'EXT_MechParts_NM.001',
      'RADIATOR.001',
      'honda_wheels_susp.001',
      'honda_wheel_spindle.001',
      'honda_suspen.001',
      'susp_light.001',
      'supension_light.001',
      'rsusphon.001',
      'f312b_mech.001',
      't73_wheel_spring2.001',
      't73_wheel_spindle.001',
      'duga.001',
      'fer36vpoddon.001',
      'ho272engine.001',
      'Material_#1380.001',
    ]),
    exhaustMatNames: new Set(['hondara272exhausts.001', 'hondapipes.001']),
    brakeLightMatNames: new Set([]),
    headlightMatNames: new Set([]),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set(['ARROW_RPM.001', 'ARROW_OTHER.001']),
    paintExteriorMatNames: new Set([
      'wccarbody.001',
      'wccarbody_noshine.001',
      'ho272white.001',
      'ho272fondo.001',
      'wcwing.001',
      'wcextra1.001',
      'wcextra2.001',
      'wcextra4.001',
      'wcextra5.001',
    ]),
    glassMatNames: new Set(['wind.001', 'wind_in.001']),
    steeringMatNames: new Set(['STEERING_WHEEL_INSIDE.001', 'hondasw.001', 'hondasectr.001', 'hondalogo.001']),
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['wccarbody.001', 'wccarbody_noshine.001', 'ho272white.001', 'ho272fondo.001']),
    defaultHeadlightPos: [0.36, 0.42, 1.72],
    defaultSteeringCenter: [0.0, 0.50, 0.22],
    steeringTiltRad: 0.22,
  },
  'vw-golf-gti-mk2': {
    url: vwGolfGtiMk2Url,
    format: 'glb',
    targetLengthM: 3.99,
    wheelMatNames: new Set(['tire', 'material', 'disk']),
    rimMatNames: new Set(['material']),
    caliperMatNames: new Set(['breaks']),
    trimMatNames: new Set(['chassis', 'plasti', 'badges', 'red_mat']),
    exhaustMatNames: new Set(['metal']),
    brakeLightMatNames: new Set(['light_R']),
    headlightMatNames: new Set(['light_R']),
    headlightGlassMatNames: new Set([]),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set(['carpaint']),
    glassMatNames: new Set(['glass', 'glass_surr', 'orange_glass', 'red_glass']),
    steeringMatNames: new Set([]),
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set(['carpaint', 'chassis', 'plasti']),
    defaultHeadlightPos: [0.64, 0.56, 1.82],
    defaultSteeringCenter: [0.32, 0.72, 0.24],
    steeringTiltRad: 0.25,
  },
  'toyota-ae86-trueno': {
    url: toyotaAe86Url,
    format: 'glb',
    targetLengthM: 4.21,
    yawAdjustRad: -Math.PI / 2,
    wheelMatNames: new Set(['Material', 'MAT_Tire_Hub.078', 'MAT_Tire_Disk.104']),
    rimMatNames: new Set(['MAT_Tire_Hub.078']),
    caliperMatNames: new Set(['MAT_Tire_Brake.280']),
    trimMatNames: new Set([
      'MAT_Details_MAT.394',
      'MAT_Details_MAT.378',
      'MAT_Details_MAT.373',
      'MAT_Details_MAT.384',
      'MAT_Details_MAT.383',
      'MAT_Details_MAT.390',
      'MAT_Details_Chassis_0000.035',
      'MAT_Details_Chassis_0000.030',
      'MAT_Details_EXT.244',
      'MAT_Details_EXT.239',
      'MAT_Details_EXT.234',
      'MAT_Details_INT.029',
    ]),
    exhaustMatNames: new Set([]),
    brakeLightMatNames: new Set(['MAT_Lights.197']),
    headlightMatNames: new Set(['MAT_Lights.185', 'MAT_Lights.191']),
    headlightGlassMatNames: new Set(['MAT_Glass.206', 'MAT_Glass.210']),
    displayMatNames: new Set([]),
    paintExteriorMatNames: new Set([
      'MAT__AE86_Carpaint.100',
      'MAT__AE86_Carpaint.090',
      'MAT__AE86_Carpaint.058',
      'MAT__AE86_Carpaint.036',
      'MAT__AE86_Carpaint.067',
      'MAT__AE86_Carpaint.084',
    ]),
    glassMatNames: new Set(['MAT_Glass.202', 'MAT_Glass.214', 'MAT_Glass.206', 'MAT_Glass.210']),
    steeringMatNames: new Set([]),
    skipMatNames: new Set([]),
    dirtReceiverMatNames: new Set([
      'MAT__AE86_Carpaint.090',
      'MAT__AE86_Carpaint.058',
      'MAT__AE86_Carpaint.036',
      'MAT__AE86_Carpaint.067',
      'MAT__AE86_Carpaint.084',
      'MAT_Details_MAT.394',
      'MAT_Details_MAT.378',
    ]),
    defaultHeadlightPos: [0.64, 0.50, 1.88],
    defaultSteeringCenter: [-0.32, 0.64, 0.24],
    steeringTiltRad: 0.24,
  },
};

interface CarShaderUniforms {
  uDesaturateMap: { value: number };
  uUseWrap: { value: number };
  uHasDoorDecal: { value: number };
  uWrapTex: { value: THREE.Texture };
}

function attachCarMaterialShader(
  mat: THREE.MeshStandardMaterial,
  dirtUniforms: { uDirtLevel: { value: number }; uWetness: { value: number } },
  dirtIntensity: number,
  options: {
    isPaintMain?: boolean;
    initialDesaturate?: number;
    fallbackWrapTex: THREE.Texture;
    wrapUniforms?: {
      uUseWrap: { value: number };
      uHasDoorDecal: { value: number };
      uWrapTex: { value: THREE.Texture };
    };
  },
) {
  const matUniforms: CarShaderUniforms = {
    uDesaturateMap: { value: options.initialDesaturate ?? 0 },
    uUseWrap: options.wrapUniforms ? options.wrapUniforms.uUseWrap : { value: 0 },
    uHasDoorDecal: options.wrapUniforms ? options.wrapUniforms.uHasDoorDecal : { value: 0 },
    uWrapTex: options.wrapUniforms ? options.wrapUniforms.uWrapTex : { value: options.fallbackWrapTex },
  };
  mat.userData.carShaderUniforms = matUniforms;

  const isPaintMain = Boolean(options.isPaintMain);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDirtLevel = dirtUniforms.uDirtLevel;
    shader.uniforms.uWetness = dirtUniforms.uWetness;
    shader.uniforms.uDirtScale = { value: dirtIntensity };
    shader.uniforms.uDesaturateMap = matUniforms.uDesaturateMap;
    shader.uniforms.uUseWrap = matUniforms.uUseWrap;
    shader.uniforms.uHasDoorDecal = matUniforms.uHasDoorDecal;
    shader.uniforms.uWrapTex = matUniforms.uWrapTex;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCarLocalPos;
        varying vec3 vCarLocalNormal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vCarLocalPos = position;
        vCarLocalNormal = normalize(normal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uDirtLevel;
        uniform float uWetness;
        uniform float uDirtScale;
        uniform float uDesaturateMap;
        uniform float uUseWrap;
        uniform float uHasDoorDecal;
        uniform sampler2D uWrapTex;
        varying vec3 vCarLocalPos;
        varying vec3 vCarLocalNormal;

        float carHash31(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        float carNoise3(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(
              mix(carHash31(i + vec3(0,0,0)), carHash31(i + vec3(1,0,0)), f.x),
              mix(carHash31(i + vec3(0,1,0)), carHash31(i + vec3(1,1,0)), f.x),
              f.y
            ),
            mix(
              mix(carHash31(i + vec3(0,0,1)), carHash31(i + vec3(1,0,1)), f.x),
              mix(carHash31(i + vec3(0,1,1)), carHash31(i + vec3(1,1,1)), f.x),
              f.y
            ),
            f.z
          );
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D( map, vMapUv );
          if ( uDesaturateMap > 0.5 ) {
            float texPeak = max( sampledDiffuseColor.r, max( sampledDiffuseColor.g, sampledDiffuseColor.b ) );
            float texLum = dot( sampledDiffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
            float neutralAo = mix( 0.58, 1.0, smoothstep( 0.01, 0.36, max( texPeak, texLum ) ) );
            diffuseColor.rgb *= neutralAo;
          } else {
            diffuseColor *= sampledDiffuseColor;
          }
        #endif
        if ( uUseWrap > 0.5 ) {
          vec2 topUv = vec2(
            clamp( vCarLocalPos.x * 0.46 + 0.5, 0.002, 0.998 ),
            clamp( 0.5 + vCarLocalPos.z * 0.21, 0.002, 0.998 )
          );
          vec4 wrapSample = texture2D( uWrapTex, topUv );
          if ( uHasDoorDecal > 0.5 && abs( vCarLocalNormal.x ) > 0.58 && vCarLocalPos.y > 0.24 && vCarLocalPos.y < 0.84 && abs( vCarLocalPos.z ) < 0.68 ) {
            vec2 doorUv = vec2(
              clamp( 0.5 - sign( vCarLocalNormal.x ) * vCarLocalPos.z * 0.55, 0.002, 0.998 ),
              clamp( ( vCarLocalPos.y - 0.18 ) * 1.32, 0.002, 0.998 )
            );
            wrapSample = texture2D( uWrapTex, doorUv );
          }
          diffuseColor.rgb *= wrapSample.rgb;
        }
        float carDirtMask = 0.0;
        if (uDirtLevel > 0.002 && uDirtScale > 0.001) {
          float nCoarse = carNoise3(vCarLocalPos * vec3(3.4, 4.2, 2.8));
          float nFine = carNoise3(vCarLocalPos * 24.0);
          float nNoise = nCoarse * 0.68 + nFine * 0.32;
          float archBias = 0.55 + 0.45 * smoothstep(0.35, 1.55, abs(vCarLocalPos.z));
          float lowerSplash = smoothstep(0.66, 0.08, vCarLocalPos.y) * archBias;
          float rearWake = smoothstep(0.4, -2.15, vCarLocalPos.z) * smoothstep(0.88, 0.16, vCarLocalPos.y);
          float hoodFilm = 0.24 * smoothstep(-0.2, 0.85, vCarLocalPos.y);
          float coverage = clamp(max(max(lowerSplash, rearWake), hoodFilm) * (0.45 + nNoise * 0.95), 0.0, 1.0);
          carDirtMask = clamp(coverage * uDirtLevel * uDirtScale, 0.0, 0.88);
          vec3 dryDust = mix(vec3(0.42, 0.34, 0.24), vec3(0.28, 0.23, 0.17), nFine);
          vec3 wetMud = mix(vec3(0.16, 0.13, 0.10), vec3(0.09, 0.07, 0.05), nCoarse);
          vec3 dirtRgb = mix(dryDust, wetMud, uWetness * 0.85);
          diffuseColor.rgb = mix(diffuseColor.rgb, dirtRgb, carDirtMask);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.92, carDirtMask);`,
      );
  };
  mat.customProgramCacheKey = () =>
    `aurelia-car-mat-v3-${dirtIntensity.toFixed(2)}-${isPaintMain ? 'paint' : 'std'}`;
}

type QuadrantKey = 'FL' | 'FR' | 'RL' | 'RR';

function extractQuadrantGeometry(
  sourceGeo: THREE.BufferGeometry,
  worldMatrix: THREE.Matrix4,
): Record<QuadrantKey, THREE.BufferGeometry | null> {
  const nonIndexed = sourceGeo.index ? sourceGeo.toNonIndexed() : sourceGeo.clone();
  nonIndexed.applyMatrix4(worldMatrix);

  const posAttr = nonIndexed.getAttribute('position');
  const normAttr = nonIndexed.getAttribute('normal');
  const uvAttr = nonIndexed.getAttribute('uv');

  if (!posAttr) {
    nonIndexed.dispose();
    return { FL: null, FR: null, RL: null, RR: null };
  }

  const buckets: Record<
    QuadrantKey,
    { pos: number[]; norm: number[]; uv: number[] }
  > = {
    FL: { pos: [], norm: [], uv: [] },
    FR: { pos: [], norm: [], uv: [] },
    RL: { pos: [], norm: [], uv: [] },
    RR: { pos: [], norm: [], uv: [] },
  };

  const vertCount = posAttr.count;
  for (let i = 0; i + 2 < vertCount; i += 3) {
    const cx = (posAttr.getX(i) + posAttr.getX(i + 1) + posAttr.getX(i + 2)) / 3;
    const cz = (posAttr.getZ(i) + posAttr.getZ(i + 1) + posAttr.getZ(i + 2)) / 3;

    const key: QuadrantKey =
      cz >= 0 ? (cx >= 0 ? 'FL' : 'FR') : cx >= 0 ? 'RL' : 'RR';
    const b = buckets[key];

    for (let k = 0; k < 3; k++) {
      const idx = i + k;
      b.pos.push(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      if (normAttr) {
        b.norm.push(normAttr.getX(idx), normAttr.getY(idx), normAttr.getZ(idx));
      }
      if (uvAttr) {
        b.uv.push(uvAttr.getX(idx), uvAttr.getY(idx));
      }
    }
  }

  nonIndexed.dispose();

  const out: Record<QuadrantKey, THREE.BufferGeometry | null> = {
    FL: null,
    FR: null,
    RL: null,
    RR: null,
  };

  for (const key of ['FL', 'FR', 'RL', 'RR'] as const) {
    const b = buckets[key];
    if (b.pos.length === 0) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    if (b.norm.length > 0) {
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
    } else {
      g.computeVertexNormals();
    }
    if (b.uv.length > 0) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    }
    out[key] = g;
  }

  return out;
}

function extractFrontRearLightGeometry(
  sourceGeo: THREE.BufferGeometry,
  worldMatrix: THREE.Matrix4,
): { front: THREE.BufferGeometry | null; rear: THREE.BufferGeometry | null } {
  const nonIndexed = sourceGeo.index ? sourceGeo.toNonIndexed() : sourceGeo.clone();
  nonIndexed.applyMatrix4(worldMatrix);

  const posAttr = nonIndexed.getAttribute('position');
  const normAttr = nonIndexed.getAttribute('normal');
  const uvAttr = nonIndexed.getAttribute('uv');
  if (!posAttr) {
    nonIndexed.dispose();
    return { front: null, rear: null };
  }

  const buckets = {
    front: { pos: [] as number[], norm: [] as number[], uv: [] as number[] },
    rear: { pos: [] as number[], norm: [] as number[], uv: [] as number[] },
  };
  const vertCount = posAttr.count;
  for (let i = 0; i + 2 < vertCount; i += 3) {
    const cz = (posAttr.getZ(i) + posAttr.getZ(i + 1) + posAttr.getZ(i + 2)) / 3;
    const b = cz >= 0 ? buckets.front : buckets.rear;
    for (let k = 0; k < 3; k++) {
      const idx = i + k;
      b.pos.push(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx));
      if (normAttr) b.norm.push(normAttr.getX(idx), normAttr.getY(idx), normAttr.getZ(idx));
      if (uvAttr) b.uv.push(uvAttr.getX(idx), uvAttr.getY(idx));
    }
  }
  nonIndexed.dispose();

  const buildGeo = (b: { pos: number[]; norm: number[]; uv: number[] }) => {
    if (b.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    if (b.norm.length > 0) g.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
    else g.computeVertexNormals();
    if (b.uv.length > 0) g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    return g;
  };
  return { front: buildGeo(buckets.front), rear: buildGeo(buckets.rear) };
}

interface ManagedTexEntry {
  tex: THREE.Texture;
  origImage: TexImageSource | null;
  origW: number;
  origH: number;
  cachedCanvases: Partial<Record<CarTextureQualityTier, HTMLCanvasElement>>;
}

function getTexDimensions(img: unknown): { w: number; h: number } {
  if (!img || typeof img !== 'object') return { w: 0, h: 0 };
  const rec = img as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  const w = rec.width || rec.naturalWidth || 0;
  const h = rec.height || rec.naturalHeight || 0;
  return { w, h };
}

const pendingGpuTextureQueue: THREE.Texture[] = [];
const queuedGpuTextures = new WeakSet<THREE.Texture>();

function enqueueManagedTexturesForGpu(entries: ManagedTexEntry[]): void {
  for (let i = 0; i < entries.length; i++) {
    const tex = entries[i].tex;
    if (tex && !queuedGpuTextures.has(tex)) {
      queuedGpuTextures.add(tex);
      pendingGpuTextureQueue.push(tex);
    }
  }
}

/**
 * Incrementally uploads pending car textures to the GPU (budgetCount per frame)
 * so switching cars or preloading never triggers a single-frame multi-texture upload stall.
 */
export function pumpGpuTextureQueue(renderer: THREE.WebGLRenderer, budgetCount = 2): number {
  let uploaded = 0;
  while (uploaded < budgetCount && pendingGpuTextureQueue.length > 0) {
    const tex = pendingGpuTextureQueue.shift()!;
    try {
      renderer.initTexture(tex);
    } catch {
      // Ignore disposed or unsupported texture state
    }
    uploaded++;
  }
  return uploaded;
}

function applySingleManagedTextureQuality(
  entry: ManagedTexEntry,
  quality: CarTextureQualityTier,
  aniso: number,
  cap: number,
): void {
  const { tex, origImage, origW, origH, cachedCanvases } = entry;
  let imageChanged = false;

  if (origImage && origW > 0 && origH > 0) {
    const maxDim = Math.max(origW, origH);
    if (maxDim > cap) {
      let targetCanvas = cachedCanvases[quality];
      if (!targetCanvas) {
        const scale = cap / maxDim;
        const tw = Math.max(16, Math.round(origW * scale));
        const th = Math.max(16, Math.round(origH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(origImage as CanvasImageSource, 0, 0, tw, th);
          cachedCanvases[quality] = canvas;
          targetCanvas = canvas;
        }
      }
      if (targetCanvas && tex.image !== targetCanvas) {
        tex.image = targetCanvas;
        imageChanged = true;
      }
    } else if (tex.image !== origImage) {
      tex.image = origImage;
      imageChanged = true;
    }
  }

  if (tex.anisotropy !== aniso) {
    tex.anisotropy = aniso;
    imageChanged = true;
  }
  if (imageChanged) {
    tex.needsUpdate = true;
  }
}

function applyQualityToManagedTextures(
  entries: ManagedTexEntry[],
  quality: CarTextureQualityTier,
  maxAnisotropy = 8,
): void {
  const cap = quality === 'performance' ? 512 : quality === 'balanced' ? 1024 : 2048;
  const aniso = Math.max(
    1,
    Math.min(maxAnisotropy, quality === 'performance' ? 2 : quality === 'balanced' ? 6 : 12),
  );

  for (const entry of entries) {
    applySingleManagedTextureQuality(entry, quality, aniso, cap);
  }
}

async function applyQualityToManagedTexturesAsync(
  entries: ManagedTexEntry[],
  quality: CarTextureQualityTier,
  maxAnisotropy = 8,
): Promise<void> {
  const cap = quality === 'performance' ? 512 : quality === 'balanced' ? 1024 : 2048;
  const aniso = Math.max(
    1,
    Math.min(maxAnisotropy, quality === 'performance' ? 2 : quality === 'balanced' ? 6 : 12),
  );

  let sliceStart = typeof performance !== 'undefined' ? performance.now() : 0;
  for (let i = 0; i < entries.length; i++) {
    applySingleManagedTextureQuality(entries[i], quality, aniso, cap);
    if (
      typeof requestAnimationFrame === 'function' &&
      typeof performance !== 'undefined' &&
      performance.now() - sliceStart > 3.5 &&
      i + 1 < entries.length
    ) {
      await new Promise<void>((res) => requestAnimationFrame(() => res()));
      sliceStart = performance.now();
    }
  }
}

const SHARED_FALLBACK_WRAP_TEX = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
SHARED_FALLBACK_WRAP_TEX.needsUpdate = true;

const templatePromiseCache = new Map<CarModelId, Promise<McLarenTemplate>>();
const carAbortControllerMap = new Map<CarModelId, AbortController>();
const carProgressListenersMap = new Map<CarModelId, Set<(percent: number) => void>>();
const carLatestProgressMap = new Map<CarModelId, number>();
const resolvedTemplateSet = new Set<CarModelId>();

/**
 * Cancels an in-flight uncached car template download/parse so bandwidth & CPU go
 * immediately to the vehicle currently visible in the garage.
 */
export function abortCarTemplateLoad(carId: CarModelId): void {
  const normalized = normalizeCarModelId(carId);
  if (resolvedTemplateSet.has(normalized)) return;
  const ctrl = carAbortControllerMap.get(normalized);
  if (ctrl) {
    ctrl.abort();
    carAbortControllerMap.delete(normalized);
  }
  templatePromiseCache.delete(normalized);
  carProgressListenersMap.delete(normalized);
  carLatestProgressMap.delete(normalized);
}

/**
 * Creates a lightweight wireframe-accented GT silhouette placeholder so car switches render
 * immediately at 60 FPS while an uncached GLB streams and compiles in the background.
 */
export function createCarPlaceholderInstance(carId: CarModelId): McLarenCarInstance {
  const root = new THREE.Group();
  root.name = `${carId}_Placeholder`;
  const bodySpringGroup = new THREE.Group();
  const chassisVisualGroup = new THREE.Group();
  root.add(bodySpringGroup);
  bodySpringGroup.add(chassisVisualGroup);

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.65,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.12,
    metalness: 0.2,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.85,
    metalness: 0.1,
  });
  const wireAccentMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.55,
  });
  mats.push(hullMat, glassMat, wheelMat, wireAccentMat);

  const bodyGeo = new THREE.BoxGeometry(1.94, 0.54, 4.42);
  const cabinGeo = new THREE.BoxGeometry(1.42, 0.42, 1.95);
  const wingGeo = new THREE.BoxGeometry(1.86, 0.04, 0.28);
  const bodyEdges = new THREE.EdgesGeometry(bodyGeo);
  const cabinEdges = new THREE.EdgesGeometry(cabinGeo);
  const wingEdges = new THREE.EdgesGeometry(wingGeo);
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 16);
  wheelGeo.rotateZ(Math.PI / 2);
  geos.push(bodyGeo, cabinGeo, wingGeo, bodyEdges, cabinEdges, wingEdges, wheelGeo);

  const bodyMesh = new THREE.Mesh(bodyGeo, hullMat);
  bodyMesh.position.set(0, 0.46, 0);
  bodyMesh.castShadow = true;
  bodyMesh.add(new THREE.LineSegments(bodyEdges, wireAccentMat));
  const cabinMesh = new THREE.Mesh(cabinGeo, glassMat);
  cabinMesh.position.set(0, 0.90, -0.15);
  cabinMesh.renderOrder = 2;
  cabinMesh.add(new THREE.LineSegments(cabinEdges, wireAccentMat));
  const wingMesh = new THREE.Mesh(wingGeo, hullMat);
  wingMesh.position.set(0, 1.02, -2.05);
  wingMesh.add(new THREE.LineSegments(wingEdges, wireAccentMat));
  chassisVisualGroup.add(bodyMesh, cabinMesh, wingMesh);

  const placeholderDriver = createCarDriverInstance({
    steeringCenter: new THREE.Vector3(0.32, 0.78, 0.38),
    canopyCeilingY: 1.11,
    glassFloorY: 0.69,
    isOpenWheel: carId === 'honda-ra272-f1',
    livery: 'stealth_black',
  });
  chassisVisualGroup.add(placeholderDriver.group);

  const frontWheelSteerPivots: THREE.Group[] = [];
  const wheelSpinPivots: THREE.Group[] = [];
  const camberList: THREE.Group[] = [];
  const wheelCoords: Array<[number, number, number]> = [
    [0.84, 0.34, 1.32],
    [-0.84, 0.34, 1.32],
    [0.86, 0.34, -1.34],
    [-0.86, 0.34, -1.34],
  ];
  for (let i = 0; i < 4; i++) {
    const [wx, wy, wz] = wheelCoords[i];
    const steer = new THREE.Group();
    steer.position.set(wx, wy, wz);
    const camber = new THREE.Group();
    steer.add(camber);
    const spin = new THREE.Group();
    camber.add(spin);
    spin.add(new THREE.Mesh(wheelGeo, wheelMat));
    root.add(steer);
    if (i < 2) frontWheelSteerPivots.push(steer);
    camberList.push(camber);
    wheelSpinPivots.push(spin);
  }

  const hlL = new THREE.SpotLight(0xf6f9ff, 0, 185, Math.PI * 0.31, 0.72, 0.52);
  const hlR = new THREE.SpotLight(0xf6f9ff, 0, 185, Math.PI * 0.31, 0.72, 0.52);
  const hlFlood = new THREE.SpotLight(0xf3f7ff, 0, 140, Math.PI * 0.44, 0.88, 0.45);
  const hlNear = new THREE.PointLight(0xeef6ff, 0, 36, 0.65);
  hlL.position.set(0.72, 0.76, 2.15);
  hlL.target.position.set(1.35, -2.5, 22.0);
  hlR.position.set(-0.72, 0.76, 2.15);
  hlR.target.position.set(-1.35, -2.5, 22.0);
  hlFlood.position.set(0, 1.55, 2.35);
  hlFlood.target.position.set(0, -4.8, 17.5);
  hlNear.position.set(0, 1.45, 4.6);
  hlL.visible = false;
  hlR.visible = false;
  hlFlood.visible = false;
  hlNear.visible = false;
  chassisVisualGroup.add(hlL, hlL.target, hlR, hlR.target, hlFlood, hlFlood.target, hlNear);

  return {
    carId,
    root,
    bodySpringGroup,
    chassisVisualGroup,
    frontWheelSteerPivots,
    wheelCamberPivots: camberList as [THREE.Group, THREE.Group, THREE.Group, THREE.Group],
    wheelSpinPivots,
    wheelBaseYs: [0.34, 0.34, 0.34, 0.34],
    wheelBaseXs: [0.84, -0.84, 0.86, -0.86],
    steeringSpinPivot: null,
    cockpitEyePos: new THREE.Vector3(0.32, 0.94, 0.05),
    windshieldPos: new THREE.Vector3(0.32, 0.94, 0.72),
    hoodCamPos: new THREE.Vector3(0, 0.92, 0.85),
    bumperCamPos: new THREE.Vector3(0, 0.50, 2.24),
    carLengthM: 4.42,
    headlightSpotLeft: hlL,
    headlightSpotRight: hlR,
    wheelRadius: 0.34,
    setLights: (headlightsOn: boolean, _brakingIntensity: number, nightFactor: number) => {
      const power = headlightsOn || nightFactor > 0.18 ? (headlightsOn ? 1.0 : nightFactor * 0.9) : 0;
      const active = power > 0.01;
      hlL.intensity = 48.0 * power;
      hlR.intensity = 48.0 * power;
      hlFlood.intensity = 38.0 * power;
      hlNear.intensity = 15.0 * power;
      hlL.visible = active;
      hlR.visible = active;
      hlFlood.visible = active;
      hlNear.visible = active;
    },
    setInteriorMode: (isInterior: boolean) => {
      placeholderDriver.group.visible = !isInterior;
      cabinMesh.visible = !isInterior;
    },
    setSteeringWheelAngle: (steerRad: number) => {
      placeholderDriver.setSteer(steerRad);
    },
    setDirtAndWeather: () => {},
    setVisualCustomization: (cfg) => {
      hullMat.color.set(cfg.paintHex || '#334155');
    },
    setStance: () => {},
    setActiveAeroState: () => {},
    setWireframe: (wire) => {
      hullMat.wireframe = wire;
      glassMat.wireframe = wire;
      wheelMat.wireframe = wire;
      for (const dm of placeholderDriver.wireframeMats) dm.wireframe = wire;
    },
    dispose: () => {
      placeholderDriver.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

const MODEL_CACHE_NAME = 'aurelia-car-assets-v2';
const GLB_MAGIC_LE = 0x46546c67; // 'glTF'

function isValidModelBuffer(buf: ArrayBuffer, format: 'glb' | 'usdz'): boolean {
  if (buf.byteLength < 1024) return false;
  if (format === 'usdz') {
    const bytes = new Uint8Array(buf, 0, 4);
    return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }
  const view = new DataView(buf);
  return view.getUint32(0, true) === GLB_MAGIC_LE;
}

function concatChunks(chunks: Uint8Array[], totalBytes: number): ArrayBuffer {
  const out = new Uint8Array(totalBytes);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

async function fetchModelArrayBufferResilient(
  url: string,
  format: 'glb' | 'usdz' = 'glb',
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const throwIfAborted = () => {
    if (signal?.aborted) {
      throw new DOMException('Model load aborted', 'AbortError');
    }
  };
  throwIfAborted();

  const mimeType = format === 'usdz' ? 'model/vnd.usdz+zip' : 'model/gltf-binary';
  // 1. Fast-path from persistent CacheStorage if available
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(MODEL_CACHE_NAME);
      const cachedRes = await cache.match(url);
      throwIfAborted();
      if (cachedRes && cachedRes.ok) {
        const cachedBuf = await cachedRes.arrayBuffer();
        throwIfAborted();
        if (isValidModelBuffer(cachedBuf, format)) {
          onProgress?.(100);
          return cachedBuf;
        }
        await cache.delete(url).catch(() => {});
      }
    } catch (cacheErr) {
      if (cacheErr instanceof Error && cacheErr.name === 'AbortError') throw cacheErr;
      // CacheStorage unavailable (e.g., private browsing) — continue to network fetch
    }
  }

  const maxAttempts = 4;
  const retryDelaysMs = [350, 900, 1800];
  let chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  let expectedTotalBytes = 0;
  let canRangeResume = false;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    throwIfAborted();
    try {
      const headers: Record<string, string> = {};
      if (canRangeResume && receivedBytes > 0) {
        headers['Range'] = `bytes=${receivedBytes}-`;
      } else {
        chunks = [];
        receivedBytes = 0;
      }

      const response = await fetch(url, {
        credentials: 'same-origin',
        headers,
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${url}`);
      }

      if (response.status === 200) {
        chunks = [];
        receivedBytes = 0;
      }

      const contentEncoding = response.headers.get('content-encoding');
      const acceptRanges = response.headers.get('accept-ranges');
      canRangeResume = !contentEncoding && acceptRanges !== 'none';

      const rawTotal =
        response.headers.get('x-file-size') ||
        (contentEncoding ? null : response.headers.get('content-length'));
      if (response.status === 200 && rawTotal) {
        const parsedTotal = parseInt(rawTotal, 10);
        if (Number.isFinite(parsedTotal) && parsedTotal > 0) {
          expectedTotalBytes = parsedTotal;
        }
      } else if (response.status === 206) {
        const cr = response.headers.get('content-range');
        const slashIdx = cr ? cr.lastIndexOf('/') : -1;
        if (slashIdx >= 0 && cr) {
          const parsedTotal = parseInt(cr.slice(slashIdx + 1), 10);
          if (Number.isFinite(parsedTotal) && parsedTotal > 0) {
            expectedTotalBytes = parsedTotal;
          }
        }
      }

      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        while (true) {
          if (signal?.aborted) {
            await reader.cancel().catch(() => {});
            throw new DOMException('Model load aborted', 'AbortError');
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            chunks.push(value);
            receivedBytes += value.byteLength;
            if (expectedTotalBytes > 0) {
              onProgress?.(Math.min(99, Math.round((receivedBytes / expectedTotalBytes) * 100)));
            }
          }
        }
        throwIfAborted();
        const assembled = concatChunks(chunks, receivedBytes);
        if (!isValidModelBuffer(assembled, format)) {
          chunks = [];
          receivedBytes = 0;
          canRangeResume = false;
          throw new Error(`Invalid or truncated ${format.toUpperCase()} payload (${assembled.byteLength} bytes)`);
        }
        if (typeof caches !== 'undefined') {
          try {
            const cache = await caches.open(MODEL_CACHE_NAME);
            await cache.put(
              url,
              new Response(assembled.slice(0), {
                headers: { 'Content-Type': mimeType },
              }),
            );
          } catch {
            // Ignore CacheStorage quota errors
          }
        }
        onProgress?.(100);
        return assembled;
      }

      const fallbackBuf = await response.arrayBuffer();
      throwIfAborted();
      if (!isValidModelBuffer(fallbackBuf, format)) {
        throw new Error(`Invalid or truncated ${format.toUpperCase()} payload (${fallbackBuf.byteLength} bytes)`);
      }
      if (typeof caches !== 'undefined') {
        try {
          const cache = await caches.open(MODEL_CACHE_NAME);
          await cache.put(
            url,
            new Response(fallbackBuf.slice(0), {
              headers: { 'Content-Type': mimeType },
            }),
          );
        } catch {
          // Ignore CacheStorage quota errors
        }
      }
      onProgress?.(100);
      return fallbackBuf;
    } catch (err) {
      if ((err instanceof Error && err.name === 'AbortError') || signal?.aborted) {
        throw err instanceof Error ? err : new DOMException('Model load aborted', 'AbortError');
      }
      lastError = err;
      if (attempt < maxAttempts - 1) {
        const waitMs = retryDelaysMs[attempt] ?? 1800;
        await new Promise<void>((res, rej) => {
          const timer = window.setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            res();
          }, waitMs);
          const onAbort = () => {
            window.clearTimeout(timer);
            rej(new DOMException('Model load aborted', 'AbortError'));
          };
          signal?.addEventListener('abort', onAbort, { once: true });
        });
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch model: ${url}`);
}

let sharedDracoLoader: DRACOLoader | null = null;
function getSharedDracoLoader(): DRACOLoader {
  if (!sharedDracoLoader) {
    sharedDracoLoader = new DRACOLoader();
    sharedDracoLoader.setDecoderPath('/draco/');
    sharedDracoLoader.preload();
  }
  return sharedDracoLoader;
}

/**
 * Loads a car GLB/USDZ template once (promise-cached per model), normalizes its orientation (+Z forward, +Y up, grounded at y=0),
 * splits wheel tire/rim meshes into 4 independent rolling/steering hubs, and supports quality-capped PBR texture streaming.
 */
export function loadCarTemplate(
  carId: CarModelId,
  onProgress?: (percent: number) => void,
  initialQuality: CarTextureQualityTier = 'balanced',
  maxAnisotropy = 8,
): Promise<McLarenTemplate> {
  const profileCarId: CarModelId = normalizeCarModelId(carId);
  const cached = templatePromiseCache.get(profileCarId);
  if (cached) {
    if (resolvedTemplateSet.has(profileCarId)) {
      onProgress?.(100);
    } else if (onProgress) {
      onProgress(carLatestProgressMap.get(profileCarId) ?? 0);
      let listeners = carProgressListenersMap.get(profileCarId);
      if (!listeners) {
        listeners = new Set();
        carProgressListenersMap.set(profileCarId, listeners);
      }
      listeners.add(onProgress);
    }
    return cached;
  }

  const profile = CAR_PROFILES[profileCarId];
  if (!profile.url) {
    return Promise.reject(new Error(`Car model "${carId}" does not have a bundled 3D asset.`));
  }
  const modelFormat = profile.format ?? 'glb';
  const abortController = new AbortController();
  carAbortControllerMap.set(profileCarId, abortController);
  carLatestProgressMap.set(profileCarId, 0);
  const initialListeners = new Set<(percent: number) => void>();
  if (onProgress) initialListeners.add(onProgress);
  carProgressListenersMap.set(profileCarId, initialListeners);

  const emitProgress = (pct: number) => {
    if (carAbortControllerMap.get(profileCarId) !== abortController) return;
    const clamped = Math.max(0, Math.min(100, Math.round(pct)));
    carLatestProgressMap.set(profileCarId, clamped);
    const listeners = carProgressListenersMap.get(profileCarId);
    if (listeners) {
      listeners.forEach((cb) => cb(clamped));
    }
  };

  const cleanupInFlightState = (removeCacheAndResolved = false) => {
    if (carAbortControllerMap.get(profileCarId) === abortController) {
      carAbortControllerMap.delete(profileCarId);
      carProgressListenersMap.delete(profileCarId);
      carLatestProgressMap.delete(profileCarId);
      if (removeCacheAndResolved) {
        templatePromiseCache.delete(profileCarId);
        resolvedTemplateSet.delete(profileCarId);
      }
    }
  };

  const promise = new Promise<McLarenTemplate>((resolve, reject) => {
    const loader = new GLTFLoader();
    const dracoLoader = getSharedDracoLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.register((parser) => {
      const extName = 'KHR_materials_pbrSpecularGlossiness';
      type SpecGlossExt = {
        diffuseFactor?: number[];
        diffuseTexture?: unknown;
        specularFactor?: number[];
        glossinessFactor?: number;
      };
      type MatDef = { extensions?: Record<string, SpecGlossExt | undefined> };
      const getExt = (materialIndex: number): SpecGlossExt | undefined => {
        const materials = (parser.json as { materials?: MatDef[] } | undefined)?.materials;
        return materials?.[materialIndex]?.extensions?.[extName];
      };
      return {
        name: extName,
        getMaterialType(materialIndex: number) {
          return getExt(materialIndex) ? THREE.MeshPhysicalMaterial : null;
        },
        extendMaterialParams(materialIndex: number, materialParams: Record<string, unknown>) {
          const ext = getExt(materialIndex);
          if (!ext) return Promise.resolve();
          const pending: Array<Promise<unknown>> = [];
          const df = Array.isArray(ext.diffuseFactor) ? ext.diffuseFactor : [1, 1, 1, 1];
          materialParams.color = new THREE.Color().setRGB(
            df[0] ?? 1,
            df[1] ?? 1,
            df[2] ?? 1,
            THREE.LinearSRGBColorSpace,
          );
          if (typeof df[3] === 'number') {
            materialParams.opacity = df[3];
          }
          const gloss = typeof ext.glossinessFactor === 'number' ? ext.glossinessFactor : 0.65;
          materialParams.roughness = THREE.MathUtils.clamp(1.0 - gloss, 0.04, 1.0);
          const sf = Array.isArray(ext.specularFactor) ? ext.specularFactor : null;
          const specMax = sf ? Math.max(sf[0] ?? 0, sf[1] ?? 0, sf[2] ?? 0) : 0.25;
          materialParams.metalness = THREE.MathUtils.clamp(specMax * 0.45, 0.04, 0.85);
          if (ext.diffuseTexture) {
            const p = parser as unknown as {
              assignTexture: (
                params: Record<string, unknown>,
                slot: string,
                texDef: unknown,
                cs?: THREE.ColorSpace,
              ) => Promise<unknown>;
            };
            pending.push(p.assignTexture(materialParams, 'map', ext.diffuseTexture, THREE.SRGBColorSpace));
          }
          return Promise.all(pending);
        },
      };
    });
    const resourceBasePath = profile.url.includes('/')
      ? profile.url.slice(0, profile.url.lastIndexOf('/') + 1)
      : '';

    const onGltfParsed = (gltf: { scene: THREE.Group }) => {
      if (abortController.signal.aborted) {
        cleanupInFlightState(true);
        reject(new DOMException('Model load aborted', 'AbortError'));
        return;
      }
      resolvedTemplateSet.add(profileCarId);
      emitProgress(100);
      cleanupInFlightState(false);

        const rawRoot = gltf.scene;
        if (profile.yawAdjustRad) {
          rawRoot.rotation.y += profile.yawAdjustRad;
        }
        rawRoot.updateMatrixWorld(true);

        const getHierarchyName = (obj: THREE.Object3D, stopParent: THREE.Object3D): string => {
          const parts: string[] = [];
          let curr: THREE.Object3D | null = obj;
          let depth = 0;
          while (curr && curr !== stopParent && curr !== rawRoot && depth < 5) {
            if (curr.name) parts.push(curr.name);
            curr = curr.parent;
            depth++;
          }
          return parts.join(' ');
        };

        const computeFilteredBounds = (targetRoot: THREE.Object3D, stopParent: THREE.Object3D): THREE.Box3 => {
          const bounds = new THREE.Box3();
          const meshBox = new THREE.Box3();
          targetRoot.traverse((child) => {
            if (!(child instanceof THREE.Mesh) || !child.geometry) return;
            const hierName = getHierarchyName(child, stopParent);
            if (profile.skipNodeRegex?.test(hierName)) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            const matName = mats[0]?.name ?? '';
            if (profile.skipMatNames.has(matName)) return;
            const zeroAlpha = mats.every(
              (m) => m && m.transparent && typeof m.opacity === 'number' && m.opacity <= 0.02,
            );
            if (zeroAlpha) return;
            child.geometry.computeBoundingBox();
            if (!child.geometry.boundingBox) return;
            meshBox.copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
            bounds.union(meshBox);
          });
          if (bounds.isEmpty()) {
            bounds.setFromObject(targetRoot);
          }
          return bounds;
        };

        const initialBox = computeFilteredBounds(rawRoot, rawRoot);
        const initialSize = initialBox.getSize(new THREE.Vector3());
        const uniformScale = computeCarNormalizationScale(initialSize.z, profile.targetLengthM);
        rawRoot.scale.multiplyScalar(uniformScale);
        rawRoot.updateMatrixWorld(true);

        const rawBox = computeFilteredBounds(rawRoot, rawRoot);
        const center = rawBox.getCenter(new THREE.Vector3());
        const offsetVec = new THREE.Vector3(-center.x, -rawBox.min.y, -center.z);

        const normalizedGroup = new THREE.Group();
        normalizedGroup.add(rawRoot);
        rawRoot.position.copy(offsetVec);
        normalizedGroup.updateMatrixWorld(true);
        const normalizedSize = computeFilteredBounds(normalizedGroup, normalizedGroup).getSize(
          new THREE.Vector3(),
        );

        const templateBody = new THREE.Group();
        templateBody.name = `${carId}_BodyTemplate`;
        const steeringParts: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }> = [];
        const steeringBounds = new THREE.Box3();
        const glassBounds = new THREE.Box3();

        const wheelGeos: Record<
          QuadrantKey,
          Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>
        > = {
          FL: [],
          FR: [],
          RL: [],
          RR: [],
        };
        const caliperGeos: Record<
          QuadrantKey,
          Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>
        > = {
          FL: [],
          FR: [],
          RL: [],
          RR: [],
        };

        const templateMaterials = new Set<THREE.Material>();
        const templateGeometries = new Set<THREE.BufferGeometry>();
        const managedTexMap = new Map<THREE.Texture, ManagedTexEntry>();

        const registerMatTextures = (m: THREE.Material) => {
          const std = m as THREE.MeshStandardMaterial;
          for (const slot of [std.map, std.normalMap, std.roughnessMap, std.metalnessMap, std.emissiveMap, std.aoMap]) {
            if (!slot || managedTexMap.has(slot)) continue;
            const { w, h } = getTexDimensions(slot.image);
            managedTexMap.set(slot, {
              tex: slot,
              origImage: (slot.image as TexImageSource) ?? null,
              origW: w,
              origH: h,
              cachedCanvases: {},
            });
          }
        };

        const splitMatCache = new Map<string, THREE.Material>();
        const assignSplitMat = (
          mesh: THREE.Mesh,
          origMat: THREE.Material,
          syntheticName: string,
        ): void => {
          const cacheKey = `${origMat.uuid}::${syntheticName}`;
          let target = splitMatCache.get(cacheKey);
          if (!target) {
            target = origMat.clone();
            target.name = syntheticName;
            splitMatCache.set(cacheKey, target);
          }
          mesh.material = target;
        };

        normalizedGroup.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const hierName = getHierarchyName(child, normalizedGroup);
          if (profile.skipNodeRegex?.test(hierName)) {
            return;
          }

          let mats = Array.isArray(child.material) ? child.material : [child.material];
          let primaryMat = mats[0];
          let matName = primaryMat?.name ?? '';

          if (profile.skipMatNames.has(matName)) {
            return;
          }

          if (primaryMat) {
            if (profileCarId === 'aston-vantage-gt3') {
              if (matName === 'vantageVehicle_Exterior_mm_misc1' && profile.caliperNodeRegex?.test(hierName)) {
                assignSplitMat(child, primaryMat, 'ASTON_VANTAGE_CALIPER');
              } else if (matName === 'vantageVehicle_Exterior_mm_ext1' && /EXHAUST/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'ASTON_VANTAGE_EXHAUST');
              } else if (matName === 'vantageVehicle_Exterior_mm_lights1') {
                const isRear = /TAILLIGHT|BRAKE|REAR|BOOT/i.test(hierName);
                assignSplitMat(child, primaryMat, isRear ? 'ASTON_VANTAGE_REAR_LIGHTS' : 'ASTON_VANTAGE_FRONT_LIGHTS');
              }
            } else if (profileCarId === 'audi-r8-lms-evo') {
              if (/EXT_Carpaint/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'R8_CARPAINT');
              } else if (/GEO_Rim/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'R8_RIM');
              } else if (/GEO_Tyre|EXT_Disc/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'R8_WHEEL');
              } else if (/EXT_CALIPER/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'R8_CALIPER');
              } else if (/EXT_Exhaust/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'R8_EXHAUST');
              } else if (/EXT_Emissive_Light_Rear|EXT_Brake_Light/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'R8_BRAKE_LIGHT');
              } else if (/EXT_Emissive_Light_Front/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'R8_HEADLIGHT');
              } else if (/EXT_Glass_Emissive/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'R8_HEADLIGHT_GLASS');
              } else if (/EXT_Windows|INT_Glass|INT_Windshield/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'R8_GLASS');
              } else {
                assignSplitMat(child, primaryMat, 'R8_TRIM');
              }
            } else if (profileCarId === 'lambo-huracan-gt3-evo2') {
              if (matName === 'EXT_Mechanics.005' && /EXT_Exhaust/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'HURACAN_EXHAUST');
              }
            } else if (profileCarId === 'acura-nsx-gt3' || profileCarId === 'bugatti-bolide') {
              if (matName === 'Vehicle_Exterior_mm_misc' && /CALIPER/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'FORZA_CALIPER');
              } else if (matName === 'Vehicle_Exterior_mm_ext' && /EXHAUST/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'FORZA_EXHAUST');
              } else if (matName === 'Vehicle_Exterior_mm_lights') {
                const isRear = /TAILLIGHT|BRAKE|REAR|BOOT/i.test(hierName);
                assignSplitMat(child, primaryMat, isRear ? 'FORZA_REAR_LIGHTS' : 'FORZA_FRONT_LIGHTS');
              }
            } else if (profileCarId === 'cadillac-v-series-r') {
              if (profile.caliperNodeRegex?.test(hierName)) {
                assignSplitMat(child, primaryMat, 'EXT_CALIPER');
              }
            } else if (profileCarId === 'toyota-gt-one-ts020') {
              if (matName === 'GTcar_Toyota_GT_One_Road_Version_details1' && /rims_wheel/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'GTONE_RIM');
              } else if (
                matName === 'GTcar_Toyota_GT_One_Road_Version_details_normal1' &&
                /details_normal_wheel/i.test(hierName)
              ) {
                assignSplitMat(child, primaryMat, 'GTONE_WHEEL_DETAIL');
              }
            } else if (profileCarId === 'de-tomaso-p900') {
              if (/emiss_brakedisk|brakedisk/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'P900_DISC');
              } else if (
                (matName === 'Color' || matName === 'dtP900car_DeTomaso_P900_details1') &&
                /rims_wheel/i.test(hierName)
              ) {
                assignSplitMat(child, primaryMat, 'P900_RIM');
              } else if (
                (matName === 'dtP900car_DeTomaso_P900_details1' && /details_wheel.*_motion/i.test(hierName)) ||
                (matName === 'dtP900car_DeTomaso_P900_details_normal1' &&
                  /details_normal_wheel/i.test(hierName))
              ) {
                assignSplitMat(child, primaryMat, 'P900_WHEEL_DETAIL');
              }
            } else if (profileCarId === 'mercedes-amg-gt3-evo') {
              if (/Caliper_(?!.*decal)/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'AMG_CALIPER');
              } else if (/RIM_/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'AMG_RIM');
              } else if (/TYRE_|EXT_Disc|Disc_/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'AMG_WHEEL');
              } else if (/EXT_Exhaust/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'AMG_EXHAUST');
              } else if (/EXT_Emissive_Light_Rear|Brakelights_ON|EXT_Emissive_Rear_Light|EXT_Emissive_Lights_ON/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'AMG_BRAKE_LIGHT');
              } else if (/EXT_Emissive_Lights_Front|EXT_Emissive_Light_Front|Lowbeam_Emissive|Highbeam_Emissive|EXT_Daylight_Left|EXT_Daylight_Right/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'AMG_HEADLIGHT');
              } else if (/EXT_Glass_Emissive/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'AMG_HEADLIGHT_GLASS');
              } else if (/EXT_Windows|EXT_Window_|INT_Windshield|INT_Windows|MI_INT_Glass/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'AMG_GLASS');
              } else if (/Carbon|EXT_Carpaint_Inst_Black/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'AMG_TRIM');
              } else if (/EXT_Carpaint_Inst/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'AMG_CARPAINT');
              } else {
                assignSplitMat(child, primaryMat, 'AMG_TRIM');
              }
            } else if (profileCarId === 'mclaren-f1-gtr-longtail') {
              if (matName === 'mclaren_f1gtr_misc' && /caliper_/i.test(hierName)) {
                assignSplitMat(child, primaryMat, 'F1GTR_CALIPER');
              }
            } else if (profileCarId === 'vw-polo-r-wrx' && matName === 'mat_7' && child.geometry) {
              child.geometry.computeBoundingBox();
              const wb = child.geometry.boundingBox?.clone();
              if (wb) {
                wb.applyMatrix4(child.matrixWorld);
                const wSize = wb.getSize(new THREE.Vector3());
                const wCenter = wb.getCenter(new THREE.Vector3());
                const looksLikeTire =
                  wSize.y < normalizedSize.y * 0.56 &&
                  wSize.z < normalizedSize.z * 0.28 &&
                  Math.abs(wCenter.x) > normalizedSize.x * 0.25;
                assignSplitMat(child, primaryMat, looksLikeTire ? 'POLO_TIRE' : 'POLO_CHASSIS');
              }
            }
            if (/EXT_Wing|OEM_Wing|SPOILER|Wing_Geo/i.test(hierName)) {
              child.userData.isOemWing = true;
            }
            mats = Array.isArray(child.material) ? child.material : [child.material];
            primaryMat = mats[0];
            matName = primaryMat?.name ?? '';
          }

          // Skip invisible alpha=0 helper shells
          const hasOnlyZeroAlphaMats = mats.every(
            (m) => m && m.transparent && typeof m.opacity === 'number' && m.opacity <= 0.02,
          );
          if (hasOnlyZeroAlphaMats) {
            return;
          }

          for (const m of mats) {
            if (!m) continue;
            templateMaterials.add(m);
            registerMatTextures(m);

            if (m instanceof THREE.MeshStandardMaterial) {
              const mName = m.name || matName;
              const phys = m as THREE.MeshPhysicalMaterial;
              m.envMapIntensity = 0.72;
              const isDeclaredGlass =
                profile.glassMatNames.has(mName) || profile.headlightGlassMatNames.has(mName);
              if (
                !isDeclaredGlass &&
                (profile.opaqueNonGlass || !m.transparent || m.opacity >= 0.94)
              ) {
                m.transparent = false;
                m.alphaTest = 0;
                m.depthWrite = true;
                m.depthTest = true;
                m.opacity = 1.0;
              }

              if (profile.paintExteriorMatNames.has(mName)) {
                m.color.setRGB(0.88, 0.88, 0.88);
                if (profile.replaceBaseMapOnPaint) {
                  m.map = null;
                  m.vertexColors = false;
                }
                m.roughness = 0.13;
                m.metalness = 0.42;
                m.envMapIntensity = 0.92;
                if ('clearcoat' in phys) {
                  phys.clearcoat = 1.0;
                  phys.clearcoatRoughness = 0.024;
                  phys.specularIntensity = 0.96;
                  if (phys.specularColor) phys.specularColor.setRGB(1, 1, 1);
                  phys.ior = 1.58;
                }
              } else if (profile.glassMatNames.has(mName)) {
                m.color.setRGB(0.04, 0.06, 0.10);
                m.transparent = true;
                m.opacity = profile.headlightGlassMatNames.has(mName) ? 0.24 : 0.34;
                m.depthWrite = false;
                m.side = THREE.FrontSide;
                m.roughness = 0.028;
                m.metalness = 0.08;
                m.envMapIntensity = 0.92;
                if ('clearcoat' in phys) {
                  phys.clearcoat = 1.0;
                  phys.clearcoatRoughness = 0.015;
                }
              } else if (profile.rimMatNames.has(mName)) {
                m.roughness = 0.22;
                m.metalness = 0.86;
                m.envMapIntensity = 0.90;
              } else if (profile.wheelMatNames.has(mName)) {
                const low = mName.toLowerCase();
                if (low.includes('disk') || low.includes('disc') || low.includes('rotor')) {
                  m.roughness = 0.27;
                  m.metalness = 0.86;
                  m.envMapIntensity = 0.85;
                } else {
                  m.roughness = 0.83;
                  m.metalness = 0.04;
                  m.envMapIntensity = 0.28;
                }
              } else if (profile.caliperMatNames?.has(mName)) {
                m.roughness = 0.24;
                m.metalness = 0.68;
                m.envMapIntensity = 0.76;
              } else if (profile.exhaustMatNames.has(mName)) {
                m.roughness = 0.17;
                m.metalness = 0.92;
                m.envMapIntensity = 0.98;
              } else if (profile.displayMatNames.has(mName)) {
                m.emissive = new THREE.Color(mName.includes('LED') ? 0xf59e0b : 0x38bdf8);
                m.emissiveIntensity = 1.45;
                m.roughness = 0.18;
                m.envMapIntensity = 0.34;
              } else if (profile.brakeLightMatNames.has(mName) || profile.headlightMatNames.has(mName)) {
                m.roughness = 0.14;
                m.envMapIntensity = 0.68;
              } else if (profile.trimMatNames.has(mName)) {
                m.roughness = 0.30;
                m.metalness = 0.26;
                m.envMapIntensity = 0.60;
                if ('clearcoat' in phys) {
                  phys.clearcoat = 0.78;
                  phys.clearcoatRoughness = 0.09;
                }
              } else {
                m.roughness = Math.max(m.roughness, 0.36);
                m.envMapIntensity = 0.46;
              }
            }
          }

          const isWheelPart = profile.wheelMatNames.has(matName);
          const isCaliperPart = Boolean(profile.caliperMatNames?.has(matName));
          let isSteeringPart =
            profile.steeringMatNames.has(matName) ||
            Boolean(profile.steeringNodeRegex?.test(hierName));
          if (
            !isSteeringPart &&
            !isWheelPart &&
            !isCaliperPart &&
            !profile.rimMatNames.has(matName) &&
            !profile.glassMatNames.has(matName) &&
            child.geometry &&
            /steer(?:ing)?(?:_?wheel|_?hr|_?hub)|^sw_|steeringwheel/i.test(hierName)
          ) {
            child.geometry.computeBoundingBox();
            const sb = child.geometry.boundingBox?.clone();
            if (sb) {
              sb.applyMatrix4(child.matrixWorld);
              const sc = sb.getCenter(new THREE.Vector3());
              const ss = sb.getSize(new THREE.Vector3());
              if (
                Math.abs(sc.x) < 0.72 &&
                sc.y > 0.34 &&
                sc.y < 1.15 &&
                Math.abs(sc.z) < 0.95 &&
                ss.x < 0.55 &&
                ss.y < 0.55
              ) {
                isSteeringPart = true;
              }
            }
          }
          const isSharedLightMat =
            profile.headlightMatNames.has(matName) && profile.brakeLightMatNames.has(matName);

          if (isWheelPart && child.geometry && primaryMat) {
            const split = extractQuadrantGeometry(child.geometry, child.matrixWorld);
            for (const key of ['FL', 'FR', 'RL', 'RR'] as const) {
              const g = split[key];
              if (g) {
                templateGeometries.add(g);
                wheelGeos[key].push({ geo: g, mat: primaryMat });
              }
            }
          } else if (isCaliperPart && child.geometry && primaryMat) {
            const split = extractQuadrantGeometry(child.geometry, child.matrixWorld);
            for (const key of ['FL', 'FR', 'RL', 'RR'] as const) {
              const g = split[key];
              if (g) {
                templateGeometries.add(g);
                caliperGeos[key].push({ geo: g, mat: primaryMat });
              }
            }
          } else if (isSteeringPart && child.geometry && primaryMat) {
            const clonedGeo = child.geometry.clone();
            clonedGeo.applyMatrix4(child.matrixWorld);
            clonedGeo.computeBoundingBox();
            if (clonedGeo.boundingBox) steeringBounds.union(clonedGeo.boundingBox);
            templateGeometries.add(clonedGeo);
            steeringParts.push({ geo: clonedGeo, mat: primaryMat });
          } else if (isSharedLightMat && child.geometry && primaryMat) {
            const splitLights = extractFrontRearLightGeometry(child.geometry, child.matrixWorld);
            if (splitLights.front) {
              templateGeometries.add(splitLights.front);
              const frontMesh = new THREE.Mesh(splitLights.front, primaryMat);
              frontMesh.name = `${child.name || matName}_FrontLights`;
              frontMesh.castShadow = false;
              frontMesh.receiveShadow = true;
              frontMesh.userData.matName = matName;
              frontMesh.userData.lightRole = 'headlight';
              frontMesh.userData.carPaintWeight = 0.12;
              templateBody.add(frontMesh);
            }
            if (splitLights.rear) {
              templateGeometries.add(splitLights.rear);
              const rearMesh = new THREE.Mesh(splitLights.rear, primaryMat);
              rearMesh.name = `${child.name || matName}_RearLights`;
              rearMesh.castShadow = false;
              rearMesh.receiveShadow = true;
              rearMesh.userData.matName = matName;
              rearMesh.userData.lightRole = 'brakelight';
              rearMesh.userData.carPaintWeight = 0.12;
              templateBody.add(rearMesh);
            }
          } else if (child.geometry) {
            const clonedGeo = child.geometry.clone();
            clonedGeo.applyMatrix4(child.matrixWorld);
            const isGlassMat = profile.glassMatNames.has(matName);
            if (isGlassMat && !profile.headlightGlassMatNames.has(matName)) {
              clonedGeo.computeBoundingBox();
              if (clonedGeo.boundingBox) glassBounds.union(clonedGeo.boundingBox);
            }
            const isMajorShadowCaster =
              profile.paintExteriorMatNames.has(matName) ||
              profile.trimMatNames.has(matName) ||
              Boolean(child.userData.isOemWing);
            let bigFallbackCaster = false;
            if (!isGlassMat && !isMajorShadowCaster) {
              clonedGeo.computeBoundingSphere();
              bigFallbackCaster = (clonedGeo.boundingSphere?.radius ?? 0) > 0.65;
            }
            templateGeometries.add(clonedGeo);
            const bakedMesh = new THREE.Mesh(clonedGeo, child.material);
            bakedMesh.name = child.name || matName;
            bakedMesh.castShadow = !isGlassMat && (isMajorShadowCaster || bigFallbackCaster);
            bakedMesh.receiveShadow = true;
            bakedMesh.renderOrder = isGlassMat ? 2 : 0;
            bakedMesh.userData.matName = matName;
            bakedMesh.userData.isCarGlass = isGlassMat;
            bakedMesh.userData.isOemWing = Boolean(child.userData.isOemWing);
            bakedMesh.userData.carPaintWeight = profile.paintExteriorMatNames.has(matName)
              ? 1.0
              : profile.trimMatNames.has(matName)
                ? 0.55
                : isGlassMat
                  ? 0.32
                  : 0.12;
            templateBody.add(bakedMesh);
          }
        });

        // Queue textures for incremental GPU upload & async downscale without blocking frame pacing
        const managedTexList = Array.from(managedTexMap.values());
        void applyQualityToManagedTexturesAsync(managedTexList, initialQuality, maxAnisotropy).then(
          () => {
            enqueueManagedTexturesForGpu(managedTexList);
          },
        );

        // Compute centered steering column pivot & exact interior / exterior camera anchors across all 26 car archetypes
        const [defSX, defSY, defSZ] = profile.defaultSteeringCenter;
        let steeringCenter = new THREE.Vector3(defSX, defSY, defSZ);
        if (!steeringBounds.isEmpty()) {
          const detectedCenter = steeringBounds.getCenter(new THREE.Vector3());
          if (
            Math.abs(detectedCenter.x) < 0.72 &&
            detectedCenter.y > 0.32 &&
            detectedCenter.y < 1.15 &&
            detectedCenter.z > -0.25 &&
            detectedCenter.z < 0.92
          ) {
            steeringCenter = detectedCenter;
          }
        }
        for (const sp of steeringParts) {
          sp.geo.translate(-steeringCenter.x, -steeringCenter.y, -steeringCenter.z);
        }

        const hasGlass = !glassBounds.isEmpty();
        const isOpenWheel = profileCarId === 'honda-ra272-f1';
        const isRoadster = profileCarId === 'ferrari-250-testa-rossa' || profileCarId === 'honda-s2000';
        const canopyCeilingY = hasGlass ? glassBounds.max.y : Math.max(1.04, normalizedSize.y);
        const glassFloorY = hasGlass ? glassBounds.min.y : Math.max(0.56, normalizedSize.y * 0.58);

        let cockpitEyePos: THREE.Vector3;
        let windshieldPos: THREE.Vector3;
        if (isOpenWheel) {
          // Open-wheel vintage F1: clear view over aeroscreen showing F1 steering wheel + nosecone + road
          const visorY = Math.max(canopyCeilingY + 0.05, steeringCenter.y + 0.24, 0.79);
          cockpitEyePos = new THREE.Vector3(steeringCenter.x, visorY, steeringCenter.z - 0.34);
          windshieldPos = new THREE.Vector3(steeringCenter.x, visorY - 0.03, steeringCenter.z + 0.28);
        } else if (!hasGlass) {
          // Zero-glass opaque hull: perch unobstructed camera cleanly above cabin cowl
          cockpitEyePos = new THREE.Vector3(0, normalizedSize.y + 0.05, 0.08);
          windshieldPos = new THREE.Vector3(0, normalizedSize.y + 0.03, normalizedSize.z * 0.22);
        } else {
          // Closed-cockpit GT / Prototype / Rally / Touring: clear road ahead + dashboard & steering wheel in lower third
          const eyeMinY = glassFloorY + (isRoadster ? 0.09 : 0.14);
          const eyeMaxY = canopyCeilingY - (isRoadster ? 0.04 : 0.08);
          const clampedMinY = Math.min(eyeMinY, eyeMaxY);
          const eyeY = Math.min(eyeMaxY, Math.max(clampedMinY, steeringCenter.y + 0.20));
          const eyeZ = Math.max(-0.44, Math.min(0.24, steeringCenter.z - 0.36));
          const windMaxY = canopyCeilingY - 0.08;
          const windMinY = Math.min(glassFloorY + 0.13, windMaxY);
          const windY = Math.min(windMaxY, Math.max(windMinY, steeringCenter.y + 0.21));
          const windZ = Math.max(
            steeringCenter.z + 0.24,
            Math.min(glassBounds.max.z - 0.04, steeringCenter.z + 0.44),
          );
          cockpitEyePos = new THREE.Vector3(steeringCenter.x, eyeY, eyeZ);
          windshieldPos = new THREE.Vector3(steeringCenter.x, windY, windZ);
        }

        const hoodCamPos = new THREE.Vector3(
          0,
          isOpenWheel
            ? Math.max(0.76, canopyCeilingY + 0.04)
            : hasGlass
              ? Math.max(0.72, Math.min(canopyCeilingY - 0.04, glassFloorY + 0.19))
              : normalizedSize.y + 0.04,
          hasGlass ? Math.max(0.42, glassBounds.max.z + 0.10) : normalizedSize.z * 0.24,
        );
        const bumperCamPos = new THREE.Vector3(
          0,
          Math.max(0.38, Math.min(0.62, normalizedSize.y * 0.40)),
          normalizedSize.z * 0.5 + 0.08,
        );
        const carLengthM = Math.max(3.6, normalizedSize.z);

        const wheelTemplates: Record<
          QuadrantKey,
          {
            center: THREE.Vector3;
            radius: number;
            parts: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>;
            caliperParts: Array<{ geo: THREE.BufferGeometry; mat: THREE.Material }>;
          }
        > = {
          FL: { center: new THREE.Vector3(0.84, 0.35, 1.32), radius: 0.35, parts: [], caliperParts: [] },
          FR: { center: new THREE.Vector3(-0.84, 0.35, 1.32), radius: 0.35, parts: [], caliperParts: [] },
          RL: { center: new THREE.Vector3(0.86, 0.36, -1.36), radius: 0.36, parts: [], caliperParts: [] },
          RR: { center: new THREE.Vector3(-0.86, 0.36, -1.36), radius: 0.36, parts: [], caliperParts: [] },
        };

        let radiusSum = 0;
        let radiusCount = 0;

        for (const key of ['FL', 'FR', 'RL', 'RR'] as const) {
          const items = wheelGeos[key];
          if (items.length === 0) continue;
          const box = new THREE.Box3();
          for (const item of items) {
            item.geo.computeBoundingBox();
            if (item.geo.boundingBox) box.union(item.geo.boundingBox);
          }
          const c = box.getCenter(new THREE.Vector3());
          const s = box.getSize(new THREE.Vector3());
          const r = Math.max(0.28, Math.min(0.46, (s.y + s.z) * 0.25));
          radiusSum += r;
          radiusCount += 1;

          wheelTemplates[key].center.copy(c);
          wheelTemplates[key].radius = r;
          for (const item of items) {
            item.geo.translate(-c.x, -c.y, -c.z);
            wheelTemplates[key].parts.push(item);
          }
          for (const cal of caliperGeos[key]) {
            cal.geo.translate(-c.x, -c.y, -c.z);
            wheelTemplates[key].caliperParts.push(cal);
          }
        }
        const avgWheelRadius = radiusCount > 0 ? radiusSum / radiusCount : 0.355;

        rawRoot.traverse((child) => {
          if (child instanceof THREE.Mesh && child.geometry) {
            child.geometry.dispose();
          }
        });

        const createInstance = (
          withHeadlightSpots = true,
          livery: CarLiveryVariant = 'stealth_black',
        ): McLarenCarInstance => {
          const root = new THREE.Group();
          root.name = profileCarId
            .split('-')
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join('');

          const bodySpringGroup = new THREE.Group();
          bodySpringGroup.name = 'CarSprungChassis';
          root.add(bodySpringGroup);

          const chassisVisualGroup = new THREE.Group();
          chassisVisualGroup.name = 'ChassisVisualStanceGroup';
          bodySpringGroup.add(chassisVisualGroup);

          const instanceMaterials: THREE.Material[] = [];
          const instanceGeometries: THREE.BufferGeometry[] = [];
          const wireframeMats: THREE.MeshStandardMaterial[] = [];
          const brakeLightMats: THREE.MeshStandardMaterial[] = [];
          const headlightMats: THREE.MeshStandardMaterial[] = [];
          const headlightGlassMats: THREE.MeshStandardMaterial[] = [];
          const glassMaterialsRef: THREE.MeshStandardMaterial[] = [];
          const paintMainMats: THREE.MeshStandardMaterial[] = [];
          const paintAccentMats: THREE.MeshStandardMaterial[] = [];
          const trimMats: THREE.MeshStandardMaterial[] = [];
          const procWingMats: THREE.MeshStandardMaterial[] = [];
          const oemWingMeshes: THREE.Mesh[] = [];
          const interiorObstructMeshes: THREE.Mesh[] = [];
          const caliperMats: THREE.MeshStandardMaterial[] = [];
          const exhaustMats: THREE.MeshStandardMaterial[] = [];
          const rimMats: THREE.MeshStandardMaterial[] = [];
          const origMapByMat = new Map<THREE.MeshStandardMaterial, THREE.Texture | null>();
          let activeWrapTexture: THREE.CanvasTexture | null = null;
          const wrapUniforms = {
            uUseWrap: { value: 0 },
            uHasDoorDecal: { value: 0 },
            uWrapTex: { value: SHARED_FALLBACK_WRAP_TEX as THREE.Texture },
          };
          const matCloneMap = new Map<THREE.Material, THREE.Material>();

          const dirtUniforms = {
            uDirtLevel: { value: 0 },
            uWetness: { value: 0 },
          };

          const applyLiveryTint = (m: THREE.MeshStandardMaterial) => {
            if (livery === 'platinum_silver') {
              m.color.setRGB(0.84, 0.88, 0.94);
            } else if (livery === 'titanium_gunmetal') {
              m.color.setRGB(0.36, 0.42, 0.50);
            } else if (livery === 'obsidian_bronze') {
              m.color.setRGB(0.62, 0.46, 0.32);
            } else if (livery === 'papaya_orange') {
              m.color.setRGB(0.95, 0.48, 0.14);
            } else {
              m.color.setRGB(0.18, 0.22, 0.28);
            }
          };

          const cloneMaterial = (orig: THREE.Material): THREE.Material => {
            const existing = matCloneMap.get(orig);
            if (existing) return existing;
            const m = orig.clone();
            matCloneMap.set(orig, m);
            instanceMaterials.push(m);
            if (m instanceof THREE.MeshStandardMaterial) {
              wireframeMats.push(m);

              const isPaintExt = profile.paintExteriorMatNames.has(orig.name);
              const isRim = profile.rimMatNames.has(orig.name);
              const isCaliper = Boolean(profile.caliperMatNames?.has(orig.name));
              const isTrim = profile.trimMatNames.has(orig.name);
              const isProcWing = orig.name === 'PROC_WING';

              if (isPaintExt) {
                applyLiveryTint(m);
                if (profile.replaceBaseMapOnPaint) {
                  m.map = null;
                  m.vertexColors = false;
                }
                origMapByMat.set(m, m.map);
                m.roughnessMap = null;
                m.metalnessMap = null;
                if ('specularIntensity' in m) {
                  const phys = m as THREE.MeshPhysicalMaterial;
                  phys.specularIntensity = 0.96;
                  if (phys.specularColor) phys.specularColor.setRGB(1, 1, 1);
                }
                if (orig.name === 'body_2' || orig.name === 'sm_152_T') {
                  paintAccentMats.push(m);
                } else {
                  paintMainMats.push(m);
                }
              }
              if (isRim) {
                m.roughnessMap = null;
                m.metalnessMap = null;
                rimMats.push(m);
              }
              if (isCaliper) {
                m.roughnessMap = null;
                m.metalnessMap = null;
                caliperMats.push(m);
              }
              if (isTrim) {
                trimMats.push(m);
              }
              if (isProcWing) {
                procWingMats.push(m);
              }
              if (profile.exhaustMatNames.has(orig.name)) {
                exhaustMats.push(m);
              }

              const isSharedLight =
                profile.brakeLightMatNames.has(orig.name) &&
                profile.headlightMatNames.has(orig.name);
              if (!isSharedLight && profile.brakeLightMatNames.has(orig.name)) {
                m.emissive = new THREE.Color(0xff141e);
                m.emissiveIntensity = 1.1;
                brakeLightMats.push(m);
              } else if (!isSharedLight && profile.headlightMatNames.has(orig.name)) {
                m.emissive = new THREE.Color(0xf4f8ff);
                m.emissiveIntensity = 1.25;
                headlightMats.push(m);
              } else if (profile.headlightGlassMatNames.has(orig.name)) {
                headlightGlassMats.push(m);
              } else if (profile.glassMatNames.has(orig.name)) {
                glassMaterialsRef.push(m);
              }
              const isPaintMain =
                isPaintExt && orig.name !== 'body_2' && orig.name !== 'sm_152_T';
              if (
                profile.dirtReceiverMatNames.has(orig.name) ||
                isPaintMain ||
                isRim ||
                isCaliper ||
                isTrim
              ) {
                const scale = profile.dirtReceiverMatNames.has(orig.name)
                  ? isPaintExt
                    ? 1.0
                    : 0.72
                  : 0.0;
                const initialDesat = isPaintMain || isRim || isCaliper ? (m.map ? 1.0 : 0.0) : 0.0;
                attachCarMaterialShader(m, dirtUniforms, scale, {
                  isPaintMain,
                  initialDesaturate: initialDesat,
                  fallbackWrapTex: SHARED_FALLBACK_WRAP_TEX,
                  wrapUniforms: isPaintMain ? wrapUniforms : undefined,
                });
              }
            }
            return m;
          };

          for (const child of templateBody.children) {
            if (!(child instanceof THREE.Mesh)) continue;
            let clonedMat: THREE.Material | THREE.Material[];
            if (child.userData.lightRole === 'headlight' || child.userData.lightRole === 'brakelight') {
              const orig = Array.isArray(child.material) ? child.material[0] : child.material;
              const lm = orig.clone();
              instanceMaterials.push(lm);
              if (lm instanceof THREE.MeshStandardMaterial) {
                wireframeMats.push(lm);
                if (child.userData.lightRole === 'headlight') {
                  lm.emissive = new THREE.Color(0xf4f8ff);
                  lm.emissiveIntensity = 1.25;
                  headlightMats.push(lm);
                } else {
                  lm.emissive = new THREE.Color(0xff141e);
                  lm.emissiveIntensity = 1.1;
                  brakeLightMats.push(lm);
                }
              }
              clonedMat = lm;
            } else {
              clonedMat = Array.isArray(child.material)
                ? child.material.map(cloneMaterial)
                : cloneMaterial(child.material);
            }
            const mesh = new THREE.Mesh(child.geometry, clonedMat);
            mesh.name = child.name;
            mesh.castShadow = child.castShadow;
            mesh.receiveShadow = true;
            mesh.renderOrder = child.renderOrder;
            mesh.userData.carPaintWeight = child.userData.carPaintWeight ?? 0.2;
            mesh.userData.matName = child.userData.matName ?? '';
            mesh.userData.isCarGlass = Boolean(child.userData.isCarGlass);
            if (child.userData.isOemWing) {
              oemWingMeshes.push(mesh);
            }
            if (
              !mesh.userData.isCarGlass &&
              /seat|bucket|headrest|driver|pilot|helmet|windirt|headliner|sunstrip|sun_?visor|safety_?net|window_?net|windscreen_banner|roll_?cage|roll_?bar|harness|racing_?belt|netting|cockpit_lr|a_?pillar_?int/i.test(
                `${child.name} ${mesh.userData.matName}`,
              )
            ) {
              interiorObstructMeshes.push(mesh);
            }
            chassisVisualGroup.add(mesh);
          }

          let steeringSpinPivot: THREE.Group | null = null;
          if (steeringParts.length > 0) {
            const steerColumnTilt = new THREE.Group();
            steerColumnTilt.name = 'CockpitSteeringColumn';
            steerColumnTilt.position.copy(steeringCenter);
            steerColumnTilt.rotation.x = profile.steeringTiltRad;
            chassisVisualGroup.add(steerColumnTilt);

            steeringSpinPivot = new THREE.Group();
            steeringSpinPivot.name = 'CockpitSteeringSpin';
            steerColumnTilt.add(steeringSpinPivot);

            for (const sp of steeringParts) {
              const sm = new THREE.Mesh(sp.geo, cloneMaterial(sp.mat));
              sm.castShadow = false;
              sm.receiveShadow = true;
              sm.userData.carPaintWeight = 0.15;
              sm.rotation.x = -profile.steeringTiltRad;
              steeringSpinPivot.add(sm);
            }
          }

          const driverRig = createCarDriverInstance({
            steeringCenter,
            canopyCeilingY,
            glassFloorY,
            isOpenWheel,
            livery,
          });
          chassisVisualGroup.add(driverRig.group);
          for (const dm of driverRig.meshes) {
            interiorObstructMeshes.push(dm);
          }
          for (const dMat of driverRig.wireframeMats) {
            wireframeMats.push(dMat);
          }

          const frontWheelSteerPivots: THREE.Group[] = [];
          const wheelCamberPivotsList: THREE.Group[] = [];
          const wheelSpinPivots: THREE.Group[] = [];
          const wheelBaseYs: [number, number, number, number] = [
            wheelTemplates.FL.center.y,
            wheelTemplates.FR.center.y,
            wheelTemplates.RL.center.y,
            wheelTemplates.RR.center.y,
          ];
          const wheelBaseXs: [number, number, number, number] = [
            wheelTemplates.FL.center.x,
            wheelTemplates.FR.center.x,
            wheelTemplates.RL.center.x,
            wheelTemplates.RR.center.x,
          ];

          for (const key of ['FL', 'FR', 'RL', 'RR'] as const) {
            const wt = wheelTemplates[key];
            const steerPivot = new THREE.Group();
            steerPivot.name = `WheelSteer_${key}`;
            steerPivot.position.copy(wt.center);

            const camberPivot = new THREE.Group();
            camberPivot.name = `WheelCamber_${key}`;
            steerPivot.add(camberPivot);

            const spinPivot = new THREE.Group();
            spinPivot.name = `WheelSpin_${key}`;
            camberPivot.add(spinPivot);

            for (const part of wt.parts) {
              const m = new THREE.Mesh(part.geo, cloneMaterial(part.mat));
              m.castShadow = true;
              m.receiveShadow = true;
              m.userData.carPaintWeight = 0.12;
              spinPivot.add(m);
            }

            // Stationary brake calipers inside camberPivot (tilt & steer with hub, don't spin)
            for (const cal of wt.caliperParts) {
              const cm = new THREE.Mesh(cal.geo, cloneMaterial(cal.mat));
              cm.castShadow = false;
              cm.receiveShadow = true;
              cm.userData.carPaintWeight = 0.12;
              camberPivot.add(cm);
            }

            root.add(steerPivot);
            wheelCamberPivotsList.push(camberPivot);
            wheelSpinPivots.push(spinPivot);
            if (key === 'FL' || key === 'FR') {
              frontWheelSteerPivots.push(steerPivot);
            }
          }
          const wheelCamberPivots = wheelCamberPivotsList as [
            THREE.Group,
            THREE.Group,
            THREE.Group,
            THREE.Group,
          ];

          const [hlX, hlY, hlZ] = profile.defaultHeadlightPos;
          const headlightSpotLeft = new THREE.SpotLight(0xf6f9ff, 0, 245, Math.PI * 0.30, 0.68, 0.45);
          const headlightSpotRight = new THREE.SpotLight(0xf6f9ff, 0, 245, Math.PI * 0.30, 0.68, 0.45);
          const headlightFloodSpot = new THREE.SpotLight(0xf3f7ff, 0, 165, Math.PI * 0.46, 0.85, 0.42);
          const headlightNearPoint = new THREE.PointLight(0xeef6ff, 0, 42, 0.6);

          const beamOriginY = Math.max(0.76, hlY + 0.16);
          headlightSpotLeft.position.set(hlX, beamOriginY, hlZ);
          headlightSpotLeft.target.position.set(1.4, -2.5, 22.0);
          headlightSpotRight.position.set(-hlX, beamOriginY, hlZ);
          headlightSpotRight.target.position.set(-1.4, -2.5, 22.0);

          // High-mounted wide flood fill ensures grazing flat road asphalt, terrain, and bridges reflect clearly
          headlightFloodSpot.position.set(0, Math.max(1.55, hlY + 0.95), hlZ + 0.35);
          headlightFloodSpot.target.position.set(0, -4.8, 17.5);
          headlightNearPoint.position.set(0, 1.45, hlZ + 2.6);

          headlightSpotLeft.visible = false;
          headlightSpotRight.visible = false;
          headlightFloodSpot.visible = false;
          headlightNearPoint.visible = false;

          if (withHeadlightSpots) {
            chassisVisualGroup.add(headlightSpotLeft, headlightSpotLeft.target);
            chassisVisualGroup.add(headlightSpotRight, headlightSpotRight.target);
            chassisVisualGroup.add(headlightFloodSpot, headlightFloodSpot.target);
            chassisVisualGroup.add(headlightNearPoint);
          }

          // Procedural Composite Aero Kits (Front Splitter/Canards, Skirts/Blades, Venturi Diffuser, Hood Vents, Multi-Tier Rear Wings)
          const trimAeroMat = new THREE.MeshStandardMaterial({
            color: 0x16191f,
            roughness: 0.32,
            metalness: 0.44,
          });
          const wingAeroMat = new THREE.MeshStandardMaterial({
            color: 0x16191f,
            roughness: 0.26,
            metalness: 0.48,
          });
          instanceMaterials.push(trimAeroMat, wingAeroMat);
          wireframeMats.push(trimAeroMat, wingAeroMat);

          // 1. Front Aero Group (Lip, GT Splitter, Canards)
          const splitterGeo = new THREE.BoxGeometry(1.90, 0.022, 0.32);
          const splitterRodGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.14, 8);
          const canardGeo = new THREE.BoxGeometry(0.14, 0.014, 0.24);
          instanceGeometries.push(splitterGeo, splitterRodGeo, canardGeo);

          const frontLipMesh = new THREE.Mesh(splitterGeo, trimAeroMat);
          frontLipMesh.position.set(0, 0.132, 2.18);
          frontLipMesh.castShadow = true;
          frontLipMesh.receiveShadow = true;

          const frontGtGroup = new THREE.Group();
          const gtBlade = new THREE.Mesh(splitterGeo, trimAeroMat);
          gtBlade.scale.set(1.06, 1.15, 1.38);
          gtBlade.position.set(0, 0.125, 2.25);
          gtBlade.castShadow = true;
          frontGtGroup.add(gtBlade);
          for (const rx of [-0.46, 0.46]) {
            const rod = new THREE.Mesh(splitterRodGeo, trimAeroMat);
            rod.position.set(rx, 0.19, 2.34);
            rod.rotation.x = -0.22;
            frontGtGroup.add(rod);
          }

          const frontCanardsGroup = new THREE.Group();
          for (const side of [-1, 1]) {
            for (let tier = 0; tier < 2; tier++) {
              const fin = new THREE.Mesh(canardGeo, trimAeroMat);
              fin.position.set(side * 0.93, 0.31 + tier * 0.10, 2.02 - tier * 0.06);
              fin.rotation.set(0.16, side * 0.24, side * -0.18);
              fin.castShadow = true;
              frontCanardsGroup.add(fin);
            }
          }
          chassisVisualGroup.add(frontLipMesh, frontGtGroup, frontCanardsGroup);

          // 2. Side Aero Group (Carbon Skirts & Rear Aero Blades)
          const skirtGeo = new THREE.BoxGeometry(0.09, 0.024, 2.06);
          const bladeWingletGeo = new THREE.BoxGeometry(0.022, 0.14, 0.22);
          instanceGeometries.push(skirtGeo, bladeWingletGeo);
          const sideSkirtGroup = new THREE.Group();
          const leftSkirtMesh = new THREE.Mesh(skirtGeo, trimAeroMat);
          leftSkirtMesh.position.set(0.93, 0.132, 0.02);
          const rightSkirtMesh = new THREE.Mesh(skirtGeo, trimAeroMat);
          rightSkirtMesh.position.set(-0.93, 0.132, 0.02);
          sideSkirtGroup.add(leftSkirtMesh, rightSkirtMesh);

          const sideBladesGroup = new THREE.Group();
          for (const side of [-1, 1]) {
            const blade = new THREE.Mesh(bladeWingletGeo, trimAeroMat);
            blade.position.set(side * 0.96, 0.20, -0.84);
            blade.rotation.y = side * 0.10;
            sideBladesGroup.add(blade);
          }
          chassisVisualGroup.add(sideSkirtGroup, sideBladesGroup);

          // 3. Rear Diffuser (Venturi Fins & GT3 Diffuser)
          const diffTrayGeo = new THREE.BoxGeometry(1.42, 0.024, 0.42);
          const diffFinGeo = new THREE.BoxGeometry(0.02, 0.15, 0.40);
          instanceGeometries.push(diffTrayGeo, diffFinGeo);
          const rearDiffuserGroup = new THREE.Group();
          const diffTray = new THREE.Mesh(diffTrayGeo, trimAeroMat);
          diffTray.position.set(0, 0.155, -2.04);
          diffTray.rotation.x = 0.12;
          rearDiffuserGroup.add(diffTray);
          const diffFinMeshes: THREE.Mesh[] = [];
          for (const fx of [-0.58, -0.35, -0.14, 0.14, 0.35, 0.58]) {
            const fin = new THREE.Mesh(diffFinGeo, trimAeroMat);
            fin.position.set(fx, 0.19, -2.08);
            fin.rotation.x = 0.12;
            fin.castShadow = true;
            rearDiffuserGroup.add(fin);
            diffFinMeshes.push(fin);
          }
          chassisVisualGroup.add(rearDiffuserGroup);

          // 4. Hood Vents (Louvered Carbon Extractors)
          const hoodVentFrameGeo = new THREE.BoxGeometry(0.28, 0.018, 0.34);
          const hoodLouverGeo = new THREE.BoxGeometry(0.24, 0.010, 0.055);
          instanceGeometries.push(hoodVentFrameGeo, hoodLouverGeo);
          const hoodVentsGroup = new THREE.Group();
          for (const hx of [-0.34, 0.34]) {
            const frame = new THREE.Mesh(hoodVentFrameGeo, trimAeroMat);
            frame.position.set(hx, 0.895, 1.18);
            frame.rotation.x = -0.12;
            frame.rotation.y = hx > 0 ? -0.08 : 0.08;
            hoodVentsGroup.add(frame);
            for (let l = 0; l < 4; l++) {
              const sl = new THREE.Mesh(hoodLouverGeo, trimAeroMat);
              sl.position.set(hx, 0.905, 1.07 + l * 0.075);
              sl.rotation.x = 0.24;
              hoodVentsGroup.add(sl);
            }
          }
          hoodVentsGroup.visible = false;
          chassisVisualGroup.add(hoodVentsGroup);

          // 5. Rear Wings (Lip Ducktail, Low-Drag, GT High Swan-Neck, Chassis-Mount Twin-Element)
          const ducktailGeo = new THREE.BoxGeometry(1.42, 0.065, 0.16);
          const lowDragBladeGeo = new THREE.BoxGeometry(1.66, 0.024, 0.22);
          const wingBladeGeo = new THREE.BoxGeometry(1.88, 0.028, 0.28);
          const wingEndplateGeo = new THREE.BoxGeometry(0.024, 0.24, 0.38);
          const wingPylonGeo = new THREE.BoxGeometry(0.024, 0.28, 0.14);
          const chassisMountGeo = new THREE.BoxGeometry(0.026, 0.72, 0.18);
          instanceGeometries.push(
            ducktailGeo,
            lowDragBladeGeo,
            wingBladeGeo,
            wingEndplateGeo,
            wingPylonGeo,
            chassisMountGeo,
          );

          const ducktailWingGroup = new THREE.Group();
          const ducktailMesh = new THREE.Mesh(ducktailGeo, wingAeroMat);
          ducktailMesh.position.set(0, 0.99, -2.14);
          ducktailMesh.rotation.x = 0.38;
          ducktailMesh.castShadow = true;
          ducktailWingGroup.add(ducktailMesh);
          ducktailWingGroup.visible = false;
          chassisVisualGroup.add(ducktailWingGroup);

          const lowDragWingGroup = new THREE.Group();
          const ldBlade = new THREE.Mesh(lowDragBladeGeo, wingAeroMat);
          ldBlade.position.set(0, 1.02, -2.08);
          ldBlade.rotation.x = -0.05;
          ldBlade.castShadow = true;
          lowDragWingGroup.add(ldBlade);
          for (const px of [-0.34, 0.34]) {
            const p = new THREE.Mesh(wingPylonGeo, trimAeroMat);
            p.scale.set(1, 0.45, 0.8);
            p.position.set(px, 0.96, -2.06);
            lowDragWingGroup.add(p);
          }
          lowDragWingGroup.visible = false;
          chassisVisualGroup.add(lowDragWingGroup);

          const customWingGroup = new THREE.Group();
          customWingGroup.name = 'CustomAeroWing';
          const wingBlade = new THREE.Mesh(wingBladeGeo, wingAeroMat);
          wingBlade.position.set(0, 1.12, -2.08);
          wingBlade.rotation.x = -0.11;
          wingBlade.castShadow = true;
          const endplateL = new THREE.Mesh(wingEndplateGeo, wingAeroMat);
          endplateL.position.set(0.94, 1.10, -2.08);
          const endplateR = new THREE.Mesh(wingEndplateGeo, wingAeroMat);
          endplateR.position.set(-0.94, 1.10, -2.08);
          const pylonL = new THREE.Mesh(wingPylonGeo, trimAeroMat);
          pylonL.position.set(0.36, 0.98, -2.04);
          const pylonR = new THREE.Mesh(wingPylonGeo, trimAeroMat);
          pylonR.position.set(-0.36, 0.98, -2.04);
          customWingGroup.add(wingBlade, endplateL, endplateR, pylonL, pylonR);
          customWingGroup.visible = false;
          chassisVisualGroup.add(customWingGroup);

          const chassisMountWingGroup = new THREE.Group();
          chassisMountWingGroup.name = 'ChassisMountGtWing';
          const cmMainBlade = new THREE.Mesh(wingBladeGeo, wingAeroMat);
          cmMainBlade.scale.set(1.08, 1.1, 1.15);
          cmMainBlade.position.set(0, 1.24, -2.18);
          cmMainBlade.rotation.x = -0.14;
          cmMainBlade.castShadow = true;
          const cmUpperFlap = new THREE.Mesh(lowDragBladeGeo, wingAeroMat);
          cmUpperFlap.scale.set(1.22, 0.9, 0.72);
          cmUpperFlap.position.set(0, 1.29, -2.28);
          cmUpperFlap.rotation.x = -0.26;
          cmUpperFlap.castShadow = true;
          chassisMountWingGroup.add(cmMainBlade, cmUpperFlap);
          for (const side of [-1, 1]) {
            const ep = new THREE.Mesh(wingEndplateGeo, wingAeroMat);
            ep.scale.set(1, 1.25, 1.2);
            ep.position.set(side * 1.02, 1.22, -2.20);
            const upr = new THREE.Mesh(chassisMountGeo, trimAeroMat);
            upr.position.set(side * 0.42, 0.88, -2.22);
            upr.rotation.x = 0.08;
            chassisMountWingGroup.add(ep, upr);
          }
          chassisMountWingGroup.visible = false;
          chassisVisualGroup.add(chassisMountWingGroup);

          const buildWrapTexture = (cfg: CarVisualCustomization): THREE.CanvasTexture | null => {
            const needsCanvas =
              cfg.wrapPattern !== 'none' ||
              cfg.decalStyle !== 'none' ||
              cfg.paintFinish === 'carbon_weave';
            if (!needsCanvas || typeof document === 'undefined') return null;

            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 512;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            ctx.fillStyle = cfg.paintHex;
            ctx.fillRect(0, 0, 512, 512);

            if (cfg.paintFinish === 'carbon_weave') {
              ctx.fillStyle = 'rgba(8, 10, 14, 0.42)';
              const step = 16;
              for (let y = 0; y < 512; y += step) {
                for (let x = 0; x < 512; x += step) {
                  if (((x + y) / step) % 2 === 0) {
                    ctx.fillRect(x, y, step, step * 0.65);
                  } else {
                    ctx.fillRect(x, y + step * 0.35, step, step * 0.65);
                  }
                }
              }
            }

            if (cfg.wrapPattern === 'racing_stripe') {
              ctx.fillStyle = cfg.wrapAccentHex;
              ctx.fillRect(208, 0, 40, 512);
              ctx.fillRect(264, 0, 40, 512);
            } else if (cfg.wrapPattern === 'heritage_gulf') {
              ctx.fillStyle = cfg.wrapAccentHex;
              ctx.fillRect(176, 0, 160, 512);
              ctx.fillStyle = '#0f172a';
              ctx.fillRect(168, 0, 8, 512);
              ctx.fillRect(336, 0, 8, 512);
            } else if (cfg.wrapPattern === 'carbon_split') {
              ctx.fillStyle = '#14171d';
              ctx.beginPath();
              ctx.moveTo(0, 280);
              ctx.lineTo(512, 192);
              ctx.lineTo(512, 512);
              ctx.lineTo(0, 512);
              ctx.closePath();
              ctx.fill();
              ctx.strokeStyle = cfg.wrapAccentHex;
              ctx.lineWidth = 12;
              ctx.beginPath();
              ctx.moveTo(0, 280);
              ctx.lineTo(512, 192);
              ctx.stroke();
            }

            if (cfg.decalStyle !== 'none') {
              const numText = (cfg.racingNumber || '04').slice(0, 3);
              if (cfg.decalStyle === 'gt_banner' || cfg.decalStyle === 'full_race') {
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(0, 36, 512, 34);
                ctx.fillStyle = cfg.wrapAccentHex;
                ctx.fillRect(0, 70, 512, 6);
              }
              if (cfg.decalStyle === 'number_plate' || cfg.decalStyle === 'full_race') {
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(184, 196, 144, 120);
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 8;
                ctx.strokeRect(184, 196, 144, 120);
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 74px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(numText, 256, 260);
              }
              if (cfg.decalStyle === 'full_race') {
                ctx.fillStyle = cfg.wrapAccentHex;
                ctx.fillRect(32, 390, 124, 18);
                ctx.fillRect(356, 390, 124, 18);
              }
            }

            const tex = new THREE.CanvasTexture(canvas);
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.needsUpdate = true;
            return tex;
          };

          const savedGlassPropsMap = new Map<
            THREE.MeshStandardMaterial,
            { opacity: number; color: THREE.Color; envMapIntensity: number; clearcoat: number; depthWrite: boolean }
          >();

          const setVisualCustomization = (cfg: CarVisualCustomization) => {
            if (activeWrapTexture) {
              activeWrapTexture.dispose();
              activeWrapTexture = null;
            }
            activeWrapTexture = buildWrapTexture(cfg);
            wrapUniforms.uUseWrap.value = activeWrapTexture ? 1.0 : 0.0;
            wrapUniforms.uHasDoorDecal.value =
              cfg.decalStyle === 'number_plate' || cfg.decalStyle === 'full_race' ? 1.0 : 0.0;
            wrapUniforms.uWrapTex.value = activeWrapTexture ?? SHARED_FALLBACK_WRAP_TEX;

            const finishProps =
              cfg.paintFinish === 'gloss'
                ? { metalness: 0.25, roughness: 0.10, clearcoat: 1.0, clearcoatRoughness: 0.05, iridescence: 0 }
                : cfg.paintFinish === 'satin'
                  ? { metalness: 0.58, roughness: 0.34, clearcoat: 0.32, clearcoatRoughness: 0.34, iridescence: 0 }
                  : cfg.paintFinish === 'matte'
                    ? { metalness: 0.14, roughness: 0.65, clearcoat: 0.0, clearcoatRoughness: 0.65, iridescence: 0 }
                    : cfg.paintFinish === 'pearl'
                      ? { metalness: 0.64, roughness: 0.11, clearcoat: 1.0, clearcoatRoughness: 0.03, iridescence: 0.65 }
                      : cfg.paintFinish === 'carbon_weave'
                        ? { metalness: 0.34, roughness: 0.24, clearcoat: 0.85, clearcoatRoughness: 0.09, iridescence: 0 }
                        : { metalness: 0.80, roughness: 0.16, clearcoat: 1.0, clearcoatRoughness: 0.08, iridescence: 0 };

            const paintBaseCol = new THREE.Color(cfg.paintHex);
            const paintLum =
              0.2126 * paintBaseCol.r + 0.7152 * paintBaseCol.g + 0.0722 * paintBaseCol.b;
            // Automotive clearcoat compresses peak linear diffuse & env reflection on bright/white swatches
            const brightAtten =
              paintLum > 0.28 ? 1.0 - Math.min(0.30, (paintLum - 0.28) * 0.42) : 1.0;
            const envScale =
              paintLum > 0.28 ? 0.94 - Math.min(0.32, (paintLum - 0.28) * 0.46) : 1.04;

            for (const m of paintMainMats) {
              const origTex = profile.replaceBaseMapOnPaint ? null : (origMapByMat.get(m) ?? null);
              m.map = origTex;
              if (profile.replaceBaseMapOnPaint) {
                m.vertexColors = false;
              }
              const u = m.userData.carShaderUniforms as CarShaderUniforms | undefined;
              if (u) {
                u.uDesaturateMap.value = origTex ? 1.0 : 0.0;
              }
              if (activeWrapTexture) {
                m.color.setScalar(brightAtten);
              } else {
                m.color.copy(paintBaseCol).multiplyScalar(brightAtten);
              }
              m.metalness = finishProps.metalness;
              m.roughness = finishProps.roughness;
              m.envMapIntensity = envScale;
              const phys = m as THREE.MeshPhysicalMaterial;
              if ('clearcoat' in phys) {
                phys.clearcoat = finishProps.clearcoat;
                phys.clearcoatRoughness = finishProps.clearcoatRoughness;
                phys.specularIntensity = 0.96;
                if (phys.specularColor) phys.specularColor.setRGB(1, 1, 1);
              }
              if ('iridescence' in phys) {
                phys.iridescence = finishProps.iridescence;
                phys.iridescenceIOR = 1.38;
              }
              m.needsUpdate = true;
            }

            for (const m of paintAccentMats) {
              m.color.set(cfg.wrapPattern === 'none' ? cfg.paintHex : cfg.wrapAccentHex);
              m.needsUpdate = true;
            }

            // Per-part Trim / Carbon / Calipers / Exhaust / Glass / Headlight Tint
            const trimHex = cfg.trimHex || '#16191f';
            const trimCol = new THREE.Color(trimHex);
            const trimHsl = { h: 0, s: 0, l: 0 };
            trimCol.getHSL(trimHsl);
            const isDarkDefaultTrim = trimHsl.l < 0.14 && trimHsl.s < 0.25;
            trimAeroMat.color.set(trimHex);
            for (const tm of trimMats) {
              const hasTex = Boolean(tm.map);
              const u = tm.userData.carShaderUniforms as CarShaderUniforms | undefined;
              if (hasTex && isDarkDefaultTrim) {
                // Keep rich native carbon weave & grille contrast rather than crushing to flat black
                tm.color.set('#d8dee9');
                if (u) u.uDesaturateMap.value = 0.0;
              } else {
                tm.color.copy(trimCol);
                if (u) u.uDesaturateMap.value = hasTex ? 1.0 : 0.0;
              }
              tm.needsUpdate = true;
            }

            const wingHex = cfg.wingHex || trimHex;
            wingAeroMat.color.set(wingHex);
            for (const pwm of procWingMats) {
              pwm.color.set(wingHex);
              pwm.needsUpdate = true;
            }
            for (const ow of oemWingMeshes) {
              ow.visible = cfg.rearWingSize === 'oem';
            }

            const caliperHex = cfg.caliperHex || '#dc2626';
            for (const cm of caliperMats) {
              cm.color.set(caliperHex);
              const u = cm.userData.carShaderUniforms as CarShaderUniforms | undefined;
              if (u) u.uDesaturateMap.value = cm.map ? 1.0 : 0.0;
              cm.needsUpdate = true;
            }

            const exStyle =
              cfg.exhaustFinish === 'chrome'
                ? { hex: '#e2e8f0', rough: 0.08, metal: 0.98 }
                : cfg.exhaustFinish === 'burnt_ti'
                  ? { hex: '#6366f1', rough: 0.16, metal: 0.92 }
                  : cfg.exhaustFinish === 'black'
                    ? { hex: '#14171f', rough: 0.36, metal: 0.68 }
                    : { hex: '#a8b1bd', rough: 0.18, metal: 0.92 };
            for (const em of exhaustMats) {
              em.color.set(exStyle.hex);
              em.roughness = exStyle.rough;
              em.metalness = exStyle.metal;
              em.needsUpdate = true;
            }

            const wheelStyle =
              cfg.wheelFinish === 'custom_hex'
                ? { hex: cfg.rimHex || '#d1d5db', rough: 0.22, metal: 0.88 }
                : cfg.wheelFinish === 'machined_silver'
                  ? { hex: '#d1d5db', rough: 0.18, metal: 0.92 }
                  : cfg.wheelFinish === 'bronze_gold'
                    ? { hex: '#b5893a', rough: 0.24, metal: 0.86 }
                    : cfg.wheelFinish === 'white_race'
                      ? { hex: '#f1f5f9', rough: 0.28, metal: 0.16 }
                      : { hex: '#171920', rough: 0.38, metal: 0.65 };

            for (const rm of rimMats) {
              const low = rm.name.toLowerCase();
              if (
                low.includes('tyre') ||
                low.includes('tire') ||
                low.includes('disk') ||
                low.includes('disc') ||
                low.includes('rotor')
              ) {
                continue;
              }
              rm.color.set(wheelStyle.hex);
              rm.roughness = wheelStyle.rough;
              rm.metalness = wheelStyle.metal;
              const u = rm.userData.carShaderUniforms as CarShaderUniforms | undefined;
              if (u) u.uDesaturateMap.value = rm.map ? 1.0 : 0.0;
              rm.needsUpdate = true;
            }

            const tintColor = cfg.windowTintHex || '#0a0f18';
            const tintOp = Math.max(0.14, Math.min(0.88, cfg.windowTintOpacity ?? 0.36));
            for (const gm of glassMaterialsRef) {
              gm.color.set(tintColor);
              gm.opacity = tintOp;
              gm.needsUpdate = true;
              const saved = savedGlassPropsMap.get(gm);
              if (saved) {
                saved.opacity = tintOp;
                saved.color.set(tintColor);
              }
            }

            const hlTint = cfg.headlightTintHex || '#ffffff';
            for (const hm of headlightGlassMats) {
              hm.color.set(hlTint);
              hm.needsUpdate = true;
            }

            // Wheel Offset Lateral Stance (-12 .. +28 mm)
            const offsetM = (cfg.wheelOffsetMm ?? 0) * 0.001;
            for (let i = 0; i < 4; i++) {
              const steerP = wheelCamberPivots[i]?.parent;
              if (steerP) {
                const isLeft = i === 0 || i === 2;
                steerP.position.x = wheelBaseXs[i] + (isLeft ? 1 : -1) * offsetM;
              }
            }

            // Aero Body Kit Toggles
            const frontMode = cfg.frontAero ?? (cfg.showSplitter ? 'lip' : 'oem');
            frontLipMesh.visible = frontMode === 'lip';
            frontGtGroup.visible = frontMode === 'gt_splitter' || frontMode === 'canards';
            frontCanardsGroup.visible = frontMode === 'canards';

            const sideMode = cfg.sideAero ?? (cfg.showSideSkirts ? 'carbon_skirts' : 'oem');
            sideSkirtGroup.visible = sideMode === 'carbon_skirts' || sideMode === 'aero_blades';
            sideBladesGroup.visible = sideMode === 'aero_blades';

            const diffMode = cfg.rearDiffuser ?? 'oem';
            rearDiffuserGroup.visible = diffMode !== 'oem';
            diffTray.visible = diffMode === 'gt3_diffuser';
            for (let f = 0; f < diffFinMeshes.length; f++) {
              diffFinMeshes[f].visible =
                diffMode === 'gt3_diffuser' || (diffMode === 'venturi_fin' && (f === 1 || f === 2 || f === 3 || f === 4));
            }

            hoodVentsGroup.visible = cfg.hoodVents === 'louvered_carbon';

            ducktailWingGroup.visible = cfg.rearWingSize === 'lip';
            lowDragWingGroup.visible = cfg.rearWingSize === 'low_drag';
            customWingGroup.visible = cfg.rearWingSize === 'gt_high';
            chassisMountWingGroup.visible = cfg.rearWingSize === 'chassis_mount';
          };

          const setStance = (
            camberFrontDeg: number,
            camberRearDeg: number,
            rideHeightMm: number,
            wheelDiameterIn = 19,
          ) => {
            // Negative camber tilts top of wheel inward toward chassis
            const radF = (-camberFrontDeg * Math.PI) / 180;
            const radR = (-camberRearDeg * Math.PI) / 180;
            wheelCamberPivots[0].rotation.z = radF;  // FL (+X left)
            wheelCamberPivots[1].rotation.z = -radF; // FR (-X right)
            wheelCamberPivots[2].rotation.z = radR;  // RL (+X left)
            wheelCamberPivots[3].rotation.z = -radR; // RR (-X right)

            const wheelScale = 1 + ((wheelDiameterIn ?? 19) - 19) * 0.022;
            for (let i = 0; i < 4; i++) {
              wheelCamberPivots[i].scale.setScalar(wheelScale);
              const steerP = wheelCamberPivots[i]?.parent;
              if (steerP) {
                steerP.position.y = wheelBaseYs[i] * wheelScale;
              }
            }

            // Adjust chassis visual ride height relative to baseline 60mm
            const dh = Math.max(-0.028, Math.min(0.036, ((rideHeightMm ?? 60) - 60) * 0.001));
            chassisVisualGroup.position.y = dh;
          };

          const setLights = (
            headlightsOn: boolean,
            brakingIntensity: number,
            nightFactor: number,
          ) => {
            const hlLevel = headlightsOn ? Math.max(nightFactor, 0.92) : 0.08;
            for (const m of headlightMats) {
              m.emissiveIntensity = headlightsOn ? 1.2 + hlLevel * 3.8 : 0.22;
            }
            const power = withHeadlightSpots && headlightsOn ? 1.0 : 0;
            const spotsActive = power > 0.01;
            headlightSpotLeft.intensity = 88.0 * power;
            headlightSpotRight.intensity = 88.0 * power;
            headlightFloodSpot.intensity = 62.0 * power;
            headlightNearPoint.intensity = 22.0 * power;
            headlightSpotLeft.visible = spotsActive;
            headlightSpotRight.visible = spotsActive;
            headlightFloodSpot.visible = spotsActive;
            headlightNearPoint.visible = spotsActive;

            const tailPower = 0.85 + nightFactor * 0.9 + brakingIntensity * 4.2;
            for (const m of brakeLightMats) {
              m.emissiveIntensity = tailPower;
            }
          };

          const setInteriorMode = (isInterior: boolean) => {
            const cache = savedGlassPropsMap;
            for (const m of interiorObstructMeshes) {
              m.visible = !isInterior;
            }
            for (const glassMat of glassMaterialsRef) {
              let saved = cache.get(glassMat);
              if (!saved) {
                const physInit = glassMat as THREE.MeshPhysicalMaterial;
                saved = {
                  opacity: glassMat.opacity > 0.08 ? glassMat.opacity : 0.34,
                  color: glassMat.color.clone(),
                  envMapIntensity: glassMat.envMapIntensity,
                  clearcoat: 'clearcoat' in physInit ? physInit.clearcoat : 1.0,
                  depthWrite: glassMat.depthWrite,
                };
                cache.set(glassMat, saved);
              }
              const phys = glassMat as THREE.MeshPhysicalMaterial;
              if (isInterior) {
                glassMat.opacity = 0.012;
                glassMat.depthWrite = false;
                glassMat.color.setRGB(1, 1, 1);
                glassMat.envMapIntensity = 0.0;
                if ('clearcoat' in phys) {
                  phys.clearcoat = 0.0;
                }
              } else {
                glassMat.opacity = saved.opacity;
                glassMat.depthWrite = saved.depthWrite;
                glassMat.color.copy(saved.color);
                glassMat.envMapIntensity = saved.envMapIntensity;
                if ('clearcoat' in phys) {
                  phys.clearcoat = saved.clearcoat;
                }
              }
            }
          };

          const setSteeringWheelAngle = (steerRad: number) => {
            if (steeringSpinPivot) {
              steeringSpinPivot.rotation.z = -steerRad * 2.15;
            }
            driverRig.setSteer(steerRad);
          };

          const setDirtAndWeather = (dirtLevel: number, wetness: number) => {
            dirtUniforms.uDirtLevel.value = dirtLevel;
            dirtUniforms.uWetness.value = wetness;
          };

          let aeroFactor = 1.0;
          const setActiveAeroState = (enabled: boolean, deployed: boolean, deltaSec = 0.016) => {
            const target = enabled ? (deployed ? 1.0 : 0.0) : 0.65;
            const alpha = deltaSec >= 0.45 ? 1.0 : Math.min(1.0, Math.max(0.05, deltaSec * 12.0));
            aeroFactor += (target - aeroFactor) * alpha;

            frontLipMesh.position.z = 2.18 + aeroFactor * 0.045;
            frontLipMesh.position.y = 0.132 - aeroFactor * 0.012;
            frontGtGroup.position.z = aeroFactor * 0.048;
            frontGtGroup.position.y = -aeroFactor * 0.014;
            frontCanardsGroup.rotation.x = aeroFactor * 0.14;

            ducktailMesh.rotation.x = 0.22 + aeroFactor * 0.26;
            ldBlade.rotation.x = -0.02 - aeroFactor * 0.16;
            wingBlade.rotation.x = -0.02 - aeroFactor * 0.22;
            cmMainBlade.rotation.x = -0.03 - aeroFactor * 0.18;
            cmUpperFlap.rotation.x = -0.03 - aeroFactor * 0.34;
            cmUpperFlap.position.y = 1.275 + aeroFactor * 0.032;

            // Active diffuser vane angle & subtle aerodynamic rake on OEM-wing bodywork
            rearDiffuserGroup.rotation.x = -(1.0 - aeroFactor) * 0.06;
            chassisVisualGroup.rotation.x = (aeroFactor - 0.5) * 0.0055;
          };

          return {
            carId,
            root,
            bodySpringGroup,
            chassisVisualGroup,
            frontWheelSteerPivots,
            wheelCamberPivots,
            wheelSpinPivots,
            wheelBaseYs,
            wheelBaseXs,
            steeringSpinPivot,
            cockpitEyePos: cockpitEyePos.clone(),
            windshieldPos: windshieldPos.clone(),
            hoodCamPos: hoodCamPos.clone(),
            bumperCamPos: bumperCamPos.clone(),
            carLengthM,
            headlightSpotLeft,
            headlightSpotRight,
            wheelRadius: avgWheelRadius,
            setLights,
            setInteriorMode,
            setSteeringWheelAngle,
            setDirtAndWeather,
            setVisualCustomization,
            setStance,
            setActiveAeroState,
            setWireframe: (wire: boolean) => {
              for (const m of wireframeMats) m.wireframe = wire;
            },
            dispose: () => {
              driverRig.dispose();
              if (activeWrapTexture) activeWrapTexture.dispose();
              headlightSpotLeft.dispose();
              headlightSpotRight.dispose();
              headlightFloodSpot.dispose();
              headlightNearPoint.dispose();
              for (const g of instanceGeometries) g.dispose();
              for (const m of instanceMaterials) m.dispose();
            },
          };
        };

        let currentQuality: CarTextureQualityTier = initialQuality;
        let currentMaxAniso = maxAnisotropy;

        resolve({
          carId,
          createInstance,
          setTextureQuality: (quality: CarTextureQualityTier, maxAniso = 8) => {
            if (quality === currentQuality && maxAniso === currentMaxAniso) {
              return;
            }
            currentQuality = quality;
            currentMaxAniso = maxAniso;
            applyQualityToManagedTextures(managedTexList, quality, maxAniso);
          },
          dispose: () => {
            if (templatePromiseCache.get(profileCarId) === promise) {
              templatePromiseCache.delete(profileCarId);
            }
            resolvedTemplateSet.delete(profileCarId);
            cleanupInFlightState(false);
            for (const g of templateGeometries) g.dispose();
            for (const m of templateMaterials) {
              const std = m as THREE.MeshStandardMaterial;
              std.map?.dispose();
              std.normalMap?.dispose();
              std.roughnessMap?.dispose();
              std.metalnessMap?.dispose();
              std.emissiveMap?.dispose();
              m.dispose();
            }
          },
        });
      };

    void fetchModelArrayBufferResilient(profile.url, modelFormat, emitProgress, abortController.signal)
      .then((arrayBuffer) => {
        if (abortController.signal.aborted) {
          cleanupInFlightState(true);
          reject(new DOMException('Model load aborted', 'AbortError'));
          return;
        }
        if (modelFormat === 'usdz') {
          try {
            const usdzRoot = new USDLoader().parse(arrayBuffer);
            onGltfParsed({ scene: usdzRoot });
          } catch (parseErr) {
            cleanupInFlightState(true);
            reject(parseErr);
          }
          return;
        }
        loader.parse(
          arrayBuffer,
          resourceBasePath,
          onGltfParsed,
          (parseErr) => {
            cleanupInFlightState(true);
            reject(parseErr);
          },
        );
      })
      .catch((fetchErr) => {
        cleanupInFlightState(true);
        reject(fetchErr);
      });
  });

  templatePromiseCache.set(profileCarId, promise);
  return promise;
}

/**
 * Backward-compatible alias for loading the lead GT3 car.
 */
export function loadMcLarenTemplate(
  onProgress?: (percent: number) => void,
  initialQuality: CarTextureQualityTier = 'balanced',
  maxAnisotropy = 8,
): Promise<McLarenTemplate> {
  return loadCarTemplate('bmw-m4-gt3-evo', onProgress, initialQuality, maxAnisotropy);
}
