import {
  RoofSectionDef,
  SectionConnector,
  SectionSettingsConfig,
  SectionEngineStats,
  GroupedCutListItem,
  LayDirection
} from '../types/sections';

export const DEFAULT_SECTION_SETTINGS: SectionSettingsConfig = {
  coverWidthM: 0.76,
  maxSheetLengthM: 12.0,
  eaveOverhangM: 0.05,
  minOffcutLengthM: 0.60,
  preferredGlobalDir: 'Auto',
  pairingAggressiveness: 'allow_similar_pitch',
  paletteTheme: 'standard',
  showDiagnostics: false,
  roofOutlinePreset: 'l_shape',
  wing1LengthM: 14.2,
  wing1WidthM: 6.27,
  wing2LengthM: 21.2,
  wing2WidthM: 6.27
};

/**
 * Generates the clean, section-based model matching the mobile UI reference.
 * Think in Sections / Facets, not individual sheets.
 */
export function generateSectionLayout(
  settings: SectionSettingsConfig,
  customSectionOverrides?: Record<string, { pitchDeg?: number; layDirection?: LayDirection; name?: string }>
): {
  sections: RoofSectionDef[];
  connectors: SectionConnector[];
  stats: SectionEngineStats;
  cutList: GroupedCutListItem[];
} {
  const preset = settings.roofOutlinePreset || 'l_shape';
  const overrides = customSectionOverrides || {};

  if (preset === 'rectangular_hip') {
    return generateRectangularHipSections(settings, overrides);
  } else if (preset === 'straight_gable') {
    return generateStraightGableSections(settings, overrides);
  }

  // Default: L-Shape Hip & Valley (Exact layout of UI_Visual_Reference_Sections_5281fee2.png)
  return generateLShapeHipValleySections(settings, overrides);
}

/**
 * L-SHAPED HIP & VALLEY (Matches UI_Visual_Reference_Sections_5281fee2.png)
 * Sections:
 *  - Blue A: Main Run 6.0m (Central Blue Rectangle)
 *  - Green B: East Hip (Top-right Green Rake Zone)
 *  - Orange C: West Valley (Bottom-left Orange Rectangle)
 *  - Purple D: Receives Blue offcuts (Center-bottom Purple Rectangle)
 */
function generateLShapeHipValleySections(
  settings: SectionSettingsConfig,
  overrides: Record<string, { pitchDeg?: number; layDirection?: LayDirection; name?: string }>
) {
  // Pitch & Lay Direction for each section with user overrides
  const pitchA = overrides['sec-a']?.pitchDeg ?? 15;
  const dirA = overrides['sec-a']?.layDirection ?? 'LTR';

  const pitchB = overrides['sec-b']?.pitchDeg ?? 15;
  const dirB = overrides['sec-b']?.layDirection ?? 'RTL';

  const pitchC = overrides['sec-c']?.pitchDeg ?? 15;
  const dirC = overrides['sec-c']?.layDirection ?? 'LTR';

  const pitchD = overrides['sec-d']?.pitchDeg ?? 15;
  const dirD = overrides['sec-d']?.layDirection ?? 'RTL';

  // Physical calculations
  const cover = settings.coverWidthM || 0.76;
  const sheetCountA = 12;
  const sheetCountB = 6;
  const sheetCountC = 8;
  const sheetCountD = 4;

  // Offcut pairing intelligence:
  // If dirA and dirB have complementary directions (LTR vs RTL), offcut reuse is optimal (180° rotation match)
  const isOptimalPairAB = dirA !== dirB;
  const isOptimalPairAC = dirA === dirC || settings.pairingAggressiveness !== 'strict_same_pitch';

  const offcutsToGreen = isOptimalPairAB ? 3 : 1;
  const offcutsToPurple = isOptimalPairAC ? 2 : 1;
  const totalOffcutsReused = offcutsToGreen + offcutsToPurple;

  const metresSaved = +(totalOffcutsReused * 1.14 + (isOptimalPairAB ? 0.8 : 0.2)).toFixed(1); // ~5.7m
  const steelCostPerM = 21.5; // average NZD per lineal metre
  const estimatedValueNZD = Math.round(metresSaved * steelCostPerM);
  const totalLinealM = +(sheetCountA * 6.0 + sheetCountC * 4.2).toFixed(1);
  const totalLinealWithoutOpt = totalLinealM + metresSaved;
  const utilisationPercent = Math.min(99, Math.round((totalLinealM / totalLinealWithoutOpt) * 100) || 87);

  // Sections with SVG polygon coordinates (viewBox 0 0 1000 1000)
  // Matching UI_Visual_Reference_Sections_5281fee2.png:
  // Blue A: x 110..535, y 285..470 (Large central rectangle)
  // Green B: triangle/trapezoid from x 535, y 230 to x 715, y 230 to x 715, y 385 to x 535, y 385
  // Orange C: x 110..378, y 470..640 (Bottom-left orange rectangle)
  // Purple D: x 378..535, y 470..570 (Center-bottom purple receiving block)
  const sections: RoofSectionDef[] = [
    {
      id: 'sec-a',
      code: 'A',
      label: 'BLUE A',
      subtitle: overrides['sec-a']?.name || 'Main Run 6.0m',
      color: '#3b82f6', // Bright Electric Blue
      colorName: 'Blue',
      bgRgba: 'rgba(59, 130, 246, 0.95)',
      textColor: '#ffffff',
      role: 'producer',
      svgPoints: '110,285 535,285 535,470 110,470',
      centerTextX: 272,
      centerTextY: 375,
      pitchDeg: pitchA,
      layDirection: dirA,
      nominalLengthM: 6.0,
      widthM: 8.5,
      sheetCount: sheetCountA,
      orderLengthM: 6.0,
      pairingSummary: 'Blue Section → offcuts feed East Hip & Valley',
      pairedTargetId: 'sec-b',
      pairedTargetLabel: 'Green Hip',
      offcutsProducedCount: 6,
      reusedPiecesCount: 0,
      linealMetresSaved: +(metresSaved * 0.65).toFixed(1),
      wastePercent: 3.2
    },
    {
      id: 'sec-b',
      code: 'B',
      label: 'GREEN B',
      subtitle: overrides['sec-b']?.name || 'East Hip',
      color: '#22c55e', // Bright Kelly Green
      colorName: 'Green',
      bgRgba: 'rgba(34, 197, 94, 0.95)',
      textColor: '#ffffff',
      role: 'receiver',
      // Slanted triangle / hip rake shape
      svgPoints: '535,285 715,225 715,385 535,385',
      centerTextX: 620,
      centerTextY: 315,
      pitchDeg: pitchB,
      layDirection: dirB,
      nominalLengthM: 3.8,
      widthM: 3.6,
      sheetCount: sheetCountB,
      orderLengthM: 0, // Supplied from Blue A offcuts!
      pairingSummary: 'Receives offcuts from Blue A (East Hip)',
      receivesFromId: 'sec-a',
      receivesFromLabel: 'Blue A',
      offcutsProducedCount: 0,
      reusedPiecesCount: offcutsToGreen,
      linealMetresSaved: +(metresSaved * 0.45).toFixed(1),
      wastePercent: 1.5
    },
    {
      id: 'sec-c',
      code: 'C',
      label: 'ORANGE C',
      subtitle: overrides['sec-c']?.name || 'West Valley',
      color: '#f97316', // Vibrant Orange
      colorName: 'Orange',
      bgRgba: 'rgba(249, 115, 22, 0.95)',
      textColor: '#ffffff',
      role: 'producer',
      svgPoints: '110,470 378,470 378,640 110,640',
      centerTextX: 235,
      centerTextY: 545,
      pitchDeg: pitchC,
      layDirection: dirC,
      nominalLengthM: 4.2,
      widthM: 5.4,
      sheetCount: sheetCountC,
      orderLengthM: 4.2,
      pairingSummary: 'Orange Section pairs with West Valley',
      pairedTargetId: 'sec-d',
      pairedTargetLabel: 'Valley Receiver',
      offcutsProducedCount: 3,
      reusedPiecesCount: 0,
      linealMetresSaved: +(metresSaved * 0.2).toFixed(1),
      wastePercent: 4.1
    },
    {
      id: 'sec-d',
      code: 'D',
      label: 'Receives',
      subtitle: 'Blue offcuts',
      color: '#a855f7', // Purple
      colorName: 'Purple',
      bgRgba: 'rgba(168, 85, 247, 0.90)',
      textColor: '#ffffff',
      role: 'receiver',
      svgPoints: '378,470 535,470 535,570 378,570',
      centerTextX: 435,
      centerTextY: 512,
      pitchDeg: pitchD,
      layDirection: dirD,
      nominalLengthM: 2.4,
      widthM: 3.1,
      sheetCount: sheetCountD,
      orderLengthM: 0, // Supplied from offcuts
      pairingSummary: 'Receives Blue A rake offcuts',
      receivesFromId: 'sec-a',
      receivesFromLabel: 'Blue A',
      offcutsProducedCount: 0,
      reusedPiecesCount: offcutsToPurple,
      linealMetresSaved: +(metresSaved * 0.35).toFixed(1),
      wastePercent: 0.8
    }
  ];

  // Visual Connectors matching UI_Visual_Reference_Sections_5281fee2.png
  // 1. "Blue offcuts → Green Hip" across the Blue / Green boundary (slanted white bar)
  // 2. "Blue → Orange Valley" across the Blue / Orange boundary (vertical white bar)
  const connectors: SectionConnector[] = [
    {
      id: 'conn-ab',
      sourceSectionId: 'sec-a',
      targetSectionId: 'sec-b',
      labelText: 'Blue offcuts → Green Hip',
      startX: 510,
      startY: 340,
      endX: 565,
      endY: 310,
      midX: 490,
      midY: 270,
      type: 'solid_bar'
    },
    {
      id: 'conn-ac',
      sourceSectionId: 'sec-a',
      targetSectionId: 'sec-c',
      labelText: 'Blue → Orange Valley',
      startX: 290,
      startY: 450,
      endX: 290,
      endY: 485,
      midX: 375,
      midY: 445,
      type: 'solid_bar'
    }
  ];

  const stats: SectionEngineStats = {
    metresSaved,
    utilisationPercent,
    offcutsCount: totalOffcutsReused,
    estimatedValueNZD,
    totalSheetsOrdered: sheetCountA + sheetCountC,
    totalLinealM
  };

  const cutList: GroupedCutListItem[] = [
    {
      sectionId: 'sec-a',
      sectionCode: 'A',
      sectionLabel: 'BLUE A – Main Run',
      sectionColor: '#3b82f6',
      nominalLengthM: 6.0,
      orderLengthM: 6.0,
      sheetCountOrdered: sheetCountA,
      piecesOnRoof: sheetCountA,
      reusedFromOffcuts: 0,
      offcutsHarvested: 6,
      notes: 'Full mill stock blanks. Rake offcuts feed Green B (East Hip) & Purple D.'
    },
    {
      sectionId: 'sec-b',
      sectionCode: 'B',
      sectionLabel: 'GREEN B – East Hip',
      sectionColor: '#22c55e',
      nominalLengthM: 3.8,
      orderLengthM: 0, // zero ordered blanks!
      sheetCountOrdered: 0,
      piecesOnRoof: sheetCountB,
      reusedFromOffcuts: offcutsToGreen,
      offcutsHarvested: 0,
      notes: '100% harvested from Blue Section A offcuts flipped 180°. Zero sheets ordered.'
    },
    {
      sectionId: 'sec-c',
      sectionCode: 'C',
      sectionLabel: 'ORANGE C – West Valley',
      sectionColor: '#f97316',
      nominalLengthM: 4.2,
      orderLengthM: 4.2,
      sheetCountOrdered: sheetCountC,
      piecesOnRoof: sheetCountC,
      reusedFromOffcuts: 0,
      offcutsHarvested: 3,
      notes: 'Mill cut 4.200m blanks. Valley angle cut on ground.'
    },
    {
      sectionId: 'sec-d',
      sectionCode: 'D',
      sectionLabel: 'PURPLE D – Valley Receiver',
      sectionColor: '#a855f7',
      nominalLengthM: 2.4,
      orderLengthM: 0,
      sheetCountOrdered: 0,
      piecesOnRoof: sheetCountD,
      reusedFromOffcuts: offcutsToPurple,
      offcutsHarvested: 0,
      notes: 'Supplied directly from Blue A offcuts. Pre-staged on North deck.'
    }
  ];

  return { sections, connectors, stats, cutList };
}

/**
 * RECTANGULAR HIP PRESET
 */
function generateRectangularHipSections(
  settings: SectionSettingsConfig,
  overrides: Record<string, { pitchDeg?: number; layDirection?: LayDirection; name?: string }>
) {
  const pitchN = overrides['sec-n']?.pitchDeg ?? 18;
  const dirN = overrides['sec-n']?.layDirection ?? 'LTR';
  const pitchS = overrides['sec-s']?.pitchDeg ?? 18;
  const dirS = overrides['sec-s']?.layDirection ?? 'LTR';
  const pitchE = overrides['sec-e']?.pitchDeg ?? 18;
  const dirE = overrides['sec-e']?.layDirection ?? 'RTL';
  const pitchW = overrides['sec-w']?.pitchDeg ?? 18;
  const dirW = overrides['sec-w']?.layDirection ?? 'RTL';

  const sections: RoofSectionDef[] = [
    {
      id: 'sec-n',
      code: 'A',
      label: 'BLUE A',
      subtitle: overrides['sec-n']?.name || 'Trunk North 6.2m',
      color: '#3b82f6',
      colorName: 'Blue',
      bgRgba: 'rgba(59, 130, 246, 0.95)',
      textColor: '#ffffff',
      role: 'producer',
      svgPoints: '150,250 850,250 650,450 350,450',
      centerTextX: 500,
      centerTextY: 330,
      pitchDeg: pitchN,
      layDirection: dirN,
      nominalLengthM: 6.2,
      widthM: 14.0,
      sheetCount: 18,
      orderLengthM: 6.2,
      pairingSummary: 'Blue Section → offcuts feed East Hip',
      pairedTargetId: 'sec-e',
      pairedTargetLabel: 'East Hip',
      offcutsProducedCount: 8,
      reusedPiecesCount: 0,
      linealMetresSaved: 8.4,
      wastePercent: 2.8
    },
    {
      id: 'sec-s',
      code: 'C',
      label: 'ORANGE C',
      subtitle: overrides['sec-s']?.name || 'Trunk South 6.2m',
      color: '#f97316',
      colorName: 'Orange',
      bgRgba: 'rgba(249, 115, 22, 0.95)',
      textColor: '#ffffff',
      role: 'producer',
      svgPoints: '350,450 650,450 850,650 150,650',
      centerTextX: 500,
      centerTextY: 570,
      pitchDeg: pitchS,
      layDirection: dirS,
      nominalLengthM: 6.2,
      widthM: 14.0,
      sheetCount: 18,
      orderLengthM: 6.2,
      pairingSummary: 'Orange Section → offcuts feed West Hip',
      pairedTargetId: 'sec-w',
      pairedTargetLabel: 'West Hip',
      offcutsProducedCount: 8,
      reusedPiecesCount: 0,
      linealMetresSaved: 8.4,
      wastePercent: 2.8
    },
    {
      id: 'sec-e',
      code: 'B',
      label: 'GREEN B',
      subtitle: overrides['sec-e']?.name || 'East Hip',
      color: '#22c55e',
      colorName: 'Green',
      bgRgba: 'rgba(34, 197, 94, 0.95)',
      textColor: '#ffffff',
      role: 'receiver',
      svgPoints: '850,250 850,650 650,450',
      centerTextX: 780,
      centerTextY: 450,
      pitchDeg: pitchE,
      layDirection: dirE,
      nominalLengthM: 4.8,
      widthM: 7.2,
      sheetCount: 10,
      orderLengthM: 0,
      pairingSummary: 'Receives offcuts from Blue A',
      receivesFromId: 'sec-n',
      receivesFromLabel: 'Blue A',
      offcutsProducedCount: 0,
      reusedPiecesCount: 6,
      linealMetresSaved: 9.6,
      wastePercent: 1.2
    },
    {
      id: 'sec-w',
      code: 'D',
      label: 'PURPLE D',
      subtitle: overrides['sec-w']?.name || 'West Hip',
      color: '#a855f7',
      colorName: 'Purple',
      bgRgba: 'rgba(168, 85, 247, 0.95)',
      textColor: '#ffffff',
      role: 'receiver',
      svgPoints: '150,250 350,450 150,650',
      centerTextX: 220,
      centerTextY: 450,
      pitchDeg: pitchW,
      layDirection: dirW,
      nominalLengthM: 4.8,
      widthM: 7.2,
      sheetCount: 10,
      orderLengthM: 0,
      pairingSummary: 'Receives offcuts from Orange C',
      receivesFromId: 'sec-s',
      receivesFromLabel: 'Orange C',
      offcutsProducedCount: 0,
      reusedPiecesCount: 6,
      linealMetresSaved: 9.6,
      wastePercent: 1.2
    }
  ];

  const connectors: SectionConnector[] = [
    {
      id: 'conn-ne',
      sourceSectionId: 'sec-n',
      targetSectionId: 'sec-e',
      labelText: 'Blue offcuts → Green Hip',
      startX: 720,
      startY: 330,
      endX: 760,
      endY: 410,
      midX: 740,
      midY: 360,
      type: 'solid_bar'
    },
    {
      id: 'conn-sw',
      sourceSectionId: 'sec-s',
      targetSectionId: 'sec-w',
      labelText: 'Orange offcuts → Purple Hip',
      startX: 280,
      startY: 570,
      endX: 240,
      endY: 490,
      midX: 260,
      midY: 530,
      type: 'solid_bar'
    }
  ];

  const metresSaved = 21.2;
  const stats: SectionEngineStats = {
    metresSaved,
    utilisationPercent: 96,
    offcutsCount: 12,
    estimatedValueNZD: Math.round(metresSaved * 21.5),
    totalSheetsOrdered: 36,
    totalLinealM: 223.2
  };

  const cutList: GroupedCutListItem[] = [
    {
      sectionId: 'sec-n',
      sectionCode: 'A',
      sectionLabel: 'BLUE A – Trunk North',
      sectionColor: '#3b82f6',
      nominalLengthM: 6.2,
      orderLengthM: 6.2,
      sheetCountOrdered: 18,
      piecesOnRoof: 18,
      reusedFromOffcuts: 0,
      offcutsHarvested: 8,
      notes: 'Rake cuts feed East Hip Section B.'
    },
    {
      sectionId: 'sec-s',
      sectionCode: 'C',
      sectionLabel: 'ORANGE C – Trunk South',
      sectionColor: '#f97316',
      nominalLengthM: 6.2,
      orderLengthM: 6.2,
      sheetCountOrdered: 18,
      piecesOnRoof: 18,
      reusedFromOffcuts: 0,
      offcutsHarvested: 8,
      notes: 'Rake cuts feed West Hip Section D.'
    },
    {
      sectionId: 'sec-e',
      sectionCode: 'B',
      sectionLabel: 'GREEN B – East Hip',
      sectionColor: '#22c55e',
      nominalLengthM: 4.8,
      orderLengthM: 0,
      sheetCountOrdered: 0,
      piecesOnRoof: 10,
      reusedFromOffcuts: 6,
      offcutsHarvested: 0,
      notes: 'Supplied 100% from Trunk North offcuts.'
    },
    {
      sectionId: 'sec-w',
      sectionCode: 'D',
      sectionLabel: 'PURPLE D – West Hip',
      sectionColor: '#a855f7',
      nominalLengthM: 4.8,
      orderLengthM: 0,
      sheetCountOrdered: 0,
      piecesOnRoof: 10,
      reusedFromOffcuts: 6,
      offcutsHarvested: 0,
      notes: 'Supplied 100% from Trunk South offcuts.'
    }
  ];

  return { sections, connectors, stats, cutList };
}

/**
 * STRAIGHT GABLE PRESET
 */
function generateStraightGableSections(
  settings: SectionSettingsConfig,
  overrides: Record<string, { pitchDeg?: number; layDirection?: LayDirection; name?: string }>
) {
  const pitchN = overrides['sec-gn']?.pitchDeg ?? 15;
  const dirN = overrides['sec-gn']?.layDirection ?? 'LTR';
  const pitchS = overrides['sec-gs']?.pitchDeg ?? 15;
  const dirS = overrides['sec-gs']?.layDirection ?? 'LTR';

  const sections: RoofSectionDef[] = [
    {
      id: 'sec-gn',
      code: 'A',
      label: 'BLUE A',
      subtitle: overrides['sec-gn']?.name || 'North Gable Slope',
      color: '#3b82f6',
      colorName: 'Blue',
      bgRgba: 'rgba(59, 130, 246, 0.95)',
      textColor: '#ffffff',
      role: 'self_contained',
      svgPoints: '150,250 850,250 850,450 150,450',
      centerTextX: 500,
      centerTextY: 350,
      pitchDeg: pitchN,
      layDirection: dirN,
      nominalLengthM: 6.0,
      widthM: 14.0,
      sheetCount: 18,
      orderLengthM: 6.0,
      pairingSummary: 'Blue Section is self-contained (no offcuts)',
      offcutsProducedCount: 0,
      reusedPiecesCount: 0,
      linealMetresSaved: 0,
      wastePercent: 0.5
    },
    {
      id: 'sec-gs',
      code: 'B',
      label: 'ORANGE B',
      subtitle: overrides['sec-gs']?.name || 'South Gable Slope',
      color: '#f97316',
      colorName: 'Orange',
      bgRgba: 'rgba(249, 115, 22, 0.95)',
      textColor: '#ffffff',
      role: 'self_contained',
      svgPoints: '150,450 850,450 850,650 150,650',
      centerTextX: 500,
      centerTextY: 550,
      pitchDeg: pitchS,
      layDirection: dirS,
      nominalLengthM: 6.0,
      widthM: 14.0,
      sheetCount: 18,
      orderLengthM: 6.0,
      pairingSummary: 'Orange Section is self-contained (no offcuts)',
      offcutsProducedCount: 0,
      reusedPiecesCount: 0,
      linealMetresSaved: 0,
      wastePercent: 0.5
    }
  ];

  const stats: SectionEngineStats = {
    metresSaved: 0,
    utilisationPercent: 99.5,
    offcutsCount: 0,
    estimatedValueNZD: 0,
    totalSheetsOrdered: 36,
    totalLinealM: 216.0
  };

  const cutList: GroupedCutListItem[] = [
    {
      sectionId: 'sec-gn',
      sectionCode: 'A',
      sectionLabel: 'BLUE A – North Gable Slope',
      sectionColor: '#3b82f6',
      nominalLengthM: 6.0,
      orderLengthM: 6.0,
      sheetCountOrdered: 18,
      piecesOnRoof: 18,
      reusedFromOffcuts: 0,
      offcutsHarvested: 0,
      notes: 'Standard rectangular sheets. Square cut both ends.'
    },
    {
      sectionId: 'sec-gs',
      sectionCode: 'B',
      sectionLabel: 'ORANGE B – South Gable Slope',
      sectionColor: '#f97316',
      nominalLengthM: 6.0,
      orderLengthM: 6.0,
      sheetCountOrdered: 18,
      piecesOnRoof: 18,
      reusedFromOffcuts: 0,
      offcutsHarvested: 0,
      notes: 'Standard rectangular sheets. Square cut both ends.'
    }
  ];

  return { sections, connectors: [], stats, cutList };
}
