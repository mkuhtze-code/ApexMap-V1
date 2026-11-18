import assert from 'node:assert/strict';
import {
  buildWallEdgesFromPoints,
  buildWallFacetsFromPlan,
  clampWallOpeningToFacet,
  computeWallFacetMetrics,
  computeWallTakeoffSummary,
  createDefaultWallOpening,
  deriveWallPlanFromRoofLevels,
  updateWallPlanEdgeLength
} from '../wallCladdingEngine';
import { createRoofLevel, getPresetOutline, generateSkeletonLines } from '../exactRoofingEngine';

console.log('--- Starting Wall Cladding Phase 1 Engine Tests ---');

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

// 3. Preserving per-face cladding & openings when rebuilding faces or editing edge length
const initialPlanEdges = buildWallEdgesFromPoints(uShapePoints, 'wall-edge');
const detailedFacets = uFacets.map((f, idx) => {
  if (idx === 0) {
    return {
      ...f,
      claddingType: 'weatherboard' as const,
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
assert.equal(rebuiltFacets[4].claddingType, 'brick');
assert.equal(rebuiltFacets[4].openings.length, 1);
assert.equal(rebuiltFacets[1].claddingType, 'none');
console.log('✓ Test 3 Passed: Facet cladding & openings survive rebuild');

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
assert.equal(brickGroup.netAreaM2, 9.0);
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

console.log('--- All Wall Cladding Phase 1 Engine Tests Passed ---');
