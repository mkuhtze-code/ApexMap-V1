import assert from 'node:assert/strict';
import {
  analyzeWallPlanTopology,
  buildWallEdgesFromPoints,
  buildWallFacetsFromPlan,
  buildWallOpeningsSchedule,
  buildWallTakeoffExportData,
  calibrateUnderlayFromTwoPoints,
  clampWallOpeningToFacet,
  computeWallFacetMetrics,
  computeWallTakeoffSummary,
  createDefaultWallOpening,
  createHorizontalDadoSplit,
  createVerticalBaySplit,
  deriveRoofOutlineFromWallPlan,
  deriveWallPlanFromRoofLevels,
  ensureUniqueWallFacetIds,
  fitWallFacetTopToRoof,
  isWallFacetUndetailed,
  linkWallFacetsToRoofLevels,
  syncWallPlanWithRoof,
  updateWallPlanEdgeLength
} from '../wallCladdingEngine';
import {
  applyRoofStylePreset,
  createRoofLevel,
  generateSkeletonLines,
  getPresetOutline,
  syncMultiLevelPlanes
} from '../exactRoofingEngine';

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

console.log('--- All Wall Cladding Phase 1 & Phase 2 + Bidirectional Tests Passed ---');
