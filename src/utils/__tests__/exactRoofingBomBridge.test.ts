import assert from 'node:assert/strict';
import {
  buildRoofBillOfMaterials,
  computeRoofingPacks,
  buildQuoteSpreadsheetFromRoofBom,
  convertExactLayoutToRoofFacets,
  exportRoofBomToCsv
} from '../exactRoofingBomBridge';
import {
  createPlaneFromEdge,
  generateCuttingLayout,
  generateSkeletonLines,
  getPresetOutline
} from '../exactRoofingEngine';
import { RoofFlashingAssignment, SheetSpec } from '../../types/exactRoofing';

const outline = getPresetOutline('rectangle_14x10');
const skeleton = generateSkeletonLines(outline);
const planes = outline.edges.map((edge, idx) =>
  createPlaneFromEdge(outline, skeleton, edge, {
    pitchDeg: 22.5,
    underlapSide: idx % 2 === 0 ? 'left' : 'right',
    name: idx % 2 === 0 ? `Main Slope ${idx + 1}` : `Hip End ${idx + 1}`
  })
);

const sheetSpec: SheetSpec = {
  coverWidth: 0.762,
  maxLength: 6.34,
  endLap: 0.15,
  overhang: 0.05
};

const layout = generateCuttingLayout(planes, sheetSpec, { startPlaneId: planes[0].id });

const assignments: RoofFlashingAssignment[] = [
  {
    id: 'assign-1',
    lineId: 'skel-ridge-0',
    lineLabel: 'Main Ridge (4.0m)',
    flashingKind: 'ridge',
    profileId: 'prof-ridge-1',
    profileName: '22.5° Architectural Ridge Cap',
    developedBlankWidthMm: 350,
    girthTier: '301-450mm',
    planLengthM: 4.0,
    trueSlopeLengthM: 4.0,
    pieceLengthLm: 4.3,
    quantity: 1,
    totalLinearMetres: 4.3,
    assignedAt: '2026-11-16T00:00:00.000Z'
  }
];

// 1. BOM Calculation Test
const bom = buildRoofBillOfMaterials({
  planes,
  layout,
  assignments,
  assignableLines: []
});

assert.ok(bom.totalSheetsCount === layout.parents.length, 'BOM sheet count must equal total ParentSheets');
assert.ok(bom.totalOrderedLm > 0, 'BOM ordered lineal metres must be positive');
assert.ok(bom.estimatedScrewBoxes >= 1, 'BOM must calculate screw boxes');
assert.ok(bom.estimatedUnderlayRolls >= 1, 'BOM must calculate underlay rolls');
assert.equal(bom.totalFlashingSticks, 1, 'BOM should sum flashing sticks');
assert.equal(bom.totalFlashingLm, 4.3, 'BOM should sum flashing linear metres');

// 2. Roofing Packs & Custom Lay Sequence Invariance Test
const defaultPacks = computeRoofingPacks({ layout, planes });
assert.equal(defaultPacks.length, planes.length, 'One pack per roof face');

// Reverse face sequence in Installing stage
const reversedOrder = [...planes].reverse().map((p) => p.id);
const customPacks = computeRoofingPacks({
  layout,
  planes,
  customSequencePlaneIds: reversedOrder
});

assert.equal(customPacks.length, planes.length, 'Custom order preserves all packs');
assert.equal(customPacks[0].planeId, reversedOrder[0], 'First pack matches crew custom sequence');
assert.equal(customPacks[0].sequenceNumber, 1, 'First pack numbered #1');

// Verify total sheets & offcut transfers remain strictly invariant under custom numbering!
const sumFresh = (packs: typeof defaultPacks) =>
  packs.reduce((s, p) => s + p.freshSheetCount, 0);
const sumOffcuts = (packs: typeof defaultPacks) =>
  packs.reduce((s, p) => s + p.offcutsReceived.reduce((a, b) => a + b.count, 0), 0);

assert.equal(
  sumFresh(customPacks),
  sumFresh(defaultPacks),
  'Reordering install sequence must NEVER alter fresh stock sheet count'
);
assert.equal(
  sumOffcuts(customPacks),
  sumOffcuts(defaultPacks),
  'Reordering install sequence must NEVER alter harvested offcut count'
);

// 3. Quote Spreadsheet Pricing Math Test
const quoteBuilt = buildQuoteSpreadsheetFromRoofBom({
  bom,
  markupPercent: 20,
  includeHardware: true,
  includeUnderlay: true,
  includeLabourEstimate: true
});

assert.equal(quoteBuilt.sections.length, 4, 'Quote should generate 4 structured sections');
assert.ok(quoteBuilt.subtotalNZD > quoteBuilt.costTotalNZD, 'Sell subtotal must exceed cost with 20% markup');
assert.ok(
  Math.abs(quoteBuilt.gstNZD - +(quoteBuilt.subtotalNZD * 0.15).toFixed(2)) <= 0.02,
  'GST must match 15% NZ GST'
);

// 4. RoofFacet conversion & CSV output test
const facets = convertExactLayoutToRoofFacets({ planes, layout });
assert.equal(facets.length, planes.length, 'Converted RoofFacets should match planes count');
const csv = exportRoofBomToCsv({ bom, packs: customPacks, projectName: 'Unit Test Project' });
assert.ok(csv.includes('SECTION 1: MILL STOCK SHEET SCHEDULE'), 'CSV includes section 1');
assert.ok(csv.includes('SECTION 3: ONSITE ROOFING PACK SEQUENCE'), 'CSV includes section 3');

// 5. Site-Measured Ordered Sheet Length Override (5450mm run -> 5435mm actual sheet, Geometry Unchanged)
import { buildOutlineFromPoints } from '../exactRoofingEngine';

const monoOutline = buildOutlineFromPoints([
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 5.45 },
  { x: 0, y: 5.45 }
]);
// Single front eave + verges/wall so run = exact 5.450m at 0 deg pitch (or flat 0 deg test -> cos 0 = 1)
monoOutline.edges = monoOutline.edges.map((e, i) => ({
  ...e,
  type: i === 0 ? 'outline' : i === 2 ? 'wall' : 'verge'
}));
const baseMonoPlane = createPlaneFromEdge(monoOutline, [], monoOutline.edges[0], {
  pitchDeg: 0,
  underlapSide: 'left',
  name: 'North Slope'
});
assert.equal(Math.round((baseMonoPlane.slopeLength || 0) * 1000), 5450, 'Modeled slope run should be 5450mm');

// Override ordered sheet length to 5435mm (5.435m)
const overriddenPlanes = [
  {
    ...baseMonoPlane,
    orderedSheetLengthM: 5.435
  }
];
// Geometry must stay 100% untouched
assert.equal(overriddenPlanes[0].slopeLength, baseMonoPlane.slopeLength, 'Geometry slopeLength must remain unchanged');
assert.deepEqual(overriddenPlanes[0].planPolygon, baseMonoPlane.planPolygon, 'Geometry planPolygon must remain unchanged');

const overrideLayout = generateCuttingLayout(overriddenPlanes, sheetSpec);
assert.ok(
  overrideLayout.parents.every((par) => Math.round(par.length * 1000) === 5435),
  `Every full ordered sheet must be exact 5435mm, got ${overrideLayout.parents.map((p) => Math.round(p.length * 1000)).join(',')}`
);

const overrideBom = buildRoofBillOfMaterials({
  planes: overriddenPlanes,
  layout: overrideLayout,
  assignments: []
});
assert.equal(overrideBom.sheetGroups.length, 1, 'BOM should consolidate into one exact 5435mm sheet group');
assert.equal(overrideBom.sheetGroups[0].lengthMm, 5435, 'BOM sheet group must preserve exact 5435mm (no 10mm rounding)');
assert.equal(overrideBom.sheetGroups[0].lengthM, 5.435, 'BOM sheet lengthM must be 5.435m');

const overridePacks = computeRoofingPacks({ layout: overrideLayout, planes: overriddenPlanes });
assert.ok(
  overridePacks[0].packLabel.includes('5435mm'),
  `Pack label must show exact 5435mm, got ${overridePacks[0].packLabel}`
);

// 6. Strict Sheet-Group <-> Ordered Lineal Metres Reconciliation (incl. ExactRoof 29.67x6.55 @ 15 deg benchmark)
import { generateSkeletonLines as genSkel } from '../exactRoofingEngine';

const benchOut = buildOutlineFromPoints([
  { x: 0, y: 0 },
  { x: 29.67, y: 0 },
  { x: 29.67, y: 6.55 },
  { x: 0, y: 6.55 }
]);
const benchSkel = genSkel(benchOut);
const benchPlanes = benchOut.edges.map((e, i) =>
  createPlaneFromEdge(benchOut, benchSkel, e, {
    pitchDeg: 15,
    underlapSide: i % 2 === 0 ? 'left' : 'right'
  })
);
const benchLayout = generateCuttingLayout(benchPlanes, sheetSpec, { startPlaneId: benchPlanes[0].id });
const benchBom = buildRoofBillOfMaterials({
  planes: benchPlanes,
  layout: benchLayout,
  assignments: []
});
const benchPacks = computeRoofingPacks({ layout: benchLayout, planes: benchPlanes });

const bomGroupSumLm = +benchBom.sheetGroups.reduce((s, g) => s + g.count * g.lengthM, 0).toFixed(2);
const bomGroupCountSum = benchBom.sheetGroups.reduce((s, g) => s + g.count, 0);
assert.equal(bomGroupCountSum, benchBom.totalSheetsCount, 'BOM group counts must sum to totalSheetsCount');
assert.equal(benchBom.totalSheetsCount, benchLayout.parents.length, 'BOM sheet count must equal layout.parents.length');
assert.ok(
  Math.abs(bomGroupSumLm - benchBom.totalOrderedLm) <= 0.02,
  `sum(group.count * group.lengthM) (${bomGroupSumLm}) must equal bom.totalOrderedLm (${benchBom.totalOrderedLm})`
);
assert.ok(
  Math.abs(benchBom.totalOrderedLm - benchLayout.totalOrderedMetres) <= 0.02,
  `bom.totalOrderedLm (${benchBom.totalOrderedLm}) must reconcile with layout.totalOrderedMetres (${benchLayout.totalOrderedMetres})`
);
assert.equal(
  benchBom.totalOffcutsReused,
  benchLayout.totalOffcutsReused,
  'BOM totalOffcutsReused must match layout.totalOffcutsReused'
);

const packsFreshCount = benchPacks.reduce((s, p) => s + p.freshSheetCount, 0);
const packsFreshLm = +benchPacks
  .reduce(
    (s, p) => s + p.freshLengthGroups.reduce((gs, g) => gs + g.count * g.lengthM, 0),
    0
  )
  .toFixed(2);
assert.equal(packsFreshCount, benchBom.totalSheetsCount, 'Packs fresh sheet count must match total ordered sheets');
assert.ok(
  Math.abs(packsFreshLm - benchBom.totalOrderedLm) <= 0.02,
  `Packs fresh ordered metres (${packsFreshLm}) must reconcile with bom.totalOrderedLm (${benchBom.totalOrderedLm})`
);

console.log('✓ exactRoofingBomBridge unit tests passed');

