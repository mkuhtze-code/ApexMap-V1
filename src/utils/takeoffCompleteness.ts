import {
  AssignableRoofLine,
  RoofAsset,
  RoofFlashingAssignment,
  RoofLevel,
  RoofPlane,
  TakeoffCompletenessIssue,
  TakeoffCompletenessReport,
  WallPlan
} from '../types/exactRoofing';
import { getFlashingKindDisplayLabel } from './exactRoofingFlashingBridge';
import {
  analyzeWallPlanTopology,
  findOpeningOverlaps,
  isWallFacetUndetailed
} from './wallCladdingEngine';

export interface EvaluateTakeoffCompletenessParams {
  levels: RoofLevel[];
  planes: RoofPlane[];
  assignableLines: AssignableRoofLine[];
  flashingAssignments: RoofFlashingAssignment[];
  wallPlan: WallPlan | null;
  assets: RoofAsset[];
}

export function evaluateTakeoffCompleteness(
  params: EvaluateTakeoffCompletenessParams
): TakeoffCompletenessReport {
  const { levels, planes, assignableLines, flashingAssignments, wallPlan, assets } = params;
  const issues: TakeoffCompletenessIssue[] = [];

  // 1. Wall faces, internal notch returns & overlapping openings
  let undetailedWallsCount = 0;
  let undetailedReturnsCount = 0;

  if (wallPlan && wallPlan.facets.length > 0) {
    const topology = analyzeWallPlanTopology(wallPlan.facets);
    const returnIds = new Set(topology.returnFacetIds);

    wallPlan.facets.forEach((facet) => {
      // Flag overlapping openings as structural takeoff/CAD blockers
      if (facet.openings.length >= 2) {
        const hasAnyOverlap = facet.openings.some(
          (op) => findOpeningOverlaps(facet, op, op.id).hasOverlap
        );
        if (hasAnyOverlap) {
          issues.push({
            id: `issue-opening-overlap-${facet.id}`,
            category: 'opening_overlap',
            severity: 'blocker',
            title: `Wall ${facet.code} has overlapping openings`,
            detail: 'Separate or resolve overlapping windows/doors in Elevation view before locking measure.',
            targetId: facet.id,
            targetCode: facet.code
          });
        }
      }

      if (!isWallFacetUndetailed(facet)) return;
      undetailedWallsCount += 1;
      const isReturn = returnIds.has(facet.id) || facet.kind === 'return';
      if (isReturn) {
        undetailedReturnsCount += 1;
        issues.push({
          id: `issue-return-${facet.id}`,
          category: 'undetailed_return',
          severity: 'blocker',
          title: `Return Wall ${facet.code} (${facet.lengthM.toFixed(2)}m) needs detail`,
          detail: 'Internal notch / return face has no cladding assigned and can be missed.',
          targetId: facet.id,
          targetCode: facet.code
        });
      } else if (facet.kind === 'parapet') {
        issues.push({
          id: `issue-parapet-${facet.id}`,
          category: 'undetailed_parapet',
          severity: 'warning',
          title: `Parapet Wall ${facet.code} (${facet.lengthM.toFixed(2)}m) needs cladding`,
          detail: 'Assign parapet wall cladding and verify coping flashing allowance.',
          targetId: facet.id,
          targetCode: facet.code
        });
      } else if (facet.kind === 'secondary') {
        issues.push({
          id: `issue-secondary-${facet.id}`,
          category: 'undetailed_secondary',
          severity: 'warning',
          title: `Secondary Wall ${facet.code} (${facet.lengthM.toFixed(2)}m) needs cladding`,
          detail: 'Assign cladding to secondary/patio enclosure wall face.',
          targetId: facet.id,
          targetCode: facet.code
        });
      } else {
        issues.push({
          id: `issue-wall-${facet.id}`,
          category: 'undetailed_wall',
          severity: 'warning',
          title: `Wall ${facet.code} (${facet.lengthM.toFixed(2)}m) needs cladding`,
          detail: 'Assign wall cladding (and openings if any) in Elevation view.',
          targetId: facet.id,
          targetCode: facet.code
        });
      }
    });
  }

  // 2. Roof flashings: structural lines block lock; optional eave drips warn only
  const assignedLineIds = new Set(flashingAssignments.map((a) => a.lineId));
  let unassignedFlashingsCount = 0;
  let optionalUnassignedEavesCount = 0;

  assignableLines.forEach((line) => {
    if (assignedLineIds.has(line.lineId)) return;
    if (line.flashingKind === 'eave') {
      optionalUnassignedEavesCount += 1;
      issues.push({
        id: `issue-flash-eave-${line.lineId}`,
        category: 'missing_flashing',
        severity: 'warning',
        title: `${line.label} (${getFlashingKindDisplayLabel(line.flashingKind)}) optional`,
        detail: `${line.trueSlopeLengthM.toFixed(2)}m perimeter eave has no drip flashing assigned (optional if gutter-only).`,
        targetId: line.lineId,
        targetCode: line.flashingKind
      });
      return;
    }
    unassignedFlashingsCount += 1;
    issues.push({
      id: `issue-flash-${line.lineId}`,
      category: 'missing_flashing',
      severity: 'blocker',
      title: `${line.label} (${getFlashingKindDisplayLabel(line.flashingKind)}) unassigned`,
      detail: `${line.trueSlopeLengthM.toFixed(2)}m sloped run has no flashing profile assigned.`,
      targetId: line.lineId,
      targetCode: line.flashingKind
    });
  });

  // 3. Roof planes missing pitch / sheet-run basis or unclassified outline with 0 planes
  let incompletePlanesCount = 0;

  const hasAnyRoofFootprint = levels.some((l) => l.outline.points.length >= 3);
  if (hasAnyRoofFootprint) {
    levels.forEach((lvl) => {
      if (lvl.outline.points.length < 3) return;
      const levelPlanes = planes.filter((p) => (p.levelId || 'level-1') === lvl.id);
      const unclassifiedCount = lvl.outline.edges.filter((e) => e.type === 'unclassified').length;
      if (levelPlanes.length === 0) {
        incompletePlanesCount += 1;
        issues.push({
          id: `issue-level-no-planes-${lvl.id}`,
          category: 'incomplete_plane',
          severity: 'blocker',
          title: `${lvl.code}: Roof outline has no classified eave faces`,
          detail:
            unclassifiedCount > 0
              ? `${unclassifiedCount} perimeter edges still unclassified — classify eave edges & set pitch.`
              : 'No slope planes defined for this roof level.',
          targetId: lvl.id,
          targetCode: lvl.code
        });
      }

      const mainLevelPlanes = levelPlanes.filter((p) => !p.isVirtualAssetPlane && Number.isFinite(p.pitchDeg) && p.pitchDeg > 0);
      if (mainLevelPlanes.length >= 2) {
        const distinctPitches = Array.from(
          new Set(mainLevelPlanes.map((p) => +p.pitchDeg.toFixed(1)))
        ).sort((a, b) => a - b);
        if (distinctPitches.length > 1) {
          const pitchCounts = new Map<number, number>();
          mainLevelPlanes.forEach((p) => {
            const key = +p.pitchDeg.toFixed(1);
            pitchCounts.set(key, (pitchCounts.get(key) || 0) + 1);
          });
          const majorityPitch = Array.from(pitchCounts.entries()).sort(
            (a, b) => b[1] - a[1] || b[0] - a[0]
          )[0][0];
          issues.push({
            id: `issue-mixed-pitch-${lvl.id}`,
            category: 'mixed_pitch',
            severity: 'warning',
            title: `${lvl.code}: Mixed pitches (${distinctPitches.map((p) => `${p}°`).join(' vs ')})`,
            detail: 'Confirm deliberate dual-pitch faces or multi-select & unify roof faces before lock.',
            targetId: lvl.id,
            targetCode: String(majorityPitch)
          });
        }
      }
    });
  }

  planes.forEach((plane) => {
    const missingPitch = !Number.isFinite(plane.pitchDeg) || plane.pitchDeg <= 0;
    const missingSlope = !Number.isFinite(plane.slopeLength) || (plane.slopeLength ?? 0) <= 0.1;
    const missingRunEdge = !plane.eaveEdgeId && !plane.sheetRunEdgeId;
    if (missingPitch || missingSlope || missingRunEdge) {
      incompletePlanesCount += 1;
      issues.push({
        id: `issue-plane-${plane.id}`,
        category: 'incomplete_plane',
        severity: 'blocker',
        title: `Roof Face ${plane.code} missing ${missingPitch ? 'pitch' : 'sheet-run basis'}`,
        detail: `Set valid pitch and eave/sheet-run direction on ${plane.name || plane.label}.`,
        targetId: plane.id,
        targetCode: plane.code
      });
    }
  });

  // 4. Penetrations missing valid host plane or size
  let incompletePenetrationsCount = 0;
  const planeIdSet = new Set(planes.map((p) => p.id));

  assets.forEach((asset) => {
    const missingHost = !asset.planeId || !planeIdSet.has(asset.planeId);
    const invalidSize =
      !Number.isFinite(asset.widthM) ||
      asset.widthM < 0.1 ||
      !Number.isFinite(asset.depthM) ||
      asset.depthM < 0.1;
    if (missingHost || invalidSize) {
      incompletePenetrationsCount += 1;
      issues.push({
        id: `issue-asset-${asset.id}`,
        category: 'incomplete_penetration',
        severity: 'blocker',
        title: `${asset.label || asset.type} missing ${missingHost ? 'host roof face' : 'dimensions'}`,
        detail: missingHost
          ? 'Assign a valid host roof plane and confirm distance from eave/apex.'
          : 'Confirm penetration width and depth.',
        targetId: asset.id,
        targetCode: asset.type
      });
    }
  });

  const blockersCount = issues.filter((i) => i.severity === 'blocker').length;
  const warningsCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    isComplete: issues.length === 0,
    canLockMeasure: blockersCount === 0,
    blockersCount,
    warningsCount,
    totalIssuesCount: issues.length,
    undetailedWallsCount,
    undetailedReturnsCount,
    unassignedFlashingsCount,
    optionalUnassignedEavesCount,
    incompletePlanesCount,
    incompletePenetrationsCount,
    issues
  };
}
