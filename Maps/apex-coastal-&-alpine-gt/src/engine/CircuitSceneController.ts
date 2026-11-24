import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { applyLayoutPreset, buildTrackSplineData } from '../tracks/circuitSpline';
import { buildCoralBayLandmarksAndProps, type CoralBayPropsHandle } from '../tracks/coralBayLandmarksAndProps';
import { buildCoralBayRoadAndCauseway, type CoralBayRoadHandle } from '../tracks/coralBayRoadBuilder';
import { buildCoralBayTerrainAndWater, type CoralBayTerrainHandle } from '../tracks/coralBayTerrainBuilder';
import { createCoralBayTerrainField } from '../tracks/coralBayTerrainField';
import { buildFrostpeakLandmarksAndProps, type FrostpeakPropsHandle } from '../tracks/frostpeakLandmarksAndProps';
import { buildFrostpeakRoadAndArchBridge, type FrostpeakRoadHandle } from '../tracks/frostpeakRoadBuilder';
import { buildFrostpeakTerrainAndGlacier, type FrostpeakTerrainHandle } from '../tracks/frostpeakTerrainBuilder';
import { createFrostpeakTerrainField } from '../tracks/frostpeakTerrainField';
import { getMapDefinition, getPresetAtmosphere } from '../tracks/mapRegistry';
import { createProceduralTextureSet, type ProceduralTextureSet } from '../tracks/proceduralTextures';
import { clamp, withRoadCorridorCarving } from '../tracks/terrainField';
import type {
  CameraVantageId,
  ColliderRegistry,
  LayoutPresetId,
  MapDefinition,
  MapId,
  TerrainField,
  TrackSplineData,
} from '../tracks/types';
import { GtAudioEngine } from './audioEngine';
import {
  createInitialCarState,
  stepCarPhysics,
  type CarInput,
  type CarState,
} from './collisionPhysics';
import { buildGtVehicle, type GtVehicleRig } from './gtVehicleBuilder';

export type AppPhase = 'title' | 'playing' | 'paused';

export interface WeatherSettings {
  solarDeg: number;
  haze: number;
  wetness: number;
  snowAccum: number;
  waterChop: number;
  waterClarity: number;
}

export interface TelemetrySnapshot {
  speedKmh: number;
  gear: number;
  rpm: number;
  lap: number;
  lapTime: number;
  bestLapTime: number | null;
  sectorId: 'S1' | 'S2' | 'S3';
  sectorName: string;
  onRoad: boolean;
  inPitLane: boolean;
  trackLengthKm: number;
  elevationDeltaM: number;
  isSoftwareGl: boolean;
  controlPoints: [number, number, number][];
}

// Pre-allocated zero-GC scratch vectors
const _camDesired = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _rayPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _rayHit = new THREE.Vector3();
const _ndc = new THREE.Vector2();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class CircuitSceneController {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  private textures: ProceduralTextureSet;
  private audio = new GtAudioEngine();

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private skyMat: THREE.ShaderMaterial;
  private skyMesh: THREE.Mesh;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private outputPass: OutputPass;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private lastEnvKey = '';

  private mapRoot = new THREE.Group();
  private waypointRoot = new THREE.Group();
  private vehicleRig: GtVehicleRig;

  private mapId: MapId = 'coral_bay';
  private layoutPreset: LayoutPresetId = 'original';
  private vantage: CameraVantageId = 'chase';
  private appPhase: AppPhase = 'title';
  private editorActive = false;

  private weather: WeatherSettings;
  private mapDef: MapDefinition;
  private controlPoints: [number, number, number][];
  private splineData!: TrackSplineData;
  private terrainField!: TerrainField;
  private registry!: ColliderRegistry;
  private carState!: CarState;

  // Active map sub-handles
  private cbTerrain: CoralBayTerrainHandle | null = null;
  private cbRoad: CoralBayRoadHandle | null = null;
  private cbProps: CoralBayPropsHandle | null = null;
  private fpTerrain: FrostpeakTerrainHandle | null = null;
  private fpRoad: FrostpeakRoadHandle | null = null;
  private fpProps: FrostpeakPropsHandle | null = null;

  // Waypoint markers for interactive spline editing
  private waypointMarkers: { index: number; mesh: THREE.Mesh; label: string }[] = [];
  private draggingWaypointIdx: number | null = null;
  private raycaster = new THREE.Raycaster();

  // Camera transition state
  private cameraDampingActive = false;
  private userOrbiting = false;
  private keysPressed = new Set<string>();

  // Loop management
  private frameId = 0;
  private isTimeoutId = false;
  private disposed = false;
  private lastTimestamp = 0;
  private elapsedTime = 0;
  private lastTelemetryEmit = 0;
  private onTelemetry: (snap: TelemetrySnapshot) => void;
  private resizeObserver: ResizeObserver;
  private lastViewportW = 0;
  private lastViewportH = 0;

  constructor(
    container: HTMLElement,
    initialMapId: MapId,
    onTelemetry: (snap: TelemetrySnapshot) => void
  ) {
    this.container = container;
    this.onTelemetry = onTelemetry;
    this.mapId = initialMapId;
    this.mapDef = getMapDefinition(initialMapId);
    this.weather = {
      solarDeg: this.mapDef.defaultSolarDeg,
      haze: this.mapDef.defaultHaze,
      wetness: initialMapId === 'frostpeak_pass' ? 0.38 : 0.36,
      snowAccum: 0.65,
      waterChop: 0.45,
      waterClarity: 0.82,
    };

    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.96;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const rect = container.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width || window.innerWidth));
    const h = Math.max(240, Math.round(rect.height || window.innerHeight));
    this.lastViewportW = w;
    this.lastViewportH = h;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xd8b89c, 0.00085);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.5, 2400);
    this.camera.position.set(-45, 22, 235);

    const maxSamples = this.renderer.capabilities.isWebGL2
      ? Math.min(2, this.renderer.capabilities.maxSamples || 0)
      : 0;
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples: this.isSoftwareGl ? 0 : maxSamples,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.14, 0.35, 1.55);
    this.composer.addPass(this.bloomPass);
    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 780;
    this.controls.enabled = false;
    this.controls.addEventListener('start', () => {
      this.userOrbiting = true;
      this.cameraDampingActive = false;
    });
    this.controls.addEventListener('end', () => {
      this.userOrbiting = false;
    });

    // 3-Point Warm/Cool Outdoor Rig
    this.hemiLight = new THREE.HemisphereLight(0xd9bfa8, 0x222b1e, 0.64);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffcf94, 2.65);
    this.sunLight.position.set(240, 80, -90);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 750;
    const d = 260;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    // Atmospheric Golden-Hour Gradient + High-Altitude Cloud Streak Sky Dome
    const skyGeo = new THREE.SphereGeometry(1400, 32, 20);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color('#3b7cb8') },
        uHorizonColor: { value: new THREE.Color('#eab78a') },
        uSunDir: { value: new THREE.Vector3(0.92, 0.27, -0.34).normalize() },
        uSunColor: { value: new THREE.Color('#ffc884') },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        varying vec3 vWorldDir;

        float skyHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float skyNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(skyHash(i), skyHash(i + vec2(1.0, 0.0)), u.x),
            mix(skyHash(i + vec2(0.0, 1.0)), skyHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }
        float skyFbm(vec2 p) {
          float sum = 0.0;
          float amp = 0.5;
          for (int i = 0; i < 4; i++) {
            sum += skyNoise(p) * amp;
            p = p * 2.04 + vec2(3.7, -2.3);
            amp *= 0.5;
          }
          return sum;
        }

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.46));

          float sunDot = max(dot(dir, uSunDir), 0.0);
          // Warm atmospheric Mie scattering + clean solar disc
          col += uSunColor * (pow(sunDot, 5.0) * 0.18 + pow(sunDot, 48.0) * 0.40 + smoothstep(0.9991, 0.9997, sunDot) * 2.4);

          // Multi-octave FBM dramatic clouds with dark slate undersides & golden-hour lit rims
          vec2 cloudUv = dir.xz / (max(dir.y, 0.08) + 0.14);
          float cBase = skyFbm(cloudUv * 0.88 + vec2(2.1, -1.3));
          float cDetail = skyFbm(cloudUv * 2.25 + vec2(-4.5, 3.1) + cBase * 0.45);
          float cloudMask = smoothstep(0.45, 0.76, cBase * 0.65 + cDetail * 0.35) * smoothstep(0.03, 0.22, dir.y);
          vec3 cloudShadow = mix(uTopColor * 0.38, vec3(0.09, 0.12, 0.18), 0.52);
          vec3 cloudLit = mix(uHorizonColor * 1.04, uSunColor * 1.25, pow(sunDot, 1.9) * 0.85);
          float cloudEdgeLight = smoothstep(0.38, 0.78, cDetail) * 0.48 + pow(sunDot, 2.4) * 0.52;
          vec3 cloudCol = mix(cloudShadow, cloudLit, clamp(cloudEdgeLight, 0.0, 1.0));
          col = mix(col, cloudCol, cloudMask * 0.68);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    this.scene.add(this.skyMesh);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextureSet(maxAniso);

    this.scene.add(this.mapRoot);
    this.scene.add(this.waypointRoot);

    this.vehicleRig = buildGtVehicle(this.mapDef.accent);
    this.scene.add(this.vehicleRig.root);

    this.controlPoints = applyLayoutPreset(this.mapDef, this.layoutPreset);
    this.rebuildMapScene();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    // Paint initial frame immediately so the viewport is never blank at startup
    this.updateCamera(0.016);
    this.cbTerrain?.updateChunkCulling(this.camera.position);
    this.fpTerrain?.updateChunkCulling(this.camera.position);
    this.composer.render();

    this.lastTimestamp = performance.now();
    this.scheduleNextFrame();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('webglcontextlost', this.onContextLost);
  }

  private unbindEvents(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    this.keysPressed.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysPressed.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.keysPressed.clear();
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) this.keysPressed.clear();
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.editorActive || this.waypointMarkers.length === 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    _ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_ndc, this.camera);
    const meshes = this.waypointMarkers.map((w) => w.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const hitObj = hits[0].object;
      const found = this.waypointMarkers.find((w) => w.mesh === hitObj);
      if (found) {
        this.draggingWaypointIdx = found.index;
        this.controls.enabled = false;
        _rayPlane.constant = -this.controlPoints[found.index][1];
      }
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.draggingWaypointIdx === null) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    _ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(_ndc, this.camera);
    if (this.raycaster.ray.intersectPlane(_rayPlane, _rayHit)) {
      const nx = clamp(_rayHit.x, -440, 440);
      const nz = clamp(_rayHit.z, -440, 440);
      const currY = this.controlPoints[this.draggingWaypointIdx][1];
      this.controlPoints[this.draggingWaypointIdx] = [nx, currY, nz];
      const marker = this.waypointMarkers.find((w) => w.index === this.draggingWaypointIdx);
      if (marker) {
        marker.mesh.position.set(nx, currY + 4.5, nz);
      }
    }
  };

  private onPointerUp = (): void => {
    if (this.draggingWaypointIdx !== null) {
      this.draggingWaypointIdx = null;
      if (this.vantage !== 'chase') this.controls.enabled = true;
      this.rebuildTrackOnly();
    }
  };

  private handleResize(): void {
    const rect = this.container.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width || window.innerWidth));
    const h = Math.max(240, Math.round(rect.height || window.innerHeight));
    if (w === this.lastViewportW && h === this.lastViewportH) return;
    this.lastViewportW = w;
    this.lastViewportH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
    this.composer.render();
  }

  public setAppPhase(phase: AppPhase): void {
    const prev = this.appPhase;
    this.appPhase = phase;
    if (phase !== 'playing') {
      this.keysPressed.clear();
      this.audio.update(1000, 0, false);
    }
    if (prev !== phase) {
      this.snapCameraImmediate();
      this.cbTerrain?.updateChunkCulling(this.camera.position);
      this.fpTerrain?.updateChunkCulling(this.camera.position);
      this.composer.render();
    }
  }

  public setMuted(muted: boolean): void {
    this.audio.setMuted(muted);
  }

  public setMap(mapId: MapId): void {
    if (this.mapId === mapId) return;
    this.mapId = mapId;
    this.mapDef = getMapDefinition(mapId);
    this.layoutPreset = 'original';
    this.weather.solarDeg = this.mapDef.defaultSolarDeg;
    this.weather.haze = this.mapDef.defaultHaze;
    this.weather.wetness = mapId === 'frostpeak_pass' ? 0.38 : 0.36;
    this.controlPoints = applyLayoutPreset(this.mapDef, this.layoutPreset);
    this.rebuildMapScene();
    this.setCameraVantage(this.vantage);
    this.cbTerrain?.updateChunkCulling(this.camera.position);
    this.fpTerrain?.updateChunkCulling(this.camera.position);
    this.composer.render();
    this.emitTelemetry(true);
  }

  public setLayoutPreset(preset: LayoutPresetId): void {
    if (this.layoutPreset === preset) return;
    this.layoutPreset = preset;
    this.controlPoints = applyLayoutPreset(this.mapDef, preset);
    this.rebuildTrackOnly();
    this.cbTerrain?.updateChunkCulling(this.camera.position);
    this.fpTerrain?.updateChunkCulling(this.camera.position);
    this.composer.render();
    this.emitTelemetry(true);
  }

  public nudgeWaypoint(index: number, dx: number, dy: number, dz: number): void {
    if (this.mapDef.lockedControlIndices.includes(index)) return;
    const pt = this.controlPoints[index];
    if (!pt) return;
    this.controlPoints[index] = [
      clamp(pt[0] + dx, -440, 440),
      clamp(pt[1] + dy, this.mapDef.minSplineY, 55),
      clamp(pt[2] + dz, -440, 440),
    ];
    this.rebuildTrackOnly();
    this.emitTelemetry(true);
  }

  public setEditorActive(active: boolean): void {
    this.editorActive = active;
    this.waypointRoot.visible = active;
    if (active && this.vantage === 'chase') {
      this.setCameraVantage('overview');
    }
  }

  public setCameraVantage(vantage: CameraVantageId): void {
    this.vantage = vantage;
    if (vantage === 'chase') {
      this.controls.enabled = false;
      this.cameraDampingActive = false;
      this.snapCameraImmediate();
    } else {
      this.controls.enabled = true;
      const spec = this.mapDef.vantages.find((v) => v.id === vantage);
      if (spec) {
        this.camera.fov = spec.fov ?? 48;
        this.camera.updateProjectionMatrix();
        this.controls.target.set(spec.target[0], spec.target[1], spec.target[2]);
        const dist = Math.hypot(
          this.camera.position.x - spec.position[0],
          this.camera.position.y - spec.position[1],
          this.camera.position.z - spec.position[2]
        );
        if (this.isSoftwareGl || dist > 45) {
          this.camera.position.set(spec.position[0], spec.position[1], spec.position[2]);
          this.cameraDampingActive = false;
          this.controls.update();
        } else {
          this.cameraDampingActive = true;
        }
      }
    }
  }

  private snapCameraImmediate(): void {
    if (this.appPhase === 'title') {
      const targetY = this.mapId === 'coral_bay' ? 12 : 34;
      this.camera.position.set(220, targetY + 125, 290);
      this.camera.lookAt(0, targetY, -25);
      return;
    }
    if (this.vantage === 'chase') {
      const car = this.carState;
      const fx = Math.cos(car.heading);
      const fz = Math.sin(car.heading);
      this.camera.position.set(car.x - fx * 9.0, car.y + 3.4, car.z - fz * 9.0);
      this.camera.lookAt(car.x + fx * 12, car.y + 1.1, car.z + fz * 12);
      this.camera.fov = 50;
      this.camera.updateProjectionMatrix();
    } else {
      const spec = this.mapDef.vantages.find((v) => v.id === this.vantage);
      if (spec) {
        this.camera.position.set(spec.position[0], spec.position[1], spec.position[2]);
        this.controls.target.set(spec.target[0], spec.target[1], spec.target[2]);
        this.camera.fov = spec.fov ?? 48;
        this.camera.updateProjectionMatrix();
        this.controls.update();
      }
    }
  }

  public resetCarToGrid(): void {
    this.carState = createInitialCarState(this.mapDef, this.splineData.samples);
  }

  public updateWeather(next: Partial<WeatherSettings>): void {
    this.weather = { ...this.weather, ...next };
    this.applyAtmosphere();
    this.cbRoad?.setWetness(this.weather.wetness);
    this.fpRoad?.setWetness(this.weather.wetness);
    this.fpRoad?.setSnowAccumulation(this.weather.snowAccum);
    this.fpProps?.setSnowAccumulation(this.weather.snowAccum);
  }

  private refreshEnvironmentIbl(
    skyTop: string,
    skyHorizon: string,
    sunDir: THREE.Vector3,
    sunColor: string
  ): void {
    const envKey = `${this.mapId}:${Math.round(this.weather.solarDeg / 3)}:${Math.round(this.weather.haze * 4)}`;
    if (envKey === this.lastEnvKey && this.envRenderTarget) return;
    this.lastEnvKey = envKey;

    const envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(24, 24, 16);
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTop: { value: new THREE.Color(skyTop) },
        uHor: { value: new THREE.Color(skyHorizon) },
        uSunDir: { value: sunDir.clone() },
        uSunCol: { value: new THREE.Color(sunColor) },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uHor;
        uniform vec3 uSunDir;
        uniform vec3 uSunCol;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          vec3 sky = mix(uHor, uTop, pow(clamp(d.y, 0.0, 1.0), 0.55));
          vec3 ground = vec3(0.035, 0.032, 0.028);
          vec3 base = d.y >= 0.0 ? sky : mix(uHor * 0.45, ground, clamp(-d.y * 3.0, 0.0, 1.0));
          float s = max(dot(d, uSunDir), 0.0);
          base += uSunCol * (pow(s, 8.0) * 0.42 + pow(s, 48.0) * 1.15);
          gl_FragColor = vec4(base, 1.0);
        }
      `,
    });
    const envDome = new THREE.Mesh(envGeo, envMat);
    envScene.add(envDome);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const nextRt = pmrem.fromScene(envScene, 0.03);
    pmrem.dispose();
    envGeo.dispose();
    envMat.dispose();

    if (this.envRenderTarget) {
      this.envRenderTarget.dispose();
    }
    this.envRenderTarget = nextRt;
    this.scene.environment = nextRt.texture;
  }

  private applyAtmosphere(): void {
    const atmo = getPresetAtmosphere(this.mapId, this.weather.solarDeg, this.weather.haze);
    this.skyMat.uniforms.uTopColor.value.set(atmo.skyTopColor);
    this.skyMat.uniforms.uHorizonColor.value.set(atmo.skyHorizonColor);
    this.skyMat.uniforms.uSunColor.value.set(atmo.sunColor);

    const elevRad = THREE.MathUtils.degToRad(Math.max(1, this.weather.solarDeg));
    const dirX = this.mapId === 'coral_bay' ? 0.985 : -0.985;
    const dirZ = this.mapId === 'coral_bay' ? -0.17 : 0.17;
    const sunVec = this.skyMat.uniforms.uSunDir.value
      .set(Math.cos(elevRad) * dirX, Math.sin(elevRad), Math.cos(elevRad) * dirZ)
      .normalize();
    this.sunLight.position.copy(sunVec).multiplyScalar(280);
    this.sunLight.color.set(atmo.sunColor);

    const nightFactor = clamp(1 - this.weather.solarDeg / 18, 0, 1);
    const daySunIntensity = this.mapId === 'frostpeak_pass' ? 1.38 : 1.85;
    this.sunLight.intensity = THREE.MathUtils.lerp(daySunIntensity, 0.28, nightFactor);
    this.hemiLight.color.set(atmo.hemiSkyColor);
    this.hemiLight.groundColor.set(atmo.hemiGroundColor);
    this.hemiLight.intensity = THREE.MathUtils.lerp(
      this.mapId === 'frostpeak_pass' ? 0.46 : 0.56,
      0.24,
      nightFactor
    );

    (this.scene.fog as THREE.FogExp2).color.set(atmo.fogColor);
    (this.scene.fog as THREE.FogExp2).density = atmo.fogDensity;

    this.refreshEnvironmentIbl(atmo.skyTopColor, atmo.skyHorizonColor, sunVec, atmo.sunColor);

    this.cbRoad?.setNightFactor(nightFactor);
    this.cbProps?.setNightFactor(nightFactor);
    this.fpRoad?.setNightFactor(nightFactor);
    this.fpProps?.setNightFactor(nightFactor);
  }

  private clearActiveMap(): void {
    this.cbTerrain?.dispose();
    this.cbRoad?.dispose();
    this.cbProps?.dispose();
    this.fpTerrain?.dispose();
    this.fpRoad?.dispose();
    this.fpProps?.dispose();
    this.cbTerrain = null;
    this.cbRoad = null;
    this.cbProps = null;
    this.fpTerrain = null;
    this.fpRoad = null;
    this.fpProps = null;

    while (this.mapRoot.children.length > 0) {
      this.mapRoot.remove(this.mapRoot.children[0]);
    }
    this.clearWaypointMarkers();
  }

  private clearWaypointMarkers(): void {
    for (const wm of this.waypointMarkers) {
      wm.mesh.geometry.dispose();
      (wm.mesh.material as THREE.Material).dispose();
      this.waypointRoot.remove(wm.mesh);
    }
    this.waypointMarkers = [];
  }

  private buildWaypointMarkers(): void {
    this.clearWaypointMarkers();
    const wpGeo = new THREE.OctahedronGeometry(3.2, 0);
    const accent = new THREE.Color(this.mapDef.accent);
    for (const wp of this.mapDef.editableWaypoints) {
      const pt = this.controlPoints[wp.index];
      const mat = new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 1.4,
        roughness: 0.2,
      });
      const mesh = new THREE.Mesh(wpGeo.clone(), mat);
      mesh.position.set(pt[0], pt[1] + 4.5, pt[2]);
      this.waypointRoot.add(mesh);
      this.waypointMarkers.push({ index: wp.index, mesh, label: wp.label });
    }
    wpGeo.dispose();
    this.waypointRoot.visible = this.editorActive;
  }

  private rebuildTrackOnly(): void {
    this.rebuildMapScene();
  }

  private rebuildMapScene(): void {
    this.clearActiveMap();
    this.registry = { obbs: [], circles: [], walls: [] };
    this.splineData = buildTrackSplineData(this.mapDef, this.controlPoints);

    if (this.mapId === 'coral_bay') {
      this.terrainField = withRoadCorridorCarving(
        createCoralBayTerrainField(),
        this.splineData.samples,
        this.mapDef.roadHalfWidth
      );
      this.cbTerrain = buildCoralBayTerrainAndWater(
        this.mapRoot,
        this.terrainField,
        this.textures,
        this.isSoftwareGl
      );
      this.cbRoad = buildCoralBayRoadAndCauseway(
        this.mapRoot,
        this.mapDef,
        this.splineData.samples,
        this.textures,
        this.registry
      );
      this.cbProps = buildCoralBayLandmarksAndProps(
        this.mapRoot,
        this.mapDef,
        this.splineData.samples,
        this.terrainField,
        this.registry,
        this.textures
      );
    } else {
      this.terrainField = withRoadCorridorCarving(
        createFrostpeakTerrainField(),
        this.splineData.samples,
        this.mapDef.roadHalfWidth
      );
      this.fpTerrain = buildFrostpeakTerrainAndGlacier(
        this.mapRoot,
        this.terrainField,
        this.textures,
        this.isSoftwareGl
      );
      this.fpRoad = buildFrostpeakRoadAndArchBridge(
        this.mapRoot,
        this.mapDef,
        this.splineData.samples,
        this.textures,
        this.registry
      );
      this.fpProps = buildFrostpeakLandmarksAndProps(
        this.mapRoot,
        this.mapDef,
        this.splineData.samples,
        this.terrainField,
        this.registry,
        this.textures
      );
    }

    this.carState = createInitialCarState(this.mapDef, this.splineData.samples);
    this.buildWaypointMarkers();
    this.applyAtmosphere();
    this.snapCameraImmediate();
    this.cbRoad?.setWetness(this.weather.wetness);
    this.fpRoad?.setWetness(this.weather.wetness);
    this.fpRoad?.setSnowAccumulation(this.weather.snowAccum);
    this.fpProps?.setSnowAccumulation(this.weather.snowAccum);
    this.emitTelemetry(true);
  }

  private readCarInput(): CarInput {
    const throttle =
      this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp') ? 1 : 0;
    const brake =
      this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown') ? 1 : 0;
    let steer = 0;
    if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) steer -= 1;
    if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) steer += 1;
    const handbrake = this.keysPressed.has('Space');
    return { throttle, brake, steer, handbrake };
  }

  private updateCamera(dt: number): void {
    if (this.appPhase === 'title') {
      // Elevated live world camera flyover orbit showcasing lagoon, bridge, and track
      const ang = this.elapsedTime * 0.1 + 0.65;
      const rad = 340;
      const targetY = this.mapId === 'coral_bay' ? 12 : 34;
      _camDesired.set(Math.cos(ang) * rad, targetY + 128 + Math.sin(ang * 1.3) * 12, Math.sin(ang) * rad);
      _camTarget.set(0, targetY, -20);
      this.camera.position.lerp(_camDesired, 1 - Math.exp(-3.5 * dt));
      this.camera.lookAt(_camTarget);
      return;
    }

    if (this.vantage === 'chase') {
      const car = this.carState;
      const fx = Math.cos(car.heading);
      const fz = Math.sin(car.heading);
      const speedNorm = clamp(Math.abs(car.speed) / 68, 0, 1);

      const distBack = 9.2 + speedNorm * 1.8;
      const heightUp = 3.6 + speedNorm * 0.6;
      const shake = car.collisionShock * 0.42;
      _camDesired.set(
        car.x - fx * distBack + Math.sin(this.elapsedTime * 42) * shake,
        car.y + heightUp + Math.cos(this.elapsedTime * 37) * shake,
        car.z - fz * distBack
      );
      _camTarget.set(car.x + fx * 11, car.y + 1.15, car.z + fz * 11);

      const dampPos = 1 - Math.exp(-9.5 * dt);
      this.camera.position.lerp(_camDesired, dampPos);
      this.camera.lookAt(_camTarget);

      const targetFov = 50 + speedNorm * 12;
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5.5, dt);
      this.camera.updateProjectionMatrix();
      return;
    }

    // Orbit / Vantage camera
    if (this.cameraDampingActive && !this.userOrbiting) {
      const spec = this.mapDef.vantages.find((v) => v.id === this.vantage);
      if (spec) {
        _camDesired.set(spec.position[0], spec.position[1], spec.position[2]);
        const alpha = 1 - Math.exp(-5.5 * dt);
        this.camera.position.lerp(_camDesired, alpha);
        this.controls.target.set(spec.target[0], spec.target[1], spec.target[2]);
        if (this.camera.position.distanceTo(_camDesired) < 0.35) {
          this.cameraDampingActive = false;
        }
      }
    }
    this.controls.update();
  }

  private emitTelemetry(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastTelemetryEmit < 100) return;
    this.lastTelemetryEmit = now;

    const sec = this.mapDef.sectors[this.carState.lastSector];
    this.onTelemetry({
      speedKmh: Math.abs(this.carState.speed) * 3.6,
      gear: this.carState.gear,
      rpm: this.carState.rpm,
      lap: this.carState.currentLap,
      lapTime: this.carState.lapTime,
      bestLapTime: this.carState.bestLapTime,
      sectorId: sec.id,
      sectorName: sec.name,
      onRoad: this.carState.onRoad,
      inPitLane: this.carState.inPitLane,
      trackLengthKm: this.splineData.totalLength / 1000,
      elevationDeltaM: this.splineData.elevationDelta,
      isSoftwareGl: this.isSoftwareGl,
      controlPoints: this.controlPoints.map((p) => [p[0], p[1], p[2]]),
    });
  }

  private tick = (): void => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = Math.max(0.001, (now - this.lastTimestamp) / 1000);
    this.lastTimestamp = now;
    const dt = Math.min(rawDt, 0.05);

    if (this.appPhase !== 'paused') {
      this.elapsedTime += dt;
    }

    const input = this.appPhase === 'playing'
      ? this.readCarInput()
      : { throttle: 0, brake: 0, steer: 0, handbrake: false };

    if (this.appPhase === 'playing') {
      stepCarPhysics(
        this.carState,
        input,
        dt,
        this.mapDef,
        this.splineData.samples,
        this.terrainField,
        this.registry,
        this.weather.wetness,
        this.weather.snowAccum
      );
      this.audio.update(this.carState.rpm, input.throttle, true);
    }

    this.vehicleRig.updateVisuals(
      this.carState.x,
      this.carState.y,
      this.carState.z,
      this.carState.heading,
      this.carState.steerAngle,
      this.carState.wheelSpin,
      input.brake > 0,
      this.mapDef.accent
    );

    this.updateCamera(dt);

    // Update Jumbotron + Active Map Shaders + Chunk Culling
    const speedKmh = Math.abs(this.carState.speed) * 3.6;
    const sec = this.mapDef.sectors[this.carState.lastSector];
    this.textures.updateJumbotron(
      this.mapDef.name,
      speedKmh,
      this.carState.currentLap,
      this.carState.lapTime,
      sec.id,
      this.mapDef.accent
    );

    if (this.mapId === 'coral_bay') {
      this.cbTerrain?.update(
        this.elapsedTime,
        this.weather.solarDeg,
        this.weather.waterChop,
        this.weather.waterClarity,
        this.weather.wetness
      );
      this.cbTerrain?.updateChunkCulling(this.camera.position);
      this.cbProps?.update(this.elapsedTime, this.vehicleRig.root.position, this.carState.crowdExcitement);
    } else {
      this.fpTerrain?.update(
        this.elapsedTime,
        this.weather.solarDeg,
        this.weather.snowAccum,
        this.weather.wetness
      );
      this.fpTerrain?.updateChunkCulling(this.camera.position);
      this.fpRoad?.update(this.elapsedTime);
      this.fpProps?.update(this.elapsedTime, this.carState.crowdExcitement);
    }

    this.composer.render();
    this.emitTelemetry(false);
    this.scheduleNextFrame();
  };

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.isTimeoutId = false;
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  /** Software WebGL frame pacing: wait for fenceSync completion, then pause 80ms */
  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.isTimeoutId = true;
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.isTimeoutId = true;
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.isTimeoutId = true;
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.isTimeoutId = true;
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    if (this.isTimeoutId) clearTimeout(this.frameId);
    else cancelAnimationFrame(this.frameId);
    this.resizeObserver.disconnect();
    this.unbindEvents();
    this.clearActiveMap();
    this.vehicleRig.dispose();
    this.textures.dispose();
    this.audio.dispose();
    this.skyMesh.geometry.dispose();
    this.skyMat.dispose();
    this.envRenderTarget?.dispose();
    this.bloomPass.dispose();
    this.outputPass.dispose();
    this.composer.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
