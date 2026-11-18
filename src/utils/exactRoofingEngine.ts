import {
  Point2D,
  Point3D,
  EdgeType,
  PlanEdge,
  RoofOutline,
  SkeletonLine,
  RoofPlane,
  RoofLevel,
  RoofWallSegment,
  SheetSpec,
  CutPiece,
  ParentSheet,
  LayoutResult,
  SectionSummary,
  SectionPairingLink,
  RoofOutlinePresetKey,
  OffcutReceivingZone,
  InstallationStep,
  RoofAsset,
  PitchBreakLine,
  PlaneAperture,
  RoofJunctionNode,
  AssignableRoofLine,
  RoofLineFlashingKind,
  RoofPlanUnderlay
} from '../types/exactRoofing';

export const EPSILON = 1e-4;

export const SECTION_PALETTE = [
  { code: 'A', name: 'Blue', hex: '#2563eb', label: 'BLUE A' },
  { code: 'B', name: 'Green', hex: '#16a34a', label: 'GREEN B' },
  { code: 'C', name: 'Orange', hex: '#ea580c', label: 'ORANGE C' },
  { code: 'D', name: 'Purple', hex: '#9333ea', label: 'PURPLE D' },
  { code: 'E', name: 'Cyan', hex: '#0891b2', label: 'CYAN E' },
  { code: 'F', name: 'Amber', hex: '#d97706', label: 'AMBER F' },
  { code: 'G', name: 'Pink', hex: '#db2777', label: 'PINK G' },
  { code: 'H', name: 'Indigo', hex: '#4f46e5', label: 'INDIGO H' }
];

export function getSoftColor(hex: string, opacity = 0.42): string {
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return hex;
}

export function getSoftTintColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    const tintR = Math.min(255, Math.round(r * 0.45 + 255 * 0.55));
    const tintG = Math.min(255, Math.round(g * 0.45 + 255 * 0.55));
    const tintB = Math.min(255, Math.round(b * 0.45 + 255 * 0.55));
    return `rgb(${tintR}, ${tintG}, ${tintB})`;
  }
  return hex;
}

// ---------------------------------------------------------------------------
// 1. PRESET GENERATOR & OUTLINE BUILDER
// ---------------------------------------------------------------------------
export function getPresetOutline(preset: RoofOutlinePresetKey): RoofOutline {
  let points: Point2D[] = [];

  switch (preset) {
    case 'rectangle_14x10':
      // 14m x 10m rectangle (in metres)
      points = [
        { x: 0, y: 0 },
        { x: 14, y: 0 },
        { x: 14, y: 10 },
        { x: 0, y: 10 }
      ];
      break;

    case 'l_shape_standard':
      // L-shaped roof (14.2m x 21.2m footprint with 6.27m wings)
      points = [
        { x: 0, y: 0 },
        { x: 21.2, y: 0 },
        { x: 21.2, y: 6.27 },
        { x: 6.27, y: 6.27 },
        { x: 6.27, y: 14.2 },
        { x: 0, y: 14.2 }
      ];
      break;

    case 'straight_gable':
      // 14m x 8m simple duo-pitch gable
      points = [
        { x: 0, y: 0 },
        { x: 14, y: 0 },
        { x: 14, y: 8 },
        { x: 0, y: 8 }
      ];
      break;

    case 't_shape':
      // T-shaped roof
      points = [
        { x: 4, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 6 },
        { x: 14, y: 6 },
        { x: 14, y: 12 },
        { x: 0, y: 12 },
        { x: 0, y: 6 },
        { x: 4, y: 6 }
      ];
      break;

    case 'two_storey_split':
    case 'cascading_terrace':
      points = [
        { x: 0, y: 0 },
        { x: 14, y: 0 },
        { x: 14, y: 4.5 },
        { x: 0, y: 4.5 }
      ];
      break;

    case 'custom':
    default:
      points = [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 8 },
        { x: 0, y: 8 }
      ];
      break;
  }

  return buildOutlineFromPoints(points, `outline-${preset}`);
}

export function buildOutlineFromPoints(
  points: Point2D[],
  id = `outline-${Date.now()}`,
  options?: {
    levelId?: string;
    idPrefix?: string;
    defaultEaveHeightM?: number;
    initialEdgeType?: EdgeType;
  }
): RoofOutline {
  const prefix = options?.idPrefix ? `${options.idPrefix}__` : '';
  const edgeType: EdgeType = options?.initialEdgeType ?? 'outline';
  const edges: PlanEdge[] = points.map((p, idx) => {
    const next = points[(idx + 1) % points.length];
    return {
      id: `${prefix}edge-out-${idx + 1}`,
      from: { ...p },
      to: { ...next },
      type: edgeType,
      ...(options?.defaultEaveHeightM !== undefined ? { eaveHeightM: options.defaultEaveHeightM } : {}),
      ...(options?.levelId ? { levelId: options.levelId } : {})
    };
  });

  return { id, points, edges, ...(options?.levelId ? { levelId: options.levelId } : {}) };
}

/**
 * Builds a closed roof outline attached to an existing wall/gutter edge.
 * Preserves the attachment edge's role when it was a wall (or marks it unclassified),
 * and leaves all newly drawn outer edges unclassified for ExactRoof setup.
 */
export function buildAttachedOutlineFromEdge(
  attachedEdge: PlanEdge,
  points: Point2D[],
  id = `outline-attached-${Date.now()}`,
  options?: {
    levelId?: string;
    idPrefix?: string;
    defaultEaveHeightM?: number;
    initialEdgeType?: EdgeType;
  }
): RoofOutline {
  const base = buildOutlineFromPoints(points, id, {
    ...options,
    defaultEaveHeightM: options?.defaultEaveHeightM ?? attachedEdge.eaveHeightM,
    initialEdgeType: options?.initialEdgeType ?? 'unclassified'
  });

  return {
    ...base,
    edges: base.edges.map((e) => {
      const matchesAttached =
        (pointsClose(e.from, attachedEdge.from, 0.12) &&
          pointsClose(e.to, attachedEdge.to, 0.12)) ||
        (pointsClose(e.from, attachedEdge.to, 0.12) &&
          pointsClose(e.to, attachedEdge.from, 0.12));
      if (!matchesAttached) return e;
      return {
        ...e,
        type: attachedEdge.type === 'wall' ? 'wall' : options?.initialEdgeType ?? 'unclassified',
        hasWall: attachedEdge.type === 'wall' ? true : e.hasWall
      };
    })
  };
}

/**
 * Classifies a single boundary edge without altering skeleton geometry or fall direction of other edges.
 */
export function classifyOutlineEdge(
  outline: RoofOutline,
  edgeId: string,
  edgeType: EdgeType
): RoofOutline {
  return {
    ...outline,
    edges: outline.edges.map((e) =>
      e.id === edgeId
        ? {
            ...e,
            type: edgeType,
            ...(edgeType === 'wall' ? { hasWall: true } : {})
          }
        : e
    )
  };
}

function getLevelIdPrefixFromOutline(outline: RoofOutline): string | undefined {
  if (outline.levelId && outline.levelId !== 'level-1') {
    return outline.levelId;
  }
  const firstId = outline.edges[0]?.id || '';
  const idx = firstId.indexOf('__');
  if (idx > 0) return firstId.slice(0, idx);
  return undefined;
}

// ---------------------------------------------------------------------------
// VERTEX EDITING HELPERS
// ---------------------------------------------------------------------------
export function moveVertex(outline: RoofOutline, vertexIdx: number, newPt: Point2D): RoofOutline {
  if (vertexIdx < 0 || vertexIdx >= outline.points.length) return outline;
  const newPoints = [...outline.points];
  newPoints[vertexIdx] = {
    x: +Math.max(-10, Math.min(50, newPt.x)).toFixed(2),
    y: +Math.max(-10, Math.min(50, newPt.y)).toFixed(2)
  };
  return preserveOutlineEdgeMetadata(
    buildOutlineFromPoints(newPoints, outline.id, {
      levelId: outline.levelId,
      idPrefix: getLevelIdPrefixFromOutline(outline)
    }),
    outline
  );
}

export function insertVertexOnEdge(outline: RoofOutline, edgeIdx: number, newPt: Point2D): RoofOutline {
  if (edgeIdx < 0 || edgeIdx >= outline.points.length) return outline;
  const newPoints = [...outline.points];
  newPoints.splice(edgeIdx + 1, 0, {
    x: +newPt.x.toFixed(2),
    y: +newPt.y.toFixed(2)
  });
  return buildOutlineFromPoints(newPoints, outline.id, {
    levelId: outline.levelId,
    idPrefix: getLevelIdPrefixFromOutline(outline)
  });
}

export function deleteVertex(outline: RoofOutline, vertexIdx: number): RoofOutline {
  if (outline.points.length <= 3) return outline; // Keep at least a triangle
  const newPoints = outline.points.filter((_, idx) => idx !== vertexIdx);
  return buildOutlineFromPoints(newPoints, outline.id, {
    levelId: outline.levelId,
    idPrefix: getLevelIdPrefixFromOutline(outline)
  });
}

function preserveOutlineEdgeMetadata(next: RoofOutline, prev: RoofOutline): RoofOutline {
  return {
    ...next,
    ...(prev.levelId ? { levelId: prev.levelId } : {}),
    edges: next.edges.map((e, i) => ({
      ...e,
      id: prev.edges[i]?.id || e.id,
      type: prev.edges[i]?.type || e.type,
      ...(prev.edges[i]?.eaveHeightM !== undefined ? { eaveHeightM: prev.edges[i].eaveHeightM } : {}),
      ...(prev.edges[i]?.levelId ? { levelId: prev.edges[i].levelId } : prev.levelId ? { levelId: prev.levelId } : {})
    }))
  };
}

export function updateEdgeLength(outline: RoofOutline, edgeId: string, newLengthM: number): RoofOutline {
  if (newLengthM <= 0.1) return outline;
  const edgeIdx = outline.edges.findIndex((e) => e.id === edgeId);
  if (edgeIdx < 0) return outline;

  const pts = [...outline.points];
  const n = pts.length;
  const p0 = pts[edgeIdx];
  const nextIdx = (edgeIdx + 1) % n;
  const p1 = pts[nextIdx];

  const curLen = dist(p0, p1);
  if (curLen < 0.01) return outline;
  const delta = newLengthM - curLen;

  // Case 1: 4-Corner Rectangle (preserve orthogonal rectangular geometry)
  if (n === 4) {
    const isHorizontal = Math.abs(p1.y - p0.y) < 0.15;
    const isVertical = Math.abs(p1.x - p0.x) < 0.15;

    if (isHorizontal) {
      const sign = p1.x >= p0.x ? 1 : -1;
      const shiftX = sign * delta;
      if (edgeIdx === 0) {
        pts[1] = { x: +(pts[1].x + shiftX).toFixed(2), y: pts[1].y };
        pts[2] = { x: +(pts[2].x + shiftX).toFixed(2), y: pts[2].y };
      } else if (edgeIdx === 2) {
        pts[2] = { x: +(pts[2].x - shiftX).toFixed(2), y: pts[2].y };
        pts[1] = { x: +(pts[1].x - shiftX).toFixed(2), y: pts[1].y };
      } else {
        pts[nextIdx] = { x: +(p0.x + sign * newLengthM).toFixed(2), y: p0.y };
      }
      return preserveOutlineEdgeMetadata(
        buildOutlineFromPoints(pts, outline.id, {
          levelId: outline.levelId,
          idPrefix: getLevelIdPrefixFromOutline(outline)
        }),
        outline
      );
    } else if (isVertical) {
      const sign = p1.y >= p0.y ? 1 : -1;
      const shiftY = sign * delta;
      if (edgeIdx === 1) {
        pts[2] = { x: pts[2].x, y: +(pts[2].y + shiftY).toFixed(2) };
        pts[3] = { x: pts[3].x, y: +(pts[3].y + shiftY).toFixed(2) };
      } else if (edgeIdx === 3) {
        pts[3] = { x: pts[3].x, y: +(pts[3].y - shiftY).toFixed(2) };
        pts[2] = { x: pts[2].x, y: +(pts[2].y - shiftY).toFixed(2) };
      } else {
        pts[nextIdx] = { x: p0.x, y: +(p0.y + sign * newLengthM).toFixed(2) };
      }
      return preserveOutlineEdgeMetadata(
        buildOutlineFromPoints(pts, outline.id, {
          levelId: outline.levelId,
          idPrefix: getLevelIdPrefixFromOutline(outline)
        }),
        outline
      );
    }
  }

  // Case 2: General polygon - adjust target vertex along line direction
  const ux = (p1.x - p0.x) / curLen;
  const uy = (p1.y - p0.y) / curLen;
  pts[nextIdx] = {
    x: +(p0.x + ux * newLengthM).toFixed(2),
    y: +(p0.y + uy * newLengthM).toFixed(2)
  };

  return preserveOutlineEdgeMetadata(
    buildOutlineFromPoints(pts, outline.id, {
      levelId: outline.levelId,
      idPrefix: getLevelIdPrefixFromOutline(outline)
    }),
    outline
  );
}

export function updateSkeletonLineLength(
  skeleton: SkeletonLine[],
  lineId: string,
  newLengthM: number
): SkeletonLine[] {
  if (newLengthM <= 0.1) return skeleton;
  return skeleton.map((line) => {
    if (line.id !== lineId) return line;
    const curLen = dist(line.from, line.to);
    if (curLen < 0.01) return line;
    const ux = (line.to.x - line.from.x) / curLen;
    const uy = (line.to.y - line.from.y) / curLen;

    if (line.suggestedType === 'ridge') {
      const mid = {
        x: (line.from.x + line.to.x) / 2,
        y: (line.from.y + line.to.y) / 2
      };
      const half = newLengthM / 2;
      return {
        ...line,
        from: { x: +(mid.x - ux * half).toFixed(2), y: +(mid.y - uy * half).toFixed(2) },
        to: { x: +(mid.x + ux * half).toFixed(2), y: +(mid.y + uy * half).toFixed(2) }
      };
    }

    return {
      ...line,
      to: {
        x: +(line.from.x + ux * newLengthM).toFixed(2),
        y: +(line.from.y + uy * newLengthM).toFixed(2)
      }
    };
  });
}

// ---------------------------------------------------------------------------
// OUTLINE IMPORT PARSER (SVG / DXF / JSON / Raw coords)
// ---------------------------------------------------------------------------
export function parseOutlineFromInput(text: string): Point2D[] | null {
  const clean = text.trim();
  if (!clean) return null;

  try {
    // 1. JSON Array of Points: [{x, y}, ...] or [[x, y], ...]
    if (clean.startsWith('[') || clean.startsWith('{')) {
      const parsed = JSON.parse(clean);
      const arr = Array.isArray(parsed) ? parsed : parsed.points || parsed.vertices;
      if (Array.isArray(arr) && arr.length >= 3) {
        return arr.map((item: any) => {
          if (Array.isArray(item)) return { x: Number(item[0]) || 0, y: Number(item[1]) || 0 };
          return { x: Number(item.x) || 0, y: Number(item.y) || 0 };
        });
      }
    }

    // 2. SVG Polygon points="x1,y1 x2,y2 ..." or "x1 y1, x2 y2"
    if (clean.includes('<polygon') || clean.includes('points=')) {
      const match = clean.match(/points=["']([^"']+)["']/);
      if (match && match[1]) {
        const nums = match[1]
          .trim()
          .split(/[\s,]+/)
          .map(Number)
          .filter((n) => !isNaN(n));
        const pts: Point2D[] = [];
        for (let i = 0; i < nums.length - 1; i += 2) {
          pts.push({ x: nums[i], y: nums[i + 1] });
        }
        if (pts.length >= 3) return autoScalePointsToRoofMeters(pts);
      }
    }

    // 3. SVG Path "M x y L x y ... Z"
    if (clean.includes('d=') || clean.startsWith('M') || clean.startsWith('m')) {
      const pathStr = clean.includes('d=') ? clean.match(/d=["']([^"']+)["']/)?.[1] || clean : clean;
      const coords = pathStr.match(/-?[\d.]+/g)?.map(Number) || [];
      const pts: Point2D[] = [];
      for (let i = 0; i < coords.length - 1; i += 2) {
        pts.push({ x: coords[i], y: coords[i + 1] });
      }
      if (pts.length >= 3) return autoScalePointsToRoofMeters(pts);
    }

    // 4. Comma / Line-separated pairs: "0,0\n 14,0\n 14,10\n 0,10"
    const lines = clean.split('\n');
    const pts: Point2D[] = [];
    lines.forEach((l) => {
      const parts = l.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
      if (parts.length >= 2) {
        pts.push({ x: parts[0], y: parts[1] });
      }
    });

    if (pts.length >= 3) return autoScalePointsToRoofMeters(pts);
  } catch (err) {
    console.warn('Error parsing outline:', err);
  }

  return null;
}

function autoScalePointsToRoofMeters(pts: Point2D[]): Point2D[] {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const maxSpan = Math.max(spanX, spanY);

  // If coordinates look like pixels (> 50), scale down to a realistic 14-20m roof
  const targetSpanM = 16.0;
  const factor = maxSpan > 40 ? targetSpanM / maxSpan : 1.0;

  return pts.map((p) => ({
    x: +((p.x - minX) * factor).toFixed(2),
    y: +((p.y - minY) * factor).toFixed(2)
  }));
}

// ---------------------------------------------------------------------------
// 2. SKELETON KEY ALGORITHM (Clean Structural Hips, Valleys, Ridges)
// ---------------------------------------------------------------------------

function getSignedArea(pts: Point2D[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2;
}

function crossProduct2D(p1: Point2D, p2: Point2D, p3: Point2D): number {
  return (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
}

function lineLineIntersection(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D
): Point2D | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;

  const det = d1x * d2y - d1y * d2x;
  if (Math.abs(det) < 1e-6) return null;

  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / det;
  return {
    x: +(p1.x + t * d1x).toFixed(3),
    y: +(p1.y + t * d1y).toFixed(3)
  };
}

// Distance from point to line segment
function distToSegment(p: Point2D, a: Point2D, b: Point2D): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 < 1e-6) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  const proj = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  return dist(p, proj);
}

// Check whether a segment lies inside (or along the boundary of) the roof polygon
function isSegmentInsidePolygon(a: Point2D, b: Point2D, poly: Point2D[]): boolean {
  const samples = [0.2, 0.5, 0.8];
  for (const t of samples) {
    const pt: Point2D = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    };
    if (isPointInPolygon(pt, poly)) continue;
    // Allow tiny tolerance near boundary edges
    let nearBoundary = false;
    for (let i = 0; i < poly.length; i++) {
      if (distToSegment(pt, poly[i], poly[(i + 1) % poly.length]) <= 0.08) {
        nearBoundary = true;
        break;
      }
    }
    if (!nearBoundary) return false;
  }
  return true;
}

// Clean and simplify polygon vertices: removes duplicates & collinear vertices (preserving verge boundaries)
function simplifyOutlinePoints(rawPts: Point2D[], edges?: PlanEdge[]): Point2D[] {
  if (rawPts.length <= 3) return rawPts;
  // 1. Remove consecutive duplicates
  const pts: Point2D[] = [];
  for (let i = 0; i < rawPts.length; i++) {
    const next = rawPts[(i + 1) % rawPts.length];
    if (dist(rawPts[i], next) > 0.12) {
      pts.push(rawPts[i]);
    }
  }
  if (pts.length <= 3) return pts;

  // Preserve corners where adjacent edge types differ ('outline' vs 'verge')
  const isProtectedBoundary = (pt: Point2D): boolean => {
    if (!edges || edges.length === 0) return false;
    const prevE = edges.find((e) => pointsClose(e.to, pt, 0.15));
    const nextE = edges.find((e) => pointsClose(e.from, pt, 0.15));
    return Boolean(prevE && nextE && prevE.type !== nextE.type);
  };

  // 2. Remove collinear & near-collinear noise vertices (< ~3.4 deg bend) along straight eaves
  const filtered: Point2D[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y) || 1;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const sinTurn = Math.abs((v1x * v2y - v1y * v2x) / (len1 * len2));
    const d = distToSegment(curr, prev, next);

    if ((d > 0.05 && sinTurn >= 0.055) || isProtectedBoundary(curr)) {
      filtered.push(curr);
    }
  }

  return filtered.length >= 3 ? filtered : pts;
}

// Clean-up pass: collapses short interior ridge stubs, deduplicates, and merges collinear ridges
function cleanupSkeletonLines(
  rawLines: SkeletonLine[],
  perimeterPts: Point2D[] = [],
  options?: { levelId?: string; idPrefix?: string }
): SkeletonLine[] {
  let lines = rawLines
    .filter((l) => dist(l.from, l.to) > 0.02)
    .map((l) => ({
      ...l,
      from: { x: +l.from.x.toFixed(3), y: +l.from.y.toFixed(3) },
      to: { x: +l.to.x.toFixed(3), y: +l.to.y.toFixed(3) }
    }));

  const isPerimeterAnchor = (pt: Point2D): boolean =>
    perimeterPts.some((p) => pointsClose(p, pt, 0.04));

  // 1. Collapse very short interior segments (< 0.35m) between non-perimeter junctions
  //    so minor wing-width differences snap into clean intersections instead of tiny ridge fragments.
  const minInteriorLen = 0.35;
  let collapsedAny = true;
  let guard = 0;
  while (collapsedAny && guard++ < 50) {
    collapsedAny = false;
    for (let i = 0; i < lines.length; i++) {
      const seg = lines[i];
      const len = dist(seg.from, seg.to);
      if (len >= minInteriorLen) continue;

      const fromFixed = isPerimeterAnchor(seg.from);
      const toFixed = isPerimeterAnchor(seg.to);
      if (fromFixed && toFixed) continue;

      // Count node degrees to prefer snapping lower-degree node onto main junction
      const degFrom = lines.filter(
        (l) => pointsClose(l.from, seg.from, 0.03) || pointsClose(l.to, seg.from, 0.03)
      ).length;
      const degTo = lines.filter(
        (l) => pointsClose(l.from, seg.to, 0.03) || pointsClose(l.to, seg.to, 0.03)
      ).length;

      let targetPt: Point2D;
      if (fromFixed) {
        targetPt = seg.from;
      } else if (toFixed) {
        targetPt = seg.to;
      } else if (degFrom > degTo) {
        targetPt = seg.from;
      } else if (degTo > degFrom) {
        targetPt = seg.to;
      } else {
        targetPt = {
          x: +((seg.from.x + seg.to.x) / 2).toFixed(3),
          y: +((seg.from.y + seg.to.y) / 2).toFixed(3)
        };
      }

      const oldA = seg.from;
      const oldB = seg.to;
      lines.splice(i, 1);

      lines = lines
        .map((l) => ({
          ...l,
          from:
            pointsClose(l.from, oldA, 0.03) || pointsClose(l.from, oldB, 0.03)
              ? { ...targetPt }
              : l.from,
          to:
            pointsClose(l.to, oldA, 0.03) || pointsClose(l.to, oldB, 0.03)
              ? { ...targetPt }
              : l.to
        }))
        .filter((l) => dist(l.from, l.to) > 0.02);

      collapsedAny = true;
      break;
    }
  }

  // Filter any leftover sub-0.25m lines that couldn't be collapsed cleanly
  lines = lines.filter((l) => dist(l.from, l.to) >= 0.25);

  // 2. Deduplicate lines (independent of direction)
  const deduped: SkeletonLine[] = [];
  lines.forEach((l) => {
    const isDup = deduped.some(
      (d) =>
        (pointsClose(d.from, l.from, 0.1) && pointsClose(d.to, l.to, 0.1)) ||
        (pointsClose(d.from, l.to, 0.1) && pointsClose(d.to, l.from, 0.1))
    );
    if (!isDup) deduped.push(l);
  });
  lines = deduped;

  // 3. Merge collinear ridge pieces into single continuous ridges parallel to eaves
  let mergedAny = true;
  let mergeGuard = 0;
  while (mergedAny && mergeGuard++ < 100) {
    mergedAny = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].suggestedType !== 'ridge') continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].suggestedType !== 'ridge') continue;

        const l1 = lines[i];
        const l2 = lines[j];

        let sharedPt: Point2D | null = null;
        let pA: Point2D | null = null;
        let pB: Point2D | null = null;

        if (pointsClose(l1.to, l2.from, 0.08)) {
          sharedPt = l1.to; pA = l1.from; pB = l2.to;
        } else if (pointsClose(l1.from, l2.to, 0.08)) {
          sharedPt = l1.from; pA = l1.to; pB = l2.from;
        } else if (pointsClose(l1.to, l2.to, 0.08)) {
          sharedPt = l1.to; pA = l1.from; pB = l2.from;
        } else if (pointsClose(l1.from, l2.from, 0.08)) {
          sharedPt = l1.from; pA = l1.to; pB = l2.to;
        }

        if (sharedPt && pA && pB) {
          const v1 = { x: sharedPt.x - pA.x, y: sharedPt.y - pA.y };
          const v2 = { x: pB.x - sharedPt.x, y: pB.y - sharedPt.y };
          const len1 = Math.hypot(v1.x, v1.y);
          const len2 = Math.hypot(v2.x, v2.y);
          if (len1 > 0.05 && len2 > 0.05) {
            const dot = (v1.x * v2.x + v1.y * v2.y) / (len1 * len2);
            if (dot > 0.985) {
              lines[i] = {
                id: l1.id,
                from: pA,
                to: pB,
                suggestedType: 'ridge'
              };
              lines.splice(j, 1);
              mergedAny = true;
              break;
            }
          }
        }
      }
      if (mergedAny) break;
    }
  }

  // 3b. Snap any non-perimeter junction endpoint within 0.12m of a continuous ridge flush onto it
  lines = lines.map((l) => {
    const snapPt = (pt: Point2D): Point2D => {
      if (isPerimeterAnchor(pt)) return pt;
      for (const r of lines) {
        if (r === l || r.suggestedType !== 'ridge') continue;
        if (pointsClose(pt, r.from, 0.03) || pointsClose(pt, r.to, 0.03)) continue;
        const d = distToSegment(pt, r.from, r.to);
        if (d > 1e-4 && d <= 0.12) {
          const l2 = (r.to.x - r.from.x) ** 2 + (r.to.y - r.from.y) ** 2;
          if (l2 > 1e-4) {
            const t = Math.max(
              0,
              Math.min(1, ((pt.x - r.from.x) * (r.to.x - r.from.x) + (pt.y - r.from.y) * (r.to.y - r.from.y)) / l2)
            );
            return {
              x: +(r.from.x + t * (r.to.x - r.from.x)).toFixed(3),
              y: +(r.from.y + t * (r.to.y - r.from.y)).toFixed(3)
            };
          }
        }
      }
      return pt;
    };

    return {
      ...l,
      from: snapPt(l.from),
      to: snapPt(l.to)
    };
  });

  // 3c. Final deduplication after collinear ridge merge & junction snapping
  const finalDeduped: SkeletonLine[] = [];
  lines.forEach((l) => {
    if (dist(l.from, l.to) < 0.25) return;
    const dupIdx = finalDeduped.findIndex(
      (d) =>
        (pointsClose(d.from, l.from, 0.1) && pointsClose(d.to, l.to, 0.1)) ||
        (pointsClose(d.from, l.to, 0.1) && pointsClose(d.to, l.from, 0.1))
    );
    if (dupIdx === -1) {
      finalDeduped.push(l);
    } else if (finalDeduped[dupIdx].suggestedType !== 'ridge' && l.suggestedType === 'ridge') {
      finalDeduped[dupIdx] = l;
    }
  });
  lines = finalDeduped;

  // 4. Deterministic clean IDs: longest ridge receives 'skel-ridge-1' (prefixed for level-2+)
  const prefix = options?.idPrefix ? `${options.idPrefix}__` : '';
  const levelProp = options?.levelId ? { levelId: options.levelId } : {};

  const ridges = lines
    .filter((l) => l.suggestedType === 'ridge')
    .sort((a, b) => dist(b.from, b.to) - dist(a.from, a.to))
    .map((l, idx) => ({ ...l, id: `${prefix}skel-ridge-${idx + 1}`, ...levelProp }));

  const valleys = lines
    .filter((l) => l.suggestedType === 'valley')
    .map((l, idx) => ({ ...l, id: `${prefix}skel-valley-${idx + 1}`, ...levelProp }));

  const hips = lines
    .filter((l) => l.suggestedType === 'hip')
    .map((l, idx) => ({ ...l, id: `${prefix}skel-hip-${idx + 1}`, ...levelProp }));

  return [...ridges, ...valleys, ...hips];
}

interface WaveEdge {
  id: number;
  dir: Point2D;
  normal: Point2D;
  speed: number; // 1 = sloped eave ('outline'), 0 = vertical gable wall ('verge')
}

interface WaveVertex {
  id: number;
  pos: Point2D;
  t0: number;
  vel: Point2D;
  isOpposingParallel: boolean;
  prevEdge: WaveEdge;
  nextEdge: WaveEdge;
  originKind: 'hip' | 'valley' | 'ridge';
}

function computeBisectorVelocity(
  nL: Point2D,
  nR: Point2D,
  sL = 1,
  sR = 1
): { vel: Point2D; isOpposingParallel: boolean } {
  const dot = nL.x * nR.x + nL.y * nR.y;
  const det = nL.x * nR.y - nL.y * nR.x;

  // Opposite parallel eaves meeting head-on
  if (dot < -0.999 && Math.abs(det) < 1e-3) {
    return { vel: { x: 0, y: 0 }, isOpposingParallel: true };
  }

  // Collinear same-direction edges
  if (dot > 0.999 && Math.abs(det) < 1e-3) {
    return { vel: { x: nL.x * sL, y: nL.y * sL }, isOpposingParallel: false };
  }

  const bx = (sL * nR.y - sR * nL.y) / det;
  const by = (nL.x * sR - nR.x * sL) / det;
  const mag = Math.hypot(bx, by);
  if (!Number.isFinite(mag) || mag > 250) {
    if (dot < 0) return { vel: { x: 0, y: 0 }, isOpposingParallel: true };
    return { vel: { x: nL.x * sL, y: nL.y * sL }, isOpposingParallel: false };
  }

  return { vel: { x: bx, y: by }, isOpposingParallel: false };
}

export interface ClassifiedOutlineCorner {
  point: Point2D;
  classification: 'convex' | 'reflex';
  lineRole: 'hip' | 'valley' | 'ridge';
  interiorAngleDeg: number;
  hasStationaryAdjacentEdge: boolean;
}

export function classifyOutlineCorners(outline: RoofOutline): ClassifiedOutlineCorner[] {
  const origPts = outline.points;
  if (origPts.length < 3) return [];

  const simplePts = simplifyOutlinePoints(origPts, outline.edges);
  const n = simplePts.length;
  if (n < 3) return [];

  const isCCW = getSignedArea(simplePts) > 0;
  const ccwPts = isCCW ? [...simplePts] : [...simplePts].reverse();

  const isStationaryWallSegment = (a: Point2D, b: Point2D): boolean => {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const segLen = dist(a, b) || 1;
    const dir = { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen };
    return outline.edges.some((oe) => {
      if (oe.type !== 'verge' && oe.type !== 'wall') return false;
      const oLen = dist(oe.from, oe.to) || 1;
      const oDir = { x: (oe.to.x - oe.from.x) / oLen, y: (oe.to.y - oe.from.y) / oLen };
      const align = Math.abs(dir.x * oDir.x + dir.y * oDir.y);
      return align > 0.92 && distToSegment(mid, oe.from, oe.to) < 0.15;
    });
  };

  return ccwPts.map((curr, i) => {
    const prev = ccwPts[(i - 1 + n) % n];
    const next = ccwPts[(i + 1) % n];
    const vPrev = { x: curr.x - prev.x, y: curr.y - prev.y };
    const vNext = { x: next.x - curr.x, y: next.y - curr.y };
    const len1 = Math.hypot(vPrev.x, vPrev.y) || 1;
    const len2 = Math.hypot(vNext.x, vNext.y) || 1;
    const cross = (vPrev.x * vNext.y - vPrev.y * vNext.x) / (len1 * len2);
    const dot = Math.max(-1, Math.min(1, (vPrev.x * vNext.x + vPrev.y * vNext.y) / (len1 * len2)));
    const turnRad = Math.acos(dot);
    const isReflex = cross < -0.015;
    const interiorAngleDeg = isReflex
      ? +(180 + (turnRad * 180) / Math.PI).toFixed(1)
      : +(180 - (turnRad * 180) / Math.PI).toFixed(1);
    const hasStationary =
      isStationaryWallSegment(prev, curr) || isStationaryWallSegment(curr, next);

    const matchOrig = origPts.find((p) => pointsClose(p, curr, 0.1));
    return {
      point: matchOrig ? { ...matchOrig } : { ...curr },
      classification: isReflex ? 'reflex' : 'convex',
      lineRole: isReflex ? 'valley' : hasStationary ? 'ridge' : 'hip',
      interiorAngleDeg,
      hasStationaryAdjacentEdge: hasStationary
    };
  });
}

function classifyWaveJunction(prevEdge: WaveEdge, nextEdge: WaveEdge): 'hip' | 'valley' | 'ridge' {
  const turnCross = prevEdge.dir.x * nextEdge.dir.y - prevEdge.dir.y * nextEdge.dir.x;
  const normalDot = prevEdge.normal.x * nextEdge.normal.x + prevEdge.normal.y * nextEdge.normal.y;

  // Opposing parallel eaves always meet along a continuous horizontal ridge parallel to both eaves
  if (normalDot < -0.92) {
    return 'ridge';
  }
  // Reflex inward bend forms a valley
  if (turnCross < -0.015) {
    return 'valley';
  }
  // Active sloped eave intersecting a stationary gable/wall feeds a ridge
  if (prevEdge.speed === 0 || nextEdge.speed === 0) {
    return 'ridge';
  }
  // Interior skeleton transitions formed after perimeter hip merges form ridge/spine segments
  // (keeping perimeter convex corners as the sole sources of essential hips)
  return 'ridge';
}

export function generateSkeletonLines(outline: RoofOutline): SkeletonLine[] {
  const origPts = outline.points;
  if (origPts.length < 3) return [];

  // Simplify consecutive duplicates & near-collinear wall noise (preserving verge transitions)
  const simplePts = simplifyOutlinePoints(origPts, outline.edges);
  const n = simplePts.length;
  if (n < 3) return [];

  // Ensure Counter-Clockwise (CCW) orientation so inward normal is always (-dy, dx)
  const isCCW = getSignedArea(simplePts) > 0;
  const ccwPts = isCCW ? [...simplePts] : [...simplePts].reverse();

  // Map each simplified point back to exact original outline point for face tracing
  const mapToOrig = (pt: Point2D): Point2D => {
    const match = origPts.find((p) => pointsClose(p, pt, 0.1));
    return match ? { ...match } : { ...pt };
  };

  // Detect whether segment a->b lies along a 'verge' (gable wall) or 'wall' (abutment wall) edge
  const isStationaryWallSegment = (a: Point2D, b: Point2D): boolean => {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const segLen = dist(a, b) || 1;
    const dir = { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen };
    return outline.edges.some((oe) => {
      if (oe.type !== 'verge' && oe.type !== 'wall') return false;
      const oLen = dist(oe.from, oe.to) || 1;
      const oDir = { x: (oe.to.x - oe.from.x) / oLen, y: (oe.to.y - oe.from.y) / oLen };
      const align = Math.abs(dir.x * oDir.x + dir.y * oDir.y);
      return align > 0.92 && distToSegment(mid, oe.from, oe.to) < 0.15;
    });
  };

  // STEP 1: Classify every perimeter corner explicitly into Convex (Hip) vs Reflex (Valley)
  const initialCorners = ccwPts.map((curr, i) => {
    const prev = ccwPts[(i - 1 + n) % n];
    const next = ccwPts[(i + 1) % n];
    const cross = crossProduct2D(prev, curr, next);
    const isReflex = cross < -0.015;
    return {
      idx: i,
      pt: curr,
      origPt: mapToOrig(curr),
      classification: isReflex ? ('reflex' as const) : ('convex' as const)
    };
  });

  // Construct initial wavefront edges (i -> i+1) with speed=0 on gable verges & abutment walls
  const waveEdges: WaveEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = initialCorners[i].origPt;
    const b = initialCorners[(i + 1) % n].origPt;
    const len = dist(a, b) || 1;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const normal = { x: -dir.y, y: dir.x };
    const speed = isStationaryWallSegment(a, b) ? 0 : 1;
    waveEdges.push({ id: i, dir, normal, speed });
  }

  let nextVertexId = 1;
  const initialVertices: WaveVertex[] = initialCorners.map((c, i) => {
    const prevEdge = waveEdges[(i - 1 + n) % n];
    const nextEdge = waveEdges[i];
    const { vel, isOpposingParallel } = computeBisectorVelocity(
      prevEdge.normal,
      nextEdge.normal,
      prevEdge.speed,
      nextEdge.speed
    );
    const hasVerge = prevEdge.speed === 0 || nextEdge.speed === 0;
    return {
      id: nextVertexId++,
      pos: { ...c.origPt },
      t0: 0,
      vel,
      isOpposingParallel,
      prevEdge,
      nextEdge,
      originKind: c.classification === 'reflex' ? 'valley' : hasVerge ? 'ridge' : 'hip'
    };
  });

  const posAt = (v: WaveVertex, t: number): Point2D => {
    const dt = t - v.t0;
    return {
      x: v.pos.x + dt * v.vel.x,
      y: v.pos.y + dt * v.vel.y
    };
  };

  const rawLines: SkeletonLine[] = [];
  let lineSeq = 1;
  const emitLine = (a: Point2D, b: Point2D, type: 'hip' | 'valley' | 'ridge') => {
    if (dist(a, b) <= 1e-4) return;
    if (!isSegmentInsidePolygon(a, b, ccwPts)) return;

    // Suppress segments running strictly along a perimeter wall (e.g. bisectors sliding along a gable verge)
    for (let i = 0; i < ccwPts.length; i++) {
      const eA = ccwPts[i];
      const eB = ccwPts[(i + 1) % ccwPts.length];
      if (distToSegment(a, eA, eB) <= 0.05 && distToSegment(b, eA, eB) <= 0.05) {
        return;
      }
      // If segment starts along a perimeter verge and continues inside the roof (step-down cheek), trim boundary overlap
      const eLen = dist(eA, eB) || 1;
      const eDir = { x: (eB.x - eA.x) / eLen, y: (eB.y - eA.y) / eLen };
      const sLen = dist(a, b) || 1;
      const sDir = { x: (b.x - a.x) / sLen, y: (b.y - a.y) / sLen };
      if (Math.abs(eDir.x * sDir.x + eDir.y * sDir.y) > 0.98) {
        if (distToSegment(a, eA, eB) <= 0.05 && distToSegment(b, eA, eB) > 0.08) {
          const exitPt = dist(eA, b) < dist(eB, b) ? eA : eB;
          if (dist(exitPt, b) > 0.05) {
            rawLines.push({
              id: `skel-raw-${lineSeq++}`,
              from: { ...exitPt },
              to: { ...b },
              suggestedType: type
            });
          }
          return;
        }
        if (distToSegment(b, eA, eB) <= 0.05 && distToSegment(a, eA, eB) > 0.08) {
          const exitPt = dist(eA, a) < dist(eB, a) ? eA : eB;
          if (dist(a, exitPt) > 0.05) {
            rawLines.push({
              id: `skel-raw-${lineSeq++}`,
              from: { ...a },
              to: { ...exitPt },
              suggestedType: type
            });
          }
          return;
        }
      }
    }

    rawLines.push({
      id: `skel-raw-${lineSeq++}`,
      from: { ...a },
      to: { ...b },
      suggestedType: type
    });
  };

  // Helper to resolve remaining parallel-opposing wing spine cleanly without star-bursting to a centroid
  const resolveParallelSpineFallback = (verts: WaveVertex[], currentT: number): boolean => {
    const m = verts.length;
    if (m < 2) return false;
    const qPts = verts.map((v) => posAt(v, currentT));

    // Find the two longest opposing active edges (speed > 0) or an active eave vs stationary wall
    let bestPair: [number, number] | null = null;
    let bestScore = -1;
    for (let i = 0; i < m; i++) {
      const eI = verts[i].nextEdge;
      const lenI = dist(qPts[i], qPts[(i + 1) % m]);
      for (let j = i + 1; j < m; j++) {
        const eJ = verts[j].nextEdge;
        const lenJ = dist(qPts[j], qPts[(j + 1) % m]);
        const dotN = eI.normal.x * eJ.normal.x + eI.normal.y * eJ.normal.y;
        if (dotN < -0.85 && (eI.speed > 0 || eJ.speed > 0)) {
          const score = lenI + lenJ;
          if (score > bestScore) {
            bestScore = score;
            bestPair = [i, j];
          }
        }
      }
    }

    if (!bestPair) return false;
    const [idxA, idxB] = bestPair;
    const eA = verts[idxA].nextEdge;
    const eB = verts[idxB].nextEdge;
    const a1 = qPts[idxA];
    const b1 = qPts[idxB];
    const perpD = Math.abs((b1.x - a1.x) * eA.normal.x + (b1.y - a1.y) * eA.normal.y);
    const speedSum = eA.speed + eB.speed || 1;
    const meetT = currentT + (perpD > 1e-4 ? perpD / speedSum : 0);

    // Project active vertices onto the parallel ridge line offset at meetT
    const spineOrigin = {
      x: a1.x + eA.normal.x * ((meetT - currentT) * eA.speed),
      y: a1.y + eA.normal.y * ((meetT - currentT) * eA.speed)
    };
    const spineDir = eA.dir;

    const projT: number[] = [];
    verts.forEach((v, idx) => {
      const q = qPts[idx];
      const movedPt = posAt(v, meetT);
      const tVal = (movedPt.x - spineOrigin.x) * spineDir.x + (movedPt.y - spineOrigin.y) * spineDir.y;
      const ridgeAnchor = {
        x: spineOrigin.x + spineDir.x * tVal,
        y: spineOrigin.y + spineDir.y * tVal
      };
      if (dist(q, ridgeAnchor) > 0.05) {
        emitLine(v.pos, ridgeAnchor, v.originKind);
      } else {
        emitLine(v.pos, q, v.originKind);
      }
      projT.push(tVal);
    });

    if (projT.length >= 2) {
      const minT = Math.min(...projT);
      const maxT = Math.max(...projT);
      if (maxT - minT > 0.15) {
        emitLine(
          { x: spineOrigin.x + spineDir.x * minT, y: spineOrigin.y + spineDir.y * minT },
          { x: spineOrigin.x + spineDir.x * maxT, y: spineOrigin.y + spineDir.y * maxT },
          'ridge'
        );
      }
    }
    return true;
  };

  // Collapse collinear same-direction equal-speed vertices formed when dormer/bay wings merge
  // back into a straight main eave, so valleys terminate cleanly at the junction instead of
  // propagating a phantom ridge seam through the upper roof slope.
  const pruneCollinearSeamVertices = (list: WaveVertex[]): WaveVertex[] => {
    const cur = [...list];
    let changed = true;
    let guard = 0;
    while (changed && cur.length >= 3 && guard++ < cur.length * 2) {
      changed = false;
      const len = cur.length;
      for (let i = 0; i < len; i++) {
        const v = cur[i];
        if (v.isOpposingParallel) continue;
        const nL = v.prevEdge.normal;
        const nR = v.nextEdge.normal;
        const dot = nL.x * nR.x + nL.y * nR.y;
        const det = nL.x * nR.y - nL.y * nR.x;
        const speedDiff = Math.abs(v.prevEdge.speed - v.nextEdge.speed);
        if (dot > 0.995 && Math.abs(det) < 0.08 && speedDiff < 0.05) {
          const nextIdx = (i + 1) % len;
          cur[nextIdx] = {
            ...cur[nextIdx],
            prevEdge: v.prevEdge
          };
          cur.splice(i, 1);
          changed = true;
          break;
        }
      }
    }
    return cur;
  };

  // STEP 2: Event-driven Straight Skeleton Wavefront Propagation
  // Handles convex N-gons, rectangles, L/T/U/H/Bay wings, courtyards, arbitrary gable/verge edges, and stepped roofs.
  const queue: { vertices: WaveVertex[]; currentT: number }[] = [
    { vertices: pruneCollinearSeamVertices(initialVertices), currentT: 0 }
  ];

  const MAX_GLOBAL_STEPS = n * 30 + 120;
  let globalSteps = 0;

  while (queue.length > 0 && globalSteps < MAX_GLOBAL_STEPS) {
    const loop = queue.shift()!;
    let verts = pruneCollinearSeamVertices(loop.vertices);
    let currentT = loop.currentT;

    let loopSteps = 0;
    const maxLoopSteps = verts.length * 15 + 40;

    while (verts.length >= 2 && loopSteps++ < maxLoopSteps && globalSteps++ < MAX_GLOBAL_STEPS) {
      verts = pruneCollinearSeamVertices(verts);
      const m = verts.length;

      // Guard if all remaining wavefront vertices are stationary (e.g. 100% verge perimeter)
      if (verts.every((v) => Math.hypot(v.vel.x, v.vel.y) < 1e-4 && !v.isOpposingParallel)) {
        break;
      }

      // Case A: Opposing 2-vertex ridge spine (advance any remaining parallel gap before emitting ridge)
      if (m === 2) {
        const e0 = verts[0].nextEdge;
        const e1 = verts[1].nextEdge;
        const q0 = posAt(verts[0], currentT);
        const q1 = posAt(verts[1], currentT);
        const gap = Math.abs((q1.x - q0.x) * e0.normal.x + (q1.y - q0.y) * e0.normal.y);
        const speedSum = e0.speed + e1.speed;
        const meetT =
          gap > 0.02 && speedSum > 0.01 ? currentT + gap / speedSum : currentT;
        const p0 = posAt(verts[0], meetT);
        const p1 = posAt(verts[1], meetT);
        emitLine(verts[0].pos, p0, verts[0].originKind);
        emitLine(verts[1].pos, p1, verts[1].originKind);
        emitLine(p0, p1, 'ridge');
        break;
      }

      // Case C: Parallel-Opposing Foldback (instant ridge collapse where two opposite edges meet)
      let folded = false;
      for (let i = 0; i < m; i++) {
        const v = verts[i];
        if (!v.isOpposingParallel) continue;

        const prevI = (i - 1 + m) % m;
        const nextI = (i + 1) % m;
        const u = verts[prevI];
        const w = verts[nextI];

        const qU = posAt(u, currentT);
        const qV = posAt(v, currentT);
        const qW = posAt(w, currentT);

        // Verify the opposing edges meet cleanly at currentT (zero perpendicular gap)
        const perpGap = Math.abs(
          (qW.x - qV.x) * v.prevEdge.normal.x + (qW.y - qV.y) * v.prevEdge.normal.y
        );
        if (perpGap > 0.3) continue;

        // If one side is a stationary wall/verge, fold the hairpin point onto the active neighbour cleanly
        if (v.prevEdge.speed === 0 && v.nextEdge.speed === 0) {
          verts.splice(i, 1);
          folded = true;
          break;
        }

        const lenL = dist(qU, qV);
        const lenR = dist(qV, qW);

        if (lenL <= lenR) {
          emitLine(u.pos, qU, u.originKind);
          emitLine(v.pos, qV, v.originKind);
          emitLine(qU, qV, 'ridge');

          const newVel = computeBisectorVelocity(
            u.prevEdge.normal,
            v.nextEdge.normal,
            u.prevEdge.speed,
            v.nextEdge.speed
          );
          u.pos = qU;
          u.t0 = currentT;
          u.nextEdge = v.nextEdge;
          u.vel = newVel.vel;
          u.isOpposingParallel = newVel.isOpposingParallel;
          u.originKind = classifyWaveJunction(u.prevEdge, v.nextEdge);

          verts.splice(i, 1);
        } else {
          emitLine(v.pos, qV, v.originKind);
          emitLine(w.pos, qW, w.originKind);
          emitLine(qV, qW, 'ridge');

          const newVel = computeBisectorVelocity(
            v.prevEdge.normal,
            w.nextEdge.normal,
            v.prevEdge.speed,
            w.nextEdge.speed
          );
          w.pos = qW;
          w.t0 = currentT;
          w.prevEdge = v.prevEdge;
          w.vel = newVel.vel;
          w.isOpposingParallel = newVel.isOpposingParallel;
          w.originKind = classifyWaveJunction(v.prevEdge, w.nextEdge);

          verts.splice(i, 1);
        }

        folded = true;
        break;
      }
      if (folded) continue;

      // Case D: Find earliest Edge Event vs Split Event
      let bestEdgeDt = Infinity;
      let bestEdgeIdx = -1;

      for (let i = 0; i < m; i++) {
        const vA = verts[i];
        const vB = verts[(i + 1) % m];
        if (vA.isOpposingParallel || vB.isOpposingParallel) continue;

        const e = vA.nextEdge;
        const qA = posAt(vA, currentT);
        const qB = posAt(vB, currentT);
        const curLen = (qB.x - qA.x) * e.dir.x + (qB.y - qA.y) * e.dir.y;
        const rate = (vB.vel.x - vA.vel.x) * e.dir.x + (vB.vel.y - vA.vel.y) * e.dir.y;

        let dt = Infinity;
        if (curLen <= 1e-4) {
          dt = 0;
        } else if (rate < -1e-6) {
          dt = -curLen / rate;
        }

        if (dt < bestEdgeDt) {
          bestEdgeDt = dt;
          bestEdgeIdx = i;
        }
      }

      let bestSplitDt = Infinity;
      let bestSplitVertIdx = -1;
      let bestSplitEdgeVertIdx = -1;
      let bestSplitPt: Point2D | null = null;

      for (let i = 0; i < m; i++) {
        const v = verts[i];
        if (v.isOpposingParallel) continue;
        // Only reflex turns in the current wavefront generate valleys that split opposing eaves
        const turnCross = v.prevEdge.dir.x * v.nextEdge.dir.y - v.prevEdge.dir.y * v.nextEdge.dir.x;
        if (turnCross >= -1e-4) continue;

        const qV = posAt(v, currentT);

        for (let j = 0; j < m; j++) {
          const jNext = (j + 1) % m;
          if (j === i || jNext === i) continue;

          const vJ = verts[j];
          const vJNext = verts[jNext];
          const e = vJ.nextEdge;
          if (e.id === v.prevEdge.id || e.id === v.nextEdge.id) continue;
          if (vJ.isOpposingParallel || vJNext.isOpposingParallel) continue;

          const qJ = posAt(vJ, currentT);
          const h0 = (qV.x - qJ.x) * e.normal.x + (qV.y - qJ.y) * e.normal.y;
          const dh = v.vel.x * e.normal.x + v.vel.y * e.normal.y - e.speed;

          if (h0 < -1e-4 || dh >= -1e-6) continue;
          const dt = Math.max(0, -h0 / dh);
          if (dt >= bestSplitDt - 1e-6) continue;

          const hitT = currentT + dt;
          const X = posAt(v, hitT);
          const aPrime = posAt(vJ, hitT);
          const bPrime = posAt(vJNext, hitT);
          const lenPrime = (bPrime.x - aPrime.x) * e.dir.x + (bPrime.y - aPrime.y) * e.dir.y;
          const s = (X.x - aPrime.x) * e.dir.x + (X.y - aPrime.y) * e.dir.y;

          if (lenPrime >= -1e-4 && s >= -0.02 && s <= Math.max(0, lenPrime) + 0.02) {
            bestSplitDt = dt;
            bestSplitVertIdx = i;
            bestSplitEdgeVertIdx = j;
            bestSplitPt = X;
          }
        }
      }

      if (!Number.isFinite(bestEdgeDt) && !Number.isFinite(bestSplitDt)) {
        // Resolve remaining opposing eaves via eave-parallel ridge spine (never a center star-burst!)
        resolveParallelSpineFallback(verts, currentT);
        break;
      }

      // Execute earliest event (tie-break slightly toward Edge Events so wing tips collapse cleanly first)
      if (bestEdgeDt <= bestSplitDt + 1e-5 && bestEdgeIdx >= 0) {
        const newT = currentT + bestEdgeDt;
        const nextI = (bestEdgeIdx + 1) % m;
        const vA = verts[bestEdgeIdx];
        const vB = verts[nextI];
        const pA = posAt(vA, newT);
        const pB = posAt(vB, newT);
        const X: Point2D = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };

        emitLine(vA.pos, X, vA.originKind);
        emitLine(vB.pos, X, vB.originKind);

        const newVel = computeBisectorVelocity(
          vA.prevEdge.normal,
          vB.nextEdge.normal,
          vA.prevEdge.speed,
          vB.nextEdge.speed
        );

        const vNew: WaveVertex = {
          id: nextVertexId++,
          pos: X,
          t0: newT,
          vel: newVel.vel,
          isOpposingParallel: newVel.isOpposingParallel,
          prevEdge: vA.prevEdge,
          nextEdge: vB.nextEdge,
          originKind: classifyWaveJunction(vA.prevEdge, vB.nextEdge)
        };

        if (bestEdgeIdx < nextI) {
          verts.splice(bestEdgeIdx, 2, vNew);
        } else {
          // Wrap-around edge (m-1 -> 0)
          verts.pop();
          verts.shift();
          verts.push(vNew);
        }
        currentT = newT;
      } else if (bestSplitVertIdx >= 0 && bestSplitEdgeVertIdx >= 0 && bestSplitPt) {
        const newT = currentT + bestSplitDt;
        const i = bestSplitVertIdx;
        const j = bestSplitEdgeVertIdx;
        const v = verts[i];
        const e = verts[j].nextEdge;
        const X = bestSplitPt;

        emitLine(v.pos, X, v.originKind);

        const chainA: WaveVertex[] = [];
        let cursor = (j + 1) % m;
        while (cursor !== i) {
          chainA.push(verts[cursor]);
          cursor = (cursor + 1) % m;
        }

        const chainB: WaveVertex[] = [];
        cursor = (i + 1) % m;
        while (true) {
          chainB.push(verts[cursor]);
          if (cursor === j) break;
          cursor = (cursor + 1) % m;
        }

        const velLeft = computeBisectorVelocity(
          v.prevEdge.normal,
          e.normal,
          v.prevEdge.speed,
          e.speed
        );
        const vLeft: WaveVertex = {
          id: nextVertexId++,
          pos: X,
          t0: newT,
          vel: velLeft.vel,
          isOpposingParallel: velLeft.isOpposingParallel,
          prevEdge: v.prevEdge,
          nextEdge: e,
          originKind: classifyWaveJunction(v.prevEdge, e)
        };

        const velRight = computeBisectorVelocity(
          e.normal,
          v.nextEdge.normal,
          e.speed,
          v.nextEdge.speed
        );
        const vRight: WaveVertex = {
          id: nextVertexId++,
          pos: X,
          t0: newT,
          vel: velRight.vel,
          isOpposingParallel: velRight.isOpposingParallel,
          prevEdge: e,
          nextEdge: v.nextEdge,
          originKind: classifyWaveJunction(e, v.nextEdge)
        };

        const loopA = [vLeft, ...chainA];
        const loopB = [vRight, ...chainB];

        if (loopB.length >= 2) {
          queue.push({ vertices: loopB, currentT: newT });
        }
        verts = loopA;
        currentT = newT;
      }
    }
  }

  return cleanupSkeletonLines(rawLines, origPts, {
    levelId: outline.levelId,
    idPrefix: getLevelIdPrefixFromOutline(outline)
  });
}

// ---------------------------------------------------------------------------
// 3. FACE FINDING, HIP <-> GABLE TOGGLING & PLANE CREATION
// ---------------------------------------------------------------------------
export function getRoofJunctionNodes(
  outline: RoofOutline,
  skeleton: SkeletonLine[]
): RoofJunctionNode[] {
  const nodes: RoofJunctionNode[] = [];
  const seenKeys = new Set<string>();

  const ridges = skeleton.filter((s) => s.suggestedType === 'ridge');
  const hips = skeleton.filter((s) => s.suggestedType === 'hip');

  ridges.forEach((ridge) => {
    const endpoints: Array<{ pt: Point2D; other: Point2D }> = [
      { pt: ridge.from, other: ridge.to },
      { pt: ridge.to, other: ridge.from }
    ];

    endpoints.forEach(({ pt, other }) => {
      // 1. Check Hipped junction: ridge endpoint meets 2 hips running to adjacent corners of an outline edge
      const attachedHips = hips.filter(
        (h) => pointsClose(h.from, pt, 0.2) || pointsClose(h.to, pt, 0.2)
      );

      if (attachedHips.length >= 2) {
        const hipTips = attachedHips.map((h) => ({
          hip: h,
          tip: pointsClose(h.from, pt, 0.2) ? h.to : h.from
        }));

        for (const edge of outline.edges) {
          const tipA = hipTips.find((t) => pointsClose(t.tip, edge.from, 0.25));
          const tipB = hipTips.find((t) => pointsClose(t.tip, edge.to, 0.25));
          if (tipA && tipB && tipA.hip.id !== tipB.hip.id) {
            const intersect = lineLineIntersection(other, pt, edge.from, edge.to);
            const midEdge = {
              x: +((edge.from.x + edge.to.x) / 2).toFixed(3),
              y: +((edge.from.y + edge.to.y) / 2).toFixed(3)
            };
            const gableApex =
              intersect && distToSegment(intersect, edge.from, edge.to) < 0.4
                ? intersect
                : midEdge;

            const key = `junction-${edge.id}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              nodes.push({
                id: key,
                mode: 'hipped',
                point: pt,
                ridgeId: ridge.id,
                hipIds: [tipA.hip.id, tipB.hip.id],
                eaveEdgeId: edge.id,
                cornerA: edge.from,
                cornerB: edge.to,
                gableApex
              });
            }
            return;
          }
        }
      }

      // 2. Check Gable peak: ridge endpoint terminates right on an outline edge (verge or boundary) with no hips
      if (attachedHips.length === 0) {
        for (const edge of outline.edges) {
          if (distToSegment(pt, edge.from, edge.to) < 0.25) {
            const key = `junction-${edge.id}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              nodes.push({
                id: key,
                mode: 'gable',
                point: pt,
                ridgeId: ridge.id,
                hipIds: [],
                eaveEdgeId: edge.id,
                cornerA: edge.from,
                cornerB: edge.to,
                gableApex: pt
              });
            }
            return;
          }
        }
      }
    });
  });

  return nodes;
}

export function setEdgeMode(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  edgeId: string,
  targetMode: 'hipped' | 'gable' | 'wall'
): {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  toggledTo: 'hipped' | 'gable' | 'wall' | null;
  edge?: PlanEdge;
} {
  const edge = outline.edges.find((e) => e.id === edgeId);
  if (!edge) {
    return { outline, skeleton, toggledTo: null };
  }

  // Ensure at least 1 roof edge remains an eave ('outline') so sloped roof sheets exist
  if (targetMode === 'gable' || targetMode === 'wall') {
    const remainingOutlineCount = outline.edges.filter(
      (e) => e.id !== edgeId && e.type !== 'verge' && e.type !== 'wall'
    ).length;
    if (remainingOutlineCount < 1) {
      return { outline, skeleton, toggledTo: null, edge };
    }
  }

  const nextEdgeType: PlanEdge['type'] =
    targetMode === 'gable' ? 'verge' : targetMode === 'wall' ? 'wall' : 'outline';

  if (edge.type === nextEdgeType) {
    return { outline, skeleton, toggledTo: targetMode, edge };
  }

  const nextOutline: RoofOutline = {
    ...outline,
    edges: outline.edges.map((e) => (e.id === edgeId ? { ...e, type: nextEdgeType } : e))
  };
  const nextSkeleton = generateSkeletonLines(nextOutline);

  return {
    outline: nextOutline,
    skeleton: nextSkeleton,
    toggledTo: targetMode,
    edge: { ...edge, type: nextEdgeType }
  };
}

export function setEdgeWall(
  outline: RoofOutline,
  edgeId: string,
  updates: {
    hasWall?: boolean;
    eaveSetbackM?: number;
    wallBottomZ?: number;
  }
): RoofOutline {
  const edge = outline.edges.find((e) => e.id === edgeId);
  if (!edge) return outline;

  return {
    ...outline,
    edges: outline.edges.map((e) => {
      if (e.id !== edgeId) return e;
      const nextHasWall = updates.hasWall !== undefined ? updates.hasWall : e.hasWall;
      const nextSetback =
        updates.eaveSetbackM !== undefined
          ? +Math.max(0, Math.min(3.0, updates.eaveSetbackM)).toFixed(2)
          : e.eaveSetbackM;
      const nextBottomZ =
        updates.wallBottomZ !== undefined ? +updates.wallBottomZ.toFixed(2) : e.wallBottomZ;
      return {
        ...e,
        hasWall: nextHasWall,
        eaveSetbackM: nextSetback,
        wallBottomZ: nextBottomZ
      };
    })
  };
}

export function toggleEdgeGable(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  edgeId: string,
  forceMode?: 'hipped' | 'gable'
): {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  toggledTo: 'gable' | 'hipped' | null;
  edge?: PlanEdge;
} {
  const edge = outline.edges.find((e) => e.id === edgeId);
  if (!edge) {
    return { outline, skeleton, toggledTo: null };
  }

  const targetIsGable =
    forceMode !== undefined ? forceMode === 'gable' : edge.type !== 'verge';

  // Ensure at least 1 roof edge remains an eave ('outline') so roof slopes exist
  const remainingOutlineCount = outline.edges.filter(
    (e) => e.id !== edgeId && e.type !== 'verge' && e.type !== 'wall'
  ).length;
  if (targetIsGable && remainingOutlineCount < 1) {
    return { outline, skeleton, toggledTo: null, edge };
  }

  const nextEdgeType: PlanEdge['type'] = targetIsGable ? 'verge' : 'outline';
  if (edge.type === nextEdgeType) {
    return {
      outline,
      skeleton,
      toggledTo: targetIsGable ? 'gable' : 'hipped',
      edge
    };
  }

  const nextOutline: RoofOutline = {
    ...outline,
    edges: outline.edges.map((e) =>
      e.id === edgeId ? { ...e, type: nextEdgeType } : e
    )
  };
  const nextSkeleton = generateSkeletonLines(nextOutline);

  return {
    outline: nextOutline,
    skeleton: nextSkeleton,
    toggledTo: targetIsGable ? 'gable' : 'hipped',
    edge: { ...edge, type: nextEdgeType }
  };
}

export function applyRoofStylePreset(
  outline: RoofOutline,
  mode: 'hipped' | 'gable'
): {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
} {
  if (outline.edges.length === 0) {
    return { outline, skeleton: [] };
  }

  if (mode === 'hipped') {
    const nextOutline: RoofOutline = {
      ...outline,
      edges: outline.edges.map((e) => ({ ...e, type: 'outline' }))
    };
    return {
      outline: nextOutline,
      skeleton: generateSkeletonLines(nextOutline)
    };
  }

  // 'gable' preset: keep edges aligned with the longest primary wall axis as eaves ('outline'),
  // and turn perpendicular / wing end walls into 'verge' gable ends!
  const longestEdge = [...outline.edges].sort(
    (a, b) => dist(b.from, b.to) - dist(a.from, a.to)
  )[0];
  const lLen = dist(longestEdge.from, longestEdge.to) || 1;
  const mainAxis = {
    x: (longestEdge.to.x - longestEdge.from.x) / lLen,
    y: (longestEdge.to.y - longestEdge.from.y) / lLen
  };

  let nextEdges: PlanEdge[] = outline.edges.map((e) => {
    const eLen = dist(e.from, e.to) || 1;
    const eDir = { x: (e.to.x - e.from.x) / eLen, y: (e.to.y - e.from.y) / eLen };
    const dot = Math.abs(eDir.x * mainAxis.x + eDir.y * mainAxis.y);
    return {
      ...e,
      type: e.type === 'wall' ? 'wall' : dot > 0.707 ? 'outline' : 'verge'
    };
  });

  // Safety guarantee: keep at least 2 longest eaves non-verge if polygon has degenerate angles
  if (nextEdges.filter((e) => e.type !== 'verge' && e.type !== 'wall').length < 1) {
    const topTwoIds = new Set(
      [...outline.edges]
        .sort((a, b) => dist(b.from, b.to) - dist(a.from, a.to))
        .slice(0, 2)
        .map((e) => e.id)
    );
    nextEdges = outline.edges.map((e) => ({
      ...e,
      type: topTwoIds.has(e.id) ? 'outline' : 'verge'
    }));
  }

  const nextOutline: RoofOutline = {
    ...outline,
    edges: nextEdges
  };
  return {
    outline: nextOutline,
    skeleton: generateSkeletonLines(nextOutline)
  };
}

export function toggleJunctionGable(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  targetIdOrPoint: string | Point2D
): {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  toggledTo: 'gable' | 'hipped' | null;
  junction?: RoofJunctionNode;
} {
  const nodes = getRoofJunctionNodes(outline, skeleton);
  const target =
    typeof targetIdOrPoint === 'string'
      ? nodes.find((n) => n.id === targetIdOrPoint)
      : nodes.find((n) => pointsClose(n.point, targetIdOrPoint, 0.75));

  if (!target) {
    // Allow direct 'junction-<edgeId>' lookup even if junction wasn't in ridge+2-hips pattern
    if (typeof targetIdOrPoint === 'string' && targetIdOrPoint.startsWith('junction-')) {
      const edgeId = targetIdOrPoint.replace(/^junction-/, '');
      const res = toggleEdgeGable(outline, skeleton, edgeId);
      return {
        outline: res.outline,
        skeleton: res.skeleton,
        toggledTo: res.toggledTo
      };
    }
    return { outline, skeleton, toggledTo: null };
  }

  const forceMode: 'gable' | 'hipped' = target.mode === 'hipped' ? 'gable' : 'hipped';
  const res = toggleEdgeGable(outline, skeleton, target.eaveEdgeId, forceMode);
  return {
    outline: res.outline,
    skeleton: res.skeleton,
    toggledTo: res.toggledTo,
    junction: target
  };
}

export function syncPlanesWithOutlineAndSkeleton(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  existingPlanes: RoofPlane[],
  defaultPitchDeg = 22.5,
  levelMeta?: {
    levelId?: string;
    levelCode?: string;
    levelName?: string;
    defaultEaveHeightM?: number;
    paletteOffset?: number;
  }
): RoofPlane[] {
  const prevByEdge = new Map(existingPlanes.map((p) => [p.eaveEdgeId, p]));
  const result: RoofPlane[] = [];

  outline.edges.forEach((edge, idx) => {
    if (edge.type !== 'outline') return; // Only classified Eave ('outline') edges generate automatic slope sheet planes
    const existing = prevByEdge.get(edge.id);
    const resolvedEaveHeight =
      edge.eaveHeightM ?? existing?.eaveHeightM ?? levelMeta?.defaultEaveHeightM ?? 2.7;

    if (existing) {
      result.push(
        createPlaneFromEdge(outline, skeleton, edge, {
          pitchDeg: existing.pitchDeg,
          underlapSide: existing.underlapSide,
          eaveHeightM: resolvedEaveHeight,
          orderedSheetLengthM: existing.orderedSheetLengthM,
          sheetRunEdgeId: existing.sheetRunEdgeId,
          name: existing.name,
          existingId: existing.id,
          isStartEdge: existing.isStartEdge,
          existingPlanesCount: (levelMeta?.paletteOffset || 0) + result.length,
          levelId: levelMeta?.levelId ?? existing.levelId ?? edge.levelId ?? outline.levelId,
          levelCode: levelMeta?.levelCode ?? existing.levelCode,
          levelName: levelMeta?.levelName ?? existing.levelName
        })
      );
    } else {
      result.push(
        createPlaneFromEdge(outline, skeleton, edge, {
          pitchDeg: defaultPitchDeg,
          underlapSide: idx % 2 === 0 ? 'left' : 'right',
          eaveHeightM: resolvedEaveHeight,
          existingPlanesCount: (levelMeta?.paletteOffset || 0) + result.length,
          levelId: levelMeta?.levelId ?? edge.levelId ?? outline.levelId,
          levelCode: levelMeta?.levelCode,
          levelName: levelMeta?.levelName
        })
      );
    }
  });

  return result;
}

export function createPlaneFromEdge(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  eaveEdge: PlanEdge,
  options: {
    pitchDeg?: number;
    underlapSide?: 'left' | 'right';
    eaveHeightM?: number;
    orderedSheetLengthM?: number;
    sheetRunEdgeId?: string;
    name?: string;
    existingPlanesCount?: number;
    existingId?: string;
    isStartEdge?: boolean;
    levelId?: string;
    levelCode?: string;
    levelName?: string;
  }
): RoofPlane {
  const pitchDeg = options.pitchDeg ?? 22.5;
  const underlapSide = options.underlapSide ?? 'left';
  const eaveHeightM = +(options.eaveHeightM ?? eaveEdge.eaveHeightM ?? 2.7).toFixed(2);
  const sheetRunEdge =
    (options.sheetRunEdgeId
      ? outline.edges.find((e) => e.id === options.sheetRunEdgeId)
      : undefined) || eaveEdge;

  // Build polygon cycle around eave edge
  const polygon = traceFacePolygon(outline, skeleton, eaveEdge);

  // Developed geometry: unfold along true slope length & chosen sheet run perpendicular edge
  const { developedPolygon, slopeLength, runDirection } = computeDevelopedGeometry(
    polygon,
    eaveEdge,
    pitchDeg,
    undefined,
    sheetRunEdge
  );

  // Area of developed polygon
  const area = polygonArea(developedPolygon);

  // Classify edges of the closed face
  const edges = classifyFaceEdges(polygon, eaveEdge, skeleton, outline);

  // Determine section code & label cleanly across single & multi-level roofs
  const edgeIdx = outline.edges.findIndex((e) => e.id === eaveEdge.id);
  const paletteIdx =
    options.existingPlanesCount !== undefined
      ? options.existingPlanesCount
      : Math.max(0, edgeIdx >= 0 ? edgeIdx : 0);
  const colorDef = SECTION_PALETTE[paletteIdx % SECTION_PALETTE.length];

  const planeId = options.existingId || `plane-${eaveEdge.id}-${Date.now().toString().slice(-4)}`;
  const levelTag = options.levelCode ? `${options.levelCode} · ` : '';
  const defaultName = options.name || `${levelTag}${colorDef.name} Section (${slopeLength.toFixed(1)}m)`;

  return {
    id: planeId,
    code: colorDef.code,
    label: `${colorDef.name.toUpperCase()} ${colorDef.code}`,
    name: defaultName,
    color: colorDef.hex,
    planPolygon: polygon,
    eaveEdgeId: eaveEdge.id,
    sheetRunEdgeId: sheetRunEdge.id,
    pitchDeg,
    underlapSide,
    eaveHeightM,
    developedPolygon,
    slopeLength,
    ...(options.orderedSheetLengthM && options.orderedSheetLengthM > 0.2
      ? { orderedSheetLengthM: +options.orderedSheetLengthM.toFixed(3) }
      : {}),
    eaveWidthM: +dist(eaveEdge.from, eaveEdge.to).toFixed(3),
    runDirection,
    area: +area.toFixed(2),
    edges,
    role: 'balanced',
    isStartEdge: options.isStartEdge,
    ...(options.levelId ?? eaveEdge.levelId ?? outline.levelId
      ? { levelId: options.levelId ?? eaveEdge.levelId ?? outline.levelId }
      : {}),
    ...(options.levelCode ? { levelCode: options.levelCode } : {}),
    ...(options.levelName ? { levelName: options.levelName } : {})
  };
}

function traceFacePolygonPlanar(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  eaveEdge: PlanEdge
): Point2D[] | null {
  if (outline.edges.length < 3 || skeleton.length === 0) return null;

  const pA = eaveEdge.from;
  const pB = eaveEdge.to;
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const edgeLen = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / edgeLen, y: dy / edgeLen };
  const leftNorm = { x: -dir.y, y: dir.x };
  const mid = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
  const interiorIsLeft = isPointInPolygon(
    { x: mid.x + leftNorm.x * 0.08, y: mid.y + leftNorm.y * 0.08 },
    outline.points
  );

  // Build deduplicated vertex pool
  const nodes: Point2D[] = [];
  const getOrAddNode = (pt: Point2D): number => {
    const idx = nodes.findIndex((n) => dist(n, pt) < 0.08);
    if (idx >= 0) return idx;
    nodes.push({ x: +pt.x.toFixed(3), y: +pt.y.toFixed(3) });
    return nodes.length - 1;
  };

  const rawSegs: { a: Point2D; b: Point2D }[] = [
    ...outline.edges.map((e) => ({ a: e.from, b: e.to })),
    ...skeleton.map((s) => ({ a: s.from, b: s.to }))
  ].filter((seg) => dist(seg.a, seg.b) > 0.05);

  rawSegs.forEach((seg) => {
    getOrAddNode(seg.a);
    getOrAddNode(seg.b);
  });

  // Also add interior skeleton-skeleton crossing nodes if any exist
  for (let i = 0; i < skeleton.length; i++) {
    for (let j = i + 1; j < skeleton.length; j++) {
      const s1 = skeleton[i];
      const s2 = skeleton[j];
      const inter = lineLineIntersection(s1.from, s1.to, s2.from, s2.to);
      if (
        inter &&
        distToSegment(inter, s1.from, s1.to) < 0.06 &&
        distToSegment(inter, s2.from, s2.to) < 0.06
      ) {
        getOrAddNode(inter);
      }
    }
  }

  // Split every segment by any node lying cleanly inside it (handles verge T-junctions & ridges)
  const adj = new Map<number, Set<number>>();
  nodes.forEach((_, idx) => adj.set(idx, new Set<number>()));

  rawSegs.forEach((seg) => {
    const segLen = dist(seg.a, seg.b) || 1;
    const ux = (seg.b.x - seg.a.x) / segLen;
    const uy = (seg.b.y - seg.a.y) / segLen;

    const onSeg: { idx: number; proj: number }[] = [];
    nodes.forEach((pt, idx) => {
      if (distToSegment(pt, seg.a, seg.b) <= 0.08) {
        const proj = (pt.x - seg.a.x) * ux + (pt.y - seg.a.y) * uy;
        onSeg.push({ idx, proj });
      }
    });
    onSeg.sort((x, y) => x.proj - y.proj);

    for (let k = 0; k < onSeg.length - 1; k++) {
      const u = onSeg[k].idx;
      const v = onSeg[k + 1].idx;
      if (u !== v) {
        adj.get(u)?.add(v);
        adj.get(v)?.add(u);
      }
    }
  });

  // Order split nodes along eaveEdge from pA to pB
  const startNodeIdx = nodes.findIndex((n) => dist(n, pA) < 0.08);
  const endNodeIdx = nodes.findIndex((n) => dist(n, pB) < 0.08);
  if (startNodeIdx < 0 || endNodeIdx < 0) return null;

  const eaveNodes = nodes
    .map((pt, idx) => ({
      idx,
      pt,
      proj: (pt.x - pA.x) * dir.x + (pt.y - pA.y) * dir.y
    }))
    .filter((item) => distToSegment(item.pt, pA, pB) <= 0.08)
    .sort((a, b) => a.proj - b.proj);

  if (eaveNodes.length < 2) return null;

  const cycleIndices: number[] = eaveNodes.map((n) => n.idx);
  let prevIdx = cycleIndices[cycleIndices.length - 2];
  let currIdx = cycleIndices[cycleIndices.length - 1];

  const MAX_STEPS = 42;
  for (let step = 0; step < MAX_STEPS; step++) {
    const prevPt = nodes[prevIdx];
    const currPt = nodes[currIdx];
    const inAngle = Math.atan2(prevPt.y - currPt.y, prevPt.x - currPt.x);

    const neighbors = Array.from(adj.get(currIdx) || []).filter((nb) => nb !== prevIdx);
    if (neighbors.length === 0) return null;

    let bestNb = -1;
    let bestDelta = Infinity;
    const TWO_PI = Math.PI * 2;

    for (const nb of neighbors) {
      const nbPt = nodes[nb];
      const ang = Math.atan2(nbPt.y - currPt.y, nbPt.x - currPt.x);
      let delta = interiorIsLeft ? inAngle - ang : ang - inAngle;
      while (delta <= 1e-4) delta += TWO_PI;
      while (delta > TWO_PI + 1e-4) delta -= TWO_PI;
      if (delta < bestDelta) {
        bestDelta = delta;
        bestNb = nb;
      }
    }

    if (bestNb < 0) return null;
    if (bestNb === cycleIndices[0]) break;
    if (cycleIndices.includes(bestNb)) return null;

    cycleIndices.push(bestNb);
    prevIdx = currIdx;
    currIdx = bestNb;
  }

  if (cycleIndices.length < 3) return null;

  // Preserve exact pA -> pB as polygon[0] -> polygon[1] invariant, keeping all interior vertices in order
  const interiorStartOffset = eaveNodes.length;
  const poly: Point2D[] = [
    pA,
    pB,
    ...cycleIndices.slice(interiorStartOffset).map((idx) => nodes[idx])
  ];

  if (poly.length < 3 || polygonArea(poly) <= 0.05) return null;
  const c = polygonCentroid(poly);
  if (!isPointInPolygon(c, outline.points)) return null;

  return poly;
}

function traceFacePolygon(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  eaveEdge: PlanEdge
): Point2D[] {
  const activeEavesCount = outline.edges.filter((e) => e.type === 'outline').length;

  // When skeleton lines exist (manual or auto), always trace closed planar faces first
  if (skeleton.length > 0) {
    const planarPoly = traceFacePolygonPlanar(outline, skeleton, eaveEdge);
    if (planarPoly && planarPoly.length >= 3) {
      return planarPoly;
    }
  }

  // True single-slope / monopitch sweep across full footprint ONLY when <= 1 eave exists and no skeleton splits it
  if (
    outline.points.length >= 3 &&
    skeleton.length === 0 &&
    activeEavesCount <= 1
  ) {
    const startIdx = outline.points.findIndex((pt) => pointsClose(pt, eaveEdge.from, 0.08));
    if (startIdx >= 0) {
      const nextPt = outline.points[(startIdx + 1) % outline.points.length];
      if (pointsClose(nextPt, eaveEdge.to, 0.08)) {
        return [
          ...outline.points.slice(startIdx),
          ...outline.points.slice(0, startIdx)
        ];
      }
      const rev = [...outline.points].reverse();
      const revIdx = rev.findIndex((pt) => pointsClose(pt, eaveEdge.from, 0.08));
      if (revIdx >= 0) {
        return [...rev.slice(revIdx), ...rev.slice(0, revIdx)];
      }
    }
  }

  const pA = eaveEdge.from;
  const pB = eaveEdge.to;

  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const edgeLen = Math.hypot(dx, dy) || 1;
  const normal: Point2D = { x: -dy / edgeLen, y: dx / edgeLen };

  const mid: Point2D = { x: (pA.x + pB.x) / 2, y: (pA.y + pB.y) / 2 };
  const testPt: Point2D = { x: mid.x + normal.x * 0.1, y: mid.y + normal.y * 0.1 };
  const isIn = isPointInPolygon(testPt, outline.points);
  const inwardNorm: Point2D = isIn ? normal : { x: -normal.x, y: -normal.y };

  const connectedSkel = skeleton.filter(
    (s) =>
      pointsClose(s.from, pA) ||
      pointsClose(s.to, pA) ||
      pointsClose(s.from, pB) ||
      pointsClose(s.to, pB)
  );

  const topVertices: Point2D[] = [];
  connectedSkel.forEach((s) => {
    const opp = pointsClose(s.from, pA) || pointsClose(s.from, pB) ? s.to : s.from;
    const dot = (opp.x - mid.x) * inwardNorm.x + (opp.y - mid.y) * inwardNorm.y;
    if (dot > 0 && !topVertices.some((v) => pointsClose(v, opp))) {
      topVertices.push(opp);
    }
  });

  // Also include gable peak ridge endpoints lying along adjacent 'verge' outline edges
  const adjacentEdges = outline.edges.filter(
    (e) =>
      e.id !== eaveEdge.id &&
      (pointsClose(e.from, pA, 0.15) ||
        pointsClose(e.to, pA, 0.15) ||
        pointsClose(e.from, pB, 0.15) ||
        pointsClose(e.to, pB, 0.15))
  );
  const ridges = skeleton.filter((s) => s.suggestedType === 'ridge');
  adjacentEdges.forEach((adj) => {
    const hasAttachedHipAtSharedCorner =
      (pointsClose(adj.from, pA, 0.15) || pointsClose(adj.to, pA, 0.15))
        ? skeleton.some(
            (s) =>
              s.suggestedType === 'hip' &&
              (pointsClose(s.from, pA, 0.15) || pointsClose(s.to, pA, 0.15))
          )
        : skeleton.some(
            (s) =>
              s.suggestedType === 'hip' &&
              (pointsClose(s.from, pB, 0.15) || pointsClose(s.to, pB, 0.15))
          );

    if (adj.type === 'verge' || !hasAttachedHipAtSharedCorner) {
      ridges.forEach((r) => {
        [r.from, r.to].forEach((endPt) => {
          if (distToSegment(endPt, adj.from, adj.to) < 0.25) {
            const dot = (endPt.x - mid.x) * inwardNorm.x + (endPt.y - mid.y) * inwardNorm.y;
            if (dot > 0 && !topVertices.some((v) => pointsClose(v, endPt, 0.1))) {
              topVertices.push(endPt);
            }
          }
        });
      });
    }
  });

  if (topVertices.length > 0) {
    topVertices.sort((v1, v2) => {
      const proj1 = (v1.x - pA.x) * dx + (v1.y - pA.y) * dy;
      const proj2 = (v2.x - pA.x) * dx + (v2.y - pA.y) * dy;
      return proj2 - proj1;
    });
    return [pA, pB, ...topVertices];
  }

  // Fallback for skeleton-free multi-eave outline: clamp upslope strip to half of outline's span
  const inwardSpans = outline.points.map(
    (pt) => (pt.x - pA.x) * inwardNorm.x + (pt.y - pA.y) * inwardNorm.y
  );
  const maxSpan = inwardSpans.length > 0 ? Math.max(...inwardSpans) : 5.0;
  const defaultDepth = +Math.max(0.6, Math.min(5.0, maxSpan * 0.5)).toFixed(3);
  return [
    pA,
    pB,
    { x: +(pB.x + inwardNorm.x * defaultDepth).toFixed(3), y: +(pB.y + inwardNorm.y * defaultDepth).toFixed(3) },
    { x: +(pA.x + inwardNorm.x * defaultDepth).toFixed(3), y: +(pA.y + inwardNorm.y * defaultDepth).toFixed(3) }
  ];
}

function computeDevelopedGeometry(
  planPolygon: Point2D[],
  eaveEdge: PlanEdge,
  pitchDeg: number,
  forcedInward?: Point2D,
  sheetRunEdge?: PlanEdge
): { developedPolygon: Point2D[]; slopeLength: number; runDirection: Point2D } {
  const pA = eaveEdge.from;
  const pB = eaveEdge.to;
  const eaveDx = pB.x - pA.x;
  const eaveDy = pB.y - pA.y;
  const eaveLen = Math.hypot(eaveDx, eaveDy) || 1;
  const eaveU: Point2D = { x: eaveDx / eaveLen, y: eaveDy / eaveLen };
  const eavePerp: Point2D = { x: -eaveU.y, y: eaveU.x };

  const cx = planPolygon.reduce((acc, p) => acc + p.x, 0) / planPolygon.length;
  const cy = planPolygon.reduce((acc, p) => acc + p.y, 0) / planPolygon.length;
  const dotToCentroidEave = (cx - pA.x) * eavePerp.x + (cy - pA.y) * eavePerp.y;
  const fallInward: Point2D =
    dotToCentroidEave >= 0 ? eavePerp : { x: -eavePerp.x, y: -eavePerp.y };

  let uVec = eaveU;
  let vInward = fallInward;

  if (sheetRunEdge && sheetRunEdge.id !== eaveEdge.id) {
    const rDx = sheetRunEdge.to.x - sheetRunEdge.from.x;
    const rDy = sheetRunEdge.to.y - sheetRunEdge.from.y;
    const rLen = Math.hypot(rDx, rDy);
    if (rLen > 0.05) {
      let candU = { x: rDx / rLen, y: rDy / rLen };
      if (candU.x * eaveU.x + candU.y * eaveU.y < 0) {
        candU = { x: -candU.x, y: -candU.y };
      }
      uVec = candU;
      const candV = { x: -uVec.y, y: uVec.x };
      const dotCentroid = (cx - pA.x) * candV.x + (cy - pA.y) * candV.y;
      const dotFall = candV.x * fallInward.x + candV.y * fallInward.y;
      vInward =
        forcedInward ||
        (dotFall >= 0.05 || (Math.abs(dotFall) <= 0.05 && dotCentroid >= 0)
          ? candV
          : { x: -candV.x, y: -candV.y });
    }
  } else if (forcedInward) {
    vInward = forcedInward;
  }

  const rad = (pitchDeg * Math.PI) / 180;
  // When sheet run direction differs by skew angle from fallInward, compute true sloped run multiplier along vInward
  const fallAlign = Math.abs(vInward.x * fallInward.x + vInward.y * fallInward.y);
  const slopeMultiplier = Math.hypot(1, fallAlign * Math.tan(rad));

  let maxVSlope = -Infinity;
  let minVSlope = Infinity;
  const developedPolygon: Point2D[] = planPolygon.map((p) => {
    const px = p.x - pA.x;
    const py = p.y - pA.y;
    const u = px * uVec.x + py * uVec.y;
    const vPlanDist = px * vInward.x + py * vInward.y;
    const vSlope = vPlanDist * slopeMultiplier;

    if (vSlope > maxVSlope) maxVSlope = vSlope;
    if (vSlope < minVSlope) minVSlope = vSlope;
    return { x: +u.toFixed(3), y: +vSlope.toFixed(3) };
  });

  const spanSlope = Math.max(0, maxVSlope - Math.min(0, minVSlope));
  return {
    developedPolygon,
    slopeLength: +spanSlope.toFixed(3),
    runDirection: vInward
  };
}

function classifyFaceEdges(
  polygon: Point2D[],
  eaveEdge: PlanEdge,
  skeleton: SkeletonLine[],
  outline?: RoofOutline
): { edgeId: string; type: 'eave' | 'ridge' | 'hip' | 'valley' | 'verge' | 'wall' }[] {
  const result: { edgeId: string; type: 'eave' | 'ridge' | 'hip' | 'valley' | 'verge' | 'wall' }[] = [];

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const edgeId = `fe-${i + 1}`;

    if (
      (pointsClose(p1, eaveEdge.from) && pointsClose(p2, eaveEdge.to)) ||
      (pointsClose(p1, eaveEdge.to) && pointsClose(p2, eaveEdge.from))
    ) {
      result.push({ edgeId, type: 'eave' });
      continue;
    }

    if (outline) {
      const matchedOutline = outline.edges.find(
        (oe) =>
          distToSegment(p1, oe.from, oe.to) < 0.15 &&
          distToSegment(p2, oe.from, oe.to) < 0.15
      );
      if (matchedOutline) {
        if (matchedOutline.type === 'wall') {
          result.push({ edgeId, type: 'wall' });
          continue;
        }
        if (matchedOutline.type === 'verge') {
          result.push({ edgeId, type: 'verge' });
          continue;
        }
        if (
          matchedOutline.type === 'ridge' ||
          matchedOutline.type === 'hip' ||
          matchedOutline.type === 'valley'
        ) {
          result.push({ edgeId, type: matchedOutline.type });
          continue;
        }
      }
    }

    const skelMatch =
      skeleton.find(
        (s) =>
          (pointsClose(p1, s.from) && pointsClose(p2, s.to)) ||
          (pointsClose(p1, s.to) && pointsClose(p2, s.from))
      ) ||
      skeleton.find(
        (s) =>
          distToSegment(p1, s.from, s.to) < 0.08 &&
          distToSegment(p2, s.from, s.to) < 0.08
      );

    if (skelMatch) {
      result.push({ edgeId, type: skelMatch.suggestedType });
    } else {
      result.push({ edgeId, type: 'verge' });
    }
  }

  return result;
}

// Clip a developed-like (u, v) polygon by minV..maxV (Y-axis clipping)
function clipPolygonByYRange(poly: Point2D[], minY: number, maxY: number): Point2D[] {
  if (poly.length < 3) return poly;
  let current = [...poly];

  let nextStage: Point2D[] = [];
  for (let i = 0; i < current.length; i++) {
    const p1 = current[i];
    const p2 = current[(i + 1) % current.length];
    const p1In = p1.y >= minY - 1e-4;
    const p2In = p2.y >= minY - 1e-4;
    if (p1In && p2In) {
      nextStage.push(p2);
    } else if (p1In && !p2In) {
      const dy = p2.y - p1.y;
      const t = Math.abs(dy) > 1e-6 ? (minY - p1.y) / dy : 0;
      nextStage.push({ x: +(p1.x + t * (p2.x - p1.x)).toFixed(3), y: minY });
    } else if (!p1In && p2In) {
      const dy = p2.y - p1.y;
      const t = Math.abs(dy) > 1e-6 ? (minY - p1.y) / dy : 0;
      nextStage.push({ x: +(p1.x + t * (p2.x - p1.x)).toFixed(3), y: minY });
      nextStage.push(p2);
    }
  }

  current = nextStage;
  if (current.length < 3) return [];

  nextStage = [];
  for (let i = 0; i < current.length; i++) {
    const p1 = current[i];
    const p2 = current[(i + 1) % current.length];
    const p1In = p1.y <= maxY + 1e-4;
    const p2In = p2.y <= maxY + 1e-4;
    if (p1In && p2In) {
      nextStage.push(p2);
    } else if (p1In && !p2In) {
      const dy = p2.y - p1.y;
      const t = Math.abs(dy) > 1e-6 ? (maxY - p1.y) / dy : 0;
      nextStage.push({ x: +(p1.x + t * (p2.x - p1.x)).toFixed(3), y: maxY });
    } else if (!p1In && p2In) {
      const dy = p2.y - p1.y;
      const t = Math.abs(dy) > 1e-6 ? (maxY - p1.y) / dy : 0;
      nextStage.push({ x: +(p1.x + t * (p2.x - p1.x)).toFixed(3), y: maxY });
      nextStage.push(p2);
    }
  }

  const result: Point2D[] = [];
  for (const pt of nextStage) {
    const prev = result[result.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.02) {
      result.push({ x: +pt.x.toFixed(3), y: +pt.y.toFixed(3) });
    }
  }
  if (result.length > 2 && Math.hypot(result[0].x - result[result.length - 1].x, result[0].y - result[result.length - 1].y) < 0.02) {
    result.pop();
  }
  return result;
}

// Rotate a clipped local (u, vPlan) polygon cycle so [0]->[1] is the bottom baseline edge along +u
function rotateLocalPolyToBottomEdge(pts: Point2D[]): Point2D[] {
  if (pts.length < 3) return pts;
  const oriented = getSignedArea(pts) < 0 ? [...pts].reverse() : [...pts];
  let bestIdx = 0;
  let bestScore = Infinity;
  for (let i = 0; i < oriented.length; i++) {
    const a = oriented[i];
    const b = oriented[(i + 1) % oriented.length];
    const avgY = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    // Prefer lowest average y edge going forward in +u
    const score = avgY * 100 - (dx > 0.01 ? 10 : 0);
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return [...oriented.slice(bestIdx), ...oriented.slice(0, bestIdx)];
}

// Resolve change-of-pitch breaks, skylight/chimney apertures, and derived mono/gable dormer roof planes
export function resolveEffectivePlanesWithAssets(
  basePlanes: RoofPlane[],
  assets: RoofAsset[] = [],
  pitchBreaks: PitchBreakLine[] = []
): RoofPlane[] {
  let currentPlanes: RoofPlane[] = basePlanes.map((p) => ({
    ...p,
    apertures: p.apertures ? [...p.apertures] : []
  }));

  // 1. Apply Change-of-Pitch Break Lines (split a plane at plan distance d into lower apron + upper main)
  pitchBreaks.forEach((pb) => {
    const nextPlanes: RoofPlane[] = [];
    currentPlanes.forEach((plane) => {
      if (plane.id !== pb.planeId || plane.planPolygon.length < 3) {
        nextPlanes.push(plane);
        return;
      }

      const pA = plane.planPolygon[0];
      const pB = plane.planPolygon[1] || pA;
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const eLen = Math.hypot(dx, dy) || 1;
      const uVec = { x: dx / eLen, y: dy / eLen };
      const vInward = plane.runDirection || { x: -uVec.y, y: uVec.x };

      // Transform planPolygon into local (u, vPlan) coords
      const localPlanPoly = plane.planPolygon.map((pt) => ({
        x: +((pt.x - pA.x) * uVec.x + (pt.y - pA.y) * uVec.y).toFixed(3),
        y: +((pt.x - pA.x) * vInward.x + (pt.y - pA.y) * vInward.y).toFixed(3)
      }));
      const maxPlanDepth = Math.max(...localPlanPoly.map((p) => p.y));
      const d = Math.max(0.4, Math.min(maxPlanDepth - 0.4, pb.splitPlanDistM));

      if (maxPlanDepth <= 0.85 || d <= 0.25 || d >= maxPlanDepth - 0.25) {
        nextPlanes.push(plane);
        return;
      }

      const toWorld = (u: number, vP: number): Point2D => ({
        x: +(pA.x + u * uVec.x + vP * vInward.x).toFixed(3),
        y: +(pA.y + u * uVec.y + vP * vInward.y).toFixed(3)
      });

      const lowerLocal = rotateLocalPolyToBottomEdge(clipPolygonByYRange(localPlanPoly, 0, d));
      const upperLocal = rotateLocalPolyToBottomEdge(clipPolygonByYRange(localPlanPoly, d, maxPlanDepth + 1));

      if (lowerLocal.length >= 3 && upperLocal.length >= 3) {
        const lowerWorld = lowerLocal.map((p) => toWorld(p.x, p.y));
        const lowerDev = computeDevelopedGeometry(
          lowerWorld,
          { id: `${plane.eaveEdgeId}-lower`, from: lowerWorld[0], to: lowerWorld[1], type: 'outline' },
          pb.lowerPitchDeg,
          vInward
        );

        // Anchor pitch break at the TRUE upper roof intersection height (v = d along main slope)
        // so the upper slope remains 100% aligned with the main ridge and adjoining hips/valleys!
        const baseH = plane.eaveHeightM ?? 2.7;
        const upperRad = (plane.pitchDeg * Math.PI) / 180;
        const lowerRad = (pb.lowerPitchDeg * Math.PI) / 180;
        const breakHeightM = +(baseH + d * Math.tan(upperRad)).toFixed(3);
        const apronEaveHeightM = +(breakHeightM - d * Math.tan(lowerRad)).toFixed(3);

        const upperWorld = upperLocal.map((p) => toWorld(p.x, p.y));
        const creaseP1 = upperWorld[0];
        const creaseP2 = upperWorld[1];

        const upperDevRaw = computeDevelopedGeometry(
          upperWorld,
          { id: `${plane.eaveEdgeId}-upper`, from: creaseP1, to: creaseP2, type: 'change-of-pitch' },
          plane.pitchDeg,
          vInward
        );

        const remapEdges = (poly: Point2D[]): RoofPlane['edges'] =>
          poly.map((v1, idx) => {
            const v2 = poly[(idx + 1) % poly.length];
            const mid = { x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2 };
            for (let oi = 0; oi < plane.planPolygon.length; oi++) {
              const oa = plane.planPolygon[oi];
              const ob = plane.planPolygon[(oi + 1) % plane.planPolygon.length];
              if (distToSegment(mid, oa, ob) < 0.12 && plane.edges[oi]) {
                return { edgeId: `fe-${idx + 1}`, type: plane.edges[oi].type };
              }
            }
            return { edgeId: `fe-${idx + 1}`, type: 'eave' };
          });

        const lowerPlane: RoofPlane = {
          ...plane,
          id: `${plane.id}__lower`,
          name: `${plane.name} · Apron (${pb.lowerPitchDeg}°)`,
          pitchDeg: pb.lowerPitchDeg,
          eaveHeightM: apronEaveHeightM,
          planPolygon: lowerWorld,
          developedPolygon: lowerDev.developedPolygon,
          slopeLength: lowerDev.slopeLength,
          eaveWidthM: +dist(lowerWorld[0], lowerWorld[1]).toFixed(3),
          runDirection: vInward,
          area: +polygonArea(lowerDev.developedPolygon).toFixed(2),
          edges: remapEdges(lowerWorld),
          parentPlaneId: plane.id,
          pitchZoneRole: 'lower_apron'
        };

        const upperPlane: RoofPlane = {
          ...plane,
          id: `${plane.id}__upper`,
          code: `${plane.code}2`,
          name: `${plane.name} · Upper (${plane.pitchDeg}°)`,
          eaveHeightM: breakHeightM,
          planPolygon: upperWorld,
          developedPolygon: upperDevRaw.developedPolygon,
          slopeLength: upperDevRaw.slopeLength,
          eaveWidthM: +dist(upperWorld[0], upperWorld[1]).toFixed(3),
          runDirection: vInward,
          area: +polygonArea(upperDevRaw.developedPolygon).toFixed(2),
          edges: remapEdges(upperWorld),
          parentPlaneId: plane.id,
          pitchZoneRole: 'upper_main',
          isStartEdge: false
        };

        nextPlanes.push(lowerPlane, upperPlane);
      } else {
        nextPlanes.push(plane);
      }
    });
    currentPlanes = nextPlanes;
  });

  // 2. Attach Apertures (skylight, chimney, mono_dormer, gable_dormer) and derive Dormer Roof Planes
  const derivedDormerPlanes: RoofPlane[] = [];

  assets.forEach((asset, assetIdx) => {
    // Locate host plane (matching planeId or split child whose polygon contains asset.center)
    const hostPlane =
      currentPlanes.find(
        (p) => (p.id === asset.planeId || p.parentPlaneId === asset.planeId) && isPointInPolygon(asset.center, p.planPolygon)
      ) ||
      currentPlanes.find((p) => p.id === asset.planeId || p.parentPlaneId === asset.planeId);

    if (!hostPlane || hostPlane.planPolygon.length < 3) return;

    const pA = hostPlane.planPolygon[0];
    const pB = hostPlane.planPolygon[1] || pA;
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const eLen = Math.hypot(dx, dy) || 1;
    const uVec = { x: dx / eLen, y: dy / eLen };
    const vInward = hostPlane.runDirection || { x: -uVec.y, y: uVec.x };

    const relX = asset.center.x - pA.x;
    const relY = asset.center.y - pA.y;
    const uC = relX * uVec.x + relY * uVec.y;
    const vPlanC = relX * vInward.x + relY * vInward.y;

    const halfW = Math.max(0.25, asset.widthM / 2);
    const halfD = Math.max(0.25, asset.depthM / 2);

    const cosPitch = Math.max(0.15, Math.cos((hostPlane.pitchDeg * Math.PI) / 180));
    const vSlopeC = vPlanC / cosPitch;
    const halfDSlope = halfD / cosPitch;

    const uMin = +(uC - halfW).toFixed(3);
    const uMax = +(uC + halfW).toFixed(3);
    const vMin = +Math.max(0.05, vSlopeC - halfDSlope).toFixed(3);
    const vMax = +(vSlopeC + halfDSlope).toFixed(3);

    const vPlanMin = Math.max(0.05, vPlanC - halfD);
    const vPlanMax = vPlanC + halfD;
    const toWorld = (u: number, vP: number): Point2D => ({
      x: +(pA.x + u * uVec.x + vP * vInward.x).toFixed(3),
      y: +(pA.y + u * uVec.y + vP * vInward.y).toFixed(3)
    });

    const pFL = toWorld(uMin, vPlanMin);
    const pFR = toWorld(uMax, vPlanMin);
    const pBR = toWorld(uMax, vPlanMax);
    const pBL = toWorld(uMin, vPlanMax);

    if (!hostPlane.apertures) hostPlane.apertures = [];

    const hostBaseH = hostPlane.eaveHeightM ?? 2.7;
    const hostTan = Math.tan((hostPlane.pitchDeg * Math.PI) / 180);
    const zHostBack = hostBaseH + vPlanMax * hostTan;

    if (asset.type === 'gable_dormer') {
      const geom = computeGableDormerGeometry(hostPlane, asset);
      if (!geom) return;

      hostPlane.apertures.push({
        assetId: asset.id,
        type: asset.type,
        label: asset.label,
        uMin: geom.uMin,
        uMax: geom.uMax,
        vMin: geom.vSlopeFront,
        vMax: geom.vSlopeTie,
        planPolygon: geom.aperturePlanPolygon,
        developedPolygon: geom.apertureDevPolygon
      });

      const dormerPitch = geom.dormerPitchDeg;
      const sideEaveH = geom.sideEaveHeightM;

      // Left Dormer Slope: eave edge [pCheekL -> pFL] runs toward front, upslope +uVec to dormer ridge [pFMid -> pRidgeTie], closed by diagonal valley [pRidgeTie -> pCheekL]
      const leftPoly = geom.leftSlopePlanPolygon;
      const leftDev = computeDevelopedGeometry(
        leftPoly,
        { id: `eave-${asset.id}-L`, from: leftPoly[0], to: leftPoly[1], type: 'outline' },
        dormerPitch,
        uVec
      );

      // Right Dormer Slope: eave edge [pFR -> pCheekR] runs upslope, inward -uVec to dormer ridge [pRidgeTie -> pFMid], closed by diagonal valley [pCheekR -> pRidgeTie]
      const rightPoly = geom.rightSlopePlanPolygon;
      const rightDev = computeDevelopedGeometry(
        rightPoly,
        { id: `eave-${asset.id}-R`, from: rightPoly[0], to: rightPoly[1], type: 'outline' },
        dormerPitch,
        { x: -uVec.x, y: -uVec.y }
      );

      derivedDormerPlanes.push(
        {
          id: `plane-${asset.id}-L`,
          code: `D${assetIdx + 1}L`,
          label: `DORMER D${assetIdx + 1}L`,
          name: `${asset.label || 'Gable Dormer'} Left (${dormerPitch}°)`,
          color: '#0ea5e9',
          planPolygon: leftPoly,
          eaveEdgeId: `eave-${asset.id}-L`,
          pitchDeg: dormerPitch,
          underlapSide: 'left',
          eaveHeightM: sideEaveH,
          developedPolygon: leftDev.developedPolygon,
          slopeLength: leftDev.slopeLength,
          eaveWidthM: +dist(leftPoly[0], leftPoly[1]).toFixed(3),
          runDirection: uVec,
          area: +polygonArea(leftDev.developedPolygon).toFixed(2),
          edges: [
            { edgeId: 'fe-1', type: 'eave' },
            { edgeId: 'fe-2', type: 'verge' },
            { edgeId: 'fe-3', type: 'ridge' },
            { edgeId: 'fe-4', type: 'valley' }
          ],
          parentAssetId: asset.id,
          parentAssetType: 'gable_dormer',
          parentPlaneId: hostPlane.id,
          isVirtualAssetPlane: true
        },
        {
          id: `plane-${asset.id}-R`,
          code: `D${assetIdx + 1}R`,
          label: `DORMER D${assetIdx + 1}R`,
          name: `${asset.label || 'Gable Dormer'} Right (${dormerPitch}°)`,
          color: '#38bdf8',
          planPolygon: rightPoly,
          eaveEdgeId: `eave-${asset.id}-R`,
          pitchDeg: dormerPitch,
          underlapSide: 'right',
          eaveHeightM: sideEaveH,
          developedPolygon: rightDev.developedPolygon,
          slopeLength: rightDev.slopeLength,
          eaveWidthM: +dist(rightPoly[0], rightPoly[1]).toFixed(3),
          runDirection: { x: -uVec.x, y: -uVec.y },
          area: +polygonArea(rightDev.developedPolygon).toFixed(2),
          edges: [
            { edgeId: 'fe-1', type: 'eave' },
            { edgeId: 'fe-2', type: 'valley' },
            { edgeId: 'fe-3', type: 'ridge' },
            { edgeId: 'fe-4', type: 'verge' }
          ],
          parentAssetId: asset.id,
          parentAssetType: 'gable_dormer',
          parentPlaneId: hostPlane.id,
          isVirtualAssetPlane: true
        }
      );
      return;
    }

    // Standard rectangular aperture (skylight, chimney, mono_dormer)
    hostPlane.apertures.push({
      assetId: asset.id,
      type: asset.type,
      label: asset.label,
      uMin,
      uMax,
      vMin,
      vMax,
      planPolygon: [pFL, pFR, pBR, pBL]
    });

    if (asset.type === 'mono_dormer') {
      const dormerPitch = asset.dormerPitchDeg ?? 12;
      const dormerTan = Math.tan((dormerPitch * Math.PI) / 180);
      const ridgeTieH = zHostBack + 0.15;
      const dormerFrontEaveH = Math.max(hostBaseH + 0.3, ridgeTieH - asset.depthM * dormerTan);

      const dormerPoly = [pFL, pFR, pBR, pBL];
      const dormerDev = computeDevelopedGeometry(
        dormerPoly,
        { id: `eave-${asset.id}`, from: pFL, to: pFR, type: 'outline' },
        dormerPitch,
        vInward
      );

      derivedDormerPlanes.push({
        id: `plane-${asset.id}`,
        code: `D${assetIdx + 1}`,
        label: `DORMER D${assetIdx + 1}`,
        name: asset.label || `Mono Dormer (${dormerPitch}°)`,
        color: '#0ea5e9',
        planPolygon: dormerPoly,
        eaveEdgeId: `eave-${asset.id}`,
        pitchDeg: dormerPitch,
        underlapSide: hostPlane.underlapSide,
        eaveHeightM: +dormerFrontEaveH.toFixed(3),
        developedPolygon: dormerDev.developedPolygon,
        slopeLength: dormerDev.slopeLength,
        eaveWidthM: +asset.widthM.toFixed(3),
        runDirection: vInward,
        area: +polygonArea(dormerDev.developedPolygon).toFixed(2),
        edges: [
          { edgeId: 'fe-1', type: 'eave' },
          { edgeId: 'fe-2', type: 'verge' },
          { edgeId: 'fe-3', type: 'ridge' },
          { edgeId: 'fe-4', type: 'verge' }
        ],
        parentAssetId: asset.id,
        parentAssetType: 'mono_dormer',
        parentPlaneId: hostPlane.id,
        isVirtualAssetPlane: true
      });
    }
  });

  return [...currentPlanes, ...derivedDormerPlanes];
}

export interface GableDormerGeometry {
  uMin: number;
  uMax: number;
  uC: number;
  vPlanMin: number;
  vCheekBack: number;
  vRidgeTie: number;
  vSlopeFront: number;
  vSlopeCheek: number;
  vSlopeTie: number;
  deltaVValley: number;
  valleyAngleDeg: number;
  valleySlopeRatio: number;
  hostPitchDeg: number;
  dormerPitchDeg: number;
  sideEaveHeightM: number;
  ridgeHeightM: number;
  uVec: Point2D;
  vInward: Point2D;
  pFL: Point2D;
  pFR: Point2D;
  pCheekL: Point2D;
  pCheekR: Point2D;
  pFMid: Point2D;
  pRidgeTie: Point2D;
  aperturePlanPolygon: Point2D[];
  apertureDevPolygon: Point2D[];
  leftSlopePlanPolygon: Point2D[];
  rightSlopePlanPolygon: Point2D[];
}

export function computeGableDormerGeometry(
  hostPlane: RoofPlane,
  asset: RoofAsset
): GableDormerGeometry | null {
  if (!hostPlane || hostPlane.planPolygon.length < 3) return null;

  const pA = hostPlane.planPolygon[0];
  const pB = hostPlane.planPolygon[1] || pA;
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const eLen = Math.hypot(dx, dy) || 1;
  const uVec = { x: dx / eLen, y: dy / eLen };
  const vInward = hostPlane.runDirection || { x: -uVec.y, y: uVec.x };

  const relX = asset.center.x - pA.x;
  const relY = asset.center.y - pA.y;
  const uC = relX * uVec.x + relY * uVec.y;
  const vPlanC = relX * vInward.x + relY * vInward.y;

  const hostVVals = hostPlane.planPolygon.map(
    (pt) => (pt.x - pA.x) * vInward.x + (pt.y - pA.y) * vInward.y
  );
  const maxHostVPlan = Math.max(0.8, ...hostVVals);

  const halfW = Math.max(0.25, asset.widthM / 2);
  const requestedDepth = Math.max(0.5, asset.depthM);

  const hostPitchDeg = Math.max(2, hostPlane.pitchDeg);
  const dormerPitchDeg = asset.dormerPitchDeg ?? 25;
  const hostTan = Math.max(0.035, Math.tan((hostPitchDeg * Math.PI) / 180));
  const dormerTan = Math.max(0.035, Math.tan((dormerPitchDeg * Math.PI) / 180));

  // True 3D roof intersection ratio: valley upslope travel = halfW * tan(dormerPitch) / tan(hostPitch)
  const valleySlopeRatio = +(dormerTan / hostTan).toFixed(4);
  const deltaVValleyIdeal = halfW * valleySlopeRatio;
  const valleyAngleDeg = +((Math.atan2(halfW, deltaVValleyIdeal) * 180) / Math.PI).toFixed(1);

  const vPlanMin = +Math.max(0.05, Math.min(maxHostVPlan - 0.3, vPlanC - requestedDepth / 2)).toFixed(3);
  const vRequestedBack = vPlanMin + requestedDepth;

  let vRidgeTie = Math.min(maxHostVPlan, vRequestedBack);
  let vCheekBack = vRidgeTie - deltaVValleyIdeal;

  // Keep cheek eave strictly >= vPlanMin + 0.06m so side eave vector keeps clean 6cm minimum return
  if (vCheekBack < vPlanMin + 0.06) {
    vCheekBack = vPlanMin + 0.06;
    vRidgeTie = Math.min(maxHostVPlan, vCheekBack + deltaVValleyIdeal);
    if (vRidgeTie <= vCheekBack + 0.08) {
      vCheekBack = Math.max(vPlanMin + 0.06, vRidgeTie - 0.15);
    }
  }

  vCheekBack = +vCheekBack.toFixed(3);
  vRidgeTie = +vRidgeTie.toFixed(3);
  const deltaVValley = +(vRidgeTie - vCheekBack).toFixed(3);

  const uMin = +(uC - halfW).toFixed(3);
  const uMax = +(uC + halfW).toFixed(3);

  const cosHost = Math.max(0.15, Math.cos((hostPitchDeg * Math.PI) / 180));
  const vSlopeFront = +(vPlanMin / cosHost).toFixed(3);
  const vSlopeCheek = +(vCheekBack / cosHost).toFixed(3);
  const vSlopeTie = +(vRidgeTie / cosHost).toFixed(3);

  const hostBaseH = hostPlane.eaveHeightM ?? 2.7;
  const ridgeHeightM = +(hostBaseH + vRidgeTie * hostTan).toFixed(3);
  const sideEaveHeightM = +Math.max(hostBaseH, ridgeHeightM - halfW * dormerTan).toFixed(3);

  const toWorld = (u: number, vP: number): Point2D => ({
    x: +(pA.x + u * uVec.x + vP * vInward.x).toFixed(3),
    y: +(pA.y + u * uVec.y + vP * vInward.y).toFixed(3)
  });

  const pFL = toWorld(uMin, vPlanMin);
  const pFR = toWorld(uMax, vPlanMin);
  const pCheekL = toWorld(uMin, vCheekBack);
  const pCheekR = toWorld(uMax, vCheekBack);
  const pFMid = toWorld(uC, vPlanMin);
  const pRidgeTie = toWorld(uC, vRidgeTie);

  return {
    uMin,
    uMax,
    uC: +uC.toFixed(3),
    vPlanMin,
    vCheekBack,
    vRidgeTie,
    vSlopeFront,
    vSlopeCheek,
    vSlopeTie,
    deltaVValley,
    valleyAngleDeg,
    valleySlopeRatio,
    hostPitchDeg,
    dormerPitchDeg,
    sideEaveHeightM,
    ridgeHeightM,
    uVec,
    vInward,
    pFL,
    pFR,
    pCheekL,
    pCheekR,
    pFMid,
    pRidgeTie,
    aperturePlanPolygon: [pFL, pFR, pCheekR, pRidgeTie, pCheekL],
    apertureDevPolygon: [
      { x: uMin, y: vSlopeFront },
      { x: uMax, y: vSlopeFront },
      { x: uMax, y: vSlopeCheek },
      { x: +uC.toFixed(3), y: vSlopeTie },
      { x: uMin, y: vSlopeCheek }
    ],
    leftSlopePlanPolygon: [pCheekL, pFL, pFMid, pRidgeTie],
    rightSlopePlanPolygon: [pFR, pCheekR, pRidgeTie, pFMid]
  };
}

// ---------------------------------------------------------------------------
// RECEIVING ZONE GEOMETRY & CLIPPING HELPERS
// ---------------------------------------------------------------------------
export function clipPolygonByXRange(poly: Point2D[], minX: number, maxX: number): Point2D[] {
  if (poly.length < 3) return poly;

  let current = [...poly];

  // Clip x >= minX
  let nextStage: Point2D[] = [];
  for (let i = 0; i < current.length; i++) {
    const p1 = current[i];
    const p2 = current[(i + 1) % current.length];
    const p1In = p1.x >= minX - 1e-4;
    const p2In = p2.x >= minX - 1e-4;

    if (p1In && p2In) {
      nextStage.push(p2);
    } else if (p1In && !p2In) {
      const dx = p2.x - p1.x;
      const t = Math.abs(dx) > 1e-6 ? (minX - p1.x) / dx : 0;
      nextStage.push({ x: minX, y: +(p1.y + t * (p2.y - p1.y)).toFixed(3) });
    } else if (!p1In && p2In) {
      const dx = p2.x - p1.x;
      const t = Math.abs(dx) > 1e-6 ? (minX - p1.x) / dx : 0;
      nextStage.push({ x: minX, y: +(p1.y + t * (p2.y - p1.y)).toFixed(3) });
      nextStage.push(p2);
    }
  }

  current = nextStage;
  if (current.length < 3) return [];

  // Clip x <= maxX
  nextStage = [];
  for (let i = 0; i < current.length; i++) {
    const p1 = current[i];
    const p2 = current[(i + 1) % current.length];
    const p1In = p1.x <= maxX + 1e-4;
    const p2In = p2.x <= maxX + 1e-4;

    if (p1In && p2In) {
      nextStage.push(p2);
    } else if (p1In && !p2In) {
      const dx = p2.x - p1.x;
      const t = Math.abs(dx) > 1e-6 ? (maxX - p1.x) / dx : 0;
      nextStage.push({ x: maxX, y: +(p1.y + t * (p2.y - p1.y)).toFixed(3) });
    } else if (!p1In && p2In) {
      const dx = p2.x - p1.x;
      const t = Math.abs(dx) > 1e-6 ? (maxX - p1.x) / dx : 0;
      nextStage.push({ x: maxX, y: +(p1.y + t * (p2.y - p1.y)).toFixed(3) });
      nextStage.push(p2);
    }
  }

  // Deduplicate consecutive points
  const result: Point2D[] = [];
  for (let i = 0; i < nextStage.length; i++) {
    const pt = nextStage[i];
    const prev = result[result.length - 1];
    if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.02) {
      result.push({ x: +pt.x.toFixed(3), y: +pt.y.toFixed(3) });
    }
  }
  if (result.length > 2 && Math.hypot(result[0].x - result[result.length - 1].x, result[0].y - result[result.length - 1].y) < 0.02) {
    result.pop();
  }

  return result;
}

export function developedToPlanPoint(
  pt: Point2D,
  eaveP1: Point2D,
  eaveP2: Point2D,
  pitchDeg: number,
  runDirection: Point2D
): Point2D {
  const dx = eaveP2.x - eaveP1.x;
  const dy = eaveP2.y - eaveP1.y;
  const len = Math.hypot(dx, dy) || 1;
  const eaveU = { x: dx / len, y: dy / len };
  const rLen = Math.hypot(runDirection.x, runDirection.y) || 1;
  const vUnit = { x: runDirection.x / rLen, y: runDirection.y / rLen };
  const candA = { x: vUnit.y, y: -vUnit.x };
  const candB = { x: -vUnit.y, y: vUnit.x };
  const uVec = candA.x * eaveU.x + candA.y * eaveU.y >= 0 ? candA : candB;

  const rad = (pitchDeg * Math.PI) / 180;
  const vPlanDist = pt.y * Math.cos(rad);

  return {
    x: +(eaveP1.x + pt.x * uVec.x + vPlanDist * vUnit.x).toFixed(3),
    y: +(eaveP1.y + pt.x * uVec.y + vPlanDist * vUnit.y).toFixed(3)
  };
}

// ---------------------------------------------------------------------------
// 4. NATURAL INSTALLATION ENGINE & DYNAMIC OFFCUT LAYOUT
// ---------------------------------------------------------------------------

// Check if two planes meet along a shared hip edge or at a corner hip junction
export function arePlanesAdjacentAtHip(planeA: RoofPlane, planeB: RoofPlane): boolean {
  if (planeA.id === planeB.id) return false;
  const levelA = planeA.levelId || 'level-1';
  const levelB = planeB.levelId || 'level-1';
  if (levelA !== levelB) return false;

  // 1. Check if they share a hip boundary segment
  for (let i = 0; i < planeA.planPolygon.length; i++) {
    const a1 = planeA.planPolygon[i];
    const a2 = planeA.planPolygon[(i + 1) % planeA.planPolygon.length];

    for (let j = 0; j < planeB.planPolygon.length; j++) {
      const b1 = planeB.planPolygon[j];
      const b2 = planeB.planPolygon[(j + 1) % planeB.planPolygon.length];

      if (
        (pointsClose(a1, b1, 0.25) && pointsClose(a2, b2, 0.25)) ||
        (pointsClose(a1, b2, 0.25) && pointsClose(a2, b1, 0.25))
      ) {
        const edgeA = planeA.edges[i]?.type;
        const edgeB = planeB.edges[j]?.type;
        if (edgeA === 'hip' || edgeB === 'hip') return true;
        if (edgeA !== 'eave' && edgeB !== 'eave') return true;
      }
    }
  }

  // 2. Check if their eaves meet at a common external corner (sharing a corner hip)
  const aEave1 = planeA.planPolygon[0];
  const aEave2 = planeA.planPolygon[1] || aEave1;
  const bEave1 = planeB.planPolygon[0];
  const bEave2 = planeB.planPolygon[1] || bEave1;

  if (
    pointsClose(aEave2, bEave1, 0.3) ||
    pointsClose(aEave1, bEave2, 0.3) ||
    pointsClose(aEave1, bEave1, 0.3) ||
    pointsClose(aEave2, bEave2, 0.3)
  ) {
    return true;
  }

  return false;
}

// Check if planeB is a matching end-slope segment (e.g. hip triangle or trapezoid) for planeA
export function isMatchingEndSlopeSegment(planeA: RoofPlane, planeB: RoofPlane): boolean {
  if (planeA.id === planeB.id) return false;
  if (Math.abs(planeA.pitchDeg - planeB.pitchDeg) > 1.0) return false;

  // An end-slope segment is typically a triangular or trapezoidal face terminating a roof ridge
  const eaveW_A =
    planeA.eaveWidthM ||
    (planeA.planPolygon[1] ? dist(planeA.planPolygon[0], planeA.planPolygon[1]) : 0);
  const eaveW_B =
    planeB.eaveWidthM ||
    (planeB.planPolygon[1] ? dist(planeB.planPolygon[0], planeB.planPolygon[1]) : 0);

  const isEndA =
    planeA.planPolygon.length === 3 ||
    planeA.edges.filter((e) => e.type === 'hip').length >= 2 ||
    ((planeA.slopeLength || 0) > 0 && eaveW_A > 0 && eaveW_A <= (planeA.slopeLength || 5) * 2.2);

  const isEndB =
    planeB.planPolygon.length === 3 ||
    planeB.edges.filter((e) => e.type === 'hip').length >= 2 ||
    ((planeB.slopeLength || 0) > 0 && eaveW_B > 0 && eaveW_B <= (planeB.slopeLength || 5) * 2.2);

  // Both are end-slope segments with compatible slope lengths
  if (isEndA && isEndB) {
    if (planeA.slopeLength && planeB.slopeLength) {
      if (Math.abs(planeA.slopeLength - planeB.slopeLength) < 1.5) return true;
    }
    return true;
  }

  // Plane B is an end-slope segment receiving from a trunk slope
  if (isEndB) return true;

  return false;
}

// Orders planes around perimeter starting from start edge (longest straight eave / largest face by default or user override)
export function orderPlanesInInstallationSequence(
  planes: RoofPlane[],
  startPlaneIdOrEdgeId?: string
): { orderedPlanes: RoofPlane[]; startPlaneId: string; startEdgeId: string } {
  if (planes.length === 0) return { orderedPlanes: [], startPlaneId: '', startEdgeId: '' };

  // 1. Determine Start Plane (Explicit override -> existing flag -> largest face / longest eave)
  let startPlane: RoofPlane | undefined;
  if (startPlaneIdOrEdgeId) {
    startPlane =
      planes.find((p) => p.id === startPlaneIdOrEdgeId) ||
      planes.find((p) => p.eaveEdgeId === startPlaneIdOrEdgeId);
  }
  if (!startPlane) {
    startPlane = planes.find((p) => p.isStartEdge);
  }
  if (!startPlane) {
    const sorted = [...planes].sort((a, b) => {
      const lenA = a.planPolygon[1] ? dist(a.planPolygon[0], a.planPolygon[1]) : 0;
      const lenB = b.planPolygon[1] ? dist(b.planPolygon[0], b.planPolygon[1]) : 0;
      if (Math.abs(lenB - lenA) > 0.25) return lenB - lenA;
      return (b.area || 0) - (a.area || 0);
    });
    startPlane = sorted[0] || planes[0];
  }

  // Helper to get eave endpoints of a plane
  const getEaveEndpoints = (p: RoofPlane): [Point2D, Point2D] => {
    const p0 = p.planPolygon[0] || { x: 0, y: 0 };
    const p1 = p.planPolygon[1] || p0;
    return [p0, p1];
  };

  // 2. Walk around perimeter continuously starting from startPlane's exit corner (p1),
  // staying within each roof level / elevation tier before stepping to the next tier.
  const getLevelKey = (p: RoofPlane) => p.levelId || 'level-1';
  const result: RoofPlane[] = [startPlane];
  const remaining = planes.filter((p) => p.id !== startPlane!.id);

  let current = startPlane;
  // Walk away from startPlane's p0 toward p1
  let currentExitCorner = getEaveEndpoints(startPlane)[1];

  while (remaining.length > 0) {
    const activeKey = getLevelKey(current);
    const hasSameLevelRemaining = remaining.some((p) => getLevelKey(p) === activeKey);

    let bestIdx = -1;
    let bestDist = Infinity;
    let nextExitCorner = getEaveEndpoints(remaining[0])[1];

    for (let i = 0; i < remaining.length; i++) {
      if (hasSameLevelRemaining && getLevelKey(remaining[i]) !== activeKey) continue;
      const [c0, c1] = getEaveEndpoints(remaining[i]);
      const dToC0 = dist(currentExitCorner, c0);
      const dToC1 = dist(currentExitCorner, c1);
      const minD = Math.min(dToC0, dToC1);

      if (minD < bestDist) {
        bestDist = minD;
        bestIdx = i;
        // Whichever endpoint touched currentExitCorner is entry; the opposite is exit
        nextExitCorner = dToC0 <= dToC1 ? c1 : c0;
      }
    }

    if (bestIdx < 0) bestIdx = 0;
    const nextPlane = remaining.splice(bestIdx, 1)[0];
    result.push(nextPlane);
    current = nextPlane;
    currentExitCorner = nextExitCorner;
  }

  // Update sequenceIndex and isStartEdge flag
  result.forEach((p, idx) => {
    p.sequenceIndex = idx + 1;
    p.isStartEdge = p.id === startPlane!.id;
  });

  return {
    orderedPlanes: result,
    startPlaneId: startPlane.id,
    startEdgeId: startPlane.eaveEdgeId
  };
}

export function generateCuttingLayout(
  planesInput: RoofPlane[],
  sheetSpec: SheetSpec = { coverWidth: 0.762, maxLength: 6.0, endLap: 0.15, overhang: 0.05 },
  options?: {
    startPlaneId?: string;
    startEdgeId?: string;
    assets?: RoofAsset[];
    pitchBreaks?: PitchBreakLine[];
  }
): LayoutResult {
  const cover = sheetSpec.coverWidth || 0.762;
  const maxLen = sheetSpec.maxLength || 6.0;

  const hasAssetsOrBreaks =
    (options?.assets && options.assets.length > 0) ||
    (options?.pitchBreaks && options.pitchBreaks.length > 0);
  const planes = hasAssetsOrBreaks
    ? resolveEffectivePlanesWithAssets(planesInput, options?.assets || [], options?.pitchBreaks || [])
    : planesInput;

  // Step 1: Order main perimeter structural planes (excluding upper_main pitch splits and virtual dormer slopes)
  // so perimeter parity & adjacent-hip flow NEVER get disrupted when adding dormers or pitch breaks!
  const mainPlanes = planes.filter((p) => !p.isVirtualAssetPlane && p.pitchZoneRole !== 'upper_main');
  const upperBreakPlanes = planes.filter((p) => !p.isVirtualAssetPlane && p.pitchZoneRole === 'upper_main');
  const virtualAssetPlanes = planes.filter((p) => p.isVirtualAssetPlane);

  const { orderedPlanes: orderedMain, startPlaneId, startEdgeId } = orderPlanesInInstallationSequence(
    mainPlanes.length > 0 ? mainPlanes : planes,
    options?.startPlaneId || options?.startEdgeId
  );

  const extraPlanes = [...upperBreakPlanes, ...virtualAssetPlanes];
  const orderedPlanes =
    mainPlanes.length > 0
      ? [
          ...orderedMain,
          ...extraPlanes.map((ep, idx) => ({
            ...ep,
            sequenceIndex: orderedMain.length + idx + 1,
            isStartEdge: false
          }))
        ]
      : orderedMain;

  const nPlanes = orderedPlanes.length;
  const nMainPlanes = mainPlanes.length > 0 ? orderedMain.length : nPlanes;

  // Determine each plane's Entry Corner (shared with P_{k-1}) and Exit Corner (shared with P_{k+1})
  // strictly over the closed perimeter ring `orderedMain` so extra pitch zones / dormers stay out of perimeter wrap-around!
  const planeProgression = new Map<
    string,
    {
      seqPos: number;
      entryCorner: Point2D;
      exitCorner: Point2D;
      entryAtU0: boolean;
      layDir: 1 | -1; // +1 = u increases entry->exit, -1 = u decreases entry->exit
      uMin: number;
      uMax: number;
    }
  >();

  orderedMain.forEach((plane, k) => {
    const poly = plane.developedPolygon;
    const p0 = plane.planPolygon[0] || { x: 0, y: 0 };
    const p1 = plane.planPolygon[1] || p0;
    const uMin = poly && poly.length > 0 ? Math.min(...poly.map((p) => p.x)) : 0;
    const uMax = poly && poly.length > 0 ? Math.max(...poly.map((p) => p.x)) : dist(p0, p1);

    // Keep wrap-around neighbor lookup and parity strictly within this roof level's sub-ring
    const levelKey = plane.levelId || 'level-1';
    const levelPeers = orderedMain.filter((m) => (m.levelId || 'level-1') === levelKey);
    const localIdx = levelPeers.findIndex((m) => m.id === plane.id);
    const nPeers = levelPeers.length;

    if (nPeers <= 1) {
      planeProgression.set(plane.id, {
        seqPos: k,
        entryCorner: p0,
        exitCorner: p1,
        entryAtU0: true,
        layDir: 1,
        uMin,
        uMax
      });
      return;
    }

    const prevPlane = levelPeers[(localIdx - 1 + nPeers) % nPeers];
    const nextPlane = levelPeers[(localIdx + 1) % nPeers];
    const prevPts = [prevPlane.planPolygon[0], prevPlane.planPolygon[1] || prevPlane.planPolygon[0]];
    const nextPts = [nextPlane.planPolygon[0], nextPlane.planPolygon[1] || nextPlane.planPolygon[0]];

    const dP0Prev = Math.min(dist(p0, prevPts[0]), dist(p0, prevPts[1]));
    const dP1Prev = Math.min(dist(p1, prevPts[0]), dist(p1, prevPts[1]));
    const dP0Next = Math.min(dist(p0, nextPts[0]), dist(p0, nextPts[1]));
    const dP1Next = Math.min(dist(p1, nextPts[0]), dist(p1, nextPts[1]));

    const touchesPrev = Math.min(dP0Prev, dP1Prev) < 0.6;
    const touchesNext = Math.min(dP0Next, dP1Next) < 0.6;

    const prevAtU0 = dP0Prev + dP1Next <= dP1Prev + dP0Next;
    const entryAtU0 =
      nPeers >= 3 && (touchesPrev || touchesNext) ? (localIdx % 2 === 0 ? prevAtU0 : !prevAtU0) : true;

    planeProgression.set(plane.id, {
      seqPos: k,
      entryCorner: entryAtU0 ? p0 : p1,
      exitCorner: entryAtU0 ? p1 : p0,
      entryAtU0,
      layDir: entryAtU0 ? 1 : -1,
      uMin,
      uMax
    });
  });

  // Progression for upper pitch-break zones (aligned cleanly with parent lower apron) & virtual dormer planes
  extraPlanes.forEach((plane, eIdx) => {
    const poly = plane.developedPolygon;
    const p0 = plane.planPolygon[0] || { x: 0, y: 0 };
    const p1 = plane.planPolygon[1] || p0;
    const uMin = poly && poly.length > 0 ? Math.min(...poly.map((p) => p.x)) : 0;
    const uMax = poly && poly.length > 0 ? Math.max(...poly.map((p) => p.x)) : dist(p0, p1);
    const seqPos = nMainPlanes + eIdx;

    if (plane.pitchZoneRole === 'upper_main' && plane.parentPlaneId) {
      const lowerTwin = orderedMain.find((m) => m.parentPlaneId === plane.parentPlaneId || m.id === `${plane.parentPlaneId}__lower`);
      const lowerProg = lowerTwin ? planeProgression.get(lowerTwin.id) : undefined;
      if (lowerProg) {
        planeProgression.set(plane.id, {
          seqPos,
          entryCorner: lowerProg.entryAtU0 ? p0 : p1,
          exitCorner: lowerProg.entryAtU0 ? p1 : p0,
          entryAtU0: lowerProg.entryAtU0,
          layDir: lowerProg.layDir,
          uMin,
          uMax
        });
        return;
      }
    }

    planeProgression.set(plane.id, {
      seqPos,
      entryCorner: p0,
      exitCorner: p1,
      entryAtU0: true,
      layDir: 1,
      uMin,
      uMax
    });
  });

  // Slicing every plane into strips parallel to fall in progressive laying sequence
  interface NeededSheetStrip {
    planeId: string;
    planeName: string;
    sequenceIndex: number;
    seqPos: number;
    colIndex: number;
    segIndex: number;
    uCenter: number;
    colWidth: number;
    minV: number;
    maxV: number;
    cutLength: number; // required factory blank length across [u0, u1] including overhang
    shortLength: number; // shortest edge across [u0, u1] including overhang
    midLength: number; // centerline run length including overhang
    geomMidLength: number; // centerline length inside developedPolygon (no overhang)
    planeMaxCutLen: number;
    hasOrderedOverride?: boolean;
    targetOrderedLen?: number;
    isTriangularRake: boolean;
    splitFromAssetId?: string;
    zoneRole: 'entry' | 'exit' | 'body';
    isLeftRake: boolean;
    pitchDeg: number;
    underlapSide: 'left' | 'right';
    planCenter: Point2D;
  }

  const allNeededPieces: NeededSheetStrip[] = [];

  orderedPlanes.forEach((plane) => {
    const poly = plane.developedPolygon;
    if (!poly || poly.length < 3) return;

    const prog = planeProgression.get(plane.id)!;
    const uMin = prog.uMin;
    const uMax = prog.uMax;
    const totalU = Math.max(0, uMax - uMin);
    const colsCount = Math.max(1, Math.ceil(totalU / cover));
    const midU = (uMin + uMax) / 2;

    const eaveP1 = plane.planPolygon[0];
    const eaveP2 = plane.planPolygon[1] || eaveP1;
    const runDir = plane.runDirection || { x: 0, y: 1 };
    const planeApertures = plane.apertures || [];

    // Walk columns cleanly in the continuous perimeter flow direction (entry -> exit)
    const colIndices: number[] = [];
    if (prog.layDir === -1) {
      for (let c = colsCount - 1; c >= 0; c--) colIndices.push(c);
    } else {
      for (let c = 0; c < colsCount; c++) colIndices.push(c);
    }

    const rawSegments: {
      colIdx: number;
      segIdx: number;
      uMid: number;
      colWidth: number;
      vBot: number;
      vTop: number;
      rawLongLen: number;
      rawShortLen: number;
      rawMidLen: number;
      geomMidLen: number;
      isRake: boolean;
      splitAssetId?: string;
    }[] = [];

    colIndices.forEach((c) => {
      const colStartU = Math.max(uMin, uMin + c * cover);
      const colEndU = Math.min(uMax, uMin + (c + 1) * cover);
      const colWidth = +(colEndU - colStartU).toFixed(4);
      if (colWidth < 0.04 && colsCount > 1) return;

      const uMid = (colStartU + colEndU) / 2;
      const vSegments = polygonVSegmentsAtU(poly, planeApertures, uMid, cover * 0.35);
      if (vSegments.length === 0) return;

      const sampleXs = [colStartU + 0.005, uMid, colEndU - 0.005].filter(
        (x) => x > colStartU + 0.0005 && x < colEndU - 0.0005
      );
      if (sampleXs.length === 0) sampleXs.push(uMid);
      poly.forEach((pt) => {
        if (pt.x > colStartU + 0.005 && pt.x < colEndU - 0.005) {
          sampleXs.push(pt.x);
        }
      });

      vSegments.forEach(([segBot, segTop, isRake, splitAssetId], segIdx) => {
        const isBaseEave = segIdx === 0 && segBot <= 0.05;
        // Include real eave gutter overhang (do NOT clamp to 0 when segBot === 0)
        const vBotMid = isBaseEave ? segBot - sheetSpec.overhang : segBot;
        const rawMidLen = +(segTop - vBotMid).toFixed(3);
        const geomMidLen = +Math.max(0, segTop - segBot).toFixed(3);

        let vBotMin = vBotMid;
        let vTopMax = segTop;
        let vTopMin = segTop;
        let rakeDetected = isRake;

        if (!splitAssetId) {
          for (const sx of sampleXs) {
            const polyRange = polygonVRangeAtU(poly, sx);
            if (!polyRange) continue;
            const [sBot, sTop, sHasRake] = polyRange;
            const effBot = isBaseEave && sBot <= 0.05 ? sBot - sheetSpec.overhang : sBot;
            vBotMin = Math.min(vBotMin, effBot);
            vTopMax = Math.max(vTopMax, sTop);
            vTopMin = Math.min(vTopMin, sTop);
            if (sHasRake) rakeDetected = true;
          }
        } else if (segBot > 0.05) {
          // Upper piece split above an opening/dormer valley: sample envelope only across columns keeping split
          for (const sx of sampleXs) {
            const sSegs = polygonVSegmentsAtU(poly, planeApertures, sx, cover * 0.12);
            const upperMatch = sSegs.find(
              ([sb, st, , sAsset]) =>
                (sAsset === splitAssetId && sb > 0.05) || (sSegs.length > 1 && sb > 0.05 && st > segBot)
            );
            if (upperMatch) {
              vBotMin = Math.min(vBotMin, upperMatch[0]);
              vTopMax = Math.max(vTopMax, upperMatch[1]);
              vTopMin = Math.min(vTopMin, upperMatch[1]);
              if (upperMatch[2]) rakeDetected = true;
            }
          }
        }

        const rawLongLen = +Math.max(rawMidLen, vTopMax - vBotMin).toFixed(3);
        const rawShortLen = +Math.max(0.02, Math.min(rawMidLen, vTopMin - vBotMid)).toFixed(3);

        if (rawLongLen > 0.2) {
          rawSegments.push({
            colIdx: c,
            segIdx,
            uMid,
            colWidth,
            vBot: vBotMin,
            vTop: vTopMax,
            rawLongLen,
            rawShortLen,
            rawMidLen,
            geomMidLen,
            isRake: rakeDetected || rawLongLen - rawShortLen >= 0.08,
            splitAssetId
          });
        }
      });
    });

    const hasOverride = Boolean(plane.orderedSheetLengthM && plane.orderedSheetLengthM > 0.2);
    const maxRawLen =
      rawSegments.length > 0
        ? Math.max(...rawSegments.map((s) => s.rawLongLen))
        : plane.slopeLength || 0.2;
    const targetOrderedLen = hasOverride ? +plane.orderedSheetLengthM!.toFixed(3) : 0;
    const overrideScale = hasOverride && maxRawLen > 0.2 ? targetOrderedLen / maxRawLen : 1;

    const planeMaxCutLen = hasOverride
      ? targetOrderedLen
      : +Math.min(maxLen, maxRawLen).toFixed(3);

    rawSegments.forEach(
      ({
        colIdx: c,
        segIdx,
        uMid,
        colWidth,
        vBot,
        vTop,
        rawLongLen,
        rawShortLen,
        rawMidLen,
        geomMidLen,
        isRake,
        splitAssetId
      }) => {
        const isFullBodySeg = rawLongLen >= maxRawLen - 0.004;
        const effectiveLongLen = hasOverride
          ? isFullBodySeg
            ? targetOrderedLen
            : +Math.max(0.2, rawLongLen * overrideScale).toFixed(3)
          : +Math.min(rawLongLen, maxLen).toFixed(3);

        const effectiveShortLen = hasOverride
          ? isFullBodySeg && rawLongLen - rawShortLen < 0.04
            ? targetOrderedLen
            : +Math.max(0.02, rawShortLen * overrideScale).toFixed(3)
          : +Math.min(rawShortLen, effectiveLongLen, maxLen).toFixed(3);

        const effectiveMidLen = hasOverride
          ? isFullBodySeg && rawLongLen - rawMidLen < 0.04
            ? targetOrderedLen
            : +Math.max(0.1, rawMidLen * overrideScale).toFixed(3)
          : +Math.min(rawMidLen, maxLen).toFixed(3);

        const isLeftRake = uMid < midU;

        // Determine whether this column sits on the ENTRY hip side or EXIT hip side
        let zoneRole: 'entry' | 'exit' | 'body' = 'body';
        if (isRake) {
          const onU0Half = uMid <= midU;
          if (prog.entryAtU0) {
            zoneRole = onU0Half ? 'entry' : 'exit';
          } else {
            zoneRole = onU0Half ? 'exit' : 'entry';
          }
        }

        const planCenter = developedToPlanPoint(
          { x: uMid, y: (vBot + vTop) / 2 },
          eaveP1,
          eaveP2,
          plane.pitchDeg,
          runDir
        );

        allNeededPieces.push({
          planeId: plane.id,
          planeName: plane.name || `Section ${plane.code || plane.id.slice(-4)}`,
          sequenceIndex: plane.sequenceIndex || 1,
          seqPos: prog.seqPos,
          colIndex: c + 1,
          segIndex: segIdx,
          uCenter: +uMid.toFixed(2),
          colWidth,
          minV: +vBot.toFixed(2),
          maxV: +vTop.toFixed(2),
          cutLength: effectiveLongLen,
          shortLength: effectiveShortLen,
          midLength: effectiveMidLen,
          geomMidLength: geomMidLen,
          planeMaxCutLen,
          hasOrderedOverride: hasOverride,
          targetOrderedLen: hasOverride ? targetOrderedLen : undefined,
          isTriangularRake: isRake,
          splitFromAssetId: splitAssetId,
          zoneRole,
          isLeftRake,
          pitchDeg: plane.pitchDeg,
          underlapSide: plane.underlapSide,
          planCenter
        });
      }
    );
  });

  // Baseline standalone ordered metres (1 parent sheet per needed piece at true cutLength — zero artificial inflation)
  const standaloneOrderedMetres = +allNeededPieces
    .reduce((sum, item) => sum + item.cutLength, 0)
    .toFixed(3);

  // Step 2: True Ordered Parents + Separate Offcut Repress Pass
  // - Never manufactures longer higher-waste mother blanks (e.g. no 4.0m/2.0m artificial floors)
  // - Only represses when:
  //   (A) Linear leftover tail on an ordered sheet covers another piece (remaining >= cutLength + 0.02m), OR
  //   (B) Diagonal hip/valley complementary cutoff saves >= 0.12m AND fits within practical body run <= maxLen
  const parentSheets: ParentSheet[] = [];
  const parentMetaByIndex: Array<{
    linearRemaining: number;
    hasOrderedOverride?: boolean;
    targetOrderedLen?: number;
    pitchDeg: number;
    underlapSide: 'left' | 'right';
    midSum: number;
  }> = [];
  const placedPieces: CutPiece[] = [];
  const placementMap: LayoutResult['placementMap'] = orderedPlanes.map((p) => ({
    planeId: p.id,
    planeName: p.name || `Section ${p.code || p.id}`,
    pieces: []
  }));

  const pairedPieceIndices = new Set<number>();
  let sheetNumberCounter = 1;

  const transferMatrix: Record<string, Record<string, number>> = {};
  orderedPlanes.forEach((p) => {
    transferMatrix[p.id] = {};
  });

  interface TransferredPieceInfo {
    sourcePlaneId: string;
    targetPlaneId: string;
    piece: CutPiece;
    sourcePlanCenter: Point2D;
    targetPlanCenter: Point2D;
    uCenter: number;
    width: number;
    cutLength: number;
    ruleApplied:
      | 'adjacent_hip_run'
      | 'matching_end_slope'
      | 'next_sequence_slope'
      | 'opposite_hip_same_slope'
      | 'geometric_fallback';
  }
  const offcutTransfers: TransferredPieceInfo[] = [];

  const quantizeMm = (lenM: number) => +(Math.round(lenM * 1000) / 1000).toFixed(3);
  const KERF_LIN = 0.02;

  const evalDiagonalRepress = (
    p1: NeededSheetStrip,
    p2: NeededSheetStrip
  ): { parentBlankLen: number; savings: number } | null => {
    if (Math.abs(p1.pitchDeg - p2.pitchDeg) > 0.5) return null;
    const canFlip180 = p1.underlapSide !== p2.underlapSide || p1.planeId !== p2.planeId;
    if (!canFlip180) return null;

    // Protect site-measured full body runs from being altered or swallowed
    if (p2.hasOrderedOverride && !p2.isTriangularRake) return null;

    const p1Taper = p1.cutLength - p1.shortLength;
    const p2Taper = p2.cutLength - p2.shortLength;
    if (p1Taper < 0.08 && p2Taper < 0.08) return null;

    const diagKerf = p1.shortLength > 0.25 && p2.shortLength > 0.25 ? 0.015 : 0;
    const nestedRaw = Math.max(
      p1.cutLength + p2.shortLength,
      p1.shortLength + p2.cutLength + diagKerf
    );
    const parentBlankLen = quantizeMm(Math.max(p1.cutLength, nestedRaw));

    if (parentBlankLen > maxLen + 0.001) return null;
    if (p1.hasOrderedOverride && p1.targetOrderedLen && parentBlankLen > p1.targetOrderedLen + 0.001) {
      return null;
    }

    const practicalCap = Math.min(
      maxLen,
      Math.max(p1.planeMaxCutLen, p2.planeMaxCutLen, p1.cutLength, p2.cutLength) + 0.05
    );
    if (parentBlankLen > practicalCap + 0.001) return null;

    const standalonePairLen = p1.cutLength + p2.cutLength;
    const savings = +(standalonePairLen - parentBlankLen).toFixed(3);
    if (savings < 0.12) return null;

    return { parentBlankLen, savings };
  };

  const commitRepressPair = (
    p1Idx: number,
    p2Idx: number,
    parentBlankLen: number,
    ruleApplied: TransferredPieceInfo['ruleApplied']
  ) => {
    const p1 = allNeededPieces[p1Idx];
    const p2 = allNeededPieces[p2Idx];
    pairedPieceIndices.add(p1Idx);
    pairedPieceIndices.add(p2Idx);

    const parentId = `parent-sheet-${sheetNumberCounter}`;
    const color = PARENT_PALETTE[(sheetNumberCounter - 1) % PARENT_PALETTE.length];

    const piece1Note =
      ruleApplied === 'adjacent_hip_run' || ruleApplied === 'next_sequence_slope'
        ? `Ordered run on ${p1.planeName} – diagonal offcut repressed into ${p2.planeName}`
        : `Ordered sheet #${sheetNumberCounter} (offcut reused)`;

    const piece2Note =
      p1.planeId !== p2.planeId
        ? `Repressed 180° offcut from ${p1.planeName}`
        : `Opposite hip 180° offcut from ${p1.planeName}`;

    const piece1: CutPiece = {
      id: `piece-${p1.planeId}-${p1.colIndex}-${p1.segIndex}`,
      parentSheetId: parentId,
      length: p1.cutLength,
      width: p1.colWidth,
      cutFrom: 0,
      orientation: 'normal',
      targetPlaneId: p1.planeId,
      placement: { origin: { x: p1.uCenter, y: p1.minV }, rotation: 0, flipped: false },
      underlapSide: p1.underlapSide,
      facetName: p1.planeName,
      colIndex: p1.colIndex,
      minV: p1.minV,
      maxV: p1.maxV,
      splitFromAssetId: p1.splitFromAssetId,
      note: piece1Note
    };

    const piece2: CutPiece = {
      id: `piece-${p2.planeId}-${p2.colIndex}-${p2.segIndex}`,
      parentSheetId: parentId,
      length: p2.cutLength,
      width: p2.colWidth,
      cutFrom: quantizeMm(Math.max(0, parentBlankLen - p2.cutLength)),
      orientation: 'flipped180',
      targetPlaneId: p2.planeId,
      placement: { origin: { x: p2.uCenter, y: p2.minV }, rotation: 180, flipped: true },
      underlapSide: p2.underlapSide,
      facetName: p2.planeName,
      colIndex: p2.colIndex,
      minV: p2.minV,
      maxV: p2.maxV,
      splitFromAssetId: p2.splitFromAssetId,
      note: piece2Note
    };

    if (p1.planeId !== p2.planeId) {
      transferMatrix[p1.planeId][p2.planeId] = (transferMatrix[p1.planeId][p2.planeId] || 0) + 1;
      offcutTransfers.push({
        sourcePlaneId: p1.planeId,
        targetPlaneId: p2.planeId,
        sourcePlanCenter: p1.planCenter,
        targetPlanCenter: p2.planCenter,
        piece: piece2,
        uCenter: p2.uCenter,
        width: p2.colWidth,
        cutLength: p2.cutLength,
        ruleApplied
      });
    }

    const midSum = p1.midLength + p2.midLength;
    const naturalDrop = +Math.max(0, parentBlankLen - midSum).toFixed(3);
    const parentSheet: ParentSheet = {
      id: parentId,
      sheetNumber: sheetNumberCounter++,
      length: parentBlankLen,
      color,
      pieces: [piece1, piece2],
      remaining: naturalDrop,
      utilization: +Math.min(100, (midSum / parentBlankLen) * 100).toFixed(1)
    };

    parentSheets.push(parentSheet);
    parentMetaByIndex.push({
      linearRemaining: +Math.max(0, parentBlankLen - (p1.cutLength + p2.cutLength)).toFixed(3),
      hasOrderedOverride: p1.hasOrderedOverride,
      targetOrderedLen: p1.targetOrderedLen,
      pitchDeg: p1.pitchDeg,
      underlapSide: p1.underlapSide,
      midSum
    });
    placedPieces.push(piece1, piece2);

    addToPlacementMap(placementMap, p1.planeId, {
      pieceId: piece1.id,
      parentId,
      parentSheetNumber: parentSheet.sheetNumber,
      length: piece1.length,
      isOffcut: false,
      orientation: 'normal',
      note: piece1Note,
      color
    });

    addToPlacementMap(placementMap, p2.planeId, {
      pieceId: piece2.id,
      parentId,
      parentSheetNumber: parentSheet.sheetNumber,
      length: piece2.length,
      isOffcut: true,
      orientation: 'flipped180',
      note: `➔ ${piece2Note}`,
      color
    });
  };

  // PASS 1: Strict Progressive Perimeter Flow per roof level ring (P_k.exit -> P_{(k+1)%N}.entry)
  // Models laying along main/current face into exit hip, then flipping offcuts across the hip into next face's entry side
  const levelRings = new Map<string, RoofPlane[]>();
  orderedMain.forEach((p) => {
    const key = p.levelId || 'level-1';
    const arr = levelRings.get(key) || [];
    arr.push(p);
    levelRings.set(key, arr);
  });

  levelRings.forEach((ringPlanes) => {
    const ringLen = ringPlanes.length;
    if (ringLen < 2) return;
    for (let k = 0; k < ringLen; k++) {
      const srcPlane = ringPlanes[k];
      const tgtPlane = ringPlanes[(k + 1) % ringLen];
      if (!srcPlane || !tgtPlane || srcPlane.id === tgtPlane.id) continue;
      if (Math.abs(srcPlane.pitchDeg - tgtPlane.pitchDeg) > 0.5) continue;
      if (!arePlanesAdjacentAtHip(srcPlane, tgtPlane)) continue;

      const srcExitIndices = allNeededPieces
        .map((item, idx) => ({ item, idx }))
        .filter(
          ({ item, idx }) =>
            !pairedPieceIndices.has(idx) &&
            item.planeId === srcPlane.id &&
            item.isTriangularRake &&
            item.zoneRole === 'exit'
        )
        .sort((a, b) => b.item.cutLength - a.item.cutLength);

      for (const { item: p1, idx: p1Idx } of srcExitIndices) {
        if (pairedPieceIndices.has(p1Idx)) continue;

        let bestIdx = -1;
        let bestBlankLen = 0;
        let bestScore = -Infinity;

        for (let j = 0; j < allNeededPieces.length; j++) {
          if (pairedPieceIndices.has(j)) continue;
          const p2 = allNeededPieces[j];
          if (p2.planeId !== tgtPlane.id || !p2.isTriangularRake || p2.zoneRole !== 'entry') continue;

          const fit = evalDiagonalRepress(p1, p2);
          if (!fit) continue;

          // Prioritize highest material saved and smallest natural drop
          const score = fit.savings * 100 - (fit.parentBlankLen - (p1.midLength + p2.midLength)) * 10;
          if (score > bestScore) {
            bestScore = score;
            bestIdx = j;
            bestBlankLen = fit.parentBlankLen;
          }
        }

        if (bestIdx >= 0) {
          commitRepressPair(p1Idx, bestIdx, bestBlankLen, 'adjacent_hip_run');
        }
      }
    }
  });

  // PASS 2: Cleanup / Mixed-Pitch & Remaining Unpaired Rakes
  const remainingRakeIndices = allNeededPieces
    .map((item, idx) => ({ item, idx }))
    .filter(({ item, idx }) => item.isTriangularRake && !pairedPieceIndices.has(idx))
    .sort((a, b) => b.item.cutLength - a.item.cutLength);

  for (const { item: p1, idx: p1Idx } of remainingRakeIndices) {
    if (pairedPieceIndices.has(p1Idx)) continue;

    let bestIdx = -1;
    let bestBlankLen = 0;
    let highestScore = -Infinity;
    let bestRule: TransferredPieceInfo['ruleApplied'] = 'geometric_fallback';

    for (const { item: p2, idx: p2Idx } of remainingRakeIndices) {
      if (p2Idx === p1Idx || pairedPieceIndices.has(p2Idx)) continue;

      const fit = evalDiagonalRepress(p1, p2);
      if (!fit) continue;

      const plane1 = orderedPlanes[p1.seqPos];
      const plane2 = orderedPlanes[p2.seqPos];
      const isAdjacentHip = plane1 && plane2 && arePlanesAdjacentAtHip(plane1, plane2);
      const isEndSlopeMatch = plane1 && plane2 && isMatchingEndSlopeSegment(plane1, plane2);
      const forwardDiff = (p2.seqPos - p1.seqPos + nPlanes) % nPlanes;

      let tierScore = 0;
      let rule: TransferredPieceInfo['ruleApplied'] = 'geometric_fallback';

      if (p1.planeId !== p2.planeId && isAdjacentHip) {
        tierScore = 140000 - (forwardDiff === 1 ? 0 : forwardDiff * 3000);
        rule = 'adjacent_hip_run';
      } else if (p1.planeId === p2.planeId && p1.zoneRole !== p2.zoneRole) {
        tierScore = 110000;
        rule = 'opposite_hip_same_slope';
      } else if (p1.planeId !== p2.planeId && isEndSlopeMatch && forwardDiff > 0 && forwardDiff <= 2) {
        tierScore = 105000 - forwardDiff * 2500;
        rule = 'matching_end_slope';
      } else if (p1.planeId !== p2.planeId && forwardDiff > 0) {
        tierScore = 75000 - forwardDiff * 3500;
        rule = 'next_sequence_slope';
      } else {
        tierScore = 30000;
        rule = 'geometric_fallback';
      }

      const score = tierScore + fit.savings * 2000;
      if (score > highestScore) {
        highestScore = score;
        bestIdx = p2Idx;
        bestBlankLen = fit.parentBlankLen;
        bestRule = rule;
      }
    }

    if (bestIdx >= 0) {
      commitRepressPair(p1Idx, bestIdx, bestBlankLen, bestRule);
    }
  }

  // PASS 2B: Aperture / Short Split Pieces & Dormer/Apron Diagonal Repress
  const derivedOrSplitPlaneIds = new Set(
    orderedPlanes
      .filter((p) => p.isVirtualAssetPlane || p.pitchZoneRole === 'lower_apron' || p.pitchZoneRole === 'upper_main')
      .map((p) => p.id)
  );
  const isAssetSplitOrDerived = (item: NeededSheetStrip): boolean =>
    Boolean(item.splitFromAssetId) || derivedOrSplitPlaneIds.has(item.planeId);

  if (hasAssetsOrBreaks) {
    const shortSplitCandidates = allNeededPieces
      .map((item, idx) => ({ item, idx }))
      .filter(
        ({ item, idx }) =>
          !pairedPieceIndices.has(idx) &&
          (isAssetSplitOrDerived(item) || item.cutLength <= maxLen * 0.58)
      )
      .sort((a, b) => b.item.cutLength - a.item.cutLength);

    for (const { item: p1, idx: p1Idx } of shortSplitCandidates) {
      if (pairedPieceIndices.has(p1Idx)) continue;
      let bestIdx = -1;
      let bestBlankLen = 0;
      let bestSavings = 0;

      for (const { item: p2, idx: p2Idx } of shortSplitCandidates) {
        if (p2Idx === p1Idx || pairedPieceIndices.has(p2Idx)) continue;
        if (!isAssetSplitOrDerived(p1) && !isAssetSplitOrDerived(p2)) continue;
        const fit = evalDiagonalRepress(p1, p2);
        if (fit && fit.savings > bestSavings) {
          bestSavings = fit.savings;
          bestBlankLen = fit.parentBlankLen;
          bestIdx = p2Idx;
        }
      }

      if (bestIdx >= 0) {
        commitRepressPair(p1Idx, bestIdx, bestBlankLen, 'geometric_fallback');
      }
    }
  }

  // Step 3: Allocate Standalone Ordered Parents for Remaining Pieces + Linear Leftover Tail Repress
  const remainingIndices = allNeededPieces
    .map((item, idx) => ({ item, idx }))
    .filter(({ idx }) => !pairedPieceIndices.has(idx))
    .sort((a, b) => b.item.cutLength - a.item.cutLength);

  for (const { item, idx: itemIdx } of remainingIndices) {
    if (pairedPieceIndices.has(itemIdx)) continue;

    // First try straight linear leftover tail repress into an already ordered ParentSheet (without lengthening it)
    let linearDonorIdx = -1;
    let bestWasteLeft = Infinity;
    for (let pi = 0; pi < parentSheets.length; pi++) {
      const meta = parentMetaByIndex[pi];
      if (!meta || meta.linearRemaining < item.cutLength + KERF_LIN) continue;
      if (Math.abs(meta.pitchDeg - item.pitchDeg) > 0.5) continue;
      const wasteLeft = meta.linearRemaining - (item.cutLength + KERF_LIN);
      if (wasteLeft < bestWasteLeft) {
        bestWasteLeft = wasteLeft;
        linearDonorIdx = pi;
      }
    }

    if (linearDonorIdx >= 0) {
      const donorParent = parentSheets[linearDonorIdx];
      const donorMeta = parentMetaByIndex[linearDonorIdx];
      const primary = donorParent.pieces[0];
      const cutFrom = quantizeMm(donorParent.length - donorMeta.linearRemaining);

      const repressedPiece: CutPiece = {
        id: `piece-${item.planeId}-${item.colIndex}-${item.segIndex}`,
        parentSheetId: donorParent.id,
        length: item.cutLength,
        width: item.colWidth,
        cutFrom,
        orientation: 'flipped180',
        targetPlaneId: item.planeId,
        placement: { origin: { x: item.uCenter, y: item.minV }, rotation: 180, flipped: true },
        underlapSide: item.underlapSide,
        facetName: item.planeName,
        colIndex: item.colIndex,
        minV: item.minV,
        maxV: item.maxV,
        splitFromAssetId: item.splitFromAssetId,
        note: `Repressed from leftover tail of Stock #${donorParent.sheetNumber} (${primary?.facetName || 'Main'})`
      };

      donorParent.pieces.push(repressedPiece);
      donorMeta.linearRemaining = +Math.max(0, donorMeta.linearRemaining - item.cutLength - KERF_LIN).toFixed(3);
      donorMeta.midSum += item.midLength;
      donorParent.remaining = +Math.max(0, donorParent.length - donorMeta.midSum).toFixed(3);
      donorParent.utilization = +Math.min(100, (donorMeta.midSum / donorParent.length) * 100).toFixed(1);

      placedPieces.push(repressedPiece);
      pairedPieceIndices.add(itemIdx);

      addToPlacementMap(placementMap, item.planeId, {
        pieceId: repressedPiece.id,
        parentId: donorParent.id,
        parentSheetNumber: donorParent.sheetNumber,
        length: repressedPiece.length,
        isOffcut: true,
        orientation: 'flipped180',
        note: `➔ ${repressedPiece.note}`,
        color: donorParent.color || '#3b82f6'
      });

      if (primary && primary.targetPlaneId !== item.planeId) {
        transferMatrix[primary.targetPlaneId][item.planeId] =
          (transferMatrix[primary.targetPlaneId][item.planeId] || 0) + 1;
        const srcPlane = orderedPlanes.find((p) => p.id === primary.targetPlaneId);
        offcutTransfers.push({
          sourcePlaneId: primary.targetPlaneId,
          targetPlaneId: item.planeId,
          sourcePlanCenter: srcPlane ? polygonCentroid(srcPlane.planPolygon) : item.planCenter,
          targetPlanCenter: item.planCenter,
          piece: repressedPiece,
          uCenter: item.uCenter,
          width: item.colWidth,
          cutLength: item.cutLength,
          ruleApplied: 'geometric_fallback'
        });
      }
      continue;
    }

    // Otherwise order 1 parent sheet for this piece at its exact cutLength (no 2.0m artificial floor)
    const parentId = `parent-sheet-${sheetNumberCounter}`;
    const color = PARENT_PALETTE[(sheetNumberCounter - 1) % PARENT_PALETTE.length];
    const orderLength = quantizeMm(item.cutLength);

    const piece: CutPiece = {
      id: `piece-${item.planeId}-${item.colIndex}-${item.segIndex}`,
      parentSheetId: parentId,
      length: item.cutLength,
      width: item.colWidth,
      cutFrom: 0,
      orientation: 'normal',
      targetPlaneId: item.planeId,
      placement: { origin: { x: item.uCenter, y: item.minV }, rotation: 0, flipped: false },
      underlapSide: item.underlapSide,
      facetName: item.planeName,
      colIndex: item.colIndex,
      minV: item.minV,
      maxV: item.maxV,
      splitFromAssetId: item.splitFromAssetId,
      note: item.splitFromAssetId
        ? `Cut around opening (#${sheetNumberCounter})`
        : `Direct run sheet #${sheetNumberCounter}`
    };

    const naturalDrop = +Math.max(0, orderLength - item.midLength).toFixed(3);
    const parentSheet: ParentSheet = {
      id: parentId,
      sheetNumber: sheetNumberCounter++,
      length: orderLength,
      color,
      pieces: [piece],
      remaining: naturalDrop,
      utilization: +Math.min(100, (item.midLength / orderLength) * 100).toFixed(1)
    };

    parentSheets.push(parentSheet);
    parentMetaByIndex.push({
      linearRemaining: +Math.max(0, orderLength - item.cutLength).toFixed(3),
      hasOrderedOverride: item.hasOrderedOverride,
      targetOrderedLen: item.targetOrderedLen,
      pitchDeg: item.pitchDeg,
      underlapSide: item.underlapSide,
      midSum: item.midLength
    });
    placedPieces.push(piece);

    addToPlacementMap(placementMap, item.planeId, {
      pieceId: piece.id,
      parentId,
      parentSheetNumber: parentSheet.sheetNumber,
      length: piece.length,
      isOffcut: false,
      orientation: 'normal',
      note: `Ordered blank #${parentSheet.sheetNumber}`,
      color
    });
  }

  // Calculate Reconciled Metrics (Honest & Reconciled 100% with ParentSheet[] and Roof Geometry)
  const totalRoofMetres = +allNeededPieces.reduce((sum, p) => sum + p.midLength, 0).toFixed(2);
  const totalOrderedMetres = +parentSheets.reduce((sum, s) => sum + s.length, 0).toFixed(2);

  // Compute net developed roof area from unfolded planes minus apertures (exact physical roof m²)
  const netRoofAreaM2 = orderedPlanes.reduce((acc, p) => {
    const devArea =
      p.developedPolygon && p.developedPolygon.length >= 3
        ? polygonArea(p.developedPolygon)
        : p.area || 0;
    const appArea = (p.apertures || []).reduce((apAcc, app) => {
      if (app.developedPolygon && app.developedPolygon.length >= 3) {
        return apAcc + polygonArea(app.developedPolygon);
      }
      return apAcc + Math.max(0, (app.uMax - app.uMin) * (app.vMax - app.vMin));
    }, 0);
    return acc + Math.max(0, devArea - appArea);
  }, 0);
  const totalRoofArea = +(netRoofAreaM2 > 0 ? netRoofAreaM2 : totalRoofMetres * cover).toFixed(2);
  const totalOrderedArea = +(totalOrderedMetres * cover).toFixed(2);

  const scrapMetres = Math.max(0, +(totalOrderedMetres - totalRoofMetres).toFixed(2));
  const wastePercent = totalOrderedMetres > 0 ? +((scrapMetres / totalOrderedMetres) * 100).toFixed(1) : 0;
  const totalOffcutsReused = parentSheets.reduce((sum, s) => sum + Math.max(0, s.pieces.length - 1), 0);
  const savedMetres = +Math.max(0, standaloneOrderedMetres - totalOrderedMetres).toFixed(2);
  const dollarValueSavedNZD = Math.round(savedMetres * 21.5);

  // Step 4: SECTION-BASED PRESENTATION WITH SEQUENTIAL LAYING ORDER
  const sections: SectionSummary[] = orderedPlanes.map((plane) => {
    const piecesForPlane = placedPieces.filter((p) => p.targetPlaneId === plane.id);
    const offcutsReceived = piecesForPlane.filter((p) => p.orientation === 'flipped180').length;

    const outgoing = transferMatrix[plane.id] || {};
    const totalOut = Object.values(outgoing).reduce((a, b) => a + b, 0);

    let role: SectionSummary['role'] = 'balanced';
    let pairingNote = 'Self-contained uniform run';

    if (totalOut > 0 && offcutsReceived === 0) {
      role = 'producer';
      const targetPlanes = Object.keys(outgoing)
        .map((tid) => orderedPlanes.find((p) => p.id === tid)?.name || tid)
        .join(', ');
      pairingNote = `Hip offcuts carry to opposite hip on ${targetPlanes}`;
    } else if (offcutsReceived > 0 && totalOut === 0) {
      role = 'receiver';
      const sourceNames = orderedPlanes
        .filter((src) => (transferMatrix[src.id] || {})[plane.id] > 0)
        .map((s) => s.name)
        .join(', ');
      pairingNote = `Installs offcuts from ${sourceNames || 'Main Run'} on opposite hip`;
    } else if (totalOut > 0 && offcutsReceived > 0) {
      role = 'balanced';
      const srcNames = orderedPlanes
        .filter((src) => (transferMatrix[src.id] || {})[plane.id] > 0)
        .map((s) => s.code)
        .join(', ');
      const tgtNames = Object.keys(outgoing)
        .map((tid) => orderedPlanes.find((p) => p.id === tid)?.code || tid)
        .join(', ');
      pairingNote = `Starts opposite hip (${srcNames} offcuts) · lays back to feed ${tgtNames}`;
    }

    const eaveLen = plane.planPolygon[1] ? dist(plane.planPolygon[0], plane.planPolygon[1]) : 10;

    return {
      planeId: plane.id,
      code: plane.code || 'A',
      label: plane.label || `SECTION ${plane.code || 'A'}`,
      name: plane.name || `Face ${plane.code}`,
      color: plane.color || '#2563eb',
      pitchDeg: plane.pitchDeg,
      underlapSide: plane.underlapSide,
      role,
      slopeLengthM: plane.slopeLength || 5.0,
      ...(plane.orderedSheetLengthM ? { orderedSheetLengthM: plane.orderedSheetLengthM } : {}),
      eaveWidthM: +eaveLen.toFixed(1),
      areaM2: plane.area || 30.0,
      sheetCount: piecesForPlane.length,
      offcutsProduced: totalOut,
      offcutsReused: offcutsReceived,
      pairingNote,
      sequenceIndex: plane.sequenceIndex,
      isStartEdge: plane.isStartEdge,
      entryCorner: planeProgression.get(plane.id)?.entryCorner,
      exitCorner: planeProgression.get(plane.id)?.exitCorner,
      eaveHeightM: plane.eaveHeightM ?? 2.7,
      levelId: plane.levelId,
      levelCode: plane.levelCode
    };
  });

  // Step 5: Build Inherited Colour Receiving Zones FIRST so Pairing Links anchor directly into zone & cut centers
  orderedPlanes.forEach((p) => {
    p.receivingZones = [];
  });

  const receivingZones: OffcutReceivingZone[] = [];
  const transferGroups = new Map<string, TransferredPieceInfo[]>();
  offcutTransfers.forEach((item) => {
    const key = `${item.targetPlaneId}::${item.sourcePlaneId}`;
    const list = transferGroups.get(key) || [];
    list.push(item);
    transferGroups.set(key, list);
  });

  const zoneAnchorByTransferKey = new Map<string, { startPt: Point2D; endPt: Point2D }>();

  let zoneStepCounter = 1;
  transferGroups.forEach((transferredList, key) => {
    const [targetPlaneId, sourcePlaneId] = key.split('::');
    const targetPlane = orderedPlanes.find((p) => p.id === targetPlaneId);
    const sourcePlane = orderedPlanes.find((p) => p.id === sourcePlaneId);

    if (
      !targetPlane ||
      !sourcePlane ||
      !targetPlane.developedPolygon ||
      targetPlane.developedPolygon.length < 3
    ) {
      return;
    }

    const minU = Math.min(...transferredList.map((t) => t.uCenter - t.width / 2));
    const maxU = Math.max(...transferredList.map((t) => t.uCenter + t.width / 2));

    const devPoly = targetPlane.developedPolygon;
    const polyMinU = Math.min(...devPoly.map((p) => p.x));
    const polyMaxU = Math.max(...devPoly.map((p) => p.x));
    const clampedMinU = Math.max(polyMinU, minU);
    const clampedMaxU = Math.min(polyMaxU, maxU);

    if (clampedMaxU <= clampedMinU) return;

    const clippedDevPoly = clipPolygonByXRange(devPoly, clampedMinU, clampedMaxU);
    if (clippedDevPoly.length < 3) return;

    const eaveP1 = targetPlane.planPolygon[0];
    const eaveP2 = targetPlane.planPolygon[1] || targetPlane.planPolygon[0];
    const runDir = targetPlane.runDirection || { x: 0, y: 1 };

    const planPoly = clippedDevPoly.map((pt) =>
      developedToPlanPoint(pt, eaveP1, eaveP2, targetPlane.pitchDeg, runDir)
    );

    const srcColor = sourcePlane.color || '#2563eb';
    const primaryRule = transferredList[0]?.ruleApplied || 'adjacent_hip_run';
    const ruleLabel =
      primaryRule === 'adjacent_hip_run'
        ? 'Adjacent Hip'
        : primaryRule === 'matching_end_slope'
        ? 'End Slope'
        : primaryRule === 'opposite_hip_same_slope'
        ? 'Opposite Hip'
        : 'Next in Lay';

    const zone: OffcutReceivingZone = {
      id: `rx-${sourcePlane.id}-${targetPlane.id}`,
      targetPlaneId: targetPlane.id,
      sourcePlaneId: sourcePlane.id,
      sourceCode: sourcePlane.code || 'A',
      sourceName: sourcePlane.name || `Section ${sourcePlane.code || 'A'}`,
      sourceColor: srcColor,
      softSourceColor: getSoftColor(srcColor, 0.48),
      tintColor: getSoftTintColor(srcColor),
      planPolygon: planPoly,
      developedPolygon: clippedDevPoly,
      piecesCount: transferredList.length,
      label: `From ${sourcePlane.code || 'A'} (${ruleLabel}, ${transferredList.length} pcs)`,
      sequenceStep: zoneStepCounter++,
      ruleApplied: primaryRule
    };

    receivingZones.push(zone);
    if (!targetPlane.receivingZones) targetPlane.receivingZones = [];
    targetPlane.receivingZones.push(zone);

    const cutCentroid = polygonCentroid(transferredList.map((t) => t.sourcePlanCenter));
    const rxCentroid = polygonCentroid(planPoly);
    zoneAnchorByTransferKey.set(`${sourcePlane.id}::${targetPlane.id}`, {
      startPt: cutCentroid,
      endPt: rxCentroid
    });
  });

  // Step 6: Sequential Installation Links anchored directly at Cut Strips -> Receiving Zones across Shared Hips
  const pairingLinks: SectionPairingLink[] = [];
  let linkCounter = 1;
  orderedPlanes.forEach((src) => {
    const outgoing = transferMatrix[src.id] || {};
    Object.entries(outgoing).forEach(([tgtId, count]) => {
      if (count > 0 && tgtId !== src.id) {
        const tgt = orderedPlanes.find((p) => p.id === tgtId);
        if (tgt) {
          const anchors = zoneAnchorByTransferKey.get(`${src.id}::${tgt.id}`);
          const c1 = anchors ? anchors.startPt : polygonCentroid(src.planPolygon);
          const c2 = anchors ? anchors.endPt : polygonCentroid(tgt.planPolygon);

          const transferInfo = offcutTransfers.find(
            (t) => t.sourcePlaneId === src.id && t.targetPlaneId === tgt.id
          );
          const ruleType = transferInfo?.ruleApplied || 'adjacent_hip_run';
          const ruleLabel =
            ruleType === 'adjacent_hip_run'
              ? 'Adjacent Hip'
              : ruleType === 'matching_end_slope'
              ? 'End Slope'
              : ruleType === 'opposite_hip_same_slope'
              ? 'Opposite Hip'
              : 'Next in Lay';

          const pairingType =
            ruleType === 'adjacent_hip_run'
              ? 'adjacent_hip'
              : ruleType === 'matching_end_slope'
              ? 'matching_end_slope'
              : ruleType === 'opposite_hip_same_slope'
              ? 'self_contained'
              : 'next_in_sequence';

          pairingLinks.push({
            id: `link-${src.id}-${tgt.id}`,
            sourcePlaneId: src.id,
            targetPlaneId: tgt.id,
            sourceName: src.name,
            targetName: tgt.name,
            labelText: `${src.code || 'A'} ➔ ${tgt.code || 'B'} (${ruleLabel}, ${count} pcs)`,
            startPoint: c1,
            endPoint: c2,
            midPoint: { x: +((c1.x + c2.x) / 2).toFixed(2), y: +((c1.y + c2.y) / 2).toFixed(2) },
            piecesTransferred: count,
            sequenceStep: linkCounter++,
            pairingType
          });
        }
      }
    });
  });

  // Step 7: Build Installation Sequence Overview for UI Stepper
  const installationSequence: InstallationStep[] = orderedPlanes.map((p, idx) => {
    const eaveLen = p.planPolygon[1] ? dist(p.planPolygon[0], p.planPolygon[1]) : 10;
    let description = '';
    if (idx === 0) {
      description = 'Start face (longest eave). Lay progressively into hip 1; offcuts carry to opposite hip (hip 2) on next face.';
    } else if (idx % 2 === 1) {
      const prevPlane = orderedPlanes[idx - 1];
      description = `Installs ${prevPlane.code} offcuts on opposite hip, then lays new sheets back into shared hip.`;
    } else {
      const prevPlane = orderedPlanes[idx - 1];
      description = `Starts on shared hip with ${prevPlane.code} offcuts and lays progressively into next corner hip.`;
    }
    return {
      sequenceIndex: idx + 1,
      stepNumber: idx + 1,
      planeId: p.id,
      planeName: p.name || `Section ${p.code}`,
      code: p.code || 'A',
      color: p.color || '#2563eb',
      isStartEdge: idx === 0,
      eaveLengthM: +eaveLen.toFixed(1),
      slopeLengthM: p.slopeLength || 5.0,
      description,
      eaveHeightM: p.eaveHeightM ?? 2.7,
      levelCode: p.levelCode
    };
  });

  return {
    parents: parentSheets,
    pieces: placedPieces,
    sections,
    pairingLinks,
    wastePercent,
    totalOrderedArea,
    totalRoofArea,
    totalOrderedMetres,
    totalRoofMetres,
    savedMetres,
    dollarValueSavedNZD,
    totalOffcutsReused,
    receivingZones,
    startPlaneId,
    startEdgeId,
    installationSequence,
    effectivePlanes: orderedPlanes,
    placementMap
  };
}

function addToPlacementMap(
  map: LayoutResult['placementMap'],
  planeId: string,
  entry: LayoutResult['placementMap'][0]['pieces'][0]
) {
  const target = map.find((m) => m.planeId === planeId);
  if (target) {
    target.pieces.push(entry);
  }
}

// ---------------------------------------------------------------------------
// 5. GEOMETRY HELPERS
// ---------------------------------------------------------------------------
export function dist(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pointsClose(a: Point2D, b: Point2D, tol = 0.05): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) < tol;
}

export function polygonArea(pts: Point2D[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a) / 2;
}

export function polygonCentroid(pts: Point2D[]): Point2D {
  if (pts.length === 0) return { x: 0, y: 0 };
  const cx = pts.reduce((acc, p) => acc + p.x, 0) / pts.length;
  const cy = pts.reduce((acc, p) => acc + p.y, 0) / pts.length;
  return { x: +cx.toFixed(2), y: +cy.toFixed(2) };
}

export function isPointInPolygon(pt: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonVRangeAtU(poly: Point2D[], u: number): [number, number, boolean] | null {
  const intersections: number[] = [];
  let hasRakeSlope = false;

  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];

    if ((p.x <= u && q.x > u) || (q.x <= u && p.x > u)) {
      const t = (u - p.x) / (q.x - p.x);
      const v = p.y + t * (q.y - p.y);
      intersections.push(v);

      const slope = Math.abs((q.y - p.y) / (q.x - p.x));
      if (slope > 0.3 && slope < 3.0) {
        hasRakeSlope = true;
      }
    }
  }

  if (intersections.length < 2) return null;
  intersections.sort((a, b) => a - b);
  return [intersections[0], intersections[intersections.length - 1], hasRakeSlope];
}

export function polygonVSegmentsAtU(
  poly: Point2D[],
  apertures: PlaneAperture[],
  u: number,
  halfSheetTol = 0.25
): Array<[number, number, boolean, string | undefined]> {
  const baseRange = polygonVRangeAtU(poly, u);
  if (!baseRange) return [];

  const [vMin, vMax, baseHasRake] = baseRange;
  let segments: Array<{ minV: number; maxV: number; hasRake: boolean; splitAssetId?: string }> = [
    { minV: vMin, maxV: vMax, hasRake: baseHasRake, splitAssetId: undefined }
  ];

  // Subtract every aperture whose horizontal band overlaps this sheet column meaningfully
  apertures.forEach((app) => {
    const overlapLeft = Math.max(u - halfSheetTol, app.uMin);
    const overlapRight = Math.min(u + halfSheetTol, app.uMax);
    if (overlapRight <= overlapLeft) return;

    let appVMin = app.vMin;
    let appVMax = app.vMax;
    let appHasSlope = false;

    if (app.developedPolygon && app.developedPolygon.length >= 3) {
      const sampleU = Math.max(app.uMin + 0.015, Math.min(app.uMax - 0.015, (overlapLeft + overlapRight) / 2));
      const polyBand = polygonVRangeAtU(app.developedPolygon, sampleU);
      if (!polyBand) return;
      appVMin = polyBand[0];
      appVMax = polyBand[1];
      appHasSlope = polyBand[2];
    }

    const nextSegments: Array<{ minV: number; maxV: number; hasRake: boolean; splitAssetId?: string }> = [];
    segments.forEach((seg) => {
      if (appVMax <= seg.minV || appVMin >= seg.maxV) {
        nextSegments.push(seg);
        return;
      }
      // Below opening
      if (appVMin - seg.minV > 0.18) {
        nextSegments.push({ minV: seg.minV, maxV: appVMin, hasRake: seg.hasRake, splitAssetId: app.assetId });
      }
      // Above opening (inherits sloped valley raking flag when cut along diagonal dormer valleys)
      if (seg.maxV - appVMax > 0.18) {
        nextSegments.push({
          minV: appVMax,
          maxV: seg.maxV,
          hasRake: seg.hasRake || appHasSlope,
          splitAssetId: app.assetId
        });
      }
    });
    segments = nextSegments;
  });

  return segments.map((s) => [s.minV, s.maxV, s.hasRake, s.splitAssetId]);
}

const PARENT_PALETTE = [
  '#3b82f6', // Bright Blue
  '#22c55e', // Emerald
  '#f97316', // Orange
  '#a855f7', // Purple
  '#06b6d4', // Cyan
  '#eab308', // Yellow
  '#ec4899', // Pink
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#f43f5e'  // Rose
];

// ---------------------------------------------------------------------------
// 6. ROOF FLASHING TRUE SLOPE GEOMETRY & ASSIGNABLE LINES
// ---------------------------------------------------------------------------

function getPlaneElevationAtPoint(
  pt: Point2D,
  plane: RoofPlane,
  outline?: RoofOutline
): number {
  const eaveEdge = outline?.edges.find((e) => e.id === plane.eaveEdgeId);
  const pA = eaveEdge?.from || plane.planPolygon[0] || { x: 0, y: 0 };
  const pB = eaveEdge?.to || plane.planPolygon[1] || pA;
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const len = Math.hypot(dx, dy) || 1;
  const uVec = { x: dx / len, y: dy / len };
  const vVec = { x: -uVec.y, y: uVec.x };

  const cx =
    plane.planPolygon.length > 0
      ? plane.planPolygon.reduce((a, b) => a + b.x, 0) / plane.planPolygon.length
      : pA.x;
  const cy =
    plane.planPolygon.length > 0
      ? plane.planPolygon.reduce((a, b) => a + b.y, 0) / plane.planPolygon.length
      : pA.y;
  const dot = (cx - pA.x) * vVec.x + (cy - pA.y) * vVec.y;
  const vInward = plane.runDirection || (dot >= 0 ? vVec : { x: -vVec.x, y: -vVec.y });

  const vDist = Math.max(0, (pt.x - pA.x) * vInward.x + (pt.y - pA.y) * vInward.y);
  const baseH = plane.eaveHeightM ?? 2.7;
  const tanPitch = Math.tan(((plane.pitchDeg || 22.5) * Math.PI) / 180);
  return baseH + vDist * tanPitch;
}

export function getPointElevationFromPlanes(
  pt: Point2D,
  planes: RoofPlane[],
  outline?: RoofOutline
): { z: number; matchedPlaneIds: string[]; pitchesDeg: number[] } {
  const matching: RoofPlane[] = [];

  planes.forEach((plane) => {
    if (plane.planPolygon.length < 3) return;
    const onVertexOrEdge = plane.planPolygon.some((v, idx) => {
      const next = plane.planPolygon[(idx + 1) % plane.planPolygon.length];
      return pointsClose(pt, v, 0.28) || distToSegment(pt, v, next) < 0.25;
    });
    if (onVertexOrEdge || isPointInPolygon(pt, plane.planPolygon)) {
      matching.push(plane);
    }
  });

  if (matching.length === 0) {
    return { z: 2.7, matchedPlaneIds: [], pitchesDeg: [] };
  }

  const zs = matching.map((p) => getPlaneElevationAtPoint(pt, p, outline));
  const avgZ = zs.reduce((acc, val) => acc + val, 0) / zs.length;
  return {
    z: +avgZ.toFixed(3),
    matchedPlaneIds: matching.map((p) => p.id),
    pitchesDeg: matching.map((p) => p.pitchDeg)
  };
}

export function computeRoofLineTrueLengthM(
  flashingKind: RoofLineFlashingKind,
  from: Point2D,
  to: Point2D,
  planes: RoofPlane[],
  outline?: RoofOutline,
  skeleton?: SkeletonLine[]
): {
  planLengthM: number;
  trueSlopeLengthM: number;
  associatedPlaneIds: string[];
  pitchesDeg: number[];
} {
  const planLengthM = +dist(from, to).toFixed(2);
  if (planes.length === 0) {
    return {
      planLengthM,
      trueSlopeLengthM: planLengthM,
      associatedPlaneIds: [],
      pitchesDeg: []
    };
  }

  // Horizontal runs (eave drip edges & apron pitch breaks) match plan length
  if (flashingKind === 'eave' || flashingKind === 'apron') {
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const midInfo = getPointElevationFromPlanes(mid, planes, outline);
    return {
      planLengthM,
      trueSlopeLengthM: planLengthM,
      associatedPlaneIds: midInfo.matchedPlaneIds,
      pitchesDeg: midInfo.pitchesDeg
    };
  }

  // For a gable verge ('barge'), a ridge apex may land partway along the edge (e.g. classic duo-pitch gable).
  // Split at any interior ridge endpoints lying on this segment so the raking barge goes up one slope and down the other.
  const wayPoints: Point2D[] = [{ ...from }];
  if (flashingKind === 'barge' && skeleton && skeleton.length > 0) {
    const ridges = skeleton.filter((s) => s.suggestedType === 'ridge');
    const dirLen = dist(from, to) || 1;
    const ux = (to.x - from.x) / dirLen;
    const uy = (to.y - from.y) / dirLen;
    const interiorPoints: Array<{ t: number; pt: Point2D }> = [];

    ridges.forEach((r) => {
      [r.from, r.to].forEach((ep) => {
        if (
          distToSegment(ep, from, to) < 0.25 &&
          dist(ep, from) > 0.2 &&
          dist(ep, to) > 0.2
        ) {
          const t = (ep.x - from.x) * ux + (ep.y - from.y) * uy;
          if (!interiorPoints.some((existing) => Math.abs(existing.t - t) < 0.25)) {
            interiorPoints.push({ t, pt: ep });
          }
        }
      });
    });

    interiorPoints.sort((a, b) => a.t - b.t);
    interiorPoints.forEach((ip) => wayPoints.push(ip.pt));
  }
  wayPoints.push({ ...to });

  let total3d = 0;
  const planeIdsSet = new Set<string>();
  const pitchSet = new Set<number>();

  for (let i = 0; i < wayPoints.length - 1; i++) {
    const a = wayPoints[i];
    const b = wayPoints[i + 1];
    const infoA = getPointElevationFromPlanes(a, planes, outline);
    const infoB = getPointElevationFromPlanes(b, planes, outline);
    const segMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const infoMid = getPointElevationFromPlanes(segMid, planes, outline);

    infoMid.matchedPlaneIds.forEach((id) => planeIdsSet.add(id));
    infoMid.pitchesDeg.forEach((p) => pitchSet.add(p));

    const segPlan = dist(a, b);
    const dz = infoB.z - infoA.z;
    total3d += Math.hypot(segPlan, dz);
  }

  return {
    planLengthM,
    trueSlopeLengthM: +Math.max(planLengthM, total3d).toFixed(2),
    associatedPlaneIds: Array.from(planeIdsSet),
    pitchesDeg: Array.from(pitchSet)
  };
}

export function computeFlashingPieceBreakdown(
  trueSlopeLengthM: number,
  flashingKind: RoofLineFlashingKind,
  preferredMaxStickM: number = 4.0
): {
  lapAllowanceM: number;
  totalOrderLengthM: number;
  recommendedPieceLengthM: number;
  recommendedQuantity: number;
} {
  const cleanLen = Math.max(0.2, trueSlopeLengthM);
  const maxStick = flashingKind === 'ridge' || flashingKind === 'hip' ? Math.max(preferredMaxStickM, 4.0) : preferredMaxStickM;
  const rawCount = Math.max(1, Math.ceil(cleanLen / maxStick));
  const lapAllowanceM = +((rawCount - 1) * 0.15).toFixed(2);
  const totalWithLap = cleanLen + lapAllowanceM;

  // Pick a practical stick length that cleanly covers totalWithLap across rawCount pieces
  const rawStickNeeded = totalWithLap / rawCount;
  const recommendedPieceLengthM = +Math.max(1.0, Math.ceil(rawStickNeeded * 10) / 10).toFixed(2);
  const totalOrderLengthM = +(rawCount * recommendedPieceLengthM).toFixed(2);

  return {
    lapAllowanceM,
    totalOrderLengthM,
    recommendedPieceLengthM,
    recommendedQuantity: rawCount
  };
}

function getEdgeCompassLabel(from: Point2D, to: Point2D, index: number): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? `Top/North Edge ${index + 1}` : `Bottom/South Edge ${index + 1}`;
  }
  return dy >= 0 ? `Right/East Edge ${index + 1}` : `Left/West Edge ${index + 1}`;
}

export function getAssignableRoofLines(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  planes: RoofPlane[],
  assets: RoofAsset[] = [],
  pitchBreaks: PitchBreakLine[] = []
): AssignableRoofLine[] {
  const lines: AssignableRoofLine[] = [];

  // 1. Perimeter edges: Gable Verges -> 'barge', Abutment Walls -> 'apron', Eaves -> 'eave'
  outline.edges.forEach((edge, idx) => {
    const isBarge = edge.type === 'verge';
    const isWall = edge.type === 'wall';
    const flashingKind: RoofLineFlashingKind = isWall ? 'apron' : isBarge ? 'barge' : 'eave';
    const matchedPlane = planes.find((p) => p.eaveEdgeId === edge.id);
    const levelPrefix = matchedPlane?.levelCode ? `[${matchedPlane.levelCode}] ` : '';
    const baseName = isWall
      ? `${levelPrefix}Abutment Wall Apron #${idx + 1}`
      : isBarge
      ? `${levelPrefix}Gable Barge #${idx + 1}`
      : matchedPlane
      ? `${matchedPlane.code} Eave (${matchedPlane.name})`
      : getEdgeCompassLabel(edge.from, edge.to, idx);

    const slopeInfo = computeRoofLineTrueLengthM(
      flashingKind,
      edge.from,
      edge.to,
      planes,
      outline,
      skeleton
    );
    const pieceInfo = computeFlashingPieceBreakdown(slopeInfo.trueSlopeLengthM, flashingKind);

    lines.push({
      lineId: edge.id,
      sourceType: 'outline_edge',
      flashingKind,
      label: baseName,
      from: edge.from,
      to: edge.to,
      midPoint: {
        x: +((edge.from.x + edge.to.x) / 2).toFixed(3),
        y: +((edge.from.y + edge.to.y) / 2).toFixed(3)
      },
      planLengthM: slopeInfo.planLengthM,
      trueSlopeLengthM: slopeInfo.trueSlopeLengthM,
      lapAllowanceM: pieceInfo.lapAllowanceM,
      totalOrderLengthM: pieceInfo.totalOrderLengthM,
      recommendedPieceLengthM: pieceInfo.recommendedPieceLengthM,
      recommendedQuantity: pieceInfo.recommendedQuantity,
      associatedPlaneIds:
        matchedPlane && !slopeInfo.associatedPlaneIds.includes(matchedPlane.id)
          ? [matchedPlane.id, ...slopeInfo.associatedPlaneIds]
          : slopeInfo.associatedPlaneIds,
      pitchesDeg:
        matchedPlane && slopeInfo.pitchesDeg.length === 0
          ? [matchedPlane.pitchDeg]
          : slopeInfo.pitchesDeg,
      eaveHeightM: edge.eaveHeightM ?? matchedPlane?.eaveHeightM,
      levelId: edge.levelId ?? matchedPlane?.levelId ?? outline.levelId,
      suggestedCategory: isWall ? 'Apron & Abutment' : 'Barge & Edge'
    });
  });

  // 2. Internal Skeleton Lines: Ridges, Hips, Valleys
  const counts = { ridge: 0, hip: 0, valley: 0 };
  skeleton.forEach((skel) => {
    counts[skel.suggestedType] += 1;
    const flashingKind: RoofLineFlashingKind = skel.suggestedType;
    const typeLabel =
      skel.suggestedType === 'ridge'
        ? `Ridge #${counts.ridge}`
        : skel.suggestedType === 'valley'
        ? `Valley #${counts.valley}`
        : `Hip #${counts.hip}`;

    const slopeInfo = computeRoofLineTrueLengthM(
      flashingKind,
      skel.from,
      skel.to,
      planes,
      outline,
      skeleton
    );
    const pieceInfo = computeFlashingPieceBreakdown(slopeInfo.trueSlopeLengthM, flashingKind);

    lines.push({
      lineId: skel.id,
      sourceType: 'skeleton_line',
      flashingKind,
      label: typeLabel,
      from: skel.from,
      to: skel.to,
      midPoint: {
        x: +((skel.from.x + skel.to.x) / 2).toFixed(3),
        y: +((skel.from.y + skel.to.y) / 2).toFixed(3)
      },
      planLengthM: slopeInfo.planLengthM,
      trueSlopeLengthM: slopeInfo.trueSlopeLengthM,
      lapAllowanceM: pieceInfo.lapAllowanceM,
      totalOrderLengthM: pieceInfo.totalOrderLengthM,
      recommendedPieceLengthM: pieceInfo.recommendedPieceLengthM,
      recommendedQuantity: pieceInfo.recommendedQuantity,
      associatedPlaneIds: slopeInfo.associatedPlaneIds,
      pitchesDeg: slopeInfo.pitchesDeg,
      suggestedCategory: skel.suggestedType === 'valley' ? 'Valley & Gutter' : 'Ridge & Hip'
    });
  });

  // 3. Pitch Break Apron Lines
  pitchBreaks.forEach((pb, idx) => {
    const hostPlane = planes.find((p) => p.id === pb.planeId);
    if (!hostPlane || hostPlane.planPolygon.length < 3) return;
    const p0 = hostPlane.planPolygon[0];
    const p1 = hostPlane.planPolygon[1] || p0;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const eLen = Math.hypot(dx, dy) || 1;
    const uVec = { x: dx / eLen, y: dy / eLen };
    const vInward = hostPlane.runDirection || { x: -uVec.y, y: uVec.x };

    const hits: { u: number; pt: Point2D }[] = [];
    for (let i = 0; i < hostPlane.planPolygon.length; i++) {
      const a = hostPlane.planPolygon[i];
      const b = hostPlane.planPolygon[(i + 1) % hostPlane.planPolygon.length];
      const va = (a.x - p0.x) * vInward.x + (a.y - p0.y) * vInward.y;
      const vb = (b.x - p0.x) * vInward.x + (b.y - p0.y) * vInward.y;
      if (
        (va <= pb.splitPlanDistM && vb >= pb.splitPlanDistM) ||
        (va >= pb.splitPlanDistM && vb <= pb.splitPlanDistM)
      ) {
        const denom = vb - va;
        if (Math.abs(denom) > 1e-5) {
          const t = (pb.splitPlanDistM - va) / denom;
          const pt = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
          const u = (pt.x - p0.x) * uVec.x + (pt.y - p0.y) * uVec.y;
          hits.push({ u, pt });
        }
      }
    }
    hits.sort((a, b) => a.u - b.u);

    const b1 =
      hits.length >= 2
        ? hits[0].pt
        : { x: p0.x + vInward.x * pb.splitPlanDistM, y: p0.y + vInward.y * pb.splitPlanDistM };
    const b2 =
      hits.length >= 2
        ? hits[hits.length - 1].pt
        : { x: p1.x + vInward.x * pb.splitPlanDistM, y: p1.y + vInward.y * pb.splitPlanDistM };
    const planLengthM = +dist(b1, b2).toFixed(2);
    const pieceInfo = computeFlashingPieceBreakdown(planLengthM, 'apron');

    lines.push({
      lineId: pb.id,
      sourceType: 'pitch_break',
      flashingKind: 'apron',
      label: `Pitch Break Apron #${idx + 1} (${hostPlane.code})`,
      from: b1,
      to: b2,
      midPoint: {
        x: +((b1.x + b2.x) / 2).toFixed(3),
        y: +((b1.y + b2.y) / 2).toFixed(3)
      },
      planLengthM,
      trueSlopeLengthM: planLengthM,
      lapAllowanceM: pieceInfo.lapAllowanceM,
      totalOrderLengthM: pieceInfo.totalOrderLengthM,
      recommendedPieceLengthM: pieceInfo.recommendedPieceLengthM,
      recommendedQuantity: pieceInfo.recommendedQuantity,
      associatedPlaneIds: [hostPlane.id],
      pitchesDeg: [pb.lowerPitchDeg, hostPlane.pitchDeg],
      suggestedCategory: 'Apron & Abutment'
    });
  });

  // 4. Roof Assets (Skylights, Chimneys, Dormers) back-tray / barge / valley aprons
  assets.forEach((asset, idx) => {
    const hostPlane = planes.find((p) => p.id === asset.planeId);
    if (!hostPlane) return;
    if (asset.type === 'gable_dormer') {
      const geom = computeGableDormerGeometry(hostPlane, asset);
      if (geom) {
        const valleyLen = +Math.hypot(dist(geom.pCheekL, geom.pRidgeTie), geom.ridgeHeightM - geom.sideEaveHeightM).toFixed(2);
        const valleyPieces = computeFlashingPieceBreakdown(valleyLen * 2, 'dormer_valley');
        lines.push({
          lineId: `${asset.id}-valleys`,
          sourceType: 'asset_edge',
          flashingKind: 'dormer_valley',
          label: `${asset.label || `Gable Dormer #${idx + 1}`} Twin Valleys`,
          from: geom.pCheekL,
          to: geom.pRidgeTie,
          midPoint: geom.pRidgeTie,
          planLengthM: +(dist(geom.pCheekL, geom.pRidgeTie) * 2).toFixed(2),
          trueSlopeLengthM: +(valleyLen * 2).toFixed(2),
          lapAllowanceM: valleyPieces.lapAllowanceM,
          totalOrderLengthM: valleyPieces.totalOrderLengthM,
          recommendedPieceLengthM: valleyPieces.recommendedPieceLengthM,
          recommendedQuantity: valleyPieces.recommendedQuantity,
          associatedPlaneIds: [hostPlane.id],
          pitchesDeg: [geom.dormerPitchDeg, geom.hostPitchDeg],
          suggestedCategory: 'Valley & Gutter'
        });

        const bargeLeg = +Math.hypot(dist(geom.pFL, geom.pFMid), geom.ridgeHeightM - geom.sideEaveHeightM).toFixed(2);
        const bargePieces = computeFlashingPieceBreakdown(bargeLeg * 2, 'dormer_barge');
        lines.push({
          lineId: `${asset.id}-barge`,
          sourceType: 'asset_edge',
          flashingKind: 'dormer_barge',
          label: `${asset.label || `Gable Dormer #${idx + 1}`} Front Barges`,
          from: geom.pFL,
          to: geom.pFR,
          midPoint: geom.pFMid,
          planLengthM: +dist(geom.pFL, geom.pFR).toFixed(2),
          trueSlopeLengthM: +(bargeLeg * 2).toFixed(2),
          lapAllowanceM: bargePieces.lapAllowanceM,
          totalOrderLengthM: bargePieces.totalOrderLengthM,
          recommendedPieceLengthM: bargePieces.recommendedPieceLengthM,
          recommendedQuantity: bargePieces.recommendedQuantity,
          associatedPlaneIds: [hostPlane.id],
          pitchesDeg: [geom.dormerPitchDeg],
          suggestedCategory: 'Barge & Edge'
        });
      }
    } else if (asset.type === 'skylight' || asset.type === 'chimney') {
      const perimLen = +(2 * (asset.widthM + asset.depthM)).toFixed(2);
      const pieces = computeFlashingPieceBreakdown(perimLen, 'dormer_apron');
      lines.push({
        lineId: `${asset.id}-kit`,
        sourceType: 'asset_edge',
        flashingKind: 'dormer_apron',
        label: `${asset.label || asset.type} Perimeter Kit`,
        from: asset.center,
        to: asset.center,
        midPoint: asset.center,
        planLengthM: perimLen,
        trueSlopeLengthM: perimLen,
        lapAllowanceM: pieces.lapAllowanceM,
        totalOrderLengthM: pieces.totalOrderLengthM,
        recommendedPieceLengthM: pieces.recommendedPieceLengthM,
        recommendedQuantity: pieces.recommendedQuantity,
        associatedPlaneIds: [hostPlane.id],
        pitchesDeg: [hostPlane.pitchDeg],
        suggestedCategory: 'Window & Penetration'
      });
    }
  });

  return lines;
}

// ---------------------------------------------------------------------------
// 7. MULTI-LEVEL / TERRACED ROOF BUILDERS & WALL Z-RELATIONSHIP HELPERS
// ---------------------------------------------------------------------------

export function createRoofLevel(
  index: number,
  name: string,
  eaveHeightM: number,
  points: Point2D[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 5 }
  ],
  edgeTypes?: EdgeType[],
  options?: { autoGenerateSkeleton?: boolean; initialEdgeType?: EdgeType }
): RoofLevel {
  const levelId = `level-${index}`;
  const code = `L${index}`;
  const idPrefix = index === 1 ? undefined : `l${index}`;
  const rawOutline = buildOutlineFromPoints(points, `outline-${levelId}`, {
    levelId,
    idPrefix,
    defaultEaveHeightM: eaveHeightM,
    initialEdgeType: options?.initialEdgeType
  });

  const outline: RoofOutline = edgeTypes
    ? {
        ...rawOutline,
        edges: rawOutline.edges.map((e, idx) => ({
          ...e,
          type: edgeTypes[idx] || e.type
        }))
      }
    : rawOutline;

  const skeleton =
    options?.autoGenerateSkeleton === false ? [] : generateSkeletonLines(outline);
  return {
    id: levelId,
    code,
    name,
    eaveHeightM: +eaveHeightM.toFixed(2),
    outline,
    skeleton
  };
}

export function syncMultiLevelPlanes(
  levels: RoofLevel[],
  existingPlanes: RoofPlane[],
  defaultPitchDeg = 22.5
): RoofPlane[] {
  const allPlanes: RoofPlane[] = [];
  let paletteOffset = 0;

  levels.forEach((lvl) => {
    const levelPlanes = syncPlanesWithOutlineAndSkeleton(
      lvl.outline,
      lvl.skeleton,
      existingPlanes,
      defaultPitchDeg,
      {
        levelId: lvl.id,
        levelCode: lvl.code,
        levelName: lvl.name,
        defaultEaveHeightM: lvl.eaveHeightM,
        paletteOffset
      }
    );
    paletteOffset += levelPlanes.length;
    allPlanes.push(...levelPlanes);
  });

  return allPlanes;
}

export function getMultiLevelPreset(
  preset: RoofOutlinePresetKey,
  defaultPitchDeg = 22.5
): { levels: RoofLevel[]; planes: RoofPlane[] } {
  let levels: RoofLevel[] = [];

  if (preset === 'two_storey_split') {
    // 2-Storey Split: Lower skillion verandah/garage apron @ Z=2.7m against upper wall + Upper 2F Hipped Roof @ Z=5.4m
    const lowerLevel = createRoofLevel(
      1,
      'Lower Roof (1F)',
      2.7,
      [
        { x: 0, y: 5.5 },
        { x: 14, y: 5.5 },
        { x: 14, y: 10 },
        { x: 0, y: 10 }
      ],
      ['wall', 'verge', 'outline', 'verge']
    );
    const upperLevel = createRoofLevel(
      2,
      'Upper Storey (2F)',
      5.4,
      [
        { x: 0, y: 0 },
        { x: 14, y: 0 },
        { x: 14, y: 6.2 },
        { x: 0, y: 6.2 }
      ],
      ['outline', 'outline', 'outline', 'outline']
    );
    levels = [lowerLevel, upperLevel];
  } else if (preset === 'cascading_terrace') {
    // Cascading 3-Tier Terraced Roofs stepping up in Z (2.7m -> 4.1m -> 5.5m)
    const tier1 = createRoofLevel(
      1,
      'Lower Terrace',
      2.7,
      [
        { x: 0, y: 8 },
        { x: 14, y: 8 },
        { x: 14, y: 12 },
        { x: 0, y: 12 }
      ],
      ['wall', 'verge', 'outline', 'verge']
    );
    const tier2 = createRoofLevel(
      2,
      'Mid Terrace',
      4.1,
      [
        { x: 0, y: 4 },
        { x: 14, y: 4 },
        { x: 14, y: 8 },
        { x: 0, y: 8 }
      ],
      ['wall', 'verge', 'outline', 'verge']
    );
    const tier3 = createRoofLevel(
      3,
      'Upper Terrace',
      5.5,
      [
        { x: 0, y: 0 },
        { x: 14, y: 0 },
        { x: 14, y: 4 },
        { x: 0, y: 4 }
      ],
      ['wall', 'verge', 'outline', 'verge']
    );
    levels = [tier1, tier2, tier3];
  } else {
    const outline = getPresetOutline(preset);
    const skeleton = generateSkeletonLines(outline);
    levels = [
      {
        id: 'level-1',
        code: 'L1',
        name: 'Main Roof',
        eaveHeightM: 2.7,
        outline: { ...outline, levelId: 'level-1' },
        skeleton: skeleton.map((s) => ({ ...s, levelId: 'level-1' }))
      }
    ];
  }

  const planes = syncMultiLevelPlanes(levels, [], defaultPitchDeg);
  return { levels, planes };
}

export function getAssignableRoofLinesMultiLevel(
  levels: RoofLevel[],
  planes: RoofPlane[],
  assets: RoofAsset[] = [],
  pitchBreaks: PitchBreakLine[] = []
): AssignableRoofLine[] {
  const allLines: AssignableRoofLine[] = [];
  const emittedAssetLineIds = new Set<string>();

  levels.forEach((lvl) => {
    const levelPlanes = planes.filter((p) => (p.levelId || 'level-1') === lvl.id);
    const levelPlaneIds = new Set(levelPlanes.map((p) => p.id));
    const levelAssets = assets.filter((a) => levelPlaneIds.has(a.planeId));
    const levelBreaks = pitchBreaks.filter((pb) => levelPlaneIds.has(pb.planeId));

    const lines = getAssignableRoofLines(
      lvl.outline,
      lvl.skeleton,
      levelPlanes,
      levelAssets,
      levelBreaks
    );

    lines.forEach((l) => {
      if (!emittedAssetLineIds.has(l.lineId)) {
        emittedAssetLineIds.add(l.lineId);
        allLines.push({
          ...l,
          levelId: l.levelId ?? lvl.id,
          eaveHeightM: l.eaveHeightM ?? lvl.eaveHeightM
        });
      }
    });
  });

  return allLines;
}

export function getDefaultEdgeSetbackM(edge: PlanEdge): number {
  if (typeof edge.eaveSetbackM === 'number' && Number.isFinite(edge.eaveSetbackM)) {
    return +Math.max(0, Math.min(3.0, edge.eaveSetbackM)).toFixed(3);
  }
  return 0;
}

export function isEdgeWallEnabled(edge: PlanEdge): boolean {
  if (edge.hasWall === true) return true;
  if (edge.hasWall === false) return false;
  return edge.type === 'outline' || edge.type === 'verge' || edge.type === 'wall';
}

function getEdgeInwardNormal(edge: PlanEdge, outlinePoints: Point2D[]): Point2D {
  const dx = edge.to.x - edge.from.x;
  const dy = edge.to.y - edge.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const leftN = { x: -dy / len, y: dx / len };
  const mid = { x: (edge.from.x + edge.to.x) / 2, y: (edge.from.y + edge.to.y) / 2 };
  if (
    outlinePoints.length >= 3 &&
    isPointInPolygon({ x: mid.x + leftN.x * 0.05, y: mid.y + leftN.y * 0.05 }, outlinePoints)
  ) {
    return leftN;
  }
  return { x: -leftN.x, y: -leftN.y };
}

export function computeEdgeSetbackLine(
  outline: RoofOutline,
  edgeId: string,
  overrideSetbackM?: number
): { wallFrom: Point2D; wallTo: Point2D; eaveSetbackM: number; inwardNormal: Point2D } | null {
  const edges = outline.edges;
  const edge = edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  const setbackM =
    overrideSetbackM !== undefined
      ? +Math.max(0, Math.min(3.0, overrideSetbackM)).toFixed(3)
      : getDefaultEdgeSetbackM(edge);
  const inwardNormal = getEdgeInwardNormal(edge, outline.points);

  if (setbackM <= 0.005 || edges.length < 3) {
    return {
      wallFrom: { ...edge.from },
      wallTo: { ...edge.to },
      eaveSetbackM: setbackM,
      inwardNormal
    };
  }

  const shiftedCurA = {
    x: edge.from.x + inwardNormal.x * setbackM,
    y: edge.from.y + inwardNormal.y * setbackM
  };
  const shiftedCurB = {
    x: edge.to.x + inwardNormal.x * setbackM,
    y: edge.to.y + inwardNormal.y * setbackM
  };

  const resolveCornerOffset = (cornerPt: Point2D, fallbackPt: Point2D): Point2D => {
    const adjEdge = edges.find(
      (oe) =>
        oe.id !== edge.id &&
        (pointsClose(oe.from, cornerPt, 0.08) || pointsClose(oe.to, cornerPt, 0.08))
    );
    if (!adjEdge) return fallbackPt;

    const adjSetback = isEdgeWallEnabled(adjEdge) ? getDefaultEdgeSetbackM(adjEdge) : 0;
    const adjInward = getEdgeInwardNormal(adjEdge, outline.points);
    const adjShiftedA = {
      x: adjEdge.from.x + adjInward.x * adjSetback,
      y: adjEdge.from.y + adjInward.y * adjSetback
    };
    const adjShiftedB = {
      x: adjEdge.to.x + adjInward.x * adjSetback,
      y: adjEdge.to.y + adjInward.y * adjSetback
    };

    const inter = lineLineIntersection(shiftedCurA, shiftedCurB, adjShiftedA, adjShiftedB);
    const maxMiter = Math.max(setbackM, adjSetback) * 2.5 + 0.35;
    if (inter && dist(inter, cornerPt) <= maxMiter) {
      return { x: +inter.x.toFixed(3), y: +inter.y.toFixed(3) };
    }
    return { x: +fallbackPt.x.toFixed(3), y: +fallbackPt.y.toFixed(3) };
  };

  return {
    wallFrom: resolveCornerOffset(edge.from, shiftedCurA),
    wallTo: resolveCornerOffset(edge.to, shiftedCurB),
    eaveSetbackM: setbackM,
    inwardNormal
  };
}

export function deriveRoofWallSegments(
  levels: RoofLevel[],
  planes: RoofPlane[]
): RoofWallSegment[] {
  const walls: RoofWallSegment[] = [];

  levels.forEach((lvl) => {
    const levelPlanes = planes.filter((p) => (p.levelId || 'level-1') === lvl.id);
    const lowerPlanes = planes.filter(
      (p) => (p.levelId || 'level-1') !== lvl.id && (p.eaveHeightM ?? 2.7) < lvl.eaveHeightM - 0.1
    );

    lvl.outline.edges.forEach((edge) => {
      if (!isEdgeWallEnabled(edge)) return;

      const setbackInfo = computeEdgeSetbackLine(lvl.outline, edge.id);
      const wallFrom = setbackInfo?.wallFrom || edge.from;
      const wallTo = setbackInfo?.wallTo || edge.to;
      const eaveSetbackM = setbackInfo?.eaveSetbackM ?? 0;
      const inwardNormal = setbackInfo?.inwardNormal || getEdgeInwardNormal(edge, lvl.outline.points);

      const lengthM = +dist(wallFrom, wallTo).toFixed(2);
      if (lengthM <= 0.05) return;

      const ux = (wallTo.x - wallFrom.x) / lengthM;
      const uy = (wallTo.y - wallFrom.y) / lengthM;
      const mid = { x: (wallFrom.x + wallTo.x) / 2, y: (wallFrom.y + wallTo.y) / 2 };

      // Collect sample parameters t along [wallFrom -> wallTo] at skeleton peaks/hips/valleys & facet corners
      // so the wall top traces strictly underneath all intersecting sloped roof planes.
      const tSamples: number[] = [0, 1];
      lvl.skeleton.forEach((s) => {
        const inter = lineLineIntersection(wallFrom, wallTo, s.from, s.to);
        if (inter && distToSegment(inter, s.from, s.to) < 0.18) {
          const t = ((inter.x - wallFrom.x) * ux + (inter.y - wallFrom.y) * uy) / lengthM;
          if (t > 0.01 && t < 0.99) tSamples.push(t);
        }
        [s.from, s.to].forEach((pt) => {
          if (distToSegment(pt, wallFrom, wallTo) < 0.22) {
            const t = ((pt.x - wallFrom.x) * ux + (pt.y - wallFrom.y) * uy) / lengthM;
            if (t > 0.01 && t < 0.99) tSamples.push(t);
          }
        });
      });

      levelPlanes.forEach((pl) => {
        pl.planPolygon.forEach((pt) => {
          if (distToSegment(pt, wallFrom, wallTo) < 0.22) {
            const t = ((pt.x - wallFrom.x) * ux + (pt.y - wallFrom.y) * uy) / lengthM;
            if (t > 0.01 && t < 0.99) tSamples.push(t);
          }
        });
      });

      tSamples.sort((a, b) => a - b);
      const dedupT: number[] = [];
      tSamples.forEach((t) => {
        if (dedupT.length === 0 || Math.abs(t - dedupT[dedupT.length - 1]) > 0.015) {
          dedupT.push(t);
        }
      });

      const matchedPlane = levelPlanes.find((p) => p.eaveEdgeId === edge.id);
      const fallbackZ = edge.eaveHeightM ?? matchedPlane?.eaveHeightM ?? lvl.eaveHeightM ?? 2.7;

      // Evaluate exact overlying roof Z directly above each sample point along [wallFrom -> wallTo].
      // A wall ALWAYS sits strictly below/flush with the roof plane — never extends above it.
      const evalRoofZAtWallPoint = (pt: Point2D, t: number): number => {
        if (levelPlanes.length === 0) return fallbackZ;
        // Nudge imperceptibly inward along normal and toward segment center at endpoints so polygon test hits exact facet
        const nudgeIn = eaveSetbackM < 0.05 ? 0.03 : 0.01;
        const tNudge = t < 0.02 ? 0.02 : t > 0.98 ? -0.02 : 0;
        const evalPt = {
          x: pt.x + inwardNormal.x * nudgeIn + ux * tNudge,
          y: pt.y + inwardNormal.y * nudgeIn + uy * tNudge
        };

        const strictContaining = levelPlanes.filter((pl) =>
          pl.planPolygon.length >= 3 && isPointInPolygon(evalPt, pl.planPolygon)
        );
        if (strictContaining.length > 0) {
          const zs = strictContaining.map((pl) => getPlaneElevationAtPoint(pt, pl, lvl.outline));
          return +Math.min(...zs).toFixed(3);
        }

        const direct = getPointElevationFromPlanes(evalPt, levelPlanes, lvl.outline);
        if (direct.matchedPlaneIds.length > 0) {
          const zs = direct.matchedPlaneIds
            .map((id) => levelPlanes.find((pl) => pl.id === id))
            .filter((pl): pl is RoofPlane => Boolean(pl))
            .map((pl) => getPlaneElevationAtPoint(pt, pl, lvl.outline));
          return +Math.min(...zs).toFixed(3);
        }
        return fallbackZ;
      };

      const rawTopProfile: Point3D[] = dedupT.map((t) => {
        const pt = {
          x: +(wallFrom.x + ux * (t * lengthM)).toFixed(3),
          y: +(wallFrom.y + uy * (t * lengthM)).toFixed(3)
        };
        return {
          x: pt.x,
          y: pt.y,
          z: evalRoofZAtWallPoint(pt, t)
        };
      });

      const topZ =
        rawTopProfile.length > 0
          ? +Math.max(...rawTopProfile.map((p) => p.z)).toFixed(2)
          : +fallbackZ.toFixed(2);

      let bottomZ = typeof edge.wallBottomZ === 'number' ? +edge.wallBottomZ.toFixed(2) : 0;
      if (typeof edge.wallBottomZ !== 'number' && lowerPlanes.length > 0) {
        const below = getPointElevationFromPlanes(mid, lowerPlanes);
        if (below.matchedPlaneIds.length > 0 && below.z < topZ) {
          bottomZ = +below.z.toFixed(2);
        }
      }

      const topProfilePoints3D: Point3D[] = rawTopProfile.map((p) => ({
        ...p,
        z: +Math.max(bottomZ, p.z).toFixed(3)
      }));

      const wallKind: RoofWallSegment['wallKind'] =
        edge.type === 'wall'
          ? 'abutment_wall'
          : edge.type === 'verge'
          ? 'gable_end'
          : 'exterior_eave';

      walls.push({
        id: `wall-${lvl.id}-${edge.id}`,
        levelId: lvl.id,
        edgeId: edge.id,
        from: edge.from,
        to: edge.to,
        wallFrom,
        wallTo,
        eaveSetbackM: +eaveSetbackM.toFixed(2),
        lengthM,
        topZ,
        bottomZ,
        topProfilePoints3D,
        wallKind
      });
    });
  });

  return walls;
}

// ---------------------------------------------------------------------------
// 7. FREEHAND FIRST-LINE & 2-POINT ARCHITECTURAL PLAN SCALING ENGINE
// ---------------------------------------------------------------------------

export interface PlanViewportBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

/**
 * Parse a user-entered length string into metres.
 * Respects explicit unit ('m' | 'mm'), or auto-converts >= 100 values when in 'auto' mode.
 */
export function parseDistanceInputToMetres(
  rawInput: string | number,
  unit: 'm' | 'mm' | 'auto' = 'm'
): number | null {
  const cleaned =
    typeof rawInput === 'number'
      ? rawInput
      : parseFloat(String(rawInput).replace(/,/g, '').trim());
  if (!Number.isFinite(cleaned) || cleaned <= 0) return null;

  let metres = cleaned;
  if (unit === 'mm') {
    metres = cleaned / 1000;
  } else if (unit === 'auto' && cleaned >= 100) {
    metres = cleaned / 1000;
  }

  if (metres < 0.05 || metres > 2000) return null;
  return +metres.toFixed(4);
}

/**
 * Precision freehand drafting snap:
 * - Preserves 10mm (0.01m) coordinate resolution rather than coarse 0.5m grid truncation.
 * - Optional Ortho/45-deg directional snap when within +-6 degrees of 45-degree axes from prevPt.
 */
export function applyDraftPointSnap(
  rawPt: Point2D,
  anchorPt?: Point2D | null,
  options?: { orthoSnap?: boolean; angleToleranceDeg?: number; precisionStepM?: number }
): Point2D {
  const step = options?.precisionStepM ?? 0.01;
  const orthoSnap = options?.orthoSnap ?? true;
  const tolRad = ((options?.angleToleranceDeg ?? 6) * Math.PI) / 180;

  let x = rawPt.x;
  let y = rawPt.y;

  if (orthoSnap && anchorPt) {
    const dx = rawPt.x - anchorPt.x;
    const dy = rawPt.y - anchorPt.y;
    const r = Math.hypot(dx, dy);
    if (r > 0.02) {
      const angle = Math.atan2(dy, dx);
      const octant = Math.PI / 4; // 0, 45, 90, 135, 180...
      const nearestAxis = Math.round(angle / octant) * octant;
      if (Math.abs(angle - nearestAxis) <= tolRad) {
        const ux = Math.cos(nearestAxis);
        const uy = Math.sin(nearestAxis);
        const proj = dx * ux + dy * uy;
        x = anchorPt.x + proj * ux;
        y = anchorPt.y + proj * uy;
      }
    }
  }

  return {
    x: +(Math.round(x / step) * step).toFixed(3),
    y: +(Math.round(y / step) * step).toFixed(3)
  };
}

/**
 * Calibrates freehand drawing coordinates from the first drawn line (P0 -> P1).
 * Scales both the drafted points AND the locked viewport bounds around P0 so on-screen
 * vertices stay visually pinned at the user's exact tapped pixels while real-world scale locks in.
 */
export function calibrateDraftPointsFromFirstLine(
  draftPoints: Point2D[],
  actualFirstLineLengthM: number,
  currentBounds: PlanViewportBounds
): {
  scaledPoints: Point2D[];
  scaledBounds: PlanViewportBounds;
  scaleFactor: number;
  anchor: Point2D;
} | null {
  if (draftPoints.length < 2) return null;
  if (!Number.isFinite(actualFirstLineLengthM) || actualFirstLineLengthM < 0.05) return null;

  const p0 = draftPoints[0];
  const p1 = draftPoints[1];
  const rawDist = Math.hypot(p1.x - p0.x, p1.y - p0.y);

  let scaleFactor = 1;
  let scaledPoints: Point2D[];

  if (rawDist < 1e-5) {
    scaleFactor = 1;
    scaledPoints = draftPoints.map((p, idx) =>
      idx === 1 ? { x: +(p0.x + actualFirstLineLengthM).toFixed(3), y: +p0.y.toFixed(3) } : { ...p }
    );
  } else {
    scaleFactor = actualFirstLineLengthM / rawDist;
    scaledPoints = draftPoints.map((p, idx) => {
      if (idx === 0) return { x: +p0.x.toFixed(3), y: +p0.y.toFixed(3) };
      return {
        x: +(p0.x + (p.x - p0.x) * scaleFactor).toFixed(3),
        y: +(p0.y + (p.y - p0.y) * scaleFactor).toFixed(3)
      };
    });
  }

  const minX = +(p0.x + (currentBounds.minX - p0.x) * scaleFactor).toFixed(4);
  const maxX = +(p0.x + (currentBounds.maxX - p0.x) * scaleFactor).toFixed(4);
  const minY = +(p0.y + (currentBounds.minY - p0.y) * scaleFactor).toFixed(4);
  const maxY = +(p0.y + (currentBounds.maxY - p0.y) * scaleFactor).toFixed(4);

  return {
    scaledPoints,
    scaledBounds: {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(0.5, +(maxX - minX).toFixed(4)),
      height: Math.max(0.5, +(maxY - minY).toFixed(4))
    },
    scaleFactor,
    anchor: p0
  };
}

/**
 * Scales a plan underlay uniformly around an anchor point (e.g. when calibrating freehand over an unscaled backdrop).
 */
export function scalePlanUnderlayFromFactor(
  underlay: RoofPlanUnderlay,
  anchor: Point2D,
  scaleFactor: number
): RoofPlanUnderlay {
  const newWidth = +(underlay.worldWidthM * scaleFactor).toFixed(4);
  const newHeight = +(underlay.worldHeightM * scaleFactor).toFixed(4);
  const newWorldX = +(anchor.x + (underlay.worldX - anchor.x) * scaleFactor).toFixed(4);
  const newWorldY = +(anchor.y + (underlay.worldY - anchor.y) * scaleFactor).toFixed(4);
  return {
    ...underlay,
    worldX: newWorldX,
    worldY: newWorldY,
    worldWidthM: newWidth,
    worldHeightM: newHeight
  };
}

/**
 * Builds an initial uncalibrated RoofPlanUnderlay centered cleanly in positive coordinate space.
 */
export function createPlanUnderlaySpec(params: {
  id?: string;
  name: string;
  imageUrl: string;
  aspectRatio?: number;
  planId?: string;
  initialWidthM?: number;
}): RoofPlanUnderlay {
  const aspectRatio = params.aspectRatio && params.aspectRatio > 0.1 ? params.aspectRatio : 1.414;
  const worldWidthM = params.initialWidthM && params.initialWidthM > 1 ? params.initialWidthM : 28;
  const worldHeightM = +(worldWidthM / aspectRatio).toFixed(4);
  return {
    id: params.id || `underlay-${Date.now()}`,
    name: params.name,
    imageUrl: params.imageUrl,
    aspectRatio,
    worldX: 0,
    worldY: 0,
    worldWidthM,
    worldHeightM,
    isCalibrated: false,
    opacity: 0.72,
    visible: true,
    planId: params.planId
  };
}

/**
 * Converts a plan-world coordinate into normalized [0..1] architectural image coordinates.
 */
export function worldToPlanUnderlayNorm(underlay: RoofPlanUnderlay, pt: Point2D): Point2D {
  const nx = underlay.worldWidthM > 1e-5 ? (pt.x - underlay.worldX) / underlay.worldWidthM : 0.5;
  const ny = underlay.worldHeightM > 1e-5 ? (pt.y - underlay.worldY) / underlay.worldHeightM : 0.5;
  return {
    x: +Math.max(0, Math.min(1, nx)).toFixed(6),
    y: +Math.max(0, Math.min(1, ny)).toFixed(6)
  };
}

/**
 * Converts a normalized [0..1] architectural image coordinate back to plan-world metres.
 */
export function planUnderlayNormToWorld(underlay: RoofPlanUnderlay, normPt: Point2D): Point2D {
  return {
    x: +(underlay.worldX + normPt.x * underlay.worldWidthM).toFixed(4),
    y: +(underlay.worldY + normPt.y * underlay.worldHeightM).toFixed(4)
  };
}

/**
 * 2-Point Architectural Plan Calibration:
 * Given two normalized points P1, P2 on the plan image and their true real-world distance in metres,
 * calculates exact sheet dimensions in metres while keeping aspect ratio square and anchoring P1 (or resetting origin).
 */
export function calibratePlanUnderlayFromTwoPoints(
  underlay: RoofPlanUnderlay,
  p1Norm: Point2D,
  p2Norm: Point2D,
  knownDistanceM: number,
  options?: { resetOriginToZero?: boolean }
): {
  underlay: RoofPlanUnderlay;
  scaleFactor: number;
  p1World: Point2D;
  p2World: Point2D;
} | null {
  if (!Number.isFinite(knownDistanceM) || knownDistanceM < 0.05) return null;
  const aspect = underlay.aspectRatio > 0.05 ? underlay.aspectRatio : 1.414;
  const dxNorm = p2Norm.x - p1Norm.x;
  const dyNorm = (p2Norm.y - p1Norm.y) / aspect;
  const normSpan = Math.hypot(dxNorm, dyNorm);
  if (normSpan < 1e-5) return null;

  const worldWidthM = +(knownDistanceM / normSpan).toFixed(4);
  const worldHeightM = +(worldWidthM / aspect).toFixed(4);
  const scaleFactor = underlay.worldWidthM > 1e-5 ? worldWidthM / underlay.worldWidthM : 1;

  let worldX = 0;
  let worldY = 0;
  if (!options?.resetOriginToZero) {
    const oldP1X = underlay.worldX + p1Norm.x * underlay.worldWidthM;
    const oldP1Y = underlay.worldY + p1Norm.y * underlay.worldHeightM;
    worldX = +(oldP1X - p1Norm.x * worldWidthM).toFixed(4);
    worldY = +(oldP1Y - p1Norm.y * worldHeightM).toFixed(4);
  }

  const nextUnderlay: RoofPlanUnderlay = {
    ...underlay,
    worldX,
    worldY,
    worldWidthM,
    worldHeightM,
    isCalibrated: true,
    calibratedDistanceM: +knownDistanceM.toFixed(3),
    calibrationPtsNorm: [
      { x: +p1Norm.x.toFixed(6), y: +p1Norm.y.toFixed(6) },
      { x: +p2Norm.x.toFixed(6), y: +p2Norm.y.toFixed(6) }
    ],
    calibratedAt: new Date().toISOString(),
    visible: true
  };

  return {
    underlay: nextUnderlay,
    scaleFactor,
    p1World: planUnderlayNormToWorld(nextUnderlay, p1Norm),
    p2World: planUnderlayNormToWorld(nextUnderlay, p2Norm)
  };
}

/**
 * Uniformly scales an entire drawn roof outline by a calibration factor around an anchor point,
 * preserving all edge types, wall flags, eave setbacks, and eave heights.
 */
export function scaleOutlineUniformly(
  outline: RoofOutline,
  scaleFactor: number,
  anchor?: Point2D
): RoofOutline {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0 || Math.abs(scaleFactor - 1) < 1e-5) {
    return outline;
  }
  const ref = anchor || outline.points[0] || { x: 0, y: 0 };
  const scaledPoints = outline.points.map((p) => ({
    x: +(ref.x + (p.x - ref.x) * scaleFactor).toFixed(3),
    y: +(ref.y + (p.y - ref.y) * scaleFactor).toFixed(3)
  }));

  return {
    ...outline,
    points: scaledPoints,
    edges: outline.edges.map((e, i) => ({
      ...e,
      from: scaledPoints[i],
      to: scaledPoints[(i + 1) % scaledPoints.length]
    }))
  };
}

/**
 * Uniformly scales existing skeleton lines (manual or auto) around an anchor point
 * during 2-point outline rescaling without regenerating or wiping skeleton geometry.
 */
export function scaleSkeletonUniformly(
  skeleton: SkeletonLine[],
  scaleFactor: number,
  anchor?: Point2D
): SkeletonLine[] {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0 || Math.abs(scaleFactor - 1) < 1e-5) {
    return skeleton;
  }
  const ref = anchor || { x: 0, y: 0 };
  return skeleton.map((s) => ({
    ...s,
    from: {
      x: +(ref.x + (s.from.x - ref.x) * scaleFactor).toFixed(3),
      y: +(ref.y + (s.from.y - ref.y) * scaleFactor).toFixed(3)
    },
    to: {
      x: +(ref.x + (s.to.x - ref.x) * scaleFactor).toFixed(3),
      y: +(ref.y + (s.to.y - ref.y) * scaleFactor).toFixed(3)
    }
  }));
}




