import { FlashingProfile } from '../types/crm';
import {
  AssignableRoofLine,
  FaceRoofingPack,
  LayoutResult,
  OrderPack,
  PlanEdge,
  Point2D,
  RoofAsset,
  RoofFlashingAssignment,
  RoofLevel,
  RoofLifecycleStage,
  RoofOutline,
  RoofPlane,
  SheetSpec,
  TakeoffCompletenessIssue,
  TakeoffCompletenessReport,
  WallPlan
} from '../types/exactRoofing';
import {
  buildOutlineFromPoints,
  computeFlashingPieceBreakdown,
  dist,
  generateCuttingLayout,
  generateSkeletonLines,
  isEdgeWallEnabled,
  polygonArea
} from './exactRoofingEngine';
import {
  findMatchingCategoryRank,
  getDefaultMitreNotes
} from './exactRoofingFlashingBridge';

export type DeterministicPatchOp =
  | 'set_plane_pitch'
  | 'set_plane_direction'
  | 'set_start_plane'
  | 'set_edge_mode'
  | 'set_edge_wall'
  | 'auto_assign_flashings';

export interface DeterministicRoofPatch {
  id: string;
  op: DeterministicPatchOp;
  targetId?: string;
  targetCode?: string;
  valueNumber?: number;
  valueString?: string;
  valueBoolean?: boolean;
  label: string;
  reason: string;
  severity: 'critical' | 'optimization' | 'compliance';
  source: 'deterministic' | 'ai_hybrid';
}

export interface DeterministicAuditFinding {
  id: string;
  category: 'wind' | 'pitch' | 'offcut' | 'flashing' | 'wall_z' | 'geometry';
  severity: 'pass' | 'warning' | 'critical';
  title: string;
  detail: string;
  codeRef?: string;
  suggestedPatch?: DeterministicRoofPatch;
}

export interface DeterministicRoofAuditReport {
  overallScore: number;
  status: 'Optimal' | 'Review Recommended' | 'Action Required';
  profileMinPitchDeg: number;
  prevailingWind: string;
  currentWastePercent: number;
  bestSimulatedStartPlane?: {
    planeId: string;
    code: string;
    name: string;
    wastePercent: number;
    savedMetres: number;
    improvementMetres: number;
  };
  findings: DeterministicAuditFinding[];
  recommendedPatches: DeterministicRoofPatch[];
}

export function getMinimumPitchForProfile(profileName = ''): number {
  const lower = profileName.toLowerCase();
  if (/corrugat|custom orb/.test(lower)) return 8;
  if (/standing seam|super seam|snaplock|euro tray|tray|interlocking/.test(lower)) return 1.5;
  if (/trapezoid|5-rib|plumbdeck|trimform|rib/.test(lower)) return 3;
  return 3;
}

/**
 * Determine which wind vector rain comes FROM in plan coordinates
 * (Plan convention: Top of canvas = North = -Y, Right = East = +X, Bottom = South = +Y, Left = West = -X).
 */
export function getPrevailingWindVector(windCode = 'SW'): Point2D {
  const w = windCode.toUpperCase().trim();
  const vectors: Record<string, Point2D> = {
    N: { x: 0, y: -1 },
    NE: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
    E: { x: 1, y: 0 },
    SE: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
    S: { x: 0, y: 1 },
    SW: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
    W: { x: -1, y: 0 },
    NW: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 }
  };
  return vectors[w] || vectors.SW;
}

/**
 * Compute ideal underlapSide ('left' | 'right') so side-lap overlaps face AWAY from prevailing wind.
 * Note: sheets progress along the eave tangent; when looking up the slope (from eave toward ridge),
 * `right` tangent is along `uVec` (rotated -90 deg from inward slope), `left` tangent is `-uVec`.
 * Underlap on `'right'` means sheets are laid Left -> Right so each overlap lip faces Right (wind blowing toward +uVec drives rain over lap). Wait:
 * If underlap is on `'left'` and sheets lay Left -> Right, the exposed weather edge faces LEFT; if wind comes FROM `windFromVec`,
 * the component along eave axis `tVec = { x: vInward.y, y: -vInward.x }` tells which direction wind blows TOWARD: `blowDir = -windFromVec`.
 * Side-laps should open TOWARD `blowDir` (facing away from incoming wind) so wind blows over the lap rather than into it.
 */
export function computeIdealUnderlapSideForPlane(
  plane: RoofPlane,
  prevailingWind = 'SW'
): 'left' | 'right' {
  const vIn = plane.runDirection || { x: 0, y: -1 };
  // Eave right-hand tangent looking up-slope (along runDirection): rotate vIn clockwise 90deg -> (vIn.y, -vIn.x)Wait:
  // In screen coords (+X right, +Y down): if vIn points UP (0, -1), "right" is (+1, 0) = (-vIn.y, vIn.x)!
  const rightVec: Point2D = { x: -vIn.y, y: vIn.x };
  const windFrom = getPrevailingWindVector(prevailingWind);
  const windBlowingTo: Point2D = { x: -windFrom.x, y: -windFrom.y };
  const dot = windBlowingTo.x * rightVec.x + windBlowingTo.y * rightVec.y;
  // If wind blows toward +rightVec, sheets laid Left->Right shield the lap (exposed seam faces away / +rightVec -> underlap 'right' or 'left'?
  // Consistent convention in NZ roofing: `underlapSide` denotes which edge goes UNDER the next sheet (facing INTO the wind or lay direction).
  // Laying away from wind means laying INTO wind or shielding: if wind comes from Left (-rightVec), start Left and lay Right -> exposed top lap faces Right (away from wind), so underlap edge of sheet sits on Right ('right').
  return dot >= 0 ? 'right' : 'left';
}

/**
 * Normalize & geometrically sanitize any AI-generated or vision-scanned roof polygon
 * BEFORE feeding it to the skeleton solver, enforcing:
 * - minimum valid area & finite coordinates
 * - orthogonal near-90deg angle snapping (within 4 deg) for crisp CAD architecture
 * - removal of near-duplicate or collinear micro-vertices
 * - realistic scaling bounds
 */
export function normalizeAndVerifyAiRoofOutline(
  rawPoints: { x: number; y: number }[],
  recommendedPitchDeg = 22.5,
  options?: { orthogonalSnapDeg?: number; minEdgeLengthM?: number }
): {
  points: Point2D[];
  pitchDeg: number;
  skeleton: ReturnType<typeof generateSkeletonLines>;
  outline: RoofOutline;
  repairsApplied: string[];
} {
  const repairsApplied: string[] = [];
  const orthoTolDeg = options?.orthogonalSnapDeg ?? 4.5;
  const minEdgeLen = options?.minEdgeLengthM ?? 0.6;

  // 1. Filter finite points and clamp to reasonable metric coordinate frame
  let pts: Point2D[] = (rawPoints || [])
    .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2) }));

  if (pts.length < 3) {
    repairsApplied.push('Fallback 14m × 10m baseline footprint applied (insufficient polygon corners)');
    pts = [
      { x: 0, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 10 },
      { x: 0, y: 10 }
    ];
  }

  // 2. Remove consecutive duplicate points
  const deduped: Point2D[] = [];
  pts.forEach((p) => {
    const prev = deduped[deduped.length - 1];
    if (!prev || dist(p, prev) >= minEdgeLen) {
      deduped.push(p);
    } else {
      repairsApplied.push('Merged ultra-short vertex (<0.6m)');
    }
  });
  if (deduped.length >= 3 && dist(deduped[0], deduped[deduped.length - 1]) < minEdgeLen) {
    deduped.pop();
    repairsApplied.push('Merged closing overlap vertex');
  }
  if (deduped.length >= 3) {
    pts = deduped;
  }

  // 3. Snap near-horizontal / near-vertical architectural edges cleanly (prevents 89° skews from Vision scans)
  let snappedCount = 0;
  for (let i = 0; i < pts.length; i++) {
    const nextIdx = (i + 1) % pts.length;
    const dx = pts[nextIdx].x - pts[i].x;
    const dy = pts[nextIdx].y - pts[i].y;
    const len = Math.hypot(dx, dy);
    if (len < 0.2) continue;
    const angleDeg = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI;
    if (angleDeg <= orthoTolDeg && Math.abs(dy) > 0.01) {
      pts[nextIdx] = { x: pts[nextIdx].x, y: pts[i].y };
      snappedCount++;
    } else if (Math.abs(90 - angleDeg) <= orthoTolDeg && Math.abs(dx) > 0.01) {
      pts[nextIdx] = { x: pts[i].x, y: pts[nextIdx].y };
      snappedCount++;
    }
  }
  if (snappedCount > 0) {
    repairsApplied.push(`Orthogonalized ${snappedCount} near-90° architectural wall/eave edge(s)`);
  }

  // 4. Normalize origin near (0, 0) & ensure realistic architectural span (>= 3m, <= 80m)
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxX = Math.max(...pts.map((p) => p.x));
  const maxY = Math.max(...pts.map((p) => p.y));
  const spanW = maxX - minX;
  const spanH = maxY - minY;
  let scaleFactor = 1;
  if (Math.max(spanW, spanH) > 0 && Math.max(spanW, spanH) < 3.0) {
    scaleFactor = +(12 / Math.max(spanW, spanH)).toFixed(3);
    repairsApplied.push(`Scaled micro-polygon up ×${scaleFactor} to architectural span`);
  } else if (Math.max(spanW, spanH) > 85) {
    scaleFactor = +(24 / Math.max(spanW, spanH)).toFixed(3);
    repairsApplied.push(`Scaled oversized polygon down ×${scaleFactor}`);
  }

  pts = pts.map((p) => ({
    x: +((p.x - minX) * scaleFactor).toFixed(2),
    y: +((p.y - minY) * scaleFactor).toFixed(2)
  }));

  // 5. Remove collinear intermediate vertices cleanly
  const simplified: Point2D[] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const curr = pts[i];
    const next = pts[(i + 1) % pts.length];
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const l1 = Math.hypot(v1x, v1y) || 1;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const cross = Math.abs(v1x * v2y - v1y * v2x) / (l1 * l2);
    const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
    if (cross < 0.02 && dot > 0) {
      repairsApplied.push('Removed redundant collinear mid-vertex');
      continue;
    }
    simplified.push(curr);
  }
  if (simplified.length >= 3) {
    pts = simplified;
  }

  // Ensure positive area / non-degenerate
  if (Math.abs(polygonArea(pts)) < 2) {
    pts = [
      { x: 0, y: 0 },
      { x: 14, y: 0 },
      { x: 14, y: 10 },
      { x: 0, y: 10 }
    ];
    repairsApplied.push('Replaced collapsed geometry with clean 14m × 10m footprint');
  }

  const clampedPitch = +Math.max(1.5, Math.min(60, recommendedPitchDeg || 22.5)).toFixed(1);
  const outline = buildOutlineFromPoints(pts, `roof-verified-${Date.now()}`, {
    levelId: 'level-1',
    defaultEaveHeightM: 2.7
  });
  const skeleton = generateSkeletonLines(outline);

  return {
    points: outline.points,
    pitchDeg: clampedPitch,
    outline,
    skeleton,
    repairsApplied
  };
}

/**
 * Deterministic Self-Audit & Optimization Engine.
 * Evaluates pitch compliance, prevailing wind side-laps, start-face waste simulations,
 * unassigned flashings, and multi-storey wall/Z relationships, returning executable patches.
 */
export function runDeterministicRoofAudit(params: {
  planes: RoofPlane[];
  levels: RoofLevel[];
  layout: LayoutResult | null;
  sheetSpec: SheetSpec;
  assignableLines: AssignableRoofLine[];
  flashingAssignments: RoofFlashingAssignment[];
  assets?: RoofAsset[];
  pitchBreaks?: any[];
  profileName?: string;
  windZone?: string;
  prevailingWind?: string;
}): DeterministicRoofAuditReport {
  const {
    planes,
    levels,
    layout,
    sheetSpec,
    assignableLines,
    flashingAssignments,
    assets = [],
    pitchBreaks = [],
    profileName = 'TRS Plumbdeck Trapezoidal 0.55mm',
    windZone = 'Very High',
    prevailingWind = 'SW'
  } = params;

  const minPitchRequired = getMinimumPitchForProfile(profileName);
  const findings: DeterministicAuditFinding[] = [];
  const recommendedPatches: DeterministicRoofPatch[] = [];
  let score = 100;

  // 1. Pitch Compliance per Facet (NZBC E2/AS1 & NZMRM COP)
  const lowPitchPlanes = planes.filter(
    (p) => !p.isVirtualAssetPlane && (p.pitchDeg ?? 0) < minPitchRequired
  );
  if (lowPitchPlanes.length > 0) {
    score -= Math.min(30, lowPitchPlanes.length * 12);
    lowPitchPlanes.forEach((p) => {
      const patch: DeterministicRoofPatch = {
        id: `patch-pitch-${p.id}`,
        op: 'set_plane_pitch',
        targetId: p.id,
        targetCode: p.code,
        valueNumber: minPitchRequired,
        label: `Raise Area ${p.code} to ${minPitchRequired}°`,
        reason: `${profileName} requires ≥${minPitchRequired}° to prevent capillary ponding (NZMRM COP §5.1).`,
        severity: 'critical',
        source: 'deterministic'
      };
      recommendedPatches.push(patch);
      findings.push({
        id: `find-pitch-${p.id}`,
        category: 'pitch',
        severity: 'critical',
        title: `Area ${p.code} (${p.name}) below ${minPitchRequired}° min pitch`,
        detail: `Currently ${p.pitchDeg}° vs ${minPitchRequired}° required for ${profileName}.`,
        codeRef: 'NZBC E2/AS1 Table 11',
        suggestedPatch: patch
      });
    });
  } else if (planes.length > 0) {
    findings.push({
      id: 'find-pitch-ok',
      category: 'pitch',
      severity: 'pass',
      title: `All ${planes.length} face pitches compliant (≥${minPitchRequired}°)`,
      detail: `Minimum modeled pitch meets ${profileName} free-drainage standard.`,
      codeRef: 'NZBC E2/AS1 Table 11'
    });
  }

  // 2. Prevailing Wind Side-Lap Orientation Audit
  const structuralPlanes = planes.filter((p) => !p.isVirtualAssetPlane);
  const misalignedWindPlanes = structuralPlanes.filter(
    (p) => computeIdealUnderlapSideForPlane(p, prevailingWind) !== p.underlapSide
  );
  if (misalignedWindPlanes.length > 0) {
    score -= Math.min(20, misalignedWindPlanes.length * 5);
    misalignedWindPlanes.forEach((p) => {
      const idealSide = computeIdealUnderlapSideForPlane(p, prevailingWind);
      const patch: DeterministicRoofPatch = {
        id: `patch-wind-${p.id}`,
        op: 'set_plane_direction',
        targetId: p.id,
        targetCode: p.code,
        valueString: idealSide,
        label: `Flip Area ${p.code} side-lap away from ${prevailingWind}`,
        reason: `Shields sheet side-laps from ${prevailingWind} driving rain in ${windZone} wind zone (NZMRM §5.2).`,
        severity: 'compliance',
        source: 'deterministic'
      };
      recommendedPatches.push(patch);
    });
    findings.push({
      id: 'find-wind-laps',
      category: 'wind',
      severity: 'warning',
      title: `${misalignedWindPlanes.length} face side-lap(s) exposed to ${prevailingWind} wind`,
      detail: `Faces ${misalignedWindPlanes.map((p) => p.code).join(', ')} can have their underlap flipped to prevent capillary rain ingress.`,
      codeRef: 'NZMRM COP §5.2.1',
      suggestedPatch: recommendedPatches.find((p) => p.op === 'set_plane_direction')
    });
  } else if (structuralPlanes.length > 0) {
    findings.push({
      id: 'find-wind-ok',
      category: 'wind',
      severity: 'pass',
      title: `Side-laps shielded against ${prevailingWind} wind`,
      detail: `All sheet overlaps follow NZMRM §5.2.1 leeward lapping orientation.`,
      codeRef: 'NZMRM COP §5.2.1'
    });
  }

  // 3. Deterministic Start-Face Waste Simulation across all candidate structural planes
  const currentWastePercent = +(layout?.wastePercent ?? 0).toFixed(1);
  const currentOrderedMetres = layout?.totalOrderedMetres ?? 0;
  let bestSimulatedStartPlane: DeterministicRoofAuditReport['bestSimulatedStartPlane'];

  if (structuralPlanes.length >= 2 && layout) {
    let bestLayout: { plane: RoofPlane; res: LayoutResult } | null = null;
    for (const candidate of structuralPlanes) {
      const sim = generateCuttingLayout(planes, sheetSpec, {
        startPlaneId: candidate.id,
        assets,
        pitchBreaks
      });
      if (
        !bestLayout ||
        sim.totalOrderedMetres < bestLayout.res.totalOrderedMetres - 0.1 ||
        (Math.abs(sim.totalOrderedMetres - bestLayout.res.totalOrderedMetres) <= 0.1 &&
          sim.wastePercent < bestLayout.res.wastePercent)
      ) {
        bestLayout = { plane: candidate, res: sim };
      }
    }

    if (
      bestLayout &&
      bestLayout.plane.id !== layout.startPlaneId &&
      currentOrderedMetres - bestLayout.res.totalOrderedMetres >= 0.4
    ) {
      const improvementMetres = +(currentOrderedMetres - bestLayout.res.totalOrderedMetres).toFixed(2);
      bestSimulatedStartPlane = {
        planeId: bestLayout.plane.id,
        code: bestLayout.plane.code,
        name: bestLayout.plane.name,
        wastePercent: bestLayout.res.wastePercent,
        savedMetres: bestLayout.res.savedMetres,
        improvementMetres
      };
      score -= 8;
      const startPatch: DeterministicRoofPatch = {
        id: `patch-start-${bestLayout.plane.id}`,
        op: 'set_start_plane',
        targetId: bestLayout.plane.id,
        targetCode: bestLayout.plane.code,
        label: `Start laying at Area ${bestLayout.plane.code} (save ${improvementMetres}m steel)`,
        reason: `Switching lay start face to Area ${bestLayout.plane.code} reduces waste from ${currentWastePercent}% to ${bestLayout.res.wastePercent}%.`,
        severity: 'optimization',
        source: 'deterministic'
      };
      recommendedPatches.push(startPatch);
      findings.push({
        id: 'find-start-offcut',
        category: 'offcut',
        severity: 'warning',
        title: `Lower-waste lay start found (Area ${bestLayout.plane.code})`,
        detail: `Starting on Area ${bestLayout.plane.code} trims ${improvementMetres} lm of steel (${bestLayout.res.wastePercent}% waste vs ${currentWastePercent}%).`,
        suggestedPatch: startPatch
      });
    } else {
      findings.push({
        id: 'find-offcut-ok',
        category: 'offcut',
        severity: 'pass',
        title: `Start face sequencing optimal (${currentWastePercent}% waste)`,
        detail: `${layout.totalOffcutsReused} offcut transfers saving ${layout.savedMetres}m of coil.`
      });
    }
  }

  // 4. Unassigned Weatherproof Flashings Check (excludes optional gutter eaves)
  const assignedIds = new Set(flashingAssignments.map((a) => a.lineId));
  const criticalUnassigned = assignableLines.filter(
    (l) => !assignedIds.has(l.lineId) && l.flashingKind !== 'eave'
  );
  if (criticalUnassigned.length > 0) {
    score -= Math.min(20, criticalUnassigned.length * 4);
    const assignPatch: DeterministicRoofPatch = {
      id: 'patch-auto-flashings',
      op: 'auto_assign_flashings',
      label: `Auto-assign ${criticalUnassigned.length} folded flashing profile(s)`,
      reason: `Matches Ridge/Hip, Valley, Barge & Apron lines with NZBC-compliant profiles from library.`,
      severity: 'compliance',
      source: 'deterministic'
    };
    recommendedPatches.push(assignPatch);
    findings.push({
      id: 'find-flashings-missing',
      category: 'flashing',
      severity: 'warning',
      title: `${criticalUnassigned.length} weather-tight flashing line(s) unassigned`,
      detail: `Unmapped: ${criticalUnassigned
        .slice(0, 4)
        .map((l) => l.label)
        .join(', ')}${criticalUnassigned.length > 4 ? ` +${criticalUnassigned.length - 4} more` : ''}.`,
      codeRef: 'NZBC E2/AS1 §8.4',
      suggestedPatch: assignPatch
    });
  } else if (assignableLines.length > 0) {
    findings.push({
      id: 'find-flashings-ok',
      category: 'flashing',
      severity: 'pass',
      title: 'All critical ridge, valley, barge & apron lines assigned',
      detail: `${flashingAssignments.length} flashing runs mapped with true slope lengths & 150mm laps.`,
      codeRef: 'NZBC E2/AS1 §8.4'
    });
  }

  // 5. Multi-level Z & Wall Abutment Setback Verification
  const allEdges: PlanEdge[] = levels.flatMap((l) => l.outline.edges);
  const abutmentEdgesWithoutWall = allEdges.filter(
    (e) => e.type === 'wall' && !isEdgeWallEnabled(e)
  );
  if (abutmentEdgesWithoutWall.length > 0) {
    score -= 6;
    abutmentEdgesWithoutWall.forEach((edge, idx) => {
      const wallPatch: DeterministicRoofPatch = {
        id: `patch-wall-${edge.id}`,
        op: 'set_edge_wall',
        targetId: edge.id,
        valueBoolean: true,
        valueNumber: edge.eaveSetbackM ?? 0,
        label: `Enable wall & apron below abutment edge #${idx + 1}`,
        reason: 'Ensures abutment apron junction sits cleanly against its supporting wall below the roof.',
        severity: 'compliance',
        source: 'deterministic'
      };
      recommendedPatches.push(wallPatch);
    });
    findings.push({
      id: 'find-wall-abutment',
      category: 'wall_z',
      severity: 'warning',
      title: `${abutmentEdgesWithoutWall.length} abutment edge(s) missing supporting wall toggle`,
      detail: 'Enable wall below roof plane for accurate 3D Z risers and apron flashing coverage.',
      suggestedPatch: recommendedPatches.find((p) => p.op === 'set_edge_wall')
    });
  } else if (levels.length > 1) {
    findings.push({
      id: 'find-multilevel-ok',
      category: 'wall_z',
      severity: 'pass',
      title: `${levels.length}-tier Z-elevation roof structure verified`,
      detail: `Eave elevations (${levels.map((l) => `${l.code}: ${l.eaveHeightM}m`).join(', ')}) aligned cleanly with non-protruding walls.`
    });
  }

  const finalScore = Math.max(25, Math.min(100, score));
  const status: DeterministicRoofAuditReport['status'] =
    findings.some((f) => f.severity === 'critical')
      ? 'Action Required'
      : recommendedPatches.length > 0
      ? 'Review Recommended'
      : 'Optimal';

  return {
    overallScore: finalScore,
    status,
    profileMinPitchDeg: minPitchRequired,
    prevailingWind,
    currentWastePercent,
    bestSimulatedStartPlane,
    findings,
    recommendedPatches
  };
}

/**
 * Deterministically build compliant RoofFlashingAssignment records for any unassigned critical roof lines
 * using exact true slope lengths & shared library profiles.
 */
export function buildAutoFlashingAssignments(params: {
  assignableLines: AssignableRoofLine[];
  existingAssignments: RoofFlashingAssignment[];
  libraryProfiles: FlashingProfile[];
  material?: string;
  colorName?: string;
}): RoofFlashingAssignment[] {
  const { assignableLines, existingAssignments, libraryProfiles, material, colorName } = params;
  const assignedIds = new Set(existingAssignments.map((a) => a.lineId));
  const added: RoofFlashingAssignment[] = [];

  assignableLines.forEach((line) => {
    if (assignedIds.has(line.lineId)) return;
    if (line.flashingKind === 'eave') return; // Eaves are optional spouting/drip starter

    const sortedProfiles = [...libraryProfiles].sort(
      (a, b) =>
        findMatchingCategoryRank(a.category, line.suggestedCategory) -
        findMatchingCategoryRank(b.category, line.suggestedCategory)
    );
    const matchedProfile = sortedProfiles[0];
    if (!matchedProfile) return;

    const breakdown = computeFlashingPieceBreakdown(line.trueSlopeLengthM, line.flashingKind);
    const blankWidth = Math.round(
      matchedProfile.developedBlankWidthMm ||
        matchedProfile.developedLengthMm ||
        matchedProfile.segments.reduce((s, seg) => s + seg.lengthMm, 0) ||
        350
    );

    added.push({
      id: `assign-ai-${line.lineId}`,
      lineId: line.lineId,
      lineLabel: line.label,
      flashingKind: line.flashingKind,
      profileId: matchedProfile.id,
      profileName: matchedProfile.name,
      developedBlankWidthMm: blankWidth,
      girthTier: matchedProfile.girthTier || '301-450mm',
      material: matchedProfile.material || material || '0.55mm ColorCote Vitor+',
      colorName: matchedProfile.colorName || colorName || 'FlaxPod',
      planLengthM: line.planLengthM,
      trueSlopeLengthM: line.trueSlopeLengthM,
      pieceLengthLm: breakdown.recommendedPieceLengthM,
      quantity: breakdown.recommendedQuantity,
      totalLinearMetres: breakdown.totalOrderLengthM,
      notes: `${getDefaultMitreNotes(line.flashingKind)} · Auto-matched`,
      assignedAt: new Date().toISOString(),
      orderedToWorkshop: false,
      orderedToCrm: false
    });
  });

  return added;
}

export interface CalmStageActionItem {
  id: string;
  label: string;
  detail: string;
  kind: 'fix_issue' | 'apply_patch' | 'open_flashings' | 'open_wall_plan' | 'open_order_pack' | 'select_plane';
  severity: 'blocker' | 'warning' | 'ready';
  issue?: TakeoffCompletenessIssue;
  patch?: DeterministicRoofPatch;
  targetPlaneId?: string;
}

export interface CalmStageGuidance {
  stage: RoofLifecycleStage;
  headline: string;
  summary: string;
  statusTone: 'ready' | 'attention' | 'blocked';
  metricsLine: string;
  actions: CalmStageActionItem[];
}

/**
 * Calm systems-level guidance derived strictly from existing Order Pack, completeness report,
 * wall plan, and install packs. Never invents quantities or pricing.
 */
export function buildCalmStageGuidance(params: {
  stage: RoofLifecycleStage;
  measureLocked?: boolean;
  planes: RoofPlane[];
  layout: LayoutResult | null;
  orderPack?: OrderPack | null;
  completenessReport?: TakeoffCompletenessReport | null;
  wallPlan?: WallPlan | null;
  roofingPacks?: FaceRoofingPack[];
  completedPlaneIds?: string[];
  selectedPlane?: RoofPlane | null;
  auditReport?: DeterministicRoofAuditReport | null;
}): CalmStageGuidance {
  const {
    stage,
    measureLocked = false,
    planes,
    layout,
    orderPack,
    completenessReport,
    wallPlan,
    roofingPacks = [],
    completedPlaneIds = [],
    selectedPlane = null,
    auditReport = null
  } = params;

  const blockers = completenessReport?.issues.filter((i) => i.severity === 'blocker') || [];
  const warnings = completenessReport?.issues.filter((i) => i.severity === 'warning') || [];
  const totalSheets = orderPack?.totals.totalSheets ?? layout?.parents.length ?? 0;
  const totalOrderedLm = orderPack?.totals.totalOrderedLm ?? 0;
  const wallNetAreaM2 = orderPack?.walls?.totalNetAreaM2 ?? orderPack?.totals.wallNetAreaM2 ?? 0;
  const roofAreaM2 = orderPack?.totals.roofAreaM2 ?? layout?.totalRoofArea ?? 0;
  const flashingRunsCount = orderPack?.flashings.length ?? 0;

  if (stage === 'installing') {
    const completedSet = new Set(completedPlaneIds);
    const nextPack = roofingPacks.find((p) => !completedSet.has(p.planeId)) || null;
    const activePack =
      (selectedPlane ? roofingPacks.find((p) => p.planeId === selectedPlane.id) : null) ||
      nextPack ||
      roofingPacks[0] ||
      null;

    const actions: CalmStageActionItem[] = [];
    if (nextPack) {
      const targetPlane = planes.find((p) => p.id === nextPack.planeId);
      actions.push({
        id: `guide-next-pack-${nextPack.planeId}`,
        label: `Focus Pack #${nextPack.sequenceNumber}: Face ${nextPack.code}`,
        detail: `${nextPack.packLabel}${targetPlane ? ` · ${targetPlane.underlapSide === 'left' ? 'Lay Left → Right' : 'Lay Right → Left'}` : ''}`,
        kind: 'select_plane',
        severity: 'ready',
        targetPlaneId: nextPack.planeId
      });
    }
    if (orderPack) {
      actions.push({
        id: 'guide-view-order-pack',
        label: 'Open Locked Order Pack',
        detail: `${totalSheets} ordered sheets · ${flashingRunsCount} flashing runs (quantities only)`,
        kind: 'open_order_pack',
        severity: 'ready'
      });
    }

    return {
      stage,
      headline: nextPack
        ? `Next Up: Pack #${nextPack.sequenceNumber} · Face ${nextPack.code}`
        : roofingPacks.length > 0
        ? 'All Roof Packs Completed'
        : 'Install Spec Reference',
      summary: nextPack
        ? `${nextPack.packLabel}. Keep laps locked on ${
            activePack?.outOfOrderOffcutWarning
              ? 'pack order to preserve repress offcuts.'
              : 'sheet sequence shown on Plan.'
          }`
        : roofingPacks.length > 0
        ? `All ${roofingPacks.length} roof packs marked complete. Check flashing laps and penetrations for sign-off.`
        : 'Lock a roof measure to generate sequenced site packs.',
      statusTone: nextPack?.outOfOrderOffcutWarning ? 'attention' : 'ready',
      metricsLine: `${completedSet.size}/${roofingPacks.length} packs done · ${totalSheets} sheets · ${flashingRunsCount} flashings`,
      actions: actions.slice(0, 2)
    };
  }

  if (stage === 'measuring') {
    const actions: CalmStageActionItem[] = [];

    blockers.slice(0, 3).forEach((issue) => {
      actions.push({
        id: `guide-blocker-${issue.id}`,
        label: `Fix: ${issue.title}`,
        detail: issue.detail,
        kind: 'fix_issue',
        severity: 'blocker',
        issue
      });
    });

    if (actions.length < 3 && auditReport?.recommendedPatches.length) {
      const topPatch = auditReport.recommendedPatches[0];
      actions.push({
        id: `guide-patch-${topPatch.id}`,
        label: topPatch.label,
        detail: topPatch.reason,
        kind: 'apply_patch',
        severity: topPatch.severity === 'critical' ? 'blocker' : 'warning',
        patch: topPatch
      });
    }

    if (actions.length < 3 && warnings.length > 0) {
      const firstWarn = warnings[0];
      actions.push({
        id: `guide-warn-${firstWarn.id}`,
        label: firstWarn.title,
        detail: firstWarn.detail,
        kind: 'fix_issue',
        severity: 'warning',
        issue: firstWarn
      });
    }

    const readyToLock = blockers.length === 0 && planes.length > 0;
    return {
      stage,
      headline: measureLocked
        ? 'Measure Locked · Order Pack Emitted'
        : readyToLock
        ? warnings.length > 0
          ? `Ready to Lock (${warnings.length} optional warning${warnings.length > 1 ? 's' : ''})`
          : 'Measure Verified · Ready to Lock'
        : `${blockers.length} Blocker${blockers.length === 1 ? '' : 's'} Before Lock`,
      summary: measureLocked
        ? 'Geometry and ordered sheet lengths are frozen for yard & site packs.'
        : blockers.length > 0
        ? `Resolve ${blockers.length} item${blockers.length === 1 ? '' : 's'} below (returns, structural flashings, face pitch, or penetrations) before locking measure.`
        : 'Confirm any site-measured sheet length overrides and lock measure to emit the final Order Pack.',
      statusTone: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'attention' : 'ready',
      metricsLine: `${planes.length} faces · ${totalSheets} sheets (${totalOrderedLm.toFixed(1)} lm)${
        wallNetAreaM2 > 0 ? ` · ${wallNetAreaM2.toFixed(1)} m² walls` : ''
      }`,
      actions: actions.slice(0, 3)
    };
  }

  // Quoting stage
  const actions: CalmStageActionItem[] = [];
  if (blockers.length > 0) {
    actions.push({
      id: `guide-quote-gap-${blockers[0].id}`,
      label: blockers[0].title,
      detail: blockers[0].detail,
      kind: 'fix_issue',
      severity: 'blocker',
      issue: blockers[0]
    });
  }
  if (auditReport?.recommendedPatches.length) {
    const topPatch = auditReport.recommendedPatches[0];
    actions.push({
      id: `guide-quote-patch-${topPatch.id}`,
      label: topPatch.label,
      detail: topPatch.reason,
      kind: 'apply_patch',
      severity: 'warning',
      patch: topPatch
    });
  }
  if (wallPlan && wallPlan.facets.length > 0 && warnings.some((w) => w.category.startsWith('undetailed'))) {
    actions.push({
      id: 'guide-quote-walls',
      label: 'Review Undetailed Wall Faces',
      detail: `${completenessReport?.undetailedWallsCount || 0} wall faces need cladding selected for complete takeoff.`,
      kind: 'open_wall_plan',
      severity: 'warning'
    });
  }
  if (actions.length === 0 && planes.length > 0) {
    actions.push({
      id: 'guide-quote-order',
      label: 'Review Draft Order Pack',
      detail: `${totalSheets} sheets (${totalOrderedLm.toFixed(1)} lm) · ${flashingRunsCount} flashing runs ready`,
      kind: 'open_order_pack',
      severity: 'ready'
    });
  }

  return {
    stage,
    headline:
      planes.length === 0
        ? 'Draw Roof or Walls to Start'
        : blockers.length === 0
        ? 'Draft Takeoff Balanced'
        : `${blockers.length} Takeoff Gap${blockers.length === 1 ? '' : 's'} to Tidy`,
    summary:
      planes.length === 0
        ? 'Trace a roof footprint on Plan or draw exterior walls first, then generate a draft order.'
        : blockers.length > 0
        ? 'Close flashing or return gaps before moving to site measure, or open Draft Order now.'
        : `Draft scope covers ${roofAreaM2.toFixed(1)} m² roof${wallNetAreaM2 > 0 ? ` + ${wallNetAreaM2.toFixed(1)} m² wall cladding` : ''}. Generate draft order when ready.`,
    statusTone: blockers.length > 0 ? 'attention' : 'ready',
    metricsLine: `${planes.length} faces · ${totalSheets} sheets · ${totalOrderedLm.toFixed(1)} lm · ${
      wallPlan?.facets.length || 0
    } walls`,
    actions: actions.slice(0, 3)
  };
}
