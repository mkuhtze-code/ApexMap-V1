import React, { useMemo, useState } from 'react';
import {
  CoilMaterial,
  FlashingProfile,
  OnsiteMaterialOrder,
  Project,
  Quote,
  RoofingProfile
} from '../../types/crm';
import {
  AssignableRoofLine,
  FaceRoofingPack,
  LayoutResult,
  OrderPack,
  RoofAsset,
  RoofBomSummary,
  RoofFlashingAssignment,
  RoofLevel,
  RoofLifecycleStage,
  RoofPlane,
  SheetOrderComparisonSummary,
  SheetOrderMode,
  TakeoffCompletenessReport,
  WallPlan
} from '../../types/exactRoofing';
import { ProfileThumbnail } from '../FlashingWorkshop';
import {
  getFlashingKindDisplayLabel,
  pushAssignmentsToFlashingWorkshop,
  resolveFlashingProductCode
} from '../../utils/exactRoofingFlashingBridge';
import {
  buildCompleteBomMaterialOrder,
  buildQuoteSpreadsheetFromRoofBom,
  exportOrderPackToCsv,
  exportOrderPackToJson,
  exportRoofBomToCsv,
  getSheetOrderAssumptionText
} from '../../utils/exactRoofingBomBridge';
import { buildOrderPackViaPipeline } from '../../utils/roofPipeline';
import {
  MODULAR_COIL_MATERIALS,
  MODULAR_TRAY_PROFILES
} from '../../utils/pricingMatrix';
import { formatNZDWithDecimals } from '../../utils/formatters';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  PenTool,
  Send,
  ShoppingCart,
  Trash2,
  X
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project?: Project;
  quotes?: Quote[];
  activeQuote?: Quote;
  lifecycleStage?: RoofLifecycleStage;
  measureLocked?: boolean;
  activeMemberName?: string;
  assignableLines: AssignableRoofLine[];
  assignments: RoofFlashingAssignment[];
  libraryProfiles: FlashingProfile[];
  layout: LayoutResult | null;
  bom: RoofBomSummary;
  packs?: FaceRoofingPack[];
  planes?: RoofPlane[];
  levels?: RoofLevel[];
  assets?: RoofAsset[];
  wallPlan?: WallPlan | null;
  completenessReport?: TakeoffCompletenessReport;
  areaSanity?: {
    ok: boolean;
    warning?: string;
    inflationRatio?: number;
    modeledAreaM2?: number;
    footprintAreaM2?: number;
    hardBlockBomPush?: boolean;
  };
  orderPack?: OrderPack | null;
  sheetOrderMode?: SheetOrderMode;
  onChangeSheetOrderMode?: (mode: SheetOrderMode) => void;
  sheetOrderComparison?: SheetOrderComparisonSummary;
  initialModalTab?: 'orders' | 'order_pack' | 'quote';
  onSelectLineToAssign: (line: AssignableRoofLine) => void;
  onRemoveAssignment: (lineId: string) => void;
  onMarkOrdered: (opts: { workshop?: boolean; crm?: boolean }) => void;
  onUpdateProject?: (project: Project) => void;
  onPushBomToQuote?: (opts: {
    targetQuoteId: string | 'new';
    profile: RoofingProfile;
    material: CoilMaterial;
    colorName: string;
    markupPercent: number;
    includeHardware: boolean;
    includeUnderlay: boolean;
    includeLabourEstimate: boolean;
    replaceExistingSections: boolean;
  }) => void;
  onOpenFlashingOrders?: () => void;
}

export const ExactRoofingOrderModal: React.FC<Props> = ({
  isOpen,
  onClose,
  project,
  quotes = [],
  activeQuote,
  lifecycleStage = 'measuring',
  measureLocked = false,
  activeMemberName = 'Roofing Lead',
  assignableLines,
  assignments,
  libraryProfiles,
  layout,
  bom,
  packs = [],
  planes = [],
  levels = [],
  assets = [],
  wallPlan = null,
  completenessReport,
  areaSanity,
  orderPack: propOrderPack = null,
  sheetOrderMode,
  onChangeSheetOrderMode,
  sheetOrderComparison,
  initialModalTab,
  onSelectLineToAssign,
  onRemoveAssignment,
  onMarkOrdered,
  onUpdateProject,
  onPushBomToQuote,
  onOpenFlashingOrders
}) => {
  const [modalTab, setModalTab] = useState<'orders' | 'order_pack' | 'quote'>(
    initialModalTab ||
      (measureLocked || lifecycleStage === 'installing'
        ? 'order_pack'
        : lifecycleStage === 'quoting'
        ? 'quote'
        : 'orders')
  );

  // Ordering tab state
  const [supplier, setSupplier] = useState<OnsiteMaterialOrder['supplier']>(
    'The Roofing Store (Highbrook)'
  );
  const [urgency, setUrgency] = useState<OnsiteMaterialOrder['urgency']>('Standard Delivery');
  const [includeSheets, setIncludeSheets] = useState<boolean>(true);
  const [includeFlashings, setIncludeFlashings] = useState<boolean>(true);
  const [includeHardware, setIncludeHardware] = useState<boolean>(true);
  const [includeUnderlay, setIncludeUnderlay] = useState<boolean>(true);

  // Quote push tab state
  const openQuotes = useMemo(() => {
    const unlocked = quotes.filter((q) => !q.isLocked && q.status !== 'superseded');
    if (project) {
      const sameProj = unlocked.filter((q) => q.projectId === project.id);
      const others = unlocked.filter((q) => q.projectId !== project.id);
      return [...sameProj, ...others];
    }
    return unlocked;
  }, [quotes, project]);

  const [targetQuoteId, setTargetQuoteId] = useState<string | 'new'>(
    activeQuote?.id || openQuotes[0]?.id || 'new'
  );
  const [quoteProfile, setQuoteProfile] = useState<RoofingProfile>(
    activeQuote?.profile || project?.profile || 'TRS Corrugate 0.55mm'
  );
  const [quoteMaterial, setQuoteMaterial] = useState<CoilMaterial>(
    activeQuote?.material ||
      project?.material ||
      'Kiwicolour® Vitor+ PVDF (The Roofing Store)'
  );
  const [quoteColor, setQuoteColor] = useState<string>(
    activeQuote?.colorName || project?.colorName || 'FlaxPod'
  );
  const [quoteMarkupPct, setQuoteMarkupPct] = useState<number>(
    activeQuote?.markupPercent || 18
  );
  const [quoteIncHardware, setQuoteIncHardware] = useState<boolean>(true);
  const [quoteIncUnderlay, setQuoteIncUnderlay] = useState<boolean>(true);
  const [quoteIncLabour, setQuoteIncLabour] = useState<boolean>(true);
  const [replaceQuoteSections, setReplaceQuoteSections] = useState<boolean>(false);

  const [dispatchedNotice, setDispatchedNotice] = useState<string | null>(null);
  const [expandedOrderPackGroupMm, setExpandedOrderPackGroupMm] = useState<number | null>(null);
  const [expandedBomGroupMm, setExpandedBomGroupMm] = useState<number | null>(null);

  const activeOrderMode: SheetOrderMode =
    sheetOrderMode ?? bom.sheetOrderMode ?? layout?.sheetOrderMode ?? 'practical';
  const resolvedComparison = sheetOrderComparison ?? bom.comparisonSummary;

  const assignmentMap = useMemo(() => {
    const map = new Map<string, RoofFlashingAssignment>();
    assignments.forEach((a) => map.set(a.lineId, a));
    return map;
  }, [assignments]);

  const unassignedKeyLines = useMemo(() => {
    return assignableLines.filter(
      (line) => !assignmentMap.has(line.lineId) && line.flashingKind !== 'eave'
    );
  }, [assignableLines, assignmentMap]);

  const unassignedEaves = useMemo(() => {
    return assignableLines.filter(
      (line) => !assignmentMap.has(line.lineId) && line.flashingKind === 'eave'
    );
  }, [assignableLines, assignmentMap]);

  const liveQuotePreview = useMemo(() => {
    return buildQuoteSpreadsheetFromRoofBom({
      bom,
      profile: quoteProfile,
      material: quoteMaterial,
      colorName: quoteColor,
      markupPercent: quoteMarkupPct,
      includeHardware: quoteIncHardware,
      includeUnderlay: quoteIncUnderlay,
      includeLabourEstimate: quoteIncLabour
    });
  }, [
    bom,
    quoteProfile,
    quoteMaterial,
    quoteColor,
    quoteMarkupPct,
    quoteIncHardware,
    quoteIncUnderlay,
    quoteIncLabour
  ]);

  const resolvedOrderPack = useMemo(
    () =>
      propOrderPack ||
      buildOrderPackViaPipeline({
        project,
        planes,
        levels,
        layout,
        bom,
        assignableLines,
        assignments,
        libraryProfiles,
        assets,
        wallPlan,
        completenessReport,
        locked: measureLocked,
        sheetOrderMode: activeOrderMode,
        comparisonSummary: resolvedComparison
      }),
    [
      propOrderPack,
      project,
      planes,
      levels,
      layout,
      bom,
      assignableLines,
      assignments,
      libraryProfiles,
      assets,
      wallPlan,
      completenessReport,
      measureLocked,
      activeOrderMode,
      resolvedComparison
    ]
  );

  React.useEffect(() => {
    if (!isOpen) return;
    if (initialModalTab && (initialModalTab !== 'quote' || lifecycleStage === 'quoting')) {
      setModalTab(initialModalTab);
    } else if (measureLocked || lifecycleStage === 'installing') {
      setModalTab('order_pack');
    } else if (lifecycleStage === 'quoting') {
      setModalTab('quote');
    } else {
      setModalTab('orders');
    }
  }, [isOpen, lifecycleStage, measureLocked, initialModalTab]);

  if (!isOpen) return null;

  const isInstalling = lifecycleStage === 'installing';
  const showQuoteTab = lifecycleStage === 'quoting' && Boolean(onPushBomToQuote);
  const isBomAreaBlocked = Boolean(bom.areaSanityWarning) || areaSanity?.ok === false;
  const bomAreaBlockMessage =
    areaSanity?.warning ||
    bom.areaSanityWarning ||
    'Modeled roof area exceeds pitch-adjusted footprint band. Rebuild faces from classification before pushing BOM or Quote.';

  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadBomCsv = () => {
    const csv = exportRoofBomToCsv({
      bom,
      packs,
      projectName: project ? `${project.projectNumber} ${project.title}` : 'ApexMap Roof BOM'
    });
    triggerDownload(
      csv,
      `ApexMap_BOM_${project?.projectNumber || 'ROOF'}_${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv;charset=utf-8;'
    );
    setDispatchedNotice('Exported Bill of Materials & Pack Schedule to CSV.');
  };

  const handleDownloadOrderPackCsv = () => {
    const csv = exportOrderPackToCsv(resolvedOrderPack);
    triggerDownload(
      csv,
      `ApexMap_OrderPack_${resolvedOrderPack.projectNumber}_${new Date().toISOString().slice(0, 10)}.csv`,
      'text/csv;charset=utf-8;'
    );
    setDispatchedNotice('Exported commercial-neutral Order Pack CSV.');
  };

  const handleDownloadOrderPackJson = () => {
    const json = exportOrderPackToJson(resolvedOrderPack);
    triggerDownload(
      json,
      `ApexMap_OrderPack_${resolvedOrderPack.projectNumber}_${new Date().toISOString().slice(0, 10)}.json`,
      'application/json;charset=utf-8;'
    );
    setDispatchedNotice('Exported structured Order Pack JSON.');
  };

  const handleSendToWorkshop = () => {
    if (assignments.length === 0 || isInstalling) return;
    const { pushedCount } = pushAssignmentsToFlashingWorkshop(assignments, project);
    onMarkOrdered({ workshop: true });
    setDispatchedNotice(
      `Sent ${pushedCount} flashing run(s) (${bom.totalFlashingLm} lm) to Flashing Workshop CNC Queue.`
    );
  };

  const handleDispatchCompleteOrder = () => {
    if (isInstalling || isBomAreaBlocked) return;
    const hasSheets = includeSheets && bom.sheetGroups.length > 0;
    const hasFlash = includeFlashings && bom.flashingAssignments.length > 0;
    const hasHw = includeHardware && bom.estimatedScrewBoxes > 0;
    const hasUl = includeUnderlay && bom.estimatedUnderlayRolls > 0;
    if (!hasSheets && !hasFlash && !hasHw && !hasUl) return;

    if (hasFlash) {
      pushAssignmentsToFlashingWorkshop(assignments, project);
    }

    const materialOrder = buildCompleteBomMaterialOrder({
      project,
      orderedBy: activeMemberName,
      supplier,
      urgency,
      bom,
      includeSheets: hasSheets,
      includeFlashings: hasFlash,
      includeHardware: hasHw,
      includeUnderlay: hasUl
    });

    if (project && onUpdateProject) {
      onUpdateProject({
        ...project,
        materialOrders: [materialOrder, ...(project.materialOrders || [])]
      });
    }

    onMarkOrdered({
      workshop: hasFlash,
      crm: true
    });

    setDispatchedNotice(
      `Dispatched BOM Order #${materialOrder.orderNumber} (${materialOrder.items.length} line item${
        materialOrder.items.length === 1 ? '' : 's'
      }) to ${project ? project.title : 'Job Material Orders'}.`
    );
  };

  const handlePushToQuoteClick = () => {
    if (!onPushBomToQuote || !showQuoteTab || isBomAreaBlocked) return;
    onPushBomToQuote({
      targetQuoteId,
      profile: quoteProfile,
      material: quoteMaterial,
      colorName: quoteColor,
      markupPercent: quoteMarkupPct,
      includeHardware: quoteIncHardware,
      includeUnderlay: quoteIncUnderlay,
      includeLabourEstimate: quoteIncLabour,
      replaceExistingSections: replaceQuoteSections
    });
    const destLabel =
      targetQuoteId === 'new'
        ? 'new draft Quote'
        : openQuotes.find((q) => q.id === targetQuoteId)?.quoteNumber || 'Quote';
    setDispatchedNotice(
      `Pushed ${liveQuotePreview.rows.length} BOM line items (${formatNZDWithDecimals(
        liveQuotePreview.totalNZD
      )} incl. GST) into ${destLabel}.`
    );
  };

  return (
    <div
      className="fixed inset-0 z-[72] bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-4xl bg-[#0b101d] border border-slate-800 text-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 bg-slate-950/75 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              {isInstalling
                ? 'Contractor Material Spec Sheet (Read-Only)'
                : lifecycleStage === 'measuring'
                ? 'Pre-Order Material Schedule · Site Measure'
                : 'Bill of Materials · Material & Quoting'}
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
              {project ? `${project.projectNumber} · ${project.title}` : 'Roof Material List (BOM)'}
            </h3>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadBomCsv}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
            {onOpenFlashingOrders && !isInstalling && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFlashingOrders();
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span className="hidden sm:inline">CNC Queue</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
              aria-label="Close BOM"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mode Tabs: Material List · Order Pack · Quote Pricing (Quoting stage only) */}
        <div className="px-4 sm:px-5 py-2 border-b border-slate-800/80 bg-slate-950/40 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setModalTab('orders')}
            className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              modalTab === 'orders'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Material List</span>
          </button>
          <button
            type="button"
            onClick={() => setModalTab('order_pack')}
            className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
              modalTab === 'order_pack'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Order Pack · CSV/JSON</span>
          </button>
          {showQuoteTab && (
            <button
              type="button"
              onClick={() => setModalTab('quote')}
              className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                modalTab === 'quote'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Quote Pricing</span>
            </button>
          )}
          {measureLocked && (
            <span className="ml-auto text-[11px] font-bold text-amber-300 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Measure Locked · Quantities Frozen</span>
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {isBomAreaBlocked && (
            <div className="p-3.5 rounded-2xl bg-rose-950/85 border border-rose-500/60 text-rose-100 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <div className="font-extrabold uppercase tracking-wider text-rose-300">
                  BOM / Quote Push Blocked — Area Sanity Check Failed
                </div>
                <div className="text-rose-100/90 leading-relaxed">{bomAreaBlockMessage}</div>
              </div>
            </div>
          )}

          {dispatchedNotice && (
            <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{dispatchedNotice}</span>
              </div>
              {onOpenFlashingOrders && !isInstalling && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFlashingOrders();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold cursor-pointer shrink-0"
                >
                  View Queue
                </button>
              )}
            </div>
          )}

          {/* Plain Roofer Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
              <div className="text-[10px] font-bold uppercase text-slate-400">Roof Area</div>
              <div className="text-lg font-extrabold font-mono text-white tabular-nums mt-0.5">
                {bom.totalRoofAreaM2.toFixed(1)} m²
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
              <div className="text-[10px] font-bold uppercase text-slate-400">Roof Sheets</div>
              <div className="text-lg font-extrabold font-mono text-sky-400 tabular-nums mt-0.5">
                {bom.totalSheetsCount} ({bom.totalOrderedLm.toFixed(1)}m)
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
              <div className="text-[10px] font-bold uppercase text-slate-400">Flashings</div>
              <div className="text-lg font-extrabold font-mono text-emerald-400 tabular-nums mt-0.5">
                {bom.totalFlashingSticks} pcs ({bom.totalFlashingLm.toFixed(1)}m)
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
              <div className="text-[10px] font-bold uppercase text-slate-400">
                {unassignedKeyLines.length > 0 ? 'Needs Flashing' : 'Order Check'}
              </div>
              <div
                className={`text-lg font-extrabold font-mono tabular-nums mt-0.5 ${
                  unassignedKeyLines.length > 0 ? 'text-amber-300' : 'text-emerald-400'
                }`}
              >
                {unassignedKeyLines.length > 0
                  ? `${unassignedKeyLines.length} lines`
                  : `${bom.wastePercent}% waste`}
              </div>
            </div>
          </div>

          {modalTab === 'quote' && showQuoteTab ? (
            /* ===================== TAB 2: PUSH BOM TO QUOTE (Quoting stage only) ===================== */
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-blue-300">
                    Quote Profile, Material &amp; Margin
                  </h4>
                  <span className="text-[11px] font-mono text-slate-400">
                    {liveQuotePreview.rows.length} line items
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Destination Quote
                    </label>
                    <select
                      value={targetQuoteId}
                      onChange={(e) => setTargetQuoteId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none"
                    >
                      {openQuotes.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.quoteNumber} · {q.title || q.clientName} ({q.status})
                        </option>
                      ))}
                      <option value="new">+ Create Brand New Draft Quote</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Roof Profile
                    </label>
                    <select
                      value={quoteProfile}
                      onChange={(e) => setQuoteProfile(e.target.value as RoofingProfile)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none"
                    >
                      {MODULAR_TRAY_PROFILES.map((p) => (
                        <option key={p.profile} value={p.profile}>
                          {p.profile}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                      Coil Material
                    </label>
                    <select
                      value={quoteMaterial}
                      onChange={(e) => setQuoteMaterial(e.target.value as CoilMaterial)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none"
                    >
                      {MODULAR_COIL_MATERIALS.map((m) => (
                        <option key={m.code} value={m.material}>
                          {m.material}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                        Colour
                      </label>
                      <input
                        type="text"
                        value={quoteColor}
                        onChange={(e) => setQuoteColor(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                        Markup (%)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max="80"
                        value={quoteMarkupPct}
                        onChange={(e) => setQuoteMarkupPct(Math.max(0, +e.target.value || 0))}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={quoteIncHardware}
                      onChange={(e) => setQuoteIncHardware(e.target.checked)}
                      className="accent-amber-500 w-4 h-4"
                    />
                    <span className="font-semibold text-slate-200">
                      Screws &amp; Closures ({bom.estimatedScrewBoxes} boxes)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={quoteIncUnderlay}
                      onChange={(e) => setQuoteIncUnderlay(e.target.checked)}
                      className="accent-sky-500 w-4 h-4"
                    />
                    <span className="font-semibold text-slate-200">
                      Underlay ({bom.estimatedUnderlayRolls} rolls)
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={quoteIncLabour}
                      onChange={(e) => setQuoteIncLabour(e.target.checked)}
                      className="accent-indigo-500 w-4 h-4"
                    />
                    <span className="font-semibold text-slate-200">Install Labour</span>
                  </label>

                  {targetQuoteId !== 'new' && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={replaceQuoteSections}
                        onChange={(e) => setReplaceQuoteSections(e.target.checked)}
                        className="accent-rose-500 w-4 h-4"
                      />
                      <span className="font-semibold text-slate-300">
                        Replace existing quote rows
                      </span>
                    </label>
                  )}
                </div>
              </div>

              {/* Live Generated Quote Preview */}
              <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                    Quote Sell Summary
                  </span>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    Cost: {formatNZDWithDecimals(liveQuotePreview.costTotalNZD)}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <div className="text-[10px] font-sans text-slate-400">Roof Sheets</div>
                    <div className="font-bold text-white mt-0.5">
                      {formatNZDWithDecimals(liveQuotePreview.materialTotalNZD)}
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <div className="text-[10px] font-sans text-slate-400">Flashings</div>
                    <div className="font-bold text-emerald-400 mt-0.5">
                      {formatNZDWithDecimals(liveQuotePreview.flashingsTotalNZD)}
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <div className="text-[10px] font-sans text-slate-400">Screws &amp; UL</div>
                    <div className="font-bold text-amber-300 mt-0.5">
                      {formatNZDWithDecimals(liveQuotePreview.hardwareTotalNZD)}
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <div className="text-[10px] font-sans text-slate-400">Install Labour</div>
                    <div className="font-bold text-indigo-300 mt-0.5">
                      {formatNZDWithDecimals(liveQuotePreview.labourTotalNZD)}
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
                  <div className="text-slate-400">
                    Excl. GST:{' '}
                    <strong className="text-white">
                      {formatNZDWithDecimals(liveQuotePreview.subtotalNZD)}
                    </strong>{' '}
                    · GST: {formatNZDWithDecimals(liveQuotePreview.gstNZD)}
                  </div>
                  <div className="text-base font-extrabold text-emerald-400">
                    Quote Total: {formatNZDWithDecimals(liveQuotePreview.totalNZD)}
                  </div>
                </div>
              </div>
            </div>
          ) : modalTab === 'order_pack' ? (
            /* ===================== TAB: COMMERCIAL-NEUTRAL ORDER PACK ===================== */
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase border ${
                          resolvedOrderPack.locked
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {resolvedOrderPack.locked ? 'Locked Order Pack' : 'Draft Preview (Unlockable)'}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/35 text-sky-300 text-[10px] font-extrabold">
                        {(resolvedOrderPack.assumptions.sheetOrderMode || activeOrderMode) === 'practical'
                          ? 'Practical (Site Cut List)'
                          : 'Optimized (Tight Nest)'}
                      </span>
                      <span className="text-[11px] font-mono text-emerald-400 font-bold">
                        Quantities &amp; Product Codes Only · Zero $
                      </span>
                    </div>
                    <div className="text-xs text-slate-300">
                      {resolvedOrderPack.assumptions.profile} · {resolvedOrderPack.assumptions.material} ·{' '}
                      {resolvedOrderPack.assumptions.color}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadOrderPackCsv}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export Order Pack CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadOrderPackJson}
                      className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export JSON</span>
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/80">
                  <span>
                    {resolvedOrderPack.assumptions.sheetOrderAssumption ||
                      getSheetOrderAssumptionText(
                        resolvedOrderPack.assumptions.sheetOrderMode || activeOrderMode
                      )}
                  </span>
                  {(resolvedOrderPack.assumptions.comparisonSummary || resolvedComparison) && (
                    <span className="font-mono text-slate-300 tabular-nums">
                      Practical:{' '}
                      {(
                        resolvedOrderPack.assumptions.comparisonSummary || resolvedComparison!
                      ).practicalOrderedLm.toFixed(1)}{' '}
                      lm (
                      {(
                        resolvedOrderPack.assumptions.comparisonSummary || resolvedComparison!
                      ).practicalDistinctLengths}{' '}
                      len) · Optimized:{' '}
                      {(
                        resolvedOrderPack.assumptions.comparisonSummary || resolvedComparison!
                      ).optimizedOrderedLm.toFixed(1)}{' '}
                      lm (
                      {(
                        resolvedOrderPack.assumptions.comparisonSummary || resolvedComparison!
                      ).optimizedDistinctLengths}{' '}
                      len)
                    </span>
                  )}
                </div>
              </div>

              {/* Sheets Schedule */}
              <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-white">
                    1. Sheet Schedule ({resolvedOrderPack.totals.totalSheets} sheets ·{' '}
                    {resolvedOrderPack.totals.totalOrderedLm.toFixed(3)} lm ordered)
                  </div>
                  {!measureLocked && !isInstalling && onChangeSheetOrderMode && (
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
                </div>
                <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Code</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                        <th className="py-2 px-3 text-right">Order Cut</th>
                        <th className="py-2 px-3">Faces &amp; Cut Details</th>
                        <th className="py-2 px-3 text-right">Total lm</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                      {resolvedOrderPack.sheets.map((sh) => {
                        const cutDetails = sh.cut_details || [];
                        const hasCutDowns = cutDetails.some((d) => d.requiredCutMm < sh.length_mm - 2);
                        const isExpanded = expandedOrderPackGroupMm === sh.length_mm;
                        return (
                          <React.Fragment key={`${sh.code}-${sh.length_mm}`}>
                            <tr>
                              <td className="py-2 px-3 font-bold text-sky-300 whitespace-nowrap">{sh.code}</td>
                              <td className="py-2 px-3 text-right font-black text-white">{sh.qty}</td>
                              <td className="py-2 px-3 text-right font-extrabold text-white whitespace-nowrap">
                                {sh.length_mm}mm
                              </td>
                              <td className="py-2 px-3 font-sans text-slate-300">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span>{sh.notes}</span>
                                  {sh.is_override && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                                      Site Override (was {sh.modeled_length_mm}mm)
                                    </span>
                                  )}
                                  {hasCutDowns && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedOrderPackGroupMm(isExpanded ? null : sh.length_mm)
                                      }
                                      className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-sky-300 cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <span>
                                        {isExpanded
                                          ? 'Hide cut details'
                                          : `Cut details (${cutDetails.length})`}
                                      </span>
                                      {isExpanded ? (
                                        <ChevronUp className="w-3 h-3" />
                                      ) : (
                                        <ChevronDown className="w-3 h-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                                {sh.total_lm.toFixed(3)}
                              </td>
                            </tr>
                            {isExpanded && cutDetails.length > 0 && (
                              <tr className="bg-slate-900/50">
                                <td colSpan={5} className="px-3 py-2 text-[11px] text-slate-300">
                                  <div className="space-y-1">
                                    {cutDetails.map((d) => (
                                      <div
                                        key={`${d.faceCode}-${d.requiredCutMm}`}
                                        className="flex items-center justify-between gap-2"
                                      >
                                        <span>
                                          {d.qty} × <strong className="text-white">{d.requiredCutMm} mm</strong>{' '}
                                          <span className="font-sans text-slate-400">
                                            ({d.faceCode} · {d.faceName})
                                          </span>
                                        </span>
                                        <span className="font-sans text-[10px] text-sky-300">
                                          {d.requiredCutMm < sh.length_mm - 2
                                            ? `cut from ${sh.length_mm}mm`
                                            : `full ${sh.length_mm}mm run`}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-900/90 border-t border-slate-700 font-mono tabular-nums">
                      <tr>
                        <td className="py-2 px-3 font-black text-sky-300" colSpan={4}>
                          Reconciled Sheet Sum ({resolvedOrderPack.totals.totalSheets} sheets ·{' '}
                          {resolvedOrderPack.totals.offcutsReusedCount} offcuts repressed separately)
                        </td>
                        <td className="py-2 px-3 text-right font-black text-sky-300">
                          {resolvedOrderPack.totals.totalOrderedLm.toFixed(3)} lm
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Flashings Schedule */}
              <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <div className="text-xs font-extrabold uppercase tracking-wider text-white">
                  2. Grouped Flashing Schedule ({resolvedOrderPack.totals.flashingSticks} sticks ·{' '}
                  {resolvedOrderPack.totals.flashingTotalLm.toFixed(2)} lm)
                </div>
                {resolvedOrderPack.flashings.length === 0 ? (
                  <div className="text-xs text-slate-400 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    No flashing assignments recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/70">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3">Code</th>
                          <th className="py-2 px-3">Profile &amp; Bends</th>
                          <th className="py-2 px-3 text-right">Cover</th>
                          <th className="py-2 px-3 text-right">Qty × Stick</th>
                          <th className="py-2 px-3 text-right">Total lm</th>
                          <th className="py-2 px-3">Runs &amp; Shop Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                        {resolvedOrderPack.flashings.map((fl, idx) => (
                          <tr key={`${fl.code}-${fl.length_mm}-${fl.cover_mm ?? 0}-${idx}`}>
                            <td className="py-2 px-3 font-bold text-sky-300 whitespace-nowrap">
                              {fl.code}
                              {fl.source === 'rule' && (
                                <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-sans uppercase">
                                  Rule
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-sans">
                              <div className="font-bold text-white">{fl.description}</div>
                              <div className="text-[11px] font-mono text-slate-400">
                                {fl.girth_tier} · {fl.color}
                                {fl.key_angles_deg.length > 0
                                  ? ` · [${fl.key_angles_deg.join('°/')}°]`
                                  : ''}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-slate-300 whitespace-nowrap">
                              {fl.cover_mm ? `${fl.cover_mm}mm` : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-white whitespace-nowrap">
                              {fl.qty} × {fl.length_mm}mm
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                              {fl.total_lm.toFixed(2)}
                            </td>
                            <td className="py-2 px-3 font-sans text-slate-300">
                              <div>{fl.notes}</div>
                              {fl.shop_notes && (
                                <div className="text-[11px] text-amber-300 mt-0.5">{fl.shop_notes}</div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Penetrations & Hardware */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-white">
                    3. Penetrations ({resolvedOrderPack.penetrations.length})
                  </div>
                  {resolvedOrderPack.penetrations.length === 0 ? (
                    <div className="text-xs text-slate-500">None modeled</div>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      {resolvedOrderPack.penetrations.map((pen) => (
                        <div
                          key={pen.id}
                          className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-mono font-bold text-cyan-300">{pen.code}</div>
                            <div className="text-[11px] text-slate-400 truncate">{pen.notes}</div>
                          </div>
                          <span className="font-mono font-bold text-white shrink-0">1 ea</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 space-y-2">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-white">
                    4. Hardware &amp; Underlay
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {resolvedOrderPack.hardware.map((hw) => (
                      <div
                        key={hw.code}
                        className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-sky-300">{hw.code}</div>
                          <div className="text-[11px] text-slate-300 truncate">{hw.description}</div>
                        </div>
                        <span className="font-mono font-bold text-white shrink-0">
                          {hw.qty} {hw.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Wall Cladding & Openings Schedule (when present) */}
              {resolvedOrderPack.walls && (
                <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-white">
                    5. Wall Cladding &amp; Returns ({resolvedOrderPack.walls.detailedFaces}/
                    {resolvedOrderPack.walls.totalFaces} faces ·{' '}
                    {resolvedOrderPack.walls.totalNetAreaM2.toFixed(1)} m² net ·{' '}
                    {resolvedOrderPack.walls.returnFacesCount} returns)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {resolvedOrderPack.walls.byCladding.map((wl) => (
                      <div
                        key={wl.code}
                        className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div>
                          <div className="font-mono font-bold text-emerald-300">{wl.code}</div>
                          <div className="text-slate-300 font-semibold">{wl.description}</div>
                          <div className="text-[11px] text-slate-400">{wl.notes}</div>
                        </div>
                        <span className="font-mono font-black text-white">
                          {wl.net_area_m2.toFixed(1)} m²
                        </span>
                      </div>
                    ))}
                  </div>
                  {resolvedOrderPack.walls.openingsSchedule.length > 0 && (
                    <div className="text-[11px] font-mono text-slate-300 bg-slate-950/70 border border-slate-800 rounded-xl p-2.5">
                      Openings ({resolvedOrderPack.walls.openingsSchedule.length}):{' '}
                      {resolvedOrderPack.walls.openingsSchedule
                        .map((op) => `${op.wall_code} ${op.label} ${op.width_mm}×${op.height_mm}mm`)
                        .join(' · ')}
                    </div>
                  )}
                </div>
              )}

              {/* Assumptions & Completeness */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Cover {resolvedOrderPack.assumptions.coverWidthMm}mm · End-lap{' '}
                  {resolvedOrderPack.assumptions.endLapMm}mm · Overhang{' '}
                  {resolvedOrderPack.assumptions.overhangMm}mm ·{' '}
                  {resolvedOrderPack.assumptions.productCodePolicy}
                </span>
                <span className="font-mono font-bold text-slate-300">
                  Blockers: {resolvedOrderPack.completenessReport.blockersCount} · Warnings:{' '}
                  {resolvedOrderPack.completenessReport.warningsCount}
                </span>
              </div>
            </div>
          ) : (
            /* ===================== TAB 1: CLEAN PLAIN-ENGLISH MATERIAL ORDER SHEET ===================== */
            <div className="space-y-4">
              {/* 1. Roof Sheets to Order */}
              {bom.sheetGroups.length > 0 && (
                <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-extrabold uppercase tracking-wider text-white">
                          1. Roof Sheets to Order ({bom.totalSheetsCount} Sheets · {bom.totalOrderedLm.toFixed(1)} lm ordered)
                        </h4>
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/35 text-sky-300 text-[10px] font-bold">
                          {activeOrderMode === 'practical' ? 'Practical (Site Cut List)' : 'Optimized (Tight Nest)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
                        {project?.profile || 'TRS Corrugate 0.55mm'} · {project?.colorName || 'FlaxPod'} · Net roof {bom.totalNetRoofLm.toFixed(1)} lm · {bom.totalOffcutsReused ?? 0} offcuts repressed (+{bom.savedOffcutLm.toFixed(1)}m saved)
                      </p>
                    </div>
                    {!measureLocked && !isInstalling && onChangeSheetOrderMode && (
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
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 bg-slate-950/60 border border-slate-800/80 rounded-xl px-3 py-2">
                    <span>{bom.sheetOrderAssumption || getSheetOrderAssumptionText(activeOrderMode)}</span>
                    {resolvedComparison && (
                      <span className="font-mono text-slate-300 tabular-nums">
                        Practical: {resolvedComparison.practicalOrderedLm.toFixed(1)} lm ({resolvedComparison.practicalDistinctLengths} len) · Optimized: {resolvedComparison.optimizedOrderedLm.toFixed(1)} lm ({resolvedComparison.optimizedDistinctLengths} len)
                      </span>
                    )}
                  </div>

                  <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950/70">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3">Qty</th>
                          <th className="py-2 px-3">Sheet Cut Length</th>
                          <th className="py-2 px-3">Goes On Faces</th>
                          <th className="py-2 px-3 text-right">Total Metres</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                        {bom.sheetGroups.map((grp) => {
                          const cutDetails = grp.cutDetails || [];
                          const hasCutDowns = cutDetails.some((d) => d.requiredCutMm < grp.lengthMm - 2);
                          const isExpanded = expandedBomGroupMm === grp.lengthMm;
                          return (
                            <React.Fragment key={grp.lengthMm}>
                              <tr className="hover:bg-slate-900/50">
                                <td className="py-2 px-3 font-black text-white">{grp.count} @</td>
                                <td className="py-2 px-3 font-extrabold text-sky-400">
                                  {grp.lengthMm} mm ({grp.lengthMm % 10 !== 0 ? grp.lengthM.toFixed(3) : grp.lengthM.toFixed(2)}m)
                                  {grp.hasSiteOverride && (
                                    <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-sans font-bold">
                                      Site Override (was {grp.modeledLengthMm}mm)
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-sans text-slate-300">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span>
                                      Faces {grp.targetCodes.join(', ') || 'Main'}
                                      {grp.hasOffcutHarvest ? ' · includes repressed offcut' : ''}
                                    </span>
                                    {hasCutDowns && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedBomGroupMm(isExpanded ? null : grp.lengthMm)
                                        }
                                        className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold text-sky-300 cursor-pointer inline-flex items-center gap-1"
                                      >
                                        <span>
                                          {isExpanded
                                            ? 'Hide cuts'
                                            : `Cut breakdown (${cutDetails.length})`}
                                        </span>
                                        {isExpanded ? (
                                          <ChevronUp className="w-3 h-3" />
                                        ) : (
                                          <ChevronDown className="w-3 h-3" />
                                        )}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-slate-200">
                                  {(grp.count * grp.lengthM).toFixed(2)} lm
                                </td>
                              </tr>
                              {isExpanded && cutDetails.length > 0 && (
                                <tr className="bg-slate-900/50">
                                  <td colSpan={4} className="px-3 py-2 text-[11px] text-slate-300">
                                    <div className="space-y-1">
                                      {cutDetails.map((d) => (
                                        <div
                                          key={`${d.faceCode}-${d.requiredCutMm}`}
                                          className="flex items-center justify-between gap-2"
                                        >
                                          <span>
                                            {d.qty} × <strong className="text-white">{d.requiredCutMm} mm</strong>{' '}
                                            <span className="font-sans text-slate-400">
                                              ({d.faceCode} · {d.faceName})
                                            </span>
                                          </span>
                                          <span className="font-sans text-[10px] text-sky-300">
                                            {d.requiredCutMm < grp.lengthMm - 2
                                              ? `cut from ${grp.lengthMm}mm`
                                              : `full ${grp.lengthMm}mm run`}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-900/90 border-t border-slate-700 font-mono tabular-nums">
                        <tr>
                          <td className="py-2 px-3 font-black text-sky-300" colSpan={3}>
                            {bom.totalSheetsCount} sheets ordered · {bom.totalOffcutsReused ?? 0} offcuts repressed separately
                          </td>
                          <td className="py-2 px-3 text-right font-black text-sky-300">
                            {bom.totalOrderedLm.toFixed(2)} lm
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* 2. Flashings to Order / Fold */}
              <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-white">
                      2. Flashings ({assignments.length} Assigned · {bom.totalFlashingLm.toFixed(1)} m total)
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Includes ridge, hip, valley, barge, and apron lengths measured from roof slopes
                    </p>
                  </div>
                  {assignments.length > 0 && !isInstalling && (
                    <button
                      type="button"
                      onClick={handleSendToWorkshop}
                      className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send to CNC Folding</span>
                    </button>
                  )}
                </div>

                {assignments.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/50 text-center space-y-1">
                    <div className="text-xs font-bold text-slate-300">
                      No flashing profiles assigned yet
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Tap Assign on any roof line below or on the Plan before ordering.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignments.map((assign) => {
                      const matchedProfile = libraryProfiles.find(
                        (p) => p.id === assign.profileId
                      );
                      const matchingLine = assignableLines.find(
                        (l) => l.lineId === assign.lineId
                      );
                      return (
                        <div
                          key={assign.id}
                          className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {matchedProfile && (
                              <div className="w-20 shrink-0 bg-white rounded-lg overflow-hidden">
                                <ProfileThumbnail profile={matchedProfile} />
                              </div>
                            )}
                            <div className="space-y-0.5 min-w-0">
                              <div className="text-xs font-extrabold text-white truncate">
                                {assign.lineLabel} · {getFlashingKindDisplayLabel(assign.flashingKind)}
                              </div>
                              <div className="text-xs font-semibold text-sky-400 truncate">
                                [{resolveFlashingProductCode({ profileId: assign.profileId, flashingKind: assign.flashingKind, explicitCode: assign.productCode, blankWidthMm: assign.developedBlankWidthMm })}] {assign.profileName}
                              </div>
                              <div className="text-[11px] font-mono text-slate-300 tabular-nums">
                                Order: <strong className="text-white">{assign.quantity} × {assign.pieceLengthLm.toFixed(2)}m</strong> ({assign.totalLinearMetres.toFixed(1)}m total) · Girth {assign.developedBlankWidthMm || 350}mm{assign.bendCount !== undefined ? ` · ${assign.bendCount} bends` : ''}{assign.hasHemCrush ? ' · Hem/Crush' : ''} · {assign.colorName || 'FlaxPod'}
                              </div>
                            </div>
                          </div>

                          {!isInstalling && (
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                              {(assign.orderedToWorkshop || assign.orderedToCrm) && (
                                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1 pr-1">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Queued</span>
                                </span>
                              )}
                              {matchingLine && !measureLocked && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onSelectLineToAssign(matchingLine);
                                  }}
                                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
                                >
                                  Edit
                                </button>
                              )}
                              {!measureLocked && (
                                <button
                                  type="button"
                                  onClick={() => onRemoveAssignment(assign.lineId)}
                                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-900/70 text-slate-400 hover:text-rose-300 cursor-pointer"
                                  title="Remove assignment"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Unassigned Key Lines */}
                {!measureLocked && !isInstalling && unassignedKeyLines.length > 0 && (
                  <div className="pt-2 space-y-2 border-t border-slate-800">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-300">
                      Still Needs Flashing Profile ({unassignedKeyLines.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {unassignedKeyLines.map((line) => (
                        <div
                          key={line.lineId}
                          className="p-2.5 rounded-xl bg-slate-950/70 border border-amber-500/30 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-200 truncate">
                              {line.label}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                              {getFlashingKindDisplayLabel(line.flashingKind)} · {line.trueSlopeLengthM.toFixed(2)}m slope run
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onSelectLineToAssign(line);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                          >
                            <PenTool className="w-3 h-3" />
                            <span>Assign</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!measureLocked && !isInstalling && unassignedEaves.length > 0 && (
                  <details className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-2.5">
                    <summary className="text-xs font-bold text-slate-400 cursor-pointer select-none">
                      Optional Eaves Drip Starters ({unassignedEaves.length} edges)
                    </summary>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {unassignedEaves.map((line) => (
                        <div
                          key={line.lineId}
                          className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-300 truncate">
                              {line.label}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                              {line.trueSlopeLengthM.toFixed(2)}m
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onSelectLineToAssign(line);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white text-[11px] font-bold cursor-pointer shrink-0"
                          >
                            Assign
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {/* 3. Screws, Underlay & Penetrations */}
              <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                <span className="text-xs font-extrabold uppercase tracking-wider text-white block">
                  3. Screws, Underlay &amp; Penetration Kits
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <div className="text-[10px] font-sans text-slate-400">Roof Screws (500/box)</div>
                    <div className="text-white font-bold mt-0.5">
                      {bom.estimatedScrewBoxes} boxes ({bom.estimatedScrewCount})
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <div className="text-[10px] font-sans text-slate-400">Underlay (75m² rolls)</div>
                    <div className="text-sky-300 font-bold mt-0.5">
                      {bom.estimatedUnderlayRolls} rolls
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <div className="text-[10px] font-sans text-slate-400">Foam Closures</div>
                    <div className="text-amber-300 font-bold mt-0.5">
                      {bom.estimatedFoamClosureM} m
                    </div>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <div className="text-[10px] font-sans text-slate-400">Skylight / Pipe Kits</div>
                    <div className="text-emerald-300 font-bold mt-0.5">
                      {bom.penetrationKitCount} kits
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Place Material Order (Hidden in Installing stage) */}
              {!isInstalling && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                  <div className="text-xs font-extrabold uppercase tracking-wider text-white">
                    4. Place Supplier Material Order
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                        Supplier Branch
                      </label>
                      <select
                        value={supplier}
                        onChange={(e) =>
                          setSupplier(e.target.value as OnsiteMaterialOrder['supplier'])
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none"
                      >
                        <option value="The Roofing Store (Highbrook)">
                          The Roofing Store (Highbrook)
                        </option>
                        <option value="The Roofing Store (Albany)">
                          The Roofing Store (Albany)
                        </option>
                        <option value="The Roofing Store (East Tamaki)">
                          The Roofing Store (East Tamaki)
                        </option>
                        <option value="The Roofing Store (Hamilton)">
                          The Roofing Store (Hamilton)
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                        Delivery Timing
                      </label>
                      <select
                        value={urgency}
                        onChange={(e) =>
                          setUrgency(e.target.value as OnsiteMaterialOrder['urgency'])
                        }
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold text-white outline-none"
                      >
                        <option value="Standard Delivery">Standard Delivery (2 days)</option>
                        <option value="Urgent Same-Day HIAB">Urgent Same-Day HIAB</option>
                        <option value="Foreman Branch Collection">
                          Foreman Branch Collection
                        </option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeSheets}
                        onChange={(e) => setIncludeSheets(e.target.checked)}
                        className="accent-sky-500 w-4 h-4"
                      />
                      <span className="font-semibold text-slate-200">
                        Roof Sheets ({bom.totalSheetsCount})
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeFlashings}
                        onChange={(e) => setIncludeFlashings(e.target.checked)}
                        className="accent-emerald-500 w-4 h-4"
                      />
                      <span className="font-semibold text-slate-200">
                        Flashings ({assignments.length})
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeHardware}
                        onChange={(e) => setIncludeHardware(e.target.checked)}
                        className="accent-amber-500 w-4 h-4"
                      />
                      <span className="font-semibold text-slate-200">
                        Screws ({bom.estimatedScrewBoxes} boxes)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeUnderlay}
                        onChange={(e) => setIncludeUnderlay(e.target.checked)}
                        className="accent-purple-500 w-4 h-4"
                      />
                      <span className="font-semibold text-slate-200">
                        Underlay ({bom.estimatedUnderlayRolls} rolls)
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3.5 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-2 pb-[calc(0.9rem+env(safe-area-inset-bottom))]">
          <span className="text-[11px] text-slate-400">
            {isInstalling
              ? 'Read-only contractor reference'
              : modalTab === 'quote'
              ? 'Updates Quote rows & saves roof model'
              : 'Creates draft Material Order & sends flashings to CNC Queue'}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[42px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
            >
              Close
            </button>
            {!isInstalling && (
              modalTab === 'quote' && showQuoteTab ? (
                <button
                  type="button"
                  onClick={handlePushToQuoteClick}
                  disabled={isBomAreaBlocked}
                  className="px-5 py-2.5 min-h-[42px] rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{isBomAreaBlocked ? 'Blocked by Area Check' : 'Push BOM to Quote'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDispatchCompleteOrder}
                  disabled={
                    isBomAreaBlocked ||
                    ((!includeSheets || bom.sheetGroups.length === 0) &&
                      (!includeFlashings || assignments.length === 0) &&
                      (!includeHardware || bom.estimatedScrewBoxes === 0) &&
                      (!includeUnderlay || bom.estimatedUnderlayRolls === 0))
                  }
                  className="px-5 py-2.5 min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>{isBomAreaBlocked ? 'Blocked by Area Check' : 'Place Material Order'}</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
