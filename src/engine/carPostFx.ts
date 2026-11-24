import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';

export const CAR_POSTFX_LAYER = 2;

interface CarMeshCacheEntry {
  mesh: THREE.Mesh;
  origMat: THREE.Material | THREE.Material[];
  gbufMat: THREE.ShaderMaterial;
}

const GBUF_VERTEX_SHADER = `
  varying vec3 vViewNormal;
  void main() {
    vec3 rawN = normalMatrix * normal;
    float nLen = length(rawN);
    vViewNormal = nLen > 1e-5 ? (rawN / nLen) : vec3(0.0, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GBUF_FRAGMENT_SHADER = `
  uniform sampler2D uSceneDepth;
  uniform vec2 uResolution;
  uniform float uLutWeight;
  uniform float uSsrWeight;
  uniform float uDirtLevel;

  varying vec3 vViewNormal;

  vec2 octEncode(vec3 n) {
    float l1 = abs(n.x) + abs(n.y) + abs(n.z);
    if (l1 < 1e-5) {
      return vec2(0.5, 0.5);
    }
    n /= l1;
    if (n.z < 0.0) {
      vec2 s = vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
      n.xy = (1.0 - abs(n.yx)) * s;
    }
    return clamp(n.xy * 0.5 + 0.5, 0.0, 1.0);
  }

  void main() {
    vec2 screenUv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
    float sceneDepth = texture2D(uSceneDepth, screenUv).x;
    if (gl_FragCoord.z > sceneDepth + 0.00035) {
      discard;
    }

    float nLen = length(vViewNormal);
    vec3 n = nLen > 1e-5 ? (vViewNormal / nLen) : vec3(0.0, 0.0, 1.0);
    if (!gl_FrontFacing) {
      n = -n;
    }

    float cleanFactor = clamp(1.0 - uDirtLevel * 0.78, 0.14, 1.0);
    float lutW = clamp(uLutWeight * mix(1.0, 0.35, uDirtLevel), 0.0, 1.0);
    float ssrW = clamp(uSsrWeight * cleanFactor, 0.0, 1.0);

    gl_FragColor = vec4(octEncode(n), lutW, ssrW);
  }
`;

const COMPOSITE_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const COMPOSITE_FRAGMENT_SHADER = `
  uniform sampler2D tDiffuse;
  uniform sampler2D tCarGBuffer;
  uniform sampler2D uSceneDepth;
  uniform mat4 uProjMatrix;
  uniform mat4 uInvProjMatrix;
  uniform mat4 uInvViewMatrix;
  uniform vec3 uSkyZenith;
  uniform vec3 uSkyHorizon;
  uniform float uSsrStrength;
  uniform float uLutStrength;
  uniform int uSsrSteps;
  uniform float uFarBlurStrength;
  uniform vec2 uTexelSize;

  varying vec2 vUv;

  vec3 sanitizeHdr(vec3 c) {
    vec3 safe = vec3(
      (c.r >= 0.0 && c.r <= 64.0) ? c.r : 0.0,
      (c.g >= 0.0 && c.g <= 64.0) ? c.g : 0.0,
      (c.b >= 0.0 && c.b <= 64.0) ? c.b : 0.0
    );
    return clamp(safe, vec3(0.0), vec3(32.0));
  }

  vec3 octDecode(vec2 e) {
    vec2 f = clamp(e, 0.0, 1.0) * 2.0 - 1.0;
    vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
    float t = clamp(-n.z, 0.0, 1.0);
    n.x += n.x >= 0.0 ? -t : t;
    n.y += n.y >= 0.0 ? -t : t;
    float len = length(n);
    return len > 1e-5 ? (n / len) : vec3(0.0, 0.0, 1.0);
  }

  vec3 reconstructViewPos(vec2 uv, float depth) {
    vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 viewPos = uInvProjMatrix * ndc;
    float w = abs(viewPos.w) > 1e-5 ? viewPos.w : (viewPos.w >= 0.0 ? 1e-5 : -1e-5);
    return viewPos.xyz / w;
  }

  vec3 sampleSkyFallback(vec3 viewDirRefl) {
    vec3 wr = (uInvViewMatrix * vec4(viewDirRefl, 0.0)).xyz;
    float wrLen = length(wr);
    vec3 worldR = wrLen > 1e-5 ? (wr / wrLen) : vec3(0.0, 1.0, 0.0);
    float h = clamp(worldR.y * 0.5 + 0.5, 0.0, 1.0);
    return mix(uSkyHorizon * 0.55, uSkyZenith * 0.85, smoothstep(0.38, 0.92, h));
  }

  vec3 applyCarPaintLut(vec3 c) {
    vec3 safeC = max(c, vec3(0.0));
    float luma = dot(safeC, vec3(0.2126, 0.7152, 0.0722));
    vec3 shadowDeep = vec3(0.86, 0.88, 0.94);
    vec3 highWarm = vec3(1.06, 1.02, 0.97);
    vec3 splitTint = mix(shadowDeep, highWarm, smoothstep(0.08, 0.90, luma));

    vec3 contrasted = safeC * (0.62 + 0.56 * smoothstep(0.05, 0.74, luma));
    float maxCh = max(contrasted.r, max(contrasted.g, contrasted.b));
    float minCh = min(contrasted.r, min(contrasted.g, contrasted.b));
    float sat = maxCh - minCh;
    float vibrance = 0.24 * (1.0 - clamp(sat * 1.15, 0.0, 0.75));
    float newLuma = dot(contrasted, vec3(0.2126, 0.7152, 0.0722));
    vec3 graded = mix(vec3(newLuma), contrasted, 1.0 + vibrance) * splitTint;
    return max(graded, vec3(0.0));
  }

  void main() {
    vec4 baseSample = texture2D(tDiffuse, vUv);
    vec3 col = sanitizeHdr(baseSample.rgb);

    vec4 gbuf = texture2D(tCarGBuffer, vUv);
    float lutMask = clamp(gbuf.b, 0.0, 1.0);
    float ssrMask = clamp(gbuf.a, 0.0, 1.0);

    // Early out for all non-car pixels (terrain, asphalt, sky, barriers, foliage) -> 0% cost & 0% terrain alteration
    if (lutMask > 0.005 || ssrMask > 0.005) {
      if (ssrMask > 0.01 && uSsrStrength > 0.01 && uSsrSteps > 0) {
        float depth = texture2D(uSceneDepth, vUv).x;
        if (depth < 0.99995) {
          vec3 viewPos = reconstructViewPos(vUv, depth);
          float vpLen = length(viewPos);
          vec3 viewDir = vpLen > 1e-5 ? (viewPos / vpLen) : vec3(0.0, 0.0, -1.0);
          vec3 N = octDecode(gbuf.rg);
          vec3 rawR = reflect(viewDir, N);
          float rLen = length(rawR);
          vec3 R = rLen > 1e-5 ? (rawR / rLen) : vec3(0.0, 1.0, 0.0);

          float ndotv = clamp(dot(-viewDir, N), 0.0, 1.0);
          float fresnel = mix(0.05, 0.80, pow(max(1.0 - ndotv, 1e-4), 3.8));

          float stepLen = clamp((-viewPos.z) * 0.045, 0.18, 1.65);
          vec3 rayPos = viewPos + N * 0.04;
          vec3 prevRay = rayPos;

          bool hit = false;
          vec2 hitUv = vUv;
          float prevThickness = -0.1;
          float maxThickness = 0.55 + stepLen * 1.5;

          for (int i = 0; i < 8; i++) {
            if (i >= uSsrSteps) break;
            prevRay = rayPos;
            rayPos += R * (stepLen * (1.0 + float(i) * 0.16));

            if (rayPos.z >= -0.2) break;

            vec4 clip = uProjMatrix * vec4(rayPos, 1.0);
            if (clip.w <= 1e-4) break;
            vec2 sampleUv = (clip.xy / clip.w) * 0.5 + 0.5;
            if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) break;

            float sceneD = texture2D(uSceneDepth, sampleUv).x;
            if (sceneD < 0.99992) {
              vec3 sceneView = reconstructViewPos(sampleUv, sceneD);
              float thickness = sceneView.z - rayPos.z;
              if (thickness > 0.0 && thickness < maxThickness) {
                float denom = max(thickness - prevThickness, 0.001);
                float alpha = clamp(-prevThickness / denom, 0.0, 1.0);
                vec3 refinedRay = mix(prevRay, rayPos, alpha);
                vec4 finClip = uProjMatrix * vec4(refinedRay, 1.0);
                if (finClip.w > 1e-4) {
                  hitUv = (finClip.xy / finClip.w) * 0.5 + 0.5;
                  hit = true;
                }
                break;
              }
              prevThickness = thickness;
            }
          }

          vec3 skyRefl = sanitizeHdr(sampleSkyFallback(R));
          vec3 reflColor = skyRefl;
          if (hit) {
            vec2 edge = smoothstep(0.0, 0.14, hitUv) * (1.0 - smoothstep(0.86, 1.0, hitUv));
            float screenFade = edge.x * edge.y * (1.0 - smoothstep(0.15, 0.72, R.z));
            vec3 sceneRefl = sanitizeHdr(texture2D(tDiffuse, clamp(hitUv, 0.0, 1.0)).rgb);
            reflColor = mix(skyRefl, sceneRefl, clamp(screenFade, 0.0, 1.0));
          }

          float reflWeight = fresnel * ssrMask * uSsrStrength;
          col = mix(col, reflColor, clamp(reflWeight * 0.44, 0.0, 0.58));
          col += reflColor * (reflWeight * 0.14);
        }
      }

      if (lutMask > 0.005 && uLutStrength > 0.01) {
        vec3 graded = applyCarPaintLut(col);
        col = mix(col, graded, clamp(lutMask * uLutStrength, 0.0, 1.0));
      }
    } else if (uFarBlurStrength > 0.01) {
      float depth = texture2D(uSceneDepth, vUv).x;
      // Only blur far terrain/distant mountains (> ~380m), never the sky, Sun, Moon, or stars
      if (depth < 0.99972) {
        vec3 viewPos = reconstructViewPos(vUv, depth);
        float viewDist = length(viewPos);
        float blurMask = smoothstep(380.0, 610.0, viewDist) * uFarBlurStrength;
        if (blurMask > 0.02) {
          vec2 r = uTexelSize * (blurMask * 2.2);
          vec3 acc = col;
          float wSum = 1.0;
          vec2 offsets[4];
          offsets[0] = vec2(-0.85, 0.45);
          offsets[1] = vec2(0.85, -0.45);
          offsets[2] = vec2(-0.45, -0.85);
          offsets[3] = vec2(0.45, 0.85);
          for (int k = 0; k < 4; k++) {
            vec2 suv = clamp(vUv + offsets[k] * r, vec2(0.001), vec2(0.999));
            float sd = texture2D(uSceneDepth, suv).x;
            vec4 sg = texture2D(tCarGBuffer, suv);
            if (sd < 0.99972 && sg.b < 0.01 && sg.a < 0.01) {
              acc += sanitizeHdr(texture2D(tDiffuse, suv).rgb);
              wSum += 1.0;
            }
          }
          col = mix(col, acc / wSum, clamp(blurMask * 0.85, 0.0, 0.88));
        }
      }
    }

    gl_FragColor = vec4(sanitizeHdr(col), clamp(baseSample.a, 0.0, 1.0));
  }
`;

export class CarSsrAndLutPass extends Pass {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private carGBufferRT: THREE.WebGLRenderTarget;
  private gbufSize = new THREE.Vector2(1, 1);
  private sceneDepthUniform = { value: null as THREE.Texture | null };
  private resolutionUniform = { value: new THREE.Vector2(1, 1) };
  private dirtUniform = { value: 0 };

  private gbufTemplates: Map<string, THREE.ShaderMaterial> = new Map();
  private rootMeshCache: WeakMap<THREE.Object3D, CarMeshCacheEntry[]> = new WeakMap();
  private meshCache: CarMeshCacheEntry[] = [];
  private cachedCarRoot: THREE.Object3D | null = null;
  private isInteriorView = false;

  private compositeMaterial: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;
  private prevClearColor = new THREE.Color();

  constructor(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.needsSwap = true;

    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.gbufSize.set(w, h);
    this.resolutionUniform.value.set(w, h);

    this.carGBufferRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tCarGBuffer: { value: this.carGBufferRT.texture },
        uSceneDepth: this.sceneDepthUniform,
        uProjMatrix: { value: new THREE.Matrix4() },
        uInvProjMatrix: { value: new THREE.Matrix4() },
        uInvViewMatrix: { value: new THREE.Matrix4() },
        uSkyZenith: { value: new THREE.Color(0x284e7e) },
        uSkyHorizon: { value: new THREE.Color(0xf0b27a) },
        uSsrStrength: { value: 0.92 },
        uLutStrength: { value: 1.0 },
        uSsrSteps: { value: 12 },
        uFarBlurStrength: { value: 0.0 },
        uTexelSize: { value: new THREE.Vector2(1 / Math.max(1, w), 1 / Math.max(1, h)) },
      },
      vertexShader: COMPOSITE_VERTEX_SHADER,
      fragmentShader: COMPOSITE_FRAGMENT_SHADER,
      depthWrite: false,
      depthTest: false,
    });

    this.fsQuad = new FullScreenQuad(this.compositeMaterial);
  }

  private getOrCreateGBufMat(lutWeight: number, ssrWeight: number): THREE.ShaderMaterial {
    const key = `${lutWeight.toFixed(2)}_${ssrWeight.toFixed(2)}`;
    const existing = this.gbufTemplates.get(key);
    if (existing) return existing;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSceneDepth: this.sceneDepthUniform,
        uResolution: this.resolutionUniform,
        uLutWeight: { value: lutWeight },
        uSsrWeight: { value: ssrWeight },
        uDirtLevel: this.dirtUniform,
      },
      vertexShader: GBUF_VERTEX_SHADER,
      fragmentShader: GBUF_FRAGMENT_SHADER,
      side: THREE.FrontSide,
      depthWrite: true,
      depthTest: true,
    });
    this.gbufTemplates.set(key, mat);
    return mat;
  }

  public setCarRoot(carRoot: THREE.Object3D | null) {
    if (this.cachedCarRoot === carRoot) return;
    this.cachedCarRoot = carRoot;
    if (!carRoot) {
      this.meshCache = [];
      return;
    }

    const cached = this.rootMeshCache.get(carRoot);
    if (cached) {
      this.meshCache = cached;
      return;
    }

    const built: CarMeshCacheEntry[] = [];
    carRoot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.layers.enable(CAR_POSTFX_LAYER);
      const w = typeof child.userData.carPaintWeight === 'number' ? child.userData.carPaintWeight : 0.2;
      const matName = String(child.userData.matName ?? '');
      const isGlass =
        Boolean(child.userData.isCarGlass) ||
        matName === 'glass' ||
        matName === 'sm_110' ||
        matName === 'sm_158';
      const ssrW = w >= 0.9 ? 1.0 : w >= 0.5 ? 0.45 : isGlass ? 0.72 : 0.08;
      built.push({
        mesh: child,
        origMat: child.material,
        gbufMat: this.getOrCreateGBufMat(w, ssrW),
      });
    });
    this.rootMeshCache.set(carRoot, built);
    this.meshCache = built;
  }

  public setSceneParams(params: {
    dirtLevel: number;
    isInteriorView: boolean;
    skyZenith: THREE.Color;
    skyHorizon: THREE.Color;
    ssrStrength: number;
    lutStrength: number;
    ssrSteps: number;
    farBlurStrength?: number;
  }) {
    this.dirtUniform.value = params.dirtLevel;
    this.isInteriorView = params.isInteriorView;
    this.compositeMaterial.uniforms.uSkyZenith.value.copy(params.skyZenith);
    this.compositeMaterial.uniforms.uSkyHorizon.value.copy(params.skyHorizon);
    this.compositeMaterial.uniforms.uSsrStrength.value = params.ssrStrength;
    this.compositeMaterial.uniforms.uLutStrength.value = params.lutStrength;
    this.compositeMaterial.uniforms.uSsrSteps.value = params.ssrSteps;
    this.compositeMaterial.uniforms.uFarBlurStrength.value = params.farBlurStrength ?? 0.0;
  }

  public override setSize(width: number, height: number) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (this.gbufSize.x === w && this.gbufSize.y === h) return;
    this.gbufSize.set(w, h);
    this.carGBufferRT.setSize(w, h);
    this.resolutionUniform.value.set(w, h);
    this.compositeMaterial.uniforms.uTexelSize.value.set(1 / w, 1 / h);
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    this.sceneDepthUniform.value = readBuffer.depthTexture;
    this.resolutionUniform.value.set(readBuffer.width, readBuffer.height);
    this.compositeMaterial.uniforms.uTexelSize.value.set(
      1 / Math.max(1, readBuffer.width),
      1 / Math.max(1, readBuffer.height),
    );
    const useSsrGbuf =
      this.compositeMaterial.uniforms.uSsrStrength.value > 0.01 &&
      this.compositeMaterial.uniforms.uSsrSteps.value > 0 &&
      Boolean(this.cachedCarRoot) &&
      this.meshCache.length > 0 &&
      Boolean(readBuffer.depthTexture);

    if (useSsrGbuf) {
      if (this.carGBufferRT.width !== readBuffer.width || this.carGBufferRT.height !== readBuffer.height) {
        this.carGBufferRT.setSize(readBuffer.width, readBuffer.height);
      }

      const prevTarget = renderer.getRenderTarget();
      const prevAutoClear = renderer.autoClear;
      const prevClearAlpha = renderer.getClearAlpha();
      const prevShadowAutoUpdate = renderer.shadowMap.autoUpdate;
      const prevBackground = this.scene.background;
      const prevFog = this.scene.fog;
      const prevLayerMask = this.camera.layers.mask;
      renderer.getClearColor(this.prevClearColor);

      try {
        renderer.setRenderTarget(this.carGBufferRT);
        renderer.autoClear = true;
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, true, false);

        this.camera.layers.set(CAR_POSTFX_LAYER);
        renderer.shadowMap.autoUpdate = false;
        this.scene.background = null;
        this.scene.fog = null;

        const savedVis: boolean[] = new Array(this.meshCache.length);
        try {
          for (let i = 0; i < this.meshCache.length; i++) {
            const entry = this.meshCache[i];
            savedVis[i] = entry.mesh.visible;
            const matName = String(entry.mesh.userData.matName ?? '');
            const isGlass =
              Boolean(entry.mesh.userData.isCarGlass) ||
              matName === 'glass' ||
              matName === 'sm_110' ||
              matName === 'sm_158';
            // Do not run SSR/LUT over interior canopy windshield while sitting inside the cockpit
            if (this.isInteriorView && isGlass) {
              entry.mesh.visible = false;
            } else {
              entry.mesh.material = entry.gbufMat;
            }
          }

          renderer.render(this.scene, this.camera);
        } finally {
          for (let i = 0; i < this.meshCache.length; i++) {
            const entry = this.meshCache[i];
            entry.mesh.visible = savedVis[i];
            entry.mesh.material = entry.origMat;
          }
        }
      } finally {
        this.scene.background = prevBackground;
        this.scene.fog = prevFog;
        renderer.shadowMap.autoUpdate = prevShadowAutoUpdate;
        this.camera.layers.mask = prevLayerMask;
        renderer.setClearColor(this.prevClearColor, prevClearAlpha);
        renderer.autoClear = prevAutoClear;
        renderer.setRenderTarget(prevTarget);
      }
    }

    const prevTarget = renderer.getRenderTarget();

    // 2. Composite SSR + Car-Only Paint Grading LUT onto full-screen buffer
    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tCarGBuffer.value = this.carGBufferRT.texture;
    this.compositeMaterial.uniforms.uProjMatrix.value.copy(this.camera.projectionMatrix);
    this.compositeMaterial.uniforms.uInvProjMatrix.value.copy(this.camera.projectionMatrixInverse);
    this.compositeMaterial.uniforms.uInvViewMatrix.value.copy(this.camera.matrixWorld);

    try {
      if (this.renderToScreen) {
        renderer.setRenderTarget(null);
      } else {
        renderer.setRenderTarget(writeBuffer);
        if (this.clear) renderer.clear();
      }
      this.fsQuad.render(renderer);
    } finally {
      renderer.setRenderTarget(prevTarget);
    }
  }

  public override dispose() {
    this.carGBufferRT.dispose();
    for (const m of this.gbufTemplates.values()) {
      m.dispose();
    }
    this.gbufTemplates.clear();
    this.compositeMaterial.dispose();
    this.fsQuad.dispose();
  }
}
