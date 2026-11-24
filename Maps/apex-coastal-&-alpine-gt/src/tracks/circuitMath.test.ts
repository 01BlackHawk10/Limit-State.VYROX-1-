import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_REGISTRY } from './mapRegistry';
import {
  applyLayoutPreset,
  buildTrackSplineData,
  CORAL_BAY_CONTROL_POINTS,
  findNearestTrackSample,
  FROSTPEAK_CONTROL_POINTS,
} from './circuitSpline';
import { createCoralBayTerrainField } from './coralBayTerrainField';
import { createFrostpeakTerrainField } from './frostpeakTerrainField';
import { withRoadCorridorCarving } from './terrainField';
import {
  createInitialCarState,
  resolveCarCollisions,
  resolveCircleObb,
} from '../engine/collisionPhysics';
import type { ColliderRegistry } from './types';

test('coral_bay registry and spline geometry match spec', () => {
  const def = MAP_REGISTRY.coral_bay;
  assert.equal(def.id, 'coral_bay');
  assert.equal(def.accent, '#06b6d4');
  assert.equal(def.closedLoop, true);
  assert.equal(def.roadWidth, 15.0);
  assert.equal(def.roadHalfWidth, 7.5);
  assert.equal(def.straightHalfLength, 145);
  assert.equal(CORAL_BAY_CONTROL_POINTS.length, 18);
  assert.deepEqual(def.lockedControlIndices, [0, 1, 2, 8, 9, 10]);
  assert.equal(def.editableWaypoints.length, 9);
  assert.equal(def.layoutPresets.length, 4);
  assert.equal(def.sectors.length, 3);
  assert.equal(def.vantages.length, 7);

  const spline = buildTrackSplineData(def, applyLayoutPreset(def, 'original'));
  assert.ok(spline.minY >= def.minSplineY, `minY ${spline.minY} >= ${def.minSplineY}`);
  assert.ok(
    spline.totalLength > 2400 && spline.totalLength < 3050,
    `Expected ~2.7 km track length, got ${spline.totalLength.toFixed(1)} m`
  );
  assert.ok(
    spline.elevationDelta >= 20 && spline.elevationDelta <= 26,
    `Expected ~23m elevation delta, got ${spline.elevationDelta.toFixed(1)} m`
  );

  // Verify pit-entry guardrail gap exists along pit straight
  const pitGapCount = spline.samples.filter((s) => s.hasRightPitGap).length;
  assert.ok(pitGapCount > 40, `Expected pit guardrail cutout, got ${pitGapCount} samples`);

  // Verify bridge samples centered on bridgeHub (85, -245)
  const bridgeSamples = spline.samples.filter((s) => s.isBridge);
  assert.equal(bridgeSamples.length, def.bridgeHalfSamples * 2 + 1);
});

test('frostpeak_pass registry and spline geometry match spec', () => {
  const def = MAP_REGISTRY.frostpeak_pass;
  assert.equal(def.id, 'frostpeak_pass');
  assert.equal(def.accent, '#38bdf8');
  assert.equal(def.closedLoop, true);
  assert.equal(def.roadWidth, 15.0);
  assert.equal(FROSTPEAK_CONTROL_POINTS.length, 17);
  assert.deepEqual(def.lockedControlIndices, [0, 1, 2, 9, 10, 11]);
  assert.equal(def.editableWaypoints.length, 9);
  assert.equal(def.layoutPresets.length, 4);
  assert.equal(def.vantages.length, 7);

  const spline = buildTrackSplineData(def, applyLayoutPreset(def, 'original'));
  assert.ok(spline.minY >= def.minSplineY, `minY ${spline.minY} >= ${def.minSplineY}`);
  assert.ok(
    spline.totalLength > 2400 && spline.totalLength < 3050,
    `Expected ~2.7 km track length, got ${spline.totalLength.toFixed(1)} m`
  );
  assert.ok(
    spline.elevationDelta >= 26 && spline.elevationDelta <= 33,
    `Expected ~30m elevation delta, got ${spline.elevationDelta.toFixed(1)} m`
  );

  // Verify locked indices remain fixed across all 4 layout presets
  for (const preset of def.layoutPresets) {
    const pts = applyLayoutPreset(def, preset.id);
    for (const idx of def.lockedControlIndices) {
      assert.deepEqual(pts[idx], FROSTPEAK_CONTROL_POINTS[idx]);
    }
  }
});

test('coralBayTerrainField landforms, carvings, and engineered pads stay within clamp', () => {
  const tf = createCoralBayTerrainField();
  assert.equal(tf.waterLevel, 0.0);

  // Caldera peak (15, -45) rises high
  const calderaH = tf.getHeight(15, -45);
  assert.ok(calderaH > 55 && calderaH <= 120, `Caldera height ${calderaH}`);

  // Coral Lagoon (85, -245) carved deep underwater
  const lagoonH = tf.getHeight(85, -245);
  assert.ok(lagoonH < -5, `Lagoon should be deep underwater, got ${lagoonH}`);

  // Plunge Pool Cove (14, -148) carved below water
  const poolH = tf.getHeight(14, -148);
  assert.ok(poolH < -2, `Plunge pool should be submerged, got ${poolH}`);

  // Engineered pit pad at (-20, 214.5) is flat around 6.42m
  const pitA = tf.getHeight(-60, 214.5);
  const pitB = tf.getHeight(20, 214.5);
  assert.ok(Math.abs(pitA - pitB) < 0.08, `Pit pad should be flat: ${pitA} vs ${pitB}`);
});

test('frostpeakTerrainField landforms, glacial lake, and ridge pads behave accurately', () => {
  const tf = createFrostpeakTerrainField();
  assert.equal(tf.waterLevel, 4.0);

  // Central glacier peak (-8, -32) rises over 100m
  const peakH = tf.getHeight(-8, -32);
  assert.ok(peakH > 105 && peakH <= 235, `Glacier peak height ${peakH}`);

  // Frozen glacial lake (55, 185) carved below waterLevel 4.0
  const lakeBed = tf.getHeight(55, 185);
  assert.ok(lakeBed < 0, `Frozen lake bed should be recessed, got ${lakeBed}`);

  // North ridge pit pad (-15, -224.5) is flat around 41.92m
  const padA = tf.getHeight(-55, -224.5);
  const padB = tf.getHeight(25, -224.5);
  assert.ok(Math.abs(padA - padB) < 0.08, `North ridge pad should be flat: ${padA} vs ${padB}`);
});

test('car spawn and collision solver prevent penetration', () => {
  const def = MAP_REGISTRY.coral_bay;
  const spline = buildTrackSplineData(def, applyLayoutPreset(def, 'original'));
  const car = createInitialCarState(def, spline.samples);
  const near = findNearestTrackSample(spline.samples, car.x, car.z);
  assert.ok(Math.sqrt(near.distSq) < 0.5, 'Car should spawn centered on track');

  // Test OBB pushout
  const res = resolveCircleObb(0.2, 0.2, 6.5, 1.5, {
    centerX: 0,
    centerZ: 0,
    halfW: 2,
    halfD: 2,
    axisX: 1,
    axisZ: 0,
    minY: 0,
    maxY: 12,
  });
  assert.equal(res.hit, true);

  // Test registry resolution pushes car out of circle collider
  const registry: ColliderRegistry = {
    obbs: [],
    circles: [{ id: 'tree_1', kind: 'wood', x: car.x + 1.0, z: car.z, radius: 1.0, minY: 0, maxY: 20 }],
    walls: [],
  };
  car.vx = 10;
  const impact = resolveCarCollisions(car, registry, 1.45);
  assert.ok(impact > 0, 'Expected positive collision impact against tree collider');
  assert.ok(Math.hypot(car.x - (registry.circles[0].x), car.z - registry.circles[0].z) >= 2.44);
});

test('withRoadCorridorCarving guarantees clear road surface across all maps and presets', () => {
  for (const mapId of ['coral_bay', 'frostpeak_pass'] as const) {
    const def = MAP_REGISTRY[mapId];
    const base =
      mapId === 'coral_bay' ? createCoralBayTerrainField() : createFrostpeakTerrainField();

    for (const preset of def.layoutPresets) {
      const pts = applyLayoutPreset(def, preset.id);
      const spline = buildTrackSplineData(def, pts);
      const carved = withRoadCorridorCarving(base, spline.samples, def.roadHalfWidth);

      let pokeThroughCount = 0;
      let maxExcess = -Infinity;
      for (const s of spline.samples) {
        for (const offset of [-def.roadHalfWidth, 0, def.roadHalfWidth]) {
          const x = s.x + s.rightX * offset;
          const z = s.z + s.rightZ * offset;
          const th = carved.getHeight(x, z);
          assert.ok(Number.isFinite(th), `Non-finite terrain height at (${x}, ${z})`);
          const excess = th - s.y;
          if (excess > maxExcess) maxExcess = excess;
          if (th > s.y - 0.15) {
            pokeThroughCount++;
          }
        }
      }
      assert.equal(
        pokeThroughCount,
        0,
        `${mapId}/${preset.id} had ${pokeThroughCount} road poke-throughs (maxExcess=${maxExcess.toFixed(3)})`
      );
    }
  }

  // Verify carved lagoon / lake depth remains deep underneath bridge spans
  const cbDef = MAP_REGISTRY.coral_bay;
  const cbSpline = buildTrackSplineData(cbDef, applyLayoutPreset(cbDef, 'original'));
  const cbCarved = withRoadCorridorCarving(createCoralBayTerrainField(), cbSpline.samples, cbDef.roadHalfWidth);
  assert.ok(cbCarved.getHeight(85, -245) < -5, 'Coral Lagoon depth preserved under bridge');

  const fpDef = MAP_REGISTRY.frostpeak_pass;
  const fpSpline = buildTrackSplineData(fpDef, applyLayoutPreset(fpDef, 'original'));
  const fpCarved = withRoadCorridorCarving(createFrostpeakTerrainField(), fpSpline.samples, fpDef.roadHalfWidth);
  assert.ok(fpCarved.getHeight(55, 185) < 0, 'Frostpeak Lake bed depth preserved under bridge');
});

