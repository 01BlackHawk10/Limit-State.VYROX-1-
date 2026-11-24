import * as THREE from 'three';
import {
  createCircuitQueryScratch,
  getCircuitData,
  getCustomBlueprint,
  ROAD_HALF_WIDTH,
  SHOULDER_WIDTH,
  WATER_LEVEL,
} from './circuitSpline';
import { sampleTerrainStampsOffset } from '../../engine/customMapBuilder';
import { coralBayRawHeight } from '../Coral Bay/coralBayTerrainField';
import { frostpeakRawHeight } from '../Frostpeak Glacier/frostpeakTerrainField';
import { kestrelRawHeight } from '../Kestrel Peaks/kestrelTerrainField';
import {
  akagiRawHeight,
  akinaRawHeight,
  isTougeMapId,
  myogiRawHeight,
} from '../Touge/tougePassData';
import { clamp, fbm2D, lerp, ridgedNoise2D, smoothstep, smootherstep } from '../../engine/mathNoise';

export interface TerrainSample {
  height: number;
  distToRoad: number;
  isBridgeZone: boolean;
  waterDepth: number;
  slopeFactor: number;
}

/**
 * Computes natural Mediterranean-alpine mountain amphitheater & central gorge
 * aligned cleanly beneath the straight cable-stayed suspension bridge span.
 */
function rawMountainHeight(x: number, z: number): number {
  const macro = fbm2D(x * 0.0021, z * 0.0021, 5, 2.05, 0.5, 101);
  const detail = fbm2D(x * 0.0125, z * 0.0125, 3, 2.05, 0.48, 709) * 3.8;
  const micro = fbm2D(x * 0.042, z * 0.042, 2, 2.1, 0.45, 3191) * 0.95;
  const ridge = ridgedNoise2D(x * 0.0029, z * 0.0029, 4, 2.12, 0.52, 4099);

  const northSlope = smoothstep(280, -360, z) * 26.0;
  let h = 15.0 + northSlope + macro * 19.0 + ridge * 24.5 + detail + micro;

  const strataWave = Math.sin(h * 0.46 + macro * 2.2) * 0.55;
  const gullyNoise = Math.abs(fbm2D(x * 0.016, z * 0.016, 3, 2.0, 0.5, 6221));
  const gullyCut = (1 - smoothstep(0.0, 0.24, gullyNoise)) * smoothstep(24, 62, h) * 3.4;
  h += strataWave * smoothstep(22, 58, h) - gullyCut;

  const radial = Math.hypot(x * 0.9, z * 0.96);
  const rimFactor = smoothstep(350, 620, radial);
  const rimPeaks = ridgedNoise2D(x * 0.0034 + 2.4, z * 0.0034 - 1.7, 4, 2.1, 0.54, 8821);
  h += rimFactor * (48.0 + rimPeaks * 94.0);

  const dx = x - 75;
  const dz = z - 2;
  const cosA = 0.985;
  const sinA = 0.14;
  const lx = dx * cosA - dz * sinA;
  const lz = dx * sinA + dz * cosA;
  const gorgeDist = Math.hypot(lx / 138, lz / 82);
  const gorgeMask = 1 - smootherstep(0.32, 1.32, gorgeDist);
  h -= 35.0 * gorgeMask;

  const cliffBackDist = Math.hypot((x - 44) / 22, (z + 67) / 15);
  const cliffCrestBoost = (1 - smootherstep(0.25, 1.25, cliffBackDist)) * 11.5;
  h += cliffCrestBoost;

  const chuteDistX = Math.abs(x - 46 - (z + 48) * 0.1);
  const chuteMask = (1 - smoothstep(4.5, 16.0, chuteDistX)) * smoothstep(-66, -52, z) * (1 - smoothstep(-28, -14, z));
  const plungeMask = 1 - smootherstep(0.1, 1.0, Math.hypot((x - 48) / 14, (z + 25) / 12));
  h -= chuteMask * 9.5 + plungeMask * 5.2;

  return h;
}

let buildHeightCache: Map<number, number> | null = null;
let buildHeightCacheMapId: string | null = null;

export function beginTerrainHeightCache(): void {
  const mapId = getCircuitData().mapId;
  if (buildHeightCache && buildHeightCacheMapId === mapId) return;
  buildHeightCache = new Map<number, number>();
  buildHeightCacheMapId = mapId;
}

export function endTerrainHeightCache(): void {
  buildHeightCache = null;
  buildHeightCacheMapId = null;
}

/**
 * Final terrain elevation at world (x, z), mathematically graded around the
 * active circuit spline and smoothly carved beneath bridges/causeways.
 */
export function groundHeightAt(x: number, z: number): number {
  const circuit = getCircuitData();
  if (buildHeightCache && buildHeightCacheMapId === circuit.mapId) {
    const qx = Math.round(x * 8);
    const qz = Math.round(z * 8);
    const key = qx * 262144 + qz;
    const hit = buildHeightCache.get(key);
    if (hit !== undefined) {
      return hit;
    }
    const computed = computeGroundHeightUncached(x, z, circuit);
    if (buildHeightCache.size < 220000) {
      buildHeightCache.set(key, computed);
    }
    return computed;
  }
  return computeGroundHeightUncached(x, z, circuit);
}

const _groundQ = createCircuitQueryScratch();
const _anyQ = createCircuitQueryScratch();

function computeGroundHeightUncached(
  x: number,
  z: number,
  circuit: ReturnType<typeof getCircuitData>,
): number {
  const customBp = circuit.mapId === 'aurelia_ridge' ? getCustomBlueprint() : null;
  const isBaseplateStudio = Boolean(customBp && customBp.templateId !== 'aurelia_remix');
  const isCoral = circuit.mapId === 'coral_bay';
  const isFrost = circuit.mapId === 'frostpeak_pass';
  const isKestrel = circuit.mapId === 'kestrel_peaks';
  const isTouge = isTougeMapId(circuit.mapId);

  let baseH = isBaseplateStudio
    ? 20.0
    : isCoral
    ? coralBayRawHeight(x, z)
    : isFrost
    ? frostpeakRawHeight(x, z)
    : isKestrel
    ? kestrelRawHeight(x, z)
    : circuit.mapId === 'akina_pass'
    ? akinaRawHeight(x, z)
    : circuit.mapId === 'akagi_pass'
    ? akagiRawHeight(x, z)
    : circuit.mapId === 'myogi_pass'
    ? myogiRawHeight(x, z)
    : rawMountainHeight(x, z);

  if (customBp && customBp.terrainStamps.length > 0) {
    baseH = sampleTerrainStampsOffset(x, z, baseH, customBp.terrainStamps);
  }

  // Always grade ground against ground-level / tunnel roadbed so elevated overpasses (isBridge)
  // never pull the ground up and block an underpass tunnel!
  const query = circuit.queryNearestGroundTrackInto(x, z, _groundQ);
  const dist = query.absDistance;

  const roadHalf = circuit.roadHalfWidth;
  const isTunnelZone = query.sample.isTunnel || query.nextSample.isTunnel;
  const blendOuter =
    roadHalf +
    SHOULDER_WIDTH +
    (isBaseplateStudio ? 16.0 : isCoral ? 20.0 : isKestrel ? 26.0 : isTouge ? 22.0 : isTunnelZone ? 20.0 : 24.0);

  const pitBounds = circuit.pitLaneBounds;
  const pitFrame = pitBounds.frame;
  let padBlendMask = 0;
  const padTargetY = pitBounds.y - 0.08;

  if (!isBaseplateStudio && !isTouge && pitFrame) {
    const dx = x - pitFrame.centerX;
    const dz = z - pitFrame.centerZ;
    const along = dx * pitFrame.tanX + dz * pitFrame.tanZ;
    const across = dx * pitFrame.rightX + dz * pitFrame.rightZ;

    // 1. Engineered Pit-Lane & 6-Bay Paddock Garage terrace
    const pitAlongLim = pitFrame.halfLength + 12;
    const pitAcrossMin = -(pitFrame.halfWidth + 24);
    const pitAcrossMax = pitFrame.halfWidth + 5;
    if (Math.abs(along) < pitAlongLim && across > pitAcrossMin && across < pitAcrossMax) {
      const aFade =
        smoothstep(-pitAlongLim, -pitAlongLim + 18, along) *
        (1 - smoothstep(pitAlongLim - 18, pitAlongLim, along));
      const cFade =
        smoothstep(pitAcrossMin, pitAcrossMin + 10, across) *
        (1 - smoothstep(pitAcrossMax - 6, pitAcrossMax, across));
      padBlendMask = Math.max(padBlendMask, aFade * cFade);
    }

    // 2. Opposite Main Grandstand + Broadcast Jumbotron flat terrace across Pit Straight
    const gsAlongMin = -78;
    const gsAlongMax = 68;
    const gsAcrossMin = pitFrame.halfWidth + 16;
    const gsAcrossMax = pitFrame.halfWidth + 58;
    if (along > gsAlongMin && along < gsAlongMax && across > gsAcrossMin && across < gsAcrossMax) {
      const aFade =
        smoothstep(gsAlongMin, gsAlongMin + 16, along) *
        (1 - smoothstep(gsAlongMax - 16, gsAlongMax, along));
      const cFade =
        smoothstep(gsAcrossMin, gsAcrossMin + 8, across) *
        (1 - smoothstep(gsAcrossMax - 12, gsAcrossMax, across));
      padBlendMask = Math.max(padBlendMask, aFade * cFade);
    }
  } else if (!isBaseplateStudio && !isTouge) {
    // Aurelia Ridge Pit Straight (z = 240, y = 20.0): Pit Shelf (north) & Opposite Grandstand (south)
    const pitMinX = pitBounds.minX - 8;
    const pitMaxX = pitBounds.maxX + 8;
    const pitMinZ = pitBounds.minZ - 14;
    const pitMaxZ = pitBounds.maxZ + 8;
    if (x > pitMinX && x < pitMaxX && z > pitMinZ && z < pitMaxZ) {
      const xFade = smoothstep(pitMinX, pitMinX + 20, x) * (1 - smoothstep(pitMaxX - 20, pitMaxX, x));
      const zFade = smoothstep(pitMinZ, pitMinZ + 11, z) * (1 - smoothstep(pitMaxZ - 5, pitMaxZ, z));
      padBlendMask = Math.max(padBlendMask, xFade * zFade);
    }

    const gsMinX = -88;
    const gsMaxX = 72;
    const gsMinZ = 254;
    const gsMaxZ = 304;
    if (x > gsMinX && x < gsMaxX && z > gsMinZ && z < gsMaxZ) {
      const xFade = smoothstep(gsMinX, gsMinX + 16, x) * (1 - smoothstep(gsMaxX - 16, gsMaxX, x));
      const zFade = smoothstep(gsMinZ, gsMinZ + 8, z) * (1 - smoothstep(gsMaxZ - 12, gsMaxZ, z));
      padBlendMask = Math.max(padBlendMask, xFade * zFade);
    }
  }

  const applyBridgeClearance = (h: number): number => {
    const anyQuery = circuit.queryNearestInto(x, z, _anyQ);
    const isUnderpassRoad =
      dist <= roadHalf + SHOULDER_WIDTH + (isTunnelZone ? 8.0 : 2.5) &&
      query.centerPos.y < anyQuery.centerPos.y - 2.6;
    if (!anyQuery.isBridge || anyQuery.absDistance >= roadHalf + 24.0 || isUnderpassRoad) {
      return h;
    }
    const [bStart, bEnd] = circuit.bridgeRange;
    const inPrimaryBridgeRange =
      bStart <= bEnd
        ? anyQuery.t >= bStart - 0.015 && anyQuery.t <= bEnd + 0.015
        : anyQuery.t >= bStart - 0.015 || anyQuery.t <= bEnd + 0.015;
    let abutmentRamp = 1.0;
    if (inPrimaryBridgeRange) {
      const spanLen = (bEnd - bStart + 1) % 1 || 1;
      const fromStart = ((anyQuery.t - bStart + 1) % 1) / spanLen;
      const edgeDistT = Math.min(fromStart, 1 - fromStart);
      abutmentRamp = smootherstep(0.0, 0.14, edgeDistT);
    }

    const sinkForBridge = isKestrel
      ? 0.68
      : isBaseplateStudio
      ? 0.22
      : isCoral || isFrost
      ? 0.28
      : 0.58;
    const bridgeElevation =
      anyQuery.centerPos.y +
      anyQuery.right.y * clamp(anyQuery.signedLateral, -roadHalf - 2, roadHalf + 2);
    const targetRoadBed = bridgeElevation - sinkForBridge;
    const channelUnder = Math.min(
      h,
      bridgeElevation - (isCoral ? 11.5 : isFrost ? 15.5 : isKestrel ? 24.0 : 12.0),
    );
    const targetBridgeUnder = lerp(targetRoadBed, channelUnder, abutmentRamp);
    const lateralClear = 1 - smoothstep(roadHalf + SHOULDER_WIDTH, roadHalf + 24.0, anyQuery.absDistance);
    return Math.min(h, lerp(h, targetBridgeUnder, lateralClear));
  };

  if (dist >= blendOuter) {
    const hOut = padBlendMask > 0.001 ? lerp(baseH, padTargetY, padBlendMask) : baseH;
    return applyBridgeClearance(hOut);
  }

  const latBound = roadHalf + SHOULDER_WIDTH + 0.5;
  let roadElevation =
    query.centerPos.y +
    query.right.y * clamp(query.signedLateral, -latBound, latBound);

  const flatZone =
    roadHalf +
    SHOULDER_WIDTH +
    (isKestrel ? 8.5 : isTouge ? 4.0 : isBaseplateStudio ? 2.4 : isCoral || isFrost ? 3.8 : 6.5);
  const roadBedSink = isKestrel ? 0.68 : isTouge ? 0.25 : isBaseplateStudio ? 0.22 : isCoral || isFrost ? 0.28 : 0.58;

  if (dist <= flatZone) {
    const samples = circuit.samples;
    const nSamples = samples.length;
    const baseIdx = query.sample.index;
    const stepCheckMax = roadHalf + SHOULDER_WIDTH + 4.5;
    for (let off = -14; off <= 14; off++) {
      if (off === 0) continue;
      let j = baseIdx + off;
      if (circuit.closedLoop) {
        j = ((j % nSamples) + nSamples) % nSamples;
      } else if (j < 0 || j >= nSamples) {
        continue;
      }
      const sj = samples[j];
      if (sj.isBridge) continue;
      const dxJ = x - sj.position.x;
      const dzJ = z - sj.position.z;
      const dSq = dxJ * dxJ + dzJ * dzJ;
      if (dSq > stepCheckMax * stepCheckMax + 81) continue;
      const alongJ = dxJ * sj.tangent.x + dzJ * sj.tangent.z;
      if (Math.abs(alongJ) > 9.5) continue;
      const latJ = dxJ * sj.right.x + dzJ * sj.right.z;
      if (Math.abs(latJ) <= stepCheckMax) {
        const candElev = sj.position.y + sj.right.y * clamp(latJ, -latBound, latBound);
        if (candElev < roadElevation) {
          roadElevation = candElev;
        }
      }
    }
  }

  const targetRoadBed = roadElevation - roadBedSink;

  if (dist <= flatZone) {
    const clampedPadY = Math.min(padTargetY, targetRoadBed);
    const hFlat = padBlendMask > 0.001 ? lerp(targetRoadBed, clampedPadY, padBlendMask) : targetRoadBed;
    return applyBridgeClearance(hFlat);
  }

  const blend = smootherstep(flatZone, blendOuter, dist);
  const distPastFlat = dist - flatZone;
  const clampedBaseH =
    isKestrel || (!isCoral && !isFrost && !isBaseplateStudio)
      ? clamp(
          baseH,
          targetRoadBed - distPastFlat * (isKestrel ? 2.4 : 2.8),
          targetRoadBed + distPastFlat * (isKestrel ? 0.95 : 1.15),
        )
      : baseH;
  const trackGradedH = lerp(targetRoadBed, clampedBaseH, blend);
  const hGraded = padBlendMask > 0.001 ? lerp(trackGradedH, padTargetY, padBlendMask) : trackGradedH;
  return applyBridgeClearance(hGraded);
}

export function groundNormalAtInto(
  x: number,
  z: number,
  step = 1.0,
  out: THREE.Vector3,
): THREE.Vector3 {
  const hL = groundHeightAt(x - step, z);
  const hR = groundHeightAt(x + step, z);
  const hD = groundHeightAt(x, z - step);
  const hU = groundHeightAt(x, z + step);
  return out.set(hL - hR, 2 * step, hD - hU).normalize();
}

export function groundNormalAt(x: number, z: number, step = 1.0): THREE.Vector3 {
  return groundNormalAtInto(x, z, step, new THREE.Vector3());
}

export function sampleTerrainFull(x: number, z: number): TerrainSample {
  const circuit = getCircuitData();
  const q = circuit.queryNearest(x, z);
  const height = groundHeightAt(x, z);
  const normal = groundNormalAt(x, z, 1.5);
  return {
    height,
    distToRoad: q.absDistance,
    isBridgeZone: q.isBridge,
    waterDepth: Math.max(0, circuit.waterLevel - height),
    slopeFactor: 1 - clamp(normal.y, 0, 1),
  };
}

