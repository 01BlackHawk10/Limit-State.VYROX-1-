# Implementation Plan — Performance, Mobile UX, Real Circuits, Active Aero & Audio Upgrade

## 1. Architectural Overview & Design Goals

This plan resolves the reported UI occlusion and Map Customizer bar regressions, dramatically trims mobile interface footprint, brings **Active Aero** and **Real-Time Surface Audio Filtering** directly into live driving, introduces **3 iconic real-world circuits** alongside a clean **Real / Custom** track selector, and transforms world rendering from full-map monolithic draw loads into **600m spatial chunk streaming** paired with performance-adaptive far fog, distant blur, a sharp Sun, and a distinct Moon.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         APPLICATION & RENDER FLOW                         │
├───────────────────────┬──────────────────────────┬────────────────────────┤
│  UI LAYER (Responsive)│  SIMULATION & AUDIO      │  WORLD & SKY STREAMING │
│                       │                          │                        │
│ • Ultra-minimal       │ • 60 Hz decoupled physics│ • 250m spatial chunks  │
│   Mobile HUD & Garage │   + Smooth Climb Assist  │   streamed within 600m │
│ • Persistent Custom   │ • Live In-Race Tuning +  │ • Heightfield & road   │
│   Map Top/Bottom Bars │   Active Aero Deploy/    │   bridge overpass check│
│ • Real / Custom Track │   Retract override       │ • Depth-masked far blur│
│   Category Switcher   │ • Surface Audio Filter   │   + adaptive Exp2 fog  │
│ • Mobile-aware Guide  │   (Asphalt/Curb/Gravel/  │ • Crisp SkyDome (No    │
│   & Settings Storage  │    Snow crossfades)      │   Fog/Blur): Sun + Moon│
└───────────────────────┴──────────────────────────┴────────────────────────┘
```

---

## 2. Mobile UI Miniaturization & Map Customizer Bar Fixes

### 2.1 Fixing the Disappearing Top & Bottom Bars in Map Customizer
- **Root Cause**:
  1. Entering the Map Customizer unmounts the Showroom top/bottom navigation chrome, and the customizer's own header packs title, tool toggle, horizontally wrapping track pills, and 4 action buttons into an `overflow-hidden` root container sized to `100dvh`. On narrow or short mobile/tablet viewports, wrapping pushes the bottom action bar off-screen or causes the scroll drawer to clip the header/footer.
  2. Pressing HUD toggle shortcuts or interacting while mobile viewport safe-areas are active leaves users without persistent exit/save/mode controls.
- **Fix Architecture**:
  - Guarantee **sticky, non-collapsing top and bottom bars** (`shrink-0`) inside a flex column locked to `100dvh` with `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` padding.
  - Keep the top bar ultra-compact in single-row height: Back to Garage button, Real/Custom category badge + compact track dropdown/pill selector (instead of overflowing buttons across the header), and collapsible Tools drawer toggle.
  - Anchor a persistent compact bottom bar containing: Camera Reset/Top-Down quick toggle, Reset Track, Discard/Exit, and Save & Race—always visible regardless of whether the side/bottom tool sheet is open or collapsed, and immune to HUD-hide shortcuts.

### 2.2 Ultra-Minimal Mobile UI (Garage & On-Track HUD)
Because small viewports must showcase the 3D car in the Garage and the apex/racing line while driving, mobile layouts (`< 640px` or coarse-pointer touch screens) will switch to an **Ultra-Minimal Compact Mode** while preserving desktop richness on larger screens:

```
MOBILE GARAGE (<640px)                    MOBILE DRIVING HUD (<640px)
┌──────────────────────────────────┐      ┌──────────────────────────────────┐
│ [Menu]   GT STUDIO  [Real][Race] │      │ [P] L1/3  0:42.18   [Aero][Tune] │
│                                  │      │                                  │
│                                  │      │                                  │
│         Unobstructed             │      │         Clear Track View         │
│         3D Car Viewport          │      │         & Racing Line            │
│         (>72% Open Canvas)       │      │         (Zero Clutter Top)       │
│                                  │      │                                  │
│ [Car] [Tune] [Look] [Track]      │      │ [◀][▶]     148 km/h [3]   [B][G] │
└──────────────────────────────────┘      └──────────────────────────────────┘
```

- **Showroom / Garage Miniaturization**:
  - Collapse top navigation into a single tiny `36px` bar (Menu drawer button, compact title, direct Track/Race pill) with zero wrapping rows.
  - Collapse bottom dock into a slim single-row icon+label strip (`Car`, `Tune`, `Paint`, `Track`, `Drive`) and hide verbose car spec cards behind a tap-to-peek info toggle so over 72% of the mobile viewport stays open on the car.
- **Ultra-Minimal Driving HUD on Mobile**:
  - Top bar reduced to tiny floating micro-pills: `[Pause]` + `Lap / Current Time` on the left, compact `[Aero]` + `[Tune]` + `[Cam]` triggers on the right.
  - **Hide secondary desktop telemetry cards** on narrow mobile viewports (`Tire & Fuel`, `MFD Dials`, `Best / Last / S1-S3 splits`, `Rubbering & Grip`, `Engine Health`), leaving only an ultra-compact bottom-center Speed + Gear + compact RPM bar tucked cleanly between shrunk driving controls.
- **Shrunk Touch Controls & Ergonomics**:
  - Reduce touch button visuals from oversized pads to crisp, compact controls (`40px–48px` buttons and compact gas/brake strips) anchored via `safe-area-inset` margins with `touch-action: none` so the car and track never sit under opaque chrome.
  - Support Tilt Steering with an explicit user-gesture permission prompt on iOS (`DeviceOrientationEvent.requestPermission()`) and automatic seamless fallback to Touch Arrows or Virtual Steering Dial if denied or unsupported.

---

## 3. Live In-Race Tuning Drawer & Active Aero Deploy/Retract Control

### 3.1 Mid-Race Tuning Access
- Currently, the Tuning & Performance Drawer only opens in Garage mode. We will enable opening the Tuning Drawer both in the **Garage** and **mid-race** (triggered cleanly from the Pause overlay, desktop shortcut, or compact `[Tune]` HUD button).
- Adjusting suspension, downforce, brake bias, differential, ECU trim, or Active Aero mid-race commits live setup updates to the active vehicle physics engine and persists per-car setups in local storage.

### 3.2 Dedicated Active Aero Deploy / Retract Toggle
- Add a prominent, dedicated **Active Aero** control module at the top of the Tuning Drawer's Aero & Drivetrain view (as well as synced quick-access state during driving):
  1. **System Behavior Mode**: `Off` (Fixed Aero), `Manual` (Player Controlled), or `Auto` (High-Downforce in corners / Low-Drag DRS on straights).
  2. **Manual Deploy / Retract Wing & Splitter Switch**: Allows the player to immediately **Deploy High Downforce** or **Retract for Top Speed (DRS)** on the fly during a race. Tapping Deploy/Retract when currently in `Auto` seamlessly switches into `Manual` override for crisp, predictable driver control—matching physical force changes (`Cd` drag reduction vs. `Cl` downforce increase) on the next physics step.
  3. **Visual & Physics Parity Across All Cars**:
     - Cars with articulated rear wings and front splitter flaps (e.g., McLaren Ultimate VGT, McLaren 650S GT3, BMW M4 GT3 Evo) animate smoothly toward the target deployed/retracted angle.
     - Street/widebody vehicles without articulated wing hinges (e.g., BMW M4 Widebody) still receive active underbody diffuser / grille shutter aero modulation and show a clear badge (`Active Underbody / Shutter Aero`) inside the Tuning Drawer so no control feels broken or silent.
  4. Active Aero mode and state persist per selected car across sessions.

---

## 4. Real-Time Surface Material Audio Filter in Physics Pipeline

### 4.1 Physics-to-Audio Signal Architecture
The physics engine will classify real-time contact surface state cleanly and drive a zero-click, low-CPU Web Audio filter chain:

```
┌───────────────────────────┐     ┌─────────────────────────────────────────┐
│  VEHICLE PHYSICS STEP     │     │          WEB AUDIO PIPELINE             │
│                           │     │                                         │
│ • Ground Contact Check    │     │  Engine Harmonics ──► Resonance EQ ──┐  │
│   ├─ Asphalt (dry / wet)  │     │    (Exhaust + Intake) (Snow Muffler/ │  │
│   ├─ Curb (sawtooth/rumble├────►│                        Asphalt Bite) │  │
│   ├─ Gravel (loose stone) │     │                                      ├─►├─► Master
│   └─ Snow (packed/powder) │     │  Road & Tire Noise ─► Multi-Band     │  │   Limiter
│ • Wheel Slip & Speed      │     │    (Pink/Brown +       Surface Filter┘  │
│ • Smooth Transition Blend │     │     Rumble Osc + Grain)                 │
└───────────────────────────┘     └─────────────────────────────────────────┘
```

### 4.2 Surface Material Acoustic Profiles
- **Asphalt**: Crisp tire tread hiss (`1.4–2.6 kHz` bandpass scaling with speed and wetness) and unobstructed engine/exhaust midrange clarity; rain increases high-frequency spray shimmer (`> 4 kHz`).
- **Curb (Rumble Strip)**: Injects a speed-locked low-frequency sawtooth/square rumble pulse (`28–95 Hz` modulated by wheel speed and lateral curb overlap) coupled with suspension knock resonance.
- **Gravel**: Broadens bandpass noise into irregular mid-high granular bursts (`1.8–4.8 kHz` stochastic amplitude jitter proportional to slip & speed) simulating loose stones striking wheel arches, while slightly damping low-end chassis thump.
- **Snow**: Applies a warm low-pass absorption filter (`450–900 Hz` cutoff on road noise and soft exhaust muffler roll-off on engine output) plus compressed powder crunch resonance, faithfully conveying muffled winter acoustics.

### 4.3 Stability, Transitions & Mobile Safeguards
- **Click-Free Crossfading**: Surface weights blend smoothly using `setTargetAtTime` (`65ms–95ms` time constant) instead of abrupt gain jumps when clipping a curb or sliding onto gravel.
- **Mobile Gesture Unlock & Controls**: Automatically resume `AudioContext` on the first user touch/pointer/key gesture anywhere in the app, and provide accessible **Master Volume** and **Surface Audio Effects** toggles in Settings (persisted to local storage).
- **Low-CPU Fallback**: When the `low` quality preset or automatic performance throttle engages, bypass per-grain modulation oscillators while retaining the core low-pass/bandpass surface filters so audio stays responsive without hurting FPS.

---

## 5. Iconic Real-World Circuits & Real / Custom Category Selector

### 5.1 Real / Custom Map Category Selector
- Extend track metadata with `category: 'custom' | 'real'`.
- **Map Selection Modal**: Add a prominent segmented **`[ Real Tracks ]` / `[ Custom Circuits ]`** filter bar at the top of the modal (alongside an optional `All` view or clear dual-tab switch) with responsive mobile-friendly cards displaying lap length, country/region tag, key corner callouts, and surface climate.
- **Map Customizer Switcher**: Group track selection cleanly inside a compact category toggle (`Real` / `Custom`) + active track selector so expanding to 7 total tracks never crowds or breaks the header bar.

### 5.2 Three New Real-World Circuits
Each new track receives an authentic closed spline, elevation profile, trackside curbing, grandstands/trees/barriers, pit zone bounds, podium camera angles, and minimap geometry:

1. **Nürburgring Nordschleife Sprint** (Germany — Eifel Forest Circuit):
   - Fast technical loop inspired by iconic Nordschleife sectors: sweeping Hatzenbach S-bends, high-speed Schwedenkreuz crest, deep Fuchsröhre compression dip, heavily banked concrete **Karussell** bowl corner, technical Pflanzgarten crest jumps, and the long full-throttle **Döttinger Höhe** back straight feeding a final chicane onto the start/finish gantry.
2. **Spa-Francorchamps** (Belgium — Ardennes Forest):
   - Dramatic elevation changes led by the La Source hairpin descending toward the world-famous **Eau Rouge / Raidillon** uphill blind crest, launching onto the long uphill **Kemmel Straight**, flowing through Les Combes, Pouhon double-apex downhill left, high-speed Blanchimont kink, and the heavy braking **Bus Stop** chicane.
3. **Suzuka Circuit** (Japan — Figure-8 Crossover Track):
   - Technical driver's circuit featuring First Curve double-apex, rhythmic **S Curves** uphill climb, Dunlop Curve, Degner 1 & 2, Hairpin, **Spoon Curve**, blistering **130R** sweep, Casio Triangle chicane, and the signature **Figure-8 Overpass Bridge**.
   - **Overpass / Underpass Heightfield Architecture**: Because Suzuka crosses over itself in a true figure-8, nearest-spline track queries and terrain collision checks must distinguish the upper bridge deck from the lower underpass tunnel/roadway using vertical `y` proximity against the vehicle's current track elevation (`|sample.y - vehicleY|`), ensuring the car drives cleanly across the bridge deck and smoothly underneath the overpass without snapping between layers.

---

## 6. 600m Local Chunk Streaming, Far Fog/Blur, Clear Sun & Visible Moon

### 6.1 Balanced 600m Local Chunk Streaming & Performance Budget
Rendering the entire 1120m+ terrain mesh, outer mountain ring, foliage, and trackside structures simultaneously inflates triangle counts and draw calls—especially on mobile GPUs. We will replace monolithic always-on geometry with **spatial grid chunk streaming**:

```
                    [ Far Horizon (> 600m) ]
              Unloaded Chunks + Distant Mountain Silhouettes
              Heavily Veiled in Adaptive Exp2 Fog + Soft Blur
         ┌─────────────────────────────────────────────────────┐
         │         ACTIVE 600m STREAMING BUBBLE                │
         │   ┌─────────┬─────────┬─────────┐                   │
         │   │ Chunk   │ Chunk   │ Chunk   │  • ~250m grid     │
         │   │ (-1,+1) │ (0,+1)  │ (+1,+1) │    terrain tiles  │
         │   ├─────────┼─────────┼─────────┤  • Instanced props│
         │   │ Chunk   │ [CAR /  │ Chunk   │    & trees culled │
         │   │ (-1, 0) │  CAM]   │ (+1, 0) │    at 600m radius │
         │   ├─────────┼─────────┼─────────┤  • Road surface   │
         │   │ Chunk   │ Chunk   │ Chunk   │    LOD segments   │
         │   │ (-1,-1) │ (0,-1)  │ (+1,-1) │  • Zero per-frame │
         │   └─────────┴─────────┴─────────┘    GC allocations │
         └─────────────────────────────────────────────────────┘
```

- **Terrain Chunk Grid (~250m tiles)**: Split terrain geometry at map build time into discrete spatial chunks (`~250m × 250m`, each with its own precomputed `Box3` / `Sphere` bounds). Each frame (throttled cleanly to movement > `20m` using pre-allocated scratch vectors), only chunks intersecting the **600m active radius** around the camera/car focus remain `.visible = true`.
- **Distant Outer Rim & Mountains**: Distant mountain silhouettes stay lightweight via low-poly instanced/skirt ring LOD meshes, occluded smoothly into distance fog beyond 500–600m so chunk edges never pop visibly.
- **Road, Curbs & Props Streaming**: Segment trackside props, barriers, light poles, grandstands, and foliage into matching spatial chunk buckets (`600m` max visibility on Balanced/High, tightening gracefully to `420m–480m` if FPS drops on Low/Mobile) with pre-allocated `InstancedMesh` buffers and computed bounding spheres.

### 6.2 Performance-Adaptive Far Fog & Depth-Masked Distant Blur
- **Heavy-to-Light Far Fog Based on Performance Preset**:
  - **Low / Mobile Throttle**: Heavier exponential distance fog pulling visibility smoothly inward (`~340m–520m`) so chunk boundaries disappear cleanly without needing expensive post-FX shaders.
  - **Balanced**: Balanced 600m fog curve softly blending distant ridges into atmospheric horizon haze starting around `320m` and saturating near `620m`.
  - **High / Max / Ultra**: Extended atmospheric perspective reaching full horizon haze gently toward `680m+`, letting dramatic ridge silhouettes read cleanly.
- **Depth-Masked Distant Terrain Blur (Sky-Safe)**:
  - Add a subtle, distance-gated bokeh/softness blur inside the post-processing pipeline (`sceneDepth` linearized to world meters) that softly blurs distant terrain and far mountains beyond `~420m–550m`.
  - **Hard Sky Protection**: Explicitly mask out pixels where depth equals skybox far-plane (`depth >= 0.9998`), ensuring the **Sky, Stars, Sun, and Moon are NEVER blurred** and remain razor-sharp at every quality tier. Automatically skip the multi-tap blur kernel on `low` / `isSoftwareGl` presets, relying on heavier `FogExp2` instead.

### 6.3 Crisp Sun & Detailed Visible Moon
- Keep the procedural sky dome completely exempt from scene fog (`fog: false`) and distant blur.
- **Clear, Crisp Sun**: Refine solar disc sharpness, golden corona falloff, and daytime/sunset luminance so the Sun reads distinctly through clear skies and atmospheric dusk without blowing out.
- **New Detailed Visible Moon**:
  - Render a dedicated crisp **procedural Moon disc** in the sky shader (positioned opposite the primary solar arc with an offset orbital tilt so it is clearly visible at night, dusk, dawn, and faintly during crisp late-afternoon blue hour).
  - Include **lunar mare / crater shading**, **illuminated phase crescent/gibbous terminator** driven by solar angle, subtle lunar atmospheric halo, and cool silver directional moonlight shadows at night.

---

## 7. Safeguards, Persistence, Fallbacks & Performance Budget

### 7.1 Performance Targets, Auto-Detect & Dynamic Resolution Scaling (DRS)
- **Target Frame Rates**: Maintain stable `60 FPS` on `Balanced` on mid-range desktop and mobile touch devices; keep `30–60 FPS` playable headroom on software/low-tier GPUs.
- **Smart Auto-Detect Default**: On first launch (when no user preset is saved), inspect device heuristics (`coarse pointer` / viewport / GPU renderer / quick frame-time warmup benchmark) to automatically default mobile touch devices to `Low` or `Balanced` instead of taxing them with heavy post-FX.
- **Dynamic Resolution Scaling (DRS) & Budget**: Already-wired DRS scales DPR down cleanly when frame times spike (`1.0 → 0.72` factor), and chunked terrain + zero-allocation frame loops guarantee new tracks, Moon shader, and surface audio fit comfortably inside the frame budget without GC stutters.
- **60 Hz Physics Decoupling & Clean UI Updates**: Physics runs on fixed `1/60s` steps (max clamped accumulator) independent of render rate, and React HUD updates remain throttled (`~15–20 Hz`) so React never re-renders on every animation frame.

### 7.2 Gameplay Safeguards & Settings Persistence
- **Climb Assist Safeguards**: Smoothly ramps in only above threshold uphill slope angles (`> ~7%` grade), scales fairly across RWD/AWD/different power-to-weight vehicles without boosting flat-ground speed or lap times, leaves AI rivals unaffected, and exposes an explicit toggle in Assists/Settings.
- **Tutorial Persistence & Context**: Persist tutorial completion cleanly in local storage, provide a **Replay Tutorial** action in Settings, allow immediate skip/dismissal if ignored, and dynamically swap keyboard prompts (`WASD / Space / R`) for mobile touch prompts when on a touch viewport.
- **Persistent Settings & Per-Car Aero**: Persist Graphics Preset, Mobile Control Mode (`Buttons / Dial / Tilt`), Master & Surface Audio settings, Active Aero Mode (`off / manual / auto`), and per-car Tuning setups across reloads.
- **WebGL & Post-FX Fallback**: If shader compilation or multisampled composer creation fails on constrained hardware, gracefully degrade to direct `renderer.render()` with `FogExp2` haze and clean WebGL fallback messaging without breaking gameplay.

---

## 8. Verification & Test Plan

1. **Automated Physics & Track BIST (`verifyPhysics` test suite)**:
   - Verify all 7 circuits (4 Custom + 3 Real: Nürburgring Nordschleife Sprint, Spa-Francorchamps, Suzuka Circuit) validate closed-loop spline continuity, ground height sampling, pit bounds, and Suzuka bridge overpass elevation separation (`|sample.y - vehicleY|`).
   - Verify Active Aero `off` / `manual` Deploy & Retract toggles adjust aerodynamic drag (`Cd`) & downforce (`Cl`) accurately across cars.
   - Verify Uphill Climb Assist provides zero assistance on flat track straights while smoothly aiding steep climbs (e.g., Spa Eau Rouge/Raidillon).
2. **TypeScript, Lint & Production Build Verification**:
   - Run full type-check, linter, and production Vite bundle (`compile_applet` + `lint_applet`) with zero errors.
3. **Interactive Visual & Multi-Device Verification**:
   - **Desktop (`1280×800`)**: Confirm Map Selection `Real / Custom` switching, race launch on Nürburgring Sprint, Spa, and Suzuka (testing bridge crossing), mid-race Tuning Drawer with live Active Aero Deploy/Retract, surface audio telemetry changes across asphalt/curb/gravel/snow, 600m chunk streaming transitions, far fog/blur vs. sharp Sun & Moon across Day/Dusk/Night, and cycling all graphics presets (`Low` → `Ultra`).
   - **Mobile Viewport (`390×844` Portrait & `844×390` Landscape)**: Confirm unobstructed 3D Garage showcase (>72% open viewport), ultra-minimal driving HUD & compact shrunk controls, Map Customizer persistent visible top & bottom bars under active editing, and WebGL console/error cleanliness.
