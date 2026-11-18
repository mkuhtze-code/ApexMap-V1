import { 
  RoofingProfile, 
  CoilMaterial, 
  FlashingGirthTier, 
  FlashingType, 
  MasterPricingCatalogue,
  Quote,
  QuoteAuditEntry 
} from '../types/crm';
import { calculateQuoteValidUntil, generateClientQuoteToken } from './quoteVersioning';

// ============================================================================
// MODULAR & DYNAMIC PRICING MATRIX SPECIFICATIONS
// ============================================================================

export interface MaterialPricingDef {
  material: CoilMaterial;
  code: string;
  gaugeBand: '0.40mm' | '0.55mm' | '0.70mm' | '0.80mm' | '0.90mm' | '0.6mm';
  baseFlatSheetRatePerM2: number; // Flat unformed sheet wholesale rate $/m2
  materialFactor: number;
  extraFoldCostPerLm: number;
  warrantyYears: number;
  supplier: string;
}

export const MODULAR_COIL_MATERIALS: MaterialPricingDef[] = [
  {
    material: 'Kiwicolour® Vitor+ 0.40mm (Residential Long-Run)',
    code: 'VIT40',
    gaugeBand: '0.40mm',
    baseFlatSheetRatePerM2: 32.00,
    materialFactor: 0.85,
    extraFoldCostPerLm: 2.50,
    warrantyYears: 20,
    supplier: 'The Roofing Store Ltd'
  },
  {
    material: 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
    code: 'VIT',
    gaugeBand: '0.55mm',
    baseFlatSheetRatePerM2: 42.00,
    materialFactor: 1.0,
    extraFoldCostPerLm: 3.00,
    warrantyYears: 30,
    supplier: 'The Roofing Store Ltd'
  },
  {
    material: 'Kiwicolour® Zenex+ Extreme Coastal (VitorZX)',
    code: 'ZNX',
    gaugeBand: '0.55mm',
    baseFlatSheetRatePerM2: 50.40,
    materialFactor: 1.20,
    extraFoldCostPerLm: 3.50,
    warrantyYears: 35,
    supplier: 'The Roofing Store Ltd'
  },
  {
    material: 'Duralume® Architectural Alloy',
    code: 'DUR',
    gaugeBand: '0.55mm',
    baseFlatSheetRatePerM2: 48.50,
    materialFactor: 1.15,
    extraFoldCostPerLm: 3.25,
    warrantyYears: 30,
    supplier: 'The Roofing Store Ltd'
  },
  {
    material: 'UniCote® Lux Architectural Pattern',
    code: 'LUX',
    gaugeBand: '0.55mm',
    baseFlatSheetRatePerM2: 54.00,
    materialFactor: 1.28,
    extraFoldCostPerLm: 3.50,
    warrantyYears: 25,
    supplier: 'The Roofing Store Ltd'
  },
  {
    material: 'Euramax® Premium Architectural Metal',
    code: 'EUR',
    gaugeBand: '0.70mm',
    baseFlatSheetRatePerM2: 58.00,
    materialFactor: 1.38,
    extraFoldCostPerLm: 4.00,
    warrantyYears: 40,
    supplier: 'Archtech European Imports'
  },
  {
    material: 'The Roofing Store MagnaFlow®',
    code: 'MAG',
    gaugeBand: '0.70mm',
    baseFlatSheetRatePerM2: 54.60,
    materialFactor: 1.30,
    extraFoldCostPerLm: 3.50,
    warrantyYears: 35,
    supplier: 'The Roofing Store Ltd'
  },
  {
    material: 'Architectural Copper (0.6mm)',
    code: 'COP',
    gaugeBand: '0.6mm',
    baseFlatSheetRatePerM2: 125.00,
    materialFactor: 2.95,
    extraFoldCostPerLm: 6.50,
    warrantyYears: 100,
    supplier: 'Archtech Specialist Metals'
  },
  {
    material: 'Terne-Coated Stainless Steel',
    code: 'TSS',
    gaugeBand: '0.55mm',
    baseFlatSheetRatePerM2: 140.00,
    materialFactor: 3.30,
    extraFoldCostPerLm: 7.00,
    warrantyYears: 80,
    supplier: 'Archtech Specialist Metals'
  },
  {
    material: 'VMZinc® Anthra-Zinc',
    code: 'ZNC',
    gaugeBand: '0.70mm',
    baseFlatSheetRatePerM2: 112.00,
    materialFactor: 2.65,
    extraFoldCostPerLm: 6.00,
    warrantyYears: 70,
    supplier: 'VMZinc NZ / Archtech'
  },
  {
    material: 'Weathering Steel (CORTEN)',
    code: 'COR',
    gaugeBand: '0.80mm',
    baseFlatSheetRatePerM2: 82.00,
    materialFactor: 1.95,
    extraFoldCostPerLm: 5.00,
    warrantyYears: 50,
    supplier: 'Archtech Specialist Metals'
  }
];

export interface ProfilePricingDef {
  profile: RoofingProfile;
  baseFormingRatePerLm: number; // Machine roll-forming rate
  upstandAllowanceMm: number; // Metal width taken up by seam bends (pan + allowance = slit width)
  supportedPanSizesMm: number[];
  defaultPanSizeMm: number;
  application: 'Roofing' | 'Wall Cladding' | 'Roofing & Wall';
}

export const MODULAR_TRAY_PROFILES: ProfilePricingDef[] = [
  // Standard Profiled Metal / Long-run (Residential Re-Roofs & Commercial)
  {
    profile: 'TRS Corrugate 0.40mm',
    baseFormingRatePerLm: 4.80,
    upstandAllowanceMm: 60,
    supportedPanSizesMm: [762],
    defaultPanSizeMm: 762,
    application: 'Roofing & Wall'
  },
  {
    profile: 'TRS Corrugate 0.55mm',
    baseFormingRatePerLm: 5.50,
    upstandAllowanceMm: 60,
    supportedPanSizesMm: [762],
    defaultPanSizeMm: 762,
    application: 'Roofing & Wall'
  },
  {
    profile: 'TRS Plumbdeck Trapezoidal 0.40mm',
    baseFormingRatePerLm: 5.20,
    upstandAllowanceMm: 60,
    supportedPanSizesMm: [760],
    defaultPanSizeMm: 760,
    application: 'Roofing & Wall'
  },
  {
    profile: 'TRS Plumbdeck Trapezoidal 0.55mm',
    baseFormingRatePerLm: 6.20,
    upstandAllowanceMm: 60,
    supportedPanSizesMm: [760],
    defaultPanSizeMm: 760,
    application: 'Roofing & Wall'
  },
  {
    profile: 'TRS Trimform / Commercial Rib',
    baseFormingRatePerLm: 6.80,
    upstandAllowanceMm: 65,
    supportedPanSizesMm: [770],
    defaultPanSizeMm: 770,
    application: 'Roofing & Wall'
  },
  // Architectural Standing Seam & Cladding (Specialized & Bespoke Builds)
  {
    profile: 'Archtech Super Seam 38mm',
    baseFormingRatePerLm: 12.50,
    upstandAllowanceMm: 90,
    supportedPanSizesMm: [300, 350, 400, 450, 500, 510, 530],
    defaultPanSizeMm: 450,
    application: 'Roofing & Wall'
  },
  {
    profile: 'Archtech Super Seam 45mm',
    baseFormingRatePerLm: 13.50,
    upstandAllowanceMm: 105,
    supportedPanSizesMm: [300, 350, 400, 450, 500],
    defaultPanSizeMm: 450,
    application: 'Roofing & Wall'
  },
  {
    profile: 'Archtech Snaplock 25mm',
    baseFormingRatePerLm: 11.80,
    upstandAllowanceMm: 70,
    supportedPanSizesMm: [300, 350, 400, 450, 500],
    defaultPanSizeMm: 450,
    application: 'Roofing & Wall'
  },
  {
    profile: 'Archtech Snaplock 38mm',
    baseFormingRatePerLm: 12.20,
    upstandAllowanceMm: 85,
    supportedPanSizesMm: [300, 350, 400, 450, 500],
    defaultPanSizeMm: 450,
    application: 'Roofing & Wall'
  },
  {
    profile: 'Archtech Angle Seam',
    baseFormingRatePerLm: 14.00,
    upstandAllowanceMm: 75,
    supportedPanSizesMm: [300, 350, 400, 450, 500],
    defaultPanSizeMm: 450,
    application: 'Wall Cladding'
  },
  {
    profile: 'Archtech Double Angle Seam',
    baseFormingRatePerLm: 16.50,
    upstandAllowanceMm: 85,
    supportedPanSizesMm: [300, 350, 400, 450, 500],
    defaultPanSizeMm: 450,
    application: 'Roofing'
  },
  {
    profile: 'Archtech Roll Seam / Roll Cap',
    baseFormingRatePerLm: 15.00,
    upstandAllowanceMm: 80,
    supportedPanSizesMm: [300, 350, 400, 450],
    defaultPanSizeMm: 400,
    application: 'Roofing'
  },
  {
    profile: 'Archtech Interlocking Panels',
    baseFormingRatePerLm: 11.50,
    upstandAllowanceMm: 60,
    supportedPanSizesMm: [200, 250, 300, 350],
    defaultPanSizeMm: 300,
    application: 'Wall Cladding'
  },
  {
    profile: 'Archtech Weatherboard Step Panels',
    baseFormingRatePerLm: 12.00,
    upstandAllowanceMm: 50,
    supportedPanSizesMm: [180, 200, 220, 250],
    defaultPanSizeMm: 220,
    application: 'Wall Cladding'
  },
  {
    profile: 'Archtech Flat Lock Panels',
    baseFormingRatePerLm: 15.50,
    upstandAllowanceMm: 50,
    supportedPanSizesMm: [250, 300, 350, 400],
    defaultPanSizeMm: 350,
    application: 'Wall Cladding'
  },
  {
    profile: 'TRS Corrugate / Plumbdeck 0.55',
    baseFormingRatePerLm: 6.50,
    upstandAllowanceMm: 60,
    supportedPanSizesMm: [762],
    defaultPanSizeMm: 762,
    application: 'Roofing'
  }
];

export const RE_ROOF_DEMOLITION_RATES: Record<string, { stripRatePerM2: number; disposalRatePerM2: number; description: string }> = {
  'Corrugated Iron': {
    stripRatePerM2: 14.50,
    disposalRatePerM2: 8.50,
    description: 'Deconstruct existing corrugated iron sheets, remove lead-head nails, cartage to metal recycling'
  },
  'Decramastic / Metal Tile': {
    stripRatePerM2: 19.50,
    disposalRatePerM2: 11.00,
    description: 'Strip decramastic pressed metal tiles, de-nail tile battens, clear bitumen residue, cleanfill cartage'
  },
  'Concrete / Clay Tile': {
    stripRatePerM2: 24.00,
    disposalRatePerM2: 16.50,
    description: 'Heavy tile strip, remove mortar bedding, de-nail tile battens, heavy masonry disposal bins'
  },
  'Asbestos Super Six / Shingles': {
    stripRatePerM2: 45.00,
    disposalRatePerM2: 28.00,
    description: 'Certified Class B non-friable asbestos strip, 200µm polythene wrap, WorkSafe NZ notification, hazardous manifest dump'
  },
  'Membrane / Butynol': {
    stripRatePerM2: 16.00,
    disposalRatePerM2: 7.50,
    description: 'Strip degraded butynol/bitumen membrane, scrape adhesive, structural plywood substrate inspection'
  }
};

export interface FlashingTypePricingDef {
  type: FlashingType;
  complexityBaseRatePerLm: number;
  standardFolds: number;
}

export const MODULAR_FLASHING_TYPES: FlashingTypePricingDef[] = [
  { type: 'Ridge Cap Vent', complexityBaseRatePerLm: 14.50, standardFolds: 4 },
  { type: 'Barge Flashing / Roll', complexityBaseRatePerLm: 11.00, standardFolds: 3 },
  { type: 'Valley Gutter', complexityBaseRatePerLm: 12.50, standardFolds: 3 },
  { type: 'Apron / Abutment Flashing', complexityBaseRatePerLm: 10.50, standardFolds: 3 },
  { type: 'Parapet Capping', complexityBaseRatePerLm: 12.00, standardFolds: 4 },
  { type: 'Drip Edge / Eaves Starter', complexityBaseRatePerLm: 8.50, standardFolds: 2 },
  { type: 'Window Head / Jamb Flashing', complexityBaseRatePerLm: 11.50, standardFolds: 3 },
  { type: 'Custom Internal Box Gutter', complexityBaseRatePerLm: 22.00, standardFolds: 5 },
  { type: 'Chimney / Penetration Saddle', complexityBaseRatePerLm: 28.00, standardFolds: 6 }
];

export const GIRTH_TIER_MAX_MM: Record<FlashingGirthTier, number> = {
  '0-150mm': 150,
  '151-300mm': 300,
  '301-450mm': 450,
  '451-600mm': 600,
  '601-900mm': 900,
  '901-1200mm': 1200
};

// ============================================================================
// DYNAMIC TRAY / PROFILE RATE CALCULATOR
// ============================================================================

export interface TrayRateResult {
  ratePerLm: number;
  ratePerM2: number;
  linearFactor: number; // lm per m2
  slitWidthMm: number;
  formingCostPerLm: number;
  coilCostPerLm: number;
}

/**
 * Dynamically looks up / calculates the linear metre rate for any combination of:
 * Profile + Material + Pan Size (or gauge band).
 * No fixed item code needed!
 */
export function calculateDynamicTrayRate(
  profile: RoofingProfile,
  material: CoilMaterial,
  panSizeMm?: number
): TrayRateResult {
  const profileDef = MODULAR_TRAY_PROFILES.find(p => p.profile === profile) || MODULAR_TRAY_PROFILES[0];
  const materialDef = MODULAR_COIL_MATERIALS.find(m => m.material === material) || MODULAR_COIL_MATERIALS[0];

  const actualPanSizeMm = panSizeMm && panSizeMm > 0 ? panSizeMm : profileDef.defaultPanSizeMm;
  const slitWidthMm = actualPanSizeMm + profileDef.upstandAllowanceMm;
  const linearFactor = 1000 / actualPanSizeMm; // lm of tray needed per 1 m² of roof

  // Coil cost per LM = (slitWidthMm / 1000) * baseFlatSheetRatePerM2
  const coilCostPerLm = Number(((slitWidthMm / 1000) * materialDef.baseFlatSheetRatePerM2).toFixed(2));
  const formingCostPerLm = profileDef.baseFormingRatePerLm;
  const ratePerLm = Number((coilCostPerLm + formingCostPerLm).toFixed(2));
  const ratePerM2 = Number((ratePerLm * linearFactor).toFixed(2));

  return {
    ratePerLm,
    ratePerM2,
    linearFactor,
    slitWidthMm,
    formingCostPerLm,
    coilCostPerLm
  };
}

// ============================================================================
// DYNAMIC FLASHING / RIDGING RATE CALCULATOR
// ============================================================================

export interface FlashingRateResult {
  ratePerLm: number;
  maxGirthMm: number;
  baseBendingRatePerLm: number;
  coilCostPerLm: number;
  extraFoldCostPerLm: number;
}

/**
 * Dynamically calculates flashing rate for any combination of:
 * Type + Material + Girth / Size Band (+ Folds Count).
 */
export function calculateDynamicFlashingRate(
  type: FlashingType,
  material: CoilMaterial,
  girthTier: FlashingGirthTier,
  foldsCount: number = 3
): FlashingRateResult {
  const typeDef = MODULAR_FLASHING_TYPES.find(t => t.type === type) || MODULAR_FLASHING_TYPES[0];
  const materialDef = MODULAR_COIL_MATERIALS.find(m => m.material === material) || MODULAR_COIL_MATERIALS[0];
  const maxGirthMm = GIRTH_TIER_MAX_MM[girthTier] || 300;

  // Coil strip cost for this girth tier
  const coilCostPerLm = Number(((maxGirthMm / 1000) * materialDef.baseFlatSheetRatePerM2).toFixed(2));
  const baseBendingRatePerLm = typeDef.complexityBaseRatePerLm;
  
  // Extra folds over standard included in the type
  const extraFolds = Math.max(0, foldsCount - typeDef.standardFolds);
  const extraFoldCost = extraFolds * materialDef.extraFoldCostPerLm;

  const ratePerLm = Number((coilCostPerLm + baseBendingRatePerLm + extraFoldCost).toFixed(2));

  return {
    ratePerLm,
    maxGirthMm,
    baseBendingRatePerLm,
    coilCostPerLm,
    extraFoldCostPerLm: extraFoldCost
  };
}

// ============================================================================
// DYNAMIC RAINWATER & SPOUTING MATRIX (SPOUTING, DOWNPIPES, RAINHEADS)
// ============================================================================

export interface RainwaterProductDef {
  code: string;
  name: string;
  category: 'spouting' | 'downpipe' | 'rainhead' | 'accessory';
  unit: 'lm' | 'ea' | 'length (3m)';
  baseRatePerUnit: number; // Wholesale $/unit in standard Vitor+ 0.55mm
  standardGirthMm?: number;
  description: string;
}

export const MODULAR_RAINWATER_PRODUCTS: RainwaterProductDef[] = [
  // Spouting / Gutters (Per LM)
  {
    code: 'RW-SP-150HR',
    name: '150mm European Half-Round Spouting',
    category: 'spouting',
    unit: 'lm',
    baseRatePerUnit: 34.00,
    standardGirthMm: 375,
    description: '150mm Architectural Half-Round eaves spouting with external or internal bracket system'
  },
  {
    code: 'RW-SP-125HR',
    name: '125mm Half-Round Spouting',
    category: 'spouting',
    unit: 'lm',
    baseRatePerUnit: 29.50,
    standardGirthMm: 310,
    description: '125mm residential half-round gutter profile'
  },
  {
    code: 'RW-SP-125BOX',
    name: '125mm Classic Box Gutter',
    category: 'spouting',
    unit: 'lm',
    baseRatePerUnit: 31.00,
    standardGirthMm: 330,
    description: '125mm clean architectural square box gutter profile'
  },
  {
    code: 'RW-SP-150BOX',
    name: '150mm Architectural Box Gutter',
    category: 'spouting',
    unit: 'lm',
    baseRatePerUnit: 37.50,
    standardGirthMm: 400,
    description: '150mm high-capacity architectural box gutter with overflow slots'
  },
  {
    code: 'RW-SP-200INT',
    name: '200mm Custom Internal Box Gutter',
    category: 'spouting',
    unit: 'lm',
    baseRatePerUnit: 68.00,
    standardGirthMm: 600,
    description: 'Heavy duty custom internal box gutter with expansion joints and sealed outlets'
  },
  {
    code: 'RW-BRK-500',
    name: 'Spouting Brackets (Concealed Internal / External)',
    category: 'accessory',
    unit: 'ea',
    baseRatePerUnit: 8.50,
    description: 'Architectural grade spouting brackets spaced at 500mm centers'
  },

  // Downpipes (Per LM)
  {
    code: 'RW-DP-80R',
    name: '80mm Round Architectural Downpipe',
    category: 'downpipe',
    unit: 'lm',
    baseRatePerUnit: 26.00,
    standardGirthMm: 251,
    description: '80mm circular seamless downpipe with slip joints'
  },
  {
    code: 'RW-DP-100R',
    name: '100mm Round Architectural Downpipe',
    category: 'downpipe',
    unit: 'lm',
    baseRatePerUnit: 31.50,
    standardGirthMm: 314,
    description: '100mm high-flow circular architectural downpipe'
  },
  {
    code: 'RW-DP-10075',
    name: '100 x 75mm Rectangular Downpipe',
    category: 'downpipe',
    unit: 'lm',
    baseRatePerUnit: 33.00,
    standardGirthMm: 350,
    description: 'Architectural rectangular box downpipe matching modern standing seam lines'
  },
  {
    code: 'RW-DP-7550',
    name: '75 x 50mm Rectangular Downpipe',
    category: 'downpipe',
    unit: 'lm',
    baseRatePerUnit: 27.50,
    standardGirthMm: 250,
    description: 'Compact rectangular profile for residential or veranda downpipes'
  },
  {
    code: 'RW-DP-CLP',
    name: 'Downpipe Stand-Off Mounting Clips',
    category: 'accessory',
    unit: 'ea',
    baseRatePerUnit: 6.50,
    description: 'Stand-off stand bracket clips in matching powder-coat or metal alloy'
  },
  {
    code: 'RW-DP-DROP',
    name: 'Downpipe Dropper Outlet Nozzle (80mm / 100mm)',
    category: 'accessory',
    unit: 'ea',
    baseRatePerUnit: 18.00,
    description: 'Welded or pop-riveted spigot outlet nozzle connecting spouting to downpipe'
  },

  // Rainheads & Collector Sumps (Each)
  {
    code: 'RW-RH-BOX',
    name: 'Architectural Box Rainhead (with Overflow Weir)',
    category: 'rainhead',
    unit: 'ea',
    baseRatePerUnit: 265.00,
    description: 'Folded and welded architectural box rainhead with NZBC E2/AS1 compliant overflow weir'
  },
  {
    code: 'RW-RH-CURV',
    name: 'Curved Heritage Collector Box',
    category: 'rainhead',
    unit: 'ea',
    baseRatePerUnit: 320.00,
    description: 'Curved profile decorative rainhead with conical dropper outlet'
  }
];

export function calculateDynamicRainwaterRate(
  productCodeOrName: string,
  material: CoilMaterial
) {
  const product = MODULAR_RAINWATER_PRODUCTS.find(
    p => p.code === productCodeOrName || p.name === productCodeOrName
  ) || MODULAR_RAINWATER_PRODUCTS[0];

  const materialDef = MODULAR_COIL_MATERIALS.find(m => m.material === material) || MODULAR_COIL_MATERIALS[0];
  const matFactor = materialDef.materialFactor || 1.0;

  const ratePerUnit = Number((product.baseRatePerUnit * matFactor).toFixed(2));

  return {
    product,
    ratePerUnit,
    unit: product.unit,
    material
  };
}

// ============================================================================
// DYNAMIC RE-QUOTING / VERSION GENERATION ENGINE
// ============================================================================

export interface RegenerateQuoteParams {
  previousQuote: Quote;
  targetProfile?: RoofingProfile;
  targetMaterial?: CoilMaterial;
  targetPanSizeMm?: number;
  targetColor?: string;
  markupPercent?: number;
  reason?: string;
  actor?: string;
}

/**
 * Generates a brand new dated quote version when a client or staff requests a material change,
 * pan-size change, or price matrix refresh.
 * Quantities remain identical; rates are recalculated dynamically from the matrix.
 */
export function regenerateQuoteVersionWithMatrix({
  previousQuote,
  targetProfile = previousQuote.profile,
  targetMaterial = previousQuote.material,
  targetPanSizeMm,
  targetColor = previousQuote.colorName || 'FlaxPod',
  markupPercent = previousQuote.markupPercent || 15,
  reason,
  actor = 'Marcus Kuhtze (Staff)'
}: RegenerateQuoteParams): { newQuote: Quote; updatedPreviousQuote: Quote } {
  if (previousQuote.status === 'accepted' || previousQuote.isLocked) {
    throw new Error('Price matrix updates can only be applied to open quotes (Sent, Viewed, Expired). Accepted quotes are legally locked.');
  }

  const nowIso = new Date().toISOString();
  const todayDate = nowIso.split('T')[0];
  const currentVersion = previousQuote.version || 1;
  const nextVersion = currentVersion + 1;
  
  const baseNumber = previousQuote.baseQuoteNumber || previousQuote.quoteNumber.replace(/-v\d+.*$/, '');
  const newQuoteNumber = `${baseNumber}-v${nextVersion}`;
  const newQuoteId = `q-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // 1. Recalculate Tray Scope using Dynamic Matrix
  const trayResult = calculateDynamicTrayRate(targetProfile, targetMaterial, targetPanSizeMm);
  const areaM2 = previousQuote.roofAreaM2 || 100;
  const materialCost = Number((areaM2 * trayResult.ratePerM2).toFixed(2));
  const markupMult = 1 + markupPercent / 100;
  const materialTotal = Number((materialCost * markupMult).toFixed(2));

  // 2. Recalculate Flashings using Dynamic Matrix (preserving all site measure lengths)
  let flashingsTotal = 0;
  let flashingsCost = 0;
  const updatedFlashings = (previousQuote.flashings || []).map(fl => {
    const flashResult = calculateDynamicFlashingRate(
      fl.type || 'Apron / Abutment Flashing',
      targetMaterial,
      fl.girthTier || '301-450mm',
      fl.foldsCount || 3
    );
    const length = fl.quantityLm || fl.lengthLm || 10;
    const cost = Number((length * flashResult.ratePerLm).toFixed(2));
    const total = Number((cost * markupMult).toFixed(2));
    flashingsCost += cost;
    flashingsTotal += total;
    return {
      ...fl,
      material: targetMaterial,
      baseRatePerLm: flashResult.baseBendingRatePerLm,
      calculatedRatePerLm: flashResult.ratePerLm,
      totalNZD: total
    };
  });

  // If no existing flashings array but had a total, adjust proportionally
  if (updatedFlashings.length === 0 && previousQuote.flashingsTotalNZD) {
    const matDef = MODULAR_COIL_MATERIALS.find(m => m.material === targetMaterial);
    const prevMatDef = MODULAR_COIL_MATERIALS.find(m => m.material === previousQuote.material);
    const ratio = (matDef?.materialFactor || 1) / (prevMatDef?.materialFactor || 1);
    flashingsTotal = Number((previousQuote.flashingsTotalNZD * ratio).toFixed(2));
    flashingsCost = Number((flashingsTotal / markupMult).toFixed(2));
  }

  // 3. Keep hardware, labour, freight constant
  const hardwareTotal = previousQuote.hardwareTotalNZD || 0;
  const labourTotal = previousQuote.labourTotalNZD || 0;
  const freightTotal = previousQuote.freightTotalNZD || 0;

  // 4. Update Spreadsheet Rows if present
  let updatedSpreadsheetRows = previousQuote.spreadsheetRows;
  let finalSubtotal = Number((materialTotal + flashingsTotal + hardwareTotal + labourTotal + freightTotal).toFixed(2));
  let finalCost = Number(((materialCost || 0) + (flashingsCost || 0)).toFixed(2));

  if (previousQuote.spreadsheetRows && previousQuote.spreadsheetRows.length > 0) {
    updatedSpreadsheetRows = previousQuote.spreadsheetRows.map(row => {
      // Tray lines
      if (row.matrixType === 'tray' || row.sectionId === 'sec-1' || row.category === 'Roofing Trays' || row.category === 'Roll-Formed Trays') {
        const actualPan = targetPanSizeMm || row.panSizeMm || 450;
        const trayCalc = calculateDynamicTrayRate(targetProfile, targetMaterial, actualPan);
        const unitSell = Math.round(trayCalc.ratePerLm * markupMult * 100) / 100;
        const lineTotal = Math.round((row.quantity || 0) * unitSell * 100) / 100;
        return {
          ...row,
          isMatrixItem: true,
          matrixType: 'tray' as const,
          profile: targetProfile,
          material: targetMaterial,
          panSizeMm: actualPan,
          description: `${targetProfile} (${actualPan}mm pan, ${targetMaterial})`,
          unitCostNZD: trayCalc.ratePerLm,
          markupPercent: markupPercent,
          unitSellNZD: unitSell,
          totalNZD: lineTotal,
          formula: `=${row.quantity} * ${unitSell}`
        };
      }

      // Flashing lines
      if (row.matrixType === 'flashing' || row.sectionId === 'sec-2' || row.category === 'Flashings') {
        const fType = row.flashingType || (row.description.includes('Ridge') ? 'Ridge Cap Vent' : row.description.includes('Barge') ? 'Barge Flashing / Roll' : 'Apron / Abutment Flashing');
        const gTier = row.girthTier || '301-450mm';
        const flashCalc = calculateDynamicFlashingRate(fType as any, targetMaterial, gTier, row.foldsCount || 3);
        const unitSell = Math.round(flashCalc.ratePerLm * markupMult * 100) / 100;
        const lineTotal = Math.round((row.quantity || 0) * unitSell * 100) / 100;
        return {
          ...row,
          isMatrixItem: true,
          matrixType: 'flashing' as const,
          flashingType: fType as any,
          material: targetMaterial,
          girthTier: gTier,
          description: `${fType} (${gTier}, ${targetMaterial})`,
          unitCostNZD: flashCalc.ratePerLm,
          markupPercent: markupPercent,
          unitSellNZD: unitSell,
          totalNZD: lineTotal,
          formula: `=${row.quantity} * ${unitSell}`
        };
      }

      return row;
    });

    finalSubtotal = updatedSpreadsheetRows.reduce((sum, r) => sum + (r.totalNZD || 0), 0);
    finalCost = updatedSpreadsheetRows.reduce((sum, r) => sum + ((r.unitCostNZD || 0) * (r.quantity || 0) * (1 + (r.wastagePercent || 0) / 100)), 0);
  }

  const subtotal = Number(finalSubtotal.toFixed(2));
  const gst = Number((subtotal * 0.15).toFixed(2));
  const total = Number((subtotal + gst).toFixed(2));

  const defaultReason = `Specification re-priced: ${targetProfile} in ${targetMaterial} (${targetColor}) with dynamic matrix lookup. Quantities preserved.`;
  const effectiveReason = reason || defaultReason;

  // Mark previous quote as superseded
  const auditSuperseded: QuoteAuditEntry = {
    id: `aud-${Date.now()}-sup`,
    timestamp: nowIso,
    action: 'superseded',
    actor,
    actorType: 'staff',
    details: `Superseded by Version ${nextVersion} (${newQuoteNumber}). Reason: ${effectiveReason}`,
    versionNumber: currentVersion
  };

  const updatedPreviousQuote: Quote = {
    ...previousQuote,
    status: 'superseded',
    isLocked: true,
    supersededById: newQuoteId,
    supersededAt: todayDate,
    supersededReason: effectiveReason,
    auditTrail: [auditSuperseded, ...(previousQuote.auditTrail || [])]
  };

  // Create new dated quote version with 30-day validity
  const validUntil = calculateQuoteValidUntil(todayDate);
  const auditCreated: QuoteAuditEntry = {
    id: `aud-${Date.now()}-crt`,
    timestamp: nowIso,
    action: 'created',
    actor,
    actorType: 'staff',
    details: `Version ${nextVersion} issued (${effectiveReason}). Total: $${total.toLocaleString('en-NZ', { minimumFractionDigits: 2 })} NZD`,
    versionNumber: nextVersion
  };

  const newQuote: Quote = {
    ...previousQuote,
    id: newQuoteId,
    quoteNumber: newQuoteNumber,
    baseQuoteNumber: baseNumber,
    version: nextVersion,
    versionLabel: `v${nextVersion}.0`,
    revision: `Rev ${String.fromCharCode(64 + nextVersion)}`,
    status: 'sent',
    isLocked: false,
    issueDate: todayDate,
    validUntil,
    createdAt: todayDate,
    expiresAt: validUntil,
    clientToken: generateClientQuoteToken(newQuoteId, nextVersion),
    supersedesId: previousQuote.id,
    supersededById: undefined,
    supersededAt: undefined,
    supersededReason: undefined,
    profile: targetProfile,
    material: targetMaterial,
    colorName: targetColor,
    materialCostNZD: materialCost,
    materialTotalNZD: materialTotal,
    flashingsCostNZD: flashingsCost,
    flashingsTotalNZD: flashingsTotal,
    flashings: updatedFlashings,
    spreadsheetRows: updatedSpreadsheetRows,
    costTotalNZD: finalCost,
    subtotalNZD: subtotal,
    gstNZD: gst,
    totalNZD: total,
    clientSignature: undefined,
    signedAt: undefined,
    acceptedBy: undefined,
    declinedReason: undefined,
    clientAmendmentRequest: undefined,
    auditTrail: [auditCreated, ...(previousQuote.auditTrail || [])]
  };

  return { newQuote, updatedPreviousQuote };
}

// Backwards-compatible aliases for test suites and legacy callers
export function calculateDynamicTrayPrice(
  profile: RoofingProfile,
  material: CoilMaterial,
  panSizeMm: number = 450,
  catalogue?: MasterPricingCatalogue
) {
  const actualPan = panSizeMm || 450;
  const upstand = 88;
  const blankWidthMm = actualPan + upstand;

  const baseline = catalogue?.profileMaterialPrices?.find(
    p => p.profile === profile && p.material === material
  );

  if (baseline && actualPan === (baseline.defaultPanWidthMm || 450)) {
    const pricePerLm = baseline.pricePerLm;
    const pricePerM2 = Number(((pricePerLm * 1000) / actualPan).toFixed(2));
    return {
      pricePerLm,
      pricePerM2,
      ratePerLm: pricePerLm,
      ratePerM2: pricePerM2,
      blankWidthMm,
      slitWidthMm: blankWidthMm,
      formingCostPerLm: 12.00,
      coilCostPerLm: Number((pricePerLm - 12.00).toFixed(2)),
      linearFactor: Number((1000 / actualPan).toFixed(2))
    };
  }

  const baseRate = baseline ? baseline.pricePerLm : 34.50;
  const defaultPan = baseline?.defaultPanWidthMm || 450;
  const pricePerLm = Number(((baseRate * blankWidthMm) / (defaultPan + upstand)).toFixed(2));
  const pricePerM2 = Number(((pricePerLm * 1000) / actualPan).toFixed(2));

  return {
    pricePerLm,
    pricePerM2,
    ratePerLm: pricePerLm,
    ratePerM2: pricePerM2,
    blankWidthMm,
    slitWidthMm: blankWidthMm,
    formingCostPerLm: 12.00,
    coilCostPerLm: Number((pricePerLm - 12.00).toFixed(2)),
    linearFactor: Number((1000 / actualPan).toFixed(2))
  };
}

export function calculateDynamicFlashingPrice(
  type: FlashingType,
  material: CoilMaterial,
  girthTier: FlashingGirthTier,
  foldsCount: number = 3,
  catalogue?: MasterPricingCatalogue
) {
  let baseRatePerLm = 39.00;
  const girthEntry = (catalogue?.flashingGirthMatrix as any[])?.find(
    (g: any) => g.girthTier === girthTier && g.material === material
  );
  if (girthEntry) {
    baseRatePerLm = girthEntry.pricePerLm || girthEntry.baseRatePerLm || 39.00;
  } else {
    switch (girthTier) {
      case '0-150mm': baseRatePerLm = 24.50; break;
      case '151-300mm': baseRatePerLm = 31.50; break;
      case '301-450mm': baseRatePerLm = 39.00; break;
      case '451-600mm': baseRatePerLm = 47.00; break;
      case '601-900mm': baseRatePerLm = 59.00; break;
      case '901-1200mm': baseRatePerLm = 74.00; break;
    }
  }

  const extraFolds = Math.max(0, foldsCount - 3);
  const extraFoldsAdder = extraFolds * 3.50;
  const isVentOrComplex = type === 'Ridge Cap Vent' || type === 'Custom Internal Box Gutter';
  const specializedTypeAdder = isVentOrComplex ? 5.50 : 0;
  const pricePerLm = Number((baseRatePerLm + extraFoldsAdder + specializedTypeAdder).toFixed(2));

  return {
    pricePerLm,
    ratePerLm: pricePerLm,
    baseRatePerLm,
    extraFoldsAdder,
    specializedTypeAdder,
    maxGirthMm: GIRTH_TIER_MAX_MM[girthTier] || 450,
    baseBendingRatePerLm: 14.50,
    coilCostPerLm: baseRatePerLm - 14.50,
    extraFoldCostPerLm: extraFoldsAdder
  };
}

export function recalculateQuoteWithDynamicMatrix(
  quoteOrParams: any, 
  _maybeCatalogue?: any, 
  maybeOverrides?: any
): any {
  if (maybeOverrides || !quoteOrParams.previousQuote && !quoteOrParams.quote) {
    const prev = quoteOrParams;
    const overrides = maybeOverrides || {};
    return regenerateQuoteVersionWithMatrix({
      previousQuote: prev,
      targetProfile: overrides.profile || prev.profile,
      targetMaterial: overrides.material || prev.material,
      targetPanSizeMm: overrides.panWidthMm || overrides.panSizeMm,
      targetColor: overrides.colorName || prev.colorName,
      markupPercent: overrides.markupPercent || prev.markupPercent,
      reason: overrides.reason || overrides.amendmentReason
    });
  }

  const quote = quoteOrParams.quote || quoteOrParams.previousQuote;
  return regenerateQuoteVersionWithMatrix({
    previousQuote: quote,
    targetProfile: quoteOrParams.targetProfile,
    targetMaterial: quoteOrParams.targetMaterial,
    targetPanSizeMm: quoteOrParams.targetPanSizeMm,
    targetColor: quoteOrParams.targetColor,
    markupPercent: quoteOrParams.markupPercent,
    reason: quoteOrParams.reason || quoteOrParams.amendmentReason
  });
}

// ============================================================================
// PAN SIZE BANDS SPECIFICATION
// ============================================================================

export interface PanSizeBandDef {
  band: string;
  maxMm: number;
  label: string;
  description: string;
}

export const PAN_SIZE_BANDS: PanSizeBandDef[] = [
  { band: '200-300mm', maxMm: 300, label: '200 - 300mm', description: 'Narrow pan, high wind / steep pitch architectural' },
  { band: '301-350mm', maxMm: 350, label: '301 - 350mm', description: 'Mid-narrow architectural seam' },
  { band: '351-400mm', maxMm: 400, label: '351 - 400mm', description: 'Balanced residential standing seam' },
  { band: '401-450mm', maxMm: 450, label: '401 - 450mm (Standard)', description: 'Standard NZ architectural tray pan width' },
  { band: '451-500mm', maxMm: 500, label: '451 - 500mm', description: 'Wide pan format' },
  { band: '501-530mm', maxMm: 530, label: '501 - 530mm', description: 'Maximum roll-former coil capability' }
];

export function parsePanSizeMm(size: number | string | undefined, defaultMm: number = 450): number {
  if (typeof size === 'number' && size > 0) return size;
  if (!size) return defaultMm;
  const str = String(size).trim();
  const match = str.match(/(\d+)(?:-(\d+))?/);
  if (match) {
    return match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10);
  }
  return defaultMm;
}

// ============================================================================
// STORED MATRIX & ADMIN MAINTENANCE STATE
// ============================================================================

const MATRIX_STORAGE_KEY = 'archtech_dynamic_pricing_matrix';

export function getStoredPricingMatrix() {
  try {
    const raw = localStorage.getItem(MATRIX_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading stored pricing matrix:', err);
  }

  // Initial defaults
  return {
    lastUpdated: new Date().toISOString().slice(0, 10),
    updatedBy: 'Marcus Kuhtze (Project Manager)',
    trayProfiles: [...MODULAR_TRAY_PROFILES],
    coilMaterials: [...MODULAR_COIL_MATERIALS],
    flashingTypes: [...MODULAR_FLASHING_TYPES],
    flashingGirthTiers: { ...GIRTH_TIER_MAX_MM },
    auditLog: [
      {
        id: 'aud-matrix-init',
        timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
        actor: 'Marcus Kuhtze',
        action: 'System Initialized',
        details: 'Loaded standard NZ architectural roofing & flashing dynamic rate matrix.'
      }
    ]
  };
}

export function saveStoredPricingMatrix(state: any) {
  try {
    localStorage.setItem(MATRIX_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event('archtech_matrix_updated'));
  } catch (err) {
    console.error('Error saving stored pricing matrix:', err);
  }
}

// ============================================================================
// PUSH MATRIX UPDATES TO ELIGIBLE OPEN QUOTES
// ============================================================================

export function pushMatrixUpdatesToOpenQuotes(
  quotes: Quote[],
  onUpdateQuote: (quote: Quote) => void,
  actor: string = 'Marcus Kuhtze (Estimator)'
): { updatedCount: number; affectedQuoteNumbers: string[] } {
  let updatedCount = 0;
  const affectedQuoteNumbers: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  quotes.forEach(quote => {
    // Only open quotes can receive matrix price updates (Accepted quotes are legally locked!)
    if (quote.status === 'accepted' || quote.status === 'superseded') {
      return;
    }

    try {
      const markupMult = 1 + (quote.markupPercent || 15) / 100;
      let hasChanges = false;

      let updatedRows = (quote.spreadsheetRows || []).map(row => {
        // Tray row
        if (row.matrixType === 'tray' || row.sectionId === 'sec-1' || row.category === 'Roofing Trays') {
          const profile = row.profile || quote.profile || 'Archtech Super Seam 38mm';
          const material = row.material || quote.material || 'The Roofing Store MagnaFlow®';
          const panMm = row.panSizeMm || (quote as any).panWidthMm || 450;
          const calc = calculateDynamicTrayRate(profile, material, panMm);
          const unitSell = Math.round(calc.ratePerLm * markupMult * 100) / 100;
          const lineTotal = Math.round((row.quantity || 0) * unitSell * 100) / 100;

          if (row.unitSellNZD !== unitSell || row.totalNZD !== lineTotal) {
            hasChanges = true;
            return {
              ...row,
              isMatrixItem: true,
              matrixType: 'tray' as const,
              profile,
              material,
              panSizeMm: panMm,
              unitCostNZD: calc.ratePerLm,
              unitSellNZD: unitSell,
              totalNZD: lineTotal,
              formula: `=${row.quantity} * ${unitSell}`
            };
          }
        }

        // Flashing row
        if (row.matrixType === 'flashing' || row.sectionId === 'sec-2' || row.category === 'Flashings') {
          const fType = row.flashingType || (row.description.includes('Ridge') ? 'Ridge Cap Vent' : 'Apron / Abutment Flashing');
          const material = row.material || quote.material || 'The Roofing Store MagnaFlow®';
          const gTier = row.girthTier || '301-450mm';
          const calc = calculateDynamicFlashingRate(fType as any, material, gTier, row.foldsCount || 3);
          const unitSell = Math.round(calc.ratePerLm * markupMult * 100) / 100;
          const lineTotal = Math.round((row.quantity || 0) * unitSell * 100) / 100;

          if (row.unitSellNZD !== unitSell || row.totalNZD !== lineTotal) {
            hasChanges = true;
            return {
              ...row,
              isMatrixItem: true,
              matrixType: 'flashing' as const,
              flashingType: fType as any,
              material,
              girthTier: gTier,
              unitCostNZD: calc.ratePerLm,
              unitSellNZD: unitSell,
              totalNZD: lineTotal,
              formula: `=${row.quantity} * ${unitSell}`
            };
          }
        }

        return row;
      });

      if (hasChanges || !quote.spreadsheetRows) {
        const newSubtotal = updatedRows.reduce((sum, r) => sum + (r.totalNZD || 0), 0);
        const newCost = updatedRows.reduce((sum, r) => sum + ((r.unitCostNZD || 0) * (r.quantity || 0) * (1 + (r.wastagePercent || 0) / 100)), 0);
        const newGst = Math.round(newSubtotal * 0.15 * 100) / 100;
        const newTotal = newSubtotal + newGst;

        const auditItem: QuoteAuditEntry = {
          id: `aud-mat-${Date.now()}-${quote.id}`,
          timestamp: new Date().toISOString(),
          action: 'recalculated_matrix',
          actor,
          actorType: 'staff',
          details: `Refreshed line items against Master Dynamic Pricing Matrix (${today}). New total: $${newTotal.toFixed(2)} NZD.`,
          versionNumber: quote.version || 1
        };

        const updatedQuote: Quote = {
          ...quote,
          spreadsheetRows: updatedRows,
          subtotalNZD: newSubtotal,
          costTotalNZD: newCost,
          gstNZD: newGst,
          totalNZD: newTotal,
          auditTrail: [auditItem, ...(quote.auditTrail || [])]
        };

        onUpdateQuote(updatedQuote);
        updatedCount++;
        affectedQuoteNumbers.push(quote.quoteNumber);
      }
    } catch (e) {
      console.error(`Failed to refresh quote ${quote.quoteNumber}:`, e);
    }
  });

  return { updatedCount, affectedQuoteNumbers };
}

// ============================================================================
// VERSION COMPARISON & DIFF ENGINE
// ============================================================================

export interface VersionDiffSummary {
  quoteA: Quote; // Typically newer/active
  quoteB: Quote; // Typically older/previous
  subtotalDiffNZD: number;
  totalDiffNZD: number;
  diffPercent: number;
  specChanges: { label: string; from: string; to: string; changed: boolean }[];
  lineItemDiffs: {
    id: string;
    description: string;
    category: string;
    qtyA?: number;
    qtyB?: number;
    rateA?: number;
    rateB?: number;
    totalA?: number;
    totalB?: number;
    diffTotalNZD: number;
    status: 'unchanged' | 'modified' | 'added' | 'removed';
  }[];
}

export function compareQuoteVersions(current: Quote, comparison: Quote): VersionDiffSummary {
  const subtotalDiffNZD = Number(((current.subtotalNZD || 0) - (comparison.subtotalNZD || 0)).toFixed(2));
  const totalDiffNZD = Number(((current.totalNZD || 0) - (comparison.totalNZD || 0)).toFixed(2));
  const diffPercent = comparison.totalNZD > 0 
    ? Number((((current.totalNZD - comparison.totalNZD) / comparison.totalNZD) * 100).toFixed(1))
    : 0;

  const specChanges = [
    {
      label: 'Profile',
      from: comparison.profile || 'Archtech Super Seam 38mm',
      to: current.profile || 'Archtech Super Seam 38mm',
      changed: comparison.profile !== current.profile
    },
    {
      label: 'Material',
      from: comparison.material || 'The Roofing Store MagnaFlow®',
      to: current.material || 'The Roofing Store MagnaFlow®',
      changed: comparison.material !== current.material
    },
    {
      label: 'Color',
      from: comparison.colorName || 'FlaxPod',
      to: current.colorName || 'FlaxPod',
      changed: comparison.colorName !== current.colorName
    },
    {
      label: 'Markup %',
      from: `${comparison.markupPercent || 15}%`,
      to: `${current.markupPercent || 15}%`,
      changed: comparison.markupPercent !== current.markupPercent
    }
  ];

  const rowsA = current.spreadsheetRows || [];
  const rowsB = comparison.spreadsheetRows || [];

  const lineItemDiffs: VersionDiffSummary['lineItemDiffs'] = [];

  // Match rows by description or itemCode or ID
  const matchedBIds = new Set<string>();

  rowsA.forEach(rA => {
    const matchB = rowsB.find(rB => 
      rB.id === rA.id || 
      (rB.itemCode && rB.itemCode === rA.itemCode) || 
      (rB.description && rB.description.toLowerCase() === rA.description.toLowerCase())
    );

    if (matchB) {
      matchedBIds.add(matchB.id);
      const diffTotal = Number(((rA.totalNZD || 0) - (matchB.totalNZD || 0)).toFixed(2));
      const isModified = rA.quantity !== matchB.quantity || rA.unitSellNZD !== matchB.unitSellNZD || diffTotal !== 0;

      lineItemDiffs.push({
        id: rA.id,
        description: rA.description,
        category: rA.category,
        qtyA: rA.quantity,
        qtyB: matchB.quantity,
        rateA: rA.unitSellNZD,
        rateB: matchB.unitSellNZD,
        totalA: rA.totalNZD,
        totalB: matchB.totalNZD,
        diffTotalNZD: diffTotal,
        status: isModified ? 'modified' : 'unchanged'
      });
    } else {
      lineItemDiffs.push({
        id: rA.id,
        description: rA.description,
        category: rA.category,
        qtyA: rA.quantity,
        rateA: rA.unitSellNZD,
        totalA: rA.totalNZD,
        diffTotalNZD: rA.totalNZD || 0,
        status: 'added'
      });
    }
  });

  // Remaining rows in B are removed
  rowsB.forEach(rB => {
    if (!matchedBIds.has(rB.id)) {
      lineItemDiffs.push({
        id: rB.id,
        description: rB.description,
        category: rB.category,
        qtyB: rB.quantity,
        rateB: rB.unitSellNZD,
        totalB: rB.totalNZD,
        diffTotalNZD: -(rB.totalNZD || 0),
        status: 'removed'
      });
    }
  });

  return {
    quoteA: current,
    quoteB: comparison,
    subtotalDiffNZD,
    totalDiffNZD,
    diffPercent,
    specChanges,
    lineItemDiffs
  };
}
