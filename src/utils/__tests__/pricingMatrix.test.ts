import { describe, it } from 'node:test';
import assert from 'node:assert';
import { 
  calculateDynamicTrayPrice, 
  calculateDynamicFlashingPrice, 
  recalculateQuoteWithDynamicMatrix 
} from '../pricingMatrix';
import { INITIAL_PRICING_CATALOGUE } from '../../data/pricingCatalogue';
import { Quote } from '../../types/crm';

console.log('--- Starting Modular Dynamic Pricing Matrix Test Suite ---');

// Test 1: Tray dynamic rate calculation for Super Seam 38mm in Vitor+ at 450mm
const tray450 = calculateDynamicTrayPrice(
  'Archtech Super Seam 38mm' as any,
  'Kiwicolour® Vitor+ PVDF (The Roofing Store)' as any,
  450,
  INITIAL_PRICING_CATALOGUE
);
console.log('Test 1: Tray at 450mm pan:', {
  pricePerLm: tray450.pricePerLm,
  pricePerM2: tray450.pricePerM2,
  blankWidthMm: tray450.blankWidthMm
});
assert.strictEqual(tray450.pricePerLm, 34.50, 'Standard 450mm tray should equal catalogue baseline $34.50');
assert.strictEqual(tray450.blankWidthMm, 538, 'Blank width should be 450 + 88 = 538mm');

// Test 2: Changing pan size to 300mm recalculates pricePerLm and pricePerM2 automatically
const tray300 = calculateDynamicTrayPrice(
  'Archtech Super Seam 38mm' as any,
  'Kiwicolour® Vitor+ PVDF (The Roofing Store)' as any,
  300,
  INITIAL_PRICING_CATALOGUE
);
console.log('Test 2: Tray at 300mm pan:', {
  pricePerLm: tray300.pricePerLm,
  pricePerM2: tray300.pricePerM2,
  blankWidthMm: tray300.blankWidthMm
});
assert.ok(tray300.pricePerLm < tray450.pricePerLm, '300mm tray should have lower linear metre cost due to narrower blank width');
assert.strictEqual(tray300.blankWidthMm, 388, 'Blank width for 300mm pan should be 300 + 88 = 388mm');
assert.ok(tray300.pricePerM2 > tray450.pricePerM2, '300mm tray requires more seams per m2 (3.33 lm/m2 vs 2.22 lm/m2), so m2 rate is higher');

// Test 3: Flashing dynamic rate calculation (Type + Material + Girth + Folds)
const flashingApron = calculateDynamicFlashingPrice(
  'Apron / Abutment Flashing' as any,
  'Kiwicolour® Vitor+ PVDF (The Roofing Store)' as any,
  '301-450mm',
  3,
  INITIAL_PRICING_CATALOGUE
);
console.log('Test 3: Apron Flashing (301-450mm, 3 folds):', flashingApron);
assert.strictEqual(flashingApron.baseRatePerLm, 39.00, 'Baseline 301-450mm Vitor+ flashing should be $39.00/lm');
assert.strictEqual(flashingApron.extraFoldsAdder, 0, 'No extra folds for 3 folds');

const flashingRidgeVent = calculateDynamicFlashingPrice(
  'Ridge Cap Vent' as any,
  'Kiwicolour® Vitor+ PVDF (The Roofing Store)' as any,
  '301-450mm',
  5, // 2 extra folds
  INITIAL_PRICING_CATALOGUE
);
console.log('Test 3b: Ventilated Ridge Cap (301-450mm, 5 folds + vent mesh):', flashingRidgeVent);
assert.strictEqual(flashingRidgeVent.extraFoldsAdder, 7.00, '2 extra folds at $3.50 each should equal $7.00');
assert.strictEqual(flashingRidgeVent.specializedTypeAdder, 5.50, 'Ventilated ridge adds $5.50 for mesh baffle');
assert.strictEqual(flashingRidgeVent.pricePerLm, 51.50, 'Total should be 39.00 + 7.00 + 5.50 = 51.50');

// Test 4: Dynamic quote recalculation on an open quote creates a new dated version
const mockQuote: any = {
  id: 'q-test-1',
  quoteNumber: 'ARCH-Q-2026-999-v1',
  baseQuoteNumber: 'ARCH-Q-2026-999',
  version: 1,
  status: 'sent',
  isLocked: false,
  issueDate: '2026-10-01',
  validUntil: '2026-10-31',
  roofAreaM2: 250,
  profile: 'Archtech Super Seam 38mm' as any,
  material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)' as any,
  colorName: 'FlaxPod',
  markupPercent: 15,
  marginPercent: 13,
  scopeZones: [
    {
      id: 'sz-1',
      title: 'Main Roof',
      application: 'Roofing',
      profile: 'Archtech Super Seam 38mm' as any,
      material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)' as any,
      colorName: 'FlaxPod',
      areaM2: 250,
      trayPanWidthMm: 450,
      calculatedLinearMetres: 555.5,
      ratePerLm: 39.68,
      totalNZD: 22042.24,
      pitchDegrees: 5
    }
  ],
  flashings: [
    {
      id: 'fl-1',
      name: 'Ridge Vent',
      type: 'Ridge Cap Vent' as any,
      girthTier: '301-450mm',
      material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)' as any,
      lengthLm: 20,
      foldsCount: 3,
      baseRatePerLm: 39.00,
      extraFoldRatePerLm: 0,
      calculatedRatePerLm: 39.00,
      totalNZD: 897.00
    }
  ],
  subtotalNZD: 22939.24,
  gstNZD: 3440.89,
  totalNZD: 26380.13,
  clientName: 'Test Client',
  clientEmail: 'test@example.com',
  clientPhone: '021 111 222',
  architect: 'Test Studio',
  siteAddress: '10 Queen St, Auckland',
  region: 'Auckland',
  windZone: 'High' as any,
  exposureZone: 'Zone C (Medium)' as any,
  accessDifficulty: 'Single Storey Easy' as any,
  createdAt: '2026-10-01',
  expiresAt: '2026-10-31'
};

const recalcResult = recalculateQuoteWithDynamicMatrix(
  mockQuote,
  INITIAL_PRICING_CATALOGUE,
  {
    material: 'The Roofing Store MagnaFlow®' as any,
    panWidthMm: 400
  }
);

console.log('Test 4: Recalculated quote versioning:', {
  oldQuoteStatus: recalcResult.updatedPreviousQuote?.status,
  newQuoteNumber: recalcResult.newQuote.quoteNumber,
  newQuoteVersion: recalcResult.newQuote.version,
  newMaterial: recalcResult.newQuote.material,
  newTotal: recalcResult.newQuote.totalNZD
});

assert.strictEqual(recalcResult.updatedPreviousQuote?.status, 'superseded', 'Old quote must be marked superseded');
assert.strictEqual(recalcResult.newQuote.version, 2, 'New quote must be version 2');
assert.strictEqual(recalcResult.newQuote.quoteNumber, 'ARCH-Q-2026-999-v2', 'New quote number must end with -v2');
assert.strictEqual(recalcResult.newQuote.material, 'The Roofing Store MagnaFlow®');
assert.strictEqual(recalcResult.newQuote.roofAreaM2, 250, 'Raw roof area quantity must remain identical');

// Test 5: Legal Lock on Accepted Quote
const acceptedQuote: Quote = {
  ...mockQuote,
  status: 'accepted',
  isLocked: true
};

assert.throws(
  () => {
    recalculateQuoteWithDynamicMatrix(acceptedQuote, INITIAL_PRICING_CATALOGUE);
  },
  /Accepted quotes are legally locked/,
  'Accepted quotes must be legally locked against matrix recalculations'
);
console.log('Test 5: Legal lock verified on accepted quote ✓');

console.log('ALL 5 MODULAR DYNAMIC PRICING MATRIX TESTS PASSED DETERMINISTICALLY! ✓');
