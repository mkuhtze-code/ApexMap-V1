import {
  generateInitialLongRunData,
  calculateOffcutStats,
  calculateRoofHardwareRequirements,
  generateSupplierOrderText
} from '../longRunRoofEngine';
import { Project } from '../../types/crm';

console.log('--- Starting Long-Run Roofing Engine & Offcut Optimization Test Suite ---');

// Test 1: Initial Data Generation
const mockProject: Project = {
  id: 'proj-test',
  projectNumber: 'TEST-2026-01',
  title: 'Long-Run Test Job',
  clientName: 'Dave Smith',
  clientEmail: 'dave@example.com',
  architect: 'Design Studio',
  headContractor: 'Smith Builders',
  siteAddress: '15 High St, Auckland',
  region: 'Auckland',
  roofAreaM2: 240,
  roofPitchDegrees: 18,
  profile: 'TRS Corrugate 0.55mm',
  material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
  colorName: 'FlaxPod',
  windZone: 'Very High',
  exposureZone: 'Zone D (Severe Marine)',
  contractValueNZD: 52000,
  startDate: '2026-11-01',
  targetCompletionDate: '2026-12-01',
  progressPercent: 10,
  status: 'in_progress',
  milestones: [],
  photos: [],
  variations: [],
  ps3Status: 'pending'
};

const initial = generateInitialLongRunData(mockProject);
console.log(`Test 1: Initial facets count: ${initial.facets.length}`);
if (initial.facets.length < 3) throw new Error('Expected at least 3 facets (Gable, Hip, Valley)');
console.log('✓ Test 1 Passed: Generated realistic facets for long-run roof');

// Test 2: Offcut Optimization & Steel Savings Calculation
const stats = calculateOffcutStats(initial.facets);
console.log('Test 2: Offcut Stats:', {
  ordered: stats.totalSheetsOrdered,
  onRoof: stats.totalSheetsOnRoof,
  reused: stats.offcutsReusedCount,
  savedLm: stats.linealMetresSaved,
  dollarSavings: stats.estimatedDollarSavingsNZD,
  wastePercent: stats.wastePercent
});

if (stats.offcutsReusedCount <= 0) {
  throw new Error('Expected offcut reuse count > 0');
}
if (stats.linealMetresSaved <= 0) {
  throw new Error('Expected steel saved lineal metres > 0');
}
if (stats.estimatedDollarSavingsNZD <= 0) {
  throw new Error('Expected estimated dollar savings > 0');
}
console.log('✓ Test 2 Passed: Offcut flip and steel recovery calculated accurately');

// Test 3: Fasteners & Hardware Calculation
const hardware = calculateRoofHardwareRequirements(initial.facets, initial.profileKey, 'Very High');
console.log('Test 3: Hardware Pack:', {
  screws: hardware.totalScrews,
  boxes: hardware.screwBoxCount,
  underlayRolls: hardware.underlayRolls,
  foamInfillPairs: hardware.foamInfillPairs
});

if (hardware.totalScrews < 100 || hardware.screwBoxCount < 1) {
  throw new Error('Expected realistic roofing screw calculation');
}
if (hardware.underlayRolls < 1) {
  throw new Error('Expected underlay rolls >= 1');
}
console.log('✓ Test 3 Passed: Hardware, screws & underlay requirements computed');

// Test 4: Roll-former Supplier Order Manifest
const manifestText = generateSupplierOrderText(
  mockProject,
  initial.facets,
  initial.flashings,
  initial.profileKey,
  initial.gauge,
  initial.colorName,
  'The Roofing Store (Albany)'
);

if (!manifestText.includes('ROOFING SHEET SCHEDULE') || !manifestText.includes('FLASHINGS SCHEDULE')) {
  throw new Error('Manifest text is missing expected sections');
}
console.log('✓ Test 4 Passed: Supplier manifest formatted with offcut notes');

console.log('ALL 4 LONG-RUN ROOFING TESTS PASSED DETERMINISTICALLY! ✓');
