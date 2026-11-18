import { PlanEdge, Point2D, RoofOutline, RoofPlane } from '../../../types/exactRoofing';
import { dist } from '../../../utils/exactRoofingEngine';

export interface MetricGridData {
  minorStepM: number;
  majorStepM: number;
  xLines: { coordM: number; svgPos: number; isMajor: boolean; isOrigin: boolean }[];
  yLines: { coordM: number; svgPos: number; isMajor: boolean; isOrigin: boolean }[];
}

export interface ScaleBarSpec {
  worldLengthM: number;
  halfLabel: string;
  fullLabel: string;
  pixelWidth: number;
}

export interface SheetCourseLine {
  from: Point2D;
  to: Point2D;
}

export interface PlaneDirectionOverlay {
  arrowTail: Point2D;
  arrowTip: Point2D;
  underlapPos: Point2D;
  underlapDir: Point2D;
  uVec: Point2D;
  vInward: Point2D;
}

export interface EdgeDimensionPlacement {
  p1: Point2D;
  p2: Point2D;
  extStart1: Point2D;
  extEnd1: Point2D;
  extStart2: Point2D;
  extEnd2: Point2D;
  dimStart: Point2D;
  dimEnd: Point2D;
  labelPos: Point2D;
  angleDeg: number;
  lengthM: number;
  outwardNormal: Point2D;
}

export interface WallBandQuad {
  points: [Point2D, Point2D, Point2D, Point2D];
  eaveSetbackM: number;
}

/**
 * Signed shoestring area (>0 means CW in screen-down coords, <0 means CCW).
 */
export function computePolygonSignedArea(points: Point2D[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/**
 * Returns unit outward normal for an edge belonging to a closed polygon outline.
 */
export function computeOutwardEdgeNormal(edge: PlanEdge, polygonPoints: Point2D[]): Point2D {
  const dx = edge.to.x - edge.from.x;
  const dy = edge.to.y - edge.from.y;
  const len = Math.hypot(dx, dy) || 1;
  // Two candidate normals
  const nLeft = { x: -dy / len, y: dx / len };
  const nRight = { x: dy / len, y: -dx / len };

  const mid = { x: (edge.from.x + edge.to.x) / 2, y: (edge.from.y + edge.to.y) / 2 };
  const eps = 0.08;
  const testLeft = { x: mid.x + nLeft.x * eps, y: mid.y + nLeft.y * eps };

  // Point-in-polygon ray cast
  let inside = false;
  for (let i = 0, j = polygonPoints.length - 1; i < polygonPoints.length; j = i++) {
    const xi = polygonPoints[i].x;
    const yi = polygonPoints[i].y;
    const xj = polygonPoints[j].x;
    const yj = polygonPoints[j].y;
    const intersect =
      yi > testLeft.y !== yj > testLeft.y &&
      testLeft.x < ((xj - xi) * (testLeft.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }

  return inside ? nRight : nLeft;
}

/**
 * Computes clean outward CAD extension & dimension line geometry for an outline edge.
 */
export function computeEdgeDimensionPlacement(
  edge: PlanEdge,
  outline: RoofOutline,
  offsetM: number
): EdgeDimensionPlacement {
  const n = computeOutwardEdgeNormal(edge, outline.points);
  const gap = Math.min(0.18, offsetM * 0.25);
  const tickExt = Math.min(0.24, offsetM * 0.35);

  const dimStart = { x: edge.from.x + n.x * offsetM, y: edge.from.y + n.y * offsetM };
  const dimEnd = { x: edge.to.x + n.x * offsetM, y: edge.to.y + n.y * offsetM };

  const extStart1 = { x: edge.from.x + n.x * gap, y: edge.from.y + n.y * gap };
  const extEnd1 = { x: edge.from.x + n.x * (offsetM + tickExt), y: edge.from.y + n.y * (offsetM + tickExt) };

  const extStart2 = { x: edge.to.x + n.x * gap, y: edge.to.y + n.y * gap };
  const extEnd2 = { x: edge.to.x + n.x * (offsetM + tickExt), y: edge.to.y + n.y * (offsetM + tickExt) };

  const labelPos = { x: (dimStart.x + dimEnd.x) / 2, y: (dimStart.y + dimEnd.y) / 2 };

  let angleDeg = (Math.atan2(edge.to.y - edge.from.y, edge.to.x - edge.from.x) * 180) / Math.PI;
  if (angleDeg > 90) angleDeg -= 180;
  if (angleDeg < -90) angleDeg += 180;

  return {
    p1: edge.from,
    p2: edge.to,
    extStart1,
    extEnd1,
    extStart2,
    extEnd2,
    dimStart,
    dimEnd,
    labelPos,
    angleDeg,
    lengthM: +dist(edge.from, edge.to).toFixed(2),
    outwardNormal: n
  };
}

/**
 * Computes true world-space metric blueprint grid lines clipped cleanly to current viewport.
 */
export function computeMetricGridLines(
  svgWidth: number,
  svgHeight: number,
  pixelsPerMetre: number,
  fromSvgX: (sx: number) => number,
  fromSvgY: (sy: number) => number,
  toSvgX: (wx: number) => number,
  toSvgY: (wy: number) => number
): MetricGridData {
  let minorStepM = 1;
  let majorStepM = 5;

  if (pixelsPerMetre >= 95) {
    minorStepM = 0.25;
    majorStepM = 1;
  } else if (pixelsPerMetre >= 42) {
    minorStepM = 0.5;
    majorStepM = 2;
  } else if (pixelsPerMetre >= 18) {
    minorStepM = 1;
    majorStepM = 5;
  } else {
    minorStepM = 2;
    majorStepM = 10;
  }

  const wMinX = fromSvgX(0);
  const wMaxX = fromSvgX(svgWidth);
  const wMinY = fromSvgY(0);
  const wMaxY = fromSvgY(svgHeight);

  const startX = Math.floor(Math.min(wMinX, wMaxX) / minorStepM) * minorStepM;
  const endX = Math.ceil(Math.max(wMinX, wMaxX) / minorStepM) * minorStepM;
  const startY = Math.floor(Math.min(wMinY, wMaxY) / minorStepM) * minorStepM;
  const endY = Math.ceil(Math.max(wMinY, wMaxY) / minorStepM) * minorStepM;

  const xLines: MetricGridData['xLines'] = [];
  const maxGridCount = 140;

  const stepsX = Math.min(maxGridCount, Math.round((endX - startX) / minorStepM));
  for (let i = 0; i <= stepsX; i++) {
    const coordM = +(startX + i * minorStepM).toFixed(4);
    const ratio = coordM / majorStepM;
    const isMajor = Math.abs(ratio - Math.round(ratio)) < 1e-4;
    const isOrigin = Math.abs(coordM) < 1e-4;
    xLines.push({
      coordM,
      svgPos: toSvgX(coordM),
      isMajor,
      isOrigin
    });
  }

  const yLines: MetricGridData['yLines'] = [];
  const stepsY = Math.min(maxGridCount, Math.round((endY - startY) / minorStepM));
  for (let i = 0; i <= stepsY; i++) {
    const coordM = +(startY + i * minorStepM).toFixed(4);
    const ratio = coordM / majorStepM;
    const isMajor = Math.abs(ratio - Math.round(ratio)) < 1e-4;
    const isOrigin = Math.abs(coordM) < 1e-4;
    yLines.push({
      coordM,
      svgPos: toSvgY(coordM),
      isMajor,
      isOrigin
    });
  }

  return { minorStepM, majorStepM, xLines, yLines };
}

/**
 * Selects a crisp round architectural scale bar matching current zoom factor.
 */
export function computeDynamicScaleBar(pixelsPerMetre: number): ScaleBarSpec {
  const candidates = [0.5, 1, 2, 5, 10, 20];
  let best = candidates[2];
  for (const c of candidates) {
    const px = c * pixelsPerMetre;
    if (px >= 48 && px <= 122) {
      best = c;
      break;
    }
    if (px < 48) {
      best = c;
    }
  }
  const pixelWidth = Math.max(36, Math.min(130, best * pixelsPerMetre));
  const half = best / 2;
  return {
    worldLengthM: best,
    halfLabel: Number.isInteger(half) ? `${half}` : `${half.toFixed(1)}`,
    fullLabel: `${best}m`,
    pixelWidth
  };
}

/**
 * Generates clipped sheet course lines (default 762mm NZ long-run cover width)
 * running upslope inside a defined roof plane polygon.
 */
export function computeSheetCourseSegments(
  plane: RoofPlane,
  maxLines = 48
): SheetCourseLine[] {
  const poly = plane.planPolygon;
  if (!poly || poly.length < 3) return [];

  const p0 = poly[0];
  const p1 = poly[1] || p0;
  const edx = p1.x - p0.x;
  const edy = p1.y - p0.y;
  const eLen = Math.hypot(edx, edy);
  if (eLen < 0.25) return [];

  const uVec = { x: edx / eLen, y: edy / eLen };
  const vInward = plane.runDirection || { x: -uVec.y, y: uVec.x };

  // Find u extent of polygon
  let minU = Infinity;
  let maxU = -Infinity;
  for (const pt of poly) {
    const u = (pt.x - p0.x) * uVec.x + (pt.y - p0.y) * uVec.y;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
  }

  let stepM = 0.762;
  const totalSpan = maxU - minU;
  if (totalSpan / stepM > maxLines) {
    stepM = totalSpan / maxLines;
  }

  const lines: SheetCourseLine[] = [];
  // Offset slightly from edge so lines start cleanly inside facet
  const firstU = Math.ceil((minU + 0.05) / stepM) * stepM;
  for (let u = firstU; u < maxU - 0.05; u += stepM) {
    const vHits: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ua = (a.x - p0.x) * uVec.x + (a.y - p0.y) * uVec.y;
      const ub = (b.x - p0.x) * uVec.x + (b.y - p0.y) * uVec.y;
      if ((ua <= u && ub > u) || (ub <= u && ua > u)) {
        const t = (u - ua) / (ub - ua);
        const px = a.x + t * (b.x - a.x);
        const py = a.y + t * (b.y - a.y);
        const v = (px - p0.x) * vInward.x + (py - p0.y) * vInward.y;
        vHits.push(v);
      }
    }
    if (vHits.length >= 2) {
      vHits.sort((x, y) => x - y);
      for (let k = 0; k + 1 < vHits.length; k += 2) {
        const vA = vHits[k];
        const vB = vHits[k + 1];
        if (vB - vA > 0.12) {
          lines.push({
            from: {
              x: p0.x + u * uVec.x + vA * vInward.x,
              y: p0.y + u * uVec.y + vA * vInward.y
            },
            to: {
              x: p0.x + u * uVec.x + vB * vInward.x,
              y: p0.y + u * uVec.y + vB * vInward.y
            }
          });
        }
      }
    }
  }
  return lines;
}

/**
 * Computes crisp slope-fall drainage arrow and sheet lay underlap indicator for a roof plane.
 */
export function computePlaneDirectionOverlay(plane: RoofPlane): (PlaneDirectionOverlay & { planRunM: number }) | null {
  const poly = plane.planPolygon;
  if (!poly || poly.length < 3) return null;

  const p0 = poly[0];
  const p1 = poly[1] || p0;
  const edx = p1.x - p0.x;
  const edy = p1.y - p0.y;
  const eLen = Math.hypot(edx, edy);
  if (eLen < 0.2) return null;

  const uVec = { x: edx / eLen, y: edy / eLen };
  const vInward = plane.runDirection || { x: -uVec.y, y: uVec.x };

  let maxV = 0;
  for (const pt of poly) {
    const v = (pt.x - p0.x) * vInward.x + (pt.y - p0.y) * vInward.y;
    if (v > maxV) maxV = v;
  }

  const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;

  const runDist = Math.min(1.4, Math.max(0.55, maxV * 0.24));
  // Fall arrow points downslope (-vInward) toward eave/gutter
  const arrowTail = {
    x: cx + vInward.x * (runDist * 0.52),
    y: cy + vInward.y * (runDist * 0.52)
  };
  const arrowTip = {
    x: cx - vInward.x * (runDist * 0.52),
    y: cy - vInward.y * (runDist * 0.52)
  };

  // Underlap indicator arrow points toward prevailing weather/start lay progression
  const laySign = plane.underlapSide === 'right' ? 1 : -1;
  const underlapDir = { x: uVec.x * laySign, y: uVec.y * laySign };
  const underlapPos = {
    x: cx + vInward.x * (runDist * 0.12),
    y: cy + vInward.y * (runDist * 0.12)
  };

  return {
    arrowTail,
    arrowTip,
    underlapPos,
    underlapDir,
    uVec,
    vInward,
    planRunM: maxV
  };
}
