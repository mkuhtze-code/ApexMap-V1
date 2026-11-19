import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Layers,
  Rotate3d,
  RotateCcw,
  Sun
} from 'lucide-react';
import {
  PitchBreakLine,
  RoofAsset,
  RoofLevel,
  RoofOutline,
  RoofPlane,
  SkeletonLine,
  WallFilterMode,
  WallPlan
} from '../../types/exactRoofing';
import {
  COLORSTEEL_SWATCHES,
  createContactShadowTexture,
  createProfileTextureSet,
  createWallCladdingTexture,
  ProceduralRoofTextureSet,
  resolveColorsteelSwatch,
  resolveProfileKey,
  Roof3DProfileKey,
  Roof3DShadingMode
} from './three/roofMaterials';
import {
  buildRoofSceneGroup,
  computeRoof3DBounds,
  Roof3DBounds
} from './three/roofMeshBuilder';
import {
  computeWallFacetMetrics,
  getWallCladdingMeta
} from '../../utils/wallCladdingEngine';
import { useDeviceDetection } from '../../hooks/useDeviceDetection';

interface Props {
  outline: RoofOutline;
  skeleton: SkeletonLine[];
  planes: RoofPlane[];
  levels?: RoofLevel[];
  assets?: RoofAsset[];
  pitchBreaks?: PitchBreakLine[];
  wallPlan?: WallPlan | null;
  selectedPlaneId?: string | null;
  onSelectPlane?: (planeId: string | null) => void;
  selectedWallFacetId?: string | null;
  onSelectWallFacet?: (facetId: string | null) => void;
  wallFilterMode?: WallFilterMode;
  onChangeWallFilterMode?: (mode: WallFilterMode) => void;
  roofProfileName?: string;
  coilColorName?: string;
}

type CameraPreset = 'iso' | 'top' | 'north' | 'east' | 'south' | 'west';

export const ExactRoofing3DViewer: React.FC<Props> = ({
  outline,
  skeleton,
  planes,
  levels,
  assets = [],
  pitchBreaks = [],
  wallPlan,
  selectedPlaneId,
  onSelectPlane,
  selectedWallFacetId,
  onSelectWallFacet,
  wallFilterMode: propWallFilterMode,
  onChangeWallFilterMode,
  roofProfileName,
  coilColorName
}) => {
  const { isMobile } = useDeviceDetection();
  const mountRef = useRef<HTMLDivElement>(null);

  const [shadingMode, setShadingMode] = useState<Roof3DShadingMode>('studio_finish');
  const [profileKey, setProfileKey] = useState<Roof3DProfileKey>(() =>
    resolveProfileKey(roofProfileName)
  );
  const [swatchId, setSwatchId] = useState<string>(() =>
    resolveColorsteelSwatch(coilColorName).id
  );
  const [showFlashings, setShowFlashings] = useState<boolean>(true);
  const [showWalls, setShowWalls] = useState<boolean>(true);
  const [showSheetSeams, setShowSheetSeams] = useState<boolean>(true);
  const [localWallFilter, setLocalWallFilter] = useState<WallFilterMode>('all');
  const activeWallFilter = propWallFilterMode ?? localWallFilter;
  const setActiveWallFilter = (m: WallFilterMode) => {
    setLocalWallFilter(m);
    onChangeWallFilterMode?.(m);
  };
  const [sunAzimuthDeg, setSunAzimuthDeg] = useState<number>(38);
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(false);
  const [isDockOpen, setIsDockOpen] = useState<boolean>(() => !isMobile);
  const [compassDeg, setCompassDeg] = useState<number>(-42);
  const [hoveredPlaneId, setHoveredPlaneId] = useState<string | null>(null);
  const [hoveredWallFacetId, setHoveredWallFacetId] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Sync defaults if parent project changes
  useEffect(() => {
    if (roofProfileName) setProfileKey(resolveProfileKey(roofProfileName));
  }, [roofProfileName]);
  useEffect(() => {
    if (coilColorName) setSwatchId(resolveColorsteelSwatch(coilColorName).id);
  }, [coilColorName]);

  const activeSwatch = useMemo(
    () => COLORSTEEL_SWATCHES.find((s) => s.id === swatchId) || COLORSTEEL_SWATCHES[0],
    [swatchId]
  );

  const allLevels = useMemo<RoofLevel[]>(() => {
    if (levels && levels.length > 0) return levels;
    return [
      {
        id: outline.levelId || 'level-1',
        code: 'L1',
        name: 'Main Roof',
        eaveHeightM: 2.7,
        outline,
        skeleton
      }
    ];
  }, [levels, outline, skeleton]);

  const bounds = useMemo<Roof3DBounds>(
    () => computeRoof3DBounds(allLevels, planes, wallPlan),
    [allLevels, planes, wallPlan]
  );

  const selectedPlane = useMemo(
    () => planes.find((p) => p.id === selectedPlaneId) || null,
    [planes, selectedPlaneId]
  );

  const selectedWallFacet = useMemo(
    () => wallPlan?.facets.find((f) => f.id === selectedWallFacetId) || null,
    [wallPlan, selectedWallFacetId]
  );

  // Mutable Three.js refs kept isolated from React render cycle
  const sceneCtxRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    keyLight: THREE.DirectionalLight;
    roofContainer: THREE.Group;
    groundShadow: THREE.Mesh;
    groundGrid: THREE.GridHelper;
    selectableMeshes: THREE.Mesh[];
    planeMeshById: Map<string, THREE.Mesh[]>;
    builtDispose: (() => void) | null;
    profileTextures: ProceduralRoofTextureSet | null;
    wallNormalMap: THREE.CanvasTexture;
    isSoftwareGl: boolean;
    requestRender: () => void;
    applyCameraPreset: (preset: CameraPreset) => void;
  } | null>(null);

  const onSelectPlaneRef = useRef(onSelectPlane);
  onSelectPlaneRef.current = onSelectPlane;
  const onSelectWallFacetRef = useRef(onSelectWallFacet);
  onSelectWallFacetRef.current = onSelectWallFacet;

  // 1. Initialize Three.js WebGL Studio Renderer, Environment IBL, 3-Point Lights & Controls
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let isDisposed = false;
    let renderer: THREE.WebGLRenderer;

    // Detect software GL before creating final renderer options
    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const probeGl =
        probeCanvas.getContext('webgl2') ||
        probeCanvas.getContext('webgl');
      if (probeGl) {
        const dbg = probeGl.getExtension('WEBGL_debug_renderer_info');
        const unmasked = dbg ? probeGl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
        if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(String(unmasked))) {
          isSoftwareGl = true;
        }
      } else {
        setWebglError('WebGL graphics context unavailable on this browser.');
        return;
      }
    } catch {
      // ignore probe failure and proceed with standard WebGL attempt
    }

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false
      });
    } catch {
      setWebglError('Unable to initialize 3D WebGL viewport.');
      return;
    }

    setWebglError(null);
    const width = Math.max(320, container.clientWidth);
    const height = Math.max(240, container.clientHeight);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgHex = 0x09101e;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.0085);

    // PMREM Studio RoomEnvironment for crisp metallic PBR reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.15, 280);
    const targetY = Math.max(1.2, bounds.midZ * 0.72);
    const distInit = Math.max(15, bounds.span * 1.48);
    camera.position.set(distInit * 0.72, distInit * 0.62, distInit * 0.78);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, targetY, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 4;
    controls.maxDistance = 95;
    controls.rotateSpeed = 0.85;
    controls.zoomSpeed = 0.95;
    controls.panSpeed = 0.75;
    controls.update();

    // 3-Point Architectural Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.82);
    hemiLight.position.set(0, 32, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff6ea, 2.55);
    keyLight.position.set(18, 26, 16);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.bias = -0.00025;
    keyLight.shadow.normalBias = 0.025;
    keyLight.shadow.radius = 3.2;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.95);
    rimLight.position.set(-18, 12, -20);
    scene.add(rimLight);

    // Architectural Stage Ground & Contact Shadow
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0d1526,
      roughness: 0.94,
      metalness: 0.04
    });
    const groundMesh = new THREE.Mesh(new THREE.CircleGeometry(72, 64), groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.004;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const shadowTex = createContactShadowTexture();
    const contactMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9
    });
    const groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), contactMat);
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.position.y = 0.002;
    scene.add(groundShadow);

    const groundGrid = new THREE.GridHelper(60, 30, 0x1e3a5f, 0x132038);
    groundGrid.position.y = 0.005;
    (groundGrid.material as THREE.Material).transparent = true;
    (groundGrid.material as THREE.Material).opacity = 0.52;
    scene.add(groundGrid);

    const roofContainer = new THREE.Group();
    scene.add(roofContainer);

    const wallNormalMap = createWallCladdingTexture(
      renderer.capabilities.getMaxAnisotropy()
    );

    // Coalesced On-Demand Render Loop (renders on interaction, resize, prop change, or spin)
    let rafId: number | null = null;
    let renderQueued = false;
    let spinActive = false;

    const flushFrame = () => {
      rafId = null;
      if (isDisposed) return;

      // Update compass reading
      const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
      const deg = Math.round((az * 180) / Math.PI);
      setCompassDeg((prev) => (prev === deg ? prev : deg));

      const needsDampingTick = controls.enableDamping && controls.update();
      renderer.render(scene, camera);

      if (renderQueued || needsDampingTick || spinActive) {
        renderQueued = false;
        scheduleFrame();
      }
    };

    const scheduleFrame = () => {
      if (isDisposed || rafId !== null) return;
      rafId = requestAnimationFrame(flushFrame);
    };

    const requestRender = () => {
      renderQueued = true;
      scheduleFrame();
    };

    controls.addEventListener('change', requestRender);

    // Camera Presets
    const applyCameraPreset = (preset: CameraPreset) => {
      const b = computeRoof3DBounds(allLevels, planes);
      const tY = Math.max(1.2, b.midZ * 0.72);
      const d = Math.max(14, b.span * 1.48);
      controls.target.set(0, tY, 0);

      switch (preset) {
        case 'top':
          camera.position.set(0.01, d * 1.38, 0.01);
          break;
        case 'north':
          camera.position.set(0, tY + d * 0.35, -d * 1.05);
          break;
        case 'south':
          camera.position.set(0, tY + d * 0.35, d * 1.05);
          break;
        case 'east':
          camera.position.set(d * 1.05, tY + d * 0.35, 0);
          break;
        case 'west':
          camera.position.set(-d * 1.05, tY + d * 0.35, 0);
          break;
        case 'iso':
        default:
          camera.position.set(d * 0.72, d * 0.62, d * 0.78);
          break;
      }
      controls.update();
      requestRender();
    };

    sceneCtxRef.current = {
      scene,
      camera,
      renderer,
      controls,
      keyLight,
      roofContainer,
      groundShadow,
      groundGrid,
      selectableMeshes: [],
      planeMeshById: new Map(),
      builtDispose: null,
      profileTextures: null,
      wallNormalMap,
      isSoftwareGl,
      requestRender,
      applyCameraPreset
    };

    // Raycaster Click & Hover Selection (suppress click if user dragged to orbit)
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let downPt = { x: 0, y: 0 };

    const getHitTarget = (
      clientX: number,
      clientY: number
    ): { planeId: string | null; wallFacetId: string | null } => {
      const ctx = sceneCtxRef.current;
      if (!ctx || ctx.selectableMeshes.length === 0) {
        return { planeId: null, wallFacetId: null };
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(ctx.selectableMeshes, false);
      if (hits.length === 0) return { planeId: null, wallFacetId: null };
      const ud = hits[0].object.userData || {};
      return {
        planeId: (ud.planeId as string) || null,
        wallFacetId: (ud.wallFacetId as string) || null
      };
    };

    const handlePointerDown = (ev: PointerEvent) => {
      downPt = { x: ev.clientX, y: ev.clientY };
    };

    const handlePointerMove = (ev: PointerEvent) => {
      if (ev.buttons > 0) return;
      const hit = getHitTarget(ev.clientX, ev.clientY);
      renderer.domElement.style.cursor = hit.planeId || hit.wallFacetId ? 'pointer' : 'grab';
      setHoveredPlaneId((prev) => (prev === hit.planeId ? prev : hit.planeId));
      setHoveredWallFacetId((prev) => (prev === hit.wallFacetId ? prev : hit.wallFacetId));
    };

    const handlePointerUp = (ev: PointerEvent) => {
      const moved = Math.hypot(ev.clientX - downPt.x, ev.clientY - downPt.y);
      if (moved > 7) return;
      const hit = getHitTarget(ev.clientX, ev.clientY);
      if (hit.wallFacetId) {
        onSelectWallFacetRef.current?.(hit.wallFacetId);
      } else if (hit.planeId) {
        onSelectPlaneRef.current?.(hit.planeId);
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    // ResizeObserver keeps viewport razor-sharp at any desktop/mobile split size
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || isDisposed) return;
      const w = Math.max(200, Math.floor(entry.contentRect.width));
      const h = Math.max(200, Math.floor(entry.contentRect.height));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    // WebGL Context Loss safety
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
    const handleContextRestored = () => {
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    // Expose spin toggle listener via ref property
    const ctxRef = sceneCtxRef.current;
    (ctxRef as any).setSpinActive = (active: boolean) => {
      spinActive = active;
      controls.autoRotate = active && !isSoftwareGl;
      controls.autoRotateSpeed = 1.65;
      if (active) requestRender();
    };

    requestRender();

    return () => {
      isDisposed = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      sceneCtxRef.current?.builtDispose?.();
      sceneCtxRef.current?.profileTextures?.dispose();
      wallNormalMap.dispose();
      shadowTex.dispose();
      contactMat.dispose();
      groundMat.dispose();
      groundMesh.geometry.dispose();
      groundShadow.geometry.dispose();
      envTarget.dispose();
      renderer.dispose();
      sceneCtxRef.current = null;
    };
    // Intentionally initialize renderer once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Sync Auto-Spin State
  useEffect(() => {
    const ctx = sceneCtxRef.current as any;
    if (ctx?.setSpinActive) {
      ctx.setSpinActive(isAutoRotating);
    }
  }, [isAutoRotating]);

  // 3. Rebuild Procedural Profile Textures when profile switches
  useEffect(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;
    ctx.profileTextures?.dispose();
    ctx.profileTextures = createProfileTextureSet(
      profileKey,
      ctx.renderer.capabilities.getMaxAnisotropy()
    );
  }, [profileKey]);

  // 4. Rebuild 3D Roof Scene Geometry cleanly whenever roof model / materials change
  useEffect(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;

    if (!ctx.profileTextures) {
      ctx.profileTextures = createProfileTextureSet(
        profileKey,
        ctx.renderer.capabilities.getMaxAnisotropy()
      );
    }

    // Clear previous geometry
    ctx.builtDispose?.();
    ctx.roofContainer.clear();

    const built = buildRoofSceneGroup({
      outline,
      skeleton,
      planes,
      levels,
      assets,
      pitchBreaks,
      wallPlan,
      selectedPlaneId,
      selectedWallFacetId,
      wallFilterMode: activeWallFilter,
      shadingMode,
      swatch: activeSwatch,
      textures: ctx.profileTextures,
      wallNormalMap: ctx.wallNormalMap,
      showFlashings,
      showWalls,
      showSheetSeams
    });

    ctx.roofContainer.add(built.rootGroup);
    ctx.selectableMeshes = built.selectableMeshes;
    ctx.planeMeshById = built.planeMeshById;
    ctx.builtDispose = built.dispose;

    // Fit Ground Shadow & Light Shadow Frustum tightly to model span
    const pad = Math.max(12, built.bounds.span * 1.45);
    ctx.groundShadow.scale.set(pad * 1.15, pad * 1.15, 1);

    const d = Math.max(10, built.bounds.span * 0.9);
    ctx.keyLight.shadow.camera.left = -d;
    ctx.keyLight.shadow.camera.right = d;
    ctx.keyLight.shadow.camera.top = d;
    ctx.keyLight.shadow.camera.bottom = -d;
    ctx.keyLight.shadow.camera.near = 1;
    ctx.keyLight.shadow.camera.far = Math.max(60, d * 5);
    ctx.keyLight.shadow.camera.updateProjectionMatrix();

    ctx.requestRender();
  }, [
    outline,
    skeleton,
    planes,
    levels,
    assets,
    pitchBreaks,
    wallPlan,
    selectedPlaneId,
    selectedWallFacetId,
    activeWallFilter,
    shadingMode,
    activeSwatch,
    profileKey,
    showFlashings,
    showWalls,
    showSheetSeams
  ]);

  // 5. Update Sun Key Light Angle smoothly without rebuilding geometry
  useEffect(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;
    const rad = (sunAzimuthDeg * Math.PI) / 180;
    const radius = Math.max(22, bounds.span * 1.8);
    ctx.keyLight.position.set(
      Math.cos(rad) * radius,
      Math.max(20, bounds.span * 1.65),
      Math.sin(rad) * radius
    );
    ctx.requestRender();
  }, [sunAzimuthDeg, bounds.span]);

  // 6. Lightweight Hover Highlight Lift (mutates material emissive without rebuilding meshes)
  useEffect(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;
    ctx.selectableMeshes.forEach((mesh) => {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) return;
      const isHovered =
        (hoveredPlaneId && mesh.userData?.planeId === hoveredPlaneId) ||
        (hoveredWallFacetId && mesh.userData?.wallFacetId === hoveredWallFacetId);
      const baseHex = mesh.userData?.baseEmissiveHex || '#000000';
      const baseInt = mesh.userData?.baseEmissiveIntensity || 0;
      if (isHovered && baseInt === 0) {
        mat.emissive.set('#1d4ed8');
        mat.emissiveIntensity = 0.22;
      } else {
        mat.emissive.set(baseHex);
        mat.emissiveIntensity = baseInt;
      }
    });
    ctx.requestRender();
  }, [hoveredPlaneId, hoveredWallFacetId]);

  const hoveredPlane = useMemo(
    () => planes.find((p) => p.id === hoveredPlaneId) || null,
    [planes, hoveredPlaneId]
  );
  const hoveredWallFacet = useMemo(
    () => wallPlan?.facets.find((f) => f.id === hoveredWallFacetId) || null,
    [wallPlan, hoveredWallFacetId]
  );
  const badgePlane = hoveredPlane || (!hoveredWallFacet ? selectedPlane : null);
  const badgeWallFacet = hoveredWallFacet || (!hoveredPlane && !selectedPlane ? selectedWallFacet : null);

  return (
    <div className="relative w-full h-full flex-1 min-h-[360px] sm:min-h-[480px] rounded-2xl sm:rounded-3xl overflow-hidden bg-[#09101e] border border-slate-800 shadow-2xl select-none">
      {/* Dedicated Empty WebGL Canvas Container */}
      <div ref={mountRef} className="w-full h-full touch-none" />

      {/* Non-WebGL Graceful Fallback */}
      {webglError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#09101e] p-6 text-center z-20">
          <Box className="w-10 h-10 text-sky-400 mb-3" />
          <div className="text-sm font-extrabold text-white mb-1">3D Viewport Unavailable</div>
          <p className="text-xs text-slate-400 max-w-sm">{webglError}</p>
        </div>
      )}

      {/* Minimal Top-Left Viewport Identity & Active Face Readout (Zero Blur Over WebGL) */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none flex flex-col gap-1.5 max-w-[70%]">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#0b101d]/92 border border-slate-700/80 shadow-lg w-fit">
          <Box className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="text-xs font-extrabold text-white tracking-tight">
            {allLevels.length > 1 ? `${allLevels.length}-Tier 3D Model` : 'Architectural 3D Studio'}
          </span>
          <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
            · {activeSwatch.name}
          </span>
        </div>

        {badgePlane && (
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#0b101d]/92 border border-sky-500/40 text-[11px] font-bold text-slate-100 shadow-md w-fit">
            <span
              className="w-2.5 h-2.5 rounded-xs shrink-0"
              style={{ backgroundColor: badgePlane.color || '#3b82f6' }}
            />
            <span className="truncate">
              Area {badgePlane.code} · {badgePlane.name} ({badgePlane.pitchDeg}° ·{' '}
              {(badgePlane.slopeLength || 0).toFixed(2)}m)
            </span>
          </div>
        )}

        {badgeWallFacet && (() => {
          const wallMeta = getWallCladdingMeta(badgeWallFacet.claddingType);
          const metrics = computeWallFacetMetrics(badgeWallFacet);
          const regionLabel =
            badgeWallFacet.regions && badgeWallFacet.regions.length > 0
              ? `${badgeWallFacet.regions.length} zones`
              : wallMeta.shortLabel;
          return (
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#0b101d]/92 border border-amber-500/45 text-[11px] font-bold text-slate-100 shadow-md w-fit tabular-nums">
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0 border border-white/25"
                style={{ backgroundColor: wallMeta.hex }}
              />
              <span className="truncate">
                Wall {badgeWallFacet.code} · {badgeWallFacet.lengthM.toFixed(2)}×{badgeWallFacet.heightM.toFixed(2)}m · {regionLabel} · {metrics.netCladdingAreaM2.toFixed(1)} m² net
              </span>
            </div>
          );
        })()}
      </div>

      {/* Top-Right Compass Rose */}
      <div
        className="absolute top-3 right-3 z-10 pointer-events-none w-12 h-12 rounded-full bg-[#0b101d]/92 border border-slate-700/80 shadow-lg flex items-center justify-center"
        title="True North Orientation"
      >
        <svg viewBox="-24 -24 48 48" className="w-10 h-10">
          <g transform={`rotate(${compassDeg})`}>
            <polygon points="0,-18 4,-3 -4,-3" fill="#ef4444" />
            <polygon points="0,18 4,3 -4,3" fill="#64748b" />
            <circle r="2.2" fill="#f8fafc" />
            <text
              x="0"
              y="-8"
              textAnchor="middle"
              fill="#f87171"
              fontSize="7"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              N
            </text>
          </g>
        </svg>
      </div>

      {/* Collapsible Bottom Studio Control Dock (Zero Side Card Clutter) */}
      <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-col items-center pointer-events-none">
        <div className="pointer-events-auto max-w-3xl w-full sm:w-auto bg-[#0b101d]/95 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden">
          {/* Compact Primary Strip */}
          <div className="px-2.5 py-1.5 flex items-center justify-between gap-1.5 flex-wrap">
            {/* Camera Presets */}
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'iso', label: 'Iso' },
                  { id: 'top', label: 'Top' },
                  { id: 'north', label: 'N' },
                  { id: 'east', label: 'E' },
                  { id: 'south', label: 'S' },
                  { id: 'west', label: 'W' }
                ] as const
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => sceneCtxRef.current?.applyCameraPreset(cam.id)}
                  className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[11px] font-bold text-slate-200 hover:text-white cursor-pointer transition-colors"
                >
                  {cam.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => sceneCtxRef.current?.applyCameraPreset('iso')}
                className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white cursor-pointer"
                title="Reset View"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Shading & Turntable + Dock Collapse Toggle */}
            <div className="flex items-center gap-1">
              <div className="flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800">
                {(
                  [
                    { id: 'studio_finish', label: 'Shaded' },
                    { id: 'facet_zones', label: 'Faces' },
                    { id: 'wireframe', label: 'CAD' }
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setShadingMode(mode.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-extrabold cursor-pointer transition-colors ${
                      shadingMode === mode.id
                        ? 'bg-sky-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsAutoRotating((v) => !v)}
                className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                  isAutoRotating
                    ? 'bg-purple-600 border-purple-500 text-white'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                <Rotate3d className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Spin</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDockOpen((v) => !v)}
                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-sky-300 flex items-center gap-1 cursor-pointer"
                title="Toggle Material & Layer Studio Controls"
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Studio</span>
                {isDockOpen ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronUp className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>

          {/* Expandable Architectural Materials & Lighting Controls */}
          {isDockOpen && (
            <div className="px-3 py-2 border-t border-slate-800 bg-slate-950/75 flex flex-wrap items-center justify-between gap-2.5 text-[11px]">
              {/* Profile Selector */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-mono uppercase text-slate-500 font-bold mr-0.5">
                  Profile
                </span>
                {(
                  [
                    { id: 'corrugate', label: 'Corrugate' },
                    { id: 'trapezoidal', label: '5-Rib' },
                    { id: 'standing_seam', label: 'Standing Seam' }
                  ] as const
                ).map((prof) => (
                  <button
                    key={prof.id}
                    type="button"
                    onClick={() => setProfileKey(prof.id)}
                    className={`px-2 py-1 rounded-lg font-bold border cursor-pointer transition-colors ${
                      profileKey === prof.id
                        ? 'bg-blue-600/25 border-blue-500/60 text-blue-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {prof.label}
                  </button>
                ))}
              </div>

              {/* Colorsteel Coil Swatches */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono uppercase text-slate-500 font-bold">
                  Finish
                </span>
                <div className="flex items-center gap-1">
                  {COLORSTEEL_SWATCHES.map((sw) => (
                    <button
                      key={sw.id}
                      type="button"
                      onClick={() => {
                        setSwatchId(sw.id);
                        setShadingMode('studio_finish');
                      }}
                      title={sw.name}
                      aria-label={`Colorsteel ${sw.name}`}
                      className={`w-5 h-5 rounded-md border transition-transform cursor-pointer ${
                        swatchId === sw.id && shadingMode === 'studio_finish'
                          ? 'border-sky-400 scale-110 ring-1 ring-sky-400'
                          : 'border-slate-600 hover:scale-105'
                      }`}
                      style={{ backgroundColor: sw.hex }}
                    />
                  ))}
                </div>
              </div>

              {/* Layer & Sun Azimuth Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowFlashings((v) => !v)}
                  className={`px-2 py-1 rounded-lg font-bold border cursor-pointer ${
                    showFlashings
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  Flashings
                </button>
                <button
                  type="button"
                  onClick={() => setShowWalls((v) => !v)}
                  className={`px-2 py-1 rounded-lg font-bold border cursor-pointer ${
                    showWalls
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  Walls
                </button>
                <button
                  type="button"
                  onClick={() => setShowSheetSeams((v) => !v)}
                  className={`px-2 py-1 rounded-lg font-bold border cursor-pointer ${
                    showSheetSeams
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  Seams
                </button>
                {wallPlan && wallPlan.facets.length > 0 && showWalls && (
                  <div className="flex items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800">
                    {(
                      [
                        { id: 'all', label: 'All Walls' },
                        { id: 'undetailed', label: 'Needs Detail' },
                        { id: 'returns', label: 'Returns' }
                      ] as const
                    ).map((fOpt) => (
                      <button
                        key={fOpt.id}
                        type="button"
                        onClick={() => setActiveWallFilter(fOpt.id)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
                          activeWallFilter === fOpt.id
                            ? 'bg-amber-500 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {fOpt.label}
                      </button>
                    ))}
                  </div>
                )}

                <label className="flex items-center gap-1.5 text-slate-400 font-bold">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={sunAzimuthDeg}
                    onChange={(e) => setSunAzimuthDeg(Number(e.target.value))}
                    className="w-16 accent-amber-400 cursor-pointer"
                    aria-label="Sun Azimuth Angle"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
