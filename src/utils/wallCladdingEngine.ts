import {
  EdgeType,
  PlanEdge,
  Point2D,
  RoofLevel,
  RoofOutline,
  RoofPlane,
  WallCladdingRegion,
  WallCladdingType,
  WallElevationUnderlay,
  WallFacet,
  WallOpening,
  WallOpeningType,
  WallPlan,
  WallPlanEdge,
  WallRoofProfilePoint
} from '../types/exactRoofing';
import {
  computeEdgeSetbackLine,
  deriveRoofWallSegments,
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

function findExactExistingFacet(
  from: Point2D,
  to: Point2D,
  existingFacets: WallFacet[] | undefined,
  usedExistingIds: Set<string>
): WallFacet | undefined {
  if (!existingFacets || existingFacets.length === 0) return undefined;
  return existingFacets.find(
    (f) =>
      !usedExistingIds.has(f.id) &&
      ((pointsClose(f.from, from, 0.08) && pointsClose(f.to, to, 0.08)) ||
        (pointsClose(f.from, to, 0.08) && pointsClose(f.to, from, 0.08)))
  );
}

function findCollinearExistingFacet(
  from: Point2D,
  to: Point2D,
  existingFacets: WallFacet[] | undefined,
  usedExistingIds: Set<string>
): WallFacet | undefined {
  if (!existingFacets || existingFacets.length === 0) return undefined;
  const len = dist(from, to);
  if (len < 0.05) return undefined;
  const ux = (to.x - from.x) / len;
  const uy = (to.y - from.y) / len;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };

  return existingFacets.find((f) => {
    if (usedExistingIds.has(f.id)) return false;
    const fLen = dist(f.from, f.to);
    if (fLen < 0.05) return false;
    const fux = (f.to.x - f.from.x) / fLen;
    const fuy = (f.to.y - f.from.y) / fLen;
    if (ux * fux + uy * fuy < 0.985) return false;
    const fMid = { x: (f.from.x + f.to.x) / 2, y: (f.from.y + f.to.y) / 2 };
    const perpDist = Math.abs((mid.x - f.from.x) * -fuy + (mid.y - f.from.y) * fux);
    return perpDist < 0.06 && dist(mid, fMid) < Math.max(len, fLen) * 0.45;
  });
}

function allocateUniqueFacetId(
  preferredId: string | undefined,
  idx: number,
  usedIds: Set<string>
): string {
  if (preferredId && !usedIds.has(preferredId)) {
    usedIds.add(preferredId);
    return preferredId;
  }
  let counter = idx + 1;
  let candidate = `wall-facet-${counter}`;
  while (usedIds.has(candidate)) {
    counter += 1;
    candidate = `wall-facet-${counter}`;
  }
  usedIds.add(candidate);
  return candidate;
}

/**
 * Repairs any duplicate WallFacet IDs (e.g. legacy snapshots) deterministically.
 */
export function ensureUniqueWallFacetIds(facets: WallFacet[]): WallFacet[] {
  const used = new Set<string>();
  return facets.map((facet, idx) => {
    const id = allocateUniqueFacetId(facet.id, idx, used);
    return id === facet.id ? facet : { ...facet, id };
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
    defaultHeightSource?: 'roof' | 'manual';
    defaultCladdingType?: WallCladdingType;
    existingFacets?: WallFacet[];
    roofLevels?: RoofLevel[];
    mergeCollinear?: boolean;
  }
): WallFacet[] {
  const defaultHeightM = +(options?.defaultHeightM ?? 2.7).toFixed(3);
  const defaultBottomZ = +(options?.defaultBottomZ ?? 0).toFixed(3);
  const defaultHeightSource = options?.defaultHeightSource ?? 'manual';
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

  // Two-pass matching so exact endpoint matches claim their existing facets before collinear fallbacks,
  // and no existing facet (e.g. 'wall-facet-2') can ever be assigned to two runs.
  const usedExistingIds = new Set<string>();
  const matchedByRunIdx: (WallFacet | undefined)[] = runs.map((seg) => {
    const exact = findExactExistingFacet(seg.from, seg.to, options?.existingFacets, usedExistingIds);
    if (exact) usedExistingIds.add(exact.id);
    return exact;
  });
  runs.forEach((seg, idx) => {
    if (matchedByRunIdx[idx]) return;
    const fallback = findCollinearExistingFacet(
      seg.from,
      seg.to,
      options?.existingFacets,
      usedExistingIds
    );
    if (fallback) {
      usedExistingIds.add(fallback.id);
      matchedByRunIdx[idx] = fallback;
    }
  });

  // Reserve all matched IDs up front so an earlier unmatched index cannot mint `wall-facet-N`
  // that collides with a later segment's preserved `wall-facet-N`.
  const usedIds = new Set<string>();
  matchedByRunIdx.forEach((prev) => {
    if (prev?.id && !usedIds.has(prev.id)) {
      usedIds.add(prev.id);
    }
  });
  const allocatedIds: string[] = matchedByRunIdx.map((prev, idx) => {
    if (prev?.id) return prev.id;
    let counter = idx + 1;
    let candidate = `wall-facet-${counter}`;
    while (usedIds.has(candidate)) {
      counter += 1;
      candidate = `wall-facet-${counter}`;
    }
    usedIds.add(candidate);
    return candidate;
  });

  // Final defensive pass guarantees strictly unique IDs even if existingFacets itself had duplicates.
  const finalSeen = new Set<string>();

  return runs.map((seg, idx) => {
    const prev = matchedByRunIdx[idx];
    const id = allocateUniqueFacetId(allocatedIds[idx], idx, finalSeen);
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
    const regions = prev?.regions
      ? prev.regions.map((r) => clampWallRegionToFacet(facetBase, r))
      : undefined;

    return {
      id,
      code,
      name: prev?.name || `Wall ${code}`,
      from: seg.from,
      to: seg.to,
      lengthM,
      heightM,
      bottomZ,
      topZ,
      heightSource: prev?.heightSource ?? defaultHeightSource,
      roofProfile: prev?.roofProfile,
      claddingType: prev?.claddingType ?? defaultCladding,
      openings,
      regions,
      underlay: prev?.underlay ?? null,
      roofEdgeId: prev?.roofEdgeId ?? findMatchingRoofEdgeId(seg.from, seg.to, options?.roofLevels)
    };
  });
}

/**
 * Derives a single-storey WallPlan directly from the primary roof footprint
 * using each roof edge's eave setback when defined, and links tops to roof eaves.
 */
export function deriveWallPlanFromRoofLevels(
  levels: RoofLevel[],
  defaultHeightM = 2.7,
  existingFacets?: WallFacet[],
  roofPlanes?: RoofPlane[]
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
  const rawFacets = buildWallFacetsFromPlan(
    { points: wallPoints, edges: wallEdges },
    {
      defaultHeightM: hM,
      defaultHeightSource: 'roof',
      existingFacets,
      roofLevels: levels
    }
  );

  const plan: WallPlan = {
    points: wallPoints,
    edges: wallEdges,
    defaultHeightM: hM,
    facets: rawFacets,
    builtAt: new Date().toISOString()
  };

  return syncWallPlanWithRoof(plan, levels, roofPlanes);
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

export function clampWallRegionToFacet(
  facet: Pick<WallFacet, 'lengthM' | 'heightM'>,
  region: WallCladdingRegion
): WallCladdingRegion {
  const L = Math.max(0.2, facet.lengthM);
  const H = Math.max(0.2, facet.heightM);
  const uStartM = +Math.max(0, Math.min(L - 0.1, region.uStartM || 0)).toFixed(3);
  const uEndM = +Math.max(uStartM + 0.1, Math.min(L, region.uEndM || L)).toFixed(3);
  const vStartM = +Math.max(0, Math.min(H - 0.1, region.vStartM || 0)).toFixed(3);
  const vEndM = +Math.max(vStartM + 0.1, Math.min(H, region.vEndM || H)).toFixed(3);
  return {
    ...region,
    uStartM,
    uEndM,
    vStartM,
    vEndM
  };
}

export function createHorizontalDadoSplit(
  facet: WallFacet,
  splitHeightM = 1.2,
  lowerCladding?: WallCladdingType,
  upperCladding?: WallCladdingType
): WallCladdingRegion[] {
  const H = Math.max(0.6, facet.heightM);
  const splitV = +Math.max(0.3, Math.min(H - 0.3, splitHeightM)).toFixed(3);
  const baseCladding = facet.claddingType !== 'none' ? facet.claddingType : 'brick';
  const lowType = lowerCladding ?? baseCladding;
  const upType = upperCladding ?? (lowType === 'weatherboard' ? 'profiled_metal' : 'weatherboard');
  return [
    {
      id: `reg-low-${Date.now().toString(36)}`,
      label: 'Lower Dado',
      claddingType: lowType,
      uStartM: 0,
      uEndM: +facet.lengthM.toFixed(3),
      vStartM: 0,
      vEndM: splitV
    },
    {
      id: `reg-up-${Date.now().toString(36)}`,
      label: 'Upper Wall',
      claddingType: upType,
      uStartM: 0,
      uEndM: +facet.lengthM.toFixed(3),
      vStartM: splitV,
      vEndM: +H.toFixed(3)
    }
  ];
}

export function createVerticalBaySplit(
  facet: WallFacet,
  splitUM?: number,
  leftCladding?: WallCladdingType,
  rightCladding?: WallCladdingType
): WallCladdingRegion[] {
  const L = Math.max(0.6, facet.lengthM);
  const splitU = +Math.max(0.3, Math.min(L - 0.3, splitUM ?? L * 0.5)).toFixed(3);
  const baseCladding = facet.claddingType !== 'none' ? facet.claddingType : 'weatherboard';
  const leftType = leftCladding ?? baseCladding;
  const rightType = rightCladding ?? (leftType === 'profiled_metal' ? 'weatherboard' : 'profiled_metal');
  return [
    {
      id: `reg-left-${Date.now().toString(36)}`,
      label: 'Bay 1',
      claddingType: leftType,
      uStartM: 0,
      uEndM: splitU,
      vStartM: 0,
      vEndM: +facet.heightM.toFixed(3)
    },
    {
      id: `reg-right-${Date.now().toString(36)}`,
      label: 'Bay 2',
      claddingType: rightType,
      uStartM: splitU,
      uEndM: +L.toFixed(3),
      vStartM: 0,
      vEndM: +facet.heightM.toFixed(3)
    }
  ];
}

export function isWallFacetUndetailed(facet: WallFacet): boolean {
  if (facet.regions && facet.regions.length > 0) {
    return facet.regions.every((r) => r.claddingType === 'none');
  }
  return facet.claddingType === 'none';
}

export function getFacetPrimaryDisplayCladding(facet: WallFacet): WallCladdingType {
  if (facet.regions && facet.regions.length > 0) {
    const firstAssigned = facet.regions.find((r) => r.claddingType !== 'none');
    if (firstAssigned) return firstAssigned.claddingType;
  }
  return facet.claddingType;
}

export interface WallFacetRegionMetric {
  regionId?: string;
  label?: string;
  claddingType: WallCladdingType;
  uStartM: number;
  uEndM: number;
  vStartM: number;
  vEndM: number;
  grossAreaM2: number;
  openingsAreaM2: number;
  netAreaM2: number;
}

export interface WallFacetMetrics {
  grossAreaM2: number;
  openingsAreaM2: number;
  netCladdingAreaM2: number;
  openingsCount: number;
  regionBreakdown: WallFacetRegionMetric[];
}

/**
 * Exact vertical-strip sweep union area for openings clipped inside any rectangle [u0..u1] x [v0..v1]
 * so overlapping edits and mixed-cladding regions never over-deduct or double-count area.
 */
function computeOpeningsUnionAreaInRect(
  facet: WallFacet,
  u0: number,
  u1: number,
  v0: number,
  v1: number
): number {
  const rectW = u1 - u0;
  const rectH = v1 - v0;
  if (rectW <= 1e-4 || rectH <= 1e-4) return 0;

  const clamped = facet.openings
    .map((o) => clampWallOpeningToFacet(facet, o))
    .map((o) => ({
      x0: Math.max(u0, o.distFromStartM),
      x1: Math.min(u1, o.distFromStartM + o.widthM),
      y0: Math.max(v0, o.sillHeightM),
      y1: Math.min(v1, o.sillHeightM + o.heightM)
    }))
    .filter((r) => r.x1 - r.x0 > 0.001 && r.y1 - r.y0 > 0.001);

  if (clamped.length === 0) return 0;

  const xs = new Set<number>();
  clamped.forEach((r) => {
    xs.add(r.x0);
    xs.add(r.x1);
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
      .filter((r) => r.x0 <= midX && r.x1 >= midX)
      .map((r) => [r.y0, r.y1] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    let coveredY = 0;
    let curStart = -1;
    let curEnd = -1;
    for (const [ya, yb] of yIntervals) {
      if (ya > curEnd) {
        if (curEnd > curStart) coveredY += curEnd - curStart;
        curStart = ya;
        curEnd = yb;
      } else if (yb > curEnd) {
        curEnd = yb;
      }
    }
    if (curEnd > curStart) coveredY += curEnd - curStart;
    area += dx * coveredY;
  }

  return +area.toFixed(4);
}

export function computeWallFacetMetrics(facet: WallFacet): WallFacetMetrics {
  const L = Math.max(0, facet.lengthM);
  const H = Math.max(0, facet.heightM);
  const grossAreaM2 = +(L * H).toFixed(2);
  const rawOpeningsArea = computeOpeningsUnionAreaInRect(facet, 0, L, 0, H);
  const openingsAreaM2 = +Math.min(grossAreaM2, rawOpeningsArea).toFixed(2);
  const netCladdingAreaM2 = +Math.max(0, grossAreaM2 - openingsAreaM2).toFixed(2);

  let regionBreakdown: WallFacetRegionMetric[];
  if (facet.regions && facet.regions.length > 0 && L > 0.01 && H > 0.01) {
    const clampedRegions = facet.regions.slice(0, 3).map((r) => clampWallRegionToFacet(facet, r));
    regionBreakdown = clampedRegions.map((r) => {
      const rGross = +(Math.max(0, r.uEndM - r.uStartM) * Math.max(0, r.vEndM - r.vStartM)).toFixed(3);
      const rOp = +Math.min(
        rGross,
        computeOpeningsUnionAreaInRect(facet, r.uStartM, r.uEndM, r.vStartM, r.vEndM)
      ).toFixed(3);
      const rNet = +Math.max(0, rGross - rOp).toFixed(3);
      return {
        regionId: r.id,
        label: r.label,
        claddingType: r.claddingType,
        uStartM: r.uStartM,
        uEndM: r.uEndM,
        vStartM: r.vStartM,
        vEndM: r.vEndM,
        grossAreaM2: +rGross.toFixed(2),
        openingsAreaM2: +rOp.toFixed(2),
        netAreaM2: +rNet.toFixed(2)
      };
    });

    // Account for any uncovered wall margin under facet.claddingType if custom regions leave a gap
    const coveredGross = regionBreakdown.reduce((s, r) => s + r.grossAreaM2, 0);
    const uncoveredGross = +(grossAreaM2 - coveredGross).toFixed(2);
    if (uncoveredGross > 0.05) {
      const coveredOp = regionBreakdown.reduce((s, r) => s + r.openingsAreaM2, 0);
      const remOp = +Math.max(0, openingsAreaM2 - coveredOp).toFixed(2);
      regionBreakdown.push({
        label: 'Remainder',
        claddingType: facet.claddingType,
        uStartM: 0,
        uEndM: L,
        vStartM: 0,
        vEndM: H,
        grossAreaM2: uncoveredGross,
        openingsAreaM2: Math.min(uncoveredGross, remOp),
        netAreaM2: +Math.max(0, uncoveredGross - Math.min(uncoveredGross, remOp)).toFixed(2)
      });
    }
  } else {
    regionBreakdown = [
      {
        claddingType: facet.claddingType,
        uStartM: 0,
        uEndM: L,
        vStartM: 0,
        vEndM: H,
        grossAreaM2,
        openingsAreaM2,
        netAreaM2: netCladdingAreaM2
      }
    ];
  }

  return {
    grossAreaM2,
    openingsAreaM2,
    netCladdingAreaM2,
    openingsCount: facet.openings.length,
    regionBreakdown
  };
}

/**
 * Resolves vertical eave height & optional raked gable profile from matching roof edge / planes.
 */
export function resolveRoofTopForWallFacet(
  facet: WallFacet,
  roofLevels: RoofLevel[],
  roofPlanes: RoofPlane[] = []
): {
  roofEdgeId?: string;
  topZ: number;
  heightM: number;
  roofProfile?: WallRoofProfilePoint[];
} | null {
  if (!roofLevels || roofLevels.length === 0) return null;

  const matchedEdgeId =
    facet.roofEdgeId ?? findMatchingRoofEdgeId(facet.from, facet.to, roofLevels);
  if (!matchedEdgeId) return null;

  const wallSegments = deriveRoofWallSegments(roofLevels, roofPlanes);
  const segMatch = wallSegments.find((w) => w.edgeId === matchedEdgeId);

  let rawTopZ: number | null = null;
  let profile: WallRoofProfilePoint[] | undefined;

  if (segMatch) {
    rawTopZ = segMatch.topZ;
    if (segMatch.topProfilePoints3D && segMatch.topProfilePoints3D.length >= 2) {
      const segDx = segMatch.wallTo.x - segMatch.wallFrom.x;
      const segDy = segMatch.wallTo.y - segMatch.wallFrom.y;
      const segLen = Math.hypot(segDx, segDy) || 1;
      const wDx = facet.to.x - facet.from.x;
      const wDy = facet.to.y - facet.from.y;
      const wLen = Math.hypot(wDx, wDy) || 1;
      const dirDot = (segDx / segLen) * (wDx / wLen) + (segDy / segLen) * (wDy / wLen);

      const pts = segMatch.topProfilePoints3D
        .map((tp) => {
          const dFromStart =
            dirDot >= 0
              ? Math.hypot(tp.x - segMatch.wallFrom.x, tp.y - segMatch.wallFrom.y)
              : segLen - Math.hypot(tp.x - segMatch.wallFrom.x, tp.y - segMatch.wallFrom.y);
          const distM = +Math.max(
            0,
            Math.min(facet.lengthM, (dFromStart / segLen) * facet.lengthM)
          ).toFixed(3);
          const tuckedTopZ = +Math.max(facet.bottomZ + 0.4, tp.z - 0.025).toFixed(3);
          return { distM, topZ: tuckedTopZ };
        })
        .sort((a, b) => a.distM - b.distM);

      const minZ = Math.min(...pts.map((p) => p.topZ));
      const maxZ = Math.max(...pts.map((p) => p.topZ));
      if (maxZ - minZ > 0.04) {
        profile = pts;
      }
      rawTopZ = minZ;
    }
  } else {
    for (const lvl of roofLevels) {
      const edge = lvl.outline.edges.find((e) => e.id === matchedEdgeId);
      if (edge) {
        const planeMatch = roofPlanes.find((p) => p.eaveEdgeId === edge.id);
        rawTopZ = edge.eaveHeightM ?? planeMatch?.eaveHeightM ?? lvl.eaveHeightM ?? 2.7;
        break;
      }
    }
  }

  if (rawTopZ === null || !Number.isFinite(rawTopZ)) return null;

  const tuckedTopZ = profile
    ? +Math.max(...profile.map((p) => p.topZ)).toFixed(3)
    : +Math.max(facet.bottomZ + 0.4, rawTopZ - 0.025).toFixed(3);
  const heightM = +Math.max(0.4, tuckedTopZ - facet.bottomZ).toFixed(3);

  return {
    roofEdgeId: matchedEdgeId,
    topZ: +(facet.bottomZ + heightM).toFixed(3),
    heightM,
    roofProfile: profile
  };
}

export function fitWallFacetTopToRoof(
  facet: WallFacet,
  roofLevels: RoofLevel[],
  roofPlanes: RoofPlane[] = []
): WallFacet {
  const resolved = resolveRoofTopForWallFacet(facet, roofLevels, roofPlanes);
  if (!resolved) return facet;
  const nextBase = { lengthM: facet.lengthM, heightM: resolved.heightM };
  return {
    ...facet,
    roofEdgeId: resolved.roofEdgeId ?? facet.roofEdgeId,
    heightSource: 'roof',
    heightM: resolved.heightM,
    topZ: resolved.topZ,
    roofProfile: resolved.roofProfile,
    openings: facet.openings.map((op) => clampWallOpeningToFacet(nextBase, op)),
    regions: facet.regions
      ? facet.regions.map((r) => clampWallRegionToFacet(nextBase, r))
      : undefined
  };
}

export function syncWallPlanWithRoof(
  wallPlan: WallPlan,
  roofLevels: RoofLevel[],
  roofPlanes: RoofPlane[] = [],
  options?: { forceAllLinked?: boolean }
): WallPlan {
  if (!wallPlan || !roofLevels || roofLevels.length === 0) return wallPlan;
  let changed = false;
  const nextFacets = wallPlan.facets.map((facet) => {
    const matchedId =
      facet.roofEdgeId ?? findMatchingRoofEdgeId(facet.from, facet.to, roofLevels);
    const shouldSync =
      options?.forceAllLinked
        ? Boolean(matchedId)
        : facet.heightSource === 'roof' && Boolean(matchedId);
    if (!shouldSync) {
      if (matchedId && matchedId !== facet.roofEdgeId) {
        changed = true;
        return { ...facet, roofEdgeId: matchedId };
      }
      return facet;
    }
    const fitted = fitWallFacetTopToRoof(
      { ...facet, roofEdgeId: matchedId },
      roofLevels,
      roofPlanes
    );
    if (
      fitted.heightM !== facet.heightM ||
      fitted.topZ !== facet.topZ ||
      fitted.roofEdgeId !== facet.roofEdgeId ||
      JSON.stringify(fitted.roofProfile || null) !== JSON.stringify(facet.roofProfile || null)
    ) {
      changed = true;
    }
    return fitted;
  });

  if (!changed) return wallPlan;
  return {
    ...wallPlan,
    facets: nextFacets,
    builtAt: new Date().toISOString()
  };
}

/**
 * Computes real-world image dimensions (m) on a wall elevation from two normalized [0..1] clicks.
 */
export function calibrateUnderlayFromTwoPoints(params: {
  imageAspect: number;
  p1Norm: Point2D;
  p2Norm: Point2D;
  knownDistanceM: number;
  facetLengthM: number;
  facetHeightM: number;
}): {
  worldWidthM: number;
  worldHeightM: number;
  offsetXM: number;
  offsetYM: number;
} {
  const aspect = Math.max(0.1, Math.min(10, params.imageAspect || 1.4));
  const dx = params.p2Norm.x - params.p1Norm.x;
  const dy = (params.p2Norm.y - params.p1Norm.y) / aspect;
  const spanWidthUnits = Math.max(0.01, Math.hypot(dx, dy));
  const worldWidthM = +Math.max(
    0.5,
    Math.min(80, params.knownDistanceM / spanWidthUnits)
  ).toFixed(3);
  const worldHeightM = +Math.max(0.5, worldWidthM / aspect).toFixed(3);
  // Anchor so p1 aligns neatly inside the elevation frame if image is larger than wall
  const p1WorldX = params.p1Norm.x * worldWidthM;
  const p1WorldFromBottomY = (1 - params.p1Norm.y) * worldHeightM;
  const offsetXM = +(Math.max(-worldWidthM * 0.85, Math.min(params.facetLengthM * 0.5, (params.facetLengthM - worldWidthM) / 2 || -p1WorldX * 0))).toFixed(3);
  const offsetYM = +Math.max(-worldHeightM * 0.85, Math.min(params.facetHeightM * 0.5, params.facetHeightM - worldHeightM - (p1WorldFromBottomY * 0))).toFixed(3);
  return {
    worldWidthM,
    worldHeightM,
    offsetXM,
    offsetYM
  };
}

export interface WallCornerTopologyItem {
  vertexIndex: number;
  point: Point2D;
  kind: 'external' | 'internal';
  interiorAngleDeg: number;
}

export interface WallPlanTopology {
  externalCornersCount: number;
  internalCornersCount: number;
  returnFacesCount: number;
  cornerDetails: WallCornerTopologyItem[];
  returnFacetIds: string[];
}

export function analyzeWallPlanTopology(facets: WallFacet[]): WallPlanTopology {
  if (!facets || facets.length < 3) {
    return {
      externalCornersCount: 0,
      internalCornersCount: 0,
      returnFacesCount: 0,
      cornerDetails: [],
      returnFacetIds: []
    };
  }

  // Signed area in screen-down 2D coordinates (x right, y down)
  let signedArea2 = 0;
  for (let i = 0; i < facets.length; i++) {
    const f = facets[i];
    signedArea2 += f.from.x * f.to.y - f.to.x * f.from.y;
  }
  const orientationSign = signedArea2 >= 0 ? 1 : -1;

  const cornerDetails: WallCornerTopologyItem[] = [];
  let externalCornersCount = 0;
  let internalCornersCount = 0;

  for (let i = 0; i < facets.length; i++) {
    const prev = facets[(i - 1 + facets.length) % facets.length];
    const curr = facets[i];
    const lenA = dist(prev.from, prev.to) || 1;
    const lenB = dist(curr.from, curr.to) || 1;
    const ax = (prev.to.x - prev.from.x) / lenA;
    const ay = (prev.to.y - prev.from.y) / lenA;
    const bx = (curr.to.x - curr.from.x) / lenB;
    const by = (curr.to.y - curr.from.y) / lenB;

    const cross = (ax * by - ay * bx) * orientationSign;
    const dot = Math.max(-1, Math.min(1, ax * bx + ay * by));
    const turnAngleDeg = (Math.acos(dot) * 180) / Math.PI;
    // In screen-down CW (orientationSign > 0), right-hand exterior turn has cross > 0 -> interior angle < 180
    // Left-hand reflex/notch turn has cross < 0 -> interior angle = 180 + turnAngleDeg > 180
    const isInternal = cross < -0.04;
    const interiorAngleDeg = +(isInternal ? 180 + turnAngleDeg : 180 - turnAngleDeg).toFixed(1);
    const kind = isInternal ? 'internal' : 'external';

    if (isInternal) internalCornersCount++;
    else externalCornersCount++;

    cornerDetails.push({
      vertexIndex: i,
      point: curr.from,
      kind,
      interiorAngleDeg
    });
  }

  const returnFacetIdSet = new Set<string>();
  for (let i = 0; i < facets.length; i++) {
    const startCorner = cornerDetails[i];
    const endCorner = cornerDetails[(i + 1) % facets.length];
    const isShortNib = facets[i].lengthM <= 2.2 && facets.length >= 6;
    if (startCorner?.kind === 'internal' || endCorner?.kind === 'internal' || isShortNib) {
      returnFacetIdSet.add(facets[i].id);
    }
  }

  return {
    externalCornersCount,
    internalCornersCount,
    returnFacesCount: returnFacetIdSet.size,
    cornerDetails,
    returnFacetIds: Array.from(returnFacetIdSet)
  };
}

export interface WallOpeningScheduleRow {
  id: string;
  facetId: string;
  facetCode: string;
  type: WallOpeningType;
  label: string;
  widthM: number;
  heightM: number;
  sillHeightM: number;
  distFromStartM: number;
  areaM2: number;
}

export interface WallOpeningsScheduleSummary {
  rows: WallOpeningScheduleRow[];
  totalCount: number;
  totalAreaM2: number;
  countsByType: Record<WallOpeningType, number>;
}

export function buildWallOpeningsSchedule(facets: WallFacet[]): WallOpeningsScheduleSummary {
  const rows: WallOpeningScheduleRow[] = [];
  const countsByType: Record<WallOpeningType, number> = {
    window: 0,
    door: 0,
    garage: 0,
    void: 0
  };
  let totalAreaM2 = 0;

  facets.forEach((f) => {
    const sortedOps = [...f.openings].sort((a, b) => a.distFromStartM - b.distFromStartM);
    sortedOps.forEach((op) => {
      const c = clampWallOpeningToFacet(f, op);
      const areaM2 = +(c.widthM * c.heightM).toFixed(2);
      countsByType[c.type] = (countsByType[c.type] || 0) + 1;
      totalAreaM2 += areaM2;
      rows.push({
        id: c.id,
        facetId: f.id,
        facetCode: f.code,
        type: c.type,
        label: c.label || c.type,
        widthM: c.widthM,
        heightM: c.heightM,
        sillHeightM: c.sillHeightM,
        distFromStartM: c.distFromStartM,
        areaM2
      });
    });
  });

  return {
    rows,
    totalCount: rows.length,
    totalAreaM2: +totalAreaM2.toFixed(2),
    countsByType
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
  undetailedFacetIds: string[];
  totalLinealM: number;
  totalGrossAreaM2: number;
  totalOpeningsAreaM2: number;
  totalNetAreaM2: number;
  totalOpeningsCount: number;
  externalCornersCount: number;
  internalCornersCount: number;
  returnFacesCount: number;
  returnFacetIds: string[];
  byCladding: WallCladdingGroupSummary[];
}

export function computeWallTakeoffSummary(facets: WallFacet[]): WallTakeoffSummary {
  const groupMap = new Map<
    WallCladdingType,
    WallCladdingGroupSummary & { facetIdSet: Set<string>; spanByFacet: Map<string, number> }
  >();
  let totalLinealM = 0;
  let totalGrossAreaM2 = 0;
  let totalOpeningsAreaM2 = 0;
  let totalNetAreaM2 = 0;
  let totalOpeningsCount = 0;
  const undetailedFacetIds: string[] = [];

  facets.forEach((f) => {
    const m = computeWallFacetMetrics(f);
    totalLinealM += f.lengthM;
    totalGrossAreaM2 += m.grossAreaM2;
    totalOpeningsAreaM2 += m.openingsAreaM2;
    totalNetAreaM2 += m.netCladdingAreaM2;
    totalOpeningsCount += m.openingsCount;
    if (isWallFacetUndetailed(f)) {
      undetailedFacetIds.push(f.id);
    }

    m.regionBreakdown.forEach((reg) => {
      const meta = getWallCladdingMeta(reg.claddingType);
      const regSpan = Math.min(f.lengthM, Math.max(0, reg.uEndM - reg.uStartM));
      let existing = groupMap.get(reg.claddingType);
      if (!existing) {
        existing = {
          claddingType: reg.claddingType,
          label: meta.label,
          shortLabel: meta.shortLabel,
          hex: meta.hex,
          faceCount: 0,
          faceCodes: [],
          linealM: 0,
          grossAreaM2: 0,
          openingsAreaM2: 0,
          netAreaM2: 0,
          openingsCount: 0,
          facetIdSet: new Set<string>(),
          spanByFacet: new Map<string, number>()
        };
        groupMap.set(reg.claddingType, existing);
      }

      if (!existing.facetIdSet.has(f.id)) {
        existing.facetIdSet.add(f.id);
        existing.faceCount += 1;
        existing.faceCodes.push(f.code);
        existing.openingsCount += m.openingsCount;
      }

      // Accumulate unique horizontal coverage per face (avoid double-counting linealM on horizontal dado splits)
      const prevSpan = existing.spanByFacet.get(f.id) || 0;
      const nextSpan = Math.min(f.lengthM, Math.max(prevSpan, regSpan));
      existing.spanByFacet.set(f.id, nextSpan);
      existing.linealM = +Array.from(existing.spanByFacet.values())
        .reduce((a, b) => a + b, 0)
        .toFixed(2);

      existing.grossAreaM2 = +(existing.grossAreaM2 + reg.grossAreaM2).toFixed(2);
      existing.openingsAreaM2 = +(existing.openingsAreaM2 + reg.openingsAreaM2).toFixed(2);
      existing.netAreaM2 = +(existing.netAreaM2 + reg.netAreaM2).toFixed(2);
    });
  });

  const orderMap = new Map(WALL_CLADDING_OPTIONS.map((o, idx) => [o.type, idx]));
  const byCladding: WallCladdingGroupSummary[] = Array.from(groupMap.values())
    .map(({ facetIdSet: _f, spanByFacet: _s, ...rest }) => rest)
    .sort((a, b) => (orderMap.get(a.claddingType) ?? 99) - (orderMap.get(b.claddingType) ?? 99));

  const topology = analyzeWallPlanTopology(facets);

  return {
    totalFaces: facets.length,
    detailedFacesCount: facets.length - undetailedFacetIds.length,
    undetailedCount: undetailedFacetIds.length,
    undetailedFacetIds,
    totalLinealM: +totalLinealM.toFixed(2),
    totalGrossAreaM2: +totalGrossAreaM2.toFixed(2),
    totalOpeningsAreaM2: +totalOpeningsAreaM2.toFixed(2),
    totalNetAreaM2: +totalNetAreaM2.toFixed(2),
    totalOpeningsCount,
    externalCornersCount: topology.externalCornersCount,
    internalCornersCount: topology.internalCornersCount,
    returnFacesCount: topology.returnFacesCount,
    returnFacetIds: topology.returnFacetIds,
    byCladding
  };
}

export interface WallTakeoffExportPayload {
  generatedAt: string;
  summary: WallTakeoffSummary;
  faces: {
    code: string;
    name: string;
    lengthM: number;
    heightM: number;
    bottomZ: number;
    topZ: number;
    heightSource: string;
    isReturnFace: boolean;
    claddingSummary: string;
    openingsCount: number;
    grossAreaM2: number;
    openingsAreaM2: number;
    netAreaM2: number;
    needsDetail: boolean;
  }[];
  openingsSchedule: WallOpeningsScheduleSummary;
  csvText: string;
}

export function buildWallTakeoffExportData(wallPlan: WallPlan | null): WallTakeoffExportPayload {
  const facets = wallPlan?.facets || [];
  const summary = computeWallTakeoffSummary(facets);
  const openingsSchedule = buildWallOpeningsSchedule(facets);
  const returnSet = new Set(summary.returnFacetIds);

  const faces = facets.map((f) => {
    const m = computeWallFacetMetrics(f);
    const claddingSummary =
      f.regions && f.regions.length > 0
        ? f.regions.map((r) => `${r.label || 'Region'}: ${getWallCladdingMeta(r.claddingType).shortLabel}`).join(' / ')
        : getWallCladdingMeta(f.claddingType).label;
    return {
      code: f.code,
      name: f.name || `Wall ${f.code}`,
      lengthM: f.lengthM,
      heightM: f.heightM,
      bottomZ: f.bottomZ,
      topZ: f.topZ,
      heightSource: f.heightSource || 'manual',
      isReturnFace: returnSet.has(f.id),
      claddingSummary,
      openingsCount: f.openings.length,
      grossAreaM2: m.grossAreaM2,
      openingsAreaM2: m.openingsAreaM2,
      netAreaM2: m.netCladdingAreaM2,
      needsDetail: isWallFacetUndetailed(f)
    };
  });

  const csvLines: string[] = [
    'WALL CLADDING SUMMARY',
    'Cladding Type,Faces,Lineal (m),Gross (m2),Openings (m2),Net Cladding (m2)',
    ...summary.byCladding.map(
      (g) =>
        `"${g.label}","${g.faceCodes.join(' ')}",${g.linealM.toFixed(2)},${g.grossAreaM2.toFixed(2)},${g.openingsAreaM2.toFixed(2)},${g.netAreaM2.toFixed(2)}`
    ),
    '',
    'PER-FACE WALL SCHEDULE',
    'Code,Length (m),Height (m),Height Source,Return Face,Cladding,Openings,Gross (m2),Openings (m2),Net (m2),Status',
    ...faces.map(
      (r) =>
        `${r.code},${r.lengthM.toFixed(2)},${r.heightM.toFixed(2)},${r.heightSource},${r.isReturnFace ? 'Yes' : 'No'},"${r.claddingSummary}",${r.openingsCount},${r.grossAreaM2.toFixed(2)},${r.openingsAreaM2.toFixed(2)},${r.netAreaM2.toFixed(2)},${r.needsDetail ? 'Needs Detail' : 'Detailed'}`
    ),
    '',
    'CORNERS & RETURNS',
    `External Corners,${summary.externalCornersCount}`,
    `Internal (Notch) Corners,${summary.internalCornersCount}`,
    `Return / Short Faces,${summary.returnFacesCount}`,
    '',
    'OPENINGS SCHEDULE',
    'Wall Code,Type,Label,Width (m),Height (m),Sill (m),Offset X (m),Area (m2)',
    ...openingsSchedule.rows.map(
      (o) =>
        `${o.facetCode},${o.type},"${o.label}",${o.widthM.toFixed(2)},${o.heightM.toFixed(2)},${o.sillHeightM.toFixed(2)},${o.distFromStartM.toFixed(2)},${o.areaM2.toFixed(2)}`
    )
  ];

  return {
    generatedAt: new Date().toISOString(),
    summary,
    faces,
    openingsSchedule,
    csvText: csvLines.join('\n')
  };
}

/**
 * Computes signed shoestring area (>0 for CCW in Y-down, <0 for CW) to determine outward normals
 * cleanly for arbitrary concave / L-shape / U-notch wall outlines.
 */
function wallSignedArea2(points: Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum * 0.5;
}

/**
 * Bidirectional Walls -> Roof seeding:
 * Copies a closed WallPlan exterior footprint (including internal notch / return faces)
 * into a site-scale RoofOutline for the active roof level, without auto-generating any skeleton.
 * Preserves bidirectional links (`PlanEdge.wallFacetId` <-> `WallFacet.roofEdgeId`).
 */
export function deriveRoofOutlineFromWallPlan(
  wallPlan: WallPlan | null | undefined,
  options?: {
    levelId?: string;
    idPrefix?: string;
    eaveOverhangM?: number;
    edgeType?: EdgeType;
  }
): { outline: RoofOutline; linkedWallPlan: WallPlan } | null {
  if (!wallPlan) return null;

  const baseFacets: WallFacet[] =
    wallPlan.facets.length >= 3
      ? wallPlan.facets
      : wallPlan.points.length >= 3
      ? buildWallFacetsFromPlan(
          { points: wallPlan.points, edges: wallPlan.edges },
          { defaultHeightM: wallPlan.defaultHeightM, mergeCollinear: false }
        )
      : [];

  if (baseFacets.length < 3) return null;

  const wallPts = baseFacets.map((f) => ({
    x: +f.from.x.toFixed(3),
    y: +f.from.y.toFixed(3)
  }));
  const signedA = wallSignedArea2(wallPts);
  const overhang = Math.max(0, +(options?.eaveOverhangM ?? 0).toFixed(3));

  let roofPts: Point2D[] = wallPts.map((p) => ({ ...p }));
  if (overhang > 0.005) {
    // Outward normal in screen coords: if signedA > 0 (CW in Y-up / CCW in Y-down), outward is (+dy, -dx)/len; else (-dy, +dx)/len
    const sign = signedA >= 0 ? 1 : -1;
    const offsetSegs = baseFacets.map((f) => {
      const dx = f.to.x - f.from.x;
      const dy = f.to.y - f.from.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (sign * dy) / len;
      const ny = (-sign * dx) / len;
      return {
        from: { x: f.from.x + nx * overhang, y: f.from.y + ny * overhang },
        to: { x: f.to.x + nx * overhang, y: f.to.y + ny * overhang }
      };
    });

    roofPts = offsetSegs.map((curr, idx) => {
      const prev = offsetSegs[(idx - 1 + offsetSegs.length) % offsetSegs.length];
      const inter = lineIntersection2D(prev.from, prev.to, curr.from, curr.to);
      if (inter && dist(inter, wallPts[idx]) <= overhang * 3 + 0.5) {
        return { x: +inter.x.toFixed(3), y: +inter.y.toFixed(3) };
      }
      return { x: +curr.from.x.toFixed(3), y: +curr.from.y.toFixed(3) };
    });
  }

  const levelId = options?.levelId || 'level-1';
  const idPrefix = options?.idPrefix ?? '';
  const initialEdgeType: EdgeType = options?.edgeType ?? 'unclassified';

  const edges: PlanEdge[] = baseFacets.map((facet, idx) => {
    const nextIdx = (idx + 1) % roofPts.length;
    const edgeId = `${idPrefix}edge-wall-${idx + 1}`;
    return {
      id: edgeId,
      from: roofPts[idx],
      to: roofPts[nextIdx],
      type: initialEdgeType,
      eaveHeightM: +(facet.topZ || wallPlan.defaultHeightM || 2.7).toFixed(3),
      levelId,
      hasWall: true,
      eaveSetbackM: overhang,
      wallBottomZ: +(facet.bottomZ || 0).toFixed(3),
      wallFacetId: facet.id
    };
  });

  const outline: RoofOutline = {
    id: `outline-from-walls-${Date.now().toString().slice(-5)}`,
    points: roofPts,
    edges,
    levelId
  };

  const linkedFacets = baseFacets.map((facet, idx) => ({
    ...facet,
    roofEdgeId: edges[idx].id
  }));

  const linkedWallPlan: WallPlan = {
    ...wallPlan,
    facets: linkedFacets,
    builtAt: new Date().toISOString()
  };

  return { outline, linkedWallPlan };
}

/**
 * Refreshes bidirectional edge links between WallPlan facets and existing RoofLevels
 * without modifying user-authored cladding, openings, or roof geometry.
 */
export function linkWallFacetsToRoofLevels(
  wallPlan: WallPlan,
  roofLevels: RoofLevel[]
): WallPlan {
  if (!wallPlan || wallPlan.facets.length === 0 || roofLevels.length === 0) return wallPlan;
  const linkedFacets = wallPlan.facets.map((facet) => {
    const matched =
      facet.roofEdgeId &&
      roofLevels.some((lvl) => lvl.outline.edges.some((e) => e.id === facet.roofEdgeId))
        ? facet.roofEdgeId
        : findMatchingRoofEdgeId(facet.from, facet.to, roofLevels);
    return matched && matched !== facet.roofEdgeId
      ? { ...facet, roofEdgeId: matched }
      : facet;
  });
  return {
    ...wallPlan,
    facets: linkedFacets
  };
}


