import * as THREE from 'three';
import {
  WallCladdingType,
  WallFacet,
  WallFilterMode,
  WallOpening,
  WallPlan
} from '../../../types/exactRoofing';
import {
  clampWallOpeningToFacet,
  clampWallRegionToFacet,
  computeWallTakeoffSummary,
  getWallCladdingMeta,
  isWallFacetUndetailed
} from '../../../utils/wallCladdingEngine';
import {
  Roof3DShadingMode,
  WallCladdingTextureSet
} from './roofMaterials';
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
  const maxProfileH =
    facet.roofProfile && facet.roofProfile.length > 0
      ? Math.max(facet.heightM, ...facet.roofProfile.map((p) => p.topZ - facet.bottomZ))
      : facet.heightM;
  const H = facet.heightM;
  if (L < 0.25 || maxProfileH < 0.25) return [];

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

/**
 * Builds one or more manifold-safe THREE.Shape polygons for rectangular cladding region
 * [u0..u1] x [v0..v1] (or optional sloped top profile when fullHeight & fullSpan).
 */
function buildWallRegionShapes(params: {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  openings: SanitizedOpening[];
  roofProfilePts?: { u: number; v: number }[];
}): THREE.Shape[] {
  const { u0, u1, v0, v1, openings, roofProfilePts } = params;
  if (u1 - u0 < 0.06 || v1 - v0 < 0.06) return [];

  const eps = 0.02;
  const overlapping = openings.filter(
    (op) => op.u1 > u0 + eps && op.u0 < u1 - eps && op.v1 > v0 + eps && op.v0 < v1 - eps
  );

  // Split horizontally around any opening that completely cuts through [v0..v1]
  const fullCutters = overlapping
    .filter((op) => op.v0 <= v0 + eps && op.v1 >= v1 - eps)
    .sort((a, b) => a.u0 - b.u0);

  const subSpans: [number, number][] = [];
  let cursorU = u0;
  fullCutters.forEach((op) => {
    const cutStart = Math.max(u0, op.u0);
    const cutEnd = Math.min(u1, op.u1);
    if (cutStart - cursorU >= 0.06) {
      subSpans.push([cursorU, cutStart]);
    }
    cursorU = Math.max(cursorU, cutEnd);
  });
  if (u1 - cursorU >= 0.06) {
    subSpans.push([cursorU, u1]);
  }

  const shapes: THREE.Shape[] = [];
  subSpans.forEach(([su0, su1]) => {
    const spanOps = overlapping.filter((op) => op.u1 > su0 + eps && op.u0 < su1 - eps);
    const bottomNotches = spanOps
      .filter((op) => op.v0 <= v0 + eps && op.v1 < v1 - eps)
      .sort((a, b) => a.u0 - b.u0);
    const topNotches = spanOps
      .filter((op) => op.v0 > v0 + eps && op.v1 >= v1 - eps && !roofProfilePts)
      .sort((a, b) => b.u0 - a.u0); // reversed right-to-left along top edge
    const interiorHoles = spanOps.filter(
      (op) => op.v0 > v0 + eps && op.v1 < v1 - eps
    );

    const shape = new THREE.Shape();
    shape.moveTo(su0, v0);
    bottomNotches.forEach((op) => {
      const nu0 = Math.max(su0 + 0.015, op.u0);
      const nu1 = Math.min(su1 - 0.015, op.u1);
      if (nu1 - nu0 < 0.05) return;
      shape.lineTo(nu0, v0);
      shape.lineTo(nu0, op.v1);
      shape.lineTo(nu1, op.v1);
      shape.lineTo(nu1, v0);
    });
    shape.lineTo(su1, v0);

    if (roofProfilePts && roofProfilePts.length >= 2) {
      const clippedTop = roofProfilePts
        .filter((p) => p.u >= su0 - 0.02 && p.u <= su1 + 0.02)
        .map((p) => ({
          u: Math.max(su0, Math.min(su1, p.u)),
          v: Math.max(v0 + 0.15, p.v)
        }))
        .sort((a, b) => b.u - a.u);

      const firstRightV =
        clippedTop[0]?.v ??
        Math.max(v0 + 0.15, roofProfilePts[roofProfilePts.length - 1].v);
      shape.lineTo(su1, firstRightV);
      clippedTop.forEach((pt) => {
        shape.lineTo(pt.u, pt.v);
      });
      const lastLeftV =
        clippedTop[clippedTop.length - 1]?.v ?? Math.max(v0 + 0.15, roofProfilePts[0].v);
      shape.lineTo(su0, lastLeftV);
    } else {
      shape.lineTo(su1, v1);
      topNotches.forEach((op) => {
        const nu0 = Math.max(su0 + 0.015, op.u0);
        const nu1 = Math.min(su1 - 0.015, op.u1);
        if (nu1 - nu0 < 0.05) return;
        shape.lineTo(nu1, v1);
        shape.lineTo(nu1, op.v0);
        shape.lineTo(nu0, op.v0);
        shape.lineTo(nu0, v1);
      });
      shape.lineTo(su0, v1);
    }
    shape.closePath();

    interiorHoles.forEach((op) => {
      const hu0 = Math.max(su0 + 0.02, op.u0);
      const hu1 = Math.min(su1 - 0.02, op.u1);
      if (hu1 - hu0 < 0.08) return;
      const hole = new THREE.Path();
      hole.moveTo(hu0, op.v0);
      hole.lineTo(hu0, op.v1);
      hole.lineTo(hu1, op.v1);
      hole.lineTo(hu1, op.v0);
      hole.closePath();
      shape.holes.push(hole);
    });

    shapes.push(shape);
  });

  return shapes;
}

function getCladdingVisualProps(
  claddingType: WallCladdingType,
  shadingMode: Roof3DShadingMode,
  wallTextures: WallCladdingTextureSet
): {
  color: string;
  roughness: number;
  metalness: number;
  normalMap: THREE.CanvasTexture | null;
  map: THREE.CanvasTexture | null;
  normalScale: number;
} {
  const meta = getWallCladdingMeta(claddingType);
  const texEntry = wallTextures.getEntry(claddingType);

  if (shadingMode === 'wireframe') {
    return {
      color: '#38bdf8',
      roughness: 0.6,
      metalness: 0.2,
      normalMap: null,
      map: null,
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
      normalMap: texEntry?.normalMap || null,
      map: null,
      normalScale: texEntry ? Math.min(0.45, texEntry.normalScale) : 0
    };
  }
  return {
    color: meta.hex,
    roughness: meta.roughness,
    metalness: meta.metalness,
    normalMap: texEntry?.normalMap || null,
    map: texEntry?.map || null,
    normalScale: texEntry?.normalScale ?? 0.35
  };
}

export function buildWallPlan3DGroup(params: {
  wallPlan: WallPlan;
  bounds: Roof3DBounds;
  selectedWallFacetId?: string | null;
  wallFilterMode?: WallFilterMode;
  shadingMode: Roof3DShadingMode;
  wallTextures: WallCladdingTextureSet;
  glassMat: THREE.MeshPhysicalMaterial;
  rootGroup: THREE.Group;
  selectableMeshes: THREE.Mesh[];
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T;
  trackMat: <T extends THREE.Material>(m: T) => T;
}): void {
  const {
    wallPlan,
    bounds,
    selectedWallFacetId,
    wallFilterMode = 'all',
    shadingMode,
    wallTextures,
    glassMat,
    rootGroup,
    selectableMeshes,
    trackGeo,
    trackMat
  } = params;

  if (!wallPlan || !wallPlan.facets || wallPlan.facets.length === 0) return;

  const isWireframe = shadingMode === 'wireframe';
  const wallThickness = 0.14;
  const takeoffSummary = computeWallTakeoffSummary(wallPlan.facets);
  const returnFacetIdSet = new Set(takeoffSummary.returnFacetIds);

  // Shared opening joinery & leaf materials
  const frameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1e293b',
      metalness: 0.58,
      roughness: 0.34,
      wireframe: isWireframe
    })
  );

  const doorLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.52,
      metalness: 0.24,
      wireframe: isWireframe
    })
  );

  const garageLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#5a6575',
      normalMap: wallTextures.garageDoor,
      normalScale: new THREE.Vector2(0.85, 0.85),
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

    const isSelected = Boolean(selectedWallFacetId && selectedWallFacetId === facet.id);
    const isUndetailed = isWallFacetUndetailed(facet);
    const isReturn = returnFacetIdSet.has(facet.id);
    const isDimmedByFilter =
      (wallFilterMode === 'undetailed' && !isUndetailed) ||
      (wallFilterMode === 'returns' && !isReturn);
    const isHighlightedByFilter =
      (wallFilterMode === 'undetailed' && isUndetailed) ||
      (wallFilterMode === 'returns' && isReturn);

    const sanitizedOpenings = sanitizeOpeningsForExtrusion(facet);
    const roofProfileLocal =
      facet.heightSource === 'roof' && facet.roofProfile && facet.roofProfile.length >= 2
        ? facet.roofProfile.map((p) => ({
            u: Math.max(0, Math.min(L, p.distM)),
            v: Math.max(0.25, p.topZ - facet.bottomZ)
          }))
        : undefined;

    const regionsToBuild =
      facet.regions && facet.regions.length > 0
        ? facet.regions.slice(0, 3).map((r) => clampWallRegionToFacet(facet, r))
        : [
            {
              id: 'full',
              claddingType: facet.claddingType,
              uStartM: 0,
              uEndM: L,
              vStartM: 0,
              vEndM: H
            }
          ];

    regionsToBuild.forEach((reg) => {
      const useRoofProfile =
        Boolean(roofProfileLocal) &&
        Math.abs(reg.vEndM - H) < 0.08 &&
        reg.uEndM - reg.uStartM > 0.25;
      const shapes = buildWallRegionShapes({
        u0: reg.uStartM,
        u1: reg.uEndM,
        v0: reg.vStartM,
        v1: reg.vEndM,
        openings: sanitizedOpenings,
        roofProfilePts: useRoofProfile ? roofProfileLocal : undefined
      });

      const vis = getCladdingVisualProps(reg.claddingType, shadingMode, wallTextures);
      const baseEmissiveHex = isSelected
        ? '#0284c7'
        : isHighlightedByFilter
        ? wallFilterMode === 'undetailed'
          ? '#d97706'
          : '#0ea5e9'
        : '#000000';
      const baseEmissiveIntensity = isSelected ? 0.34 : isHighlightedByFilter ? 0.28 : 0;

      const wallMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(vis.color),
          map: vis.map,
          roughness: vis.roughness,
          metalness: vis.metalness,
          normalMap: vis.normalMap,
          normalScale: new THREE.Vector2(vis.normalScale, vis.normalScale),
          emissive: new THREE.Color(baseEmissiveHex),
          emissiveIntensity: baseEmissiveIntensity,
          transparent: isDimmedByFilter,
          opacity: isDimmedByFilter ? 0.24 : 1,
          wireframe: isWireframe
        })
      );

      shapes.forEach((shape) => {
        const wallGeo = trackGeo(
          new THREE.ExtrudeGeometry(shape, {
            depth: wallThickness,
            bevelEnabled: false,
            steps: 1
          })
        );
        wallGeo.translate(0, 0, -wallThickness / 2);

        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.castShadow = !isDimmedByFilter;
        wallMesh.receiveShadow = true;
        wallMesh.userData = {
          wallFacetId: facet.id,
          baseEmissiveHex,
          baseEmissiveIntensity
        };
        facetGroup.add(wallMesh);
        selectableMeshes.push(wallMesh);

        if (isSelected || isHighlightedByFilter || isWireframe) {
          const edgesGeo = trackGeo(new THREE.EdgesGeometry(wallGeo, 25));
          const edgeMat = trackMat(
            new THREE.LineBasicMaterial({
              color: isSelected
                ? '#38bdf8'
                : isHighlightedByFilter
                ? '#fbbf24'
                : '#7dd3fc',
              transparent: true,
              opacity: isSelected || isHighlightedByFilter ? 0.95 : 0.45
            })
          );
          facetGroup.add(new THREE.LineSegments(edgesGeo, edgeMat));
        }
      });
    });

    // Crisp Opening Joinery Frames, Architectural Glazing & Recessed Door/Garage Leaves
    sanitizedOpenings.forEach((op) => {
      const w = op.u1 - op.u0;
      const h = op.v1 - op.v0;
      const uMid = (op.u0 + op.u1) / 2;
      const vMid = (op.v0 + op.v1) / 2;
      const jambW = 0.045;
      const frameDepth = wallThickness + 0.032;

      // Head & Jamb frames
      const headMesh = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(w, jambW, frameDepth)),
        frameMat
      );
      headMesh.position.set(uMid, op.v1 - jambW / 2, 0);
      headMesh.castShadow = !isDimmedByFilter;
      facetGroup.add(headMesh);

      const leftJamb = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(jambW, h, frameDepth)),
        frameMat
      );
      leftJamb.position.set(op.u0 + jambW / 2, vMid, 0);
      leftJamb.castShadow = !isDimmedByFilter;
      facetGroup.add(leftJamb);

      const rightJamb = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(jambW, h, frameDepth)),
        frameMat
      );
      rightJamb.position.set(op.u1 - jambW / 2, vMid, 0);
      rightJamb.castShadow = !isDimmedByFilter;
      facetGroup.add(rightJamb);

      if (!op.isThreshold) {
        const sillMesh = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(w + 0.04, jambW * 1.15, frameDepth + 0.025)),
          frameMat
        );
        sillMesh.position.set(uMid, op.v0 + jambW / 2, 0);
        sillMesh.castShadow = !isDimmedByFilter;
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
        glassMesh.castShadow = false;
        glassMesh.receiveShadow = true;
        facetGroup.add(glassMesh);

        // Architectural center mullion on wider windows (>= 1.15m)
        if (innerW >= 1.15) {
          const mullionMesh = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(0.032, innerH, 0.042)),
            frameMat
          );
          mullionMesh.position.set(uMid, vMid, 0);
          facetGroup.add(mullionMesh);
        }
      } else if (op.raw.type === 'door') {
        const innerW = Math.max(0.08, w - jambW * 1.8);
        const innerH = Math.max(0.1, h - jambW);
        const doorMesh = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(innerW, innerH, 0.048)),
          doorLeafMat
        );
        doorMesh.position.set(uMid, op.v0 + innerH / 2, 0);
        doorMesh.castShadow = !isDimmedByFilter;
        doorMesh.receiveShadow = true;
        facetGroup.add(doorMesh);
      } else if (op.raw.type === 'garage') {
        const innerW = Math.max(0.1, w - jambW * 1.8);
        const innerH = Math.max(0.1, h - jambW);
        const garageMesh = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(innerW, innerH, 0.055)),
          garageLeafMat
        );
        garageMesh.position.set(uMid, op.v0 + innerH / 2, 0);
        garageMesh.castShadow = !isDimmedByFilter;
        garageMesh.receiveShadow = true;
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
        color: '#283244',
        roughness: 0.92,
        metalness: 0.05,
        wireframe: isWireframe
      })
    );
    const padMesh = new THREE.Mesh(padGeo, padMat);
    padMesh.position.y = 0.06;
    padMesh.receiveShadow = true;
    rootGroup.add(padMesh);
  }
}
