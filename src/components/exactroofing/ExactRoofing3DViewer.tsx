import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Box,
  ChevronDown,
  ChevronUp,
  Layers,
  Moon,
  Rotate3d,
  RotateCcw,
  Sun,
  Sunset
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
  createWallCladdingTextureSet,
  ProceduralRoofTextureSet,
  resolveColorsteelSwatch,
  resolveProfileKey,
  Roof3DLightingMode,
  Roof3DProfileKey,
  Roof3DShadingMode,
  WallCladdingTextureSet
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

interface LightingPreset {
  skyBg: string;
  fogDensity: number;
  groundColor: string;
  gridOpacity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  keyColor: string;
  keyIntensity: number;
  rimColor: string;
  rimIntensity: number;
  envIntensity: number;
  exposure: number;
  contactOpacity: number;
  glassEmissiveColor: string;
  glassEmissiveIntensity: number;
}

const LIGHTING_PRESETS: Record<Roof3DLightingMode, LightingPreset> = {
  day: {
    skyBg: '#cad9e8',
    fogDensity: 0.0042,
    groundColor: '#bac6d4',
    gridOpacity: 0.38,
    hemiSky: '#f0f7ff',
    hemiGround: '#64748b',
    hemiIntensity: 0.96,
    keyColor: '#fff8ed',
    keyIntensity: 2.85,
    rimColor: '#bae6fd',
    rimIntensity: 0.72,
    envIntensity: 0.94,
    exposure: 1.04,
    contactOpacity: 0.56,
    glassEmissiveColor: '#000000',
    glassEmissiveIntensity: 0.0
  },
  dusk: {
    skyBg: '#1e273e',
    fogDensity: 0.0072,
    groundColor: '#161f32',
    gridOpacity: 0.42,
    hemiSky: '#fdba74',
    hemiGround: '#1e293b',
    hemiIntensity: 0.68,
    keyColor: '#ffedd5',
    keyIntensity: 1.95,
    rimColor: '#60a5fa',
    rimIntensity: 0.88,
    envIntensity: 0.56,
    exposure: 1.05,
    contactOpacity: 0.74,
    glassEmissiveColor: '#f59e0b',
    glassEmissiveIntensity: 0.34
  },
  night: {
    skyBg: '#060b16',
    fogDensity: 0.0092,
    groundColor: '#091222',
    gridOpacity: 0.48,
    hemiSky: '#436494',
    hemiGround: '#172236',
    hemiIntensity: 0.66,
    keyColor: '#bfdbfe',
    keyIntensity: 1.18,
    rimColor: '#60a5fa',
    rimIntensity: 0.86,
    envIntensity: 0.36,
    exposure: 1.0,
    contactOpacity: 0.82,
    glassEmissiveColor: '#fbbf24',
    glassEmissiveIntensity: 0.78
  }
};

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
  const [lightingMode, setLightingMode] = useState<Roof3DLightingMode>('day');
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
    glazingMaterials: THREE.MeshPhysicalMaterial[];
    builtDispose: (() => void) | null;
    profileTextures: ProceduralRoofTextureSet | null;
    wallTextures: WallCladdingTextureSet;
    isSoftwareGl: boolean;
    requestRender: () => void;
    applyCameraPreset: (preset: CameraPreset) => void;
    setLightingTarget: (mode: Roof3DLightingMode) => void;
    syncGlazingToCurrentLighting: (mats: THREE.MeshPhysicalMaterial[]) => void;
    setSpinActive: (active: boolean) => void;
  } | null>(null);

  const onSelectPlaneRef = useRef(onSelectPlane);
  onSelectPlaneRef.current = onSelectPlane;
  const onSelectWallFacetRef = useRef(onSelectWallFacet);
  onSelectWallFacetRef.current = onSelectWallFacet;
  const boundsRef = useRef(bounds);
  boundsRef.current = bounds;
  const allLevelsRef = useRef(allLevels);
  allLevelsRef.current = allLevels;
  const planesRef = useRef(planes);
  planesRef.current = planes;
  const wallPlanRef = useRef(wallPlan);
  wallPlanRef.current = wallPlan;

  // 1. Initialize Three.js WebGL Studio Renderer, Environment IBL, 3-Point Lights & Controls
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let isDisposed = false;
    let renderer: THREE.WebGLRenderer;

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
      // Proceed with default WebGL creation attempt
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
    const getTargetDpr = () =>
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);

    const initPreset = LIGHTING_PRESETS.day;

    renderer.setPixelRatio(getTargetDpr());
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = initPreset.exposure;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(initPreset.skyBg);
    scene.background = bgColor.clone();
    const sceneFog = new THREE.FogExp2(initPreset.skyBg, initPreset.fogDensity);
    scene.fog = sceneFog;

    // PMREM Studio RoomEnvironment for crisp metallic PBR reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = initPreset.envIntensity;
    roomEnv.dispose();
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.15, 280);
    const targetY = Math.max(1.2, bounds.midZ * 0.72);
    const distInit = Math.max(15, bounds.span * 1.48);
    camera.position.set(distInit * 0.72, distInit * 0.62, distInit * 0.78);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, targetY, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.065;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minDistance = 4;
    controls.maxDistance = 95;
    controls.rotateSpeed = 0.85;
    controls.zoomSpeed = 0.95;
    controls.panSpeed = 0.75;
    controls.update();

    // 3-Point Architectural Lighting Rig
    const hemiLight = new THREE.HemisphereLight(
      initPreset.hemiSky,
      initPreset.hemiGround,
      initPreset.hemiIntensity
    );
    hemiLight.position.set(0, 32, 0);
    scene.add(hemiLight);

    const shadowMapRes = isMobile ? 1024 : 2048;
    const keyLight = new THREE.DirectionalLight(initPreset.keyColor, initPreset.keyIntensity);
    keyLight.position.set(18, 26, 16);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(shadowMapRes, shadowMapRes);
    keyLight.shadow.bias = -0.00025;
    keyLight.shadow.normalBias = 0.025;
    keyLight.shadow.radius = isMobile ? 2.4 : 3.2;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const rimLight = new THREE.DirectionalLight(initPreset.rimColor, initPreset.rimIntensity);
    rimLight.position.set(-18, 12, -20);
    scene.add(rimLight);

    // Architectural Stage Ground & Contact Shadow
    const groundMat = new THREE.MeshStandardMaterial({
      color: initPreset.groundColor,
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
      opacity: initPreset.contactOpacity
    });
    const groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), contactMat);
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.position.y = 0.002;
    scene.add(groundShadow);

    const groundGrid = new THREE.GridHelper(60, 30, 0x64748b, 0x94a3b8);
    groundGrid.position.y = 0.005;
    const gridMat = groundGrid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = initPreset.gridOpacity;
    scene.add(groundGrid);

    const roofContainer = new THREE.Group();
    scene.add(roofContainer);

    const wallTextures = createWallCladdingTextureSet(
      renderer.capabilities.getMaxAnisotropy()
    );

    // Mutable Lighting Transition State (smooth exponential damping)
    let targetLightingMode: Roof3DLightingMode = 'day';
    let lightingTransitionActive = false;
    let curHemiIntensity = initPreset.hemiIntensity;
    let curKeyIntensity = initPreset.keyIntensity;
    let curRimIntensity = initPreset.rimIntensity;
    let curEnvIntensity = initPreset.envIntensity;
    let curExposure = initPreset.exposure;
    let curFogDensity = initPreset.fogDensity;
    let curContactOpacity = initPreset.contactOpacity;
    let curGridOpacity = initPreset.gridOpacity;
    let curGlassEmissiveInt = initPreset.glassEmissiveIntensity;
    const curGlassEmissiveColor = new THREE.Color(initPreset.glassEmissiveColor);
    const tmpTargetColor = new THREE.Color();

    const syncGlazingToCurrentLighting = (mats: THREE.MeshPhysicalMaterial[]) => {
      mats.forEach((m) => {
        m.emissive.copy(curGlassEmissiveColor);
        m.emissiveIntensity = curGlassEmissiveInt;
      });
    };

    const stepLightingTransition = (dt: number): boolean => {
      const target = LIGHTING_PRESETS[targetLightingMode];
      const lambda = 6.8;
      const colorAlpha = 1 - Math.exp(-lambda * dt);

      curHemiIntensity = THREE.MathUtils.damp(curHemiIntensity, target.hemiIntensity, lambda, dt);
      curKeyIntensity = THREE.MathUtils.damp(curKeyIntensity, target.keyIntensity, lambda, dt);
      curRimIntensity = THREE.MathUtils.damp(curRimIntensity, target.rimIntensity, lambda, dt);
      curEnvIntensity = THREE.MathUtils.damp(curEnvIntensity, target.envIntensity, lambda, dt);
      curExposure = THREE.MathUtils.damp(curExposure, target.exposure, lambda, dt);
      curFogDensity = THREE.MathUtils.damp(curFogDensity, target.fogDensity, lambda, dt);
      curContactOpacity = THREE.MathUtils.damp(curContactOpacity, target.contactOpacity, lambda, dt);
      curGridOpacity = THREE.MathUtils.damp(curGridOpacity, target.gridOpacity, lambda, dt);
      curGlassEmissiveInt = THREE.MathUtils.damp(
        curGlassEmissiveInt,
        target.glassEmissiveIntensity,
        lambda,
        dt
      );

      hemiLight.intensity = curHemiIntensity;
      keyLight.intensity = curKeyIntensity;
      rimLight.intensity = curRimIntensity;
      scene.environmentIntensity = curEnvIntensity;
      renderer.toneMappingExposure = curExposure;
      sceneFog.density = curFogDensity;
      contactMat.opacity = curContactOpacity;
      gridMat.opacity = curGridOpacity;

      if (scene.background instanceof THREE.Color) {
        tmpTargetColor.set(target.skyBg);
        scene.background.lerp(tmpTargetColor, colorAlpha);
        sceneFog.color.copy(scene.background);
      }
      tmpTargetColor.set(target.groundColor);
      groundMat.color.lerp(tmpTargetColor, colorAlpha);

      tmpTargetColor.set(target.hemiSky);
      hemiLight.color.lerp(tmpTargetColor, colorAlpha);

      tmpTargetColor.set(target.hemiGround);
      hemiLight.groundColor.lerp(tmpTargetColor, colorAlpha);

      tmpTargetColor.set(target.keyColor);
      keyLight.color.lerp(tmpTargetColor, colorAlpha);

      tmpTargetColor.set(target.rimColor);
      rimLight.color.lerp(tmpTargetColor, colorAlpha);

      tmpTargetColor.set(target.glassEmissiveColor);
      curGlassEmissiveColor.lerp(tmpTargetColor, colorAlpha);

      const ctx = sceneCtxRef.current;
      if (ctx) {
        syncGlazingToCurrentLighting(ctx.glazingMaterials);
      }

      const maxDiff = Math.max(
        Math.abs(curKeyIntensity - target.keyIntensity),
        Math.abs(curHemiIntensity - target.hemiIntensity),
        Math.abs(curGlassEmissiveInt - target.glassEmissiveIntensity),
        Math.abs(curExposure - target.exposure),
        scene.background instanceof THREE.Color
          ? Math.abs(scene.background.r - tmpTargetColor.set(target.skyBg).r)
          : 0
      );

      if (maxDiff < 0.0025) {
        // Snap cleanly to final state and pause animation loop
        hemiLight.intensity = target.hemiIntensity;
        keyLight.intensity = target.keyIntensity;
        rimLight.intensity = target.rimIntensity;
        scene.environmentIntensity = target.envIntensity;
        renderer.toneMappingExposure = target.exposure;
        sceneFog.density = target.fogDensity;
        contactMat.opacity = target.contactOpacity;
        gridMat.opacity = target.gridOpacity;
        if (scene.background instanceof THREE.Color) {
          scene.background.set(target.skyBg);
          sceneFog.color.set(target.skyBg);
        }
        groundMat.color.set(target.groundColor);
        hemiLight.color.set(target.hemiSky);
        hemiLight.groundColor.set(target.hemiGround);
        keyLight.color.set(target.keyColor);
        rimLight.color.set(target.rimColor);
        curGlassEmissiveInt = target.glassEmissiveIntensity;
        curGlassEmissiveColor.set(target.glassEmissiveColor);
        if (ctx) {
          syncGlazingToCurrentLighting(ctx.glazingMaterials);
        }
        lightingTransitionActive = false;
        return false;
      }

      return true;
    };

    // Coalesced On-Demand Render Loop with Software-GL Pacing & Visibility Pause
    let rafId: number | null = null;
    let swTimerId: number | null = null;
    let renderQueued = false;
    let spinActive = false;
    let lastFrameMs = performance.now();

    const clearScheduled = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (swTimerId !== null) {
        window.clearTimeout(swTimerId);
        swTimerId = null;
      }
    };

    const flushFrame = (now: number) => {
      rafId = null;
      if (isDisposed || document.hidden) return;

      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameMs) / 1000));
      lastFrameMs = now;

      const az = Math.atan2(
        camera.position.x - controls.target.x,
        camera.position.z - controls.target.z
      );
      const deg = Math.round((az * 180) / Math.PI);
      setCompassDeg((prev) => (prev === deg ? prev : deg));

      const stillLighting = lightingTransitionActive ? stepLightingTransition(dt) : false;
      const needsDampingTick = controls.enableDamping && controls.update();

      const tDraw0 = isSoftwareGl ? performance.now() : 0;
      renderer.render(scene, camera);
      const drawDurationMs = isSoftwareGl ? performance.now() - tDraw0 : 0;

      if (renderQueued || needsDampingTick || spinActive || stillLighting) {
        renderQueued = false;
        if (isSoftwareGl && (spinActive || stillLighting)) {
          // Gentle pacing after software draw so CPU WebGL never starves UI
          swTimerId = window.setTimeout(() => {
            swTimerId = null;
            scheduleFrame();
          }, Math.max(18, Math.min(90, Math.round(drawDurationMs * 1.35))));
        } else {
          scheduleFrame();
        }
      }
    };

    const scheduleFrame = () => {
      if (isDisposed || document.hidden || rafId !== null || swTimerId !== null) return;
      rafId = requestAnimationFrame(flushFrame);
    };

    const requestRender = () => {
      renderQueued = true;
      scheduleFrame();
    };

    controls.addEventListener('change', requestRender);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearScheduled();
      } else {
        lastFrameMs = performance.now();
        if (spinActive || lightingTransitionActive || renderQueued) {
          requestRender();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Camera Presets (uses current ref bounds including WallPlan footprint)
    const applyCameraPreset = (preset: CameraPreset) => {
      const b = computeRoof3DBounds(
        allLevelsRef.current,
        planesRef.current,
        wallPlanRef.current
      );
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
      glazingMaterials: [],
      builtDispose: null,
      profileTextures: null,
      wallTextures,
      isSoftwareGl,
      requestRender,
      applyCameraPreset,
      setLightingTarget: (mode: Roof3DLightingMode) => {
        targetLightingMode = mode;
        lightingTransitionActive = true;
        lastFrameMs = performance.now();
        requestRender();
      },
      syncGlazingToCurrentLighting,
      setSpinActive: (active: boolean) => {
        spinActive = active;
        controls.autoRotate = active && !isSoftwareGl;
        controls.autoRotateSpeed = 1.65;
        if (active) requestRender();
      }
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
      renderer.setPixelRatio(getTargetDpr());
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    // WebGL Context Loss safety
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      clearScheduled();
    };
    const handleContextRestored = () => {
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    requestRender();

    return () => {
      isDisposed = true;
      clearScheduled();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
      wallTextures.dispose();
      shadowTex.dispose();
      contactMat.dispose();
      groundMat.dispose();
      groundMesh.geometry.dispose();
      groundShadow.geometry.dispose();
      groundGrid.dispose();
      envTarget.dispose();
      renderer.dispose();
      sceneCtxRef.current = null;
    };
    // Intentionally initialize renderer once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Sync Auto-Spin State
  useEffect(() => {
    sceneCtxRef.current?.setSpinActive(isAutoRotating);
  }, [isAutoRotating]);

  // 3. Smoothly cross-fade Day / Dusk / Night Lighting Studio
  useEffect(() => {
    sceneCtxRef.current?.setLightingTarget(lightingMode);
  }, [lightingMode]);

  // 4. Rebuild Procedural Profile Textures when profile switches
  useEffect(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;
    ctx.profileTextures?.dispose();
    ctx.profileTextures = createProfileTextureSet(
      profileKey,
      ctx.renderer.capabilities.getMaxAnisotropy()
    );
  }, [profileKey]);

  // 5. Rebuild 3D Roof Scene Geometry cleanly whenever roof model / materials change
  useEffect(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;

    if (!ctx.profileTextures) {
      ctx.profileTextures = createProfileTextureSet(
        profileKey,
        ctx.renderer.capabilities.getMaxAnisotropy()
      );
    }

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
      wallTextures: ctx.wallTextures,
      showFlashings,
      showWalls,
      showSheetSeams,
      isSoftwareGl: ctx.isSoftwareGl
    });

    ctx.roofContainer.add(built.rootGroup);
    ctx.selectableMeshes = built.selectableMeshes;
    ctx.planeMeshById = built.planeMeshById;
    ctx.glazingMaterials = built.glazingMaterials;
    ctx.syncGlazingToCurrentLighting(built.glazingMaterials);
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

  // 6. Update Sun / Moon Key Light Angle smoothly without rebuilding geometry
  useEffect(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;
    const rad = (sunAzimuthDeg * Math.PI) / 180;
    const radius = Math.max(22, bounds.span * 1.8);
    const elevScale = lightingMode === 'dusk' ? 0.92 : lightingMode === 'night' ? 1.45 : 1.65;
    ctx.keyLight.position.set(
      Math.cos(rad) * radius,
      Math.max(14, bounds.span * elevScale),
      Math.sin(rad) * radius
    );
    ctx.requestRender();
  }, [sunAzimuthDeg, bounds.span, lightingMode]);

  // 7. Lightweight Hover Highlight Lift (mutates material emissive without rebuilding meshes)
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
  const badgeWallFacet =
    hoveredWallFacet || (!hoveredPlane && !selectedPlane ? selectedWallFacet : null);

  return (
    <div className="relative w-full h-full flex-1 min-h-[360px] sm:min-h-[480px] rounded-2xl sm:rounded-3xl overflow-hidden bg-[#cad9e8] border border-slate-800 shadow-2xl select-none">
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
        <div className="pointer-events-auto max-w-4xl w-full sm:w-auto bg-[#0b101d]/95 border border-slate-700/90 rounded-2xl shadow-2xl overflow-hidden">
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

            {/* Day/Dusk/Night, Shading, Spin & Studio Drawer Toggle */}
            <div className="flex items-center gap-1 flex-wrap">
              <div
                className="flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800"
                role="group"
                aria-label="Scene Lighting Mode"
              >
                {(
                  [
                    { id: 'day', label: 'Day', Icon: Sun },
                    { id: 'dusk', label: 'Dusk', Icon: Sunset },
                    { id: 'night', label: 'Night', Icon: Moon }
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setLightingMode(id)}
                    aria-pressed={lightingMode === id}
                    className={`px-2 py-1 rounded-md text-[11px] font-extrabold flex items-center gap-1 cursor-pointer transition-colors ${
                      lightingMode === id
                        ? id === 'day'
                          ? 'bg-amber-400 text-slate-950'
                          : id === 'dusk'
                          ? 'bg-orange-500 text-white'
                          : 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>

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

              {/* Layer & Sun/Moon Azimuth Controls */}
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
                  <div className="flex flex-wrap items-center p-0.5 rounded-lg bg-slate-900 border border-slate-800 gap-0.5">
                    {(
                      [
                        { id: 'all', label: 'All Walls' },
                        { id: 'undetailed', label: 'Needs Detail' },
                        { id: 'returns', label: 'Returns' },
                        { id: 'parapets', label: 'Parapets' },
                        { id: 'secondary', label: 'Secondary' },
                        { id: 'wings', label: 'Wings' }
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
                  {lightingMode === 'night' ? (
                    <Moon className="w-3.5 h-3.5 text-sky-300" />
                  ) : (
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                  )}
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={sunAzimuthDeg}
                    onChange={(e) => setSunAzimuthDeg(Number(e.target.value))}
                    className="w-16 accent-amber-400 cursor-pointer"
                    aria-label="Sun or Moon Azimuth Angle"
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
