import * as THREE from 'three';
import { WallCladdingType } from '../../../types/exactRoofing';

export type Roof3DProfileKey = 'corrugate' | 'trapezoidal' | 'standing_seam';

export type Roof3DShadingMode = 'studio_finish' | 'facet_zones' | 'wireframe';

export type Roof3DLightingMode = 'day' | 'dusk' | 'night';

export interface ColorsteelSwatch {
  id: string;
  name: string;
  hex: string;
  metalness: number;
  roughness: number;
}

export const COLORSTEEL_SWATCHES: ColorsteelSwatch[] = [
  { id: 'flaxpod', name: 'FlaxPod', hex: '#2f3235', metalness: 0.36, roughness: 0.42 },
  { id: 'ironsand', name: 'Ironsand', hex: '#4b453f', metalness: 0.34, roughness: 0.44 },
  { id: 'grey_friars', name: 'Grey Friars', hex: '#50575e', metalness: 0.38, roughness: 0.40 },
  { id: 'ebony', name: 'Ebony', hex: '#232629', metalness: 0.36, roughness: 0.40 },
  { id: 'zincalume', name: 'Zincalume', hex: '#b8c0c8', metalness: 0.84, roughness: 0.25 },
  { id: 'titania', name: 'Titania', hex: '#c8c3b4', metalness: 0.28, roughness: 0.48 },
  { id: 'karaka', name: 'Karaka', hex: '#394335', metalness: 0.34, roughness: 0.45 },
  { id: 'new_denim_blue', name: 'New Denim Blue', hex: '#435261', metalness: 0.36, roughness: 0.42 }
];

export function resolveColorsteelSwatch(colorName?: string): ColorsteelSwatch {
  if (!colorName) return COLORSTEEL_SWATCHES[0];
  const lower = colorName.toLowerCase();
  const found = COLORSTEEL_SWATCHES.find(
    (s) => lower.includes(s.name.toLowerCase()) || lower.includes(s.id.replace('_', ' '))
  );
  return found || COLORSTEEL_SWATCHES[0];
}

export function resolveProfileKey(profileName?: string): Roof3DProfileKey {
  const lower = (profileName || '').toLowerCase();
  if (/corrugat|custom orb/.test(lower)) return 'corrugate';
  if (/seam|snaplock|tray|euro|interlocking/.test(lower)) return 'standing_seam';
  return 'trapezoidal';
}

export interface ProceduralRoofTextureSet {
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  dispose: () => void;
}

/** Deterministic fast pseudo-noise [0..1] for seamless metallic coil grain & masonry speckle */
function hash2D(ix: number, iy: number): number {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Generates seamless tileable tangent-space Normal + Roughness + Height/Bump maps
 * matching authentic NZ long-run profiled metal sheet geometry:
 * U runs across sheets (perpendicular to slope, aligned with eave/sheetRunEdge),
 * V runs up-slope along sheet length.
 */
export function createProfileTextureSet(
  profile: Roof3DProfileKey,
  maxAnisotropy = 4
): ProceduralRoofTextureSet {
  const size = 256;

  // Height sample [0..1] along u (across ribs) + subtle longitudinal coil texture along v
  const sampleHeight = (u: number, v: number): number => {
    const rollMicro = (hash2D(Math.floor(u * size) % size, Math.floor(v * 32) % 32) - 0.5) * 0.014;
    if (profile === 'corrugate') {
      // Classic 76.2mm sinusoidal wave (4 cycles per 0.3048m tile)
      return THREE.MathUtils.clamp(0.5 + 0.44 * Math.sin(u * Math.PI * 2 * 4) + rollMicro, 0, 1);
    }
    if (profile === 'standing_seam') {
      // Wide 400mm flat pan with crisp raised 38mm vertical lock seams (2 pans per 0.80m tile)
      const phase = (u * 2) % 1;
      let seam = 0;
      if (phase < 0.052 || phase > 0.948) {
        const d = phase < 0.052 ? phase / 0.052 : (1 - phase) / 0.052;
        seam = 0.94 * (1 - d * 0.32);
      }
      // Subtle oil-canning micro ripple across wide tray pan
      const panMicro = 0.022 * Math.sin(v * Math.PI * 4) * Math.sin(phase * Math.PI);
      return THREE.MathUtils.clamp(0.12 + seam + panMicro + rollMicro * 0.6, 0, 1);
    }
    // 5-rib trapezoidal (762mm sheet cover = 4 pans / 4 repeating intervals across tile,
    // centered so rib peaks sit on u=0, 0.25, 0.5, 0.75, matching 0.762m overlap seams)
    const phase = (u * 4) % 1;
    let rib = 0.12;
    if (phase < 0.11 || phase > 0.89) {
      rib = 0.9;
    } else if (phase < 0.20) {
      const t = (phase - 0.11) / 0.09;
      rib = 0.9 - t * 0.78;
    } else if (phase > 0.80) {
      const t = (0.89 - phase) / 0.09;
      rib = 0.9 - t * 0.78;
    } else if (phase > 0.42 && phase < 0.58) {
      // Dual swage stiffener lines inside trapezoidal valley pan
      rib = 0.18 + 0.04 * Math.cos(((phase - 0.5) / 0.08) * Math.PI);
    }
    return THREE.MathUtils.clamp(rib + rollMicro * 0.5, 0, 1);
  };

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d')!;
  const bumpImg = bumpCtx.createImageData(size, size);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext('2d')!;
  const normalImg = normalCtx.createImageData(size, size);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d')!;
  const roughImg = roughCtx.createImageData(size, size);

  const strength = profile === 'corrugate' ? 3.4 : profile === 'trapezoidal' ? 4.6 : 5.0;
  const eps = 1 / size;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const hC = sampleHeight(u, v);
      const hL = sampleHeight((u - eps + 1) % 1, v);
      const hR = sampleHeight((u + eps) % 1, v);
      const hD = sampleHeight(u, (v - eps + 1) % 1);
      const hU = sampleHeight(u, (v + eps) % 1);

      const dHx = (hR - hL) * strength;
      const dHy = (hU - hD) * strength;
      const nx = -dHx;
      const ny = -dHy;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);

      const idx = (y * size + x) * 4;

      const bVal = Math.round(hC * 255);
      bumpImg.data[idx] = bVal;
      bumpImg.data[idx + 1] = bVal;
      bumpImg.data[idx + 2] = bVal;
      bumpImg.data[idx + 3] = 255;

      normalImg.data[idx] = Math.round(((nx * invLen) * 0.5 + 0.5) * 255);
      normalImg.data[idx + 1] = Math.round(((ny * invLen) * 0.5 + 0.5) * 255);
      normalImg.data[idx + 2] = Math.round(((nz * invLen) * 0.5 + 0.5) * 255);
      normalImg.data[idx + 3] = 255;

      // Subtle roughness contrast: crests catch sharper highlights, valleys hold softer satin finish
      const microRough = (hash2D(x, y) - 0.5) * 10;
      const rVal = Math.round(THREE.MathUtils.clamp(216 - hC * 44 + microRough, 118, 240));
      roughImg.data[idx] = rVal;
      roughImg.data[idx + 1] = rVal;
      roughImg.data[idx + 2] = rVal;
      roughImg.data[idx + 3] = 255;
    }
  }

  bumpCtx.putImageData(bumpImg, 0, 0);
  normalCtx.putImageData(normalImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const setupTex = (canvas: HTMLCanvasElement, repeatU: number, repeatV: number) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatU, repeatV);
    tex.anisotropy = Math.min(8, maxAnisotropy);
    tex.needsUpdate = true;
    return tex;
  };

  // Physically calibrated U repeats per metre:
  // - Corrugate: 4 cycles = 0.3048m -> 3.281 tiles/m (76.2mm pitch)
  // - Trapezoidal: 4 ribs = 0.762m cover width -> 1.3123 tiles/m (exact 762mm seam alignment!)
  // - Standing Seam: 2 pans = 0.80m -> 1.25 tiles/m (400mm pans)
  const repeatU =
    profile === 'corrugate' ? 3.281 : profile === 'standing_seam' ? 1.25 : 1 / 0.762;
  const repeatV = 0.5;

  const normalMap = setupTex(normalCanvas, repeatU, repeatV);
  const roughnessMap = setupTex(roughCanvas, repeatU, repeatV);
  const bumpMap = setupTex(bumpCanvas, repeatU, repeatV);

  return {
    normalMap,
    roughnessMap,
    bumpMap,
    dispose: () => {
      normalMap.dispose();
      roughnessMap.dispose();
      bumpMap.dispose();
    }
  };
}

export interface WallCladdingTextureEntry {
  normalMap: THREE.CanvasTexture;
  map?: THREE.CanvasTexture;
  normalScale: number;
}

export interface WallCladdingTextureSet {
  weatherboard: WallCladdingTextureEntry;
  profiled_metal: WallCladdingTextureEntry;
  brick: WallCladdingTextureEntry;
  fibre_cement: WallCladdingTextureEntry;
  plaster: WallCladdingTextureEntry;
  garageDoor: THREE.CanvasTexture;
  getEntry: (type: WallCladdingType) => WallCladdingTextureEntry | null;
  dispose: () => void;
}

function buildNormalFromHeightSampler(
  size: number,
  strength: number,
  sampleH: (u: number, v: number) => number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const eps = 1 / size;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const hL = sampleH((u - eps + 1) % 1, v);
      const hR = sampleH((u + eps) % 1, v);
      const hD = sampleH(u, (v - eps + 1) % 1);
      const hU = sampleH(u, (v + eps) % 1);

      const nx = -(hR - hL) * strength;
      const ny = -(hU - hD) * strength;
      const nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);

      const idx = (y * size + x) * 4;
      img.data[idx] = Math.round(((nx * invLen) * 0.5 + 0.5) * 255);
      img.data[idx + 1] = Math.round(((ny * invLen) * 0.5 + 0.5) * 255);
      img.data[idx + 2] = Math.round(((nz * invLen) * 0.5 + 0.5) * 255);
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Generates cladding-specific seamless PBR textures calibrated in real-world wall (u, v) metres:
 * - weatherboard: horizontal lap bevel boards
 * - profiled_metal: vertical trapezoidal metal ribs (vertical architectural cladding)
 * - brick: NZ stretcher-bond brickwork with subtle mortar lines & tonal variation
 * - fibre_cement: 1.2m expressed panel joints
 * - plaster: fine architectural stucco grain
 */
export function createWallCladdingTextureSet(maxAnisotropy = 4): WallCladdingTextureSet {
  const size = 256;
  const aniso = Math.min(6, maxAnisotropy);
  const allTextures: THREE.CanvasTexture[] = [];

  const configureTex = (tex: THREE.CanvasTexture, repX: number, repY: number, isColor = false) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    tex.anisotropy = aniso;
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    allTextures.push(tex);
    return tex;
  };

  // 1. Horizontal Bevel Weatherboard (8 boards per tile -> 1.2m/tile => ~150mm per board)
  const wbNormal = configureTex(
    buildNormalFromHeightSampler(size, 3.6, (u, v) => {
      const boards = 8;
      const f = (v * boards) % 1;
      const woodGrain = (hash2D(Math.floor(u * 64), Math.floor(v * 256)) - 0.5) * 0.03;
      // Sharp shadow undercut at bottom 12% of each board, smooth lap slope across top 88%
      const profile = f < 0.12 ? (f / 0.12) * 0.92 : 0.92 - ((f - 0.12) / 0.88) * 0.78;
      return profile + woodGrain;
    }),
    0.5,
    0.833
  );

  // 2. Vertical Profiled Metal Cladding (ribs vary strictly along U = horizontal, running vertically!)
  const metalNormal = configureTex(
    buildNormalFromHeightSampler(size, 4.4, (u) => {
      const phase = (u * 4) % 1;
      if (phase < 0.12 || phase > 0.88) return 0.9;
      if (phase < 0.22) return 0.9 - ((phase - 0.12) / 0.1) * 0.78;
      if (phase > 0.78) return 0.9 - ((0.88 - phase) / 0.1) * 0.78;
      return 0.12;
    }),
    1 / 0.762,
    0.5
  );

  // 3. Stretcher-Bond Brickwork (4 bricks across x 10 courses high per tile -> 0.96m x 0.86m)
  const brickCols = 4;
  const brickRows = 10;
  const sampleBrickHeight = (u: number, v: number): { h: number; isMortar: boolean; tone: number } => {
    const row = Math.floor(v * brickRows);
    const rv = (v * brickRows) % 1;
    const shift = (row % 2) * 0.5;
    const cu = (u * brickCols + shift) % 1;
    const col = Math.floor((u * brickCols + shift) % brickCols);
    const mortarV = rv < 0.14 || rv > 0.97;
    const mortarU = cu < 0.055 || cu > 0.975;
    const isMortar = mortarV || mortarU;
    const grain = (hash2D(Math.floor(u * size), Math.floor(v * size)) - 0.5) * 0.12;
    const tone = 0.88 + hash2D(col + 3, row + 11) * 0.22;
    return {
      h: isMortar ? 0.18 + grain * 0.4 : 0.82 + grain,
      isMortar,
      tone
    };
  };

  const brickNormal = configureTex(
    buildNormalFromHeightSampler(size, 3.2, (u, v) => sampleBrickHeight(u, v).h),
    1.04,
    1.16
  );

  const brickAlbedoCanvas = document.createElement('canvas');
  brickAlbedoCanvas.width = size;
  brickAlbedoCanvas.height = size;
  const brickCtx = brickAlbedoCanvas.getContext('2d')!;
  const brickImg = brickCtx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const v = 1 - y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const sample = sampleBrickHeight(u, v);
      const idx = (y * size + x) * 4;
      if (sample.isMortar) {
        brickImg.data[idx] = 205;
        brickImg.data[idx + 1] = 200;
        brickImg.data[idx + 2] = 192;
      } else {
        // Neutral bright tone multiplier so wall material's base color tints brick naturally
        const c = Math.round(THREE.MathUtils.clamp(sample.tone * 242, 185, 255));
        brickImg.data[idx] = c;
        brickImg.data[idx + 1] = Math.round(c * 0.96);
        brickImg.data[idx + 2] = Math.round(c * 0.94);
      }
      brickImg.data[idx + 3] = 255;
    }
  }
  brickCtx.putImageData(brickImg, 0, 0);
  const brickColorMap = configureTex(new THREE.CanvasTexture(brickAlbedoCanvas), 1.04, 1.16, true);

  // 4. Expressed-Joint Fibre Cement Sheets (1.2m wide x 2.4m tall module joints)
  const fcNormal = configureTex(
    buildNormalFromHeightSampler(size, 3.8, (u, v) => {
      const seamU = u < 0.018 || u > 0.982;
      const seamV = v < 0.014 || v > 0.986;
      const grain = (hash2D(Math.floor(u * 128), Math.floor(v * 128)) - 0.5) * 0.04;
      return seamU || seamV ? 0.15 : 0.85 + grain;
    }),
    1 / 1.2,
    1 / 2.4
  );

  // 5. Fine Architectural Plaster / Stucco
  const plasterNormal = configureTex(
    buildNormalFromHeightSampler(size, 1.6, (u, v) => {
      const gx = Math.floor(u * 128);
      const gy = Math.floor(v * 128);
      return 0.5 + (hash2D(gx, gy) - 0.5) * 0.35;
    }),
    1.25,
    1.25
  );

  // 6. Horizontal Sectional Garage Door Panels
  const garageDoor = configureTex(
    buildNormalFromHeightSampler(size, 3.8, (_u, v) => {
      const panels = 4;
      const f = (v * panels) % 1;
      if (f < 0.09) return 0.25;
      if (f > 0.91) return 0.95;
      return 0.8;
    }),
    0.5,
    0.5
  );

  const weatherboard: WallCladdingTextureEntry = { normalMap: wbNormal, normalScale: 0.62 };
  const profiled_metal: WallCladdingTextureEntry = { normalMap: metalNormal, normalScale: 0.65 };
  const brick: WallCladdingTextureEntry = {
    normalMap: brickNormal,
    map: brickColorMap,
    normalScale: 0.48
  };
  const fibre_cement: WallCladdingTextureEntry = { normalMap: fcNormal, normalScale: 0.45 };
  const plaster: WallCladdingTextureEntry = { normalMap: plasterNormal, normalScale: 0.22 };

  return {
    weatherboard,
    profiled_metal,
    brick,
    fibre_cement,
    plaster,
    garageDoor,
    getEntry: (type: WallCladdingType) => {
      switch (type) {
        case 'weatherboard':
          return weatherboard;
        case 'profiled_metal':
          return profiled_metal;
        case 'brick':
          return brick;
        case 'fibre_cement':
          return fibre_cement;
        case 'plaster':
          return plaster;
        case 'other':
          return fibre_cement;
        default:
          return null;
      }
    },
    dispose: () => {
      allTextures.forEach((t) => t.dispose());
    }
  };
}

/**
 * Generates radial baked ground contact shadow texture (zero harsh circle edge).
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 12, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(4, 9, 20, 0.56)');
  grad.addColorStop(0.45, 'rgba(6, 12, 24, 0.30)');
  grad.addColorStop(0.76, 'rgba(8, 16, 30, 0.08)');
  grad.addColorStop(1.0, 'rgba(8, 16, 30, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
