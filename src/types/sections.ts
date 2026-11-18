export type SectionColorKey = 'blue' | 'green' | 'orange' | 'purple' | 'amber' | 'emerald' | 'rose' | 'cyan';

export type LayDirection = 'LTR' | 'RTL';

export interface SectionConnector {
  id: string;
  sourceSectionId: string;
  targetSectionId: string;
  labelText: string; // e.g. "Blue offcuts → Green Hip"
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  midX: number;
  midY: number;
  type: 'solid_bar' | 'dashed_arrow';
}

export interface RoofSectionDef {
  id: string; // e.g. "sec-a"
  code: string; // "A", "B", "C", "D"
  label: string; // "BLUE A", "GREEN B", "ORANGE C"
  subtitle: string; // "Main Run 6.0m", "East Hip", "West Valley"
  color: string; // "#2563eb"
  colorName: string; // "Blue", "Green", "Orange", "Purple"
  bgRgba: string; // "rgba(37, 99, 235, 0.95)"
  textColor: string;
  role: 'producer' | 'receiver' | 'self_contained';
  
  // Normalized 0..1000 coordinate polygon for responsive SVG rendering
  svgPoints: string;
  centerTextX: number;
  centerTextY: number;
  
  // Section parameters
  pitchDeg: number;
  layDirection: LayDirection;
  nominalLengthM: number;
  widthM: number;
  sheetCount: number;
  orderLengthM: number;
  
  // Offcut declarations
  pairingSummary: string; // e.g. "Blue offcuts → Green Hip"
  pairedTargetId?: string;
  pairedTargetLabel?: string;
  receivesFromId?: string;
  receivesFromLabel?: string;
  
  // Statistics
  reusedPiecesCount: number;
  offcutsProducedCount: number;
  linealMetresSaved: number;
  wastePercent: number;
}

export interface SectionSettingsConfig {
  coverWidthM: number; // default 0.76 (760mm)
  maxSheetLengthM: number; // default 12.0m
  eaveOverhangM: number; // default 0.05m (50mm)
  minOffcutLengthM: number; // default 0.60m (600mm)
  preferredGlobalDir: 'Auto' | 'LTR' | 'RTL' | 'Wind';
  pairingAggressiveness: 'strict_same_pitch' | 'allow_similar_pitch' | 'maximum_yield';
  paletteTheme: 'standard' | 'high_contrast' | 'hi_vis' | 'earth';
  showDiagnostics: boolean;
  roofOutlinePreset: 'l_shape' | 'rectangular_hip' | 'straight_gable';
  wing1LengthM: number;
  wing1WidthM: number;
  wing2LengthM: number;
  wing2WidthM: number;
}

export interface SectionEngineStats {
  metresSaved: number;
  utilisationPercent: number;
  offcutsCount: number;
  estimatedValueNZD: number;
  totalSheetsOrdered: number;
  totalLinealM: number;
}

export interface GroupedCutListItem {
  sectionId: string;
  sectionCode: string;
  sectionLabel: string;
  sectionColor: string;
  nominalLengthM: number;
  orderLengthM: number;
  sheetCountOrdered: number;
  piecesOnRoof: number;
  reusedFromOffcuts: number;
  offcutsHarvested: number;
  notes: string;
}
