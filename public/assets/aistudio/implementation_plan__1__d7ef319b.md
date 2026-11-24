# Apex GT Overhaul: Clean Toggleable HUD, Performance Streaming, Baseplate Studio & Summit Climb

This overhaul strips back visual clutter in the driving HUD with full per-widget toggles, dramatically boosts frame rate via area-wise chunk streaming and automatic background freezing when menus or popups open, transforms the Map Builder into a true flat-baseplate 3D studio with automatic road tunnels and deep customization, remakes the mountain circuit into a real point-to-point Summit Climb, adds real-time free-roam Race Invitations, adds Explore Maps filters, and fixes the top-bar active map title synchronization.

---

### User Review & Critical Decisions

> [!IMPORTANT] All three core product and performance decisions were confirmed during clarification and drive the architecture below.

- **Confirmed Decision 1 — Fully Toggleable HUD (Clean Default)**: Every HUD element (track/weather status bar, Tune & Aero Auto buttons, Tire/Fuel MFD dials, Pit Strategy panel, Engine Health card, Track Rubbering bar, Minimap, Lap Timer, Speedometer, and Party Feed) gets an individual visibility toggle stored in user preferences and cloud progress. The noisy telemetry strips (`asphalt`, `overcast`, `AUTO`, `Tune`, `Aero Auto`, Tire/Fuel MFD dials, Pit Plans, Engine Health) are **OFF by default**.
- **Confirmed Decision 2 — Flat Studio Baseplate & Point-to-Point Summit Climb**: Blank Build Map workspaces load on a clean, unobstructed **flat studio baseplate** (no pre-built mountains or trees blocking your canvas), while the **Kestrel Peaks** mountain map is rebuilt as a true **point-to-point Summit Climb** ascending the mountain face via switchbacks to the peak summit.
- **Confirmed Decision 3 — Background Freeze on Popups + Area-Wise Chunk Loading**: Opening any modal, race setup drawer, Social Hub, Auth modal, or Studio sub-panel immediately **freezes the 3D WebGL render & physics loop**, dropping GPU/CPU background load to near zero. During driving and building, spatial area-wise chunk streaming plus throttled HUD updates eliminate frame drops.

---

### 1. Overview & Core Concept

- **What It Does**:
  - **Clean Driving Experience**: Launches races with an uncluttered cockpit/chase view focused on speed, gear, lap/race progress, and minimap—while letting telemetry enthusiasts re-enable MFD dials, pit plans, engine health, and surface metrics from HUD Display settings.
  - **High-FPS Spatial Engine**: Streams world terrain, foliage, props, and road details by distance & camera frustum chunk zones, throttles React HUD sync from 60Hz to ~15–20Hz, and freezes the WebGL canvas whenever UI overlays are active.
  - **Real-Time Free-Roam Challenges**: Friends in a party or lobby can send direct Race Invitations that surface immediately as a floating action toast while cruising in Free-Roam (`Explore`) or the Garage.
  - **Explore Discovery Filters**: Filter and sort community maps by **Map Type** (`Circuit`, `Sprint`, `Drift`, `Stunt`), **Difficulty** (`Easy`, `Medium`, `Hard`, `Extreme`), and **Popularity / Top Rated / Newest**.
  - **True 3D Baseplate Studio + Auto Tunnels**: Build tracks from scratch on a clean baseplate using 24+ props, full 3D gizmo/numeric transforms, surface/theme customization, and **automatic 3D tunnels** wherever a lower road passes beneath an elevated road or terrain ridge.
  - **Mountain Summit Ascent**: Climbs from Basecamp Paddock up dramatic hairpin terraces, bridges, and rock galleries to the Mountain Peak finish gantry.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Garage & Race Setup Freeze**: Opening Track Select, Social Hub, Settings, Tuning, or Race Setup pauses the background 3D loop immediately so UI clicks respond in under 50ms with zero fan spin or lag.
  2. **Clean Driving -> Toggle HUD**: Player starts a race with only essential driving gauges (`Speed`, `Gear`, `Lap/Pos`, `Minimap`). Clicking Settings → `HUD Layout` (or pressing the HUD Customize button) exposes toggles for every individual element plus `Clean`, `Standard`, and `Pro Telemetry` presets.
  3. **Free-Roam Race Invitation**: While cruising in Explore/Free-Roam, a floating GT Motorsport challenge banner slides into the top-center zone displaying the challenger's handle, track name, event mode, difficulty, and one-click `Accept & Race` / `Decline` buttons with a 25-second expiry bar.
  4. **Explore Maps Browser**: Filter bar lets players combine `Map Type`, `Difficulty`, search text, and `Most Popular` / `Top Rated` / `Newest` sorting across published custom tracks.
  5. **Baseplate Map Studio**: Entering `Build Map` clears the valley into an expansive flat studio baseplate with subtle metric gridlines. Players draw splines, adjust per-node elevation/banking, stack crossover roads (automatically generating lit concrete tunnels underneath elevated sections), place 24+ categorized props with full Position/Rotation/Scale controls, customize baseplate & kerb materials, and publish with Difficulty + Map Type tags.
  6. **Top Bar Map Title Sync**: Switching between Official Tracks (`Aurelia Ridge`, `Coral Bay`, `Frostpeak Glacier`, `Kestrel Summit Climb`) or Community/Custom tracks updates the top header immediately in both Garage and In-Game HUD.

- **Visual Identity & Theme**:
  - **Aesthetic Direction**: Gran Turismo-inspired dark carbon motorsport cockpit (`--surface: #0b0e14`, `--panel: #111622`, crisp `1px solid rgba(255,255,255,0.12)` hairlines, amber `#f59e0b` and racing sky-blue `#38bdf8` focal accents).
  - **Typography**: Condensed geometric display headings (`Oswald` / `Barlow Condensed`) paired with `Plus Jakarta Sans` UI labels and strict `tabular-nums` monospace readouts for lap times, telemetry, and XYZ transform values.
  - **Zero-Clutter Discipline**: No unrequested telemetry badges (`auto asphalt`, `overcast`, `Engine Health`) cluttering the driving screen; unboxed typographic separators (`·`) instead of nested pill clusters; instant `150ms` compositor transitions.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Background Freeze via Controller Flag vs. Destroying WebGL Context**
  - *Chosen Approach*: Expose `setBackgroundFrozen(frozen)` on the 3D controller so opening any modal, setup menu, or studio modal renders one crisp static frame and halts `requestAnimationFrame` work until closed.
  - *Why*: Destroying/rebuilding WebGL contexts causes 2–4 second stalls on reopen; pausing the render loop frees 100% of frame CPU/GPU instantly with zero reload delay.
- **Decision 2 — Flat Baseplate Studio vs. Editing Inside Full Official Valley**
  - *Chosen Approach*: When editing or playing a user-created map tagged with the studio baseplate mode, bypass the heavy procedural forest/mountain valley and render a high-FPS architectural baseplate + user terrain sculpts + user road + auto-tunnels + placed props.
  - *Why*: Eliminates pre-existing mountain terrain intersection issues, cuts Studio GPU triangles by ~80%, and gives creators a true blank canvas.
- **Decision 3 — Automatic Crossover Tunnel Detection**
  - *Chosen Approach*: Analyze spline sample self-proximity and vertical separation (`upperY - lowerY >= 4.5m` within horizontal clearance) during circuit compilation to flag `isTunnel` segments on the lower road and `isBridge` on the upper span, clearing terrain vertices cleanly and generating 3D portal arches, vaulted walls, and interior strip lights.
  - *Why*: Guarantees stacked figure-8s, overpasses, and mountain underpasses automatically look cohesive and stay drivable without manual tunnel placement.
- **Decision 4 — Point-to-Point Summit Climb Physics & Timing**
  - *Chosen Approach*: Rebuild Kestrel Peaks (`kestrel_peaks`) with `closedLoop: false`, starting at Valley Basecamp (`~18m`) and climbing continuously along the mountain spine through switchbacks and rock tunnels to the Summit Observatory (`~310m`). Race completion triggers cleanly upon crossing the Summit finish gantry (`t >= 0.992`), with a single-run Climb Leaderboard & split sectors.
  - *Why*: Delivers an authentic Pikes Peak / alpine hill-climb experience instead of circling the base of the peak.

---

### 4. Technical Architecture & Data Strategy

```
┌───────────────────────────────────────────────────────────────────────────┐
│                         App Shell & Global Overlay                        │
│  ┌──────────────┐  ┌───────────────────┐  ┌────────────────────────────┐  │
│  │ Freeze Guard │  │ Top Map Title Bus │  │ Floating Race Invite Toast │  │
│  └──────┬───────┘  └─────────┬─────────┘  └─────────────▲──────────────┘  │
└─────────┼────────────────────┼──────────────────────────┼─────────────────┘
          │ pause RAF          │ activeTitle              │ WebSocket push
          ▼                    ▼                          │
┌────────────────────┐  ┌─────────────────┐  ┌────────────┴───────────────┐
│ 3D Spatial Engine  │  │ HUD Visibility  │  │ Social / Party WS & REST   │
│ · Area Chunk Grid  │  │ Config Store    │  │ · Direct Race Invite Event │
│ · 18Hz UI Throttle │  │ (All Toggleable │  │ · Explore Map Filters      │
│ · Baseplate Mode   │  │  Default Clean) │  │   (Type, Diff, Popularity) │
│ · Auto-Tunnel Gen  │  └─────────────────┘  └────────────────────────────┘
│ · Summit Climb Map │
└────────────────────┘
```

- **Performance & Area-Wise Streaming Pipeline**:
  - Track/terrain/prop worlds partition geometry and instanced batches into spatial grid cells (`~220m` chunks). Each frame checks only the chunks within the active visibility horizon around the car/camera, hiding distant terrain tiles, trees, guardrails, buildings, and parked props.
  - Telemetry sync (`onTelemetry`) throttles React state commits to ~18Hz instead of 60Hz, eliminating React layout thrash during racing.
  - Studio terrain/spline edits preview lightweight path lines instantaneously while debouncing full mesh rebuilds cleanly.
- **Data Model Extensions**:
  - `HudVisibilityConfig`: Per-widget boolean flags persisted in local storage and synced with cloud `UserProgressData`.
  - `CustomMapBlueprint` & SQLite `custom_maps`: Add `mapType` (`circuit` | `sprint` | `drift` | `stunt`), `difficulty` (`easy` | `medium` | `hard` | `extreme`), `baseplateTheme`, `roadSurfaceTheme`, `kerbTheme`, and optional tunnel/lighting overrides, indexed for Explore filtering.
  - `RaceChallengeInvite` WebSocket event: Direct peer challenge payload (`fromUser`, `roomId`, `roomCode`, `mapTitle`, `mapType`, `difficulty`, `activityMode`) broadcast instantly to the targeted online friend regardless of whether they are in Garage or Free-Roam.
- **Summit Climb Track Geometry & Tunnel Integration**:
  - `kestrel_peaks` uses an open-ended Catmull-Rom spline climbing from `z = +620, y = 18m` up switchbacks across the central massif to Summit Peak (`y = 310m`), with mountain terrain sculpted underneath and terraced cleanly along the ascent.
  - Any spline pass where `upperSample.y - lowerSample.y >= 4.5m` activates automatic bridge piers on the upper segment and a full concrete tunnel vault + lighting + ceiling clearance on the lower segment.
