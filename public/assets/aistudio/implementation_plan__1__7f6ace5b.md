# Frostpeak Glacier GT — Snow Circuit & Customizable Winter Atmosphere

Adds **Frostpeak Glacier GT**, a third playable racing circuit set across a high-alpine snowy mountain pass, featuring a frozen glacial lake bridge, a timber ski chalet village, cold-tarmac and icy-shoulder grip physics, and a three-way customizable winter weather and lighting system.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The plan reflects your Phase 1 answers and custom write-in preference for selectable snow weather and lighting. Review the defaults below before proceeding.

- **Confirmed Track Layout & Scenery**: High-alpine mountain pass descending toward a **Frozen Glacial Lake Bridge** and sweeping past an alpine **Ski Village** with timber chalets, gondola towers, snow-laden conifers, and a heated 6-bay Pit Lane paddock.
- **Confirmed Surface & Physics Model**: **Cold tarmac racing line** paired with **low-grip icy shoulders** and **deep snowbanks** off-track, plus faster straightaway tire cooling while retaining full Pit Lane refueling and tire wear in every game mode.
- **Confirmed Customizable Snow Atmosphere**: Three switchable snow weather and lighting presets (**Crisp Alpine Snow**, **Twilight Blue-Hour Snowstorm**, and **Clear Glacier Sunshine**) selectable both inside the Track Selection modal and in **Settings → Environment**.

---

## 1. Overview & Core Concept

- **What It Delivers**: A complete winter racing environment integrated into the existing multi-map engine, track selector, custom waypoint editor, spatial audio engine, and vehicle telemetry/physics pipeline.
- **Target Experience**: High-precision winter GT driving where keeping tires centered on the salted cold tarmac maximizes bite, drifting onto frosted shoulders triggers realistic slip and snow kick-up, and twilight snowstorm mode transforms visibility with wind-swept snow and illuminated floodlights.
- **Core Value**: Expands circuit variety from Alpine mountain canyon and tropical coast to high-altitude winter motorsport while honoring real-time tire temperature, wear, and fuel strategy.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Circuit & Atmosphere Selection**: Pressing **Start Race** opens the Track Selection modal, now displaying three circuits (**Aurelia Ridge**, **Coral Bay**, and **Frostpeak Glacier**). Selecting **Frostpeak Glacier** reveals an inline three-button **Snow Atmosphere** selector (**Crisp Alpine**, **Twilight Storm**, **Glacier Sun**) alongside the live SVG spline preview, elevation delta, sector breakdown, and per-car personal best lap.
2. **In-Session Customization**: While driving or spectating on **Frostpeak Glacier**, **Settings → Environment** switches seamlessly between the three Snow Atmosphere presets (adjusting sky scattering, sun elevation, floodlights, fog density, and falling snow particles) alongside solar angle scrubbing and Graphics Quality tiers.
3. **Track Customizer Support**: Selecting **Frostpeak Glacier** inside the 3D Map Customizer exposes 9 winter corner waypoints (including the Glacier Crest, Frozen Lake Chicane, and Ski Village Hairpin) for drag-and-drop spline shaping and banking tuning.

### Visual Identity & Theme
- **Aesthetic Direction**: High-altitude alpine motorsport telemetry—crisp dark slate overlays paired with glacier-ice cyan (`#38bdf8`) accents, snow-white primary track traces, and warm chalet amber (`#f59e0b`) floodlight accents.
- **Color Palette & Atmospheric Mood**:
  - *Crisp Alpine Snow*: Cool cobalt zenith, pale glacial horizon haze, gentle falling 3D snowflakes, snow-draped pines, and crisp sunlight casting blue-tinted alpine shadows.
  - *Twilight Blue-Hour Snowstorm*: Deep indigo twilight sky, dense wind-slanted blizzard particles around the camera, thickened atmospheric fog, automatic vehicle headlights, glowing chalet windows, and trackside floodlight gantries.
  - *Clear Glacier Sunshine*: Bright midday sun, deep mountain sky, high-contrast snowfield sparkle with falling snow particles disabled for maximum visibility.
- **Typography & HUD Restraint**: Preserves the existing tabular-numeral telemetry HUD, unboxed metadata separators (`·`), zero-pill static labels, and no `backdrop-blur` over the active WebGL canvas.

### Interactive Feedback & Spatial Immersion
- **GPU Snowfall Particle Rig**: Zero-CPU vertex-animated snowfield surrounding the active camera, shifting smoothly from gentle drifting flakes (Crisp Alpine) to dense diagonal blizzard streaks (Twilight Storm) or hidden (Glacier Sun).
- **Winter Surface Feedback**: Kicking up pale powdery snow/slush spray when sliding over icy kerbs or off-road snowbanks, paired with winter wind howl, frozen lake creak/echo acoustics, and ski-village crowd ambience.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Cold Tarmac Racing Line + Icy Shoulders Physics Calibration**
  - *Chosen Approach*: Set cold track tarmac friction slightly lower than warm summer circuits, drop kerb/shoulder grip sharply to simulate packed ice/slush, soften off-road snowbanks with higher rolling drag, and increase ambient straightaway tire cooling while preserving full Pit Lane refueling and tire wear.
  - *Why*: Delivers a distinct winter driving feel that rewards clean apex discipline and tire thermal management without turning the racing line into an uncontrollable skating rink.
  - *Alternatives Considered*: Uniform dry-tarmac grip (too indistinguishable visually) or pure sheet ice everywhere (frustrating in high-downforce GT3 cars).

- **Decision 2: Three-State Customizable Snow Atmosphere Preset**
  - *Chosen Approach*: Expose a dedicated Snow Atmosphere preset state (`Crisp Alpine`, `Twilight Storm`, `Glacier Sun`) synchronized between the Track Selection modal and Settings Environment tab, driving sky palette, fog, snowfall particle density/velocity, and floodlight emissives in concert.
  - *Why*: Satisfies the request for customizable winter lighting and weather in a single clear control without cluttering non-snow maps.
  - *Alternatives Considered*: Locking the snow track to a single fixed weather state or adding complex multi-slider snow particle controls.

- **Decision 3: Multi-Span Frozen Lake Bridge & Ski Village Landmarks**
  - *Chosen Approach*: Grade an alpine terrain amphitheater with a recessed frozen lake basin crossed by a steel-arch frost bridge, framed by frosted instanced pine forests, timber ski chalets, a summit lodge, and an overhead alpine gondola cableway.
  - *Why*: Keeps draw calls bounded via instanced foliage and composite architectural groups while matching the visual scale and 60 FPS frame budget of the existing circuits.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Flow
```
┌──────────────────────────────────────────────────────────────────────┐
│                       TrackSelectModal / Settings                    │
│   Circuit Picker (Aurelia | Coral | Frostpeak) + Snow Preset Toggle  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ onSelectMap / onSnowAtmosphereChange
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Engine SceneController                        │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────┐ │
│  │ Map Registry &      │  │ Winter World Builder │  │ Sky & Snow   │ │
│  │ Circuit Spline      │─▶│ Terrain, Frozen Lake │◀─│ Particle Rig │ │
│  │ (Frostpeak Control  │  │ Frost Bridge & Ski   │  │ (3 Snow      │ │
│  │  Points & Pit Box)  │  │ Chalet / Gondola Rig │  │  Presets)    │ │
│  └──────────┬──────────┘  └──────────┬───────────┘  └──────┬───────┘ │
│             │                        │                     │         │
│             ▼                        ▼                     ▼         │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ VehiclePhysicsEngine & Spatial Audio                            │ │
│  │ Cold tarmac / icy shoulder grip · Ambient tire cooling · Pit    │ │
│  │ service · Snow spray telemetry · Alpine wind & village audio    │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Model & State
- **Map Metadata Registry**: Registers `frostpeak_pass` alongside `aurelia_ridge` and `coral_bay` with water/ice elevation, pit-lane bounds, pit-box bounds, podium coordinate, customizer overview framing, and 7 winter camera vantages (**Alpine Overview**, **Heated Pit Straight**, **Ice Tarmac Level**, **Lake Bridge Deck**, **Frozen Lake Span**, **Glacier Crest Bowl**, **Ski Village Chicane**).
- **Snow Atmosphere State**: Stores the active `SnowAtmospherePreset` (`alpine_snow` | `twilight_storm` | `glacier_sun`), updating solar elevation targets, fog density, directional shadows, sky haze, vehicle headlight triggers, floodlight emissives, and GPU snowfall uniforms.
- **Per-Map / Per-Car Records**: Automatically tracks best lap times and AI rival spline checkpoints specifically keyed to `frostpeak_pass`.

### Interactive Component & State Mapping
- **Pre-Race Circuit Card (`TrackSelectModal`)**: Clicking **Frostpeak Glacier** previews its live spline layout and exposes the three Snow Atmosphere buttons; clicking **Race Frostpeak** commits both map and snow preset and transitions into the race countdown.
- **Environment Controls (`SettingsModal`)**: Switching between **Crisp Alpine**, **Twilight Storm**, and **Glacier Sun** immediately updates the live 3D sky, snowfall particles, fog, and floodlights without reloading terrain geometry.
- **Physics & Telemetry Loop (`VehiclePhysicsEngine`)**: Queries `mapId === 'frostpeak_pass'` during sub-step surface evaluation to apply cold-tarmac grip, slippery icy kerb/shoulder multipliers, deep-snowbank drag, and ambient tire cooling, feeding real-time thermal/grip data into the existing HUD heatmap and Pit Lane stop alerts.
- **Terrain & Resource Lifecycle (`SceneController`)**: Selecting or leaving **Frostpeak Glacier** routes through `disposeObjectTree` and the main-loop performance profiler so all winter meshes, frozen lake textures, and instanced frosted trees are cleanly rebuilt and disposed without memory leaks or transition stalls.
