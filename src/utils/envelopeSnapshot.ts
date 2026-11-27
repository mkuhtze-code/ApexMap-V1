import {
  EnvelopeRevisionKind,
  EnvelopeSnapshot,
  ExactRoofModelSnapshot,
  OrderPack,
  RoofBomSummary,
  SheetOrderMode,
  TakeoffCompletenessReport
} from '../types/exactRoofing';
import { computeTruthfulRoofAreaM2, deduplicateRoofPlanes } from './exactRoofingEngine';
import { RoofAreaSanityResult } from './roofPipeline';

export interface BuildEnvelopeSnapshotParams {
  revision: number;
  kind: EnvelopeRevisionKind;
  model: ExactRoofModelSnapshot;
  bom: RoofBomSummary;
  orderPack: OrderPack;
  areaSanity: Pick<RoofAreaSanityResult, 'ok' | 'warning'>;
  completenessReport?: TakeoffCompletenessReport | null;
  stillDataUrl?: string | null;
  createdAt?: string;
}

export function stripNestedEnvelopeRefs(model: ExactRoofModelSnapshot): ExactRoofModelSnapshot {
  const { envelopeSnapshot: _s, envelopeHistory: _h, ...cleanModel } = model;
  return {
    ...cleanModel,
    planes: deduplicateRoofPlanes(cleanModel.planes || []),
    levels: (cleanModel.levels || []).map((lvl) => ({
      ...lvl,
      outline: {
        ...lvl.outline,
        points: lvl.outline.points.map((p) => ({ ...p })),
        edges: lvl.outline.edges.map((e) => ({ ...e })),
        holes: lvl.outline.holes
          ? lvl.outline.holes.map((h) => ({
              ...h,
              points: h.points.map((p) => ({ ...p })),
              edges: h.edges.map((e) => ({ ...e }))
            }))
          : undefined
      },
      skeleton: lvl.skeleton.map((s) => ({ ...s }))
    }))
  };
}

/**
 * Pure commercial-truth snapshot builder.
 * Refuses (throws) if area sanity fails or completeness blockers remain open.
 * Never invents quantities.
 */
export function buildEnvelopeSnapshot(params: BuildEnvelopeSnapshotParams): EnvelopeSnapshot {
  const {
    revision,
    kind,
    model,
    bom,
    orderPack,
    areaSanity,
    completenessReport,
    stillDataUrl = null,
    createdAt
  } = params;

  if (!areaSanity || !areaSanity.ok) {
    throw new Error(
      areaSanity?.warning ||
        'EnvelopeSnapshot refused: roof area sanity check failed. Rebuild faces before emitting snapshot.'
    );
  }

  if (bom.areaSanityWarning) {
    throw new Error(bom.areaSanityWarning);
  }

  const effectiveCompleteness = completenessReport ?? orderPack.completenessReport;
  if (
    effectiveCompleteness &&
    (!effectiveCompleteness.canLockMeasure || effectiveCompleteness.blockersCount > 0)
  ) {
    const firstBlocker = effectiveCompleteness.issues.find((i) => i.severity === 'blocker');
    throw new Error(
      firstBlocker
        ? `EnvelopeSnapshot refused (${effectiveCompleteness.blockersCount} blocker${
            effectiveCompleteness.blockersCount === 1 ? '' : 's'
          }): ${firstBlocker.title}`
        : `EnvelopeSnapshot refused: ${effectiveCompleteness.blockersCount} completeness blocker(s) open.`
    );
  }

  const structuralPlanes = deduplicateRoofPlanes(model.planes || []).filter(
    (p) => !p.isVirtualAssetPlane
  );
  if (structuralPlanes.length === 0 || (bom.totalRoofAreaM2 ?? 0) <= 0) {
    throw new Error(
      'EnvelopeSnapshot refused: no modeled roof faces exist. Build roof faces first.'
    );
  }

  const truthfulArea = computeTruthfulRoofAreaM2(structuralPlanes);
  const areaM2 = +(truthfulArea > 0 ? truthfulArea : bom.totalRoofAreaM2).toFixed(2);
  const sheetOrderMode: SheetOrderMode =
    bom.sheetOrderMode ?? model.sheetOrderMode ?? orderPack.assumptions?.sheetOrderMode ?? 'practical';
  const ruleSetRevision =
    orderPack.assumptions?.ruleSetRevision ??
    model.ruleSetRevision ??
    model.ruleSetVersion ??
    null;

  const cleanModel = stripNestedEnvelopeRefs({
    ...model,
    bom,
    orderPack
  });

  return {
    revision: Math.max(1, Math.floor(revision || 1)),
    kind,
    createdAt: createdAt || new Date().toISOString(),
    ruleSetRevision,
    roofProfileFamily:
      orderPack.assumptions?.roofProfileFamily ||
      model.roofProfileFamily ||
      'corrugate',
    windZone:
      model.windZoneCode ||
      orderPack.assumptions?.windZone ||
      'M',
    ventedRidge:
      orderPack.assumptions?.ventedRidge ||
      model.ventedRidge ||
      'none',
    areaM2,
    areaSanityOk: true,
    faceCount: structuralPlanes.length,
    sheetOrderMode,
    totalOrderedLm: +(bom.totalOrderedLm ?? 0).toFixed(2),
    totalSheets: bom.totalSheetsCount ?? 0,
    flashingStickCount: bom.totalFlashingSticks ?? 0,
    orderPack,
    bom,
    model: cleanModel,
    stillDataUrl: stillDataUrl ?? null
  };
}

/**
 * Appends a locked "measured" snapshot to history without mutating prior measured revisions,
 * capped at `maxEntries` (default 5) most recent measured revisions.
 */
export function appendMeasuredEnvelopeHistory(
  history: EnvelopeSnapshot[] | undefined,
  measured: EnvelopeSnapshot,
  maxEntries = 5
): EnvelopeSnapshot[] {
  if (measured.kind !== 'measured') {
    return [...(history || [])];
  }
  const existing = (history || []).filter(
    (entry) => entry.kind === 'measured' && entry.revision !== measured.revision
  );
  return [...existing, measured]
    .sort((a, b) => a.revision - b.revision)
    .slice(-Math.max(1, maxEntries));
}

export function getLatestMeasuredEnvelope(
  source?: {
    envelopeSnapshot?: EnvelopeSnapshot | null;
    envelopeHistory?: EnvelopeSnapshot[];
  } | null
): EnvelopeSnapshot | null {
  if (!source) return null;
  if (source.envelopeSnapshot?.kind === 'measured') {
    return source.envelopeSnapshot;
  }
  const measured = (source.envelopeHistory || []).filter((s) => s.kind === 'measured');
  if (measured.length === 0) return null;
  return [...measured].sort((a, b) => b.revision - a.revision)[0];
}

export function getNextEnvelopeRevision(
  current?: EnvelopeSnapshot | null,
  history?: EnvelopeSnapshot[]
): number {
  const maxCurrent = current?.revision ?? 0;
  const maxHist = (history || []).reduce((m, s) => Math.max(m, s.revision || 0), 0);
  return Math.max(maxCurrent, maxHist, 0) + 1;
}
