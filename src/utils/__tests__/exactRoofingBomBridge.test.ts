import assert from 'node:assert/strict';
import {
  applyBomToQuoteObject,
  buildOrderPack,
  buildQuoteSections,
  buildRoofBillOfMaterials,
  computeRoofingPacks,
  buildQuoteSpreadsheetFromRoofBom,
  convertExactLayoutToRoofFacets,
  exportRoofBomToCsv
} from '../exactRoofingBomBridge';
import {
  appendMeasuredEnvelopeHistory,
  buildEnvelopeSnapshot,
  getLatestMeasuredEnvelope,
  getNextEnvelopeRevision
} from '../envelopeSnapshot';
import {
  addCourtyardHoleToOutline,
  buildOutlineFromPoints,
  computeTruthfulRoofAreaM2,
  createPlaneFromEdge,
  generateCuttingLayout,
  generateSkeletonLines,
  getPresetOutline
} from '../exactRoofingEngine';
import {
  ExactRoofModelSnapshot,
  RoofFlashingAssignment,
  SheetSpec
} from '../../types/exactRoofing';
import { Quote } from '../../types/crm';

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

// 7. Practical Mode Cut Details, Comparison Summary & CSV Verification
assert.equal(bom.sheetOrderMode, 'practical', 'BOM must default to practical sheetOrderMode');
assert.ok(bom.sheetOrderAssumption && bom.sheetOrderAssumption.length > 10, 'BOM must include sheet order assumption');
assert.ok(bom.sheetGroups.length === 1, `14x10 hip in Practical mode should consolidate to 1 sheet group, got ${bom.sheetGroups.length}`);
assert.ok((bom.sheetGroups[0].cutDetails?.length || 0) >= 2, 'Practical sheet group should record cutDetails breakdown for shorter runs');

const optLayout = generateCuttingLayout(planes, sheetSpec, {
  startPlaneId: planes[0].id,
  sheetOrderMode: 'optimized'
});
const bomWithComparison = buildRoofBillOfMaterials({
  planes,
  layout,
  assignments,
  assignableLines: [],
  sheetOrderMode: 'practical',
  comparisonSummary: {
    practicalOrderedLm: layout.totalOrderedMetres,
    practicalSheetsCount: layout.parents.length,
    practicalDistinctLengths: bom.sheetGroups.length,
    optimizedOrderedLm: optLayout.totalOrderedMetres,
    optimizedSheetsCount: optLayout.parents.length,
    optimizedDistinctLengths: new Set(optLayout.parents.map((p) => Math.round(p.length * 1000))).size
  }
});
assert.ok(bomWithComparison.comparisonSummary, 'Comparison summary should attach to BOM');
const pracCsv = exportRoofBomToCsv({ bom: bomWithComparison, packs: customPacks, projectName: 'Practical CSV Test' });
assert.ok(pracCsv.includes('Sheet Order Mode,"Practical (Site Cut List)"'), 'BOM CSV records Practical mode');
assert.ok(pracCsv.includes('Cut Breakdown'), 'BOM CSV includes Cut Breakdown column');
assert.ok(!pracCsv.includes('$'), 'BOM CSV must stay commercial-neutral (zero $)');

console.log('✓ exactRoofingBomBridge unit tests passed');

// 8. EnvelopeSnapshot gating, lifecycle revisions/history cap, distinct RIDGE codes & idempotent Quote push
{
  const modelSnap: ExactRoofModelSnapshot = {
    version: 2,
    stage: 'quoting',
    measureLocked: false,
    selectedPreset: 'rectangle_14x10',
    outline,
    skeleton,
    planes,
    levels: [
      {
        id: 'level-1',
        code: 'L1',
        name: 'Main Roof',
        eaveHeightM: 2.7,
        outline,
        skeleton
      }
    ],
    startPlaneId: planes[0].id,
    assets: [],
    pitchBreaks: [],
    flashingAssignments: assignments,
    windZoneCode: 'H',
    roofProfileFamily: 'corrugate',
    ventedRidge: 'none',
    ruleSetRevision: 'v2-2026',
    installProgress: {
      customSequencePlaneIds: [],
      stagedPlaneIds: [],
      completedPlaneIds: [],
      completedPieceIds: []
    },
    lastUpdatedAt: '2026-11-26T00:00:00.000Z'
  };

  const orderPackEst = buildOrderPack({
    planes,
    levels: modelSnap.levels,
    layout,
    bom,
    assignableLines: [],
    assignments,
    libraryProfiles: [],
    locked: false
  });

  // 8a. Refuses on failed area sanity & completeness blocker
  assert.throws(
    () =>
      buildEnvelopeSnapshot({
        revision: 1,
        kind: 'estimated',
        model: modelSnap,
        bom,
        orderPack: orderPackEst,
        areaSanity: { ok: false, warning: 'Area doubled' }
      }),
    /Area doubled/,
    'buildEnvelopeSnapshot must refuse when areaSanity fails'
  );

  assert.throws(
    () =>
      buildEnvelopeSnapshot({
        revision: 1,
        kind: 'estimated',
        model: modelSnap,
        bom,
        orderPack: orderPackEst,
        areaSanity: { ok: true },
        completenessReport: {
          isComplete: false,
          canLockMeasure: false,
          blockersCount: 1,
          warningsCount: 0,
          totalIssuesCount: 1,
          undetailedWallsCount: 0,
          undetailedReturnsCount: 0,
          unassignedFlashingsCount: 1,
          incompletePlanesCount: 0,
          incompletePenetrationsCount: 0,
          issues: [
            {
              id: 'blk-1',
              severity: 'blocker',
              category: 'missing_flashing',
              title: 'Ridge flashing missing',
              detail: 'Assign ridge flashing'
            }
          ]
        }
      }),
    /Ridge flashing missing/,
    'buildEnvelopeSnapshot must refuse when completenessReport has blockers'
  );

  // 8b. Distinct RIDGE-150 / RIDGE-200 / RIDGE-RV10P codes & deterministic IDs across repeat calls
  const multiRidgeAssignments: RoofFlashingAssignment[] = [
    {
      ...assignments[0],
      id: 'assign-r150',
      lineId: 'skel-ridge-150',
      lineLabel: 'Low Wind Ridge',
      profileId: 'std-ridge-150',
      profileName: 'Ridge 150',
      productCode: 'RIDGE-150'
    },
    {
      ...assignments[0],
      id: 'assign-r200',
      lineId: 'skel-ridge-200',
      lineLabel: 'High Wind Ridge',
      profileId: 'std-ridge-200',
      profileName: 'Ridge 200',
      productCode: 'RIDGE-200'
    },
    {
      ...assignments[0],
      id: 'assign-rv10p',
      lineId: 'skel-ridge-rv10p',
      lineLabel: 'Vented Ridge',
      profileId: 'std-ridge-rv10p',
      profileName: 'Ridge RV10P',
      productCode: 'RIDGE-RV10P'
    }
  ];
  const multiBom = buildRoofBillOfMaterials({
    planes,
    layout,
    assignments: multiRidgeAssignments,
    assignableLines: []
  });
  const snapEst1 = buildEnvelopeSnapshot({
    revision: 1,
    kind: 'estimated',
    model: modelSnap,
    bom: multiBom,
    orderPack: orderPackEst,
    areaSanity: { ok: true }
  });
  assert.equal(snapEst1.revision, 1);
  assert.equal(snapEst1.kind, 'estimated');

  const built1 = buildQuoteSections(snapEst1);
  const built2 = buildQuoteSections(snapEst1);
  assert.deepEqual(
    built1.sections.map((s) => s.id),
    built2.sections.map((s) => s.id),
    'buildQuoteSections must emit identical deterministic section IDs'
  );
  assert.deepEqual(
    built1.rows.map((r) => r.id),
    built2.rows.map((r) => r.id),
    'buildQuoteSections must emit identical deterministic row IDs'
  );
  const flashCodes = built1.rows
    .filter((r) => r.sectionId === 'sec-apex-flash')
    .map((r) => r.itemCode);
  assert.deepEqual(
    flashCodes,
    ['RIDGE-150', 'RIDGE-200', 'RIDGE-RV10P'],
    'Distinct RIDGE-150 / RIDGE-200 / RIDGE-RV10P product codes must survive buildQuoteSections'
  );

  // 8c. Idempotent applyBomToQuoteObject preserves manual non-Apex sections without duplicating Apex rows
  const baseQuoteWithManual: Quote = {
    ...({} as Quote),
    id: 'q-idem-1',
    quoteNumber: 'QT-1001',
    clientName: 'Test Client',
    clientEmail: 't@example.com',
    clientPhone: '021',
    siteAddress: '1 Test Rd',
    profile: 'TRS Corrugate 0.55mm',
    material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
    colorName: 'FlaxPod',
    roofAreaM2: 140,
    markupPercent: 18,
    status: 'draft',
    version: 1,
    createdAt: '2026-11-26',
    validUntil: '2026-12-26',
    spreadsheetSections: [
      { id: 'sec-manual-scaff', title: 'Manual Scaffolding', colorTag: '#64748b', sectionType: 'custom' }
    ],
    spreadsheetRows: [
      {
        id: 'row-manual-scaff',
        sectionId: 'sec-manual-scaff',
        itemCode: 'SCAF-1',
        description: 'Edge Protection',
        category: 'Safety',
        quantity: 1,
        unit: 'lot',
        wastagePercent: 0,
        unitCostNZD: 1200,
        markupPercent: 10,
        unitSellNZD: 1320,
        totalNZD: 1320
      }
    ]
  };
  const pushedOnce = applyBomToQuoteObject({
    quote: baseQuoteWithManual,
    envelope: snapEst1,
    replaceExistingSections: true
  });
  const pushedTwice = applyBomToQuoteObject({
    quote: pushedOnce,
    envelope: snapEst1,
    replaceExistingSections: true
  });
  assert.equal(
    pushedTwice.spreadsheetRows?.length,
    pushedOnce.spreadsheetRows?.length,
    'Pushing twice with replaceExistingSections=true must be idempotent'
  );
  assert.ok(
    pushedTwice.spreadsheetSections?.some((s) => s.id === 'sec-manual-scaff'),
    'Manual non-Apex section must be preserved'
  );
  assert.ok(
    pushedTwice.spreadsheetRows?.some((r) => r.id === 'row-manual-scaff'),
    'Manual non-Apex row must be preserved'
  );
  assert.equal(
    pushedTwice.roofPlanModel?.envelopeSnapshot?.revision,
    1,
    'Attached Quote roofPlanModel retains EnvelopeSnapshot'
  );

  // 8d. Lifecycle revisions & measured history cap (5)
  const measuredRev2 = buildEnvelopeSnapshot({
    revision: getNextEnvelopeRevision(snapEst1, []),
    kind: 'measured',
    model: { ...modelSnap, stage: 'installing', measureLocked: true },
    bom: multiBom,
    orderPack: { ...orderPackEst, locked: true },
    areaSanity: { ok: true }
  });
  let history = appendMeasuredEnvelopeHistory([], measuredRev2, 5);
  assert.equal(measuredRev2.revision, 2);
  assert.equal(history.length, 1);

  // Unlock advances to estimated rev 3 without mutating measuredRev2 in history
  const estRev3 = buildEnvelopeSnapshot({
    revision: getNextEnvelopeRevision(measuredRev2, history),
    kind: 'estimated',
    model: modelSnap,
    bom: multiBom,
    orderPack: orderPackEst,
    areaSanity: { ok: true }
  });
  assert.equal(estRev3.revision, 3);
  assert.equal(getLatestMeasuredEnvelope({ envelopeSnapshot: estRev3, envelopeHistory: history })?.revision, 2);

  // Cap at 5 measured revisions
  for (let r = 4; r <= 9; r++) {
    const m = buildEnvelopeSnapshot({
      revision: r,
      kind: 'measured',
      model: { ...modelSnap, stage: 'installing', measureLocked: true },
      bom: multiBom,
      orderPack: { ...orderPackEst, locked: true },
      areaSanity: { ok: true }
    });
    history = appendMeasuredEnvelopeHistory(history, m, 5);
  }
  assert.equal(history.length, 5, 'Measured envelope history must cap at 5 entries');
  assert.deepEqual(
    history.map((h) => h.revision),
    [5, 6, 7, 8, 9],
    'Measured envelope history keeps the 5 newest measured revisions'
  );
}
console.log('✓ Test 8 Passed: EnvelopeSnapshot gating, distinct RIDGE codes, idempotent Quote sections, and 5-cap measured history');


