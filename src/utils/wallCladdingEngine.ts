import {
  Point2D,
  RoofLevel,
  RoofOutline,
  WallCladdingType,
  WallFacet,
  WallOpening,
  WallOpeningType,
  WallPlan,
  WallPlanEdge
} from '../types/exactRoofing';
import {
  computeEdgeSetbackLine,
  dist,
  getDefaultEdgeSetbackM,
  isEdgeWallEnabled,
  pointsClose
} from './exactRoofingEngine';

export interface WallCladdingMeta {
  type: WallCladdingType;
  label: string;
  shortLabel: string;
  hex: string;
  roughness: number;
  metalness: number;
}

export const WALL_CLADDING_OPTIONS: WallCladdingMeta[] = [
  {
    type: 'profiled_metal',
    label: 'Profiled Metal Cladding',
    shortLabel: 'Metal',
    hex: '#475569',
    roughness: 0.42,
    metalness: 0.48
  },
  {
    type: 'weatherboard',
    label: 'Weatherboard (Bevel / Linea)',
    shortLabel: 'Weatherboard',
    hex: '#cbd5e1',
    roughness: 0.78,
    metalness: 0.04
  },
  {
    type: 'brick',
    label: 'Brick Veneer',
    shortLabel: 'Brick',
    hex: '#9a4f3f',
    roughness: 0.88,
    metalness: 0.02
  },
  {
    type: 'plaster',
    label: 'Monolithic Plaster / Stucco',
    shortLabel: 'Plaster',
    hex: '#e2ded5',
    roughness: 0.90,
    metalness: 0.02
  },
  {
    type: 'fibre_cement',
    label: 'Fibre Cement Sheet / Panel',
    shortLabel: 'Fibre Cement',
    hex: '#94a3b8',
    roughness: 0.82,
    metalness: 0.05
  },
  {
    type: 'other',
    label: 'Other / Custom Cladding',
    shortLabel: 'Other',
    hex: '#78716c',
    roughness: 0.76,
    metalness: 0.08
  },
  {
    type: 'none',
    label: 'Unassigned / None',
    shortLabel: 'Unassigned',
    hex: '#334155',
    roughness: 0.86,
    metalness: 0.04
  }
];

export function getWallCladdingMeta(type: WallCladdingType): WallCladdingMeta {
  return (
    WALL_CLADDING_OPTIONS.find((opt) => opt.type === type) ||
    WALL_CLADDING_OPTIONS[WALL_CLADDING_OPTIONS.length - 1]
  );
}

/**
 * Sequential spreadsheet-style face code: 0 -> A, 25 -> Z, 26 -> AA, etc.
 */
export function indexToWallCode(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let code = '';
  while (true) {
    code = String.fromCharCode(65 + (n % 26)) + code;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return code;
}

export function buildWallEdgesFromPoints(
  points: Point2D[],
  idPrefix = 'wall-edge'
): WallPlanEdge[] {
  if (points.length < 2) return [];
  const edges: WallPlanEdge[] = [];
  for (let i = 0; i < points.length; i++) {
    const from = points[i];
    const to = points[(i + 1) % points.length];
    if (dist(from, to) < 0.01) continue;
    edges.push({
      id: `${idPrefix}-${i + 1}`,
      from: { x: +from.x.toFixed(3), y: +from.y.toFixed(3) },
      to: { x: +to.x.toFixed(3), y: +to.y.toFixed(3) }
    });
  }
  return edges;
}

interface SegmentCandidate {
  id: string;
  from: Point2D;
  to: Point2D;
  heightM?: number;
  bottomZ?: number;
}

function lineIntersection2D(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): Point2D | null {
  const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(denom) < 1e-7) return null;
  const px =
    ((p1.x * p2.y - p1.y * p2.x) * (p3.x - p4.x) -
      (p1.x - p2.x) * (p3.x * p4.y - p3.y * p4.x)) /
    denom;
  const py =
    ((p1.x * p2.y - p1.y * p2.x) * (p3.y - p4.y) -
      (p1.y - p2.y) * (p3.x * p4.y - p3.y * p4.x)) /
    denom;
  if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
  return { x: px, y: py };
}

/**
 * Safely merges strictly collinear consecutive exterior edges (same direction, < 1 deg deviation,
 * and matching heights if provided). Never collapses across any corner or re-entrant notch return.
 */
function mergeCollinearWallRuns(segments: SegmentCandidate[]): SegmentCandidate[] {
  if (segments.length <= 1) return segments;

  const isCollinearSameDir = (a: SegmentCandidate, b: SegmentCandidate): boolean => {
    if (!pointsClose(a.to, b.from, 0.025)) return false;
    const hMatch =
      a.heightM === undefined ||
      b.heightM === undefined ||
      Math.abs(a.heightM - b.heightM) < 0.02;
    const zMatch =
      a.bottomZ === undefined ||
      b.bottomZ === undefined ||
      Math.abs(a.bottomZ - b.bottomZ) < 0.02;
    if (!hMatch || !zMatch) return false;

    const lenA = dist(a.from, a.to);
    const lenB = dist(b.from, b.to);
    if (lenA < 0.02 || lenB < 0.02) return false;
    const uxA = (a.to.x - a.from.x) / lenA;
    const uyA = (a.to.y - a.from.y) / lenA;
    const uxB = (b.to.x - b.from.x) / lenB;
    const uyB = (b.to.y - b.from.y) / lenB;
    const dot = uxA * uxB + uyA * uyB;
    // Cos(1 deg) ~= 0.999848 — strictly collinear forward continuation only
    return dot >= 0.99985;
  };

  const merged: SegmentCandidate[] = [];
  for (const seg of segments) {
    if (dist(seg.from, seg.to) < 0.05) continue;
    const prev = merged[merged.length - 1];
    if (prev && isCollinearSameDir(prev, seg)) {
      prev.to = { ...seg.to };
    } else {
      merged.push({
        id: seg.id,
        from: { ...seg.from },
        to: { ...seg.to },
        heightM: seg.heightM,
        bottomZ: seg.bottomZ
      });
    }
  }

  // Check wrap-around merge between last and first segment
  if (merged.length > 2 && isCollinearSameDir(merged[merged.length - 1], merged[0])) {
    const first = merged[0];
    const last = merged.pop()!;
    first.from = { ...last.from };
    first.id = last.id;
  }

  return merged;
}

function findMatchingRoofEdgeId(
  from: Point2D,
  to: Point2D,
  roofLevels?: RoofLevel[]
): string | undefined {
  if (!roofLevels || roofLevels.length === 0) return undefined;
  const wallMid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const wallLen = dist(from, to);
  if (wallLen < 0.05) return undefined;
  const wux = (to.x - from.x) / wallLen;
  const wuy = (to.y - from.y) / wallLen;

  let bestEdgeId: string | undefined;
  let bestScore = Infinity;

  for (const lvl of roofLevels) {
    for (const edge of lvl.outline.edges) {
      const sb = computeEdgeSetbackLine(lvl.outline, edge.id);
      const refFrom = sb?.wallFrom || edge.from;
      const refTo = sb?.wallTo || edge.to;
      const eLen = dist(refFrom, refTo);
      if (eLen < 0.05) continue;
      const eux = (refTo.x - refFrom.x) / eLen;
      const euy = (refTo.y - refFrom.y) / eLen;
      const parallelDot = Math.abs(wux * eux + wuy * euy);
      if (parallelDot < 0.96) continue;

      const refMid = { x: (refFrom.x + refTo.x) / 2, y: (refFrom.y + refTo.y) / 2 };
      const rawMid = { x: (edge.from.x + edge.to.x) / 2, y: (edge.from.y + edge.to.y) / 2 };
      const dMid = Math.min(dist(wallMid, refMid), dist(wallMid, rawMid));
      const lenDiff = Math.abs(wallLen - eLen);
      const tolerance = Math.max(0.45, getDefaultEdgeSetbackM(edge) + 0.35);
      if (dMid <= tolerance && lenDiff <= Math.max(0.6, tolerance * 2)) {
        const score = dMid + lenDiff * 0.25;
        if (score < bestScore) {
          bestScore = score;
          bestEdgeId = edge.id;
        }
      }
    }
  }

  return bestEdgeId;
}

function matchExistingFacet(
  from: Point2D,
  to: Point2D,
  existingFacets?: WallFacet[]
): WallFacet | undefined {
  if (!existingFacets || existingFacets.length === 0) return undefined;

  // 1. Exact endpoint match (same or reversed winding)
  const exact = existingFacets.find(
    (f) =>
      (pointsClose(f.from, from, 0.08) && pointsClose(f.to, to, 0.08)) ||
      (pointsClose(f.from, to, 0.08) && pointsClose(f.to, from, 0.08))
  );
  if (exact) return exact;

  // 2. Fallback: collinear direction + very close midpoint (useful when stretching a wall length)
  const len = dist(from, to);
  if (len < 0.05) return undefined;
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };

  return existingFacets.find((f) => {
    const fLen = dist(f.from, f.to);
    if (fLen < 0.05) return false;
    const fux = (f.to.x - f.from.x) / fLen;
    const fuy = (f.to.y - f.from.y) / fLen;
    if (ux * fux + uy * fuy < 0.985) return false;
    const fMid = { x: (f.from.x + f.to.x) / 2, y: (f.from.y + f.to.y) / 2 };
    // Point-to-line distance from mid to f line < 0.06m and midpoints overlap segment range
    const perpDist = Math.abs((mid.x - f.from.x) * -fuy + (mid.y - f.from.y) * fux);
    return perpDist < 0.06 && dist(mid, fMid) < Math.max(len, fLen) * 0.45;
  });
}

/**
 * Ensures an opening sits strictly within facet bounds and meets minimum valid opening sizes.
 */
export function clampWallOpeningToFacet(
  facet: Pick<WallFacet, 'lengthM' | 'heightM'>,
  opening: WallOpening
): WallOpening {
  const maxW = Math.max(0.2, facet.lengthM);
  const maxH = Math.max(0.2, facet.heightM);
  const widthM = +Math.min(maxW, Math.max(0.2, opening.widthM || 0.9)).toFixed(3);
  const heightM = +Math.min(maxH, Math.max(0.2, opening.heightM || 0.9)).toFixed(3);
  const distFromStartM = +Math.min(
    Math.max(0, maxW - widthM),
    Math.max(0, opening.distFromStartM || 0)
  ).toFixed(3);
  const sillHeightM = +Math.min(
    Math.max(0, maxH - heightM),
    Math.max(0, opening.sillHeightM || 0)
  ).toFixed(3);

  return {
    ...opening,
    widthM,
    heightM,
    distFromStartM,
    sillHeightM
  };
}

/**
 * Builds ordered, non-dropped labelled WallFacet[] from any closed floor plan or outline.
 * Every exterior edge (including interior notch / re-entrant returns) generates a facet.
 */
export function buildWallFacetsFromPlan(
  outline:
    | Pick<WallPlan, 'points' | 'edges'>
    | Pick<RoofOutline, 'points' | 'edges'>
    | { points: Point2D[]; edges?: SegmentCandidate[] },
  options?: {
    defaultHeightM?: number;
    defaultBottomZ?: number;
    defaultCladdingType?: WallCladdingType;
    existingFacets?: WallFacet[];
    roofLevels?: RoofLevel[];
    mergeCollinear?: boolean;
  }
): WallFacet[] {
  const defaultHeightM = +(options?.defaultHeightM ?? 2.7).toFixed(3);
  const defaultBottomZ = +(options?.defaultBottomZ ?? 0).toFixed(3);
  const defaultCladding = options?.defaultCladdingType ?? 'none';
  const mergeCollinear = options?.mergeCollinear ?? true;

  let rawSegments: SegmentCandidate[] = [];
  if (outline.edges && outline.edges.length >= 3) {
    rawSegments = outline.edges.map((e, idx) => ({
      id: e.id || `wall-seg-${idx + 1}`,
      from: { x: +e.from.x.toFixed(3), y: +e.from.y.toFixed(3) },
      to: { x: +e.to.x.toFixed(3), y: +e.to.y.toFixed(3) },
      heightM: 'eaveHeightM' in e && typeof e.eaveHeightM === 'number' ? e.eaveHeightM : undefined,
      bottomZ: 'wallBottomZ' in e && typeof e.wallBottomZ === 'number' ? e.wallBottomZ : undefined
    }));
  } else if (outline.points && outline.points.length >= 3) {
    const pts = outline.points;
    for (let i = 0; i < pts.length; i++) {
      const from = pts[i];
      const to = pts[(i + 1) % pts.length];
      if (dist(from, to) < 0.05) continue;
      rawSegments.push({
        id: `wall-seg-${i + 1}`,
        from: { x: +from.x.toFixed(3), y: +from.y.toFixed(3) },
        to: { x: +to.x.toFixed(3), y: +to.y.toFixed(3) }
      });
    }
  }

  rawSegments = rawSegments.filter((s) => dist(s.from, s.to) >= 0.05);
  if (rawSegments.length === 0) return [];

  const runs = mergeCollinear ? mergeCollinearWallRuns(rawSegments) : rawSegments;

  return runs.map((seg, idx) => {
    const prev = matchExistingFacet(seg.from, seg.to, options?.existingFacets);
    const lengthM = +dist(seg.from, seg.to).toFixed(3);
    const heightM = +(prev?.heightM ?? seg.heightM ?? defaultHeightM).toFixed(3);
    const bottomZ = +(prev?.bottomZ ?? seg.bottomZ ?? defaultBottomZ).toFixed(3);
    const topZ = +(bottomZ + heightM).toFixed(3);
    const code = indexToWallCode(idx);

    const facetBase = {
      lengthM,
      heightM
    };
    const openings = (prev?.openings || []).map((op) => clampWallOpeningToFacet(facetBase, op));

    return {
      id: prev?.id || `wall-facet-${idx + 1}`,
      code,
      name: prev?.name || `Wall ${code}`,
      from: seg.from,
      to: seg.to,
      lengthM,
      heightM,
      bottomZ,
      topZ,
      claddingType: prev?.claddingType ?? defaultCladding,
      openings,
      roofEdgeId: prev?.roofEdgeId ?? findMatchingRoofEdgeId(seg.from, seg.to, options?.roofLevels)
    };
  });
}

/**
 * Derives a single-storey WallPlan directly from the primary roof footprint
 * using each roof edge's eave setback when defined.
 */
export function deriveWallPlanFromRoofLevels(
  levels: RoofLevel[],
  defaultHeightM = 2.7,
  existingFacets?: WallFacet[]
): WallPlan | null {
  const baseLevel = levels.find((l) => l.outline.points.length >= 3);
  if (!baseLevel) return null;

  const outline = baseLevel.outline;
  const edges = outline.edges;
  const hM = +(baseLevel.eaveHeightM || defaultHeightM).toFixed(3);

  let wallPoints: Point2D[] = [];
  if (edges.length >= 3) {
    const setbackLines = edges.map((edge) => {
      const sb = isEdgeWallEnabled(edge)
        ? computeEdgeSetbackLine(outline, edge.id)
        : computeEdgeSetbackLine(outline, edge.id, 0);
      return {
        from: sb?.wallFrom || edge.from,
        to: sb?.wallTo || edge.to,
        setback: sb?.eaveSetbackM ?? 0
      };
    });

    const cornerPts: Point2D[] = [];
    for (let i = 0; i < setbackLines.length; i++) {
      const prev = setbackLines[(i - 1 + setbackLines.length) % setbackLines.length];
      const curr = setbackLines[i];
      if (prev.setback < 0.01 && curr.setback < 0.01) {
        cornerPts.push({ ...outline.points[i % outline.points.length] });
      } else {
        const inter = lineIntersection2D(prev.from, prev.to, curr.from, curr.to);
        const origCorner = outline.points[i % outline.points.length] || curr.from;
        const maxMiter = Math.max(prev.setback, curr.setback) * 3 + 0.5;
        if (inter && dist(inter, origCorner) <= maxMiter) {
          cornerPts.push({ x: +inter.x.toFixed(3), y: +inter.y.toFixed(3) });
        } else {
          cornerPts.push({ x: +curr.from.x.toFixed(3), y: +curr.from.y.toFixed(3) });
        }
      }
    }
    wallPoints = cornerPts;
  } else {
    wallPoints = outline.points.map((p) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) }));
  }

  const wallEdges = buildWallEdgesFromPoints(wallPoints, 'wall-edge');
  const facets = buildWallFacetsFromPlan(
    { points: wallPoints, edges: wallEdges },
    {
      defaultHeightM: hM,
      existingFacets,
      roofLevels: levels
    }
  );

  return {
    points: wallPoints,
    edges: wallEdges,
    defaultHeightM: hM,
    facets,
    builtAt: new Date().toISOString()
  };
}

/**
 * Updates one wall plan edge length (shifting target vertex + subsequent vertices proportionally or directly along edge ray)
 * and preserves facet details.
 */
export function updateWallPlanEdgeLength(
  plan: WallPlan,
  edgeId: string,
  newLengthM: number,
  roofLevels?: RoofLevel[]
): WallPlan {
  if (!Number.isFinite(newLengthM) || newLengthM < 0.1 || plan.edges.length < 3) return plan;
  const edgeIdx = plan.edges.findIndex((e) => e.id === edgeId);
  if (edgeIdx < 0) return plan;

  const targetEdge = plan.edges[edgeIdx];
  const curLen = dist(targetEdge.from, targetEdge.to);
  if (curLen < 0.02) return plan;

  const ux = (targetEdge.to.x - targetEdge.from.x) / curLen;
  const uy = (targetEdge.to.y - targetEdge.from.y) / curLen;
  const nextEndIdx = (edgeIdx + 1) % plan.points.length;

  const updatedPoints = plan.points.map((pt, idx) =>
    idx === nextEndIdx
      ? {
          x: +(targetEdge.from.x + ux * newLengthM).toFixed(3),
          y: +(targetEdge.from.y + uy * newLengthM).toFixed(3)
        }
      : { ...pt }
  );

  const updatedEdges = buildWallEdgesFromPoints(updatedPoints, 'wall-edge');
  const updatedFacets = buildWallFacetsFromPlan(
    { points: updatedPoints, edges: updatedEdges },
    {
      defaultHeightM: plan.defaultHeightM,
      existingFacets: plan.facets,
      roofLevels
    }
  );

  return {
    ...plan,
    points: updatedPoints,
    edges: updatedEdges,
    facets: updatedFacets,
    builtAt: new Date().toISOString()
  };
}

/**
 * Moves a wall plan corner vertex and rebuilds edges & facets while preserving openings and cladding choices.
 */
export function moveWallPlanVertex(
  plan: WallPlan,
  vertexIdx: number,
  newPt: Point2D,
  roofLevels?: RoofLevel[]
): WallPlan {
  if (vertexIdx < 0 || vertexIdx >= plan.points.length) return plan;
  const updatedPoints = plan.points.map((pt, idx) =>
    idx === vertexIdx ? { x: +newPt.x.toFixed(3), y: +newPt.y.toFixed(3) } : { ...pt }
  );
  const updatedEdges = buildWallEdgesFromPoints(updatedPoints, 'wall-edge');
  const updatedFacets = buildWallFacetsFromPlan(
    { points: updatedPoints, edges: updatedEdges },
    {
      defaultHeightM: plan.defaultHeightM,
      existingFacets: plan.facets,
      roofLevels
    }
  );
  return {
    ...plan,
    points: updatedPoints,
    edges: updatedEdges,
    facets: updatedFacets,
    builtAt: new Date().toISOString()
  };
}

export function createDefaultWallOpening(
  facet: WallFacet,
  type: WallOpeningType,
  distFromStartM?: number
): WallOpening {
  const defaults: Record<
    WallOpeningType,
    { w: number; h: number; sill: number; label: string }
  > = {
    window: { w: 1.5, h: 1.2, sill: 0.9, label: 'Window' },
    door: { w: 0.92, h: 2.1, sill: 0, label: 'Entry Door' },
    garage: { w: 2.4, h: 2.1, sill: 0, label: 'Garage Door' },
    void: { w: 1.0, h: 1.0, sill: 0.8, label: 'Void' }
  };
  const spec = defaults[type];
  const widthM = Math.min(spec.w, Math.max(0.3, facet.lengthM - 0.2));
  const heightM = Math.min(spec.h, Math.max(0.3, facet.heightM));
  const sillHeightM = Math.min(spec.sill, Math.max(0, facet.heightM - heightM));

  // Place cleanly beside existing openings when distFromStartM is not explicitly provided
  let startU = distFromStartM;
  if (startU === undefined) {
    if (facet.openings.length === 0) {
      startU = Math.max(0, (facet.lengthM - widthM) / 2);
    } else {
      const sorted = [...facet.openings].sort((a, b) => a.distFromStartM - b.distFromStartM);
      const last = sorted[sorted.length - 1];
      const afterLast = last.distFromStartM + last.widthM + 0.35;
      startU = afterLast + widthM <= facet.lengthM ? afterLast : 0.25;
    }
  }

  return clampWallOpeningToFacet(facet, {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    distFromStartM: +startU.toFixed(3),
    sillHeightM: +sillHeightM.toFixed(3),
    widthM: +widthM.toFixed(3),
    heightM: +heightM.toFixed(3),
    label: `${spec.label} ${facet.openings.length + 1}`
  });
}

export interface WallFacetMetrics {
  grossAreaM2: number;
  openingsAreaM2: number;
  netCladdingAreaM2: number;
  openingsCount: number;
}

/**
 * Exact vertical-strip sweep union area for openings so overlapping edits never over-deduct area.
 */
function computeOpeningsUnionArea(facet: WallFacet): number {
  const clamped = facet.openings
    .map((o) => clampWallOpeningToFacet(facet, o))
    .filter((o) => o.widthM > 0.01 && o.heightM > 0.01);
  if (clamped.length === 0) return 0;

  const xs = new Set<number>();
  clamped.forEach((o) => {
    xs.add(o.distFromStartM);
    xs.add(o.distFromStartM + o.widthM);
  });
  const sortedX = Array.from(xs).sort((a, b) => a - b);

  let area = 0;
  for (let i = 0; i < sortedX.length - 1; i++) {
    const x0 = sortedX[i];
    const x1 = sortedX[i + 1];
    const dx = x1 - x0;
    if (dx <= 1e-6) continue;
    const midX = (x0 + x1) / 2;

    const yIntervals = clamped
      .filter((o) => o.distFromStartM <= midX && o.distFromStartM + o.widthM >= midX)
      .map((o) => [o.sillHeightM, o.sillHeightM + o.heightM] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    let coveredY = 0;
    let curStart = -1;
    let curEnd = -1;
    for (const [y0, y1] of yIntervals) {
      if (y0 > curEnd) {
        if (curEnd > curStart) coveredY += curEnd - curStart;
        curStart = y0;
        curEnd = y1;
      } else if (y1 > curEnd) {
        curEnd = y1;
      }
    }
    if (curEnd > curStart) coveredY += curEnd - curStart;
    area += dx * coveredY;
  }

  return +area.toFixed(3);
}

export function computeWallFacetMetrics(facet: WallFacet): WallFacetMetrics {
  const grossAreaM2 = +(Math.max(0, facet.lengthM) * Math.max(0, facet.heightM)).toFixed(2);
  const rawOpeningsArea = computeOpeningsUnionArea(facet);
  const openingsAreaM2 = +Math.min(grossAreaM2, rawOpeningsArea).toFixed(2);
  const netCladdingAreaM2 = +Math.max(0, grossAreaM2 - openingsAreaM2).toFixed(2);
  return {
    grossAreaM2,
    openingsAreaM2,
    netCladdingAreaM2,
    openingsCount: facet.openings.length
  };
}

export interface WallCladdingGroupSummary {
  claddingType: WallCladdingType;
  label: string;
  shortLabel: string;
  hex: string;
  faceCount: number;
  faceCodes: string[];
  linealM: number;
  grossAreaM2: number;
  openingsAreaM2: number;
  netAreaM2: number;
  openingsCount: number;
}

export interface WallTakeoffSummary {
  totalFaces: number;
  detailedFacesCount: number;
  undetailedCount: number;
  totalLinealM: number;
  totalGrossAreaM2: number;
  totalOpeningsAreaM2: number;
  totalNetAreaM2: number;
  totalOpeningsCount: number;
  byCladding: WallCladdingGroupSummary[];
}

export function computeWallTakeoffSummary(facets: WallFacet[]): WallTakeoffSummary {
  const groupMap = new Map<WallCladdingType, WallCladdingGroupSummary>();
  let totalLinealM = 0;
  let totalGrossAreaM2 = 0;
  let totalOpeningsAreaM2 = 0;
  let totalNetAreaM2 = 0;
  let totalOpeningsCount = 0;
  let undetailedCount = 0;

  facets.forEach((f) => {
    const m = computeWallFacetMetrics(f);
    totalLinealM += f.lengthM;
    totalGrossAreaM2 += m.grossAreaM2;
    totalOpeningsAreaM2 += m.openingsAreaM2;
    totalNetAreaM2 += m.netCladdingAreaM2;
    totalOpeningsCount += m.openingsCount;
    if (f.claddingType === 'none') {
      undetailedCount++;
    }

    const meta = getWallCladdingMeta(f.claddingType);
    const existing = groupMap.get(f.claddingType);
    if (existing) {
      existing.faceCount += 1;
      existing.faceCodes.push(f.code);
      existing.linealM = +(existing.linealM + f.lengthM).toFixed(2);
      existing.grossAreaM2 = +(existing.grossAreaM2 + m.grossAreaM2).toFixed(2);
      existing.openingsAreaM2 = +(existing.openingsAreaM2 + m.openingsAreaM2).toFixed(2);
      existing.netAreaM2 = +(existing.netAreaM2 + m.netCladdingAreaM2).toFixed(2);
      existing.openingsCount += m.openingsCount;
    } else {
      groupMap.set(f.claddingType, {
        claddingType: f.claddingType,
        label: meta.label,
        shortLabel: meta.shortLabel,
        hex: meta.hex,
        faceCount: 1,
        faceCodes: [f.code],
        linealM: +f.lengthM.toFixed(2),
        grossAreaM2: m.grossAreaM2,
        openingsAreaM2: m.openingsAreaM2,
        netAreaM2: m.netCladdingAreaM2,
        openingsCount: m.openingsCount
      });
    }
  });

  const orderMap = new Map(WALL_CLADDING_OPTIONS.map((o, idx) => [o.type, idx]));
  const byCladding = Array.from(groupMap.values()).sort(
    (a, b) => (orderMap.get(a.claddingType) ?? 99) - (orderMap.get(b.claddingType) ?? 99)
  );

  return {
    totalFaces: facets.length,
    detailedFacesCount: facets.length - undetailedCount,
    undetailedCount,
    totalLinealM: +totalLinealM.toFixed(2),
    totalGrossAreaM2: +totalGrossAreaM2.toFixed(2),
    totalOpeningsAreaM2: +totalOpeningsAreaM2.toFixed(2),
    totalNetAreaM2: +totalNetAreaM2.toFixed(2),
    totalOpeningsCount,
    byCladding
  };
}
