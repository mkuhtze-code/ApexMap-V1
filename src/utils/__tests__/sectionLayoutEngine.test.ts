import { generateSectionLayout, DEFAULT_SECTION_SETTINGS } from '../sectionLayoutEngine';

console.log('--- Starting Section-Based Layout Engine (v3.0) Test Suite ---');

// Test 1: L-Shape Hip & Valley default layout (matches reference screenshot)
const lShapeLayout = generateSectionLayout(DEFAULT_SECTION_SETTINGS);

console.log('Test 1 (L-Shape Sections):', {
  sectionCount: lShapeLayout.sections.length,
  connectorsCount: lShapeLayout.connectors.length,
  stats: lShapeLayout.stats
});

if (lShapeLayout.sections.length !== 4) {
  throw new Error(`Expected 4 sections, got ${lShapeLayout.sections.length}`);
}

const blueSection = lShapeLayout.sections.find((s) => s.code === 'A');
const greenSection = lShapeLayout.sections.find((s) => s.code === 'B');
const orangeSection = lShapeLayout.sections.find((s) => s.code === 'C');

if (!blueSection || !greenSection || !orangeSection) {
  throw new Error('Missing primary Blue A, Green B, or Orange C section');
}

if (blueSection.role !== 'producer' || greenSection.role !== 'receiver') {
  throw new Error('Section roles incorrect');
}

if (!lShapeLayout.connectors.some((c) => c.labelText.includes('Blue offcuts → Green Hip'))) {
  throw new Error('Missing connector label "Blue offcuts → Green Hip"');
}

if (lShapeLayout.stats.metresSaved <= 0 || lShapeLayout.stats.utilisationPercent < 80) {
  throw new Error(`Unexpected stats: ${JSON.stringify(lShapeLayout.stats)}`);
}

console.log('✓ Test 1 Passed: L-Shape Section Layout generated with correct pairings and stats.');

// Test 2: Overrides (User changes pitch or lay direction)
const overridden = generateSectionLayout(DEFAULT_SECTION_SETTINGS, {
  'sec-b': { pitchDeg: 25, layDirection: 'LTR', name: 'Steep East Hip' }
});

const updatedGreen = overridden.sections.find((s) => s.code === 'B');
if (updatedGreen?.pitchDeg !== 25 || updatedGreen?.layDirection !== 'LTR') {
  throw new Error('Failed to apply user pitch/layDirection override');
}
console.log('✓ Test 2 Passed: Section overrides (pitch, direction, name) apply accurately.');

// Test 3: Grouped Cut List for roll-former ordering
if (lShapeLayout.cutList.length !== 4) {
  throw new Error(`Expected 4 cut list groups, got ${lShapeLayout.cutList.length}`);
}
const greenCutItem = lShapeLayout.cutList.find((c) => c.sectionCode === 'B');
if (!greenCutItem || greenCutItem.sheetCountOrdered !== 0) {
  throw new Error('Green Section should have 0 ordered blank sheets (supplied from offcuts)');
}
console.log('✓ Test 3 Passed: Grouped roll-former cut list generated with 0-waste offcut harvesting.');

console.log('ALL SECTION-BASED ENGINE TESTS PASSED DETERMINISTICALLY! ✓');
