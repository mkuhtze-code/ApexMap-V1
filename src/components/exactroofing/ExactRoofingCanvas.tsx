import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  EdgeType,
  RoofOutline,
  RoofLevel,
  SkeletonLine,
  PlanEdge,
  RoofPlane,
  Point2D,
  LayoutResult,
  RoofAsset,
  RoofAssetType,
  PitchBreakLine,
  RoofFlashingAssignment,
  AssignableRoofLine,
  RoofPlanUnderlay
} from '../../types/exactRoofing';
import { ArchitecturalPlan } from '../../types/crm';
import {
  moveVertex,
  deleteVertex,
  insertVertexOnEdge,
  buildOutlineFromPoints,
  buildAttachedOutlineFromEdge,
  buildCompleteSquarePoints,
  snapPointToSupportingLine,
  computeCornerAngleDeg,
  computePointAtLengthInDirection,
  parseDistanceInputToMetres,
  squareOutlineCorner,
  updateEdgeLength,
  updateSkeletonLineLength,
  getRoofJunctionNodes,
  computeGableDormerGeometry,
  computeAssetPlacementMetrics,
  syncAssetRelationshipFields,
  computeEdgeSetbackLine,
  getDefaultEdgeSetbackM,
  isEdgeWallEnabled,
  isPointInPolygon,
  applyDraftPointSnap,
  calibrateDraftPointsFromFirstLine,
  calibratePlanUnderlayFromTwoPoints,
  scalePlanUnderlayFromFactor,
  scaleOutlineUniformly,
  worldToPlanUnderlayNorm,
  planUnderlayNormToWorld,
  PlanViewportBounds,
  dist
} from '../../utils/exactRoofingEngine';
import {
  FirstLineScaleModal,
  TwoPointScaleModal,
  LoadArchitecturalPlanModal
} from './PlanScaleModals';
import {
  Pencil,
  Plus,
  Move,
  Trash2,
  Wand2,
  Check,
  X,
  RotateCcw,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Layers,
  PenTool,
  ChevronDown,
  Sparkles,
  Wrench,
  Ruler,
  Sliders,
  Star,
  FileImage,
  Undo2,
  Crosshair,
  Link2,
  GitBranch,
  Square
} from 'lucide-react';
import { useDeviceDetection } from '../../hooks/useDeviceDetection';
import {
  computeMetricGridLines,
  computeDynamicScaleBar,
  computeSheetCourseSegments,
  computePlaneDirectionOverlay,
  computeEdgeDimensionPlacement
} from './canvas2d/cadGeometryHelpers';

export type SimpleToolMode =
  | 'set_pitch'
  | 'assign_flashing'
  | 'draw_roof'
  | 'scale_plan'
  | 'add_line'
  | 'add_feature'
  | 'adjust_shape'
  | 'delete_line';

export type FeaturePlacementType = RoofAssetType | 'pitch_break';

interface Props {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  planes: RoofPlane[];
  levels?: RoofLevel[];
  activeLevelId?: string;
  onSelectLevel?: (levelId: string) => void;
  onAddLevel?: () => void;
  onUpdateEdgeEaveHeight?: (edgeId: string, heightM: number) => void;
  onUpdateEdgeWall?: (edgeId: string, updates: { hasWall?: boolean; eaveSetbackM?: number }) => void;
  onSetEdgeMode?: (edgeId: string, mode: 'hipped' | 'gable' | 'wall') => void;
  selectedPlaneId: string | null;
  layout?: LayoutResult;
  startPlaneId?: string | null;
  assets?: RoofAsset[];
  pitchBreaks?: PitchBreakLine[];
  selectedAssetId?: string | null;
  selectedPitchBreakId?: string | null;
  onSetStartPlane?: (planeId: string) => void;
  onSelectPlane: (planeId: string | null) => void;
  onUpdatePlaneOrderedSheetLength?: (planeId: string, lengthM: number | undefined) => void;
  onUpdateOutline: (
    outline: RoofOutline,
    options?: {
      autoGenerateSkeleton?: boolean;
      mode?: 'replace' | 'add';
      attachedEdgeId?: string;
      scaleFactor?: number;
      scaleAnchor?: Point2D;
    }
  ) => void;
  onUpdateSkeleton: (skeleton: SkeletonLine[]) => void;
  onSelectEdgeToDefine: (edge: PlanEdge) => void;
  onDeletePlane: (planeId: string) => void;
  onRunSkeletonKey: () => void;
  onClearToBlank?: () => void;
  onToggleJunctionGable?: (junctionId: string) => void;
  onToggleEdgeGable?: (edgeId: string, forceMode?: 'hipped' | 'gable') => void;
  onAddAsset?: (asset: RoofAsset) => void;
  onUpdateAsset?: (asset: RoofAsset) => void;
  onDeleteAsset?: (assetId: string) => void;
  onSelectAsset?: (assetId: string | null) => void;
  onAddPitchBreak?: (pb: PitchBreakLine) => void;
  onDeletePitchBreak?: (pbId: string) => void;
  onSelectPitchBreak?: (pbId: string | null) => void;
  flashingAssignments?: RoofFlashingAssignment[];
  assignableLines?: AssignableRoofLine[];
  onSelectLineForFlashing?: (lineId: string) => void;
  readOnlyGeometry?: boolean;
  customSequenceMap?: Map<string, number>;
  completedPlaneIds?: string[];
  onInstallSelectPlane?: (planeId: string) => void;
  onOpenAiAssistant?: () => void;
  onOpenInspector?: () => void;
  planUnderlay?: RoofPlanUnderlay | null;
  projectPlans?: ArchitecturalPlan[];
  onUpdatePlanUnderlay?: (underlay: RoofPlanUnderlay | null) => void;
  openPlanModalSignal?: number;
}

export const ExactRoofingCanvas: React.FC<Props> = ({
  outline,
  skeleton,
  planes,
  levels,
  activeLevelId = 'level-1',
  onSelectLevel,
  onAddLevel,
  onUpdateEdgeEaveHeight,
  onUpdateEdgeWall,
  onSetEdgeMode,
  selectedPlaneId,
  layout,
  startPlaneId,
  assets = [],
  pitchBreaks = [],
  selectedAssetId,
  selectedPitchBreakId,
  onSetStartPlane,
  onSelectPlane,
  onUpdatePlaneOrderedSheetLength,
  onUpdateOutline,
  onUpdateSkeleton,
  onSelectEdgeToDefine,
  onDeletePlane,
  onRunSkeletonKey,
  onToggleJunctionGable,
  onToggleEdgeGable,
  onAddAsset,
  onUpdateAsset,
  onDeleteAsset,
  onSelectAsset,
  onAddPitchBreak,
  onDeletePitchBreak,
  onSelectPitchBreak,
  flashingAssignments = [],
  assignableLines = [],
  onSelectLineForFlashing,
  readOnlyGeometry = false,
  customSequenceMap: _customSequenceMap,
  completedPlaneIds = [],
  onInstallSelectPlane,
  onOpenAiAssistant,
  onOpenInspector,
  planUnderlay = null,
  projectPlans = [],
  onUpdatePlanUnderlay,
  openPlanModalSignal
}) => {
  const { isMobile, isTouchDevice } = useDeviceDetection();

  const [activeTool, setActiveTool] = useState<SimpleToolMode>(
    outline.points.length === 0 ? (planUnderlay && !planUnderlay.isCalibrated ? 'scale_plan' : 'draw_roof') : 'set_pitch'
  );
  const [isMobileToolsOpen, setIsMobileToolsOpen] = useState<boolean>(false);
  const [showAllDims, setShowAllDims] = useState<boolean>(false);
  const [inspectedLine, setInspectedLine] = useState<{ kind: 'edge' | 'skeleton'; id: string } | null>(null);

  // Freehand drawing, attach-to-edge & scaling state
  const [draftPoints, setDraftPoints] = useState<Point2D[]>([]);
  const [drawSubMode, setDrawSubMode] = useState<'free' | 'attach_edge'>('free');
  const [attachedEdge, setAttachedEdge] = useState<PlanEdge | null>(null);
  const [lockedDraftBounds, setLockedDraftBounds] = useState<PlanViewportBounds | null>(null);
  const [draftScaleReady, setDraftScaleReady] = useState<boolean>(false);
  const [orthoSnap, setOrthoSnap] = useState<boolean>(true);
  const [isFirstLineModalOpen, setIsFirstLineModalOpen] = useState<boolean>(false);
  const [scalePoints, setScalePoints] = useState<Point2D[]>([]);
  const [isTwoPointScaleModalOpen, setIsTwoPointScaleModalOpen] = useState<boolean>(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState<boolean>(false);
  const [mousePos, setMousePos] = useState<Point2D | null>(null);
  const [typedLengthBuffer, setTypedLengthBuffer] = useState<string>('');
  const lastAimPosRef = useRef<Point2D | null>(null);
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);

  const hasExistingFootprint = useMemo(
    () =>
      outline.points.length >= 3 ||
      Boolean(levels && levels.some((l) => l.outline.points.length >= 3)),
    [outline.points.length, levels]
  );

  const hasEstablishedScale = Boolean(planUnderlay?.isCalibrated || hasExistingFootprint);

  const allDisplayEdges = useMemo(
    () =>
      levels && levels.length > 0
        ? levels.flatMap((l) => l.outline.edges)
        : outline.edges,
    [levels, outline.edges]
  );

  const allDisplayOutlinePoints = useMemo(
    () =>
      levels && levels.length > 0
        ? levels.flatMap((l) => l.outline.points)
        : outline.points,
    [levels, outline.points]
  );

  const displaySkeleton = useMemo(
    () =>
      activeLevelId === 'all' && levels && levels.length > 1
        ? levels.flatMap((l) => l.skeleton)
        : skeleton,
    [activeLevelId, levels, skeleton]
  );

  const lastOutlineIdRef = useRef<string>(outline.id);
  const lastPlanIdRef = useRef<string | null>(planUnderlay?.id || null);

  useEffect(() => {
    if (outline.id !== lastOutlineIdRef.current) {
      lastOutlineIdRef.current = outline.id;
      if (outline.points.length === 0) {
        setDraftPoints([]);
        setAttachedEdge(null);
        setDrawSubMode('free');
        setLockedDraftBounds(null);
        setDraftScaleReady(Boolean(planUnderlay?.isCalibrated));
        setIsFirstLineModalOpen(false);
        setActiveTool(planUnderlay && !planUnderlay.isCalibrated ? 'scale_plan' : 'draw_roof');
      }
    }
  }, [outline.id, outline.points.length, planUnderlay]);

  useEffect(() => {
    const nextPlanId = planUnderlay?.id || null;
    if (nextPlanId !== lastPlanIdRef.current) {
      lastPlanIdRef.current = nextPlanId;
      if (planUnderlay && !planUnderlay.isCalibrated) {
        setScalePoints([]);
        setDraftPoints([]);
        setAttachedEdge(null);
        setDrawSubMode('free');
        setLockedDraftBounds(null);
        setDraftScaleReady(false);
        setActiveTool('scale_plan');
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    }
  }, [planUnderlay]);

  useEffect(() => {
    if (openPlanModalSignal && openPlanModalSignal > 0) {
      setIsPlanModalOpen(true);
    }
  }, [openPlanModalSignal]);

  // Add internal roof line state (polyline chain + 3-pt angle bisector)
  const [newLineType, setNewLineType] = useState<'ridge' | 'hip' | 'valley'>('hip');
  const [lineStartPt, setLineStartPt] = useState<Point2D | null>(null);
  const [chainLineMode, setChainLineMode] = useState<boolean>(true);
  const [bisectMode, setBisectMode] = useState<boolean>(false);
  const [bisectPts, setBisectPts] = useState<Point2D[]>([]);

  // Add feature / dormer / skylight / pitch break state
  const [featureType, setFeatureType] = useState<FeaturePlacementType>('skylight');
  const [dragBoxStart, setDragBoxStart] = useState<Point2D | null>(null);
  const [dragBoxCurrent, setDragBoxCurrent] = useState<Point2D | null>(null);
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);

  // Dragging vertex state
  const [draggedVertexIdx, setDraggedVertexIdx] = useState<number | null>(null);

  useEffect(() => {
    if (
      activeTool !== 'adjust_shape' ||
      selectedVertexIdx === null ||
      selectedVertexIdx >= outline.points.length
    ) {
      if (selectedVertexIdx !== null) setSelectedVertexIdx(null);
    }
  }, [activeTool, outline.points.length, selectedVertexIdx]);

  // Shared tool guards: geometry/drawing tools must not trigger plane/junction/ghost selection
  const isDrawingOrGeometryTool =
    activeTool === 'add_line' ||
    activeTool === 'draw_roof' ||
    activeTool === 'add_feature' ||
    activeTool === 'scale_plan' ||
    activeTool === 'adjust_shape' ||
    activeTool === 'delete_line';

  // Canvas-tap tools where clicks over roof faces/edges/assets pass through to the SVG canvas
  const isCanvasTapTool =
    activeTool === 'add_line' ||
    activeTool === 'draw_roof' ||
    activeTool === 'scale_plan' ||
    activeTool === 'add_feature';

  // Zoom & Pan state for precision on mobile & desktop CAD screens
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpacePanning, setIsSpacePressed] = useState<boolean>(false);
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
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Lookup map for assigned flashings & assignable line telemetry per roof line ID
  const assignmentByLineId = useMemo(() => {
    const map = new Map<string, RoofFlashingAssignment>();
    flashingAssignments.forEach((a) => map.set(a.lineId, a));
    return map;
  }, [flashingAssignments]);

  const assignableByLineId = useMemo(() => {
    const map = new Map<string, AssignableRoofLine>();
    assignableLines.forEach((l) => map.set(l.lineId, l));
    return map;
  }, [assignableLines]);

  const selectedPlaneObj = useMemo(
    () => planes.find((p) => p.id === selectedPlaneId) || null,
    [planes, selectedPlaneId]
  );

  const [faceSheetDraftMm, setFaceSheetDraftMm] = useState<string>('');
  useEffect(() => {
    if (!selectedPlaneObj) {
      setFaceSheetDraftMm('');
      return;
    }
    const curM = selectedPlaneObj.orderedSheetLengthM ?? selectedPlaneObj.slopeLength ?? 0;
    setFaceSheetDraftMm(curM > 0 ? String(Math.round(curM * 1000)) : '');
  }, [selectedPlaneObj?.id, selectedPlaneObj?.orderedSheetLengthM, selectedPlaneObj?.slopeLength]);

  const commitFaceSheetDraft = () => {
    if (!selectedPlaneObj || !onUpdatePlaneOrderedSheetLength) return;
    const raw = faceSheetDraftMm.trim();
    if (!raw) {
      onUpdatePlaneOrderedSheetLength(selectedPlaneObj.id, undefined);
      return;
    }
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      const curM = selectedPlaneObj.orderedSheetLengthM ?? selectedPlaneObj.slopeLength ?? 0;
      setFaceSheetDraftMm(curM > 0 ? String(Math.round(curM * 1000)) : '');
      return;
    }
    const lengthM =
      parsed >= 100
        ? +(Math.round(parsed) / 1000).toFixed(3)
        : parsed >= 0.3 && parsed <= 40
        ? +parsed.toFixed(3)
        : 0;
    if (lengthM < 0.3 || lengthM > 40) return;

    const modeledMm = Math.round((selectedPlaneObj.slopeLength || 0) * 1000);
    const nextMm = Math.round(lengthM * 1000);
    if (modeledMm > 0 && nextMm === modeledMm) {
      onUpdatePlaneOrderedSheetLength(selectedPlaneObj.id, undefined);
    } else {
      onUpdatePlaneOrderedSheetLength(selectedPlaneObj.id, +(nextMm / 1000).toFixed(3));
    }
    setFaceSheetDraftMm(String(nextMm));
  };

  // Clickable Ridge/Hip Junctions for Hip <-> Gable conversion
  const junctionNodes = useMemo(
    () => getRoofJunctionNodes(outline, skeleton),
    [outline, skeleton]
  );

  // Small Anchored Numerical Input Overlay state (updates geometry immediately)
  const [editingMeasurement, setEditingMeasurement] = useState<{
    type: 'edge' | 'roof_line';
    id: string;
    label: string;
    currentLengthM: number;
    leftPx: number;
    topPx: number;
    baseOutline: RoofOutline;
    baseSkeleton: SkeletonLine[];
  } | null>(null);
  const [measurementInput, setMeasurementInput] = useState<string>('');

  // Measure viewport dimensions so mobile portrait viewports render edge-to-edge SVG without dark bands
  const [vpSize, setVpSize] = useState<{ w: number; h: number }>({ w: 860, h: 560 });
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
  }, []);

  // Canvas bounds & scaling (locked cleanly while drafting or calibrating so points never jump)
  const bounds: PlanViewportBounds = useMemo(() => {
    if (lockedDraftBounds && (draftPoints.length > 0 || scalePoints.length > 0 || activeTool === 'scale_plan')) {
      return lockedDraftBounds;
    }

    const levelPts =
      levels && levels.length > 0
        ? levels.flatMap((l) => l.outline.points)
        : outline.points;

    const allPts: Point2D[] = [...levelPts];
    if (planUnderlay && planUnderlay.visible !== false) {
      allPts.push(
        { x: planUnderlay.worldX, y: planUnderlay.worldY },
        {
          x: planUnderlay.worldX + planUnderlay.worldWidthM,
          y: planUnderlay.worldY + planUnderlay.worldHeightM
        }
      );
    }

    if (allPts.length === 0) {
      return { minX: 0, maxX: 16, minY: 0, maxY: 12, width: 16, height: 12 };
    }
    const xs = allPts.map((p) => p.x);
    const ys = allPts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(maxX - minX, 2);
    const height = Math.max(maxY - minY, 2);
    return { minX, maxX, minY, maxY, width, height };
  }, [outline, levels, planUnderlay, lockedDraftBounds, draftPoints.length, scalePoints.length, activeTool]);

  const padding = isMobile ? 26 : 55;
  const svgWidth = isMobile ? vpSize.w : 860;
  const svgHeight = isMobile ? vpSize.h : 560;
  const drawWidth = Math.max(80, svgWidth - padding * 2);
  const drawHeight = Math.max(80, svgHeight - padding * 2);
  const baseScale = Math.min(drawWidth / bounds.width, drawHeight / bounds.height);
  const scale = baseScale * zoom;

  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;
  const geomCenterX = bounds.minX + bounds.width / 2;
  const geomCenterY = bounds.minY + bounds.height / 2;

  const toSvgX = (x: number) => centerX + (x - geomCenterX) * scale + pan.x;
  const toSvgY = (y: number) => centerY + (y - geomCenterY) * scale + pan.y;
  const fromSvgX = (svgX: number) => geomCenterX + (svgX - centerX - pan.x) / scale;
  const fromSvgY = (svgY: number) => geomCenterY + (svgY - centerY - pan.y) / scale;

  // Snap to step grid (0.05m when plan underlay calibrated, 0.25m/0.5m default)
  const snap = (val: number, step = planUnderlay ? 0.05 : 0.25) => Math.round(val / step) * step;

  // Magnetic vertex/junction/midpoint/edge snap for exact manual roof line placement
  const getSnappedLinePoint = (rawPt: Point2D): { pt: Point2D; snapped: boolean } => {
    const snapPx = isTouchDevice ? 22 : 14;
    const snapRadiusM = Math.max(0.22, Math.min(0.85, snapPx / Math.max(scale, 10)));

    // Priority 1: Existing outline corners (all levels) & skeleton endpoints
    const primaryCandidates: Point2D[] = [
      ...allDisplayOutlinePoints,
      ...displaySkeleton.flatMap((s) => [s.from, s.to])
    ];
    let bestPt: Point2D | null = null;
    let bestD = snapRadiusM;
    for (const c of primaryCandidates) {
      const d = dist(rawPt, c);
      if (d < bestD) {
        bestD = d;
        bestPt = c;
      }
    }
    if (bestPt) {
      return { pt: { x: +bestPt.x.toFixed(3), y: +bestPt.y.toFixed(3) }, snapped: true };
    }

    // Priority 2: Outline edge & skeleton midpoints
    const midCandidates: Point2D[] = [
      ...allDisplayEdges.map((e) => ({
        x: (e.from.x + e.to.x) / 2,
        y: (e.from.y + e.to.y) / 2
      })),
      ...displaySkeleton.map((s) => ({
        x: (s.from.x + s.to.x) / 2,
        y: (s.from.y + s.to.y) / 2
      }))
    ];
    bestD = snapRadiusM * 0.85;
    for (const c of midCandidates) {
      const d = dist(rawPt, c);
      if (d < bestD) {
        bestD = d;
        bestPt = c;
      }
    }
    if (bestPt) {
      return { pt: { x: +bestPt.x.toFixed(3), y: +bestPt.y.toFixed(3) }, snapped: true };
    }

    // Priority 3: Perpendicular projection onto outline / skeleton segments
    let bestProj: Point2D | null = null;
    let bestSegDist = snapRadiusM * 0.65;
    const allSegs = [
      ...allDisplayEdges.map((e) => ({ from: e.from, to: e.to })),
      ...displaySkeleton.map((s) => ({ from: s.from, to: s.to }))
    ];
    for (const seg of allSegs) {
      const vx = seg.to.x - seg.from.x;
      const vy = seg.to.y - seg.from.y;
      const lenSq = vx * vx + vy * vy;
      if (lenSq < 1e-6) continue;
      const t = Math.max(
        0,
        Math.min(1, ((rawPt.x - seg.from.x) * vx + (rawPt.y - seg.from.y) * vy) / lenSq)
      );
      const proj = { x: seg.from.x + vx * t, y: seg.from.y + vy * t };
      const d = dist(rawPt, proj);
      if (d < bestSegDist) {
        bestSegDist = d;
        bestProj = proj;
      }
    }
    if (bestProj) {
      return { pt: { x: +bestProj.x.toFixed(3), y: +bestProj.y.toFixed(3) }, snapped: true };
    }

    return { pt: { x: +snap(rawPt.x).toFixed(2), y: +snap(rawPt.y).toFixed(2) }, snapped: false };
  };

  // Snap draft clicks onto existing corners across levels so multi-body roofs join cleanly
  const snapDraftPointToExisting = (pt: Point2D): Point2D => {
    const snapPx = isTouchDevice ? 20 : 12;
    const snapRadiusM = Math.max(0.18, Math.min(0.65, snapPx / Math.max(scale, 10)));
    let best: Point2D | null = null;
    let bestD = snapRadiusM;
    for (const c of allDisplayOutlinePoints) {
      const d = dist(pt, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best ? { x: +best.x.toFixed(3), y: +best.y.toFixed(3) } : pt;
  };

  // Resolve draw_roof cursor point: prioritizes existing corners, then host supporting line (infinite extension), then ortho/precision snap
  const resolveDrawRoofPointerPoint = (
    clientX: number,
    clientY: number,
    prevPt: Point2D | null
  ): Point2D => {
    const rawPt = getPlanPointFromPointer(clientX, clientY, 'raw');
    const cornerFromRaw = snapDraftPointToExisting(rawPt);
    if (cornerFromRaw.x !== rawPt.x || cornerFromRaw.y !== rawPt.y) {
      return cornerFromRaw;
    }
    if (attachedEdge) {
      const snapPx = isTouchDevice ? 22 : 14;
      const lineSnapRadiusM = Math.max(0.25, Math.min(0.85, snapPx / Math.max(scale, 10)));
      const lineRes = snapPointToSupportingLine(
        rawPt,
        attachedEdge.from,
        attachedEdge.to,
        lineSnapRadiusM
      );
      if (lineRes.snapped) {
        return lineRes.pt;
      }
    }
    const drafted = getPlanPointFromPointer(clientX, clientY, 'draft', prevPt);
    return snapDraftPointToExisting(drafted);
  };

  // Convert pointer event to world coordinates accurately under object-contain
  const getPlanPointFromPointer = (
    clientX: number,
    clientY: number,
    mode: 'raw' | 'draft' | 'edit' = 'edit',
    anchorPt?: Point2D | null
  ): Point2D => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / svgWidth;
    const scaleY = rect.height / svgHeight;
    const fitScale = Math.min(scaleX, scaleY);
    const renderedW = svgWidth * fitScale;
    const renderedH = svgHeight * fitScale;
    const offsetX = rect.left + (rect.width - renderedW) / 2;
    const offsetY = rect.top + (rect.height - renderedH) / 2;

    const svgX = (clientX - offsetX) / fitScale;
    const svgY = (clientY - offsetY) / fitScale;
    const rawX = fromSvgX(svgX);
    const rawY = fromSvgY(svgY);

    if (mode === 'raw') {
      return { x: +rawX.toFixed(4), y: +rawY.toFixed(4) };
    }
    if (mode === 'draft') {
      return applyDraftPointSnap({ x: rawX, y: rawY }, anchorPt, {
        orthoSnap,
        precisionStepM: 0.01
      });
    }
    return { x: +snap(rawX).toFixed(2), y: +snap(rawY).toFixed(2) };
  };

  // Cursor-anchored desktop mouse wheel zoom & keyboard CAD shortcuts
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      if (isFirstLineModalOpen || isTwoPointScaleModalOpen || isPlanModalOpen) return;
      const svg = svgRef.current;
      if (!svg) return;
      e.preventDefault();

      const rect = svg.getBoundingClientRect();
      const fitScale = Math.min(rect.width / svgWidth, rect.height / svgHeight) || 1;
      const renderedW = svgWidth * fitScale;
      const renderedH = svgHeight * fitScale;
      const offsetX = rect.left + (rect.width - renderedW) / 2;
      const offsetY = rect.top + (rect.height - renderedH) / 2;
      const cursorSvgX = (e.clientX - offsetX) / fitScale;
      const cursorSvgY = (e.clientY - offsetY) / fitScale;

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
  }, [svgWidth, svgHeight, centerX, centerY, isFirstLineModalOpen, isTwoPointScaleModalOpen, isPlanModalOpen]);

  const hasActiveTypedSegment =
    (activeTool === 'draw_roof' && draftPoints.length >= 1) ||
    (activeTool === 'add_line' && Boolean(lineStartPt) && !bisectMode);

  const squareClosedPoints = useMemo(
    () => (activeTool === 'draw_roof' ? buildCompleteSquarePoints(draftPoints, orthoSnap) : null),
    [activeTool, draftPoints, orthoSnap]
  );

  const selectedCornerAngleDeg = useMemo(() => {
    if (activeTool !== 'adjust_shape' || selectedVertexIdx === null) return null;
    return computeCornerAngleDeg(outline.points, selectedVertexIdx);
  }, [activeTool, outline.points, selectedVertexIdx]);

  const typedSegmentPreview = useMemo(() => {
    if (!hasActiveTypedSegment || !typedLengthBuffer.trim()) return null;
    const distM = parseDistanceInputToMetres(typedLengthBuffer, 'auto');
    if (distM === null) return null;
    const fromPt =
      activeTool === 'draw_roof' ? draftPoints[draftPoints.length - 1] : lineStartPt;
    if (!fromPt) return null;
    const aimPt = mousePos || lastAimPosRef.current;
    const keepHostAxis = Boolean(
      activeTool === 'draw_roof' &&
        attachedEdge &&
        aimPt &&
        snapPointToSupportingLine(aimPt, attachedEdge.from, attachedEdge.to, 0.02).snapped
    );
    const toPt = computePointAtLengthInDirection(fromPt, aimPt, distM, {
      orthoSnap: keepHostAxis ? false : orthoSnap,
      fallbackDir: { x: 1, y: 0 }
    });
    if (!toPt) return null;
    return { fromPt, toPt, lengthM: distM };
  }, [hasActiveTypedSegment, typedLengthBuffer, activeTool, draftPoints, lineStartPt, mousePos, orthoSnap, attachedEdge]);

  const commitTypedSegmentLength = (rawInput: string): boolean => {
    if (readOnlyGeometry || !hasActiveTypedSegment) return false;
    const distM = parseDistanceInputToMetres(rawInput, 'auto');
    if (distM === null) return false;

    if (activeTool === 'draw_roof' && draftPoints.length >= 1) {
      const fromPt = draftPoints[draftPoints.length - 1];
      const aimPt = mousePos || lastAimPosRef.current;
      const keepHostAxis = Boolean(
        attachedEdge &&
          aimPt &&
          snapPointToSupportingLine(aimPt, attachedEdge.from, attachedEdge.to, 0.02).snapped
      );
      const nextPt = computePointAtLengthInDirection(fromPt, aimPt, distM, {
        orthoSnap: keepHostAxis ? false : orthoSnap,
        fallbackDir: { x: 1, y: 0 }
      });
      if (!nextPt || dist(fromPt, nextPt) < 0.05) return false;

      if (!lockedDraftBounds) {
        setLockedDraftBounds({ ...bounds });
      }
      setTypedLengthBuffer('');
      lastAimPosRef.current = null;

      if (draftPoints.length >= 3 && dist(nextPt, draftPoints[0]) < 0.25) {
        finishCustomOutline();
        return true;
      }

      const nextDraft = [...draftPoints, nextPt];
      setDraftPoints(nextDraft);
      if (nextDraft.length === 2 && !draftScaleReady && !hasEstablishedScale) {
        setDraftScaleReady(true);
      }
      return true;
    }

    if (activeTool === 'add_line' && lineStartPt && !bisectMode) {
      const nextPt = computePointAtLengthInDirection(
        lineStartPt,
        mousePos || lastAimPosRef.current,
        distM,
        { orthoSnap, fallbackDir: { x: 1, y: 0 } }
      );
      if (!nextPt || dist(lineStartPt, nextPt) < 0.08) return false;
      setTypedLengthBuffer('');
      lastAimPosRef.current = null;
      commitAddLinePoint(nextPt);
      return true;
    }

    return false;
  };

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || isFirstLineModalOpen || isTwoPointScaleModalOpen || isPlanModalOpen) {
        return;
      }
      if (e.code === 'Space') {
        setIsSpacePressed(true);
        return;
      }
      if (e.key === 'Escape') {
        if (typedLengthBuffer.length > 0) {
          setTypedLengthBuffer('');
          return;
        }
        if (editingMeasurement) {
          setEditingMeasurement(null);
          return;
        }
        if (inspectedLine) {
          setInspectedLine(null);
          return;
        }
        if (bisectPts.length > 0) {
          setBisectPts([]);
          return;
        }
        if (lineStartPt) {
          setLineStartPt(null);
          return;
        }
        if (dragBoxStart) {
          setDragBoxStart(null);
          setDragBoxCurrent(null);
          return;
        }
        if (activeTool === 'scale_plan') {
          setScalePoints([]);
          setLockedDraftBounds(null);
          setActiveTool(outline.points.length === 0 ? 'draw_roof' : 'set_pitch');
          return;
        }
        if (activeTool === 'draw_roof' && draftPoints.length > 0) {
          const next = draftPoints.slice(0, -1);
          setDraftPoints(next);
          if (next.length < 2 && !hasEstablishedScale) setDraftScaleReady(false);
          if (next.length === 0) setLockedDraftBounds(null);
          return;
        }
        if (activeTool === 'draw_roof' && attachedEdge) {
          setAttachedEdge(null);
          setLockedDraftBounds(null);
          return;
        }
        setActiveTool('set_pitch');
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // SketchUp-style type-to-length entry while drawing a segment
      if (hasActiveTypedSegment && !readOnlyGeometry) {
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
            commitTypedSegmentLength(typedLengthBuffer);
          } else if (activeTool === 'draw_roof' && draftPoints.length >= 3) {
            finishCustomOutline();
          }
          return;
        }
      }

      const key = e.key.toLowerCase();
      if (key === 'r' && !readOnlyGeometry && activeTool === 'draw_roof' && squareClosedPoints) {
        e.preventDefault();
        finishCustomOutline(squareClosedPoints);
        return;
      }
      if (key === 'v') {
        setActiveTool('set_pitch');
      } else if (key === 'm') {
        setShowAllDims((v) => !v);
      } else if (key === '0') {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      } else if (!readOnlyGeometry) {
        if (key === 'd') {
          setActiveTool('draw_roof');
          setAttachedEdge(null);
          setDrawSubMode('free');
          setTypedLengthBuffer('');
          setDraftScaleReady(hasEstablishedScale);
        } else if (key === 'l') {
          setActiveTool('add_line');
          setBisectPts([]);
          setTypedLengthBuffer('');
        } else if (key === 'f') {
          setActiveTool('add_feature');
        } else if (key === 'e') {
          setActiveTool('adjust_shape');
        } else if (key === 'o') {
          setOrthoSnap((v) => !v);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    isFirstLineModalOpen,
    isTwoPointScaleModalOpen,
    isPlanModalOpen,
    editingMeasurement,
    inspectedLine,
    bisectPts.length,
    lineStartPt,
    dragBoxStart,
    activeTool,
    draftPoints,
    attachedEdge,
    outline.points.length,
    hasEstablishedScale,
    readOnlyGeometry,
    hasActiveTypedSegment,
    typedLengthBuffer,
    squareClosedPoints,
    mousePos,
    orthoSnap
  ]);

  // Helper: place feature (skylight, chimney, dormers, pitch break) at point or drag box on host plane
  const placeFeatureAt = (ptA: Point2D, ptB?: Point2D) => {
    const centerPt = ptB
      ? { x: +((ptA.x + ptB.x) / 2).toFixed(2), y: +((ptA.y + ptB.y) / 2).toFixed(2) }
      : ptA;

    const hostPlane = planes.find((p) => isPointInPolygon(centerPt, p.planPolygon));
    if (!hostPlane || hostPlane.planPolygon.length < 3) return;

    if (featureType === 'pitch_break') {
      const p0 = hostPlane.planPolygon[0];
      const p1 = hostPlane.planPolygon[1] || p0;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const uVec = { x: dx / len, y: dy / len };
      const vInward = hostPlane.runDirection || { x: -uVec.y, y: uVec.x };
      const rawDist = (centerPt.x - p0.x) * vInward.x + (centerPt.y - p0.y) * vInward.y;
      const splitPlanDistM = +Math.max(0.8, rawDist).toFixed(2);
      const lowerPitch = Math.max(4, +(hostPlane.pitchDeg - 10).toFixed(1));
      const newPb: PitchBreakLine = {
        id: `pb-${Date.now().toString().slice(-5)}`,
        planeId: hostPlane.id,
        splitPlanDistM,
        lowerPitchDeg: lowerPitch,
        label: `Apron ${lowerPitch}°`
      };
      onAddPitchBreak?.(newPb);
      onSelectPitchBreak?.(newPb.id);
      return;
    }

    const defaults: Record<RoofAssetType, { w: number; d: number; pitch?: number; label: string }> = {
      skylight: { w: 1.2, d: 1.5, label: 'Skylight' },
      chimney: { w: 1.0, d: 1.0, pitch: 0, label: 'Chimney' },
      mono_dormer: { w: 2.4, d: 2.2, pitch: 12, label: 'Mono Dormer' },
      gable_dormer: { w: 2.6, d: 2.4, pitch: 25, label: 'Gable Dormer' }
    };
    const def = defaults[featureType];

    // If user dragged a custom bounding rectangle, compute widthM (along u) & depthM (along vInward)
    let widthM = def.w;
    let depthM = def.d;
    if (ptB && dist(ptA, ptB) >= 0.45) {
      const p0 = hostPlane.planPolygon[0];
      const p1 = hostPlane.planPolygon[1] || p0;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const uVec = { x: dx / len, y: dy / len };
      const vInward = hostPlane.runDirection || { x: -uVec.y, y: uVec.x };
      const dX = ptB.x - ptA.x;
      const dY = ptB.y - ptA.y;
      const spanU = Math.abs(dX * uVec.x + dY * uVec.y);
      const spanV = Math.abs(dX * vInward.x + dY * vInward.y);
      widthM = +Math.max(0.6, Math.min(8.0, snap(spanU, 0.25))).toFixed(2);
      depthM = +Math.max(0.6, Math.min(6.0, snap(spanV, 0.25))).toFixed(2);
    }

    const newAsset: RoofAsset = syncAssetRelationshipFields(hostPlane, {
      id: `asset-${featureType}-${Date.now().toString().slice(-5)}`,
      type: featureType,
      planeId: hostPlane.id,
      center: centerPt,
      widthM,
      depthM,
      dormerPitchDeg: def.pitch,
      heightAboveRoofM: featureType === 'chimney' ? 1.1 : 0.85,
      label: def.label
    });
    onAddAsset?.(newAsset);
    onSelectAsset?.(newAsset.id);
  };

  const resolveContainingLevelId = (ptA: Point2D, ptB: Point2D): string | undefined => {
    const mid = { x: (ptA.x + ptB.x) / 2, y: (ptA.y + ptB.y) / 2 };
    if (levels && levels.length > 0) {
      const hit = levels.find((l) => l.outline.points.length >= 3 && isPointInPolygon(mid, l.outline.points));
      if (hit) return hit.id;
      if (activeLevelId !== 'all') return activeLevelId;
      return levels[levels.length - 1]?.id;
    }
    return outline.levelId;
  };

  // Compute an interior angle bisector ray from 3 clicked points: Prev -> Corner -> Next
  const computeAngleBisectorEndPoint = (prevPt: Point2D, cornerPt: Point2D, nextPt: Point2D): Point2D => {
    const v1x = prevPt.x - cornerPt.x;
    const v1y = prevPt.y - cornerPt.y;
    const l1 = Math.hypot(v1x, v1y) || 1;
    const v2x = nextPt.x - cornerPt.x;
    const v2y = nextPt.y - cornerPt.y;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const u1x = v1x / l1;
    const u1y = v1y / l1;
    const u2x = v2x / l2;
    const u2y = v2y / l2;
    let bx = u1x + u2x;
    let by = u1y + u2y;
    const bLen = Math.hypot(bx, by);
    if (bLen < 1e-4) {
      bx = -u1y;
      by = u1x;
    } else {
      bx /= bLen;
      by /= bLen;
    }
    // Intersect forward ray (cornerPt + t * b, t > 0.1) against outline edges; fallback 3.5m
    let bestT = 3.5;
    let foundHit = false;
    for (const seg of allDisplayEdges) {
      const rx = seg.to.x - seg.from.x;
      const ry = seg.to.y - seg.from.y;
      const denom = bx * ry - by * rx;
      if (Math.abs(denom) < 1e-6) continue;
      const qpx = seg.from.x - cornerPt.x;
      const qpy = seg.from.y - cornerPt.y;
      const tRay = (qpx * ry - qpy * rx) / denom;
      const tSeg = (qpx * by - qpy * bx) / denom;
      if (tRay > 0.15 && tSeg >= -0.02 && tSeg <= 1.02) {
        if (!foundHit || tRay < bestT) {
          bestT = tRay;
          foundHit = true;
        }
      }
    }
    const clampedT = foundHit ? Math.min(bestT, 18) : 3.5;
    return {
      x: +(cornerPt.x + bx * clampedT).toFixed(3),
      y: +(cornerPt.y + by * clampedT).toFixed(3)
    };
  };

  // Handle Canvas Tap/Click for 2-Pt Plan Scale, Freehand Drawing, or Adding Roof Lines
  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'scale_plan') {
      if (readOnlyGeometry) return;
      const rawPt = getPlanPointFromPointer(e.clientX, e.clientY, 'raw');
      if (!lockedDraftBounds) {
        setLockedDraftBounds({ ...bounds });
      }
      if (scalePoints.length === 0) {
        setScalePoints([rawPt]);
      } else if (scalePoints.length === 1) {
        const pxDist = Math.hypot(
          toSvgX(rawPt.x) - toSvgX(scalePoints[0].x),
          toSvgY(rawPt.y) - toSvgY(scalePoints[0].y)
        );
        if (pxDist < 8) return;
        setScalePoints([scalePoints[0], rawPt]);
        setIsTwoPointScaleModalOpen(true);
      }
      return;
    }

    if (activeTool === 'draw_roof') {
      if (readOnlyGeometry) return;
      if (isFirstLineModalOpen) return;
      if (drawSubMode === 'attach_edge' && !attachedEdge) return;

      const prevPt = draftPoints.length > 0 ? draftPoints[draftPoints.length - 1] : null;
      const pt = resolveDrawRoofPointerPoint(e.clientX, e.clientY, prevPt);

      if (draftPoints.length === 0 && !lockedDraftBounds) {
        setLockedDraftBounds({ ...bounds });
      }

      if (prevPt) {
        const pxFromPrev = Math.hypot(
          toSvgX(pt.x) - toSvgX(prevPt.x),
          toSvgY(pt.y) - toSvgY(prevPt.y)
        );
        if (pxFromPrev < 8) return;
      }

      if (draftPoints.length >= 3) {
        const start = draftPoints[0];
        const pxDistToStart = Math.hypot(
          toSvgX(pt.x) - toSvgX(start.x),
          toSvgY(pt.y) - toSvgY(start.y)
        );
        if (pxDistToStart <= (isTouchDevice ? 26 : 18)) {
          finishCustomOutline();
          return;
        }
      }

      const nextDraft = [...draftPoints, pt];
      setDraftPoints(nextDraft);
      setTypedLengthBuffer('');
      lastAimPosRef.current = null;

      // Require first-line scale length popup ONLY when scale has not already been established
      if (nextDraft.length === 2 && !draftScaleReady && !hasEstablishedScale) {
        setIsFirstLineModalOpen(true);
      }
    } else if (activeTool === 'add_line') {
      if (readOnlyGeometry) return;
      const rawPt = getPlanPointFromPointer(e.clientX, e.clientY, 'raw');
      const { pt } = getSnappedLinePoint(rawPt);
      commitAddLinePoint(pt);
    }
  };

  const commitAddLinePoint = (pt: Point2D) => {
    if (readOnlyGeometry) return;
    if (bisectMode) {
      if (bisectPts.length === 0) {
        setBisectPts([pt]);
      } else if (bisectPts.length === 1) {
        if (dist(bisectPts[0], pt) < 0.08) return;
        setBisectPts([bisectPts[0], pt]);
      } else {
        const [pPrev, pCorner] = bisectPts;
        if (dist(pCorner, pt) < 0.08) return;
        const endPt = computeAngleBisectorEndPoint(pPrev, pCorner, pt);
        const newLine: SkeletonLine = {
          id: `line-bisect-${Date.now()}`,
          from: pCorner,
          to: endPt,
          suggestedType: newLineType,
          levelId: resolveContainingLevelId(pCorner, endPt)
        };
        onUpdateSkeleton([...displaySkeleton, newLine]);
        setBisectPts([]);
      }
      return;
    }

    if (!lineStartPt) {
      setLineStartPt(pt);
      setTypedLengthBuffer('');
      lastAimPosRef.current = null;
    } else {
      if (dist(lineStartPt, pt) < 0.08) return;
      const newLine: SkeletonLine = {
        id: `line-${Date.now()}`,
        from: lineStartPt,
        to: pt,
        suggestedType: newLineType,
        levelId: resolveContainingLevelId(lineStartPt, pt)
      };
      onUpdateSkeleton([...displaySkeleton, newLine]);
      setLineStartPt(chainLineMode ? pt : null);
      setTypedLengthBuffer('');
      lastAimPosRef.current = null;
    }
  };

  const handleConfirmFirstLineLengthM = (lengthM: number) => {
    if (draftPoints.length < 2) return;
    const baseBounds = lockedDraftBounds || bounds;
    const res = calibrateDraftPointsFromFirstLine(draftPoints, lengthM, baseBounds);
    if (!res) return;

    setDraftPoints(res.scaledPoints);
    setLockedDraftBounds(res.scaledBounds);
    if (planUnderlay && !planUnderlay.isCalibrated && onUpdatePlanUnderlay) {
      const scaledUnderlay = scalePlanUnderlayFromFactor(planUnderlay, res.anchor, res.scaleFactor);
      onUpdatePlanUnderlay({
        ...scaledUnderlay,
        isCalibrated: true,
        calibratedDistanceM: lengthM,
        calibratedAt: new Date().toISOString()
      });
    }
    setDraftScaleReady(true);
    setIsFirstLineModalOpen(false);
  };

  const handleUndoFirstLineSecondPoint = () => {
    setDraftPoints((prev) => prev.slice(0, 1));
    setIsFirstLineModalOpen(false);
  };

  const handleConfirmTwoPointScaleM = (knownDistanceM: number) => {
    if (scalePoints.length < 2) return;
    const [pA, pB] = scalePoints;

    if (planUnderlay && onUpdatePlanUnderlay) {
      const p1Norm = worldToPlanUnderlayNorm(planUnderlay, pA);
      const p2Norm = worldToPlanUnderlayNorm(planUnderlay, pB);
      const res = calibratePlanUnderlayFromTwoPoints(planUnderlay, p1Norm, p2Norm, knownDistanceM, {
        resetOriginToZero: outline.points.length === 0
      });
      if (!res) return;

      onUpdatePlanUnderlay(res.underlay);
      setIsTwoPointScaleModalOpen(false);
      setScalePoints([]);
      setLockedDraftBounds(null);
      setDraftScaleReady(true);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setActiveTool(outline.points.length === 0 ? 'draw_roof' : 'set_pitch');
      return;
    }

    // No architectural plan loaded: 2-point uniform rescale of drawn roof outline without auto-skeleton reset
    if (outline.points.length >= 3) {
      const curDist = dist(pA, pB);
      if (curDist > 0.05) {
        const factor = knownDistanceM / curDist;
        const scaledOutline = scaleOutlineUniformly(outline, factor, pA);
        onUpdateOutline(scaledOutline, {
          autoGenerateSkeleton: false,
          scaleFactor: factor,
          scaleAnchor: pA
        });
      }
    }
    setIsTwoPointScaleModalOpen(false);
    setScalePoints([]);
    setLockedDraftBounds(null);
    setDraftScaleReady(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setActiveTool('set_pitch');
  };

  const handlePickAttachEdge = (edge: PlanEdge) => {
    setAttachedEdge(edge);
    setDraftPoints([]);
    setLockedDraftBounds({ ...bounds });
    setDraftScaleReady(true);
    setTypedLengthBuffer('');
    lastAimPosRef.current = null;
  };

  const finishCustomOutline = (overridePoints?: Point2D[]) => {
    const pts = overridePoints || draftPoints;
    if (pts.length >= 3) {
      const customId = `roof-custom-${Date.now()}`;
      const newOutline = attachedEdge
        ? buildAttachedOutlineFromEdge(attachedEdge, pts, customId, {
            initialEdgeType: 'unclassified'
          })
        : buildOutlineFromPoints(pts, customId, {
            initialEdgeType: 'unclassified'
          });

      onUpdateOutline(newOutline, {
        autoGenerateSkeleton: false,
        mode: hasExistingFootprint ? 'add' : 'replace',
        attachedEdgeId: attachedEdge?.id
      });
      setDraftPoints([]);
      setAttachedEdge(null);
      setDrawSubMode('free');
      setLockedDraftBounds(null);
      setTypedLengthBuffer('');
      lastAimPosRef.current = null;
      setDraftScaleReady(true);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setActiveTool('set_pitch');
    }
  };

  // Open Anchored Numerical Input Overlay near clicked edge length label
  const handleOpenMeasurementEditor = (
    type: 'edge' | 'roof_line',
    id: string,
    currentLengthM: number,
    label: string,
    anchorSvgPt: Point2D,
    e: React.SyntheticEvent
  ) => {
    e.stopPropagation();
    if (readOnlyGeometry) return;

    let leftPx = 180;
    let topPx = 120;
    const svg = svgRef.current;
    const viewport = viewportRef.current;
    if (svg && viewport) {
      const vRect = viewport.getBoundingClientRect();
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const pt = svg.createSVGPoint();
        pt.x = anchorSvgPt.x;
        pt.y = anchorSvgPt.y;
        const screenPt = pt.matrixTransform(ctm);
        leftPx = Math.max(122, Math.min(Math.max(122, vRect.width - 122), screenPt.x - vRect.left));
        topPx = Math.max(132, Math.min(Math.max(132, vRect.height - 84), screenPt.y - vRect.top));
      } else {
        leftPx = Math.max(122, vRect.width / 2);
        topPx = Math.max(132, vRect.height / 2);
      }
    }

    const targetOutline =
      (type === 'edge' && levels
        ? levels.find((l) => l.outline.edges.some((ed) => ed.id === id))?.outline
        : undefined) || outline;

    setEditingMeasurement({
      type,
      id,
      currentLengthM,
      label,
      leftPx,
      topPx,
      baseOutline: {
        ...targetOutline,
        points: targetOutline.points.map((p) => ({ ...p })),
        edges: targetOutline.edges.map((ed) => ({ ...ed, from: { ...ed.from }, to: { ...ed.to } }))
      },
      baseSkeleton: displaySkeleton.map((s) => ({
        ...s,
        from: { ...s.from },
        to: { ...s.to }
      }))
    });
    setMeasurementInput(currentLengthM.toFixed(2));
  };

  // Trigger Immediate Coordinate Geometry Update from baseline snapshot
  const applyMeasurementImmediate = (
    rawInput: string,
    editor: NonNullable<typeof editingMeasurement>
  ) => {
    let val = parseFloat(rawInput);
    if (!Number.isFinite(val) || val <= 0.1) return;

    if (val > 40) {
      val = +(val / 1000).toFixed(3);
    } else {
      val = +val.toFixed(3);
    }
    if (val <= 0.1) return;

    if (editor.type === 'edge') {
      const updatedOutline = updateEdgeLength(editor.baseOutline, editor.id, val);
      onUpdateOutline(updatedOutline);
    } else {
      const updatedLines = updateSkeletonLineLength(editor.baseSkeleton, editor.id, val);
      onUpdateSkeleton(updatedLines);
    }
  };

  const handleEdgeClick = (edge: PlanEdge, e: React.MouseEvent) => {
    if (isCanvasTapTool) return;
    e.stopPropagation();
    if (activeTool === 'assign_flashing' && onSelectLineForFlashing) {
      onSelectLineForFlashing(edge.id);
      return;
    }
    if (!readOnlyGeometry && activeTool === 'adjust_shape') {
      const mid: Point2D = {
        x: +snap((edge.from.x + edge.to.x) / 2).toFixed(2),
        y: +snap((edge.from.y + edge.to.y) / 2).toFixed(2)
      };
      const edgeIdx = outline.edges.findIndex((ed) => ed.id === edge.id);
      if (edgeIdx >= 0) {
        onUpdateOutline(insertVertexOnEdge(outline, edgeIdx, mid));
      }
      return;
    }
    if (!readOnlyGeometry && activeTool === 'delete_line') {
      const attached = planes.find((p) => p.eaveEdgeId === edge.id);
      if (attached) onDeletePlane(attached.id);
      return;
    }
    // Select / Inspect mode -> display line info card with length, flashing, pitch & hip/gable actions
    setEditingMeasurement(null);
    onSelectPlane(null);
    setInspectedLine({ kind: 'edge', id: edge.id });
  };

  const handleVertexPointerDown = (idx: number, e: React.PointerEvent) => {
    if (readOnlyGeometry || activeTool !== 'adjust_shape') return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setSelectedVertexIdx(idx);
    setDraggedVertexIdx(idx);
  };

  const handleVertexClick = (idx: number, e: React.MouseEvent) => {
    if (readOnlyGeometry) return;
    if (activeTool === 'adjust_shape') {
      e.stopPropagation();
      setSelectedVertexIdx(idx);
      return;
    }
    if (activeTool === 'add_line') {
      e.stopPropagation();
      commitAddLinePoint(allDisplayOutlinePoints[idx] || outline.points[idx]);
    }
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      lastPinchDistRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      panDragRef.current = null;
      setIsPanDragging(false);
      setDragBoxStart(null);
      setDragBoxCurrent(null);
      return;
    }

    const targetEl = e.target as Element | null;
    const isEmptyBackground =
      targetEl === svgRef.current || targetEl?.getAttribute('data-cad-bg') === 'true';

    // Middle-button pan anywhere, Space+left-drag anywhere, or left-drag empty background in inspect modes
    const wantsPan =
      e.button === 1 ||
      (e.button === 0 && isSpacePanning) ||
      (e.button === 0 &&
        isEmptyBackground &&
        (activeTool === 'set_pitch' || activeTool === 'assign_flashing' || activeTool === 'delete_line'));

    if (wantsPan && activePointersRef.current.size === 1) {
      panDragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originPanX: pan.x,
        originPanY: pan.y,
        moved: false
      };
      setIsPanDragging(true);
      return;
    }

    if (activeTool === 'add_feature' && activePointersRef.current.size === 1) {
      const pt = getPlanPointFromPointer(e.clientX, e.clientY);
      setDragBoxStart(pt);
      setDragBoxCurrent(pt);
    } else if (activeTool === 'add_line' && activePointersRef.current.size === 1) {
      const rawPt = getPlanPointFromPointer(e.clientX, e.clientY, 'raw');
      const snappedLine = getSnappedLinePoint(rawPt).pt;
      setMousePos(snappedLine);
      lastAimPosRef.current = snappedLine;
    }
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      const prev = activePointersRef.current.get(e.pointerId)!;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Two-finger pinch zoom + two-finger pan
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
      const svg = svgRef.current;
      const rect = svg?.getBoundingClientRect();
      const fitScale = rect ? Math.min(rect.width / svgWidth, rect.height / svgHeight) || 1 : 1;
      const dxScreen = e.clientX - panDragRef.current.startClientX;
      const dyScreen = e.clientY - panDragRef.current.startClientY;
      if (Math.hypot(dxScreen, dyScreen) > 4) {
        panDragRef.current.moved = true;
      }
      setPan({
        x: panDragRef.current.originPanX + dxScreen / fitScale,
        y: panDragRef.current.originPanY + dyScreen / fitScale
      });
      return;
    }

    const prevDraftPt =
      activeTool === 'draw_roof' && draftPoints.length > 0
        ? draftPoints[draftPoints.length - 1]
        : null;
    if (activeTool === 'add_line') {
      const rawPt = getPlanPointFromPointer(e.clientX, e.clientY, 'raw');
      const snappedLine = getSnappedLinePoint(rawPt).pt;
      setMousePos(snappedLine);
      lastAimPosRef.current = snappedLine;
    } else {
      const pt =
        activeTool === 'draw_roof'
          ? resolveDrawRoofPointerPoint(e.clientX, e.clientY, prevDraftPt)
          : getPlanPointFromPointer(
              e.clientX,
              e.clientY,
              activeTool === 'scale_plan' ? 'raw' : 'edit',
              prevDraftPt
            );
      setMousePos(pt);
      if (activeTool === 'draw_roof') {
        lastAimPosRef.current = pt;
      }

      if (draggedVertexIdx !== null && activeTool === 'adjust_shape') {
        onUpdateOutline(moveVertex(outline, draggedVertexIdx, pt), { autoGenerateSkeleton: false });
      } else if (draggedAssetId) {
        const target = assets.find((a) => a.id === draggedAssetId);
        if (target) {
          const hoveredHost =
            planes.find((p) => isPointInPolygon(pt, p.planPolygon)) ||
            planes.find((p) => p.id === target.planeId);
          onUpdateAsset?.(
            syncAssetRelationshipFields(hoveredHost, { ...target, center: pt })
          );
        }
      } else if (activeTool === 'add_feature' && dragBoxStart) {
        setDragBoxCurrent(pt);
      }
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
    if (activeTool === 'add_feature' && dragBoxStart && activePointersRef.current.size <= 1) {
      const endPt = dragBoxCurrent || dragBoxStart;
      placeFeatureAt(dragBoxStart, endPt);
      setDragBoxStart(null);
      setDragBoxCurrent(null);
    }
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      lastPinchDistRef.current = null;
    }
    setDraggedVertexIdx(null);
    setDraggedAssetId(null);
    if (e.pointerType === 'touch') {
      setMousePos(null);
    }
  };

  // Start Drawing from Scratch (Clear outline)
  const handleStartBlank = () => {
    setDraftPoints([]);
    setAttachedEdge(null);
    setDrawSubMode('free');
    setScalePoints([]);
    setLockedDraftBounds(null);
    setDraftScaleReady(Boolean(planUnderlay?.isCalibrated));
    setIsFirstLineModalOpen(false);
    onUpdateOutline({ id: `roof-${Date.now()}`, points: [], edges: [] });
    onUpdateSkeleton([]);
    setActiveTool('draw_roof');
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const allToolButtons = [
    {
      id: 'set_pitch' as const,
      label: readOnlyGeometry ? 'Inspect Face' : 'Select & Pitch',
      shortLabel: 'Select',
      icon: Pencil,
      activeClass: 'bg-blue-600 text-white shadow-md',
      onClick: () => {
        setActiveTool('set_pitch');
        setDraftPoints([]);
        setAttachedEdge(null);
        setLineStartPt(null);
        setBisectPts([]);
        setDragBoxStart(null);
      }
    },
    ...(onSelectLineForFlashing
      ? [
          {
            id: 'assign_flashing' as const,
            label: readOnlyGeometry ? 'View Flashings' : 'Draw / Assign Flashings',
            shortLabel: 'Flashings',
            icon: PenTool,
            activeClass: 'bg-emerald-600 text-white shadow-md',
            onClick: () => {
              setActiveTool('assign_flashing');
              setDraftPoints([]);
              setAttachedEdge(null);
              setLineStartPt(null);
              setBisectPts([]);
              setDragBoxStart(null);
            }
          }
        ]
      : []),
    {
      id: 'draw_roof' as const,
      label: hasExistingFootprint ? 'Add / Attach Roof' : 'Draw Roof',
      shortLabel: hasExistingFootprint ? 'Add Roof' : 'Draw',
      icon: Plus,
      activeClass: 'bg-emerald-600 text-white shadow-md',
      onClick: () => {
        setActiveTool('draw_roof');
        setScalePoints([]);
        setLineStartPt(null);
        setBisectPts([]);
        setDragBoxStart(null);
        setAttachedEdge(null);
        setDrawSubMode('free');
        setDraftScaleReady(hasEstablishedScale);
      }
    },
    {
      id: 'scale_plan' as const,
      label: planUnderlay ? '2-Pt Plan Scale' : '2-Pt Scale / Rescale',
      shortLabel: '2-Pt Scale',
      icon: Ruler,
      activeClass: 'bg-amber-500 text-slate-950 shadow-md',
      onClick: () => {
        if (!planUnderlay && outline.points.length < 3) {
          setIsPlanModalOpen(true);
          return;
        }
        setActiveTool('scale_plan');
        setDraftPoints([]);
        setAttachedEdge(null);
        setScalePoints([]);
        setLockedDraftBounds({ ...bounds });
        setLineStartPt(null);
        setBisectPts([]);
        setDragBoxStart(null);
      }
    },
    {
      id: 'load_plan' as const,
      label: 'Architectural Plan Sheet',
      shortLabel: 'Plan Sheet',
      icon: FileImage,
      activeClass: 'bg-sky-600 text-white shadow-md',
      isAction: true,
      onClick: () => setIsPlanModalOpen(true)
    },
    {
      id: 'add_line' as const,
      label: 'Draw Roof Line',
      shortLabel: 'Lines',
      icon: ArrowRight,
      activeClass: 'bg-purple-600 text-white shadow-md',
      onClick: () => {
        setActiveTool('add_line');
        setDraftPoints([]);
        setAttachedEdge(null);
        setScalePoints([]);
        setLockedDraftBounds(null);
        setLineStartPt(null);
        setBisectPts([]);
        setDragBoxStart(null);
      }
    },
    {
      id: 'add_feature' as const,
      label: 'Roof Features & Dormers',
      shortLabel: 'Features',
      icon: Layers,
      activeClass: 'bg-cyan-600 text-white shadow-md',
      onClick: () => {
        setActiveTool('add_feature');
        setDraftPoints([]);
        setScalePoints([]);
        setLockedDraftBounds(null);
        setLineStartPt(null);
      }
    },
    {
      id: 'auto_lines' as const,
      label: 'Auto Lines',
      shortLabel: 'Auto',
      icon: Wand2,
      activeClass: 'bg-sky-600 text-white',
      isAction: true,
      onClick: onRunSkeletonKey
    },
    {
      id: 'adjust_shape' as const,
      label: 'Adjust Points',
      shortLabel: 'Edit',
      icon: Move,
      activeClass: 'bg-amber-600 text-white shadow-md',
      onClick: () => {
        setActiveTool('adjust_shape');
        setDraftPoints([]);
        setScalePoints([]);
        setLockedDraftBounds(null);
        setLineStartPt(null);
        setDragBoxStart(null);
      }
    },
    {
      id: 'delete_line' as const,
      label: 'Delete Item',
      shortLabel: 'Delete',
      icon: Trash2,
      activeClass: 'bg-rose-600 text-white shadow-md',
      onClick: () => {
        setActiveTool('delete_line');
        setDraftPoints([]);
        setScalePoints([]);
        setLockedDraftBounds(null);
        setLineStartPt(null);
        setDragBoxStart(null);
      }
    }
  ];

  const toolButtons = readOnlyGeometry
    ? allToolButtons.filter((b) => b.id === 'set_pitch' || b.id === 'assign_flashing')
    : allToolButtons;

  const shortcutForTool: Partial<Record<string, string>> = {
    set_pitch: 'V',
    draw_roof: 'D',
    add_line: 'L',
    add_feature: 'F',
    adjust_shape: 'E'
  };

  // True world-space metric blueprint grid + graphic scale bar
  const metricGrid = useMemo(
    () =>
      computeMetricGridLines(
        svgWidth,
        svgHeight,
        scale,
        fromSvgX,
        fromSvgY,
        toSvgX,
        toSvgY
      ),
    [svgWidth, svgHeight, scale, geomCenterX, geomCenterY, centerX, centerY, pan.x, pan.y]
  );

  const scaleBar = useMemo(() => computeDynamicScaleBar(scale), [scale]);

  return (
    <div
      className={`w-full h-full flex-1 bg-[#070b14] relative select-none overflow-hidden flex flex-col text-white shadow-2xl ${
        isMobile ? 'rounded-xl border-0 min-h-[300px]' : 'rounded-3xl border border-slate-800/90 min-h-[500px]'
      }`}
    >
      {/* 1. FLOATING CAD TOOL DOCK (Mobile tools integrated into unified Ruler/Zoom bar; Vertical Rail on Desktop) */}
      {isMobile ? (
        <>

          {/* Contextual Bottom-Center Active Tool Pills Only When Actively Drawing / Scaling / Editing Corner */}
          {!readOnlyGeometry &&
            (activeTool === 'add_line' ||
              activeTool === 'scale_plan' ||
              activeTool === 'draw_roof' ||
              activeTool === 'add_feature' ||
              activeTool === 'adjust_shape') && (
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 w-[calc(100%-16px)] max-w-sm pointer-events-none">
                {activeTool === 'add_line' && (
                  <div className="pointer-events-auto bg-[#090d16]/95 backdrop-blur-md border border-purple-500/40 p-1 rounded-xl shadow-2xl flex flex-wrap justify-center items-center gap-1 animate-in fade-in slide-in-from-bottom-2">
                    {[
                      { type: 'ridge' as const, label: 'Ridge', color: 'bg-purple-400', activeBg: 'bg-purple-600' },
                      { type: 'hip' as const, label: 'Hip', color: 'bg-sky-400', activeBg: 'bg-sky-600' },
                      { type: 'valley' as const, label: 'Valley', color: 'bg-amber-400', activeBg: 'bg-amber-600' }
                    ].map((item) => (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => setNewLineType(item.type)}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          newLineType === item.type
                            ? `${item.activeBg} text-white shadow-xs`
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${item.color}`} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                    <div className="w-px h-5 bg-slate-700 mx-0.5" />
                    <button
                      type="button"
                      onClick={() => {
                        setChainLineMode((v) => !v);
                        setBisectMode(false);
                        setBisectPts([]);
                      }}
                      className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1 ${
                        !bisectMode && chainLineMode
                          ? 'bg-emerald-600/80 text-white'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <Link2 className="w-3 h-3" />
                      <span>Chain</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBisectMode((v) => !v);
                        setLineStartPt(null);
                        setBisectPts([]);
                        setTypedLengthBuffer('');
                      }}
                      className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1 ${
                        bisectMode ? 'bg-amber-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <GitBranch className="w-3 h-3" />
                      <span>Bisect</span>
                    </button>
                  </div>
                )}

                {activeTool === 'add_line' && (
                  <div className="pointer-events-auto flex flex-wrap justify-center items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#080d18]/95 backdrop-blur-md border border-purple-500/45 shadow-xl text-[11px]">
                    <Crosshair className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                    <span className="text-purple-100 font-semibold">
                      {bisectMode
                        ? bisectPts.length === 0
                          ? 'Bisect (1/3): Tap side pt 1'
                          : bisectPts.length === 1
                          ? 'Bisect (2/3): Tap corner vertex'
                          : 'Bisect (3/3): Tap side pt 2'
                        : lineStartPt
                        ? 'Pinned · aim & type length or tap end'
                        : 'Tap start point → tap end point'}
                    </span>
                    {!bisectMode && lineStartPt && (
                      <form
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          commitTypedSegmentLength(typedLengthBuffer);
                        }}
                        className="flex items-center gap-1 bg-slate-950 border border-purple-500/40 rounded-lg px-1.5 py-0.5"
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          value={typedLengthBuffer}
                          onChange={(ev) => setTypedLengthBuffer(ev.target.value)}
                          placeholder="m / mm"
                          aria-label="Line length in metres or millimetres"
                          className="w-16 bg-transparent text-white font-mono font-bold text-[11px] placeholder:text-slate-500 focus:outline-hidden tabular-nums"
                        />
                        <button
                          type="submit"
                          disabled={parseDistanceInputToMetres(typedLengthBuffer, 'auto') === null}
                          className="px-1.5 py-0.5 rounded bg-purple-600 text-white font-bold text-[10px] cursor-pointer disabled:opacity-35"
                        >
                          Set
                        </button>
                      </form>
                    )}
                    {lineStartPt || bisectPts.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setLineStartPt(null);
                          setBisectPts([]);
                          setTypedLengthBuffer('');
                        }}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-semibold cursor-pointer"
                      >
                        Break
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveTool('set_pitch')}
                        className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 font-semibold cursor-pointer"
                      >
                        Done
                      </button>
                    )}
                  </div>
                )}

                {activeTool === 'scale_plan' && (
                  <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#080d18]/95 backdrop-blur-md border border-amber-500/50 shadow-xl text-[11px] max-w-full">
                    <Ruler className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-amber-200 font-bold truncate">
                      {scalePoints.length === 0
                        ? '2-Pt Scale (1/2): Tap 1st known point'
                        : '2-Pt Scale (2/2): Tap 2nd known point'}
                    </span>
                    {scalePoints.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setScalePoints([])}
                        className="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 font-bold shrink-0 cursor-pointer"
                      >
                        Repick
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setScalePoints([]);
                        setLockedDraftBounds(null);
                        setActiveTool(outline.points.length === 0 ? 'draw_roof' : 'set_pitch');
                      }}
                      className="px-2 py-1 rounded-lg bg-slate-900 text-slate-400 font-semibold shrink-0 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {activeTool === 'draw_roof' && (
                  <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#080d18]/95 backdrop-blur-md border border-emerald-500/45 shadow-xl text-[11px] max-w-full">
                    {hasExistingFootprint && draftPoints.length === 0 && (
                      <div className="w-full flex items-center justify-center gap-1 pb-1 border-b border-slate-800">
                        <button
                          type="button"
                          onClick={() => {
                            setDrawSubMode('free');
                            setAttachedEdge(null);
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                            drawSubMode === 'free'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          Add Roof
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDrawSubMode('attach_edge');
                            setAttachedEdge(null);
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                            drawSubMode === 'attach_edge'
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          From Wall / Eave
                        </button>
                      </div>
                    )}
                    <Crosshair className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-emerald-200 font-bold truncate">
                      {drawSubMode === 'attach_edge' && !attachedEdge
                        ? 'Tap an existing wall or eave edge'
                        : draftPoints.length === 0 && attachedEdge
                        ? 'Host wall set — tap start (snaps to line)'
                        : draftPoints.length === 0
                        ? planUnderlay && !planUnderlay.isCalibrated && !hasEstablishedScale
                          ? 'Draw line 1 or use 2-Pt Scale'
                          : hasExistingFootprint
                          ? 'Tap corner 1 for new roof'
                          : 'Tap corner 1 to start'
                        : draftPoints.length === 1 && !draftScaleReady && !hasEstablishedScale
                        ? 'Tap corner 2 (scale prompt next)'
                        : `${draftPoints.length} pts · Tap green start`}
                    </span>
                    {attachedEdge && draftPoints.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setAttachedEdge(null)}
                        className="px-2 py-0.5 rounded-lg bg-amber-600/25 border border-amber-500/45 text-amber-200 font-bold shrink-0 cursor-pointer"
                      >
                        Repick Wall
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setOrthoSnap((v) => !v)}
                      className={`px-2 py-0.5 rounded-lg font-bold cursor-pointer shrink-0 border ${
                        orthoSnap
                          ? 'bg-sky-600/30 border-sky-500/50 text-sky-200'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      Ortho {orthoSnap ? 'ON' : 'OFF'}
                    </button>
                    {draftPoints.length >= 1 && (
                      <form
                        onSubmit={(ev) => {
                          ev.preventDefault();
                          commitTypedSegmentLength(typedLengthBuffer);
                        }}
                        className="flex items-center gap-1 bg-slate-950 border border-emerald-500/40 rounded-lg px-1.5 py-0.5"
                      >
                        <input
                          type="text"
                          inputMode="decimal"
                          value={typedLengthBuffer}
                          onChange={(ev) => setTypedLengthBuffer(ev.target.value)}
                          placeholder="m / mm"
                          aria-label="Typed segment length"
                          className="w-16 bg-transparent text-white font-mono font-bold text-[11px] placeholder:text-slate-500 focus:outline-hidden tabular-nums"
                        />
                        <button
                          type="submit"
                          disabled={parseDistanceInputToMetres(typedLengthBuffer, 'auto') === null}
                          className="px-1.5 py-0.5 rounded bg-emerald-600 text-white font-bold text-[10px] cursor-pointer disabled:opacity-35"
                        >
                          Set
                        </button>
                      </form>
                    )}
                    {draftPoints.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setTypedLengthBuffer('');
                          const next = draftPoints.slice(0, -1);
                          setDraftPoints(next);
                          if (next.length < 2 && !hasEstablishedScale) {
                            setDraftScaleReady(false);
                          }
                          if (next.length === 0) setLockedDraftBounds(null);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-200 font-semibold shrink-0 cursor-pointer flex items-center gap-1"
                      >
                        <Undo2 className="w-3 h-3" />
                        <span>Undo</span>
                      </button>
                    )}
                    {squareClosedPoints && (
                      <button
                        type="button"
                        onClick={() => finishCustomOutline(squareClosedPoints)}
                        className="px-2.5 py-0.5 rounded-lg bg-sky-600 text-white font-extrabold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Square className="w-3 h-3" />
                        <span>Close 90°</span>
                      </button>
                    )}
                    {draftPoints.length >= 3 && (
                      <button
                        type="button"
                        onClick={() => finishCustomOutline()}
                        className="px-2.5 py-0.5 rounded-lg bg-emerald-600 text-white font-extrabold flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>Close</span>
                      </button>
                    )}
                    {(draftPoints.length > 0 || attachedEdge) && (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftPoints([]);
                          setAttachedEdge(null);
                          setLockedDraftBounds(null);
                          setTypedLengthBuffer('');
                          lastAimPosRef.current = null;
                          setDraftScaleReady(hasEstablishedScale);
                        }}
                        className="px-2 py-0.5 rounded-lg bg-slate-900 text-slate-400 font-semibold shrink-0 cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}

                {activeTool === 'adjust_shape' && (
                  <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#080d18]/95 backdrop-blur-md border border-amber-500/45 shadow-xl text-[11px] max-w-full">
                    {selectedVertexIdx !== null && selectedCornerAngleDeg !== null ? (
                      <>
                        <span className="font-mono font-bold text-amber-200 tabular-nums">
                          C{selectedVertexIdx + 1} · {selectedCornerAngleDeg.toFixed(1)}°
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateOutline(squareOutlineCorner(outline, selectedVertexIdx), {
                              autoGenerateSkeleton: false
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-extrabold flex items-center gap-1 cursor-pointer"
                        >
                          <Square className="w-3 h-3" />
                          <span>Square 90°</span>
                        </button>
                        {outline.points.length > 3 && (
                          <button
                            type="button"
                            onClick={() => {
                              onUpdateOutline(deleteVertex(outline, selectedVertexIdx), {
                                autoGenerateSkeleton: false
                              });
                              setSelectedVertexIdx(null);
                            }}
                            className="px-2 py-1 rounded-lg bg-rose-600/30 border border-rose-500/50 text-rose-200 font-bold cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-amber-200 font-semibold">
                        Drag corner or tap corner to Square 90°
                      </span>
                    )}
                  </div>
                )}

                {activeTool === 'add_feature' && (
                  <div className="pointer-events-auto bg-[#090d16]/95 backdrop-blur-md border border-cyan-500/40 p-1 rounded-xl shadow-2xl flex flex-wrap justify-center items-center gap-1 max-w-full animate-in fade-in slide-in-from-bottom-2">
                    {[
                      { type: 'skylight' as const, label: 'Skylight' },
                      { type: 'chimney' as const, label: 'Chimney' },
                      { type: 'mono_dormer' as const, label: 'Mono Dormer' },
                      { type: 'gable_dormer' as const, label: 'Gable Dormer' },
                      { type: 'pitch_break' as const, label: 'Pitch Break' }
                    ].map((item) => (
                      <button
                        key={item.type}
                        onClick={() => setFeatureType(item.type)}
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 ${
                          featureType === item.type
                            ? 'bg-cyan-600 text-white shadow-xs'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
        </>
      ) : (
        /* Desktop Vertical Floating CAD Dock */
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-1 p-1.5 rounded-2xl bg-[#080d18]/94 backdrop-blur-md border border-slate-700/80 shadow-2xl">
          {toolButtons.map((btn) => {
            const Icon = btn.icon;
            const isActive = !btn.isAction && activeTool === btn.id;
            const shortcut = shortcutForTool[btn.id];
            const buttonEl = (
              <button
                key={btn.id}
                onClick={btn.onClick}
                className={`p-2.5 rounded-xl transition-all cursor-pointer relative group flex items-center justify-center ${
                  isActive
                    ? `${btn.activeClass} ring-1 ring-white/25`
                    : btn.id === 'auto_lines'
                    ? 'text-sky-400 hover:bg-sky-950/60'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/90'
                }`}
                title={shortcut ? `${btn.label} (${shortcut})` : btn.label}
              >
                <Icon className="w-4 h-4" />
                <span className="absolute left-full ml-2.5 px-2.5 py-1 rounded-lg bg-[#080d18] border border-slate-700 text-[11px] font-bold text-white whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-xl flex items-center gap-2">
                  <span>{btn.label}</span>
                  {shortcut && (
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[9px] font-mono text-slate-300">
                      {shortcut}
                    </kbd>
                  )}
                </span>
              </button>
            );

            if (btn.id === 'add_line') {
              return (
                <div key={btn.id} className="relative">
                  {buttonEl}
                  {activeTool === 'add_line' && (
                    <div className="absolute left-full ml-2 top-0 bg-[#090d16]/95 backdrop-blur-md border border-purple-500/40 p-1 rounded-xl shadow-2xl flex items-center gap-1 z-30 animate-in fade-in slide-in-from-left-2 whitespace-nowrap">
                      {[
                        { type: 'ridge' as const, label: 'Ridge', color: 'bg-purple-400', activeBg: 'bg-purple-600' },
                        { type: 'hip' as const, label: 'Hip', color: 'bg-sky-400', activeBg: 'bg-sky-600' },
                        { type: 'valley' as const, label: 'Valley', color: 'bg-amber-400', activeBg: 'bg-amber-600' }
                      ].map((item) => (
                        <button
                          key={item.type}
                          type="button"
                          onClick={() => setNewLineType(item.type)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                            newLineType === item.type
                              ? `${item.activeBg} text-white shadow-xs`
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${item.color}`} />
                          <span>{item.label}</span>
                        </button>
                      ))}
                      <div className="w-px h-5 bg-slate-700 mx-0.5" />
                      <button
                        type="button"
                        onClick={() => {
                          setChainLineMode((v) => !v);
                          setBisectMode(false);
                          setBisectPts([]);
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1 ${
                          !bisectMode && chainLineMode
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                        title="Polyline Chain Mode"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>Chain</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBisectMode((v) => !v);
                          setLineStartPt(null);
                          setBisectPts([]);
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer flex items-center gap-1 ${
                          bisectMode
                            ? 'bg-amber-600 text-white'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                        title="3-Point Interior Angle Bisector"
                      >
                        <GitBranch className="w-3 h-3" />
                        <span>Bisect 3pt</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            }
            if (btn.id === 'add_feature') {
              return (
                <div key={btn.id} className="relative">
                  {buttonEl}
                  {activeTool === 'add_feature' && (
                    <div className="absolute left-full ml-2 top-0 bg-[#090d16]/95 backdrop-blur-md border border-cyan-500/40 p-1 rounded-xl shadow-2xl flex items-center gap-1 z-30 animate-in fade-in slide-in-from-left-2 whitespace-nowrap">
                      {[
                        { type: 'skylight' as const, label: 'Skylight' },
                        { type: 'chimney' as const, label: 'Chimney' },
                        { type: 'mono_dormer' as const, label: 'Mono Dormer' },
                        { type: 'gable_dormer' as const, label: 'Gable Dormer' },
                        { type: 'pitch_break' as const, label: 'Pitch Break' }
                      ].map((item) => (
                        <button
                          key={item.type}
                          onClick={() => setFeatureType(item.type)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                            featureType === item.type
                              ? 'bg-cyan-600 text-white shadow-xs'
                              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return buttonEl;
          })}

          {!readOnlyGeometry && (
            <>
              <div className="w-full h-px bg-slate-800 my-0.5" />

              <button
                onClick={handleStartBlank}
                className="p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer relative group flex items-center justify-center"
                title="Start Blank Canvas"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="absolute left-full ml-2.5 px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-[11px] font-bold text-white whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-30 shadow-lg">
                  Start Blank
                </span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 2. TOP PLAN CALIBRATION BADGE, MULTI-LEVEL SWITCHER & UNIFIED CAD/ZOOM/DIMS BAR */}
      <div className="absolute top-2 sm:top-4 left-2 sm:left-16 right-2 sm:right-4 z-15 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none">
        {(planUnderlay || (levels && levels.length > 1)) && (
          <div className="flex items-center gap-1.5 min-w-0 max-w-full">
          {/* Active Architectural Plan Calibration Chip */}
          {planUnderlay && (
            <button
              type="button"
              onClick={() => {
                if (!planUnderlay.isCalibrated && !readOnlyGeometry) {
                  setActiveTool('scale_plan');
                  setScalePoints([]);
                  setLockedDraftBounds({ ...bounds });
                } else {
                  setIsPlanModalOpen(true);
                }
              }}
              className={`pointer-events-auto min-h-[34px] px-2.5 rounded-xl backdrop-blur-md border text-[11px] font-extrabold flex items-center gap-1.5 shadow-xl cursor-pointer shrink-0 transition-colors ${
                planUnderlay.isCalibrated
                  ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/90'
                  : 'bg-amber-500 text-slate-950 border-amber-300 hover:bg-amber-400'
              }`}
              title={
                planUnderlay.isCalibrated
                  ? `${planUnderlay.name} · Scale locked (tap to adjust/replace)`
                  : 'Plan needs 2-Point scale calibration — tap to set scale'
              }
            >
              <FileImage className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[140px] sm:max-w-[200px] tabular-nums">
                {planUnderlay.isCalibrated
                  ? `Plan · ${planUnderlay.calibratedDistanceM?.toFixed(1) || ''}m`
                  : 'Set 2-Pt Scale'}
              </span>
            </button>
          )}

          {/* Compact Multi-Level Switcher Pill (only shown when > 1 elevation tier exists) */}
          {levels && levels.length > 1 && (
            <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-xl bg-[#090d16]/90 backdrop-blur-md border border-slate-800 shadow-xl overflow-x-auto">
              <button
                type="button"
                onClick={() => onSelectLevel?.('all')}
                className={`min-h-[30px] px-2 rounded-lg text-[10px] font-black transition-all cursor-pointer shrink-0 ${
                  activeLevelId === 'all'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                All
              </button>
              {levels.map((lvl) => {
                const isAct = activeLevelId === lvl.id;
                return (
                  <button
                    key={lvl.id}
                    type="button"
                    onClick={() => onSelectLevel?.(lvl.id)}
                    className={`min-h-[30px] px-2 rounded-lg text-[10px] font-bold transition-all cursor-pointer shrink-0 tabular-nums flex items-center gap-1 ${
                      isAct
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <span>{lvl.code}</span>
                    <span className={isAct ? 'text-slate-900' : 'text-amber-400'}>
                      {lvl.eaveHeightM.toFixed(1)}m
                    </span>
                  </button>
                );
              })}
              {!readOnlyGeometry && onAddLevel && (
                <button
                  type="button"
                  onClick={onAddLevel}
                  className="min-h-[30px] px-2 rounded-lg text-[10px] font-black text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 cursor-pointer shrink-0"
                  title="Add Roof Elevation Tier"
                >
                  +
                </button>
              )}
            </div>
          )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 ml-auto">
        {/* Unified CAD Tools (Mobile) + Dims Toggle & Zoom / Reset Controls */}
        <div className="pointer-events-auto relative flex items-center gap-0.5 p-0.5 rounded-xl bg-[#090d16]/92 backdrop-blur-md border border-slate-800 shadow-xl shrink-0">
          {isMobile && !readOnlyGeometry && (
            <>
              <button
                type="button"
                onClick={() => {
                  setActiveTool('set_pitch');
                  setIsMobileToolsOpen(false);
                  setDraftPoints([]);
                  setLineStartPt(null);
                }}
                className={`min-h-[36px] min-w-[36px] rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                  activeTool === 'set_pitch'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                aria-label="Select & Inspect"
                title="Select & Inspect"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsMobileToolsOpen((v) => !v)}
                className={`min-h-[36px] min-w-[36px] rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                  isMobileToolsOpen ||
                  ['draw_roof', 'scale_plan', 'add_line', 'add_feature', 'adjust_shape', 'delete_line'].includes(activeTool)
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
                aria-label="CAD Drawing Tools"
                title="CAD Drawing Tools"
              >
                <Wrench className="w-3.5 h-3.5" />
              </button>

              {onSelectLineForFlashing && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTool('assign_flashing');
                    setIsMobileToolsOpen(false);
                    setDraftPoints([]);
                    setLineStartPt(null);
                  }}
                  className={`min-h-[36px] min-w-[36px] rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                    activeTool === 'assign_flashing'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                  aria-label="Assign Flashing"
                  title="Assign Flashing"
                >
                  <PenTool className="w-3.5 h-3.5" />
                </button>
              )}

              <div className="w-px h-5 bg-slate-800 mx-0.5 shrink-0" />

              {isMobileToolsOpen && (
                <div className="absolute top-full right-0 mt-1.5 w-60 bg-[#090d16]/96 backdrop-blur-md border border-slate-700/90 rounded-2xl p-2 shadow-2xl space-y-1.5 z-30 animate-in fade-in slide-in-from-top-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    {allToolButtons
                      .filter((b) => b.id !== 'set_pitch' && b.id !== 'assign_flashing')
                      .map((btn) => {
                        const Icon = btn.icon;
                        const isActive = !btn.isAction && activeTool === btn.id;
                        return (
                          <button
                            key={btn.id}
                            type="button"
                            onClick={() => {
                              btn.onClick();
                              setIsMobileToolsOpen(false);
                            }}
                            className={`min-h-[44px] px-1.5 py-1.5 rounded-xl text-[10px] font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border ${
                              isActive
                                ? `${btn.activeClass} border-transparent`
                                : btn.id === 'auto_lines'
                                ? 'bg-sky-950/60 border-sky-500/40 text-sky-300'
                                : 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            <span>{btn.shortLabel}</span>
                          </button>
                        );
                      })}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleStartBlank();
                      setIsMobileToolsOpen(false);
                    }}
                    className="w-full min-h-[38px] rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                    <span>Clear &amp; Draw Blank Roof</span>
                  </button>
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => setShowAllDims((v) => !v)}
            className={`min-h-[36px] min-w-[36px] px-2 flex items-center justify-center gap-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
              showAllDims
                ? 'bg-sky-600/30 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title={showAllDims ? 'Hide All Lengths (Minimal Codes)' : 'Show Edge & Line Lengths'}
            aria-label="Toggle Dimension Labels"
          >
            <Ruler className="w-3.5 h-3.5" />
            {!isMobile && <span>{showAllDims ? 'Dims' : 'Codes'}</span>}
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          {!isMobile && (
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="min-h-[36px] px-2 rounded-lg text-[10px] font-mono font-bold text-slate-300 hover:text-white hover:bg-slate-800 tabular-nums cursor-pointer"
              title="Reset Fit (0)"
            >
              {Math.round(zoom * 100)}%
            </button>
          )}
          <button
            onClick={() => setZoom((z) => Math.min(6.0, +(z + 0.25).toFixed(2)))}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-sky-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Reset Fit (0)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        </div>
      </div>

      {/* 3. CONTEXTUAL DESKTOP BOTTOM HELPER POPUP */}
      {!isMobile && activeTool === 'scale_plan' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-[#080d18]/95 backdrop-blur-md border border-amber-500/50 shadow-2xl text-xs animate-in fade-in slide-in-from-bottom-2">
          <Ruler className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="text-amber-200 font-bold">
            {scalePoints.length === 0
              ? '2-Point Plan Scale (1/2): Click first end of a known dimension on the plan'
              : '2-Point Plan Scale (2/2): Click second end of the known dimension'}
          </span>
          {scalePoints.length > 0 && (
            <button
              type="button"
              onClick={() => setScalePoints([])}
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
            >
              Repick P1
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setScalePoints([]);
              setLockedDraftBounds(null);
              setActiveTool(outline.points.length === 0 ? 'draw_roof' : 'set_pitch');
            }}
            className="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 text-xs font-semibold cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {!isMobile && activeTool === 'draw_roof' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-2 px-3.5 py-2 rounded-2xl bg-[#080d18]/95 backdrop-blur-md border border-emerald-500/45 shadow-2xl text-xs animate-in fade-in slide-in-from-bottom-2">
          {hasExistingFootprint && draftPoints.length === 0 && (
            <div className="flex items-center gap-1 p-0.5 rounded-xl bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setDrawSubMode('free');
                  setAttachedEdge(null);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  drawSubMode === 'free'
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                New Footprint
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawSubMode('attach_edge');
                  setAttachedEdge(null);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                  drawSubMode === 'attach_edge'
                    ? 'bg-amber-600 text-white'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                From Wall / Eave
              </button>
            </div>
          )}
          <Crosshair className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-emerald-200 font-bold">
            {drawSubMode === 'attach_edge' && !attachedEdge
              ? 'Click an existing wall or eave edge to set host reference line'
              : draftPoints.length === 0 && attachedEdge
              ? 'Host wall reference set — click start anywhere (snaps to wall line)'
              : draftPoints.length === 0
              ? planUnderlay && !planUnderlay.isCalibrated && !hasEstablishedScale
                ? 'Click first corner (or use 2-Pt Scale first)'
                : hasExistingFootprint
                ? 'Click corner 1 to add new roof outline (preserves existing)'
                : 'Click first corner on canvas to draw'
              : draftPoints.length === 1 && !draftScaleReady && !hasEstablishedScale
              ? 'Click corner 2 to set first-line scale length'
              : `${draftPoints.length} pts · Type length + Enter or click start`}
          </span>
          {attachedEdge && draftPoints.length === 0 && (
            <button
              type="button"
              onClick={() => setAttachedEdge(null)}
              className="px-2.5 py-1 rounded-xl bg-amber-600/25 hover:bg-amber-600/40 border border-amber-500/45 text-amber-200 text-xs font-bold cursor-pointer"
            >
              Repick Wall
            </button>
          )}
          {draftPoints.length >= 1 && (
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                commitTypedSegmentLength(typedLengthBuffer);
              }}
              className="flex items-center gap-1 bg-slate-950 border border-emerald-500/40 rounded-xl px-2 py-0.5"
            >
              <Ruler className="w-3.5 h-3.5 text-emerald-400" />
              <input
                type="text"
                inputMode="decimal"
                value={typedLengthBuffer}
                onChange={(ev) => setTypedLengthBuffer(ev.target.value)}
                placeholder="Len m/mm"
                aria-label="Typed segment length"
                className="w-20 bg-transparent text-white font-mono font-bold text-xs placeholder:text-slate-500 focus:outline-hidden tabular-nums"
              />
              <button
                type="submit"
                disabled={parseDistanceInputToMetres(typedLengthBuffer, 'auto') === null}
                className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] cursor-pointer disabled:opacity-35"
              >
                Set
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => setOrthoSnap((v) => !v)}
            className={`px-2.5 py-1 rounded-xl text-xs font-bold border cursor-pointer ${
              orthoSnap
                ? 'bg-sky-600/30 border-sky-500/50 text-sky-200'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            Ortho {orthoSnap ? 'ON' : 'OFF'}
          </button>
          {draftPoints.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTypedLengthBuffer('');
                const next = draftPoints.slice(0, -1);
                setDraftPoints(next);
                if (next.length < 2 && !hasEstablishedScale) {
                  setDraftScaleReady(false);
                }
                if (next.length === 0) setLockedDraftBounds(null);
              }}
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
          )}
          {squareClosedPoints && (
            <button
              type="button"
              onClick={() => finishCustomOutline(squareClosedPoints)}
              className="px-3 py-1 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1"
              title="Complete right-angle rectangle back to start (R)"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Close Square</span>
            </button>
          )}
          {draftPoints.length >= 3 && (
            <button
              type="button"
              onClick={() => finishCustomOutline()}
              className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Close Shape</span>
            </button>
          )}
          {(draftPoints.length > 0 || attachedEdge) && (
            <button
              type="button"
              onClick={() => {
                setDraftPoints([]);
                setAttachedEdge(null);
                setLockedDraftBounds(null);
                setTypedLengthBuffer('');
                lastAimPosRef.current = null;
                setDraftScaleReady(hasEstablishedScale);
              }}
              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      )}

      {!isMobile && activeTool === 'add_line' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-[#080d18]/95 backdrop-blur-md border border-purple-500/45 shadow-2xl text-xs animate-in fade-in slide-in-from-bottom-2">
          <Crosshair className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="text-purple-200 font-medium">
            {bisectMode
              ? bisectPts.length === 0
                ? '3-Pt Bisector (1/3): Click first wing/edge point'
                : bisectPts.length === 1
                ? '3-Pt Bisector (2/3): Click corner apex vertex'
                : '3-Pt Bisector (3/3): Click second wing/edge point'
              : lineStartPt
              ? 'Aim & type length + Enter, or click next point (Esc to break)'
              : 'Click start point → click end point to draw ridge, hip, or valley'}
          </span>
          {!bisectMode && lineStartPt && (
            <form
              onSubmit={(ev) => {
                ev.preventDefault();
                commitTypedSegmentLength(typedLengthBuffer);
              }}
              className="flex items-center gap-1 bg-slate-950 border border-purple-500/40 rounded-xl px-2 py-0.5"
            >
              <Ruler className="w-3.5 h-3.5 text-purple-400" />
              <input
                type="text"
                inputMode="decimal"
                value={typedLengthBuffer}
                onChange={(ev) => setTypedLengthBuffer(ev.target.value)}
                placeholder="Len m/mm"
                aria-label="Typed line length"
                className="w-20 bg-transparent text-white font-mono font-bold text-xs placeholder:text-slate-500 focus:outline-hidden tabular-nums"
              />
              <button
                type="submit"
                disabled={parseDistanceInputToMetres(typedLengthBuffer, 'auto') === null}
                className="px-2 py-0.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] cursor-pointer disabled:opacity-35"
              >
                Set
              </button>
            </form>
          )}
          {(lineStartPt || bisectPts.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setLineStartPt(null);
                setBisectPts([]);
                setTypedLengthBuffer('');
              }}
              className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white text-[11px] font-semibold cursor-pointer"
            >
              {lineStartPt ? 'Break Chain' : 'Reset'}
            </button>
          )}
        </div>
      )}

      {!isMobile && !readOnlyGeometry && activeTool === 'adjust_shape' && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[#080d18]/95 backdrop-blur-md border border-amber-500/45 shadow-2xl text-xs animate-in fade-in slide-in-from-bottom-2">
          {selectedVertexIdx !== null && selectedCornerAngleDeg !== null ? (
            <>
              <span className="font-mono font-bold text-amber-200 tabular-nums">
                Corner #{selectedVertexIdx + 1} · {selectedCornerAngleDeg.toFixed(1)}°
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateOutline(squareOutlineCorner(outline, selectedVertexIdx), {
                    autoGenerateSkeleton: false
                  })
                }
                className="px-3 py-1 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer"
                title="Force selected corner to 90 degrees without moving neighbors"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Square Corner (90°)</span>
              </button>
              {outline.points.length > 3 && (
                <button
                  type="button"
                  onClick={() => {
                    onUpdateOutline(deleteVertex(outline, selectedVertexIdx), {
                      autoGenerateSkeleton: false
                    });
                    setSelectedVertexIdx(null);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-rose-600/25 hover:bg-rose-600/40 border border-rose-500/45 text-rose-200 font-bold text-xs cursor-pointer"
                >
                  Delete Corner
                </button>
              )}
            </>
          ) : (
            <span className="text-amber-200 font-semibold">
              Drag corner points · Click a corner to Square 90° · Click an edge to insert corner
            </span>
          )}
        </div>
      )}

      {/* 4. MAIN INTERACTIVE SVG PLAN VIEWPORT */}
      <div
        ref={viewportRef}
        className="w-full flex-1 relative overflow-hidden flex items-center justify-center p-0 sm:p-1.5 touch-none"
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          onClick={(e) => {
            if (suppressNextClickRef.current) {
              suppressNextClickRef.current = false;
              return;
            }
            if (editingMeasurement) {
              setEditingMeasurement(null);
            }
            if (inspectedLine) {
              setInspectedLine(null);
            }
            if (selectedPlaneId && activeTool === 'set_pitch') {
              onSelectPlane(null);
            }
            handleCanvasClick(e);
          }}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          onPointerCancel={handleSvgPointerUp}
          onPointerLeave={() => setMousePos(null)}
          className={`w-full h-full object-contain touch-none ${
            isPanDragging
              ? 'cursor-grabbing'
              : isSpacePanning
              ? 'cursor-grab'
              : activeTool === 'draw_roof' || activeTool === 'scale_plan' || activeTool === 'add_line' || activeTool === 'add_feature'
              ? 'cursor-crosshair'
              : 'cursor-default'
          }`}
        >
          {/* Architectural Blueprint Surface, Clipped Plane Ribs & Hatches */}
          <defs>
            <radialGradient id="cadSurfaceGlow" cx="50%" cy="48%" r="65%">
              <stop offset="0%" stopColor="#0e172a" />
              <stop offset="100%" stopColor="#060a13" />
            </radialGradient>
            <pattern id="wallSoffitHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#94a3b8" strokeWidth="1.2" strokeOpacity="0.34" />
            </pattern>
            <marker
              id="planWalkArrow"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="5.5"
              markerHeight="5.5"
              orient="auto"
            >
              <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#34d399" />
            </marker>
            <marker
              id="fallArrowHead"
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M 1 2 L 8.5 5 L 1 8 z" fill="#ffffff" fillOpacity="0.72" />
            </marker>
            {planes.map((p) => {
              const clipPts = p.planPolygon.map((pt) => `${toSvgX(pt.x)},${toSvgY(pt.y)}`).join(' ');
              return (
                <React.Fragment key={`defs-${p.id}`}>
                  <clipPath id={`planeClip-${p.id}`}>
                    <polygon points={clipPts} />
                  </clipPath>
                  <pattern
                    id={`planRxHatch-${p.id}`}
                    width="10"
                    height="10"
                    patternUnits="userSpaceOnUse"
                    patternTransform="rotate(45)"
                  >
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="10"
                      stroke={p.color || '#ffffff'}
                      strokeWidth="2.8"
                      strokeOpacity="0.4"
                    />
                  </pattern>
                </React.Fragment>
              );
            })}
          </defs>

          {/* Architectural Blueprint Canvas Base */}
          <rect width="100%" height="100%" fill="url(#cadSurfaceGlow)" data-cad-bg="true" />

          {/* TRUE WORLD-SPACE METRIC BLUEPRINT GRID */}
          <g pointerEvents="none">
            {metricGrid.xLines.map((xl) => (
              <line
                key={`gx-${xl.coordM}`}
                x1={xl.svgPos}
                y1={0}
                x2={xl.svgPos}
                y2={svgHeight}
                stroke={xl.isOrigin ? '#0ea5e9' : xl.isMajor ? '#1f2e49' : '#131d30'}
                strokeOpacity={xl.isOrigin ? 0.28 : xl.isMajor ? 0.72 : 0.55}
                strokeWidth={xl.isOrigin ? 1.2 : xl.isMajor ? 0.95 : 0.6}
              />
            ))}
            {metricGrid.yLines.map((yl) => (
              <line
                key={`gy-${yl.coordM}`}
                x1={0}
                y1={yl.svgPos}
                x2={svgWidth}
                y2={yl.svgPos}
                stroke={yl.isOrigin ? '#0ea5e9' : yl.isMajor ? '#1f2e49' : '#131d30'}
                strokeOpacity={yl.isOrigin ? 0.28 : yl.isMajor ? 0.72 : 0.55}
                strokeWidth={yl.isOrigin ? 1.2 : yl.isMajor ? 0.95 : 0.6}
              />
            ))}
            {/* Major Metric Ruler Ticks Along Top Axis */}
            {!isMobile &&
              metricGrid.xLines
                .filter((xl) => xl.isMajor && xl.svgPos > 74 && xl.svgPos < svgWidth - 60)
                .map((xl) => (
                  <text
                    key={`gxt-${xl.coordM}`}
                    x={xl.svgPos + 3}
                    y={svgHeight - 38}
                    fill="#334155"
                    fontSize="8.5"
                    fontFamily="monospace"
                    fontWeight="700"
                  >
                    {xl.coordM}m
                  </text>
                ))}
            {/* Subtle Origin Datum Mark (0,0) */}
            {toSvgX(0) >= 0 && toSvgX(0) <= svgWidth && toSvgY(0) >= 0 && toSvgY(0) <= svgHeight && (
              <g transform={`translate(${toSvgX(0)}, ${toSvgY(0)})`} opacity="0.45">
                <circle r="3.5" fill="none" stroke="#38bdf8" strokeWidth="1" />
                <line x1="-8" y1="0" x2="8" y2="0" stroke="#38bdf8" strokeWidth="0.9" />
                <line x1="0" y1="-8" x2="0" y2="8" stroke="#38bdf8" strokeWidth="0.9" />
              </g>
            )}
          </g>

          {/* ARCHITECTURAL PLAN UNDERLAY IMAGE (1:1 aspect-locked in calibrated world metres) */}
          {planUnderlay && planUnderlay.visible !== false && (
            <g opacity={planUnderlay.opacity ?? 0.72} pointerEvents="none">
              <rect
                x={toSvgX(planUnderlay.worldX)}
                y={toSvgY(planUnderlay.worldY)}
                width={Math.max(4, planUnderlay.worldWidthM * scale)}
                height={Math.max(4, planUnderlay.worldHeightM * scale)}
                fill="#ffffff"
                fillOpacity="0.92"
                stroke={planUnderlay.isCalibrated ? '#10b981' : '#f59e0b'}
                strokeWidth="1.5"
                strokeDasharray={planUnderlay.isCalibrated ? undefined : '6 4'}
              />
              <image
                href={planUnderlay.imageUrl}
                x={toSvgX(planUnderlay.worldX)}
                y={toSvgY(planUnderlay.worldY)}
                width={Math.max(4, planUnderlay.worldWidthM * scale)}
                height={Math.max(4, planUnderlay.worldHeightM * scale)}
                preserveAspectRatio="none"
              />
              {planUnderlay.isCalibrated &&
                planUnderlay.calibrationPtsNorm &&
                planUnderlay.calibrationPtsNorm.length === 2 &&
                (() => {
                  const p1w = planUnderlayNormToWorld(planUnderlay, planUnderlay.calibrationPtsNorm[0]);
                  const p2w = planUnderlayNormToWorld(planUnderlay, planUnderlay.calibrationPtsNorm[1]);
                  const x1 = toSvgX(p1w.x);
                  const y1 = toSvgY(p1w.y);
                  const x2 = toSvgX(p2w.x);
                  const y2 = toSvgY(p2w.y);
                  return (
                    <g opacity={activeTool === 'scale_plan' ? 0.95 : 0.45}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#f59e0b"
                        strokeWidth="2"
                        strokeDasharray="5 3"
                      />
                      <circle cx={x1} cy={y1} r="4" fill="#f59e0b" />
                      <circle cx={x2} cy={y2} r="4" fill="#f59e0b" />
                    </g>
                  );
                })()}
            </g>
          )}

          {/* INACTIVE LEVEL GHOST FOOTPRINTS (when viewing stacked / terraced storeys) */}
          {levels &&
            levels.length > 1 &&
            levels
              .filter((lvl) => activeLevelId !== 'all' && lvl.id !== activeLevelId)
              .map((lvl) => (
                <g
                  key={`ghost-${lvl.id}`}
                  opacity={0.34}
                  pointerEvents={isDrawingOrGeometryTool ? 'none' : undefined}
                  onClick={(ev) => {
                    if (isDrawingOrGeometryTool) return;
                    ev.stopPropagation();
                    onSelectLevel?.(lvl.id);
                  }}
                  className={isDrawingOrGeometryTool ? 'pointer-events-none' : 'cursor-pointer'}
                >
                  {lvl.outline.edges.map((ge) => (
                    <line
                      key={ge.id}
                      x1={toSvgX(ge.from.x)}
                      y1={toSvgY(ge.from.y)}
                      x2={toSvgX(ge.to.x)}
                      y2={toSvgY(ge.to.y)}
                      stroke={ge.type === 'wall' ? '#f59e0b' : '#94a3b8'}
                      strokeWidth="2"
                      strokeDasharray={ge.type === 'wall' || ge.type === 'verge' ? '6 4' : undefined}
                    />
                  ))}
                  {lvl.skeleton.map((gs) => (
                    <line
                      key={gs.id}
                      x1={toSvgX(gs.from.x)}
                      y1={toSvgY(gs.from.y)}
                      x2={toSvgX(gs.to.x)}
                      y2={toSvgY(gs.to.y)}
                      stroke="#64748b"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  ))}
                </g>
              ))}

          {/* DEFINED ROOF AREAS WITH TRUE-SCALE 762MM SHEET COURSE RIBS & SLOPE FALL ARROWS */}
          {planes.map((plane) => {
            const isDimmedByLevel =
              Boolean(levels && levels.length > 1 && activeLevelId && activeLevelId !== 'all') &&
              (plane.levelId || 'level-1') !== activeLevelId;
            const isSelected = selectedPlaneId === plane.id;
            const isStart =
              plane.id === (startPlaneId || layout?.startPlaneId) ||
              layout?.startPlaneId === `${plane.id}__lower` ||
              plane.isStartEdge;
            const pointsStr = plane.planPolygon
              .map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`)
              .join(' ');

            const cx =
              plane.planPolygon.reduce((acc, p) => acc + p.x, 0) / plane.planPolygon.length;
            const cy =
              plane.planPolygon.reduce((acc, p) => acc + p.y, 0) / plane.planPolygon.length;

            const isInstalled = completedPlaneIds.includes(plane.id);
            const hasOrderedOverride =
              typeof plane.orderedSheetLengthM === 'number' &&
              (plane.slopeLength ?? 0) > 0 &&
              Math.round(plane.orderedSheetLengthM * 1000) !== Math.round((plane.slopeLength ?? 0) * 1000);

            const eaveX1 = toSvgX(plane.planPolygon[0]?.x || 0);
            const eaveY1 = toSvgY(plane.planPolygon[0]?.y || 0);
            const eaveX2 = toSvgX(plane.planPolygon[1]?.x || 0);
            const eaveY2 = toSvgY(plane.planPolygon[1]?.y || 0);

            const courseSegments = !isDimmedByLevel ? computeSheetCourseSegments(plane) : [];
            const dirOverlay = !isDimmedByLevel ? computePlaneDirectionOverlay(plane) : null;

            return (
              <g
                key={plane.id}
                pointerEvents={isDrawingOrGeometryTool ? 'none' : undefined}
                onClick={(e) => {
                  if (isDrawingOrGeometryTool) return;
                  e.stopPropagation();
                  setInspectedLine(null);
                  setEditingMeasurement(null);
                  onSelectPlane(plane.id);
                  if (readOnlyGeometry) {
                    onInstallSelectPlane?.(plane.id);
                  }
                }}
                className={
                  isCanvasTapTool
                    ? 'cursor-crosshair group'
                    : isDrawingOrGeometryTool
                    ? 'pointer-events-none'
                    : 'cursor-pointer group'
                }
              >
                <polygon
                  points={pointsStr}
                  fill={isInstalled ? '#059669' : plane.color || '#2563eb'}
                  fillOpacity={
                    isDimmedByLevel
                      ? 0.12
                      : isSelected
                      ? 0.56
                      : isInstalled
                      ? 0.48
                      : 0.34
                  }
                  stroke={isStart ? '#10b981' : isSelected ? '#ffffff' : plane.color || '#3b82f6'}
                  strokeOpacity={isDimmedByLevel ? 0.35 : 0.95}
                  strokeWidth={isStart ? '3.8' : isSelected ? '3' : '1.8'}
                  className="transition-all group-hover:fill-opacity-50"
                />

                {/* Clipped True-Scale 762mm Long-Run Sheet Course Ribs */}
                {courseSegments.length > 0 && (
                  <g clipPath={`url(#planeClip-${plane.id})`} pointerEvents="none">
                    {courseSegments.map((seg, si) => (
                      <line
                        key={`rib-${plane.id}-${si}`}
                        x1={toSvgX(seg.from.x)}
                        y1={toSvgY(seg.from.y)}
                        x2={toSvgX(seg.to.x)}
                        y2={toSvgY(seg.to.y)}
                        stroke="#ffffff"
                        strokeOpacity={isSelected ? 0.24 : 0.12}
                        strokeWidth={scale >= 34 ? 1.05 : 0.7}
                      />
                    ))}
                  </g>
                )}

                {/* Slope Fall Arrow Toward Eave */}
                {dirOverlay && dirOverlay.planRunM >= 0.8 && (
                  <g pointerEvents="none" opacity={isSelected ? 0.92 : 0.62}>
                    <line
                      x1={toSvgX(dirOverlay.arrowTail.x)}
                      y1={toSvgY(dirOverlay.arrowTail.y)}
                      x2={toSvgX(dirOverlay.arrowTip.x)}
                      y2={toSvgY(dirOverlay.arrowTip.y)}
                      stroke="#ffffff"
                      strokeOpacity="0.68"
                      strokeWidth="1.5"
                      strokeDasharray="3 2"
                      markerEnd="url(#fallArrowHead)"
                    />
                  </g>
                )}

                {/* Start Edge Eave Highlight */}
                {isStart && (
                  <g pointerEvents="none">
                    <line
                      x1={eaveX1}
                      y1={eaveY1}
                      x2={eaveX2}
                      y2={eaveY2}
                      stroke="#10b981"
                      strokeWidth="5.5"
                      strokeLinecap="round"
                    />
                  </g>
                )}

                {/* Inherited Colour Receiving Zones */}
                {(layout?.receivingZones || plane.receivingZones || [])
                  .filter(
                    (zone) =>
                      zone.targetPlaneId === plane.id ||
                      zone.targetPlaneId === `${plane.id}__lower` ||
                      zone.targetPlaneId === `${plane.id}__upper`
                  )
                  .map((zone) => {
                    const zonePtsStr = zone.planPolygon
                      .map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`)
                      .join(' ');

                    return (
                      <g key={zone.id} className="pointer-events-none">
                        <polygon points={zonePtsStr} fill={zone.softSourceColor} />
                        <polygon
                          points={zonePtsStr}
                          fill={`url(#planRxHatch-${zone.sourcePlaneId})`}
                          stroke={zone.tintColor}
                          strokeWidth="1.6"
                          strokeDasharray="4 2"
                        />
                      </g>
                    );
                  })}

                {/* Architectural Facet Callout Badge (Code + Pitch + Site Override Pill if set) */}
                <g transform={`translate(${toSvgX(cx)}, ${toSvgY(cy)})`} pointerEvents="none">
                  <rect
                    x="-27"
                    y="-11"
                    width="54"
                    height="22"
                    rx="11"
                    fill="#070b14"
                    fillOpacity={isSelected ? '0.96' : '0.86'}
                    stroke={isInstalled ? '#10b981' : isStart ? '#34d399' : isSelected ? '#ffffff' : plane.color || '#3b82f6'}
                    strokeWidth={isSelected ? '2' : '1.3'}
                  />
                  <text
                    x="0"
                    y="3.5"
                    textAnchor="middle"
                    fill={isInstalled ? '#a7f3d0' : isStart ? '#6ee7b7' : '#ffffff'}
                    fontSize="10"
                    fontWeight="800"
                    fontFamily="monospace"
                  >
                    {isInstalled ? '✓' : ''}
                    {plane.code || 'A'}·{plane.pitchDeg}°
                  </text>
                  {hasOrderedOverride && (
                    <g transform="translate(0, 18)">
                      <rect
                        x="-28"
                        y="-7.5"
                        width="56"
                        height="15"
                        rx="7.5"
                        fill="#064e3b"
                        fillOpacity="0.95"
                        stroke="#10b981"
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="3"
                        textAnchor="middle"
                        fill="#a7f3d0"
                        fontSize="8.2"
                        fontWeight="800"
                        fontFamily="monospace"
                      >
                        {Math.round(plane.orderedSheetLengthM! * 1000)}mm
                      </text>
                    </g>
                  )}
                </g>
              </g>
            );
          })}

          {/* CHANGE-OF-PITCH BREAK LINES */}
          {pitchBreaks.map((pb) => {
            const hostPlane = planes.find((p) => p.id === pb.planeId);
            if (!hostPlane || hostPlane.planPolygon.length < 3) return null;
            const p0 = hostPlane.planPolygon[0];
            const p1 = hostPlane.planPolygon[1] || p0;
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const eLen = Math.hypot(dx, dy) || 1;
            const uVec = { x: dx / eLen, y: dy / eLen };
            const vInward = hostPlane.runDirection || { x: -uVec.y, y: uVec.x };

            // Intersect line v = pb.splitPlanDistM cleanly against hostPlane polygon edges
            const hits: { u: number; pt: { x: number; y: number } }[] = [];
            for (let i = 0; i < hostPlane.planPolygon.length; i++) {
              const a = hostPlane.planPolygon[i];
              const b = hostPlane.planPolygon[(i + 1) % hostPlane.planPolygon.length];
              const va = (a.x - p0.x) * vInward.x + (a.y - p0.y) * vInward.y;
              const vb = (b.x - p0.x) * vInward.x + (b.y - p0.y) * vInward.y;
              if ((va <= pb.splitPlanDistM && vb >= pb.splitPlanDistM) || (va >= pb.splitPlanDistM && vb <= pb.splitPlanDistM)) {
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
            const isSel = selectedPitchBreakId === pb.id;
            return (
              <g
                key={pb.id}
                pointerEvents={isCanvasTapTool || activeTool === 'adjust_shape' ? 'none' : undefined}
                onClick={(ev) => {
                  if (isCanvasTapTool || activeTool === 'adjust_shape') return;
                  ev.stopPropagation();
                  if (activeTool === 'delete_line') {
                    onDeletePitchBreak?.(pb.id);
                  } else if (activeTool === 'assign_flashing' && onSelectLineForFlashing) {
                    onSelectLineForFlashing(pb.id);
                  } else {
                    onSelectPitchBreak?.(pb.id);
                  }
                }}
                className={
                  isCanvasTapTool || activeTool === 'adjust_shape'
                    ? 'pointer-events-none'
                    : 'cursor-pointer group'
                }
              >
                <line
                  x1={toSvgX(b1.x)}
                  y1={toSvgY(b1.y)}
                  x2={toSvgX(b2.x)}
                  y2={toSvgY(b2.y)}
                  stroke="transparent"
                  strokeWidth="22"
                />
                <line
                  x1={toSvgX(b1.x)}
                  y1={toSvgY(b1.y)}
                  x2={toSvgX(b2.x)}
                  y2={toSvgY(b2.y)}
                  stroke={isSel ? '#ffffff' : '#f59e0b'}
                  strokeWidth={isSel ? '3.5' : '2.8'}
                  strokeDasharray="8 3 2 3"
                  strokeLinecap="round"
                />
                <g transform={`translate(${(toSvgX(b1.x) + toSvgX(b2.x)) / 2}, ${(toSvgY(b1.y) + toSvgY(b2.y)) / 2})`}>
                  <circle
                    r="9.5"
                    fill="#090d16"
                    fillOpacity="0.92"
                    stroke={isSel ? '#ffffff' : '#f59e0b'}
                    strokeWidth="1.5"
                  />
                  <text
                    x="0"
                    y="3.2"
                    textAnchor="middle"
                    fill="#fbbf24"
                    fontSize="8.5"
                    fontWeight="900"
                    fontFamily="monospace"
                  >
                    PB
                  </text>
                </g>
              </g>
            );
          })}

          {/* EXTRA ROOF ASSETS (Skylights, Chimneys, Mono Dormers, Gable Dormers) */}
          {assets.map((asset) => {
            const hostPlane = planes.find((p) => p.id === asset.planeId);
            const p0 = hostPlane?.planPolygon[0] || { x: 0, y: 0 };
            const p1 = hostPlane?.planPolygon[1] || { x: 1, y: 0 };
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const len = Math.hypot(dx, dy) || 1;
            const uVec = { x: dx / len, y: dy / len };
            const vInward = hostPlane?.runDirection || { x: -uVec.y, y: uVec.x };
            const angleDeg = (Math.atan2(uVec.y, uVec.x) * 180) / Math.PI;
            const svgCx = toSvgX(asset.center.x);
            const svgCy = toSvgY(asset.center.y);
            const wPx = asset.widthM * scale;
            const dPx = asset.depthM * scale;
            const isSel = selectedAssetId === asset.id;

            const handleAssetPointerDown = (ev: React.PointerEvent) => {
              if (isCanvasTapTool) return;
              ev.stopPropagation();
              if (activeTool === 'delete_line') {
                onDeleteAsset?.(asset.id);
                return;
              }
              onSelectAsset?.(asset.id);
              if (activeTool === 'set_pitch' || activeTool === 'adjust_shape') {
                (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
                setDraggedAssetId(asset.id);
              }
            };

            if (asset.type === 'gable_dormer' && hostPlane) {
              const geom = computeGableDormerGeometry(hostPlane, asset);
              if (geom) {
                const leftPtsStr = geom.leftSlopePlanPolygon
                  .map((pt) => `${toSvgX(pt.x)},${toSvgY(pt.y)}`)
                  .join(' ');
                const rightPtsStr = geom.rightSlopePlanPolygon
                  .map((pt) => `${toSvgX(pt.x)},${toSvgY(pt.y)}`)
                  .join(' ');
                const labelPos = {
                  x: toSvgX(geom.pFMid.x - geom.vInward.x * 0.35),
                  y: toSvgY(geom.pFMid.y - geom.vInward.y * 0.35)
                };

                return (
                  <g
                    key={asset.id}
                    pointerEvents={isCanvasTapTool ? 'none' : undefined}
                    onPointerDown={handleAssetPointerDown}
                    onClick={(ev) => {
                      if (isCanvasTapTool) return;
                      ev.stopPropagation();
                    }}
                    className={isCanvasTapTool ? 'pointer-events-none' : 'cursor-move group'}
                  >
                    {/* Left & Right Dormer Roof Slopes bounded by true pitch-matched valleys */}
                    <polygon
                      points={leftPtsStr}
                      fill="#0ea5e9"
                      fillOpacity={isSel ? 0.52 : 0.38}
                      stroke={isSel ? '#ffffff' : '#38bdf8'}
                      strokeWidth={isSel ? '2.4' : '1.6'}
                    />
                    <polygon
                      points={rightPtsStr}
                      fill="#38bdf8"
                      fillOpacity={isSel ? 0.52 : 0.34}
                      stroke={isSel ? '#ffffff' : '#38bdf8'}
                      strokeWidth={isSel ? '2.4' : '1.6'}
                    />
                    {/* Front Gable Verge Edge */}
                    <polyline
                      points={`${toSvgX(geom.pFL.x)},${toSvgY(geom.pFL.y)} ${toSvgX(geom.pFMid.x)},${toSvgY(geom.pFMid.y)} ${toSvgX(geom.pFR.x)},${toSvgY(geom.pFR.y)}`}
                      fill="none"
                      stroke="#818cf8"
                      strokeWidth="2.8"
                      strokeDasharray="5 3"
                    />
                    {/* Central Dormer Ridge */}
                    <line
                      x1={toSvgX(geom.pFMid.x)}
                      y1={toSvgY(geom.pFMid.y)}
                      x2={toSvgX(geom.pRidgeTie.x)}
                      y2={toSvgY(geom.pRidgeTie.y)}
                      stroke="#c084fc"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                    />
                    {/* True Pitch-Matched Angled Valleys meeting at Ridge Tie-In */}
                    <line
                      x1={toSvgX(geom.pCheekL.x)}
                      y1={toSvgY(geom.pCheekL.y)}
                      x2={toSvgX(geom.pRidgeTie.x)}
                      y2={toSvgY(geom.pRidgeTie.y)}
                      stroke="#fbbf24"
                      strokeWidth="2.8"
                      strokeDasharray="6 3"
                      strokeLinecap="round"
                    />
                    <line
                      x1={toSvgX(geom.pCheekR.x)}
                      y1={toSvgY(geom.pCheekR.y)}
                      x2={toSvgX(geom.pRidgeTie.x)}
                      y2={toSvgY(geom.pRidgeTie.y)}
                      stroke="#fbbf24"
                      strokeWidth="2.8"
                      strokeDasharray="6 3"
                      strokeLinecap="round"
                    />
                    <g transform={`translate(${labelPos.x}, ${labelPos.y})`} pointerEvents="none">
                      <circle r="9.5" fill="#090d16" stroke={isSel ? '#ffffff' : '#38bdf8'} strokeWidth="1.4" />
                      <text
                        x="0"
                        y="3.2"
                        textAnchor="middle"
                        fill="#e2e8f0"
                        fontSize="8.5"
                        fontWeight="900"
                        fontFamily="monospace"
                      >
                        GD
                      </text>
                    </g>
                    {isSel && (() => {
                      const m = computeAssetPlacementMetrics(hostPlane, asset);
                      const eavePt = {
                        x: m.pA.x + m.uC * m.uVec.x + m.minVPlan * m.vInward.x,
                        y: m.pA.y + m.uC * m.uVec.y + m.minVPlan * m.vInward.y
                      };
                      const apexPt = {
                        x: m.pA.x + m.uC * m.uVec.x + m.maxVPlan * m.vInward.x,
                        y: m.pA.y + m.uC * m.uVec.y + m.maxVPlan * m.vInward.y
                      };
                      return (
                        <g pointerEvents="none">
                          <line
                            x1={toSvgX(eavePt.x)}
                            y1={toSvgY(eavePt.y)}
                            x2={toSvgX(geom.pFMid.x)}
                            y2={toSvgY(geom.pFMid.y)}
                            stroke="#38bdf8"
                            strokeWidth="1.5"
                            strokeDasharray="3 2"
                          />
                          <line
                            x1={toSvgX(geom.pRidgeTie.x)}
                            y1={toSvgY(geom.pRidgeTie.y)}
                            x2={toSvgX(apexPt.x)}
                            y2={toSvgY(apexPt.y)}
                            stroke="#c084fc"
                            strokeWidth="1.5"
                            strokeDasharray="3 2"
                          />
                          <g transform={`translate(${svgCx}, ${svgCy - dPx / 2 - 14})`}>
                            <rect x="-54" y="-9" width="108" height="16" rx="4" fill="#090d16" fillOpacity="0.92" stroke="#38bdf8" strokeWidth="1" />
                            <text x="0" y="2" textAnchor="middle" fill="#bae6fd" fontSize="8" fontWeight="800" fontFamily="monospace">
                              {`E:${m.distFromEaveM.toFixed(2)}m · A:${m.distFromApexM.toFixed(2)}m`}
                            </text>
                          </g>
                        </g>
                      );
                    })()}
                  </g>
                );
              }
            }

            return (
              <g
                key={asset.id}
                transform={`translate(${svgCx}, ${svgCy}) rotate(${angleDeg})`}
                pointerEvents={isCanvasTapTool ? 'none' : undefined}
                onPointerDown={handleAssetPointerDown}
                onClick={(ev) => {
                  if (isCanvasTapTool) return;
                  ev.stopPropagation();
                }}
                className={isCanvasTapTool ? 'pointer-events-none' : 'cursor-move group'}
              >
                {asset.type === 'skylight' && (
                  <>
                    <rect
                      x={-wPx / 2}
                      y={-dPx / 2}
                      width={wPx}
                      height={dPx}
                      rx="2"
                      fill="#0284c7"
                      fillOpacity="0.45"
                      stroke={isSel ? '#ffffff' : '#38bdf8'}
                      strokeWidth={isSel ? '2.5' : '1.8'}
                    />
                    <line
                      x1={-wPx * 0.35}
                      y1={dPx * 0.25}
                      x2={wPx * 0.25}
                      y2={-dPx * 0.35}
                      stroke="#bae6fd"
                      strokeWidth="1.5"
                      strokeOpacity="0.7"
                    />
                  </>
                )}

                {asset.type === 'chimney' && (
                  <>
                    <rect
                      x={-wPx / 2}
                      y={-dPx / 2}
                      width={wPx}
                      height={dPx}
                      rx="2"
                      fill="#1e293b"
                      stroke={isSel ? '#ffffff' : '#94a3b8'}
                      strokeWidth={isSel ? '2.5' : '1.8'}
                    />
                    <line
                      x1={-wPx / 2}
                      y1={-dPx / 2}
                      x2={wPx / 2}
                      y2={dPx / 2}
                      stroke="#64748b"
                      strokeWidth="1.2"
                    />
                    <line
                      x1={wPx / 2}
                      y1={-dPx / 2}
                      x2={-wPx / 2}
                      y2={dPx / 2}
                      stroke="#64748b"
                      strokeWidth="1.2"
                    />
                    <circle r={Math.min(wPx, dPx) * 0.22} fill="#090d16" stroke="#94a3b8" strokeWidth="1.2" />
                  </>
                )}

                {asset.type === 'mono_dormer' && (
                  <>
                    <rect
                      x={-wPx / 2}
                      y={-dPx / 2}
                      width={wPx}
                      height={dPx}
                      fill="#0ea5e9"
                      fillOpacity="0.35"
                      stroke={isSel ? '#ffffff' : '#38bdf8'}
                      strokeWidth={isSel ? '2.8' : '2'}
                    />
                    <line
                      x1={-wPx / 2}
                      y1={vInward.y >= 0 ? -dPx / 2 : dPx / 2}
                      x2={wPx / 2}
                      y2={vInward.y >= 0 ? -dPx / 2 : dPx / 2}
                      stroke="#22c55e"
                      strokeWidth="3"
                    />
                  </>
                )}

                {asset.type === 'gable_dormer' && (
                  <>
                    <rect
                      x={-wPx / 2}
                      y={-dPx / 2}
                      width={wPx}
                      height={dPx}
                      fill="#0ea5e9"
                      fillOpacity="0.38"
                      stroke={isSel ? '#ffffff' : '#38bdf8'}
                      strokeWidth={isSel ? '2.8' : '2'}
                    />
                    <line
                      x1={0}
                      y1={-dPx / 2}
                      x2={0}
                      y2={dPx / 2}
                      stroke="#c084fc"
                      strokeWidth="2.5"
                    />
                  </>
                )}

                <text
                  x="0"
                  y="3"
                  textAnchor="middle"
                  fill="#e2e8f0"
                  stroke="#090d16"
                  strokeWidth="3"
                  style={{ paintOrder: 'stroke' }}
                  fontSize="8.5"
                  fontWeight="900"
                  fontFamily="monospace"
                  pointerEvents="none"
                >
                  {asset.type === 'skylight'
                    ? 'SK'
                    : asset.type === 'chimney'
                    ? 'CH'
                    : asset.type === 'mono_dormer'
                    ? 'MD'
                    : 'GD'}
                </text>

                {isSel && hostPlane && (() => {
                  const m = computeAssetPlacementMetrics(hostPlane, asset);
                  const eavePt = {
                    x: m.pA.x + m.uC * m.uVec.x + m.minVPlan * m.vInward.x,
                    y: m.pA.y + m.uC * m.uVec.y + m.minVPlan * m.vInward.y
                  };
                  const apexPt = {
                    x: m.pA.x + m.uC * m.uVec.x + m.maxVPlan * m.vInward.x,
                    y: m.pA.y + m.uC * m.uVec.y + m.maxVPlan * m.vInward.y
                  };
                  const relEaveLocalY =
                    ((eavePt.x - asset.center.x) * -Math.sin((angleDeg * Math.PI) / 180) +
                      (eavePt.y - asset.center.y) * Math.cos((angleDeg * Math.PI) / 180)) *
                    scale;
                  const relApexLocalY =
                    ((apexPt.x - asset.center.x) * -Math.sin((angleDeg * Math.PI) / 180) +
                      (apexPt.y - asset.center.y) * Math.cos((angleDeg * Math.PI) / 180)) *
                    scale;
                  const frontEdgeY = relEaveLocalY < 0 ? -dPx / 2 : dPx / 2;
                  const backEdgeY = -frontEdgeY;
                  return (
                    <g pointerEvents="none">
                      <line
                        x1="0"
                        y1={relEaveLocalY}
                        x2="0"
                        y2={frontEdgeY}
                        stroke="#38bdf8"
                        strokeWidth="1.5"
                        strokeDasharray="3 2"
                      />
                      <line
                        x1="0"
                        y1={backEdgeY}
                        x2="0"
                        y2={relApexLocalY}
                        stroke="#c084fc"
                        strokeWidth="1.5"
                        strokeDasharray="3 2"
                      />
                      <g transform={`translate(0, ${-dPx / 2 - 14}) rotate(${-angleDeg})`}>
                        <rect x="-54" y="-9" width="108" height="16" rx="4" fill="#090d16" fillOpacity="0.92" stroke="#38bdf8" strokeWidth="1" />
                        <text x="0" y="2" textAnchor="middle" fill="#bae6fd" fontSize="8" fontWeight="800" fontFamily="monospace">
                          {`E:${m.distFromEaveM.toFixed(2)}m · A:${m.distFromApexM.toFixed(2)}m`}
                        </text>
                      </g>
                    </g>
                  );
                })()}
              </g>
            );
          })}

          {/* DRAG BOX PREVIEW WHILE DRAWING A NEW FEATURE */}
          {activeTool === 'add_feature' && dragBoxStart && dragBoxCurrent && featureType !== 'pitch_break' && (
            <rect
              x={Math.min(toSvgX(dragBoxStart.x), toSvgX(dragBoxCurrent.x))}
              y={Math.min(toSvgY(dragBoxStart.y), toSvgY(dragBoxCurrent.y))}
              width={Math.max(12, Math.abs(toSvgX(dragBoxCurrent.x) - toSvgX(dragBoxStart.x)))}
              height={Math.max(12, Math.abs(toSvgY(dragBoxCurrent.y) - toSvgY(dragBoxStart.y)))}
              fill="#06b6d4"
              fillOpacity="0.25"
              stroke="#22d3ee"
              strokeWidth="2"
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}

          {/* ROOF LINES (Ridges, Hips, Valleys) WITH MINIMAL CLICKABLE CODE BADGES */}
          {displaySkeleton.map((s) => {
            const x1 = toSvgX(s.from.x);
            const y1 = toSvgY(s.from.y);
            const x2 = toSvgX(s.to.x);
            const y2 = toSvgY(s.to.y);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const lineLenM = +dist(s.from, s.to).toFixed(2);

            const strokeColor =
              s.suggestedType === 'ridge'
                ? '#c084fc'
                : s.suggestedType === 'valley'
                ? '#fbbf24'
                : '#38bdf8';

            const lineCode =
              s.suggestedType === 'ridge' ? 'R' : s.suggestedType === 'valley' ? 'V' : 'H';

            const assignedFlashing = assignmentByLineId.get(s.id);
            const isInspected = inspectedLine?.kind === 'skeleton' && inspectedLine.id === s.id;

            const isLineNonSelectable = isCanvasTapTool || activeTool === 'adjust_shape';
            const handleSkeletonLineSelect = (ev: React.MouseEvent) => {
              if (isLineNonSelectable) return;
              ev.stopPropagation();
              if (activeTool === 'delete_line' && !readOnlyGeometry) {
                onUpdateSkeleton(displaySkeleton.filter((sk) => sk.id !== s.id));
                return;
              }
              if (activeTool === 'assign_flashing' && onSelectLineForFlashing) {
                onSelectLineForFlashing(s.id);
                return;
              }
              setEditingMeasurement(null);
              onSelectPlane(null);
              setInspectedLine({ kind: 'skeleton', id: s.id });
            };

            return (
              <g
                key={s.id}
                pointerEvents={isLineNonSelectable ? 'none' : undefined}
                onClick={handleSkeletonLineSelect}
                className={isLineNonSelectable ? 'pointer-events-none' : 'cursor-pointer group'}
              >
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={isTouchDevice ? '28' : '20'}
                />
                {(assignedFlashing || isInspected) && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isInspected ? '#ffffff' : '#10b981'}
                    strokeOpacity={isInspected ? '0.65' : '0.45'}
                    strokeWidth="8.5"
                    strokeLinecap="round"
                  />
                )}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={strokeColor}
                  strokeWidth={s.suggestedType === 'hip' ? '3' : '3.5'}
                  strokeDasharray={s.suggestedType === 'valley' ? '6 3' : undefined}
                  strokeLinecap="round"
                  className="transition-all group-hover:stroke-white group-hover:stroke-[4px]"
                />

                {showAllDims ? (
                  <g transform={`translate(${midX}, ${midY})`} className="cursor-pointer">
                    <rect
                      x="-22"
                      y="-9.5"
                      width="44"
                      height="19"
                      rx="9.5"
                      fill={isInspected ? '#0369a1' : assignedFlashing ? '#064e3b' : '#090d16'}
                      fillOpacity="0.92"
                      stroke={isInspected ? '#ffffff' : assignedFlashing ? '#10b981' : strokeColor}
                      strokeWidth="1.2"
                    />
                    <text
                      x="0"
                      y="3.2"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {lineLenM}m
                    </text>
                  </g>
                ) : (
                  <g transform={`translate(${midX}, ${midY})`} className="cursor-pointer group/badge">
                    <circle r={isTouchDevice ? 16 : 12} fill="transparent" />
                    <circle
                      r="8.5"
                      fill={isInspected ? '#0284c7' : assignedFlashing ? '#064e3b' : '#090d16'}
                      fillOpacity="0.94"
                      stroke={isInspected ? '#ffffff' : assignedFlashing ? '#10b981' : strokeColor}
                      strokeWidth={isInspected ? '2' : '1.4'}
                      className="transition-transform group-hover/badge:scale-125"
                    />
                    <text
                      x="0"
                      y="3"
                      textAnchor="middle"
                      fill={assignedFlashing ? '#6ee7b7' : '#ffffff'}
                      fontSize="8.5"
                      fontWeight="900"
                      fontFamily="monospace"
                      pointerEvents="none"
                    >
                      {lineCode}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* OUTLINE EDGES (UNCLASSIFIED, EAVES, GABLE VERGES, ABUTMENT WALLS & RIDGE/HIP/VALLEY BOUNDARIES) */}
          {(() => {
            const displayEdges =
              activeLevelId === 'all' && levels && levels.length > 1
                ? levels.flatMap((l) => l.outline.edges)
                : outline.edges;
            return displayEdges;
          })().map((e) => {
            const x1 = toSvgX(e.from.x);
            const y1 = toSvgY(e.from.y);
            const x2 = toSvgX(e.to.x);
            const y2 = toSvgY(e.to.y);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            const edgeLenM = +dist(e.from, e.to).toFixed(2);
            const isGableVerge = e.type === 'verge';
            const isWall = e.type === 'wall';
            const isUnclassified = e.type === 'unclassified';
            const isPerimRidge = e.type === 'ridge';
            const isPerimHip = e.type === 'hip';
            const isPerimValley = e.type === 'valley';
            const isDefined = planes.some((p) => p.eaveEdgeId === e.id);
            const assignedFlashing = assignmentByLineId.get(e.id);
            const isInspected = inspectedLine?.kind === 'edge' && inspectedLine.id === e.id;
            const edgeCode = isWall
              ? 'W'
              : isGableVerge
              ? 'B'
              : isPerimRidge
              ? 'R'
              : isPerimHip
              ? 'H'
              : isPerimValley
              ? 'V'
              : isUnclassified
              ? '?'
              : 'E';
            const edgeStroke = isWall
              ? '#f59e0b'
              : isGableVerge
              ? '#818cf8'
              : isPerimRidge
              ? '#c084fc'
              : isPerimHip
              ? '#38bdf8'
              : isPerimValley
              ? '#fbbf24'
              : isUnclassified
              ? '#94a3b8'
              : isDefined
              ? '#22c55e'
              : '#ffffff';

            const owningOutline =
              (levels && e.levelId ? levels.find((l) => l.id === e.levelId)?.outline : undefined) ||
              outline;
            const wallLine = isEdgeWallEnabled(e)
              ? computeEdgeSetbackLine(owningOutline, e.id)
              : null;

            return (
              <g
                key={e.id}
                pointerEvents={isCanvasTapTool ? 'none' : undefined}
                onClick={(ev) => {
                  if (isCanvasTapTool) return;
                  if (levels && e.levelId && activeLevelId === 'all' && !isDrawingOrGeometryTool) {
                    onSelectLevel?.(e.levelId);
                  }
                  handleEdgeClick(e, ev);
                }}
                className={isCanvasTapTool ? 'pointer-events-none' : 'cursor-pointer group'}
              >
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={isTouchDevice ? '30' : '22'}
                />
                {(assignedFlashing || isInspected) && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isInspected ? '#ffffff' : '#10b981'}
                    strokeOpacity={isInspected ? '0.65' : '0.45'}
                    strokeWidth="9"
                    strokeLinecap="round"
                  />
                )}
                {wallLine && wallLine.eaveSetbackM > 0.02 && (
                  <g pointerEvents="none">
                    <polygon
                      points={`${x1},${y1} ${x2},${y2} ${toSvgX(wallLine.wallTo.x)},${toSvgY(wallLine.wallTo.y)} ${toSvgX(wallLine.wallFrom.x)},${toSvgY(wallLine.wallFrom.y)}`}
                      fill="url(#wallSoffitHatch)"
                    />
                    <line
                      x1={toSvgX(wallLine.wallFrom.x)}
                      y1={toSvgY(wallLine.wallFrom.y)}
                      x2={toSvgX(wallLine.wallTo.x)}
                      y2={toSvgY(wallLine.wallTo.y)}
                      stroke="#cbd5e1"
                      strokeWidth="1.6"
                      strokeDasharray="4 3"
                      strokeOpacity="0.72"
                    />
                  </g>
                )}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={edgeStroke}
                  strokeWidth={isWall ? '4.5' : isGableVerge ? '3.8' : isDefined ? '4' : '3.2'}
                  strokeDasharray={
                    isWall
                      ? '10 3'
                      : isGableVerge
                      ? '8 5'
                      : isUnclassified
                      ? '5 4'
                      : isPerimValley
                      ? '6 3'
                      : undefined
                  }
                  strokeLinecap="round"
                  className="transition-all group-hover:stroke-sky-400"
                />

                {showAllDims ? (
                  (() => {
                    const offsetM = Math.max(0.55, Math.min(1.6, 22 / Math.max(scale, 8)));
                    const dimGeom = computeEdgeDimensionPlacement(e, owningOutline, offsetM);
                    const dx1 = toSvgX(dimGeom.dimStart.x);
                    const dy1 = toSvgY(dimGeom.dimStart.y);
                    const dx2 = toSvgX(dimGeom.dimEnd.x);
                    const dy2 = toSvgY(dimGeom.dimEnd.y);
                    const lx = toSvgX(dimGeom.labelPos.x);
                    const ly = toSvgY(dimGeom.labelPos.y);
                    const dimColor = isInspected
                      ? '#38bdf8'
                      : assignedFlashing
                      ? '#10b981'
                      : isWall
                      ? '#f59e0b'
                      : isGableVerge
                      ? '#818cf8'
                      : '#22c55e';
                    return (
                      <g className="cursor-pointer">
                        {/* Extension witness lines */}
                        <line
                          x1={toSvgX(dimGeom.extStart1.x)}
                          y1={toSvgY(dimGeom.extStart1.y)}
                          x2={toSvgX(dimGeom.extEnd1.x)}
                          y2={toSvgY(dimGeom.extEnd1.y)}
                          stroke={dimColor}
                          strokeOpacity="0.45"
                          strokeWidth="0.9"
                          pointerEvents="none"
                        />
                        <line
                          x1={toSvgX(dimGeom.extStart2.x)}
                          y1={toSvgY(dimGeom.extStart2.y)}
                          x2={toSvgX(dimGeom.extEnd2.x)}
                          y2={toSvgY(dimGeom.extEnd2.y)}
                          stroke={dimColor}
                          strokeOpacity="0.45"
                          strokeWidth="0.9"
                          pointerEvents="none"
                        />
                        {/* Architectural dimension spine */}
                        <line
                          x1={dx1}
                          y1={dy1}
                          x2={dx2}
                          y2={dy2}
                          stroke={dimColor}
                          strokeOpacity="0.72"
                          strokeWidth="1.15"
                          pointerEvents="none"
                        />
                        {/* End tick dots */}
                        <circle cx={dx1} cy={dy1} r="2.2" fill={dimColor} pointerEvents="none" />
                        <circle cx={dx2} cy={dy2} r="2.2" fill={dimColor} pointerEvents="none" />
                        {/* Dimension callout pill */}
                        <g transform={`translate(${lx}, ${ly})`}>
                          <rect
                            x="-26"
                            y="-9.5"
                            width="52"
                            height="19"
                            rx="9.5"
                            fill={
                              isInspected
                                ? '#0369a1'
                                : assignedFlashing
                                ? '#064e3b'
                                : '#070b14'
                            }
                            fillOpacity="0.95"
                            stroke={dimColor}
                            strokeWidth="1.2"
                          />
                          <text
                            x="0"
                            y="3.2"
                            textAnchor="middle"
                            fill="#ffffff"
                            fontSize="9"
                            fontWeight="800"
                            fontFamily="monospace"
                          >
                            {edgeLenM}m
                          </text>
                        </g>
                      </g>
                    );
                  })()
                ) : (
                  <g transform={`translate(${midX}, ${midY})`} className="cursor-pointer group/badge">
                    <circle r={isTouchDevice ? 18 : 13} fill="transparent" />
                    <circle
                      r="9.5"
                      fill={
                        isInspected
                          ? '#0284c7'
                          : assignedFlashing
                          ? '#064e3b'
                          : isWall
                          ? '#78350f'
                          : isGableVerge
                          ? '#312e81'
                          : isDefined
                          ? '#14532d'
                          : '#1e293b'
                      }
                      stroke={
                        isInspected
                          ? '#ffffff'
                          : assignedFlashing
                          ? '#10b981'
                          : isWall
                          ? '#f59e0b'
                          : isGableVerge
                          ? '#818cf8'
                          : isDefined
                          ? '#22c55e'
                          : '#94a3b8'
                      }
                      strokeWidth={isInspected ? '2.2' : '1.4'}
                      className="transition-transform group-hover/badge:scale-125"
                    />
                    <text
                      x="0"
                      y="3.3"
                      textAnchor="middle"
                      fill={assignedFlashing ? '#6ee7b7' : isWall ? '#fde68a' : '#ffffff'}
                      fontSize="9"
                      fontWeight="900"
                      fontFamily="monospace"
                      pointerEvents="none"
                    >
                      {edgeCode}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* INTERACTIVE RIDGE / HIP JUNCTION HANDLES (1-Click Toggle Hip <-> Gable End) */}
          {!readOnlyGeometry &&
            onToggleJunctionGable &&
            junctionNodes.map((node) => {
              const nx = toSvgX(node.point.x);
              const ny = toSvgY(node.point.y);
              const isGable = node.mode === 'gable';
              return (
                <g
                  key={node.id}
                  transform={`translate(${nx}, ${ny})`}
                  pointerEvents={isDrawingOrGeometryTool ? 'none' : undefined}
                  onClick={(ev) => {
                    if (isDrawingOrGeometryTool) return;
                    ev.stopPropagation();
                    onToggleJunctionGable(node.id);
                  }}
                  className={isDrawingOrGeometryTool ? 'pointer-events-none' : 'cursor-pointer group'}
                >
                  <circle r={isTouchDevice ? 22 : 15} fill="transparent" />
                  <circle
                    r="11"
                    fill="#090d16"
                    fillOpacity="0.88"
                    stroke={isGable ? '#34d399' : '#c084fc'}
                    strokeWidth="2"
                    className="transition-transform group-hover:scale-125"
                  />
                  {/* Gable/Hip icon glyph inside handle */}
                  <polygon
                    points="0,-5 5,0 0,5 -5,0"
                    fill={isGable ? '#34d399' : '#c084fc'}
                  />
                  <text
                    y="-15"
                    textAnchor="middle"
                    fill={isGable ? '#6ee7b7' : '#e9d5ff'}
                    stroke="#090d16"
                    strokeWidth="3.5"
                    style={{ paintOrder: 'stroke' }}
                    fontSize="9.5"
                    fontWeight="800"
                    className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  >
                    {isGable ? 'Click → Hip End' : 'Click → Gable End'}
                  </text>
                </g>
              );
            })}

          {/* ATTACH-TO-EDGE PICKER TARGETS WHEN DRAWING FROM WALL OR EAVE */}
          {!readOnlyGeometry &&
            activeTool === 'draw_roof' &&
            drawSubMode === 'attach_edge' &&
            !attachedEdge &&
            allDisplayEdges.map((edgeTarget) => {
              const x1 = toSvgX(edgeTarget.from.x);
              const y1 = toSvgY(edgeTarget.from.y);
              const x2 = toSvgX(edgeTarget.to.x);
              const y2 = toSvgY(edgeTarget.to.y);
              return (
                <g
                  key={`attach-target-${edgeTarget.id}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    handlePickAttachEdge(edgeTarget);
                  }}
                  className="cursor-pointer group"
                >
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={isTouchDevice ? '34' : '24'}
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={edgeTarget.type === 'wall' ? '#f59e0b' : '#34d399'}
                    strokeWidth="6"
                    strokeOpacity="0.45"
                    strokeLinecap="round"
                    className="group-hover:stroke-white group-hover:stroke-opacity-90"
                  />
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#ffffff"
                    strokeWidth="2"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                </g>
              );
            })}

          {/* ACTIVE HOST WALL REFERENCE LINE & INFINITE SUPPORTING SNAP GUIDE */}
          {!readOnlyGeometry &&
            activeTool === 'draw_roof' &&
            attachedEdge &&
            (() => {
              const dx = attachedEdge.to.x - attachedEdge.from.x;
              const dy = attachedEdge.to.y - attachedEdge.from.y;
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const ext = 60;
              const extA = { x: attachedEdge.from.x - ux * ext, y: attachedEdge.from.y - uy * ext };
              const extB = { x: attachedEdge.to.x + ux * ext, y: attachedEdge.to.y + uy * ext };
              const cursorOnHostLine =
                mousePos &&
                snapPointToSupportingLine(mousePos, attachedEdge.from, attachedEdge.to, 0.025).snapped;
              return (
                <g pointerEvents="none">
                  <line
                    x1={toSvgX(extA.x)}
                    y1={toSvgY(extA.y)}
                    x2={toSvgX(extB.x)}
                    y2={toSvgY(extB.y)}
                    stroke="#f59e0b"
                    strokeOpacity="0.42"
                    strokeWidth="1.5"
                    strokeDasharray="6 5"
                  />
                  <line
                    x1={toSvgX(attachedEdge.from.x)}
                    y1={toSvgY(attachedEdge.from.y)}
                    x2={toSvgX(attachedEdge.to.x)}
                    y2={toSvgY(attachedEdge.to.y)}
                    stroke="#f59e0b"
                    strokeOpacity="0.88"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  {cursorOnHostLine && mousePos && (
                    <circle
                      cx={toSvgX(mousePos.x)}
                      cy={toSvgY(mousePos.y)}
                      r="7"
                      fill="#f59e0b"
                      fillOpacity="0.3"
                      stroke="#fde68a"
                      strokeWidth="1.8"
                    />
                  )}
                </g>
              );
            })()}

          {/* OUTLINE CORNER VERTICES (Pointer drag targets in adjust_shape, multi-level corner snaps in add_line) */}
          {!readOnlyGeometry &&
            (activeTool === 'add_line' ? allDisplayOutlinePoints : outline.points).map((p, idx) => {
              const isVertexInteractive = activeTool === 'adjust_shape' || activeTool === 'add_line';
              const isSelCorner = activeTool === 'adjust_shape' && selectedVertexIdx === idx;
              return (
                <g
                  key={`pt-${idx}`}
                  pointerEvents={isVertexInteractive ? undefined : 'none'}
                  onPointerDown={(e) => handleVertexPointerDown(idx, e)}
                  onClick={(e) => handleVertexClick(idx, e)}
                  className={
                    activeTool === 'adjust_shape'
                      ? 'cursor-grab active:cursor-grabbing group'
                      : activeTool === 'add_line'
                      ? 'cursor-crosshair group'
                      : 'pointer-events-none'
                  }
                >
                  <circle
                    cx={toSvgX(p.x)}
                    cy={toSvgY(p.y)}
                    r={isTouchDevice ? 18 : 12}
                    fill="transparent"
                  />
                  {isSelCorner && (
                    <circle
                      cx={toSvgX(p.x)}
                      cy={toSvgY(p.y)}
                      r={isTouchDevice ? 15 : 12.5}
                      fill="none"
                      stroke="#fbbf24"
                      strokeWidth="2"
                      strokeDasharray="3 2"
                    />
                  )}
                  <circle
                    cx={toSvgX(p.x)}
                    cy={toSvgY(p.y)}
                    r={
                      activeTool === 'adjust_shape'
                        ? isTouchDevice
                          ? 10
                          : 8
                        : activeTool === 'add_line'
                        ? isTouchDevice
                          ? 7
                          : 6
                        : 5
                    }
                    fill={
                      isSelCorner
                        ? '#fbbf24'
                        : activeTool === 'adjust_shape'
                        ? '#f59e0b'
                        : activeTool === 'add_line'
                        ? '#c084fc'
                        : '#ffffff'
                    }
                    stroke={isSelCorner ? '#ffffff' : '#0f172a'}
                    strokeWidth="2.5"
                    className="transition-all group-hover:scale-125"
                  />
                  {isSelCorner && selectedCornerAngleDeg !== null && (
                    <g transform={`translate(${toSvgX(p.x)}, ${toSvgY(p.y) - 20})`} pointerEvents="none">
                      <rect
                        x="-26"
                        y="-9.5"
                        width="52"
                        height="19"
                        rx="6"
                        fill="#090d16"
                        stroke="#fbbf24"
                        strokeWidth="1.2"
                      />
                      <text
                        x="0"
                        y="3.2"
                        textAnchor="middle"
                        fill="#fde68a"
                        fontSize="9.5"
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {selectedCornerAngleDeg.toFixed(1)}°
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

          {/* 3-POINT ANGLE BISECTOR PREVIEW */}
          {activeTool === 'add_line' && bisectMode && bisectPts.length > 0 && (
            <g pointerEvents="none">
              {bisectPts.map((bp, bi) => (
                <circle
                  key={`bi-${bi}`}
                  cx={toSvgX(bp.x)}
                  cy={toSvgY(bp.y)}
                  r="6"
                  fill={bi === 1 ? '#f59e0b' : '#c084fc'}
                  stroke="#090d16"
                  strokeWidth="2"
                />
              ))}
              {bisectPts.length === 2 && mousePos && (() => {
                const previewEnd = computeAngleBisectorEndPoint(bisectPts[0], bisectPts[1], mousePos);
                return (
                  <line
                    x1={toSvgX(bisectPts[1].x)}
                    y1={toSvgY(bisectPts[1].y)}
                    x2={toSvgX(previewEnd.x)}
                    y2={toSvgY(previewEnd.y)}
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    strokeDasharray="6 3"
                  />
                );
              })()}
            </g>
          )}

          {/* FREEHAND DRAFTING REAL-TIME DISPLAY */}
          {draftPoints.length > 0 && (
            <g>
              <polyline
                points={draftPoints.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ')}
                fill="none"
                stroke="#22c55e"
                strokeWidth="3.5"
                strokeDasharray="4 3"
              />

              {draftPoints.map((p, i) => {
                if (i === 0) return null;
                const prev = draftPoints[i - 1];
                const mx = (toSvgX(prev.x) + toSvgX(p.x)) / 2;
                const my = (toSvgY(prev.y) + toSvgY(p.y)) / 2;
                const d = dist(prev, p).toFixed(2);
                return (
                  <g key={`draft-dim-${i}`} transform={`translate(${mx}, ${my})`}>
                    <rect x="-22" y="-9" width="44" height="18" rx="9" fill="#0f172a" stroke="#22c55e" strokeWidth="1" />
                    <text x="0" y="3.5" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold" fontFamily="monospace">
                      {d}m
                    </text>
                  </g>
                );
              })}

              {!isTouchDevice && mousePos && (
                <g pointerEvents="none">
                  {/* Live segment rubberband */}
                  <line
                    x1={toSvgX(draftPoints[draftPoints.length - 1].x)}
                    y1={toSvgY(draftPoints[draftPoints.length - 1].y)}
                    x2={toSvgX(mousePos.x)}
                    y2={toSvgY(mousePos.y)}
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                  />
                  {(() => {
                    const last = draftPoints[draftPoints.length - 1];
                    const liveDist = dist(last, mousePos).toFixed(2);
                    const angleRaw = (Math.atan2(mousePos.y - last.y, mousePos.x - last.x) * 180) / Math.PI;
                    const angleDisp = Math.abs(Math.round(angleRaw));
                    const lmx = (toSvgX(last.x) + toSvgX(mousePos.x)) / 2;
                    const lmy = (toSvgY(last.y) + toSvgY(mousePos.y)) / 2;
                    return (
                      <g transform={`translate(${lmx}, ${lmy - 14})`}>
                        <rect x="-38" y="-9.5" width="76" height="19" rx="9.5" fill="#0284c7" stroke="#bae6fd" strokeWidth="0.9" />
                        <text x="0" y="3.2" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold" fontFamily="monospace">
                          {liveDist}m · {angleDisp}°
                        </text>
                      </g>
                    );
                  })()}
                </g>
              )}

              {draftPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={toSvgX(p.x)}
                  cy={toSvgY(p.y)}
                  r={i === 0 ? 10 : 6}
                  fill={i === 0 ? '#10b981' : '#ffffff'}
                  stroke="#0f172a"
                  strokeWidth="2"
                />
              ))}

              {draftPoints.length >= 3 && (
                <g transform={`translate(${toSvgX(draftPoints[0].x)}, ${toSvgY(draftPoints[0].y)})`} pointerEvents="none">
                  <circle r="15" fill="none" stroke="#22c55e" strokeWidth="2" opacity="0.82" />
                  <circle r="20" fill="none" stroke="#22c55e" strokeWidth="1" strokeDasharray="3 2" opacity="0.5" />
                  <text y="-24" textAnchor="middle" fill="#6ee7b7" stroke="#070b14" strokeWidth="3" style={{ paintOrder: 'stroke' }} fontSize="9.5" fontWeight="bold">
                    Tap to close
                  </text>
                </g>
              )}
            </g>
          )}

          {/* ADD-LINE START TARGET & LIVE RUBBERBAND (Visible on both Touch & Desktop) */}
          {activeTool === 'add_line' && lineStartPt && (
            <g pointerEvents="none">
              <circle
                cx={toSvgX(lineStartPt.x)}
                cy={toSvgY(lineStartPt.y)}
                r={isTouchDevice ? 15 : 11}
                fill="#a855f7"
                fillOpacity="0.16"
                stroke="#c084fc"
                strokeWidth="1.6"
              />
              <circle
                cx={toSvgX(lineStartPt.x)}
                cy={toSvgY(lineStartPt.y)}
                r="5.5"
                fill="#c084fc"
                stroke="#090d16"
                strokeWidth="2"
              />
              <text
                x={toSvgX(lineStartPt.x)}
                y={toSvgY(lineStartPt.y) - (isTouchDevice ? 19 : 14)}
                textAnchor="middle"
                fill="#e9d5ff"
                stroke="#090d16"
                strokeWidth="3"
                style={{ paintOrder: 'stroke' }}
                fontSize="9.5"
                fontWeight="800"
                fontFamily="monospace"
              >
                Start
              </text>
              {typedSegmentPreview && activeTool === 'add_line' ? (
                <>
                  <line
                    x1={toSvgX(typedSegmentPreview.fromPt.x)}
                    y1={toSvgY(typedSegmentPreview.fromPt.y)}
                    x2={toSvgX(typedSegmentPreview.toPt.x)}
                    y2={toSvgY(typedSegmentPreview.toPt.y)}
                    stroke="#38bdf8"
                    strokeWidth="2.8"
                    strokeDasharray="5 3"
                  />
                  <circle
                    cx={toSvgX(typedSegmentPreview.toPt.x)}
                    cy={toSvgY(typedSegmentPreview.toPt.y)}
                    r="5"
                    fill="#38bdf8"
                    stroke="#090d16"
                    strokeWidth="1.8"
                  />
                  <g
                    transform={`translate(${(toSvgX(typedSegmentPreview.fromPt.x) + toSvgX(typedSegmentPreview.toPt.x)) / 2}, ${(toSvgY(typedSegmentPreview.fromPt.y) + toSvgY(typedSegmentPreview.toPt.y)) / 2 - 14})`}
                  >
                    <rect x="-32" y="-9.5" width="64" height="19" rx="9.5" fill="#0369a1" stroke="#bae6fd" strokeWidth="1" />
                    <text x="0" y="3.2" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold" fontFamily="monospace">
                      {typedSegmentPreview.lengthM.toFixed(2)}m ↵
                    </text>
                  </g>
                </>
              ) : (
                mousePos && (
                  <>
                    <line
                      x1={toSvgX(lineStartPt.x)}
                      y1={toSvgY(lineStartPt.y)}
                      x2={toSvgX(mousePos.x)}
                      y2={toSvgY(mousePos.y)}
                      stroke="#c084fc"
                      strokeWidth="2.2"
                      strokeDasharray="5 3"
                    />
                    {dist(lineStartPt, mousePos) >= 0.1 && (
                      <g
                        transform={`translate(${(toSvgX(lineStartPt.x) + toSvgX(mousePos.x)) / 2}, ${(toSvgY(lineStartPt.y) + toSvgY(mousePos.y)) / 2 - 14})`}
                      >
                        <rect x="-26" y="-9.5" width="52" height="19" rx="9.5" fill="#6b21a8" stroke="#e9d5ff" strokeWidth="0.9" />
                        <text x="0" y="3.2" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold" fontFamily="monospace">
                          {dist(lineStartPt, mousePos).toFixed(2)}m
                        </text>
                      </g>
                    )}
                  </>
                )
              )}
            </g>
          )}

          {/* TYPED LENGTH LIVE TARGET PREVIEW FOR DRAW ROOF */}
          {activeTool === 'draw_roof' && typedSegmentPreview && (
            <g pointerEvents="none">
              <line
                x1={toSvgX(typedSegmentPreview.fromPt.x)}
                y1={toSvgY(typedSegmentPreview.fromPt.y)}
                x2={toSvgX(typedSegmentPreview.toPt.x)}
                y2={toSvgY(typedSegmentPreview.toPt.y)}
                stroke="#38bdf8"
                strokeWidth="3"
                strokeDasharray="5 3"
              />
              <circle
                cx={toSvgX(typedSegmentPreview.toPt.x)}
                cy={toSvgY(typedSegmentPreview.toPt.y)}
                r="5.5"
                fill="#38bdf8"
                stroke="#090d16"
                strokeWidth="2"
              />
              <g
                transform={`translate(${(toSvgX(typedSegmentPreview.fromPt.x) + toSvgX(typedSegmentPreview.toPt.x)) / 2}, ${(toSvgY(typedSegmentPreview.fromPt.y) + toSvgY(typedSegmentPreview.toPt.y)) / 2 - 15})`}
              >
                <rect x="-34" y="-9.5" width="68" height="19" rx="9.5" fill="#0369a1" stroke="#bae6fd" strokeWidth="1" />
                <text x="0" y="3.2" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold" fontFamily="monospace">
                  {typedSegmentPreview.lengthM.toFixed(2)}m ↵
                </text>
              </g>
            </g>
          )}

          {/* FULL-VIEWPORT CAD DRAFTING CROSSHAIR (Desktop) */}
          {!isTouchDevice &&
            mousePos &&
            (activeTool === 'draw_roof' || activeTool === 'scale_plan' || activeTool === 'add_line') && (
              <g pointerEvents="none">
                <line
                  x1={toSvgX(mousePos.x)}
                  y1={0}
                  x2={toSvgX(mousePos.x)}
                  y2={svgHeight}
                  stroke={activeTool === 'scale_plan' ? '#fbbf24' : activeTool === 'add_line' ? '#c084fc' : '#38bdf8'}
                  strokeOpacity="0.24"
                  strokeWidth="0.9"
                  strokeDasharray="4 4"
                />
                <line
                  x1={0}
                  y1={toSvgY(mousePos.y)}
                  x2={svgWidth}
                  y2={toSvgY(mousePos.y)}
                  stroke={activeTool === 'scale_plan' ? '#fbbf24' : activeTool === 'add_line' ? '#c084fc' : '#38bdf8'}
                  strokeOpacity="0.24"
                  strokeWidth="0.9"
                  strokeDasharray="4 4"
                />
                {activeTool === 'add_line' && (
                  <circle
                    cx={toSvgX(mousePos.x)}
                    cy={toSvgY(mousePos.y)}
                    r="5.5"
                    fill="none"
                    stroke="#c084fc"
                    strokeWidth="1.6"
                  />
                )}
              </g>
            )}

          {/* 2-POINT ARCHITECTURAL PLAN SCALE CALIPER OVERLAY */}
          {activeTool === 'scale_plan' && scalePoints.length > 0 && (
            <g pointerEvents="none">
              {scalePoints.length === 1 && mousePos && (
                <line
                  x1={toSvgX(scalePoints[0].x)}
                  y1={toSvgY(scalePoints[0].y)}
                  x2={toSvgX(mousePos.x)}
                  y2={toSvgY(mousePos.y)}
                  stroke="#fbbf24"
                  strokeWidth="2.5"
                  strokeDasharray="6 4"
                />
              )}
              {scalePoints.length === 2 && (
                <line
                  x1={toSvgX(scalePoints[0].x)}
                  y1={toSvgY(scalePoints[0].y)}
                  x2={toSvgX(scalePoints[1].x)}
                  y2={toSvgY(scalePoints[1].y)}
                  stroke="#f59e0b"
                  strokeWidth="3"
                />
              )}
              {scalePoints.map((sp, i) => (
                <g key={`cal-pt-${i}`} transform={`translate(${toSvgX(sp.x)}, ${toSvgY(sp.y)})`}>
                  <circle r="14" fill="none" stroke="#f59e0b" strokeWidth="1.8" opacity="0.65" />
                  <circle r="6.5" fill="#f59e0b" stroke="#090d16" strokeWidth="2" />
                  <text
                    y="-12"
                    textAnchor="middle"
                    fill="#fde68a"
                    stroke="#090d16"
                    strokeWidth="3"
                    style={{ paintOrder: 'stroke' }}
                    fontSize="10"
                    fontWeight="900"
                    fontFamily="monospace"
                  >
                    P{i + 1}
                  </text>
                </g>
              ))}
            </g>
          )}
        </svg>

        {/* Live Graphic Scale Bar, Zoom & Coordinate Watermark (Desktop Only so Mobile Canvas stays Open) */}
        {!isMobile && (
          <div className="absolute bottom-3 left-3 bg-[#080d18]/92 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl text-xs text-slate-300 flex items-center gap-3 pointer-events-none shadow-lg">
            {/* Graphic Metric Scale Bar */}
            <div className="flex flex-col gap-0.5 pr-3 border-r border-slate-800">
              <div className="flex items-center justify-between text-[8.5px] font-mono text-slate-400 tabular-nums leading-none">
                <span>0</span>
                <span>{scaleBar.halfLabel}</span>
                <span className="text-sky-300 font-bold">{scaleBar.fullLabel}</span>
              </div>
              <div
                className="h-1.5 border-x border-b border-slate-400 flex overflow-hidden"
                style={{ width: `${Math.round(scaleBar.pixelWidth)}px` }}
              >
                <div className="w-1/2 h-full bg-sky-400/80" />
                <div className="w-1/2 h-full bg-slate-700/80" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 tabular-nums">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>
                Faces <strong className="text-white">{planes.length}</strong>/{outline.edges.length}
              </span>
            </div>
            {mousePos && (
              <span className="text-[10px] font-mono text-slate-300 border-l border-slate-800 pl-2.5 tabular-nums">
                X {mousePos.x.toFixed(2)}m · Y {mousePos.y.toFixed(2)}m
              </span>
            )}
          </div>
        )}

        {/* Roof Perimeter & Ridge/Hip/Valley Color Legend (Desktop only) */}
        {!isMobile && (
          <div className="absolute bottom-3 right-3 bg-[#080d18]/92 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl text-[11px] text-slate-300 flex items-center gap-3 shadow-lg pointer-events-none">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded-sm bg-emerald-400" />
              <span className="text-slate-300 font-medium">Eave</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-b-2 border-dashed border-indigo-400" />
              <span className="text-slate-300 font-medium">Gable</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded-sm bg-purple-400" />
              <span className="text-slate-300 font-medium">Ridge</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded-sm bg-sky-400" />
              <span className="text-slate-300 font-medium">Hip</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-b-2 border-dashed border-amber-400" />
              <span className="text-slate-300 font-medium">Valley</span>
            </div>
          </div>
        )}

        {/* 5. CLICK-TO-INSPECT LINE INFO CARD (Shows Length, Wall Z, Flashing & Quick Edits) */}
        {inspectedLine &&
          !editingMeasurement &&
          (() => {
            const isEdge = inspectedLine.kind === 'edge';
            const edgeObj = isEdge
              ? outline.edges.find((e) => e.id === inspectedLine.id) ||
                levels?.flatMap((l) => l.outline.edges).find((e) => e.id === inspectedLine.id)
              : undefined;
            const skelObj = !isEdge ? displaySkeleton.find((s) => s.id === inspectedLine.id) : undefined;
            if (!edgeObj && !skelObj) return null;

            const lineId = edgeObj ? edgeObj.id : skelObj!.id;
            const fromPt = edgeObj ? edgeObj.from : skelObj!.from;
            const toPt = edgeObj ? edgeObj.to : skelObj!.to;
            const planLenM = +dist(fromPt, toPt).toFixed(2);
            const assignable = assignableByLineId.get(lineId);
            const assignment = assignmentByLineId.get(lineId);
            const matchedPlane = edgeObj ? planes.find((p) => p.eaveEdgeId === edgeObj.id) : undefined;
            const currentEdgeZ =
              edgeObj?.eaveHeightM ??
              matchedPlane?.eaveHeightM ??
              levels?.find((l) => l.id === (edgeObj?.levelId || outline.levelId))?.eaveHeightM ??
              2.7;

            const isVerge = edgeObj?.type === 'verge';
            const isWall = edgeObj?.type === 'wall';
            const isUnclassified = edgeObj?.type === 'unclassified';
            const badgeCode = edgeObj
              ? isWall
                ? 'W'
                : isVerge
                ? 'B'
                : edgeObj.type === 'ridge'
                ? 'R'
                : edgeObj.type === 'hip'
                ? 'H'
                : edgeObj.type === 'valley'
                ? 'V'
                : isUnclassified
                ? '?'
                : 'E'
              : skelObj!.suggestedType === 'ridge'
              ? 'R'
              : skelObj!.suggestedType === 'valley'
              ? 'V'
              : 'H';
            const badgeTitle =
              assignable?.label ||
              (edgeObj
                ? isWall
                  ? 'Abutment / Riser Wall'
                  : isVerge
                  ? 'Gable / Barge'
                  : edgeObj.type === 'ridge'
                  ? 'Perimeter Ridge Edge'
                  : edgeObj.type === 'hip'
                  ? 'Perimeter Hip Edge'
                  : edgeObj.type === 'valley'
                  ? 'Perimeter Valley Edge'
                  : isUnclassified
                  ? 'Unclassified Boundary Edge'
                  : 'Eave Wall Edge'
                : skelObj!.suggestedType === 'ridge'
                ? 'Ridge Line'
                : skelObj!.suggestedType === 'valley'
                ? 'Valley'
                : 'Hip Line');
            const badgeColor = edgeObj
              ? isWall
                ? '#f59e0b'
                : isVerge
                ? '#818cf8'
                : edgeObj.type === 'ridge'
                ? '#c084fc'
                : edgeObj.type === 'hip'
                ? '#38bdf8'
                : edgeObj.type === 'valley'
                ? '#fbbf24'
                : isUnclassified
                ? '#94a3b8'
                : '#22c55e'
              : skelObj!.suggestedType === 'ridge'
              ? '#c084fc'
              : skelObj!.suggestedType === 'valley'
              ? '#fbbf24'
              : '#38bdf8';

            const midSvg = {
              x: (toSvgX(fromPt.x) + toSvgX(toPt.x)) / 2,
              y: (toSvgY(fromPt.y) + toSvgY(toPt.y)) / 2
            };

            return (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className={`absolute left-1/2 -translate-x-1/2 z-30 w-[calc(100%-20px)] max-w-sm bg-[#0b101d]/96 backdrop-blur-md border border-slate-700 text-white rounded-2xl p-3 shadow-2xl space-y-2 animate-in fade-in slide-in-from-bottom-2 ${
                  isMobile ? 'bottom-2.5' : 'bottom-4'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center font-mono font-black text-xs text-white shrink-0 border-2 bg-[#090d16]"
                      style={{ borderColor: assignment ? '#10b981' : badgeColor }}
                    >
                      {badgeCode}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-white truncate">{badgeTitle}</div>
                      <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                        Plan: <strong className="text-white">{planLenM}m</strong>
                        {edgeObj && (
                          <span>
                            {' '}
                            · Z: <strong className="text-amber-400">{currentEdgeZ.toFixed(1)}m</strong>
                          </span>
                        )}
                        {assignable && assignable.trueSlopeLengthM !== planLenM && (
                          <span> · True: <strong className="text-sky-300">{assignable.trueSlopeLengthM}m</strong></span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectedLine(null)}
                    className="w-8 h-8 rounded-xl bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer shrink-0"
                    aria-label="Close Line Info"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Compact Wall Height (Z) Editor for Perimeter Eaves & Abutment Walls */}
                {edgeObj && !readOnlyGeometry && onUpdateEdgeEaveHeight && (
                  <div className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-amber-500/25 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-amber-300 font-bold shrink-0">Eave Z:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onUpdateEdgeEaveHeight(edgeObj.id, Math.max(0.5, +(currentEdgeZ - 0.5).toFixed(2)))}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono font-bold text-[10px] cursor-pointer"
                      >
                        -0.5
                      </button>
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="15"
                        value={+currentEdgeZ.toFixed(2)}
                        onChange={(ev) => {
                          const v = parseFloat(ev.target.value);
                          if (Number.isFinite(v) && v >= 0.5) {
                            onUpdateEdgeEaveHeight(edgeObj.id, v);
                          }
                        }}
                        className="w-14 bg-slate-950 border border-amber-500/40 rounded-lg px-1.5 py-1 text-center font-mono font-bold text-white text-[11px] tabular-nums focus:outline-hidden focus:border-amber-400"
                      />
                      <button
                        type="button"
                        onClick={() => onUpdateEdgeEaveHeight(edgeObj.id, Math.min(15, +(currentEdgeZ + 0.5).toFixed(2)))}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono font-bold text-[10px] cursor-pointer"
                      >
                        +0.5
                      </button>
                    </div>
                  </div>
                )}

                {/* Independent Wall Below Roof + Eave Width Setback (non-destructive) */}
                {edgeObj && !readOnlyGeometry && onUpdateEdgeWall && (
                  <div className="px-2.5 py-2 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-300 font-bold">Wall Below Roof</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateEdgeWall(edgeObj.id, { hasWall: !isEdgeWallEnabled(edgeObj) })
                        }
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all ${
                          isEdgeWallEnabled(edgeObj)
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                        }`}
                      >
                        {isEdgeWallEnabled(edgeObj) ? 'Wall ON' : 'Wall OFF'}
                      </button>
                    </div>
                    {isEdgeWallEnabled(edgeObj) && (
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] text-slate-400 font-bold shrink-0">Eave Width:</span>
                        <div className="flex items-center gap-1">
                          {[0, 0.45, 0.6].map((sb) => {
                            const activeSb = Math.abs(getDefaultEdgeSetbackM(edgeObj) - sb) < 0.02;
                            return (
                              <button
                                key={sb}
                                type="button"
                                onClick={() => onUpdateEdgeWall(edgeObj.id, { eaveSetbackM: sb })}
                                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold cursor-pointer ${
                                  activeSb
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                }`}
                              >
                                {sb === 0 ? '0m' : `${sb}m`}
                              </button>
                            );
                          })}
                          <input
                            type="number"
                            step="0.05"
                            min="0"
                            max="3"
                            value={getDefaultEdgeSetbackM(edgeObj)}
                            onChange={(ev) => {
                              const v = parseFloat(ev.target.value);
                              if (Number.isFinite(v) && v >= 0) {
                                onUpdateEdgeWall(edgeObj.id, { eaveSetbackM: Math.min(3, v) });
                              }
                            }}
                            className="w-12 bg-slate-950 border border-slate-700 rounded-md px-1 py-0.5 text-center font-mono font-bold text-white text-[10px] tabular-nums focus:outline-hidden focus:border-sky-400"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] flex items-center justify-between gap-2">
                  <span className="truncate text-slate-300">
                    {assignment ? (
                      <>
                        <span className="text-emerald-400 font-bold">✓ </span>
                        <span className="font-bold text-white">{assignment.profileName}</span>
                        <span className="font-mono text-slate-400"> ({assignment.quantity}×{assignment.pieceLengthLm}m)</span>
                      </>
                    ) : (
                      <span className="text-slate-400">Flashing: Not assigned</span>
                    )}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {!readOnlyGeometry && (
                    <button
                      type="button"
                      onClick={(ev) => {
                        setInspectedLine(null);
                        handleOpenMeasurementEditor(
                          edgeObj ? 'edge' : 'roof_line',
                          lineId,
                          planLenM,
                          badgeTitle,
                          midSvg,
                          ev
                        );
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-blue-600/25 hover:bg-blue-600/40 border border-blue-500/50 text-sky-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Ruler className="w-3.5 h-3.5" />
                      <span>Edit Length</span>
                    </button>
                  )}

                  {!readOnlyGeometry && onSelectLineForFlashing && (
                    <button
                      type="button"
                      onClick={() => {
                        setInspectedLine(null);
                        onSelectLineForFlashing(lineId);
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <PenTool className="w-3.5 h-3.5" />
                      <span>{assignment ? 'Edit Flashing' : 'Flashing'}</span>
                    </button>
                  )}

                  {edgeObj && !readOnlyGeometry && (onSetEdgeMode || onToggleEdgeGable) && (
                    <div className="flex items-center bg-slate-900 rounded-xl p-0.5 border border-slate-700/80">
                      <button
                        type="button"
                        onClick={() =>
                          onSetEdgeMode
                            ? onSetEdgeMode(edgeObj.id, 'hipped')
                            : onToggleEdgeGable?.(edgeObj.id, 'hipped')
                        }
                        className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                          !isVerge && !isWall
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Eave
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onSetEdgeMode
                            ? onSetEdgeMode(edgeObj.id, 'gable')
                            : onToggleEdgeGable?.(edgeObj.id, 'gable')
                        }
                        className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                          isVerge ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Gable
                      </button>
                    </div>
                  )}

                  {edgeObj && !readOnlyGeometry && (
                    <button
                      type="button"
                      onClick={() => {
                        setInspectedLine(null);
                        onSelectEdgeToDefine(edgeObj);
                      }}
                      className="min-h-[38px] px-3 rounded-xl bg-sky-600/25 hover:bg-sky-600/40 border border-sky-500/40 text-sky-200 text-xs font-extrabold cursor-pointer"
                    >
                      Classify / Setup Plane
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

        {/* 5B. CLICK-TO-INSPECT ROOF AREA QUICK CARD (Plan View Face Click -> Actual Sheet Length + Details) */}
        {selectedPlaneObj &&
          !inspectedLine &&
          !editingMeasurement &&
          (isMobile || (!readOnlyGeometry && Boolean(onUpdatePlaneOrderedSheetLength))) && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-20px)] max-w-md bg-[#0b101d]/96 backdrop-blur-md border border-slate-700 text-white rounded-2xl p-3 shadow-2xl space-y-2.5 animate-in fade-in slide-in-from-bottom-2"
          >
            {(() => {
              const isStart =
                selectedPlaneObj.id === (startPlaneId || layout?.startPlaneId) ||
                layout?.startPlaneId === `${selectedPlaneObj.id}__lower` ||
                selectedPlaneObj.isStartEdge;
              const modeledMm = Math.round((selectedPlaneObj.slopeLength || 0) * 1000);
              const orderedMm = selectedPlaneObj.orderedSheetLengthM
                ? Math.round(selectedPlaneObj.orderedSheetLengthM * 1000)
                : null;
              const isOverridden = orderedMm !== null && orderedMm !== modeledMm;
              return (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs text-white shrink-0 border border-white/25"
                        style={{ backgroundColor: selectedPlaneObj.color || '#2563eb' }}
                      >
                        {selectedPlaneObj.code}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white truncate flex items-center gap-1.5">
                          <span>
                            Area {selectedPlaneObj.code} · {selectedPlaneObj.name}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                          {selectedPlaneObj.pitchDeg}° · Z:{(selectedPlaneObj.eaveHeightM ?? 2.7).toFixed(1)}m ·{' '}
                          {selectedPlaneObj.area ? `${selectedPlaneObj.area.toFixed(1)}m²` : 'Area'} · Plan run{' '}
                          {modeledMm}mm
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectPlane(null)}
                      className="w-8 h-8 rounded-xl bg-slate-900 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer shrink-0"
                      aria-label="Close Area Info"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {!readOnlyGeometry && onUpdatePlaneOrderedSheetLength && (
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-[10px]">
                        <span className="font-extrabold uppercase tracking-wider text-sky-300">
                          Actual Sheet Length to Order
                        </span>
                        {isOverridden ? (
                          <span className="font-mono font-bold text-emerald-300 tabular-nums">
                            Order: {orderedMm}mm (Plan {modeledMm}mm)
                          </span>
                        ) : (
                          <span className="font-mono text-slate-400 tabular-nums">
                            Modeled: {modeledMm}mm
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            inputMode="numeric"
                            step="5"
                            min="300"
                            max="30000"
                            value={faceSheetDraftMm}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) => setFaceSheetDraftMm(e.target.value)}
                            onBlur={commitFaceSheetDraft}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitFaceSheetDraft();
                                (e.currentTarget as HTMLInputElement).blur();
                              } else if (e.key === 'Escape') {
                                const curM =
                                  selectedPlaneObj.orderedSheetLengthM ??
                                  selectedPlaneObj.slopeLength ??
                                  0;
                                setFaceSheetDraftMm(curM > 0 ? String(Math.round(curM * 1000)) : '');
                              }
                            }}
                            placeholder={String(modeledMm || 5450)}
                            aria-label="Actual Sheet Length to Order in mm"
                            className="w-full min-h-[38px] bg-slate-900 border border-sky-500/40 rounded-xl pl-3 pr-10 py-1.5 text-sm font-mono font-black text-white tabular-nums focus:outline-hidden focus:border-sky-400"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono font-bold text-slate-400 pointer-events-none">
                            mm
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={commitFaceSheetDraft}
                          className="min-h-[38px] px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
                          title="Apply Actual Sheet Length to BOM"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Set</span>
                        </button>
                        {isOverridden && (
                          <button
                            type="button"
                            onClick={() => onUpdatePlaneOrderedSheetLength(selectedPlaneObj.id, undefined)}
                            className="min-h-[38px] px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold cursor-pointer shrink-0"
                            title={`Reset to modeled ${modeledMm}mm`}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        Updates BOM &amp; cut lengths only — roof plan geometry stays unchanged.
                      </p>
                    </div>
                  )}

                  {(isMobile || (!readOnlyGeometry && onSetStartPlane && !isStart)) && (
                    <div className="flex items-center gap-1.5">
                      {isMobile && onOpenInspector && (
                        <button
                          type="button"
                          onClick={onOpenInspector}
                          className="flex-1 min-h-[38px] px-3 rounded-xl bg-sky-600/25 hover:bg-sky-600/40 border border-sky-500/40 text-sky-200 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          <span>Pitch &amp; Lay Details</span>
                        </button>
                      )}

                      {!readOnlyGeometry && onSetStartPlane && !isStart && (
                        <button
                          type="button"
                          onClick={() => onSetStartPlane(selectedPlaneObj.id)}
                          className="min-h-[38px] px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                        >
                          <Star className="w-3.5 h-3.5" />
                          <span>Make Start Face</span>
                        </button>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* 6. SMALL ANCHORED / CENTERED NUMERICAL INPUT OVERLAY (INSTANT GEOMETRY UPDATE) */}
        {editingMeasurement && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={
              isMobile
                ? undefined
                : {
                    left: `${editingMeasurement.leftPx}px`,
                    top: `${Math.max(150, editingMeasurement.topPx)}px`,
                    transform: 'translate(-50%, -100%) translateY(-12px)'
                  }
            }
            className={`absolute z-40 w-60 bg-[#0b101d]/96 backdrop-blur-md border border-blue-500/70 text-white rounded-2xl p-3 shadow-2xl space-y-2.5 animate-in fade-in zoom-in-95 ${
              isMobile ? 'bottom-2.5 left-1/2 -translate-x-1/2' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-extrabold text-[11px] text-sky-300 uppercase tracking-wider truncate">
                  {editingMeasurement.type === 'edge' ? 'Edge Length' : 'Roof Line Length'}
                </h4>
                <p className="text-[10px] text-slate-400 truncate">{editingMeasurement.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMeasurement(null)}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer shrink-0"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.05"
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  value={measurementInput}
                  onChange={(e) => {
                    const nextRaw = e.target.value;
                    setMeasurementInput(nextRaw);
                    applyMeasurementImmediate(nextRaw, editingMeasurement);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setEditingMeasurement(null);
                    } else if (e.key === 'Escape') {
                      e.stopPropagation();
                      if (editingMeasurement.type === 'edge') {
                        onUpdateOutline(editingMeasurement.baseOutline);
                      } else {
                        onUpdateSkeleton(editingMeasurement.baseSkeleton);
                      }
                      setEditingMeasurement(null);
                    }
                  }}
                  placeholder="6.2 or 6200"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-2.5 pr-8 py-1.5 text-sm font-mono font-bold text-white tabular-nums focus:outline-hidden focus:border-blue-500"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 font-bold pointer-events-none">
                  {parseFloat(measurementInput) > 40 ? 'mm' : 'm'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingMeasurement(null)}
                className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-md cursor-pointer shrink-0"
                title="Done (Enter)"
              >
                <Check className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1">
              {[
                { label: '-0.1', val: -0.1 },
                { label: '+0.1', val: 0.1 },
                { label: '-0.5', val: -0.5 },
                { label: '+0.5', val: 0.5 }
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    const parsed = parseFloat(measurementInput);
                    const curM =
                      Number.isFinite(parsed) && parsed > 0
                        ? parsed > 40
                          ? parsed / 1000
                          : parsed
                        : editingMeasurement.currentLengthM;
                    const next = Math.max(0.2, +(curM + chip.val).toFixed(2));
                    const nextStr = next.toString();
                    setMeasurementInput(nextStr);
                    applyMeasurementImmediate(nextStr, editingMeasurement);
                  }}
                  className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px] font-mono tabular-nums cursor-pointer"
                >
                  {chip.label}m
                </button>
              ))}
            </div>

            {editingMeasurement.type === 'edge' &&
              onToggleEdgeGable &&
              (() => {
                const targetEdge = outline.edges.find((e) => e.id === editingMeasurement.id);
                if (!targetEdge) return null;
                const isEdgeGable = targetEdge.type === 'verge';
                return (
                  <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        onToggleEdgeGable(targetEdge.id, 'hipped');
                        setEditingMeasurement(null);
                      }}
                      className={`py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                        !isEdgeGable
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Hipped
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onToggleEdgeGable(targetEdge.id, 'gable');
                        setEditingMeasurement(null);
                      }}
                      className={`py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                        isEdgeGable
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Gable
                    </button>
                  </div>
                );
              })()}

            {onSelectLineForFlashing && (
              <button
                type="button"
                onClick={() => {
                  const targetId = editingMeasurement.id;
                  setEditingMeasurement(null);
                  onSelectLineForFlashing(targetId);
                }}
                className="w-full py-1.5 px-2.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 text-[10px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <PenTool className="w-3 h-3" />
                <span>Assign Flashing</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* First-Line Freehand Calibration Popup (Required when drawing freehand unscaled) */}
      {draftPoints.length >= 2 && (
        <FirstLineScaleModal
          isOpen={isFirstLineModalOpen}
          p0={draftPoints[0]}
          p1={draftPoints[1]}
          onUndoSecondPoint={handleUndoFirstLineSecondPoint}
          onConfirmLengthM={handleConfirmFirstLineLengthM}
        />
      )}

      {/* 2-Point Architectural Plan / Outline Calibration Popup */}
      <TwoPointScaleModal
        isOpen={isTwoPointScaleModalOpen && scalePoints.length >= 2}
        mode={planUnderlay ? 'plan' : 'outline'}
        planName={planUnderlay?.name}
        currentMeasuredSpanM={scalePoints.length >= 2 ? dist(scalePoints[0], scalePoints[1]) : undefined}
        onRepickPoints={() => {
          setIsTwoPointScaleModalOpen(false);
          setScalePoints([]);
        }}
        onCancel={() => {
          setIsTwoPointScaleModalOpen(false);
          setScalePoints([]);
          setLockedDraftBounds(null);
          setActiveTool(outline.points.length === 0 ? 'draw_roof' : 'set_pitch');
        }}
        onConfirmKnownDistanceM={handleConfirmTwoPointScaleM}
      />

      {/* Architectural Plan Sheet Upload & Project Picker */}
      <LoadArchitecturalPlanModal
        isOpen={isPlanModalOpen}
        currentUnderlay={planUnderlay}
        projectPlans={projectPlans}
        onClose={() => setIsPlanModalOpen(false)}
        onLoadNewPlan={(underlay, startCal) => {
          onUpdatePlanUnderlay?.(underlay);
          if (startCal) {
            setDraftPoints([]);
            setScalePoints([]);
            setLockedDraftBounds(null);
            setDraftScaleReady(false);
            setActiveTool('scale_plan');
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }
        }}
        onUpdateUnderlaySettings={(updates) => {
          if (planUnderlay && onUpdatePlanUnderlay) {
            onUpdatePlanUnderlay({ ...planUnderlay, ...updates });
          }
        }}
        onStartTwoPointScale={() => {
          setActiveTool('scale_plan');
          setDraftPoints([]);
          setScalePoints([]);
          setLockedDraftBounds({ ...bounds });
        }}
        onRemovePlan={() => {
          onUpdatePlanUnderlay?.(null);
          setScalePoints([]);
          setLockedDraftBounds(null);
          if (activeTool === 'scale_plan') {
            setActiveTool(outline.points.length === 0 ? 'draw_roof' : 'set_pitch');
          }
        }}
      />
    </div>
  );
};
