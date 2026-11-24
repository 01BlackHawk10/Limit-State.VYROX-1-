import * as THREE from 'three';
import type { AnyCarSpecId } from '../shared/carTypes';
import {
  COORDINATE_FRAME_CONTRACT,
  PhysicsEnvironmentAdapter,
  PhysicsSurfaceSample,
  VehicleAssists,
  VehicleControlsInput,
  VehiclePhysicsEngine,
  VehicleTelemetry,
} from './vehiclePhysics';

export interface SelfTestCaseResult {
  id: string;
  label: string;
  passed: boolean;
  metric: string;
}

export interface SelfTestSuiteResult {
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  durationMs: number;
  results: SelfTestCaseResult[];
}

export const IDLE_INPUT: VehicleControlsInput = {
  throttle: false,
  brake: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
  lookBack: false,
  throttleVal: 0,
  brakeVal: 0,
  steerAxis: 0,
  handbrakeVal: 0,
};

export const DEFAULT_SIM_ASSISTS: VehicleAssists = {
  autoGear: true,
  abs: true,
  tcs: true,
  steerSensitivity: 1.0,
  autoPitService: false,
  ffbIntensity: 0.75,
  physicsPreset: 'simulation',
};

const UP_Y = new THREE.Vector3(0, 1, 0);

/**
 * Infinite flat tarmac testbed (Y = 0 plane, roadHalfWidth = 5000 m so skidpad circles never leave tarmac)
 */
export function createFlatTrackAdapter(gripScale = 1.0): PhysicsEnvironmentAdapter {
  const sample: PhysicsSurfaceSample = {
    t: 0.1,
    absDistance: 0,
    signedLateral: 0,
    isBridge: false,
    centerPos: { x: 0, y: 0, z: 0 },
    tangent: { x: 0, y: 0, z: 1 },
    right: { x: -1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  };
  return {
    totalLength: 4000,
    roadHalfWidth: 5000,
    gripScale,
    kerbHeightScale: 1.0,
    skipCollisions: true,
    querySurfaceAt: (_x: number, z: number) => {
      sample.t = (((z % 4000) + 4000) % 4000) / 4000;
      sample.absDistance = 0;
      sample.signedLateral = 0;
      sample.centerPos.z = z;
      return sample;
    },
    groundHeightAt: () => 0,
    groundNormalAt: () => UP_Y,
  };
}

/**
 * Synthetic launch ramp testbed: flat until z = 10 m, rises smoothly up to z = 28 m (y = 3.2 m),
 * then drops straight down to y = 0 for clean airborne launch & free-flight testing.
 */
export function createRampTrackAdapter(): PhysicsEnvironmentAdapter {
  const sample: PhysicsSurfaceSample = {
    t: 0.1,
    absDistance: 0,
    signedLateral: 0,
    isBridge: false,
    centerPos: { x: 0, y: 0, z: 0 },
    tangent: { x: 0, y: 0, z: 1 },
    right: { x: -1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  };
  const rampSlope = 3.2 / 18;
  const normLen = Math.hypot(rampSlope, 1);
  const rampNorm = new THREE.Vector3(0, 1 / normLen, -rampSlope / normLen);
  const rampTan = { x: 0, y: rampSlope / normLen, z: 1 / normLen };

  const heightFn = (z: number): number => {
    if (z <= 10) return 0;
    if (z <= 28) return (z - 10) * rampSlope;
    return 0;
  };

  return {
    totalLength: 4000,
    roadHalfWidth: 5000,
    gripScale: 1.0,
    kerbHeightScale: 1.0,
    skipCollisions: true,
    querySurfaceAt: (_x: number, z: number) => {
      const h = heightFn(z);
      sample.t = (((z % 4000) + 4000) % 4000) / 4000;
      sample.absDistance = 0;
      sample.signedLateral = 0;
      sample.centerPos.y = h;
      sample.centerPos.z = z;
      if (z > 10 && z <= 28) {
        sample.tangent = rampTan;
        sample.up = { x: rampNorm.x, y: rampNorm.y, z: rampNorm.z };
      } else {
        sample.tangent = { x: 0, y: 0, z: 1 };
        sample.up = { x: 0, y: 1, z: 0 };
      }
      return sample;
    },
    groundHeightAt: (_x: number, _yRef: number, z: number) => heightFn(z),
    groundNormalAt: (_x: number, z: number) => (z > 10 && z <= 28 ? rampNorm : UP_Y),
  };
}

export function createFlatEngine(
  carId: AnyCarSpecId = 'mclaren-650s-gt3',
  adapter: PhysicsEnvironmentAdapter = createFlatTrackAdapter(),
): VehiclePhysicsEngine {
  const eng = new VehiclePhysicsEngine(adapter);
  eng.setCarModel(carId);
  eng.setStateForTest({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    omega: 0,
    gear: 1,
    countdownTimer: 0,
  });
  return eng;
}

/**
 * Fast synchronous Built-in Self-Test (BIST) runnable directly from the Diagnostics HUD or CLI.
 */
export function runQuickPhysicsSelfTests(): SelfTestSuiteResult {
  const tStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const results: SelfTestCaseResult[] = [];

  // 1. Axis Convention & Yaw Sign (+Z forward, +X left => +steer turns toward +omega / +yaw)
  {
    const eng = createFlatEngine('mclaren-650s-gt3');
    eng.setStateForTest({ vz: 20, yaw: 0, gear: 3, rpm: 5500, countdownTimer: 0 });
    const startYaw = eng.yaw;
    let tlm!: VehicleTelemetry;
    for (let i = 0; i < 30; i++) {
      tlm = eng.step(1 / 60, { ...IDLE_INPUT, steerLeft: true, steerAxis: 0.65, throttleVal: 0.2 }, DEFAULT_SIM_ASSISTS, 'dry');
    }
    const deltaYaw = eng.yaw - startYaw;
    const passed =
      COORDINATE_FRAME_CONTRACT.leftAxis === '+X' &&
      eng.steerAngleFL > eng.steerAngleFR &&
      eng.steerAngleFR > 0 &&
      eng.omega > 0.1 &&
      deltaYaw > 0.04 &&
      tlm.latG > 0.2;
    results.push({
      id: 'axis_yaw_sign',
      label: 'Axis & Ackermann Sign (+steer → +ω/+latG)',
      passed,
      metric: `Δψ=+${deltaYaw.toFixed(3)}rad, FL=${(eng.steerAngleFL * 57.3).toFixed(1)}° > FR=${(eng.steerAngleFR * 57.3).toFixed(1)}°`,
    });
  }

  // 2. Substep Force Averaging & 0–100 km/h Launch
  {
    const eng = createFlatEngine('mclaren-650s-gt3');
    let timeTo100: number | null = null;
    let tlm!: VehicleTelemetry;
    for (let i = 1; i <= 360; i++) {
      tlm = eng.step(1 / 60, { ...IDLE_INPUT, throttle: true, throttleVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
      if (timeTo100 === null && tlm.speedKmh >= 100) {
        timeTo100 = i / 60;
        break;
      }
    }
    const passed =
      tlm.diagnostics.substepsPerChassis === 8 &&
      tlm.diagnostics.tireSubstepHz === 960 &&
      timeTo100 !== null &&
      timeTo100 >= 2.2 &&
      timeTo100 <= 3.8;
    results.push({
      id: 'substep_0_100',
      label: '960Hz Substep Averaging & 0–100 km/h',
      passed,
      metric: timeTo100 !== null ? `${timeTo100.toFixed(2)}s (${tlm.diagnostics.tireSubstepHz}Hz)` : 'Did not reach 100 km/h',
    });
  }

  // 3. Standstill S + Space Dither Check
  {
    const eng = createFlatEngine('mclaren-650s-gt3');
    let maxSpeed = 0;
    for (let i = 0; i < 120; i++) {
      const tlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, brake: true, brakeVal: 1, handbrake: true, handbrakeVal: 1 },
        DEFAULT_SIM_ASSISTS,
        'dry',
      );
      if (tlm.speedMps > maxSpeed) maxSpeed = tlm.speedMps;
    }
    const passed = maxSpeed < 1e-4;
    results.push({
      id: 'standstill_dither',
      label: 'Standstill Hold (S + Space No Dither)',
      passed,
      metric: `max |v|=${maxSpeed.toExponential(2)} m/s`,
    });
  }

  // 4. Airborne Grounded Gate (ESC = 0 Nm & Zero Air Yaw Spin)
  {
    const eng = createFlatEngine('mclaren-650s-gt3', createRampTrackAdapter());
    eng.setStateForTest({ x: 0, y: 0, z: 8, vx: 0, vy: 0, vz: 32, yaw: 0, omega: 0, gear: 3, countdownTimer: 0 });
    let minGrounded = 4;
    let airEscMax = 0;
    let airFrames = 0;
    let firstAirOmega: number | null = null;
    let lastAirOmega = 0;
    for (let i = 0; i < 70; i++) {
      const steerInput = eng.pos.z > 27.5 ? 0.9 : 0.0;
      const tlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, steerLeft: steerInput > 0, steerAxis: steerInput, throttleVal: 0.4 },
        { ...DEFAULT_SIM_ASSISTS, physicsPreset: 'simcade' },
        'dry',
      );
      if (tlm.diagnostics.groundedCount < minGrounded) minGrounded = tlm.diagnostics.groundedCount;
      if (tlm.diagnostics.groundedCount === 0) {
        airFrames++;
        if (firstAirOmega === null) firstAirOmega = eng.omega;
        lastAirOmega = eng.omega;
      }
      if (tlm.diagnostics.groundedCount < 3) {
        airEscMax = Math.max(airEscMax, Math.abs(tlm.diagnostics.escTorqueNm));
      }
    }
    const deltaAirOmega = firstAirOmega !== null ? Math.abs(lastAirOmega - firstAirOmega) : 99;
    const passed = minGrounded === 0 && airFrames >= 8 && airEscMax === 0 && deltaAirOmega < 1e-4 && Math.abs(lastAirOmega) < 0.05;
    results.push({
      id: 'airborne_gate',
      label: 'Airborne Grounded >= 3 Gate (No Air Spin)',
      passed,
      metric: `airFrames=${airFrames}, airESC=${airEscMax}Nm, |Δω_air|=${deltaAirOmega.toExponential(1)}`,
    });
  }

  // 5. Reverse Engagement, 10 m/s Cap & Gear Transition Zeroing
  {
    const eng = createFlatEngine('mclaren-650s-gt3');
    let tlm!: VehicleTelemetry;
    for (let i = 0; i < 240; i++) {
      tlm = eng.step(1 / 60, { ...IDLE_INPUT, brake: true, brakeVal: 1 }, DEFAULT_SIM_ASSISTS, 'dry');
    }
    const maxRevMps = tlm.speedMps;
    const revGear = tlm.gear;
    const revKappa = tlm.tires.rl.kappa;
    // Shift back into forward gear and check clean slip transition
    const fwdTlm = eng.step(
      1 / 60,
      { ...IDLE_INPUT, throttle: true, throttleVal: 1 },
      DEFAULT_SIM_ASSISTS,
      'dry',
    );
    const passed =
      revGear === -1 &&
      maxRevMps > 7.5 &&
      maxRevMps <= 10.15 &&
      revKappa <= 0.01 &&
      fwdTlm.speedMps <= maxRevMps;
    results.push({
      id: 'reverse_cap',
      label: 'Reverse Engagement & 10 m/s Speed Cap',
      passed,
      metric: `gear=${revGear}, v=${maxRevMps.toFixed(2)}m/s (${(maxRevMps * 3.6).toFixed(1)}km/h)`,
    });
  }

  // 6. Cornering Traction Stability (55% Steer High-Speed Skidpad)
  {
    const eng = createFlatEngine('mclaren-650s-gt3');
    eng.setStateForTest({ vz: 32, gear: 3, countdownTimer: 0 });
    let maxLatG = 0;
    let maxRearAlpha = 0;
    let tlm!: VehicleTelemetry;
    for (let i = 0; i < 120; i++) {
      tlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, steerLeft: true, steerAxis: 0.55, throttleVal: 0.65 },
        DEFAULT_SIM_ASSISTS,
        'dry',
      );
      maxLatG = Math.max(maxLatG, Math.abs(tlm.latG));
      maxRearAlpha = Math.max(maxRearAlpha, Math.abs(tlm.tires.rl.alphaDeg), Math.abs(tlm.tires.rr.alphaDeg));
    }
    const passed = maxLatG >= 1.25 && maxRearAlpha <= 14.0 && tlm.speedMps > 18;
    results.push({
      id: 'skidpad_traction',
      label: 'Cornering Traction (Planted Turn-In)',
      passed,
      metric: `${maxLatG.toFixed(2)}G · rear α≤${maxRearAlpha.toFixed(1)}°`,
    });
  }

  // 7. Manual Gear Redline & Speed Limiter (Gear 1 WOT caps RPM <= redline & speed <= gear1 Vmax)
  {
    const eng = createFlatEngine('bmw-m4-widebody');
    const manualAssists = { ...DEFAULT_SIM_ASSISTS, autoGear: false };
    let peakRpm = 0;
    let peakSpeedKmh = 0;
    let tlm!: VehicleTelemetry;
    for (let i = 0; i < 300; i++) {
      tlm = eng.step(
        1 / 60,
        { ...IDLE_INPUT, throttle: true, throttleVal: 1 },
        manualAssists,
        'dry',
      );
      if (tlm.rpm > peakRpm) peakRpm = tlm.rpm;
      if (tlm.speedKmh > peakSpeedKmh) peakSpeedKmh = tlm.speedKmh;
    }
    const passed =
      tlm.gear === 1 &&
      peakRpm <= tlm.redlineRpm + 2 &&
      tlm.gearMaxSpeedKmh > 40 &&
      peakSpeedKmh <= tlm.gearMaxSpeedKmh + 1.5 &&
      peakSpeedKmh >= tlm.gearMaxSpeedKmh - 4.0;
    results.push({
      id: 'gear_redline_cap',
      label: 'Gear Redline RPM & Speed Limiter',
      passed,
      metric: `G1 max=${peakSpeedKmh.toFixed(1)}/${tlm.gearMaxSpeedKmh}km/h, peakRPM=${peakRpm}/${tlm.redlineRpm}`,
    });
  }

  const tEnd = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const passedCount = results.filter((r) => r.passed).length;
  return {
    passedCount,
    totalCount: results.length,
    allPassed: passedCount === results.length,
    durationMs: Number((tEnd - tStart).toFixed(2)),
    results,
  };
}
