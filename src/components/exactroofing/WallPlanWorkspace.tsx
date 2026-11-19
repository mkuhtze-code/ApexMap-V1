import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  Compass,
  Download,
  Layers,
  Link2,
  PenTool,
  Plus,
  Ruler,
  Sparkles,
  Trash2,
  Undo2
} from 'lucide-react';
import { ArchitecturalPlan } from '../../types/crm';
import {
  Point2D,
  RoofLevel,
  RoofOutline,
  RoofPlane,
  RoofPlanUnderlay,
  WallFacet,
  WallFilterMode,
  WallPlan
} from '../../types/exactRoofing';
import {
  applyDraftPointSnap,
  dist,
  pointsClose
} from '../../utils/exactRoofingEngine';
import {
  analyzeWallPlanTopology,
  buildWallEdgesFromPoints,
  buildWallFacetsFromPlan,
  buildWallOpeningsSchedule,
  buildWallTakeoffExportData,
  computeWallFacetMetrics,
  computeWallTakeoffSummary,
  deriveWallPlanFromRoofLevels,
  getFacetPrimaryDisplayCladding,
  getWallCladdingMeta,
  isWallFacetUndetailed,
  moveWallPlanVertex,
  syncWallPlanWithRoof,
  updateWallPlanEdgeLength
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
  wallFilterMode?: WallFilterMode;
  onChangeWallFilterMode?: (mode: WallFilterMode) => void;
  initialSubView?: 'plan' | 'elevation';
  readOnly?: boolean;
}

type ScheduleTab = 'summary' | 'faces' | 'openings';

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
  wallFilterMode: propWallFilterMode,
  onChangeWallFilterMode,
  initialSubView = 'plan',
  readOnly = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [subView, setSubView] = useState<'plan' | 'elevation'>(initialSubView);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [draftPoints, setDraftPoints] = useState<Point2D[]>([]);
  const [hoverPt, setHoverPt] = useState<Point2D | null>(null);
  const [draggingVertexIdx, setDraggingVertexIdx] = useState<number | null>(null);
  const [defaultHeightM, setDefaultHeightM] = useState<number>(
    wallPlan?.defaultHeightM || levels[0]?.eaveHeightM || 2.7
  );
  const [editLengthVal, setEditLengthVal] = useState<string>('');
  const [localFilterMode, setLocalFilterMode] = useState<WallFilterMode>('all');
  const [scheduleTab, setScheduleTab] = useState<ScheduleTab>('summary');

  const filterMode = propWallFilterMode ?? localFilterMode;
  const setFilterMode = (mode: WallFilterMode) => {
    setLocalFilterMode(mode);
    onChangeWallFilterMode?.(mode);
  };

  const facets = wallPlan?.facets || [];
  const selectedFacet = useMemo(
    () => facets.find((f) => f.id === selectedWallFacetId) || facets[0] || null,
    [facets, selectedWallFacetId]
  );

  React.useEffect(() => {
    const target = facets.find((f) => f.id === selectedWallFacetId);
    setEditLengthVal(target ? target.lengthM.toFixed(2) : '');
  }, [selectedWallFacetId, facets]);

  const takeoffSummary = useMemo(
    () => computeWallTakeoffSummary(facets),
    [facets]
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
    return facets;
  }, [facets, filterMode, returnFacetIdSet]);

  const nextUndetailedFacet = useMemo(
    () => facets.find((f) => isWallFacetUndetailed(f)) || null,
    [facets]
  );

  // Unified world viewport framing roof + wall plan + draft points
  const viewBounds = useMemo(() => {
    const pts: Point2D[] = [
      ...levels.flatMap((l) => l.outline.points),
      ...(wallPlan?.points || []),
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
  }, [levels, wallPlan?.points, draftPoints, planUnderlay]);

  const svgW = 860;
  const svgH = 520;
  const worldW = Math.max(4, viewBounds.maxX - viewBounds.minX);
  const worldH = Math.max(4, viewBounds.maxY - viewBounds.minY);
  const pxPerM = Math.min((svgW - 48) / worldW, (svgH - 48) / worldH);
  const offsetX = (svgW - worldW * pxPerM) / 2 - viewBounds.minX * pxPerM;
  const offsetY = (svgH - worldH * pxPerM) / 2 - viewBounds.minY * pxPerM;

  const toSvgX = (wx: number) => wx * pxPerM + offsetX;
  const toSvgY = (wy: number) => wy * pxPerM + offsetY;
  const fromSvgX = (sx: number) => (sx - offsetX) / pxPerM;
  const fromSvgY = (sy: number) => (sy - offsetY) / pxPerM;

  const gridData = useMemo(
    () => computeMetricGridLines(svgW, svgH, pxPerM, fromSvgX, fromSvgY, toSvgX, toSvgY),
    [pxPerM, offsetX, offsetY]
  );
  const scaleBar = useMemo(() => computeDynamicScaleBar(pxPerM), [pxPerM]);

  const getWorldFromClient = (clientX: number, clientY: number): Point2D | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scale = Math.min(rect.width / svgW, rect.height / svgH);
    const renderedW = svgW * scale;
    const renderedH = svgH * scale;
    const padLeft = (rect.width - renderedW) / 2;
    const padTop = (rect.height - renderedH) / 2;
    const sx = (clientX - rect.left - padLeft) / scale;
    const sy = (clientY - rect.top - padTop) / scale;
    return { x: fromSvgX(sx), y: fromSvgY(sy) };
  };

  const snapToSitePoints = (pt: Point2D, anchor?: Point2D | null): Point2D => {
    const candidates: Point2D[] = [
      ...levels.flatMap((l) => l.outline.points),
      ...(wallPlan?.points || []),
      ...draftPoints
    ];
    for (const c of candidates) {
      if (dist(pt, c) < 0.25) return { ...c };
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
    const nextPlan: WallPlan = {
      points: pts,
      edges,
      defaultHeightM,
      facets: builtFacets,
      builtAt: new Date().toISOString()
    };
    onUpdateWallPlan(nextPlan);
    setIsDrawing(false);
    setDraftPoints([]);
    setHoverPt(null);
    if (builtFacets[0]) {
      onSelectWallFacet(builtFacets[0].id);
    }
  };

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
      onUpdateWallPlan({
        ...wallPlan,
        defaultHeightM,
        edges,
        facets: built,
        builtAt: new Date().toISOString()
      });
      if (built[0] && !built.some((f) => f.id === selectedWallFacetId)) {
        onSelectWallFacet(built[0].id);
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
    if (!isDrawing || readOnly) return;
    const raw = getWorldFromClient(e.clientX, e.clientY);
    if (!raw) return;

    if (draftPoints.length >= 3 && pointsClose(raw, draftPoints[0], 0.45)) {
      commitDraftLoop(draftPoints);
      return;
    }

    const prev = draftPoints[draftPoints.length - 1] || null;
    const snapped = snapToSitePoints(raw, prev);
    if (prev && dist(prev, snapped) < 0.1) return;
    setDraftPoints((curr) => [...curr, snapped]);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
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
      setHoverPt(snapToSitePoints(raw, prev));
    }
  };

  const handleSvgPointerUp = () => {
    if (draggingVertexIdx !== null) {
      setDraggingVertexIdx(null);
    }
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
    if (!edgeMatch) return;
    const updated = updateWallPlanEdgeLength(wallPlan, edgeMatch.id, val, levels);
    onUpdateWallPlan(updated);
  };

  const wallAsOutline: RoofOutline | null = useMemo(() => {
    if (!wallPlan || wallPlan.points.length < 3) return null;
    return {
      id: 'wall-plan-outline',
      points: wallPlan.points,
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
                  setIsDrawing((v) => !v);
                  setDraftPoints([]);
                  setHoverPt(null);
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  isDrawing
                    ? 'bg-amber-500 border-amber-400 text-slate-950'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>{isDrawing ? 'Cancel Draw' : 'Draw Plan'}</span>
              </button>

              <button
                type="button"
                onClick={handleSeedFromRoof}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-sky-300 flex items-center gap-1.5 cursor-pointer"
                title="Derive single-storey wall footprint under roof eaves"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>From Roof</span>
              </button>

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
            </>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs flex-wrap">
          {facets.length > 0 && (
            <div className="flex items-center p-0.5 bg-[#070b14] rounded-xl border border-slate-800">
              {(
                [
                  { id: 'all', label: `All (${facets.length})` },
                  { id: 'undetailed', label: `Needs Detail (${takeoffSummary.undetailedCount})` },
                  { id: 'returns', label: `Returns (${topology.returnFacesCount})` }
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

      {/* Interactive Drawing Banner */}
      {isDrawing && (
        <div className="bg-amber-950/60 border border-amber-500/40 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-amber-200">
            Click corners clockwise/counter-clockwise around single-storey floor plan ({draftPoints.length} pts). Snaps to roof points &amp; 45°/90° axes.
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={draftPoints.length === 0}
              onClick={() => setDraftPoints((p) => p.slice(0, -1))}
              className="px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              disabled={draftPoints.length < 3}
              onClick={() => commitDraftLoop(draftPoints)}
              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-40"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Close &amp; Build Faces</span>
            </button>
          </div>
        </div>
      )}

      {/* Undetailed Faces Prompt Strip */}
      {takeoffSummary.undetailedCount > 0 && nextUndetailedFacet && !isDrawing && (
        <div className="bg-amber-950/35 border border-amber-500/35 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-bold">
              {takeoffSummary.undetailedCount} wall {takeoffSummary.undetailedCount === 1 ? 'face still needs' : 'faces still need'} cladding assignment
              {topology.internalCornersCount > 0
                ? ` · ${topology.internalCornersCount} internal notch corners detected`
                : ''}
            </span>
          </div>
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
      )}

      {/* True-Scale 2D Floor Plan Canvas + Selected Wall Bar */}
      <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-2.5 flex flex-col gap-2.5 flex-1 min-h-[300px]">
        <div className="relative flex-1 bg-[#070b14] border border-slate-800/90 rounded-xl overflow-hidden min-h-[260px]">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${svgW} ${svgH}`}
            className={`w-full h-full select-none ${
              isDrawing ? 'cursor-crosshair' : 'cursor-default'
            }`}
            onClick={handleSvgClick}
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
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

            {/* Closed Floor Plan Polygon Fill */}
            {wallPlan && wallPlan.points.length >= 3 && (
              <polygon
                points={wallPlan.points.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ')}
                fill="rgba(14, 165, 233, 0.08)"
                stroke="none"
                pointerEvents="none"
              />
            )}

            {/* Labelled Wall Facets */}
            {wallAsOutline &&
              facets.map((facet) => {
                const x1 = toSvgX(facet.from.x);
                const y1 = toSvgY(facet.from.y);
                const x2 = toSvgX(facet.to.x);
                const y2 = toSvgY(facet.to.y);
                const isSel = facet.id === selectedWallFacetId;
                const isUndetailed = isWallFacetUndetailed(facet);
                const isReturn = returnFacetIdSet.has(facet.id);
                const matchesFilter =
                  filterMode === 'all' ||
                  (filterMode === 'undetailed' && isUndetailed) ||
                  (filterMode === 'returns' && isReturn);

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
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isSel ? '#38bdf8' : isUndetailed ? '#f59e0b' : meta.hex}
                      strokeWidth={isSel ? 5.5 : isReturn ? 4.2 : 3.5}
                      strokeLinecap="round"
                    />

                    {/* Wall Code Node */}
                    <g transform={`translate(${midX}, ${midY})`}>
                      <circle
                        r="11"
                        fill={isSel ? '#0284c7' : '#0b101d'}
                        stroke={isSel ? '#ffffff' : isUndetailed ? '#f59e0b' : meta.hex}
                        strokeWidth="2"
                      />
                      <text
                        y="3.8"
                        textAnchor="middle"
                        fill="#f8fafc"
                        fontSize="10.5"
                        fontWeight="900"
                        fontFamily="monospace"
                      >
                        {facet.code}
                      </text>
                    </g>

                    {/* Outward True-Length + Opening Readout */}
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor="middle"
                      fill={isSel ? '#7dd3fc' : '#cbd5e1'}
                      fontSize="10.5"
                      fontWeight="bold"
                      fontFamily="monospace"
                      pointerEvents="none"
                    >
                      {facet.lengthM.toFixed(2)}m
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

            {/* Draggable Corner Vertices */}
            {!isDrawing &&
              !readOnly &&
              wallPlan &&
              wallPlan.points.map((pt, idx) => (
                <circle
                  key={`wv-${idx}`}
                  cx={toSvgX(pt.x)}
                  cy={toSvgY(pt.y)}
                  r="5.5"
                  fill="#0f172a"
                  stroke="#38bdf8"
                  strokeWidth="2"
                  className="cursor-move"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDraggingVertexIdx(idx);
                  }}
                />
              ))}

            {/* Draft Polyline Preview */}
            {isDrawing && draftPoints.length > 0 && (
              <g pointerEvents="none">
                <polyline
                  points={draftPoints.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ')}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                />
                {hoverPt && (
                  <>
                    <line
                      x1={toSvgX(draftPoints[draftPoints.length - 1].x)}
                      y1={toSvgY(draftPoints[draftPoints.length - 1].y)}
                      x2={toSvgX(hoverPt.x)}
                      y2={toSvgY(hoverPt.y)}
                      stroke="#fbbf24"
                      strokeWidth="2"
                      strokeDasharray="5 4"
                    />
                    <text
                      x={(toSvgX(draftPoints[draftPoints.length - 1].x) + toSvgX(hoverPt.x)) / 2}
                      y={(toSvgY(draftPoints[draftPoints.length - 1].y) + toSvgY(hoverPt.y)) / 2 - 8}
                      textAnchor="middle"
                      fill="#fde68a"
                      fontSize="12"
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {dist(draftPoints[draftPoints.length - 1], hoverPt).toFixed(2)}m
                    </text>
                  </>
                )}
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
                <div className="font-bold text-white truncate">
                  Wall {selectedFacet.code} ·{' '}
                  {selectedFacet.regions && selectedFacet.regions.length > 1
                    ? `${selectedFacet.regions.length} Mixed Regions`
                    : getWallCladdingMeta(selectedFacet.claddingType).label}
                  {selectedFacet.heightSource === 'roof' ? ' · From Roof' : ''}
                </div>
                <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {selectedFacet.lengthM.toFixed(2)}m × {selectedFacet.heightM.toFixed(2)}m ·{' '}
                  {computeWallFacetMetrics(selectedFacet).netCladdingAreaM2.toFixed(2)} m² net ·{' '}
                  {selectedFacet.openings.length} openings
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!readOnly && (
                <div className="flex items-center gap-1">
                  <Ruler className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="number"
                    step="0.05"
                    min="0.2"
                    value={editLengthVal}
                    onChange={(e) => setEditLengthVal(e.target.value)}
                    onBlur={handleApplyEdgeLength}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyEdgeLength();
                    }}
                    className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs tabular-nums"
                    title="Edit wall length (m)"
                  />
                  <span className="text-[11px] text-slate-500">m</span>
                </div>
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

              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                {topology.externalCornersCount} ext · {topology.internalCornersCount} int notch ·{' '}
                {topology.returnFacesCount} returns
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
                    <th className="py-1.5 pr-2 font-bold">Face</th>
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
                    return (
                      <tr
                        key={f.id}
                        onClick={() => onSelectWallFacet(f.id)}
                        className="text-slate-200 hover:bg-slate-900/60 cursor-pointer"
                      >
                        <td className="py-1.5 pr-2 font-mono font-bold">
                          {f.code}
                          {isRet ? ' (Return)' : ''}
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
                        <td className="py-1.5 pl-2 text-right">
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
