export type LongRunProfileKey = 
  | 'corrugate_762'
  | 'trapezoidal_5rib'
  | 'commercial_6rib'
  | 'trimdek_monodeck';

export interface LongRunProfileDef {
  key: LongRunProfileKey;
  name: string;
  coverMm: number;
  ribHeightMm: number;
  minPitchDeg: number;
  standardGauges: ('0.40mm' | '0.55mm' | '0.75mm')[];
  description: string;
  screwType: string;
  screwsPerSheetPerPurlin: number;
}

export const LONGRUN_PROFILES: Record<LongRunProfileKey, LongRunProfileDef> = {
  corrugate_762: {
    key: 'corrugate_762',
    name: 'Corrugate (Custom Orb 762mm)',
    coverMm: 762,
    ribHeightMm: 16.5,
    minPitchDeg: 8,
    standardGauges: ['0.40mm', '0.55mm'],
    description: 'Classic Kiwi undulating corrugated profile, 762mm effective cover width. Requires soft-edge flashings or foam closures.',
    screwType: '12-14 x 65mm Hex Head Crest Fixed w/ EPDM Seal',
    screwsPerSheetPerPurlin: 5
  },
  trapezoidal_5rib: {
    key: 'trapezoidal_5rib',
    name: 'Trapezoidal 5-Rib (Plumbdeck / Trimdek 760mm)',
    coverMm: 760,
    ribHeightMm: 27,
    minPitchDeg: 3,
    standardGauges: ['0.40mm', '0.55mm'],
    description: 'Popular modern 5-rib trapezoidal profile for low to moderate pitch roofs (down to 3° with sealed laps). High water carrying capacity.',
    screwType: '12-14 x 55mm / 65mm Crest Fixed w/ Neoprene Washer',
    screwsPerSheetPerPurlin: 5
  },
  commercial_6rib: {
    key: 'commercial_6rib',
    name: 'Commercial 6-Rib (Trimform / Spandek 900mm)',
    coverMm: 900,
    ribHeightMm: 30,
    minPitchDeg: 3,
    standardGauges: ['0.55mm', '0.75mm'],
    description: 'Heavy duty wide cover profile (900mm) suitable for larger residential and commercial spans.',
    screwType: '12-14 x 65mm Class 4 Hex Tek w/ Seal',
    screwsPerSheetPerPurlin: 6
  },
  trimdek_monodeck: {
    key: 'trimdek_monodeck',
    name: 'Low-Pitch Monodeck (3° Min Fall)',
    coverMm: 760,
    ribHeightMm: 35,
    minPitchDeg: 3,
    standardGauges: ['0.40mm', '0.55mm'],
    description: 'Deep fluted trough profile engineered specifically for low-pitch additions, carports, and mono-pitch pavilions.',
    screwType: '12-14 x 65mm Heavy Gauge Tek Crest',
    screwsPerSheetPerPurlin: 5
  }
};

export interface ColorFinishPreset {
  name: string;
  brand: string;
  hex: string;
  category: 'Popular Classic' | 'Contemporary Dark' | 'Earthy' | 'Neutral Metallic';
}

export const COLORSTEEL_COLORS: ColorFinishPreset[] = [
  { name: 'FlaxPod', brand: 'Colorsteel® Maxx / Vitor+', hex: '#2B2B2A', category: 'Contemporary Dark' },
  { name: 'Ebony', brand: 'Colorsteel® Endura / Vitor+', hex: '#1C1C1E', category: 'Contemporary Dark' },
  { name: 'Ironsand', brand: 'Colorsteel® Maxx / Vitor+', hex: '#3B3835', category: 'Earthy' },
  { name: 'Grey Friars', brand: 'Colorsteel® Endura', hex: '#3E444B', category: 'Popular Classic' },
  { name: 'Titania', brand: 'Colorsteel® Endura', hex: '#D6D5C9', category: 'Popular Classic' },
  { name: 'Sandstone Grey', brand: 'Colorsteel® Endura', hex: '#777874', category: 'Popular Classic' },
  { name: 'Windsor Grey', brand: 'Colorsteel® Endura', hex: '#4A4F54', category: 'Contemporary Dark' },
  { name: 'New Denim Blue', brand: 'Colorsteel® Endura', hex: '#404B57', category: 'Popular Classic' },
  { name: 'Karaka', brand: 'Colorsteel® Endura', hex: '#343B33', category: 'Earthy' },
  { name: 'Scoria', brand: 'Colorsteel® Endura', hex: '#783A30', category: 'Earthy' },
  { name: 'Zincalume® (Unpainted)', brand: 'Bluescope / NZ Steel', hex: '#A8B2BA', category: 'Neutral Metallic' }
];

export type CutEndType = 'square' | 'rake_left' | 'rake_right' | 'valley_left' | 'valley_right';
export type SheetInstallStatus = 'pending' | 'measured' | 'cut' | 'lifted' | 'fixed';

export interface LongRunSheetItem {
  id: string;
  sheetNumber: string; // e.g. "H-01", "G-03", "V-02"
  facetId: string;
  facetName: string;
  pitchDeg: number;
  orderLengthMm: number; // Blank sheet length ordered from rollformer
  cutLengthMm: number; // Final installed length on roof
  topCut: CutEndType;
  topAngleDeg: number; // e.g. 24°
  bottomCut: CutEndType;
  bottomAngleDeg: number;
  effectiveCoverMm: number;
  eavesOverhangMm: number;
  
  // Offcut Intelligence
  hasDiagonalCut: boolean;
  offcutLengthMm: number; // Remaining length of offcut piece
  offcutReused: boolean;
  offcutPairId?: string; // Paired Sheet ID
  offcutDestinationNotes?: string; // e.g. "Flip 180° to Valley Plane B Sheet V-04"
  offcutSourceNotes?: string; // e.g. "Cut from Hip Sheet H-01 offcut"
  isFlippedOffcutPiece?: boolean; // True if this sheet is made from an offcut
  
  status: SheetInstallStatus;
  packNumber?: number; // HIAB Staging pack bundle
  notes?: string;
}

export interface RoofFacet {
  id: string;
  name: string; // e.g. "North Hip Rake (Left)", "Main Ridge Gable", "West Valley Rake"
  facetType: 'gable' | 'hip_rake' | 'valley_junction' | 'monopitch';
  pitchDeg: number;
  eaveWidthMm: number;
  slopeLengthMm: number;
  ridgeLengthMm?: number;
  hipLengthMm?: number;
  valleyLengthMm?: number;
  sheetCount: number;
  colorName: string;
  gauge: '0.40mm' | '0.55mm';
  profileKey: LongRunProfileKey;
  purlinSpacingMm: number;
  sheets: LongRunSheetItem[];
  plan2dVertices?: { x: number; y: number }[]; // 2D polygon vertices for unified roof plan view
  idealLaySequenceStart?: 'left' | 'right';
  laySequenceNotes?: string;
}

export type RoofArchetypeKey = 
  | 'hip_and_valley'
  | 'l_shape'
  | 'gable_duo'
  | 'dutch_gable'
  | 'skillion_monopitch'
  | 'custom_blueprint';

export interface AIRoofOptimizationResult {
  lastRunAt: string;
  idealLayingDirection: string;
  prevailingWindRationale: string;
  windComplianceCode: string;
  offcutOptimizationNotes: string[];
  reusablePairsCount: number;
  estimatedSteelSavedLm: number;
  estimatedDollarSavedNZD: number;
  scrapPercentage: number;
  fastenerDensityNote: string;
  transportHIABNote: string;
}

export interface RoofPlanModel {
  id: string;
  projectId: string;
  projectNumber: string;
  roofArchetype: RoofArchetypeKey;
  uploadedBlueprintUrl?: string;
  scaleCalibration?: {
    pixelDistance: number;
    knownDistanceMm: number;
    mmPerPixel: number;
  };
  overallBuildingLengthMm: number;
  overallBuildingWidthMm: number;
  pitchDegrees: number;
  prevailingWind: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
  facets: RoofFacet[];
  planes?: any[];
  layout?: any;
  flashingAssignments?: any[];
  assets?: any[];
  pitchBreaks?: any[];
  stage?: 'quoting' | 'measuring' | 'installing';
  measureLocked?: boolean;
  bom?: any;
  packs?: any[];
  installProgress?: any;
  aiIntelligence?: AIRoofOptimizationResult;
  lastUpdated: string;
  updatedBy: string;
}

export type FlashingCategory = 
  | 'Ridge Cap'
  | 'Barge / Gable'
  | 'Internal Valley'
  | 'Apron / Abutment'
  | 'Eaves Drip Edge'
  | 'Parapet Capping'
  | 'Custom Fold';

export interface LongRunFlashingItem {
  id: string;
  mark: string; // e.g. "FL-01"
  name: string; // e.g. "Roll-Top Barge w/ Safety Hem"
  category: FlashingCategory;
  girthMm: number; // e.g. 300, 450, 600
  foldsCount: number;
  standardLengthMm: number; // e.g. 3000, 4000, 6000 or custom
  quantity: number;
  totalLengthLm: number;
  effectiveLapMm: number; // standard 150mm
  colorName: string;
  gauge: '0.40mm' | '0.55mm';
  softEdgeFitted?: boolean; // dressable lead/zinc edge for corrugated
  foamInfillIncluded?: boolean;
  leftMitre?: string; // e.g. "45° Apex Mitre", "Stop End", "Square 90°"
  rightMitre?: string;
  status: 'pending' | 'ordered' | 'folded' | 'installed';
  notes?: string;
}

export interface LongRunSheetOrderManifest {
  orderNumber: string;
  projectId: string;
  projectNumber: string;
  projectAddress: string;
  orderedBy: string;
  orderDate: string;
  requiredDeliveryDate: string;
  supplier: string; // e.g. "The Roofing Store - Albany", "Dimond", "Metalcraft"
  urgency: 'Standard Delivery (3-5 Days)' | 'Urgent Roll & Run (48h)' | 'Same-Day Site Delivery';
  profile: LongRunProfileKey;
  gauge: '0.40mm' | '0.55mm';
  colorName: string;
  
  // Totals
  totalSheetsCount: number;
  totalLinealMetres: number;
  totalAreaM2: number;
  longestSheetMm: number;
  totalPacksCount: number;
  
  // Hardware & Accessories automatically calculated
  roofingScrewsCount: number;
  screwDescription: string;
  underlayRollsCount: number; // 50m² rolls
  foamInfillPairsCount: number;
  deliveryNotes: string;
  status: 'Draft' | 'Sent to Rollformer' | 'In Production' | 'Dispatched' | 'Delivered Onsite';
}
