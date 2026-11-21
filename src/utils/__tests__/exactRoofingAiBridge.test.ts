import assert from 'node:assert/strict';
import {
  buildAutoFlashingAssignments,
  buildCalmStageGuidance,
  computeIdealUnderlapSideForPlane,
  getMinimumPitchForProfile,
  normalizeAndVerifyAiRoofOutline,
  runDeterministicRoofAudit
} from '../exactRoofingAiBridge';
import {
  generateCuttingLayout,
  generateSkeletonLines,
  getAssignableRoofLinesMultiLevel,
  getPresetOutline,
  syncMultiLevelPlanes
} from '../exactRoofingEngine';
import { buildOrderPack, computeRoofingPacks } from '../exactRoofingBomBridge';
import { evaluateTakeoffCompleteness } from '../takeoffCompleteness';
import { RoofLevel, SheetSpec } from '../../types/exactRoofing';
import { DEFAULT_ARCHITECTURAL_PROFILES } from '../sheetMetalGeometry';

const sheetSpec: SheetSpec = {
  coverWidth: 0.762,
  maxLength: 6.0,
  endLap: 0.15,
  overhang: 0.05
};

// 1. Test AI Polygon Closed-Loop Orthogonalization & Micro-Vertex Cleanup
{
  // Slightly skewed near-rectangular L-shape from Vision scan + tiny 0.2m noise vertex
  const noisyRaw = [
    { x: 0.1, y: 0.1 },
    { x: 14.0, y: 0.32 }, // ~0.9 deg skew -> snaps horizontal
    { x: 14.08, y: 8.0 }, // ~0.6 deg skew -> snaps vertical
    { x: 8.0, y: 8.15 },
    { x: 7.9, y: 12.0 },
    { x: 4.0, y: 12.0 }, // Collinear along bottom edge -> simplified cleanly
    { x: 0.05, y: 12.05 }
  ];
  const verified = normalizeAndVerifyAiRoofOutline(noisyRaw, 22.5);
  assert.ok(verified.points.length >= 5, 'Preserves L-shape outer corners');
  assert.ok(verified.skeleton.length >= 3, 'Generates valid roof skeleton lines');
  assert.ok(verified.repairsApplied.length > 0, 'Logs geometric snap & cleanup repairs');
  assert.equal(verified.pitchDeg, 22.5);
}

// 2. Test Profile Minimum Pitch Rules (NZMRM Code of Practice)
{
  assert.equal(getMinimumPitchForProfile('TRS Corrugate 0.55mm'), 8);
  assert.equal(getMinimumPitchForProfile('TRS Plumbdeck Trapezoidal 0.55mm'), 3);
  assert.equal(getMinimumPitchForProfile('Archtech Super Seam 38mm'), 1.5);
}

// 3. Test Deterministic Self-Audit Catching Low Pitch + Wind Side-Lap + Unassigned Flashings
{
  const outline = getPresetOutline('rectangle_14x10');
  const skeleton = generateSkeletonLines(outline);
  const levels: RoofLevel[] = [
    {
      id: 'level-1',
      code: 'L1',
      name: 'Main Roof',
      eaveHeightM: 2.7,
      outline,
      skeleton
    }
  ];
  // Force shallow 4° pitch (fails Corrugate 8° minimum) & uniform 'left' underlaps
  const planes = syncMultiLevelPlanes(levels, [], 4).map((p) => ({
    ...p,
    underlapSide: 'left' as const
  }));
  const layout = generateCuttingLayout(planes, sheetSpec);
  const assignableLines = getAssignableRoofLinesMultiLevel(levels, planes, [], []);

  const report = runDeterministicRoofAudit({
    planes,
    levels,
    layout,
    sheetSpec,
    assignableLines,
    flashingAssignments: [],
    profileName: 'TRS Corrugate 0.55mm',
    windZone: 'Very High',
    prevailingWind: 'SW'
  });

  assert.equal(report.status, 'Action Required');
  assert.ok(
    report.recommendedPatches.some((p) => p.op === 'set_plane_pitch' && p.valueNumber === 8),
    'Detects Corrugate sub-8 degree pitch and proposes exact 8° fix patch'
  );
  assert.ok(
    report.recommendedPatches.some((p) => p.op === 'set_plane_direction'),
    'Detects exposed wind side-lap and proposes flip patch'
  );
  assert.ok(
    report.recommendedPatches.some((p) => p.op === 'auto_assign_flashings'),
    'Detects unassigned ridge/hip flashings and proposes auto-assign patch'
  );

  // Check auto-assignment matches NZ profiles across all critical roof lines
  const autoFlashings = buildAutoFlashingAssignments({
    assignableLines,
    existingAssignments: [],
    libraryProfiles: DEFAULT_ARCHITECTURAL_PROFILES,
    material: '0.55mm ColorCote Vitor+',
    colorName: 'FlaxPod'
  });
  const criticalLinesCount = assignableLines.filter((l) => l.flashingKind !== 'eave').length;
  assert.equal(autoFlashings.length, criticalLinesCount, 'Auto-assigns every critical roof flashing line');
}

// 4. Test Ideal Wind Underlap Symmetry on Opposing Roof Slopes
{
  const outline = getPresetOutline('rectangle_14x10');
  const skeleton = generateSkeletonLines(outline);
  const levels: RoofLevel[] = [
    { id: 'level-1', code: 'L1', name: 'Main Roof', eaveHeightM: 2.7, outline, skeleton }
  ];
  const planes = syncMultiLevelPlanes(levels, [], 22.5);
  const southSlope = planes[0];
  const northSlope = planes[2];
  assert.notEqual(
    computeIdealUnderlapSideForPlane(southSlope, 'W'),
    computeIdealUnderlapSideForPlane(northSlope, 'W'),
    'Opposing North vs South slopes mirror their leeward side-lap direction against West wind'
  );
}

// 5. Test Calm Stage Guidance across Quote, Measure, and Install modes
{
  const outline = getPresetOutline('rectangle_14x10');
  const skeleton = generateSkeletonLines(outline);
  const levels: RoofLevel[] = [
    { id: 'level-1', code: 'L1', name: 'Main Roof', eaveHeightM: 2.7, outline, skeleton }
  ];
  const planes = syncMultiLevelPlanes(levels, [], 22.5);
  const layout = generateCuttingLayout(planes, sheetSpec);
  const assignableLines = getAssignableRoofLinesMultiLevel(levels, planes, [], []);
  const packs = computeRoofingPacks({ planes, layout });
  const completenessBlocked = evaluateTakeoffCompleteness({
    levels,
    planes,
    assignableLines,
    flashingAssignments: [],
    wallPlan: null,
    assets: []
  });
  const pack = buildOrderPack({
    planes,
    levels,
    layout,
    assignableLines,
    assignments: [],
    completenessReport: completenessBlocked
  });

  const quoteGuide = buildCalmStageGuidance({
    stage: 'quoting',
    planes,
    layout,
    orderPack: pack,
    completenessReport: completenessBlocked
  });
  assert.equal(quoteGuide.stage, 'quoting');
  assert.ok(quoteGuide.actions.length >= 1 && quoteGuide.actions.length <= 3);

  const measureGuide = buildCalmStageGuidance({
    stage: 'measuring',
    planes,
    layout,
    orderPack: pack,
    completenessReport: completenessBlocked
  });
  assert.equal(measureGuide.statusTone, 'blocked');
  assert.ok(measureGuide.actions.some((a) => a.kind === 'fix_issue'));

  const installGuide = buildCalmStageGuidance({
    stage: 'installing',
    measureLocked: true,
    planes,
    layout,
    orderPack: pack,
    roofingPacks: packs,
    completedPlaneIds: packs[0] ? [packs[0].planeId] : []
  });
  assert.equal(installGuide.stage, 'installing');
  assert.ok(!installGuide.headline.includes('$') && !installGuide.summary.includes('$'));
  if (packs.length > 1) {
    assert.ok(installGuide.headline.includes(packs[1].code), 'Advances next pack when Pack #1 is completed');
  }
}

// 6. Test Deterministic Batch Multi-Apply Audit Patches (Mixed Pitch + Unclassified Edges) & Zero Pricing
{
  const outline = getPresetOutline('rectangle_14x10');
  const mixedEdgesOutline = {
    ...outline,
    edges: outline.edges.map((e, idx) => (idx >= 2 ? { ...e, type: 'unclassified' as const } : e))
  };
  const skeleton = generateSkeletonLines(mixedEdgesOutline);
  const levels: RoofLevel[] = [
    { id: 'level-batch', code: 'L1', name: 'Main Roof', eaveHeightM: 2.7, outline: mixedEdgesOutline, skeleton }
  ];
  const basePlanes = syncMultiLevelPlanes(levels, [], 22.5);
  const mixedPlanes = basePlanes.map((p, idx) => (idx === 0 ? { ...p, pitchDeg: 15 } : p));
  const layout = generateCuttingLayout(mixedPlanes, sheetSpec);
  const assignableLines = getAssignableRoofLinesMultiLevel(levels, mixedPlanes, [], []);

  const report = runDeterministicRoofAudit({
    planes: mixedPlanes,
    levels,
    layout,
    sheetSpec,
    assignableLines,
    flashingAssignments: [],
    profileName: 'TRS Plumbdeck Trapezoidal 0.55mm',
    windZone: 'Very High',
    prevailingWind: 'SW'
  });

  const batchPitchPatch = report.recommendedPatches.find((p) => p.op === 'batch_plane_pitch');
  const batchEdgePatch = report.recommendedPatches.find((p) => p.op === 'batch_classify_edges');

  assert.ok(batchPitchPatch, 'Detects mixed pitch on level and emits batch_plane_pitch patch');
  assert.ok((batchPitchPatch?.targetIds?.length || 0) >= 2, 'batch_plane_pitch targets all main level faces');
  assert.ok(batchEdgePatch, 'Detects unclassified perimeter edges alongside classified eaves and emits batch_classify_edges');
  assert.equal(batchEdgePatch?.targetIds?.length, 2, 'batch_classify_edges targets exactly the 2 unclassified edges');

  report.recommendedPatches.forEach((patch) => {
    assert.ok(!patch.label.includes('$') && !patch.reason.includes('$'), 'Recommended patches must never include $ pricing');
  });
  report.findings.forEach((f) => {
    assert.ok(!f.title.includes('$') && !f.detail.includes('$'), 'Audit findings must never include $ pricing');
  });

  const guide = buildCalmStageGuidance({
    stage: 'quoting',
    planes: mixedPlanes,
    layout,
    auditReport: report
  });
  assert.ok(!guide.headline.includes('$') && !guide.summary.includes('$') && !guide.metricsLine.includes('$'));
}

console.log('✓ All exactRoofingAiBridge deterministic + AI verification tests passed!');
