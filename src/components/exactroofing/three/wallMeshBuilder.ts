import * as THREE from 'three';
import {
  WallCladdingType,
  WallFacet,
  WallFilterMode,
  WallOpening,
  WallPlan
} from '../../../types/exactRoofing';
import {
  clampWallRegionToFacet,
  computeWallTakeoffSummary,
  getWallCladdingMeta,
  isWallFacetUndetailed,
  sanitizeWallOpeningsForExtrusion
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
 * Supports vertically stacked openings (e.g. highlight window over door/window).
 */
function buildExtrusionOpenings(facet: WallFacet): SanitizedOpening[] {
  const L = facet.lengthM;
  const maxProfileH =
    facet.roofProfile && facet.roofProfile.length > 0 && facet.kind !== 'parapet'
      ? Math.max(facet.heightM, ...facet.roofProfile.map((p) => p.topZ - facet.bottomZ))
      : facet.heightM;
  const H = facet.heightM;
  if (L < 0.2 || maxProfileH < 0.2) return [];

  const minCornerJamb = Math.min(0.035, L * 0.05);
  const minHeadJamb = Math.min(0.035, H * 0.04);

  return sanitizeWallOpeningsForExtrusion(facet)
    .map((o) => {
      const u0 = Math.max(minCornerJamb, o.u0);
      const u1 = Math.min(L - minCornerJamb, o.u1);
      const isThreshold = o.v0 <= 0.035;
      const v0 = isThreshold ? 0 : Math.max(0.03, o.v0);
      const v1 = Math.min(H - minHeadJamb, o.v1);
      return { raw: o, u0, u1, v0, v1, isThreshold };
    })
    .filter((o) => o.u1 - o.u0 >= 0.08 && o.v1 - o.v0 >= 0.08);
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
  if (u1 - u0 < 0.05 || v1 - v0 < 0.05) return [];

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
    if (cutStart - cursorU >= 0.05) {
      subSpans.push([cursorU, cutStart]);
    }
    cursorU = Math.max(cursorU, cutEnd);
  });
  if (u1 - cursorU >= 0.05) {
    subSpans.push([cursorU, u1]);
  }

  const shapes: THREE.Shape[] = [];
  subSpans.forEach(([su0, su1]) => {
    if (su1 - su0 < 0.05) return;
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
    let lastBottomU = su0;
    bottomNotches.forEach((op) => {
      const nu0 = Math.max(lastBottomU + 0.012, op.u0);
      const nu1 = Math.min(su1 - 0.012, op.u1);
      if (nu1 - nu0 < 0.05) return;
      shape.lineTo(nu0, v0);
      shape.lineTo(nu0, Math.min(v1 - 0.025, op.v1));
      shape.lineTo(nu1, Math.min(v1 - 0.025, op.v1));
      shape.lineTo(nu1, v0);
      lastBottomU = nu1;
    });
    shape.lineTo(su1, v0);

    if (roofProfilePts && roofProfilePts.length >= 2) {
      const clippedTop = roofProfilePts
        .filter((p) => p.u >= su0 - 0.02 && p.u <= su1 + 0.02)
        .map((p) => ({
          u: Math.max(su0, Math.min(su1, p.u)),
          v: Math.max(v0 + 0.12, p.v)
        }))
        .sort((a, b) => b.u - a.u);

      const firstRightV =
        clippedTop[0]?.v ??
        Math.max(v0 + 0.12, roofProfilePts[roofProfilePts.length - 1].v);
      shape.lineTo(su1, firstRightV);
      clippedTop.forEach((pt) => {
        shape.lineTo(pt.u, pt.v);
      });
      const lastLeftV =
        clippedTop[clippedTop.length - 1]?.v ?? Math.max(v0 + 0.12, roofProfilePts[0].v);
      shape.lineTo(su0, lastLeftV);
    } else {
      shape.lineTo(su1, v1);
      let lastTopU = su1;
      topNotches.forEach((op) => {
        const nu1 = Math.min(lastTopU - 0.012, op.u1);
        const nu0 = Math.max(su0 + 0.012, op.u0);
        if (nu1 - nu0 < 0.05) return;
        shape.lineTo(nu1, v1);
        shape.lineTo(nu1, Math.max(v0 + 0.025, op.v0));
        shape.lineTo(nu0, Math.max(v0 + 0.025, op.v0));
        shape.lineTo(nu0, v1);
        lastTopU = nu0;
      });
      shape.lineTo(su0, v1);
    }
    shape.closePath();

    // Ensure polygon has positive non-degenerate area before pushing holes
    if (Math.abs(THREE.ShapeUtils.area(shape.getPoints())) < 0.002) {
      return;
    }

    interiorHoles.forEach((op) => {
      const hu0 = Math.max(su0 + 0.015, op.u0);
      const hu1 = Math.min(su1 - 0.015, op.u1);
      const hv0 = Math.max(v0 + 0.015, op.v0);
      const hv1 = Math.min(v1 - 0.015, op.v1);
      if (hu1 - hu0 < 0.06 || hv1 - hv0 < 0.06) return;

      // Skip hole if it intersects a bottom/top notch vertically (safety guard)
      const hitsBottomNotch = bottomNotches.some(
        (bn) => hu0 < bn.u1 + 0.01 && hu1 > bn.u0 - 0.01 && hv0 <= bn.v1 + 0.01
      );
      const hitsTopNotch = topNotches.some(
        (tn) => hu0 < tn.u1 + 0.01 && hu1 > tn.u0 - 0.01 && hv1 >= tn.v0 - 0.01
      );
      if (hitsBottomNotch || hitsTopNotch) return;

      const hole = new THREE.Path();
      hole.moveTo(hu0, hv0);
      hole.lineTo(hu0, hv1);
      hole.lineTo(hu1, hv1);
      hole.lineTo(hu1, hv0);
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
  roughnessMap: THREE.CanvasTexture | null;
  bumpMap: THREE.CanvasTexture | null;
  map: THREE.CanvasTexture | null;
  normalScale: number;
  bumpScale: number;
  envMapIntensity: number;
} {
  const meta = getWallCladdingMeta(claddingType);
  const texEntry = wallTextures?.getEntry?.(claddingType) || null;

  if (shadingMode === 'wireframe') {
    return {
      color: '#38bdf8',
      roughness: 0.6,
      metalness: 0.2,
      normalMap: null,
      roughnessMap: null,
      bumpMap: null,
      map: null,
      normalScale: 0,
      bumpScale: 0,
      envMapIntensity: 0.3
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
      roughnessMap: texEntry?.roughnessMap || null,
      bumpMap: texEntry?.bumpMap || null,
      map: null,
      normalScale: texEntry ? Math.min(0.45, texEntry.normalScale) : 0,
      bumpScale: texEntry ? Math.min(0.012, texEntry.bumpScale ?? 0.01) : 0,
      envMapIntensity: 0.65
    };
  }
  return {
    color: meta.hex,
    roughness: meta.roughness,
    metalness: meta.metalness,
    normalMap: texEntry?.normalMap || null,
    roughnessMap: texEntry?.roughnessMap || null,
    bumpMap: texEntry?.bumpMap || null,
    map: texEntry?.map || null,
    normalScale: texEntry?.normalScale ?? 0.35,
    bumpScale: texEntry?.bumpScale ?? 0.015,
    envMapIntensity: claddingType === 'profiled_metal' ? 1.18 : 0.82
  };
}

export function buildWallPlan3DGroup(params: {
  wallPlan: WallPlan;
  bounds: Roof3DBounds;
  selectedWallFacetId?: string | null;
  wallFilterMode?: WallFilterMode;
  shadingMode: Roof3DShadingMode;
  showSheetSeams?: boolean;
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
    showSheetSeams = true,
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

  // Shared opening joinery, coping, flashings, seams & leaf materials
  const frameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1e293b',
      metalness: 0.58,
      roughness: 0.34,
      wireframe: isWireframe
    })
  );

  const trimFlashingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#334155',
      metalness: 0.62,
      roughness: 0.3,
      wireframe: isWireframe
    })
  );

  const parapetCopingMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#384152',
      metalness: 0.7,
      roughness: 0.26,
      wireframe: isWireframe
    })
  );

  const stainlessHardwareMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      metalness: 0.88,
      roughness: 0.2,
      wireframe: isWireframe
    })
  );

  const seamLineMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#0f172a',
      metalness: 0.35,
      roughness: 0.72,
      transparent: true,
      opacity: 0.32,
      wireframe: isWireframe
    })
  );

  const doorLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#334155',
      roughness: 0.48,
      metalness: 0.24,
      wireframe: isWireframe
    })
  );

  const garageLeafMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#5a6575',
      normalMap: wallTextures?.garageDoor || null,
      roughnessMap: wallTextures?.garageDoorRoughness || null,
      bumpMap: wallTextures?.garageDoorBump || null,
      bumpScale: wallTextures?.garageDoorBump ? 0.015 : 0,
      normalScale: new THREE.Vector2(0.88, 0.88),
      roughness: 0.42,
      metalness: 0.45,
      wireframe: isWireframe
    })
  );

  // Corner tracking so every exterior, internal notch, wing, and secondary corner gets a crisp post/flashing
  const cornerAgg = new Map<
    string,
    {
      x: number;
      y: number;
      minBottomZ: number;
      maxTopZ: number;
      parapetMaxZ: number | null;
      count: number;
      allDimmed: boolean;
      hasParapetCap: boolean;
    }
  >();
  const registerCornerVertex = (
    x: number,
    y: number,
    bottomZ: number,
    topZ: number,
    isDimmed: boolean,
    parapetCapZ: number | null
  ) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(bottomZ) || !Number.isFinite(topZ)) return;
    const key = `${Math.round(x * 40)},${Math.round(y * 40)}`; // 2.5cm spatial weld tolerance
    const prev = cornerAgg.get(key);
    if (!prev) {
      cornerAgg.set(key, {
        x,
        y,
        minBottomZ: bottomZ,
        maxTopZ: topZ,
        parapetMaxZ: parapetCapZ,
        count: 1,
        allDimmed: isDimmed,
        hasParapetCap: parapetCapZ !== null
      });
    } else {
      prev.minBottomZ = Math.min(prev.minBottomZ, bottomZ);
      prev.maxTopZ = Math.max(prev.maxTopZ, topZ);
      if (parapetCapZ !== null) {
        prev.parapetMaxZ = prev.parapetMaxZ !== null ? Math.max(prev.parapetMaxZ, parapetCapZ) : parapetCapZ;
        prev.hasParapetCap = true;
      }
      prev.allDimmed = prev.allDimmed && isDimmed;
      prev.count += 1;
    }
  };

  wallPlan.facets.forEach((facet) => {
    const dx = facet.to.x - facet.from.x;
    const dy = facet.to.y - facet.from.y;
    const L = Math.hypot(dx, dy);
    const H = facet.heightM;
    if (!Number.isFinite(L) || !Number.isFinite(H) || L < 0.05 || H < 0.1) return;

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
    const isReturn = returnFacetIdSet.has(facet.id) || facet.kind === 'return';
    const isParapet = facet.kind === 'parapet';
    const isSecondary = facet.kind === 'secondary' || Boolean(facet.secondaryZoneId);
    const isWing = facet.kind === 'wing' || Boolean(facet.isSpur);

    const isDimmedByFilter =
      (wallFilterMode === 'undetailed' && !isUndetailed) ||
      (wallFilterMode === 'returns' && !isReturn) ||
      (wallFilterMode === 'parapets' && !isParapet) ||
      (wallFilterMode === 'secondary' && !isSecondary) ||
      (wallFilterMode === 'wings' && !isWing);

    const isHighlightedByFilter =
      (wallFilterMode === 'undetailed' && isUndetailed) ||
      (wallFilterMode === 'returns' && isReturn) ||
      (wallFilterMode === 'parapets' && isParapet) ||
      (wallFilterMode === 'secondary' && isSecondary) ||
      (wallFilterMode === 'wings' && isWing);

    const sanitizedOpenings = buildExtrusionOpenings(facet);
    const allowRoofProfile =
      facet.heightSource === 'roof' &&
      facet.kind !== 'parapet' &&
      facet.kind !== 'wing' &&
      facet.kind !== 'secondary';

    const roofProfileLocal =
      allowRoofProfile && facet.roofProfile && facet.roofProfile.length >= 2
        ? facet.roofProfile.map((p) => ({
            u: Math.max(0, Math.min(L, p.distM)),
            v: Math.max(0.25, p.topZ - facet.bottomZ)
          }))
        : undefined;

    const startTopZ = roofProfileLocal ? facet.bottomZ + roofProfileLocal[0].v : facet.bottomZ + H;
    const endTopZ = roofProfileLocal
      ? facet.bottomZ + roofProfileLocal[roofProfileLocal.length - 1].v
      : facet.bottomZ + H;
    const parapetCapZ = isParapet && facet.hasCopingFlashing !== false ? facet.bottomZ + H : null;
    registerCornerVertex(facet.from.x, facet.from.y, facet.bottomZ, startTopZ, isDimmedByFilter, parapetCapZ);
    registerCornerVertex(facet.to.x, facet.to.y, facet.bottomZ, endTopZ, isDimmedByFilter, parapetCapZ);

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
          : wallFilterMode === 'parapets'
          ? '#a855f7'
          : wallFilterMode === 'secondary'
          ? '#8b5cf6'
          : wallFilterMode === 'wings'
          ? '#14b8a6'
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
          roughnessMap: vis.roughnessMap,
          bumpMap: vis.bumpMap,
          bumpScale: vis.bumpScale,
          normalScale: new THREE.Vector2(vis.normalScale, vis.normalScale),
          envMapIntensity: vis.envMapIntensity,
          emissive: new THREE.Color(baseEmissiveHex),
          emissiveIntensity: baseEmissiveIntensity,
          transparent: isDimmedByFilter,
          opacity: isDimmedByFilter ? 0.22 : 1,
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

      // Architectural Z-flashing divider bar at horizontal dado / band seams
      if (regionsToBuild.length >= 2 && reg.vEndM < H - 0.04 && reg.uEndM - reg.uStartM > 0.25 && !isDimmedByFilter) {
        const divSpan = reg.uEndM - reg.uStartM;
        const divBar = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(divSpan + 0.01, 0.026, wallThickness + 0.024)),
          trimFlashingMat
        );
        divBar.position.set((reg.uStartM + reg.uEndM) / 2, reg.vEndM, 0);
        divBar.castShadow = true;
        facetGroup.add(divBar);
      }

      // Cladding sheet / panel joint cues (clipped neatly above/below openings when showSheetSeams enabled)
      if (
        showSheetSeams &&
        !isWireframe &&
        !isDimmedByFilter &&
        (reg.claddingType === 'profiled_metal' || reg.claddingType === 'fibre_cement')
      ) {
        const pitchM = reg.claddingType === 'profiled_metal' ? 0.762 : 1.2;
        const maxSeams = 28;
        let seamCount = 0;
        for (
          let su = reg.uStartM + pitchM;
          su < reg.uEndM - 0.14 && seamCount < maxSeams;
          su += pitchM
        ) {
          seamCount += 1;
          const hitsOpening = sanitizedOpenings.some((op) => su > op.u0 - 0.02 && su < op.u1 + 0.02);
          if (hitsOpening) continue;
          const seamH = Math.max(0.1, reg.vEndM - reg.vStartM - 0.04);
          const seamGeo = trackGeo(new THREE.BoxGeometry(0.011, seamH, wallThickness + 0.008));
          const seamMesh = new THREE.Mesh(seamGeo, seamLineMat);
          seamMesh.position.set(su, reg.vStartM + (reg.vEndM - reg.vStartM) / 2, 0);
          facetGroup.add(seamMesh);
        }
      }
    });

    // Architectural metal coping cap + joint ticks on parapet walls
    if (isParapet && facet.hasCopingFlashing !== false) {
      const copingGeo = trackGeo(new THREE.BoxGeometry(L + 0.06, 0.044, wallThickness + 0.064));
      const copingMesh = new THREE.Mesh(copingGeo, parapetCopingMat);
      copingMesh.position.set(L / 2, H + 0.02, 0);
      copingMesh.castShadow = !isDimmedByFilter;
      copingMesh.receiveShadow = true;
      copingMesh.userData = { wallFacetId: facet.id };
      facetGroup.add(copingMesh);

      if (showSheetSeams && !isWireframe && L > 3.2) {
        for (let ju = 3.0; ju < L - 0.2; ju += 3.0) {
          const tick = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(0.016, 0.05, wallThickness + 0.072)),
            trimFlashingMat
          );
          tick.position.set(ju, H + 0.02, 0);
          facetGroup.add(tick);
        }
      }
    }

    // Crisp Opening Joinery Frames, Head Flashings, Transoms, Handles & Recessed Leaves
    sanitizedOpenings.forEach((op) => {
      const w = op.u1 - op.u0;
      const h = op.v1 - op.v0;
      const uMid = (op.u0 + op.u1) / 2;
      const vMid = (op.v0 + op.v1) / 2;

      if (op.raw.type === 'void') {
        if (!op.raw.linkedSecondaryZoneId) {
          const revealW = 0.026;
          const revealDepth = wallThickness + 0.016;
          const headMesh = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(w, revealW, revealDepth)),
            frameMat
          );
          headMesh.position.set(uMid, op.v1 - revealW / 2, 0);
          facetGroup.add(headMesh);
        }
        return;
      }

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

      // Projecting metal head flashing apron above every glazed/door opening
      const headFlashingMesh = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(w + 0.05, 0.024, wallThickness + 0.068)),
        trimFlashingMat
      );
      headFlashingMesh.position.set(uMid, op.v1 + 0.01, 0);
      headFlashingMesh.castShadow = !isDimmedByFilter;
      facetGroup.add(headFlashingMesh);

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
          trackGeo(new THREE.BoxGeometry(w + 0.05, jambW * 1.15, frameDepth + 0.034)),
          trimFlashingMat
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
            trackGeo(new THREE.BoxGeometry(0.032, innerH, 0.044)),
            frameMat
          );
          mullionMesh.position.set(uMid, vMid, 0);
          facetGroup.add(mullionMesh);
        }

        // Architectural horizontal transom bar on tall windows (>= 1.65m)
        if (innerH >= 1.65) {
          const transomMesh = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(innerW, 0.03, 0.042)),
            frameMat
          );
          transomMesh.position.set(uMid, op.v1 - jambW - Math.min(0.45, innerH * 0.28), 0);
          facetGroup.add(transomMesh);
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

        // Glazed vertical vision lite + brushed stainless pull handle
        if (innerW >= 0.65 && innerH >= 1.4) {
          const liteW = Math.min(0.16, innerW * 0.2);
          const liteH = innerH * 0.72;
          const liteMesh = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(liteW, liteH, 0.058)),
            glassMat
          );
          liteMesh.position.set(uMid - innerW * 0.22, op.v0 + innerH * 0.52, 0);
          facetGroup.add(liteMesh);

          const handleOffset = innerW * 0.34;
          const handleMesh = new THREE.Mesh(
            trackGeo(new THREE.BoxGeometry(0.022, 0.42, 0.082)),
            stainlessHardwareMat
          );
          handleMesh.position.set(uMid + handleOffset, op.v0 + 1.05, 0);
          facetGroup.add(handleMesh);
        }
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

        // Bottom rubber weather seal
        const sealMesh = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(innerW + 0.01, 0.026, 0.068)),
          frameMat
        );
        sealMesh.position.set(uMid, op.v0 + 0.013, 0);
        facetGroup.add(sealMesh);
      }
    });

    rootGroup.add(facetGroup);
  });

  // Render crisp vertical Corner Box Flashings & Parapet Corner Coping Caps at connected wall vertices
  cornerAgg.forEach((c) => {
    const colH = c.maxTopZ - c.minBottomZ;
    if (!Number.isFinite(colH) || colH < 0.2) return;
    // Render corner box post wherever 2+ walls meet, or where a wing end cap needs clean closure
    const postSize = wallThickness + 0.018;
    const postGeo = trackGeo(new THREE.BoxGeometry(postSize, colH, postSize));
    const postMat = c.allDimmed
      ? trackMat(
          new THREE.MeshStandardMaterial({
            color: '#334155',
            metalness: 0.5,
            roughness: 0.4,
            transparent: true,
            opacity: 0.2,
            wireframe: isWireframe
          })
        )
      : trimFlashingMat;
    const postMesh = new THREE.Mesh(postGeo, postMat);
    postMesh.position.set(c.x - bounds.midX, c.minBottomZ + colH / 2, c.y - bounds.midY);
    postMesh.castShadow = !c.allDimmed;
    postMesh.receiveShadow = true;
    rootGroup.add(postMesh);

    if (c.hasParapetCap && c.parapetMaxZ !== null) {
      const capGeo = trackGeo(new THREE.BoxGeometry(wallThickness + 0.072, 0.048, wallThickness + 0.072));
      const capMesh = new THREE.Mesh(capGeo, parapetCopingMat);
      capMesh.position.set(c.x - bounds.midX, c.parapetMaxZ + 0.022, c.y - bounds.midY);
      capMesh.castShadow = !c.allDimmed;
      rootGroup.add(capMesh);
    }
  });

  // Grounded concrete floor slab plinth matching closed WallPlan footprint (top flush at y = -0.002 so thresholds never Z-fight)
  const padMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#283244',
      roughness: 0.92,
      metalness: 0.05,
      wireframe: isWireframe
    })
  );

  if (wallPlan.points && wallPlan.points.length >= 3) {
    const shapePts = wallPlan.points.map(
      (pt) => new THREE.Vector2(pt.x - bounds.midX, pt.y - bounds.midY)
    );
    if (Math.abs(THREE.ShapeUtils.area(shapePts)) > 0.05) {
      const floorShape = new THREE.Shape(shapePts);
      const padGeo = trackGeo(
        new THREE.ExtrudeGeometry(floorShape, { depth: 0.14, bevelEnabled: false })
      );
      padGeo.rotateX(Math.PI / 2);
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.position.y = -0.002;
      padMesh.receiveShadow = true;
      rootGroup.add(padMesh);
    }
  }

  // Secondary Zone concrete plinth pads (for outward patio/entry alcove enclosures)
  if (wallPlan.secondaryZones && wallPlan.secondaryZones.length > 0) {
    wallPlan.secondaryZones.forEach((zone) => {
      if (zone.direction !== 'outward') return;
      const zFacets = wallPlan.facets.filter((f) => zone.facetIds.includes(f.id));
      if (zFacets.length < 3) return;
      const quadPts = [
        new THREE.Vector2(zFacets[0].from.x - bounds.midX, zFacets[0].from.y - bounds.midY),
        new THREE.Vector2(zFacets[0].to.x - bounds.midX, zFacets[0].to.y - bounds.midY),
        new THREE.Vector2(zFacets[1].to.x - bounds.midX, zFacets[1].to.y - bounds.midY),
        new THREE.Vector2(zFacets[2].to.x - bounds.midX, zFacets[2].to.y - bounds.midY)
      ];
      if (Math.abs(THREE.ShapeUtils.area(quadPts)) > 0.05) {
        const zShape = new THREE.Shape(quadPts);
        const zGeo = trackGeo(
          new THREE.ExtrudeGeometry(zShape, { depth: 0.12, bevelEnabled: false })
        );
        zGeo.rotateX(Math.PI / 2);
        const zPad = new THREE.Mesh(zGeo, padMat);
        zPad.position.y = (zFacets[0].bottomZ || 0) - 0.004;
        zPad.receiveShadow = true;
        rootGroup.add(zPad);
      }
    });
  }
}

