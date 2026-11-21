import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronDown,
  Compass,
  Loader2,
  Mic,
  MicOff,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import {
  AssignableRoofLine,
  FaceRoofingPack,
  LayoutResult,
  OrderPack,
  RoofAsset,
  RoofFlashingAssignment,
  RoofLevel,
  RoofLifecycleStage,
  RoofPlane,
  SheetSpec,
  TakeoffCompletenessIssue,
  TakeoffCompletenessReport,
  WallPlan
} from '../../types/exactRoofing';
import {
  buildCalmStageGuidance,
  CalmStageActionItem,
  DeterministicRoofPatch,
  runDeterministicRoofAudit
} from '../../utils/exactRoofingAiBridge';
import { dist } from '../../utils/exactRoofingEngine';

interface SuggestedAction {
  type: 'select_plane' | 'open_flashings' | 'open_bom' | 'open_bom_quote' | 'open_audit' | 'none';
  targetId?: string;
  label?: string;
}

interface AssistantResponse {
  headline: string;
  answer: string;
  checklist: string[];
  suggestedAction?: SuggestedAction;
}

interface VisionScanResponse {
  points: { x: number; y: number }[];
  recommendedPitchDeg: number;
  roofStyle: string;
  gableEdgeIndices: number[];
  summary: string;
  fromVision?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lifecycleStage: RoofLifecycleStage;
  measureLocked?: boolean;
  projectTitle: string;
  profileName?: string;
  windZone?: string;
  planes: RoofPlane[];
  levels: RoofLevel[];
  selectedPlane: RoofPlane | null;
  assets: RoofAsset[];
  pitchBreaks?: any[];
  sheetSpec: SheetSpec;
  assignableLines: AssignableRoofLine[];
  flashingAssignments: RoofFlashingAssignment[];
  flashingCount: number;
  unassignedLineCount: number;
  layout: LayoutResult | null;
  roofingPacks: FaceRoofingPack[];
  completedPlaneIds: string[];
  wallPlan?: WallPlan | null;
  completenessReport?: TakeoffCompletenessReport | null;
  orderPack?: OrderPack | null;
  onApplyScannedRoof: (
    points: { x: number; y: number }[],
    pitchDeg: number,
    gableEdgeIndices?: number[]
  ) => void;
  onApplyDeterministicPatches: (patches: DeterministicRoofPatch[]) => void;
  onJumpToCompletenessIssue?: (issue: TakeoffCompletenessIssue) => void;
  onOpenWallPlan?: () => void;
  onExecuteAction: (action: SuggestedAction) => void;
  onOpenFullCopilot: () => void;
}

const STAGE_PROMPTS: Record<RoofLifecycleStage, string[]> = {
  quoting: [
    'What is the lowest-waste start face?',
    'Check missing flashings & wall gaps',
    'Verify NZBC min pitch & wind fixings'
  ],
  measuring: [
    'Is this roof measure ready to lock?',
    'Which roof lines still need flashings?',
    'Check dormer & skylight sheet splits'
  ],
  installing: [
    'Which pack is next and which side laps?',
    'Explain cut-downs & repress offcuts for this face',
    'Fastener pattern for this roof pitch'
  ]
};

export const ExactRoofingAiDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  lifecycleStage,
  measureLocked = false,
  projectTitle,
  profileName = 'TRS Plumbdeck Trapezoidal 0.55mm',
  windZone = 'Very High',
  planes,
  levels,
  selectedPlane,
  assets,
  pitchBreaks = [],
  sheetSpec,
  assignableLines,
  flashingAssignments,
  flashingCount,
  unassignedLineCount,
  layout,
  roofingPacks,
  completedPlaneIds,
  wallPlan = null,
  completenessReport = null,
  orderPack = null,
  onApplyScannedRoof,
  onApplyDeterministicPatches,
  onJumpToCompletenessIssue,
  onOpenWallPlan,
  onExecuteAction,
  onOpenFullCopilot
}) => {
  // Hybrid Deterministic Solver State
  const [intentPrompt, setIntentPrompt] = useState<string>('');
  const [isSolvingEngine, setIsSolvingEngine] = useState<boolean>(false);
  const [aiSolverSummary, setAiSolverSummary] = useState<string | null>(null);
  const [aiTradeNotes, setAiTradeNotes] = useState<string[]>([]);
  const [aiProposedPatches, setAiProposedPatches] = useState<DeterministicRoofPatch[] | null>(null);
  const [appliedPatchIds, setAppliedPatchIds] = useState<Set<string>>(new Set());

  // Field Assistant State
  const [question, setQuestion] = useState<string>('');
  const [isLoadingReply, setIsLoadingReply] = useState<boolean>(false);
  const [reply, setReply] = useState<AssistantResponse | null>(null);
  const [isListening, setIsListening] = useState<boolean>(false);

  // Vision Scan State
  const [scanHint, setScanHint] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<VisionScanResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Real-time local deterministic self-audit (zero latency)
  const deterministicAudit = useMemo(
    () =>
      runDeterministicRoofAudit({
        planes,
        levels,
        layout,
        sheetSpec,
        assignableLines,
        flashingAssignments,
        assets,
        pitchBreaks,
        profileName,
        windZone,
        prevailingWind: 'SW'
      }),
    [
      planes,
      levels,
      layout,
      sheetSpec,
      assignableLines,
      flashingAssignments,
      assets,
      pitchBreaks,
      profileName,
      windZone
    ]
  );

  const stageGuidance = useMemo(
    () =>
      buildCalmStageGuidance({
        stage: lifecycleStage,
        measureLocked,
        planes,
        layout,
        orderPack,
        completenessReport,
        wallPlan,
        roofingPacks,
        completedPlaneIds,
        selectedPlane,
        auditReport: deterministicAudit
      }),
    [
      lifecycleStage,
      measureLocked,
      planes,
      layout,
      orderPack,
      completenessReport,
      wallPlan,
      roofingPacks,
      completedPlaneIds,
      selectedPlane,
      deterministicAudit
    ]
  );

  if (!isOpen) return null;

  const isReadOnlyStage = lifecycleStage === 'installing' || measureLocked;
  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const activePatches = (aiProposedPatches ?? deterministicAudit.recommendedPatches).filter(
    (p) => !appliedPatchIds.has(p.id)
  );

  const handleTriggerStageAction = (item: CalmStageActionItem) => {
    if (item.kind === 'fix_issue' && item.issue && onJumpToCompletenessIssue) {
      onJumpToCompletenessIssue(item.issue);
      onClose();
      return;
    }
    if (item.kind === 'apply_patch' && item.patch) {
      if (isReadOnlyStage) return;
      onApplyDeterministicPatches([item.patch]);
      setAppliedPatchIds((prev) => new Set(prev).add(item.patch!.id));
      return;
    }
    if (item.kind === 'open_wall_plan') {
      onOpenWallPlan?.();
      onClose();
      return;
    }
    if (item.kind === 'open_order_pack') {
      onExecuteAction({ type: 'open_bom' });
      onClose();
      return;
    }
    if (item.kind === 'open_flashings') {
      onExecuteAction({ type: 'open_flashings' });
      onClose();
      return;
    }
    if (item.kind === 'select_plane' && item.targetPlaneId) {
      onExecuteAction({ type: 'select_plane', targetId: item.targetPlaneId });
      onClose();
    }
  };

  const handleRunHybridSolver = async (customIntent?: string) => {
    if (isReadOnlyStage) return;
    const promptVal = (customIntent ?? intentPrompt).trim();
    setIsSolvingEngine(true);
    setAppliedPatchIds(new Set());
    try {
      const allEdges = levels.flatMap((lvl) =>
        lvl.outline.edges.map((e) => ({
          id: e.id,
          type: e.type,
          hasWall: e.hasWall,
          eaveSetbackM: e.eaveSetbackM ?? 0,
          eaveHeightM: e.eaveHeightM ?? lvl.eaveHeightM,
          lengthM: +dist(e.from, e.to).toFixed(2)
        }))
      );

      const res = await fetch('/api/ai/roof-deterministic-solver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intentPrompt: promptVal,
          profileName,
          windZone,
          prevailingWind: 'SW',
          planes: planes.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            pitchDeg: p.pitchDeg,
            slopeLength: p.slopeLength,
            underlapSide: p.underlapSide,
            eaveEdgeId: p.eaveEdgeId,
            eaveHeightM: p.eaveHeightM
          })),
          edges: allEdges,
          levels: levels.map((l) => ({ code: l.code, eaveHeightM: l.eaveHeightM })),
          unassignedLineCount,
          layoutStats: layout
            ? {
                totalRoofArea: layout.totalRoofArea,
                wastePercent: layout.wastePercent,
                savedMetres: layout.savedMetres
              }
            : {},
          deterministicFindings: deterministicAudit.findings,
          deterministicPatches: deterministicAudit.recommendedPatches
        })
      });
      const data = await res.json();
      setAiSolverSummary(data.engineeringSummary || null);
      setAiTradeNotes(Array.isArray(data.tradeNotes) ? data.tradeNotes : []);
      if (Array.isArray(data.aiPatches)) {
        setAiProposedPatches(data.aiPatches);
      }
    } catch (err) {
      console.error('Hybrid deterministic solver failed:', err);
    } finally {
      setIsSolvingEngine(false);
    }
  };

  const handleApplyPatch = (patch: DeterministicRoofPatch) => {
    if (isReadOnlyStage) return;
    onApplyDeterministicPatches([patch]);
    setAppliedPatchIds((prev) => new Set(prev).add(patch.id));
  };

  const handleApplyAllPatches = () => {
    if (isReadOnlyStage || activePatches.length === 0) return;
    onApplyDeterministicPatches(activePatches);
    setAppliedPatchIds((prev) => {
      const next = new Set(prev);
      activePatches.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const handleAsk = async (qOverride?: string) => {
    const q = (qOverride ?? question).trim() || STAGE_PROMPTS[lifecycleStage][0];
    setQuestion(q);
    setIsLoadingReply(true);
    try {
      const res = await fetch('/api/ai/roof-field-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          stage: lifecycleStage,
          projectTitle,
          windZone,
          selectedPlane: selectedPlane
            ? {
                id: selectedPlane.id,
                code: selectedPlane.code,
                name: selectedPlane.name,
                pitchDeg: selectedPlane.pitchDeg,
                slopeLength: selectedPlane.slopeLength,
                area: selectedPlane.area
              }
            : null,
          planes: planes.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            pitchDeg: p.pitchDeg,
            slopeLength: p.slopeLength,
            area: p.area
          })),
          assets: assets.map((a) => ({ type: a.type, widthM: a.widthM, depthM: a.depthM })),
          flashingCount,
          unassignedLineCount,
          wallCount: wallPlan?.facets.length ?? 0,
          completenessBlockers: completenessReport?.blockersCount ?? 0,
          completenessWarnings: completenessReport?.warningsCount ?? 0,
          layoutStats: layout
            ? {
                wastePercent: layout.wastePercent,
                savedMetres: layout.savedMetres,
                totalOffcutsReused: layout.totalOffcutsReused,
                totalRoofArea: layout.totalRoofArea
              }
            : {},
          packs: roofingPacks.map((pk) => ({
            sequenceNumber: pk.sequenceNumber,
            planeId: pk.planeId,
            code: pk.code,
            packLabel: pk.packLabel,
            installed: completedPlaneIds.includes(pk.planeId),
            outOfOrderWarning: pk.outOfOrderOffcutWarning
          }))
        })
      });
      const data = await res.json();
      setReply(data);
    } catch (err) {
      console.error('Field assistant request failed:', err);
    } finally {
      setIsLoadingReply(false);
    }
  };

  const handleToggleVoice = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec || isListening) return;
    try {
      const rec = new SpeechRec();
      rec.lang = 'en-NZ';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      setIsListening(true);
      rec.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setQuestion(transcript);
          handleAsk(transcript);
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      rec.start();
    } catch {
      setIsListening(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnlyStage) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setPreviewUrl(dataUrl);
      setIsScanning(true);
      setScanResult(null);
      try {
        const res = await fetch('/api/ai/roof-vision-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: dataUrl,
            mimeType: file.type || 'image/jpeg',
            hint: scanHint
          })
        });
        const data = await res.json();
        setScanResult(data);
      } catch (err) {
        console.error('Vision scan failed:', err);
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const stageLabel =
    lifecycleStage === 'quoting'
      ? 'Quote'
      : lifecycleStage === 'measuring'
      ? 'Measure'
      : 'Install';

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0b101d] border border-slate-800 text-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[88dvh] overflow-hidden"
      >
        <div className="sm:hidden w-10 h-1 bg-slate-700 rounded-full mx-auto mt-2.5 shrink-0" />

        {/* Calm Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[#101726] border border-slate-700 flex items-center justify-center text-sky-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">
                {stageLabel} Assistant
              </h3>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums truncate">
                {stageGuidance.metricsLine}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-9 min-w-9 rounded-xl bg-[#101726] hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-300 cursor-pointer shrink-0"
            aria-label="Close Assistant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Single-Column Progressive Body */}
        <div className="p-4 overflow-y-auto space-y-3.5 flex-1 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {/* 1. Calm Deterministic Stage Guidance */}
          <section className="p-3.5 rounded-2xl bg-[#101726] border border-slate-800 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-white">
                  {stageGuidance.statusTone === 'blocked' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : stageGuidance.statusTone === 'attention' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <span>{stageGuidance.headline}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{stageGuidance.summary}</p>
              </div>
            </div>

            {stageGuidance.actions.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                {stageGuidance.actions.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-[#070b14] border border-slate-800 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-100 truncate">{item.label}</div>
                      <div className="text-[11px] text-slate-400 truncate">{item.detail}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTriggerStageAction(item)}
                      disabled={item.kind === 'apply_patch' && isReadOnlyStage}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold cursor-pointer shrink-0 whitespace-nowrap disabled:opacity-50 ${
                        item.severity === 'blocker'
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          : item.kind === 'apply_patch'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-sky-600 hover:bg-sky-500 text-white'
                      }`}
                    >
                      {item.kind === 'fix_issue'
                        ? 'Review'
                        : item.kind === 'apply_patch'
                        ? 'Apply'
                        : item.kind === 'select_plane'
                        ? 'Focus'
                        : 'Open'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 2. Calm Field Q&A (Read-only on crew stage, never invents quantities) */}
          <section className="p-3.5 rounded-2xl bg-[#101726] border border-slate-800 space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Ask About This {stageLabel}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {STAGE_PROMPTS[lifecycleStage].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleAsk(chip)}
                  disabled={isLoadingReply}
                  className="px-2.5 py-1.5 rounded-lg bg-[#070b14] hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-slate-200 text-left cursor-pointer transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                placeholder={
                  lifecycleStage === 'installing'
                    ? 'Ask about next pack, lap side, or pitch...'
                    : 'Ask about gaps, pitch, or flashings...'
                }
                className="flex-1 min-h-10 bg-[#070b14] border border-slate-800 rounded-xl px-3 text-xs text-white focus:outline-hidden focus:border-sky-500"
              />
              {speechSupported && (
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className={`min-h-10 min-w-10 rounded-xl flex items-center justify-center border cursor-pointer shrink-0 ${
                    isListening
                      ? 'bg-rose-600 border-rose-400 text-white'
                      : 'bg-[#070b14] border-slate-800 text-slate-300 hover:text-white'
                  }`}
                  aria-label="Speak question"
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleAsk()}
                disabled={isLoadingReply}
                className="min-h-10 min-w-10 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white flex items-center justify-center cursor-pointer shrink-0"
                aria-label="Ask Assistant"
              >
                {isLoadingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>

            {isLoadingReply && (
              <div className="p-3 rounded-xl bg-[#070b14] border border-slate-800 flex items-center gap-2 text-xs text-slate-300">
                <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                <span>Checking current model...</span>
              </div>
            )}

            {!isLoadingReply && reply && (
              <div className="p-3 rounded-xl bg-[#070b14] border border-slate-800 space-y-2 animate-in fade-in">
                <div className="text-xs font-extrabold text-sky-300">{reply.headline}</div>
                <p className="text-xs text-slate-200 leading-relaxed">{reply.answer}</p>
                {reply.checklist?.length > 0 && (
                  <ul className="space-y-1 pt-1 border-t border-slate-800">
                    {reply.checklist.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-[11px] text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {reply.suggestedAction && reply.suggestedAction.type !== 'none' && reply.suggestedAction.label && (
                  <button
                    type="button"
                    onClick={() => {
                      onExecuteAction(reply.suggestedAction!);
                      onClose();
                    }}
                    className="w-full min-h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>{reply.suggestedAction.label}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </section>

          {/* 3. Collapsible Proposed Fixes & Audit (Quote & unlocked Measure only) */}
          {!isReadOnlyStage && (
            <details className="rounded-2xl bg-[#101726] border border-slate-800 overflow-hidden">
              <summary className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-bold text-slate-200 cursor-pointer select-none">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-sky-400" />
                  <span>
                    Engine Check ({deterministicAudit.overallScore}/100 · {activePatches.length} patch
                    {activePatches.length === 1 ? '' : 'es'})
                  </span>
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </summary>

              <div className="p-3.5 pt-1 space-y-2.5 border-t border-slate-800/80">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={intentPrompt}
                    onChange={(e) => setIntentPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRunHybridSolver()}
                    placeholder="Ask engine (e.g. optimize start face)..."
                    className="flex-1 min-h-9 bg-[#070b14] border border-slate-800 rounded-xl px-3 text-xs text-white focus:outline-hidden focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRunHybridSolver()}
                    disabled={isSolvingEngine}
                    className="min-h-9 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    {isSolvingEngine ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>Check</span>
                  </button>
                </div>

                {aiSolverSummary && (
                  <div className="p-2.5 rounded-xl bg-[#070b14] border border-slate-800 space-y-1">
                    <p className="text-xs text-slate-200">{aiSolverSummary}</p>
                    {aiTradeNotes.length > 0 && (
                      <ul className="space-y-0.5 text-[11px] text-slate-400">
                        {aiTradeNotes.map((note, idx) => (
                          <li key={idx}>· {note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {activePatches.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400">
                        Proposed Patches (Accept to apply)
                      </span>
                      {activePatches.length > 1 && (
                        <button
                          type="button"
                          onClick={handleApplyAllPatches}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Wrench className="w-3 h-3" />
                          <span>Apply All</span>
                        </button>
                      )}
                    </div>
                    {activePatches.map((patch) => (
                      <div
                        key={patch.id}
                        className="p-2.5 rounded-xl bg-[#070b14] border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{patch.label}</div>
                          <div className="text-[11px] text-slate-400">{patch.reason}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApplyPatch(patch)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer shrink-0"
                        >
                          Apply
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-400">
                    {deterministicAudit.findings.filter((f) => f.severity === 'pass').length}/
                    {deterministicAudit.findings.length} checks passing
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenFullCopilot();
                    }}
                    className="text-[11px] font-bold text-sky-300 hover:text-sky-200 cursor-pointer flex items-center gap-1"
                  >
                    <Zap className="w-3 h-3" />
                    <span>Open Generator</span>
                  </button>
                </div>
              </div>
            </details>
          )}

          {/* 4. Collapsible Plan Photo Scan (Quote / unlocked Measure only) */}
          {!isReadOnlyStage && (
            <details className="rounded-2xl bg-[#101726] border border-slate-800 overflow-hidden">
              <summary className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-bold text-slate-200 cursor-pointer select-none">
                <span className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span>Scan Plan Photo to Footprint</span>
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </summary>

              <div className="p-3.5 pt-1 space-y-2.5 border-t border-slate-800/80">
                <input
                  type="text"
                  value={scanHint}
                  onChange={(e) => setScanHint(e.target.value)}
                  placeholder="Optional scale hint (e.g. Front eave 14m, 22.5°)"
                  className="w-full min-h-9 bg-[#070b14] border border-slate-800 rounded-xl px-3 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isScanning}
                  className="w-full min-h-11 rounded-xl border border-dashed border-emerald-500/50 bg-emerald-950/20 hover:bg-emerald-950/35 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isScanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Reading Roof Outline...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload Roof Plan Image</span>
                    </>
                  )}
                </button>
                {previewUrl && (
                  <div className="rounded-xl overflow-hidden border border-slate-800 max-h-36 bg-[#070b14] flex items-center justify-center">
                    <img
                      src={previewUrl}
                      alt="Uploaded roof plan preview"
                      className="max-h-36 w-auto object-contain"
                    />
                  </div>
                )}
                {scanResult && (
                  <div className="p-3 rounded-xl bg-[#070b14] border border-emerald-500/40 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-300 font-mono tabular-nums">
                      <span>
                        {scanResult.points.length} Corners · {scanResult.recommendedPitchDeg}° Pitch
                      </span>
                      <span className="capitalize font-sans text-slate-300">{scanResult.roofStyle}</span>
                    </div>
                    <p className="text-xs text-slate-300">{scanResult.summary}</p>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyScannedRoof(
                          scanResult.points,
                          scanResult.recommendedPitchDeg,
                          scanResult.gableEdgeIndices
                        );
                        onClose();
                      }}
                      className="w-full min-h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Compass className="w-4 h-4" />
                      <span>Apply Scanned Footprint</span>
                    </button>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};
