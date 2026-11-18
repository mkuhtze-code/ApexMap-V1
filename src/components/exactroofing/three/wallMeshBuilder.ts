import * as THREE from 'three';
import {
  WallCladdingType,
  WallFacet,
  WallOpening,
  WallPlan
} from '../../../types/exactRoofing';
import {
  clampWallOpeningToFacet,
  getWallCladdingMeta
} from '../../../utils/wallCladdingEngine';
import { Roof3DShadingMode } from './roofMaterials';
import { Roof3DBounds } from './roofMeshBuilder';

interface SanitizedOpening {
  raw: WallOpening;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  isThreshold: boolean;
}

/**
 * Produces non-overlapping, manifold-safe opening rectangles clamped cleanly
 * inside the exterior wall pier boundaries so ExtrudeGeometry never self-intersects.
 */
function sanitizeOpeningsForExtrusion(facet: WallFacet): SanitizedOpening[] {
  const L = facet.lengthM;
  const H = facet.heightM;
  if (L < 0.25 || H < 0.25) return [];

  const minCornerJamb = Math.min(0.04, L * 0.05);
  const minHeadJamb = Math.min(0.04, H * 0.05);

  const clamped = facet.openings
    .map((raw) => {
      const c = clampWallOpeningToFacet(facet, raw);
      const u0 = Math.max(minCornerJamb, c.distFromStartM);
      const u1 = Math.min(L - minCornerJamb, c.distFromStartM + c.widthM);
      const isThreshold = c.sillHeightM <= 0.035;
      const v0 = isThreshold ? 0 : Math.max(0.04, c.sillHeightM);
      const v1 = Math.min(H - minHeadJamb, c.sillHeightM + c.heightM);
      return { raw: c, u0, u1, v0, v1, isThreshold };
    })
    .filter((o) => o.u1 - o.u0 >= 0.14 && o.v1 - o.v0 >= 0.14)
    .sort((a, b) => a.u0 - b.u0);

  // Prevent horizontal or 2D overlap between extruded holes/notches
  const accepted: SanitizedOpening[] = [];
  for (const cand of clamped) {
    const overlapsExisting = accepted.some((prev) => {
      const uOverlap = Math.min(cand.u1, prev.u1) - Math.max(cand.u0, prev.u0) > -0.025;
      const vOverlap = Math.min(cand.v1, prev.v1) - Math.max(cand.v0, prev.v0) > -0.025;
      return uOverlap && vOverlap;
    });
    if (!overlapsExisting) {
      accepted.push(cand);
    }
  }

  return accepted;
}

function getCladdingVisualProps(
  claddingType: WallCladdingType,
  shadingMode: Roof3DShadingMode,
  wallNormalMap: THREE.CanvasTexture
): {
  color: string;
  roughness: number;
  metalness: number;
  useNormal: boolean;
  normalScale: number;
} {
  const meta = getWallCladdingMeta(claddingType);
  if (shadingMode === 'wireframe') {
    return {
      color: '#38bdf8',
      roughness: 0.6,
      metalness: 0.2,
      useNormal: false,
      normalScale: 0
    };
  }
  if (shadingMode === 'facet_zones') {
    const facetTint: Record<WallCladdingType, string> = {
      profiled_metal: '#3b82f6',
      weatherboard: '#10b981',
      brick: '#ea580c',
      plaster: '#eab308',
      fibre_cement: '#8b5cf6',
      other: '#ec4899',
      none: '#475569'
    };
    return {
      color: facetTint[claddingType] || meta.hex,
      roughness: 0.58,
      metalness: 0.12,
      useNormal: true,
      normalScale: 0.35
    };
  }
  return {
    color: meta.hex,
    roughness: meta.roughness,
    metalness: meta.metalness,
    useNormal:
      claddingType === 'weatherboard' ||
      claddingType === 'profiled_metal' ||
      claddingType === 'fibre_cement' ||
      claddingType === 'brick',
    normalScale: claddingType === 'weatherboard' || claddingType === 'profiled_metal' ? 0.55 : 0.22
  };
}

export function buildWallPlan3DGroup(params: {
  wallPlan: WallPlan;
  bounds: Roof3DBounds;
  selectedWallFacetId?: string | null;
  shadingMode: Roof3DShadingMode;
  wallNormalMap: THREE.CanvasTexture;
  rootGroup: THREE.Group;
  selectableMeshes: THREE.Mesh[];
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  trackMat: <T extends THREE.Material>(m: T) => T;
}): void {
  const {
    wallPlan,
    bounds,
    selectedWallFacetId,
    shadingMode,
    wallNormalMap,
    rootGroup,
    selectableMeshes,
    trackGeo,
    trackMat
  } = params;

  if (!wallPlan || !wallPlan.facets || wallPlan.facets.length === 0) return;

  const isWireframe = shadingMode === 'wireframe';
  const wallThickness = 0.14;

  // Shared opening frame / glazing / door materials
  const frameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1e293b',
      metalness: 0.55,
      roughness: 0.35,
      wireframe: isWireframe
    })
  );

  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: '#7dd3fc',
      metalness: 0.08,
      roughness: 0.08,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: isWireframe ? 0.35 : 0.72,
      envMapIntensity: 1.7,
      wireframe: isWireframe
    })
  );

  const doorLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.55,
      metalness: 0.22,
      wireframe: isWireframe
    })
  );

  const garageLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#64748b',
      normalMap: wallNormalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.42,
      metalness: 0.45,
      wireframe: isWireframe
    })
  );

  wallPlan.facets.forEach((facet) => {
    const dx = facet.to.x - facet.from.x;
    const dy = facet.to.y - facet.from.y;
    const L = Math.hypot(dx, dy);
    const H = facet.heightM;
    if (L < 0.05 || H < 0.1) return;

    const dirX = dx / L;
    const dirY = dy / L;
    const rotY = Math.atan2(-dirY, dirX);

    const facetGroup = new THREE.Group();
    facetGroup.position.set(
      facet.from.x - bounds.midX,
      facet.bottomZ,
      facet.from.y - bounds.midY
    );
    facetGroup.rotation.y = rotY;

    const sanitizedOpenings = sanitizeOpeningsForExtrusion(facet);
    const thresholdNotches = sanitizedOpenings.filter((o) => o.isThreshold);
    const holeOpenings = sanitizedOpenings.filter((o) => !o.isThreshold);

    // Outer wall silhouette in local (u: 0..L, v: 0..H) with clean door/garage threshold notches
    const wallShape = new THREE.Shape();
    wallShape.moveTo(0, 0);
    thresholdNotches.forEach((notch) => {
      wallShape.lineTo(notch.u0, 0);
      wallShape.lineTo(notch.u0, notch.v1);
      wallShape.lineTo(notch.u1, notch.v1);
      wallShape.lineTo(notch.u1, 0);
    });
    wallShape.lineTo(L, 0);
    wallShape.lineTo(L, H);
    wallShape.lineTo(0, H);
    wallShape.closePath();

    // Interior elevated openings (windows & voids) as clockwise holes
    holeOpenings.forEach((op) => {
      const hole = new THREE.Path();
      hole.moveTo(op.u0, op.v0);
      hole.lineTo(op.u0, op.v1);
      hole.lineTo(op.u1, op.v1);
      hole.lineTo(op.u1, op.v0);
      hole.closePath();
      wallShape.holes.push(hole);
    });

    const wallGeo = trackGeo(
      new THREE.ExtrudeGeometry(wallShape, {
        depth: wallThickness,
        bevelEnabled: false,
        steps: 1
      })
    );
    wallGeo.translate(0, 0, -wallThickness / 2);

    const vis = getCladdingVisualProps(facet.claddingType, shadingMode, wallNormalMap);
    const isSelected = Boolean(selectedWallFacetId && selectedWallFacetId === facet.id);
    const baseEmissiveHex = isSelected ? '#0284c7' : '#000000';
    const baseEmissiveIntensity = isSelected ? 0.34 : 0;

    const wallMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(vis.color),
        roughness: vis.roughness,
        metalness: vis.metalness,
        normalMap: vis.useNormal ? wallNormalMap : null,
        normalScale: new THREE.Vector2(vis.normalScale, vis.normalScale),
        emissive: new THREE.Color(baseEmissiveHex),
        emissiveIntensity: baseEmissiveIntensity,
        wireframe: isWireframe
      })
    );

    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    wallMesh.userData = {
      wallFacetId: facet.id,
      baseEmissiveHex,
      baseEmissiveIntensity
    };
    facetGroup.add(wallMesh);
    selectableMeshes.push(wallMesh);

    if (isSelected || isWireframe) {
      const edgesGeo = trackGeo(new THREE.EdgesGeometry(wallGeo, 25));
      const edgeMat = trackMat(
        new THREE.LineBasicMaterial({
          color: isSelected ? '#38bdf8' : '#7dd3fc',
          transparent: true,
          opacity: isSelected ? 0.95 : 0.45
        })
      );
      facetGroup.add(new THREE.LineSegments(edgesGeo, edgeMat));
    }

    // Crisp Opening Trim Frames, Window Glazing & Recessed Door/Garage Leaves
    sanitizedOpenings.forEach((op) => {
      const w = op.u1 - op.u0;
      const h = op.v1 - op.v0;
      const uMid = (op.u0 + op.u1) / 2;
      const vMid = (op.v0 + op.v1) / 2;
      const jambW = 0.045;
      const frameDepth = wallThickness + 0.03;

      // Head & Jamb frames
      const headMesh = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(w, jambW, frameDepth)),
        frameMat
      );
      headMesh.position.set(uMid, op.v1 - jambW / 2, 0);
      facetGroup.add(headMesh);

      const leftJamb = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(jambW, h, frameDepth)),
        frameMat
      );
      leftJamb.position.set(op.u0 + jambW / 2, vMid, 0);
      facetGroup.add(leftJamb);

      const rightJamb = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(jambW, h, frameDepth)),
        frameMat
      );
      rightJamb.position.set(op.u1 - jambW / 2, vMid, 0);
      facetGroup.add(rightJamb);

      if (!op.isThreshold) {
        const sillMesh = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(w + 0.04, jambW * 1.15, frameDepth + 0.025)),
          frameMat
        );
        sillMesh.position.set(uMid, op.v0 + jambW / 2, 0);
        facetGroup.add(sillMesh);
      }

      if (op.raw.type === 'window') {
        const innerW = Math.max(0.08, w - jambW * 1.6);
        const innerH = Math.max(0.08, h - jambW * 1.6);
        const glassMesh = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(innerW, innerH, 0.018)),
          glassMat
        );
        glassMesh.position.set(uMid, vMid, 0);
        facetGroup.add(glassMesh);
      } else if (op.raw.type === 'door') {
        const innerW = Math.max(0.08, w - jambW * 1.8);
        const innerH = Math.max(0.1, h - jambW);
        const doorMesh = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(innerW, innerH, 0.048)),
          doorLeafMat
        );
        doorMesh.position.set(uMid, op.v0 + innerH / 2, 0);
        doorMesh.castShadow = true;
        facetGroup.add(doorMesh);
      } else if (op.raw.type === 'garage') {
        const innerW = Math.max(0.1, w - jambW * 1.8);
        const innerH = Math.max(0.1, h - jambW);
        const garageMesh = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(innerW, innerH, 0.055)),
          garageLeafMat
        );
        garageMesh.position.set(uMid, op.v0 + innerH / 2, 0);
        garageMesh.castShadow = true;
        facetGroup.add(garageMesh);
      }
    });

    rootGroup.add(facetGroup);
  });

  // Grounded concrete floor slab plinth matching WallPlan footprint
  if (wallPlan.points.length >= 3) {
    const shapePts = wallPlan.points.map(
      (pt) => new THREE.Vector2(pt.x - bounds.midX, pt.y - bounds.midY)
    );
    const floorShape = new THREE.Shape(shapePts);
    const padGeo = trackGeo(
      new THREE.ExtrudeGeometry(floorShape, { depth: 0.12, bevelEnabled: false })
    );
    padGeo.rotateX(Math.PI / 2);
    const padMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.92,
        metalness: 0.06,
        wireframe: isWireframe
      })
    );
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.y = 0.06;
    padMesh.receiveShadow = true;
    rootGroup.add(padMesh);
  }
}
