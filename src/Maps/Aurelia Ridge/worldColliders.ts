import { CircuitQueryResult } from './circuitSpline';

export type ColliderMaterial = 'metal' | 'concrete' | 'tire' | 'wood' | 'rock';

export interface MaterialPhysicsProps {
  restitution: number;
  scrapeFriction: number;
  sparks: boolean;
}

export const COLLIDER_MATERIAL_PROPS: Record<ColliderMaterial, MaterialPhysicsProps> = {
  metal: { restitution: 0.28, scrapeFriction: 0.88, sparks: true },
  concrete: { restitution: 0.22, scrapeFriction: 0.84, sparks: true },
  tire: { restitution: 0.36, scrapeFriction: 0.78, sparks: false },
  wood: { restitution: 0.16, scrapeFriction: 0.76, sparks: false },
  rock: { restitution: 0.20, scrapeFriction: 0.83, sparks: true },
};

export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
  material: ColliderMaterial;
}

export interface ObbCollider {
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
  ux: number; // local X axis (unit)
  uz: number;
  wx: number; // local Z axis (unit)
  wz: number;
  minY: number;
  maxY: number;
  material: ColliderMaterial;
}

export interface CollisionResolution {
  hit: boolean;
  pushX: number;
  pushZ: number;
  normalX: number;
  normalZ: number;
  hitX: number;
  hitY: number;
  hitZ: number;
  leverTorque: number; // normalized off-center torque sign & arm
  material: ColliderMaterial;
  sparks: boolean;
}

const GRID_MIN = -1150;
const GRID_MAX = 1150;
const GRID_CELL = 16;
const GRID_DIM = Math.ceil((GRID_MAX - GRID_MIN) / GRID_CELL);

// 8-point car chassis probes in local vehicle coords (halfW=1.02m, halfL=2.28m)
const CAR_HALF_W = 1.02;
const CAR_HALF_L = 2.28;
const CAR_PROBES: ReadonlyArray<[number, number, number]> = [
  [CAR_HALF_W, CAR_HALF_L, 0.28],    // Front-left corner
  [-CAR_HALF_W, CAR_HALF_L, 0.28],   // Front-right corner
  [CAR_HALF_W, -CAR_HALF_L, 0.28],   // Rear-left corner
  [-CAR_HALF_W, -CAR_HALF_L, 0.28],  // Rear-right corner
  [0, CAR_HALF_L + 0.04, 0.26],      // Front nose splitter
  [0, -CAR_HALF_L - 0.04, 0.26],     // Rear diffuser
  [CAR_HALF_W + 0.02, 0, 0.22],      // Mid-left sill
  [-CAR_HALF_W - 0.02, 0, 0.22],     // Mid-right sill
];

function gridCoord(v: number): number {
  const c = Math.floor((v - GRID_MIN) / GRID_CELL);
  return c < 0 ? 0 : c >= GRID_DIM ? GRID_DIM - 1 : c;
}

export interface WorldCollidersSnapshot {
  circles: CircleCollider[];
  obbs: ObbCollider[];
  sampleCount: number;
  railOffsetLeft: Float32Array;
  railOffsetRight: Float32Array;
  railMatLeft: ColliderMaterial[];
  railMatRight: ColliderMaterial[];
}

class WorldColliderRegistry {
  private circles: CircleCollider[] = [];
  private obbs: ObbCollider[] = [];
  private circleGrid: number[][] = Array.from({ length: GRID_DIM * GRID_DIM }, () => []);
  private obbGrid: number[][] = Array.from({ length: GRID_DIM * GRID_DIM }, () => []);

  // Per-spline-sample guardrail / catch-fence / parapet coverage (1400 samples)
  private sampleCount = 0;
  private railOffsetLeft = new Float32Array(0);  // negative lateral distance, or 0 = open
  private railOffsetRight = new Float32Array(0); // positive lateral distance, or 0 = open
  private railMatLeft: ColliderMaterial[] = [];
  private railMatRight: ColliderMaterial[] = [];

  // Deduplication scratch stamps (zero GC)
  private circleVisited = new Uint32Array(0);
  private obbVisited = new Uint32Array(0);
  private queryStamp = 1;

  public resetAll() {
    this.circles.length = 0;
    this.obbs.length = 0;
    for (let i = 0; i < this.circleGrid.length; i++) {
      this.circleGrid[i].length = 0;
      this.obbGrid[i].length = 0;
    }
    this.sampleCount = 0;
    this.railOffsetLeft = new Float32Array(0);
    this.railOffsetRight = new Float32Array(0);
    this.railMatLeft.length = 0;
    this.railMatRight.length = 0;
  }

  public exportSnapshot(): WorldCollidersSnapshot {
    return {
      circles: this.circles.map((c) => ({ ...c })),
      obbs: this.obbs.map((o) => ({ ...o })),
      sampleCount: this.sampleCount,
      railOffsetLeft: new Float32Array(this.railOffsetLeft),
      railOffsetRight: new Float32Array(this.railOffsetRight),
      railMatLeft: [...this.railMatLeft],
      railMatRight: [...this.railMatRight],
    };
  }

  public restoreSnapshot(snap: WorldCollidersSnapshot): void {
    this.resetAll();
    this.sampleCount = snap.sampleCount;
    this.railOffsetLeft = new Float32Array(snap.railOffsetLeft);
    this.railOffsetRight = new Float32Array(snap.railOffsetRight);
    this.railMatLeft = [...snap.railMatLeft];
    this.railMatRight = [...snap.railMatRight];

    for (let i = 0; i < snap.circles.length; i++) {
      const c = snap.circles[i];
      this.addCircle(c.x, c.z, c.radius, c.material, c.minY, c.maxY);
    }
    for (let i = 0; i < snap.obbs.length; i++) {
      const o = snap.obbs[i];
      this.addObb(o.cx, o.cz, o.halfW, o.halfD, o.ux, o.uz, o.material, o.minY, o.maxY);
    }
  }

  public initSplineBarriers(count: number) {
    this.sampleCount = count;
    this.railOffsetLeft = new Float32Array(count);
    this.railOffsetRight = new Float32Array(count);
    this.railMatLeft = new Array(count).fill('metal');
    this.railMatRight = new Array(count).fill('metal');
  }

  public setSplineBarrier(
    sampleIdx: number,
    side: -1 | 1,
    absOffset: number,
    material: ColliderMaterial,
  ) {
    if (sampleIdx < 0 || sampleIdx >= this.sampleCount) return;
    if (side === -1) {
      this.railOffsetLeft[sampleIdx] = absOffset;
      this.railMatLeft[sampleIdx] = material;
    } else {
      this.railOffsetRight[sampleIdx] = absOffset;
      this.railMatRight[sampleIdx] = material;
    }
  }

  public addCircle(
    x: number,
    z: number,
    radius: number,
    material: ColliderMaterial,
    minY = -200,
    maxY = 200,
  ) {
    const idx = this.circles.length;
    this.circles.push({ x, z, radius, minY, maxY, material });
    if (this.circleVisited.length <= idx) {
      const next = new Uint32Array(Math.max(256, idx * 2 + 64));
      next.set(this.circleVisited);
      this.circleVisited = next;
    }
    const minGx = gridCoord(x - radius);
    const maxGx = gridCoord(x + radius);
    const minGz = gridCoord(z - radius);
    const maxGz = gridCoord(z + radius);
    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        this.circleGrid[gz * GRID_DIM + gx].push(idx);
      }
    }
  }

  public addObb(
    cx: number,
    cz: number,
    halfW: number,
    halfD: number,
    ux: number,
    uz: number,
    material: ColliderMaterial,
    minY = -200,
    maxY = 200,
  ) {
    const uLen = Math.hypot(ux, uz) || 1;
    const nux = ux / uLen;
    const nuz = uz / uLen;
    // Perpendicular local Z axis in XZ
    const nwx = -nuz;
    const nwz = nux;

    const idx = this.obbs.length;
    this.obbs.push({
      cx,
      cz,
      halfW,
      halfD,
      ux: nux,
      uz: nuz,
      wx: nwx,
      wz: nwz,
      minY,
      maxY,
      material,
    });
    if (this.obbVisited.length <= idx) {
      const next = new Uint32Array(Math.max(128, idx * 2 + 32));
      next.set(this.obbVisited);
      this.obbVisited = next;
    }

    const extentX = Math.abs(nux * halfW) + Math.abs(nwx * halfD) + 1.0;
    const extentZ = Math.abs(nuz * halfW) + Math.abs(nwz * halfD) + 1.0;
    const minGx = gridCoord(cx - extentX);
    const maxGx = gridCoord(cx + extentX);
    const minGz = gridCoord(cz - extentZ);
    const maxGz = gridCoord(cz + extentZ);
    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        this.obbGrid[gz * GRID_DIM + gx].push(idx);
      }
    }
  }

  public resolveCarCollisions(
    carX: number,
    carY: number,
    carZ: number,
    fwdX: number,
    fwdZ: number,
    leftX: number,
    leftZ: number,
    trackQ: CircuitQueryResult,
    out: CollisionResolution,
  ): void {
    out.hit = false;
    out.pushX = 0;
    out.pushZ = 0;
    out.normalX = 0;
    out.normalZ = 0;
    out.hitX = carX;
    out.hitY = carY + 0.45;
    out.hitZ = carZ;
    out.leverTorque = 0;
    out.material = 'metal';
    out.sparks = false;

    const stamp = ++this.queryStamp;
    if (stamp === 0xffffffff) {
      this.circleVisited.fill(0);
      this.obbVisited.fill(0);
      this.queryStamp = 1;
    }

    let bestPen = 0;
    let totalPushX = 0;
    let totalPushZ = 0;
    let bestNormX = 0;
    let bestNormZ = 0;
    let bestHitX = carX;
    let bestHitZ = carZ;
    let bestLever = 0;
    let bestMat: ColliderMaterial = 'metal';
    let bestSparks = false;

    // -------------------------------------------------------------------------
    // 1. CONTINUOUS SPLINE GUARDRAILS, CATCH FENCES & BRIDGE CONCRETE PARAPETS
    // -------------------------------------------------------------------------
    if (this.sampleCount > 0) {
      const idxA = trackQ.sample.index;
      const idxB = trackQ.nextSample.index;
      const rx = trackQ.right.x;
      const rz = trackQ.right.z;
      const cx = trackQ.centerPos.x;
      const cz = trackQ.centerPos.z;
      const deckY = trackQ.centerPos.y;

      // Only enforce spline guardrails when car is near the deck vertical band
      if (Math.abs(carY - deckY) < 4.5) {
        const carLat = (carX - cx) * rx + (carZ - cz) * rz;

        for (const side of [-1, 1] as const) {
          const limA = side === -1 ? this.railOffsetLeft[idxA] : this.railOffsetRight[idxA];
          const limB = side === -1 ? this.railOffsetLeft[idxB] : this.railOffsetRight[idxB];
          // Only solid where rail/parapet actually exists on both bracketing samples (keeps Pit Entry/Exit 100% open!)
          if (limA <= 0.1 && limB <= 0.1) continue;
          const wallAbs = limA > 0.1 && limB > 0.1 ? (limA + limB) * 0.5 : Math.max(limA, limB);
          const wallLat = side * wallAbs;
          const wallMat =
            side === -1 ? this.railMatLeft[idxA] : this.railMatRight[idxA];

          // Which side of the barrier wall is the car center on?
          const carInsideWall = side === 1 ? carLat < wallLat : carLat > wallLat;

          for (let p = 0; p < CAR_PROBES.length; p++) {
            const [lx, lz, pRad] = CAR_PROBES[p];
            const px = carX + leftX * lx + fwdX * lz;
            const pz = carZ + leftZ * lx + fwdZ * lz;
            const pLat = (px - cx) * rx + (pz - cz) * rz;

            let pen = 0;
            let nx = 0;
            let nz = 0;

            if (carInsideWall) {
              // Car is inside circuit/bridge -> push back inward if probe reaches wall face
              const distPast = (pLat - wallLat) * side + pRad;
              if (distPast > 0 && distPast < 3.4) {
                pen = distPast;
                nx = -rx * side;
                nz = -rz * side;
              }
            } else {
              // Car came from outside unguarded field -> also block phasing from behind the guardrail!
              const distPast = (wallLat - pLat) * side + pRad;
              if (distPast > 0 && distPast < 2.6) {
                pen = distPast;
                nx = rx * side;
                nz = rz * side;
              }
            }

            if (pen > bestPen) {
              bestPen = pen;
              bestNormX = nx;
              bestNormZ = nz;
              bestHitX = px;
              bestHitZ = pz;
              bestMat = wallMat;
              bestSparks = COLLIDER_MATERIAL_PROPS[wallMat].sparks;
              const relX = px - carX;
              const relZ = pz - carZ;
              bestLever = (relX * nz - relZ * nx) * 0.45;
            }
          }
        }
      }
    }

    if (bestPen > 0) {
      totalPushX = bestNormX * bestPen;
      totalPushZ = bestNormZ * bestPen;
    }

    // -------------------------------------------------------------------------
    // 2. SPATIAL-HASHED SOLID OBB STRUCTURES & CIRCLE PROPS / TREES / TIRE WALLS
    // -------------------------------------------------------------------------
    const testCarX = carX + totalPushX;
    const testCarZ = carZ + totalPushZ;
    const queryPad = 3.2;
    const minGx = gridCoord(testCarX - queryPad);
    const maxGx = gridCoord(testCarX + queryPad);
    const minGz = gridCoord(testCarZ - queryPad);
    const maxGz = gridCoord(testCarZ + queryPad);

    const carTopY = carY + 1.25;
    const carBotY = carY - 0.15;

    let maxPosX = totalPushX > 0 ? totalPushX : 0;
    let maxNegX = totalPushX < 0 ? -totalPushX : 0;
    let maxPosZ = totalPushZ > 0 ? totalPushZ : 0;
    let maxNegZ = totalPushZ < 0 ? -totalPushZ : 0;

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const cellIdx = gz * GRID_DIM + gx;

        // OBBs (Buildings, Pit Wall, Gantry Pylons, Marshal/CCTV Bases, Bridges, Signs)
        const oList = this.obbGrid[cellIdx];
        for (let i = 0; i < oList.length; i++) {
          const oid = oList[i];
          if (this.obbVisited[oid] === stamp) continue;
          this.obbVisited[oid] = stamp;

          const obb = this.obbs[oid];
          if (carTopY < obb.minY || carBotY > obb.maxY) continue;

          // Check all 8 car perimeter probes against the OBB
          for (let p = 0; p < CAR_PROBES.length; p++) {
            const [lx, lz, pRad] = CAR_PROBES[p];
            const px = testCarX + leftX * lx + fwdX * lz;
            const pz = testCarZ + leftZ * lx + fwdZ * lz;

            const dx = px - obb.cx;
            const dz = pz - obb.cz;
            const localU = dx * obb.ux + dz * obb.uz;
            const localW = dx * obb.wx + dz * obb.wz;

            const clampedU = localU < -obb.halfW ? -obb.halfW : localU > obb.halfW ? obb.halfW : localU;
            const clampedW = localW < -obb.halfD ? -obb.halfD : localW > obb.halfD ? obb.halfD : localW;

            const diffU = localU - clampedU;
            const diffW = localW - clampedW;
            const distSq = diffU * diffU + diffW * diffW;

            if (distSq >= pRad * pRad) continue;

            let pushLocalU = 0;
            let pushLocalW = 0;
            let pen = 0;

            if (distSq > 1e-8) {
              const dist = Math.sqrt(distSq);
              pen = pRad - dist;
              pushLocalU = diffU / dist;
              pushLocalW = diffW / dist;
            } else {
              // Probe center is inside OBB: push out along nearest face
              const toEdgeU = obb.halfW - Math.abs(localU);
              const toEdgeW = obb.halfD - Math.abs(localW);
              if (toEdgeU < toEdgeW) {
                pushLocalU = localU >= 0 ? 1 : -1;
                pen = toEdgeU + pRad;
              } else {
                pushLocalW = localW >= 0 ? 1 : -1;
                pen = toEdgeW + pRad;
              }
            }

            const nx = pushLocalU * obb.ux + pushLocalW * obb.wx;
            const nz = pushLocalU * obb.uz + pushLocalW * obb.wz;

            if (pen > 0.001) {
              const pxComp = nx * pen;
              const pzComp = nz * pen;
              if (pxComp > maxPosX) maxPosX = pxComp;
              if (-pxComp > maxNegX) maxNegX = -pxComp;
              if (pzComp > maxPosZ) maxPosZ = pzComp;
              if (-pzComp > maxNegZ) maxNegZ = -pzComp;

              if (pen > bestPen) {
                bestPen = pen;
                bestNormX = nx;
                bestNormZ = nz;
                bestHitX = px - nx * pRad * 0.5;
                bestHitZ = pz - nz * pRad * 0.5;
                bestMat = obb.material;
                bestSparks = COLLIDER_MATERIAL_PROPS[obb.material].sparks;
                const relX = px - carX;
                const relZ = pz - carZ;
                bestLever = (relX * nz - relZ * nx) * 0.45;
              }
            }
          }
        }

        // Circles (Tire Walls, Poles, Trees, Boulders, Arch Piers)
        const cList = this.circleGrid[cellIdx];
        for (let i = 0; i < cList.length; i++) {
          const cid = cList[i];
          if (this.circleVisited[cid] === stamp) continue;
          this.circleVisited[cid] = stamp;

          const c = this.circles[cid];
          if (carTopY < c.minY || carBotY > c.maxY) continue;

          // Quick center-distance broadphase before 8 probes
          const cdx = testCarX - c.x;
          const cdz = testCarZ - c.z;
          const maxReach = c.radius + CAR_HALF_L + 0.5;
          if (cdx * cdx + cdz * cdz > maxReach * maxReach) continue;

          for (let p = 0; p < CAR_PROBES.length; p++) {
            const [lx, lz, pRad] = CAR_PROBES[p];
            const px = testCarX + leftX * lx + fwdX * lz;
            const pz = testCarZ + leftZ * lx + fwdZ * lz;
            const dx = px - c.x;
            const dz = pz - c.z;
            const minSep = c.radius + pRad;
            const dSq = dx * dx + dz * dz;
            if (dSq >= minSep * minSep) continue;

            const dist = Math.sqrt(dSq) || 0.001;
            const pen = minSep - dist;
            const nx = dx / dist;
            const nz = dz / dist;

            const pxComp = nx * pen;
            const pzComp = nz * pen;
            if (pxComp > maxPosX) maxPosX = pxComp;
            if (-pxComp > maxNegX) maxNegX = -pxComp;
            if (pzComp > maxPosZ) maxPosZ = pzComp;
            if (-pzComp > maxNegZ) maxNegZ = -pzComp;

            if (pen > bestPen) {
              bestPen = pen;
              bestNormX = nx;
              bestNormZ = nz;
              bestHitX = c.x + nx * c.radius;
              bestHitZ = c.z + nz * c.radius;
              bestMat = c.material;
              bestSparks = COLLIDER_MATERIAL_PROPS[c.material].sparks;
              const relX = px - carX;
              const relZ = pz - carZ;
              bestLever = (relX * nz - relZ * nx) * 0.45;
            }
          }
        }
      }
    }

    totalPushX = maxPosX - maxNegX;
    totalPushZ = maxPosZ - maxNegZ;
    const totalPushLen = Math.hypot(totalPushX, totalPushZ);
    const maxAllowedPush = Math.min(1.25, Math.max(bestPen * 1.15, 0.45));
    if (totalPushLen > maxAllowedPush && totalPushLen > 1e-5) {
      const pushScale = maxAllowedPush / totalPushLen;
      totalPushX *= pushScale;
      totalPushZ *= pushScale;
    }

    if (bestPen > 0.0005) {
      out.hit = true;
      out.pushX = totalPushX;
      out.pushZ = totalPushZ;
      const nLen = Math.hypot(bestNormX, bestNormZ) || 1;
      out.normalX = bestNormX / nLen;
      out.normalZ = bestNormZ / nLen;
      out.hitX = bestHitX;
      out.hitY = carY + 0.44;
      out.hitZ = bestHitZ;
      out.leverTorque = bestLever;
      out.material = bestMat;
      out.sparks = bestSparks;
    }
  }
}

export const worldColliders = new WorldColliderRegistry();
