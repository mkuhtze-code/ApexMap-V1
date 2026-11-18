import React from 'react';
import {
  RoofPlane,
  RoofOutline,
  RoofLevel,
  LayoutResult,
  RoofAsset,
  PitchBreakLine,
  AssignableRoofLine,
  RoofFlashingAssignment,
  RoofLifecycleStage
} from '../../types/exactRoofing';
import {
  X,
  Sliders,
  Sparkles,
  ArrowRight,
  FileSpreadsheet,
  Trash2,
  PenTool,
  ShoppingCart,
  Check,
  Layers,
  Plus
} from 'lucide-react';
import { useDeviceDetection } from '../../hooks/useDeviceDetection';
import {
  computeGableDormerGeometry,
  getDefaultEdgeSetbackM,
  isEdgeWallEnabled,
  dist
} from '../../utils/exactRoofingEngine';
import { getFlashingKindDisplayLabel } from '../../utils/exactRoofingFlashingBridge';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedPlane: RoofPlane | null;
  selectedAsset?: RoofAsset | null;
  selectedPitchBreak?: PitchBreakLine | null;
  outline?: RoofOutline;
  levels?: RoofLevel[];
  activeLevelId?: string;
  onSelectLevel?: (levelId: string) => void;
  onAddLevel?: () => void;
  onUpdateLevelHeight?: (levelId: string, heightM: number) => void;
  onDeleteLevel?: (levelId: string) => void;
  planes: RoofPlane[];
  assets?: RoofAsset[];
  pitchBreaks?: PitchBreakLine[];
  layout: LayoutResult | null;
  startPlaneId: string | null;
  onSetStartPlane: (planeId: string) => void;
  onUpdatePlanePitch: (planeId: string, pitchDeg: number) => void;
  onUpdatePlaneDirection: (planeId: string, direction: 'left' | 'right') => void;
  onUpdatePlaneOrderedSheetLength?: (planeId: string, lengthM: number | undefined) => void;
  onUpdatePlaneEaveHeight?: (planeId: string, heightM: number) => void;
  onUpdateEdgeLength?: (edgeId: string, lengthM: number) => void;
  onUpdateEdgeWall?: (edgeId: string, updates: { hasWall?: boolean; eaveSetbackM?: number }) => void;
  onToggleEdgeGable?: (edgeId: string, forceMode?: 'hipped' | 'gable') => void;
  onSetEdgeMode?: (edgeId: string, mode: 'hipped' | 'gable' | 'wall') => void;
  onApplyRoofStylePreset?: (mode: 'hipped' | 'gable') => void;
  onSelectPlane: (planeId: string | null) => void;
  onSelectAsset?: (assetId: string | null) => void;
  onUpdateAsset?: (asset: RoofAsset) => void;
  onDeleteAsset?: (assetId: string) => void;
  onSelectPitchBreak?: (pbId: string | null) => void;
  onUpdatePitchBreak?: (pb: PitchBreakLine) => void;
  onDeletePitchBreak?: (pbId: string) => void;
  onOpenCutList?: () => void;
  onOpenAiCopilot?: () => void;
  assignableLines?: AssignableRoofLine[];
  flashingAssignments?: RoofFlashingAssignment[];
  onSelectLineForFlashing?: (lineId: string) => void;
  onOpenOrderModal?: () => void;
  lifecycleStage?: RoofLifecycleStage;
  readOnlyGeometry?: boolean;
}

export const ExactRoofingInspectorDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedPlane,
  selectedAsset,
  selectedPitchBreak,
  outline,
  levels = [],
  activeLevelId = 'level-1',
  onSelectLevel,
  onAddLevel,
  onUpdateLevelHeight,
  onDeleteLevel,
  planes,
  assets = [],
  pitchBreaks = [],
  layout,
  startPlaneId,
  onSetStartPlane,
  onUpdatePlanePitch,
  onUpdatePlaneDirection,
  onUpdatePlaneOrderedSheetLength,
  onUpdatePlaneEaveHeight,
  onUpdateEdgeLength,
  onUpdateEdgeWall,
  onToggleEdgeGable,
  onSetEdgeMode,
  onApplyRoofStylePreset,
  onSelectPlane,
  onSelectAsset,
  onUpdateAsset,
  onDeleteAsset,
  onSelectPitchBreak,
  onUpdatePitchBreak,
  onDeletePitchBreak,
  onOpenCutList,
  onOpenAiCopilot,
  assignableLines = [],
  flashingAssignments = [],
  onSelectLineForFlashing,
  onOpenOrderModal,
  lifecycleStage = 'measuring',
  readOnlyGeometry = false
}) => {
  const { isMobile } = useDeviceDetection();
  const isInstalling = lifecycleStage === 'installing';
  const isLockedView = readOnlyGeometry || isInstalling;

  const [sheetLenDraftMm, setSheetLenDraftMm] = React.useState<string>('');
  React.useEffect(() => {
    if (!selectedPlane) {
      setSheetLenDraftMm('');
      return;
    }
    const curM = selectedPlane.orderedSheetLengthM ?? selectedPlane.slopeLength ?? 0;
    setSheetLenDraftMm(curM > 0 ? String(Math.round(curM * 1000)) : '');
  }, [selectedPlane?.id, selectedPlane?.orderedSheetLengthM, selectedPlane?.slopeLength]);

  const commitSheetLenDraft = () => {
    if (!selectedPlane || !onUpdatePlaneOrderedSheetLength) return;
    const raw = sheetLenDraftMm.trim();
    if (!raw) {
      onUpdatePlaneOrderedSheetLength(selectedPlane.id, undefined);
      return;
    }
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      const curM = selectedPlane.orderedSheetLengthM ?? selectedPlane.slopeLength ?? 0;
      setSheetLenDraftMm(curM > 0 ? String(Math.round(curM * 1000)) : '');
      return;
    }
    const lengthM =
      parsed >= 100
        ? +(Math.round(parsed) / 1000).toFixed(3)
        : parsed >= 0.3 && parsed <= 40
        ? +parsed.toFixed(3)
        : 0;
    if (lengthM < 0.3 || lengthM > 40) return;

    const modeledMm = Math.round((selectedPlane.slopeLength || 0) * 1000);
    const nextMm = Math.round(lengthM * 1000);
    if (modeledMm > 0 && nextMm === modeledMm) {
      onUpdatePlaneOrderedSheetLength(selectedPlane.id, undefined);
    } else {
      onUpdatePlaneOrderedSheetLength(selectedPlane.id, +(nextMm / 1000).toFixed(3));
    }
    setSheetLenDraftMm(String(nextMm));
  };

  if (!isOpen) return null;

  const rxZones = selectedPlane
    ? (layout?.receivingZones || selectedPlane.receivingZones || []).filter(
        (z) => z.targetPlaneId === selectedPlane.id
      )
    : [];

  const isStart =
    selectedPlane?.id === startPlaneId ||
    selectedPlane?.id === layout?.startPlaneId ||
    selectedPlane?.isStartEdge;

  const inspectorBody = (
    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs font-sans">
      {selectedAsset ? (
        <>
          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-black text-sm text-cyan-300">
                {selectedAsset.label || selectedAsset.type.replace('_', ' ')}
              </span>
              <button
                onClick={() => onSelectAsset?.(null)}
                className="text-[10px] font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
              >
                All Areas
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Drag on Plan View to reposition. Sheet runs split &amp; re-pair automatically.
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-300 text-[11px]">Width (across slope)</label>
              <span className="font-mono font-black text-sm text-white tabular-nums">
                {selectedAsset.widthM.toFixed(2)}m
              </span>
            </div>
            {!isLockedView && (
              <input
                type="range"
                min={0.5}
                max={6.0}
                step={0.1}
                value={selectedAsset.widthM}
                onChange={(e) =>
                  onUpdateAsset?.({ ...selectedAsset, widthM: parseFloat(e.target.value) })
                }
                className="w-full accent-cyan-500 cursor-pointer h-2"
              />
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="font-bold text-slate-300 text-[11px]">Depth (up slope)</label>
              <span className="font-mono font-black text-sm text-white tabular-nums">
                {selectedAsset.depthM.toFixed(2)}m
              </span>
            </div>
            {!isLockedView && (
              <input
                type="range"
                min={0.5}
                max={5.0}
                step={0.1}
                value={selectedAsset.depthM}
                onChange={(e) =>
                  onUpdateAsset?.({ ...selectedAsset, depthM: parseFloat(e.target.value) })
                }
                className="w-full accent-cyan-500 cursor-pointer h-2"
              />
            )}

            {(selectedAsset.type === 'mono_dormer' || selectedAsset.type === 'gable_dormer') && (
              <>
                <div className="flex items-center justify-between pt-1">
                  <label className="font-bold text-slate-300 text-[11px]">Dormer Roof Pitch</label>
                  <span className="font-mono font-black text-sm text-sky-400 tabular-nums">
                    {selectedAsset.dormerPitchDeg ?? (selectedAsset.type === 'mono_dormer' ? 12 : 25)}°
                  </span>
                </div>
                {!isLockedView && (
                  <input
                    type="range"
                    min={4}
                    max={45}
                    step={0.5}
                    value={selectedAsset.dormerPitchDeg ?? (selectedAsset.type === 'mono_dormer' ? 12 : 25)}
                    onChange={(e) =>
                      onUpdateAsset?.({
                        ...selectedAsset,
                        dormerPitchDeg: parseFloat(e.target.value)
                      })
                    }
                    className="w-full accent-blue-500 cursor-pointer h-2"
                  />
                )}

                {selectedAsset.type === 'gable_dormer' &&
                  (() => {
                    const hostPlane = planes.find((p) => p.id === selectedAsset.planeId);
                    const geom = hostPlane ? computeGableDormerGeometry(hostPlane, selectedAsset) : null;
                    if (!geom) return null;
                    return (
                      <div className="mt-2 pt-2.5 border-t border-slate-800 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80">
                          <div className="text-[10px] text-slate-500">Valley Angle</div>
                          <div className="font-mono font-bold text-amber-400 text-xs tabular-nums">
                            {geom.valleyAngleDeg}° ({geom.hostPitchDeg}° host)
                          </div>
                        </div>
                        <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80">
                          <div className="text-[10px] text-slate-500">Valley Tie Run</div>
                          <div className="font-mono font-bold text-white text-xs tabular-nums">
                            {geom.deltaVValley.toFixed(2)}m
                          </div>
                        </div>
                      </div>
                    );
                  })()}
              </>
            )}
          </div>

          {!isLockedView && (
            <button
              onClick={() => onDeleteAsset?.(selectedAsset.id)}
              className="w-full py-2.5 px-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-700/50 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove Feature</span>
            </button>
          )}
        </>
      ) : selectedPitchBreak ? (
        <>
          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-black text-sm text-amber-300">Change of Pitch Line</span>
              <button
                onClick={() => onSelectPitchBreak?.(null)}
                className="text-[10px] font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
              >
                All Areas
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Splits slope into independent lower apron and upper main sheets.
            </p>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-300 text-[11px]">Lower Apron Pitch</label>
              <span className="font-mono font-black text-sm text-amber-400 tabular-nums">
                {selectedPitchBreak.lowerPitchDeg}°
              </span>
            </div>
            {!isLockedView && (
              <input
                type="range"
                min={3}
                max={35}
                step={0.5}
                value={selectedPitchBreak.lowerPitchDeg}
                onChange={(e) =>
                  onUpdatePitchBreak?.({
                    ...selectedPitchBreak,
                    lowerPitchDeg: parseFloat(e.target.value)
                  })
                }
                className="w-full accent-amber-500 cursor-pointer h-2"
              />
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="font-bold text-slate-300 text-[11px]">Break Dist from Eave</label>
              <span className="font-mono font-black text-sm text-white tabular-nums">
                {selectedPitchBreak.splitPlanDistM.toFixed(2)}m
              </span>
            </div>
            {!isLockedView && (
              <input
                type="range"
                min={0.6}
                max={6.0}
                step={0.1}
                value={selectedPitchBreak.splitPlanDistM}
                onChange={(e) =>
                  onUpdatePitchBreak?.({
                    ...selectedPitchBreak,
                    splitPlanDistM: parseFloat(e.target.value)
                  })
                }
                className="w-full accent-amber-500 cursor-pointer h-2"
              />
            )}
          </div>

          {!isLockedView && onSelectLineForFlashing && (
            <button
              onClick={() => onSelectLineForFlashing(selectedPitchBreak.id)}
              className="w-full py-2.5 px-3.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 text-xs font-extrabold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Draw / Assign Apron Flashing</span>
            </button>
          )}

          {!isLockedView && (
            <button
              onClick={() => onDeletePitchBreak?.(selectedPitchBreak.id)}
              className="w-full py-2.5 px-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-700/50 text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove Pitch Break</span>
            </button>
          )}
        </>
      ) : selectedPlane ? (
        <>
          {/* 1. Selected Plane Identification */}
          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                  style={{ backgroundColor: selectedPlane.color || '#3b82f6' }}
                />
                <span className="font-black text-sm text-white">
                  {selectedPlane.label || `Area ${selectedPlane.code}`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-400 font-mono">
                  Seq #{selectedPlane.sequenceIndex || 1}
                </span>
                <button
                  onClick={() => onSelectPlane(null)}
                  className="text-[10px] font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
                >
                  All Areas
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              {selectedPlane.name || 'Roof Slope Section'}
            </p>

            {/* Start Edge Tag & Quick Convert to Gable (Editable stages only) */}
            <div className="pt-1 flex flex-wrap items-center gap-2">
              {isStart ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/30">
                  ★ Start Face (#1)
                </span>
              ) : (
                !isLockedView && (
                  <button
                    onClick={() => onSetStartPlane(selectedPlane.id)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-600/30 hover:text-emerald-300 hover:border-emerald-500/40 text-slate-300 border border-slate-700 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span>★ Make Start Edge</span>
                  </button>
                )
              )}

              {!isLockedView && onToggleEdgeGable && selectedPlane.eaveEdgeId && (
                <button
                  onClick={() => onToggleEdgeGable(selectedPlane.eaveEdgeId, 'gable')}
                  className="px-3 py-1.5 rounded-xl bg-indigo-950/70 hover:bg-indigo-600/40 text-indigo-300 hover:text-white border border-indigo-500/40 text-[11px] font-bold transition-all cursor-pointer"
                >
                  Convert to Gable End
                </button>
              )}
            </div>
          </div>

          {/* 1B. Ordered Sheet Length (Site Measure Override — Does Not Change Plan Geometry) */}
          {(() => {
            const modeledMm = Math.round((selectedPlane.slopeLength || 0) * 1000);
            const orderedMm = selectedPlane.orderedSheetLengthM
              ? Math.round(selectedPlane.orderedSheetLengthM * 1000)
              : null;
            const isOverridden = orderedMm !== null && orderedMm !== modeledMm;
            return (
              <div className="bg-slate-900/90 border border-sky-500/35 p-3.5 rounded-2xl space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sky-300 text-[11px] uppercase tracking-wider">
                    Ordered Sheet Length (mm)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                    Plan: {modeledMm}mm
                  </span>
                </div>

                {isLockedView || !onUpdatePlaneOrderedSheetLength ? (
                  <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">Sheet Cut to Order</span>
                    <span className="font-mono font-black text-sky-300 text-sm tabular-nums">
                      {orderedMm ?? modeledMm}mm
                      {isOverridden ? ' (Site Measured)' : ''}
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          inputMode="numeric"
                          step="5"
                          min="300"
                          max="30000"
                          value={sheetLenDraftMm}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => setSheetLenDraftMm(e.target.value)}
                          onBlur={commitSheetLenDraft}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              commitSheetLenDraft();
                              (e.currentTarget as HTMLInputElement).blur();
                            }
                          }}
                          placeholder={String(modeledMm || 5450)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-3 pr-9 py-2 text-white font-mono font-black text-sm tabular-nums focus:outline-hidden focus:border-sky-400"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-slate-400 pointer-events-none">
                          mm
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={commitSheetLenDraft}
                        className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold cursor-pointer shrink-0 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Set</span>
                      </button>
                      {isOverridden && (
                        <button
                          type="button"
                          onClick={() => onUpdatePlaneOrderedSheetLength(selectedPlane.id, undefined)}
                          className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold cursor-pointer shrink-0"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">
                      {isOverridden
                        ? `Using ${orderedMm}mm in BOM & cut list (plan geometry remains ${modeledMm}mm).`
                        : 'Type actual field sheet length (e.g. 5435). Leaves plan geometry unchanged.'}
                    </p>
                  </>
                )}
              </div>
            );
          })()}

          {/* 2. Pitch & Lay Direction (Interactive when editable, clear spec summary when locked/installing) */}
          {isLockedView ? (
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                <div className="text-[10px] text-slate-500">Roof Pitch</div>
                <div className="font-mono font-black text-sky-400 text-sm mt-0.5">
                  {selectedPlane.pitchDeg}°
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                <div className="text-[10px] text-slate-500">Lay Direction</div>
                <div className="font-bold text-white text-xs mt-0.5">
                  {selectedPlane.underlapSide === 'left' ? 'Left to Right' : 'Right to Left'}
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                <div className="text-[10px] text-slate-500">Eave Width</div>
                <div className="font-mono font-bold text-white text-xs mt-0.5 tabular-nums">
                  {(selectedPlane.eaveWidthM ?? (selectedPlane.planPolygon[1] ? dist(selectedPlane.planPolygon[0], selectedPlane.planPolygon[1]) : 10)).toFixed(2)} m
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                <div className="text-[10px] text-slate-500">Eave Height Z</div>
                <div className="font-mono font-bold text-amber-400 text-xs mt-0.5 tabular-nums">
                  {(selectedPlane.eaveHeightM ?? 2.7).toFixed(2)} m
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">
                    Roof Pitch (Slope)
                  </label>
                  <span className="font-mono font-black text-base text-sky-400">
                    {selectedPlane.pitchDeg}°
                  </span>
                </div>

                <input
                  type="range"
                  min={3}
                  max={50}
                  step={0.5}
                  value={selectedPlane.pitchDeg}
                  onChange={(e) => onUpdatePlanePitch(selectedPlane.id, parseFloat(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer h-2"
                />

                <div className="grid grid-cols-5 gap-1.5 pt-0.5">
                  {[5, 12, 15, 22.5, 30].map((deg) => (
                    <button
                      key={deg}
                      onClick={() => onUpdatePlanePitch(selectedPlane.id, deg)}
                      className={`py-2 sm:py-1 rounded-xl sm:rounded-md text-[11px] sm:text-[10px] font-mono font-bold transition-colors cursor-pointer border ${
                        Math.abs(selectedPlane.pitchDeg - deg) < 0.2
                          ? 'bg-blue-600 text-white border-blue-400'
                          : 'bg-slate-850 hover:bg-slate-800 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2">
                <label className="font-bold text-slate-300 text-[11px] uppercase tracking-wider block">
                  Lay Direction (Underlap)
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                  <button
                    onClick={() => onUpdatePlaneDirection(selectedPlane.id, 'left')}
                    className={`py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedPlane.underlapSide === 'left'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Left to Right
                  </button>
                  <button
                    onClick={() => onUpdatePlaneDirection(selectedPlane.id, 'right')}
                    className={`py-2 sm:py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedPlane.underlapSide === 'right'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Right to Left
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">
                  Laps face away from prevailing wind to prevent capillary siphoning.
                </p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">
                    Wall Footprint &amp; Height (Z)
                  </span>
                  {selectedPlane.levelCode && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {selectedPlane.levelCode}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80 space-y-1">
                    <label className="text-[10px] text-slate-400 font-bold block">Eave Length (m)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="40"
                      value={+(selectedPlane.eaveWidthM ?? (selectedPlane.planPolygon[1] ? dist(selectedPlane.planPolygon[0], selectedPlane.planPolygon[1]) : 10)).toFixed(2)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (Number.isFinite(val) && val > 0.4 && onUpdateEdgeLength && selectedPlane.eaveEdgeId) {
                          onUpdateEdgeLength(selectedPlane.eaveEdgeId, val);
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono font-bold text-xs tabular-nums focus:outline-hidden focus:border-blue-500"
                    />
                  </div>

                  <div className="bg-slate-950 p-2 rounded-xl border border-amber-500/25 space-y-1">
                    <label className="text-[10px] text-amber-400 font-bold block">Eave Height Z (m)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.5"
                      max="15"
                      value={+(selectedPlane.eaveHeightM ?? 2.7).toFixed(2)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (Number.isFinite(val) && val >= 0.5 && onUpdatePlaneEaveHeight) {
                          onUpdatePlaneEaveHeight(selectedPlane.id, val);
                        }
                      }}
                      className="w-full bg-slate-900 border border-amber-500/40 rounded-lg px-2 py-1.5 text-white font-mono font-bold text-xs tabular-nums focus:outline-hidden focus:border-amber-400"
                    />
                  </div>
                </div>

                {onUpdatePlaneEaveHeight && (
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { label: '2.7m (1F)', z: 2.7 },
                      { label: '4.1m (Split)', z: 4.1 },
                      { label: '5.4m (2F)', z: 5.4 }
                    ].map((preset) => (
                      <button
                        key={preset.z}
                        onClick={() => onUpdatePlaneEaveHeight(selectedPlane.id, preset.z)}
                        className={`py-1.5 rounded-lg text-[10px] font-bold tabular-nums cursor-pointer transition-all border ${
                          Math.abs((selectedPlane.eaveHeightM ?? 2.7) - preset.z) < 0.08
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}

                {onUpdateEdgeWall && selectedPlane.eaveEdgeId && (() => {
                  const owningOutline =
                    levels.find((l) => l.id === (selectedPlane.levelId || activeLevelId))?.outline ||
                    outline;
                  const edgeObj = owningOutline?.edges.find((e) => e.id === selectedPlane.eaveEdgeId);
                  if (!edgeObj) return null;
                  const wallActive = isEdgeWallEnabled(edgeObj);
                  const setbackVal = getDefaultEdgeSetbackM(edgeObj);
                  return (
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-bold text-slate-200">Wall Below Eave</div>
                          <div className="text-[10px] text-slate-500">Sits under roof · Does not alter geometry</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onUpdateEdgeWall(edgeObj.id, { hasWall: !wallActive })}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold cursor-pointer transition-all ${
                            wallActive
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
                          }`}
                        >
                          {wallActive ? 'Wall ON' : 'Wall OFF'}
                        </button>
                      </div>
                      {wallActive && (
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[10px] text-slate-400 font-bold">Eave Width (m)</span>
                          <div className="flex items-center gap-1">
                            {[0, 0.45, 0.6].map((sb) => (
                              <button
                                key={sb}
                                type="button"
                                onClick={() => onUpdateEdgeWall(edgeObj.id, { eaveSetbackM: sb })}
                                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold cursor-pointer ${
                                  Math.abs(setbackVal - sb) < 0.02
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                }`}
                              >
                                {sb === 0 ? '0m' : `${sb}m`}
                              </button>
                            ))}
                            <input
                              type="number"
                              step="0.05"
                              min="0"
                              max="3"
                              value={setbackVal}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (Number.isFinite(val) && val >= 0) {
                                  onUpdateEdgeWall(edgeObj.id, { eaveSetbackM: Math.min(3, val) });
                                }
                              }}
                              className="w-14 bg-slate-900 border border-slate-700 rounded-md px-1.5 py-0.5 text-center text-white font-mono font-bold text-[10px] tabular-nums focus:outline-hidden focus:border-sky-400"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </>
          )}

          {/* 4. Geometry Dimensions (True Developed Size) */}
          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2">
            <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">
              True Developed Dimensions
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                <div className="text-[10px] text-slate-500">True Slope Run</div>
                <div className="font-mono font-bold text-white text-sm sm:text-xs mt-0.5">
                  {selectedPlane.slopeLength?.toFixed(2) || '5.41'} m
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                <div className="text-[10px] text-slate-500">Surface Area</div>
                <div className="font-mono font-bold text-white text-sm sm:text-xs mt-0.5">
                  {selectedPlane.area?.toFixed(1) || '48.7'} m²
                </div>
              </div>
            </div>
          </div>

          {/* 5. Received Offcuts Feed */}
          {rxZones.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2">
              <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider flex items-center justify-between">
                <span>Received Offcuts</span>
                <span className="text-[10px] font-mono text-purple-300">
                  {rxZones.reduce((acc, z) => acc + z.piecesCount, 0)} pieces
                </span>
              </div>
              <div className="space-y-1.5">
                {rxZones.map((z) => (
                  <div
                    key={z.id}
                    className="p-2.5 rounded-xl border flex items-center justify-between text-[11px]"
                    style={{
                      backgroundColor: z.softSourceColor,
                      borderColor: z.tintColor
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: z.sourceColor }}
                      />
                      <span className="font-bold text-white">
                        From {z.sourceName}
                      </span>
                    </div>
                    <span className="font-mono font-bold text-white bg-black/40 px-1.5 py-0.5 rounded text-[10px]">
                      {z.piecesCount} pcs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Project Overview when nothing is clicked */
        <div className="space-y-3">
          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-1.5">
            <div className="font-black text-sm text-white flex items-center justify-between">
              <span>Roof Summary</span>
              <span className="text-[10px] font-mono text-blue-400">
                {planes.length} Areas
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isLockedView
                ? 'Tap any roof face on the plan to inspect sheet runs, pitch, and offcut transfers.'
                : 'Tap any roof area on the plan or below to edit pitch, direction, and offcut routing.'}
            </p>
          </div>

          {layout && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Total Area</div>
                <div className="text-base font-black text-white font-mono mt-0.5">
                  {layout.totalRoofArea.toFixed(1)} m²
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Steel Saved</div>
                <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                  +{layout.savedMetres} m
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Sheet Yield</div>
                <div className="text-base font-black text-sky-400 font-mono mt-0.5">
                  {100 - layout.wastePercent}%
                </div>
              </div>
              {isInstalling ? (
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Stock Sheets</div>
                  <div className="text-base font-black text-white font-mono mt-0.5">
                    {layout.parents.length} pcs
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Dollar Value</div>
                  <div className="text-base font-black text-white font-mono mt-0.5">
                    ${layout.dollarValueSavedNZD}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Roof Tiers / Z-Axis Elevation Levels */}
          {levels.length > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-amber-400" />
                  <span>Roof Tiers &amp; Eave Z ({levels.length})</span>
                </div>
                {!isLockedView && onAddLevel && (
                  <button
                    onClick={onAddLevel}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Tier</span>
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {levels.map((lvl) => {
                  const isFocused = activeLevelId === lvl.id;
                  return (
                    <div
                      key={lvl.id}
                      className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition-colors ${
                        isFocused
                          ? 'bg-amber-950/35 border-amber-500/50'
                          : 'bg-slate-950/60 border-slate-800/80'
                      }`}
                    >
                      <button
                        onClick={() => onSelectLevel?.(lvl.id)}
                        className="flex items-center gap-2 text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold text-[10px] shrink-0">
                          {lvl.code}
                        </span>
                        <span className="font-bold text-slate-200 truncate text-[11px]">
                          {lvl.name}
                        </span>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-slate-500 font-bold">Z</span>
                        {isLockedView ? (
                          <span className="font-mono font-bold text-white text-[11px] tabular-nums">
                            {lvl.eaveHeightM.toFixed(2)} m
                          </span>
                        ) : (
                          <>
                            <input
                              type="number"
                              step="0.1"
                              min="0.5"
                              max="15"
                              value={+lvl.eaveHeightM.toFixed(2)}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                if (Number.isFinite(val) && val >= 0.5 && onUpdateLevelHeight) {
                                  onUpdateLevelHeight(lvl.id, val);
                                }
                              }}
                              className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-[11px] tabular-nums text-right focus:outline-hidden focus:border-amber-400"
                            />
                            <span className="text-[10px] text-slate-400">m</span>
                            {levels.length > 1 && onDeleteLevel && (
                              <button
                                onClick={() => onDeleteLevel(lvl.id)}
                                className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer"
                                title="Remove Tier"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Organized Roof Style & Perimeter Facets (Hip / Gable / Wall) */}
          <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Facets, Walls &amp; Gables
              </div>
              {outline && outline.edges.length > 0 && (() => {
                const vergeCount = outline.edges.filter((e) => e.type === 'verge').length;
                const wallCount = outline.edges.filter((e) => e.type === 'wall').length;
                const modeLabel =
                  wallCount > 0 ? 'Terraced / Wall' : vergeCount === 0 ? 'Hipped' : vergeCount >= 2 && planes.length <= 2 ? 'Gable' : 'Mixed';
                return (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-sky-300 border border-slate-700">
                    {modeLabel}
                  </span>
                );
              })()}
            </div>

            {!isLockedView && onApplyRoofStylePreset && outline && outline.edges.length > 0 && (
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  onClick={() => onApplyRoofStylePreset('hipped')}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    outline.edges.every((e) => e.type === 'outline')
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Hipped
                </button>
                <button
                  onClick={() => onApplyRoofStylePreset('gable')}
                  className={`py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    outline.edges.some((e) => e.type === 'verge')
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Gable Ends
                </button>
              </div>
            )}

            <div className="space-y-1">
              {outline && outline.edges.length > 0
                ? outline.edges.map((edge, idx) => {
                    const matchedPlane = planes.find((p) => p.eaveEdgeId === edge.id);
                    const isGable = edge.type === 'verge';
                    const isWall = edge.type === 'wall';
                    const edgeLen = dist(edge.from, edge.to).toFixed(1);
                    const edgeZ = (edge.eaveHeightM ?? matchedPlane?.eaveHeightM ?? 2.7).toFixed(1);
                    return (
                      <div
                        key={edge.id}
                        className="flex items-center justify-between gap-2 p-1.5 pl-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-colors"
                      >
                        <button
                          onClick={() => matchedPlane && onSelectPlane(matchedPlane.id)}
                          disabled={!matchedPlane}
                          className={`flex items-center gap-2 text-left min-w-0 flex-1 ${
                            matchedPlane ? 'cursor-pointer' : 'cursor-default opacity-85'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{
                              backgroundColor: isWall
                                ? '#f59e0b'
                                : isGable
                                ? '#818cf8'
                                : matchedPlane?.color || '#3b82f6'
                            }}
                          />
                          <span className="font-bold text-slate-200 truncate text-xs tabular-nums">
                            {matchedPlane ? `${matchedPlane.code} · ` : isWall ? 'Wall · ' : `Side ${idx + 1} · `}
                            {edgeLen}m
                          </span>
                          <span className="font-mono text-amber-400/90 text-[10px] tabular-nums shrink-0">
                            Z:{edgeZ}m
                          </span>
                        </button>

                        {!isLockedView && (
                          <div className="flex items-center gap-1 shrink-0">
                            {(onSetEdgeMode || onToggleEdgeGable) && (
                              <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800">
                                <button
                                  onClick={() =>
                                    onSetEdgeMode
                                      ? onSetEdgeMode(edge.id, 'hipped')
                                      : onToggleEdgeGable?.(edge.id, 'hipped')
                                  }
                                  className={`px-1.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                    !isGable && !isWall
                                      ? 'bg-emerald-600/90 text-white'
                                      : 'text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  Hip
                                </button>
                                <button
                                  onClick={() =>
                                    onSetEdgeMode
                                      ? onSetEdgeMode(edge.id, 'gable')
                                      : onToggleEdgeGable?.(edge.id, 'gable')
                                  }
                                  className={`px-1.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                                    isGable
                                      ? 'bg-indigo-600 text-white'
                                      : 'text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  Gab
                                </button>
                              </div>
                            )}
                            {onUpdateEdgeWall && (
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateEdgeWall(edge.id, { hasWall: !isEdgeWallEnabled(edge) })
                                }
                                title="Toggle Wall Below Roof Edge"
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                                  isEdgeWallEnabled(edge)
                                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                                    : 'bg-slate-900 text-slate-500 hover:text-slate-300 border-slate-800'
                                }`}
                              >
                                Wall
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                : planes.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onSelectPlane(p.id)}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-slate-800/80 active:bg-slate-800 flex items-center justify-between text-xs transition-colors cursor-pointer border border-transparent hover:border-slate-700"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: p.color || '#3b82f6' }}
                        />
                        <span className="font-bold text-slate-200">
                          {p.code}: {p.name || 'Section'}
                        </span>
                      </div>
                      <span className="font-mono text-slate-400 text-[11px]">{p.pitchDeg}°</span>
                    </button>
                  ))}
            </div>
          </div>

          {/* Added Features & Pitch Breaks Quick List */}
          {(assets.length > 0 || pitchBreaks.length > 0) && (
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Roof Features ({assets.length + pitchBreaks.length})
              </div>
              <div className="space-y-1">
                {assets.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onSelectAsset?.(a.id)}
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-800/80 flex items-center justify-between text-xs cursor-pointer"
                  >
                    <span className="font-bold text-cyan-300">
                      {a.label || a.type.replace('_', ' ')}
                    </span>
                    <span className="font-mono text-slate-400 text-[11px] tabular-nums">
                      {a.widthM.toFixed(1)}×{a.depthM.toFixed(1)}m
                    </span>
                  </button>
                ))}
                {pitchBreaks.map((pb) => (
                  <button
                    key={pb.id}
                    onClick={() => onSelectPitchBreak?.(pb.id)}
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-800/80 flex items-center justify-between text-xs cursor-pointer"
                  >
                    <span className="font-bold text-amber-300">Pitch Break</span>
                    <span className="font-mono text-slate-400 text-[11px] tabular-nums">
                      {pb.lowerPitchDeg}° @ {pb.splitPlanDistM.toFixed(1)}m
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Flashings & Ordering Schedule */}
          {(onSelectLineForFlashing || onOpenOrderModal) && (() => {
            const keyLines = assignableLines.filter((l) => l.flashingKind !== 'eave');
            const totalFlashingLm = flashingAssignments
              .reduce((sum, a) => sum + a.totalLinearMetres, 0)
              .toFixed(1);
            return (
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    Flashings ({flashingAssignments.length}/{keyLines.length || assignableLines.length})
                  </div>
                  <span className="font-mono text-[11px] font-bold text-emerald-400 tabular-nums">
                    {totalFlashingLm} lm
                  </span>
                </div>

                {keyLines.length > 0 && (
                  <div className="space-y-1 max-h-44 overflow-y-auto pr-0.5">
                    {keyLines.map((line) => {
                      const assigned = flashingAssignments.find((a) => a.lineId === line.lineId);
                      return (
                        <button
                          key={line.lineId}
                          type="button"
                          disabled={isLockedView || !onSelectLineForFlashing}
                          onClick={() => !isLockedView && onSelectLineForFlashing?.(line.lineId)}
                          className={`w-full text-left p-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition-colors ${
                            isLockedView || !onSelectLineForFlashing ? 'cursor-default' : 'cursor-pointer'
                          } ${
                            assigned
                              ? 'bg-emerald-950/35 border-emerald-500/40'
                              : 'bg-slate-950/60 border-slate-800/80'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-200 truncate text-[11px]">
                              {line.label}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate tabular-nums">
                              {assigned
                                ? `${assigned.profileName} · ${assigned.quantity}×${assigned.pieceLengthLm}m`
                                : `${getFlashingKindDisplayLabel(line.flashingKind)} · ${line.trueSlopeLengthM.toFixed(2)}m`}
                            </div>
                          </div>
                          {assigned ? (
                            <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-0.5 shrink-0">
                              <Check className="w-3 h-3" />
                              <span>Set</span>
                            </span>
                          ) : !isLockedView ? (
                            <span className="text-sky-400 font-bold text-[10px] shrink-0">
                              Draw
                            </span>
                          ) : (
                            <span className="text-slate-500 font-mono text-[10px] shrink-0">
                              {line.trueSlopeLengthM.toFixed(1)}m
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {!isInstalling && onOpenOrderModal && (
                  <button
                    onClick={() => {
                      onOpenOrderModal();
                      if (isMobile) onClose();
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer"
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>Review &amp; Order BOM</span>
                  </button>
                )}
              </div>
            );
          })()}

          {/* Tools Shortcuts */}
          <div className="pt-1 space-y-2">
            {onOpenCutList && (
              <button
                onClick={() => {
                  onOpenCutList();
                  if (isMobile) onClose();
                }}
                className="w-full py-3 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold transition-all cursor-pointer flex items-center justify-between border border-slate-700/60"
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-sky-400" />
                  <span>{isInstalling ? 'Install Sequence & Packs' : 'Sheet Cut & Offcut Plan'}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              </button>
            )}

            {!isInstalling && onOpenAiCopilot && (
              <button
                onClick={() => {
                  onOpenAiCopilot();
                  if (isMobile) onClose();
                }}
                className="w-full py-3 px-3.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 text-xs font-bold transition-all cursor-pointer flex items-center justify-between border border-purple-500/40"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>AI Copilot &amp; NZBC Audit</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Mobile: Render as native slide-up Bottom Sheet
  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px] flex flex-col justify-end animate-in fade-in"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full bg-[#0c121e] border-t border-slate-700/80 text-white rounded-t-3xl shadow-2xl flex flex-col max-h-[82dvh] pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom-4 duration-200"
        >
          {/* Drag Handle + Header */}
          <div className="pt-2.5 pb-3 px-4 border-b border-slate-800 bg-slate-950/60 rounded-t-3xl space-y-2">
            <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-400" />
                <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-200">
                  {selectedPlane ? 'Area Inspector' : 'Roof Overview'}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
                aria-label="Close Inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {inspectorBody}
        </div>
      </div>
    );
  }

  // Desktop / Large Tablet: Side-by-side right CAD panel
  return (
    <div className="w-80 md:w-88 shrink-0 bg-[#0c121e] border-l border-slate-800 text-white flex flex-col h-full animate-in slide-in-from-right duration-200 shadow-2xl z-20">
      <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-blue-400" />
          <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-300">
            {selectedPlane ? 'Roof Area Inspector' : 'Roof Overview'}
          </h3>
        </div>

        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Close Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {inspectorBody}
    </div>
  );
};
