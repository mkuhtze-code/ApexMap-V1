import {
  AssignableRoofLine,
  LayoutResult,
  OrderPack,
  PitchBreakLine,
  PlanEdge,
  RoofAsset,
  RoofBomSummary,
  RoofFlashingAssignment,
  RoofLevel,
  RoofOutline,
  RoofOutlinePresetKey,
  RoofPlane,
  SheetOrderComparisonSummary,
  SheetOrderMode,
  SheetSpec,
  TakeoffCompletenessReport,
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
  deduplicateRoofPlanes,
  deleteRoofPlanes,
  generateCuttingLayout,
  generateSkeletonLines,
  getAllOutlineEdges,
  getMultiLevelPreset,
  getOutlineFootprintAreaM2,
  getPresetOutline,
  isStationaryEdgeType,
  mergeColinearRidgeLines,
  polygonArea,
  syncMultiLevelPlanes,
  toggleJunctionGable
} from './exactRoofingEngine';
import { buildOrderPack, buildRoofBillOfMaterials } from './exactRoofingBomBridge';

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

  const maxPitchDeg = Math.min(
    72,
    Math.max(1, ...structuralPlanes.map((p) => (Number.isFinite(p.pitchDeg) ? p.pitchDeg : 22.5)))
  );
  const cosMin = Math.max(0.3, Math.cos((maxPitchDeg * Math.PI) / 180));
  const tolArea = Math.min(4, footprintAreaM2 * 0.08);
  const expectedMaxAreaM2 = +((footprintAreaM2 / cosMin) * maxInflationRatio + tolArea).toFixed(2);
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
    reportedModeled / Math.max(0.1, footprintAreaM2 / cosMin)
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

  const built = buildFacesFromClassification(state.levels, state.planes, defaultPitch, {
    allowAutoSkeletonWhenEmpty: options?.allowAutoSkeletonWhenEmpty
  });
  const dedupedPlanes = deduplicateRoofPlanes(built.planes);
  const areaSanity = checkRoofAreaSanity(built.levels, dedupedPlanes, {
    maxInflationRatio: options?.maxInflationRatio
  });

  return {
    state: {
      ...state,
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
      comparisonSummary: params.comparisonSummary
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
    comparisonSummary: params.comparisonSummary
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
    allowAutoSkeletonWhenEmpty: params.allowAutoSkeletonWhenEmpty
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
