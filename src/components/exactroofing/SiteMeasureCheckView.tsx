import React, { useMemo, useState } from 'react';
import { Project } from '../../types/crm';
import {
  AssignableRoofLine,
  LayoutResult,
  RoofAsset,
  RoofBomSummary,
  RoofFlashingAssignment,
  RoofPlane
} from '../../types/exactRoofing';
import { getFlashingKindDisplayLabel } from '../../utils/exactRoofingFlashingBridge';
import { dist } from '../../utils/exactRoofingEngine';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Compass,
  Lock,
  PenTool,
  Ruler,
  Scissors,
  ShoppingCart,
  Wrench
} from 'lucide-react';

interface Props {
  project?: Project;
  planes: RoofPlane[];
  layout: LayoutResult | null;
  bom: RoofBomSummary;
  assignableLines: AssignableRoofLine[];
  flashingAssignments: RoofFlashingAssignment[];
  assets: RoofAsset[];
  measureLocked: boolean;
  onSelectPlane: (planeId: string) => void;
  onUpdatePlaneOrderedSheetLength?: (planeId: string, lengthM: number | undefined) => void;
  onOpenPlanTab: () => void;
  onOpenPlaneEditor: (plane: RoofPlane) => void;
  onSelectLineForFlashing: (lineId: string) => void;
  onOpenOrderModal: () => void;
  onRecalculateLayout: () => void;
  onConfirmLockMeasure: () => void;
}

export const SiteMeasureCheckView: React.FC<Props> = ({
  project,
  planes,
  layout,
  bom,
  assignableLines,
  flashingAssignments,
  assets,
  measureLocked,
  onSelectPlane,
  onUpdatePlaneOrderedSheetLength,
  onOpenPlanTab,
  onOpenPlaneEditor,
  onSelectLineForFlashing,
  onOpenOrderModal,
  onRecalculateLayout,
  onConfirmLockMeasure
}) => {
  const [checkedFacesOk, setCheckedFacesOk] = useState<boolean>(false);
  const [checkedSheetsOk, setCheckedSheetsOk] = useState<boolean>(false);
  const [checkedFlashingsOk, setCheckedFlashingsOk] = useState<boolean>(false);
  const [draftSheetMmByPlane, setDraftSheetMmByPlane] = useState<Record<string, string>>({});

  const displayPlanes = useMemo(
    () => (layout?.effectivePlanes && layout.effectivePlanes.length > 0 ? layout.effectivePlanes : planes),
    [layout, planes]
  );

  const assignmentByLineId = useMemo(() => {
    const m = new Map<string, RoofFlashingAssignment>();
    flashingAssignments.forEach((a) => m.set(a.lineId, a));
    return m;
  }, [flashingAssignments]);

  const structuralLines = useMemo(
    () => assignableLines.filter((l) => l.flashingKind !== 'eave'),
    [assignableLines]
  );
  const eaveLines = useMemo(
    () => assignableLines.filter((l) => l.flashingKind === 'eave'),
    [assignableLines]
  );

  const missingStructuralFlashings = useMemo(
    () => structuralLines.filter((l) => !assignmentByLineId.has(l.lineId)),
    [structuralLines, assignmentByLineId]
  );

  const stepsDoneCount =
    (checkedFacesOk ? 1 : 0) +
    (checkedSheetsOk ? 1 : 0) +
    (checkedFlashingsOk ? 1 : 0);

  return (
    <div className="space-y-4 pb-6 font-sans text-white">
      {/* 1. HEADER & SITE MEASURE PURPOSE */}
      <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-sky-400">
            <Ruler className="w-4 h-4" />
            <span>Pre-Order Site Measure Check</span>
            {measureLocked && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">
                LOCKED
              </span>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-black text-white">
            Confirm Roof Elements, Sheet Lengths &amp; Flashings Before Ordering
          </h2>
          <p className="text-xs text-slate-400">
            {project
              ? `${project.projectNumber} · ${project.title}${project.siteAddress ? ` · ${project.siteAddress}` : ''}`
              : 'Verify on-site dimensions against the modeled plan before dispatching material orders.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenOrderModal}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg cursor-pointer whitespace-nowrap"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Open Simple BOM &amp; Order</span>
          </button>

          {!measureLocked && (
            <button
              type="button"
              onClick={onConfirmLockMeasure}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg cursor-pointer whitespace-nowrap"
            >
              <Lock className="w-4 h-4" />
              <span>Confirm Measure &amp; Lock</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. 4-STEP VERIFICATION STATUS STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={() => setCheckedFacesOk((v) => !v)}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start justify-between gap-2 ${
            checkedFacesOk
              ? 'bg-emerald-950/40 border-emerald-500/50'
              : 'bg-[#101726] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-400">1. Roof Faces &amp; Pitches</div>
            <div className="text-lg font-black text-white font-mono tabular-nums mt-0.5">
              {displayPlanes.length} Faces · {bom.totalRoofAreaM2.toFixed(1)} m²
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {checkedFacesOk ? 'Verified on site' : 'Tap to mark faces verified'}
            </div>
          </div>
          <CheckCircle2
            className={`w-5 h-5 shrink-0 ${checkedFacesOk ? 'text-emerald-400' : 'text-slate-600'}`}
          />
        </button>

        <button
          type="button"
          onClick={() => setCheckedSheetsOk((v) => !v)}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start justify-between gap-2 ${
            checkedSheetsOk
              ? 'bg-emerald-950/40 border-emerald-500/50'
              : 'bg-[#101726] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-400">2. Sheet Cut Lengths</div>
            <div className="text-lg font-black text-sky-400 font-mono tabular-nums mt-0.5">
              {bom.totalSheetsCount} sheets · {bom.totalOrderedLm.toFixed(1)} m
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {checkedSheetsOk ? 'Sheet lengths checked' : 'Tap to mark lengths verified'}
            </div>
          </div>
          <CheckCircle2
            className={`w-5 h-5 shrink-0 ${checkedSheetsOk ? 'text-emerald-400' : 'text-slate-600'}`}
          />
        </button>

        <button
          type="button"
          onClick={() => setCheckedFlashingsOk((v) => !v)}
          className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start justify-between gap-2 ${
            checkedFlashingsOk
              ? 'bg-emerald-950/40 border-emerald-500/50'
              : missingStructuralFlashings.length > 0
              ? 'bg-amber-950/25 border-amber-500/40'
              : 'bg-[#101726] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-400">3. Flashings &amp; Girths</div>
            <div className="text-lg font-black text-white font-mono tabular-nums mt-0.5">
              {flashingAssignments.length}/{structuralLines.length || assignableLines.length} Assigned
            </div>
            <div
              className={`text-[11px] mt-0.5 ${
                missingStructuralFlashings.length > 0 ? 'text-amber-300 font-semibold' : 'text-slate-400'
              }`}
            >
              {missingStructuralFlashings.length > 0
                ? `${missingStructuralFlashings.length} key lines still unassigned`
                : `${bom.totalFlashingLm.toFixed(1)} lm ready`}
            </div>
          </div>
          <CheckCircle2
            className={`w-5 h-5 shrink-0 ${checkedFlashingsOk ? 'text-emerald-400' : 'text-slate-600'}`}
          />
        </button>

        <div className="p-3.5 rounded-2xl border bg-[#101726] border-slate-800 flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-400">4. Order Readiness</div>
            <div className="text-lg font-black text-emerald-400 font-mono tabular-nums mt-0.5">
              {stepsDoneCount}/3 Checked
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {bom.estimatedScrewBoxes} screw boxes · {bom.estimatedUnderlayRolls} UL rolls
            </div>
          </div>
          <Wrench className="w-5 h-5 text-slate-500 shrink-0" />
        </div>
      </div>

      {/* 3. ROOF FACES, EAVE WIDTHS & TRUE SLOPE SHEET LENGTHS */}
      <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-sky-400" />
              <span>Section 1: Roof Faces, Pitches &amp; True Slope Lengths</span>
            </h3>
            <p className="text-xs text-slate-400">
              Confirm field tape measurements match these eave widths, wall setbacks, and sloped sheet runs.
            </p>
          </div>

          {!measureLocked && (
            <button
              type="button"
              onClick={onOpenPlanTab}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
            >
              Edit on Plan
            </button>
          )}
        </div>

        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Face</th>
                <th className="py-2.5 px-3">Tier / Eave Z</th>
                <th className="py-2.5 px-3 text-right">Eave Width</th>
                <th className="py-2.5 px-3 text-right">Modeled Run</th>
                <th className="py-2.5 px-3 text-right">Order Sheet (mm)</th>
                <th className="py-2.5 px-3 text-right">Pitch</th>
                <th className="py-2.5 px-3 text-right">Area</th>
                <th className="py-2.5 px-3">Lay Dir</th>
                {!measureLocked && <th className="py-2.5 px-3 text-right">Adjust</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {displayPlanes.map((p) => {
                const eaveW =
                  p.eaveWidthM ??
                  (p.planPolygon[1] ? dist(p.planPolygon[0], p.planPolygon[1]) : 0);
                const modeledMm = Math.round((p.slopeLength || 0) * 1000);
                const orderedMm = p.orderedSheetLengthM
                  ? Math.round(p.orderedSheetLengthM * 1000)
                  : null;
                const isOverridden = orderedMm !== null && orderedMm !== modeledMm;
                const effectiveMm = orderedMm ?? modeledMm;
                const draftVal =
                  draftSheetMmByPlane[p.id] !== undefined
                    ? draftSheetMmByPlane[p.id]
                    : effectiveMm > 0
                    ? String(effectiveMm)
                    : '';

                const commitRowSheetMm = () => {
                  if (!onUpdatePlaneOrderedSheetLength) return;
                  const raw = (draftSheetMmByPlane[p.id] ?? '').trim();
                  if (!raw) {
                    onUpdatePlaneOrderedSheetLength(p.id, undefined);
                    setDraftSheetMmByPlane((prev) => {
                      const next = { ...prev };
                      delete next[p.id];
                      return next;
                    });
                    return;
                  }
                  const parsed = parseFloat(raw);
                  if (!Number.isFinite(parsed) || parsed <= 0) {
                    setDraftSheetMmByPlane((prev) => {
                      const next = { ...prev };
                      delete next[p.id];
                      return next;
                    });
                    return;
                  }
                  const lengthM =
                    parsed >= 100
                      ? +(Math.round(parsed) / 1000).toFixed(3)
                      : parsed >= 0.3 && parsed <= 40
                      ? +parsed.toFixed(3)
                      : 0;
                  if (lengthM < 0.3 || lengthM > 40) return;
                  const nextMm = Math.round(lengthM * 1000);
                  if (modeledMm > 0 && nextMm === modeledMm) {
                    onUpdatePlaneOrderedSheetLength(p.id, undefined);
                  } else {
                    onUpdatePlaneOrderedSheetLength(p.id, +(nextMm / 1000).toFixed(3));
                  }
                  setDraftSheetMmByPlane((prev) => {
                    const next = { ...prev };
                    delete next[p.id];
                    return next;
                  });
                };

                return (
                  <tr
                    key={p.id}
                    onClick={() => onSelectPlane(p.id)}
                    className="hover:bg-slate-900/60 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-3 font-bold text-white whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: p.color || '#3b82f6' }}
                        />
                        <span>
                          {p.code} · {p.name}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-amber-300 tabular-nums whitespace-nowrap">
                      {p.levelCode || 'L1'} · {(p.eaveHeightM ?? 2.7).toFixed(2)}m
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-white tabular-nums">
                      {eaveW.toFixed(2)} m
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300 tabular-nums whitespace-nowrap">
                      {modeledMm}mm
                    </td>
                    <td
                      className="py-2 px-3 text-right font-mono tabular-nums whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {!measureLocked && onUpdatePlaneOrderedSheetLength ? (
                        <div className="inline-flex items-center gap-1 justify-end">
                          <input
                            type="number"
                            inputMode="numeric"
                            step="5"
                            min="300"
                            max="30000"
                            value={draftVal}
                            onFocus={(e) => e.currentTarget.select()}
                            onChange={(e) =>
                              setDraftSheetMmByPlane((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            onBlur={commitRowSheetMm}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                commitRowSheetMm();
                                (e.currentTarget as HTMLInputElement).blur();
                              }
                            }}
                            aria-label={`Order sheet length mm for ${p.code}`}
                            className={`w-20 bg-slate-950 border rounded-lg px-2 py-1 text-right font-mono font-black text-xs tabular-nums focus:outline-hidden ${
                              isOverridden
                                ? 'border-emerald-500/60 text-emerald-300 focus:border-emerald-400'
                                : 'border-slate-700 text-sky-300 focus:border-sky-400'
                            }`}
                          />
                          {isOverridden && (
                            <button
                              type="button"
                              onClick={() => onUpdatePlaneOrderedSheetLength(p.id, undefined)}
                              className="px-1.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-sans font-bold cursor-pointer"
                              title={`Reset to ${modeledMm}mm`}
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className={isOverridden ? 'font-black text-emerald-300' : 'font-bold text-sky-300'}>
                          {effectiveMm}mm
                          {isOverridden ? ' *' : ''}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-200 tabular-nums">
                      {p.pitchDeg}°
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-300 tabular-nums">
                      {(p.area || 0).toFixed(1)} m²
                    </td>
                    <td className="py-2.5 px-3 text-slate-300 whitespace-nowrap">
                      {p.underlapSide === 'left' ? 'Left → Right' : 'Right → Left'}
                    </td>
                    {!measureLocked && (
                      <td
                        className="py-2.5 px-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenPlaneEditor(p)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white text-[11px] font-bold cursor-pointer"
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. SHEET LENGTHS TO ORDER */}
      <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Scissors className="w-4 h-4 text-sky-400" />
              <span>Section 2: Ordered Sheet Lengths ({bom.totalSheetsCount} Sheets · {bom.totalOrderedLm.toFixed(1)} lm ordered)</span>
            </h3>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              {project?.profile || 'TRS Corrugate 0.55mm'} · {project?.colorName || 'FlaxPod'} · Net roof {bom.totalNetRoofLm.toFixed(1)} lm · Waste {bom.wastePercent}% · {bom.totalOffcutsReused ?? 0} offcuts repressed (+{bom.savedOffcutLm.toFixed(1)} lm saved)
            </p>
          </div>
          {!measureLocked && (
            <button
              type="button"
              onClick={onRecalculateLayout}
              className="px-3 py-1.5 rounded-xl bg-blue-600/25 hover:bg-blue-600 text-sky-300 hover:text-white border border-blue-500/40 text-xs font-bold cursor-pointer"
            >
              Recalculate Cuts
            </button>
          )}
        </div>

        {bom.sheetGroups.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-900/60 border border-dashed border-slate-800 text-xs text-slate-400">
            No sheet groups calculated yet. Tap Recalculate Cuts above or open Offcuts.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {bom.sheetGroups.map((grp) => (
                <div
                  key={grp.lengthMm}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2 font-mono text-xs tabular-nums"
                >
                  <div>
                    <div className="text-sm font-black text-white">
                      {grp.count} @ <span className="text-sky-400">{grp.lengthMm} mm</span>
                    </div>
                    <div className="text-[11px] font-sans text-slate-400">
                      Faces {grp.targetCodes.join(', ') || 'Main'}
                      {grp.hasOffcutHarvest ? ' · includes repressed offcut' : ''}
                    </div>
                  </div>
                  <span className="text-slate-300 font-bold shrink-0">{(grp.count * grp.lengthM).toFixed(1)} lm</span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 font-mono text-xs tabular-nums">
              <span className="font-bold text-sky-300">
                {bom.totalSheetsCount} sheets · {bom.totalOrderedLm.toFixed(1)} lm ordered
              </span>
              <span className="text-slate-400">
                {bom.totalOffcutsReused ?? 0} offcuts repressed separately (+{bom.savedOffcutLm.toFixed(1)} lm saved)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 5. FLASHING RUNS & DIMENSIONS VERIFICATION */}
      <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <PenTool className="w-4 h-4 text-emerald-400" />
              <span>Section 3: Flashing Runs &amp; Dimensions ({flashingAssignments.length}/{structuralLines.length} Structural Assigned)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Check sloped flashing lengths and assign missing profiles before sending order to CNC Workshop.
            </p>
          </div>
        </div>

        {missingStructuralFlashings.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {missingStructuralFlashings.length} structural flashing line
              {missingStructuralFlashings.length === 1 ? ' still needs' : 's still need'} a flashing profile assigned before ordering.
            </span>
          </div>
        )}

        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Roof Line</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-right">Sloped Run</th>
                <th className="py-2.5 px-3">Assigned Profile &amp; Girth</th>
                <th className="py-2.5 px-3 text-right">Order (Qty × Len)</th>
                {!measureLocked && <th className="py-2.5 px-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {structuralLines.map((line) => {
                const assigned = assignmentByLineId.get(line.lineId);
                return (
                  <tr key={line.lineId} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-2.5 px-3 font-bold text-white">{line.label}</td>
                    <td className="py-2.5 px-3 text-slate-300">
                      {getFlashingKindDisplayLabel(line.flashingKind)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-sky-300 tabular-nums">
                      {line.trueSlopeLengthM.toFixed(2)} m
                    </td>
                    <td className="py-2.5 px-3">
                      {assigned ? (
                        <div className="text-emerald-300 font-semibold">
                          {assigned.profileName}{' '}
                          <span className="text-slate-400 font-mono text-[11px]">
                            ({assigned.developedBlankWidthMm || 350}mm blank)
                          </span>
                        </div>
                      ) : (
                        <span className="text-amber-300 font-semibold">Not assigned yet</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {assigned ? (
                        <span className="text-white font-bold">
                          {assigned.quantity} × {assigned.pieceLengthLm.toFixed(2)}m ({assigned.totalLinearMetres.toFixed(1)}m)
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          Est. {line.recommendedQuantity} × {line.recommendedPieceLengthM.toFixed(2)}m
                        </span>
                      )}
                    </td>
                    {!measureLocked && (
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectLineForFlashing(line.lineId)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                            assigned
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                              : 'bg-sky-600 hover:bg-sky-500 text-white'
                          }`}
                        >
                          {assigned ? 'Change' : 'Assign'}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {eaveLines.length > 0 && (
          <details className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3">
            <summary className="text-xs font-bold text-slate-300 cursor-pointer select-none">
              Optional Perimeter Eaves / Gutter Starters ({eaveLines.length} edges)
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2.5">
              {eaveLines.map((line) => {
                const assigned = assignmentByLineId.get(line.lineId);
                return (
                  <div
                    key={line.lineId}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-200 truncate">{line.label}</div>
                      <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                        {line.trueSlopeLengthM.toFixed(2)}m ·{' '}
                        {assigned ? assigned.profileName : 'No drip flashing'}
                      </div>
                    </div>
                    {!measureLocked && (
                      <button
                        type="button"
                        onClick={() => onSelectLineForFlashing(line.lineId)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-200 hover:text-white text-[11px] font-bold cursor-pointer shrink-0"
                      >
                        {assigned ? 'Edit' : 'Assign'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {assets.length > 0 && (
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-300">
              Roof Penetrations / Features Modeled: {assets.length}
            </span>
            <span className="font-mono text-sky-300 tabular-nums">
              {assets.map((a) => `${a.label || a.type} (${a.widthM.toFixed(1)}×${a.depthM.toFixed(1)}m)`).join(' · ')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
