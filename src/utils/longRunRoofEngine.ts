import {
  LongRunProfileKey,
  LONGRUN_PROFILES,
  LongRunSheetItem,
  RoofFacet,
  LongRunFlashingItem,
  LongRunSheetOrderManifest,
  COLORSTEEL_COLORS
} from '../types/longrun';
import { Project } from '../types/crm';

// ============================================================================
// 1. DEFAULT REALISTIC LONGRUN ROOFING DATA GENERATION
// ============================================================================

export function generateInitialLongRunData(project?: Project): {
  facets: RoofFacet[];
  flashings: LongRunFlashingItem[];
  profileKey: LongRunProfileKey;
  gauge: '0.40mm' | '0.55mm';
  colorName: string;
} {
  // Infer profile or default to Corrugate / 5-Rib
  let profileKey: LongRunProfileKey = 'corrugate_762';
  if (project?.profile?.toLowerCase().includes('plumbdeck') || project?.profile?.toLowerCase().includes('trapezoidal')) {
    profileKey = 'trapezoidal_5rib';
  } else if (project?.profile?.toLowerCase().includes('commercial') || project?.profile?.toLowerCase().includes('trimform')) {
    profileKey = 'commercial_6rib';
  } else if (project?.profile?.toLowerCase().includes('trimdek') || project?.profile?.toLowerCase().includes('monodeck')) {
    profileKey = 'trimdek_monodeck';
  }

  const gauge: '0.40mm' | '0.55mm' = project?.windZone === 'Very High' || project?.windZone === 'Extra High' || project?.exposureZone?.includes('Severe')
    ? '0.55mm'
    : '0.40mm';

  const colorName = project?.colorName || 'FlaxPod';
  const pitch = project?.roofPitchDegrees || 15;

  // Realistic everyday roof facets with Hip & Valley offcut pairing!
  // Facet 1: North Gable Main (Gable - full uniform sheets)
  // Facet 2: East Hip Rake (Hip cuts generating offcuts)
  // Facet 3: West Valley Junction (Valleys where offcuts can be flipped & reused)
  // Facet 4: South Hip Return

  const facetGableSheets: LongRunSheetItem[] = [
    {
      id: 'sh-g-01',
      sheetNumber: 'G-01',
      facetId: 'facet-gable-north',
      facetName: 'North Gable Main Slope',
      pitchDeg: pitch,
      orderLengthMm: 6200,
      cutLengthMm: 6200,
      topCut: 'square',
      topAngleDeg: 0,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: false,
      offcutLengthMm: 0,
      offcutReused: false,
      status: 'lifted',
      packNumber: 1,
      notes: 'Full run from ridge to gutter with 50mm overhang'
    },
    {
      id: 'sh-g-02',
      sheetNumber: 'G-02',
      facetId: 'facet-gable-north',
      facetName: 'North Gable Main Slope',
      pitchDeg: pitch,
      orderLengthMm: 6200,
      cutLengthMm: 6200,
      topCut: 'square',
      topAngleDeg: 0,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: false,
      offcutLengthMm: 0,
      offcutReused: false,
      status: 'lifted',
      packNumber: 1
    },
    {
      id: 'sh-g-03',
      sheetNumber: 'G-03',
      facetId: 'facet-gable-north',
      facetName: 'North Gable Main Slope',
      pitchDeg: pitch,
      orderLengthMm: 6200,
      cutLengthMm: 6200,
      topCut: 'square',
      topAngleDeg: 0,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: false,
      offcutLengthMm: 0,
      offcutReused: false,
      status: 'fixed',
      packNumber: 1
    },
    {
      id: 'sh-g-04',
      sheetNumber: 'G-04',
      facetId: 'facet-gable-north',
      facetName: 'North Gable Main Slope',
      pitchDeg: pitch,
      orderLengthMm: 6200,
      cutLengthMm: 6200,
      topCut: 'square',
      topAngleDeg: 0,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: false,
      offcutLengthMm: 0,
      offcutReused: false,
      status: 'fixed',
      packNumber: 1
    },
    {
      id: 'sh-g-05',
      sheetNumber: 'G-05',
      facetId: 'facet-gable-north',
      facetName: 'North Gable Main Slope',
      pitchDeg: pitch,
      orderLengthMm: 6200,
      cutLengthMm: 6200,
      topCut: 'square',
      topAngleDeg: 0,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: false,
      offcutLengthMm: 0,
      offcutReused: false,
      status: 'measured',
      packNumber: 1
    },
    {
      id: 'sh-g-06',
      sheetNumber: 'G-06',
      facetId: 'facet-gable-north',
      facetName: 'North Gable Main Slope',
      pitchDeg: pitch,
      orderLengthMm: 6200,
      cutLengthMm: 6200,
      topCut: 'square',
      topAngleDeg: 0,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: false,
      offcutLengthMm: 0,
      offcutReused: false,
      status: 'pending',
      packNumber: 1
    }
  ];

  // Hip Rake (generating angled offcuts)
  const facetHipSheets: LongRunSheetItem[] = [
    {
      id: 'sh-h-01',
      sheetNumber: 'H-01',
      facetId: 'facet-hip-east',
      facetName: 'East Hip Rake',
      pitchDeg: pitch,
      orderLengthMm: 6200,
      cutLengthMm: 5800,
      topCut: 'rake_right',
      topAngleDeg: 24,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: true,
      offcutLengthMm: 400,
      offcutReused: false,
      status: 'fixed',
      packNumber: 2,
      notes: 'Hip cut top right; short tip is scrap'
    },
    {
      id: 'sh-h-02',
      sheetNumber: 'H-02',
      facetId: 'facet-hip-east',
      facetName: 'East Hip Rake',
      pitchDeg: pitch,
      orderLengthMm: 6200,
      cutLengthMm: 4950,
      topCut: 'rake_right',
      topAngleDeg: 24,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: true,
      offcutLengthMm: 1250,
      offcutReused: true,
      offcutPairId: 'sh-v-03',
      offcutDestinationNotes: 'Flip 180° to Valley Plane Sheet V-03 (1,200mm required)',
      status: 'cut',
      packNumber: 2,
      notes: 'Offcut flipped and used on West Valley Sheet V-03'
    },
    {
      id: 'sh-h-03',
      sheetNumber: 'H-03',
      facetId: 'facet-hip-east',
      facetName: 'East Hip Rake',
      pitchDeg: pitch,
      orderLengthMm: 6200,
      cutLengthMm: 4100,
      topCut: 'rake_right',
      topAngleDeg: 24,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: true,
      offcutLengthMm: 2100,
      offcutReused: true,
      offcutPairId: 'sh-v-02',
      offcutDestinationNotes: 'Flip 180° to Valley Plane Sheet V-02 (2,050mm required)',
      status: 'cut',
      packNumber: 2,
      notes: '2.1m offcut perfectly covers Valley sheet V-02'
    },
    {
      id: 'sh-h-04',
      sheetNumber: 'H-04',
      facetId: 'facet-hip-east',
      facetName: 'East Hip Rake',
      pitchDeg: pitch,
      orderLengthMm: 6200,
      cutLengthMm: 3250,
      topCut: 'rake_right',
      topAngleDeg: 24,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: true,
      offcutLengthMm: 2950,
      offcutReused: true,
      offcutPairId: 'sh-v-01',
      offcutDestinationNotes: 'Flip 180° to Valley Plane Sheet V-01 (2,900mm required)',
      status: 'measured',
      packNumber: 2,
      notes: 'Offcut will be used for V-01 (saves 2.9m ordered sheet!)'
    },
    {
      id: 'sh-h-05',
      sheetNumber: 'H-05',
      facetId: 'facet-hip-east',
      facetName: 'East Hip Rake',
      pitchDeg: pitch,
      orderLengthMm: 3000,
      cutLengthMm: 2400,
      topCut: 'rake_right',
      topAngleDeg: 24,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: true,
      offcutLengthMm: 600,
      offcutReused: false,
      status: 'pending',
      packNumber: 2
    },
    {
      id: 'sh-h-06',
      sheetNumber: 'H-06',
      facetId: 'facet-hip-east',
      facetName: 'East Hip Rake',
      pitchDeg: pitch,
      orderLengthMm: 2000,
      cutLengthMm: 1550,
      topCut: 'rake_right',
      topAngleDeg: 24,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: true,
      offcutLengthMm: 450,
      offcutReused: false,
      status: 'pending',
      packNumber: 2
    }
  ];

  // Valley Junction (incorporating flipped offcuts from Hips!)
  const facetValleySheets: LongRunSheetItem[] = [
    {
      id: 'sh-v-01',
      sheetNumber: 'V-01',
      facetId: 'facet-valley-west',
      facetName: 'West Valley Junction',
      pitchDeg: pitch,
      orderLengthMm: 0, // Not ordered from mill! Sourced from offcut!
      cutLengthMm: 2900,
      topCut: 'square',
      topAngleDeg: 0,
      bottomCut: 'valley_left',
      bottomAngleDeg: 24,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: true,
      offcutLengthMm: 0,
      offcutReused: true,
      isFlippedOffcutPiece: true,
      offcutPairId: 'sh-h-04',
      offcutSourceNotes: 'Supplied 100% by flipped offcut from Sheet H-04',
      status: 'measured',
      packNumber: 2,
      notes: 'ZERO COST SHEET: Re-used from East Hip H-04 cut'
    },
    {
      id: 'sh-v-02',
      sheetNumber: 'V-02',
      facetId: 'facet-valley-west',
      facetName: 'West Valley Junction',
      pitchDeg: pitch,
      orderLengthMm: 0,
      cutLengthMm: 2050,
      topCut: 'square',
      topAngleDeg: 0,
      bottomCut: 'valley_left',
      bottomAngleDeg: 24,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: true,
      offcutLengthMm: 0,
      offcutReused: true,
      isFlippedOffcutPiece: true,
      offcutPairId: 'sh-h-03',
      offcutSourceNotes: 'Supplied 100% by flipped offcut from Sheet H-03',
      status: 'cut',
      packNumber: 2,
      notes: 'ZERO COST SHEET: Re-used from East Hip H-03 cut'
    },
    {
      id: 'sh-v-03',
      sheetNumber: 'V-03',
      facetId: 'facet-valley-west',
      facetName: 'West Valley Junction',
      pitchDeg: pitch,
      orderLengthMm: 0,
      cutLengthMm: 1200,
      topCut: 'square',
      topAngleDeg: 0,
      bottomCut: 'valley_left',
      bottomAngleDeg: 24,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: true,
      offcutLengthMm: 0,
      offcutReused: true,
      isFlippedOffcutPiece: true,
      offcutPairId: 'sh-h-02',
      offcutSourceNotes: 'Supplied 100% by flipped offcut from Sheet H-02',
      status: 'cut',
      packNumber: 2,
      notes: 'ZERO COST SHEET: Re-used from East Hip H-02 cut'
    },
    {
      id: 'sh-v-04',
      sheetNumber: 'V-04',
      facetId: 'facet-valley-west',
      facetName: 'West Valley Junction',
      pitchDeg: pitch,
      orderLengthMm: 4500,
      cutLengthMm: 4500,
      topCut: 'square',
      topAngleDeg: 0,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: false,
      offcutLengthMm: 0,
      offcutReused: false,
      status: 'pending',
      packNumber: 2
    },
    {
      id: 'sh-v-05',
      sheetNumber: 'V-05',
      facetId: 'facet-valley-west',
      facetName: 'West Valley Junction',
      pitchDeg: pitch,
      orderLengthMm: 4500,
      cutLengthMm: 4500,
      topCut: 'square',
      topAngleDeg: 0,
      bottomCut: 'square',
      bottomAngleDeg: 0,
      effectiveCoverMm: 762,
      eavesOverhangMm: 50,
      hasDiagonalCut: false,
      offcutLengthMm: 0,
      offcutReused: false,
      status: 'pending',
      packNumber: 2
    }
  ];

  const facets: RoofFacet[] = [
    {
      id: 'facet-gable-north',
      name: 'North Gable Main Slope',
      facetType: 'gable',
      pitchDeg: pitch,
      eaveWidthMm: 4572, // 6 sheets * 762mm
      slopeLengthMm: 6200,
      sheetCount: facetGableSheets.length,
      colorName,
      gauge,
      profileKey,
      purlinSpacingMm: 900,
      sheets: facetGableSheets
    },
    {
      id: 'facet-hip-east',
      name: 'East Hip Rake Slope',
      facetType: 'hip_rake',
      pitchDeg: pitch,
      eaveWidthMm: 4572,
      slopeLengthMm: 6200,
      sheetCount: facetHipSheets.length,
      colorName,
      gauge,
      profileKey,
      purlinSpacingMm: 900,
      sheets: facetHipSheets
    },
    {
      id: 'facet-valley-west',
      name: 'West Valley Junction',
      facetType: 'valley_junction',
      pitchDeg: pitch,
      eaveWidthMm: 3810,
      slopeLengthMm: 4500,
      sheetCount: facetValleySheets.length,
      colorName,
      gauge,
      profileKey,
      purlinSpacingMm: 900,
      sheets: facetValleySheets
    }
  ];

  // Standard everyday long-run flashings matching the job
  const flashings: LongRunFlashingItem[] = [
    {
      id: 'fl-01',
      mark: 'FL-01',
      name: 'Roll-Top Barge Flashing w/ Safety Kick',
      category: 'Barge / Gable',
      girthMm: 300,
      foldsCount: 3,
      standardLengthMm: 4000,
      quantity: 4,
      totalLengthLm: 16,
      effectiveLapMm: 150,
      colorName,
      gauge,
      leftMitre: '45° Apex Mitre',
      rightMitre: 'Eaves Stop-End Turn Down',
      status: 'ordered',
      notes: 'Classic rolled safety fold turn-down against raking barge board'
    },
    {
      id: 'fl-02',
      mark: 'FL-02',
      name: profileKey === 'corrugate_762' ? 'Corrugate Soft-Edge Ridge Cap' : 'Two-Piece Adjustable Ridge Cap',
      category: 'Ridge Cap',
      girthMm: 450,
      foldsCount: 4,
      standardLengthMm: 6000,
      quantity: 3,
      totalLengthLm: 18,
      effectiveLapMm: 150,
      colorName,
      gauge,
      softEdgeFitted: profileKey === 'corrugate_762',
      foamInfillIncluded: true,
      leftMitre: 'Gable Overhang Lap',
      rightMitre: 'Hip Apex 3-Way Junction',
      status: 'ordered',
      notes: profileKey === 'corrugate_762'
        ? 'Pre-fitted soft lead/zinc edge dressable strip for tight corrugate crest dressing'
        : 'Adjustable angle with EPDM foam profiled closures'
    },
    {
      id: 'fl-03',
      mark: 'FL-03',
      name: 'Internal Valley Gutter w/ Safety Hems',
      category: 'Internal Valley',
      girthMm: 450,
      foldsCount: 4,
      standardLengthMm: 4000,
      quantity: 3,
      totalLengthLm: 12,
      effectiveLapMm: 150,
      colorName,
      gauge: '0.55mm', // Valleys should always be 0.55mm
      leftMitre: 'Valley Head Infill',
      rightMitre: 'Gutter Bird-Beak Splay',
      status: 'pending',
      notes: 'Heavy duty 0.55mm gauge with 25mm double-turned safety hems and anti-capillary breaks'
    },
    {
      id: 'fl-04',
      mark: 'FL-04',
      name: 'Over-Apron Wall Abutment Flashing',
      category: 'Apron / Abutment',
      girthMm: 300,
      foldsCount: 3,
      standardLengthMm: 4000,
      quantity: 2,
      totalLengthLm: 8,
      effectiveLapMm: 150,
      colorName,
      gauge,
      softEdgeFitted: profileKey === 'corrugate_762',
      leftMitre: 'End Stop Cleat',
      rightMitre: 'Corner Wrap 100mm',
      status: 'pending',
      notes: 'Upstand 85mm min under weatherboard cavity with dressable edge'
    },
    {
      id: 'fl-05',
      mark: 'FL-05',
      name: 'Eaves Drip Edge / Gutter Starter',
      category: 'Eaves Drip Edge',
      girthMm: 150,
      foldsCount: 2,
      standardLengthMm: 3000,
      quantity: 6,
      totalLengthLm: 18,
      effectiveLapMm: 100,
      colorName,
      gauge,
      leftMitre: 'Square',
      rightMitre: 'Square',
      status: 'installed',
      notes: 'Directs underlay water safely into gutter without ponding on fascia'
    }
  ];

  return {
    facets,
    flashings,
    profileKey,
    gauge,
    colorName
  };
}

// ============================================================================
// 2. OFFCUT OPTIMIZATION & STEEL RECOVERY CALCULATOR
// ============================================================================

export interface OffcutOptimizationStats {
  totalSheetsOrdered: number;
  totalSheetsOnRoof: number;
  diagonalCutSheetsCount: number;
  offcutsReusedCount: number;
  linealMetresOrdered: number;
  linealMetresInstalled: number;
  linealMetresSaved: number;
  estimatedDollarSavingsNZD: number;
  wastePercent: number; // e.g. 3.2%
  wasteWithoutOptimizationPercent: number; // e.g. 14.8%
}

export function calculateOffcutStats(facets: RoofFacet[]): OffcutOptimizationStats {
  const allSheets = facets.flatMap((f) => f.sheets);
  const totalSheetsOnRoof = allSheets.length;

  let totalSheetsOrdered = 0;
  let linealMetresOrdered = 0;
  let linealMetresInstalled = 0;
  let diagonalCutSheetsCount = 0;
  let offcutsReusedCount = 0;
  let linealMetresSaved = 0;

  allSheets.forEach((s) => {
    linealMetresInstalled += s.cutLengthMm / 1000;
    if (s.hasDiagonalCut) {
      diagonalCutSheetsCount++;
    }
    if (s.isFlippedOffcutPiece) {
      offcutsReusedCount++;
      linealMetresSaved += s.cutLengthMm / 1000;
    } else {
      totalSheetsOrdered++;
      linealMetresOrdered += s.orderLengthMm / 1000;
    }
  });

  // Calculate waste
  const grossWasteMetres = Math.max(0, linealMetresOrdered - (linealMetresInstalled - linealMetresSaved));
  const wastePercent = linealMetresOrdered > 0 ? (grossWasteMetres / linealMetresOrdered) * 100 : 0;

  // If we didn't reuse offcuts, we'd have to order all sheets from mill
  const nonOptimizedOrderedMetres = linealMetresOrdered + linealMetresSaved;
  const nonOptimizedWasteMetres = grossWasteMetres + linealMetresSaved;
  const wasteWithoutOptimizationPercent = nonOptimizedOrderedMetres > 0
    ? (nonOptimizedWasteMetres / nonOptimizedOrderedMetres) * 100
    : 14.5;

  // Approx average retail/wholesale long-run price per lm ($18.50/lm for 0.40mm - $24.00/lm for 0.55mm)
  const ratePerLm = 21.50;
  const estimatedDollarSavingsNZD = Math.round(linealMetresSaved * ratePerLm);

  return {
    totalSheetsOrdered,
    totalSheetsOnRoof,
    diagonalCutSheetsCount,
    offcutsReusedCount,
    linealMetresOrdered: Number(linealMetresOrdered.toFixed(2)),
    linealMetresInstalled: Number(linealMetresInstalled.toFixed(2)),
    linealMetresSaved: Number(linealMetresSaved.toFixed(2)),
    estimatedDollarSavingsNZD,
    wastePercent: Number(wastePercent.toFixed(1)),
    wasteWithoutOptimizationPercent: Number(wasteWithoutOptimizationPercent.toFixed(1))
  };
}

// ============================================================================
// 3. HARDWARE & SCREW CALCULATION
// ============================================================================

export function calculateRoofHardwareRequirements(
  facets: RoofFacet[],
  profileKey: LongRunProfileKey,
  windZone: string = 'High'
): {
  totalScrews: number;
  screwBoxCount: number; // 250 / 500 pcs per box
  screwDescription: string;
  underlayRolls: number; // 50m² per roll
  foamInfillPairs: number;
  purlinRowsAverage: number;
} {
  const profileDef = LONGRUN_PROFILES[profileKey];
  const allSheets = facets.flatMap((f) => f.sheets);

  let totalAreaM2 = 0;
  let totalScrews = 0;
  let totalEavesLm = 0;
  let totalRidgeLm = 0;

  facets.forEach((facet) => {
    const widthM = (facet.sheetCount * (profileDef.coverMm || 762)) / 1000;
    const slopeM = facet.slopeLengthMm / 1000;
    totalAreaM2 += widthM * slopeM;
    totalEavesLm += widthM;
    if (facet.facetType === 'gable' || facet.facetType === 'hip_rake') {
      totalRidgeLm += widthM / 2;
    }

    // Purlin calculation: e.g. 6200mm slope / 900mm purlin spacing = ~7 purlins
    const purlinCount = Math.max(2, Math.ceil(facet.slopeLengthMm / (facet.purlinSpacingMm || 900)) + 1);

    // Fasteners:
    // NZMRM Code of Practice: 
    // - Eaves & Ridges: full crest fixing (every crest or every second depending on profile)
    // - High/Very High wind zones require heavier perimeter density
    facet.sheets.forEach(() => {
      const perSheetPerPurlin = profileDef.screwsPerSheetPerPurlin;
      totalScrews += purlinCount * perSheetPerPurlin;
    });
  });

  // Add 10% safety buffer for dropped screws
  totalScrews = Math.ceil(totalScrews * 1.1);
  const screwBoxCount = Math.ceil(totalScrews / 250);

  // Underlay: Area + 15% for 150mm laps
  const underlayAreaRequired = totalAreaM2 * 1.15;
  const underlayRolls = Math.max(1, Math.ceil(underlayAreaRequired / 50));

  // Profiled foam closures: Eaves + Ridge length
  const foamInfillPairs = Math.ceil((totalEavesLm + totalRidgeLm) / 0.9);

  return {
    totalScrews,
    screwBoxCount,
    screwDescription: profileDef.screwType,
    underlayRolls,
    foamInfillPairs,
    purlinRowsAverage: 7
  };
}

// ============================================================================
// 4. EXPORT MANIFESTS FOR SUPPLIERS & GROUND CUTTERS
// ============================================================================

export function generateSupplierOrderText(
  project: Project,
  facets: RoofFacet[],
  flashings: LongRunFlashingItem[],
  profileKey: LongRunProfileKey,
  gauge: string,
  colorName: string,
  supplierName: string
): string {
  const profileDef = LONGRUN_PROFILES[profileKey];
  const stats = calculateOffcutStats(facets);
  const hardware = calculateRoofHardwareRequirements(facets, profileKey, project.windZone);

  // Group ordered sheets by length
  const orderedSheets = facets.flatMap((f) => f.sheets).filter((s) => !s.isFlippedOffcutPiece && s.orderLengthMm > 0);
  const lengthGroups: Record<number, number> = {};
  orderedSheets.forEach((s) => {
    lengthGroups[s.orderLengthMm] = (lengthGroups[s.orderLengthMm] || 0) + 1;
  });

  const sortedLengths = Object.keys(lengthGroups)
    .map(Number)
    .sort((a, b) => b - a);

  let sheetScheduleText = '';
  sortedLengths.forEach((len) => {
    sheetScheduleText += `  • ${lengthGroups[len]} sheets @ ${(len / 1000).toFixed(3)}m (${len}mm)\n`;
  });

  let flashingScheduleText = '';
  flashings.forEach((fl) => {
    flashingScheduleText += `  • ${fl.mark} - ${fl.name}: ${fl.quantity} pcs @ ${(fl.standardLengthMm / 1000).toFixed(1)}m (Girth: ${fl.girthMm}mm, ${fl.colorName})\n`;
  });

  return `======================================================================
LONGRUN ROOFING ORDER MANIFEST & ROLLFORMER CUT SCHEDULE
Supplier: ${supplierName}
Project: ${project.projectNumber} · ${project.title}
Delivery Site: ${project.siteAddress}
Contact: ${project.headContractor || 'Site Foreman'}
Date Generated: ${new Date().toLocaleDateString('en-NZ')}
======================================================================

1. ROOFING SHEET SCHEDULE
Profile: ${profileDef.name}
Effective Cover: ${profileDef.coverMm}mm
Material / Finish: ${colorName} (${gauge} G550 High-Tensile)
Total Sheets to Roll: ${stats.totalSheetsOrdered} pcs
Total Lineal Metres: ${stats.linealMetresOrdered} lm
Longest Sheet: ${(Math.max(...sortedLengths, 0) / 1000).toFixed(3)}m

CUT LENGTHS (ORDER LIST):
${sheetScheduleText}
* Note: Onsite offcut optimization applied! ${stats.offcutsReusedCount} sheets (${stats.linealMetresSaved} lm) will be harvested from hip/valley cuts on site.

----------------------------------------------------------------------
2. FLASHINGS SCHEDULE (COLOR MATCHED ${colorName})
${flashingScheduleText}

----------------------------------------------------------------------
3. HARDWARE & FIXINGS PACK
  • Screws: ${hardware.totalScrews} pcs (${hardware.screwBoxCount} x 250pc boxes)
    Specification: ${hardware.screwDescription}
  • Underlay: ${hardware.underlayRolls} rolls (Heavy duty self-supporting synthetic 50m² rolls)
  • Foam Infill Closures: ${hardware.foamInfillPairs} pairs (Ridge & Eaves profiled)

----------------------------------------------------------------------
4. SITE DELIVERY & TRANSPORT NOTES
  • HIAB crane truck required for bundle staging.
  • Pack sheets in labeled bundles by Facet / Elevation.
  • Max bundle weight: Under 1.5 tonne per lift.
  • Prevailing wind: Lay from North to South (lapping away from weather).
======================================================================`;
}
