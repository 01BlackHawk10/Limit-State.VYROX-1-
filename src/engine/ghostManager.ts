import * as THREE from 'three';
import { getCircuitData, getTougeDirection } from '../Maps/Aurelia Ridge/circuitSpline';
import type { MapId } from '../Maps/mapRegistry';
import type { CarVisualCustomization } from './carCustomization';
import { clamp, lerp } from './mathNoise';
import type { AnyCarSpecId } from '../shared/carTypes';
import type { CarModelId, McLarenCarInstance, McLarenTemplate } from './mclarenCarLoader';
import { loadCarTemplate, normalizeCarModelId } from './mclarenCarLoader';

export type GhostBattleMode = 'off' | 'pb' | 'rival';

export interface GhostSample {
  tMs: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  steerNorm: number;
  speedMps: number;
  trackT: number;
}

export interface GhostRecording {
  mapId: MapId;
  direction: 'downhill' | 'uphill';
  carId: CarModelId;
  totalTimeMs: number;
  name: string;
  samples: GhostSample[];
}

export interface GhostBattleStatus {
  active: boolean;
  mode: GhostBattleMode;
  ghostName: string;
  ghostCarId: CarModelId;
  deltaSec: number | null; // negative = player ahead, positive = ghost ahead
  gapMeters: number;
}

const GHOST_STORAGE_PREFIX = 'vyrox_ghost_pb_v1_';

function getGhostStorageKey(mapId: MapId, direction: 'downhill' | 'uphill', carId: AnyCarSpecId): string {
  return `${GHOST_STORAGE_PREFIX}${mapId}_${direction}_${normalizeCarModelId(carId)}`;
}

export function loadStoredPbGhost(
  mapId: MapId,
  direction: 'downhill' | 'uphill',
  carId: AnyCarSpecId,
): GhostRecording | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(getGhostStorageKey(mapId, direction, carId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GhostRecording;
    if (!Array.isArray(parsed.samples) || parsed.samples.length < 10) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredPbGhost(recording: GhostRecording): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      getGhostStorageKey(recording.mapId, recording.direction, recording.carId),
      JSON.stringify(recording),
    );
  } catch {
    // Ignore localStorage quota overflow if ghost is large
  }
}

interface RivalPreset {
  name: string;
  carId: CarModelId;
  paintHex: string;
  basePaceMps: number;
  cornerScale: number;
}

const TOUGE_RIVAL_PRESETS: Partial<Record<MapId, RivalPreset>> = {
  akina_pass: {
    name: 'RedSuns FD3S Ghost',
    carId: 'toyota-ae86-trueno',
    paintHex: '#facc15',
    basePaceMps: 37.5,
    cornerScale: 1.0,
  },
  akagi_pass: {
    name: 'Akagi White Comet',
    carId: 'honda-s2000',
    paintHex: '#f8fafc',
    basePaceMps: 39.0,
    cornerScale: 1.04,
  },
  myogi_pass: {
    name: 'NightKids Spec Ghost',
    carId: 'bmw-m4-widebody',
    paintHex: '#18181b',
    basePaceMps: 38.5,
    cornerScale: 0.98,
  },
};

export function synthesizeRivalGhost(mapId: MapId): {
  recording: GhostRecording;
  paintHex: string;
} {
  const circuit = getCircuitData();
  const samples = circuit.samples;
  const preset: RivalPreset = TOUGE_RIVAL_PRESETS[mapId] ?? {
    name: 'Shadow Benchmark',
    carId: 'bmw-m4-gt3-evo',
    paintHex: '#38bdf8',
    basePaceMps: 46.0,
    cornerScale: 1.05,
  };

  const ghostSamples: GhostSample[] = [];
  let elapsedMs = 0;
  let currentSpeed = 16.0;
  const startIdx = circuit.closedLoop ? circuit.startFinishIndex : 0;
  const count = samples.length;

  for (let step = 0; step < count; step += 2) {
    const idx = (startIdx + step) % count;
    const s = samples[idx];
    const nextIdx = (startIdx + Math.min(step + 2, count - 1)) % count;
    const nextS = samples[nextIdx];
    const lookIdx = (startIdx + Math.min(step + 14, count - 1)) % count;
    const lookS = samples[lookIdx];

    const segDist = s.position.distanceTo(nextS.position);
    const maxCurv = Math.max(Math.abs(s.curvature), Math.abs(lookS.curvature) * 0.85);
    const gripLimit = Math.sqrt(12.2 / Math.max(0.004, maxCurv));
    const targetSpeed = clamp(gripLimit * preset.cornerScale, 15.5, preset.basePaceMps);
    const dtSec = segDist / Math.max(10, currentSpeed);
    const accelRate = targetSpeed > currentSpeed ? 8.2 : 14.5;
    currentSpeed = clamp(
      currentSpeed + Math.sign(targetSpeed - currentSpeed) * Math.min(Math.abs(targetSpeed - currentSpeed), accelRate * dtSec),
      14,
      preset.basePaceMps,
    );

    const baseYaw = Math.atan2(s.tangent.x, s.tangent.z);
    // Add subtle slip drift yaw inside tight hairpins
    const driftSlip = clamp(s.curvature * 14, -0.22, 0.22);
    const laneOffset = clamp(-s.curvature * 18, -2.4, 2.4);

    ghostSamples.push({
      tMs: Math.round(elapsedMs),
      x: Number((s.position.x + s.right.x * laneOffset).toFixed(2)),
      y: Number(s.position.y.toFixed(2)),
      z: Number((s.position.z + s.right.z * laneOffset).toFixed(2)),
      yaw: Number((baseYaw + driftSlip).toFixed(4)),
      steerNorm: Number(clamp(-s.curvature * 32, -1, 1).toFixed(2)),
      speedMps: Number(currentSpeed.toFixed(2)),
      trackT: Number(s.t.toFixed(4)),
    });

    elapsedMs += dtSec * 1000;
  }

  return {
    recording: {
      mapId,
      direction: getTougeDirection(),
      carId: preset.carId,
      totalTimeMs: Math.round(elapsedMs),
      name: preset.name,
      samples: ghostSamples,
    },
    paintHex: preset.paintHex,
  };
}

function createGhostTagSprite(label: string, colorHex: string): {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  material: THREE.SpriteMaterial;
} {
  const cv = document.createElement('canvas');
  cv.width = 360;
  cv.height = 72;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = 'rgba(8, 12, 20, 0.84)';
  ctx.fillRect(4, 8, 352, 54);
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 8, 352, 54);
  ctx.fillStyle = colorHex;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), 180, 36);

  const texture = new THREE.CanvasTexture(cv);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(3.4, 0.68, 1);
  sprite.position.set(0, 2.05, 0);
  return { sprite, texture, material };
}

function makeGhostVisualTint(paintHex: string): CarVisualCustomization {
  return {
    paintHex,
    paintFinish: 'satin',
    trimHex: '#0f172a',
    wingHex: '#0f172a',
    caliperHex: '#38bdf8',
    rimHex: '#e2e8f0',
    windowTintHex: '#38bdf8',
    windowTintOpacity: 0.45,
    headlightTintHex: '#e0f2fe',
    exhaustFinish: 'titanium',
    wrapPattern: 'none',
    wrapAccentHex: paintHex,
    racingNumber: '00',
    decalStyle: 'none',
    wheelFinish: 'white_race',
    showSplitter: false,
    showSideSkirts: false,
    frontAero: 'oem',
    sideAero: 'oem',
    rearDiffuser: 'oem',
    hoodVents: 'oem',
    rearWingSize: 'oem',
    wheelOffsetMm: 0,
  };
}

function applyGhostMaterialOpacity(root: THREE.Object3D, opacity = 0.44): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      m.transparent = true;
      m.opacity = Math.min(m.opacity ?? 1, opacity);
      m.depthWrite = false;
      const std = m as THREE.MeshStandardMaterial;
      if (std.emissive) {
        std.emissive.lerp(new THREE.Color(0x38bdf8), 0.32);
        std.emissiveIntensity = Math.max(std.emissiveIntensity ?? 0, 0.35);
      }
      m.needsUpdate = true;
    }
  });
}

export class GhostBattleManager {
  public readonly group = new THREE.Group();

  private mode: GhostBattleMode = 'off';
  private activePlayback: GhostRecording | null = null;
  private recordBuffer: GhostSample[] = [];
  private lastRecordMs = -100;
  private ghostInstance: McLarenCarInstance | null = null;
  private loadedCarId: CarModelId | null = null;
  private loadingCarId: CarModelId | null = null;
  private tagSpriteObj: ReturnType<typeof createGhostTagSprite> | null = null;
  private wheelSpinAccum = 0;

  private readonly posScratch = new THREE.Vector3();
  private readonly rotEulerScratch = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly quatScratch = new THREE.Quaternion();

  constructor() {
    this.group.name = 'GhostBattleRig';
    this.group.visible = false;
  }

  public startSession(
    mode: GhostBattleMode,
    mapId: MapId,
    direction: 'downhill' | 'uphill',
    playerCarId: AnyCarSpecId,
  ): void {
    this.mode = mode;
    this.recordBuffer = [];
    this.lastRecordMs = -100;
    this.wheelSpinAccum = 0;
    this.activePlayback = null;

    if (mode === 'off') {
      this.group.visible = false;
      return;
    }

    let paintHex = '#38bdf8';
    if (mode === 'pb') {
      const pb = loadStoredPbGhost(mapId, direction, playerCarId);
      if (pb) {
        this.activePlayback = pb;
      } else {
        // Fallback to rival ghost if no PB ghost saved yet
        const syn = synthesizeRivalGhost(mapId);
        this.activePlayback = { ...syn.recording, name: 'Target Benchmark Ghost' };
        paintHex = syn.paintHex;
      }
    } else {
      const syn = synthesizeRivalGhost(mapId);
      this.activePlayback = syn.recording;
      paintHex = syn.paintHex;
    }

    if (this.activePlayback) {
      this.ensureGhostVisual(this.activePlayback.carId, this.activePlayback.name, paintHex);
      this.group.visible = true;
    } else {
      this.group.visible = false;
    }
  }

  private ensureGhostVisual(carId: CarModelId, label: string, paintHex: string): void {
    if (this.tagSpriteObj) {
      this.group.remove(this.tagSpriteObj.sprite);
      this.tagSpriteObj.texture.dispose();
      this.tagSpriteObj.material.dispose();
      this.tagSpriteObj = null;
    }
    this.tagSpriteObj = createGhostTagSprite(label, paintHex);
    if (this.ghostInstance) {
      this.ghostInstance.root.add(this.tagSpriteObj.sprite);
    }

    const normId = normalizeCarModelId(carId);
    if (this.loadedCarId === normId && this.ghostInstance) {
      this.ghostInstance.setVisualCustomization(makeGhostVisualTint(paintHex));
      applyGhostMaterialOpacity(this.ghostInstance.root, 0.44);
      return;
    }
    if (this.loadingCarId === normId) return;
    this.loadingCarId = normId;

    void loadCarTemplate(normId, undefined, 'performance', 2)
      .then((tpl: McLarenTemplate) => {
        if (this.loadingCarId !== normId) return;
        if (this.ghostInstance) {
          this.group.remove(this.ghostInstance.root);
          this.ghostInstance.dispose();
          this.ghostInstance = null;
        }
        const inst = tpl.createInstance(false);
        inst.setVisualCustomization(makeGhostVisualTint(paintHex));
        applyGhostMaterialOpacity(inst.root, 0.44);
        if (this.tagSpriteObj) {
          inst.root.add(this.tagSpriteObj.sprite);
        }
        this.group.add(inst.root);
        this.ghostInstance = inst;
        this.loadedCarId = normId;
        this.loadingCarId = null;
      })
      .catch(() => {
        this.loadingCarId = null;
      });
  }

  public recordSample(
    raceTimeMs: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    steerNorm: number,
    speedMps: number,
    trackT: number,
  ): void {
    if (raceTimeMs < 0) return;
    if (raceTimeMs - this.lastRecordMs < 55) return; // ~18 Hz lightweight recording
    this.lastRecordMs = raceTimeMs;
    if (this.recordBuffer.length < 7500) {
      this.recordBuffer.push({
        tMs: Math.round(raceTimeMs),
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        z: Number(z.toFixed(2)),
        yaw: Number(yaw.toFixed(4)),
        steerNorm: Number(steerNorm.toFixed(2)),
        speedMps: Number(speedMps.toFixed(2)),
        trackT: Number(trackT.toFixed(4)),
      });
    }
  }

  public commitBestRunIfFaster(
    mapId: MapId,
    direction: 'downhill' | 'uphill',
    carId: AnyCarSpecId,
    finishTimeMs: number,
  ): void {
    if (this.recordBuffer.length < 15 || finishTimeMs < 10_000) return;
    const prev = loadStoredPbGhost(mapId, direction, carId);
    if (!prev || finishTimeMs < prev.totalTimeMs) {
      saveStoredPbGhost({
        mapId,
        direction,
        carId: normalizeCarModelId(carId),
        totalTimeMs: Math.round(finishTimeMs),
        name: 'YOUR PB GHOST',
        samples: this.recordBuffer.slice(),
      });
    }
  }

  public update(
    dt: number,
    raceTimeMs: number,
    playerX: number,
    playerZ: number,
    playerProgress: number,
    nightFactor: number,
  ): GhostBattleStatus {
    if (this.mode === 'off' || !this.activePlayback || this.activePlayback.samples.length < 2) {
      this.group.visible = false;
      return {
        active: false,
        mode: this.mode,
        ghostName: '',
        ghostCarId: 'toyota-ae86-trueno',
        deltaSec: null,
        gapMeters: 0,
      };
    }

    const samples = this.activePlayback.samples;
    const totalMs = Math.max(1000, samples[samples.length - 1].tMs);
    const clampedMs = clamp(raceTimeMs, 0, totalMs);

    // Binary search playback interval
    let lo = 0;
    let hi = samples.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].tMs <= clampedMs) lo = mid;
      else hi = mid;
    }
    const a = samples[lo];
    const b = samples[hi];
    const span = Math.max(1, b.tMs - a.tMs);
    const alpha = clamp((clampedMs - a.tMs) / span, 0, 1);

    const gx = lerp(a.x, b.x, alpha);
    const gy = lerp(a.y, b.y, alpha);
    const gz = lerp(a.z, b.z, alpha);
    let dyaw = b.yaw - a.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const gyaw = a.yaw + dyaw * alpha;
    const gSpeed = lerp(a.speedMps, b.speedMps, alpha);
    const gSteer = lerp(a.steerNorm, b.steerNorm, alpha);
    const gTrackT = lerp(a.trackT, b.trackT, alpha);

    this.group.visible = true;
    if (this.ghostInstance) {
      this.ghostInstance.root.position.set(gx, gy, gz);
      this.rotEulerScratch.set(0, gyaw, 0);
      this.quatScratch.setFromEuler(this.rotEulerScratch);
      this.ghostInstance.root.quaternion.copy(this.quatScratch);
      this.ghostInstance.setLights(nightFactor > 0.25, 0, nightFactor);

      this.wheelSpinAccum += (gSpeed / Math.max(0.28, this.ghostInstance.wheelRadius)) * dt;
      for (let i = 0; i < 4; i++) {
        this.ghostInstance.wheelSpinPivots[i].rotation.x = this.wheelSpinAccum;
      }
      for (const fp of this.ghostInstance.frontWheelSteerPivots) {
        fp.rotation.y = gSteer * 0.48;
      }
    }

    const circuit = getCircuitData();
    const gapMeters = Math.round(Math.hypot(gx - playerX, gz - playerZ));
    // Estimate signed time delta based on progress difference & average pace
    const progDiff = gTrackT - playerProgress;
    const avgPaceMps = Math.max(18, (circuit.totalLength / Math.max(1, totalMs / 1000)));
    const deltaSec = Number(((progDiff * circuit.totalLength) / avgPaceMps).toFixed(2));

    return {
      active: true,
      mode: this.mode,
      ghostName: this.activePlayback.name,
      ghostCarId: this.activePlayback.carId,
      deltaSec,
      gapMeters,
    };
  }

  public dispose(): void {
    if (this.ghostInstance) {
      this.group.remove(this.ghostInstance.root);
      this.ghostInstance.dispose();
      this.ghostInstance = null;
    }
    if (this.tagSpriteObj) {
      this.group.remove(this.tagSpriteObj.sprite);
      this.tagSpriteObj.texture.dispose();
      this.tagSpriteObj.material.dispose();
      this.tagSpriteObj = null;
    }
  }
}
