export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export type EdgeType =
  | 'unclassified'
  | 'outline'
  | 'ridge'
  | 'hip'
  | 'valley'
  | 'verge'
  | 'wall'
  | 'rake'
  | 'apron'
  | 'change-of-pitch';

export type SkeletonLineType =
  | 'ridge'
  | 'hip'
  | 'valley'
  | 'eave'
  | 'barge'
  | 'wall'
  | 'rake'
  | 'apron'
  | 'change-of-pitch'
  | 'unclassified';

export interface PlanEdge {
  id: string;
  from: Point2D;
  to: Point2D;
  type: EdgeType;
  eaveHeightM?: number;
  levelId?: string;
  /** Independent wall toggle — assigning a wall never alters roof geometry */
  hasWall?: boolean;
  /** Horizontal eave width / overhang setback (metres) moving the wall inward beneath the roof plane */
  eaveSetbackM?: number;
  /** Optional explicit bottom Z elevation for stepped walls */
  wallBottomZ?: number;
  /** Optional bidirectional link to matching WallFacet id */
  wallFacetId?: string;
}

export interface RoofHoleRing {
  id: string;
  name?: string;
  points: Point2D[];
  edges: PlanEdge[];
}

export interface RoofOutline {
  id: string;
  points: Point2D[];
  edges: PlanEdge[];
  holes?: RoofHoleRing[];
  levelId?: string;
}

export interface SkeletonLine {
  id: string;
  from: Point2D;
  to: Point2D;
  suggestedType: SkeletonLineType;
  levelId?: string;
  /** True if the user explicitly split this ridge so colinear auto-merge should preserve the split */
  manualSplit?: boolean;
}

export interface RoofLevel {
  id: string;
  code: string; // e.g. 'L1', 'L2', 'L3'
  name: string; // e.g. 'Lower Roof (1F)', 'Upper Storey (2F)'
  eaveHeightM: number; // Base Z-axis wall height in metres
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  /** Outline edge IDs whose roof plane was explicitly deleted by the user until explicitly rebuilt */
  suppressedPlaneEdgeIds?: string[];
}

export interface RoofWallSegment {
  id: string;
  levelId: string;
  edgeId: string;
  from: Point2D;
  to: Point2D;
  wallFrom: Point2D;
  wallTo: Point2D;
  eaveSetbackM: number;
  lengthM: number;
  topZ: number;
  bottomZ: number;
  topProfilePoints3D: Point3D[];
  wallKind: 'exterior_eave' | 'gable_end' | 'abutment_wall' | 'step_riser';
}

export interface PlaneEdgeRef {
  edgeId: string;
  type: 'eave' | 'ridge' | 'hip' | 'valley' | 'verge' | 'wall';
}

export type RoofAssetType = 'skylight' | 'chimney' | 'mono_dormer' | 'gable_dormer';

export interface RoofAsset {
  id: string;
  type: RoofAssetType;
  planeId: string;
  center: Point2D;
  widthM: number;
  depthM: number;
  dormerPitchDeg?: number;
  heightAboveRoofM?: number;
  label?: string;
  /** Distance along host plane slope from eave edge to lower/front edge of penetration (m) */
  distFromEaveM?: number;
  /** Distance along host plane slope from top apex/ridge edge down to upper/back edge of penetration (m) */
  distFromApexM?: number;
  /** Horizontal offset from host plane left eave corner to penetration center along eave (m) */
  offsetFromLeftM?: number;
}

export interface PitchBreakLine {
  id: string;
  planeId: string;
  splitPlanDistM: number;
  lowerPitchDeg: number;
  label?: string;
}

export interface PlaneAperture {
  assetId: string;
  type: RoofAssetType;
  label?: string;
  uMin: number;
  uMax: number;
  vMin: number; // developed slope coordinate
  vMax: number; // developed slope coordinate
  planPolygon: Point2D[];
  developedPolygon?: Point2D[];
}

export interface RoofJunctionNode {
  id: string;
  mode: 'hipped' | 'gable';
  point: Point2D;
  ridgeId: string;
  hipIds: string[];
  eaveEdgeId: string;
  cornerA: Point2D;
  cornerB: Point2D;
  gableApex: Point2D;
}

export interface RoofPlane {
  id: string;
  code: string; // e.g. "A", "B", "C", "D"
  label: string; // e.g. "BLUE A", "GREEN B"
  name: string; // e.g. "Main Run 6.0m", "East Hip"
  color: string; // e.g. "#3b82f6"
  planPolygon: Point2D[];
  eaveEdgeId: string;
  /** Edge that sheets run perpendicular to (defaults to eaveEdgeId) */
  sheetRunEdgeId?: string;
  pitchDeg: number;
  underlapSide: 'left' | 'right';
  eaveHeightM?: number;
  developedPolygon?: Point2D[];
  runDirection?: Point2D;
  slopeLength?: number;
  /** Optional site-measured / ordered full sheet length (metres, 1mm precision, e.g. 5.435m for 5435mm). Overrides cut-list/BOM lengths without altering roof geometry. */
  orderedSheetLengthM?: number;
  eaveWidthM?: number;
  area?: number;
  edges: PlaneEdgeRef[];
  role?: 'producer' | 'receiver' | 'self_contained' | 'balanced';
  pairingSummary?: string; // e.g. "Blue Section → produces offcuts used in Green Section (East Hip)"
  receivesSummary?: string; // e.g. "Receives flipped offcuts from Blue Section"
  pairedTargetPlaneId?: string;
  offcutsProducedCount?: number;
  offcutsReusedCount?: number;
  linealMetresSaved?: number;
  receivingZones?: OffcutReceivingZone[];
  isStartEdge?: boolean;
  sequenceIndex?: number; // 1-based laying order
  apertures?: PlaneAperture[];
  parentAssetId?: string;
  parentAssetType?: RoofAssetType;
  parentPlaneId?: string;
  pitchZoneRole?: 'lower_apron' | 'upper_main';
  isVirtualAssetPlane?: boolean;
  levelId?: string;
  levelCode?: string;
  levelName?: string;
}

export interface OffcutReceivingZone {
  id: string;
  targetPlaneId: string;
  sourcePlaneId: string;
  sourceCode: string; // e.g. "A"
  sourceName: string; // e.g. "Main Run South"
  sourceColor: string; // e.g. "#2563eb"
  softSourceColor: string; // e.g. "rgba(37, 99, 235, 0.42)"
  tintColor: string; // e.g. "#93c5fd"
  planPolygon: Point2D[];
  developedPolygon: Point2D[];
  piecesCount: number;
  label: string; // e.g. "From Blue A – next in lay (7 pcs)"
  sequenceStep?: number;
  ruleApplied?: 'adjacent_hip_run' | 'matching_end_slope' | 'next_sequence_slope' | 'opposite_hip_same_slope' | 'geometric_fallback';
}

export type SheetOrderMode = 'practical' | 'optimized';

export interface SheetOrderComparisonSummary {
  practicalOrderedLm: number;
  practicalSheetsCount: number;
  practicalDistinctLengths: number;
  optimizedOrderedLm: number;
  optimizedSheetsCount: number;
  optimizedDistinctLengths: number;
}

export interface SheetSpec {
  coverWidth: number; // e.g. 0.762m
  maxLength: number; // e.g. 6.0m
  endLap: number; // e.g. 0.15m
  overhang: number; // e.g. 0.05m
}

export interface CutPiece {
  id: string;
  parentSheetId: string;
  length: number;
  width: number;
  cutFrom: number;
  orientation: 'normal' | 'flipped180' | 'mirrored';
  targetPlaneId: string;
  placement: {
    origin: Point2D;
    rotation: number;
    flipped: boolean;
  };
  underlapSide: 'left' | 'right';
  facetName?: string;
  colIndex?: number;
  minV?: number;
  maxV?: number;
  splitFromAssetId?: string;
  note?: string;
}

export interface ParentSheet {
  id: string;
  sheetNumber: number;
  length: number;
  color?: string;
  pieces: CutPiece[];
  remaining: number;
  utilization: number;
}

export interface SectionPairingLink {
  id: string;
  sourcePlaneId: string;
  targetPlaneId: string;
  sourceName: string;
  targetName: string;
  labelText: string; // "Blue Section → offcuts feed Green Hip"
  startPoint: Point2D;
  endPoint: Point2D;
  midPoint: Point2D;
  piecesTransferred: number;
  sequenceStep?: number;
  pairingType?: 'adjacent_hip' | 'matching_end_slope' | 'next_in_sequence' | 'self_contained';
}

export interface SectionSummary {
  planeId: string;
  code: string;
  label: string;
  name: string;
  color: string;
  pitchDeg: number;
  underlapSide: 'left' | 'right';
  role: 'producer' | 'receiver' | 'self_contained' | 'balanced';
  slopeLengthM: number;
  orderedSheetLengthM?: number;
  eaveWidthM: number;
  areaM2: number;
  sheetCount: number;
  offcutsProduced: number;
  offcutsReused: number;
  pairingNote: string;
  sequenceIndex?: number;
  isStartEdge?: boolean;
  entryCorner?: Point2D;
  exitCorner?: Point2D;
  eaveHeightM?: number;
  levelId?: string;
  levelCode?: string;
}

export interface InstallationStep {
  sequenceIndex: number;
  stepNumber?: number;
  planeId: string;
  planeName: string;
  code: string;
  color: string;
  isStartEdge: boolean;
  eaveLengthM: number;
  slopeLengthM: number;
  description: string;
  eaveHeightM?: number;
  levelCode?: string;
}

export interface LayoutResult {
  sheetOrderMode?: SheetOrderMode;
  parents: ParentSheet[];
  pieces: CutPiece[];
  sections: SectionSummary[];
  pairingLinks: SectionPairingLink[];
  wastePercent: number;
  totalOrderedArea: number;
  totalRoofArea: number;
  totalOrderedMetres: number;
  totalRoofMetres: number;
  savedMetres: number;
  dollarValueSavedNZD: number;
  totalOffcutsReused: number;
  receivingZones: OffcutReceivingZone[];
  startPlaneId?: string;
  startEdgeId?: string;
  installationSequence?: InstallationStep[];
  effectivePlanes?: RoofPlane[];
  placementMap: {
    planeId: string;
    planeName: string;
    pieces: {
      pieceId: string;
      parentId: string;
      parentSheetNumber: number;
      length: number;
      isOffcut: boolean;
      orientation: 'normal' | 'flipped180' | 'mirrored';
      note: string;
      color: string;
    }[];
  }[];
}

export type RoofLineFlashingKind =
  | 'barge'
  | 'ridge'
  | 'hip'
  | 'valley'
  | 'eave'
  | 'apron'
  | 'dormer_barge'
  | 'dormer_ridge'
  | 'dormer_valley'
  | 'dormer_apron';

export interface AssignableRoofLine {
  lineId: string;
  sourceType: 'outline_edge' | 'skeleton_line' | 'pitch_break' | 'asset_edge';
  flashingKind: RoofLineFlashingKind;
  label: string;
  from: Point2D;
  to: Point2D;
  midPoint: Point2D;
  planLengthM: number;
  trueSlopeLengthM: number;
  lapAllowanceM: number;
  totalOrderLengthM: number;
  recommendedPieceLengthM: number;
  recommendedQuantity: number;
  associatedPlaneIds: string[];
  pitchesDeg: number[];
  eaveHeightM?: number;
  levelId?: string;
  suggestedCategory:
    | 'Barge & Edge'
    | 'Ridge & Hip'
    | 'Valley & Gutter'
    | 'Apron & Abutment'
    | 'Window & Penetration';
}

export type WindZoneCode = 'L' | 'M' | 'H' | 'VH' | 'EH';
export type RoofProfileFamily = 'corrugate' | 'trapezoidal' | 'standing_seam' | '*';
export type VentedRidgeOption = 'none' | 'RV10P';

export interface FlashingRule {
  id: string;
  enabled: boolean;
  profileFamily: RoofProfileFamily | string;
  lineKind: RoofLineFlashingKind | '*';
  windMin: WindZoneCode | null;
  windMax: WindZoneCode | null;
  ventedRidge: VentedRidgeOption | '*' | null;
  libraryProfileId: string;
  productCode: string;
  coverMm: number;
  priority: number;
  preferredStickMm: number;
  maxStickMm: number;
  joinAllowanceMm: number;
  endAllowanceMm: number;
  shopNotes: string;
  label?: string;
}

export interface FlashingRuleSet {
  version: number;
  updatedAt: string;
  rules: FlashingRule[];
}

export interface FlashingRuleContext {
  roofProfileFamily: RoofProfileFamily;
  windZone: WindZoneCode | string;
  ventedRidge: VentedRidgeOption;
  material?: string;
  colorName?: string;
  outOfScopeLineIds?: string[];
  outOfScopeKinds?: RoofLineFlashingKind[];
}

export interface RoofFlashingAssignment {
  id: string;
  lineId: string;
  lineLabel: string;
  flashingKind: RoofLineFlashingKind;
  profileId: string;
  profileName: string;
  productCode?: string;
  developedBlankWidthMm?: number;
  girthTier?: string;
  bendCount?: number;
  keyAnglesDeg?: number[];
  hasHemCrush?: boolean;
  material?: string;
  colorName?: string;
  planLengthM: number;
  trueSlopeLengthM: number;
  pieceLengthLm: number;
  pieceLengthMm?: number;
  quantity: number;
  totalLinearMetres: number;
  notes?: string;
  assignedAt: string;
  orderedToWorkshop?: boolean;
  orderedToCrm?: boolean;
  source?: 'rule' | 'user';
  ruleId?: string;
  coverMm?: number;
  preferredStickMm?: number;
  maxStickMm?: number;
  joinAllowanceMm?: number;
  endAllowanceMm?: number;
  shopNotes?: string;
}

export type CanvasToolMode =
  | 'select'
  | 'draw_outline'
  | 'edit_vertices'
  | 'draw_skeleton'
  | 'define_plane'
  | 'delete_element'
  | 'assign_flashing';

export type RoofOutlinePresetKey =
  | 'rectangle_14x10'
  | 'l_shape_standard'
  | 'straight_gable'
  | 't_shape'
  | 'two_storey_split'
  | 'cascading_terrace'
  | 'custom';

export type RoofLifecycleStage = 'quoting' | 'measuring' | 'installing';

export interface RoofInstallProgress {
  customSequencePlaneIds: string[];
  stagedPlaneIds: string[];
  completedPlaneIds: string[];
  completedPieceIds: string[];
  lastUpdatedAt?: string;
  updatedBy?: string;
}

export interface RoofPackLengthGroup {
  lengthMm: number;
  lengthM: number;
  count: number;
  totalLm: number;
  note?: string;
}

export interface RoofPackOffcutTransfer {
  planeId: string;
  code: string;
  planeName: string;
  color: string;
  count: number;
  totalLm: number;
}

export interface FaceRoofingPack {
  sequenceNumber: number;
  planeId: string;
  code: string;
  planeName: string;
  color: string;
  pitchDeg: number;
  slopeLengthM: number;
  eaveWidthM: number;
  eaveHeightM?: number;
  levelCode?: string;
  areaM2: number;
  totalPiecesNeeded: number;
  freshSheetCount: number;
  freshLengthGroups: RoofPackLengthGroup[];
  offcutsReceived: RoofPackOffcutTransfer[];
  offcutsProducedFor: RoofPackOffcutTransfer[];
  packLabel: string;
  packLoadSummary: string;
  outOfOrderOffcutWarning?: string;
}

export interface RoofBomSheetCutDetail {
  faceCode: string;
  faceName: string;
  requiredCutMm: number;
  qty: number;
}

export interface RoofBomSheetGroup {
  lengthMm: number;
  lengthM: number;
  count: number;
  totalLm: number;
  targetCodes: string[];
  hasOffcutHarvest: boolean;
  modeledLengthMm?: number;
  hasSiteOverride?: boolean;
  overrideNotes?: string;
  cutDetails?: RoofBomSheetCutDetail[];
}

export interface RoofBomSummary {
  sheetOrderMode?: SheetOrderMode;
  sheetOrderAssumption?: string;
  comparisonSummary?: SheetOrderComparisonSummary;
  totalRoofAreaM2: number;
  totalSheetsCount: number;
  totalOrderedLm: number;
  totalNetRoofLm: number;
  savedOffcutLm: number;
  totalOffcutsReused?: number;
  wastePercent: number;
  sheetGroups: RoofBomSheetGroup[];
  totalCutPiecesCount: number;
  flashingAssignments: RoofFlashingAssignment[];
  totalFlashingSticks: number;
  totalFlashingLm: number;
  unassignedLinesCount: number;
  estimatedScrewCount: number;
  estimatedScrewBoxes: number;
  estimatedUnderlayRolls: number;
  estimatedFoamClosureM: number;
  penetrationKitCount: number;
  areaSanityWarning?: string;
}

export interface RoofPlanUnderlay {
  id: string;
  name: string;
  imageUrl: string;
  aspectRatio: number; // naturalWidth / naturalHeight
  worldX: number;
  worldY: number;
  worldWidthM: number;
  worldHeightM: number;
  isCalibrated: boolean;
  calibratedDistanceM?: number;
  calibrationPtsNorm?: [Point2D, Point2D];
  calibratedAt?: string;
  opacity?: number;
  visible?: boolean;
  planId?: string;
}

export type WallCladdingType =
  | 'profiled_metal'
  | 'weatherboard'
  | 'brick'
  | 'plaster'
  | 'fibre_cement'
  | 'other'
  | 'none';

export type WallOpeningType = 'window' | 'door' | 'garage' | 'void';

export interface WallOpening {
  id: string;
  type: WallOpeningType;
  /** Horizontal offset from facet start point (metres) */
  distFromStartM: number;
  /** Height from facet bottomZ to opening sill (metres) */
  sillHeightM: number;
  widthM: number;
  heightM: number;
  label?: string;
  /** Normalized center ratio (0..1) along facet length for length-edit preservation */
  uRatio?: number;
  /** Optional linked secondary enclosure zone promoted from a void */
  linkedSecondaryZoneId?: string;
}

export type WallHeightSource = 'manual' | 'roof';

export type WallFacetKind =
  | 'exterior'
  | 'return'
  | 'parapet'
  | 'wing'
  | 'abutment'
  | 'secondary'
  | 'void_edge';

export interface WallElevationUnderlay {
  id: string;
  name: string;
  imageUrl: string;
  opacity: number;
  visible: boolean;
  worldWidthM: number;
  worldHeightM: number;
  offsetXM: number;
  offsetYM: number;
  calibrationMode: 'fit_face' | 'two_point' | 'manual_size';
  calibrationPtsNorm?: [Point2D, Point2D];
  calibratedDistanceM?: number;
  calibratedAt?: string;
  planId?: string;
}

export interface WallCladdingRegion {
  id: string;
  label?: string;
  claddingType: WallCladdingType;
  uStartM: number;
  uEndM: number;
  vStartM: number;
  vEndM: number;
}

export interface WallRoofProfilePoint {
  distM: number;
  topZ: number;
}

export type WallFilterMode =
  | 'all'
  | 'undetailed'
  | 'returns'
  | 'parapets'
  | 'secondary'
  | 'wings';

export interface WallFacet {
  id: string;
  code: string; // A, B, C...
  name?: string;
  from: Point2D;
  to: Point2D;
  lengthM: number;
  heightM: number;
  bottomZ: number;
  topZ: number;
  heightSource?: WallHeightSource;
  roofProfile?: WallRoofProfilePoint[];
  claddingType: WallCladdingType;
  openings: WallOpening[];
  regions?: WallCladdingRegion[];
  underlay?: WallElevationUnderlay | null;
  /** Optional link to matching PlanEdge in the roof footprint */
  roofEdgeId?: string;
  /** Architectural wall role/kind (defaults to 'exterior') */
  kind?: WallFacetKind;
  /** Extra parapet upstand height above roof eave (for reporting/presets) */
  parapetAboveM?: number;
  /** Whether parapet top receives metal coping flashing (defaults true for parapet kind) */
  hasCopingFlashing?: boolean;
  /** Linked secondary zone ID when facet belongs to a recessed patio / wing alcove */
  secondaryZoneId?: string;
  /** Open wing/spur wall not part of the closed building perimeter ring */
  isSpur?: boolean;
  /** Optional grouping tag for multi-zone or phased wall systems */
  groupId?: string;
  /** Linked roof level ID when derived in multi-body / multi-level roofs */
  levelId?: string;
  /** Perimeter ring / building body identifier in multi-body wall plans */
  bodyId?: string;
  /** False when auto-defaulted from roof derive and awaiting human confirmation */
  detailConfirmed?: boolean;
  /** Tracks which claddingType was auto-assigned during derive */
  derivedDefaultCladding?: WallCladdingType;
}

export interface WallPlanEdge {
  id: string;
  from: Point2D;
  to: Point2D;
}

export interface WallPlanBody {
  id: string;
  levelId?: string;
  levelCode?: string;
  name?: string;
  points: Point2D[];
  edges: WallPlanEdge[];
  eaveHeightM: number;
}

export interface WallSecondaryZone {
  id: string;
  name: string;
  sourceOpeningId?: string;
  sourceFacetId?: string;
  depthM: number;
  heightM?: number;
  direction?: 'inward' | 'outward';
  facetIds: string[];
}

export interface WallPlan {
  points: Point2D[];
  edges: WallPlanEdge[];
  /** All closed building rings when derived from multi-body / multi-level roofs */
  bodies?: WallPlanBody[];
  defaultHeightM: number;
  facets: WallFacet[];
  builtAt?: string;
  spurEdges?: WallPlanEdge[];
  secondaryZones?: WallSecondaryZone[];
}

export interface OrderPackSheetLine {
  code: string;
  description: string;
  qty: number;
  unit: 'sheets';
  length_mm: number;
  modeled_length_mm: number;
  is_override: boolean;
  total_lm: number;
  faces: string[];
  has_offcut_harvest: boolean;
  notes: string;
  cut_details?: RoofBomSheetCutDetail[];
}

export interface OrderPackFlashingLine {
  code: string;
  description: string;
  profile_id: string;
  flashing_kind: RoofLineFlashingKind;
  girth_mm: number;
  girth_tier: string;
  cover_mm?: number;
  bend_count: number;
  key_angles_deg: number[];
  has_hem_crush: boolean;
  qty: number;
  unit: 'sticks';
  length_mm: number;
  total_lm: number;
  color: string;
  line_labels: string[];
  notes: string;
  shop_notes?: string;
  rule_id?: string;
  source?: 'rule' | 'user';
}

export interface OrderPackPenetrationLine {
  id: string;
  type: RoofAssetType;
  code: string;
  description: string;
  host_plane_code: string;
  width_mm: number;
  depth_mm: number;
  eave_dist_m: number;
  apex_dist_m: number;
  qty: number;
  unit: 'ea';
  notes: string;
}

export interface OrderPackHardwareLine {
  code: string;
  description: string;
  qty: number;
  unit: string;
  notes: string;
}

export interface OrderPackWallCladdingLine {
  code: string;
  cladding_type: WallCladdingType;
  description: string;
  faces_count: number;
  gross_area_m2: number;
  openings_area_m2: number;
  net_area_m2: number;
  lineal_m: number;
  unit: 'm2';
  notes: string;
}

export interface OrderPackWallOpeningLine {
  id: string;
  wall_code: string;
  wall_name: string;
  type: WallOpeningType;
  label: string;
  width_mm: number;
  height_mm: number;
  sill_mm: number;
  dist_from_start_m: number;
  area_m2: number;
}

export interface OrderPack {
  version: 1;
  generatedAt: string;
  locked: boolean;
  confirmedAt?: string;
  confirmedBy?: string;
  projectNumber: string;
  projectTitle: string;
  siteAddress?: string;
  commercialNeutral: true;
  assumptions: {
    profile: string;
    roofProfileFamily?: RoofProfileFamily;
    material: string;
    color: string;
    windZone?: string;
    exposureZone?: string;
    ventedRidge?: VentedRidgeOption;
    ruleSetVersion?: number;
    ruleSetCapturedAt?: string;
    ruleSetRevision?: string;
    coverWidthMm: number;
    endLapMm: number;
    overhangMm: number;
    sheetOrderMode?: SheetOrderMode;
    sheetOrderAssumption?: string;
    comparisonSummary?: SheetOrderComparisonSummary;
    sheetRoundingNote: string;
    productCodePolicy: string;
  };
  totals: {
    roofAreaM2: number;
    totalSheets: number;
    totalOrderedLm: number;
    totalNetRoofLm: number;
    savedOffcutLm: number;
    offcutsReusedCount: number;
    wastePercent: number;
    flashingSticks: number;
    flashingTotalLm: number;
    penetrationCount: number;
    wallNetAreaM2?: number;
    wallOpeningsCount?: number;
    areaSanityWarning?: string;
  };
  sheets: OrderPackSheetLine[];
  flashings: OrderPackFlashingLine[];
  penetrations: OrderPackPenetrationLine[];
  hardware: OrderPackHardwareLine[];
  walls?: {
    totalFaces: number;
    detailedFaces: number;
    externalCornersCount: number;
    internalCornersCount: number;
    returnFacesCount: number;
    parapetFacesCount?: number;
    parapetCopingLm?: number;
    secondaryFacesCount?: number;
    secondaryNetAreaM2?: number;
    wingFacesCount?: number;
    totalNetAreaM2: number;
    totalOpeningsAreaM2: number;
    byCladding: OrderPackWallCladdingLine[];
    openingsSchedule: OrderPackWallOpeningLine[];
    returnNotes: string[];
  };
  completenessReport: TakeoffCompletenessReport;
}

export interface ExactRoofModelSnapshot {
  version: 2;
  stage: RoofLifecycleStage;
  measureLocked: boolean;
  measureConfirmedAt?: string;
  measureConfirmedBy?: string;
  sheetOrderMode?: SheetOrderMode;
  selectedPreset: RoofOutlinePresetKey;
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  planes: RoofPlane[];
  levels?: RoofLevel[];
  activeLevelId?: string;
  startPlaneId: string | null;
  assets: RoofAsset[];
  pitchBreaks: PitchBreakLine[];
  flashingAssignments: RoofFlashingAssignment[];
  ventedRidge?: VentedRidgeOption;
  windZoneCode?: WindZoneCode;
  roofProfileFamily?: RoofProfileFamily;
  ruleSetVersion?: number;
  ruleSetCapturedAt?: string;
  ruleSetRevision?: string;
  appliedRulesSnapshot?: FlashingRuleSet;
  outOfScopeLineIds?: string[];
  outOfScopeKinds?: RoofLineFlashingKind[];
  installProgress: RoofInstallProgress;
  planUnderlay?: RoofPlanUnderlay | null;
  wallPlan?: WallPlan | null;
  layout?: LayoutResult;
  bom?: RoofBomSummary;
  orderPack?: OrderPack | null;
  lastUpdatedAt: string;
  updatedBy?: string;
}

export type TakeoffCompletenessCategory =
  | 'undetailed_wall'
  | 'undetailed_return'
  | 'undetailed_parapet'
  | 'undetailed_secondary'
  | 'opening_overlap'
  | 'missing_flashing'
  | 'incomplete_plane'
  | 'mixed_pitch'
  | 'incomplete_penetration'
  | 'area_sanity';

export interface TakeoffCompletenessIssue {
  id: string;
  category: TakeoffCompletenessCategory;
  severity: 'warning' | 'blocker';
  title: string;
  detail: string;
  targetId?: string;
  targetCode?: string;
}

export interface TakeoffCompletenessReport {
  isComplete: boolean;
  canLockMeasure: boolean;
  blockersCount: number;
  warningsCount: number;
  totalIssuesCount: number;
  undetailedWallsCount: number;
  undetailedReturnsCount: number;
  unassignedFlashingsCount: number;
  optionalUnassignedEavesCount?: number;
  incompletePlanesCount: number;
  incompletePenetrationsCount: number;
  issues: TakeoffCompletenessIssue[];
}


