# Aurelia Ridge — Final Polish, Rain Fix, Car Gating, Waterfall & Alpine Ecosystem Plan

This plan resolves the Wet Rain blank-screen rendering bug, gates the GT Pace Coupe strictly to CCTV View and Aerial Tour (with a spline-following chase camera), upgrades the gorge waterfall with ballistic impact droplets, drifting lake foam, and a seamless wet cliff-to-pond transition, introduces four PBR-textured alpine conifer species clustered by mountain elevation, and completes a full lighting, shoreline, tarmac, and HUD polish pass.

---

### User Review & Critical Decisions

> [!IMPORTANT] All key design choices from Phase 1 are locked below. Review and click **Proceed** to execute the updates.

- **Wet Rain Blank-Screen Root Cause & Fix (Confirmed Critical Bug)**: Clicking **Wet Rain** activates GLSL `pow(...)` calls with zero or negative inputs (such as rain-streak tail exponents and signed ripple-distance squaring) plus reversed `smoothstep(high, low, x)` bounds in the raindrop splash, lake ripple, and rain curtain shaders. On WebGL2 HDR framebuffers, those undefined GLSL evaluations inject `NaN` fragments that the bloom pass spreads across the entire viewport while leaving the HTML HUD visible. All shaders will be hardened with safe squaring, clamped bases, and strictly ascending `smoothstep` bounds alongside richer, more realistic multi-depth rain streaks and wet surface reflections.
- **Car Visibility & Aerial Tour Framing (Confirmed)**: The GT Pace Coupe (and its wet tire wake spray and headlights) is removed from all free-roam and static camera presets and spawns **only** when **CCTV View** or **Aerial Tour** is active. During **Aerial Tour**, the camera smoothly locks into a **chase-cam framing the car along the circuit spline**.
- **Waterfall Impact & Surface Transition (Confirmed)**: Dramatic mist plumes, high-velocity ballistic splash droplets, dynamic procedural foam accumulation drifting across the gorge lake surface, and a seamless wet darkened rock/moss shoreline transition into the pond.
- **Alpine Tree Ecosystem (Confirmed)**: Four distinct PBR-textured species (tall valley Norway spruce, mid-slope alpine pine, warm valley cypress, and windswept high-ridge krummholz) populated using real-world mountain elevation, slope, moisture, and forest-stand noise clustering with procedural wind-sway vertex displacement.
- **Full Scene Check (Confirmed)**: End-to-end verification and polish across lighting, water shoreline, wet tarmac puddles, hillside villas, marshal flags, and HUD state transitions.

---

### 1. Overview & Core Concept

- **What It Does**: Delivers a completely glitch-free, photorealistic motorsport alpine world at Aurelia Ridge where every weather preset (especially **Wet Rain**), camera mode (**Free Orbit**, **Preset Vantages**, **Trackside CCTV**, and **Car-Chasing Aerial Tour**), natural landmark (the multi-chute gorge waterfall), and mountain biome (elevation-zoned alpine forest) operates cohesively without visual seams or artifacts.
- **Target Audience**: Users inspecting the circuit architecture, cinematic weather dynamics, and natural alpine environment across close-up road level, trackside broadcast angles, and aerial chase perspectives.
- **Key Value**: Eliminates the Wet Rain black-screen failure, restores pure track clarity for static/free-orbit inspection while spotlighting the GT Pace Coupe in active tracking modes, and elevates the waterfall and mountain forest to cohesive photorealism.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Default Exploration & Camera Presets**: Launching into **Overview** or selecting **Pit Straight**, **Road Level**, **Bridge Deck**, **Cable Bridge**, **Karussell Bowl**, or **Canyon Esses** presents an unobstructed motorsport circuit, bridge, waterfall gorge, and alpine village with no car on track and all marshal flags reacting smoothly to global wind.
  2. **CCTV Broadcast Mode (`C` or `CCTV View`)**: Activating CCTV immediately spawns the GT Pace Coupe on the circuit along with motorized trackside pan/tilt tracking, live HUD viewfinder badge (`CAM 01`–`CAM 06`), and wet-weather rear-tire wake spray when **Wet Rain** is active.
  3. **Aerial Tour Chase-Cam (`Aerial Tour`)**: Toggling Aerial Tour spawns the GT Pace Coupe and smoothly glides into a low-altitude dynamic chase camera behind and above the car along the spline, keeping the coupe framed as it corners across the cable bridge, hairpin bowl, and canyon esses. Dragging the mouse or switching to a preset cleanly exits the tour and removes the car.
  4. **Weather & Atmospheric Inspection (`Dry` / `Overcast` / `Wet Rain`)**: Switching to **Wet Rain** darkens the sky deck, triggers glistening mirror puddles on the tarmac, concentric raindrop splash ripples on puddles and lake water, multi-layer wind-slanted rain streaks across the viewport, and amplified wet sheen across cliffs, villas, and conifers—with zero viewport blanking.

- **Visual Identity & Mood**:
  - *Aesthetic Direction*: Photorealistic Alpine Motorsport Cinema (`--background: #0c0f14`, crisp amber `#f59e0b` and rain-sky `#38bdf8` active HUD highlights, `#f8fafc` primary typography).
  - *Typography & HUD Polish*: `Outfit` display headings, `JetBrains Mono` tabular telemetry (`km`, `m`, `°`, `CAM 01–06`), high-contrast solid/translucent obsidian dock surfaces without blur filters or distracting pulses.

- **Interactive Feedback & Motion**:
  - Smoothly damped FOV transition (`48°` wide/chase to `34°` telephoto CCTV) and zero-pop terrain floor clamping (`groundHeightAt + 2.2m`) during Aerial Tour chase maneuvers.
  - Responsive wind coupling: marshal cloth flags, multi-species pine boughs, rain slant velocity, and waterfall mist plumes all accelerate harmoniously during **Overcast** and **Wet Rain** states.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Hardening GLSL Weather Shaders Against `NaN` Bloom Contamination**
  - *Chosen Approach*: Audit and eliminate every `pow(x, 2.0)` (replaced with explicit `x * x` squaring), clamp every fractional `pow(max(x, 1e-4), exp)`, invert all descending `smoothstep(high, low, v)` calls to `1.0 - smoothstep(low, high, v)`, and pre-warm rain/wet shader paths safely.
  - *Why*: Eliminates `NaN` emission in the first frame of **Wet Rain**, preventing `UnrealBloomPass` from smearing `NaN` over the entire WebGL framebuffer while maintaining full HDR post-processing fidelity.
  - *Alternatives Considered*: Disabling bloom in rain mode—rejected because bloom gives car taillights, wet reflections, and horizon sunlight realistic optical softness, and `NaN` pixels would still corrupt raw render output.

- **Decision 2 — Strict Car Visibility Gating & Spline Chase Framing**
  - *Chosen Approach*: Gate `carRoot`, rear-tire `wakePoints`, and car `SpotLight` intensity on `(isCctv || isFlyover)`, while keeping simulated lap progression smooth so switching into either mode presents natural movement immediately. In Aerial Tour, compute chase camera position behind `-tangent` and elevated along `+up` with subtle lateral framing sway and terrain clearance clamping.
  - *Why*: Guarantees an uncluttered track during architectural/terrain inspection while giving **Aerial Tour** and **CCTV View** genuine automotive broadcast energy.
  - *Alternatives Considered*: Keeping the car frozen or parked off-track—rejected because the user explicitly requested removing the car whenever neither CCTV nor Aerial Tour is active.

- **Decision 3 — Waterfall Ballistic Droplets, Procedural Lake Foam Texture & Seamless Wet Rock Gradient**
  - *Chosen Approach*: Generate a dedicated tileable lacy foam/froth procedural texture for both a custom plunge-apron flow shader and the main lake water shader (radial advection outward from the waterfall plunge coordinates), pair it with a GPU-accelerated ballistic droplet burst emitter (true parabolic `v0*t - 0.5*g*t^2` arcs from stepped rock ledges and the plunge pool plus dense wind-driven mist plumes), and inject a world-height + waterfall-distance wet rock/moss darkening and glossy low-roughness film into the gorge cliffs and shoreline terrain.
  - *Why*: Bridges the static rock-to-water seam visually while giving the impact zone dynamic turbulent energy and realistic surface foam dissipation.
  - *Alternatives Considered*: Static vertex-colored white ring—rejected as artificial at close camera presets like Cable Bridge.

- **Decision 4 — Four-Species PBR Conifer Ecosystem with Elevation/Slope/Moisture Clustering**
  - *Chosen Approach*: Synthesize tileable PBR conifer needle albedo, normal, and roughness maps plus bark normal detail, construct four distinct botanical geometries (**Valley Norway Spruce**, **Mid-Slope Alpine Pine**, **Sunny Valley Cypress**, **High-Ridge Krummholz**), add hierarchical trunk + bough + needle-tip vertex wind displacement, and place stands via multi-octave forest-grove noise stratified by altitude, slope, and gorge proximity.
  - *Why*: Eliminates uniform untextured cone silhouettes and creates authentic alpine vertical zonation (lush dense valley spruce -> mid-elevation mixed pine stands -> stunted windswept treeline krummholz).

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & System Interaction Diagram**:

```
┌──────────────────────────────────────────────────────────────────────┐
│                        UI Overlay & Input Layer                      │
│  Camera Presets │ CCTV Toggle/Cycle │ Aerial Tour │ Weather & Solar  │
└────────┬──────────────────┬──────────────────┬───────────────┬───────┘
         │                  │                  │               │
         ▼                  ▼                  ▼               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Scene Simulation Controller                    │
│  • Mode Gate: carVisible = isCctv || isFlyover                       │
│  • Camera Rig: Orbit / Preset / CCTV Telephoto / Chase-Cam Aerial    │
│  • Post-FX Pipeline: Render -> GTAO -> HDR Bloom -> Lens -> SMAA     │
└───────┬───────────────────┬──────────────────┬───────────────┬───────┘
        │                   │                  │               │
        ▼                   ▼                  ▼               ▼
┌───────────────┐  ┌─────────────────┐ ┌──────────────┐ ┌──────────────┐
│ Sky & Rain    │  │ Pace Car & CCTV │ │ Waterfall &  │ │ Ecosystem &  │
│ Atmosphere    │  │ Rig             │ │ Lake Surface │ │ Terrain PBR  │
├───────────────┤  ├─────────────────┤ ├──────────────┤ ├──────────────┤
│• Safe GLSL    │  │• Car Visibility │ │• Ballistic   │ │• 4 Conifer   │
│  Rain Streaks │  │  & Light Gate   │ │  Droplets    │ │  Species +   │
│• Solar / IBL  │  │• Spline Chase   │ │• Advected    │ │  Needle PBR  │
│  PMREM Sync   │  │  Pose Helper    │ │  Lake Foam   │ │• Elevation & │
│• Global Wind  │  │• 6 Pan/Tilt     │ │• Wet Cliff   │ │  Moisture    │
│  Vector       │  │  Turrets        │ │  Moss Band   │ │  Clustering  │
└───────────────┘  └─────────────────┘ └──────────────┘ └──────────────┘
```

- **State & Mode Mapping**:
  - **Car Gate**: `setCarVisible(cctvEnabled || flyoverActive)` invoked on initialization (`false`), `setCctvEnabled`, `setFlyoverActive`, `setCameraPreset`, and `onControlsStart` user drag interruption so no residual car geometry, wet wake spray, or headlight spotlight leaks into free-roam or static vantages.
  - **Aerial Tour Chase-Cam Flow**: Each frame while `flyoverActive === true`, `cctvRig.getChaseViewPose(...)` supplies the car's smoothed world position, forward tangent, lateral right vector, and up normal. The camera smoothly tracks behind (`-tangent * 14.5m`) and above (`+up * 5.6m` + gentle lateral weave), clamped above terrain height, looking ahead past the car along `+tangent * 7m`.
  - **Wet Rain Shader Safety & Visual Sync**: `weatherUniforms.uWetness`, `uOvercast`, `uWindSpeed`, and `uWindDir` propagate across sky/rain streaks, asphalt puddle ripples, lake surface ripples, wet cliff rock sheen, villa slate roofs, marshal cloth flags, and four-species conifer sway—with all GLSL math guaranteed `NaN`-free and descending `smoothstep` intervals corrected.
  - **Final Polish & Verification**: Full verification across TypeScript checks, production compilation, GLSL safety audit, and runtime inspection across `Dry`, `Overcast`, `Wet Rain`, `CCTV View`, and `Aerial Tour` modes.
