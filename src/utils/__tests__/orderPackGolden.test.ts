import assert from 'node:assert/strict';
import {
  applyRoofStylePreset,
  buildAttachedOutlineFromEdge,
  buildOutlineFromPoints,
  createPlaneFromEdge,
  createRoofLevel,
  generateCuttingLayout,
  generateSkeletonLines,
  getAssignableRoofLinesMultiLevel,
  getMultiLevelPreset,
  getPresetOutline,
  syncMultiLevelPlanes
} from '../exactRoofingEngine';
import {
  buildOrderPack,
  buildRoofBillOfMaterials,
  exportOrderPackToCsv,
  exportOrderPackToJson
} from '../exactRoofingBomBridge';
import {
  extractAssignmentFlashingSpecs,
  groupFlashingScheduleLines,
  resolveFlashingProductCode
} from '../exactRoofingFlashingBridge';
import { computeBendAngleAnnotations } from '../flashingDrawingEngine';
import {
  DEFAULT_ARCHITECTURAL_PROFILES,
  summarizeFlashingProfileBends
} from '../sheetMetalGeometry';
import { evaluateTakeoffCompleteness } from '../takeoffCompleteness';
import { buildWallFacetsFromPlan } from '../wallCladdingEngine';
import type {
  AssignableRoofLine,
  LayoutResult,
  PlanEdge,
  RoofAsset,
  RoofBomSummary,
  RoofFlashingAssignment,
  RoofLevel,
  RoofPlane,
  SheetSpec,
  WallPlan
} from '../../types/exactRoofing';

console.log('--- Starting Order Pack & Flashing Golden Accuracy Suite ---');

const DEFAULT_SHEET_SPEC: SheetSpec = {
  coverWidth: 0.762,
  maxLength: 6.0,
  endLap: 0.15,
  overhang: 0.05
};

function assertStrictSheetReconciliation(
  caseLabel: string,
  layout: LayoutResult,
  bom: RoofBomSummary,
  orderPack: ReturnType<typeof buildOrderPack>
) {
  const bomSumLm = bom.sheetGroups.reduce((sum, g) => sum + g.count * g.lengthM, 0);
  const bomSumMm = bom.sheetGroups.reduce((sum, g) => sum + g.count * g.lengthMm, 0);
  assert.ok(
    Math.abs(bom.totalOrderedLm - bomSumLm) < 0.002,
    `[${caseLabel}] BOM totalOrderedLm (${bom.totalOrderedLm}) must match sum(qty * lengthM) (${bomSumLm})`
  );
  assert.equal(
    Math.round(bom.totalOrderedLm * 1000),
    bomSumMm,
    `[${caseLabel}] BOM totalOrderedLm must equal exact mm sum`
  );

  const packSumLm = orderPack.sheets.reduce((sum, line) => sum + line.qty * (line.length_mm / 1000), 0);
  assert.ok(
    Math.abs(orderPack.totals.totalOrderedLm - packSumLm) < 0.002,
    `[${caseLabel}] OrderPack totalOrderedLm (${orderPack.totals.totalOrderedLm}) must match sum(qty * length_mm/1000) (${packSumLm})`
  );
  assert.equal(
    orderPack.totals.totalSheets,
    layout.parents.length,
    `[${caseLabel}] Total ordered sheet count must match parent sheet count`
  );
  assert.equal(orderPack.commercialNeutral, true);
}

function assertZeroDollarLeakage(caseLabel: string, orderPack: ReturnType<typeof buildOrderPack>) {
  const csv = exportOrderPackToCsv(orderPack);
  const json = exportOrderPackToJson(orderPack);
  const forbiddenTokens = ['$', 'subtotalNZD', 'gstNZD', 'totalNZD', 'unitSellNZD', 'unitCostNZD', 'markupPercent'];
  forbiddenTokens.forEach((tok) => {
    assert.ok(!csv.includes(tok), `[${caseLabel}] OrderPack CSV must NEVER include "${tok}"`);
    assert.ok(!json.includes(tok), `[${caseLabel}] OrderPack JSON must NEVER include "${tok}"`);
  });
}

function buildAutoAssignmentsForLines(lines: AssignableRoofLine[]): RoofFlashingAssignment[] {
  const ridgeProf = DEFAULT_ARCHITECTURAL_PROFILES.find((p) => p.id === 'preset-ventilated-ridge')!;
  const bargeProf = DEFAULT_ARCHITECTURAL_PROFILES.find((p) => p.id === 'preset-barge-roll')!;
  const valleyProf = DEFAULT_ARCHITECTURAL_PROFILES.find((p) => p.id === 'preset-valley-gutter')!;
  const apronProf = DEFAULT_ARCHITECTURAL_PROFILES.find((p) => p.id === 'preset-apron-kick')!;

  return lines
    .filter((l) => l.flashingKind !== 'eave')
    .map((line) => {
      const prof =
        line.flashingKind === 'valley' || line.flashingKind === 'dormer_valley'
          ? valleyProf
          : line.flashingKind === 'barge' || line.flashingKind === 'dormer_barge'
          ? bargeProf
          : line.flashingKind === 'apron' || line.flashingKind === 'dormer_apron'
          ? apronProf
          : ridgeProf;
      const specs = extractAssignmentFlashingSpecs(prof, line.flashingKind);
      const stickLenM = 3.0;
      const qty = Math.max(1, Math.ceil(line.trueSlopeLengthM / (stickLenM - 0.15)));
      return {
        id: `assign-${line.lineId}`,
        lineId: line.lineId,
        lineLabel: line.label,
        flashingKind: line.flashingKind,
        trueSlopeLengthM: line.trueSlopeLengthM,
        profileId: prof.id,
        profileName: prof.name,
        productCode: specs.productCode,
        girthTier: specs.girthTier,
        developedBlankWidthMm: specs.developedBlankWidthMm,
        bendCount: specs.bendCount,
        keyAnglesDeg: specs.keyAnglesDeg,
        hasHemCrush: specs.hasHemCrush,
        planLengthM: line.planLengthM,
        quantity: qty,
        pieceLengthMm: 3000,
        pieceLengthLm: stickLenM,
        totalLinearMetres: +(qty * stickLenM).toFixed(3),
        colorName: 'FlaxPod',
        assignedAt: '2026-11-20T09:00:00Z'
      };
    });
}

// =========================================================================
// PILLAR 1: GOLDEN ACCURACY SUITE — 7 SHEET / ROOF TOPOLOGY CASES
// =========================================================================

// Case 1: Rectangular Hip Roof (14m × 10m @ 22.5°)
const rectPreset = getMultiLevelPreset('rectangle_14x10', 22.5);
const rectLayout = generateCuttingLayout(rectPreset.planes, DEFAULT_SHEET_SPEC);
const rectLines = getAssignableRoofLinesMultiLevel(rectPreset.levels, rectPreset.planes);
const rectAssigns = buildAutoAssignmentsForLines(rectLines);
const rectBom = buildRoofBillOfMaterials({
  planes: rectPreset.planes,
  layout: rectLayout,
  assignments: rectAssigns,
  assignableLines: rectLines
});
const rectPack = buildOrderPack({
  planes: rectPreset.planes,
  levels: rectPreset.levels,
  layout: rectLayout,
  bom: rectBom,
  assignableLines: rectLines,
  assignments: rectAssigns,
  libraryProfiles: DEFAULT_ARCHITECTURAL_PROFILES,
  locked: true,
  confirmedAt: '2026-11-20T09:00:00Z',
  confirmedBy: 'Site Lead'
});
assert.ok(rectPack.sheets.length > 0 && rectPack.totals.totalSheets > 20);
assertStrictSheetReconciliation('Case 1: 14x10 Hip', rectLayout, rectBom, rectPack);
assertZeroDollarLeakage('Case 1: 14x10 Hip', rectPack);
console.log('✓ Golden Case 1 Passed: Rectangle 14x10 Hip strict mm reconciliation.');

// Case 2: Simple Gable (straight_gable @ 22.5° with gable style applied)
const gableApplied = applyRoofStylePreset(getPresetOutline('straight_gable'), 'gable');
const gableLvl = createRoofLevel(1, 'Gable Main', 2.7, gableApplied.outline.points);
gableLvl.outline = { ...gableApplied.outline, levelId: gableLvl.id };
gableLvl.skeleton = gableApplied.skeleton.map((s) => ({ ...s, levelId: gableLvl.id }));
const gablePreset = {
  levels: [gableLvl],
  planes: syncMultiLevelPlanes([gableLvl], [], 22.5)
};
const gableLayout = generateCuttingLayout(gablePreset.planes, DEFAULT_SHEET_SPEC);
const gableLines = getAssignableRoofLinesMultiLevel(gablePreset.levels, gablePreset.planes);
const gableAssigns = buildAutoAssignmentsForLines(gableLines);
const gableBom = buildRoofBillOfMaterials({
  planes: gablePreset.planes,
  layout: gableLayout,
  assignments: gableAssigns,
  assignableLines: gableLines
});
const gablePack = buildOrderPack({
  planes: gablePreset.planes,
  levels: gablePreset.levels,
  layout: gableLayout,
  bom: gableBom,
  assignableLines: gableLines,
  assignments: gableAssigns,
  libraryProfiles: DEFAULT_ARCHITECTURAL_PROFILES
});
assert.ok(gableLines.some((l) => l.flashingKind === 'barge'), 'Gable must enumerate barge lines');
assertStrictSheetReconciliation('Case 2: Straight Gable', gableLayout, gableBom, gablePack);
assertZeroDollarLeakage('Case 2: Straight Gable', gablePack);
console.log('✓ Golden Case 2 Passed: Straight Gable sheets & barge flashings.');

// Case 3: Multi-Wing / Re-entrant U-Notch Courtyard + Wall Plan
const uOutline = buildOutlineFromPoints([
  { x: 0, y: 0 },
  { x: 16, y: 0 },
  { x: 16, y: 12 },
  { x: 11, y: 12 },
  { x: 11, y: 6 },
  { x: 5, y: 6 },
  { x: 5, y: 12 },
  { x: 0, y: 12 }
]);
const uSkel = generateSkeletonLines(uOutline);
const uLvl = createRoofLevel(1, 'U-Shape Main', 2.7, uOutline.points);
uLvl.outline = uOutline;
uLvl.skeleton = uSkel;
const uPlanes = uOutline.edges.map((edge, idx) =>
  createPlaneFromEdge(uOutline, uSkel, edge, {
    pitchDeg: 22.5,
    levelId: uLvl.id,
    underlapSide: idx % 2 === 0 ? 'left' : 'right'
  })
);
const uLayout = generateCuttingLayout(uPlanes, DEFAULT_SHEET_SPEC);
const uLines = getAssignableRoofLinesMultiLevel([uLvl], uPlanes);
const uAssigns = buildAutoAssignmentsForLines(uLines);
const uBom = buildRoofBillOfMaterials({
  planes: uPlanes,
  layout: uLayout,
  assignments: uAssigns,
  assignableLines: uLines
});
const uWallFacets = buildWallFacetsFromPlan(uOutline, { defaultHeightM: 2.7 }).map((f) => ({
  ...f,
  claddingType: 'weatherboard' as const
}));
const uWallPlan: WallPlan = {
  points: uOutline.points,
  edges: uOutline.edges.map((e, i) => ({ id: `we-${i + 1}`, from: e.from, to: e.to })),
  defaultHeightM: 2.7,
  facets: uWallFacets
};
const uPack = buildOrderPack({
  planes: uPlanes,
  levels: [uLvl],
  layout: uLayout,
  bom: uBom,
  assignableLines: uLines,
  assignments: uAssigns,
  libraryProfiles: DEFAULT_ARCHITECTURAL_PROFILES,
  wallPlan: uWallPlan
});
assert.ok(uPack.walls && uPack.walls.returnFacesCount >= 2, 'U-notch wall returns must flow into OrderPack');
assert.ok(uPack.walls && uPack.walls.totalNetAreaM2 > 0);
assertStrictSheetReconciliation('Case 3: U-Notch Courtyard', uLayout, uBom, uPack);
assertZeroDollarLeakage('Case 3: U-Notch Courtyard', uPack);
console.log('✓ Golden Case 3 Passed: Multi-wing U-notch courtyard + wall cladding summary.');

// Case 4: Shorter Mid-Wall Abutment Lean-To ([3..9] against [0..12] host wall)
const hostEdge: PlanEdge = {
  id: 'host-wall-south',
  from: { x: 0, y: 6 },
  to: { x: 12, y: 6 },
  type: 'wall',
  hasWall: true,
  eaveHeightM: 2.7,
  eaveSetbackM: 0.45
};
const shortAbutOutline = buildAttachedOutlineFromEdge(
  hostEdge,
  [
    { x: 3, y: 6 },
    { x: 9, y: 6 },
    { x: 9, y: 9.5 },
    { x: 3, y: 9.5 }
  ],
  'abut-short'
);
shortAbutOutline.edges[2] = { ...shortAbutOutline.edges[2], type: 'outline' };
const shortAbutSkel = generateSkeletonLines(shortAbutOutline);
const shortAbutLvl = createRoofLevel(2, 'Short Verandah', 2.5, shortAbutOutline.points);
shortAbutLvl.outline = shortAbutOutline;
shortAbutLvl.skeleton = shortAbutSkel;
const shortAbutPlane = createPlaneFromEdge(
  shortAbutOutline,
  shortAbutSkel,
  shortAbutOutline.edges[2],
  { pitchDeg: 10, levelId: shortAbutLvl.id }
);
const shortAbutLayout = generateCuttingLayout([shortAbutPlane], DEFAULT_SHEET_SPEC);
const shortAbutLines = getAssignableRoofLinesMultiLevel([shortAbutLvl], [shortAbutPlane]);
const shortAbutAssigns = buildAutoAssignmentsForLines(shortAbutLines);
const shortAbutBom = buildRoofBillOfMaterials({
  planes: [shortAbutPlane],
  layout: shortAbutLayout,
  assignments: shortAbutAssigns,
  assignableLines: shortAbutLines
});
const shortAbutPack = buildOrderPack({
  planes: [shortAbutPlane],
  levels: [shortAbutLvl],
  layout: shortAbutLayout,
  bom: shortAbutBom,
  assignableLines: shortAbutLines,
  assignments: shortAbutAssigns
});
assert.ok(shortAbutLines.some((l) => l.flashingKind === 'apron'), 'Shorter abutment must carry apron flashing');
assertStrictSheetReconciliation('Case 4: Shorter Abutment', shortAbutLayout, shortAbutBom, shortAbutPack);
assertZeroDollarLeakage('Case 4: Shorter Abutment', shortAbutPack);
console.log('✓ Golden Case 4 Passed: Shorter mid-wall abutment apron + sheets.');

// Case 5: Longer Abutment Extending Past Host Endpoints ([-2..15] vs [0..12])
const longAbutOutline = buildAttachedOutlineFromEdge(
  hostEdge,
  [
    { x: -2, y: 6 },
    { x: 15, y: 6 },
    { x: 15, y: 10.2 },
    { x: -2, y: 10.2 }
  ],
  'abut-long'
);
longAbutOutline.edges[2] = { ...longAbutOutline.edges[2], type: 'outline' };
const longAbutSkel = generateSkeletonLines(longAbutOutline);
const longAbutLvl = createRoofLevel(2, 'Extended Lean-To', 2.5, longAbutOutline.points);
longAbutLvl.outline = longAbutOutline;
longAbutLvl.skeleton = longAbutSkel;
const longAbutPlane = createPlaneFromEdge(
  longAbutOutline,
  longAbutSkel,
  longAbutOutline.edges[2],
  { pitchDeg: 12, levelId: longAbutLvl.id }
);
const longAbutLayout = generateCuttingLayout([longAbutPlane], DEFAULT_SHEET_SPEC);
const longAbutLines = getAssignableRoofLinesMultiLevel([longAbutLvl], [longAbutPlane]);
const longAbutAssigns = buildAutoAssignmentsForLines(longAbutLines);
const longAbutBom = buildRoofBillOfMaterials({
  planes: [longAbutPlane],
  layout: longAbutLayout,
  assignments: longAbutAssigns,
  assignableLines: longAbutLines
});
const longAbutPack = buildOrderPack({
  planes: [longAbutPlane],
  levels: [longAbutLvl],
  layout: longAbutLayout,
  bom: longAbutBom,
  assignableLines: longAbutLines,
  assignments: longAbutAssigns
});
assertStrictSheetReconciliation('Case 5: Longer Abutment', longAbutLayout, longAbutBom, longAbutPack);
assertZeroDollarLeakage('Case 5: Longer Abutment', longAbutPack);
console.log('✓ Golden Case 5 Passed: Longer extended abutment sheets reconcile cleanly.');

// Case 6: Dormer Roof + Penetration Metrics on Sloped Plane
const dormerAsset: RoofAsset = {
  id: 'asset-gable-dormer-1',
  type: 'gable_dormer',
  planeId: rectPreset.planes[0].id,
  center: { x: 7.0, y: 2.5 },
  widthM: 2.4,
  depthM: 2.0,
  dormerPitchDeg: 25,
  label: 'Front Gable Dormer'
};
const skylightAsset: RoofAsset = {
  id: 'asset-sky-1',
  type: 'skylight',
  planeId: rectPreset.planes[2].id,
  center: { x: 7.0, y: 7.5 },
  widthM: 1.2,
  depthM: 1.4,
  label: 'Velux S1'
};
const dormerAssets = [dormerAsset, skylightAsset];
const dormerLayout = generateCuttingLayout(rectPreset.planes, DEFAULT_SHEET_SPEC, {
  assets: dormerAssets
});
const dormerLines = getAssignableRoofLinesMultiLevel(rectPreset.levels, rectPreset.planes, dormerAssets);
const dormerAssigns = buildAutoAssignmentsForLines(dormerLines);
const dormerBom = buildRoofBillOfMaterials({
  planes: rectPreset.planes,
  layout: dormerLayout,
  assignments: dormerAssigns,
  assignableLines: dormerLines,
  assets: dormerAssets
});
const dormerPack = buildOrderPack({
  planes: rectPreset.planes,
  levels: rectPreset.levels,
  layout: dormerLayout,
  bom: dormerBom,
  assignableLines: dormerLines,
  assignments: dormerAssigns,
  assets: dormerAssets
});
assert.equal(dormerPack.penetrations.length, 2);
assert.ok(dormerLines.some((l) => l.flashingKind.startsWith('dormer_')), 'Dormer lines must appear in assignable flashings');
assert.ok(dormerPack.penetrations.every((p) => p.eave_dist_m >= 0 && p.apex_dist_m >= 0));
assertStrictSheetReconciliation('Case 6: Dormer + Skylight', dormerLayout, dormerBom, dormerPack);
assertZeroDollarLeakage('Case 6: Dormer + Skylight', dormerPack);
console.log('✓ Golden Case 6 Passed: Gable dormer + skylight penetrations & flashing schedules.');

// Case 7: Site-Measured Sheet Length Override (modeled 5450mm -> site 5435mm)
const overridePlanes: RoofPlane[] = gablePreset.planes.map((p, idx) =>
  idx === 0
    ? {
        ...p,
        slopeLength: 5.45,
        orderedSheetLengthM: 5.435
      }
    : {
        ...p,
        slopeLength: 5.45
      }
);
const overridePlane0BeforePoly = JSON.stringify(overridePlanes[0].planPolygon);
const overrideLayout = generateCuttingLayout(overridePlanes, DEFAULT_SHEET_SPEC);
assert.equal(JSON.stringify(overridePlanes[0].planPolygon), overridePlane0BeforePoly, 'Override must NOT alter roof geometry');
const overrideBom = buildRoofBillOfMaterials({
  planes: overridePlanes,
  layout: overrideLayout,
  assignments: gableAssigns,
  assignableLines: gableLines
});
const overridePack = buildOrderPack({
  planes: overridePlanes,
  levels: gablePreset.levels,
  layout: overrideLayout,
  bom: overrideBom,
  assignableLines: gableLines,
  assignments: gableAssigns
});
const overriddenGroup = overrideBom.sheetGroups.find((g) => g.lengthMm === 5435);
assert.ok(overriddenGroup, 'Expected 5435mm sheet group in BOM');
assert.equal(overriddenGroup.hasSiteOverride, true);
assert.equal(overriddenGroup.modeledLengthMm, 5450);

const overriddenPackLine = overridePack.sheets.find((s) => s.length_mm === 5435);
assert.ok(overriddenPackLine, 'Expected 5435mm line in OrderPack sheets');
assert.equal(overriddenPackLine.is_override, true);
assert.equal(overriddenPackLine.modeled_length_mm, 5450);
assertStrictSheetReconciliation('Case 7: Site Override 5450->5435mm', overrideLayout, overrideBom, overridePack);
assertZeroDollarLeakage('Case 7: Site Override 5450->5435mm', overridePack);
console.log('✓ Golden Case 7 Passed: Site override 5450mm -> 5435mm preserves geometry & flags override cleanly.');

// =========================================================================
// PILLAR 2: ORDERABLE FLASHINGS — CRUSH FOLDS, HEM DEDUCTIONS, SKU GROUPING
// =========================================================================

const crushPts = [
  { x: 0, y: 0 },
  { x: 15, y: 0 },
  { x: -20, y: 0.5 }, // near-0° / 180° reverse fold with opposing bisector
  { x: -20, y: 120 }
];
const crushSegs = [
  { id: 's1', lengthMm: 15, angleDeg: 0, kind: 'crush_fold' as const },
  { id: 's2', lengthMm: 35, angleDeg: 90, kind: 'leg' as const },
  { id: 's3', lengthMm: 120, angleDeg: 90, kind: 'leg' as const }
];
const crushAnnotations = computeBendAngleAnnotations(crushPts, crushSegs, 0.5);
assert.equal(crushAnnotations.length, 2);
assert.ok(
  crushAnnotations[0].arcPath.startsWith('M ') &&
    !crushAnnotations[0].arcPath.includes('NaN') &&
    !crushAnnotations[0].arcPath.includes('Infinity'),
  'Crush fold arc path must render cleanly without NaN/Infinity'
);
assert.ok(
  Number.isFinite(crushAnnotations[0].labelPos.x) && Number.isFinite(crushAnnotations[0].labelPos.y),
  'Crush fold labelPos must be finite even on 180° opposing rays'
);

const valleyProfile = DEFAULT_ARCHITECTURAL_PROFILES.find((p) => p.id === 'preset-valley-gutter')!;
const valleySummary = summarizeFlashingProfileBends(valleyProfile.segments, valleyProfile.thicknessMm || 0.75);
assert.equal(valleySummary.hasHemCrush, true, 'Valley gutter preset must flag hasHemCrush=true');
assert.ok(valleySummary.bendCount >= 4);

const uncodedCode = resolveFlashingProductCode({
  profileId: 'custom-profile-99',
  flashingKind: 'apron'
});
assert.equal(uncodedCode, 'UNCODED-APRON');

const groupedSchedule = groupFlashingScheduleLines(
  [
    ...rectAssigns.slice(0, 2).map((a) => ({ ...a, pieceLengthMm: 3000, pieceLengthLm: 3.0 })),
    {
      ...rectAssigns[0],
      id: 'dup-custom',
      profileId: 'custom-user-1',
      profileName: 'Site Custom Ridge',
      productCode: undefined,
      pieceLengthMm: 3000,
      pieceLengthLm: 3.0
    }
  ],
  DEFAULT_ARCHITECTURAL_PROFILES
);
assert.ok(groupedSchedule.some((g) => g.productCode.startsWith('FL-')));
assert.ok(groupedSchedule.some((g) => g.productCode.startsWith('UNCODED-')));
console.log('✓ Pillar 2 Passed: Crush-fold SVG arcs, hem deduction summary, productCode fallback & stick grouping.');

// =========================================================================
// PILLAR 3: HARD COMPLETENESS GATE — BLOCKERS VS WARNINGS
// =========================================================================

// 3a. Undetailed return wall blocks lock
const blockingWallReport = evaluateTakeoffCompleteness({
  levels: [uLvl],
  planes: uPlanes,
  assignableLines: uLines,
  flashingAssignments: uAssigns,
  wallPlan: {
    ...uWallPlan,
    facets: uWallPlan.facets.map((f, idx) =>
      idx === 4 ? { ...f, claddingType: 'none', regions: undefined } : f
    )
  },
  assets: []
});
assert.equal(blockingWallReport.canLockMeasure, false, 'Undetailed return wall must block measure lock');
assert.ok(blockingWallReport.blockersCount >= 1);

// 3b. Unassigned structural flashing blocks lock; optional eave-only warns & allows lock
const eaveOnlyLines: AssignableRoofLine[] = [
  ...gableLines,
  {
    lineId: 'opt-eave-1',
    sourceType: 'outline_edge',
    label: 'South Eave Drip',
    flashingKind: 'eave',
    suggestedCategory: 'Apron & Abutment',
    from: { x: 0, y: 0 },
    to: { x: 10, y: 0 },
    midPoint: { x: 5, y: 0 },
    levelId: 'level-1',
    planLengthM: 10.0,
    trueSlopeLengthM: 10.0,
    lapAllowanceM: 0.45,
    totalOrderLengthM: 10.45,
    recommendedQuantity: 4,
    recommendedPieceLengthM: 3.0,
    associatedPlaneIds: [gablePreset.planes[0].id],
    pitchesDeg: [22.5]
  }
];
const eaveWarnReport = evaluateTakeoffCompleteness({
  levels: gablePreset.levels,
  planes: gablePreset.planes,
  assignableLines: eaveOnlyLines,
  flashingAssignments: gableAssigns,
  wallPlan: null,
  assets: []
});
assert.equal(eaveWarnReport.canLockMeasure, true, 'Optional unassigned eave drip should warn without blocking lock');
assert.equal(eaveWarnReport.blockersCount, 0);
assert.equal(
  eaveWarnReport.optionalUnassignedEavesCount,
  gableLines.filter((l) => l.flashingKind === 'eave').length + 1
);
assert.ok(eaveWarnReport.warningsCount >= 3);

const missingStructuralReport = evaluateTakeoffCompleteness({
  levels: gablePreset.levels,
  planes: gablePreset.planes,
  assignableLines: eaveOnlyLines,
  flashingAssignments: gableAssigns.slice(1), // drop one structural ridge/barge assignment
  wallPlan: null,
  assets: []
});
assert.equal(missingStructuralReport.canLockMeasure, false, 'Missing ridge/barge assignment must block lock');
assert.ok(missingStructuralReport.blockersCount >= 1);
console.log('✓ Pillar 3 Passed: Completeness gate cleanly separates Blockers vs Warnings.');

// =========================================================================
// PILLAR 4: CSV/JSON ORDER PACK CONTENT & COMMERCIAL NEUTRALITY
// =========================================================================

const uCsv = exportOrderPackToCsv(uPack);
assert.ok(uCsv.includes('code,description,qty,unit,length_mm'));
assert.ok(uCsv.includes('SHEETS,'));
assert.ok(uCsv.includes('FLASHINGS,'));
assert.ok(uCsv.includes('WALL_CLADDING,'));
assert.ok(uCsv.includes('RECONCILIATION_TOTALS,'));

const parsedJson = JSON.parse(exportOrderPackToJson(dormerPack));
assert.equal(parsedJson.commercialNeutral, true);
assert.equal(parsedJson.penetrations.length, 2);
console.log('✓ Pillar 4 Passed: OrderPack CSV & JSON include structured takeoff & zero dollar figures.');

console.log('ALL ORDER PACK GOLDEN ACCURACY TESTS PASSED DETERMINISTICALLY! ✓');
