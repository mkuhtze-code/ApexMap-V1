import {
  AssignableRoofLine,
  EdgeType,
  FlashingRuleContext,
  FlashingRuleSet,
  LayoutResult,
  OrderPack,
  PitchBreakLine,
  PlanEdge,
  Point2D,
  RoofAsset,
  RoofBomSummary,
  RoofFlashingAssignment,
  RoofJunctionNode,
  RoofLevel,
  RoofOutline,
  RoofOutlinePresetKey,
  RoofPlane,
  RoofProfileFamily,
  SheetOrderComparisonSummary,
  SheetOrderMode,
  SheetSpec,
  SkeletonLine,
  TakeoffCompletenessReport,
  VentedRidgeOption,
  WallPlan
} from '../types/exactRoofing';
import { Project, FlashingProfile } from '../types/crm';
import {
  DEFAULT_MAX_AREA_INFLATION_RATIO,
  MAX_ROOF_DOMAIN_VERTICES,
  applyDirectionToPlanes,
  applyOrderedSheetLengthToPlanes,
  applyPitchToPlanes,
  buildFacesFromClassification,
  computeTruthfulRoofAreaM2,
  createPlaneFromEdge,
  createRoofLevel,
  deduplicateRoofPlanes,
  deleteRoofPlanes,
  dist,
  generateCuttingLayout,
  generateSkeletonLines,
  getAllOutlineEdges,
  getAssignableRoofLinesMultiLevel,
  getOutlineFootprintAreaM2,
  getPresetOutline,
  getRoofJunctionNodes,
  isGableEdgeType,
  isStationaryEdgeType,
  mergeColinearRidgeLines,
  pointsClose,
  polygonArea,
  syncMultiLevelPlanes
} from './exactRoofingEngine';
import { buildOrderPack, buildRoofBillOfMaterials } from './exactRoofingBomBridge';
import { assignStandardFlashings } from './flashingRules';
import { evaluateTakeoffCompleteness } from './takeoffCompleteness';

export { DEFAULT_MAX_AREA_INFLATION_RATIO, computeTruthfulRoofAreaM2 };

export interface RoofPipelineDirtyFlags {
  skeleton: boolean;
  faces: boolean;
  layout: boolean;
  bom: boolean;
}

export interface RoofAreaSanityResult {
  ok: boolean;
  footprintAreaM2: number;
  planCoverageAreaM2: number;
  modeledAreaM2: number;
  expectedMaxAreaM2: number;
  maxInflationRatio: number;
  inflationRatio: number;
  hardBlockBomPush: boolean;
  warning?: string;
}

export interface RoofPipelineState {
  levels: RoofLevel[];
  planes: RoofPlane[];
  layout: LayoutResult | null;
  bom: RoofBomSummary | null;
  orderPack: OrderPack | null;
  dirty: RoofPipelineDirtyFlags;
  areaSanity: RoofAreaSanityResult;
  lastBuildError: string | null;
}

/**
 * Counts total outer + courtyard hole vertices across levels and enforces MAX_ROOF_DOMAIN_VERTICES
 * so malformed / high-density imports fail gracefully instead of hanging the browser UI thread.
 */
export function assertRoofDomainComplexity(
  levels: RoofLevel[],
  maxVertices = MAX_ROOF_DOMAIN_VERTICES
): void {
  for (const lvl of levels) {
    const outerCount = lvl.outline.points.length;
    const holeCount = (lvl.outline.holes || []).reduce((s, h) => s + h.points.length, 0);
    const total = outerCount + holeCount;
    if (total > maxVertices) {
      throw new Error(
        `Roof body "${lvl.name || lvl.code}" has ${total} boundary vertices (limit ${maxVertices}). Simplify corners or split into separate roof bodies.`
      );
    }
  }
}

/**
 * Compares deduplicated structural planes against net outer-minus-hole footprint area
 * so ~2x duplicate plane inflation is caught deterministically before BOM trust/export/quote push.
 */
export function checkRoofAreaSanity(
  levels: RoofLevel[],
  planes: RoofPlane[],
  options?: { maxInflationRatio?: number }
): RoofAreaSanityResult {
  const maxInflationRatio = Math.max(
    1.05,
    options?.maxInflationRatio ?? DEFAULT_MAX_AREA_INFLATION_RATIO
  );

  const footprintAreaM2 = +levels
    .reduce((sum, l) => sum + getOutlineFootprintAreaM2(l.outline), 0)
    .toFixed(2);

  const structuralPlanes = deduplicateRoofPlanes(planes).filter((p) => !p.isVirtualAssetPlane);
  const planCoverageAreaM2 = +structuralPlanes
    .reduce((sum, p) => sum + (p.planPolygon.length >= 3 ? polygonArea(p.planPolygon) : 0), 0)
    .toFixed(2);
  const modeledAreaM2 = computeTruthfulRoofAreaM2(structuralPlanes);

  if (footprintAreaM2 <= 0.1 || structuralPlanes.length === 0) {
    return {
      ok: true,
      footprintAreaM2,
      planCoverageAreaM2,
      modeledAreaM2,
      expectedMaxAreaM2: footprintAreaM2,
      maxInflationRatio,
      inflationRatio: 1,
      hardBlockBomPush: false
    };
  }

  let totalWeightedArea = 0;
  let weightedPitchSum = 0;
  structuralPlanes.forEach((p) => {
    const w = Math.max(0.01, p.planPolygon.length >= 3 ? polygonArea(p.planPolygon) : p.area || 0);
    const pitch = Number.isFinite(p.pitchDeg) ? Math.min(72, Math.max(1, p.pitchDeg)) : 22.5;
    weightedPitchSum += w * pitch;
    totalWeightedArea += w;
  });
  const dominantPitchDeg = totalWeightedArea > 0 ? weightedPitchSum / totalWeightedArea : 22.5;
  const cosDominant = Math.max(0.3, Math.cos((dominantPitchDeg * Math.PI) / 180));
  const tolArea = Math.min(4, footprintAreaM2 * 0.08);
  const expectedMaxAreaM2 = +((footprintAreaM2 / cosDominant) * maxInflationRatio + tolArea).toFixed(2);
  const expectedMaxPlanM2 = +(footprintAreaM2 * maxInflationRatio + tolArea).toFixed(2);

  const rawStructuralPlanes = planes.filter((p) => !p.isVirtualAssetPlane);
  const rawPlanSum = rawStructuralPlanes.reduce(
    (sum, p) => sum + (p.planPolygon.length >= 3 ? polygonArea(p.planPolygon) : 0),
    0
  );
  const rawModeledSum = rawStructuralPlanes.reduce(
    (sum, p) => sum + Math.max(0, p.area || 0),
    0
  );

  const duplicateDetected =
    rawStructuralPlanes.length > structuralPlanes.length ||
    rawPlanSum > planCoverageAreaM2 + 1.0 ||
    rawModeledSum > modeledAreaM2 + 1.0;

  const reportedModeled = Math.max(modeledAreaM2, +rawModeledSum.toFixed(2));
  const inflationRatio = +(
    reportedModeled / Math.max(0.1, footprintAreaM2 / cosDominant)
  ).toFixed(2);

  if (
    duplicateDetected ||
    planCoverageAreaM2 > expectedMaxPlanM2 ||
    modeledAreaM2 > expectedMaxAreaM2 ||
    inflationRatio > maxInflationRatio
  ) {
    const warning = `Area sanity warning: modeled roof (${reportedModeled.toFixed(1)}m²) exceeds expected pitch-adjusted footprint band (max ${expectedMaxAreaM2.toFixed(1)}m² on ${footprintAreaM2.toFixed(1)}m² net footprint). Check for overlapping or duplicate faces.`;
    return {
      ok: false,
      footprintAreaM2,
      planCoverageAreaM2,
      modeledAreaM2: reportedModeled,
      expectedMaxAreaM2,
      maxInflationRatio,
      inflationRatio,
      hardBlockBomPush: true,
      warning
    };
  }

  return {
    ok: true,
    footprintAreaM2,
    planCoverageAreaM2,
    modeledAreaM2,
    expectedMaxAreaM2,
    maxInflationRatio,
    inflationRatio,
    hardBlockBomPush: false
  };
}

export function createRoofPipelineState(params?: {
  levels?: RoofLevel[];
  planes?: RoofPlane[];
  layout?: LayoutResult | null;
  bom?: RoofBomSummary | null;
  orderPack?: OrderPack | null;
  dirty?: Partial<RoofPipelineDirtyFlags>;
  maxInflationRatio?: number;
}): RoofPipelineState {
  const levels = params?.levels || [];
  const planes = deduplicateRoofPlanes(params?.planes || []);
  const layout = params?.layout || null;
  const bom = params?.bom || null;
  const orderPack = params?.orderPack || null;
  return {
    levels,
    planes,
    layout,
    bom,
    orderPack,
    dirty: {
      skeleton: params?.dirty?.skeleton ?? false,
      faces:
        params?.dirty?.faces ??
        (levels.some((l) => l.outline.points.length >= 3) && planes.length === 0),
      layout: params?.dirty?.layout ?? (!layout && planes.length > 0),
      bom: params?.dirty?.bom ?? !bom
    },
    areaSanity: checkRoofAreaSanity(levels, planes, {
      maxInflationRatio: params?.maxInflationRatio
    }),
    lastBuildError: null
  };
}

export function invalidateOutline(
  state: RoofPipelineState,
  nextLevels?: RoofLevel[],
  options?: { markSkeletonDirty?: boolean; maxInflationRatio?: number }
): RoofPipelineState {
  const levels = nextLevels ?? state.levels;
  return {
    ...state,
    levels,
    dirty: {
      skeleton: options?.markSkeletonDirty ?? state.dirty.skeleton,
      faces: true,
      layout: true,
      bom: true
    },
    areaSanity: checkRoofAreaSanity(levels, state.planes, {
      maxInflationRatio: options?.maxInflationRatio
    }),
    lastBuildError: null
  };
}

export function invalidateSkeleton(
  state: RoofPipelineState,
  nextLevels?: RoofLevel[]
): RoofPipelineState {
  const levels = nextLevels ?? state.levels;
  return {
    ...state,
    levels,
    dirty: {
      skeleton: false,
      faces: true,
      layout: true,
      bom: true
    },
    lastBuildError: null
  };
}

export function invalidateFaces(
  state: RoofPipelineState,
  nextPlanes?: RoofPlane[],
  options?: { maxInflationRatio?: number }
): RoofPipelineState {
  const planes = deduplicateRoofPlanes(nextPlanes ?? state.planes);
  return {
    ...state,
    planes,
    dirty: {
      skeleton: state.dirty.skeleton,
      faces: false,
      layout: true,
      bom: true
    },
    areaSanity: checkRoofAreaSanity(state.levels, planes, {
      maxInflationRatio: options?.maxInflationRatio
    }),
    lastBuildError: null
  };
}

export function invalidateLayout(
  state: RoofPipelineState,
  nextLayout?: LayoutResult | null
): RoofPipelineState {
  return {
    ...state,
    layout: nextLayout !== undefined ? nextLayout : state.layout,
    dirty: {
      ...state.dirty,
      layout: false,
      bom: true
    },
    lastBuildError: null
  };
}

/**
 * Ensures skeleton lines are built or normalized cleanly.
 * - mode === 'manual': preserves manual skeleton lines cleanly and NEVER invokes generateSkeletonLines().
 * - mode === 'auto': runs wavefront skeleton solver for target levels and marks faces/layout/bom dirty.
 */
export function ensureSkeleton(
  state: RoofPipelineState,
  options: {
    mode: 'auto' | 'manual';
    targetLevelIds?: string[];
    maxVertices?: number;
  }
): { state: RoofPipelineState; generatedCount: number } {
  assertRoofDomainComplexity(state.levels, options.maxVertices ?? MAX_ROOF_DOMAIN_VERTICES);

  const targetSet = options.targetLevelIds ? new Set(options.targetLevelIds) : null;
  let generatedCount = 0;

  if (options.mode === 'manual') {
    const nextLevels = state.levels.map((lvl) => {
      if (targetSet && !targetSet.has(lvl.id)) return lvl;
      const lvlPlanes = state.planes.filter((p) => !p.levelId || p.levelId === lvl.id);
      return {
        ...lvl,
        skeleton: mergeColinearRidgeLines(lvl.skeleton, lvlPlanes)
      };
    });
    return {
      state: {
        ...state,
        levels: nextLevels,
        dirty: {
          ...state.dirty,
          skeleton: false
        },
        lastBuildError: null
      },
      generatedCount: 0
    };
  }

  const nextLevels = state.levels.map((lvl) => {
    if (targetSet && !targetSet.has(lvl.id)) return lvl;
    if (lvl.outline.points.length < 3) return lvl;

    const preparedOutline: RoofOutline = {
      ...lvl.outline,
      edges: lvl.outline.edges.map((e) => ({
        ...e,
        type: isStationaryEdgeType(e.type) ? e.type : 'outline'
      })),
      ...(lvl.outline.holes
        ? {
            holes: lvl.outline.holes.map((h) => ({
              ...h,
              edges: h.edges.map((e) => ({
                ...e,
                type: isStationaryEdgeType(e.type) ? e.type : 'outline'
              }))
            }))
          }
        : {})
    };

    const generated = generateSkeletonLines(preparedOutline).map((s) => ({
      ...s,
      levelId: s.levelId ?? lvl.id
    }));
    generatedCount += generated.length;

    return {
      ...lvl,
      outline: preparedOutline,
      skeleton: generated,
      suppressedPlaneEdgeIds: undefined
    };
  });

  return {
    state: {
      ...state,
      levels: nextLevels,
      dirty: {
        skeleton: false,
        faces: true,
        layout: true,
        bom: true
      },
      lastBuildError: null
    },
    generatedCount
  };
}

function hasStructuralSkeleton(skeleton: SkeletonLine[]): boolean {
  return skeleton.some(
    (s) =>
      s.suggestedType === 'ridge' ||
      s.suggestedType === 'hip' ||
      s.suggestedType === 'valley' ||
      s.suggestedType === 'eave' ||
      s.suggestedType === 'barge' ||
      s.suggestedType === 'rake' ||
      s.suggestedType === 'apron' ||
      s.suggestedType === 'wall' ||
      s.suggestedType === 'change-of-pitch'
  );
}

/**
 * Ensures closed planar roof faces for all levels using one deterministic commit path.
 * Replaces planes cleanly (never appends duplicate faces) and preserves manual skeleton lines.
 */
export function ensureFaces(
  state: RoofPipelineState,
  options?: {
    defaultPitchDeg?: number;
    preserveUserDeleted?: boolean;
    allowAutoSkeletonWhenEmpty?: boolean;
    maxVertices?: number;
    maxInflationRatio?: number;
  }
): {
  state: RoofPipelineState;
  createdCount: number;
  areaSanity: RoofAreaSanityResult;
} {
  assertRoofDomainComplexity(state.levels, options?.maxVertices ?? MAX_ROOF_DOMAIN_VERTICES);

  const defaultPitch = options?.defaultPitchDeg ?? 22.5;

  if (options?.preserveUserDeleted) {
    const synced = deduplicateRoofPlanes(
      syncMultiLevelPlanes(state.levels, state.planes, defaultPitch)
    );
    const existingIds = new Set(state.planes.map((p) => p.id));
    const createdCount = synced.filter((p) => !existingIds.has(p.id)).length;
    const areaSanity = checkRoofAreaSanity(state.levels, synced, {
      maxInflationRatio: options?.maxInflationRatio
    });
    return {
      state: {
        ...state,
        planes: synced,
        dirty: {
          ...state.dirty,
          faces: false,
          layout: true,
          bom: true
        },
        areaSanity,
        lastBuildError: null
      },
      createdCount,
      areaSanity
    };
  }

  let working = state;
  if (options?.allowAutoSkeletonWhenEmpty) {
    const emptyAutoIds = working.levels
      .filter((lvl) => {
        if (lvl.outline.points.length < 3) return false;
        if (hasStructuralSkeleton(lvl.skeleton)) return false;
        const allEdges = getAllOutlineEdges(lvl.outline);
        const hasClassifiedEave = allEdges.some((e) => e.type === 'outline');
        const activeEaves = allEdges.filter((e) =>
          !hasClassifiedEave && e.type === 'unclassified' ? true : e.type === 'outline'
        ).length;
        return activeEaves >= 2;
      })
      .map((l) => l.id);

    if (emptyAutoIds.length > 0) {
      working = ensureSkeleton(working, {
        mode: 'auto',
        targetLevelIds: emptyAutoIds,
        maxVertices: options?.maxVertices
      }).state;
    }
  }

  const built = buildFacesFromClassification(working.levels, working.planes, defaultPitch);
  const dedupedPlanes = deduplicateRoofPlanes(built.planes);
  const areaSanity = checkRoofAreaSanity(built.levels, dedupedPlanes, {
    maxInflationRatio: options?.maxInflationRatio
  });

  return {
    state: {
      ...working,
      levels: built.levels,
      planes: dedupedPlanes,
      dirty: {
        skeleton: false,
        faces: false,
        layout: true,
        bom: true
      },
      areaSanity,
      lastBuildError: null
    },
    createdCount: built.createdCount,
    areaSanity
  };
}

/**
 * Single-writer helper to update or add a single plane for an eave edge (pitch/direction/setup edit)
 * through RoofPipeline without letting UI components call createPlaneFromEdge directly.
 */
export function upsertSinglePlaneViaPipeline(params: {
  levels: RoofLevel[];
  planes: RoofPlane[];
  owningLevelId: string;
  eaveEdge: PlanEdge;
  pitchDeg: number;
  underlapSide: 'left' | 'right';
  eaveHeightM?: number;
  sheetRunEdgeId?: string;
  orderedSheetLengthM?: number;
  name?: string;
  existingId?: string;
  matchBy?: 'planeId' | 'eaveEdgeId';
}): { state: RoofPipelineState; plane: RoofPlane } {
  const owningLvl =
    params.levels.find((l) => l.id === params.owningLevelId) ||
    params.levels.find((l) =>
      getAllOutlineEdges(l.outline).some((e) => e.id === params.eaveEdge.id)
    ) ||
    params.levels[0];

  const builtPlane = createPlaneFromEdge(owningLvl.outline, owningLvl.skeleton, params.eaveEdge, {
    pitchDeg: params.pitchDeg,
    underlapSide: params.underlapSide,
    eaveHeightM: params.eaveHeightM,
    sheetRunEdgeId: params.sheetRunEdgeId,
    orderedSheetLengthM: params.orderedSheetLengthM,
    name: params.name,
    existingId: params.existingId,
    levelId: owningLvl.id,
    levelCode: owningLvl.code,
    levelName: owningLvl.name
  });

  const baseState = createRoofPipelineState({
    levels: params.levels,
    planes: params.planes,
    dirty: { faces: false }
  });

  let replaced = false;
  const nextPlanes = params.planes.map((p) => {
    const isMatch =
      params.matchBy === 'planeId' && params.existingId
        ? p.id === params.existingId
        : p.eaveEdgeId === params.eaveEdge.id;
    if (!isMatch) return p;
    replaced = true;
    return builtPlane;
  });

  if (!replaced) {
    nextPlanes.push(builtPlane);
  }

  return {
    state: invalidateFaces(baseState, nextPlanes),
    plane: builtPlane
  };
}

/**
 * Single-writer helper to delete committed roof planes while keeping outline/lines & suppressions intact.
 */
export function deletePlanesViaPipeline(
  state: RoofPipelineState,
  planeIds: string[],
  options?: { maxInflationRatio?: number }
): RoofPipelineState {
  const res = deleteRoofPlanes(state.levels, state.planes, planeIds);
  const planes = deduplicateRoofPlanes(res.planes);
  return {
    ...state,
    levels: res.levels,
    planes,
    layout: null,
    dirty: {
      skeleton: state.dirty.skeleton,
      faces: false,
      layout: true,
      bom: true
    },
    areaSanity: checkRoofAreaSanity(res.levels, planes, {
      maxInflationRatio: options?.maxInflationRatio
    }),
    lastBuildError: null
  };
}

/**
 * Single-writer helper to batch update pitch, underlap direction, or ordered sheet length on committed planes.
 */
export function updatePlanesBatchViaPipeline(
  state: RoofPipelineState,
  params: {
    planeIds: string[];
    pitchDeg?: number;
    underlapSide?: 'left' | 'right';
    orderedSheetLengthM?: number | null;
    maxInflationRatio?: number;
  }
): RoofPipelineState {
  let nextPlanes = state.planes;
  if (params.pitchDeg !== undefined) {
    nextPlanes = applyPitchToPlanes(nextPlanes, params.planeIds, params.pitchDeg, state.levels);
  }
  if (params.underlapSide !== undefined) {
    nextPlanes = applyDirectionToPlanes(nextPlanes, params.planeIds, params.underlapSide);
  }
  if (params.orderedSheetLengthM !== undefined) {
    nextPlanes = applyOrderedSheetLengthToPlanes(
      nextPlanes,
      params.planeIds,
      params.orderedSheetLengthM === null ? undefined : params.orderedSheetLengthM
    );
  }
  const cleanPlanes = deduplicateRoofPlanes(nextPlanes);
  return invalidateFaces(state, cleanPlanes, {
    maxInflationRatio: params.maxInflationRatio
  });
}

function solveOutlineSkeletonViaPipeline(
  outline: RoofOutline,
  levelId = outline.levelId || 'level-1',
  eaveHeightM = 2.7
): SkeletonLine[] {
  const lvl: RoofLevel = {
    id: levelId,
    code: 'L1',
    name: 'Roof',
    eaveHeightM,
    outline: { ...outline, levelId },
    skeleton: []
  };
  return ensureSkeleton(createRoofPipelineState({ levels: [lvl], planes: [] }), {
    mode: 'auto',
    targetLevelIds: [levelId]
  }).state.levels[0].skeleton;
}

export function createRoofLevelWithSkeleton(
  index: number,
  name: string,
  eaveHeightM: number,
  points: Point2D[] = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 5 }
  ],
  edgeTypes?: EdgeType[],
  options?: { autoGenerateSkeleton?: boolean; initialEdgeType?: EdgeType }
): RoofLevel {
  const base = createRoofLevel(index, name, eaveHeightM, points, edgeTypes, {
    initialEdgeType: options?.initialEdgeType
  });
  if (options?.autoGenerateSkeleton === false) {
    return base;
  }
  return ensureSkeleton(createRoofPipelineState({ levels: [base], planes: [] }), {
    mode: 'auto',
    targetLevelIds: [base.id]
  }).state.levels[0];
}

export function setEdgeMode(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  edgeId: string,
  targetMode: 'hipped' | 'gable' | 'wall' | 'apron' | 'ridge',
  options?: { edgesOnly?: boolean }
): {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  toggledTo: 'hipped' | 'gable' | 'wall' | 'apron' | 'ridge' | null;
  edge?: PlanEdge;
} {
  const edge = outline.edges.find((e) => e.id === edgeId);
  if (!edge) {
    return { outline, skeleton, toggledTo: null };
  }

  if (!options?.edgesOnly && (targetMode === 'gable' || targetMode === 'wall')) {
    const remainingOutlineCount = outline.edges.filter(
      (e) => e.id !== edgeId && !isStationaryEdgeType(e.type)
    ).length;
    if (remainingOutlineCount < 1) {
      return { outline, skeleton, toggledTo: null, edge };
    }
  }

  const nextEdgeType: PlanEdge['type'] =
    targetMode === 'gable'
      ? 'verge'
      : targetMode === 'wall'
      ? 'wall'
      : targetMode === 'apron'
      ? 'apron'
      : targetMode === 'ridge'
      ? 'ridge'
      : 'outline';

  if (edge.type === nextEdgeType) {
    return { outline, skeleton, toggledTo: targetMode, edge };
  }

  const nextOutline: RoofOutline = {
    ...outline,
    edges: outline.edges.map((e) =>
      e.id === edgeId
        ? {
            ...e,
            type: nextEdgeType,
            ...(nextEdgeType === 'wall' ? { hasWall: true } : {})
          }
        : e
    )
  };
  const nextSkeleton = options?.edgesOnly
    ? skeleton
    : solveOutlineSkeletonViaPipeline(nextOutline);

  return {
    outline: nextOutline,
    skeleton: nextSkeleton,
    toggledTo: targetMode,
    edge: { ...edge, type: nextEdgeType }
  };
}

export function toggleEdgeGable(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  edgeId: string,
  forceMode?: 'hipped' | 'gable'
): {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  toggledTo: 'gable' | 'hipped' | null;
  edge?: PlanEdge;
} {
  const edge = outline.edges.find((e) => e.id === edgeId);
  if (!edge) {
    return { outline, skeleton, toggledTo: null };
  }

  const targetIsGable =
    forceMode !== undefined ? forceMode === 'gable' : !isGableEdgeType(edge.type);

  const remainingOutlineCount = outline.edges.filter(
    (e) => e.id !== edgeId && !isStationaryEdgeType(e.type)
  ).length;
  if (targetIsGable && remainingOutlineCount < 1) {
    return { outline, skeleton, toggledTo: null, edge };
  }

  const nextEdgeType: PlanEdge['type'] = targetIsGable ? 'verge' : 'outline';
  if (edge.type === nextEdgeType) {
    return {
      outline,
      skeleton,
      toggledTo: targetIsGable ? 'gable' : 'hipped',
      edge
    };
  }

  const nextOutline: RoofOutline = {
    ...outline,
    edges: outline.edges.map((e) => (e.id === edgeId ? { ...e, type: nextEdgeType } : e))
  };
  const nextSkeleton = solveOutlineSkeletonViaPipeline(nextOutline);

  return {
    outline: nextOutline,
    skeleton: nextSkeleton,
    toggledTo: targetIsGable ? 'gable' : 'hipped',
    edge: { ...edge, type: nextEdgeType }
  };
}

export type TypologyPresetMode = 'hipped' | 'gable' | 'mono';

export interface TypologyPresetEdgeResult {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  applied: boolean;
  needsPick?: 'two_barges' | 'low_eave';
}

/**
 * Edge-only typology preset helper (Hip / Gable / Mono).
 * NEVER builds faces and NEVER runs the wavefront skeleton solver.
 */
export function applyTypologyPresetEdges(
  outline: RoofOutline,
  mode: TypologyPresetMode,
  options?: {
    bargeEdgeIds?: string[];
    lowEaveEdgeId?: string;
  }
): TypologyPresetEdgeResult {
  if (outline.edges.length === 0) {
    return { outline, skeleton: [], applied: false };
  }

  if (mode === 'hipped') {
    return {
      outline: {
        ...outline,
        edges: outline.edges.map((e) => ({ ...e, type: 'outline' }))
      },
      skeleton: [],
      applied: true
    };
  }

  if (mode === 'gable') {
    if (options?.bargeEdgeIds && options.bargeEdgeIds.length > 0) {
      const bargeSet = new Set(options.bargeEdgeIds);
      return {
        outline: {
          ...outline,
          edges: outline.edges.map((e) => ({
            ...e,
            type: bargeSet.has(e.id) ? 'verge' : 'outline'
          }))
        },
        skeleton: [],
        applied: true
      };
    }

    if (outline.edges.length === 4) {
      const edges = outline.edges;
      const len02 =
        (dist(edges[0].from, edges[0].to) + dist(edges[2].from, edges[2].to)) / 2;
      const len13 =
        (dist(edges[1].from, edges[1].to) + dist(edges[3].from, edges[3].to)) / 2;
      const bargeIndices = len02 >= len13 ? new Set([1, 3]) : new Set([0, 2]);
      return {
        outline: {
          ...outline,
          edges: edges.map((e, idx) => ({
            ...e,
            type: bargeIndices.has(idx) ? 'verge' : 'outline'
          }))
        },
        skeleton: [],
        applied: true
      };
    }

    return {
      outline,
      skeleton: [],
      applied: false,
      needsPick: 'two_barges'
    };
  }

  // Mono-pitch preset: low eave -> 'outline', opposite head edge -> 'ridge', perpendicular cheeks -> 'verge'
  const lowEdgeIdx = options?.lowEaveEdgeId
    ? outline.edges.findIndex((e) => e.id === options.lowEaveEdgeId)
    : -1;
  if (lowEdgeIdx < 0) {
    return {
      outline,
      skeleton: [],
      applied: false,
      needsPick: 'low_eave'
    };
  }

  const lowEdge = outline.edges[lowEdgeIdx];
  const lowDx = lowEdge.to.x - lowEdge.from.x;
  const lowDy = lowEdge.to.y - lowEdge.from.y;
  const lowLen = Math.hypot(lowDx, lowDy) || 1;
  const lowDir = { x: lowDx / lowLen, y: lowDy / lowLen };
  const lowMid = {
    x: (lowEdge.from.x + lowEdge.to.x) / 2,
    y: (lowEdge.from.y + lowEdge.to.y) / 2
  };
  const normA = { x: -lowDir.y, y: lowDir.x };
  const centroid =
    outline.points.length >= 3
      ? {
          x: outline.points.reduce((a, p) => a + p.x, 0) / outline.points.length,
          y: outline.points.reduce((a, p) => a + p.y, 0) / outline.points.length
        }
      : lowMid;
  const dotC = (centroid.x - lowMid.x) * normA.x + (centroid.y - lowMid.y) * normA.y;
  const inward = dotC >= 0 ? normA : { x: -normA.x, y: -normA.y };

  let oppositeIdx = -1;
  let bestScore = -Infinity;
  outline.edges.forEach((cand, idx) => {
    if (idx === lowEdgeIdx) return;
    const cDx = cand.to.x - cand.from.x;
    const cDy = cand.to.y - cand.from.y;
    const cLen = Math.hypot(cDx, cDy) || 1;
    const cDir = { x: cDx / cLen, y: cDy / cLen };
    const antiParallelDot = -(cDir.x * lowDir.x + cDir.y * lowDir.y);
    const cMid = {
      x: (cand.from.x + cand.to.x) / 2,
      y: (cand.from.y + cand.to.y) / 2
    };
    const inwardProj = (cMid.x - lowMid.x) * inward.x + (cMid.y - lowMid.y) * inward.y;
    if (antiParallelDot > 0.5) {
      const score = antiParallelDot * 10 + inwardProj;
      if (score > bestScore) {
        bestScore = score;
        oppositeIdx = idx;
      }
    }
  });
  if (oppositeIdx < 0 && outline.edges.length >= 3) {
    oppositeIdx = (lowEdgeIdx + Math.floor(outline.edges.length / 2)) % outline.edges.length;
  }

  return {
    outline: {
      ...outline,
      edges: outline.edges.map((e, idx) => ({
        ...e,
        type: idx === lowEdgeIdx ? 'outline' : idx === oppositeIdx ? 'ridge' : 'verge'
      }))
    },
    skeleton: [],
    applied: true
  };
}

export function applyRoofStylePreset(
  outline: RoofOutline,
  mode: TypologyPresetMode,
  options?: {
    edgesOnly?: boolean;
    bargeEdgeIds?: string[];
    lowEaveEdgeId?: string;
  }
): {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  needsPick?: 'two_barges' | 'low_eave';
} {
  if (outline.edges.length === 0) {
    return { outline, skeleton: [] };
  }

  if (options?.edgesOnly || mode === 'mono') {
    const res = applyTypologyPresetEdges(outline, mode, {
      bargeEdgeIds: options?.bargeEdgeIds,
      lowEaveEdgeId: options?.lowEaveEdgeId
    });
    return {
      outline: res.outline,
      skeleton: [],
      ...(res.needsPick ? { needsPick: res.needsPick } : {})
    };
  }

  if (mode === 'hipped') {
    const nextOutline: RoofOutline = {
      ...outline,
      edges: outline.edges.map((e) => ({ ...e, type: 'outline' }))
    };
    return {
      outline: nextOutline,
      skeleton: solveOutlineSkeletonViaPipeline(nextOutline)
    };
  }

  const longestEdge = [...outline.edges].sort(
    (a, b) => dist(b.from, b.to) - dist(a.from, a.to)
  )[0];
  const lLen = dist(longestEdge.from, longestEdge.to) || 1;
  const mainAxis = {
    x: (longestEdge.to.x - longestEdge.from.x) / lLen,
    y: (longestEdge.to.y - longestEdge.from.y) / lLen
  };

  let nextEdges: PlanEdge[] = outline.edges.map((e) => {
    const eLen = dist(e.from, e.to) || 1;
    const eDir = { x: (e.to.x - e.from.x) / eLen, y: (e.to.y - e.from.y) / eLen };
    const dot = Math.abs(eDir.x * mainAxis.x + eDir.y * mainAxis.y);
    return {
      ...e,
      type:
        e.type === 'wall' || e.type === 'apron'
          ? e.type
          : dot > 0.707
          ? 'outline'
          : isGableEdgeType(e.type)
          ? e.type
          : 'verge'
    };
  });

  if (nextEdges.filter((e) => !isStationaryEdgeType(e.type)).length < 1) {
    const topTwoIds = new Set(
      [...outline.edges]
        .sort((a, b) => dist(b.from, b.to) - dist(a.from, a.to))
        .slice(0, 2)
        .map((e) => e.id)
    );
    nextEdges = outline.edges.map((e) => ({
      ...e,
      type: topTwoIds.has(e.id) ? 'outline' : 'verge'
    }));
  }

  const nextOutline: RoofOutline = {
    ...outline,
    edges: nextEdges
  };
  return {
    outline: nextOutline,
    skeleton: solveOutlineSkeletonViaPipeline(nextOutline)
  };
}

export function toggleJunctionGable(
  outline: RoofOutline,
  skeleton: SkeletonLine[],
  targetIdOrPoint: string | Point2D
): {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  toggledTo: 'gable' | 'hipped' | null;
  junction?: RoofJunctionNode;
} {
  const nodes = getRoofJunctionNodes(outline, skeleton);
  const target =
    typeof targetIdOrPoint === 'string'
      ? nodes.find((n) => n.id === targetIdOrPoint)
      : nodes.find((n) => pointsClose(n.point, targetIdOrPoint, 0.75));

  if (!target) {
    if (typeof targetIdOrPoint === 'string' && targetIdOrPoint.startsWith('junction-')) {
      const edgeId = targetIdOrPoint.replace(/^junction-/, '');
      const res = toggleEdgeGable(outline, skeleton, edgeId);
      return {
        outline: res.outline,
        skeleton: res.skeleton,
        toggledTo: res.toggledTo
      };
    }
    return { outline, skeleton, toggledTo: null };
  }

  const forceMode: 'gable' | 'hipped' = target.mode === 'hipped' ? 'gable' : 'hipped';
  const res = toggleEdgeGable(outline, skeleton, target.eaveEdgeId, forceMode);
  return {
    outline: res.outline,
    skeleton: res.skeleton,
    toggledTo: res.toggledTo,
    junction: target
  };
}

export function getMultiLevelPreset(
  preset: RoofOutlinePresetKey,
  defaultPitchDeg = 22.5
): { levels: RoofLevel[]; planes: RoofPlane[] } {
  let levels: RoofLevel[] = [];

  if (preset === 'two_storey_split') {
    const lowerLevel = createRoofLevelWithSkeleton(
      1,
      'Lower Roof (1F)',
      2.7,
      [
        { x: 0, y: 5.5 },
        { x: 14, y: 5.5 },
        { x: 14, y: 10 },
        { x: 0, y: 10 }
      ],
      ['wall', 'verge', 'outline', 'verge']
    );
    const upperLevel = createRoofLevelWithSkeleton(
      2,
      'Upper Storey (2F)',
      5.4,
      [
        { x: 0, y: 0 },
        { x: 14, y: 0 },
        { x: 14, y: 6.2 },
        { x: 0, y: 6.2 }
      ],
      ['outline', 'outline', 'outline', 'outline']
    );
    levels = [lowerLevel, upperLevel];
  } else if (preset === 'cascading_terrace') {
    const tier1 = createRoofLevelWithSkeleton(
      1,
      'Lower Terrace',
      2.7,
      [
        { x: 0, y: 8 },
        { x: 14, y: 8 },
        { x: 14, y: 12 },
        { x: 0, y: 12 }
      ],
      ['wall', 'verge', 'outline', 'verge']
    );
    const tier2 = createRoofLevelWithSkeleton(
      2,
      'Mid Terrace',
      4.1,
      [
        { x: 0, y: 4 },
        { x: 14, y: 4 },
        { x: 14, y: 8 },
        { x: 0, y: 8 }
      ],
      ['wall', 'verge', 'outline', 'verge']
    );
    const tier3 = createRoofLevelWithSkeleton(
      3,
      'Upper Terrace',
      5.5,
      [
        { x: 0, y: 0 },
        { x: 14, y: 0 },
        { x: 14, y: 4 },
        { x: 0, y: 4 }
      ],
      ['wall', 'verge', 'outline', 'verge']
    );
    levels = [tier1, tier2, tier3];
  } else {
    const outline = getPresetOutline(preset);
    const skeleton = solveOutlineSkeletonViaPipeline(outline, 'level-1', 2.7);
    levels = [
      {
        id: 'level-1',
        code: 'L1',
        name: 'Main Roof',
        eaveHeightM: 2.7,
        outline: { ...outline, levelId: 'level-1' },
        skeleton: skeleton.map((s) => ({ ...s, levelId: 'level-1' }))
      }
    ];
  }

  const ensured = ensureFaces(createRoofPipelineState({ levels, planes: [], dirty: { faces: true } }), {
    defaultPitchDeg,
    preserveUserDeleted: true
  });
  return { levels: ensured.state.levels, planes: ensured.state.planes };
}

/**
 * Single-writer helper to initialize a preset roof state strictly through RoofPipeline.
 */
export function buildPresetPipelineState(
  presetKey: RoofOutlinePresetKey,
  defaultPitchDeg = 22.5
): RoofPipelineState {
  if (presetKey === 'two_storey_split' || presetKey === 'cascading_terrace') {
    const multi = getMultiLevelPreset(presetKey, defaultPitchDeg);
    return createRoofPipelineState({
      levels: multi.levels,
      planes: multi.planes,
      dirty: { skeleton: false, faces: false, layout: true, bom: true }
    });
  }

  const baseOutline = getPresetOutline(presetKey);
  const initLvl: RoofLevel = {
    id: 'level-1',
    code: 'L1',
    name: 'Main Roof',
    eaveHeightM: +(baseOutline.edges[0]?.eaveHeightM ?? 2.7).toFixed(2),
    outline: {
      ...baseOutline,
      levelId: 'level-1',
      edges: baseOutline.edges.map((e) => ({
        ...e,
        levelId: e.levelId ?? 'level-1',
        eaveHeightM: e.eaveHeightM ?? 2.7
      }))
    },
    skeleton: []
  };

  let pipe = createRoofPipelineState({ levels: [initLvl], planes: [] });
  pipe = ensureSkeleton(pipe, { mode: 'auto' }).state;

  if (presetKey === 'straight_gable') {
    let gableOut = pipe.levels[0].outline;
    let gableSkel = pipe.levels[0].skeleton;
    const res1 = toggleJunctionGable(gableOut, gableSkel, 'junction-edge-out-2');
    if (res1.toggledTo) {
      gableOut = res1.outline;
      gableSkel = res1.skeleton;
    }
    const res2 = toggleJunctionGable(gableOut, gableSkel, 'junction-edge-out-4');
    if (res2.toggledTo) {
      gableOut = res2.outline;
      gableSkel = res2.skeleton;
    }
    pipe = invalidateSkeleton(pipe, [
      {
        ...pipe.levels[0],
        outline: gableOut,
        skeleton: gableSkel
      }
    ]);
  }

  return ensureFaces(pipe, {
    defaultPitchDeg,
    preserveUserDeleted: true
  }).state;
}

/**
 * Ensures practical or optimized cutting layout from committed, deduplicated faces only.
 * If facesDirty is true and strictDirtyCheck === true, throws instead of computing stale BOM.
 */
export function ensureLayout(
  state: RoofPipelineState,
  params: {
    sheetSpec: SheetSpec;
    sheetOrderMode?: SheetOrderMode;
    startPlaneId?: string;
    startEdgeId?: string;
    assets?: RoofAsset[];
    pitchBreaks?: PitchBreakLine[];
    strictDirtyCheck?: boolean;
    defaultPitchDeg?: number;
    preserveUserDeleted?: boolean;
    maxInflationRatio?: number;
  }
): {
  state: RoofPipelineState;
  layout: LayoutResult | null;
  areaSanity: RoofAreaSanityResult;
} {
  let working = state;
  if (working.dirty.faces) {
    if (params.strictDirtyCheck) {
      throw new Error('RoofPipeline: faces are dirty; call ensureFaces() before ensureLayout().');
    }
    const rebuilt = ensureFaces(working, {
      defaultPitchDeg: params.defaultPitchDeg,
      preserveUserDeleted: params.preserveUserDeleted,
      maxInflationRatio: params.maxInflationRatio
    });
    working = rebuilt.state;
  }

  const cleanPlanes = deduplicateRoofPlanes(working.planes);
  const areaSanity = checkRoofAreaSanity(working.levels, cleanPlanes, {
    maxInflationRatio: params.maxInflationRatio
  });

  if (cleanPlanes.length === 0) {
    return {
      state: {
        ...working,
        planes: [],
        layout: null,
        dirty: { ...working.dirty, faces: false, layout: false, bom: true },
        areaSanity,
        lastBuildError: null
      },
      layout: null,
      areaSanity
    };
  }

  const layout = generateCuttingLayout(cleanPlanes, params.sheetSpec, {
    startPlaneId: params.startPlaneId,
    startEdgeId: params.startEdgeId,
    assets: params.assets,
    pitchBreaks: params.pitchBreaks,
    sheetOrderMode: params.sheetOrderMode ?? 'practical'
  });

  return {
    state: {
      ...working,
      planes: cleanPlanes,
      layout,
      dirty: {
        ...working.dirty,
        faces: false,
        layout: false,
        bom: true
      },
      areaSanity,
      lastBuildError: null
    },
    layout,
    areaSanity
  };
}

/**
 * Computes Practical vs Optimized sheet-order comparison strictly through RoofPipeline ensureLayout().
 */
export function computeSheetOrderComparisonViaPipeline(params: {
  levels: RoofLevel[];
  planes: RoofPlane[];
  sheetSpec: SheetSpec;
  currentLayout?: LayoutResult | null;
  startPlaneId?: string;
  assets?: RoofAsset[];
  pitchBreaks?: PitchBreakLine[];
}): SheetOrderComparisonSummary | undefined {
  const cleanPlanes = deduplicateRoofPlanes(params.planes);
  if (cleanPlanes.length === 0) return undefined;

  const baseState = createRoofPipelineState({
    levels: params.levels,
    planes: cleanPlanes,
    dirty: { faces: false, layout: true, bom: true }
  });

  const prac =
    params.currentLayout && (params.currentLayout.sheetOrderMode || 'practical') === 'practical'
      ? params.currentLayout
      : ensureLayout(baseState, {
          sheetSpec: params.sheetSpec,
          startPlaneId: params.startPlaneId,
          assets: params.assets,
          pitchBreaks: params.pitchBreaks,
          sheetOrderMode: 'practical',
          strictDirtyCheck: true
        }).layout;

  const opt =
    params.currentLayout && params.currentLayout.sheetOrderMode === 'optimized'
      ? params.currentLayout
      : ensureLayout(baseState, {
          sheetSpec: params.sheetSpec,
          startPlaneId: params.startPlaneId,
          assets: params.assets,
          pitchBreaks: params.pitchBreaks,
          sheetOrderMode: 'optimized',
          strictDirtyCheck: true
        }).layout;

  if (!prac || !opt) return undefined;
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
}

/**
 * Ensures BOM & optional OrderPack strictly after faces + layout are clean and area-sanity checked.
 */
export function ensureBom(
  state: RoofPipelineState,
  params: {
    sheetSpec: SheetSpec;
    sheetOrderMode?: SheetOrderMode;
    comparisonSummary?: SheetOrderComparisonSummary;
    startPlaneId?: string;
    startEdgeId?: string;
    assets?: RoofAsset[];
    pitchBreaks?: PitchBreakLine[];
    assignments?: RoofFlashingAssignment[];
    assignableLines?: AssignableRoofLine[];
    strictDirtyCheck?: boolean;
    strictAreaSanity?: boolean;
    maxInflationRatio?: number;
    project?: Project | null;
    libraryProfiles?: FlashingProfile[];
    wallPlan?: WallPlan | null;
    completenessReport?: TakeoffCompletenessReport;
    locked?: boolean;
    confirmedAt?: string;
    confirmedBy?: string;
    roofProfileFamily?: RoofProfileFamily;
    ventedRidge?: VentedRidgeOption;
    ruleSetVersion?: number;
    ruleSetCapturedAt?: string;
    ruleSetRevision?: string;
  }
): {
  state: RoofPipelineState;
  bom: RoofBomSummary;
  orderPack: OrderPack | null;
  areaSanity: RoofAreaSanityResult;
} {
  let working = state;
  if (working.dirty.faces || working.dirty.layout || (working.planes.length > 0 && !working.layout)) {
    const ensured = ensureLayout(working, {
      sheetSpec: params.sheetSpec,
      sheetOrderMode: params.sheetOrderMode,
      startPlaneId: params.startPlaneId,
      startEdgeId: params.startEdgeId,
      assets: params.assets,
      pitchBreaks: params.pitchBreaks,
      strictDirtyCheck: params.strictDirtyCheck,
      maxInflationRatio: params.maxInflationRatio
    });
    working = ensured.state;
  }

  const areaSanity = checkRoofAreaSanity(working.levels, working.planes, {
    maxInflationRatio: params.maxInflationRatio
  });
  if (params.strictAreaSanity && !areaSanity.ok) {
    throw new Error(
      areaSanity.warning ||
        'RoofPipeline: area sanity check failed — resolve overlapping or duplicate roof faces before BOM lock/push.'
    );
  }

  const bom = buildRoofBillOfMaterials({
    planes: working.planes,
    levels: working.levels,
    layout: working.layout,
    assignments: params.assignments || [],
    assignableLines: params.assignableLines || [],
    assets: params.assets || [],
    sheetOrderMode: params.sheetOrderMode,
    comparisonSummary: params.comparisonSummary,
    maxInflationRatio: params.maxInflationRatio
  });

  if (areaSanity.warning && !bom.areaSanityWarning) {
    bom.areaSanityWarning = areaSanity.warning;
  }

  let orderPack: OrderPack | null = working.orderPack;
  if (params.libraryProfiles) {
    orderPack = buildOrderPack({
      project: params.project ?? undefined,
      planes: working.planes,
      levels: working.levels,
      layout: working.layout,
      bom,
      assignableLines: params.assignableLines || [],
      assignments: params.assignments || [],
      libraryProfiles: params.libraryProfiles,
      assets: params.assets || [],
      wallPlan: params.wallPlan,
      completenessReport: params.completenessReport,
      locked: params.locked,
      confirmedAt: params.confirmedAt,
      confirmedBy: params.confirmedBy,
      sheetOrderMode: params.sheetOrderMode,
      comparisonSummary: params.comparisonSummary,
      roofProfileFamily: params.roofProfileFamily,
      ventedRidge: params.ventedRidge,
      ruleSetVersion: params.ruleSetVersion,
      ruleSetCapturedAt: params.ruleSetCapturedAt,
      ruleSetRevision: params.ruleSetRevision
    });
  }

  return {
    state: {
      ...working,
      bom,
      orderPack,
      dirty: {
        ...working.dirty,
        bom: false
      },
      areaSanity,
      lastBuildError: null
    },
    bom,
    orderPack,
    areaSanity
  };
}

/**
 * Safe OrderPack read/build wrapper via RoofPipeline so UI components never import buildOrderPack directly.
 */
export function buildOrderPackViaPipeline(params: {
  project?: Project | null;
  planes: RoofPlane[];
  levels?: RoofLevel[];
  layout: LayoutResult | null;
  bom: RoofBomSummary;
  assignableLines: AssignableRoofLine[];
  assignments: RoofFlashingAssignment[];
  libraryProfiles: FlashingProfile[];
  assets?: RoofAsset[];
  wallPlan?: WallPlan | null;
  completenessReport?: TakeoffCompletenessReport;
  locked?: boolean;
  confirmedAt?: string;
  confirmedBy?: string;
  sheetOrderMode?: SheetOrderMode;
  comparisonSummary?: SheetOrderComparisonSummary;
  roofProfileFamily?: RoofProfileFamily;
  ventedRidge?: VentedRidgeOption;
  ruleSetVersion?: number;
  ruleSetCapturedAt?: string;
  ruleSetRevision?: string;
}): OrderPack {
  const cleanPlanes = deduplicateRoofPlanes(params.planes);
  return buildOrderPack({
    project: params.project ?? undefined,
    planes: cleanPlanes,
    levels: params.levels,
    layout: params.layout,
    bom: params.bom,
    assignableLines: params.assignableLines,
    assignments: params.assignments,
    libraryProfiles: params.libraryProfiles,
    assets: params.assets,
    wallPlan: params.wallPlan,
    completenessReport: params.completenessReport,
    locked: params.locked,
    confirmedAt: params.confirmedAt,
    confirmedBy: params.confirmedBy,
    sheetOrderMode: params.sheetOrderMode,
    comparisonSummary: params.comparisonSummary,
    roofProfileFamily: params.roofProfileFamily,
    ventedRidge: params.ventedRidge,
    ruleSetVersion: params.ruleSetVersion,
    ruleSetCapturedAt: params.ruleSetCapturedAt,
    ruleSetRevision: params.ruleSetRevision
  });
}

const yieldEventLoopTick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Cooperative, abortable async wrapper around RoofPipeline operations so multi-body / courtyard builds
 * yield back to the browser UI thread between levels and honor AbortSignal cancellation cleanly.
 */
export async function runRoofPipelineBuildAsync(params: {
  state: RoofPipelineState;
  action: 'auto_skeleton' | 'build_faces' | 'full_layout';
  targetLevelIds?: string[];
  sheetSpec?: SheetSpec;
  sheetOrderMode?: SheetOrderMode;
  startPlaneId?: string;
  assets?: RoofAsset[];
  pitchBreaks?: PitchBreakLine[];
  defaultPitchDeg?: number;
  preserveUserDeleted?: boolean;
  allowAutoSkeletonWhenEmpty?: boolean;
  signal?: AbortSignal;
  onProgress?: (stage: string, pct: number) => void;
}): Promise<{
  state: RoofPipelineState;
  createdCount: number;
  generatedLinesCount: number;
  areaSanity: RoofAreaSanityResult;
}> {
  const { signal, onProgress } = params;
  const checkAborted = () => {
    if (signal?.aborted) {
      throw new Error('Roof build cancelled');
    }
  };

  checkAborted();
  assertRoofDomainComplexity(params.state.levels, MAX_ROOF_DOMAIN_VERTICES);
  onProgress?.('Validating roof geometry…', 15);
  await yieldEventLoopTick();
  checkAborted();

  let working = params.state;
  let generatedLinesCount = 0;
  let createdCount = 0;

  if (params.action === 'auto_skeleton') {
    const targetIds =
      params.targetLevelIds ||
      working.levels.filter((l) => l.outline.points.length >= 3).map((l) => l.id);

    for (let idx = 0; idx < targetIds.length; idx++) {
      checkAborted();
      const lid = targetIds[idx];
      onProgress?.(
        `Solving roof lines (${idx + 1}/${targetIds.length})…`,
        25 + Math.round(((idx + 1) / Math.max(1, targetIds.length)) * 35)
      );
      const skelRes = ensureSkeleton(working, {
        mode: 'auto',
        targetLevelIds: [lid]
      });
      working = skelRes.state;
      generatedLinesCount += skelRes.generatedCount;
      await yieldEventLoopTick();
    }
  }

  checkAborted();
  onProgress?.('Building closed roof faces…', 70);
  const facesRes = ensureFaces(working, {
    defaultPitchDeg: params.defaultPitchDeg ?? 22.5,
    preserveUserDeleted:
      params.action === 'build_faces' ? false : params.preserveUserDeleted,
    allowAutoSkeletonWhenEmpty:
      params.allowAutoSkeletonWhenEmpty ?? (params.action === 'build_faces')
  });
  working = facesRes.state;
  createdCount = facesRes.createdCount;
  await yieldEventLoopTick();
  checkAborted();

  if (params.action === 'full_layout' && params.sheetSpec) {
    onProgress?.('Optimizing sheet lengths…', 90);
    const layRes = ensureLayout(working, {
      sheetSpec: params.sheetSpec,
      sheetOrderMode: params.sheetOrderMode ?? 'practical',
      startPlaneId: params.startPlaneId,
      assets: params.assets,
      pitchBreaks: params.pitchBreaks
    });
    working = layRes.state;
  }

  onProgress?.('Done', 100);
  return {
    state: working,
    createdCount,
    generatedLinesCount,
    areaSanity: working.areaSanity
  };
}

export interface RunTakeoffPlaybookContext {
  sheetSpec: SheetSpec;
  sheetOrderMode?: SheetOrderMode;
  defaultPitchDeg?: number;
  preserveUserDeleted?: boolean;
  maxInflationRatio?: number;
  startPlaneId?: string;
  startEdgeId?: string;
  assets?: RoofAsset[];
  pitchBreaks?: PitchBreakLine[];
  wallPlan?: WallPlan | null;
  project?: Project | null;
  flashingContext: FlashingRuleContext;
  libraryProfiles: FlashingProfile[];
  ruleSet?: FlashingRuleSet;
  existingAssignments?: RoofFlashingAssignment[];
  locked?: boolean;
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface RunTakeoffPlaybookResult {
  ok: boolean;
  stage: 'skeleton' | 'faces' | 'layout' | 'flashings' | 'bom' | 'complete';
  state: RoofPipelineState;
  layout: LayoutResult | null;
  bom: RoofBomSummary | null;
  orderPack: OrderPack | null;
  assignableLines: AssignableRoofLine[];
  assignments: RoofFlashingAssignment[];
  appliedRuleIds: string[];
  unresolvedLineIds: string[];
  completenessReport: TakeoffCompletenessReport | null;
  ruleSetRevision: string | null;
  ruleSnapshot: {
    ruleSetVersion: number;
    ruleSetCapturedAt: string;
    ruleSetRevision: string;
    appliedRulesSnapshot: FlashingRuleSet;
  } | null;
  areaSanity: RoofAreaSanityResult;
}

/**
 * Part E Deterministic Takeoff Playbook:
 * ensureSkeleton (only if closed level lacks structural skeleton)
 *   -> ensureFaces (preserveUserDeleted: true)
 *   -> areaSanity guard (aborts cleanly at stage 'faces' before layout if failed)
 *   -> ensureLayout (practical default)
 *   -> assignStandardFlashings (preserving source === 'user')
 *   -> ensureBom(strictAreaSanity: true) + Order Pack stamped with ruleSetRevision
 */
export function runTakeoffPlaybook(
  state: RoofPipelineState,
  context: RunTakeoffPlaybookContext
): RunTakeoffPlaybookResult {
  assertRoofDomainComplexity(state.levels, MAX_ROOF_DOMAIN_VERTICES);

  let working = state;
  const levelsNeedingSkeleton = working.levels
    .filter((lvl) => {
      if (lvl.outline.points.length < 3) return false;
      if (hasStructuralSkeleton(lvl.skeleton)) return false;
      const allEdges = getAllOutlineEdges(lvl.outline);
      const hasClassifiedEave = allEdges.some((e) => e.type === 'outline');
      const activeEaves = allEdges.filter((e) =>
        !hasClassifiedEave && e.type === 'unclassified' ? true : e.type === 'outline'
      ).length;
      return activeEaves >= 2;
    })
    .map((l) => l.id);

  if (levelsNeedingSkeleton.length > 0) {
    working = ensureSkeleton(working, {
      mode: 'auto',
      targetLevelIds: levelsNeedingSkeleton
    }).state;
  }

  if (!working.dirty.faces && working.planes.length > 0) {
    const preSanity = checkRoofAreaSanity(working.levels, working.planes, {
      maxInflationRatio: context.maxInflationRatio
    });
    if (!preSanity.ok) {
      return {
        ok: false,
        stage: 'faces',
        state: {
          ...working,
          layout: null,
          bom: null,
          orderPack: null,
          areaSanity: preSanity,
          lastBuildError: preSanity.warning || 'Area sanity check failed'
        },
        layout: null,
        bom: null,
        orderPack: null,
        assignableLines: [],
        assignments: context.existingAssignments || [],
        appliedRuleIds: [],
        unresolvedLineIds: [],
        completenessReport: null,
        ruleSetRevision: null,
        ruleSnapshot: null,
        areaSanity: preSanity
      };
    }
  }

  const facesRes = ensureFaces(working, {
    defaultPitchDeg: context.defaultPitchDeg ?? 22.5,
    preserveUserDeleted: context.preserveUserDeleted ?? true,
    allowAutoSkeletonWhenEmpty: false,
    maxInflationRatio: context.maxInflationRatio
  });
  working = facesRes.state;

  if (!facesRes.areaSanity.ok) {
    return {
      ok: false,
      stage: 'faces',
      state: {
        ...working,
        layout: null,
        bom: null,
        orderPack: null,
        lastBuildError: facesRes.areaSanity.warning || 'Area sanity check failed'
      },
      layout: null,
      bom: null,
      orderPack: null,
      assignableLines: [],
      assignments: context.existingAssignments || [],
      appliedRuleIds: [],
      unresolvedLineIds: [],
      completenessReport: null,
      ruleSetRevision: null,
      ruleSnapshot: null,
      areaSanity: facesRes.areaSanity
    };
  }

  const sheetOrderMode: SheetOrderMode = context.sheetOrderMode ?? 'practical';
  const layoutRes = ensureLayout(working, {
    sheetSpec: context.sheetSpec,
    sheetOrderMode,
    startPlaneId: context.startPlaneId,
    startEdgeId: context.startEdgeId,
    assets: context.assets,
    pitchBreaks: context.pitchBreaks,
    strictDirtyCheck: true,
    maxInflationRatio: context.maxInflationRatio
  });
  working = layoutRes.state;

  const assignableLines = getAssignableRoofLinesMultiLevel(
    working.levels,
    working.planes,
    context.assets || [],
    context.pitchBreaks || []
  );

  const flashRes = assignStandardFlashings(
    assignableLines,
    context.flashingContext,
    context.libraryProfiles,
    context.ruleSet,
    context.existingAssignments || []
  );

  const capturedAt = new Date().toISOString();
  const ruleSetRevision = capturedAt;
  const completenessReport = evaluateTakeoffCompleteness({
    levels: working.levels,
    planes: working.planes,
    assignableLines,
    flashingAssignments: flashRes.assignments,
    wallPlan: context.wallPlan ?? null,
    assets: context.assets || [],
    areaSanity: layoutRes.areaSanity,
    outOfScopeLineIds: context.flashingContext.outOfScopeLineIds,
    outOfScopeKinds: context.flashingContext.outOfScopeKinds
  });

  const bomRes = ensureBom(working, {
    sheetSpec: context.sheetSpec,
    sheetOrderMode,
    startPlaneId: context.startPlaneId,
    startEdgeId: context.startEdgeId,
    assets: context.assets,
    pitchBreaks: context.pitchBreaks,
    assignments: flashRes.assignments,
    assignableLines,
    strictDirtyCheck: true,
    strictAreaSanity: true,
    maxInflationRatio: context.maxInflationRatio,
    project: context.project,
    libraryProfiles: context.libraryProfiles,
    wallPlan: context.wallPlan,
    completenessReport,
    locked: context.locked,
    confirmedAt: context.confirmedAt,
    confirmedBy: context.confirmedBy,
    roofProfileFamily: context.flashingContext.roofProfileFamily,
    ventedRidge: context.flashingContext.ventedRidge,
    ruleSetVersion: flashRes.ruleSet.version,
    ruleSetCapturedAt: capturedAt,
    ruleSetRevision
  });

  return {
    ok: true,
    stage: 'complete',
    state: bomRes.state,
    layout: bomRes.state.layout,
    bom: bomRes.bom,
    orderPack: bomRes.orderPack,
    assignableLines,
    assignments: flashRes.assignments,
    appliedRuleIds: flashRes.appliedRuleIds,
    unresolvedLineIds: flashRes.unresolvedLineIds,
    completenessReport,
    ruleSetRevision,
    ruleSnapshot: {
      ruleSetVersion: flashRes.ruleSet.version,
      ruleSetCapturedAt: capturedAt,
      ruleSetRevision,
      appliedRulesSnapshot: flashRes.ruleSet
    },
    areaSanity: bomRes.areaSanity
  };
}

