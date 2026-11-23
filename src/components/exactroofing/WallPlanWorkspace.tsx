import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Compass,
  Download,
  GitBranch,
  Layers,
  Link2,
  Maximize2,
  PenTool,
  Plus,
  Ruler,
  Scissors,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { ArchitecturalPlan } from '../../types/crm';
import {
  Point2D,
  RoofLevel,
  RoofOutline,
  RoofPlane,
  RoofPlanUnderlay,
  WallCladdingType,
  WallFacet,
  WallFacetKind,
  WallFilterMode,
  WallHeightSource,
  WallPlan
} from '../../types/exactRoofing';
import {
  applyDraftPointSnap,
  buildCompleteSquarePoints,
  computeCornerAngleDeg,
  computePointAtLengthInDirection,
  dist,
  parseDistanceInputToMetres,
  pointsClose,
  squarePolygonCorner
} from '../../utils/exactRoofingEngine';
import {
  addWingWallToPlan,
  analyzeWallPlanTopology,
  batchUpdateWallFacetsInPlan,
  buildWallEdgesFromPoints,
  buildWallFacetsFromPlan,
  buildWallOpeningsSchedule,
  buildWallTakeoffExportData,
  computeWallFacetMetrics,
  computeWallTakeoffSummary,
  createSecondaryZoneFromVoid,
  deriveWallPlanFromRoofLevels,
  getFacetPrimaryDisplayCladding,
  getWallCladdingMeta,
  getWallFacetKind,
  getWallFacetKindMeta,
  isWallFacetUndetailed,
  mergePreservedExtraFacets,
  moveWallPlanVertex,
  removeSecondaryZone,
  splitWallFacetInPlan,
  syncWallPlanWithRoof,
  updateSecondaryZoneDepth,
  updateWallPlanEdgeLength,
  WALL_CLADDING_OPTIONS,
  WALL_FACET_KIND_OPTIONS
} from '../../utils/wallCladdingEngine';
import {
  computeDynamicScaleBar,
  computeEdgeDimensionPlacement,
  computeMetricGridLines
} from './canvas2d/cadGeometryHelpers';
import { WallElevationWorkbench } from './WallElevationWorkbench';

interface Props {
  wallPlan: WallPlan | null;
  levels: RoofLevel[];
  roofPlanes?: RoofPlane[];
  projectPlans?: ArchitecturalPlan[];
  planUnderlay?: RoofPlanUnderlay | null;
  selectedWallFacetId: string | null;
  onSelectWallFacet: (facetId: string | null) => void;
  onUpdateWallPlan: (nextPlan: WallPlan | null) => void;
  onUpdateWallFacet: (updatedFacet: WallFacet) => void;
  onBatchUpdateFacets?: (
    facetIds: string[],
    patch: {
      claddingType?: WallCladdingType;
      kind?: WallFacetKind;
      heightM?: number;
      heightSource?: WallHeightSource;
    }
  ) => void;
  wallFilterMode?: WallFilterMode;
  onChangeWallFilterMode?: (mode: WallFilterMode) => void;
  multiSelectedFacetIds?: string[];
  onChangeMultiSelectedFacetIds?: (ids: string[]) => void;
  onBuildRoofFromWalls?: (plan: WallPlan) => void;
  initialSubView?: 'plan' | 'elevation';
  readOnly?: boolean;
}

type ScheduleTab = 'summary' | 'faces' | 'openings';

const EMPTY_FACETS: WallFacet[] = [];

export const WallPlanWorkspace: React.FC<Props> = ({
  wallPlan,
  levels,
  roofPlanes = [],
  projectPlans = [],
  planUnderlay,
  selectedWallFacetId,
  onSelectWallFacet,
  onUpdateWallPlan,
  onUpdateWallFacet,
  onBatchUpdateFacets,
  wallFilterMode: propWallFilterMode,
  onChangeWallFilterMode,
  multiSelectedFacetIds: propMultiSelectedFacetIds,
  onChangeMultiSelectedFacetIds,
  onBuildRoofFromWalls,
  initialSubView = 'plan',
  readOnly = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [subView, setSubView] = useState<'plan' | 'elevation'>(initialSubView);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [drawMode, setDrawMode] = useState<'ring' | 'wing'>('ring');
  const [draftPoints, setDraftPoints] = useState<Point2D[]>([]);
  const [hoverPt, setHoverPt] = useState<Point2D | null>(null);
  const [typedLengthBuffer, setTypedLengthBuffer] = useState<string>('');
  const lastAimPtRef = useRef<Point2D | null>(null);
  const [draggingVertexIdx, setDraggingVertexIdx] = useState<number | null>(null);
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);
  const [defaultHeightM, setDefaultHeightM] = useState<number>(
    wallPlan?.defaultHeightM || levels[0]?.eaveHeightM || 2.7
  );
  const [editLengthVal, setEditLengthVal] = useState<string>('');
  const [localFilterMode, setLocalFilterMode] = useState<WallFilterMode>('all');
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>('summary');
  const [takeoffScope, setTakeoffScope] = useState<'all' | 'primary' | 'secondary'>('all');
  const [localMultiSelectedFacetIds, setLocalMultiSelectedFacetIds] = useState<string[]>([]);
  const [wallMultiMode, setWallMultiMode] = useState<boolean>(false);
  const [batchCladding, setBatchCladding] = useState<WallCladdingType>('weatherboard');
  const [batchKind, setBatchKind] = useState<WallFacetKind | ''>('');
  const [batchHeightM, setBatchHeightM] = useState<string>('');
  const [batchHeightSource, setBatchHeightSource] = useState<WallHeightSource | ''>('');
  const [deriveStatusText, setDeriveStatusText] = useState<string | null>(null);

  // Zoom & Pan state for the wall floor plan CAD viewport
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanDragging, setIsPanDragging] = useState<boolean>(false);
  const zoomRef = useRef<number>(1);
  const panRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  zoomRef.current = zoom;
  panRef.current = pan;
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDistRef = useRef<number | null>(null);
  const panDragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originPanX: number;
    originPanY: number;
    moved: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef<boolean>(false);

  const filterMode = propWallFilterMode ?? localFilterMode;
  const setFilterMode = (mode: WallFilterMode) => {
    setLocalFilterMode(mode);
    onChangeWallFilterMode?.(mode);
  };

  const facets = useMemo(
    () => wallPlan?.facets ?? EMPTY_FACETS,
    [wallPlan?.facets]
  );
  const selectedFacet = useMemo(
    () => facets.find((f) => f.id === selectedWallFacetId) || facets[0] || null,
    [facets, selectedWallFacetId]
  );

  const multiSelectedFacetIds = propMultiSelectedFacetIds ?? localMultiSelectedFacetIds;
  const setMultiSelectedFacetIds = (ids: string[]) => {
    setLocalMultiSelectedFacetIds(ids);
    onChangeMultiSelectedFacetIds?.(ids);
  };

  const isEditingLenRef = useRef<boolean>(false);
  React.useEffect(() => {
    if (isEditingLenRef.current) return;
    const target = facets.find((f) => f.id === selectedWallFacetId);
    setEditLengthVal(target ? target.lengthM.toFixed(2) : '');
  }, [selectedWallFacetId, facets]);

  React.useEffect(() => {
    if (multiSelectedFacetIds.length === 0) return;
    const validSet = new Set(facets.map((f) => f.id));
    const filtered = multiSelectedFacetIds.filter((id) => validSet.has(id));
    if (filtered.length !== multiSelectedFacetIds.length) {
      setLocalMultiSelectedFacetIds(filtered);
      onChangeMultiSelectedFacetIds?.(filtered);
    }
  }, [facets, multiSelectedFacetIds]);

  const fullSummary = useMemo(
    () => computeWallTakeoffSummary(facets, 'all'),
    [facets]
  );
  const takeoffSummary = useMemo(
    () => computeWallTakeoffSummary(facets, takeoffScope),
    [facets, takeoffScope]
  );
  const topology = useMemo(
    () => analyzeWallPlanTopology(facets),
    [facets]
  );
  const openingsSchedule = useMemo(
    () => buildWallOpeningsSchedule(facets),
    [facets]
  );

  const returnFacetIdSet = useMemo(
    () => new Set(topology.returnFacetIds),
    [topology.returnFacetIds]
  );

  const filteredFacets = useMemo(() => {
    if (filterMode === 'undetailed') {
      return facets.filter((f) => isWallFacetUndetailed(f));
    }
    if (filterMode === 'returns') {
      return facets.filter((f) => returnFacetIdSet.has(f.id));
    }
    if (filterMode === 'parapets') {
      return facets.filter((f) => getWallFacetKind(f) === 'parapet');
    }
    if (filterMode === 'secondary') {
      return facets.filter((f) => getWallFacetKind(f) === 'secondary');
    }
    if (filterMode === 'wings') {
      return facets.filter((f) => getWallFacetKind(f) === 'wing' || Boolean(f.isSpur));
    }
    return facets;
  }, [facets, filterMode, returnFacetIdSet]);

  const nextUndetailedFacet = useMemo(
    () => facets.find((f) => isWallFacetUndetailed(f)) || null,
    [facets]
  );

  // Unified world viewport framing roof + wall plan + wing/secondary facets + draft points
  const viewBounds = useMemo(() => {
    const pts: Point2D[] = [
      ...levels.flatMap((l) => l.outline.points),
      ...(wallPlan?.points || []),
      ...facets.flatMap((f) => [f.from, f.to]),
      ...draftPoints
    ];
    if (planUnderlay && planUnderlay.visible !== false && planUnderlay.isCalibrated) {
      pts.push(
        { x: planUnderlay.worldX, y: planUnderlay.worldY },
        {
          x: planUnderlay.worldX + planUnderlay.worldWidthM,
          y: planUnderlay.worldY + planUnderlay.worldHeightM
        }
      );
    }
    if (pts.length === 0) {
      return { minX: -2, maxX: 16, minY: -2, maxY: 12 };
    }
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = Math.max(2.2, Math.max(maxX - minX, maxY - minY) * 0.16);
    return {
      minX: minX - pad,
      maxX: maxX + pad,
      minY: minY - pad,
      maxY: maxY + pad
    };
  }, [levels, wallPlan?.points, wallPlan?.bodies, facets, draftPoints, planUnderlay]);

  const [vpSize, setVpSize] = useState<{ w: number; h: number }>({ w: 860, h: 520 });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const syncSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 80 && rect.height > 80) {
        setVpSize((prev) =>
          Math.abs(prev.w - rect.width) > 4 || Math.abs(prev.h - rect.height) > 4
            ? { w: Math.round(rect.width), h: Math.round(rect.height) }
            : prev
        );
      }
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [subView]);

  const svgW = vpSize.w;
  const svgH = vpSize.h;
  const worldW = Math.max(4, viewBounds.maxX - viewBounds.minX);
  const worldH = Math.max(4, viewBounds.maxY - viewBounds.minY);
  const basePxPerM = Math.min((svgW - 48) / worldW, (svgH - 48) / worldH);
  const pxPerM = basePxPerM * zoom;
  const centerX = svgW / 2;
  const centerY = svgH / 2;
  const worldCenterX = viewBounds.minX + worldW / 2;
  const worldCenterY = viewBounds.minY + worldH / 2;

  const toSvgX = (wx: number) => centerX + (wx - worldCenterX) * pxPerM + pan.x;
  const toSvgY = (wy: number) => centerY + (wy - worldCenterY) * pxPerM + pan.y;
  const fromSvgX = (sx: number) => worldCenterX + (sx - centerX - pan.x) / pxPerM;
  const fromSvgY = (sy: number) => worldCenterY + (sy - centerY - pan.y) / pxPerM;

  const gridData = useMemo(
    () => computeMetricGridLines(svgW, svgH, pxPerM, fromSvgX, fromSvgY, toSvgX, toSvgY),
    [svgW, svgH, pxPerM, worldCenterX, worldCenterY, pan.x, pan.y]
  );
  const scaleBar = useMemo(() => computeDynamicScaleBar(pxPerM), [pxPerM]);

  const squareClosedPoints = useMemo(
    () => (isDrawing && drawMode === 'ring' ? buildCompleteSquarePoints(draftPoints, true) : null),
    [isDrawing, drawMode, draftPoints]
  );

  const selectedCornerAngleDeg = useMemo(() => {
    if (isDrawing || !wallPlan || selectedVertexIdx === null) return null;
    return computeCornerAngleDeg(wallPlan.points, selectedVertexIdx);
  }, [isDrawing, wallPlan, selectedVertexIdx]);

  const typedPreviewPt = useMemo(() => {
    if (!isDrawing || draftPoints.length === 0 || !typedLengthBuffer.trim()) return null;
    const distM = parseDistanceInputToMetres(typedLengthBuffer, 'auto');
    if (distM === null) return null;
    const lastPt = draftPoints[draftPoints.length - 1];
    return computePointAtLengthInDirection(lastPt, hoverPt || lastAimPtRef.current, distM, {
      orthoSnap: true,
      fallbackDir: { x: 1, y: 0 }
    });
  }, [isDrawing, draftPoints, typedLengthBuffer, hoverPt]);

  useEffect(() => {
    if (!wallPlan || selectedVertexIdx === null || selectedVertexIdx >= wallPlan.points.length) {
      if (selectedVertexIdx !== null) setSelectedVertexIdx(null);
    }
  }, [wallPlan, selectedVertexIdx]);

  // Cursor-anchored wheel zoom
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      const svg = svgRef.current;
      if (!svg) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const fitScale = Math.min(rect.width / svgW, rect.height / svgH) || 1;
      const renderedW = svgW * fitScale;
      const renderedH = svgH * fitScale;
      const padLeft = rect.left + (rect.width - renderedW) / 2;
      const padTop = rect.top + (rect.height - renderedH) / 2;
      const cursorSvgX = (e.clientX - padLeft) / fitScale;
      const cursorSvgY = (e.clientY - padTop) / fitScale;

      const delta = -e.deltaY * (e.deltaMode === 1 ? 18 : 1);
      const factor = Math.exp(delta * 0.0014);
      const oldZoom = zoomRef.current;
      const nextZoom = Math.max(0.5, Math.min(6.0, +(oldZoom * factor).toFixed(3)));
      if (Math.abs(nextZoom - oldZoom) < 1e-4) return;

      const ratio = nextZoom / oldZoom;
      const oldPan = panRef.current;
      const nextPanX = cursorSvgX - centerX - (cursorSvgX - centerX - oldPan.x) * ratio;
      const nextPanY = cursorSvgY - centerY - (cursorSvgY - centerY - oldPan.y) * ratio;
      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [svgW, svgH, centerX, centerY, subView]);

  const getWorldFromClient = (clientX: number, clientY: number): Point2D | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const fitScale = Math.min(rect.width / svgW, rect.height / svgH);
    const renderedW = svgW * fitScale;
    const renderedH = svgH * fitScale;
    const padLeft = (rect.width - renderedW) / 2;
    const padTop = (rect.height - renderedH) / 2;
    const sx = (clientX - rect.left - padLeft) / fitScale;
    const sy = (clientY - rect.top - padTop) / fitScale;
    return { x: fromSvgX(sx), y: fromSvgY(sy) };
  };

  const snapToSitePoints = (pt: Point2D, anchor?: Point2D | null): Point2D => {
    const candidates: Point2D[] = [
      ...levels.flatMap((l) => l.outline.points),
      ...(wallPlan?.points || []),
      ...facets.flatMap((f) => [f.from, f.to]),
      ...draftPoints
    ];
    for (const c of candidates) {
      if (dist(pt, c) < 0.25) return { ...c };
    }
    // Also snap onto any existing wall line segment when branching a wing/spur wall
    if (drawMode === 'wing') {
      for (const f of facets) {
        const vx = f.to.x - f.from.x;
        const vy = f.to.y - f.from.y;
        const l2 = vx * vx + vy * vy;
        if (l2 < 1e-4) continue;
        const t = Math.max(0, Math.min(1, ((pt.x - f.from.x) * vx + (pt.y - f.from.y) * vy) / l2));
        const proj = { x: +(f.from.x + vx * t).toFixed(3), y: +(f.from.y + vy * t).toFixed(3) };
        if (dist(pt, proj) < 0.22) return proj;
      }
    }
    return applyDraftPointSnap(pt, anchor, { orthoSnap: true, angleToleranceDeg: 7 });
  };

  const commitDraftLoop = (pts: Point2D[]) => {
    if (pts.length < 3) return;
    const edges = buildWallEdgesFromPoints(pts, 'wall-edge');
    const builtFacets = buildWallFacetsFromPlan(
      { points: pts, edges },
      {
        defaultHeightM,
        existingFacets: wallPlan?.facets,
        roofLevels: levels
      }
    );
    const preservedExtras = (wallPlan?.facets || []).filter(
      (f) => f.kind === 'wing' || f.kind === 'secondary' || f.isSpur
    );
    const nextPlan: WallPlan = {
      points: pts,
      edges,
      defaultHeightM,
      spurEdges: wallPlan?.spurEdges,
      secondaryZones: wallPlan?.secondaryZones,
      facets: [...builtFacets, ...preservedExtras],
      builtAt: new Date().toISOString()
    };
    onUpdateWallPlan(nextPlan);
    setIsDrawing(false);
    setDrawMode('ring');
    setDraftPoints([]);
    setHoverPt(null);
    setTypedLengthBuffer('');
    lastAimPtRef.current = null;
    setSelectedVertexIdx(null);
    if (builtFacets[0]) {
      onSelectWallFacet(builtFacets[0].id);
    }
  };

  const commitWingPolyline = (pts: Point2D[]) => {
    if (pts.length < 2) return;
    const nextPlan = addWingWallToPlan(wallPlan, pts, { heightM: defaultHeightM });
    onUpdateWallPlan(nextPlan);
    setIsDrawing(false);
    setDrawMode('ring');
    setDraftPoints([]);
    setHoverPt(null);
    setTypedLengthBuffer('');
    lastAimPtRef.current = null;
    const lastCreated = nextPlan.facets[nextPlan.facets.length - 1];
    if (lastCreated) {
      onSelectWallFacet(lastCreated.id);
    }
  };

  const commitTypedWallLength = (rawInput: string) => {
    if (!isDrawing || draftPoints.length === 0) return false;
    const distM = parseDistanceInputToMetres(rawInput, 'auto');
    if (distM === null) return false;
    const lastPt = draftPoints[draftPoints.length - 1];
    const nextPt = computePointAtLengthInDirection(
      lastPt,
      hoverPt || lastAimPtRef.current,
      distM,
      { orthoSnap: true, fallbackDir: { x: 1, y: 0 } }
    );
    if (!nextPt || dist(lastPt, nextPt) < 0.05) return false;
    setTypedLengthBuffer('');
    if (drawMode === 'ring' && draftPoints.length >= 3 && pointsClose(nextPt, draftPoints[0], 0.25)) {
      commitDraftLoop(draftPoints);
      return true;
    }
    setDraftPoints((curr) => [...curr, nextPt]);
    lastAimPtRef.current = null;
    return true;
  };

  // SketchUp-style type-to-length & Close Square shortcuts while drawing floor plan or wing walls
  useEffect(() => {
    if (!isDrawing || readOnly) return;
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (typedLengthBuffer.length > 0) {
          setTypedLengthBuffer('');
          return;
        }
        if (draftPoints.length > 0) {
          setDraftPoints((p) => p.slice(0, -1));
        } else {
          setIsDrawing(false);
          setDrawMode('ring');
        }
        return;
      }
      if (draftPoints.length === 0) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setTypedLengthBuffer((prev) => (prev.length < 8 ? prev + e.key : prev));
        return;
      }
      if (e.key === '.' && !typedLengthBuffer.includes('.')) {
        e.preventDefault();
        setTypedLengthBuffer((prev) => (prev === '' ? '0.' : prev + '.'));
        return;
      }
      if (e.key === 'Backspace' && typedLengthBuffer.length > 0) {
        e.preventDefault();
        setTypedLengthBuffer((prev) => prev.slice(0, -1));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (typedLengthBuffer.trim().length > 0) {
          commitTypedWallLength(typedLengthBuffer);
        } else if (drawMode === 'wing' && draftPoints.length >= 2) {
          commitWingPolyline(draftPoints);
        } else if (drawMode === 'ring' && draftPoints.length >= 3) {
          commitDraftLoop(draftPoints);
        }
        return;
      }
      if (e.key.toLowerCase() === 'r' && drawMode === 'ring' && squareClosedPoints) {
        e.preventDefault();
        commitDraftLoop(squareClosedPoints);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawing, drawMode, readOnly, draftPoints, typedLengthBuffer, hoverPt, squareClosedPoints]);

  const handleBuildFacesFromPlan = () => {
    if (readOnly) return;
    if (wallPlan && wallPlan.points.length >= 3) {
      const edges =
        wallPlan.edges.length >= 3
          ? wallPlan.edges
          : buildWallEdgesFromPoints(wallPlan.points, 'wall-edge');
      const built = buildWallFacetsFromPlan(
        { points: wallPlan.points, edges },
        {
          defaultHeightM,
          existingFacets: wallPlan.facets,
          roofLevels: levels
        }
      );
      const mergedFacets = mergePreservedExtraFacets(wallPlan, built);
      onUpdateWallPlan({
        ...wallPlan,
        defaultHeightM,
        edges,
        facets: mergedFacets,
        builtAt: new Date().toISOString()
      });
      if (mergedFacets[0] && !mergedFacets.some((f) => f.id === selectedWallFacetId)) {
        onSelectWallFacet(mergedFacets[0].id);
      }
    } else {
      handleSeedFromRoof();
    }
  };

  const handleSeedFromRoof = () => {
    if (readOnly) return;
    const derived = deriveWallPlanFromRoofLevels(
      levels,
      defaultHeightM,
      wallPlan?.facets,
      roofPlanes
    );
    if (!derived) return;
    onUpdateWallPlan(derived);
    setIsDrawing(false);
    setDraftPoints([]);
    if (derived.facets[0]) {
      onSelectWallFacet(derived.facets[0].id);
    }
    const bodyCount = derived.bodies?.length || 1;
    setDeriveStatusText(
      `${bodyCount} ${bodyCount === 1 ? 'body' : 'bodies'} · ${derived.facets.length} faces`
    );
  };

  const handleConfirmAllDerived = () => {
    if (readOnly || !wallPlan) return;
    onUpdateWallPlan({
      ...wallPlan,
      facets: wallPlan.facets.map((f) =>
        f.claddingType !== 'none'
          ? { ...f, detailConfirmed: true, derivedDefaultCladding: undefined }
          : f
      ),
      builtAt: new Date().toISOString()
    });
  };

  const handleSyncRoofTops = () => {
    if (readOnly || !wallPlan) return;
    const synced = syncWallPlanWithRoof(wallPlan, levels, roofPlanes, {
      forceAllLinked: true
    });
    onUpdateWallPlan(synced);
  };

  const handleExportCsv = () => {
    if (!wallPlan) return;
    const payload = buildWallTakeoffExportData(wallPlan);
    const blob = new Blob([payload.csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wall-cladding-takeoff-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (!isDrawing) {
      setSelectedVertexIdx(null);
      return;
    }
    if (readOnly) return;
    const raw = getWorldFromClient(e.clientX, e.clientY);
    if (!raw) return;

    if (drawMode === 'ring' && draftPoints.length >= 3 && pointsClose(raw, draftPoints[0], 0.45)) {
      commitDraftLoop(draftPoints);
      return;
    }

    const prev = draftPoints[draftPoints.length - 1] || null;
    const snapped = snapToSitePoints(raw, prev);
    if (prev && dist(prev, snapped) < 0.1) return;
    setDraftPoints((curr) => [...curr, snapped]);
    setTypedLengthBuffer('');
    lastAimPtRef.current = null;
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      lastPinchDistRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      panDragRef.current = null;
      setIsPanDragging(false);
      return;
    }
    if (draggingVertexIdx !== null) return;
    if ((e.button === 1 || (e.button === 0 && (!isDrawing || e.altKey))) && activePointersRef.current.size === 1) {
      panDragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originPanX: panRef.current.x,
        originPanY: panRef.current.y,
        moved: false
      };
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    const fitScale = rect ? Math.min(rect.width / svgW, rect.height / svgH) || 1 : 1;

    if (activePointersRef.current.has(e.pointerId)) {
      const prev = activePointersRef.current.get(e.pointerId)!;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointersRef.current.size === 2) {
        const pts = Array.from(activePointersRef.current.values());
        const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        if (lastPinchDistRef.current !== null && lastPinchDistRef.current > 0) {
          const ratio = d / lastPinchDistRef.current;
          setZoom((z) => Math.max(0.5, Math.min(6.0, +(z * ratio).toFixed(3))));
        }
        lastPinchDistRef.current = d;
        setPan((p) => ({
          x: p.x + (e.clientX - prev.x) * 0.6,
          y: p.y + (e.clientY - prev.y) * 0.6
        }));
        return;
      }
    }

    if (panDragRef.current && panDragRef.current.pointerId === e.pointerId) {
      const dxScreen = e.clientX - panDragRef.current.startClientX;
      const dyScreen = e.clientY - panDragRef.current.startClientY;
      if (Math.hypot(dxScreen, dyScreen) > 4) {
        panDragRef.current.moved = true;
        setIsPanDragging(true);
      }
      if (panDragRef.current.moved) {
        setPan({
          x: panDragRef.current.originPanX + dxScreen / fitScale,
          y: panDragRef.current.originPanY + dyScreen / fitScale
        });
      }
      return;
    }

    const raw = getWorldFromClient(e.clientX, e.clientY);
    if (!raw) return;

    if (draggingVertexIdx !== null && wallPlan && !readOnly) {
      const adjPrevIdx =
        (draggingVertexIdx - 1 + wallPlan.points.length) % wallPlan.points.length;
      const snapped = snapToSitePoints(raw, wallPlan.points[adjPrevIdx]);
      const updated = moveWallPlanVertex(wallPlan, draggingVertexIdx, snapped, levels);
      onUpdateWallPlan(updated);
      return;
    }

    if (isDrawing) {
      const prev = draftPoints[draftPoints.length - 1] || null;
      const snappedHover = snapToSitePoints(raw, prev);
      setHoverPt(snappedHover);
      lastAimPtRef.current = snappedHover;
    }
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panDragRef.current && panDragRef.current.pointerId === e.pointerId) {
      if (panDragRef.current.moved) {
        suppressNextClickRef.current = true;
      }
      panDragRef.current = null;
      setIsPanDragging(false);
    }
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      lastPinchDistRef.current = null;
    }
    if (draggingVertexIdx !== null) {
      setDraggingVertexIdx(null);
    }
  };

  const handleSquareSelectedCorner = () => {
    if (readOnly || !wallPlan || selectedVertexIdx === null) return;
    if (selectedVertexIdx < 0 || selectedVertexIdx >= wallPlan.points.length) return;
    const squaredPts = squarePolygonCorner(wallPlan.points, selectedVertexIdx);
    const updated = moveWallPlanVertex(
      wallPlan,
      selectedVertexIdx,
      squaredPts[selectedVertexIdx],
      levels
    );
    onUpdateWallPlan(updated);
  };

  const handleApplyEdgeLength = () => {
    if (!wallPlan || !selectedWallFacetId || readOnly) return;
    const facet = wallPlan.facets.find((f) => f.id === selectedWallFacetId);
    if (!facet) return;
    const val = parseFloat(editLengthVal);
    if (!Number.isFinite(val) || val < 0.2) return;
    const edgeMatch = wallPlan.edges.find(
      (ed) =>
        pointsClose(ed.from, facet.from, 0.08) && pointsClose(ed.to, facet.to, 0.08)
    );
    const updated = updateWallPlanEdgeLength(wallPlan, edgeMatch?.id || facet.id, val, levels);
    onUpdateWallPlan(updated);
  };

  const handleSplitFacet = (facetId: string) => {
    if (!wallPlan || readOnly) return;
    const updated = splitWallFacetInPlan(wallPlan, facetId, undefined, levels);
    onUpdateWallPlan(updated);
  };

  const handlePromoteVoidToSecondary = (facetId: string, openingId: string, depthM: number) => {
    if (!wallPlan || readOnly) return;
    const res = createSecondaryZoneFromVoid(wallPlan, facetId, openingId, { depthM });
    if (!res) return;
    onUpdateWallPlan(res.wallPlan);
    if (res.createdFacets[0]) {
      onSelectWallFacet(res.createdFacets[0].id);
    }
  };

  const toggleMultiSelectFacet = (facetId: string) => {
    const next = multiSelectedFacetIds.includes(facetId)
      ? multiSelectedFacetIds.filter((id) => id !== facetId)
      : [...multiSelectedFacetIds, facetId];
    setMultiSelectedFacetIds(next);
  };

  const applyBatchToSelected = (patch: {
    claddingType?: WallCladdingType;
    kind?: WallFacetKind;
    heightM?: number;
    heightSource?: WallHeightSource;
  }) => {
    if (!wallPlan || multiSelectedFacetIds.length === 0) return;
    if (onBatchUpdateFacets) {
      onBatchUpdateFacets(multiSelectedFacetIds, patch);
      return;
    }
    onUpdateWallPlan(
      batchUpdateWallFacetsInPlan(wallPlan, multiSelectedFacetIds, {
        ...patch,
        roofLevels: levels,
        roofPlanes
      })
    );
  };

  const wallAsOutline: RoofOutline | null = useMemo(() => {
    if (!wallPlan || (wallPlan.points.length < 3 && wallPlan.facets.length === 0)) return null;
    return {
      id: 'wall-plan-outline',
      points: wallPlan.points.length >= 3 ? wallPlan.points : wallPlan.facets.flatMap((f) => [f.from, f.to]),
      edges: wallPlan.facets.map((f) => ({
        id: f.id,
        from: f.from,
        to: f.to,
        type: 'wall' as const
      }))
    };
  }, [wallPlan]);

  if (subView === 'elevation' && selectedFacet) {
    return (
      <WallElevationWorkbench
        facet={selectedFacet}
        facets={facets}
        projectPlans={projectPlans}
        roofLevels={levels}
        roofPlanes={roofPlanes}
        onSelectFacet={(id) => onSelectWallFacet(id)}
        onUpdateFacet={onUpdateWallFacet}
        onBackToPlan={() => setSubView('plan')}
        onPromoteVoidToSecondary={handlePromoteVoidToSecondary}
        secondaryZones={wallPlan?.secondaryZones || []}
        readOnly={readOnly}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full text-slate-100">
      {/* Top Action & Sub-View Toolbar */}
      <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center p-0.5 bg-[#070b14] rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setSubView('plan')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer flex items-center gap-1.5 ${
                subView === 'plan'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Floor Plan</span>
            </button>
            <button
              type="button"
              disabled={!selectedFacet}
              onClick={() => selectedFacet && setSubView('elevation')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer flex items-center gap-1.5 disabled:opacity-45 ${
                subView === 'elevation'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>
                {selectedFacet ? `Elevation (${selectedFacet.code})` : 'Elevation'}
              </span>
            </button>
          </div>

          {!readOnly && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (isDrawing && drawMode === 'ring') {
                    setIsDrawing(false);
                  } else {
                    setDrawMode('ring');
                    setIsDrawing(true);
                  }
                  setDraftPoints([]);
                  setHoverPt(null);
                  setTypedLengthBuffer('');
                  lastAimPtRef.current = null;
                  setSelectedVertexIdx(null);
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  isDrawing && drawMode === 'ring'
                    ? 'bg-amber-500 border-amber-400 text-slate-950'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>{isDrawing && drawMode === 'ring' ? 'Cancel Draw' : 'Draw Plan'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isDrawing && drawMode === 'wing') {
                    setIsDrawing(false);
                    setDrawMode('ring');
                  } else {
                    setDrawMode('wing');
                    setIsDrawing(true);
                  }
                  setDraftPoints([]);
                  setHoverPt(null);
                  setTypedLengthBuffer('');
                  lastAimPtRef.current = null;
                  setSelectedVertexIdx(null);
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  isDrawing && drawMode === 'wing'
                    ? 'bg-teal-500 border-teal-400 text-slate-950'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-teal-300'
                }`}
                title="Draw open wing, privacy screen, or freestanding courtyard wall polyline"
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>{isDrawing && drawMode === 'wing' ? 'Cancel Wing' : '+ Wing Wall'}</span>
              </button>

              <button
                type="button"
                onClick={handleSeedFromRoof}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-sky-300 flex items-center gap-1.5 cursor-pointer"
                title="Derive wall footprints under all roof bodies and eaves"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>From Roof</span>
              </button>

              {(deriveStatusText || (wallPlan?.bodies && wallPlan.bodies.length > 1)) && (
                <span className="px-2 py-1 rounded-lg bg-sky-950/60 border border-sky-500/35 text-[11px] font-mono font-bold text-sky-200 tabular-nums">
                  {deriveStatusText ||
                    `${wallPlan?.bodies?.length || 1} ${
                      (wallPlan?.bodies?.length || 1) === 1 ? 'body' : 'bodies'
                    } · ${facets.length} faces`}
                </span>
              )}

              <button
                type="button"
                onClick={handleBuildFacesFromPlan}
                disabled={(!wallPlan || wallPlan.points.length < 3) && levels.every((l) => l.outline.points.length < 3)}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Build Faces</span>
              </button>

              {wallPlan && wallPlan.facets.length > 0 && (
                <button
                  type="button"
                  onClick={handleSyncRoofTops}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-sky-300 flex items-center gap-1.5 cursor-pointer"
                  title="Snap linked wall tops cleanly to overlying roof eaves"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Sync Roof Tops</span>
                </button>
              )}

              {wallPlan && wallPlan.points.length >= 3 && onBuildRoofFromWalls && (
                <button
                  type="button"
                  onClick={() => onBuildRoofFromWalls(wallPlan)}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Copy wall outline to active roof level as RoofOutline (no auto skeleton)"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Build Roof</span>
                </button>
              )}

              {facets.length > 1 && (
                <button
                  type="button"
                  onClick={() => setWallMultiMode((v) => !v)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                    wallMultiMode || multiSelectedFacetIds.length >= 2
                      ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-200'
                      : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                  title="Tap multiple wall faces to batch edit (or Shift+Click)"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    {multiSelectedFacetIds.length >= 2
                      ? `Multi (${multiSelectedFacetIds.length})`
                      : 'Multi'}
                  </span>
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs flex-wrap">
          {facets.length > 0 && (
            <div className="flex flex-wrap items-center p-0.5 bg-[#070b14] rounded-xl border border-slate-800 gap-0.5">
              {(
                [
                  { id: 'all', label: `All (${facets.length})` },
                  { id: 'undetailed', label: `Needs Detail (${fullSummary.undetailedCount})` },
                  { id: 'returns', label: `Returns (${topology.returnFacesCount})` },
                  { id: 'parapets', label: `Parapets (${fullSummary.parapetFacesCount})` },
                  { id: 'secondary', label: `Secondary (${fullSummary.secondaryFacesCount})` },
                  { id: 'wings', label: `Wings (${fullSummary.wingFacesCount})` }
                ] as const
              ).map((flt) => (
                <button
                  key={flt.id}
                  type="button"
                  onClick={() => setFilterMode(flt.id)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                    filterMode === flt.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {flt.label}
                </button>
              ))}
            </div>
          )}

          <label className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1">
            <span className="text-[10px] font-bold text-slate-400">Default H</span>
            <input
              type="number"
              step="0.1"
              min="1.2"
              max="8"
              disabled={readOnly}
              value={defaultHeightM}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v >= 1.2) {
                  setDefaultHeightM(+v.toFixed(2));
                }
              }}
              className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-white font-mono font-bold text-xs tabular-nums text-right"
            />
            <span className="text-[10px] text-slate-500">m</span>
          </label>

          {!readOnly && wallPlan && (
            <button
              type="button"
              onClick={() => {
                onUpdateWallPlan(null);
                onSelectWallFacet(null);
              }}
              className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer"
              title="Clear Wall Plan"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Interactive Drawing Banner (with SketchUp Type-to-Length, Close Square & Open Wing Polyline) */}
      {isDrawing && (
        <div
          className={`rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs border ${
            drawMode === 'wing'
              ? 'bg-teal-950/60 border-teal-500/45'
              : 'bg-amber-950/60 border-amber-500/40'
          }`}
        >
          <span className={`font-bold ${drawMode === 'wing' ? 'text-teal-200' : 'text-amber-200'}`}>
            {drawMode === 'wing'
              ? `Wing Wall (${draftPoints.length} pts) · snap to wall/corner, type length + Enter`
              : `Tap corners (${draftPoints.length} pts) · aim & type length (m or mm) + Enter`}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {draftPoints.length >= 1 && (
              <form
                onSubmit={(ev) => {
                  ev.preventDefault();
                  commitTypedWallLength(typedLengthBuffer);
                }}
                className="flex items-center gap-1 bg-slate-950/90 border border-amber-500/40 rounded-lg px-1.5 py-0.5"
              >
                <Ruler className="w-3 h-3 text-amber-400" />
                <input
                  type="text"
                  inputMode="decimal"
                  value={typedLengthBuffer}
                  onChange={(ev) => setTypedLengthBuffer(ev.target.value)}
                  placeholder="Len m/mm"
                  aria-label="Typed wall segment length"
                  className="w-20 bg-transparent text-white font-mono font-bold text-xs placeholder:text-slate-500 focus:outline-hidden tabular-nums"
                />
                <button
                  type="submit"
                  disabled={parseDistanceInputToMetres(typedLengthBuffer, 'auto') === null}
                  className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] cursor-pointer disabled:opacity-35"
                >
                  Set
                </button>
              </form>
            )}
            <button
              type="button"
              disabled={draftPoints.length === 0}
              onClick={() => {
                setDraftPoints((p) => p.slice(0, -1));
                setTypedLengthBuffer('');
              }}
              className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
            {drawMode === 'ring' && squareClosedPoints && (
              <button
                type="button"
                onClick={() => commitDraftLoop(squareClosedPoints)}
                className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-extrabold flex items-center gap-1 cursor-pointer"
                title="Complete right-angle rectangle back to start (R)"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Close Square</span>
              </button>
            )}
            {drawMode === 'wing' ? (
              <button
                type="button"
                disabled={draftPoints.length < 2}
                onClick={() => commitWingPolyline(draftPoints)}
                className="px-2.5 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Finish Wing</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={draftPoints.length < 3}
                onClick={() => commitDraftLoop(draftPoints)}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Close &amp; Build</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Seed Roof Banner when a wall outline exists before roof */}
      {!readOnly &&
        !isDrawing &&
        wallPlan &&
        wallPlan.facets.length >= 3 &&
        levels.every((l) => l.outline.points.length < 3) &&
        onBuildRoofFromWalls && (
          <div className="bg-indigo-950/45 border border-indigo-500/40 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-indigo-200">
              <Compass className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="font-bold">
                Wall plan closed ({wallPlan.facets.length} faces) — ready to seed the roof footprint in site metres.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onBuildRoofFromWalls(wallPlan)}
              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold cursor-pointer"
            >
              Build roof from wall plan
            </button>
          </div>
        )}

      {/* Undetailed / Pending Confirmation Faces Prompt Strip */}
      {takeoffSummary.undetailedCount > 0 && nextUndetailedFacet && !isDrawing && (
        <div className="bg-amber-950/35 border border-amber-500/35 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-bold">
              {takeoffSummary.undetailedCount} wall{' '}
              {takeoffSummary.undetailedCount === 1 ? 'face still needs' : 'faces still need'}{' '}
              cladding confirmation or openings detail
              {topology.internalCornersCount > 0
                ? ` · ${topology.internalCornersCount} internal notch corners detected`
                : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {!readOnly &&
              facets.some((f) => isWallFacetUndetailed(f) && f.claddingType !== 'none') && (
                <button
                  type="button"
                  onClick={handleConfirmAllDerived}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer"
                  title="Accept defaulted Profiled Metal cladding on derived faces"
                >
                  Confirm Cladding
                </button>
              )}
            <button
              type="button"
              onClick={() => {
                onSelectWallFacet(nextUndetailedFacet.id);
                setSubView('elevation');
              }}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold cursor-pointer"
            >
              Detail Wall {nextUndetailedFacet.code}
            </button>
          </div>
        </div>
      )}

      {/* True-Scale 2D Floor Plan Canvas + Selected Wall Bar */}
      <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-2.5 flex flex-col gap-2.5 flex-1 min-h-[300px]">
        <div
          ref={viewportRef}
          className="relative flex-1 bg-[#070b14] border border-slate-800/90 rounded-xl overflow-hidden min-h-[260px] touch-none"
        >
          {/* Floating Plan Zoom / Fit Controls */}
          <div className="absolute top-2 right-2 z-15 flex items-center gap-0.5 p-0.5 rounded-xl bg-[#090d16]/90 backdrop-blur-md border border-slate-800 shadow-lg">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Zoom Out"
              aria-label="Zoom Out Wall Plan"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold text-slate-300 hover:text-white hover:bg-slate-800 tabular-nums cursor-pointer"
              title="Fit Plan"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(6.0, +(z + 0.25).toFixed(2)))}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Zoom In"
              aria-label="Zoom In Wall Plan"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="p-1.5 rounded-lg text-sky-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="Reset Fit"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${svgW} ${svgH}`}
            className={`w-full h-full select-none ${
              isPanDragging ? 'cursor-grabbing' : isDrawing ? 'cursor-crosshair' : 'cursor-grab'
            }`}
            onClick={handleSvgClick}
            onPointerDown={handleSvgPointerDown}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerCancel={handleSvgPointerUp}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Metric Blueprint Grid */}
            <g pointerEvents="none">
              {gridData.xLines.map((ln, idx) => (
                <line
                  key={`gx-${idx}`}
                  x1={ln.svgPos}
                  y1={0}
                  x2={ln.svgPos}
                  y2={svgH}
                  stroke={ln.isOrigin ? '#1e40af' : ln.isMajor ? '#17253d' : '#0f172a'}
                  strokeWidth={ln.isMajor ? 1 : 0.6}
                />
              ))}
              {gridData.yLines.map((ln, idx) => (
                <line
                  key={`gy-${idx}`}
                  x1={0}
                  y1={ln.svgPos}
                  x2={svgW}
                  y2={ln.svgPos}
                  stroke={ln.isOrigin ? '#1e40af' : ln.isMajor ? '#17253d' : '#0f172a'}
                  strokeWidth={ln.isMajor ? 1 : 0.6}
                />
              ))}
            </g>

            {/* Calibrated Site Plan Underlay */}
            {planUnderlay && planUnderlay.visible !== false && planUnderlay.isCalibrated && (
              <image
                href={planUnderlay.imageUrl}
                x={toSvgX(planUnderlay.worldX)}
                y={toSvgY(planUnderlay.worldY)}
                width={planUnderlay.worldWidthM * pxPerM}
                height={planUnderlay.worldHeightM * pxPerM}
                opacity={planUnderlay.opacity ?? 0.32}
                preserveAspectRatio="none"
                pointerEvents="none"
              />
            )}

            {/* Roof Footprint Ghost Reference */}
            {levels.map((lvl) => {
              if (lvl.outline.points.length < 3) return null;
              const ptsStr = lvl.outline.points
                .map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`)
                .join(' ');
              return (
                <polygon
                  key={`roof-ghost-${lvl.id}`}
                  points={ptsStr}
                  fill="rgba(59, 130, 246, 0.04)"
                  stroke="#334155"
                  strokeWidth="1.4"
                  strokeDasharray="6 4"
                  pointerEvents="none"
                />
              );
            })}

            {/* Closed Floor Plan Polygon Fills (all multi-body rings) */}
            {wallPlan &&
              (wallPlan.bodies && wallPlan.bodies.length > 0
                ? wallPlan.bodies
                : wallPlan.points.length >= 3
                ? [{ id: 'primary', points: wallPlan.points }]
                : []
              ).map((b, bIdx) =>
                b.points.length >= 3 ? (
                  <polygon
                    key={`wall-body-fill-${b.id || bIdx}`}
                    points={b.points.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ')}
                    fill="rgba(14, 165, 233, 0.08)"
                    stroke="none"
                    pointerEvents="none"
                  />
                ) : null
              )}

            {/* Labelled Wall Facets */}
            {wallAsOutline &&
              facets.map((facet) => {
                const x1 = toSvgX(facet.from.x);
                const y1 = toSvgY(facet.from.y);
                const x2 = toSvgX(facet.to.x);
                const y2 = toSvgY(facet.to.y);
                const isSel = facet.id === selectedWallFacetId;
                const isMultiSel = multiSelectedFacetIds.includes(facet.id);
                const isUndetailed = isWallFacetUndetailed(facet);
                const isReturn = returnFacetIdSet.has(facet.id);
                const facetKind = getWallFacetKind(facet);
                const kindMeta = getWallFacetKindMeta(facetKind);
                const isWing = facetKind === 'wing' || Boolean(facet.isSpur);
                const isParapet = facetKind === 'parapet';
                const isSecondary = facetKind === 'secondary';
                const matchesFilter =
                  filterMode === 'all' ||
                  (filterMode === 'undetailed' && isUndetailed) ||
                  (filterMode === 'returns' && isReturn) ||
                  (filterMode === 'parapets' && isParapet) ||
                  (filterMode === 'secondary' && isSecondary) ||
                  (filterMode === 'wings' && isWing);

                const primary = getFacetPrimaryDisplayCladding(facet);
                const meta = getWallCladdingMeta(primary);
                const dimPlace = computeEdgeDimensionPlacement(
                  {
                    id: facet.id,
                    from: facet.from,
                    to: facet.to,
                    type: 'wall'
                  },
                  wallAsOutline,
                  0.65
                );
                const labelX = toSvgX(dimPlace.labelPos.x);
                const labelY = toSvgY(dimPlace.labelPos.y);
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;

                return (
                  <g
                    key={facet.id}
                    opacity={matchesFilter ? 1 : 0.24}
                    className={isDrawing ? 'pointer-events-none' : 'cursor-pointer'}
                    onClick={(e) => {
                      if (isDrawing) return;
                      e.stopPropagation();
                      if ((e.shiftKey || wallMultiMode) && !readOnly) {
                        toggleMultiSelectFacet(facet.id);
                        return;
                      }
                      onSelectWallFacet(facet.id);
                    }}
                    onDoubleClick={(e) => {
                      if (isDrawing) return;
                      e.stopPropagation();
                      onSelectWallFacet(facet.id);
                      setSubView('elevation');
                    }}
                  >
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth="18"
                    />
                    {(isMultiSel || isParapet) && (
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={isMultiSel ? '#10b981' : '#c084fc'}
                        strokeWidth={isMultiSel ? 10 : 8}
                        strokeOpacity={isMultiSel ? 0.55 : 0.4}
                        strokeLinecap="round"
                      />
                    )}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={
                        isSel
                          ? '#38bdf8'
                          : isUndetailed
                          ? '#f59e0b'
                          : isWing
                          ? '#2dd4bf'
                          : isSecondary
                          ? '#a78bfa'
                          : facetKind === 'abutment'
                          ? '#fb923c'
                          : meta.hex
                      }
                      strokeWidth={isSel ? 5.5 : isReturn ? 4.2 : 3.5}
                      strokeDasharray={
                        isWing
                          ? '7 4'
                          : isSecondary
                          ? '5 3'
                          : facetKind === 'void_edge'
                          ? '2 3'
                          : undefined
                      }
                      strokeLinecap="round"
                    />

                    {/* Wall Code Node */}
                    <g transform={`translate(${midX}, ${midY})`}>
                      <circle
                        r="11"
                        fill={isSel ? '#0284c7' : '#0b101d'}
                        stroke={
                          isMultiSel
                            ? '#10b981'
                            : isSel
                            ? '#ffffff'
                            : isParapet
                            ? '#c084fc'
                            : isWing
                            ? '#2dd4bf'
                            : isSecondary
                            ? '#a78bfa'
                            : facetKind === 'abutment'
                            ? '#fb923c'
                            : isUndetailed
                            ? '#f59e0b'
                            : meta.hex
                        }
                        strokeWidth="2"
                      />
                      <text
                        y="3.8"
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize="10"
                        fontWeight="900"
                        fontFamily="monospace"
                      >
                        {facet.code}
                      </text>
                    </g>

                    {/* Outward True-Length + Kind + Opening Readout */}
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      fill={isSel ? '#7dd3fc' : isParapet ? '#d8b4fe' : isWing ? '#5eead4' : isSecondary ? '#c4b5fd' : '#cbd5e1'}
                      fontSize="10.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                      pointerEvents="none"
                    >
                      {facet.lengthM.toFixed(2)}m
                      {facetKind !== 'exterior' ? ` · ${kindMeta.shortLabel}` : ''}
                      {facet.openings.length > 0 ? ` (${facet.openings.length})` : ''}
                    </text>
                  </g>
                );
              })}

            {/* Corner Markers (Internal Concave Notches Highlighted in Amber) */}
            {!isDrawing &&
              topology.cornerDetails.map((c, idx) => {
                if (c.kind !== 'internal') return null;
                return (
                  <g
                    key={`ic-${idx}`}
                    transform={`translate(${toSvgX(c.point.x)}, ${toSvgY(c.point.y)})`}
                    pointerEvents="none"
                  >
                    <circle
                      r="9"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.6"
                      strokeDasharray="3 2"
                    />
                  </g>
                );
              })}

            {/* Draggable & Selectable Corner Vertices (tap to select & square 90°) */}
            {!isDrawing &&
              !readOnly &&
              wallPlan &&
              wallPlan.points.map((pt, idx) => {
                const isSelCorner = selectedVertexIdx === idx;
                return (
                  <g
                    key={`wv-${idx}`}
                    className="cursor-move"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedVertexIdx(idx);
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedVertexIdx(idx);
                      setDraggingVertexIdx(idx);
                    }}
                  >
                    <circle
                      cx={toSvgX(pt.x)}
                      cy={toSvgY(pt.y)}
                      r="11"
                      fill="transparent"
                    />
                    {isSelCorner && (
                      <circle
                        cx={toSvgX(pt.x)}
                        cy={toSvgY(pt.y)}
                        r="10"
                        fill="none"
                        stroke="#fbbf24"
                        strokeWidth="1.8"
                        strokeDasharray="3 2"
                      />
                    )}
                    <circle
                      cx={toSvgX(pt.x)}
                      cy={toSvgY(pt.y)}
                      r={isSelCorner ? 6.5 : 5.5}
                      fill={isSelCorner ? '#f59e0b' : '#0f172a'}
                      stroke={isSelCorner ? '#ffffff' : '#38bdf8'}
                      strokeWidth="2"
                    />
                  </g>
                );
              })}

            {/* Selected Corner Angle Badge */}
            {!isDrawing &&
              wallPlan &&
              selectedVertexIdx !== null &&
              selectedCornerAngleDeg !== null &&
              wallPlan.points[selectedVertexIdx] && (
                <g
                  transform={`translate(${toSvgX(wallPlan.points[selectedVertexIdx].x)}, ${
                    toSvgY(wallPlan.points[selectedVertexIdx].y) - 18
                  })`}
                  pointerEvents="none"
                >
                  <rect
                    x="-28"
                    y="-10"
                    width="56"
                    height="18"
                    rx="6"
                    fill="#0b101d"
                    stroke="#f59e0b"
                    strokeWidth="1.2"
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fill="#fde68a"
                    fontSize="10"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {selectedCornerAngleDeg.toFixed(1)}°
                  </text>
                </g>
              )}

            {/* Draft Polyline Preview */}
            {isDrawing && draftPoints.length > 0 && (
              <g pointerEvents="none">
                <polyline
                  points={draftPoints.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ')}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                />
                {(typedPreviewPt || hoverPt) && (() => {
                  const last = draftPoints[draftPoints.length - 1];
                  const target = typedPreviewPt || hoverPt!;
                  return (
                    <>
                      <line
                        x1={toSvgX(last.x)}
                        y1={toSvgY(last.y)}
                        x2={toSvgX(target.x)}
                        y2={toSvgY(target.y)}
                        stroke={typedPreviewPt ? '#38bdf8' : '#fbbf24'}
                        strokeWidth={typedPreviewPt ? '2.8' : '2'}
                        strokeDasharray="5 4"
                      />
                      <text
                        x={(toSvgX(last.x) + toSvgX(target.x)) / 2}
                        y={(toSvgY(last.y) + toSvgY(target.y)) / 2 - 8}
                        textAnchor="middle"
                        fill={typedPreviewPt ? '#7dd3fc' : '#fde68a'}
                        fontSize="12"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {dist(last, target).toFixed(2)}m
                      </text>
                      {typedPreviewPt && (
                        <circle
                          cx={toSvgX(typedPreviewPt.x)}
                          cy={toSvgY(typedPreviewPt.y)}
                          r="5"
                          fill="#38bdf8"
                          stroke="#070b14"
                          strokeWidth="1.5"
                        />
                      )}
                    </>
                  );
                })()}
                {draftPoints.map((p, i) => (
                  <circle
                    key={`dp-${i}`}
                    cx={toSvgX(p.x)}
                    cy={toSvgY(p.y)}
                    r={i === 0 ? 7 : 4.5}
                    fill={i === 0 ? '#10b981' : '#fbbf24'}
                    stroke="#070b14"
                    strokeWidth="2"
                  />
                ))}
              </g>
            )}

            {/* Dynamic CAD Scale Bar */}
            <g transform={`translate(18, ${svgH - 22})`} pointerEvents="none">
              <line x1="0" y1="0" x2={scaleBar.pixelWidth} y2="0" stroke="#94a3b8" strokeWidth="2" />
              <line x1="0" y1="-4" x2="0" y2="4" stroke="#94a3b8" strokeWidth="1.5" />
              <line
                x1={scaleBar.pixelWidth}
                y1="-4"
                x2={scaleBar.pixelWidth}
                y2="4"
                stroke="#94a3b8"
                strokeWidth="1.5"
              />
              <text
                x={scaleBar.pixelWidth + 6}
                y="3.5"
                fill="#94a3b8"
                fontSize="10"
                fontFamily="monospace"
              >
                {scaleBar.fullLabel}
              </text>
            </g>
          </svg>

          {/* Empty State Call-to-Action */}
          {!wallPlan && !isDrawing && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4">
              <div className="pointer-events-auto bg-[#0b101d]/95 border border-slate-700 rounded-2xl p-4 max-w-sm text-center space-y-2.5 shadow-2xl">
                <div className="text-sm font-extrabold text-white">
                  Single-Storey Wall Cladding Setup
                </div>
                <p className="text-xs text-slate-400">
                  Derive walls cleanly under your existing roof eaves or draw a custom floor plan on the same site grid.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={readOnly || levels.every((l) => l.outline.points.length < 3)}
                    onClick={handleSeedFromRoof}
                    className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Derive from Roof</span>
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      setIsDrawing(true);
                      setDraftPoints([]);
                    }}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Draw Floor Plan</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Selected Corner Square 90° Action Overlay */}
          {!isDrawing &&
            !readOnly &&
            wallPlan &&
            selectedVertexIdx !== null &&
            selectedCornerAngleDeg !== null && (
              <div className="absolute bottom-2.5 right-2.5 z-15 bg-[#0b101d]/95 border border-amber-500/45 rounded-xl px-2.5 py-1.5 flex items-center gap-2 text-xs shadow-xl">
                <span className="font-mono text-amber-200 font-bold tabular-nums">
                  Corner #{selectedVertexIdx + 1} · {selectedCornerAngleDeg.toFixed(1)}°
                </span>
                <button
                  type="button"
                  onClick={handleSquareSelectedCorner}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold flex items-center gap-1 cursor-pointer"
                  title="Force this corner to 90 degrees without shifting neighbors"
                >
                  <Square className="w-3 h-3" />
                  <span>Square 90°</span>
                </button>
              </div>
            )}
        </div>

        {/* Selected Wall Face Quick Action Bar */}
        {selectedFacet && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="w-6 h-6 rounded-lg flex items-center justify-center font-mono font-black text-xs text-white border border-white/20 shrink-0"
                style={{
                  backgroundColor: getWallCladdingMeta(
                    getFacetPrimaryDisplayCladding(selectedFacet)
                  ).hex
                }}
              >
                {selectedFacet.code}
              </span>
              <div className="min-w-0">
                <div className="font-bold text-white truncate flex items-center gap-1.5 flex-wrap">
                  <span>
                    Wall {selectedFacet.code} ·{' '}
                    {selectedFacet.regions && selectedFacet.regions.length > 1
                      ? `${selectedFacet.regions.length} Mixed Regions`
                      : getWallCladdingMeta(selectedFacet.claddingType).label}
                    {selectedFacet.heightSource === 'roof' ? ' · From Roof' : ''}
                  </span>
                  {getWallFacetKind(selectedFacet) !== 'exterior' && (
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-bold text-sky-300">
                      {getWallFacetKindMeta(getWallFacetKind(selectedFacet)).shortLabel}
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {selectedFacet.lengthM.toFixed(2)}m × {selectedFacet.heightM.toFixed(2)}m ·{' '}
                  {computeWallFacetMetrics(selectedFacet).netCladdingAreaM2.toFixed(2)} m² net ·{' '}
                  {selectedFacet.openings.length} openings
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!readOnly && (
                <>
                  <div className="flex items-center gap-1">
                    <Ruler className="w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="number"
                      step="0.05"
                      min="0.2"
                      value={editLengthVal}
                      onFocus={(e) => {
                        isEditingLenRef.current = true;
                        e.currentTarget.select();
                      }}
                      onChange={(e) => setEditLengthVal(e.target.value)}
                      onBlur={() => {
                        isEditingLenRef.current = false;
                        handleApplyEdgeLength();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                        if (e.key === 'Escape') {
                          isEditingLenRef.current = false;
                          setEditLengthVal(selectedFacet.lengthM.toFixed(2));
                          (e.currentTarget as HTMLInputElement).blur();
                        }
                      }}
                      className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs tabular-nums"
                      title="Edit wall length (m)"
                    />
                    <span className="text-[11px] text-slate-500">m</span>
                  </div>
                  <button
                    type="button"
                    disabled={selectedFacet.lengthM < 0.4}
                    onClick={() => handleSplitFacet(selectedFacet.id)}
                    className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    title="Split selected wall face cleanly at midpoint (Shift+Click faces to batch edit)"
                  >
                    <Scissors className="w-3 h-3 text-amber-400" />
                    <span>Split</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setSubView('elevation')}
                className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold cursor-pointer flex items-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Detail Elevation</span>
              </button>
            </div>
          </div>
        )}

        {/* Multi-Select Batch Apply Bar (Multi mode, Shift+Click on Plan, or Checkboxes in Faces Table) */}
        {!readOnly && wallPlan && (multiSelectedFacetIds.length >= 1 || wallMultiMode) && (
          <div className="bg-emerald-950/35 border border-emerald-500/40 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-emerald-300">
                {multiSelectedFacetIds.length === 0
                  ? 'Multi-Select Active (tap faces or select filtered)'
                  : `${multiSelectedFacetIds.length} wall ${multiSelectedFacetIds.length === 1 ? 'face' : 'faces'} selected`}
              </span>
              {filteredFacets.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMultiSelectedFacetIds(filteredFacets.map((f) => f.id))}
                  className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-200 cursor-pointer"
                >
                  Select Shown ({filteredFacets.length})
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={batchCladding}
                onChange={(e) => setBatchCladding(e.target.value as WallCladdingType)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white font-bold"
              >
                {WALL_CLADDING_OPTIONS.map((opt) => (
                  <option key={opt.type} value={opt.type}>
                    {opt.shortLabel}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={multiSelectedFacetIds.length === 0}
                onClick={() => applyBatchToSelected({ claddingType: batchCladding })}
                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                Apply Cladding
              </button>

              <select
                value={batchKind}
                onChange={(e) => setBatchKind(e.target.value as WallFacetKind | '')}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white font-bold"
              >
                <option value="">Role...</option>
                {WALL_FACET_KIND_OPTIONS.map((opt) => (
                  <option key={opt.kind} value={opt.kind}>
                    {opt.shortLabel}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!batchKind || multiSelectedFacetIds.length === 0}
                onClick={() => batchKind && applyBatchToSelected({ kind: batchKind })}
                className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                Set Role
              </button>

              <input
                type="number"
                step="0.1"
                min="0.4"
                max="8"
                placeholder="H (m)"
                value={batchHeightM}
                onChange={(e) => setBatchHeightM(e.target.value)}
                className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white font-mono tabular-nums"
              />
              <button
                type="button"
                disabled={
                  multiSelectedFacetIds.length === 0 ||
                  !Number.isFinite(parseFloat(batchHeightM)) ||
                  parseFloat(batchHeightM) < 0.4
                }
                onClick={() => {
                  const h = parseFloat(batchHeightM);
                  if (Number.isFinite(h) && h >= 0.4) {
                    applyBatchToSelected({ heightM: h, heightSource: 'manual' });
                  }
                }}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold text-[11px] cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                Set H
              </button>

              <select
                value={batchHeightSource}
                onChange={(e) => setBatchHeightSource(e.target.value as WallHeightSource | '')}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-white font-bold"
              >
                <option value="">Height Source...</option>
                <option value="manual">Manual</option>
                <option value="roof">From Roof Eave</option>
              </select>
              <button
                type="button"
                disabled={!batchHeightSource || multiSelectedFacetIds.length === 0}
                onClick={() =>
                  batchHeightSource &&
                  applyBatchToSelected({ heightSource: batchHeightSource })
                }
                className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                Set Source
              </button>

              <button
                type="button"
                onClick={() => {
                  setMultiSelectedFacetIds([]);
                  setWallMultiMode(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                title="Clear Selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Takeoff Schedules & Corner Topology Card */}
      {facets.length > 0 && (
        <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-3 space-y-2.5 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center p-0.5 bg-[#070b14] rounded-xl border border-slate-800">
                {(
                  [
                    { id: 'summary', label: 'Cladding Summary' },
                    { id: 'faces', label: `Per Face (${filteredFacets.length})` },
                    { id: 'openings', label: `Openings (${openingsSchedule.totalCount})` }
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setScheduleTab(st.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                      scheduleTab === st.id
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {(fullSummary.secondaryFacesCount > 0 || takeoffScope !== 'all') && (
                <div className="flex items-center p-0.5 bg-[#070b14] rounded-xl border border-slate-800">
                  {(
                    [
                      { id: 'all', label: 'All Scope' },
                      { id: 'primary', label: 'Primary' },
                      { id: 'secondary', label: 'Secondary' }
                    ] as const
                  ).map((sc) => (
                    <button
                      key={sc.id}
                      type="button"
                      onClick={() => setTakeoffScope(sc.id)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                        takeoffScope === sc.id
                          ? 'bg-violet-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {sc.label}
                    </button>
                  ))}
                </div>
              )}

              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                {topology.externalCornersCount} ext · {topology.internalCornersCount} int notch ·{' '}
                {topology.returnFacesCount} returns
                {takeoffSummary.parapetCopingLm > 0
                  ? ` · ${takeoffSummary.parapetCopingLm.toFixed(1)} lm coping`
                  : ''}
              </span>
            </div>

            <div className="flex items-center gap-3 text-xs tabular-nums font-mono">
              <span className="text-slate-400">
                Gross {takeoffSummary.totalGrossAreaM2.toFixed(1)} m²
              </span>
              <span className="text-amber-400">
                Openings −{takeoffSummary.totalOpeningsAreaM2.toFixed(1)} m²
              </span>
              <span className="text-emerald-400 font-extrabold">
                Net {takeoffSummary.totalNetAreaM2.toFixed(1)} m²
              </span>
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-sans text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                title="Download Wall Cladding & Openings CSV"
              >
                <Download className="w-3 h-3 text-sky-400" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Linked Secondary Wall Sections Manager */}
          {wallPlan?.secondaryZones && wallPlan.secondaryZones.length > 0 && (
            <div className="bg-violet-950/25 border border-violet-500/35 rounded-xl p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-extrabold text-violet-200">
                  Secondary Wall Sections ({wallPlan.secondaryZones.length})
                </span>
                <span className="font-mono text-violet-300 tabular-nums">
                  {fullSummary.secondaryNetAreaM2.toFixed(2)} m² net
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {wallPlan.secondaryZones.map((zone) => (
                  <div
                    key={zone.id}
                    className="flex flex-wrap items-center gap-2 bg-slate-950/90 border border-violet-500/30 rounded-lg px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="font-bold text-white">{zone.name}</span>
                    {!readOnly && (
                      <>
                        <label className="flex items-center gap-1 text-slate-400">
                          <span>Depth</span>
                          <input
                            type="number"
                            step="0.1"
                            min="0.3"
                            max="12"
                            value={+zone.depthM.toFixed(2)}
                            onChange={(e) => {
                              const d = parseFloat(e.target.value);
                              if (Number.isFinite(d) && d >= 0.3) {
                                onUpdateWallPlan(updateSecondaryZoneDepth(wallPlan, zone.id, d));
                              }
                            }}
                            className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono font-bold text-right tabular-nums"
                          />
                          <span>m</span>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateWallPlan(
                              updateSecondaryZoneDepth(
                                wallPlan,
                                zone.id,
                                zone.depthM,
                                zone.direction === 'outward' ? 'inward' : 'outward'
                              )
                            )
                          }
                          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-violet-200 font-bold cursor-pointer"
                          title="Flip Inward vs Outward enclosure direction"
                        >
                          {zone.direction === 'outward' ? 'Outward' : 'Inward'}
                        </button>
                      </>
                    )}
                    <div className="flex items-center gap-1">
                      {zone.facetIds.map((fid, i) => {
                        const cf = facets.find((f) => f.id === fid);
                        if (!cf) return null;
                        return (
                          <button
                            key={fid}
                            type="button"
                            onClick={() => {
                              onSelectWallFacet(fid);
                              setSubView('elevation');
                            }}
                            className="px-1.5 py-0.5 rounded bg-violet-600/25 hover:bg-violet-600/45 border border-violet-500/40 text-violet-200 font-mono font-bold cursor-pointer"
                          >
                            {cf.code || `S${i + 1}`}
                          </button>
                        );
                      })}
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => onUpdateWallPlan(removeSecondaryZone(wallPlan, zone.id))}
                        className="p-0.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Remove Secondary Section"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {scheduleTab === 'summary' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                    <th className="py-1.5 pr-3 font-bold">Cladding Type</th>
                    <th className="py-1.5 px-2 font-bold">Faces</th>
                    <th className="py-1.5 px-2 font-bold text-right">Lineal (m)</th>
                    <th className="py-1.5 px-2 font-bold text-right">Gross (m²)</th>
                    <th className="py-1.5 px-2 font-bold text-right">Openings (m²)</th>
                    <th className="py-1.5 pl-2 font-bold text-right">Net Cladding (m²)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {takeoffSummary.byCladding.map((grp) => (
                    <tr key={grp.claddingType} className="text-slate-200">
                      <td className="py-1.5 pr-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-xs shrink-0 border border-white/20"
                            style={{ backgroundColor: grp.hex }}
                          />
                          <span className="font-bold">{grp.label}</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 font-mono text-slate-400">
                        {grp.faceCodes.join(', ')}
                      </td>
                      <td className="py-1.5 px-2 font-mono text-right">{grp.linealM.toFixed(2)}</td>
                      <td className="py-1.5 px-2 font-mono text-right">{grp.grossAreaM2.toFixed(2)}</td>
                      <td className="py-1.5 px-2 font-mono text-right text-amber-400">
                        {grp.openingsAreaM2 > 0 ? `−${grp.openingsAreaM2.toFixed(2)}` : '0.00'}
                      </td>
                      <td className="py-1.5 pl-2 font-mono text-right font-extrabold text-emerald-400">
                        {grp.netAreaM2.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {scheduleTab === 'faces' && (
            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                    {!readOnly && <th className="py-1.5 pr-1 font-bold w-6">Sel</th>}
                    <th className="py-1.5 pr-2 font-bold">Face</th>
                    <th className="py-1.5 px-2 font-bold">Role</th>
                    <th className="py-1.5 px-2 font-bold">Cladding</th>
                    <th className="py-1.5 px-2 font-bold text-right">L × H</th>
                    <th className="py-1.5 px-2 font-bold">Height Source</th>
                    <th className="py-1.5 px-2 font-bold text-right">Openings</th>
                    <th className="py-1.5 px-2 font-bold text-right">Net (m²)</th>
                    <th className="py-1.5 pl-2 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredFacets.map((f) => {
                    const m = computeWallFacetMetrics(f);
                    const undetailed = isWallFacetUndetailed(f);
                    const isRet = returnFacetIdSet.has(f.id);
                    const prim = getFacetPrimaryDisplayCladding(f);
                    const fk = getWallFacetKind(f);
                    const km = getWallFacetKindMeta(fk);
                    const isMulti = multiSelectedFacetIds.includes(f.id);
                    return (
                      <tr
                        key={f.id}
                        onClick={() => onSelectWallFacet(f.id)}
                        className="text-slate-200 hover:bg-slate-900/60 cursor-pointer"
                      >
                        {!readOnly && (
                          <td
                            className="py-1.5 pr-1"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              toggleMultiSelectFacet(f.id);
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isMulti}
                              onChange={() => {}}
                              className="accent-emerald-500 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="py-1.5 pr-2 font-mono font-bold">
                          {f.code}
                          {isRet ? ' (Return)' : ''}
                        </td>
                        <td className="py-1.5 px-2">
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-bold text-slate-300">
                            {km.shortLabel}
                          </span>
                        </td>
                        <td className="py-1.5 px-2">
                          {f.regions && f.regions.length > 1
                            ? f.regions
                                .map((r) => getWallCladdingMeta(r.claddingType).shortLabel)
                                .join(' + ')
                            : getWallCladdingMeta(prim).shortLabel}
                        </td>
                        <td className="py-1.5 px-2 font-mono text-right">
                          {f.lengthM.toFixed(2)} × {f.heightM.toFixed(2)}m
                        </td>
                        <td className="py-1.5 px-2 text-slate-400">
                          {f.heightSource === 'roof' ? 'Roof Eave' : 'Manual'}
                        </td>
                        <td className="py-1.5 px-2 font-mono text-right">{f.openings.length}</td>
                        <td
                          className={`py-1.5 px-2 font-mono text-right font-bold ${
                            undetailed ? 'text-amber-400' : 'text-emerald-400'
                          }`}
                        >
                          {m.netCladdingAreaM2.toFixed(2)}
                        </td>
                        <td className="py-1.5 pl-2 text-right space-x-2">
                          {!readOnly && f.lengthM >= 0.4 && (
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleSplitFacet(f.id);
                              }}
                              className="text-amber-400 hover:text-amber-300 font-bold cursor-pointer"
                            >
                              Split
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onSelectWallFacet(f.id);
                              setSubView('elevation');
                            }}
                            className="text-sky-400 hover:text-sky-300 font-bold cursor-pointer"
                          >
                            {undetailed ? 'Detail' : 'Edit'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {scheduleTab === 'openings' && (
            <div className="overflow-x-auto max-h-56 overflow-y-auto">
              {openingsSchedule.rows.length === 0 ? (
                <div className="text-xs text-slate-400 py-2">
                  No windows, doors, or garage openings added yet. Open any wall elevation to add openings.
                </div>
              ) : (
                <table className="w-full text-left text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                      <th className="py-1.5 pr-2 font-bold">Wall</th>
                      <th className="py-1.5 px-2 font-bold">Label</th>
                      <th className="py-1.5 px-2 font-bold">Type</th>
                      <th className="py-1.5 px-2 font-bold text-right">W × H (m)</th>
                      <th className="py-1.5 px-2 font-bold text-right">Sill Z (m)</th>
                      <th className="py-1.5 pl-2 font-bold text-right">Area (m²)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {openingsSchedule.rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => {
                          onSelectWallFacet(row.facetId);
                          setSubView('elevation');
                        }}
                        className="text-slate-200 hover:bg-slate-900/60 cursor-pointer"
                      >
                        <td className="py-1.5 pr-2 font-mono font-bold text-sky-300">
                          {row.facetCode}
                        </td>
                        <td className="py-1.5 px-2 font-bold">{row.label}</td>
                        <td className="py-1.5 px-2 capitalize text-slate-400">{row.type}</td>
                        <td className="py-1.5 px-2 font-mono text-right">
                          {row.widthM.toFixed(2)} × {row.heightM.toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 font-mono text-right">
                          {row.sillHeightM.toFixed(2)}
                        </td>
                        <td className="py-1.5 pl-2 font-mono text-right font-bold text-amber-400">
                          {row.areaM2.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
