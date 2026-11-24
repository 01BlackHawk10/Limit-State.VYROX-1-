import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createSeededRandom, fbm2D, ridgedNoise2D } from '../../engine/mathNoise';
import { McLarenCarInstance } from '../../engine/mclarenCarLoader';

export type GarageCameraPreset = 'hero' | 'front' | 'profile' | 'rear' | 'cockpit';

export interface GarageCameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export const GARAGE_CAMERA_POSES: Record<GarageCameraPreset, GarageCameraPose> = {
  hero: {
    position: new THREE.Vector3(4.35, 1.38, 4.65),
    target: new THREE.Vector3(0.0, 0.56, 0.12),
  },
  front: {
    position: new THREE.Vector3(0.28, 1.02, 5.35),
    target: new THREE.Vector3(0.0, 0.54, 0.2),
  },
  profile: {
    position: new THREE.Vector3(5.75, 1.16, 0.05),
    target: new THREE.Vector3(0.0, 0.55, 0.0),
  },
  rear: {
    position: new THREE.Vector3(-3.45, 1.34, -4.75),
    target: new THREE.Vector3(0.0, 0.62, -0.15),
  },
  cockpit: {
    position: new THREE.Vector3(1.42, 1.78, 1.48),
    target: new THREE.Vector3(0.0, 0.72, 0.18),
  },
};

export type GarageQualityTier =
  | 'low'
  | 'recommended'
  | 'balanced'
  | 'medium'
  | 'high'
  | 'max'
  | 'ultra'
  | 'performance';

export type GarageShadowQuality = 'off' | 'low' | 'medium' | 'high';

export interface GarageStage {
  scene: THREE.Scene;
  turntableGroup: THREE.Group;
  attachCar: (car: McLarenCarInstance) => void;
  setShowCar: (visible: boolean) => void;
  setGraphicsQuality: (quality: GarageQualityTier) => void;
  setShadowQuality: (shadow: GarageShadowQuality) => void;
  update: (deltaSec: number, elapsedSec: number, autoRotate: boolean) => void;
  dispose: () => void;
}

function createCarbonWeaveTextures(
  trackTex: <T extends THREE.Texture>(t: T) => T,
): { map: THREE.DataTexture; roughnessMap: THREE.DataTexture; normalMap: THREE.DataTexture } {
  const size = 64;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const normData = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      // 2x2 twill carbon weave pattern
      const cell = ((Math.floor(x / 4) + Math.floor(y / 4)) & 1) === 0;
      const diag = ((x + y) % 8) < 4;
      const fiber = cell ? (diag ? 1.0 : 0.68) : (diag ? 0.62 : 0.88);
      const base = Math.round(18 + fiber * 16);

      colorData[idx] = base;
      colorData[idx + 1] = base + 2;
      colorData[idx + 2] = base + 5;
      colorData[idx + 3] = 255;

      const r = Math.round((cell ? 0.34 : 0.52) * 255);
      roughData[idx] = r;
      roughData[idx + 1] = r;
      roughData[idx + 2] = r;
      roughData[idx + 3] = 255;

      const nx = Math.round(128 + (cell ? 18 : -18));
      const ny = Math.round(128 + (diag ? 16 : -16));
      normData[idx] = nx;
      normData[idx + 1] = ny;
      normData[idx + 2] = 255;
      normData[idx + 3] = 255;
    }
  }

  const map = trackTex(new THREE.DataTexture(colorData, size, size, THREE.RGBAFormat));
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(20, 12);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;

  const roughnessMap = trackTex(new THREE.DataTexture(roughData, size, size, THREE.RGBAFormat));
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(20, 12);
  roughnessMap.needsUpdate = true;

  const normalMap = trackTex(new THREE.DataTexture(normData, size, size, THREE.RGBAFormat));
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(20, 12);
  normalMap.needsUpdate = true;

  return { map, roughnessMap, normalMap };
}

function createTelemetryScreenTexture(
  trackTex: <T extends THREE.Texture>(t: T) => T,
  variant: 'dyno' | 'track',
): THREE.DataTexture {
  const w = 128;
  const h = 64;
  const data = new Uint8Array(w * h * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i4 = (y * w + x) * 4;
      let r = 8;
      let g = 14;
      let b = 24;

      // Subtle grid lines
      if (x % 16 === 0 || y % 16 === 0) {
        r = 16;
        g = 32;
        b = 50;
      }

      if (variant === 'dyno') {
        const t = x / w;
        const curve1Y = Math.round(h * (0.78 - 0.56 * Math.sin(t * Math.PI * 0.85)));
        const curve2Y = Math.round(h * (0.64 - 0.34 * Math.sin(t * Math.PI * 1.15)));
        if (Math.abs(y - curve1Y) <= 1) {
          r = 56;
          g = 189;
          b = 248;
        } else if (Math.abs(y - curve2Y) <= 1) {
          r = 245;
          g = 158;
          b = 11;
        }
      } else {
        // Sector timing bars + alpine elevation profile trace
        const t = x / w;
        const elevY = Math.round(h * (0.68 - 0.32 * Math.sin(t * Math.PI * 2.2) - 0.14 * Math.cos(t * Math.PI * 4.5)));
        if (Math.abs(y - elevY) <= 1) {
          r = 16;
          g = 185;
          b = 129;
        }
        if (y >= 6 && y <= 11 && x >= 8 && x <= 118 && x % 36 < 28) {
          r = 56;
          g = 189;
          b = 248;
        }
      }

      data[i4] = r;
      data[i4 + 1] = g;
      data[i4 + 2] = b;
      data[i4 + 3] = 255;
    }
  }

  const tex = trackTex(new THREE.DataTexture(data, w, h, THREE.RGBAFormat));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function buildGarageStage(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  initialQuality: GarageQualityTier = 'balanced',
): GarageStage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05080d);
  scene.fog = new THREE.FogExp2(0x080d14, 0.013);

  const disposableGeos: THREE.BufferGeometry[] = [];
  const disposableMats: THREE.Material[] = [];
  const disposableTexs: THREE.Texture[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposableMats.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    disposableTexs.push(t);
    return t;
  };

  if (!isSoftwareGl) {
    RectAreaLightUniformsLib.init();
  }

  // Controlled moody IBL via RoomEnvironment so bright clearcoats retain sharp creases
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRT = pmrem.fromScene(roomEnv, 0.032);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.17;
  roomEnv.dispose();
  pmrem.dispose();

  // ---------------------------------------------------------------------------
  // 1. EXTERIOR MISTY DOLOMITE / ALPINE MOUNTAIN VISTA (ZERO DESERT TONES)
  // ---------------------------------------------------------------------------
  const vistaSkyMat = trackMat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uSunDir: { value: new THREE.Vector3(-0.48, 0.22, -0.85).normalize() },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uSunDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 zenith = vec3(0.032, 0.062, 0.115);
          vec3 midSky = vec3(0.085, 0.145, 0.235);
          vec3 alpineMist = vec3(0.24, 0.34, 0.46);
          vec3 below = vec3(0.03, 0.05, 0.08);

          vec3 col = mix(alpineMist, midSky, smoothstep(0.0, 0.28, max(h, 0.0)));
          col = mix(col, zenith, smoothstep(0.26, 0.80, max(h, 0.0)));
          if (h < 0.0) {
            col = mix(alpineMist * 0.55, below, smoothstep(0.0, -0.18, h));
          }

          float sunDot = max(dot(d, uSunDir), 0.0);
          col += vec3(0.62, 0.78, 0.96) * pow(sunDot, 8.0) * 0.24;
          col += vec3(0.88, 0.95, 1.0) * pow(sunDot, 110.0) * 0.55;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  const vistaSkyDome = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(105, 32, 20)), vistaSkyMat);
  vistaSkyDome.frustumCulled = false;
  scene.add(vistaSkyDome);

  // Alpine Valley Glacial Lake beyond the pit paddock apron
  const lakeUniforms = { uTime: { value: 0 } };
  const lakeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x0d2134,
      roughness: 0.16,
      metalness: 0.82,
      envMapIntensity: 1.35,
    }),
  );
  lakeMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = lakeUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLakeWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLakeWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vLakeWorldPos;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float r1 = sin(vLakeWorldPos.x * 0.42 + uTime * 1.1) * cos(vLakeWorldPos.z * 0.58 - uTime * 0.85);
        float r2 = sin(vLakeWorldPos.x * 1.05 - vLakeWorldPos.z * 0.8 + uTime * 1.6);
        normal = normalize(normal + vec3(r1 * 0.04 + r2 * 0.02, 0.0, (r1 - r2) * 0.025));`,
      );
  };
  lakeMat.customProgramCacheKey = () => 'garage-alpine-glacial-lake-v3';
  const alpineLake = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(220, 120)), lakeMat);
  alpineLake.rotation.x = -Math.PI * 0.5;
  alpineLake.position.set(0, -3.2, -74);
  scene.add(alpineLake);

  // Towering Dolomite Limestone & Evergreen Pine Ridges visible through open bay shutter doors
  const buildAlpineMountainRange = (
    widthM: number,
    depthM: number,
    segW: number,
    segD: number,
    zCenter: number,
    baseY: number,
    heightScale: number,
    seedOffset: number,
    snowLineY: number,
  ) => {
    const mGeo = trackGeo(new THREE.PlaneGeometry(widthM, depthM, segW, segD));
    mGeo.rotateX(-Math.PI * 0.5);
    const pos = mGeo.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);

    const colPineValley = new THREE.Color(0x13261f);
    const colGraniteDark = new THREE.Color(0x1b2533);
    const colDolomiteLimestone = new THREE.Color(0x526173);
    const colSnowCap = new THREE.Color(0xd2e1f2);
    const tmpC = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const lx = pos.getX(i);
      const lz = pos.getZ(i);
      const wx = lx;
      const wz = lz + zCenter;
      const edgeX = 1.0 - THREE.MathUtils.smoothstep(Math.abs(lx), widthM * 0.34, widthM * 0.5);
      const frontFade = THREE.MathUtils.smoothstep(lz, depthM * 0.48, depthM * 0.04);
      const backFade = THREE.MathUtils.smoothstep(lz, -depthM * 0.5, -depthM * 0.14);
      const envelope = edgeX * frontFade * backFade;

      const ridgeA = ridgedNoise2D(wx * 0.026 + seedOffset, wz * 0.026 - seedOffset, 4, 2.1, 0.52, 701 + seedOffset);
      const detail = fbm2D(wx * 0.08, wz * 0.08, 3, 2.0, 0.5, 1903 + seedOffset);
      const h = baseY + envelope * (ridgeA * heightScale + Math.max(0, detail) * heightScale * 0.34);
      pos.setY(i, h);

      const pineMask = 1.0 - THREE.MathUtils.smoothstep(h, baseY + 1.5, baseY + heightScale * 0.42);
      const snowMask = THREE.MathUtils.smoothstep(h, snowLineY, snowLineY + 7.2);
      tmpC.copy(colGraniteDark).lerp(colDolomiteLimestone, THREE.MathUtils.clamp(ridgeA * 1.15, 0, 1));
      tmpC.lerp(colPineValley, pineMask * 0.78);
      tmpC.lerp(colSnowCap, snowMask * 0.85);
      cols[i * 3] = tmpC.r;
      cols[i * 3 + 1] = tmpC.g;
      cols[i * 3 + 2] = tmpC.b;
    }

    mGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    mGeo.computeVertexNormals();
    const mMat = trackMat(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        metalness: 0.05,
      }),
    );
    const mesh = new THREE.Mesh(mGeo, mMat);
    mesh.position.set(0, 0, zCenter);
    return mesh;
  };

  scene.add(buildAlpineMountainRange(205, 56, 86, 28, -72, -3.2, 34.0, 17, 13.0));
  scene.add(buildAlpineMountainRange(155, 36, 68, 20, -48, -3.2, 18.0, 53, 10.5));

  // Low drifting alpine valley mist layer outside the pit doors
  const mistMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x9bb7d4,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  const valleyMist = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(160, 26)), mistMat);
  valleyMist.rotation.x = -Math.PI * 0.5;
  valleyMist.position.set(0, 1.4, -44);
  scene.add(valleyMist);

  // Exterior Pit Apron Concrete Pad & Safety Bollards outside rear roller shutter door
  const apronMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1a2029, roughness: 0.84, metalness: 0.14 }),
  );
  const apron = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(28, 0.22, 10.5)), apronMat);
  apron.position.set(0, -0.25, -17.2);
  scene.add(apron);

  const bollardMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4, metalness: 0.35 }),
  );
  const bollardGeo = trackGeo(new THREE.CylinderGeometry(0.08, 0.09, 0.82, 12));
  for (const bx of [-6.4, 6.4]) {
    const bollard = new THREE.Mesh(bollardGeo, bollardMat);
    bollard.position.set(bx, 0.27, -12.6);
    scene.add(bollard);
  }

  // ---------------------------------------------------------------------------
  // 2. MOODY DARK SHOWROOM LIGHTING WITH FOCUSED SILHOUETTE RIM LIGHTS
  // ---------------------------------------------------------------------------
  let softboxA: THREE.RectAreaLight | null = null;
  let softboxB: THREE.RectAreaLight | null = null;
  let bayDoorFill: THREE.RectAreaLight | null = null;
  const usesGarageRectLights = (q: GarageQualityTier) =>
    !isSoftwareGl && (q === 'medium' || q === 'high' || q === 'max' || q === 'ultra');

  if (!isSoftwareGl) {
    const showRect = usesGarageRectLights(initialQuality);
    // Narrow grazing side strips trace fender/shoulder creases without blasting the hood/roof
    softboxA = new THREE.RectAreaLight(0xd9e8ff, 0.36, 5.4, 0.65);
    softboxA.position.set(3.85, 3.95, 0.25);
    softboxA.lookAt(0, 0.62, 0.1);
    softboxA.visible = showRect;
    scene.add(softboxA);

    softboxB = new THREE.RectAreaLight(0xcfe2ff, 0.32, 5.4, 0.65);
    softboxB.position.set(-3.85, 3.95, 0.25);
    softboxB.lookAt(0, 0.62, 0.1);
    softboxB.visible = showRect;
    scene.add(softboxB);

    bayDoorFill = new THREE.RectAreaLight(0x7ca9db, 0.26, 9.6, 2.1);
    bayDoorFill.position.set(0, 2.25, -11.4);
    bayDoorFill.lookAt(0, 0.65, 0);
    bayDoorFill.visible = showRect;
    scene.add(bayDoorFill);
  }

  // Sculpted raking key light — shaped hotspot, zero flat flood on white/silver panels
  const keySpot = new THREE.SpotLight(0xeef4ff, 9.2, 32, Math.PI * 0.22, 0.68, 1.48);
  keySpot.position.set(6.4, 6.1, 4.8);
  keySpot.target.position.set(0, 0.52, 0.08);
  keySpot.castShadow =
    !isSoftwareGl &&
    initialQuality !== 'low' &&
    initialQuality !== 'recommended' &&
    initialQuality !== 'balanced' &&
    initialQuality !== 'performance';
  if (!isSoftwareGl) {
    const initShadowDim =
      initialQuality === 'ultra' || initialQuality === 'max'
        ? 2048
        : initialQuality === 'high'
          ? 1536
          : 1024;
    keySpot.shadow.mapSize.set(initShadowDim, initShadowDim);
    keySpot.shadow.bias = -0.0002;
    keySpot.shadow.normalBias = 0.012;
  }
  scene.add(keySpot, keySpot.target);

  // Cool ice-cyan rear-left silhouette rim light tracing roofline, wing, and haunches
  const backRim = new THREE.SpotLight(0x7cc4ff, 15.8, 34, Math.PI * 0.25, 0.52, 1.32);
  backRim.position.set(-5.8, 3.35, -6.8);
  backRim.target.position.set(0, 0.58, -0.1);
  scene.add(backRim, backRim.target);

  // Warm amber counter-rim tracing opposite shoulder, louvers, and rear diffuser
  const amberRimSpot = new THREE.SpotLight(0xffa640, 10.2, 26, Math.PI * 0.24, 0.55, 1.42);
  amberRimSpot.position.set(6.8, 2.85, -6.2);
  amberRimSpot.target.position.set(0, 0.52, 0);
  scene.add(amberRimSpot, amberRimSpot.target);

  // Low front-left splitter & wheel-arch grazing accent rim
  const frontSideRim = new THREE.SpotLight(0xaad6ff, 5.6, 22, Math.PI * 0.26, 0.64, 1.5);
  frontSideRim.position.set(-6.4, 2.15, 5.4);
  frontSideRim.target.position.set(0, 0.45, 0.35);
  scene.add(frontSideRim, frontSideRim.target);

  const initShowRect = usesGarageRectLights(initialQuality);
  const topBankLight = new THREE.DirectionalLight(0xdce8fa, initShowRect ? 0.045 : 0.14);
  topBankLight.position.set(0.5, 9.5, 2.0);
  scene.add(topBankLight);

  const frontFill = new THREE.DirectionalLight(0xc4d8f2, initShowRect ? 0.06 : 0.16);
  frontFill.position.set(-4.2, 2.4, 6.2);
  scene.add(frontFill);

  const ambientHemi = new THREE.HemisphereLight(0x3a5270, 0x05070b, initShowRect ? 0.09 : 0.14);
  scene.add(ambientHemi);

  // ---------------------------------------------------------------------------
  // 3. QUALITY-SCALED PLANAR REFLECTOR + SEALED EPOXY PIT BAY FLOOR
  // ---------------------------------------------------------------------------
  const floorTexSize = 256;
  const roughData = new Uint8Array(floorTexSize * floorTexSize * 4);
  const normData = new Uint8Array(floorTexSize * floorTexSize * 4);
  const texRand = createSeededRandom(31337);
  for (let y = 0; y < floorTexSize; y++) {
    for (let x = 0; x < floorTexSize; x++) {
      const i4 = (y * floorTexSize + x) * 4;
      const grain = texRand();
      const trowel = 0.5 + 0.5 * Math.sin(x * 0.16 + y * 0.14);
      const rVal = Math.round(THREE.MathUtils.clamp((0.24 + grain * 0.42 + trowel * 0.12) * 255, 0, 255));
      roughData[i4] = rVal;
      roughData[i4 + 1] = rVal;
      roughData[i4 + 2] = rVal;
      roughData[i4 + 3] = 255;

      const nx = Math.round(128 + (grain - 0.5) * 24);
      const ny = Math.round(128 + (trowel - 0.5) * 20);
      normData[i4] = nx;
      normData[i4 + 1] = ny;
      normData[i4 + 2] = 255;
      normData[i4 + 3] = 255;
    }
  }
  const floorRoughTex = trackTex(new THREE.DataTexture(roughData, floorTexSize, floorTexSize, THREE.RGBAFormat));
  floorRoughTex.wrapS = THREE.RepeatWrapping;
  floorRoughTex.wrapT = THREE.RepeatWrapping;
  floorRoughTex.repeat.set(16, 16);
  floorRoughTex.needsUpdate = true;

  const floorNormalTex = trackTex(new THREE.DataTexture(normData, floorTexSize, floorTexSize, THREE.RGBAFormat));
  floorNormalTex.wrapS = THREE.RepeatWrapping;
  floorNormalTex.wrapT = THREE.RepeatWrapping;
  floorNormalTex.repeat.set(16, 16);
  floorNormalTex.needsUpdate = true;

  const reflGeo = trackGeo(new THREE.PlaneGeometry(26, 26));
  let floorReflector: Reflector | null = null;
  let currentReflectorRes = 0;

  const hasInitReflector =
    !isSoftwareGl &&
    initialQuality !== 'low' &&
    initialQuality !== 'recommended' &&
    initialQuality !== 'balanced' &&
    initialQuality !== 'performance';

  const floorGlazeMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x0a0e16,
      roughness: 0.16,
      roughnessMap: floorRoughTex,
      normalMap: floorNormalTex,
      normalScale: new THREE.Vector2(0.14, 0.14),
      metalness: 0.34,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.1,
      transparent: hasInitReflector,
      opacity: hasInitReflector ? 0.58 : 1.0,
    }),
  );

  const configureReflector = (quality: GarageQualityTier) => {
    const targetRes =
      isSoftwareGl ||
      quality === 'low' ||
      quality === 'recommended' ||
      quality === 'balanced' ||
      quality === 'performance'
        ? 0
        : quality === 'medium'
          ? 256
          : quality === 'high'
            ? 320
            : quality === 'max'
              ? 448
              : 512;
    if (targetRes === currentReflectorRes) return;
    if (floorReflector) {
      scene.remove(floorReflector);
      floorReflector.dispose();
      floorReflector = null;
    }
    currentReflectorRes = targetRes;
    if (targetRes > 0) {
      floorReflector = new Reflector(reflGeo, {
        clipBias: 0.003,
        textureWidth: targetRes,
        textureHeight: targetRes,
        color: 0x5d697d,
        multisample: 0,
      });
      floorReflector.rotation.x = -Math.PI * 0.5;
      floorReflector.position.y = -0.146;
      scene.add(floorReflector);
      floorGlazeMat.transparent = true;
      floorGlazeMat.opacity = 0.58;
    } else {
      floorGlazeMat.transparent = false;
      floorGlazeMat.opacity = 1.0;
    }
    floorGlazeMat.needsUpdate = true;
  };
  configureReflector(initialQuality);

  const floorGlaze = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(26, 26)), floorGlazeMat);
  floorGlaze.rotation.x = -Math.PI * 0.5;
  floorGlaze.position.y = -0.14;
  floorGlaze.receiveShadow = true;
  scene.add(floorGlaze);

  // Industrial Concrete Expansion Grid, Pit Box Markings & Recessed Steel Floor Cable Trenches
  const floorJointMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38465a,
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    }),
  );
  const jointBarX = trackGeo(new THREE.PlaneGeometry(22.8, 0.026));
  const jointBarZ = trackGeo(new THREE.PlaneGeometry(0.026, 24.0));
  for (const offset of [-8, -4, 4, 8]) {
    const jx = new THREE.Mesh(jointBarX, floorJointMat);
    jx.rotation.x = -Math.PI * 0.5;
    jx.position.set(0, -0.135, offset);
    jx.renderOrder = 1;
    scene.add(jx);

    const jz = new THREE.Mesh(jointBarZ, floorJointMat);
    jz.rotation.x = -Math.PI * 0.5;
    jz.position.set(offset, -0.135, 0);
    jz.renderOrder = 1;
    scene.add(jz);
  }

  // Cyan & Amber Pit Box Striping
  const pitStripeCyanMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.42, depthWrite: false }),
  );
  const pitStripeAmberMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.34, depthWrite: false }),
  );
  const laneGeo = trackGeo(new THREE.PlaneGeometry(0.06, 4.4));
  for (const side of [-1.85, 1.85]) {
    for (const dir of [-1, 1]) {
      const stripe = new THREE.Mesh(laneGeo, dir < 0 ? pitStripeCyanMat : pitStripeAmberMat);
      stripe.rotation.x = -Math.PI * 0.5;
      stripe.position.set(side, -0.133, dir * 6.4);
      stripe.renderOrder = 1;
      scene.add(stripe);
    }
  }

  // Recessed Diamond-Plate Steel Cable Trench Grates flanking the bay
  const steelGrateMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x2a3442, roughness: 0.42, metalness: 0.85 }),
  );
  const grateGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.012, 18.5));
  for (const gx of [-5.25, 5.25]) {
    const grate = new THREE.Mesh(grateGeo, steelGrateMat);
    grate.position.set(gx, -0.134, -0.5);
    scene.add(grate);
  }

  // ---------------------------------------------------------------------------
  // 4. FLUSH CIRCULAR HYDRAULIC TURNTABLE PLINTH (TOP FLUSH AT y = 0)
  // ---------------------------------------------------------------------------
  const carbonTex = createCarbonWeaveTextures(trackTex);

  const turntableGroup = new THREE.Group();
  turntableGroup.name = 'GarageTurntable';
  scene.add(turntableGroup);

  const plinthTopMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x161b24,
      map: carbonTex.map,
      roughness: 0.28,
      roughnessMap: carbonTex.roughnessMap,
      normalMap: carbonTex.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      metalness: 0.42,
      clearcoat: 0.78,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.88,
    }),
  );
  const plinthDeck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(3.24, 3.36, 0.14, 72)),
    plinthTopMat,
  );
  plinthDeck.position.y = -0.07;
  plinthDeck.receiveShadow = true;
  turntableGroup.add(plinthDeck);

  const brushedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x8d9aad,
      roughness: 0.24,
      metalness: 0.92,
      envMapIntensity: 1.25,
    }),
  );
  const plinthBevel = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(3.26, 0.032, 12, 96)),
    brushedSteelMat,
  );
  plinthBevel.rotation.x = Math.PI * 0.5;
  plinthBevel.position.y = -0.016;
  turntableGroup.add(plinthBevel);

  // Subtle recessed bolt-stud ring around titanium turntable trim
  const studGeo = trackGeo(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 8));
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const stud = new THREE.Mesh(studGeo, brushedSteelMat);
    stud.position.set(Math.cos(a) * 3.12, -0.002, Math.sin(a) * 3.12);
    turntableGroup.add(stud);
  }

  const plinthGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.4,
      roughness: 0.15,
    }),
  );
  const plinthGlowRing = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(3.4, 0.016, 8, 96)),
    plinthGlowMat,
  );
  plinthGlowRing.rotation.x = Math.PI * 0.5;
  plinthGlowRing.position.y = -0.124;
  scene.add(plinthGlowRing);

  // Locked Bay Holographic Silhouette (when GLB pending, e.g., Garage Bay 04)
  const comingSoonGroup = new THREE.Group();
  comingSoonGroup.visible = false;
  const holoMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.95,
      wireframe: true,
      transparent: true,
      opacity: 0.36,
    }),
  );
  const holoHull = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.92, 0.7, 4.45)), holoMat);
  holoHull.position.y = 0.52;
  const holoCabin = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.36, 0.42, 1.95)), holoMat);
  holoCabin.position.set(0, 1.0, -0.1);
  comingSoonGroup.add(holoHull, holoCabin);
  turntableGroup.add(comingSoonGroup);

  // ---------------------------------------------------------------------------
  // 5. INDUSTRIAL CARBON-AND-STEEL RACE TEAM PIT BAY ARCHITECTURE
  // ---------------------------------------------------------------------------
  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1a2029,
      roughness: 0.36,
      metalness: 0.88,
      envMapIntensity: 1.05,
    }),
  );
  const charcoalSteelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x2b3442,
      roughness: 0.42,
      metalness: 0.82,
      envMapIntensity: 0.95,
    }),
  );
  const carbonWallMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: 0x1c222c,
      map: carbonTex.map,
      roughness: 0.44,
      roughnessMap: carbonTex.roughnessMap,
      normalMap: carbonTex.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      metalness: 0.25,
      clearcoat: 0.32,
      clearcoatRoughness: 0.28,
    }),
  );
  const shutterSlatMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x343e4d,
      roughness: 0.46,
      metalness: 0.78,
    }),
  );
  const softboxMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xc8d8ea,
      emissive: 0x9bb8d9,
      emissiveIntensity: 0.28,
      roughness: 0.22,
    }),
  );
  const cyanLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd9f1ff,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.05,
      roughness: 0.18,
    }),
  );
  const amberLedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffedd5,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.98,
      roughness: 0.18,
    }),
  );

  // A) Modular Matte Carbon Acoustic Side Walls (x = ±11.6) + Ceiling Deck
  const sideWallGeo = trackGeo(new THREE.BoxGeometry(0.18, 6.2, 24.4));
  for (const sx of [-11.6, 11.6]) {
    const wall = new THREE.Mesh(sideWallGeo, carbonWallMat);
    wall.position.set(sx, 2.95, 0.2);
    scene.add(wall);

    // Lower steel kick-plate skirting
    const kick = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.24, 0.42, 24.4)), charcoalSteelMat);
    kick.position.set(sx, 0.07, 0.2);
    scene.add(kick);
  }

  // Overhead dark industrial ceiling roof shell above trusses (y = 6.55)
  const ceilingDeck = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(24.0, 25.0)), darkSteelMat);
  ceilingDeck.rotation.x = Math.PI * 0.5;
  ceilingDeck.position.set(0, 6.55, 0.2);
  scene.add(ceilingDeck);

  // B) Rear Pit Wall Flanking an Open Wide Motorized Roller-Shutter Bay Door (door opening x ∈ [-6.2, +6.2])
  const rearWingGeo = trackGeo(new THREE.BoxGeometry(5.5, 6.2, 0.24));
  for (const sx of [-8.85, 8.85]) {
    const wing = new THREE.Mesh(rearWingGeo, carbonWallMat);
    wing.position.set(sx, 2.95, -11.9);
    scene.add(wing);
  }
  // Overhead Shutter Door Lintel Header + Stacked Corrugated Shutter Slats (open at y = 4.65)
  const doorHeader = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.6, 1.55, 0.36)), darkSteelMat);
  doorHeader.position.set(0, 5.32, -11.9);
  scene.add(doorHeader);

  const slatGeo = trackGeo(new THREE.BoxGeometry(12.2, 0.11, 0.08));
  for (let sy = 4.58; sy <= 5.06; sy += 0.15) {
    const slat = new THREE.Mesh(slatGeo, shutterSlatMat);
    slat.position.set(0, sy, -11.72);
    scene.add(slat);
  }
  // Vertical Door Jamb Tracks + Amber Door Header Safety Light Bar
  const jambGeo = trackGeo(new THREE.BoxGeometry(0.22, 4.65, 0.28));
  for (const jx of [-6.15, 6.15]) {
    const jamb = new THREE.Mesh(jambGeo, charcoalSteelMat);
    jamb.position.set(jx, 2.18, -11.78);
    scene.add(jamb);
  }
  const doorSafetyStrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.8, 0.045, 0.05)), amberLedMat);
  doorSafetyStrip.position.set(0, 4.53, -11.68);
  scene.add(doorSafetyStrip);

  // Rear Bay Number Signboard ("PIT BAY 01 // FACTORY MOTORSPORT")
  const signPlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 0.56, 0.08)), charcoalSteelMat);
  signPlate.position.set(0, 5.38, -11.66);
  scene.add(signPlate);
  const signAccent = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.15, 0.045, 0.095)), cyanLedMat);
  signAccent.position.set(0, 5.14, -11.65);
  scene.add(signAccent);

  // B2) Front Sealed Pit Wall (4th Side at z = +12.2) with Closed Corrugated Steel Shutter Door & LEDs
  for (const sx of [-8.85, 8.85]) {
    const frontWing = new THREE.Mesh(rearWingGeo, carbonWallMat);
    frontWing.position.set(sx, 2.95, 12.2);
    scene.add(frontWing);

    const frontKick = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(5.5, 0.42, 0.28)), charcoalSteelMat);
    frontKick.position.set(sx, 0.07, 12.14);
    scene.add(frontKick);
  }

  const frontDoorHeader = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.6, 1.55, 0.36)), darkSteelMat);
  frontDoorHeader.position.set(0, 5.32, 12.2);
  scene.add(frontDoorHeader);

  // Light-tight steel backing + floor seal + full floor-to-lintel corrugated shutter slats
  const frontShutterBack = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.3, 4.72, 0.10)), darkSteelMat);
  frontShutterBack.position.set(0, 2.22, 12.22);
  scene.add(frontShutterBack);

  const frontShutterSlats: number[] = [];
  for (let sy = 0.02; sy <= 4.46; sy += 0.15) {
    frontShutterSlats.push(sy);
  }
  const frontShutterInst = new THREE.InstancedMesh(slatGeo, shutterSlatMat, frontShutterSlats.length);
  const slatDummy = new THREE.Object3D();
  for (let i = 0; i < frontShutterSlats.length; i++) {
    slatDummy.position.set(0, frontShutterSlats[i], 12.11);
    slatDummy.updateMatrix();
    frontShutterInst.setMatrixAt(i, slatDummy.matrix);
  }
  frontShutterInst.instanceMatrix.needsUpdate = true;
  scene.add(frontShutterInst);

  const frontBottomLockBar = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.2, 0.16, 0.14)), charcoalSteelMat);
  frontBottomLockBar.position.set(0, -0.06, 12.08);
  scene.add(frontBottomLockBar);

  for (const jx of [-6.15, 6.15]) {
    const frontJamb = new THREE.Mesh(jambGeo, charcoalSteelMat);
    frontJamb.position.set(jx, 2.18, 12.08);
    scene.add(frontJamb);
  }

  const frontSafetyStrip = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(11.8, 0.045, 0.05)), amberLedMat);
  frontSafetyStrip.position.set(0, 4.53, 12.02);
  scene.add(frontSafetyStrip);

  const frontSignPlate = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.4, 0.56, 0.08)), charcoalSteelMat);
  frontSignPlate.position.set(0, 5.38, 11.98);
  scene.add(frontSignPlate);
  const frontSignAccent = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(3.15, 0.045, 0.095)), cyanLedMat);
  frontSignAccent.position.set(0, 5.14, 11.97);
  scene.add(frontSignAccent);

  // C) Exposed Brushed-Steel H-Columns along Side Bays, Front/Rear Corners & Recessed Linear LEDs
  const buildHColumn = (x: number, z: number, height: number) => {
    const g = new THREE.Group();
    g.position.set(x, height * 0.5 - 0.14, z);
    const flangeGeo = trackGeo(new THREE.BoxGeometry(0.32, height, 0.055));
    const webGeo = trackGeo(new THREE.BoxGeometry(0.06, height, 0.24));
    const baseGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.06, 0.44));

    const f1 = new THREE.Mesh(flangeGeo, darkSteelMat);
    f1.position.z = -0.13;
    const f2 = new THREE.Mesh(flangeGeo, darkSteelMat);
    f2.position.z = 0.13;
    const web = new THREE.Mesh(webGeo, charcoalSteelMat);
    const base = new THREE.Mesh(baseGeo, brushedSteelMat);
    base.position.y = -height * 0.5 + 0.03;

    g.add(f1, f2, web, base);
    scene.add(g);
  };

  for (const gz of [-11.6, -5.8, 0.0, 5.8, 11.4]) {
    buildHColumn(-11.2, gz, 6.25);
    buildHColumn(11.2, gz, 6.25);
  }
  for (const fx of [-6.45, 6.45]) {
    buildHColumn(fx, 11.95, 6.25);
  }

  // Vertical Recessed Cyan & Amber Linear Light Channels between carbon wall modules
  const vStripGeo = trackGeo(new THREE.BoxGeometry(0.045, 4.35, 0.045));
  for (const [bx, bz, isAmber] of [
    [-11.46, -8.7, false],
    [-11.46, -2.9, false],
    [-11.46, 2.9, true],
    [-11.46, 8.6, false],
    [11.46, -8.7, true],
    [11.46, -2.9, false],
    [11.46, 2.9, false],
    [11.46, 8.6, true],
    [-8.85, 12.04, false],
    [8.85, 12.04, false],
    [-6.65, 12.04, true],
    [6.65, 12.04, true],
  ] as Array<[number, number, boolean]>) {
    const strip = new THREE.Mesh(vStripGeo, isAmber ? amberLedMat : cyanLedMat);
    strip.position.set(bx, 2.55, bz);
    scene.add(strip);
  }

  // Horizontal upper wall valence LED channels (Side Walls + Front & Rear Headers)
  const hStripGeo = trackGeo(new THREE.BoxGeometry(0.04, 0.05, 23.6));
  for (const sx of [-11.46, 11.46]) {
    const hStrip = new THREE.Mesh(hStripGeo, cyanLedMat);
    hStrip.position.set(sx, 5.2, 0.2);
    scene.add(hStrip);
  }
  const frontBackValenceGeo = trackGeo(new THREE.BoxGeometry(22.8, 0.05, 0.045));
  const frontValence = new THREE.Mesh(frontBackValenceGeo, cyanLedMat);
  frontValence.position.set(0, 5.2, 12.02);
  scene.add(frontValence);

  // D) Overhead Heavy Steel I-Beam Roof Trusses & Diagonal Lattice Bracing
  const beamFlangeGeo = trackGeo(new THREE.BoxGeometry(22.8, 0.055, 0.28));
  const beamWebGeo = trackGeo(new THREE.BoxGeometry(22.8, 0.28, 0.065));
  const diagStrutGeo = trackGeo(new THREE.BoxGeometry(3.4, 0.075, 0.075));

  for (const rz of [-11.6, -5.8, 0.0, 5.8, 11.4]) {
    const topFlange = new THREE.Mesh(beamFlangeGeo, darkSteelMat);
    topFlange.position.set(0, 6.26, rz);
    const botFlange = new THREE.Mesh(beamFlangeGeo, darkSteelMat);
    botFlange.position.set(0, 5.96, rz);
    const beamWeb = new THREE.Mesh(beamWebGeo, charcoalSteelMat);
    beamWeb.position.set(0, 6.11, rz);
    scene.add(topFlange, botFlange, beamWeb);

    // Diagonal truss struts underneath transverse girder
    for (let tx = -8.4; tx <= 8.4; tx += 4.2) {
      const strut = new THREE.Mesh(diagStrutGeo, brushedSteelMat);
      strut.position.set(tx, 5.66, rz);
      strut.rotation.z = (Math.round(tx) % 2 === 0 ? 1 : -1) * 0.28;
      scene.add(strut);
    }
  }

  // Longitudinal Steel Purlins
  const purlinGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.12, 23.6));
  for (const rx of [-9.2, -4.6, 0, 4.6, 9.2]) {
    const purlin = new THREE.Mesh(purlinGeo, charcoalSteelMat);
    purlin.position.set(rx, 6.38, 0);
    scene.add(purlin);
  }

  // E) Suspended Studio Softbox Lighting Gantry above the Turntable
  const gantryOuterX = trackGeo(new THREE.BoxGeometry(7.2, 0.14, 0.14));
  const gantryOuterZ = trackGeo(new THREE.BoxGeometry(0.14, 0.14, 9.4));
  for (const gz of [-4.6, 4.8]) {
    const bar = new THREE.Mesh(gantryOuterX, darkSteelMat);
    bar.position.set(0, 5.02, gz);
    scene.add(bar);
  }
  for (const gx of [-3.55, 3.55]) {
    const bar = new THREE.Mesh(gantryOuterZ, darkSteelMat);
    bar.position.set(gx, 5.02, 0.1);
    scene.add(bar);
  }
  const hangerRodGeo = trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 8));
  for (const [hx, hz] of [
    [-3.5, -4.5],
    [3.5, -4.5],
    [-3.5, 4.7],
    [3.5, 4.7],
  ]) {
    const rod = new THREE.Mesh(hangerRodGeo, brushedSteelMat);
    rod.position.set(hx, 5.56, hz);
    scene.add(rod);
  }

  const softboxHousingGeo = trackGeo(new THREE.BoxGeometry(1.18, 0.09, 6.8));
  const softboxDiffuserGeo = trackGeo(new THREE.PlaneGeometry(1.06, 6.6));
  for (const bx of [-2.25, 0, 2.25]) {
    const housing = new THREE.Mesh(softboxHousingGeo, darkSteelMat);
    housing.position.set(bx, 4.92, 0.15);
    scene.add(housing);

    const diffuser = new THREE.Mesh(softboxDiffuserGeo, softboxMat);
    diffuser.rotation.x = Math.PI * 0.5;
    diffuser.position.set(bx, 4.865, 0.15);
    scene.add(diffuser);
  }

  // Subtle under-chassis pit inspection glow strip on turntable
  const underChassisBounceMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  const underChassisStrip = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(1.4, 3.6)),
    underChassisBounceMat,
  );
  underChassisStrip.rotation.x = -Math.PI * 0.5;
  underChassisStrip.position.set(0, 0.005, 0.05);
  underChassisStrip.renderOrder = 1;
  turntableGroup.add(underChassisStrip);

  // ---------------------------------------------------------------------------
  // 6. RACE TEAM PIT EQUIPMENT PROPS (PERIMETER CLEARANCE FOR ALL CAMERAS)
  // ---------------------------------------------------------------------------
  // A) Dual-Screen Race Team Telemetry & Dyno Console (Rear-Left Bay)
  const consoleGroup = new THREE.Group();
  consoleGroup.position.set(-7.6, -0.14, -5.8);
  consoleGroup.rotation.y = 0.62;
  scene.add(consoleGroup);

  const flightCaseMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x151921, roughness: 0.44, metalness: 0.62 }),
  );
  const dynoScreenTex = createTelemetryScreenTexture(trackTex, 'dyno');
  const trackScreenTex = createTelemetryScreenTexture(trackTex, 'track');

  const dynoScreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: dynoScreenTex,
      emissiveMap: dynoScreenTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.92,
      roughness: 0.18,
    }),
  );
  const trackScreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: trackScreenTex,
      emissiveMap: trackScreenTex,
      emissive: 0xffffff,
      emissiveIntensity: 0.92,
      roughness: 0.18,
    }),
  );

  const consoleBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.65, 0.92, 0.68)), flightCaseMat);
  consoleBase.position.y = 0.48;
  consoleGroup.add(consoleBase);

  const consoleTrim = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.68, 0.04, 0.72)), brushedSteelMat);
  consoleTrim.position.y = 0.95;
  consoleGroup.add(consoleTrim);

  for (const [mx, rotY, sMat] of [
    [-0.41, 0.08, dynoScreenMat],
    [0.41, -0.08, trackScreenMat],
  ] as Array<[number, number, THREE.MeshStandardMaterial]>) {
    const pole = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 10)), brushedSteelMat);
    pole.position.set(mx, 1.24, -0.16);
    consoleGroup.add(pole);

    const frame = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.76, 0.44, 0.04)), darkSteelMat);
    frame.position.set(mx, 1.5, -0.12);
    frame.rotation.set(-0.08, rotY, 0);
    consoleGroup.add(frame);

    const screen = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.7, 0.38)), sMat);
    screen.position.set(mx, 1.5, -0.095);
    screen.rotation.set(-0.08, rotY, 0);
    consoleGroup.add(screen);
  }

  // B) Two-Tier Motorsport Slick Tire & Spare Wheel Rack (Rear-Right Bay)
  const tireRackGroup = new THREE.Group();
  tireRackGroup.position.set(7.7, -0.14, -6.2);
  tireRackGroup.rotation.y = -0.55;
  scene.add(tireRackGroup);

  const tireMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x13151a, roughness: 0.78, metalness: 0.08 }),
  );
  const wheelRimMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x9aa6b8, roughness: 0.26, metalness: 0.88 }),
  );
  const tireGeo = trackGeo(new THREE.TorusGeometry(0.31, 0.12, 12, 28));
  tireGeo.rotateY(Math.PI * 0.5);
  const hubGeo = trackGeo(new THREE.CylinderGeometry(0.21, 0.21, 0.18, 16));
  hubGeo.rotateZ(Math.PI * 0.5);

  const rackPostGeo = trackGeo(new THREE.BoxGeometry(0.06, 1.95, 0.06));
  for (const px of [-1.25, 1.25]) {
    for (const pz of [-0.28, 0.28]) {
      const post = new THREE.Mesh(rackPostGeo, darkSteelMat);
      post.position.set(px, 0.975, pz);
      tireRackGroup.add(post);
    }
  }
  const railGeo = trackGeo(new THREE.BoxGeometry(2.54, 0.05, 0.05));
  for (const ry of [0.34, 1.18]) {
    for (const rz of [-0.26, 0.26]) {
      const rail = new THREE.Mesh(railGeo, charcoalSteelMat);
      rail.position.set(0, ry, rz);
      tireRackGroup.add(rail);
    }
  }
  for (const tierY of [0.66, 1.5]) {
    for (let t = 0; t < 4; t++) {
      const tx = -0.78 + t * 0.52;
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.position.set(tx, tierY, 0);
      tireRackGroup.add(tire);
      const hub = new THREE.Mesh(hubGeo, wheelRimMat);
      hub.position.set(tx, tierY, 0);
      tireRackGroup.add(hub);
    }
  }

  // C) Rolling Red & Graphite Pit Tool Cabinets (West & East Walls)
  const redCabinetMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x8f1d22, roughness: 0.34, metalness: 0.56 }),
  );
  const graphiteDrawerMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x1e242e, roughness: 0.42, metalness: 0.65 }),
  );

  const buildToolChest = (x: number, z: number, rotY: number) => {
    const cg = new THREE.Group();
    cg.position.set(x, -0.14, z);
    cg.rotation.y = rotY;
    scene.add(cg);

    const body = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.75, 0.98, 0.72)), redCabinetMat);
    body.position.y = 0.55;
    cg.add(body);

    const top = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.82, 0.05, 0.76)), brushedSteelMat);
    top.position.y = 1.065;
    cg.add(top);

    const drawerGeo = trackGeo(new THREE.BoxGeometry(0.82, 0.14, 0.03));
    const pullGeo = trackGeo(new THREE.BoxGeometry(0.68, 0.02, 0.04));
    for (const dx of [-0.88, 0, 0.88]) {
      for (const dy of [0.25, 0.44, 0.63, 0.82]) {
        const drawer = new THREE.Mesh(drawerGeo, graphiteDrawerMat);
        drawer.position.set(dx, dy, 0.365);
        cg.add(drawer);

        const pull = new THREE.Mesh(pullGeo, brushedSteelMat);
        pull.position.set(dx, dy + 0.03, 0.378);
        cg.add(pull);
      }
    }
  };

  buildToolChest(-10.45, -0.2, Math.PI * 0.5);
  buildToolChest(10.45, 0.8, -Math.PI * 0.5);

  // D) High-Pressure Nitrogen Cylinder Cart (East Rear Bay)
  const nitroGroup = new THREE.Group();
  nitroGroup.position.set(9.1, -0.14, -3.6);
  nitroGroup.rotation.y = -0.85;
  scene.add(nitroGroup);

  const tankMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x164e3b, roughness: 0.32, metalness: 0.68 }),
  );
  const brassMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xd4a147, roughness: 0.28, metalness: 0.88 }),
  );
  const cartBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.82, 0.08, 0.46)), darkSteelMat);
  cartBase.position.y = 0.08;
  nitroGroup.add(cartBase);

  const tankGeo = trackGeo(new THREE.CylinderGeometry(0.13, 0.13, 1.38, 16));
  const neckGeo = trackGeo(new THREE.SphereGeometry(0.13, 14, 10));
  const valveGeo = trackGeo(new THREE.CylinderGeometry(0.035, 0.04, 0.14, 10));
  for (const tx of [-0.18, 0.18]) {
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(tx, 0.78, 0);
    nitroGroup.add(tank);

    const dome = new THREE.Mesh(neckGeo, tankMat);
    dome.position.set(tx, 1.46, 0);
    nitroGroup.add(dome);

    const valve = new THREE.Mesh(valveGeo, brassMat);
    valve.position.set(tx, 1.62, 0);
    nitroGroup.add(valve);
  }

  // E) Spare Carbon Aero Wing & Splitter Storage Rack (Front-Left Corner beside Sealed Wall)
  const aeroRackGroup = new THREE.Group();
  aeroRackGroup.position.set(-8.6, -0.14, 10.35);
  aeroRackGroup.rotation.y = 0.22;
  scene.add(aeroRackGroup);

  const rackUprightGeo = trackGeo(new THREE.BoxGeometry(0.06, 1.85, 0.06));
  for (const px of [-1.05, 1.05]) {
    for (const pz of [-0.25, 0.25]) {
      const post = new THREE.Mesh(rackUprightGeo, darkSteelMat);
      post.position.set(px, 0.925, pz);
      aeroRackGroup.add(post);
    }
  }
  const wingDeckGeo = trackGeo(new THREE.BoxGeometry(1.92, 0.04, 0.34));
  for (const wy of [0.68, 1.38]) {
    const spareWing = new THREE.Mesh(wingDeckGeo, carbonWallMat);
    spareWing.position.set(0, wy, 0);
    spareWing.rotation.x = -0.12;
    aeroRackGroup.add(spareWing);
  }

  // F) Wheel-Gun Overhead Air Boom Stand & Trackside Fire Extinguisher Pack (Front-Right Corner)
  const airBoomGroup = new THREE.Group();
  airBoomGroup.position.set(8.65, -0.14, 10.45);
  airBoomGroup.rotation.y = -0.35;
  scene.add(airBoomGroup);

  const standBase = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.45, 0.5, 0.1, 16)), darkSteelMat);
  standBase.position.y = 0.05;
  airBoomGroup.add(standBase);
  const standMast = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.055, 0.07, 2.75, 12)), brushedSteelMat);
  standMast.position.y = 1.42;
  airBoomGroup.add(standMast);
  const boomArm = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.25, 0.07, 0.07)), charcoalSteelMat);
  boomArm.position.set(-0.58, 2.75, 0);
  airBoomGroup.add(boomArm);

  const extinguisherMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.32, metalness: 0.45 }),
  );
  const extGeo = trackGeo(new THREE.CylinderGeometry(0.1, 0.1, 0.62, 12));
  for (const ex of [0.55, 0.82]) {
    const ext = new THREE.Mesh(extGeo, extinguisherMat);
    ext.position.set(ex, 0.31, 0.22);
    airBoomGroup.add(ext);
  }

  let attachedCar: McLarenCarInstance | null = null;
  let carVisible = true;

  return {
    scene,
    turntableGroup,
    attachCar: (car: McLarenCarInstance) => {
      if (attachedCar && attachedCar !== car) {
        turntableGroup.remove(attachedCar.root);
      }
      attachedCar = car;
      car.root.position.set(0, 0, 0);
      car.root.quaternion.identity();
      car.bodySpringGroup.quaternion.identity();
      car.setLights(true, 0.15, 0.72);
      car.root.visible = carVisible;
      turntableGroup.add(car.root);
    },
    setShowCar: (visible: boolean) => {
      carVisible = visible;
      if (attachedCar) {
        attachedCar.root.visible = visible;
      }
      comingSoonGroup.visible = !visible;
      plinthGlowMat.color.setHex(visible ? 0xe0f2fe : 0x38bdf8);
      plinthGlowMat.emissive.setHex(visible ? 0x38bdf8 : 0x0284c7);
    },
    setGraphicsQuality: (quality: GarageQualityTier) => {
      configureReflector(quality);
      const showRect = usesGarageRectLights(quality);
      if (softboxA) softboxA.visible = showRect;
      if (softboxB) softboxB.visible = showRect;
      if (bayDoorFill) bayDoorFill.visible = showRect;
      topBankLight.intensity = showRect ? 0.045 : 0.14;
      frontFill.intensity = showRect ? 0.06 : 0.16;
      ambientHemi.intensity = showRect ? 0.09 : 0.14;
      keySpot.castShadow =
        !isSoftwareGl &&
        quality !== 'low' &&
        quality !== 'recommended' &&
        quality !== 'balanced' &&
        quality !== 'performance';
      if (!isSoftwareGl) {
        const targetShadowDim =
          quality === 'ultra' || quality === 'max'
            ? 2048
            : quality === 'high'
              ? 1536
              : 1024;
        if (keySpot.shadow.mapSize.x !== targetShadowDim) {
          keySpot.shadow.mapSize.set(targetShadowDim, targetShadowDim);
          if (keySpot.shadow.map) {
            keySpot.shadow.map.dispose();
            keySpot.shadow.map = null;
          }
        }
      }
    },
    setShadowQuality: (shadow: GarageShadowQuality) => {
      const enabled = !isSoftwareGl && shadow !== 'off';
      keySpot.castShadow = enabled;
      if (enabled) {
        const dim = shadow === 'low' ? 512 : shadow === 'medium' ? 1024 : 2048;
        if (keySpot.shadow.mapSize.x !== dim) {
          keySpot.shadow.mapSize.set(dim, dim);
          if (keySpot.shadow.map) {
            keySpot.shadow.map.dispose();
            keySpot.shadow.map = null;
          }
        }
      }
    },
    update: (deltaSec: number, elapsedSec: number, autoRotate: boolean) => {
      if (autoRotate) {
        turntableGroup.rotation.y = (turntableGroup.rotation.y + deltaSec * 0.14) % (Math.PI * 2);
      }
      plinthGlowMat.emissiveIntensity = 1.1 + 0.24 * Math.sin(elapsedSec * 1.8);
      lakeUniforms.uTime.value = elapsedSec;
    },
    dispose: () => {
      if (floorReflector) {
        floorReflector.dispose();
      }
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
      for (const t of disposableTexs) t.dispose();
      envRT.dispose();
    },
  };
}
