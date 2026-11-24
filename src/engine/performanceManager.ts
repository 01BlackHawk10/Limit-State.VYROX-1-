import * as THREE from 'three';
import type { MapId } from '../Maps/mapRegistry';

export interface PerformanceSpikeEntry {
  label: string;
  ms: number;
  atSec: number;
}

export interface PerformanceSnapshot {
  fps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  physicsMs: number;
  worldMs: number;
  renderMs: number;
  uiSyncMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  pooledCars: number;
  lastTransitionLabel: string;
  lastTransitionMs: number;
  recentSpikes: PerformanceSpikeEntry[];
  autoManageEnabled: boolean;
  autoThrottleLevel: 0 | 1 | 2;
  drsScale: number;
  effectiveDpr: number;
  activeMapId: MapId;
}

const WINDOW_SIZE = 120;
const DRS_STEPS = [1.0, 0.85, 0.72] as const;

/**
 * Zero-allocation circular buffer profiler for the WebGL main loop.
 * Tracks per-frame durations, 95th percentile spikes, subsystem costs,
 * transition hitches (car switch, map switch, mode changes), Dynamic Resolution Scaling,
 * and GPU object counts.
 */
export class MainLoopProfiler {
  private readonly frameBuf = new Float64Array(WINDOW_SIZE);
  private readonly physicsBuf = new Float64Array(WINDOW_SIZE);
  private readonly worldBuf = new Float64Array(WINDOW_SIZE);
  private readonly renderBuf = new Float64Array(WINDOW_SIZE);
  private readonly uiBuf = new Float64Array(WINDOW_SIZE);
  private readonly scratchSort = new Float64Array(WINDOW_SIZE);

  private cursor = 0;
  private sampleCount = 0;
  private transitionLabel = '';
  private transitionStartMs = 0;
  private lastTransitionLabel = 'Boot';
  private lastTransitionMs = 0;
  private readonly spikes: PerformanceSpikeEntry[] = [];

  private lastEmitMs = 0;
  private autoThrottleLevel: 0 | 1 | 2 = 0;
  private drsIndex = 0;
  private effectiveDpr = 1;
  private autoManageEnabled = true;
  private slowStreak = 0;
  private fastStreak = 0;

  // First ~2.5s startup benchmark for unpinned Balanced -> Low downgrade
  private startupElapsedSec = 0;
  private startupFrameCount = 0;
  private startupTotalMs = 0;
  private startupEvaluated = false;

  public setAutoManage(enabled: boolean) {
    this.autoManageEnabled = enabled;
    if (!enabled) {
      this.autoThrottleLevel = 0;
      this.drsIndex = 0;
      this.slowStreak = 0;
      this.fastStreak = 0;
    }
  }

  public isAutoManageEnabled(): boolean {
    return this.autoManageEnabled;
  }

  public getAutoThrottleLevel(): 0 | 1 | 2 {
    return this.autoThrottleLevel;
  }

  public getDrsScale(): number {
    return DRS_STEPS[this.drsIndex];
  }

  public resetDrs() {
    this.drsIndex = 0;
    this.slowStreak = 0;
    this.fastStreak = 0;
  }

  public resetAllThrottle() {
    this.autoThrottleLevel = 0;
    this.drsIndex = 0;
    this.slowStreak = 0;
    this.fastStreak = 0;
    this.startupEvaluated = true;
  }

  public setEffectiveDpr(dpr: number) {
    this.effectiveDpr = Math.round(dpr * 100) / 100;
  }

  public markStartupEvaluated() {
    this.startupEvaluated = true;
  }

  public beginTransition(label: string) {
    this.transitionLabel = label;
    this.transitionStartMs = performance.now();
  }

  public endTransition(elapsedSec: number) {
    if (!this.transitionLabel) return;
    const dur = Math.max(0.1, performance.now() - this.transitionStartMs);
    this.lastTransitionLabel = this.transitionLabel;
    this.lastTransitionMs = dur;
    if (dur >= 38) {
      this.pushSpike(this.transitionLabel, dur, elapsedSec);
    }
    this.transitionLabel = '';
  }

  public recordTransitionDuration(label: string, durMs: number, elapsedSec: number) {
    this.lastTransitionLabel = label;
    this.lastTransitionMs = durMs;
    if (durMs >= 38) {
      this.pushSpike(label, durMs, elapsedSec);
    }
  }

  private pushSpike(label: string, ms: number, elapsedSec: number) {
    this.spikes.unshift({
      label,
      ms: Math.round(ms * 10) / 10,
      atSec: Math.round(elapsedSec * 10) / 10,
    });
    if (this.spikes.length > 6) {
      this.spikes.length = 6;
    }
  }

  public recordFrame(
    frameMs: number,
    physicsMs: number,
    worldMs: number,
    renderMs: number,
    uiSyncMs: number,
    elapsedSec: number,
  ): { throttleChanged: boolean; drsChanged: boolean; newLevel: 0 | 1 | 2; startupDowngradeRecommended: boolean } {
    const idx = this.cursor;
    this.frameBuf[idx] = frameMs;
    this.physicsBuf[idx] = physicsMs;
    this.worldBuf[idx] = worldMs;
    this.renderBuf[idx] = renderMs;
    this.uiBuf[idx] = uiSyncMs;

    this.cursor = (idx + 1) % WINDOW_SIZE;
    if (this.sampleCount < WINDOW_SIZE) this.sampleCount++;

    if (!this.startupEvaluated && elapsedSec > 0.45 && frameMs < 250) {
      this.startupElapsedSec = elapsedSec;
      this.startupFrameCount++;
      this.startupTotalMs += frameMs;
    }

    let startupDowngradeRecommended = false;
    if (!this.startupEvaluated && this.startupElapsedSec >= 2.8 && this.startupFrameCount >= 45) {
      const avgStartupMs = this.startupTotalMs / this.startupFrameCount;
      startupDowngradeRecommended = avgStartupMs > 34.0;
      this.startupEvaluated = true;
    }

    if (frameMs >= 52 && this.sampleCount > 12) {
      // Only log runtime frame hitches every ~0.8s max to avoid noise
      const last = this.spikes[0];
      if (!last || Math.abs(elapsedSec - last.atSec) > 0.8) {
        this.pushSpike('Frame Hitch', frameMs, elapsedSec);
      }
    }

    let throttleChanged = false;
    let drsChanged = false;
    if (this.autoManageEnabled && this.sampleCount >= 40) {
      if (frameMs > 28.5) {
        this.slowStreak++;
        this.fastStreak = 0;
        if (this.slowStreak > 45) {
          if (this.drsIndex < DRS_STEPS.length - 1) {
            this.drsIndex++;
            this.slowStreak = 0;
            drsChanged = true;
          } else if (this.autoThrottleLevel < 1 || (this.autoThrottleLevel < 2 && frameMs > 40.0)) {
            this.autoThrottleLevel = (this.autoThrottleLevel + 1) as 0 | 1 | 2;
            this.slowStreak = 0;
            throttleChanged = true;
          }
        }
      } else if (frameMs < 18.0) {
        this.fastStreak++;
        this.slowStreak = Math.max(0, this.slowStreak - 1);
        if (this.fastStreak > 110) {
          if (this.autoThrottleLevel > 0) {
            this.autoThrottleLevel = (this.autoThrottleLevel - 1) as 0 | 1 | 2;
            this.fastStreak = 0;
            throttleChanged = true;
          } else if (this.drsIndex > 0) {
            this.drsIndex--;
            this.fastStreak = 0;
            drsChanged = true;
          }
        }
      } else {
        this.slowStreak = Math.max(0, this.slowStreak - 1);
      }
    }

    return {
      throttleChanged,
      drsChanged,
      newLevel: this.autoThrottleLevel,
      startupDowngradeRecommended,
    };
  }

  public shouldEmit(nowMs: number, intervalMs = 250): boolean {
    if (nowMs - this.lastEmitMs >= intervalMs) {
      this.lastEmitMs = nowMs;
      return true;
    }
    return false;
  }

  public buildSnapshot(
    renderer: THREE.WebGLRenderer,
    pooledCars: number,
    activeMapId: MapId,
  ): PerformanceSnapshot {
    const n = Math.max(1, this.sampleCount);
    let sumF = 0;
    let sumP = 0;
    let sumW = 0;
    let sumR = 0;
    let sumU = 0;
    for (let i = 0; i < n; i++) {
      const f = this.frameBuf[i];
      sumF += f;
      sumP += this.physicsBuf[i];
      sumW += this.worldBuf[i];
      sumR += this.renderBuf[i];
      sumU += this.uiBuf[i];
      this.scratchSort[i] = f;
    }

    // Insertion/simple sort on <= 120 elements
    for (let i = 1; i < n; i++) {
      const key = this.scratchSort[i];
      let j = i - 1;
      while (j >= 0 && this.scratchSort[j] > key) {
        this.scratchSort[j + 1] = this.scratchSort[j];
        j--;
      }
      this.scratchSort[j + 1] = key;
    }
    const p95Idx = Math.min(n - 1, Math.floor(n * 0.95));
    const avgFrameMs = sumF / n;
    const fps = avgFrameMs > 0.1 ? Math.min(240, Math.round(1000 / avgFrameMs)) : 60;

    const info = renderer.info;
    return {
      fps,
      avgFrameMs: Math.round(avgFrameMs * 10) / 10,
      p95FrameMs: Math.round(this.scratchSort[p95Idx] * 10) / 10,
      physicsMs: Math.round((sumP / n) * 100) / 100,
      worldMs: Math.round((sumW / n) * 100) / 100,
      renderMs: Math.round((sumR / n) * 100) / 100,
      uiSyncMs: Math.round((sumU / n) * 100) / 100,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      pooledCars,
      lastTransitionLabel: this.lastTransitionLabel,
      lastTransitionMs: Math.round(this.lastTransitionMs * 10) / 10,
      recentSpikes: this.spikes.slice(),
      autoManageEnabled: this.autoManageEnabled,
      autoThrottleLevel: this.autoThrottleLevel,
      drsScale: DRS_STEPS[this.drsIndex],
      effectiveDpr: this.effectiveDpr,
      activeMapId,
    };
  }
}

/**
 * Deterministic Three.js resource disposal helper for map switches, car eviction,
 * and manual cache purges.
 */
export function disposeObjectTree(root: THREE.Object3D): { geometries: number; materials: number } {
  let geometries = 0;
  let materials = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
      geometries++;
    }
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) {
        if (m) {
          m.dispose();
          materials++;
        }
      }
    } else if (mat) {
      mat.dispose();
      materials++;
    }
  });
  return { geometries, materials };
}
