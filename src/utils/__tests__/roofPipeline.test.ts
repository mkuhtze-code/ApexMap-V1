import assert from 'node:assert/strict';
import {
  addCourtyardHoleToOutline,
  applyEdgeType,
  buildOutlineFromPoints,
  getOutlineFootprintAreaM2,
  polygonCentroid,
  resolveLevelSharedVertexElevations
} from '../exactRoofingEngine';
import {
  checkRoofAreaSanity,
  computeTruthfulRoofAreaM2,
  createRoofPipelineState,
  deletePlanesViaPipeline,
  ensureBom,
  ensureFaces,
  ensureLayout,
  ensureSkeleton,
  invalidateOutline,
  runTakeoffPlaybook
} from '../roofPipeline';
import {
  assignStandardFlashings,
  computeRuleStickPlan,
  FLASHING_RULES_STORAGE_KEY,
  loadFlashingRuleSet,
  resetFlashingRuleSetToSeeds,
  resolveMatchingFlashingRule,
  saveFlashingRuleSet
} from '../flashingRules';
import { exportOrderPackToCsv } from '../exactRoofingBomBridge';
import { DEFAULT_ARCHITECTURAL_PROFILES } from '../sheetMetalGeometry';
import { evaluateTakeoffCompleteness } from '../takeoffCompleteness';
import { buildRoofSceneGroup } from '../../components/exactroofing/three/roofMeshBuilder';
import type {
  ExactRoofModelSnapshot,
  FlashingRuleContext,
  RoofFlashingAssignment,
  RoofLevel,
  RoofPlane,
  SheetSpec,
  SkeletonLine
} from '../../types/exactRoofing';

console.log('--- Starting RoofPipeline Deterministic Golden & Flashing Rule Suite ---');

const SHEET_SPEC: SheetSpec = {
  coverWidth: 0.762,
  maxLength: 6.3,
  endLap: 0.15,
  overhang: 0.05
};

// Simple localStorage polyfill verification for Node execution
function resetRulesStorage() {
  if (typeof globalThis.localStorage !== 'undefined') {
    globalThis.localStorage.removeItem(FLASHING_RULES_STORAGE_KEY);
  }
  return resetFlashingRuleSetToSeeds();
}

// ============================================================================
// PART B — GOLDEN TRUTH FIXTURES (BLOCK 2x AREA & PRESERVE SUPPRESSIONS)
// ============================================================================
{
  // B1. 10m x 6m rectangle gable @ 22.5° -> 2 faces, idempotent across x2 rebuild, <1.15x footprint
  let rectOut = buildOutlineFromPoints(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 }
    ],
    'b1-rect-gable',
    { initialEdgeType: 'outline', defaultEaveHeightM: 2.7 }
  );
  rectOut = applyEdgeType(rectOut, [rectOut.edges[1].id, rectOut.edges[3].id], 'verge');

  const lvl: RoofLevel = {
    id: 'lvl-b1',
    code: 'L1',
    name: 'Gable 10x6',
    eaveHeightM: 2.7,
    outline: rectOut,
    skeleton: []
  };

  let pipe = createRoofPipelineState({ levels: [lvl], planes: [] });
  pipe = ensureSkeleton(pipe, { mode: 'auto' }).state;
  const f1 = ensureFaces(pipe, { defaultPitchDeg: 22.5 });
  const f2 = ensureFaces(f1.state, { defaultPitchDeg: 22.5 });

  assert.equal(f1.state.planes.length, 2, '10x6 gable must produce exactly 2 faces');
  assert.equal(f2.state.planes.length, 2, 'Running ensureFaces twice must stay 2 faces');

  const area1 = computeTruthfulRoofAreaM2(f1.state.planes);
  const area2 = computeTruthfulRoofAreaM2(f2.state.planes);
  const footprint = getOutlineFootprintAreaM2(rectOut);
  assert.equal(Math.round(footprint), 60, '10x6 footprint must equal 60m²');
  assert.ok(
    Math.abs(area1 - area2) <= area1 * 0.005,
    `ensureFaces x2 modeled area drift exceeded 0.5% (${area1} vs ${area2})`
  );
  assert.ok(
    area2 < footprint * 1.15 && area2 > footprint * 1.05,
    `Modeled area (${area2}m²) must stay ~1.08x footprint (${footprint}m²), never >=1.15x`
  );
  assert.ok(area2 < footprint * 1.5, 'Area inflation must stay strictly below 1.5x');

  // B3. Delete 1 face -> stays suppressed when preserveUserDeleted: true
  const doomed = f2.state.planes[0];
  const delRes = deletePlanesViaPipeline(f2.state, [doomed.id]);
  assert.equal(delRes.planes.length, 1, 'Delete 1 face leaves 1 face');
  const afterPreserve = ensureFaces(delRes, {
    defaultPitchDeg: 22.5,
    preserveUserDeleted: true
  });
  assert.equal(
    afterPreserve.state.planes.length,
    1,
    'Suppressed deleted face must stay gone across ensureFaces({ preserveUserDeleted: true })'
  );
  assert.ok(
    !afterPreserve.state.planes.some((p) => p.eaveEdgeId === doomed.eaveEdgeId),
    'Deleted face eaveEdgeId must remain suppressed'
  );

  // Explicit rebuild without preserveUserDeleted restores cleanly
  const afterRestore = ensureFaces(afterPreserve.state, {
    defaultPitchDeg: 22.5,
    preserveUserDeleted: false
  });
  assert.equal(afterRestore.state.planes.length, 2, 'Explicit rebuild restores deleted face');

  // B4. ensureLayout when dirty.faces === true throws under strictDirtyCheck and auto-rebuilds without it
  const dirtyFacesState = invalidateOutline(f2.state);
  assert.throws(
    () =>
      ensureLayout(dirtyFacesState, {
        sheetSpec: SHEET_SPEC,
        strictDirtyCheck: true
      }),
    /dirty/i,
    'ensureLayout with strictDirtyCheck: true must throw when dirty.faces === true'
  );
  const cleanLayoutRes = ensureLayout(dirtyFacesState, {
    sheetSpec: SHEET_SPEC,
    strictDirtyCheck: false
  });
  assert.equal(cleanLayoutRes.state.planes.length, 2, 'ensureLayout cleanly rebuilds dirty faces without duplicates');
  assert.ok(cleanLayoutRes.layout!.totalRoofArea < footprint * 1.15, 'Rebuilt layout never packs duplicate area');

  // B5. Excess inflationRatio (~2x duplicated planes) blocks strict BOM & Measure lock
  const dupPlanes: RoofPlane[] = [
    ...f2.state.planes,
    ...f2.state.planes.map((pl, idx) => ({ ...pl, id: `${pl.id}-dup-${idx}` }))
  ];
  const sanity = checkRoofAreaSanity(f2.state.levels, dupPlanes);
  assert.equal(sanity.ok, false, '2x duplicated faces must fail areaSanity');
  assert.equal(sanity.hardBlockBomPush, true, '2x duplicated faces must trigger hardBlockBomPush');

  assert.throws(
    () =>
      ensureBom(
        {
          ...cleanLayoutRes.state,
          planes: dupPlanes,
          dirty: { ...cleanLayoutRes.state.dirty, faces: false, layout: false, bom: true }
        },
        { sheetSpec: SHEET_SPEC, strictAreaSanity: true }
      ),
    /Area sanity/i,
    'ensureBom({ strictAreaSanity: true }) must throw on excess area inflation'
  );

  const comp = evaluateTakeoffCompleteness({
    levels: f2.state.levels,
    planes: dupPlanes,
    assignableLines: [],
    flashingAssignments: [],
    wallPlan: null,
    assets: [],
    areaSanity: sanity
  });
  assert.equal(comp.canLockMeasure, false, 'Excess inflation must block measure lock');
  assert.ok(
    comp.issues.some((i) => i.category === 'area_sanity' && i.severity === 'blocker'),
    'Completeness must emit area_sanity blocker'
  );
}
console.log('✓ Part B1/B3/B4/B5 Passed: 10x6 gable idempotency, face delete suppression, dirty layout rebuild & 2x block verified.');

{
  // B2. 10x6 + 4x2 courtyard hole -> zero centroids inside hole, net footprint 52m², modeled tracks net
  let voidOut = buildOutlineFromPoints(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 }
    ],
    'b2-courtyard',
    { initialEdgeType: 'outline', defaultEaveHeightM: 2.7 }
  );
  voidOut = addCourtyardHoleToOutline(
    voidOut,
    [
      { x: 3, y: 2 },
      { x: 7, y: 2 },
      { x: 7, y: 4 },
      { x: 3, y: 4 }
    ],
    { initialEdgeType: 'outline', eaveHeightM: 2.7 }
  );

  const netFootprint = getOutlineFootprintAreaM2(voidOut);
  assert.equal(Math.round(netFootprint), 52, '10x6 minus 4x2 hole must equal 52m² net footprint');

  let pipeVoid = createRoofPipelineState({
    levels: [
      {
        id: 'lvl-b2',
        code: 'L1',
        name: '10x6 Courtyard',
        eaveHeightM: 2.7,
        outline: voidOut,
        skeleton: []
      }
    ],
    planes: []
  });
  pipeVoid = ensureSkeleton(pipeVoid, { mode: 'auto' }).state;
  pipeVoid = ensureFaces(pipeVoid, { defaultPitchDeg: 22.5 }).state;
  const bomVoid = ensureBom(
    ensureLayout(pipeVoid, { sheetSpec: SHEET_SPEC, strictDirtyCheck: true }).state,
    { sheetSpec: SHEET_SPEC, strictAreaSanity: true }
  );

  const anyCentroidInHole = bomVoid.state.planes.some((pl) => {
    const c = polygonCentroid(pl.planPolygon);
    return c.x > 3.05 && c.x < 6.95 && c.y > 2.05 && c.y < 3.95;
  });
  assert.equal(anyCentroidInHole, false, 'Zero roof plane centroids may fall inside the 4x2 courtyard hole');

  const expectedModeled = 52 / Math.cos((22.5 * Math.PI) / 180);
  assert.ok(
    Math.abs(bomVoid.bom.totalRoofAreaM2 - expectedModeled) < expectedModeled * 0.08,
    `Courtyard modeled area (${bomVoid.bom.totalRoofAreaM2}m²) must reflect net 52m² footprint (~${expectedModeled.toFixed(2)}m²)`
  );
}
console.log('✓ Part B2 Passed: 10x6 + 4x2 courtyard hole excludes void centroids & tracks 52m² net footprint.');

// ============================================================================
// PART C — SEALED T/L MESH FIXTURE (SHARED ENDPOINTS + ZERO BARGE SLIVERS)
// ============================================================================
{
  const tPts = [
    { x: 0, y: 0 },
    { x: 14, y: 0 },
    { x: 14, y: 6 },
    { x: 10, y: 6 },
    { x: 10, y: 11 },
    { x: 4, y: 11 },
    { x: 4, y: 6 },
    { x: 0, y: 6 }
  ];
  let tOut = buildOutlineFromPoints(tPts, 'c-sealed-t', {
    initialEdgeType: 'outline',
    defaultEaveHeightM: 2.7
  });
  // East end (edge 1), West end (edge 7), North T-bay tip (edge 4) as gables
  tOut = applyEdgeType(tOut, [tOut.edges[1].id, tOut.edges[4].id, tOut.edges[7].id], 'verge');

  const tLvl: RoofLevel = {
    id: 'lvl-c',
    code: 'L1',
    name: 'Sealed T Gable',
    eaveHeightM: 2.7,
    outline: tOut,
    skeleton: []
  };

  let pipeC = createRoofPipelineState({ levels: [tLvl], planes: [] });
  pipeC = ensureSkeleton(pipeC, { mode: 'auto' }).state;
  pipeC = ensureFaces(pipeC, { defaultPitchDeg: 22.5 }).state;

  assert.ok(pipeC.planes.length >= 4, `Expected >=4 faces on T-gable, got ${pipeC.planes.length}`);
  pipeC.planes.forEach((pl) => {
    assert.ok(
      (pl.area ?? 0) >= 0.05,
      `Detected synthetic barge wedge sliver on face ${pl.code} (area=${pl.area})`
    );
  });

  // Verify junction sharing in 3D via resolveLevelSharedVertexElevations + actual Three.js BufferGeometries
  const sharedC = resolveLevelSharedVertexElevations(
    pipeC.planes,
    pipeC.levels[0].outline,
    pipeC.levels[0].skeleton,
    2.7
  );
  const vJunction = sharedC.getVertexForPoint({ x: 7, y: 3 });
  assert.ok(vJunction.z > 2.7, 'T-junction ridge elevation must sit above 2.7m eave');

  const stubTex = {
    normalMap: null as any,
    roughnessMap: null as any,
    bumpMap: null as any,
    dispose: () => {}
  };
  const stubWallTex = {
    weatherboard: { normalMap: null, roughnessMap: null, bumpMap: null },
    profiled_metal: { normalMap: null, roughnessMap: null, bumpMap: null },
    brick: { normalMap: null, roughnessMap: null, bumpMap: null },
    fibre_cement: { normalMap: null, roughnessMap: null, bumpMap: null },
    plaster: { normalMap: null, roughnessMap: null, bumpMap: null },
    stone: { normalMap: null, roughnessMap: null, bumpMap: null },
    garageDoor: null,
    garageDoorRoughness: null,
    garageDoorBump: null,
    getEntry: () => ({ normalMap: null, roughnessMap: null, bumpMap: null }),
    dispose: () => {}
  } as any;

  const sceneC = buildRoofSceneGroup({
    outline: pipeC.levels[0].outline,
    skeleton: pipeC.levels[0].skeleton,
    planes: pipeC.planes,
    levels: pipeC.levels,
    shadingMode: 'studio_finish',
    swatch: { id: 'flaxpod', name: 'FlaxPod', hex: '#343635', metalness: 0.36, roughness: 0.42 },
    textures: stubTex,
    wallTextures: stubWallTex,
    showFlashings: false,
    showWalls: false,
    showSheetSeams: false,
    isSoftwareGl: true
  });

  try {
    assert.equal(
      sceneC.selectableMeshes.length,
      pipeC.planes.length,
      '3D scene must produce 1 mesh per roof plane'
    );

    // Check every ridge & valley skeleton endpoint has matching 3D heights (<= 2mm tolerance) across all meeting planes
    const checkPts = [
      ...pipeC.levels[0].skeleton
        .filter((s) => s.suggestedType === 'ridge' || s.suggestedType === 'valley')
        .flatMap((s) => [s.from, s.to])
    ];

    checkPts.forEach((pt) => {
      const wx = pt.x - sceneC.bounds.midX;
      const wz = pt.y - sceneC.bounds.midY;
      const heights: number[] = [];
      pipeC.planes.forEach((pl) => {
        const meshes = sceneC.planeMeshById.get(pl.id) || [];
        meshes.forEach((mesh) => {
          const pos = mesh.geometry.getAttribute('position');
          if (!pos) return;
          let maxYNear = -Infinity;
          for (let vi = 0; vi < pos.count; vi++) {
            const dx = pos.getX(vi) - wx;
            const dz = pos.getZ(vi) - wz;
            if (Math.hypot(dx, dz) <= 0.005) {
              maxYNear = Math.max(maxYNear, pos.getY(vi));
            }
          }
          if (maxYNear > -Infinity) heights.push(maxYNear);
        });
      });
      if (heights.length >= 2) {
        const span = Math.max(...heights) - Math.min(...heights);
        assert.ok(
          span <= 0.005,
          `3D seam gap at (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}): Z spread=${(span * 1000).toFixed(2)}mm`
        );
      }
    });
  } finally {
    sceneC.dispose();
  }
}
console.log('✓ Part C Passed: Sealed T-bay gable 3D meshes share endpoints within 5mm & contain zero barge slivers.');

// ============================================================================
// PART D + ADDENDUM — STANDARD FLASHING RULES & ADMIN OVERRIDES
// ============================================================================
{
  const seeded = resetRulesStorage();
  assert.ok(seeded.rules.length >= 12, 'Factory seed rules must populate defaults cleanly');

  // Seed-once reload test: edit a rule, save, call loadFlashingRuleSet -> edit survives!
  const modifiedForPersist = {
    ...seeded,
    version: seeded.version + 1,
    rules: seeded.rules.map((r) =>
      r.id === 'seed-cor-ridge-heh' ? { ...r, coverMm: 220, shopNotes: '220mm custom coastal lap' } : r
    )
  };
  saveFlashingRuleSet(modifiedForPersist);
  const reloaded = loadFlashingRuleSet();
  assert.equal(
    reloaded.rules.find((r) => r.id === 'seed-cor-ridge-heh')?.coverMm,
    220,
    'Saved admin edit to coverMm must persist across reload and never be overwritten by seed'
  );
  assert.equal(
    reloaded.rules.find((r) => r.id === 'seed-cor-ridge-heh')?.shopNotes,
    '220mm custom coastal lap'
  );

  // Reset back to seeds and verify explicit reset restores defaults
  const afterReset = resetRulesStorage();
  assert.equal(
    afterReset.rules.find((r) => r.id === 'seed-cor-ridge-heh')?.coverMm,
    200,
    'Explicit resetFlashingRuleSetToSeeds restores default 200mm cover'
  );

  // Bounded stick splitting test: 5000mm run -> preferredStickMm=2400, maxStickMm=3000 -> 2 sticks <= 3000mm
  const stick5m = computeRuleStickPlan(5.0, {
    preferredStickMm: 2400,
    maxStickMm: 3000,
    joinAllowanceMm: 150,
    endAllowanceMm: 30
  });
  assert.equal(stick5m.quantity, 2, '5000mm run with maxStickMm=3000 must split into 2 sticks');
  assert.ok(
    stick5m.pieceLengthMm <= 3000 && stick5m.pieceLengthMm >= 2400,
    `Each stick (${stick5m.pieceLengthMm}mm) must respect maxStickMm=3000`
  );

  // Build simple 10x6 gable assignable lines + manual barge override
  let gOut = buildOutlineFromPoints(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 }
    ],
    'd-gable',
    { initialEdgeType: 'outline', defaultEaveHeightM: 2.7 }
  );
  gOut = applyEdgeType(gOut, [gOut.edges[1].id, gOut.edges[3].id], 'verge');
  const gPipe = runTakeoffPlaybook(
    createRoofPipelineState({
      levels: [{ id: 'lvl-d', code: 'L1', name: 'Rule Gable', eaveHeightM: 2.7, outline: gOut, skeleton: [] }],
      planes: []
    }),
    {
      sheetSpec: SHEET_SPEC,
      flashingContext: {
        windZone: 'M',
        roofProfileFamily: 'corrugate',
        ventedRidge: 'none'
      },
      libraryProfiles: DEFAULT_ARCHITECTURAL_PROFILES,
      ruleSet: afterReset
    }
  );
  assert.equal(gPipe.ok, true, 'Playbook must succeed on clean gable');
  const lines = gPipe.assignableLines;
  const ridgeLine = lines.find((l) => l.flashingKind === 'ridge')!;
  const bargeLine = lines.find((l) => l.flashingKind === 'barge')!;
  assert.ok(ridgeLine && bargeLine, 'Expected ridge & barge assignable lines');

  // Wind zone M -> FL-RDG-150 (cover 150)
  const assignM = gPipe.assignments.find((a) => a.lineId === ridgeLine.lineId)!;
  assert.equal(assignM.productCode, 'FL-RDG-150');
  assert.equal(assignM.coverMm, 150);
  assert.equal(assignM.source, 'rule');

  // Switch M -> H -> FL-RDG-200 (cover 200)
  const resH = assignStandardFlashings(
    lines,
    { windZone: 'H', roofProfileFamily: 'corrugate', ventedRidge: 'none' },
    DEFAULT_ARCHITECTURAL_PROFILES,
    afterReset,
    gPipe.assignments
  );
  const assignH = resH.assignments.find((a) => a.lineId === ridgeLine.lineId)!;
  assert.equal(assignH.productCode, 'FL-RDG-200', 'Wind zone H must select FL-RDG-200');
  assert.equal(assignH.coverMm, 200);

  // Add manual source: 'user' override on bargeLine, then switch ventedRidge -> RV10P
  const manualBarge: RoofFlashingAssignment = {
    ...resH.assignments.find((a) => a.lineId === bargeLine.lineId)!,
    productCode: 'CUSTOM-USER-BRG',
    coverMm: 275,
    source: 'user',
    notes: 'Hand-picked custom barge'
  };
  const withUserBarge = resH.assignments.map((a) =>
    a.lineId === bargeLine.lineId ? manualBarge : a
  );

  const resVented = assignStandardFlashings(
    lines,
    { windZone: 'H', roofProfileFamily: 'corrugate', ventedRidge: 'RV10P' },
    DEFAULT_ARCHITECTURAL_PROFILES,
    afterReset,
    withUserBarge
  );
  const assignRV = resVented.assignments.find((a) => a.lineId === ridgeLine.lineId)!;
  const preservedBarge = resVented.assignments.find((a) => a.lineId === bargeLine.lineId)!;
  assert.equal(assignRV.productCode, 'FL-RDG-RV10P', 'RV10P option must pick FL-RDG-RV10P');
  assert.equal(preservedBarge.productCode, 'CUSTOM-USER-BRG', 'Manual source=user line must remain untouched');
  assert.equal(preservedBarge.coverMm, 275);

  // Admin edits H–EH rule cover 200 -> 220 -> OrderPack.flashings & CSV reflect 220 & shop_notes, zero $
  const editedSet = saveFlashingRuleSet({
    ...afterReset,
    version: afterReset.version + 1,
    rules: afterReset.rules.map((r) =>
      r.id === 'seed-cor-ridge-heh'
        ? { ...r, coverMm: 220, shopNotes: '220mm heavy wind soft-edge' }
        : r
    )
  });
  const ctxH: FlashingRuleContext = {
    windZone: 'H',
    roofProfileFamily: 'corrugate',
    ventedRidge: 'none'
  };
  const editedPlaybook = runTakeoffPlaybook(
    createRoofPipelineState({
      levels: gPipe.state.levels,
      planes: gPipe.state.planes
    }),
    {
      sheetSpec: SHEET_SPEC,
      flashingContext: ctxH,
      libraryProfiles: DEFAULT_ARCHITECTURAL_PROFILES,
      ruleSet: editedSet,
      existingAssignments: [manualBarge]
    }
  );
  assert.ok(editedPlaybook.orderPack, 'Playbook must emit OrderPack');
  const ridgePackLine = editedPlaybook.orderPack!.flashings.find(
    (f) => f.flashing_kind === 'ridge'
  )!;
  assert.equal(ridgePackLine.cover_mm, 220, 'OrderPack.flashings must include edited cover_mm=220');
  assert.equal(ridgePackLine.shop_notes, '220mm heavy wind soft-edge');
  assert.equal(ridgePackLine.rule_id, 'seed-cor-ridge-heh');
  assert.equal(ridgePackLine.source, 'rule');

  const csvEdited = exportOrderPackToCsv(editedPlaybook.orderPack!);
  assert.ok(!csvEdited.includes('$'), 'OrderPack CSV must remain commercial-neutral (zero $)');
  assert.ok(csvEdited.includes('cover_mm') && csvEdited.includes('shop_notes'), 'CSV header must expose cover_mm & shop_notes');
  assert.ok(csvEdited.includes('220mm heavy wind soft-edge'), 'CSV rows must include shop_notes');

  // Disabling H–EH rule skips ridge assignment cleanly and triggers completeness blocker unless out-of-scope
  const disabledSet = {
    ...editedSet,
    rules: editedSet.rules.map((r) =>
      r.id === 'seed-cor-ridge-heh' ? { ...r, enabled: false } : r
    )
  };
  assert.equal(
    resolveMatchingFlashingRule(disabledSet.rules, 'ridge', ctxH),
    null,
    'Disabling specific rule must return null without falling back'
  );
  const resDisabled = assignStandardFlashings(
    lines,
    ctxH,
    DEFAULT_ARCHITECTURAL_PROFILES,
    disabledSet,
    []
  );
  assert.ok(
    resDisabled.unresolvedLineIds.includes(ridgeLine.lineId),
    'Disabled ridge rule leaves ridge line in unresolvedLineIds'
  );
  const blockedComp = evaluateTakeoffCompleteness({
    levels: editedPlaybook.state.levels,
    planes: editedPlaybook.state.planes,
    assignableLines: lines,
    flashingAssignments: resDisabled.assignments,
    wallPlan: null,
    assets: []
  });
  assert.equal(blockedComp.canLockMeasure, false, 'Unresolved ridge line must block measure lock');
  const scopedComp = evaluateTakeoffCompleteness({
    levels: editedPlaybook.state.levels,
    planes: editedPlaybook.state.planes,
    assignableLines: lines,
    flashingAssignments: resDisabled.assignments,
    wallPlan: null,
    assets: [],
    outOfScopeLineIds: [ridgeLine.lineId]
  });
  assert.equal(scopedComp.canLockMeasure, true, 'Out-of-scope ridge line skips flashing blocker cleanly');

  // Specificity + priority tie-breaking check
  const wildRule = {
    ...afterReset.rules[0],
    id: 'tie-wild',
    profileFamily: '*' as const,
    windMin: 'L' as const,
    windMax: 'EH' as const,
    priority: 500
  };
  const exactNarrowHigh = {
    ...afterReset.rules[0],
    id: 'tie-exact-high',
    profileFamily: 'corrugate' as const,
    windMin: 'H' as const,
    windMax: 'H' as const,
    priority: 200
  };
  const exactNarrowLow = {
    ...exactNarrowHigh,
    id: 'tie-exact-low',
    priority: 100
  };
  const winner = resolveMatchingFlashingRule([wildRule, exactNarrowLow, exactNarrowHigh], 'ridge', ctxH);
  assert.equal(
    winner?.id,
    'tie-exact-high',
    'Specificity beats wildcard even with lower priority, and higher priority wins exact ties'
  );

  // Frozen snapshot protection check
  const lockedSnapshot: ExactRoofModelSnapshot = {
    version: 2,
    stage: 'installing',
    measureLocked: true,
    selectedPreset: 'straight_gable',
    outline: editedPlaybook.state.levels[0].outline,
    skeleton: editedPlaybook.state.levels[0].skeleton,
    planes: editedPlaybook.state.planes,
    levels: editedPlaybook.state.levels,
    startPlaneId: null,
    assets: [],
    pitchBreaks: [],
    flashingAssignments: editedPlaybook.assignments,
    installProgress: {
      customSequencePlaneIds: [],
      stagedPlaneIds: [],
      completedPlaneIds: [],
      completedPieceIds: []
    },
    appliedRulesSnapshot: editedPlaybook.ruleSnapshot!.appliedRulesSnapshot,
    ruleSetVersion: editedPlaybook.ruleSnapshot!.ruleSetVersion,
    ruleSetCapturedAt: editedPlaybook.ruleSnapshot!.ruleSetCapturedAt,
    orderPack: editedPlaybook.orderPack,
    lastUpdatedAt: new Date().toISOString()
  };
  // Mutating global rules later must NOT touch locked snapshot's cover_mm=220
  resetRulesStorage();
  assert.equal(
    lockedSnapshot.orderPack?.flashings.find((f) => f.flashing_kind === 'ridge')?.cover_mm,
    220,
    'Locked OrderPack & appliedRulesSnapshot must remain immutable after global rules change'
  );
}
console.log('✓ Part D + Addendum Passed: Seed persistence, Wind/RV10P resolution, manual protection, stick splits, completeness out-of-scope & frozen lock verified.');

// ============================================================================
// PART E — PLAYBOOK ABORT & END-TO-END ORCHESTRATION
// ============================================================================
{
  const seeded = resetRulesStorage();
  let rectOut = buildOutlineFromPoints(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 }
    ],
    'e-abort',
    { initialEdgeType: 'outline', defaultEaveHeightM: 2.7 }
  );
  rectOut = applyEdgeType(rectOut, [rectOut.edges[1].id, rectOut.edges[3].id], 'verge');

  const okRes = runTakeoffPlaybook(
    createRoofPipelineState({
      levels: [{ id: 'lvl-e', code: 'L1', name: 'Playbook Gable', eaveHeightM: 2.7, outline: rectOut, skeleton: [] }],
      planes: []
    }),
    {
      sheetSpec: SHEET_SPEC,
      flashingContext: { windZone: 'H', roofProfileFamily: 'corrugate', ventedRidge: 'none' },
      libraryProfiles: DEFAULT_ARCHITECTURAL_PROFILES,
      ruleSet: seeded
    }
  );
  assert.equal(okRes.ok, true);
  assert.ok(okRes.layout && okRes.bom && okRes.orderPack);
  assert.equal(okRes.state.planes.length, 2);

  // Inject overlapping non-identical faces exceeding 1.45x footprint & verify runTakeoffPlaybook aborts cleanly before layout
  const overlappingPlanes: RoofPlane[] = [
    ...okRes.state.planes,
    ...okRes.state.planes.map((p, idx) => ({
      ...p,
      id: `${p.id}-overlap-e-${idx}`,
      eaveEdgeId: `bogus-overlap-edge-${idx}`,
      planPolygon: p.planPolygon.map((pt) => ({ x: pt.x + 0.45, y: pt.y + 0.25 })),
      developedPolygon: undefined,
      area: (p.area || 32) * 1.3
    }))
  ];
  const bloatedState = createRoofPipelineState({
    levels: okRes.state.levels,
    planes: overlappingPlanes,
    dirty: { faces: false }
  });
  assert.equal(bloatedState.areaSanity.ok, false, 'Overlapping excess faces must fail areaSanity');

  const strictAbort = runTakeoffPlaybook(bloatedState, {
    sheetSpec: SHEET_SPEC,
    flashingContext: { windZone: 'H', roofProfileFamily: 'corrugate', ventedRidge: 'none' },
    libraryProfiles: DEFAULT_ARCHITECTURAL_PROFILES,
    ruleSet: seeded
  });
  assert.equal(strictAbort.ok, false, 'runTakeoffPlaybook must abort cleanly when areaSanity fails');
  assert.equal(strictAbort.layout, null, 'Aborted playbook must NOT generate layout');
  assert.equal(strictAbort.bom, null, 'Aborted playbook must NOT generate BOM');
  assert.equal(strictAbort.orderPack, null, 'Aborted playbook must NOT emit OrderPack');
}
console.log('✓ Part E Passed: runTakeoffPlaybook orchestrates full takeoff and aborts cleanly before layout on areaSanity failure.');

console.log('ALL ROOF PIPELINE DETERMINISTIC GOLDEN & FLASHING RULE TESTS PASSED! ✓');
