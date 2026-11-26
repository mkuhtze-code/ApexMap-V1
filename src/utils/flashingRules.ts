import { FlashingProfile } from '../types/crm';
import {
  AssignableRoofLine,
  FlashingRule,
  FlashingRuleContext,
  FlashingRuleSet,
  RoofFlashingAssignment,
  RoofLineFlashingKind,
  RoofProfileFamily,
  WindZoneCode
} from '../types/exactRoofing';
import {
  extractAssignmentFlashingSpecs,
  findMatchingCategoryRank,
  getDefaultMitreNotes
} from './exactRoofingFlashingBridge';

export const FLASHING_RULES_STORAGE_KEY = 'apexmap.flashingRuleSet.v1';

const WIND_ZONE_ORDER: WindZoneCode[] = ['L', 'M', 'H', 'VH', 'EH'];

let inMemoryRuleSetStore: string | null = null;

function windIndex(code: WindZoneCode): number {
  const idx = WIND_ZONE_ORDER.indexOf(code);
  return idx >= 0 ? idx : 1;
}

export function normalizeWindZoneCode(raw?: string | null): WindZoneCode {
  if (!raw) return 'M';
  const trimmed = raw.trim().toUpperCase();
  if (trimmed === 'L' || trimmed === 'M' || trimmed === 'H' || trimmed === 'VH' || trimmed === 'EH') {
    return trimmed;
  }
  const lower = raw.trim().toLowerCase();
  if (lower.includes('extra') || lower === 'sed' || lower.includes('specific')) return 'EH';
  if (lower.includes('very')) return 'VH';
  if (lower.includes('high')) return 'H';
  if (lower.includes('med')) return 'M';
  if (lower.includes('low')) return 'L';
  return 'H';
}

export function normalizeProfileFamily(raw?: string | null): Exclude<RoofProfileFamily, '*'> {
  const lower = (raw || '').trim().toLowerCase();
  if (lower === 'trapezoidal') return 'trapezoidal';
  if (lower === 'standing_seam') return 'standing_seam';
  if (lower === 'corrugate') return 'corrugate';
  if (/standing\s*seam|super\s*seam|snaplock|euro\s*tray|tray/.test(lower)) {
    return 'standing_seam';
  }
  if (/trapezoid|plumbdeck|trimform|5-?rib|rib/.test(lower)) {
    return 'trapezoidal';
  }
  return 'corrugate';
}

function buildSeedRulesForFamily(
  profileFamily: Exclude<RoofProfileFamily, '*'>,
  basePriority: number
): FlashingRule[] {
  const famTag =
    profileFamily === 'corrugate'
      ? 'cor'
      : profileFamily === 'trapezoidal'
      ? 'trap'
      : 'ss';

  return [
    {
      id: `seed-${famTag}-ridge-lm`,
      label: `${profileFamily} Ridge L–M (Standard)`,
      enabled: true,
      profileFamily,
      lineKind: 'ridge',
      windMin: 'L',
      windMax: 'M',
      ventedRidge: 'none',
      libraryProfileId: 'preset-ventilated-ridge',
      productCode: 'RIDGE-150',
      coverMm: 150,
      priority: basePriority + 10,
      preferredStickMm: 2400,
      maxStickMm: 3000,
      joinAllowanceMm: 150,
      endAllowanceMm: 30,
      shopNotes: '150mm cover; soft-edge wings, 150mm lap, 30mm end turn.'
    },
    {
      id: `seed-${famTag}-ridge-heh`,
      label: `${profileFamily} Ridge H–EH (High Wind)`,
      enabled: true,
      profileFamily,
      lineKind: 'ridge',
      windMin: 'H',
      windMax: 'EH',
      ventedRidge: 'none',
      libraryProfileId: 'preset-ventilated-ridge',
      productCode: 'RIDGE-200',
      coverMm: 200,
      priority: basePriority + 10,
      preferredStickMm: 2400,
      maxStickMm: 3000,
      joinAllowanceMm: 150,
      endAllowanceMm: 30,
      shopNotes: '200mm cover H-EH wind; soft-edge wings, 150mm lap, 30mm end turn.'
    },
    {
      id: `seed-${famTag}-ridge-rv10p`,
      label: `${profileFamily} Vented Ridge RV10P`,
      enabled: true,
      profileFamily,
      lineKind: 'ridge',
      windMin: null,
      windMax: null,
      ventedRidge: 'RV10P',
      libraryProfileId: 'preset-ventilated-ridge',
      productCode: 'RIDGE-RV10P',
      coverMm: 200,
      priority: basePriority + 20,
      preferredStickMm: 2400,
      maxStickMm: 3000,
      joinAllowanceMm: 150,
      endAllowanceMm: 30,
      shopNotes: 'RV10P vented ridge kit; 10mm free vent gap, 150mm lap, 30mm end turn.'
    },
    {
      id: `seed-${famTag}-hip`,
      label: `${profileFamily} Hip Cap`,
      enabled: true,
      profileFamily,
      lineKind: 'hip',
      windMin: null,
      windMax: null,
      ventedRidge: null,
      libraryProfileId: 'preset-ventilated-ridge',
      productCode: 'HIP-150',
      coverMm: 150,
      priority: basePriority + 5,
      preferredStickMm: 2400,
      maxStickMm: 3000,
      joinAllowanceMm: 150,
      endAllowanceMm: 30,
      shopNotes: 'Mitre hip cap at ridge; 150mm lap joins and 30mm stop-end turn.'
    },
    {
      id: `seed-${famTag}-valley`,
      label: `${profileFamily} Valley Trough`,
      enabled: true,
      profileFamily,
      lineKind: 'valley',
      windMin: null,
      windMax: null,
      ventedRidge: null,
      libraryProfileId: 'preset-valley-gutter',
      productCode: 'VALLEY-250',
      coverMm: 250,
      priority: basePriority + 5,
      preferredStickMm: 2400,
      maxStickMm: 3000,
      joinAllowanceMm: 150,
      endAllowanceMm: 30,
      shopNotes: '250mm valley trough; fold 30mm side upstands and safety crush hems.'
    },
    {
      id: `seed-${famTag}-barge`,
      label: `${profileFamily} Barge Flashing`,
      enabled: true,
      profileFamily,
      lineKind: 'barge',
      windMin: null,
      windMax: null,
      ventedRidge: null,
      libraryProfileId: 'preset-barge-roll',
      productCode: 'BARGE-120',
      coverMm: 120,
      priority: basePriority + 5,
      preferredStickMm: 2400,
      maxStickMm: 3000,
      joinAllowanceMm: 150,
      endAllowanceMm: 30,
      shopNotes: '120mm cover barge; 45 deg apex mitre cut and eave stop-end fold-back.'
    },
    {
      id: `seed-${famTag}-apron`,
      label: `${profileFamily} Apron Flashing`,
      enabled: true,
      profileFamily,
      lineKind: 'apron',
      windMin: null,
      windMax: null,
      ventedRidge: null,
      libraryProfileId: 'preset-apron-kick',
      productCode: 'APRON-150',
      coverMm: 150,
      priority: basePriority + 5,
      preferredStickMm: 2400,
      maxStickMm: 3000,
      joinAllowanceMm: 150,
      endAllowanceMm: 30,
      shopNotes: '150mm wall upstand apron; anti-capillary hem and 15mm drip kick.'
    }
  ];
}

export const DEFAULT_FLASHING_RULE_SEEDS: FlashingRule[] = [
  ...buildSeedRulesForFamily('corrugate', 0),
  ...buildSeedRulesForFamily('trapezoidal', 0),
  ...buildSeedRulesForFamily('standing_seam', 0)
];

export function createSeedFlashingRuleSet(): FlashingRuleSet {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    rules: DEFAULT_FLASHING_RULE_SEEDS.map((r) => ({ ...r }))
  };
}

function readRawRuleStore(): string | null {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return localStorage.getItem(FLASHING_RULES_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
  return inMemoryRuleSetStore;
}

function writeRawRuleStore(raw: string): void {
  inMemoryRuleSetStore = raw;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.setItem(FLASHING_RULES_STORAGE_KEY, raw);
    }
  } catch {
    // ignore storage quota errors
  }
}

export function clearFlashingRuleStoreForTest(): void {
  inMemoryRuleSetStore = null;
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      localStorage.removeItem(FLASHING_RULES_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function saveFlashingRuleSet(ruleSet: FlashingRuleSet): FlashingRuleSet {
  const next: FlashingRuleSet = {
    version: Math.max(1, Number(ruleSet.version || 1)),
    updatedAt: new Date().toISOString(),
    rules: (ruleSet.rules || []).map((r) => ({ ...r }))
  };
  writeRawRuleStore(JSON.stringify(next));
  return next;
}

/**
 * Loads the persisted admin-editable FlashingRuleSet.
 * Seeds ONCE when no saved rules exist; never overwrites saved admin edits on reload.
 */
export function loadFlashingRuleSet(): FlashingRuleSet {
  const raw = readRawRuleStore();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as FlashingRuleSet;
      if (parsed && Array.isArray(parsed.rules)) {
        return {
          version: Number(parsed.version || 1),
          updatedAt: parsed.updatedAt || new Date().toISOString(),
          rules: parsed.rules.map((r) => ({ ...r }))
        };
      }
    } catch {
      // fall through to initial seed
    }
  }
  const seeded = createSeedFlashingRuleSet();
  writeRawRuleStore(JSON.stringify(seeded));
  return seeded;
}

/**
 * Explicit admin action to restore the factory seed rules.
 */
export function resetFlashingRuleSetToSeeds(prevVersion = 0): FlashingRuleSet {
  const next: FlashingRuleSet = {
    version: Math.max(1, prevVersion + 1),
    updatedAt: new Date().toISOString(),
    rules: DEFAULT_FLASHING_RULE_SEEDS.map((r) => ({ ...r }))
  };
  writeRawRuleStore(JSON.stringify(next));
  return next;
}

function mapDormerFallbackKind(kind: RoofLineFlashingKind): RoofLineFlashingKind | null {
  switch (kind) {
    case 'dormer_ridge':
      return 'ridge';
    case 'dormer_valley':
      return 'valley';
    case 'dormer_barge':
      return 'barge';
    case 'dormer_apron':
      return 'apron';
    default:
      return null;
  }
}

/**
 * Deterministic rule matcher:
 * filters enabled rules -> scores specificity (exact profileFamily, exact lineKind,
 * exact ventedRidge, narrower wind span) + priority -> returns single winner or null.
 */
export function resolveMatchingFlashingRule(
  rules: FlashingRule[],
  lineKind: RoofLineFlashingKind,
  context: Pick<FlashingRuleContext, 'roofProfileFamily' | 'windZone' | 'ventedRidge'>
): FlashingRule | null {
  const family =
    context.roofProfileFamily === '*'
      ? 'corrugate'
      : normalizeProfileFamily(context.roofProfileFamily);
  const wind = normalizeWindZoneCode(context.windZone);
  const windPos = windIndex(wind);
  const vented = context.ventedRidge || 'none';
  const baseKind = mapDormerFallbackKind(lineKind);

  const candidates: Array<{
    rule: FlashingRule;
    exactProfile: number;
    exactKind: number;
    exactVented: number;
    boundedWind: number;
    negWindSpan: number;
    priority: number;
    index: number;
  }> = [];

  rules.forEach((rule, index) => {
    if (!rule.enabled) return;

    const profileMatch = rule.profileFamily === family || rule.profileFamily === '*';
    if (!profileMatch) return;

    const kindMatch =
      rule.lineKind === lineKind
        ? 2
        : baseKind && rule.lineKind === baseKind
        ? 1
        : rule.lineKind === '*'
        ? 0
        : -1;
    if (kindMatch < 0) return;

    const minIdx = rule.windMin ? windIndex(rule.windMin) : 0;
    const maxIdx = rule.windMax ? windIndex(rule.windMax) : 4;
    const lo = Math.min(minIdx, maxIdx);
    const hi = Math.max(minIdx, maxIdx);
    if (windPos < lo || windPos > hi) return;

    const ventedMatch =
      rule.ventedRidge === null || rule.ventedRidge === '*' || rule.ventedRidge === vented;
    if (!ventedMatch) return;

    const isBoundedWind = rule.windMin !== null || rule.windMax !== null ? 1 : 0;

    candidates.push({
      rule,
      exactProfile: rule.profileFamily === family ? 1 : 0,
      exactKind: kindMatch,
      exactVented: rule.ventedRidge === vented ? 1 : 0,
      boundedWind: isBoundedWind,
      negWindSpan: -(hi - lo),
      priority: Number.isFinite(rule.priority) ? rule.priority : 0,
      index
    });
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.exactProfile !== a.exactProfile) return b.exactProfile - a.exactProfile;
    if (b.exactKind !== a.exactKind) return b.exactKind - a.exactKind;
    if (b.exactVented !== a.exactVented) return b.exactVented - a.exactVented;
    if (b.boundedWind !== a.boundedWind) return b.boundedWind - a.boundedWind;
    if (b.negWindSpan !== a.negWindSpan) return b.negWindSpan - a.negWindSpan;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.index - b.index;
  });

  return candidates[0].rule;
}

export interface RuleStickPlan {
  quantity: number;
  pieceLengthMm: number;
  pieceLengthLm: number;
  totalLinearMetres: number;
  effectiveRunMm: number;
}

/**
 * Splits a flashing slope run into bounded sticks using rule parameters:
 * - maxStickMm caps every stick length
 * - incorporates endAllowanceMm and (qty - 1) * joinAllowanceMm
 * - e.g. 5000mm run with preferredStickMm=2400, maxStickMm=3000 splits to 2 sticks <= 3000mm
 */
export function computeRuleStickPlan(
  trueSlopeLengthM: number,
  rule: Pick<
    FlashingRule,
    'preferredStickMm' | 'maxStickMm' | 'joinAllowanceMm' | 'endAllowanceMm'
  >
): RuleStickPlan {
  const runMm = Math.max(100, Math.round(trueSlopeLengthM * 1000));
  const preferredStickMm = Math.max(300, Math.round(rule.preferredStickMm || 2400));
  const maxStickMm = Math.max(preferredStickMm, Math.round(rule.maxStickMm || 3000));
  const joinAllowanceMm = Math.max(0, Math.min(maxStickMm - 200, Math.round(rule.joinAllowanceMm ?? 150)));
  const endAllowanceMm = Math.max(0, Math.round(rule.endAllowanceMm ?? 30));

  const singleNeedMm = Math.ceil((runMm + endAllowanceMm) / 10) * 10;
  if (singleNeedMm <= maxStickMm) {
    const pieceLengthMm = Math.max(300, singleNeedMm);
    const pieceLengthLm = +(pieceLengthMm / 1000).toFixed(3);
    return {
      quantity: 1,
      pieceLengthMm,
      pieceLengthLm,
      totalLinearMetres: pieceLengthLm,
      effectiveRunMm: singleNeedMm
    };
  }

  let quantity = 2;
  let chosenStickMm = maxStickMm;
  let effectiveRunMm = runMm + endAllowanceMm + joinAllowanceMm;

  while (quantity <= 200) {
    const totalNeedMm = runMm + endAllowanceMm + (quantity - 1) * joinAllowanceMm;
    const perStickMm = Math.ceil(totalNeedMm / quantity / 10) * 10;
    if (perStickMm <= maxStickMm) {
      chosenStickMm = Math.max(300, perStickMm);
      effectiveRunMm = totalNeedMm;
      break;
    }
    quantity += 1;
  }

  const pieceLengthLm = +(chosenStickMm / 1000).toFixed(3);
  return {
    quantity,
    pieceLengthMm: chosenStickMm,
    pieceLengthLm,
    totalLinearMetres: +(quantity * pieceLengthLm).toFixed(3),
    effectiveRunMm
  };
}

function resolveLibraryProfileForRule(
  rule: FlashingRule,
  line: AssignableRoofLine,
  libraryProfiles: FlashingProfile[]
): FlashingProfile | null {
  const exact = libraryProfiles.find((p) => p.id === rule.libraryProfileId);
  if (exact) return exact;
  const sorted = [...libraryProfiles].sort(
    (a, b) =>
      findMatchingCategoryRank(a.category, line.suggestedCategory) -
      findMatchingCategoryRank(b.category, line.suggestedCategory)
  );
  return sorted[0] || null;
}

export interface AssignStandardFlashingsResult {
  assignments: RoofFlashingAssignment[];
  appliedRuleIds: string[];
  unresolvedLineIds: string[];
  ruleSet: FlashingRuleSet;
}

/**
 * Deterministically assigns standard flashings using the active ruleSet.
 * - Preserves any line with existing `source === 'user'` (never overwritten by rules)
 * - Skips optional `eave` lines and out-of-scope lines
 * - Replaces prior rule-based assignments on unlocked lines when rules or context change
 */
export function assignStandardFlashings(
  lines: AssignableRoofLine[],
  context: FlashingRuleContext,
  libraryProfiles: FlashingProfile[],
  ruleSetParam?: FlashingRuleSet,
  existingAssignments: RoofFlashingAssignment[] = []
): AssignStandardFlashingsResult {
  const ruleSet = ruleSetParam
    ? {
        version: Number(ruleSetParam.version || 1),
        updatedAt: ruleSetParam.updatedAt || new Date().toISOString(),
        rules: (ruleSetParam.rules || []).map((r) => ({ ...r }))
      }
    : loadFlashingRuleSet();

  const outOfScopeIds = new Set(context.outOfScopeLineIds || []);
  const outOfScopeKinds = new Set(context.outOfScopeKinds || []);

  const existingByLineId = new Map<string, RoofFlashingAssignment>();
  existingAssignments.forEach((a) => existingByLineId.set(a.lineId, a));

  const nextAssignments: RoofFlashingAssignment[] = [];
  const appliedRuleIds = new Set<string>();
  const unresolvedLineIds: string[] = [];
  const seenLineIds = new Set<string>();

  lines.forEach((line) => {
    seenLineIds.add(line.lineId);
    const existing = existingByLineId.get(line.lineId);

    // Preserve explicit manual/custom assignments untouched
    if (existing && existing.source === 'user') {
      nextAssignments.push(existing);
      return;
    }

    // Eaves are optional spouting/drip unless already assigned; out-of-scope skipped cleanly
    if (
      line.flashingKind === 'eave' ||
      outOfScopeIds.has(line.lineId) ||
      outOfScopeKinds.has(line.flashingKind)
    ) {
      if (existing) nextAssignments.push(existing);
      return;
    }

    const matchedRule = resolveMatchingFlashingRule(ruleSet.rules, line.flashingKind, context);
    if (!matchedRule) {
      unresolvedLineIds.push(line.lineId);
      return;
    }

    const profile = resolveLibraryProfileForRule(matchedRule, line, libraryProfiles);
    const stickPlan = computeRuleStickPlan(line.trueSlopeLengthM, matchedRule);
    const extracted = profile
      ? extractAssignmentFlashingSpecs(profile, line.flashingKind)
      : {
          productCode: matchedRule.productCode,
          developedBlankWidthMm: Math.max(matchedRule.coverMm + 120, 250),
          girthTier: '301-450mm',
          bendCount: 2,
          keyAnglesDeg: [],
          hasHemCrush: false
        };

    const blankWidthMm = Math.max(
      extracted.developedBlankWidthMm,
      Math.round(matchedRule.coverMm || 0)
    );
    const productCode = (matchedRule.productCode || extracted.productCode).trim().toUpperCase();
    const notesText = matchedRule.shopNotes?.trim() || getDefaultMitreNotes(line.flashingKind);

    appliedRuleIds.add(matchedRule.id);

    nextAssignments.push({
      id: existing?.id || `assign-rule-${line.lineId}`,
      lineId: line.lineId,
      lineLabel: line.label,
      flashingKind: line.flashingKind,
      profileId: profile?.id || matchedRule.libraryProfileId,
      profileName: profile?.name || matchedRule.label || productCode,
      productCode,
      developedBlankWidthMm: blankWidthMm,
      girthTier: extracted.girthTier,
      bendCount: extracted.bendCount,
      keyAnglesDeg: extracted.keyAnglesDeg,
      hasHemCrush: extracted.hasHemCrush,
      material:
        context.material || profile?.material || '0.55mm ColorCote Vitor+',
      colorName: context.colorName || profile?.colorName || 'FlaxPod',
      planLengthM: line.planLengthM,
      trueSlopeLengthM: line.trueSlopeLengthM,
      pieceLengthLm: stickPlan.pieceLengthLm,
      pieceLengthMm: stickPlan.pieceLengthMm,
      quantity: stickPlan.quantity,
      totalLinearMetres: stickPlan.totalLinearMetres,
      notes: notesText,
      assignedAt: new Date().toISOString(),
      orderedToWorkshop: existing?.orderedToWorkshop ?? false,
      orderedToCrm: existing?.orderedToCrm ?? false,
      source: 'rule',
      ruleId: matchedRule.id,
      coverMm: matchedRule.coverMm,
      preferredStickMm: matchedRule.preferredStickMm,
      maxStickMm: matchedRule.maxStickMm,
      joinAllowanceMm: matchedRule.joinAllowanceMm,
      endAllowanceMm: matchedRule.endAllowanceMm,
      shopNotes: matchedRule.shopNotes
    });
  });

  // Retain user-created manual assignments for custom/removed-line edges only if user-owned
  existingAssignments.forEach((existing) => {
    if (!seenLineIds.has(existing.lineId) && existing.source === 'user') {
      nextAssignments.push(existing);
    }
  });

  return {
    assignments: nextAssignments,
    appliedRuleIds: Array.from(appliedRuleIds),
    unresolvedLineIds,
    ruleSet
  };
}
