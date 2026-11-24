import { fbm2D, lerp, ridgedNoise2D, smoothstep, smootherstep } from '../../engine/mathNoise';

export const KESTREL_WATER_LEVEL = 12.0;
export const KESTREL_BRIDGE_HUB = { x: 570, z: -10 };

/**
 * Pure raw alpine mountain heightfield for Kestrel Peaks Dolomite Summit Climb (~5.8 km).
 * Sculpted so the point-to-point route climbs directly UP the mountain massif itself:
 * 1. Flat South Valley Basecamp Paddock basin (z ~ 610, ~18 m) framed by South Mountain Wall behind z > 692
 * 2. Highland Glacial Loch basin under the Stone-Arch Viaduct (570, -10) & waterfall chute
 * 3. Steep NE Switchback slopes with sheer eastern abyss drop-offs
 * 4. Twin Summit Couloir Gorge limestone walls flanking CP17..19 (~165, -490)
 * 5. Central Dolomite Summit Crown soaring up to ~326 m at (35, -175)
 */
export function kestrelRawHeight(x: number, z: number): number {
  const macro = fbm2D(x * 0.00145, z * 0.00145, 5, 2.05, 0.5, 311);
  const ridge = ridgedNoise2D(x * 0.00225, z * 0.00225, 4, 2.15, 0.54, 7919);
  const spire = ridgedNoise2D(x * 0.0042 + 4.1, z * 0.0042 - 2.3, 3, 2.14, 0.54, 4931);
  const crag = ridgedNoise2D(x * 0.0076 - 1.4, z * 0.0076 + 2.8, 3, 2.08, 0.5, 5813);
  const detail = fbm2D(x * 0.0105, z * 0.0105, 3, 2.05, 0.48, 1297) * 5.6;
  const micro = fbm2D(x * 0.034, z * 0.034, 2, 2.05, 0.45, 6571) * 1.35;

  // Progressive alpine climb from south valley (~18 m) toward northern mountain massif
  const northLift = smoothstep(560, -780, z) * 172.0;
  let h = 18.0 + northLift + macro * 24.0 + ridge * 68.0 + crag * 22.0 + detail + micro;

  // Dramatic Dolomite limestone strata ribs & vertical erosion couloirs on high mountain faces
  const strata = Math.sin(h * 0.36 + macro * 2.8) * 1.65;
  const gully = Math.abs(fbm2D(x * 0.0118, z * 0.0118, 3, 2.0, 0.5, 8111));
  const gullyCarve = (1 - smoothstep(0.0, 0.24, gully)) * smoothstep(42, 240, h) * 10.5;
  h += strata * smoothstep(34, 195, h) - gullyCarve;

  // 1. Central Dolomite Cathedral Massif rising up to 326-355 m under the Summit Crown (35, -175)
  const summitDist = Math.hypot((x - 35) / 260, (z + 185) / 250);
  const summitCone = 1 - smootherstep(0.08, 0.96, summitDist);
  const innerMassif = 1 - smootherstep(0.32, 1.04, Math.hypot((x + 15) / 480, (z + 225) / 470));
  h += innerMassif * (96.0 + spire * 88.0 + crag * 28.0) + summitCone * (138.0 + spire * 46.0);

  // North-East Dolomite Buttress rising west of Highland Loch & beneath upper switchbacks
  const neButtress = Math.hypot((x - 310) / 175, (z + 215) / 165);
  h += (1 - smootherstep(0.24, 1.02, neButtress)) * (92.0 + spire * 62.0);

  // 2. Twin Summit Couloir Gorge Limestone Walls flanking corridor (430,-685) -> (165,-490) -> (-135,-345)
  const corrDx = x - 165;
  const corrDz = z + 490;
  // Unit dir along corridor ~ (-0.857, 0.515), normal ~ (0.515, 0.857)
  const corrAlong = corrDx * -0.857 + corrDz * 0.515;
  const corrCross = corrDx * 0.515 + corrDz * 0.857;
  const inCouloirLen = 1 - smoothstep(135, 225, Math.abs(corrAlong));
  const eastShoulderBoost = smoothstep(-60, -185, corrAlong) * 58.0;
  const leftWallMask = Math.exp(-Math.pow((corrCross - 56) / 30, 2));
  const rightWallMask = Math.exp(-Math.pow((corrCross + 54) / 30, 2));
  const couloirFloorMask = 1 - smoothstep(14, 34, Math.abs(corrCross));
  h +=
    inCouloirLen *
    (leftWallMask * (128.0 + eastShoulderBoost + crag * 28.0) +
      rightWallMask * (118.0 + eastShoulderBoost + crag * 24.0));
  h -= inCouloirLen * couloirFloorMask * 16.0;

  // 3. South Mountain Amphitheater Wall rising cleanly BEHIND Opposite Grandstand (z > 692)
  const gsRecess = smoothstep(130, 210, Math.abs(x + 60));
  const southWallStartZ = lerp(692, 658, gsRecess);
  const southWall =
    smoothstep(southWallStartZ, southWallStartZ + 145, z) *
    smoothstep(-740, -540, x) *
    (1 - smoothstep(640, 800, x));
  h += southWall * (142.0 + ridge * 135.0 + spire * 95.0);

  // Outer West Limestone Ridge Wall (x < -640) framing the West Spur hairpin
  const westWall =
    smoothstep(-620, -780, x) *
    smoothstep(-860, -640, z) *
    (1 - smoothstep(120, 320, z));
  h += westWall * (150.0 + spire * 135.0);

  // Outer Dolomite Amphitheater Ring (r > 850 m), suppressed along NE switchback cliff abyss
  const radial = Math.hypot(x * 0.94, z * 0.98);
  const outerRim = smoothstep(850, 1240, radial);
  const rimPeaks = ridgedNoise2D(x * 0.0028 - 1.9, z * 0.0028 + 3.1, 4, 2.12, 0.54, 9341);
  const isNorthEastAbyssAngle =
    smoothstep(-480, -780, z) * smoothstep(-420, -220, x) * (1 - smoothstep(660, 820, x)) +
    smoothstep(650, 780, x) * smoothstep(-220, -380, z) * (1 - smoothstep(-820, -960, z));
  const clampedAbyssMask = Math.min(1.0, isNorthEastAbyssAngle);
  h += outerRim * (1 - clampedAbyssMask * 0.92) * (136.0 + rimPeaks * 240.0);

  // 4. Sheer Alpine Abyss Drop-Offs outside the East Switchbacks & North Gallery
  const northAbyssWall =
    smoothstep(-830, -935, z) *
    smoothstep(-460, -260, x) *
    (1 - smoothstep(520, 700, x)) *
    (1 - smoothstep(-1080, -1220, z));
  const eastAbyssWall =
    smoothstep(660, 775, x) *
    smoothstep(-220, -360, z) *
    (1 - smoothstep(-740, -880, z)) *
    (1 - smoothstep(1060, 1200, x));
  const abyssMask = Math.min(1.0, northAbyssWall + eastAbyssWall);
  if (abyssMask > 0.001) {
    const abyssRavineFloor = 24.0 + macro * 16.0 + detail * 0.6;
    h = lerp(h, Math.min(h, abyssRavineFloor), abyssMask);
  }

  // 5. Flatten gentle Basecamp Meadow basin around (-60, 615)
  const basecampDist = Math.hypot((x + 60) / 240, (z - 615) / 115);
  const basecampMask = 1 - smootherstep(0.35, 1.05, basecampDist);
  if (basecampMask > 0.001) {
    h = lerp(h, 17.8 + macro * 1.2, basecampMask);
  }

  // 6. Carve Deep Highland Glacial Loch Basin centered beneath Stone Viaduct (570, -10)
  const dx = x - 570;
  const dz = z + 10;
  const lochDist = Math.hypot(dx / 228, dz / 248);
  const lochMask = 1 - smootherstep(0.22, 1.04, lochDist);
  const lochFloorTarget = 1.4 + macro * 2.0;
  h = h * (1 - lochMask) + Math.min(h, lochFloorTarget) * lochMask;

  // 7. Horseshoe Waterfall Gorge Headwall immediately west of Highland Loch (x ~ 372, z ~ -125)
  const wfCliffDist = Math.hypot((x - 372) / 68, (z + 125) / 58);
  h += (1 - smootherstep(0.24, 1.0, wfCliffDist)) * 78.0;

  // Waterfall stepped plunge pool chute feeding directly into the loch at (436, -96)
  const chuteDist = Math.hypot((x - 436) / 44, (z + 96) / 48);
  h -= (1 - smootherstep(0.15, 0.96, chuteDist)) * 22.0;

  // 8. Rock-Cut Alpine Tunnel Mountain Spur & Cleared Portal Forecourts (CP15 [-260,-785] -> CP16 [175,-785])
  // Follow the actual curved tunnel spline arc so neither portal nor bore interior ever collides with the mountain ridge.
  const uTun = Math.max(0, Math.min(1, (x + 260) / 435));
  const tunnelCurveZ = -785.0 - Math.sin(uTun * Math.PI) * 14.0;
  const tCorridorLat = Math.abs(z - tunnelCurveZ);
  if (x > -395 && x < 310 && tCorridorLat < 105) {
    const approxRoadY = lerp(254.0, 268.0, uTun);

    // Wide flared portal forecourt cuts well outside x = -258 and x = +175
    const westApproachMask =
      (1 - smoothstep(-252, -236, x)) *
      smoothstep(-390, -330, x) *
      (1 - smootherstep(20.0, 48.0, tCorridorLat));
    const eastApproachMask =
      smoothstep(154, 170, x) *
      (1 - smoothstep(245, 305, x)) *
      (1 - smootherstep(20.0, 48.0, tCorridorLat));
    const forecourtMask = Math.max(westApproachMask, eastApproachMask);
    if (forecourtMask > 0.001) {
      const cutFloor = approxRoadY - 0.65;
      h = lerp(h, Math.min(h, cutFloor), Math.min(1.0, forecourtMask * 0.99));
    }

    // Mountain spur ridge strictly over interior tunnel barrel (x in [-236, 154]) rising cleanly above rock overburden
    const spurInX = smoothstep(-240, -214, x) * (1 - smoothstep(132, 158, x));
    const spurInZ = 1 - smootherstep(16.0, 72.0, tCorridorLat);
    const spurMask = spurInX * spurInZ;
    if (spurMask > 0.001) {
      const ridgeCrestY = approxRoadY + 26.0 + spire * 18.0 + crag * 9.0;
      h = lerp(h, Math.max(h, ridgeCrestY), spurMask);
    }
  }

  return h;
}
