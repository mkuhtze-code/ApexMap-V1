import React from 'react';
import {
  EdgeType,
  RoofPlane,
  RoofOutline,
  RoofLevel,
  LayoutResult,
  RoofAsset,
  PitchBreakLine,
  AssignableRoofLine,
  RoofFlashingAssignment,
  RoofLifecycleStage,
  SkeletonLineType,
  TakeoffCompletenessIssue,
  TakeoffCompletenessReport,
  WallCladdingType,
  WallFacet,
  WallFacetKind,
  WallFilterMode,
  WallHeightSource,
  WallPlan
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
  Link2,
  Plus,
  Building2,
  AlertTriangle,
  Undo2
} from 'lucide-react';
import { useDeviceDetection } from '../../hooks/useDeviceDetection';
import {
  computeAssetPlacementMetrics,
  computeGableDormerGeometry,
  getDefaultEdgeSetbackM,
  getRoofEdgeTypeMeta,
  getSkeletonLineTypeMeta,
  isEdgeWallEnabled,
  repositionAssetToPlane,
  ROOF_LINE_TYPE_CATALOG,
  updateAssetFromPlacement,
  dist
} from '../../utils/exactRoofingEngine';
import {
  buildWallOpeningsSchedule,
  computeWallFacetMetrics,
  computeWallTakeoffSummary,
  fitWallFacetTopToRoof,
  getFacetPrimaryDisplayCladding,
  getWallCladdingMeta,
  getWallFacetKind,
  getWallFacetKindMeta,
  isWallFacetUndetailed,
  resolveRoofTopForWallFacet,
  updateWallFacetKind,
  WALL_CLADDING_OPTIONS,
  WALL_FACET_KIND_OPTIONS
} from '../../utils/wallCladdingEngine';
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
  wallPlan?: WallPlan | null;
  selectedWallFacetId?: string | null;
  onSelectWallFacet?: (facetId: string | null) => void;
  onOpenWallElevation?: (facetId: string) => void;
  onUpdateWallFacet?: (facet: WallFacet) => void;
  onBuildWallFaces?: () => void;
  wallFilterMode?: WallFilterMode;
  onChangeWallFilterMode?: (mode: WallFilterMode) => void;
  completenessReport?: TakeoffCompletenessReport;
  onJumpToCompletenessIssue?: (issue: TakeoffCompletenessIssue) => void;
  selectedPlaneIds?: string[];
  onChangeSelectedPlaneIds?: (ids: string[]) => void;
  selectedEdgeIds?: string[];
  onChangeSelectedEdgeIds?: (ids: string[]) => void;
  selectedSkeletonLineIds?: string[];
  onChangeSelectedSkeletonLineIds?: (ids: string[]) => void;
  selectedWallFacetIds?: string[];
  onChangeSelectedWallFacetIds?: (ids: string[]) => void;
  onBatchPlanePitch?: (ids: string[], pitchDeg: number) => void;
  onBatchPlaneDirection?: (ids: string[], dir: 'left' | 'right') => void;
  onBatchPlaneOrderedSheetLength?: (ids: string[], lenM: number | undefined) => void;
  onBatchPlaneEaveHeight?: (ids: string[], zM: number) => void;
  onBatchEdgeType?: (ids: string[], edgeType: EdgeType) => void;
  onBatchEdgeWall?: (ids: string[], updates: { hasWall?: boolean; eaveSetbackM?: number }) => void;
  onBatchEdgeHeight?: (ids: string[], zM: number) => void;
  onBatchSkeletonLineType?: (ids: string[], lineType: SkeletonLineType) => void;
  onBatchWallUpdate?: (
    facetIds: string[],
    patch: {
      claddingType?: WallCladdingType;
      kind?: WallFacetKind;
      heightM?: number;
      heightSource?: WallHeightSource;
    }
  ) => void;
  onUndo?: () => void;
  canUndo?: boolean;
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
  readOnlyGeometry = false,
  wallPlan,
  selectedWallFacetId,
  onSelectWallFacet,
  onOpenWallElevation,
  onUpdateWallFacet,
  onBuildWallFaces,
  wallFilterMode: propWallFilterMode,
  onChangeWallFilterMode,
  completenessReport,
  onJumpToCompletenessIssue,
  selectedPlaneIds = [],
  onChangeSelectedPlaneIds,
  selectedEdgeIds = [],
  onChangeSelectedEdgeIds,
  selectedSkeletonLineIds = [],
  onChangeSelectedSkeletonLineIds,
  selectedWallFacetIds = [],
  onChangeSelectedWallFacetIds,
  onBatchPlanePitch,
  onBatchPlaneDirection,
  onBatchPlaneOrderedSheetLength,
  onBatchPlaneEaveHeight,
  onBatchEdgeType,
  onBatchEdgeWall,
  onBatchEdgeHeight,
  onBatchSkeletonLineType,
  onBatchWallUpdate,
  onUndo,
  canUndo = false
}) => {
  const { isMobile } = useDeviceDetection();
  const isInstalling = lifecycleStage === 'installing';
  const isLockedView = readOnlyGeometry || isInstalling;

  const [localWallFilter, setLocalWallFilter] = React.useState<WallFilterMode>('all');
  const wallFilterMode = propWallFilterMode ?? localWallFilter;
  const setWallFilterMode = (mode: WallFilterMode) => {
    setLocalWallFilter(mode);
    onChangeWallFilterMode?.(mode);
  };

  const wallFacets = wallPlan?.facets || [];
  const selectedWallFacet = React.useMemo(
    () => wallFacets.find((f) => f.id === selectedWallFacetId) || null,
    [wallFacets, selectedWallFacetId]
  );
  const wallSummary = React.useMemo(
    () => computeWallTakeoffSummary(wallFacets),
    [wallFacets]
  );
  const openingsSchedule = React.useMemo(
    () => buildWallOpeningsSchedule(wallFacets),
    [wallFacets]
  );
  const returnFacetIdSet = React.useMemo(
    () => new Set(wallSummary.returnFacetIds),
    [wallSummary.returnFacetIds]
  );
  const filteredWallFacets = React.useMemo(() => {
    if (wallFilterMode === 'undetailed') {
      return wallFacets.filter((f) => isWallFacetUndetailed(f));
    }
    if (wallFilterMode === 'returns') {
      return wallFacets.filter((f) => returnFacetIdSet.has(f.id));
    }
    if (wallFilterMode === 'parapets') {
      return wallFacets.filter((f) => getWallFacetKind(f) === 'parapet');
    }
    if (wallFilterMode === 'secondary') {
      return wallFacets.filter((f) => getWallFacetKind(f) === 'secondary');
    }
    if (wallFilterMode === 'wings') {
      return wallFacets.filter((f) => getWallFacetKind(f) === 'wing' || Boolean(f.isSpur));
    }
    return wallFacets;
  }, [wallFacets, wallFilterMode, returnFacetIdSet]);

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

  const [batchSheetMm, setBatchSheetMm] = React.useState<string>('');
  const [batchPlaneZ, setBatchPlaneZ] = React.useState<string>('2.7');
  const [batchEdgeZ, setBatchEdgeZ] = React.useState<string>('2.7');
  const [batchWallH, setBatchWallH] = React.useState<string>('2.7');
  const [batchPitchDraft, setBatchPitchDraft] = React.useState<number>(22.5);

  const focusedFieldRef = React.useRef<string | null>(null);
  const [planeEaveLenDraft, setPlaneEaveLenDraft] = React.useState<string>('');
  const [planeEaveZDraft, setPlaneEaveZDraft] = React.useState<string>('');
  const [planeSetbackDraft, setPlaneSetbackDraft] = React.useState<string>('');
  const [parapetHDraft, setParapetHDraft] = React.useState<string>('');
  const [levelZDrafts, setLevelZDrafts] = React.useState<Record<string, string>>({});

  const selectedPlanesList = React.useMemo(
    () => planes.filter((p) => selectedPlaneIds.includes(p.id)),
    [planes, selectedPlaneIds]
  );

  React.useEffect(() => {
    if (selectedPlanesList.length === 0) return;
    const pitches = new Set(selectedPlanesList.map((p) => p.pitchDeg));
    setBatchPitchDraft(pitches.size === 1 ? selectedPlanesList[0].pitchDeg : selectedPlanesList[0].pitchDeg);
  }, [selectedPlaneIds.join(','), planes]);

  const currentPlaneEaveLen = selectedPlane
    ? +(
        selectedPlane.eaveWidthM ??
        (selectedPlane.planPolygon[1]
          ? dist(selectedPlane.planPolygon[0], selectedPlane.planPolygon[1])
          : 10)
      ).toFixed(2)
    : 0;
  const currentPlaneEaveZ = selectedPlane ? +(selectedPlane.eaveHeightM ?? 2.7).toFixed(2) : 2.7;

  React.useEffect(() => {
    if (!selectedPlane) return;
    if (focusedFieldRef.current !== 'planeEaveLen') {
      setPlaneEaveLenDraft(String(currentPlaneEaveLen));
    }
    if (focusedFieldRef.current !== 'planeEaveZ') {
      setPlaneEaveZDraft(String(currentPlaneEaveZ));
    }
    if (focusedFieldRef.current !== 'planeSetback') {
      const owningOutline =
        levels.find((l) => l.id === (selectedPlane.levelId || activeLevelId))?.outline || outline;
      const edgeObj = owningOutline?.edges.find((e) => e.id === selectedPlane.eaveEdgeId);
      setPlaneSetbackDraft(String(edgeObj ? getDefaultEdgeSetbackM(edgeObj) : 0.45));
    }
  }, [selectedPlane?.id, currentPlaneEaveLen, currentPlaneEaveZ, levels, outline, activeLevelId]);

  React.useEffect(() => {
    if (!selectedWallFacet) return;
    if (focusedFieldRef.current !== 'parapetH') {
      setParapetHDraft(String(+selectedWallFacet.heightM.toFixed(2)));
    }
  }, [selectedWallFacet?.id, selectedWallFacet?.heightM]);

  React.useEffect(() => {
    setLevelZDrafts((prev) => {
      const next: Record<string, string> = {};
      levels.forEach((lvl) => {
        next[lvl.id] =
          focusedFieldRef.current === `lvlZ:${lvl.id}`
            ? prev[lvl.id] ?? String(+lvl.eaveHeightM.toFixed(2))
            : String(+lvl.eaveHeightM.toFixed(2));
      });
      return next;
    });
  }, [levels]);

  const allPlanEdges = React.useMemo(() => {
    const map = new Map<string, RoofOutline['edges'][number]>();
    (outline?.edges || []).forEach((e) => map.set(e.id, e));
    levels.forEach((lvl) => lvl.outline.edges.forEach((e) => map.set(e.id, e)));
    return Array.from(map.values());
  }, [outline, levels]);
  const selectedEdgesList = React.useMemo(
    () => allPlanEdges.filter((e) => selectedEdgeIds.includes(e.id)),
    [allPlanEdges, selectedEdgeIds]
  );
  const allSkeletonLines = React.useMemo(() => {
    const map = new Map<string, RoofLevel['skeleton'][number]>();
    levels.forEach((lvl) => lvl.skeleton.forEach((s) => map.set(s.id, s)));
    return Array.from(map.values());
  }, [levels]);
  const selectedSkeletonList = React.useMemo(
    () => allSkeletonLines.filter((s) => selectedSkeletonLineIds.includes(s.id)),
    [allSkeletonLines, selectedSkeletonLineIds]
  );
  const selectedWallFacetsList = React.useMemo(
    () => wallFacets.filter((f) => selectedWallFacetIds.includes(f.id)),
    [wallFacets, selectedWallFacetIds]
  );

  const hasMultiRoofOrWallSelection =
    !selectedAsset &&
    !selectedPitchBreak &&
    (selectedPlanesList.length >= 2 ||
      selectedEdgesList.length >= 2 ||
      selectedSkeletonList.length >= 2 ||
      selectedWallFacetsList.length >= 2);

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

  const clearMultiSelections = () => {
    onChangeSelectedPlaneIds?.([]);
    onChangeSelectedEdgeIds?.([]);
    onChangeSelectedSkeletonLineIds?.([]);
    onChangeSelectedWallFacetIds?.([]);
  };

  const focusedLevelPlanes = planes.filter((p) =>
    activeLevelId === 'all' ? true : (p.levelId || 'level-1') === activeLevelId
  );
  const focusedLevelEaveIds = (
    activeLevelId === 'all'
      ? allPlanEdges
      : levels.find((l) => l.id === activeLevelId)?.outline.edges || outline?.edges || []
  )
    .filter((e) => e.type === 'outline')
    .map((e) => e.id);
  const allEaveEdgeIds = allPlanEdges.filter((e) => e.type === 'outline').map((e) => e.id);
  const allUnclassifiedEdgeIds = allPlanEdges
    .filter((e) => e.type === 'unclassified')
    .map((e) => e.id);
  const allUndetailedWallIds = wallFacets
    .filter((f) => isWallFacetUndetailed(f))
    .map((f) => f.id);

  const inspectorBody = (
    <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs font-sans">
      {hasMultiRoofOrWallSelection ? (() => {
        const distinctPitches = new Set(selectedPlanesList.map((p) => p.pitchDeg));
        const commonPitch =
          selectedPlanesList.length > 0 && distinctPitches.size === 1
            ? selectedPlanesList[0].pitchDeg
            : null;
        const distinctDirs = new Set(selectedPlanesList.map((p) => p.underlapSide));
        const commonDir =
          selectedPlanesList.length > 0 && distinctDirs.size === 1
            ? selectedPlanesList[0].underlapSide
            : null;

        const distinctEdgeTypes = new Set(selectedEdgesList.map((e) => e.type));
        const commonEdgeType =
          selectedEdgesList.length > 0 && distinctEdgeTypes.size === 1
            ? selectedEdgesList[0].type
            : null;
        const distinctEdgeWall = new Set(selectedEdgesList.map((e) => isEdgeWallEnabled(e)));
        const commonEdgeWall =
          selectedEdgesList.length > 0 && distinctEdgeWall.size === 1
            ? isEdgeWallEnabled(selectedEdgesList[0])
            : null;

        const distinctSkelTypes = new Set(selectedSkeletonList.map((s) => s.suggestedType));
        const commonSkelType =
          selectedSkeletonList.length > 0 && distinctSkelTypes.size === 1
            ? selectedSkeletonList[0].suggestedType
            : null;

        const distinctWallClad = new Set(selectedWallFacetsList.map((f) => f.claddingType));
        const commonWallClad =
          selectedWallFacetsList.length > 0 && distinctWallClad.size === 1
            ? selectedWallFacetsList[0].claddingType
            : null;
        const distinctWallKind = new Set(selectedWallFacetsList.map((f) => getWallFacetKind(f)));
        const commonWallKind =
          selectedWallFacetsList.length > 0 && distinctWallKind.size === 1
            ? getWallFacetKind(selectedWallFacetsList[0])
            : null;
        const distinctWallHeightSrc = new Set(
          selectedWallFacetsList.map((f) => f.heightSource || 'manual')
        );
        const commonWallHeightSrc =
          selectedWallFacetsList.length > 0 && distinctWallHeightSrc.size === 1
            ? selectedWallFacetsList[0].heightSource || 'manual'
            : null;

        return (
          <div className="space-y-3">
            {/* Multi-select header & quick presets */}
            <div className="bg-sky-950/35 border border-sky-500/45 p-3.5 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-sky-300 font-bold">
                    Multi-Select Batch Edit
                  </div>
                  <div className="text-xs font-black text-white mt-0.5 tabular-nums">
                    {[
                      selectedPlanesList.length >= 2 ? `${selectedPlanesList.length} Faces` : null,
                      selectedEdgesList.length >= 2 ? `${selectedEdgesList.length} Edges` : null,
                      selectedSkeletonList.length >= 2 ? `${selectedSkeletonList.length} Lines` : null,
                      selectedWallFacetsList.length >= 2 ? `${selectedWallFacetsList.length} Walls` : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {!isLockedView && canUndo && onUndo && (
                    <button
                      type="button"
                      onClick={onUndo}
                      className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Undo2 className="w-3 h-3" />
                      <span>Undo</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearMultiSelections}
                    className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 text-[10px] font-bold cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {onChangeSelectedPlaneIds && focusedLevelPlanes.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => onChangeSelectedPlaneIds(focusedLevelPlanes.map((p) => p.id))}
                    className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    This Level Faces ({focusedLevelPlanes.length})
                  </button>
                )}
                {onChangeSelectedEdgeIds && activeLevelId !== 'all' && focusedLevelEaveIds.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => onChangeSelectedEdgeIds(focusedLevelEaveIds)}
                    className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 text-emerald-300 text-[10px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    Level Eaves ({focusedLevelEaveIds.length})
                  </button>
                )}
                {onChangeSelectedEdgeIds && allEaveEdgeIds.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => onChangeSelectedEdgeIds(allEaveEdgeIds)}
                    className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 text-[10px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    All Eaves ({allEaveEdgeIds.length})
                  </button>
                )}
                {onChangeSelectedEdgeIds && allUnclassifiedEdgeIds.length >= 1 && (
                  <button
                    type="button"
                    onClick={() => onChangeSelectedEdgeIds(allUnclassifiedEdgeIds)}
                    className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-900 border border-amber-500/35 text-amber-300 text-[10px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    Unclassified ({allUnclassifiedEdgeIds.length})
                  </button>
                )}
                {onChangeSelectedWallFacetIds && allUndetailedWallIds.length >= 1 && (
                  <button
                    type="button"
                    onClick={() => onChangeSelectedWallFacetIds(allUndetailedWallIds)}
                    className="px-2 py-1 rounded-lg bg-slate-950 hover:bg-slate-900 border border-amber-500/35 text-amber-300 text-[10px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    Undetailed Walls ({allUndetailedWallIds.length})
                  </button>
                )}
              </div>
            </div>

            {/* Batch Roof Faces Card */}
            {selectedPlanesList.length >= 2 && (
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-200 text-[11px] uppercase tracking-wider">
                    Batch Apply · {selectedPlanesList.length} Roof Faces
                  </span>
                  <span className="text-[10px] font-mono text-sky-300 tabular-nums">
                    {commonPitch !== null ? `${commonPitch}°` : 'Multiple'}
                  </span>
                </div>

                {!isLockedView && onBatchPlanePitch && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-400">Draft Pitch</span>
                      <span className="font-mono font-black text-xs text-sky-300 tabular-nums">
                        {batchPitchDraft}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={50}
                      step={0.5}
                      value={batchPitchDraft}
                      onChange={(e) => setBatchPitchDraft(parseFloat(e.target.value))}
                      className="w-full accent-sky-500 cursor-pointer h-2"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onBatchPlanePitch(
                          selectedPlanesList.map((p) => p.id),
                          batchPitchDraft
                        )
                      }
                      className="w-full py-1.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-extrabold cursor-pointer whitespace-nowrap"
                    >
                      Apply {batchPitchDraft}° to {selectedPlanesList.length} faces
                    </button>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[5, 12, 15, 22.5, 30].map((deg) => (
                        <button
                          key={deg}
                          type="button"
                          onClick={() => {
                            setBatchPitchDraft(deg);
                            onBatchPlanePitch(
                              selectedPlanesList.map((p) => p.id),
                              deg
                            );
                          }}
                          className={`py-1.5 rounded-lg text-[10px] font-mono font-bold border cursor-pointer ${
                            commonPitch !== null && Math.abs(commonPitch - deg) < 0.2
                              ? 'bg-sky-600 text-white border-sky-400'
                              : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                          }`}
                        >
                          {deg}°
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!isLockedView && onBatchPlaneDirection && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                      <span>Lay Direction (Underlap)</span>
                      <span className="text-slate-300 font-mono">
                        {commonDir ? (commonDir === 'left' ? 'Left → Right' : 'Right → Left') : 'Multiple'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800">
                      <button
                        type="button"
                        onClick={() =>
                          onBatchPlaneDirection(
                            selectedPlanesList.map((p) => p.id),
                            'left'
                          )
                        }
                        className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                          commonDir === 'left'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Left → Right
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onBatchPlaneDirection(
                            selectedPlanesList.map((p) => p.id),
                            'right'
                          )
                        }
                        className={`py-1.5 rounded-lg text-[11px] font-bold cursor-pointer ${
                          commonDir === 'right'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Right → Left
                      </button>
                    </div>
                  </div>
                )}

                {!isLockedView && onBatchPlaneEaveHeight && (
                  <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                    <span className="text-[10px] font-bold text-amber-300">Eave Z (m)</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="15"
                        value={batchPlaneZ}
                        onChange={(e) => setBatchPlaneZ(e.target.value)}
                        className="w-16 bg-slate-900 border border-amber-500/40 rounded px-2 py-1 text-right font-mono font-bold text-white text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = parseFloat(batchPlaneZ);
                          if (Number.isFinite(val) && val >= 0.5) {
                            onBatchPlaneEaveHeight(
                              selectedPlanesList.map((p) => p.id),
                              val
                            );
                          }
                        }}
                        className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-extrabold cursor-pointer"
                      >
                        Apply Z
                      </button>
                    </div>
                  </div>
                )}

                {!isLockedView && onBatchPlaneOrderedSheetLength && (
                  <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                    <span className="text-[10px] font-bold text-sky-300">BOM Sheet (mm)</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="10"
                        min="300"
                        max="30000"
                        placeholder="e.g. 5450"
                        value={batchSheetMm}
                        onChange={(e) => setBatchSheetMm(e.target.value)}
                        className="w-20 bg-slate-900 border border-sky-500/40 rounded px-2 py-1 text-right font-mono font-bold text-white text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const parsed = parseFloat(batchSheetMm);
                          if (Number.isFinite(parsed) && parsed >= 300) {
                            onBatchPlaneOrderedSheetLength(
                              selectedPlanesList.map((p) => p.id),
                              +(Math.round(parsed) / 1000).toFixed(3)
                            );
                          }
                        }}
                        className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-extrabold cursor-pointer"
                      >
                        Set
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onBatchPlaneOrderedSheetLength(
                            selectedPlanesList.map((p) => p.id),
                            undefined
                          )
                        }
                        className="px-1.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold cursor-pointer"
                      >
                        Auto
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Batch Perimeter Edges Card */}
            {selectedEdgesList.length >= 2 && (
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-200 text-[11px] uppercase tracking-wider">
                    Batch Apply · {selectedEdgesList.length} Perimeter Edges
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-sky-300">
                    {commonEdgeType ? getRoofEdgeTypeMeta(commonEdgeType).shortLabel : 'Multiple'}
                  </span>
                </div>

                {!isLockedView && onBatchEdgeType && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {ROOF_LINE_TYPE_CATALOG.map((item) => {
                      const active = commonEdgeType === item.edgeType;
                      return (
                        <button
                          key={item.edgeType}
                          type="button"
                          onClick={() =>
                            onBatchEdgeType(
                              selectedEdgesList.map((e) => e.id),
                              item.edgeType
                            )
                          }
                          className={`px-2 py-1.5 rounded-xl border text-left text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                            active
                              ? 'bg-sky-600/25 border-sky-400 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.colorHex }}
                          />
                          <span className="truncate">{item.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!isLockedView && onBatchEdgeHeight && (
                  <div className="flex items-center justify-between gap-2 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5">
                    <span className="text-[10px] font-bold text-amber-300">Edge Z (m)</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.1"
                        min="0.5"
                        max="15"
                        value={batchEdgeZ}
                        onChange={(e) => setBatchEdgeZ(e.target.value)}
                        className="w-16 bg-slate-900 border border-amber-500/40 rounded px-2 py-1 text-right font-mono font-bold text-white text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = parseFloat(batchEdgeZ);
                          if (Number.isFinite(val) && val >= 0.5) {
                            onBatchEdgeHeight(
                              selectedEdgesList.map((e) => e.id),
                              val
                            );
                          }
                        }}
                        className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-extrabold cursor-pointer"
                      >
                        Apply Z
                      </button>
                    </div>
                  </div>
                )}

                {!isLockedView && onBatchEdgeWall && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-300">
                        Wall Below Roof ({commonEdgeWall === null ? 'Multiple' : commonEdgeWall ? 'ON' : 'OFF'})
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            onBatchEdgeWall(
                              selectedEdgesList.map((e) => e.id),
                              { hasWall: true }
                            )
                          }
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            commonEdgeWall === true
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          Wall ON
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onBatchEdgeWall(
                              selectedEdgesList.map((e) => e.id),
                              { hasWall: false }
                            )
                          }
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            commonEdgeWall === false
                              ? 'bg-slate-700 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          OFF
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[10px] text-slate-400 font-bold">Eave Setback</span>
                      <div className="flex items-center gap-1">
                        {[0, 0.45, 0.6].map((sb) => (
                          <button
                            key={sb}
                            type="button"
                            onClick={() =>
                              onBatchEdgeWall(
                                selectedEdgesList.map((e) => e.id),
                                { hasWall: true, eaveSetbackM: sb }
                              )
                            }
                            className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-sky-600 text-slate-200 text-[10px] font-mono font-bold cursor-pointer"
                          >
                            {sb === 0 ? '0m' : `${sb}m`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Batch Roof Skeleton Lines Card */}
            {selectedSkeletonList.length >= 2 && (
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-200 text-[11px] uppercase tracking-wider">
                    Batch Apply · {selectedSkeletonList.length} Roof Lines
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-sky-300">
                    {commonSkelType ? getSkeletonLineTypeMeta(commonSkelType).shortLabel : 'Multiple'}
                  </span>
                </div>

                {!isLockedView && onBatchSkeletonLineType && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {ROOF_LINE_TYPE_CATALOG.map((item) => {
                      const active = commonSkelType === item.lineType;
                      return (
                        <button
                          key={item.lineType}
                          type="button"
                          onClick={() =>
                            onBatchSkeletonLineType(
                              selectedSkeletonList.map((s) => s.id),
                              item.lineType
                            )
                          }
                          className={`px-2 py-1.5 rounded-xl border text-left text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                            active
                              ? 'bg-sky-600/25 border-sky-400 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: item.colorHex }}
                          />
                          <span className="truncate">{item.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Batch Wall Facets Card */}
            {selectedWallFacetsList.length >= 2 && (
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-200 text-[11px] uppercase tracking-wider">
                    Batch Apply · {selectedWallFacetsList.length} Wall Faces
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-300">
                    {commonWallClad ? getWallCladdingMeta(commonWallClad).shortLabel : 'Multiple'}
                  </span>
                </div>

                {!isLockedView && onBatchWallUpdate && (
                  <>
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">
                        Cladding Material
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {WALL_CLADDING_OPTIONS.map((opt) => (
                          <button
                            key={opt.type}
                            type="button"
                            onClick={() =>
                              onBatchWallUpdate(
                                selectedWallFacetsList.map((f) => f.id),
                                { claddingType: opt.type as WallCladdingType }
                              )
                            }
                            className={`px-2 py-1.5 rounded-xl border text-left text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                              commonWallClad === opt.type
                                ? 'bg-sky-600/25 border-sky-400 text-white'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0 border border-white/20"
                              style={{ backgroundColor: opt.hex }}
                            />
                            <span className="truncate">{opt.shortLabel}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                        <span>Wall Role / Kind</span>
                        <span className="font-mono text-slate-300">
                          {commonWallKind ? getWallFacetKindMeta(commonWallKind).shortLabel : 'Multiple'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {WALL_FACET_KIND_OPTIONS.map((opt) => (
                          <button
                            key={opt.kind}
                            type="button"
                            onClick={() =>
                              onBatchWallUpdate(
                                selectedWallFacetsList.map((f) => f.id),
                                { kind: opt.kind }
                              )
                            }
                            className={`px-2 py-1.5 rounded-xl border text-left text-[10px] font-bold truncate cursor-pointer transition-colors ${
                              commonWallKind === opt.kind
                                ? 'bg-amber-600/25 border-amber-400 text-white'
                                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            {opt.shortLabel}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-slate-300">Height Source</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              onBatchWallUpdate(
                                selectedWallFacetsList.map((f) => f.id),
                                { heightSource: 'roof' }
                              )
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              commonWallHeightSrc === 'roof'
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:text-white'
                            }`}
                          >
                            From Roof
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onBatchWallUpdate(
                                selectedWallFacetsList.map((f) => f.id),
                                { heightSource: 'manual' }
                              )
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              commonWallHeightSrc === 'manual'
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300 hover:text-white'
                            }`}
                          >
                            Manual
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-amber-300">Height (m)</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            step="0.05"
                            min="0.4"
                            max="12"
                            value={batchWallH}
                            onChange={(e) => setBatchWallH(e.target.value)}
                            className="w-16 bg-slate-900 border border-amber-500/40 rounded px-2 py-1 text-right font-mono font-bold text-white text-[11px]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const val = parseFloat(batchWallH);
                              if (Number.isFinite(val) && val >= 0.4) {
                                onBatchWallUpdate(
                                  selectedWallFacetsList.map((f) => f.id),
                                  { heightM: val }
                                );
                              }
                            }}
                            className="px-2 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[10px] font-extrabold cursor-pointer"
                          >
                            Apply H
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })() : selectedAsset ? (() => {
        const hostPlane = planes.find((p) => p.id === selectedAsset.planeId) || null;
        const metrics = hostPlane
          ? computeAssetPlacementMetrics(hostPlane, selectedAsset)
          : null;
        const isDormer =
          selectedAsset.type === 'mono_dormer' || selectedAsset.type === 'gable_dormer';
        return (
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
              Edit exact distances from the host eave or apex/ridge, or drag on Plan View.
            </p>
            {planes.length > 0 && (
              <div className="pt-1">
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Host Roof Face
                </label>
                <select
                  disabled={isLockedView}
                  value={hostPlane?.id || ''}
                  onChange={(e) => {
                    const nextPlane = planes.find((p) => p.id === e.target.value);
                    if (nextPlane && onUpdateAsset) {
                      onUpdateAsset(repositionAssetToPlane(nextPlane, selectedAsset));
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white focus:outline-hidden focus:border-cyan-400 disabled:opacity-60"
                >
                  {!hostPlane && <option value="">Unassigned — pick host face</option>}
                  {planes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}: {p.name} ({p.pitchDeg}°)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {hostPlane && metrics && (
            <div className="bg-slate-900/90 border border-cyan-500/30 p-3.5 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-cyan-300 text-[11px] uppercase tracking-wider">
                  Slope Placement (Plan &amp; 3D Synced)
                </span>
                <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                  Run {metrics.runSlopeM.toFixed(2)}m
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 space-y-1">
                  <label className="text-[10px] text-sky-300 font-bold block">
                    {isDormer ? 'Front from Eave (m)' : 'From Eave (slope m)'}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.05"
                    max={Math.max(0.5, +(metrics.runSlopeM - metrics.depthSlopeM).toFixed(2))}
                    disabled={isLockedView}
                    value={metrics.distFromEaveM}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (Number.isFinite(val) && val >= 0 && onUpdateAsset) {
                        onUpdateAsset(
                          updateAssetFromPlacement(hostPlane, selectedAsset, {
                            distFromEaveM: val
                          })
                        );
                      }
                    }}
                    className="w-full bg-slate-900 border border-sky-500/40 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs tabular-nums focus:outline-hidden focus:border-sky-400 disabled:opacity-60"
                  />
                </div>

                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 space-y-1">
                  <label className="text-[10px] text-purple-300 font-bold block">
                    {isDormer ? 'Tie Clear to Apex (m)' : 'From Apex / Ridge (m)'}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max={Math.max(0.5, +(metrics.runSlopeM - metrics.depthSlopeM).toFixed(2))}
                    disabled={isLockedView}
                    value={metrics.distFromApexM}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (Number.isFinite(val) && val >= 0 && onUpdateAsset) {
                        onUpdateAsset(
                          updateAssetFromPlacement(hostPlane, selectedAsset, {
                            distFromApexM: val
                          })
                        );
                      }
                    }}
                    className="w-full bg-slate-900 border border-purple-500/40 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs tabular-nums focus:outline-hidden focus:border-purple-400 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                <label className="text-[10px] text-slate-300 font-bold">
                  Offset from Left Edge (m)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.2"
                  max={Math.max(1, +(metrics.eaveWidthM - 0.2).toFixed(2))}
                  disabled={isLockedView}
                  value={metrics.offsetFromLeftM}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (Number.isFinite(val) && val >= 0 && onUpdateAsset) {
                      onUpdateAsset(
                        updateAssetFromPlacement(hostPlane, selectedAsset, {
                          offsetFromLeftM: val
                        })
                      );
                    }
                  }}
                  className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white font-mono font-bold text-xs tabular-nums text-right focus:outline-hidden focus:border-cyan-400 disabled:opacity-60"
                />
              </div>
            </div>
          )}

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
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!onUpdateAsset) return;
                  if (hostPlane) {
                    onUpdateAsset(
                      updateAssetFromPlacement(hostPlane, selectedAsset, { widthM: val })
                    );
                  } else {
                    onUpdateAsset({ ...selectedAsset, widthM: val });
                  }
                }}
                className="w-full accent-cyan-500 cursor-pointer h-2"
              />
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="font-bold text-slate-300 text-[11px]">Depth (plan run)</label>
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
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!onUpdateAsset) return;
                  if (hostPlane) {
                    onUpdateAsset(
                      updateAssetFromPlacement(hostPlane, selectedAsset, { depthM: val })
                    );
                  } else {
                    onUpdateAsset({ ...selectedAsset, depthM: val });
                  }
                }}
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
        );
      })() : selectedPitchBreak ? (
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
                  className="px-3 py-1.5 rounded-xl bg-indigo-950/70 hover:bg-indigo-600/40 text-indigo-300 hover:text-white border border-indigo-500/40 text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap"
                >
                  Convert to Gable End
                </button>
              )}

              {!isLockedView && onChangeSelectedPlaneIds && focusedLevelPlanes.length >= 2 && (
                <button
                  type="button"
                  onClick={() => onChangeSelectedPlaneIds(focusedLevelPlanes.map((p) => p.id))}
                  className="px-3 py-1.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-700/40 text-cyan-200 border border-cyan-500/40 text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap"
                >
                  Batch ({focusedLevelPlanes.length} level faces)
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
                      value={planeEaveLenDraft}
                      onFocus={(e) => {
                        focusedFieldRef.current = 'planeEaveLen';
                        e.currentTarget.select();
                      }}
                      onChange={(e) => setPlaneEaveLenDraft(e.target.value)}
                      onBlur={() => {
                        focusedFieldRef.current = null;
                        const val = parseFloat(planeEaveLenDraft);
                        if (Number.isFinite(val) && val > 0.4 && onUpdateEdgeLength && selectedPlane.eaveEdgeId) {
                          onUpdateEdgeLength(selectedPlane.eaveEdgeId, val);
                          setPlaneEaveLenDraft(String(+val.toFixed(2)));
                        } else {
                          setPlaneEaveLenDraft(String(currentPlaneEaveLen));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                        if (e.key === 'Escape') {
                          focusedFieldRef.current = null;
                          setPlaneEaveLenDraft(String(currentPlaneEaveLen));
                          (e.currentTarget as HTMLInputElement).blur();
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
                      value={planeEaveZDraft}
                      onFocus={(e) => {
                        focusedFieldRef.current = 'planeEaveZ';
                        e.currentTarget.select();
                      }}
                      onChange={(e) => setPlaneEaveZDraft(e.target.value)}
                      onBlur={() => {
                        focusedFieldRef.current = null;
                        const val = parseFloat(planeEaveZDraft);
                        if (Number.isFinite(val) && val >= 0.5 && onUpdatePlaneEaveHeight) {
                          onUpdatePlaneEaveHeight(selectedPlane.id, val);
                          setPlaneEaveZDraft(String(+val.toFixed(2)));
                        } else {
                          setPlaneEaveZDraft(String(currentPlaneEaveZ));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                        if (e.key === 'Escape') {
                          focusedFieldRef.current = null;
                          setPlaneEaveZDraft(String(currentPlaneEaveZ));
                          (e.currentTarget as HTMLInputElement).blur();
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
                              value={planeSetbackDraft}
                              onFocus={(e) => {
                                focusedFieldRef.current = 'planeSetback';
                                e.currentTarget.select();
                              }}
                              onChange={(e) => setPlaneSetbackDraft(e.target.value)}
                              onBlur={() => {
                                focusedFieldRef.current = null;
                                const val = parseFloat(planeSetbackDraft);
                                if (Number.isFinite(val) && val >= 0) {
                                  const clamped = Math.min(3, +val.toFixed(2));
                                  onUpdateEdgeWall(edgeObj.id, { eaveSetbackM: clamped });
                                  setPlaneSetbackDraft(String(clamped));
                                } else {
                                  setPlaneSetbackDraft(String(setbackVal));
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                                if (e.key === 'Escape') {
                                  focusedFieldRef.current = null;
                                  setPlaneSetbackDraft(String(setbackVal));
                                  (e.currentTarget as HTMLInputElement).blur();
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
      ) : selectedWallFacet ? (() => {
        const selMetrics = computeWallFacetMetrics(selectedWallFacet);
        const selPrim = getFacetPrimaryDisplayCladding(selectedWallFacet);
        const selRoofMatch = resolveRoofTopForWallFacet(selectedWallFacet, levels, planes);
        const isRet = returnFacetIdSet.has(selectedWallFacet.id);
        return (
          <div className="space-y-3">
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-6 h-6 rounded-lg flex items-center justify-center font-mono font-black text-xs text-white border border-white/20 shrink-0"
                    style={{ backgroundColor: getWallCladdingMeta(selPrim).hex }}
                  >
                    {selectedWallFacet.code}
                  </span>
                  <span className="font-black text-sm text-white">
                    Wall Face {selectedWallFacet.code}{isRet ? ' (Return)' : ''}
                  </span>
                </div>
                <button
                  onClick={() => onSelectWallFacet?.(null)}
                  className="text-[10px] font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
                >
                  All Faces
                </button>
              </div>
              <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                {selectedWallFacet.lengthM.toFixed(2)}m L × {selectedWallFacet.heightM.toFixed(2)}m H ·{' '}
                {selMetrics.netCladdingAreaM2.toFixed(2)} m² net
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                <span className={selectedWallFacet.heightSource === 'roof' ? 'text-sky-300 font-bold' : 'text-slate-400 font-bold'}>
                  Height: {selectedWallFacet.heightSource === 'roof' ? 'From Roof Eave' : 'Manual'}
                </span>
                {selectedWallFacet.underlay && (
                  <span className="text-emerald-300 font-bold">
                    Underlay attached
                  </span>
                )}
              </div>
              {!isLockedView && onChangeSelectedWallFacetIds && wallFacets.length >= 2 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => onChangeSelectedWallFacetIds(wallFacets.map((f) => f.id))}
                    className="px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-700/40 text-cyan-200 border border-cyan-500/40 text-[10px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    Batch ({wallFacets.length} walls)
                  </button>
                </div>
              )}
              {!isLockedView && onUpdateWallFacet && (() => {
                const curKind = getWallFacetKind(selectedWallFacet);
                return (
                  <div className="pt-1.5 border-t border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Wall Role
                      </span>
                      <select
                        value={curKind}
                        onChange={(e) =>
                          onUpdateWallFacet(
                            updateWallFacetKind(selectedWallFacet, e.target.value as WallFacetKind)
                          )
                        }
                        className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-100 focus:outline-hidden focus:border-sky-400"
                      >
                        {WALL_FACET_KIND_OPTIONS.map((opt) => (
                          <option key={opt.kind} value={opt.kind}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {curKind === 'parapet' && (
                      <div className="flex items-center justify-between gap-2 bg-purple-950/35 border border-purple-500/30 rounded-xl px-2.5 py-1.5 text-[11px]">
                        <label className="flex items-center gap-1.5 text-purple-200 font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedWallFacet.hasCopingFlashing !== false}
                            onChange={(e) =>
                              onUpdateWallFacet({
                                ...selectedWallFacet,
                                hasCopingFlashing: e.target.checked
                              })
                            }
                            className="accent-purple-400"
                          />
                          <span>Parapet Coping Cap</span>
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-purple-300">H</span>
                          <input
                            type="number"
                            step="0.05"
                            min="0.4"
                            max="8"
                            value={parapetHDraft}
                            onFocus={(e) => {
                              focusedFieldRef.current = 'parapetH';
                              e.currentTarget.select();
                            }}
                            onChange={(e) => setParapetHDraft(e.target.value)}
                            onBlur={() => {
                              focusedFieldRef.current = null;
                              const val = parseFloat(parapetHDraft);
                              if (Number.isFinite(val) && val >= 0.4) {
                                const clamped = Math.min(8, +val.toFixed(2));
                                onUpdateWallFacet(
                                  updateWallFacetKind(selectedWallFacet, 'parapet', {
                                    parapetHeightM: clamped
                                  })
                                );
                                setParapetHDraft(String(clamped));
                              } else {
                                setParapetHDraft(String(+selectedWallFacet.heightM.toFixed(2)));
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                              if (e.key === 'Escape') {
                                focusedFieldRef.current = null;
                                setParapetHDraft(String(+selectedWallFacet.heightM.toFixed(2)));
                                (e.currentTarget as HTMLInputElement).blur();
                              }
                            }}
                            className="w-14 bg-slate-900 border border-purple-500/40 rounded px-1.5 py-0.5 text-right font-mono font-bold text-white text-[11px] tabular-nums"
                          />
                          <span className="text-[10px] text-purple-300">m</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
              {!isLockedView && selRoofMatch && onUpdateWallFacet && getWallFacetKind(selectedWallFacet) !== 'parapet' && getWallFacetKind(selectedWallFacet) !== 'wing' && getWallFacetKind(selectedWallFacet) !== 'secondary' && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateWallFacet(fitWallFacetTopToRoof(selectedWallFacet, levels, planes))
                  }
                  className="w-full py-1.5 px-2.5 rounded-xl bg-sky-950/60 hover:bg-sky-900/70 border border-sky-500/40 text-sky-200 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Fit Top to Roof ({selRoofMatch.topZ.toFixed(2)}m Z)</span>
                </button>
              )}
            </div>

            {selectedWallFacet.regions && selectedWallFacet.regions.length > 1 ? (
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2">
                <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Mixed Cladding Regions ({selectedWallFacet.regions.length})
                </div>
                <div className="space-y-1.5">
                  {selMetrics.regionBreakdown.map((rb, idx) => (
                    <div
                      key={rb.regionId || idx}
                      className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px]"
                    >
                      <span className="font-bold text-slate-200">
                        {rb.label || `Zone ${idx + 1}`} · {getWallCladdingMeta(rb.claddingType).shortLabel}
                      </span>
                      <span className="font-mono font-bold text-emerald-400 tabular-nums">
                        {rb.netAreaM2.toFixed(2)} m²
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2.5">
                <div className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Cladding Material
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {WALL_CLADDING_OPTIONS.map((opt) => {
                    const active = selectedWallFacet.claddingType === opt.type;
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        disabled={isLockedView || !onUpdateWallFacet}
                        onClick={() =>
                          onUpdateWallFacet?.({
                            ...selectedWallFacet,
                            claddingType: opt.type as WallCladdingType
                          })
                        }
                        className={`px-2 py-1.5 rounded-xl border text-left text-[11px] font-bold flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60 ${
                          active
                            ? 'bg-sky-600/25 border-sky-400 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0 border border-white/20"
                          style={{ backgroundColor: opt.hex }}
                        />
                        <span className="truncate">{opt.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 text-xs tabular-nums">
              <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Gross</div>
                <div className="font-mono font-black text-white mt-0.5">
                  {selMetrics.grossAreaM2.toFixed(1)}m²
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Openings</div>
                <div className="font-mono font-black text-amber-400 mt-0.5">
                  {selectedWallFacet.openings.length} pcs
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Net Wall</div>
                <div className="font-mono font-black text-emerald-400 mt-0.5">
                  {selMetrics.netCladdingAreaM2.toFixed(1)}m²
                </div>
              </div>
            </div>

            {onOpenWallElevation && (
              <button
                type="button"
                onClick={() => {
                  onOpenWallElevation(selectedWallFacet.id);
                  if (isMobile) onClose();
                }}
                className="w-full py-2.5 px-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Open Elevation Workbench</span>
              </button>
            )}
          </div>
        );
      })() : (
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

          {/* Takeoff Completeness Gate & Action Prompts */}
          {completenessReport && (
            <div
              className={`border p-3.5 rounded-2xl space-y-2 ${
                completenessReport.isComplete
                  ? 'bg-emerald-950/30 border-emerald-500/40'
                  : 'bg-amber-950/35 border-amber-500/45'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider">
                  {completenessReport.isComplete ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">Takeoff Complete</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-300">
                        Needs Review ({completenessReport.totalIssuesCount})
                      </span>
                    </>
                  )}
                </div>
                {completenessReport.undetailedReturnsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold">
                    {completenessReport.undetailedReturnsCount} ret
                  </span>
                )}
              </div>

              {!completenessReport.isComplete && (
                <>
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
                    {completenessReport.undetailedWallsCount > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/30">
                        {completenessReport.undetailedWallsCount} Undetailed Walls
                      </span>
                    )}
                    {completenessReport.unassignedFlashingsCount > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-200 border border-sky-500/30">
                        {completenessReport.unassignedFlashingsCount} Flashings
                      </span>
                    )}
                    {completenessReport.incompletePlanesCount > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-200 border border-rose-500/30">
                        {completenessReport.incompletePlanesCount} Planes
                      </span>
                    )}
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                    {completenessReport.issues.slice(0, 6).map((issue) => (
                      <button
                        key={issue.id}
                        type="button"
                        onClick={() => onJumpToCompletenessIssue?.(issue)}
                        className="w-full text-left px-2.5 py-1.5 rounded-xl bg-slate-950/75 hover:bg-slate-900 border border-slate-800/80 flex items-center justify-between gap-2 text-[11px] cursor-pointer transition-colors"
                      >
                        <span className="text-slate-200 truncate font-medium">{issue.title}</span>
                        <span className="text-sky-400 font-bold text-[10px] shrink-0">Fix →</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {layout && (
            <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Total Area</div>
                <div className="text-base font-black text-white font-mono mt-0.5">
                  {layout.totalRoofArea.toFixed(1)} m²
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Ordered Sheets</div>
                <div className="text-base font-black text-sky-400 font-mono mt-0.5">
                  {layout.parents.length} sht · {layout.totalOrderedMetres.toFixed(1)}m
                </div>
              </div>
              <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                <div className="text-[10px] text-slate-500 uppercase font-bold">Sheet Yield</div>
                <div className="text-base font-black text-white font-mono mt-0.5">
                  {100 - layout.wastePercent}%
                </div>
              </div>
              {isInstalling ? (
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Repressed Offcuts</div>
                  <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                    {layout.totalOffcutsReused} pcs
                  </div>
                </div>
              ) : (
                <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-500 uppercase font-bold">Repress Saved</div>
                  <div className="text-base font-black text-emerald-400 font-mono mt-0.5">
                    +{layout.savedMetres}m ({layout.totalOffcutsReused} pcs)
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
                              value={levelZDrafts[lvl.id] ?? String(+lvl.eaveHeightM.toFixed(2))}
                              onFocus={(e) => {
                                focusedFieldRef.current = `lvlZ:${lvl.id}`;
                                e.currentTarget.select();
                              }}
                              onChange={(e) =>
                                setLevelZDrafts((prev) => ({ ...prev, [lvl.id]: e.target.value }))
                              }
                              onBlur={() => {
                                focusedFieldRef.current = null;
                                const raw = levelZDrafts[lvl.id] ?? '';
                                const val = parseFloat(raw);
                                if (Number.isFinite(val) && val >= 0.5 && onUpdateLevelHeight) {
                                  const clamped = Math.min(15, +val.toFixed(2));
                                  onUpdateLevelHeight(lvl.id, clamped);
                                  setLevelZDrafts((prev) => ({ ...prev, [lvl.id]: String(clamped) }));
                                } else {
                                  setLevelZDrafts((prev) => ({
                                    ...prev,
                                    [lvl.id]: String(+lvl.eaveHeightM.toFixed(2))
                                  }));
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                                if (e.key === 'Escape') {
                                  focusedFieldRef.current = null;
                                  setLevelZDrafts((prev) => ({
                                    ...prev,
                                    [lvl.id]: String(+lvl.eaveHeightM.toFixed(2))
                                  }));
                                  (e.currentTarget as HTMLInputElement).blur();
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

          {/* Single-Storey Wall Cladding Schedule */}
          {(wallFacets.length > 0 || onBuildWallFaces) && (
            <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Wall Faces ({wallFacets.length})</span>
                </div>
                {wallFacets.length > 0 ? (
                  <span className="font-mono text-[11px] font-bold text-emerald-400 tabular-nums">
                    {wallSummary.totalNetAreaM2.toFixed(1)} m² net
                  </span>
                ) : (
                  !isLockedView &&
                  onBuildWallFaces && (
                    <button
                      type="button"
                      onClick={onBuildWallFaces}
                      className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/40 text-amber-300 text-[10px] font-bold cursor-pointer"
                    >
                      Build Faces
                    </button>
                  )
                )}
              </div>

              {wallFacets.length > 0 && (
                <>
                  {/* Filter & Corner/Openings Quick Telemetry */}
                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-400 tabular-nums">
                    <span>
                      {wallSummary.externalCornersCount} ext · {wallSummary.internalCornersCount} notch · {wallSummary.returnFacesCount} ret
                    </span>
                    <span>
                      {openingsSchedule.totalCount} openings ({openingsSchedule.totalAreaM2.toFixed(1)}m²)
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1 p-0.5 bg-slate-950 rounded-xl border border-slate-800 text-[10px] font-bold">
                    {(
                      [
                        { id: 'all', label: `All (${wallFacets.length})` },
                        { id: 'undetailed', label: `Need (${wallSummary.undetailedCount})` },
                        { id: 'returns', label: `Ret (${wallSummary.returnFacesCount})` },
                        { id: 'parapets', label: `Par (${wallSummary.parapetFacesCount})` },
                        { id: 'secondary', label: `Sec (${wallSummary.secondaryFacesCount})` },
                        { id: 'wings', label: `Wing (${wallSummary.wingFacesCount})` }
                      ] as const
                    ).map((fOpt) => (
                      <button
                        key={fOpt.id}
                        type="button"
                        onClick={() => setWallFilterMode(fOpt.id)}
                        className={`px-2 py-1 rounded-lg cursor-pointer transition-colors ${
                          wallFilterMode === fOpt.id
                            ? 'bg-amber-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {fOpt.label}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-1 max-h-44 overflow-y-auto pr-0.5">
                    {filteredWallFacets.map((wf) => {
                      const prim = getFacetPrimaryDisplayCladding(wf);
                      const meta = getWallCladdingMeta(prim);
                      const m = computeWallFacetMetrics(wf);
                      const isUndetailed = isWallFacetUndetailed(wf);
                      const isRet = returnFacetIdSet.has(wf.id);
                      return (
                        <button
                          key={wf.id}
                          type="button"
                          onClick={() => {
                            onSelectWallFacet?.(wf.id);
                          }}
                          className={`w-full text-left p-2 rounded-xl border flex items-center justify-between gap-2 text-xs cursor-pointer transition-colors ${
                            isUndetailed
                              ? 'bg-amber-950/20 border-amber-500/30 hover:border-amber-400/60'
                              : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-5 h-5 rounded-md flex items-center justify-center font-mono font-black text-[10px] text-white border border-white/20 shrink-0"
                              style={{ backgroundColor: meta.hex }}
                            >
                              {wf.code}
                            </span>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-200 truncate text-[11px] tabular-nums">
                                {wf.lengthM.toFixed(2)}m × {wf.heightM.toFixed(2)}m ·{' '}
                                {wf.regions && wf.regions.length > 1
                                  ? `${wf.regions.length} zones`
                                  : meta.shortLabel}
                                {isRet ? ' · Ret' : ''}
                                {getWallFacetKind(wf) !== 'exterior' && !isRet
                                  ? ` · ${getWallFacetKindMeta(getWallFacetKind(wf)).shortLabel}`
                                  : ''}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                                {wf.openings.length} openings · {m.netCladdingAreaM2.toFixed(1)} m²
                              </div>
                            </div>
                          </div>
                          {onOpenWallElevation && (
                            <span
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onOpenWallElevation(wf.id);
                                if (isMobile) onClose();
                              }}
                              className="text-[10px] font-bold text-sky-400 hover:text-sky-300 shrink-0"
                            >
                              {isUndetailed ? 'Detail' : 'Edit'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {wallSummary.byCladding.length > 0 && (
                    <div className="pt-1.5 border-t border-slate-800/80 space-y-1 text-[11px] tabular-nums">
                      {wallSummary.byCladding.map((grp) => (
                        <div
                          key={grp.claddingType}
                          className="flex items-center justify-between gap-2 text-slate-300"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="w-2 h-2 rounded-xs shrink-0"
                              style={{ backgroundColor: grp.hex }}
                            />
                            <span className="truncate">{grp.shortLabel}</span>
                          </div>
                          <span className="font-mono text-slate-400 shrink-0">
                            {grp.linealM.toFixed(1)}m · {grp.netAreaM2.toFixed(1)} m²
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

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
                  {hasMultiRoofOrWallSelection
                    ? 'Batch Edit Inspector'
                    : selectedPlane
                    ? 'Area Inspector'
                    : selectedWallFacet
                    ? `Wall ${selectedWallFacet.code} Inspector`
                    : 'Roof & Wall Overview'}
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
            {hasMultiRoofOrWallSelection
              ? 'Batch Edit Inspector'
              : selectedPlane
              ? 'Roof Area Inspector'
              : selectedWallFacet
              ? `Wall ${selectedWallFacet.code} Inspector`
              : 'Roof & Wall Overview'}
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
