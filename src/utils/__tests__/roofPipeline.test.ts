import assert from 'node:assert/strict';
import {
  addCourtyardHoleToOutline,
  applyEaveHeightToFaceEaves,
  applyEaveHeightToLevelEaves,
  applyEdgeType,
  buildAttachedOutlineFromEdge,
  buildOutlineFromPoints,
  getOutlineFootprintAreaM2,
  polygonCentroid,
  resolveLevelSharedVertexElevations,
  tryAddCourtyardHoleToLevel
} from '../exactRoofingEngine';
import {
  applyTypologyPresetEdges,
  checkRoofAreaSanity,
  computeTruthfulRoofAreaM2,
  createRoofPipelineState,
  deletePlanesViaPipeline,
  ensureBom,
  ensureFaces,
  ensureLayout,
  ensureSkeleton,
  invalidateOutline,
  runTakeoffPlaybook,
  setEdgeMode
} from '../roofPipeline';
import { deriveWallPlanFromRoofLevels } from '../wallCladdingEngine';
import {
  assignStandardFlashings,
  clearFlashingRuleStoreForTest,
  computeRuleStickPlan,
  FLASHING_RULES_STORAGE_KEY,
  loadFlashingRuleSet,
  normalizeWindZoneCode,
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

  // Manual structural ridge guard: ensureFaces must preserve manual ridge without overwriting skeleton
  const manualRidgeLvl: RoofLevel = {
    id: 'lvl-manual-ridge',
    code: 'L1',
    name: 'Manual Ridge Gable',
    eaveHeightM: 2.7,
    outline: rectOut,
    skeleton: [
      {
        id: 'manual-ridge-1',
        from: { x: 0, y: 3 },
        to: { x: 10, y: 3 },
        suggestedType: 'ridge'
      }
    ]
  };
  const manualFacesRes = ensureFaces(
    createRoofPipelineState({ levels: [manualRidgeLvl], planes: [], dirty: { faces: true } }),
    { defaultPitchDeg: 22.5, preserveUserDeleted: true }
  );
  assert.equal(
    manualFacesRes.state.levels[0].skeleton.length,
    1,
    'ensureFaces must NOT invent or overwrite skeleton lines when manual structural ridge exists'
  );
  assert.equal(manualFacesRes.state.levels[0].skeleton[0].id, 'manual-ridge-1');
  assert.equal(manualFacesRes.state.planes.length, 2, 'Manual ridge 10x6 gable builds 2 faces');
}
console.log('✓ Part B1/B3/B4/B5 Passed: 10x6 gable idempotency, face delete suppression, manual skeleton guard, dirty layout rebuild & 2x block verified.');

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

  // Verify 3D scene produces ZERO triangles with centroids inside the 4x2 courtyard hole
  const stubVoidTex = {
    normalMap: null as any,
    roughnessMap: null as any,
    bumpMap: null as any,
    dispose: () => {}
  };
  const stubVoidWallTex = {
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
  const sceneVoid = buildRoofSceneGroup({
    outline: bomVoid.state.levels[0].outline,
    skeleton: bomVoid.state.levels[0].skeleton,
    planes: bomVoid.state.planes,
    levels: bomVoid.state.levels,
    shadingMode: 'studio_finish',
    swatch: { id: 'flaxpod', name: 'FlaxPod', hex: '#343635', metalness: 0.36, roughness: 0.42 },
    textures: stubVoidTex,
    wallTextures: stubVoidWallTex,
    showFlashings: false,
    showWalls: false,
    showSheetSeams: false,
    isSoftwareGl: true
  });
  try {
    let trianglesInHole = 0;
    bomVoid.state.planes.forEach((pl) => {
      const meshes = sceneVoid.planeMeshById.get(pl.id) || [];
      meshes.forEach((mesh) => {
        const pos = mesh.geometry.getAttribute('position');
        if (!pos) return;
        const idx = mesh.geometry.getIndex();
        const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
        for (let t = 0; t < triCount; t++) {
          const i0 = idx ? idx.getX(t * 3) : t * 3;
          const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
          const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          const cx =
            (pos.getX(i0) + pos.getX(i1) + pos.getX(i2)) / 3 + sceneVoid.bounds.midX;
          const cy =
            (pos.getZ(i0) + pos.getZ(i1) + pos.getZ(i2)) / 3 + sceneVoid.bounds.midY;
          if (cx > 3.05 && cx < 6.95 && cy > 2.05 && cy < 3.95) {
            trianglesInHole++;
          }
        }
      });
    });
    assert.equal(trianglesInHole, 0, '3D courtyard roof must have ZERO triangles inside the 4x2 hole');
  } finally {
    sceneVoid.dispose();
  }
}
console.log('✓ Part B2 Passed: 10x6 + 4x2 courtyard hole excludes 2D centroids & 3D mesh triangles & tracks 52m² net footprint.');

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

  // C2: 12x6 gable + 4x3 side bay fixture -> sealed shared 3D endpoints (<5mm) & no <0.05m² slivers
  const bayPts = [
    { x: 0, y: 0 },
    { x: 12, y: 0 },
    { x: 12, y: 6 },
    { x: 8, y: 6 },
    { x: 8, y: 9 },
    { x: 4, y: 9 },
    { x: 4, y: 6 },
    { x: 0, y: 6 }
  ];
  let bayOut = buildOutlineFromPoints(bayPts, 'c2-gable-bay', {
    initialEdgeType: 'outline',
    defaultEaveHeightM: 2.7
  });
  bayOut = applyEdgeType(bayOut, [bayOut.edges[1].id, bayOut.edges[4].id, bayOut.edges[7].id], 'verge');
  let pipeBay = createRoofPipelineState({
    levels: [
      {
        id: 'lvl-c2',
        code: 'L1',
        name: '12x6 Gable + 4x3 Bay',
        eaveHeightM: 2.7,
        outline: bayOut,
        skeleton: []
      }
    ],
    planes: []
  });
  pipeBay = ensureSkeleton(pipeBay, { mode: 'auto' }).state;
  pipeBay = ensureFaces(pipeBay, { defaultPitchDeg: 22.5 }).state;
  assert.ok(pipeBay.planes.length >= 4, `Expected >=4 faces on 12x6 + 4x3 gable bay, got ${pipeBay.planes.length}`);
  pipeBay.planes.forEach((pl) => {
    assert.ok(
      (pl.area ?? 0) >= 0.05,
      `Detected synthetic sliver on 12x6+4x3 face ${pl.code} (area=${pl.area})`
    );
  });
  const sharedBay = resolveLevelSharedVertexElevations(
    pipeBay.planes,
    pipeBay.levels[0].outline,
    pipeBay.levels[0].skeleton,
    2.7
  );
  assert.ok(sharedBay.getVertexForPoint({ x: 6, y: 3 }).z > 2.7, '12x6+4x3 ridge junction must sit above 2.7m');
  const sceneBay = buildRoofSceneGroup({
    outline: pipeBay.levels[0].outline,
    skeleton: pipeBay.levels[0].skeleton,
    planes: pipeBay.planes,
    levels: pipeBay.levels,
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
    const checkBayPts = pipeBay.levels[0].skeleton
      .filter((s) => s.suggestedType === 'ridge' || s.suggestedType === 'valley')
      .flatMap((s) => [s.from, s.to]);
    checkBayPts.forEach((pt) => {
      const wx = pt.x - sceneBay.bounds.midX;
      const wz = pt.y - sceneBay.bounds.midY;
      const heights: number[] = [];
      pipeBay.planes.forEach((pl) => {
        (sceneBay.planeMeshById.get(pl.id) || []).forEach((mesh) => {
          const pos = mesh.geometry.getAttribute('position');
          if (!pos) return;
          let maxYNear = -Infinity;
          for (let vi = 0; vi < pos.count; vi++) {
            if (Math.hypot(pos.getX(vi) - wx, pos.getZ(vi) - wz) <= 0.005) {
              maxYNear = Math.max(maxYNear, pos.getY(vi));
            }
          }
          if (maxYNear > -Infinity) heights.push(maxYNear);
        });
      });
      if (heights.length >= 2) {
        const span = Math.max(...heights) - Math.min(...heights);
        assert.ok(span <= 0.005, `12x6+4x3 3D seam gap ${(span * 1000).toFixed(2)}mm exceeded 5mm`);
      }
    });
  } finally {
    sceneBay.dispose();
  }
}
console.log('✓ Part C Passed: Sealed 14x6+6x5 T-bay & 12x6+4x3 bay 3D meshes share endpoints within 5mm & contain zero slivers.');

// ============================================================================
// PART D + ADDENDUM — STANDARD FLASHING RULES & ADMIN OVERRIDES
// ============================================================================
{
  assert.equal(FLASHING_RULES_STORAGE_KEY, 'apexmap.flashingRuleSet.v1');
  assert.equal(normalizeWindZoneCode(), 'M', 'Default fallback wind zone must be M');
  clearFlashingRuleStoreForTest();
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

  // Wind zone M -> RIDGE-150 (cover 150)
  const assignM = gPipe.assignments.find((a) => a.lineId === ridgeLine.lineId)!;
  assert.equal(assignM.productCode, 'RIDGE-150');
  assert.equal(assignM.coverMm, 150);
  assert.equal(assignM.source, 'rule');

  // Switch M -> H -> RIDGE-200 (cover 200)
  const resH = assignStandardFlashings(
    lines,
    { windZone: 'H', roofProfileFamily: 'corrugate', ventedRidge: 'none' },
    DEFAULT_ARCHITECTURAL_PROFILES,
    afterReset,
    gPipe.assignments
  );
  const assignH = resH.assignments.find((a) => a.lineId === ridgeLine.lineId)!;
  assert.equal(assignH.productCode, 'RIDGE-200', 'Wind zone H must select RIDGE-200');
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
  assert.equal(assignRV.productCode, 'RIDGE-RV10P', 'RV10P option must pick RIDGE-RV10P');
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
  assert.ok(
    editedPlaybook.orderPack!.assumptions.ruleSetRevision &&
      !Number.isNaN(Date.parse(editedPlaybook.orderPack!.assumptions.ruleSetRevision)),
    'OrderPack.assumptions.ruleSetRevision must be stamped with a valid ISO timestamp'
  );
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
  assert.equal(strictAbort.stage, 'faces', 'Aborted playbook must report stage === "faces"');
  assert.equal(strictAbort.layout, null, 'Aborted playbook must NOT generate layout');
  assert.equal(strictAbort.bom, null, 'Aborted playbook must NOT generate BOM');
  assert.equal(strictAbort.orderPack, null, 'Aborted playbook must NOT emit OrderPack');
}
console.log('✓ Part E Passed: runTakeoffPlaybook orchestrates full takeoff and aborts cleanly before layout on areaSanity failure.');

// ──────────────────────────────────────────────────────────────────────────────
// PART F — Draw any roof: Void, Mixed Form, Stepped Eaves
// ──────────────────────────────────────────────────────────────────────────────
// F1: Courtyard void stays inside 1 level, rejects exterior centroids, skips hole interior in skeleton & sheet layout
{
  const outer = buildOutlineFromPoints(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 }
    ],
    'out-f1',
    { initialEdgeType: 'outline', defaultEaveHeightM: 2.7 }
  );
  const baseLevel: RoofLevel = {
    id: 'lvl-f1',
    code: 'L1',
    name: 'Main Roof',
    eaveHeightM: 2.7,
    outline: outer,
    skeleton: []
  };

  // Exterior centroid must reject cleanly
  const badVoid = tryAddCourtyardHoleToLevel(baseLevel, [
    { x: 12, y: 2 },
    { x: 14, y: 2 },
    { x: 14, y: 4 },
    { x: 12, y: 4 }
  ]);
  assert.equal(badVoid.ok, false, 'Exterior courtyard void must be rejected');
  if (!badVoid.ok) {
    assert.equal(badVoid.error, 'Void must sit inside the roof.');
  }

  // Interior courtyard void must attach to existing level as 1 hole ring with wall edges & no eaveHeightM
  const goodVoid = tryAddCourtyardHoleToLevel(baseLevel, [
    { x: 3.5, y: 3 },
    { x: 6.5, y: 3 },
    { x: 6.5, y: 5 },
    { x: 3.5, y: 5 }
  ]);
  assert.equal(goodVoid.ok, true, 'Interior courtyard void must succeed');
  if (goodVoid.ok) {
    const holes = goodVoid.level.outline.holes ?? [];
    assert.equal(holes.length, 1, 'Level must contain exactly 1 courtyard hole ring');
    assert.ok(
      holes[0].edges.every((e) => e.type === 'wall'),
      'All courtyard hole edges must be classified as wall'
    );
    assert.ok(
      holes[0].edges.every((e) => e.eaveHeightM === undefined),
      'Courtyard hole edges must not inherit eaveHeightM'
    );

    const skelRes = ensureSkeleton(
      createRoofPipelineState({ levels: [goodVoid.level], planes: [] }),
      { mode: 'auto' }
    );
    const holeInteriorLines = skelRes.state.levels[0].skeleton.filter((s) => {
      const mx = (s.from.x + s.to.x) / 2;
      const my = (s.from.y + s.to.y) / 2;
      return mx > 3.6 && mx < 6.4 && my > 3.1 && my < 4.9;
    });
    assert.equal(holeInteriorLines.length, 0, 'Wavefront skeleton must skip courtyard hole interior');

    const facesRes = ensureFaces(skelRes.state, { defaultPitchDeg: 20 });
    const holeEdgeIds = new Set(holes[0].edges.map((e) => e.id));
    assert.ok(
      facesRes.state.planes.every((p) => !holeEdgeIds.has(p.eaveEdgeId)),
      'No sheeted roof plane may originate from a courtyard hole edge'
    );

    const layoutRes = ensureLayout(facesRes.state, { sheetSpec: SHEET_SPEC, strictDirtyCheck: true });
    assert.ok(layoutRes.layout, 'Courtyard void roof must produce layout');
    const netFootprint = getOutlineFootprintAreaM2(goodVoid.level.outline);
    assert.equal(+netFootprint.toFixed(1), 74.0, 'Net footprint must exclude 6m² courtyard hole');
    assert.ok(
      layoutRes.layout!.totalRoofArea < 82 && layoutRes.layout!.totalRoofArea > 70,
      `Courtyard layout totalRoofArea (${layoutRes.layout!.totalRoofArea.toFixed(1)}m²) must exclude courtyard void`
    );
  }
}

// F2: Typology presets (Hip, Gable, Mono) — edges-only, never run wavefront, never double faces
{
  const quadOutline = buildOutlineFromPoints(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 }
    ],
    'out-f2-quad',
    { initialEdgeType: 'unclassified', defaultEaveHeightM: 2.7 }
  );

  // Hip preset on quad: edges-only -> 4 faces on ensureFaces -> still 4 when built twice
  const hipRes = applyTypologyPresetEdges(quadOutline, 'hipped');
  assert.equal(hipRes.applied, true);
  assert.equal(hipRes.skeleton.length, 0, 'Hip preset must never run wavefront solver');
  assert.ok(hipRes.outline.edges.every((e) => e.type === 'outline'));

  const hipLevel: RoofLevel = {
    id: 'lvl-f2-hip',
    code: 'L1',
    name: 'Hip Test',
    eaveHeightM: 2.7,
    outline: hipRes.outline,
    skeleton: []
  };
  const hipFaces1 = ensureFaces(createRoofPipelineState({ levels: [hipLevel], planes: [] }), {
    defaultPitchDeg: 20,
    allowAutoSkeletonWhenEmpty: true
  });
  assert.equal(hipFaces1.state.planes.length, 4, 'Hipped quad must produce 4 planes');
  const hipFaces2 = ensureFaces(hipFaces1.state, { defaultPitchDeg: 20 });
  assert.equal(hipFaces2.state.planes.length, 4, 'Re-running ensureFaces must never double planes');

  // Gable preset on quad: longer edges -> outline, shorter edges -> verge, 0 hip lines, 2 faces
  const gableRes = applyTypologyPresetEdges(quadOutline, 'gable');
  assert.equal(gableRes.applied, true);
  assert.equal(gableRes.skeleton.length, 0, 'Gable preset must remain edges-only');
  assert.equal(gableRes.outline.edges[0].type, 'outline');
  assert.equal(gableRes.outline.edges[1].type, 'verge');
  assert.equal(gableRes.outline.edges[2].type, 'outline');
  assert.equal(gableRes.outline.edges[3].type, 'verge');

  const gableFaces = ensureFaces(
    createRoofPipelineState({
      levels: [
        {
          id: 'lvl-f2-gable',
          code: 'L1',
          name: 'Gable Test',
          eaveHeightM: 2.7,
          outline: gableRes.outline,
          skeleton: []
        }
      ],
      planes: []
    }),
    { defaultPitchDeg: 20, allowAutoSkeletonWhenEmpty: true }
  );
  assert.equal(
    gableFaces.state.levels[0].skeleton.filter((s) => s.suggestedType === 'hip').length,
    0,
    'Gable roof must produce 0 hip lines'
  );
  assert.equal(gableFaces.state.planes.length, 2, 'Gable quad must produce 2 planes');

  // L-shape gable preset prompts for 2 barges when unpicked, then applies on pick
  const lOutline = buildOutlineFromPoints(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 5, y: 4 },
      { x: 5, y: 8 },
      { x: 0, y: 8 }
    ],
    'out-f2-l',
    { initialEdgeType: 'outline', defaultEaveHeightM: 2.7 }
  );
  const lGablePrompt = applyTypologyPresetEdges(lOutline, 'gable');
  assert.equal(lGablePrompt.applied, false);
  assert.equal(lGablePrompt.needsPick, 'two_barges');

  const lGablePicked = applyTypologyPresetEdges(lOutline, 'gable', {
    bargeEdgeIds: [lOutline.edges[1].id, lOutline.edges[4].id]
  });
  assert.equal(lGablePicked.applied, true);
  assert.equal(lGablePicked.skeleton.length, 0);
  assert.equal(lGablePicked.outline.edges[1].type, 'verge');
  assert.equal(lGablePicked.outline.edges[4].type, 'verge');
  assert.equal(lGablePicked.outline.edges[0].type, 'outline');

  // Mono preset prompts for low_eave -> sets opposite ridge & perpendicular verges -> 1 plane & 0 skel
  const monoPrompt = applyTypologyPresetEdges(quadOutline, 'mono');
  assert.equal(monoPrompt.applied, false);
  assert.equal(monoPrompt.needsPick, 'low_eave');

  const monoApplied = applyTypologyPresetEdges(quadOutline, 'mono', {
    lowEaveEdgeId: quadOutline.edges[0].id
  });
  assert.equal(monoApplied.applied, true);
  assert.equal(monoApplied.skeleton.length, 0, 'Mono preset must remain edges-only');
  assert.equal(monoApplied.outline.edges[0].type, 'outline');
  assert.equal(monoApplied.outline.edges[2].type, 'ridge');
  assert.equal(monoApplied.outline.edges[1].type, 'verge');
  assert.equal(monoApplied.outline.edges[3].type, 'verge');

  const monoFaces = ensureFaces(
    createRoofPipelineState({
      levels: [
        {
          id: 'lvl-f2-mono',
          code: 'L1',
          name: 'Mono Test',
          eaveHeightM: 2.7,
          outline: monoApplied.outline,
          skeleton: []
        }
      ],
      planes: []
    }),
    { defaultPitchDeg: 10, allowAutoSkeletonWhenEmpty: true }
  );
  assert.equal(monoFaces.state.levels[0].skeleton.length, 0, 'Monopitch must keep 0 structural skeleton lines');
  assert.equal(monoFaces.state.planes.length, 1, 'Monopitch must build 1 roof plane');
}

// F3: setEdgeMode edgesOnly never invokes wavefront solver and never mutates sibling edges
{
  const quad = buildOutlineFromPoints(
    [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 5 },
      { x: 0, y: 5 }
    ],
    'out-f3',
    { initialEdgeType: 'outline', defaultEaveHeightM: 2.7 }
  );
  const s1 = setEdgeMode(quad, [], quad.edges[1].id, 'gable', { edgesOnly: true });
  const s2 = setEdgeMode(s1.outline, s1.skeleton, quad.edges[2].id, 'apron', { edgesOnly: true });
  const s3 = setEdgeMode(s2.outline, s2.skeleton, quad.edges[3].id, 'wall', { edgesOnly: true });
  assert.equal(s3.skeleton.length, 0, 'edgesOnly setEdgeMode must leave skeleton untouched');
  assert.equal(s3.outline.edges[0].type, 'outline', 'Sibling eave edge must stay outline');
  assert.equal(s3.outline.edges[1].type, 'verge');
  assert.equal(s3.outline.edges[2].type, 'apron');
  assert.equal(s3.outline.edges[3].type, 'wall');
}

// F4: Stepped eaves — Apply to face / Apply to level only touch outer 'outline' edges, and 3D preserves distinct eave Zs
{
  const base = buildOutlineFromPoints(
    [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 }
    ],
    'out-f4',
    { initialEdgeType: 'outline', defaultEaveHeightM: 2.7 }
  );
  // Make right/left ends verges and add a courtyard hole
  let stepOut = applyEdgeType(base, [base.edges[2].id, base.edges[4].id], 'verge');
  stepOut = addCourtyardHoleToOutline(stepOut, [
    { x: 3.5, y: 2 },
    { x: 6.5, y: 2 },
    { x: 6.5, y: 4 },
    { x: 3.5, y: 4 }
  ]);
  // Give the two colinear front eaves (0..5 and 5..10) stepped heights 2.7m and 3.4m
  stepOut = {
    ...stepOut,
    edges: stepOut.edges.map((e, idx) =>
      idx === 1 ? { ...e, eaveHeightM: 3.4 } : e
    )
  };
  const stepFaces = ensureFaces(
    createRoofPipelineState({
      levels: [{ id: 'lvl-f4', code: 'L1', name: 'Stepped', eaveHeightM: 2.7, outline: stepOut, skeleton: [] }],
      planes: []
    }),
    { defaultPitchDeg: 20, allowAutoSkeletonWhenEmpty: true }
  );

  // Face propagation: targeting edge 0 with 2.9 only updates edge 0 (never edge 3 on opposite side or hole edges)
  const faceProp = applyEaveHeightToFaceEaves(stepOut, stepFaces.state.planes, stepOut.edges[0].id, 2.9);
  assert.equal(faceProp.edges[0].eaveHeightM, 2.9);
  assert.equal(faceProp.edges[3].eaveHeightM, 2.7, 'Opposite face eave must stay 2.7m');
  assert.ok(
    (faceProp.holes?.[0].edges ?? []).every((he) => he.eaveHeightM === undefined),
    'Face eave propagation must never write eaveHeightM onto void holes'
  );

  // Level propagation: touches all outer 'outline' edges ONLY (not verges or holes)
  const lvlProp = applyEaveHeightToLevelEaves(stepOut, 3.8);
  assert.equal(lvlProp.edges[0].eaveHeightM, 3.8);
  assert.equal(lvlProp.edges[1].eaveHeightM, 3.8);
  assert.equal(lvlProp.edges[3].eaveHeightM, 3.8);
  assert.equal(lvlProp.edges[2].eaveHeightM, 2.7, 'Verge edge eaveHeightM must not be overwritten by level eave propagation');
  assert.equal(lvlProp.edges[4].eaveHeightM, 2.7, 'Verge edge eaveHeightM must not be overwritten by level eave propagation');
  assert.ok(
    (lvlProp.holes?.[0].edges ?? []).every((he) => he.eaveHeightM === undefined),
    'Level eave propagation must never touch courtyard void holes'
  );

  // 3D shared vertex elevation check: stepped corner vertices at x=0 (2.7m) vs x=10 (3.4m) stay distinct (~0.7m apart)
  const resolvedStep = resolveLevelSharedVertexElevations(
    stepFaces.state.planes,
    stepFaces.state.levels[0].outline,
    stepFaces.state.levels[0].skeleton,
    2.7
  );
  const leftCorner = resolvedStep.vertices.find((v) => Math.hypot(v.x - 0, v.y - 0) < 0.05);
  const rightCorner = resolvedStep.vertices.find((v) => Math.hypot(v.x - 10, v.y - 0) < 0.05);
  assert.ok(leftCorner && rightCorner, 'Stepped eave corners must resolve in 3D vertex set');
  assert.ok(Math.abs(leftCorner!.z - 2.7) < 0.05, `Left corner Z must stay 2.7m, got ${leftCorner!.z}`);
  assert.ok(Math.abs(rightCorner!.z - 3.4) < 0.05, `Right corner Z must stay 3.4m, got ${rightCorner!.z}`);

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
  const stepScene = buildRoofSceneGroup({
    outline: stepFaces.state.levels[0].outline,
    skeleton: stepFaces.state.levels[0].skeleton,
    planes: stepFaces.state.planes,
    levels: stepFaces.state.levels,
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
    assert.ok(stepScene.selectableMeshes.length >= 1, 'Stepped roof must build valid 3D meshes');
    const yValues: number[] = [];
    stepScene.selectableMeshes.forEach((mesh) => {
      const pos = mesh.geometry.getAttribute('position');
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        yValues.push(pos.getY(i));
      }
    });
    assert.ok(yValues.some((y) => Math.abs(y - 2.7) < 0.08), '3D mesh must retain ~2.7m low eave vertices');
    assert.ok(yValues.some((y) => Math.abs(y - 3.4) < 0.08), '3D mesh must retain ~3.4m stepped eave vertices');
  } finally {
    stepScene.dispose();
  }
}

// F5: From Wall/Eave attached ring stays on same level (parentLevelId), copies host Z only onto chord, and suppresses duplicate abutment walls
{
  let mainOut = buildOutlineFromPoints(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 }
    ],
    'out-main-f5',
    { levelId: 'lvl-main-f5', initialEdgeType: 'outline', defaultEaveHeightM: 2.7 }
  );
  // Host right edge (10,0 -> 10,6) has explicit stepped Z = 3.6m
  const hostEdgeId = mainOut.edges[1].id;
  mainOut = {
    ...mainOut,
    edges: mainOut.edges.map((e) => (e.id === hostEdgeId ? { ...e, eaveHeightM: 3.6 } : e))
  };
  const hostEdge = mainOut.edges[1];

  const wingOut = buildAttachedOutlineFromEdge(
    hostEdge,
    [
      { x: 10, y: 1 },
      { x: 14, y: 1 },
      { x: 14, y: 5 },
      { x: 10, y: 5 }
    ],
    'out-wing-f5',
    { levelId: 'lvl-wing-f5', defaultEaveHeightM: 2.7, initialEdgeType: 'unclassified' }
  );

  const chordEdge = wingOut.edges.find((e) => e.type === 'wall');
  assert.ok(chordEdge, 'Shared colinear wing edge along host must be classified wall');
  assert.equal(chordEdge!.eaveHeightM, 3.6, 'Shared chord must copy host eaveHeightM');
  const outerWingEdges = wingOut.edges.filter((e) => e.id !== chordEdge!.id);
  assert.equal(outerWingEdges.length, 3);
  assert.ok(
    outerWingEdges.every((e) => (e.eaveHeightM ?? 2.7) === 2.7),
    'Outer wing eaves must NOT copy host stepped eaveHeightM'
  );

  const mainLevel: RoofLevel = {
    id: 'lvl-main-f5',
    code: 'L1',
    name: 'Main Roof',
    eaveHeightM: 2.7,
    outline: mainOut,
    skeleton: []
  };
  const wingLevel: RoofLevel = {
    id: 'lvl-wing-f5',
    code: 'L1b',
    name: 'Wing',
    parentLevelId: 'lvl-main-f5',
    eaveHeightM: 2.7,
    outline: wingOut,
    skeleton: []
  };

  const wallPlan = deriveWallPlanFromRoofLevels([mainLevel, wingLevel], 2.7);
  assert.ok(wallPlan, 'Wall plan must derive from parent + attached wing levels');
  const chordFacetsAtX10 = wallPlan!.facets.filter((f) => {
    const midX = (f.from.x + f.to.x) / 2;
    return Math.abs(midX - 10) < 0.35;
  });
  // Verify wing chord facet overlapping host at x≈10 is suppressed (at most 1 facet per span, promoted to abutment)
  assert.ok(
    chordFacetsAtX10.some((f) => f.kind === 'abutment'),
    'Shared host wall segment must be tagged abutment'
  );
  assert.equal(
    chordFacetsAtX10.length,
    1,
    'Duplicate overlapping abutment wall at x≈10 must be suppressed (expected 1 host wall, not 2)'
  );
}
console.log('✓ Part F Passed: Courtyard voids, typology presets (Hip/Gable/Mono), edge-only edits, stepped eaves, and attached same-level wings.');

console.log('ALL ROOF PIPELINE DETERMINISTIC GOLDEN & FLASHING RULE TESTS PASSED! ✓');

