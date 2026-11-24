import * as THREE from 'three';
import { createSeededRandom, fbm2D } from '../../engine/mathNoise';
import texAsphaltUrl from '../../../assets/images/tex_race_asphalt_1794930852539.jpg';
import texLimestoneUrl from '../../../assets/images/tex_limestone_strata_1794930838308.jpg';
import texMeadowUrl from '../../../assets/images/tex_alpine_meadow_1794930838177.jpg';
import texConcreteUrl from '../../../assets/images/tex_concrete_formwork_1794930838453.jpg';
import texBarkUrl from '../../../assets/images/tex_pine_bark_1794930839016.jpg';

export type TextureQualityTier = 'performance' | 'balanced' | 'ultra';

export interface ProceduralTextureSuite {
  asphaltAlbedo: THREE.CanvasTexture;
  asphaltNormal: THREE.DataTexture;
  asphaltRoughness: THREE.DataTexture;
  asphaltORM: THREE.DataTexture;
  startGridAlbedo: THREE.CanvasTexture;
  curbAlbedo: THREE.CanvasTexture;
  curbNormal: THREE.DataTexture;
  concreteAlbedo: THREE.CanvasTexture;
  concreteNormal: THREE.DataTexture;
  terrainGrassAlbedo: THREE.CanvasTexture;
  terrainGrassNormal: THREE.CanvasTexture;
  terrainGrassRoughness: THREE.CanvasTexture;
  terrainRockAlbedo: THREE.CanvasTexture;
  terrainRockNormal: THREE.CanvasTexture;
  terrainRockRoughness: THREE.CanvasTexture;
  terrainRockORM: THREE.DataTexture;
  terrainDetailMap: THREE.CanvasTexture;
  terrainDetailNormal: THREE.CanvasTexture;
  terrainNormal: THREE.DataTexture;
  barkAlbedo: THREE.CanvasTexture;
  barkNormal: THREE.DataTexture;
  coniferNeedleAlbedo: THREE.CanvasTexture;
  coniferNeedleNormal: THREE.CanvasTexture;
  coniferNeedleRoughness: THREE.CanvasTexture;
  waterFoamAlbedo: THREE.CanvasTexture;
  gravelAlbedo: THREE.CanvasTexture;
  mistSpriteAlbedo: THREE.CanvasTexture;
  catchFenceAlbedo: THREE.CanvasTexture;
  gantryBannerAlbedo: THREE.CanvasTexture;
  chevronSignAlbedo: THREE.CanvasTexture;
  distanceSign150Albedo: THREE.CanvasTexture;
  distanceSign100Albedo: THREE.CanvasTexture;
  distanceSign50Albedo: THREE.CanvasTexture;
  hydrateWorldPhotoTextures?: () => void;
  setCircuitBranding?: (title: string, subtitle: string, accentHex?: string) => void;
  setQualityProfile: (quality: TextureQualityTier) => void;
  dispose: () => void;
}

function writeNormalsFromHeights(
  heights: Float32Array,
  size: number,
  strength: number,
  outData: Uint8Array,
): void {
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;

      const dX = (heights[y * size + xp] - heights[y * size + xm]) * strength;
      const dY = (heights[yp * size + x] - heights[ym * size + x]) * strength;

      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const idx = (y * size + x) * 4;
      outData[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      outData[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      outData[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      outData[idx + 3] = 255;
    }
  }
}

function heightfieldToNormalTexture(
  heights: Float32Array,
  size: number,
  strength: number,
  repeatX = 1,
  repeatY = 1,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  writeNormalsFromHeights(heights, size, strength, data);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function configureColorTexture(
  tex: THREE.CanvasTexture,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function writeLinearNormalsFromLuminance(
  srcRgba: Uint8ClampedArray,
  size: number,
  strength: number,
  detailAmp: number,
  outRgba: Uint8ClampedArray,
): void {
  const lum = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const p = i * 4;
      const baseL = (srcRgba[p] * 0.299 + srcRgba[p + 1] * 0.587 + srcRgba[p + 2] * 0.114) / 255;
      // Fast deterministic micro-grain hash for razor-sharp 4K closeup normals
      let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) ^ 0x5bf03635;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      const grain = ((h ^ (h >>> 16)) >>> 0) / 4294967295 - 0.5;
      lum[i] = baseL + grain * detailAmp;
    }
  }
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dX = (lum[y * size + xp] - lum[y * size + xm]) * strength;
      const dY = (lum[yp * size + x] - lum[ym * size + x]) * strength;
      let nx = -dX;
      let ny = -dY;
      let nz = 1.0;
      const invLen = 1.0 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;
      const idx = (y * size + x) * 4;
      outRgba[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      outRgba[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      outRgba[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      outRgba[idx + 3] = 255;
    }
  }
}

function configureLinearCanvasTexture(
  tex: THREE.CanvasTexture,
  anisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Loads a photographic image asset and blends it toroidally across half-tile seams
 * at the target resolution (up to 4096x4096) with multi-scale detail overlay.
 */
function loadSeamlessPhotoIntoCanvas(
  url: string,
  targetCanvas: HTMLCanvasElement,
  onReady: (ctx: CanvasRenderingContext2D, size: number) => void,
  cancelledRef: { cancelled: boolean },
  targetSize?: number,
  enqueueJob?: (job: () => void) => void,
): void {
  if (typeof Image === 'undefined') return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    if (cancelledRef.cancelled) return;
    const executeBake = () => {
      if (cancelledRef.cancelled) return;
      if (targetSize && targetSize !== targetCanvas.width) {
        targetCanvas.width = targetSize;
        targetCanvas.height = targetSize;
      }
      const size = targetCanvas.width;
      const tmp = document.createElement('canvas');
      tmp.width = size;
      tmp.height = size;
      const tCtx = tmp.getContext('2d')!;
      tCtx.drawImage(img, 0, 0, size, size);
      const src = tCtx.getImageData(0, 0, size, size).data;

      const ctx = targetCanvas.getContext('2d')!;
      const outImg = ctx.createImageData(size, size);
      const out = outImg.data;
      const half = size >> 1;

      // Precompute 1D sine window weights to keep 4K baking ultra-fast (<50ms)
      const winLUT = new Float32Array(size);
      for (let k = 0; k < size; k++) {
        winLUT[k] = Math.sin((k / size) * Math.PI);
      }

      for (let y = 0; y < size; y++) {
        const wy = winLUT[y];
        const sy = (y + half) % size;
        const rowOff = y * size;
        const sRowOff = sy * size;
        for (let x = 0; x < size; x++) {
          const wA = winLUT[x] * wy;
          const wSmooth = wA * wA;
          const wB = 1.0 - wSmooth;

          const sx = (x + half) % size;
          const idxA = (rowOff + x) * 4;
          const idxB = (sRowOff + sx) * 4;

          // Subtle deterministic 4K micro-grain so upscaled texels stay razor-crisp
          let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) ^ 0x27d4eb2d;
          h = Math.imul(h ^ (h >>> 15), 2246822519);
          const grain = ((((h ^ (h >>> 13)) >>> 0) / 4294967295) - 0.5) * 14.0;

          out[idxA] = clampByte(src[idxA] * wSmooth + src[idxB] * wB + grain);
          out[idxA + 1] = clampByte(src[idxA + 1] * wSmooth + src[idxB + 1] * wB + grain);
          out[idxA + 2] = clampByte(src[idxA + 2] * wSmooth + src[idxB + 2] * wB + grain);
          out[idxA + 3] = 255;
        }
      }
      ctx.putImageData(outImg, 0, 0);
      onReady(ctx, size);
    };

    if (enqueueJob) {
      enqueueJob(executeBake);
    } else {
      executeBake();
    }
  };
  img.src = url;
}

function getQualityCap(
  quality: TextureQualityTier,
  maxTextureSize: number,
  isSoftwareGl: boolean,
): number {
  const tierCap = quality === 'performance' ? 512 : quality === 'balanced' ? 1024 : 1536;
  const hwCap = isSoftwareGl ? Math.min(maxTextureSize, 512) : maxTextureSize;
  return Math.min(tierCap, hwCap);
}

function getQualityAnisotropy(quality: TextureQualityTier, maxAnisotropy: number): number {
  const tierAniso = quality === 'performance' ? 2 : quality === 'balanced' ? 6 : 12;
  return Math.max(1, Math.min(maxAnisotropy, tierAniso));
}

function getRoadAnisotropy(quality: TextureQualityTier, maxAnisotropy: number): number {
  const tierAniso = quality === 'performance' ? 4 : quality === 'balanced' ? 8 : 16;
  return Math.max(1, Math.min(maxAnisotropy, tierAniso));
}

export function createProceduralTextureSuite(
  maxAnisotropy: number,
  maxTextureSize = 4096,
  isSoftwareGl = false,
  initialQuality: TextureQualityTier = 'balanced',
): ProceduralTextureSuite {
  let activeQuality: TextureQualityTier = initialQuality;
  let aniso = getQualityAnisotropy(initialQuality, maxAnisotropy);
  let roadAniso = getRoadAnisotropy(initialQuality, maxAnisotropy);
  const photoCap = getQualityCap('balanced', maxTextureSize, isSoftwareGl);
  const terrain4KSize = getQualityCap(initialQuality === 'ultra' ? 'ultra' : 'balanced', maxTextureSize, isSoftwareGl);
  const aspTargetSize = Math.min(768, Math.max(512, photoCap));
  const concTargetSize = Math.min(photoCap, 384);
  const barkTargetSize = Math.min(photoCap, 384);
  const rand = createSeededRandom(202604);
  const allTextures: THREE.Texture[] = [];
  const rescalableEntries: Array<{
    tex: THREE.CanvasTexture;
    fullCanvas: HTMLCanvasElement;
    scaledCache: Partial<Record<TextureQualityTier, HTMLCanvasElement>>;
  }> = [];
  const applyCanvasCapToEntry = (
    entry: {
      tex: THREE.CanvasTexture;
      fullCanvas: HTMLCanvasElement;
      scaledCache: Partial<Record<TextureQualityTier, HTMLCanvasElement>>;
    },
    quality: TextureQualityTier,
  ) => {
    const cap = getQualityCap(quality, maxTextureSize, isSoftwareGl);
    const fullW = entry.fullCanvas.width;
    const fullH = entry.fullCanvas.height;
    const maxDim = Math.max(fullW, fullH);
    if (maxDim <= cap) {
      if (entry.tex.image !== entry.fullCanvas) {
        entry.tex.image = entry.fullCanvas;
        entry.tex.needsUpdate = true;
      }
      return;
    }
    let scaled = entry.scaledCache[quality];
    if (!scaled) {
      const ratio = cap / maxDim;
      const tw = Math.max(32, Math.round(fullW * ratio));
      const th = Math.max(32, Math.round(fullH * ratio));
      scaled = document.createElement('canvas');
      scaled.width = tw;
      scaled.height = th;
      const ctx = scaled.getContext('2d');
      if (ctx) {
        ctx.drawImage(entry.fullCanvas, 0, 0, tw, th);
        entry.scaledCache[quality] = scaled;
      }
    }
    if (scaled && entry.tex.image !== scaled) {
      entry.tex.image = scaled;
      entry.tex.needsUpdate = true;
    }
  };
  const registerRescalableTexture = (tex: THREE.CanvasTexture, canvas: HTMLCanvasElement) => {
    const existing = rescalableEntries.find((e) => e.tex === tex);
    if (existing) {
      existing.fullCanvas = canvas;
      existing.scaledCache = {};
      applyCanvasCapToEntry(existing, activeQuality);
      return;
    }
    const entry = { tex, fullCanvas: canvas, scaledCache: {} };
    rescalableEntries.push(entry);
    applyCanvasCapToEntry(entry, activeQuality);
  };
  const cancelState = { cancelled: false };
  const photoQueue: Array<() => void> = [];
  let photoQueueRaf = 0;
  const pumpPhotoQueue = () => {
    photoQueueRaf = 0;
    if (cancelState.cancelled) {
      photoQueue.length = 0;
      return;
    }
    const nextJob = photoQueue.shift();
    if (nextJob) nextJob();
    if (photoQueue.length > 0) {
      photoQueueRaf = requestAnimationFrame(pumpPhotoQueue);
    }
  };
  const enqueuePhotoJob = (job: () => void) => {
    photoQueue.push(job);
    if (!photoQueueRaf) {
      photoQueueRaf = requestAnimationFrame(pumpPhotoQueue);
    }
  };
  const track = <T extends THREE.Texture>(t: T): T => {
    allTextures.push(t);
    return t;
  };

  const ASPHALT_REPEAT_X = 6;
  const ASPHALT_REPEAT_Y = 5;

  const aspSize = initialQuality === 'performance' ? 96 : 192;
  const aspCanvas = document.createElement('canvas');
  aspCanvas.width = aspSize;
  aspCanvas.height = aspSize;
  const aspCtx = aspCanvas.getContext('2d')!;
  const aspImg = aspCtx.createImageData(aspSize, aspSize);
  const aspHeights = new Float32Array(aspSize * aspSize);
  const aspRoughData = new Uint8Array(aspSize * aspSize * 4);
  const aspOrmData = new Uint8Array(aspSize * aspSize * 4);

  for (let y = 0; y < aspSize; y++) {
    const v = y / aspSize;
    for (let x = 0; x < aspSize; x++) {
      const u = x / aspSize;
      const fineGrain = rand();
      const medStone = fbm2D(u * 26, v * 26, 2, 2.0, 0.5, 44);
      const patchWear = fbm2D(u * 5.5 + 3.1, v * 5.5 - 1.4, 2, 2.1, 0.55, 89);

      const chip = fineGrain > 0.89 ? 22 : fineGrain > 0.78 ? 10 : fineGrain < 0.14 ? -10 : 0;
      const base =
        56 +
        (fineGrain - 0.5) * 20 +
        medStone * 9 +
        patchWear * 6;

      const idx = (y * aspSize + x) * 4;
      aspImg.data[idx] = clampByte(base + chip * 0.9);
      aspImg.data[idx + 1] = clampByte(base + chip * 0.9 + 1);
      aspImg.data[idx + 2] = clampByte(base + 5 + chip * 0.85);
      aspImg.data[idx + 3] = 255;

      const aspH = fineGrain * 0.65 + (medStone * 0.5 + 0.5) * 0.35;
      aspHeights[y * aspSize + x] = aspH;

      const roughNorm = 0.78 + patchWear * 0.05 + (fineGrain - 0.5) * 0.07;
      const roughVal = clampByte(roughNorm * 255);
      aspRoughData[idx] = roughVal;
      aspRoughData[idx + 1] = roughVal;
      aspRoughData[idx + 2] = roughVal;
      aspRoughData[idx + 3] = 255;

      // Packed ORM linear buffer: R=Cavity AO, G=Roughness, B=Aggregate sparkle height
      aspOrmData[idx] = clampByte((0.72 + aspH * 0.28) * 255);
      aspOrmData[idx + 1] = roughVal;
      aspOrmData[idx + 2] = clampByte((fineGrain > 0.82 ? 0.55 + fineGrain * 0.45 : aspH * 0.46) * 255);
      aspOrmData[idx + 3] = 255;
    }
  }
  aspCtx.putImageData(aspImg, 0, 0);

  const asphaltAlbedo = track(
    configureColorTexture(new THREE.CanvasTexture(aspCanvas), roadAniso, ASPHALT_REPEAT_X, ASPHALT_REPEAT_Y),
  );
  const asphaltNormal = track(
    heightfieldToNormalTexture(aspHeights, aspSize, 2.0, ASPHALT_REPEAT_X, ASPHALT_REPEAT_Y),
  );
  asphaltNormal.anisotropy = roadAniso;

  const asphaltRoughness = track(new THREE.DataTexture(aspRoughData, aspSize, aspSize, THREE.RGBAFormat));
  asphaltRoughness.wrapS = THREE.RepeatWrapping;
  asphaltRoughness.wrapT = THREE.RepeatWrapping;
  asphaltRoughness.repeat.set(ASPHALT_REPEAT_X, ASPHALT_REPEAT_Y);
  asphaltRoughness.generateMipmaps = true;
  asphaltRoughness.minFilter = THREE.LinearMipmapLinearFilter;
  asphaltRoughness.magFilter = THREE.LinearFilter;
  asphaltRoughness.anisotropy = roadAniso;
  asphaltRoughness.needsUpdate = true;

  const asphaltORM = track(new THREE.DataTexture(aspOrmData, aspSize, aspSize, THREE.RGBAFormat));
  asphaltORM.colorSpace = THREE.NoColorSpace;
  asphaltORM.wrapS = THREE.RepeatWrapping;
  asphaltORM.wrapT = THREE.RepeatWrapping;
  asphaltORM.repeat.set(ASPHALT_REPEAT_X, ASPHALT_REPEAT_Y);
  asphaltORM.generateMipmaps = true;
  asphaltORM.minFilter = THREE.LinearMipmapLinearFilter;
  asphaltORM.magFilter = THREE.LinearFilter;
  asphaltORM.anisotropy = roadAniso;
  asphaltORM.needsUpdate = true;

  // Photo-texture upgrades are queued lazily when a track world is entered (zero Garage boot overhead).
  const photoHydrationJobs: Array<() => void> = [];
  let photosHydrated = false;
  photoHydrationJobs.push(() => {
    loadSeamlessPhotoIntoCanvas(
      texAsphaltUrl,
      aspCanvas,
      (ctx, size) => {
        const img = ctx.getImageData(0, 0, size, size);
        const data = img.data;
        const rData = new Uint8Array(size * size * 4);
        const oData = new Uint8Array(size * size * 4);
        const nData = new Uint8Array(size * size * 4);
        const heights = new Float32Array(size * size);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;
            const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
            heights[y * size + x] = lum;

            // Calibrate clean tileable motorsport tarmac (rubber grooves & edge dust are rendered non-tiling in shader)
            const neutralLum = lum * 255;
            const darkScale = 0.66;
            data[idx] = clampByte((data[idx] * 0.72 + neutralLum * 0.28) * darkScale);
            data[idx + 1] = clampByte((data[idx + 1] * 0.72 + neutralLum * 0.28) * darkScale);
            data[idx + 2] = clampByte((data[idx + 2] * 0.72 + neutralLum * 0.28) * darkScale + 3);

            const roughByte = clampByte((0.83 - (lum - 0.4) * 0.14) * 255);
            rData[idx] = roughByte;
            rData[idx + 1] = roughByte;
            rData[idx + 2] = roughByte;
            rData[idx + 3] = 255;

            oData[idx] = clampByte((0.72 + lum * 0.28) * 255);
            oData[idx + 1] = roughByte;
            oData[idx + 2] = clampByte(lum * 255);
            oData[idx + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
        writeNormalsFromHeights(heights, size, 2.2, nData);
        asphaltNormal.image = { data: nData, width: size, height: size };
        asphaltRoughness.image = { data: rData, width: size, height: size };
        asphaltORM.image = { data: oData, width: size, height: size };
        asphaltAlbedo.needsUpdate = true;
        asphaltNormal.needsUpdate = true;
        asphaltRoughness.needsUpdate = true;
        asphaltORM.needsUpdate = true;
        registerRescalableTexture(asphaltAlbedo, aspCanvas);
      },
      cancelState,
      aspTargetSize,
      enqueuePhotoJob,
    );
  });

  // 2. START / FINISH CHECKERED STRIP & EMPTY GRID DECAL
  const sfCanvas = document.createElement('canvas');
  sfCanvas.width = 512;
  sfCanvas.height = 512;
  const sfCtx = sfCanvas.getContext('2d')!;
  sfCtx.clearRect(0, 0, 512, 512);

  const cols = 16;
  const rows = 3;
  const cellW = (512 * 0.86) / cols;
  const cellH = 18;
  const startX = 512 * 0.07;
  const startY = 230;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      sfCtx.fillStyle = (r + c) % 2 === 0 ? 'rgba(246, 244, 238, 0.94)' : 'rgba(24, 26, 30, 0.92)';
      sfCtx.fillRect(startX + c * cellW, startY + r * cellH, cellW + 0.5, cellH + 0.5);
    }
  }
  sfCtx.strokeStyle = 'rgba(245, 243, 238, 0.88)';
  sfCtx.lineWidth = 5;
  sfCtx.beginPath();
  sfCtx.moveTo(startX, startY - 12);
  sfCtx.lineTo(512 - startX, startY - 12);
  sfCtx.stroke();

  const drawGridBracket = (cx: number, cy: number) => {
    sfCtx.strokeStyle = 'rgba(245, 243, 238, 0.85)';
    sfCtx.lineWidth = 4;
    sfCtx.beginPath();
    sfCtx.moveTo(cx - 26, cy + 28);
    sfCtx.lineTo(cx - 26, cy);
    sfCtx.lineTo(cx + 26, cy);
    sfCtx.lineTo(cx + 26, cy + 28);
    sfCtx.stroke();
  };
  drawGridBracket(150, 320);
  drawGridBracket(362, 370);
  drawGridBracket(150, 425);

  const startGridAlbedo = track(configureColorTexture(new THREE.CanvasTexture(sfCanvas), aniso, 1, 1));
  startGridAlbedo.wrapS = THREE.ClampToEdgeWrapping;
  startGridAlbedo.wrapT = THREE.ClampToEdgeWrapping;

  // 3. FIA RED & WHITE APEX RUMBLE CURBS (micro-pitted precast concrete + tire scuffing)
  const curbSize = initialQuality === 'performance' ? 96 : 192;
  const curbCanvas = document.createElement('canvas');
  curbCanvas.width = curbSize;
  curbCanvas.height = curbSize;
  const curbCtx = curbCanvas.getContext('2d')!;
  const curbImg = curbCtx.createImageData(curbSize, curbSize);
  const curbHeights = new Float32Array(curbSize * curbSize);

  const curbJointDiv = Math.max(16, curbSize >> 2);
  for (let y = 0; y < curbSize; y++) {
    const ny = y / curbSize;
    const isRed = Math.floor(ny * 4) % 2 === 0;
    const blockJoint = (y % curbJointDiv) < 2 ? -24 : 0;
    for (let x = 0; x < curbSize; x++) {
      const nx = x / curbSize;
      const n = (rand() - 0.5) * 18;
      const microPit = rand() < 0.035 ? -26 : 0;
      const scuff = Math.exp(-Math.pow(nx - 0.28, 2) / 0.045) * (10 + rand() * 32);
      const ridge = Math.sin(ny * Math.PI * 16) * 0.5 + 0.5;
      curbHeights[y * curbSize + x] =
        ridge * 0.74 + rand() * 0.14 + (microPit < 0 ? -0.18 : 0) + (blockJoint < 0 ? -0.25 : 0);

      const idx = (y * curbSize + x) * 4;
      if (isRed) {
        curbImg.data[idx] = clampByte(202 + n - scuff + blockJoint + microPit * 0.5);
        curbImg.data[idx + 1] = clampByte(38 + n * 0.45 - scuff * 0.35 + blockJoint * 0.4);
        curbImg.data[idx + 2] = clampByte(36 + n * 0.45 - scuff * 0.35 + blockJoint * 0.4);
      } else {
        curbImg.data[idx] = clampByte(238 + n - scuff + blockJoint + microPit * 0.6);
        curbImg.data[idx + 1] = clampByte(234 + n - scuff + blockJoint + microPit * 0.6);
        curbImg.data[idx + 2] = clampByte(226 + n - scuff + blockJoint + microPit * 0.6);
      }
      curbImg.data[idx + 3] = 255;
    }
  }
  curbCtx.putImageData(curbImg, 0, 0);
  const curbAlbedo = track(configureColorTexture(new THREE.CanvasTexture(curbCanvas), aniso, 1, 1));
  const curbNormal = track(heightfieldToNormalTexture(curbHeights, curbSize, 3.6, 1, 1));

  // 4. PHOTOGRAPHIC ARCHITECTURAL CONCRETE (panel formwork seams & tie-rod cone holes)
  const concSize = concTargetSize;
  const concCanvas = document.createElement('canvas');
  concCanvas.width = concSize;
  concCanvas.height = concSize;
  const concCtx = concCanvas.getContext('2d')!;
  const concImg = concCtx.createImageData(concSize, concSize);
  const concHeights = new Float32Array(concSize * concSize);

  for (let y = 0; y < concSize; y++) {
    const seamY = y % 128 < 3 ? -30 : 0;
    const ty = y % 128;
    for (let x = 0; x < concSize; x++) {
      const seamX = x % 256 < 2 ? -22 : 0;
      const tx = x % 256;
      // Tie-rod cones near panel corners
      const dConeA = Math.hypot(tx - 44, ty - 40);
      const dConeB = Math.hypot(tx - 212, ty - 40);
      const coneDimple = dConeA < 5.5 || dConeB < 5.5 ? -28 : 0;
      const speck = (rand() - 0.5) * 22;
      const drip = fbm2D(x * 0.04, y * 0.008, 3, 2.0, 0.5, 31) * 14;
      const lum = clampByte(174 + speck + drip + seamY + seamX + coneDimple);
      const idx = (y * concSize + x) * 4;
      concImg.data[idx] = lum;
      concImg.data[idx + 1] = clampByte(lum - 3);
      concImg.data[idx + 2] = clampByte(lum - 7);
      concImg.data[idx + 3] = 255;
      concHeights[y * concSize + x] =
        (lum / 255) * 0.72 + rand() * 0.16 + (coneDimple < 0 ? -0.22 : 0);
    }
  }
  concCtx.putImageData(concImg, 0, 0);
  const concreteAlbedo = track(configureColorTexture(new THREE.CanvasTexture(concCanvas), aniso, 1, 1));
  const concreteNormal = track(heightfieldToNormalTexture(concHeights, concSize, 2.6, 1, 1));

  photoHydrationJobs.push(() => {
    loadSeamlessPhotoIntoCanvas(
      texConcreteUrl,
      concCanvas,
      (ctx, size) => {
        const data = ctx.getImageData(0, 0, size, size).data;
        const heights = new Float32Array(size * size);
        for (let i = 0; i < size * size; i++) {
          const idx = i * 4;
          heights[i] = (data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11) / 255;
        }
        writeNormalsFromHeights(heights, size, 3.0, concreteNormal.image.data as Uint8Array);
        concreteAlbedo.needsUpdate = true;
        concreteNormal.needsUpdate = true;
      },
      cancelState,
      concSize,
      enqueuePhotoJob,
    );
  });

  // 5. 4K PHOTO-HYBRID TERRAIN MEADOW & LIMESTONE STRATA PBR SETS (fast 128/256 boot fallback, async photo upgrade)
  const terSize = initialQuality === 'performance' ? 96 : 192;
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = terSize;
  grassCanvas.height = terSize;
  const grassCtx = grassCanvas.getContext('2d')!;
  const grassImg = grassCtx.createImageData(terSize, terSize);

  const grassNormCanvas = document.createElement('canvas');
  grassNormCanvas.width = terSize;
  grassNormCanvas.height = terSize;
  const grassNormCtx = grassNormCanvas.getContext('2d')!;
  const grassNormImg = grassNormCtx.createImageData(terSize, terSize);

  const grassRoughCanvas = document.createElement('canvas');
  grassRoughCanvas.width = terSize;
  grassRoughCanvas.height = terSize;
  const grassRoughCtx = grassRoughCanvas.getContext('2d')!;
  const grassRoughImg = grassRoughCtx.createImageData(terSize, terSize);

  const rockCanvas = document.createElement('canvas');
  rockCanvas.width = terSize;
  rockCanvas.height = terSize;
  const rockCtx = rockCanvas.getContext('2d')!;
  const rockImg = rockCtx.createImageData(terSize, terSize);

  const rockNormCanvas = document.createElement('canvas');
  rockNormCanvas.width = terSize;
  rockNormCanvas.height = terSize;
  const rockNormCtx = rockNormCanvas.getContext('2d')!;
  const rockNormImg = rockNormCtx.createImageData(terSize, terSize);

  const rockRoughCanvas = document.createElement('canvas');
  rockRoughCanvas.width = terSize;
  rockRoughCanvas.height = terSize;
  const rockRoughCtx = rockRoughCanvas.getContext('2d')!;
  const rockRoughImg = rockRoughCtx.createImageData(terSize, terSize);

  const terHeights = new Float32Array(terSize * terSize);

  for (let y = 0; y < terSize; y++) {
    const ny = y / terSize;
    for (let x = 0; x < terSize; x++) {
      const nx = x / terSize;
      const h1 =
        Math.sin(nx * Math.PI * 10 + Math.cos(ny * Math.PI * 8)) *
        Math.cos(ny * Math.PI * 10 + Math.sin(nx * Math.PI * 6));
      const h2 = Math.sin(nx * Math.PI * 28) * Math.sin(ny * Math.PI * 28);
      const blade = rand();
      const idx = (y * terSize + x) * 4;

      grassImg.data[idx] = clampByte(104 + h1 * 14 + h2 * 7 + (blade - 0.5) * 28);
      grassImg.data[idx + 1] = clampByte(126 + h1 * 16 + h2 * 8 + (blade - 0.5) * 30);
      grassImg.data[idx + 2] = clampByte(68 + h1 * 10 + (blade - 0.5) * 18);
      grassImg.data[idx + 3] = 255;

      const gRough = clampByte(226 + (blade - 0.5) * 28 - h1 * 10);
      grassRoughImg.data[idx] = gRough;
      grassRoughImg.data[idx + 1] = gRough;
      grassRoughImg.data[idx + 2] = gRough;
      grassRoughImg.data[idx + 3] = 255;

      const strata = Math.sin(ny * Math.PI * 22 + Math.sin(nx * Math.PI * 6) * 1.5);
      const crack = Math.abs(Math.sin(nx * Math.PI * 14 + ny * Math.PI * 10)) < 0.06 ? -24 : 0;
      const rockLum = 138 + strata * 22 + h2 * 10 + (blade - 0.5) * 26 + crack;
      rockImg.data[idx] = clampByte(rockLum + 14);
      rockImg.data[idx + 1] = clampByte(rockLum + 3);
      rockImg.data[idx + 2] = clampByte(rockLum - 16);
      rockImg.data[idx + 3] = 255;

      const rRough = clampByte(218 - strata * 18 + (blade - 0.5) * 26 - crack * 0.8);
      rockRoughImg.data[idx] = rRough;
      rockRoughImg.data[idx + 1] = rRough;
      rockRoughImg.data[idx + 2] = rRough;
      rockRoughImg.data[idx + 3] = 255;

      terHeights[y * terSize + x] =
        0.5 + strata * 0.24 + h2 * 0.1 + (blade - 0.5) * 0.24 + crack * 0.008;
    }
  }
  grassCtx.putImageData(grassImg, 0, 0);
  grassRoughCtx.putImageData(grassRoughImg, 0, 0);
  writeLinearNormalsFromLuminance(grassImg.data, terSize, 2.8, 0.06, grassNormImg.data);
  grassNormCtx.putImageData(grassNormImg, 0, 0);

  rockCtx.putImageData(rockImg, 0, 0);
  rockRoughCtx.putImageData(rockRoughImg, 0, 0);
  writeLinearNormalsFromLuminance(rockImg.data, terSize, 4.2, 0.08, rockNormImg.data);
  rockNormCtx.putImageData(rockNormImg, 0, 0);

  const terrainGrassAlbedo = track(configureColorTexture(new THREE.CanvasTexture(grassCanvas), aniso, 56, 56));
  const terrainGrassNormal = track(configureLinearCanvasTexture(new THREE.CanvasTexture(grassNormCanvas), aniso, 56, 56));
  const terrainGrassRoughness = track(configureLinearCanvasTexture(new THREE.CanvasTexture(grassRoughCanvas), aniso, 56, 56));

  const terrainRockAlbedo = track(configureColorTexture(new THREE.CanvasTexture(rockCanvas), aniso, 42, 42));
  const terrainRockNormal = track(configureLinearCanvasTexture(new THREE.CanvasTexture(rockNormCanvas), aniso, 42, 42));
  const terrainRockRoughness = track(configureLinearCanvasTexture(new THREE.CanvasTexture(rockRoughCanvas), aniso, 42, 42));
  const terrainNormal = track(heightfieldToNormalTexture(terHeights, terSize, 2.9, 48, 48));

  const rockOrmData = new Uint8Array(terSize * terSize * 4);
  for (let i = 0; i < terSize * terSize; i++) {
    const p = i * 4;
    rockOrmData[p] = clampByte(terHeights[i] * 255);
    rockOrmData[p + 1] = rockRoughImg.data[p];
    rockOrmData[p + 2] = rockImg.data[p];
    rockOrmData[p + 3] = 255;
  }
  const terrainRockORM = track(new THREE.DataTexture(rockOrmData, terSize, terSize, THREE.RGBAFormat));
  terrainRockORM.colorSpace = THREE.NoColorSpace;
  terrainRockORM.wrapS = THREE.RepeatWrapping;
  terrainRockORM.wrapT = THREE.RepeatWrapping;
  terrainRockORM.repeat.set(42, 42);
  terrainRockORM.generateMipmaps = true;
  terrainRockORM.minFilter = THREE.LinearMipmapLinearFilter;
  terrainRockORM.magFilter = THREE.LinearFilter;
  terrainRockORM.anisotropy = aniso;
  terrainRockORM.needsUpdate = true;

  photoHydrationJobs.push(() => {
    loadSeamlessPhotoIntoCanvas(
      texMeadowUrl,
      grassCanvas,
      (ctx, size) => {
        const data = ctx.getImageData(0, 0, size, size).data;
        grassNormCanvas.width = size;
        grassNormCanvas.height = size;
        grassRoughCanvas.width = size;
        grassRoughCanvas.height = size;
        const gNormOut = grassNormCtx.createImageData(size, size);
        const gRoughOut = grassRoughCtx.createImageData(size, size);
        writeLinearNormalsFromLuminance(data, size, 3.8, 0.065, gNormOut.data);
        for (let i = 0; i < size * size; i++) {
          const p = i * 4;
          const l = (data[p] * 0.3 + data[p + 1] * 0.59 + data[p + 2] * 0.11) / 255;
          const rv = clampByte((0.94 - l * 0.22) * 255);
          gRoughOut.data[p] = rv;
          gRoughOut.data[p + 1] = rv;
          gRoughOut.data[p + 2] = rv;
          gRoughOut.data[p + 3] = 255;
        }
        grassNormCtx.putImageData(gNormOut, 0, 0);
        grassRoughCtx.putImageData(gRoughOut, 0, 0);
        terrainGrassAlbedo.needsUpdate = true;
        terrainGrassNormal.needsUpdate = true;
        terrainGrassRoughness.needsUpdate = true;
        registerRescalableTexture(terrainGrassAlbedo, grassCanvas);
        registerRescalableTexture(terrainGrassNormal, grassNormCanvas);
        registerRescalableTexture(terrainGrassRoughness, grassRoughCanvas);
      },
      cancelState,
      terrain4KSize,
      enqueuePhotoJob,
    );
    loadSeamlessPhotoIntoCanvas(
      texLimestoneUrl,
      rockCanvas,
      (ctx, size) => {
        const data = ctx.getImageData(0, 0, size, size).data;
        rockNormCanvas.width = size;
        rockNormCanvas.height = size;
        rockRoughCanvas.width = size;
        rockRoughCanvas.height = size;
        const rNormOut = rockNormCtx.createImageData(size, size);
        const rRoughOut = rockRoughCtx.createImageData(size, size);
        writeLinearNormalsFromLuminance(data, size, 5.4, 0.085, rNormOut.data);

        const heights512 = new Float32Array(terSize * terSize);
        for (let y = 0; y < terSize; y++) {
          const sy = Math.min(size - 1, Math.floor((y * size) / terSize));
          for (let x = 0; x < terSize; x++) {
            const sx = Math.min(size - 1, Math.floor((x * size) / terSize));
            const p = (sy * size + sx) * 4;
            heights512[y * terSize + x] = (data[p] * 0.3 + data[p + 1] * 0.59 + data[p + 2] * 0.11) / 255;
          }
        }
        writeNormalsFromHeights(heights512, terSize, 3.6, terrainNormal.image.data as Uint8Array);

        for (let i = 0; i < size * size; i++) {
          const p = i * 4;
          const l = (data[p] * 0.3 + data[p + 1] * 0.59 + data[p + 2] * 0.11) / 255;
          const rv = clampByte((0.92 - l * 0.28) * 255);
          rRoughOut.data[p] = rv;
          rRoughOut.data[p + 1] = rv;
          rRoughOut.data[p + 2] = rv;
          rRoughOut.data[p + 3] = 255;
        }
        rockNormCtx.putImageData(rNormOut, 0, 0);
        rockRoughCtx.putImageData(rRoughOut, 0, 0);
        terrainRockAlbedo.needsUpdate = true;
        terrainRockNormal.needsUpdate = true;
        terrainRockRoughness.needsUpdate = true;
        terrainNormal.needsUpdate = true;
        registerRescalableTexture(terrainRockAlbedo, rockCanvas);
        registerRescalableTexture(terrainRockNormal, rockNormCanvas);
        registerRescalableTexture(terrainRockRoughness, rockRoughCanvas);
      },
      cancelState,
      terrain4KSize,
      enqueuePhotoJob,
    );
  });

  // 6. PHOTOGRAPHIC PINE TREE BARK + BARK NORMAL MAP
  const barkSize = initialQuality === 'performance' ? 96 : 192;
  const barkCanvas = document.createElement('canvas');
  barkCanvas.width = barkSize;
  barkCanvas.height = barkSize;
  const barkCtx = barkCanvas.getContext('2d')!;
  const barkImg = barkCtx.createImageData(barkSize, barkSize);
  const barkHeights = new Float32Array(barkSize * barkSize);
  for (let y = 0; y < barkSize; y++) {
    for (let x = 0; x < barkSize; x++) {
      const furrow = Math.sin((x / barkSize) * Math.PI * 28 + Math.sin((y / barkSize) * Math.PI * 6) * 1.6);
      const ridgeNoise = fbm2D((x / barkSize) * 14, (y / barkSize) * 6, 3, 2.0, 0.5, 551);
      const v = 76 + furrow * 22 + ridgeNoise * 14 + (rand() - 0.5) * 16;
      const idx = (y * barkSize + x) * 4;
      barkImg.data[idx] = clampByte(v + 16);
      barkImg.data[idx + 1] = clampByte(v - 4);
      barkImg.data[idx + 2] = clampByte(v - 20);
      barkImg.data[idx + 3] = 255;
      barkHeights[y * barkSize + x] = clampByte(v) / 255;
    }
  }
  barkCtx.putImageData(barkImg, 0, 0);
  const barkAlbedo = track(configureColorTexture(new THREE.CanvasTexture(barkCanvas), aniso, 2, 3));
  const barkNormal = track(heightfieldToNormalTexture(barkHeights, barkSize, 3.4, 2, 3));
  barkNormal.anisotropy = aniso;

  photoHydrationJobs.push(() => {
    loadSeamlessPhotoIntoCanvas(
      texBarkUrl,
      barkCanvas,
      (ctx, size) => {
        const data = ctx.getImageData(0, 0, size, size).data;
        const bHeights = new Float32Array(barkSize * barkSize);
        const step = Math.max(1, Math.floor(size / barkSize));
        for (let y = 0; y < barkSize; y++) {
          for (let x = 0; x < barkSize; x++) {
            const p = (y * step * size + x * step) * 4;
            bHeights[y * barkSize + x] = (data[p] * 0.3 + data[p + 1] * 0.59 + data[p + 2] * 0.11) / 255;
          }
        }
        writeNormalsFromHeights(bHeights, barkSize, 3.8, barkNormal.image.data as Uint8Array);
        barkAlbedo.needsUpdate = true;
        barkNormal.needsUpdate = true;
      },
      cancelState,
      barkTargetSize,
      enqueuePhotoJob,
    );
  });

  // 6B. TILEABLE PBR CONIFER NEEDLE ALBEDO, NORMAL & ROUGHNESS (256/512)
  const ndlSize = initialQuality === 'performance' ? 128 : 384;
  const ndlScale = ndlSize / 512;
  const ndlCanvas = document.createElement('canvas');
  ndlCanvas.width = ndlSize;
  ndlCanvas.height = ndlSize;
  const ndlCtx = ndlCanvas.getContext('2d')!;
  ndlCtx.fillStyle = '#2c4427';
  ndlCtx.fillRect(0, 0, ndlSize, ndlSize);

  const ndlRand = createSeededRandom(314159);
  // Draw overlapping botanical conifer twig sprays wrapped toroidally for seamless bough tiling
  const sprayCount = initialQuality === 'performance' ? 64 : 150;
  for (let s = 0; s < sprayCount; s++) {
    const cx = ndlRand() * ndlSize;
    const cy = ndlRand() * ndlSize;
    const ang = ndlRand() * Math.PI * 2;
    const len = (34 + ndlRand() * 44) * ndlScale;
    const depthShade = 0.72 + (s / sprayCount) * 0.48;
    const needlePairs = 14 + Math.floor(ndlRand() * 10);

    for (const ox of [-ndlSize, 0, ndlSize]) {
      for (const oy of [-ndlSize, 0, ndlSize]) {
        const sx = cx + ox;
        const sy = cy + oy;
        if (sx < -90 || sx > ndlSize + 90 || sy < -90 || sy > ndlSize + 90) continue;

        ndlCtx.save();
        ndlCtx.translate(sx, sy);
        ndlCtx.rotate(ang);

        // Woody central shoot twig
        ndlCtx.strokeStyle = `rgba(${clampByte(78 * depthShade)}, ${clampByte(56 * depthShade)}, ${clampByte(38 * depthShade)}, 0.85)`;
        ndlCtx.lineWidth = 2.0;
        ndlCtx.beginPath();
        ndlCtx.moveTo(-len * 0.5, 0);
        ndlCtx.lineTo(len * 0.5, 0);
        ndlCtx.stroke();

        // Bilateral feathered conifer needles with sunlit tips
        for (let n = 0; n < needlePairs; n++) {
          const u = n / Math.max(1, needlePairs - 1) - 0.5;
          const bx = u * len;
          const nLen = (10 + ndlRand() * 9) * (1.0 - Math.abs(u) * 0.45);
          for (const side of [-1, 1]) {
            const splay = side * (0.48 + ndlRand() * 0.36);
            const ex = bx + Math.cos(splay) * nLen;
            const ey = Math.sin(splay) * nLen;
            const gBase = clampByte((118 + ndlRand() * 48) * depthShade);
            const rBase = clampByte((66 + ndlRand() * 28) * depthShade);
            const bBase = clampByte((52 + ndlRand() * 22) * depthShade);
            ndlCtx.strokeStyle = `rgb(${rBase}, ${gBase}, ${bBase})`;
            ndlCtx.lineWidth = 1.65;
            ndlCtx.beginPath();
            ndlCtx.moveTo(bx, 0);
            ndlCtx.lineTo(ex, ey);
            ndlCtx.stroke();
          }
        }
        ndlCtx.restore();
      }
    }
  }

  const ndlData = ndlCtx.getImageData(0, 0, ndlSize, ndlSize).data;
  const ndlNormCanvas = document.createElement('canvas');
  ndlNormCanvas.width = ndlSize;
  ndlNormCanvas.height = ndlSize;
  const ndlNormCtx = ndlNormCanvas.getContext('2d')!;
  const ndlNormImg = ndlNormCtx.createImageData(ndlSize, ndlSize);
  writeLinearNormalsFromLuminance(ndlData, ndlSize, 4.4, 0.075, ndlNormImg.data);
  ndlNormCtx.putImageData(ndlNormImg, 0, 0);

  const ndlRoughCanvas = document.createElement('canvas');
  ndlRoughCanvas.width = ndlSize;
  ndlRoughCanvas.height = ndlSize;
  const ndlRoughCtx = ndlRoughCanvas.getContext('2d')!;
  const ndlRoughImg = ndlRoughCtx.createImageData(ndlSize, ndlSize);
  for (let i = 0; i < ndlSize * ndlSize; i++) {
    const p = i * 4;
    const lum = (ndlData[p] * 0.299 + ndlData[p + 1] * 0.587 + ndlData[p + 2] * 0.114) / 255;
    // Waxy sunlit outer needles have lower roughness (~0.48), inner shadows rougher (~0.84)
    const rv = clampByte((0.88 - lum * 0.42) * 255);
    ndlRoughImg.data[p] = rv;
    ndlRoughImg.data[p + 1] = rv;
    ndlRoughImg.data[p + 2] = rv;
    ndlRoughImg.data[p + 3] = 255;
  }
  ndlRoughCtx.putImageData(ndlRoughImg, 0, 0);

  const coniferNeedleAlbedo = track(configureColorTexture(new THREE.CanvasTexture(ndlCanvas), aniso, 2, 2));
  const coniferNeedleNormal = track(configureLinearCanvasTexture(new THREE.CanvasTexture(ndlNormCanvas), aniso, 2, 2));
  const coniferNeedleRoughness = track(configureLinearCanvasTexture(new THREE.CanvasTexture(ndlRoughCanvas), aniso, 2, 2));

  // 6C. TILEABLE LACY WHITEWATER FOAM & FROTH TEXTURE
  const foamSize = initialQuality === 'performance' ? 96 : 160;
  const foamCanvas = document.createElement('canvas');
  foamCanvas.width = foamSize;
  foamCanvas.height = foamSize;
  const foamCtx = foamCanvas.getContext('2d')!;
  const foamImg = foamCtx.createImageData(foamSize, foamSize);
  const foamRand = createSeededRandom(82461);

  // Build cellular bubble centres wrapped toroidally for organic frothy webbing
  const bubbleCount = 64;
  const bubbles: Array<{ x: number; y: number; r: number }> = [];
  for (let b = 0; b < bubbleCount; b++) {
    bubbles.push({
      x: foamRand(),
      y: foamRand(),
      r: 0.028 + Math.pow(foamRand(), 1.8) * 0.065,
    });
  }

  for (let y = 0; y < foamSize; y++) {
    const v = y / foamSize;
    for (let x = 0; x < foamSize; x++) {
      const u = x / foamSize;
      // Seamless toroidal domain-warped periodic turbulence
      const warpX = Math.sin(u * Math.PI * 2) * 0.35 + Math.cos(v * Math.PI * 2) * 0.25;
      const warpY = Math.cos(u * Math.PI * 2) * 0.25 + Math.sin(v * Math.PI * 2) * 0.35;
      const turb =
        0.5 +
        0.28 * Math.sin((u + warpX * 0.12) * Math.PI * 10) * Math.cos((v + warpY * 0.12) * Math.PI * 10) +
        0.22 * Math.sin((u * 18 - v * 14 + warpX) * Math.PI * 2);

      // Find nearest wrapped bubble void to carve frothy lace filaments
      let minEdge = 1.0;
      for (let b = 0; b < bubbleCount; b++) {
        const bb = bubbles[b];
        let dx = Math.abs(u - bb.x);
        let dy = Math.abs(v - bb.y);
        if (dx > 0.5) dx = 1.0 - dx;
        if (dy > 0.5) dy = 1.0 - dy;
        const dist = Math.hypot(dx, dy);
        if (dist < bb.r * 1.35) {
          const ring = Math.abs(dist - bb.r * 0.78) / (bb.r * 0.55);
          if (ring < minEdge) minEdge = ring;
        }
      }
      const lace = Math.max(0, 1.0 - minEdge);
      const val = Math.min(1, Math.max(0, turb * 0.55 + lace * 0.72 - 0.18));
      const idx = (y * foamSize + x) * 4;
      foamImg.data[idx] = clampByte(val * 245);
      foamImg.data[idx + 1] = clampByte(Math.min(1, val * 1.04) * 252);
      foamImg.data[idx + 2] = clampByte(Math.min(1, val * 1.08) * 255);
      foamImg.data[idx + 3] = 255;
    }
  }
  foamCtx.putImageData(foamImg, 0, 0);
  const waterFoamAlbedo = track(configureColorTexture(new THREE.CanvasTexture(foamCanvas), aniso, 1, 1));

  // 7. ORGANIC ROUNDED-PEBBLE VORONOI GRAVEL RUNOFF
  const gravSize = initialQuality === 'performance' ? 96 : 192;
  const gravCanvas = document.createElement('canvas');
  gravCanvas.width = gravSize;
  gravCanvas.height = gravSize;
  const gravCtx = gravCanvas.getContext('2d')!;
  const gravImg = gravCtx.createImageData(gravSize, gravSize);
  const gravCells = 42;
  const cellCenterX = new Float32Array(gravCells * gravCells);
  const cellCenterY = new Float32Array(gravCells * gravCells);
  const cellShade = new Float32Array(gravCells * gravCells);
  const cellWarm = new Float32Array(gravCells * gravCells);
  for (let cy = 0; cy < gravCells; cy++) {
    for (let cx = 0; cx < gravCells; cx++) {
      const ci = cy * gravCells + cx;
      cellCenterX[ci] = cx + 0.18 + rand() * 0.64;
      cellCenterY[ci] = cy + 0.18 + rand() * 0.64;
      cellShade[ci] = 144 + (rand() - 0.5) * 24;
      cellWarm[ci] = (rand() - 0.5) * 12;
    }
  }
  for (let y = 0; y < gravSize; y++) {
    const gy = (y / gravSize) * gravCells;
    const baseCy = Math.floor(gy);
    for (let x = 0; x < gravSize; x++) {
      const gx = (x / gravSize) * gravCells;
      const baseCx = Math.floor(gx);
      let d1 = 99;
      let d2 = 99;
      let bestCi = 0;
      for (let oy = -1; oy <= 1; oy++) {
        const cy = (baseCy + oy + gravCells) % gravCells;
        const wrapY = baseCy + oy < 0 ? -gravCells : baseCy + oy >= gravCells ? gravCells : 0;
        for (let ox = -1; ox <= 1; ox++) {
          const cx = (baseCx + ox + gravCells) % gravCells;
          const wrapX = baseCx + ox < 0 ? -gravCells : baseCx + ox >= gravCells ? gravCells : 0;
          const ci = cy * gravCells + cx;
          const dx = cellCenterX[ci] + wrapX - gx;
          const dy = cellCenterY[ci] + wrapY - gy;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            bestCi = ci;
          } else if (d < d2) {
            d2 = d;
          }
        }
      }
      const dist1 = Math.sqrt(d1);
      const edgeDist = Math.sqrt(d2) - dist1;
      const dome = Math.max(0.76, 1.0 - dist1 * 0.40);
      const creviceAO = Math.min(1.0, edgeDist * 3.4);
      const grit = (rand() - 0.5) * 10;
      const tone = cellShade[bestCi] * (0.80 + 0.20 * creviceAO) * dome + grit;
      const warm = cellWarm[bestCi];
      const idx = (y * gravSize + x) * 4;
      gravImg.data[idx] = clampByte(tone + 9 + warm);
      gravImg.data[idx + 1] = clampByte(tone + 2 + warm * 0.4);
      gravImg.data[idx + 2] = clampByte(tone - 10 - warm * 0.6);
      gravImg.data[idx + 3] = 255;
    }
  }
  gravCtx.putImageData(gravImg, 0, 0);
  const gravelAlbedo = track(configureColorTexture(new THREE.CanvasTexture(gravCanvas), aniso, 9, 13));

  // 7B. SOFT RADIAL VOLUMETRIC MIST / SPRAY SPRITE
  const mistSize = 128;
  const mistSpriteCanvas = document.createElement('canvas');
  mistSpriteCanvas.width = mistSize;
  mistSpriteCanvas.height = mistSize;
  const msCtx = mistSpriteCanvas.getContext('2d')!;
  const msImg = msCtx.createImageData(mistSize, mistSize);
  const mistHalf = mistSize * 0.5;
  for (let y = 0; y < mistSize; y++) {
    const dy = (y - mistHalf) / mistHalf;
    for (let x = 0; x < mistSize; x++) {
      const dx = (x - mistHalf) / mistHalf;
      const r = Math.hypot(dx, dy);
      const puffNoise = 0.78 + 0.22 * fbm2D(x * 0.09, y * 0.09, 2, 2.1, 0.5, 412);
      const falloff = r >= 1.0 ? 0.0 : Math.pow(1.0 - r, 2.15) * puffNoise;
      const idx = (y * mistSize + x) * 4;
      msImg.data[idx] = 244;
      msImg.data[idx + 1] = 250;
      msImg.data[idx + 2] = 255;
      msImg.data[idx + 3] = clampByte(falloff * 255);
    }
  }
  msCtx.putImageData(msImg, 0, 0);
  const mistSpriteAlbedo = track(configureColorTexture(new THREE.CanvasTexture(mistSpriteCanvas), aniso, 1, 1));
  mistSpriteAlbedo.wrapS = THREE.ClampToEdgeWrapping;
  mistSpriteAlbedo.wrapT = THREE.ClampToEdgeWrapping;

  // 7C. SEAMLESS PERIODIC GEOLOGICAL FRACTURE DETAIL MAP & TRIPLANAR NORMAL MAP
  const tdSize = initialQuality === 'performance' ? 96 : 192;
  const tdCanvas = document.createElement('canvas');
  tdCanvas.width = tdSize;
  tdCanvas.height = tdSize;
  const tdCtx = tdCanvas.getContext('2d')!;
  const tdNCanvas = document.createElement('canvas');
  tdNCanvas.width = tdSize;
  tdNCanvas.height = tdSize;
  const tdNCtx = tdNCanvas.getContext('2d')!;
  const tdImg = tdCtx.createImageData(tdSize, tdSize);
  const tdNImg = tdNCtx.createImageData(tdSize, tdSize);
  const tdH = new Float32Array(tdSize * tdSize);
  const tdRand = createSeededRandom(82941);
  const gCell = 16;
  const coarseGrid = new Float32Array(gCell * gCell);
  for (let i = 0; i < coarseGrid.length; i++) coarseGrid[i] = tdRand();
  const sampleTdGrid = (gx: number, gy: number) => {
    const x0 = ((Math.floor(gx) % gCell) + gCell) % gCell;
    const y0 = ((Math.floor(gy) % gCell) + gCell) % gCell;
    const x1 = (x0 + 1) % gCell;
    const y1 = (y0 + 1) % gCell;
    const tx = gx - Math.floor(gx);
    const ty = gy - Math.floor(gy);
    const ux = tx * tx * (3 - 2 * tx);
    const uy = ty * ty * (3 - 2 * ty);
    const a = coarseGrid[y0 * gCell + x0];
    const b = coarseGrid[y0 * gCell + x1];
    const c = coarseGrid[y1 * gCell + x0];
    const d = coarseGrid[y1 * gCell + x1];
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  for (let y = 0; y < tdSize; y++) {
    const v = y / tdSize;
    const ny = v * Math.PI * 2;
    for (let x = 0; x < tdSize; x++) {
      const u = x / tdSize;
      const nx = u * Math.PI * 2;
      const n1 = sampleTdGrid(u * gCell, v * gCell);
      const n2 = sampleTdGrid(u * gCell * 2 + 3.1, v * gCell * 2 + 1.7);
      const n3 = sampleTdGrid(u * gCell * 4 + 7.4, v * gCell * 4 + 5.2);
      const ridge1 = 1 - Math.abs(n1 * 2 - 1);
      const ridge2 = 1 - Math.abs(n2 * 2 - 1);
      const crack = Math.min(ridge1, ridge2 * 0.85 + 0.15);
      const strata = Math.sin(ny * 4 + n1 * 5.0 + Math.cos(nx * 2) * 1.4) * 0.16;
      const grit = (tdRand() - 0.5) * 0.24;
      const h = Math.max(0, Math.min(1, 0.28 + crack * 0.42 + n3 * 0.24 + strata + grit));
      tdH[y * tdSize + x] = h;
      const shade = Math.round(96 + h * 150);
      const p4 = (y * tdSize + x) * 4;
      tdImg.data[p4] = shade;
      tdImg.data[p4 + 1] = shade;
      tdImg.data[p4 + 2] = shade;
      tdImg.data[p4 + 3] = 255;
    }
  }
  tdCtx.putImageData(tdImg, 0, 0);
  for (let y = 0; y < tdSize; y++) {
    const ym = (y - 1 + tdSize) % tdSize;
    const yp = (y + 1) % tdSize;
    for (let x = 0; x < tdSize; x++) {
      const xm = (x - 1 + tdSize) % tdSize;
      const xp = (x + 1) % tdSize;
      const dx = (tdH[y * tdSize + xp] - tdH[y * tdSize + xm]) * 3.6;
      const dy = (tdH[yp * tdSize + x] - tdH[ym * tdSize + x]) * 3.6;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const p4 = (y * tdSize + x) * 4;
      tdNImg.data[p4] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      tdNImg.data[p4 + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      tdNImg.data[p4 + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      tdNImg.data[p4 + 3] = 255;
    }
  }
  tdNCtx.putImageData(tdNImg, 0, 0);

  const terrainDetailMap = track(new THREE.CanvasTexture(tdCanvas));
  terrainDetailMap.colorSpace = THREE.NoColorSpace;
  terrainDetailMap.wrapS = terrainDetailMap.wrapT = THREE.RepeatWrapping;
  terrainDetailMap.minFilter = THREE.LinearMipmapLinearFilter;
  terrainDetailMap.anisotropy = aniso;
  terrainDetailMap.needsUpdate = true;

  const terrainDetailNormal = track(new THREE.CanvasTexture(tdNCanvas));
  terrainDetailNormal.colorSpace = THREE.NoColorSpace;
  terrainDetailNormal.wrapS = terrainDetailNormal.wrapT = THREE.RepeatWrapping;
  terrainDetailNormal.minFilter = THREE.LinearMipmapLinearFilter;
  terrainDetailNormal.anisotropy = aniso;
  terrainDetailNormal.needsUpdate = true;

  // 8. GALVANIZED FIA DEBRIS CATCH-FENCE WIRE MESH
  const fenceCanvas = document.createElement('canvas');
  fenceCanvas.width = 256;
  fenceCanvas.height = 256;
  const fenceCtx = fenceCanvas.getContext('2d')!;
  fenceCtx.clearRect(0, 0, 256, 256);

  fenceCtx.strokeStyle = '#cbd5e1';
  fenceCtx.lineWidth = 8.5;
  const step = 42.666;
  for (let x = -256; x <= 512; x += step) {
    fenceCtx.beginPath();
    fenceCtx.moveTo(x, 0);
    fenceCtx.lineTo(x + 256, 256);
    fenceCtx.stroke();

    fenceCtx.beginPath();
    fenceCtx.moveTo(x, 256);
    fenceCtx.lineTo(x + 256, 0);
    fenceCtx.stroke();
  }
  fenceCtx.fillStyle = '#94a3b8';
  fenceCtx.fillRect(0, 16, 256, 10);
  fenceCtx.fillRect(0, 122, 256, 10);
  fenceCtx.fillRect(0, 228, 256, 10);

  const catchFenceAlbedo = track(configureColorTexture(new THREE.CanvasTexture(fenceCanvas), aniso, 1, 1));
  catchFenceAlbedo.generateMipmaps = false;
  catchFenceAlbedo.minFilter = THREE.LinearFilter;

  // 9. ROAD SIGNS & GANTRY BANNER
  const gantryCanvas = document.createElement('canvas');
  gantryCanvas.width = 1024;
  gantryCanvas.height = 192;
  drawGantryBannerCanvas(
    gantryCanvas,
    'AURELIA RIDGE CIRCUIT',
    'SECTOR 01  ·  2.67 KM  ·  START / FINISH',
    '#f59e0b',
  );
  const gantryBannerTex = new THREE.CanvasTexture(gantryCanvas);
  gantryBannerTex.colorSpace = THREE.SRGBColorSpace;
  gantryBannerTex.anisotropy = aniso;
  gantryBannerTex.needsUpdate = true;
  const gantryBannerAlbedo = track(gantryBannerTex);

  const chevronSignAlbedo = track(createChevronSignTexture(aniso));
  const distanceSign150Albedo = track(createDistanceBoardTexture('150', aniso));
  const distanceSign100Albedo = track(createDistanceBoardTexture('100', aniso));
  const distanceSign50Albedo = track(createDistanceBoardTexture('50', aniso));

  return {
    asphaltAlbedo,
    asphaltNormal,
    asphaltRoughness,
    asphaltORM,
    startGridAlbedo,
    curbAlbedo,
    curbNormal,
    concreteAlbedo,
    concreteNormal,
    terrainGrassAlbedo,
    terrainGrassNormal,
    terrainGrassRoughness,
    terrainRockAlbedo,
    terrainRockNormal,
    terrainRockRoughness,
    terrainRockORM,
    terrainDetailMap,
    terrainDetailNormal,
    terrainNormal,
    barkAlbedo,
    barkNormal,
    coniferNeedleAlbedo,
    coniferNeedleNormal,
    coniferNeedleRoughness,
    waterFoamAlbedo,
    gravelAlbedo,
    mistSpriteAlbedo,
    catchFenceAlbedo,
    gantryBannerAlbedo,
    chevronSignAlbedo,
    distanceSign150Albedo,
    distanceSign100Albedo,
    distanceSign50Albedo,
    hydrateWorldPhotoTextures: () => {
      if (photosHydrated || cancelState.cancelled) return;
      photosHydrated = true;
      for (let i = 0; i < photoHydrationJobs.length; i++) {
        photoHydrationJobs[i]();
      }
    },
    setCircuitBranding: (title: string, subtitle: string, accentHex = '#f59e0b') => {
      drawGantryBannerCanvas(gantryCanvas, title, subtitle, accentHex);
      gantryBannerAlbedo.needsUpdate = true;
    },
    setQualityProfile: (quality: TextureQualityTier) => {
      activeQuality = quality;
      aniso = getQualityAnisotropy(quality, maxAnisotropy);
      roadAniso = getRoadAnisotropy(quality, maxAnisotropy);
      const roadSet = new Set<THREE.Texture>([
        asphaltAlbedo,
        asphaltNormal,
        asphaltRoughness,
        asphaltORM,
        startGridAlbedo,
        curbAlbedo,
        curbNormal,
      ]);
      for (const tex of allTextures) {
        const targetAniso = roadSet.has(tex) ? roadAniso : aniso;
        if (tex.anisotropy !== targetAniso) {
          tex.anisotropy = targetAniso;
          tex.needsUpdate = true;
        }
      }
      for (const entry of rescalableEntries) {
        applyCanvasCapToEntry(entry, quality);
      }
    },
    dispose: () => {
      cancelState.cancelled = true;
      if (photoQueueRaf) {
        cancelAnimationFrame(photoQueueRaf);
        photoQueueRaf = 0;
      }
      photoQueue.length = 0;
      for (const tex of allTextures) tex.dispose();
    },
  };
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function drawGantryBannerCanvas(
  c: HTMLCanvasElement,
  title: string,
  subtitle: string,
  accentHex: string,
): void {
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 192);
  grad.addColorStop(0, '#0f141b');
  grad.addColorStop(0.5, '#151c26');
  grad.addColorStop(1, '#0b0f14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 192);

  // Subtle metallic bevel rails
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 1024, 10);
  ctx.fillRect(0, 182, 1024, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(0, 10, 1024, 2);
  ctx.fillRect(0, 180, 1024, 2);

  for (let r = 0; r < 6; r++) {
    for (let col = 0; col < 4; col++) {
      ctx.fillStyle = (r + col) % 2 === 0 ? '#f3f4f6' : '#1f2937';
      ctx.fillRect(28 + col * 22, 30 + r * 22, 22, 22);
      ctx.fillRect(908 + col * 22, 30 + r * 22, 22, 22);
    }
  }

  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 60px "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 512, 80);

  ctx.fillStyle = accentHex;
  ctx.font = '600 24px "JetBrains Mono", monospace';
  ctx.fillText(subtitle, 512, 136);
}

function createChevronSignTexture(aniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#14181f';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, 236, 236);

  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(64, 42);
  ctx.lineTo(132, 42);
  ctx.lineTo(202, 128);
  ctx.lineTo(132, 214);
  ctx.lineTo(64, 214);
  ctx.lineTo(134, 128);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}

function createDistanceBoardTexture(distanceText: string, aniso: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f3f2ed';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#18181b';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 242, 242);

  ctx.fillStyle = '#c82824';
  ctx.fillRect(14, 14, 228, 36);

  // Corner mounting rivets
  ctx.fillStyle = '#64748b';
  for (const [rx, ry] of [[24, 24], [232, 24], [24, 232], [232, 232]]) {
    ctx.beginPath();
    ctx.arc(rx, ry, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#111827';
  ctx.font = '700 108px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(distanceText, 128, 152);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  tex.needsUpdate = true;
  return tex;
}
