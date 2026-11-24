import { CheckCircle2, ChevronLeft, ChevronRight, Compass, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GARAGE_CARS } from '../data/garageCars';
import { AppScreenMode, VehicleTelemetry } from '../engine/SceneController';

interface SpotlightStep {
  id: string;
  selector: string;
  title: string;
  subtitle: string;
  body: string;
  hint: string;
}

function getGarageSpotlightSteps(isMobileTouch: boolean): SpotlightStep[] {
  const carCount = GARAGE_CARS.length;
  return [
    {
      id: 'showroom',
      selector: '[data-tutorial="tutorial-showroom"]',
      title: `Showroom, ${carCount} Cars & Full Spec Sheet`,
      subtitle: 'Step 1 of 8 · Garage & Vehicle Specs',
      body: isMobileTouch
        ? `Swipe or tap the bay arrows (or All ${carCount}) to switch between all ${carCount} GT, Prototype, Hypercar, and Rally machines. Tap Specs anytime to view full engine, aero, fuel mileage, and tire wear specs.`
        : `Browse all ${carCount} vehicles via All Cars (${carCount}) or the bay arrows. Every car displays its complete powertrain, downforce, braking, dimensions, fuel mileage (km/L & range), and tire wear rate live.`,
      hint: 'Each car has unique fuel economy and front/rear tire wear characteristics.',
    },
    {
      id: 'tuning',
      selector: '[data-tutorial="tutorial-tune-btn"]',
      title: 'Tuning Shop & Active Aero',
      subtitle: 'Step 2 of 8 · Upgrades & Setup',
      body: isMobileTouch
        ? 'Open Tune & Setup to upgrade parts, apply liveries, and choose Fixed, Manual, or Auto Active Aero. Changes update live HP, weight, downforce, and PP.'
        : 'Open Tune & Setup for engine/aero upgrades, paint & liveries, and Fixed, Manual, or Auto Active Aero. Preview wing deployment live on the turntable or toggle with X on track.',
      hint: 'Auto Active Aero boosts corner downforce and flattens into low-drag DRS on straights.',
    },
    {
      id: 'englab',
      selector: '[data-tutorial="tutorial-englab-btn"]',
      title: 'Engineering Lab & Telemetry',
      subtitle: 'Step 3 of 8 · Dyno & Stint Strategy',
      body: 'Inspect live power curves, suspension travel, brake balance, and fuel/tire stint forecasts in the Engineering Lab before locking in your race setup.',
      hint: 'Use Test Mode to verify infinite-fuel lap pace or simulate full race stints.',
    },
    {
      id: 'events',
      selector: '[data-tutorial="tutorial-events-tab"]',
      title: 'Race Modes & Stint Planner',
      subtitle: 'Step 4 of 8 · Events & Mileage Strategy',
      body: 'Switch to Race Setup to choose Time Trial, AI Sprint, Endurance (2.25x tire wear), or Drift Attack — and review your car’s L/Lap, tank range, and tire stint life.',
      hint: 'Plan pit stops around both fuel tank range and tire wear limits.',
    },
    {
      id: 'builder',
      selector: '[data-tutorial="tutorial-build-btn"]',
      title: 'Custom Maps & Track Builder',
      subtitle: 'Step 5 of 8 · Circuits & Editor',
      body: isMobileTouch
        ? 'Tap Build to sculpt custom circuits with elevation and banking, or Custom to drive community & user blueprints.'
        : 'Click Build Map to create custom circuits with elevation, curbs, and scenery, or Custom to configure track width and elevation.',
      hint: 'Every custom circuit automatically supports full AI rivals, weather, and lap timing.',
    },
    {
      id: 'social',
      selector: '[data-tutorial="tutorial-social-btn"]',
      title: 'Live Parties & Leaderboards',
      subtitle: 'Step 6 of 8 · Multiplayer & Ranks',
      body: 'Join or host live multiplayer Party lobbies, explore shared community tracks, add friends, and compare lap records on circuit leaderboards.',
      hint: 'Earn CR credits from every race finish to expand your upgrades.',
    },
    {
      id: 'settings',
      selector: '[data-tutorial="tutorial-settings-btn"]',
      title: 'Key Settings: Device, Graphics & Controls',
      subtitle: 'Step 7 of 8 · Core Settings Highlights',
      body: 'Inside Settings, switch Device Mode (Auto / Mobile / Laptop), pick one of 6 Graphics tiers for smooth FPS, choose Touch Steering (Arrows, Wheel, Slider, or Tilt) with optional Auto-Gas, or enable Manual gears & Driving Assists.',
      hint: 'You can also toggle individual HUD widgets or change driving cameras anytime.',
    },
    {
      id: 'launch',
      selector: '[data-tutorial="tutorial-start-btn"]',
      title: 'Ready for the Starting Grid',
      subtitle: 'Step 8 of 8 · On-Track Coach Next',
      body: 'Choose a circuit (from Aurelia Ridge to Kestrel Peaks or Frostpeak Pass) and launch the session. The On-Track Coach will walk you through Lap 1 essentials.',
      hint: 'Tap Start whenever you are ready — you can replay this tour anytime in Settings.',
    },
  ];
}

interface CoachObjective {
  id: string;
  title: string;
  instruction: string;
  badge: string;
}

function getOnTrackCoachSteps(isMobileTouch: boolean): CoachObjective[] {
  return [
    {
      id: 'launch',
      title: 'Coach 1/4 · Smooth Launch',
      instruction: isMobileTouch
        ? 'Wait for green lights, then hold GAS (bottom-right) or use Auto-Gas to accelerate past 55 km/h.'
        : 'Wait for green lights, then apply throttle (W / Up Arrow) to accelerate past 55 km/h.',
      badge: 'TARGET: 55+ KM/H',
    },
    {
      id: 'corner',
      title: 'Coach 2/4 · Apex & Manual/Assists',
      instruction: isMobileTouch
        ? 'Tap BRK before Turn 1 and steer with your Touch layout. Toggle Eye icon at top-right anytime for clean UI view.'
        : 'Brake smoothly before Turn 1 (S / Down Arrow) and steer through the apex (A / D). Press H or tap the Eye icon for clean view.',
      badge: 'TARGET: TURN & STEER',
    },
    {
      id: 'climb_surface',
      title: 'Coach 3/4 · Surfaces, Fuel & Tire Wear',
      instruction:
        'Listen to tire audio morph across tarmac, curbs, and alpine surfaces while watching fuel burn & tire wear rates — box in Pit Lane when low.',
      badge: 'DRIVE & MONITOR',
    },
    {
      id: 'aero_toggle',
      title: 'Coach 4/4 · Active Aero Mode',
      instruction: isMobileTouch
        ? 'Tap the side AERO button to toggle High-Downforce cornering vs. Low-Drag DRS top speed.'
        : 'Press X (or tap the HUD AERO button) to toggle High-Downforce cornering and Low-Drag DRS speed.',
      badge: isMobileTouch ? 'TAP AERO BUTTON' : 'PRESS X / TAP AERO',
    },
  ];
}

interface RectBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface UserTutorialOverlayProps {
  active: boolean;
  appMode: AppScreenMode;
  preRaceIntroActive: boolean;
  telemetry: VehicleTelemetry;
  isMobileTouch?: boolean;
  onComplete: () => void;
  onDismiss: () => void;
}

export function UserTutorialOverlay({
  active,
  appMode,
  preRaceIntroActive,
  telemetry,
  isMobileTouch = false,
  onComplete,
  onDismiss,
}: UserTutorialOverlayProps) {
  const [garageStepIdx, setGarageStepIdx] = useState(0);
  const [coachIdx, setCoachIdx] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<RectBox | null>(null);
  const [initialAeroState, setInitialAeroState] = useState<boolean | null>(null);
  const climbProgressDistRef = useRef(0);
  const [coachStalledNudge, setCoachStalledNudge] = useState(false);

  const garageSteps = useMemo(() => getGarageSpotlightSteps(isMobileTouch), [isMobileTouch]);
  const coachSteps = useMemo(() => getOnTrackCoachSteps(isMobileTouch), [isMobileTouch]);

  // Measure target element bounding rect cleanly during garage spotlight tour
  useEffect(() => {
    if (!active || appMode !== 'garage') {
      setSpotlightRect((prev) => (prev === null ? prev : null));
      return;
    }
    const step = garageSteps[garageStepIdx];
    let observedEl: HTMLElement | null = null;
    let resizeObs: ResizeObserver | null = null;
    let settleRaf = 0;

    const measure = () => {
      const candidates = Array.from(
        document.querySelectorAll(step?.selector ?? ''),
      ) as HTMLElement[];
      const el =
        candidates.find((c) => {
          const rect = c.getBoundingClientRect();
          return rect.width > 4 && rect.height > 4;
        }) ?? null;
      if (!el) {
        setSpotlightRect((prev) => (prev === null ? prev : null));
        return;
      }
      if (el !== observedEl && typeof ResizeObserver !== 'undefined') {
        resizeObs?.disconnect();
        resizeObs = new ResizeObserver(measure);
        resizeObs.observe(el);
        observedEl = el;
      }
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const nextLeft = Math.round(Math.max(4, Math.min(vw - 24, r.left - 6)));
      const nextTop = Math.round(Math.max(4, Math.min(vh - 24, r.top - 6)));
      const nextWidth = Math.round(Math.min(vw - nextLeft - 4, r.width + 12));
      const nextHeight = Math.round(Math.min(vh - nextTop - 4, r.height + 12));
      setSpotlightRect((prev) => {
        if (
          prev &&
          prev.top === nextTop &&
          prev.left === nextLeft &&
          prev.width === nextWidth &&
          prev.height === nextHeight
        ) {
          return prev;
        }
        return { top: nextTop, left: nextLeft, width: nextWidth, height: nextHeight };
      });
    };

    measure();
    settleRaf = window.requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, { passive: true, capture: true });
    return () => {
      if (settleRaf) window.cancelAnimationFrame(settleRaf);
      resizeObs?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, { capture: true });
    };
  }, [active, appMode, garageStepIdx, garageSteps]);

  // 12-second inactivity nudge if player ignores or skips a coach step
  useEffect(() => {
    setCoachStalledNudge(false);
    if (!active || appMode !== 'racing' || preRaceIntroActive) return;
    const timer = window.setTimeout(() => {
      setCoachStalledNudge(true);
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [active, appMode, preRaceIntroActive, coachIdx]);

  // Reset initial aero snapshot when reaching coach step 4
  useEffect(() => {
    if (appMode === 'racing' && coachIdx === 3 && initialAeroState === null) {
      setInitialAeroState(telemetry.aeroDeployed);
    }
  }, [appMode, coachIdx, initialAeroState, telemetry.aeroDeployed]);

  // Auto-advance On-Track Coach steps from live telemetry
  useEffect(() => {
    if (!active || appMode !== 'racing' || preRaceIntroActive || telemetry.countdownSec > 0) {
      return;
    }
    if (coachIdx === 0 && telemetry.speedKmh >= 55) {
      setCoachIdx(1);
    } else if (
      coachIdx === 1 &&
      telemetry.speedKmh >= 30 &&
      (Math.abs(telemetry.steerNorm) > 0.24 || Math.abs(telemetry.latG) > 0.42)
    ) {
      climbProgressDistRef.current = 0;
      setCoachIdx(2);
    } else if (coachIdx === 2) {
      if (
        Math.abs(telemetry.slopeGradePct) >= 3.5 ||
        telemetry.audioSurface !== 'asphalt' ||
        climbProgressDistRef.current > 22
      ) {
        setCoachIdx(3);
        setInitialAeroState(telemetry.aeroDeployed);
      } else if (telemetry.speedKmh > 35) {
        climbProgressDistRef.current += 1;
      }
    } else if (
      coachIdx === 3 &&
      initialAeroState !== null &&
      telemetry.aeroDeployed !== initialAeroState
    ) {
      onComplete();
    }
  }, [
    active,
    appMode,
    preRaceIntroActive,
    telemetry.countdownSec,
    telemetry.speedKmh,
    telemetry.steerNorm,
    telemetry.latG,
    telemetry.slopeGradePct,
    telemetry.audioSurface,
    telemetry.aeroDeployed,
    coachIdx,
    initialAeroState,
    onComplete,
  ]);

  if (!active) return null;

  // Phase 1: Garage Interactive Spotlight Tour
  if (appMode === 'garage') {
    const step = garageSteps[garageStepIdx] ?? garageSteps[0];
    const isLastGarage = garageStepIdx >= garageSteps.length - 1;

    // Position the tour card cleanly beside or opposite the spotlight rect
    const cardRightAligned = spotlightRect ? spotlightRect.left < window.innerWidth * 0.45 : false;

    return (
      <div className="pointer-events-none fixed inset-0 z-40">
        {spotlightRect && (
          <div
            className="pointer-events-none fixed border-2 border-sky-400 shadow-[0_0_0_9999px_rgba(3,6,12,0.58)] transition-all duration-200"
            style={{
              top: spotlightRect.top,
              left: spotlightRect.left,
              width: spotlightRect.width,
              height: spotlightRect.height,
            }}
          />
        )}

        <div
          className={`pointer-events-auto gt5-panel gt5-carbon fixed bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.75rem))] landscape-short:bottom-3 sm:bottom-20 z-50 w-[min(94vw,390px)] max-h-[75dvh] overflow-y-auto border border-sky-400/60 shadow-2xl ${
            cardRightAligned
              ? 'left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-6'
              : 'left-1/2 -translate-x-1/2'
          }`}
        >
          <div className="gt5-horizon-rule" />
          <div className="flex items-center justify-between gap-2 border-b border-white/12 bg-black/55 px-3.5 py-2.5 sm:px-4">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 text-sky-400 shrink-0" />
              <span className="font-mono-tabular text-[11px] font-bold tracking-wider text-sky-300 uppercase truncate">
                {step.subtitle}
              </span>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Skip Tutorial"
              className="inline-flex h-9 sm:h-auto items-center gap-1 border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] sm:text-[10px] font-semibold text-slate-300 hover:text-white whitespace-nowrap shrink-0"
            >
              <X className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
              <span>Skip Tour</span>
            </button>
          </div>

          <div className="p-3.5 sm:p-4">
            <h3 className="font-display text-sm sm:text-base font-bold tracking-wide text-white uppercase">
              {step.title}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-200">{step.body}</p>
            <div className="mt-2.5 border border-sky-400/25 bg-sky-500/10 px-2.5 py-1.5 text-[11px] text-sky-200">
              {step.hint}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {garageSteps.map((s, idx) => (
                  <span
                    key={s.id}
                    className={`h-1.5 w-4 sm:w-5 ${
                      idx === garageStepIdx
                        ? 'bg-sky-400'
                        : idx < garageStepIdx
                        ? 'bg-emerald-400'
                        : 'bg-white/15'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {garageStepIdx > 0 && (
                  <button
                    type="button"
                    onClick={() => setGarageStepIdx((i) => Math.max(0, i - 1))}
                    className="inline-flex h-10 sm:h-auto items-center gap-1 border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-white/30 whitespace-nowrap shrink-0"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Back</span>
                  </button>
                )}
                {!isLastGarage ? (
                  <button
                    type="button"
                    onClick={() =>
                      setGarageStepIdx((i) =>
                        Math.min(garageSteps.length - 1, i + 1),
                      )
                    }
                    className="inline-flex h-10 sm:h-auto items-center gap-1 bg-sky-500 px-3.5 py-1.5 font-display text-xs font-bold text-slate-950 uppercase hover:bg-sky-400 whitespace-nowrap shrink-0"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onDismiss}
                    className="inline-flex h-10 sm:h-auto items-center gap-1 border border-emerald-400/70 bg-emerald-500/20 px-3.5 py-1.5 font-display text-xs font-bold text-emerald-200 uppercase hover:bg-emerald-500/30 whitespace-nowrap shrink-0"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Ready to Drive</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Phase 2: Live On-Track Coach (Lap 1)
  if (appMode === 'racing' && !preRaceIntroActive) {
    const obj = coachSteps[coachIdx] ?? coachSteps[0];
    return (
      <div className="pointer-events-none fixed top-[max(4.5rem,calc(env(safe-area-inset-top)+3.75rem))] landscape-short:top-12 sm:top-20 left-1/2 z-30 -translate-x-1/2">
        <div className="pointer-events-auto gt5-panel flex w-[min(94vw,460px)] items-start justify-between gap-2.5 sm:gap-3 border border-sky-400/55 bg-[#060b12]/94 px-3 py-2 sm:px-4 sm:py-2.5 shadow-2xl">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Compass className="h-3.5 w-3.5 text-sky-400 shrink-0" />
              <span className="font-display text-xs font-bold tracking-wider text-white uppercase">
                {obj.title}
              </span>
              <span className="font-mono-tabular border border-sky-400/40 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold text-sky-300 uppercase">
                {obj.badge}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-200">{obj.instruction}</p>
            {coachStalledNudge && (
              <p className="mt-1 text-[10px] text-amber-300">
                Driving freely? Tap Next Tip or Finish anytime to dismiss this tip.
              </p>
            )}
            <div className="mt-2 flex items-center gap-1.5">
              {coachSteps.map((c, idx) => (
                <div
                  key={c.id}
                  className={`h-1 flex-1 ${
                    idx < coachIdx
                      ? 'bg-emerald-400'
                      : idx === coachIdx
                      ? 'bg-sky-400'
                      : 'bg-white/12'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onComplete}
              aria-label="End Coach"
              className="h-8 sm:h-auto border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-slate-300 hover:text-white whitespace-nowrap shrink-0"
            >
              Finish
            </button>
            {coachIdx < coachSteps.length - 1 && (
              <button
                type="button"
                onClick={() => setCoachIdx((i) => Math.min(coachSteps.length - 1, i + 1))}
                className="h-8 sm:h-auto px-1.5 text-[10px] font-semibold text-sky-300 hover:underline whitespace-nowrap shrink-0"
              >
                Next Tip
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
