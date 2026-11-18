import {
  CoilMaterial,
  FlashingGirthTier,
  FlashingType,
  OnsiteMaterialOrder,
  Project,
  Quote,
  RoofingProfile,
  SpreadsheetRow,
  SpreadsheetSection
} from '../types/crm';
import {
  AssignableRoofLine,
  FaceRoofingPack,
  LayoutResult,
  RoofAsset,
  RoofBomSheetGroup,
  RoofBomSummary,
  RoofFlashingAssignment,
  RoofLineFlashingKind,
  RoofPackLengthGroup,
  RoofPackOffcutTransfer,
  RoofPlane
} from '../types/exactRoofing';
import { LongRunProfileKey, RoofFacet } from '../types/longrun';
import {
  calculateDynamicFlashingRate,
  calculateDynamicTrayRate,
  MODULAR_TRAY_PROFILES
} from './pricingMatrix';
import { calculateGST } from './formatters';

function getDisplayPlanes(planes: RoofPlane[], layout?: LayoutResult | null): RoofPlane[] {
  if (layout?.effectivePlanes && layout.effectivePlanes.length > 0) {
    return layout.effectivePlanes;
  }
  return planes;
}

function toExactMm(lengthM: number): { lengthMm: number; lengthM: number } {
  const lengthMm = Math.max(100, Math.round(lengthM * 1000));
  return { lengthMm, lengthM: +(lengthMm / 1000).toFixed(3) };
}

function formatLengthM(lengthMm: number, lengthM: number): string {
  return lengthMm % 10 !== 0 ? lengthM.toFixed(3) : lengthM.toFixed(2);
}

function mapKindToFlashingType(kind: RoofLineFlashingKind): FlashingType {
  switch (kind) {
    case 'ridge':
    case 'dormer_ridge':
    case 'hip':
      return 'Ridge Cap Vent';
    case 'barge':
    case 'dormer_barge':
      return 'Barge Flashing / Roll';
    case 'valley':
    case 'dormer_valley':
      return 'Valley Gutter';
    case 'apron':
    case 'dormer_apron':
      return 'Apron / Abutment Flashing';
    case 'eave':
      return 'Drip Edge / Eaves Starter';
    default:
      return 'Apron / Abutment Flashing';
  }
}

function normalizeGirthTier(tier?: string, girthMm?: number): FlashingGirthTier {
  const valid: FlashingGirthTier[] = [
    '0-150mm',
    '151-300mm',
    '301-450mm',
    '451-600mm',
    '601-900mm',
    '901-1200mm'
  ];
  if (tier && valid.includes(tier as FlashingGirthTier)) {
    return tier as FlashingGirthTier;
  }
  const mm = girthMm || 350;
  if (mm <= 150) return '0-150mm';
  if (mm <= 300) return '151-300mm';
  if (mm <= 450) return '301-450mm';
  if (mm <= 600) return '451-600mm';
  if (mm <= 900) return '601-900mm';
  return '901-1200mm';
}

export function buildRoofBillOfMaterials(params: {
  planes: RoofPlane[];
  layout: LayoutResult | null;
  assignments: RoofFlashingAssignment[];
  assignableLines?: AssignableRoofLine[];
  assets?: RoofAsset[];
}): RoofBomSummary {
  const { planes, layout, assignments, assignableLines = [], assets = [] } = params;
  const displayPlanes = getDisplayPlanes(planes, layout);
  const planeById = new Map<string, RoofPlane>();
  displayPlanes.forEach((p) => planeById.set(p.id, p));

  const groupMap = new Map<
    number,
    {
      lengthMm: number;
      lengthM: number;
      count: number;
      totalLm: number;
      targetCodes: Set<string>;
      hasOffcutHarvest: boolean;
    }
  >();

  if (layout && layout.parents.length > 0) {
    layout.parents.forEach((parent) => {
      const { lengthMm, lengthM } = toExactMm(parent.length);
      const existing = groupMap.get(lengthMm) || {
        lengthMm,
        lengthM,
        count: 0,
        totalLm: 0,
        targetCodes: new Set<string>(),
        hasOffcutHarvest: false
      };
      existing.count += 1;
      existing.totalLm = +(existing.totalLm + parent.length).toFixed(3);
      parent.pieces.forEach((pc) => {
        const p = planeById.get(pc.targetPlaneId);
        if (p?.code) existing.targetCodes.add(p.code);
      });
      if (parent.pieces.length > 1) {
        existing.hasOffcutHarvest = true;
      }
      groupMap.set(lengthMm, existing);
    });
  }

  const sheetGroups: RoofBomSheetGroup[] = Array.from(groupMap.values())
    .map((g) => ({
      lengthMm: g.lengthMm,
      lengthM: g.lengthM,
      count: g.count,
      totalLm: g.totalLm,
      targetCodes: Array.from(g.targetCodes).sort(),
      hasOffcutHarvest: g.hasOffcutHarvest
    }))
    .sort((a, b) => b.lengthMm - a.lengthMm);

  const fallbackAreaM2 = displayPlanes.reduce((s, p) => s + (p.area || 0), 0);
  const totalRoofAreaM2 = +(layout?.totalRoofArea ?? fallbackAreaM2).toFixed(2);
  const totalSheetsCount = layout?.parents.length || 0;
  const totalOrderedLm = +(layout?.totalOrderedMetres || 0).toFixed(2);
  const totalNetRoofLm = +(layout?.totalRoofMetres || 0).toFixed(2);
  const savedOffcutLm = +(layout?.savedMetres || 0).toFixed(2);
  const wastePercent = +(layout?.wastePercent ?? 0).toFixed(1);
  const totalCutPiecesCount = layout?.pieces.length || 0;

  const assignedIds = new Set(assignments.map((a) => a.lineId));
  const unassignedLinesCount = assignableLines.filter(
    (line) => !assignedIds.has(line.lineId) && line.flashingKind !== 'eave'
  ).length;

  const totalFlashingSticks = assignments.reduce((s, a) => s + a.quantity, 0);
  const totalFlashingLm = +assignments.reduce((s, a) => s + a.totalLinearMetres, 0).toFixed(2);

  // Fastener & underlay estimation from NZ Long-Run Code of Practice:
  // ~8.5 screws/m2 (crest + lap allowance), rounded up to boxes of 500
  const estimatedScrewCount = Math.max(0, Math.ceil(totalRoofAreaM2 * 8.5));
  const estimatedScrewBoxes = totalRoofAreaM2 > 0 ? Math.max(1, Math.ceil(estimatedScrewCount / 500)) : 0;

  // Synthetic underlay rolls: 75m2 gross coverage (~65m2 net after 150mm laps)
  const estimatedUnderlayRolls = totalRoofAreaM2 > 0 ? Math.max(1, Math.ceil(totalRoofAreaM2 / 65)) : 0;

  // Ridge/hip/eave foam closure & soft-edge run estimate
  const ridgeAndEaveLm = assignableLines
    .filter((l) => l.flashingKind === 'ridge' || l.flashingKind === 'eave' || l.flashingKind === 'hip')
    .reduce((s, l) => s + l.trueSlopeLengthM, 0);
  const estimatedFoamClosureM = Math.max(0, Math.ceil(ridgeAndEaveLm || totalRoofAreaM2 * 0.28));

  const penetrationKitCount = assets.filter(
    (a) => a.type === 'skylight' || a.type === 'chimney'
  ).length;

  return {
    totalRoofAreaM2,
    totalSheetsCount,
    totalOrderedLm,
    totalNetRoofLm,
    savedOffcutLm,
    wastePercent,
    sheetGroups,
    totalCutPiecesCount,
    flashingAssignments: assignments,
    totalFlashingSticks,
    totalFlashingLm,
    unassignedLinesCount,
    estimatedScrewCount,
    estimatedScrewBoxes,
    estimatedUnderlayRolls,
    estimatedFoamClosureM,
    penetrationKitCount
  };
}

/**
 * Pure presentation & logistics projection:
 * Organizes the existing optimized `layout.parents` into onsite crew Roofing Packs
 * matching `customSequencePlaneIds` (or default installation sequence).
 * CRITICAL: Never alters `layout.parents`, sheet cut lengths, or offcut optimization.
 */
export function computeRoofingPacks(params: {
  layout: LayoutResult | null;
  planes: RoofPlane[];
  customSequencePlaneIds?: string[];
}): FaceRoofingPack[] {
  const { layout, planes, customSequencePlaneIds = [] } = params;
  const displayPlanes = getDisplayPlanes(planes, layout);
  if (displayPlanes.length === 0) return [];

  // Default order comes from engine installationSequence, or plane order
  const defaultOrderedIds: string[] = [];
  if (layout?.installationSequence && layout.installationSequence.length > 0) {
    layout.installationSequence.forEach((step) => {
      if (!defaultOrderedIds.includes(step.planeId)) {
        defaultOrderedIds.push(step.planeId);
      }
    });
  }
  displayPlanes.forEach((p) => {
    if (!defaultOrderedIds.includes(p.id)) defaultOrderedIds.push(p.id);
  });

  // Apply crew custom sequence first, then append any remaining faces in default order
  const validIds = new Set(displayPlanes.map((p) => p.id));
  const orderedIds: string[] = [];
  customSequencePlaneIds.forEach((id) => {
    if (validIds.has(id) && !orderedIds.includes(id)) {
      orderedIds.push(id);
    }
  });
  defaultOrderedIds.forEach((id) => {
    if (validIds.has(id) && !orderedIds.includes(id)) {
      orderedIds.push(id);
    }
  });

  const planeById = new Map<string, RoofPlane>();
  displayPlanes.forEach((p) => planeById.set(p.id, p));

  const seqIndexById = new Map<string, number>();
  orderedIds.forEach((id, idx) => seqIndexById.set(id, idx + 1));

  return orderedIds.map((planeId, idx) => {
    const plane = planeById.get(planeId)!;
    const sequenceNumber = idx + 1;

    // 1. Fresh sheets cut/loaded onto this face = ParentSheets where pieces[0].targetPlaneId === planeId
    const freshBucket = new Map<number, { lengthMm: number; lengthM: number; count: number; totalLm: number }>();
    const receivedMap = new Map<string, RoofPackOffcutTransfer>();
    const producedForMap = new Map<string, RoofPackOffcutTransfer>();

    let totalPiecesNeeded = 0;

    if (layout) {
      layout.pieces.forEach((pc) => {
        if (pc.targetPlaneId === planeId) totalPiecesNeeded += 1;
      });

      layout.parents.forEach((parent) => {
        const primary = parent.pieces[0];
        const secondary = parent.pieces[1];

        if (primary && primary.targetPlaneId === planeId) {
          const { lengthMm, lengthM } = toExactMm(parent.length);
          const cur = freshBucket.get(lengthMm) || { lengthMm, lengthM, count: 0, totalLm: 0 };
          cur.count += 1;
          cur.totalLm = +(cur.totalLm + parent.length).toFixed(3);
          freshBucket.set(lengthMm, cur);

          if (secondary) {
            const tgt = planeById.get(secondary.targetPlaneId);
            const key = secondary.targetPlaneId;
            const prev = producedForMap.get(key) || {
              planeId: key,
              code: tgt?.code || key,
              planeName: tgt?.name || key,
              color: tgt?.color || '#64748b',
              count: 0,
              totalLm: 0
            };
            prev.count += 1;
            prev.totalLm = +(prev.totalLm + secondary.length).toFixed(2);
            producedForMap.set(key, prev);
          }
        }

        if (secondary && secondary.targetPlaneId === planeId && primary) {
          const src = planeById.get(primary.targetPlaneId);
          const key = primary.targetPlaneId;
          const prev = receivedMap.get(key) || {
            planeId: key,
            code: src?.code || key,
            planeName: src?.name || key,
            color: src?.color || '#64748b',
            count: 0,
            totalLm: 0
          };
          prev.count += 1;
          prev.totalLm = +(prev.totalLm + secondary.length).toFixed(2);
          receivedMap.set(key, prev);
        }
      });
    }

    const freshLengthGroups: RoofPackLengthGroup[] = Array.from(freshBucket.values()).sort(
      (a, b) => b.count - a.count || b.lengthMm - a.lengthMm
    );
    const freshSheetCount = freshLengthGroups.reduce((s, g) => s + g.count, 0);
    const offcutsReceived = Array.from(receivedMap.values()).sort((a, b) => b.count - a.count);
    const offcutsProducedFor = Array.from(producedForMap.values()).sort((a, b) => b.count - a.count);

    // Format concise pack label: e.g. "14 @ 6340mm" or "12 @ 6340mm + 5 offcuts from A"
    const freshStr =
      freshLengthGroups.length > 0
        ? freshLengthGroups
            .slice(0, 3)
            .map((g) => `${g.count} @ ${g.lengthMm}mm`)
            .join(', ') + (freshLengthGroups.length > 3 ? ` +${freshLengthGroups.length - 3} more` : '')
        : '0 fresh sheets';

    const offcutStr =
      offcutsReceived.length > 0
        ? offcutsReceived
            .map((o) =>
              o.planeId === planeId ? `${o.count} self-flipped offcuts` : `${o.count} offcuts from ${o.code}`
            )
            .join(' + ')
        : '';

    const packLabel = offcutStr
      ? freshSheetCount > 0
        ? `${freshStr} + ${offcutStr}`
        : offcutStr
      : freshStr;

    const packLoadSummary = `Pack #${sequenceNumber} (${plane.code}): ${packLabel}`;

    // Check if any offcut donor face is scheduled *after* this face in custom sequence
    const lateDonors = offcutsReceived.filter((donor) => {
      if (donor.planeId === planeId) return false;
      const donorSeq = seqIndexById.get(donor.planeId);
      return donorSeq !== undefined && donorSeq > sequenceNumber;
    });

    const outOfOrderOffcutWarning =
      lateDonors.length > 0
        ? `Stage ${lateDonors.map((d) => `Face ${d.code} (#${seqIndexById.get(d.planeId)})`).join(', ')} rakes on the ground or install ${lateDonors.map((d) => d.code).join('/')} first to release ${lateDonors.reduce((s, d) => s + d.count, 0)} offcut${lateDonors.reduce((s, d) => s + d.count, 0) === 1 ? '' : 's'}.`
        : undefined;

    return {
      sequenceNumber,
      planeId: plane.id,
      code: plane.code,
      planeName: plane.name,
      color: plane.color,
      pitchDeg: plane.pitchDeg,
      slopeLengthM: +(plane.orderedSheetLengthM || plane.slopeLength || 0).toFixed(3),
      eaveWidthM: +(plane.eaveWidthM || 0).toFixed(2),
      eaveHeightM: +(plane.eaveHeightM ?? 2.7).toFixed(2),
      levelCode: plane.levelCode,
      areaM2: +(plane.area || 0).toFixed(2),
      totalPiecesNeeded,
      freshSheetCount,
      freshLengthGroups,
      offcutsReceived,
      offcutsProducedFor,
      packLabel,
      packLoadSummary,
      outOfOrderOffcutWarning
    };
  });
}

export function buildCompleteBomMaterialOrder(params: {
  project?: Project;
  orderedBy: string;
  supplier: OnsiteMaterialOrder['supplier'];
  urgency: OnsiteMaterialOrder['urgency'];
  bom: RoofBomSummary;
  includeSheets: boolean;
  includeFlashings: boolean;
  includeHardware: boolean;
  includeUnderlay: boolean;
}): OnsiteMaterialOrder {
  const {
    project,
    orderedBy,
    supplier,
    urgency,
    bom,
    includeSheets,
    includeFlashings,
    includeHardware,
    includeUnderlay
  } = params;

  const items: OnsiteMaterialOrder['items'] = [];
  const profileColor = project?.colorName || 'FlaxPod';
  const roofProfileName = project?.profile || 'TRS Corrugate 0.55mm';
  const stamp = Date.now();

  if (includeSheets && bom.sheetGroups.length > 0) {
    bom.sheetGroups.forEach((grp, idx) => {
      const lenLabel = formatLengthM(grp.lengthMm, grp.lengthM);
      items.push({
        id: `bom-sh-${idx + 1}-${stamp}`,
        itemDescription: `${roofProfileName} · ${profileColor} · ${grp.lengthMm}mm (${lenLabel}m) Parent Sheets · Faces [${grp.targetCodes.join(', ') || 'Roof'}]`,
        category: 'Long-Run Sheets',
        quantity: grp.count,
        unit: `${lenLabel}m sheets`
      });
    });
  }

  if (includeFlashings && bom.flashingAssignments.length > 0) {
    bom.flashingAssignments.forEach((fl, idx) => {
      items.push({
        id: `bom-fl-${idx + 1}-${stamp}`,
        itemDescription: `${fl.profileName} (${fl.girthTier || 'Custom'}) · ${fl.lineLabel} · ${fl.pieceLengthLm.toFixed(2)}m sticks · ${fl.colorName || profileColor}`,
        category: 'Flashings',
        quantity: fl.quantity,
        unit: `${fl.pieceLengthLm.toFixed(2)}m sticks`
      });
    });
  }

  if (includeHardware && bom.estimatedScrewBoxes > 0) {
    items.push({
      id: `bom-hw-screws-${stamp}`,
      itemDescription: `Class 4 12-14 x 65mm Hex Crest Tek Screws w/ EPDM Seal · ${profileColor} (${bom.estimatedScrewCount} screws)`,
      category: 'Fixings & Fasteners',
      quantity: bom.estimatedScrewBoxes,
      unit: '500-pk boxes'
    });
    if (bom.estimatedFoamClosureM > 0) {
      items.push({
        id: `bom-hw-foam-${stamp}`,
        itemDescription: 'Profiled Corrugate/Rib EPDM Vented Foam Closures (Ridge & Eave)',
        category: 'Fixings & Fasteners',
        quantity: bom.estimatedFoamClosureM,
        unit: 'lm'
      });
    }
    if (bom.penetrationKitCount > 0) {
      items.push({
        id: `bom-hw-dek-${stamp}`,
        itemDescription: 'EPDM Pipe/Penetration Boot & Skylight Apron Kit',
        category: 'Fixings & Fasteners',
        quantity: bom.penetrationKitCount,
        unit: 'kits'
      });
    }
  }

  if (includeUnderlay && bom.estimatedUnderlayRolls > 0) {
    items.push({
      id: `bom-ul-rolls-${stamp}`,
      itemDescription: `Thermakraft / Breathable Synthetic Roof Underlay (75m² Roll · covers ${bom.totalRoofAreaM2}m² net)`,
      category: 'Underlay & Accessories',
      quantity: bom.estimatedUnderlayRolls,
      unit: 'rolls (75m²)'
    });
    items.push({
      id: `bom-ul-tape-${stamp}`,
      itemDescription: 'High-Tack Synthetic Underlay Lap & Penetration Sealing Tape (60mm x 25m)',
      category: 'Underlay & Accessories',
      quantity: Math.max(1, Math.ceil(bom.estimatedUnderlayRolls / 2)),
      unit: 'rolls'
    });
  }

  return {
    id: `ord-bom-${stamp}`,
    orderNumber: `BOM-${Math.floor(1000 + Math.random() * 9000)}`,
    projectId: project?.id || 'exact-roofing-standalone',
    projectNumber: project?.projectNumber || 'APEX-BOM',
    orderedBy: orderedBy || 'Site Lead',
    supplier,
    orderDate: new Date().toISOString().split('T')[0],
    urgency,
    items,
    deliverySiteAddress: project?.siteAddress || 'Site Delivery (ApexMap Studio)',
    status: 'Draft',
    deliveryEta: urgency === 'Urgent Same-Day HIAB' ? 'Same Day HIAB' : '2 business days'
  };
}

export function buildQuoteSpreadsheetFromRoofBom(params: {
  bom: RoofBomSummary;
  profile?: RoofingProfile;
  material?: CoilMaterial;
  colorName?: string;
  markupPercent?: number;
  includeHardware?: boolean;
  includeUnderlay?: boolean;
  includeLabourEstimate?: boolean;
}): {
  sections: SpreadsheetSection[];
  rows: SpreadsheetRow[];
  roofAreaM2: number;
  materialCostNZD: number;
  materialTotalNZD: number;
  flashingsCostNZD: number;
  flashingsTotalNZD: number;
  hardwareCostNZD: number;
  hardwareTotalNZD: number;
  labourCostNZD: number;
  labourTotalNZD: number;
  costTotalNZD: number;
  subtotalNZD: number;
  gstNZD: number;
  totalNZD: number;
} {
  const {
    bom,
    profile = 'TRS Corrugate 0.55mm',
    material = 'Kiwicolour® Vitor+ PVDF (The Roofing Store)',
    colorName = 'FlaxPod',
    markupPercent = 18,
    includeHardware = true,
    includeUnderlay = true,
    includeLabourEstimate = true
  } = params;

  const trayRate = calculateDynamicTrayRate(profile, material);
  const profileDef = MODULAR_TRAY_PROFILES.find((p) => p.profile === profile) || MODULAR_TRAY_PROFILES[0];
  const panMm = profileDef.defaultPanSizeMm || 762;
  const mult = 1 + markupPercent / 100;
  const stamp = Date.now();

  const secSheetsId = `sec-apex-sheets-${stamp}`;
  const secFlashId = `sec-apex-flash-${stamp}`;
  const secHwId = `sec-apex-hw-${stamp}`;
  const secLabourId = `sec-apex-lab-${stamp}`;

  const sections: SpreadsheetSection[] = [
    {
      id: secSheetsId,
      title: `1. ApexMap™ Roof Cladding BOM (${bom.totalRoofAreaM2.toFixed(1)}m² · ${bom.wastePercent}% waste)`,
      colorTag: '#0ea5e9',
      sectionType: 'roof',
      totalM2: bom.totalRoofAreaM2,
      defaultMaterial: material,
      defaultProfile: profile,
      defaultPanSizeMm: panMm,
      defaultColor: colorName
    },
    {
      id: secFlashId,
      title: '2. Architectural Flashings Schedule (ApexMap™)',
      colorTag: '#10b981',
      sectionType: 'flashings',
      defaultMaterial: material,
      defaultColor: colorName
    }
  ];

  const rows: SpreadsheetRow[] = [];

  // Section 1: Long-run ordered sheets grouped by mill cut length
  if (bom.sheetGroups.length > 0) {
    bom.sheetGroups.forEach((grp, idx) => {
      const unitCost = +trayRate.ratePerLm.toFixed(2);
      const unitSell = +(unitCost * mult).toFixed(2);
      const qtyLm = +grp.totalLm.toFixed(2);
      const totalSell = +(qtyLm * unitSell).toFixed(2);

      rows.push({
        id: `row-apex-sh-${idx + 1}-${stamp}`,
        sectionId: secSheetsId,
        itemCode: `APEX-${grp.lengthMm}`,
        description: `${profile} · ${colorName} · ${grp.count} × ${grp.lengthMm}mm sheets (${grp.targetCodes.join(', ')})`,
        category: 'Roof Cladding',
        quantity: qtyLm,
        unit: 'lm',
        wastagePercent: 0,
        unitCostNZD: unitCost,
        markupPercent,
        unitSellNZD: unitSell,
        totalNZD: totalSell,
        notes: grp.hasOffcutHarvest ? 'Includes 180° flipped offcut harvest' : 'Full run sheet',
        isMatrixItem: true,
        matrixType: 'tray',
        profile,
        material,
        panSizeMm: panMm
      });
    });
  } else if (bom.totalRoofAreaM2 > 0) {
    const unitCost = +trayRate.ratePerM2.toFixed(2);
    const unitSell = +(unitCost * mult).toFixed(2);
    const qty = +bom.totalRoofAreaM2.toFixed(2);
    rows.push({
      id: `row-apex-area-${stamp}`,
      sectionId: secSheetsId,
      itemCode: 'APEX-AREA',
      description: `${profile} · ${colorName} (${bom.totalRoofAreaM2.toFixed(1)}m² modeled roof)`,
      category: 'Roof Cladding',
      quantity: qty,
      unit: 'm²',
      wastagePercent: bom.wastePercent,
      unitCostNZD: unitCost,
      markupPercent,
      unitSellNZD: unitSell,
      totalNZD: +(qty * unitSell).toFixed(2),
      isMatrixItem: true,
      matrixType: 'tray',
      profile,
      material,
      panSizeMm: panMm
    });
  }

  // Section 2: Flashings
  bom.flashingAssignments.forEach((fl, idx) => {
    const flType = mapKindToFlashingType(fl.flashingKind);
    const girthTier = normalizeGirthTier(fl.girthTier, fl.developedBlankWidthMm);
    const flRate = calculateDynamicFlashingRate(flType, material, girthTier, 4);
    const unitCost = +flRate.ratePerLm.toFixed(2);
    const unitSell = +(unitCost * mult).toFixed(2);
    const qtyLm = +fl.totalLinearMetres.toFixed(2);

    rows.push({
      id: `row-apex-fl-${idx + 1}-${stamp}`,
      sectionId: secFlashId,
      itemCode: `FL-${fl.flashingKind.toUpperCase()}`,
      description: `${fl.profileName} · ${fl.lineLabel} (${fl.quantity} × ${fl.pieceLengthLm.toFixed(2)}m, ${girthTier})`,
      category: 'Flashings',
      quantity: qtyLm,
      unit: 'lm',
      wastagePercent: 0,
      unitCostNZD: unitCost,
      markupPercent,
      unitSellNZD: unitSell,
      totalNZD: +(qtyLm * unitSell).toFixed(2),
      notes: fl.notes,
      isMatrixItem: true,
      matrixType: 'flashing',
      flashingType: flType,
      material,
      girthTier,
      foldsCount: 4
    });
  });

  // Section 3: Hardware & Underlay
  if (includeHardware || includeUnderlay) {
    sections.push({
      id: secHwId,
      title: '3. Fixings, Closures & Underlay BOM',
      colorTag: '#f59e0b',
      sectionType: 'hardware'
    });

    if (includeHardware && bom.estimatedScrewBoxes > 0) {
      const boxCost = 148;
      const boxSell = +(boxCost * mult).toFixed(2);
      rows.push({
        id: `row-apex-scr-${stamp}`,
        sectionId: secHwId,
        itemCode: 'HW-TEK-500',
        description: `Class 4 12-14 x 65mm Crest Fix Tek Screws (${colorName}, Box of 500)`,
        category: 'Hardware',
        quantity: bom.estimatedScrewBoxes,
        unit: 'boxes',
        wastagePercent: 0,
        unitCostNZD: boxCost,
        markupPercent,
        unitSellNZD: boxSell,
        totalNZD: +(bom.estimatedScrewBoxes * boxSell).toFixed(2)
      });

      if (bom.estimatedFoamClosureM > 0) {
        const foamCost = 4.2;
        const foamSell = +(foamCost * mult).toFixed(2);
        rows.push({
          id: `row-apex-foam-${stamp}`,
          sectionId: secHwId,
          itemCode: 'HW-FOAM',
          description: 'Profiled Vented EPDM Ridge & Eave Foam Closures',
          category: 'Hardware',
          quantity: bom.estimatedFoamClosureM,
          unit: 'lm',
          wastagePercent: 0,
          unitCostNZD: foamCost,
          markupPercent,
          unitSellNZD: foamSell,
          totalNZD: +(bom.estimatedFoamClosureM * foamSell).toFixed(2)
        });
      }

      if (bom.penetrationKitCount > 0) {
        const kitCost = 95;
        const kitSell = +(kitCost * mult).toFixed(2);
        rows.push({
          id: `row-apex-pen-${stamp}`,
          sectionId: secHwId,
          itemCode: 'HW-PEN-KIT',
          description: 'Roof Asset Penetration / Skylight Boot & Saddle Kit',
          category: 'Hardware',
          quantity: bom.penetrationKitCount,
          unit: 'kits',
          wastagePercent: 0,
          unitCostNZD: kitCost,
          markupPercent,
          unitSellNZD: kitSell,
          totalNZD: +(bom.penetrationKitCount * kitSell).toFixed(2)
        });
      }
    }

    if (includeUnderlay && bom.estimatedUnderlayRolls > 0) {
      const rollCost = 245;
      const rollSell = +(rollCost * mult).toFixed(2);
      rows.push({
        id: `row-apex-ul-${stamp}`,
        sectionId: secHwId,
        itemCode: 'UL-SYN-75',
        description: 'Synthetic Breathable Roof Underlay (75m² Roll w/ Lap Tape)',
        category: 'Underlay',
        quantity: bom.estimatedUnderlayRolls,
        unit: 'rolls',
        wastagePercent: 0,
        unitCostNZD: rollCost,
        markupPercent,
        unitSellNZD: rollSell,
        totalNZD: +(bom.estimatedUnderlayRolls * rollSell).toFixed(2)
      });
    }
  }

  // Section 4: Installation Labour Estimate (optional)
  if (includeLabourEstimate && bom.totalRoofAreaM2 > 0) {
    sections.push({
      id: secLabourId,
      title: '4. Installation Labour (LBP Crew)',
      colorTag: '#6366f1',
      sectionType: 'labour'
    });
    const labCostPerM2 = 42;
    const labSellPerM2 = +(labCostPerM2 * mult).toFixed(2);
    const areaQty = +bom.totalRoofAreaM2.toFixed(1);
    rows.push({
      id: `row-apex-lab-${stamp}`,
      sectionId: secLabourId,
      itemCode: 'LAB-ROOF-INST',
      description: `LBP Long-Run Roof Installation & Flashing Fixings (${bom.totalSheetsCount} sheets)`,
      category: 'Labour',
      quantity: areaQty,
      unit: 'm²',
      wastagePercent: 0,
      unitCostNZD: labCostPerM2,
      markupPercent,
      unitSellNZD: labSellPerM2,
      totalNZD: +(areaQty * labSellPerM2).toFixed(2)
    });
  }

  const sumByCat = (cats: string[]) => {
    const matched = rows.filter((r) => cats.includes(r.category));
    const cost = +matched.reduce((s, r) => s + r.quantity * r.unitCostNZD, 0).toFixed(2);
    const sell = +matched.reduce((s, r) => s + r.totalNZD, 0).toFixed(2);
    return { cost, sell };
  };

  const mat = sumByCat(['Roof Cladding']);
  const fl = sumByCat(['Flashings']);
  const hw = sumByCat(['Hardware', 'Underlay']);
  const lab = sumByCat(['Labour']);

  const costTotalNZD = +(mat.cost + fl.cost + hw.cost + lab.cost).toFixed(2);
  const subtotalNZD = +(mat.sell + fl.sell + hw.sell + lab.sell).toFixed(2);
  const gstCalc = calculateGST(subtotalNZD);

  return {
    sections,
    rows,
    roofAreaM2: bom.totalRoofAreaM2,
    materialCostNZD: mat.cost,
    materialTotalNZD: mat.sell,
    flashingsCostNZD: fl.cost,
    flashingsTotalNZD: fl.sell,
    hardwareCostNZD: hw.cost,
    hardwareTotalNZD: hw.sell,
    labourCostNZD: lab.cost,
    labourTotalNZD: lab.sell,
    costTotalNZD,
    subtotalNZD,
    gstNZD: gstCalc.gst,
    totalNZD: gstCalc.total
  };
}

export function applyBomToQuoteObject(params: {
  quote: Quote;
  bom: RoofBomSummary;
  snapshot: any;
  includeHardware?: boolean;
  includeUnderlay?: boolean;
  includeLabourEstimate?: boolean;
  replaceExistingSections?: boolean;
}): Quote {
  const {
    quote,
    bom,
    snapshot,
    includeHardware = true,
    includeUnderlay = true,
    includeLabourEstimate = true,
    replaceExistingSections = false
  } = params;

  const built = buildQuoteSpreadsheetFromRoofBom({
    bom,
    profile: quote.profile,
    material: quote.material,
    colorName: quote.colorName,
    markupPercent: quote.markupPercent || 18,
    includeHardware,
    includeUnderlay,
    includeLabourEstimate
  });

  const baseSections = replaceExistingSections ? [] : quote.spreadsheetSections || [];
  const baseRows = replaceExistingSections ? [] : quote.spreadsheetRows || [];

  const nextSections = [...built.sections, ...baseSections];
  const nextRows = [...built.rows, ...baseRows];

  const sumRows = (cats: string[]) =>
    +nextRows.filter((r) => cats.includes(r.category)).reduce((s, r) => s + r.totalNZD, 0).toFixed(2);
  const sumCost = (cats: string[]) =>
    +nextRows.filter((r) => cats.includes(r.category)).reduce((s, r) => s + r.quantity * r.unitCostNZD, 0).toFixed(2);

  const materialTotalNZD = sumRows(['Roof Cladding', 'Wall Cladding', 'Sheets']);
  const flashingsTotalNZD = sumRows(['Flashings']);
  const hardwareTotalNZD = sumRows(['Hardware', 'Underlay', 'Fixings']);
  const freightTotalNZD = quote.freightTotalNZD || 0;
  const labourTotalNZD = sumRows(['Labour']);

  const subtotalNZD = +(
    nextRows.reduce((s, r) => s + r.totalNZD, 0) + freightTotalNZD
  ).toFixed(2);
  const costTotalNZD = +(
    nextRows.reduce((s, r) => s + r.quantity * r.unitCostNZD, 0) + (quote.freightCostNZD || 0)
  ).toFixed(2);
  const { gst, total } = calculateGST(subtotalNZD);

  return {
    ...quote,
    roofAreaM2: bom.totalRoofAreaM2 || quote.roofAreaM2,
    spreadsheetSections: nextSections,
    spreadsheetRows: nextRows,
    quoteSections: nextSections,
    quoteRows: nextRows,
    materialCostNZD: sumCost(['Roof Cladding', 'Wall Cladding', 'Sheets']),
    materialTotalNZD,
    flashingsCostNZD: sumCost(['Flashings']),
    flashingsTotalNZD,
    hardwareCostNZD: sumCost(['Hardware', 'Underlay', 'Fixings']),
    hardwareTotalNZD,
    labourCostNZD: sumCost(['Labour']),
    labourTotalNZD,
    costTotalNZD,
    markupAmountNZD: +(subtotalNZD - costTotalNZD).toFixed(2),
    subtotalNZD,
    gstNZD: gst,
    totalNZD: total,
    roofPlanModel: snapshot
  };
}

export function exportRoofBomToCsv(params: {
  bom: RoofBomSummary;
  packs: FaceRoofingPack[];
  projectName?: string;
}): string {
  const { bom, packs, projectName = 'ApexMap Roof Plan' } = params;
  const lines: string[] = [];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

  lines.push(['Project', esc(projectName), 'Roof Area (m2)', bom.totalRoofAreaM2, 'Waste (%)', bom.wastePercent].join(','));
  lines.push('');
  lines.push(['SECTION 1: MILL STOCK SHEET SCHEDULE'].join(','));
  lines.push(['Cut Length (mm)', 'Cut Length (m)', 'Qty (Sheets)', 'Total Lineal Metres (lm)', 'Target Faces', 'Offcut Harvest'].join(','));
  bom.sheetGroups.forEach((g) => {
    lines.push([g.lengthMm, formatLengthM(g.lengthMm, g.lengthM), g.count, g.totalLm.toFixed(2), esc(g.targetCodes.join(' ')), g.hasOffcutHarvest ? 'Yes (180 deg flip)' : 'No'].join(','));
  });

  lines.push('');
  lines.push(['SECTION 2: FLASHING SCHEDULE'].join(','));
  lines.push(['Line Label', 'Profile Name', 'Kind', 'Girth Tier', 'Sticks', 'Stick Length (m)', 'Total (lm)'].join(','));
  bom.flashingAssignments.forEach((f) => {
    lines.push([esc(f.lineLabel), esc(f.profileName), f.flashingKind, esc(f.girthTier || 'Custom'), f.quantity, f.pieceLengthLm.toFixed(2), f.totalLinearMetres.toFixed(2)].join(','));
  });

  lines.push('');
  lines.push(['SECTION 3: ONSITE ROOFING PACK SEQUENCE'].join(','));
  lines.push(['Pack #', 'Face Code', 'Level', 'Eave Z (m)', 'Face Name', 'Area (m2)', 'Pack Load Summary', 'Warning'].join(','));
  packs.forEach((p) => {
    lines.push([
      `#${p.sequenceNumber}`,
      p.code,
      p.levelCode || 'L1',
      (p.eaveHeightM ?? 2.7).toFixed(2),
      esc(p.planeName),
      p.areaM2,
      esc(p.packLabel),
      esc(p.outOfOrderOffcutWarning || '')
    ].join(','));
  });

  lines.push('');
  lines.push(['SECTION 4: HARDWARE & UNDERLAY ESTIMATES'].join(','));
  lines.push(['Item', 'Estimated Qty', 'Unit'].join(','));
  lines.push(['Crest Fix Tek Screws', bom.estimatedScrewBoxes, `boxes (${bom.estimatedScrewCount} screws)`].join(','));
  lines.push(['Synthetic Roof Underlay (75m2)', bom.estimatedUnderlayRolls, 'rolls'].join(','));
  lines.push(['Profiled Foam Closures', bom.estimatedFoamClosureM, 'lm'].join(','));
  lines.push(['Penetration Boot Kits', bom.penetrationKitCount, 'kits'].join(','));

  return lines.join('\n');
}

export function convertExactLayoutToRoofFacets(params: {
  planes: RoofPlane[];
  layout: LayoutResult | null;
  profileKey?: LongRunProfileKey;
  gauge?: '0.40mm' | '0.55mm';
  colorName?: string;
}): RoofFacet[] {
  const { planes, layout, profileKey = 'corrugate_762', gauge = '0.55mm', colorName = 'FlaxPod' } = params;
  const displayPlanes = getDisplayPlanes(planes, layout);

  return displayPlanes.map((p) => {
    const planePieces = layout
      ? layout.pieces.filter((pc) => pc.targetPlaneId === p.id)
      : [];

    const hasHip = p.edges.some((e) => e.type === 'hip');
    const hasValley = p.edges.some((e) => e.type === 'valley');
    const facetType: RoofFacet['facetType'] = hasValley
      ? 'valley_junction'
      : hasHip
      ? 'hip_rake'
      : 'gable';

    return {
      id: p.id,
      name: `${p.code} · ${p.name}`,
      facetType,
      pitchDeg: p.pitchDeg,
      eaveWidthMm: Math.round((p.eaveWidthM || 0) * 1000),
      slopeLengthMm: Math.round((p.orderedSheetLengthM || p.slopeLength || 0) * 1000),
      sheetCount: planePieces.length,
      colorName,
      gauge,
      profileKey,
      purlinSpacingMm: 900,
      sheets: planePieces.map((pc, idx) => {
        const parent = layout?.parents.find((par) => par.id === pc.parentSheetId);
        return {
          id: pc.id,
          sheetNumber: `${p.code}-${String(idx + 1).padStart(2, '0')}`,
          facetId: p.id,
          facetName: p.name,
          pitchDeg: p.pitchDeg,
          orderLengthMm: Math.round((parent?.length || pc.length) * 1000),
          cutLengthMm: Math.round(pc.length * 1000),
          topCut: hasHip ? 'rake_right' : 'square',
          topAngleDeg: p.pitchDeg,
          bottomCut: 'square',
          bottomAngleDeg: 0,
          effectiveCoverMm: Math.round((pc.width || 0.762) * 1000),
          eavesOverhangMm: 50,
          hasDiagonalCut: hasHip || hasValley,
          offcutLengthMm: Math.round((parent?.remaining || 0) * 1000),
          offcutReused: Boolean(parent && parent.pieces.length > 1),
          offcutPairId: parent?.id,
          isFlippedOffcutPiece: pc.orientation === 'flipped180',
          status: 'measured',
          notes: pc.note
        };
      }),
      plan2dVertices: p.planPolygon
    };
  });
}
