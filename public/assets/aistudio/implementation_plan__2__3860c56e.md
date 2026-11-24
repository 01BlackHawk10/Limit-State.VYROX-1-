# Ultra-Cinematic Upgrade, Dynamic Weather, Live Grandstand Crowds & 60 FPS Smoothing

Delivers a seamless race-time automated weather progression manager (`Dry → Overcast → Rain`), a GPU-instanced telemetry-reactive 3D spectator crowd system across all grandstands on every circuit, ultra-cinematic live GPU post-processing and cross-map customizer controls, overhauled crisp PBR textures, and targeted engine fixes to eliminate frame stutters and state bugs without sacrificing Full visual detail.

## User Review & Critical Decisions

> [!IMPORTANT] All core architectural choices from Phase 1 are locked below. Please review this blueprint and approve to begin implementation.

- **Confirmed Decision 1 — Dynamic Race-Time Weather Progression**: Weather progresses automatically along `Dry → Overcast → Rain` (and optional cyclic loop for endurance runs) driven by elapsed race time, continuously interpolating sky shaders, road wetness, precipitation, and tire surface friction coefficients instead of snapping abruptly. Players can also toggle manual override in Settings or the Map Customizer at any moment.
- **Confirmed Decision 2 — Full 3D Instanced Grandstand Crowd**: Every covered grandstand across Aurelia Ridge, Coral Bay Coastal GT, and Frostpeak Glacier GT is populated with GPU-instanced 3D spectators and animated trackside banners driven by live race telemetry (close finishes, tight battles, overtakes, and idle periods).
- **Confirmed Decision 3 — Live GPU Cinematic Controls in Settings**: Settings exposes real-time sliders for ACES exposure, bloom intensity and threshold, vignette strength, base camera FOV, film color grade presets, camera speed-sense/shake, weather auto-progression pace, and crowd reactivity across all maps.
- **Confirmed Decision 4 — Smooth 60 FPS While Preserving Full Detail**: Frame pacing stutters and lag spikes are eliminated through deferred/budgeted environment cubemap baking, zero-GC pre-allocated render buffers, shader pre-warming, projection-matrix caching, and decoupled React HUD updates—preserving full geometric and foliage density.

## 1. Overview & Core Concept

- **What It Does**: Elevates the driving and track-creation experience into a unified broadcast-grade motorsport simulation:
  1. **Automated Weather Transition Manager**: Continuously evolves track conditions from sun-baked dry tarmac to gathering overcast clouds and wet rain showers over the course of a race, affecting atmospheric scattering, wet asphalt specular reflections, rain/snow particles, and per-surface tire grip simultaneously.
  2. **Telemetry-Reactive Grandstand Crowd**: Populates stepped stadium tiers at Aurelia Ridge, Coral Bay, and Frostpeak Glacier with thousands of GPU-animated spectators who sway gently during quiet laps, rise and wave during wheel-to-wheel battles, and erupt into full standing ovations during close finishes and podium celebrations.
  3. **Ultra-Cinematic Total Control**: Grants players immediate, zero-restart GPU control over exposure, bloom, vignette, FOV, film color grades, dynamic speed sense, and per-map circuit & surface customization across all three circuits.
  4. **Redo Procedural PBR Textures & Stutter Elimination**: Replaces soft fallback/composite textures with razor-sharp multi-octave PBR materials (anisotropic asphalt, micro-pitted kerbs, architectural concrete, weathered rock/snow/sand, conifer needles, metallic gantry signage) while fixing PMREM cubemap stalls, shader compilation hitches, React re-render cascades, and per-map customizer state bugs.
- **Target Audience / Persona**: GT racing enthusiasts, time-trial perfectionists, and virtual automotive photographers capturing broadcast replays and custom circuits across tarmac canyon, tropical reef, and alpine glacier venues.
- **Key Value**: Transforms static tracks into living, reactive motorsport venues with fluid 60 FPS frame pacing and studio-grade visual tuning from cockpit to aerial replay.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Dynamic Race Weather Flow**: Starting a race under clear conditions gradually shifts atmospheric cloud density, sun attenuation, road puddle sheen, rain streaks, and tire grip as race time advances; HUD weather and grip indicators update smoothly alongside continuous physics scaling.
  2. **Live Grandstand Atmosphere**: Passing the pit straight during calm solo lapping shows subtle seated spectator movement and swaying flags; closing within battle range of a rival or crossing the line in a close finish triggers tiered waves and full standing ovations with raised arms and cheering motion.
  3. **Live Cinematic Studio (Settings Drawer)**: Adjusting Exposure, Bloom, Vignette, FOV, or Film Look sliders in Settings updates the 3D viewport in real time behind a compact, unobtrusive obsidian control panel (`tabular-nums` readouts, instant reset-to-default).
  4. **Unified Cross-Map Customizer**: Switching between Aurelia Ridge, Coral Bay, and Frostpeak Glacier inside the Customizer retains independent track edits, presets, corner banking, surface grip, road width, lighting, weather, and surface look controls (water chop/clarity, snow sheen, asphalt wear) with instant spline preview and bug-free circuit rebuilds.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Broadcast-grade motorsport telemetry studio layered cleanly over full-bleed WebGL (`w-full h-full`) with unobstructed sightlines.
  - *Color Palette & Mood*: Deep obsidian structural surfaces (`bg-[#0c0f14]`, translucent dark HUD panels `bg-black/45 border-white/10`), calibrated high-contrast neutral typography, and disciplined racing accents — amber orange (`#F59E0B`), electric cyan (`#06B6D4`), and apex racing red (`#EF4444`) strictly within a 10% accent budget.
  - *Typography & Hierarchy*: Geometric technical display headings (`Chakra Petch` / `Outfit`) paired with clean UI labels (`Plus Jakarta Sans`) and monospace `tabular-nums` for all telemetry, lap gaps, sliders, and exposure/FOV values.
  - *Component Styling & Layout*: Single-line `whitespace-nowrap` controls, unboxed `·`-separated metadata (zero pill badges), minimal corner-anchored HUD overlays, and zero heavy frosted glass blur directly over high-speed gameplay.
- **Interactive Feedback & Motion**:
  - Smooth GPU camera damping with speed-proportional FOV widening, instant real-time shader uniform feedback on Settings sliders, non-blocking shader pre-warming on map switch, and resilient WebGL context-loss recovery states.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1 — GPU Vertex-Shader Crowd Animation vs. Per-Frame CPU Matrix Updates**:
  - *Chosen Approach*: Single batched `InstancedMesh` per grandstand with per-instance color/phase/tier attributes and custom vertex shader animation driven by 3 shared uniforms (`uTime`, `uExcitement`, `uWavePhase`).
  - *Why*: Updating 1,500–2,500 spectator transforms in JavaScript every frame wastes CPU cycles and causes GC churn; GPU vertex displacement renders full grandstands in 1–2 draw calls at virtually zero CPU cost.
  - *Alternatives Considered*: CPU matrix loops updating every spectator matrix per frame (rejected due to main-thread overhead at Full detail).
- **Decision 2 — Continuous Interpolated Weather Factors vs. Discrete Weather Snapping**:
  - *Chosen Approach*: Compute continuous normalized `overcast` (`0..1`), `wetness` (`0..1`), and interpolated tire `frictionScale` inside a dedicated Weather Transition Manager, while keeping Frostpeak Glacier's snow storms smoothly integrated into the same progression & grip pipeline.
  - *Why*: Eliminates sudden mid-corner grip drops and jarring lighting jumps when weather transitions during a live stint.
  - *Alternatives Considered*: Discrete preset timers swapping sky/friction instantaneously (rejected as immersion-breaking and physically unfair mid-turn).
- **Decision 3 — Budgeted/Deferred PMREM Environment Baking vs. Synchronous Frame-Blocking Rebakes**:
  - *Chosen Approach*: Decouple continuous real-time sky/fog/light interpolation (60 Hz lightweight uniform updates) from expensive PMREM cubemap regeneration, triggering PMREM updates only on substantial atmospheric thresholds and deferring synthesis cleanly out of hot physics frames.
  - *Why*: Synchronous PMREM scene renders inside `tick()` are the #1 cause of 20–45ms single-frame stutters during weather/solar transitions.
  - *Alternatives Considered*: Disabling dynamic sky reflections altogether (rejected because car paint reflections lose realism).
- **Decision 4 — Unified Post-FX Uniform Rig + Decoupled HUD Sync**:
  - *Chosen Approach*: Consolidate Exposure, Bloom strength/threshold, Vignette, Color Grade matrix, Vignette/Chromatic micro-fringe, and Base FOV into one shared live uniform controller, while capping React state dispatches (`onTelemetry`) to diffed intervals and keeping high-frequency gauges imperative.
  - *Why*: Prevents full React component tree re-renders from competing with WebGL frame deadlines and ensures instant visual response across all maps.
  - *Alternatives Considered*: Separate per-map post-FX pipelines or per-frame React state updates (rejected as redundant and stutter-prone).

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         React UI & Studio Shell                           │
│  ┌──────────────┐  ┌─────────────────────┐  ┌──────────────────────────┐  │
│  │  Driving HUD │  │  Cinematic Settings │  │ Cross-Map Customizer UI  │  │
│  │ (diffed/ref) │  │ FOV/Exp/Bloom/Grade │  │ Per-Map State + Surfaces │  │
│  └──────▲───────┘  └──────────┬──────────┘  └─────────────┬────────────┘  │
└─────────┼─────────────────────┼───────────────────────────┼───────────────┘
          │ throttled           │ live uniforms             │ rebuild / preview
┌─────────┼─────────────────────▼───────────────────────────▼───────────────┐
│         │              Simulation & Render Coordinator                    │
│  ┌──────┴──────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │  Vehicle Physics    │  │ Weather Transition   │  │ Cinematic PostFX │  │
│  │ Continuous Wet/Snow │◄─┤ Manager (Race Time)  ├─►│ Exposure/Bloom/  │  │
│  │ Tire Mu & Telemetry │  │ Dry→Overcast→Rain    │  │ Vignette/Grade   │  │
│  └──────┬──────────────┘  └──────────┬───────────┘  └────────▲─────────┘  │
│         │ gap/overtake/finish        │ uniforms              │            │
│         ▼                            ▼                       │            │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌────────┴─────────┐  │
│  │ Telemetry-Reactive  │  │ Sky, Deferred PMREM  │  │  Overhauled PBR  │  │
│  │ GPU Crowd Instances │  │ & Particle Rig       │  │  Texture Suite   │  │
│  │ (All 3 Circuits)    │  │ (Throttled Bake)     │  │ (Mip-Crisp Maps) │  │
│  └─────────────────────┘  └──────────────────────┘  └──────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Weather Transition State**: Tracks `mode` (`'auto' | 'manual'`), `cycleDurationSec`, `raceElapsedSec`, continuous `overcast` (`0..1`), `wetness` (`0..1`), active phase label (`Dry`, `Overcast`, `Rain` / Frostpeak equivalents), and derived continuous `tarmacMuScale` / `offroadMuScale`.
  - **Telemetry Crowd State**: Tracks smoothed `excitement` (`0..1`), `wavePhase` (`radians`), close-battle proximity (`gapSec < 1.8`), final-lap flag, overtake pulse decay, and finish/podium celebration trigger.
  - **Cinematic Settings State**: Persisted profile containing `baseFovDeg`, `speedFovBoost`, `exposure`, `bloomStrength`, `bloomThreshold`, `vignetteStrength`, `filmGradePreset`, `cameraShake`, `weatherAutoEnabled`, `weatherPace`, and `crowdReactivity`.
  - **Per-Map Customizer Store**: Keyed per `MapId` (`aurelia_ridge`, `coral_bay`, `frostpeak_pass`) holding circuit preset, road geometry tolerances, surface grip, waypoint offsets/banking, trackside features, and environment richness sliders (asphalt wear, water chop, snow gloss, foliage density).
- **Interactive Component & State Mapping**:
  - **Weather Controls & Race Loop**: Race start resets weather progression clock (when `auto` is enabled); each tick computes smooth transition curves, pushes uniforms to sky/clouds/rain/road/water shaders, schedules non-blocking PMREM updates only past delta thresholds, and feeds continuous friction to physics sub-steps. Manual weather buttons smoothly cross-fade into the chosen target rather than snapping.
  - **Crowd Reactivity Pipeline**: Physics/rivals gap evaluation emits battle, overtake, hazard, and finish excitement impulses; coordinator damps `excitement` smoothly and writes shared uniforms to Aurelia Ridge, Coral Bay, and Frostpeak Glacier grandstands.
  - **Settings & Customizer Handlers**: Slider and preset changes mutate live camera/shader/composer uniforms on the next animation frame with zero geometry teardown; map switches save and restore that map's independent customization profile and reset spline preview buffers cleanly.
  - **Texture & Resource Lifecycle**: Procedural PBR canvases bake crisp albedo, height-derived tangent normals, and calibrated roughness maps once with quality-adaptive mipmaps/anisotropy and full disposal on unmount.
