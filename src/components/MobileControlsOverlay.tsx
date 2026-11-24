import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Compass,
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { MobileControlsInput, VehicleTelemetry } from '../engine/SceneController';

export type MobileVisibilityMode = 'auto' | 'always' | 'off';
export type MobileSteerMode = 'arrows' | 'wheel' | 'slider' | 'tilt';

interface MobileControlsOverlayProps {
  visible: boolean;
  steerMode: MobileSteerMode;
  steerSensitivity?: number;
  autoGas?: boolean;
  gearLabel: string;
  autoGear?: boolean;
  subscribeTelemetry?: (listener: (tlm: VehicleTelemetry) => void) => () => void;
  onShiftUp?: () => void;
  onShiftDown?: () => void;
  onSteerModeChange: (mode: MobileSteerMode) => void;
  onAutoGasChange?: (enabled: boolean) => void;
  onInputChange: (input: MobileControlsInput) => void;
}

export const MobileControlsOverlay = memo(function MobileControlsOverlay({
  visible,
  steerMode,
  steerSensitivity = 1.0,
  autoGas = false,
  gearLabel,
  autoGear = true,
  subscribeTelemetry,
  onShiftUp,
  onShiftDown,
  onSteerModeChange,
  onAutoGasChange,
  onInputChange,
}: MobileControlsOverlayProps) {
  const [throttleDown, setThrottleDown] = useState(false);
  const [brakeDown, setBrakeDown] = useState(false);
  const [handbrakeDown, setHandbrakeDown] = useState(false);
  const [leftDown, setLeftDown] = useState(false);
  const [rightDown, setRightDown] = useState(false);
  const [arrowAxis, setArrowAxis] = useState(0);
  const [wheelAxis, setWheelAxis] = useState(0);
  const [sliderAxis, setSliderAxis] = useState(0);
  const [tiltAxis, setTiltAxis] = useState(0);
  const [tiltCenterDeg, setTiltCenterDeg] = useState<number | null>(null);
  const [tiltPermissionState, setTiltPermissionState] = useState<
    'unknown' | 'granted' | 'denied' | 'unavailable'
  >('unknown');
  const [liveGearLabel, setLiveGearLabel] = useState(gearLabel);

  useEffect(() => {
    setLiveGearLabel(gearLabel);
  }, [gearLabel]);

  useEffect(() => {
    if (!visible || !subscribeTelemetry) return;
    return subscribeTelemetry((tlm) => {
      const nextGear = tlm.gear <= 0 ? (tlm.gear === -1 ? 'R' : 'N') : String(tlm.gear);
      setLiveGearLabel((prev) => (prev === nextGear ? prev : nextGear));
    });
  }, [visible, subscribeTelemetry]);

  const clampedSens = Math.max(0.5, Math.min(2.0, steerSensitivity));

  const wheelRef = useRef<HTMLDivElement | null>(null);
  const wheelPointerIdRef = useRef<number | null>(null);
  const wheelDragStartXRef = useRef(0);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const sliderPointerIdRef = useRef<number | null>(null);
  const arrowAxisRef = useRef(0);
  const latestRawTiltDegRef = useRef(0);
  const hasTiltSampleRef = useRef(false);
  const onInputChangeRef = useRef(onInputChange);
  onInputChangeRef.current = onInputChange;

  // Progressive digital arrow steering calibrated by steerSensitivity (0.50x - 2.00x)
  useEffect(() => {
    if (!visible || steerMode !== 'arrows') {
      arrowAxisRef.current = 0;
      setArrowAxis(0);
      return;
    }

    const rawDir = (leftDown ? 1 : 0) - (rightDown ? 1 : 0);
    const arrowCap = clampedSens < 1.0 ? 0.55 + 0.45 * clampedSens : 1.0;
    const target = rawDir * arrowCap;

    if (Math.abs(arrowAxisRef.current - target) < 0.004) {
      if (arrowAxisRef.current !== target) {
        arrowAxisRef.current = target;
        setArrowAxis(target);
      }
      return;
    }

    let rafId = 0;
    let lastTime = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const cur = arrowAxisRef.current;
      const releasing = rawDir === 0 || target * cur < 0 || Math.abs(target) < Math.abs(cur);
      const rate = releasing
        ? 12.0 + clampedSens * 4.0
        : clampedSens >= 1.85
          ? 24.0
          : 1.6 + clampedSens * 4.8;
      const diff = target - cur;
      const maxDelta = rate * dt;

      if (Math.abs(diff) <= maxDelta) {
        arrowAxisRef.current = target;
        setArrowAxis(target);
        return;
      }

      const next = cur + Math.sign(diff) * maxDelta;
      arrowAxisRef.current = next;
      setArrowAxis(next);
      rafId = window.requestAnimationFrame(step);
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [visible, steerMode, leftDown, rightDown, clampedSens]);

  const computeSteerAxis = useCallback((): number => {
    if (steerMode === 'arrows') {
      return arrowAxis;
    }
    if (steerMode === 'wheel') {
      return wheelAxis;
    }
    if (steerMode === 'slider') {
      return sliderAxis;
    }
    return tiltAxis;
  }, [steerMode, arrowAxis, wheelAxis, sliderAxis, tiltAxis]);

  useEffect(() => {
    if (!visible) {
      setThrottleDown(false);
      setBrakeDown(false);
      setHandbrakeDown(false);
      setLeftDown(false);
      setRightDown(false);
      setArrowAxis(0);
      arrowAxisRef.current = 0;
      setWheelAxis(0);
      setSliderAxis(0);
      onInputChangeRef.current({
        throttleVal: 0,
        brakeVal: 0,
        steerAxis: 0,
        handbrakeVal: 0,
        lookBack: false,
      });
      return;
    }
    const effectiveThrottle = autoGas ? (brakeDown || handbrakeDown ? 0 : 1) : throttleDown ? 1 : 0;
    onInputChangeRef.current({
      throttleVal: effectiveThrottle,
      brakeVal: brakeDown ? 1 : 0,
      steerAxis: computeSteerAxis(),
      handbrakeVal: handbrakeDown ? 1 : 0,
      lookBack: false,
    });
  }, [visible, autoGas, throttleDown, brakeDown, handbrakeDown, computeSteerAxis]);

  useEffect(() => {
    if (!visible || steerMode !== 'tilt') {
      setTiltAxis(0);
      return;
    }

    hasTiltSampleRef.current = false;
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setTiltPermissionState('unavailable');
      return;
    }

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null && e.gamma === null) return;
      hasTiltSampleRef.current = true;
      const isLandscape = window.innerWidth >= window.innerHeight;
      const rawDeg = isLandscape ? (e.beta ?? 0) : (e.gamma ?? 0);
      latestRawTiltDegRef.current = rawDeg;
      const center = tiltCenterDeg ?? 0;
      const delta = rawDeg - center;
      const deadzone = Math.max(1.8, Math.min(3.8, 3.0 / Math.sqrt(clampedSens)));
      const maxAngle = Math.max(12, Math.min(54, 30 / clampedSens));
      if (Math.abs(delta) < deadzone) {
        setTiltAxis(0);
      } else {
        const norm = (delta - Math.sign(delta) * deadzone) / (maxAngle - deadzone);
        setTiltAxis(Math.max(-1, Math.min(1, -norm)));
      }
      setTiltPermissionState('granted');
    };

    window.addEventListener('deviceorientation', handleOrientation);
    const watchdog = window.setTimeout(() => {
      if (!hasTiltSampleRef.current) {
        setTiltPermissionState((prev) => (prev === 'denied' ? 'denied' : 'unavailable'));
      }
    }, 1500);

    return () => {
      window.clearTimeout(watchdog);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [visible, steerMode, tiltCenterDeg, clampedSens]);

  const requestTiltPermissionAndCalibrate = async () => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setTiltPermissionState('unavailable');
      return;
    }
    const DeviceOrientationAny = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof DeviceOrientationAny?.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationAny.requestPermission();
        setTiltPermissionState(res);
        if (res === 'granted') {
          setTiltCenterDeg(latestRawTiltDegRef.current);
        }
      } catch {
        setTiltPermissionState('denied');
      }
    } else {
      setTiltCenterDeg(latestRawTiltDegRef.current);
      if (hasTiltSampleRef.current) {
        setTiltPermissionState('granted');
      } else {
        setTiltPermissionState('unavailable');
      }
    }
  };

  if (!visible) return null;

  const wheelDeg = -wheelAxis * 118;
  const wheelAnglePct = Math.min(100, Math.round(Math.abs(wheelAxis) * 100));
  const tiltMaxDeg = Math.round(Math.max(12, Math.min(54, 30 / clampedSens)));

  return (
    <div
      data-testid="mobile-controls-overlay"
      className="pointer-events-none fixed inset-0 z-30 flex h-[100dvh] flex-col justify-end p-1.5 select-none desktop:p-4"
      style={{
        touchAction: 'none',
        paddingTop: 'max(0.35rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.4rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.4rem, env(safe-area-inset-right))',
      }}
    >
      {/* Side Manual Shift Stack (Visible only in Manual Transmission mode) */}
      {!autoGear && onShiftUp && onShiftDown && (
        <div
          data-testid="mobile-manual-shift-side"
          className="pointer-events-auto fixed top-[44%] z-35 flex -translate-y-1/2 flex-col items-center border border-sky-400/35 bg-[#070b12]/24 p-0.5"
          style={{ right: 'max(0.4rem, env(safe-area-inset-right))' }}
        >
          <button
            type="button"
            aria-label="Shift Up"
            onPointerDown={(e) => {
              e.preventDefault();
              onShiftUp();
            }}
            style={{ touchAction: 'none' }}
            className="flex h-11 w-11 landscape-short:h-10 landscape-short:w-10 flex-col items-center justify-center border border-sky-400/40 bg-[#070b12]/24 text-sky-300 active:bg-sky-500/38 active:text-white"
          >
            <ChevronUp className="h-4 w-4" />
            <span className="font-mono-tabular text-[8px] font-bold leading-none uppercase">
              UP
            </span>
          </button>

          <div className="font-mono-tabular py-1 text-[10px] font-bold tracking-wider text-white/95">
            G{liveGearLabel}
          </div>

          <button
            type="button"
            aria-label="Shift Down"
            onPointerDown={(e) => {
              e.preventDefault();
              onShiftDown();
            }}
            style={{ touchAction: 'none' }}
            className="flex h-11 w-11 landscape-short:h-10 landscape-short:w-10 flex-col items-center justify-center border border-amber-400/40 bg-[#070b12]/24 text-amber-300 active:bg-amber-500/38 active:text-white"
          >
            <ChevronDown className="h-4 w-4" />
            <span className="font-mono-tabular text-[8px] font-bold leading-none uppercase">
              DN
            </span>
          </button>
        </div>
      )}

      {/* Bottom Ergonomic Translucent Motorsport Multi-Touch Deck */}
      <div className="flex items-end justify-between gap-2 pb-0.5">
        {/* LEFT THUMB ZONE: Primary Steering Surface */}
        <div className="pointer-events-auto relative flex flex-col items-start">
          {steerMode === 'arrows' && (
            <div className="flex items-center gap-1.5 desktop:gap-2.5">
              <button
                type="button"
                aria-label="Steer Left"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setLeftDown(true);
                }}
                onPointerUp={() => setLeftDown(false)}
                onPointerCancel={() => setLeftDown(false)}
                onLostPointerCapture={() => setLeftDown(false)}
                style={{ touchAction: 'none' }}
                className={`relative flex h-14 w-[62px] landscape-short:h-12 landscape-short:w-14 flex-col items-center justify-center border-2 transition-transform duration-75 desktop:h-16 desktop:w-[74px] ${
                  leftDown
                    ? 'scale-[0.96] border-sky-400/90 bg-sky-500/35 text-white shadow-[0_0_16px_rgba(56,189,248,0.35)]'
                    : 'border-white/28 bg-[#070b12]/24 text-slate-100/95'
                }`}
              >
                <span
                  className={`absolute top-0 inset-x-0 h-0.5 ${
                    leftDown ? 'bg-sky-300' : 'bg-white/25'
                  }`}
                />
                <ArrowLeft className="h-5 w-5" />
                <span className="font-mono-tabular text-[8.5px] font-bold tracking-widest text-slate-200/90 uppercase">
                  LEFT
                </span>
              </button>

              <button
                type="button"
                aria-label="Steer Right"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setRightDown(true);
                }}
                onPointerUp={() => setRightDown(false)}
                onPointerCancel={() => setRightDown(false)}
                onLostPointerCapture={() => setRightDown(false)}
                style={{ touchAction: 'none' }}
                className={`relative flex h-14 w-[62px] landscape-short:h-12 landscape-short:w-14 flex-col items-center justify-center border-2 transition-transform duration-75 desktop:h-16 desktop:w-[74px] ${
                  rightDown
                    ? 'scale-[0.96] border-sky-400/90 bg-sky-500/35 text-white shadow-[0_0_16px_rgba(56,189,248,0.35)]'
                    : 'border-white/28 bg-[#070b12]/24 text-slate-100/95'
                }`}
              >
                <span
                  className={`absolute top-0 inset-x-0 h-0.5 ${
                    rightDown ? 'bg-sky-300' : 'bg-white/25'
                  }`}
                />
                <ArrowRight className="h-5 w-5" />
                <span className="font-mono-tabular text-[8.5px] font-bold tracking-widest text-slate-200/90 uppercase">
                  RIGHT
                </span>
              </button>
            </div>
          )}

          {steerMode === 'wheel' && (
            <div className="flex items-end gap-2">
              <div
                ref={wheelRef}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  wheelPointerIdRef.current = e.pointerId;
                  wheelDragStartXRef.current = e.clientX;
                }}
                onPointerMove={(e) => {
                  if (wheelPointerIdRef.current !== e.pointerId) return;
                  const dx = e.clientX - wheelDragStartXRef.current;
                  const next = Math.max(-1, Math.min(1, (-dx * clampedSens) / 52));
                  setWheelAxis(next);
                }}
                onPointerUp={(e) => {
                  if (wheelPointerIdRef.current === e.pointerId) {
                    wheelPointerIdRef.current = null;
                    setWheelAxis(0);
                  }
                }}
                onPointerCancel={() => {
                  wheelPointerIdRef.current = null;
                  setWheelAxis(0);
                }}
                onLostPointerCapture={() => {
                  wheelPointerIdRef.current = null;
                  setWheelAxis(0);
                }}
                style={{ touchAction: 'none' }}
                className={`relative flex h-[92px] w-[92px] landscape-short:h-[78px] landscape-short:w-[78px] items-center justify-center border-2 p-1.5 desktop:h-28 desktop:w-28 ${
                  Math.abs(wheelAxis) > 0.05
                    ? 'border-sky-400/80 bg-[#070d16]/34'
                    : 'border-white/24 bg-[#070b12]/22'
                }`}
              >
                <svg
                  viewBox="0 0 120 120"
                  className="h-full w-full opacity-85 transition-transform duration-75"
                  style={{ transform: `rotate(${wheelDeg.toFixed(1)}deg)` }}
                >
                  <circle cx="60" cy="60" r="48" fill="none" stroke="#0f172a" strokeOpacity="0.45" strokeWidth="12" />
                  <circle cx="60" cy="60" r="48" fill="none" stroke="#cbd5e1" strokeOpacity="0.8" strokeWidth="7.5" />
                  <path
                    d="M 16 42 A 48 48 0 0 0 16 78"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="9"
                    strokeOpacity="0.5"
                  />
                  <path
                    d="M 104 42 A 48 48 0 0 1 104 78"
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="9"
                    strokeOpacity="0.5"
                  />
                  <rect x="55" y="6" width="10" height="14" fill="#38bdf8" />
                  <line x1="16" y1="60" x2="104" y2="60" stroke="#94a3b8" strokeOpacity="0.7" strokeWidth="7" />
                  <line x1="60" y1="60" x2="60" y2="104" stroke="#94a3b8" strokeOpacity="0.7" strokeWidth="7" />
                  <circle cx="60" cy="60" r="15" fill="#07090d" fillOpacity="0.55" stroke="#38bdf8" strokeWidth="2.5" />
                  <circle cx="60" cy="60" r="4" fill="#f59e0b" />
                </svg>

                <span className="font-mono-tabular pointer-events-none absolute right-1.5 bottom-1 text-[8.5px] font-bold text-sky-300">
                  {wheelAnglePct > 2 ? `${wheelAxis > 0 ? 'L' : 'R'}${wheelAnglePct}%` : 'DRAG'}
                </span>
              </div>
            </div>
          )}

          {steerMode === 'slider' && (
            <div className="flex flex-col gap-1">
              <div
                ref={sliderRef}
                role="slider"
                aria-label="Analog Touch Steering Slider"
                aria-valuemin={-100}
                aria-valuemax={100}
                aria-valuenow={Math.round(-sliderAxis * 100)}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  sliderPointerIdRef.current = e.pointerId;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const norm = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
                  setSliderAxis(Math.max(-1, Math.min(1, -norm * clampedSens)));
                }}
                onPointerMove={(e) => {
                  if (sliderPointerIdRef.current !== e.pointerId) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const norm = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
                  setSliderAxis(Math.max(-1, Math.min(1, -norm * clampedSens)));
                }}
                onPointerUp={(e) => {
                  if (sliderPointerIdRef.current === e.pointerId) {
                    sliderPointerIdRef.current = null;
                    setSliderAxis(0);
                  }
                }}
                onPointerCancel={() => {
                  sliderPointerIdRef.current = null;
                  setSliderAxis(0);
                }}
                onLostPointerCapture={() => {
                  sliderPointerIdRef.current = null;
                  setSliderAxis(0);
                }}
                style={{ touchAction: 'none' }}
                className={`relative flex h-14 w-[148px] min-[540px]:w-[172px] landscape-short:h-12 items-center justify-center border-2 px-2 ${
                  Math.abs(sliderAxis) > 0.04
                    ? 'border-sky-400/85 bg-[#08111e]/34'
                    : 'border-white/24 bg-[#070b12]/22'
                }`}
              >
                <div className="relative h-2 w-full bg-white/15">
                  <div className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-white/50" />
                  <div
                    className="absolute top-0 h-full bg-sky-400/75"
                    style={{
                      left: sliderAxis >= 0 ? `${50 - sliderAxis * 45}%` : '50%',
                      width: `${Math.abs(sliderAxis) * 45}%`,
                    }}
                  />
                </div>
                <div
                  className="pointer-events-none absolute top-1/2 flex h-10 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 border-sky-300/90 bg-[#0d1c2e]/45"
                  style={{ left: `${50 - sliderAxis * 42}%` }}
                >
                  <div className="h-4 w-0.5 bg-sky-300" />
                </div>
                <div className="font-mono-tabular pointer-events-none absolute inset-x-2 bottom-1 flex items-center justify-between text-[8px] font-bold text-slate-300 uppercase">
                  <span>L</span>
                  <span className="text-sky-300">
                    {Math.abs(sliderAxis) > 0.04
                      ? `${sliderAxis > 0 ? 'L' : 'R'}${Math.round(Math.abs(sliderAxis) * 100)}%`
                      : 'SLIDE STEER'}
                  </span>
                  <span>R</span>
                </div>
              </div>
            </div>
          )}

          {steerMode === 'tilt' && (
            <div className="flex w-[166px] min-[540px]:w-[180px] flex-col gap-1.5 border border-white/24 bg-[#070b12]/24 p-2.5">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider text-sky-300 uppercase">
                  <Compass className="h-3.5 w-3.5" />
                  <span>Gyro</span>
                </span>
                <button
                  type="button"
                  onClick={requestTiltPermissionAndCalibrate}
                  className="h-9 border border-sky-400/60 bg-sky-500/20 px-2.5 text-[10px] font-bold text-sky-200 uppercase whitespace-nowrap shrink-0"
                >
                  {tiltPermissionState === 'unknown' ? 'Enable' : 'Zero'}
                </button>
              </div>
              {tiltPermissionState === 'denied' || tiltPermissionState === 'unavailable' ? (
                <div className="space-y-1.5">
                  <p className="text-[9.5px] leading-snug text-amber-200">
                    {tiltPermissionState === 'denied' ? 'Gyro blocked:' : 'No gyro sensor:'}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSteerModeChange('wheel')}
                      className="h-9 border border-sky-400/60 bg-sky-500/20 px-2 text-[10px] font-bold text-white uppercase"
                    >
                      Wheel
                    </button>
                    <button
                      type="button"
                      onClick={() => onSteerModeChange('arrows')}
                      className="h-9 border border-white/25 bg-white/10 px-2 text-[10px] font-bold text-white uppercase"
                    >
                      Arrows
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative h-2.5 w-full bg-white/15">
                    <div className="absolute top-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-white/45" />
                    <div
                      className="absolute top-0 h-full w-3.5 -translate-x-1/2 bg-amber-400"
                      style={{ left: `${50 - tiltAxis * 44}%` }}
                    />
                  </div>
                  <div className="font-mono-tabular flex items-center justify-between text-[9px] text-slate-300">
                    <span>±{tiltMaxDeg}° LOCK</span>
                    <span className="font-bold text-white">{Math.round(-tiltAxis * 100)}%</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* RIGHT THUMB ZONE: Translucent Movement Pedals (Handbrake + Brake/Reverse + Gas/Forward) */}
        <div className="pointer-events-auto flex items-end gap-1 desktop:gap-2">
          <button
            type="button"
            aria-label="Handbrake"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setHandbrakeDown(true);
            }}
            onPointerUp={() => setHandbrakeDown(false)}
            onPointerCancel={() => setHandbrakeDown(false)}
            onLostPointerCapture={() => setHandbrakeDown(false)}
            style={{ touchAction: 'none' }}
            className={`relative flex h-12 w-10 landscape-short:h-11 landscape-short:w-10 flex-col items-center justify-center border-2 font-mono-tabular text-[9.5px] font-bold uppercase transition-transform duration-75 desktop:h-14 desktop:w-12 ${
              handbrakeDown
                ? 'scale-[0.96] border-amber-400/90 bg-amber-500/38 text-white shadow-[0_0_14px_rgba(245,158,11,0.35)]'
                : 'border-amber-400/50 bg-[#070b12]/24 text-amber-300/95'
            }`}
          >
            <span
              className={`absolute top-0 inset-x-0 h-0.5 ${
                handbrakeDown ? 'bg-amber-300' : 'bg-amber-400/45'
              }`}
            />
            <span>HB</span>
            <span className="text-[7px] opacity-80">DRFT</span>
          </button>

          <button
            type="button"
            aria-label="Brake and Reverse"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              setBrakeDown(true);
            }}
            onPointerUp={() => setBrakeDown(false)}
            onPointerCancel={() => setBrakeDown(false)}
            onLostPointerCapture={() => setBrakeDown(false)}
            style={{ touchAction: 'none' }}
            className={`relative flex h-14 w-[50px] landscape-short:h-12 landscape-short:w-12 flex-col items-center justify-center border-2 font-display text-[10px] font-bold uppercase transition-transform duration-75 desktop:h-16 desktop:w-16 ${
              brakeDown
                ? 'scale-[0.96] border-rose-400/90 bg-rose-500/40 text-white shadow-[0_0_16px_rgba(244,63,94,0.38)]'
                : 'border-rose-500/60 bg-[#070b12]/24 text-rose-300/95'
            }`}
          >
            <span
              className={`absolute top-0 inset-x-0 h-1 ${
                brakeDown ? 'bg-rose-300' : 'bg-rose-500/65'
              }`}
            />
            <ArrowDown className="h-4 w-4" />
            <span className="leading-none mt-0.5">BRK</span>
            <span className="font-mono-tabular text-[7.5px] opacity-85">REV</span>
          </button>

          {autoGas ? (
            <button
              type="button"
              aria-label="Auto Gas Active"
              onClick={() => onAutoGasChange?.(false)}
              style={{ touchAction: 'none' }}
              className="relative flex h-[62px] w-[54px] landscape-short:h-14 landscape-short:w-14 flex-col items-center justify-center border-2 border-emerald-400/75 bg-emerald-500/22 font-display text-[9.5px] font-bold uppercase text-emerald-100 desktop:h-20 desktop:w-[72px]"
            >
              <span className="absolute top-0 inset-x-0 h-1 bg-emerald-300/85" />
              <ArrowUp className="h-4 w-4" />
              <span>AUTO</span>
              <span className="font-mono-tabular mt-0.5 text-[8px] text-emerald-200">
                GAS·G{liveGearLabel}
              </span>
            </button>
          ) : (
            <button
              type="button"
              aria-label="Gas Throttle Forward"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                setThrottleDown(true);
              }}
              onPointerUp={() => setThrottleDown(false)}
              onPointerCancel={() => setThrottleDown(false)}
              onLostPointerCapture={() => setThrottleDown(false)}
              style={{ touchAction: 'none' }}
              className={`relative flex h-[62px] w-[54px] landscape-short:h-14 landscape-short:w-14 flex-col items-center justify-center border-2 font-display text-[10.5px] font-bold uppercase transition-transform duration-75 desktop:h-20 desktop:w-[72px] ${
                throttleDown
                  ? 'scale-[0.96] border-emerald-400/90 bg-emerald-500/40 text-white shadow-[0_0_18px_rgba(52,211,153,0.38)]'
                  : 'border-emerald-500/65 bg-[#070b12]/24 text-emerald-300/95'
              }`}
            >
              <span
                className={`absolute top-0 inset-x-0 h-1 ${
                  throttleDown ? 'bg-emerald-300' : 'bg-emerald-500/70'
                }`}
              />
              <ArrowUp className="h-4 w-4" />
              <span className="leading-none mt-0.5">GAS</span>
              <span className="font-mono-tabular mt-0.5 text-[8px] text-slate-200/90 desktop:text-[10px]">
                FWD·G{liveGearLabel}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
