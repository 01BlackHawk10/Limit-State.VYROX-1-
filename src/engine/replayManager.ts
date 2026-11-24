import * as THREE from 'three';
import type { AiRivalReplayPose, AiRivalsRig } from '../Maps/Aurelia Ridge/aiRivalsRig';
import type { CctvStationInfo } from '../Maps/Aurelia Ridge/cctvAndPaceRig';
import { clamp, lerp } from './mathNoise';
import type { CarModelId } from '../shared/carTypes';
import type { GameMode, VehiclePhysicsEngine, VehicleTelemetry } from './vehiclePhysics';

export type ReplayCameraMode =
  | 'cinematic_chase'
  | 'cctv_auto'
  | 'cctv_manual'
  | 'helicopter'
  | 'orbit'
  | 'cockpit'
  | 'hood'
  | 'bumper';

export const REPLAY_CAMERA_OPTIONS: Array<{
  id: ReplayCameraMode;
  label: string;
  shortLabel: string;
}> = [
  { id: 'cinematic_chase', label: 'Broadcast Chase', shortLabel: 'Chase' },
  { id: 'cctv_auto', label: 'CCTV Auto Track', shortLabel: 'CCTV Auto' },
  { id: 'cctv_manual', label: 'CCTV Station', shortLabel: 'CCTV Cam' },
  { id: 'helicopter', label: 'Helicopter Cam', shortLabel: 'Heli' },
  { id: 'orbit', label: 'Free Orbit', shortLabel: 'Orbit' },
  { id: 'cockpit', label: 'Cockpit View', shortLabel: 'Cockpit' },
  { id: 'hood', label: 'Hood Cam', shortLabel: 'Hood' },
  { id: 'bumper', label: 'Bumper Cam', shortLabel: 'Bumper' },
];

export interface ReplayRivalSample {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  pitch: number;
  roll: number;
  wheelSpin: number;
  steerAngle: number;
  brakeFactor: number;
  speedMps: number;
}

export interface ReplayFrame {
  tMs: number;
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  bodyPitch: number;
  bodyRoll: number;
  bodyHeave: number;
  wheelSpin: number;
  wheelSpins: [number, number, number, number];
  wheelSuspOffsets: [number, number, number, number];
  steerAngle: number;
  steerAngleFL: number;
  steerAngleFR: number;
  speedKmh: number;
  speedMps: number;
  rpm: number;
  redlineRpm: number;
  gear: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  latG: number;
  driftAngleDeg: number;
  lap: number;
  trackT: number;
  dirtLevel: number;
  brakeSkidIntensity: number;
  aeroDeployed: boolean;
  headlightsOn: boolean;
  rivals: ReplayRivalSample[];
}

export interface RaceReplayRecording {
  id: string;
  mapId: string;
  mapName: string;
  carId: CarModelId;
  carName: string;
  mode: GameMode;
  weatherPreset: string;
  hasRivals: boolean;
  recordedAt: number;
  durationMs: number;
  frameCount: number;
  frames: ReplayFrame[];
}

export interface ReplayTracePoint {
  tFrac: number;
  speedNorm: number;
  throttle: number;
  brake: number;
}

export interface ReplayUiState {
  active: boolean;
  playing: boolean;
  currentTimeMs: number;
  durationMs: number;
  playbackSpeed: number;
  cameraMode: ReplayCameraMode;
  cctvStationIndex: number;
  cctvStations: CctvStationInfo[];
  mapId: string;
  mapName: string;
  carName: string;
  mode: GameMode;
  speedKmh: number;
  rpm: number;
  redlineRpm: number;
  gear: number;
  throttle: number;
  brake: number;
  latG: number;
  driftAngleDeg: number;
  lap: number;
  tracePoints: ReplayTracePoint[];
}

export interface ReplayPlaybackSnapshot {
  tMs: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  bodyPitch: number;
  bodyRoll: number;
  bodyHeave: number;
  wheelSpin: number;
  wheelSpins: [number, number, number, number];
  wheelSuspOffsets: [number, number, number, number];
  steerAngle: number;
  steerAngleFL: number;
  steerAngleFR: number;
  speedKmh: number;
  speedMps: number;
  rpm: number;
  redlineRpm: number;
  gear: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  latG: number;
  driftAngleDeg: number;
  lap: number;
  trackT: number;
  dirtLevel: number;
  brakeSkidIntensity: number;
  aeroDeployed: boolean;
  headlightsOn: boolean;
  rivalsCount: number;
  rivals: AiRivalReplayPose[];
}

const MAX_REPLAY_FRAMES = 9000; // ~7.5 minutes at 20 Hz
const SAMPLE_INTERVAL_MS = 50; // 20 Hz

const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _rqA = new THREE.Quaternion();
const _rqB = new THREE.Quaternion();

function createEmptyRivalPose(): AiRivalReplayPose {
  return {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    pitch: 0,
    roll: 0,
    wheelSpin: 0,
    steerAngle: 0,
    brakeFactor: 0,
    speedMps: 0,
  };
}

export class RaceReplayRecorder {
  private active = false;
  private frames: ReplayFrame[] = [];
  private elapsedMs = 0;
  private lastSampleMs = -999;
  private meta: {
    id: string;
    mapId: string;
    mapName: string;
    carId: CarModelId;
    carName: string;
    mode: GameMode;
    weatherPreset: string;
    hasRivals: boolean;
    recordedAt: number;
  } | null = null;
  private rivalPoseScratch: AiRivalReplayPose[] = Array.from({ length: 8 }, createEmptyRivalPose);

  start(meta: {
    mapId: string;
    mapName: string;
    carId: CarModelId;
    carName: string;
    mode: GameMode;
    weatherPreset: string;
    hasRivals: boolean;
  }): void {
    this.active = true;
    this.frames = [];
    this.elapsedMs = 0;
    this.lastSampleMs = -999;
    this.meta = {
      id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ...meta,
      recordedAt: Date.now(),
    };
  }

  maybeRecord(
    deltaSec: number,
    physics: VehiclePhysicsEngine,
    tlm: VehicleTelemetry,
    aiRivalsRig: AiRivalsRig,
    headlightsOn: boolean,
  ): void {
    if (!this.active || !this.meta || tlm.countdownSec > 0 || tlm.raceFinished) return;
    this.elapsedMs += Math.max(0, deltaSec) * 1000;
    if (this.elapsedMs - this.lastSampleMs < SAMPLE_INTERVAL_MS) return;
    if (this.frames.length >= MAX_REPLAY_FRAMES) return;

    this.lastSampleMs = this.elapsedMs;
    const rivalCount = this.meta.hasRivals
      ? aiRivalsRig.getReplayPoses(this.rivalPoseScratch)
      : 0;
    const rivals: ReplayRivalSample[] = new Array(rivalCount);
    for (let i = 0; i < rivalCount; i++) {
      const rp = this.rivalPoseScratch[i];
      rivals[i] = {
        x: rp.pos.x,
        y: rp.pos.y,
        z: rp.pos.z,
        qx: rp.quat.x,
        qy: rp.quat.y,
        qz: rp.quat.z,
        qw: rp.quat.w,
        pitch: rp.pitch,
        roll: rp.roll,
        wheelSpin: rp.wheelSpin,
        steerAngle: rp.steerAngle,
        brakeFactor: rp.brakeFactor,
        speedMps: rp.speedMps,
      };
    }

    this.frames.push({
      tMs: Math.round(this.elapsedMs),
      px: physics.pos.x,
      py: physics.pos.y,
      pz: physics.pos.z,
      qx: physics.worldQuaternion.x,
      qy: physics.worldQuaternion.y,
      qz: physics.worldQuaternion.z,
      qw: physics.worldQuaternion.w,
      bodyPitch: physics.bodyPitch,
      bodyRoll: physics.bodyRoll,
      bodyHeave: physics.bodyHeave,
      wheelSpin: physics.wheelSpin,
      wheelSpins: [
        physics.wheelSpins[0],
        physics.wheelSpins[1],
        physics.wheelSpins[2],
        physics.wheelSpins[3],
      ],
      wheelSuspOffsets: [
        physics.wheelSuspOffsets[0],
        physics.wheelSuspOffsets[1],
        physics.wheelSuspOffsets[2],
        physics.wheelSuspOffsets[3],
      ],
      steerAngle: physics.steerAngle,
      steerAngleFL: physics.steerAngleFL,
      steerAngleFR: physics.steerAngleFR,
      speedKmh: tlm.speedKmh,
      speedMps: tlm.speedMps,
      rpm: tlm.rpm,
      redlineRpm: tlm.redlineRpm,
      gear: tlm.gear,
      throttle: tlm.throttle,
      brake: tlm.brake,
      handbrake: tlm.handbrake,
      latG: tlm.latG,
      driftAngleDeg: tlm.driftAngleDeg,
      lap: tlm.lap,
      trackT: tlm.trackT,
      dirtLevel: tlm.dirtLevel,
      brakeSkidIntensity: tlm.brakeSkidIntensity,
      aeroDeployed: tlm.aeroDeployed,
      headlightsOn,
      rivals,
    });
  }

  finish(): RaceReplayRecording | null {
    if (!this.active || !this.meta) return null;
    this.active = false;
    if (this.frames.length < 15) {
      return null;
    }
    const durationMs = this.frames[this.frames.length - 1].tMs;
    return {
      ...this.meta,
      durationMs,
      frameCount: this.frames.length,
      frames: this.frames,
    };
  }

  cancel(): void {
    this.active = false;
    this.frames = [];
  }
}

export class ReplayPlayer {
  private recording: RaceReplayRecording | null = null;
  private playing = false;
  private currentTimeMs = 0;
  private playbackSpeed = 1.0;
  private tracePoints: ReplayTracePoint[] = [];

  private readonly snapshot: ReplayPlaybackSnapshot = {
    tMs: 0,
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    forward: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    bodyPitch: 0,
    bodyRoll: 0,
    bodyHeave: 0,
    wheelSpin: 0,
    wheelSpins: [0, 0, 0, 0],
    wheelSuspOffsets: [0, 0, 0, 0],
    steerAngle: 0,
    steerAngleFL: 0,
    steerAngleFR: 0,
    speedKmh: 0,
    speedMps: 0,
    rpm: 900,
    redlineRpm: 8000,
    gear: 1,
    throttle: 0,
    brake: 0,
    handbrake: false,
    latG: 0,
    driftAngleDeg: 0,
    lap: 1,
    trackT: 0,
    dirtLevel: 0,
    brakeSkidIntensity: 0,
    aeroDeployed: false,
    headlightsOn: false,
    rivalsCount: 0,
    rivals: Array.from({ length: 8 }, createEmptyRivalPose),
  };

  load(recording: RaceReplayRecording): void {
    this.recording = recording;
    this.currentTimeMs = 0;
    this.playing = true;
    this.playbackSpeed = 1.0;
    this.tracePoints = this.buildTracePoints(recording);
  }

  private buildTracePoints(recording: RaceReplayRecording): ReplayTracePoint[] {
    const frames = recording.frames;
    if (frames.length === 0) return [];
    const targetBuckets = Math.min(120, frames.length);
    let maxSpeed = 120;
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].speedKmh > maxSpeed) maxSpeed = frames[i].speedKmh;
    }
    const pts: ReplayTracePoint[] = [];
    for (let b = 0; b < targetBuckets; b++) {
      const idx = Math.min(
        frames.length - 1,
        Math.floor((b / Math.max(1, targetBuckets - 1)) * (frames.length - 1)),
      );
      const f = frames[idx];
      pts.push({
        tFrac: recording.durationMs > 0 ? f.tMs / recording.durationMs : b / Math.max(1, targetBuckets - 1),
        speedNorm: clamp(f.speedKmh / maxSpeed, 0, 1),
        throttle: clamp(f.throttle, 0, 1),
        brake: clamp(f.brake, 0, 1),
      });
    }
    return pts;
  }

  getRecording(): RaceReplayRecording | null {
    return this.recording;
  }

  getTracePoints(): ReplayTracePoint[] {
    return this.tracePoints;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  setPlaying(next: boolean): void {
    if (!this.recording) return;
    if (next && this.currentTimeMs >= this.recording.durationMs - 10) {
      this.currentTimeMs = 0;
    }
    this.playing = next;
  }

  getCurrentTimeMs(): number {
    return this.currentTimeMs;
  }

  getDurationMs(): number {
    return this.recording?.durationMs ?? 0;
  }

  getSpeed(): number {
    return this.playbackSpeed;
  }

  setSpeed(speed: number): void {
    this.playbackSpeed = clamp(speed, 0.25, 4.0);
  }

  seekMs(targetMs: number): void {
    if (!this.recording) return;
    this.currentTimeMs = clamp(targetMs, 0, this.recording.durationMs);
  }

  stepFrames(frameDelta: number): void {
    if (!this.recording) return;
    this.playing = false;
    this.seekMs(this.currentTimeMs + frameDelta * SAMPLE_INTERVAL_MS);
  }

  advance(deltaSec: number): void {
    if (!this.recording || !this.playing) return;
    this.currentTimeMs += deltaSec * 1000 * this.playbackSpeed;
    if (this.currentTimeMs >= this.recording.durationMs) {
      this.currentTimeMs = this.recording.durationMs;
      this.playing = false;
    }
  }

  sample(): ReplayPlaybackSnapshot | null {
    const rec = this.recording;
    if (!rec || rec.frames.length === 0) return null;
    const frames = rec.frames;
    const t = clamp(this.currentTimeMs, 0, rec.durationMs);

    // Binary search for lower bracketing frame
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (frames[mid].tMs <= t) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    const idxA = lo;
    const idxB = Math.min(frames.length - 1, idxA + 1);
    const fA = frames[idxA];
    const fB = frames[idxB];
    const span = fB.tMs - fA.tMs;
    const alpha = span > 0 ? clamp((t - fA.tMs) / span, 0, 1) : 0;

    const snap = this.snapshot;
    snap.tMs = t;
    snap.pos.set(
      lerp(fA.px, fB.px, alpha),
      lerp(fA.py, fB.py, alpha),
      lerp(fA.pz, fB.pz, alpha),
    );
    _qA.set(fA.qx, fA.qy, fA.qz, fA.qw);
    _qB.set(fB.qx, fB.qy, fB.qz, fB.qw);
    snap.quat.copy(_qA).slerp(_qB, alpha).normalize();

    snap.forward.set(0, 0, 1).applyQuaternion(snap.quat).normalize();
    snap.right.set(1, 0, 0).applyQuaternion(snap.quat).normalize();
    snap.up.set(0, 1, 0).applyQuaternion(snap.quat).normalize();

    snap.bodyPitch = lerp(fA.bodyPitch, fB.bodyPitch, alpha);
    snap.bodyRoll = lerp(fA.bodyRoll, fB.bodyRoll, alpha);
    snap.bodyHeave = lerp(fA.bodyHeave, fB.bodyHeave, alpha);
    snap.wheelSpin = lerp(fA.wheelSpin, fB.wheelSpin, alpha);
    for (let i = 0; i < 4; i++) {
      snap.wheelSpins[i] = lerp(fA.wheelSpins[i], fB.wheelSpins[i], alpha);
      snap.wheelSuspOffsets[i] = lerp(fA.wheelSuspOffsets[i], fB.wheelSuspOffsets[i], alpha);
    }
    snap.steerAngle = lerp(fA.steerAngle, fB.steerAngle, alpha);
    snap.steerAngleFL = lerp(fA.steerAngleFL, fB.steerAngleFL, alpha);
    snap.steerAngleFR = lerp(fA.steerAngleFR, fB.steerAngleFR, alpha);
    snap.speedKmh = lerp(fA.speedKmh, fB.speedKmh, alpha);
    snap.speedMps = lerp(fA.speedMps, fB.speedMps, alpha);
    snap.rpm = lerp(fA.rpm, fB.rpm, alpha);
    snap.redlineRpm = fA.redlineRpm;
    snap.gear = alpha < 0.5 ? fA.gear : fB.gear;
    snap.throttle = lerp(fA.throttle, fB.throttle, alpha);
    snap.brake = lerp(fA.brake, fB.brake, alpha);
    snap.handbrake = alpha < 0.5 ? fA.handbrake : fB.handbrake;
    snap.latG = lerp(fA.latG, fB.latG, alpha);
    snap.driftAngleDeg = lerp(fA.driftAngleDeg, fB.driftAngleDeg, alpha);
    snap.lap = alpha < 0.5 ? fA.lap : fB.lap;
    snap.trackT = lerp(fA.trackT, fB.trackT, alpha);
    snap.dirtLevel = lerp(fA.dirtLevel, fB.dirtLevel, alpha);
    snap.brakeSkidIntensity = lerp(fA.brakeSkidIntensity, fB.brakeSkidIntensity, alpha);
    snap.aeroDeployed = alpha < 0.5 ? fA.aeroDeployed : fB.aeroDeployed;
    snap.headlightsOn = alpha < 0.5 ? fA.headlightsOn : fB.headlightsOn;

    const rCount = Math.min(fA.rivals.length, fB.rivals.length, snap.rivals.length);
    snap.rivalsCount = rCount;
    for (let i = 0; i < rCount; i++) {
      const ra = fA.rivals[i];
      const rb = fB.rivals[i];
      const dst = snap.rivals[i];
      dst.pos.set(lerp(ra.x, rb.x, alpha), lerp(ra.y, rb.y, alpha), lerp(ra.z, rb.z, alpha));
      _rqA.set(ra.qx, ra.qy, ra.qz, ra.qw);
      _rqB.set(rb.qx, rb.qy, rb.qz, rb.qw);
      dst.quat.copy(_rqA).slerp(_rqB, alpha).normalize();
      dst.pitch = lerp(ra.pitch, rb.pitch, alpha);
      dst.roll = lerp(ra.roll, rb.roll, alpha);
      dst.wheelSpin = lerp(ra.wheelSpin, rb.wheelSpin, alpha);
      dst.steerAngle = lerp(ra.steerAngle, rb.steerAngle, alpha);
      dst.brakeFactor = lerp(ra.brakeFactor, rb.brakeFactor, alpha);
      dst.speedMps = lerp(ra.speedMps, rb.speedMps, alpha);
    }

    return snap;
  }
}

const REPLAY_DB_NAME = 'vyrox_race_replays_v1';
const REPLAY_STORE_NAME = 'replays';
const REPLAY_LATEST_KEY = 'latest_replay';

function openReplayDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(REPLAY_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(REPLAY_STORE_NAME)) {
          db.createObjectStore(REPLAY_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveReplayToDb(recording: RaceReplayRecording): Promise<void> {
  const db = await openReplayDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(REPLAY_STORE_NAME, 'readwrite');
      tx.objectStore(REPLAY_STORE_NAME).put(recording, REPLAY_LATEST_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function loadLatestReplayFromDb(): Promise<RaceReplayRecording | null> {
  const db = await openReplayDb();
  if (!db) return null;
  return new Promise<RaceReplayRecording | null>((resolve) => {
    try {
      const tx = db.transaction(REPLAY_STORE_NAME, 'readonly');
      const req = tx.objectStore(REPLAY_STORE_NAME).get(REPLAY_LATEST_KEY);
      req.onsuccess = () => {
        const val = req.result as RaceReplayRecording | undefined;
        db.close();
        if (val && Array.isArray(val.frames) && val.frames.length >= 15) {
          resolve(val);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}
