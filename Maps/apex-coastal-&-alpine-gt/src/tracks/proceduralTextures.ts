import * as THREE from 'three';

export interface ProceduralTextureSet {
  asphaltMap: THREE.CanvasTexture;
  asphaltRoughness: THREE.CanvasTexture;
  asphaltNormal: THREE.CanvasTexture;
  concreteMap: THREE.CanvasTexture;
  concreteNormal: THREE.CanvasTexture;
  grateMap: THREE.CanvasTexture;
  grateNormal: THREE.CanvasTexture;
  terrainDetailMap: THREE.CanvasTexture;
  terrainDetailNormal: THREE.CanvasTexture;
  barkNormal: THREE.CanvasTexture;
  timberMap: THREE.CanvasTexture;
  checkeredMap: THREE.CanvasTexture;
  lighthouseStripeMap: THREE.CanvasTexture;
  palmFrondMap: THREE.CanvasTexture;
  catchFenceMap: THREE.CanvasTexture;
  facadeMap: THREE.CanvasTexture;
  jumbotronTexture: THREE.CanvasTexture;
  updateJumbotron: (
    mapName: string,
    speedKmh: number,
    lap: number,
    lapTimeSec: number,
    sector: string,
    accentHex: string
  ) => void;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createProceduralTextureSet(maxAnisotropy: number): ProceduralTextureSet {
  // 1. High-Definition 1024x1024 Crushed-Aggregate Asphalt Albedo, Roughness & Sobel Normal Map
  const size = 1024;
  const [aspCanvas, aspCtx] = makeCanvas(size, size);
  const [aspRCanvas, aspRCtx] = makeCanvas(size, size);
  const [aspNCanvas, aspNCtx] = makeCanvas(size, size);

  const aspImg = aspCtx.createImageData(size, size);
  const aspRImg = aspRCtx.createImageData(size, size);
  const aspNImg = aspNCtx.createImageData(size, size);
  const heightField = new Float32Array(size * size);

  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Multi-scale crushed basalt gravel base
  for (let i = 0; i < size * size; i++) {
    const r1 = rand();
    const r2 = rand();
    // Sharp bimodal distribution: dark asphalt binder (0.12..0.38) + protruding crisp stone facets (0.65..1.0)
    const stone = r1 > 0.62 ? 0.58 + r2 * 0.42 : r1 * 0.45;
    heightField[i] = stone;
  }

  // Stamp deterministic micro-pebble facets across 2x2 wrap for crisp specular micro-sparkles
  for (let p = 0; p < 18000; p++) {
    const cx = Math.floor(rand() * size);
    const cy = Math.floor(rand() * size);
    const rad = 1 + Math.floor(rand() * 2.4);
    const hVal = 0.68 + rand() * 0.32;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
        const px = (cx + dx + size) % size;
        const py = (cy + dy + size) % size;
        const idx = py * size + px;
        if (hVal > heightField[idx]) heightField[idx] = hVal;
      }
    }
  }

  for (let i = 0; i < size * size; i++) {
    const h = heightField[i];
    // Deep charcoal asphalt base so specular glints pop crisply without grey washout
    const base = 13 + h * 26;
    const p4 = i * 4;
    aspImg.data[p4] = Math.round(base);
    aspImg.data[p4 + 1] = Math.round(base + 1);
    aspImg.data[p4 + 2] = Math.round(base + 3);
    aspImg.data[p4 + 3] = 255;

    // Smooth dark binder in crevices (105), coarser mineral crests (215)
    const rv = Math.round(105 + h * 112);
    aspRImg.data[p4] = rv;
    aspRImg.data[p4 + 1] = rv;
    aspRImg.data[p4 + 2] = rv;
    aspRImg.data[p4 + 3] = 255;
  }
  aspCtx.putImageData(aspImg, 0, 0);
  aspRCtx.putImageData(aspRImg, 0, 0);

  // Subtle dark racing-line tire rubber tracks
  aspCtx.fillStyle = 'rgba(6, 7, 10, 0.28)';
  aspCtx.fillRect(215, 0, 175, size);
  aspCtx.fillRect(634, 0, 175, size);

  // Sharp wrap-seamless Sobel tangent-space normal map from pebble heightfield
  const strength = 2.4;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heightField[y * size + xp] - heightField[y * size + xm]) * strength;
      const dy = (heightField[yp * size + x] - heightField[ym * size + x]) * strength;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const p4 = (y * size + x) * 4;
      aspNImg.data[p4] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      aspNImg.data[p4 + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      aspNImg.data[p4 + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      aspNImg.data[p4 + 3] = 255;
    }
  }
  aspNCtx.putImageData(aspNImg, 0, 0);

  const asphaltMap = new THREE.CanvasTexture(aspCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.repeat.set(4.5, 4.5);
  asphaltMap.minFilter = THREE.LinearMipmapLinearFilter;
  asphaltMap.anisotropy = maxAnisotropy;

  const asphaltRoughness = new THREE.CanvasTexture(aspRCanvas);
  asphaltRoughness.wrapS = asphaltRoughness.wrapT = THREE.RepeatWrapping;
  asphaltRoughness.repeat.set(4.5, 4.5);
  asphaltRoughness.minFilter = THREE.LinearMipmapLinearFilter;
  asphaltRoughness.anisotropy = maxAnisotropy;

  const asphaltNormal = new THREE.CanvasTexture(aspNCanvas);
  asphaltNormal.wrapS = asphaltNormal.wrapT = THREE.RepeatWrapping;
  asphaltNormal.repeat.set(4.5, 4.5);
  asphaltNormal.minFilter = THREE.LinearMipmapLinearFilter;
  asphaltNormal.anisotropy = maxAnisotropy;

  // 2. Palm / Conifer Bark Normal Map
  const [barkCanvas, barkCtx] = makeCanvas(128, 128);
  barkCtx.fillStyle = 'rgb(128, 128, 255)';
  barkCtx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) {
    barkCtx.fillStyle = 'rgb(128, 175, 240)';
    barkCtx.fillRect(0, y, 128, 3);
    barkCtx.fillStyle = 'rgb(128, 84, 240)';
    barkCtx.fillRect(0, y + 4, 128, 3);
  }
  for (let x = 0; x < 128; x += 6) {
    barkCtx.fillStyle = 'rgba(155, 128, 255, 0.28)';
    barkCtx.fillRect(x, 0, 2, 128);
  }
  const barkNormal = new THREE.CanvasTexture(barkCanvas);
  barkNormal.wrapS = barkNormal.wrapT = THREE.RepeatWrapping;
  barkNormal.anisotropy = maxAnisotropy;

  // 3. Bleached Timber Boardwalk Texture
  const [timCanvas, timCtx] = makeCanvas(256, 256);
  timCtx.fillStyle = '#c2a67d';
  timCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 24) {
    const shade = Math.floor(172 + (y % 48 === 0 ? 12 : -8));
    timCtx.fillStyle = `rgb(${shade + 18}, ${shade - 2}, ${shade - 32})`;
    timCtx.fillRect(0, y + 1, 256, 22);
    timCtx.fillStyle = '#6d583e';
    timCtx.fillRect(0, y, 256, 2);
  }
  const timberMap = new THREE.CanvasTexture(timCanvas);
  timberMap.colorSpace = THREE.SRGBColorSpace;
  timberMap.wrapS = timberMap.wrapT = THREE.RepeatWrapping;
  timberMap.anisotropy = maxAnisotropy;

  // 4. Start/Finish Checkered Grid Decal
  const [chkCanvas, chkCtx] = makeCanvas(256, 128);
  const cols = 16;
  const rows = 4;
  const cw = 256 / cols;
  const ch = 128 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      chkCtx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#0f172a';
      chkCtx.fillRect(c * cw, r * ch, cw, ch);
    }
  }
  const checkeredMap = new THREE.CanvasTexture(chkCanvas);
  checkeredMap.colorSpace = THREE.SRGBColorSpace;
  checkeredMap.anisotropy = maxAnisotropy;

  // 5. Lighthouse Red/White Stripe Texture
  const [lhCanvas, lhCtx] = makeCanvas(128, 256);
  for (let i = 0; i < 6; i++) {
    lhCtx.fillStyle = i % 2 === 0 ? '#f8fafc' : '#dc2626';
    lhCtx.fillRect(0, (i * 256) / 6, 128, 256 / 6 + 1);
  }
  const lighthouseStripeMap = new THREE.CanvasTexture(lhCanvas);
  lighthouseStripeMap.colorSpace = THREE.SRGBColorSpace;
  lighthouseStripeMap.anisotropy = maxAnisotropy;

  // 6. Botanical Pinnate Coconut Palm Frond Texture (alpha-cutout for lush layered palm crowns)
  const [frondCanvas, frondCtx] = makeCanvas(256, 512);
  frondCtx.clearRect(0, 0, 256, 512);

  // Central woody rachis/stem tapering from base (y=508) to tip (y=10)
  const stemGrad = frondCtx.createLinearGradient(0, 512, 0, 0);
  stemGrad.addColorStop(0, '#4d6b26');
  stemGrad.addColorStop(0.5, '#3b7426');
  stemGrad.addColorStop(1, '#5d9e32');
  frondCtx.strokeStyle = stemGrad;
  frondCtx.lineWidth = 8;
  frondCtx.beginPath();
  frondCtx.moveTo(128, 510);
  frondCtx.lineTo(128, 14);
  frondCtx.stroke();

  // 34 pairs of tapered sunlit tropical leaflets along the rachis
  const pairs = 34;
  for (let p = 0; p < pairs; p++) {
    const t = p / (pairs - 1);
    const y = 492 - t * 468;
    const envelope = Math.sin(Math.pow(t, 0.72) * Math.PI * 0.96);
    const len = 24 + envelope * 102;
    const sweep = 24 + (1 - t) * 16;
    const leafW = 7.5 + envelope * 4.5;

    for (const side of [-1, 1]) {
      const tipX = 128 + side * len;
      const tipY = y - sweep;
      const ctrlX = 128 + side * len * 0.56;
      const ctrlY = y - sweep * 0.28;

      const grad = frondCtx.createLinearGradient(128, y, tipX, tipY);
      grad.addColorStop(0, '#1e4a18');
      grad.addColorStop(0.45, '#2f7224');
      grad.addColorStop(1, '#4ea034');
      frondCtx.fillStyle = grad;

      frondCtx.beginPath();
      frondCtx.moveTo(128, y + leafW * 0.45);
      frondCtx.quadraticCurveTo(ctrlX, ctrlY + leafW * 0.65, tipX, tipY);
      frondCtx.quadraticCurveTo(ctrlX, ctrlY - leafW * 0.65, 128, y - leafW * 0.45);
      frondCtx.closePath();
      frondCtx.fill();
    }
  }
  const palmFrondMap = new THREE.CanvasTexture(frondCanvas);
  palmFrondMap.colorSpace = THREE.SRGBColorSpace;
  palmFrondMap.minFilter = THREE.LinearMipmapLinearFilter;
  palmFrondMap.anisotropy = maxAnisotropy;

  // 7. Diamond Chain-Link Catch-Fence Mesh Texture (crisp metallic mesh + alpha cutout)
  const [fenceCanvas, fenceCtx] = makeCanvas(256, 256);
  fenceCtx.clearRect(0, 0, 256, 256);
  fenceCtx.strokeStyle = 'rgba(205, 218, 232, 0.92)';
  fenceCtx.lineWidth = 3.2;
  const step = 32;
  for (let offset = -256; offset <= 512; offset += step) {
    fenceCtx.beginPath();
    fenceCtx.moveTo(offset, 0);
    fenceCtx.lineTo(offset + 256, 256);
    fenceCtx.stroke();

    fenceCtx.beginPath();
    fenceCtx.moveTo(offset, 256);
    fenceCtx.lineTo(offset + 256, 0);
    fenceCtx.stroke();
  }
  // Horizontal tension cables top, mid, bottom
  fenceCtx.strokeStyle = 'rgba(148, 163, 184, 0.96)';
  fenceCtx.lineWidth = 6;
  for (const cy of [12, 128, 244]) {
    fenceCtx.beginPath();
    fenceCtx.moveTo(0, cy);
    fenceCtx.lineTo(256, cy);
    fenceCtx.stroke();
  }
  const catchFenceMap = new THREE.CanvasTexture(fenceCanvas);
  catchFenceMap.colorSpace = THREE.SRGBColorSpace;
  catchFenceMap.wrapS = catchFenceMap.wrapT = THREE.RepeatWrapping;
  catchFenceMap.repeat.set(64, 2);
  catchFenceMap.minFilter = THREE.LinearMipmapLinearFilter;
  catchFenceMap.anisotropy = maxAnisotropy;

  // 8. Architectural Ribbed Cladding / Paddock Facade Texture
  const [facCanvas, facCtx] = makeCanvas(256, 256);
  facCtx.fillStyle = '#cbd5e1';
  facCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    facCtx.fillStyle = x % 32 === 0 ? 'rgba(15, 23, 42, 0.14)' : 'rgba(255, 255, 255, 0.14)';
    facCtx.fillRect(x, 0, 4, 256);
  }
  for (let y = 0; y < 256; y += 64) {
    facCtx.fillStyle = 'rgba(15, 23, 42, 0.22)';
    facCtx.fillRect(0, y, 256, 3);
  }
  const facadeMap = new THREE.CanvasTexture(facCanvas);
  facadeMap.colorSpace = THREE.SRGBColorSpace;
  facadeMap.wrapS = facadeMap.wrapT = THREE.RepeatWrapping;
  facadeMap.repeat.set(6, 2);
  facadeMap.anisotropy = maxAnisotropy;

  // 9. Weathered Concrete Gutter & Curb Texture + Sobel Normal Map (512x512)
  const cSize = 512;
  const [concCanvas, concCtx] = makeCanvas(cSize, cSize);
  const [concNCanvas, concNCtx] = makeCanvas(cSize, cSize);
  const concImg = concCtx.createImageData(cSize, cSize);
  const concNImg = concNCtx.createImageData(cSize, cSize);
  const concH = new Float32Array(cSize * cSize);

  for (let y = 0; y < cSize; y++) {
    const vLen = y / cSize;
    for (let x = 0; x < cSize; x++) {
      const uLat = x / cSize;
      // Poured-concrete aggregate grain + longitudinal brush finish
      const brush = Math.sin(uLat * Math.PI * 36) * 0.06 + Math.cos(uLat * Math.PI * 84 + vLen * 6.283) * 0.05;
      const aggregate = (rand() - 0.5) * 0.42 + (rand() > 0.92 ? 0.24 : 0);
      // Deep saw-cut expansion joints every 128px along length
      const jointDist = Math.min(y % 128, 128 - (y % 128));
      const jointDip = jointDist < 4 ? -0.68 * (1 - jointDist / 4) : 0;
      const h = Math.max(0, Math.min(1, 0.56 + brush + aggregate * 0.48 + jointDip));
      concH[y * cSize + x] = h;

      // Water runoff patina & road-edge oil stain along inner gutter flow line (uLat 0.10..0.55)
      const flowCenter = Math.exp(-Math.pow((uLat - 0.34) * 5.2, 2));
      const asphaltSeamDarken = uLat < 0.12 ? 0.66 + (uLat / 0.12) * 0.34 : 1.0;
      const flowStain = 1.0 - flowCenter * 0.28;
      const jointDark = jointDist < 4 ? 0.38 + (jointDist / 4) * 0.62 : 1.0;
      const shade = Math.round((112 + h * 68) * asphaltSeamDarken * flowStain * jointDark);
      const p4 = (y * cSize + x) * 4;
      concImg.data[p4] = shade;
      concImg.data[p4 + 1] = Math.round(shade * 0.98);
      concImg.data[p4 + 2] = Math.round(shade * 0.93);
      concImg.data[p4 + 3] = 255;
    }
  }
  concCtx.putImageData(concImg, 0, 0);

  for (let y = 0; y < cSize; y++) {
    const ym = (y - 1 + cSize) % cSize;
    const yp = (y + 1) % cSize;
    for (let x = 0; x < cSize; x++) {
      const xm = (x - 1 + cSize) % cSize;
      const xp = (x + 1) % cSize;
      const dx = (concH[y * cSize + xp] - concH[y * cSize + xm]) * 2.8;
      const dy = (concH[yp * cSize + x] - concH[ym * cSize + x]) * 2.8;
      const invLen = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const p4 = (y * cSize + x) * 4;
      concNImg.data[p4] = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      concNImg.data[p4 + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      concNImg.data[p4 + 2] = Math.round((invLen * 0.5 + 0.5) * 255);
      concNImg.data[p4 + 3] = 255;
    }
  }
  concNCtx.putImageData(concNImg, 0, 0);

  const concreteMap = new THREE.CanvasTexture(concCanvas);
  concreteMap.colorSpace = THREE.SRGBColorSpace;
  concreteMap.wrapS = concreteMap.wrapT = THREE.RepeatWrapping;
  concreteMap.minFilter = THREE.LinearMipmapLinearFilter;
  concreteMap.anisotropy = maxAnisotropy;

  const concreteNormal = new THREE.CanvasTexture(concNCanvas);
  concreteNormal.wrapS = concreteNormal.wrapT = THREE.RepeatWrapping;
  concreteNormal.minFilter = THREE.LinearMipmapLinearFilter;
  concreteNormal.anisotropy = maxAnisotropy;

  // 10. Cast-Iron Slotted Storm-Drain Grate Map + Normal Map (256x256)
  const gSize = 256;
  const [grateCanvas, grateCtx] = makeCanvas(gSize, gSize);
  const [grateNCanvas, grateNCtx] = makeCanvas(gSize, gSize);
  grateCtx.fillStyle = '#3b424d';
  grateCtx.fillRect(0, 0, gSize, gSize);
  grateNCtx.fillStyle = 'rgb(128,128,255)';
  grateNCtx.fillRect(0, 0, gSize, gSize);

  // Subtle cast-iron pitting grain across iron bars
  for (let i = 0; i < 2400; i++) {
    const gx = Math.floor(rand() * gSize);
    const gy = Math.floor(rand() * gSize);
    const s = rand() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.16)';
    grateCtx.fillStyle = s;
    grateCtx.fillRect(gx, gy, 2, 2);
  }

  // Heavy cast-iron outer frame + corner mounting lugs
  grateCtx.strokeStyle = '#647080';
  grateCtx.lineWidth = 20;
  grateCtx.strokeRect(10, 10, gSize - 20, gSize - 20);
  grateCtx.strokeStyle = '#1e242d';
  grateCtx.lineWidth = 4;
  grateCtx.strokeRect(20, 20, gSize - 40, gSize - 40);

  // Deep black slotted drainage openings + crisp chamfered iron bar normals
  const slotCols = 8;
  const slotRows = 2;
  const marginX = 24;
  const marginY = 26;
  const cellW = (gSize - marginX * 2) / slotCols;
  const cellH = (gSize - marginY * 2) / slotRows;
  for (let r = 0; r < slotRows; r++) {
    for (let c = 0; c < slotCols; c++) {
      const sx = marginX + c * cellW + 5;
      const sy = marginY + r * cellH + 9;
      const sw = cellW - 10;
      const sh = cellH - 18;
      grateCtx.fillStyle = '#030508';
      grateCtx.fillRect(sx, sy, sw, sh);
      grateCtx.fillStyle = '#525d6d';
      grateCtx.fillRect(sx - 2, sy - 3, sw + 4, 3);

      // Beveled iron edge in normal map
      grateNCtx.fillStyle = 'rgb(128, 52, 224)';
      grateNCtx.fillRect(sx, sy - 5, sw, 5);
      grateNCtx.fillStyle = 'rgb(128, 204, 224)';
      grateNCtx.fillRect(sx, sy + sh, sw, 5);
      grateNCtx.fillStyle = 'rgb(52, 128, 224)';
      grateNCtx.fillRect(sx - 5, sy, 5, sh);
      grateNCtx.fillStyle = 'rgb(204, 128, 224)';
      grateNCtx.fillRect(sx + sw, sy, 5, sh);
    }
  }
  const grateMap = new THREE.CanvasTexture(grateCanvas);
  grateMap.colorSpace = THREE.SRGBColorSpace;
  grateMap.minFilter = THREE.LinearMipmapLinearFilter;
  grateMap.anisotropy = maxAnisotropy;

  const grateNormal = new THREE.CanvasTexture(grateNCanvas);
  grateNormal.minFilter = THREE.LinearMipmapLinearFilter;
  grateNormal.anisotropy = maxAnisotropy;

  // 11. Geological Terrain Detail Map & Triplanar Normal Map (512x512)
  const tdSize = 512;
  const [tdCanvas, tdCtx] = makeCanvas(tdSize, tdSize);
  const [tdNCanvas, tdNCtx] = makeCanvas(tdSize, tdSize);
  const tdImg = tdCtx.createImageData(tdSize, tdSize);
  const tdNImg = tdNCtx.createImageData(tdSize, tdSize);
  const tdH = new Float32Array(tdSize * tdSize);

  // Seamless periodic multi-octave geological fracture & grit field
  const gCell = 16;
  const coarseGrid = new Float32Array(gCell * gCell);
  for (let i = 0; i < coarseGrid.length; i++) coarseGrid[i] = rand();
  const sampleGrid = (gx: number, gy: number) => {
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
      const n1 = sampleGrid(u * gCell, v * gCell);
      const n2 = sampleGrid(u * gCell * 2 + 3.1, v * gCell * 2 + 1.7);
      const n3 = sampleGrid(u * gCell * 4 + 7.4, v * gCell * 4 + 5.2);
      // Ridged geological fracture folds + stratified crevices
      const ridge1 = 1 - Math.abs(n1 * 2 - 1);
      const ridge2 = 1 - Math.abs(n2 * 2 - 1);
      const crack = Math.min(ridge1, ridge2 * 0.85 + 0.15);
      const strata = Math.sin(ny * 4 + n1 * 5.0 + Math.cos(nx * 2) * 1.4) * 0.16;
      const grit = (rand() - 0.5) * 0.24;
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

  const terrainDetailMap = new THREE.CanvasTexture(tdCanvas);
  terrainDetailMap.wrapS = terrainDetailMap.wrapT = THREE.RepeatWrapping;
  terrainDetailMap.minFilter = THREE.LinearMipmapLinearFilter;
  terrainDetailMap.anisotropy = maxAnisotropy;

  const terrainDetailNormal = new THREE.CanvasTexture(tdNCanvas);
  terrainDetailNormal.wrapS = terrainDetailNormal.wrapT = THREE.RepeatWrapping;
  terrainDetailNormal.minFilter = THREE.LinearMipmapLinearFilter;
  terrainDetailNormal.anisotropy = maxAnisotropy;

  // 12. Live Jumbotron Telemetry Texture
  const [jCanvas, jCtx] = makeCanvas(512, 256);
  const jumbotronTexture = new THREE.CanvasTexture(jCanvas);
  jumbotronTexture.colorSpace = THREE.SRGBColorSpace;
  jumbotronTexture.anisotropy = maxAnisotropy;

  let lastDrawText = '';
  const updateJumbotron = (
    mapName: string,
    speedKmh: number,
    lap: number,
    lapTimeSec: number,
    sector: string,
    accentHex: string
  ) => {
    const key = `${mapName}|${Math.round(speedKmh / 3)}|${lap}|${Math.floor(lapTimeSec * 4)}|${sector}`;
    if (key === lastDrawText) return;
    lastDrawText = key;

    jCtx.fillStyle = '#070b14';
    jCtx.fillRect(0, 0, 512, 256);

    jCtx.fillStyle = accentHex;
    jCtx.fillRect(0, 0, 512, 10);
    jCtx.fillRect(0, 246, 512, 10);

    jCtx.fillStyle = '#e2e8f0';
    jCtx.font = 'bold 26px sans-serif';
    jCtx.fillText(mapName.toUpperCase(), 26, 54);

    jCtx.fillStyle = accentHex;
    jCtx.font = 'bold 74px monospace';
    jCtx.fillText(`${Math.round(speedKmh)} KM/H`, 26, 150);

    jCtx.fillStyle = '#94a3b8';
    jCtx.font = 'bold 24px monospace';
    const mins = Math.floor(lapTimeSec / 60);
    const secs = (lapTimeSec % 60).toFixed(1).padStart(4, '0');
    jCtx.fillText(`LAP ${lap}   ${mins}:${secs}   ${sector}`, 26, 212);

    jumbotronTexture.needsUpdate = true;
  };
  updateJumbotron('CORAL BAY COASTAL GT', 0, 1, 0, 'S1', '#06b6d4');

  return {
    asphaltMap,
    asphaltRoughness,
    asphaltNormal,
    concreteMap,
    concreteNormal,
    grateMap,
    grateNormal,
    terrainDetailMap,
    terrainDetailNormal,
    barkNormal,
    timberMap,
    checkeredMap,
    lighthouseStripeMap,
    palmFrondMap,
    catchFenceMap,
    facadeMap,
    jumbotronTexture,
    updateJumbotron,
    dispose: () => {
      asphaltMap.dispose();
      asphaltRoughness.dispose();
      asphaltNormal.dispose();
      concreteMap.dispose();
      concreteNormal.dispose();
      grateMap.dispose();
      grateNormal.dispose();
      terrainDetailMap.dispose();
      terrainDetailNormal.dispose();
      barkNormal.dispose();
      timberMap.dispose();
      checkeredMap.dispose();
      lighthouseStripeMap.dispose();
      palmFrondMap.dispose();
      catchFenceMap.dispose();
      facadeMap.dispose();
      jumbotronTexture.dispose();
    },
  };
}
