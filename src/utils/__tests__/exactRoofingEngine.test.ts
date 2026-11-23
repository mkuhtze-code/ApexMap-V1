import {
  getPresetOutline,
  generateSkeletonLines,
  createPlaneFromEdge,
  generateCuttingLayout,
  buildAttachedOutlineFromEdge,
  buildCompleteSquarePoints,
  canCloseDraftSquare,
  classifyOutlineEdge,
  computeCornerAngleDeg,
  computePointAtLengthInDirection,
  createRoofLevel,
  squareOutlineCorner,
  squarePolygonCorner,
  snapPointToSupportingLine,
  isEdgeColinearWithSegment,
  syncMultiLevelPlanes,
  ROOF_LINE_TYPE_CATALOG,
  getRoofEdgeTypeMeta,
  getSkeletonLineTypeMeta,
  applyEdgeType,
  applySkeletonLineType,
  applyEaveSetback,
  applyEaveHeightToEdges,
  applyPitchToPlanes,
  applyDirectionToPlanes,
  applyOrderedSheetLengthToPlanes,
  buildFacesFromClassification,
  deleteRoofPlanes,
  remapSkeletonForOutlineResize,
  unsuppressOutlineEdges,
  mergeColinearRidgeLines,
  resolveLevelSharedVertexElevations
} from '../exactRoofingEngine';
import { buildRoofSceneGroup } from '../../components/exactroofing/three/roofMeshBuilder';
import type { PlanEdge, RoofLevel, RoofOutline, RoofPlane, SheetSpec, SkeletonLine } from '../../types/exactRoofing';

console.log('--- Starting Exact Roofing Engine Test Suite ---');

// 1. TEST 1: 14m x 10m Rectangle & Skeleton Key
const rectOutline = getPresetOutline('rectangle_14x10');
console.log('Test 1 (14x10 Outline):', {
  pointsCount: rectOutline.points.length,
  edgesCount: rectOutline.edges.length
});

if (rectOutline.points.length !== 4 || rectOutline.edges.length !== 4) {
  throw new Error('Failed to generate 14x10 rectangle outline');
}

const rectSkeleton = generateSkeletonLines(rectOutline);
console.log('Test 1 (Skeleton Key):', {
  skeletonLinesCount: rectSkeleton.length,
  types: rectSkeleton.map((s) => s.suggestedType)
});

const ridges = rectSkeleton.filter((s) => s.suggestedType === 'ridge');
const hips = rectSkeleton.filter((s) => s.suggestedType === 'hip');

if (ridges.length !== 1 || hips.length !== 4) {
  throw new Error(`Expected 1 ridge and 4 hips, got ${ridges.length} ridges, ${hips.length} hips`);
}
console.log('✓ Test 1 Passed: 14m x 10m Rectangle produced a classic 4-hip skeleton with 4m central ridge.');

// 2. TEST 2: Define Planes & Developed Geometry at 22.5° Pitch
const planes = rectOutline.edges.map((edge, idx) =>
  createPlaneFromEdge(rectOutline, rectSkeleton, edge, {
    pitchDeg: 22.5,
    underlapSide: idx % 2 === 0 ? 'left' : 'right',
    name: idx === 0 ? 'Trunk South' : idx === 1 ? 'East Hip' : idx === 2 ? 'Trunk North' : 'West Hip'
  })
);

console.log('Test 2 (Defined Planes):', {
  planesCount: planes.length,
  slopeLengths: planes.map((p) => p.slopeLength),
  areas: planes.map((p) => p.area)
});

if (planes.length !== 4) {
  throw new Error(`Expected 4 planes, got ${planes.length}`);
}

const trunkPlane = planes[0]; // 14m eave edge, 5m plan depth
// 5m / cos(22.5°) ≈ 5.41m
if (!trunkPlane.slopeLength || Math.abs(trunkPlane.slopeLength - 5.41) > 0.5) {
  throw new Error(`Expected trunk slope length ~5.41m, got ${trunkPlane.slopeLength}`);
}

if (!trunkPlane.area || trunkPlane.area < 40) {
  throw new Error(`Expected trunk area > 40m², got ${trunkPlane.area}`);
}
console.log('✓ Test 2 Passed: 4 planes defined with true unfolded developed geometry at 22.5° pitch.');

// 3. TEST 3: Dynamic Off-Cut / Block-Cut Engine (0.762m cover, 6.0m max length)
const layout = generateCuttingLayout(planes, {
  coverWidth: 0.762,
  maxLength: 6.0,
  endLap: 0.15,
  overhang: 0.05
}, { sheetOrderMode: 'optimized' });

console.log('Test 3 (Layout Results):', {
  parentSheetsCount: layout.parents.length,
  piecesCount: layout.pieces.length,
  wastePercent: layout.wastePercent,
  savedMetres: layout.savedMetres,
  totalOrderedArea: layout.totalOrderedArea,
  totalRoofArea: layout.totalRoofArea
});

if (layout.wastePercent > 6.5) {
  throw new Error(`Expected waste percent typically under 5%, got ${layout.wastePercent}%`);
}

const flippedPieces = layout.pieces.filter((p) => p.orientation === 'flipped180');
if (flippedPieces.length === 0) {
  throw new Error('Expected paired offcuts flipped into triangular hip ends');
}

if (layout.parents.length === 0 || layout.placementMap.length !== 4) {
  throw new Error('Invalid parent sheets or placement map');
}

console.log('Test 3 (Receiving Zones):', {
  receivingZonesCount: layout.receivingZones.length,
  zones: layout.receivingZones.map((z) => ({
    id: z.id,
    label: z.label,
    sourceCode: z.sourceCode,
    softColor: z.softSourceColor,
    planPts: z.planPolygon.length
  }))
});

if (layout.receivingZones.length === 0) {
  throw new Error('Expected at least 1 offcut receiving zone with color inheritance');
}

layout.receivingZones.forEach((z) => {
  if (z.planPolygon.length < 3) {
    throw new Error(`Expected at least 3 points for receiving zone ${z.id}`);
  }
  if (!z.softSourceColor.startsWith('rgba(')) {
    throw new Error(`Expected soft rgba color for zone ${z.id}, got ${z.softSourceColor}`);
  }
});

const adjacentHipLinks = layout.pairingLinks.filter((l) => l.pairingType === 'adjacent_hip');
console.log('Test 3 (Adjacent Hip Links):', adjacentHipLinks.map((l) => l.labelText));
if (adjacentHipLinks.length === 0) {
  throw new Error('Expected at least 1 pairing link to prioritize adjacent hips in installation sequence');
}

console.log(`✓ Test 3 Passed: Dynamic off-cut engine produced ${layout.wastePercent}% waste, pairing ${flippedPieces.length} offcuts across ${layout.receivingZones.length} inherited receiving zones (prioritizing Adjacent Hips)!`);

// 4. TEST 4: Multi-Valley L-Shape Roof with Mixed Pitches
const lOutline = getPresetOutline('l_shape_standard');
const lSkeleton = generateSkeletonLines(lOutline);
const lValleys = lSkeleton.filter((s) => s.suggestedType === 'valley');
const lRidges = lSkeleton.filter((s) => s.suggestedType === 'ridge');
const lHips = lSkeleton.filter((s) => s.suggestedType === 'hip');

if (lSkeleton.length !== 8) {
  throw new Error(`Expected exactly 8 skeleton lines for L-Shape, got ${lSkeleton.length}`);
}
if (lValleys.length !== 1 || lRidges.length !== 2 || lHips.length !== 5) {
  throw new Error(
    `Expected 1 valley, 2 ridges, 5 hips for L-Shape; got ${lValleys.length} valleys, ${lRidges.length} ridges, ${lHips.length} hips`
  );
}
console.log('Test 4 (L-Shape Skeleton Verified):', {
  totalLines: lSkeleton.length,
  valleys: lValleys.length,
  ridges: lRidges.length,
  hips: lHips.length
});

const lPlanes = lOutline.edges.map((e, idx) =>
  createPlaneFromEdge(lOutline, lSkeleton, e, {
    pitchDeg: idx % 2 === 0 ? 15 : 25, // mixed pitches!
    underlapSide: 'left'
  })
);

const lLayout = generateCuttingLayout(lPlanes, {
  coverWidth: 0.762,
  maxLength: 6.0,
  endLap: 0.15,
  overhang: 0.05
}, { sheetOrderMode: 'optimized' });

if (lLayout.parents.length === 0 || lLayout.wastePercent > 12) {
  throw new Error('Failed to solve L-Shape mixed-pitch roof');
}
console.log(`✓ Test 4 Passed: L-Shape with mixed pitches solved cleanly (${lLayout.wastePercent}% waste).`);

// 5. TEST 5: Editable Measurements (Direct Line Length Editing)
import { updateEdgeLength, updateSkeletonLineLength, dist } from '../exactRoofingEngine';

// Stretch 14m edge to 16.5m
const updatedOutline = updateEdgeLength(rectOutline, 'edge-out-1', 16.5);
const newEdge = updatedOutline.edges.find((e) => e.id === 'edge-out-1')!;
const newEdgeLen = dist(newEdge.from, newEdge.to);

if (Math.abs(newEdgeLen - 16.5) > 0.05) {
  throw new Error(`Expected updated edge length 16.5m, got ${newEdgeLen.toFixed(2)}m`);
}

// Adjust ridge line from 4m to 6.2m
const updatedSkel = updateSkeletonLineLength(rectSkeleton, 'skel-ridge-1', 6.2);
const newRidge = updatedSkel.find((s) => s.id === 'skel-ridge-1')!;
const newRidgeLen = dist(newRidge.from, newRidge.to);

if (Math.abs(newRidgeLen - 6.2) > 0.05) {
  throw new Error(`Expected updated ridge length 6.2m, got ${newRidgeLen.toFixed(2)}m`);
}
console.log(`✓ Test 5 Passed: Direct measurement editing resized edge to ${newEdgeLen.toFixed(2)}m and ridge to ${newRidgeLen.toFixed(2)}m accurately.`);

// 6. TEST 6: T-Shape Roof (Clean Continuous Ridges, Zero Diagonal/Starburst)
import { buildOutlineFromPoints, isPointInPolygon, pointsClose } from '../exactRoofingEngine';

const tOutline = getPresetOutline('t_shape');
const tSkeleton = generateSkeletonLines(tOutline);
const tValleys = tSkeleton.filter((s) => s.suggestedType === 'valley');
const tRidges = tSkeleton.filter((s) => s.suggestedType === 'ridge');
const tHips = tSkeleton.filter((s) => s.suggestedType === 'hip');

console.log('Test 6 (T-Shape Skeleton):', {
  total: tSkeleton.length,
  valleys: tValleys.length,
  ridges: tRidges.length,
  hips: tHips.length,
  ridgeCoords: tRidges.map((r) => `${r.from.x},${r.from.y}->${r.to.x},${r.to.y}`)
});

if (tValleys.length !== 2 || tHips.length !== 6 || tRidges.length !== 2) {
  throw new Error(
    `Expected 2 valleys, 2 continuous ridges, 6 hips for symmetric T-Shape; got ${tValleys.length}V, ${tRidges.length}R, ${tHips.length}H`
  );
}

// Verify ridges are strictly horizontal/vertical parallel to long eaves (no crooked diagonal ridge)
tRidges.forEach((r) => {
  const dx = Math.abs(r.to.x - r.from.x);
  const dy = Math.abs(r.to.y - r.from.y);
  if (dx > 0.05 && dy > 0.05) {
    throw new Error(`T-Shape ridge must align parallel to eaves, got diagonal (${r.from.x},${r.from.y})->(${r.to.x},${r.to.y})`);
  }
});

// Verify all 8 faces trace cleanly for T-Shape
const tPlanes = tOutline.edges.map((e) => createPlaneFromEdge(tOutline, tSkeleton, e, { pitchDeg: 22.5 }));
tPlanes.forEach((p) => {
  if (!p.area || p.area <= 1) {
    throw new Error(`Invalid T-Shape face ${p.name} area ${p.area}`);
  }
});
console.log('✓ Test 6 Passed: T-Shape produced 2 valleys, 6 hips, and 2 orthogonal continuous ridges.');

// 7. TEST 7: Asymmetric T-Shape & Asymmetric L-Shape
const asymLOutline = buildOutlineFromPoints([
  { x: 0, y: 0 },
  { x: 16, y: 0 },
  { x: 16, y: 6 },
  { x: 8, y: 6 },
  { x: 8, y: 14 },
  { x: 0, y: 14 }
]);
const asymLSkeleton = generateSkeletonLines(asymLOutline);
if (
  asymLSkeleton.filter((s) => s.suggestedType === 'valley').length !== 1 ||
  asymLSkeleton.filter((s) => s.suggestedType === 'hip').length !== 5
) {
  throw new Error('Asymmetric L-Shape must classify 1 valley and 5 hips cleanly');
}

const asymTOutline = buildOutlineFromPoints([
  { x: 4, y: 0 },
  { x: 11, y: 0 },
  { x: 11, y: 5 },
  { x: 15, y: 5 },
  { x: 15, y: 11 },
  { x: 0, y: 11 },
  { x: 0, y: 5 },
  { x: 4, y: 5 }
]);
const asymTSkeleton = generateSkeletonLines(asymTOutline);
if (
  asymTSkeleton.filter((s) => s.suggestedType === 'valley').length !== 2 ||
  asymTSkeleton.filter((s) => s.suggestedType === 'hip').length !== 6
) {
  throw new Error('Asymmetric T-Shape must classify 2 valleys and 6 hips cleanly');
}
console.log('✓ Test 7 Passed: Asymmetric L-Shape & T-Shape skeletons solved cleanly without starbursts.');

// 8. TEST 8: U-Shape with Open Courtyard (No Lines Crossing Outside Courtyard!)
const uOutline = buildOutlineFromPoints([
  { x: 0, y: 0 },
  { x: 16, y: 0 },
  { x: 16, y: 12 },
  { x: 11, y: 12 },
  { x: 11, y: 5 },
  { x: 5, y: 5 },
  { x: 5, y: 12 },
  { x: 0, y: 12 }
]);
const uSkeleton = generateSkeletonLines(uOutline);
const uValleys = uSkeleton.filter((s) => s.suggestedType === 'valley');
const uRidges = uSkeleton.filter((s) => s.suggestedType === 'ridge');
const uHips = uSkeleton.filter((s) => s.suggestedType === 'hip');

if (uValleys.length !== 2 || uHips.length !== 6 || uRidges.length !== 3) {
  throw new Error(
    `Expected 2 valleys, 3 ridges, 6 hips for U-Shape; got ${uValleys.length}V, ${uRidges.length}R, ${uHips.length}H`
  );
}
uSkeleton.forEach((line) => {
  const mid = { x: (line.from.x + line.to.x) / 2, y: (line.from.y + line.to.y) / 2 };
  if (!isPointInPolygon(mid, uOutline.points)) {
    throw new Error(`U-Shape skeleton segment ${line.id} midpoint (${mid.x},${mid.y}) lies outside roof courtyard!`);
  }
});
console.log('✓ Test 8 Passed: U-Shape produced 2 valleys, 3 wing ridges, 6 hips — zero lines crossing courtyard.');

// 9. TEST 9: H-Shape Roof (4 Reflex Valleys, 8 Convex Hips)
const hOutline = buildOutlineFromPoints([
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 12, y: 4 },
  { x: 12, y: 0 },
  { x: 16, y: 0 },
  { x: 16, y: 14 },
  { x: 12, y: 14 },
  { x: 12, y: 10 },
  { x: 4, y: 10 },
  { x: 4, y: 14 },
  { x: 0, y: 14 }
]);
const hSkeleton = generateSkeletonLines(hOutline);
const hValleys = hSkeleton.filter((s) => s.suggestedType === 'valley');
const hHips = hSkeleton.filter((s) => s.suggestedType === 'hip');
if (hValleys.length !== 4 || hHips.length !== 8) {
  throw new Error(`Expected 4 valleys and 8 hips for H-Shape; got ${hValleys.length}V, ${hHips.length}H`);
}
hSkeleton.forEach((line) => {
  const mid = { x: (line.from.x + line.to.x) / 2, y: (line.from.y + line.to.y) / 2 };
  if (!isPointInPolygon(mid, hOutline.points)) {
    throw new Error(`H-Shape skeleton segment ${line.id} lies outside roof outline`);
  }
});
console.log(`✓ Test 9 Passed: H-Shape produced 4 valleys, 8 hips, and ${hSkeleton.filter((s) => s.suggestedType === 'ridge').length} ridges.`);

// 10. TEST 10: Hexagonal Pavilion & Triangle (All Convex Corners Connected, No Dropped Vertices)
const hexOutline = buildOutlineFromPoints([
  { x: 4, y: 0 },
  { x: 10, y: 0 },
  { x: 14, y: 6.9 },
  { x: 10, y: 13.8 },
  { x: 4, y: 13.8 },
  { x: 0, y: 6.9 }
]);
const hexSkeleton = generateSkeletonLines(hexOutline);
const hexHips = hexSkeleton.filter((s) => s.suggestedType === 'hip');
if (hexHips.length !== 6) {
  throw new Error(`Expected all 6 hexagon convex corners to get hips, got ${hexHips.length}`);
}
hexOutline.points.forEach((pt, idx) => {
  const connected = hexHips.some((h) => pointsClose(h.from, pt, 0.05) || pointsClose(h.to, pt, 0.05));
  if (!connected) {
    throw new Error(`Hexagon vertex ${idx} (${pt.x},${pt.y}) was dropped!`);
  }
});

const triOutline = buildOutlineFromPoints([
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 5, y: 8.66 }
]);
const triSkeleton = generateSkeletonLines(triOutline);
if (triSkeleton.length !== 3 || triSkeleton.filter((s) => s.suggestedType === 'hip').length !== 3) {
  throw new Error(`Expected 3 hips for triangle, got ${triSkeleton.length}`);
}
console.log('✓ Test 10 Passed: Hexagon (6 hips, all vertices preserved) and Triangle solved cleanly.');

// 11. TEST 11: Clockwise Winding Invariance & Short Fragment Collapse
const cwTOutline = buildOutlineFromPoints([...tOutline.points].reverse());
const cwTSkeleton = generateSkeletonLines(cwTOutline);
if (
  cwTSkeleton.filter((s) => s.suggestedType === 'valley').length !== 2 ||
  cwTSkeleton.filter((s) => s.suggestedType === 'ridge').length !== 2 ||
  cwTSkeleton.filter((s) => s.suggestedType === 'hip').length !== 6
) {
  throw new Error('Clockwise T-Shape outline must produce identical skeleton counts to CCW');
}

// Near-equal wing widths (6.0m cross vs 6.2m stem) should collapse tiny <0.35m ridge stub
const nearEqualT = buildOutlineFromPoints([
  { x: 3.9, y: 0 },
  { x: 10.1, y: 0 },
  { x: 10.1, y: 6 },
  { x: 14, y: 6 },
  { x: 14, y: 12 },
  { x: 0, y: 12 },
  { x: 0, y: 6 },
  { x: 3.9, y: 6 }
]);
const nearEqualSkel = generateSkeletonLines(nearEqualT);
nearEqualSkel.forEach((s) => {
  if (dist(s.from, s.to) < 0.25) {
    throw new Error(`Micro ridge/skeleton fragment ${s.id} (${dist(s.from, s.to).toFixed(2)}m) was not collapsed`);
  }
});
console.log('✓ Test 11 Passed: Clockwise winding invariance & short ridge fragment collapse verified.');

// 12. TEST 12: Opposite-Hip Offcut Transfers & Hip/Valley/Ridge Sheet Direction Invariants
const rectSeq = layout.installationSequence || [];
if (rectSeq.length !== 4 || rectSeq.some((s, idx) => s.stepNumber !== idx + 1 || s.sequenceIndex !== idx + 1)) {
  throw new Error('Installation sequence must number every face sequentially with both stepNumber and sequenceIndex');
}

const unitLayVec = (entry?: { x: number; y: number }, exit?: { x: number; y: number }) => {
  if (!entry || !exit) return { x: 0, y: 0 };
  const d = dist(entry, exit) || 1;
  return { x: (exit.x - entry.x) / d, y: (exit.y - entry.y) / d };
};

// Verify all 4 faces on 14x10 rectangle obey hip/valley symmetry (both into OR both away) & ridge opposition
for (let k = 0; k < layout.sections.length; k++) {
  const sCur = layout.sections[k];
  const sNext = layout.sections[(k + 1) % layout.sections.length];
  const vCur = unitLayVec(sCur.entryCorner, sCur.exitCorner);
  const vNext = unitLayVec(sNext.entryCorner, sNext.exitCorner);

  // Corner shared between sCur and sNext:
  const sharedCorner = k % 2 === 0 ? sCur.exitCorner! : sCur.entryCorner!;
  const toCornerCur = dist(sCur.exitCorner!, sharedCorner) < 0.2 ? 1 : -1;
  const toCornerNext = dist(sNext.exitCorner!, sharedCorner) < 0.2 ? 1 : -1;
  if (toCornerCur !== toCornerNext) {
    throw new Error(`Hip between ${sCur.code} and ${sNext.code} must have both faces laying into or away from the corner`);
  }

  // Cross-ridge opposing faces (k vs k+2) must lay in opposite directions
  const sOpp = layout.sections[(k + 2) % layout.sections.length];
  const vOpp = unitLayVec(sOpp.entryCorner, sOpp.exitCorner);
  if (vCur.x * vOpp.x + vCur.y * vOpp.y > -0.95) {
    throw new Error(`Ridge opposite faces ${sCur.code} and ${sOpp.code} must run in opposite directions`);
  }
}

// Verify Step 1 offcuts from A (#1) land on B's OPPOSITE hip (Hip 2 at NE (14,10)), NOT adjacent side of Hip 1 (SE (14,0))!
const linkAB = layout.pairingLinks[0];
if (!linkAB || linkAB.piecesTransferred < 4) {
  throw new Error(`Expected primary hip batch transfer A->B, got ${linkAB?.labelText}`);
}
if (dist(linkAB.endPoint, { x: 14, y: 10 }) >= dist(linkAB.endPoint, { x: 14, y: 0 })) {
  throw new Error(`Expected A's Hip 1 offcuts to land on B's opposite hip (NE 14,10), got (${linkAB.endPoint.x},${linkAB.endPoint.y})`);
}

// Uniform-pitch L-Shape: check alternating hip/valley direction & all 6 loop transfers
const lUniformPlanes = lOutline.edges.map((e, idx) =>
  createPlaneFromEdge(lOutline, lSkeleton, e, {
    pitchDeg: 22.5,
    underlapSide: idx % 2 === 0 ? 'left' : 'right'
  })
);
const lUniformLayout = generateCuttingLayout(lUniformPlanes, {
  coverWidth: 0.762,
  maxLength: 6.0,
  endLap: 0.15,
  overhang: 0.05
}, { sheetOrderMode: 'optimized' });

if (lUniformLayout.pairingLinks.length !== 6) {
  throw new Error(`Expected 6 progressive hip/valley loop links on uniform L-Shape, got ${lUniformLayout.pairingLinks.length}`);
}

for (let k = 0; k < lUniformLayout.sections.length; k++) {
  const sCur = lUniformLayout.sections[k];
  const sNext = lUniformLayout.sections[(k + 1) % lUniformLayout.sections.length];
  const sharedCorner = k % 2 === 0 ? sCur.exitCorner! : sCur.entryCorner!;
  const curIntoCorner = dist(sCur.exitCorner!, sharedCorner) < 0.2;
  const nextIntoCorner = dist(sNext.exitCorner!, sharedCorner) < 0.2;
  if (curIntoCorner !== nextIntoCorner) {
    throw new Error(`L-Shape corner between ${sCur.code} and ${sNext.code} broke hip/valley symmetry!`);
  }
}

lUniformLayout.pairingLinks.forEach((link) => {
  if (link.piecesTransferred < 2) {
    throw new Error(`Unexpected 1-piece link ${link.labelText} on uniform L-Shape`);
  }
});
console.log('✓ Test 12 Passed: Opposite-hip offcut handoff & hip/valley/ridge direction invariants verified.');

// 13. TEST 13: Hip <-> Gable Junction Toggling & Verge Edge Sync
import {
  getRoofJunctionNodes,
  toggleJunctionGable,
  syncPlanesWithOutlineAndSkeleton
} from '../exactRoofingEngine';

const hipJunctions = getRoofJunctionNodes(rectOutline, rectSkeleton);
if (hipJunctions.length !== 2 || hipJunctions.some((j) => j.mode !== 'hipped')) {
  throw new Error(`Expected 2 hipped junctions on 14x10 rectangle, got ${hipJunctions.length}`);
}

const eastToggle = toggleJunctionGable(rectOutline, rectSkeleton, hipJunctions[0].id);
if (eastToggle.toggledTo !== 'gable') {
  throw new Error(`Expected toggle to gable, got ${eastToggle.toggledTo}`);
}
if (eastToggle.outline.edges.filter((e) => e.type === 'verge').length !== 1) {
  throw new Error('Expected 1 verge edge after toggling Hip -> Gable');
}
const extendedRidge = eastToggle.skeleton.find((s) => s.suggestedType === 'ridge')!;
if (Math.abs(dist(extendedRidge.from, extendedRidge.to) - 9.0) > 0.1) {
  throw new Error(`Expected ridge to extend to 9.0m, got ${dist(extendedRidge.from, extendedRidge.to).toFixed(2)}m`);
}

const halfGablePlanes = syncPlanesWithOutlineAndSkeleton(eastToggle.outline, eastToggle.skeleton, planes, 22.5);
if (halfGablePlanes.length !== 3) {
  throw new Error(`Expected 3 sheeted roof planes after 1 gable end, got ${halfGablePlanes.length}`);
}
if (!halfGablePlanes[0].edges.some((e) => e.type === 'verge')) {
  throw new Error('Expected adjoining side plane edges to include verge');
}
const halfGableLayout = generateCuttingLayout(halfGablePlanes, {
  coverWidth: 0.762,
  maxLength: 6.0,
  endLap: 0.15,
  overhang: 0.05
});
if (halfGableLayout.sections.length !== 3 || halfGableLayout.pieces.length === 0) {
  throw new Error('Failed to generate cutting layout on half-gable roof');
}

// Toggle back Gable -> Hip
const restoredToggle = toggleJunctionGable(eastToggle.outline, eastToggle.skeleton, hipJunctions[0].id);
if (restoredToggle.toggledTo !== 'hipped') {
  throw new Error(`Expected toggle back to hipped, got ${restoredToggle.toggledTo}`);
}
const restoredPlanes = syncPlanesWithOutlineAndSkeleton(
  restoredToggle.outline,
  restoredToggle.skeleton,
  halfGablePlanes,
  22.5
);
const restoredRidge = restoredToggle.skeleton.find((s) => s.suggestedType === 'ridge')!;
if (
  restoredPlanes.length !== 4 ||
  restoredToggle.skeleton.filter((s) => s.suggestedType === 'hip').length !== 4 ||
  Math.abs(dist(restoredRidge.from, restoredRidge.to) - 4.0) > 0.1
) {
  throw new Error('Failed to cleanly restore 4-hip rectangle when toggling Gable -> Hip');
}
console.log('✓ Test 13 Passed: Hip <-> Gable junction toggling & verge plane sync verified.');

// 14. TEST 14: Skylight & Chimney Sheet Column Cutouts & Split Offcut Reuse
const skylightAsset = {
  id: 'asset-sky-1',
  type: 'skylight' as const,
  planeId: planes[0].id,
  center: { x: 7.0, y: 2.5 },
  widthM: 1.6,
  depthM: 1.5,
  label: 'Velux Skylight'
};
const skylightLayout = generateCuttingLayout(
  planes,
  { coverWidth: 0.762, maxLength: 6.0, endLap: 0.15, overhang: 0.05 },
  { assets: [skylightAsset] }
);
const splitPieces = skylightLayout.pieces.filter((p) => p.splitFromAssetId === skylightAsset.id);
if (splitPieces.length < 4) {
  throw new Error(`Expected >= 4 top split sheets above skylight, got ${splitPieces.length}`);
}
if (skylightLayout.totalRoofMetres >= layout.totalRoofMetres) {
  throw new Error(
    `Expected total roof metres with skylight cutout (${skylightLayout.totalRoofMetres}) < uncut (${layout.totalRoofMetres})`
  );
}
console.log(`✓ Test 14 Passed: Skylight aperture split sheet columns cleanly (${splitPieces.length} top split pieces, ${skylightLayout.wastePercent}% waste).`);

// 15. TEST 15: Mono-Pitch & Gable Dormers (Apertures + Derived Slopes + Sheets)
const monoDormer = {
  id: 'asset-mono-1',
  type: 'mono_dormer' as const,
  planeId: planes[0].id,
  center: { x: 4.5, y: 2.5 },
  widthM: 2.4,
  depthM: 2.0,
  dormerPitchDeg: 12,
  label: 'Mono Dormer'
};
const gableDormer = {
  id: 'asset-gable-d1',
  type: 'gable_dormer' as const,
  planeId: planes[2].id,
  center: { x: 7.0, y: 7.5 },
  widthM: 2.6,
  depthM: 2.2,
  dormerPitchDeg: 25,
  label: 'Gable Dormer'
};
const dormerLayout = generateCuttingLayout(
  planes,
  { coverWidth: 0.762, maxLength: 6.0, endLap: 0.15, overhang: 0.05 },
  { assets: [monoDormer, gableDormer] }
);
const effDormerPlanes = dormerLayout.effectivePlanes || [];
const derivedMono = effDormerPlanes.filter((p) => p.parentAssetId === monoDormer.id);
const derivedGable = effDormerPlanes.filter((p) => p.parentAssetId === gableDormer.id);
if (derivedMono.length !== 1 || derivedMono[0].pitchDeg !== 12) {
  throw new Error(`Expected 1 Mono Dormer plane at 12°, got ${derivedMono.length}`);
}
if (derivedGable.length !== 2 || derivedGable.some((p) => p.pitchDeg !== 25)) {
  throw new Error(`Expected 2 Gable Dormer planes at 25°, got ${derivedGable.length}`);
}
const dormerPieces = dormerLayout.pieces.filter((p) => p.targetPlaneId.startsWith('plane-asset-'));
if (dormerPieces.length < 6) {
  throw new Error(`Expected cut pieces generated for all derived dormer slopes, got ${dormerPieces.length}`);
}
console.log(`✓ Test 15 Passed: Mono & Gable dormers generated ${derivedMono.length + derivedGable.length} derived roof planes and ${dormerPieces.length} cut sheets.`);

// 16. TEST 16: Change-of-Pitch Break Line Splitting (Apron + Upper Slope + 3D Intersection Sync)
const pitchBreak = {
  id: 'pb-south-1',
  planeId: planes[0].id,
  splitPlanDistM: 2.0,
  lowerPitchDeg: 10,
  label: 'Veranda Pitch Break'
};
const breakLayout = generateCuttingLayout(
  planes,
  { coverWidth: 0.762, maxLength: 6.0, endLap: 0.15, overhang: 0.05 },
  { pitchBreaks: [pitchBreak] }
);
const effBreakPlanes = breakLayout.effectivePlanes || [];
const lowerApron = effBreakPlanes.find((p) => p.id === `${planes[0].id}__lower`);
const upperMain = effBreakPlanes.find((p) => p.id === `${planes[0].id}__upper`);
if (!lowerApron || !upperMain || effBreakPlanes.length !== 5) {
  throw new Error(`Expected 5 effective planes with lower_apron and upper_main split, got ${effBreakPlanes.length}`);
}
if (lowerApron.pitchDeg !== 10 || upperMain.pitchDeg !== 22.5 || (upperMain.eaveHeightM || 0) <= (lowerApron.eaveHeightM || 0)) {
  throw new Error('Expected lower_apron at 10° and elevated upper_main at 22.5°');
}

// Verify baseline vertex ordering is NOT inverted after clipping
if (
  Math.hypot(lowerApron.planPolygon[0].x - 0, lowerApron.planPolygon[0].y - 0) > 0.05 ||
  Math.hypot(lowerApron.planPolygon[1].x - 14, lowerApron.planPolygon[1].y - 0) > 0.05 ||
  Math.hypot(upperMain.planPolygon[0].x - 2, upperMain.planPolygon[0].y - 2) > 0.05 ||
  Math.hypot(upperMain.planPolygon[1].x - 12, upperMain.planPolygon[1].y - 2) > 0.05
) {
  throw new Error('Split lower/upper pitch break polygons must preserve bottom-edge baseline [0]->[1] orientation');
}

// Verify 3D intersection elevation alignment (upper_main aligns with unbroken ridge, apron meets crease flush)
const expectedRidgeZ = 2.7 + 5.0 * Math.tan((22.5 * Math.PI) / 180);
const actualUpperRidgeZ = (upperMain.eaveHeightM || 0) + 3.0 * Math.tan((22.5 * Math.PI) / 180);
const actualApronCreaseZ = (lowerApron.eaveHeightM || 0) + 2.0 * Math.tan((10 * Math.PI) / 180);
if (Math.abs(actualUpperRidgeZ - expectedRidgeZ) > 0.02) {
  throw new Error(`Upper slope ridge height (${actualUpperRidgeZ.toFixed(3)}m) misaligned with unbroken roof (${expectedRidgeZ.toFixed(3)}m)`);
}
if (Math.abs(actualApronCreaseZ - (upperMain.eaveHeightM || 0)) > 0.02) {
  throw new Error(`Lower apron top height (${actualApronCreaseZ.toFixed(3)}m) misaligned with upper break height (${upperMain.eaveHeightM}m)`);
}

// Verify perimeter parity & adjacent-face lay directions stay synchronized (South->East->North->West)
const unbrokenSeq = layout.sections.map((s) => ({
  id: s.planeId,
  seq: s.sequenceIndex,
  entry: s.entryCorner,
  exit: s.exitCorner
}));
const breakMainSeq = breakLayout.sections
  .filter((s) => s.planeId !== upperMain.id)
  .map((s) => ({
    id: s.planeId.replace('__lower', ''),
    seq: s.sequenceIndex,
    entry: s.entryCorner,
    exit: s.exitCorner
  }));
if (breakMainSeq.length !== 4) {
  throw new Error(`Expected 4 main perimeter sequence steps, got ${breakMainSeq.length}`);
}
for (let i = 0; i < 4; i++) {
  if (
    breakMainSeq[i].id !== unbrokenSeq[i].id ||
    Math.hypot((breakMainSeq[i].entry?.x || 0) - (unbrokenSeq[i].entry?.x || 0), (breakMainSeq[i].entry?.y || 0) - (unbrokenSeq[i].entry?.y || 0)) > 0.05 ||
    Math.hypot((breakMainSeq[i].exit?.x || 0) - (unbrokenSeq[i].exit?.x || 0), (breakMainSeq[i].exit?.y || 0) - (unbrokenSeq[i].exit?.y || 0)) > 0.05
  ) {
    throw new Error(`Pitch break shifted perimeter installation sequence or lay direction at step ${i + 1}`);
  }
}

// Verify upperMain matches lowerApron sheet lay direction along +u/-u
const lowerSec = breakLayout.sections.find((s) => s.planeId === lowerApron.id)!;
const upperSec = breakLayout.sections.find((s) => s.planeId === upperMain.id)!;
const lowerDirX = (lowerSec.exitCorner?.x || 0) - (lowerSec.entryCorner?.x || 0);
const upperDirX = (upperSec.exitCorner?.x || 0) - (upperSec.entryCorner?.x || 0);
if (lowerDirX * upperDirX <= 0) {
  throw new Error('Expected upper_main pitch break zone to lay in the same direction as lower_apron');
}

if (
  !breakLayout.pieces.some((p) => p.targetPlaneId === lowerApron.id) ||
  !breakLayout.pieces.some((p) => p.targetPlaneId === upperMain.id)
) {
  throw new Error('Expected sheet strips generated for both lower apron and upper main pitch zones');
}
console.log('✓ Test 16 Passed: Change-of-Pitch break anchored at 3D upper intersection, baseline order preserved, and perimeter sequence synced.');

// 17. TEST 17: Pitch-Matched Gable Dormer Valleys & Tapered Host Sheet Cuts
import { computeGableDormerGeometry } from '../exactRoofingEngine';

const equalPitchDormer = {
  id: 'asset-gable-eq',
  type: 'gable_dormer' as const,
  planeId: planes[0].id,
  center: { x: 7.0, y: 2.2 },
  widthM: 2.6,
  depthM: 2.6,
  dormerPitchDeg: 22.5,
  label: 'Equal Pitch Dormer'
};
const equalGeom = computeGableDormerGeometry(planes[0], equalPitchDormer);
if (!equalGeom || Math.abs(equalGeom.valleyAngleDeg - 45.0) > 0.2 || Math.abs(equalGeom.deltaVValley - 1.3) > 0.05) {
  throw new Error(`Expected 45° equal-pitch valley & 1.3m run, got ${equalGeom?.valleyAngleDeg}° / ${equalGeom?.deltaVValley}m`);
}

// Verify steep 35° dormer on 15° shallow host roof produces long acute valleys (< 25° from ridge)
const shallowHostPlane = createPlaneFromEdge(rectOutline, rectSkeleton, rectOutline.edges[0], { pitchDeg: 15 });
const steepDormer = { ...equalPitchDormer, id: 'asset-gable-steep', dormerPitchDeg: 35, depthM: 2.0 };
const steepGeom = computeGableDormerGeometry(shallowHostPlane, steepDormer);
if (!steepGeom || steepGeom.valleyAngleDeg >= 25 || steepGeom.deltaVValley <= steepDormer.widthM / 2 * 2.0) {
  throw new Error(`Expected steep dormer on 15° roof to extend acute valleys, got ${steepGeom?.valleyAngleDeg}°`);
}

// Verify flat 12° dormer on 30° steep host roof produces wide shallow valleys (> 65° from ridge)
const steepHostPlane = createPlaneFromEdge(rectOutline, rectSkeleton, rectOutline.edges[0], { pitchDeg: 30 });
const flatDormer = { ...equalPitchDormer, id: 'asset-gable-flat', dormerPitchDeg: 12 };
const flatGeom = computeGableDormerGeometry(steepHostPlane, flatDormer);
if (!flatGeom || flatGeom.valleyAngleDeg <= 65 || flatGeom.deltaVValley >= flatDormer.widthM / 2 * 0.5) {
  throw new Error(`Expected flat dormer on 30° roof to produce blunt valleys (>65°), got ${flatGeom?.valleyAngleDeg}°`);
}

// Verify exact 3D plane intersection heights on equal-pitch dormer
const hostTanEq = Math.tan((22.5 * Math.PI) / 180);
const zHostAtCheek = (planes[0].eaveHeightM ?? 2.7) + equalGeom.vCheekBack * hostTanEq;
const zHostAtTie = (planes[0].eaveHeightM ?? 2.7) + equalGeom.vRidgeTie * hostTanEq;
if (Math.abs(zHostAtCheek - equalGeom.sideEaveHeightM) > 0.02 || Math.abs(zHostAtTie - equalGeom.ridgeHeightM) > 0.02) {
  throw new Error('Gable dormer valley vertices did not match host roof elevation cleanly');
}

// Verify tapered host sheet cuts above the angled valleys (center cut above ridge tie < outer valley cut)
const valleyCutLayout = generateCuttingLayout(
  planes,
  { coverWidth: 0.762, maxLength: 6.0, endLap: 0.15, overhang: 0.05 },
  { assets: [equalPitchDormer] }
);
const topHostSplitSheets = valleyCutLayout.pieces
  .filter((p) => p.targetPlaneId === planes[0].id && p.splitFromAssetId === equalPitchDormer.id && (p.minV || 0) > 1.0)
  .sort((a, b) => a.length - b.length);
if (topHostSplitSheets.length < 3 || topHostSplitSheets[topHostSplitSheets.length - 1].length - topHostSplitSheets[0].length < 0.3) {
  throw new Error('Expected host sheets above gable dormer valleys to taper significantly in length across valley angle');
}
console.log(`✓ Test 17 Passed: Pitch-matched gable dormer valleys (${equalGeom.valleyAngleDeg}° @ 22.5°/22.5°, ${steepGeom.valleyAngleDeg}° @ 35°/15°, ${flatGeom.valleyAngleDeg}° @ 12°/30°) & tapered valley host sheets verified.`);

// 18. TEST 18: Arbitrary Hip <-> Gable Edge Toggling, Stepped 13.5m x 9.5m Gable & Style Presets
import { toggleEdgeGable, applyRoofStylePreset } from '../exactRoofingEngine';

const steppedOutline = buildOutlineFromPoints([
  { x: 0, y: 0 },
  { x: 6.5, y: 0 },
  { x: 6.5, y: 2 },
  { x: 10.5, y: 2 },
  { x: 10.5, y: 4 },
  { x: 13.5, y: 4 },
  { x: 13.5, y: 9.5 },
  { x: 0, y: 9.5 }
]);
const steppedInitSkel = generateSkeletonLines(steppedOutline);
const rightEdge55 = steppedOutline.edges.find((e) => Math.abs(dist(e.from, e.to) - 5.5) < 0.05)!;
const leftEdge95 = steppedOutline.edges.find((e) => Math.abs(dist(e.from, e.to) - 9.5) < 0.05)!;
const topEdge135 = steppedOutline.edges.find((e) => Math.abs(dist(e.from, e.to) - 13.5) < 0.05)!;

if (!rightEdge55 || !leftEdge95 || !topEdge135) {
  throw new Error('Failed to locate expected 5.5m, 9.5m, and 13.5m edges on stepped 13.5x9.5 outline');
}

// Step A: Toggle Right 5.5m AND Left 9.5m directly to gable verges
const stepA1 = toggleEdgeGable(steppedOutline, steppedInitSkel, rightEdge55.id, 'gable');
const stepA2 = toggleEdgeGable(stepA1.outline, stepA1.skeleton, leftEdge95.id, 'gable');
if (
  stepA2.toggledTo !== 'gable' ||
  stepA2.outline.edges.filter((e) => e.type === 'verge').length !== 2
) {
  throw new Error('Expected both 5.5m right and 9.5m left edges to convert to verge gable ends');
}

const mixedSteppedPlanes = syncPlanesWithOutlineAndSkeleton(stepA2.outline, stepA2.skeleton, [], 22.5);
const topPlaneMixed = mixedSteppedPlanes.find((p) => p.eaveEdgeId === topEdge135.id);
if (!topPlaneMixed || !topPlaneMixed.area || topPlaneMixed.planPolygon.length < 5) {
  throw new Error(
    `Expected stepped top 13.5m plane with multi-step ridge polygon, got ${topPlaneMixed?.planPolygon.length} pts`
  );
}
const mixedSteppedLayout = generateCuttingLayout(mixedSteppedPlanes, {
  coverWidth: 0.762,
  maxLength: 6.0,
  endLap: 0.15,
  overhang: 0.05
});
if (mixedSteppedLayout.sections.length !== mixedSteppedPlanes.length || mixedSteppedLayout.pieces.length === 0) {
  throw new Error('Failed to generate cutting layout on mixed stepped gable roof');
}

// Step B: Apply Full Gable Ends Preset (9.5m left, 2m step risers, and 5.5m right all become verges)
const fullGablePreset = applyRoofStylePreset(steppedOutline, 'gable');
const fullGableVerges = fullGablePreset.outline.edges.filter((e) => e.type === 'verge');
if (fullGableVerges.length !== 4) {
  throw new Error(`Expected all 4 vertical end/step walls to become gable verges, got ${fullGableVerges.length}`);
}
const fullGablePlanes = syncPlanesWithOutlineAndSkeleton(fullGablePreset.outline, fullGablePreset.skeleton, [], 22.5);
if (fullGablePlanes.length !== 4) {
  throw new Error(`Expected 4 sheeted roof planes for stepped full-gable roof, got ${fullGablePlanes.length}`);
}
fullGablePlanes.forEach((p) => {
  if (!p.area || p.area <= 1) {
    throw new Error(`Invalid area (${p.area}) on stepped gable plane ${p.name}`);
  }
});
const fullGableLayout = generateCuttingLayout(fullGablePlanes, {
  coverWidth: 0.762,
  maxLength: 6.0,
  endLap: 0.15,
  overhang: 0.05
});
if (fullGableLayout.sections.length !== 4 || fullGableLayout.pieces.length === 0) {
  throw new Error('Failed to generate cutting layout for full stepped gable roof');
}

// Step C: Apply All Hipped Preset back on the stepped outline
const restoredHippedPreset = applyRoofStylePreset(fullGablePreset.outline, 'hipped');
if (restoredHippedPreset.outline.edges.some((e) => e.type === 'verge')) {
  throw new Error('Expected All Hipped preset to restore all edges to outline eaves');
}
const restoredHippedPlanes = syncPlanesWithOutlineAndSkeleton(
  restoredHippedPreset.outline,
  restoredHippedPreset.skeleton,
  fullGablePlanes,
  22.5
);
if (restoredHippedPlanes.length !== 8) {
  throw new Error(`Expected 8 hipped planes on restored stepped roof, got ${restoredHippedPlanes.length}`);
}
console.log(
  `✓ Test 18 Passed: Universal Hip <-> Gable edge toggling & stepped 13.5m×9.5m roof verified (mixed: ${mixedSteppedPlanes.length} planes / ${mixedSteppedLayout.wastePercent}% waste, full gable: ${fullGablePlanes.length} planes / ${fullGableLayout.wastePercent}% waste, hipped: ${restoredHippedPlanes.length} planes).`
);

// 19. TEST 19: Flashing Line Enumeration, True Sloped Barge Length & Stock Piece Breakdown
import {
  computeRoofLineTrueLengthM,
  computeFlashingPieceBreakdown,
  getAssignableRoofLines
} from '../exactRoofingEngine';

// Classic 14m x 8m Duo-Pitch Gable @ 22.5°
const gableRaw = getPresetOutline('straight_gable');
const gableApplied = applyRoofStylePreset(gableRaw, 'gable');
const gable14x8 = gableApplied.outline;
const gable14x8Skel = gableApplied.skeleton;
const gable14x8Planes = syncPlanesWithOutlineAndSkeleton(gable14x8, gable14x8Skel, [], 22.5);
const gableAssignable = getAssignableRoofLines(
  gable14x8,
  gable14x8Skel,
  gable14x8Planes,
  [],
  []
);

const gableBarges = gableAssignable.filter((l) => l.flashingKind === 'barge');
const gableRidges = gableAssignable.filter((l) => l.flashingKind === 'ridge');
const gableEaves = gableAssignable.filter((l) => l.flashingKind === 'eave');

if (gableBarges.length !== 2 || gableRidges.length !== 1 || gableEaves.length !== 2) {
  throw new Error(
    `Expected 2 barges, 1 ridge, 2 eaves on straight gable, got ${gableBarges.length}/${gableRidges.length}/${gableEaves.length}`
  );
}

// Each 8m verge crosses ridge apex (4m / cos(22.5°) * 2 = 8.659m)
const barge0 = gableBarges[0];
if (
  Math.abs(barge0.planLengthM - 8.0) > 0.05 ||
  Math.abs(barge0.trueSlopeLengthM - 8.66) > 0.08 ||
  barge0.suggestedCategory !== 'Barge & Edge'
) {
  throw new Error(
    `Expected 8.0m plan -> ~8.66m true slope barge length (Barge & Edge), got ${barge0.planLengthM}m -> ${barge0.trueSlopeLengthM}m (${barge0.suggestedCategory})`
  );
}

// Horizontal ridge has identical plan and true length (14.0m)
const ridge0 = gableRidges[0];
if (Math.abs(ridge0.trueSlopeLengthM - 14.0) > 0.05 || ridge0.suggestedCategory !== 'Ridge & Hip') {
  throw new Error(`Expected 14.0m horizontal ridge, got ${ridge0.trueSlopeLengthM}m`);
}

// Hipped/Valley true slope length must exceed horizontal plan length
const hipLine = lSkeleton.find((s) => s.suggestedType === 'hip')!;
const hipSlope = computeRoofLineTrueLengthM(
  'hip',
  hipLine.from,
  hipLine.to,
  lUniformPlanes,
  lOutline,
  lSkeleton
);
if (hipSlope.trueSlopeLengthM <= hipSlope.planLengthM) {
  throw new Error(`Expected sloped hip length > plan length (${hipSlope.planLengthM}), got ${hipSlope.trueSlopeLengthM}`);
}

// Flashing piece breakdown: 8.66m barge with max 4.0m stick -> 3 pcs with 0.30m lap (covers >= 8.96m)
const bargeBreakdown = computeFlashingPieceBreakdown(barge0.trueSlopeLengthM, 'barge', 4.0);
if (
  bargeBreakdown.recommendedQuantity !== 3 ||
  bargeBreakdown.recommendedPieceLengthM > 4.0 ||
  bargeBreakdown.totalOrderLengthM < barge0.trueSlopeLengthM + bargeBreakdown.lapAllowanceM - 0.02
) {
  throw new Error(
    `Unexpected barge piece breakdown: ${bargeBreakdown.recommendedQuantity} x ${bargeBreakdown.recommendedPieceLengthM}m for ${barge0.trueSlopeLengthM}m`
  );
}

console.log(
  `✓ Test 19 Passed: Assignable flashing lines (${gableAssignable.length} on gable), true slope barge (${barge0.planLengthM}m plan -> ${barge0.trueSlopeLengthM}m slope, ${bargeBreakdown.recommendedQuantity}x${bargeBreakdown.recommendedPieceLengthM}m), and hip slope (${hipSlope.trueSlopeLengthM}m) verified.`
);

// 20. TEST 20: Cascading Terraced Roofs (Multi-Tier Z-Heights, Eave Wall Lengths, Aprons & Unchanged Laying/Offcuts)
import {
  getMultiLevelPreset,
  deriveRoofWallSegments,
  getAssignableRoofLinesMultiLevel,
  setEdgeMode,
  arePlanesAdjacentAtHip
} from '../exactRoofingEngine';
import { computeRoofingPacks, buildRoofBillOfMaterials } from '../exactRoofingBomBridge';

const terracePreset = getMultiLevelPreset('cascading_terrace', 22.5);
if (terracePreset.levels.length !== 3 || terracePreset.planes.length !== 3) {
  throw new Error(
    `Expected 3 cascading terrace levels and 3 sloped terrace facets, got ${terracePreset.levels.length}/${terracePreset.planes.length}`
  );
}

const [t1, t2, t3] = terracePreset.levels;
if (t1.eaveHeightM !== 2.7 || t2.eaveHeightM !== 4.1 || t3.eaveHeightM !== 5.5) {
  throw new Error(`Expected ascending Z heights 2.7m -> 4.1m -> 5.5m, got ${t1.eaveHeightM}/${t2.eaveHeightM}/${t3.eaveHeightM}`);
}

// Edit Tier 2 eave length to establish an extended wall (14m -> 16.5m) for its facet
const t2EaveEdge = t2.outline.edges.find((e) => e.type === 'outline')!;
const resizedT2Outline = updateEdgeLength(t2.outline, t2EaveEdge.id, 16.5);
const resizedLevels = [
  t1,
  { ...t2, outline: resizedT2Outline, skeleton: generateSkeletonLines(resizedT2Outline) },
  t3
];
const resizedTerracePlanes = syncMultiLevelPlanes(resizedLevels, terracePreset.planes, 22.5);
const resizedT2Plane = resizedTerracePlanes.find((p) => p.levelId === t2.id)!;
if (!resizedT2Plane || Math.abs((resizedT2Plane.eaveWidthM || 0) - 16.5) > 0.05) {
  throw new Error(`Expected resized Tier 2 eave width to equal 16.5m, got ${resizedT2Plane?.eaveWidthM}`);
}

// Derive structural wall segments & check Z-axis relationships across terraces
const terraceWalls = deriveRoofWallSegments(resizedLevels, resizedTerracePlanes);
const terraceAbutments = terraceWalls.filter((w) => w.wallKind === 'abutment_wall');
if (terraceAbutments.length !== 3) {
  throw new Error(`Expected 3 abutment step walls across 3 terraces, got ${terraceAbutments.length}`);
}

// Each wall edge emits an Apron & Abutment flashing line
const terraceAssignable = getAssignableRoofLinesMultiLevel(resizedLevels, resizedTerracePlanes);
const terraceAprons = terraceAssignable.filter((l) => l.flashingKind === 'apron');
if (terraceAprons.length !== 3 || terraceAprons.some((a) => a.suggestedCategory !== 'Apron & Abutment')) {
  throw new Error(`Expected 3 Apron & Abutment flashing lines, got ${terraceAprons.length}`);
}

// Existing laying direction, starting edge, offcuts & packs remain intact on multi-height terraces
const terraceCustomStart = resizedTerracePlanes[1].id;
const terraceLayout = generateCuttingLayout(
  resizedTerracePlanes,
  { coverWidth: 0.762, maxLength: 6.0, endLap: 0.15, overhang: 0.05 },
  { startPlaneId: terraceCustomStart }
);
if (
  terraceLayout.sections.length !== 3 ||
  terraceLayout.startPlaneId !== terraceCustomStart ||
  terraceLayout.sections[0].eaveHeightM !== 4.1 ||
  terraceLayout.sections[0].levelCode !== 'L2'
) {
  throw new Error('Cascading terrace layout failed to honor startPlaneId or preserve Z/level metadata');
}
const terracePacks = computeRoofingPacks({ layout: terraceLayout, planes: resizedTerracePlanes });
if (terracePacks.length !== 3 || terracePacks[0].eaveHeightM !== 4.1 || terracePacks[0].levelCode !== 'L2') {
  throw new Error('Cascading terrace roofing packs failed to carry levelCode & eaveHeightM');
}

console.log(
  `✓ Test 20 Passed: Cascading 3-tier terrace (Z: 2.7m/4.1m/5.5m), resized 16.5m wall, ${terraceAprons.length} apron lines & ${terracePacks.length} packs verified.`
);

// 21. TEST 21: 2-Storey Split Upper + Lower Roof (Isolated Hip Adjacency & Step Riser Wall Z)
const twoStorey = getMultiLevelPreset('two_storey_split', 22.5);
const lower1FPlanes = twoStorey.planes.filter((p) => p.levelId === 'level-1');
const upper2FPlanes = twoStorey.planes.filter((p) => p.levelId === 'level-2');

if (lower1FPlanes.length !== 1 || upper2FPlanes.length !== 4) {
  throw new Error(
    `Expected 1 lower 1F apron slope and 4 upper 2F hipped slopes, got ${lower1FPlanes.length}/${upper2FPlanes.length}`
  );
}

// Hips must NEVER pair across different storey levels
if (arePlanesAdjacentAtHip(lower1FPlanes[0], upper2FPlanes[2])) {
  throw new Error('Must NOT pair hip offcuts directly across different building storeys');
}

// Derive structural walls and verify upper storey exterior wall rises from lower roof Z (bottomZ > 0) where overlapping
const twoStoreyWalls = deriveRoofWallSegments(twoStorey.levels, twoStorey.planes);
const upperWallOverLowerRoof = twoStoreyWalls.find(
  (w) => w.levelId === 'level-2' && w.bottomZ > 0.5 && w.topZ === 5.4
);
if (!upperWallOverLowerRoof) {
  throw new Error('Expected 2F upper wall segment sitting on 1F lower roof to have bottomZ > 0.5m and topZ = 5.4m');
}

// Test 3-way setEdgeMode ('hipped' | 'gable' | 'wall') on Upper 2F eave
const u2FirstEdge = twoStorey.levels[1].outline.edges[0];
const wallConverted = setEdgeMode(twoStorey.levels[1].outline, twoStorey.levels[1].skeleton, u2FirstEdge.id, 'wall');
if (wallConverted.toggledTo !== 'wall' || wallConverted.outline.edges[0].type !== 'wall') {
  throw new Error('setEdgeMode("wall") failed to convert eave edge into abutment wall');
}

// Multi-storey layout + BOM generation
const twoStoreyLayout = generateCuttingLayout(twoStorey.planes, {
  coverWidth: 0.762,
  maxLength: 6.0,
  endLap: 0.15,
  overhang: 0.05
});
const twoStoreyLines = getAssignableRoofLinesMultiLevel(twoStorey.levels, twoStorey.planes);
const twoStoreyBom = buildRoofBillOfMaterials({
  planes: twoStorey.planes,
  layout: twoStoreyLayout,
  assignments: [],
  assignableLines: twoStoreyLines,
  assets: []
});
if (
  twoStoreyLayout.sections.length !== 5 ||
  twoStoreyBom.totalSheetsCount < 20 ||
  !twoStoreyLines.some((l) => l.flashingKind === 'apron' && l.levelId === 'level-1')
) {
  throw new Error('2-Storey Split layout, apron flashings, or BOM verification failed');
}

console.log(
  `✓ Test 21 Passed: 2-Storey Split (${lower1FPlanes.length} lower 1F @ 2.7m + ${upper2FPlanes.length} upper 2F @ 5.4m, step riser Z ${upperWallOverLowerRoof.bottomZ}m->${upperWallOverLowerRoof.topZ}m, ${twoStoreyBom.totalSheetsCount} sheets) verified.`
);

// 22. TEST 22: Non-Destructive Wall Assignment, Eave Width Setback & Strict Sub-Roof Z Constraint
import {
  setEdgeWall,
  computeEdgeSetbackLine,
  getDefaultEdgeSetbackM,
  isEdgeWallEnabled,
  getPointElevationFromPlanes
} from '../exactRoofingEngine';

const rectGableApplied = applyRoofStylePreset(getPresetOutline('straight_gable'), 'gable');
const rectGableOutline = rectGableApplied.outline;
const rectGableSkel = rectGableApplied.skeleton;
const rectGablePlanes = syncPlanesWithOutlineAndSkeleton(rectGableOutline, rectGableSkel, [], 22.5);
const gableLevel: import('../../types/exactRoofing').RoofLevel = {
  id: 'level-1',
  code: 'L1',
  name: 'Gable Roof',
  eaveHeightM: 2.7,
  outline: rectGableOutline,
  skeleton: rectGableSkel
};

const southEaveEdge = rectGableOutline.edges.find((e) => e.type === 'outline')!;
const eastGableEdge = rectGableOutline.edges.find((e) => e.type === 'verge')!;

// Assign 0.45m setback on south eave and 0.60m setback on east gable, plus disable wall on north eave
const northEaveEdge = rectGableOutline.edges.find(
  (e) => e.type === 'outline' && e.id !== southEaveEdge.id
)!;

let updatedGableOutline = setEdgeWall(rectGableOutline, southEaveEdge.id, {
  hasWall: true,
  eaveSetbackM: 0.45
});
updatedGableOutline = setEdgeWall(updatedGableOutline, eastGableEdge.id, {
  hasWall: true,
  eaveSetbackM: 0.6
});
updatedGableOutline = setEdgeWall(updatedGableOutline, northEaveEdge.id, {
  hasWall: false
});

// Verify wall assignment NEVER alters roof geometry (planes, slope lengths, developed polygons, or skeleton)
const planesAfterWalls = syncPlanesWithOutlineAndSkeleton(
  updatedGableOutline,
  rectGableSkel,
  rectGablePlanes,
  22.5
);
if (
  planesAfterWalls.length !== rectGablePlanes.length ||
  JSON.stringify(planesAfterWalls.map((p) => p.planPolygon)) !==
    JSON.stringify(rectGablePlanes.map((p) => p.planPolygon)) ||
  JSON.stringify(planesAfterWalls.map((p) => p.developedPolygon)) !==
    JSON.stringify(rectGablePlanes.map((p) => p.developedPolygon))
) {
  throw new Error('Assigning walls or eave setbacks must NEVER alter roof plane geometry');
}

const sbSouth = computeEdgeSetbackLine(updatedGableOutline, southEaveEdge.id);
const sbEast = computeEdgeSetbackLine(updatedGableOutline, eastGableEdge.id);
if (
  !sbSouth ||
  !sbEast ||
  Math.abs(sbSouth.eaveSetbackM - 0.45) > 0.01 ||
  Math.abs(sbEast.eaveSetbackM - 0.6) > 0.01 ||
  !isPointInPolygon(
    { x: (sbSouth.wallFrom.x + sbSouth.wallTo.x) / 2, y: (sbSouth.wallFrom.y + sbSouth.wallTo.y) / 2 },
    updatedGableOutline.points
  ) ||
  !isPointInPolygon(
    { x: (sbEast.wallFrom.x + sbEast.wallTo.x) / 2, y: (sbEast.wallFrom.y + sbEast.wallTo.y) / 2 },
    updatedGableOutline.points
  )
) {
  throw new Error('Eave width setback must inset wall footprints inside roof polygon');
}

const gableWalls = deriveRoofWallSegments(
  [{ ...gableLevel, outline: updatedGableOutline }],
  planesAfterWalls
);
if (
  gableWalls.some((w) => w.edgeId === northEaveEdge.id) ||
  isEdgeWallEnabled(updatedGableOutline.edges.find((e) => e.id === northEaveEdge.id)!)
) {
  throw new Error('Wall with hasWall=false must be omitted from wall segments');
}

// Verify south eave setback wall at 0.45m meets sloped roof strictly at 2.7 + 0.45 * tan(22.5°) = 2.886m
const southWallSeg = gableWalls.find((w) => w.edgeId === southEaveEdge.id)!;
const expectedSouthTopZ = +(2.7 + 0.45 * Math.tan((22.5 * Math.PI) / 180)).toFixed(2);
if (Math.abs(southWallSeg.topZ - expectedSouthTopZ) > 0.03) {
  throw new Error(`Expected 0.45m setback south wall topZ ~${expectedSouthTopZ}m, got ${southWallSeg.topZ}m`);
}

// Verify EVERY point on EVERY wall (including gable ends, eave walls & cascading abutment walls) is <= overlying roof Z
gableWalls.forEach((w) => {
  w.topProfilePoints3D.forEach((pt3) => {
    const roofAtPt = getPointElevationFromPlanes({ x: pt3.x, y: pt3.y }, planesAfterWalls, updatedGableOutline);
    if (roofAtPt.matchedPlaneIds.length > 0 && pt3.z > roofAtPt.z + 0.05) {
      throw new Error(
        `Wall ${w.edgeId} extends above roof plane at (${pt3.x}, ${pt3.y}): wallZ=${pt3.z} > roofZ=${roofAtPt.z}`
      );
    }
  });
});

// Check cascading terrace abutment walls also sit strictly <= tier roof peak (no +1.2m overshoot)
const terraceOutlinesByLevel = new Map(resizedLevels.map((l) => [l.id, l.outline] as [string, RoofOutline]));
terraceAbutments.forEach((w) => {
  const lvlPlanes = resizedTerracePlanes.filter((p) => p.levelId === w.levelId);
  const lvlOut = terraceOutlinesByLevel.get(w.levelId);
  w.topProfilePoints3D.forEach((pt3) => {
    const roofAtPt = getPointElevationFromPlanes({ x: pt3.x, y: pt3.y }, lvlPlanes, lvlOut);
    if (roofAtPt.matchedPlaneIds.length > 0 && pt3.z > roofAtPt.z + 0.02) {
      throw new Error(`Abutment wall ${w.id} exceeded terrace roof plane: ${pt3.z} > ${roofAtPt.z}`);
    }
  });
});
void getDefaultEdgeSetbackM;

console.log(
  `✓ Test 22 Passed: Non-destructive Wall Assignment, mitered Eave Width setbacks (0.45m -> Z:${southWallSeg.topZ}m, 0.60m gable) & zero roof-plane overshoot verified.`
);

// 23. TEST 23: Pure Z-Axis Eave Height Invariance (No Geometry Change & Preserved Same-Level Hip Adjacency)
const baseRectPlanes = syncPlanesWithOutlineAndSkeleton(rectOutline, rectSkeleton, [], 22.5);
const baseRectLayout = generateCuttingLayout(baseRectPlanes, {
  coverWidth: 0.762,
  maxLength: 6.0,
  endLap: 0.15,
  overhang: 0.05
});

// Shift Roof Level Z from 2.7m -> 4.9m and verify 2D/developed geometry & offcuts stay 100% invariant
const shiftedPlanes = baseRectPlanes.map((p) => ({ ...p, eaveHeightM: 4.9 }));
const shiftedLayout = generateCuttingLayout(shiftedPlanes, {
  coverWidth: 0.762,
  maxLength: 6.0,
  endLap: 0.15,
  overhang: 0.05
});

if (
  JSON.stringify(shiftedPlanes.map((p) => p.planPolygon)) !==
    JSON.stringify(baseRectPlanes.map((p) => p.planPolygon)) ||
  JSON.stringify(shiftedPlanes.map((p) => p.developedPolygon)) !==
    JSON.stringify(baseRectPlanes.map((p) => p.developedPolygon)) ||
  shiftedLayout.totalOrderedArea !== baseRectLayout.totalOrderedArea ||
  shiftedLayout.savedMetres !== baseRectLayout.savedMetres
) {
  throw new Error('Changing eaveHeightM in Z-space must NOT alter 2D/developed roof geometry or sheet cutting lengths');
}

// Also verify single-plane Z adjustment on same level keeps hip adjacency intact
const mixedZSameLevel = baseRectPlanes.map((p, idx) =>
  idx === 0 ? { ...p, eaveHeightM: 3.4 } : p
);
if (!arePlanesAdjacentAtHip(mixedZSameLevel[0], mixedZSameLevel[1])) {
  throw new Error('Single-plane Z adjustment on same level should preserve same-level hip adjacency');
}

const elevatedLevelWalls = deriveRoofWallSegments(
  [
    {
      id: 'level-1',
      code: 'L1',
      name: 'Elevated Main',
      eaveHeightM: 4.9,
      outline: {
        ...rectOutline,
        levelId: 'level-1',
        edges: rectOutline.edges.map((e) => ({ ...e, levelId: 'level-1', eaveHeightM: 4.9 }))
      },
      skeleton: rectSkeleton
    }
  ],
  shiftedPlanes
);
if (elevatedLevelWalls.some((w) => Math.abs(w.topZ - 4.9) > 0.05)) {
  throw new Error('Expected all eave walls on 4.9m Z roof to sit at topZ = 4.9m without altering roof geometry');
}

console.log(
  '✓ Test 23 Passed: Pure Z-axis eave height shifts (2.7m -> 4.9m) move walls/planes in Z without altering roof geometry, offcuts, or same-level hip links.'
);

// 24. TEST 24: Auto-Lines Convex/Reflex Classification, Essential Hips/Valleys, Eave-Parallel Ridges & No Star-Burst
import { classifyOutlineCorners } from '../exactRoofingEngine';

// 24A: Near-collinear touch noise vertex along a 14m flat eave must NOT emit an extra spurious hip
const noisyRectOutline = buildOutlineFromPoints([
  { x: 0, y: 0 },
  { x: 7, y: 0.06 }, // 0.06m noise (< 1 deg turn)
  { x: 14, y: 0 },
  { x: 14, y: 10 },
  { x: 0, y: 10 }
]);
const noisyClassified = classifyOutlineCorners(noisyRectOutline);
const noisySkel = generateSkeletonLines(noisyRectOutline);
if (
  noisyClassified.length !== 4 ||
  noisyClassified.some((c) => c.classification !== 'convex') ||
  noisySkel.filter((s) => s.suggestedType === 'hip').length !== 4 ||
  noisySkel.filter((s) => s.suggestedType === 'ridge').length !== 1
) {
  throw new Error(
    `Expected noisy rectangle to classify 4 convex corners and emit 4 essential hips + 1 ridge, got ${noisyClassified.length} corners / ${noisySkel.length} lines`
  );
}

// 24B: Projecting Bay / Porch Wing House (6 convex corners -> 6 essential hips, 2 reflex corners -> 2 valleys, continuous eave-parallel ridges, ZERO starbursts)
const bayOutline = buildOutlineFromPoints([
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: -3 },
  { x: 10, y: -3 },
  { x: 10, y: 0 },
  { x: 14, y: 0 },
  { x: 14, y: 8 },
  { x: 0, y: 8 }
]);
const bayClassified = classifyOutlineCorners(bayOutline);
const bayConvexCount = bayClassified.filter((c) => c.classification === 'convex').length;
const bayReflexCount = bayClassified.filter((c) => c.classification === 'reflex').length;
if (bayConvexCount !== 6 || bayReflexCount !== 2) {
  throw new Error(`Expected 6 convex + 2 reflex vertices on bay-window house, got ${bayConvexCount}C/${bayReflexCount}R`);
}

const baySkel = generateSkeletonLines(bayOutline);
const bayHips = baySkel.filter((s) => s.suggestedType === 'hip');
const bayValleys = baySkel.filter((s) => s.suggestedType === 'valley');
const bayRidges = baySkel.filter((s) => s.suggestedType === 'ridge');

if (bayHips.length !== 6 || bayValleys.length !== 2 || bayRidges.length < 2) {
  throw new Error(
    `Expected exactly 6 essential hips, 2 valleys, >=2 ridges on bay house, got ${bayHips.length}H/${bayValleys.length}V/${bayRidges.length}R`
  );
}

// Check NO starburst center node collecting >= 4 lines, and EVERY ridge is strictly parallel to at least one eave
const bayCentroid = {
  x: bayOutline.points.reduce((a, p) => a + p.x, 0) / bayOutline.points.length,
  y: bayOutline.points.reduce((a, p) => a + p.y, 0) / bayOutline.points.length
};
const starburstLinesAtCentroid = baySkel.filter(
  (s) => pointsClose(s.from, bayCentroid, 0.2) || pointsClose(s.to, bayCentroid, 0.2)
);
if (starburstLinesAtCentroid.length >= 4) {
  throw new Error('Detected starburst convergence at polygon centroid on bay-window house');
}
bayRidges.forEach((r) => {
  const rLen = dist(r.from, r.to) || 1;
  const rDir = { x: (r.to.x - r.from.x) / rLen, y: (r.to.y - r.from.y) / rLen };
  const alignedWithAnEave = bayOutline.edges.some((e) => {
    const eLen = dist(e.from, e.to) || 1;
    const eDir = { x: (e.to.x - e.from.x) / eLen, y: (e.to.y - e.from.y) / eLen };
    return Math.abs(rDir.x * eDir.x + rDir.y * eDir.y) > 0.99;
  });
  if (!alignedWithAnEave) {
    throw new Error(`Ridge (${r.from.x},${r.from.y})->(${r.to.x},${r.to.y}) is NOT parallel to any eave`);
  }
});

console.log(
  `✓ Test 24 Passed: Vertex classifier (${bayConvexCount} convex -> ${bayHips.length} essential hips, ${bayReflexCount} reflex -> ${bayValleys.length} valleys), noise pruning, ${bayRidges.length} eave-parallel ridges & zero starburst verified.`
);

// 25. TEST 25: Freehand First-Line Calibration, Precision Draft Snap & 2-Point Architectural Plan Calibration
import {
  parseDistanceInputToMetres,
  applyDraftPointSnap,
  calibrateDraftPointsFromFirstLine,
  createPlanUnderlaySpec,
  calibratePlanUnderlayFromTwoPoints,
  scalePlanUnderlayFromFactor,
  scaleOutlineUniformly
} from '../exactRoofingEngine';

// 25A: Unit parser ('m', 'mm', comma formatting, and bounds checks)
if (
  parseDistanceInputToMetres('14.5', 'm') !== 14.5 ||
  parseDistanceInputToMetres('14,500', 'mm') !== 14.5 ||
  parseDistanceInputToMetres('6340', 'auto') !== 6.34 ||
  parseDistanceInputToMetres('0.01', 'm') !== null ||
  parseDistanceInputToMetres('-5', 'm') !== null
) {
  throw new Error('parseDistanceInputToMetres failed unit/comma/validation checks');
}

// 25B: Precision draft snap preserves 10mm resolution and 45/90 deg ortho locking
const orthoSnapped = applyDraftPointSnap({ x: 8.43, y: 2.12 }, { x: 2.0, y: 2.0 }, { orthoSnap: true });
if (orthoSnapped.x !== 8.43 || orthoSnapped.y !== 2.0) {
  throw new Error(`Expected 0-deg ortho lock to pin Y=2.0 and keep 8.43m X precision, got (${orthoSnapped.x},${orthoSnapped.y})`);
}
const freeAngle = applyDraftPointSnap({ x: 5.37, y: 3.81 }, { x: 2.0, y: 2.0 }, { orthoSnap: true });
if (Math.abs(freeAngle.x - 5.37) > 0.015 || Math.abs(freeAngle.y - 3.81) > 0.015) {
  throw new Error(`Expected free-angle point to preserve 0.01m precision, got (${freeAngle.x},${freeAngle.y})`);
}

// 25C: Freehand first-line calibration scales points AND bounds around P0 with ZERO screen-pixel jump
const initBounds = { minX: 0, maxX: 16, minY: 0, maxY: 12, width: 16, height: 12 };
const initDraft = [
  { x: 2.5, y: 3.0 },
  { x: 7.5, y: 3.0 } // drawn at 5.0m raw, user declares real length = 14.5m
];
const normBeforeP1X = (initDraft[1].x - (initBounds.minX + initBounds.width / 2)) / initBounds.width;
const normBeforeP1Y = (initDraft[1].y - (initBounds.minY + initBounds.height / 2)) / initBounds.height;

const firstLineCal = calibrateDraftPointsFromFirstLine(initDraft, 14.5, initBounds);
if (!firstLineCal) {
  throw new Error('calibrateDraftPointsFromFirstLine returned null for valid inputs');
}
const calLenM = dist(firstLineCal.scaledPoints[0], firstLineCal.scaledPoints[1]);
if (Math.abs(calLenM - 14.5) > 0.005 || Math.abs(firstLineCal.scaleFactor - 2.9) > 0.005) {
  throw new Error(`Expected calibrated Line 1 = 14.5m (factor 2.9x), got ${calLenM}m (factor ${firstLineCal.scaleFactor})`);
}
const normAfterP1X =
  (firstLineCal.scaledPoints[1].x - (firstLineCal.scaledBounds.minX + firstLineCal.scaledBounds.width / 2)) /
  firstLineCal.scaledBounds.width;
const normAfterP1Y =
  (firstLineCal.scaledPoints[1].y - (firstLineCal.scaledBounds.minY + firstLineCal.scaledBounds.height / 2)) /
  firstLineCal.scaledBounds.height;
if (Math.abs(normAfterP1X - normBeforeP1X) > 1e-4 || Math.abs(normAfterP1Y - normBeforeP1Y) > 1e-4) {
  throw new Error('Freehand calibration must keep P0/P1 normalized screen coordinates invariant (zero viewport jump)');
}

// 25D: 2-Point Architectural Plan calibration (horizontal, vertical & diagonal picks preserve aspect ratio & exact span)
const rawSheet = createPlanUnderlaySpec({
  id: 'sheet-rc01',
  name: 'RC-01 Roof Plan',
  imageUrl: 'data:image/svg+xml;utf8,<svg/>',
  aspectRatio: 1.5, // e.g., 1500x1000 px drawing
  initialWidthM: 30
});
const calHoriz = calibratePlanUnderlayFromTwoPoints(
  rawSheet,
  { x: 0.2, y: 0.3 },
  { x: 0.7, y: 0.3 }, // Δx_norm = 0.5 -> width must be 12.0 / 0.5 = 24.0m, height = 16.0m
  12.0,
  { resetOriginToZero: true }
);
if (
  !calHoriz ||
  Math.abs(calHoriz.underlay.worldWidthM - 24.0) > 0.01 ||
  Math.abs(calHoriz.underlay.worldHeightM - 16.0) > 0.01 ||
  Math.abs(dist(calHoriz.p1World, calHoriz.p2World) - 12.0) > 0.002
) {
  throw new Error(
    `2-Point horizontal plan calibration failed: width=${calHoriz?.underlay.worldWidthM}, height=${calHoriz?.underlay.worldHeightM}`
  );
}

const calDiag = calibratePlanUnderlayFromTwoPoints(
  rawSheet,
  { x: 0.15, y: 0.2 },
  { x: 0.75, y: 0.8 },
  18.4,
  { resetOriginToZero: false }
);
if (
  !calDiag ||
  !calDiag.underlay.isCalibrated ||
  Math.abs(dist(calDiag.p1World, calDiag.p2World) - 18.4) > 0.002 ||
  Math.abs(calDiag.underlay.worldWidthM / calDiag.underlay.worldHeightM - 1.5) > 0.01
) {
  throw new Error('2-Point diagonal plan calibration failed aspect ratio or distance accuracy');
}

const scaledUnderlayCheck = scalePlanUnderlayFromFactor(rawSheet, { x: 0, y: 0 }, 0.5);
if (Math.abs(scaledUnderlayCheck.worldWidthM - 15) > 0.01 || Math.abs(scaledUnderlayCheck.worldHeightM - 10) > 0.01) {
  throw new Error('scalePlanUnderlayFromFactor failed uniform rescale');
}

const uniformlyRescaledOutline = scaleOutlineUniformly(rectOutline, 1.5, rectOutline.points[0]);
const rescaledEdge0Len = dist(uniformlyRescaledOutline.edges[0].from, uniformlyRescaledOutline.edges[0].to);
if (Math.abs(rescaledEdge0Len - 21.0) > 0.02) {
  throw new Error(`Expected uniformly 1.5x rescaled 14m eave to measure 21.0m, got ${rescaledEdge0Len}`);
}

console.log(
  `✓ Test 25 Passed: Freehand first-line scale (14.5m zero-jump invariant), 0.01m ortho snap, 2-pt architectural plan calibration (${calDiag.underlay.worldWidthM.toFixed(2)}m×${calDiag.underlay.worldHeightM.toFixed(2)}m) & outline rescaling verified.`
);

// 26. TEST 26: ExactRoof / CADMethods Industry Benchmark (29.67m × 6.55m @ 15° Simple 4-Hip Roof)
const erOutline = buildOutlineFromPoints([
  { x: 0, y: 0 },
  { x: 29.67, y: 0 },
  { x: 29.67, y: 6.55 },
  { x: 0, y: 6.55 }
]);
const erSkel = generateSkeletonLines(erOutline);
const erPlanes = erOutline.edges.map((e, idx) =>
  createPlaneFromEdge(erOutline, erSkel, e, {
    pitchDeg: 15,
    underlapSide: idx % 2 === 0 ? 'left' : 'right'
  })
);
const erLayout = generateCuttingLayout(
  erPlanes,
  { coverWidth: 0.762, maxLength: 6.34, endLap: 0.15, overhang: 0.05 },
  { startPlaneId: erPlanes[0].id, sheetOrderMode: 'optimized' }
);

if (Math.abs(erLayout.totalRoofArea - 201.2) > 0.5) {
  throw new Error(`Expected ExactRoof benchmark area ~201.2 m², got ${erLayout.totalRoofArea} m²`);
}
if (erLayout.parents.length < 78 || erLayout.parents.length > 81) {
  throw new Error(`Expected ~79-80 ordered sheets, got ${erLayout.parents.length}`);
}
if (erLayout.totalOrderedMetres < 268 || erLayout.totalOrderedMetres > 274) {
  throw new Error(
    `Expected ExactRoof benchmark ordered metres ~272 lm (268-274), got ${erLayout.totalOrderedMetres} lm`
  );
}
const erMaxParentLen = Math.max(...erLayout.parents.map((p) => p.length));
if (erMaxParentLen > 3.55) {
  throw new Error(
    `Must NOT manufacture inflated synthetic mother blanks (>3.55m) on a 3.44m roof; got max ${erMaxParentLen}m`
  );
}
const erExactParentSum = +erLayout.parents.reduce((s, p) => s + p.length, 0).toFixed(2);
if (Math.abs(erExactParentSum - erLayout.totalOrderedMetres) > 0.02) {
  throw new Error(
    `Total ordered metres (${erLayout.totalOrderedMetres}) must strictly match sum(parent.length) (${erExactParentSum})`
  );
}
const erComputedReused = erLayout.parents.reduce((s, p) => s + Math.max(0, p.pieces.length - 1), 0);
if (erComputedReused !== erLayout.totalOffcutsReused) {
  throw new Error(
    `totalOffcutsReused (${erLayout.totalOffcutsReused}) must equal repressed count (${erComputedReused})`
  );
}

const erPracticalLayout = generateCuttingLayout(
  erPlanes,
  { coverWidth: 0.762, maxLength: 6.34, endLap: 0.15, overhang: 0.05 },
  { startPlaneId: erPlanes[0].id }
);
const erPracticalLengths = new Set(erPracticalLayout.parents.map((p) => Math.round(p.length * 1000)));
if (erPracticalLayout.sheetOrderMode !== 'practical' || erPracticalLengths.size !== 1) {
  throw new Error(
    `Expected Practical default on uniform ExactRoof benchmark to use 1 stock length, got ${erPracticalLengths.size} (${Array.from(erPracticalLengths).join(',')})`
  );
}

console.log(
  `✓ Test 26 Passed: ExactRoof Benchmark (Optimized: ${erLayout.parents.length} sheets / ${erLayout.totalOrderedMetres} lm; Practical default: ${erPracticalLayout.parents.length} sheets @ ${Array.from(erPracticalLengths)[0]}mm) verified.`
);

// 27. TEST 27: Additive Multi-Body Drawing & Draw-From-Wall/Eave Edge (Zero Auto-Skeleton)
const mbLvl1Blank = createRoofLevel(
  1,
  'Main House',
  2.7,
  [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 12, y: 6 },
    { x: 0, y: 6 }
  ],
  undefined,
  { autoGenerateSkeleton: false, initialEdgeType: 'unclassified' }
);
if (mbLvl1Blank.skeleton.length !== 0) {
  throw new Error(`Expected empty skeleton when autoGenerateSkeleton=false, got ${mbLvl1Blank.skeleton.length}`);
}
const prematurePlanes = syncMultiLevelPlanes([mbLvl1Blank], []);
if (prematurePlanes.length !== 0) {
  throw new Error(`Expected 0 planes for unclassified outline, got ${prematurePlanes.length}`);
}

const mbLvl1Classified: RoofLevel = {
  ...mbLvl1Blank,
  outline: classifyOutlineEdge(
    classifyOutlineEdge(mbLvl1Blank.outline, mbLvl1Blank.outline.edges[0].id, 'outline'),
    mbLvl1Blank.outline.edges[2].id,
    'wall'
  )
};
const sharedWallEdge = mbLvl1Classified.outline.edges[2]; // (12,6)->(0,6)
const attachedOutline = buildAttachedOutlineFromEdge(
  sharedWallEdge,
  [
    { x: 12, y: 6 },
    { x: 0, y: 6 },
    { x: 0, y: 10 },
    { x: 12, y: 10 }
  ],
  'attached-verandah',
  { levelId: 'level-2', defaultEaveHeightM: 2.7, initialEdgeType: 'unclassified' }
);
if (attachedOutline.points.length !== 4 || attachedOutline.edges.length !== 4) {
  throw new Error(`Expected 4-edge attached polygon, got ${attachedOutline.edges.length} edges`);
}
if (
  attachedOutline.edges[0].type !== 'wall' ||
  attachedOutline.edges[0].hasWall !== true ||
  !attachedOutline.edges.slice(1).every((e) => e.type === 'unclassified')
) {
  throw new Error('Attached polygon must preserve shared wall role while leaving outer edges unclassified');
}
const mbLvl2: RoofLevel = {
  id: 'level-2',
  code: 'L2',
  name: 'Verandah',
  eaveHeightM: 2.7,
  outline: attachedOutline,
  skeleton: []
};
const mbPlanes = syncMultiLevelPlanes([mbLvl1Classified, mbLvl2], []);
if (mbPlanes.length !== 1 || mbPlanes[0].eaveEdgeId !== mbLvl1Classified.outline.edges[0].id) {
  throw new Error(`Expected Level 1 eave plane preserved alongside Level 2 additive outline, got ${mbPlanes.length} planes`);
}
console.log(
  '✓ Test 27 Passed: Additive multi-body draw, shared-edge attach, and unclassified blank setup verified.'
);

// 28. TEST 28: ExactRoof Manual Edge Classification, Eave Fall vs Sheet-Run Perpendicular Edge (Empty Skeleton)
let manualOutline = buildOutlineFromPoints(
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 12, y: 6 },
    { x: 0, y: 6 }
  ],
  'manual-skewed',
  { initialEdgeType: 'unclassified' }
);
// Classify side 1 as Eave ('outline'), side 2 (angled east edge) as Barge ('verge'), side 3 as Ridge ('ridge')
const eaveSide = manualOutline.edges[0];
const angledBarge = manualOutline.edges[1];
const northEdge = manualOutline.edges[2];
manualOutline = classifyOutlineEdge(manualOutline, eaveSide.id, 'outline');
manualOutline = classifyOutlineEdge(manualOutline, angledBarge.id, 'verge');
manualOutline = classifyOutlineEdge(manualOutline, northEdge.id, 'ridge');

if (
  manualOutline.edges[0].type !== 'outline' ||
  manualOutline.edges[1].type !== 'verge' ||
  manualOutline.edges[2].type !== 'ridge' ||
  manualOutline.edges[3].type !== 'unclassified'
) {
  throw new Error('Edge classification mutated unrelated edge types');
}

const manualPlane = createPlaneFromEdge(manualOutline, [], eaveSide, {
  pitchDeg: 15,
  underlapSide: 'left',
  sheetRunEdgeId: angledBarge.id,
  orderedSheetLengthM: 6.25,
  name: 'Skewed Mono-Pitch'
});
const bargeDx = angledBarge.to.x - angledBarge.from.x;
const bargeDy = angledBarge.to.y - angledBarge.from.y;
const bargeLen = Math.hypot(bargeDx, bargeDy);
if (!manualPlane.runDirection) {
  throw new Error('Expected manualPlane.runDirection to be defined');
}
const dirDotBarge =
  (manualPlane.runDirection.x * bargeDx + manualPlane.runDirection.y * bargeDy) / bargeLen;
if (Math.abs(dirDotBarge) > 1e-4) {
  throw new Error(`Expected sheet runDirection perpendicular to sheetRunEdgeId (${angledBarge.id}), dot=${dirDotBarge}`);
}
if (manualPlane.sheetRunEdgeId !== angledBarge.id) {
  throw new Error('Expected sheetRunEdgeId preserved on created RoofPlane');
}
const manualLayout = generateCuttingLayout(
  [manualPlane],
  { coverWidth: 0.762, maxLength: 6.5, endLap: 0.15, overhang: 0.05 }
);
if (manualLayout.parents.length === 0 || manualLayout.totalRoofArea <= 0) {
  throw new Error('Expected manual empty-skeleton plane to produce valid cutting layout');
}
if (Math.abs(manualLayout.parents[0].length - 6.25) > 0.01) {
  throw new Error(`Expected orderedSheetLengthM override 6.25m respected, got ${manualLayout.parents[0].length}`);
}
console.log(
  `✓ Test 28 Passed: ExactRoof manual setup on skeleton=[] (perpendicular sheetRunEdgeId dot=${dirDotBarge.toFixed(5)}, ordered=6250mm, area=${manualLayout.totalRoofArea}m²) verified.`
);

// 29. TEST 29: Dovetail / Bay Wing Skeleton Junctions & Overshoot Regression
const dtCases = [
  {
    name: 'Bay 14x8 + 4x3 wing',
    pts: [
      { x: 0, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 8 },
      { x: 9, y: 8 },
      { x: 9, y: 11 },
      { x: 5, y: 11 },
      { x: 5, y: 8 },
      { x: 0, y: 8 }
    ],
    vergeIdx: [] as number[],
    expectedValleyStopY: 6.0
  },
  {
    name: 'Gable Dormer Bay 14x8 + 4x3 wing',
    pts: [
      { x: 0, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 8 },
      { x: 9, y: 8 },
      { x: 9, y: 11 },
      { x: 5, y: 11 },
      { x: 5, y: 8 },
      { x: 0, y: 8 }
    ],
    vergeIdx: [4],
    expectedValleyStopY: 6.0
  },
  {
    name: 'Almost-equal T-shape 16x8 + 7.8x5 wing',
    pts: [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 8 },
      { x: 11.9, y: 8 },
      { x: 11.9, y: 13 },
      { x: 4.1, y: 13 },
      { x: 4.1, y: 8 },
      { x: 0, y: 8 }
    ],
    vergeIdx: [] as number[],
    expectedValleyStopY: 4.0
  }
];

dtCases.forEach((tc) => {
  let out = buildOutlineFromPoints(tc.pts);
  tc.vergeIdx.forEach((idx) => {
    out = classifyOutlineEdge(out, out.edges[idx].id, 'verge');
  });
  const skel = generateSkeletonLines(out);
  const valleys = skel.filter((s) => s.suggestedType === 'valley');
  if (valleys.length !== 2) {
    throw new Error(`${tc.name}: expected 2 valleys, got ${valleys.length}`);
  }
  valleys.forEach((v) => {
    const minY = Math.min(v.from.y, v.to.y);
    if (minY < tc.expectedValleyStopY - 0.1) {
      throw new Error(`${tc.name}: valley overshot dovetail junction (minY=${minY} < ${tc.expectedValleyStopY})`);
    }
  });
  // Every skeleton line midpoint must stay strictly inside or on boundary of footprint
  skel.forEach((s) => {
    const mid = { x: (s.from.x + s.to.x) / 2, y: (s.from.y + s.to.y) / 2 };
    if (!isPointInPolygon(mid, tc.pts)) {
      throw new Error(`${tc.name}: skeleton line (${s.from.x},${s.from.y})->(${s.to.x},${s.to.y}) escaped footprint`);
    }
  });
});
console.log(
  '✓ Test 29 Passed: Dovetail wing valleys terminate cleanly at junction and ridges stay strictly bounded.'
);

// 30. TEST 30: Close Square / Close at Right Angles (3-corner rect, rotated rect & L-shape)
const threePtBox = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 6 }
];
const sqRect = buildCompleteSquarePoints(threePtBox, true);
if (!sqRect || sqRect.length !== 4) {
  throw new Error('Expected Close Square to complete 3-point box into 4 corners');
}
if (Math.abs(sqRect[3].x - 0) > 0.01 || Math.abs(sqRect[3].y - 6) > 0.01) {
  throw new Error(`Expected 4th corner (0,6), got (${sqRect[3].x},${sqRect[3].y})`);
}
for (let ci = 0; ci < 4; ci++) {
  const ang = computeCornerAngleDeg(sqRect, ci);
  if (ang === null || Math.abs(ang - 90) > 0.2) {
    throw new Error(`Expected 90 deg at corner ${ci}, got ${ang}`);
  }
}

// Rotated 3-point box (36.87 deg baseline: (0,0) -> (4,3) -> (1,7))
const rotThreePt = [
  { x: 0, y: 0 },
  { x: 4, y: 3 },
  { x: 1, y: 7 }
];
const rotSq = buildCompleteSquarePoints(rotThreePt, false);
if (!rotSq || rotSq.length !== 4) {
  throw new Error('Expected rotated 3-pt rectangle to complete cleanly');
}
if (Math.abs(rotSq[3].x - -3) > 0.05 || Math.abs(rotSq[3].y - 4) > 0.05) {
  throw new Error(`Expected rotated 4th corner (-3,4), got (${rotSq[3].x},${rotSq[3].y})`);
}

// L-shape missing final closing 90 deg corner
const openLShape = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 4 },
  { x: 5, y: 4 },
  { x: 5, y: 8 }
];
const closedL = buildCompleteSquarePoints(openLShape, true);
if (!closedL || closedL.length !== 6) {
  throw new Error(`Expected L-shape Close Square to add corner (0,8), got ${closedL?.length}`);
}
if (Math.abs(closedL[5].x - 0) > 0.01 || Math.abs(closedL[5].y - 8) > 0.01) {
  throw new Error(`Expected L-shape closing corner (0,8), got (${closedL[5].x},${closedL[5].y})`);
}

// Collinear / non-perpendicular 3-pt should NOT offer Close Square
if (
  canCloseDraftSquare(
    [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0.2 }
    ],
    true
  )
) {
  throw new Error('Collinear draft chain should not offer Close Square');
}
console.log('✓ Test 30 Passed: Close Square completes axis-aligned, rotated, and L-shape outlines accurately.');

// 31. TEST 31: SketchUp Type-to-Length Parsing & Directional Endpoint Placement
const lenM = parseDistanceInputToMetres('5.45', 'auto');
const lenMm = parseDistanceInputToMetres('5450', 'auto');
if (lenM !== 5.45 || lenMm !== 5.45) {
  throw new Error(`Expected 5.45m from both '5.45' and '5450', got ${lenM} and ${lenMm}`);
}
const orthoAimPt = computePointAtLengthInDirection(
  { x: 2, y: 3 },
  { x: 8.5, y: 3.15 }, // slight vertical wobble within ortho snap
  lenMm!,
  { orthoSnap: true }
);
if (!orthoAimPt || Math.abs(orthoAimPt.x - 7.45) > 0.01 || Math.abs(orthoAimPt.y - 3) > 0.01) {
  throw new Error(`Expected ortho-locked typed endpoint (7.45, 3), got ${JSON.stringify(orthoAimPt)}`);
}
const freeDiagPt = computePointAtLengthInDirection(
  { x: 0, y: 0 },
  { x: 3, y: 4 },
  10,
  { orthoSnap: false }
);
if (!freeDiagPt || Math.abs(freeDiagPt.x - 6) > 0.01 || Math.abs(freeDiagPt.y - 8) > 0.01) {
  throw new Error(`Expected 3-4-5 diagonal at 10m -> (6,8), got ${JSON.stringify(freeDiagPt)}`);
}
console.log('✓ Test 31 Passed: SketchUp type-to-length (m/mm) directional & ortho placement verified.');

// 32. TEST 32: Corner Squaring (Thales 90 deg Projection) + Edge Metadata Preservation
const skewedPts = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10.8, y: 6.4 }, // skewed top-right corner
  { x: 0, y: 6 }
];
const beforeAngle = computeCornerAngleDeg(skewedPts, 2);
if (beforeAngle === null || Math.abs(beforeAngle - 90) < 1) {
  throw new Error(`Expected skewed corner #2 away from 90 deg, got ${beforeAngle}`);
}
let skewedOutline = classifyOutlineEdge(
  {
    id: 'skew-test',
    points: skewedPts,
    edges: [
      { id: 'e0', from: skewedPts[0], to: skewedPts[1], type: 'outline', hasWall: true, eaveSetbackM: 0.45 },
      { id: 'e1', from: skewedPts[1], to: skewedPts[2], type: 'verge' },
      { id: 'e2', from: skewedPts[2], to: skewedPts[3], type: 'ridge' },
      { id: 'e3', from: skewedPts[3], to: skewedPts[0], type: 'wall', hasWall: true }
    ]
  },
  'e0',
  'outline'
);
const squaredOutline = squareOutlineCorner(skewedOutline, 2);
const afterAngle = computeCornerAngleDeg(squaredOutline.points, 2);
if (afterAngle === null || Math.abs(afterAngle - 90) > 0.2) {
  throw new Error(`Expected corner #2 squared to 90.0 deg, got ${afterAngle}`);
}
// Neighboring corners 1 and 3 must stay stationary
if (
  squaredOutline.points[1].x !== 10 ||
  squaredOutline.points[1].y !== 0 ||
  squaredOutline.points[3].x !== 0 ||
  squaredOutline.points[3].y !== 6
) {
  throw new Error('Squaring corner #2 must not move neighbor corners 1 or 3');
}
// Preserved edge metadata
if (
  squaredOutline.edges[0].hasWall !== true ||
  squaredOutline.edges[0].eaveSetbackM !== 0.45 ||
  squaredOutline.edges[1].type !== 'verge' ||
  squaredOutline.edges[2].type !== 'ridge' ||
  squaredOutline.edges[3].type !== 'wall'
) {
  throw new Error('squareOutlineCorner must preserve all edge classifications and wall/setback metadata');
}
// True 90 deg corner remains invariant under squarePolygonCorner
const trueRect = squarePolygonCorner(
  [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 6 },
    { x: 0, y: 6 }
  ],
  2
);
if (Math.abs(trueRect[2].x - 10) > 1e-3 || Math.abs(trueRect[2].y - 6) > 1e-3) {
  throw new Error('Existing 90 deg corner must remain invariant');
}
console.log(
  `✓ Test 32 Passed: Corner squaring (${beforeAngle}° -> ${afterAngle}°) preserves neighbor coordinates & edge metadata.`
);

// 33. TEST 33: Abutment Roof Draw Parity — Infinite Host Line Snap & Shorter/Equal/Longer Colinear Tagging
const hostWallEdge: PlanEdge = {
  id: 'host-wall-south',
  from: { x: 0, y: 6 },
  to: { x: 12, y: 6 },
  type: 'wall',
  hasWall: true,
  eaveHeightM: 2.7,
  eaveSetbackM: 0.45
};

// 33a. Supporting line snap works mid-segment, past both ends, and releases cleanly outboard
const snapMid = snapPointToSupportingLine({ x: 5.5, y: 6.18 }, hostWallEdge.from, hostWallEdge.to, 0.35);
const snapBeforeFrom = snapPointToSupportingLine({ x: -2.4, y: 5.82 }, hostWallEdge.from, hostWallEdge.to, 0.35);
const snapPastTo = snapPointToSupportingLine({ x: 14.8, y: 6.2 }, hostWallEdge.from, hostWallEdge.to, 0.35);
const noSnapOutboard = snapPointToSupportingLine({ x: 5.5, y: 8.5 }, hostWallEdge.from, hostWallEdge.to, 0.35);
if (
  !snapMid.snapped ||
  snapMid.pt.y !== 6 ||
  !snapBeforeFrom.snapped ||
  snapBeforeFrom.pt.x !== -2.4 ||
  snapBeforeFrom.pt.y !== 6 ||
  !snapPastTo.snapped ||
  snapPastTo.pt.x !== 14.8 ||
  snapPastTo.pt.y !== 6 ||
  noSnapOutboard.snapped
) {
  throw new Error('snapPointToSupportingLine failed infinite supporting line snap behavior');
}

// 33b. Shorter mid-wall lean-to abutment [3..9] against [0..12] host
const shorterAbutment = buildAttachedOutlineFromEdge(
  hostWallEdge,
  [
    { x: 3, y: 6 },
    { x: 9, y: 6 },
    { x: 9, y: 9.5 },
    { x: 3, y: 9.5 }
  ],
  'abutment-shorter'
);
if (
  shorterAbutment.edges[0].type !== 'wall' ||
  shorterAbutment.edges[0].hasWall !== true ||
  shorterAbutment.edges[0].eaveHeightM !== 2.7 ||
  shorterAbutment.edges[0].eaveSetbackM !== 0.45 ||
  !shorterAbutment.edges.slice(1).every((e) => e.type === 'unclassified')
) {
  throw new Error('Shorter mid-wall abutment must tag only the colinear shared chord as wall and inherit host defaults');
}

// 33c. Longer abutment [-2..15] extending past BOTH host endpoints [0..12]
const longerAbutment = buildAttachedOutlineFromEdge(
  hostWallEdge,
  [
    { x: -2, y: 6 },
    { x: 15, y: 6 },
    { x: 15, y: 10 },
    { x: -2, y: 10 }
  ],
  'abutment-longer'
);
if (
  longerAbutment.edges[0].type !== 'wall' ||
  longerAbutment.edges[0].hasWall !== true ||
  longerAbutment.edges[0].eaveHeightM !== 2.7 ||
  longerAbutment.edges[0].eaveSetbackM !== 0.45 ||
  !longerAbutment.edges.slice(1).every((e) => e.type === 'unclassified')
) {
  throw new Error('Longer abutment extending past host endpoints must tag colinear shared chord as wall');
}

// 33d. Equal full-face abutment against an eave ('outline') host edge + Square close parity
const hostEaveEdge: PlanEdge = {
  id: 'host-eave-north',
  from: { x: 0, y: 0 },
  to: { x: 10, y: 0 },
  type: 'outline',
  eaveHeightM: 2.4,
  eaveSetbackM: 0.6
};
const equalFromEave = buildAttachedOutlineFromEdge(
  hostEaveEdge,
  buildCompleteSquarePoints(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: -3.5 }
    ],
    true
  )!,
  'abutment-equal-eave'
);
if (
  equalFromEave.edges[0].type !== 'wall' ||
  equalFromEave.edges[0].eaveHeightM !== 2.4 ||
  equalFromEave.edges[0].eaveSetbackM !== 0.6 ||
  !equalFromEave.edges.slice(1).every((e) => e.type === 'unclassified')
) {
  throw new Error('Equal abutment attached to eave with Close Square must tag shared edge as wall');
}

// 33e. Distant colinear edge without overlap must NOT be misclassified
if (
  isEdgeColinearWithSegment(
    { from: { x: 20, y: 6 }, to: { x: 25, y: 6 } },
    hostWallEdge.from,
    hostWallEdge.to
  )
) {
  throw new Error('Non-overlapping distant segment on same line must not match host edge');
}

console.log(
  '✓ Test 33 Passed: Abutment roof draw parity (infinite host snap + shorter/equal/longer colinear wall tagging) verified.'
);

// 34. TEST 34: Explicit Penetration Placement Relationships (From Eave, From Apex, From Side, Cut Aperture & Plane Reassign)
import {
  computeAssetPlacementMetrics,
  updateAssetFromPlacement,
  repositionAssetToPlane,
  resolveEffectivePlanesWithAssets
} from '../exactRoofingEngine';
import { evaluateTakeoffCompleteness } from '../takeoffCompleteness';
import { deriveWallPlanFromRoofLevels } from '../wallCladdingEngine';

const gablePreset34 = getMultiLevelPreset('straight_gable', 22.5);
const hostFaceA = gablePreset34.planes[0];
const hostFaceB = gablePreset34.planes[1];

const rawSkylight: import('../../types/exactRoofing').RoofAsset = {
  id: 'asset-skylight-34',
  type: 'skylight',
  planeId: hostFaceA.id,
  center: {
    x: (hostFaceA.planPolygon[0].x + hostFaceA.planPolygon[1].x) / 2,
    y: hostFaceA.planPolygon[0].y + 2.0 * (hostFaceA.runDirection?.y ?? 1)
  },
  widthM: 1.2,
  depthM: 1.5,
  label: 'Skylight 1'
};

// Move skylight explicitly to 1.40m from eave along slope
const placedFromEave = updateAssetFromPlacement(hostFaceA, rawSkylight, {
  distFromEaveM: 1.4,
  offsetFromLeftM: 4.5
});
const mEave = computeAssetPlacementMetrics(hostFaceA, placedFromEave);
if (
  Math.abs((placedFromEave.distFromEaveM ?? -1) - 1.4) > 0.03 ||
  Math.abs(mEave.distFromEaveM - 1.4) > 0.03 ||
  Math.abs((placedFromEave.offsetFromLeftM ?? -1) - 4.5) > 0.03 ||
  Math.abs(
    mEave.distFromEaveM + mEave.depthSlopeM + mEave.distFromApexM - mEave.runSlopeM
  ) > 0.06
) {
  throw new Error(
    `Expected skylight distFromEave=1.40m & sum(eave+depthSlope+apex)=runSlope (${mEave.distFromEaveM}+${mEave.depthSlopeM}+${mEave.distFromApexM} vs ${mEave.runSlopeM})`
  );
}

// Now anchor from apex (0.85m clearance from ridge) & confirm eave distance shifts accordingly
const placedFromApex = updateAssetFromPlacement(hostFaceA, placedFromEave, {
  distFromApexM: 0.85
});
const mApex = computeAssetPlacementMetrics(hostFaceA, placedFromApex);
if (
  Math.abs((placedFromApex.distFromApexM ?? -1) - 0.85) > 0.03 ||
  Math.abs(mApex.distFromApexM - 0.85) > 0.03 ||
  mApex.distFromEaveM <= mEave.distFromEaveM
) {
  throw new Error(
    `Expected distFromApex=0.85m to shift skylight upslope cleanly (got apex=${mApex.distFromApexM}, eave=${mApex.distFromEaveM})`
  );
}

// Confirm cut-layout apertures reflect the updated placement & reassigning plane works cleanly
const resolved34 = resolveEffectivePlanesWithAssets([hostFaceA, hostFaceB], [placedFromApex], []);
const effectiveHostA = resolved34.find((p) => p.id === hostFaceA.id)!;
if (!effectiveHostA.apertures || effectiveHostA.apertures.length !== 1) {
  throw new Error('Expected hostFaceA to emit 1 aperture synced with placed skylight');
}
const movedToB = repositionAssetToPlane(hostFaceB, placedFromApex);
if (movedToB.planeId !== hostFaceB.id || movedToB.distFromEaveM === undefined) {
  throw new Error('repositionAssetToPlane failed to reassign host plane and placement metrics');
}
console.log(
  `✓ Test 34 Passed: Skylight/penetration Eave (${mEave.distFromEaveM}m) <-> Apex (${mApex.distFromApexM}m) relationships & aperture sync verified.`
);

// 35. TEST 35: Takeoff Completeness Evaluator (Undetailed Walls, Return Faces, Flashings, Planes & Penetrations)
const uWallSeed35 = deriveWallPlanFromRoofLevels(
  [
    createRoofLevel(1, 'U-Courtyard', 2.7, [
      { x: 0, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 8 },
      { x: 10, y: 8 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 8 },
      { x: 0, y: 8 }
    ])
  ],
  2.7
)!;
const lines35 = getAssignableRoofLinesMultiLevel(gablePreset34.levels, gablePreset34.planes);
const criticalLines35 = lines35.filter((l) => l.flashingKind !== 'eave');

const incompleteReport = evaluateTakeoffCompleteness({
  levels: gablePreset34.levels,
  planes: gablePreset34.planes,
  assignableLines: lines35,
  flashingAssignments: [],
  wallPlan: uWallSeed35,
  assets: [{ ...placedFromApex, planeId: 'missing-plane-id' }]
});

if (
  incompleteReport.isComplete ||
  incompleteReport.undetailedWallsCount !== 8 ||
  incompleteReport.undetailedReturnsCount !== 3 ||
  incompleteReport.unassignedFlashingsCount !== criticalLines35.length ||
  incompleteReport.incompletePenetrationsCount !== 1
) {
  throw new Error(
    `Takeoff completeness counts mismatch: ${JSON.stringify({
      undetailedWalls: incompleteReport.undetailedWallsCount,
      undetailedReturns: incompleteReport.undetailedReturnsCount,
      unassignedFlashings: incompleteReport.unassignedFlashingsCount,
      incompletePenetrations: incompleteReport.incompletePenetrationsCount
    })}`
  );
}

// Resolve all critical issues: assign cladding to all 8 walls, assign all critical flashings, fix asset host plane
const canLockReport = evaluateTakeoffCompleteness({
  levels: gablePreset34.levels,
  planes: gablePreset34.planes,
  assignableLines: lines35,
  flashingAssignments: criticalLines35.map((l) => ({
    id: `fa-${l.lineId}`,
    lineId: l.lineId,
    lineLabel: l.label,
    flashingKind: l.flashingKind,
    profileId: 'prof-1',
    profileName: 'Standard Flashing',
    planLengthM: l.planLengthM,
    trueSlopeLengthM: l.trueSlopeLengthM,
    pieceLengthLm: 4,
    quantity: l.recommendedQuantity,
    totalLinearMetres: l.totalOrderLengthM,
    assignedAt: new Date().toISOString()
  })),
  wallPlan: {
    ...uWallSeed35,
    facets: uWallSeed35.facets.map((f) => ({ ...f, claddingType: 'weatherboard' }))
  },
  assets: [placedFromApex]
});

if (!canLockReport.canLockMeasure || canLockReport.blockersCount !== 0) {
  throw new Error(
    `Expected canLockMeasure=true and blockersCount=0 after resolving critical issues, got blockers=${canLockReport.blockersCount}`
  );
}

// Resolve optional eave drips as well -> 0 total issues
const completeReport = evaluateTakeoffCompleteness({
  levels: gablePreset34.levels,
  planes: gablePreset34.planes,
  assignableLines: lines35,
  flashingAssignments: lines35.map((l) => ({
    id: `fa-${l.lineId}`,
    lineId: l.lineId,
    lineLabel: l.label,
    flashingKind: l.flashingKind,
    profileId: 'prof-1',
    profileName: 'Standard Flashing',
    planLengthM: l.planLengthM,
    trueSlopeLengthM: l.trueSlopeLengthM,
    pieceLengthLm: 4,
    quantity: l.recommendedQuantity,
    totalLinearMetres: l.totalOrderLengthM,
    assignedAt: new Date().toISOString()
  })),
  wallPlan: {
    ...uWallSeed35,
    facets: uWallSeed35.facets.map((f) => ({ ...f, claddingType: 'weatherboard' }))
  },
  assets: [placedFromApex]
});

if (!completeReport.isComplete || completeReport.totalIssuesCount !== 0) {
  throw new Error(`Expected completeReport.isComplete=true after resolving all issues, got ${completeReport.totalIssuesCount}`);
}
console.log(
  '✓ Test 35 Passed: Takeoff completeness gate catches undetailed walls/returns, missing flashings & orphan penetrations and clears when resolved.'
);

// 36. TEST 36: Practical Sheet Ordering (Default Simple Cut List vs Optimized Toggle)
const pracSpec: SheetSpec = { coverWidth: 0.762, maxLength: 6.5, endLap: 0.15, overhang: 0.05 };

// 36a. Simple 14x10 4-hip roof -> Practical default picks 1 dominant length and covers every piece
const pracHipLayout = generateCuttingLayout(planes, pracSpec);
const optHipLayout = generateCuttingLayout(planes, pracSpec, { sheetOrderMode: 'optimized' });
const pracHipDistinct = new Set(pracHipLayout.parents.map((p) => Math.round(p.length * 1000)));
const optHipDistinct = new Set(optHipLayout.parents.map((p) => Math.round(p.length * 1000)));

if (pracHipLayout.sheetOrderMode !== 'practical') {
  throw new Error(`Expected default sheetOrderMode to be 'practical', got ${pracHipLayout.sheetOrderMode}`);
}
if (pracHipDistinct.size !== 1) {
  throw new Error(`Simple 14x10 hip should use 1 Practical stock length, got ${pracHipDistinct.size} (${Array.from(pracHipDistinct).join(',')})`);
}
if (optHipLayout.totalOrderedMetres > pracHipLayout.totalOrderedMetres + 0.05) {
  throw new Error(`Optimized mode (${optHipLayout.totalOrderedMetres}m) should not significantly exceed Practical (${pracHipLayout.totalOrderedMetres}m)`);
}
if (optHipDistinct.size <= pracHipDistinct.size) {
  throw new Error(`Expected Optimized mode to use more distinct lengths than 1-length Practical on 4-hip`);
}
pracHipLayout.parents.forEach((par) => {
  par.pieces.forEach((pc) => {
    if (pc.length > par.length + 0.002) {
      throw new Error(`Parent ${par.id} (${par.length}m) shorter than piece ${pc.id} (${pc.length}m)`);
    }
  });
});

// 36b. Multi-body disparate roof (two_storey_split: main upper ~5.4m + lower wing ~3.2m) -> 2-3 Practical lengths
const splitPreset36 = getMultiLevelPreset('two_storey_split', 22.5);
const pracSplitLayout = generateCuttingLayout(splitPreset36.planes, pracSpec);
const pracSplitDistinct = new Set(pracSplitLayout.parents.map((p) => Math.round(p.length * 1000)));
if (pracSplitDistinct.size < 2 || pracSplitDistinct.size > 3) {
  throw new Error(
    `Expected multi-body 2-storey roof in Practical mode to use 2-3 stock lengths, got ${pracSplitDistinct.size} (${Array.from(pracSplitDistinct).join(',')})`
  );
}
const pracSplitExactSum = +pracSplitLayout.parents.reduce((s, p) => s + p.length, 0).toFixed(2);
if (Math.abs(pracSplitExactSum - pracSplitLayout.totalOrderedMetres) > 0.02) {
  throw new Error(
    `Practical multi-body sum (${pracSplitExactSum}) must strictly reconcile with totalOrderedMetres (${pracSplitLayout.totalOrderedMetres})`
  );
}

// 36c. Site-measured sheet override in Practical mode keeps exact 1mm override while non-override stays Practical
const pracOverridePlanes: RoofPlane[] = planes.map((p, idx) =>
  idx === 0 ? { ...p, orderedSheetLengthM: 5.435 } : p
);
const pracOverrideLayout = generateCuttingLayout(pracOverridePlanes, pracSpec);
const pracOverrideLengths = new Set(pracOverrideLayout.parents.map((p) => Math.round(p.length * 1000)));
if (!pracOverrideLengths.has(5435)) {
  throw new Error(`Expected exact 5435mm override preserved in Practical mode, got ${Array.from(pracOverrideLengths).join(',')}`);
}
if (pracOverrideLengths.size > 2) {
  throw new Error(`Expected 5435mm override + 1 Practical stock length, got ${pracOverrideLengths.size} lengths`);
}

console.log(
  `✓ Test 36 Passed: Practical default uses ${pracHipDistinct.size} length on 4-hip (${pracHipLayout.totalOrderedMetres}m vs Optimized ${optHipLayout.totalOrderedMetres}m across ${optHipDistinct.size} lengths), ${pracSplitDistinct.size} lengths on 2-storey split, and exact 5435mm site override intact.`
);

// 37. TEST 37: Full 10-Type Roof Line Catalog, Multi-Apply Batch Helpers & Mixed-Pitch Warning
if (ROOF_LINE_TYPE_CATALOG.length !== 10) {
  throw new Error(`Expected 10 roof line types in ROOF_LINE_TYPE_CATALOG, got ${ROOF_LINE_TYPE_CATALOG.length}`);
}
for (const entry of ROOF_LINE_TYPE_CATALOG) {
  const edgeMeta = getRoofEdgeTypeMeta(entry.edgeType);
  const skelMeta = getSkeletonLineTypeMeta(entry.lineType);
  if (!edgeMeta.label || !skelMeta.label || edgeMeta.edgeType !== entry.edgeType || skelMeta.lineType !== entry.lineType) {
    throw new Error(`Metadata lookup mismatch for catalog type ${entry.code}`);
  }
}
if (getRoofEdgeTypeMeta('rake').label !== 'Rake' || getRoofEdgeTypeMeta('apron').label !== 'Apron / Step') {
  throw new Error('Expected Rake and Apron / Step metadata labels to resolve cleanly');
}

const batchOutline0 = getPresetOutline('rectangle_14x10');
const batchSkeleton0 = generateSkeletonLines(batchOutline0);
const multiEdgeIds = [batchOutline0.edges[1].id, batchOutline0.edges[3].id];
const rakeOutline = applyEdgeType(batchOutline0, [batchOutline0.edges[1].id], 'rake');
const apronOutline = applyEdgeType(rakeOutline, [batchOutline0.edges[3].id], 'apron');
if (
  apronOutline.edges.find((e) => e.id === batchOutline0.edges[1].id)?.type !== 'rake' ||
  apronOutline.edges.find((e) => e.id === batchOutline0.edges[3].id)?.type !== 'apron'
) {
  throw new Error('applyEdgeType failed to batch-apply rake and apron edge types');
}

const setbackOutline = applyEaveSetback(apronOutline, multiEdgeIds, 0.45, true);
const heightOutline = applyEaveHeightToEdges(setbackOutline, multiEdgeIds, 3.15);
multiEdgeIds.forEach((eid) => {
  const ed = heightOutline.edges.find((e) => e.id === eid);
  if (!ed || ed.eaveSetbackM !== 0.45 || ed.eaveHeightM !== 3.15) {
    throw new Error(`Batch setback/height update failed for edge ${eid}`);
  }
});

const skelIdsToBatch = batchSkeleton0.slice(0, 2).map((s) => s.id);
const updatedSkeleton = applySkeletonLineType(batchSkeleton0, skelIdsToBatch, 'barge');
skelIdsToBatch.forEach((sid) => {
  if (updatedSkeleton.find((s) => s.id === sid)?.suggestedType !== 'barge') {
    throw new Error(`applySkeletonLineType failed to update line ${sid}`);
  }
});

const batchLvl = createRoofLevel(1, 'Main Roof', 2.7, batchOutline0.points);
const mixedPitchPlanes0 = syncMultiLevelPlanes([batchLvl], [], 22.5);
const twoPlaneIds = [mixedPitchPlanes0[0].id, mixedPitchPlanes0[2].id];
const mixedPitchPlanes = applyPitchToPlanes(mixedPitchPlanes0, [mixedPitchPlanes0[0].id], 15, [batchLvl]);
if (mixedPitchPlanes[0].pitchDeg !== 15 || mixedPitchPlanes[2].pitchDeg !== 22.5) {
  throw new Error('applyPitchToPlanes should update targeted plane pitch and leave others untouched');
}

const mixedReport = evaluateTakeoffCompleteness({
  levels: [batchLvl],
  planes: mixedPitchPlanes,
  assignableLines: [],
  flashingAssignments: [],
  wallPlan: null,
  assets: []
});
if (!mixedReport.issues.some((i) => i.category === 'mixed_pitch')) {
  throw new Error('Expected evaluateTakeoffCompleteness to emit mixed_pitch warning on mixed-pitch level');
}

const unifiedPlanes = applyPitchToPlanes(mixedPitchPlanes, mixedPitchPlanes.map((p) => p.id), 25, [batchLvl]);
const unifiedReport = evaluateTakeoffCompleteness({
  levels: [batchLvl],
  planes: unifiedPlanes,
  assignableLines: [],
  flashingAssignments: [],
  wallPlan: null,
  assets: []
});
if (unifiedReport.issues.some((i) => i.category === 'mixed_pitch')) {
  throw new Error('Expected mixed_pitch warning to clear once level planes are unified via applyPitchToPlanes');
}

const flippedPlanes = applyDirectionToPlanes(unifiedPlanes, twoPlaneIds, 'right');
twoPlaneIds.forEach((pid) => {
  if (flippedPlanes.find((p) => p.id === pid)?.underlapSide !== 'right') {
    throw new Error(`applyDirectionToPlanes failed on ${pid}`);
  }
});

const beforeOverride = flippedPlanes[0];
const overriddenPlanes = applyOrderedSheetLengthToPlanes(flippedPlanes, twoPlaneIds, 5.425);
const afterOverride = overriddenPlanes[0];
if (
  afterOverride.orderedSheetLengthM !== 5.425 ||
  afterOverride.slopeLength !== beforeOverride.slopeLength ||
  JSON.stringify(afterOverride.planPolygon) !== JSON.stringify(beforeOverride.planPolygon) ||
  JSON.stringify(afterOverride.developedPolygon) !== JSON.stringify(beforeOverride.developedPolygon)
) {
  throw new Error('applyOrderedSheetLengthToPlanes must set site length while keeping planPolygon, developedPolygon & slopeLength unchanged');
}

console.log('✓ Test 37 Passed: Full 10-type roof line catalog, batch multi-apply helpers, override geometry lock & mixed_pitch check.');

// 38. First-class Gable ends ('verge' & 'rake') -> 0 hips, 1 ridge, 2 dual-slope faces, raked barge flashings & eave-only gutters
{
  const rect14 = getPresetOutline('rectangle_14x10');
  const vergeIds = [rect14.edges[1].id, rect14.edges[3].id];
  const gableVergeOutline = applyEdgeType(rect14, vergeIds, 'verge');
  const gableVergeSkel = generateSkeletonLines(gableVergeOutline);
  if (
    gableVergeSkel.filter((s) => s.suggestedType === 'hip').length !== 0 ||
    gableVergeSkel.filter((s) => s.suggestedType === 'ridge').length !== 1
  ) {
    throw new Error(
      `Expected 0 hips and 1 ridge for 'verge' gable rectangle, got ${JSON.stringify(
        gableVergeSkel.map((s) => s.suggestedType)
      )}`
    );
  }
  const lvlVerge = {
    ...createRoofLevel(1, 'Verge Gable', 2.7, gableVergeOutline.points),
    outline: gableVergeOutline,
    skeleton: gableVergeSkel
  };
  const planesVerge = syncMultiLevelPlanes([lvlVerge], [], 22.5);
  if (planesVerge.length !== 2) {
    throw new Error(`Expected 2 gable planes for verge rectangle, got ${planesVerge.length}`);
  }
  const sumAreaVerge = planesVerge.reduce((s, p) => s + (p.area || 0), 0);
  const expectedVergeSlopeArea = 140 / Math.cos((22.5 * Math.PI) / 180);
  if (Math.abs(sumAreaVerge - expectedVergeSlopeArea) > 1.5) {
    throw new Error(`Verge gable developed area (${sumAreaVerge.toFixed(2)}) mismatch vs ${expectedVergeSlopeArea.toFixed(2)}`);
  }

  // Repeat using explicit 'rake' edge classification on gable ends
  const gableRakeOutline = applyEdgeType(rect14, vergeIds, 'rake');
  const gableRakeSkel = generateSkeletonLines(gableRakeOutline);
  if (
    gableRakeSkel.filter((s) => s.suggestedType === 'hip').length !== 0 ||
    gableRakeSkel.filter((s) => s.suggestedType === 'ridge').length !== 1
  ) {
    throw new Error(
      `Expected 0 hips and 1 ridge for 'rake' gable rectangle, got ${JSON.stringify(
        gableRakeSkel.map((s) => s.suggestedType)
      )}`
    );
  }
  const lvlRake = {
    ...createRoofLevel(1, 'Rake Gable', 2.7, gableRakeOutline.points),
    outline: gableRakeOutline,
    skeleton: gableRakeSkel
  };
  const planesRake = syncMultiLevelPlanes([lvlRake], [], 22.5);
  if (planesRake.length !== 2) {
    throw new Error(`Expected 2 gable planes for rake rectangle, got ${planesRake.length}`);
  }

  const linesRake = getAssignableRoofLines(lvlRake.outline, lvlRake.skeleton, planesRake);
  const eaveLines = linesRake.filter((l) => l.flashingKind === 'eave');
  const bargeLines = linesRake.filter((l) => l.flashingKind === 'barge');
  if (eaveLines.length !== 2) {
    throw new Error(`Expected strictly 2 gutter/eave lines (stopping at gables), got ${eaveLines.length}`);
  }
  if (bargeLines.length !== 2) {
    throw new Error(`Expected 2 raked barge lines across 2 gable ends, got ${bargeLines.length}`);
  }
  if (!bargeLines.every((b) => b.trueSlopeLengthM > b.planLengthM + 0.5)) {
    throw new Error('Gable barge lines must measure true raked slope length (> plan run)');
  }

  // Verify applyRoofStylePreset('hipped') restores hips and setEdgeMode toggles back cleanly
  const hippedRes = applyRoofStylePreset(gableRakeOutline, 'hipped');
  if (hippedRes.outline.edges.some((e) => e.type !== 'outline') || hippedRes.skeleton.filter((s) => s.suggestedType === 'hip').length !== 4) {
    throw new Error('applyRoofStylePreset(hipped) should convert gable rake ends back to outline eaves + 4 hips');
  }
  const singleGableRes = setEdgeMode(hippedRes.outline, hippedRes.skeleton, hippedRes.outline.edges[1].id, 'gable');
  if (singleGableRes.outline.edges[1].type !== 'verge') {
    throw new Error('setEdgeMode(gable) should mark target edge as verge');
  }
}
console.log('✓ Test 38 Passed: First-class verge & rake gables emit 0 hips, 2 clean slopes, eave-only gutters & raked barges.');

// 39. Multi-wing L-shape & T-shape gable topology (no end hips, clean wing valleys/ridges, full footprint coverage)
{
  const lShapePts = [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 12, y: 5 },
    { x: 5, y: 5 },
    { x: 5, y: 12 },
    { x: 0, y: 12 }
  ];
  const lOutline0 = buildOutlineFromPoints(lShapePts);
  // Wing 1 end at x=12 (edge 1) and Wing 2 end at y=12 (edge 4) set to gable ('rake' / 'verge')
  let lOutline = applyEdgeType(lOutline0, [lOutline0.edges[1].id], 'verge');
  lOutline = applyEdgeType(lOutline, [lOutline.edges[4].id], 'rake');
  const lSkel = generateSkeletonLines(lOutline);
  const lHipsAtGables = lSkel.filter((s) => s.suggestedType === 'hip');
  if (lHipsAtGables.length !== 1 && lHipsAtGables.length !== 2) {
    // Only the shared outer corner (0,0) has 1 hip bisecting the two outer eaves; gable corners (12,0), (12,5), (0,12), (5,12) must have 0 hips!
    const touchesGableEndCorner = lHipsAtGables.some(
      (h) =>
        (Math.abs(h.from.x - 12) < 0.2 || Math.abs(h.from.y - 12) < 0.2) &&
        (h.from.x > 0.2 || h.from.y > 0.2)
    );
    if (touchesGableEndCorner) {
      throw new Error('Unexpected hip generated on designated gable end corner in L-shape');
    }
  }
  const lLvl = { ...createRoofLevel(1, 'L Gable', 2.7, lShapePts), outline: lOutline, skeleton: lSkel };
  const lPlanes = syncMultiLevelPlanes([lLvl], [], 22.5);
  if (lPlanes.length !== 4) {
    throw new Error(`Expected 4 faces on L-shape with 2 gable wing ends, got ${lPlanes.length}`);
  }
  const expectedLPlanArea = 12 * 5 + 5 * 7; // 60 + 35 = 95m^2
  const lPlanSum = lPlanes.reduce((s, p) => {
    let a = 0;
    for (let i = 0; i < p.planPolygon.length; i++) {
      const p1 = p.planPolygon[i];
      const p2 = p.planPolygon[(i + 1) % p.planPolygon.length];
      a += p1.x * p2.y - p2.x * p1.y;
    }
    return s + Math.abs(a) / 2;
  }, 0);
  if (Math.abs(lPlanSum - expectedLPlanArea) > 2.5) {
    throw new Error(`L-gable plane footprint coverage mismatch: ${lPlanSum.toFixed(2)} vs ${expectedLPlanArea}`);
  }

  // T-shape with all 3 wing tips marked gable
  const tShapePts = [
    { x: 0, y: 0 },
    { x: 16, y: 0 },
    { x: 16, y: 6 },
    { x: 11, y: 6 },
    { x: 11, y: 14 },
    { x: 5, y: 14 },
    { x: 5, y: 6 },
    { x: 0, y: 6 }
  ];
  const tOutline0 = buildOutlineFromPoints(tShapePts);
  const tOutline = applyEdgeType(
    tOutline0,
    [tOutline0.edges[1].id, tOutline0.edges[4].id, tOutline0.edges[7].id],
    'verge'
  );
  const tSkel = generateSkeletonLines(tOutline);
  if (tSkel.filter((s) => s.suggestedType === 'hip').length !== 0) {
    throw new Error('Expected 0 hips on 3-gable T-shape roof');
  }
  const tLvl = { ...createRoofLevel(1, 'T Gable', 2.7, tShapePts), outline: tOutline, skeleton: tSkel };
  const tPlanes = syncMultiLevelPlanes([tLvl], [], 20);
  if (tPlanes.length !== 5) {
    throw new Error(`Expected 5 sloped faces across the 5 eaves of 3-gable T-shape roof, got ${tPlanes.length}`);
  }
  const expectedTPlanArea = 16 * 6 + 6 * 8; // 96 + 48 = 144m^2
  const tPlanSum = tPlanes.reduce((s, p) => {
    let a = 0;
    for (let i = 0; i < p.planPolygon.length; i++) {
      const p1 = p.planPolygon[i];
      const p2 = p.planPolygon[(i + 1) % p.planPolygon.length];
      a += p1.x * p2.y - p2.x * p1.y;
    }
    return s + Math.abs(a) / 2;
  }, 0);
  if (Math.abs(tPlanSum - expectedTPlanArea) > 3.0) {
    throw new Error(`T-gable plane footprint coverage mismatch: ${tPlanSum.toFixed(2)} vs ${expectedTPlanArea}`);
  }
}
console.log('✓ Test 39 Passed: Multi-wing L-shape & T-shape gable topologies solve cleanly without spurious end-hips.');

// 40. Build Faces from Classification (unclassified -> classified + manual short ridge snapping)
{
  const pts = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 6 },
    { x: 0, y: 6 }
  ];
  const rawOutline = buildOutlineFromPoints(pts, 'unclassified');
  // Classify opposing eaves & gable ends (using mixed 'rake' & 'verge')
  let classified = applyEdgeType(rawOutline, [rawOutline.edges[0].id, rawOutline.edges[2].id], 'outline');
  classified = applyEdgeType(classified, [classified.edges[1].id], 'verge');
  classified = applyEdgeType(classified, [classified.edges[3].id], 'rake');

  const emptyBuild = buildFacesFromClassification(
    [{ id: 'level-1', code: 'L1', name: 'Main', eaveHeightM: 2.7, outline: classified, skeleton: [] }],
    [],
    22.5
  );
  if (emptyBuild.planes.length !== 2) {
    throw new Error(`Expected buildFacesFromClassification to generate 2 gable planes cleanly, got ${emptyBuild.planes.length}`);
  }

  // Test manual ridge stopping 0.2m short of both gable walls (x=0.2..9.8) -> planar snapper closes cleanly
  const manualShortLvl: RoofLevel = {
    id: 'level-1',
    code: 'L1',
    name: 'Manual',
    eaveHeightM: 2.7,
    outline: classified,
    skeleton: [
      {
        id: 'sk-manual-ridge',
        levelId: 'level-1',
        from: { x: 0.2, y: 3 },
        to: { x: 9.8, y: 3 },
        suggestedType: 'ridge'
      }
    ]
  };
  const manualBuild = buildFacesFromClassification([manualShortLvl], [], 22.5);
  if (manualBuild.planes.length !== 2) {
    throw new Error(`Expected manual short ridge build to snap and produce 2 planes, got ${manualBuild.planes.length}`);
  }
}
console.log('✓ Test 40 Passed: buildFacesFromClassification builds clean gable planes from empty or slightly short manual ridges.');

// 41. Delete Face persistence (deleteRoofPlanes suppresses face across unrelated edits, preserves outline/skeleton, unsuppress restores)
{
  const rect14 = getPresetOutline('rectangle_14x10');
  const lvl41: RoofLevel = {
    ...createRoofLevel(1, 'Main Roof', 2.7, rect14.points),
    outline: rect14,
    skeleton: generateSkeletonLines(rect14)
  };
  const planes41 = syncMultiLevelPlanes([lvl41], [], 22.5);
  const doomedPlane = planes41[0];

  // Delete 1 face
  const afterDel1 = deleteRoofPlanes([lvl41], planes41, [doomedPlane.id]);
  if (afterDel1.planes.length !== planes41.length - 1) {
    throw new Error('deleteRoofPlanes failed to remove targeted plane');
  }
  if (afterDel1.levels[0].outline.edges.length !== 4 || afterDel1.levels[0].skeleton.length !== 5) {
    throw new Error('deleteRoofPlanes must NOT remove outline edges or skeleton lines');
  }

  // Perform unrelated edits: change pitch on remaining face, change eave height Z, update eave setback/wall, add skeleton line
  const remainingEdited = afterDel1.planes.map((p) => ({ ...p, pitchDeg: 30 }));
  const editedOutline = applyEaveHeightToEdges(afterDel1.levels[0].outline, [rect14.edges[2].id], 3.2);
  const editedOutline2 = applyEaveSetback(editedOutline, [rect14.edges[2].id], 0.45, true);
  const editedLevels: RoofLevel[] = [
    {
      ...afterDel1.levels[0],
      outline: editedOutline2,
      skeleton: [
        ...afterDel1.levels[0].skeleton,
        { id: 'sk-extra', levelId: 'level-1', from: { x: 2, y: 5 }, to: { x: 4, y: 5 }, suggestedType: 'ridge' }
      ]
    }
  ];

  const afterResync = syncMultiLevelPlanes(editedLevels, remainingEdited, 22.5);
  if (afterResync.some((p) => p.eaveEdgeId === doomedPlane.eaveEdgeId)) {
    throw new Error('Deleted roof face must stay suppressed across unrelated pitch/height/wall/skeleton edits');
  }

  // Deleting ALL remaining faces yields 0 planes while keeping outline & skeleton intact
  const afterDelAll = deleteRoofPlanes(editedLevels, afterResync, afterResync.map((p) => p.id));
  if (afterDelAll.planes.length !== 0 || afterDelAll.levels[0].outline.edges.length !== 4) {
    throw new Error('Deleting all roof faces should yield 0 planes without destroying outline');
  }

  // Explicitly rebuilding faces via buildFacesFromClassification clears suppression cleanly
  const rebuilt41 = buildFacesFromClassification(afterDelAll.levels, [], 22.5);
  if (rebuilt41.planes.length !== 4) {
    throw new Error(`Expected explicit Build Faces to restore all 4 faces, got ${rebuilt41.planes.length}`);
  }
  const unsuppressedOnly = unsuppressOutlineEdges(afterDel1.levels, [doomedPlane.eaveEdgeId]);
  const restoredDirect = syncMultiLevelPlanes(unsuppressedOnly, afterDel1.planes, 22.5);
  if (restoredDirect.length !== 4) {
    throw new Error('unsuppressOutlineEdges should allow re-syncing that specific face');
  }
}
console.log('✓ Test 41 Passed: deleteRoofPlanes persists across unrelated edits, preserves outline/lines, and restores explicitly.');

// 42. Eave length edit AFTER eaveHeightM & wall setback are set (4-corner rect + rectilinear L-shape gable) + skeleton remap
{
  // (a) 4-corner rect where first edge is vertical (different winding) with eaveHeightM + wall/setback already set
  const vertRectPts = [
    { x: 0, y: 0 },
    { x: 0, y: 8 },
    { x: 12, y: 8 },
    { x: 12, y: 0 }
  ];
  let vertOutline = buildOutlineFromPoints(vertRectPts, 'outline');
  vertOutline = applyEaveHeightToEdges(vertOutline, [vertOutline.edges[0].id], 3.4);
  vertOutline = applyEaveSetback(vertOutline, [vertOutline.edges[0].id], 0.45, true);
  const vertSkel = generateSkeletonLines(vertOutline);

  const resizedVert = updateEdgeLength(vertOutline, vertOutline.edges[0].id, 10.5);
  const resizedEdge0 = resizedVert.edges.find((e) => e.id === vertOutline.edges[0].id)!;
  const newLen0 = dist(resizedEdge0.from, resizedEdge0.to);
  if (Math.abs(newLen0 - 10.5) > 0.02) {
    throw new Error(`Expected resized vertical edge to be 10.5m even after eaveHeightM=3.4 set, got ${newLen0}`);
  }
  if (resizedEdge0.eaveHeightM !== 3.4 || resizedEdge0.eaveSetbackM !== 0.45 || resizedEdge0.hasWall !== true) {
    throw new Error('updateEdgeLength must preserve edge eaveHeightM, eaveSetbackM & hasWall');
  }
  const remappedVertSkel = remapSkeletonForOutlineResize(vertOutline, resizedVert, vertSkel);
  if (remappedVertSkel.length !== vertSkel.length) {
    throw new Error('remapSkeletonForOutlineResize should preserve skeleton count');
  }

  // (b) Rectilinear L-shape gable: extend eave edge -> perpendicular gable walls remain 90° orthogonal & ridge follows
  const lGablePts = [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 12, y: 6 },
    { x: 6, y: 6 },
    { x: 6, y: 12 },
    { x: 0, y: 12 }
  ];
  let lOut = buildOutlineFromPoints(lGablePts);
  lOut = applyEdgeType(lOut, [lOut.edges[1].id, lOut.edges[4].id], 'verge');
  lOut = applyEaveHeightToEdges(lOut, [lOut.edges[0].id], 3.1);
  lOut = applyEaveSetback(lOut, [lOut.edges[0].id, lOut.edges[1].id], 0.4, true);
  const lGableSkel = generateSkeletonLines(lOut);

  // Extend the 12m top horizontal eave (edges[0]) to 15m after Z=3.1m is already locked in
  const lResized = updateEdgeLength(lOut, lOut.edges[0].id, 15.0);
  const e0After = lResized.edges[0];
  const e1After = lResized.edges[1];
  const lenE0After = dist(e0After.from, e0After.to);
  if (Math.abs(lenE0After - 15.0) > 0.02) {
    throw new Error(`Expected extended eave edge to equal 15.0m, got ${lenE0After}`);
  }
  const dx0 = e0After.to.x - e0After.from.x;
  const dy0 = e0After.to.y - e0After.from.y;
  const dx1 = e1After.to.x - e1After.from.x;
  const dy1 = e1After.to.y - e1After.from.y;
  const dotCorner = (dx0 * dx1 + dy0 * dy1) / (Math.hypot(dx0, dy0) * Math.hypot(dx1, dy1) || 1);
  if (Math.abs(dotCorner) > 1e-3) {
    throw new Error(`Perpendicular gable wall skewed after eave extension (dot=${dotCorner})`);
  }
  if (e0After.eaveHeightM !== 3.1 || e1After.type !== 'verge' || e1After.eaveSetbackM !== 0.4) {
    throw new Error('Extended L-gable must keep eaveHeightM, gable verge type & wall setback');
  }
  const lRemappedSkel = remapSkeletonForOutlineResize(lOut, lResized, lGableSkel);
  const ridgeTouchingEastGable = lRemappedSkel.find(
    (s) => s.suggestedType === 'ridge' && (Math.abs(s.from.x - 15) < 0.1 || Math.abs(s.to.x - 15) < 0.1)
  );
  if (!ridgeTouchingEastGable) {
    throw new Error('Expected horizontal ridge endpoint attached to east gable wall (x=12->15) to remap cleanly');
  }
}
console.log('✓ Test 42 Passed: Post-eaveHeight updateEdgeLength extends/trims cleanly on rect & rectilinear L-gables with orthogonal walls & remapped ridges.');

// 43. Classified Gable + Side T-Bay + Triangular End Panel -> Closed Planar Loops, Merged Ridge, Rebuild Hygiene & Sealed 3D Seams
{
  const fixturePts = [
    { x: 0, y: 0 },
    { x: 16, y: 0 },
    { x: 16, y: 8 },
    { x: 10, y: 8 },
    { x: 10, y: 13 },
    { x: 4, y: 13 },
    { x: 4, y: 8 },
    { x: 0, y: 8 }
  ];
  let fixOut = buildOutlineFromPoints(fixturePts, 'gable-branch-tri', {
    initialEdgeType: 'outline',
    defaultEaveHeightM: 2.7
  });
  // East end (edge 1) & West end (edge 7) & T-bay north tip (edge 4) = gable/verge ends; remaining 5 perimeter runs = eaves
  fixOut = applyEdgeType(fixOut, [fixOut.edges[1].id, fixOut.edges[4].id, fixOut.edges[7].id], 'verge');

  // Split main ridge intentionally into 2 colinear segments with a tiny 0.05m gap + off-45° side-bay valleys + triangular east corner
  const fixSkel: SkeletonLine[] = [
    { id: 'r-left', levelId: 'level-1', from: { x: 0, y: 4 }, to: { x: 7.0, y: 4 }, suggestedType: 'ridge' },
    { id: 'r-right', levelId: 'level-1', from: { x: 7.05, y: 4 }, to: { x: 12, y: 4 }, suggestedType: 'ridge' },
    { id: 'r-bay', levelId: 'level-1', from: { x: 7, y: 13 }, to: { x: 7, y: 4 }, suggestedType: 'ridge' },
    { id: 'v-bay-w', levelId: 'level-1', from: { x: 4, y: 8 }, to: { x: 7, y: 4 }, suggestedType: 'valley' },
    { id: 'v-bay-e', levelId: 'level-1', from: { x: 10, y: 8 }, to: { x: 7, y: 4 }, suggestedType: 'valley' },
    { id: 'h-tri-s', levelId: 'level-1', from: { x: 16, y: 0 }, to: { x: 12, y: 4 }, suggestedType: 'hip' },
    { id: 'h-tri-n', levelId: 'level-1', from: { x: 16, y: 8 }, to: { x: 12, y: 4 }, suggestedType: 'hip' }
  ];

  // Stale ghost plane pre-existing in state must be completely replaced by Build Faces from Classification
  const staleGhostPlane: RoofPlane = {
    ...syncMultiLevelPlanes([createRoofLevel(1, 'Ghost', 2.7, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }])], [])[0],
    id: 'plane-ghost-stale',
    eaveEdgeId: 'ghost-edge-999'
  };

  const fixLvl: RoofLevel = {
    id: 'level-1',
    code: 'L1',
    name: 'Main Gable + Branch + Tri',
    eaveHeightM: 2.7,
    outline: fixOut,
    skeleton: fixSkel
  };

  const built43 = buildFacesFromClassification([fixLvl], [staleGhostPlane], 22.5);
  const rebuiltSkel = built43.levels[0].skeleton;
  const rebuiltPlanes = built43.planes;

  // 1) Stale ghost plane gone
  if (rebuiltPlanes.some((p) => p.id === 'plane-ghost-stale')) {
    throw new Error('buildFacesFromClassification failed to evict stale ghost plane');
  }

  // 2) Colinear split main ridges merged into ONE continuous main ridge (0,4)->(12,4)
  const mainRidges43 = rebuiltSkel.filter(
    (s) => s.suggestedType === 'ridge' && Math.abs(s.from.y - 4) < 0.2 && Math.abs(s.to.y - 4) < 0.2
  );
  if (mainRidges43.length !== 1 || Math.abs(Math.hypot(mainRidges43[0].to.x - mainRidges43[0].from.x, mainRidges43[0].to.y - mainRidges43[0].from.y) - 12) > 0.2) {
    throw new Error(`Expected colinear main ridges to merge into one 12m continuous ridge, got ${mainRidges43.length} segment(s)`);
  }

  // 3) Closed planar decomposition produces all 6 faces (5 eave slopes + 1 triangular 3-boundary east panel) = exact 158m² footprint
  if (rebuiltPlanes.length !== 6) {
    throw new Error(`Expected 6 closed planes (incl. triangular east panel), got ${rebuiltPlanes.length}`);
  }
  const triPanel = rebuiltPlanes.find((p) => p.planPolygon.length === 3);
  if (!triPanel) {
    throw new Error('Expected dedicated 3-vertex triangular corner/end panel in rebuilt planes');
  }
  const planAreaSum43 = rebuiltPlanes.reduce((sum, p) => {
    let a = 0;
    for (let i = 0; i < p.planPolygon.length; i++) {
      const p1 = p.planPolygon[i];
      const p2 = p.planPolygon[(i + 1) % p.planPolygon.length];
      a += p1.x * p2.y - p2.x * p1.y;
    }
    return sum + Math.abs(a) / 2;
  }, 0);
  if (Math.abs(planAreaSum43 - 158) > 0.5) {
    throw new Error(`Expected exact 158.0m² closed planar coverage (no missing bay/triangle or double wedge), got ${planAreaSum43.toFixed(2)}m²`);
  }

  // 4) Delete face removes targeted face from both planes & BOM cleanly without ghost residuals
  const fullBom43 = generateCuttingLayout(rebuiltPlanes, { coverWidth: 0.762, maxLength: 6.3, endLap: 0.15, overhang: 0.05 });
  const afterDelTri = deleteRoofPlanes(built43.levels, rebuiltPlanes, [triPanel.id]);
  const delBom43 = generateCuttingLayout(afterDelTri.planes, { coverWidth: 0.762, maxLength: 6.3, endLap: 0.15, overhang: 0.05 });
  if (afterDelTri.planes.length !== 5 || delBom43.totalRoofArea >= fullBom43.totalRoofArea - 1.0) {
    throw new Error('deleteRoofPlanes must remove targeted plane cleanly from both model & BOM');
  }

  // 5) Shared 3D junction seam check + actual Three.js BufferGeometry mesh inspection
  const sharedRes43 = resolveLevelSharedVertexElevations(rebuiltPlanes, built43.levels[0].outline, rebuiltSkel, 2.7);
  const vBayJunction = sharedRes43.getVertexForPoint({ x: 7, y: 4 });
  const vTriApex = sharedRes43.getVertexForPoint({ x: 12, y: 4 });
  if (Math.abs(vBayJunction.z - vTriApex.z) > 0.02) {
    throw new Error(`Expected level main ridge across T-bay junction & tri apex, got z(${vBayJunction.z}) vs z(${vTriApex.z})`);
  }

  const stubTex43 = {
    normalMap: null,
    roughnessMap: null,
    bumpMap: null,
    dispose: () => {}
  } as any;
  const stubWallTex43 = {
    getEntry: () => null,
    weatherboard: { normalMap: null },
    fibre_cement: { normalMap: null },
    brick: { map: null, normalMap: null },
    garageDoor: null,
    garageDoorRoughness: null,
    garageDoorBump: null
  } as any;
  const scene43 = buildRoofSceneGroup({
    outline: built43.levels[0].outline,
    skeleton: rebuiltSkel,
    planes: rebuiltPlanes,
    levels: built43.levels,
    shadingMode: 'facet_zones',
    swatch: { name: 'Ebony', hex: '#1e293b', metalness: 0.45, roughness: 0.35 } as any,
    textures: stubTex43,
    wallTextures: stubWallTex43,
    showFlashings: true,
    showWalls: true,
    showSheetSeams: false,
    isSoftwareGl: true
  });

  // Verify every shared junction vertex in actual 3D BufferGeometries agrees in Y (upward Z) within 1mm
  const junctionPts = [
    { x: 7, y: 4 },
    { x: 12, y: 4 },
    { x: 4, y: 8 },
    { x: 10, y: 8 },
    { x: 16, y: 0 },
    { x: 16, y: 8 }
  ];
  junctionPts.forEach((jPt) => {
    const heightsAtJunction: number[] = [];
    const wx = jPt.x - scene43.bounds.midX;
    const wz = jPt.y - scene43.bounds.midY;
    rebuiltPlanes.forEach((pl) => {
      const meshes = scene43.planeMeshById.get(pl.id) || [];
      meshes.forEach((mesh) => {
        const pos = mesh.geometry.getAttribute('position');
        if (!pos) return;
        let maxYAtPt = -Infinity;
        for (let vi = 0; vi < pos.count; vi++) {
          const vx = pos.getX(vi);
          const vy = pos.getY(vi);
          const vz = pos.getZ(vi);
          if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(vz)) {
            throw new Error(`Non-finite 3D vertex found in mesh for plane ${pl.id}`);
          }
          if (Math.hypot(vx - wx, vz - wz) <= 0.08 && vy > maxYAtPt) {
            maxYAtPt = vy;
          }
        }
        if (maxYAtPt > 0) heightsAtJunction.push(maxYAtPt);
      });
    });
    if (heightsAtJunction.length >= 2) {
      const spread = Math.max(...heightsAtJunction) - Math.min(...heightsAtJunction);
      if (spread > 0.005) {
        throw new Error(`3D mesh seam gap at (${jPt.x},${jPt.y}): vertical spread ${spread.toFixed(4)}m`);
      }
    }
  });

  // Verify walls meet raked roof underside without piercing above ridge
  const walls43 = deriveRoofWallSegments(built43.levels, rebuiltPlanes);
  const gableEastWall = walls43.find((w) => w.edgeId === fixOut.edges[1].id);
  if (!gableEastWall || gableEastWall.wallKind !== 'gable_end' || Math.max(...gableEastWall.topProfilePoints3D.map((p) => p.z)) < vTriApex.z - 0.05) {
    throw new Error('East gable wall must rake cleanly up to triangular apex');
  }
  scene43.dispose();

  // 6) Verify long eave edge subdivided mid-span by interior valley/hip line splits cleanly into 2 non-overlapping faces
  const splitRectPts = [
    { x: 0, y: 0 },
    { x: 14, y: 0 },
    { x: 14, y: 8 },
    { x: 0, y: 8 }
  ];
  const splitOut = buildOutlineFromPoints(splitRectPts, 'split-eave-rect', { initialEdgeType: 'outline' });
  const splitSkel: SkeletonLine[] = [
    { id: 'r-main', from: { x: 4, y: 4 }, to: { x: 10, y: 4 }, suggestedType: 'ridge' },
    { id: 'v-t', from: { x: 7, y: 0 }, to: { x: 7, y: 4 }, suggestedType: 'valley' },
    { id: 'h-sw', from: { x: 0, y: 0 }, to: { x: 4, y: 4 }, suggestedType: 'hip' },
    { id: 'h-nw', from: { x: 0, y: 8 }, to: { x: 4, y: 4 }, suggestedType: 'hip' },
    { id: 'h-se', from: { x: 14, y: 0 }, to: { x: 10, y: 4 }, suggestedType: 'hip' },
    { id: 'h-ne', from: { x: 14, y: 8 }, to: { x: 10, y: 4 }, suggestedType: 'hip' }
  ];
  const splitPlanes = syncMultiLevelPlanes(
    [{ id: 'level-1', code: 'L1', name: 'Split Eave', eaveHeightM: 2.7, outline: splitOut, skeleton: splitSkel }],
    [],
    22.5
  );
  if (splitPlanes.length !== 5) {
    throw new Error(`Expected 5 planes when south eave is split by interior valley junction (7,0), got ${splitPlanes.length}`);
  }
}
console.log('✓ Test 43 Passed: Classified gable + T-bay + triangular end plan merges ridges, decomposes closed loops without synthetic wedges, and produces sealed watertight 3D seams.');

console.log('ALL EXACT ROOFING ENGINE TESTS PASSED DETERMINISTICALLY! ✓');
