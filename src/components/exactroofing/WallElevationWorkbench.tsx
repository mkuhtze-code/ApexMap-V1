import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Eye,
  EyeOff,
  Grid,
  Image as ImageIcon,
  Layers,
  Link2,
  Maximize,
  Plus,
  Ruler,
  Square,
  Trash2,
  Upload
} from 'lucide-react';
import { ArchitecturalPlan } from '../../types/crm';
import {
  Point2D,
  RoofLevel,
  RoofPlane,
  WallCladdingRegion,
  WallCladdingType,
  WallElevationUnderlay,
  WallFacet,
  WallOpening,
  WallOpeningType
} from '../../types/exactRoofing';
import {
  calibrateUnderlayFromTwoPoints,
  clampWallOpeningToFacet,
  clampWallRegionToFacet,
  computeWallFacetMetrics,
  createDefaultWallOpening,
  createHorizontalDadoSplit,
  createVerticalBaySplit,
  fitWallFacetTopToRoof,
  getFacetPrimaryDisplayCladding,
  getWallCladdingMeta,
  resolveRoofTopForWallFacet,
  WALL_CLADDING_OPTIONS
} from '../../utils/wallCladdingEngine';
import { SAMPLE_PROJECT_PLANS } from '../../data/sampleArchitecturalPlans';

interface Props {
  facet: WallFacet;
  facets: WallFacet[];
  projectPlans?: ArchitecturalPlan[];
  roofLevels?: RoofLevel[];
  roofPlanes?: RoofPlane[];
  onSelectFacet: (facetId: string) => void;
  onUpdateFacet: (updatedFacet: WallFacet) => void;
  onBackToPlan?: () => void;
  readOnly?: boolean;
}

const OPENING_STYLE: Record<
  WallOpeningType,
  { fill: string; stroke: string; label: string }
> = {
  window: { fill: 'rgba(56, 189, 248, 0.28)', stroke: '#38bdf8', label: 'Win' },
  door: { fill: 'rgba(245, 158, 11, 0.28)', stroke: '#f59e0b', label: 'Door' },
  garage: { fill: 'rgba(168, 85, 247, 0.28)', stroke: '#c084fc', label: 'Garage' },
  void: { fill: 'rgba(244, 63, 94, 0.22)', stroke: '#fb7185', label: 'Void' }
};

export const WallElevationWorkbench: React.FC<Props> = ({
  facet,
  facets,
  projectPlans = [],
  roofLevels = [],
  roofPlanes = [],
  onSelectFacet,
  onUpdateFacet,
  onBackToPlan,
  readOnly = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(
    facet.openings[0]?.id || null
  );
  const [clickPlaceType, setClickPlaceType] = useState<WallOpeningType | null>(null);
  const [showUnderlayPanel, setShowUnderlayPanel] = useState<boolean>(Boolean(facet.underlay));
  const [calibratingTwoPt, setCalibratingTwoPt] = useState<boolean>(false);
  const [calPtsNorm, setCalPtsNorm] = useState<Point2D[]>([]);
  const [calDistM, setCalDistM] = useState<string>('2.10');
  const [imageAspect, setImageAspect] = useState<number>(1.45);

  const metrics = useMemo(() => computeWallFacetMetrics(facet), [facet]);
  const primaryCladding = useMemo(() => getFacetPrimaryDisplayCladding(facet), [facet]);
  const claddingMeta = useMemo(() => getWallCladdingMeta(primaryCladding), [primaryCladding]);
  const roofMatchInfo = useMemo(
    () => resolveRoofTopForWallFacet(facet, roofLevels, roofPlanes),
    [facet, roofLevels, roofPlanes]
  );

  const availableSheets = useMemo(() => {
    return projectPlans.length > 0 ? projectPlans : SAMPLE_PROJECT_PLANS;
  }, [projectPlans]);

  const currentIdx = facets.findIndex((f) => f.id === facet.id);
  const prevFacet = currentIdx > 0 ? facets[currentIdx - 1] : facets[facets.length - 1];
  const nextFacet =
    currentIdx >= 0 && currentIdx < facets.length - 1 ? facets[currentIdx + 1] : facets[0];

  const selectedOpening = useMemo(
    () => facet.openings.find((o) => o.id === selectedOpeningId) || null,
    [facet.openings, selectedOpeningId]
  );

  const probeImageAspect = (src: string, onAspect: (ratio: number) => void) => {
    const img = new window.Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        onAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = src;
  };

  const attachUnderlayUrl = (name: string, imageUrl: string, planId?: string) => {
    if (readOnly) return;
    probeImageAspect(imageUrl, (ratio) => setImageAspect(ratio));
    const nextUnderlay: WallElevationUnderlay = {
      id: `wu-${Date.now().toString(36)}`,
      name,
      imageUrl,
      opacity: facet.underlay?.opacity ?? 0.45,
      visible: true,
      worldWidthM: +facet.lengthM.toFixed(3),
      worldHeightM: +facet.heightM.toFixed(3),
      offsetXM: 0,
      offsetYM: 0,
      calibrationMode: 'fit_face',
      calibratedAt: new Date().toISOString(),
      planId
    };
    onUpdateFacet({ ...facet, underlay: nextUnderlay });
    setShowUnderlayPanel(true);
    setCalibratingTwoPt(false);
    setCalPtsNorm([]);
  };

  const handleUploadUnderlayFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        attachUnderlayUrl(file.name, reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const updateUnderlay = (patch: Partial<WallElevationUnderlay>) => {
    if (!facet.underlay || readOnly) return;
    onUpdateFacet({
      ...facet,
      underlay: {
        ...facet.underlay,
        ...patch
      }
    });
  };

  const handleFitUnderlayToFace = () => {
    if (!facet.underlay || readOnly) return;
    updateUnderlay({
      worldWidthM: +facet.lengthM.toFixed(3),
      worldHeightM: +facet.heightM.toFixed(3),
      offsetXM: 0,
      offsetYM: 0,
      calibrationMode: 'fit_face',
      calibratedAt: new Date().toISOString()
    });
    setCalibratingTwoPt(false);
    setCalPtsNorm([]);
  };

  const handleApplyTwoPointScale = () => {
    if (!facet.underlay || calPtsNorm.length < 2 || readOnly) return;
    const distVal = parseFloat(calDistM);
    if (!Number.isFinite(distVal) || distVal <= 0.05) return;
    const cal = calibrateUnderlayFromTwoPoints({
      imageAspect,
      p1Norm: calPtsNorm[0],
      p2Norm: calPtsNorm[1],
      knownDistanceM: distVal,
      facetLengthM: facet.lengthM,
      facetHeightM: facet.heightM
    });
    updateUnderlay({
      ...cal,
      calibrationMode: 'two_point',
      calibrationPtsNorm: [calPtsNorm[0], calPtsNorm[1]],
      calibratedDistanceM: +distVal.toFixed(3),
      calibratedAt: new Date().toISOString()
    });
    setCalibratingTwoPt(false);
    setCalPtsNorm([]);
  };

  const handleSetCladding = (claddingType: WallCladdingType) => {
    if (readOnly) return;
    onUpdateFacet({
      ...facet,
      claddingType,
      regions: undefined
    });
  };

  const handleEnableDadoSplit = () => {
    if (readOnly) return;
    const regions = createHorizontalDadoSplit(facet, Math.min(1.2, facet.heightM * 0.45));
    onUpdateFacet({ ...facet, regions });
  };

  const handleEnableBaySplit = () => {
    if (readOnly) return;
    const regions = createVerticalBaySplit(facet, facet.lengthM * 0.5);
    onUpdateFacet({ ...facet, regions });
  };

  const handleUpdateRegion = (regId: string, patch: Partial<WallCladdingRegion>) => {
    if (readOnly || !facet.regions) return;
    const next = facet.regions.map((r) =>
      r.id === regId ? clampWallRegionToFacet(facet, { ...r, ...patch }) : r
    );
    // Keep synchronized shared boundary if 2 dado or 2 bay regions share seam
    if (next.length === 2) {
      if (patch.vEndM !== undefined && next[0].id === regId) {
        next[1] = clampWallRegionToFacet(facet, { ...next[1], vStartM: next[0].vEndM });
      } else if (patch.uEndM !== undefined && next[0].id === regId) {
        next[1] = clampWallRegionToFacet(facet, { ...next[1], uStartM: next[0].uEndM });
      }
    }
    onUpdateFacet({ ...facet, regions: next });
  };

  const handleSetHeight = (nextHeightM: number) => {
    if (readOnly || !Number.isFinite(nextHeightM)) return;
    const h = +Math.max(0.4, Math.min(12, nextHeightM)).toFixed(3);
    const topZ = +(facet.bottomZ + h).toFixed(3);
    const nextBase = { lengthM: facet.lengthM, heightM: h };
    const updatedOpenings = facet.openings.map((op) => clampWallOpeningToFacet(nextBase, op));
    const updatedRegions = facet.regions
      ? facet.regions.map((r) => clampWallRegionToFacet(nextBase, r))
      : undefined;
    onUpdateFacet({
      ...facet,
      heightM: h,
      topZ,
      heightSource: 'manual',
      roofProfile: undefined,
      openings: updatedOpenings,
      regions: updatedRegions
    });
  };

  const handleFitTopToRoof = () => {
    if (readOnly) return;
    const fitted = fitWallFacetTopToRoof(facet, roofLevels, roofPlanes);
    onUpdateFacet(fitted);
  };

  const handleSetBottomZ = (nextBottomZ: number) => {
    if (readOnly || !Number.isFinite(nextBottomZ)) return;
    const bz = +Math.max(-2, Math.min(12, nextBottomZ)).toFixed(3);
    onUpdateFacet({
      ...facet,
      bottomZ: bz,
      topZ: +(bz + facet.heightM).toFixed(3)
    });
  };

  const handleAddOpening = (type: WallOpeningType, distFromStartM?: number) => {
    if (readOnly) return;
    const newOp = createDefaultWallOpening(facet, type, distFromStartM);
    onUpdateFacet({
      ...facet,
      openings: [...facet.openings, newOp]
    });
    setSelectedOpeningId(newOp.id);
    setClickPlaceType(null);
  };

  const handleUpdateOpening = (opId: string, patch: Partial<WallOpening>) => {
    if (readOnly) return;
    const updated = facet.openings.map((op) =>
      op.id === opId ? clampWallOpeningToFacet(facet, { ...op, ...patch }) : op
    );
    onUpdateFacet({ ...facet, openings: updated });
  };

  const handleDeleteOpening = (opId: string) => {
    if (readOnly) return;
    const remaining = facet.openings.filter((o) => o.id !== opId);
    onUpdateFacet({ ...facet, openings: remaining });
    if (selectedOpeningId === opId) {
      setSelectedOpeningId(remaining[0]?.id || null);
    }
  };

  // True-scale SVG elevation layout (1 unit = 100 px per metre)
  const pxPerM = 100;
  const maxProfileHeight =
    facet.heightSource === 'roof' && facet.roofProfile && facet.roofProfile.length > 0
      ? Math.max(facet.heightM, ...facet.roofProfile.map((p) => p.topZ - facet.bottomZ))
      : facet.heightM;
  const padL = 78;
  const padR = 44;
  const padT = 38;
  const padB = 64;
  const wallW = Math.max(20, facet.lengthM * pxPerM);
  const wallH = Math.max(20, maxProfileHeight * pxPerM);
  const svgW = padL + wallW + padR;
  const svgH = padT + wallH + padB;

  const toSvgX = (uM: number) => padL + uM * pxPerM;
  const toSvgY = (vM: number) => padT + (maxProfileHeight - vM) * pxPerM;

  // Underlay SVG placement
  const underlayBox = useMemo(() => {
    if (!facet.underlay) return null;
    const ux = toSvgX(facet.underlay.offsetXM);
    const uy = toSvgY(facet.underlay.offsetYM + facet.underlay.worldHeightM);
    const uw = Math.max(10, facet.underlay.worldWidthM * pxPerM);
    const uh = Math.max(10, facet.underlay.worldHeightM * pxPerM);
    return { x: ux, y: uy, width: uw, height: uh };
  }, [facet.underlay, maxProfileHeight]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scale = Math.min(rect.width / svgW, rect.height / svgH);
    const renderedW = svgW * scale;
    const renderedH = svgH * scale;
    const padLeftPx = (rect.width - renderedW) / 2;
    const padTopPx = (rect.height - renderedH) / 2;
    const svgX = (e.clientX - rect.left - padLeftPx) / Math.max(0.01, scale);
    const svgY = (e.clientY - rect.top - padTopPx) / Math.max(0.01, scale);

    if (calibratingTwoPt && underlayBox) {
      const nx = Math.max(0, Math.min(1, (svgX - underlayBox.x) / underlayBox.width));
      const ny = Math.max(0, Math.min(1, (svgY - underlayBox.y) / underlayBox.height));
      setCalPtsNorm((curr) => (curr.length >= 2 ? [{ x: nx, y: ny }] : [...curr, { x: nx, y: ny }]));
      return;
    }

    if (!clickPlaceType) return;
    const uM = (svgX - padL) / pxPerM;
    const probe = createDefaultWallOpening(facet, clickPlaceType, 0);
    const centeredU = Math.max(0, Math.min(facet.lengthM - probe.widthM, uM - probe.widthM / 2));
    handleAddOpening(clickPlaceType, +centeredU.toFixed(2));
  };

  const xTicks = useMemo(() => {
    const step = facet.lengthM > 10 ? 2 : 1;
    const arr: number[] = [];
    for (let x = 0; x <= facet.lengthM + 1e-4; x += step) {
      arr.push(+x.toFixed(2));
    }
    if (arr.length === 0 || Math.abs(arr[arr.length - 1] - facet.lengthM) > 0.15) {
      arr.push(+facet.lengthM.toFixed(2));
    }
    return arr;
  }, [facet.lengthM]);

  const yTicks = useMemo(() => {
    const arr: number[] = [];
    for (let y = 0; y <= maxProfileHeight + 1e-4; y += 1) {
      arr.push(+y.toFixed(2));
    }
    if (arr.length === 0 || Math.abs(arr[arr.length - 1] - maxProfileHeight) > 0.15) {
      arr.push(+maxProfileHeight.toFixed(2));
    }
    return arr;
  }, [maxProfileHeight]);

  return (
    <div className="flex flex-col gap-3 h-full text-slate-100">
      {/* Top Facet Header & Stepper */}
      <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {onBackToPlan && (
            <button
              type="button"
              onClick={onBackToPlan}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Floor Plan</span>
            </button>
          )}
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs text-white border border-white/20 shrink-0"
            style={{ backgroundColor: claddingMeta.hex }}
          >
            {facet.code}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-sm text-white truncate">
                Wall {facet.code} Elevation
              </span>
              {facet.roofEdgeId && (
                <span className="text-[11px] font-bold text-sky-300">
                  {facet.heightSource === 'roof' ? '· Synced to Roof Eave' : '· Roof Edge Linked'}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 font-mono tabular-nums">
              {facet.lengthM.toFixed(2)}m L × {facet.heightM.toFixed(2)}m H ·{' '}
              {facet.regions && facet.regions.length > 1
                ? `${facet.regions.length} cladding regions`
                : claddingMeta.label}
            </div>
          </div>
        </div>

        {/* Underlay Toggle & Face Stepper (< Prev / Next >) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setShowUnderlayPanel((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
              showUnderlayPanel || facet.underlay
                ? 'bg-sky-600/20 border-sky-500/60 text-sky-200'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>{facet.underlay ? 'Underlay' : '+ Elevation Scan'}</span>
          </button>

          {facets.length > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => prevFacet && onSelectFacet(prevFacet.id)}
                className="px-2 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>{prevFacet?.code}</span>
              </button>
              <span className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 tabular-nums">
                {currentIdx + 1} / {facets.length}
              </span>
              <button
                type="button"
                onClick={() => nextFacet && onSelectFacet(nextFacet.id)}
                className="px-2 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
              >
                <span>{nextFacet?.code}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Elevation Image Underlay Setup & Calibration Strip */}
      {showUnderlayPanel && (
        <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-3 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-sky-400" />
              <span className="font-extrabold text-slate-200">
                Elevation Scan / Tracing Underlay
              </span>
              {facet.underlay && (
                <span className="text-[11px] font-mono text-slate-400 truncate max-w-[200px]">
                  {facet.underlay.name}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {!readOnly && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadUnderlayFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-sky-400" />
                    <span>Upload Image</span>
                  </button>

                  <select
                    value=""
                    onChange={(e) => {
                      const plan = availableSheets.find((s) => s.id === e.target.value);
                      if (plan) {
                        attachUnderlayUrl(`${plan.sheetNumber} · ${plan.title}`, plan.fileUrl, plan.id);
                      }
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-slate-200 cursor-pointer"
                  >
                    <option value="">Attach Project Sheet...</option>
                    {availableSheets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sheetNumber} · {s.title}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {facet.underlay && (
                <>
                  <button
                    type="button"
                    onClick={() => updateUnderlay({ visible: !facet.underlay!.visible })}
                    className="px-2 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    {facet.underlay.visible ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Visible</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                        <span>Hidden</span>
                      </>
                    )}
                  </button>

                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateFacet({ ...facet, underlay: null });
                        setCalibratingTwoPt(false);
                        setCalPtsNorm([]);
                      }}
                      className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-400 cursor-pointer"
                      title="Remove Elevation Underlay"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {facet.underlay && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-800/80">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold">
                  <span>Opacity</span>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={facet.underlay.opacity}
                    onChange={(e) => updateUnderlay({ opacity: parseFloat(e.target.value) })}
                    className="w-20 accent-sky-400 cursor-pointer"
                  />
                  <span className="font-mono text-slate-300 tabular-nums w-8">
                    {Math.round(facet.underlay.opacity * 100)}%
                  </span>
                </label>

                {!readOnly && (
                  <>
                    <button
                      type="button"
                      onClick={handleFitUnderlayToFace}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                        facet.underlay.calibrationMode === 'fit_face' && !calibratingTwoPt
                          ? 'bg-sky-600/25 border-sky-400 text-sky-200'
                          : 'bg-slate-900 border-slate-700 text-slate-300'
                      }`}
                    >
                      Fit to Face ({facet.lengthM.toFixed(1)}×{facet.heightM.toFixed(1)}m)
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCalibratingTwoPt((v) => !v);
                        setCalPtsNorm([]);
                        setClickPlaceType(null);
                      }}
                      className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                        calibratingTwoPt
                          ? 'bg-amber-500 border-amber-400 text-slate-950'
                          : 'bg-slate-900 border-slate-700 text-amber-300 hover:bg-slate-800'
                      }`}
                    >
                      <Ruler className="w-3 h-3" />
                      <span>{calibratingTwoPt ? 'Cancel 2-Pt Scale' : '2-Pt Calibrate'}</span>
                    </button>
                  </>
                )}
              </div>

              {!readOnly && (
                <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
                  <label className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
                    <span className="text-slate-500">W</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      value={+facet.underlay.worldWidthM.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v) && v >= 0.5) {
                          updateUnderlay({ worldWidthM: v, calibrationMode: 'manual_size' });
                        }
                      }}
                      className="w-12 bg-slate-900 border border-slate-700 rounded px-1 text-white font-mono font-bold text-[11px]"
                    />
                  </label>
                  <label className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
                    <span className="text-slate-500">H</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      value={+facet.underlay.worldHeightM.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v) && v >= 0.5) {
                          updateUnderlay({ worldHeightM: v, calibrationMode: 'manual_size' });
                        }
                      }}
                      className="w-12 bg-slate-900 border border-slate-700 rounded px-1 text-white font-mono font-bold text-[11px]"
                    />
                  </label>
                  <label className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
                    <span className="text-slate-500">dX</span>
                    <input
                      type="number"
                      step="0.1"
                      value={+facet.underlay.offsetXM.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) updateUnderlay({ offsetXM: v });
                      }}
                      className="w-12 bg-slate-900 border border-slate-700 rounded px-1 text-white font-mono font-bold text-[11px]"
                    />
                  </label>
                  <label className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
                    <span className="text-slate-500">dY</span>
                    <input
                      type="number"
                      step="0.1"
                      value={+facet.underlay.offsetYM.toFixed(2)}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (Number.isFinite(v)) updateUnderlay({ offsetYM: v });
                      }}
                      className="w-12 bg-slate-900 border border-slate-700 rounded px-1 text-white font-mono font-bold text-[11px]"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {calibratingTwoPt && facet.underlay && (
            <div className="bg-amber-950/60 border border-amber-500/40 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-amber-200">
                {calPtsNorm.length < 2
                  ? `Click ${2 - calPtsNorm.length} known reference point${calPtsNorm.length === 1 ? '' : 's'} on the underlay image (${calPtsNorm.length}/2 picked)`
                  : 'Enter real-world span between the 2 points (m) and apply'}
              </span>
              {calPtsNorm.length === 2 && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    value={calDistM}
                    onChange={(e) => setCalDistM(e.target.value)}
                    className="w-16 bg-slate-900 border border-amber-500/60 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs tabular-nums"
                  />
                  <span className="text-[11px] text-amber-300">m</span>
                  <button
                    type="button"
                    onClick={handleApplyTwoPointScale}
                    className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs cursor-pointer"
                  >
                    Apply Scale
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Split: True-Scale Elevation Canvas + Cladding/Opening Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">
        {/* Left/Top: True-Scale 2D Elevation Canvas */}
        <div className="lg:col-span-8 bg-[#0b101d] border border-slate-800 rounded-2xl p-3 flex flex-col gap-2.5 min-h-[300px]">
          {/* Quick Opening Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { type: 'window' as const, label: '+ Window', icon: Grid },
                  { type: 'door' as const, label: '+ Door', icon: DoorOpen },
                  { type: 'garage' as const, label: '+ Garage', icon: Maximize },
                  { type: 'void' as const, label: '+ Void', icon: Square }
                ]
              ).map((item) => {
                const Icon = item.icon;
                const isPlacing = clickPlaceType === item.type;
                return (
                  <div key={item.type} className="inline-flex items-center">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => handleAddOpening(item.type)}
                      className={`px-2.5 py-1.5 rounded-l-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                        isPlacing
                          ? 'bg-sky-600 border-sky-400 text-white'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 text-sky-400" />
                      <span>{item.label}</span>
                    </button>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        setCalibratingTwoPt(false);
                        setClickPlaceType((prev) => (prev === item.type ? null : item.type));
                      }}
                      title={`Tap on elevation to place ${item.type}`}
                      className={`px-1.5 py-1.5 rounded-r-xl border-y border-r text-[10px] font-bold cursor-pointer disabled:opacity-50 ${
                        isPlacing
                          ? 'bg-sky-500 border-sky-400 text-slate-950'
                          : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      Tap
                    </button>
                  </div>
                );
              })}
            </div>

            {clickPlaceType && (
              <span className="text-[11px] font-bold text-sky-300">
                Click anywhere along Wall {facet.code} to place {clickPlaceType}
              </span>
            )}
          </div>

          {/* True-Scale Elevation SVG */}
          <div className="flex-1 bg-[#070b14] border border-slate-800/90 rounded-xl p-2 flex items-center justify-center overflow-hidden min-h-[240px]">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${svgW} ${svgH}`}
              className={`w-full h-full max-h-[380px] select-none ${
                clickPlaceType || calibratingTwoPt ? 'cursor-crosshair' : 'cursor-default'
              }`}
              onClick={handleSvgClick}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <pattern
                  id={`hatch-${facet.id}`}
                  width={primaryCladding === 'profiled_metal' ? 14 : 24}
                  height={primaryCladding === 'weatherboard' ? 16 : 24}
                  patternUnits="userSpaceOnUse"
                >
                  {primaryCladding === 'weatherboard' && (
                    <line x1="0" y1="15" x2="24" y2="15" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
                  )}
                  {primaryCladding === 'profiled_metal' && (
                    <line x1="7" y1="0" x2="7" y2="24" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
                  )}
                  {primaryCladding === 'brick' && (
                    <>
                      <line x1="0" y1="12" x2="24" y2="12" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                      <line x1="12" y1="0" x2="12" y2="12" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                      <line x1="0" y1="12" x2="0" y2="24" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    </>
                  )}
                  {primaryCladding === 'fibre_cement' && (
                    <rect
                      x="0"
                      y="0"
                      width="24"
                      height="24"
                      fill="none"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="1"
                    />
                  )}
                </pattern>
              </defs>

              {/* Layer 1: Elevation Tracing Image Underlay (strictly behind wall/openings) */}
              {facet.underlay && facet.underlay.visible && underlayBox && (
                <image
                  href={facet.underlay.imageUrl}
                  x={underlayBox.x}
                  y={underlayBox.y}
                  width={underlayBox.width}
                  height={underlayBox.height}
                  opacity={facet.underlay.opacity}
                  preserveAspectRatio="none"
                  pointerEvents="none"
                />
              )}

              {/* Ground Datum Line */}
              <line
                x1={padL - 28}
                y1={toSvgY(0)}
                x2={padL + wallW + 24}
                y2={toSvgY(0)}
                stroke="#475569"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />

              {/* Layer 2: Main Wall Cladding Regions or Full Face */}
              {facet.regions && facet.regions.length > 0 ? (
                facet.regions.slice(0, 3).map((reg) => {
                  const cr = clampWallRegionToFacet(facet, reg);
                  const regMeta = getWallCladdingMeta(cr.claddingType);
                  const rx = toSvgX(cr.uStartM);
                  const ry = toSvgY(cr.vEndM);
                  const rw = Math.max(4, (cr.uEndM - cr.uStartM) * pxPerM);
                  const rh = Math.max(4, (cr.vEndM - cr.vStartM) * pxPerM);
                  return (
                    <g key={cr.id} pointerEvents="none">
                      <rect
                        x={rx}
                        y={ry}
                        width={rw}
                        height={rh}
                        fill={regMeta.hex}
                        fillOpacity={
                          facet.underlay && facet.underlay.visible
                            ? 0.34
                            : cr.claddingType === 'none'
                            ? 0.28
                            : 0.72
                        }
                        stroke="#cbd5e1"
                        strokeWidth="1.4"
                        strokeDasharray="4 3"
                      />
                      <text
                        x={rx + 8}
                        y={ry + 18}
                        fill="#f8fafc"
                        fontSize="12"
                        fontWeight="bold"
                        fontFamily="sans-serif"
                        opacity="0.9"
                      >
                        {cr.label || regMeta.shortLabel} ({regMeta.shortLabel})
                      </text>
                    </g>
                  );
                })
              ) : (
                <rect
                  x={padL}
                  y={toSvgY(facet.heightM)}
                  width={wallW}
                  height={facet.heightM * pxPerM}
                  fill={claddingMeta.hex}
                  fillOpacity={
                    facet.underlay && facet.underlay.visible
                      ? 0.32
                      : facet.claddingType === 'none'
                      ? 0.28
                      : 0.72
                  }
                  stroke={facet.claddingType === 'none' ? '#64748b' : '#e2e8f0'}
                  strokeWidth="2.5"
                />
              )}
              <rect
                x={padL}
                y={toSvgY(facet.heightM)}
                width={wallW}
                height={facet.heightM * pxPerM}
                fill={`url(#hatch-${facet.id})`}
                stroke="#e2e8f0"
                strokeWidth="2"
                pointerEvents="none"
              />

              {/* Layer 2B: Roof-Linked Top Rake/Eave Profile Overlay */}
              {facet.heightSource === 'roof' && facet.roofProfile && facet.roofProfile.length >= 2 && (
                <polyline
                  points={facet.roofProfile
                    .map((p) => `${toSvgX(p.distM)},${toSvgY(Math.max(0.2, p.topZ - facet.bottomZ))}`)
                    .join(' ')}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="3"
                  strokeDasharray="8 4"
                  pointerEvents="none"
                />
              )}

              {/* Metric X Axis Ticks */}
              {xTicks.map((t) => {
                const sx = toSvgX(t);
                return (
                  <g key={`xt-${t}`} pointerEvents="none">
                    <line
                      x1={sx}
                      y1={padT + wallH}
                      x2={sx}
                      y2={padT + wallH + 7}
                      stroke="#64748b"
                      strokeWidth="1.5"
                    />
                    <text
                      x={sx}
                      y={padT + wallH + 22}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="14"
                      fontFamily="monospace"
                    >
                      {t}m
                    </text>
                  </g>
                );
              })}

              {/* Metric Y Axis Ticks */}
              {yTicks.map((t) => {
                const sy = toSvgY(t);
                return (
                  <g key={`yt-${t}`} pointerEvents="none">
                    <line
                      x1={padL - 7}
                      y1={sy}
                      x2={padL}
                      y2={sy}
                      stroke="#64748b"
                      strokeWidth="1.5"
                    />
                    <text
                      x={padL - 12}
                      y={sy + 4}
                      textAnchor="end"
                      fill="#94a3b8"
                      fontSize="14"
                      fontFamily="monospace"
                    >
                      {t}m
                    </text>
                  </g>
                );
              })}

              {/* Bottom Overall Width Dimension */}
              <g pointerEvents="none">
                <line
                  x1={padL}
                  y1={padT + wallH + 42}
                  x2={padL + wallW}
                  y2={padT + wallH + 42}
                  stroke="#38bdf8"
                  strokeWidth="1.6"
                />
                <text
                  x={padL + wallW / 2}
                  y={padT + wallH + 56}
                  textAnchor="middle"
                  fill="#38bdf8"
                  fontSize="16"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {facet.lengthM.toFixed(2)} m
                </text>
              </g>

              {/* Layer 3: Parametric Openings Cutouts */}
              {facet.openings.map((op) => {
                const c = clampWallOpeningToFacet(facet, op);
                const ox = toSvgX(c.distFromStartM);
                const oy = toSvgY(c.sillHeightM + c.heightM);
                const ow = Math.max(8, c.widthM * pxPerM);
                const oh = Math.max(8, c.heightM * pxPerM);
                const style = OPENING_STYLE[c.type];
                const isSel = c.id === selectedOpeningId;

                return (
                  <g
                    key={c.id}
                    className={calibratingTwoPt ? 'pointer-events-none' : 'cursor-pointer'}
                    onClick={(ev) => {
                      if (calibratingTwoPt) return;
                      ev.stopPropagation();
                      setSelectedOpeningId(c.id);
                    }}
                  >
                    <rect
                      x={ox}
                      y={oy}
                      width={ow}
                      height={oh}
                      fill={style.fill}
                      stroke={isSel ? '#ffffff' : style.stroke}
                      strokeWidth={isSel ? 3.5 : 2}
                    />
                    {c.type === 'window' && (
                      <line
                        x1={ox + ow / 2}
                        y1={oy}
                        x2={ox + ow / 2}
                        y2={oy + oh}
                        stroke={style.stroke}
                        strokeWidth="1.2"
                        opacity="0.7"
                      />
                    )}
                    {c.type === 'garage' && (
                      <>
                        <line x1={ox} y1={oy + oh * 0.33} x2={ox + ow} y2={oy + oh * 0.33} stroke={style.stroke} strokeWidth="1" opacity="0.65" />
                        <line x1={ox} y1={oy + oh * 0.66} x2={ox + ow} y2={oy + oh * 0.66} stroke={style.stroke} strokeWidth="1" opacity="0.65" />
                      </>
                    )}
                    <text
                      x={ox + ow / 2}
                      y={oy + oh / 2 - 4}
                      textAnchor="middle"
                      fill="#f8fafc"
                      fontSize="14"
                      fontWeight="bold"
                      fontFamily="sans-serif"
                    >
                      {c.label || style.label}
                    </text>
                    <text
                      x={ox + ow / 2}
                      y={oy + oh / 2 + 14}
                      textAnchor="middle"
                      fill="#e2e8f0"
                      fontSize="13"
                      fontFamily="monospace"
                    >
                      {c.widthM.toFixed(2)}×{c.heightM.toFixed(2)}m
                    </text>
                  </g>
                );
              })}

              {/* 2-Point Underlay Calibration Markers */}
              {calibratingTwoPt && underlayBox && calPtsNorm.length > 0 && (
                <g pointerEvents="none">
                  {calPtsNorm.map((pt, i) => {
                    const cx = underlayBox.x + pt.x * underlayBox.width;
                    const cy = underlayBox.y + pt.y * underlayBox.height;
                    return (
                      <g key={`calpt-${i}`}>
                        <circle cx={cx} cy={cy} r="7" fill="#f59e0b" stroke="#0f172a" strokeWidth="2.5" />
                        <text
                          x={cx}
                          y={cy - 11}
                          textAnchor="middle"
                          fill="#fde68a"
                          fontSize="13"
                          fontWeight="bold"
                          fontFamily="monospace"
                        >
                          P{i + 1}
                        </text>
                      </g>
                    );
                  })}
                  {calPtsNorm.length === 2 && (
                    <line
                      x1={underlayBox.x + calPtsNorm[0].x * underlayBox.width}
                      y1={underlayBox.y + calPtsNorm[0].y * underlayBox.height}
                      x2={underlayBox.x + calPtsNorm[1].x * underlayBox.width}
                      y2={underlayBox.y + calPtsNorm[1].y * underlayBox.height}
                      stroke="#f59e0b"
                      strokeWidth="2.5"
                      strokeDasharray="5 3"
                    />
                  )}
                </g>
              )}
            </svg>
          </div>

          {/* Live Facet Area & Regional Cladding Breakdown */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-4 gap-2 text-xs tabular-nums">
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2">
                <div className="text-[10px] uppercase font-bold text-slate-500">Gross Wall</div>
                <div className="font-mono font-extrabold text-white text-sm">
                  {metrics.grossAreaM2.toFixed(2)} m²
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2">
                <div className="text-[10px] uppercase font-bold text-slate-500">Openings</div>
                <div className="font-mono font-extrabold text-amber-400 text-sm">
                  −{metrics.openingsAreaM2.toFixed(2)} m²
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2">
                <div className="text-[10px] uppercase font-bold text-slate-500">Net Cladding</div>
                <div className="font-mono font-extrabold text-emerald-400 text-sm">
                  {metrics.netCladdingAreaM2.toFixed(2)} m²
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2">
                <div className="text-[10px] uppercase font-bold text-slate-500">Cutouts</div>
                <div className="font-mono font-extrabold text-sky-400 text-sm">
                  {metrics.openingsCount} pcs
                </div>
              </div>
            </div>

            {metrics.regionBreakdown.length > 1 && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums">
                {metrics.regionBreakdown.map((rb, idx) => (
                  <div key={rb.regionId || idx} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-xs border border-white/25"
                      style={{ backgroundColor: getWallCladdingMeta(rb.claddingType).hex }}
                    />
                    <span className="font-bold text-slate-300">
                      {rb.label || getWallCladdingMeta(rb.claddingType).shortLabel}:
                    </span>
                    <span className="font-mono font-bold text-emerald-400">
                      {rb.netAreaM2.toFixed(2)} m² net
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right/Bottom: Wall Cladding, Roof Link & Opening Parameters */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* Wall Dimensions, Roof Link & Cladding Regions */}
          <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
                Face {facet.code} Height &amp; Finish
              </span>
              <span
                className={`text-[10px] font-bold ${
                  facet.heightSource === 'roof' ? 'text-sky-300' : 'text-slate-400'
                }`}
              >
                {facet.heightSource === 'roof' ? 'Source: Roof Eave' : 'Source: Manual'}
              </span>
            </div>

            {!readOnly && roofMatchInfo && (
              <button
                type="button"
                onClick={handleFitTopToRoof}
                className="w-full py-1.5 px-2.5 rounded-xl bg-sky-950/60 hover:bg-sky-900/70 border border-sky-500/40 text-sky-200 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Fit Top to Roof Eave ({roofMatchInfo.topZ.toFixed(2)}m Z)</span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <label className="bg-slate-950 border border-slate-800 rounded-xl p-2 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block">Wall Height (m)</span>
                <input
                  type="number"
                  step="0.05"
                  min="0.4"
                  max="12"
                  disabled={readOnly}
                  value={+facet.heightM.toFixed(2)}
                  onChange={(e) => handleSetHeight(parseFloat(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs tabular-nums focus:outline-hidden focus:border-sky-400 disabled:opacity-60"
                />
              </label>

              <label className="bg-slate-950 border border-slate-800 rounded-xl p-2 space-y-1">
                <span className="text-[10px] font-bold text-slate-400 block">Bottom Z (m)</span>
                <input
                  type="number"
                  step="0.05"
                  min="-2"
                  max="12"
                  disabled={readOnly}
                  value={+facet.bottomZ.toFixed(2)}
                  onChange={(e) => handleSetBottomZ(parseFloat(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs tabular-nums focus:outline-hidden focus:border-sky-400 disabled:opacity-60"
                />
              </label>
            </div>

            {/* Single vs Mixed Cladding Regions Mode */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Cladding Layout
                </span>
                {!readOnly && (
                  <div className="flex items-center gap-1">
                    {facet.regions && facet.regions.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => onUpdateFacet({ ...facet, regions: undefined })}
                        className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300 cursor-pointer"
                      >
                        Single Finish
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleEnableDadoSplit}
                          className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-sky-300 flex items-center gap-1 cursor-pointer"
                        >
                          <Layers className="w-3 h-3" />
                          <span>Dado Split</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleEnableBaySplit}
                          className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-300 cursor-pointer"
                        >
                          Bay Split
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {facet.regions && facet.regions.length > 0 ? (
                <div className="space-y-1.5">
                  {facet.regions.slice(0, 3).map((reg, rIdx) => {
                    const isHorizDado =
                      facet.regions!.length === 2 &&
                      Math.abs(facet.regions![0].uEndM - facet.lengthM) < 0.05 &&
                      Math.abs(facet.regions![1].uEndM - facet.lengthM) < 0.05;
                    return (
                      <div
                        key={reg.id}
                        className="bg-slate-950 border border-slate-800 rounded-xl p-2 space-y-1.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-200">
                            {reg.label || `Region ${rIdx + 1}`}
                          </span>
                          <select
                            disabled={readOnly}
                            value={reg.claddingType}
                            onChange={(e) =>
                              handleUpdateRegion(reg.id, {
                                claddingType: e.target.value as WallCladdingType
                              })
                            }
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-0.5 text-[11px] font-bold text-white cursor-pointer"
                          >
                            {WALL_CLADDING_OPTIONS.map((opt) => (
                              <option key={opt.type} value={opt.type}>
                                {opt.shortLabel}
                              </option>
                            ))}
                          </select>
                        </div>

                        {rIdx === 0 && (
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 tabular-nums">
                            {isHorizDado ? (
                              <label className="flex items-center gap-1.5">
                                <span>Dado Height (m)</span>
                                <input
                                  type="number"
                                  step="0.05"
                                  min="0.3"
                                  max={+(facet.heightM - 0.3).toFixed(2)}
                                  disabled={readOnly}
                                  value={+reg.vEndM.toFixed(2)}
                                  onChange={(e) =>
                                    handleUpdateRegion(reg.id, { vEndM: parseFloat(e.target.value) })
                                  }
                                  className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono font-bold"
                                />
                              </label>
                            ) : (
                              <label className="flex items-center gap-1.5">
                                <span>Bay Split X (m)</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0.3"
                                  max={+(facet.lengthM - 0.3).toFixed(2)}
                                  disabled={readOnly}
                                  value={+reg.uEndM.toFixed(2)}
                                  onChange={(e) =>
                                    handleUpdateRegion(reg.id, { uEndM: parseFloat(e.target.value) })
                                  }
                                  className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono font-bold"
                                />
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">
                  {WALL_CLADDING_OPTIONS.map((opt) => {
                    const active = facet.claddingType === opt.type;
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        disabled={readOnly}
                        onClick={() => handleSetCladding(opt.type)}
                        className={`px-2 py-1.5 rounded-xl border text-left text-[11px] font-bold flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60 ${
                          active
                            ? 'bg-sky-600/25 border-sky-400 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-xs shrink-0 border border-white/25"
                          style={{ backgroundColor: opt.hex }}
                        />
                        <span className="truncate">{opt.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Openings List & Selected Opening Parameter Editor */}
          <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-3 space-y-2.5 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
                Openings ({facet.openings.length})
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleAddOpening('window')}
                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-sky-300 flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Window</span>
                </button>
              )}
            </div>

            {facet.openings.length === 0 ? (
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400">
                No windows or doors on Wall {facet.code}. Attach an elevation scan or use the toolbar above to place cutouts.
              </div>
            ) : (
              <div className="space-y-1 max-h-32 overflow-y-auto pr-0.5">
                {facet.openings.map((op) => {
                  const isSel = op.id === selectedOpeningId;
                  return (
                    <div
                      key={op.id}
                      onClick={() => setSelectedOpeningId(op.id)}
                      className={`p-2 rounded-xl border flex items-center justify-between gap-2 text-xs cursor-pointer transition-colors ${
                        isSel
                          ? 'bg-sky-950/45 border-sky-500/60 text-white'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[11px] truncate">
                          {op.label || OPENING_STYLE[op.type].label}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                          {op.widthM.toFixed(2)}×{op.heightM.toFixed(2)}m @ {op.distFromStartM.toFixed(2)}m
                        </div>
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleDeleteOpening(op.id);
                          }}
                          className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                          title="Delete opening"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {selectedOpening && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    disabled={readOnly}
                    value={selectedOpening.label || ''}
                    placeholder="Opening label"
                    onChange={(e) =>
                      handleUpdateOpening(selectedOpening.id, { label: e.target.value })
                    }
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-white focus:outline-hidden focus:border-sky-400"
                  />
                  <select
                    disabled={readOnly}
                    value={selectedOpening.type}
                    onChange={(e) => {
                      const nextType = e.target.value as WallOpeningType;
                      handleUpdateOpening(selectedOpening.id, {
                        type: nextType,
                        sillHeightM:
                          nextType === 'door' || nextType === 'garage'
                            ? 0
                            : selectedOpening.sillHeightM === 0
                            ? 0.9
                            : selectedOpening.sillHeightM
                      });
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-slate-200 cursor-pointer"
                  >
                    <option value="window">Window</option>
                    <option value="door">Door</option>
                    <option value="garage">Garage</option>
                    <option value="void">Void</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-1.5 text-[11px] tabular-nums">
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold block">Width (m)</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.2"
                      max={facet.lengthM}
                      disabled={readOnly}
                      value={+selectedOpening.widthM.toFixed(2)}
                      onChange={(e) =>
                        handleUpdateOpening(selectedOpening.id, {
                          widthM: parseFloat(e.target.value)
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold block">Height (m)</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.2"
                      max={facet.heightM}
                      disabled={readOnly}
                      value={+selectedOpening.heightM.toFixed(2)}
                      onChange={(e) =>
                        handleUpdateOpening(selectedOpening.id, {
                          heightM: parseFloat(e.target.value)
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold block">Offset X (m)</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max={facet.lengthM}
                      disabled={readOnly}
                      value={+selectedOpening.distFromStartM.toFixed(2)}
                      onChange={(e) =>
                        handleUpdateOpening(selectedOpening.id, {
                          distFromStartM: parseFloat(e.target.value)
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs"
                    />
                  </label>
                  <label className="space-y-0.5">
                    <span className="text-[10px] text-slate-400 font-bold block">Sill Z (m)</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max={facet.heightM}
                      disabled={readOnly}
                      value={+selectedOpening.sillHeightM.toFixed(2)}
                      onChange={(e) =>
                        handleUpdateOpening(selectedOpening.id, {
                          sillHeightM: parseFloat(e.target.value)
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
