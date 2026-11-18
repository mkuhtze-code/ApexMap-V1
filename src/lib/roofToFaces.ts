import { FaceInput, Pt, hipRoofFaces } from './offcutEngine';
import { RoofFacet } from '../types/longrun';

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Plane3D {
  id: string;
  normal: Vector3D;
  vertices: Vector3D[]; // In 3D space (metres)
  fallDirection?: Vector3D; // For flat/near-flat planes
  allowedDirs?: ('LTR' | 'RTL')[];
}

const EPS = 1e-6;

function dot(a: Vector3D, b: Vector3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3D, b: Vector3D): Vector3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(v: Vector3D): Vector3D {
  const len = Math.sqrt(dot(v, v));
  if (len < EPS) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function sub(a: Vector3D, b: Vector3D): Vector3D {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Converts 3D roof planes into face-local 2D convex polygons (FaceInput[]):
 * - u is horizontal along the eave
 * - v is the true slope length running up the slope (with lowest eave edge at v = 0)
 */
export function plane3DToFaceInput(plane: Plane3D): FaceInput {
  const n = normalize(plane.normal);
  const Z: Vector3D = { x: 0, y: 0, z: 1 };

  // Check if plane is flat or near-flat
  const isNearFlat = Math.abs(n.z) > 0.999;

  let e: Vector3D;
  let d: Vector3D;

  if (isNearFlat && plane.fallDirection) {
    d = normalize(plane.fallDirection);
    e = normalize(cross(n, d));
  } else {
    // Horizontal in-plane axis: e = normalize(cross(Z, n))
    e = cross(Z, n);
    if (dot(e, e) < EPS) {
      e = { x: 1, y: 0, z: 0 };
    } else {
      e = normalize(e);
    }
    // Up-slope axis: d = cross(n, e), flipped if needed so d·Z > 0
    d = cross(n, e);
    if (d.z < 0) {
      d = { x: -d.x, y: -d.y, z: -d.z };
    }
  }

  const p0 = plane.vertices[0] || { x: 0, y: 0, z: 0 };
  const rawPts: Pt[] = plane.vertices.map((P) => {
    const delta = sub(P, p0);
    return {
      u: dot(delta, e),
      v: dot(delta, d)
    };
  });

  // Shift so minU = 0 and minV = 0 (eave sits on v = 0)
  const minU = Math.min(...rawPts.map((p) => p.u));
  const minV = Math.min(...rawPts.map((p) => p.v));

  const polygon = rawPts.map((p) => ({
    u: Math.round((p.u - minU) * 1000) / 1000,
    v: Math.round((p.v - minV) * 1000) / 1000
  }));

  return {
    id: plane.id,
    polygon,
    allowedDirs: plane.allowedDirs
  };
}

/**
 * Converts L-shaped roof model from ApexMap / CAD into convex FaceInput[]
 * Splits non-convex L-sections into natural structural convex roof facets
 */
export function buildLShapedRoofFaces(
  leftWingWidthM = 6.27,
  leftWingLengthM = 14.2,
  mainWingLengthM = 21.2,
  mainWingWidthM = 6.27,
  slopeLengthM = 6.0
): FaceInput[] {
  // L-shaped roof is composed of 6 convex facets:
  // 1. Left West Hip Rake / Gable Face
  // 2. Left East Upper Hip / Gable Face
  // 3. Valley West Slope (convex trapezoid meeting valley)
  // 4. Valley North Slope (convex trapezoid meeting valley)
  // 5. Main North Slope
  // 6. Main South Slope
  // 7. East Hip End (triangle)
  // 8. Top Hip End (triangle)

  const s = slopeLengthM;
  const leftEave = leftWingLengthM;
  const mainEave = mainWingLengthM;

  return [
    {
      id: 'West-Pitch',
      polygon: [
        { u: 0, v: 0 },
        { u: leftEave, v: 0 },
        { u: leftEave - 3.5, v: s },
        { u: 3.5, v: s }
      ]
    },
    {
      id: 'Valley-West',
      polygon: [
        { u: 0, v: 0 },
        { u: 6.0, v: 0 },
        { u: 6.0, v: s },
        { u: 2.0, v: s }
      ]
    },
    {
      id: 'Valley-North',
      polygon: [
        { u: 0, v: 0 },
        { u: 6.0, v: 0 },
        { u: 6.0, v: s },
        { u: 0, v: s * 0.4 }
      ]
    },
    {
      id: 'Main-North',
      polygon: [
        { u: 0, v: 0 },
        { u: mainEave * 0.6, v: 0 },
        { u: mainEave * 0.6 - 3.0, v: s },
        { u: 0, v: s }
      ]
    },
    {
      id: 'Main-South',
      polygon: [
        { u: 0, v: 0 },
        { u: mainEave, v: 0 },
        { u: mainEave - 3.5, v: s },
        { u: 3.5, v: s }
      ]
    },
    {
      id: 'East-Hip-End',
      polygon: [
        { u: 0, v: 0 },
        { u: mainWingWidthM, v: 0 },
        { u: mainWingWidthM / 2, v: s }
      ]
    },
    {
      id: 'Top-Hip-End',
      polygon: [
        { u: 0, v: 0 },
        { u: leftWingWidthM, v: 0 },
        { u: leftWingWidthM / 2, v: s }
      ]
    }
  ];
}

/**
 * Converts generic CRM RoofFacet[] into FaceInput[] for the offcut engine
 */
export function roofFacetsToFaceInputs(facets: RoofFacet[]): FaceInput[] {
  if (!facets || facets.length === 0) {
    return hipRoofFaces(14, 10, 6);
  }

  return facets.map((f, idx) => {
    const eaveM = (f.eaveWidthMm || 10000) / 1000;
    const slopeM = (f.slopeLengthMm || 6000) / 1000;

    let polygon: Pt[];
    if (f.facetType === 'hip_rake') {
      // Trapezoid with one or both sides raked
      polygon = [
        { u: 0, v: 0 },
        { u: eaveM, v: 0 },
        { u: Math.max(eaveM * 0.2, eaveM - slopeM * 0.5), v: slopeM },
        { u: Math.min(eaveM * 0.8, slopeM * 0.5), v: slopeM }
      ];
    } else if (f.facetType === 'valley_junction') {
      polygon = [
        { u: 0, v: 0 },
        { u: eaveM, v: 0 },
        { u: eaveM, v: slopeM },
        { u: eaveM * 0.35, v: slopeM }
      ];
    } else {
      // Gable or monopitch (rectangle)
      polygon = [
        { u: 0, v: 0 },
        { u: eaveM, v: 0 },
        { u: eaveM, v: slopeM },
        { u: 0, v: slopeM }
      ];
    }

    return {
      id: f.name || `Face-${idx + 1}`,
      polygon
    };
  });
}
