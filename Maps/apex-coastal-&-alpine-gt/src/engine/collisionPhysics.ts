import { findNearestTrackSample } from '../tracks/circuitSpline';
import { clamp, lerp } from '../tracks/terrainField';
import type {
  ColliderRegistry,
  MapDefinition,
  TerrainField,
  TrackSample,
} from '../tracks/types';

export interface CarState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  heading: number; // radians, 0 = +X, PI/2 = +Z? Let's use sin/cos: dir = (cos(heading), sin(heading)) in XZ!
  steerAngle: number;
  speed: number; // signed forward speed m/s
  rpm: number;
  gear: number;
  wheelSpin: number;
  nearestSampleIdx: number;
  onRoad: boolean;
  inPitLane: boolean;
  currentLap: number;
  lapTime: number;
  bestLapTime: number | null;
  lastSector: 0 | 1 | 2;
  sectorProgressMask: number; // bitmask of sectors visited in current lap
  crowdExcitement: number;
  collisionShock: number;
}

export interface CarInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. +1 (right)
  handbrake: boolean;
}

export function createInitialCarState(
  mapDef: MapDefinition,
  samples: TrackSample[]
): CarState {
  // Spawn right behind start/finish line on the main straight facing forward tangent
  const s0 = samples[Math.floor(samples.length * 0.015)] ?? samples[0];
  const heading = Math.atan2(s0.tangentZ, s0.tangentX);
  return {
    x: s0.x,
    y: s0.y + 0.08,
    z: s0.z,
    vx: 0,
    vz: 0,
    heading,
    steerAngle: 0,
    speed: 0,
    rpm: 1200,
    gear: 1,
    wheelSpin: 0,
    nearestSampleIdx: s0.index,
    onRoad: true,
    inPitLane: false,
    currentLap: 1,
    lapTime: 0,
    bestLapTime: null,
    lastSector: s0.sectorIndex,
    sectorProgressMask: 1,
    crowdExcitement: 0.25,
    collisionShock: 0,
  };
}

/** Resolve 2D circle vs OBB collision, returning pushout dx, dz and normal */
export function resolveCircleObb(
  px: number,
  pz: number,
  py: number,
  radius: number,
  obb: {
    centerX: number;
    centerZ: number;
    halfW: number;
    halfD: number;
    axisX: number;
    axisZ: number;
    minY: number;
    maxY: number;
  }
): { hit: boolean; pushX: number; pushZ: number; nx: number; nz: number } {
  if (py + 1.4 < obb.minY || py > obb.maxY + 0.4) {
    return { hit: false, pushX: 0, pushZ: 0, nx: 0, nz: 0 };
  }
  const dx = px - obb.centerX;
  const dz = pz - obb.centerZ;
  // Local OBB axes: U = (axisX, axisZ), V = (-axisZ, axisX)
  const localU = dx * obb.axisX + dz * obb.axisZ;
  const localV = dx * -obb.axisZ + dz * obb.axisX;

  const clampedU = clamp(localU, -obb.halfW, obb.halfW);
  const clampedV = clamp(localV, -obb.halfD, obb.halfD);

  const diffU = localU - clampedU;
  const diffV = localV - clampedV;
  const distSq = diffU * diffU + diffV * diffV;

  if (distSq >= radius * radius) {
    return { hit: false, pushX: 0, pushZ: 0, nx: 0, nz: 0 };
  }

  let pushU = 0;
  let pushV = 0;
  if (distSq > 1e-6) {
    const d = Math.sqrt(distSq);
    const pen = radius - d;
    pushU = (diffU / d) * pen;
    pushV = (diffV / d) * pen;
  } else {
    // Center inside OBB: push out along nearest face
    const penU = obb.halfW - Math.abs(localU) + radius;
    const penV = obb.halfD - Math.abs(localV) + radius;
    if (penU < penV) {
      pushU = (localU >= 0 ? 1 : -1) * penU;
    } else {
      pushV = (localV >= 0 ? 1 : -1) * penV;
    }
  }

  const pushX = pushU * obb.axisX - pushV * obb.axisZ;
  const pushZ = pushU * obb.axisZ + pushV * obb.axisX;
  const pLen = Math.hypot(pushX, pushZ) || 1;
  return {
    hit: true,
    pushX,
    pushZ,
    nx: pushX / pLen,
    nz: pushZ / pLen,
  };
}

/** Closest point on segment AB in XZ */
export function resolveCircleSegment(
  px: number,
  pz: number,
  py: number,
  radius: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  segY: number,
  segRadius: number
): { hit: boolean; pushX: number; pushZ: number; nx: number; nz: number } {
  if (Math.abs(py - segY) > 3.2) {
    return { hit: false, pushX: 0, pushZ: 0, nx: 0, nz: 0 };
  }
  const abx = bx - ax;
  const abz = bz - az;
  const abLenSq = abx * abx + abz * abz || 1e-6;
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / abLenSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  const minD = radius + segRadius;
  const distSq = dx * dx + dz * dz;
  if (distSq >= minD * minD || distSq < 1e-9) {
    return { hit: false, pushX: 0, pushZ: 0, nx: 0, nz: 0 };
  }
  const dist = Math.sqrt(distSq);
  const pen = minD - dist;
  const nx = dx / dist;
  const nz = dz / dist;
  return { hit: true, pushX: nx * pen, pushZ: nz * pen, nx, nz };
}

export function resolveCarCollisions(
  car: CarState,
  registry: ColliderRegistry,
  carRadius = 1.45
): number {
  let maxImpact = 0;

  // 1. OBB colliders (buildings, pit wall, lighthouse, ski lodge)
  for (let i = 0; i < registry.obbs.length; i++) {
    const res = resolveCircleObb(car.x, car.z, car.y, carRadius, registry.obbs[i]);
    if (res.hit) {
      car.x += res.pushX;
      car.z += res.pushZ;
      const vn = car.vx * res.nx + car.vz * res.nz;
      if (vn < 0) {
        maxImpact = Math.max(maxImpact, -vn);
        car.vx -= 1.32 * vn * res.nx;
        car.vz -= 1.32 * vn * res.nz;
        car.vx *= 0.88;
        car.vz *= 0.88;
      }
    }
  }

  // 2. Radial colliders (wood trunks, boulders, sea arch pillars, ice seracs)
  for (let i = 0; i < registry.circles.length; i++) {
    const c = registry.circles[i];
    if (car.y + 1.5 < c.minY || car.y > c.maxY + 0.5) continue;
    const dx = car.x - c.x;
    const dz = car.z - c.z;
    const minD = carRadius + c.radius;
    const distSq = dx * dx + dz * dz;
    if (distSq < minD * minD && distSq > 1e-8) {
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const nz = dz / dist;
      const pen = minD - dist;
      car.x += nx * pen;
      car.z += nz * pen;
      const vn = car.vx * nx + car.vz * nz;
      if (vn < 0) {
        maxImpact = Math.max(maxImpact, -vn);
        car.vx -= 1.38 * vn * nx;
        car.vz -= 1.38 * vn * nz;
        car.vx *= 0.85;
        car.vz *= 0.85;
      }
    }
  }

  // 3. Spline guardrail / bridge wall colliders
  for (let i = 0; i < registry.walls.length; i++) {
    const w = registry.walls[i];
    const res = resolveCircleSegment(
      car.x,
      car.z,
      car.y,
      carRadius,
      w.ax,
      w.az,
      w.bx,
      w.bz,
      w.y,
      w.radius
    );
    if (res.hit) {
      car.x += res.pushX;
      car.z += res.pushZ;
      const vn = car.vx * res.nx + car.vz * res.nz;
      if (vn < 0) {
        maxImpact = Math.max(maxImpact, -vn);
        // Elastic barrier scrape with low friction bounce
        car.vx -= 1.25 * vn * res.nx;
        car.vz -= 1.25 * vn * res.nz;
        car.vx *= 0.94;
        car.vz *= 0.94;
      }
    }
  }

  return maxImpact;
}

/** Sample road deck height with crown camber if on road, else terrain height */
export function sampleDriveSurfaceHeight(
  x: number,
  z: number,
  nearest: { sample: TrackSample; distSq: number; lateralOffset: number },
  mapDef: MapDefinition,
  terrain: TerrainField
): { surfaceY: number; onRoad: boolean; inPit: boolean } {
  const { sample, lateralOffset } = nearest;
  const distToRoad = Math.sqrt(nearest.distSq);

  // Check pit apron frame
  const pf = mapDef.pitFrame;
  const dxp = x - pf.centerX;
  const dzp = z - pf.centerZ;
  const alongPit = Math.abs(dxp * pf.tangentX + dzp * pf.tangentZ);
  const acrossPit = Math.abs(dxp * pf.rightX + dzp * pf.rightZ);
  const inPit = alongPit <= pf.halfLength && acrossPit <= pf.halfWidth;

  if (inPit) {
    return { surfaceY: pf.y + 0.04, onRoad: true, inPit: true };
  }

  if (distToRoad <= mapDef.roadHalfWidth + 1.1) {
    const normLat = clamp(Math.abs(lateralOffset) / mapDef.roadHalfWidth, 0, 1);
    const crownLift = (1 - normLat * normLat) * 0.055;
    return { surfaceY: sample.y + crownLift, onRoad: true, inPit: false };
  }

  const terrY = terrain.getHeight(x, z);
  return {
    surfaceY: Math.max(terrY, mapDef.waterLevel + 0.05),
    onRoad: false,
    inPit: false,
  };
}

export function stepCarPhysics(
  car: CarState,
  input: CarInput,
  dt: number,
  mapDef: MapDefinition,
  samples: TrackSample[],
  terrain: TerrainField,
  registry: ColliderRegistry,
  wetness: number,
  snowAccum: number
): void {
  const clampedDt = Math.min(dt, 0.05);
  car.lapTime += clampedDt;

  const forwardX = Math.cos(car.heading);
  const forwardZ = Math.sin(car.heading);
  const rightX = -forwardZ;
  const rightZ = forwardX;

  const forwardSpeed = car.vx * forwardX + car.vz * forwardZ;
  const lateralSpeed = car.vx * rightX + car.vz * rightZ;

  // Surface grip modifiers (wetness & snow reduce lateral grip slightly)
  const surfacePenalty =
    (car.onRoad ? 1.0 : 0.72) *
    (1 - wetness * 0.16) *
    (1 - (mapDef.id === 'frostpeak_pass' ? snowAccum * 0.14 : 0));

  // Steering (left = negative steer input -> counter-clockwise -> decreases heading in XZ where +X=0, +Z=PI/2)
  const targetSteer = input.steer * 0.56;
  car.steerAngle = lerp(car.steerAngle, targetSteer, 1 - Math.exp(-10 * clampedDt));

  const speedFactor = clamp(Math.abs(forwardSpeed) / 14, 0, 1);
  const turnSign = forwardSpeed >= -0.5 ? 1 : -1;
  const yawRate =
    car.steerAngle *
    2.45 *
    speedFactor *
    turnSign *
    (input.handbrake ? 1.38 : 1.0) *
    lerp(0.75, 1.0, surfacePenalty);
  car.heading += yawRate * clampedDt;

  // Acceleration / braking / reverse
  const maxDriveForce = 32.0; // m/s^2 GT acceleration
  const brakeForce = 44.0;
  let longAccel = 0;

  if (input.throttle > 0) {
    longAccel += input.throttle * maxDriveForce * (car.inPitLane ? 0.45 : 1.0);
  }
  if (input.brake > 0) {
    if (forwardSpeed > 1.2) {
      longAccel -= input.brake * brakeForce;
    } else {
      longAccel -= input.brake * 16.5; // reverse gear
    }
  }

  // Aero drag + rolling resistance
  const drag = 0.0028 * forwardSpeed * Math.abs(forwardSpeed) + 0.55 * forwardSpeed;
  const offroadDrag = car.onRoad ? 0 : 2.1 * forwardSpeed;
  longAccel -= drag + offroadDrag;

  const newForwardSpeed = clamp(forwardSpeed + longAccel * clampedDt, -18, 76);

  // Lateral tire grip (drifting when handbrake or high slip)
  const lateralGrip = (input.handbrake ? 2.4 : 7.8) * surfacePenalty;
  const newLateralSpeed = lateralSpeed * Math.exp(-lateralGrip * clampedDt);

  const nfX = Math.cos(car.heading);
  const nfZ = Math.sin(car.heading);
  const nrX = -nfZ;
  const nrZ = nfX;

  car.vx = nfX * newForwardSpeed + nrX * newLateralSpeed;
  car.vz = nfZ * newForwardSpeed + nrZ * newLateralSpeed;

  car.x += car.vx * clampedDt;
  car.z += car.vz * clampedDt;

  // World bounds safety clamp inside 1120x1120 arena
  car.x = clamp(car.x, -515, 515);
  car.z = clamp(car.z, -515, 515);

  // Resolve collisions against OBBs, trees/rocks, and guardrails
  const impact = resolveCarCollisions(car, registry);
  car.collisionShock = Math.max(car.collisionShock * Math.exp(-6 * clampedDt), clamp(impact / 20, 0, 1));

  // Snap Y smoothly to crown-cambered road or terrain
  const nearest = findNearestTrackSample(samples, car.x, car.z, car.nearestSampleIdx);
  car.nearestSampleIdx = nearest.sample.index;

  const surf = sampleDriveSurfaceHeight(car.x, car.z, nearest, mapDef, terrain);
  car.y = lerp(car.y, surf.surfaceY, 1 - Math.exp(-24 * clampedDt));
  car.onRoad = surf.onRoad;
  car.inPitLane = surf.inPit;

  car.speed = Math.hypot(car.vx, car.vz) * (newForwardSpeed >= -0.2 ? 1 : -1);
  car.wheelSpin += (car.speed / 0.34) * clampedDt;

  // 6-speed GT sequential gearbox & RPM
  const absSpeed = Math.abs(car.speed);
  const gearThresholds = [0, 16, 28, 41, 54, 66, 90];
  let gear = 1;
  for (let g = 1; g <= 6; g++) {
    if (absSpeed >= gearThresholds[g - 1]) gear = g;
  }
  car.gear = car.speed < -0.5 ? 0 : gear;
  const gLow = gearThresholds[Math.max(0, gear - 1)] * 0.72;
  const gHigh = gearThresholds[gear];
  const gearFrac = clamp((absSpeed - gLow) / Math.max(6, gHigh - gLow), 0, 1);
  car.rpm = Math.round(lerp(2400, 8150, gearFrac) + input.throttle * 380);

  // Sector & Lap progression
  const sec = nearest.sample.sectorIndex;
  car.sectorProgressMask |= 1 << sec;
  if (car.lastSector === 2 && sec === 0 && car.sectorProgressMask === 7 && car.lapTime > 12) {
    if (car.bestLapTime === null || car.lapTime < car.bestLapTime) {
      car.bestLapTime = car.lapTime;
    }
    car.currentLap += 1;
    car.lapTime = 0;
    car.sectorProgressMask = 1;
  }
  car.lastSector = sec;

  // Telemetry-driven crowd excitement (speed + straight proximity + low shock)
  const targetExcitement = clamp(
    0.25 + (absSpeed / 70) * 0.55 + (nearest.sample.sectorIndex === 0 ? 0.2 : 0),
    0.2,
    1.0
  );
  car.crowdExcitement = lerp(car.crowdExcitement, targetExcitement, 1 - Math.exp(-2.5 * clampedDt));
}
