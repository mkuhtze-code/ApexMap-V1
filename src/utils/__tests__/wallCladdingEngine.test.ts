import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  addWingWallToPlan,
  analyzeWallPlanTopology,
  applyCladdingToFacets,
  applyHeightToFacets,
  applyKindToFacets,
  batchUpdateWallFacetsInPlan,
  buildWallEdgesFromPoints,
  buildWallFacetsFromPlan,
  buildWallOpeningsSchedule,
  buildWallTakeoffExportData,
  calibrateUnderlayFromTwoPoints,
  clampWallOpeningToFacet,
  computeWallFacetMetrics,
  computeWallTakeoffSummary,
  createDefaultWallOpening,
  createHorizontalBandSplit,
  createHorizontalDadoSplit,
  createSecondaryZoneFromVoid,
  createVerticalBaySplit,
  deriveRoofOutlineFromWallPlan,
  deriveWallPlanFromRoofLevels,
  duplicateWallOpening,
  ensureUniqueWallFacetIds,
  findOpeningOverlaps,
  fitWallFacetTopToRoof,
  isWallFacetUndetailed,
  linkWallFacetsToRoofLevels,
  mergePreservedExtraFacets,
  removeSecondaryZone,
  resolveOpeningOverlap,
  sanitizeWallOpeningsForExtrusion,
  splitWallFacetInPlan,
  switchWallOpeningType,
  syncWallPlanWithRoof,
  updateSecondaryZoneDepth,
  updateWallFacetKind,
  updateWallPlanEdgeLength
} from '../wallCladdingEngine';
import {
  applyEdgeType,
  buildOutlineFromPoints,
  createRoofLevel,
  deriveRoofWallSegments,
  generateCuttingLayout,
  generateSkeletonLines,
  getPresetOutline,
  syncMultiLevelPlanes
} from '../exactRoofingEngine';
import {
  applyRoofStylePreset,
  createRoofLevelWithSkeleton,
  getMultiLevelPreset
} from '../roofPipeline';
import type { WallPlan } from '../../types/exactRoofing';
import { evaluateTakeoffCompleteness } from '../takeoffCompleteness';
import { buildOrderPack, exportOrderPackToCsv } from '../exactRoofingBomBridge';
import { buildWallPlan3DGroup } from '../../components/exactroofing/three/wallMeshBuilder';
import { buildRoofSceneGroup } from '../../components/exactroofing/three/roofMeshBuilder';

console.log('--- Starting Wall Cladding Phase 1 & Phase 2 Engine Tests ---');

// 1. U-shape courtyard with deep re-entrant notch (8 edges, including 2 notch returns + recess)
const uShapePoints = [
  { x: 0, y: 0 },
  { x: 14, y: 0 },
  { x: 14, y: 8 },
  { x: 9, y: 8 },
  { x: 9, y: 4.5 }, // Notch return 1 (3.5m)
  { x: 5, y: 4.5 }, // Notch back wall (4.0m)
  { x: 5, y: 8 }, // Notch return 2 (3.5m)
  { x: 0, y: 8 }
];

const uFacets = buildWallFacetsFromPlan({ points: uShapePoints }, { defaultHeightM: 2.7 });
assert.equal(uFacets.length, 8, 'Every exterior edge including re-entrant notch returns must become a WallFacet');
assert.deepEqual(
  uFacets.map((f) => f.code),
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
);
// Verify hidden notch return lengths are exact (indices 3=D, 4=E, 5=F)
assert.equal(uFacets[3].lengthM, 3.5);
assert.equal(uFacets[4].lengthM, 4.0);
assert.equal(uFacets[5].lengthM, 3.5);
assert.equal(uFacets[0].heightM, 2.7);
console.log('✓ Test 1 Passed: U-notch returns preserved (8/8 facets A..H)');

// 2. Safe collinear run merging without losing 90-degree corners or 0.45m nibs
const splitCollinearPoints = [
  { x: 0, y: 0 },
  { x: 5, y: 0 },
  { x: 12, y: 0 }, // strictly collinear along +X -> should merge into 12m
  { x: 12, y: 6 },
  { x: 8, y: 6 },
  { x: 8, y: 6.45 }, // 0.45m nib return -> MUST NOT drop
  { x: 0, y: 6.45 }
];
const mergedFacets = buildWallFacetsFromPlan({ points: splitCollinearPoints });
assert.equal(mergedFacets.length, 6, 'Collinear split merges cleanly while keeping 0.45m nib return');
assert.equal(mergedFacets[0].lengthM, 12);
assert.equal(mergedFacets[3].lengthM, 0.45);
console.log('✓ Test 2 Passed: Safe collinear merging preserves 0.45m return nib');

// 3. Preserving per-face cladding, openings, underlays, & mixed regions on rebuild
const initialPlanEdges = buildWallEdgesFromPoints(uShapePoints, 'wall-edge');
const sampleUnderlay = {
  id: 'ul-1',
  name: 'North Elevation Scan',
  imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
  imageAspect: 2.0,
  worldWidthM: 14.0,
  worldHeightM: 7.0,
  offsetXM: 0,
  offsetYM: 0,
  opacity: 0.45,
  visible: true,
  calibrationMode: 'two_point' as const
};
const detailedFacets = uFacets.map((f, idx) => {
  if (idx === 0) {
    return {
      ...f,
      claddingType: 'weatherboard' as const,
      underlay: sampleUnderlay,
      regions: createHorizontalDadoSplit(f, 1.2, 'brick', 'weatherboard'),
      openings: [
        createDefaultWallOpening(f, 'door', 1.2),
        createDefaultWallOpening(f, 'window', 4.5)
      ]
    };
  }
  if (idx === 4) {
    // Hidden notch back wall (E: 4.0m) detailed as brick + 1 window
    return {
      ...f,
      claddingType: 'brick' as const,
      openings: [createDefaultWallOpening(f, 'window', 1.0)]
    };
  }
  return f;
});

const rebuiltFacets = buildWallFacetsFromPlan(
  { points: uShapePoints, edges: initialPlanEdges },
  { defaultHeightM: 2.7, existingFacets: detailedFacets }
);
assert.equal(rebuiltFacets[0].claddingType, 'weatherboard');
assert.equal(rebuiltFacets[0].openings.length, 2);
assert.equal(rebuiltFacets[0].underlay?.name, 'North Elevation Scan');
assert.equal(rebuiltFacets[0].regions?.length, 2);
assert.equal(rebuiltFacets[4].claddingType, 'brick');
assert.equal(rebuiltFacets[4].openings.length, 1);
assert.equal(rebuiltFacets[1].claddingType, 'none');
console.log('✓ Test 3 Passed: Facet cladding, openings, underlay, & regions survive rebuild');

// 4. Parametric opening clamping & Area-by-cladding summary math
const smallFacet = { ...rebuiltFacets[3], lengthM: 2.0, heightM: 2.4 };
const oversizedOpening = clampWallOpeningToFacet(smallFacet, {
  id: 'op-big',
  type: 'garage',
  distFromStartM: 1.5,
  sillHeightM: 0,
  widthM: 3.0,
  heightM: 2.8
});
assert.equal(oversizedOpening.widthM, 2.0);
assert.equal(oversizedOpening.heightM, 2.4);
assert.equal(oversizedOpening.distFromStartM, 0);

const facetMetrics = computeWallFacetMetrics(rebuiltFacets[4]); // 4.0m x 2.7m = 10.8m2 gross - 1.5x1.2 (1.8m2) = 9.0m2 net
assert.equal(facetMetrics.grossAreaM2, 10.8);
assert.equal(facetMetrics.openingsAreaM2, 1.8);
assert.equal(facetMetrics.netCladdingAreaM2, 9.0);

const summary = computeWallTakeoffSummary(rebuiltFacets);
assert.equal(summary.totalFaces, 8);
assert.equal(summary.undetailedCount, 6);
assert.equal(summary.totalOpeningsCount, 3);
const brickGroup = summary.byCladding.find((g) => g.claddingType === 'brick');
assert.ok(brickGroup);
assert.ok(brickGroup.netAreaM2 > 9.0, 'Brick total should include both notch wall E and Dado lower region of A');
console.log('✓ Test 4 Passed: Opening bounds & cladding area summary reconcile accurately');

// 5. Roof footprint derivation with eave setback + roofEdgeId linking + edge length edit
const rectOutline = getPresetOutline('rectangle_14x10');
rectOutline.edges = rectOutline.edges.map((e) => ({ ...e, hasWall: true, eaveSetbackM: 0.45 }));
const rectLvl = createRoofLevel(1, 'Main Roof', 2.7, rectOutline.points);
rectLvl.outline = rectOutline;
rectLvl.skeleton = generateSkeletonLines(rectOutline);

const derivedPlan = deriveWallPlanFromRoofLevels([rectLvl], 2.7);
assert.ok(derivedPlan, 'Should derive wall plan from roof levels');
assert.equal(derivedPlan.facets.length, 4);
// 14m - 2*0.45m = 13.10m; 10m - 2*0.45m = 9.10m
assert.equal(derivedPlan.facets[0].lengthM, 13.1);
assert.equal(derivedPlan.facets[1].lengthM, 9.1);
assert.ok(derivedPlan.facets.every((f) => Boolean(f.roofEdgeId)), 'All 4 walls link back to roof edges');
assert.ok(derivedPlan.facets.every((f) => f.heightSource === 'roof'), 'Derived walls default to roof-linked heightSource');

// Add an opening to facet A and update edge length to 15.0m -> opening & cladding preserved
const withOp = {
  ...derivedPlan,
  facets: derivedPlan.facets.map((f, idx) =>
    idx === 0
      ? {
          ...f,
          claddingType: 'profiled_metal' as const,
          openings: [createDefaultWallOpening(f, 'window', 2.0)]
        }
      : f
  )
};
const resizedPlan = updateWallPlanEdgeLength(withOp, withOp.edges[0].id, 15.0, [rectLvl]);
assert.equal(resizedPlan.facets[0].lengthM, 15.0);
assert.equal(resizedPlan.facets[0].claddingType, 'profiled_metal');
assert.equal(resizedPlan.facets[0].openings.length, 1);
console.log('✓ Test 5 Passed: Roof setback derivation (0.45m eave) & edge resizing preserve wall details');

// --- Phase 2 Tests ---

// 6. Phase 2: Elevation Underlay 2-Point Calibration Math
const cal = calibrateUnderlayFromTwoPoints({
  imageAspect: 2.0,
  p1Norm: { x: 0.1, y: 0.5 },
  p2Norm: { x: 0.6, y: 0.5 }, // 50% of image width spans 5.0m -> full image width = 10.0m, height = 5.0m
  knownDistanceM: 5.0,
  facetLengthM: 10.0,
  facetHeightM: 2.7
});
assert.equal(cal.worldWidthM, 10.0);
assert.equal(cal.worldHeightM, 5.0);
console.log('✓ Test 6 Passed: Elevation 2-point underlay calibration solves real-world scale accurately');

// 7. Phase 2: Roof-Wall Vertical Link + Gable Rake Profile + Manual Override Preservation
const rawGableOutline = getPresetOutline('straight_gable');
rawGableOutline.edges = rawGableOutline.edges.map((e) => ({ ...e, hasWall: true, eaveSetbackM: 0.45 }));
const gablePreset = applyRoofStylePreset(rawGableOutline, 'gable');
const gableLvl = createRoofLevel(1, 'Gable House', 3.0, gablePreset.outline.points);
gableLvl.outline = {
  ...gablePreset.outline,
  edges: gablePreset.outline.edges.map((e) => ({ ...e, eaveHeightM: 3.0 }))
};
gableLvl.skeleton = gablePreset.skeleton;
const gablePlanes = syncMultiLevelPlanes([gableLvl], [], 22.5);

const gableWalls = deriveWallPlanFromRoofLevels([gableLvl], 2.7, undefined, gablePlanes);
assert.ok(gableWalls, 'Gable roof should derive wall plan');
const vergeEdgeIds = new Set(
  gableLvl.outline.edges.filter((e) => e.type === 'verge').map((e) => e.id)
);
const gableWall = gableWalls.facets.find((f) => f.roofEdgeId && vergeEdgeIds.has(f.roofEdgeId));
assert.ok(gableWall, 'Should match a gable end wall facet');
assert.ok(
  gableWall.roofProfile && gableWall.roofProfile.length >= 3,
  'Gable end wall synced to roof must carry a raked roofProfile contour'
);
assert.ok(gableWall.topZ > 3.1, 'Gable apex topZ rises above 3.0m eave');

// Raise roof eave height from 3.0m -> 3.6m; keep Facet A as 'roof' and Facet B as 'manual'
const editedWalls = {
  ...gableWalls,
  facets: gableWalls.facets.map((f, idx) =>
    idx === 1
      ? {
          ...f,
          heightSource: 'manual' as const,
          heightM: 2.55,
          topZ: 2.55,
          claddingType: 'weatherboard' as const
        }
      : { ...f, claddingType: 'profiled_metal' as const }
  )
};
const raisedLvl = {
  ...gableLvl,
  eaveHeightM: 3.6,
  outline: {
    ...gableLvl.outline,
    edges: gableLvl.outline.edges.map((e) => ({ ...e, eaveHeightM: 3.6 }))
  }
};
const raisedPlanes = syncMultiLevelPlanes([raisedLvl], gablePlanes, 22.5);
const syncedWalls = syncWallPlanWithRoof(editedWalls, [raisedLvl], raisedPlanes);

const expectedSetbackTopZ = 3.6 + 0.45 * Math.tan((22.5 * Math.PI) / 180) - 0.025;
assert.ok(
  Math.abs(syncedWalls.facets[0].topZ - expectedSetbackTopZ) < 0.04,
  `Roof-linked wall at 0.45m setback should update to ~${expectedSetbackTopZ.toFixed(3)}m (got ${syncedWalls.facets[0].topZ})`
);
assert.equal(syncedWalls.facets[1].heightM, 2.55, 'Manual height override must NOT be overwritten');
assert.equal(syncedWalls.facets[1].heightSource, 'manual');

// Explicit per-face "Fit Top to Roof Eave" overrides manual back to roof
const refitted = fitWallFacetTopToRoof(syncedWalls.facets[1], [raisedLvl], raisedPlanes);
assert.equal(refitted.heightSource, 'roof');
assert.ok(refitted.topZ > 3.5);
console.log('✓ Test 7 Passed: Roof-wall vertical sync updates roof-linked walls & gable rakes while protecting manual overrides');

// 8. Phase 2: Corners & Returns Topology Analysis (U-Notch)
const topology = analyzeWallPlanTopology(uFacets);
assert.equal(topology.externalCornersCount, 6, 'U-shape has 6 external corners');
assert.equal(topology.internalCornersCount, 2, 'U-shape has 2 concave internal notch corners');
assert.equal(topology.returnFacesCount, 3, 'U-shape notch identifies D, E, F return faces');
assert.deepEqual(
  uFacets.filter((f) => topology.returnFacetIds.includes(f.id)).map((f) => f.code),
  ['D', 'E', 'F']
);
console.log('✓ Test 8 Passed: Corner & notch-return topology identifies 6 ext / 2 int / 3 returns');

// 9. Phase 2: Mixed Cladding Regions (Horizontal Dado & Vertical Bay) + Opening Deduction + Schedule
const testWall = {
  ...uFacets[0],
  lengthM: 10.0,
  heightM: 2.7,
  topZ: 2.7,
  claddingType: 'weatherboard' as const,
  openings: [
    {
      id: 'op-win-straddle',
      type: 'window' as const,
      distFromStartM: 2.0,
      sillHeightM: 0.9, // straddles dado seam at 1.2m (0.3m inside lower dado, 0.9m inside upper wall)
      widthM: 2.0,
      heightM: 1.2,
      label: 'W1'
    }
  ]
};
const dadoRegions = createHorizontalDadoSplit(testWall, 1.2, 'brick', 'weatherboard');
const dadoWall = { ...testWall, regions: dadoRegions };
const dadoMetrics = computeWallFacetMetrics(dadoWall);

assert.equal(dadoMetrics.grossAreaM2, 27.0);
assert.equal(dadoMetrics.openingsAreaM2, 2.4); // 2.0 * 1.2
assert.equal(dadoMetrics.netCladdingAreaM2, 24.6);
assert.equal(dadoMetrics.regionBreakdown.length, 2);
// Lower dado: 10*1.2 = 12.0m2 gross, opening clip [0.9..1.2] x 2.0 = 0.6m2 -> 11.4m2 net
assert.equal(dadoMetrics.regionBreakdown[0].grossAreaM2, 12.0);
assert.equal(dadoMetrics.regionBreakdown[0].openingsAreaM2, 0.6);
assert.equal(dadoMetrics.regionBreakdown[0].netAreaM2, 11.4);
// Upper wall: 10*1.5 = 15.0m2 gross, opening clip [1.2..2.1] x 2.0 = 1.8m2 -> 13.2m2 net
assert.equal(dadoMetrics.regionBreakdown[1].grossAreaM2, 15.0);
assert.equal(dadoMetrics.regionBreakdown[1].openingsAreaM2, 1.8);
assert.equal(dadoMetrics.regionBreakdown[1].netAreaM2, 13.2);

// Verify computeWallTakeoffSummary does not double count horizontal linealM when summarizing mixed dado regions
const bayWall = {
  ...uFacets[1],
  lengthM: 8.0,
  heightM: 2.7,
  topZ: 2.7,
  regions: createVerticalBaySplit(uFacets[1], 3.5, 'brick', 'profiled_metal'),
  openings: []
};
const mixedSummary = computeWallTakeoffSummary([dadoWall, bayWall]);
const brickSum = mixedSummary.byCladding.find((g) => g.claddingType === 'brick');
const wbSum = mixedSummary.byCladding.find((g) => g.claddingType === 'weatherboard');
assert.ok(brickSum && wbSum);
assert.equal(wbSum.linealM, 10.0, 'Weatherboard spans 10.0m horizontally');
assert.equal(brickSum.netAreaM2, +(11.4 + 3.5 * 2.7).toFixed(2));
assert.equal(isWallFacetUndetailed(dadoWall), false);

// Openings schedule & CSV export
const schedule = buildWallOpeningsSchedule([dadoWall, bayWall]);
assert.equal(schedule.totalCount, 1);
assert.equal(schedule.totalAreaM2, 2.4);
assert.equal(schedule.countsByType.window, 1);

const exportData = buildWallTakeoffExportData({
  points: uShapePoints,
  edges: initialPlanEdges,
  defaultHeightM: 2.7,
  facets: [dadoWall, bayWall]
});
assert.ok(exportData.csvText.includes('WALL CLADDING SUMMARY'));
assert.ok(exportData.csvText.includes('OPENINGS SCHEDULE'));
assert.ok(exportData.csvText.includes('W1'));
console.log('✓ Test 9 Passed: Mixed cladding dado/bay splitting, straddling openings, linealM dedup, & CSV schedule');

// 10. Bidirectional Walls -> Roof Seeding (U-notch preservation, zero auto skeleton, edge links, optional overhang)
const uWallPlan = {
  points: uShapePoints,
  edges: initialPlanEdges,
  defaultHeightM: 2.7,
  facets: uFacets
};
const seededFromWalls = deriveRoofOutlineFromWallPlan(uWallPlan, {
  levelId: 'level-1',
  eaveOverhangM: 0.45
});
assert.ok(seededFromWalls, 'Expected seeded roof outline from closed U-notch wall plan');
assert.equal(seededFromWalls.outline.points.length, 8, 'All 8 U-notch vertices including return corners must transfer');
assert.equal(seededFromWalls.outline.edges.length, 8, 'All 8 edges must transfer');
assert.equal(
  seededFromWalls.outline.edges.every((e) => e.type === 'unclassified' && e.hasWall === true && !!e.wallFacetId),
  true,
  'Seeded roof edges start unclassified with wallFacetId links and hasWall enabled'
);
assert.equal(
  seededFromWalls.linkedWallPlan.facets.every(
    (f, idx) => f.roofEdgeId === seededFromWalls.outline.edges[idx].id
  ),
  true,
  'Every wall facet gets bidirectional roofEdgeId link'
);
// Outward 0.45m eave overhang must expand perimeter bounds beyond wall bounds [0..14] -> [-0.45..14.45]
const minRoofX = Math.min(...seededFromWalls.outline.points.map((p) => p.x));
const maxRoofX = Math.max(...seededFromWalls.outline.points.map((p) => p.x));
assert.ok(minRoofX < -0.4 && maxRoofX > 14.4, `Expected 0.45m outward overhang on roof points (got ${minRoofX}..${maxRoofX})`);

// Refresh link helper preserves existing cladding/openings while verifying roofEdgeId links
const relinked = linkWallFacetsToRoofLevels(
  { ...uWallPlan, facets: uFacets.map((f) => ({ ...f, roofEdgeId: undefined })) },
  [
    {
      id: 'level-1',
      code: 'L1',
      name: 'Main',
      eaveHeightM: 2.7,
      outline: seededFromWalls.outline,
      skeleton: []
    }
  ]
);
assert.equal(
  relinked.facets.filter((f) => !!f.roofEdgeId).length,
  8,
  'linkWallFacetsToRoofLevels relinks all 8 exterior/return facets to roof edges'
);
console.log('✓ Test 10 Passed: Bidirectional Walls -> Roof seeding preserves 8 U-notch faces, overhang & edge links');

// 11. Regression: Duplicate WallFacet IDs (e.g. `wall-facet-2`) on split edges or legacy snapshots
const legacyWithDupes = [
  { ...uFacets[0], id: 'wall-facet-2' },
  { ...uFacets[1], id: 'wall-facet-2' },
  { ...uFacets[2], id: 'wall-facet-2' }
];
const repairedLegacy = ensureUniqueWallFacetIds(legacyWithDupes);
assert.equal(
  new Set(repairedLegacy.map((f) => f.id)).size,
  repairedLegacy.length,
  'ensureUniqueWallFacetIds must eliminate duplicate wall-facet-2 IDs'
);

// Scenario: Existing facet at index 1 had id `wall-facet-2`, and edge 0 is split into two edges so
// the newly minted run at index 1 would collide with `wall-facet-2` unless matched IDs are reserved up front.
const splitPoints = [
  { x: 0, y: 0 },
  { x: 7, y: 0 },
  { x: 14, y: 0 }, // collinear edge 0+1 merges back or non-mergeable edge at idx 1 after slight jog:
  { x: 14, y: 4 },
  { x: 13.8, y: 8 },
  { x: 0, y: 8 }
];
const existingShifted = [
  {
    ...uFacets[1],
    id: 'wall-facet-2',
    from: { x: 0, y: 8 },
    to: { x: 0, y: 0 },
    claddingType: 'weatherboard' as const
  },
  {
    ...uFacets[0],
    id: 'wall-facet-1',
    from: { x: 0, y: 0 },
    to: { x: 14, y: 0 },
    claddingType: 'brick' as const
  }
];
const rebuiltNoDupe = buildWallFacetsFromPlan(
  { points: splitPoints },
  { existingFacets: existingShifted, mergeCollinear: false }
);
assert.equal(
  new Set(rebuiltNoDupe.map((f) => f.id)).size,
  rebuiltNoDupe.length,
  'buildWallFacetsFromPlan must guarantee strictly unique facet IDs without repeating wall-facet-2'
);
assert.equal(
  rebuiltNoDupe.filter((f) => f.id === 'wall-facet-2').length,
  1,
  'wall-facet-2 must appear at most once'
);
console.log('✓ Test 11 Passed: Zero duplicate wall-facet-2 IDs on rebuild or legacy repair');

// --- Wall Cladding Parity+ Tests ---

// 12. Opening uRatio scaling on wall length edits + type switching + duplication
const opBaseFacet = { ...uFacets[0], lengthM: 10.0, heightM: 2.7, topZ: 2.7, claddingType: 'weatherboard' as const };
const centeredWin = clampWallOpeningToFacet(opBaseFacet, {
  id: 'op-center',
  type: 'window',
  distFromStartM: 4.0, // center = 5.0m (uRatio = 0.50 on 10m wall)
  sillHeightM: 0.9,
  widthM: 2.0,
  heightM: 1.2,
  label: 'Center Win'
});
assert.ok(Math.abs((centeredWin.uRatio ?? 0) - 0.5) < 0.01, 'Centered window should record uRatio ~ 0.5');

const basePlanForResize = {
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
    { x: 0, y: 8 }
  ],
  edges: buildWallEdgesFromPoints([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 8 },
    { x: 0, y: 8 }
  ]),
  defaultHeightM: 2.7,
  facets: buildWallFacetsFromPlan({
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 }
    ]
  }).map((f, i) => (i === 0 ? { ...f, claddingType: 'weatherboard' as const, openings: [centeredWin] } : f))
};

const stretchedPlan = updateWallPlanEdgeLength(basePlanForResize, basePlanForResize.edges[0].id, 14.0);
const stretchedWin = stretchedPlan.facets[0].openings[0];
// uRatio = 0.5 of 14.0m = 7.0m center -> distFromStartM = 6.0m (width 2.0)
assert.ok(
  Math.abs(stretchedWin.distFromStartM - 6.0) < 0.15,
  `Resizing wall from 10m -> 14m should preserve relative uRatio (~6.0m start, got ${stretchedWin.distFromStartM})`
);

const switchedToDoor = switchWallOpeningType(opBaseFacet, centeredWin, 'door');
assert.equal(switchedToDoor.type, 'door');
assert.equal(switchedToDoor.sillHeightM, 0, 'Switching window -> door drops sill to ground threshold');
const switchedBackToWin = switchWallOpeningType(opBaseFacet, switchedToDoor, 'window');
assert.equal(switchedBackToWin.type, 'window');
assert.ok(switchedBackToWin.sillHeightM >= 0.6, 'Switching door -> window raises sill off floor threshold within headroom');

const dupRes = duplicateWallOpening({ ...opBaseFacet, openings: [centeredWin] }, centeredWin.id);
assert.ok(dupRes, 'duplicateWallOpening should return cloned opening');
assert.notEqual(dupRes.created.id, centeredWin.id);
assert.ok(dupRes.created.distFromStartM >= centeredWin.distFromStartM + centeredWin.widthM);
console.log('✓ Test 12 Passed: Opening uRatio scaling, type switching, & duplication');

// 13. Vertical stacked openings (highlight window above door) & true overlap resolve
const doorOp = createDefaultWallOpening(opBaseFacet, 'door', 2.0); // u: [2.0..2.92], v: [0..2.1]
const tallFacet = { ...opBaseFacet, heightM: 3.6, openings: [doorOp] };
const stackedHighlight = clampWallOpeningToFacet(
  { lengthM: tallFacet.lengthM, heightM: tallFacet.heightM },
  {
    id: 'op-highlight',
    type: 'window',
    distFromStartM: 2.0,
    sillHeightM: 2.3, // strictly above door head (2.1m) -> NO overlap!
    widthM: 0.9,
    heightM: 0.8,
    label: 'Highlight'
  }
);
assert.equal(
  findOpeningOverlaps(tallFacet, stackedHighlight).hasOverlap,
  false,
  'Vertically stacked highlight window over door must NOT flag an overlap'
);

const collidingWin = clampWallOpeningToFacet(
  { lengthM: opBaseFacet.lengthM, heightM: opBaseFacet.heightM },
  {
    id: 'op-collide',
    type: 'window',
    distFromStartM: 2.3,
    sillHeightM: 0.9,
    widthM: 1.4,
    heightM: 1.2,
    label: 'Colliding'
  }
);
const doorCheckFacet = { ...opBaseFacet, openings: [doorOp, collidingWin] };
assert.equal(findOpeningOverlaps(doorCheckFacet, collidingWin).hasOverlap, true, 'Colliding openings must be detected');
const resolvedOps = resolveOpeningOverlap(doorCheckFacet, collidingWin.id);
const resolvedColliding = resolvedOps.find((o) => o.id === collidingWin.id)!;
assert.equal(
  findOpeningOverlaps({ ...opBaseFacet, openings: [doorOp] }, resolvedColliding).hasOverlap,
  false,
  'resolveOpeningOverlap clears collision'
);
const extrusionClean = sanitizeWallOpeningsForExtrusion({
  lengthM: opBaseFacet.lengthM,
  heightM: 3.6,
  openings: [doorOp, stackedHighlight]
});
assert.equal(extrusionClean.length, 2, 'Extrusion sanitizer keeps both vertically stacked openings intact');
console.log('✓ Test 13 Passed: Vertically stacked openings preserved cleanly & true collisions resolved');

// 14. Parapet wall kind: independent height on sync, coping lm, completeness & commercial-neutral Order Pack
const parapetFacet = updateWallFacetKind(
  { ...editedWalls.facets[0], claddingType: 'none' },
  'parapet',
  { parapetHeightM: 3.45, parapetAboveM: 0.45, hasCopingFlashing: true }
);
assert.equal(parapetFacet.kind, 'parapet');
assert.equal(parapetFacet.heightM, 3.45);
assert.equal(parapetFacet.heightSource, 'manual');

const parapetPlan = {
  ...editedWalls,
  facets: editedWalls.facets.map((f, i) => (i === 0 ? parapetFacet : f))
};
const afterRoofSync = syncWallPlanWithRoof(parapetPlan, [raisedLvl], raisedPlanes, { forceAllLinked: true });
assert.equal(
  afterRoofSync.facets[0].heightM,
  3.45,
  'Parapet top height must stay independent even during Sync Roof Tops'
);
assert.equal(afterRoofSync.facets[0].kind, 'parapet');

const parapetCompleteness = evaluateTakeoffCompleteness({
  levels: [raisedLvl],
  planes: raisedPlanes,
  assignableLines: [],
  flashingAssignments: [],
  wallPlan: afterRoofSync,
  assets: []
});
assert.ok(
  parapetCompleteness.issues.some((i) => i.category === 'undetailed_parapet'),
  'Undetailed parapet wall triggers undetailed_parapet issue cleanly'
);

const parapetOrderPack = buildOrderPack({
  planes: raisedPlanes,
  levels: [raisedLvl],
  layout: null,
  assignments: [],
  wallPlan: {
    ...afterRoofSync,
    facets: afterRoofSync.facets.map((f) => ({ ...f, claddingType: 'profiled_metal' as const }))
  }
});
assert.ok(parapetOrderPack.walls);
assert.equal(parapetOrderPack.walls.parapetFacesCount, 1);
assert.ok((parapetOrderPack.walls.parapetCopingLm ?? 0) > 1.0);
const orderCsv = exportOrderPackToCsv(parapetOrderPack);
assert.ok(orderCsv.includes('WALL-COPING-PARAPET'), 'Order Pack CSV exports parapet coping lm');
assert.equal(orderCsv.includes('$'), false, 'Order Pack CSV must remain strictly free of dollar pricing');
console.log('✓ Test 14 Passed: Parapet independent height, completeness warning, & commercial-neutral coping export');

// 15. Open Wing / Spur polyline walls coexist without corrupting closed-ring topology or roof seeding
const planWithWing = addWingWallToPlan(
  uWallPlan,
  [
    { x: 14, y: 0 },
    { x: 17.5, y: 0 },
    { x: 17.5, y: 3.0 }
  ],
  { heightM: 2.1, claddingType: 'weatherboard' }
);
assert.equal(planWithWing.facets.length, 10, '8 closed facets + 2 open wing spur facets');
const wingFacets = planWithWing.facets.filter((f) => f.kind === 'wing');
assert.equal(wingFacets.length, 2);
assert.equal(wingFacets[0].lengthM, 3.5);
assert.equal(wingFacets[1].lengthM, 3.0);

const wingTopology = analyzeWallPlanTopology(planWithWing.facets);
assert.equal(wingTopology.externalCornersCount, 6, 'Open wing walls must not corrupt closed-ring external corner count');
assert.equal(wingTopology.internalCornersCount, 2);
assert.equal(wingTopology.returnFacesCount, 3);

const wingRoofSeed = deriveRoofOutlineFromWallPlan(planWithWing, { levelId: 'lvl-1' });
assert.ok(wingRoofSeed);
assert.equal(wingRoofSeed.outline.points.length, 8, 'Roof seeding uses closed primary perimeter only');
assert.equal(wingRoofSeed.linkedWallPlan.facets.length, 10, 'Roof seeding preserves wing walls on WallPlan');
console.log('✓ Test 15 Passed: Open wing/spur polylines preserve topology & roof perimeter seeding');

// 16. Splitting a wall facet partitions openings cleanly with unique IDs
const facetWithTwoOps = {
  ...basePlanForResize.facets[0],
  openings: [
    createDefaultWallOpening(opBaseFacet, 'window', 1.2), // left side [1.2..2.7]
    createDefaultWallOpening(opBaseFacet, 'door', 7.5) // right side [7.5..8.4]
  ]
};
const planToSplit = {
  ...basePlanForResize,
  facets: basePlanForResize.facets.map((f, i) => (i === 0 ? facetWithTwoOps : f))
};
const splitPlan = splitWallFacetInPlan(planToSplit, facetWithTwoOps.id, 5.0);
assert.equal(splitPlan.facets.length, 5, 'Splitting 10m wall into 2 produces 5 total ring facets');
assert.equal(splitPlan.facets[0].lengthM, 5.0);
assert.equal(splitPlan.facets[1].lengthM, 5.0);
assert.equal(splitPlan.facets[0].openings.length, 1);
assert.equal(splitPlan.facets[1].openings.length, 1);
assert.ok(Math.abs(splitPlan.facets[1].openings[0].distFromStartM - 2.5) < 0.05);
assert.equal(new Set(splitPlan.facets.map((f) => f.id)).size, splitPlan.facets.length);
console.log('✓ Test 16 Passed: Split facet cleanly partitions openings & maintains unique IDs');

// 17. Promote Void Opening -> Secondary Wall Section (3 walls + depth update + batch edit + scoped takeoff + delete)
const voidOpening = clampWallOpeningToFacet(opBaseFacet, {
  id: 'op-patio-void',
  type: 'void',
  distFromStartM: 3.0,
  sillHeightM: 0,
  widthM: 4.0,
  heightM: 2.4,
  label: 'Patio Recess'
});
const planForVoid = {
  ...basePlanForResize,
  facets: basePlanForResize.facets.map((f, i) =>
    i === 0 ? { ...f, claddingType: 'brick' as const, openings: [voidOpening] } : f
  )
};
const promoted = createSecondaryZoneFromVoid(planForVoid, planForVoid.facets[0].id, voidOpening.id, {
  depthM: 2.5,
  direction: 'inward'
});
assert.ok(promoted, 'Should create 3 secondary enclave walls from void');
assert.equal(promoted.createdFacets.length, 3, 'Secondary alcove creates Left Return, Back Wall, Right Return');
assert.equal(promoted.createdFacets[0].lengthM, 2.5);
assert.equal(promoted.createdFacets[1].lengthM, 4.0);
assert.equal(promoted.createdFacets[2].lengthM, 2.5);

// Update depth 2.5m -> 3.2m
const deepened = updateSecondaryZoneDepth(promoted.wallPlan, promoted.zone.id, 3.2);
const secFacetsAfter = deepened.facets.filter((f) => f.secondaryZoneId === promoted.zone.id);
assert.equal(secFacetsAfter[0].lengthM, 3.2);
assert.equal(secFacetsAfter[1].lengthM, 4.0);

// Batch update secondary walls
const batched = batchUpdateWallFacetsInPlan(
  deepened,
  secFacetsAfter.map((f) => f.id),
  { claddingType: 'weatherboard', heightM: 2.55 }
);
const secSumOnly = computeWallTakeoffSummary(batched.facets, 'secondary');
const primSumOnly = computeWallTakeoffSummary(batched.facets, 'primary');
const allSum = computeWallTakeoffSummary(batched.facets, 'all');
assert.equal(secSumOnly.totalFaces, 3);
assert.equal(primSumOnly.totalFaces, 4);
assert.equal(allSum.totalFaces, 7);
assert.ok(secSumOnly.totalNetAreaM2 > 20);
assert.equal(+(primSumOnly.totalNetAreaM2 + secSumOnly.totalNetAreaM2).toFixed(2), +allSum.totalNetAreaM2.toFixed(2));

// Secondary metrics reflected in Order Pack
const secOrderPack = buildOrderPack({
  planes: raisedPlanes,
  levels: [raisedLvl],
  layout: null,
  assignments: [],
  wallPlan: batched
});
assert.equal(secOrderPack.walls?.secondaryFacesCount, 3);
assert.ok((secOrderPack.walls?.secondaryNetAreaM2 ?? 0) > 20);

const afterZoneDelete = removeSecondaryZone(batched, promoted.zone.id);
assert.equal(afterZoneDelete.facets.length, 4);
assert.equal(afterZoneDelete.secondaryZones?.length, 0);
console.log('✓ Test 17 Passed: Void -> Secondary Wall Section creation, depth adjust, batch edit, scoped takeoff & removal');

// 18. Headless Three.js 3D Extrusion Robustness (stacked openings, 0.28m nib, dado split, parapet, wing, secondary)
const robustPlan: typeof batched = {
  ...batched,
  facets: [
    // Stacked openings + horizontal dado split
    {
      ...batched.facets[0],
      heightM: 3.6,
      topZ: 3.6,
      regions: createHorizontalDadoSplit({ ...batched.facets[0], heightM: 3.6 }, 1.2, 'brick', 'weatherboard'),
      openings: [doorOp, stackedHighlight]
    },
    // Parapet with coping cap
    updateWallFacetKind(batched.facets[1], 'parapet', { parapetHeightM: 3.3, hasCopingFlashing: true }),
    // Ultra-short 0.28m nib
    {
      ...batched.facets[2],
      to: { x: batched.facets[2].from.x, y: batched.facets[2].from.y + 0.28 },
      lengthM: 0.28,
      claddingType: 'profiled_metal'
    },
    // Plus remaining secondary & wing facets
    ...batched.facets.slice(3),
    ...wingFacets
  ]
};

const rootGroup = new THREE.Group();
const selectableMeshes: THREE.Mesh[] = [];
const geos: THREE.BufferGeometry[] = [];
const mats: THREE.Material[] = [];
const stubTextures = { getEntry: () => null, garageDoor: null } as unknown as Parameters<typeof buildWallPlan3DGroup>[0]['wallTextures'];
const testGlassMat = new THREE.MeshPhysicalMaterial({ color: '#88ccee' });

buildWallPlan3DGroup({
  wallPlan: robustPlan,
  bounds: {
    minX: 0,
    maxX: 18,
    minY: 0,
    maxY: 10,
    midX: 9,
    midY: 5,
    midZ: 1.5,
    maxZ: 3.6,
    span: 20
  },
  selectedWallFacetId: robustPlan.facets[0].id,
  wallFilterMode: 'all',
  shadingMode: 'studio_finish',
  wallTextures: stubTextures,
  glassMat: testGlassMat,
  rootGroup,
  selectableMeshes,
  trackGeo: (g) => {
    geos.push(g);
    return g;
  },
  trackMat: (m) => {
    mats.push(m);
    return m;
  }
});

assert.ok(selectableMeshes.length >= robustPlan.facets.length, 'All robust facets including short nib, parapet, wing & secondary must extrude cleanly');
assert.ok(geos.length > 0 && mats.length > 0);
geos.forEach((g) => g.dispose());
mats.forEach((m) => m.dispose());
testGlassMat.dispose();
console.log('✓ Test 18 Passed: Headless 3D wall extrusion succeeds across stacked openings, short nibs, dado, parapet, wings & secondary');

// 19. Preserving wing & secondary walls when rebuilding primary ring facets
const extraPlan = addWingWallToPlan(
  batched,
  [
    { x: 10, y: 8 },
    { x: 12.5, y: 8 }
  ],
  { heightM: 2.2, claddingType: 'weatherboard' }
);
const rebuiltRingOnly = buildWallFacetsFromPlan(
  { points: extraPlan.points, edges: extraPlan.edges },
  { defaultHeightM: 2.7, existingFacets: extraPlan.facets }
);
const mergedRebuild = mergePreservedExtraFacets(extraPlan, rebuiltRingOnly);
assert.ok(
  mergedRebuild.some((f) => f.kind === 'wing'),
  'mergePreservedExtraFacets must keep open wing facets on rebuild'
);
assert.ok(
  mergedRebuild.some((f) => f.kind === 'secondary'),
  'mergePreservedExtraFacets must keep secondary alcove facets on rebuild'
);
assert.equal(
  new Set(mergedRebuild.map((f) => f.id)).size,
  mergedRebuild.length,
  'Merged rebuilt facets maintain strictly unique IDs'
);
console.log('✓ Test 19 Passed: Perimeter rebuild preserves wing & secondary facets with unique IDs');

// 20. Batch Multi-Apply Helpers (applyCladdingToFacets, applyKindToFacets, applyHeightToFacets) & Zero-Pricing Order Pack
{
  const baseOutline20 = getPresetOutline('rectangle_14x10');
  const lvl20 = createRoofLevelWithSkeleton(1, 'Main Roof', 2.7, baseOutline20.points);
  const planes20 = syncMultiLevelPlanes([lvl20], [], 22.5);
  const derivedPlan20 = deriveWallPlanFromRoofLevels([lvl20], 2.7, undefined, planes20);
  assert.ok(derivedPlan20, 'deriveWallPlanFromRoofLevels returns a non-null WallPlan');
  let wallPlan20 = derivedPlan20;

  const targetIds20 = wallPlan20.facets.slice(0, 2).map((f) => f.id);
  const opening20 = createDefaultWallOpening(wallPlan20.facets[0], 'window');
  wallPlan20 = {
    ...wallPlan20,
    facets: wallPlan20.facets.map((f, idx) => (idx === 0 ? { ...f, openings: [opening20] } : f))
  };

  wallPlan20 = applyCladdingToFacets(wallPlan20, targetIds20, 'weatherboard');
  targetIds20.forEach((id) => {
    const f = wallPlan20.facets.find((item) => item.id === id);
    assert.equal(f?.claddingType, 'weatherboard', 'applyCladdingToFacets updates selected wall cladding');
  });

  wallPlan20 = applyKindToFacets(wallPlan20, targetIds20, 'parapet');
  targetIds20.forEach((id) => {
    const f = wallPlan20.facets.find((item) => item.id === id);
    assert.equal(f?.kind, 'parapet', 'applyKindToFacets updates selected wall facet kind');
  });

  wallPlan20 = applyHeightToFacets(wallPlan20, targetIds20, 3.45, {
    heightSource: 'manual'
  });
  targetIds20.forEach((id) => {
    const f = wallPlan20.facets.find((item) => item.id === id);
    assert.equal(f?.heightSource, 'manual');
    assert.equal(f?.heightM, 3.45);
  });

  const raisedLvl20 = createRoofLevelWithSkeleton(1, 'Main Roof', 3.8, baseOutline20.points);
  const raisedPlanes20 = syncMultiLevelPlanes([raisedLvl20], [], 22.5);
  // Parapet facets protect their manual upstand height when syncing roof heights
  wallPlan20 = applyHeightToFacets(wallPlan20, targetIds20, 3.8, {
    heightSource: 'roof',
    levels: [raisedLvl20],
    planes: raisedPlanes20
  });
  targetIds20.forEach((id) => {
    const f = wallPlan20.facets.find((item) => item.id === id);
    assert.equal(f?.heightM, 3.45, 'Parapet kind preserves manual height during roof height sync');
  });

  // Switching back to exterior allows heightSource: 'roof' to snap cleanly to raised roof eave (3.8m)
  wallPlan20 = applyKindToFacets(wallPlan20, targetIds20, 'exterior');
  wallPlan20 = applyHeightToFacets(wallPlan20, targetIds20, 3.8, {
    heightSource: 'roof',
    levels: [raisedLvl20],
    planes: raisedPlanes20
  });
  targetIds20.forEach((id) => {
    const f = wallPlan20.facets.find((item) => item.id === id);
    assert.equal(f?.heightSource, 'roof');
    assert.ok(f && Math.abs(f.heightM - 3.8) < 0.05, `Expected synced roof height ~3.8m, got ${f?.heightM}`);
  });

  assert.equal(wallPlan20.facets[0].openings.length, 1, 'Batch wall helpers preserve facet openings');
  assert.equal(new Set(wallPlan20.facets.map((f) => f.id)).size, wallPlan20.facets.length, 'Unique wall facet IDs preserved');

  const spec20 = { coverWidth: 0.762, maxLength: 6.0, endLap: 0.15, overhang: 0.05 };
  const layout20 = generateCuttingLayout(raisedPlanes20, spec20);
  const comp20 = evaluateTakeoffCompleteness({
    levels: [raisedLvl20],
    planes: raisedPlanes20,
    assignableLines: [],
    flashingAssignments: [],
    wallPlan: wallPlan20,
    assets: []
  });
  const pack20 = buildOrderPack({
    planes: raisedPlanes20,
    levels: [raisedLvl20],
    layout: layout20,
    assignableLines: [],
    assignments: [],
    wallPlan: wallPlan20,
    completenessReport: comp20
  });
  const csv20 = exportOrderPackToCsv(pack20);
  assert.ok(!csv20.includes('$'), 'Wall-inclusive Order Pack CSV must stay strictly commercial-neutral (no $)');
}
console.log('✓ Test 20 Passed: Multi-facet wall batch apply helpers preserve openings, roof sync & zero-pricing Order Pack');

// 21. Batch height/kind update preserves stacked Dado/Bay regions, openings & 0.45m short return nib geometry
{
  const nibFacets = buildWallFacetsFromPlan({ points: splitCollinearPoints }, { defaultHeightM: 2.7 });
  const nibWallPlan = {
    points: splitCollinearPoints,
    edges: buildWallEdgesFromPoints(splitCollinearPoints, 'wall-edge'),
    defaultHeightM: 2.7,
    facets: nibFacets.map((f, idx) =>
      idx === 0
        ? {
            ...f,
            claddingType: 'weatherboard' as const,
            regions: createHorizontalDadoSplit(f, 1.2, 'brick', 'weatherboard'),
            openings: [createDefaultWallOpening(f, 'window', 2.0)]
          }
        : idx === 3
        ? { ...f, claddingType: 'profiled_metal' as const }
        : f
    )
  };
  const nibFacet = nibWallPlan.facets[3];
  assert.equal(nibFacet.lengthM, 0.45);

  const batchHeightUpdated = batchUpdateWallFacetsInPlan(
    nibWallPlan,
    [nibWallPlan.facets[0].id, nibFacet.id],
    { heightM: 3.1, heightSource: 'manual' }
  );
  assert.equal(batchHeightUpdated.facets[0].heightM, 3.1);
  assert.equal(batchHeightUpdated.facets[0].openings.length, 1, 'Batch height update preserves openings');
  assert.equal(
    batchHeightUpdated.facets[0].regions?.length,
    2,
    'Batch height update preserves stacked horizontal dado regions'
  );
  assert.equal(batchHeightUpdated.facets[3].lengthM, 0.45, '0.45m short return nib length remains exact');
  assert.equal(batchHeightUpdated.facets[3].heightM, 3.1);
  const nibMetrics = computeWallFacetMetrics(batchHeightUpdated.facets[3]);
  assert.ok(Number.isFinite(nibMetrics.netCladdingAreaM2) && nibMetrics.netCladdingAreaM2 > 1.3);
}
console.log('✓ Test 21 Passed: Batch height update preserves stacked dado regions, openings & 0.45m return nib');

// 22. Overlapping openings block measure lock in evaluateTakeoffCompleteness; stacked vertical openings pass cleanly
{
  const baseOutline22 = getPresetOutline('rectangle_14x10');
  const lvl22 = createRoofLevelWithSkeleton(1, 'Main Roof', 3.4, baseOutline22.points);
  const planes22 = syncMultiLevelPlanes([lvl22], [], 22.5);
  const wp22 = deriveWallPlanFromRoofLevels([lvl22], 3.4, undefined, planes22)!;
  const detailedPlan22 = applyCladdingToFacets(
    wp22,
    wp22.facets.map((f) => f.id),
    'weatherboard'
  );
  const host22 = detailedPlan22.facets[0];
  const winLeft = createDefaultWallOpening(host22, 'window', 2.0);
  const doorOverlap = {
    ...createDefaultWallOpening(host22, 'door', 2.4),
    id: 'op-door-overlap-22'
  };
  const stackedTop = {
    id: 'op-stacked-top-22',
    type: 'window' as const,
    distFromStartM: doorOverlap.distFromStartM,
    sillHeightM: 2.35,
    widthM: doorOverlap.widthM,
    heightM: 0.75,
    label: 'Highlight Above Door'
  };

  // Stacked vertical openings must NOT trigger opening_overlap
  const stackedPlan22 = {
    ...detailedPlan22,
    facets: detailedPlan22.facets.map((f) =>
      f.id === host22.id ? { ...f, openings: [doorOverlap, stackedTop] } : f
    )
  };
  const compStacked = evaluateTakeoffCompleteness({
    levels: [lvl22],
    planes: planes22,
    assignableLines: [],
    flashingAssignments: [],
    wallPlan: stackedPlan22,
    assets: []
  });
  assert.equal(
    compStacked.issues.some((i) => i.category === 'opening_overlap'),
    false,
    'Vertically stacked openings must not trigger opening_overlap'
  );

  // Overlapping openings MUST emit a blocker
  const overlappingPlan22 = {
    ...detailedPlan22,
    facets: detailedPlan22.facets.map((f) =>
      f.id === host22.id ? { ...f, openings: [winLeft, doorOverlap] } : f
    )
  };
  const compOverlap = evaluateTakeoffCompleteness({
    levels: [lvl22],
    planes: planes22,
    assignableLines: [],
    flashingAssignments: [],
    wallPlan: overlappingPlan22,
    assets: []
  });
  assert.ok(
    compOverlap.issues.some((i) => i.category === 'opening_overlap' && i.severity === 'blocker'),
    'Overlapping wall openings must emit a blocker issue'
  );
  assert.equal(compOverlap.canLockMeasure, false);

  // Resolving overlap clears the blocker cleanly
  const resolvedOps = resolveOpeningOverlap(overlappingPlan22.facets[0], doorOverlap.id);
  const resolvedPlan22 = {
    ...detailedPlan22,
    facets: detailedPlan22.facets.map((f) =>
      f.id === host22.id ? { ...f, openings: resolvedOps } : f
    )
  };
  const compResolved = evaluateTakeoffCompleteness({
    levels: [lvl22],
    planes: planes22,
    assignableLines: [],
    flashingAssignments: [],
    wallPlan: resolvedPlan22,
    assets: []
  });
  assert.equal(
    compResolved.issues.some((i) => i.category === 'opening_overlap'),
    false,
    'resolveOpeningOverlap clears the opening_overlap completeness blocker'
  );
}
console.log('✓ Test 22 Passed: Overlapping openings completeness blocker & stacked clearance');

// 23. 3-Zone Horizontal Band split preserves area accounting & zero-$ Order Pack
{
  const f23: typeof batched.facets[0] = {
    ...batched.facets[0],
    lengthM: 10,
    heightM: 3.6,
    topZ: 3.6,
    claddingType: 'brick',
    openings: []
  };
  const bands = createHorizontalBandSplit(f23, 0.9, 2.5, 'brick', 'profiled_metal', 'plaster');
  assert.equal(bands.length, 3);
  const fWithBands = {
    ...f23,
    regions: bands,
    openings: [
      {
        id: 'op-band-win',
        type: 'window' as const,
        distFromStartM: 3.0,
        sillHeightM: 1.0,
        widthM: 2.0,
        heightM: 1.2
      }
    ]
  };
  const m23 = computeWallFacetMetrics(fWithBands);
  const sumRegNet = m23.regionBreakdown.reduce((s, r) => s + r.netAreaM2, 0);
  assert.ok(
    Math.abs(sumRegNet - m23.netCladdingAreaM2) < 0.05,
    `3-band region net sum (${sumRegNet}) must equal facet net (${m23.netCladdingAreaM2})`
  );
  assert.equal(m23.regionBreakdown[0].claddingType, 'brick');
  assert.equal(m23.regionBreakdown[1].claddingType, 'profiled_metal');
  assert.equal(m23.regionBreakdown[2].claddingType, 'plaster');

  const bandPlan23 = {
    ...batched,
    facets: [fWithBands, ...batched.facets.slice(1)]
  };
  const base23 = getPresetOutline('rectangle_14x10');
  const lvl23 = createRoofLevelWithSkeleton(1, 'Main Roof', 2.7, base23.points);
  const planes23 = syncMultiLevelPlanes([lvl23], [], 22.5);
  const layout23 = generateCuttingLayout(planes23, { coverWidth: 0.762, maxLength: 6.0, endLap: 0.15, overhang: 0.05 });
  const pack23 = buildOrderPack({
    planes: planes23,
    levels: [lvl23],
    layout: layout23,
    assignableLines: [],
    assignments: [],
    wallPlan: bandPlan23,
    completenessReport: evaluateTakeoffCompleteness({
      levels: [lvl23],
      planes: planes23,
      assignableLines: [],
      flashingAssignments: [],
      wallPlan: bandPlan23,
      assets: []
    })
  });
  const csv23 = exportOrderPackToCsv(pack23);
  assert.ok(!csv23.includes('$'), '3-Band wall Order Pack CSV must contain zero pricing symbols');
}
console.log('✓ Test 23 Passed: 3-Band mixed cladding region area reconciliation & commercial-neutral export');

// 24. Deep U-notch + wing + parapet + outward secondary alcove + stone ('other') + tall windows 3D build validation
{
  const courtyardPlan24 = addWingWallToPlan(
    robustPlan,
    [
      { x: 1, y: 1 },
      { x: 1, y: 4.5 }
    ],
    { heightM: 2.4, claddingType: 'other' }
  );
  const hostOutward = {
    ...courtyardPlan24.facets[1],
    claddingType: 'other' as const,
    openings: [
      {
        id: 'void-outward-24',
        type: 'void' as const,
        distFromStartM: 1.5,
        sillHeightM: 0,
        widthM: 3.0,
        heightM: 2.4
      }
    ]
  };
  const withHost24 = {
    ...courtyardPlan24,
    facets: courtyardPlan24.facets.map((f, idx) => (idx === 1 ? hostOutward : f))
  };
  const secRes24 = createSecondaryZoneFromVoid(withHost24, hostOutward.id, 'void-outward-24', {
    depthM: 2.2,
    direction: 'outward',
    claddingType: 'fibre_cement'
  });
  assert.ok(secRes24, 'Outward secondary alcove created');
  const tallWinFacet = {
    ...secRes24.wallPlan.facets[0],
    heightM: 3.6,
    topZ: 3.6,
    openings: [
      {
        id: 'tall-win-24',
        type: 'window' as const,
        distFromStartM: 1.2,
        sillHeightM: 0.6,
        widthM: 2.2,
        heightM: 1.9
      },
      {
        id: 'gar-24',
        type: 'garage' as const,
        distFromStartM: 4.5,
        sillHeightM: 0,
        widthM: 2.6,
        heightM: 2.1
      }
    ]
  };
  const stressPlan24 = {
    ...secRes24.wallPlan,
    facets: [tallWinFacet, ...secRes24.wallPlan.facets.slice(1)]
  };

  const stressGroup = new THREE.Group();
  const stressSelectable: THREE.Mesh[] = [];
  const stressGeos: THREE.BufferGeometry[] = [];
  const stressMats: THREE.Material[] = [];
  const glass24 = new THREE.MeshPhysicalMaterial({ color: '#88ccee' });

  buildWallPlan3DGroup({
    wallPlan: stressPlan24,
    bounds: {
      minX: -4,
      maxX: 20,
      minY: -4,
      maxY: 14,
      midX: 8,
      midY: 5,
      midZ: 1.8,
      maxZ: 3.6,
      span: 24
    },
    selectedWallFacetId: stressPlan24.facets[0].id,
    wallFilterMode: 'all',
    shadingMode: 'studio_finish',
    showSheetSeams: true,
    wallTextures: stubTextures,
    glassMat: glass24,
    rootGroup: stressGroup,
    selectableMeshes: stressSelectable,
    trackGeo: (g) => {
      stressGeos.push(g);
      return g;
    },
    trackMat: (m) => {
      stressMats.push(m);
      return m;
    }
  });

  let meshCount = 0;
  stressGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      meshCount += 1;
      const geo = (obj as THREE.Mesh).geometry;
      const pos = geo.getAttribute('position');
      assert.ok(pos && pos.count > 0, 'Every 3D wall/trim/plinth mesh has vertices');
      for (let i = 0; i < pos.count; i++) {
        assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)), 'All 3D vertices must be finite non-NaN');
      }
    }
  });
  assert.ok(meshCount > stressSelectable.length, 'Corner posts, coping caps, head flashings & outward plinth slabs generated cleanly');
  stressGeos.forEach((g) => g.dispose());
  stressMats.forEach((m) => m.dispose());
  glass24.dispose();
}
  console.log('✓ Test 24 Passed: Stress 3D geometry check (corner posts, coping, dado flashing, seams, outward alcove slab)');

// 25. Multi-Body Detached Roofs -> Multiple Wall Rings, Grounded Plinths & Sensible Default Cladding
{
  const body1Pts = [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 12, y: 8 },
    { x: 0, y: 8 }
  ];
  const body2Pts = [
    { x: 16, y: 1 },
    { x: 23, y: 1 },
    { x: 23, y: 7 },
    { x: 16, y: 7 }
  ];
  const lvl1 = createRoofLevel(1, 'Main House', 2.7, body1Pts);
  lvl1.outline = {
    ...buildOutlineFromPoints(body1Pts, lvl1.id),
    edges: buildOutlineFromPoints(body1Pts, lvl1.id).edges.map((e) => ({
      ...e,
      type: 'outline' as const,
      eaveHeightM: 2.7,
      eaveSetbackM: 0.45,
      hasWall: true
    }))
  };
  lvl1.skeleton = generateSkeletonLines(lvl1.outline);

  const lvl2 = createRoofLevel(2, 'Detached Studio', 3.1, body2Pts);
  lvl2.outline = {
    ...buildOutlineFromPoints(body2Pts, lvl2.id),
    edges: buildOutlineFromPoints(body2Pts, lvl2.id).edges.map((e) => ({
      ...e,
      type: 'outline' as const,
      eaveHeightM: 3.1,
      eaveSetbackM: 0.45,
      hasWall: true
    }))
  };
  lvl2.skeleton = generateSkeletonLines(lvl2.outline);

  const multiPlanes = syncMultiLevelPlanes([lvl1, lvl2], [], 20);
  const multiPlan = deriveWallPlanFromRoofLevels([lvl1, lvl2], 2.7, undefined, multiPlanes);
  assert.ok(multiPlan, 'Multi-body roof must produce a non-null WallPlan');
  assert.equal(multiPlan.bodies?.length, 2, 'Two disconnected roofs must yield 2 wall bodies');
  assert.equal(multiPlan.facets.length, 8, 'Two rectangular roofs must produce 8 perimeter wall facets');
  assert.deepEqual(
    multiPlan.facets.map((f) => f.code),
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
  );
  assert.equal(new Set(multiPlan.facets.map((f) => f.id)).size, 8, 'All multi-body facet IDs must be strictly unique');

  // Default cladding must be profiled_metal (NOT unassigned/'none'), while completeness still flags unconfirmed
  assert.ok(
    multiPlan.facets.every((f) => f.claddingType === 'profiled_metal'),
    'Derived multi-body walls must default to profiled_metal rather than unassigned'
  );
  assert.ok(
    multiPlan.facets.every((f) => isWallFacetUndetailed(f)),
    'Freshly derived walls with detailConfirmed=false still flag completeness until confirmed'
  );

  // Topology must analyze each closed ring independently (zero fake return corners jumping across body gap)
  const multiTopo = analyzeWallPlanTopology(multiPlan.facets);
  assert.equal(multiTopo.externalCornersCount, 8);
  assert.equal(multiTopo.internalCornersCount, 0);
  assert.equal(multiTopo.returnFacesCount, 0);

  // Confirming profiled_metal cladding via batch apply clears completeness flag
  const confirmedMulti = applyCladdingToFacets(
    multiPlan,
    multiPlan.facets.map((f) => f.id),
    'profiled_metal'
  );
  assert.ok(
    confirmedMulti.facets.every((f) => !isWallFacetUndetailed(f)),
    'Confirming profiled_metal clears undetailed status'
  );

  // Verify 3D Wall Mesh builder renders both bodies + both ground plinth slabs spanning [0..23]
  const multiGroup = new THREE.Group();
  const multiSelectable: THREE.Mesh[] = [];
  const multiGeos: THREE.BufferGeometry[] = [];
  const multiMats: THREE.Material[] = [];
  const glass25 = new THREE.MeshPhysicalMaterial({ color: '#88ccee' });
  const stubTex25 = {
    getEntry: () => null,
    garageDoor: null,
    garageDoorRoughness: null,
    garageDoorBump: null
  } as any;

  buildWallPlan3DGroup({
    wallPlan: confirmedMulti,
    bounds: {
      minX: -2,
      maxX: 25,
      minY: -2,
      maxY: 10,
      midX: 11.5,
      midY: 4,
      midZ: 1.6,
      maxZ: 3.5,
      span: 27
    },
    selectedWallFacetId: confirmedMulti.facets[5].id,
    wallFilterMode: 'all',
    shadingMode: 'studio_finish',
    showSheetSeams: true,
    wallTextures: stubTex25,
    glassMat: glass25,
    rootGroup: multiGroup,
    selectableMeshes: multiSelectable,
    trackGeo: (g) => {
      multiGeos.push(g);
      return g;
    },
    trackMat: (m) => {
      multiMats.push(m);
      return m;
    }
  });

  assert.equal(multiSelectable.length, 8, 'All 8 walls across both bodies must be selectable meshes in 3D');
  const box = new THREE.Box3().setFromObject(multiGroup);
  assert.ok(box.max.x - box.min.x > 20, '3D wall group must span across both detached building bodies');
  multiGeos.forEach((g) => g.dispose());
  multiMats.forEach((m) => m.dispose());
  glass25.dispose();
}
console.log('✓ Test 25 Passed: Multi-body detached roofs yield 2 wall rings, 8 metal walls, zero fake returns & full 3D coverage');

// 26. 2-Tier Split Roof Fixture -> Walls Under Both Tiers + Preserved Wing Walls + Independent Body Edge Edit
{
  const twoTier = getMultiLevelPreset('two_storey_split', 22.5);
  const twoTierWithWalls = {
    ...twoTier,
    levels: twoTier.levels.map((lvl) => ({
      ...lvl,
      outline: {
        ...lvl.outline,
        edges: lvl.outline.edges.map((e) => ({
          ...e,
          hasWall: true,
          eaveSetbackM: 0.45
        }))
      }
    }))
  };

  // Seed a freestanding wing wall first and verify multi-tier re-derive preserves it alongside both roof rings
  const existingWithWing = addWingWallToPlan(
    null,
    [{ x: -2, y: 2 }, { x: -2, y: 6 }],
    { claddingType: 'brick', heightM: 2.1 }
  );
  const tierWallPlan = deriveWallPlanFromRoofLevels(
    twoTierWithWalls.levels,
    2.7,
    existingWithWing.facets,
    twoTierWithWalls.planes
  )!;
  assert.ok(tierWallPlan, '2-tier split roof must derive a WallPlan');
  assert.equal(tierWallPlan.bodies?.length, 2, '2-tier roof must derive 2 body rings');
  const lowerRingFacets = tierWallPlan.facets.filter(
    (f) => f.bodyId === twoTierWithWalls.levels[0].id
  );
  const upperRingFacets = tierWallPlan.facets.filter(
    (f) => f.bodyId === twoTierWithWalls.levels[1].id
  );
  const preservedWings = tierWallPlan.facets.filter((f) => f.kind === 'wing' || f.isSpur);
  assert.ok(lowerRingFacets.length >= 4, 'Lower tier walls created');
  assert.ok(upperRingFacets.length >= 4, 'Upper tier walls created');
  assert.equal(preservedWings.length, 1, 'Existing wing wall preserved across multi-tier roof derive');
  assert.ok(
    Math.max(...upperRingFacets.map((f) => f.topZ)) > Math.max(...lowerRingFacets.map((f) => f.topZ)),
    'Upper tier walls reach higher eave/roof elevation than lower tier walls'
  );

  // Editing an edge on Body 2 preserves Body 1 and wings cleanly
  const resizedTierPlan = updateWallPlanEdgeLength(
    tierWallPlan,
    upperRingFacets[0].id,
    6.2,
    twoTierWithWalls.levels
  );
  assert.equal(resizedTierPlan.bodies?.length, 2);
  assert.equal(
    resizedTierPlan.facets.filter((f) => f.bodyId === twoTierWithWalls.levels[0].id).length,
    lowerRingFacets.length,
    'Body 1 facets remain intact after editing Body 2 edge'
  );
}
console.log('✓ Test 26 Passed: 2-tier split roof derives lower & upper wall envelopes, preserves wings, and supports independent body edits');

// 27. 2-Tier Rule Integrity: Step Riser bottomZ/topZ Ownership + Per-Level Roof Fit Isolation + Quiet Completeness
{
  const twoTier = getMultiLevelPreset('two_storey_split', 22.5);
  const derived27 = deriveWallPlanFromRoofLevels(
    twoTier.levels,
    2.7,
    undefined,
    twoTier.planes
  )!;
  assert.ok(derived27, 'two_storey_split must derive WallPlan');

  // Step riser on upper level south boundary (over lower verandah) resolves explicit step bottomZ & kind='abutment'
  const upperStepFacet = derived27.facets.find(
    (f) => f.levelId === 'level-2' && (f.bottomZ ?? 0) > 0.5
  );
  assert.ok(upperStepFacet, 'Upper tier step riser wall above lower roof exists');
  assert.ok(
    (upperStepFacet!.bottomZ ?? 0) > 0.5,
    `Step riser bottomZ must sit above lower roof (${upperStepFacet!.bottomZ})`
  );
  assert.equal(upperStepFacet!.kind, 'abutment', 'Step riser owns wall kind abutment');
  assert.ok(
    upperStepFacet!.heightM < 3.0,
    `Step riser net height (${upperStepFacet!.heightM}) equals upper topZ - lower roof Z, not full ground height`
  );

  // Changing upper level eave height (5.4 -> 6.8) updates level-2 walls cleanly without mutating level-1 lower walls
  const lowerHeightsBefore = new Map(
    derived27.facets
      .filter((f) => f.levelId === 'level-1')
      .map((f) => [f.id, { heightM: f.heightM, topZ: f.topZ }])
  );
  const raisedLevels = twoTier.levels.map((lvl) =>
    lvl.id === 'level-2' ? { ...lvl, eaveHeightM: 6.8 } : lvl
  );
  const raisedPlanes = syncMultiLevelPlanes(raisedLevels, twoTier.planes).map((p) =>
    p.levelId === 'level-2' ? { ...p, eaveHeightM: 6.8 } : p
  );
  const synced27 = syncWallPlanWithRoof(derived27, raisedLevels, raisedPlanes);

  synced27.facets
    .filter((f) => f.levelId === 'level-1')
    .forEach((f) => {
      const before = lowerHeightsBefore.get(f.id)!;
      assert.equal(f.heightM, before.heightM, `Lower tier facet ${f.code} height stayed isolated`);
      assert.equal(f.topZ, before.topZ, `Lower tier facet ${f.code} topZ stayed isolated`);
    });
  const syncedStep = synced27.facets.find((f) => f.id === upperStepFacet!.id)!;
  assert.ok(syncedStep.topZ >= 6.7, `Upper step facet rose with level-2 eave (${syncedStep.topZ})`);
  assert.ok(
    syncedStep.heightM > upperStepFacet!.heightM + 1.0,
    'Upper step riser height grew cleanly when level-2 eave rose'
  );

  // Completeness on confirmed 2-tier walls has zero return blockers
  const confirmed27: WallPlan = {
    ...synced27,
    facets: synced27.facets.map((f) => ({ ...f, detailConfirmed: true }))
  };
  const comp27 = evaluateTakeoffCompleteness({
    planes: raisedPlanes,
    levels: raisedLevels,
    assignableLines: [],
    flashingAssignments: [],
    assets: [],
    wallPlan: confirmed27
  });
  assert.equal(comp27.undetailedReturnsCount, 0, '2-tier roof generates zero spurious return blockers');
  assert.equal(comp27.blockersCount, 0, 'Confirmed 2-tier wall plan passes completeness quietly');
}
console.log('✓ Test 27 Passed: 2-tier step riser ownership, per-level roof height scoping, and quiet completeness');

// 28. Cascading 3-Tier Terrace: Single Ownership of Shared 2D Segments + No Open-Chain False Returns + 3D Scene
{
  const terrace = getMultiLevelPreset('cascading_terrace', 15);
  const tWallPlan = deriveWallPlanFromRoofLevels(
    terrace.levels,
    2.4,
    undefined,
    terrace.planes
  )!;
  assert.ok(tWallPlan, 'cascading_terrace must derive WallPlan');
  assert.equal(tWallPlan.bodies?.length, 3, 'Cascading terrace keeps all 3 roof body rings');

  // Shared boundaries y=8 (T2/T3) and y=4 (T1/T2) must have only one owner wall facet each -> 4 + 3 + 3 = 10 total facets
  assert.equal(
    tWallPlan.facets.length,
    10,
    `Cascading 3-tier shared walls deduplicated to single owner per shared line (got ${tWallPlan.facets.length})`
  );

  // Verify no two facets share the exact same unordered 2D endpoint line
  const segKeys = tWallPlan.facets.map((f) => {
    const a = `${f.from.x.toFixed(2)},${f.from.y.toFixed(2)}`;
    const b = `${f.to.x.toFixed(2)},${f.to.y.toFixed(2)}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  });
  assert.equal(new Set(segKeys).size, tWallPlan.facets.length, 'Zero overlapping duplicate wall facets in 2D plan');

  // Open lower chains resulting from shared-wall dedup must NOT synthesize false internal corners or return faces
  const tTopo = analyzeWallPlanTopology(tWallPlan.facets);
  assert.equal(tTopo.internalCornersCount, 0, 'Open lower tier chains do not fabricate internal corners');
  assert.equal(tTopo.returnFacesCount, 0, 'Open lower tier chains do not fabricate short returns');

  // Shared upper step walls remain abutments with positive bottomZ
  const stepWalls = tWallPlan.facets.filter((f) => (f.bottomZ ?? 0) > 0.2);
  assert.equal(stepWalls.length, 2, 'Two terrace step walls (y=8 and y=4) carry explicit bottomZ');
  assert.ok(
    stepWalls.every((f) => f.kind === 'abutment'),
    'Both terrace step walls carry abutment role'
  );

  // Full 3D scene builds cleanly for roof + multi-tier walls
  const stubRoofTex = {
    normalMap: null,
    roughnessMap: null,
    bumpMap: null,
    dispose: () => {}
  } as any;
  const stubWallTex28 = {
    getEntry: () => null,
    weatherboard: { normalMap: null },
    fibre_cement: { normalMap: null },
    brick: { map: null, normalMap: null },
    garageDoor: null,
    garageDoorRoughness: null,
    garageDoorBump: null
  } as any;
  const tScene = buildRoofSceneGroup({
    outline: terrace.levels[0].outline,
    skeleton: terrace.levels[0].skeleton,
    planes: terrace.planes,
    levels: terrace.levels,
    wallPlan: tWallPlan,
    shadingMode: 'studio_finish',
    swatch: { name: 'Ebony', hex: '#1e293b', metalness: 0.45, roughness: 0.35 } as any,
    textures: stubRoofTex,
    wallTextures: stubWallTex28,
    showFlashings: true,
    showWalls: true,
    showSheetSeams: false,
    isSoftwareGl: true
  });
  assert.ok(tScene.rootGroup.children.length > 0, 'Cascading terrace 3D roof + wall scene built cleanly');
  assert.ok(tScene.selectableMeshes.length >= 10, '3D scene exposes roof + wall selectable meshes cleanly');
  tScene.dispose();
}
console.log('✓ Test 28 Passed: Cascading 3-tier terrace enforces single shared-wall ownership, clean topology, and valid 3D scene');

// 29. Gable end walls ('verge' & 'rake') reach true ridge apex cleanly in both deriveRoofWallSegments & WallPlan 3D
{
  const rect29 = getPresetOutline('rectangle_14x10');
  const rakeGableOutline = applyEdgeType(
    rect29,
    [rect29.edges[1].id, rect29.edges[3].id],
    'rake'
  );
  const rakeSkel29 = generateSkeletonLines(rakeGableOutline);
  const lvl29 = {
    ...createRoofLevel(1, 'Main Gable', 2.7, rakeGableOutline.points),
    outline: rakeGableOutline,
    skeleton: rakeSkel29
  };
  const planes29 = syncMultiLevelPlanes([lvl29], [], 25); // 5m half-span * tan(25°) ≈ 2.33m rise -> apex ≈ 5.03m

  const roofWallSegs = deriveRoofWallSegments([lvl29], planes29);
  const gableSegs = roofWallSegs.filter((w) => w.wallKind === 'gable_end');
  assert.equal(gableSegs.length, 2, 'Expected 2 gable wall segments from deriveRoofWallSegments');
  gableSegs.forEach((seg) => {
    const maxPeakZ = Math.max(...seg.topProfilePoints3D.map((p) => p.z));
    assert.ok(
      maxPeakZ > 4.9,
      `Gable wall segment peak Z (${maxPeakZ.toFixed(2)}m) must reach ridge apex (~5.03m), never fallbackZ`
    );
  });

  const wp29 = deriveWallPlanFromRoofLevels([lvl29], 2.7, undefined, planes29)!;
  const syncedWp29 = syncWallPlanWithRoof(wp29, [lvl29], planes29);
  assert.equal(syncedWp29.facets.length, 4, 'Gable rectangle produces 4 perimeter wall facets');
  assert.ok(
    syncedWp29.facets.some((f) => f.roofProfile && Math.max(...f.roofProfile.map((p) => p.topZ)) > 4.9),
    'WallPlan synced gable facets carry raked peak roofProfile reaching true ridge apex'
  );
}
console.log('✓ Test 29 Passed: Gable end walls (verge & rake) reach true ridge apex cleanly in roof & wall 3D');

console.log('--- All Wall Cladding Phase 1, Phase 2 & Parity+ Tests Passed ---');
