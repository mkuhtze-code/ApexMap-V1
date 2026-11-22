import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CoilMaterial, FlashingProfile, Project, Quote, RoofingProfile } from '../../types/crm';
import {
  EdgeType,
  Point2D,
  RoofOutline,
  RoofLevel,
  SkeletonLine,
  PlanEdge,
  RoofPlane,
  SheetSpec,
  LayoutResult,
  RoofOutlinePresetKey,
  RoofAsset,
  PitchBreakLine,
  RoofFlashingAssignment,
  AssignableRoofLine,
  RoofLifecycleStage,
  RoofInstallProgress,
  ExactRoofModelSnapshot,
  RoofBomSummary,
  RoofPlanUnderlay,
  SkeletonLineType,
  TakeoffCompletenessIssue,
  WallCladdingType,
  WallFacet,
  WallFacetKind,
  WallFilterMode,
  WallHeightSource,
  WallPlan,
  OrderPack,
  SheetOrderComparisonSummary,
  SheetOrderMode
} from '../../types/exactRoofing';
import {
  getPresetOutline,
  generateSkeletonLines,
  createPlaneFromEdge,
  generateCuttingLayout,
  buildOutlineFromPoints,
  classifyOutlineEdge,
  scaleSkeletonUniformly,
  isPointInPolygon,
  toggleJunctionGable,
  toggleEdgeGable,
  setEdgeMode,
  setEdgeWall,
  updateEdgeLength,
  applyRoofStylePreset,
  syncPlanesWithOutlineAndSkeleton,
  createRoofLevel,
  syncMultiLevelPlanes,
  getMultiLevelPreset,
  getAssignableRoofLinesMultiLevel,
  computeFlashingPieceBreakdown,
  getRoofEdgeTypeMeta,
  applyEdgeType,
  applySkeletonLineType,
  applyEaveSetback,
  applyEaveHeightToEdges,
  applyPitchToPlanes,
  applyDirectionToPlanes,
  applyOrderedSheetLengthToPlanes,
  dist
} from '../../utils/exactRoofingEngine';
import {
  batchUpdateWallFacetsInPlan,
  deriveRoofOutlineFromWallPlan,
  deriveWallPlanFromRoofLevels,
  ensureUniqueWallFacetIds,
  syncWallPlanWithRoof
} from '../../utils/wallCladdingEngine';
import { evaluateTakeoffCompleteness } from '../../utils/takeoffCompleteness';
import {
  extractAssignmentFlashingSpecs,
  getDefaultMitreNotes,
  getFlashingKindDisplayLabel,
  getMergedFlashingLibrary,
  saveProfileToSharedFlashingLibrary
} from '../../utils/exactRoofingFlashingBridge';
import {
  buildOrderPack,
  buildRoofBillOfMaterials,
  computeRoofingPacks,
  convertExactLayoutToRoofFacets
} from '../../utils/exactRoofingBomBridge';
import {
  buildAutoFlashingAssignments,
  DeterministicRoofAuditReport,
  DeterministicRoofPatch,
  normalizeAndVerifyAiRoofOutline,
  runDeterministicRoofAudit
} from '../../utils/exactRoofingAiBridge';
import { ExactRoofingCanvas } from './ExactRoofingCanvas';
import { ExactRoofing3DViewer } from './ExactRoofing3DViewer';
import { ExactRoofingInspectorDrawer } from './ExactRoofingInspectorDrawer';
import { WallPlanWorkspace } from './WallPlanWorkspace';
import { DefinePlaneModal } from './DefinePlaneModal';
import { ImportOutlineModal } from './ImportOutlineModal';
import { OffcutLayoutVisualizer } from './OffcutLayoutVisualizer';
import { RoofingAiCopilotModal } from './RoofingAiCopilotModal';
import { FlashingAssignmentModal } from './FlashingAssignmentModal';
import { ExactRoofingOrderModal } from './ExactRoofingOrderModal';
import { ExactRoofingAiDrawer } from './ExactRoofingAiDrawer';
import { SiteMeasureCheckView } from './SiteMeasureCheckView';
import { ContractorFlashingGuide } from './ContractorFlashingGuide';
import { FlashingDesigner } from '../FlashingDesigner';
import { FlashingWorkshop } from '../FlashingWorkshop';
import { PWAInstallButton } from '../PWAInstallButton';
import { useDeviceDetection } from '../../hooks/useDeviceDetection';
import {
  Box,
  Building2,
  ClipboardCheck,
  Compass,
  Scissors,
  CheckCircle2,
  Save,
  Sparkles,
  Upload,
  Plus,
  Sliders,
  ChevronDown,
  LayoutTemplate,
  Menu,
  ShoppingCart,
  Ruler,
  Maximize2,
  Minimize2,
  Lock,
  Unlock,
  FileImage,
  Package,
  Undo2
} from 'lucide-react';

export type ExactRoofingHubTab =
  | 'canvas_plan'
  | 'wall_plan'
  | 'view_3d'
  | 'layout_results'
  | 'flashing_workshop'
  | 'measure_check';

interface Props {
  project?: Project;
  projects?: Project[];
  activeQuote?: Quote;
  quotes?: Quote[];
  initialStage?: RoofLifecycleStage;
  onSelectProject?: (projectId: string) => void;
  activeMemberName?: string;
  embedded?: boolean;
  initialTab?: ExactRoofingHubTab;
  initialWorkshopView?: 'library' | 'orders';
  onSaveToProject?: (
    planes: RoofPlane[],
    layout?: LayoutResult,
    flashingAssignments?: RoofFlashingAssignment[],
    snapshot?: ExactRoofModelSnapshot
  ) => void;
  onUpdateProject?: (project: Project) => void;
  onPushBomToQuote?: (opts: {
    targetQuoteId: string | 'new';
    profile: RoofingProfile;
    material: CoilMaterial;
    colorName: string;
    markupPercent: number;
    includeHardware: boolean;
    includeUnderlay: boolean;
    includeLabourEstimate: boolean;
    replaceExistingSections: boolean;
    bom: RoofBomSummary;
    snapshot: ExactRoofModelSnapshot;
    project?: Project;
  }) => void;
  onOpenFlashingOrders?: () => void;
  onOpenMobileMenu?: () => void;
}

const STORAGE_KEY = 'archtech_exact_roofing_state_v1';

interface SavedRoofState {
  selectedPreset: RoofOutlinePresetKey;
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  planes: RoofPlane[];
  levels?: RoofLevel[];
  activeLevelId?: string;
  startPlaneId: string | null;
  assets?: RoofAsset[];
  pitchBreaks?: PitchBreakLine[];
  flashingAssignments?: RoofFlashingAssignment[];
  stage?: RoofLifecycleStage;
  measureLocked?: boolean;
  installProgress?: RoofInstallProgress;
  planUnderlay?: RoofPlanUnderlay | null;
  wallPlan?: WallPlan | null;
  sheetOrderMode?: SheetOrderMode;
}

const DEFAULT_INSTALL_PROGRESS: RoofInstallProgress = {
  customSequencePlaneIds: [],
  stagedPlaneIds: [],
  completedPlaneIds: [],
  completedPieceIds: []
};

function normalizeLevelsFromState(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  planes: RoofPlane[],
  savedLevels?: RoofLevel[]
): RoofLevel[] {
  if (Array.isArray(savedLevels) && savedLevels.length > 0) {
    return savedLevels;
  }
  const baseZ = outline.edges[0]?.eaveHeightM ?? planes[0]?.eaveHeightM ?? 2.7;
  return [
    {
      id: 'level-1',
      code: 'L1',
      name: 'Main Roof',
      eaveHeightM: +baseZ.toFixed(2),
      outline: {
        ...outline,
        levelId: 'level-1',
        edges: outline.edges.map((e) => ({
          ...e,
          levelId: e.levelId ?? 'level-1',
          eaveHeightM: e.eaveHeightM ?? +baseZ.toFixed(2)
        }))
      },
      skeleton: skeleton.map((s) => ({ ...s, levelId: s.levelId ?? 'level-1' }))
    }
  ];
}

function getInitialRoofState(): SavedRoofState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedRoofState;
      if (parsed && parsed.outline && Array.isArray(parsed.planes)) {
        return parsed;
      }
    }
  } catch {
    // ignore storage parse failure
  }

  const initOutline = getPresetOutline('rectangle_14x10');
  const initSkel = generateSkeletonLines(initOutline);
  const initLevels = normalizeLevelsFromState(initOutline, initSkel, []);
  const initPlanes = syncMultiLevelPlanes(initLevels, [], 22.5).map((p, idx) => ({
    ...p,
    underlapSide: idx % 2 === 0 ? ('left' as const) : ('right' as const),
    name:
      idx === 0
        ? 'South Slope (14m)'
        : idx === 1
        ? 'East Hip (10m)'
        : idx === 2
        ? 'North Slope (14m)'
        : 'West Hip (10m)'
  }));

  return {
    selectedPreset: 'rectangle_14x10',
    outline: initOutline,
    skeleton: initSkel,
    planes: initPlanes,
    levels: initLevels,
    activeLevelId: 'level-1',
    startPlaneId: null,
    stage: 'measuring',
    measureLocked: false,
    installProgress: DEFAULT_INSTALL_PROGRESS
  };
}

export const ExactRoofingHub: React.FC<Props> = ({
  project,
  projects = [],
  activeQuote,
  quotes = [],
  initialStage,
  onSelectProject,
  activeMemberName,
  embedded = false,
  initialTab = 'canvas_plan',
  initialWorkshopView = 'library',
  onSaveToProject,
  onUpdateProject,
  onPushBomToQuote,
  onOpenFlashingOrders,
  onOpenMobileMenu
}) => {
  const { isMobile } = useDeviceDetection();
  const [initialState] = useState<SavedRoofState>(getInitialRoofState);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // 0. Project Lifecycle Stage ('quoting' | 'measuring' | 'installing') & Lock State
  const initialMeasureLockedVal = Boolean(
    project?.roofPlanModel?.measureLocked ||
      activeQuote?.roofPlanModel?.measureLocked ||
      initialState.measureLocked
  );
  const resolvedInitialStage: RoofLifecycleStage =
    initialStage ||
    activeQuote?.roofPlanModel?.stage ||
    project?.roofPlanModel?.stage ||
    (project?.roofPlanModel?.measureLocked ? 'installing' : undefined) ||
    initialState.stage ||
    'measuring';
  const resolveDefaultTabForStage = (
    stage: RoofLifecycleStage,
    locked: boolean
  ): ExactRoofingHubTab => {
    if (stage === 'installing' || locked) return 'layout_results';
    if (stage === 'measuring') return 'measure_check';
    return 'canvas_plan';
  };

  const [lifecycleStage, setLifecycleStage] = useState<RoofLifecycleStage>(resolvedInitialStage);
  const [measureLocked, setMeasureLocked] = useState<boolean>(initialMeasureLockedVal);
  const [installProgress, setInstallProgress] = useState<RoofInstallProgress>(
    project?.roofPlanModel?.installProgress ||
      activeQuote?.roofPlanModel?.installProgress ||
      initialState.installProgress ||
      DEFAULT_INSTALL_PROGRESS
  );

  // 1. Outline, Levels & Preset State
  const [selectedPreset, setSelectedPreset] = useState<RoofOutlinePresetKey>(
    initialState.selectedPreset
  );
  const [levels, setLevels] = useState<RoofLevel[]>(() =>
    normalizeLevelsFromState(
      initialState.outline,
      initialState.skeleton,
      initialState.planes,
      initialState.levels
    )
  );
  const [activeLevelId, setActiveLevelId] = useState<string>(() => {
    if (initialState.activeLevelId) return initialState.activeLevelId;
    if (initialState.levels && initialState.levels.length > 1) return 'all';
    return initialState.levels?.[0]?.id || 'level-1';
  });
  const [outline, setOutline] = useState<RoofOutline>(initialState.outline);

  // 2. Roof Lines State
  const [skeleton, setSkeleton] = useState<SkeletonLine[]>(initialState.skeleton);

  // 3. Defined Roof Areas (Planes) State
  const [planes, setPlanes] = useState<RoofPlane[]>(initialState.planes);

  // 3B. Extra Roof Assets (Skylights, Chimneys, Dormers) & Pitch Break Lines
  const [assets, setAssets] = useState<RoofAsset[]>(initialState.assets || []);
  const [pitchBreaks, setPitchBreaks] = useState<PitchBreakLine[]>(initialState.pitchBreaks || []);
  const [flashingAssignments, setFlashingAssignments] = useState<RoofFlashingAssignment[]>(
    initialState.flashingAssignments || []
  );
  const [planUnderlay, setPlanUnderlay] = useState<RoofPlanUnderlay | null>(
    project?.roofPlanModel?.planUnderlay ||
      activeQuote?.roofPlanModel?.planUnderlay ||
      initialState.planUnderlay ||
      null
  );
  const [wallPlan, setWallPlan] = useState<WallPlan | null>(() => {
    const seed =
      project?.roofPlanModel?.wallPlan ||
      activeQuote?.roofPlanModel?.wallPlan ||
      initialState.wallPlan ||
      null;
    if (!seed) return null;
    return { ...seed, facets: ensureUniqueWallFacetIds(seed.facets || []) };
  });
  const [frozenOrderPack, setFrozenOrderPack] = useState<OrderPack | null>(
    project?.roofPlanModel?.orderPack || activeQuote?.roofPlanModel?.orderPack || null
  );
  const [sheetOrderMode, setSheetOrderMode] = useState<SheetOrderMode>(
    activeQuote?.roofPlanModel?.sheetOrderMode ||
      project?.roofPlanModel?.sheetOrderMode ||
      initialState.sheetOrderMode ||
      'practical'
  );
  const [selectedWallFacetId, setSelectedWallFacetId] = useState<string | null>(null);
  const [wallSubView, setWallSubView] = useState<'plan' | 'elevation'>('plan');
  const [wallViewKey, setWallViewKey] = useState<number>(0);
  const [wallFilterMode, setWallFilterMode] = useState<WallFilterMode>('all');
  const [openPlanModalSignal, setOpenPlanModalSignal] = useState<number>(0);

  // Selected Roof Area / Asset / PitchBreak + Multi-Select state for cross-view synchronization
  const [selectedPlaneId, setSelectedPlaneId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedPitchBreakId, setSelectedPitchBreakId] = useState<string | null>(null);
  const [selectedPlaneIds, setSelectedPlaneIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [selectedSkeletonLineIds, setSelectedSkeletonLineIds] = useState<string[]>([]);
  const [selectedWallFacetIds, setSelectedWallFacetIds] = useState<string[]>([]);
  const [isMobileToolsOpen, setIsMobileToolsOpen] = useState<boolean>(false);
  const [isInstallViewsOpen, setIsInstallViewsOpen] = useState<boolean>(false);
  const installViewsRef = useRef<HTMLDivElement>(null);

  // 15-step Undo History for CAD & batch mutations (clears on project switch/reset)
  interface RoofUndoSnapshot {
    levels: RoofLevel[];
    activeLevelId: string;
    outline: RoofOutline;
    skeleton: SkeletonLine[];
    planes: RoofPlane[];
    wallPlan: WallPlan | null;
  }
  const undoStackRef = useRef<RoofUndoSnapshot[]>([]);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const clearMultiSelections = () => {
    setSelectedPlaneIds([]);
    setSelectedEdgeIds([]);
    setSelectedSkeletonLineIds([]);
    setSelectedWallFacetIds([]);
  };
  const resetUndoHistory = () => {
    undoStackRef.current = [];
    setCanUndo(false);
  };

  // Start Edge / Plane ID for natural laying installation sequence
  const [startPlaneId, setStartPlaneId] = useState<string | null>(initialState.startPlaneId);

  // 4. Sheet Specification State
  const [sheetSpec] = useState<SheetSpec>({
    coverWidth: 0.762, // 762mm standard corrugate
    maxLength: 6.0,
    endLap: 0.15,
    overhang: 0.05
  });

  // 5. Active View Mode (Mode-Pure Home: Quote -> Plan · Measure -> Checklist · Install -> Packs)
  const [activeTab, setActiveTab] = useState<ExactRoofingHubTab>(() =>
    initialTab !== 'canvas_plan'
      ? initialTab
      : resolveDefaultTabForStage(resolvedInitialStage, initialMeasureLockedVal)
  );
  const [flashingWorkshopView, setFlashingWorkshopView] = useState<'library' | 'orders'>(initialWorkshopView);

  const prevInitialTabPropRef = useRef<ExactRoofingHubTab>(initialTab);
  useEffect(() => {
    if (prevInitialTabPropRef.current !== initialTab) {
      prevInitialTabPropRef.current = initialTab;
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    setFlashingWorkshopView(initialWorkshopView);
  }, [initialWorkshopView]);

  // 6. Inspector Drawer State (Open by default on Desktop except Install Pack home; closed Bottom-Sheet on Mobile)
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(
    () => !isMobile && resolvedInitialStage !== 'installing'
  );

  // Sync default inspector state when crossing mobile/desktop breakpoint
  useEffect(() => {
    setIsInspectorOpen(!isMobile && lifecycleStage !== 'installing');
  }, [isMobile]);

  // 7. Templates & Mobile Hub Popout Dropdowns
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState<boolean>(false);
  const templateDropdownRef = useRef<HTMLDivElement>(null);
  const [isMobileHubMenuOpen, setIsMobileHubMenuOpen] = useState<boolean>(false);
  const mobileHubMenuRef = useRef<HTMLDivElement>(null);

  // 8. Modals, AI Drawer & Notices
  const [selectedEdgeForPlane, setSelectedEdgeForPlane] = useState<PlanEdge | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isAiCopilotOpen, setIsAiCopilotOpen] = useState<boolean>(false);
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState<boolean>(false);
  const [activeFlashingLineId, setActiveFlashingLineId] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState<boolean>(false);
  const [orderModalTab, setOrderModalTab] = useState<'orders' | 'order_pack' | 'quote' | undefined>(undefined);
  const [pendingWallPlanForRoof, setPendingWallPlanForRoof] = useState<WallPlan | null>(null);
  const [isMeasureLockGateOpen, setIsMeasureLockGateOpen] = useState<boolean>(false);
  const [libraryVersion, setLibraryVersion] = useState<number>(0);
  const [drawingSuiteSession, setDrawingSuiteSession] = useState<{
    line: AssignableRoofLine;
    seedProfileId: string | null;
    key: number;
  } | null>(null);
  const [layoutResult, setLayoutResult] = useState<LayoutResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Hydrate saved snapshot whenever the scoped Project or Quote switches
  const lastHydratedKeyRef = useRef<string>('');
  useEffect(() => {
    const entityKey = `${project?.id || 'none'}::${activeQuote?.id || 'none'}`;
    if (lastHydratedKeyRef.current === entityKey) return;
    lastHydratedKeyRef.current = entityKey;
    clearMultiSelections();
    resetUndoHistory();

    const snap = activeQuote?.roofPlanModel || project?.roofPlanModel;
    if (snap && snap.outline && Array.isArray(snap.planes)) {
      if (snap.selectedPreset) setSelectedPreset(snap.selectedPreset);
      const nextLevels = normalizeLevelsFromState(
        snap.outline,
        snap.skeleton || [],
        snap.planes,
        snap.levels
      );
      const nextActiveLvl =
        snap.activeLevelId || (nextLevels.length > 1 ? 'all' : nextLevels[0]?.id || 'level-1');
      const targetLvl =
        nextLevels.find((l) => l.id === nextActiveLvl) || nextLevels[0];
      setLevels(nextLevels);
      setActiveLevelId(nextActiveLvl);
      setOutline(targetLvl?.outline || snap.outline);
      setSkeleton(targetLvl?.skeleton || snap.skeleton || []);
      setPlanes(snap.planes);
      setStartPlaneId(snap.startPlaneId || null);
      setAssets(Array.isArray(snap.assets) ? snap.assets : []);
      setPitchBreaks(Array.isArray(snap.pitchBreaks) ? snap.pitchBreaks : []);
      setFlashingAssignments(Array.isArray(snap.flashingAssignments) ? snap.flashingAssignments : []);
      setPlanUnderlay(snap.planUnderlay || null);
      setWallPlan(
        snap.wallPlan
          ? { ...snap.wallPlan, facets: ensureUniqueWallFacetIds(snap.wallPlan.facets || []) }
          : null
      );
      setFrozenOrderPack(snap.orderPack || null);
      setMeasureLocked(Boolean(snap.measureLocked));
      setSheetOrderMode(snap.sheetOrderMode || 'practical');
      setInstallProgress(snap.installProgress || DEFAULT_INSTALL_PROGRESS);
      const hydratedStage: RoofLifecycleStage = initialStage
        ? initialStage
        : snap.stage
        ? snap.stage
        : snap.measureLocked
        ? 'installing'
        : 'measuring';
      setLifecycleStage(hydratedStage);
      if (snap.measureLocked || hydratedStage === 'installing') {
        setActiveTab('layout_results');
      } else if (initialTab === 'canvas_plan') {
        setActiveTab(resolveDefaultTabForStage(hydratedStage, Boolean(snap.measureLocked)));
      }
    } else if (initialStage) {
      setLifecycleStage(initialStage);
      if (initialTab === 'canvas_plan') {
        setActiveTab(resolveDefaultTabForStage(initialStage, false));
      }
    }
  }, [project?.id, activeQuote?.id, initialStage]);

  // Persist offline working roof state cleanly to localStorage
  useEffect(() => {
    try {
      const payload: SavedRoofState = {
        selectedPreset,
        outline,
        skeleton,
        planes,
        levels,
        activeLevelId,
        startPlaneId,
        assets,
        pitchBreaks,
        flashingAssignments,
        stage: lifecycleStage,
        measureLocked,
        installProgress,
        planUnderlay,
        wallPlan,
        sheetOrderMode
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota error
    }
  }, [
    selectedPreset,
    outline,
    skeleton,
    planes,
    levels,
    activeLevelId,
    startPlaneId,
    assets,
    pitchBreaks,
    flashingAssignments,
    lifecycleStage,
    measureLocked,
    installProgress,
    planUnderlay,
    wallPlan,
    sheetOrderMode
  ]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        templateDropdownRef.current &&
        !templateDropdownRef.current.contains(event.target as Node)
      ) {
        setIsTemplateDropdownOpen(false);
      }
      if (
        mobileHubMenuRef.current &&
        !mobileHubMenuRef.current.contains(event.target as Node)
      ) {
        setIsMobileHubMenuOpen(false);
      }
      if (
        installViewsRef.current &&
        !installViewsRef.current.contains(event.target as Node)
      ) {
        setIsInstallViewsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const focusedLevel = useMemo(
    () => levels.find((l) => l.id === activeLevelId) || levels[0],
    [levels, activeLevelId]
  );

  const findLevelForEdge = (edgeId: string): RoofLevel => {
    return (
      levels.find((l) => l.outline.edges.some((e) => e.id === edgeId)) ||
      focusedLevel
    );
  };

  const applyLevelsUpdate = (
    nextLevels: RoofLevel[],
    prevPlanes: RoofPlane[] = planes,
    defaultPitchDeg = 22.5,
    focusId: string = activeLevelId
  ): RoofPlane[] => {
    setLevels(nextLevels);
    const focusLvl =
      nextLevels.find((l) => l.id === focusId) || nextLevels[0];
    if (focusLvl) {
      setOutline(focusLvl.outline);
      setSkeleton(focusLvl.skeleton);
    }
    const synced = syncMultiLevelPlanes(nextLevels, prevPlanes, defaultPitchDeg);
    setPlanes(synced);
    setWallPlan((prev) => (prev ? syncWallPlanWithRoof(prev, nextLevels, synced) : prev));
    return synced;
  };

  const handleApplyAiRoof = (
    points: { x: number; y: number }[],
    pitchDeg: number,
    gableEdgeIndices?: number[]
  ) => {
    setSelectedPreset('custom');
    const verified = normalizeAndVerifyAiRoofOutline(points, pitchDeg);
    let newOutline = { ...verified.outline, id: `roof-ai-${Date.now()}` };
    let newSkel = verified.skeleton;

    if (gableEdgeIndices && gableEdgeIndices.length > 0) {
      gableEdgeIndices.forEach((edgeIdx) => {
        const edge = newOutline.edges[edgeIdx];
        if (edge) {
          const res = toggleEdgeGable(newOutline, newSkel, edge.id, 'gable');
          if (res.toggledTo) {
            newOutline = res.outline;
            newSkel = res.skeleton;
          }
        }
      });
    }

    const singleLevels = normalizeLevelsFromState(newOutline, newSkel, []);
    setLevels(singleLevels);
    setActiveLevelId('level-1');
    setOutline(singleLevels[0].outline);
    setSkeleton(singleLevels[0].skeleton);
    const newPlanes = syncMultiLevelPlanes(singleLevels, [], verified.pitchDeg);
    setPlanes(newPlanes);
    setAssets([]);
    setPitchBreaks([]);
    setFlashingAssignments([]);
    setSelectedPlaneId(null);
    setSelectedAssetId(null);
    setSelectedPitchBreakId(null);
    clearMultiSelections();
    resetUndoHistory();
    setActiveTab('canvas_plan');
    const repairSuffix =
      verified.repairsApplied.length > 0 ? ` (${verified.repairsApplied.length} CAD snaps)` : '';
    triggerNotice(`✓ AI loaded ${verified.points.length} corners at ${verified.pitchDeg}°${repairSuffix}`);
  };

  // Execute Deterministic & Hybrid AI Patches safely through CAD Engine state
  const handleApplyDeterministicPatches = (patches: DeterministicRoofPatch[]) => {
    if (isReadOnlyGeometry || !patches || patches.length === 0) return;
    pushUndoSnapshot();
    let appliedCount = 0;

    // Batch pitch / direction mutations atomically across planes state
    const pitchUpdates = new Map<string, number>();
    const dirUpdates = new Map<string, 'left' | 'right'>();

    patches.forEach((patch) => {
      if (patch.op === 'set_plane_pitch' && patch.targetId && typeof patch.valueNumber === 'number') {
        pitchUpdates.set(patch.targetId, patch.valueNumber);
        appliedCount++;
      } else if (
        patch.op === 'batch_plane_pitch' &&
        Array.isArray(patch.targetIds) &&
        patch.targetIds.length > 0 &&
        typeof patch.valueNumber === 'number'
      ) {
        patch.targetIds.forEach((tid) => pitchUpdates.set(tid, patch.valueNumber!));
        appliedCount++;
      } else if (
        patch.op === 'set_plane_direction' &&
        patch.targetId &&
        (patch.valueString === 'left' || patch.valueString === 'right')
      ) {
        dirUpdates.set(patch.targetId, patch.valueString);
        appliedCount++;
      } else if (patch.op === 'set_start_plane' && patch.targetId) {
        setStartPlaneId(patch.targetId);
        appliedCount++;
      } else if (
        patch.op === 'set_edge_mode' &&
        patch.targetId &&
        (patch.valueString === 'hipped' || patch.valueString === 'gable' || patch.valueString === 'wall')
      ) {
        handleSetEdgeMode(patch.targetId, patch.valueString);
        appliedCount++;
      } else if (
        patch.op === 'batch_classify_edges' &&
        Array.isArray(patch.targetIds) &&
        patch.targetIds.length > 0 &&
        patch.valueString
      ) {
        const edgeTypeVal = patch.valueString as EdgeType;
        const targetSet = new Set(patch.targetIds);
        const nextLevels = levels.map((lvl) => {
          const matched = lvl.outline.edges.filter((e) => targetSet.has(e.id)).map((e) => e.id);
          return matched.length > 0
            ? { ...lvl, outline: applyEdgeType(lvl.outline, matched, edgeTypeVal) }
            : lvl;
        });
        applyLevelsUpdate(nextLevels, planes);
        appliedCount++;
      } else if (patch.op === 'set_edge_wall' && patch.targetId) {
        handleUpdateEdgeWall(patch.targetId, {
          hasWall: patch.valueBoolean ?? true,
          eaveSetbackM: patch.valueNumber
        });
        appliedCount++;
      } else if (patch.op === 'auto_assign_flashings') {
        const added = buildAutoFlashingAssignments({
          assignableLines,
          existingAssignments: flashingAssignments,
          libraryProfiles,
          material: project?.material,
          colorName: project?.colorName
        });
        if (added.length > 0) {
          setFlashingAssignments((prev) => [...prev, ...added]);
          appliedCount++;
        }
      }
    });

    if (pitchUpdates.size > 0 || dirUpdates.size > 0) {
      setPlanes((prev) => {
        const nextPlanes = prev.map((plane) => {
          const nextPitch = pitchUpdates.get(plane.id) ?? plane.pitchDeg;
          const nextDir = dirUpdates.get(plane.id) ?? plane.underlapSide;
          if (nextPitch === plane.pitchDeg && nextDir === plane.underlapSide) return plane;
          const owningLvl =
            levels.find((l) => l.id === (plane.levelId || 'level-1')) ||
            levels.find((l) => l.outline.edges.some((e) => e.id === plane.eaveEdgeId)) ||
            focusedLevel;
          const edge = owningLvl.outline.edges.find((e) => e.id === plane.eaveEdgeId);
          if (!edge) return { ...plane, pitchDeg: nextPitch, underlapSide: nextDir };
          return createPlaneFromEdge(owningLvl.outline, owningLvl.skeleton, edge, {
            pitchDeg: nextPitch,
            underlapSide: nextDir,
            eaveHeightM: plane.eaveHeightM,
            sheetRunEdgeId: plane.sheetRunEdgeId,
            orderedSheetLengthM: plane.orderedSheetLengthM,
            name: plane.name,
            levelId: plane.levelId || owningLvl.id,
            levelCode: plane.levelCode || owningLvl.code,
            levelName: plane.levelName || owningLvl.name
          });
        });
        setWallPlan((wPrev) => (wPrev ? syncWallPlanWithRoof(wPrev, levels, nextPlanes) : wPrev));
        return nextPlanes;
      });
    }

    if (appliedCount > 0) {
      triggerNotice(`✓ Applied ${appliedCount} AI-verified deterministic fix${appliedCount > 1 ? 'es' : ''}`);
    }
  };

  const handleExecuteAiAction = (action: {
    type: 'select_plane' | 'open_flashings' | 'open_bom' | 'open_bom_quote' | 'open_audit' | 'none';
    targetId?: string;
    label?: string;
  }) => {
    if (action.type === 'select_plane') {
      const target =
        planes.find((p) => p.id === action.targetId || p.code === action.targetId) ||
        planes[0] ||
        null;
      if (target) {
        handleSelectPlane(target.id);
      }
    } else if (action.type === 'open_flashings') {
      setActiveTab('canvas_plan');
      const nextUnassigned = assignableLines.find(
        (l) => !flashingAssignments.some((a) => a.lineId === l.lineId)
      );
      if (nextUnassigned) {
        setActiveFlashingLineId(nextUnassigned.lineId);
      }
    } else if (action.type === 'open_bom') {
      setOrderModalTab('orders');
      setIsOrderModalOpen(true);
    } else if (action.type === 'open_bom_quote') {
      setOrderModalTab('quote');
      setIsOrderModalOpen(true);
    } else if (action.type === 'open_audit') {
      setIsAiCopilotOpen(true);
    }
  };

  // Recompute layout whenever roof areas, specs, assets, pitch breaks, start edge, or ordering mode change
  useEffect(() => {
    if (planes.length > 0) {
      const res = generateCuttingLayout(planes, sheetSpec, {
        startPlaneId: startPlaneId || undefined,
        assets,
        pitchBreaks,
        sheetOrderMode
      });
      setLayoutResult(res);
    }
  }, [planes, sheetSpec, startPlaneId, assets, pitchBreaks, sheetOrderMode]);

  const handleSetStartPlane = (planeId: string) => {
    setStartPlaneId(planeId);
    const target = planes.find((p) => p.id === planeId);
    triggerNotice(`★ Start Edge: ${target?.name || 'Section ' + target?.code}`);
  };

  const triggerNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2800);
  };

  // Level Switcher & Multi-Tier Management
  const handleSelectLevel = (nextLevelId: string) => {
    setActiveLevelId(nextLevelId);
    const target = levels.find((l) => l.id === nextLevelId) || levels[0];
    if (target) {
      setOutline(target.outline);
      setSkeleton(target.skeleton);
    }
  };

  const handleAddLevel = () => {
    if (isReadOnlyGeometry) return;
    const existingNums = levels.map((l) => {
      const m = l.id.match(/level-(\d+)/);
      return m ? parseInt(m[1], 10) : 1;
    });
    const nextIdx = (existingNums.length > 0 ? Math.max(...existingNums) : 1) + 1;
    const maxZ = levels.length > 0 ? Math.max(...levels.map((l) => l.eaveHeightM)) : 2.7;
    const nextZ = +(maxZ + 1.5).toFixed(2);
    const yOffset = Math.max(0, (levels.length - 1) * -4.2);
    const newLvl = createRoofLevel(
      nextIdx,
      `Level ${nextIdx} (${nextZ}m)`,
      nextZ,
      [
        { x: 0, y: yOffset - 4.5 },
        { x: 10, y: yOffset - 4.5 },
        { x: 10, y: yOffset },
        { x: 0, y: yOffset }
      ],
      ['outline', 'verge', 'outline', 'verge']
    );
    const nextLevels = [...levels, newLvl];
    setActiveLevelId(newLvl.id);
    applyLevelsUpdate(nextLevels, planes, 22.5, newLvl.id);
    triggerNotice(`✓ Added ${newLvl.code} @ Z:${nextZ}m`);
  };

  const handleUpdateLevelHeight = (levelId: string, heightM: number) => {
    if (isReadOnlyGeometry) return;
    const clampedZ = +Math.max(0.5, Math.min(30, heightM)).toFixed(2);
    const nextLevels = levels.map((lvl) => {
      if (lvl.id !== levelId) return lvl;
      return {
        ...lvl,
        eaveHeightM: clampedZ,
        outline: {
          ...lvl.outline,
          edges: lvl.outline.edges.map((e) => ({ ...e, eaveHeightM: clampedZ }))
        }
      };
    });
    setLevels(nextLevels);
    if (owningLevelIsFocused(levelId)) {
      const updatedLvl = nextLevels.find((l) => l.id === levelId);
      if (updatedLvl) setOutline(updatedLvl.outline);
    }
    const nextPlanes = planes.map((p) =>
      (p.levelId || 'level-1') === levelId ? { ...p, eaveHeightM: clampedZ } : p
    );
    setPlanes(nextPlanes);
    setWallPlan((prev) => (prev ? syncWallPlanWithRoof(prev, nextLevels, nextPlanes) : prev));
    triggerNotice(`✓ Level Z set to ${clampedZ}m`);
  };

  const owningLevelIsFocused = (levelId: string) =>
    focusedLevel.id === levelId;

  const handleDeleteLevel = (levelId: string) => {
    if (isReadOnlyGeometry) return;
    if (levels.length <= 1) {
      triggerNotice('At least 1 roof level is required');
      return;
    }
    const nextLevels = levels.filter((l) => l.id !== levelId);
    const nextActiveId =
      activeLevelId === levelId ? (nextLevels.length > 1 ? 'all' : nextLevels[0].id) : activeLevelId;
    setActiveLevelId(nextActiveId);
    const synced = applyLevelsUpdate(
      nextLevels,
      planes.filter((p) => (p.levelId || 'level-1') !== levelId),
      22.5,
      nextActiveId
    );
    if (selectedPlaneId && !synced.some((p) => p.id === selectedPlaneId)) {
      setSelectedPlaneId(null);
    }
    triggerNotice('Removed roof level');
  };

  // Synchronized Outline Update (supports additive multi-body roofs & never auto-generates skeletons unless explicitly requested)
  const handleUpdateOutline = (
    newOutline: RoofOutline,
    options?: {
      autoGenerateSkeleton?: boolean;
      mode?: 'replace' | 'add';
      attachedEdgeId?: string;
      scaleFactor?: number;
      scaleAnchor?: Point2D;
    }
  ) => {
    const hasExistingFootprint = levels.some((l) => l.outline.points.length >= 3);
    if (options?.mode === 'add' && hasExistingFootprint && newOutline.points.length >= 3) {
      const existingNums = levels.map((l) => {
        const m = l.id.match(/level-(\d+)/);
        return m ? parseInt(m[1], 10) : 1;
      });
      const nextIdx = (existingNums.length > 0 ? Math.max(...existingNums) : 1) + 1;
      const parentLvl = options.attachedEdgeId ? findLevelForEdge(options.attachedEdgeId) : focusedLevel;
      const baseZ = parentLvl.eaveHeightM;
      const levelId = `level-${nextIdx}`;
      const prefix = `l${nextIdx}__`;
      const normalizedNewOutline: RoofOutline = {
        ...newOutline,
        id: newOutline.id || `outline-${levelId}`,
        levelId,
        edges: newOutline.edges.map((e, idx) => ({
          ...e,
          id: e.id.startsWith(prefix)
            ? e.id
            : `${prefix}${e.id.replace(/^l\d+__/, '') || `edge-out-${idx + 1}`}`,
          levelId,
          eaveHeightM: e.eaveHeightM ?? baseZ
        }))
      };
      const nextSkel = options?.autoGenerateSkeleton
        ? generateSkeletonLines(normalizedNewOutline).map((s) => ({
            ...s,
            levelId: s.levelId ?? levelId
          }))
        : [];
      const newLvl: RoofLevel = {
        id: levelId,
        code: `L${nextIdx}`,
        name: `Roof ${nextIdx} (${baseZ}m)`,
        eaveHeightM: baseZ,
        outline: normalizedNewOutline,
        skeleton: nextSkel
      };
      const nextLevels = [...levels, newLvl];
      setLevels(nextLevels);
      setActiveLevelId('all');
      setOutline(newLvl.outline);
      setSkeleton(newLvl.skeleton);
      setPlanes((prev) => syncMultiLevelPlanes(nextLevels, prev));
      triggerNotice(
        options.attachedEdgeId
          ? `✓ Attached ${newLvl.code} roof section (click an edge to set Eave & Sheet direction)`
          : `✓ Added ${newLvl.code} roof outline (existing roofs preserved)`
      );
      return;
    }

    const targetLvl =
      options?.mode === 'replace'
        ? focusedLevel
        : newOutline.edges.length > 0
        ? levels.find((l) => l.outline.edges.some((e) => e.id === newOutline.edges[0].id)) || focusedLevel
        : focusedLevel;

    const normalizedOutline: RoofOutline = {
      ...newOutline,
      levelId: targetLvl.id,
      edges: newOutline.edges.map((e) => ({
        ...e,
        levelId: e.levelId ?? targetLvl.id,
        eaveHeightM: e.eaveHeightM ?? targetLvl.eaveHeightM
      }))
    };

    const nextSkel =
      normalizedOutline.edges.length === 0
        ? []
        : options?.autoGenerateSkeleton && normalizedOutline.points.length >= 3
        ? generateSkeletonLines(normalizedOutline).map((s) => ({
            ...s,
            levelId: s.levelId ?? targetLvl.id
          }))
        : options?.scaleFactor && options?.scaleAnchor
        ? scaleSkeletonUniformly(targetLvl.skeleton, options.scaleFactor, options.scaleAnchor).map(
            (s) => ({ ...s, levelId: s.levelId ?? targetLvl.id })
          )
        : targetLvl.skeleton;

    const nextLevels = levels.map((l) =>
      l.id === targetLvl.id
        ? {
            ...l,
            outline: normalizedOutline,
            skeleton: nextSkel
          }
        : l
    );
    setLevels(nextLevels);
    if (targetLvl.id === focusedLevel.id) {
      setOutline(normalizedOutline);
      setSkeleton(nextSkel);
    }
    if (normalizedOutline.edges.length > 0) {
      setPlanes((prev) => syncMultiLevelPlanes(nextLevels, prev));
    } else if (nextLevels.length === 1) {
      setPlanes([]);
      setAssets([]);
      setPitchBreaks([]);
    }
  };

  // Synchronized Roof Lines Update (partitions across levels when viewing All Levels)
  const handleUpdateSkeleton = (newSkel: SkeletonLine[]) => {
    if (activeLevelId === 'all' && levels.length > 1) {
      const grouped = new Map<string, SkeletonLine[]>();
      levels.forEach((l) => grouped.set(l.id, []));
      const validIds = new Set(levels.map((l) => l.id));

      newSkel.forEach((s) => {
        let ownerId = s.levelId && validIds.has(s.levelId) ? s.levelId : undefined;
        if (!ownerId) {
          const mid = { x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 };
          ownerId = levels.find((l) => isPointInPolygon(mid, l.outline.points))?.id;
        }
        const resolvedId = ownerId || levels[0].id;
        grouped.get(resolvedId)?.push({ ...s, levelId: resolvedId });
      });

      const nextLevels = levels.map((l) => ({
        ...l,
        skeleton: grouped.get(l.id) || []
      }));
      setLevels(nextLevels);
      setSkeleton(grouped.get(focusedLevel.id) || []);
      if (nextLevels.some((l) => l.outline.edges.length > 0)) {
        setPlanes((prev) => syncMultiLevelPlanes(nextLevels, prev));
      }
      return;
    }

    const targetLvl = focusedLevel;
    const normalizedSkel = newSkel.map((s) => ({ ...s, levelId: s.levelId ?? targetLvl.id }));
    const nextLevels = levels.map((l) =>
      l.id === targetLvl.id ? { ...l, skeleton: normalizedSkel } : l
    );
    setLevels(nextLevels);
    setSkeleton(normalizedSkel);
    if (targetLvl.outline.edges.length > 0) {
      setPlanes((prev) => syncMultiLevelPlanes(nextLevels, prev));
    }
  };

  // Toggle Ridge/Hip Junction between Hipped End and Gable End
  const handleToggleJunctionGable = (junctionId: string) => {
    if (isReadOnlyGeometry) return;
    const targetLvl = focusedLevel;
    const res = toggleJunctionGable(targetLvl.outline, targetLvl.skeleton, junctionId);
    if (!res.toggledTo) return;
    const nextLevels = levels.map((l) =>
      l.id === targetLvl.id ? { ...l, outline: res.outline, skeleton: res.skeleton } : l
    );
    const updatedPlanes = applyLevelsUpdate(nextLevels, planes);
    if (selectedPlaneId && !updatedPlanes.some((p) => p.id === selectedPlaneId)) {
      setSelectedPlaneId(null);
    }
    if (res.toggledTo === 'gable') {
      triggerNotice('✓ Toggled junction to Gable End');
    } else {
      triggerNotice('✓ Restored junction to Hipped End');
    }
  };

  // Set Edge 3-Way Mode: Hipped Eave ('outline') | Gable Verge ('verge') | Abutment Wall ('wall')
  // Preserves empty / manually-drawn skeletons instead of auto-regenerating lines unexpectedly
  const handleSetEdgeMode = (edgeId: string, mode: 'hipped' | 'gable' | 'wall') => {
    if (isReadOnlyGeometry) return;
    const owningLvl = findLevelForEdge(edgeId);
    const usesManualOrEmptySkel =
      owningLvl.skeleton.length === 0 || owningLvl.skeleton.some((s) => !s.id.includes('skel-'));

    if (usesManualOrEmptySkel) {
      const targetType: EdgeType =
        mode === 'gable' ? 'verge' : mode === 'wall' ? 'wall' : 'outline';
      const nextOutline = classifyOutlineEdge(owningLvl.outline, edgeId, targetType);
      const nextLevels = levels.map((l) =>
        l.id === owningLvl.id ? { ...l, outline: nextOutline } : l
      );
      const updatedPlanes = applyLevelsUpdate(nextLevels, planes);
      if (selectedPlaneId && !updatedPlanes.some((p) => p.id === selectedPlaneId)) {
        setSelectedPlaneId(null);
      }
      if (targetType === 'verge') {
        triggerNotice('✓ Converted edge to Gable End');
      } else if (targetType === 'wall') {
        triggerNotice('✓ Converted edge to Abutment Wall (apron line)');
      } else {
        triggerNotice('✓ Converted edge to Hipped Slope');
      }
      return;
    }

    const res = setEdgeMode(owningLvl.outline, owningLvl.skeleton, edgeId, mode);
    if (!res.toggledTo) {
      triggerNotice('At least 1 edge must remain a sloped roof eave');
      return;
    }
    const nextLevels = levels.map((l) =>
      l.id === owningLvl.id ? { ...l, outline: res.outline, skeleton: res.skeleton } : l
    );
    const updatedPlanes = applyLevelsUpdate(nextLevels, planes);
    if (selectedPlaneId && !updatedPlanes.some((p) => p.id === selectedPlaneId)) {
      setSelectedPlaneId(null);
    }
    if (res.toggledTo === 'gable') {
      triggerNotice('✓ Converted edge to Gable End');
    } else if (res.toggledTo === 'wall') {
      triggerNotice('✓ Converted edge to Abutment Wall (apron line)');
    } else {
      triggerNotice('✓ Converted edge to Hipped Slope');
    }
  };

  // Toggle ANY perimeter edge / facet between Hipped Slope ('outline') and Gable End ('verge')
  const handleToggleEdgeGable = (edgeId: string, forceMode?: 'hipped' | 'gable') => {
    const owningLvl = findLevelForEdge(edgeId);
    const edge = owningLvl.outline.edges.find((e) => e.id === edgeId);
    const targetMode: 'hipped' | 'gable' =
      forceMode ?? (edge?.type === 'verge' ? 'hipped' : 'gable');
    handleSetEdgeMode(edgeId, targetMode);
  };

  // Direct Edge Eave Length Resize (establishes exact wall/eave length for related facets)
  const handleUpdateEdgeLength = (edgeId: string, lengthM: number) => {
    if (isReadOnlyGeometry) return;
    const clampedLen = +Math.max(0.5, Math.min(100, lengthM)).toFixed(2);
    const owningLvl = findLevelForEdge(edgeId);
    const resizedOutline = updateEdgeLength(owningLvl.outline, edgeId, clampedLen);
    const shouldRegenAuto =
      owningLvl.skeleton.length > 0 && owningLvl.skeleton.every((s) => s.id.includes('skel-'));
    const nextSkel = shouldRegenAuto ? generateSkeletonLines(resizedOutline) : owningLvl.skeleton;
    const nextLevels = levels.map((l) =>
      l.id === owningLvl.id ? { ...l, outline: resizedOutline, skeleton: nextSkel } : l
    );
    applyLevelsUpdate(nextLevels, planes);
    triggerNotice(`✓ Wall / eave length set to ${clampedLen}m`);
  };

  // Direct Edge / Plane Eave Height Z Update (establishes Z-axis relationship between tiers)
  const handleUpdateEdgeEaveHeight = (edgeId: string, heightM: number) => {
    if (isReadOnlyGeometry) return;
    const clampedZ = +Math.max(0.5, Math.min(30, heightM)).toFixed(2);
    const owningLvl = findLevelForEdge(edgeId);
    const nextLevels = levels.map((lvl) => {
      if (lvl.id !== owningLvl.id) return lvl;
      return {
        ...lvl,
        outline: {
          ...lvl.outline,
          edges: lvl.outline.edges.map((e) =>
            e.id === edgeId ? { ...e, eaveHeightM: clampedZ } : e
          )
        }
      };
    });
    setLevels(nextLevels);
    if (owningLvl.id === focusedLevel.id) {
      const updated = nextLevels.find((l) => l.id === owningLvl.id);
      if (updated) setOutline(updated.outline);
    }
    const nextPlanes = planes.map((p) =>
      p.eaveEdgeId === edgeId ? { ...p, eaveHeightM: clampedZ } : p
    );
    setPlanes(nextPlanes);
    setWallPlan((prev) => (prev ? syncWallPlanWithRoof(prev, nextLevels, nextPlanes) : prev));
    triggerNotice(`✓ Eave Z set to ${clampedZ}m`);
  };

  const handleUpdatePlaneEaveHeight = (planeId: string, heightM: number) => {
    if (isReadOnlyGeometry) return;
    const targetPlane = planes.find((p) => p.id === planeId);
    if (!targetPlane) return;
    handleUpdateEdgeEaveHeight(targetPlane.eaveEdgeId, heightM);
  };

  // Non-destructive Wall & Eave Width (Setback) Update — sits strictly under roof plane without altering roof geometry
  const handleUpdateEdgeWall = (
    edgeId: string,
    updates: { hasWall?: boolean; eaveSetbackM?: number }
  ) => {
    if (isReadOnlyGeometry) return;
    const owningLvl = findLevelForEdge(edgeId);
    const nextOutline = setEdgeWall(owningLvl.outline, edgeId, updates);
    const nextLevels = levels.map((lvl) =>
      lvl.id === owningLvl.id ? { ...lvl, outline: nextOutline } : lvl
    );
    setLevels(nextLevels);
    if (owningLvl.id === focusedLevel.id) {
      setOutline(nextOutline);
    }
    if (updates.eaveSetbackM !== undefined) {
      triggerNotice(`✓ Eave setback set to ${updates.eaveSetbackM.toFixed(2)}m`);
    } else if (updates.hasWall !== undefined) {
      triggerNotice(updates.hasWall ? '✓ Wall enabled below roof' : '✓ Wall removed on edge');
    }
  };

  // Apply Roof Style Preset (All Hipped or Gable Ends)
  const handleApplyRoofStylePreset = (mode: 'hipped' | 'gable') => {
    if (isReadOnlyGeometry) return;
    const targetLvl = focusedLevel;
    const res = applyRoofStylePreset(targetLvl.outline, mode);
    const nextLevels = levels.map((l) =>
      l.id === targetLvl.id ? { ...l, outline: res.outline, skeleton: res.skeleton } : l
    );
    applyLevelsUpdate(nextLevels, planes);
    setSelectedPlaneId(null);
    triggerNotice(mode === 'hipped' ? '✓ Converted roof to All Hipped' : '✓ Converted end facets to Gable Roof');
  };

  // Live Pitch Adjustment
  const handleUpdatePlanePitch = (planeId: string, pitchDeg: number) => {
    if (isReadOnlyGeometry) return;
    const nextPlanes = planes.map((plane) => {
      if (plane.id !== planeId) return plane;
      const owningLvl =
        levels.find((l) => l.id === (plane.levelId || 'level-1')) ||
        levels.find((l) => l.outline.edges.some((e) => e.id === plane.eaveEdgeId)) ||
        focusedLevel;
      const edge = owningLvl.outline.edges.find((e) => e.id === plane.eaveEdgeId);
      if (!edge) return { ...plane, pitchDeg };
      return createPlaneFromEdge(owningLvl.outline, owningLvl.skeleton, edge, {
        pitchDeg,
        underlapSide: plane.underlapSide,
        eaveHeightM: plane.eaveHeightM,
        sheetRunEdgeId: plane.sheetRunEdgeId,
        orderedSheetLengthM: plane.orderedSheetLengthM,
        name: plane.name,
        levelId: plane.levelId || owningLvl.id,
        levelCode: plane.levelCode || owningLvl.code,
        levelName: plane.levelName || owningLvl.name
      });
    });
    setPlanes(nextPlanes);
    setWallPlan((prev) => (prev ? syncWallPlanWithRoof(prev, levels, nextPlanes) : prev));
  };

  // Live Lay Direction Adjustment
  const handleUpdatePlaneDirection = (planeId: string, underlapSide: 'left' | 'right') => {
    if (isReadOnlyGeometry) return;
    setPlanes((prev) =>
      prev.map((plane) => {
        if (plane.id !== planeId) return plane;
        const owningLvl =
          levels.find((l) => l.id === (plane.levelId || 'level-1')) ||
          levels.find((l) => l.outline.edges.some((e) => e.id === plane.eaveEdgeId)) ||
          focusedLevel;
        const edge = owningLvl.outline.edges.find((e) => e.id === plane.eaveEdgeId);
        if (!edge) return { ...plane, underlapSide };
        return createPlaneFromEdge(owningLvl.outline, owningLvl.skeleton, edge, {
          pitchDeg: plane.pitchDeg,
          underlapSide,
          eaveHeightM: plane.eaveHeightM,
          sheetRunEdgeId: plane.sheetRunEdgeId,
          orderedSheetLengthM: plane.orderedSheetLengthM,
          name: plane.name,
          levelId: plane.levelId || owningLvl.id,
          levelCode: plane.levelCode || owningLvl.code,
          levelName: plane.levelName || owningLvl.name
        });
      })
    );
  };

  // Site-Measured / Actual Sheet Length to Order Override (Does NOT alter plan geometry)
  const handleUpdatePlaneOrderedSheetLength = (
    planeId: string,
    orderedSheetLengthM: number | undefined
  ) => {
    if (isReadOnlyGeometry) return;
    const cleanLen =
      orderedSheetLengthM !== undefined && Number.isFinite(orderedSheetLengthM) && orderedSheetLengthM > 0.2
        ? +orderedSheetLengthM.toFixed(3)
        : undefined;
    const targetPlane = planes.find((p) => p.id === planeId);
    setPlanes((prev) =>
      prev.map((plane) => {
        if (plane.id !== planeId) return plane;
        return {
          ...plane,
          orderedSheetLengthM: cleanLen
        };
      })
    );
    if (cleanLen !== undefined) {
      const mm = Math.round(cleanLen * 1000);
      triggerNotice(
        `✓ ${targetPlane ? `Area ${targetPlane.code}` : 'Face'} sheet order set to ${mm}mm (BOM updated, geometry unchanged)`
      );
    } else if (targetPlane) {
      const modeledMm = Math.round((targetPlane.slopeLength || 0) * 1000);
      triggerNotice(
        `✓ Reset Area ${targetPlane.code} sheet length to modeled run (${modeledMm}mm)`
      );
    }
  };

  const handleSelectPlane = (planeId: string | null) => {
    setSelectedPlaneId(planeId);
    setSelectedAssetId(null);
    setSelectedPitchBreakId(null);
    if (planeId) setSelectedWallFacetId(null);
    if (planeId && !isInspectorOpen && !isMobile && lifecycleStage !== 'installing') {
      setIsInspectorOpen(true);
    }
  };

  const handleSelectWallFacet = (facetId: string | null) => {
    setSelectedWallFacetId(facetId);
    if (facetId) {
      setSelectedPlaneId(null);
      setSelectedAssetId(null);
      setSelectedPitchBreakId(null);
    }
    if (facetId && !isInspectorOpen && !isMobile) {
      setIsInspectorOpen(true);
    }
  };

  const handleUpdateWallPlan = (nextPlan: WallPlan | null) => {
    if (isReadOnlyGeometry) return;
    setWallPlan(nextPlan);
  };

  const handleUpdateWallFacet = (updatedFacet: WallFacet) => {
    if (isReadOnlyGeometry) return;
    setWallPlan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        facets: prev.facets.map((f) => (f.id === updatedFacet.id ? updatedFacet : f)),
        builtAt: new Date().toISOString()
      };
    });
  };

  const handleBuildWallFaces = () => {
    if (isReadOnlyGeometry) return;
    const derived = deriveWallPlanFromRoofLevels(
      levels,
      levels[0]?.eaveHeightM || 2.7,
      wallPlan?.facets,
      planes
    );
    if (!derived) return;
    setWallPlan(derived);
    if (derived.facets[0]) {
      setSelectedWallFacetId(derived.facets[0].id);
    }
    setWallSubView('plan');
    setWallViewKey((k) => k + 1);
    setActiveTab('wall_plan');
    triggerNotice(`✓ Built ${derived.facets.length} labelled wall faces`);
  };

  const handleOpenWallElevation = (facetId: string) => {
    setSelectedWallFacetId(facetId);
    setSelectedPlaneId(null);
    setSelectedAssetId(null);
    setSelectedPitchBreakId(null);
    setWallSubView('elevation');
    setWallViewKey((k) => k + 1);
    setActiveTab('wall_plan');
  };

  const applyRoofFromWallPlan = (sourcePlan: WallPlan) => {
    if (isReadOnlyGeometry) return;
    const targetLvl = focusedLevel;
    const idPrefix =
      targetLvl.id !== 'level-1'
        ? `${targetLvl.code.toLowerCase()}__`
        : '';
    const seeded = deriveRoofOutlineFromWallPlan(sourcePlan, {
      levelId: targetLvl.id,
      idPrefix,
      edgeType: 'unclassified'
    });
    if (!seeded) return;

    const nextLevels = levels.map((lvl) =>
      lvl.id === targetLvl.id
        ? {
            ...lvl,
            outline: seeded.outline,
            skeleton: []
          }
        : lvl
    );
    const cleanedPrevPlanes = planes.filter(
      (p) => (p.levelId || 'level-1') !== targetLvl.id
    );
    const nextPlanes = syncMultiLevelPlanes(nextLevels, cleanedPrevPlanes);

    setLevels(nextLevels);
    setOutline(seeded.outline);
    setSkeleton([]);
    setPlanes(nextPlanes);
    setWallPlan(seeded.linkedWallPlan);
    setSelectedPlaneId(null);
    setPendingWallPlanForRoof(null);
    setActiveTab('canvas_plan');
    triggerNotice(
      `✓ Seeded ${targetLvl.code} roof outline from wall plan (${seeded.outline.edges.length} edges) — classify eaves to create roof faces`
    );
  };

  const handleBuildRoofFromWallPlan = (sourcePlan?: WallPlan | null) => {
    const targetPlan = sourcePlan || wallPlan;
    if (!targetPlan || targetPlan.points.length < 3) return;
    const hasExistingFootprint = focusedLevel.outline.points.length >= 3;
    if (hasExistingFootprint) {
      setPendingWallPlanForRoof(targetPlan);
      return;
    }
    applyRoofFromWallPlan(targetPlan);
  };

  const handleSelectAsset = (assetId: string | null) => {
    setSelectedAssetId(assetId);
    setSelectedPitchBreakId(null);
    if (assetId) setSelectedWallFacetId(null);
    if (assetId && !isInspectorOpen) {
      setIsInspectorOpen(true);
    }
  };

  const handleSelectPitchBreak = (pbId: string | null) => {
    setSelectedPitchBreakId(pbId);
    setSelectedAssetId(null);
    if (pbId) setSelectedWallFacetId(null);
    if (pbId && !isInspectorOpen) {
      setIsInspectorOpen(true);
    }
  };

  // Change Preset Template (supports both single-level & multi-height terraced/2-storey roofs)
  const handleSelectPreset = (key: RoofOutlinePresetKey) => {
    setSelectedPreset(key);
    setIsTemplateDropdownOpen(false);

    if (key === 'two_storey_split' || key === 'cascading_terrace') {
      const multi = getMultiLevelPreset(key, 22.5);
      setLevels(multi.levels);
      setActiveLevelId('all');
      setOutline(multi.levels[0].outline);
      setSkeleton(multi.levels[0].skeleton);
      setPlanes(multi.planes);
      setAssets([]);
      setPitchBreaks([]);
      setFlashingAssignments([]);
      setSelectedPlaneId(null);
      setSelectedAssetId(null);
      setSelectedPitchBreakId(null);
      clearMultiSelections();
      resetUndoHistory();
      triggerNotice(
        key === 'two_storey_split'
          ? '✓ Loaded 2-Storey Split Roof (2.7m & 5.4m Z)'
          : '✓ Loaded 3-Tier Cascading Terraced Roof'
      );
      return;
    }

    let newOutline = getPresetOutline(key);
    let newSkel = generateSkeletonLines(newOutline);

    // Classic Duo-Pitch Gable loads with actual Gable Ends ready on left & right walls
    if (key === 'straight_gable') {
      const res1 = toggleJunctionGable(newOutline, newSkel, 'junction-edge-out-2');
      if (res1.toggledTo) {
        newOutline = res1.outline;
        newSkel = res1.skeleton;
      }
      const res2 = toggleJunctionGable(newOutline, newSkel, 'junction-edge-out-4');
      if (res2.toggledTo) {
        newOutline = res2.outline;
        newSkel = res2.skeleton;
      }
    }

    const singleLevels = normalizeLevelsFromState(newOutline, newSkel, []);
    setLevels(singleLevels);
    setActiveLevelId('level-1');
    setOutline(singleLevels[0].outline);
    setSkeleton(singleLevels[0].skeleton);
    const newPlanes = syncMultiLevelPlanes(singleLevels, []);
    setPlanes(newPlanes);
    setAssets([]);
    setPitchBreaks([]);
    setFlashingAssignments([]);
    setSelectedPlaneId(null);
    setSelectedAssetId(null);
    setSelectedPitchBreakId(null);
    clearMultiSelections();
    resetUndoHistory();
    triggerNotice(`✓ Loaded ${key.replace(/_/g, ' ')}`);
  };

  // Clear Canvas to Start Blank
  const handleStartBlank = () => {
    setSelectedPreset('custom');
    setIsTemplateDropdownOpen(false);
    const blankOutline: RoofOutline = { id: `roof-${Date.now()}`, levelId: 'level-1', points: [], edges: [] };
    const blankLvl: RoofLevel = {
      id: 'level-1',
      code: 'L1',
      name: 'Main Roof',
      eaveHeightM: 2.7,
      outline: blankOutline,
      skeleton: []
    };
    setLevels([blankLvl]);
    setActiveLevelId('level-1');
    setOutline(blankOutline);
    setSkeleton([]);
    setPlanes([]);
    setAssets([]);
    setPitchBreaks([]);
    setFlashingAssignments([]);
    setSelectedPlaneId(null);
    setSelectedAssetId(null);
    setSelectedPitchBreakId(null);
    clearMultiSelections();
    resetUndoHistory();
    setActiveTab('canvas_plan');
    triggerNotice('Tap canvas points to draw roof');
  };

  // Import Custom Outline
  const handleImportOutline = (newOutline: RoofOutline) => {
    setSelectedPreset('custom');
    setIsTemplateDropdownOpen(false);
    const newSkel = generateSkeletonLines(newOutline);
    const singleLevels = normalizeLevelsFromState(newOutline, newSkel, []);
    setLevels(singleLevels);
    setActiveLevelId('level-1');
    setOutline(singleLevels[0].outline);
    setSkeleton(singleLevels[0].skeleton);
    const newPlanes = syncMultiLevelPlanes(singleLevels, []);
    setPlanes(newPlanes);
    setAssets([]);
    setPitchBreaks([]);
    setFlashingAssignments([]);
    setSelectedPlaneId(null);
    clearMultiSelections();
    resetUndoHistory();
    triggerNotice(`✓ Imported outline (${newOutline.points.length} corners)`);
  };

  // Auto Generate Roof Lines (ONLY on explicit user button click; preserves existing verge/wall tags)
  const handleRunAutoLines = () => {
    const targetIds =
      activeLevelId === 'all' && levels.length > 1
        ? levels.filter((l) => l.outline.points.length >= 3).map((l) => l.id)
        : focusedLevel.outline.points.length >= 3
        ? [focusedLevel.id]
        : [];

    if (targetIds.length === 0) {
      triggerNotice('Draw or load a roof outline first');
      return;
    }

    let totalLines = 0;
    const nextLevels = levels.map((l) => {
      if (!targetIds.includes(l.id)) return l;
      const preparedOutline: RoofOutline = {
        ...l.outline,
        edges: l.outline.edges.map((e) => ({
          ...e,
          type: e.type === 'verge' || e.type === 'wall' ? e.type : 'outline'
        }))
      };
      const generated = generateSkeletonLines(preparedOutline).map((s) => ({
        ...s,
        levelId: s.levelId ?? l.id
      }));
      totalLines += generated.length;
      return { ...l, outline: preparedOutline, skeleton: generated };
    });
    applyLevelsUpdate(nextLevels, planes);
    triggerNotice(`✓ Generated ${totalLines} roof lines`);
  };

  // Classify a boundary edge without mutating skeleton or other edges' fall direction
  const handleClassifyEdge = (edgeId: string, edgeType: EdgeType) => {
    if (isReadOnlyGeometry) return;
    pushUndoSnapshot();
    const owningLvl = findLevelForEdge(edgeId);
    const nextOutline = classifyOutlineEdge(owningLvl.outline, edgeId, edgeType);
    const nextLevels = levels.map((l) =>
      l.id === owningLvl.id ? { ...l, outline: nextOutline } : l
    );
    applyLevelsUpdate(nextLevels, planes);
    triggerNotice(`✓ Classified edge as ${getRoofEdgeTypeMeta(edgeType).label}`);
  };

  // Batch Multi-Select Edit Handlers (Lock & Install Stage Gated + 15-Step Undo)
  const handleBatchPlanePitch = (planeIds: string[], pitchDeg: number) => {
    if (isReadOnlyGeometry || planeIds.length === 0) return;
    pushUndoSnapshot();
    const nextPlanes = applyPitchToPlanes(planes, planeIds, pitchDeg, levels);
    setPlanes(nextPlanes);
    setWallPlan((prev) => (prev ? syncWallPlanWithRoof(prev, levels, nextPlanes) : prev));
    triggerNotice(`✓ Applied ${pitchDeg}° pitch to ${planeIds.length} faces`);
  };

  const handleBatchPlaneDirection = (planeIds: string[], dir: 'left' | 'right') => {
    if (isReadOnlyGeometry || planeIds.length === 0) return;
    pushUndoSnapshot();
    setPlanes((prev) => applyDirectionToPlanes(prev, planeIds, dir));
    triggerNotice(`✓ Set lay direction (${dir === 'left' ? 'L→R' : 'R→L'}) on ${planeIds.length} faces`);
  };

  const handleBatchPlaneOrderedSheetLength = (planeIds: string[], lenM: number | undefined) => {
    if (isReadOnlyGeometry || planeIds.length === 0) return;
    pushUndoSnapshot();
    setPlanes((prev) => applyOrderedSheetLengthToPlanes(prev, planeIds, lenM));
    triggerNotice(
      lenM !== undefined
        ? `✓ Ordered sheet length set to ${Math.round(lenM * 1000)}mm on ${planeIds.length} faces`
        : `✓ Reset ordered sheet length to modeled run on ${planeIds.length} faces`
    );
  };

  const handleBatchPlaneEaveHeight = (planeIds: string[], heightM: number) => {
    if (isReadOnlyGeometry || planeIds.length === 0) return;
    pushUndoSnapshot();
    const clampedZ = +Math.max(0.5, Math.min(30, heightM)).toFixed(2);
    const targetPlanesSet = new Set(planeIds);
    const targetEdgeSet = new Set(
      planes.filter((p) => targetPlanesSet.has(p.id) && p.eaveEdgeId).map((p) => p.eaveEdgeId)
    );
    const nextLevels = levels.map((lvl) => {
      const matchedIds = lvl.outline.edges
        .filter((e) => targetEdgeSet.has(e.id))
        .map((e) => e.id);
      return matchedIds.length > 0
        ? { ...lvl, outline: applyEaveHeightToEdges(lvl.outline, matchedIds, clampedZ) }
        : lvl;
    });
    setLevels(nextLevels);
    const updatedFocus = nextLevels.find((l) => l.id === focusedLevel.id);
    if (updatedFocus) setOutline(updatedFocus.outline);
    const nextPlanes = planes.map((p) =>
      targetPlanesSet.has(p.id) ? { ...p, eaveHeightM: clampedZ } : p
    );
    setPlanes(nextPlanes);
    setWallPlan((prev) => (prev ? syncWallPlanWithRoof(prev, nextLevels, nextPlanes) : prev));
    triggerNotice(`✓ Set Eave Z = ${clampedZ}m across ${planeIds.length} faces`);
  };

  const handleBatchEdgeType = (edgeIds: string[], edgeType: EdgeType) => {
    if (isReadOnlyGeometry || edgeIds.length === 0) return;
    pushUndoSnapshot();
    const targetSet = new Set(edgeIds);
    const nextLevels = levels.map((lvl) => {
      const matched = lvl.outline.edges.filter((e) => targetSet.has(e.id)).map((e) => e.id);
      return matched.length > 0
        ? { ...lvl, outline: applyEdgeType(lvl.outline, matched, edgeType) }
        : lvl;
    });
    applyLevelsUpdate(nextLevels, planes);
    triggerNotice(`✓ Classified ${edgeIds.length} edges as ${getRoofEdgeTypeMeta(edgeType).label}`);
  };

  const handleBatchEdgeWall = (
    edgeIds: string[],
    updates: { hasWall?: boolean; eaveSetbackM?: number }
  ) => {
    if (isReadOnlyGeometry || edgeIds.length === 0) return;
    pushUndoSnapshot();
    const targetSet = new Set(edgeIds);
    const nextLevels = levels.map((lvl) => {
      const matched = lvl.outline.edges.filter((e) => targetSet.has(e.id)).map((e) => e.id);
      if (matched.length === 0) return lvl;
      let nextOut = lvl.outline;
      if (updates.eaveSetbackM !== undefined) {
        nextOut = applyEaveSetback(nextOut, matched, updates.eaveSetbackM, updates.hasWall);
      } else {
        matched.forEach((eid) => {
          nextOut = setEdgeWall(nextOut, eid, { hasWall: updates.hasWall });
        });
      }
      return { ...lvl, outline: nextOut };
    });
    setLevels(nextLevels);
    const updatedFocus = nextLevels.find((l) => l.id === focusedLevel.id);
    if (updatedFocus) setOutline(updatedFocus.outline);
    triggerNotice(
      updates.eaveSetbackM !== undefined
        ? `✓ Set ${updates.eaveSetbackM.toFixed(2)}m eave setback on ${edgeIds.length} edges`
        : `✓ Updated wall toggle on ${edgeIds.length} edges`
    );
  };

  const handleBatchEdgeHeight = (edgeIds: string[], heightM: number) => {
    if (isReadOnlyGeometry || edgeIds.length === 0) return;
    pushUndoSnapshot();
    const clampedZ = +Math.max(0.5, Math.min(30, heightM)).toFixed(2);
    const targetSet = new Set(edgeIds);
    const nextLevels = levels.map((lvl) => {
      const matched = lvl.outline.edges.filter((e) => targetSet.has(e.id)).map((e) => e.id);
      return matched.length > 0
        ? { ...lvl, outline: applyEaveHeightToEdges(lvl.outline, matched, clampedZ) }
        : lvl;
    });
    setLevels(nextLevels);
    const updatedFocus = nextLevels.find((l) => l.id === focusedLevel.id);
    if (updatedFocus) setOutline(updatedFocus.outline);
    const nextPlanes = planes.map((p) =>
      targetSet.has(p.eaveEdgeId) ? { ...p, eaveHeightM: clampedZ } : p
    );
    setPlanes(nextPlanes);
    setWallPlan((prev) => (prev ? syncWallPlanWithRoof(prev, nextLevels, nextPlanes) : prev));
    triggerNotice(`✓ Set Edge Z = ${clampedZ}m across ${edgeIds.length} edges`);
  };

  const handleBatchDefineEdges = (
    edgeIds: string[],
    updates: {
      edgeType?: EdgeType;
      pitchDeg?: number;
      eaveHeightM?: number;
      hasWall?: boolean;
      eaveSetbackM?: number;
      underlapSide?: 'left' | 'right';
    }
  ) => {
    if (isReadOnlyGeometry || edgeIds.length === 0) return;
    pushUndoSnapshot();
    const targetSet = new Set(edgeIds);
    let nextLevels = levels.map((lvl) => {
      const matched = lvl.outline.edges.filter((e) => targetSet.has(e.id)).map((e) => e.id);
      if (matched.length === 0) return lvl;
      let nextOut = lvl.outline;
      if (updates.edgeType) {
        nextOut = applyEdgeType(nextOut, matched, updates.edgeType);
      }
      if (updates.eaveHeightM !== undefined) {
        nextOut = applyEaveHeightToEdges(nextOut, matched, updates.eaveHeightM);
      }
      if (updates.eaveSetbackM !== undefined) {
        nextOut = applyEaveSetback(nextOut, matched, updates.eaveSetbackM, updates.hasWall);
      } else if (updates.hasWall !== undefined) {
        matched.forEach((eid) => {
          nextOut = setEdgeWall(nextOut, eid, { hasWall: updates.hasWall });
        });
      }
      return { ...lvl, outline: nextOut };
    });

    const pitchDefault = updates.pitchDeg ?? 22.5;
    let syncedPlanes = syncMultiLevelPlanes(nextLevels, planes, pitchDefault);
    const matchedPlaneIds = syncedPlanes
      .filter((p) => targetSet.has(p.eaveEdgeId))
      .map((p) => p.id);
    if (matchedPlaneIds.length > 0 && updates.pitchDeg !== undefined) {
      syncedPlanes = applyPitchToPlanes(syncedPlanes, matchedPlaneIds, updates.pitchDeg, nextLevels);
    }
    if (matchedPlaneIds.length > 0 && updates.underlapSide !== undefined) {
      syncedPlanes = applyDirectionToPlanes(syncedPlanes, matchedPlaneIds, updates.underlapSide);
    }

    setLevels(nextLevels);
    const updatedFocus = nextLevels.find((l) => l.id === focusedLevel.id);
    if (updatedFocus) setOutline(updatedFocus.outline);
    setPlanes(syncedPlanes);
    setWallPlan((prev) => (prev ? syncWallPlanWithRoof(prev, nextLevels, syncedPlanes) : prev));
    triggerNotice(`✓ Batch updated ${edgeIds.length} edges`);
  };

  const handleBatchSkeletonLineType = (lineIds: string[], lineType: SkeletonLineType) => {
    if (isReadOnlyGeometry || lineIds.length === 0) return;
    pushUndoSnapshot();
    const nextLevels = levels.map((lvl) => ({
      ...lvl,
      skeleton: applySkeletonLineType(lvl.skeleton, lineIds, lineType)
    }));
    applyLevelsUpdate(nextLevels, planes);
    triggerNotice(`✓ Updated ${lineIds.length} roof lines`);
  };

  const handleBatchWallUpdate = (
    facetIds: string[],
    patch: {
      claddingType?: WallCladdingType;
      kind?: WallFacetKind;
      heightM?: number;
      heightSource?: WallHeightSource;
    }
  ) => {
    if (isReadOnlyGeometry || facetIds.length === 0) return;
    pushUndoSnapshot();
    setWallPlan((prev) =>
      prev
        ? batchUpdateWallFacetsInPlan(prev, facetIds, {
            ...patch,
            roofLevels: levels,
            roofPlanes: planes
          })
        : prev
    );
    triggerNotice(`✓ Batch updated ${facetIds.length} wall faces`);
  };

  // ExactRoof Edge Classification, Eave Selection, Sheet Direction & Plane Pitch/Height Setup (Zero Auto-Skeleton)
  const handleSavePlane = (options: {
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
  }) => {
    if (!selectedEdgeForPlane) return;
    const owningLvl = findLevelForEdge(selectedEdgeForPlane.id);
    let nextOutline = owningLvl.outline;
    const nextSkel = owningLvl.skeleton;

    const targetEaveId = options.eaveEdgeId || selectedEdgeForPlane.id;
    const targetEaveObjBefore =
      nextOutline.edges.find((e) => e.id === targetEaveId) || selectedEdgeForPlane;
    const currentLen = dist(targetEaveObjBefore.from, targetEaveObjBefore.to);
    if (
      typeof options.eaveLengthM === 'number' &&
      options.eaveLengthM > 0.3 &&
      Math.abs(options.eaveLengthM - currentLen) > 0.01
    ) {
      nextOutline = updateEdgeLength(nextOutline, targetEaveId, options.eaveLengthM);
    }

    // 1. Classify clicked edge as requested without shifting other edges' fall
    nextOutline = classifyOutlineEdge(nextOutline, selectedEdgeForPlane.id, options.edgeType);

    // 2. Ensure the chosen eave edge is marked active ('outline') unless user intentionally clicked it and classified it non-eave while choosing it
    if (targetEaveId !== selectedEdgeForPlane.id || options.edgeType === 'unclassified') {
      nextOutline = classifyOutlineEdge(nextOutline, targetEaveId, 'outline');
    }

    const clampedZ = +Math.max(0.5, Math.min(30, options.eaveHeightM)).toFixed(2);
    nextOutline = {
      ...nextOutline,
      edges: nextOutline.edges.map((e) =>
        e.id === targetEaveId ? { ...e, eaveHeightM: clampedZ } : e
      )
    };

    if (options.hasWall !== undefined || options.eaveSetbackM !== undefined) {
      nextOutline = setEdgeWall(nextOutline, targetEaveId, {
        hasWall: options.hasWall,
        eaveSetbackM: options.eaveSetbackM
      });
    }

    const nextLevels = levels.map((l) =>
      l.id === owningLvl.id ? { ...l, outline: nextOutline, skeleton: nextSkel } : l
    );

    const updatedEdge =
      nextOutline.edges.find((e) => e.id === targetEaveId) || targetEaveObjBefore;

    if (updatedEdge.type !== 'outline') {
      // User classified this edge as ridge/hip/valley/verge/wall and also targeted it — save classification without forcing a plane
      const prunedPlanes = planes.filter((p) => p.eaveEdgeId !== updatedEdge.id);
      applyLevelsUpdate(nextLevels, prunedPlanes, options.pitchDeg);
      if (selectedPlaneId && !prunedPlanes.some((p) => p.id === selectedPlaneId)) {
        setSelectedPlaneId(null);
      }
      triggerNotice(`✓ Classified edge as ${updatedEdge.type}`);
      return;
    }

    const existingPlane = planes.find((p) => p.eaveEdgeId === targetEaveId);
    const customPlane = createPlaneFromEdge(nextOutline, nextSkel, updatedEdge, {
      pitchDeg: options.pitchDeg,
      underlapSide: options.underlapSide,
      eaveHeightM: clampedZ,
      sheetRunEdgeId: options.sheetRunEdgeId || targetEaveId,
      orderedSheetLengthM: existingPlane?.orderedSheetLengthM,
      name: options.name,
      levelId: owningLvl.id,
      levelCode: owningLvl.code,
      levelName: owningLvl.name
    });

    const seedPlanes = [
      ...planes.filter((p) => p.eaveEdgeId !== targetEaveId),
      customPlane
    ];
    applyLevelsUpdate(nextLevels, seedPlanes, options.pitchDeg);
    setSelectedPlaneId(customPlane.id);
    triggerNotice(`✓ ${customPlane.name} · ${options.pitchDeg}° @ Z:${clampedZ}m`);
  };

  // Generate Layout Button
  const handleGenerateLayoutClick = () => {
    if (planes.length === 0) {
      if (outline.edges.length >= 3) {
        const autoPlanes = syncMultiLevelPlanes(levels, []);
        setPlanes(autoPlanes);
        const res = generateCuttingLayout(autoPlanes, sheetSpec, {
          startPlaneId: startPlaneId || undefined,
          assets,
          pitchBreaks,
          sheetOrderMode
        });
        setLayoutResult(res);
        setActiveTab('layout_results');
        triggerNotice(
          `✓ ${res.parents.length} sheets · ${res.totalOrderedMetres.toFixed(1)}m ordered (${res.totalOffcutsReused} offcuts saved ${res.savedMetres}m)`
        );
        return;
      }
      triggerNotice('Draw outline & set pitch first');
      return;
    }
    const res = generateCuttingLayout(planes, sheetSpec, {
      startPlaneId: startPlaneId || undefined,
      assets,
      pitchBreaks,
      sheetOrderMode
    });
    setLayoutResult(res);
    setActiveTab('layout_results');
    triggerNotice(
      `✓ ${res.parents.length} sheets · ${res.totalOrderedMetres.toFixed(1)}m ordered (${res.totalOffcutsReused} offcuts saved ${res.savedMetres}m)`
    );
  };

  // Enumerate all assignable roof lines across all roof levels with accurate 3D sloped lengths
  const assignableLines = useMemo(
    () => getAssignableRoofLinesMultiLevel(levels, planes, assets, pitchBreaks),
    [levels, planes, assets, pitchBreaks]
  );

  const unassignedLineCount = useMemo(
    () =>
      assignableLines.filter((l) => !flashingAssignments.some((a) => a.lineId === l.lineId)).length,
    [assignableLines, flashingAssignments]
  );

  const completenessReport = useMemo(
    () =>
      evaluateTakeoffCompleteness({
        levels,
        planes,
        assignableLines,
        flashingAssignments,
        wallPlan,
        assets
      }),
    [levels, planes, assignableLines, flashingAssignments, wallPlan, assets]
  );

  const sheetOrderComparison = useMemo<SheetOrderComparisonSummary | undefined>(() => {
    if (planes.length === 0) return undefined;
    const prac =
      layoutResult && (layoutResult.sheetOrderMode || 'practical') === 'practical'
        ? layoutResult
        : generateCuttingLayout(planes, sheetSpec, {
            startPlaneId: startPlaneId || undefined,
            assets,
            pitchBreaks,
            sheetOrderMode: 'practical'
          });
    const opt =
      layoutResult && layoutResult.sheetOrderMode === 'optimized'
        ? layoutResult
        : generateCuttingLayout(planes, sheetSpec, {
            startPlaneId: startPlaneId || undefined,
            assets,
            pitchBreaks,
            sheetOrderMode: 'optimized'
          });
    const countDistinctMm = (parents: LayoutResult['parents']) =>
      new Set(parents.map((p) => Math.round(p.length * 1000))).size;
    return {
      practicalOrderedLm: +prac.totalOrderedMetres.toFixed(2),
      practicalSheetsCount: prac.parents.length,
      practicalDistinctLengths: countDistinctMm(prac.parents),
      optimizedOrderedLm: +opt.totalOrderedMetres.toFixed(2),
      optimizedSheetsCount: opt.parents.length,
      optimizedDistinctLengths: countDistinctMm(opt.parents)
    };
  }, [planes, sheetSpec, startPlaneId, assets, pitchBreaks, layoutResult]);

  // Computed BOM & Site Roofing Packs
  const roofBom = useMemo(
    () =>
      buildRoofBillOfMaterials({
        planes,
        layout: layoutResult,
        assignments: flashingAssignments,
        assignableLines,
        assets,
        sheetOrderMode,
        comparisonSummary: sheetOrderComparison
      }),
    [planes, layoutResult, flashingAssignments, assignableLines, assets, sheetOrderMode, sheetOrderComparison]
  );

  const roofingPacks = useMemo(
    () =>
      computeRoofingPacks({
        layout: layoutResult,
        planes,
        customSequencePlaneIds: installProgress.customSequencePlaneIds
      }),
    [layoutResult, planes, installProgress.customSequencePlaneIds]
  );

  const customSequenceMap = useMemo(() => {
    const map = new Map<string, number>();
    roofingPacks.forEach((pk) => map.set(pk.planeId, pk.sequenceNumber));
    return map;
  }, [roofingPacks]);

  const libraryProfiles = useMemo(
    () => getMergedFlashingLibrary(project),
    [project, project?.flashingProfiles, libraryVersion]
  );

  const liveOrderPack = useMemo(() => {
    if (measureLocked && frozenOrderPack) return frozenOrderPack;
    return buildOrderPack({
      project,
      planes,
      levels,
      layout: layoutResult,
      bom: roofBom,
      assignableLines,
      assignments: flashingAssignments,
      libraryProfiles,
      assets,
      wallPlan,
      completenessReport,
      locked: measureLocked,
      confirmedAt: project?.roofPlanModel?.measureConfirmedAt,
      confirmedBy: project?.roofPlanModel?.measureConfirmedBy,
      sheetOrderMode,
      comparisonSummary: sheetOrderComparison
    });
  }, [
    measureLocked,
    frozenOrderPack,
    project,
    planes,
    levels,
    layoutResult,
    roofBom,
    assignableLines,
    flashingAssignments,
    libraryProfiles,
    assets,
    wallPlan,
    completenessReport,
    sheetOrderMode,
    sheetOrderComparison
  ]);

  const deterministicAuditReport = useMemo<DeterministicRoofAuditReport>(
    () =>
      runDeterministicRoofAudit({
        planes,
        levels,
        layout: layoutResult,
        sheetSpec,
        assignableLines,
        flashingAssignments,
        profileName: project?.profile || 'TRS Corrugate 0.55mm',
        windZone: project?.windZone || 'High',
        prevailingWind: 'SW'
      }),
    [planes, levels, layoutResult, sheetSpec, assignableLines, flashingAssignments, project?.profile, project?.windZone]
  );

  const isReadOnlyGeometry =
    lifecycleStage === 'installing' || (lifecycleStage === 'measuring' && measureLocked);

  const pushUndoSnapshot = () => {
    if (isReadOnlyGeometry) return;
    const snap: RoofUndoSnapshot = {
      levels: levels.map((l) => ({
        ...l,
        outline: { ...l.outline, edges: [...l.outline.edges], points: [...l.outline.points] },
        skeleton: [...l.skeleton]
      })),
      activeLevelId,
      outline: { ...outline, edges: [...outline.edges], points: [...outline.points] },
      skeleton: [...skeleton],
      planes: [...planes],
      wallPlan: wallPlan ? { ...wallPlan, facets: [...wallPlan.facets] } : null
    };
    undoStackRef.current = [...undoStackRef.current.slice(-14), snap];
    setCanUndo(true);
  };

  const handleUndo = () => {
    if (isReadOnlyGeometry || undoStackRef.current.length === 0) return;
    const prevSnap = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setCanUndo(undoStackRef.current.length > 0);
    setLevels(prevSnap.levels);
    setActiveLevelId(prevSnap.activeLevelId);
    setOutline(prevSnap.outline);
    setSkeleton(prevSnap.skeleton);
    setPlanes(prevSnap.planes);
    setWallPlan(prevSnap.wallPlan);
    triggerNotice('✓ Undid last change');
  };

  const undoActionRef = useRef({ handleUndo, isReadOnlyGeometry });
  undoActionRef.current = { handleUndo, isReadOnlyGeometry };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (undoActionRef.current.isReadOnlyGeometry) return;
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        const isEditable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          Boolean((e.target as HTMLElement | null)?.isContentEditable);
        if (isEditable) return;
        if (undoStackRef.current.length > 0) {
          e.preventDefault();
          undoActionRef.current.handleUndo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleChangeSheetOrderMode = (nextMode: SheetOrderMode) => {
    if (measureLocked || lifecycleStage === 'installing') return;
    setSheetOrderMode(nextMode);
    triggerNotice(
      nextMode === 'practical'
        ? 'Sheet Ordering: Practical (Simple Site Cut List)'
        : 'Sheet Ordering: Optimized (Tight Repress Nest)'
    );
  };

  const buildCurrentSnapshot = (overrides?: Partial<ExactRoofModelSnapshot>): ExactRoofModelSnapshot => ({
    version: 2,
    stage: overrides?.stage ?? lifecycleStage,
    measureLocked: overrides?.measureLocked ?? measureLocked,
    measureConfirmedAt: overrides?.measureConfirmedAt ?? project?.roofPlanModel?.measureConfirmedAt,
    measureConfirmedBy: overrides?.measureConfirmedBy ?? project?.roofPlanModel?.measureConfirmedBy,
    sheetOrderMode: overrides?.sheetOrderMode ?? sheetOrderMode,
    selectedPreset,
    outline,
    skeleton,
    planes,
    levels,
    activeLevelId,
    startPlaneId,
    assets,
    pitchBreaks,
    flashingAssignments,
    installProgress: overrides?.installProgress ?? installProgress,
    planUnderlay: overrides?.planUnderlay !== undefined ? overrides.planUnderlay : planUnderlay,
    wallPlan: overrides?.wallPlan !== undefined ? overrides.wallPlan : wallPlan,
    layout: layoutResult || undefined,
    bom: roofBom,
    orderPack:
      overrides?.orderPack !== undefined
        ? overrides.orderPack
        : measureLocked
        ? frozenOrderPack || liveOrderPack
        : undefined,
    lastUpdatedAt: new Date().toISOString(),
    updatedBy: activeMemberName || 'ApexMap User'
  });

  const projectPlans = useMemo(() => {
    const combined = [
      ...(project?.architecturalPlans || []),
      ...(project?.plans || [])
    ];
    const seen = new Set<string>();
    return combined.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [project?.architecturalPlans, project?.plans]);

  const persistSnapshotToProject = (snap: ExactRoofModelSnapshot) => {
    if (onSaveToProject && layoutResult) {
      onSaveToProject(planes, layoutResult, flashingAssignments, snap);
      return;
    }
    if (project && onUpdateProject) {
      const convertedFacets = convertExactLayoutToRoofFacets({
        planes,
        layout: layoutResult,
        colorName: project.colorName
      });
      onUpdateProject({
        ...project,
        roofAreaM2: +(roofBom.totalRoofAreaM2 || project.roofAreaM2).toFixed(1),
        roofPlanModel: {
          ...(project.roofPlanModel || {}),
          ...snap,
          facets: convertedFacets,
          pitchDegrees: planes[0]?.pitchDeg || project.roofPitchDegrees
        },
        roofMapFacets: convertedFacets
      });
    }
  };

  const handleSaveToProject = () => {
    const snap = buildCurrentSnapshot();
    persistSnapshotToProject(snap);
    triggerNotice(project ? `✓ Saved stage (${lifecycleStage}) & BOM to ${project.projectNumber}` : '✓ Saved roof plan');
  };

  const handleConfirmLockMeasure = () => {
    if (!completenessReport.canLockMeasure) {
      setIsMeasureLockGateOpen(true);
      triggerNotice(`Resolve ${completenessReport.blockersCount} blocker(s) before locking measure`);
      return;
    }
    const confirmedAt = new Date().toISOString();
    const confirmedBy = activeMemberName || 'Site Lead';
    const nextLayout =
      layoutResult ||
      (planes.length > 0
        ? generateCuttingLayout(planes, sheetSpec, {
            startPlaneId: startPlaneId || undefined,
            assets,
            pitchBreaks,
            sheetOrderMode
          })
        : null);
    if (nextLayout && !layoutResult) {
      setLayoutResult(nextLayout);
    }
    const nextBom = buildRoofBillOfMaterials({
      planes,
      layout: nextLayout,
      assignments: flashingAssignments,
      assignableLines,
      assets,
      sheetOrderMode,
      comparisonSummary: sheetOrderComparison
    });
    const emittedOrderPack = buildOrderPack({
      project,
      planes,
      levels,
      layout: nextLayout,
      bom: nextBom,
      assignableLines,
      assignments: flashingAssignments,
      libraryProfiles,
      assets,
      wallPlan,
      completenessReport,
      locked: true,
      confirmedAt,
      confirmedBy,
      sheetOrderMode,
      comparisonSummary: sheetOrderComparison
    });

    const nextSnap = buildCurrentSnapshot({
      stage: 'installing',
      measureLocked: true,
      measureConfirmedAt: confirmedAt,
      measureConfirmedBy: confirmedBy,
      orderPack: emittedOrderPack
    });
    setFrozenOrderPack(emittedOrderPack);
    setIsMeasureLockGateOpen(false);
    setMeasureLocked(true);
    setLifecycleStage('installing');
    setActiveTab('layout_results');
    persistSnapshotToProject(nextSnap);
    triggerNotice('Measure confirmed & locked · Order Pack emitted for site & yard');
  };

  const handleRequestLockMeasure = () => {
    if (!completenessReport.canLockMeasure || completenessReport.warningsCount > 0) {
      setIsMeasureLockGateOpen(true);
      return;
    }
    handleConfirmLockMeasure();
  };

  const handleJumpToCompletenessIssue = (issue: TakeoffCompletenessIssue) => {
    setIsMeasureLockGateOpen(false);
    if (issue.category === 'undetailed_return') {
      setWallFilterMode('returns');
      if (issue.targetId) {
        handleOpenWallElevation(issue.targetId);
      } else {
        setActiveTab('wall_plan');
      }
      return;
    }
    if (issue.category === 'undetailed_parapet') {
      setWallFilterMode('parapets');
      if (issue.targetId) {
        handleOpenWallElevation(issue.targetId);
      } else {
        setActiveTab('wall_plan');
      }
      return;
    }
    if (issue.category === 'undetailed_secondary') {
      setWallFilterMode('secondary');
      if (issue.targetId) {
        handleOpenWallElevation(issue.targetId);
      } else {
        setActiveTab('wall_plan');
      }
      return;
    }
    if (issue.category === 'undetailed_wall') {
      setWallFilterMode('undetailed');
      if (issue.targetId) {
        handleOpenWallElevation(issue.targetId);
      } else {
        setActiveTab('wall_plan');
      }
      return;
    }
    if (issue.category === 'missing_flashing') {
      if (issue.targetId) {
        setActiveFlashingLineId(issue.targetId);
      }
      return;
    }
    if (issue.category === 'incomplete_plane') {
      setActiveTab('canvas_plan');
      if (issue.targetId) {
        const matchedPlane = planes.find((p) => p.id === issue.targetId);
        if (matchedPlane) {
          handleSelectPlane(matchedPlane.id);
        } else {
          handleSelectLevel(issue.targetId);
        }
      }
      setIsInspectorOpen(true);
      return;
    }
    if (issue.category === 'mixed_pitch') {
      setActiveTab('canvas_plan');
      const targetLvlId = issue.targetId || activeLevelId;
      if (targetLvlId && targetLvlId !== 'all') {
        handleSelectLevel(targetLvlId);
      }
      const lvlPlanes = planes
        .filter((p) => !p.isVirtualAssetPlane && (targetLvlId === 'all' || (p.levelId || 'level-1') === targetLvlId))
        .map((p) => p.id);
      if (lvlPlanes.length > 0) {
        setSelectedPlaneIds(lvlPlanes);
      }
      setIsInspectorOpen(true);
      return;
    }
    if (issue.category === 'incomplete_penetration') {
      setActiveTab('canvas_plan');
      if (issue.targetId) {
        handleSelectAsset(issue.targetId);
      }
      setIsInspectorOpen(true);
    }
  };

  const handleUnlockMeasure = () => {
    const nextSnap = buildCurrentSnapshot({
      stage: 'measuring',
      measureLocked: false,
      orderPack: null
    });
    setFrozenOrderPack(null);
    setMeasureLocked(false);
    setLifecycleStage('measuring');
    setActiveTab('measure_check');
    persistSnapshotToProject(nextSnap);
    triggerNotice('Measure unlocked for variations & re-measure');
  };

  const handleSelectStage = (nextStage: RoofLifecycleStage) => {
    setLifecycleStage(nextStage);
    setIsTemplateDropdownOpen(false);
    setIsMobileToolsOpen(false);
    setIsInstallViewsOpen(false);
    if (nextStage === 'installing') {
      setActiveTab('layout_results');
      setIsInspectorOpen(false);
      setIsAiDrawerOpen(false);
      setIsAiCopilotOpen(false);
    } else if (nextStage === 'measuring') {
      setActiveTab('measure_check');
    } else if (nextStage === 'quoting') {
      if (
        activeTab === 'measure_check' ||
        activeTab === 'layout_results' ||
        activeTab === 'flashing_workshop'
      ) {
        setActiveTab('canvas_plan');
      }
    }
  };

  const nextIncompletePack = useMemo(
    () =>
      roofingPacks.find(
        (pk) => !installProgress.completedPlaneIds.includes(pk.planeId)
      ) || null,
    [roofingPacks, installProgress.completedPlaneIds]
  );

  const handleAdvanceNextInstallPack = () => {
    if (!nextIncompletePack) {
      setOrderModalTab('order_pack');
      setIsOrderModalOpen(true);
      return;
    }
    if (activeTab !== 'layout_results') {
      setActiveTab('layout_results');
      handleSelectPlane(nextIncompletePack.planeId);
      return;
    }
    const nextCompleted = [
      ...installProgress.completedPlaneIds,
      nextIncompletePack.planeId
    ];
    const nextProgress: RoofInstallProgress = {
      ...installProgress,
      completedPlaneIds: nextCompleted,
      lastUpdatedAt: new Date().toISOString()
    };
    handleUpdateInstallProgress(nextProgress);
    const upcoming = roofingPacks.find(
      (pk) => !nextCompleted.includes(pk.planeId)
    );
    if (upcoming) {
      handleSelectPlane(upcoming.planeId);
      triggerNotice(`✓ Face ${nextIncompletePack.code} complete · Next: Face ${upcoming.code}`);
    } else {
      triggerNotice(`✓ All ${roofingPacks.length} packs completed`);
    }
  };

  const handleUpdateInstallProgress = (nextProgress: RoofInstallProgress) => {
    setInstallProgress(nextProgress);
    const snap = buildCurrentSnapshot({ installProgress: nextProgress });
    persistSnapshotToProject(snap);
  };

  const handleInstallSelectPlaneTap = (planeId: string) => {
    handleSelectPlane(planeId);
  };

  const activeFlashingLine = useMemo(
    () => assignableLines.find((l) => l.lineId === activeFlashingLineId) || null,
    [assignableLines, activeFlashingLineId]
  );

  const designerProject = useMemo(
    () =>
      ({
        ...(project || {
          id: 'exact-roofing-temp',
          projectNumber: 'ER-2026',
          title: 'Exact Roofing Plan',
          material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
          colorName: 'FlaxPod'
        }),
        flashingProfiles: libraryProfiles
      } as Project),
    [project, libraryProfiles]
  );

  const handleSaveFlashingAssignment = (assignment: RoofFlashingAssignment) => {
    setFlashingAssignments((prev) => [
      ...prev.filter((a) => a.lineId !== assignment.lineId),
      assignment
    ]);
    triggerNotice(`✓ Assigned ${assignment.profileName} to ${assignment.lineLabel}`);
  };

  const handleRemoveFlashingAssignment = (lineId: string) => {
    setFlashingAssignments((prev) => prev.filter((a) => a.lineId !== lineId));
    triggerNotice('Removed flashing assignment');
  };

  const handleAssignFromDrawingSuite = (profile: FlashingProfile) => {
    if (!drawingSuiteSession) return;
    saveProfileToSharedFlashingLibrary(profile);
    if (project && onUpdateProject) {
      const existingProjProfiles = project.flashingProfiles || [];
      const nextProjProfiles = existingProjProfiles.some((p) => p.id === profile.id)
        ? existingProjProfiles.map((p) => (p.id === profile.id ? profile : p))
        : [profile, ...existingProjProfiles];
      onUpdateProject({ ...project, flashingProfiles: nextProjProfiles });
    }
    setLibraryVersion((v) => v + 1);

    const targetLine = drawingSuiteSession.line;
    const breakdown = computeFlashingPieceBreakdown(
      targetLine.trueSlopeLengthM,
      targetLine.flashingKind
    );
    const specs = extractAssignmentFlashingSpecs(profile, targetLine.flashingKind);
    const pieceLengthMm = Math.max(100, Math.round(breakdown.recommendedPieceLengthM * 1000));
    const pieceLengthLm = +(pieceLengthMm / 1000).toFixed(3);

    const assignment: RoofFlashingAssignment = {
      id: `assign-${targetLine.lineId}`,
      lineId: targetLine.lineId,
      lineLabel: targetLine.label,
      flashingKind: targetLine.flashingKind,
      profileId: profile.id,
      profileName: profile.name,
      productCode: specs.productCode,
      developedBlankWidthMm: specs.developedBlankWidthMm,
      girthTier: specs.girthTier,
      bendCount: specs.bendCount,
      keyAnglesDeg: specs.keyAnglesDeg,
      hasHemCrush: specs.hasHemCrush,
      material: profile.material || project?.material || '0.55mm ColorCote Vitor+',
      colorName: profile.colorName || project?.colorName || 'FlaxPod',
      planLengthM: targetLine.planLengthM,
      trueSlopeLengthM: targetLine.trueSlopeLengthM,
      pieceLengthLm,
      pieceLengthMm,
      quantity: breakdown.recommendedQuantity,
      totalLinearMetres: +(breakdown.recommendedQuantity * pieceLengthLm).toFixed(3),
      notes: getDefaultMitreNotes(targetLine.flashingKind),
      assignedAt: new Date().toISOString(),
      orderedToWorkshop: false,
      orderedToCrm: false
    };

    handleSaveFlashingAssignment(assignment);
    setDrawingSuiteSession(null);
  };

  const selectedPlane = useMemo(() => {
    return planes.find((p) => p.id === selectedPlaneId) || null;
  }, [planes, selectedPlaneId]);

  const selectedAsset = useMemo(() => {
    return assets.find((a) => a.id === selectedAssetId) || null;
  }, [assets, selectedAssetId]);

  const selectedPitchBreak = useMemo(() => {
    return pitchBreaks.find((pb) => pb.id === selectedPitchBreakId) || null;
  }, [pitchBreaks, selectedPitchBreakId]);

  const templateDropdownMenu = isTemplateDropdownOpen && (
    <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#0e1526] border border-slate-750 rounded-2xl p-1.5 shadow-2xl z-50 animate-in fade-in slide-in-from-top-1 space-y-0.5 max-h-[75vh] overflow-y-auto">
      <div className="px-2 py-1 text-[10px] font-mono uppercase text-slate-400 font-bold">
        Contextual Tools &amp; Views
      </div>
      <button
        type="button"
        onClick={() => {
          setIsTemplateDropdownOpen(false);
          setWallSubView('plan');
          setActiveTab('wall_plan');
        }}
        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
          activeTab === 'wall_plan'
            ? 'bg-amber-600 text-white'
            : 'text-slate-200 hover:bg-slate-800'
        }`}
      >
        <Building2 className="w-3.5 h-3.5 text-amber-400" />
        <span>Walls &amp; Elevations</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setIsTemplateDropdownOpen(false);
          setActiveTab('view_3d');
        }}
        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
          activeTab === 'view_3d'
            ? 'bg-blue-600 text-white'
            : 'text-slate-200 hover:bg-slate-800'
        }`}
      >
        <Box className="w-3.5 h-3.5 text-blue-400" />
        <span>3D Roof &amp; Wall Model</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setIsTemplateDropdownOpen(false);
          handleGenerateLayoutClick();
        }}
        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
          activeTab === 'layout_results'
            ? 'bg-sky-600 text-white'
            : 'text-slate-200 hover:bg-slate-800'
        }`}
      >
        <Scissors className="w-3.5 h-3.5 text-sky-400" />
        <span>Sheet Cuts &amp; Offcuts</span>
      </button>

      <button
        type="button"
        onClick={() => {
          setIsTemplateDropdownOpen(false);
          setActiveTab('flashing_workshop');
        }}
        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
          activeTab === 'flashing_workshop'
            ? 'bg-sky-600 text-white'
            : 'text-slate-200 hover:bg-slate-800'
        }`}
      >
        <Ruler className="w-3.5 h-3.5 text-sky-400" />
        <span>Flashings Workshop</span>
      </button>

      {!isReadOnlyGeometry && canUndo && (
        <button
          type="button"
          onClick={() => {
            handleUndo();
            setIsTemplateDropdownOpen(false);
          }}
          className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 text-amber-300 hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo Last Edit</span>
          </span>
          <span className="text-[10px] font-mono text-slate-500">⌘Z</span>
        </button>
      )}

      {!isReadOnlyGeometry && (
        <>
          <div className="my-1 border-t border-slate-800" />

          <div className="px-2 py-1 text-[10px] font-mono uppercase text-slate-400 font-bold">
            Roof Presets
          </div>
          {[
            { key: 'rectangle_14x10' as const, label: '14m × 10m Hip & Ridge' },
            { key: 'l_shape_standard' as const, label: 'L-Shape Valley & Hips' },
            { key: 'straight_gable' as const, label: 'Classic Duo-Pitch Gable' },
            { key: 't_shape' as const, label: 'T-Shape Villa' },
            { key: 'two_storey_split' as const, label: '2-Storey Upper + Lower' },
            { key: 'cascading_terrace' as const, label: 'Cascading Terraced Roof' }
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => handleSelectPreset(item.key)}
              className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                selectedPreset === item.key
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>{item.label}</span>
              {selectedPreset === item.key && <span className="text-[10px]">✓</span>}
            </button>
          ))}

          <div className="my-1 border-t border-slate-800" />

          <button
            onClick={() => {
              setIsTemplateDropdownOpen(false);
              setActiveTab('canvas_plan');
              setOpenPlanModalSignal((s) => s + 1);
            }}
            className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold text-amber-300 hover:bg-amber-600/20 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <FileImage className="w-3.5 h-3.5" />
            <span>Architectural Plan (2-Pt Scale)</span>
          </button>

          <button
            onClick={() => {
              setIsTemplateDropdownOpen(false);
              setIsImportModalOpen(true);
            }}
            className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold text-blue-400 hover:bg-blue-600/20 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import (SVG / DXF / JSON)</span>
          </button>

          <button
            onClick={handleStartBlank}
            className="w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold text-emerald-400 hover:bg-emerald-600/20 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Draw From Scratch (Blank)</span>
          </button>
        </>
      )}
    </div>
  );

  // ============================================================================
  // MOBILE PWA FLUID FULL-SCREEN EXPERIENCE
  // ============================================================================
  if (isMobile) {
    const mobileRootClass = isFullscreen
      ? 'fixed inset-0 z-[75] h-[100dvh] w-full flex flex-col bg-[#070b14] text-white font-sans select-none overflow-hidden'
      : embedded
      ? 'h-[78dvh] min-h-[520px] w-full flex flex-col bg-[#070b14] text-white font-sans select-none overflow-hidden rounded-2xl border border-slate-800 shadow-xl relative'
      : 'h-[100dvh] w-full flex flex-col bg-[#070b14] text-white font-sans select-none overflow-hidden';

    return (
      <div className={mobileRootClass}>
        {/* Floating Toast Notice */}
        {notice && (
          <div className="fixed top-14 left-3 right-3 z-[85] bg-emerald-950/95 text-emerald-200 border border-emerald-600/80 px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center justify-between shadow-2xl animate-in fade-in">
            <div className="flex items-center gap-2 truncate">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">{notice}</span>
            </div>
            <button onClick={() => setNotice(null)} className="text-emerald-400 ml-2 font-bold">
              ✕
            </button>
          </div>
        )}

        {/* Ultra-Slim Single-Row Mobile Header (Zero Overlap & Clean Spacing) */}
        <header
          className={`shrink-0 bg-[#0b101d] border-b border-slate-800/90 px-2.5 py-1.5 z-30 ${
            !embedded || isFullscreen ? 'pt-[calc(0.45rem+env(safe-area-inset-top))]' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {onOpenMobileMenu && !embedded && (
                <button
                  onClick={onOpenMobileMenu}
                  className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 cursor-pointer shrink-0"
                  aria-label="Open Navigation Menu"
                >
                  <Menu className="w-4 h-4" />
                </button>
              )}

              {/* Combined Stage, Project, Actions & Templates Pop-Out Hub Menu */}
              <div className="relative min-w-0" ref={mobileHubMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsMobileHubMenuOpen((v) => !v)}
                  className="h-10 px-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer max-w-full"
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      lifecycleStage === 'quoting'
                        ? 'bg-blue-400'
                        : lifecycleStage === 'measuring'
                        ? 'bg-sky-400'
                        : 'bg-emerald-400'
                    }`}
                  />
                  <span className="truncate">
                    {lifecycleStage === 'quoting'
                      ? 'Quote'
                      : lifecycleStage === 'measuring'
                      ? measureLocked
                        ? 'Locked'
                        : 'Measure'
                      : 'Install'}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
                      isMobileHubMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isMobileHubMenuOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-72 max-w-[calc(100vw-20px)] bg-[#0b101d]/98 backdrop-blur-md border border-slate-700 rounded-2xl p-2.5 shadow-2xl space-y-2.5 z-50 animate-in fade-in slide-in-from-top-1 max-h-[75dvh] overflow-y-auto">
                    {/* 1. Stage Switcher */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-mono uppercase text-slate-400 font-bold px-1">
                        Job Stage
                      </div>
                      <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#070b14] rounded-xl border border-slate-800">
                        {(['quoting', 'measuring', 'installing'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              handleSelectStage(st);
                              setIsMobileHubMenuOpen(false);
                            }}
                            className={`min-h-[36px] rounded-lg text-[11px] font-extrabold capitalize transition-all cursor-pointer flex items-center justify-center gap-1 ${
                              lifecycleStage === st
                                ? st === 'quoting'
                                  ? 'bg-blue-600 text-white'
                                  : st === 'measuring'
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-emerald-600 text-white'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {st === 'measuring' && measureLocked && <Lock className="w-2.5 h-2.5" />}
                            <span>{st === 'quoting' ? 'Quote' : st === 'measuring' ? 'Measure' : 'Install'}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick Stage Lock / Unlock / Save / Fullscreen Controls */}
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          handleSaveToProject();
                          setIsMobileHubMenuOpen(false);
                        }}
                        className="min-h-[38px] px-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Stage</span>
                      </button>

                      {embedded ? (
                        <button
                          type="button"
                          onClick={() => {
                            setIsFullscreen(!isFullscreen);
                            setIsMobileHubMenuOpen(false);
                          }}
                          className="min-h-[38px] px-2 rounded-xl bg-slate-900 border border-slate-800 text-sky-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                          <span>{isFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
                        </button>
                      ) : lifecycleStage === 'measuring' && !measureLocked ? (
                        <button
                          type="button"
                          onClick={() => {
                            handleRequestLockMeasure();
                            setIsMobileHubMenuOpen(false);
                          }}
                          className="min-h-[38px] px-2 rounded-xl bg-amber-600/25 border border-amber-500/50 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Lock Measure</span>
                        </button>
                      ) : measureLocked ? (
                        <button
                          type="button"
                          onClick={() => {
                            handleUnlockMeasure();
                            setIsMobileHubMenuOpen(false);
                          }}
                          className="min-h-[38px] px-2 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Unlock</span>
                        </button>
                      ) : lifecycleStage !== 'installing' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setOrderModalTab(lifecycleStage === 'quoting' && onPushBomToQuote ? 'quote' : 'orders');
                            setIsOrderModalOpen(true);
                            setIsMobileHubMenuOpen(false);
                          }}
                          className="min-h-[38px] px-2 rounded-xl bg-slate-900 border border-slate-800 text-emerald-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>Orders &amp; BOM</span>
                        </button>
                      ) : (
                        <div className="min-h-[38px] px-2 rounded-xl bg-slate-900 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold flex items-center justify-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" />
                          <span>Spec Locked</span>
                        </div>
                      )}
                    </div>

                    {measureLocked && embedded && (
                      <button
                        type="button"
                        onClick={() => {
                          handleUnlockMeasure();
                          setIsMobileHubMenuOpen(false);
                        }}
                        className="w-full min-h-[38px] rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-300 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Unlock Measure for Variations</span>
                      </button>
                    )}

                    {/* 2. Project Switcher */}
                    {projects.length > 0 && onSelectProject && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-mono uppercase text-slate-400 font-bold px-1">
                          Active Job
                        </div>
                        <select
                          value={project?.id || ''}
                          onChange={(e) => {
                            onSelectProject(e.target.value);
                            setIsMobileHubMenuOpen(false);
                          }}
                          className="w-full min-h-10 bg-slate-900 border border-slate-800 rounded-xl px-2.5 text-xs font-bold text-slate-200 outline-none"
                          aria-label="Select Project"
                        >
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.projectNumber} · {p.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {lifecycleStage !== 'installing' && (
                      <div className="grid grid-cols-2 gap-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => {
                            setIsMobileHubMenuOpen(false);
                            handleGenerateLayoutClick();
                          }}
                          className="min-h-[36px] px-2 rounded-xl bg-slate-900 border border-slate-800 text-sky-300 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>Cuts &amp; Offcuts</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsMobileHubMenuOpen(false);
                            setActiveTab('flashing_workshop');
                          }}
                          className="min-h-[36px] px-2 rounded-xl bg-slate-900 border border-slate-800 text-sky-300 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Ruler className="w-3.5 h-3.5" />
                          <span>Flashings</span>
                        </button>
                      </div>
                    )}

                    {/* 3. Roof Templates & Import (when editable) */}
                    {!isReadOnlyGeometry && (
                      <div className="space-y-1 pt-1 border-t border-slate-800">
                        <div className="text-[10px] font-mono uppercase text-slate-400 font-bold px-1">
                          Shapes &amp; Import
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {[
                            { key: 'rectangle_14x10' as const, label: 'Hip & Ridge' },
                            { key: 'l_shape_standard' as const, label: 'L-Shape' },
                            { key: 'straight_gable' as const, label: 'Duo Gable' },
                            { key: 't_shape' as const, label: 'T-Shape' },
                            { key: 'two_storey_split' as const, label: '2-Storey Split' },
                            { key: 'cascading_terrace' as const, label: 'Terraced Z' }
                          ].map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => {
                                handleSelectPreset(item.key);
                                setIsMobileHubMenuOpen(false);
                              }}
                              className={`min-h-[36px] px-2 rounded-xl text-[11px] font-bold text-left truncate cursor-pointer border ${
                                selectedPreset === item.key
                                  ? 'bg-blue-600/25 border-blue-500/50 text-white'
                                  : 'bg-slate-900 border-slate-800 text-slate-300'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-1 pt-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setIsMobileHubMenuOpen(false);
                              setIsImportModalOpen(true);
                            }}
                            className="min-h-[38px] px-2 rounded-xl bg-slate-900 border border-slate-800 text-blue-300 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Import CAD</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleStartBlank();
                              setIsMobileHubMenuOpen(false);
                            }}
                            className="min-h-[38px] px-2 rounded-xl bg-slate-900 border border-slate-800 text-emerald-300 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Draw Blank</span>
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsMobileHubMenuOpen(false);
                            setActiveTab('canvas_plan');
                            setOpenPlanModalSignal((s) => s + 1);
                          }}
                          className="w-full min-h-[38px] px-2 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <FileImage className="w-3.5 h-3.5" />
                          <span>Load Plan (2-Pt Scale)</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Cluster: 1 Primary CTA Per Stage + Calm Utility */}
            <div className="flex items-center gap-1.5 shrink-0">
              {lifecycleStage === 'installing' ? (
                <>
                  <button
                    type="button"
                    onClick={handleAdvanceNextInstallPack}
                    className="h-9 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>
                      {nextIncompletePack ? `Next · ${nextIncompletePack.code}` : 'Order Pack'}
                    </span>
                  </button>
                  {isFullscreen && embedded ? (
                    <button
                      onClick={() => setIsFullscreen(false)}
                      className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 cursor-pointer"
                      aria-label="Exit Fullscreen"
                    >
                      <Minimize2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveToProject}
                      className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 cursor-pointer"
                      aria-label="Save Progress"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setIsAiDrawerOpen(true)}
                    className="h-9 w-9 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-sky-300 flex items-center justify-center cursor-pointer"
                    aria-label="Open Assistant"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>

                  {lifecycleStage === 'quoting' ? (
                    <button
                      onClick={() => {
                        setOrderModalTab('order_pack');
                        setIsOrderModalOpen(true);
                      }}
                      className="h-9 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      aria-label="Generate draft order"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Draft Order</span>
                    </button>
                  ) : !measureLocked ? (
                    <button
                      onClick={handleRequestLockMeasure}
                      className={`h-9 px-2.5 rounded-xl text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                        completenessReport.blockersCount > 0
                          ? 'bg-rose-700 hover:bg-rose-600'
                          : 'bg-emerald-600 hover:bg-emerald-500'
                      }`}
                      aria-label="Confirm and Lock Measure"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        {completenessReport.blockersCount > 0
                          ? `Fix (${completenessReport.blockersCount})`
                          : 'Confirm & Lock'}
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={handleUnlockMeasure}
                      className="h-9 px-2.5 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-300 text-[11px] font-extrabold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      aria-label="Unlock Measure"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Unlock</span>
                    </button>
                  )}

                  {isFullscreen && embedded ? (
                    <button
                      onClick={() => setIsFullscreen(false)}
                      className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-700 cursor-pointer"
                      aria-label="Exit Fullscreen"
                    >
                      <Minimize2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={handleSaveToProject}
                      className="h-9 w-9 flex items-center justify-center rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 cursor-pointer"
                      aria-label="Save Progress"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </header>

        {/* Full-Bleed Active Viewport */}
        <main className="flex-1 min-h-0 relative overflow-hidden p-1">
          {activeTab === 'canvas_plan' && (
            <ExactRoofingCanvas
              outline={outline}
              skeleton={skeleton}
              planes={planes}
              levels={levels}
              activeLevelId={activeLevelId}
              onSelectLevel={handleSelectLevel}
              onAddLevel={handleAddLevel}
              onUpdateEdgeEaveHeight={handleUpdateEdgeEaveHeight}
              onUpdateEdgeWall={handleUpdateEdgeWall}
              onSetEdgeMode={handleSetEdgeMode}
              selectedPlaneId={selectedPlaneId}
              layout={layoutResult || undefined}
              startPlaneId={startPlaneId || layoutResult?.startPlaneId || null}
              assets={assets}
              pitchBreaks={pitchBreaks}
              selectedAssetId={selectedAssetId}
              selectedPitchBreakId={selectedPitchBreakId}
              onSetStartPlane={handleSetStartPlane}
              onSelectPlane={handleSelectPlane}
              onUpdatePlaneOrderedSheetLength={handleUpdatePlaneOrderedSheetLength}
              onUpdateOutline={handleUpdateOutline}
              onUpdateSkeleton={handleUpdateSkeleton}
              onSelectEdgeToDefine={(edge) => setSelectedEdgeForPlane(edge)}
              onDeletePlane={(planeId) => {
                setPlanes((prev) => prev.filter((p) => p.id !== planeId));
                if (selectedPlaneId === planeId) setSelectedPlaneId(null);
                triggerNotice('Roof area removed');
              }}
              onRunSkeletonKey={handleRunAutoLines}
              onClearToBlank={handleStartBlank}
              onToggleJunctionGable={handleToggleJunctionGable}
              onToggleEdgeGable={handleToggleEdgeGable}
              onAddAsset={(asset) => {
                setAssets((prev) => [...prev, asset]);
                triggerNotice(`✓ Added ${asset.label || asset.type}`);
              }}
                onUpdateAsset={(asset) => {
                  if (isReadOnlyGeometry) return;
                  setAssets((prev) => prev.map((a) => (a.id === asset.id ? asset : a)));
                }}
                onDeleteAsset={(assetId) => {
                  if (isReadOnlyGeometry) return;
                  setAssets((prev) => prev.filter((a) => a.id !== assetId));
                  if (selectedAssetId === assetId) setSelectedAssetId(null);
                  triggerNotice('Feature removed');
                }}
                onSelectAsset={handleSelectAsset}
                onAddPitchBreak={(pb) => {
                  if (isReadOnlyGeometry) return;
                  setPitchBreaks((prev) => [...prev.filter((x) => x.planeId !== pb.planeId), pb]);
                  triggerNotice(`✓ Pitch break added (${pb.lowerPitchDeg}° apron)`);
                }}
                onDeletePitchBreak={(pbId) => {
                  if (isReadOnlyGeometry) return;
                  setPitchBreaks((prev) => prev.filter((p) => p.id !== pbId));
                  if (selectedPitchBreakId === pbId) setSelectedPitchBreakId(null);
                  triggerNotice('Pitch break removed');
                }}
                onSelectPitchBreak={handleSelectPitchBreak}
                flashingAssignments={flashingAssignments}
                assignableLines={assignableLines}
                onSelectLineForFlashing={
                  isReadOnlyGeometry ? undefined : (lineId) => setActiveFlashingLineId(lineId)
                }
                readOnlyGeometry={isReadOnlyGeometry}
                customSequenceMap={customSequenceMap}
                completedPlaneIds={installProgress.completedPlaneIds}
                onInstallSelectPlane={handleInstallSelectPlaneTap}
                onOpenAiAssistant={() => setIsAiDrawerOpen(true)}
                onOpenInspector={() => setIsInspectorOpen(true)}
                planUnderlay={planUnderlay}
                projectPlans={projectPlans}
                onUpdatePlanUnderlay={setPlanUnderlay}
                openPlanModalSignal={openPlanModalSignal}
                selectedPlaneIds={selectedPlaneIds}
                onChangeSelectedPlaneIds={setSelectedPlaneIds}
                selectedEdgeIds={selectedEdgeIds}
                onChangeSelectedEdgeIds={setSelectedEdgeIds}
                selectedSkeletonLineIds={selectedSkeletonLineIds}
                onChangeSelectedSkeletonLineIds={setSelectedSkeletonLineIds}
                onBatchUpdatePlanePitch={handleBatchPlanePitch}
                onBatchClassifyEdges={handleBatchEdgeType}
                onBatchUpdateSkeletonType={handleBatchSkeletonLineType}
                onUndo={handleUndo}
                canUndo={canUndo}
              />
          )}

          {activeTab === 'wall_plan' && (
            <div className="h-full overflow-y-auto px-1.5 pt-1.5">
              <WallPlanWorkspace
                key={wallViewKey}
                wallPlan={wallPlan}
                levels={levels}
                roofPlanes={planes}
                projectPlans={projectPlans}
                planUnderlay={planUnderlay}
                selectedWallFacetId={selectedWallFacetId}
                onSelectWallFacet={handleSelectWallFacet}
                onUpdateWallPlan={handleUpdateWallPlan}
                onUpdateWallFacet={handleUpdateWallFacet}
                onBatchUpdateFacets={handleBatchWallUpdate}
                wallFilterMode={wallFilterMode}
                onChangeWallFilterMode={setWallFilterMode}
                multiSelectedFacetIds={selectedWallFacetIds}
                onChangeMultiSelectedFacetIds={setSelectedWallFacetIds}
                onBuildRoofFromWalls={handleBuildRoofFromWallPlan}
                initialSubView={wallSubView}
                readOnly={isReadOnlyGeometry}
              />
            </div>
          )}

          {activeTab === 'view_3d' && (
            <ExactRoofing3DViewer
              outline={outline}
              skeleton={skeleton}
              planes={planes}
              levels={levels}
              assets={assets}
              pitchBreaks={pitchBreaks}
              wallPlan={wallPlan}
              selectedPlaneId={selectedPlaneId}
              onSelectPlane={handleSelectPlane}
              selectedWallFacetId={selectedWallFacetId}
              onSelectWallFacet={handleSelectWallFacet}
              wallFilterMode={wallFilterMode}
              onChangeWallFilterMode={setWallFilterMode}
              roofProfileName={project?.profile}
              coilColorName={project?.colorName}
            />
          )}

          {activeTab === 'layout_results' && (
            layoutResult ? (
              <div className="h-full overflow-hidden">
                <OffcutLayoutVisualizer
                  layout={layoutResult}
                  planes={planes}
                  selectedPlaneId={selectedPlaneId}
                  startPlaneId={startPlaneId || layoutResult?.startPlaneId || null}
                  onSetStartPlane={handleSetStartPlane}
                  onSelectPlane={handleSelectPlane}
                  projectName={project?.title || 'Exact Roof Plan'}
                  siteAddress={project?.siteAddress}
                  roofProfileLabel={project?.profile}
                  coilColorLabel={project?.colorName}
                  windZoneLabel={project?.windZone}
                  onRegenerateLayout={handleGenerateLayoutClick}
                  onOpenPlaneEditor={(plane) => {
                    if (isReadOnlyGeometry) return;
                    const edge = levels
                      .flatMap((l) => l.outline.edges)
                      .find((e) => e.id === plane.eaveEdgeId);
                    if (edge) setSelectedEdgeForPlane(edge);
                  }}
                  lifecycleStage={lifecycleStage}
                  measureLocked={measureLocked}
                  roofingPacks={roofingPacks}
                  installProgress={installProgress}
                  onUpdateInstallProgress={handleUpdateInstallProgress}
                  sheetOrderMode={sheetOrderMode}
                  onChangeSheetOrderMode={handleChangeSheetOrderMode}
                  sheetOrderComparison={sheetOrderComparison}
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center p-4">
                <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-5 max-w-sm text-center space-y-2.5">
                  <Package className="w-7 h-7 text-slate-500 mx-auto" />
                  <div className="text-sm font-black text-white">No sheet packs computed yet</div>
                  <p className="text-xs text-slate-400">Define at least one roof face in Plan or Measure before opening install packs.</p>
                </div>
              </div>
            )
          )}

          {activeTab === 'measure_check' && (
            <div className="h-full overflow-y-auto px-1.5 pt-1.5">
              <SiteMeasureCheckView
                project={project}
                planes={planes}
                layout={layoutResult}
                bom={roofBom}
                assignableLines={assignableLines}
                flashingAssignments={flashingAssignments}
                assets={assets}
                wallPlan={wallPlan}
                completenessReport={completenessReport}
                auditReport={deterministicAuditReport}
                measureLocked={measureLocked}
                sheetOrderMode={sheetOrderMode}
                onChangeSheetOrderMode={handleChangeSheetOrderMode}
                sheetOrderComparison={sheetOrderComparison}
                onSelectPlane={(planeId) => {
                  handleSelectPlane(planeId);
                  setIsInspectorOpen(true);
                }}
                onUpdatePlaneOrderedSheetLength={handleUpdatePlaneOrderedSheetLength}
                onOpenPlanTab={() => setActiveTab('canvas_plan')}
                onOpenPlaneEditor={(plane) => {
                  const edge = levels
                    .flatMap((l) => l.outline.edges)
                    .find((e) => e.id === plane.eaveEdgeId);
                  if (edge) setSelectedEdgeForPlane(edge);
                }}
                onSelectLineForFlashing={(lineId) => setActiveFlashingLineId(lineId)}
                onJumpToCompletenessIssue={handleJumpToCompletenessIssue}
                onApplyDeterministicPatches={handleApplyDeterministicPatches}
                onOpenOrderModal={() => {
                  setOrderModalTab('orders');
                  setIsOrderModalOpen(true);
                }}
                onRecalculateLayout={handleGenerateLayoutClick}
                onConfirmLockMeasure={handleRequestLockMeasure}
              />
            </div>
          )}

          {activeTab === 'flashing_workshop' && (
            <div className="h-full overflow-y-auto px-1.5 pt-1.5">
              {lifecycleStage === 'installing' ? (
                <ContractorFlashingGuide
                  project={project}
                  assignableLines={assignableLines}
                  assignments={flashingAssignments}
                  libraryProfiles={libraryProfiles}
                  bom={roofBom}
                />
              ) : (
                <FlashingWorkshop
                  view={flashingWorkshopView}
                  onChangeView={setFlashingWorkshopView}
                  projects={projects.length > 0 ? projects : project ? [project] : []}
                  project={project}
                  activeMemberName={activeMemberName || 'Archtech team'}
                  theme="dark"
                  roofAssignments={flashingAssignments}
                  onUpdateProject={onUpdateProject}
                />
              )}
            </div>
          )}
        </main>

        {/* Contextual Mobile Tools Drawer (Quote & Measure — Demoted Walls, 3D, Cuts, Flashings, Undo, Presets) */}
        {isMobileToolsOpen && lifecycleStage !== 'installing' && (
          <div
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px] flex flex-col justify-end"
            onClick={() => setIsMobileToolsOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0c121e] border-t border-slate-700/80 rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3 max-h-[78dvh] overflow-y-auto animate-in slide-in-from-bottom-3"
            >
              <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                  Contextual Tools &amp; Views
                </span>
                <button
                  type="button"
                  onClick={() => setIsMobileToolsOpen(false)}
                  className="text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                >
                  Done
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileToolsOpen(false);
                    setWallSubView('plan');
                    setActiveTab('wall_plan');
                  }}
                  className={`min-h-[44px] px-3 rounded-2xl border text-left flex items-center justify-between text-xs font-bold cursor-pointer ${
                    activeTab === 'wall_plan'
                      ? 'bg-amber-600/25 border-amber-500/50 text-amber-200'
                      : 'bg-slate-900 border-slate-800 text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Walls</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileToolsOpen(false);
                    setActiveTab('view_3d');
                  }}
                  className={`min-h-[44px] px-3 rounded-2xl border text-left flex items-center justify-between text-xs font-bold cursor-pointer ${
                    activeTab === 'view_3d'
                      ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
                      : 'bg-slate-900 border-slate-800 text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Box className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>3D Model</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileToolsOpen(false);
                    handleGenerateLayoutClick();
                  }}
                  className={`min-h-[44px] px-3 rounded-2xl border text-left flex items-center justify-between text-xs font-bold cursor-pointer ${
                    activeTab === 'layout_results'
                      ? 'bg-sky-600/25 border-sky-500/50 text-sky-200'
                      : 'bg-slate-900 border-slate-800 text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Scissors className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Sheet Cuts</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsMobileToolsOpen(false);
                    setActiveTab('flashing_workshop');
                  }}
                  className={`min-h-[44px] px-3 rounded-2xl border text-left flex items-center justify-between text-xs font-bold cursor-pointer ${
                    activeTab === 'flashing_workshop'
                      ? 'bg-sky-600/25 border-sky-500/50 text-sky-200'
                      : 'bg-slate-900 border-slate-800 text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Ruler className="w-4 h-4 text-sky-400 shrink-0" />
                    <span>Flashings</span>
                  </span>
                </button>
              </div>

              {!isReadOnlyGeometry && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileToolsOpen(false);
                        setActiveTab('canvas_plan');
                        setOpenPlanModalSignal((s) => s + 1);
                      }}
                      className="min-h-[42px] px-2 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <FileImage className="w-3.5 h-3.5 shrink-0" />
                      <span>2-Pt Plan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileToolsOpen(false);
                        setIsImportModalOpen(true);
                      }}
                      className="min-h-[42px] px-2 rounded-xl bg-slate-900 border border-slate-800 text-blue-300 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      <span>Import</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleStartBlank();
                        setIsMobileToolsOpen(false);
                      }}
                      className="min-h-[42px] px-2 rounded-xl bg-slate-900 border border-slate-800 text-emerald-300 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 shrink-0" />
                      <span>Blank</span>
                    </button>
                  </div>

                  {canUndo && (
                    <button
                      type="button"
                      onClick={() => {
                        handleUndo();
                        setIsMobileToolsOpen(false);
                      }}
                      className="w-full min-h-[42px] px-3.5 rounded-2xl bg-slate-900 border border-amber-500/35 text-left flex items-center justify-between text-xs font-bold text-amber-300 cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Undo2 className="w-4 h-4" />
                        <span>Undo Last Edit</span>
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Read-Only Field Views Sheet (Install Mode Only — Zero Modeller Tools) */}
        {isInstallViewsOpen && lifecycleStage === 'installing' && (
          <div
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px] flex flex-col justify-end"
            onClick={() => setIsInstallViewsOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0c121e] border-t border-slate-700/80 rounded-t-3xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-2.5 animate-in slide-in-from-bottom-3"
            >
              <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto" />
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                  Read-Only Field References
                </span>
                <button
                  type="button"
                  onClick={() => setIsInstallViewsOpen(false)}
                  className="text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
                >
                  Done
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsInstallViewsOpen(false);
                    setActiveTab('canvas_plan');
                  }}
                  className={`w-full min-h-[44px] px-3.5 rounded-2xl border text-left flex items-center justify-between text-xs font-bold cursor-pointer ${
                    activeTab === 'canvas_plan'
                      ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
                      : 'bg-slate-900 border-slate-800 text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Compass className="w-4 h-4 text-blue-400" />
                    <span>Roof Plan (Read-Only)</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsInstallViewsOpen(false);
                    setActiveTab('view_3d');
                  }}
                  className={`w-full min-h-[44px] px-3.5 rounded-2xl border text-left flex items-center justify-between text-xs font-bold cursor-pointer ${
                    activeTab === 'view_3d'
                      ? 'bg-blue-600/25 border-blue-500/50 text-blue-200'
                      : 'bg-slate-900 border-slate-800 text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Box className="w-4 h-4 text-blue-400" />
                    <span>3D View (Read-Only)</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsInstallViewsOpen(false);
                    setIsInspectorOpen((v) => !v);
                  }}
                  className={`w-full min-h-[44px] px-3.5 rounded-2xl border text-left flex items-center justify-between text-xs font-bold cursor-pointer ${
                    isInspectorOpen
                      ? 'bg-sky-600/25 border-sky-500/50 text-sky-200'
                      : 'bg-slate-900 border-slate-800 text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-sky-400" />
                    <span>{selectedPlane ? `Face ${selectedPlane.code} Spec` : 'Job Spec & Sheet Schedule'}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Calm Stage-Pure Bottom Thumb Bar (<= 4 Items, Never a 5-Tab Studio Bar) */}
        <nav
          aria-label="ApexMap Stage Navigation"
          className={`shrink-0 bg-[#0b101d]/95 backdrop-blur-md border-t border-slate-800 px-2 pt-1.5 pb-[calc(0.4rem+env(safe-area-inset-bottom))] grid gap-1.5 z-30 ${
            lifecycleStage === 'measuring' ? 'grid-cols-4' : 'grid-cols-3'
          }`}
        >
          {lifecycleStage === 'installing' ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsInstallViewsOpen(false);
                  setActiveTab('layout_results');
                }}
                className={`min-h-11 flex items-center justify-center gap-1.5 py-1 px-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'layout_results'
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Package className="w-4 h-4 shrink-0" />
                <span>Packs</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsInstallViewsOpen(false);
                  setActiveTab('flashing_workshop');
                }}
                className={`min-h-11 flex items-center justify-center gap-1.5 py-1 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'flashing_workshop'
                    ? 'bg-sky-600/25 text-sky-300 border border-sky-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Ruler className="w-4 h-4 shrink-0" />
                <span>Flashings</span>
              </button>

              <button
                type="button"
                onClick={() => setIsInstallViewsOpen((v) => !v)}
                className={`min-h-11 flex items-center justify-center gap-1.5 py-1 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isInstallViewsOpen ||
                  activeTab === 'canvas_plan' ||
                  activeTab === 'view_3d' ||
                  isInspectorOpen
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/35'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Compass className="w-4 h-4 shrink-0" />
                <span>Views · Spec</span>
              </button>
            </>
          ) : lifecycleStage === 'measuring' ? (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('measure_check')}
                className={`min-h-11 flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer relative ${
                  activeTab === 'measure_check'
                    ? 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <ClipboardCheck className="w-4 h-4 mb-0.5" />
                <span>
                  Checklist{completenessReport.blockersCount > 0 ? ` (${completenessReport.blockersCount})` : ''}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('canvas_plan')}
                className={`min-h-11 flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                  activeTab === 'canvas_plan'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Compass className="w-4 h-4 mb-0.5" />
                <span>Plan</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMobileToolsOpen((v) => !v)}
                className={`min-h-11 flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                  isMobileToolsOpen ||
                  activeTab === 'wall_plan' ||
                  activeTab === 'view_3d' ||
                  activeTab === 'layout_results' ||
                  activeTab === 'flashing_workshop'
                    ? 'bg-sky-600/20 text-sky-300 border border-sky-500/35'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutTemplate className="w-4 h-4 mb-0.5" />
                <span>Tools</span>
              </button>

              <button
                type="button"
                onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                className={`min-h-11 flex flex-col items-center justify-center py-1 rounded-xl text-[10px] font-bold transition-all cursor-pointer ${
                  isInspectorOpen
                    ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-4 h-4 mb-0.5" />
                <span className="truncate max-w-[60px]">
                  {selectedPlane ? `Face ${selectedPlane.code}` : 'Inspect'}
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('canvas_plan')}
                className={`min-h-11 flex items-center justify-center gap-1.5 py-1 px-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'canvas_plan'
                    ? 'bg-blue-600/20 text-blue-300 border border-blue-500/35'
                    : 'text-slate-300 hover:text-white bg-slate-900/70 border border-slate-800'
                }`}
              >
                <Compass className="w-4 h-4 shrink-0" />
                <span>{activeTab === 'canvas_plan' ? 'Plan' : '← Plan'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsMobileToolsOpen((v) => !v)}
                className={`min-h-11 flex items-center justify-center gap-1.5 py-1 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isMobileToolsOpen ||
                  activeTab === 'wall_plan' ||
                  activeTab === 'view_3d' ||
                  activeTab === 'layout_results' ||
                  activeTab === 'flashing_workshop'
                    ? 'bg-sky-600/20 text-sky-300 border border-sky-500/35'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <LayoutTemplate className="w-4 h-4 shrink-0" />
                <span>Tools</span>
              </button>

              <button
                type="button"
                onClick={() => setIsInspectorOpen(!isInspectorOpen)}
                className={`min-h-11 flex items-center justify-center gap-1.5 py-1 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isInspectorOpen
                    ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-4 h-4 shrink-0" />
                <span className="truncate max-w-[70px]">
                  {selectedPlane ? `Face ${selectedPlane.code}` : 'Inspect'}
                </span>
              </button>
            </>
          )}
        </nav>

        {/* Slide-Up Mobile Inspector Bottom Sheet */}
        <ExactRoofingInspectorDrawer
          isOpen={isInspectorOpen}
          onClose={() => setIsInspectorOpen(false)}
          lifecycleStage={lifecycleStage}
          readOnlyGeometry={isReadOnlyGeometry}
          selectedPlane={selectedPlane}
          selectedAsset={selectedAsset}
          selectedPitchBreak={selectedPitchBreak}
          outline={outline}
          levels={levels}
          activeLevelId={activeLevelId}
          onSelectLevel={handleSelectLevel}
          onAddLevel={handleAddLevel}
          onUpdateLevelHeight={handleUpdateLevelHeight}
          onDeleteLevel={handleDeleteLevel}
          planes={planes}
          assets={assets}
          pitchBreaks={pitchBreaks}
          layout={layoutResult}
          startPlaneId={startPlaneId || layoutResult?.startPlaneId || null}
          onToggleEdgeGable={handleToggleEdgeGable}
          onSetEdgeMode={handleSetEdgeMode}
          onUpdatePlaneEaveHeight={handleUpdatePlaneEaveHeight}
          onUpdateEdgeLength={handleUpdateEdgeLength}
          onUpdateEdgeWall={handleUpdateEdgeWall}
          onApplyRoofStylePreset={handleApplyRoofStylePreset}
          onSetStartPlane={handleSetStartPlane}
          onUpdatePlanePitch={handleUpdatePlanePitch}
          onUpdatePlaneDirection={handleUpdatePlaneDirection}
          onUpdatePlaneOrderedSheetLength={handleUpdatePlaneOrderedSheetLength}
          onSelectPlane={handleSelectPlane}
          onSelectAsset={handleSelectAsset}
          onUpdateAsset={(asset) => {
            if (isReadOnlyGeometry) return;
            setAssets((prev) => prev.map((a) => (a.id === asset.id ? asset : a)));
          }}
          onDeleteAsset={(assetId) => {
            if (isReadOnlyGeometry) return;
            setAssets((prev) => prev.filter((a) => a.id !== assetId));
            if (selectedAssetId === assetId) setSelectedAssetId(null);
            triggerNotice('Feature removed');
          }}
          onSelectPitchBreak={handleSelectPitchBreak}
          onUpdatePitchBreak={(pb) => {
            if (isReadOnlyGeometry) return;
            setPitchBreaks((prev) => prev.map((x) => (x.id === pb.id ? pb : x)));
          }}
          onDeletePitchBreak={(pbId) => {
            if (isReadOnlyGeometry) return;
            setPitchBreaks((prev) => prev.filter((x) => x.id !== pbId));
            if (selectedPitchBreakId === pbId) setSelectedPitchBreakId(null);
            triggerNotice('Pitch break removed');
          }}
          onOpenCutList={() => setActiveTab('layout_results')}
          onOpenAiCopilot={() => setIsAiCopilotOpen(true)}
          assignableLines={assignableLines}
          flashingAssignments={flashingAssignments}
          onSelectLineForFlashing={(lineId) => setActiveFlashingLineId(lineId)}
          onOpenOrderModal={() => setIsOrderModalOpen(true)}
          wallPlan={wallPlan}
          selectedWallFacetId={selectedWallFacetId}
          onSelectWallFacet={handleSelectWallFacet}
          onOpenWallElevation={handleOpenWallElevation}
          onUpdateWallFacet={handleUpdateWallFacet}
          onBuildWallFaces={handleBuildWallFaces}
          wallFilterMode={wallFilterMode}
          onChangeWallFilterMode={setWallFilterMode}
          completenessReport={completenessReport}
          onJumpToCompletenessIssue={handleJumpToCompletenessIssue}
          selectedPlaneIds={selectedPlaneIds}
          onChangeSelectedPlaneIds={setSelectedPlaneIds}
          selectedEdgeIds={selectedEdgeIds}
          onChangeSelectedEdgeIds={setSelectedEdgeIds}
          selectedSkeletonLineIds={selectedSkeletonLineIds}
          onChangeSelectedSkeletonLineIds={setSelectedSkeletonLineIds}
          selectedWallFacetIds={selectedWallFacetIds}
          onChangeSelectedWallFacetIds={setSelectedWallFacetIds}
          onBatchPlanePitch={handleBatchPlanePitch}
          onBatchPlaneDirection={handleBatchPlaneDirection}
          onBatchPlaneOrderedSheetLength={handleBatchPlaneOrderedSheetLength}
          onBatchPlaneEaveHeight={handleBatchPlaneEaveHeight}
          onBatchEdgeType={handleBatchEdgeType}
          onBatchEdgeWall={handleBatchEdgeWall}
          onBatchEdgeHeight={handleBatchEdgeHeight}
          onBatchSkeletonLineType={handleBatchSkeletonLineType}
          onBatchWallUpdate={handleBatchWallUpdate}
          onUndo={handleUndo}
          canUndo={canUndo}
        />

        {/* Modals */}
        <DefinePlaneModal
          edge={selectedEdgeForPlane}
          outlineEdges={
            selectedEdgeForPlane ? findLevelForEdge(selectedEdgeForPlane.id).outline.edges : undefined
          }
          existingPlane={
            selectedEdgeForPlane
              ? planes.find((p) => p.eaveEdgeId === selectedEdgeForPlane.id) || null
              : null
          }
          existingPlanes={planes}
          selectedEdgeIds={selectedEdgeIds}
          isOpen={!!selectedEdgeForPlane}
          onClose={() => setSelectedEdgeForPlane(null)}
          onClassifyEdge={handleClassifyEdge}
          onBatchClassifyEdges={handleBatchEdgeType}
          onBatchUpdateEdges={handleBatchDefineEdges}
          onSavePlane={handleSavePlane}
          onAssignFlashing={(edge) => setActiveFlashingLineId(edge.id)}
        />

        <ImportOutlineModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImportOutline={handleImportOutline}
        />

        <RoofingAiCopilotModal
          isOpen={isAiCopilotOpen}
          onClose={() => setIsAiCopilotOpen(false)}
          outline={outline}
          skeleton={skeleton}
          planes={planes}
          layout={layoutResult}
          onApplyGeneratedRoof={handleApplyAiRoof}
          projectTitle={project?.title || 'Profiled Metal Roof'}
        />

        <ExactRoofingAiDrawer
          isOpen={isAiDrawerOpen}
          onClose={() => setIsAiDrawerOpen(false)}
          lifecycleStage={lifecycleStage}
          measureLocked={measureLocked}
          projectTitle={project?.title || 'Profiled Metal Roof'}
          profileName={project?.profile}
          windZone={project?.windZone}
          planes={planes}
          levels={levels}
          selectedPlane={selectedPlane}
          assets={assets}
          pitchBreaks={pitchBreaks}
          sheetSpec={sheetSpec}
          assignableLines={assignableLines}
          flashingAssignments={flashingAssignments}
          flashingCount={flashingAssignments.length}
          unassignedLineCount={unassignedLineCount}
          layout={layoutResult}
          roofingPacks={roofingPacks}
          completedPlaneIds={installProgress.completedPlaneIds}
          wallPlan={wallPlan}
          completenessReport={completenessReport}
          orderPack={liveOrderPack}
          onApplyScannedRoof={handleApplyAiRoof}
          onApplyDeterministicPatches={handleApplyDeterministicPatches}
          onJumpToCompletenessIssue={handleJumpToCompletenessIssue}
          onOpenWallPlan={() => {
            setWallSubView('plan');
            setActiveTab('wall_plan');
          }}
          onExecuteAction={handleExecuteAiAction}
          onOpenFullCopilot={() => setIsAiCopilotOpen(true)}
        />

        <FlashingAssignmentModal
          isOpen={!!activeFlashingLine}
          line={activeFlashingLine}
          existingAssignment={flashingAssignments.find(
            (a) => a.lineId === activeFlashingLine?.lineId
          )}
          libraryProfiles={libraryProfiles}
          project={project}
          onClose={() => setActiveFlashingLineId(null)}
          onOpenDrawingSuite={(line, seedProfileId = null) => {
            setActiveFlashingLineId(null);
            setDrawingSuiteSession({
              line,
              seedProfileId,
              key: Date.now()
            });
          }}
          onSaveAssignment={handleSaveFlashingAssignment}
          onRemoveAssignment={handleRemoveFlashingAssignment}
        />

        <ExactRoofingOrderModal
          isOpen={isOrderModalOpen}
          onClose={() => {
            setIsOrderModalOpen(false);
            setOrderModalTab(undefined);
          }}
          project={project}
          quotes={quotes}
          activeQuote={activeQuote}
          lifecycleStage={lifecycleStage}
          measureLocked={measureLocked}
          activeMemberName={activeMemberName}
          assignableLines={assignableLines}
          assignments={flashingAssignments}
          libraryProfiles={libraryProfiles}
          layout={layoutResult}
          bom={roofBom}
          packs={roofingPacks}
          planes={planes}
          levels={levels}
          assets={assets}
          wallPlan={wallPlan}
          completenessReport={completenessReport}
          orderPack={liveOrderPack}
          sheetOrderMode={sheetOrderMode}
          onChangeSheetOrderMode={handleChangeSheetOrderMode}
          sheetOrderComparison={sheetOrderComparison}
          initialModalTab={orderModalTab}
          onSelectLineToAssign={(line) => setActiveFlashingLineId(line.lineId)}
          onRemoveAssignment={handleRemoveFlashingAssignment}
          onMarkOrdered={({ workshop, crm }) => {
            setFlashingAssignments((prev) =>
              prev.map((a) => ({
                ...a,
                orderedToWorkshop: workshop ? true : a.orderedToWorkshop,
                orderedToCrm: crm ? true : a.orderedToCrm
              }))
            );
          }}
          onUpdateProject={onUpdateProject}
          onPushBomToQuote={
            onPushBomToQuote
              ? (opts) => {
                  const snap = buildCurrentSnapshot();
                  onPushBomToQuote({
                    ...opts,
                    bom: roofBom,
                    snapshot: snap,
                    project
                  });
                }
              : undefined
          }
          onOpenFlashingOrders={() => {
            setIsOrderModalOpen(false);
            setFlashingWorkshopView('orders');
            setActiveTab('flashing_workshop');
            onOpenFlashingOrders?.();
          }}
        />

        {drawingSuiteSession && (
          <FlashingDesigner
            key={drawingSuiteSession.key}
            project={designerProject}
            activeMemberName={activeMemberName}
            initialProfileId={drawingSuiteSession.seedProfileId}
            onUpdateProject={(updated) => {
              if (project && onUpdateProject) {
                onUpdateProject(updated);
              }
            }}
            onSaveToLibrary={(prof) => {
              const res = saveProfileToSharedFlashingLibrary(prof);
              setLibraryVersion((v) => v + 1);
              return res === 'storage-error' ? 'storage-error' : 'saved';
            }}
            assignmentContext={{
              lineLabel: drawingSuiteSession.line.label,
              flashingKindLabel: getFlashingKindDisplayLabel(
                drawingSuiteSession.line.flashingKind
              ),
              trueSlopeLengthM: drawingSuiteSession.line.trueSlopeLengthM,
              defaultCategory: drawingSuiteSession.line.suggestedCategory,
              defaultName: `${drawingSuiteSession.line.label} Flashing`
            }}
            onAssignProfile={handleAssignFromDrawingSuite}
            onClose={() => setDrawingSuiteSession(null)}
          />
        )}
      </div>
    );
  }

  // ============================================================================
  // DESKTOP / LARGE TABLET CAD WORKSPACE
  // ============================================================================
  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[75] bg-[#070b14] p-3 flex flex-col space-y-3 font-sans select-none overflow-hidden'
          : 'w-full max-w-7xl mx-auto space-y-3 font-sans select-none pb-8'
      }
    >
      {/* Toast Notice */}
      {notice && (
        <div className="bg-emerald-950/90 text-emerald-200 border border-emerald-600/80 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center justify-between shadow-2xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{notice}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-emerald-400 hover:text-white font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. CALM 3-ZONE SYSTEMS WORKSPACE BAR */}
      <div className="bg-[#0b101d] border border-slate-800 rounded-2xl px-3.5 py-2.5 text-white shadow-xl shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Zone 1: Active Job & 3 Primary Modes (Quote | Measure | Install) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center p-0.5 bg-[#070b14] rounded-xl border border-slate-800">
              {(['quoting', 'measuring', 'installing'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleSelectStage(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    lifecycleStage === st
                      ? st === 'quoting'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : st === 'measuring'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'measuring' && measureLocked && <Lock className="w-3 h-3" />}
                  <span>
                    {st === 'quoting'
                      ? 'Quote'
                      : st === 'measuring'
                      ? 'Measure'
                      : 'Install'}
                  </span>
                </button>
              ))}
            </div>

            {projects.length > 0 && onSelectProject && (
              <select
                value={project?.id || ''}
                onChange={(e) => onSelectProject(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-200 max-w-[190px] truncate outline-none cursor-pointer"
                aria-label="Active Project"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.projectNumber} · {p.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Zone 2: Stage-Owned Main Workspace Switch + Contextual Tools */}
          <div className="flex items-center gap-1.5">
            {lifecycleStage === 'installing' ? (
              <>
                <div className="flex items-center p-0.5 bg-[#070b14] rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveTab('layout_results')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      activeTab === 'layout_results'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>Packs</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('flashing_workshop')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      activeTab === 'flashing_workshop'
                        ? 'bg-sky-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Ruler className="w-3.5 h-3.5" />
                    <span>Flashing Guide</span>
                  </button>
                </div>

                <div className="relative" ref={installViewsRef}>
                  <button
                    type="button"
                    onClick={() => setIsInstallViewsOpen((v) => !v)}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      activeTab === 'canvas_plan' || activeTab === 'view_3d'
                        ? 'bg-blue-600/20 border-blue-500/40 text-blue-200'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5 text-blue-400" />
                    <span>
                      {activeTab === 'canvas_plan'
                        ? 'Plan (Read-Only)'
                        : activeTab === 'view_3d'
                        ? '3D (Read-Only)'
                        : 'Field Views'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                        isInstallViewsOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isInstallViewsOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-52 bg-[#0e1526] border border-slate-750 rounded-2xl p-1.5 shadow-2xl z-50 space-y-0.5 animate-in fade-in slide-in-from-top-1">
                      <div className="px-2 py-1 text-[10px] font-mono uppercase text-slate-400 font-bold">
                        Read-Only Site Views
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsInstallViewsOpen(false);
                          setActiveTab('canvas_plan');
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer ${
                          activeTab === 'canvas_plan'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <Compass className="w-3.5 h-3.5 text-blue-400" />
                        <span>Roof Plan (Read-Only)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsInstallViewsOpen(false);
                          setActiveTab('view_3d');
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer ${
                          activeTab === 'view_3d'
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <Box className="w-3.5 h-3.5 text-blue-400" />
                        <span>3D Model (Read-Only)</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : lifecycleStage === 'measuring' ? (
              <>
                <div className="flex items-center p-0.5 bg-[#070b14] rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setActiveTab('measure_check')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      activeTab === 'measure_check'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    <span>Checklist</span>
                    {completenessReport.blockersCount > 0 && (
                      <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-rose-600 text-white tabular-nums">
                        {completenessReport.blockersCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('canvas_plan')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                      activeTab === 'canvas_plan'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Plan</span>
                  </button>
                </div>

                <div className="relative" ref={templateDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      activeTab === 'wall_plan' ||
                      activeTab === 'view_3d' ||
                      activeTab === 'layout_results' ||
                      activeTab === 'flashing_workshop'
                        ? 'bg-sky-600/20 border-sky-500/40 text-sky-200'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
                    }`}
                  >
                    <LayoutTemplate className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {activeTab === 'wall_plan'
                        ? 'Tools · Walls'
                        : activeTab === 'view_3d'
                        ? 'Tools · 3D'
                        : activeTab === 'layout_results'
                        ? 'Tools · Cuts'
                        : activeTab === 'flashing_workshop'
                        ? 'Tools · Flashings'
                        : 'Tools'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                        isTemplateDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {templateDropdownMenu}
                </div>
              </>
            ) : (
              <>
                {activeTab !== 'canvas_plan' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('canvas_plan')}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Compass className="w-3.5 h-3.5 text-blue-400" />
                    <span>← Back to Plan</span>
                  </button>
                )}

                <div className="relative" ref={templateDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      activeTab !== 'canvas_plan'
                        ? 'bg-sky-600/20 border-sky-500/40 text-sky-200'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-800'
                    }`}
                  >
                    <LayoutTemplate className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {activeTab === 'wall_plan'
                        ? 'Tools · Walls'
                        : activeTab === 'view_3d'
                        ? 'Tools · 3D'
                        : activeTab === 'layout_results'
                        ? 'Tools · Sheet Cuts'
                        : activeTab === 'flashing_workshop'
                        ? 'Tools · Flashings'
                        : 'Tools'}
                    </span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                        isTemplateDropdownOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {templateDropdownMenu}
                </div>
              </>
            )}
          </div>

          {/* Zone 3: 1 Clear Primary CTA Per Mode + Quiet Utilities */}
          <div className="flex items-center gap-1.5">
            {lifecycleStage === 'quoting' && (
              <button
                onClick={() => {
                  setOrderModalTab('order_pack');
                  setIsOrderModalOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Generate draft order</span>
              </button>
            )}

            {lifecycleStage === 'measuring' && (
              <>
                <button
                  onClick={() => {
                    setOrderModalTab('order_pack');
                    setIsOrderModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 font-bold text-xs transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-sky-400" />
                  <span>Order Pack</span>
                </button>

                {!measureLocked ? (
                  <button
                    onClick={handleRequestLockMeasure}
                    className={`px-3.5 py-1.5 rounded-xl text-white font-extrabold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      completenessReport.blockersCount > 0
                        ? 'bg-rose-700 hover:bg-rose-600'
                        : 'bg-emerald-600 hover:bg-emerald-500'
                    }`}
                    title="Confirm & lock site measure to emit Order Pack"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      {completenessReport.blockersCount > 0
                        ? `Confirm & lock (${completenessReport.blockersCount} blocker${completenessReport.blockersCount === 1 ? '' : 's'})`
                        : 'Confirm & lock'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleUnlockMeasure}
                    className="px-3 py-1.5 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 border border-amber-500/40 text-amber-300 text-xs font-extrabold cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock measure</span>
                  </button>
                )}
              </>
            )}

            {lifecycleStage === 'installing' && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAdvanceNextInstallPack}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer flex items-center gap-1.5 shadow-md whitespace-nowrap shrink-0"
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>
                    {nextIncompletePack
                      ? activeTab === 'layout_results'
                        ? `Complete Face ${nextIncompletePack.code}`
                        : `Next pack · Face ${nextIncompletePack.code}`
                      : `All ${roofingPacks.length} packs done`}
                  </span>
                </button>
                {measureLocked && (
                  <button
                    type="button"
                    onClick={handleUnlockMeasure}
                    className="px-2 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-amber-300 text-[11px] font-bold cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
                    title="Unlock for variation"
                  >
                    <Unlock className="w-3 h-3" />
                    <span>Unlock (Variation)</span>
                  </button>
                )}
              </div>
            )}

            {lifecycleStage !== 'installing' && (
              <button
                onClick={() => setIsAiDrawerOpen(true)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-300 border border-slate-800 font-bold text-xs transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap shrink-0"
                title="Stage Assistant"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Assistant</span>
              </button>
            )}

            <button
              onClick={() => setIsInspectorOpen(!isInspectorOpen)}
              className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 shrink-0 ${
                isInspectorOpen
                  ? 'bg-slate-800 text-sky-400 border-sky-500/50'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title={lifecycleStage === 'installing' ? 'Toggle Job Spec Panel' : 'Toggle Inspector Drawer'}
            >
              <Sliders className="w-4 h-4" />
            </button>

            {embedded && (
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-sky-400 border border-slate-800 text-xs font-bold transition-all cursor-pointer shrink-0"
                title={isFullscreen ? 'Exit Fullscreen Studio' : 'Expand Fullscreen Studio'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}

            <button
              onClick={handleSaveToProject}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 text-xs font-bold transition-all cursor-pointer shrink-0"
              title="Save Roof Model & Stage"
            >
              <Save className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. MAIN CAD WORKSPACE CONTAINER */}
      <div
        className={`flex flex-row w-full relative overflow-hidden rounded-3xl border border-slate-800 bg-[#070b14] shadow-2xl ${
          isFullscreen ? 'flex-1 min-h-0' : 'h-[calc(100vh-190px)] min-h-[560px]'
        }`}
      >
        {/* Main View Area */}
        <div className="flex-1 h-full relative overflow-y-auto overflow-x-hidden flex flex-col p-2 sm:p-3">
          {activeTab === 'canvas_plan' && (
            <ExactRoofingCanvas
              outline={outline}
              skeleton={skeleton}
              planes={planes}
              levels={levels}
              activeLevelId={activeLevelId}
              onSelectLevel={handleSelectLevel}
              onAddLevel={handleAddLevel}
              onUpdateEdgeEaveHeight={handleUpdateEdgeEaveHeight}
              onUpdateEdgeWall={handleUpdateEdgeWall}
              onSetEdgeMode={handleSetEdgeMode}
              selectedPlaneId={selectedPlaneId}
              layout={layoutResult || undefined}
              startPlaneId={startPlaneId || layoutResult?.startPlaneId || null}
              assets={assets}
              pitchBreaks={pitchBreaks}
              selectedAssetId={selectedAssetId}
              selectedPitchBreakId={selectedPitchBreakId}
              onSetStartPlane={handleSetStartPlane}
              onSelectPlane={handleSelectPlane}
              onUpdatePlaneOrderedSheetLength={handleUpdatePlaneOrderedSheetLength}
              onUpdateOutline={handleUpdateOutline}
              onUpdateSkeleton={handleUpdateSkeleton}
              onSelectEdgeToDefine={(edge) => setSelectedEdgeForPlane(edge)}
              onDeletePlane={(planeId) => {
                if (isReadOnlyGeometry) return;
                setPlanes((prev) => prev.filter((p) => p.id !== planeId));
                if (selectedPlaneId === planeId) setSelectedPlaneId(null);
                triggerNotice('Roof area removed');
              }}
              onRunSkeletonKey={handleRunAutoLines}
              onClearToBlank={handleStartBlank}
              onToggleJunctionGable={handleToggleJunctionGable}
              onToggleEdgeGable={handleToggleEdgeGable}
              onAddAsset={(asset) => {
                if (isReadOnlyGeometry) return;
                setAssets((prev) => [...prev, asset]);
                triggerNotice(`✓ Added ${asset.label || asset.type}`);
              }}
              onUpdateAsset={(asset) => {
                if (isReadOnlyGeometry) return;
                setAssets((prev) => prev.map((a) => (a.id === asset.id ? asset : a)));
              }}
              onDeleteAsset={(assetId) => {
                if (isReadOnlyGeometry) return;
                setAssets((prev) => prev.filter((a) => a.id !== assetId));
                if (selectedAssetId === assetId) setSelectedAssetId(null);
                triggerNotice('Feature removed');
              }}
              onSelectAsset={handleSelectAsset}
              onAddPitchBreak={(pb) => {
                if (isReadOnlyGeometry) return;
                setPitchBreaks((prev) => [...prev.filter((x) => x.planeId !== pb.planeId), pb]);
                triggerNotice(`✓ Pitch break added (${pb.lowerPitchDeg}° apron)`);
              }}
              onDeletePitchBreak={(pbId) => {
                if (isReadOnlyGeometry) return;
                setPitchBreaks((prev) => prev.filter((p) => p.id !== pbId));
                if (selectedPitchBreakId === pbId) setSelectedPitchBreakId(null);
                triggerNotice('Pitch break removed');
              }}
              onSelectPitchBreak={handleSelectPitchBreak}
              flashingAssignments={flashingAssignments}
              assignableLines={assignableLines}
              onSelectLineForFlashing={
                isReadOnlyGeometry ? undefined : (lineId) => setActiveFlashingLineId(lineId)
              }
              readOnlyGeometry={isReadOnlyGeometry}
              customSequenceMap={customSequenceMap}
              completedPlaneIds={installProgress.completedPlaneIds}
              onInstallSelectPlane={handleInstallSelectPlaneTap}
              onOpenAiAssistant={() => setIsAiDrawerOpen(true)}
              onOpenInspector={() => setIsInspectorOpen(true)}
              planUnderlay={planUnderlay}
              projectPlans={projectPlans}
              onUpdatePlanUnderlay={setPlanUnderlay}
              openPlanModalSignal={openPlanModalSignal}
              selectedPlaneIds={selectedPlaneIds}
              onChangeSelectedPlaneIds={setSelectedPlaneIds}
              selectedEdgeIds={selectedEdgeIds}
              onChangeSelectedEdgeIds={setSelectedEdgeIds}
              selectedSkeletonLineIds={selectedSkeletonLineIds}
              onChangeSelectedSkeletonLineIds={setSelectedSkeletonLineIds}
              onBatchUpdatePlanePitch={handleBatchPlanePitch}
              onBatchClassifyEdges={handleBatchEdgeType}
              onBatchUpdateSkeletonType={handleBatchSkeletonLineType}
              onUndo={handleUndo}
              canUndo={canUndo}
            />
          )}

          {activeTab === 'wall_plan' && (
            <WallPlanWorkspace
              key={wallViewKey}
              wallPlan={wallPlan}
              levels={levels}
              roofPlanes={planes}
              projectPlans={projectPlans}
              planUnderlay={planUnderlay}
              selectedWallFacetId={selectedWallFacetId}
              onSelectWallFacet={handleSelectWallFacet}
              onUpdateWallPlan={handleUpdateWallPlan}
              onUpdateWallFacet={handleUpdateWallFacet}
              onBatchUpdateFacets={handleBatchWallUpdate}
              wallFilterMode={wallFilterMode}
              onChangeWallFilterMode={setWallFilterMode}
              multiSelectedFacetIds={selectedWallFacetIds}
              onChangeMultiSelectedFacetIds={setSelectedWallFacetIds}
              onBuildRoofFromWalls={handleBuildRoofFromWallPlan}
              initialSubView={wallSubView}
              readOnly={isReadOnlyGeometry}
            />
          )}

          {activeTab === 'view_3d' && (
            <ExactRoofing3DViewer
              outline={outline}
              skeleton={skeleton}
              planes={planes}
              levels={levels}
              assets={assets}
              pitchBreaks={pitchBreaks}
              wallPlan={wallPlan}
              selectedPlaneId={selectedPlaneId}
              onSelectPlane={handleSelectPlane}
              selectedWallFacetId={selectedWallFacetId}
              onSelectWallFacet={handleSelectWallFacet}
              wallFilterMode={wallFilterMode}
              onChangeWallFilterMode={setWallFilterMode}
              roofProfileName={project?.profile}
              coilColorName={project?.colorName}
            />
          )}

          {activeTab === 'layout_results' && (
            layoutResult ? (
              <OffcutLayoutVisualizer
                layout={layoutResult}
                planes={planes}
                selectedPlaneId={selectedPlaneId}
                startPlaneId={startPlaneId || layoutResult?.startPlaneId || null}
                onSetStartPlane={handleSetStartPlane}
                onSelectPlane={handleSelectPlane}
                projectName={
                  project?.title ||
                  (selectedPreset === 'l_shape_standard'
                    ? 'L-Shape Hip & Valley'
                    : selectedPreset === 'straight_gable'
                    ? 'Classic Duo-Pitch Gable'
                    : selectedPreset === 't_shape'
                    ? 'T-Shape Villa'
                    : selectedPreset === 'two_storey_split'
                    ? '2-Storey Split Roof'
                    : selectedPreset === 'cascading_terrace'
                    ? 'Cascading Terraced Roof'
                    : '14m × 10m Hip & Valley')
                }
                siteAddress={project?.siteAddress}
                roofProfileLabel={project?.profile}
                coilColorLabel={project?.colorName}
                windZoneLabel={project?.windZone}
                onRegenerateLayout={handleGenerateLayoutClick}
                onOpenPlaneEditor={(plane) => {
                  if (isReadOnlyGeometry) return;
                  const edge = levels
                    .flatMap((l) => l.outline.edges)
                    .find((e) => e.id === plane.eaveEdgeId);
                  if (edge) setSelectedEdgeForPlane(edge);
                }}
                lifecycleStage={lifecycleStage}
                measureLocked={measureLocked}
                roofingPacks={roofingPacks}
                installProgress={installProgress}
                onUpdateInstallProgress={handleUpdateInstallProgress}
                sheetOrderMode={sheetOrderMode}
                onChangeSheetOrderMode={handleChangeSheetOrderMode}
                sheetOrderComparison={sheetOrderComparison}
              />
            ) : (
              <div className="h-full flex items-center justify-center p-6">
                <div className="bg-[#0b101d] border border-slate-800 rounded-2xl p-6 max-w-md text-center space-y-2.5">
                  <Package className="w-8 h-8 text-slate-500 mx-auto" />
                  <div className="text-base font-black text-white">No sheet packs computed yet</div>
                  <p className="text-xs text-slate-400">
                    Define roof faces in Quote or Measure first to generate pack sequencing and cut sheets.
                  </p>
                </div>
              </div>
            )
          )}

          {activeTab === 'measure_check' && (
            <SiteMeasureCheckView
              project={project}
              planes={planes}
              layout={layoutResult}
              bom={roofBom}
              assignableLines={assignableLines}
              flashingAssignments={flashingAssignments}
              assets={assets}
              wallPlan={wallPlan}
              completenessReport={completenessReport}
              auditReport={deterministicAuditReport}
              measureLocked={measureLocked}
              sheetOrderMode={sheetOrderMode}
              onChangeSheetOrderMode={handleChangeSheetOrderMode}
              sheetOrderComparison={sheetOrderComparison}
              onSelectPlane={(planeId) => {
                handleSelectPlane(planeId);
                setIsInspectorOpen(true);
              }}
              onUpdatePlaneOrderedSheetLength={handleUpdatePlaneOrderedSheetLength}
              onOpenPlanTab={() => setActiveTab('canvas_plan')}
              onOpenPlaneEditor={(plane) => {
                const edge = levels
                  .flatMap((l) => l.outline.edges)
                  .find((e) => e.id === plane.eaveEdgeId);
                if (edge) setSelectedEdgeForPlane(edge);
              }}
              onSelectLineForFlashing={(lineId) => setActiveFlashingLineId(lineId)}
              onJumpToCompletenessIssue={handleJumpToCompletenessIssue}
              onApplyDeterministicPatches={handleApplyDeterministicPatches}
              onOpenOrderModal={() => {
                setOrderModalTab('orders');
                setIsOrderModalOpen(true);
              }}
              onRecalculateLayout={handleGenerateLayoutClick}
              onConfirmLockMeasure={handleRequestLockMeasure}
            />
          )}

          {activeTab === 'flashing_workshop' && (
            <div className="p-1 sm:p-2">
              {lifecycleStage === 'installing' ? (
                <ContractorFlashingGuide
                  project={project}
                  assignableLines={assignableLines}
                  assignments={flashingAssignments}
                  libraryProfiles={libraryProfiles}
                  bom={roofBom}
                />
              ) : (
                <FlashingWorkshop
                  view={flashingWorkshopView}
                  onChangeView={setFlashingWorkshopView}
                  projects={projects.length > 0 ? projects : project ? [project] : []}
                  project={project}
                  activeMemberName={activeMemberName || 'Archtech team'}
                  theme="dark"
                  roofAssignments={flashingAssignments}
                  onUpdateProject={onUpdateProject}
                />
              )}
            </div>
          )}
        </div>

        {/* Collapsible Inspector Drawer */}
        <ExactRoofingInspectorDrawer
          isOpen={isInspectorOpen}
          onClose={() => setIsInspectorOpen(false)}
          lifecycleStage={lifecycleStage}
          readOnlyGeometry={isReadOnlyGeometry}
          selectedPlane={selectedPlane}
          selectedAsset={selectedAsset}
          selectedPitchBreak={selectedPitchBreak}
          outline={outline}
          levels={levels}
          activeLevelId={activeLevelId}
          onSelectLevel={handleSelectLevel}
          onAddLevel={handleAddLevel}
          onUpdateLevelHeight={handleUpdateLevelHeight}
          onDeleteLevel={handleDeleteLevel}
          planes={planes}
          assets={assets}
          pitchBreaks={pitchBreaks}
          layout={layoutResult}
          startPlaneId={startPlaneId || layoutResult?.startPlaneId || null}
          onToggleEdgeGable={handleToggleEdgeGable}
          onSetEdgeMode={handleSetEdgeMode}
          onUpdatePlaneEaveHeight={handleUpdatePlaneEaveHeight}
          onUpdateEdgeLength={handleUpdateEdgeLength}
          onUpdateEdgeWall={handleUpdateEdgeWall}
          onApplyRoofStylePreset={handleApplyRoofStylePreset}
          onSetStartPlane={handleSetStartPlane}
          onUpdatePlanePitch={handleUpdatePlanePitch}
          onUpdatePlaneDirection={handleUpdatePlaneDirection}
          onUpdatePlaneOrderedSheetLength={handleUpdatePlaneOrderedSheetLength}
          onSelectPlane={handleSelectPlane}
          onSelectAsset={handleSelectAsset}
          onUpdateAsset={(asset) => {
            if (isReadOnlyGeometry) return;
            setAssets((prev) => prev.map((a) => (a.id === asset.id ? asset : a)));
          }}
          onDeleteAsset={(assetId) => {
            if (isReadOnlyGeometry) return;
            setAssets((prev) => prev.filter((a) => a.id !== assetId));
            if (selectedAssetId === assetId) setSelectedAssetId(null);
            triggerNotice('Feature removed');
          }}
          onSelectPitchBreak={handleSelectPitchBreak}
          onUpdatePitchBreak={(pb) => {
            if (isReadOnlyGeometry) return;
            setPitchBreaks((prev) => prev.map((x) => (x.id === pb.id ? pb : x)));
          }}
          onDeletePitchBreak={(pbId) => {
            if (isReadOnlyGeometry) return;
            setPitchBreaks((prev) => prev.filter((x) => x.id !== pbId));
            if (selectedPitchBreakId === pbId) setSelectedPitchBreakId(null);
            triggerNotice('Pitch break removed');
          }}
          onOpenCutList={() => setActiveTab('layout_results')}
          onOpenAiCopilot={() => setIsAiCopilotOpen(true)}
          assignableLines={assignableLines}
          flashingAssignments={flashingAssignments}
          onSelectLineForFlashing={(lineId) => setActiveFlashingLineId(lineId)}
          onOpenOrderModal={() => setIsOrderModalOpen(true)}
          wallPlan={wallPlan}
          selectedWallFacetId={selectedWallFacetId}
          onSelectWallFacet={handleSelectWallFacet}
          onOpenWallElevation={handleOpenWallElevation}
          onUpdateWallFacet={handleUpdateWallFacet}
          onBuildWallFaces={handleBuildWallFaces}
          wallFilterMode={wallFilterMode}
          onChangeWallFilterMode={setWallFilterMode}
          completenessReport={completenessReport}
          onJumpToCompletenessIssue={handleJumpToCompletenessIssue}
          selectedPlaneIds={selectedPlaneIds}
          onChangeSelectedPlaneIds={setSelectedPlaneIds}
          selectedEdgeIds={selectedEdgeIds}
          onChangeSelectedEdgeIds={setSelectedEdgeIds}
          selectedSkeletonLineIds={selectedSkeletonLineIds}
          onChangeSelectedSkeletonLineIds={setSelectedSkeletonLineIds}
          selectedWallFacetIds={selectedWallFacetIds}
          onChangeSelectedWallFacetIds={setSelectedWallFacetIds}
          onBatchPlanePitch={handleBatchPlanePitch}
          onBatchPlaneDirection={handleBatchPlaneDirection}
          onBatchPlaneOrderedSheetLength={handleBatchPlaneOrderedSheetLength}
          onBatchPlaneEaveHeight={handleBatchPlaneEaveHeight}
          onBatchEdgeType={handleBatchEdgeType}
          onBatchEdgeWall={handleBatchEdgeWall}
          onBatchEdgeHeight={handleBatchEdgeHeight}
          onBatchSkeletonLineType={handleBatchSkeletonLineType}
          onBatchWallUpdate={handleBatchWallUpdate}
          onUndo={handleUndo}
          canUndo={canUndo}
        />
      </div>

      {/* Set Pitch Modal */}
      <DefinePlaneModal
        edge={selectedEdgeForPlane}
        outlineEdges={
          selectedEdgeForPlane ? findLevelForEdge(selectedEdgeForPlane.id).outline.edges : undefined
        }
        existingPlane={
          selectedEdgeForPlane
            ? planes.find((p) => p.eaveEdgeId === selectedEdgeForPlane.id) || null
            : null
        }
        existingPlanes={planes}
        selectedEdgeIds={selectedEdgeIds}
        isOpen={!!selectedEdgeForPlane}
        onClose={() => setSelectedEdgeForPlane(null)}
        onClassifyEdge={handleClassifyEdge}
        onBatchClassifyEdges={handleBatchEdgeType}
        onBatchUpdateEdges={handleBatchDefineEdges}
        onSavePlane={handleSavePlane}
        onAssignFlashing={(edge) => setActiveFlashingLineId(edge.id)}
      />

      {/* Import Outline Modal */}
      <ImportOutlineModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportOutline={handleImportOutline}
      />

      {/* AI Copilot Modal */}
      <RoofingAiCopilotModal
        isOpen={isAiCopilotOpen}
        onClose={() => setIsAiCopilotOpen(false)}
        outline={outline}
        skeleton={skeleton}
        planes={planes}
        layout={layoutResult}
        onApplyGeneratedRoof={handleApplyAiRoof}
        projectTitle={project?.title || 'Profiled Metal Roof'}
      />

      {/* Stage Assistant Drawer */}
      <ExactRoofingAiDrawer
        isOpen={isAiDrawerOpen}
        onClose={() => setIsAiDrawerOpen(false)}
        lifecycleStage={lifecycleStage}
        measureLocked={measureLocked}
        projectTitle={project?.title || 'Profiled Metal Roof'}
        profileName={project?.profile}
        windZone={project?.windZone}
        planes={planes}
        levels={levels}
        selectedPlane={selectedPlane}
        assets={assets}
        pitchBreaks={pitchBreaks}
        sheetSpec={sheetSpec}
        assignableLines={assignableLines}
        flashingAssignments={flashingAssignments}
        flashingCount={flashingAssignments.length}
        unassignedLineCount={unassignedLineCount}
        layout={layoutResult}
        roofingPacks={roofingPacks}
        completedPlaneIds={installProgress.completedPlaneIds}
        wallPlan={wallPlan}
        completenessReport={completenessReport}
        orderPack={liveOrderPack}
        onApplyScannedRoof={handleApplyAiRoof}
        onApplyDeterministicPatches={handleApplyDeterministicPatches}
        onJumpToCompletenessIssue={handleJumpToCompletenessIssue}
        onOpenWallPlan={() => {
          setWallSubView('plan');
          setActiveTab('wall_plan');
        }}
        onExecuteAction={handleExecuteAiAction}
        onOpenFullCopilot={() => setIsAiCopilotOpen(true)}
      />

      {/* Flashing Line Picker & Drawing Suite Launcher */}
      <FlashingAssignmentModal
        isOpen={!!activeFlashingLine}
        line={activeFlashingLine}
        existingAssignment={flashingAssignments.find(
          (a) => a.lineId === activeFlashingLine?.lineId
        )}
        libraryProfiles={libraryProfiles}
        project={project}
        onClose={() => setActiveFlashingLineId(null)}
        onOpenDrawingSuite={(line, seedProfileId = null) => {
          setActiveFlashingLineId(null);
          setDrawingSuiteSession({
            line,
            seedProfileId,
            key: Date.now()
          });
        }}
        onSaveAssignment={handleSaveFlashingAssignment}
        onRemoveAssignment={handleRemoveFlashingAssignment}
      />

      {/* Combined BOM Hub: Orders, Order Pack, CNC Queue & Quote Pricing */}
      <ExactRoofingOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => {
          setIsOrderModalOpen(false);
          setOrderModalTab(undefined);
        }}
        project={project}
        quotes={quotes}
        activeQuote={activeQuote}
        lifecycleStage={lifecycleStage}
        measureLocked={measureLocked}
        activeMemberName={activeMemberName}
        assignableLines={assignableLines}
        assignments={flashingAssignments}
        libraryProfiles={libraryProfiles}
        layout={layoutResult}
        bom={roofBom}
        packs={roofingPacks}
        planes={planes}
        levels={levels}
        assets={assets}
        wallPlan={wallPlan}
        completenessReport={completenessReport}
        orderPack={liveOrderPack}
        sheetOrderMode={sheetOrderMode}
        onChangeSheetOrderMode={handleChangeSheetOrderMode}
        sheetOrderComparison={sheetOrderComparison}
        initialModalTab={orderModalTab}
        onSelectLineToAssign={(line) => setActiveFlashingLineId(line.lineId)}
        onRemoveAssignment={handleRemoveFlashingAssignment}
        onMarkOrdered={({ workshop, crm }) => {
          setFlashingAssignments((prev) =>
            prev.map((a) => ({
              ...a,
              orderedToWorkshop: workshop ? true : a.orderedToWorkshop,
              orderedToCrm: crm ? true : a.orderedToCrm
            }))
          );
        }}
        onUpdateProject={onUpdateProject}
        onPushBomToQuote={
          onPushBomToQuote
            ? (opts) => {
                const snap = buildCurrentSnapshot();
                onPushBomToQuote({
                  ...opts,
                  bom: roofBom,
                  snapshot: snap,
                  project
                });
              }
            : undefined
        }
        onOpenFlashingOrders={() => {
          setIsOrderModalOpen(false);
          setFlashingWorkshopView('orders');
          setActiveTab('flashing_workshop');
          onOpenFlashingOrders?.();
        }}
      />

      {/* Integrated Flashing Drawing Suite Overlay */}
      {drawingSuiteSession && (
        <FlashingDesigner
          key={drawingSuiteSession.key}
          project={designerProject}
          activeMemberName={activeMemberName}
          initialProfileId={drawingSuiteSession.seedProfileId}
          onUpdateProject={(updated) => {
            if (project && onUpdateProject) {
              onUpdateProject(updated);
            }
          }}
          onSaveToLibrary={(prof) => {
            const res = saveProfileToSharedFlashingLibrary(prof);
            setLibraryVersion((v) => v + 1);
            return res === 'storage-error' ? 'storage-error' : 'saved';
          }}
          assignmentContext={{
            lineLabel: drawingSuiteSession.line.label,
            flashingKindLabel: getFlashingKindDisplayLabel(
              drawingSuiteSession.line.flashingKind
            ),
            trueSlopeLengthM: drawingSuiteSession.line.trueSlopeLengthM,
            defaultCategory: drawingSuiteSession.line.suggestedCategory,
            defaultName: `${drawingSuiteSession.line.label} Flashing`
          }}
          onAssignProfile={handleAssignFromDrawingSuite}
          onClose={() => setDrawingSuiteSession(null)}
        />
      )}

      {/* Confirm Overwriting Existing Roof Footprint from Wall Plan */}
      {pendingWallPlanForRoof && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPendingWallPlanForRoof(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0b101d] border border-slate-700 rounded-2xl p-5 space-y-4 shadow-2xl text-white"
          >
            <div className="space-y-1">
              <div className="text-xs font-extrabold uppercase tracking-wider text-indigo-400">
                Update Footprint from Wall Plan
              </div>
              <h3 className="text-base font-black text-white">
                Replace {focusedLevel.code} roof outline?
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {focusedLevel.code} already has a roof footprint ({focusedLevel.outline.points.length} vertices). Continuing replaces {focusedLevel.code}&apos;s outline with the wall plan boundary ({pendingWallPlanForRoof.facets.length} faces) in site metres and clears stale skeleton lines so you can classify eaves cleanly.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingWallPlanForRoof(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => applyRoofFromWallPlan(pendingWallPlanForRoof)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold cursor-pointer"
              >
                Replace Roof Footprint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Lock Takeoff Completeness Review Gate */}
      {isMeasureLockGateOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsMeasureLockGateOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-lg bg-[#0b101d] rounded-2xl p-5 space-y-4 shadow-2xl text-white border ${
              completenessReport.blockersCount > 0 ? 'border-rose-500/60' : 'border-amber-500/50'
            }`}
          >
            <div className="space-y-1">
              <div
                className={`text-xs font-extrabold uppercase tracking-wider ${
                  completenessReport.blockersCount > 0 ? 'text-rose-400' : 'text-amber-400'
                }`}
              >
                {completenessReport.blockersCount > 0
                  ? 'Pre-Lock Completeness Gate · Blocked'
                  : 'Pre-Lock Completeness Check · Warnings Only'}
              </div>
              <h3 className="text-base font-black text-white">
                {completenessReport.blockersCount > 0
                  ? `${completenessReport.blockersCount} blocker(s) must be resolved before locking measure`
                  : `${completenessReport.warningsCount} optional warning(s) detected`}
              </h3>
              <p className="text-xs text-slate-300">
                {completenessReport.blockersCount > 0
                  ? 'Return wall faces, critical flashings (ridge/hip/valley/barge/apron), roof face pitch/run, and penetrations must be valid before issuing an Order Pack.'
                  : 'No structural blockers remain. Review non-critical warnings or lock measure now to emit the frozen Order Pack.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
              {completenessReport.undetailedReturnsCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-200">
                  {completenessReport.undetailedReturnsCount} Undetailed Returns (Blocker)
                </span>
              )}
              {completenessReport.unassignedFlashingsCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-200">
                  {completenessReport.unassignedFlashingsCount} Unassigned Flashings (Blocker)
                </span>
              )}
              {completenessReport.incompletePlanesCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-200">
                  {completenessReport.incompletePlanesCount} Incomplete Roof Faces (Blocker)
                </span>
              )}
              {completenessReport.incompletePenetrationsCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-200">
                  {completenessReport.incompletePenetrationsCount} Incomplete Penetrations (Blocker)
                </span>
              )}
              {completenessReport.warningsCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-200">
                  {completenessReport.warningsCount} Warnings
                </span>
              )}
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {completenessReport.issues.map((issue) => (
                <div
                  key={issue.id}
                  className={`p-2.5 rounded-xl bg-slate-950 flex items-center justify-between gap-2 text-xs border ${
                    issue.severity === 'blocker' ? 'border-rose-500/45' : 'border-amber-500/35'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-100 flex items-center gap-1.5 truncate">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase shrink-0 ${
                          issue.severity === 'blocker'
                            ? 'bg-rose-600 text-white'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {issue.severity}
                      </span>
                      <span className="truncate">{issue.title}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{issue.detail}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleJumpToCompletenessIssue(issue)}
                    className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-extrabold cursor-pointer shrink-0"
                  >
                    Fix
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsMeasureLockGateOpen(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Keep Reviewing
              </button>
              <button
                type="button"
                disabled={!completenessReport.canLockMeasure}
                onClick={handleConfirmLockMeasure}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-extrabold cursor-pointer"
              >
                {completenessReport.canLockMeasure
                  ? 'Lock with Warnings & Emit Order Pack'
                  : `Resolve ${completenessReport.blockersCount} Blocker(s) First`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
