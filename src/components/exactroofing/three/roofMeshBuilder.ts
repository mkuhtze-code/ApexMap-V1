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
  Roof3DShadingMode
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
  bounds: Roof3DBounds;
  dispose: () => void;
}

/** Map 2D roof plan coords + Z-up elevation into Three.js right-handed (X, Y-up, Z) */
function toThreeVec(x: number, y: number, z: number, bounds: Roof3DBounds): THREE.Vector3 {
  return new THREE.Vector3(x - bounds.midX, z, y - bounds.midY);
}

/** Evaluate exact 3D elevation Z at plan point (x,y) on a given roof plane */
function evalPlaneZ(
  pt: Point2D,
  plane: RoofPlane,
  levelOutline: RoofOutline
): number {
  const eaveEdge = levelOutline.edges.find((e) => e.id === plane.eaveEdgeId);
  const pA =
    plane.parentPlaneId || plane.isVirtualAssetPlane
      ? plane.planPolygon[0]
      : eaveEdge?.from || plane.planPolygon[0];
  const pB =
    plane.parentPlaneId || plane.isVirtualAssetPlane
      ? plane.planPolygon[1] || pA
      : eaveEdge?.to || plane.planPolygon[1] || pA;

  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const len = Math.hypot(dx, dy) || 1;
  const uVec = { x: dx / len, y: dy / len };
  const vVec = { x: -uVec.y, y: uVec.x };

  const cx = plane.planPolygon.reduce((a, b) => a + b.x, 0) / plane.planPolygon.length;
  const cy = plane.planPolygon.reduce((a, b) => a + b.y, 0) / plane.planPolygon.length;
  const dot = (cx - pA.x) * vVec.x + (cy - pA.y) * vVec.y;
  const vInward = plane.runDirection || (dot >= 0 ? vVec : { x: -vVec.x, y: -vVec.y });

  const baseH = plane.eaveHeightM ?? 2.7;
  const tanPitch = Math.tan(((plane.pitchDeg || 0) * Math.PI) / 180);
  const vDist = Math.max(0, (pt.x - pA.x) * vInward.x + (pt.y - pA.y) * vInward.y);
  return baseH + vDist * tanPitch;
}

/**
 * Builds a solid watertight sloped slab geometry (top sheet face + underside soffit + fascia perimeter skirts)
 * with UVs aligned cleanly along the eave tangent (u) and slope run (v) so ribs/seams flow down-slope.
 */
function buildSlopedSlabGeometry(
  topPoints3D: THREE.Vector3[],
  uAxis: THREE.Vector3,
  vSlopeDir: THREE.Vector3,
  thicknessM = 0.065
): THREE.BufferGeometry {
  const n = topPoints3D.length;
  const geom = new THREE.BufferGeometry();
  if (n < 3) return geom;

  // Build local 2D projection on (uAxis, vSlopeDir) for clean triangulation
  const origin = topPoints3D[0];
  const pts2D: THREE.Vector2[] = topPoints3D.map((p) => {
    const rel = p.clone().sub(origin);
    return new THREE.Vector2(rel.dot(uAxis), rel.dot(vSlopeDir));
  });

  // Compute plane normal pointing upward (+Y positive)
  let normal = new THREE.Vector3().crossVectors(vSlopeDir, uAxis).normalize();
  if (normal.y < 0) normal.negate();
  // Wait: check winding of pts2D in 2D
  const area2D = THREE.ShapeUtils.area(pts2D);
  const orderedIndices = area2D >= 0 ? topPoints3D.map((_, i) => i) : topPoints3D.map((_, i) => i).reverse();
  const orderedTop = orderedIndices.map((idx) => topPoints3D[idx]);
  const ordered2D = orderedIndices.map((idx) => pts2D[idx]);

  const offsetVec = normal.clone().multiplyScalar(-thicknessM);
  const orderedBot = orderedTop.map((p) => p.clone().add(offsetVec));

  const triangles = THREE.ShapeUtils.triangulateShape(ordered2D, []);

  const positions: number[] = [];
  const uvs: number[] = [];

  const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ua: THREE.Vector2, ub: THREE.Vector2, uc: THREE.Vector2) => {
    // Ensure consistent outward triangle winding vs expected normal
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    uvs.push(ua.x, ua.y, ub.x, ub.y, uc.x, uc.y);
  };

  // Top face triangles (ensure normal points UP)
  triangles.forEach(([ia, ib, ic]) => {
    const a = orderedTop[ia];
    const b = orderedTop[ib];
    const c = orderedTop[ic];
    const triN = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (triN.dot(normal) >= 0) {
      pushTri(a, b, c, ordered2D[ia], ordered2D[ib], ordered2D[ic]);
    } else {
      pushTri(a, c, b, ordered2D[ia], ordered2D[ic], ordered2D[ib]);
    }
  });

  // Bottom soffit triangles (normal points DOWN)
  triangles.forEach(([ia, ib, ic]) => {
    const a = orderedBot[ia];
    const b = orderedBot[ib];
    const c = orderedBot[ic];
    const triN = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (triN.dot(normal) <= 0) {
      pushTri(a, b, c, ordered2D[ia], ordered2D[ib], ordered2D[ic]);
    } else {
      pushTri(a, c, b, ordered2D[ia], ordered2D[ic], ordered2D[ib]);
    }
  });

  // Perimeter fascia / barge edge skirts
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const tA = orderedTop[i];
    const tB = orderedTop[j];
    const bA = orderedBot[i];
    const bB = orderedBot[j];
    const len = tA.distanceTo(tB);
    const uv00 = new THREE.Vector2(0, 0);
    const uv10 = new THREE.Vector2(len, 0);
    const uv11 = new THREE.Vector2(len, thicknessM);
    const uv01 = new THREE.Vector2(0, thicknessM);

    // Outward side normal check: edge dir x downward = outward
    pushTri(tA, bA, bB, uv01, uv00, uv10);
    pushTri(tA, bB, tB, uv01, uv10, uv11);
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Build a thin architectural wall mesh extruded strictly beneath topProfilePoints3D -> bottomZ
 */
function buildExtrudedWallGeometry(
  wallFrom: Point2D,
  wallTo: Point2D,
  topProfile: { x: number; y: number; z: number }[],
  bottomZ: number,
  bounds: Roof3DBounds,
  wallThickness = 0.14
): THREE.BufferGeometry {
  const geom = new THREE.BufferGeometry();
  if (topProfile.length < 2) return geom;

  const pStart = new THREE.Vector2(wallFrom.x, wallFrom.y);
  const pEnd = new THREE.Vector2(wallTo.x, wallTo.y);
  const dir = pEnd.clone().sub(pStart);
  const len = dir.length();
  if (len < 0.05) return geom;
  dir.divideScalar(len);

  // Determine perpendicular inward/outward thickness vector
  const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(wallThickness * 0.5);

  const frontTop = topProfile.map((pt) => toThreeVec(pt.x + perp.x, pt.y + perp.y, pt.z, bounds));
  const backTop = topProfile.map((pt) => toThreeVec(pt.x - perp.x, pt.y - perp.y, pt.z, bounds));
  const frontBot = topProfile.map((pt) => toThreeVec(pt.x + perp.x, pt.y + perp.y, bottomZ, bounds));
  const backBot = topProfile.map((pt) => toThreeVec(pt.x - perp.x, pt.y - perp.y, bottomZ, bounds));

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
    const h = Math.max(0.1, topProfile[i].z - bottomZ);
    // Outer + Inner vertical faces
    addQuad(frontBot[i], frontBot[i + 1], frontTop[i + 1], frontTop[i], segW, h);
    addQuad(backBot[i + 1], backBot[i], backTop[i], backTop[i + 1], segW, h);
    // Top cap (tucked cleanly under soffit)
    addQuad(frontTop[i], frontTop[i + 1], backTop[i + 1], backTop[i], segW, wallThickness);
    // Bottom sole
    addQuad(backBot[i], backBot[i + 1], frontBot[i + 1], frontBot[i], segW, wallThickness);
  }

  // Left and Right end caps
  const last = topProfile.length - 1;
  addQuad(backBot[0], frontBot[0], frontTop[0], backTop[0], wallThickness, Math.max(0.1, topProfile[0].z - bottomZ));
  addQuad(frontBot[last], backBot[last], backTop[last], frontTop[last], wallThickness, Math.max(0.1, topProfile[last].z - bottomZ));

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Create a folded 3D sheet-metal flashing bar (inverted-V ridge/hip, recessed-V valley, or quad gutter)
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
    // Inverted-V ridge/hip cap (0.24m cover width)
    const shape = new THREE.Shape();
    shape.moveTo(-0.12, -0.025);
    shape.lineTo(0, 0.045);
    shape.lineTo(0.12, -0.025);
    shape.lineTo(0.11, -0.038);
    shape.lineTo(0, 0.028);
    shape.lineTo(-0.11, -0.038);
    shape.closePath();
    geom = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, steps: 1 });
  } else if (kind === 'valley') {
    // Recessed valley trough
    const shape = new THREE.Shape();
    shape.moveTo(-0.14, 0.015);
    shape.lineTo(0, -0.035);
    shape.lineTo(0.14, 0.015);
    shape.lineTo(0.13, 0.025);
    shape.lineTo(0, -0.022);
    shape.lineTo(-0.13, 0.025);
    shape.closePath();
    geom = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, steps: 1 });
  } else if (kind === 'gutter') {
    // Architectural quad gutter profile along eave
    const shape = new THREE.Shape();
    shape.moveTo(-0.02, 0.0);
    shape.lineTo(0.08, 0.0);
    shape.lineTo(0.095, -0.075);
    shape.lineTo(0.0, -0.075);
    shape.closePath();
    geom = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, steps: 1 });
  } else {
    // Barge or apron crisp folded trim
    const shape = new THREE.Shape();
    shape.moveTo(-0.07, -0.055);
    shape.lineTo(0.06, -0.055);
    shape.lineTo(0.06, 0.035);
    shape.lineTo(-0.07, 0.035);
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
  wallNormalMap: THREE.CanvasTexture;
  showFlashings: boolean;
  showWalls: boolean;
  showSheetSeams: boolean;
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
    wallNormalMap,
    showFlashings,
    showWalls,
    showSheetSeams
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

  // Shared materials
  const isWireframe = shadingMode === 'wireframe';

  const flashingMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: shadingMode === 'studio_finish' ? new THREE.Color(swatch.hex).offsetHSL(0, 0, 0.04) : '#cbd5e1',
      metalness: 0.72,
      roughness: 0.28,
      envMapIntensity: 1.35,
      wireframe: isWireframe
    })
  );

  const valleyMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      metalness: 0.85,
      roughness: 0.25,
      envMapIntensity: 1.4,
      wireframe: isWireframe
    })
  );

  const gutterMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: shadingMode === 'studio_finish' ? swatch.hex : '#64748b',
      metalness: 0.52,
      roughness: 0.36,
      wireframe: isWireframe
    })
  );

  const wallMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#d8dee6',
      normalMap: wallNormalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.84,
      metalness: 0.04,
      wireframe: isWireframe
    })
  );

  const abutmentWallMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      normalMap: wallNormalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.72,
      metalness: 0.12,
      wireframe: isWireframe
    })
  );

  const plinthMaterial = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.9,
      metalness: 0.08
    })
  );

  const skylightFrameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1e293b',
      metalness: 0.75,
      roughness: 0.28
    })
  );

  const skylightGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#7dd3fc',
      metalness: 0.05,
      roughness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.78,
      envMapIntensity: 1.8
    })
  );

  const chimneyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.78,
      metalness: 0.12
    })
  );

  const seamLineMaterial = trackMat(
    new THREE.LineBasicMaterial({
      color: '#0f172a',
      transparent: true,
      opacity: 0.28
    })
  );

  const cadEdgeMaterial = trackMat(
    new THREE.LineBasicMaterial({
      color: shadingMode === 'wireframe' ? '#38bdf8' : '#cbd5e1',
      transparent: true,
      opacity: shadingMode === 'wireframe' ? 0.9 : 0.32
    })
  );

  // 1. Build Roof Sloped Cladding Slabs & Apertures (Skylights, Chimneys)
  effectivePlanes.forEach((plane) => {
    if (plane.planPolygon.length < 3) return;
    const levelOutline = allLevels.find((l) => l.id === plane.levelId)?.outline || outline;
    const eaveEdge = levelOutline.edges.find((e) => e.id === plane.eaveEdgeId);
    const pA =
      plane.parentPlaneId || plane.isVirtualAssetPlane
        ? plane.planPolygon[0]
        : eaveEdge?.from || plane.planPolygon[0];
    const pB =
      plane.parentPlaneId || plane.isVirtualAssetPlane
        ? plane.planPolygon[1] || pA
        : eaveEdge?.to || plane.planPolygon[1] || pA;

    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const len = Math.hypot(dx, dy) || 1;
    const uVec2D = { x: dx / len, y: dy / len };
    const vVec2D = { x: -uVec2D.y, y: uVec2D.x };
    const cx = plane.planPolygon.reduce((a, b) => a + b.x, 0) / plane.planPolygon.length;
    const cy = plane.planPolygon.reduce((a, b) => a + b.y, 0) / plane.planPolygon.length;
    const dot = (cx - pA.x) * vVec2D.x + (cy - pA.y) * vVec2D.y;
    const vInward2D = plane.runDirection || (dot >= 0 ? vVec2D : { x: -vVec2D.x, y: -vVec2D.y });

    const baseH = plane.eaveHeightM ?? 2.7;
    const pitchRad = ((plane.pitchDeg || 0) * Math.PI) / 180;
    const tanPitch = Math.tan(pitchRad);

    const topPts3D = plane.planPolygon.map((pt) => {
      const vDist = Math.max(0, (pt.x - pA.x) * vInward2D.x + (pt.y - pA.y) * vInward2D.y);
      const z = baseH + vDist * tanPitch;
      return toThreeVec(pt.x, pt.y, z, bounds);
    });

    const uAxis3D = new THREE.Vector3(uVec2D.x, 0, uVec2D.y).normalize();
    const vSlope3D = new THREE.Vector3(
      vInward2D.x * Math.cos(pitchRad),
      Math.sin(pitchRad),
      vInward2D.y * Math.cos(pitchRad)
    ).normalize();

    const slabGeom = trackGeo(buildSlopedSlabGeometry(topPts3D, uAxis3D, vSlope3D, 0.068));

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
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughnessMap: textures.roughnessMap,
        bumpMap: textures.bumpMap,
        bumpScale: 0.02,
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
      const edgeSegs = new THREE.LineSegments(edgesGeo, edgeLineMat);
      rootGroup.add(edgeSegs);
    }

    // Optional sheet seam lines (762mm sheet module joints) across the plane
    if (showSheetSeams && !isWireframe) {
      const uOrigin = topPts3D[0];
      const uVals = topPts3D.map((p) => p.clone().sub(uOrigin).dot(uAxis3D));
      const minU = Math.min(...uVals);
      const maxU = Math.max(...uVals);
      const sheetW = 0.762;
      const seamPositions: number[] = [];

      for (let u = minU + sheetW; u < maxU - 0.15; u += sheetW) {
        // Clip line u = const against polygon vertices in (u, v) space
        const hits: THREE.Vector3[] = [];
        for (let i = 0; i < topPts3D.length; i++) {
          const j = (i + 1) % topPts3D.length;
          const ui = uVals[i];
          const uj = uVals[j];
          if ((ui <= u && uj >= u) || (ui >= u && uj <= u)) {
            const denom = uj - ui;
            if (Math.abs(denom) > 1e-5) {
              const t = (u - ui) / denom;
              if (t >= 0 && t <= 1) {
                const hit = new THREE.Vector3().lerpVectors(topPts3D[i], topPts3D[j], t);
                hit.y += 0.012;
                hits.push(hit);
              }
            }
          }
        }
        if (hits.length >= 2) {
          hits.sort((a, b) => a.dot(vSlope3D) - b.dot(vSlope3D));
          seamPositions.push(
            hits[0].x,
            hits[0].y,
            hits[0].z,
            hits[hits.length - 1].x,
            hits[hits.length - 1].y,
            hits[hits.length - 1].z
          );
        }
      }

      if (seamPositions.length >= 6) {
        const seamGeo = trackGeo(new THREE.BufferGeometry());
        seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamPositions, 3));
        rootGroup.add(new THREE.LineSegments(seamGeo, seamLineMaterial));
      }
    }

    // Skylights & Chimneys seated directly on the slope
    (plane.apertures || []).forEach((app) => {
      if (!app.planPolygon || app.planPolygon.length < 3) return;
      const basePts3D = app.planPolygon.map((pt) => {
        const vDist = Math.max(0, (pt.x - pA.x) * vInward2D.x + (pt.y - pA.y) * vInward2D.y);
        return toThreeVec(pt.x, pt.y, baseH + vDist * tanPitch, bounds);
      });

      if (app.type === 'skylight') {
        const curbTopPts = basePts3D.map((p) => p.clone().add(new THREE.Vector3(0, 0.14, 0)));
        const glassGeom = trackGeo(buildSlopedSlabGeometry(curbTopPts, uAxis3D, vSlope3D, 0.03));
        const glassMesh = new THREE.Mesh(glassGeom, skylightGlassMat);
        glassMesh.receiveShadow = true;
        rootGroup.add(glassMesh);

        // Aluminium curb skirt frame
        const curbMesh = new THREE.Mesh(
          trackGeo(buildExtrudedWallGeometry(
            app.planPolygon[0],
            app.planPolygon[1] || app.planPolygon[0],
            app.planPolygon.map((pt) => ({
              x: pt.x,
              y: pt.y,
              z: evalPlaneZ(pt, plane, levelOutline) + 0.14
            })),
            baseH,
            bounds,
            0.05
          )),
          skylightFrameMat
        );
        // Build perimeter edge strips neatly
        for (let k = 0; k < basePts3D.length; k++) {
          const k2 = (k + 1) % basePts3D.length;
          const bar = buildFlashingStripMesh(
            curbTopPts[k],
            curbTopPts[k2],
            'barge',
            skylightFrameMat
          );
          if (bar) rootGroup.add(bar);
        }
        curbMesh.geometry.dispose();
      } else if (app.type === 'chimney') {
        const minX = Math.min(...app.planPolygon.map((p) => p.x));
        const maxX = Math.max(...app.planPolygon.map((p) => p.x));
        const minY = Math.min(...app.planPolygon.map((p) => p.y));
        const maxY = Math.max(...app.planPolygon.map((p) => p.y));
        const cxC = (minX + maxX) / 2;
        const cyC = (minY + maxY) / 2;
        const wC = Math.max(0.45, maxX - minX);
        const dC = Math.max(0.45, maxY - minY);
        const lowZ = Math.min(...basePts3D.map((p) => p.y)) - 0.15;
        const highZ = Math.max(...basePts3D.map((p) => p.y)) + 0.95;
        const heightC = Math.max(0.9, highZ - lowZ);

        const chimGeo = trackGeo(new THREE.BoxGeometry(wC, heightC, dC));
        const chimMesh = new THREE.Mesh(chimGeo, chimneyMat);
        chimMesh.position.copy(toThreeVec(cxC, cyC, lowZ + heightC / 2, bounds));
        chimMesh.castShadow = true;
        chimMesh.receiveShadow = true;
        rootGroup.add(chimMesh);

        // Chimney top cowl cap
        const capGeo = trackGeo(new THREE.BoxGeometry(wC + 0.12, 0.08, dC + 0.12));
        const capMesh = new THREE.Mesh(capGeo, flashingMaterial);
        capMesh.position.copy(toThreeVec(cxC, cyC, highZ + 0.04, bounds));
        capMesh.castShadow = true;
        rootGroup.add(capMesh);
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

      // Skeleton lines (Ridges, Hips, Valleys)
      lvl.skeleton.forEach((sk) => {
        const zA = getPtZ(sk.from);
        const zB = getPtZ(sk.to);
        const offset = sk.suggestedType === 'valley' ? -0.01 : 0.028;
        const pA = toThreeVec(sk.from.x, sk.from.y, zA + offset, bounds);
        const pB = toThreeVec(sk.to.x, sk.to.y, zB + offset, bounds);
        const mat = sk.suggestedType === 'valley' ? valleyMaterial : flashingMaterial;
        const strip = buildFlashingStripMesh(pA, pB, sk.suggestedType, mat);
        if (strip) {
          trackGeo(strip.geometry);
          rootGroup.add(strip);
        }
      });

      // Perimeter Barges, Apron walls, and Eave Spouting/Gutters
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
          const pA = toThreeVec(edge.from.x, edge.from.y, zA - 0.01, bounds);
          const pB = toThreeVec(edge.to.x, edge.to.y, zB - 0.01, bounds);
          const gutter = buildFlashingStripMesh(pA, pB, 'gutter', gutterMaterial);
          if (gutter) {
            trackGeo(gutter.geometry);
            rootGroup.add(gutter);
          }
        }
      });
    });
  }

  // 3. Build Grounded Architectural Walls & Subtle Foundation Plinth (never piercing roof plane!)
  if (showWalls) {
    const hasWallPlanFacets = Boolean(wallPlan && wallPlan.facets && wallPlan.facets.length > 0);
    if (hasWallPlanFacets && wallPlan) {
      buildWallPlan3DGroup({
        wallPlan,
        bounds,
        selectedWallFacetId,
        wallFilterMode,
        shadingMode,
        wallNormalMap,
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
      // When detailed WallPlan facets exist, skip exterior single-storey strips & matched roofEdgeId
      // to avoid Z-fighting, while keeping gable triangle infills unless facet itself is roof-raked.
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
        z: Math.max(wall.bottomZ + 0.02, tp.z - 0.045) // tuck 45mm below top cladding surface so zero Z-fighting
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

    // Subtle concrete foundation slab under primary ground-level footprint
    const baseLevel = allLevels[0];
    if ((!hasWallPlanFacets || (wallPlan?.points?.length || 0) < 3) && baseLevel && baseLevel.outline.points.length >= 3) {
      const shapePts = baseLevel.outline.points.map(
        (pt) => new THREE.Vector2(pt.x - bounds.midX, pt.y - bounds.midY)
      );
      const shape = new THREE.Shape(shapePts);
      const padGeo = trackGeo(
        new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false })
      );
      // Shape is in XY, extrudes +Z -> rotate X +90deg maps X->X, Y->-Z or Y->Z
      padGeo.rotateX(Math.PI / 2);
      const padMesh = new THREE.Mesh(padGeo, plinthMaterial);
      padMesh.position.y = 0.07;
      padMesh.receiveShadow = true;
      rootGroup.add(padMesh);
    }
  }

  // 4. Render Gable Dormer Front Wall, Cheek Side Walls & Flashings
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

      const baseH = hostPlane.eaveHeightM ?? 2.7;
      const hostTan = Math.tan((geom.hostPitchDeg * Math.PI) / 180);
      const zHostFront = baseH + geom.vPlanMin * hostTan;

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

  return {
    rootGroup,
    selectableMeshes,
    planeMeshById,
    bounds,
    dispose: () => {
      geometriesToDispose.forEach((g) => g.dispose());
      materialsToDispose.forEach((m) => m.dispose());
    }
  };
}
