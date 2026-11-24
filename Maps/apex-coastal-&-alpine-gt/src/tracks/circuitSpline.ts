import * as THREE from 'three';
import { clamp } from './terrainField';
import type {
  LayoutPresetId,
  MapDefinition,
  MapId,
  TrackSample,
  TrackSplineData,
} from './types';

export const SPLINE_SAMPLE_COUNT = 2600;

/**
 * 18 Catmull-Rom control points for Coral Bay Coastal GT (coral_bay).
 * Locked pit/straight + causeway indices: [0, 1, 2, 8, 9, 10]
 * 9 Editable Waypoints map to:
 *   3: T1 Palm Sweeper
 *   4: T2 Headland Lighthouse
 *   5: T3 Reef Point
 *   6: T4 Inner Lagoon Apex
 *   11: T5 NE Spit Hairpin
 *   12: T7 Caldera Cliff
 *   13: T8 Volcanic Overlook
 *   14: T10 Cove Waterfall
 *   16: T12 Marina Curve
 */
export const CORAL_BAY_CONTROL_POINTS: readonly [number, number, number][] = [
  [-165, 6.5, 192], // 0: Harborfront Straight West (locked)
  [-20, 6.5, 192], // 1: Harborfront Start/Finish (locked)
  [125, 6.5, 192], // 2: Harborfront Straight East (locked)
  [275, 8.8, 228], // 3: T1 Palm Sweeper
  [372, 15.0, 92], // 4: T2 Headland Lighthouse
  [372, 15.6, -62], // 5: T3 Reef Point
  [292, 10.6, -188], // 6: T4 Inner Lagoon Apex
  [196, 7.6, -242], // 7: Causeway East Approach
  [138, 7.6, -245], // 8: Causeway Bridge East (locked)
  [85, 7.8, -245], // 9: Causeway Bridge Hub (locked)
  [32, 7.6, -245], // 10: Causeway Bridge West (locked)
  [-72, 11.8, -328], // 11: T5 NE Spit Hairpin
  [-228, 22.0, -308], // 12: T7 Caldera Cliff
  [-342, 29.5, -162], // 13: T8 Volcanic Overlook
  [-126, 18.8, -162], // 14: T10 Cove Waterfall
  [-318, 11.4, -14], // 15: West Jungle Ridge
  [-202, 7.2, 88], // 16: T12 Marina Curve
  [-292, 6.8, 168], // 17: Marina Hairpin Return
];

/**
 * 17 Catmull-Rom control points for Frostpeak Glacier GT (frostpeak_pass).
 * Locked ridge straight + arch bridge indices: [0, 1, 2, 9, 10, 11]
 * 9 Editable Waypoints map to:
 *   3: T1 Glacier Crest
 *   4: T2 Avalanche Chute
 *   5: T3 Iceberg Corner
 *   6: T4 Chalet Curve
 *   7: T5 Frozen Lake Approach
 *   12: T6 Timberline Sweeper
 *   13: T7 Fjord Hairpin
 *   14: T9 Alpine Chicane
 *   15: T11 Summit Switchback
 */
export const FROSTPEAK_CONTROL_POINTS: readonly [number, number, number][] = [
  [130, 42.0, -202], // 0: North Ridge Straight East (locked)
  [-15, 42.0, -202], // 1: North Ridge Start/Finish (locked)
  [-160, 42.0, -202], // 2: North Ridge Straight West (locked)
  [-335, 46.5, -195], // 3: T1 Glacier Crest
  [-385, 38.0, -35], // 4: T2 Avalanche Chute
  [-260, 29.5, 48], // 5: T3 Iceberg Corner
  [-345, 23.5, 185], // 6: T4 Chalet Curve
  [-165, 20.5, 255], // 7: T5 Frozen Lake Approach
  [-45, 20.0, 198], // 8: Lake Bridge West Approach
  [12, 20.6, 185], // 9: Arch Bridge West (locked)
  [55, 21.0, 185], // 10: Arch Bridge Hub (locked)
  [98, 20.6, 185], // 11: Arch Bridge East (locked)
  [245, 19.5, 225], // 12: T6 Timberline Sweeper
  [385, 26.0, 115], // 13: T7 Fjord Hairpin
  [225, 31.0, 12], // 14: T9 Alpine Chicane
  [385, 39.0, -125], // 15: T11 Summit Switchback
  [292, 48.0, -224], // 16: Summit Crest Return
];

export function getBaseControlPoints(mapId: MapId): [number, number, number][] {
  const src = mapId === 'coral_bay' ? CORAL_BAY_CONTROL_POINTS : FROSTPEAK_CONTROL_POINTS;
  return src.map(([x, y, z]) => [x, y, z]);
}

export function applyLayoutPreset(
  mapDef: MapDefinition,
  preset: LayoutPresetId
): [number, number, number][] {
  const pts = getBaseControlPoints(mapDef.id);
  if (preset === 'original') return pts;

  const locked = new Set(mapDef.lockedControlIndices);
  return pts.map(([x, y, z], idx) => {
    if (locked.has(idx)) return [x, y, z];

    const angle = Math.atan2(z, x);
    const radius = Math.hypot(x, z);
    let radialScale = 1;
    let lateralShift = 0;
    let yShift = 0;

    if (preset === 'technical_chicanes') {
      const alt = idx % 2 === 0 ? 1 : -1;
      radialScale = 1 + alt * 0.085;
      lateralShift = alt * 18;
      yShift = alt * 1.4;
    } else if (preset === 'high_speed') {
      radialScale = 1.07;
      lateralShift = 0;
      yShift = -0.8;
    } else if (preset === 'drift_canyon') {
      const wave = Math.sin(idx * 1.45);
      radialScale = 0.96 + wave * 0.08;
      lateralShift = wave * 24;
      yShift = wave * 1.8;
    }

    const rNew = radius * radialScale;
    const nx = Math.cos(angle) * rNew - Math.sin(angle) * lateralShift;
    const nz = Math.sin(angle) * rNew + Math.cos(angle) * lateralShift;
    const ny = Math.max(mapDef.minSplineY, y + yShift);
    return [nx, ny, nz];
  });
}

export function buildTrackSplineData(
  mapDef: MapDefinition,
  controlPoints: [number, number, number][],
  sampleCount = SPLINE_SAMPLE_COUNT
): TrackSplineData {
  const clampedPts: [number, number, number][] = controlPoints.map(([x, y, z]) => [
    x,
    Math.max(mapDef.minSplineY, y),
    z,
  ]);

  const vectors = clampedPts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(vectors, true, 'catmullrom', 0.45);

  const rawPoints = curve.getSpacedPoints(sampleCount);
  // getSpacedPoints(N) returns N+1 points for closed curves where last === first
  const count = sampleCount;
  const samples: TrackSample[] = new Array(count);

  // Locate closest sample to bridgeHub
  let bridgeCenterIdx = 0;
  let bestBridgeDist = Infinity;
  for (let i = 0; i < count; i++) {
    const p = rawPoints[i];
    const d = Math.hypot(p.x - mapDef.bridgeHub.x, p.z - mapDef.bridgeHub.z);
    if (d < bestBridgeDist) {
      bestBridgeDist = d;
      bridgeCenterIdx = i;
    }
  }

  let totalLength = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  const { pitFrame, sectors } = mapDef;

  for (let i = 0; i < count; i++) {
    const prev = rawPoints[(i - 1 + count) % count];
    const curr = rawPoints[i];
    const next = rawPoints[(i + 1) % count];

    if (i > 0) {
      totalLength += curr.distanceTo(rawPoints[i - 1]);
    }

    const clampedY = Math.max(mapDef.minSplineY, curr.y);
    if (clampedY < minY) minY = clampedY;
    if (clampedY > maxY) maxY = clampedY;

    const tx = next.x - prev.x;
    const ty = Math.max(mapDef.minSplineY, next.y) - Math.max(mapDef.minSplineY, prev.y);
    const tz = next.z - prev.z;
    const tLen = Math.hypot(tx, ty, tz) || 1;
    const tangentX = tx / tLen;
    const tangentY = ty / tLen;
    const tangentZ = tz / tLen;

    // Horizontal right vector: normalize(cross(tangent, up)) = (-tangentZ, tangentX) in XZ?
    // Check: (1, 0, 0) x (0, 1, 0) = (0, 0, 1) -> rightX = -tangentZ = 0, rightZ = tangentX = 1.
    // Check: (-1, 0, 0) x (0, 1, 0) = (0, 0, -1) -> rightX = 0, rightZ = -1. Exact match!
    const hLen = Math.hypot(tangentX, tangentZ) || 1;
    const rightX = -tangentZ / hLen;
    const rightZ = tangentX / hLen;

    // Signed curvature estimate
    const v1x = curr.x - prev.x;
    const v1z = curr.z - prev.z;
    const v2x = next.x - curr.x;
    const v2z = next.z - curr.z;
    const cross = v1x * v2z - v1z * v2x;
    const segLen = (Math.hypot(v1x, v1z) + Math.hypot(v2x, v2z)) * 0.5 || 1;
    const curvature = clamp(cross / (segLen * segLen), -0.1, 0.1);

    // Wrapped sample distance to bridge hub
    let idxDist = Math.abs(i - bridgeCenterIdx);
    if (idxDist > count / 2) idxDist = count - idxDist;
    const isBridge = idxDist <= mapDef.bridgeHalfSamples;

    // Check if this sample lies parallel to the pit lane for clean pit-entry/exit guardrail gap
    const dxPit = curr.x - pitFrame.centerX;
    const dzPit = curr.z - pitFrame.centerZ;
    const alongPit = dxPit * pitFrame.tangentX + dzPit * pitFrame.tangentZ;
    const acrossPit = dxPit * pitFrame.rightX + dzPit * pitFrame.rightZ;
    const hasRightPitGap =
      Math.abs(alongPit) <= pitFrame.halfLength + 12 &&
      acrossPit < 0 &&
      Math.abs(acrossPit) <= 44 &&
      Math.abs(clampedY - pitFrame.y) <= pitFrame.toleranceY;

    const t = i / count;
    let sectorIndex: 0 | 1 | 2 = 0;
    if (t >= sectors[2].startT) sectorIndex = 2;
    else if (t >= sectors[1].startT) sectorIndex = 1;

    samples[i] = {
      index: i,
      t,
      distance: totalLength,
      x: curr.x,
      y: clampedY,
      z: curr.z,
      tangentX,
      tangentY,
      tangentZ,
      rightX,
      rightZ,
      curvature,
      isBridge,
      hasRightPitGap,
      sectorIndex,
    };
  }

  // Close loop total length
  totalLength += rawPoints[0].distanceTo(rawPoints[count - 1]);

  return {
    controlPoints: clampedPts,
    samples,
    totalLength,
    minY,
    maxY,
    elevationDelta: maxY - minY,
  };
}

/** Find nearest track sample to world (x, z) */
export function findNearestTrackSample(
  samples: TrackSample[],
  x: number,
  z: number,
  hintIndex?: number
): { sample: TrackSample; distSq: number; lateralOffset: number } {
  const n = samples.length;
  let bestIdx = 0;
  let bestDistSq = Infinity;

  if (hintIndex !== undefined && hintIndex >= 0 && hintIndex < n) {
    const window = 65;
    for (let k = -window; k <= window; k++) {
      const idx = (hintIndex + k + n) % n;
      const s = samples[idx];
      const dx = x - s.x;
      const dz = z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = idx;
      }
    }
    // If vehicle moved far from hint, fall back to full scan
    if (bestDistSq > 45 * 45) {
      bestDistSq = Infinity;
      for (let i = 0; i < n; i++) {
        const s = samples[i];
        const dx = x - s.x;
        const dz = z - s.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          bestIdx = i;
        }
      }
    }
  } else {
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const dx = x - s.x;
      const dz = z - s.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDistSq) {
        bestDistSq = d2;
        bestIdx = i;
      }
    }
  }

  const sample = samples[bestIdx];
  const lateralOffset = (x - sample.x) * sample.rightX + (z - sample.z) * sample.rightZ;
  return { sample, distSq: bestDistSq, lateralOffset };
}
