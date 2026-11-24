# GT Motorsport Lab — Cinematic Visual Overhaul, Performance Caching & Pure Manual Steering / Handbrake-Only Stability Plan

A focused four-pillar upgrade delivering a real-time **Rubbering Progress** indicator in the top-left driving HUD strip, a unified golden-hour high-contrast **Cinematic Graphics Overhaul** across the Garage, Snow, Beach, and circuit roadways, **Lag-Free Staged Transitions** when picking maps or pressing Start Race, and **Pure Manual Steering + Handbrake-Only Skidding Dynamics**—eliminating any automatic self-steering/countersteer assist and keeping normal cornering planted while preserving Drift Attack and hairpin slides on command.

> [!IMPORTANT]
> **Critical Design Decisions Confirmed for Execution**
> - **HUD Placement:** Minimal `Rubbering Progress` percentage bar integrated directly inside the top-left race timing strip alongside Sector/Lap data (tabular numeric readout, zero rounded pill clutter).
> - **Visual Direction:** Unified high-contrast motorsport film aesthetic pairing **photoreal surface reflections & PBR lighting**, **dramatic cinema shadows with selective bloom**, and **warm golden-hour showcase light** across Garage, Snow, Beach, and improved circuit road surfaces.
> - **Lag Elimination:** Smooth instant transitions powered by a persistent **Map World Cache**, **frame-sliced / async GPU shader pre-warming**, **pre-pooled AI grid instances**, and coalesced environment cubemap baking.
> - **Steering & Handling Contract:** **Remove automatic steering/countersteer assist completely** so front wheels strictly obey manual steering input and return cleanly to `0°` when released (zero phantom self-turning); **zero unintended normal-driving skids**—skids, squeal, tire smoke, and asphalt marks unlock strictly when holding the handbrake. All deterministic physics & engineering benchmarks remain green under this stability envelope.

---

## 1. Overview & Core Concept

The project advances from a strong engineering-first motorsport simulation into a cohesive, film-grade racing presentation without sacrificing responsiveness or determinism:

1. **Live Track Evolution Feedback (`Rubbering Progress`)**: As laps unfold and cars lay down rubber, surface grip and visual darkened racing-groove accumulation progress from `8%` baseline toward `100%`. Exposing this clearly inside the top-left timing cluster closes the loop between what players feel through steering/grip and what they see on the asphalt.
2. **Cinema-Grade Environments & Track Surfaces**: Garage, Snow, Beach, and road shaders receive coordinated lighting, volumetric/atmospheric depth, material micro-detail, animated water/ice optics, and selective HDR bloom so every camera angle—from showroom turntable to cockpit sunset run—reads like a curated motorsport film frame.
3. **Sub-Second Responsiveness at Mode Boundaries**: Clicking map cards in Track Select or hitting Start Race currently freezes the main thread by destroying and regenerating tens of thousands of terrain/water vertices and synchronously compiling WebGL programs. A persistent map-rig cache paired with non-blocking staged shader warmup eliminates UI stalls.
4. **Pure Manual Steering & Handbrake-Only Skids**: Removing hidden automatic caster/countersteer angle injection ensures the front wheels never steer on their own when the player releases steering or hits bumps/camber. Meanwhile, tuning lateral slip constraints and yaw-stability damping eliminates sudden tail-out skidding during normal steering, reserving full oversteer slides strictly for intentional handbrake initiation.

---

## 2. User Experience & Visual Design

### 2.1 Top-Left HUD Race Strip — Rubbering Progress Bar
Integrated seamlessly at the base of the top-left race timing panel (never floating separately or crowding the center viewport):

```text
┌──────────────────────────────────────────────────────────┐
│  P1 / 5   │  LAP 2 / 3 · SPRINT   │  DELTA  -0.342 s     │
├───────────┴───────────────────────┴──────────────────────┤
│  BEST  1:28.410       LAST  1:29.005       [ S1 | S2 | S3]│
├──────────────────────────────────────────────────────────┤
│  RUBBERING PROGRESS   ████████████░░░░░░░░░░░   54% · OPT │
└──────────────────────────────────────────────────────────┘
```

- **Typography & Alignment**: Clean uppercase micro-label (`Rubbering Progress`), `tabular-nums` percentage readout, and a razor-thin rectangular progress bar (`1px` crisp border, zero pill capsules) transitioning smoothly from cool green-track slate (`< 25%`) through amber grip build (`25–70%`) to warm rubbered-in motorsport amber/emerald (`> 70%`).
- **Canvas Unification**: Translucent obsidian backdrop (`rgba(8, 11, 16, 0.72)`) matching existing telemetry strips without heavy blur filters over the live WebGL canvas.

### 2.2 Total Cinematic Visual Overhaul

All three showcase environments and circuit roadways follow a unified three-part cinema lighting grammar: **warm golden-hour key light + cool cobalt shadow/rim separation + calibrated ACES Filmic tone mapping & selective HDR bloom** (emissive lightblades, sunset ocean glitter, alpenglow ice ridges, brake calipers, and tail-light halos pop crisply without washing out the car silhouette).

#### A. Garage Showroom Pavilion (`Hero Golden-Hour Studio`)
- **Mountain & Skyline Horizon**: Replace low-poly conical mountains around the pavilion lake with multi-octave ridged alpine peaks shaded for aerial perspective, atmospheric valley mist, and warm golden sunset rim bounce.
- **Architectural Light & Reflections**: Add structural dark anodized ceiling trusses, suspended warm/cool dual-temperature LED hero lightblades casting crisp longitudinal clearcoat highlights across car bodywork, and volumetric god-ray sunbeams slanting across the glass curtain wall.
- **Floor & Exterior Lake**: Upgrade showroom flooring to deep wet-look basalt/epoxy concrete with radial micro-grain roughness modulation, metallic expansion joints, and focused under-chassis rim bounce; animate the exterior caldera lake with subtle golden-hour ripples mirroring the mountain silhouette.
- **Atmospheric Motion**: Gentle GPU-driven golden dust motes floating through the pavilion sunbeams.

#### B. Beach Circuit — Coral Bay (`Cinema Sunset Lagoon`)
- **Sky & God-Rays**: Warm coastal sunset atmospheric scatter with low golden key light (`~168°` horizon hug), dramatic warm-vs-cobalt cloud under-lighting, and crepuscular sunbeams filtering past coastal cliffs.
- **Ocean & Shoreline Optics**: Animated multi-wave directional ocean surface featuring crisp Fresnel sky reflections, warm sunset specular glitter path, shallow-water turquoise subsurface scattering over sandy reef shelves, and animated shoreline foam wash.
- **Terrain & Landmarks**: Multi-layered limestone cliff strata with sun-baked bounce lighting, wet tidal shoreline darkening, denser resort palm silhouettes swaying smoothly with shared wind uniforms, and illuminated coastal boardwalk/resort hospitality lighting at dusk.

#### C. Snow Circuit — Frostpeak Glacier (`Alpenglow Cinema Contrast`)
- **High-Contrast Alpine Lighting**: Warm golden alpenglow key light raking sharp snowy ridges against deep crisp cobalt glacial shadows—creating true cinema dynamic range rather than flat grey snow.
- **Glacial Ice & Frozen Lake**: Enhance glacial crevasse seracs and the recessed frozen basin with deep sapphire subsurface scattering tints, crystalline clearcoat sparkle micro-facets, and crisp anisotropic specular cracks under low-angle sunlight.
- **Atmospheric Particles & Snowbanks**: Multi-depth GPU-driven spindrift snow crystals blowing off ridge crests paired with warmer chalet/lodge amber window glow and trackside floodlight beams cutting through cold twilight mist.

#### D. Circuit Roadway & Track Improvements (All Maps)
- **Progressive Rubbering Groove Visibility**: Link road surface shaders directly to `rubberInProgress` so the darkened racing line visibly builds down corners and braking zones lap by lap.
- **Surface Micro-Detail & Contrast**: Sharpen asphalt aggregate normal response, add wet-puddle Fresnel sheen patches during damp/rain transitions, crisp painted kerbs with subtle tire-scuff weathering, pit-lane stencil clarity, and tighter camera-centered shadow frustums (`100–130 m` driving cascade) for razor-sharp chassis & barrier shadows.

---

## 3. Key Product Decisions & Trade-Offs

| Decision Area | Chosen Approach | Trade-Off & Rationale |
| :--- | :--- | :--- |
| **Lag Elimination Strategy** | Persistent Map World Rig Cache + Staged `compileAsync` + Pre-Pooled AI Rivals | Uses modest extra GPU/CPU memory per visited circuit (~40–80 MB) in exchange for **instant map switches** and **hitch-free race launches**, rather than rebuilding 66k-vertex meshes each click. Manual cache purge remains available in Settings. |
| **Map Pre-Warm Scheduling** | Deferred idle background warmup + frame-sliced transition scrim | Keeps initial Garage boot fast for immediate interaction while quietly preparing shaders and textures before the user clicks Start Race. |
| **Steering Assist Removal** | 100% pure driver-input steering angle (remove caster self-align steering injection) | Eliminates any uncommanded "car turning on its own" feel on straights, bumps, or corner exits while leaving turn-in direct and predictable. |
| **Handbrake-Only Skid Envelope** | Dynamic rear lateral slip clamp + zero-deadband yaw tracking when handbrake is released | Eliminates accidental spinouts and corner skidding for crisp predictability while keeping Ackermann turn-in, suspension load transfer, trail-braking physics, and Drift Attack handbrake slides intact. |
| **Rubbering Indicator Scope** | Minimal percentage bar inside existing top-left timing strip | Zero extra HUD panels cluttering the screen; always visible in Sprint, Time Trial, Free Run, and Drift Attack without obstructing sightlines. |

---

## 4. Technical Architecture & Data Strategy

### 4.1 Seamless Transition & Map Cache Pipeline

```text
  [User Clicks Map Card]                  [User Clicks Start Race]
            │                                        │
            ▼                                        ▼
  ┌───────────────────┐                  ┌────────────────────────┐
  │ Map Cache Lookup  │── Hit ─────────▶ │ Attach Cached Rigs     │
  └─────────┬─────────┘                  │ (0 Terrain Rebuild!)   │
            │ Miss                       └───────────┬────────────┘
            ▼                                        │
  ┌───────────────────┐                              ▼
  │ Build Map Rig     │                  ┌────────────────────────┐
  │ (Shared Noise +   │                  │ Pre-Pooled AI Rivals & │
  │  Terrain Cache)   │                  │ Async Staged Shader    │
  └─────────┬─────────┘                  │ Compile + Smooth Fade  │
            │                            └───────────┬────────────┘
            ▼                                        ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ Coalesced PMREM Re-bake (1x per switch, never mid-transition) │
  └───────────────────────────────────────────────────────────────┘
```

1. **Map Rig Cache**: Store `{ terrainRig, roadRig, landmarksRig, propsRig, cctvRig }` per `MapId` (invalidated cleanly only when the user edits custom map waypoints/geometry or switches away if Low-Memory Performance Mode forces eviction). Detaching/attaching cached Three.js `Group` hierarchies avoids destroying and recreating `66,049`-vertex terrain and `48,841`-vertex water buffers on every selection.
2. **Terrain Field Memoization**: Cache nearest spline queries & elevation field values during grid construction so Laplacian ambient occlusion and normal calculation reuse computed heights instead of recalculating expensive `fbm2D` + spline searches `5x` per vertex.
3. **Non-Blocking Shader & Rival Preparation**:
   - Pre-clone AI rival instances during idle time after initial Garage GLB load rather than synchronously during `startNewRace`.
   - Use asynchronous shader compilation (`compileAsync`) where supported and split initial race frame readiness behind a smooth `< 350 ms` cinema crossfade curtain instead of freezing input or HUD updates.
   - Guard `PMREMGenerator.fromScene()` so a single environment bake runs cleanly per map transition rather than duplicating bakes across weather sync and atmosphere initialization.

### 4.2 Pure Manual Steering & Handbrake-Only Skidding Dynamics

```text
  Driver Steering Input ──▶ [Zero Auto-Steer / Zero Caster Assist] ──▶ Pure Manual Steer Angle
            │
            ├──▶ [Handbrake OFF] ──▶ Grip Envelope Enforced:
            │                        • Clamp rear slip angle inside peak grip band
            │                        • Proportional yaw-rate tracking (no breakaway deadband)
            │                        • Lateral velocity align damping (zero unwanted tail drift)
            │                        • Squeal = 0 (outside hard ABS lock), Smoke/Skid Ribbons OFF
            │
            └──▶ [Handbrake ON]  ──▶ Full Drift Envelope Unlocked:
                                     • Rear lateral traction drop + handbrake lock torque
                                     • Free slip-angle build for hairpins & Drift Attack
                                     • Tire squeal, rear tire smoke plumes, asphalt skid ribbons ON
```

- **Zero Automatic Steering Assist**:
  - Remove the automatic slip-angle caster alignment injection (`casterAlign` term that previously added up to `±0.17 rad` of self-steering even with zero player steering input), eliminate asymmetric bump/kerb steering pull biases on straight driving, and apply a clean subtle gamepad deadzone (`0.08`) so hardware stick micro-drift never turns the car unintentionally. Front wheel angle returns purely and deterministically to `0.000°` whenever steering input is released.
- **Handbrake-Only Skidding Integration**:
  - When handbrake is **NOT** held: clamp rear lateral slip build inside linear-to-peak adhesion (`<= peak slip band`), strengthen proportional yaw-rate stabilization toward the driver's commanded Ackermann target yaw rate (retaining zero torque when `< 3` wheels are grounded and preserving chassis yaw inertia scaling—never turning the front wheels automatically), and apply gentle lateral-velocity alignment damping so turning aggressively stays planted without corner squeal, tire smoke, or skidmarks.
  - When handbrake **IS** held: disable the normal-driving slip clamp and lateral align assist, applying full rear brake lock and controlled rear-grip reduction so players can initiate sharp hairpins and Drift Attack chains immediately on `SPACE`.
- **Verification Compatibility**: Cornering lateral G (`1.15–1.75 G`), trail-braking friction ellipse coupling, setup sensitivity (camber/ARB/downforce/tire compound lap-time deltas), airborne zero-ESC invariants, zero-uncommanded-steer straight-line stability, and all `41/41` deterministic verification checks remain preserved.

### 4.3 HUD Telemetry & Road Groove Sync
- **Single Source of Truth**: Physics engine continuously computes `rubberInProgress` (`0.08–1.0`, accelerating with dry track speed and `+0.14` per completed lap).
- **Synchronized Consumers**:
  1. Top-left driving HUD reads `telemetry.rubberInProgress` (`Math.round(val * 100)%`) to drive the `Rubbering Progress` bar and stage label (`GREEN` / `BUILDING` / `RUBBERED`).
  2. Scene controller forwards `rubberInProgress` to each active circuit's road rig (`setRubberLevel`) so the darkened apex groove on Aurelia Ridge, Coral Bay, and Frostpeak Glacier intensifies visually in lockstep with the HUD meter.

### 4.4 Staged Implementation Sequence
1. **Stage 1 — Pure Manual Steering, Handbrake-Only Skid Physics & FX Gating**: Remove automatic caster/countersteer angle assist completely, update rear slip stability, ESC deadband/tracking, and squeal/skidmark/smoke emission gates; run physics verification suite to verify `41/41` passes plus straight-line zero-auto-steer invariance.
2. **Stage 2 — Rubbering Progress HUD Bar**: Integrate the minimal top-left race-strip indicator and verify sync across race start, pit reset, and lap progression.
3. **Stage 3 — Lag-Free Caching & Staged Pre-Warm**: Implement the persistent Map Rig Cache, terrain elevation memoization, pre-pooled AI rival setup, async shader warmup, and transition smoothing.
4. **Stage 4 — Total Cinematic Graphics Overhaul**: Execute lighting, PBR/shader, volumetric sunbeam, water/glacial SSS, mountain horizon, and roadway visual upgrades across Garage, Snow, Beach, and tracks, followed by full build, lint, and live headless browser verification across all 3 maps and Garage.
