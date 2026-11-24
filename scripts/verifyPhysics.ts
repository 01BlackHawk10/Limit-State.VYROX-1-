import assert from 'node:assert/strict';
import {
  COORDINATE_FRAME_CONTRACT,
  getDefaultCarSetup,
  NON_DETERMINISTIC_MATH_WARNING,
  VEHICLE_SPECS,
  VehiclePhysicsEngine,
  VehicleTelemetry,
} from '../src/engine/vehiclePhysics';
import { computePerformancePoints } from '../src/engine/ppAndLegality';
import {
  computeEffectiveSpecs,
  computeProjectedCarMetrics,
  getDefaultVisualCustomization,
  PARTS_CATALOG,
} from '../src/engine/carCustomization';
import {
  createFlatEngine,
  createFlatTrackAdapter,
  createRampTrackAdapter,
  DEFAULT_SIM_ASSISTS,
  IDLE_INPUT,
  runQuickPhysicsSelfTests,
} from '../src/engine/physicsSelfTest';
import { ALL_ACTIVE_CAR_IDS } from '../src/shared/carTypes';
import { getCircuitData, setActiveMapId } from '../src/Maps/Aurelia Ridge/circuitSpline';
import { groundHeightAt, sampleTerrainFull } from '../src/Maps/Aurelia Ridge/terrainField';
import { computeCarNormalizationScale } from '../src/engine/mathNoise';
import { MAP_REGISTRY } from '../src/Maps/mapRegistry';

interface CheckRow {
  id: string;
  name: string;
  passed: boolean;
  measured: string;
}

const rows: CheckRow[] = [];

function record(id: string, name: string, passed: boolean, measured: string) {
  rows.push({ id, name, passed, measured });
  if (!passed) {
    console.error(`[FAIL] ${id} (${name}): ${measured}`);
  } else {
    console.log(`[PASS] ${id} (${name}): ${measured}`);
  }
}

console.log('=== GT Sim Physics Verification Suite (1.1–1.15, 2.1–2.11, Core Parity) ===');
console.log(`Contract: ${COORDINATE_FRAME_CONTRACT.handedness}, ${COORDINATE_FRAME_CONTRACT.upAxis} up, ${COORDINATE_FRAME_CONTRACT.forwardAxis} fwd, ${COORDINATE_FRAME_CONTRACT.leftAxis} left`);
console.log(NON_DETERMINISTIC_MATH_WARNING);

// Run shared in-app BIST first
const bist = runQuickPhysicsSelfTests();
for (const r of bist.results) {
  record(`BIST:${r.id}`, r.label, r.passed, r.metric);
}

// 1.1 Substep Force Combination (averaged_substep_forces, 8x over 120Hz = 960Hz)
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  let tlm!: VehicleTelemetry;
  for (let i = 0; i < 15; i++) {
    tlm = eng.step(1 / 60, { ...IDLE_INPUT, throttle: true, throttleVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
  }
  const d = tlm.diagnostics;
  const ok =
    d.chassisHz === 120 &&
    d.substepsPerChassis === 8 &&
    d.tireSubstepHz === 960 &&
    d.forceCombination === 'averaged_substep_forces' &&
    tlm.lonG > 0.25 &&
    tlm.lonG < 2.0;
  record(
    '1.1',
    'Substep force combination & rates',
    ok,
    `${d.chassisHz}Hz x ${d.substepsPerChassis} = ${d.tireSubstepHz}Hz (${d.forceCombination}), lonG=${tlm.lonG.toFixed(2)}g`,
  );
}

// 1.2 0-100 km/h timing (both cars)
{
  const measure0to100 = (carId: 'mclaren-650s-gt3' | 'audi-r8-lms-evo') => {
    const eng = createFlatEngine(carId);
    for (let i = 1; i <= 480; i++) {
      const tlm = eng.step(1 / 60, { ...IDLE_INPUT, throttle: true, throttleVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
      if (tlm.speedKmh >= 100) return i / 60;
    }
    return null;
  };
  const gt3 = measure0to100('mclaren-650s-gt3');
  const r8 = measure0to100('audi-r8-lms-evo');
  const ok = gt3 !== null && gt3 >= 2.2 && gt3 <= 3.8 && r8 !== null && r8 >= 1.8 && r8 <= 3.4;
  record('1.2', '0–100 km/h launch timing', ok, `650S=${gt3?.toFixed(2)}s, R8=${r8?.toFixed(2)}s`);
}

// 1.3 Standstill dither (S + Space)
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  let maxV = 0;
  for (let i = 0; i < 240; i++) {
    const tlm = eng.step(
      1 / 60,
      { ...IDLE_INPUT, brake: true, brakeVal: 1, handbrake: true, handbrakeVal: 1 },
      DEFAULT_SIM_ASSISTS,
      'dry',
    );
    maxV = Math.max(maxV, tlm.speedMps);
  }
  record('1.3', 'Standstill S+Space dither', maxV < 1e-4, `max |v|=${maxV.toExponential(2)} m/s`);
}

// 1.4 Airborne rotation test (ramp launch)
{
  const eng = createFlatEngine('mclaren-650s-gt3', createRampTrackAdapter());
  eng.setStateForTest({ z: 6, vz: 34, gear: 3, countdownTimer: 0 });
  let maxAirHeight = 0;
  let minGnd = 4;
  let airEsc = 0;
  let airFrames = 0;
  let firstAirOmega: number | null = null;
  let lastAirOmega = 0;
  for (let i = 0; i < 75; i++) {
    const steerInput = eng.pos.z > 27.5 ? 1.0 : 0.0;
    const tlm = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerLeft: steerInput > 0, steerAxis: steerInput, throttleVal: 0.5 },
      { ...DEFAULT_SIM_ASSISTS, physicsPreset: 'simcade' },
      'dry',
    );
    maxAirHeight = Math.max(maxAirHeight, eng.pos.y);
    minGnd = Math.min(minGnd, tlm.diagnostics.groundedCount);
    if (tlm.diagnostics.groundedCount === 0) {
      airFrames++;
      if (firstAirOmega === null) firstAirOmega = eng.omega;
      lastAirOmega = eng.omega;
    }
    if (tlm.diagnostics.groundedCount < 3) {
      airEsc = Math.max(airEsc, Math.abs(tlm.diagnostics.escTorqueNm));
    }
  }
  const deltaAirOmega = firstAirOmega !== null ? Math.abs(lastAirOmega - firstAirOmega) : 99;
  const ok = maxAirHeight > 2.0 && minGnd === 0 && airFrames >= 8 && airEsc === 0 && deltaAirOmega < 1e-4 && Math.abs(lastAirOmega) < 0.05;
  record(
    '1.4',
    'Airborne launch & zero air spin',
    ok,
    `peakY=${maxAirHeight.toFixed(2)}m, airFrames=${airFrames}, airESC=${airEsc}Nm, |Δω_air|=${deltaAirOmega.toExponential(1)}`,
  );
}

// 1.5 Skidpad steady-state lateral G (~1.1-1.7g at 20-26 m/s)
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vz: 24, gear: 3, rpm: 5800, countdownTimer: 0 });
  let peakLatG = 0;
  let steadyLatG = 0;
  for (let i = 0; i < 180; i++) {
    const tlm = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerLeft: true, steerAxis: 0.55, throttle: true, throttleVal: 0.45 },
      DEFAULT_SIM_ASSISTS,
      'dry',
    );
    peakLatG = Math.max(peakLatG, Math.abs(tlm.latG));
    if (i > 120) steadyLatG += Math.abs(tlm.latG) / 60;
  }
  const ok = steadyLatG >= 1.05 && steadyLatG <= 1.85;
  record('1.5', 'Skidpad cornering G', ok, `steady=${steadyLatG.toFixed(2)}g (peak ${peakLatG.toFixed(2)}g)`);
}

// 1.6 Ackermann sign test (+left => FL > FR > 0; -right => FR < FL < 0)
{
  const engL = createFlatEngine('mclaren-650s-gt3');
  engL.setStateForTest({ vz: 12, gear: 2, countdownTimer: 0 });
  for (let i = 0; i < 35; i++) {
    engL.step(1 / 60, { ...IDLE_INPUT, steerLeft: true, steerAxis: 1.0 }, DEFAULT_SIM_ASSISTS, 'dry');
  }
  const flL = engL.steerAngleFL;
  const frL = engL.steerAngleFR;

  const engR = createFlatEngine('mclaren-650s-gt3');
  engR.setStateForTest({ vz: 12, gear: 2, countdownTimer: 0 });
  for (let i = 0; i < 35; i++) {
    engR.step(1 / 60, { ...IDLE_INPUT, steerRight: true, steerAxis: -1.0 }, DEFAULT_SIM_ASSISTS, 'dry');
  }
  const flR = engR.steerAngleFL;
  const frR = engR.steerAngleFR;

  const ok = flL > frL && frL > 0 && frR < flR && flR < 0;
  record(
    '1.6',
    'Ackermann steering geometry sign',
    ok,
    `Left(FL=${(flL * 57.3).toFixed(2)}° > FR=${(frL * 57.3).toFixed(2)}°), Right(FL=${(flR * 57.3).toFixed(2)}° > FR=${(frR * 57.3).toFixed(2)}°)`,
  );
}

// 1.7 Reverse engagement + 10 m/s cap
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  let tlm!: VehicleTelemetry;
  for (let i = 0; i < 300; i++) {
    tlm = eng.step(1 / 60, { ...IDLE_INPUT, brake: true, brakeVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
  }
  const ok = tlm.gear === -1 && tlm.speedMps > 8.5 && tlm.speedMps <= 10.15;
  record('1.7', 'Reverse engagement & 10 m/s cap', ok, `gear=${tlm.gear}, v=${tlm.speedMps.toFixed(2)} m/s`);
}

// 1.8 Engine braking decel measurement (high RPM vs low RPM coast)
{
  const measureCoast = (gear: number) => {
    const eng = createFlatEngine('mclaren-650s-gt3');
    eng.setStateForTest({ vz: 35, gear, countdownTimer: 0 });
    const manualAssists = { ...DEFAULT_SIM_ASSISTS, autoGear: false };
    let v0 = 0;
    let v1 = 0;
    for (let i = 0; i < 60; i++) {
      const tlm = eng.step(1 / 60, IDLE_INPUT, manualAssists, 'dry');
      if (i === 5) v0 = tlm.speedMps;
      if (i === 59) v1 = tlm.speedMps;
    }
    return (v0 - v1) / (54 / 60);
  };
  const decelLowGear = measureCoast(2); // High RPM
  const decelHighGear = measureCoast(6); // Low RPM
  const ok = decelLowGear > decelHighGear && decelLowGear > 0.9 && decelHighGear > 0.2;
  record(
    '1.8',
    'Engine braking RPM scaling (2.7)',
    ok,
    `2nd gear decel=${decelLowGear.toFixed(2)} m/s² > 6th gear=${decelHighGear.toFixed(2)} m/s²`,
  );
}

// 1.9 Frame-rate independence (30 / 60 / 144 fps for 3.0 s)
{
  const runAtFps = (fps: number) => {
    const eng = createFlatEngine('mclaren-650s-gt3');
    const steps = Math.round(fps * 3.0);
    const dt = 1 / fps;
    let tlm!: VehicleTelemetry;
    for (let i = 0; i < steps; i++) {
      tlm = eng.step(dt, { ...IDLE_INPUT, throttle: true, throttleVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
    }
    return { v: tlm.speedMps, z: eng.pos.z };
  };
  const r30 = runAtFps(30);
  const r60 = runAtFps(60);
  const r144 = runAtFps(144);
  const dvPct = (Math.max(Math.abs(r30.v - r60.v), Math.abs(r144.v - r60.v)) / Math.max(1, r60.v)) * 100;
  const dzPct = (Math.max(Math.abs(r30.z - r60.z), Math.abs(r144.z - r60.z)) / Math.max(1, r60.z)) * 100;
  const ok = dvPct < 0.8 && dzPct < 0.8;
  record(
    '1.9',
    'Frame-rate independence (30/60/144 fps)',
    ok,
    `v=[${r30.v.toFixed(2)}, ${r60.v.toFixed(2)}, ${r144.v.toFixed(2)}]m/s (Δ=${dvPct.toFixed(3)}%, zΔ=${dzPct.toFixed(3)}%)`,
  );
}

// 1.10 Friction-ellipse coupling (trail braking reduces lateral capacity vs pure turn)
{
  const runCorner = (brakeVal: number) => {
    const eng = createFlatEngine('mclaren-650s-gt3');
    eng.setStateForTest({ vz: 38, gear: 4, countdownTimer: 0 });
    const rawAssists = { ...DEFAULT_SIM_ASSISTS, abs: false, tcs: false };
    let tlm!: VehicleTelemetry;
    for (let i = 0; i < 18; i++) {
      tlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, steerLeft: true, steerAxis: 0.7, brake: brakeVal > 0, brakeVal },
        rawAssists,
        'dry',
      );
    }
    return { latG: Math.abs(tlm.latG), lonG: tlm.lonG };
  };
  const pureTurn = runCorner(0);
  const trailBrake = runCorner(1.0);
  const ok = trailBrake.lonG < -0.7 && trailBrake.latG < pureTurn.latG;
  record(
    '1.10',
    'Friction-ellipse coupling (trail braking)',
    ok,
    `pureLat=${pureTurn.latG.toFixed(2)}g vs trailLat=${trailBrake.latG.toFixed(2)}g @ lon=${trailBrake.lonG.toFixed(2)}g`,
  );
}

// 1.11 Downforce vs top speed (1.4x vs 0.6x aero)
{
  const runTopSpeed = (dfScale: number) => {
    const eng = createFlatEngine('mclaren-650s-gt3');
    const setup = getDefaultCarSetup();
    setup.downforceScale = dfScale;
    eng.setCarSetup(setup);
    eng.setStateForTest({ vz: 60, gear: 5, countdownTimer: 0 });
    let tlm!: VehicleTelemetry;
    for (let i = 0; i < 600; i++) {
      tlm = eng.step(1 / 60, { ...IDLE_INPUT, throttle: true, throttleVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
    }
    return { kmh: tlm.speedKmh, dfKgf: tlm.downforceKgf };
  };
  const lowDf = runTopSpeed(0.6);
  const highDf = runTopSpeed(1.4);
  const ok = highDf.dfKgf > lowDf.dfKgf * 1.6 && lowDf.kmh > highDf.kmh;
  record(
    '1.11',
    'Downforce vs drag top-speed trade-off',
    ok,
    `0.6x(${lowDf.kmh.toFixed(1)}km/h, ${lowDf.dfKgf}kgf) vs 1.4x(${highDf.kmh.toFixed(1)}km/h, ${highDf.dfKgf}kgf)`,
  );
}

// 1.12 Axis-convention unit test pinning yaw sign
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vz: 25, gear: 3, countdownTimer: 0 });
  let tlm!: VehicleTelemetry;
  for (let i = 0; i < 15; i++) {
    tlm = eng.step(1 / 60, { ...IDLE_INPUT, steerLeft: true, steerAxis: 0.8 }, DEFAULT_SIM_ASSISTS, 'dry');
  }
  const ok =
    COORDINATE_FRAME_CONTRACT.leftAxis === '+X' &&
    COORDINATE_FRAME_CONTRACT.forwardAxis === '+Z' &&
    eng.steerAngle > 0.05 &&
    eng.omega > 0.05 &&
    tlm.latG > 0.1;
  record('1.12', 'Axis convention pinned (+Z fwd, +X left, +ω CCW)', ok, `steer=+${eng.steerAngle.toFixed(3)}, ω=+${eng.omega.toFixed(3)}, latG=+${tlm.latG.toFixed(2)}`);
}

// 1.14 Telemetry CSV (25 Hz) + Aurelia Ridge track integration
{
  const eng = new VehiclePhysicsEngine();
  eng.setCarModel('audi-r8-lms-evo');
  eng.setTelemetryLoggerEnabled(true);
  eng.resetToGrid(false);
  let lastTlm!: VehicleTelemetry;
  for (let i = 0; i < 120; i++) {
    lastTlm = eng.step(1 / 60, { ...IDLE_INPUT, throttle: true, throttleVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
  }
  const csv = eng.exportTelemetryCsv();
  const lines = csv.trim().split('\n');
  const count = eng.getTelemetryCsvSampleCount();
  const ok = count >= 45 && lines.length === count + 1 && lastTlm.speedKmh > 65;
  record('1.14', '25 Hz CSV telemetry & Aurelia Ridge spline drive', ok, `samples=${count}, lines=${lines.length}, v=${lastTlm.speedKmh.toFixed(1)}km/h`);
}

// 1.15 CPU Performance budget (1000 frames @ 60Hz = 16,000 ms sim time, 960 Hz tire solver)
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  const samples: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const t0 = performance.now();
    eng.step(
      1 / 60,
      { ...IDLE_INPUT, throttle: true, throttleVal: 0.85, steerAxis: Math.sin(i * 0.05) * 0.4 },
      DEFAULT_SIM_ASSISTS,
      'dry',
    );
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  const avgMs = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p95Ms = samples[Math.floor(samples.length * 0.95)];
  const maxMs = samples[samples.length - 1];
  const ok = avgMs < 2.0 && p95Ms < 4.0;
  record('1.15', 'CPU budget (1000 frames @ 120/960Hz)', ok, `avg=${avgMs.toFixed(3)}ms, p95=${p95Ms.toFixed(3)}ms, max=${maxMs.toFixed(3)}ms`);
}

// === Regression Checks 2.1 - 2.11 ===

// 2.1 Unified stopLong decel budget (already tested at standstill; verify clean decel to 0 without reverse flip)
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vz: 5.0, gear: 1, countdownTimer: 0 });
  let flippedBackwards = false;
  for (let i = 0; i < 120; i++) {
    eng.step(1 / 60, { ...IDLE_INPUT, handbrake: true, handbrakeVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
    if (eng.vz < -0.02) flippedBackwards = true;
  }
  record('2.1', 'Unified stopLong decel budget (no overshoot flip)', !flippedBackwards && Math.abs(eng.vz) < 1e-4, `final vz=${eng.vz.toExponential(2)} m/s`);
}

// 2.2 ESC grounded >= 3 gate (covered in 1.4, also confirm active when >=3 wheels grounded & spinning out)
// 2.3 ESC excess-yaw-only (no discontinuity on countersteer)
// 2.4 ESC yawInertia scaling
{
  const measureEsc = (carId: 'mclaren-650s-gt3' | 'audi-r8-lms-evo', steerAxis: number, omega: number) => {
    const eng = createFlatEngine(carId);
    eng.setStateForTest({ vz: 25, omega, gear: 3, countdownTimer: 0 });
    const tlm = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerAxis },
      { ...DEFAULT_SIM_ASSISTS, physicsPreset: 'simcade' },
      'dry',
    );
    return tlm.diagnostics.escTorqueNm;
  };
  const escGt3 = measureEsc('mclaren-650s-gt3', 0, 1.4);
  const escR8 = measureEsc('audi-r8-lms-evo', 0, 1.4);
  const escCounterSteer = measureEsc('mclaren-650s-gt3', -0.8, 0.35);
  const ratioEsc = Math.abs(escR8) / Math.max(1, Math.abs(escGt3));
  const ratioInertia = VEHICLE_SPECS['audi-r8-lms-evo'].yawInertia / VEHICLE_SPECS['mclaren-650s-gt3'].yawInertia;
  const ok = escGt3 < -100 && Math.abs(ratioEsc - ratioInertia) < 0.35 && Math.abs(escCounterSteer) < Math.abs(escGt3);
  record(
    '2.2-2.4',
    'ESC grounded>=3, excess-yaw countersteer & yawInertia scale',
    ok,
    `650S=${escGt3}Nm, R8=${escR8}Nm (ratio=${ratioEsc.toFixed(2)} vs inertia=${ratioInertia.toFixed(2)}), countersteer=${escCounterSteer}Nm`,
  );
}

// 2.8 Pivot-invariant local CoM (wheelAnchorOriginShiftX/Z = 2.5m shift)
{
  const adapterBase = createFlatTrackAdapter();
  const adapterShifted = { ...createFlatTrackAdapter(), wheelAnchorOriginShiftX: 0.4, wheelAnchorOriginShiftZ: 2.5 };
  const e1 = createFlatEngine('mclaren-650s-gt3', adapterBase);
  const e2 = createFlatEngine('mclaren-650s-gt3', adapterShifted);
  let t1!: VehicleTelemetry;
  let t2!: VehicleTelemetry;
  for (let i = 0; i < 120; i++) {
    t1 = e1.step(1 / 60, { ...IDLE_INPUT, throttle: true, throttleVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
    t2 = e2.step(1 / 60, { ...IDLE_INPUT, throttle: true, throttleVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
  }
  const diff = Math.abs(t1.speedKmh - t2.speedKmh);
  record('2.8', 'Pivot-invariant local CoM', diff < 0.05, `Δspeed=${diff.toFixed(4)} km/h under 2.5m anchor shift`);
}

// 2.9 Rear-steer disabled by default
{
  const ok = !VEHICLE_SPECS['mclaren-650s-gt3'].rearSteerEnabled && !VEHICLE_SPECS['audi-r8-lms-evo'].rearSteerEnabled;
  record('2.9', 'Rear-steer gate disabled on GT specs', ok, `650S=${Boolean(VEHICLE_SPECS['mclaren-650s-gt3'].rearSteerEnabled)}, R8=${Boolean(VEHICLE_SPECS['audi-r8-lms-evo'].rearSteerEnabled)}`);
}

// 2.10 TCS symmetrical kappa clamp in Reverse
{
  const eng = createFlatEngine('mclaren-650s-gt3', createFlatTrackAdapter(0.45));
  eng.setStateForTest({ gear: -1, vz: -1, countdownTimer: 0 });
  let minKappa = 0;
  for (let i = 0; i < 60; i++) {
    const tlm = eng.step(1 / 60, { ...IDLE_INPUT, brake: true, brakeVal: 1 }, { ...DEFAULT_SIM_ASSISTS, tcs: true }, 'dry');
    minKappa = Math.min(minKappa, tlm.tires.rl.kappa);
  }
  const ok = minKappa >= -0.35;
  record('2.10', 'Symmetrical TCS slip cap in reverse', ok, `min reverse κ=${minKappa.toFixed(3)}`);
}

// === Core T2 Parity Subsystems ===

// Skidpad Cornering Traction (high steering angle remains planted without excessive over-slip)
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vz: 34, gear: 3, countdownTimer: 0 });
  let maxLatG = 0;
  let maxRearAlpha = 0;
  let tlm!: VehicleTelemetry;
  for (let i = 0; i < 180; i++) {
    tlm = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerLeft: true, steerAxis: 0.55, throttleVal: 0.72 },
      DEFAULT_SIM_ASSISTS,
      'dry',
    );
    maxLatG = Math.max(maxLatG, Math.abs(tlm.latG));
    maxRearAlpha = Math.max(maxRearAlpha, Math.abs(tlm.tires.rl.alphaDeg), Math.abs(tlm.tires.rr.alphaDeg));
  }
  const ok = maxLatG >= 1.25 && maxRearAlpha <= 14.0 && tlm.speedMps > 20;
  record(
    'SKIDPAD',
    'Cornering traction & gentle slip curve under high-speed steer',
    ok,
    `maxLatG=${maxLatG.toFixed(2)}g, maxRearα=${maxRearAlpha.toFixed(1)}°, v=${tlm.speedKmh.toFixed(1)} km/h`,
  );
}

// 0% tire shred & slow puncture
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vz: 25, gear: 3, tireLife: [0, 1, 1, 1], countdownTimer: 0 });
  let tlm!: VehicleTelemetry;
  for (let i = 0; i < 600; i++) {
    tlm = eng.step(1 / 60, { ...IDLE_INPUT, throttleVal: 0.5 }, DEFAULT_SIM_ASSISTS, 'dry');
  }
  const fl = tlm.tires.fl;
  const ok = fl.shredded && fl.deflationFrac > 0.25 && tlm.tirePressuresPsi[0] < 22 && fl.gripLossPct >= 60;
  record(
    'T2-SHRED',
    '0% Tire shred slow puncture & grip floor',
    ok,
    `shred=${fl.shredded}, defl=${(fl.deflationFrac * 100).toFixed(0)}%, PSI=${tlm.tirePressuresPsi[0].toFixed(1)}, gripLoss=${fl.gripLossPct}%`,
  );
}

// C1 smooth brake fade
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vz: 55, gear: 4, brakeTempsC: [910, 910, 910, 910], countdownTimer: 0 });
  const tlmFaded = eng.step(1 / 60, { ...IDLE_INPUT, brake: true, brakeVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
  const ok = tlmFaded.tires.fl.brakeFaded && tlmFaded.brakeFadeCount === 4;
  record(
    'T2-BRAKE',
    'C1 smooth brake fade above 760°C',
    ok,
    `temp=${tlmFaded.tires.fl.brakeTempC}°C, fadedCount=${tlmFaded.brakeFadeCount}, lonG=${tlmFaded.lonG.toFixed(2)}g`,
  );
}

// Rollover SSF warning
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  const setup = getDefaultCarSetup();
  setup.rideHeightMm = 95;
  setup.tireGripTrim = 1.2;
  eng.setCarSetup(setup);
  const tlm = eng.step(1 / 60, IDLE_INPUT, DEFAULT_SIM_ASSISTS, 'dry');
  const ok = tlm.diagnostics.rolloverSsf > 1.5 && Number.isFinite(tlm.diagnostics.rolloverRiskRatio);
  record(
    'T2-SSF',
    'Static rollover SSF margin computation',
    ok,
    `SSF=${tlm.diagnostics.rolloverSsf.toFixed(2)}, riskRatio=${tlm.diagnostics.rolloverRiskRatio.toFixed(2)}, warn=${tlm.diagnostics.rolloverWarning}`,
  );
}

// Snapshot serialization roundtrip determinism check (single CPU)
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vz: 22, gear: 3, countdownTimer: 0 });
  for (let i = 0; i < 45; i++) {
    eng.step(1 / 60, { ...IDLE_INPUT, throttleVal: 0.8, steerAxis: 0.35 }, DEFAULT_SIM_ASSISTS, 'dry');
  }
  const snap = eng.exportPhysicsSnapshot();
  const stepA = eng.step(1 / 60, { ...IDLE_INPUT, throttleVal: 0.9, steerAxis: -0.2 }, DEFAULT_SIM_ASSISTS, 'dry');
  eng.restorePhysicsSnapshot(snap);
  const stepB = eng.step(1 / 60, { ...IDLE_INPUT, throttleVal: 0.9, steerAxis: -0.2 }, DEFAULT_SIM_ASSISTS, 'dry');
  const ok =
    stepA.posX === stepB.posX &&
    stepA.posZ === stepB.posZ &&
    stepA.speedMps === stepB.speedMps &&
    stepA.oilTempC === stepB.oilTempC;
  record('SNAP', 'State snapshot export/restore exact roundtrip', ok, `Δpos=(${Math.abs(stepA.posX - stepB.posX)}, ${Math.abs(stepA.posZ - stepB.posZ)})`);
}

// === Stage 2–6 Engineering Lab & MVP Gate Verification ===
import { generateDynoCurves, validateCarFitment } from '../src/engine/carCustomization';
import { runSkidpadBenchmark, runStraightLineBrakingBenchmark } from '../src/engine/deterministicCore';
import { evaluateCarLegality } from '../src/engine/ppAndLegality';
import { runMvpGateSuite } from '../src/engine/varianceAndExplainer';

{
  // Skidpad & Braking benchmarks
  const skid = runSkidpadBenchmark('mclaren-650s-gt3');
  const brk = runStraightLineBrakingBenchmark('mclaren-650s-gt3');
  record(
    'S2-BENCH',
    'Test Mode Skidpad & Straight-Line Braking Benchmarks',
    skid.stable && brk.brakingDistanceM > 60 && brk.brakingDistanceM < 220,
    `skid=${skid.steadyLatG}G (${skid.rearSlipDeg}° rear α), 200->0 brake=${brk.brakingDistanceM}m (${brk.peakDecelG}G)`,
  );

  // Parts fitment clearance & Dyno overlay
  const badFitSetup = getDefaultCarSetup('mclaren-650s-gt3');
  badFitSetup.equippedParts = {
    ...badFitSetup.equippedParts,
    wheels: 'wheels_club_18',
    brakes: 'brakes_ccm_410',
  };
  const fitBad = validateCarFitment(VEHICLE_SPECS['mclaren-650s-gt3'], badFitSetup);
  const turboSetup = getDefaultCarSetup('mclaren-650s-gt3');
  turboSetup.equippedParts = {
    ...turboSetup.equippedParts,
    ecu_turbo: 'ecu_big_turbo',
    cooling: 'cooling_endurance',
    drivetrain: 'drive_carbon_shaft',
  };
  const dyno = generateDynoCurves(VEHICLE_SPECS['mclaren-650s-gt3'], turboSetup);
  record(
    'S3-PARTS',
    'Fitment 18"/410mm rejection & Dyno stock-vs-upgraded overlay',
    !fitBad.fits && fitBad.issues.some((i) => i.code === 'BRAKE_WHEEL_CLEARANCE') && dyno.upgradedPeakHp > dyno.stockPeakHp,
    `fitBad=${fitBad.fits} (${fitBad.issues[0]?.code}), dyno=${dyno.stockPeakHp}HP -> ${dyno.upgradedPeakHp}HP`,
  );

  // PP & Open Pure Customisation Legality (zero illegal build locks; warnings remain advisory)
  const legalGt3 = evaluateCarLegality({
    carId: 'mclaren-650s-gt3',
    setup: getDefaultCarSetup('mclaren-650s-gt3'),
    ruleId: 'gt3_spec',
    enforcementMode: 'strict',
  });
  const awdStreetInGt3 = evaluateCarLegality({
    carId: 'bmw-m4-widebody',
    setup: getDefaultCarSetup('bmw-m4-widebody'),
    ruleId: 'gt3_spec',
    enforcementMode: 'strict',
  });
  record(
    'S6-PP',
    'PP calculation & Open Pure Customisation (never blocked by Illegal Build)',
    legalGt3.isLegal &&
      legalGt3.canLaunch &&
      awdStreetInGt3.isLegal &&
      awdStreetInGt3.canLaunch &&
      legalGt3.violations.length === 0 &&
      awdStreetInGt3.violations.length === 0,
    `650S=${legalGt3.ppReport.pp}PP (canLaunch=${legalGt3.canLaunch}), M4Widebody=${awdStreetInGt3.ppReport.pp}PP (canLaunch=${awdStreetInGt3.canLaunch})`,
  );

  // Stage 4/5 Reference Bot, Variance Map, Deterministic Rules Explainer & 8-point MVP Gate
  const mvp = runMvpGateSuite('mclaren-650s-gt3');
  for (const r of mvp.results) {
    record(`MVP:${r.id}`, r.label, r.passed, r.detail);
  }
}

// === Stage 1 Manual Steering & Handbrake-Only Skid Verification ===
{
  // Zero auto-steering when steer input is zero / released over kerbs
  const eng = createFlatEngine('mclaren-650s-gt3', {
    ...createFlatTrackAdapter(0),
    querySurfaceAt: () => ({
      t: 0,
      absDistance: 7.6,
      signedLateral: 7.6,
      isBridge: false,
      centerPos: { x: 0, y: 0, z: 0 },
      tangent: { x: 0, y: 0, z: 1 },
      right: { x: 0.9995, y: 0.03, z: 0 },
      up: { x: -0.03, y: 0.9995, z: 0 },
    }),
  });
  eng.setStateForTest({ vz: 32, gear: 3, countdownTimer: 0 });
  for (let i = 0; i < 30; i++) {
    eng.step(1 / 60, { ...IDLE_INPUT, steerAxis: 0.65, throttleVal: 0.5 }, DEFAULT_SIM_ASSISTS, 'dry');
  }
  let tlm!: VehicleTelemetry;
  for (let i = 0; i < 45; i++) {
    tlm = eng.step(1 / 60, { ...IDLE_INPUT, steerAxis: 0, throttleVal: 0.4 }, DEFAULT_SIM_ASSISTS, 'dry');
  }
  const ok = Math.abs(eng.steerAngle) < 0.002 && Math.abs(eng.omega) < 0.12;
  record(
    'S1-STEER',
    'Zero automatic self-steer on release & kerbs',
    ok,
    `steerAngle=${eng.steerAngle.toFixed(5)}rad, yawRate=${eng.omega.toFixed(3)}rad/s`,
  );
}

{
  // Normal aggressive turn = zero skid/squeal; holding handbrake = active skid/squeal
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vz: 34, gear: 3, countdownTimer: 0 });
  let maxNormalSqueal = 0;
  let maxNormalSkid = 0;
  for (let i = 0; i < 90; i++) {
    const t = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerLeft: true, steerAxis: 0.92, throttleVal: 0.72, handbrake: false },
      DEFAULT_SIM_ASSISTS,
      'dry',
    );
    maxNormalSqueal = Math.max(maxNormalSqueal, t.tireSquealIntensity);
    maxNormalSkid = Math.max(maxNormalSkid, t.brakeSkidIntensity);
  }
  let maxHbSqueal = 0;
  let maxHbSkid = 0;
  for (let i = 0; i < 40; i++) {
    const t = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerLeft: true, steerAxis: 0.65, handbrake: true, handbrakeVal: 1 },
      DEFAULT_SIM_ASSISTS,
      'dry',
    );
    maxHbSqueal = Math.max(maxHbSqueal, t.tireSquealIntensity);
    maxHbSkid = Math.max(maxHbSkid, t.brakeSkidIntensity);
  }
  const ok = maxNormalSqueal === 0 && maxNormalSkid === 0 && (maxHbSqueal > 0.2 || maxHbSkid > 0.2);
  record(
    'S1-SKID',
    'Zero normal-turn skid; skids only with handbrake',
    ok,
    `normal=(sq:${maxNormalSqueal.toFixed(2)}, sk:${maxNormalSkid.toFixed(2)}) · handbrake=(sq:${maxHbSqueal.toFixed(2)}, sk:${maxHbSkid.toFixed(2)})`,
  );
}

// === GT Sport 4-Layer Steering & Anti-Spin Acceptance Tests (1–6) ===

// 1. Governor understeer cap — 40 m/s, full lock, governor on, countersteer off -> front slip < 6° across 3 s
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vz: 40, gear: 5, countdownTimer: 0 });
  const govAssists = {
    ...DEFAULT_SIM_ASSISTS,
    physicsPreset: 'simcade' as const,
    steeringGovernor: true,
    countersteerAssist: false,
  };
  let maxFrontAlphaDeg = 0;
  let lastGovCap = 0;
  for (let i = 0; i < 180; i++) {
    const t = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerLeft: true, steerAxis: 1.0, throttle: true, throttleVal: 0.65 },
      govAssists,
      'dry',
    );
    maxFrontAlphaDeg = Math.max(
      maxFrontAlphaDeg,
      Math.abs(t.tires.fl.alphaDeg),
      Math.abs(t.tires.fr.alphaDeg),
    );
    lastGovCap = t.diagnostics.govCapDeg;
  }
  const ok = maxFrontAlphaDeg < 6.0 && lastGovCap > 0.5 && lastGovCap < 5.0;
  record(
    'GT4-1',
    'Governor understeer cap (40 m/s full lock, front α < 6°)',
    ok,
    `maxFrontα=${maxFrontAlphaDeg.toFixed(2)}°, govCap=${lastGovCap.toFixed(2)}°`,
  );
}

// 2. Governor low-speed non-interference — 10 m/s, full lock -> maxUsefulSteer > maxAngle(v)
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vz: 10, gear: 2, countdownTimer: 0 });
  const simCadeAssists = {
    ...DEFAULT_SIM_ASSISTS,
    physicsPreset: 'simcade' as const,
    steeringGovernor: true,
    countersteerAssist: true,
  };
  let tlm!: VehicleTelemetry;
  for (let i = 0; i < 15; i++) {
    tlm = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerLeft: true, steerAxis: 1.0, throttle: true, throttleVal: 0.12 },
      simCadeAssists,
      'dry',
    );
  }
  const maxAngleAtV = 34 + (10 - 34) * Math.min(1, tlm.speedMps / 45);
  const steerDeg = Math.abs((eng.steerAngle * 180) / Math.PI);
  const ok = tlm.diagnostics.govCapDeg > maxAngleAtV && steerDeg <= maxAngleAtV + 0.05 && steerDeg > 25;
  record(
    'GT4-2',
    'Governor low-speed non-interference (10 m/s)',
    ok,
    `maxUsefulSteer=${tlm.diagnostics.govCapDeg.toFixed(2)}° > maxAngle(${tlm.speedMps.toFixed(1)})=${maxAngleAtV.toFixed(2)}°, steer=${steerDeg.toFixed(2)}°`,
  );
}

// 3. Countersteer engage — force 15° body slip via handbrake flick, release input -> CST != 0, < 2° slip within 1.5 s
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  const simCadeAssists = {
    ...DEFAULT_SIM_ASSISTS,
    physicsPreset: 'simcade' as const,
    steeringGovernor: true,
    countersteerAssist: true,
  };
  eng.setStateForTest({ vz: 26, gear: 3, countdownTimer: 0 });
  // Handbrake flick to induce >= 15° body slip
  for (let i = 0; i < 45; i++) {
    const t = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerLeft: true, steerAxis: 1.0, handbrake: true, handbrakeVal: 1 },
      { ...simCadeAssists, countersteerAssist: false },
      'dry',
    );
    if (Math.abs(t.diagnostics.slipBodyDeg) >= 15.5) break;
  }
  if (Math.abs(eng.step(0, IDLE_INPUT, simCadeAssists, 'dry').diagnostics.slipBodyDeg) < 15) {
    const slipRad = (15.5 * Math.PI) / 180;
    eng.setStateForTest({
      vx: -Math.sin(slipRad) * 24,
      vz: Math.cos(slipRad) * 24,
      yaw: 0,
      omega: -0.35,
      gear: 3,
      countdownTimer: 0,
    });
  }
  let maxCst = 0;
  let endSlip = 99;
  for (let i = 0; i < 90; i++) {
    const t = eng.step(1 / 60, IDLE_INPUT, simCadeAssists, 'dry');
    maxCst = Math.max(maxCst, Math.abs(t.diagnostics.cstAssistDeg));
    endSlip = Math.abs(t.diagnostics.slipBodyDeg);
  }
  const ok = maxCst > 0.5 && endSlip < 2.0;
  record(
    'GT4-3',
    'Countersteer engage & zero-input recovery (< 2° in 1.5s)',
    ok,
    `peakCST=${maxCst.toFixed(2)}°, finalSlipBody=${endSlip.toFixed(2)}°`,
  );
}

// 4. Countersteer deadband — steady ~1.0G corner, body slip < 6° -> CST == 0 exactly, effSteer == player input
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vz: 16, gear: 2, countdownTimer: 0 });
  const simCadeAssists = {
    ...DEFAULT_SIM_ASSISTS,
    physicsPreset: 'simcade' as const,
    steeringGovernor: true,
    countersteerAssist: true,
  };
  let maxCst = 0;
  let maxSlip = 0;
  let lastTlm!: VehicleTelemetry;
  const steerCmd = 0.25; // ~6.3 deg at 16 m/s (< govCap ~11.8 deg), yields ~1.0G cornering
  for (let i = 0; i < 60; i++) {
    lastTlm = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerAxis: steerCmd, throttle: true, throttleVal: 0.48 },
      simCadeAssists,
      'dry',
    );
    if (i > 15) {
      maxCst = Math.max(maxCst, Math.abs(lastTlm.diagnostics.cstAssistDeg));
      maxSlip = Math.max(maxSlip, Math.abs(lastTlm.diagnostics.slipBodyDeg));
    }
  }
  const speedNow = lastTlm.speedMps;
  const expectedDeg = steerCmd * (34 + (10 - 34) * Math.min(1, speedNow / 45));
  const actualDeg = (eng.steerAngle * 180) / Math.PI;
  const ok =
    maxSlip < 6.0 &&
    maxCst === 0 &&
    Math.abs(lastTlm.latG) > 0.75 &&
    Math.abs(actualDeg - expectedDeg) < 0.05;
  record(
    'GT4-4',
    'Countersteer 8° deadband & pure player steer match',
    ok,
    `latG=${lastTlm.latG.toFixed(2)}g, maxSlip=${maxSlip.toFixed(2)}°, maxCST=${maxCst}°, effSteer=${actualDeg.toFixed(2)}° vs input=${expectedDeg.toFixed(2)}°`,
  );
}

// 5. No assist in reverse — gear 0 and gear -1, countersteer assist on -> CST == 0 throughout
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  const simCadeAssists = {
    ...DEFAULT_SIM_ASSISTS,
    physicsPreset: 'simcade' as const,
    steeringGovernor: true,
    countersteerAssist: true,
    autoGear: false,
  };
  let maxCst = 0;
  for (const gearVal of [0, -1]) {
    eng.setStateForTest({ vx: 3.5, vz: -8, yaw: 0, omega: 0, gear: gearVal, countdownTimer: 0 });
    for (let i = 0; i < 30; i++) {
      const t = eng.step(
        1 / 60,
        { ...IDLE_INPUT, steerAxis: 0.3, brake: true, brakeVal: 0.6 },
        simCadeAssists,
        'dry',
      );
      maxCst = Math.max(maxCst, Math.abs(t.diagnostics.cstAssistDeg));
    }
  }
  record('GT4-5', 'No countersteer assist in Neutral/Reverse', maxCst === 0, `maxCST=${maxCst}°`);
}

// 6. Toggle off cleanly — Simulation preset -> GOV == 0 and CST == 0 whole session; only Layers 1-2
{
  const eng = createFlatEngine('mclaren-650s-gt3');
  eng.setStateForTest({ vx: -6, vz: 25, yaw: 0, gear: 3, countdownTimer: 0 });
  const simOnlyAssists = {
    ...DEFAULT_SIM_ASSISTS,
    physicsPreset: 'simulation' as const,
    steeringGovernor: false,
    countersteerAssist: false,
  };
  let maxGov = 0;
  let maxCst = 0;
  let tlm!: VehicleTelemetry;
  for (let i = 0; i < 60; i++) {
    tlm = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerLeft: true, steerAxis: 1.0, throttleVal: 0.5 },
      simOnlyAssists,
      'dry',
    );
    maxGov = Math.max(maxGov, Math.abs(tlm.diagnostics.govCapDeg));
    maxCst = Math.max(maxCst, Math.abs(tlm.diagnostics.cstAssistDeg));
  }
  const maxAngleAtV = 34 + (10 - 34) * Math.min(1, tlm.speedMps / 45);
  const actualDeg = (eng.steerAngle * 180) / Math.PI;
  const ok = maxGov === 0 && maxCst === 0 && Math.abs(actualDeg - maxAngleAtV) < 0.1;
  record(
    'GT4-6',
    'Simulation preset cleanly disables GOV & CST',
    ok,
    `maxGOV=${maxGov}°, maxCST=${maxCst}°, effSteer=${actualDeg.toFixed(2)}° == Layer2=${maxAngleAtV.toFixed(2)}°`,
  );
}


// === New Vehicles (BMW M4 GT3 Evo & M4 Widebody Modified) & Kestrel Peaks 5 km Mountain Circuit ===
{
  const m4Spec = VEHICLE_SPECS['bmw-m4-gt3-evo'];
  const wbSpec = VEHICLE_SPECS['bmw-m4-widebody'];
  const m4Setup = getDefaultCarSetup('bmw-m4-gt3-evo');
  const m4Pp = computePerformancePoints('bmw-m4-gt3-evo', m4Setup);
  const m4Gt3Legal = evaluateCarLegality({
    carId: 'bmw-m4-gt3-evo',
    setup: m4Setup,
    ruleId: 'gt3_spec',
    enforcementMode: 'strict',
  });
  const ok =
    Boolean(m4Spec && wbSpec) &&
    m4Spec.massKg >= 1180 &&
    wbSpec.frontDriveFrac > 0.1 &&
    m4Pp.pp <= 720 &&
    m4Gt3Legal.isLegal &&
    m4Gt3Legal.canLaunch;
  record(
    'BMW-SPEC',
    'BMW M4 GT3 Evo & M4 Widebody specs + GT3 legality (<= 720 PP)',
    ok,
    `M4 GT3=${m4Pp.pp}PP (${m4Spec.massKg}kg, legal=${m4Gt3Legal.isLegal}), M4 Widebody=${Math.round(wbSpec.maxPowerWatts / 745.7)}HP AWD`,
  );
}

{
  // Full-size scaling for BMW M4 GT3 Evo (~0.05017 raw), VW Polo R WRX (~0.004 raw -> 4.25m), AMG GT3 Evo (~0.048 -> 4.80m), and VW Golf GTI Mk2 (~0.040 -> 3.99m)
  const m4Scale = computeCarNormalizationScale(0.05017, 4.96);
  const m4NormalizedLen = 0.05017 * m4Scale;
  const poloScale = computeCarNormalizationScale(0.004, 4.25);
  const poloNormalizedLen = 0.004 * poloScale;
  const amgScale = computeCarNormalizationScale(0.048, 4.80);
  const amgNormalizedLen = 0.048 * amgScale;
  const golfScale = computeCarNormalizationScale(0.040, 3.99);
  const golfNormalizedLen = 0.040 * golfScale;
  const gt3Scale = computeCarNormalizationScale(4.63, 4.63);
  const fallbackScale = computeCarNormalizationScale(0.0001, 4.96);
  const ok =
    m4Scale > 95 &&
    m4Scale < 105 &&
    Math.abs(m4NormalizedLen - 4.96) < 0.02 &&
    Math.abs(poloNormalizedLen - 4.25) < 0.02 &&
    Math.abs(amgNormalizedLen - 4.80) < 0.02 &&
    Math.abs(golfNormalizedLen - 3.99) < 0.02 &&
    gt3Scale === 1 &&
    fallbackScale === 1;
  record(
    'CAR-SCALE',
    'Car normalization bounds (M4 4.96m, Polo 4.25m, AMG 4.80m, Golf 3.99m)',
    ok,
    `M4=${m4NormalizedLen.toFixed(2)}m, Polo=${poloNormalizedLen.toFixed(2)}m, AMG=${amgNormalizedLen.toFixed(2)}m, Golf=${golfNormalizedLen.toFixed(2)}m`,
  );
}

{
  const eng = createFlatEngine('bmw-m4-gt3-evo');
  eng.setStateForTest({ vz: 42, gear: 5, countdownTimer: 0 });
  const simCade = {
    ...DEFAULT_SIM_ASSISTS,
    physicsPreset: 'simcade' as const,
    steeringGovernor: true,
    countersteerAssist: true,
  };
  let maxFrontAlpha = 0;
  let lastGov = 0;
  for (let i = 0; i < 120; i++) {
    const t = eng.step(
      1 / 60,
      { ...IDLE_INPUT, steerLeft: true, steerAxis: 1.0, throttle: true, throttleVal: 0.7 },
      simCade,
      'dry',
    );
    maxFrontAlpha = Math.max(maxFrontAlpha, Math.abs(t.tires.fl.alphaDeg), Math.abs(t.tires.fr.alphaDeg));
    lastGov = t.diagnostics.govCapDeg;
  }
  let releaseSteer = 0;
  for (let i = 0; i < 45; i++) {
    eng.step(1 / 60, IDLE_INPUT, simCade, 'dry');
    releaseSteer = eng.steerAngle;
  }
  const ok = maxFrontAlpha < 6.5 && lastGov > 0.5 && Math.abs(releaseSteer) < 0.002;
  record(
    'BMW-SIMCADE',
    'M4 GT3 Evo SimCade high-speed governor & zero self-steer',
    ok,
    `maxFrontα=${maxFrontAlpha.toFixed(2)}°, govCap=${lastGov.toFixed(2)}°, releaseSteer=${releaseSteer.toFixed(5)}rad`,
  );
}

{
  // Straight & banked-road stability: steer=0 must NOT violently lift inside wheels or yank yaw
  let worstYawDeg = 0;
  let minGrounded = 4;
  for (const mapId of ['aurelia_ridge', 'kestrel_peaks'] as const) {
    setActiveMapId(mapId);
    for (const preset of ['simulation', 'simcade'] as const) {
      const eng = new VehiclePhysicsEngine();
      eng.setCarModel('bmw-m4-gt3-evo');
      eng.resetToGrid(false);
      eng.setStateForTest({ countdownTimer: 0 });
      const initialYaw = eng.yaw;
      const assists = { ...DEFAULT_SIM_ASSISTS, physicsPreset: preset };
      for (let i = 0; i < 360; i++) {
        const t = eng.step(1 / 60, { ...IDLE_INPUT, throttle: true, throttleVal: 1 }, assists, 'dry');
        const dyawDeg = Math.abs(((eng.yaw - initialYaw) * 180) / Math.PI);
        worstYawDeg = Math.max(worstYawDeg, dyawDeg);
        minGrounded = Math.min(minGrounded, t.diagnostics.groundedCount);
      }
    }
  }
  setActiveMapId('aurelia_ridge');

  // Sustained banked transition test (3.4° road bank + 2.3° uphill grade, steer=0)
  const bankAdapter = {
    ...createFlatTrackAdapter(0),
    querySurfaceAt: (x: number, z: number) => ({
      t: 0,
      absDistance: Math.abs(x),
      signedLateral: x,
      isBridge: false,
      centerPos: { x: 0, y: z * 0.04, z },
      tangent: { x: 0, y: 0.04, z: 0.9992 },
      right: { x: 0.9982, y: 0.06, z: 0 },
      up: { x: -0.06, y: 0.9974, z: -0.04 },
    }),
    groundHeightAt: (x: number, _yRef: number, z: number) => z * 0.04 + x * 0.06,
  };
  const bEng = createFlatEngine('mclaren-650s-gt3', bankAdapter);
  bEng.setStateForTest({ vz: 30, gear: 4, countdownTimer: 0 });
  let bankMinGnd = 4;
  let bankMaxFzRatio = 1;
  for (let i = 0; i < 240; i++) {
    const bt = bEng.step(1 / 60, { ...IDLE_INPUT, throttle: true, throttleVal: 0.7 }, DEFAULT_SIM_ASSISTS, 'dry');
    bankMinGnd = Math.min(bankMinGnd, bt.diagnostics.groundedCount);
    const fz = bt.diagnostics.cornerFzN;
    const lrRatio = Math.max(fz[0], fz[1]) / Math.max(100, Math.min(fz[0], fz[1]));
    bankMaxFzRatio = Math.max(bankMaxFzRatio, lrRatio);
  }
  const ok = worstYawDeg < 0.8 && minGrounded === 4 && bankMinGnd === 4 && bankMaxFzRatio < 1.35;
  record(
    'BANK-STRAIGHT',
    'Zero automatic side-turn & zero inside-wheel lift on straights & banked roads',
    ok,
    `trackMaxYawΔ=${worstYawDeg.toFixed(3)}°, gnd=${minGrounded}/4, bankGnd=${bankMinGnd}/4, bankFzRatio=${bankMaxFzRatio.toFixed(2)}`,
  );
}

{
  setActiveMapId('kestrel_peaks');
  const circuit = getCircuitData();
  const elevSpan = circuit.maxElevation - circuit.minElevation;
  let validSamples = true;
  let maxRoadBedErr = 0;
  let maxNearbyCliff = 0;
  let minRidgeDrop = 0;

  for (let i = 0; i < circuit.samples.length; i += 20) {
    const s = circuit.samples[i];
    const p = s.position;
    const t = sampleTerrainFull(p.x, p.z);
    if (!Number.isFinite(t.height) || !Number.isFinite(t.distToRoad) || !Number.isFinite(t.slopeFactor)) {
      validSamples = false;
      break;
    }
    if (!s.isBridge) {
      maxRoadBedErr = Math.max(maxRoadBedErr, Math.abs(t.height - (p.y - 0.08)));
    }
    for (const lat of [-45, -28, 28, 45]) {
      const gh = groundHeightAt(p.x + s.right.x * lat, p.z + s.right.z * lat);
      maxNearbyCliff = Math.max(maxNearbyCliff, gh - p.y);
      minRidgeDrop = Math.min(minRidgeDrop, gh - p.y);
    }
  }

  // Verify double-sided Twin Summit Couloir Gorge (CP18 ~165,-490) and camera clearances
  const sGorge = circuit.queryNearest(165, -490).sample;
  const gorgeL = groundHeightAt(sGorge.position.x - sGorge.right.x * 55, sGorge.position.z - sGorge.right.z * 55) - sGorge.position.y;
  const gorgeR = groundHeightAt(sGorge.position.x + sGorge.right.x * 55, sGorge.position.z + sGorge.right.z * 55) - sGorge.position.y;

  const kestrelMeta = MAP_REGISTRY.kestrel_peaks;
  let minCamClearance = Infinity;
  const cOv = kestrelMeta.customizerOverviewPos;
  minCamClearance = Math.min(minCamClearance, cOv[1] - groundHeightAt(cOv[0], cOv[2]));
  for (const v of kestrelMeta.cameraVantages) {
    minCamClearance = Math.min(minCamClearance, v.pos[1] - groundHeightAt(v.pos[0], v.pos[2]));
  }

  setActiveMapId('aurelia_ridge');
  const ok =
    circuit.mapId === 'kestrel_peaks' &&
    circuit.totalLength >= 4800 &&
    circuit.totalLength <= 6800 &&
    elevSpan >= 180 &&
    validSamples &&
    maxRoadBedErr < 0.15 &&
    maxNearbyCliff >= 75 &&
    minRidgeDrop <= -40 &&
    gorgeL >= 35 &&
    gorgeR >= 20 &&
    minCamClearance >= 2.0;
  record(
    'KESTREL-5KM',
    'Kestrel Peaks mountain climb, cliffs, gorge, ridge drop & camera clearances',
    ok,
    `len=${Math.round(circuit.totalLength)}m, Δelev=${elevSpan.toFixed(1)}m, cliff=+${maxNearbyCliff.toFixed(1)}m, drop=${minRidgeDrop.toFixed(1)}m, gorge=(+${gorgeL.toFixed(0)}/+${gorgeR.toFixed(0)}m), camClr=${minCamClearance.toFixed(1)}m`,
  );
}

{
  // HILL-ASSIST: Exact flat-ground parity (0.00m / 0.00 km/h difference ON vs OFF) + 16% uphill climb across all 4 cars
  const testFlat = (hillClimbAssist: boolean) => {
    const eng = createFlatEngine('mclaren-650s-gt3');
    let lastTlm!: VehicleTelemetry;
    for (let i = 0; i < 300; i++) {
      lastTlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, throttle: true, throttleVal: 1 },
        { ...DEFAULT_SIM_ASSISTS, hillClimbAssist },
        'dry',
      );
    }
    return { distZ: eng.pos.z, speedKmh: lastTlm.speedKmh };
  };
  const flatOn = testFlat(true);
  const flatOff = testFlat(false);
  const flatDistDiff = Math.abs(flatOn.distZ - flatOff.distZ);
  const flatSpeedDiff = Math.abs(flatOn.speedKmh - flatOff.speedKmh);

  const slopeGrade = 0.16;
  const sinA = slopeGrade / Math.hypot(1, slopeGrade);
  const cosA = 1 / Math.hypot(1, slopeGrade);
  const steepUp = new (await import('three')).Vector3(0, cosA, -sinA);
  const steepAdapter = {
    ...createFlatTrackAdapter(1.0),
    querySurfaceAt: (x: number, z: number) => ({
      t: (((z % 4000) + 4000) % 4000) / 4000,
      absDistance: Math.abs(x),
      signedLateral: x,
      isBridge: false,
      centerPos: { x: 0, y: z * slopeGrade, z },
      tangent: { x: 0, y: sinA, z: cosA },
      right: { x: -1, y: 0, z: 0 },
      up: { x: 0, y: cosA, z: -sinA },
    }),
    groundHeightAt: (_x: number, _yRef: number, z: number) => z * slopeGrade,
    groundNormalAt: () => steepUp,
  };

  const climbSpeeds: string[] = [];
  let allClimbed = true;
  for (const carId of [
    'audi-r8-lms-evo',
    'mclaren-650s-gt3',
    'bmw-m4-gt3-evo',
    'bmw-m4-widebody',
  ] as const) {
    const eng = createFlatEngine(carId, steepAdapter);
    let tlm!: VehicleTelemetry;
    let minGnd = 4;
    for (let i = 0; i < 240; i++) {
      tlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, throttle: true, throttleVal: 1 },
        { ...DEFAULT_SIM_ASSISTS, hillClimbAssist: true },
        'dry',
      );
      minGnd = Math.min(minGnd, tlm.diagnostics.groundedCount);
    }
    const climbedOk =
      Number.isFinite(tlm.speedKmh) && tlm.speedKmh >= 75 && minGnd === 4;
    if (!climbedOk) allClimbed = false;
    climbSpeeds.push(`${VEHICLE_SPECS[carId].shortName.split(' ').pop()}=${Math.round(tlm.speedKmh)}km/h`);
  }

  const ok = flatDistDiff < 1e-6 && flatSpeedDiff < 1e-6 && allClimbed;
  record(
    'HILL-ASSIST',
    'Hill-climb assist flat-ground zero-delta parity & smooth 16% grade climb (all 4 cars)',
    ok,
    `flatΔdist=${flatDistDiff.toFixed(6)}m, flatΔv=${flatSpeedDiff.toFixed(6)}km/h, 16%climb=[${climbSpeeds.join(', ')}]`,
  );
}

{
  // ACTIVE-AERO: Deployed vs retracted downforce (Cl) and aerodynamic drag / top speed (Cd), plus OFF lock
  const runAeroStraight = (mode: 'manual' | 'off', deployed: boolean) => {
    const eng = createFlatEngine('audi-r8-lms-evo');
    const setup = {
      ...getDefaultCarSetup('audi-r8-lms-evo'),
      activeAeroEnabled: mode !== 'off',
      activeAeroMode: mode,
    };
    eng.setCarSetup(setup);
    eng.setAeroDeployed(deployed);
    let lastTlm!: VehicleTelemetry;
    for (let i = 0; i < 420; i++) {
      lastTlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, throttle: true, throttleVal: 1 },
        DEFAULT_SIM_ASSISTS,
        'dry',
      );
    }
    return lastTlm;
  };

  const dfTlm = runAeroStraight('manual', true);
  const drsTlm = runAeroStraight('manual', false);
  const offTlmA = runAeroStraight('off', true);
  const offTlmB = runAeroStraight('off', false);

  const dfProj = computeProjectedCarMetrics(
    VEHICLE_SPECS['audi-r8-lms-evo'],
    { ...getDefaultCarSetup('audi-r8-lms-evo'), activeAeroEnabled: true, activeAeroMode: 'manual' },
    getDefaultVisualCustomization('audi-r8-lms-evo'),
    { aeroDeployed: true },
  );
  const drsProj = computeProjectedCarMetrics(
    VEHICLE_SPECS['audi-r8-lms-evo'],
    { ...getDefaultCarSetup('audi-r8-lms-evo'), activeAeroEnabled: true, activeAeroMode: 'manual' },
    getDefaultVisualCustomization('audi-r8-lms-evo'),
    { aeroDeployed: false },
  );

  const ok =
    dfTlm.aeroDeployed === true &&
    drsTlm.aeroDeployed === false &&
    dfTlm.downforceKgf > drsTlm.downforceKgf * 1.35 &&
    drsTlm.speedKmh > dfTlm.speedKmh + 4 &&
    Math.abs(offTlmA.downforceKgf - offTlmB.downforceKgf) < 1e-4 &&
    Math.abs(offTlmA.speedKmh - offTlmB.speedKmh) < 1e-4 &&
    dfProj.downforceKgf250 > drsProj.downforceKgf250 * 1.4 &&
    dfProj.dragCdA > drsProj.dragCdA * 1.25;

  record(
    'ACTIVE-AERO',
    'Active Aero deployed downforce vs DRS flat speed delta, OFF lock & live CdA/kgf projection',
    ok,
    `DF(${Math.round(dfTlm.downforceKgf)}kgf @ ${dfTlm.speedKmh.toFixed(1)}km/h, proj=${dfProj.dragCdA.toFixed(3)}CdA/${dfProj.downforceKgf250}kgf) vs DRS(${Math.round(drsTlm.downforceKgf)}kgf @ ${drsTlm.speedKmh.toFixed(1)}km/h, proj=${drsProj.dragCdA.toFixed(3)}CdA/${drsProj.downforceKgf250}kgf), offΔ=${Math.abs(offTlmA.speedKmh - offTlmB.speedKmh).toFixed(4)}`,
  );
}

{
  // ROSTER-26: Verify all 26 active playable cars launch, compute finite telemetry, and evaluate PP cleanly
  const carSummaries: string[] = [];
  const hasAllNew = (
    [
      'cadillac-v-series-r',
      'mercedes-amg-gt3-evo',
      'mclaren-f1-gtr-longtail',
      'ferrari-f40-lbwk',
      'ferrari-250-testa-rossa',
      'mazda-787b',
      'honda-ra272-f1',
      'vw-golf-gti-mk2',
      'toyota-ae86-trueno',
    ] as const
  ).every((cid) => (ALL_ACTIVE_CAR_IDS as readonly string[]).includes(cid));
  const hasRemoved =
    (ALL_ACTIVE_CAR_IDS as readonly string[]).includes('corvette-z06-gt3r') ||
    (ALL_ACTIVE_CAR_IDS as readonly string[]).includes('kralzfiller-lmh') ||
    (ALL_ACTIVE_CAR_IDS as readonly string[]).includes('de-tomaso-p72');
  let allOk = ALL_ACTIVE_CAR_IDS.length === 26 && hasAllNew && !hasRemoved;
  for (const id of ALL_ACTIVE_CAR_IDS) {
    const eng = createFlatEngine(id);
    let tlm!: VehicleTelemetry;
    for (let i = 0; i < 180; i++) {
      tlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, throttle: true, throttleVal: 1 },
        DEFAULT_SIM_ASSISTS,
        'dry',
      );
    }
    const pp = computePerformancePoints(id, getDefaultCarSetup(id));
    const okCar =
      Number.isFinite(tlm.speedKmh) &&
      tlm.speedKmh > 40 &&
      tlm.diagnostics.groundedCount === 4 &&
      Number.isFinite(pp.pp) &&
      pp.pp >= 420;
    if (!okCar) allOk = false;
    carSummaries.push(`${VEHICLE_SPECS[id].shortName}:${Math.round(tlm.speedKmh)}km/h/${pp.pp.toFixed(0)}PP`);
  }
  // Verify FWD Golf GTI Mk2 couples front driven axle & RA272 reaches >10,500 RPM
  const raEff = computeEffectiveSpecs(VEHICLE_SPECS['honda-ra272-f1'], getDefaultCarSetup('honda-ra272-f1'));
  const golfSpec = VEHICLE_SPECS['vw-golf-gti-mk2'];
  const drivetrainOk = raEff.redlineRpm >= 12800 && raEff.massKg <= 510 && golfSpec.frontDriveFrac === 1.0 && golfSpec.rearDriveFrac === 0.0;
  if (!drivetrainOk) allOk = false;
  record(
    'ROSTER-26',
    'All 26 active file-backed cars launch, FWD Golf Mk2 & 13k RPM RA272 physics/PP verified',
    allOk,
    carSummaries.join(', '),
  );
}

{
  // PURE-CUSTOMISATION: Cosmetics have zero physics delta; performance parts/weight/wheels/aero shift telemetry & PP
  const testId = 'honda-s2000' as const;
  const baseSetup = getDefaultCarSetup(testId);
  const stockVisual = getDefaultVisualCustomization(testId);
  const paintOnlyVisual = {
    ...stockVisual,
    paintHex: '#ff00aa',
    paintFinish: 'matte' as const,
    wrapPattern: 'racing_stripe' as const,
    decalStyle: 'full_race' as const,
    caliperHex: '#22c55e',
    windowTintOpacity: 0.72,
  };
  const aeroWheelModVisual = {
    ...paintOnlyVisual,
    frontAero: 'canards' as const,
    rearDiffuser: 'gt3_diffuser' as const,
    rearWingSize: 'gt_high' as const,
    wheelOffsetMm: 18,
  };
  const moddedSetup = {
    ...baseSetup,
    equippedParts: {
      ...(baseSetup.equippedParts ?? {}),
      intake: 'intake_highflow',
      exhaust: 'exhaust_ti_race',
      ecu_turbo: 'ecu_big_turbo',
      brakes: 'brakes_ccm_410',
      weight: 'weight_dry_carbon',
      wheels: 'wheels_gt3_wide_19',
    },
  };

  const runStraight = (setup: ReturnType<typeof getDefaultCarSetup>, visual: ReturnType<typeof getDefaultVisualCustomization>) => {
    const eng = createFlatEngine(testId);
    eng.setCarSetup(setup);
    eng.setVisualCustomization(visual);
    let lastTlm!: VehicleTelemetry;
    for (let i = 0; i < 360; i++) {
      lastTlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, throttle: true, throttleVal: 1 },
        DEFAULT_SIM_ASSISTS,
        'dry',
      );
    }
    return lastTlm;
  };

  const tlmStock = runStraight(baseSetup, stockVisual);
  const tlmPaint = runStraight(baseSetup, paintOnlyVisual);
  const tlmModded = runStraight(moddedSetup, aeroWheelModVisual);

  const ppStock = computePerformancePoints(testId, baseSetup, stockVisual);
  const ppPaint = computePerformancePoints(testId, baseSetup, paintOnlyVisual);
  const ppModded = computePerformancePoints(testId, moddedSetup, aeroWheelModVisual);
  const effModded = computeEffectiveSpecs(VEHICLE_SPECS[testId], moddedSetup, aeroWheelModVisual);
  const zeroLocks = PARTS_CATALOG.every((p) => p.costCredits === 0);

  const ok =
    zeroLocks &&
    Math.abs(tlmStock.speedKmh - tlmPaint.speedKmh) < 1e-4 &&
    Math.abs(tlmStock.downforceKgf - tlmPaint.downforceKgf) < 1e-4 &&
    Math.abs(ppStock.pp - ppPaint.pp) < 1e-4 &&
    tlmModded.speedKmh > tlmStock.speedKmh + 8 &&
    tlmModded.downforceKgf > tlmStock.downforceKgf + 25 &&
    effModded.massKg < VEHICLE_SPECS[testId].massKg - 130 &&
    ppModded.pp > ppStock.pp + 45;

  record(
    'PURE-CUSTOMISATION',
    'Zero locks + cosmetics zero-delta + non-cosmetic parts impact speed, mass, DF, PP',
    ok,
    `zeroLocks=${zeroLocks}, paintΔ=${Math.abs(tlmStock.speedKmh - tlmPaint.speedKmh).toFixed(4)}km/h, stock=${tlmStock.speedKmh.toFixed(1)}km/h(${ppStock.pp.toFixed(0)}PP) -> mod=${tlmModded.speedKmh.toFixed(1)}km/h(${ppModded.pp.toFixed(0)}PP, ${Math.round(effModded.massKg)}kg)`,
  );
}

{
  // TUNING-IMPACT: Verify every tuning setup slider & parts category changes real vehicle dynamics
  const carId = 'audi-r8-lms-evo' as const;
  const stockSetup = getDefaultCarSetup(carId);

  const runCornerTest = (setupOverride: Partial<typeof stockSetup>) => {
    const eng = createFlatEngine(carId);
    eng.setCarSetup({ ...stockSetup, ...setupOverride });
    eng.setStateForTest({ vz: 28, gear: 3, countdownTimer: 0 });
    let lastTlm!: VehicleTelemetry;
    for (let i = 0; i < 60; i++) {
      lastTlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, steerAxis: 0.45, throttle: true, throttleVal: 0.7 },
        DEFAULT_SIM_ASSISTS,
        'dry',
      );
    }
    return { tlm: lastTlm, eng };
  };

  const runBrakeTest = (setupOverride: Partial<typeof stockSetup>) => {
    const eng = createFlatEngine(carId);
    eng.setCarSetup({ ...stockSetup, ...setupOverride });
    eng.setStateForTest({ vz: 38, gear: 4, countdownTimer: 0 });
    let lastTlm!: VehicleTelemetry;
    for (let i = 0; i < 45; i++) {
      lastTlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, brake: true, brakeVal: 1.0 },
        DEFAULT_SIM_ASSISTS,
        'dry',
      );
    }
    return lastTlm;
  };

  const runStraightTest = (setupOverride: Partial<typeof stockSetup>) => {
    const eng = createFlatEngine(carId);
    eng.setCarSetup({ ...stockSetup, ...setupOverride });
    let lastTlm!: VehicleTelemetry;
    for (let i = 0; i < 240; i++) {
      lastTlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, throttle: true, throttleVal: 1.0 },
        DEFAULT_SIM_ASSISTS,
        'dry',
      );
    }
    return { tlm: lastTlm, eng };
  };

  const baseCorner = runCornerTest({});
  const stiffRollCorner = runCornerTest({
    frontSpringNmm: 195,
    rearSpringNmm: 185,
    antiRollFront: 1.5,
    antiRollRear: 1.5,
    rideHeightMm: 45,
  });
  const aeroCorner = runCornerTest({ downforceFrontScale: 1.35, downforceRearScale: 1.35 });
  const gripCamCorner = runCornerTest({
    camberFrontDeg: -3.4,
    tirePressureFrontPsi: 31,
    tireGripTrim: 1.12,
    weightDistributionFrontPct: 48,
  });

  const baseStraight = runStraightTest({});
  const boostGearStraight = runStraightTest({
    ecuBoostScale: 1.15,
    revLimitOffsetRpm: 450,
    finalDriveRatio: 4.1,
    gearRatioScale: 0.9,
  });

  const baseBrake = runBrakeTest({ brakeBalance: 5 });
  const rearBiasBrake = runBrakeTest({ brakeBalance: -5 });

  const baseRollTransfer = Math.abs(baseCorner.tlm.diagnostics.cornerFzN[0] - baseCorner.tlm.diagnostics.cornerFzN[1]);
  const stiffRollTransfer = Math.abs(stiffRollCorner.tlm.diagnostics.cornerFzN[0] - stiffRollCorner.tlm.diagnostics.cornerFzN[1]);
  const rollChanged =
    Math.abs(stiffRollTransfer - baseRollTransfer) > 10 ||
    Math.abs(stiffRollCorner.tlm.bodyHeave - baseCorner.tlm.bodyHeave) > 1e-4;
  const dfChanged = aeroCorner.tlm.downforceKgf > baseCorner.tlm.downforceKgf + 20;
  const gripChanged = Math.abs(gripCamCorner.tlm.latG - baseCorner.tlm.latG) > 1e-3;
  const powerGearChanged =
    Math.abs(boostGearStraight.tlm.speedKmh - baseStraight.tlm.speedKmh) > 1.0 ||
    Math.abs(boostGearStraight.tlm.rpm - baseStraight.tlm.rpm) > 150;
  const brakeBiasChanged =
    Math.abs(rearBiasBrake.diagnostics.cornerFzN[0] - baseBrake.diagnostics.cornerFzN[0]) > 5 ||
    Math.abs(rearBiasBrake.speedKmh - baseBrake.speedKmh) > 0.1;

  // Verify every non-OEM parts category modifies effective specs or PP
  const partsDeltaCategories: string[] = [];
  for (const cat of ['intake', 'exhaust', 'ecu_turbo', 'cooling', 'suspension', 'brakes', 'drivetrain', 'wheels', 'weight', 'aero'] as const) {
    const altPart = PARTS_CATALOG.find((p) => p.category === cat && !p.id.includes('oem'));
    if (!altPart) continue;
    const modSetup = {
      ...stockSetup,
      equippedParts: { ...(stockSetup.equippedParts ?? {}), [cat]: altPart.id },
    };
    const pp0 = computePerformancePoints(carId, stockSetup);
    const pp1 = computePerformancePoints(carId, modSetup);
    const eff0 = computeEffectiveSpecs(VEHICLE_SPECS[carId], stockSetup);
    const eff1 = computeEffectiveSpecs(VEHICLE_SPECS[carId], modSetup);
    const changed =
      Math.abs(pp1.pp - pp0.pp) > 0.01 ||
      Math.abs(eff1.maxPowerWatts - eff0.maxPowerWatts) > 1 ||
      Math.abs(eff1.massKg - eff0.massKg) > 0.01 ||
      Math.abs(eff1.springStiffMult - eff0.springStiffMult) > 0.001 ||
      Math.abs(eff1.maxBrakeForce - eff0.maxBrakeForce) > 1 ||
      Math.abs(eff1.coolingRateMult - eff0.coolingRateMult) > 0.001 ||
      Math.abs(eff1.downforceRearMult - eff0.downforceRearMult) > 0.001;
    if (changed) partsDeltaCategories.push(cat);
  }

  const ok =
    rollChanged &&
    dfChanged &&
    gripChanged &&
    powerGearChanged &&
    brakeBiasChanged &&
    partsDeltaCategories.length === 10;

  record(
    'TUNING-IMPACT',
    'All 10 part categories & setup sliders (springs, ARB, height, camber, PSI, aero, ECU, gears, brake bias) alter physics',
    ok,
    `roll/height=${rollChanged}, df=${dfChanged}(+${Math.round(aeroCorner.tlm.downforceKgf - baseCorner.tlm.downforceKgf)}kgf), grip=${gripChanged}, ecu/gear=${powerGearChanged}, brakeBias=${brakeBiasChanged}, partCats=${partsDeltaCategories.length}/10`,
  );
}

const failed = rows.filter((r) => !r.passed);
console.log(`\nSummary: ${rows.length - failed.length}/${rows.length} checks passed.`);
assert.equal(failed.length, 0, `${failed.length} physics check(s) failed`);

