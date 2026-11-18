import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Grid,
  Maximize,
  Plus,
  Square,
  Trash2
} from 'lucide-react';
import {
  WallCladdingType,
  WallFacet,
  WallOpening,
  WallOpeningType
} from '../../types/exactRoofing';
import {
  clampWallOpeningToFacet,
  computeWallFacetMetrics,
  createDefaultWallOpening,
  getWallCladdingMeta,
  WALL_CLADDING_OPTIONS
} from '../../utils/wallCladdingEngine';

interface Props {
  facet: WallFacet;
  facets: WallFacet[];
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
  onSelectFacet,
  onUpdateFacet,
  onBackToPlan,
  readOnly = false
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(
    facet.openings[0]?.id || null
  );
  const [clickPlaceType, setClickPlaceType] = useState<WallOpeningType | null>(null);

  const metrics = useMemo(() => computeWallFacetMetrics(facet), [facet]);
  const claddingMeta = useMemo(
    () => getWallCladdingMeta(facet.claddingType),
    [facet.claddingType]
  );

  const currentIdx = facets.findIndex((f) => f.id === facet.id);
  const prevFacet = currentIdx > 0 ? facets[currentIdx - 1] : facets[facets.length - 1];
  const nextFacet =
    currentIdx >= 0 && currentIdx < facets.length - 1 ? facets[currentIdx + 1] : facets[0];

  const selectedOpening = useMemo(
    () => facet.openings.find((o) => o.id === selectedOpeningId) || null,
    [facet.openings, selectedOpeningId]
  );

  const handleSetCladding = (claddingType: WallCladdingType) => {
    if (readOnly) return;
    onUpdateFacet({ ...facet, claddingType });
  };

  const handleSetHeight = (nextHeightM: number) => {
    if (readOnly || !Number.isFinite(nextHeightM)) return;
    const h = +Math.max(0.4, Math.min(12, nextHeightM)).toFixed(3);
    const topZ = +(facet.bottomZ + h).toFixed(3);
    const updatedOpenings = facet.openings.map((op) =>
      clampWallOpeningToFacet({ lengthM: facet.lengthM, heightM: h }, op)
    );
    onUpdateFacet({
      ...facet,
      heightM: h,
      topZ,
      openings: updatedOpenings
    });
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

  // True-scale SVG elevation layout (1 unit = 100 px per metre cleanly normalized in viewBox)
  const pxPerM = 100;
  const padL = 78;
  const padR = 44;
  const padT = 36;
  const padB = 64;
  const wallW = Math.max(20, facet.lengthM * pxPerM);
  const wallH = Math.max(20, facet.heightM * pxPerM);
  const svgW = padL + wallW + padR;
  const svgH = padT + wallH + padB;

  const toSvgX = (uM: number) => padL + uM * pxPerM;
  const toSvgY = (vM: number) => padT + (facet.heightM - vM) * pxPerM;

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!clickPlaceType || readOnly || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = svgW / Math.max(1, rect.width);
    const svgX = (e.clientX - rect.left) * scaleX;
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
    for (let y = 0; y <= facet.heightM + 1e-4; y += 1) {
      arr.push(+y.toFixed(2));
    }
    if (arr.length === 0 || Math.abs(arr[arr.length - 1] - facet.heightM) > 0.15) {
      arr.push(+facet.heightM.toFixed(2));
    }
    return arr;
  }, [facet.heightM]);

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
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-white truncate">
                Wall {facet.code} Elevation
              </span>
              {facet.roofEdgeId && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-950/70 border border-sky-500/40 text-sky-300">
                  Roof Linked
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 font-mono tabular-nums">
              {facet.lengthM.toFixed(2)}m L × {facet.heightM.toFixed(2)}m H · {claddingMeta.label}
            </div>
          </div>
        </div>

        {/* Face Stepper (< Prev / Next >) */}
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
                      onClick={() =>
                        setClickPlaceType((prev) => (prev === item.type ? null : item.type))
                      }
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
                clickPlaceType ? 'cursor-crosshair' : 'cursor-default'
              }`}
              onClick={handleSvgClick}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <pattern
                  id={`hatch-${facet.id}`}
                  width={facet.claddingType === 'profiled_metal' ? 14 : 24}
                  height={facet.claddingType === 'weatherboard' ? 16 : 24}
                  patternUnits="userSpaceOnUse"
                >
                  {facet.claddingType === 'weatherboard' && (
                    <line x1="0" y1="15" x2="24" y2="15" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
                  )}
                  {facet.claddingType === 'profiled_metal' && (
                    <line x1="7" y1="0" x2="7" y2="24" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
                  )}
                  {facet.claddingType === 'brick' && (
                    <>
                      <line x1="0" y1="12" x2="24" y2="12" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                      <line x1="12" y1="0" x2="12" y2="12" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                      <line x1="0" y1="12" x2="0" y2="24" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                    </>
                  )}
                  {facet.claddingType === 'fibre_cement' && (
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

              {/* Main Wall Cladding Area */}
              <rect
                x={padL}
                y={padT}
                width={wallW}
                height={wallH}
                fill={claddingMeta.hex}
                fillOpacity={facet.claddingType === 'none' ? 0.28 : 0.72}
                stroke={facet.claddingType === 'none' ? '#64748b' : '#e2e8f0'}
                strokeWidth="2.5"
              />
              <rect
                x={padL}
                y={padT}
                width={wallW}
                height={wallH}
                fill={`url(#hatch-${facet.id})`}
                pointerEvents="none"
              />

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

              {/* Openings Cutouts */}
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
                    className="cursor-pointer"
                    onClick={(ev) => {
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
            </svg>
          </div>

          {/* Live Facet Area Breakdown */}
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
        </div>

        {/* Right/Bottom: Wall Cladding & Opening Parameters */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* Wall Dimensions & Cladding Type */}
          <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-3 space-y-3">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300">
              Face {facet.code} Cladding &amp; Height
            </div>

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

            <div className="space-y-1.5">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Cladding Material
              </div>
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
                No windows or doors on Wall {facet.code}. Use the toolbar above to add parametric cutouts.
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
