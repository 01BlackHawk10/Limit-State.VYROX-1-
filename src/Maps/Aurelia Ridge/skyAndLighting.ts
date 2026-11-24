import * as THREE from 'three';
import { clamp, createSeededRandom, lerp, smoothstep } from '../../engine/mathNoise';
import type { ContinuousWeatherState } from '../../engine/weatherTransitionManager';

export type HazePreset = 'low' | 'golden' | 'heavy';
export type WeatherPreset = 'dry' | 'overcast' | 'rain' | 'sunset_storm' | 'deep_morning_mist';
export type SnowAtmospherePreset = 'alpine_snow' | 'twilight_storm' | 'glacier_sun';

export interface CelestialState {
  solarAngleDeg: number;
  nightFactor: number;
  horizonProximity: number;
  phaseLabel: string;
}

export interface WeatherUniforms {
  uWetness: { value: number };
  uOvercast: { value: number };
  uTime: { value: number };
  uWindSpeed: { value: number };
  uWindDir: { value: THREE.Vector2 };
}

export interface SkyAndLightingRig {
  updateSolarCycle: (
    solarAngleDeg: number,
    hazePreset: HazePreset,
    weatherPreset?: WeatherPreset,
  ) => CelestialState;
  updateContinuousWeather: (
    solarAngleDeg: number,
    hazePreset: HazePreset,
    weatherState: ContinuousWeatherState,
    snowPreset?: SnowAtmospherePreset | null,
  ) => CelestialState;
  updateAtmosphereTime: (elapsedSec: number, cameraPos?: THREE.Vector3) => void;
  updateShadowCenter: (target: THREE.Vector3) => void;
  getMistUniforms: () => {
    uMistColor: { value: THREE.Color };
    uMistStrength: { value: number };
  };
  getWeatherUniforms: () => WeatherUniforms;
  getSkyPalette: () => { zenith: THREE.Color; horizon: THREE.Color };
  getSunDirection: (out?: THREE.Vector3) => THREE.Vector3;
  setShadowQuality: (mapSize: number) => void;
  setShadowsEnabled: (enabled: boolean) => void;
  setShadowBounds: (halfExtent: number) => void;
  setSnowAtmosphere: (preset: SnowAtmospherePreset | null) => void;
  setPerformanceFogScale: (scale: number) => void;
  dispose: () => void;
}

/**
 * Photorealistic 360-degree celestial sky, weather, scattering & IBL system:
 * - Rayleigh + Mie horizon scattering across Dawn / Noon / Golden Hour / Twilight / Midnight
 * - Toggleable Dry / Overcast / Wet After-Rain weather states + falling 3D rain streaks
 * - Procedural lit multi-layer cumulus + overcast stratus clouds
 * - Live sky-synced PMREM environment reflections updating dynamically with sun & weather
 */
export function buildSkyAndLightingRig(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
): SkyAndLightingRig {
  const weatherUniforms: WeatherUniforms = {
    uWetness: { value: 0 },
    uOvercast: { value: 0 },
    uTime: { value: 0 },
    uWindSpeed: { value: 1.0 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.51).normalize() },
  };
  let baseWindSpeed = 1.0;

  const skyUniforms = {
    uSunDirection: { value: new THREE.Vector3(0.75, 0.25, -0.6).normalize() },
    uMoonDirection: { value: new THREE.Vector3(-0.75, -0.25, 0.6).normalize() },
    uZenithColor: { value: new THREE.Color(0x284e7e) },
    uHorizonColor: { value: new THREE.Color(0xf0b27a) },
    uSunGlowColor: { value: new THREE.Color(0xffd699) },
    uCloudLitColor: { value: new THREE.Color(0xffe1be) },
    uCloudShadowColor: { value: new THREE.Color(0x4b5875) },
    uHazeIntensity: { value: 1.0 },
    uSunElevationSin: { value: 0.22 },
    uOvercast: weatherUniforms.uOvercast,
    uTime: weatherUniforms.uTime,
    uSunsetStorm: { value: 0.0 },
    uMorningMist: { value: 0.0 },
  };

  const skyShaderConfig = {
    uniforms: skyUniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldDir;
      uniform vec3 uSunDirection;
      uniform vec3 uMoonDirection;
      uniform vec3 uZenithColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunGlowColor;
      uniform vec3 uCloudLitColor;
      uniform vec3 uCloudShadowColor;
      uniform float uHazeIntensity;
      uniform float uSunElevationSin;
      uniform float uOvercast;
      uniform float uTime;
      uniform float uSunsetStorm;
      uniform float uMorningMist;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbmCloud(vec2 p) {
        float v = 0.0;
        float a = 0.52;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 5; i++) {
          v += a * vnoise(p);
          p = rot * p * 2.04 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);

        float horizonBlend = pow(max(1.0 - h, 1e-4), 2.35);
        vec3 sky = mix(uZenithColor, uHorizonColor, horizonBlend);

        float sunVis = (1.0 - uOvercast * 0.85);
        float sunAbove = smoothstep(-0.08, 0.06, uSunElevationSin) * sunVis;
        vec3 sunDirN = normalize(uSunDirection);
        vec3 moonDirN = normalize(uMoonDirection);

        float sunAmt = max(dot(dir, sunDirN), 0.0);
        float safeSun = max(sunAmt, 1e-4);
        sky += uSunGlowColor * pow(safeSun, 3.6) * 0.44 * uHazeIntensity * smoothstep(-0.18, 0.16, uSunElevationSin) * (1.0 - uOvercast * 0.55);
        sky += vec3(1.0, 0.90, 0.72) * pow(safeSun, 95.0) * 1.05 * sunAbove;
        // Crisp razor-sharp solar photosphere disc
        float sunDisc = smoothstep(0.99945, 0.99978, sunAmt);
        sky += vec3(1.22, 1.14, 1.02) * sunDisc * 3.1 * sunAbove;

        // Detailed cratered Moon with lunar maria, solar crescent phase, and soft silver halo
        float moonAbove = smoothstep(-0.02, 0.09, moonDirN.y) * (1.0 - uOvercast * 0.78);
        float moonAmt = max(dot(dir, moonDirN), 0.0);
        float safeMoon = max(moonAmt, 1e-4);
        float moonNightBoost = mix(0.28, 1.0, smoothstep(0.22, -0.08, uSunElevationSin));
        sky += vec3(0.32, 0.46, 0.74) * pow(safeMoon, 20.0) * 0.28 * moonAbove * moonNightBoost;

        if (moonAmt > 0.9980 && moonAbove > 0.01) {
          vec3 moonRefUp = abs(moonDirN.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
          vec3 mRight = normalize(cross(moonRefUp, moonDirN));
          vec3 mUp = cross(moonDirN, mRight);
          float moonRad = 0.042;
          vec2 mUv = vec2(dot(dir, mRight), dot(dir, mUp)) / moonRad;
          float r2 = dot(mUv, mUv);
          if (r2 < 1.0) {
            float mZ = sqrt(max(0.0, 1.0 - r2));
            vec3 sphereN = normalize(mRight * mUv.x + mUp * mUv.y + moonDirN * mZ);
            float n1 = vnoise(mUv * 3.6 + vec2(2.3, 1.7));
            float n2 = vnoise(mUv * 9.5 + vec2(5.1, 7.4));
            float n3 = vnoise(mUv * 22.0 - vec2(3.2, 4.8));
            float maria = smoothstep(0.38, 0.72, n1 * 0.68 + n2 * 0.32);
            float craters = (n3 - 0.5) * 0.22;
            vec3 albedo = mix(vec3(0.95, 0.96, 0.99), vec3(0.56, 0.61, 0.70), maria) + craters;

            // Phase illumination from sun direction (stays gibbous/bright at night & natural crescent at twilight)
            float phaseLit = smoothstep(-0.35, 0.45, dot(sphereN, -sunDirN) * 0.55 + 0.52);
            float limb = pow(mZ, 0.32);
            float discEdge = smoothstep(1.0, 0.88, sqrt(r2));
            vec3 moonCol = albedo * (0.14 + 1.45 * phaseLit) * limb * vec3(0.92, 0.96, 1.04);
            sky = mix(sky, moonCol, discEdge * moonAbove * mix(0.45, 0.98, moonNightBoost));
          }
        }

        // Multi-layer projected clouds (expands smoothly into thick deck during Overcast / Rain)
        if (dir.y > 0.01) {
          vec2 wind = vec2(uTime * 0.011, uTime * 0.0055);
          vec2 projLow = dir.xz / (dir.y + 0.17) * 1.45 + wind;
          vec2 projHigh = dir.xz / (dir.y + 0.24) * 3.1 + wind * 0.55;

          float cirrus = smoothstep(0.56, 0.86, fbmCloud(projHigh * 1.25));
          float cumulusBase = fbmCloud(projLow);
          float lowThresh = mix(0.47, 0.18, uOvercast);
          float highThresh = mix(0.78, 0.56, uOvercast);
          float cumulusMask = smoothstep(lowThresh, highThresh, cumulusBase);

          vec2 lightStep = (uSunElevationSin >= -0.02 ? sunDirN.xz : moonDirN.xz) * 0.11;
          float shadowSample = fbmCloud(projLow + lightStep);
          float litEdge = clamp(1.0 - smoothstep(0.42, 0.76, shadowSample) * 0.72 + pow(safeSun, 6.0) * 0.52 * sunVis, 0.16, 1.2);
          litEdge = mix(litEdge, 0.45 + 0.25 * (1.0 - cumulusBase), uOvercast * 0.75);

          vec3 cloudCol = mix(uCloudShadowColor, uCloudLitColor, litEdge);
          cloudCol += uSunGlowColor * pow(safeSun, 12.0) * 0.5 * sunAbove;
          // Sunset Storm: dramatic amber/crimson underlit storm anvil & subtle distant sheet lightning
          float stormPulse = pow(max(0.0, sin(uTime * 0.85) * sin(uTime * 2.13 + 0.7)), 14.0);
          cloudCol += vec3(0.95, 0.36, 0.14) * pow(safeSun, 3.0) * 0.42 * uSunsetStorm * (1.0 - cumulusBase * 0.4);
          cloudCol += vec3(0.68, 0.78, 1.0) * stormPulse * 0.55 * uSunsetStorm * smoothstep(0.45, 0.85, cumulusBase);

          float horizonFade = smoothstep(0.01, 0.14, dir.y);
          float totalCloud = clamp(cumulusMask * mix(0.88, 0.98, uOvercast) + cirrus * 0.26, 0.0, 0.97) * horizonFade;
          sky = mix(sky, cloudCol, totalCloud);
        }

        // Deep Morning Mist horizon veil softening distant sky lower band
        float mistBand = (1.0 - smoothstep(-0.02, 0.32, dir.y)) * uMorningMist;
        sky = mix(sky, uHorizonColor * vec3(0.96, 0.99, 1.04), clamp(mistBand * 0.68, 0.0, 0.72));

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  };

  const skyGeo = new THREE.SphereGeometry(3600, 48, 32);
  const skyMat = new THREE.ShaderMaterial(skyShaderConfig);
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  skyDome.frustumCulled = false;
  skyDome.renderOrder = -1;
  scene.add(skyDome);

  // Offscreen Sky Scene for live PMREM reflection baking
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  const pmremSkyScene = new THREE.Scene();
  const pmremSkyMesh = new THREE.Mesh(new THREE.SphereGeometry(120, 24, 16), skyMat);
  pmremSkyScene.add(pmremSkyMesh);
  let activeEnvRT: THREE.WebGLRenderTarget | null = null;
  let lastBakedSolarDeg = -999;
  let lastBakedHaze: HazePreset | null = null;
  let lastBakedWeather: WeatherPreset | null = null;
  let lastBakedOvercast = -1;
  let lastBakedWetness = -1;
  let lastBakeTimeMs = 0;
  let pendingBakeRaf = 0;
  let disposed = false;

  const performPmremBake = (
    deg: number,
    haze: HazePreset,
    weather: WeatherPreset,
    overcastAmt: number,
    wetnessAmt: number,
  ) => {
    if (disposed) return;
    lastBakedSolarDeg = deg;
    lastBakedHaze = haze;
    lastBakedWeather = weather;
    lastBakedOvercast = overcastAmt;
    lastBakedWetness = wetnessAmt;
    lastBakeTimeMs = performance.now();

    const nextRT = pmremGenerator.fromScene(pmremSkyScene, 0.035);
    scene.environment = nextRT.texture;
    if (activeEnvRT) activeEnvRT.dispose();
    activeEnvRT = nextRT;
  };

  const bakeSkyEnvironment = (
    force = false,
    deg = 168,
    haze: HazePreset = 'golden',
    weather: WeatherPreset = 'dry',
    overcastAmt = weather === 'rain' || weather === 'sunset_storm'
      ? 0.9
      : weather === 'overcast'
        ? 0.88
        : weather === 'deep_morning_mist'
          ? 0.34
          : 0.0,
    wetnessAmt = weather === 'rain' || weather === 'sunset_storm'
      ? 0.98
      : weather === 'deep_morning_mist'
        ? 0.28
        : 0.0,
  ) => {
    const now = performance.now();
    const angleDiff = Math.abs(deg - lastBakedSolarDeg);
    const minStep = isSoftwareGl ? 36 : 20;
    const minIntervalMs = isSoftwareGl ? 9000 : 6500;
    const overcastDelta = Math.abs(overcastAmt - lastBakedOvercast);
    const wetnessDelta = Math.abs(wetnessAmt - lastBakedWetness);
    const hazeChanged = lastBakedHaze !== haze || lastBakedWeather !== weather;
    const continuousShift =
      overcastDelta >= 0.25 || wetnessDelta >= 0.30 || angleDiff >= minStep;

    if (force) {
      if (pendingBakeRaf) {
        cancelAnimationFrame(pendingBakeRaf);
        pendingBakeRaf = 0;
      }
      performPmremBake(deg, haze, weather, overcastAmt, wetnessAmt);
      return;
    }

    if (!hazeChanged && !continuousShift) {
      return;
    }
    if (!hazeChanged && now - lastBakeTimeMs < minIntervalMs) {
      return;
    }

    // Defer PMREM cubemap generation cleanly out of the active physics/render tick
    if (!pendingBakeRaf) {
      pendingBakeRaf = requestAnimationFrame(() => {
        pendingBakeRaf = 0;
        performPmremBake(
          lastSolarDeg,
          lastHazePreset,
          currentWeather,
          weatherUniforms.uOvercast.value,
          weatherUniforms.uWetness.value,
        );
      });
    }
  };

  // ---------------------------------------------------------------------------
  // 2. DYNAMIC 2,400-STAR FIELD
  // ---------------------------------------------------------------------------
  const starCount = 2400;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  const starPhases = new Float32Array(starCount);

  const rand = createSeededRandom(77315);
  const starPalette = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xd6e6ff),
    new THREE.Color(0xffe6c7),
    new THREE.Color(0xb8d4ff),
  ];

  const starRadius = 3250;
  for (let i = 0; i < starCount; i++) {
    const theta = rand() * Math.PI * 2;
    let yDir: number;
    if (i < starCount * 0.35) {
      const bandU = (rand() - 0.5) * 0.38;
      const sx = Math.cos(theta);
      const sz = Math.sin(theta);
      const sy = bandU + sx * 0.42;
      const inv = 1 / Math.hypot(sx, sy, sz);
      starPositions[i * 3] = sx * inv * starRadius;
      starPositions[i * 3 + 1] = sy * inv * starRadius;
      starPositions[i * 3 + 2] = sz * inv * starRadius;
      yDir = sy * inv;
    } else {
      const u = rand() * 2 - 1;
      const rHoriz = Math.sqrt(Math.max(0, 1 - u * u));
      starPositions[i * 3] = Math.cos(theta) * rHoriz * starRadius;
      starPositions[i * 3 + 1] = u * starRadius;
      starPositions[i * 3 + 2] = Math.sin(theta) * rHoriz * starRadius;
      yDir = u;
    }

    const col = starPalette[Math.floor(rand() * starPalette.length)];
    const brightness = (0.45 + Math.pow(rand(), 2.2) * 0.55) * (yDir > -0.1 ? 1.0 : 0.2);
    starColors[i * 3] = col.r * brightness;
    starColors[i * 3 + 1] = col.g * brightness;
    starColors[i * 3 + 2] = col.b * brightness;

    starSizes[i] = 1.6 + Math.pow(rand(), 3.0) * 3.8;
    starPhases[i] = rand() * Math.PI * 2;
  }

  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(starColors, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(starPhases, 1));

  const starUniforms = {
    uTime: weatherUniforms.uTime,
    uVisibility: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
  };

  const starMat = new THREE.ShaderMaterial({
    uniforms: starUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec3 dir = normalize(position);
        float horizonFade = smoothstep(-0.02, 0.22, dir.y);
        float twinkle = 0.74 + 0.26 * sin(uTime * 1.9 + aPhase);
        vColor = aColor;
        vAlpha = horizonFade * twinkle;

        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uVisibility;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        float core = 1.0 - smoothstep(0.05, 0.5, d);
        gl_FragColor = vec4(vColor, core * vAlpha * uVisibility);
      }
    `,
  });

  const starPoints = new THREE.Points(starGeo, starMat);
  starPoints.frustumCulled = false;
  starPoints.renderOrder = -1;
  scene.add(starPoints);

  // ---------------------------------------------------------------------------
  // 2B. GPU-DRIVEN 6,500-STREAK WIND-SLANTED RAIN CURTAIN (Zero CPU overhead!)
  // ---------------------------------------------------------------------------
  const rainCount = isSoftwareGl ? 2400 : 6500;
  const rainPos = new Float32Array(rainCount * 6);
  const rainMeta = new Float32Array(rainCount * 6); // [tEnd(0|1), speedScale, seed]
  for (let i = 0; i < rainCount; i++) {
    const rx = (rand() - 0.5) * 220;
    const ry = rand() * 88;
    const rz = (rand() - 0.5) * 220;
    const spd = 0.82 + rand() * 0.54;
    const seed = rand();

    rainPos[i * 6] = rx;
    rainPos[i * 6 + 1] = ry;
    rainPos[i * 6 + 2] = rz;
    rainPos[i * 6 + 3] = rx;
    rainPos[i * 6 + 4] = ry;
    rainPos[i * 6 + 5] = rz;

    rainMeta[i * 6] = 0.0; // Trailing upper tail
    rainMeta[i * 6 + 1] = spd;
    rainMeta[i * 6 + 2] = seed;
    rainMeta[i * 6 + 3] = 1.0; // Leading lower drop tip
    rainMeta[i * 6 + 4] = spd;
    rainMeta[i * 6 + 5] = seed;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  rainGeo.setAttribute('aRainMeta', new THREE.BufferAttribute(rainMeta, 3));

  const rainUniforms = {
    uTime: weatherUniforms.uTime,
    uWindSpeed: weatherUniforms.uWindSpeed,
    uWindDir: weatherUniforms.uWindDir,
    uCameraPos: { value: new THREE.Vector3(-265, 162, 342) },
    uRainColor: { value: new THREE.Color(0xcbd8e8) },
    uRainOpacity: { value: 0.42 },
  };

  const rainMat = new THREE.ShaderMaterial({
    uniforms: rainUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 aRainMeta;
      uniform float uTime;
      uniform float uWindSpeed;
      uniform vec2 uWindDir;
      uniform vec3 uCameraPos;
      varying float vEndT;
      varying float vDistAlpha;
      varying float vSeed;

      void main() {
        float boxSpan = 220.0;
        float boxH = 88.0;
        float fallSpeed = 44.0 * aRainMeta.y;
        vec2 windVel = -uWindDir * (4.6 * uWindSpeed);

        float relX = mod(position.x + uTime * windVel.x - uCameraPos.x + boxSpan * 0.5, boxSpan) - boxSpan * 0.5;
        float relZ = mod(position.z + uTime * windVel.y - uCameraPos.z + boxSpan * 0.5, boxSpan) - boxSpan * 0.5;
        float baseY = max(uCameraPos.y - 26.0, -6.0);
        float relY = mod(position.y - uTime * fallSpeed, boxH);

        vec3 dropTip = vec3(uCameraPos.x + relX, baseY + relY, uCameraPos.z + relZ);
        float streakDt = 0.056 + 0.032 * aRainMeta.z;
        vec3 tailVel = vec3(windVel.x, -fallSpeed, windVel.y);
        // aRainMeta.x == 0 -> upper tail, 1 -> lower leading tip
        vec3 wp = mix(dropTip - tailVel * streakDt, dropTip, aRainMeta.x);

        vEndT = aRainMeta.x;
        vSeed = aRainMeta.z;
        float camDist = length(wp - uCameraPos);
        float farFade = 1.0 - smoothstep(24.0, 145.0, camDist);
        float nearFade = smoothstep(1.2, 4.8, camDist);
        vDistAlpha = clamp(farFade * nearFade, 0.0, 1.0);

        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uRainColor;
      uniform float uRainOpacity;
      varying float vEndT;
      varying float vDistAlpha;
      varying float vSeed;

      void main() {
        float safeEnd = clamp(vEndT, 0.001, 1.0);
        float trailFade = mix(0.06, 1.0, pow(safeEnd, 1.35));
        float varAlpha = 0.58 + 0.42 * vSeed;
        float a = clamp(uRainOpacity * trailFade * vDistAlpha * varAlpha, 0.0, 0.85);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uRainColor, a);
      }
    `,
  });

  const rainLines = new THREE.LineSegments(rainGeo, rainMat);
  rainLines.frustumCulled = false;
  rainLines.visible = false;
  scene.add(rainLines);

  // ---------------------------------------------------------------------------
  // 2C. GPU-DRIVEN 3D SNOWFALL PARTICLE CURTAIN (Frostpeak Glacier Winter Modes)
  // ---------------------------------------------------------------------------
  const snowCount = isSoftwareGl ? 2000 : 5800;
  const snowPos = new Float32Array(snowCount * 3);
  const snowMeta = new Float32Array(snowCount * 3); // [speedScale, flakeSize, seed]
  for (let i = 0; i < snowCount; i++) {
    snowPos[i * 3] = (rand() - 0.5) * 180;
    snowPos[i * 3 + 1] = rand() * 72;
    snowPos[i * 3 + 2] = (rand() - 0.5) * 180;

    snowMeta[i * 3] = 0.65 + rand() * 0.72;
    snowMeta[i * 3 + 1] = 0.6 + rand() * 0.85;
    snowMeta[i * 3 + 2] = rand();
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  snowGeo.setAttribute('aSnowMeta', new THREE.BufferAttribute(snowMeta, 3));

  const snowUniforms = {
    uTime: weatherUniforms.uTime,
    uWindSpeed: weatherUniforms.uWindSpeed,
    uWindDir: weatherUniforms.uWindDir,
    uCameraPos: rainUniforms.uCameraPos,
    uSnowColor: { value: new THREE.Color(0xf2f8ff) },
    uSnowOpacity: { value: 0.72 },
    uSnowFallSpeed: { value: 5.4 },
    uSnowWindFactor: { value: 1.4 },
    uSnowSize: { value: 6.2 },
    uPixelRatio: { value: renderer.getPixelRatio() },
  };

  const snowMat = new THREE.ShaderMaterial({
    uniforms: snowUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 aSnowMeta;
      uniform float uTime;
      uniform float uWindSpeed;
      uniform vec2 uWindDir;
      uniform vec3 uCameraPos;
      uniform float uSnowFallSpeed;
      uniform float uSnowWindFactor;
      uniform float uSnowSize;
      uniform float uPixelRatio;
      varying float vDistAlpha;
      varying float vSeed;

      void main() {
        float boxSpan = 180.0;
        float boxH = 72.0;
        float fallSpeed = uSnowFallSpeed * aSnowMeta.x;
        vec2 windVel = -uWindDir * (uSnowWindFactor * uWindSpeed);
        float flutter = sin(uTime * 1.45 + aSnowMeta.z * 24.0) * 1.25;

        float relX = mod(position.x + uTime * windVel.x + flutter - uCameraPos.x + boxSpan * 0.5, boxSpan) - boxSpan * 0.5;
        float relZ = mod(position.z + uTime * windVel.y - flutter * 0.7 - uCameraPos.z + boxSpan * 0.5, boxSpan) - boxSpan * 0.5;
        float baseY = max(uCameraPos.y - 22.0, -4.0);
        float relY = mod(position.y - uTime * fallSpeed, boxH);

        vec3 wp = vec3(uCameraPos.x + relX, baseY + relY, uCameraPos.z + relZ);
        vec4 mvPos = viewMatrix * vec4(wp, 1.0);
        float camDist = max(1.0, length(wp - uCameraPos));
        float farFade = 1.0 - smoothstep(28.0, 115.0, camDist);
        float nearFade = smoothstep(1.0, 4.0, camDist);
        vDistAlpha = clamp(farFade * nearFade, 0.0, 1.0);
        vSeed = aSnowMeta.z;

        gl_PointSize = clamp((uSnowSize * aSnowMeta.y * uPixelRatio * 18.0) / max(-mvPos.z, 3.5), 1.5, 16.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uSnowColor;
      uniform float uSnowOpacity;
      varying float vDistAlpha;
      varying float vSeed;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        float flake = 1.0 - smoothstep(0.08, 0.5, d);
        float varAlpha = 0.62 + 0.38 * vSeed;
        float a = clamp(uSnowOpacity * flake * vDistAlpha * varAlpha, 0.0, 0.92);
        if (a < 0.01) discard;
        gl_FragColor = vec4(uSnowColor, a);
      }
    `,
  });

  const snowPoints = new THREE.Points(snowGeo, snowMat);
  snowPoints.frustumCulled = false;
  snowPoints.visible = false;
  scene.add(snowPoints);

  // ---------------------------------------------------------------------------
  // 3. DUAL-CELESTIAL LIGHTING RIG & VALLEY MIST
  // ---------------------------------------------------------------------------
  const primaryLight = new THREE.DirectionalLight(0xffc37d, 3.0);
  primaryLight.castShadow = !isSoftwareGl;
  const shadowMapDim = isSoftwareGl ? 1024 : 2048;
  primaryLight.shadow.mapSize.set(shadowMapDim, shadowMapDim);
  const shadowBound = 195;
  primaryLight.shadow.camera.left = -shadowBound;
  primaryLight.shadow.camera.right = shadowBound;
  primaryLight.shadow.camera.top = shadowBound;
  primaryLight.shadow.camera.bottom = -shadowBound;
  primaryLight.shadow.camera.near = 15;
  primaryLight.shadow.camera.far = 920;
  primaryLight.shadow.bias = -0.00032;
  primaryLight.shadow.normalBias = 0.022;
  primaryLight.shadow.radius = 2.0;
  scene.add(primaryLight);
  scene.add(primaryLight.target);

  const hemiLight = new THREE.HemisphereLight(0x88b4e6, 0x5c4632, 0.9);
  scene.add(hemiLight);

  const rimLight = new THREE.DirectionalLight(0x9dc0ea, 0.48);
  rimLight.position.set(-220, 110, 260);
  scene.add(rimLight);

  const fog = new THREE.FogExp2(0xe4ae78, 0.00068);
  scene.fog = fog;
  scene.background = new THREE.Color(0xe4ae78);

  const mistUniforms = {
    uMistColor: { value: new THREE.Color(0xe9ba88) },
    uMistStrength: { value: 0.42 },
  };

  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();

  const cZenithDay = new THREE.Color(0x2c64aa);
  const cZenithGold = new THREE.Color(0x24426e);
  const cZenithNight = new THREE.Color(0x050914);
  const cZenithOvercast = new THREE.Color(0x526173);

  const cHorizonDay = new THREE.Color(0xcbd9e8);
  const cHorizonGold = new THREE.Color(0xed9d60);
  const cHorizonTwilight = new THREE.Color(0x4b426b);
  const cHorizonNight = new THREE.Color(0x0e182a);
  const cHorizonOvercast = new THREE.Color(0x8d9aa8);

  const cCloudDay = new THREE.Color(0xfaf8f2);
  const cCloudGold = new THREE.Color(0xffbe80);
  const cCloudNight = new THREE.Color(0x4b638a);
  const cCloudOvercast = new THREE.Color(0x9ba6b4);

  const cCloudShDay = new THREE.Color(0x889cb8);
  const cCloudShGold = new THREE.Color(0x634d5b);
  const cCloudShNight = new THREE.Color(0x11192a);
  const cCloudShRain = new THREE.Color(0x343d4a);

  const cSunNoon = new THREE.Color(0xfff5e4);
  const cSunGold = new THREE.Color(0xff9b44);
  const cMoonBlue = new THREE.Color(0x9bb8eb);

  const cHemiSkyDay = new THREE.Color(0x95c0f0);
  const cHemiSkyNight = new THREE.Color(0x283e66);
  const cHemiGroundDay = new THREE.Color(0x5e4934);
  const cHemiGroundNight = new THREE.Color(0x131822);

  const activeDir = new THREE.Vector3();
  let currentWeather: WeatherPreset = 'dry';
  let activeSnowPreset: SnowAtmospherePreset | null = null;
  let lastSolarDeg = 168;
  let lastHazePreset: HazePreset = 'golden';
  let performanceFogScale = 1.0;

  const cSnowZenithAlpine = new THREE.Color(0x285d9e);
  const cSnowHorizonAlpine = new THREE.Color(0xd5e8f8);
  const cSnowZenithStorm = new THREE.Color(0x162238);
  const cSnowHorizonStorm = new THREE.Color(0x4c607c);
  const cSnowZenithSun = new THREE.Color(0x1d5aa8);
  const cSnowHorizonSun = new THREE.Color(0xcce6fa);

  const cSunsetStormZenith = new THREE.Color(0x1a1d2e);
  const cSunsetStormHorizon = new THREE.Color(0xc85534);
  const cSunsetStormCloudLit = new THREE.Color(0xff8e58);
  const cSunsetStormCloudSh = new THREE.Color(0x212334);
  const cSunsetStormSun = new THREE.Color(0xff6b35);

  const cMorningMistZenith = new THREE.Color(0x4e749b);
  const cMorningMistHorizon = new THREE.Color(0xd0dee9);
  const cMorningMistCloudLit = new THREE.Color(0xedf3f9);
  const cMorningMistCloudSh = new THREE.Color(0x9fb2c7);

  function getPhaseLabel(deg: number): string {
    const d = ((deg % 360) + 360) % 360;
    if (d < 22 || d >= 342) return 'Dawn';
    if (d < 152) return 'Daylight';
    if (d < 186) return 'Golden Hour';
    if (d < 206) return 'Twilight';
    return 'Night';
  }

  let hasCachedAtmo = false;
  let cSolar = 0;
  let cHaze: HazePreset = 'golden';
  let cWeather: WeatherPreset = 'dry';
  let cOvercast = 0;
  let cWetness = 0;
  let cRain = 0;
  let cStorm = 0;
  let cWind = 0;
  let cFog = 0;
  let cSnow: SnowAtmospherePreset | null = null;
  let cSunsetStorm = 0;
  let cMorningMist = 0;
  let cPerfFog = 0;
  const cachedAtmoResult: CelestialState = {
    solarAngleDeg: 0,
    nightFactor: 0,
    horizonProximity: 0,
    phaseLabel: 'Daylight',
  };

  function applyAtmosphereCore(
    solarAngleDeg: number,
    hazePreset: HazePreset,
    weatherPreset: WeatherPreset,
    overcastIn: number,
    wetnessIn: number,
    rainIntensity: number,
    stormIntensity: number,
    windSpeedScale: number,
    fogDensityScale: number,
    snowOverride: SnowAtmospherePreset | null,
    sunsetStormMixIn = weatherPreset === 'sunset_storm' ? 1 : 0,
    morningMistMixIn = weatherPreset === 'deep_morning_mist' ? 1 : 0,
  ): CelestialState {
    if (
      hasCachedAtmo &&
      cHaze === hazePreset &&
      cWeather === weatherPreset &&
      cSnow === snowOverride &&
      Math.abs(cSolar - solarAngleDeg) < 1e-3 &&
      Math.abs(cOvercast - overcastIn) < 5e-4 &&
      Math.abs(cWetness - wetnessIn) < 5e-4 &&
      Math.abs(cRain - rainIntensity) < 5e-4 &&
      Math.abs(cStorm - stormIntensity) < 5e-4 &&
      Math.abs(cWind - windSpeedScale) < 5e-4 &&
      Math.abs(cFog - fogDensityScale) < 5e-4 &&
      Math.abs(cSunsetStorm - sunsetStormMixIn) < 5e-4 &&
      Math.abs(cMorningMist - morningMistMixIn) < 5e-4 &&
      Math.abs(cPerfFog - performanceFogScale) < 5e-4
    ) {
      return cachedAtmoResult;
    }
    hasCachedAtmo = true;
    cSolar = solarAngleDeg;
    cHaze = hazePreset;
    cWeather = weatherPreset;
    cOvercast = overcastIn;
    cWetness = wetnessIn;
    cRain = rainIntensity;
    cStorm = stormIntensity;
    cWind = windSpeedScale;
    cFog = fogDensityScale;
    cSnow = snowOverride;
    cSunsetStorm = sunsetStormMixIn;
    cMorningMist = morningMistMixIn;
    cPerfFog = performanceFogScale;

    lastSolarDeg = solarAngleDeg;
    lastHazePreset = hazePreset;
    currentWeather = weatherPreset;
    const sunsetStormMix = snowOverride === null ? clamp(sunsetStormMixIn, 0, 1) : 0;
    const morningMistMix = snowOverride === null ? clamp(morningMistMixIn, 0, 1) : 0;
    skyUniforms.uSunsetStorm.value = sunsetStormMix;
    skyUniforms.uMorningMist.value = morningMistMix;

    const snowMode = snowOverride;
    let overcastAmt = overcastIn;
    let wetnessAmt = wetnessIn;

    if (snowMode !== null) {
      wetnessAmt = 0.0;
      rainLines.visible = false;
      const snowFallStrength =
        snowMode === 'twilight_storm'
          ? 1.0
          : snowMode === 'alpine_snow'
            ? clamp(0.65 + stormIntensity * 0.4, 0.45, 1.05)
            : clamp(stormIntensity * 1.1, 0, 1.0);
      snowPoints.visible = snowMode !== 'glacier_sun' || stormIntensity > 0.14;
      const snowTargetOvercast =
        snowMode === 'twilight_storm' ? 0.85 : snowMode === 'alpine_snow' ? 0.34 : 0.04;
      overcastAmt = clamp(lerp(snowTargetOvercast, 0.88, stormIntensity * 0.42), 0.02, 0.94);

      snowUniforms.uSnowFallSpeed.value = lerp(4.8, 11.8, stormIntensity);
      snowUniforms.uSnowWindFactor.value = lerp(1.1, 4.3, stormIntensity);
      snowUniforms.uSnowOpacity.value =
        (snowMode === 'twilight_storm' ? 0.86 : 0.72) * snowFallStrength;
      snowUniforms.uSnowSize.value = lerp(6.0, 7.3, stormIntensity);
      if (snowMode === 'twilight_storm' || stormIntensity > 0.6) {
        snowUniforms.uSnowColor.value.set(0xe4effc);
      } else {
        snowUniforms.uSnowColor.value.set(0xf5faff);
      }
    } else {
      snowPoints.visible = false;
      rainLines.visible = rainIntensity > 0.02;
    }

    weatherUniforms.uOvercast.value = overcastAmt;
    weatherUniforms.uWetness.value = wetnessAmt;

    // Couple global wind parameter to active weather, snow storm state, and atmospheric haze
    const hazeWindMod = hazePreset === 'low' ? 1.15 : hazePreset === 'golden' ? 1.0 : 0.85;
    if (snowMode !== null) {
      const snowWindAngle = lerp(0.56, 0.36, stormIntensity);
      baseWindSpeed =
        (snowMode === 'twilight_storm'
          ? 2.6
          : snowMode === 'alpine_snow'
            ? lerp(1.25, 2.1, stormIntensity)
            : lerp(0.88, 1.6, stormIntensity)) * hazeWindMod;
      weatherUniforms.uWindDir.value
        .set(Math.cos(snowWindAngle), Math.sin(snowWindAngle))
        .normalize();
    } else {
      baseWindSpeed = 0.95 * windSpeedScale * hazeWindMod;
      const windAngle = lerp(0.68, 0.42, clamp(overcastAmt * 0.7 + wetnessAmt * 0.3, 0, 1));
      weatherUniforms.uWindDir.value.set(Math.cos(windAngle), Math.sin(windAngle)).normalize();
    }
    weatherUniforms.uWindSpeed.value = baseWindSpeed;

    const rad = THREE.MathUtils.degToRad(solarAngleDeg);
    const azimuthRad = THREE.MathUtils.degToRad(36);
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    sunDir
      .set(cosA * Math.cos(azimuthRad), sinA, -cosA * Math.sin(azimuthRad))
      .normalize();
    moonDir
      .set(-sunDir.x * 0.88 + 0.22, -sunDir.y + 0.18, -sunDir.z * 0.88 - 0.18)
      .normalize();

    skyUniforms.uSunDirection.value.copy(sunDir);
    skyUniforms.uMoonDirection.value.copy(moonDir);
    skyUniforms.uSunElevationSin.value = sinA;

    const dayFactor = smoothstep(-0.04, 0.42, sinA);
    const goldenBand = Math.exp(-Math.pow((sinA - 0.08) / 0.22, 2));
    const twilightBand = Math.exp(-Math.pow((sinA + 0.08) / 0.14, 2));
    const nightFactor = smoothstep(0.08, -0.14, sinA);
    const horizonProximity = Math.exp(-Math.pow(sinA / 0.22, 2));

    skyUniforms.uZenithColor.value
      .copy(cZenithNight)
      .lerp(cZenithGold, goldenBand * 0.95)
      .lerp(cZenithDay, dayFactor)
      .lerp(cZenithOvercast, overcastAmt * (0.35 + 0.65 * dayFactor));

    skyUniforms.uHorizonColor.value
      .copy(cHorizonNight)
      .lerp(cHorizonTwilight, twilightBand)
      .lerp(cHorizonGold, goldenBand)
      .lerp(cHorizonDay, smoothstep(0.25, 0.72, sinA))
      .lerp(cHorizonOvercast, overcastAmt * (0.28 + 0.72 * dayFactor));

    if (snowMode === 'alpine_snow') {
      skyUniforms.uZenithColor.value.lerp(cSnowZenithAlpine, 0.45 * dayFactor);
      skyUniforms.uHorizonColor.value.lerp(cSnowHorizonAlpine, 0.55 * dayFactor);
    } else if (snowMode === 'twilight_storm') {
      skyUniforms.uZenithColor.value.lerp(cSnowZenithStorm, 0.72);
      skyUniforms.uHorizonColor.value.lerp(cSnowHorizonStorm, 0.68);
    } else if (snowMode === 'glacier_sun') {
      skyUniforms.uZenithColor.value.lerp(cSnowZenithSun, 0.5 * dayFactor);
      skyUniforms.uHorizonColor.value.lerp(cSnowHorizonSun, 0.45 * dayFactor);
    }

    if (sunsetStormMix > 0.01) {
      skyUniforms.uZenithColor.value.lerp(cSunsetStormZenith, 0.84 * sunsetStormMix);
      skyUniforms.uHorizonColor.value.lerp(cSunsetStormHorizon, 0.78 * sunsetStormMix);
    }
    if (morningMistMix > 0.01) {
      skyUniforms.uZenithColor.value.lerp(cMorningMistZenith, 0.72 * morningMistMix);
      skyUniforms.uHorizonColor.value.lerp(cMorningMistHorizon, 0.85 * morningMistMix);
    }

    skyUniforms.uCloudLitColor.value
      .copy(cCloudNight)
      .lerp(cCloudGold, goldenBand)
      .lerp(cCloudDay, smoothstep(0.2, 0.65, sinA))
      .lerp(cCloudOvercast, overcastAmt * (0.3 + 0.7 * dayFactor));
    if (sunsetStormMix > 0.01) {
      skyUniforms.uCloudLitColor.value.lerp(cSunsetStormCloudLit, 0.78 * sunsetStormMix);
    }
    if (morningMistMix > 0.01) {
      skyUniforms.uCloudLitColor.value.lerp(cMorningMistCloudLit, 0.75 * morningMistMix);
    }

    skyUniforms.uCloudShadowColor.value
      .copy(cCloudShNight)
      .lerp(cCloudShGold, goldenBand)
      .lerp(cCloudShDay, smoothstep(0.18, 0.65, sinA))
      .lerp(cCloudShRain, overcastAmt * (0.4 + 0.6 * dayFactor));
    if (sunsetStormMix > 0.01) {
      skyUniforms.uCloudShadowColor.value.lerp(cSunsetStormCloudSh, 0.82 * sunsetStormMix);
    }
    if (morningMistMix > 0.01) {
      skyUniforms.uCloudShadowColor.value.lerp(cMorningMistCloudSh, 0.65 * morningMistMix);
    }

    starUniforms.uVisibility.value = smoothstep(0.08, -0.16, sinA) * (1 - overcastAmt * 0.92);

    if (sinA >= -0.02) {
      activeDir.copy(sunDir);
      if (activeDir.y < 0.08) activeDir.y = 0.08;
      activeDir.normalize();

      primaryLight.color
        .copy(cSunGold)
        .lerp(cSunNoon, smoothstep(0.05, 0.5, sinA))
        .lerp(cSunsetStormSun, sunsetStormMix * 0.75);
      const baseIntensity = lerp(0.6, 3.35, smoothstep(-0.02, 0.22, sinA));
      primaryLight.intensity =
        baseIntensity *
        (1.0 - overcastAmt * 0.62) *
        lerp(1.0, 0.82, morningMistMix * 0.65);
    } else {
      activeDir.copy(moonDir);
      if (activeDir.y < 0.14) activeDir.y = 0.14;
      activeDir.normalize();

      primaryLight.color.copy(cMoonBlue);
      primaryLight.intensity =
        lerp(0.18, 0.34, smoothstep(-0.02, -0.25, sinA)) * (1.0 - overcastAmt * 0.45);
    }

    if (snowMode === 'glacier_sun') {
      primaryLight.intensity = Math.max(
        primaryLight.intensity,
        (3.15 * dayFactor + 0.45) * (1.0 - stormIntensity * 0.35),
      );
    }

    hemiLight.color.copy(cHemiSkyNight).lerp(cHemiSkyDay, dayFactor);
    hemiLight.groundColor.copy(cHemiGroundNight).lerp(cHemiGroundDay, dayFactor);
    if (snowMode !== null) {
      hemiLight.groundColor.lerp(cSnowHorizonAlpine, 0.35);
    }
    hemiLight.intensity = lerp(0.085, 0.98, dayFactor) * (1.0 + overcastAmt * 0.22);

    rimLight.intensity = lerp(0.075, 0.46, dayFactor) * (1.0 - overcastAmt * 0.3);
    scene.environmentIntensity = lerp(0.11, 0.86, dayFactor) * (1.0 + wetnessAmt * 0.16);

    const baseDensityMap: Record<HazePreset, number> = {
      low: 0.00032,
      golden: 0.00058,
      heavy: 0.00102,
    };
    const hazeIntensityMap: Record<HazePreset, number> = {
      low: 0.72,
      golden: 1.08,
      heavy: 1.42,
    };

    const weatherFogBoost =
      snowMode === 'twilight_storm'
        ? 1.65
        : snowMode === 'alpine_snow'
          ? lerp(1.12, 1.48, stormIntensity)
          : snowMode === 'glacier_sun'
            ? lerp(0.76, 1.18, stormIntensity)
            : fogDensityScale;
    const reactiveMultiplier = (1.0 + horizonProximity * 1.25) * weatherFogBoost;
    fog.density = baseDensityMap[hazePreset] * reactiveMultiplier * performanceFogScale;
    skyUniforms.uHazeIntensity.value =
      hazeIntensityMap[hazePreset] * (0.9 + horizonProximity * 0.45);

    fog.color.copy(skyUniforms.uHorizonColor.value);
    (scene.background as THREE.Color).copy(fog.color);

    mistUniforms.uMistColor.value
      .copy(skyUniforms.uHorizonColor.value)
      .lerp(cCloudDay, 0.18)
      .lerp(cMorningMistHorizon, morningMistMix * 0.65);
    const hazeMistBase = hazePreset === 'low' ? 0.14 : hazePreset === 'golden' ? 0.34 : 0.62;
    mistUniforms.uMistStrength.value =
      hazeMistBase * (0.55 + horizonProximity * 0.75) +
      wetnessAmt * 0.32 +
      morningMistMix * 0.92 +
      sunsetStormMix * 0.28 +
      (snowMode === 'twilight_storm' ? 0.28 : snowMode !== null ? stormIntensity * 0.22 : 0);

    rainUniforms.uRainColor.value
      .set(0xd2dfee)
      .lerp(skyUniforms.uHorizonColor.value, 0.35 + sunsetStormMix * 0.25)
      .multiplyScalar(lerp(0.52, 1.0, dayFactor));
    rainUniforms.uRainOpacity.value = lerp(0.32, 0.48, dayFactor) * clamp(rainIntensity, 0, 1);

    primaryLight.position.copy(primaryLight.target.position).addScaledVector(activeDir, 450);
    primaryLight.updateMatrixWorld();

    bakeSkyEnvironment(
      activeEnvRT === null,
      solarAngleDeg,
      hazePreset,
      weatherPreset,
      overcastAmt,
      wetnessAmt,
    );

    cachedAtmoResult.solarAngleDeg = solarAngleDeg;
    cachedAtmoResult.nightFactor = clamp(
      snowMode === 'twilight_storm'
        ? Math.max(nightFactor, 0.82)
        : Math.max(nightFactor, sunsetStormMix * 0.46),
      0,
      1,
    );
    cachedAtmoResult.horizonProximity = horizonProximity;
    cachedAtmoResult.phaseLabel =
      snowMode === 'twilight_storm' && nightFactor < 0.7
        ? 'Storm Dusk'
        : sunsetStormMix >= 0.5
          ? 'Sunset Storm'
          : morningMistMix >= 0.5
            ? 'Morning Mist'
            : getPhaseLabel(solarAngleDeg);
    return cachedAtmoResult;
  }

  function updateSolarCycle(
    solarAngleDeg: number,
    hazePreset: HazePreset,
    weatherPreset: WeatherPreset = currentWeather,
  ): CelestialState {
    const overcastAmt =
      weatherPreset === 'overcast'
        ? 0.88
        : weatherPreset === 'rain'
          ? 0.92
          : weatherPreset === 'sunset_storm'
            ? 0.86
            : weatherPreset === 'deep_morning_mist'
              ? 0.34
              : 0.0;
    const wetnessAmt =
      weatherPreset === 'rain'
        ? 1.0
        : weatherPreset === 'sunset_storm'
          ? 0.95
          : weatherPreset === 'deep_morning_mist'
            ? 0.28
            : 0.0;
    const rainIntensity =
      weatherPreset === 'rain' ? 1.0 : weatherPreset === 'sunset_storm' ? 0.92 : 0.0;
    const stormIntensity =
      activeSnowPreset === 'twilight_storm'
        ? 1.0
        : activeSnowPreset === 'alpine_snow'
          ? 0.55
          : weatherPreset === 'sunset_storm'
            ? 0.95
            : 0.0;
    const windSpeedScale =
      weatherPreset === 'sunset_storm'
        ? 2.65
        : weatherPreset === 'rain'
          ? 2.35
          : weatherPreset === 'overcast'
            ? 1.55
            : weatherPreset === 'deep_morning_mist'
              ? 0.65
              : 1.0;
    const fogDensityScale =
      weatherPreset === 'deep_morning_mist'
        ? 2.35
        : weatherPreset === 'sunset_storm'
          ? 1.65
          : weatherPreset === 'rain'
            ? 1.55
            : weatherPreset === 'overcast'
              ? 1.25
              : 1.0;

    return applyAtmosphereCore(
      solarAngleDeg,
      hazePreset,
      weatherPreset,
      overcastAmt,
      wetnessAmt,
      rainIntensity,
      stormIntensity,
      windSpeedScale,
      fogDensityScale,
      activeSnowPreset,
      weatherPreset === 'sunset_storm' ? 1.0 : 0.0,
      weatherPreset === 'deep_morning_mist' ? 1.0 : 0.0,
    );
  }

  function updateContinuousWeather(
    solarAngleDeg: number,
    hazePreset: HazePreset,
    weatherState: ContinuousWeatherState,
    snowPreset: SnowAtmospherePreset | null = activeSnowPreset,
  ): CelestialState {
    activeSnowPreset = snowPreset;
    return applyAtmosphereCore(
      solarAngleDeg,
      hazePreset,
      weatherState.nearestPreset,
      weatherState.overcast,
      weatherState.wetness,
      weatherState.rainIntensity,
      weatherState.stormIntensity,
      weatherState.windSpeedScale,
      weatherState.fogDensityScale,
      snowPreset,
      weatherState.sunsetStormIntensity ?? (weatherState.nearestPreset === 'sunset_storm' ? 1 : 0),
      weatherState.mistIntensity ?? (weatherState.nearestPreset === 'deep_morning_mist' ? 1 : 0),
    );
  }

  function updateAtmosphereTime(elapsedSec: number, cameraPos?: THREE.Vector3) {
    weatherUniforms.uTime.value = elapsedSec;
    // Natural low-frequency atmospheric wind gusts modulating the global wind speed
    const gust =
      1.0 +
      0.22 * Math.sin(elapsedSec * 0.43) +
      0.14 * Math.sin(elapsedSec * 1.17 + 1.2);
    weatherUniforms.uWindSpeed.value = baseWindSpeed * gust;

    if (cameraPos) {
      rainUniforms.uCameraPos.value.copy(cameraPos);
      skyDome.position.copy(cameraPos);
      starPoints.position.copy(cameraPos);
    }
  }

  function updateShadowCenter(target: THREE.Vector3) {
    const mapDim = Math.max(512, primaryLight.shadow.mapSize.x || 1024);
    const span = Math.max(60, (primaryLight.shadow.camera.right - primaryLight.shadow.camera.left) || 230);
    const texelStep = Math.max(0.25, span / mapDim);
    const sx = Math.round(clamp(target.x, -1050, 1050) / texelStep) * texelStep;
    const sy = Math.round(clamp(target.y, -20, 190) / texelStep) * texelStep;
    const sz = Math.round(clamp(target.z, -1050, 1050) / texelStep) * texelStep;
    if (
      Math.abs(primaryLight.target.position.x - sx) < 0.01 &&
      Math.abs(primaryLight.target.position.y - sy) < 0.01 &&
      Math.abs(primaryLight.target.position.z - sz) < 0.01
    ) {
      return;
    }
    primaryLight.target.position.set(sx, sy, sz);
    primaryLight.target.updateMatrixWorld();
    primaryLight.position.copy(primaryLight.target.position).addScaledVector(activeDir, 450);
  }

  updateSolarCycle(168, 'golden', 'dry');
  bakeSkyEnvironment(true, 168, 'golden', 'dry');

  return {
    updateSolarCycle,
    updateContinuousWeather,
    updateAtmosphereTime,
    updateShadowCenter,
    getMistUniforms: () => mistUniforms,
    getWeatherUniforms: () => weatherUniforms,
    getSkyPalette: () => ({
      zenith: skyUniforms.uZenithColor.value,
      horizon: skyUniforms.uHorizonColor.value,
    }),
    getSunDirection: (out?: THREE.Vector3) => (out ? out.copy(sunDir) : sunDir.clone()),
    setShadowQuality: (mapSize: number) => {
      if (isSoftwareGl) return;
      const safeDim = clamp(Math.round(mapSize), 512, 3072);
      if (primaryLight.shadow.mapSize.x === safeDim) return;
      primaryLight.shadow.mapSize.set(safeDim, safeDim);
      if (primaryLight.shadow.map) {
        primaryLight.shadow.map.dispose();
        primaryLight.shadow.map = null;
      }
    },
    setShadowsEnabled: (enabled: boolean) => {
      primaryLight.castShadow = !isSoftwareGl && enabled;
    },
    setShadowBounds: (halfExtent: number) => {
      const bound = clamp(halfExtent, 55, 260);
      if (Math.abs(primaryLight.shadow.camera.right - bound) < 1) return;
      primaryLight.shadow.camera.left = -bound;
      primaryLight.shadow.camera.right = bound;
      primaryLight.shadow.camera.top = bound;
      primaryLight.shadow.camera.bottom = -bound;
      primaryLight.shadow.camera.updateProjectionMatrix();
    },
    setSnowAtmosphere: (preset: SnowAtmospherePreset | null) => {
      if (activeSnowPreset === preset) return;
      activeSnowPreset = preset;
      hasCachedAtmo = false;
      updateSolarCycle(lastSolarDeg, lastHazePreset, currentWeather);
    },
    setPerformanceFogScale: (scale: number) => {
      const clamped = clamp(scale, 0.55, 1.85);
      if (Math.abs(clamped - performanceFogScale) < 0.02) return;
      performanceFogScale = clamped;
      hasCachedAtmo = false;
      updateSolarCycle(lastSolarDeg, lastHazePreset, currentWeather);
    },
    dispose: () => {
      disposed = true;
      if (pendingBakeRaf) {
        cancelAnimationFrame(pendingBakeRaf);
        pendingBakeRaf = 0;
      }
      skyGeo.dispose();
      pmremSkyMesh.geometry.dispose();
      skyMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      rainGeo.dispose();
      rainMat.dispose();
      snowGeo.dispose();
      snowMat.dispose();
      if (activeEnvRT) activeEnvRT.dispose();
      pmremGenerator.dispose();
    },
  };
}
