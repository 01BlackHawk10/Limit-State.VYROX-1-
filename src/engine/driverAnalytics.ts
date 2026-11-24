import type { DriverAnalyticsData, DriverAnalyticsSession } from '../shared/socialTypes';
import type { VehiclePhysicsEngine, VehicleTelemetry } from './vehiclePhysics';

export const DRIVER_ANALYTICS_STORAGE_KEY = 'aurelia_driver_analytics_v1';

export const TURN_IN_BIN_LABELS = ['0–8°', '8–16°', '16–24°', '24–34°', '34°+'] as const;

export function createEmptyDriverAnalytics(): DriverAnalyticsData {
  return {
    totalSessions: 0,
    totalDriveTimeSec: 0,
    totalDistanceKm: 0,
    totalCorners: 0,
    turnInAngleSumDeg: 0,
    turnInAngleSamples: 0,
    turnInHistogram: [0, 0, 0, 0, 0],
    throttleToBrakeSumMs: 0,
    throttleToBrakeCount: 0,
    bestThrottleToBrakeMs: null,
    recentThrottleToBrakeMs: [],
    driftExitCount: 0,
    driftToGripEfficiencySumPct: 0,
    trailBrakingCorners: 0,
    peakLatG: 0,
    cleanTimeSec: 0,
    trackTimeSec: 0,
    recentSessions: [],
    updatedAt: 0,
  };
}

function clampNum(val: unknown, min: number, max: number, fallback = 0): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
}

export function normalizeDriverAnalytics(raw: unknown): DriverAnalyticsData {
  const base = createEmptyDriverAnalytics();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<DriverAnalyticsData>;
  const histRaw = Array.isArray(r.turnInHistogram) ? r.turnInHistogram : [];
  const hist: [number, number, number, number, number] = [
    Math.max(0, Math.round(clampNum(histRaw[0], 0, 1e7, 0))),
    Math.max(0, Math.round(clampNum(histRaw[1], 0, 1e7, 0))),
    Math.max(0, Math.round(clampNum(histRaw[2], 0, 1e7, 0))),
    Math.max(0, Math.round(clampNum(histRaw[3], 0, 1e7, 0))),
    Math.max(0, Math.round(clampNum(histRaw[4], 0, 1e7, 0))),
  ];
  const recentTtb = Array.isArray(r.recentThrottleToBrakeMs)
    ? r.recentThrottleToBrakeMs
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 15 && v <= 2000)
        .slice(-16)
    : [];
  const recentSess = Array.isArray(r.recentSessions)
    ? r.recentSessions
        .filter((s): s is DriverAnalyticsSession => Boolean(s && typeof s.id === 'string'))
        .slice(0, 12)
    : [];
  return {
    totalSessions: Math.max(0, Math.round(clampNum(r.totalSessions, 0, 1e6, 0))),
    totalDriveTimeSec: clampNum(r.totalDriveTimeSec, 0, 1e9, 0),
    totalDistanceKm: clampNum(r.totalDistanceKm, 0, 1e7, 0),
    totalCorners: Math.max(0, Math.round(clampNum(r.totalCorners, 0, 1e7, 0))),
    turnInAngleSumDeg: clampNum(r.turnInAngleSumDeg, 0, 1e9, 0),
    turnInAngleSamples: Math.max(0, Math.round(clampNum(r.turnInAngleSamples, 0, 1e7, 0))),
    turnInHistogram: hist,
    throttleToBrakeSumMs: clampNum(r.throttleToBrakeSumMs, 0, 1e9, 0),
    throttleToBrakeCount: Math.max(0, Math.round(clampNum(r.throttleToBrakeCount, 0, 1e7, 0))),
    bestThrottleToBrakeMs:
      typeof r.bestThrottleToBrakeMs === 'number' &&
      Number.isFinite(r.bestThrottleToBrakeMs) &&
      r.bestThrottleToBrakeMs >= 15
        ? Math.round(r.bestThrottleToBrakeMs)
        : null,
    recentThrottleToBrakeMs: recentTtb,
    driftExitCount: Math.max(0, Math.round(clampNum(r.driftExitCount, 0, 1e7, 0))),
    driftToGripEfficiencySumPct: clampNum(r.driftToGripEfficiencySumPct, 0, 1e9, 0),
    trailBrakingCorners: Math.max(0, Math.round(clampNum(r.trailBrakingCorners, 0, 1e7, 0))),
    peakLatG: clampNum(r.peakLatG, 0, 8, 0),
    cleanTimeSec: clampNum(r.cleanTimeSec, 0, 1e9, 0),
    trackTimeSec: clampNum(r.trackTimeSec, 0, 1e9, 0),
    recentSessions: recentSess,
    updatedAt: clampNum(r.updatedAt, 0, 1e14, 0),
  };
}

export function mergeDriverAnalytics(
  primaryRaw?: DriverAnalyticsData | null,
  fallbackRaw?: DriverAnalyticsData | null,
): DriverAnalyticsData {
  const a = normalizeDriverAnalytics(primaryRaw);
  const b = normalizeDriverAnalytics(fallbackRaw);
  if (a.totalSessions === 0 && b.totalSessions === 0) {
    return a.updatedAt >= b.updatedAt ? a : b;
  }
  if (a.totalSessions === 0) return b;
  if (b.totalSessions === 0) return a;

  const byId = new Map<string, DriverAnalyticsSession>();
  for (const s of [...b.recentSessions, ...a.recentSessions]) {
    if (!s?.id) continue;
    const prev = byId.get(s.id);
    if (!prev || s.recordedAt >= prev.recordedAt) {
      byId.set(s.id, s);
    }
  }
  const mergedSessions = Array.from(byId.values())
    .sort((x, y) => y.recordedAt - x.recordedAt)
    .slice(0, 12);

  // Pick the snapshot with more lifetime drive time / sessions as authoritative base
  const dominant =
    a.totalSessions > b.totalSessions ||
    (a.totalSessions === b.totalSessions && a.totalDriveTimeSec >= b.totalDriveTimeSec)
      ? a
      : b;
  const secondary = dominant === a ? b : a;

  const bestTtb =
    dominant.bestThrottleToBrakeMs !== null && secondary.bestThrottleToBrakeMs !== null
      ? Math.min(dominant.bestThrottleToBrakeMs, secondary.bestThrottleToBrakeMs)
      : dominant.bestThrottleToBrakeMs ?? secondary.bestThrottleToBrakeMs;

  return {
    ...dominant,
    bestThrottleToBrakeMs: bestTtb,
    peakLatG: Math.max(dominant.peakLatG, secondary.peakLatG),
    recentSessions: mergedSessions,
    updatedAt: Math.max(dominant.updatedAt, secondary.updatedAt),
  };
}

export function computeAnalyticsSummary(data: DriverAnalyticsData) {
  const avgTurnInAngleDeg =
    data.turnInAngleSamples > 0 ? data.turnInAngleSumDeg / data.turnInAngleSamples : 0;
  const avgThrottleToBrakeMs =
    data.throttleToBrakeCount > 0 ? data.throttleToBrakeSumMs / data.throttleToBrakeCount : null;
  const driftToGripEfficiencyPct =
    data.driftExitCount > 0 ? data.driftToGripEfficiencySumPct / data.driftExitCount : 0;
  const trailBrakingPct =
    data.totalCorners > 0 ? (data.trailBrakingCorners / data.totalCorners) * 100 : 0;
  const cleanDrivingPct =
    data.trackTimeSec > 0 ? (data.cleanTimeSec / data.trackTimeSec) * 100 : 100;

  return {
    avgTurnInAngleDeg,
    avgThrottleToBrakeMs,
    driftToGripEfficiencyPct,
    trailBrakingPct,
    cleanDrivingPct,
  };
}

export interface AnalyticsSessionAccumulator {
  session: DriverAnalyticsSession;
  turnInHistogram: [number, number, number, number, number];
  turnInAngleSumDeg: number;
  turnInAngleSamples: number;
  throttleToBrakeSumMs: number;
  throttleToBrakeCount: number;
  bestThrottleToBrakeMs: number | null;
  recentThrottleToBrakeMs: number[];
  driftExitCount: number;
  driftToGripEfficiencySumPct: number;
  trailBrakingCorners: number;
  cleanTimeSec: number;
  trackTimeSec: number;
}

export function recordSessionIntoAnalytics(
  prevRaw: DriverAnalyticsData,
  acc: AnalyticsSessionAccumulator,
): DriverAnalyticsData {
  const prev = normalizeDriverAnalytics(prevRaw);
  const nextHist: [number, number, number, number, number] = [
    prev.turnInHistogram[0] + acc.turnInHistogram[0],
    prev.turnInHistogram[1] + acc.turnInHistogram[1],
    prev.turnInHistogram[2] + acc.turnInHistogram[2],
    prev.turnInHistogram[3] + acc.turnInHistogram[3],
    prev.turnInHistogram[4] + acc.turnInHistogram[4],
  ];
  const bestTtb =
    prev.bestThrottleToBrakeMs !== null && acc.bestThrottleToBrakeMs !== null
      ? Math.min(prev.bestThrottleToBrakeMs, acc.bestThrottleToBrakeMs)
      : prev.bestThrottleToBrakeMs ?? acc.bestThrottleToBrakeMs;

  return {
    totalSessions: prev.totalSessions + 1,
    totalDriveTimeSec: Number((prev.totalDriveTimeSec + acc.session.durationSec).toFixed(1)),
    totalDistanceKm: Number((prev.totalDistanceKm + acc.session.distanceKm).toFixed(2)),
    totalCorners: prev.totalCorners + acc.session.cornersRecorded,
    turnInAngleSumDeg: Number((prev.turnInAngleSumDeg + acc.turnInAngleSumDeg).toFixed(1)),
    turnInAngleSamples: prev.turnInAngleSamples + acc.turnInAngleSamples,
    turnInHistogram: nextHist,
    throttleToBrakeSumMs: Math.round(prev.throttleToBrakeSumMs + acc.throttleToBrakeSumMs),
    throttleToBrakeCount: prev.throttleToBrakeCount + acc.throttleToBrakeCount,
    bestThrottleToBrakeMs: bestTtb,
    recentThrottleToBrakeMs: [...prev.recentThrottleToBrakeMs, ...acc.recentThrottleToBrakeMs].slice(-16),
    driftExitCount: prev.driftExitCount + acc.driftExitCount,
    driftToGripEfficiencySumPct: Number(
      (prev.driftToGripEfficiencySumPct + acc.driftToGripEfficiencySumPct).toFixed(1),
    ),
    trailBrakingCorners: prev.trailBrakingCorners + acc.trailBrakingCorners,
    peakLatG: Number(Math.max(prev.peakLatG, acc.session.peakLatG).toFixed(2)),
    cleanTimeSec: Number((prev.cleanTimeSec + acc.cleanTimeSec).toFixed(1)),
    trackTimeSec: Number((prev.trackTimeSec + acc.trackTimeSec).toFixed(1)),
    recentSessions: [acc.session, ...prev.recentSessions].slice(0, 12),
    updatedAt: Date.now(),
  };
}

export function loadDriverAnalyticsFromStorage(): DriverAnalyticsData {
  try {
    const raw = window.localStorage.getItem(DRIVER_ANALYTICS_STORAGE_KEY);
    if (!raw) return createEmptyDriverAnalytics();
    return normalizeDriverAnalytics(JSON.parse(raw));
  } catch {
    return createEmptyDriverAnalytics();
  }
}

export function saveDriverAnalyticsToStorage(data: DriverAnalyticsData): void {
  try {
    window.localStorage.setItem(DRIVER_ANALYTICS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

function getTurnInBin(angleDeg: number): 0 | 1 | 2 | 3 | 4 {
  if (angleDeg < 8) return 0;
  if (angleDeg < 16) return 1;
  if (angleDeg < 24) return 2;
  if (angleDeg < 34) return 3;
  return 4;
}

/**
 * Stateful real-time telemetry extractor that measures:
 * - Turn-In Angle at corner entry (initial steer/yaw alignment when committing into a bend)
 * - Throttle-to-Brake Transition Time (ms between releasing full/partial throttle and applying brake)
 * - Drift-to-Grip Efficiency (% speed/grip preservation on slide exit recovery without spinout)
 * - Trail-Braking share, Peak Lat G, Clean Track Discipline
 */
export class DriverAnalyticsTracker {
  private active = false;
  private mapId = 'aurelia_ridge';
  private mapName = 'Aurelia Ridge';
  private carId = '';
  private mode = 'time_trial';
  private startedAt = 0;
  private durationSec = 0;
  private distanceMeters = 0;
  private trackTimeSec = 0;
  private cleanTimeSec = 0;
  private peakLatG = 0;

  // Turn-in corner detector state
  private inCorner = false;
  private cornerCooldownSec = 0;
  private cornerEntrySteerDeg = 0;
  private cornerEntryRecorded = false;
  private cornerTrailBraking = false;
  private cornersRecorded = 0;
  private turnInAngleSumDeg = 0;
  private turnInAngleSamples = 0;
  private turnInHistogram: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  private trailBrakingCorners = 0;

  // Throttle -> Brake reaction timer
  private wasOnThrottle = false;
  private throttleLiftElapsedSec: number | null = null;
  private throttleToBrakeSumMs = 0;
  private throttleToBrakeCount = 0;
  private bestThrottleToBrakeMs: number | null = null;
  private recentThrottleToBrakeMs: number[] = [];

  // Drift -> Grip recovery detector
  private inDrift = false;
  private driftEntrySpeedMps = 0;
  private driftMinSpeedMps = 0;
  private driftPeakSlipDeg = 0;
  private driftDurationSec = 0;
  private driftWallHit = false;
  private driftExitCount = 0;
  private driftToGripEfficiencySumPct = 0;

  startSession(meta: { mapId: string; mapName: string; carId: string; mode: string }): void {
    this.active = true;
    this.mapId = meta.mapId;
    this.mapName = meta.mapName;
    this.carId = meta.carId;
    this.mode = meta.mode;
    this.startedAt = Date.now();
    this.durationSec = 0;
    this.distanceMeters = 0;
    this.trackTimeSec = 0;
    this.cleanTimeSec = 0;
    this.peakLatG = 0;

    this.inCorner = false;
    this.cornerCooldownSec = 0;
    this.cornerEntrySteerDeg = 0;
    this.cornerEntryRecorded = false;
    this.cornerTrailBraking = false;
    this.cornersRecorded = 0;
    this.turnInAngleSumDeg = 0;
    this.turnInAngleSamples = 0;
    this.turnInHistogram = [0, 0, 0, 0, 0];
    this.trailBrakingCorners = 0;

    this.wasOnThrottle = false;
    this.throttleLiftElapsedSec = null;
    this.throttleToBrakeSumMs = 0;
    this.throttleToBrakeCount = 0;
    this.bestThrottleToBrakeMs = null;
    this.recentThrottleToBrakeMs = [];

    this.inDrift = false;
    this.driftEntrySpeedMps = 0;
    this.driftMinSpeedMps = 0;
    this.driftPeakSlipDeg = 0;
    this.driftDurationSec = 0;
    this.driftWallHit = false;
    this.driftExitCount = 0;
    this.driftToGripEfficiencySumPct = 0;
  }

  ingest(deltaSec: number, physics: VehiclePhysicsEngine, tlm: VehicleTelemetry): void {
    if (!this.active || tlm.countdownSec > 0 || tlm.raceFinished) return;
    if (deltaSec <= 0 || deltaSec > 0.25) return;

    this.durationSec += deltaSec;
    this.distanceMeters += Math.max(0, tlm.speedMps) * deltaSec;
    this.trackTimeSec += deltaSec;
    if (tlm.surface !== 'offroad' && tlm.wallImpactImpulse < 0.12) {
      this.cleanTimeSec += deltaSec;
    }

    const absLatG = Math.abs(tlm.latG);
    if (absLatG > this.peakLatG && absLatG < 6.0) {
      this.peakLatG = absLatG;
    }

    // 1. Throttle-to-Brake Transition Time (ms)
    if (tlm.throttle > 0.35 && tlm.brake < 0.08 && tlm.speedKmh > 35) {
      this.wasOnThrottle = true;
      this.throttleLiftElapsedSec = null;
    } else if (this.wasOnThrottle && tlm.throttle <= 0.18 && tlm.brake < 0.15) {
      this.throttleLiftElapsedSec = (this.throttleLiftElapsedSec ?? 0) + deltaSec;
      if (this.throttleLiftElapsedSec > 0.95) {
        this.wasOnThrottle = false;
        this.throttleLiftElapsedSec = null;
      }
    } else if (this.wasOnThrottle && tlm.brake >= 0.22) {
      const transitionMs = Math.round(Math.max(25, (this.throttleLiftElapsedSec ?? deltaSec) * 1000));
      if (transitionMs >= 25 && transitionMs <= 950) {
        this.throttleToBrakeSumMs += transitionMs;
        this.throttleToBrakeCount += 1;
        this.bestThrottleToBrakeMs =
          this.bestThrottleToBrakeMs === null
            ? transitionMs
            : Math.min(this.bestThrottleToBrakeMs, transitionMs);
        this.recentThrottleToBrakeMs.push(transitionMs);
        if (this.recentThrottleToBrakeMs.length > 16) {
          this.recentThrottleToBrakeMs.shift();
        }
      }
      this.wasOnThrottle = false;
      this.throttleLiftElapsedSec = null;
    } else if (tlm.brake >= 0.22) {
      this.wasOnThrottle = false;
      this.throttleLiftElapsedSec = null;
    }

    // 2. Average Turn-In Angle & Trail-Braking Share
    if (this.cornerCooldownSec > 0) {
      this.cornerCooldownSec = Math.max(0, this.cornerCooldownSec - deltaSec);
    }
    const steerDeg = Math.abs(physics.steerAngle) * (180 / Math.PI);
    const speedKmh = tlm.speedKmh;
    const turning = speedKmh > 38 && (steerDeg >= 4.2 || absLatG >= 0.38);

    if (!this.inCorner && turning && this.cornerCooldownSec <= 0) {
      this.inCorner = true;
      this.cornerEntrySteerDeg = steerDeg;
      this.cornerEntryRecorded = false;
      this.cornerTrailBraking = tlm.brake > 0.18;
    } else if (this.inCorner) {
      if (tlm.brake > 0.16 && steerDeg > 4.5) {
        this.cornerTrailBraking = true;
      }
      if (!this.cornerEntryRecorded) {
        this.cornerEntrySteerDeg = Math.max(this.cornerEntrySteerDeg, steerDeg);
        if (absLatG >= 0.44 || steerDeg >= 7.5) {
          const sampledAngle = Math.min(48, Math.max(2, this.cornerEntrySteerDeg));
          this.cornersRecorded += 1;
          this.turnInAngleSumDeg += sampledAngle;
          this.turnInAngleSamples += 1;
          this.turnInHistogram[getTurnInBin(sampledAngle)] += 1;
          this.cornerEntryRecorded = true;
        }
      }
      if (speedKmh < 24 || (steerDeg < 2.2 && absLatG < 0.22)) {
        if (this.cornerEntryRecorded && this.cornerTrailBraking) {
          this.trailBrakingCorners += 1;
        }
        this.inCorner = false;
        this.cornerCooldownSec = 0.55;
      }
    }

    // 3. Drift-to-Grip Efficiency (% speed & traction preservation on drift recovery)
    const slipDeg = Math.max(
      Math.abs(tlm.driftAngleDeg || 0),
      Math.abs(tlm.diagnostics?.slipBodyDeg || 0),
    );
    const driftingNow = speedKmh > 34 && slipDeg >= 10.5;
    if (!this.inDrift && driftingNow) {
      this.inDrift = true;
      this.driftEntrySpeedMps = Math.max(10, tlm.speedMps);
      this.driftMinSpeedMps = tlm.speedMps;
      this.driftPeakSlipDeg = slipDeg;
      this.driftDurationSec = deltaSec;
      this.driftWallHit = tlm.wallImpactImpulse > 0.18;
    } else if (this.inDrift) {
      this.driftDurationSec += deltaSec;
      if (tlm.speedMps < this.driftMinSpeedMps) {
        this.driftMinSpeedMps = tlm.speedMps;
      }
      if (slipDeg > this.driftPeakSlipDeg) {
        this.driftPeakSlipDeg = slipDeg;
      }
      if (tlm.wallImpactImpulse > 0.18 || tlm.surface === 'offroad') {
        this.driftWallHit = true;
      }

      const settledToGrip = slipDeg < 6.5 && tlm.speedMps > 8.0;
      const spunOrStopped = tlm.speedMps <= 4.5 || slipDeg > 78;
      if (settledToGrip || spunOrStopped) {
        if (this.driftDurationSec >= 0.45) {
          let efficiencyPct: number;
          if (spunOrStopped) {
            efficiencyPct = 22;
          } else {
            const speedRetention = Math.min(1.08, tlm.speedMps / Math.max(10, this.driftEntrySpeedMps));
            const gripQuality = Math.max(0.4, (tlm.gripPct || 85) / 100);
            const cleanBonus = this.driftWallHit ? 0.65 : 1.0;
            const angleControl = this.driftPeakSlipDeg >= 12 && this.driftPeakSlipDeg <= 46 ? 1.03 : 0.9;
            efficiencyPct = Math.max(
              15,
              Math.min(100, speedRetention * 72 + gripQuality * 28) * cleanBonus * angleControl,
            );
          }
          this.driftExitCount += 1;
          this.driftToGripEfficiencySumPct += Math.min(100, efficiencyPct);
        }
        this.inDrift = false;
      }
    }
  }

  finalize(): AnalyticsSessionAccumulator | null {
    if (!this.active) return null;
    this.active = false;
    // Close any trailing corner sample cleanly
    if (this.inCorner && !this.cornerEntryRecorded && this.cornerEntrySteerDeg >= 4.2) {
      const sampledAngle = Math.min(48, Math.max(2, this.cornerEntrySteerDeg));
      this.cornersRecorded += 1;
      this.turnInAngleSumDeg += sampledAngle;
      this.turnInAngleSamples += 1;
      this.turnInHistogram[getTurnInBin(sampledAngle)] += 1;
      if (this.cornerTrailBraking) {
        this.trailBrakingCorners += 1;
      }
    }
    const distanceKm = Number((this.distanceMeters / 1000).toFixed(2));
    if (this.durationSec < 5 || (distanceKm < 0.08 && this.cornersRecorded === 0)) {
      return null;
    }

    const avgTurnInAngleDeg =
      this.turnInAngleSamples > 0 ? Number((this.turnInAngleSumDeg / this.turnInAngleSamples).toFixed(1)) : 0;
    const avgThrottleToBrakeMs =
      this.throttleToBrakeCount > 0
        ? Math.round(this.throttleToBrakeSumMs / this.throttleToBrakeCount)
        : null;
    const driftToGripEfficiencyPct =
      this.driftExitCount > 0
        ? Number((this.driftToGripEfficiencySumPct / this.driftExitCount).toFixed(1))
        : this.cornersRecorded > 0
          ? Number((82 * (this.cleanTimeSec / Math.max(1, this.trackTimeSec))).toFixed(1))
          : 0;
    const trailBrakingPct =
      this.cornersRecorded > 0
        ? Number(((this.trailBrakingCorners / this.cornersRecorded) * 100).toFixed(1))
        : 0;
    const cleanDrivingPct =
      this.trackTimeSec > 0
        ? Number(((this.cleanTimeSec / this.trackTimeSec) * 100).toFixed(1))
        : 100;

    // Ensure non-empty drift-to-grip credit for clean grip runs that stayed inside slip threshold
    const finalDriftExitCount = this.driftExitCount;
    const finalDriftSum = this.driftToGripEfficiencySumPct;

    return {
      session: {
        id: `sess_${this.startedAt}_${Math.random().toString(36).slice(2, 7)}`,
        mapId: this.mapId,
        mapName: this.mapName,
        carId: this.carId,
        mode: this.mode,
        recordedAt: this.startedAt || Date.now(),
        durationSec: Number(this.durationSec.toFixed(1)),
        distanceKm,
        cornersRecorded: this.cornersRecorded,
        avgTurnInAngleDeg,
        avgThrottleToBrakeMs,
        bestThrottleToBrakeMs: this.bestThrottleToBrakeMs,
        driftToGripEfficiencyPct,
        trailBrakingPct,
        peakLatG: Number(this.peakLatG.toFixed(2)),
        cleanDrivingPct,
      },
      turnInHistogram: this.turnInHistogram,
      turnInAngleSumDeg: this.turnInAngleSumDeg,
      turnInAngleSamples: this.turnInAngleSamples,
      throttleToBrakeSumMs: this.throttleToBrakeSumMs,
      throttleToBrakeCount: this.throttleToBrakeCount,
      bestThrottleToBrakeMs: this.bestThrottleToBrakeMs,
      recentThrottleToBrakeMs: this.recentThrottleToBrakeMs,
      driftExitCount: finalDriftExitCount,
      driftToGripEfficiencySumPct: finalDriftSum,
      trailBrakingCorners: this.trailBrakingCorners,
      cleanTimeSec: this.cleanTimeSec,
      trackTimeSec: this.trackTimeSec,
    };
  }
}
