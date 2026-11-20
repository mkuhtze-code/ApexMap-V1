import * as THREE from 'three';
import {
  PitchBreakLine,
  Point2D,
  RoofAsset,
  RoofLevel,
  RoofOutline,
  RoofPlane,
  SkeletonLine,
  WallFilterMode,
  WallPlan
} from '../../../types/exactRoofing';
import {
  computeGableDormerGeometry,
  deriveRoofWallSegments,
  isPointInPolygon,
  resolveEffectivePlanesWithAssets
} from '../../../utils/exactRoofingEngine';
import {
  ColorsteelSwatch,
  ProceduralRoofTextureSet,
  Roof3DShadingMode,
  WallCladdingTextureSet
} from './roofMaterials';
import { buildWallPlan3DGroup } from './wallMeshBuilder';

export interface Roof3DBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  midX: number;
  midY: number;
  midZ: number;
  maxZ: number;
  span: number;
}

export interface BuiltRoofScene {
  rootGroup: THREE.Group;
  selectableMeshes: THREE.Mesh[];
  planeMeshById: Map<string, THREE.Mesh[]>;
  glazingMaterials: THREE.MeshPhysicalMaterial[];
  bounds: Roof3DBounds;
  dispose: () => void;
}

/** Map 2D roof plan coords + Z-up elevation into Three.js right-handed (X, Y-up, Z) */
function toThreeVec(x: number, y: number, z: number, bounds: Roof3DBounds): THREE.Vector3 {
  return new THREE.Vector3(x - bounds.midX, z, y - bounds.midY);
}

/** Resolve structural Z fall frame (strictly perpendicular to eave) vs UV sheet-run axes */
function resolvePlaneAxesAndFall(plane: RoofPlane, levelOutline: RoofOutline) {
  const eaveEdge = levelOutline.edges.find((e) => e.id === plane.eaveEdgeId);
  const isChild = Boolean(plane.parentPlaneId || plane.isVirtualAssetPlane);

  const eaveA = isChild
    ? plane.planPolygon[0]
    : eaveEdge?.from || plane.planPolygon[0];
  const eaveB = isChild
    ? plane.planPolygon[1] || eaveA
    : eaveEdge?.to || plane.planPolygon[1] || eaveA;

  const dx = eaveB.x - eaveA.x;
  const dy = eaveB.y - eaveA.y;
  const len = Math.hypot(dx, dy) || 1;
  const eaveU2D = { x: dx / len, y: dy / len };
  const eavePerp2D = { x: -eaveU2D.y, y: eaveU2D.x };

  const cx = plane.planPolygon.reduce((a, b) => a + b.x, 0) / plane.planPolygon.length;
  const cy = plane.planPolygon.reduce((a, b) => a + b.y, 0) / plane.planPolygon.length;
  const dot = (cx - eaveA.x) * eavePerp2D.x + (cy - eaveA.y) * eavePerp2D.y;

  // For structural planes, Z elevation always rises perpendicular to the horizontal eave!
  // For virtual/child planes without level eaveEdge, fall back to plane.runDirection if set.
  const fallInward2D = isChild
    ? plane.runDirection || (dot >= 0 ? eavePerp2D : { x: -eavePerp2D.x, y: -eavePerp2D.y })
    : eaveEdge
    ? dot >= 0
      ? eavePerp2D
      : { x: -eavePerp2D.x, y: -eavePerp2D.y }
    : plane.runDirection || (dot >= 0 ? eavePerp2D : { x: -eavePerp2D.x, y: -eavePerp2D.y });

  // Sheet UV orientation follows explicit sheetRunEdgeId when set, otherwise falls back to eaveEdge
  const sheetRefEdge =
    !isChild && plane.sheetRunEdgeId
      ? levelOutline.edges.find((e) => e.id === plane.sheetRunEdgeId) || eaveEdge
      : eaveEdge;

  let uvEdgeU2D = eaveU2D;
  let uvRunDir2D = plane.runDirection || fallInward2D;

  if (!isChild && sheetRefEdge && sheetRefEdge.id !== plane.eaveEdgeId) {
    const sDx = sheetRefEdge.to.x - sheetRefEdge.from.x;
    const sDy = sheetRefEdge.to.y - sheetRefEdge.from.y;
    const sLen = Math.hypot(sDx, sDy);
    if (sLen > 0.05) {
      let candU = { x: sDx / sLen, y: sDy / sLen };
      if (candU.x * eaveU2D.x + candU.y * eaveU2D.y < 0) {
        candU = { x: -candU.x, y: -candU.y };
      }
      uvEdgeU2D = candU;
      if (!plane.runDirection) {
        const candV = { x: -candU.y, y: candU.x };
        const dFall = candV.x * fallInward2D.x + candV.y * fallInward2D.y;
        const dCent = (cx - eaveA.x) * candV.x + (cy - eaveA.y) * candV.y;
        uvRunDir2D = dFall >= 0 || (Math.abs(dFall) < 0.05 && dCent >= 0) ? candV : { x: -candV.x, y: -candV.y };
      }
    }
  }

  return { eaveA, fallInward2D, uvEdgeU2D, uvRunDir2D };
}

/** Evaluate exact 3D elevation Z at plan point (x,y) on a given roof plane */
function evalPlaneZ(pt: Point2D, plane: RoofPlane, levelOutline: RoofOutline): number {
  const { eaveA, fallInward2D } = resolvePlaneAxesAndFall(plane, levelOutline);
  const baseH = plane.eaveHeightM ?? 2.7;
  const tanPitch = Math.tan(((plane.pitchDeg || 0) * Math.PI) / 180);
  const vDist = Math.max(0, (pt.x - eaveA.x) * fallInward2D.x + (pt.y - eaveA.y) * fallInward2D.y);
  return baseH + vDist * tanPitch;
}

function pointInPoly2D(pt: THREE.Vector2, poly: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > pt.y !== yj > pt.y &&
      pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment2D(p: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return p.distanceTo(a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function minDistToPolyEdges2D(pt: THREE.Vector2, poly: THREE.Vector2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = distToSegment2D(pt, poly[i], poly[(i + 1) % poly.length]);
    if (d < best) best = d;
  }
  return best;
}

function dedupePoly2D(pts: THREE.Vector2[], minStep = 0.005): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (const p of pts) {
    if (out.length === 0 || out[out.length - 1].distanceTo(p) >= minStep) {
      out.push(p.clone());
    }
  }
  if (out.length > 1 && out[out.length - 1].distanceTo(out[0]) < minStep) {
    out.pop();
  }
  return out;
}

/**
 * Clamps and validates a 2D aperture loop strictly inside the host boundary (`outer2D`)
 * with CW winding (`area < 0`, opposite to CCW `outer2D`) so THREE.ShapeUtils.triangulateShape
 * cuts crisp manifold holes without ever failing on touching ridge/eave edges.
 */
function sanitizeHole2D(
  outer2D: THREE.Vector2[],
  rawHole2D: THREE.Vector2[],
  acceptedHoles2D: THREE.Vector2[][]
): THREE.Vector2[] | null {
  const clean = dedupePoly2D(rawHole2D, 0.006);
  if (clean.length < 3 || Math.abs(THREE.ShapeUtils.area(clean)) < 0.025) return null;

  const holeCent = clean
    .reduce((acc, p) => acc.add(p), new THREE.Vector2())
    .divideScalar(clean.length);
  const outerCent = outer2D
    .reduce((acc, p) => acc.add(p), new THREE.Vector2())
    .divideScalar(outer2D.length);

  // Pull toward hole centroid if strictly inside outer, otherwise toward outer centroid
  const target =
    pointInPoly2D(holeCent, outer2D) && minDistToPolyEdges2D(holeCent, outer2D) > 0.04
      ? holeCent
      : outerCent;

  const margin = 0.024;
  const clamped = clean.map((pt) => {
    if (pointInPoly2D(pt, outer2D) && minDistToPolyEdges2D(pt, outer2D) >= margin) {
      return pt;
    }
    let lo = 0;
    let hi = 1;
    let bestPt: THREE.Vector2 | null = null;
    for (let iter = 0; iter < 14; iter++) {
      const mid = (lo + hi) * 0.5;
      const cand = new THREE.Vector2().lerpVectors(pt, target, mid);
      if (pointInPoly2D(cand, outer2D) && minDistToPolyEdges2D(cand, outer2D) >= margin) {
        bestPt = cand;
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return bestPt || pt.clone().lerp(target, 0.15);
  });

  const finalHole = dedupePoly2D(clamped, 0.006);
  if (finalHole.length < 3 || Math.abs(THREE.ShapeUtils.area(finalHole)) < 0.02) return null;

  // Ensure every vertex rests inside outer polygon
  if (finalHole.some((p) => !pointInPoly2D(p, outer2D))) return null;

  // Ensure hole is non-overlapping with previously accepted holes
  const hMinX = Math.min(...finalHole.map((p) => p.x));
  const hMaxX = Math.max(...finalHole.map((p) => p.x));
  const hMinY = Math.min(...finalHole.map((p) => p.y));
  const hMaxY = Math.max(...finalHole.map((p) => p.y));

  for (const prev of acceptedHoles2D) {
    const pMinX = Math.min(...prev.map((p) => p.x));
    const pMaxX = Math.max(...prev.map((p) => p.x));
    const pMinY = Math.min(...prev.map((p) => p.y));
    const pMaxY = Math.max(...prev.map((p) => p.y));
    const bboxOverlap =
      hMinX <= pMaxX + 0.02 &&
      hMaxX >= pMinX - 0.02 &&
      hMinY <= pMaxY + 0.02 &&
      hMaxY >= pMinY - 0.02;
    if (bboxOverlap) {
      if (finalHole.some((p) => pointInPoly2D(p, prev)) || prev.some((p) => pointInPoly2D(p, finalHole))) {
        return null;
      }
    }
  }

  // Opposite winding to CCW outer contour: ensure negative signed area (CW)
  if (THREE.ShapeUtils.area(finalHole) > 0) {
    finalHole.reverse();
  }
  return finalHole;
}

/**
 * Builds a solid watertight sloped slab geometry with real punched holes (skylights, chimneys,
 * mono/gable dormers), interior opening thickness reveal skirts, outer fascia/barge skirts,
 * and orthonormal UVs aligned to (uAxis = across ribs, vSlopeDir = up slope).
 */
function buildSlopedSlabGeometry(
  topPoints3D: THREE.Vector3[],
  uAxis: THREE.Vector3,
  vSlopeDir: THREE.Vector3,
  thicknessM = 0.068,
  holePolygons3D: THREE.Vector3[][] = []
): { geometry: THREE.BufferGeometry; holes2D: THREE.Vector2[][] } {
  const geom = new THREE.BufferGeometry();
  if (topPoints3D.length < 3) return { geometry: geom, holes2D: [] };

  // Orthonormal in-plane frame with upward-pointing +Y normal
  const normal = new THREE.Vector3().crossVectors(vSlopeDir, uAxis).normalize();
  if (normal.y < 0) normal.negate();
  const basisV = vSlopeDir.clone().normalize();
  const basisU = new THREE.Vector3().crossVectors(basisV, normal).normalize();
  if (basisU.dot(uAxis) < 0) basisU.negate();

  const origin = topPoints3D[0];
  const rawPts2D = topPoints3D.map((p) => {
    const rel = p.clone().sub(origin);
    return new THREE.Vector2(rel.dot(basisU), rel.dot(basisV));
  });

  // Ensure outer contour is CCW (positive 2D signed area) & non-duplicated
  const area2D = THREE.ShapeUtils.area(rawPts2D);
  const rawIndices =
    area2D >= 0 ? topPoints3D.map((_, i) => i) : topPoints3D.map((_, i) => i).reverse();

  const ordered2D: THREE.Vector2[] = [];
  const orderedTop: THREE.Vector3[] = [];
  for (const idx of rawIndices) {
    const p2 = rawPts2D[idx];
    if (ordered2D.length === 0 || ordered2D[ordered2D.length - 1].distanceTo(p2) >= 0.004) {
      ordered2D.push(p2);
      orderedTop.push(topPoints3D[idx]);
    }
  }
  if (ordered2D.length > 2 && ordered2D[ordered2D.length - 1].distanceTo(ordered2D[0]) < 0.004) {
    ordered2D.pop();
    orderedTop.pop();
  }

  const nOuter = orderedTop.length;
  if (nOuter < 3) return { geometry: geom, holes2D: [] };

  const offsetVec = normal.clone().multiplyScalar(-thicknessM);

  // Sanitize holes inside CCW outer boundary
  const acceptedHoles2D: THREE.Vector2[][] = [];
  for (const rawHole3D of holePolygons3D) {
    if (rawHole3D.length < 3) continue;
    const rawH2D = rawHole3D.map((p) => {
      const rel = p.clone().sub(origin);
      return new THREE.Vector2(rel.dot(basisU), rel.dot(basisV));
    });
    const cleanHole = sanitizeHole2D(ordered2D, rawH2D, acceptedHoles2D);
    if (cleanHole) {
      acceptedHoles2D.push(cleanHole);
    }
  }

  let usedHoles2D = acceptedHoles2D;
  let triangles = THREE.ShapeUtils.triangulateShape(ordered2D, usedHoles2D);
  if (triangles.length === 0 && usedHoles2D.length > 0) {
    // Graceful recovery: never allow a degenerate hole to drop an entire roof plane
    usedHoles2D = [];
    triangles = THREE.ShapeUtils.triangulateShape(ordered2D, []);
  }

  // Reconstruct exact coplanar 3D coordinates for every hole vertex
  const holesTop3D: THREE.Vector3[][] = usedHoles2D.map((holeLoop) =>
    holeLoop.map((uv) =>
      origin.clone().addScaledVector(basisU, uv.x).addScaledVector(basisV, uv.y)
    )
  );

  const all2D: THREE.Vector2[] = [...ordered2D, ...usedHoles2D.flat()];
  const allTop3D: THREE.Vector3[] = [...orderedTop, ...holesTop3D.flat()];
  const allBot3D: THREE.Vector3[] = allTop3D.map((p) => p.clone().add(offsetVec));

  const positions: number[] = [];
  const uvs: number[] = [];

  const pushTri = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    ua: THREE.Vector2,
    ub: THREE.Vector2,
    uc: THREE.Vector2
  ) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    uvs.push(ua.x, ua.y, ub.x, ub.y, uc.x, uc.y);
  };

  // Top cladding face triangles (outward normal = +normal)
  triangles.forEach(([ia, ib, ic]) => {
    const a = allTop3D[ia];
    const b = allTop3D[ib];
    const c = allTop3D[ic];
    if (!a || !b || !c) return;
    const triN = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (triN.dot(normal) >= 0) {
      pushTri(a, b, c, all2D[ia], all2D[ib], all2D[ic]);
    } else {
      pushTri(a, c, b, all2D[ia], all2D[ic], all2D[ib]);
    }
  });

  // Bottom soffit triangles (outward normal = -normal)
  triangles.forEach(([ia, ib, ic]) => {
    const a = allBot3D[ia];
    const b = allBot3D[ib];
    const c = allBot3D[ic];
    if (!a || !b || !c) return;
    const triN = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (triN.dot(normal) <= 0) {
      pushTri(a, b, c, all2D[ia], all2D[ib], all2D[ic]);
    } else {
      pushTri(a, c, b, all2D[ia], all2D[ic], all2D[ib]);
    }
  });

  // Outer perimeter fascia / barge edge skirts
  const outerBot3D = allBot3D.slice(0, nOuter);
  const outerCentroid = orderedTop
    .reduce((acc, p) => acc.add(p), new THREE.Vector3())
    .divideScalar(nOuter);

  for (let i = 0; i < nOuter; i++) {
    const j = (i + 1) % nOuter;
    const tA = orderedTop[i];
    const tB = orderedTop[j];
    const bA = outerBot3D[i];
    const bB = outerBot3D[j];
    const len = tA.distanceTo(tB);
    const uv00 = new THREE.Vector2(0, 0);
    const uv10 = new THREE.Vector2(len, 0);
    const uv11 = new THREE.Vector2(len, thicknessM);
    const uv01 = new THREE.Vector2(0, thicknessM);

    const mid = new THREE.Vector3().addVectors(tA, tB).multiplyScalar(0.5);
    const outward = mid.sub(outerCentroid);
    const triN = new THREE.Vector3().subVectors(bA, tA).cross(new THREE.Vector3().subVectors(bB, tA));
    if (triN.dot(outward) >= 0) {
      pushTri(tA, bA, bB, uv01, uv00, uv10);
      pushTri(tA, bB, tB, uv01, uv10, uv11);
    } else {
      pushTri(tA, bB, bA, uv01, uv10, uv00);
      pushTri(tA, tB, bB, uv01, uv11, uv10);
    }
  }

  // Interior thickness reveal skirts lining every punched roof opening
  holesTop3D.forEach((hTop) => {
    const hn = hTop.length;
    const hBot = hTop.map((p) => p.clone().add(offsetVec));
    const hCentroid = hTop
      .reduce((acc, p) => acc.add(p), new THREE.Vector3())
      .divideScalar(hn);

    for (let i = 0; i < hn; i++) {
      const j = (i + 1) % hn;
      const tA = hTop[i];
      const tB = hTop[j];
      const bA = hBot[i];
      const bB = hBot[j];
      const len = tA.distanceTo(tB);
      const uv00 = new THREE.Vector2(0, 0);
      const uv10 = new THREE.Vector2(len, 0);
      const uv11 = new THREE.Vector2(len, thicknessM);
      const uv01 = new THREE.Vector2(0, thicknessM);

      // Reveal normal points inward toward opening centroid
      const mid = new THREE.Vector3().addVectors(tA, tB).multiplyScalar(0.5);
      const inward = hCentroid.clone().sub(mid);
      const triN = new THREE.Vector3().subVectors(bA, tA).cross(new THREE.Vector3().subVectors(bB, tA));
      if (triN.dot(inward) >= 0) {
        pushTri(tA, bA, bB, uv01, uv00, uv10);
        pushTri(tA, bB, tB, uv01, uv10, uv11);
      } else {
        pushTri(tA, bB, bA, uv01, uv10, uv00);
        pushTri(tA, tB, bB, uv01, uv11, uv10);
      }
    }
  });

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return { geometry: geom, holes2D: usedHoles2D };
}

/**
 * Builds a closed perimeter curb frame or low-profile flashing apron ring wrapping a 3D loop `pts3D`.
 */
function buildClosedLoopFrameGeometry(
  pts3D: THREE.Vector3[],
  upDir: THREE.Vector3,
  bottomOffset: number,
  topOffset: number,
  innerInsetM: number,
  outerOutsetM: number
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  const n = pts3D.length;
  if (n < 3) return geom;

  const centroid = pts3D
    .reduce((acc, p) => acc.add(p), new THREE.Vector3())
    .divideScalar(n);

  const ringOutTop: THREE.Vector3[] = [];
  const ringOutBot: THREE.Vector3[] = [];
  const ringInTop: THREE.Vector3[] = [];
  const ringInBot: THREE.Vector3[] = [];

  for (let i = 0; i < n; i++) {
    const p = pts3D[i];
    const radial = p.clone().sub(centroid);
    // Keep radial expansion/inset perpendicular to upDir (horizontal/slope tangent)
    radial.addScaledVector(upDir, -radial.dot(upDir));
    const rLen = radial.length() || 1;
    const radUnit = radial.divideScalar(rLen);

    const pOut = p.clone().addScaledVector(radUnit, outerOutsetM);
    const pIn = p.clone().addScaledVector(radUnit, -Math.min(innerInsetM, rLen * 0.45));

    ringOutTop.push(pOut.clone().addScaledVector(upDir, topOffset));
    ringOutBot.push(pOut.clone().addScaledVector(upDir, bottomOffset));
    ringInTop.push(pIn.clone().addScaledVector(upDir, topOffset));
    ringInBot.push(pIn.clone().addScaledVector(upDir, bottomOffset));
  }

  const positions: number[] = [];
  const pushOrientedQuad = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    expectedDir: THREE.Vector3
  ) => {
    const n1 = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n1.dot(expectedDir) >= 0) {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    } else {
      positions.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z);
      positions.push(a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z);
    }
  };

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mid = new THREE.Vector3().addVectors(pts3D[i], pts3D[j]).multiplyScalar(0.5);
    const outward = mid.clone().sub(centroid);
    outward.addScaledVector(upDir, -outward.dot(upDir));
    const inward = outward.clone().negate();

    // Outer face
    pushOrientedQuad(ringOutBot[i], ringOutBot[j], ringOutTop[j], ringOutTop[i], outward);
    // Inner face
    pushOrientedQuad(ringInBot[i], ringInBot[j], ringInTop[j], ringInTop[i], inward);
    // Top cap
    pushOrientedQuad(ringOutTop[i], ringOutTop[j], ringInTop[j], ringInTop[i], upDir);
    // Bottom soffit
    pushOrientedQuad(ringOutBot[i], ringOutBot[j], ringInBot[j], ringInBot[i], upDir.clone().negate());
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Build a thin architectural wall mesh extruded beneath variable topProfilePoints3D -> bottomProfile/bottomZ
 */
function buildExtrudedWallGeometry(
  wallFrom: Point2D,
  wallTo: Point2D,
  topProfile: { x: number; y: number; z: number }[],
  bottomZOrProfile: number | number[],
  bounds: Roof3DBounds,
  wallThickness = 0.14
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  if (topProfile.length < 2) return geom;

  const pStart = new THREE.Vector2(wallFrom.x, wallFrom.y);
  const pEnd = new THREE.Vector2(wallTo.x, wallTo.y);
  const dir = pEnd.clone().sub(pStart);
  const len = dir.length();
  if (len < 0.04) return geom;
  dir.divideScalar(len);

  const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(wallThickness * 0.5);
  const getBotZ = (i: number) =>
    Array.isArray(bottomZOrProfile) ? bottomZOrProfile[i] ?? bottomZOrProfile[0] : bottomZOrProfile;

  const frontTop = topProfile.map((pt) => toThreeVec(pt.x + perp.x, pt.y + perp.y, pt.z, bounds));
  const backTop = topProfile.map((pt) => toThreeVec(pt.x - perp.x, pt.y - perp.y, pt.z, bounds));
  const frontBot = topProfile.map((pt, i) =>
    toThreeVec(pt.x + perp.x, pt.y + perp.y, Math.min(pt.z - 0.01, getBotZ(i)), bounds)
  );
  const backBot = topProfile.map((pt, i) =>
    toThreeVec(pt.x - perp.x, pt.y - perp.y, Math.min(pt.z - 0.01, getBotZ(i)), bounds)
  );

  const positions: number[] = [];
  const uvs: number[] = [];

  const addQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, w: number, h: number) => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    uvs.push(0, 0, w, 0, w, h);
    positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    uvs.push(0, 0, w, h, 0, h);
  };

  for (let i = 0; i < topProfile.length - 1; i++) {
    const segW = Math.hypot(
      topProfile[i + 1].x - topProfile[i].x,
      topProfile[i + 1].y - topProfile[i].y
    );
    const h = Math.max(0.05, topProfile[i].z - getBotZ(i));
    addQuad(frontBot[i], frontBot[i + 1], frontTop[i + 1], frontTop[i], segW, h);
    addQuad(backBot[i + 1], backBot[i], backTop[i], backTop[i + 1], segW, h);
    addQuad(frontTop[i], frontTop[i + 1], backTop[i + 1], backTop[i], segW, wallThickness);
    addQuad(backBot[i], backBot[i + 1], frontBot[i + 1], frontBot[i], segW, wallThickness);
  }

  const last = topProfile.length - 1;
  addQuad(
    backBot[0],
    frontBot[0],
    frontTop[0],
    backTop[0],
    wallThickness,
    Math.max(0.05, topProfile[0].z - getBotZ(0))
  );
  addQuad(
    frontBot[last],
    backBot[last],
    backTop[last],
    frontTop[last],
    wallThickness,
    Math.max(0.05, topProfile[last].z - getBotZ(last))
  );

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Create a folded 3D sheet-metal flashing bar (inverted-V ridge/hip, recessed-V valley, quad gutter, or trim)
 */
function buildFlashingStripMesh(
  start: THREE.Vector3,
  end: THREE.Vector3,
  kind: 'ridge' | 'hip' | 'valley' | 'barge' | 'gutter' | 'apron',
  material: THREE.Material
): THREE.Mesh | null {
  const dir = new THREE.Vector3().subVectors(end, start);
  const len = dir.length();
  if (len < 0.08) return null;
  dir.divideScalar(len);

  let geom: THREE.BufferGeometry;
  if (kind === 'ridge' || kind === 'hip') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.12, -0.024);
    shape.lineTo(0, 0.046);
    shape.lineTo(0.12, -0.024);
    shape.lineTo(0.11, -0.036);
    shape.lineTo(0, 0.03);
    shape.lineTo(-0.11, -0.036);
    shape.closePath();
    geom = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, steps: 1 });
  } else if (kind === 'valley') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.14, 0.016);
    shape.lineTo(0, -0.035);
    shape.lineTo(0.14, 0.016);
    shape.lineTo(0.13, 0.026);
    shape.lineTo(0, -0.022);
    shape.lineTo(-0.13, 0.026);
    shape.closePath();
    geom = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, steps: 1 });
  } else if (kind === 'gutter') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.02, 0.0);
    shape.lineTo(0.085, 0.0);
    shape.lineTo(0.098, -0.075);
    shape.lineTo(0.0, -0.075);
    shape.closePath();
    geom = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, steps: 1 });
  } else {
    const shape = new THREE.Shape();
    shape.moveTo(-0.068, -0.055);
    shape.lineTo(0.058, -0.055);
    shape.lineTo(0.058, 0.035);
    shape.lineTo(-0.068, 0.035);
    shape.closePath();
    geom = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, steps: 1 });
  }

  const mesh = new THREE.Mesh(geom, material);
  mesh.position.copy(start);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const quat = new THREE.Quaternion().setFromUnitVectors(zAxis, dir);
  mesh.quaternion.copy(quat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function computeRoof3DBounds(
  allLevels: RoofLevel[],
  planes: RoofPlane[],
  wallPlan?: WallPlan | null
): Roof3DBounds {
  const pts = [
    ...allLevels.flatMap((l) => l.outline.points),
    ...(wallPlan?.points || [])
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 14;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 10;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const maxLevelH = Math.max(
    2.7,
    ...allLevels.map((l) => l.eaveHeightM),
    ...planes.map((p) => p.eaveHeightM ?? 2.7),
    ...(wallPlan?.facets || []).map((f) => f.topZ)
  );
  const maxZ = maxLevelH + 3.0;
  const midZ = maxZ * 0.42;
  const span = Math.max(maxX - minX, maxY - minY, maxZ * 1.15, 10);
  return { minX, maxX, minY, maxY, midX, midY, midZ, maxZ, span };
}

export function buildRoofSceneGroup(params: {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  planes: RoofPlane[];
  levels?: RoofLevel[];
  assets?: RoofAsset[];
  pitchBreaks?: PitchBreakLine[];
  wallPlan?: WallPlan | null;
  selectedPlaneId?: string | null;
  selectedWallFacetId?: string | null;
  wallFilterMode?: WallFilterMode;
  shadingMode: Roof3DShadingMode;
  swatch: ColorsteelSwatch;
  textures: ProceduralRoofTextureSet;
  wallTextures: WallCladdingTextureSet;
  showFlashings: boolean;
  showWalls: boolean;
  showSheetSeams: boolean;
  isSoftwareGl?: boolean;
}): BuiltRoofScene {
  const {
    outline,
    skeleton,
    planes,
    levels,
    assets = [],
    pitchBreaks = [],
    wallPlan,
    selectedPlaneId,
    selectedWallFacetId,
    wallFilterMode = 'all',
    shadingMode,
    swatch,
    textures,
    wallTextures,
    showFlashings,
    showWalls,
    showSheetSeams,
    isSoftwareGl = false
  } = params;

  const allLevels: RoofLevel[] =
    levels && levels.length > 0
      ? levels
      : [
          {
            id: outline.levelId || 'level-1',
            code: 'L1',
            name: 'Main Roof',
            eaveHeightM: 2.7,
            outline,
            skeleton
          }
        ];

  const bounds = computeRoof3DBounds(allLevels, planes, wallPlan);
  const effectivePlanes =
    assets.length === 0 && pitchBreaks.length === 0
      ? planes
      : resolveEffectivePlanesWithAssets(planes, assets, pitchBreaks);

  const structuralPlanes = effectivePlanes.filter((p) => !p.isVirtualAssetPlane);
  const rootGroup = new THREE.Group();
  const selectableMeshes: THREE.Mesh[] = [];
  const planeMeshById = new Map<string, THREE.Mesh[]>();
  const glazingMaterials: THREE.MeshPhysicalMaterial[] = [];

  const geometriesToDispose: THREE.BufferGeometry[] = [];
  const materialsToDispose: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometriesToDispose.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materialsToDispose.push(m);
    return m;
  };

  const isWireframe = shadingMode === 'wireframe';

  // Distinct flashing & trim PBR materials (matte/satin vs roof ribs, polygonOffset prevents z-fighting)
  const flashingMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color:
        shadingMode === 'studio_finish'
          ? new THREE.Color(swatch.hex).offsetHSL(0, 0, 0.04)
          : '#cbd5e1',
      metalness: 0.72,
      roughness: 0.28,
      envMapIntensity: 1.32,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      wireframe: isWireframe
    })
  );

  const valleyMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      metalness: 0.85,
      roughness: 0.24,
      envMapIntensity: 1.4,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      wireframe: isWireframe
    })
  );

  const gutterMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: shadingMode === 'studio_finish' ? swatch.hex : '#64748b',
      metalness: 0.54,
      roughness: 0.34,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      wireframe: isWireframe
    })
  );

  const wallMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#d8dee6',
      normalMap: wallTextures.weatherboard.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.84,
      metalness: 0.04,
      wireframe: isWireframe
    })
  );

  const abutmentWallMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      normalMap: wallTextures.fibre_cement.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.74,
      metalness: 0.1,
      wireframe: isWireframe
    })
  );

  const plinthMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#283244',
      roughness: 0.92,
      metalness: 0.06
    })
  );

  const skylightFrameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1e293b',
      metalness: 0.78,
      roughness: 0.26,
      wireframe: isWireframe
    })
  );

  const skylightGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#8fd5f7',
      metalness: 0.04,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      ior: 1.5,
      transmission: !isSoftwareGl && !isWireframe ? 0.34 : 0,
      thickness: 0.04,
      transparent: true,
      opacity: isWireframe ? 0.35 : isSoftwareGl ? 0.72 : 0.86,
      envMapIntensity: 1.7,
      wireframe: isWireframe
    })
  );
  glazingMaterials.push(skylightGlassMat);

  const wallGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#88d0f2',
      metalness: 0.06,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      ior: 1.5,
      transmission: !isSoftwareGl && !isWireframe ? 0.28 : 0,
      thickness: 0.03,
      transparent: true,
      opacity: isWireframe ? 0.35 : isSoftwareGl ? 0.72 : 0.85,
      envMapIntensity: 1.65,
      wireframe: isWireframe
    })
  );
  glazingMaterials.push(wallGlassMat);

  const chimneyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#5b463d',
      map: wallTextures.brick.map || null,
      normalMap: wallTextures.brick.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.84,
      metalness: 0.05,
      wireframe: isWireframe
    })
  );

  const seamLineMaterial = trackMat(
    new THREE.LineBasicMaterial({
      color: '#0f172a',
      transparent: true,
      opacity: 0.26
    })
  );

  const cadEdgeMaterial = trackMat(
    new THREE.LineBasicMaterial({
      color: shadingMode === 'wireframe' ? '#38bdf8' : '#cbd5e1',
      transparent: true,
      opacity: shadingMode === 'wireframe' ? 0.9 : 0.32
    })
  );

  // 1. Build Roof Sloped Cladding Slabs with TRUE Cut Openings (Skylights, Chimneys, Dormers)
  effectivePlanes.forEach((plane) => {
    if (plane.planPolygon.length < 3) return;
    const levelOutline = allLevels.find((l) => l.id === plane.levelId)?.outline || outline;
    const { eaveA, fallInward2D, uvEdgeU2D, uvRunDir2D } = resolvePlaneAxesAndFall(
      plane,
      levelOutline
    );

    const baseH = plane.eaveHeightM ?? 2.7;
    const pitchRad = ((plane.pitchDeg || 0) * Math.PI) / 180;
    const tanPitch = Math.tan(pitchRad);

    const topPts3D = plane.planPolygon.map((pt) => {
      const vDist = Math.max(0, (pt.x - eaveA.x) * fallInward2D.x + (pt.y - eaveA.y) * fallInward2D.y);
      return toThreeVec(pt.x, pt.y, baseH + vDist * tanPitch, bounds);
    });

    // Plane surface normal pointing UP (+Y positive)
    const eaveVec3D = new THREE.Vector3(-fallInward2D.y, 0, fallInward2D.x).normalize();
    const fallSlope3D = new THREE.Vector3(
      fallInward2D.x * Math.cos(pitchRad),
      Math.sin(pitchRad),
      fallInward2D.y * Math.cos(pitchRad)
    ).normalize();
    const planeNormal = new THREE.Vector3().crossVectors(fallSlope3D, eaveVec3D).normalize();
    if (planeNormal.y < 0) planeNormal.negate();

    // Project UV sheet run direction onto sloped 3D plane (respects plane.sheetRunEdgeId!)
    const ny = Math.max(0.08, planeNormal.y);
    const vSlope3D = new THREE.Vector3(
      uvRunDir2D.x,
      -(uvRunDir2D.x * planeNormal.x + uvRunDir2D.y * planeNormal.z) / ny,
      uvRunDir2D.y
    ).normalize();
    const uAxis3D = new THREE.Vector3().crossVectors(vSlope3D, planeNormal).normalize();
    if (uAxis3D.dot(new THREE.Vector3(uvEdgeU2D.x, 0, uvEdgeU2D.y)) < 0) {
      uAxis3D.negate();
    }

    // Collect true hole aperture polygons for skylights, chimneys, mono_dormers, gable_dormers
    const holePolys3D: THREE.Vector3[][] = [];
    const apertureEntries = (plane.apertures || []).filter(
      (app) => app.planPolygon && app.planPolygon.length >= 3
    );
    apertureEntries.forEach((app) => {
      const holePts3D = app.planPolygon.map((pt) => {
        const vDist = Math.max(0, (pt.x - eaveA.x) * fallInward2D.x + (pt.y - eaveA.y) * fallInward2D.y);
        return toThreeVec(pt.x, pt.y, baseH + vDist * tanPitch, bounds);
      });
      holePolys3D.push(holePts3D);
    });

    const { geometry: slabGeom, holes2D } = buildSlopedSlabGeometry(
      topPts3D,
      uAxis3D,
      vSlope3D,
      0.068,
      holePolys3D
    );
    trackGeo(slabGeom);

    const selectTargetId = plane.parentPlaneId || plane.id;
    const isSelected = Boolean(
      selectedPlaneId && (selectedPlaneId === plane.id || selectedPlaneId === selectTargetId)
    );

    const faceColor =
      shadingMode === 'facet_zones' ? plane.color || '#3b82f6' : swatch.hex;

    const slabMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(faceColor),
        metalness: shadingMode === 'studio_finish' ? swatch.metalness : 0.25,
        roughness: shadingMode === 'studio_finish' ? swatch.roughness : 0.52,
        normalMap: textures.normalMap,
        normalScale: new THREE.Vector2(0.88, 0.88),
        roughnessMap: textures.roughnessMap,
        bumpMap: textures.bumpMap,
        bumpScale: 0.022,
        envMapIntensity: shadingMode === 'studio_finish' ? 1.25 : 0.9,
        emissive: isSelected ? new THREE.Color('#0284c7') : new THREE.Color('#000000'),
        emissiveIntensity: isSelected ? 0.32 : 0,
        wireframe: isWireframe
      })
    );

    const slabMesh = new THREE.Mesh(slabGeom, slabMat);
    slabMesh.castShadow = true;
    slabMesh.receiveShadow = true;
    slabMesh.userData = {
      planeId: selectTargetId,
      baseEmissiveHex: isSelected ? '#0284c7' : '#000000',
      baseEmissiveIntensity: isSelected ? 0.32 : 0
    };
    rootGroup.add(slabMesh);
    selectableMeshes.push(slabMesh);

    const existingList = planeMeshById.get(selectTargetId) || [];
    existingList.push(slabMesh);
    planeMeshById.set(selectTargetId, existingList);

    // Subtle architectural edges highlight (selected highlight or wireframe edges)
    if (isSelected || isWireframe) {
      const edgesGeo = trackGeo(new THREE.EdgesGeometry(slabGeom, 24));
      const edgeLineMat = isSelected
        ? trackMat(new THREE.LineBasicMaterial({ color: '#38bdf8' }))
        : cadEdgeMaterial;
      rootGroup.add(new THREE.LineSegments(edgesGeo, edgeLineMat));
    }

    // Sheet seam lines (762mm sheet module joints) aligned to underlapSide & broken cleanly around holes
    if (showSheetSeams && !isWireframe) {
      const uOrigin = topPts3D[0];
      const poly2D = topPts3D.map((p) => {
        const rel = p.clone().sub(uOrigin);
        return { u: rel.dot(uAxis3D), v: rel.dot(vSlope3D) };
      });
      const minU = Math.min(...poly2D.map((p) => p.u));
      const maxU = Math.max(...poly2D.map((p) => p.u));
      const sheetW = 0.762;
      const seamPositions: number[] = [];

      const uLineCoords: number[] = [];
      if (plane.underlapSide === 'right') {
        for (let u = maxU - sheetW; u > minU + 0.12; u -= sheetW) uLineCoords.push(u);
      } else {
        for (let u = minU + sheetW; u < maxU - 0.12; u += sheetW) uLineCoords.push(u);
      }

      const toSlopePoint = (u: number, v: number) =>
        uOrigin
          .clone()
          .addScaledVector(uAxis3D, u)
          .addScaledVector(vSlope3D, v)
          .addScaledVector(planeNormal, 0.005);

      const holeUVRanges = holes2D.map((h) => ({
        poly: h,
        uMin: Math.min(...h.map((p) => p.x)),
        uMax: Math.max(...h.map((p) => p.x))
      }));

      uLineCoords.forEach((u) => {
        const vHits: number[] = [];
        for (let i = 0; i < poly2D.length; i++) {
          const j = (i + 1) % poly2D.length;
          const a = poly2D[i];
          const b = poly2D[j];
          if ((a.u <= u && b.u >= u) || (a.u >= u && b.u <= u)) {
            const denom = b.u - a.u;
            if (Math.abs(denom) > 1e-5) {
              const t = (u - a.u) / denom;
              if (t >= 0 && t <= 1) {
                vHits.push(a.v + t * (b.v - a.v));
              }
            }
          }
        }
        if (vHits.length < 2) return;
        vHits.sort((a, b) => a - b);

        // Intersect [vStart..vEnd] subtracting any hole intervals crossed by x = u
        let segments: [number, number][] = [[vHits[0], vHits[vHits.length - 1]]];
        holeUVRanges.forEach((hr) => {
          if (u < hr.uMin - 0.01 || u > hr.uMax + 0.01) return;
          const hHits: number[] = [];
          for (let i = 0; i < hr.poly.length; i++) {
            const a = hr.poly[i];
            const b = hr.poly[(i + 1) % hr.poly.length];
            if ((a.x <= u && b.x >= u) || (a.x >= u && b.x <= u)) {
              const denom = b.x - a.x;
              if (Math.abs(denom) > 1e-5) {
                const t = (u - a.x) / denom;
                if (t >= 0 && t <= 1) hHits.push(a.y + t * (b.y - a.y));
              }
            }
          }
          if (hHits.length >= 2) {
            hHits.sort((a, b) => a - b);
            const h0 = hHits[0];
            const h1 = hHits[hHits.length - 1];
            const nextSegs: [number, number][] = [];
            segments.forEach(([s0, s1]) => {
              if (h1 <= s0 || h0 >= s1) {
                nextSegs.push([s0, s1]);
              } else {
                if (h0 - s0 > 0.04) nextSegs.push([s0, h0]);
                if (s1 - h1 > 0.04) nextSegs.push([h1, s1]);
              }
            });
            segments = nextSegs;
          }
        });

        segments.forEach(([v0, v1]) => {
          const p0 = toSlopePoint(u, v0);
          const p1 = toSlopePoint(u, v1);
          seamPositions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        });
      });

      if (seamPositions.length >= 6) {
        const seamGeo = trackGeo(new THREE.BufferGeometry());
        seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamPositions, 3));
        rootGroup.add(new THREE.LineSegments(seamGeo, seamLineMaterial));
      }
    }

    // 1b. Skylights & Chimneys seated directly onto punched roof cutouts
    apertureEntries.forEach((app) => {
      const basePts3D = app.planPolygon.map((pt) => {
        const vDist = Math.max(0, (pt.x - eaveA.x) * fallInward2D.x + (pt.y - eaveA.y) * fallInward2D.y);
        return toThreeVec(pt.x, pt.y, baseH + vDist * tanPitch, bounds);
      });

      if (app.type === 'skylight') {
        // 1. Sloped Colorsteel Perimeter Flashing Apron Collar wrapping the cut edge
        const apronGeo = trackGeo(
          buildClosedLoopFrameGeometry(basePts3D, planeNormal, -0.015, 0.014, 0.025, 0.085)
        );
        const apronMesh = new THREE.Mesh(apronGeo, flashingMaterial);
        apronMesh.castShadow = true;
        apronMesh.receiveShadow = true;
        rootGroup.add(apronMesh);

        // 2. Anodized Aluminium Curb Upstand Box (passes into the cut opening cleanly up to +0.135m)
        const curbGeo = trackGeo(
          buildClosedLoopFrameGeometry(basePts3D, planeNormal, -0.05, 0.135, 0.055, 0.012)
        );
        const curbMesh = new THREE.Mesh(curbGeo, skylightFrameMat);
        curbMesh.castShadow = true;
        curbMesh.receiveShadow = true;
        curbMesh.userData = {
          planeId: selectTargetId,
          assetId: app.assetId,
          baseEmissiveHex: '#000000',
          baseEmissiveIntensity: 0
        };
        rootGroup.add(curbMesh);
        selectableMeshes.push(curbMesh);

        // 3. Upper Sash Rim Cap
        const sashGeo = trackGeo(
          buildClosedLoopFrameGeometry(basePts3D, planeNormal, 0.115, 0.148, 0.065, 0.036)
        );
        const sashMesh = new THREE.Mesh(sashGeo, skylightFrameMat);
        sashMesh.castShadow = true;
        rootGroup.add(sashMesh);

        // 4. Recessed Physical Skylight Glazing Pane (no metal backing underneath!)
        const glassCentroid = basePts3D
          .reduce((acc, p) => acc.add(p), new THREE.Vector3())
          .divideScalar(basePts3D.length);
        const insetGlassPts = basePts3D.map((p) =>
          p
            .clone()
            .lerp(glassCentroid, 0.04)
            .addScaledVector(planeNormal, 0.118)
        );
        const { geometry: glassGeom } = buildSlopedSlabGeometry(
          insetGlassPts,
          uAxis3D,
          vSlope3D,
          0.022
        );
        trackGeo(glassGeom);
        const glassMesh = new THREE.Mesh(glassGeom, skylightGlassMat);
        glassMesh.castShadow = false;
        glassMesh.receiveShadow = true;
        glassMesh.userData = {
          planeId: selectTargetId,
          assetId: app.assetId,
          baseEmissiveHex: '#000000',
          baseEmissiveIntensity: 0
        };
        rootGroup.add(glassMesh);
        selectableMeshes.push(glassMesh);

        // 5. Center Glazing Mullion Bar on wide skylights (>= 1.05m width)
        const appW = app.uMax - app.uMin;
        if (appW >= 1.05 && basePts3D.length === 4) {
          const midLow = new THREE.Vector3()
            .addVectors(basePts3D[0], basePts3D[1])
            .multiplyScalar(0.5)
            .addScaledVector(planeNormal, 0.13);
          const midHigh = new THREE.Vector3()
            .addVectors(basePts3D[2], basePts3D[3])
            .multiplyScalar(0.5)
            .addScaledVector(planeNormal, 0.13);
          const bar = buildFlashingStripMesh(midLow, midHigh, 'barge', skylightFrameMat);
          if (bar) {
            bar.scale.set(0.32, 0.45, 1);
            trackGeo(bar.geometry);
            rootGroup.add(bar);
          }
        }
      } else if (app.type === 'chimney') {
        const minX = Math.min(...app.planPolygon.map((p) => p.x));
        const maxX = Math.max(...app.planPolygon.map((p) => p.x));
        const minY = Math.min(...app.planPolygon.map((p) => p.y));
        const maxY = Math.max(...app.planPolygon.map((p) => p.y));
        const cxC = (minX + maxX) / 2;
        const cyC = (minY + maxY) / 2;
        const wC = Math.max(0.45, maxX - minX);
        const dC = Math.max(0.45, maxY - minY);
        const lowY = Math.min(...basePts3D.map((p) => p.y)) - 0.55;
        const highY = Math.max(...basePts3D.map((p) => p.y)) + 0.96;
        const heightC = Math.max(1.2, highY - lowY);

        const chimGeo = trackGeo(new THREE.BoxGeometry(wC, heightC, dC));
        const chimMesh = new THREE.Mesh(chimGeo, chimneyMat);
        chimMesh.position.copy(toThreeVec(cxC, cyC, lowY + heightC / 2, bounds));
        chimMesh.castShadow = true;
        chimMesh.receiveShadow = true;
        chimMesh.userData = {
          planeId: selectTargetId,
          assetId: app.assetId,
          baseEmissiveHex: '#000000',
          baseEmissiveIntensity: 0
        };
        rootGroup.add(chimMesh);
        selectableMeshes.push(chimMesh);

        // Sloped metal base flashing collar seated around chimney-to-roof penetration cut
        const chimApronGeo = trackGeo(
          buildClosedLoopFrameGeometry(basePts3D, planeNormal, -0.02, 0.085, 0.02, 0.095)
        );
        const chimApronMesh = new THREE.Mesh(chimApronGeo, flashingMaterial);
        chimApronMesh.castShadow = true;
        chimApronMesh.receiveShadow = true;
        rootGroup.add(chimApronMesh);

        // Chimney top flashing drip cap + storm flue cowl
        const capGeo = trackGeo(new THREE.BoxGeometry(wC + 0.14, 0.075, dC + 0.14));
        const capMesh = new THREE.Mesh(capGeo, flashingMaterial);
        capMesh.position.copy(toThreeVec(cxC, cyC, highY + 0.038, bounds));
        capMesh.castShadow = true;
        capMesh.receiveShadow = true;
        rootGroup.add(capMesh);

        const flueGeo = trackGeo(new THREE.CylinderGeometry(0.11, 0.11, 0.24, 16));
        const flueMesh = new THREE.Mesh(flueGeo, chimneyMat);
        flueMesh.position.copy(toThreeVec(cxC, cyC, highY + 0.18, bounds));
        flueMesh.castShadow = true;
        rootGroup.add(flueMesh);

        const cowlGeo = trackGeo(new THREE.ConeGeometry(0.19, 0.09, 16));
        const cowlMesh = new THREE.Mesh(cowlGeo, flashingMaterial);
        cowlMesh.position.copy(toThreeVec(cxC, cyC, highY + 0.34, bounds));
        cowlMesh.castShadow = true;
        rootGroup.add(cowlMesh);
      }
    });
  });

  // 2. Build 3D Folded Flashings (Ridges, Hips, Valleys, Barges, Aprons, Eave Gutters)
  if (showFlashings) {
    allLevels.forEach((lvl) => {
      const levelPlanes = structuralPlanes.filter((p) => (p.levelId || 'level-1') === lvl.id);
      const getPtZ = (pt: Point2D): number => {
        const hits = levelPlanes.filter(
          (pl) =>
            pl.planPolygon.length >= 3 &&
            (isPointInPolygon(pt, pl.planPolygon) ||
              pl.planPolygon.some((v) => Math.hypot(v.x - pt.x, v.y - pt.y) < 0.2))
        );
        if (hits.length > 0) {
          return Math.max(...hits.map((pl) => evalPlaneZ(pt, pl, lvl.outline)));
        }
        return lvl.eaveHeightM ?? 2.7;
      };

      lvl.skeleton.forEach((sk) => {
        const zA = getPtZ(sk.from);
        const zB = getPtZ(sk.to);
        const offset = sk.suggestedType === 'valley' ? -0.008 : 0.028;
        const pA = toThreeVec(sk.from.x, sk.from.y, zA + offset, bounds);
        const pB = toThreeVec(sk.to.x, sk.to.y, zB + offset, bounds);
        const mat = sk.suggestedType === 'valley' ? valleyMaterial : flashingMaterial;
        const strip = buildFlashingStripMesh(pA, pB, sk.suggestedType, mat);
        if (strip) {
          trackGeo(strip.geometry);
          rootGroup.add(strip);
        }
      });

      lvl.outline.edges.forEach((edge) => {
        const zA = getPtZ(edge.from);
        const zB = getPtZ(edge.to);
        if (edge.type === 'verge') {
          const pA = toThreeVec(edge.from.x, edge.from.y, zA + 0.01, bounds);
          const pB = toThreeVec(edge.to.x, edge.to.y, zB + 0.01, bounds);
          const barge = buildFlashingStripMesh(pA, pB, 'barge', flashingMaterial);
          if (barge) {
            trackGeo(barge.geometry);
            rootGroup.add(barge);
          }
        } else if (edge.type === 'wall') {
          const pA = toThreeVec(edge.from.x, edge.from.y, zA + 0.025, bounds);
          const pB = toThreeVec(edge.to.x, edge.to.y, zB + 0.025, bounds);
          const apron = buildFlashingStripMesh(pA, pB, 'apron', flashingMaterial);
          if (apron) {
            trackGeo(apron.geometry);
            rootGroup.add(apron);
          }
        } else if (edge.type === 'outline') {
          const pA = toThreeVec(edge.from.x, edge.from.y, zA - 0.012, bounds);
          const pB = toThreeVec(edge.to.x, edge.to.y, zB - 0.012, bounds);
          const gutter = buildFlashingStripMesh(pA, pB, 'gutter', gutterMaterial);
          if (gutter) {
            trackGeo(gutter.geometry);
            rootGroup.add(gutter);
          }
        }
      });
    });
  }

  // 3. Build Grounded Architectural Walls & Foundation Plinth (never piercing roof plane!)
  if (showWalls) {
    const hasWallPlanFacets = Boolean(wallPlan && wallPlan.facets && wallPlan.facets.length > 0);
    if (hasWallPlanFacets && wallPlan) {
      buildWallPlan3DGroup({
        wallPlan,
        bounds,
        selectedWallFacetId,
        wallFilterMode,
        shadingMode,
        wallTextures,
        glassMat: wallGlassMat,
        rootGroup,
        selectableMeshes,
        trackGeo,
        trackMat
      });
    }

    const linkedRoofEdgeIds = new Set(
      (wallPlan?.facets || [])
        .map((f) => f.roofEdgeId)
        .filter((id): id is string => Boolean(id))
    );

    const wallSegments = deriveRoofWallSegments(allLevels, structuralPlanes).filter((wall) => {
      if (!hasWallPlanFacets) return true;
      if (wall.wallKind === 'exterior_eave') return false;
      if (wall.wallKind === 'gable_end') {
        const linkedRaked = (wallPlan?.facets || []).find(
          (f) =>
            f.roofEdgeId === wall.edgeId &&
            f.heightSource === 'roof' &&
            f.roofProfile &&
            f.roofProfile.length >= 2
        );
        if (linkedRaked) return false;
      }
      if (linkedRoofEdgeIds.has(wall.edgeId) && wall.bottomZ < 0.2) return false;
      return true;
    });

    wallSegments.forEach((wall) => {
      if (wall.topZ <= wall.bottomZ + 0.04) return;
      const clampedTopProfile = wall.topProfilePoints3D.map((tp) => ({
        x: tp.x,
        y: tp.y,
        z: Math.max(wall.bottomZ + 0.02, tp.z - 0.045)
      }));
      const wallGeo = trackGeo(
        buildExtrudedWallGeometry(
          wall.wallFrom,
          wall.wallTo,
          clampedTopProfile,
          wall.bottomZ,
          bounds,
          0.16
        )
      );
      const isAbutment = wall.wallKind === 'abutment_wall';
      const wallMesh = new THREE.Mesh(
        wallGeo,
        isAbutment ? abutmentWallMaterial : wallMaterial
      );
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      rootGroup.add(wallMesh);
    });

    const baseLevel = allLevels[0];
    if (
      (!hasWallPlanFacets || (wallPlan?.points?.length || 0) < 3) &&
      baseLevel &&
      baseLevel.outline.points.length >= 3
    ) {
      const shapePts = baseLevel.outline.points.map(
        (pt) => new THREE.Vector2(pt.x - bounds.midX, pt.y - bounds.midY)
      );
      const shape = new THREE.Shape(shapePts);
      const padGeo = trackGeo(
        new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false })
      );
      padGeo.rotateX(Math.PI / 2);
      const padMesh = new THREE.Mesh(padGeo, plinthMaterial);
      padMesh.position.y = 0.07;
      padMesh.receiveShadow = true;
      rootGroup.add(padMesh);
    }
  }

  // 4. Render Gable & Mono Dormer Front Walls, Cheek Side Walls, Windows & Flashings
  assets
    .filter((a) => a.type === 'gable_dormer')
    .forEach((asset) => {
      const hostPlane =
        effectivePlanes.find(
          (p) =>
            !p.isVirtualAssetPlane &&
            (p.id === asset.planeId || p.parentPlaneId === asset.planeId) &&
            isPointInPolygon(asset.center, p.planPolygon)
        ) ||
        effectivePlanes.find(
          (p) => !p.isVirtualAssetPlane && (p.id === asset.planeId || p.parentPlaneId === asset.planeId)
        );
      if (!hostPlane) return;
      const geom = computeGableDormerGeometry(hostPlane, asset);
      if (!geom) return;

      const levelOutline = allLevels.find((l) => l.id === hostPlane.levelId)?.outline || outline;
      const zHostFront = evalPlaneZ(geom.pFL, hostPlane, levelOutline);
      const zHostCheekL = evalPlaneZ(geom.pCheekL, hostPlane, levelOutline);
      const zHostCheekR = evalPlaneZ(geom.pCheekR, hostPlane, levelOutline);

      // Dormer Front Wall
      const frontGeo = trackGeo(
        buildExtrudedWallGeometry(
          geom.pFL,
          geom.pFR,
          [
            { x: geom.pFL.x, y: geom.pFL.y, z: geom.sideEaveHeightM },
            { x: geom.pFMid.x, y: geom.pFMid.y, z: geom.ridgeHeightM },
            { x: geom.pFR.x, y: geom.pFR.y, z: geom.sideEaveHeightM }
          ],
          zHostFront,
          bounds,
          0.12
        )
      );
      const frontMesh = new THREE.Mesh(frontGeo, wallMaterial);
      frontMesh.castShadow = true;
      frontMesh.receiveShadow = true;
      rootGroup.add(frontMesh);

      // Left & Right Cheek Side Walls closing gable dormer down to host roof plane
      const cheekLGeo = trackGeo(
        buildExtrudedWallGeometry(
          geom.pFL,
          geom.pCheekL,
          [
            { x: geom.pFL.x, y: geom.pFL.y, z: geom.sideEaveHeightM - 0.03 },
            { x: geom.pCheekL.x, y: geom.pCheekL.y, z: geom.sideEaveHeightM - 0.03 }
          ],
          [zHostFront, zHostCheekL],
          bounds,
          0.11
        )
      );
      const cheekLMesh = new THREE.Mesh(cheekLGeo, wallMaterial);
      cheekLMesh.castShadow = true;
      cheekLMesh.receiveShadow = true;
      rootGroup.add(cheekLMesh);

      const cheekRGeo = trackGeo(
        buildExtrudedWallGeometry(
          geom.pFR,
          geom.pCheekR,
          [
            { x: geom.pFR.x, y: geom.pFR.y, z: geom.sideEaveHeightM - 0.03 },
            { x: geom.pCheekR.x, y: geom.pCheekR.y, z: geom.sideEaveHeightM - 0.03 }
          ],
          [zHostFront, zHostCheekR],
          bounds,
          0.11
        )
      );
      const cheekRMesh = new THREE.Mesh(cheekRGeo, wallMaterial);
      cheekRMesh.castShadow = true;
      cheekRMesh.receiveShadow = true;
      rootGroup.add(cheekRMesh);

      // Subtle glazed dormer front window pane
      const wallH = geom.sideEaveHeightM - zHostFront;
      const frontW = Math.hypot(geom.pFR.x - geom.pFL.x, geom.pFR.y - geom.pFL.y);
      if (frontW >= 0.8 && wallH >= 0.45) {
        const winW = frontW * 0.54;
        const winH = Math.min(wallH * 0.65, 0.95);
        const winMidZ = zHostFront + wallH * 0.52;
        const pMid = {
          x: (geom.pFL.x + geom.pFR.x) / 2,
          y: (geom.pFL.y + geom.pFR.y) / 2
        };
        const dirFront = {
          x: (geom.pFR.x - geom.pFL.x) / (frontW || 1),
          y: (geom.pFR.y - geom.pFL.y) / (frontW || 1)
        };
        const winRotY = Math.atan2(-dirFront.y, dirFront.x);
        const winPane = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(winW, winH, 0.145)),
          wallGlassMat
        );
        winPane.position.copy(toThreeVec(pMid.x, pMid.y, winMidZ, bounds));
        winPane.rotation.y = winRotY;
        rootGroup.add(winPane);
      }

      if (showFlashings) {
        const ridgeMesh = buildFlashingStripMesh(
          toThreeVec(geom.pFMid.x, geom.pFMid.y, geom.ridgeHeightM + 0.02, bounds),
          toThreeVec(geom.pRidgeTie.x, geom.pRidgeTie.y, geom.ridgeHeightM + 0.02, bounds),
          'ridge',
          flashingMaterial
        );
        if (ridgeMesh) {
          trackGeo(ridgeMesh.geometry);
          rootGroup.add(ridgeMesh);
        }
        const valL = buildFlashingStripMesh(
          toThreeVec(geom.pCheekL.x, geom.pCheekL.y, geom.sideEaveHeightM, bounds),
          toThreeVec(geom.pRidgeTie.x, geom.pRidgeTie.y, geom.ridgeHeightM, bounds),
          'valley',
          valleyMaterial
        );
        if (valL) {
          trackGeo(valL.geometry);
          rootGroup.add(valL);
        }
        const valR = buildFlashingStripMesh(
          toThreeVec(geom.pCheekR.x, geom.pCheekR.y, geom.sideEaveHeightM, bounds),
          toThreeVec(geom.pRidgeTie.x, geom.pRidgeTie.y, geom.ridgeHeightM, bounds),
          'valley',
          valleyMaterial
        );
        if (valR) {
          trackGeo(valR.geometry);
          rootGroup.add(valR);
        }
      }
    });

  // 5. Render Mono Dormer Front Wall & Side Cheek Walls beneath derived mono dormer planes
  effectivePlanes
    .filter((p) => p.isVirtualAssetPlane && p.parentAssetType === 'mono_dormer')
    .forEach((dormerPlane) => {
      if (dormerPlane.planPolygon.length < 4) return;
      const hostPlane = structuralPlanes.find((p) => p.id === dormerPlane.parentPlaneId);
      if (!hostPlane) return;
      const levelOutline = allLevels.find((l) => l.id === hostPlane.levelId)?.outline || outline;

      const [pFL, pFR, pBR, pBL] = dormerPlane.planPolygon;
      const zHostFL = evalPlaneZ(pFL, hostPlane, levelOutline);
      const zHostFR = evalPlaneZ(pFR, hostPlane, levelOutline);
      const zHostBR = evalPlaneZ(pBR, hostPlane, levelOutline);
      const zHostBL = evalPlaneZ(pBL, hostPlane, levelOutline);

      const zDormFL = evalPlaneZ(pFL, dormerPlane, levelOutline);
      const zDormFR = evalPlaneZ(pFR, dormerPlane, levelOutline);
      const zDormBR = evalPlaneZ(pBR, dormerPlane, levelOutline);
      const zDormBL = evalPlaneZ(pBL, dormerPlane, levelOutline);

      const frontWallGeo = trackGeo(
        buildExtrudedWallGeometry(
          pFL,
          pFR,
          [
            { x: pFL.x, y: pFL.y, z: zDormFL - 0.03 },
            { x: pFR.x, y: pFR.y, z: zDormFR - 0.03 }
          ],
          [zHostFL, zHostFR],
          bounds,
          0.12
        )
      );
      const frontMesh = new THREE.Mesh(frontWallGeo, wallMaterial);
      frontMesh.castShadow = true;
      frontMesh.receiveShadow = true;
      rootGroup.add(frontMesh);

      const cheekLGeo = trackGeo(
        buildExtrudedWallGeometry(
          pFL,
          pBL,
          [
            { x: pFL.x, y: pFL.y, z: zDormFL - 0.03 },
            { x: pBL.x, y: pBL.y, z: zDormBL - 0.03 }
          ],
          [zHostFL, zHostBL],
          bounds,
          0.11
        )
      );
      const cheekLMesh = new THREE.Mesh(cheekLGeo, wallMaterial);
      cheekLMesh.castShadow = true;
      cheekLMesh.receiveShadow = true;
      rootGroup.add(cheekLMesh);

      const cheekRGeo = trackGeo(
        buildExtrudedWallGeometry(
          pFR,
          pBR,
          [
            { x: pFR.x, y: pFR.y, z: zDormFR - 0.03 },
            { x: pBR.x, y: pBR.y, z: zDormBR - 0.03 }
          ],
          [zHostFR, zHostBR],
          bounds,
          0.11
        )
      );
      const cheekRMesh = new THREE.Mesh(cheekRGeo, wallMaterial);
      cheekRMesh.castShadow = true;
      cheekRMesh.receiveShadow = true;
      rootGroup.add(cheekRMesh);

      const frontW = Math.hypot(pFR.x - pFL.x, pFR.y - pFL.y);
      const frontH = zDormFL - zHostFL;
      if (frontW >= 0.8 && frontH >= 0.42) {
        const winW = frontW * 0.56;
        const winH = Math.min(frontH * 0.62, 0.85);
        const pMid = { x: (pFL.x + pFR.x) / 2, y: (pFL.y + pFR.y) / 2 };
        const dirFront = { x: (pFR.x - pFL.x) / (frontW || 1), y: (pFR.y - pFL.y) / (frontW || 1) };
        const winPane = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(winW, winH, 0.145)),
          wallGlassMat
        );
        winPane.position.copy(toThreeVec(pMid.x, pMid.y, zHostFL + frontH * 0.5, bounds));
        winPane.rotation.y = Math.atan2(-dirFront.y, dirFront.x);
        rootGroup.add(winPane);
      }

      if (showFlashings) {
        const apron = buildFlashingStripMesh(
          toThreeVec(pBL.x, pBL.y, zDormBL + 0.015, bounds),
          toThreeVec(pBR.x, pBR.y, zDormBR + 0.015, bounds),
          'apron',
          flashingMaterial
        );
        if (apron) {
          trackGeo(apron.geometry);
          rootGroup.add(apron);
        }
      }
    });

  return {
    rootGroup,
    selectableMeshes,
    planeMeshById,
    glazingMaterials,
    bounds,
    dispose: () => {
      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
    }
  };
}
