import type { EnvelopeIntent, TriageWindZone } from './types';

export type TriageDiagnosisRole = 'roof' | 'floor' | 'elevation' | 'site' | 'other';
export type TriageSkeletonPolicy = 'from_vectors' | 'empty_on_floor_proxy' | 'user_required';

export type TriageDiagnosisAction =
  | { type: 'selectPage'; page: number }
  | { type: 'setScale'; denom: number }
  | { type: 'clearSkeleton' }
  | { type: 'setPitch'; deg: number };

export interface TriageDiagnosis {
  recommendedPage: number | null;
  recommendedRole: TriageDiagnosisRole | null;
  pitchDeg: number | null;
  pitchSource: string | null;
  windZone: TriageWindZone | null;
  skeletonPolicy: TriageSkeletonPolicy;
  confidence: number;
  summary: string;
  actions: TriageDiagnosisAction[];
  warnings: string[];
}

export interface TriageDiagnosisPayload {
  pages: Array<{ page: number; title: string; role: string }>;
  selectedPage: number;
  scale: string | null;
  blockers: string[];
  bodiesCount: number;
  bodyRoughSizeM: { widthM: number; heightM: number } | null;
  skeletonCount: number;
  pitchDeg: number | null;
  windZone: TriageWindZone | null;
  areas: Array<{ label: string; valueM2: number; page: number }>;
  evidence: Array<{ page: number; text: string }>;
  warnings: string[];
}

export const PLAN_TRIAGE_DIAGNOSIS_SYSTEM_INSTRUCTION = `You are Plan Triage diagnosis for ApexMap ExactRoofing (NZ residential).
You receive STRUCTURED FACTS from a vector PDF reader — not the PDF bytes.
Rules:
- Prefer incomplete-but-true over guesses.
- Never invent outline coordinates.
- Floor plans: interior walls are NOT ridges. If primary geometry is from a floor sheet and there is no explicit RIDGE label evidence, skeletonPolicy = empty_on_floor_proxy.
- Never recommend site or details as geometry source.
- Pitch may come from elevation notes including NZ "UNITARY PLAN HIRB … & N°".
- Keep summary to 1–3 concise, factual sentences for the operator.
- Return ONLY valid JSON matching the schema.`;

const METRIC_EVIDENCE_RE =
  /\b(?:Wind\s*zone|UNITARY\s+PLAN|H?IRB|pitch|eave|fascia|F\.?F\.?L\.?|ridge|Area|FD-\d+|scale|floor|roof|elevation|site)\b/i;

export function buildTriageDiagnosisPayload(draft: EnvelopeIntent): TriageDiagnosisPayload {
  const body = draft.bodies[0];
  let bodyRoughSizeM: { widthM: number; heightM: number } | null = null;
  if (body && body.outline.length > 0) {
    const xs = body.outline.map((p) => p.x);
    const ys = body.outline.map((p) => p.y);
    bodyRoughSizeM = {
      widthM: +(Math.max(...xs) - Math.min(...xs)).toFixed(2),
      heightM: +(Math.max(...ys) - Math.min(...ys)).toFixed(2)
    };
  }

  // Prioritize metric/structural evidence snippets first, capped at 40 items / 120 chars each
  const rawEvidence = draft.evidence ?? [];
  const prioritized = [
    ...rawEvidence.filter((e) => METRIC_EVIDENCE_RE.test(e.text)),
    ...rawEvidence.filter((e) => !METRIC_EVIDENCE_RE.test(e.text))
  ];
  const seen = new Set<string>();
  const evidence: Array<{ page: number; text: string }> = [];
  for (const item of prioritized) {
    const cleanText = item.text.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!cleanText) continue;
    const key = `${item.page}|${cleanText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push({ page: item.page, text: cleanText });
    if (evidence.length >= 40) break;
  }

  return {
    pages: (draft.pages ?? []).map((p) => ({
      page: p.page,
      title: p.title.slice(0, 100),
      role: p.role
    })),
    selectedPage: draft.selectedPage ?? 1,
    scale: draft.scale,
    blockers: [...draft.blockers],
    bodiesCount: draft.bodies.length,
    bodyRoughSizeM,
    skeletonCount: body?.skeleton.length ?? 0,
    pitchDeg: draft.pitchDeg ?? body?.pitchDeg ?? null,
    windZone: draft.windZone ?? null,
    areas: (draft.areas ?? []).slice(0, 20),
    evidence,
    warnings: [...(draft.warnings ?? [])]
  };
}

function normalizeDiagnosisRole(raw: unknown): TriageDiagnosisRole | null {
  if (typeof raw !== 'string') return null;
  const lower = raw.trim().toLowerCase();
  if (lower === 'roof') return 'roof';
  if (lower === 'floor') return 'floor';
  if (lower === 'elevation') return 'elevation';
  if (lower === 'site') return 'site';
  if (lower === 'details' || lower === 'other') return 'other';
  return null;
}

function normalizeWindZone(raw: unknown): TriageWindZone | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toUpperCase();
  if (upper === 'L' || upper === 'M' || upper === 'H' || upper === 'VH' || upper === 'EH') {
    return upper;
  }
  return null;
}

function normalizeSkeletonPolicy(raw: unknown): TriageSkeletonPolicy {
  if (raw === 'from_vectors' || raw === 'empty_on_floor_proxy' || raw === 'user_required') {
    return raw;
  }
  return 'user_required';
}

export function sanitizeTriageDiagnosis(
  raw: unknown,
  payload: TriageDiagnosisPayload
): TriageDiagnosis | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;

  const validPages = new Set(payload.pages.map((p) => p.page));
  const rawRecPage = typeof obj.recommendedPage === 'number' ? Math.round(obj.recommendedPage) : null;
  let recommendedPage =
    rawRecPage !== null && (validPages.size === 0 || validPages.has(rawRecPage))
      ? rawRecPage
      : null;

  let recommendedRole = normalizeDiagnosisRole(obj.recommendedRole);
  // Enforce rule: never recommend site or details as geometry source if roof/floor exists
  const bestPlanPage =
    payload.pages.find((p) => p.role === 'roof') ??
    payload.pages.find((p) => p.role === 'floor') ??
    null;
  if (recommendedPage !== null) {
    const pageMeta = payload.pages.find((p) => p.page === recommendedPage);
    if (pageMeta && (pageMeta.role === 'site' || pageMeta.role === 'details') && bestPlanPage) {
      recommendedPage = bestPlanPage.page;
      recommendedRole = normalizeDiagnosisRole(bestPlanPage.role);
    } else if (pageMeta && !recommendedRole) {
      recommendedRole = normalizeDiagnosisRole(pageMeta.role);
    }
  } else if (bestPlanPage) {
    recommendedPage = bestPlanPage.page;
    recommendedRole = normalizeDiagnosisRole(bestPlanPage.role);
  }

  const rawPitch = typeof obj.pitchDeg === 'number' ? obj.pitchDeg : null;
  const pitchDeg =
    rawPitch !== null && Number.isFinite(rawPitch) && rawPitch > 0 && rawPitch < 85
      ? Math.round(rawPitch * 10) / 10
      : null;

  const pitchSource =
    typeof obj.pitchSource === 'string' && obj.pitchSource.trim()
      ? obj.pitchSource.trim().slice(0, 120)
      : null;

  const windZone = normalizeWindZone(obj.windZone);
  const selectedPageRole = payload.pages.find((p) => p.page === payload.selectedPage)?.role;
  const hasExplicitRidgeEvidence = payload.evidence.some((e) => /\bRIDGE\b/i.test(e.text));

  let skeletonPolicy = normalizeSkeletonPolicy(obj.skeletonPolicy);
  if (selectedPageRole === 'floor' && !hasExplicitRidgeEvidence) {
    skeletonPolicy = 'empty_on_floor_proxy';
  }

  const rawConf = typeof obj.confidence === 'number' ? obj.confidence : 0.5;
  const confidence = Math.round(Math.max(0, Math.min(1, rawConf)) * 100) / 100;

  const summary =
    typeof obj.summary === 'string' && obj.summary.trim()
      ? obj.summary.trim().slice(0, 500)
      : 'Plan set reviewed.';

  const actions: TriageDiagnosisAction[] = [];
  const seenAction = new Set<string>();
  if (Array.isArray(obj.actions)) {
    for (const item of obj.actions) {
      if (!item || typeof item !== 'object') continue;
      const a = item as Record<string, unknown>;
      if (a.type === 'selectPage' && typeof a.page === 'number') {
        const page = Math.round(a.page);
        if ((validPages.size === 0 || validPages.has(page)) && page !== payload.selectedPage) {
          const targetRole = payload.pages.find((p) => p.page === page)?.role;
          if (targetRole !== 'site' && targetRole !== 'details') {
            const k = `selectPage:${page}`;
            if (!seenAction.has(k)) {
              seenAction.add(k);
              actions.push({ type: 'selectPage', page });
            }
          }
        }
      } else if (a.type === 'setScale' && typeof a.denom === 'number') {
        const denom = Math.round(a.denom);
        if (Number.isFinite(denom) && denom >= 10 && denom <= 5000) {
          const k = `setScale:${denom}`;
          if (!seenAction.has(k)) {
            seenAction.add(k);
            actions.push({ type: 'setScale', denom });
          }
        }
      } else if (a.type === 'clearSkeleton') {
        if (!seenAction.has('clearSkeleton')) {
          seenAction.add('clearSkeleton');
          actions.push({ type: 'clearSkeleton' });
        }
      } else if (a.type === 'setPitch' && typeof a.deg === 'number') {
        const deg = Math.round(a.deg * 10) / 10;
        if (Number.isFinite(deg) && deg > 0 && deg < 85) {
          const k = `setPitch:${deg}`;
          if (!seenAction.has(k)) {
            seenAction.add(k);
            actions.push({ type: 'setPitch', deg });
          }
        }
      }
    }
  }

  const warnings: string[] = [];
  if (Array.isArray(obj.warnings)) {
    for (const w of obj.warnings) {
      if (typeof w === 'string' && w.trim()) {
        warnings.push(w.trim().slice(0, 180));
      }
    }
  }

  return {
    recommendedPage,
    recommendedRole,
    pitchDeg,
    pitchSource,
    windZone,
    skeletonPolicy,
    confidence,
    summary,
    actions,
    warnings
  };
}

/**
 * Deterministic merge rules (enforced in code, never by model output):
 * - Floor geometry OR empty_on_floor_proxy forces skeleton = []
 * - Missing pitch adopts diagnosed pitchDeg without erasing evidence
 * - Never mutates or replaces vector outline coordinates
 * - Null diagnosis leaves draft completely unchanged
 */
export function applyDiagnosisMerge(
  draft: EnvelopeIntent,
  diagnosis: TriageDiagnosis | null
): EnvelopeIntent {
  if (!diagnosis) return draft;

  const activeRole = draft.pages?.find((p) => p.page === draft.selectedPage)?.role;
  const shouldClearFloorSkeleton =
    activeRole === 'floor' || diagnosis.skeletonPolicy === 'empty_on_floor_proxy';

  const nextPitchDeg =
    draft.pitchDeg === null || draft.pitchDeg === undefined
      ? diagnosis.pitchDeg
      : draft.pitchDeg;

  const nextWindZone =
    draft.windZone === null || draft.windZone === undefined
      ? diagnosis.windZone
      : draft.windZone;

  const adoptedPitchFromDiagnosis =
    (draft.pitchDeg === null || draft.pitchDeg === undefined) && diagnosis.pitchDeg !== null;

  const nextBodies = draft.bodies.map((body) => ({
    ...body,
    pitchDeg: body.pitchDeg ?? nextPitchDeg ?? null,
    skeleton: shouldClearFloorSkeleton ? [] : body.skeleton
  }));

  const nextEvidence = adoptedPitchFromDiagnosis
    ? [
        ...draft.evidence,
        {
          page: draft.selectedPage ?? 1,
          text: `Diagnosis pitch: ${diagnosis.pitchDeg}° (${diagnosis.pitchSource ?? 'set context'})`
        }
      ]
    : draft.evidence;

  return {
    ...draft,
    ...(diagnosis.recommendedPage !== null && draft.recommendedPage === undefined
      ? { recommendedPage: diagnosis.recommendedPage }
      : {}),
    pitchDeg: nextPitchDeg ?? null,
    windZone: nextWindZone ?? null,
    bodies: nextBodies,
    evidence: nextEvidence
  };
}
