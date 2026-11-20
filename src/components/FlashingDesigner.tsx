import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Project,
  FlashingProfile,
  FlashingSegment,
  PaintSide
} from '../types/crm';
import {
  X,
  Plus,
  Trash2,
  Undo2,
  Check,
  ChevronLeft,
  BookOpen,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Sliders,
  ChevronRight,
  FlipHorizontal,
  Compass,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import {
  ARCHITECTURAL_FLASHING_PRESETS,
  calculateDevelopedBlankWidth,
  classifyGirthTier,
  calculateFlashingEngineering
} from '../utils/sheetMetalGeometry';
import {
  Point2D,
  computeLegDimensions,
  computeBendAngleAnnotations,
  calculateProfileBounds,
  fitProfileToView,
  fitSegmentToView,
  dist,
  normalize
} from '../utils/flashingDrawingEngine';
import { useDeviceDetection } from '../hooks/useDeviceDetection';

interface Props {
  project: Project;
  activeMemberName?: string;
  onUpdateProject: (project: Project) => void;
  onClose: () => void;
  initialProfileId?: string | null;
  onSaveToLibrary?: (profile: FlashingProfile) => 'saved' | 'duplicate' | 'storage-error';
  assignmentContext?: {
    lineLabel: string;
    flashingKindLabel: string;
    trueSlopeLengthM: number;
    defaultCategory?: string;
    defaultName?: string;
  };
  onAssignProfile?: (profile: FlashingProfile) => void;
}

type Mode = 'draw' | 'edit';
type ViewMode = 'profile' | '3d';

const SEGMENT_KINDS: { value: FlashingSegment['kind']; label: string; defaultMm: number }[] = [
  { value: 'leg', label: 'Standard Leg', defaultMm: 100 },
  { value: 'open_hem', label: 'Open Hem (Cleat/Hook)', defaultMm: 12 },
  { value: 'closed_hem', label: 'Closed Hem', defaultMm: 12 },
  { value: 'crush_fold', label: 'Crush Fold / Safety', defaultMm: 6 },
  { value: 'drip', label: 'Drip Edge / Kick', defaultMm: 20 },
  { value: 'return', label: 'Return Upstand', defaultMm: 15 },
  { value: 'safety_fold', label: 'Safety Edge', defaultMm: 15 }
];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function angleBetween(a: Point2D, b: Point2D, c: Point2D): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const cross = v1.x * v2.y - v1.y * v2.x;
  let ang = (Math.atan2(Math.abs(cross), dot) * 180) / Math.PI;
  return Math.round(Math.abs(ang));
}

function pointsToSegments(points: Point2D[], pxPerMm: number = 1.0): FlashingSegment[] {
  if (points.length < 2) return [];
  const segs: FlashingSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const lengthMm = Math.max(1, Math.round(dist(points[i], points[i + 1]) / pxPerMm));
    let angleDeg = 90;
    let turnDirection: -1 | 1 = 1;

    if (i < points.length - 2) {
      const a = points[i];
      const b = points[i + 1];
      const c = points[i + 2];
      angleDeg = angleBetween(a, b, c);
      const headingIn = Math.atan2(-(b.y - a.y), b.x - a.x);
      const headingOut = Math.atan2(-(c.y - b.y), c.x - b.x);
      let delta = ((headingOut - headingIn) * 180) / Math.PI;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      turnDirection = delta < 0 ? -1 : 1;
    }

    segs.push({
      id: uid('seg'),
      lengthMm,
      angleDeg,
      turnDirection,
      kind: 'leg'
    });
  }
  return segs;
}

function segmentsToPoints(
  segments: FlashingSegment[],
  origin: Point2D = { x: 50, y: 150 },
  pxPerMm: number = 1.0,
  startHeadingDeg: number = 0
): Point2D[] {
  const pts: Point2D[] = [{ ...origin }];
  let x = origin.x;
  let y = origin.y;
  let heading = startHeadingDeg;

  segments.forEach((seg, i) => {
    const len = Math.max(1, seg.lengthMm) * pxPerMm;
    const rad = (heading * Math.PI) / 180;
    x = x + Math.cos(rad) * len;
    y = y - Math.sin(rad) * len;
    pts.push({ x, y });

    if (i < segments.length - 1) {
      const interior = seg.angleDeg !== undefined ? seg.angleDeg : 90;
      const turn = 180 - interior;
      heading = heading + turn * (seg.turnDirection === -1 ? -1 : 1);
    }
  });

  return pts;
}

function pointsToGeometryMm(points: Point2D[], pxPerMm: number = 1.0): { x: number; y: number }[] {
  if (!points.length) return [];
  const origin = points[0];
  return points.map((p) => ({
    x: (p.x - origin.x) / pxPerMm,
    y: -(p.y - origin.y) / pxPerMm
  }));
}

function geometryMmToPoints(
  geometry: { x: number; y: number }[],
  origin: Point2D = { x: 50, y: 150 },
  pxPerMm: number = 1.0
): Point2D[] {
  return geometry.map((p) => ({
    x: origin.x + p.x * pxPerMm,
    y: origin.y - p.y * pxPerMm
  }));
}

export const FlashingDesigner: React.FC<Props> = ({
  project,
  activeMemberName = 'Lead Detailer',
  onUpdateProject,
  onClose,
  initialProfileId = null,
  onSaveToLibrary,
  assignmentContext,
  onAssignProfile
}) => {
  const anyProj = project as Project & { flashingProfiles?: FlashingProfile[] };
  const profiles = anyProj.flashingProfiles || [];

  const [selectedId, setSelectedId] = useState<string | null>(initialProfileId);
  const selected = profiles.find((p) => p.id === selectedId) || null;

  const [mode, setMode] = useState<Mode>(initialProfileId ? 'edit' : 'draw');
  const [viewMode, setViewMode] = useState<ViewMode>('profile');
  const [profileName, setProfileName] = useState(
    selected?.name || assignmentContext?.defaultName || ''
  );
  const [points, setPoints] = useState<Point2D[]>([]);
  const [cursor, setCursor] = useState<Point2D | null>(null);

  // Active selection
  const [selectedSegIndex, setSelectedSegIndex] = useState<number | null>(null);
  const [selectedBendIndex, setSelectedBendIndex] = useState<number | null>(null);
  const [inlineLengthOverlay, setInlineLengthOverlay] = useState<{
    segIndex: number;
    value: string;
    leftPx: number;
    topPx: number;
    basePoints: Point2D[];
    baseSegments: FlashingSegment[];
  } | null>(null);

  const { isMobile } = useDeviceDetection();

  // Inspector panel visibility (Open docked on Desktop, collapsed Bottom-Sheet on Mobile)
  const [showInspector, setShowInspector] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  useEffect(() => {
    setShowInspector(!isMobile);
  }, [isMobile]);
  const [showPresetsModal, setShowPresetsModal] = useState(false);
  const [showSavedSheet, setShowSavedSheet] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Drawing constraints
  const [snapAngles, setSnapAngles] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [paintSide, setPaintSide] = useState<PaintSide>(
    selected?.paintSide === 'inside' ? 'inside' : 'outside'
  );

  // Viewport & Zoom (Variobend separation of model vs screen)
  const [viewBox, setViewBox] = useState({ x: -50, y: -50, w: 500, h: 400 });
  const [zoomPercent, setZoomPercent] = useState(100);

  // 3D View rotation & zoom
  const [rotation, setRotation] = useState({ yaw: -0.55, pitch: 0.45 });
  const [zoom3d, setZoom3d] = useState(1);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Interaction pointers & pinch
  const activePointers = useRef(new Map<number, { x: number; y: number }>());
  const gestureStart = useRef<{
    distance: number;
    midpoint: Point2D;
    viewBox: { x: number; y: number; w: number; h: number };
  } | null>(null);
  const draggedVertex = useRef<number | null>(null);
  const isPanning = useRef(false);
  const panStart = useRef<{ x: number; y: number; viewBoxX: number; viewBoxY: number } | null>(null);
  const pendingDrawTap = useRef<{ pointerId: number; point: Point2D } | null>(null);

  // 3D Model rotation & pinch zoom interaction refs
  const rotateStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const rotatePointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart3d = useRef<{ distance: number; zoom: number } | null>(null);

  const toast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2800);
  };

  const persistProfiles = (next: FlashingProfile[]) => {
    onUpdateProject({ ...project, flashingProfiles: next } as Project);
  };

  const [svgClientWidth, setSvgClientWidth] = useState<number>(600);
  useEffect(() => {
    const el = svgRef.current || containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = svgRef.current?.clientWidth || containerRef.current?.clientWidth || 600;
      if (w > 0) setSvgClientWidth(w);
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [viewMode, showInspector]);

  // Model-to-screen scale factor (model units per screen pixel, stays screen-constant across resize & zoom)
  const modelUnitsPerScreenPixel = useMemo(() => {
    return viewBox.w / Math.max(1, svgClientWidth);
  }, [viewBox.w, svgClientWidth]);

  // Convert client viewport coordinates to SVG model coordinates
  const clientToSvg = useCallback(
    (clientX: number, clientY: number): Point2D | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const sp = pt.matrixTransform(ctm.inverse());
      return { x: sp.x, y: sp.y };
    },
    []
  );

  // Adaptive technical grid step in model coordinates
  const gridStep = useMemo(() => {
    const targetMm = modelUnitsPerScreenPixel * 28;
    const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, targetMm))));
    const normalized = targetMm / magnitude;
    const niceMm = (normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10) * magnitude;
    return Math.max(5, niceMm);
  }, [modelUnitsPerScreenPixel]);

  const snapPoint = (p: Point2D): Point2D => {
    if (!snapToGrid) return p;
    return {
      x: Math.round(p.x / gridStep) * gridStep,
      y: Math.round(p.y / gridStep) * gridStep
    };
  };

  // Load selected profile into model points
  useEffect(() => {
    if (!selected) {
      if (profiles.length > 0 && !selectedId) {
        setSelectedId(profiles[0].id);
      }
      return;
    }
    setProfileName(selected.name);
    setPaintSide(selected.paintSide === 'inside' ? 'inside' : 'outside');
    setSelectedSegIndex(0);
    setSelectedBendIndex(null);

    const origin = { x: 50, y: 150 };
    const pts = selected.geometryPointsMm?.length === selected.segments.length + 1
      ? geometryMmToPoints(selected.geometryPointsMm, origin, 1.0)
      : segmentsToPoints(selected.segments, origin, 1.0, selected.startHeadingDeg ?? 0);
    setPoints(pts);

    // Auto-fit profile to canvas on selection
    if (pts.length >= 2) {
      setTimeout(() => {
        handleFitToProfile(pts);
      }, 50);
    }
  }, [selectedId]);

  // Fit Entire Profile to Canvas (Variobend Core UX)
  const handleFitToProfile = (pts: Point2D[] = points) => {
    if (pts.length < 2 || !svgRef.current) return;
    const clientW = svgRef.current.clientWidth || window.innerWidth;
    const clientH = svgRef.current.clientHeight || window.innerHeight;
    const fit = fitProfileToView(pts, clientW, clientH, 0.24);
    setViewBox({ x: fit.x, y: fit.y, w: fit.w, h: fit.h });
    setZoomPercent(fit.zoomPercent);
  };

  // Fit Selected Segment or Bend
  const handleFitSelected = () => {
    if (selectedSegIndex === null || points.length < 2 || !svgRef.current) {
      handleFitToProfile();
      return;
    }
    const p1 = points[selectedSegIndex];
    const p2 = points[selectedSegIndex + 1];
    if (!p1 || !p2) return;
    const clientW = svgRef.current.clientWidth || window.innerWidth;
    const clientH = svgRef.current.clientHeight || window.innerHeight;
    const fit = fitSegmentToView(p1, p2, clientW, clientH);
    setViewBox({ x: fit.x, y: fit.y, w: fit.w, h: fit.h });
    setZoomPercent(fit.zoomPercent);
    toast(`Focused on Edge ${selectedSegIndex + 1}`);
  };

  // Reset 1:1 Default View
  const handleResetView = () => {
    if (points.length >= 2) {
      handleFitToProfile();
    } else {
      setViewBox({ x: -50, y: -50, w: 500, h: 400 });
      setZoomPercent(100);
    }
  };

  // Zoom In / Out by factor centered on viewport
  const handleZoom = (factor: number) => {
    setViewBox((v) => {
      const newW = Math.max(60, Math.min(6000, v.w * factor));
      const newH = Math.max(60, Math.min(6000, v.h * factor));
      const midX = v.x + v.w / 2;
      const midY = v.y + v.h / 2;
      const newX = midX - newW / 2;
      const newY = midY - newH / 2;
      setZoomPercent(Math.round((500 / newW) * 100));
      return { x: newX, y: newY, w: newW, h: newH };
    });
  };

  // Commit points into FlashingProfile segments
  const commitPointsAsProfile = (pts: Point2D[]): FlashingProfile | null => {
    if (pts.length < 2) return null;
    const segs = pointsToSegments(pts, 1.0).map((segment, index) => ({
      ...segment,
      id: selected?.segments[index]?.id || segment.id,
      kind: selected?.segments[index]?.kind || segment.kind
    }));
    const blank = calculateDevelopedBlankWidth(segs, selected?.thicknessMm || 0.55);
    const tier = classifyGirthTier(blank);

    if (selected) {
      const updatedProfile: FlashingProfile = {
        ...selected,
        name: profileName.trim() || selected.name,
        category: selected.category || assignmentContext?.defaultCategory,
        segments: segs,
        geometryPointsMm: pointsToGeometryMm(pts, 1.0),
        startHeadingDeg:
          pts.length >= 2
            ? (Math.atan2(-(pts[1].y - pts[0].y), pts[1].x - pts[0].x) * 180) / Math.PI
            : (selected.startHeadingDeg ?? 0),
        paintSide,
        developedLengthMm: blank,
        developedBlankWidthMm: blank,
        girthTier: tier,
        updatedAt: new Date().toISOString()
      };
      const next = profiles.map((p) => (p.id === selected.id ? updatedProfile : p));
      persistProfiles(next);
      toast('Profile updated');
      return updatedProfile;
    } else {
      const profile: FlashingProfile = {
        id: uid('fp'),
        name:
          profileName.trim() ||
          assignmentContext?.defaultName ||
          `Profile ${profiles.length + 1}`,
        category: assignmentContext?.defaultCategory || 'Barge & Edge',
        segments: segs,
        geometryPointsMm: pointsToGeometryMm(pts, 1.0),
        startHeadingDeg:
          pts.length >= 2
            ? (Math.atan2(-(pts[1].y - pts[0].y), pts[1].x - pts[0].x) * 180) / Math.PI
            : 0,
        material: project.material || '0.55mm ColorCote Vitor+',
        colorName: project.colorName || 'FlaxPod',
        thicknessMm: 0.55,
        paintSide,
        developedLengthMm: blank,
        developedBlankWidthMm: blank,
        girthTier: tier,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      persistProfiles([profile, ...profiles]);
      setSelectedId(profile.id);
      toast('Profile saved');
      return profile;
    }
  };

  const handleCommitAndAssign = () => {
    if (!onAssignProfile) return;
    let built: FlashingProfile | null = null;
    if (points.length >= 2) {
      built = commitPointsAsProfile(points);
    } else if (selected) {
      built = {
        ...selected,
        name: profileName.trim() || selected.name,
        category: selected.category || assignmentContext?.defaultCategory,
        updatedAt: new Date().toISOString()
      };
    }
    if (!built) {
      toast('Draw at least 2 points or choose an E2/AS1 preset first');
      return;
    }
    onSaveToLibrary?.(built);
    onAssignProfile(built);
  };

  // Update a single segment's length, angle or kind with instant geometry regeneration
  const updateSegmentAt = (index: number, patch: Partial<FlashingSegment>) => {
    if (!selected || index < 0 || index >= selected.segments.length) return;
    const safePatch = { ...patch };
    if (typeof safePatch.lengthMm === 'number') {
      safePatch.lengthMm = Math.max(1, Math.min(10000, safePatch.lengthMm));
    }
    if (typeof safePatch.angleDeg === 'number') {
      safePatch.angleDeg = Math.max(0, Math.min(179, safePatch.angleDeg));
      if (safePatch.angleDeg <= 2 && !safePatch.kind && selected.segments[index]?.kind === 'leg') {
        safePatch.kind = 'crush_fold';
      }
    }

    const segs = selected.segments.map((s, i) => (i === index ? { ...s, ...safePatch } : s));
    const origin = points[0] || { x: 50, y: 150 };
    const startHeadingDeg =
      points.length >= 2
        ? (Math.atan2(-(points[1].y - points[0].y), points[1].x - points[0].x) * 180) / Math.PI
        : (selected.startHeadingDeg ?? 0);

    const newPts = segmentsToPoints(segs, origin, 1.0, startHeadingDeg);
    setPoints(newPts);

    const blank = calculateDevelopedBlankWidth(segs, selected.thicknessMm || 0.55);
    const tier = classifyGirthTier(blank);

    const next = profiles.map((p) =>
      p.id === selected.id
        ? {
            ...p,
            segments: segs,
            geometryPointsMm: pointsToGeometryMm(newPts, 1.0),
            startHeadingDeg,
            developedLengthMm: blank,
            developedBlankWidthMm: blank,
            girthTier: tier,
            paintSide,
            updatedAt: new Date().toISOString()
          }
        : p
    );
    persistProfiles(next);
  };

  // Immediate coordinate geometry update from a baseline snapshot (works in both Draw & Edit modes)
  const applySegmentLengthFromBaseline = (
    index: number,
    newLengthMm: number,
    basePts: Point2D[],
    baseSegs: FlashingSegment[]
  ) => {
    const safeLen = Math.max(1, Math.min(10000, newLengthMm));
    if (index < 0 || index >= basePts.length - 1) return;

    if (selected && baseSegs.length === basePts.length - 1) {
      const segs = baseSegs.map((s, i) => (i === index ? { ...s, lengthMm: safeLen } : s));
      const origin = basePts[0] || { x: 50, y: 150 };
      const startHeadingDeg =
        basePts.length >= 2
          ? (Math.atan2(-(basePts[1].y - basePts[0].y), basePts[1].x - basePts[0].x) * 180) / Math.PI
          : (selected.startHeadingDeg ?? 0);

      const newPts = segmentsToPoints(segs, origin, 1.0, startHeadingDeg);
      setPoints(newPts);

      const blank = calculateDevelopedBlankWidth(segs, selected.thicknessMm || 0.55);
      const tier = classifyGirthTier(blank);
      const next = profiles.map((p) =>
        p.id === selected.id
          ? {
              ...p,
              segments: segs,
              geometryPointsMm: pointsToGeometryMm(newPts, 1.0),
              startHeadingDeg,
              developedLengthMm: blank,
              developedBlankWidthMm: blank,
              girthTier: tier,
              paintSide,
              updatedAt: new Date().toISOString()
            }
          : p
      );
      persistProfiles(next);
      return;
    }

    // Freehand draw mode (uncommitted polyline): adjust target vertex along edge unit vector and translate downstream vertices
    const pA = basePts[index];
    const pB = basePts[index + 1];
    const curD = dist(pA, pB);
    const ux = curD > 1e-4 ? (pB.x - pA.x) / curD : 1;
    const uy = curD > 1e-4 ? (pB.y - pA.y) / curD : 0;
    const newPB = { x: pA.x + ux * safeLen, y: pA.y + uy * safeLen };
    const dx = newPB.x - pB.x;
    const dy = newPB.y - pB.y;
    const updatedPts = basePts.map((pt, i) => {
      if (i <= index) return pt;
      if (i === index + 1) return newPB;
      return { x: pt.x + dx, y: pt.y + dy };
    });
    setPoints(updatedPts);
  };

  const openInlineLengthOverlay = (
    segIndex: number,
    lengthMm: number,
    anchorSvgPt: Point2D
  ) => {
    setSelectedSegIndex(segIndex);
    setSelectedBendIndex(null);

    let leftPx = 180;
    let topPx = 120;
    const svg = svgRef.current;
    const container = containerRef.current;
    if (svg && container) {
      const cRect = container.getBoundingClientRect();
      const ctm = svg.getScreenCTM();
      if (ctm) {
        const pt = svg.createSVGPoint();
        pt.x = anchorSvgPt.x;
        pt.y = anchorSvgPt.y;
        const screenPt = pt.matrixTransform(ctm);
        leftPx = Math.max(108, Math.min(cRect.width - 108, screenPt.x - cRect.left));
        topPx = Math.max(54, Math.min(cRect.height - 96, screenPt.y - cRect.top));
      } else {
        leftPx = Math.max(108, cRect.width / 2);
        topPx = Math.max(54, cRect.height / 2);
      }
    }

    const baseSegs = selected?.segments
      ? selected.segments.map((s) => ({ ...s }))
      : pointsToSegments(points, 1.0);
    setInlineLengthOverlay({
      segIndex,
      value: String(Math.round(lengthMm)),
      leftPx,
      topPx,
      basePoints: points.map((pt) => ({ ...pt })),
      baseSegments: baseSegs
    });
  };

  // Load an architectural preset
  const handleLoadPreset = (preset: typeof ARCHITECTURAL_FLASHING_PRESETS[0]) => {
    const newId = uid('prof');
    const segs = (preset.segments || []).map((s) => ({ ...s, id: uid('seg') }));
    const blankMm = calculateDevelopedBlankWidth(segs, 0.55);
    const tier = classifyGirthTier(blankMm);
    const side: PaintSide = preset.paintSide === 'inside' ? 'inside' : 'outside';

    const newProf: FlashingProfile = {
      id: newId,
      name: preset.name,
      segments: segs,
      developedLengthMm: blankMm,
      developedBlankWidthMm: blankMm,
      girthTier: tier,
      paintSide: side,
      category: preset.category,
      material: preset.material || '0.55mm ColorCote Vitor+',
      colorName: preset.colorName || 'Ebony / FlaxPod',
      insideRadiusMm: preset.insideRadiusMm,
      kFactor: preset.kFactor,
      status: 'approved',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    persistProfiles([newProf, ...profiles]);
    setSelectedId(newId);
    setProfileName(preset.name);
    setPaintSide(side);

    const pts = segmentsToPoints(segs, { x: 50, y: 150 }, 1.0, 0);
    setPoints(pts);
    setMode('edit');
    setSelectedSegIndex(0);
    setSelectedBendIndex(null);
    setShowPresetsModal(false);
    toast(`Loaded ${preset.name} (${tier})`);

    setTimeout(() => {
      handleFitToProfile(pts);
    }, 50);
  };

  // Flip Profile horizontally (Variobend mirror tool)
  const flipProfile = () => {
    if (!selected || points.length < 2) return;
    const xs = points.map((p) => p.x);
    const centreX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const flippedPoints = points.map((p) => ({ x: 2 * centreX - p.x, y: p.y }));
    setPoints(flippedPoints);
    commitPointsAsProfile(flippedPoints);
    toast('Profile mirrored horizontally');
  };

  // Delete last edge
  const deleteLastEdge = () => {
    if (mode === 'draw') {
      setPoints((prev) => prev.slice(0, -1));
      return;
    }
    if (!selected || selected.segments.length <= 1) {
      toast('Cannot delete the only edge');
      return;
    }
    const nextSegments = selected.segments.slice(0, -1);
    const origin = points[0] || { x: 50, y: 150 };
    const nextPoints = segmentsToPoints(nextSegments, origin, 1.0, selected.startHeadingDeg ?? 0);
    setPoints(nextPoints);

    const blank = calculateDevelopedBlankWidth(nextSegments, 0.55);
    const updated: FlashingProfile = {
      ...selected,
      segments: nextSegments,
      geometryPointsMm: pointsToGeometryMm(nextPoints, 1.0),
      developedLengthMm: blank,
      developedBlankWidthMm: blank,
      girthTier: classifyGirthTier(blank),
      updatedAt: new Date().toISOString()
    };
    persistProfiles(profiles.map((p) => (p.id === selected.id ? updated : p)));
    setSelectedSegIndex(Math.max(0, nextSegments.length - 1));
    toast('Last edge removed');
  };

  // Canvas pointer event handlers (draw, drag vertices, pan, pinch)
  const handlePointerDown = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (svg) {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Multi-touch pinch zoom gesture
    if (activePointers.current.size >= 2) {
      pendingDrawTap.current = null;
      isPanning.current = false;
      const pair = Array.from(activePointers.current.values()).slice(0, 2);
      gestureStart.current = {
        distance: Math.max(1, dist(pair[0], pair[1])),
        midpoint: { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 },
        viewBox: { ...viewBox }
      };
      return;
    }

    const p = clientToSvg(e.clientX, e.clientY);
    if (!p) return;

    // Check if middle-click or spacebar active for panning
    if (e.button === 1 || e.buttons === 4) {
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, viewBoxX: viewBox.x, viewBoxY: viewBox.y };
      return;
    }

    if (mode === 'draw') {
      if (inlineLengthOverlay) {
        setInlineLengthOverlay(null);
      }
      pendingDrawTap.current = { pointerId: e.pointerId, point: snapPoint(p) };
      return;
    }

    if (mode === 'edit') {
      const hitR = 14 * modelUnitsPerScreenPixel;
      // 1. Check click on vertices to select bend or drag vertex
      for (let i = 0; i < points.length; i++) {
        if (dist(points[i], p) < hitR) {
          draggedVertex.current = i;
          if (i > 0 && i < points.length) {
            setSelectedBendIndex(i - 1);
            setSelectedSegIndex(i - 1);
          } else {
            setSelectedSegIndex(0);
          }
          return;
        }
      }

      // 2. Check click near segments
      for (let i = 0; i < points.length - 1; i++) {
        const d = dist({ x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }, p);
        if (d < hitR + 8 * modelUnitsPerScreenPixel) {
          setSelectedSegIndex(i);
          setSelectedBendIndex(null);
          return;
        }
      }

      // Otherwise pan the canvas
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, viewBoxX: viewBox.x, viewBoxY: viewBox.y };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Two-finger pinch to zoom
    const svg = svgRef.current;
    const gesture = gestureStart.current;
    if (svg && gesture && activePointers.current.size >= 2) {
      const pair = Array.from(activePointers.current.values()).slice(0, 2);
      const currentDistance = Math.max(1, dist(pair[0], pair[1]));
      const midpoint = { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 };
      const rect = svg.getBoundingClientRect();
      const scale = gesture.distance / currentDistance;
      const w = Math.max(50, Math.min(8000, gesture.viewBox.w * scale));
      const h = Math.max(50, Math.min(8000, gesture.viewBox.h * scale));
      const nx = (gesture.midpoint.x - rect.left) / Math.max(1, rect.width);
      const ny = (gesture.midpoint.y - rect.top) / Math.max(1, rect.height);
      const anchorX = gesture.viewBox.x + nx * gesture.viewBox.w;
      const anchorY = gesture.viewBox.y + ny * gesture.viewBox.h;
      const dx = ((midpoint.x - gesture.midpoint.x) * gesture.viewBox.w) / Math.max(1, rect.width);
      const dy = ((midpoint.y - gesture.midpoint.y) * gesture.viewBox.h) / Math.max(1, rect.height);
      setViewBox({ x: anchorX - nx * w - dx, y: anchorY - ny * h - dy, w, h });
      setZoomPercent(Math.round((500 / w) * 100));
      return;
    }

    // Single-finger / pointer pan
    if (isPanning.current && panStart.current && svg) {
      const rect = svg.getBoundingClientRect();
      const dxPx = e.clientX - panStart.current.x;
      const dyPx = e.clientY - panStart.current.y;
      const dxModel = (dxPx / rect.width) * viewBox.w;
      const dyModel = (dyPx / rect.height) * viewBox.h;
      setViewBox((v) => ({
        ...v,
        x: panStart.current!.viewBoxX - dxModel,
        y: panStart.current!.viewBoxY - dyModel
      }));
      return;
    }

    const p = clientToSvg(e.clientX, e.clientY);
    if (!p) return;

    if (mode === 'edit' && draggedVertex.current !== null) {
      const vIndex = draggedVertex.current;
      const nextPt = snapPoint(p);
      setPoints((prev) => prev.map((pt, idx) => (idx === vIndex ? nextPt : pt)));
      return;
    }

    setCursor(p);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) gestureStart.current = null;
    isPanning.current = false;
    panStart.current = null;

    if (draggedVertex.current !== null) {
      draggedVertex.current = null;
      if (points.length >= 2) commitPointsAsProfile(points);
    }

    const pending = pendingDrawTap.current;
    if (pending && pending.pointerId === e.pointerId && mode === 'draw') {
      pendingDrawTap.current = null;
      let nextPt = pending.point;

      // 45-degree angle snapping relative to previous point
      if (snapAngles && points.length > 0) {
        const prev = points[points.length - 1];
        const rad = Math.atan2(-(nextPt.y - prev.y), nextPt.x - prev.x);
        let deg = (rad * 180) / Math.PI;
        const nearest45 = Math.round(deg / 45) * 45;
        const delta = Math.abs((((deg - nearest45) % 360) + 540) % 360 - 180);
        if (delta <= 8) {
          const l = dist(prev, nextPt);
          const snapRad = (nearest45 * Math.PI) / 180;
          nextPt = { x: prev.x + Math.cos(snapRad) * l, y: prev.y - Math.sin(snapRad) * l };
        }
      }

      setPoints((prev) => [...prev, nextPt]);
      setSelectedSegIndex(points.length > 0 ? points.length - 1 : 0);
    }
  };

  // Wheel zoom centered on pointer
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (viewMode === '3d') {
      setZoom3d((z) => Math.max(0.4, Math.min(3.5, z * (e.deltaY < 0 ? 1.12 : 0.89))));
      return;
    }
    const p = clientToSvg(e.clientX, e.clientY);
    if (!p) return;
    const factor = e.deltaY < 0 ? 0.88 : 1.14;
    setViewBox((v) => {
      const newW = Math.max(40, Math.min(8000, v.w * factor));
      const newH = Math.max(40, Math.min(8000, v.h * factor));
      const rx = (p.x - v.x) / v.w;
      const ry = (p.y - v.y) / v.h;
      setZoomPercent(Math.round((500 / newW) * 100));
      return {
        x: p.x - rx * newW,
        y: p.y - ry * newH,
        w: newW,
        h: newH
      };
    });
  };

  // 3D Model Pointer Handlers (Smooth trackball rotation and pinch zoom)
  const handle3dPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    rotatePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (rotatePointers.current.size >= 2) {
      const pair = Array.from(rotatePointers.current.values()).slice(0, 2);
      pinchStart3d.current = { distance: Math.max(1, dist(pair[0], pair[1])), zoom: zoom3d };
      rotateStart.current = null;
    } else {
      rotateStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    }
  };

  const handle3dPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!rotatePointers.current.has(event.pointerId)) return;
    rotatePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (rotatePointers.current.size >= 2 && pinchStart3d.current) {
      const pair = Array.from(rotatePointers.current.values()).slice(0, 2);
      const distance = Math.max(1, dist(pair[0], pair[1]));
      setZoom3d(Math.max(0.4, Math.min(3.5, (pinchStart3d.current.zoom * distance) / pinchStart3d.current.distance)));
      return;
    }
    const start = rotateStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    rotateStart.current = { ...start, x: event.clientX, y: event.clientY };
    // Trackball: dragging right turns the model toward the right
    setRotation((prev) => ({
      yaw: prev.yaw - dx * 0.012,
      pitch: Math.max(-1.35, Math.min(1.35, prev.pitch + dy * 0.01))
    }));
  };

  const handle3dPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    rotatePointers.current.delete(event.pointerId);
    if (rotatePointers.current.size < 2) pinchStart3d.current = null;
    if (rotateStart.current?.pointerId === event.pointerId) rotateStart.current = null;
    if (rotatePointers.current.size === 1) {
      const [pointerId, point] = Array.from(rotatePointers.current.entries())[0];
      rotateStart.current = { pointerId, x: point.x, y: point.y };
    }
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {}
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;

      if (e.key === 'f' || e.key === 'F') {
        handleFitToProfile();
      } else if (e.key === 'Escape') {
        setSelectedSegIndex(null);
        setSelectedBendIndex(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteLastEdge();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (selected && selected.segments.length > 0) {
          setSelectedSegIndex((prev) =>
            prev === null ? 0 : (prev + (e.shiftKey ? -1 : 1) + selected.segments.length) % selected.segments.length
          );
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [points, selected, selectedSegIndex]);

  // Derived engineering calculations
  const segments = useMemo(() => {
    return selected?.segments || pointsToSegments(points, 1.0);
  }, [selected, points]);

  const developedBlankWidth = useMemo(() => {
    return calculateDevelopedBlankWidth(segments, selected?.thicknessMm || 0.55);
  }, [segments, selected?.thicknessMm]);

  const girthTier = useMemo(() => {
    return classifyGirthTier(developedBlankWidth);
  }, [developedBlankWidth]);

  const engineeringSummary = useMemo(() => {
    if (!segments.length) return null;
    const legs = segments.map((s, idx) => ({
      id: `l-${idx}`,
      lengthMm: s.lengthMm,
      interiorAngleDeg: s.angleDeg ?? 90,
      turnDirection: s.turnDirection ?? 1,
      kind: (s.kind === 'hem' ? 'open_hem' : s.kind) as any
    }));
    return calculateFlashingEngineering(legs, 'vitor_055', 3.0, 1);
  }, [segments]);

  // Compute Variobend Technical Dimension Annotations
  const legDimensions = useMemo(() => {
    return computeLegDimensions(points, segments, modelUnitsPerScreenPixel, selectedSegIndex);
  }, [points, segments, modelUnitsPerScreenPixel, selectedSegIndex]);

  // Compute Variobend Bend Angle Arcs
  const bendAngles = useMemo(() => {
    return computeBendAngleAnnotations(points, segments, modelUnitsPerScreenPixel);
  }, [points, segments, modelUnitsPerScreenPixel]);

  // Profile path string
  const profilePath = useMemo(() => {
    if (points.length < 2) return '';
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }, [points]);

  // Live snapped endpoint & length while drawing in Draw 2D mode
  const liveDrawSegment = useMemo(() => {
    if (mode !== 'draw' || points.length === 0 || !cursor) return null;
    const prev = points[points.length - 1];
    let nextPt = snapPoint(cursor);
    if (snapAngles) {
      const rad = Math.atan2(-(nextPt.y - prev.y), nextPt.x - prev.x);
      const deg = (rad * 180) / Math.PI;
      const nearest45 = Math.round(deg / 45) * 45;
      const delta = Math.abs((((deg - nearest45) % 360) + 540) % 360 - 180);
      if (delta <= 8) {
        const l = dist(prev, nextPt);
        const snapRad = (nearest45 * Math.PI) / 180;
        nextPt = { x: prev.x + Math.cos(snapRad) * l, y: prev.y - Math.sin(snapRad) * l };
      }
    }
    const lengthMm = Math.max(1, Math.round(dist(prev, nextPt)));
    return {
      from: prev,
      to: nextPt,
      midpoint: { x: (prev.x + nextPt.x) / 2, y: (prev.y + nextPt.y) / 2 },
      lengthMm,
      path: `M ${prev.x} ${prev.y} L ${nextPt.x} ${nextPt.y}`
    };
  }, [mode, points, cursor, snapToGrid, gridStep, snapAngles]);

  const liveDrawPath = liveDrawSegment?.path || '';

  // Painted face parallel offset path
  const paintedFacePath = useMemo(() => {
    if (points.length < 2) return '';
    const offsetMm = (paintSide === 'outside' ? 2.5 : -2.5) * modelUnitsPerScreenPixel;
    const offsetPts: Point2D[] = [];

    for (let i = 0; i < points.length; i++) {
      let normal: Point2D = { x: 0, y: -1 };
      if (i < points.length - 1) {
        const p1 = points[i];
        const p2 = points[i + 1];
        const d = dist(p1, p2);
        if (d > 1e-4) {
          normal = { x: -(p2.y - p1.y) / d, y: (p2.x - p1.x) / d };
        }
      } else {
        const p0 = points[i - 1];
        const p1 = points[i];
        const d = dist(p0, p1);
        if (d > 1e-4) {
          normal = { x: -(p1.y - p0.y) / d, y: (p1.x - p0.x) / d };
        }
      }
      offsetPts.push({ x: points[i].x + normal.x * offsetMm, y: points[i].y + normal.y * offsetMm });
    }
    return offsetPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  }, [points, paintSide, modelUnitsPerScreenPixel]);

  // 3D Solid Folded-Metal Extrusion Engine
  const paintFaceColor = '#ef4444'; // Red finish
  const oppositeFaceColor = '#9ca3af'; // Grey unpainted finish

  const modelFaces = useMemo(() => {
    if (points.length < 2) return [];
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    // Extrusion depth of sheet in model units
    const width = Math.max(90, Math.min(240, (Math.max(...xs) - Math.min(...xs)) * 0.5));
    const cosY = Math.cos(rotation.yaw);
    const sinY = Math.sin(rotation.yaw);
    const cosP = Math.cos(rotation.pitch);
    const sinP = Math.sin(rotation.pitch);

    // Compute vertex normals for sheet metal thickness (2.2 model units)
    const normals = points.map((p, i) => {
      const prev = points[Math.max(0, i - 1)];
      const next = points[Math.min(points.length - 1, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.max(0.001, Math.hypot(dx, dy));
      return { x: (-dy / len) * 2.2, y: (dx / len) * 2.2 };
    });

    const vertices = points.flatMap((p, i) => [
      { x: p.x - cx, y: -(p.y - cy), z: -width / 2 },
      { x: p.x - cx, y: -(p.y - cy), z: width / 2 },
      { x: p.x + normals[i].x - cx, y: -(p.y + normals[i].y - cy), z: -width / 2 },
      { x: p.x + normals[i].x - cx, y: -(p.y + normals[i].y - cy), z: width / 2 }
    ]);

    const transformed = vertices.map((v) => {
      const x1 = v.x * cosY - v.z * sinY;
      const z1 = v.x * sinY + v.z * cosY;
      return {
        x: x1,
        y: v.y * cosP - z1 * sinP,
        z: v.y * sinP + z1 * cosP
      };
    });

    const minX = Math.min(...transformed.map((v) => v.x));
    const maxX = Math.max(...transformed.map((v) => v.x));
    const minY = Math.min(...transformed.map((v) => v.y));
    const maxY = Math.max(...transformed.map((v) => v.y));
    const scale =
      Math.min(viewBox.w / Math.max(1, maxX - minX), viewBox.h / Math.max(1, maxY - minY)) * 0.7 * zoom3d;

    const project = (index: number) => {
      const v = transformed[index];
      return {
        x: viewBox.x + viewBox.w / 2 + v.x * scale,
        y: viewBox.y + viewBox.h / 2 - v.y * scale,
        z: v.z
      };
    };

    const faces: { key: string; points: Point2D[]; depth: number; fill: string; stroke: string }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const baseA = project(i * 4);
      const baseB = project((i + 1) * 4);
      const baseFrontA = project(i * 4 + 1);
      const baseFrontB = project((i + 1) * 4 + 1);
      const reverseA = project(i * 4 + 2);
      const reverseB = project((i + 1) * 4 + 2);
      const reverseFrontA = project(i * 4 + 3);
      const reverseFrontB = project((i + 1) * 4 + 3);

      // Outside face is painted when paintSide === 'outside'
      const painted = paintSide === 'outside' ? paintFaceColor : oppositeFaceColor;
      const unpainted = paintSide === 'outside' ? oppositeFaceColor : paintFaceColor;

      faces.push({
        key: 'paint-' + i,
        points: [baseFrontA, baseFrontB, baseB, baseA],
        depth: (baseFrontA.z + baseFrontB.z + baseB.z + baseA.z) / 4,
        fill: painted,
        stroke: '#f3f4f6'
      });
      faces.push({
        key: 'reverse-' + i,
        points: [reverseFrontA, reverseFrontB, reverseB, reverseA],
        depth: (reverseFrontA.z + reverseFrontB.z + reverseB.z + reverseA.z) / 4,
        fill: unpainted,
        stroke: '#6b7280'
      });
      faces.push({
        key: 'edge-' + i,
        points: [baseFrontB, reverseFrontB, reverseB, baseB],
        depth: (baseFrontB.z + reverseFrontB.z + reverseB.z + baseB.z) / 4,
        fill: '#737b86',
        stroke: '#d1d5db'
      });
    }

    return faces.sort((a, b) => a.depth - b.depth);
  }, [points, rotation, viewBox.x, viewBox.y, viewBox.w, viewBox.h, zoom3d, paintSide]);

  // Selected Segment & Bend objects
  const activeSegment = selectedSegIndex !== null ? segments[selectedSegIndex] : null;
  const activeBend = selectedBendIndex !== null ? bendAngles.find((b) => b.bendIndex === selectedBendIndex) : null;

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950 text-white flex flex-col select-none font-sans overflow-hidden">
      {/* TOP HEADER: Responsive on both mobile and desktop */}
      <header className="min-h-12 border-b border-slate-800 bg-slate-950 px-2.5 sm:px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 sm:flex-initial">
          <button
            onClick={onClose}
            className="min-h-9 min-w-9 flex items-center justify-center -ml-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Return to workshop"
            aria-label="Return to workshop"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="hidden sm:inline font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0">
              {project.projectNumber}
            </span>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              onBlur={() => {
                if (selected && profileName.trim()) {
                  persistProfiles(
                    profiles.map((p) => (p.id === selected.id ? { ...p, name: profileName.trim() } : p))
                  );
                }
              }}
              placeholder="Flashing Profile Name"
              className="bg-transparent font-bold text-xs sm:text-sm text-white placeholder-slate-500 outline-none min-w-0 w-full sm:w-44 border-b border-transparent focus:border-sky-500 px-1 py-0.5"
            />
          </div>
        </div>

        {/* Mode Switcher: Draw 2D / Edit / 3D */}
        <div className="order-3 sm:order-2 w-full sm:w-auto flex items-center justify-center gap-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-[11px] sm:text-xs font-semibold">
          <button
            onClick={() => {
              setViewMode('profile');
              setMode('draw');
            }}
            className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'profile' && mode === 'draw'
                ? 'bg-white text-slate-950 font-bold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Draw 2D
          </button>
          <button
            onClick={() => {
              if (points.length >= 2 && (!selected || mode === 'draw')) {
                commitPointsAsProfile(points);
              }
              setViewMode('profile');
              setMode('edit');
            }}
            className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'profile' && mode === 'edit'
                ? 'bg-white text-slate-950 font-bold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Edit mm / °
          </button>
          <button
            onClick={() => {
              if (points.length >= 2 && !selected) {
                commitPointsAsProfile(points);
              }
              setViewMode('3d');
            }}
            className={`flex-1 sm:flex-initial px-2.5 sm:px-3 py-1.5 sm:py-1 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
              viewMode === '3d'
                ? 'bg-sky-500 text-slate-950 font-bold shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>3D Fold</span>
          </button>
        </div>

        {/* Right Tools */}
        <div className="order-2 sm:order-3 flex items-center gap-1.5 shrink-0">
          {assignmentContext && onAssignProfile && (
            <button
              onClick={handleCommitAndAssign}
              disabled={points.length < 2 && !selected}
              className={`min-h-9 flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-extrabold rounded-lg transition-colors cursor-pointer shadow-md ${
                points.length >= 2 || selected
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
              title={`Save drawn flashing & assign to ${assignmentContext.lineLabel}`}
            >
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[110px] sm:max-w-[170px]">
                Assign {isMobile ? '' : `to ${assignmentContext.lineLabel}`}
              </span>
            </button>
          )}

          <button
            onClick={() => setShowPresetsModal(true)}
            className="min-h-9 flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            title="Load NZBC E2/AS1 Presets"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Presets</span>
          </button>

          <button
            onClick={() => setShowSavedSheet(true)}
            className="min-h-9 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer tabular-nums"
          >
            {profiles.length} Saved
          </button>

          <button
            onClick={() => setShowInspector(!showInspector)}
            className={`min-h-9 min-w-9 flex items-center justify-center p-1.5 rounded-lg border transition-colors cursor-pointer ${
              showInspector ? 'bg-sky-950 border-sky-700 text-sky-200' : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
            title="Toggle Properties Inspector"
            aria-label="Toggle Properties Inspector"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* SUB-HEADER / HUD STRIP */}
      {viewMode === '3d' ? (
        <div className="h-9 border-b border-slate-800/80 bg-slate-900/60 px-3 flex items-center justify-between text-xs text-slate-400 shrink-0 z-10">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400">Paint Side:</span>
            <button
              onClick={() => {
                setPaintSide('outside');
                if (selected) {
                  persistProfiles(
                    profiles.map((p) =>
                      p.id === selected.id ? { ...p, paintSide: 'outside', updatedAt: new Date().toISOString() } : p
                    )
                  );
                }
              }}
              className={`px-2.5 py-1 text-[11px] font-bold rounded transition-colors cursor-pointer ${
                paintSide === 'outside'
                  ? 'bg-red-500 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Outside (Red)
            </button>
            <button
              onClick={() => {
                setPaintSide('inside');
                if (selected) {
                  persistProfiles(
                    profiles.map((p) =>
                      p.id === selected.id ? { ...p, paintSide: 'inside', updatedAt: new Date().toISOString() } : p
                    )
                  );
                }
              }}
              className={`px-2.5 py-1 text-[11px] font-bold rounded transition-colors cursor-pointer ${
                paintSide === 'inside'
                  ? 'bg-red-500 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Inside (Red)
            </button>
            <span className="hidden md:inline text-[11px] text-slate-500 font-mono ml-2">
              Drag trackball to rotate · Pinch or wheel to zoom
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setZoom3d((z) => Math.max(0.4, z / 1.25))}
              className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
              title="Zoom Out 3D"
            >
              −
            </button>
            <span className="text-[10px] font-mono text-slate-400 min-w-10 text-center">
              {Math.round(zoom3d * 100)}%
            </span>
            <button
              onClick={() => setZoom3d((z) => Math.min(3.5, z * 1.25))}
              className="px-2 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition-colors"
              title="Zoom In 3D"
            >
              +
            </button>
            <button
              onClick={() => {
                setRotation({ yaw: -0.55, pitch: 0.45 });
                setZoom3d(1);
              }}
              className="px-2 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-sky-400 rounded transition-colors"
              title="Reset 3D Trackball Rotation"
            >
              Reset 3D
            </button>
          </div>
        </div>
      ) : (
        <div className="h-9 border-b border-slate-800/80 bg-slate-900/60 px-3 flex items-center justify-between text-xs text-slate-400 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={snapToGrid}
                onChange={(e) => setSnapToGrid(e.target.checked)}
                className="accent-sky-500 w-3.5 h-3.5"
              />
              <span className="text-[11px]">Snap Grid ({Math.round(gridStep)}mm)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={snapAngles}
                onChange={(e) => setSnapAngles(e.target.checked)}
                className="accent-sky-500 w-3.5 h-3.5"
              />
              <span className="text-[11px]">Snap 45°</span>
            </label>

            <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-slate-500">
              <span>Blank:</span>
              <strong className="text-white font-bold">{developedBlankWidth}mm</strong>
              <span className="text-sky-400 font-semibold">({girthTier})</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={flipProfile}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Mirror profile"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Mirror</span>
            </button>

            <button
              onClick={() => handleFitToProfile()}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Fit whole profile into view (F key)"
            >
              <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Fit Profile</span>
            </button>
          </div>
        </div>
      )}

      {/* TOAST NOTICE */}
      {notice && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-sky-500/50 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <span className="w-2 h-2 rounded-full bg-sky-400" />
          {notice}
        </div>
      )}

      {/* MAIN HERO VIEWPORT + INSPECTOR LAYOUT */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* SVG TECHNICAL DRAWING HERO CANVAS */}
        <div
          ref={containerRef}
          className="flex-1 h-full relative overflow-hidden bg-[#070b12] touch-none cursor-crosshair"
          onWheel={handleWheel}
        >
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            className="w-full h-full touch-none select-none"
            onPointerDown={viewMode === '3d' ? handle3dPointerDown : handlePointerDown}
            onPointerMove={viewMode === '3d' ? handle3dPointerMove : handlePointerMove}
            onPointerUp={viewMode === '3d' ? handle3dPointerUp : handlePointerUp}
            onPointerCancel={viewMode === '3d' ? handle3dPointerUp : handlePointerUp}
          >
            <defs>
              {/* Technical Precision Coordinate Grid */}
              <pattern
                id="tech-grid-minor"
                width={gridStep}
                height={gridStep}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${gridStep} 0 L 0 0 0 ${gridStep}`}
                  fill="none"
                  stroke="#172033"
                  strokeWidth={0.5 * modelUnitsPerScreenPixel}
                />
              </pattern>
              <pattern
                id="tech-grid-major"
                width={gridStep * 5}
                height={gridStep * 5}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${gridStep * 5} 0 L 0 0 0 ${gridStep * 5}`}
                  fill="none"
                  stroke="#23324d"
                  strokeWidth={1.0 * modelUnitsPerScreenPixel}
                />
              </pattern>
            </defs>

            {/* Background Grid */}
            <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="#070b12" />
            <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#tech-grid-minor)" />
            <rect x={viewBox.x} y={viewBox.y} width={viewBox.w} height={viewBox.h} fill="url(#tech-grid-major)" />

            {/* ============================================================ */}
            {/* 3D SOLID FOLDED METAL PROFILE RENDER                         */}
            {/* ============================================================ */}
            {viewMode === '3d' && points.length >= 2 && (
              <g>
                {modelFaces.map((face) => (
                  <polygon
                    key={face.key}
                    points={face.points.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill={face.fill}
                    stroke={face.stroke}
                    strokeWidth={1.2 * modelUnitsPerScreenPixel}
                    strokeLinejoin="round"
                  />
                ))}

                {/* 3D Model HUD & Finish Indicator */}
                <g pointerEvents="none">
                  <rect
                    x={viewBox.x + 16}
                    y={viewBox.y + 16}
                    width={220 * modelUnitsPerScreenPixel}
                    height={64 * modelUnitsPerScreenPixel}
                    rx={6 * modelUnitsPerScreenPixel}
                    fill="#0b0f19"
                    fillOpacity="0.88"
                    stroke="#1e293b"
                    strokeWidth={1 * modelUnitsPerScreenPixel}
                  />
                  <text
                    x={viewBox.x + 28}
                    y={viewBox.y + 36}
                    fill="#ef4444"
                    fontSize={12 * modelUnitsPerScreenPixel}
                    fontWeight="800"
                    fontFamily="system-ui, sans-serif"
                  >
                    PAINTED FACE · {paintSide.toUpperCase()} (RED)
                  </text>
                  <text
                    x={viewBox.x + 28}
                    y={viewBox.y + 54}
                    fill="#9ca3af"
                    fontSize={11 * modelUnitsPerScreenPixel}
                    fontWeight="700"
                    fontFamily="system-ui, sans-serif"
                  >
                    UNPAINTED REVERSE · GREY
                  </text>
                  <text
                    x={viewBox.x + 28}
                    y={viewBox.y + 70}
                    fill="#64748b"
                    fontSize={9.5 * modelUnitsPerScreenPixel}
                    fontFamily="system-ui, sans-serif"
                  >
                    Solid Folded Metal · {points.length - 1} Segment Profile
                  </text>

                  <text
                    x={viewBox.x + viewBox.w - 18}
                    y={viewBox.y + viewBox.h - 18}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize={11 * modelUnitsPerScreenPixel}
                    fontFamily="system-ui, sans-serif"
                  >
                    Trackball: drag to rotate · Scroll or pinch to zoom
                  </text>
                </g>
              </g>
            )}

            {/* ============================================================ */}
            {/* 2D VARIOBEND PROFILE DRAWING & TECHNICAL DIMENSIONING        */}
            {/* ============================================================ */}
            {viewMode === 'profile' && (
              <>
                {/* In-progress drawing preview line */}
                {liveDrawPath && (
                  <path
                    d={liveDrawPath}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth={2.5 * modelUnitsPerScreenPixel}
                    strokeDasharray={`${6 * modelUnitsPerScreenPixel} ${4 * modelUnitsPerScreenPixel}`}
                  />
                )}

                {/* Subtle painted face indicator line */}
                {paintedFacePath && (
                  <path
                    d={paintedFacePath}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth={1.5 * modelUnitsPerScreenPixel}
                    opacity={0.85}
                  />
                )}

                {/* HERO PROFILE OUTLINE: Dominant visual element */}
                {profilePath && (
                  <path
                    d={profilePath}
                    fill="none"
                    stroke="#f8fafc"
                    strokeWidth={3.5 * modelUnitsPerScreenPixel}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* ACTIVE SEGMENT HIGHLIGHT GLOW */}
                {selectedSegIndex !== null && points[selectedSegIndex] && points[selectedSegIndex + 1] && (
                  <g pointerEvents="none">
                    <line
                      x1={points[selectedSegIndex].x}
                      y1={points[selectedSegIndex].y}
                      x2={points[selectedSegIndex + 1].x}
                      y2={points[selectedSegIndex + 1].y}
                      stroke="#38bdf8"
                      strokeWidth={9 * modelUnitsPerScreenPixel}
                      strokeLinecap="round"
                      opacity={0.3}
                    />
                    <line
                      x1={points[selectedSegIndex].x}
                      y1={points[selectedSegIndex].y}
                      x2={points[selectedSegIndex + 1].x}
                      y2={points[selectedSegIndex + 1].y}
                      stroke="#38bdf8"
                      strokeWidth={4.5 * modelUnitsPerScreenPixel}
                      strokeLinecap="round"
                    />
                  </g>
                )}

                {/* LIVE RUBBER-BAND LENGTH BADGE WHILE DRAWING */}
                {liveDrawSegment && (
                  <g
                    transform={`translate(${liveDrawSegment.midpoint.x} ${liveDrawSegment.midpoint.y}) scale(${modelUnitsPerScreenPixel})`}
                    pointerEvents="none"
                  >
                    <rect
                      x={-(Math.max(44, String(liveDrawSegment.lengthMm).length * 7.5 + 20) / 2)}
                      y="-9.5"
                      width={Math.max(44, String(liveDrawSegment.lengthMm).length * 7.5 + 20)}
                      height="19"
                      rx="5"
                      fill="#0c4a6e"
                      stroke="#38bdf8"
                      strokeWidth="1.2"
                    />
                    <text
                      x="0"
                      y="3.5"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="10.5"
                      fontFamily="ui-monospace, monospace"
                      fontWeight="bold"
                    >
                      {liveDrawSegment.lengthMm}mm
                    </text>
                  </g>
                )}

                {/* LIVE EDGE LENGTH LABELS ON ALL PROFILE EDGES (CLICK TO EDIT IMMEDIATELY) */}
                {legDimensions.map((dim) => {
                  const isSelected = selectedSegIndex === dim.segIndex;
                  const isEditingThis = inlineLengthOverlay?.segIndex === dim.segIndex;
                  const u = modelUnitsPerScreenPixel;
                  const labelText = `${Math.round(dim.lengthMm)}mm`;
                  const badgeW = Math.max(44, labelText.length * 7.2 + 14);
                  const badgeH = 19;
                  const anchorPt = !dim.visible && dim.isShortSegment ? dim.textAnchor : dim.midpoint;

                  return (
                    <g key={`dim-${dim.segIndex}`}>
                      {!dim.visible && dim.isShortSegment && dim.arrowLeaderPath && (
                        <path
                          d={`M ${dim.midpoint.x} ${dim.midpoint.y} L ${anchorPt.x} ${anchorPt.y}`}
                          stroke={isSelected || isEditingThis ? '#38bdf8' : '#475569'}
                          strokeWidth={1 * u}
                          strokeDasharray={`${2 * u} ${2 * u}`}
                          pointerEvents="none"
                        />
                      )}
                      <g
                        transform={`translate(${anchorPt.x} ${anchorPt.y}) scale(${u})`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openInlineLengthOverlay(dim.segIndex, dim.lengthMm, anchorPt);
                        }}
                        className="cursor-pointer group"
                      >
                        <rect
                          x={-badgeW / 2}
                          y={-badgeH / 2}
                          width={badgeW}
                          height={badgeH}
                          rx="5"
                          fill={isEditingThis ? '#0369a1' : isSelected ? '#0284c7' : '#0b0f19'}
                          stroke={isEditingThis ? '#ffffff' : isSelected ? '#7dd3fc' : '#475569'}
                          strokeWidth={isEditingThis ? '1.6' : '1.2'}
                          className="transition-colors group-hover:stroke-sky-400"
                        />
                        <text
                          x="0"
                          y="3.5"
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="10.5"
                          fontFamily="ui-monospace, monospace"
                          fontWeight="bold"
                          pointerEvents="none"
                        >
                          {labelText}
                        </text>
                      </g>
                    </g>
                  );
                })}

                {/* VARIOBEND COMPACT BEND ANGLE INDICATORS */}
                {bendAngles.map((bend) => {
                  const isSelected = selectedBendIndex === bend.bendIndex;
                  // Zoom-level visibility: hide cramped angle badges on zoom out unless selected
                  if (!bend.visible && !isSelected) return null;

                  const arcColor = isSelected ? '#38bdf8' : '#64748b';
                  const textColor = isSelected ? '#ffffff' : '#94a3b8';
                  const u = modelUnitsPerScreenPixel;

                  return (
                    <g
                      key={`bend-${bend.bendIndex}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBendIndex(bend.bendIndex);
                        setSelectedSegIndex(bend.bendIndex);
                      }}
                      className="cursor-pointer"
                    >
                      {/* Geometric Circular Arc at Fold Vertex */}
                      <path
                        d={bend.arcPath}
                        fill="none"
                        stroke={arcColor}
                        strokeWidth={1.5 * u}
                        strokeDasharray={isSelected ? undefined : `${2.5 * u} ${1.5 * u}`}
                      />

                      {/* Screen-Space Angle Value */}
                      <g transform={`translate(${bend.labelPos.x} ${bend.labelPos.y}) scale(${u})`}>
                        <rect
                          x={bend.interiorAngleDeg <= 2 ? '-22' : '-16'}
                          y="-7.5"
                          width={bend.interiorAngleDeg <= 2 ? '44' : '32'}
                          height="15"
                          rx="3"
                          fill={isSelected ? '#0369a1' : '#0b0f19'}
                          stroke={isSelected ? '#38bdf8' : '#334155'}
                          strokeWidth="1"
                        />
                        <text
                          x="0"
                          y="3.5"
                          textAnchor="middle"
                          fill={textColor}
                          fontSize="9.5"
                          fontFamily="ui-monospace, monospace"
                          fontWeight="bold"
                        >
                          {bend.interiorAngleDeg <= 2 ? 'CRUSH' : `${bend.interiorAngleDeg}°`}
                        </text>
                      </g>
                    </g>
                  );
                })}

                {/* EDITABLE VERTEX HANDLES */}
                {mode === 'edit' &&
                  points.map((pt, i) => {
                    const isSelected = selectedSegIndex === i || (i > 0 && selectedSegIndex === i - 1);
                    const u = modelUnitsPerScreenPixel;
                    return (
                      <circle
                        key={`vtx-${i}`}
                        cx={pt.x}
                        cy={pt.y}
                        r={isSelected ? 5 * u : 3.5 * u}
                        fill={isSelected ? '#38bdf8' : '#0f172a'}
                        stroke={isSelected ? '#ffffff' : '#64748b'}
                        strokeWidth={1.5 * u}
                        className="hover:scale-125 transition-transform cursor-grab active:cursor-grabbing"
                      />
                    );
                  })}

                {/* Empty State Instruction */}
                {points.length === 0 && mode === 'draw' && (
                  <text
                    x={viewBox.x + viewBox.w / 2}
                    y={viewBox.y + viewBox.h / 2}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize={13 * modelUnitsPerScreenPixel}
                    fontFamily="system-ui, sans-serif"
                  >
                    Tap or click anywhere to begin sketching your architectural flashing profile.
                  </text>
                )}
              </>
            )}
          </svg>

          {/* SMALL ANCHORED NUMERICAL INPUT OVERLAY FOR EDGE LENGTHS */}
          {inlineLengthOverlay && viewMode === 'profile' && (
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                left: `${inlineLengthOverlay.leftPx}px`,
                top: `${inlineLengthOverlay.topPx}px`,
                transform: 'translate(-50%, -100%) translateY(-14px)'
              }}
              className="absolute z-40 w-48 rounded-xl bg-[#0b101d]/95 backdrop-blur-md border border-sky-500/70 shadow-2xl p-2.5 space-y-2 animate-in fade-in zoom-in-95"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-300">
                  Edge {inlineLengthOverlay.segIndex + 1} Length
                </span>
                <button
                  type="button"
                  onClick={() => setInlineLengthOverlay(null)}
                  className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
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
                    min="1"
                    max="10000"
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                    value={inlineLengthOverlay.value}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setInlineLengthOverlay((prev) => (prev ? { ...prev, value: raw } : null));
                      const parsed = parseFloat(raw);
                      if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 10000) {
                        applySegmentLengthFromBaseline(
                          inlineLengthOverlay.segIndex,
                          Math.round(parsed),
                          inlineLengthOverlay.basePoints,
                          inlineLengthOverlay.baseSegments
                        );
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setInlineLengthOverlay(null);
                      } else if (e.key === 'Escape') {
                        e.stopPropagation();
                        if (!selected) {
                          setPoints(inlineLengthOverlay.basePoints);
                        } else {
                          const origPtLen =
                            inlineLengthOverlay.baseSegments[inlineLengthOverlay.segIndex]?.lengthMm;
                          if (origPtLen) {
                            applySegmentLengthFromBaseline(
                              inlineLengthOverlay.segIndex,
                              origPtLen,
                              inlineLengthOverlay.basePoints,
                              inlineLengthOverlay.baseSegments
                            );
                          }
                        }
                        setInlineLengthOverlay(null);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-sky-400 rounded-lg pl-2.5 pr-8 py-1.5 font-mono text-sm font-bold text-white tabular-nums outline-none"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 font-bold pointer-events-none">
                    mm
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInlineLengthOverlay(null)}
                  className="p-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white cursor-pointer shrink-0"
                  title="Done (Enter)"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-1">
                {[-10, -1, 1, 10].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => {
                      const cur =
                        parseFloat(inlineLengthOverlay.value) ||
                        inlineLengthOverlay.baseSegments[inlineLengthOverlay.segIndex]?.lengthMm ||
                        50;
                      const next = Math.max(1, Math.min(10000, Math.round(cur + step)));
                      setInlineLengthOverlay((prev) =>
                        prev ? { ...prev, value: String(next) } : null
                      );
                      applySegmentLengthFromBaseline(
                        inlineLengthOverlay.segIndex,
                        next,
                        inlineLengthOverlay.basePoints,
                        inlineLengthOverlay.baseSegments
                      );
                    }}
                    className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-[10px] font-bold tabular-nums cursor-pointer"
                  >
                    {step > 0 ? `+${step}` : step}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CONTEXTUAL GUIDE & BLANK WIDTH HUD (BOTTOM LEFT) */}
          <div className="absolute bottom-4 left-3 sm:left-4 z-20 max-w-[58vw] sm:max-w-md pointer-events-none">
            <div className="bg-slate-900/85 border border-slate-800 backdrop-blur-md px-3 py-1.5 rounded-xl text-[11px] text-slate-300 shadow-lg">
              {viewMode === '3d'
                ? 'Drag to orbit 3D folded sheet · Switch painted face above'
                : mode === 'draw'
                ? 'Tap grid points to draw legs · Tap any mm badge to edit exact size'
                : 'Tap any mm length or bend° badge to adjust · Drag points to reshape'}
            </div>
          </div>

          {/* FLOATING VIEWPORT HUD (VARIOBEND NAVIGATION CONTROLS) */}
          <div className="absolute bottom-4 right-3 sm:right-4 z-20 flex items-center gap-0.5 sm:gap-1 bg-slate-900/90 border border-slate-800 backdrop-blur-md p-1 rounded-xl shadow-xl">
            <button
              onClick={() => handleZoom(1.25)}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Zoom Out (−)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <span className="font-mono text-[11px] font-bold text-slate-200 px-1.5 min-w-10 text-center tabular-nums">
              {zoomPercent}%
            </span>

            <button
              onClick={() => handleZoom(0.8)}
              className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-800 mx-0.5" />

            <button
              onClick={() => handleFitToProfile()}
              className="p-2 text-sky-400 hover:text-sky-300 hover:bg-slate-800 rounded-lg transition-colors"
              title="Fit Entire Profile (F key)"
            >
              <Maximize2 className="w-4 h-4" />
            </button>

            <button
              onClick={handleResetView}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* MOBILE BACKDROP FOR INSPECTOR SHEET */}
        {isMobile && showInspector && (
          <div
            onClick={() => setShowInspector(false)}
            className="fixed inset-0 bg-black/55 backdrop-blur-2xs z-20"
            aria-hidden="true"
          />
        )}

        {/* COLLAPSIBLE PROPERTIES INSPECTOR: Bottom-Sheet on Mobile, Side Panel on Desktop */}
        {showInspector && (
          <aside
            className={
              isMobile
                ? 'fixed inset-x-0 bottom-0 max-h-[68dvh] rounded-t-3xl border-t border-slate-700 bg-slate-950/98 backdrop-blur-md flex flex-col overflow-y-auto z-30 shadow-2xl pb-[env(safe-area-inset-bottom)]'
                : 'w-80 border-l border-slate-800 bg-slate-950 flex flex-col shrink-0 overflow-y-auto z-20'
            }
          >
            {isMobile && (
              <div className="pt-2.5 pb-1 flex justify-center shrink-0">
                <div className="w-10 h-1.5 rounded-full bg-slate-700" />
              </div>
            )}
            {/* Inspector Title */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                Geometry Inspector
              </span>
              <button
                onClick={() => setShowInspector(false)}
                className="min-h-9 min-w-9 flex items-center justify-center text-slate-400 hover:text-white rounded-lg"
                aria-label="Close Inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 flex-1">
              {/* Selected Leg Editor Card */}
              {activeSegment && selectedSegIndex !== null && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                      EDGE {selectedSegIndex + 1} OF {segments.length}
                    </span>
                    <button
                      onClick={handleFitSelected}
                      className="text-[11px] font-semibold text-sky-400 hover:underline flex items-center gap-0.5"
                    >
                      Focus <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Dimension input with step nudges */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                      Leg Length (mm)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="10000"
                        value={activeSegment.lengthMm}
                        onChange={(e) => updateSegmentAt(selectedSegIndex, { lengthMm: Number(e.target.value) })}
                        className="flex-1 bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-2 font-mono text-base font-bold text-white outline-none"
                      />
                      <span className="text-xs font-mono text-slate-500 px-1">mm</span>
                    </div>

                    <div className="grid grid-cols-4 gap-1 mt-1.5">
                      {[-10, -1, +1, +10].map((step) => (
                        <button
                          key={step}
                          onClick={() =>
                            updateSegmentAt(selectedSegIndex, {
                              lengthMm: Math.max(1, activeSegment.lengthMm + step)
                            })
                          }
                          className="py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-mono text-xs font-semibold cursor-pointer"
                        >
                          {step > 0 ? `+${step}` : step}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Edge Kind selector */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                      Edge Detail Type
                    </label>
                    <select
                      value={activeSegment.kind || 'leg'}
                      onChange={(e) => {
                        const kind = e.target.value as FlashingSegment['kind'];
                        const defaults = SEGMENT_KINDS.find((k) => k.value === kind);
                        updateSegmentAt(selectedSegIndex, {
                          kind,
                          lengthMm: defaults ? defaults.defaultMm : activeSegment.lengthMm
                        });
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-semibold text-white outline-none"
                    >
                      {SEGMENT_KINDS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Selected Bend Angle Card */}
              {activeBend && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                      BEND {activeBend.bendIndex + 1}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Fold: <strong>{activeBend.bendAngleDeg}°</strong>
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                      Interior Corner Angle (Degrees)
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="179"
                        value={activeBend.interiorAngleDeg}
                        onChange={(e) =>
                          updateSegmentAt(activeBend.bendIndex, { angleDeg: Number(e.target.value) })
                        }
                        className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-lg px-3 py-2 font-mono text-base font-bold text-white outline-none"
                      />
                      <span className="text-xs font-mono text-slate-500 px-1">deg</span>
                    </div>

                    <div className="grid grid-cols-5 gap-1 mt-1.5">
                      {[0, 45, 90, 135, 150].map((ang) => (
                        <button
                          key={ang}
                          onClick={() =>
                            updateSegmentAt(activeBend.bendIndex, {
                              angleDeg: ang,
                              ...(ang === 0 ? { kind: 'crush_fold' } : {})
                            })
                          }
                          className={`py-1 rounded font-mono text-xs font-semibold transition-colors cursor-pointer ${
                            activeBend.interiorAngleDeg === ang
                              ? 'bg-amber-500 text-slate-950 font-bold'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {ang === 0 ? 'Crush' : `${ang}°`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Turn direction toggle */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-400 font-semibold">Turn Direction</span>
                    <button
                      onClick={() =>
                        updateSegmentAt(activeBend.bendIndex, {
                          turnDirection: activeBend.turnDirection === 1 ? -1 : 1
                        })
                      }
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-bold rounded-lg cursor-pointer"
                    >
                      {activeBend.turnDirection === 1 ? 'UP (CCW)' : 'DOWN (CW)'}
                    </button>
                  </div>
                </div>
              )}

              {/* Material & Finish Spec Card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-2.5 text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                  Material & Paint Face
                </span>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Finished Face</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPaintSide('outside')}
                      className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                        paintSide === 'outside'
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Outside
                    </button>
                    <button
                      onClick={() => setPaintSide('inside')}
                      className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                        paintSide === 'inside'
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      Inside
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 pt-1">
                  Coil Spec: <strong className="text-slate-200">{selected?.material || project.material}</strong>
                </div>
              </div>

              {/* Engineering Calculations Summary */}
              {engineeringSummary && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-1.5 text-xs font-mono">
                  <span className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-wide block mb-1">
                    Fabrication Summary
                  </span>
                  <div className="flex justify-between text-slate-300">
                    <span>Nominal Leg Sum:</span>
                    <strong className="text-white">{engineeringSummary.nominalSumMm} mm</strong>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Total Bend Deduction:</span>
                    <strong className="text-amber-400">-{engineeringSummary.totalBendDeductionMm} mm</strong>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Developed Flat Blank:</span>
                    <strong className="text-emerald-400">{engineeringSummary.developedBlankWidthMm} mm</strong>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Girth Tier:</span>
                    <strong className="text-sky-400">{engineeringSummary.girthTier}</strong>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Master Slit Width:</span>
                    <strong className="text-white">{engineeringSummary.recommendedSlitWidthMm} mm</strong>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 space-y-2">
                {assignmentContext && onAssignProfile && (
                  <button
                    onClick={handleCommitAndAssign}
                    disabled={points.length < 2 && !selected}
                    className={`w-full py-2.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      points.length >= 2 || selected
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>Save &amp; Assign to {assignmentContext.lineLabel}</span>
                  </button>
                )}

                <button
                  onClick={deleteLastEdge}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-red-900/50 text-red-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Last Edge
                </button>

                {onSaveToLibrary && (selected || points.length >= 2) && (
                  <button
                    onClick={() => {
                      const saved = selected || commitPointsAsProfile(points);
                      if (saved) {
                        onSaveToLibrary(saved);
                        toast('Saved profile to library');
                      }
                    }}
                    className="w-full py-2 bg-sky-950 hover:bg-sky-900 border border-sky-800 text-sky-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Save to Flashing Library
                  </button>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* NZBC E2/AS1 ARCHITECTURAL PRESETS MODAL */}
      {showPresetsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 max-w-lg w-full max-h-[85vh] overflow-y-auto p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-sky-400" />
                  Standard Architectural Presets
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Pre-engineered architectural profiles with exact bend sequences and nominal girths.
                </p>
              </div>
              <button
                onClick={() => setShowPresetsModal(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ARCHITECTURAL_FLASHING_PRESETS.map((preset) => {
                const blank = calculateDevelopedBlankWidth(preset.segments || [], 0.55);
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleLoadPreset(preset)}
                    className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 hover:border-sky-500 text-left transition-all space-y-1.5 cursor-pointer group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors">
                        {preset.name}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-900 text-sky-300 font-mono">
                        {preset.girthTier || '301-450mm'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      Blank: {blank} mm · {(preset.segments || []).length} legs
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Material: {preset.material || '0.55mm ColorCote Vitor+'}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-medium">
                      Paint side: {preset.paintSide}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SAVED PROFILES SHEET */}
      {showSavedSheet && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 max-w-md w-full max-h-[80vh] overflow-y-auto p-4 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-sm font-bold text-white">Saved Project Profiles</span>
              <button onClick={() => setShowSavedSheet(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <ul className="divide-y divide-slate-800">
              {profiles.length === 0 ? (
                <li className="py-8 text-center text-xs text-slate-500">No saved profiles yet.</li>
              ) : (
                profiles.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => {
                        setSelectedId(p.id);
                        setShowSavedSheet(false);
                      }}
                      className="w-full text-left py-2.5 px-2 hover:bg-slate-800/60 rounded-lg transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-bold text-white">{p.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {p.segments.length} legs · Blank {p.developedLengthMm || 0}mm · {p.girthTier || 'Standard'}
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};