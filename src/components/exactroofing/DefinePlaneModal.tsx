import React, { useState, useEffect } from 'react';
import { EdgeType, PlanEdge, RoofPlane } from '../../types/exactRoofing';
import {
  dist,
  ROOF_LINE_TYPE_CATALOG,
  getRoofEdgeTypeMeta
} from '../../utils/exactRoofingEngine';
import { X, ArrowRight, ArrowLeft, Check, PenTool, Tag, Compass, AlignJustify } from 'lucide-react';

interface Props {
  edge: PlanEdge | null;
  outlineEdges?: PlanEdge[];
  existingPlane?: RoofPlane | null;
  existingPlanes?: RoofPlane[];
  selectedEdgeIds?: string[];
  isOpen: boolean;
  onClose: () => void;
  onClassifyEdge?: (edgeId: string, edgeType: EdgeType) => void;
  onBatchClassifyEdges?: (edgeIds: string[], edgeType: EdgeType) => void;
  onBatchUpdateEdges?: (
    edgeIds: string[],
    updates: {
      edgeType?: EdgeType;
      pitchDeg?: number;
      eaveHeightM?: number;
      hasWall?: boolean;
      eaveSetbackM?: number;
      underlapSide?: 'left' | 'right';
    }
  ) => void;
  onSavePlane: (options: {
    edgeType: EdgeType;
    eaveEdgeId: string;
    sheetRunEdgeId: string;
    pitchDeg: number;
    underlapSide: 'left' | 'right';
    eaveHeightM: number;
    eaveLengthM?: number;
    hasWall?: boolean;
    eaveSetbackM?: number;
    name: string;
  }) => void;
  onAssignFlashing?: (edge: PlanEdge) => void;
}

const COMMON_PITCHES = [5, 8, 12, 15, 18, 22.5, 25, 30];
const COMMON_HEIGHTS = [
  { label: '2.7m (1F)', value: 2.7 },
  { label: '4.1m (Split)', value: 4.1 },
  { label: '5.4m (2F)', value: 5.4 }
];
const COMMON_SETBACKS = [
  { label: '0m Flush', value: 0 },
  { label: '0.45m Std', value: 0.45 },
  { label: '0.6m Deep', value: 0.6 }
];

function getEdgeShortLabel(e: PlanEdge, index: number): string {
  const len = dist(e.from, e.to).toFixed(2);
  const code = getRoofEdgeTypeMeta(e.type).code;
  return `Side ${index + 1} [${code}] · ${len}m`;
}

export const DefinePlaneModal: React.FC<Props> = ({
  edge,
  outlineEdges,
  existingPlane,
  existingPlanes = [],
  selectedEdgeIds = [],
  isOpen,
  onClose,
  onClassifyEdge,
  onBatchClassifyEdges,
  onBatchUpdateEdges,
  onSavePlane,
  onAssignFlashing
}) => {
  const [edgeType, setEdgeType] = useState<EdgeType>('unclassified');
  const [applyScope, setApplyScope] = useState<'single' | 'selected' | 'level'>('single');
  const [eaveEdgeId, setEaveEdgeId] = useState<string>('');
  const [sheetRunEdgeId, setSheetRunEdgeId] = useState<string>('');
  const [sheetFollowsEave, setSheetFollowsEave] = useState<boolean>(true);
  const [pitch, setPitch] = useState<number>(22.5);
  const [underlap, setUnderlap] = useState<'left' | 'right'>('left');
  const [eaveHeight, setEaveHeight] = useState<number>(2.7);
  const [eaveLength, setEaveLength] = useState<number>(6.0);
  const [hasWall, setHasWall] = useState<boolean>(true);
  const [eaveSetbackM, setEaveSetbackM] = useState<number>(0);
  const [name, setName] = useState<string>('');

  const availableEdges = outlineEdges && outlineEdges.length > 0 ? outlineEdges : edge ? [edge] : [];

  useEffect(() => {
    if (!isOpen || !edge) return;
    const edgesList = outlineEdges && outlineEdges.length > 0 ? outlineEdges : [edge];

    const initialType: EdgeType = edge.type || 'unclassified';
    const matchingPlaneForEdge =
      existingPlane ||
      existingPlanes.find((p) => p.eaveEdgeId === edge.id) ||
      null;

    let initialEaveId = matchingPlaneForEdge?.eaveEdgeId;
    if (!initialEaveId) {
      if (initialType === 'outline') {
        initialEaveId = edge.id;
      } else {
        const firstExistingEave = edgesList.find((e) => e.type === 'outline');
        initialEaveId = firstExistingEave?.id || edge.id;
      }
    }

    const activePlaneForEave =
      matchingPlaneForEdge ||
      existingPlanes.find((p) => p.eaveEdgeId === initialEaveId) ||
      null;

    const targetEaveObj = edgesList.find((e) => e.id === initialEaveId) || edge;
    const rawLen = +dist(targetEaveObj.from, targetEaveObj.to).toFixed(2);
    const initialSheetEdgeId = activePlaneForEave?.sheetRunEdgeId || initialEaveId;

    setEdgeType(initialType);
    setApplyScope('single');
    setEaveEdgeId(initialEaveId);
    setSheetRunEdgeId(initialSheetEdgeId);
    setSheetFollowsEave(initialSheetEdgeId === initialEaveId);
    setPitch(activePlaneForEave?.pitchDeg ?? 22.5);
    setUnderlap(activePlaneForEave?.underlapSide ?? 'left');
    setEaveHeight(activePlaneForEave?.eaveHeightM ?? targetEaveObj.eaveHeightM ?? 2.7);
    setEaveLength(rawLen);
    setHasWall(targetEaveObj.hasWall !== false);
    setEaveSetbackM(
      typeof targetEaveObj.eaveSetbackM === 'number' && Number.isFinite(targetEaveObj.eaveSetbackM)
        ? targetEaveObj.eaveSetbackM
        : 0
    );
    setName(
      activePlaneForEave?.name ||
        `Roof Area [${targetEaveObj.id.replace(/^l\d+__/, '').replace('edge-out-', 'Side ')}]`
    );
  }, [isOpen, edge, outlineEdges, existingPlane, existingPlanes]);

  if (!isOpen || !edge) return null;

  const selectedEaveObj = availableEdges.find((e) => e.id === eaveEdgeId) || edge;
  const originalEdgeLenM = +dist(selectedEaveObj.from, selectedEaveObj.to).toFixed(2);
  const effectiveLenM = Math.max(0.5, Number.isFinite(eaveLength) ? eaveLength : originalEdgeLenM);
  const slopeMultiplier = +(1 / Math.cos((pitch * Math.PI) / 180)).toFixed(3);
  const estimatedSlopeM = +(effectiveLenM * 0.45 * slopeMultiplier).toFixed(2);
  const clickedEdgeIndex = Math.max(
    0,
    availableEdges.findIndex((e) => e.id === edge.id)
  );

  const handleSelectEave = (nextEaveId: string) => {
    setEaveEdgeId(nextEaveId);
    const targetEave = availableEdges.find((e) => e.id === nextEaveId);
    if (targetEave) {
      setEaveLength(+dist(targetEave.from, targetEave.to).toFixed(2));
      setHasWall(targetEave.hasWall !== false);
      setEaveSetbackM(
        typeof targetEave.eaveSetbackM === 'number' && Number.isFinite(targetEave.eaveSetbackM)
          ? targetEave.eaveSetbackM
          : 0
      );
      const planeForTarget = existingPlanes.find((p) => p.eaveEdgeId === nextEaveId);
      if (planeForTarget) {
        setPitch(planeForTarget.pitchDeg);
        setUnderlap(planeForTarget.underlapSide);
        setEaveHeight(planeForTarget.eaveHeightM ?? targetEave.eaveHeightM ?? 2.7);
        setName(planeForTarget.name);
      } else {
        setEaveHeight(targetEave.eaveHeightM ?? 2.7);
        setName(`Roof Area [${nextEaveId.replace(/^l\d+__/, '').replace('edge-out-', 'Side ')}]`);
      }
    }
    if (sheetFollowsEave) {
      setSheetRunEdgeId(nextEaveId);
    }
  };

  const handleSelectSheetRunEdge = (nextSheetEdgeId: string) => {
    setSheetRunEdgeId(nextSheetEdgeId);
    setSheetFollowsEave(nextSheetEdgeId === eaveEdgeId);
  };

  const resolveScopeTargetIds = (): string[] => {
    if (applyScope === 'selected' && selectedEdgeIds.length >= 2) {
      return selectedEdgeIds;
    }
    if (applyScope === 'level') {
      return availableEdges.map((ed) => ed.id);
    }
    return [edge.id];
  };

  const handleClassifyOnly = () => {
    const targetIds = resolveScopeTargetIds();
    if (targetIds.length > 1 && onBatchClassifyEdges) {
      onBatchClassifyEdges(targetIds, edgeType);
      onClose();
      return;
    }
    if (!onClassifyEdge) return;
    onClassifyEdge(edge.id, edgeType);
    onClose();
  };

  const handleSave = () => {
    const targetIds = resolveScopeTargetIds();
    const clampedZ = Math.max(0.5, Math.min(20, Number(eaveHeight) || 2.7));
    const clampedSetback = +Math.max(0, Math.min(3.0, Number(eaveSetbackM) || 0)).toFixed(2);
    if (targetIds.length > 1 && onBatchUpdateEdges) {
      onBatchUpdateEdges(targetIds, {
        edgeType,
        pitchDeg: pitch,
        eaveHeightM: clampedZ,
        hasWall,
        eaveSetbackM: clampedSetback,
        underlapSide: underlap
      });
      onClose();
      return;
    }
    onSavePlane({
      edgeType,
      eaveEdgeId: eaveEdgeId || edge.id,
      sheetRunEdgeId: sheetRunEdgeId || eaveEdgeId || edge.id,
      pitchDeg: pitch,
      underlapSide: underlap,
      eaveHeightM: clampedZ,
      eaveLengthM:
        Math.abs(effectiveLenM - originalEdgeLenM) > 0.02 ? +effectiveLenM.toFixed(2) : undefined,
      hasWall,
      eaveSetbackM: clampedSetback,
      name: name.trim() || `Roof Area [${eaveEdgeId || edge.id}]`
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 text-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-white truncate">
              Roof Edge &amp; Plane Setup
            </h3>
            <p className="text-xs text-slate-400 tabular-nums truncate">
              Clicked Side {clickedEdgeIndex + 1} · Eave{' '}
              <span className="font-mono text-white font-bold">{effectiveLenM}m</span> · Z:{' '}
              <span className="font-mono text-amber-400 font-bold">{eaveHeight.toFixed(1)}m</span> · Slope:{' '}
              <span className="font-mono text-sky-400 font-bold">~{estimatedSlopeM}m</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 font-bold transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* STEP 1: CLASSIFY CLICKED BOUNDARY EDGE */}
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-white">
                <Tag className="w-3.5 h-3.5 text-sky-400" />
                <span>1. Line / Boundary Type (Side {clickedEdgeIndex + 1})</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                {dist(edge.from, edge.to).toFixed(2)}m
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {ROOF_LINE_TYPE_CATALOG.map((cls) => {
                const isActive = edgeType === cls.edgeType;
                return (
                  <button
                    key={cls.edgeType}
                    type="button"
                    onClick={() => setEdgeType(cls.edgeType)}
                    title={cls.label}
                    className={`py-2 px-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      isActive
                        ? 'bg-sky-600/25 text-white border-sky-400 shadow-xs'
                        : 'bg-slate-800/80 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cls.colorHex }}
                    />
                    <span className="font-mono font-black text-[10px]">{cls.code}</span>
                    <span className="truncate">{cls.shortLabel}</span>
                  </button>
                );
              })}
            </div>
            {(onBatchClassifyEdges || onBatchUpdateEdges) && availableEdges.length > 1 && (
              <div className="pt-1 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Apply Scope
                </span>
                <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setApplyScope('single')}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                      applyScope === 'single'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    This Edge
                  </button>
                  {selectedEdgeIds.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => setApplyScope('selected')}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                        applyScope === 'selected'
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {selectedEdgeIds.length} Selected
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setApplyScope('level')}
                    className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                      applyScope === 'level'
                        ? 'bg-amber-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    All {availableEdges.length} on Level
                  </button>
                </div>
              </div>
            )}
            <p className="text-[10px] text-slate-400">
              Classifying a boundary edge labels its CAD type without changing downhill fall until you select the eave below.
            </p>
          </div>

          {/* STEP 2 & 3: EXACTROOF EAVE CHOICE (FALL) & SHEET RUN DIRECTION */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-slate-950/70 border border-emerald-500/30 space-y-1.5">
              <label className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" />
                <span>2. Which Edge is the Eave?</span>
              </label>
              <select
                value={eaveEdgeId}
                onChange={(e) => handleSelectEave(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-white font-semibold text-xs focus:outline-hidden focus:border-emerald-400 cursor-pointer tabular-nums"
              >
                {availableEdges.map((ed, idx) => (
                  <option key={ed.id} value={ed.id}>
                    {getEdgeShortLabel(ed, idx)}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400">
                Sets downhill fall &amp; gutter line for this roof plane.
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950/70 border border-sky-500/30 space-y-1.5">
              <label className="text-[10px] text-sky-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <AlignJustify className="w-3.5 h-3.5" />
                <span>3. Sheets Perpendicular To?</span>
              </label>
              <select
                value={sheetRunEdgeId}
                onChange={(e) => handleSelectSheetRunEdge(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-white font-semibold text-xs focus:outline-hidden focus:border-sky-400 cursor-pointer tabular-nums"
              >
                {availableEdges.map((ed, idx) => (
                  <option key={ed.id} value={ed.id}>
                    {getEdgeShortLabel(ed, idx)}
                    {ed.id === eaveEdgeId ? ' (Eave Default)' : ''}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400">
                {sheetRunEdgeId === eaveEdgeId
                  ? 'Standard: sheets lay 90° to eave.'
                  : 'Custom rib angle perpendicular to chosen edge.'}
              </p>
            </div>
          </div>

          {/* 4. EAVE WALL LENGTH & Z-HEIGHT */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
                Eave Edge Length (m)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="40"
                value={eaveLength}
                onChange={(e) => setEaveLength(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-hidden focus:border-blue-500 text-xs tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-amber-400 font-bold block uppercase tracking-wider">
                Eave Height Z (m)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="15.0"
                value={eaveHeight}
                onChange={(e) => setEaveHeight(Number(e.target.value))}
                className="w-full bg-slate-800 border border-amber-500/40 rounded-xl px-3 py-2 text-white font-mono font-bold focus:outline-hidden focus:border-amber-400 text-xs tabular-nums"
              />
            </div>
          </div>

          {/* Quick Height Z Presets */}
          <div className="grid grid-cols-3 gap-1.5">
            {COMMON_HEIGHTS.map((h) => (
              <button
                key={h.value}
                type="button"
                onClick={() => setEaveHeight(h.value)}
                className={`py-1.5 rounded-lg font-bold text-[11px] tabular-nums transition-all cursor-pointer ${
                  Math.abs(eaveHeight - h.value) < 0.05
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>

          {/* WALL BELOW ROOF & EAVE WIDTH SETBACK */}
          <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold text-white">Wall Below Roof</div>
                <div className="text-[10px] text-slate-400">
                  Sits underneath slope · Set back by eave width
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHasWall(!hasWall)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold cursor-pointer transition-all ${
                  hasWall
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                }`}
              >
                {hasWall ? 'Wall ON' : 'Wall OFF'}
              </button>
            </div>

            {hasWall && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Eave Width / Setback (m)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="3"
                    value={eaveSetbackM}
                    onChange={(e) => setEaveSetbackM(Math.max(0, Math.min(3, Number(e.target.value) || 0)))}
                    className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-right text-white font-mono font-bold text-xs tabular-nums focus:outline-hidden focus:border-amber-400"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {COMMON_SETBACKS.map((sb) => (
                    <button
                      key={sb.value}
                      type="button"
                      onClick={() => setEaveSetbackM(sb.value)}
                      className={`py-1 rounded-lg font-bold text-[10px] tabular-nums cursor-pointer transition-all ${
                        Math.abs(eaveSetbackM - sb.value) < 0.02
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
                      }`}
                    >
                      {sb.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* PITCH SELECTOR */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Roof Pitch: <span className="text-white font-mono text-sm tabular-nums">{pitch}°</span>
              </label>
              <span className="text-[10px] text-slate-400 tabular-nums">
                Rise / Run 1:{Math.round(1 / Math.tan((pitch * Math.PI) / 180))} (×{slopeMultiplier})
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {COMMON_PITCHES.map((deg) => (
                <button
                  key={deg}
                  type="button"
                  onClick={() => setPitch(deg)}
                  className={`py-2 rounded-xl font-bold font-mono text-xs tabular-nums transition-all cursor-pointer ${
                    pitch === deg
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 border border-slate-700/60'
                  }`}
                >
                  {deg}°
                </button>
              ))}
            </div>

            <input
              type="range"
              min="3"
              max="45"
              step="0.5"
              value={pitch}
              onChange={(e) => setPitch(Number(e.target.value))}
              className="w-full accent-blue-500 cursor-pointer"
            />
          </div>

          {/* LAY DIRECTION (LEFT / RIGHT) */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Lay Direction
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setUnderlap('left')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  underlap === 'left'
                    ? 'bg-blue-600/20 border-blue-500 text-white shadow-xs'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs mb-1">
                  <span className="flex items-center gap-1.5">
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                    <span>Left to Right</span>
                  </span>
                  {underlap === 'left' && <Check className="w-4 h-4 text-blue-400" />}
                </div>
                <div className="text-[10px] text-slate-400">
                  Standard laying order
                </div>
              </button>

              <button
                type="button"
                onClick={() => setUnderlap('right')}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  underlap === 'right'
                    ? 'bg-blue-600/20 border-blue-500 text-white shadow-xs'
                    : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between font-bold text-xs mb-1">
                  <span className="flex items-center gap-1.5">
                    <ArrowLeft className="w-4 h-4 text-purple-400" />
                    <span>Right to Left</span>
                  </span>
                  {underlap === 'right' && <Check className="w-4 h-4 text-purple-400" />}
                </div>
                <div className="text-[10px] text-slate-400">
                  Reverses lap for prevailing wind
                </div>
              </button>
            </div>
          </div>

          {/* ROOF AREA NAME */}
          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">
              Roof Area Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Upper North, Lower Terrace"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-semibold focus:outline-hidden focus:border-blue-500 text-xs"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {onAssignFlashing && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAssignFlashing(edge);
                }}
                className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <PenTool className="w-3.5 h-3.5" />
                <span>Flashing</span>
              </button>
            )}
            {(onClassifyEdge || onBatchClassifyEdges) && (
              <button
                type="button"
                onClick={handleClassifyOnly}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 font-bold text-xs transition-colors cursor-pointer"
              >
                {applyScope === 'single' ? 'Save Edge Type Only' : `Classify (${resolveScopeTargetIds().length})`}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 font-extrabold text-white text-xs shadow-md transition-all cursor-pointer"
            >
              {applyScope === 'single' ? 'Apply Plane' : `Apply to ${resolveScopeTargetIds().length}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

