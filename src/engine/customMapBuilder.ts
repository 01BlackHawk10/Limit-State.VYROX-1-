import * as THREE from 'three';
import type {
  BuilderPropInstance,
  BuilderPropType,
  CustomControlPoint,
  CustomMapBlueprint,
  MapDifficultyTag,
  MapTemplateId,
  MapTypeTag,
  StudioMaterialId,
  TerrainMaterialId,
  TerrainMaterialStamp,
  TerrainSculptStamp,
} from '../shared/socialTypes';
import { worldColliders } from '../Maps/Aurelia Ridge/worldColliders';
import { clamp, lerp, smootherstep } from './mathNoise';
import {
  getCachedUserAsset,
  loadUserAsset,
  type NormalizedUserAsset,
  type UserAssetId,
} from './userAssetsLoader';

export interface TerrainMaterialDefinition {
  id: TerrainMaterialId;
  label: string;
  hex: string;
  secondaryHex: string;
  roughness: number;
  metalness: number;
  gripMu: number;
  rollingCoeff: number;
  audioSurface: 'asphalt' | 'curb' | 'gravel' | 'snow';
}

export const TERRAIN_MATERIAL_DEFS: TerrainMaterialDefinition[] = [
  {
    id: 'grass',
    label: 'Lush Grass',
    hex: '#3b6e32',
    secondaryHex: '#568d43',
    roughness: 0.92,
    metalness: 0.02,
    gripMu: 0.72,
    rollingCoeff: 0.045,
    audioSurface: 'gravel',
  },
  {
    id: 'asphalt',
    label: 'Tarmac',
    hex: '#242933',
    secondaryHex: '#333b48',
    roughness: 0.72,
    metalness: 0.06,
    gripMu: 1.40,
    rollingCoeff: 0.013,
    audioSurface: 'asphalt',
  },
  {
    id: 'sand',
    label: 'Desert Sand',
    hex: '#c9a66b',
    secondaryHex: '#b28c4e',
    roughness: 0.94,
    metalness: 0.02,
    gripMu: 0.58,
    rollingCoeff: 0.062,
    audioSurface: 'gravel',
  },
  {
    id: 'rock',
    label: 'Basalt Rock',
    hex: '#57606f',
    secondaryHex: '#3f4754',
    roughness: 0.90,
    metalness: 0.08,
    gripMu: 0.94,
    rollingCoeff: 0.028,
    audioSurface: 'gravel',
  },
  {
    id: 'snow',
    label: 'Alpine Snow',
    hex: '#e4eef8',
    secondaryHex: '#cbdcf0',
    roughness: 0.78,
    metalness: 0.04,
    gripMu: 0.52,
    rollingCoeff: 0.058,
    audioSurface: 'snow',
  },
  {
    id: 'concrete',
    label: 'Concrete',
    hex: '#8c96a4',
    secondaryHex: '#737d8b',
    roughness: 0.84,
    metalness: 0.05,
    gripMu: 1.32,
    rollingCoeff: 0.015,
    audioSurface: 'asphalt',
  },
  {
    id: 'dirt',
    label: 'Rally Dirt',
    hex: '#7b5333',
    secondaryHex: '#5f3d23',
    roughness: 0.95,
    metalness: 0.02,
    gripMu: 0.66,
    rollingCoeff: 0.052,
    audioSurface: 'gravel',
  },
  {
    id: 'cobble',
    label: 'Paver Stone',
    hex: '#69727e',
    secondaryHex: '#4f5762',
    roughness: 0.80,
    metalness: 0.06,
    gripMu: 1.18,
    rollingCoeff: 0.020,
    audioSurface: 'curb',
  },
  {
    id: 'ice',
    label: 'Glacier Ice',
    hex: '#7dd3fc',
    secondaryHex: '#bae6fd',
    roughness: 0.16,
    metalness: 0.12,
    gripMu: 0.36,
    rollingCoeff: 0.010,
    audioSurface: 'snow',
  },
  {
    id: 'neon_grid',
    label: 'Neon Grid',
    hex: '#0f1c2e',
    secondaryHex: '#38bdf8',
    roughness: 0.42,
    metalness: 0.32,
    gripMu: 1.38,
    rollingCoeff: 0.013,
    audioSurface: 'asphalt',
  },
];

export const TERRAIN_MATERIAL_MAP: Record<TerrainMaterialId, TerrainMaterialDefinition> =
  Object.fromEntries(TERRAIN_MATERIAL_DEFS.map((m) => [m.id, m])) as Record<
    TerrainMaterialId,
    TerrainMaterialDefinition
  >;

export const STUDIO_PROP_MATERIAL_DEFS: Array<{
  id: StudioMaterialId;
  label: string;
}> = [
  { id: 'default', label: 'Default' },
  { id: 'plastic', label: 'Smooth Plastic' },
  { id: 'metal', label: 'Brushed Metal' },
  { id: 'carbon', label: 'Carbon Fiber' },
  { id: 'neon', label: 'Neon Glow' },
  { id: 'concrete', label: 'Concrete' },
  { id: 'wood', label: 'Timber Wood' },
  { id: 'glass', label: 'Tinted Glass' },
  { id: 'ice', label: 'Glacier Ice' },
];

export interface MapTemplateDefinition {
  id: MapTemplateId;
  name: string;
  subtitle: string;
  closedLoop: boolean;
  mapType: MapTypeTag;
  difficulty: MapDifficultyTag;
  roadWidth: number;
  controlPoints: CustomControlPoint[];
  placedProps: BuilderPropInstance[];
}

export const MAP_TEMPLATES: Record<MapTemplateId, MapTemplateDefinition> = {
  blank_loop: {
    id: 'blank_loop',
    name: 'Studio Flat Circuit',
    subtitle: 'Clean studio baseplate circuit ready for custom spline painting & props',
    closedLoop: true,
    mapType: 'circuit',
    difficulty: 'easy',
    roadWidth: 16,
    controlPoints: [
      { x: -160, y: 20, z: 210, bankDeg: 0 },
      { x: 0, y: 20, z: 210, bankDeg: 0 },
      { x: 185, y: 20, z: 205, bankDeg: 0 },
      { x: 265, y: 20, z: 45, bankDeg: 4 },
      { x: 185, y: 20, z: -155, bankDeg: 6 },
      { x: 0, y: 20, z: -215, bankDeg: 0 },
      { x: -195, y: 20, z: -145, bankDeg: 5 },
      { x: -255, y: 20, z: 45, bankDeg: 3 },
    ],
    placedProps: [
      { id: 'tpl_arch_1', type: 'arch', x: 0, y: 20, z: 210, rotY: Math.PI * 0.5, scale: 1 },
      { id: 'tpl_gs_1', type: 'grandstand', x: -10, y: 20, z: 238, rotY: Math.PI, scale: 1 },
    ],
  },
  speed_oval: {
    id: 'speed_oval',
    name: 'High-Banked Superspeedway',
    subtitle: 'Twin sweeping 14° banked bowls for 350+ km/h drafting battles',
    closedLoop: true,
    mapType: 'circuit',
    difficulty: 'easy',
    roadWidth: 19,
    controlPoints: [
      { x: -190, y: 20, z: 185, bankDeg: 0 },
      { x: 0, y: 20, z: 185, bankDeg: 0 },
      { x: 190, y: 20, z: 185, bankDeg: 0 },
      { x: 315, y: 26, z: 85, bankDeg: 14 },
      { x: 315, y: 26, z: -85, bankDeg: 14 },
      { x: 190, y: 20, z: -185, bankDeg: 0 },
      { x: 0, y: 20, z: -185, bankDeg: 0 },
      { x: -190, y: 20, z: -185, bankDeg: 0 },
      { x: -315, y: 26, z: -85, bankDeg: 14 },
      { x: -315, y: 26, z: 85, bankDeg: 14 },
    ],
    placedProps: [
      { id: 'oval_arch', type: 'arch', x: 0, y: 20, z: 185, rotY: Math.PI * 0.5, scale: 1.15 },
      { id: 'oval_boost_1', type: 'boost_pad', x: 95, y: 20, z: 185, rotY: Math.PI * 0.5, scale: 1 },
      { id: 'oval_boost_2', type: 'boost_pad', x: -95, y: 20, z: -185, rotY: -Math.PI * 0.5, scale: 1 },
    ],
  },
  canyon_switchback: {
    id: 'canyon_switchback',
    name: 'Stunt & Switchback Sprint',
    subtitle: 'Point-to-point touge sprint on flat baseplate with mega ramps and boost pads',
    closedLoop: false,
    mapType: 'sprint',
    difficulty: 'hard',
    roadWidth: 15,
    controlPoints: [
      { x: -290, y: 20, z: 245, bankDeg: 0 },
      { x: -120, y: 20, z: 245, bankDeg: 0 },
      { x: 45, y: 24, z: 175, bankDeg: 5 },
      { x: -65, y: 31, z: 65, bankDeg: -6 },
      { x: 125, y: 38, z: -15, bankDeg: 7 },
      { x: -20, y: 45, z: -125, bankDeg: -7 },
      { x: 195, y: 52, z: -195, bankDeg: 6 },
      { x: 310, y: 56, z: -295, bankDeg: 0 },
    ],
    placedProps: [
      { id: 'sw_arch', type: 'arch', x: -245, y: 20, z: 245, rotY: Math.PI * 0.5, scale: 1 },
      { id: 'sw_boost', type: 'boost_pad', x: -75, y: 20, z: 235, rotY: 1.2, scale: 1 },
      { id: 'sw_ramp', type: 'ramp', x: 15, y: 22, z: 190, rotY: 1.05, scale: 1 },
      { id: 'sw_chk', type: 'checkpoint', x: 125, y: 38, z: -15, rotY: 0.4, scale: 1 },
    ],
  },
  figure_eight: {
    id: 'figure_eight',
    name: 'Crossover Figure-8 (Auto Tunnel)',
    subtitle: 'Elevated overpass crossing directly over an automatic 3D underpass tunnel',
    closedLoop: true,
    mapType: 'stunt',
    difficulty: 'medium',
    roadWidth: 16,
    controlPoints: [
      { x: -155, y: 20, z: 195, bankDeg: 0 },
      { x: 0, y: 20, z: 195, bankDeg: 0 },
      { x: 185, y: 20, z: 165, bankDeg: 4 },
      { x: 260, y: 24, z: 25, bankDeg: 8 },
      { x: 130, y: 29, z: -85, bankDeg: 3 },
      { x: 0, y: 31, z: 0, bankDeg: 0 },
      { x: -145, y: 25, z: 95, bankDeg: -6 },
      { x: -275, y: 22, z: -25, bankDeg: 8 },
      { x: -215, y: 22, z: -195, bankDeg: 5 },
      { x: -35, y: 20, z: -185, bankDeg: 3 },
      { x: 0, y: 20, z: 0, bankDeg: 0 },
      { x: -165, y: 20, z: 145, bankDeg: 0 },
    ],
    placedProps: [
      { id: 'f8_arch', type: 'arch', x: 0, y: 20, z: 195, rotY: Math.PI * 0.5, scale: 1 },
    ],
  },
  technical_gp: {
    id: 'technical_gp',
    name: 'Technical GT Club',
    subtitle: 'Tight chicanes, double-apex hairpins, and heavy braking zones',
    closedLoop: true,
    mapType: 'circuit',
    difficulty: 'medium',
    roadWidth: 15,
    controlPoints: [
      { x: -185, y: 20, z: 225, bankDeg: 0 },
      { x: 15, y: 20, z: 225, bankDeg: 0 },
      { x: 205, y: 20, z: 215, bankDeg: 0 },
      { x: 255, y: 20, z: 85, bankDeg: 3 },
      { x: 115, y: 20, z: 35, bankDeg: -4 },
      { x: 215, y: 20, z: -95, bankDeg: 6 },
      { x: 95, y: 20, z: -225, bankDeg: 4 },
      { x: -45, y: 20, z: -145, bankDeg: -5 },
      { x: -195, y: 20, z: -235, bankDeg: 6 },
      { x: -285, y: 20, z: -65, bankDeg: 4 },
      { x: -235, y: 20, z: 95, bankDeg: 2 },
    ],
    placedProps: [
      { id: 'gp_arch', type: 'arch', x: 15, y: 20, z: 225, rotY: Math.PI * 0.5, scale: 1 },
      { id: 'gp_gs', type: 'grandstand', x: 15, y: 20, z: 252, rotY: Math.PI, scale: 1 },
    ],
  },
  aurelia_remix: {
    id: 'aurelia_remix',
    name: 'Aurelia Ridge Remixer',
    subtitle: 'Full Dolomite Alpine terrain unlocked for custom ramps, props & sculpting',
    closedLoop: true,
    mapType: 'circuit',
    difficulty: 'medium',
    roadWidth: 15,
    controlPoints: [
      { x: -215, y: 20.0, z: 240, bankDeg: 0 },
      { x: -25, y: 20.0, z: 240, bankDeg: 0 },
      { x: 165, y: 20.0, z: 240, bankDeg: 0 },
      { x: 275, y: 12.2, z: 195, bankDeg: 4 },
      { x: 305, y: 24.5, z: 92, bankDeg: 3 },
      { x: 218, y: 21.8, z: 22, bankDeg: 0 },
      { x: 75, y: 22.4, z: 2, bankDeg: 0 },
      { x: -68, y: 22.8, z: -18, bankDeg: 0 },
      { x: -138, y: 26.5, z: -96, bankDeg: 4 },
      { x: -32, y: 34.5, z: -158, bankDeg: 8 },
      { x: 135, y: 37.5, z: -135, bankDeg: 10 },
      { x: 245, y: 42.5, z: -212, bankDeg: 5 },
      { x: 152, y: 48.0, z: -295, bankDeg: 4 },
      { x: 8, y: 40.0, z: -248, bankDeg: -4 },
      { x: -128, y: 34.5, z: -294, bankDeg: 4 },
      { x: -276, y: 29.0, z: -224, bankDeg: 5 },
      { x: -325, y: 24.5, z: -52, bankDeg: 0 },
      { x: -310, y: 21.0, z: 125, bankDeg: 3 },
      { x: -270, y: 20.0, z: 195, bankDeg: 4 },
    ],
    placedProps: [
      { id: 'ar_arch', type: 'arch', x: -25, y: 20, z: 240, rotY: Math.PI * 0.5, scale: 1 },
    ],
  },
};

export function createBlueprintFromTemplate(
  templateId: MapTemplateId,
  authorId = 'local',
  authorUsername = 'Driver',
): CustomMapBlueprint {
  const tpl = MAP_TEMPLATES[templateId] ?? MAP_TEMPLATES.blank_loop;
  const now = Date.now();
  return {
    id: `map_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title: tpl.name,
    description: tpl.subtitle,
    authorId,
    authorUsername,
    isPublished: false,
    closedLoop: tpl.closedLoop,
    mapType: tpl.mapType,
    difficulty: tpl.difficulty,
    templateId: tpl.id,
    baseplateTheme: tpl.id === 'aurelia_remix' ? 'grassland' : 'studio_grid',
    roadSurfaceTheme: 'asphalt',
    kerbTheme: 'red_white',
    autoTunnels: true,
    waterEnabled: false,
    waterLevel: 17.5,
    roadWidth: tpl.roadWidth,
    splineTension: 0.45,
    bankingScale: 1.0,
    gripScale: 1.0,
    kerbHeightScale: 1.0,
    asphaltWear: 0.35,
    foliageDensity: 0.9,
    defaultWeather: 'dry',
    defaultSolarDeg: 30,
    defaultHaze: 'golden',
    controlPoints: tpl.controlPoints.map((pt) => ({ ...pt })),
    terrainStamps: [],
    terrainMaterialStamps: [],
    placedProps: tpl.placedProps.map((p) => ({
      ...p,
      id: `${p.id}_${Math.random().toString(36).slice(2, 6)}`,
    })),
    likesCount: 0,
    playsCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

let activeEffectsBlueprint: CustomMapBlueprint | null = null;
let rampPropsCache: BuilderPropInstance[] = [];
let boostPropsCache: BuilderPropInstance[] = [];
let materialStampsCache: TerrainMaterialStamp[] = [];

export function setActiveBlueprintEffects(bp: CustomMapBlueprint | null): void {
  activeEffectsBlueprint = bp;
  if (!bp) {
    rampPropsCache = [];
    boostPropsCache = [];
    materialStampsCache = [];
    return;
  }
  rampPropsCache = bp.placedProps.filter(
    (p) => p.type === 'ramp' || p.type === 'mega_ramp' || p.type === 'jump_gap',
  );
  boostPropsCache = bp.placedProps.filter((p) => p.type === 'boost_pad');
  materialStampsCache = bp.terrainMaterialStamps ?? [];
}

export function getActiveBlueprintEffects(): CustomMapBlueprint | null {
  return activeEffectsBlueprint;
}

export function sampleActiveTerrainMaterial(x: number, z: number): TerrainMaterialId | null {
  if (materialStampsCache.length === 0) return null;
  for (let i = materialStampsCache.length - 1; i >= 0; i--) {
    const s = materialStampsCache[i];
    const d = Math.hypot(x - s.x, z - s.z);
    if (d <= s.radius) {
      return s.material;
    }
  }
  return null;
}

export function sampleTerrainStampsOffset(
  x: number,
  z: number,
  baseHeight: number,
  stamps: TerrainSculptStamp[],
): number {
  if (!stamps || stamps.length === 0) return baseHeight;
  let h = baseHeight;
  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i];
    const dist = Math.hypot(x - s.x, z - s.z);
    if (dist >= s.radius) continue;
    const falloff = 1 - smootherstep(0.08, 1.0, dist / Math.max(1, s.radius));
    if (s.mode === 'raise') {
      h += Math.abs(s.deltaY) * falloff;
    } else if (s.mode === 'lower') {
      h -= Math.abs(s.deltaY) * falloff;
    } else if (s.mode === 'flatten') {
      const target = s.targetY ?? baseHeight;
      h = lerp(h, target, falloff * 0.85);
    } else if (s.mode === 'smooth') {
      const target = s.targetY ?? h;
      h = lerp(h, target, falloff * 0.45);
    }
  }
  return clamp(h, -25, 280);
}

export function sampleActiveRampSurface(x: number, z: number, baseY: number): number {
  if (rampPropsCache.length === 0) return baseY;
  let maxY = baseY;
  for (let i = 0; i < rampPropsCache.length; i++) {
    const r = rampPropsCache[i];
    const sc = clamp(r.scale || 1, 0.2, 6.0);
    const sx = clamp(r.scaleX ?? sc, 0.2, 6.0);
    const sy = clamp(r.scaleY ?? sc, 0.2, 6.0);
    const sz = clamp(r.scaleZ ?? sc, 0.2, 6.0);
    const baseHalfW = r.type === 'mega_ramp' ? 5.6 : 4.4;
    const baseHalfL = r.type === 'mega_ramp' ? 11.0 : r.type === 'jump_gap' ? 5.2 : 6.5;
    const basePeakH = r.type === 'mega_ramp' ? 6.2 : r.type === 'jump_gap' ? 2.4 : 3.2;

    const halfW = baseHalfW * sx;
    const halfL = baseHalfL * sz;
    const dx = x - r.x;
    const dz = z - r.z;
    if (Math.abs(dx) > halfL + halfW + 2 || Math.abs(dz) > halfL + halfW + 2) continue;

    const c = Math.cos(-r.rotY);
    const s = Math.sin(-r.rotY);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) <= halfW && Math.abs(lz) <= halfL) {
      const progress = clamp((lz + halfL) / (halfL * 2), 0, 1);
      const curveFactor = r.type === 'mega_ramp' ? progress * progress * 0.45 + progress * 0.55 : progress;
      const rampY = r.y + curveFactor * (basePeakH * sy);
      if (rampY > maxY) {
        maxY = rampY;
      }
    }
  }
  return maxY;
}

export function queryBoostPadImpulse(
  x: number,
  z: number,
  y: number,
): { active: boolean; dirX: number; dirZ: number; boostAccel: number } | null {
  if (boostPropsCache.length === 0) return null;
  for (let i = 0; i < boostPropsCache.length; i++) {
    const b = boostPropsCache[i];
    const sc = clamp(b.scale || 1, 0.2, 6.0);
    const sx = clamp(b.scaleX ?? sc, 0.2, 6.0);
    const sz = clamp(b.scaleZ ?? sc, 0.2, 6.0);
    if (Math.abs(y - b.y) > 4.5) continue;
    const dx = x - b.x;
    const dz = z - b.z;
    const c = Math.cos(-b.rotY);
    const s = Math.sin(-b.rotY);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) <= 4.0 * sx && Math.abs(lz) <= 4.2 * sz) {
      return {
        active: true,
        dirX: Math.sin(b.rotY),
        dirZ: Math.cos(b.rotY),
        boostAccel: 28 * clamp(sc, 0.6, 2.5),
      };
    }
  }
  return null;
}

export const BUILDER_PROP_CATALOG: Array<{
  type: BuilderPropType;
  category: 'stunt' | 'barrier' | 'structure' | 'scenery';
  label: string;
  desc: string;
  solid: boolean;
}> = [
  // Stunt & Timing (8)
  { type: 'ramp', category: 'stunt', label: 'Stunt Ramp', desc: 'Steel-truss wedge deck with LED lip', solid: false },
  { type: 'mega_ramp', category: 'stunt', label: 'Mega Ramp', desc: 'Parabolic launch ramp with truss towers', solid: false },
  { type: 'jump_gap', category: 'stunt', label: 'Split Jump', desc: 'Grip-deck kicker with hazard plates', solid: false },
  { type: 'loop_ring', category: 'stunt', label: 'Stunt Hoop', desc: 'Dual-ring steel & neon aerial gate', solid: false },
  { type: 'boost_pad', category: 'stunt', label: 'Boost Pad', desc: 'Carbon bed with 3x glowing turbo chevrons', solid: false },
  { type: 'speed_trap', category: 'stunt', label: 'Speed Trap', desc: 'FIA dual-mast radar speed telemetry gate', solid: false },
  { type: 'drift_zone', category: 'stunt', label: 'Drift Zone', desc: 'Illuminated apex clip rail & flex beacons', solid: false },
  { type: 'checkpoint', category: 'stunt', label: 'Checkpoint', desc: 'Laser sector gate with timing clock', solid: false },
  // Barriers & Track (5)
  { type: 'tire_barrier', category: 'barrier', label: 'Tire Wall', desc: 'Strapped 2-tier stacked racing tires', solid: true },
  { type: 'guardrail', category: 'barrier', label: 'Armco Rail', desc: 'Double-wave steel W-beam with terminal ends', solid: true },
  { type: 'race_fence', category: 'barrier', label: 'Race Fence', desc: 'FIA debris catch fence panel section', solid: true },
  { type: 'track_fence', category: 'barrier', label: 'Barrier Fence', desc: 'Tall concrete-base motorsport catch fence', solid: true },
  { type: 'protective_fence', category: 'barrier', label: 'Paddock Mesh', desc: 'Galvanized metallic avenue & paddock fence', solid: true },
  { type: 'tecpro_barrier', category: 'barrier', label: 'TecPro Foam', desc: 'Beveled FIA crash blocks with straps', solid: true },
  { type: 'cone', category: 'barrier', label: 'Apex Cone', desc: 'Weighted rubber base & reflective collars', solid: false },
  { type: 'curb_strip', category: 'barrier', label: 'Apex Kerb', desc: 'Sloped beveled serrated FIA rumble kerb', solid: false },
  // Structures (8)
  { type: 'arch', category: 'structure', label: 'Start Arch', desc: 'Lattice truss bridge with APEX GT banner', solid: false },
  { type: 'pit_garage', category: 'structure', label: 'Pit Garage', desc: '3-bay lit paddock with open shutters & HVAC', solid: true },
  { type: 'grandstand', category: 'structure', label: 'Grandstand', desc: 'Tiered spectator tribune & cantilevered roof', solid: true },
  { type: 'floodlight', category: 'structure', label: 'Floodlight', desc: 'Tapered mast with 4x stadium flood projectors', solid: true },
  { type: 'light_gantry', category: 'structure', label: 'Start Lights', desc: '5-pod twin-lens FIA grid starter bridge', solid: false },
  { type: 'tunnel_portal', category: 'structure', label: 'Tunnel Arch', desc: 'Buttressed concrete portal with lane signals', solid: false },
  { type: 'bridge_truss', category: 'structure', label: 'Steel Truss', desc: 'Warren diagonal steel overpass truss span', solid: false },
  { type: 'billboard', category: 'structure', label: 'Sponsor Board', desc: 'H-beam hoarding with uplights & catwalk', solid: true },
  // Scenery (3)
  { type: 'tree', category: 'scenery', label: 'Alpine Pine', desc: '4-tier layered conifer with bark trunk', solid: true },
  { type: 'palm_tree', category: 'scenery', label: 'Coastal Palm', desc: 'Segmented curved trunk & 8 arched fronds', solid: true },
  { type: 'boulder', category: 'scenery', label: 'Granite Rock', desc: 'Multi-stone weathered outcrop cluster', solid: true },
];

// ── Procedural Canvas Texture Suite for Redesigned Studio Props ────────────────

function createPropTextures() {
  const disposables: THREE.Texture[] = [];

  const makeTex = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repX = 1, repY = 1) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (ctx) draw(ctx);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repX, repY);
    disposables.push(t);
    return t;
  };

  // 1. Carbon Weave / Non-Slip Ramp Deck
  const rampDeckTex = makeTex(
    256,
    256,
    (ctx) => {
      ctx.fillStyle = '#171c26';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#232b3a';
      for (let y = 0; y < 256; y += 16) {
        for (let x = 0; x < 256; x += 16) {
          if (((x + y) / 16) % 2 === 0) {
            ctx.fillRect(x, y, 8, 8);
          }
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.fillRect(x + 2, y + 2, 4, 4);
          ctx.fillStyle = '#232b3a';
        }
      }
      // Subtle center guide line
      ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
      ctx.fillRect(122, 0, 12, 256);
    },
    1,
    2,
  );

  // 2. Boost Pad Glowing Chevrons
  const boostTex = makeTex(256, 256, (ctx) => {
    ctx.fillStyle = '#09101a';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, 244, 244);

    for (let i = 0; i < 3; i++) {
      const cy = 200 - i * 70;
      ctx.beginPath();
      ctx.moveTo(46, cy + 28);
      ctx.lineTo(128, cy - 16);
      ctx.lineTo(210, cy + 28);
      ctx.lineTo(188, cy + 44);
      ctx.lineTo(128, cy + 10);
      ctx.lineTo(68, cy + 44);
      ctx.closePath();
      ctx.fillStyle = i === 2 ? '#7dd3fc' : '#06b6d4';
      ctx.fill();
    }
  });

  // 3. Start Arch Checkered Banner ("APEX GT")
  const archBannerTex = makeTex(512, 128, (ctx) => {
    ctx.fillStyle = '#0b1018';
    ctx.fillRect(0, 0, 512, 128);
    const cell = 16;
    for (let x = 0; x < 96; x += cell) {
      for (let y = 0; y < 128; y += cell) {
        if (((x + y) / cell) % 2 === 0) {
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(x, y, cell, cell);
          ctx.fillRect(512 - x - cell, y, cell, cell);
        }
      }
    }
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(96, 0, 320, 10);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(96, 118, 320, 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('APEX GT', 256, 64);
  });

  // 4. Sponsor Billboard Hoarding
  const billboardTex = makeTex(512, 192, (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 512, 192);
    grad.addColorStop(0, '#09111e');
    grad.addColorStop(0.55, '#0f1f38');
    grad.addColorStop(1, '#111827');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 192);

    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(0, 0, 512, 12);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 180, 512, 12);

    // Diagonal racing stripes
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.beginPath();
    ctx.moveTo(350, 12);
    ctx.lineTo(420, 12);
    ctx.lineTo(380, 180);
    ctx.lineTo(310, 180);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('APEX GT', 34, 82);
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('MOTORSPORT SERIES · PRECISION TELEMETRY', 36, 134);
  });

  // 5. Speed Trap Radar Display
  const speedBoardTex = makeTex(256, 96, (ctx) => {
    ctx.fillStyle = '#070a10';
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 88);
    ctx.fillStyle = '#c084fc';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FIA SPEED TRAP', 128, 28);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 34px monospace';
    ctx.fillText('348 KM/H', 128, 68);
  });

  // 6. Hazard Chevron Stripe (Tunnel Portals & Jump Lip)
  const hazardTex = makeTex(
    256,
    64,
    (ctx) => {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#111827';
      for (let x = -64; x < 320; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 24, 0);
        ctx.lineTo(x + 56, 64);
        ctx.lineTo(x + 32, 64);
        ctx.closePath();
        ctx.fill();
      }
    },
    3,
    1,
  );

  // 7. Translucent Checkpoint Laser Curtain
  const laserTex = makeTex(128, 128, (ctx) => {
    ctx.clearRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 8) {
      ctx.fillStyle = y % 16 === 0 ? 'rgba(34, 197, 94, 0.55)' : 'rgba(16, 185, 129, 0.14)';
      ctx.fillRect(0, y, 128, 4);
    }
  });

  return {
    rampDeckTex,
    boostTex,
    archBannerTex,
    billboardTex,
    speedBoardTex,
    hazardTex,
    laserTex,
    dispose: () => {
      for (const t of disposables) t.dispose();
    },
  };
}

function createStudioOverrideMaterial(
  matId: StudioMaterialId,
  colorHex: string | undefined,
  fallbackHex: number,
  mats: THREE.Material[],
): THREE.MeshStandardMaterial {
  const col = colorHex && /^#[0-9a-fA-F]{6}$/.test(colorHex) ? colorHex : fallbackHex;
  let mat: THREE.MeshStandardMaterial;
  switch (matId) {
    case 'neon':
      mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 1.55,
        roughness: 0.2,
        metalness: 0.1,
      });
      break;
    case 'metal':
      mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.24,
        metalness: 0.88,
      });
      break;
    case 'carbon':
      mat = new THREE.MeshStandardMaterial({
        color: colorHex ? col : 0x1a202c,
        roughness: 0.36,
        metalness: 0.42,
      });
      break;
    case 'concrete':
      mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.92,
        metalness: 0.04,
      });
      break;
    case 'wood':
      mat = new THREE.MeshStandardMaterial({
        color: colorHex ? col : 0x7c5338,
        roughness: 0.88,
        metalness: 0.02,
      });
      break;
    case 'glass':
      mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.08,
        metalness: 0.15,
        transparent: true,
        opacity: 0.46,
      });
      break;
    case 'ice':
      mat = new THREE.MeshStandardMaterial({
        color: colorHex ? col : 0x93c5fd,
        roughness: 0.12,
        metalness: 0.14,
        transparent: true,
        opacity: 0.86,
      });
      break;
    case 'plastic':
    default:
      mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.42,
        metalness: 0.08,
      });
      break;
  }
  mats.push(mat);
  return mat;
}

export function buildCustomPropsRig(
  blueprint: CustomMapBlueprint | null,
  registerColliders = true,
  _selectedPropId: string | null = null,
): { group: THREE.Group; propGroupsById: Map<string, THREE.Group>; dispose: () => void } {
  const group = new THREE.Group();
  group.name = 'CustomMapPlacedProps';
  const propGroupsById = new Map<string, THREE.Group>();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  let isDisposed = false;

  if (!blueprint || blueprint.placedProps.length === 0) {
    return {
      group,
      propGroupsById,
      dispose: () => {},
    };
  }

  const texSuite = createPropTextures();

  // Shared PBR Materials
  const accentDefaultMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.42, metalness: 0.22 });
  const rampDeckMat = new THREE.MeshStandardMaterial({
    map: texSuite.rampDeckTex,
    color: 0xffffff,
    roughness: 0.68,
    metalness: 0.2,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    map: texSuite.hazardTex,
    roughness: 0.5,
    metalness: 0.12,
  });
  const boostMat = new THREE.MeshStandardMaterial({
    map: texSuite.boostTex,
    emissive: 0x0ea5e9,
    emissiveMap: texSuite.boostTex,
    emissiveIntensity: 1.65,
    roughness: 0.25,
    metalness: 0.25,
  });
  const cyanGlowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 1.7,
    roughness: 0.2,
  });
  const checkpointMat = new THREE.MeshStandardMaterial({
    map: texSuite.laserTex,
    color: 0x22c55e,
    emissive: 0x16a34a,
    emissiveIntensity: 1.3,
    transparent: true,
    opacity: 0.58,
    side: THREE.DoubleSide,
  });
  const greenGlowMat = new THREE.MeshStandardMaterial({
    color: 0x4ade80,
    emissive: 0x22c55e,
    emissiveIntensity: 1.7,
    roughness: 0.2,
  });
  const speedMat = new THREE.MeshStandardMaterial({
    map: texSuite.speedBoardTex,
    emissive: 0xa855f7,
    emissiveMap: texSuite.speedBoardTex,
    emissiveIntensity: 1.1,
    roughness: 0.3,
  });
  const driftMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0xea580c,
    emissiveIntensity: 1.4,
    roughness: 0.25,
  });
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.28, metalness: 0.72 });
  const tireRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.82, metalness: 0.05 });
  const tireWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.82, metalness: 0.05 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x181b20, roughness: 0.92, metalness: 0.04 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.45 });
  const whiteReflectMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe2e8f0,
    emissiveIntensity: 0.35,
    roughness: 0.22,
  });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xa1b0c2, roughness: 0.3, metalness: 0.82 });
  const darkSteelMat = new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.42, metalness: 0.72 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x7b8594, roughness: 0.9, metalness: 0.05 });
  const darkConcreteMat = new THREE.MeshStandardMaterial({ color: 0x47505e, roughness: 0.92, metalness: 0.05 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.45,
  });
  const archBannerMat = new THREE.MeshStandardMaterial({
    map: texSuite.archBannerTex,
    roughness: 0.42,
    metalness: 0.1,
  });
  const billboardFaceMat = new THREE.MeshStandardMaterial({
    map: texSuite.billboardTex,
    emissive: 0x1e3a5f,
    emissiveMap: texSuite.billboardTex,
    emissiveIntensity: 0.4,
    roughness: 0.38,
  });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3d28, roughness: 0.92 });
  const palmBarkMat = new THREE.MeshStandardMaterial({ color: 0x7a5b3e, roughness: 0.9 });
  const foliageDeepMat = new THREE.MeshStandardMaterial({ color: 0x1a472a, roughness: 0.86, flatShading: true });
  const foliageMidMat = new THREE.MeshStandardMaterial({ color: 0x255c35, roughness: 0.84, flatShading: true });
  const palmFoliageMat = new THREE.MeshStandardMaterial({
    color: 0x2e853c,
    roughness: 0.76,
    side: THREE.DoubleSide,
  });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x646f7d, roughness: 0.9, flatShading: true });
  const rockMossMat = new THREE.MeshStandardMaterial({ color: 0x4b5c49, roughness: 0.92, flatShading: true });
  const redGlowMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 2.0,
    roughness: 0.18,
  });
  const amberGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  });
  const warmWhiteGlowMat = new THREE.MeshStandardMaterial({
    color: 0xfef9c3,
    emissive: 0xfef08a,
    emissiveIntensity: 1.85,
    roughness: 0.15,
  });

  mats.push(
    accentDefaultMat,
    rampDeckMat,
    hazardMat,
    boostMat,
    cyanGlowMat,
    checkpointMat,
    greenGlowMat,
    speedMat,
    driftMat,
    pylonMat,
    tireRedMat,
    tireWhiteMat,
    rubberMat,
    orangeMat,
    whiteReflectMat,
    steelMat,
    darkSteelMat,
    concreteMat,
    darkConcreteMat,
    glassMat,
    archBannerMat,
    billboardFaceMat,
    woodMat,
    palmBarkMat,
    foliageDeepMat,
    foliageMidMat,
    palmFoliageMat,
    rockMat,
    rockMossMat,
    redGlowMat,
    amberGlowMat,
    warmWhiteGlowMat,
  );

  // Shared Geometries
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geos.push(g);
    return g;
  };

  // Hollowed steel-frame ramp profile (supports under-truss aesthetics cleanly while top matches ramp physics)
  const rampDeckShape = new THREE.Shape();
  rampDeckShape.moveTo(-6.5, 0);
  rampDeckShape.lineTo(6.5, 2.9);
  rampDeckShape.lineTo(6.5, 3.2);
  rampDeckShape.lineTo(-6.5, 0.26);
  rampDeckShape.closePath();
  const rampDeckGeo = trackGeo(
    new THREE.ExtrudeGeometry(rampDeckShape, { depth: 8.6, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06 }),
  );
  rampDeckGeo.translate(0, 0, -4.3);
  rampDeckGeo.rotateY(-Math.PI * 0.5);

  const rampSideShape = new THREE.Shape();
  rampSideShape.moveTo(-6.5, 0);
  rampSideShape.lineTo(6.5, 0);
  rampSideShape.lineTo(6.5, 3.35);
  rampSideShape.lineTo(-6.5, 0.35);
  rampSideShape.closePath();
  const rampSideGeo = trackGeo(new THREE.ExtrudeGeometry(rampSideShape, { depth: 0.28, bevelEnabled: false }));
  rampSideGeo.rotateY(-Math.PI * 0.5);

  // Parabolic Mega Ramp
  const megaShape = new THREE.Shape();
  megaShape.moveTo(-11.0, 0);
  megaShape.lineTo(11.0, 0);
  megaShape.lineTo(11.0, 6.2);
  megaShape.quadraticCurveTo(0, 1.8, -11.0, 0);
  const megaGeo = trackGeo(new THREE.ExtrudeGeometry(megaShape, { depth: 11.2, bevelEnabled: false }));
  megaGeo.translate(0, 0, -5.6);
  megaGeo.rotateY(-Math.PI * 0.5);

  // Split Jump Kicker
  const jumpShape = new THREE.Shape();
  jumpShape.moveTo(-5.2, 0);
  jumpShape.lineTo(5.2, 0);
  jumpShape.lineTo(5.2, 2.4);
  jumpShape.closePath();
  const jumpGeo = trackGeo(new THREE.ExtrudeGeometry(jumpShape, { depth: 8.4, bevelEnabled: false }));
  jumpGeo.translate(0, 0, -4.2);
  jumpGeo.rotateY(-Math.PI * 0.5);

  // Serpentine/Beveled FIA Apex Kerb
  const kerbShape = new THREE.Shape();
  kerbShape.moveTo(-0.75, 0);
  kerbShape.lineTo(0.75, 0);
  kerbShape.lineTo(0.75, 0.16);
  kerbShape.lineTo(-0.25, 0.16);
  kerbShape.closePath();
  const kerbSegGeo = trackGeo(new THREE.ExtrudeGeometry(kerbShape, { depth: 1.16, bevelEnabled: false }));
  kerbSegGeo.translate(0, 0, -0.58);

  // Double-Wave W-beam Armco Profile
  const wBeamShape = new THREE.Shape();
  wBeamShape.moveTo(-0.08, -0.22);
  wBeamShape.lineTo(0.06, -0.14);
  wBeamShape.lineTo(-0.02, 0);
  wBeamShape.lineTo(0.06, 0.14);
  wBeamShape.lineTo(-0.08, 0.22);
  wBeamShape.lineTo(-0.14, 0.14);
  wBeamShape.lineTo(-0.08, 0);
  wBeamShape.lineTo(-0.14, -0.14);
  wBeamShape.closePath();
  const wBeamGeo = trackGeo(new THREE.ExtrudeGeometry(wBeamShape, { depth: 10.0, bevelEnabled: false }));
  wBeamGeo.translate(0, 0, -5.0);
  wBeamGeo.rotateY(Math.PI * 0.5);

  const torusLoopOuterGeo = trackGeo(new THREE.TorusGeometry(6.9, 0.42, 12, 32));
  const torusLoopInnerGeo = trackGeo(new THREE.TorusGeometry(6.3, 0.18, 10, 32));
  const tireTorusGeo = trackGeo(new THREE.TorusGeometry(0.46, 0.24, 10, 16));
  tireTorusGeo.rotateX(Math.PI * 0.5);

  const coneBodyGeo = trackGeo(new THREE.ConeGeometry(0.32, 0.92, 12));
  const coneCollar1Geo = trackGeo(new THREE.CylinderGeometry(0.18, 0.23, 0.14, 12));
  const coneCollar2Geo = trackGeo(new THREE.CylinderGeometry(0.11, 0.15, 0.12, 12));
  const coneBaseGeo = trackGeo(new THREE.BoxGeometry(0.76, 0.08, 0.76));

  const postColGeo = trackGeo(new THREE.BoxGeometry(0.32, 7.6, 0.32));
  const strutGeo = trackGeo(new THREE.BoxGeometry(0.12, 1.4, 0.12));
  const concretePadGeo = trackGeo(new THREE.BoxGeometry(1.4, 0.45, 1.4));
  const armcoPostGeo = trackGeo(new THREE.BoxGeometry(0.16, 1.05, 0.18));
  const reflectorGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.12, 0.08));

  const boulderMainGeo = trackGeo(new THREE.DodecahedronGeometry(2.1, 1));
  const boulderSubGeo = trackGeo(new THREE.DodecahedronGeometry(1.15, 0));

  const upgradeHolderWithUserAssets = (
    holder: THREE.Group,
    placements: Array<{
      assetId: UserAssetId;
      x?: number;
      y?: number;
      z?: number;
      rotY?: number;
      scale?: number;
    }>,
    castSh: boolean,
    overrideMat: THREE.Material | null,
  ) => {
    const fallbackChildren = [...holder.children];
    const applyLoaded = (loadedMap: Map<UserAssetId, NormalizedUserAsset>) => {
      if (isDisposed) return;
      for (const p of placements) {
        const asset = loadedMap.get(p.assetId);
        if (!asset) continue;
        const mesh = new THREE.Mesh(asset.geometry, overrideMat ?? asset.material);
        mesh.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
        if (p.rotY) mesh.rotation.y = p.rotY;
        if (p.scale && Math.abs(p.scale - 1) > 1e-4) mesh.scale.setScalar(p.scale);
        mesh.castShadow = castSh;
        mesh.receiveShadow = true;
        holder.add(mesh);
      }
      for (const fb of fallbackChildren) {
        fb.visible = false;
        holder.remove(fb);
      }
    };

    const uniqueIds = Array.from(new Set(placements.map((p) => p.assetId)));
    const allCached = new Map<UserAssetId, NormalizedUserAsset>();
    let missing = false;
    for (const id of uniqueIds) {
      const c = getCachedUserAsset(id);
      if (c) allCached.set(id, c);
      else missing = true;
    }
    if (!missing) {
      applyLoaded(allCached);
      return;
    }
    void Promise.all(
      uniqueIds.map((id) => loadUserAsset(id).then((asset) => [id, asset] as const)),
    )
      .then((entries) => {
        const map = new Map<UserAssetId, NormalizedUserAsset>(entries);
        applyLoaded(map);
      })
      .catch((err) => {
        console.warn('Studio user asset fallback retained:', err);
      });
  };

  for (const prop of blueprint.placedProps) {
    const sc = clamp(prop.scale || 1, 0.2, 6.0);
    const sx = clamp(prop.scaleX ?? sc, 0.2, 6.0);
    const sy = clamp(prop.scaleY ?? sc, 0.2, 6.0);
    const sz = clamp(prop.scaleZ ?? sc, 0.2, 6.0);
    const castSh = prop.castShadow !== false;
    const solidEnabled = prop.canCollide !== false;

    const holder = new THREE.Group();
    holder.position.set(prop.x, prop.y, prop.z);
    holder.rotation.set(prop.rotX ?? 0, prop.rotY, prop.rotZ ?? 0, 'YXZ');
    holder.scale.set(sx, sy, sz);
    holder.userData.builderPropId = prop.id;

    let accentMat = accentDefaultMat;
    const matOverride = prop.material && prop.material !== 'default' ? prop.material : null;
    if (matOverride) {
      accentMat = createStudioOverrideMaterial(matOverride, prop.colorHex, 0xf59e0b, mats);
    } else if (prop.colorHex && /^#[0-9a-fA-F]{6}$/.test(prop.colorHex)) {
      accentMat = new THREE.MeshStandardMaterial({ color: prop.colorHex, roughness: 0.38, metalness: 0.28 });
      mats.push(accentMat);
    }

    const ux = Math.cos(prop.rotY);
    const uz = -Math.sin(prop.rotY);

    switch (prop.type) {
      case 'ramp': {
        const deck = new THREE.Mesh(rampDeckGeo, matOverride ? accentMat : rampDeckMat);
        deck.castShadow = castSh;
        deck.receiveShadow = true;
        const sideL = new THREE.Mesh(rampSideGeo, darkSteelMat);
        sideL.position.set(-4.35, 0, 0);
        const sideR = new THREE.Mesh(rampSideGeo, darkSteelMat);
        sideR.position.set(4.07, 0, 0);
        // Under-deck vertical steel legs
        for (const zOff of [1.8, 5.4]) {
          const legH = zOff > 4 ? 2.55 : 1.7;
          const legGeo = trackGeo(new THREE.BoxGeometry(0.32, legH, 0.32));
          const l1 = new THREE.Mesh(legGeo, steelMat);
          l1.position.set(-3.9, legH * 0.5, zOff);
          const l2 = new THREE.Mesh(legGeo, steelMat);
          l2.position.set(3.9, legH * 0.5, zOff);
          holder.add(l1, l2);
        }
        const lip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.8, 0.16, 1.15)), hazardMat);
        lip.position.set(0, 3.22, 5.9);
        const ledBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.6, 0.12, 0.18)), accentMat === accentDefaultMat ? cyanGlowMat : accentMat);
        ledBar.position.set(0, 3.12, 6.52);
        holder.add(deck, sideL, sideR, lip, ledBar);
        break;
      }

      case 'mega_ramp': {
        const mesh = new THREE.Mesh(megaGeo, matOverride ? accentMat : rampDeckMat);
        mesh.castShadow = castSh;
        mesh.receiveShadow = true;
        // Side safety guardrails & vertical truss towers
        const wallGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.9, 22.0));
        const wL = new THREE.Mesh(wallGeo, darkSteelMat);
        wL.position.set(-5.6, 2.1, 0);
        wL.rotation.x = -0.27;
        const wR = new THREE.Mesh(wallGeo, darkSteelMat);
        wR.position.set(5.6, 2.1, 0);
        wR.rotation.x = -0.27;
        const stripGeo = trackGeo(new THREE.BoxGeometry(0.4, 0.1, 20.0));
        const glowStrip = new THREE.Mesh(stripGeo, boostMat);
        glowStrip.position.set(0, 2.5, 0);
        glowStrip.rotation.x = -0.28;
        const lip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.6, 0.22, 1.8)), hazardMat);
        lip.position.set(0, 6.24, 10.1);
        const topGlow = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.4, 0.18, 0.28)), cyanGlowMat);
        topGlow.position.set(0, 6.1, 11.05);
        holder.add(mesh, wL, wR, glowStrip, lip, topGlow);
        break;
      }

      case 'jump_gap': {
        const mesh = new THREE.Mesh(jumpGeo, matOverride ? accentMat : rampDeckMat);
        mesh.castShadow = castSh;
        mesh.receiveShadow = true;
        const cheekGeo = trackGeo(new THREE.BoxGeometry(0.3, 1.2, 10.4));
        const cL = new THREE.Mesh(cheekGeo, accentMat);
        cL.position.set(-4.25, 1.15, 0);
        cL.rotation.x = -0.22;
        const cR = new THREE.Mesh(cheekGeo, accentMat);
        cR.position.set(4.25, 1.15, 0);
        cR.rotation.x = -0.22;
        const lip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.6, 0.15, 1.15)), hazardMat);
        lip.position.set(0, 2.42, 4.6);
        holder.add(mesh, cL, cR, lip);
        break;
      }

      case 'loop_ring': {
        const outer = new THREE.Mesh(torusLoopOuterGeo, darkSteelMat);
        outer.position.y = 7.2;
        outer.castShadow = castSh;
        const inner = new THREE.Mesh(torusLoopInnerGeo, matOverride ? accentMat : cyanGlowMat);
        inner.position.y = 7.2;
        const baseGeo = trackGeo(new THREE.BoxGeometry(2.4, 0.9, 2.6));
        const bL = new THREE.Mesh(baseGeo, concreteMat);
        bL.position.set(-5.6, 0.45, 0);
        const bR = new THREE.Mesh(baseGeo, concreteMat);
        bR.position.set(5.6, 0.45, 0);
        const braceGeo = trackGeo(new THREE.BoxGeometry(0.45, 2.6, 0.45));
        const brL = new THREE.Mesh(braceGeo, steelMat);
        brL.position.set(-5.2, 1.8, 0);
        brL.rotation.z = 0.35;
        const brR = new THREE.Mesh(braceGeo, steelMat);
        brR.position.set(5.2, 1.8, 0);
        brR.rotation.z = -0.35;
        holder.add(outer, inner, bL, bR, brL, brR);
        break;
      }

      case 'boost_pad': {
        const frame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.2, 0.14, 8.6)), darkSteelMat);
        frame.position.y = 0.07;
        const pad = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.6, 0.18, 8.0)), boostMat);
        pad.position.y = 0.09;
        const railGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.24, 8.6));
        const rL = new THREE.Mesh(railGeo, matOverride ? accentMat : cyanGlowMat);
        rL.position.set(-4.05, 0.14, 0);
        const rR = new THREE.Mesh(railGeo, matOverride ? accentMat : cyanGlowMat);
        rR.position.set(4.05, 0.14, 0);
        holder.add(frame, pad, rL, rR);
        break;
      }

      case 'speed_trap': {
        for (const side of [-8.8, 8.8]) {
          const pad = new THREE.Mesh(concretePadGeo, concreteMat);
          pad.position.set(side, 0.22, 0);
          const col1 = new THREE.Mesh(postColGeo, darkSteelMat);
          col1.position.set(side, 3.8, -0.35);
          const col2 = new THREE.Mesh(postColGeo, darkSteelMat);
          col2.position.set(side, 3.8, 0.35);
          const pod = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.65, 0.9, 1.1)), steelMat);
          pod.position.set(side > 0 ? side - 0.55 : side + 0.55, 3.6, 0);
          const beacon = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.35, 10)), amberGlowMat);
          beacon.position.set(side, 7.85, 0);
          holder.add(pad, col1, col2, pod, beacon);
        }
        const topBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18.2, 0.65, 1.1)), darkSteelMat);
        topBeam.position.set(0, 7.6, 0);
        const radarBoard = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.2, 1.85, 0.45)), speedMat);
        radarBoard.position.set(0, 7.2, 0.55);
        holder.add(topBeam, radarBoard);
        break;
      }

      case 'drift_zone': {
        const strip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 0.12, 10.0)), darkSteelMat);
        strip.position.y = 0.06;
        const glowRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 0.16, 9.6)), driftMat);
        glowRail.position.y = 0.09;
        holder.add(strip, glowRail);
        for (const zOff of [-3.6, 0, 3.6]) {
          const base = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.32, 0.36, 0.22, 10)), rubberMat);
          base.position.set(0, 0.16, zOff);
          const rod = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 8)), driftMat);
          rod.position.set(0, 1.25, zOff);
          const cap = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.18, 8, 8)), amberGlowMat);
          cap.position.set(0, 2.4, zOff);
          holder.add(base, rod, cap);
        }
        break;
      }

      case 'checkpoint': {
        for (const side of [-8.4, 8.4]) {
          const pad = new THREE.Mesh(concretePadGeo, concreteMat);
          pad.position.set(side, 0.22, 0);
          const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.65, 7.2, 0.85)), pylonMat);
          post.position.set(side, 3.6, 0);
          post.castShadow = castSh;
          const strip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.7, 6.2, 0.18)), greenGlowMat);
          strip.position.set(side, 3.6, 0);
          const cap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.85, 0.35, 1.0)), darkSteelMat);
          cap.position.set(side, 7.35, 0);
          holder.add(pad, post, strip, cap);
        }
        const beam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(17.6, 0.8, 1.0)), darkSteelMat);
        beam.position.set(0, 7.2, 0);
        const clock = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.8, 0.65, 1.15)), greenGlowMat);
        clock.position.set(0, 7.2, 0);
        const curtain = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(16.0, 6.4)), checkpointMat);
        curtain.position.set(0, 3.5, 0);
        holder.add(beam, clock, curtain);
        break;
      }

      case 'tire_barrier': {
        // Fallback stacked tires replaced seamlessly by /Assets-user/race_track_tire_wall.glb
        for (let row = 0; row < 2; row++) {
          for (let k = -2; k <= 2; k++) {
            const tireMat =
              matOverride
                ? accentMat
                : (Math.abs(k) + row) % 2 === 0
                ? tireRedMat
                : tireWhiteMat;
            const t = new THREE.Mesh(tireTorusGeo, tireMat);
            t.position.set(k * 1.38 + (row % 2) * 0.22, 0.26 + row * 0.52, 0);
            t.castShadow = castSh;
            holder.add(t);
          }
        }
        const belt = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.1, 0.36, 1.32)), rubberMat);
        belt.position.set(0, 0.52, 0);
        holder.add(belt);
        upgradeHolderWithUserAssets(
          holder,
          [
            { assetId: 'tire_wall', x: -1.95 },
            { assetId: 'tire_wall', x: 1.95 },
          ],
          castSh,
          matOverride ? accentMat : null,
        );
        if (registerColliders && solidEnabled) {
          worldColliders.addObb(prop.x, prop.z, 3.85 * sx, 0.68 * sz, ux, uz, 'tire', prop.y - 1, prop.y + 3 * sy);
        }
        break;
      }

      case 'guardrail': {
        // Fallback Armco W-beam replaced seamlessly by /Assets-user/guardrail_and_terminal.glb
        const beam = new THREE.Mesh(wBeamGeo, matOverride ? accentMat : steelMat);
        beam.position.y = 0.72;
        beam.castShadow = castSh;
        holder.add(beam);
        for (const xOff of [-4.2, -1.4, 1.4, 4.2]) {
          const post = new THREE.Mesh(armcoPostGeo, darkSteelMat);
          post.position.set(xOff, 0.52, -0.18);
          post.castShadow = castSh;
          const refl = new THREE.Mesh(reflectorGeo, xOff < 0 ? amberGlowMat : whiteReflectMat);
          refl.position.set(xOff, 0.96, 0.04);
          holder.add(post, refl);
        }
        upgradeHolderWithUserAssets(
          holder,
          [
            { assetId: 'guardrail', x: -2.0 },
            { assetId: 'guardrail', x: 2.0 },
            { assetId: 'guardrail_terminal', x: -4.46, rotY: Math.PI },
            { assetId: 'guardrail_terminal', x: 4.46 },
          ],
          castSh,
          matOverride ? accentMat : null,
        );
        if (registerColliders && solidEnabled) {
          worldColliders.addObb(prop.x, prop.z, 4.9 * sx, 0.38 * sz, ux, uz, 'metal', prop.y - 1, prop.y + 3 * sy);
        }
        break;
      }

      case 'race_fence': {
        // Fallback catch fence panel replaced by /Assets-user/race_fence.glb (2x 4.5m sections)
        const baseWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.0, 0.95, 0.55)), concreteMat);
        baseWall.position.y = 0.48;
        baseWall.castShadow = castSh;
        const meshScreen = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.9, 3.2, 0.08)), glassMat);
        meshScreen.position.y = 2.55;
        holder.add(baseWall, meshScreen);
        upgradeHolderWithUserAssets(
          holder,
          [
            { assetId: 'race_fence', x: -2.25 },
            { assetId: 'race_fence', x: 2.25 },
          ],
          castSh,
          matOverride ? accentMat : null,
        );
        if (registerColliders && solidEnabled) {
          worldColliders.addObb(prop.x, prop.z, 4.5 * sx, 0.48 * sz, ux, uz, 'metal', prop.y - 1, prop.y + 4.5 * sy);
        }
        break;
      }

      case 'track_fence': {
        // Fallback tall barrier fence replaced by /Assets-user/fence_single_model_from_asset_pack.glb
        const jersey = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10.0, 1.1, 0.72)), concreteMat);
        jersey.position.y = 0.55;
        jersey.castShadow = castSh;
        const tallMesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.8, 5.1, 0.1)), glassMat);
        tallMesh.position.y = 3.65;
        holder.add(jersey, tallMesh);
        upgradeHolderWithUserAssets(
          holder,
          [
            { assetId: 'asset_fence', x: -2.5 },
            { assetId: 'asset_fence', x: 2.5 },
          ],
          castSh,
          matOverride ? accentMat : null,
        );
        if (registerColliders && solidEnabled) {
          worldColliders.addObb(prop.x, prop.z, 5.0 * sx, 0.5 * sz, ux, uz, 'metal', prop.y - 1, prop.y + 6.5 * sy);
        }
        break;
      }

      case 'protective_fence': {
        // Fallback paddock mesh replaced by /Assets-user/fence_protective_fence_metallic_avenue_farm.glb
        for (const px of [-3.0, 0, 3.0]) {
          const post = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.12, 2.1, 0.12)), steelMat);
          post.position.set(px, 1.05, 0);
          holder.add(post);
        }
        const panel = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.0, 1.9, 0.06)), glassMat);
        panel.position.y = 1.05;
        holder.add(panel);
        upgradeHolderWithUserAssets(
          holder,
          [
            { assetId: 'protective_fence', x: -1.52 },
            { assetId: 'protective_fence', x: 1.52 },
          ],
          castSh,
          matOverride ? accentMat : null,
        );
        if (registerColliders && solidEnabled) {
          worldColliders.addObb(prop.x, prop.z, 3.05 * sx, 0.25 * sz, ux, uz, 'metal', prop.y - 1, prop.y + 2.5 * sy);
        }
        break;
      }

      case 'tecpro_barrier': {
        for (const offset of [-1.65, 1.65]) {
          const bodyMat = matOverride ? accentMat : offset < 0 ? tireRedMat : tireWhiteMat;
          const blk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.2, 1.25, 1.22)), bodyMat);
          blk.position.set(offset, 0.625, 0);
          blk.castShadow = castSh;
          const strap = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.26, 0.16, 1.28)), rubberMat);
          strap.position.set(offset, 0.78, 0);
          const cap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.14, 0.14, 1.32, 8)), steelMat);
          cap.position.set(offset + 1.55, 0.66, 0);
          holder.add(blk, strap, cap);
        }
        if (registerColliders && solidEnabled) {
          worldColliders.addObb(prop.x, prop.z, 3.35 * sx, 0.72 * sz, ux, uz, 'tire', prop.y - 1, prop.y + 2.5 * sy);
        }
        break;
      }

      case 'cone': {
        const base = new THREE.Mesh(coneBaseGeo, rubberMat);
        base.position.y = 0.04;
        const body = new THREE.Mesh(coneBodyGeo, matOverride ? accentMat : orangeMat);
        body.position.y = 0.5;
        body.castShadow = castSh;
        const c1 = new THREE.Mesh(coneCollar1Geo, whiteReflectMat);
        c1.position.y = 0.36;
        const c2 = new THREE.Mesh(coneCollar2Geo, whiteReflectMat);
        c2.position.y = 0.62;
        holder.add(base, body, c1, c2);
        break;
      }

      case 'curb_strip': {
        for (let k = -2; k <= 2; k++) {
          const segMat = matOverride ? accentMat : Math.abs(k) % 2 === 0 ? tireRedMat : tireWhiteMat;
          const seg = new THREE.Mesh(kerbSegGeo, segMat);
          seg.position.set(0, 0.01, k * 1.2);
          seg.receiveShadow = true;
          holder.add(seg);
        }
        break;
      }

      case 'arch': {
        // Twin open truss stanchions + overhead bridged gantry + APEX GT checkered banner
        for (const side of [-9.1, 9.1]) {
          const pad = new THREE.Mesh(concretePadGeo, concreteMat);
          pad.position.set(side, 0.22, 0);
          for (const zOff of [-0.5, 0.5]) {
            const col = new THREE.Mesh(postColGeo, steelMat);
            col.position.set(side, 3.8, zOff);
            col.castShadow = castSh;
            holder.add(col);
          }
          for (let h = 1.2; h <= 6.5; h += 1.6) {
            const diag = new THREE.Mesh(strutGeo, steelMat);
            diag.position.set(side, h, 0);
            diag.rotation.x = h % 3.2 < 2 ? 0.65 : -0.65;
            holder.add(diag);
          }
          holder.add(pad);
        }
        const topChord = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(19.2, 0.35, 1.45)), steelMat);
        topChord.position.set(0, 7.65, 0);
        const banner = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(17.6, 1.5, 1.28)), matOverride ? accentMat : archBannerMat);
        banner.position.set(0, 6.75, 0);
        banner.castShadow = castSh;
        const trimStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(17.7, 0.14, 1.36)), accentMat);
        trimStripe.position.set(0, 7.52, 0);
        holder.add(topChord, banner, trimStripe);
        break;
      }

      case 'pit_garage': {
        // 3-Bay Paddock Building with foundation slab, open bays, roof HVAC & fascia sign
        const slab = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(27.6, 0.26, 12.2)), concreteMat);
        slab.position.y = 0.13;
        slab.receiveShadow = true;
        const rearWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(26.2, 5.6, 0.6)), darkConcreteMat);
        rearWall.position.set(0, 2.95, -4.4);
        rearWall.castShadow = castSh;
        const roof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(27.8, 0.6, 11.8)), darkSteelMat);
        roof.position.set(0, 5.95, 0.4);
        roof.castShadow = castSh;
        const fascia = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(27.9, 0.42, 0.45)), accentMat);
        fascia.position.set(0, 5.95, 6.25);
        holder.add(slab, rearWall, roof, fascia);

        // 4 structural bay pillars + rolled shutter hoods + bay ceiling lights
        for (const px of [-12.8, -4.3, 4.3, 12.8]) {
          const pillar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.65, 5.6, 9.6)), darkSteelMat);
          pillar.position.set(px, 2.95, 0.1);
          pillar.castShadow = castSh;
          holder.add(pillar);
        }
        for (const bayX of [-8.55, 0, 8.55]) {
          const shutter = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.6, 1.1, 0.35)), steelMat);
          shutter.position.set(bayX, 4.95, 4.55);
          const ceilLight = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.8, 0.12, 0.6)), warmWhiteGlowMat);
          ceilLight.position.set(bayX, 5.58, 1.6);
          const hvac = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.6, 0.85, 2.2)), steelMat);
          hvac.position.set(bayX, 6.65, -1.8);
          holder.add(shutter, ceilLight, hvac);
        }
        if (registerColliders && solidEnabled) {
          worldColliders.addObb(prop.x, prop.z, 13.4 * sx, 5.2 * sz, ux, uz, 'concrete', prop.y - 2, prop.y + 8 * sy);
        }
        break;
      }

      case 'grandstand': {
        // 5-tier stepped seating + steel frame columns + glass rail + cantilevered canopy
        const podium = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(19.0, 0.4, 8.6)), concreteMat);
        podium.position.y = 0.2;
        holder.add(podium);
        for (let step = 0; step < 5; step++) {
          const tierY = 0.75 + step * 0.72;
          const tierZ = 2.6 - step * 1.25;
          const riser = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18.2, tierY, 1.28)), darkConcreteMat);
          riser.position.set(0, tierY * 0.5, tierZ);
          riser.castShadow = castSh;
          riser.receiveShadow = true;
          const seatBench = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(17.8, 0.18, 0.72)), accentMat);
          seatBench.position.set(0, tierY + 0.09, tierZ);
          holder.add(riser, seatBench);
        }
        const glassRail = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18.2, 0.9, 0.1)), glassMat);
        glassRail.position.set(0, 1.1, 3.4);
        const backWall = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18.6, 5.4, 0.35)), darkSteelMat);
        backWall.position.set(0, 3.1, -3.9);
        const canopy = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(19.6, 0.36, 9.2)), darkSteelMat);
        canopy.position.set(0, 7.35, -0.1);
        canopy.rotation.x = 0.12;
        canopy.castShadow = castSh;
        for (const cx of [-8.8, 0, 8.8]) {
          const col = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.45, 7.2, 0.55)), steelMat);
          col.position.set(cx, 3.6, -3.8);
          holder.add(col);
        }
        holder.add(glassRail, backWall, canopy);
        if (registerColliders && solidEnabled) {
          worldColliders.addObb(prop.x, prop.z, 9.4 * sx, 4.2 * sz, ux, uz, 'concrete', prop.y - 2, prop.y + 10 * sy);
        }
        break;
      }

      case 'floodlight': {
        const plinth = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.75, 0.9, 0.9, 8)), concreteMat);
        plinth.position.y = 0.45;
        const mast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.2, 0.36, 13.0, 10)), steelMat);
        mast.position.y = 7.0;
        mast.castShadow = castSh;
        const arm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 0.28, 0.55)), darkSteelMat);
        arm.position.set(0, 13.5, 0.35);
        holder.add(plinth, mast, arm);
        for (let k = -1.5; k <= 1.5; k += 1.0) {
          const housing = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.72, 0.52, 0.48)), darkSteelMat);
          housing.position.set(k * 0.9, 13.55, 0.65);
          housing.rotation.x = 0.35;
          const lens = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.62, 0.42)), matOverride ? accentMat : warmWhiteGlowMat);
          lens.position.set(k * 0.9, 13.48, 0.89);
          lens.rotation.x = 0.35;
          holder.add(housing, lens);
        }
        if (registerColliders && solidEnabled) {
          worldColliders.addCircle(prop.x, prop.z, 0.8 * Math.max(sx, sz), 'metal', prop.y - 1, prop.y + 14);
        }
        break;
      }

      case 'light_gantry': {
        for (const side of [-9.2, 9.2]) {
          const pad = new THREE.Mesh(concretePadGeo, concreteMat);
          pad.position.set(side, 0.22, 0);
          const col = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.6, 7.6, 0.75)), darkSteelMat);
          col.position.set(side, 3.8, 0);
          col.castShadow = castSh;
          holder.add(pad, col);
        }
        const beam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(19.0, 0.9, 1.15)), darkSteelMat);
        beam.position.set(0, 7.6, 0);
        const hood = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(8.2, 0.22, 0.9)), darkSteelMat);
        hood.position.set(0, 7.15, 0.55);
        holder.add(beam, hood);
        for (let k = -2; k <= 2; k++) {
          const podBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.95, 1.55, 0.55)), darkSteelMat);
          podBox.position.set(k * 1.45, 6.45, 0.55);
          const lensTop = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 12)), redGlowMat);
          lensTop.rotation.x = Math.PI * 0.5;
          lensTop.position.set(k * 1.45, 6.78, 0.85);
          const lensBot = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 12)), redGlowMat);
          lensBot.rotation.x = Math.PI * 0.5;
          lensBot.position.set(k * 1.45, 6.12, 0.85);
          holder.add(podBox, lensTop, lensBot);
        }
        break;
      }

      case 'tunnel_portal': {
        const wL = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 6.8, 8.0)), concreteMat);
        wL.position.set(-9.4, 3.4, 0);
        wL.castShadow = castSh;
        const wR = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.5, 6.8, 8.0)), concreteMat);
        wR.position.set(9.4, 3.4, 0);
        wR.castShadow = castSh;
        // Wing retaining walls
        const wingGeo = trackGeo(new THREE.BoxGeometry(1.2, 4.2, 4.2));
        const wgL = new THREE.Mesh(wingGeo, darkConcreteMat);
        wgL.position.set(-10.8, 2.1, 4.4);
        wgL.rotation.y = -0.35;
        const wgR = new THREE.Mesh(wingGeo, darkConcreteMat);
        wgR.position.set(10.8, 2.1, 4.4);
        wgR.rotation.y = 0.35;
        // Portal Roof & Hazard Collar
        const roof = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(20.4, 1.65, 8.2)), concreteMat);
        roof.position.set(0, 7.05, 0);
        const hazardBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(17.6, 0.55, 0.35)), hazardMat);
        hazardBar.position.set(0, 6.35, 4.15);
        for (const lx of [-4.5, 0, 4.5]) {
          const lamp = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.85, 0.3, 0.25)), lx === 0 ? greenGlowMat : amberGlowMat);
          lamp.position.set(lx, 7.1, 4.22);
          holder.add(lamp);
        }
        holder.add(wL, wR, wgL, wgR, roof, hazardBar);
        if (registerColliders && solidEnabled) {
          worldColliders.addCircle(prop.x - ux * 9.4 * sx, prop.z - uz * 9.4 * sx, 1.5, 'concrete', prop.y - 1, prop.y + 8);
          worldColliders.addCircle(prop.x + ux * 9.4 * sx, prop.z + uz * 9.4 * sx, 1.5, 'concrete', prop.y - 1, prop.y + 8);
        }
        break;
      }

      case 'bridge_truss': {
        // Warren steel truss overpass span with diagonal X-bracing & cross ties
        for (const side of [-8.8, 8.8]) {
          const botChord = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 0.45, 16.4)), steelMat);
          botChord.position.set(side, 0.25, 0);
          const topChord = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 0.45, 16.4)), steelMat);
          topChord.position.set(side, 4.1, 0);
          holder.add(botChord, topChord);
          for (let zOff = -7.5; zOff <= 7.5; zOff += 3.75) {
            const vert = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.38, 3.9, 0.38)), steelMat);
            vert.position.set(side, 2.15, zOff);
            holder.add(vert);
          }
          for (let zOff = -5.6; zOff <= 5.6; zOff += 3.75) {
            const diag1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 5.1, 0.24)), accentMat === accentDefaultMat ? steelMat : accentMat);
            diag1.position.set(side, 2.15, zOff);
            diag1.rotation.x = 0.72;
            const diag2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 5.1, 0.24)), accentMat === accentDefaultMat ? steelMat : accentMat);
            diag2.position.set(side, 2.15, zOff);
            diag2.rotation.x = -0.72;
            holder.add(diag1, diag2);
          }
        }
        for (const zOff of [-6.0, 0, 6.0]) {
          const portalTie = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(18.0, 0.42, 0.55)), accentMat);
          portalTie.position.set(0, 4.1, zOff);
          holder.add(portalTie);
        }
        break;
      }

      case 'billboard': {
        for (const lx of [-3.8, 3.8]) {
          const pad = new THREE.Mesh(concretePadGeo, concreteMat);
          pad.position.set(lx, 0.2, 0);
          const leg = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.42, 2.6, 0.42)), steelMat);
          leg.position.set(lx, 1.3, 0);
          holder.add(pad, leg);
        }
        const cabinet = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.4, 3.8, 0.42)), darkSteelMat);
        cabinet.position.set(0, 4.0, 0);
        cabinet.castShadow = castSh;
        const face = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10.8, 3.2, 0.52)), matOverride ? accentMat : billboardFaceMat);
        face.position.set(0, 4.0, 0.04);
        const catwalk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.2, 0.16, 0.95)), steelMat);
        catwalk.position.set(0, 2.15, 0.45);
        holder.add(cabinet, face, catwalk);
        if (registerColliders && solidEnabled) {
          worldColliders.addObb(prop.x, prop.z, 5.6 * sx, 0.65 * sz, ux, uz, 'metal', prop.y - 1, prop.y + 6);
        }
        break;
      }

      case 'tree': {
        // Fallback pine replaced seamlessly by /Assets-user/tree_low_poly_lowpoly.glb
        const root = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.45, 0.82, 1.1, 7)), woodMat);
        root.position.y = 0.55;
        const trunk = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.28, 0.46, 5.2, 7)), woodMat);
        trunk.position.y = 2.6;
        trunk.castShadow = castSh;
        holder.add(root, trunk);
        const tiers = [
          { y: 4.4, r: 3.1, h: 3.6, rot: 0.0, mat: foliageDeepMat },
          { y: 6.3, r: 2.55, h: 3.4, rot: 0.4, mat: foliageMidMat },
          { y: 8.1, r: 1.95, h: 3.0, rot: 0.9, mat: foliageDeepMat },
          { y: 9.7, r: 1.25, h: 2.5, rot: 1.3, mat: foliageMidMat },
        ];
        for (const t of tiers) {
          const cone = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(t.r, t.h, 8)), matOverride ? accentMat : t.mat);
          cone.position.y = t.y;
          cone.rotation.y = t.rot;
          cone.castShadow = castSh;
          holder.add(cone);
        }
        const treeVariant: UserAssetId =
          (prop.id.charCodeAt(prop.id.length - 1) || 0) % 2 === 0 ? 'pine_tree_1' : 'pine_tree_2';
        upgradeHolderWithUserAssets(
          holder,
          [{ assetId: treeVariant, scale: 1.15 }],
          castSh,
          matOverride ? accentMat : null,
        );
        if (registerColliders && solidEnabled) {
          worldColliders.addCircle(prop.x, prop.z, 0.9 * Math.max(sx, sz), 'wood', prop.y - 1, prop.y + 10);
        }
        break;
      }

      case 'palm_tree': {
        // Fallback palm replaced seamlessly by /Assets-user/low_poly_palm_tree.glb
        let cx = 0;
        let cy = 0.7;
        for (let s = 0; s < 6; s++) {
          const seg = new THREE.Mesh(
            trackGeo(new THREE.CylinderGeometry(0.38 - s * 0.03, 0.44 - s * 0.03, 1.45, 8)),
            palmBarkMat,
          );
          cx -= s * 0.14;
          cy = 0.7 + s * 1.32;
          seg.position.set(cx, cy, 0);
          seg.rotation.z = 0.08 + s * 0.04;
          seg.castShadow = castSh;
          holder.add(seg);
        }
        const crownX = cx - 0.12;
        const crownY = cy + 0.6;
        for (let c = 0; c < 3; c++) {
          const coco = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.24, 7, 7)), woodMat);
          const a = (c / 3) * Math.PI * 2;
          coco.position.set(crownX + Math.cos(a) * 0.35, crownY - 0.25, Math.sin(a) * 0.35);
          holder.add(coco);
        }
        for (let f = 0; f < 8; f++) {
          const ang = (f / 8) * Math.PI * 2;
          const frondHolder = new THREE.Group();
          frondHolder.position.set(crownX, crownY, 0);
          frondHolder.rotation.y = ang;
          const frondMat = matOverride ? accentMat : palmFoliageMat;
          const b1 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.1, 0.1, 0.72)), frondMat);
          b1.position.set(1.05, 0.18, 0);
          b1.rotation.z = 0.12;
          const b2 = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.0, 0.08, 0.48)), frondMat);
          b2.position.set(2.75, -0.32, 0);
          b2.rotation.z = -0.48;
          frondHolder.add(b1, b2);
          holder.add(frondHolder);
        }
        upgradeHolderWithUserAssets(
          holder,
          [{ assetId: 'palm_tree', scale: 1.0 }],
          castSh,
          matOverride ? accentMat : null,
        );
        if (registerColliders && solidEnabled) {
          worldColliders.addCircle(prop.x, prop.z, 0.75 * Math.max(sx, sz), 'wood', prop.y - 1, prop.y + 9);
        }
        break;
      }

      case 'boulder': {
        const rockA = new THREE.Mesh(boulderMainGeo, matOverride ? accentMat : rockMat);
        rockA.position.set(0, 1.35, 0);
        rockA.scale.set(1.15, 0.88, 1.0);
        rockA.rotation.set(0.2, 0.5, 0.15);
        rockA.castShadow = castSh;
        rockA.receiveShadow = true;
        const rockB = new THREE.Mesh(boulderSubGeo, matOverride ? accentMat : rockMossMat);
        rockB.position.set(-1.55, 0.75, 0.85);
        rockB.rotation.set(0.6, 1.1, 0.3);
        rockB.castShadow = castSh;
        const rockC = new THREE.Mesh(boulderSubGeo, matOverride ? accentMat : rockMat);
        rockC.position.set(1.4, 0.65, -0.95);
        rockC.scale.set(0.85, 0.72, 0.9);
        rockC.castShadow = castSh;
        holder.add(rockA, rockB, rockC);
        if (registerColliders && solidEnabled) {
          worldColliders.addCircle(prop.x, prop.z, 2.2 * Math.max(sx, sz), 'rock', prop.y - 1, prop.y + 5);
        }
        break;
      }
    }

    propGroupsById.set(prop.id, holder);
    group.add(holder);
  }

  return {
    group,
    propGroupsById,
    dispose: () => {
      isDisposed = true;
      texSuite.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

