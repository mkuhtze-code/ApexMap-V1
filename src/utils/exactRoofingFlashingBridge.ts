import { FlashingProfile, OnsiteMaterialOrder, Project } from '../types/crm';
import {
  AssignableRoofLine,
  LayoutResult,
  RoofFlashingAssignment,
  RoofLineFlashingKind
} from '../types/exactRoofing';
import { DEFAULT_ARCHITECTURAL_PROFILES } from './sheetMetalGeometry';
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
      items.push({
        id: `fl-ord-${idx + 1}-${Date.now()}`,
        itemDescription: `${fl.profileName} (${fl.girthTier || 'Custom'}) · ${fl.lineLabel} · ${fl.pieceLengthLm.toFixed(2)}m sticks · ${fl.colorName || profileColor}${fl.notes ? ` · ${fl.notes}` : ''}`,
        category: 'Flashings',
        quantity: fl.quantity,
        unit: `${fl.pieceLengthLm.toFixed(1)}m sticks`
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
