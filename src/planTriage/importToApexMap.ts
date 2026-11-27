import type {
  EdgeType,
  PlanEdge,
  RoofLevel,
  RoofOutline,
  RoofProfileFamily,
  SkeletonLine,
  VentedRidgeOption,
  WindZoneCode
} from '../types/exactRoofing';
import type { EnvelopeIntent, TriageEdgeType } from './types';

export interface ImportedEnvelopeModel {
  level: RoofLevel;
  roofProfileFamily: Exclude<RoofProfileFamily, '*'>;
  windZone: WindZoneCode;
  ventedRidge: VentedRidgeOption;
  defaultPitchDeg: number;
  flashingHints: EnvelopeIntent['flashingHints'];
}

function mapTriageEdgeTypeToEngine(type: TriageEdgeType): EdgeType {
  switch (type) {
    case 'eave':
      return 'outline';
    case 'gable':
      return 'verge';
    case 'wall':
      return 'wall';
    case 'apron':
      return 'apron';
    case 'unclassified':
    default:
      return 'unclassified';
  }
}

function mapProfileFamily(raw: string | null): Exclude<RoofProfileFamily, '*'> {
  if (raw === 'trapezoidal') return 'trapezoidal';
  if (raw === 'standing_seam') return 'standing_seam';
  return 'corrugate';
}

/**
 * Maps a confirmed EnvelopeIntent onto ApexMap's existing RoofLevel + PlanEdge + SkeletonLine model.
 * NEVER calls generateSkeletonLines, ensureFaces, or runTakeoffPlaybook.
 */
export function importEnvelopeIntent(intent: EnvelopeIntent): ImportedEnvelopeModel {
  if (intent.blockers.length > 0) {
    throw new Error(`Cannot import EnvelopeIntent with blockers: ${intent.blockers.join(', ')}`);
  }
  const body = intent.bodies[0];
  if (!body || body.outline.length < 3) {
    throw new Error('Cannot import EnvelopeIntent: missing primary roof body outline.');
  }

  const levelId = 'level-1';
  const defaultEaveHeightM = intent.eaveHeightM ?? 2.7;

  const edges: PlanEdge[] = body.outline.map((pt, idx) => {
    const next = body.outline[(idx + 1) % body.outline.length];
    const edgeMeta = body.edges[idx];
    const mappedType = mapTriageEdgeTypeToEngine(edgeMeta?.type ?? 'unclassified');
    const resolvedEaveH =
      edgeMeta?.eaveHeightM ??
      (mappedType === 'outline' ? defaultEaveHeightM : undefined);

    return {
      id: `edge-out-${idx + 1}`,
      from: { x: pt.x, y: pt.y },
      to: { x: next.x, y: next.y },
      type: mappedType,
      levelId,
      ...(resolvedEaveH !== undefined ? { eaveHeightM: resolvedEaveH } : {}),
      ...(mappedType === 'wall' ? { hasWall: true } : {})
    };
  });

  const outline: RoofOutline = {
    id: `outline-triage-${intent.fixtureId || 'imported'}`,
    levelId,
    points: body.outline.map((p) => ({ x: p.x, y: p.y })),
    edges
  };

  const skeleton: SkeletonLine[] = body.skeleton.map((s, idx) => ({
    id: `triage-skel-${idx + 1}`,
    from: { x: s.from.x, y: s.from.y },
    to: { x: s.to.x, y: s.to.y },
    suggestedType: s.type,
    levelId
  }));

  const level: RoofLevel = {
    id: levelId,
    code: 'L1',
    name: body.id === 'body-1' ? 'Main Roof (Triage)' : body.id,
    eaveHeightM: defaultEaveHeightM,
    outline,
    skeleton
  };

  return {
    level,
    roofProfileFamily: mapProfileFamily(intent.profileFamily),
    windZone: intent.windZone ?? 'M',
    ventedRidge: intent.ventedRidge ?? 'none',
    defaultPitchDeg: body.pitchDeg ?? intent.pitchDeg ?? 22.5,
    flashingHints: intent.flashingHints
  };
}
