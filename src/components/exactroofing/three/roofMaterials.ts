import * as THREE from 'three';

export type Roof3DProfileKey = 'corrugate' | 'trapezoidal' | 'standing_seam';

export type Roof3DShadingMode = 'studio_finish' | 'facet_zones' | 'wireframe';

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
  { id: 'zincalume', name: 'Zincalume', hex: '#b8c0c8', metalness: 0.84, roughness: 0.26 },
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

/**
 * Generates seamless tileable tangent-space Normal + Roughness + Height/Bump maps
 * matching authentic NZ long-run profiled metal sheet geometry:
 * U runs across sheets (perpendicular to slope), V runs along sheet length.
 */
export function createProfileTextureSet(
  profile: Roof3DProfileKey,
  maxAnisotropy = 4
): ProceduralRoofTextureSet {
  const size = 256;

  // Height sample [0..1] along u (across ribs) + subtle longitudinal grain along v
  const sampleHeight = (u: number, v: number): number => {
    if (profile === 'corrugate') {
      // Classic 76mm sinusoidal wave (4 cycles per tile -> repeats every 0.305m across eave)
      return 0.5 + 0.44 * Math.sin(u * Math.PI * 2 * 4);
    }
    if (profile === 'standing_seam') {
      // Wide flat pan with crisp raised 38mm vertical lock seams (2 pans per tile)
      const phase = (u * 2) % 1;
      let seam = 0;
      if (phase < 0.055 || phase > 0.945) {
        const d = phase < 0.055 ? phase / 0.055 : (1 - phase) / 0.055;
        seam = 0.92 * (1 - d * 0.35);
      }
      // Subtle oil-canning micro ripple across wide tray pan
      const panMicro = 0.025 * Math.sin(v * Math.PI * 4) * Math.sin(phase * Math.PI);
      return Math.min(1, Math.max(0, 0.14 + seam + panMicro));
    }
    // 5-rib trapezoidal Plumbdeck (3 ribs per tile)
    const phase = (u * 3) % 1;
    let rib = 0.12;
    if (phase < 0.14) {
      rib = 0.88;
    } else if (phase < 0.24) {
      const t = (phase - 0.14) / 0.10;
      rib = 0.88 - t * 0.76;
    } else if (phase > 0.88) {
      const t = (1 - phase) / 0.12;
      rib = 0.88 - t * 0.76;
    } else if (phase > 0.48 && phase < 0.62) {
      // Subtle swage stiffener ribs in valley pan
      rib = 0.19;
    }
    return rib;
  };

  // Build bump canvas, normal canvas, roughness canvas
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

  const strength = profile === 'corrugate' ? 3.2 : profile === 'trapezoidal' ? 4.4 : 4.8;
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

      // Subtle roughness variation: crests catch slightly crisper specular highlights, troughs slightly softer
      const rVal = Math.round(THREE.MathUtils.clamp(215 - hC * 42, 120, 235));
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

  // Repeat ~1 tile per 0.76m sheet width across U, 1 per 1m down V
  const repeatU = profile === 'standing_seam' ? 1.15 : 1.3;
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

/**
 * Generates subtle horizontal architectural weatherboard / cladding normal texture for exterior walls.
 */
export function createWallCladdingTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);

  const boards = 8;
  for (let y = 0; y < size; y++) {
    const v = (y / size) * boards;
    const frac = v - Math.floor(v);
    // Horizontal weatherboard bevel normal
    let ny = -0.06;
    if (frac < 0.14) ny = 0.65; // Lower shadow lip bevel
    const nyByte = Math.round((ny * 0.5 + 0.5) * 255);
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const grain = (Math.sin(x * 0.4 + y * 0.15) * 4) | 0;
      img.data[idx] = 128 + grain;
      img.data[idx + 1] = Math.max(0, Math.min(255, nyByte + grain));
      img.data[idx + 2] = 246;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.5, 0.75);
  tex.anisotropy = Math.min(4, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
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
  grad.addColorStop(0.0, 'rgba(2, 6, 14, 0.58)');
  grad.addColorStop(0.42, 'rgba(3, 8, 18, 0.34)');
  grad.addColorStop(0.75, 'rgba(5, 10, 22, 0.10)');
  grad.addColorStop(1.0, 'rgba(5, 10, 22, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
