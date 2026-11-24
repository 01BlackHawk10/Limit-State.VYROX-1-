# Circuit Overhaul, Static Foliage & Live In-Race Tuning Controls

Comprehensive visual and spatial overhaul across all four circuits—preserving Aurelia Ridge's exact spline route while upgrading every road surface, pit lane, opposite grandstand, and animated crowd—plus brand-new layouts and 3D scenery for Coral Bay, Frostpeak Glacier, and Kestrel Peaks, rock-solid static trees, and optional Active Aero DRS and Brake Bias controls integrated into the normal in-race Tuning Drawer.

---

### User Review & Critical Decisions

> [!IMPORTANT] All Phase 1 visual, architectural, and UX directions have been confirmed and locked in:
> - **Maps 2–4 Redesign**: **Coral Bay**, **Frostpeak Glacier**, and **Kestrel Peaks** receive **brand-new track layouts**, sculpted terrain fields, and rebuilt 3D scenery; **Aurelia Ridge** keeps its exact circuit route while receiving a complete road, pit lane, grandstand, and crowd overhaul.
> - **Pit Lane, Opposite Grandstand & Crowd (All 4 Maps)**: Modern **FIA-style pit garages**, tiered roofed spectator grandstands directly opposite the pit complex, and telemetry-reactive **animated crowds**.
> - **Road & Track-Edge Standard (All 4 Maps)**: **Hyper-detailed weathered asphalt**, raised 3D beveled curbs, rubbered-in racing groove, and recessed cast-iron drainage grates.
> - **Foliage Stability (All 4 Maps)**: **Wind-based tree turning is completely disabled** across every map so trees, palms, and shrubs remain rigid and grounded.
> - **In-Race Tuning Drawer Controls**: The optional **Active Aero DRS** manual toggle and dynamic **Brake Bias** slider live inside the **normal Setup tuning area** alongside the other chassis controls, without overriding the Auto-Deployment system unless toggled manually.

---

### 1. Overview & Core Concept

- **What It Delivers**:
  1. **Four FIA-Grade Circuit Environments**:
     - **Aurelia Ridge GT** preserves its beloved 2.9 km alpine spline and twin-pylon gorge bridge route, upgraded with hyper-detailed weathered asphalt, 3D curbs, drainage grates, an architectural FIA pit building, an expanded opposite grandstand with roof trusses and stadium screen, and dense animated spectators.
     - **Coral Bay Coastal GT**, **Frostpeak Glacier**, and **Kestrel Peaks** are completely rebuilt from the ground up with fresh, high-flow track layouts, tailored terrain elevation sculpting, coastal/glacial/alpine landmarks, and matched pit complexes and grandstands.
  2. **Zero Tree Swirl / Wind Turning**: Every instanced pine, cypress, palm crown, tundra birch, and shrub drops vertex-shader wind bending/turning so trackside sightlines stay razor-sharp at speed.
  3. **Live In-Race Setup Controls**: Inside the normal Setup section of the Tuning Drawer, drivers gain an optional **Active Aero DRS** manual deploy/retract toggle (operating cleanly alongside—without breaking—the Auto-Deployment system) and a fine-precision **Brake Bias** slider that shifts front/rear braking distribution dynamically mid-race.
- **Target Experience**: High-speed GT and prototype racing where braking markers, apex curbs, rubbered grooves, pit lane entries, and grandstands feel grounded, cohesive, and broadcast-authentic from cockpit, bumper, and chase cameras.

---

### 2. User Experience & Visual Design

#### A. In-Race Tuning Drawer Controls (Normal Setup Area)
- **Aesthetic & Layout Consistency**: Matches the existing dark obsidian GT tuning drawer (`#090D16` structural carbon panels, hairline `1px` borders, `Oxanium` / `Plus Jakarta Sans` / tabular monospace numerals, `#38BDF8` sky-blue primary accents, `#10B981` emerald for high-downforce deployed state, and `#F59E0B` amber for low-drag DRS retracted state).
- **Optional Active Aero DRS Toggle**:
  - Sits directly inside the **Setup** tab's Differential, Brakes, Gearing, Aero & ECU control block alongside the other chassis sliders and aero controls.
  - Exposes an independent **Active Aero DRS (Manual Wing Deploy / Retract)** toggle switch paired with a clear **Auto-Deploy System** mode selector (`Auto` vs `Manual` vs `Fixed`), allowing drivers to snap the rear wing flat on straights (DRS Open / Low Drag) or deploy high downforce on demand without silently corrupting their chosen Auto-Deployment preference.
  - Updates both the 3D articulated wing actuator state and live drag/downforce telemetry (`CdA` and `kgf @ 250 km/h`) immediately while driving.
- **Optional Dynamic Brake Bias Slider**:
  - Sits in the same **Setup** tuning grid with `0.5`-step precision across `-5.0 Rear` to `+5.0 Front` (mapping smoothly to `48.5% / 51.5%` through `66.5% / 33.5%` F/R hydraulic split).
  - Shows both the numeric bias offset and exact **Front / Rear % split** in tabular numerals, syncing live with both physics braking torque and the cockpit MFD Brake Bias readout without resetting the car or interrupting throttle/steering input.

#### B. Road Surface, Curbs & Drainage Grates (All 4 Maps)
- **Hyper-Detailed Weathered Asphalt**: Multi-octave procedural crack seams, tar patches, aggregate micro-grain normal mapping, subtle crown camber drainage sheen, wet-weather specular puddles, and an asymmetric **rubbered racing groove** that hugs corner apexes and blends into dual tire lanes on straights.
- **3D Beveled FIA Curbs**: Segmented raised rumble strips along corner entry/apex/exit edges using regional accent palettes (Aurelia red/white, Coral Bay coral-orange/chalk, Frostpeak glacier-cyan/ice-white, Kestrel emerald/ivory) with beveled end tapers and subtle wear grime.
- **Storm-Drain Grates & Shoulder Transition**: Flush-mounted cast-iron slotted drainage grates placed at regular intervals along inner track shoulders and pit aprons, paired with chamfered asphalt-to-gravel/stone shoulder edges so nothing looks like a flat floating ribbon.

#### C. Pit Lane, Opposite Main Grandstand & Crowd (All 4 Maps)
- **Modern FIA Pit Complex**:
  - Smoothly tapered pit-entry and pit-exit acceleration lanes with glowing entry portal, chevrons, speed-limit white line, and 6 distinct numbered pit boxes with overhead pit-boom gantries and telemetry signal LEDs.
  - Recessed, illuminated 6-bay pit garages featuring roll-up shutters, structural steel columns, pit-wall telemetry consoles, debris catch-fencing on a concrete pit wall, cantilevered composite canopy roof, glazed VIP Paddock Club hospitality suite above, and an anchored Race Control timing tower.
- **Opposite Main Grandstand ("The One Opposite")**:
  - Positioned directly across the start/finish straight facing the pit complex on a deep grounded concrete plinth (zero floating corners on sloped terrain).
  - Multi-tier stadium seating bowl divided by central access stairways, structural steel raker trusses, cantilevered stadium roof with colored accent fascia, glass front safety balustrade, stadium floodlights, and an elevated **live trackside broadcast screen** overlooking the grid.
- **Animated Telemetry-Reactive Crowd**:
  - Instanced multi-part articulated spectators (torso, head/cap, independently animated left/right arms) seated in the main grandstand and perimeter corner fan zones, waving team banners and executing standing ovations, cheering arm pumps, and traveling Mexican waves triggered by close overtakes, high-speed flybys, drift/high-G corners, and podium finishes.

#### D. Circuit Redesigns & Static Scenery (Maps 2–4 + Static Foliage)
- **Map 1 — Aurelia Ridge GT (Route Preserved)**: Retains exact spline geometry, elevation, and twin-pylon cable-stayed bridge; receives the new weathered road, 3D curbs, drainage grates, upgraded FIA pit complex, expanded opposite main grandstand + screen, richer crowd, and static alpine pines/cypresses.
- **Map 2 — Coral Bay Coastal GT (Brand-New Route & Scenery)**:
  - **New Route**: Sweeping harborfront start/finish straight leading into a fast coastal S-bend, an elevated Reef Causeway Arch Bridge crossing a turquoise lagoon, an outer headland lighthouse loop with ocean cliffs, and a tight Marina Yacht Chicane returning to the beachfront pit complex.
  - **Scenery**: Sculpted sandy coves, coastal limestone bluffs, deep harbor basin, luxury yachts and piers, lighthouse headland, resort boardwalk, and static multi-part coconut palms and coastal scrub.
- **Map 3 — Frostpeak Glacier (Brand-New Route & Scenery)**:
  - **New Route**: Wide high-altitude valley straight descending into twin rhythmic alpine hairpins, sweeping across a dramatic steel-arch bridge over a carved glacier crevasse lake, climbing through a banked ice-wall bowl, and threading an avalanche-gallery corner back to the heated paddock ridge.
  - **Scenery**: Sharp carved glacier peaks, frozen turquoise crevasse basin, ski chalet village, active slalom gates, overhead cable-car gondola line, snow-drift fences, and static frost-dusted conifers.
- **Map 4 — Kestrel Peaks (Brand-New Route & Scenery)**:
  - **New Route**: Dramatic highland canyon-to-summit pass featuring a valley paddock straight, fast sweeping meadow curves, a multi-arch Highland Stone Viaduct over a gorge waterfall, technical stacked Dolomite hairpins, a ribbed rock-cut mountain gallery tunnel, and a thrilling ridge sprint to the Summit Observatory.
  - **Scenery**: Stratified limestone cliffs, cascading gorge waterfall, stone watchtower, alpine refuge lodge, summit observatory dome, and static highland pines and birches.

---

### 3. Key Product Decisions & Trade-Offs

- **Unified Shared Pit/Grandstand Architecture vs. Per-Map Bespoke Geometry**:
  - *Chosen Approach*: Build a shared, parameterized FIA Pit Building & Opposite Grandstand architectural kit aligned to each map's exact pit frame and terrain elevation, customized per biome via regional materials (brushed aluminum/amber, coastal teak/cyan, alpine timber/ice-blue, Dolomite stone/emerald).
  - *Why*: Guarantees every circuit has consistent FIA Grade-1 structural fidelity, zero floating corners, accurate collision boxes, and unified crowd integration without duplicated geometry bugs.
  - *Alternatives Considered*: Four completely disconnected manual buildings, which previously caused uneven quality, misaligned pit aprons, and sparse opposite grandstands.
- **Separate Manual DRS Override from Auto-Deployment Mode**:
  - *Chosen Approach*: Decouple manual DRS deploy/retract triggers during live driving from permanently overwriting the driver's Auto-Deployment preference (`Auto` vs `Manual`), using a clear manual override / latch control in the Setup area alongside the Auto mode toggle.
  - *Why*: Drivers explicitly asked for a manual DRS toggle separate from the auto-deployment system; flipping Auto off permanently whenever they tap DRS once is frustrating during a race.
  - *Alternatives Considered*: Forcing `activeAeroMode = 'manual'` on click, which broke auto-deployment for the rest of the session.
- **Sub-Step Precision for Live Brake Bias (`0.5` Increments)**:
  - *Chosen Approach*: Remove integer rounding in the physics dial setter and align the Setup slider, in-race MFD buttons, and keyboard hotkeys on continuous `0.5` steps from `-5.0` to `+5.0`.
  - *Why*: Keeps slider adjustments smooth, prevents jarring jump-snaps when tweaking bias under braking, and ensures Setup drawer and Cockpit MFD stay 100% synchronized.
- **Removing Vertex-Shader Wind Sway on Trees Only**:
  - *Chosen Approach*: Strip wind displacement shaders from all tree trunks, canopies, palm crowns, and bushes across all four maps while retaining wind animation strictly for cloth pit/marshal flags and particle mist/snow.
  - *Why*: Directly fulfills the request to disable wind-based tree turning while keeping trackside flags alive as useful wind/weather cues.

---

### 4. Technical Architecture & Data Strategy

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         UI & LIVE TUNING LAYER                            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Tuning Drawer (Normal Setup Area)                                   │  │
│  │  • Optional Active Aero DRS Toggle (Manual Deploy / Retract Wing)   │  │
│  │  • Separate Auto-Deployment Mode Selector (Auto / Manual / Fixed)   │  │
│  │  • Optional Dynamic Brake Bias Slider (-5.0 R .. +5.0 F, 0.5 step)  │  │
│  └──────────────────────────┬───────────────────────┬──────────────────┘  │
└─────────────────────────────┼───────────────────────┼─────────────────────┘
                              │ Live Sync             │ Live Sync
                              ▼                       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      PHYSICS & TELEMETRY CONTROLLER                       │
│  • Manual DRS Wing Override <-> Auto Corner/Straight Aero Solver          │
│  • Unified Brake Bias State <-> Front/Rear Hydraulic Torque Split & MFD   │
│  • Car Wing Actuator Animation + Crowd Excitement Telemetry Bus           │
└─────────────────────────────┬─────────────────────────────────────────────┘
                              │ Active Map Rebuild & Frame Tick
                              ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     CIRCUIT & 3D WORLD ARCHITECTURE                       │
│  ┌──────────────────────┐   ┌──────────────────────────────────────────┐  │
│  │ Spline & Terrain Bus │   │ Shared Track & Paddock Architecture      │  │
│  │ • Aurelia (Same Route│   │ • Weathered Asphalt + Rubber Groove      │  │
│  │ • Coral Bay (New)    │──▶│ • 3D Beveled Curbs + Drainage Grates     │  │
│  │ • Frostpeak (New)    │   │ • Modern FIA Pit Garages & Pit Wall      │  │
│  │ • Kestrel (New)      │   │ • Opposite Covered Grandstand + Screen   │  │
│  └──────────────────────┘   │ • Instanced Articulated Crowd + Banners  │  │
│                             └──────────────────────────────────────────┘  │
│                             ┌──────────────────────────────────────────┐  │
│                             │ Static Biome Scenery & Landmarks         │  │
│                             │ • Trees/Palms/Shrubs (Wind Sway Removed) │  │
│                             │ • Bridges, Viaducts, Tunnels, Waterfalls │  │
│                             └──────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

- **State & Physics Sync Mapping**:
  - **Active Aero DRS**: Tuning Drawer toggle invokes live DRS deployment/retraction on the active physics instance without erasing the user's `Auto` mode flag (or cleanly transitions manual DRS latch when triggered), updating rear wing angle in the car visual rig and telemetry (`aeroDeployed`, `aeroMode`).
  - **Brake Bias**: Tuning Drawer slider (`-5.0` to `+5.0`, `0.5` step) mutates `carSetup.brakeBalance` and mirrors directly into `cockpitDials.brakeBalance` (and vice-versa when adjusted via MFD/hotkeys) with zero vehicle reset.
  - **Map Pipeline**: Updating the control points and pit frames for Coral Bay, Frostpeak Glacier, and Kestrel Peaks automatically updates spline sampling, road/curb/drainage ribbons, terrain carving, pit-lane collision/speed-limiter bounds, camera vantages, minimap SVG paths, and opposite grandstand alignment.
- **Performance & Rendering Safeguards**:
  - Repeated 3D curbs, drainage grates, guardrails, pit-wall stanchions, trees, and spectators use `InstancedMesh` / merged static geometry with computed bounding spheres, explicit `SRGBColorSpace` on procedural albedo textures, max anisotropy filtering, and zero `backdrop-filter` over the WebGL canvas.
