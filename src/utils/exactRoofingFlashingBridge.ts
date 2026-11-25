import { FlashingProfile, OnsiteMaterialOrder, Project } from '../types/crm';
import {
  AssignableRoofLine,
  LayoutResult,
  RoofFlashingAssignment,
  RoofLineFlashingKind
} from '../types/exactRoofing';
import { DEFAULT_ARCHITECTURAL_PROFILES, summarizeFlashingProfileBends } from './sheetMetalGeometry';
import type { FlashingOrderLine } from '../components/FlashingWorkshop';

export const FLASHING_LIBRARY_STORAGE_KEY = 'archtech_flashing_library';
export const FLASHING_ORDER_STORAGE_KEY = 'archtech_flashing_orders';

export function getMergedFlashingLibrary(project?: Project): FlashingProfile[] {
  let stored: FlashingProfile[] = [];
  try {
    const raw = localStorage.getItem(FLASHING_LIBRARY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) stored = parsed;
    }
  } catch {
    // ignore storage errors
  }

  const baseList = stored.length > 0 ? stored : DEFAULT_ARCHITECTURAL_PROFILES;
  const projectProfiles = project?.flashingProfiles || [];

  const byId = new Map<string, FlashingProfile>();
  // Project profiles take priority if edited most recently, then stored library, then defaults
  [...projectProfiles, ...baseList, ...DEFAULT_ARCHITECTURAL_PROFILES].forEach((profile) => {
    if (!byId.has(profile.id)) {
      byId.set(profile.id, profile);
    }
  });

  return Array.from(byId.values());
}

export function saveProfileToSharedFlashingLibrary(
  profile: FlashingProfile
): 'saved' | 'updated' | 'storage-error' {
  try {
    const raw = localStorage.getItem(FLASHING_LIBRARY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const current: FlashingProfile[] =
      Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_ARCHITECTURAL_PROFILES];

    const existingIdx = current.findIndex(
      (p) => p.id === profile.id || p.name.trim().toLowerCase() === profile.name.trim().toLowerCase()
    );

    const next =
      existingIdx >= 0
        ? current.map((p, idx) => (idx === existingIdx ? profile : p))
        : [profile, ...current];

    localStorage.setItem(FLASHING_LIBRARY_STORAGE_KEY, JSON.stringify(next));
    return existingIdx >= 0 ? 'updated' : 'saved';
  } catch {
    return 'storage-error';
  }
}

export function getFlashingKindDisplayLabel(kind: RoofLineFlashingKind): string {
  switch (kind) {
    case 'barge':
    case 'dormer_barge':
      return 'Barge / Gable Verge';
    case 'ridge':
    case 'dormer_ridge':
      return 'Ridge Cap';
    case 'hip':
      return 'Hip Cap';
    case 'valley':
    case 'dormer_valley':
      return 'Internal Valley';
    case 'eave':
      return 'Eave Drip / Gutter Starter';
    case 'apron':
    case 'dormer_apron':
      return 'Apron / Abutment';
    default:
      return 'Roof Flashing';
  }
}

export function getDefaultMitreNotes(kind: RoofLineFlashingKind): string {
  switch (kind) {
    case 'barge':
    case 'dormer_barge':
      return '45° Apex Mitre · Eaves Stop-End Turn Down';
    case 'ridge':
    case 'dormer_ridge':
      return '150mm Over-Lap · Scallop/Soft Edge Wings';
    case 'hip':
      return 'Hip Mitre Join · 150mm Lap';
    case 'valley':
    case 'dormer_valley':
      return 'Valley Apex Mitre · Bird-Beak Gutter Splay';
    case 'eave':
      return 'Square Cut · Under-Fascia Return';
    case 'apron':
    case 'dormer_apron':
      return 'End Stop Cleat · 150mm Wall Upstand';
    default:
      return 'Cut to Exact Roofing slope measure';
  }
}

export function findMatchingCategoryRank(
  profileCategory: string | undefined,
  targetCategory: AssignableRoofLine['suggestedCategory']
): number {
  if (!profileCategory) return 2;
  if (profileCategory === targetCategory) return 0;
  if (
    targetCategory === 'Barge & Edge' &&
    (profileCategory.includes('Barge') || profileCategory.includes('Parapet'))
  ) {
    return 1;
  }
  if (targetCategory === 'Ridge & Hip' && profileCategory.includes('Ridge')) {
    return 1;
  }
  if (targetCategory === 'Valley & Gutter' && profileCategory.includes('Valley')) {
    return 1;
  }
  if (targetCategory === 'Apron & Abutment' && profileCategory.includes('Apron')) {
    return 1;
  }
  return 2;
}

const KNOWN_PRODUCT_CODE_BY_PRESET_ID: Record<string, string> = {
  'preset-apron-kick': 'FL-APR-150',
  'preset-parapet-capping': 'FL-PAR-280',
  'preset-barge-roll': 'FL-BRG-120',
  'preset-ventilated-ridge': 'FL-RDG-V140',
  'preset-valley-gutter': 'FL-VAL-150',
  'preset-window-head': 'FL-WHD-075'
};

/**
 * Deterministic commercial-neutral flashing product code (e.g. FL-RDG-V140 or UNCODED-RIDGE).
 */
export function resolveFlashingProductCode(params: {
  profileId?: string;
  flashingKind: RoofLineFlashingKind;
  explicitCode?: string;
  blankWidthMm?: number;
}): string {
  const cleanExplicit = params.explicitCode?.trim();
  if (cleanExplicit) return cleanExplicit.toUpperCase();
  if (params.profileId && KNOWN_PRODUCT_CODE_BY_PRESET_ID[params.profileId]) {
    return KNOWN_PRODUCT_CODE_BY_PRESET_ID[params.profileId];
  }
  if (params.profileId && params.profileId.startsWith('preset-')) {
    const slug = params.profileId.replace(/^preset-/, '').toUpperCase().slice(0, 12);
    return `FL-${slug}`;
  }
  const kindToken = params.flashingKind.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return `UNCODED-${kindToken}`;
}

export function extractAssignmentFlashingSpecs(
  profile: Pick<FlashingProfile, 'id' | 'segments' | 'thicknessMm' | 'developedBlankWidthMm' | 'developedLengthMm' | 'girthTier'>,
  flashingKind: RoofLineFlashingKind
) {
  const summary = summarizeFlashingProfileBends(profile.segments || [], profile.thicknessMm || 0.55);
  const blankWidthMm = Math.round(
    profile.developedBlankWidthMm ||
      profile.developedLengthMm ||
      summary.developedBlankWidthMm ||
      (profile.segments || []).reduce((s, seg) => s + (Number(seg.lengthMm) || 0), 0) ||
      350
  );
  return {
    productCode: resolveFlashingProductCode({
      profileId: profile.id,
      flashingKind,
      blankWidthMm
    }),
    developedBlankWidthMm: blankWidthMm,
    girthTier: profile.girthTier || summary.girthTier,
    bendCount: summary.bendCount,
    keyAnglesDeg: summary.keyAnglesDeg,
    hasHemCrush: summary.hasHemCrush
  };
}

export interface GroupedFlashingScheduleItem {
  groupKey: string;
  productCode: string;
  profileId: string;
  profileName: string;
  flashingKind: RoofLineFlashingKind;
  girthMm: number;
  girthTier: string;
  bendCount: number;
  keyAnglesDeg: number[];
  hasHemCrush: boolean;
  pieceLengthMm: number;
  pieceLengthLm: number;
  quantity: number;
  totalLinearMetres: number;
  colorName: string;
  lineLabels: string[];
  notes: string;
  coverMm?: number;
  shopNotes?: string;
  ruleId?: string;
  source?: 'rule' | 'user';
}

/**
 * Groups flashing assignments by product code + profile + exact stick length (mm) + colour
 * for clean yard ordering & contractor fabrication schedules.
 */
export function groupFlashingScheduleLines(
  assignments: RoofFlashingAssignment[],
  libraryProfiles: FlashingProfile[] = [],
  defaultColor = 'FlaxPod'
): GroupedFlashingScheduleItem[] {
  const profileById = new Map<string, FlashingProfile>();
  libraryProfiles.forEach((p) => profileById.set(p.id, p));

  const map = new Map<string, GroupedFlashingScheduleItem>();

  assignments.forEach((assign) => {
    const matched = profileById.get(assign.profileId);
    const derived = matched
      ? extractAssignmentFlashingSpecs(matched, assign.flashingKind)
      : {
          productCode: resolveFlashingProductCode({
            profileId: assign.profileId,
            flashingKind: assign.flashingKind,
            explicitCode: assign.productCode,
            blankWidthMm: assign.developedBlankWidthMm
          }),
          developedBlankWidthMm: Math.round(assign.developedBlankWidthMm || 350),
          girthTier: assign.girthTier || '301-450mm',
          bendCount: assign.bendCount ?? 0,
          keyAnglesDeg: assign.keyAnglesDeg ?? [],
          hasHemCrush: Boolean(assign.hasHemCrush)
        };

    const productCode = assign.productCode || derived.productCode;
    const girthMm = Math.round(assign.developedBlankWidthMm || derived.developedBlankWidthMm || 350);
    const bendCount = assign.bendCount ?? derived.bendCount;
    const keyAnglesDeg = assign.keyAnglesDeg && assign.keyAnglesDeg.length > 0 ? assign.keyAnglesDeg : derived.keyAnglesDeg;
    const hasHemCrush = assign.hasHemCrush ?? derived.hasHemCrush;
    const pieceLengthMm = assign.pieceLengthMm || Math.max(100, Math.round(assign.pieceLengthLm * 1000));
    const pieceLengthLm = +(pieceLengthMm / 1000).toFixed(3);
    const colorName = (assign.colorName || defaultColor).trim();
    const coverMm = assign.coverMm;
    const shopNotes = assign.shopNotes;
    const sourceKey = assign.source || '';

    const groupKey = `${productCode}::${assign.profileId}::${coverMm ?? 0}::${pieceLengthMm}::${colorName.toLowerCase()}::${sourceKey}`;
    const existing = map.get(groupKey);
    const qty = Math.max(1, Math.round(assign.quantity || 1));
    const lineLm = +(qty * pieceLengthLm).toFixed(3);

    if (existing) {
      existing.quantity += qty;
      existing.totalLinearMetres = +(existing.quantity * existing.pieceLengthLm).toFixed(3);
      if (!existing.lineLabels.includes(assign.lineLabel)) {
        existing.lineLabels.push(assign.lineLabel);
      }
      if (assign.notes && !existing.notes.includes(assign.notes)) {
        existing.notes = existing.notes ? `${existing.notes}; ${assign.notes}` : assign.notes;
      }
      if (shopNotes && !existing.shopNotes?.includes(shopNotes)) {
        existing.shopNotes = existing.shopNotes ? `${existing.shopNotes}; ${shopNotes}` : shopNotes;
      }
    } else {
      map.set(groupKey, {
        groupKey,
        productCode,
        profileId: assign.profileId,
        profileName: assign.profileName,
        flashingKind: assign.flashingKind,
        girthMm,
        girthTier: assign.girthTier || derived.girthTier,
        bendCount,
        keyAnglesDeg,
        hasHemCrush,
        pieceLengthMm,
        pieceLengthLm,
        quantity: qty,
        totalLinearMetres: lineLm,
        colorName,
        lineLabels: [assign.lineLabel],
        notes: assign.notes || getDefaultMitreNotes(assign.flashingKind),
        ...(coverMm !== undefined ? { coverMm } : {}),
        ...(shopNotes ? { shopNotes } : {}),
        ...(assign.ruleId ? { ruleId: assign.ruleId } : {}),
        ...(assign.source ? { source: assign.source } : {})
      });
    }
  });

  return Array.from(map.values()).sort((a, b) =>
    a.productCode.localeCompare(b.productCode) || b.pieceLengthMm - a.pieceLengthMm
  );
}

export function pushAssignmentsToFlashingWorkshop(
  assignments: RoofFlashingAssignment[],
  project?: Project
): { pushedCount: number; orderLines: FlashingOrderLine[] } {
  if (assignments.length === 0) return { pushedCount: 0, orderLines: [] };

  let existing: FlashingOrderLine[] = [];
  try {
    const raw = localStorage.getItem(FLASHING_ORDER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed;
    }
  } catch {
    existing = [];
  }

  const orderLines: FlashingOrderLine[] = assignments.map((item, idx) => ({
    id: `ord-er-${Date.now()}-${idx}`,
    projectId: project?.id,
    projectName: project ? `${project.projectNumber} · ${project.title}` : 'Exact Roofing Plan',
    profileId: item.profileId,
    profileName: `[${item.lineLabel}] ${item.profileName}`,
    quantity: item.quantity,
    pieceLengthLm: item.pieceLengthLm,
    totalLinearMetres: item.totalLinearMetres,
    girthTier: (item.girthTier as any) || '301-450mm',
    developedBlankWidthMm: item.developedBlankWidthMm || 350,
    notes: `Slope Run: ${item.trueSlopeLengthM.toFixed(2)}m · Finish: ${item.colorName || project?.colorName || 'FlaxPod'}${item.notes ? ` · ${item.notes}` : ''}`,
    createdAt: new Date().toISOString(),
    status: 'Ready for production'
  }));

  localStorage.setItem(FLASHING_ORDER_STORAGE_KEY, JSON.stringify([...orderLines, ...existing]));
  return { pushedCount: orderLines.length, orderLines };
}

export function buildCombinedRoofingMaterialOrder(params: {
  project?: Project;
  orderedBy: string;
  supplier: OnsiteMaterialOrder['supplier'];
  urgency: OnsiteMaterialOrder['urgency'];
  assignments: RoofFlashingAssignment[];
  layout: LayoutResult | null;
  includeSheets: boolean;
  includeFlashings: boolean;
}): OnsiteMaterialOrder {
  const {
    project,
    orderedBy,
    supplier,
    urgency,
    assignments,
    layout,
    includeSheets,
    includeFlashings
  } = params;

  const items: OnsiteMaterialOrder['items'] = [];
  const profileColor = project?.colorName || 'FlaxPod';
  const roofProfileName = project?.profile || 'TRS Corrugate 0.55mm';

  if (includeSheets && layout && layout.parents.length > 0) {
    const sheetLengthBuckets = new Map<number, number>();
    layout.parents.forEach((parent) => {
      const len = +parent.length.toFixed(2);
      sheetLengthBuckets.set(len, (sheetLengthBuckets.get(len) || 0) + 1);
    });

    Array.from(sheetLengthBuckets.entries())
      .sort((a, b) => b[0] - a[0])
      .forEach(([lenM, qty], idx) => {
        items.push({
          id: `sheet-ord-${idx + 1}-${Date.now()}`,
          itemDescription: `${roofProfileName} · ${profileColor} · ${lenM.toFixed(2)}m Parent Sheets (${layout.totalRoofArea.toFixed(1)}m² roof / ${layout.savedMetres}m offcut savings)`,
          category: 'Long-Run Sheets',
          quantity: qty,
          unit: `${lenM.toFixed(2)}m sheets`
        });
      });
  }

  if (includeFlashings && assignments.length > 0) {
    assignments.forEach((fl, idx) => {
      const code = resolveFlashingProductCode({
        profileId: fl.profileId,
        flashingKind: fl.flashingKind,
        explicitCode: fl.productCode,
        blankWidthMm: fl.developedBlankWidthMm
      });
      items.push({
        id: `fl-ord-${idx + 1}-${Date.now()}`,
        itemDescription: `[${code}] ${fl.profileName} (${fl.girthTier || 'Custom'}${fl.bendCount ? ` · ${fl.bendCount}b` : ''}${fl.hasHemCrush ? ' · Hem/Crush' : ''}) · ${fl.lineLabel} · ${fl.pieceLengthLm.toFixed(2)}m sticks · ${fl.colorName || profileColor}${fl.notes ? ` · ${fl.notes}` : ''}`,
        category: 'Flashings',
        quantity: fl.quantity,
        unit: `${fl.pieceLengthLm.toFixed(2)}m sticks`
      });
    });
  }

  return {
    id: `ord-er-${Date.now()}`,
    orderNumber: `ER-${Math.floor(1000 + Math.random() * 9000)}`,
    projectId: project?.id || 'exact-roofing-standalone',
    projectNumber: project?.projectNumber || 'ER-PLAN',
    orderedBy: orderedBy || 'Roofing Lead',
    supplier,
    orderDate: new Date().toISOString().split('T')[0],
    urgency,
    items,
    deliverySiteAddress: project?.siteAddress || 'Site Delivery (Exact Roofing)',
    status: 'Draft',
    deliveryEta: urgency === 'Urgent Same-Day HIAB' ? 'Same Day HIAB' : '2 business days'
  };
}
