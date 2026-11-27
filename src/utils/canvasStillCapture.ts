/**
 * Captures the currently mounted 3D WebGL viewport or 2D SVG plan viewport
 * as a downscaled PNG data URL (max edge 1600px).
 * Never throws and returns `{ dataUrl: null, failed: true }` if unavailable so pushes are never blocked.
 */
export async function captureRoofStillDataUrl(options?: {
  maxEdgePx?: number;
  timeoutMs?: number;
}): Promise<{ dataUrl: string | null; failed: boolean; reason?: string }> {
  const maxEdgePx = Math.max(320, Math.min(2048, options?.maxEdgePx ?? 1600));
  const timeoutMs = Math.max(150, options?.timeoutMs ?? 800);

  if (typeof document === 'undefined') {
    return { dataUrl: null, failed: true, reason: 'Headless environment (no canvas)' };
  }

  try {
    // 1. Prefer mounted 3D WebGL canvas when active
    const glCanvas = document.querySelector('canvas[data-apex-canvas="3d"]') as HTMLCanvasElement | null;
    if (glCanvas && glCanvas.width > 0 && glCanvas.height > 0) {
      const scaled = drawSourceToScaledDataUrl(glCanvas, glCanvas.width, glCanvas.height, maxEdgePx);
      if (scaled) {
        return { dataUrl: scaled, failed: false };
      }
    }

    // 2. Fallback to mounted 2D SVG plan canvas
    const svgEl = document.querySelector('svg[data-apex-svg="2d"]') as SVGSVGElement | null;
    if (svgEl) {
      const rect = svgEl.getBoundingClientRect();
      const vb = svgEl.viewBox?.baseVal;
      const srcW = Math.max(320, Math.round(vb?.width || rect.width || 1200));
      const srcH = Math.max(240, Math.round(vb?.height || rect.height || 800));

      const cloned = svgEl.cloneNode(true) as SVGSVGElement;
      cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      cloned.setAttribute('width', String(srcW));
      cloned.setAttribute('height', String(srcH));

      const xml = new XMLSerializer().serializeToString(cloned);
      const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      try {
        const img = await loadImageWithTimeout(url, timeoutMs);
        const scaled = drawSourceToScaledDataUrl(img, srcW, srcH, maxEdgePx, '#060a13');
        if (scaled) {
          return { dataUrl: scaled, failed: false };
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    return { dataUrl: null, failed: true, reason: 'No mounted roof canvas available' };
  } catch (err) {
    return {
      dataUrl: null,
      failed: true,
      reason: err instanceof Error ? err.message : 'Unable to capture roof still'
    };
  }
}

function drawSourceToScaledDataUrl(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  maxEdgePx: number,
  bgColor?: string
): string | null {
  if (srcW <= 0 || srcH <= 0) return null;
  const scale = Math.min(1, maxEdgePx / Math.max(srcW, srcH));
  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return null;
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, targetW, targetH);
  }
  ctx.drawImage(source, 0, 0, targetW, targetH);
  return outCanvas.toDataURL('image/png');
}

function loadImageWithTimeout(src: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Canvas still capture timed out'));
      }
    }, timeoutMs);

    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(img);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('Failed to rasterize 2D plan SVG'));
      }
    };
    img.src = src;
  });
}
