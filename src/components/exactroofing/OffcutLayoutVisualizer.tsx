import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  FaceRoofingPack,
  LayoutResult,
  RoofBomSheetCutDetail,
  RoofInstallProgress,
  RoofLifecycleStage,
  RoofPlane,
  SectionSummary,
  SheetOrderComparisonSummary,
  SheetOrderMode
} from '../../types/exactRoofing';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Download,
  FileSpreadsheet,
  Layers,
  ListOrdered,
  Lock,
  MapPin,
  Package,
  RotateCcw,
  RotateCw,
  Settings,
  Shield,
  Sparkles,
  X
} from 'lucide-react';
import { useDeviceDetection } from '../../hooks/useDeviceDetection';

interface Props {
  layout: LayoutResult;
  planes: RoofPlane[];
  selectedPlaneId: string | null;
  onSelectPlane: (planeId: string | null) => void;
  projectName?: string;
  siteAddress?: string;
  roofProfileLabel?: string;
  coilColorLabel?: string;
  windZoneLabel?: string;
  onRegenerateLayout?: () => void;
  onOpenPlaneEditor?: (plane: RoofPlane) => void;
  startPlaneId?: string | null;
  onSetStartPlane?: (planeId: string) => void;
  lifecycleStage?: RoofLifecycleStage;
  measureLocked?: boolean;
  roofingPacks?: FaceRoofingPack[];
  installProgress?: RoofInstallProgress;
  onUpdateInstallProgress?: (next: RoofInstallProgress) => void;
  sheetOrderMode?: SheetOrderMode;
  onChangeSheetOrderMode?: (mode: SheetOrderMode) => void;
  sheetOrderComparison?: SheetOrderComparisonSummary;
}

export const OffcutLayoutVisualizer: React.FC<Props> = ({
  layout,
  planes,
  selectedPlaneId,
  onSelectPlane,
  projectName = 'L-Shape Hip & Valley',
  siteAddress,
  roofProfileLabel,
  coilColorLabel,
  windZoneLabel,
  onRegenerateLayout,
  onOpenPlaneEditor,
  startPlaneId,
  lifecycleStage = 'measuring',
  measureLocked = false,
  roofingPacks = [],
  installProgress,
  onUpdateInstallProgress,
  sheetOrderMode,
  onChangeSheetOrderMode,
  sheetOrderComparison
}) => {
  // Toggle chips state
  const [showLengths, setShowLengths] = useState<boolean>(true);
  const [showPitch, setShowPitch] = useState<boolean>(false);
  const [showOffcutLinks, setShowOffcutLinks] = useState<boolean>(true);
  const [showPurlins, setShowPurlins] = useState<boolean>(false);

  // Roll-former Cut List Drawer / Slide-up
  const [showCutListDrawer, setShowCutListDrawer] = useState<boolean>(false);

  // Settings modal & Mobile pop-out menus
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [coverWidthMm, setCoverWidthMm] = useState<number>(762);
  const [symmetricProfile, setSymmetricProfile] = useState<boolean>(false);
  const [maxBlankLengthM, setMaxBlankLengthM] = useState<number>(6.0);
  const [eaveOverhangMm, setEaveOverhangMm] = useState<number>(50);

  const [isMobileStatsOpen, setIsMobileStatsOpen] = useState<boolean>(false);
  const [isMobileLayersOpen, setIsMobileLayersOpen] = useState<boolean>(false);
  const [showMobilePacksSheet, setShowMobilePacksSheet] = useState<boolean>(false);
  const [expandedGroupMm, setExpandedGroupMm] = useState<number | null>(null);
  const { isMobile } = useDeviceDetection();
  const activeOrderMode: SheetOrderMode = sheetOrderMode ?? layout.sheetOrderMode ?? 'practical';

  // Dynamic ResizeObserver so mobile portrait screen fills edge-to-edge without letterboxing
  const svgViewportRef = useRef<HTMLDivElement>(null);
  const [vpSize, setVpSize] = useState<{ w: number; h: number }>({ w: 860, h: 540 });
  useEffect(() => {
    const el = svgViewportRef.current;
    if (!el) return;
    const syncSize = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 80 && r.height > 80) {
        setVpSize((prev) =>
          Math.abs(prev.w - r.width) > 4 || Math.abs(prev.h - r.height) > 4
            ? { w: Math.round(r.width), h: Math.round(r.height) }
            : prev
        );
      }
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile]);

  // Resolved effective planes (includes pitch breaks + dormer slopes + aperture metadata)
  const displayPlanes = useMemo(() => {
    return layout.effectivePlanes && layout.effectivePlanes.length > 0
      ? layout.effectivePlanes
      : planes;
  }, [layout.effectivePlanes, planes]);

  // Calculate SVG bounds for the sections plan
  const bounds = useMemo(() => {
    const allPolys = displayPlanes.map((p) => p.planPolygon).flat();
    if (allPolys.length === 0) {
      return { minX: 0, maxX: 16, minY: 0, maxY: 12, width: 16, height: 12 };
    }
    const xs = allPolys.map((p) => p.x);
    const ys = allPolys.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(maxX - minX, 2);
    const height = Math.max(maxY - minY, 2);
    return { minX, maxX, minY, maxY, width, height };
  }, [displayPlanes]);

  const padding = isMobile ? 28 : 70;
  const svgWidth = isMobile ? vpSize.w : 860;
  const svgHeight = isMobile ? vpSize.h : 540;
  const drawWidth = Math.max(80, svgWidth - padding * 2);
  const drawHeight = Math.max(80, svgHeight - padding * 2);
  const scale = Math.min(drawWidth / bounds.width, drawHeight / bounds.height);

  const offsetX = padding + (drawWidth - bounds.width * scale) / 2;
  const offsetY = padding + (drawHeight - bounds.height * scale) / 2;
  const toSvgX = (x: number) => offsetX + (x - bounds.minX) * scale;
  const toSvgY = (y: number) => offsetY + (y - bounds.minY) * scale;

  // Selected plane object
  const selectedPlane = useMemo(() => {
    return displayPlanes.find((p) => p.id === selectedPlaneId) || null;
  }, [displayPlanes, selectedPlaneId]);

  const selectedSectionSummary = useMemo(() => {
    return layout.sections.find((s) => s.planeId === selectedPlaneId) || null;
  }, [layout.sections, selectedPlaneId]);

  // Effective Start Plane (User-selected or auto-determined longest straight eave)
  const effectiveStartPlaneId = useMemo(() => {
    return (
      startPlaneId ||
      layout.startPlaneId ||
      displayPlanes.find((p) => p.isStartEdge)?.id ||
      displayPlanes[0]?.id ||
      null
    );
  }, [startPlaneId, layout.startPlaneId, displayPlanes]);

  // Crew face renumbering toggle in Installing stage
  const [isNumberingSequence, setIsNumberingSequence] = useState<boolean>(false);
  const [cutListFilterPlaneId, setCutListFilterPlaneId] = useState<string | null>(null);

  // Ordered planes: use roofingPacks order if available (reflects crew custom lay numbering), else engine order
  const orderedPlanes = useMemo(() => {
    if (roofingPacks.length > 0) {
      const packOrder = new Map(roofingPacks.map((pk, idx) => [pk.planeId, idx]));
      return [...displayPlanes].sort((a, b) => {
        const pa = packOrder.get(a.id) ?? 999;
        const pb = packOrder.get(b.id) ?? 999;
        return pa - pb;
      });
    }
    if (layout.installationSequence && layout.installationSequence.length > 0) {
      const seqMap = new Map(
        layout.installationSequence.map((s, idx) => [s.planeId, s.sequenceIndex ?? s.stepNumber ?? idx + 1])
      );
      return [...displayPlanes].sort((a, b) => {
        const sa = seqMap.get(a.id) ?? 999;
        const sb = seqMap.get(b.id) ?? 999;
        return sa - sb;
      });
    }
    return [...displayPlanes].sort((a, b) => (a.sequenceIndex || 1) - (b.sequenceIndex || 1));
  }, [displayPlanes, layout.installationSequence, roofingPacks]);

  const sequenceMap = useMemo(() => {
    const map = new Map<string, number>();
    orderedPlanes.forEach((p, idx) => {
      map.set(p.id, idx + 1);
    });
    return map;
  }, [orderedPlanes]);

  const completedSet = useMemo(
    () => new Set(installProgress?.completedPlaneIds || []),
    [installProgress?.completedPlaneIds]
  );
  const stagedSet = useMemo(
    () => new Set(installProgress?.stagedPlaneIds || []),
    [installProgress?.stagedPlaneIds]
  );
  const completedPiecesSet = useMemo(
    () => new Set(installProgress?.completedPieceIds || []),
    [installProgress?.completedPieceIds]
  );

  const handleAssignNumberTap = (planeId: string) => {
    if (!onUpdateInstallProgress) {
      onSelectPlane(planeId);
      return;
    }
    const baseOrder = orderedPlanes.map((p) => p.id);
    if (isNumberingSequence) {
      // Tap faces one by one to set actual 1, 2, 3... laying sequence:
      // Maintain user-picked prefix (`pickedIds`), pushing newly tapped face to end of picked prefix
      const currentPicked = installProgress?.customSequencePlaneIds || [];
      const nextPicked = currentPicked.includes(planeId)
        ? currentPicked
        : [...currentPicked, planeId];
      const remainder = baseOrder.filter((id) => !nextPicked.includes(id));
      const fullOrder = [...nextPicked, ...remainder];
      onUpdateInstallProgress({
        customSequencePlaneIds: nextPicked.length === baseOrder.length ? fullOrder : nextPicked,
        stagedPlaneIds: installProgress?.stagedPlaneIds || [],
        completedPlaneIds: installProgress?.completedPlaneIds || [],
        completedPieceIds: installProgress?.completedPieceIds || [],
        lastUpdatedAt: new Date().toISOString()
      });
      if (nextPicked.length >= baseOrder.length) {
        setIsNumberingSequence(false);
      }
    }
    onSelectPlane(planeId);
  };

  const handleMovePackOrder = (planeId: string, delta: -1 | 1) => {
    if (!onUpdateInstallProgress) return;
    const ids = orderedPlanes.map((p) => p.id);
    const idx = ids.indexOf(planeId);
    const swapIdx = idx + delta;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ids.length) return;
    const nextIds = [...ids];
    [nextIds[idx], nextIds[swapIdx]] = [nextIds[swapIdx], nextIds[idx]];
    onUpdateInstallProgress({
      customSequencePlaneIds: nextIds,
      stagedPlaneIds: installProgress?.stagedPlaneIds || [],
      completedPlaneIds: installProgress?.completedPlaneIds || [],
      completedPieceIds: installProgress?.completedPieceIds || [],
      lastUpdatedAt: new Date().toISOString()
    });
  };

  const handleResetPackOrder = () => {
    if (!onUpdateInstallProgress) return;
    setIsNumberingSequence(false);
    onUpdateInstallProgress({
      customSequencePlaneIds: [],
      stagedPlaneIds: installProgress?.stagedPlaneIds || [],
      completedPlaneIds: installProgress?.completedPlaneIds || [],
      completedPieceIds: installProgress?.completedPieceIds || [],
      lastUpdatedAt: new Date().toISOString()
    });
  };

  const handleTogglePlaneStaged = (planeId: string) => {
    if (!onUpdateInstallProgress) return;
    const cur = installProgress?.stagedPlaneIds || [];
    const next = cur.includes(planeId) ? cur.filter((id) => id !== planeId) : [...cur, planeId];
    onUpdateInstallProgress({
      customSequencePlaneIds: installProgress?.customSequencePlaneIds || [],
      stagedPlaneIds: next,
      completedPlaneIds: installProgress?.completedPlaneIds || [],
      completedPieceIds: installProgress?.completedPieceIds || [],
      lastUpdatedAt: new Date().toISOString()
    });
  };

  const handleTogglePlaneInstalled = (planeId: string) => {
    if (!onUpdateInstallProgress) return;
    const curComp = installProgress?.completedPlaneIds || [];
    const nextComp = curComp.includes(planeId)
      ? curComp.filter((id) => id !== planeId)
      : [...curComp, planeId];
    onUpdateInstallProgress({
      customSequencePlaneIds: installProgress?.customSequencePlaneIds || [],
      stagedPlaneIds: installProgress?.stagedPlaneIds || [],
      completedPlaneIds: nextComp,
      completedPieceIds: installProgress?.completedPieceIds || [],
      lastUpdatedAt: new Date().toISOString()
    });
  };

  const handleTogglePieceDone = (pieceId: string) => {
    if (!onUpdateInstallProgress) return;
    const cur = installProgress?.completedPieceIds || [];
    const next = cur.includes(pieceId) ? cur.filter((id) => id !== pieceId) : [...cur, pieceId];
    onUpdateInstallProgress({
      customSequencePlaneIds: installProgress?.customSequencePlaneIds || [],
      stagedPlaneIds: installProgress?.stagedPlaneIds || [],
      completedPlaneIds: installProgress?.completedPlaneIds || [],
      completedPieceIds: next,
      lastUpdatedAt: new Date().toISOString()
    });
  };

  const sectionById = useMemo(() => {
    const map = new Map<string, SectionSummary>();
    layout.sections.forEach((s) => map.set(s.planeId, s));
    return map;
  }, [layout.sections]);

  // Honest per-face ordered blanks (from layout.parents) separated from repressed offcuts & piece cuts
  const faceSheetSummaryByPlaneId = useMemo(() => {
    const map = new Map<
      string,
      {
        totalPieces: number;
        freshCount: number;
        offcutCount: number;
        orderedCount: number;
        orderedLm: number;
        lengthGroups: { count: number; lengthM: number; lengthMm: number; totalLm: number; isOffcutOnly: boolean }[];
        qtyLengthShort: string;
        offcutShort: string;
      }
    >();

    const parentsByPrimaryPlane = new Map<string, typeof layout.parents>();
    layout.parents.forEach((par) => {
      const primary = par.pieces[0];
      if (!primary) return;
      const pid = primary.targetPlaneId;
      const list = parentsByPrimaryPlane.get(pid) || [];
      list.push(par);
      parentsByPrimaryPlane.set(pid, list);
      const basePid = pid.split('__')[0];
      if (basePid !== pid) {
        const bList = parentsByPrimaryPlane.get(basePid) || [];
        bList.push(par);
        parentsByPrimaryPlane.set(basePid, bList);
      }
    });

    displayPlanes.forEach((plane) => {
      const baseId = plane.id.split('__')[0];
      const placementEntry =
        layout.placementMap.find((pm) => pm.planeId === plane.id) ||
        layout.placementMap.find((pm) => pm.planeId === baseId);
      const pack =
        roofingPacks.find((pk) => pk.planeId === plane.id) ||
        roofingPacks.find((pk) => pk.planeId === baseId);
      const sec = sectionById.get(plane.id) || sectionById.get(baseId);

      const pieces = placementEntry?.pieces || [];
      const faceParents = parentsByPrimaryPlane.get(plane.id) || parentsByPrimaryPlane.get(baseId) || [];
      const bucketMap = new Map<number, { count: number; lengthM: number }>();

      faceParents.forEach((par) => {
        const exactMm = Math.max(100, Math.round((par.length || 0) * 1000));
        const existing = bucketMap.get(exactMm) || {
          count: 0,
          lengthM: +(exactMm / 1000).toFixed(3)
        };
        existing.count += 1;
        bucketMap.set(exactMm, existing);
      });

      let lengthGroups = Array.from(bucketMap.entries())
        .map(([lengthMm, val]) => ({
          lengthMm,
          lengthM: val.lengthM,
          count: val.count,
          totalLm: +(val.count * val.lengthM).toFixed(3),
          isOffcutOnly: false
        }))
        .sort((a, b) => b.lengthMm - a.lengthMm);

      if (lengthGroups.length === 0 && pack?.freshLengthGroups?.length) {
        lengthGroups = pack.freshLengthGroups.map((g) => ({
          lengthMm: g.lengthMm,
          lengthM: +g.lengthM.toFixed(3),
          count: g.count,
          totalLm: +(g.count * g.lengthM).toFixed(3),
          isOffcutOnly: false
        }));
      }

      const orderedCount = lengthGroups.reduce((s, g) => s + g.count, 0);
      const orderedLm = +lengthGroups.reduce((s, g) => s + g.count * g.lengthM, 0).toFixed(2);
      const totalPieces =
        pieces.length > 0
          ? pieces.length
          : pack?.totalPiecesNeeded || sec?.sheetCount || 0;
      const offcutCount =
        pieces.length > 0
          ? pieces.filter((pc) => pc.isOffcut).length
          : pack?.offcutsReceived.reduce((s, r) => s + r.count, 0) || sec?.offcutsReused || 0;
      const freshCount = orderedCount > 0 ? orderedCount : Math.max(0, totalPieces - offcutCount);

      const fmtM = (mm: number, m: number) => (mm % 10 !== 0 ? m.toFixed(3) : m.toFixed(2));
      let qtyLengthShort = '';
      if (lengthGroups.length === 1 && orderedCount > 0) {
        qtyLengthShort = `${orderedCount}×${fmtM(lengthGroups[0].lengthMm, lengthGroups[0].lengthM)}m`;
      } else if (lengthGroups.length > 1 && orderedCount > 0) {
        qtyLengthShort = `${orderedCount} sht · ${orderedLm.toFixed(1)}m`;
      } else if (totalPieces > 0 && orderedCount === 0 && offcutCount > 0) {
        qtyLengthShort = `${offcutCount} offcuts`;
      } else if (totalPieces > 0 && (sec?.slopeLengthM || plane.orderedSheetLengthM || plane.slopeLength)) {
        const len = plane.orderedSheetLengthM || sec?.slopeLengthM || plane.slopeLength || 0;
        const mm = Math.round(len * 1000);
        qtyLengthShort = `${totalPieces}×${fmtM(mm, len)}m`;
      }

      map.set(plane.id, {
        totalPieces,
        freshCount,
        offcutCount,
        orderedCount,
        orderedLm,
        lengthGroups,
        qtyLengthShort,
        offcutShort: orderedCount > 0 && offcutCount > 0 ? `+${offcutCount} off` : ''
      });
    });

    return map;
  }, [displayPlanes, layout.parents, layout.placementMap, roofingPacks, sectionById]);

  // Exact reconciled mill order groups directly from layout.parents
  const orderedSheetGroups = useMemo(() => {
    const planeCodeMap = new Map<string, { code: string; name: string }>();
    displayPlanes.forEach((pl) => planeCodeMap.set(pl.id, { code: pl.code || pl.id, name: pl.name || pl.code }));

    const gMap = new Map<
      number,
      {
        lengthMm: number;
        lengthM: number;
        count: number;
        totalLm: number;
        repressedCount: number;
        cutDetailMap: Map<string, RoofBomSheetCutDetail>;
      }
    >();
    layout.parents.forEach((par) => {
      const lengthMm = Math.max(100, Math.round((par.length || 0) * 1000));
      const lengthM = +(lengthMm / 1000).toFixed(3);
      const cur = gMap.get(lengthMm) || {
        lengthMm,
        lengthM,
        count: 0,
        totalLm: 0,
        repressedCount: 0,
        cutDetailMap: new Map<string, RoofBomSheetCutDetail>()
      };
      cur.count += 1;
      cur.totalLm = +(cur.count * lengthM).toFixed(3);
      cur.repressedCount += Math.max(0, par.pieces.length - 1);
      par.pieces.forEach((pc) => {
        const meta = planeCodeMap.get(pc.targetPlaneId);
        const faceCode = meta?.code || pc.targetPlaneId;
        const faceName = pc.facetName || meta?.name || faceCode;
        const requiredCutMm = Math.max(100, Math.round(pc.length * 1000));
        const key = `${faceCode}::${requiredCutMm}`;
        const prev = cur.cutDetailMap.get(key);
        if (prev) {
          prev.qty += 1;
        } else {
          cur.cutDetailMap.set(key, { faceCode, faceName, requiredCutMm, qty: 1 });
        }
      });
      gMap.set(lengthMm, cur);
    });
    return Array.from(gMap.values())
      .map((g) => ({
        lengthMm: g.lengthMm,
        lengthM: g.lengthM,
        count: g.count,
        totalLm: g.totalLm,
        repressedCount: g.repressedCount,
        cutDetails: Array.from(g.cutDetailMap.values()).sort(
          (a, b) => b.requiredCutMm - a.requiredCutMm || a.faceCode.localeCompare(b.faceCode)
        )
      }))
      .sort((a, b) => b.lengthMm - a.lengthMm);
  }, [layout.parents, displayPlanes]);

  const reconciledTotalOrderedLm = useMemo(() => {
    const totalMm = orderedSheetGroups.reduce((s, g) => s + g.count * g.lengthMm, 0);
    return +(totalMm / 1000).toFixed(3);
  }, [orderedSheetGroups]);

  // CSV Export for Roll-Former
  const handleExportCsv = () => {
    const headers = [
      'Parent Stock Sheet #',
      'Ordered Blank Length (m)',
      'Remaining Drop (m)',
      'Yield / Utilisation (%)',
      'Cut Pieces Breakdown',
      'Laying Notes'
    ];

    const rows = layout.parents.map((sheet) => {
      const piecesStr = sheet.pieces
        .map((p) => `${p.facetName} col ${p.colIndex}: ${p.length.toFixed(2)}m (${p.orientation})`)
        .join('; ');

      const notes =
        sheet.pieces
          .filter((p) => p.orientation === 'flipped180')
          .map((p) => `Flipped into ${p.facetName}`)
          .join(', ') || 'Direct run';

      return [
        `Sheet #${sheet.sheetNumber}`,
        sheet.length.toFixed(3),
        sheet.remaining.toFixed(3),
        `${sheet.utilization}%`,
        `"${piecesStr}"`,
        `"${notes}"`
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `ApexMap_RollFormer_CutList_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper: Compute clean outward offset eave arrow geometry showing laying progression (entry -> exit)
  const computeEaveArrow = (plane: RoofPlane) => {
    if (plane.pitchZoneRole === 'upper_main' || plane.isVirtualAssetPlane) return null;
    const p0 = plane.planPolygon[0];
    const p1 = plane.planPolygon[1];
    if (!p0 || !p1) return null;

    const summary = sectionById.get(plane.id);
    let fromPt = p0;
    let toPt = p1;

    // Align arrow direction cleanly with computed progressive perimeter walk (entry -> exit)
    if (summary?.entryCorner && summary?.exitCorner) {
      const dEntryP0 = Math.hypot(p0.x - summary.entryCorner.x, p0.y - summary.entryCorner.y);
      const dEntryP1 = Math.hypot(p1.x - summary.entryCorner.x, p1.y - summary.entryCorner.y);
      if (dEntryP1 < dEntryP0) {
        fromPt = p1;
        toPt = p0;
      }
    }

    const sx1 = toSvgX(fromPt.x);
    const sy1 = toSvgY(fromPt.y);
    const sx2 = toSvgX(toPt.x);
    const sy2 = toSvgY(toPt.y);
    const dx = sx2 - sx1;
    const dy = sy2 - sy1;
    const edgeSvgLen = Math.hypot(dx, dy);
    if (edgeSvgLen < 28) return null;

    const ux = dx / edgeSvgLen;
    const uy = dy / edgeSvgLen;

    // Determine outward normal relative to polygon centroid
    const cx = toSvgX(plane.planPolygon.reduce((acc, p) => acc + p.x, 0) / plane.planPolygon.length);
    const cy = toSvgY(plane.planPolygon.reduce((acc, p) => acc + p.y, 0) / plane.planPolygon.length);
    const midX = (sx1 + sx2) / 2;
    const midY = (sy1 + sy2) / 2;

    let nx = -uy;
    let ny = ux;
    // Flip if pointing inward toward centroid
    if (nx * (cx - midX) + ny * (cy - midY) > 0) {
      nx = -nx;
      ny = -ny;
    }

    const offsetPx = 15;
    // Trim arrow length nicely to central 58% of edge
    const trim = Math.min(edgeSvgLen * 0.22, 34);
    const ax1 = sx1 + ux * trim + nx * offsetPx;
    const ay1 = sy1 + uy * trim + ny * offsetPx;
    const ax2 = sx2 - ux * trim + nx * offsetPx;
    const ay2 = sy2 - uy * trim + ny * offsetPx;

    return {
      ax1,
      ay1,
      ax2,
      ay2,
      eaveSvg: { sx1, sy1, sx2, sy2 }
    };
  };

  const activeMobilePack = useMemo(() => {
    if (roofingPacks.length === 0) return null;
    return (
      roofingPacks.find((pk) => pk.planeId === selectedPlaneId) ||
      roofingPacks.find((pk) => !completedSet.has(pk.planeId)) ||
      roofingPacks[0]
    );
  }, [roofingPacks, selectedPlaneId, completedSet]);

  const roofMapSvg = (
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-full object-contain filter drop-shadow-xl"
          >
            <defs>
              {/* Sleek directional arrow markers */}
              <marker
                id="walkArrow"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto"
              >
                <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#94a3b8" />
              </marker>
              <marker
                id="walkArrowStart"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 1.5 L 8.5 5 L 0 8.5 z" fill="#34d399" />
              </marker>

              {/* Colored arrow markers for each pairing link */}
              {layout.pairingLinks.map((link) => {
                const srcPlane = displayPlanes.find((p) => p.id === link.sourcePlaneId);
                const color = srcPlane?.color || '#38bdf8';
                return (
                  <marker
                    key={`marker-${link.id}`}
                    id={`linkArrow-${link.id}`}
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="5.5"
                    markerHeight="5.5"
                    orient="auto"
                  >
                    <path d="M 0 1 L 9 5 L 0 9 z" fill={color} stroke="#090d16" strokeWidth="0.6" />
                  </marker>
                );
              })}

              {/* Diagonal offcut stripe pattern keyed by source plane color */}
              {displayPlanes.map((p) => (
                <pattern
                  key={`hatch-${p.id}`}
                  id={`rxHatch-${p.id}`}
                  width="10"
                  height="10"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="10"
                    stroke={p.color || '#ffffff'}
                    strokeWidth="3.2"
                    strokeOpacity="0.45"
                  />
                </pattern>
              ))}

              {/* Clip paths per roof face for crisp interior seam lines & purlins */}
              {displayPlanes.map((p) => (
                <clipPath key={`clip-${p.id}`} id={`faceClip-${p.id}`}>
                  <polygon points={p.planPolygon.map((pt) => `${toSvgX(pt.x)},${toSvgY(pt.y)}`).join(' ')} />
                </clipPath>
              ))}

              {/* Purlin hatch pattern */}
              <pattern
                id="purlinHatch"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="20" stroke="#334155" strokeWidth="1" />
              </pattern>
            </defs>

            {/* A. ROOF SECTIONS (Clean Vector Polygons + Sheet Seam Lines + Aperture Cutouts + Offcut Zones) */}
            {displayPlanes.map((plane) => {
              const isSelected = selectedPlaneId === plane.id;
              const isStart = plane.id === effectiveStartPlaneId || plane.isStartEdge;
              const seqNum = sequenceMap.get(plane.id) || plane.sequenceIndex || 1;
              const pointsStr = plane.planPolygon
                .map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`)
                .join(' ');

              const xs = plane.planPolygon.map((p) => toSvgX(p.x));
              const ys = plane.planPolygon.map((p) => toSvgY(p.y));
              const bboxW = Math.max(...xs) - Math.min(...xs);
              const bboxH = Math.max(...ys) - Math.min(...ys);
              const hasComfortSpace = bboxW > 74 && bboxH > 46;

              const cx = plane.planPolygon.reduce((acc, p) => acc + p.x, 0) / plane.planPolygon.length;
              const cy = plane.planPolygon.reduce((acc, p) => acc + p.y, 0) / plane.planPolygon.length;
              const svgCx = toSvgX(cx);
              const svgCy = toSvgY(cy);

              const fillColor = plane.color || '#3b82f6';
              const eaveArrow = computeEaveArrow(plane);

              // Compute subtle sheet panel seam lines perpendicular to eave (parallel to fall)
              const sheetSeamLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
              const ep0 = plane.planPolygon[0];
              const ep1 = plane.planPolygon[1];
              if (ep0 && ep1) {
                const ex = ep1.x - ep0.x;
                const ey = ep1.y - ep0.y;
                const eLen = Math.hypot(ex, ey) || 1;
                const ux = ex / eLen;
                const uy = ey / eLen;
                const runDir = plane.runDirection || { x: -uy, y: ux };
                const coverM = coverWidthMm / 1000;
                const maxReach = Math.max(bounds.width, bounds.height) * 1.1;

                const projUs = plane.planPolygon.map(
                  (pt) => (pt.x - ep0.x) * ux + (pt.y - ep0.y) * uy
                );
                const minProjU = Math.min(0, ...projUs);
                const maxProjU = Math.max(eLen, ...projUs);
                const startU = Math.ceil((minProjU + 0.08) / coverM) * coverM;

                for (let u = startU; u < maxProjU - 0.08; u += coverM) {
                  const baseX = ep0.x + ux * u;
                  const baseY = ep0.y + uy * u;
                  sheetSeamLines.push({
                    x1: toSvgX(baseX),
                    y1: toSvgY(baseY),
                    x2: toSvgX(baseX + runDir.x * maxReach),
                    y2: toSvgY(baseY + runDir.y * maxReach)
                  });
                }
              }

              const sheetInfo = faceSheetSummaryByPlaneId.get(plane.id);
              const hasRoomForQty = bboxW > 46 && bboxH > 32;
              const qtyLine = showLengths ? sheetInfo?.qtyLengthShort || '' : '';
              const subParts: string[] = [];
              if (sheetInfo?.offcutShort) subParts.push(sheetInfo.offcutShort);
              if (showPitch) subParts.push(`${plane.pitchDeg}°`);
              const subLine = subParts.join(' · ');

              const isFaceInstalled = completedSet.has(plane.id);
              const isCustomPicked = (installProgress?.customSequencePlaneIds || []).includes(plane.id);

              return (
                <g
                  key={plane.id}
                  onClick={() => handleAssignNumberTap(plane.id)}
                  className="cursor-pointer group"
                >
                  {/* 1. Section Base Solid Fill */}
                  <polygon
                    points={pointsStr}
                    fill={isFaceInstalled ? '#059669' : fillColor}
                    fillOpacity={isSelected ? 0.92 : isFaceInstalled ? 0.65 : 0.72}
                    stroke={isCustomPicked ? '#38bdf8' : isSelected ? '#ffffff' : '#090d16'}
                    strokeWidth={isSelected || isCustomPicked ? '3.5' : '2'}
                    strokeLinejoin="round"
                    className="transition-all duration-200 group-hover:fill-opacity-90"
                  />

                  {/* 2. Subtle Sheet Panel Lines Clipped Inside Section (shows exact sheet lay direction!) */}
                  <g clipPath={`url(#faceClip-${plane.id})`} pointerEvents="none">
                    {sheetSeamLines.map((ln, idx) => (
                      <line
                        key={idx}
                        x1={ln.x1}
                        y1={ln.y1}
                        x2={ln.x2}
                        y2={ln.y2}
                        stroke="#ffffff"
                        strokeOpacity="0.16"
                        strokeWidth="1"
                      />
                    ))}
                  </g>

                  {/* 3. Inherited Colour Receiving Zones (Clean Source Color + Diagonal Hatch, Zero Floating Pills!) */}
                  {(layout.receivingZones || plane.receivingZones || [])
                    .filter((zone) => zone.targetPlaneId === plane.id)
                    .map((zone) => {
                      const zonePtsStr = zone.planPolygon
                        .map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`)
                        .join(' ');

                      return (
                        <g key={zone.id} pointerEvents="none">
                          <polygon
                            points={zonePtsStr}
                            fill={zone.softSourceColor}
                          />
                          <polygon
                            points={zonePtsStr}
                            fill={`url(#rxHatch-${zone.sourcePlaneId})`}
                            stroke={zone.tintColor}
                            strokeWidth="1.6"
                            strokeDasharray="4 3"
                          />
                        </g>
                      );
                    })}

                  {/* 4. Optional Purlin Lines Overlay */}
                  {showPurlins && (
                    <polygon
                      points={pointsStr}
                      fill="url(#purlinHatch)"
                      pointerEvents="none"
                      opacity="0.5"
                    />
                  )}

                  {/* 4B. Aperture Cutouts (Skylights, Chimneys, Dormer Footprints breaking sheet runs) */}
                  {(plane.apertures || []).map((app) => {
                    if (!app.planPolygon || app.planPolygon.length < 3) return null;
                    const appPts = app.planPolygon.map((p) => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' ');
                    const appFill =
                      app.type === 'skylight'
                        ? '#0369a1'
                        : app.type === 'chimney'
                        ? '#0f172a'
                        : '#0b101d';
                    const appStroke =
                      app.type === 'skylight'
                        ? '#7dd3fc'
                        : app.type === 'chimney'
                        ? '#cbd5e1'
                        : '#38bdf8';
                    return (
                      <polygon
                        key={`app-${app.assetId}`}
                        points={appPts}
                        fill={appFill}
                        fillOpacity="0.88"
                        stroke={appStroke}
                        strokeWidth="1.6"
                        strokeDasharray={app.type === 'skylight' ? undefined : '4 2'}
                        pointerEvents="none"
                      />
                    );
                  })}

                  {/* 4C. Verge / Gable, Pitch-Break Crease & Dormer Valley Edge Accents */}
                  {plane.pitchZoneRole === 'upper_main' && plane.planPolygon.length >= 2 && (
                    <line
                      x1={toSvgX(plane.planPolygon[0].x)}
                      y1={toSvgY(plane.planPolygon[0].y)}
                      x2={toSvgX(plane.planPolygon[1].x)}
                      y2={toSvgY(plane.planPolygon[1].y)}
                      stroke="#f59e0b"
                      strokeWidth="2.8"
                      strokeDasharray="8 3 2 3"
                      strokeLinecap="round"
                      pointerEvents="none"
                    />
                  )}
                  {plane.edges.map((ed, idx) => {
                    if (ed.type !== 'verge' && !(plane.isVirtualAssetPlane && ed.type === 'valley')) {
                      return null;
                    }
                    const v1 = plane.planPolygon[idx];
                    const v2 = plane.planPolygon[(idx + 1) % plane.planPolygon.length];
                    if (!v1 || !v2) return null;
                    const isValley = ed.type === 'valley';
                    return (
                      <line
                        key={`edge-acc-${plane.id}-${idx}`}
                        x1={toSvgX(v1.x)}
                        y1={toSvgY(v1.y)}
                        x2={toSvgX(v2.x)}
                        y2={toSvgY(v2.y)}
                        stroke={isValley ? '#fbbf24' : '#818cf8'}
                        strokeWidth={isValley ? '2.5' : '3'}
                        strokeDasharray="6 4"
                        pointerEvents="none"
                      />
                    );
                  })}

                  {/* 5. Start Face Outer Eave Accent & Outward Walk-Direction Arrow */}
                  {eaveArrow && (
                    <g pointerEvents="none">
                      {isStart && (
                        <line
                          x1={eaveArrow.eaveSvg.sx1}
                          y1={eaveArrow.eaveSvg.sy1}
                          x2={eaveArrow.eaveSvg.sx2}
                          y2={eaveArrow.eaveSvg.sy2}
                          stroke="#10b981"
                          strokeWidth="4.5"
                          strokeLinecap="round"
                        />
                      )}
                      <line
                        x1={eaveArrow.ax1}
                        y1={eaveArrow.ay1}
                        x2={eaveArrow.ax2}
                        y2={eaveArrow.ay2}
                        stroke={isStart ? '#34d399' : '#94a3b8'}
                        strokeWidth={isStart ? '2.2' : '1.5'}
                        strokeLinecap="round"
                        markerEnd={isStart ? 'url(#walkArrowStart)' : 'url(#walkArrow)'}
                        opacity={isStart ? 0.95 : 0.7}
                      />
                    </g>
                  )}

                  {/* 6. Clean Architectural Section Identifier + Sheet Quantities & Sheet Lengths */}
                  <g transform={`translate(${svgCx}, ${svgCy})`} pointerEvents="none">
                    <text
                      x="0"
                      y={hasRoomForQty && qtyLine ? (hasComfortSpace && subLine ? '-7' : '-3') : '5'}
                      textAnchor="middle"
                      fill={completedSet.has(plane.id) ? '#a7f3d0' : isStart ? '#6ee7b7' : '#ffffff'}
                      stroke="#090d16"
                      strokeWidth="4.5"
                      strokeLinejoin="round"
                      style={{ paintOrder: 'stroke' }}
                      fontSize={hasComfortSpace ? '14.5' : '12'}
                      fontWeight="900"
                      letterSpacing="0.03em"
                    >
                      {completedSet.has(plane.id) ? '✓ ' : isStart ? '★ ' : ''}#{seqNum} {plane.code || 'A'}
                    </text>

                    {hasRoomForQty && qtyLine && (
                      <text
                        x="0"
                        y={hasComfortSpace && subLine ? '8' : '12'}
                        textAnchor="middle"
                        fill="#7dd3fc"
                        stroke="#090d16"
                        strokeWidth="3.8"
                        strokeLinejoin="round"
                        style={{ paintOrder: 'stroke' }}
                        fontSize={hasComfortSpace ? '10.5' : '9.2'}
                        fontWeight="800"
                        fontFamily="monospace"
                      >
                        {qtyLine}
                      </text>
                    )}

                    {hasComfortSpace && subLine && (
                      <text
                        x="0"
                        y="21"
                        textAnchor="middle"
                        fill={sheetInfo?.offcutShort ? '#6ee7b7' : '#cbd5e1'}
                        stroke="#090d16"
                        strokeWidth="3.2"
                        strokeLinejoin="round"
                        style={{ paintOrder: 'stroke' }}
                        fontSize="9"
                        fontWeight="800"
                        fontFamily="monospace"
                      >
                        {subLine}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}

            {/* B. CURVED OPPOSITE-HIP OFFCUT TRANSFER ARCS (Alternating Outward/Inward Bow, Zero Pill Banners) */}
            {showOffcutLinks &&
              (() => {
                const roofCx = toSvgX((bounds.minX + bounds.maxX) / 2);
                const roofCy = toSvgY((bounds.minY + bounds.maxY) / 2);

                return layout.pairingLinks.map((link, lIdx) => {
                  const x1 = toSvgX(link.startPoint.x);
                  const y1 = toSvgY(link.startPoint.y);
                  const x2 = toSvgX(link.endPoint.x);
                  const y2 = toSvgY(link.endPoint.y);
                  const dx = x2 - x1;
                  const dy = y2 - y1;
                  const distPx = Math.hypot(dx, dy) || 1;

                  // Unit normal oriented consistently outward from roof center so sequential arcs separate cleanly
                  let nx = -dy / distPx;
                  let ny = dx / distPx;
                  const mx = (x1 + x2) / 2;
                  const my = (y1 + y2) / 2;
                  if (nx * (mx - roofCx) + ny * (my - roofCy) < 0) {
                    nx = -nx;
                    ny = -ny;
                  }

                  const stepNum = link.sequenceStep ?? lIdx + 1;
                  const bowSign = stepNum % 2 === 1 ? 1 : -1;
                  const bend = Math.min(34, Math.max(14, distPx * 0.22)) * bowSign;
                  const cx = mx + nx * bend;
                  const cy = my + ny * bend;

                  // Midpoint on quadratic Bézier t=0.5 is 0.25*P0 + 0.5*C + 0.25*P1
                  const arcMidX = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
                  const arcMidY = 0.25 * y1 + 0.5 * cy + 0.25 * y2;

                  const srcPlane = displayPlanes.find((p) => p.id === link.sourcePlaneId);
                  const strokeColor = srcPlane?.color || '#38bdf8';

                return (
                  <g key={link.id} pointerEvents="none">
                    {/* Soft dark outer halo for contrast */}
                    <path
                      d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                      fill="none"
                      stroke="#090d16"
                      strokeWidth="5"
                      strokeLinecap="round"
                      opacity="0.7"
                    />
                    {/* Inherited source-colored transfer arc */}
                    <path
                      d={`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      markerEnd={`url(#linkArrow-${link.id})`}
                    />
                    {/* Minimalist step dot at midpoint (only number, zero pill ribbon!) */}
                    {link.sequenceStep && (
                      <g transform={`translate(${arcMidX}, ${arcMidY})`}>
                        <circle
                          r="8.5"
                          fill="#090d16"
                          stroke={strokeColor}
                          strokeWidth="1.8"
                        />
                        <text
                          x="0"
                          y="3"
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="9"
                          fontWeight="900"
                          fontFamily="monospace"
                        >
                          {link.sequenceStep}
                        </text>
                      </g>
                    )}
                  </g>
                  );
                });
              })()}
          </svg>
  );

  return (
    <>
      {isMobile ? (
        <div className="h-full flex flex-col gap-1.5 select-none font-sans text-white overflow-hidden relative">
          {/* 1. COMPACT SINGLE TOP BAR (Stats Popout + Layers Popout + Cuts + All Packs) */}
          <div className="shrink-0 flex items-center justify-between gap-1 px-0.5 relative z-20 min-w-0">
            <button
              type="button"
              onClick={() => {
                setIsMobileLayersOpen(false);
                setIsMobileStatsOpen((v) => !v);
              }}
              className="min-h-[40px] px-2 py-1 rounded-xl bg-[#101726] border border-slate-800 text-[11px] font-extrabold flex items-center gap-1 cursor-pointer tabular-nums truncate min-w-0"
            >
              {lifecycleStage === 'installing' ? (
                <>
                  <span className="text-emerald-400 font-mono">
                    {completedSet.size}/{roofingPacks.length} Done
                  </span>
                  <span className="text-slate-600">·</span>
                  <span className="text-sky-300 font-mono">{layout.parents.length} Stk</span>
                </>
              ) : (
                <>
                  <span className="text-sky-400 font-mono">+{layout.savedMetres}m</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-white font-mono">{100 - layout.wastePercent}%</span>
                </>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
                  isMobileStatsOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsMobileStatsOpen(false);
                  setIsMobileLayersOpen((v) => !v);
                }}
                className={`min-h-[40px] px-2 py-1 rounded-xl border text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                  isMobileLayersOpen
                    ? 'bg-sky-600 text-white border-sky-400'
                    : 'bg-[#101726] border-slate-800 text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>Layers</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCutListFilterPlaneId(null);
                  setShowCutListDrawer(true);
                }}
                className="min-h-[40px] px-2 py-1 rounded-xl bg-[#101726] border border-slate-800 text-sky-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Cuts</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsMobileStatsOpen(false);
                  setIsMobileLayersOpen(false);
                  setShowMobilePacksSheet(true);
                }}
                className="min-h-[40px] px-2 py-1 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-extrabold flex items-center gap-1 cursor-pointer tabular-nums"
              >
                <Package className="w-3.5 h-3.5" />
                <span>{roofingPacks.length}</span>
              </button>
            </div>

            {/* Stats / Job Brief & Sequence Pop-out Drawer */}
            {isMobileStatsOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#0b101d]/98 backdrop-blur-md border border-slate-700 rounded-2xl p-3 shadow-2xl space-y-2.5 z-30 animate-in fade-in slide-in-from-top-1">
                {lifecycleStage === 'installing' && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/35 border border-emerald-500/35 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-white truncate">{projectName}</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] shrink-0 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" /> Spec Locked
                      </span>
                    </div>
                    {siteAddress && (
                      <div className="text-slate-300 flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{siteAddress}</span>
                      </div>
                    )}
                    <div className="text-slate-300 font-mono text-[10px] flex flex-wrap gap-x-2 gap-y-0.5">
                      {roofProfileLabel && <span>Profile: <strong className="text-white">{roofProfileLabel}</strong></span>}
                      {coilColorLabel && <span>Colour: <strong className="text-white">{coilColorLabel}</strong></span>}
                      {windZoneLabel && <span>Wind: <strong className="text-amber-300">{windZoneLabel}</strong></span>}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-1.5">
                  {lifecycleStage === 'installing' ? (
                    <>
                      <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
                        <div className="text-sm font-extrabold text-white font-mono tabular-nums">
                          {roofingPacks.length}
                        </div>
                        <div className="text-[10px] text-slate-400">Faces</div>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
                        <div className="text-sm font-extrabold text-sky-400 font-mono tabular-nums">
                          {layout.parents.length}
                        </div>
                        <div className="text-[10px] text-slate-400">Sheets</div>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
                        <div className="text-sm font-extrabold text-white font-mono tabular-nums">
                          {layout.totalOffcutsReused}
                        </div>
                        <div className="text-[10px] text-slate-400">Repressed</div>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
                        <div className="text-sm font-extrabold text-emerald-400 font-mono tabular-nums truncate">
                          {completedSet.size}/{roofingPacks.length}
                        </div>
                        <div className="text-[10px] text-slate-400">Done</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
                        <div className="text-sm font-extrabold text-white font-mono tabular-nums">
                          {layout.parents.length}
                        </div>
                        <div className="text-[10px] text-slate-400">Ordered Sht</div>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
                        <div className="text-sm font-extrabold text-sky-400 font-mono tabular-nums">
                          {reconciledTotalOrderedLm.toFixed(1)}m
                        </div>
                        <div className="text-[10px] text-slate-400">Total lm</div>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
                        <div className="text-sm font-extrabold text-emerald-400 font-mono tabular-nums">
                          {layout.totalOffcutsReused}
                        </div>
                        <div className="text-[10px] text-slate-400">Repressed</div>
                      </div>
                      <div className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
                        <div className="text-sm font-extrabold text-white font-mono tabular-nums truncate">
                          {100 - layout.wastePercent}%
                        </div>
                        <div className="text-[10px] text-slate-400">Yield</div>
                      </div>
                    </>
                  )}
                </div>

                {orderedSheetGroups.length > 0 && (
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-400">
                      <span>
                        Ordered Sheets ·{' '}
                        <span className="text-sky-300">
                          {activeOrderMode === 'practical' ? 'Practical' : 'Optimized'}
                        </span>
                      </span>
                      <span className="font-mono text-sky-300 tabular-nums">
                        {layout.parents.length} sheets · {reconciledTotalOrderedLm.toFixed(1)} lm
                      </span>
                    </div>
                    {!measureLocked && lifecycleStage !== 'installing' && onChangeSheetOrderMode && (
                      <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800">
                        <button
                          type="button"
                          onClick={() => onChangeSheetOrderMode('practical')}
                          className={`py-1 px-2 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
                            activeOrderMode === 'practical'
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Practical (Site)
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangeSheetOrderMode('optimized')}
                          className={`py-1 px-2 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
                            activeOrderMode === 'optimized'
                              ? 'bg-sky-600 text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Optimized (Nest)
                        </button>
                      </div>
                    )}
                    <div className="max-h-28 overflow-y-auto divide-y divide-slate-800/70 font-mono text-[11px] tabular-nums">
                      {orderedSheetGroups.map((g) => (
                        <div key={g.lengthMm} className="py-1 flex items-center justify-between">
                          <span className="text-white font-bold">
                            {g.count} @ {g.lengthMm} mm
                          </span>
                          <span className="text-slate-400">{(g.count * g.lengthM).toFixed(1)} lm</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono tabular-nums">
                      <span>Offcuts repressed: {layout.totalOffcutsReused} pcs</span>
                      <span className="text-emerald-400">+{layout.savedMetres} lm saved</span>
                    </div>
                  </div>
                )}

                {orderedPlanes.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">
                      Laying Sequence
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {orderedPlanes.map((p, idx) => {
                        const isDone = completedSet.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              handleAssignNumberTap(p.id);
                              setIsMobileStatsOpen(false);
                            }}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border cursor-pointer tabular-nums ${
                              selectedPlaneId === p.id
                                ? 'bg-slate-700 text-white border-white/60'
                                : isDone
                                ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                                : 'bg-slate-900 text-slate-300 border-slate-800'
                            }`}
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: isDone ? '#10b981' : p.color || '#3b82f6' }}
                            />
                            <span>
                              #{idx + 1} {p.code}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!measureLocked && lifecycleStage !== 'installing' && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileStatsOpen(false);
                      onRegenerateLayout?.();
                    }}
                    className="w-full min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Re-Calculate Offcuts</span>
                  </button>
                )}
              </div>
            )}

            {/* Map Layers & Specs Pop-out Menu */}
            {isMobileLayersOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-52 bg-[#0b101d]/98 backdrop-blur-md border border-slate-700 rounded-2xl p-2 shadow-2xl space-y-1 z-30 animate-in fade-in slide-in-from-top-1">
                {[
                  { label: 'Sheet Lengths', val: showLengths, toggle: () => setShowLengths(!showLengths) },
                  { label: 'Roof Pitches', val: showPitch, toggle: () => setShowPitch(!showPitch) },
                  { label: 'Offcut Flow Arcs', val: showOffcutLinks, toggle: () => setShowOffcutLinks(!showOffcutLinks) },
                  { label: 'Purlin Grid', val: showPurlins, toggle: () => setShowPurlins(!showPurlins) }
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.toggle}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-xs font-bold flex items-center justify-between cursor-pointer"
                  >
                    <span className="text-slate-200">{item.label}</span>
                    <span className={item.val ? 'text-emerald-400 font-black' : 'text-slate-600'}>
                      {item.val ? '✓' : 'Off'}
                    </span>
                  </button>
                ))}
                {!measureLocked && lifecycleStage !== 'installing' && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileLayersOpen(false);
                      setShowSettingsModal(true);
                    }}
                    className="w-full min-h-[38px] px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer mt-1"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Sheet &amp; Cover Specs</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 2. MASSIVE EDGE-TO-EDGE SVG ROOF MAP VIEWPORT */}
          <div
            ref={svgViewportRef}
            onClick={() => {
              if (isMobileStatsOpen) setIsMobileStatsOpen(false);
              if (isMobileLayersOpen) setIsMobileLayersOpen(false);
            }}
            className="flex-1 min-h-0 bg-[#0b101d] rounded-xl border border-slate-800/80 relative overflow-hidden flex items-center justify-center"
          >
            {isNumberingSequence && (
              <div className="absolute top-2 left-2 right-2 z-15 px-3 py-1.5 rounded-xl bg-sky-950/95 border border-sky-400/60 text-sky-100 text-[11px] font-bold flex items-center justify-between gap-2 shadow-xl">
                <span className="truncate">
                  Tap faces in lay order ({(installProgress?.customSequencePlaneIds || []).length}/{roofingPacks.length})
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsNumberingSequence(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-extrabold shrink-0 cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}

            {roofMapSvg}
          </div>

          {/* 3. SINGLE PINNED ACTIVE PACK STRIP (Sheet Quantities & Exact Cut Lengths at a Glance) */}
          <div className="shrink-0 bg-[#101726] border border-slate-800 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2">
            {activeMobilePack ? (
              (() => {
                const summary = faceSheetSummaryByPlaneId.get(activeMobilePack.planeId);
                const chipList = summary?.lengthGroups || [];
                return (
                  <>
                    <div
                      className="min-w-0 flex-1 flex items-center gap-2 cursor-pointer"
                      onClick={() => setShowMobilePacksSheet(true)}
                    >
                      <span
                        className="w-8 h-8 rounded-xl flex items-center justify-center font-mono font-black text-xs text-white shrink-0 border border-white/20 tabular-nums"
                        style={{
                          backgroundColor: completedSet.has(activeMobilePack.planeId)
                            ? '#059669'
                            : activeMobilePack.color
                        }}
                      >
                        #{activeMobilePack.sequenceNumber}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-white truncate flex items-center gap-1.5 tabular-nums">
                          <span>Face {activeMobilePack.code}</span>
                          <span className="text-[10px] font-mono text-emerald-300 font-bold">
                            {summary?.orderedCount ?? activeMobilePack.freshSheetCount} ordered
                          </span>
                          {summary && summary.offcutCount > 0 && (
                            <span className="text-[10px] font-mono text-sky-300">
                              +{summary.offcutCount} repressed
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono font-bold text-sky-300 truncate tabular-nums">
                          {chipList.length > 0
                            ? chipList.map((g) => `${g.count} @ ${g.lengthMm}mm`).join(', ')
                            : activeMobilePack.packLabel}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onUpdateInstallProgress && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleTogglePlaneStaged(activeMobilePack.planeId)}
                            className={`min-h-[40px] min-w-[40px] px-2 rounded-xl text-[11px] font-bold flex items-center justify-center cursor-pointer border ${
                              stagedSet.has(activeMobilePack.planeId)
                                ? 'bg-sky-600/30 text-sky-200 border-sky-500/50'
                                : 'bg-slate-900 text-slate-400 border-slate-800'
                            }`}
                            title="Stage on Roof"
                          >
                            <Package className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTogglePlaneInstalled(activeMobilePack.planeId)}
                            className={`min-h-[40px] px-2.5 rounded-xl text-[11px] font-extrabold flex items-center gap-1 cursor-pointer border ${
                              completedSet.has(activeMobilePack.planeId)
                                ? 'bg-emerald-600 text-white border-emerald-400'
                                : 'bg-slate-900 text-slate-200 border-slate-700'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{completedSet.has(activeMobilePack.planeId) ? 'Done' : 'Install'}</span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => setShowMobilePacksSheet(true)}
                        className="min-h-[40px] px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                        title="View & Reorder All Packs"
                      >
                        <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
                        <span>All</span>
                      </button>
                    </div>
                  </>
                );
              })()
            ) : (
              <div className="w-full flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400 font-semibold">
                  {planes.length} Faces · {layout.parents.length} Stock Sheets
                </span>
                {!measureLocked && lifecycleStage !== 'installing' && (
                  <button
                    type="button"
                    onClick={() => onRegenerateLayout?.()}
                    className="min-h-[40px] px-3 rounded-xl bg-blue-600 text-white text-xs font-extrabold cursor-pointer"
                  >
                    Re-Calculate
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 4. MOBILE ALL ROOFING PACKS SLIDE-UP SHEET */}
          {showMobilePacksSheet && (
            <div
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end justify-center animate-in fade-in"
              onClick={() => setShowMobilePacksSheet(false)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-[#0b101d] border-t border-slate-800 text-white w-full rounded-t-3xl flex flex-col max-h-[84dvh] shadow-2xl overflow-hidden"
              >
                <div className="w-10 h-1 bg-slate-700 rounded-full mx-auto mt-2.5 shrink-0" />
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
                  <div>
                    <h3 className="text-sm font-black text-white">
                      Roofing Packs ({completedSet.size}/{roofingPacks.length} Done)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Re-order lay sequence anytime; offcuts stay locked
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMobilePacksSheet(false)}
                    className="min-h-9 min-w-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {onUpdateInstallProgress && (
                  <div className="px-4 pt-2.5 pb-1 flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isNumberingSequence) {
                          onUpdateInstallProgress({
                            customSequencePlaneIds: [],
                            stagedPlaneIds: installProgress?.stagedPlaneIds || [],
                            completedPlaneIds: installProgress?.completedPlaneIds || [],
                            completedPieceIds: installProgress?.completedPieceIds || []
                          });
                        }
                        setIsNumberingSequence(!isNumberingSequence);
                        setShowMobilePacksSheet(false);
                      }}
                      className="flex-1 min-h-[42px] rounded-xl bg-sky-600/20 border border-sky-500/40 text-sky-300 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ListOrdered className="w-4 h-4" />
                      <span>Tap Faces on Map to Number (1..{roofingPacks.length})</span>
                    </button>
                    {(installProgress?.customSequencePlaneIds?.length || 0) > 0 && (
                      <button
                        type="button"
                        onClick={handleResetPackOrder}
                        className="min-h-[42px] px-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                )}

                <div className="p-4 overflow-y-auto space-y-2.5 flex-1 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                  {roofingPacks.map((pack, idx) => {
                    const isStaged = stagedSet.has(pack.planeId);
                    const isInstalled = completedSet.has(pack.planeId);
                    const isSelected = selectedPlaneId === pack.planeId;
                    return (
                      <div
                        key={pack.planeId}
                        onClick={() => {
                          onSelectPlane(pack.planeId);
                          setShowMobilePacksSheet(false);
                        }}
                        className={`p-3 rounded-2xl border space-y-2 cursor-pointer ${
                          isInstalled
                            ? 'bg-emerald-950/35 border-emerald-500/50'
                            : isSelected
                            ? 'bg-slate-900 border-sky-400'
                            : 'bg-slate-950/80 border-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-8 h-8 rounded-xl flex items-center justify-center font-mono font-black text-xs text-white shrink-0 border border-white/20 tabular-nums"
                              style={{ backgroundColor: isInstalled ? '#059669' : pack.color }}
                            >
                              #{pack.sequenceNumber}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs font-black text-white truncate">
                                Face {pack.code} ({pack.planeName})
                              </div>
                              <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                                {pack.areaM2}m² · {pack.pitchDeg}° · {pack.totalPiecesNeeded} cuts
                              </div>
                            </div>
                          </div>

                          {onUpdateInstallProgress && (
                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMovePackOrder(pack.planeId, -1)}
                                className="w-9 h-9 rounded-xl bg-slate-900 disabled:opacity-30 text-slate-300 flex items-center justify-center cursor-pointer"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === roofingPacks.length - 1}
                                onClick={() => handleMovePackOrder(pack.planeId, 1)}
                                className="w-9 h-9 rounded-xl bg-slate-900 disabled:opacity-30 text-slate-300 flex items-center justify-center cursor-pointer"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {(() => {
                          const summary = faceSheetSummaryByPlaneId.get(pack.planeId);
                          const groups = summary?.lengthGroups || [];
                          return (
                            <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
                              <div className="text-xs font-mono font-bold text-sky-300 tabular-nums">
                                {pack.packLabel}
                              </div>
                              {groups.length > 0 && (
                                <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                                  {groups.map((g) => `${g.count} @ ${g.lengthMm}mm`).join(' · ')}
                                  {summary ? ` · ${summary.orderedLm.toFixed(1)} lm` : ''}
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {pack.outOfOrderOffcutWarning && (
                          <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-[11px] font-semibold flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <span>{pack.outOfOrderOffcutWarning}</span>
                          </div>
                        )}

                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {onUpdateInstallProgress && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleTogglePlaneStaged(pack.planeId)}
                                className={`min-h-[40px] px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${
                                  isStaged
                                    ? 'bg-sky-600/30 text-sky-200 border-sky-500/50'
                                    : 'bg-slate-900 text-slate-300 border-slate-800'
                                }`}
                              >
                                <Package className="w-3.5 h-3.5" />
                                <span>{isStaged ? 'Staged ✓' : 'Stage'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleTogglePlaneInstalled(pack.planeId)}
                                className={`min-h-[40px] px-2.5 rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer border ${
                                  isInstalled
                                    ? 'bg-emerald-600 text-white border-emerald-400'
                                    : 'bg-slate-900 text-slate-200 border-slate-800'
                                }`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{isInstalled ? 'Installed ✓' : 'Mark Done'}</span>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setCutListFilterPlaneId(pack.planeId);
                              setShowMobilePacksSheet(false);
                              setShowCutListDrawer(true);
                            }}
                            className="ml-auto min-h-[40px] px-3 rounded-xl bg-slate-900 border border-slate-800 text-sky-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Cuts</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 select-none font-sans text-white">
          {/* 1. APEXMAP TOP HEADER / CONTRACTOR BRIEF BAR */}
          {lifecycleStage === 'installing' ? (
            (() => {
              const nextActivePack =
                roofingPacks.find((pk) => !completedSet.has(pk.planeId)) || null;
              return (
                <div className="bg-[#0b101d] border border-emerald-500/40 rounded-2xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        <span>Site Brief · Locked Spec</span>
                      </span>
                      <h2 className="text-lg font-black text-white tracking-tight truncate">
                        {projectName}
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                      {siteAddress && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span>{siteAddress}</span>
                        </span>
                      )}
                      {roofProfileLabel && (
                        <span>
                          Profile: <strong className="text-white">{roofProfileLabel}</strong>
                        </span>
                      )}
                      {coilColorLabel && (
                        <span>
                          Colour: <strong className="text-white">{coilColorLabel}</strong>
                        </span>
                      )}
                      {windZoneLabel && (
                        <span className="flex items-center gap-1">
                          <Shield className="w-3.5 h-3.5 text-amber-400" />
                          <span>
                            Wind Zone: <strong className="text-amber-300">{windZoneLabel}</strong>
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {nextActivePack ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onSelectPlane(nextActivePack.planeId)}
                          className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-sky-300 cursor-pointer whitespace-nowrap"
                        >
                          Next: #{nextActivePack.sequenceNumber} Face {nextActivePack.code} ({nextActivePack.packLabel})
                        </button>
                        {onUpdateInstallProgress && (
                          <button
                            type="button"
                            onClick={() => handleTogglePlaneInstalled(nextActivePack.planeId)}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Mark Face {nextActivePack.code} Done</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="text-xs font-bold text-emerald-300 bg-emerald-950/50 border border-emerald-500/40 px-3 py-2 rounded-xl flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>All {roofingPacks.length} packs completed</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="flex bg-[#101726] border border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-2xl items-center justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Offcuts &amp; Stock Plan
                </h2>
                <p className="text-xs text-slate-400 font-medium">{projectName}</p>
              </div>

              {!measureLocked && (
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/80 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <span>Settings</span>
                </button>
              )}
            </div>
          )}

          {/* 2. COMPACT KPI STATS BAR (Zero financial metrics during Installing stage) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {lifecycleStage === 'installing' ? (
              <>
                <div className="bg-[#101726] border border-slate-800/90 p-4 rounded-2xl">
                  <div className="text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
                    {layout.parents.length}
                  </div>
                  <div className="text-xs text-slate-400 font-semibold mt-1">
                    Ordered Sheets ({reconciledTotalOrderedLm.toFixed(1)} lm)
                  </div>
                </div>

                <div className="bg-[#101726] border border-slate-800/90 p-4 rounded-2xl">
                  <div className="text-3xl font-extrabold text-sky-400 font-mono tabular-nums tracking-tight">
                    {roofingPacks.length}
                  </div>
                  <div className="text-xs text-slate-400 font-semibold mt-1">Roof Faces</div>
                </div>

                <div className="bg-[#101726] border border-slate-800/90 p-4 rounded-2xl">
                  <div className="text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
                    {layout.totalOffcutsReused}
                  </div>
                  <div className="text-xs text-slate-400 font-semibold mt-1">Offcuts Repressed</div>
                </div>

                <div className="bg-[#101726] border border-slate-800/90 p-4 rounded-2xl">
                  <div className="text-3xl font-extrabold text-emerald-400 font-mono tabular-nums tracking-tight">
                    {completedSet.size}/{roofingPacks.length}
                  </div>
                  <div className="text-xs text-slate-400 font-semibold mt-1">Installed</div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-[#101726] border border-slate-800/90 p-4 rounded-2xl">
                  <div className="text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight truncate">
                    {layout.parents.length}
                  </div>
                  <div className="text-xs text-slate-400 font-semibold mt-1">
                    Ordered Sheets · {reconciledTotalOrderedLm.toFixed(1)} lm
                  </div>
                </div>

                <div className="bg-[#101726] border border-slate-800/90 p-4 rounded-2xl">
                  <div className="text-3xl font-extrabold text-sky-400 font-mono tabular-nums tracking-tight truncate">
                    +{layout.savedMetres}m
                  </div>
                  <div className="text-xs text-slate-400 font-semibold mt-1">
                    Repress Saved ({layout.totalOffcutsReused} pcs)
                  </div>
                </div>

                <div className="bg-[#101726] border border-slate-800/90 p-4 rounded-2xl">
                  <div className="text-3xl font-extrabold text-white font-mono tabular-nums tracking-tight">
                    {100 - layout.wastePercent}%
                  </div>
                  <div className="text-xs text-slate-400 font-semibold mt-1">
                    Yield ({layout.wastePercent}% waste)
                  </div>
                </div>

                <div className="bg-[#101726] border border-slate-800/90 p-4 rounded-2xl">
                  <div className="text-3xl font-extrabold text-sky-400 font-mono tabular-nums tracking-tight truncate">
                    ${layout.dollarValueSavedNZD}
                  </div>
                  <div className="text-xs text-slate-400 font-semibold mt-1">Repress Value</div>
                </div>
              </>
            )}
          </div>

          {/* 2.2 RECONCILED ORDERED SHEETS SCHEDULE + SEPARATE OFFCUT REPRESS NOTE */}
          {orderedSheetGroups.length > 0 && (
            <div className="bg-[#101726] border border-slate-800/90 rounded-2xl p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xs font-bold text-slate-200 tracking-tight">
                      Ordered Sheets Schedule
                    </h3>
                    <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/35 text-sky-300 text-[10px] font-bold">
                      {activeOrderMode === 'practical' ? 'Practical (Site Cut List)' : 'Optimized (Tight Nest)'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!measureLocked && lifecycleStage !== 'installing' && onChangeSheetOrderMode && (
                      <div className="inline-flex rounded-xl bg-slate-950 border border-slate-800 p-0.5">
                        <button
                          type="button"
                          onClick={() => onChangeSheetOrderMode('practical')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                            activeOrderMode === 'practical'
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Practical (Site Cut List)
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangeSheetOrderMode('optimized')}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                            activeOrderMode === 'optimized'
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          Optimized (Tight Nest)
                        </button>
                      </div>
                    )}
                    <span className="text-xs font-mono text-slate-400 tabular-nums">
                      {layout.totalRoofArea.toFixed(1)} m² roof area
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>
                    {activeOrderMode === 'practical'
                      ? 'Shared stock lengths (10mm increments); shorter runs & rakes cut down on site.'
                      : 'Multi-length diagonal & linear repress nesting for minimum steel metres.'}
                  </span>
                  {sheetOrderComparison && (
                    <span className="font-mono text-slate-300 tabular-nums">
                      Practical: {sheetOrderComparison.practicalOrderedLm.toFixed(1)} lm ({sheetOrderComparison.practicalDistinctLengths} len) · Optimized: {sheetOrderComparison.optimizedOrderedLm.toFixed(1)} lm ({sheetOrderComparison.optimizedDistinctLengths} len)
                    </span>
                  )}
                </div>

                <div className="divide-y divide-slate-800/70 font-mono text-xs tabular-nums">
                  {orderedSheetGroups.map((g) => {
                    const isExpanded = expandedGroupMm === g.lengthMm;
                    const hasCutDowns = g.cutDetails.some((d) => d.requiredCutMm < g.lengthMm - 2);
                    return (
                      <div key={g.lengthMm} className="py-1.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white">
                              {g.count} @ {g.lengthMm} mm
                            </span>
                            {hasCutDowns && (
                              <button
                                type="button"
                                onClick={() => setExpandedGroupMm(isExpanded ? null : g.lengthMm)}
                                className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-sans font-semibold text-sky-300 cursor-pointer flex items-center gap-1"
                              >
                                <span>{isExpanded ? 'Hide cuts' : `Cut breakdown (${g.cutDetails.length})`}</span>
                                {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                          <span className="text-slate-400">
                            {(g.count * g.lengthM).toFixed(1)} lm
                          </span>
                        </div>
                        {isExpanded && g.cutDetails.length > 0 && (
                          <div className="pl-3 pr-2 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1 text-[11px] text-slate-300">
                            {g.cutDetails.map((d) => (
                              <div key={`${d.faceCode}-${d.requiredCutMm}`} className="flex items-center justify-between gap-2">
                                <span>
                                  {d.qty} × <strong className="text-white">{d.requiredCutMm} mm</strong>{' '}
                                  <span className="font-sans text-slate-400">({d.faceCode} · {d.faceName})</span>
                                </span>
                                <span className="text-[10px] font-sans text-sky-300">
                                  {d.requiredCutMm < g.lengthMm - 2
                                    ? `cut from ${g.lengthMm}mm`
                                    : `full ${g.lengthMm}mm run`}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="pt-2 border-t border-slate-700 flex items-center justify-between font-mono text-xs font-extrabold tabular-nums">
                  <span className="text-sky-300">
                    {layout.parents.length} sheets · {reconciledTotalOrderedLm.toFixed(1)} lm ordered
                  </span>
                  <span className="text-slate-400 font-normal">
                    Exact sum of ordered lengths
                  </span>
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
                <div className="text-xs font-bold text-slate-200">
                  Offcut Repress (Separate Calculation)
                </div>
                <div className="space-y-1.5 font-mono text-xs tabular-nums">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-slate-400">Required roof cuts</span>
                    <span className="text-white font-bold">{layout.pieces.length} pcs</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-slate-400">Net roof lineal metres</span>
                    <span className="text-slate-200">{layout.totalRoofMetres.toFixed(1)} lm</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-slate-400">Offcuts repressed</span>
                    <span className="text-emerald-400 font-bold">
                      {layout.totalOffcutsReused} pcs (+{layout.savedMetres} lm)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-slate-400">Natural waste</span>
                    <span className="text-slate-300">{layout.wastePercent}%</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-800/80">
                  Natural offcuts from ordered sheets are repressed onto compatible runs; order quantities drop only when a real remnant covers the full piece.
                </p>
              </div>
            </div>
          )}

          {/* 2.5 NATURAL LAYING ORDER SEQUENCE BAR */}
          {planes.length > 0 && (
            <div className="bg-[#101726] border border-slate-800/90 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 text-xs font-black text-white uppercase tracking-wider">
                    <span>Laying Sequence</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Lay into each hip; offcuts carry to the opposite hip on the next face so all hips, valleys &amp; ridges align.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {orderedPlanes.map((p, idx) => {
                  const isStart = p.id === effectiveStartPlaneId || p.isStartEdge;
                  const isSelected = p.id === selectedPlaneId;
                  const isDone = completedSet.has(p.id);
                  const stepNum = idx + 1;

                  return (
                    <div key={p.id} className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleAssignNumberTap(p.id)}
                        className={`px-2.5 py-1.5 min-h-[34px] rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer border shadow-xs ${
                          isSelected
                            ? 'bg-slate-700 text-white border-white/70 shadow-md ring-1 ring-white/40'
                            : isDone
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60'
                            : isStart
                            ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/60 hover:bg-emerald-900/80 hover:text-white'
                            : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: isDone ? '#10b981' : p.color || '#3b82f6' }}
                        />
                        <span className="tabular-nums">
                          #{stepNum} {p.code || p.name}
                        </span>
                        {isDone ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          isStart && <span className="text-[9px] text-emerald-300 font-black">★</span>
                        )}
                      </button>
                      {idx < orderedPlanes.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. MAIN SECTION-BASED ROOF PLAN VIEWPORT */}
          <div className="bg-[#101726] border border-slate-800/90 rounded-3xl p-5 shadow-2xl relative overflow-hidden space-y-4">
            <div
              ref={svgViewportRef}
              className="w-full bg-[#0b101d] rounded-2xl border border-slate-800/80 relative overflow-hidden flex items-center justify-center min-h-[480px]"
            >
              {roofMapSvg}
          <div className="w-full sm:w-auto sm:absolute sm:bottom-3 sm:left-3 sm:right-auto bg-[#0a0f1d]/95 sm:bg-[#0a0f1d]/90 sm:backdrop-blur-md border-t sm:border border-slate-800 px-3 sm:px-3.5 py-2 sm:rounded-2xl text-xs shadow-xl">
            <div className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto pb-0.5 sm:flex-wrap">
              {orderedPlanes.map((p, idx) => {
                const isSelected = selectedPlaneId === p.id;
                const rxZones = (layout.receivingZones || p.receivingZones || []).filter(
                  (z) => z.targetPlaneId === p.id
                );
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectPlane(p.id)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-slate-800 text-white ring-1 ring-white/50'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0 border border-white/25"
                      style={{ backgroundColor: p.color || '#3b82f6' }}
                    />
                    <span className="tabular-nums">#{idx + 1} {p.code}</span>
                    {rxZones.length > 0 && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({rxZones.map((z) => `+${z.sourceCode}`).join(',')})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. TOGGLE CHIPS BAR (Horizontal Scroll on Mobile, 40px+ Touch Targets) */}
        <div className="flex items-center gap-1.5 sm:gap-2 pt-1 overflow-x-auto pb-0.5">
          <button
            onClick={() => setShowLengths(!showLengths)}
            className={`px-3 sm:px-4 py-2 min-h-[38px] rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer border shrink-0 ${
              showLengths
                ? 'bg-slate-800 text-white border-slate-600 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            Lengths {showLengths && '✓'}
          </button>

          <button
            onClick={() => setShowPitch(!showPitch)}
            className={`px-3 sm:px-4 py-2 min-h-[38px] rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer border shrink-0 ${
              showPitch
                ? 'bg-slate-800 text-white border-slate-600 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            Pitch {showPitch && '✓'}
          </button>

          <button
            onClick={() => setShowOffcutLinks(!showOffcutLinks)}
            className={`px-3 sm:px-4 py-2 min-h-[38px] rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer border shrink-0 ${
              showOffcutLinks
                ? 'bg-slate-800 text-white border-slate-600 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            Offcut Flow {showOffcutLinks && '✓'}
          </button>

          <button
            onClick={() => setShowPurlins(!showPurlins)}
            className={`px-3 sm:px-4 py-2 min-h-[38px] rounded-xl text-[11px] sm:text-xs font-bold transition-all cursor-pointer border shrink-0 ${
              showPurlins
                ? 'bg-slate-800 text-white border-slate-600 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            Purlins {showPurlins && '✓'}
          </button>

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowCutListDrawer(true)}
              className="px-3.5 py-2 min-h-[38px] rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 text-[11px] sm:text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
              <span>Cut List</span>
            </button>
          </div>
        </div>

        {/* 5. PRIMARY ACTION BUTTON (Locked Notice in Installing / Confirmed Measure) */}
        <div className="space-y-1.5 pt-1">
          {measureLocked || lifecycleStage === 'installing' ? (
            <div className="w-full py-2.5 px-4 rounded-2xl bg-slate-900/90 border border-slate-700/80 text-slate-300 text-xs font-bold flex items-center justify-center gap-2">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                Measure &amp; Offcuts Locked · Renumbering faces below updates Roofing Pack load order only
              </span>
            </div>
          ) : (
            <button
              onClick={() => onRegenerateLayout?.()}
              className="w-full py-3 sm:py-4 min-h-[44px] rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-sm sm:text-base tracking-wide shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-blue-200" />
              <span>Re-Calculate Offcuts</span>
            </button>
          )}
        </div>
      </div>

      {/* 5.5 ONSITE ROOFING PACKS & LAYING SEQUENCE NAVIGATOR */}
      {roofingPacks.length > 0 && (
        <div className="bg-[#101726] border border-slate-800/90 rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-2xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 shrink-0">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-white">
                  Roofing Packs &amp; Site Laying Schedule
                </h3>
                <p className="text-[11px] text-slate-400">
                  {completedSet.size} / {roofingPacks.length} packs installed ·{' '}
                  {stagedSet.size} staged · Stock &amp; offcuts unchanged
                </p>
              </div>
            </div>

            {onUpdateInstallProgress && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!isNumberingSequence) {
                      onUpdateInstallProgress({
                        customSequencePlaneIds: [],
                        stagedPlaneIds: installProgress?.stagedPlaneIds || [],
                        completedPlaneIds: installProgress?.completedPlaneIds || [],
                        completedPieceIds: installProgress?.completedPieceIds || []
                      });
                    }
                    setIsNumberingSequence(!isNumberingSequence);
                  }}
                  className={`px-3 py-2 min-h-[40px] rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-all border ${
                    isNumberingSequence
                      ? 'bg-sky-600 text-white border-sky-400 shadow-lg'
                      : 'bg-slate-900 hover:bg-slate-800 text-sky-300 border-slate-700'
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>
                    {isNumberingSequence
                      ? `Tap Faces in Order (${(installProgress?.customSequencePlaneIds || []).length}/${roofingPacks.length})`
                      : 'Tap-Number Sequence'}
                  </span>
                </button>

                {(installProgress?.customSequencePlaneIds?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleResetPackOrder}
                    className="px-2.5 py-2 min-h-[40px] rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    title="Reset to Auto Sequence"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Reset</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {isNumberingSequence && (
            <div className="p-2.5 rounded-xl bg-sky-950/60 border border-sky-500/40 text-sky-200 text-xs font-semibold flex items-center justify-between gap-2">
              <span>
                Tap each roof face on the plan or cards below in your preferred site laying order (1, 2, 3...).
              </span>
              <button
                type="button"
                onClick={() => setIsNumberingSequence(false)}
                className="px-2.5 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-bold cursor-pointer shrink-0"
              >
                Done
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {roofingPacks.map((pack, idx) => {
              const isStaged = stagedSet.has(pack.planeId);
              const isInstalled = completedSet.has(pack.planeId);
              const isSelected = selectedPlaneId === pack.planeId;
              const pickedIdx = (installProgress?.customSequencePlaneIds || []).indexOf(pack.planeId);

              return (
                <div
                  key={pack.planeId}
                  onClick={() => handleAssignNumberTap(pack.planeId)}
                  className={`p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${
                    isInstalled
                      ? 'bg-emerald-950/35 border-emerald-500/50'
                      : isSelected
                      ? 'bg-slate-900 border-sky-400 ring-1 ring-sky-400/40'
                      : 'bg-slate-950/75 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-8 h-8 rounded-xl flex items-center justify-center font-mono font-black text-xs text-white shrink-0 border border-white/20 tabular-nums"
                        style={{ backgroundColor: isInstalled ? '#059669' : pack.color }}
                      >
                        #{pickedIdx >= 0 ? pickedIdx + 1 : pack.sequenceNumber}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-black text-white truncate">
                          Pack #{pack.sequenceNumber} · Face {pack.code} ({pack.planeName})
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                          {pack.areaM2}m² · {pack.pitchDeg}° · {pack.totalPiecesNeeded} cuts
                        </div>
                      </div>
                    </div>

                    {onUpdateInstallProgress && !isNumberingSequence && (
                      <div
                        className="flex items-center gap-1 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMovePackOrder(pack.planeId, -1)}
                          className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 flex items-center justify-center cursor-pointer"
                          title="Install Earlier"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === roofingPacks.length - 1}
                          onClick={() => handleMovePackOrder(pack.planeId, 1)}
                          className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-30 text-slate-300 flex items-center justify-center cursor-pointer"
                          title="Install Later"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Exact Pack Load Callout e.g. "14 @ 6340mm + 5 offcuts from A" */}
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs font-mono text-sky-300 font-bold tabular-nums">
                    {pack.packLabel}
                  </div>

                  {pack.outOfOrderOffcutWarning && (
                    <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-[11px] font-semibold flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <span>{pack.outOfOrderOffcutWarning}</span>
                    </div>
                  )}

                  {/* Site Pack Controls */}
                  <div
                    className="flex flex-wrap items-center gap-1.5 pt-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {onUpdateInstallProgress && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleTogglePlaneStaged(pack.planeId)}
                          className={`px-2.5 py-2 min-h-[38px] rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                            isStaged
                              ? 'bg-sky-600/30 text-sky-200 border border-sky-500/50'
                              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                          }`}
                        >
                          <Package className="w-3.5 h-3.5" />
                          <span>{isStaged ? 'Staged ✓' : 'Stage on Roof'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTogglePlaneInstalled(pack.planeId)}
                          className={`px-2.5 py-2 min-h-[38px] rounded-xl text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                            isInstalled
                              ? 'bg-emerald-600 text-white border border-emerald-400'
                              : 'bg-slate-900 text-slate-300 hover:bg-emerald-950 hover:text-emerald-200 border border-slate-800'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{isInstalled ? 'Installed ✓' : 'Mark Installed'}</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setCutListFilterPlaneId(pack.planeId);
                        setShowCutListDrawer(true);
                      }}
                      className="ml-auto px-2.5 py-2 min-h-[38px] rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
                      <span>Cuts</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. SELECTED AREA DETAIL POPUP (When tapping any roof area) */}
      {selectedPlane && (
        <div className="bg-[#101726] border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <span
              className="w-4 h-4 rounded-full shrink-0 shadow-md"
              style={{ backgroundColor: selectedPlane.color || '#3b82f6' }}
            />
            <div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span>{selectedPlane.label || `Area ${selectedPlane.code}`}</span>
                <span className="text-xs font-medium text-slate-400">({selectedPlane.name})</span>
              </div>
              <div className="text-xs text-slate-300 mt-0.5">
                {selectedSectionSummary?.pairingNote ||
                  `${selectedPlane.pitchDeg}° pitch · Lay Direction: ${
                    selectedPlane.underlapSide === 'left' ? 'Left to Right' : 'Right to Left'
                  }`}
              </div>

              {/* Exact Ordered Blanks & Repressed Offcuts for Selected Face */}
              {(() => {
                const summary = faceSheetSummaryByPlaneId.get(selectedPlane.id);
                if (!summary) return null;
                return (
                  <div className="mt-2 space-y-1 font-mono text-[11px] tabular-nums">
                    <div className="text-sky-300 font-bold">
                      {summary.orderedCount > 0
                        ? `Ordered: ${summary.orderedCount} sheets (${summary.orderedLm.toFixed(1)} lm)`
                        : `0 ordered blanks · Clad via ${summary.offcutCount} repressed offcuts`}
                      {summary.orderedCount > 0 && summary.offcutCount > 0 && (
                        <span className="text-emerald-300 ml-2">
                          + {summary.offcutCount} repressed offcut{summary.offcutCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    {summary.lengthGroups.length > 0 && (
                      <div className="text-slate-300">
                        {summary.lengthGroups
                          .map((g) => `${g.count} @ ${g.lengthMm}mm`)
                          .join(' · ')}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Inherited Color Offcut Feed */}
              {(() => {
                const rx = (layout.receivingZones || selectedPlane.receivingZones || []).filter(
                  (z) => z.targetPlaneId === selectedPlane.id
                );
                if (rx.length === 0) return null;
                return (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[11px] text-slate-400 font-semibold">Receives offcuts:</span>
                    {rx.map((z) => (
                      <span
                        key={z.id}
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold border"
                        style={{
                          backgroundColor: z.softSourceColor,
                          borderColor: z.tintColor,
                          color: '#ffffff'
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: z.sourceColor }}
                        />
                        <span>
                          {z.sourceName} · {z.piecesCount} pcs
                        </span>
                        <span className="text-[9.5px] px-1 rounded bg-black/40 text-slate-200 font-mono">
                          {z.ruleApplied === 'adjacent_hip_run'
                            ? 'Adjacent Hip'
                            : z.ruleApplied === 'matching_end_slope'
                            ? 'End Slope'
                            : z.ruleApplied === 'opposite_hip_same_slope'
                            ? 'Opposite Hip'
                            : 'Next in Lay'}
                        </span>
                      </span>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!measureLocked && lifecycleStage !== 'installing' && (
              <button
                onClick={() => onOpenPlaneEditor?.(selectedPlane)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white border border-slate-700 transition-colors cursor-pointer"
              >
                Set Pitch / Direction
              </button>
            )}
            <button
              onClick={() => onSelectPlane(null)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
        </div>
      )}

      {/* 7. ROLL-FORMER CUT LIST SLIDE-UP DRAWER / MODAL */}
      {showCutListDrawer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-[#0f172a] border border-slate-800 text-white w-full sm:max-w-4xl rounded-t-3xl sm:rounded-3xl flex flex-col shadow-2xl max-h-[90vh] overflow-hidden">
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-600/20 text-sky-400 border border-sky-500/30">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Ordered Sheets &amp; Repress Schedule ({layout.parents.length} sheets · {reconciledTotalOrderedLm.toFixed(1)} lm)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Exact mill cut lengths ordered ({layout.totalOffcutsReused} offcuts repressed separately)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCsv}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={() => setShowCutListDrawer(false)}
                  className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-750 flex items-center justify-center text-slate-300 font-bold transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Drawer Body: Responsive Stock Length Schedule with Face Filter & Site Piece Checkoff */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-3 sm:space-y-4 flex-1 text-xs pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {cutListFilterPlaneId && (
                <div className="flex items-center justify-between bg-sky-950/60 border border-sky-500/40 rounded-xl px-3 py-2 text-xs">
                  <span className="font-bold text-sky-200">
                    Filtered to Face {displayPlanes.find((p) => p.id === cutListFilterPlaneId)?.code || cutListFilterPlaneId}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCutListFilterPlaneId(null)}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold cursor-pointer"
                  >
                    Show All Faces
                  </button>
                </div>
              )}

              {/* Mobile Stacked Cards */}
              <div className="md:hidden space-y-2.5">
                {layout.parents
                  .filter(
                    (s) =>
                      !cutListFilterPlaneId ||
                      s.pieces.some((p) => p.targetPlaneId === cutListFilterPlaneId)
                  )
                  .map((sheet) => {
                      const hasRepress = sheet.pieces.length > 1;
                      const repressTargets = sheet.pieces
                        .slice(1)
                        .map((p) => p.facetName)
                        .join(', ');
                      return (
                        <div
                          key={sheet.id}
                          className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-bold text-white">
                              <span>Sheet #{sheet.sheetNumber}</span>
                              <span className="font-mono text-sky-400 tabular-nums">
                                ({Math.round(sheet.length * 1000)} mm)
                              </span>
                            </div>
                            <span
                              className={`font-bold text-[11px] font-mono tabular-nums ${
                                sheet.utilization >= 90 ? 'text-emerald-300' : 'text-amber-300'
                              }`}
                            >
                              {sheet.utilization}% Yield
                            </span>
                          </div>

                          <div className="space-y-1 pl-2 text-[11px]">
                            {sheet.pieces.map((p, idx) => {
                              const pDone = completedPiecesSet.has(p.id);
                              return (
                                <div
                                  key={p.id}
                                  onClick={() => onUpdateInstallProgress && handleTogglePieceDone(p.id)}
                                  className={`flex items-center justify-between py-1 px-2 rounded-lg cursor-pointer ${
                                    pDone ? 'bg-emerald-950/60 text-emerald-300' : 'text-slate-300'
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {onUpdateInstallProgress && (
                                      <CheckCircle2
                                        className={`w-3.5 h-3.5 shrink-0 ${
                                          pDone ? 'text-emerald-400' : 'text-slate-600'
                                        }`}
                                      />
                                    )}
                                    <span>
                                      #{idx + 1}: <strong className="text-white tabular-nums">{Math.round(p.length * 1000)}mm</strong> ➔{' '}
                                      {p.facetName}
                                    </span>
                                  </span>
                                  {(idx > 0 || p.orientation === 'flipped180') && (
                                    <span className="text-[10px] text-purple-300 font-semibold">
                                      {p.orientation === 'flipped180' ? 'Repressed 180°' : 'Repressed tail'}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 tabular-nums">
                            <span>
                              Drop: {sheet.remaining > 0.02 ? `${sheet.remaining.toFixed(2)}m` : '0m'}
                            </span>
                            <span className={hasRepress ? 'text-purple-300 font-semibold' : ''}>
                              {hasRepress ? `Offcut repressed to ${repressTargets}` : 'Single direct cut'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/40">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Stock Length</th>
                      <th className="py-2.5 px-3">Ordered Blank</th>
                      <th className="py-2.5 px-3">Cut Pieces (Tap to Tick Off)</th>
                      <th className="py-2.5 px-3">Offcut Drop</th>
                      <th className="py-2.5 px-3">Yield</th>
                      <th className="py-2.5 px-3">Where Offcuts Go</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {layout.parents
                      .filter(
                        (s) =>
                          !cutListFilterPlaneId ||
                          s.pieces.some((p) => p.targetPlaneId === cutListFilterPlaneId)
                      )
                      .map((sheet) => {
                      const hasRepress = sheet.pieces.length > 1;
                      const repressTargets = sheet.pieces
                        .slice(1)
                        .map((p) => p.facetName)
                        .join(', ');
                      return (
                        <tr key={sheet.id} className="hover:bg-slate-800/30 transition-colors tabular-nums">
                          <td className="py-2.5 px-3 font-bold text-white">
                            <span>Sheet #{sheet.sheetNumber}</span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-sky-400">
                            {Math.round(sheet.length * 1000)} mm ({sheet.length.toFixed(3)} m)
                          </td>
                          <td className="py-2.5 px-3 text-white font-sans text-[11px]">
                            {sheet.pieces.map((p, idx) => {
                              const pDone = completedPiecesSet.has(p.id);
                              return (
                                <div
                                  key={p.id}
                                  onClick={() =>
                                    onUpdateInstallProgress && handleTogglePieceDone(p.id)
                                  }
                                  className={`flex items-center gap-1.5 py-0.5 px-1.5 rounded cursor-pointer ${
                                    pDone ? 'bg-emerald-950/60 text-emerald-300' : ''
                                  }`}
                                >
                                  {onUpdateInstallProgress && (
                                    <CheckCircle2
                                      className={`w-3.5 h-3.5 shrink-0 ${
                                        pDone ? 'text-emerald-400' : 'text-slate-600'
                                      }`}
                                    />
                                  )}
                                  <span className="font-mono text-slate-400 font-semibold">
                                    #{idx + 1}:
                                  </span>
                                  <span className="font-mono font-bold text-white tabular-nums">
                                    {Math.round(p.length * 1000)}mm
                                  </span>
                                  <span className="text-[10px] text-slate-400">➔ {p.facetName}</span>
                                </div>
                              );
                            })}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">
                            {sheet.remaining > 0.02 ? `${sheet.remaining.toFixed(2)} m drop` : '0 m (0% scrap)'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`font-bold text-[11px] ${
                                sheet.utilization >= 90 ? 'text-emerald-300' : 'text-amber-300'
                              }`}
                            >
                              {sheet.utilization}%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-sans text-[11px]">
                            {hasRepress ? (
                              <span className="text-purple-300 font-bold flex items-center gap-1">
                                <RotateCw className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                <span>Repressed to {repressTargets}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400">Direct run</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. SETTINGS MODAL / PORTAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 text-white w-full max-w-md rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base text-white">Roofing Layout Settings</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">
                  Effective Cover Width (mm)
                </label>
                <select
                  value={coverWidthMm}
                  onChange={(e) => setCoverWidthMm(+e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-bold"
                >
                  <option value={762}>762mm (Standard Corrugate / Custom Orb)</option>
                  <option value={770}>770mm (Trapezoidal / Trimform)</option>
                  <option value={500}>500mm (Standing Seam / Architectural Tray)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">
                  Profile Handedness / Symmetry
                </label>
                <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <input
                    type="checkbox"
                    id="symCheck"
                    checked={symmetricProfile}
                    onChange={(e) => setSymmetricProfile(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="symCheck" className="text-slate-300 font-semibold cursor-pointer">
                    Symmetric Flute (Permits 180° Offcut Rotation)
                  </label>
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">
                  Maximum Blank Length (m)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={maxBlankLengthM}
                  onChange={(e) => setMaxBlankLengthM(+e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">
                  Eave Gutter Overhang (mm)
                </label>
                <input
                  type="number"
                  step="5"
                  value={eaveOverhangMm}
                  onChange={(e) => setEaveOverhangMm(+e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono font-bold"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  onRegenerateLayout?.();
                }}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow-md"
              >
                Apply &amp; Recompute
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
