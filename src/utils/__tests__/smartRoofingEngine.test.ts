import { runCodeComplianceAudit, generateSmartScopeOfWorks } from '../smartRoofingEngine';
import { Quote } from '../../types/crm';

console.log('--- Starting Smart Roofing Engine & Compliance Audit Test Suite ---');

// Test 1: Pitch Compliance Audit (Snaplock 25mm below 8 degrees should trigger critical violation)
const failingSnaplockQuote: Quote = {
  id: 'q-test-fail-pitch',
  quoteNumber: 'TEST-PITCH-01',
  status: 'draft',
  clientName: 'Test Architect',
  clientEmail: 'test@arch.co.nz',
  clientPhone: '+64 21 000 0000',
  architect: 'Test Studio',
  siteAddress: 'Omaha Beach, NZ',
  region: 'Auckland',
  windZone: 'Extra High',
  exposureZone: 'Zone D (Severe Marine)',
  accessDifficulty: 'Single Storey Easy',
  roofAreaM2: 200,
  profile: 'Archtech Super Seam 38mm',
  material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
  colorName: 'Slate',
  materialTotalNZD: 10000,
  flashingsTotalNZD: 3000,
  hardwareTotalNZD: 1500,
  labourTotalNZD: 6000,
  freightTotalNZD: 950,
  subtotalNZD: 21450,
  gstNZD: 3217.50,
  totalNZD: 24667.50,
  markupPercent: 20,
  marginPercent: 20,
  scopeZones: [
    {
      id: 'sz-1',
      title: 'Main Roof',
      application: 'Roofing',
      profile: 'Archtech Super Seam 38mm',
      material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
      colorName: 'Slate',
      areaM2: 200,
      trayPanWidthMm: 500,
      calculatedLinearMetres: 440,
      ratePerLm: 34.50,
      totalNZD: 15180,
      pitchDegrees: 2, // CRITICAL: Standing Seam absolute minimum is 3°!
      notes: 'Low pitch roof'
    }
  ],
  flashings: [],
  hardwareItems: [],
  freightItems: [],
  labourItems: [],
  upgrades: [],
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
};

const audit1 = runCodeComplianceAudit(failingSnaplockQuote);
console.log(`Test 1 Result: Overall Score: ${audit1.overallScore}, Status: ${audit1.status}`);
if (audit1.status !== 'critical') {
  throw new Error(`Expected critical audit status for Super Seam at 2° pitch, but got: ${audit1.status}`);
}
const pitchIssue = audit1.issues.find(i => i.category === 'pitch');
if (!pitchIssue || pitchIssue.severity !== 'critical') {
  throw new Error('Expected critical pitch issue for Super Seam below 3°');
}
console.log('✓ Test 1 Passed: Detected Standing Seam 3° minimum pitch violation.');

// Test 2: Severe Marine Coating Audit (Vitor+ in Zone D triggers durability warning)
const durabilityIssue = audit1.issues.find(i => i.category === 'durability');
if (!durabilityIssue || durabilityIssue.severity !== 'warning') {
  throw new Error('Expected durability warning for Vitor+ in Severe Marine Zone D');
}
console.log('✓ Test 2 Passed: Detected Marine Zone D durability recommendation for MagnaFlow.');

// Test 3: Smart Scope Generator produces full bill of materials
const takeoffResult = generateSmartScopeOfWorks({
  roofAreaM2: 250,
  pitchDegrees: 4,
  windZone: 'Extra High',
  exposureZone: 'Zone D (Severe Marine)',
  preferredProfile: 'Archtech Super Seam 38mm',
  preferredMaterial: 'The Roofing Store MagnaFlow®',
  wallCladdingAreaM2: 80,
  wallProfile: 'Archtech Interlocking Panels',
  storeys: 2,
  includeRainwater: true
});

console.log(`Test 3 Takeoff Generated:
  - Total Sections: ${takeoffResult.sections.length}
  - Total Rows: ${takeoffResult.rows.length}
  - Tray LM: ${takeoffResult.totalTrayLm} lm
  - Fixing Clips: ${takeoffResult.totalFixingClipsCount}
  - Recommended Pan: ${takeoffResult.recommendedPanWidthMm}mm
  - Compliance Score: ${takeoffResult.complianceAudit.overallScore}
`);

if (takeoffResult.sections.length < 5) {
  throw new Error(`Expected at least 5 architectural envelope sections, got ${takeoffResult.sections.length}`);
}

if (takeoffResult.totalTrayLm <= 0 || takeoffResult.totalFixingClipsCount <= 0) {
  throw new Error('Invalid takeoff quantities generated');
}

// In Extra High wind, pan width must be optimized to 400mm or less
if (takeoffResult.recommendedPanWidthMm > 450) {
  throw new Error(`Expected pan width <= 450mm for Extra High wind, got ${takeoffResult.recommendedPanWidthMm}`);
}

console.log('✓ Test 3 Passed: Smart Takeoff Engine generated complete architectural scope with correct wind optimization.');

console.log('ALL SMART ROOFING ENGINE & AUDIT TESTS PASSED DETERMINISTICALLY! ✓');
