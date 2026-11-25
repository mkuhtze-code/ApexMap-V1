import {
  Point2D,
  Point3D,
  EdgeType,
  SkeletonLineType,
  PlanEdge,
  RoofHoleRing,
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
  RoofPlanUnderlay,
  SheetOrderMode
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

export const MAX_ROOF_DOMAIN_VERTICES = 280;

export function getAllOutlineEdges(outline: RoofOutline): PlanEdge[] {
  return [...outline.edges, ...(outline.holes || []).flatMap((h) => h.edges)];
}

export function isPointInsideHoleInterior(pt: Point2D, hole: RoofHoleRing, borderTol = 0.04): boolean {
  if (hole.points.length < 3) return false;
  if (!isPointInPolygon(pt, hole.points)) return false;
  return !hole.edges.some((e) => distToSegment(pt, e.from, e.to) <= borderTol);
}

export function isPointInOutlineDomain(pt: Point2D, outline: RoofOutline): boolean {
  if (outline.points.length < 3 || !isPointInPolygon(pt, outline.points)) return false;
  if (!outline.holes || outline.holes.length === 0) return true;
  return !outline.holes.some((h) => isPointInsideHoleInterior(pt, h, 0.04));
}

export function getOutlineFootprintAreaM2(outline: RoofOutline): number {
  if (outline.points.length < 3) return 0;
  const outer = polygonArea(outline.points);
  const holesArea = (outline.holes || []).reduce(
    (s, h) => s + (h.points.length >= 3 ? polygonArea(h.points) : 0),
    0
  );
  return +Math.max(0, outer - holesArea).toFixed(3);
}

export function addCourtyardHoleToOutline(
  outline: RoofOutline,
  rawHolePoints: Point2D[],
  options?: {
    holeId?: string;
    name?: string;
    initialEdgeType?: EdgeType;
    eaveHeightM?: number;
    hasWall?: boolean;
  }
): RoofOutline {
  if (!rawHolePoints || rawHolePoints.length < 3 || outline.points.length < 3) return outline;
  // Clean duplicates
  const cleaned: Point2D[] = [];
  rawHolePoints.forEach((p) => {
    if (cleaned.length === 0 || dist(cleaned[cleaned.length - 1], p) > 0.05) {
      cleaned.push({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) });
    }
  });
  if (cleaned.length > 2 && dist(cleaned[0], cleaned[cleaned.length - 1]) <= 0.05) {
    cleaned.pop();
  }
  if (cleaned.length < 3 || polygonArea(cleaned) < 0.25) return outline;

  // Orient hole polygon clockwise (negative signed area) so outward roof domain lies to the left of each hole edge
  const cwPts = getSignedArea(cleaned) > 0 ? [...cleaned].reverse() : cleaned;
  const holeCentroid = polygonCentroid(cwPts);
  if (!isPointInPolygon(holeCentroid, outline.points)) return outline;

  const prefix = getLevelIdPrefixFromOutline(outline);
  const idPrefix = prefix ? `${prefix}__` : '';
  const holeIdx = (outline.holes?.length || 0) + 1;
  const holeId = options?.holeId || `${idPrefix}void-${holeIdx}-${Date.now().toString().slice(-4)}`;
  const edgeType: EdgeType = options?.initialEdgeType ?? 'outline';

  const edges: PlanEdge[] = cwPts.map((pt, idx) => {
    const next = cwPts[(idx + 1) % cwPts.length];
    return {
      id: `${holeId}-edge-${idx + 1}`,
      from: { ...pt },
      to: { ...next },
      type: edgeType,
      ...(options?.eaveHeightM !== undefined ? { eaveHeightM: options.eaveHeightM } : {}),
      ...(options?.hasWall !== undefined ? { hasWall: options.hasWall } : { hasWall: true }),
      ...(outline.levelId ? { levelId: outline.levelId } : {})
    };
  });

  const newHole: RoofHoleRing = {
    id: holeId,
    name: options?.name || `Courtyard Void ${holeIdx}`,
    points: cwPts,
    edges
  };

  return {
    ...outline,
    holes: [...(outline.holes || []), newHole]
  };
}

export function removeCourtyardHoleFromOutline(outline: RoofOutline, holeId: string): RoofOutline {
  if (!outline.holes || outline.holes.length === 0) return outline;
  const filtered = outline.holes.filter((h) => h.id !== holeId);
  return {
    ...outline,
    holes: filtered.length > 0 ? filtered : undefined
  };
}

export function canonicalPlanePolygonKey(poly: Point2D[]): string {
  if (!poly || poly.length < 3) return '';
  return [...poly]
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .sort()
    .join('|');
}

export const DEFAULT_MAX_AREA_INFLATION_RATIO = 1.45;

export function deduplicateRoofPlanes(planes: RoofPlane[]): RoofPlane[] {
  const seenIds = new Set<string>();
  const seenGeom = new Set<string>();
  const result: RoofPlane[] = [];
  for (const pl of planes) {
    if (seenIds.has(pl.id)) continue;
    const geomKey = !pl.isVirtualAssetPlane
      ? `${pl.levelId || 'level-1'}::${pl.pitchZoneRole || 'main'}::${canonicalPlanePolygonKey(pl.planPolygon)}`
      : `${pl.id}::virtual`;
    if (geomKey && seenGeom.has(geomKey)) continue;
    seenIds.add(pl.id);
    if (geomKey) seenGeom.add(geomKey);
    result.push(pl);
  }
  return result;
}

/**
 * Truthful modeled roof area (m²) = sum of non-virtual, deduplicated structural planes minus aperture openings.
 */
export function computeTruthfulRoofAreaM2(planes: RoofPlane[]): number {
  const clean = deduplicateRoofPlanes(planes).filter((p) => !p.isVirtualAssetPlane);
  return +clean
    .reduce((acc, p) => {
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
    }, 0)
    .toFixed(2);
}

/**
 * Projects a 2D point onto the infinite supporting line defined by [lineFrom, lineTo]
 * if within snapRadiusM (supports snapping mid-segment AND extending beyond either endpoint).
 */
export function snapPointToSupportingLine(
  pt: Point2D,
  lineFrom: Point2D,
  lineTo: Point2D,
  snapRadiusM = 0.45
): { pt: Point2D; snapped: boolean; perpDist: number } {
  const dx = lineTo.x - lineFrom.x;
  const dy = lineTo.y - lineFrom.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-5) {
    return { pt: { ...pt }, snapped: false, perpDist: Infinity };
  }
  const ux = dx / len;
  const uy = dy / len;
  const s = (pt.x - lineFrom.x) * ux + (pt.y - lineFrom.y) * uy;
  const projX = lineFrom.x + ux * s;
  const projY = lineFrom.y + uy * s;
  const perpDist = Math.hypot(pt.x - projX, pt.y - projY);
  if (perpDist <= snapRadiusM) {
    return {
      pt: { x: +projX.toFixed(3), y: +projY.toFixed(3) },
      snapped: true,
      perpDist
    };
  }
  return { pt: { ...pt }, snapped: false, perpDist };
}

/**
 * Checks whether a drawn boundary edge is colinear with a host edge's infinite supporting line
 * and overlaps the host run (supporting shorter mid-wall, equal full-face, or longer past-corner abutments).
 */
export function isEdgeColinearWithSegment(
  edge: { from: Point2D; to: Point2D },
  hostFrom: Point2D,
  hostTo: Point2D,
  options?: { perpTolM?: number; angleTolDeg?: number }
): boolean {
  const perpTolM = options?.perpTolM ?? 0.15;
  const angleTolDeg = options?.angleTolDeg ?? 6;
  const hostDx = hostTo.x - hostFrom.x;
  const hostDy = hostTo.y - hostFrom.y;
  const hostLen = Math.hypot(hostDx, hostDy);
  const edgeDx = edge.to.x - edge.from.x;
  const edgeDy = edge.to.y - edge.from.y;
  const edgeLen = Math.hypot(edgeDx, edgeDy);
  if (hostLen < 0.08 || edgeLen < 0.08) return false;

  const ux = hostDx / hostLen;
  const uy = hostDy / hostLen;
  const ex = edgeDx / edgeLen;
  const ey = edgeDy / edgeLen;

  const minDot = Math.cos((angleTolDeg * Math.PI) / 180);
  if (Math.abs(ex * ux + ey * uy) < minDot) return false;

  const perpA = Math.abs((edge.from.x - hostFrom.x) * -uy + (edge.from.y - hostFrom.y) * ux);
  const perpB = Math.abs((edge.to.x - hostFrom.x) * -uy + (edge.to.y - hostFrom.y) * ux);
  if (perpA > perpTolM || perpB > perpTolM) return false;

  const tA = (edge.from.x - hostFrom.x) * ux + (edge.from.y - hostFrom.y) * uy;
  const tB = (edge.to.x - hostFrom.x) * ux + (edge.to.y - hostFrom.y) * uy;
  const eMin = Math.min(tA, tB);
  const eMax = Math.max(tA, tB);
  const overlap = Math.min(eMax, hostLen) - Math.max(eMin, 0);
  return overlap > 0.05;
}

/**
 * Builds a closed roof outline attached to an existing wall/gutter host edge.
 * Detects any boundary edge(s) colinear with the host supporting line (shorter, equal, or longer),
 * tags them as abutment walls inheriting host height/setback defaults,
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
      const colinearToHost = isEdgeColinearWithSegment(e, attachedEdge.from, attachedEdge.to);
      if (!colinearToHost) return e;
      return {
        ...e,
        type: 'wall',
        ...(attachedEdge.type === 'wall' || attachedEdge.hasWall === true
          ? { hasWall: true }
          : attachedEdge.hasWall === false
          ? { hasWall: false }
          : {}),
        ...(attachedEdge.eaveSetbackM !== undefined
          ? { eaveSetbackM: attachedEdge.eaveSetbackM }
          : {})
      };
    })
  };
}

export function isGableEdgeType(edgeType?: EdgeType): boolean {
  return edgeType === 'verge' || edgeType === 'rake';
}

export function isStationaryEdgeType(edgeType?: EdgeType): boolean {
  return (
    edgeType === 'verge' ||
    edgeType === 'rake' ||
    edgeType === 'wall' ||
    edgeType === 'apron'
  );
}

export interface RoofLineTypeCatalogItem {
  edgeType: EdgeType;
  lineType: SkeletonLineType;
  code: string;
  label: string;
  shortLabel: string;
  colorHex: string;
  flashingKind: RoofLineFlashingKind;
  dashArray?: string;
}

export const ROOF_LINE_TYPE_CATALOG: readonly RoofLineTypeCatalogItem[] = [
  {
    edgeType: 'outline',
    lineType: 'eave',
    code: 'E',
    label: 'Eave / Gutter',
    shortLabel: 'Eave',
    colorHex: '#22c55e',
    flashingKind: 'eave'
  },
  {
    edgeType: 'ridge',
    lineType: 'ridge',
    code: 'R',
    label: 'Ridge',
    shortLabel: 'Ridge',
    colorHex: '#c084fc',
    flashingKind: 'ridge'
  },
  {
    edgeType: 'hip',
    lineType: 'hip',
    code: 'H',
    label: 'Hip',
    shortLabel: 'Hip',
    colorHex: '#38bdf8',
    flashingKind: 'hip'
  },
  {
    edgeType: 'valley',
    lineType: 'valley',
    code: 'V',
    label: 'Valley',
    shortLabel: 'Valley',
    colorHex: '#fbbf24',
    flashingKind: 'valley',
    dashArray: '6 3'
  },
  {
    edgeType: 'verge',
    lineType: 'barge',
    code: 'B',
    label: 'Barge / Verge',
    shortLabel: 'Barge',
    colorHex: '#818cf8',
    flashingKind: 'barge',
    dashArray: '6 4'
  },
  {
    edgeType: 'wall',
    lineType: 'wall',
    code: 'W',
    label: 'Wall / Abutment',
    shortLabel: 'Wall',
    colorHex: '#f59e0b',
    flashingKind: 'apron',
    dashArray: '5 3'
  },
  {
    edgeType: 'rake',
    lineType: 'rake',
    code: 'RK',
    label: 'Rake',
    shortLabel: 'Rake',
    colorHex: '#6366f1',
    flashingKind: 'barge',
    dashArray: '6 4'
  },
  {
    edgeType: 'apron',
    lineType: 'apron',
    code: 'A',
    label: 'Apron / Step',
    shortLabel: 'Apron',
    colorHex: '#fb923c',
    flashingKind: 'apron',
    dashArray: '5 3'
  },
  {
    edgeType: 'change-of-pitch',
    lineType: 'change-of-pitch',
    code: 'PB',
    label: 'Pitch Break',
    shortLabel: 'Break',
    colorHex: '#f97316',
    flashingKind: 'apron',
    dashArray: '4 4'
  },
  {
    edgeType: 'unclassified',
    lineType: 'unclassified',
    code: '?',
    label: 'Unclassified',
    shortLabel: 'Unclass',
    colorHex: '#94a3b8',
    flashingKind: 'eave',
    dashArray: '3 4'
  }
];

export function getRoofEdgeTypeMeta(edgeType: EdgeType): RoofLineTypeCatalogItem {
  return (
    ROOF_LINE_TYPE_CATALOG.find((item) => item.edgeType === edgeType) ||
    ROOF_LINE_TYPE_CATALOG[ROOF_LINE_TYPE_CATALOG.length - 1]
  );
}

export function getSkeletonLineTypeMeta(lineType: SkeletonLineType): RoofLineTypeCatalogItem {
  return (
    ROOF_LINE_TYPE_CATALOG.find((item) => item.lineType === lineType) ||
    ROOF_LINE_TYPE_CATALOG[1]
  );
}

export function mapEdgeTypeToFlashingKind(edgeType: EdgeType): RoofLineFlashingKind {
  return getRoofEdgeTypeMeta(edgeType).flashingKind;
}

export function mapSkeletonLineTypeToFlashingKind(
  lineType: SkeletonLineType
): RoofLineFlashingKind {
  return getSkeletonLineTypeMeta(lineType).flashingKind;
}

/**
 * Classifies a single boundary edge without altering skeleton geometry or fall direction of other edges.
 */
export function classifyOutlineEdge(
  outline: RoofOutline,
  edgeId: string,
  edgeType: EdgeType
): RoofOutline {
  return applyEdgeType(outline, [edgeId], edgeType);
}

/**
 * Batch-classify one or more boundary edges cleanly without altering manual skeletons or unrelated faces.
 */
export function applyEdgeType(
  outline: RoofOutline,
  edgeIds: string[],
  edgeType: EdgeType
): RoofOutline {
  if (!edgeIds || edgeIds.length === 0) return outline;
  const targetSet = new Set(edgeIds);
  const mapEdge = (e: PlanEdge): PlanEdge =>
    targetSet.has(e.id)
      ? {
          ...e,
          type: edgeType,
          ...(edgeType === 'wall' ? { hasWall: true } : {})
        }
      : e;
  return {
    ...outline,
    edges: outline.edges.map(mapEdge),
    ...(outline.holes
      ? {
          holes: outline.holes.map((h) => ({
            ...h,
            edges: h.edges.map(mapEdge)
          }))
        }
      : {})
  };
}

/**
 * Batch-update skeleton / internal polyline types cleanly.
 */
export function applySkeletonLineType(
  skeleton: SkeletonLine[],
  lineIds: string[],
  lineType: SkeletonLineType
): SkeletonLine[] {
  if (!lineIds || lineIds.length === 0) return skeleton;
  const targetSet = new Set(lineIds);
  return skeleton.map((s) =>
    targetSet.has(s.id) ? { ...s, suggestedType: lineType } : s
  );
}

/**
 * Batch-update eave setback & wall presence across one or more perimeter edges.
 */
export function applyEaveSetback(
  outline: RoofOutline,
  edgeIds: string[],
  setbackM: number,
  hasWall?: boolean
): RoofOutline {
  if (!edgeIds || edgeIds.length === 0) return outline;
  const targetSet = new Set(edgeIds);
  const clampedSetback = +Math.max(0, Math.min(3.0, setbackM)).toFixed(2);
  const mapEdge = (e: PlanEdge): PlanEdge =>
    targetSet.has(e.id)
      ? {
          ...e,
          eaveSetbackM: clampedSetback,
          ...(hasWall !== undefined ? { hasWall } : {})
        }
      : e;
  return {
    ...outline,
    edges: outline.edges.map(mapEdge),
    ...(outline.holes
      ? {
          holes: outline.holes.map((h) => ({
            ...h,
            edges: h.edges.map(mapEdge)
          }))
        }
      : {})
  };
}

/**
 * Batch-update eave wall height (Z) across one or more perimeter edges.
 */
export function applyEaveHeightToEdges(
  outline: RoofOutline,
  edgeIds: string[],
  heightM: number
): RoofOutline {
  if (!edgeIds || edgeIds.length === 0) return outline;
  const targetSet = new Set(edgeIds);
  const clampedZ = +Math.max(0.5, Math.min(30, heightM)).toFixed(2);
  const mapEdge = (e: PlanEdge): PlanEdge =>
    targetSet.has(e.id) ? { ...e, eaveHeightM: clampedZ } : e;
  return {
    ...outline,
    edges: outline.edges.map(mapEdge),
    ...(outline.holes
      ? {
          holes: outline.holes.map((h) => ({
            ...h,
            edges: h.edges.map(mapEdge)
          }))
        }
      : {})
  };
}

/**
 * Batch-apply pitch (deg) to selected roof planes while preserving IDs, codes, colors, and overrides.
 */
export function applyPitchToPlanes(
  planes: RoofPlane[],
  planeIds: string[],
  pitchDeg: number,
  levels: RoofLevel[] = []
): RoofPlane[] {
  if (!planeIds || planeIds.length === 0) return planes;
  const targetSet = new Set(planeIds);
  const clampedPitch = +Math.max(1, Math.min(65, pitchDeg)).toFixed(1);

  return planes.map((plane) => {
    if (!targetSet.has(plane.id)) return plane;
    const owningLvl =
      levels.find((l) => l.id === (plane.levelId || 'level-1')) ||
      levels.find((l) => getAllOutlineEdges(l.outline).some((e) => e.id === plane.eaveEdgeId));
    const edge = owningLvl
      ? getAllOutlineEdges(owningLvl.outline).find((e) => e.id === plane.eaveEdgeId)
      : undefined;
    if (!owningLvl || !edge) {
      return { ...plane, pitchDeg: clampedPitch };
    }
    const rebuilt = createPlaneFromEdge(owningLvl.outline, owningLvl.skeleton, edge, {
      pitchDeg: clampedPitch,
      underlapSide: plane.underlapSide,
      eaveHeightM: plane.eaveHeightM,
      sheetRunEdgeId: plane.sheetRunEdgeId,
      orderedSheetLengthM: plane.orderedSheetLengthM,
      name: plane.name,
      existingId: plane.id,
      isStartEdge: plane.isStartEdge,
      levelId: plane.levelId || owningLvl.id,
      levelCode: plane.levelCode || owningLvl.code,
      levelName: plane.levelName || owningLvl.name
    });
    return {
      ...rebuilt,
      id: plane.id,
      code: plane.code,
      label: plane.label,
      color: plane.color
    };
  });
}

/**
 * Batch-apply sheet lay / underlap direction across selected roof planes.
 */
export function applyDirectionToPlanes(
  planes: RoofPlane[],
  planeIds: string[],
  underlapSide: 'left' | 'right'
): RoofPlane[] {
  if (!planeIds || planeIds.length === 0) return planes;
  const targetSet = new Set(planeIds);
  return planes.map((plane) =>
    targetSet.has(plane.id) ? { ...plane, underlapSide } : plane
  );
}

/**
 * Batch-apply BOM-only site-measured ordered sheet length override across selected planes.
 * Never alters planPolygon, developedPolygon, or modeled slopeLength.
 */
export function applyOrderedSheetLengthToPlanes(
  planes: RoofPlane[],
  planeIds: string[],
  orderedSheetLengthM: number | undefined
): RoofPlane[] {
  if (!planeIds || planeIds.length === 0) return planes;
  const targetSet = new Set(planeIds);
  const cleanLen =
    orderedSheetLengthM !== undefined &&
    Number.isFinite(orderedSheetLengthM) &&
    orderedSheetLengthM > 0.2
      ? +orderedSheetLengthM.toFixed(3)
      : undefined;
  return planes.map((plane) => {
    if (!targetSet.has(plane.id)) return plane;
    if (cleanLen === undefined) {
      const next = { ...plane };
      delete next.orderedSheetLengthM;
      return next;
    }
    return { ...plane, orderedSheetLengthM: cleanLen };
  });
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
    ...(prev.holes && prev.holes.length > 0 ? { holes: prev.holes } : {}),
    edges: next.edges.map((e, i) => ({
      ...e,
      id: prev.edges[i]?.id || e.id,
      type: prev.edges[i]?.type || e.type,
      ...(prev.edges[i]?.eaveHeightM !== undefined ? { eaveHeightM: prev.edges[i].eaveHeightM } : {}),
      ...(prev.edges[i]?.hasWall !== undefined ? { hasWall: prev.edges[i].hasWall } : {}),
      ...(prev.edges[i]?.eaveSetbackM !== undefined ? { eaveSetbackM: prev.edges[i].eaveSetbackM } : {}),
      ...(prev.edges[i]?.wallBottomZ !== undefined ? { wallBottomZ: prev.edges[i].wallBottomZ } : {}),
      ...(prev.edges[i]?.levelId ? { levelId: prev.edges[i].levelId } : prev.levelId ? { levelId: prev.levelId } : {})
    }))
  };
}

/**
 * Interior corner angle in degrees [0..180] at vertexIdx of a closed polygon.
 */
export function computeCornerAngleDeg(points: Point2D[], vertexIdx: number): number | null {
  const n = points.length;
  if (n < 3 || vertexIdx < 0 || vertexIdx >= n) return null;
  const prev = points[(vertexIdx - 1 + n) % n];
  const curr = points[vertexIdx];
  const next = points[(vertexIdx + 1) % n];
  const ax = prev.x - curr.x;
  const ay = prev.y - curr.y;
  const bx = next.x - curr.x;
  const by = next.y - curr.y;
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-4 || lb < 1e-4) return null;
  const dot = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
  return +((Math.acos(dot) * 180) / Math.PI).toFixed(1);
}

/**
 * Squares a single corner vertex V of a closed polygon so adjacent edges (P_prev->V and V->P_next)
 * meet at 90 degrees without moving P_prev or P_next or breaking the closed outline.
 *
 * Rule (Thales Closest-Right-Angle Projection):
 * Projects V radially onto the Thales circle with diameter [P_prev, P_next]
 * (center M = midpoint(P_prev, P_next), radius R = dist(P_prev, P_next) / 2).
 * This is the minimum-distance move on V that enforces angle(P_prev, V', P_next) = 90 deg,
 * preserves orientation on the same side of the chord, and leaves an exact 90 deg corner unchanged.
 */
export function squarePolygonCorner(points: Point2D[], vertexIdx: number): Point2D[] {
  const n = points.length;
  if (n < 3 || vertexIdx < 0 || vertexIdx >= n) return points;
  const prev = points[(vertexIdx - 1 + n) % n];
  const curr = points[vertexIdx];
  const next = points[(vertexIdx + 1) % n];

  const chordDx = next.x - prev.x;
  const chordDy = next.y - prev.y;
  const chordLen = Math.hypot(chordDx, chordDy);
  if (chordLen < 0.08) return points;

  const midX = (prev.x + next.x) / 2;
  const midY = (prev.y + next.y) / 2;
  const radius = chordLen / 2;

  const rx = curr.x - midX;
  const ry = curr.y - midY;
  const rLen = Math.hypot(rx, ry);

  let nextX: number;
  let nextY: number;
  if (rLen < 1e-4) {
    // 180-deg collinear vertex: offset perpendicularly to the chord
    const ux = -chordDy / chordLen;
    const uy = chordDx / chordLen;
    nextX = midX + ux * radius;
    nextY = midY + uy * radius;
  } else {
    nextX = midX + (rx / rLen) * radius;
    nextY = midY + (ry / rLen) * radius;
  }

  return points.map((p, idx) =>
    idx === vertexIdx
      ? { x: +nextX.toFixed(3), y: +nextY.toFixed(3) }
      : { ...p }
  );
}

/**
 * Squares the corner vertex of a RoofOutline while preserving all edge metadata.
 */
export function squareOutlineCorner(outline: RoofOutline, vertexIdx: number): RoofOutline {
  if (vertexIdx < 0 || vertexIdx >= outline.points.length || outline.points.length < 3) {
    return outline;
  }
  const squaredPoints = squarePolygonCorner(outline.points, vertexIdx);
  return preserveOutlineEdgeMetadata(
    buildOutlineFromPoints(squaredPoints, outline.id, {
      levelId: outline.levelId,
      idPrefix: getLevelIdPrefixFromOutline(outline)
    }),
    outline
  );
}

export function updateEdgeLength(outline: RoofOutline, edgeId: string, newLengthM: number): RoofOutline {
  if (newLengthM <= 0.1) return outline;
  const edgeIdx = outline.edges.findIndex((e) => e.id === edgeId);
  if (edgeIdx < 0) return outline;

  const pts = outline.points.map((p) => ({ ...p }));
  const n = pts.length;
  if (n < 3) return outline;

  const prevIdx = (edgeIdx - 1 + n) % n;
  const nextIdx = (edgeIdx + 1) % n;
  const next2Idx = (edgeIdx + 2) % n;
  const p0 = pts[edgeIdx];
  const p1 = pts[nextIdx];

  const curLen = dist(p0, p1);
  if (curLen < 0.01) return outline;
  const delta = newLengthM - curLen;
  const ux = (p1.x - p0.x) / curLen;
  const uy = (p1.y - p0.y) / curLen;
  const shift = { x: ux * delta, y: uy * delta };

  const unitVec = (a: Point2D, b: Point2D): Point2D => {
    const l = dist(a, b) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  };

  // Case 1: 4-Corner Orthogonal Rectangle (any rotation, starting vertex, or winding)
  if (n === 4) {
    const next3Idx = (edgeIdx + 3) % n;
    const vPrev = unitVec(pts[prevIdx], p0);
    const vNext = unitVec(p1, pts[next2Idx]);
    const vOpp = unitVec(pts[next2Idx], pts[next3Idx]);
    const isOrthoRect =
      Math.abs(vPrev.x * ux + vPrev.y * uy) < 0.15 &&
      Math.abs(ux * vNext.x + uy * vNext.y) < 0.15 &&
      Math.abs(ux * vOpp.x + uy * vOpp.y) > 0.96;

    if (isOrthoRect) {
      pts[nextIdx] = {
        x: +(pts[nextIdx].x + shift.x).toFixed(2),
        y: +(pts[nextIdx].y + shift.y).toFixed(2)
      };
      pts[next2Idx] = {
        x: +(pts[next2Idx].x + shift.x).toFixed(2),
        y: +(pts[next2Idx].y + shift.y).toFixed(2)
      };
      return preserveOutlineEdgeMetadata(
        buildOutlineFromPoints(pts, outline.id, {
          levelId: outline.levelId,
          idPrefix: getLevelIdPrefixFromOutline(outline)
        }),
        outline
      );
    }
  }

  // Case 2: Rectilinear / L / T / Stepped polygon — translate perpendicular corner chain rigidly
  // so adjacent gable walls & orthogonal corners stay 90 deg instead of turning diagonal.
  if (n > 4) {
    const next3Idx = (edgeIdx + 3) % n;
    const vNext = unitVec(p1, pts[next2Idx]);
    const vNext2 = unitVec(pts[next2Idx], pts[next3Idx]);
    const next2Shifted = {
      x: +(pts[next2Idx].x + shift.x).toFixed(2),
      y: +(pts[next2Idx].y + shift.y).toFixed(2)
    };
    const origSeg2 = { x: pts[next3Idx].x - pts[next2Idx].x, y: pts[next3Idx].y - pts[next2Idx].y };
    const nextSeg2 = { x: pts[next3Idx].x - next2Shifted.x, y: pts[next3Idx].y - next2Shifted.y };
    const forwardKeepsSign =
      origSeg2.x * nextSeg2.x + origSeg2.y * nextSeg2.y > 0 &&
      Math.hypot(nextSeg2.x, nextSeg2.y) >= 0.35;

    if (
      Math.abs(ux * vNext.x + uy * vNext.y) < 0.15 &&
      Math.abs(ux * vNext2.x + uy * vNext2.y) > 0.96 &&
      forwardKeepsSign
    ) {
      pts[nextIdx] = {
        x: +(pts[nextIdx].x + shift.x).toFixed(2),
        y: +(pts[nextIdx].y + shift.y).toFixed(2)
      };
      pts[next2Idx] = next2Shifted;
      return preserveOutlineEdgeMetadata(
        buildOutlineFromPoints(pts, outline.id, {
          levelId: outline.levelId,
          idPrefix: getLevelIdPrefixFromOutline(outline)
        }),
        outline
      );
    }

    const prev2Idx = (edgeIdx - 2 + n) % n;
    const vPrev = unitVec(pts[prevIdx], p0);
    const vPrev2 = unitVec(pts[prev2Idx], pts[prevIdx]);
    const prevShifted = {
      x: +(pts[prevIdx].x - shift.x).toFixed(2),
      y: +(pts[prevIdx].y - shift.y).toFixed(2)
    };
    const origPrev2 = { x: prevShifted.x - pts[prev2Idx].x, y: prevShifted.y - pts[prev2Idx].y };
    const basePrev2 = { x: pts[prevIdx].x - pts[prev2Idx].x, y: pts[prevIdx].y - pts[prev2Idx].y };
    const backKeepsSign =
      basePrev2.x * origPrev2.x + basePrev2.y * origPrev2.y > 0 &&
      Math.hypot(origPrev2.x, origPrev2.y) >= 0.35;

    if (
      Math.abs(ux * vPrev.x + uy * vPrev.y) < 0.15 &&
      Math.abs(ux * vPrev2.x + uy * vPrev2.y) > 0.96 &&
      backKeepsSign
    ) {
      pts[edgeIdx] = {
        x: +(pts[edgeIdx].x - shift.x).toFixed(2),
        y: +(pts[edgeIdx].y - shift.y).toFixed(2)
      };
      pts[prevIdx] = prevShifted;
      return preserveOutlineEdgeMetadata(
        buildOutlineFromPoints(pts, outline.id, {
          levelId: outline.levelId,
          idPrefix: getLevelIdPrefixFromOutline(outline)
        }),
        outline
      );
    }
  }

  // Case 3: General polygon - adjust target vertex along line direction
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

export function remapSkeletonForOutlineResize(
  prevOutline: RoofOutline,
  nextOutline: RoofOutline,
  prevSkeleton: SkeletonLine[]
): SkeletonLine[] {
  if (prevSkeleton.length === 0) return [];
  if (
    prevOutline.points.length !== nextOutline.points.length ||
    prevOutline.edges.length !== nextOutline.edges.length ||
    prevOutline.points.length < 3
  ) {
    return prevSkeleton;
  }

  const mapPoint = (pt: Point2D): Point2D => {
    // 1. Direct corner match
    for (let i = 0; i < prevOutline.points.length; i++) {
      const oldV = prevOutline.points[i];
      const newV = nextOutline.points[i];
      if (pointsClose(pt, oldV, 0.25)) {
        const dx = newV.x - oldV.x;
        const dy = newV.y - oldV.y;
        return { x: +(pt.x + dx).toFixed(3), y: +(pt.y + dy).toFixed(3) };
      }
    }

    // 2. Boundary edge match (e.g. ridge apex anchored on a gable wall that translated)
    for (let i = 0; i < prevOutline.edges.length; i++) {
      const oldE = prevOutline.edges[i];
      const newE = nextOutline.edges[i];
      if (distToSegment(pt, oldE.from, oldE.to) <= 0.25) {
        const oldLen = dist(oldE.from, oldE.to);
        if (oldLen < 0.05) continue;
        const ux = (oldE.to.x - oldE.from.x) / oldLen;
        const uy = (oldE.to.y - oldE.from.y) / oldLen;
        const t = Math.max(0, Math.min(1, ((pt.x - oldE.from.x) * ux + (pt.y - oldE.from.y) * uy) / oldLen));
        const projOld = {
          x: oldE.from.x + (oldE.to.x - oldE.from.x) * t,
          y: oldE.from.y + (oldE.to.y - oldE.from.y) * t
        };
        const projNew = {
          x: newE.from.x + (newE.to.x - newE.from.x) * t,
          y: newE.from.y + (newE.to.y - newE.from.y) * t
        };
        return {
          x: +(pt.x + (projNew.x - projOld.x)).toFixed(3),
          y: +(pt.y + (projNew.y - projOld.y)).toFixed(3)
        };
      }
    }

    return pt;
  };

  return prevSkeleton.map((line) => ({
    ...line,
    from: mapPoint(line.from),
    to: mapPoint(line.to)
  }));
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

/**
 * Merge colinear ridge segments on the same roof pitch band into continuous logical ridges
 * (unless explicitly marked with `manualSplit`). Handles touching, overlapping, or small-gap
 * colinear ridge segments cleanly.
 */
export function mergeColinearRidgeLines(
  rawLines: SkeletonLine[],
  existingPlanes: RoofPlane[] = []
): SkeletonLine[] {
  const result = rawLines.map((l) => ({
    ...l,
    from: { x: +l.from.x.toFixed(3), y: +l.from.y.toFixed(3) },
    to: { x: +l.to.x.toFixed(3), y: +l.to.y.toFixed(3) }
  }));

  const getPitchBandForLine = (line: SkeletonLine): number | null => {
    if (!existingPlanes || existingPlanes.length === 0) return null;
    const mid = { x: (line.from.x + line.to.x) / 2, y: (line.from.y + line.to.y) / 2 };
    const matched = existingPlanes.filter((p) => {
      if (line.levelId && p.levelId && line.levelId !== p.levelId) return false;
      return p.planPolygon.some((v, idx) => {
        const next = p.planPolygon[(idx + 1) % p.planPolygon.length];
        return distToSegment(mid, v, next) <= 0.2;
      });
    });
    if (matched.length === 0) return null;
    return matched.reduce((s, p) => s + (p.pitchDeg || 22.5), 0) / matched.length;
  };

  let mergedAny = true;
  let guard = 0;
  while (mergedAny && guard++ < 150) {
    mergedAny = false;
    for (let i = 0; i < result.length; i++) {
      const l1 = result[i];
      if (l1.suggestedType !== 'ridge' || l1.manualSplit) continue;
      const len1 = dist(l1.from, l1.to);
      if (len1 < 0.04) continue;
      const u1x = (l1.to.x - l1.from.x) / len1;
      const u1y = (l1.to.y - l1.from.y) / len1;

      for (let j = i + 1; j < result.length; j++) {
        const l2 = result[j];
        if (l2.suggestedType !== 'ridge' || l2.manualSplit) continue;
        if (l1.levelId && l2.levelId && l1.levelId !== l2.levelId) continue;

        const len2 = dist(l2.from, l2.to);
        if (len2 < 0.04) continue;
        const u2x = (l2.to.x - l2.from.x) / len2;
        const u2y = (l2.to.y - l2.from.y) / len2;

        // Colinear direction check (~ <= 7 deg)
        if (Math.abs(u1x * u2x + u1y * u2y) < 0.992) continue;

        // Perpendicular offset check relative to infinite line of l1
        const perpA = Math.abs((l2.from.x - l1.from.x) * -u1y + (l2.from.y - l1.from.y) * u1x);
        const perpB = Math.abs((l2.to.x - l1.from.x) * -u1y + (l2.to.y - l1.from.y) * u1x);
        if (perpA > 0.14 || perpB > 0.14) continue;

        // 1D interval overlap / gap check along u1
        const p2a = (l2.from.x - l1.from.x) * u1x + (l2.from.y - l1.from.y) * u1y;
        const p2b = (l2.to.x - l1.from.x) * u1x + (l2.to.y - l1.from.y) * u1y;
        const s2 = Math.min(p2a, p2b);
        const e2 = Math.max(p2a, p2b);
        const gap = Math.max(s2 - len1, -e2);
        if (gap > 0.25) continue;

        // Same pitch band check if abutting roof planes exist
        const pitch1 = getPitchBandForLine(l1);
        const pitch2 = getPitchBandForLine(l2);
        if (pitch1 !== null && pitch2 !== null && Math.abs(pitch1 - pitch2) > 1.5) continue;

        const minT = Math.min(0, s2);
        const maxT = Math.max(len1, e2);
        const keepPrimary = len1 >= len2 ? l1 : l2;
        result[i] = {
          id: keepPrimary.id,
          from: {
            x: +(l1.from.x + u1x * minT).toFixed(3),
            y: +(l1.from.y + u1y * minT).toFixed(3)
          },
          to: {
            x: +(l1.from.x + u1x * maxT).toFixed(3),
            y: +(l1.from.y + u1y * maxT).toFixed(3)
          },
          suggestedType: 'ridge',
          ...(keepPrimary.levelId ? { levelId: keepPrimary.levelId } : {})
        };
        result.splice(j, 1);
        mergedAny = true;
        break;
      }
      if (mergedAny) break;
    }
  }

  return result;
}

// Clean-up pass: collapses short interior ridge stubs, deduplicates, and merges collinear ridges
function cleanupSkeletonLines(
  rawLines: SkeletonLine[],
  perimeterPts: Point2D[] = [],
  options?: { levelId?: string; idPrefix?: string; holePerimeterPts?: Point2D[] }
): SkeletonLine[] {
  const holePts = options?.holePerimeterPts || [];
  const hasHoles = holePts.length > 0;
  let lines = rawLines
    .filter((l) => dist(l.from, l.to) > 0.02)
    .map((l) => ({
      ...l,
      from: { x: +l.from.x.toFixed(3), y: +l.from.y.toFixed(3) },
      to: { x: +l.to.x.toFixed(3), y: +l.to.y.toFixed(3) }
    }));

  const isPerimeterAnchor = (pt: Point2D): boolean =>
    perimeterPts.some((p) => pointsClose(p, pt, 0.04)) ||
    holePts.some((p) => pointsClose(p, pt, 0.04));

  // 1. Collapse very short interior segments between non-perimeter junctions
  //    (use smaller threshold for courtyard voids so narrow band-offset miters stay planar)
  const minInteriorLen = hasHoles ? 0.12 : 0.35;
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

  // Filter any leftover degenerate stubs that couldn't be collapsed cleanly
  lines = lines.filter((l) => dist(l.from, l.to) >= (hasHoles ? 0.1 : 0.25));

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
  lines = mergeColinearRidgeLines(lines);

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

  const others = lines
    .filter(
      (l) =>
        l.suggestedType !== 'ridge' &&
        l.suggestedType !== 'valley' &&
        l.suggestedType !== 'hip'
    )
    .map((l, idx) => ({
      ...l,
      id: l.id && !l.id.startsWith('skel-raw-') ? l.id : `${prefix}skel-line-${idx + 1}`,
      ...levelProp
    }));

  return [...ridges, ...valleys, ...hips, ...others];
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
      if (!isStationaryEdgeType(oe.type)) return false;
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

  const holes = (outline.holes || []).filter((h) => h.points.length >= 3);
  const totalDomainVertices =
    origPts.length + holes.reduce((acc, h) => acc + h.points.length, 0);
  if (totalDomainVertices > MAX_ROOF_DOMAIN_VERTICES) {
    throw new Error(
      `Roof outline complexity limit exceeded (${totalDomainVertices} vertices > ${MAX_ROOF_DOMAIN_VERTICES} max)`
    );
  }

  // Simplify consecutive duplicates & near-collinear wall noise (preserving verge transitions)
  const simplePts = simplifyOutlinePoints(origPts, outline.edges);
  const n = simplePts.length;
  if (n < 3) return [];

  // Ensure Counter-Clockwise (CCW) orientation so inward normal is always (-dy, dx)
  const isCCW = getSignedArea(simplePts) > 0;
  const ccwPts = isCCW ? [...simplePts] : [...simplePts].reverse();

  // Prepare CW-oriented hole rings so (-dy, dx) points OUTWARD from hole = INTO roof domain
  const holeCwRings = holes.map((h) => {
    const simpleH = simplifyOutlinePoints(h.points, h.edges);
    const isHccw = getSignedArea(simpleH) > 0;
    const cwH = isHccw ? [...simpleH].reverse() : [...simpleH];
    return { hole: h, pts: cwH };
  });
  const allOutlineEdges = getAllOutlineEdges(outline);

  // Map each simplified point back to exact original outline point for face tracing
  const allOrigRingPts = [...origPts, ...holes.flatMap((h) => h.points)];
  const mapToOrig = (pt: Point2D): Point2D => {
    const match = allOrigRingPts.find((p) => pointsClose(p, pt, 0.1));
    return match ? { ...match } : { ...pt };
  };

  // Detect whether segment a->b lies along a 'verge' (gable wall) or 'wall' (abutment wall) edge
  const isStationaryWallSegment = (a: Point2D, b: Point2D): boolean => {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const segLen = dist(a, b) || 1;
    const dir = { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen };
    return allOutlineEdges.some((oe) => {
      if (!isStationaryEdgeType(oe.type)) return false;
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
  let edgeIdSeq = 0;
  const waveEdges: WaveEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = initialCorners[i].origPt;
    const b = initialCorners[(i + 1) % n].origPt;
    const len = dist(a, b) || 1;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const normal = { x: -dir.y, y: dir.x };
    const speed = isStationaryWallSegment(a, b) ? 0 : 1;
    waveEdges.push({ id: edgeIdSeq++, dir, normal, speed });
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

  const isSegmentInsideDomain = (a: Point2D, b: Point2D): boolean => {
    if (!isSegmentInsidePolygon(a, b, ccwPts)) return false;
    if (holeCwRings.length === 0) return true;
    const tSamples = [0.15, 0.5, 0.85];
    for (const hr of holeCwRings) {
      for (const ts of tSamples) {
        const pt = { x: a.x + (b.x - a.x) * ts, y: a.y + (b.y - a.y) * ts };
        if (
          isPointInPolygon(pt, hr.pts) &&
          !hr.pts.some((hp, hi) => distToSegment(pt, hp, hr.pts[(hi + 1) % hr.pts.length]) <= 0.04)
        ) {
          return false;
        }
      }
    }
    return true;
  };

  const allBoundaryRings: Point2D[][] = [ccwPts, ...holeCwRings.map((hr) => hr.pts)];

  const rawLines: SkeletonLine[] = [];
  let lineSeq = 1;
  const emitLine = (a: Point2D, b: Point2D, type: 'hip' | 'valley' | 'ridge') => {
    if (dist(a, b) <= 1e-4) return;
    if (!isSegmentInsideDomain(a, b)) return;

    // Suppress segments running strictly along any outer or hole boundary wall
    for (const ringPts of allBoundaryRings) {
      for (let i = 0; i < ringPts.length; i++) {
        const eA = ringPts[i];
        const eB = ringPts[(i + 1) % ringPts.length];
        if (distToSegment(a, eA, eB) <= 0.05 && distToSegment(b, eA, eB) <= 0.05) {
          return;
        }
        // Trim partial boundary overlap along stationary verges/step-down cheeks
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
  // When holes exist (courtyard / void donut plans), run synchronous multi-ring wavefront collision
  // across outer CCW loop + inner CW hole loops so hole valleys collide cleanly with outer eaves.
  if (holeCwRings.length > 0) {
    const holeInitialLoops: WaveVertex[][] = holeCwRings
      .map((hr) => {
        const hn = hr.pts.length;
        if (hn < 3) return null;
        const hCorners = hr.pts.map((curr, i) => {
          const prev = hr.pts[(i - 1 + hn) % hn];
          const next = hr.pts[(i + 1) % hn];
          const cross = crossProduct2D(prev, curr, next);
          return {
            origPt: mapToOrig(curr),
            isReflex: cross < -0.015
          };
        });
        const hWaveEdges: WaveEdge[] = [];
        for (let i = 0; i < hn; i++) {
          const a = hCorners[i].origPt;
          const b = hCorners[(i + 1) % hn].origPt;
          const len = dist(a, b) || 1;
          const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
          const normal = { x: -dir.y, y: dir.x };
          const speed = isStationaryWallSegment(a, b) ? 0 : 1;
          hWaveEdges.push({ id: edgeIdSeq++, dir, normal, speed });
        }
        return hCorners.map((c, i) => {
          const prevEdge = hWaveEdges[(i - 1 + hn) % hn];
          const nextEdge = hWaveEdges[i];
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
            originKind: c.isReflex ? 'valley' : hasVerge ? 'ridge' : 'hip'
          } as WaveVertex;
        });
      })
      .filter((lp): lp is WaveVertex[] => Boolean(lp && lp.length >= 3));

    let activeLoops: WaveVertex[][] = [
      pruneCollinearSeamVertices(initialVertices),
      ...holeInitialLoops.map((lp) => pruneCollinearSeamVertices(lp))
    ];
    let currentT = 0;
    const maxHoleSteps = totalDomainVertices * 32 + 160;
    let steps = 0;

    while (activeLoops.length > 0 && steps++ < maxHoleSteps) {
      let handledInstant = false;
      for (let li = activeLoops.length - 1; li >= 0; li--) {
        let verts = pruneCollinearSeamVertices(activeLoops[li]);
        activeLoops[li] = verts;
        const m = verts.length;

        if (
          m < 2 ||
          verts.every((v) => Math.hypot(v.vel.x, v.vel.y) < 1e-4 && !v.isOpposingParallel)
        ) {
          activeLoops.splice(li, 1);
          handledInstant = true;
          break;
        }

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
          activeLoops.splice(li, 1);
          handledInstant = true;
          break;
        }

        // Parallel-opposing foldback (Case C)
        let foldedLocal = false;
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
          const perpGap = Math.abs(
            (qW.x - qV.x) * v.prevEdge.normal.x + (qW.y - qV.y) * v.prevEdge.normal.y
          );
          if (perpGap > 0.3) continue;

          if (v.prevEdge.speed === 0 && v.nextEdge.speed === 0) {
            verts.splice(i, 1);
            foldedLocal = true;
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
          foldedLocal = true;
          break;
        }
        if (foldedLocal) {
          handledInstant = true;
          break;
        }
      }
      if (handledInstant) continue;

      // Global earliest Edge Event across all loops
      let bestEdgeDt = Infinity;
      let bestEdgeLoopIdx = -1;
      let bestEdgeVertIdx = -1;

      for (let li = 0; li < activeLoops.length; li++) {
        const verts = activeLoops[li];
        const m = verts.length;
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
            bestEdgeLoopIdx = li;
            bestEdgeVertIdx = i;
          }
        }
      }

      // Global earliest Split / Cross-Ring Collision Event
      let bestSplitDt = Infinity;
      let bestSrcLoopIdx = -1;
      let bestSrcVertIdx = -1;
      let bestTgtLoopIdx = -1;
      let bestTgtEdgeVertIdx = -1;
      let bestSplitPt: Point2D | null = null;

      for (let sLi = 0; sLi < activeLoops.length; sLi++) {
        const sVerts = activeLoops[sLi];
        const mS = sVerts.length;
        for (let i = 0; i < mS; i++) {
          const v = sVerts[i];
          if (v.isOpposingParallel) continue;
          const turnCross = v.prevEdge.dir.x * v.nextEdge.dir.y - v.prevEdge.dir.y * v.nextEdge.dir.x;
          if (turnCross >= -1e-4) continue;
          const qV = posAt(v, currentT);

          for (let tLi = 0; tLi < activeLoops.length; tLi++) {
            const tVerts = activeLoops[tLi];
            const mT = tVerts.length;
            for (let j = 0; j < mT; j++) {
              const jNext = (j + 1) % mT;
              if (sLi === tLi && (j === i || jNext === i)) continue;
              const vJ = tVerts[j];
              const vJNext = tVerts[jNext];
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
              if (!isSegmentInsideDomain(v.pos, X)) continue;
              const aPrime = posAt(vJ, hitT);
              const bPrime = posAt(vJNext, hitT);
              const lenPrime = (bPrime.x - aPrime.x) * e.dir.x + (bPrime.y - aPrime.y) * e.dir.y;
              const s = (X.x - aPrime.x) * e.dir.x + (X.y - aPrime.y) * e.dir.y;

              if (lenPrime >= -1e-4 && s >= -0.02 && s <= Math.max(0, lenPrime) + 0.02) {
                bestSplitDt = dt;
                bestSrcLoopIdx = sLi;
                bestSrcVertIdx = i;
                bestTgtLoopIdx = tLi;
                bestTgtEdgeVertIdx = j;
                bestSplitPt = X;
              }
            }
          }
        }
      }

      if (!Number.isFinite(bestEdgeDt) && !Number.isFinite(bestSplitDt)) {
        for (const verts of activeLoops) {
          resolveParallelSpineFallback(verts, currentT);
        }
        break;
      }

      if (bestEdgeDt <= bestSplitDt + 1e-5 && bestEdgeLoopIdx >= 0 && bestEdgeVertIdx >= 0) {
        const newT = currentT + bestEdgeDt;
        const verts = activeLoops[bestEdgeLoopIdx];
        const m = verts.length;
        const nextI = (bestEdgeVertIdx + 1) % m;
        const vA = verts[bestEdgeVertIdx];
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
        if (bestEdgeVertIdx < nextI) {
          verts.splice(bestEdgeVertIdx, 2, vNew);
        } else {
          verts.pop();
          verts.shift();
          verts.push(vNew);
        }
        currentT = newT;
      } else if (
        bestSrcLoopIdx >= 0 &&
        bestSrcVertIdx >= 0 &&
        bestTgtLoopIdx >= 0 &&
        bestTgtEdgeVertIdx >= 0 &&
        bestSplitPt
      ) {
        const newT = currentT + bestSplitDt;
        const X = bestSplitPt;
        const srcVerts = activeLoops[bestSrcLoopIdx];
        const tgtVerts = activeLoops[bestTgtLoopIdx];
        const mS = srcVerts.length;
        const mT = tgtVerts.length;
        const i = bestSrcVertIdx;
        const j = bestTgtEdgeVertIdx;
        const v = srcVerts[i];
        const e = tgtVerts[j].nextEdge;

        emitLine(v.pos, X, v.originKind);

        const velLeft = computeBisectorVelocity(v.prevEdge.normal, e.normal, v.prevEdge.speed, e.speed);
        const velRight = computeBisectorVelocity(e.normal, v.nextEdge.normal, e.speed, v.nextEdge.speed);

        if (bestSrcLoopIdx === bestTgtLoopIdx) {
          const verts = srcVerts;
          const chainA: WaveVertex[] = [];
          let cursor = (j + 1) % mS;
          while (cursor !== i) {
            chainA.push(verts[cursor]);
            cursor = (cursor + 1) % mS;
          }
          const chainB: WaveVertex[] = [];
          cursor = (i + 1) % mS;
          while (true) {
            chainB.push(verts[cursor]);
            if (cursor === j) break;
            cursor = (cursor + 1) % mS;
          }
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
          activeLoops[bestSrcLoopIdx] = loopA;
          if (loopB.length >= 2) {
            activeLoops.push(loopB);
          }
        } else {
          // Bridge-merge two disjoint rings at X on edge e:
          // ... -> tgt[j] -(e)-> vIn(e->v.next) -> src[i+1..i-1] -> vOut(v.prev->e) -(e)-> tgt[j+1] ...
          const chainTgt: WaveVertex[] = [];
          for (let step = 1; step <= mT; step++) {
            chainTgt.push(tgtVerts[(j + step) % mT]);
          }
          const chainSrc: WaveVertex[] = [];
          for (let step = 1; step < mS; step++) {
            chainSrc.push(srcVerts[(i + step) % mS]);
          }
          const vInToSrc: WaveVertex = {
            id: nextVertexId++,
            pos: X,
            t0: newT,
            vel: velRight.vel,
            isOpposingParallel: velRight.isOpposingParallel,
            prevEdge: e,
            nextEdge: v.nextEdge,
            originKind: classifyWaveJunction(e, v.nextEdge)
          };
          const vOutFromSrc: WaveVertex = {
            id: nextVertexId++,
            pos: X,
            t0: newT,
            vel: velLeft.vel,
            isOpposingParallel: velLeft.isOpposingParallel,
            prevEdge: v.prevEdge,
            nextEdge: e,
            originKind: classifyWaveJunction(v.prevEdge, e)
          };
          const mergedLoop = [...chainTgt, vInToSrc, ...chainSrc, vOutFromSrc];
          const highIdx = Math.max(bestSrcLoopIdx, bestTgtLoopIdx);
          const lowIdx = Math.min(bestSrcLoopIdx, bestTgtLoopIdx);
          activeLoops[lowIdx] = mergedLoop;
          activeLoops.splice(highIdx, 1);
        }
        currentT = newT;
      }
    }

    return cleanupSkeletonLines(rawLines, origPts, {
      levelId: outline.levelId,
      idPrefix: getLevelIdPrefixFromOutline(outline),
      holePerimeterPts: holes.flatMap((h) => h.points)
    });
  }

  // Standard Single-Ring Queue Propagation (no holes)
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

export function setEdgeWall(
  outline: RoofOutline,
  edgeId: string,
  updates: {
    hasWall?: boolean;
    eaveSetbackM?: number;
    wallBottomZ?: number;
  }
): RoofOutline {
  const edge = getAllOutlineEdges(outline).find((e) => e.id === edgeId);
  if (!edge) return outline;

  const updateEdge = (e: PlanEdge): PlanEdge => {
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
  };

  return {
    ...outline,
    edges: outline.edges.map(updateEdge),
    ...(outline.holes
      ? {
          holes: outline.holes.map((h) => ({
            ...h,
            edges: h.edges.map(updateEdge)
          }))
        }
      : {})
  };
}


interface PlanarGraphEdgeMeta {
  outlineEdge?: PlanEdge;
  skeletonLine?: SkeletonLine;
  edgeType: EdgeType | SkeletonLineType;
  isOutlineEdge: boolean;
  isClassified: boolean;
}

interface PlanarFaceGraph {
  nodes: Point2D[];
  adj: Map<number, Set<number>>;
  edgeMetaByKey: Map<string, PlanarGraphEdgeMeta>;
  workingSkel: SkeletonLine[];
  outlineSignedArea: number;
}

function planarEdgeKey(u: number, v: number): string {
  return u < v ? `${u}-${v}` : `${v}-${u}`;
}

function signedPolyArea(pts: Point2D[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    a += p1.x * p2.y - p2.x * p1.y;
  }
  return a * 0.5;
}

function buildPlanarFaceGraph(
  outline: RoofOutline,
  skeleton: SkeletonLine[]
): PlanarFaceGraph | null {
  const allOutlineEdges = getAllOutlineEdges(outline);
  const allOutlinePts = [
    ...outline.points,
    ...(outline.holes || []).flatMap((h) => h.points)
  ];
  if (outline.edges.length < 3 || skeleton.length === 0) return null;

  const mergedSkel = mergeColinearRidgeLines(skeleton);

  // Snap near-touching manual skeleton endpoints (<= 0.28m) in strict topological priority:
  // 1) outline/hole corners -> 2) other skeleton endpoints -> 3) outline/hole edges -> 4) other skeleton segments
  const snapManualEndpoint = (pt: Point2D, selfIdx: number): Point2D => {
    for (const v of allOutlinePts) {
      if (dist(pt, v) <= 0.25) return { ...v };
    }

    for (let j = 0; j < mergedSkel.length; j++) {
      if (j === selfIdx) continue;
      for (const op of [mergedSkel[j].from, mergedSkel[j].to]) {
        if (dist(pt, op) <= 0.25) return { ...op };
      }
    }

    let bestPt: Point2D | null = null;
    let bestD = 0.28;
    for (const oe of allOutlineEdges) {
      const len2 = (oe.to.x - oe.from.x) ** 2 + (oe.to.y - oe.from.y) ** 2;
      if (len2 < 1e-6) continue;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((pt.x - oe.from.x) * (oe.to.x - oe.from.x) +
            (pt.y - oe.from.y) * (oe.to.y - oe.from.y)) /
            len2
        )
      );
      const proj = {
        x: oe.from.x + t * (oe.to.x - oe.from.x),
        y: oe.from.y + t * (oe.to.y - oe.from.y)
      };
      const d = dist(pt, proj);
      if (d <= bestD) {
        bestD = d;
        bestPt = { x: +proj.x.toFixed(3), y: +proj.y.toFixed(3) };
      }
    }
    if (bestPt) return bestPt;

    for (let j = 0; j < mergedSkel.length; j++) {
      if (j === selfIdx) continue;
      const other = mergedSkel[j];
      const len2 = (other.to.x - other.from.x) ** 2 + (other.to.y - other.from.y) ** 2;
      if (len2 < 1e-6) continue;
      const t = Math.max(
        0,
        Math.min(
          1,
          ((pt.x - other.from.x) * (other.to.x - other.from.x) +
            (pt.y - other.from.y) * (other.to.y - other.from.y)) /
            len2
        )
      );
      const proj = {
        x: other.from.x + t * (other.to.x - other.from.x),
        y: other.from.y + t * (other.to.y - other.from.y)
      };
      const d = dist(pt, proj);
      if (d <= bestD) {
        bestD = d;
        bestPt = { x: +proj.x.toFixed(3), y: +proj.y.toFixed(3) };
      }
    }
    return bestPt || pt;
  };

  const workingSkel = mergedSkel.map((s, idx) => ({
    ...s,
    from: snapManualEndpoint(s.from, idx),
    to: snapManualEndpoint(s.to, idx)
  }));

  const nodes: Point2D[] = [];
  const getOrAddNode = (pt: Point2D): number => {
    const idx = nodes.findIndex((n) => dist(n, pt) < 0.065);
    if (idx >= 0) return idx;
    nodes.push({ x: +pt.x.toFixed(3), y: +pt.y.toFixed(3) });
    return nodes.length - 1;
  };

  const rawSegs: {
    a: Point2D;
    b: Point2D;
    meta: PlanarGraphEdgeMeta;
  }[] = [
    ...allOutlineEdges.map((e) => ({
      a: e.from,
      b: e.to,
      meta: {
        outlineEdge: e,
        edgeType: e.type,
        isOutlineEdge: true,
        isClassified: e.type !== 'unclassified'
      }
    })),
    ...workingSkel.map((s) => ({
      a: s.from,
      b: s.to,
      meta: {
        skeletonLine: s,
        edgeType: s.suggestedType,
        isOutlineEdge: false,
        isClassified: s.suggestedType !== 'unclassified'
      }
    }))
  ].filter((seg) => dist(seg.a, seg.b) > 0.05);

  rawSegs.forEach((seg) => {
    getOrAddNode(seg.a);
    getOrAddNode(seg.b);
  });

  // Interior skeleton × skeleton crossing nodes
  for (let i = 0; i < workingSkel.length; i++) {
    for (let j = i + 1; j < workingSkel.length; j++) {
      const s1 = workingSkel[i];
      const s2 = workingSkel[j];
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

  // Outline/hole edge × skeleton crossing nodes (handles T-junctions & bay valleys hitting eave interior)
  for (const oe of allOutlineEdges) {
    for (const sk of workingSkel) {
      const inter = lineLineIntersection(oe.from, oe.to, sk.from, sk.to);
      if (
        inter &&
        distToSegment(inter, oe.from, oe.to) < 0.08 &&
        distToSegment(inter, sk.from, sk.to) < 0.08
      ) {
        getOrAddNode(inter);
      }
    }
  }

  const adj = new Map<number, Set<number>>();
  nodes.forEach((_, idx) => adj.set(idx, new Set<number>()));
  const edgeMetaByKey = new Map<string, PlanarGraphEdgeMeta>();

  rawSegs.forEach((seg) => {
    const segLen = dist(seg.a, seg.b) || 1;
    const ux = (seg.b.x - seg.a.x) / segLen;
    const uy = (seg.b.y - seg.a.y) / segLen;

    const onSeg: { idx: number; proj: number }[] = [];
    nodes.forEach((pt, idx) => {
      if (distToSegment(pt, seg.a, seg.b) <= 0.075) {
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
        const key = planarEdgeKey(u, v);
        const prev = edgeMetaByKey.get(key);
        if (!prev || (!prev.isOutlineEdge && seg.meta.isOutlineEdge)) {
          edgeMetaByKey.set(key, seg.meta);
        }
      }
    }
  });

  // Iteratively prune degree-1 interior stubs not anchored to any outer or courtyard boundary
  const isOnOutline = (pt: Point2D): boolean =>
    allOutlineEdges.some((oe) => distToSegment(pt, oe.from, oe.to) <= 0.09);

  let pruned = true;
  while (pruned) {
    pruned = false;
    for (let idx = 0; idx < nodes.length; idx++) {
      const nbrs = adj.get(idx);
      if (nbrs && nbrs.size === 1 && !isOnOutline(nodes[idx])) {
        const onlyNb = Array.from(nbrs)[0];
        adj.get(onlyNb)?.delete(idx);
        nbrs.clear();
        pruned = true;
      }
    }
  }

  return {
    nodes,
    adj,
    edgeMetaByKey,
    workingSkel,
    outlineSignedArea: signedPolyArea(outline.points)
  };
}

function traceMinimalCycleFromDirectedPair(
  graph: PlanarFaceGraph,
  outline: RoofOutline,
  uStart: number,
  vStart: number,
  interiorIsLeft: boolean
): number[] | null {
  const { nodes, adj } = graph;
  const cycleIndices: number[] = [uStart, vStart];
  let prevIdx = uStart;
  let currIdx = vStart;
  const TWO_PI = Math.PI * 2;
  const MAX_STEPS = 48;

  for (let step = 0; step < MAX_STEPS; step++) {
    const prevPt = nodes[prevIdx];
    const currPt = nodes[currIdx];
    const inAngle = Math.atan2(prevPt.y - currPt.y, prevPt.x - currPt.x);

    const neighbors = Array.from(adj.get(currIdx) || []).filter((nb) => nb !== prevIdx);
    if (neighbors.length === 0) return null;

    let bestNb = -1;
    let bestDelta = Infinity;

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
  const poly = cycleIndices.map((idx) => nodes[idx]);
  if (polygonArea(poly) <= 0.05) return null;
  const c = polygonCentroid(poly);
  if (!isPointInOutlineDomain(c, outline)) return null;
  // Never emit a cycle enclosing an inner courtyard hole
  if (
    (outline.holes || []).some(
      (h) => h.points.length >= 3 && isPointInPolygon(polygonCentroid(h.points), poly)
    )
  ) {
    return null;
  }
  return cycleIndices;
}

function canonicalCycleKey(cycle: number[]): string {
  const minVal = Math.min(...cycle);
  const pos = cycle.indexOf(minVal);
  const rotFwd = [...cycle.slice(pos), ...cycle.slice(0, pos)];
  const rev = [...cycle].reverse();
  const rPos = rev.indexOf(minVal);
  const rotRev = [...rev.slice(rPos), ...rev.slice(0, rPos)];
  const s1 = rotFwd.join(',');
  const s2 = rotRev.join(',');
  return s1 < s2 ? s1 : s2;
}

function traceSubFacesForDirectedEdge(
  graph: PlanarFaceGraph,
  outline: RoofOutline,
  edgeFrom: Point2D,
  edgeTo: Point2D
): { subFrom: Point2D; subTo: Point2D; polygon: Point2D[]; cycleKey: string }[] {
  const dx = edgeTo.x - edgeFrom.x;
  const dy = edgeTo.y - edgeFrom.y;
  const edgeLen = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / edgeLen, y: dy / edgeLen };
  const leftNorm = { x: -dir.y, y: dir.x };
  const rightNorm = { x: dir.y, y: -dir.x };
  const mid = { x: (edgeFrom.x + edgeTo.x) / 2, y: (edgeFrom.y + edgeTo.y) / 2 };
  const leftIn = isPointInOutlineDomain(
    { x: mid.x + leftNorm.x * 0.08, y: mid.y + leftNorm.y * 0.08 },
    outline
  );
  const rightIn = isPointInOutlineDomain(
    { x: mid.x + rightNorm.x * 0.08, y: mid.y + rightNorm.y * 0.08 },
    outline
  );
  const interiorIsLeft = leftIn || !rightIn;

  const edgeNodes = graph.nodes
    .map((pt, idx) => ({
      idx,
      pt,
      proj: (pt.x - edgeFrom.x) * dir.x + (pt.y - edgeFrom.y) * dir.y
    }))
    .filter((item) => distToSegment(item.pt, edgeFrom, edgeTo) <= 0.08)
    .sort((a, b) => a.proj - b.proj);

  if (edgeNodes.length < 2) return [];

  const edgeNodeSet = new Set(edgeNodes.map((n) => n.idx));
  const seenCycles = new Set<string>();
  const results: { subFrom: Point2D; subTo: Point2D; polygon: Point2D[]; cycleKey: string }[] = [];

  for (let k = 0; k < edgeNodes.length - 1; k++) {
    const u = edgeNodes[k].idx;
    const v = edgeNodes[k + 1].idx;
    if (!graph.adj.get(u)?.has(v)) continue;

    const cycle = traceMinimalCycleFromDirectedPair(graph, outline, u, v, interiorIsLeft);
    if (!cycle) continue;

    const key = canonicalCycleKey(cycle);
    if (seenCycles.has(key)) continue;
    seenCycles.add(key);

    // Find maximal contiguous span of edgeNodes lying consecutively along this cycle
    // so an unsplit edge preserves exact [edgeFrom, edgeTo, ...interior] ordering.
    const posU = cycle.indexOf(u);
    const n = cycle.length;
    const rotated = [...cycle.slice(posU), ...cycle.slice(0, posU)];

    let spanStart = 0;
    while (
      spanStart + 1 < n &&
      edgeNodeSet.has(rotated[n - 1 - spanStart])
    ) {
      spanStart++;
    }
    const finalRot =
      spanStart > 0
        ? [...rotated.slice(n - spanStart), ...rotated.slice(0, n - spanStart)]
        : rotated;

    let runLen = 1;
    while (runLen < finalRot.length && edgeNodeSet.has(finalRot[runLen])) {
      runLen++;
    }

    const subFromIdx = finalRot[0];
    const subToIdx = finalRot[runLen - 1];
    const subFrom = pointsClose(graph.nodes[subFromIdx], edgeFrom, 0.08)
      ? edgeFrom
      : graph.nodes[subFromIdx];
    const subTo = pointsClose(graph.nodes[subToIdx], edgeTo, 0.08)
      ? edgeTo
      : graph.nodes[subToIdx];

    const interiorPts = finalRot.slice(runLen).map((idx) => graph.nodes[idx]);
    const poly: Point2D[] = [subFrom, subTo, ...interiorPts];
    if (poly.length >= 3 && polygonArea(poly) > 0.05) {
      results.push({ subFrom, subTo, polygon: poly, cycleKey: key });
    }
  }

  return results;
}

function traceFacePolygonPlanar(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  eaveEdge: PlanEdge
): Point2D[] | null {
  const graph = buildPlanarFaceGraph(outline, skeleton);
  if (!graph) return null;
  const subFaces = traceSubFacesForDirectedEdge(graph, outline, eaveEdge.from, eaveEdge.to);
  return subFaces.length > 0 ? subFaces[0].polygon : null;
}

function findUncoveredClassifiedFaces(
  graph: PlanarFaceGraph,
  outline: RoofOutline,
  alreadyCoveredKeys: Set<string>,
  alreadyCoveredCentroids: Point2D[],
  alreadyCoveredPolys: Point2D[][],
  suppressedSet: Set<string> | null
): { baselineFrom: Point2D; baselineTo: Point2D; polygon: Point2D[]; loopEdgeId: string; cycleKey: string }[] {
  const results: {
    baselineFrom: Point2D;
    baselineTo: Point2D;
    polygon: Point2D[];
    loopEdgeId: string;
    cycleKey: string;
  }[] = [];
  const seenKeys = new Set<string>(alreadyCoveredKeys);

  const tryDirectedPair = (u: number, v: number) => {
    const cycle = traceMinimalCycleFromDirectedPair(graph, outline, u, v, true);
    if (!cycle || cycle.length < 3) return;
    const key = canonicalCycleKey(cycle);
    if (seenKeys.has(key)) return;

    const poly = cycle.map((idx) => graph.nodes[idx]);
    // Interior minimal faces with left-turn traversal MUST wind CCW (positive signed area).
    // The unbounded outer perimeter loop winds CW (negative signed area) and must be rejected.
    if (signedPolyArea(poly) <= 0.05) return;

    const cent = polygonCentroid(poly);
    if (!isPointInOutlineDomain(cent, outline)) return;
    if (
      (outline.holes || []).some(
        (h) => h.points.length >= 3 && isPointInPolygon(polygonCentroid(h.points), poly)
      )
    ) {
      return;
    }

    // Reject any candidate that duplicates or overlaps an already-emitted plane
    if (
      alreadyCoveredCentroids.some((c) => dist(c, cent) < 0.15) ||
      alreadyCoveredPolys.some(
        (ep) => isPointInPolygon(cent, ep) || isPointInPolygon(polygonCentroid(ep), poly)
      )
    ) {
      return;
    }

    // Verify all boundary segments are classified & check suppression against owning outline edges
    let allClassified = true;
    let suppressed = false;
    let bestBaselineScore = -Infinity;
    let bestSegIdx = 0;

    for (let i = 0; i < cycle.length; i++) {
      const a = cycle[i];
      const b = cycle[(i + 1) % cycle.length];
      const meta = graph.edgeMetaByKey.get(planarEdgeKey(a, b));
      if (!meta || !meta.isClassified) {
        allClassified = false;
        break;
      }
      if (meta.outlineEdge && suppressedSet?.has(meta.outlineEdge.id)) {
        suppressed = true;
        break;
      }

      const len = dist(graph.nodes[a], graph.nodes[b]);
      // Prioritize lower/eave/verge/wall edge as baseline [0]->[1], NEVER prefer 'ridge' when non-ridge exists
      const typeWeight =
        meta.edgeType === 'outline' || meta.edgeType === 'eave'
          ? 1000
          : meta.edgeType === 'verge' || meta.edgeType === 'rake' || meta.edgeType === 'barge'
          ? 500
          : meta.edgeType === 'wall' || meta.edgeType === 'apron' || meta.edgeType === 'change-of-pitch'
          ? 400
          : meta.edgeType === 'ridge'
          ? -500
          : 100;
      const score = typeWeight + len;
      if (score > bestBaselineScore) {
        bestBaselineScore = score;
        bestSegIdx = i;
      }
    }

    if (!allClassified || suppressed) return;

    // Canonical deterministic loop ID from rounded vertex coordinates
    const hashPts = [...poly]
      .sort((p1, p2) => (Math.abs(p1.x - p2.x) > 0.05 ? p1.x - p2.x : p1.y - p2.y))
      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join('|');
    const loopEdgeId = `loop-${hashPts}`;
    if (suppressedSet?.has(loopEdgeId)) return;

    const rotatedPoly = [...poly.slice(bestSegIdx), ...poly.slice(0, bestSegIdx)];
    seenKeys.add(key);
    results.push({
      baselineFrom: rotatedPoly[0],
      baselineTo: rotatedPoly[1],
      polygon: rotatedPoly,
      loopEdgeId,
      cycleKey: key
    });
  };

  graph.adj.forEach((nbrs, u) => {
    nbrs.forEach((v) => {
      if (u < v) {
        tryDirectedPair(u, v);
        tryDirectedPair(v, u);
      }
    });
  });

  return results;
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
  },
  options?: {
    suppressedEdgeIds?: string[];
    ignoreSuppressed?: boolean;
  }
): RoofPlane[] {
  const prevByEdge = new Map(existingPlanes.map((p) => [p.eaveEdgeId, p]));
  const suppressedSet =
    options?.ignoreSuppressed || !options?.suppressedEdgeIds
      ? null
      : new Set(options.suppressedEdgeIds);
  const result: RoofPlane[] = [];

  const graph = buildPlanarFaceGraph(outline, skeleton);
  const coveredCycleKeys = new Set<string>();
  const coveredGeomKeys = new Set<string>();
  const coveredCentroids: Point2D[] = [];
  const coveredPolys: Point2D[][] = [];
  const allOutlineEdges = getAllOutlineEdges(outline);

  const pushPlaneFromSpec = (
    edge: PlanEdge,
    precomputedPoly?: Point2D[],
    fallbackIdx = 0
  ) => {
    if (suppressedSet && suppressedSet.has(edge.id)) return;
    const existing = prevByEdge.get(edge.id);
    const resolvedEaveHeight =
      edge.eaveHeightM ?? existing?.eaveHeightM ?? levelMeta?.defaultEaveHeightM ?? 2.7;

    const plane = createPlaneFromEdge(outline, skeleton, edge, {
      pitchDeg: existing?.pitchDeg ?? defaultPitchDeg,
      underlapSide: existing?.underlapSide ?? (fallbackIdx % 2 === 0 ? 'left' : 'right'),
      eaveHeightM: resolvedEaveHeight,
      orderedSheetLengthM: existing?.orderedSheetLengthM,
      sheetRunEdgeId: existing?.sheetRunEdgeId,
      name: existing?.name,
      existingId: existing?.id,
      isStartEdge: existing?.isStartEdge,
      existingPlanesCount: (levelMeta?.paletteOffset || 0) + result.length,
      levelId: levelMeta?.levelId ?? existing?.levelId ?? edge.levelId ?? outline.levelId,
      levelCode: levelMeta?.levelCode ?? existing?.levelCode,
      levelName: levelMeta?.levelName ?? existing?.levelName,
      precomputedPolygon: precomputedPoly
    });

    if (plane.planPolygon.length >= 3) {
      const cent = polygonCentroid(plane.planPolygon);
      if (!isPointInOutlineDomain(cent, outline)) return;
      if (
        (outline.holes || []).some(
          (h) =>
            h.points.length >= 3 &&
            isPointInPolygon(polygonCentroid(h.points), plane.planPolygon)
        )
      ) {
        return;
      }
      const gKey = canonicalPlanePolygonKey(plane.planPolygon);
      if (gKey && coveredGeomKeys.has(gKey)) return;
      if (gKey) coveredGeomKeys.add(gKey);
      coveredCentroids.push(cent);
      coveredPolys.push(plane.planPolygon);
      result.push(plane);
    }
  };

  // 1. Primary classified outer & courtyard Eave ('outline') edges — supporting interior T-junction splits cleanly
  allOutlineEdges.forEach((edge, idx) => {
    if (edge.type !== 'outline') return;
    if (suppressedSet && suppressedSet.has(edge.id)) return;

    if (graph && skeleton.length > 0) {
      const subFaces = traceSubFacesForDirectedEdge(graph, outline, edge.from, edge.to);
      if (subFaces.length > 0) {
        subFaces.forEach((sub, subIdx) => {
          const subEdgeId = subIdx === 0 ? edge.id : `${edge.id}__sub${subIdx}`;
          if (suppressedSet && suppressedSet.has(subEdgeId)) return;
          coveredCycleKeys.add(sub.cycleKey);
          const subEdge: PlanEdge = {
            ...edge,
            id: subEdgeId,
            from: sub.subFrom,
            to: sub.subTo
          };
          pushPlaneFromSpec(subEdge, sub.polygon, idx + subIdx);
        });
        return;
      }
      // When explicit skeleton lines exist and an edge fails to trace a closed loop, do NOT emit synthetic barge wedges
      return;
    }

    pushPlaneFromSpec(edge, undefined, idx);
  });

  // 2. Interior classified Eave skeleton lines (for bays/wings defined inside outline via skeleton 'eave' lines)
  if (graph && skeleton.length > 0) {
    skeleton
      .filter((s) => s.suggestedType === 'eave')
      .forEach((sk, idx) => {
        if (suppressedSet && suppressedSet.has(sk.id)) return;
        const subFaces = traceSubFacesForDirectedEdge(graph, outline, sk.from, sk.to);
        subFaces.forEach((sub, subIdx) => {
          if (coveredCycleKeys.has(sub.cycleKey)) return;
          coveredCycleKeys.add(sub.cycleKey);
          const vId = subIdx === 0 ? sk.id : `${sk.id}__sub${subIdx}`;
          const virtualEave: PlanEdge = {
            id: vId,
            from: sub.subFrom,
            to: sub.subTo,
            type: 'outline',
            eaveHeightM: levelMeta?.defaultEaveHeightM,
            levelId: levelMeta?.levelId ?? outline.levelId
          };
          pushPlaneFromSpec(virtualEave, sub.polygon, idx + subIdx);
        });
      });

    // 3. Remaining uncovered classified minimal loops (e.g. triangular corner panels or closed gable/hip bays)
    const activeEaveCount = allOutlineEdges.filter((e) => e.type === 'outline').length;
    const hasStructuralSkel = skeleton.some(
      (s) =>
        s.suggestedType === 'eave' ||
        s.suggestedType === 'ridge' ||
        s.suggestedType === 'valley' ||
        s.suggestedType === 'hip'
    );
    if (activeEaveCount > 0 || hasStructuralSkel) {
      const uncovered = findUncoveredClassifiedFaces(
        graph,
        outline,
        coveredCycleKeys,
        coveredCentroids,
        coveredPolys,
        suppressedSet
      );
      uncovered.forEach((uFace, uIdx) => {
        const baselineEdge: PlanEdge = {
          id: uFace.loopEdgeId,
          from: uFace.baselineFrom,
          to: uFace.baselineTo,
          type: 'outline',
          eaveHeightM: levelMeta?.defaultEaveHeightM,
          levelId: levelMeta?.levelId ?? outline.levelId
        };
        coveredCycleKeys.add(uFace.cycleKey);
        pushPlaneFromSpec(baselineEdge, uFace.polygon, result.length + uIdx);
      });
    }
  }

  return deduplicateRoofPlanes(result);
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
    precomputedPolygon?: Point2D[];
  }
): RoofPlane {
  const pitchDeg = options.pitchDeg ?? 22.5;
  const underlapSide = options.underlapSide ?? 'left';
  const eaveHeightM = +(options.eaveHeightM ?? eaveEdge.eaveHeightM ?? 2.7).toFixed(2);
  const allEdges = getAllOutlineEdges(outline);
  const sheetRunEdge =
    (options.sheetRunEdgeId
      ? allEdges.find((e) => e.id === options.sheetRunEdgeId)
      : undefined) || eaveEdge;

  // Build polygon cycle around eave edge (either precomputed classified loop or direct trace)
  const polygon =
    options.precomputedPolygon && options.precomputedPolygon.length >= 3
      ? options.precomputedPolygon
      : traceFacePolygon(outline, skeleton, eaveEdge);

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
  const edgeIdx = allEdges.findIndex((e) => e.id === eaveEdge.id);
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

function traceFacePolygon(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  eaveEdge: PlanEdge
): Point2D[] {
  const allOutlineEdges = getAllOutlineEdges(outline);
  const activeEavesCount = allOutlineEdges.filter((e) => e.type === 'outline').length;

  // When skeleton lines exist (manual or auto), trace closed planar faces ONLY (zero synthetic barge wedges)
  if (skeleton.length > 0) {
    const planarPoly = traceFacePolygonPlanar(outline, skeleton, eaveEdge);
    if (planarPoly && planarPoly.length >= 3) {
      return planarPoly;
    }
    return [];
  }

  // True single-slope / monopitch sweep across full footprint ONLY when <= 1 eave exists, no holes, and no skeleton splits it
  if (
    outline.points.length >= 3 &&
    (!outline.holes || outline.holes.length === 0) &&
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
  const isIn = isPointInOutlineDomain(testPt, outline);
  const inwardNorm: Point2D = isIn ? normal : { x: -normal.x, y: -normal.y };

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
      const matchedOutline = getAllOutlineEdges(outline).find(
        (oe) =>
          distToSegment(p1, oe.from, oe.to) < 0.15 &&
          distToSegment(p2, oe.from, oe.to) < 0.15
      );
      if (matchedOutline) {
        if (
          matchedOutline.type === 'wall' ||
          matchedOutline.type === 'apron' ||
          matchedOutline.type === 'change-of-pitch'
        ) {
          result.push({ edgeId, type: 'wall' });
          continue;
        }
        if (matchedOutline.type === 'verge' || matchedOutline.type === 'rake') {
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
      const mappedType: 'eave' | 'ridge' | 'hip' | 'valley' | 'verge' | 'wall' =
        skelMatch.suggestedType === 'ridge' ||
        skelMatch.suggestedType === 'hip' ||
        skelMatch.suggestedType === 'valley' ||
        skelMatch.suggestedType === 'eave'
          ? skelMatch.suggestedType
          : skelMatch.suggestedType === 'wall' ||
            skelMatch.suggestedType === 'apron' ||
            skelMatch.suggestedType === 'change-of-pitch'
          ? 'wall'
          : 'verge';
      result.push({ edgeId, type: mappedType });
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
    sheetOrderMode?: SheetOrderMode;
  }
): LayoutResult {
  const cover = sheetSpec.coverWidth || 0.762;
  const maxLen = sheetSpec.maxLength || 6.0;
  const sheetOrderMode: SheetOrderMode = options?.sheetOrderMode || 'practical';

  const dedupedInput = deduplicateRoofPlanes(planesInput);
  const hasAssetsOrBreaks =
    (options?.assets && options.assets.length > 0) ||
    (options?.pitchBreaks && options.pitchBreaks.length > 0);
  const planes = hasAssetsOrBreaks
    ? resolveEffectivePlanesWithAssets(dedupedInput, options?.assets || [], options?.pitchBreaks || [])
    : dedupedInput;

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

  // Step 2: Sheet Ordering Strategy
  // - 'practical' (DEFAULT): Simple site cut lists. Clusters non-override runs into 1-3 practical
  //   stock order lengths (quantized up to 10mm increments, merging lengths within 600mm, and adding a
  //   2nd/3rd shorter length only when it saves >= 4.0 lm AND >= 4% ordered metres). Shorter runs and
  //   diagonal/linear offcuts cut down from those shared stock lengths. Site overrides stay exact 1mm.
  // - 'optimized' (OPT-IN): Tight multi-length diagonal/linear repress nesting for minimum steel lm.
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
  const ceil10mm = (lenM: number) => {
    const mm = Math.max(100, Math.round(lenM * 1000));
    const rounded10Mm = Math.ceil(mm / 10) * 10;
    const capMm = Math.max(mm, Math.round(maxLen * 1000));
    return +(Math.min(capMm, rounded10Mm) / 1000).toFixed(3);
  };
  const KERF_LIN = 0.02;

  const derivedOrSplitPlaneIds = new Set(
    orderedPlanes
      .filter((p) => p.isVirtualAssetPlane || p.pitchZoneRole === 'lower_apron' || p.pitchZoneRole === 'upper_main')
      .map((p) => p.id)
  );
  const isAssetSplitOrDerived = (item: NeededSheetStrip): boolean =>
    Boolean(item.splitFromAssetId) || derivedOrSplitPlaneIds.has(item.planeId);

  const levelRings = new Map<string, RoofPlane[]>();
  orderedMain.forEach((p) => {
    const key = p.levelId || 'level-1';
    const arr = levelRings.get(key) || [];
    arr.push(p);
    levelRings.set(key, arr);
  });

  if (sheetOrderMode === 'practical') {
    /**
     * PRACTICAL SHEET ORDERING (DEFAULT)
     * 1. Partition site-measured overrides (`hasOrderedOverride`) into exact-1mm isolated buckets.
     * 2. For standard (non-override) pieces:
     *    - Collect each plane's max sheet need quantized UP to 10mm (`ceil10mm`).
     *    - Merge candidates within `600mm` upward into the longer run so trivial variations don't
     *      create fragmented bundles.
     *    - Start with 1 length `[L_max]` and greedily admit up to `MAX_PRACTICAL_LENGTHS = 3`
     *      shorter shared lengths ONLY when adding a length saves >= 4.0 lm AND >= 4% total steel.
     * 3. Pack pieces strictly onto the chosen stock lengths (never inventing oddball lengths):
     *    - Diagonal 180° hip/rake offcut pairs only emit a sheet at a chosen stock length `L`.
     *    - Linear tails on open sheets accept shorter runs cleanly (cut-down from ordered stock).
     */
    const MIN_CLUSTER_SEPARATION_M = 0.6;
    const MAX_PRACTICAL_LENGTHS = 3;
    const MIN_SAVINGS_ABS_LM = 4.0;
    const MIN_SAVINGS_PCT = 0.04;

    const overrideIndices = allNeededPieces
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => Boolean(item.hasOrderedOverride && item.targetOrderedLen));
    const standardIndices = allNeededPieces
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !(item.hasOrderedOverride && item.targetOrderedLen));

    const runPracticalPacking = (
      stockLengthsDesc: number[],
      commitOutput: boolean
    ): { totalOrderedLm: number } => {
      const stocksAsc = [...stockLengthsDesc].sort((a, b) => a - b);
      const minStockFor = (neededLen: number): number | null => {
        for (const s of stocksAsc) {
          if (s >= neededLen - 0.0005) return s;
        }
        return stocksAsc.length > 0 ? stocksAsc[stocksAsc.length - 1] : null;
      };

      const localPaired = new Set<number>();
      let localSheetNum = sheetNumberCounter;
      let totalLmAccum = 0;

      interface LocalParentState {
        parentIdx: number;
        sheetNumber: number;
        length: number;
        linearRemaining: number;
        pitchDeg: number;
        isOverride: boolean;
        targetOrderedLen?: number;
        primaryPlaneId: string;
        primaryPlaneName: string;
        color: string;
        midSum: number;
      }
      const localParents: LocalParentState[] = [];

      const recordPair = (
        p1Idx: number,
        p2Idx: number,
        stockLen: number,
        ruleApplied: TransferredPieceInfo['ruleApplied'],
        isOverridePair: boolean
      ) => {
        const p1 = allNeededPieces[p1Idx];
        const p2 = allNeededPieces[p2Idx];
        localPaired.add(p1Idx);
        localPaired.add(p2Idx);
        totalLmAccum += stockLen;

        const sheetNum = localSheetNum++;
        const midSum = p1.midLength + p2.midLength;
        const linearRemaining = +Math.max(0, stockLen - (p1.cutLength + p2.cutLength)).toFixed(3);
        const color = PARENT_PALETTE[(sheetNum - 1) % PARENT_PALETTE.length];

        localParents.push({
          parentIdx: commitOutput ? parentSheets.length : localParents.length,
          sheetNumber: sheetNum,
          length: stockLen,
          linearRemaining,
          pitchDeg: p1.pitchDeg,
          isOverride: isOverridePair,
          targetOrderedLen: isOverridePair ? stockLen : undefined,
          primaryPlaneId: p1.planeId,
          primaryPlaneName: p1.planeName,
          color,
          midSum
        });

        if (!commitOutput) return;

        pairedPieceIndices.add(p1Idx);
        pairedPieceIndices.add(p2Idx);
        sheetNumberCounter = localSheetNum;

        const parentId = `parent-sheet-${sheetNum}`;
        const stockMm = Math.round(stockLen * 1000);
        const cutNote1 =
          Math.round(p1.cutLength * 1000) < stockMm - 2
            ? `Cut ${Math.round(p1.cutLength * 1000)}mm from ${stockMm}mm (${p1.planeName})`
            : `Ordered run on ${p1.planeName} – diagonal offcut repressed into ${p2.planeName}`;
        const cutNote2 =
          p1.planeId !== p2.planeId
            ? `Repressed 180° offcut (${Math.round(p2.cutLength * 1000)}mm) from ${p1.planeName} (${stockMm}mm)`
            : `Opposite hip 180° offcut (${Math.round(p2.cutLength * 1000)}mm) from ${p1.planeName}`;

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
          note: cutNote1
        };

        const piece2: CutPiece = {
          id: `piece-${p2.planeId}-${p2.colIndex}-${p2.segIndex}`,
          parentSheetId: parentId,
          length: p2.cutLength,
          width: p2.colWidth,
          cutFrom: quantizeMm(Math.max(0, stockLen - p2.cutLength)),
          orientation: 'flipped180',
          targetPlaneId: p2.planeId,
          placement: { origin: { x: p2.uCenter, y: p2.minV }, rotation: 180, flipped: true },
          underlapSide: p2.underlapSide,
          facetName: p2.planeName,
          colIndex: p2.colIndex,
          minV: p2.minV,
          maxV: p2.maxV,
          splitFromAssetId: p2.splitFromAssetId,
          note: cutNote2
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

        const parentSheet: ParentSheet = {
          id: parentId,
          sheetNumber: sheetNum,
          length: stockLen,
          color,
          pieces: [piece1, piece2],
          remaining: +Math.max(0, stockLen - midSum).toFixed(3),
          utilization: +Math.min(100, (midSum / stockLen) * 100).toFixed(1)
        };

        parentSheets.push(parentSheet);
        parentMetaByIndex.push({
          linearRemaining,
          hasOrderedOverride: isOverridePair,
          targetOrderedLen: isOverridePair ? stockLen : undefined,
          pitchDeg: p1.pitchDeg,
          underlapSide: p1.underlapSide,
          midSum
        });
        placedPieces.push(piece1, piece2);

        addToPlacementMap(placementMap, p1.planeId, {
          pieceId: piece1.id,
          parentId,
          parentSheetNumber: sheetNum,
          length: piece1.length,
          isOffcut: false,
          orientation: 'normal',
          note: cutNote1,
          color
        });

        addToPlacementMap(placementMap, p2.planeId, {
          pieceId: piece2.id,
          parentId,
          parentSheetNumber: sheetNum,
          length: piece2.length,
          isOffcut: true,
          orientation: 'flipped180',
          note: `➔ ${cutNote2}`,
          color
        });
      };

      const recordSingleOrLinear = (itemIdx: number, fixedStockLen: number, isOverrideItem: boolean) => {
        const item = allNeededPieces[itemIdx];
        localPaired.add(itemIdx);

        // Try packing linearly into an already-allocated sheet tail within same override/pitch bucket
        let donorStateIdx = -1;
        let bestWasteLeft = Infinity;
        for (let si = 0; si < localParents.length; si++) {
          const st = localParents[si];
          if (st.isOverride !== isOverrideItem) continue;
          if (isOverrideItem && Math.abs((st.targetOrderedLen || st.length) - fixedStockLen) > 0.001) continue;
          if (st.linearRemaining < item.cutLength + KERF_LIN) continue;
          if (Math.abs(st.pitchDeg - item.pitchDeg) > 0.5) continue;
          const wasteLeft = st.linearRemaining - (item.cutLength + KERF_LIN);
          if (wasteLeft < bestWasteLeft) {
            bestWasteLeft = wasteLeft;
            donorStateIdx = si;
          }
        }

        if (donorStateIdx >= 0) {
          const st = localParents[donorStateIdx];
          const cutFrom = quantizeMm(st.length - st.linearRemaining);
          st.linearRemaining = +Math.max(0, st.linearRemaining - item.cutLength - KERF_LIN).toFixed(3);
          st.midSum += item.midLength;

          if (!commitOutput) return;
          pairedPieceIndices.add(itemIdx);
          const donorParent = parentSheets[st.parentIdx];
          const donorMeta = parentMetaByIndex[st.parentIdx];
          const stockMm = Math.round(donorParent.length * 1000);
          const cutMm = Math.round(item.cutLength * 1000);

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
            note: `Cut ${cutMm}mm from tail of Stock #${donorParent.sheetNumber} (${stockMm}mm)`
          };

          donorParent.pieces.push(repressedPiece);
          donorMeta.linearRemaining = st.linearRemaining;
          donorMeta.midSum = st.midSum;
          donorParent.remaining = +Math.max(0, donorParent.length - st.midSum).toFixed(3);
          donorParent.utilization = +Math.min(100, (st.midSum / donorParent.length) * 100).toFixed(1);
          placedPieces.push(repressedPiece);

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

          if (st.primaryPlaneId !== item.planeId) {
            transferMatrix[st.primaryPlaneId][item.planeId] =
              (transferMatrix[st.primaryPlaneId][item.planeId] || 0) + 1;
            const srcPlane = orderedPlanes.find((p) => p.id === st.primaryPlaneId);
            offcutTransfers.push({
              sourcePlaneId: st.primaryPlaneId,
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
          return;
        }

        // Open a new sheet strictly at fixedStockLen
        const sheetNum = localSheetNum++;
        totalLmAccum += fixedStockLen;
        const linearRemaining = +Math.max(0, fixedStockLen - item.cutLength).toFixed(3);
        const color = PARENT_PALETTE[(sheetNum - 1) % PARENT_PALETTE.length];

        localParents.push({
          parentIdx: commitOutput ? parentSheets.length : localParents.length,
          sheetNumber: sheetNum,
          length: fixedStockLen,
          linearRemaining,
          pitchDeg: item.pitchDeg,
          isOverride: isOverrideItem,
          targetOrderedLen: isOverrideItem ? fixedStockLen : undefined,
          primaryPlaneId: item.planeId,
          primaryPlaneName: item.planeName,
          color,
          midSum: item.midLength
        });

        if (!commitOutput) return;
        pairedPieceIndices.add(itemIdx);
        sheetNumberCounter = localSheetNum;

        const parentId = `parent-sheet-${sheetNum}`;
        const stockMm = Math.round(fixedStockLen * 1000);
        const cutMm = Math.round(item.cutLength * 1000);
        const pieceNote =
          cutMm < stockMm - 2
            ? `Cut ${cutMm}mm from ${stockMm}mm stock (#${sheetNum})`
            : item.splitFromAssetId
            ? `Cut around opening (#${sheetNum})`
            : `Direct run sheet #${sheetNum}`;

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
          note: pieceNote
        };

        const parentSheet: ParentSheet = {
          id: parentId,
          sheetNumber: sheetNum,
          length: fixedStockLen,
          color,
          pieces: [piece],
          remaining: +Math.max(0, fixedStockLen - item.midLength).toFixed(3),
          utilization: +Math.min(100, (item.midLength / fixedStockLen) * 100).toFixed(1)
        };

        parentSheets.push(parentSheet);
        parentMetaByIndex.push({
          linearRemaining,
          hasOrderedOverride: isOverrideItem,
          targetOrderedLen: isOverrideItem ? fixedStockLen : undefined,
          pitchDeg: item.pitchDeg,
          underlapSide: item.underlapSide,
          midSum: item.midLength
        });
        placedPieces.push(piece);

        addToPlacementMap(placementMap, item.planeId, {
          pieceId: piece.id,
          parentId,
          parentSheetNumber: sheetNum,
          length: piece.length,
          isOffcut: false,
          orientation: 'normal',
          note: pieceNote,
          color
        });
      };

      // A. Handle override pieces first (exact 1mm site-measured lengths never clustered)
      if (commitOutput && overrideIndices.length > 0) {
        const overrideRakes = overrideIndices
          .filter(({ item }) => item.isTriangularRake)
          .sort((a, b) => b.item.cutLength - a.item.cutLength);
        for (const { item: p1, idx: p1Idx } of overrideRakes) {
          if (localPaired.has(p1Idx)) continue;
          const fixedLen = quantizeMm(p1.targetOrderedLen!);
          let bestIdx = -1;
          let bestSavings = 0;
          for (const { item: p2, idx: p2Idx } of overrideRakes) {
            if (p2Idx === p1Idx || localPaired.has(p2Idx)) continue;
            if (Math.abs(p1.pitchDeg - p2.pitchDeg) > 0.5) continue;
            if (Math.abs((p2.targetOrderedLen || 0) - fixedLen) > 0.001) continue;
            if (!(p1.underlapSide !== p2.underlapSide || p1.planeId !== p2.planeId)) continue;
            const diagKerf = p1.shortLength > 0.25 && p2.shortLength > 0.25 ? 0.015 : 0;
            const nestedRaw = Math.max(p1.cutLength + p2.shortLength, p1.shortLength + p2.cutLength + diagKerf);
            if (nestedRaw > fixedLen + 0.001) continue;
            if (fixedLen >= 0.12 && fixedLen > bestSavings) {
              bestSavings = fixedLen;
              bestIdx = p2Idx;
            }
          }
          if (bestIdx >= 0) {
            recordPair(p1Idx, bestIdx, fixedLen, 'opposite_hip_same_slope', true);
          }
        }

        const remainingOverrides = overrideIndices
          .filter(({ idx }) => !localPaired.has(idx))
          .sort((a, b) => b.item.cutLength - a.item.cutLength);
        for (const { item, idx } of remainingOverrides) {
          if (localPaired.has(idx)) continue;
          recordSingleOrLinear(idx, quantizeMm(item.targetOrderedLen!), true);
        }
      }

      // B. Standard (non-override) Practical fixed-stock packing across stockLengthsDesc
      if (standardIndices.length > 0 && stocksAsc.length > 0) {
        const stdIndexSet = new Set(standardIndices.map((x) => x.idx));

        const evalPracticalDiagonal = (
          p1: NeededSheetStrip,
          p2: NeededSheetStrip
        ): { stockLen: number; savings: number } | null => {
          if (Math.abs(p1.pitchDeg - p2.pitchDeg) > 0.5) return null;
          const canFlip180 = p1.underlapSide !== p2.underlapSide || p1.planeId !== p2.planeId;
          if (!canFlip180) return null;

          const p1Taper = p1.cutLength - p1.shortLength;
          const p2Taper = p2.cutLength - p2.shortLength;
          if (p1Taper < 0.08 && p2Taper < 0.08) return null;

          const diagKerf = p1.shortLength > 0.25 && p2.shortLength > 0.25 ? 0.015 : 0;
          const nestedRaw = Math.max(
            p1.cutLength + p2.shortLength,
            p1.shortLength + p2.cutLength + diagKerf
          );
          const reqLen = Math.max(p1.cutLength, p2.cutLength, nestedRaw);
          const stockLen = minStockFor(reqLen);
          if (!stockLen || stockLen < reqLen - 0.0005) return null;

          const s1 = minStockFor(p1.cutLength) ?? stockLen;
          const s2 = minStockFor(p2.cutLength) ?? stockLen;
          const savings = +(s1 + s2 - stockLen).toFixed(3);
          if (savings < 0.12) return null;

          return { stockLen, savings };
        };

        // Pass 1: Adjacent Hip Exit -> Entry across level rings
        levelRings.forEach((ringPlanes) => {
          const ringLen = ringPlanes.length;
          if (ringLen < 2) return;
          for (let k = 0; k < ringLen; k++) {
            const srcPlane = ringPlanes[k];
            const tgtPlane = ringPlanes[(k + 1) % ringLen];
            if (!srcPlane || !tgtPlane || srcPlane.id === tgtPlane.id) continue;
            if (Math.abs(srcPlane.pitchDeg - tgtPlane.pitchDeg) > 0.5) continue;
            if (!arePlanesAdjacentAtHip(srcPlane, tgtPlane)) continue;

            const srcExit = standardIndices
              .filter(
                ({ item, idx }) =>
                  !localPaired.has(idx) &&
                  item.planeId === srcPlane.id &&
                  item.isTriangularRake &&
                  item.zoneRole === 'exit'
              )
              .sort((a, b) => b.item.cutLength - a.item.cutLength);

            for (const { item: p1, idx: p1Idx } of srcExit) {
              if (localPaired.has(p1Idx)) continue;
              let bestIdx = -1;
              let bestStockLen = 0;
              let bestScore = -Infinity;

              for (const { item: p2, idx: p2Idx } of standardIndices) {
                if (localPaired.has(p2Idx)) continue;
                if (p2.planeId !== tgtPlane.id || !p2.isTriangularRake || p2.zoneRole !== 'entry') continue;
                const fit = evalPracticalDiagonal(p1, p2);
                if (!fit) continue;
                const score = fit.savings * 100 - (fit.stockLen - (p1.midLength + p2.midLength)) * 10;
                if (score > bestScore) {
                  bestScore = score;
                  bestIdx = p2Idx;
                  bestStockLen = fit.stockLen;
                }
              }

              if (bestIdx >= 0) {
                recordPair(p1Idx, bestIdx, bestStockLen, 'adjacent_hip_run', false);
              }
            }
          }
        });

        // Pass 2: Remaining unpaired standard rakes
        const remainingRakes = standardIndices
          .filter(({ item, idx }) => item.isTriangularRake && !localPaired.has(idx))
          .sort((a, b) => b.item.cutLength - a.item.cutLength);

        for (const { item: p1, idx: p1Idx } of remainingRakes) {
          if (localPaired.has(p1Idx)) continue;
          let bestIdx = -1;
          let bestStockLen = 0;
          let highestScore = -Infinity;
          let bestRule: TransferredPieceInfo['ruleApplied'] = 'geometric_fallback';

          for (const { item: p2, idx: p2Idx } of remainingRakes) {
            if (p2Idx === p1Idx || localPaired.has(p2Idx)) continue;
            const fit = evalPracticalDiagonal(p1, p2);
            if (!fit) continue;

            const plane1 = orderedPlanes[p1.seqPos];
            const plane2 = orderedPlanes[p2.seqPos];
            const isAdjacentHip = plane1 && plane2 && arePlanesAdjacentAtHip(plane1, plane2);
            const isEndSlopeMatch = plane1 && plane2 && isMatchingEndSlopeSegment(plane1, plane2);
            const forwardDiff = (p2.seqPos - p1.seqPos + nPlanes) % nPlanes;

            let tierScore = 30000;
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
            }

            const score = tierScore + fit.savings * 2000;
            if (score > highestScore) {
              highestScore = score;
              bestIdx = p2Idx;
              bestStockLen = fit.stockLen;
              bestRule = rule;
            }
          }

          if (bestIdx >= 0) {
            recordPair(p1Idx, bestIdx, bestStockLen, bestRule, false);
          }
        }

        // Pass 2B: Asset splits & dormer/apron short diagonal pairs inside chosen stocks
        if (hasAssetsOrBreaks) {
          const splitCandidates = standardIndices
            .filter(
              ({ item, idx }) =>
                stdIndexSet.has(idx) &&
                !localPaired.has(idx) &&
                (isAssetSplitOrDerived(item) || item.cutLength <= maxLen * 0.58)
            )
            .sort((a, b) => b.item.cutLength - a.item.cutLength);

          for (const { item: p1, idx: p1Idx } of splitCandidates) {
            if (localPaired.has(p1Idx)) continue;
            let bestIdx = -1;
            let bestStockLen = 0;
            let bestSavings = 0;
            for (const { item: p2, idx: p2Idx } of splitCandidates) {
              if (p2Idx === p1Idx || localPaired.has(p2Idx)) continue;
              if (!isAssetSplitOrDerived(p1) && !isAssetSplitOrDerived(p2)) continue;
              const fit = evalPracticalDiagonal(p1, p2);
              if (fit && fit.savings > bestSavings) {
                bestSavings = fit.savings;
                bestStockLen = fit.stockLen;
                bestIdx = p2Idx;
              }
            }
            if (bestIdx >= 0) {
              recordPair(p1Idx, bestIdx, bestStockLen, 'geometric_fallback', false);
            }
          }
        }

        // Pass 3: Remaining unpaired standard pieces pack into open tails or open tightest chosen stock
        const remainingStd = standardIndices
          .filter(({ idx }) => !localPaired.has(idx))
          .sort((a, b) => b.item.cutLength - a.item.cutLength);
        for (const { item, idx } of remainingStd) {
          if (localPaired.has(idx)) continue;
          const chosenLen = minStockFor(item.cutLength)!;
          recordSingleOrLinear(idx, chosenLen, false);
        }
      }

      return { totalOrderedLm: +totalLmAccum.toFixed(3) };
    };

    // Build merged candidate stock lengths from non-override per-plane maxima (quantized UP to 10mm)
    let chosenStocks: number[] = [];
    if (standardIndices.length > 0) {
      const planeMaxMap = new Map<string, number>();
      standardIndices.forEach(({ item }) => {
        const q = ceil10mm(item.cutLength);
        const prev = planeMaxMap.get(item.planeId) || 0;
        if (q > prev) planeMaxMap.set(item.planeId, q);
      });

      const uniqueMaxDesc = Array.from(new Set(planeMaxMap.values())).sort((a, b) => b - a);
      const mergedCandidates: number[] = [];
      for (const len of uniqueMaxDesc) {
        if (mergedCandidates.length === 0) {
          mergedCandidates.push(len);
        } else {
          const nearestLonger = mergedCandidates[mergedCandidates.length - 1];
          if (nearestLonger - len >= MIN_CLUSTER_SEPARATION_M) {
            mergedCandidates.push(len);
          }
        }
      }

      chosenStocks = [mergedCandidates[0]];
      let bestSim = runPracticalPacking(chosenStocks, false);
      const remainingPool = mergedCandidates.slice(1);

      while (chosenStocks.length < MAX_PRACTICAL_LENGTHS && remainingPool.length > 0) {
        let bestAddIdx = -1;
        let bestAddLm = bestSim.totalOrderedLm;
        for (let ci = 0; ci < remainingPool.length; ci++) {
          const trialStocks = [...chosenStocks, remainingPool[ci]].sort((a, b) => b - a);
          const sim = runPracticalPacking(trialStocks, false);
          if (sim.totalOrderedLm < bestAddLm) {
            bestAddLm = sim.totalOrderedLm;
            bestAddIdx = ci;
          }
        }
        const savedLm = +(bestSim.totalOrderedLm - bestAddLm).toFixed(3);
        const minRequiredSavings = Math.max(
          MIN_SAVINGS_ABS_LM,
          bestSim.totalOrderedLm * MIN_SAVINGS_PCT
        );
        if (bestAddIdx >= 0 && savedLm >= minRequiredSavings) {
          const picked = remainingPool.splice(bestAddIdx, 1)[0];
          chosenStocks = [...chosenStocks, picked].sort((a, b) => b - a);
          bestSim = { totalOrderedLm: bestAddLm };
        } else {
          break;
        }
      }
    }

    // Commit final Practical sheet layout using chosenStocks + exact 1mm override buckets
    runPracticalPacking(chosenStocks, true);
  } else {
    // OPTIMIZED MODE (existing tight multi-length diagonal/linear repress nesting)
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
  }

  // Calculate Reconciled Metrics (Honest & Reconciled 100% with ParentSheet[] and Roof Geometry)
  const totalRoofMetres = +allNeededPieces.reduce((sum, p) => sum + p.midLength, 0).toFixed(2);
  const totalOrderedMetres = +parentSheets.reduce((sum, s) => sum + s.length, 0).toFixed(2);

  // Compute net developed roof area strictly over deduplicated non-virtual structural planes minus apertures
  const netRoofAreaM2 = computeTruthfulRoofAreaM2(orderedPlanes);
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
    sheetOrderMode,
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

export interface SharedRoofVertex {
  x: number;
  y: number;
  z: number;
  isEavePinned: boolean;
}

export interface ResolvedLevelSharedVertices {
  vertices: SharedRoofVertex[];
  getVertexForPoint: (pt: Point2D, fallbackZ?: number) => SharedRoofVertex;
  getPolygonWithTJunctions: (plane: RoofPlane) => Point2D[];
}

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

/**
 * Reconciles 2D vertex clusters and shared 3D vertex heights across all planes & skeleton
 * junctions within one roof level so adjacent slopes (main gable, T-bay valleys, triangular
 * corner panels) meet at bit-identical (X, Y, Z) edge coordinates with zero gaps.
 */
export function resolveLevelSharedVertexElevations(
  levelPlanes: RoofPlane[],
  levelOutline?: RoofOutline,
  skeleton: SkeletonLine[] = [],
  defaultEaveHeightM = 2.7
): ResolvedLevelSharedVertices {
  const clusters: { x: number; y: number }[] = [];
  const addClusterPt = (pt: Point2D, snapTol = 0.12) => {
    if (!clusters.some((c) => dist(c, pt) <= snapTol)) {
      clusters.push({ x: +pt.x.toFixed(4), y: +pt.y.toFixed(4) });
    }
  };

  // Priority order so outline, courtyard holes & skeleton junction coordinates stay exact anchors
  levelOutline?.points.forEach((p) => addClusterPt(p, 0.1));
  levelOutline?.holes?.forEach((h) => h.points.forEach((p) => addClusterPt(p, 0.1)));
  skeleton.forEach((s) => {
    addClusterPt(s.from, 0.11);
    addClusterPt(s.to, 0.11);
  });
  levelPlanes.forEach((pl) => {
    pl.planPolygon.forEach((v) => addClusterPt(v, 0.12));
  });

  const activeEaveEdges: { from: Point2D; to: Point2D; heightM: number }[] = [];
  const allEdgesForLevel = levelOutline ? getAllOutlineEdges(levelOutline) : [];
  allEdgesForLevel.forEach((e) => {
    if (e.type === 'outline') {
      const matchedPlane = levelPlanes.find(
        (p) => p.eaveEdgeId === e.id || p.eaveEdgeId.startsWith(`${e.id}__sub`)
      );
      activeEaveEdges.push({
        from: e.from,
        to: e.to,
        heightM: matchedPlane?.eaveHeightM ?? e.eaveHeightM ?? defaultEaveHeightM
      });
    }
  });
  skeleton.forEach((s) => {
    if (s.suggestedType === 'eave') {
      const matchedPlane = levelPlanes.find(
        (p) => p.eaveEdgeId === s.id || p.eaveEdgeId.startsWith(`${s.id}__sub`)
      );
      activeEaveEdges.push({
        from: s.from,
        to: s.to,
        heightM: matchedPlane?.eaveHeightM ?? defaultEaveHeightM
      });
    }
  });

  const ridges = skeleton.filter((s) => s.suggestedType === 'ridge');

  const resolved: SharedRoofVertex[] = clusters.map((c) => {
    // 1. Eave-pinned perimeter/internal eave boundary vertices stay at eave height
    const touchingEaves = activeEaveEdges.filter(
      (ee) => distToSegment(c, ee.from, ee.to) <= 0.14
    );
    if (touchingEaves.length > 0) {
      const avgEaveH =
        touchingEaves.reduce((sum, ee) => sum + ee.heightM, 0) / touchingEaves.length;
      return { x: c.x, y: c.y, z: +avgEaveH.toFixed(4), isEavePinned: true };
    }

    // 2. Interior / junction / verge / triangular apex vertices: reconcile incident plane Zs
    const touchingPlanes = levelPlanes.filter((pl) => {
      if (pl.planPolygon.length < 3) return false;
      return (
        pl.planPolygon.some((v) => dist(v, c) <= 0.16) ||
        pl.planPolygon.some((v, idx) =>
          distToSegment(c, v, pl.planPolygon[(idx + 1) % pl.planPolygon.length]) <= 0.14
        )
      );
    });

    const candidates =
      touchingPlanes.length > 0
        ? touchingPlanes
        : levelPlanes.filter((pl) => pl.planPolygon.length >= 3 && isPointInPolygon(c, pl.planPolygon));

    if (candidates.length === 0) {
      return { x: c.x, y: c.y, z: defaultEaveHeightM, isEavePinned: false };
    }

    // Main quad/multi-edge faces govern height; 3-vertex triangular panels conform seamlessly
    const nonTri = candidates.filter((p) => p.planPolygon.length >= 4);
    const governing = nonTri.length > 0 ? nonTri : candidates;

    // If a ridge line passes through C and 2+ opposing non-triangular planes run parallel to that ridge,
    // use those ridge-parallel primary slopes so tributary wing/valley junctions never cause a V-dip in the ridge
    const ridgeAtC = ridges.find((r) => distToSegment(c, r.from, r.to) <= 0.16);
    if (ridgeAtC && governing.length >= 2) {
      const rLen = dist(ridgeAtC.from, ridgeAtC.to) || 1;
      const rDir = {
        x: (ridgeAtC.to.x - ridgeAtC.from.x) / rLen,
        y: (ridgeAtC.to.y - ridgeAtC.from.y) / rLen
      };
      const ridgeParallelPlanes = governing.filter((pl) => {
        const p0 = pl.planPolygon[0];
        const p1 = pl.planPolygon[1];
        const eLen = dist(p0, p1) || 1;
        const dot = Math.abs(((p1.x - p0.x) / eLen) * rDir.x + ((p1.y - p0.y) / eLen) * rDir.y);
        return dot >= 0.92;
      });
      if (ridgeParallelPlanes.length >= 2) {
        const zs = ridgeParallelPlanes.map((pl) => getPlaneElevationAtPoint(c, pl, levelOutline));
        const meanZ = zs.reduce((s, z) => s + z, 0) / zs.length;
        return { x: c.x, y: c.y, z: +meanZ.toFixed(4), isEavePinned: false };
      }
    }

    const zs = governing.map((pl) => ({
      z: getPlaneElevationAtPoint(c, pl, levelOutline),
      w: Math.sqrt(Math.max(0.5, pl.area || 1))
    }));
    const weightSum = zs.reduce((s, item) => s + item.w, 0) || 1;
    const weightedZ = zs.reduce((s, item) => s + item.z * item.w, 0) / weightSum;
    return { x: c.x, y: c.y, z: +weightedZ.toFixed(4), isEavePinned: false };
  });

  const getVertexForPoint = (pt: Point2D, fallbackZ = defaultEaveHeightM): SharedRoofVertex => {
    let best: SharedRoofVertex | null = null;
    let bestD = 0.16;
    for (const v of resolved) {
      const d = Math.hypot(v.x - pt.x, v.y - pt.y);
      if (d <= bestD) {
        bestD = d;
        best = v;
      }
    }
    if (best) return best;

    // Linear interpolation if point lies along an edge connecting two resolved vertices on any plane boundary
    for (const pl of levelPlanes) {
      const poly = pl.planPolygon;
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        if (distToSegment(pt, p1, p2) <= 0.14) {
          const v1 = resolved.find((rv) => dist(rv, p1) <= 0.16);
          const v2 = resolved.find((rv) => dist(rv, p2) <= 0.16);
          if (v1 && v2) {
            const segLen = dist(p1, p2) || 1;
            const t = Math.max(
              0,
              Math.min(1, ((pt.x - p1.x) * (p2.x - p1.x) + (pt.y - p1.y) * (p2.y - p1.y)) / (segLen * segLen))
            );
            return {
              x: pt.x,
              y: pt.y,
              z: +(v1.z + t * (v2.z - v1.z)).toFixed(4),
              isEavePinned: v1.isEavePinned && v2.isEavePinned
            };
          }
        }
      }
    }

    const matching = levelPlanes.filter(
      (pl) => pl.planPolygon.length >= 3 && isPointInPolygon(pt, pl.planPolygon)
    );
    if (matching.length > 0) {
      const zMean =
        matching.reduce((s, pl) => s + getPlaneElevationAtPoint(pt, pl, levelOutline), 0) /
        matching.length;
      return { x: pt.x, y: pt.y, z: +zMean.toFixed(4), isEavePinned: false };
    }
    return { x: pt.x, y: pt.y, z: fallbackZ, isEavePinned: false };
  };

  // Splice shared T-junction vertices lying interior to a plane's edge so shared 3D triangles match edge-to-edge
  const getPolygonWithTJunctions = (plane: RoofPlane): Point2D[] => {
    const poly = plane.planPolygon;
    if (poly.length < 3) return poly;
    const out: Point2D[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const v1 = getVertexForPoint(p1, plane.eaveHeightM ?? defaultEaveHeightM);
      out.push({ x: v1.x, y: v1.y });

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy);
      if (segLen < 0.25) continue;
      const ux = dx / segLen;
      const uy = dy / segLen;

      const mids: { proj: number; pt: Point2D }[] = [];
      for (const rv of resolved) {
        if (dist(rv, p1) <= 0.14 || dist(rv, p2) <= 0.14) continue;
        if (distToSegment(rv, p1, p2) <= 0.08) {
          const proj = (rv.x - p1.x) * ux + (rv.y - p1.y) * uy;
          if (proj > 0.12 && proj < segLen - 0.12) {
            mids.push({ proj, pt: { x: rv.x, y: rv.y } });
          }
        }
      }
      mids.sort((a, b) => a.proj - b.proj);
      mids.forEach((m) => out.push(m.pt));
    }
    return out;
  };

  return { vertices: resolved, getVertexForPoint, getPolygonWithTJunctions };
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

  // 1. Perimeter & courtyard hole edges across full 10-type catalog
  getAllOutlineEdges(outline).forEach((edge, idx) => {
    const meta = getRoofEdgeTypeMeta(edge.type);
    const flashingKind: RoofLineFlashingKind = meta.flashingKind;
    const matchedPlane = planes.find((p) => p.eaveEdgeId === edge.id);
    const levelPrefix = matchedPlane?.levelCode ? `[${matchedPlane.levelCode}] ` : '';
    const baseName =
      edge.type === 'wall'
        ? `${levelPrefix}Abutment Wall Apron #${idx + 1}`
        : edge.type === 'apron'
        ? `${levelPrefix}Apron / Step #${idx + 1}`
        : edge.type === 'change-of-pitch'
        ? `${levelPrefix}Pitch Break Apron #${idx + 1}`
        : edge.type === 'verge'
        ? `${levelPrefix}Gable Barge #${idx + 1}`
        : edge.type === 'rake'
        ? `${levelPrefix}Rake Edge #${idx + 1}`
        : edge.type === 'ridge' || edge.type === 'hip' || edge.type === 'valley'
        ? `${levelPrefix}Perimeter ${meta.label} #${idx + 1}`
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
    const suggestedCategory: AssignableRoofLine['suggestedCategory'] =
      flashingKind === 'apron'
        ? 'Apron & Abutment'
        : flashingKind === 'valley'
        ? 'Valley & Gutter'
        : flashingKind === 'ridge' || flashingKind === 'hip'
        ? 'Ridge & Hip'
        : 'Barge & Edge';

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
      suggestedCategory
    });
  });

  // 2. Internal Skeleton / Polylines across full 10-type catalog
  const counts: Record<string, number> = {};
  skeleton.forEach((skel) => {
    counts[skel.suggestedType] = (counts[skel.suggestedType] || 0) + 1;
    const meta = getSkeletonLineTypeMeta(skel.suggestedType);
    const flashingKind: RoofLineFlashingKind = meta.flashingKind;
    const typeLabel = `${meta.label} #${counts[skel.suggestedType]}`;

    const slopeInfo = computeRoofLineTrueLengthM(
      flashingKind,
      skel.from,
      skel.to,
      planes,
      outline,
      skeleton
    );
    const pieceInfo = computeFlashingPieceBreakdown(slopeInfo.trueSlopeLengthM, flashingKind);
    const suggestedCategory: AssignableRoofLine['suggestedCategory'] =
      flashingKind === 'valley'
        ? 'Valley & Gutter'
        : flashingKind === 'apron'
        ? 'Apron & Abutment'
        : flashingKind === 'barge' || flashingKind === 'eave'
        ? 'Barge & Edge'
        : 'Ridge & Hip';

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
      suggestedCategory
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
  options?: { skeleton?: SkeletonLine[]; initialEdgeType?: EdgeType }
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

  const skeleton = (options?.skeleton || []).map((s) => ({
    ...s,
    levelId: s.levelId ?? levelId
  }));
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
  defaultPitchDeg = 22.5,
  options?: { ignoreSuppressed?: boolean }
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
      },
      {
        suppressedEdgeIds: lvl.suppressedPlaneEdgeIds,
        ignoreSuppressed: options?.ignoreSuppressed
      }
    );
    paletteOffset += levelPlanes.length;
    allPlanes.push(...levelPlanes);
  });

  return allPlanes;
}

export function deleteRoofPlanes(
  levels: RoofLevel[],
  planes: RoofPlane[],
  planeIds: string[]
): { levels: RoofLevel[]; planes: RoofPlane[] } {
  const targetPlaneSet = new Set(planeIds);
  if (targetPlaneSet.size === 0) return { levels, planes };

  const removedByLevel = new Map<string, string[]>();
  const removedAllEdgeIds: string[] = [];

  planes.forEach((p) => {
    if (!targetPlaneSet.has(p.id) || !p.eaveEdgeId) return;
    removedAllEdgeIds.push(p.eaveEdgeId);
    const owningLvl =
      levels.find((l) => l.id === p.levelId) ||
      levels.find((l) => getAllOutlineEdges(l.outline).some((e) => e.id === p.eaveEdgeId));
    if (owningLvl) {
      const list = removedByLevel.get(owningLvl.id) || [];
      list.push(p.eaveEdgeId);
      removedByLevel.set(owningLvl.id, list);
    }
  });

  const nextLevels = levels.map((lvl) => {
    const levelMatched = getAllOutlineEdges(lvl.outline)
      .filter((e) => removedAllEdgeIds.includes(e.id))
      .map((e) => e.id);
    const extra = removedByLevel.get(lvl.id) || [];
    const additions = [...levelMatched, ...extra];
    if (additions.length === 0) return lvl;
    const nextSuppressed = Array.from(
      new Set([...(lvl.suppressedPlaneEdgeIds || []), ...additions])
    );
    return {
      ...lvl,
      suppressedPlaneEdgeIds: nextSuppressed
    };
  });

  return {
    levels: nextLevels,
    planes: planes.filter((p) => !targetPlaneSet.has(p.id))
  };
}

export function unsuppressOutlineEdges(
  levels: RoofLevel[],
  edgeIds: string[]
): RoofLevel[] {
  if (edgeIds.length === 0) return levels;
  const clearSet = new Set(edgeIds);
  return levels.map((lvl) => {
    if (!lvl.suppressedPlaneEdgeIds || lvl.suppressedPlaneEdgeIds.length === 0) {
      return lvl;
    }
    const filtered = lvl.suppressedPlaneEdgeIds.filter((id) => !clearSet.has(id));
    if (filtered.length === lvl.suppressedPlaneEdgeIds.length) return lvl;
    return {
      ...lvl,
      suppressedPlaneEdgeIds: filtered.length > 0 ? filtered : undefined
    };
  });
}

export function buildFacesFromClassification(
  levels: RoofLevel[],
  existingPlanes: RoofPlane[],
  defaultPitchDeg = 22.5
): { levels: RoofLevel[]; planes: RoofPlane[]; createdCount: number } {
  const nextLevels = levels.map((lvl) => {
    if (lvl.outline.points.length < 3) {
      return { ...lvl, suppressedPlaneEdgeIds: undefined };
    }

    const allExistingEdges = getAllOutlineEdges(lvl.outline);
    const hasClassifiedEave = allExistingEdges.some((e) => e.type === 'outline');
    const promoteUnclassified = (e: PlanEdge): PlanEdge =>
      !hasClassifiedEave && e.type === 'unclassified' ? { ...e, type: 'outline' as const } : e;

    const nextOutline: RoofOutline = {
      ...lvl.outline,
      edges: lvl.outline.edges.map(promoteUnclassified),
      ...(lvl.outline.holes
        ? {
            holes: lvl.outline.holes.map((h) => ({
              ...h,
              edges: h.edges.map(promoteUnclassified)
            }))
          }
        : {})
    };

    const levelExistingPlanes = existingPlanes.filter(
      (p) => !p.levelId || p.levelId === lvl.id
    );
    const nextSkeleton = mergeColinearRidgeLines(lvl.skeleton, levelExistingPlanes);

    return {
      ...lvl,
      outline: nextOutline,
      skeleton: nextSkeleton,
      suppressedPlaneEdgeIds: undefined
    };
  });

  // Replace planes cleanly for rebuilt levels while carrying over pitch/sheet preferences for still-present loops
  const validLevelIds = new Set(nextLevels.map((l) => l.id));
  const preservedPrefs = existingPlanes.filter((p) => !p.levelId || validLevelIds.has(p.levelId));
  const rebuiltPlanes = deduplicateRoofPlanes(
    syncMultiLevelPlanes(nextLevels, preservedPrefs, defaultPitchDeg, {
      ignoreSuppressed: true
    })
  );
  const existingIds = new Set(existingPlanes.map((p) => p.id));
  const createdCount = rebuiltPlanes.filter((p) => !existingIds.has(p.id)).length;

  return {
    levels: nextLevels,
    planes: rebuiltPlanes,
    createdCount
  };
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
  return edge.type === 'outline' || isGableEdgeType(edge.type) || edge.type === 'wall';
}

function getEdgeInwardNormal(edge: PlanEdge, outlineOrPoints: RoofOutline | Point2D[]): Point2D {
  const dx = edge.to.x - edge.from.x;
  const dy = edge.to.y - edge.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const leftN = { x: -dy / len, y: dx / len };
  const mid = { x: (edge.from.x + edge.to.x) / 2, y: (edge.from.y + edge.to.y) / 2 };
  const probe = { x: mid.x + leftN.x * 0.05, y: mid.y + leftN.y * 0.05 };
  const isIn = Array.isArray(outlineOrPoints)
    ? outlineOrPoints.length >= 3 && isPointInPolygon(probe, outlineOrPoints)
    : outlineOrPoints.points.length >= 3 && isPointInOutlineDomain(probe, outlineOrPoints);
  if (isIn) {
    return leftN;
  }
  return { x: -leftN.x, y: -leftN.y };
}

export function computeEdgeSetbackLine(
  outline: RoofOutline,
  edgeId: string,
  overrideSetbackM?: number
): { wallFrom: Point2D; wallTo: Point2D; eaveSetbackM: number; inwardNormal: Point2D } | null {
  let ringEdges = outline.edges;
  let edge = ringEdges.find((e) => e.id === edgeId);
  if (!edge && outline.holes) {
    for (const h of outline.holes) {
      const found = h.edges.find((e) => e.id === edgeId);
      if (found) {
        ringEdges = h.edges;
        edge = found;
        break;
      }
    }
  }
  if (!edge) return null;

  const setbackM =
    overrideSetbackM !== undefined
      ? +Math.max(0, Math.min(3.0, overrideSetbackM)).toFixed(3)
      : getDefaultEdgeSetbackM(edge);
  const inwardNormal = getEdgeInwardNormal(edge, outline);

  if (setbackM <= 0.005 || ringEdges.length < 3) {
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
    const adjEdge = ringEdges.find(
      (oe) =>
        oe.id !== edge!.id &&
        (pointsClose(oe.from, cornerPt, 0.08) || pointsClose(oe.to, cornerPt, 0.08))
    );
    if (!adjEdge) return fallbackPt;

    const adjSetback = isEdgeWallEnabled(adjEdge) ? getDefaultEdgeSetbackM(adjEdge) : 0;
    const adjInward = getEdgeInwardNormal(adjEdge, outline);
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

    getAllOutlineEdges(lvl.outline).forEach((edge) => {
      if (!isEdgeWallEnabled(edge)) return;

      const setbackInfo = computeEdgeSetbackLine(lvl.outline, edge.id);
      const wallFrom = setbackInfo?.wallFrom || edge.from;
      const wallTo = setbackInfo?.wallTo || edge.to;
      const eaveSetbackM = setbackInfo?.eaveSetbackM ?? 0;
      const inwardNormal = setbackInfo?.inwardNormal || getEdgeInwardNormal(edge, lvl.outline);

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
      const fallbackZ = matchedPlane?.eaveHeightM ?? edge.eaveHeightM ?? lvl.eaveHeightM ?? 2.7;
      const sharedLevelVertices =
        levelPlanes.length > 0
          ? resolveLevelSharedVertexElevations(levelPlanes, lvl.outline, lvl.skeleton, fallbackZ)
          : null;

      // Evaluate exact overlying roof Z directly above each sample point along [wallFrom -> wallTo].
      // A wall ALWAYS sits strictly below/flush with the roof plane — never extends above it.
      const evalRoofZAtWallPoint = (pt: Point2D, t: number): number => {
        if (levelPlanes.length === 0) return fallbackZ;
        if (sharedLevelVertices) {
          const snapped = sharedLevelVertices.vertices.find((rv) => dist(rv, pt) <= 0.16);
          if (snapped) {
            return +snapped.z.toFixed(3);
          }
        }

        // Nudge imperceptibly inward along normal and toward segment center at endpoints so polygon test hits exact facet
        const nudgeIn = eaveSetbackM < 0.05 ? 0.03 : 0.01;
        const tNudge = t < 0.02 ? 0.02 : t > 0.98 ? -0.02 : 0;
        const evalPt = {
          x: pt.x + inwardNormal.x * nudgeIn + ux * tNudge,
          y: pt.y + inwardNormal.y * nudgeIn + uy * tNudge
        };

        if (sharedLevelVertices) {
          // Interpolate along shared vertex heights when resting on a facet boundary
          const sv = sharedLevelVertices.getVertexForPoint(pt, fallbackZ);
          if (
            levelPlanes.some((pl) =>
              pl.planPolygon.some((v, idx) =>
                distToSegment(pt, v, pl.planPolygon[(idx + 1) % pl.planPolygon.length]) <= 0.14
              )
            )
          ) {
            return +sv.z.toFixed(3);
          }
        }

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

        const directAtPt = getPointElevationFromPlanes(pt, levelPlanes, lvl.outline);
        if (directAtPt.matchedPlaneIds.length > 0) {
          const zs = directAtPt.matchedPlaneIds
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
        edge.type === 'wall' || edge.type === 'apron'
          ? 'abutment_wall'
          : isGableEdgeType(edge.type)
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
 * Computes an endpoint placed at exact `lengthM` from `fromPt` in the direction of `dirTargetPt`
 * (or `fallbackDir` if cursor has not moved yet). Honors 45/90-deg axis snap when `orthoSnap` is enabled.
 */
export function computePointAtLengthInDirection(
  fromPt: Point2D,
  dirTargetPt: Point2D | null | undefined,
  lengthM: number,
  options?: { orthoSnap?: boolean; fallbackDir?: Point2D }
): Point2D | null {
  if (!Number.isFinite(lengthM) || lengthM < 0.05 || lengthM > 2000) return null;
  const orthoSnap = options?.orthoSnap ?? true;

  let dx = dirTargetPt ? dirTargetPt.x - fromPt.x : 0;
  let dy = dirTargetPt ? dirTargetPt.y - fromPt.y : 0;
  const rawLen = Math.hypot(dx, dy);

  if (rawLen < 1e-4) {
    const fb = options?.fallbackDir ?? { x: 1, y: 0 };
    const fbLen = Math.hypot(fb.x, fb.y) || 1;
    dx = fb.x / fbLen;
    dy = fb.y / fbLen;
  } else {
    dx /= rawLen;
    dy /= rawLen;
    if (orthoSnap) {
      const angle = Math.atan2(dy, dx);
      const octant = Math.PI / 4; // 0, 45, 90, 135, 180...
      const nearestAxis = Math.round(angle / octant) * octant;
      if (Math.abs(angle - nearestAxis) <= (12 * Math.PI) / 180) {
        dx = Math.cos(nearestAxis);
        dy = Math.sin(nearestAxis);
      }
    }
  }

  return {
    x: +(fromPt.x + dx * lengthM).toFixed(3),
    y: +(fromPt.y + dy * lengthM).toFixed(3)
  };
}

/**
 * Completes an open draft polyline back to P0 at right angles relative to the first edge
 * (or world axes when `orthoSnap` is true and edge 0 is axis-aligned):
 * - For 3 placed points (2 sides of a box), completes the 4th rectangle corner.
 * - For 4+ placed points whose closing gap is diagonal to the base frame, inserts the missing 90-deg corner.
 * Returns null if the geometry cannot form a valid orthogonal closure.
 */
export function buildCompleteSquarePoints(
  points: Point2D[],
  orthoSnap = true
): Point2D[] | null {
  if (!points || points.length < 3) return null;
  const p0 = points[0];
  const p1 = points[1];
  const len0 = dist(p0, p1);
  if (len0 < 0.15) return null;

  let u = { x: (p1.x - p0.x) / len0, y: (p1.y - p0.y) / len0 };
  if (orthoSnap) {
    if (Math.abs(u.x) >= 0.996) u = { x: Math.sign(u.x), y: 0 };
    else if (Math.abs(u.y) >= 0.996) u = { x: 0, y: Math.sign(u.y) };
  }
  const n = { x: -u.y, y: u.x };

  if (points.length === 3) {
    const p2 = points[2];
    const vx = p2.x - p1.x;
    const vy = p2.y - p1.y;
    const len2 = Math.hypot(vx, vy);
    if (len2 < 0.15) return null;

    const uComp = vx * u.x + vy * u.y;
    const nComp = vx * n.x + vy * n.y;
    // Second segment must make a clear perpendicular turn (within ~25 deg of 90 deg)
    if (Math.abs(nComp) < 0.15 || Math.abs(uComp / len2) > 0.45) {
      return null;
    }

    const snapP2 = Math.abs(uComp) <= 0.005 || Math.abs(uComp / len2) <= 0.22;
    const finalP2: Point2D = snapP2
      ? { x: +(p1.x + n.x * nComp).toFixed(3), y: +(p1.y + n.y * nComp).toFixed(3) }
      : { ...p2 };
    const p3: Point2D = {
      x: +(p0.x + n.x * nComp).toFixed(3),
      y: +(p0.y + n.y * nComp).toFixed(3)
    };
    if (dist(finalP2, p3) < 0.15 || dist(p3, p0) < 0.15) return null;
    return [{ ...p0 }, { ...p1 }, finalP2, p3];
  }

  const pLast = points[points.length - 1];
  const pPrev = points[points.length - 2];
  const gapX = p0.x - pLast.x;
  const gapY = p0.y - pLast.y;
  const du = gapX * u.x + gapY * u.y;
  const dn = gapX * n.x + gapY * n.y;

  // Already aligned on either axis -> normal Close closes cleanly without adding a corner
  if (Math.abs(du) < 0.15 || Math.abs(dn) < 0.15) {
    return null;
  }

  const lastVx = pLast.x - pPrev.x;
  const lastVy = pLast.y - pPrev.y;
  const lastDotU = Math.abs(lastVx * u.x + lastVy * u.y);
  const lastDotN = Math.abs(lastVx * n.x + lastVy * n.y);

  const corner: Point2D =
    lastDotU >= lastDotN
      ? { x: +(pLast.x + n.x * dn).toFixed(3), y: +(pLast.y + n.y * dn).toFixed(3) }
      : { x: +(pLast.x + u.x * du).toFixed(3), y: +(pLast.y + u.y * du).toFixed(3) };

  if (dist(pLast, corner) < 0.15 || dist(corner, p0) < 0.15) return null;
  return [...points.map((p) => ({ ...p })), corner];
}

export function canCloseDraftSquare(points: Point2D[], orthoSnap = true): boolean {
  return buildCompleteSquarePoints(points, orthoSnap) !== null;
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

export interface HostPlaneRunSpan {
  pA: Point2D;
  uVec: Point2D;
  vInward: Point2D;
  cosPitch: number;
  minU: number;
  maxU: number;
  minVPlan: number;
  maxVPlan: number;
  minVSlope: number;
  maxVSlope: number;
  runPlanM: number;
  runSlopeM: number;
}

export interface AssetPlacementMetrics extends HostPlaneRunSpan {
  uC: number;
  vPlanC: number;
  vSlopeC: number;
  depthSlopeM: number;
  distFromEaveM: number;
  distFromApexM: number;
  offsetFromLeftM: number;
  eaveWidthM: number;
}

function getPlaneBasisVectors(hostPlane: RoofPlane): {
  pA: Point2D;
  uVec: Point2D;
  vInward: Point2D;
  cosPitch: number;
} {
  const pA = hostPlane.planPolygon[0] || { x: 0, y: 0 };
  const pB = hostPlane.planPolygon[1] || { x: pA.x + 1, y: pA.y };
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const len = Math.hypot(dx, dy) || 1;
  const uVec = { x: dx / len, y: dy / len };
  const vInward = hostPlane.runDirection || { x: -uVec.y, y: uVec.x };
  const cosPitch = Math.max(0.15, Math.cos(((hostPlane.pitchDeg || 22.5) * Math.PI) / 180));
  return { pA, uVec, vInward, cosPitch };
}

/**
 * Computes exact plan & slope run span [minV .. maxV] of a host RoofPlane at horizontal coordinate uM
 * along its eave axis, supporting rectangular, trapezoidal (hip), and tapered facets.
 */
export function computeHostPlaneRunSpanAtU(
  hostPlane: RoofPlane,
  uM: number
): HostPlaneRunSpan {
  const { pA, uVec, vInward, cosPitch } = getPlaneBasisVectors(hostPlane);
  const poly = hostPlane.planPolygon;
  const localPts = poly.map((pt) => {
    const rx = pt.x - pA.x;
    const ry = pt.y - pA.y;
    return {
      u: rx * uVec.x + ry * uVec.y,
      v: rx * vInward.x + ry * vInward.y
    };
  });

  const us = localPts.map((p) => p.u);
  const vs = localPts.map((p) => p.v);
  const minU = us.length > 0 ? Math.min(...us) : 0;
  const maxU = us.length > 0 ? Math.max(...us) : hostPlane.eaveWidthM || 4;
  const uQuery = Math.max(minU + 1e-4, Math.min(maxU - 1e-4, uM));

  const crossings: number[] = [];
  for (let i = 0; i < localPts.length; i++) {
    const a = localPts[i];
    const b = localPts[(i + 1) % localPts.length];
    if ((a.u <= uQuery && b.u >= uQuery) || (b.u <= uQuery && a.u >= uQuery)) {
      const du = b.u - a.u;
      if (Math.abs(du) > 1e-6) {
        const t = (uQuery - a.u) / du;
        if (t >= -1e-4 && t <= 1 + 1e-4) {
          crossings.push(a.v + t * (b.v - a.v));
        }
      } else if (Math.abs(uQuery - a.u) < 1e-3) {
        crossings.push(a.v, b.v);
      }
    }
  }

  const fallbackMaxVPlan =
    vs.length > 0 ? Math.max(...vs) : (hostPlane.slopeLength || 4) * cosPitch;
  const minVPlan =
    crossings.length >= 2 ? Math.min(...crossings) : vs.length > 0 ? Math.min(...vs) : 0;
  const maxVPlan =
    crossings.length >= 2
      ? Math.max(...crossings)
      : fallbackMaxVPlan;

  const safeMinVPlan = Math.min(minVPlan, maxVPlan);
  const safeMaxVPlan = Math.max(safeMinVPlan + 0.25, maxVPlan);
  const minVSlope = safeMinVPlan / cosPitch;
  const maxVSlope = safeMaxVPlan / cosPitch;

  return {
    pA,
    uVec,
    vInward,
    cosPitch,
    minU,
    maxU,
    minVPlan: +safeMinVPlan.toFixed(3),
    maxVPlan: +safeMaxVPlan.toFixed(3),
    minVSlope: +minVSlope.toFixed(3),
    maxVSlope: +maxVSlope.toFixed(3),
    runPlanM: +(safeMaxVPlan - safeMinVPlan).toFixed(3),
    runSlopeM: +(maxVSlope - minVSlope).toFixed(3)
  };
}

/**
 * Computes dimensional placement of a RoofAsset relative to its host RoofPlane's eave, apex/ridge, and left edge.
 * All distance outputs are in slope metres along the sheet run (matching roof measurement tape practice).
 */
export function computeAssetPlacementMetrics(
  hostPlane: RoofPlane,
  asset: RoofAsset
): AssetPlacementMetrics {
  const { pA, uVec, vInward, cosPitch } = getPlaneBasisVectors(hostPlane);
  const rx = asset.center.x - pA.x;
  const ry = asset.center.y - pA.y;
  const uC = rx * uVec.x + ry * uVec.y;
  const vPlanC = rx * vInward.x + ry * vInward.y;

  const span = computeHostPlaneRunSpanAtU(hostPlane, uC);
  const vSlopeC = vPlanC / cosPitch;
  const depthSlopeM = Math.max(0.2, asset.depthM) / cosPitch;
  const halfDSlope = depthSlopeM / 2;

  const frontSlope = vSlopeC - halfDSlope;
  const backSlope = vSlopeC + halfDSlope;

  const distFromEaveM = +Math.max(0, frontSlope - span.minVSlope).toFixed(2);
  const distFromApexM = +Math.max(0, span.maxVSlope - backSlope).toFixed(2);
  const offsetFromLeftM = +Math.max(0, uC - span.minU).toFixed(2);
  const eaveWidthM = +Math.max(0.5, span.maxU - span.minU).toFixed(2);

  return {
    ...span,
    uC: +uC.toFixed(3),
    vPlanC: +vPlanC.toFixed(3),
    vSlopeC: +vSlopeC.toFixed(3),
    depthSlopeM: +depthSlopeM.toFixed(3),
    distFromEaveM,
    distFromApexM,
    offsetFromLeftM,
    eaveWidthM
  };
}

/**
 * Syncs `distFromEaveM`, `distFromApexM`, and `offsetFromLeftM` onto a RoofAsset from its world center.
 */
export function syncAssetRelationshipFields(
  hostPlane: RoofPlane | undefined,
  asset: RoofAsset
): RoofAsset {
  if (!hostPlane || hostPlane.planPolygon.length < 3) return asset;
  const m = computeAssetPlacementMetrics(hostPlane, asset);
  return {
    ...asset,
    planeId: hostPlane.id,
    distFromEaveM: m.distFromEaveM,
    distFromApexM: m.distFromApexM,
    offsetFromLeftM: m.offsetFromLeftM
  };
}

/**
 * Updates a RoofAsset's world `center` and synced metrics from explicit eave distance, apex distance,
 * side offset, width, or depth edits while keeping plan 2D, cut-layout apertures, and 3D synced.
 */
export function updateAssetFromPlacement(
  hostPlane: RoofPlane,
  asset: RoofAsset,
  updates: {
    distFromEaveM?: number;
    distFromApexM?: number;
    offsetFromLeftM?: number;
    widthM?: number;
    depthM?: number;
    anchorEdge?: 'eave' | 'apex';
  }
): RoofAsset {
  const nextWidthM =
    updates.widthM !== undefined && Number.isFinite(updates.widthM)
      ? +Math.max(0.3, Math.min(10, updates.widthM)).toFixed(2)
      : asset.widthM;
  const nextDepthM =
    updates.depthM !== undefined && Number.isFinite(updates.depthM)
      ? +Math.max(0.3, Math.min(8, updates.depthM)).toFixed(2)
      : asset.depthM;

  const currMetrics = computeAssetPlacementMetrics(hostPlane, asset);
  const maxOffset = Math.max(0.2, currMetrics.maxU - currMetrics.minU - 0.15);
  const nextU =
    updates.offsetFromLeftM !== undefined && Number.isFinite(updates.offsetFromLeftM)
      ? currMetrics.minU + Math.max(0.15, Math.min(maxOffset, updates.offsetFromLeftM))
      : currMetrics.uC;

  const span = computeHostPlaneRunSpanAtU(hostPlane, nextU);
  const halfDSlope = nextDepthM / (2 * span.cosPitch);

  let nextVSlopeC = currMetrics.vSlopeC;
  if (updates.distFromEaveM !== undefined && Number.isFinite(updates.distFromEaveM)) {
    const maxFromEave = Math.max(0.05, span.runSlopeM - halfDSlope * 2);
    const clampedFront = Math.max(0.05, Math.min(maxFromEave, updates.distFromEaveM));
    nextVSlopeC = span.minVSlope + clampedFront + halfDSlope;
  } else if (updates.distFromApexM !== undefined && Number.isFinite(updates.distFromApexM)) {
    const maxFromApex = Math.max(0.05, span.runSlopeM - halfDSlope * 2);
    const clampedApex = Math.max(0, Math.min(maxFromApex, updates.distFromApexM));
    nextVSlopeC = span.maxVSlope - clampedApex - halfDSlope;
  } else if (updates.depthM !== undefined) {
    if (updates.anchorEdge === 'apex') {
      const keepApex = Math.max(0, currMetrics.distFromApexM);
      nextVSlopeC = Math.max(span.minVSlope + halfDSlope, span.maxVSlope - keepApex - halfDSlope);
    } else {
      const keepEave = Math.max(0.05, currMetrics.distFromEaveM);
      nextVSlopeC = Math.min(span.maxVSlope - halfDSlope, span.minVSlope + keepEave + halfDSlope);
    }
  }

  const minCenterSlope = span.minVSlope + Math.min(halfDSlope, span.runSlopeM * 0.45);
  const maxCenterSlope = span.maxVSlope - Math.min(halfDSlope, span.runSlopeM * 0.45);
  const clampedCenterSlope = Math.max(minCenterSlope, Math.min(maxCenterSlope, nextVSlopeC));
  const vPlanC = clampedCenterSlope * span.cosPitch;

  const nextCenter: Point2D = {
    x: +(span.pA.x + nextU * span.uVec.x + vPlanC * span.vInward.x).toFixed(3),
    y: +(span.pA.y + nextU * span.uVec.y + vPlanC * span.vInward.y).toFixed(3)
  };

  return syncAssetRelationshipFields(hostPlane, {
    ...asset,
    widthM: nextWidthM,
    depthM: nextDepthM,
    center: nextCenter
  });
}

/**
 * Re-assigns an asset cleanly onto a different host RoofPlane using its current eave offset
 * or centered cleanly on the new host face.
 */
export function repositionAssetToPlane(targetPlane: RoofPlane, asset: RoofAsset): RoofAsset {
  const { pA, uVec, vInward } = getPlaneBasisVectors(targetPlane);
  const span = computeHostPlaneRunSpanAtU(
    targetPlane,
    (targetPlane.eaveWidthM ?? 4) / 2
  );
  const midU = (span.minU + span.maxU) / 2;
  const centeredSpan = computeHostPlaneRunSpanAtU(targetPlane, midU);
  const desiredDistEave = asset.distFromEaveM ?? Math.max(0.4, centeredSpan.runSlopeM * 0.35);
  const halfDSlope = asset.depthM / (2 * centeredSpan.cosPitch);
  const clampedFront = Math.max(
    0.1,
    Math.min(Math.max(0.1, centeredSpan.runSlopeM - halfDSlope * 2), desiredDistEave)
  );
  const vPlanC = (centeredSpan.minVSlope + clampedFront + halfDSlope) * centeredSpan.cosPitch;
  const center: Point2D = {
    x: +(pA.x + midU * uVec.x + vPlanC * vInward.x).toFixed(3),
    y: +(pA.y + midU * uVec.y + vPlanC * vInward.y).toFixed(3)
  };
  return syncAssetRelationshipFields(targetPlane, {
    ...asset,
    planeId: targetPlane.id,
    center
  });
}





