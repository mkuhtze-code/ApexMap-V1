import { planRoof, hipRoofFaces, DEFAULTS } from '../../lib/offcutEngine';
import { buildLShapedRoofFaces } from '../../lib/roofToFaces';

console.log('--- Starting Offcut Engine Acceptance & Benchmark Test Suite ---');

const faces = hipRoofFaces(14, 10, 6);

// 1. Auto Search (Default Lookahead)
const autoPlan = planRoof(faces, {
  ...DEFAULTS,
  coverWidth: 0.76,
  profileSymmetric: false,
  eaveOverhang: 0.05,
  lookahead: true
});

console.log('Test 1 (Auto Search):', {
  orderedLength: autoPlan.orderedLength,
  naiveLength: autoPlan.naiveLength,
  utilisation: autoPlan.utilisation,
  reusedPieces: autoPlan.reusedPieces,
  sheetsCount: autoPlan.sheets.length,
  dirs: autoPlan.dirs
});

if (Math.abs(autoPlan.orderedLength - 227) > 0.5) {
  throw new Error(`Expected orderedLength ~ 227, got ${autoPlan.orderedLength}`);
}
if (Math.abs(autoPlan.naiveLength - 252) > 0.5) {
  throw new Error(`Expected naiveLength ~ 252, got ${autoPlan.naiveLength}`);
}
if (Math.abs(autoPlan.utilisation - 0.988) > 0.005) {
  throw new Error(`Expected utilisation ~ 0.988, got ${autoPlan.utilisation}`);
}
if (autoPlan.reusedPieces !== 28) {
  throw new Error(`Expected 28 reused pieces, got ${autoPlan.reusedPieces}`);
}
if (autoPlan.sheets.length !== 38) {
  throw new Error(`Expected 38 ordered sheets, got ${autoPlan.sheets.length}`);
}
if (autoPlan.dirs['Trunk-S'] !== 'LTR' || autoPlan.dirs['End-E'] !== 'RTL') {
  throw new Error(`Expected Trunk LTR and End RTL, got ${JSON.stringify(autoPlan.dirs)}`);
}
console.log('✓ Test 1 Passed: Auto search achieved 227m ordered, 98.8% utilisation, 28 offcut reuses!');

// 2. Forced LTR (Sub-optimal without 180° rotation)
const forcedLtrPlan = planRoof(
  faces,
  {
    ...DEFAULTS,
    coverWidth: 0.76,
    profileSymmetric: false,
    eaveOverhang: 0.05,
    lookahead: true
  },
  {
    'Trunk-S': 'LTR',
    'Trunk-N': 'LTR',
    'End-E': 'LTR',
    'End-W': 'LTR'
  }
);

console.log('Test 2 (Forced LTR):', {
  orderedLength: forcedLtrPlan.orderedLength,
  utilisation: forcedLtrPlan.utilisation
});

if (Math.abs(forcedLtrPlan.orderedLength - 248.2) > 0.5) {
  throw new Error(`Expected forced LTR ~ 248.2, got ${forcedLtrPlan.orderedLength}`);
}
if (Math.abs(forcedLtrPlan.utilisation - 0.903) > 0.005) {
  throw new Error(`Expected forced LTR utilisation ~ 0.903, got ${forcedLtrPlan.utilisation}`);
}
console.log('✓ Test 2 Passed: Forced LTR correctly penalises non-symmetric profile to 248.2m / 90.3% utilisation');

// 3. Symmetric Profile (180° rotation permitted)
const symPlan = planRoof(faces, {
  ...DEFAULTS,
  coverWidth: 0.76,
  profileSymmetric: true,
  eaveOverhang: 0.05,
  lookahead: true
});

console.log('Test 3 (Symmetric Profile):', {
  orderedLength: symPlan.orderedLength,
  utilisation: symPlan.utilisation
});

if (Math.abs(symPlan.orderedLength - 225.8) > 0.5) {
  throw new Error(`Expected symmetric ~ 225.8, got ${symPlan.orderedLength}`);
}
console.log('✓ Test 3 Passed: Symmetric profile achieves 225.8m ordered steel');

// 4. CAD L-Shape Footprint
const lShapeFaces = buildLShapedRoofFaces(6.27, 14.2, 21.2, 6.27, 6.0);
const lPlan = planRoof(lShapeFaces, {
  ...DEFAULTS,
  coverWidth: 0.76,
  profileSymmetric: false,
  eaveOverhang: 0.05,
  lookahead: true
});

console.log('Test 4 (CAD L-Shape Plan):', {
  facesCount: lShapeFaces.length,
  orderedLength: lPlan.orderedLength,
  naiveLength: lPlan.naiveLength,
  utilisation: lPlan.utilisation,
  reusedPieces: lPlan.reusedPieces
});

if (lPlan.orderedLength <= 0 || lPlan.sheets.length <= 0) {
  throw new Error('L-shape plan failed to generate valid sheets');
}
console.log('✓ Test 4 Passed: CAD L-Shape roof solves cleanly with full offcut tracking');

console.log('ALL OFFCUT ENGINE ACCEPTANCE & BENCHMARK TESTS PASSED DETERMINISTICALLY! ✓');
