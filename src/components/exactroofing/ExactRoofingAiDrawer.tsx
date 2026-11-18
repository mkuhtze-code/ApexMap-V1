import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Compass,
  Cpu,
  Loader2,
  Mic,
  MicOff,
  Play,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import {
  AssignableRoofLine,
  FaceRoofingPack,
  LayoutResult,
  RoofAsset,
  RoofFlashingAssignment,
  RoofLevel,
  RoofLifecycleStage,
  RoofPlane,
  SheetSpec
} from '../../types/exactRoofing';
import {
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
  onApplyScannedRoof: (points: { x: number; y: number }[], pitchDeg: number, gableEdgeIndices?: number[]) => void;
  onApplyDeterministicPatches: (patches: DeterministicRoofPatch[]) => void;
  onExecuteAction: (action: SuggestedAction) => void;
  onOpenFullCopilot: () => void;
}

const STAGE_PROMPTS: Record<RoofLifecycleStage, string[]> = {
  quoting: [
    'What is the lowest-waste start face?',
    'Check missing flashings & price risks',
    'Verify NZBC min pitch & wind fixings'
  ],
  measuring: [
    'Is this roof measure ready to lock?',
    'Which roof lines still need flashings?',
    'Check dormer & skylight sheet splits'
  ],
  installing: [
    'Which roofing pack should we load next?',
    'Explain offcuts & side-lap for selected face',
    'Fastener pattern for this roof pitch'
  ]
};

const QUICK_ENGINEERING_COMMANDS = [
  'Optimize start face & flip side-laps away from SW wind',
  'Raise any low-pitch faces to compliant minimum & auto-assign flashings',
  'Enable eaves wall setbacks at 0.45m below roof planes'
];

export const ExactRoofingAiDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  lifecycleStage,
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
  onApplyScannedRoof,
  onApplyDeterministicPatches,
  onExecuteAction,
  onOpenFullCopilot
}) => {
  const [mode, setMode] = useState<'engine_solver' | 'assistant' | 'scan'>(() =>
    lifecycleStage === 'installing' ? 'assistant' : 'engine_solver'
  );

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

  if (!isOpen) return null;

  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const activePatches = (aiProposedPatches ?? deterministicAudit.recommendedPatches).filter(
    (p) => !appliedPatchIds.has(p.id)
  );

  const handleRunHybridSolver = async (customIntent?: string) => {
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
    onApplyDeterministicPatches([patch]);
    setAppliedPatchIds((prev) => new Set(prev).add(patch.id));
  };

  const handleApplyAllPatches = () => {
    if (activePatches.length === 0) return;
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

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0b101d] border border-slate-800 text-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[88dvh] overflow-hidden"
      >
        {/* Drag handle on mobile */}
        <div className="sm:hidden w-10 h-1 bg-slate-700 rounded-full mx-auto mt-2.5 shrink-0" />

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-sky-600/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">Hybrid Roof AI Engine</h3>
              <p className="text-[11px] text-slate-400 capitalize truncate">
                {lifecycleStage} mode · {planes.length} faces · Deterministic Integrity {deterministicAudit.overallScore}/100
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullCopilot();
              }}
              className="min-h-9 px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-200 cursor-pointer flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>Full Suite</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-9 min-w-9 rounded-xl bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
              aria-label="Close AI Drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 3-Tab Mode Selector */}
        <div className="px-4 pt-2.5 pb-1 grid grid-cols-3 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setMode('engine_solver')}
            className={`min-h-10 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              mode === 'engine_solver'
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Logic Auto-Fix</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('assistant')}
            className={`min-h-10 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              mode === 'assistant'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>Field Q&amp;A</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('scan')}
            className={`min-h-10 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              mode === 'scan'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Vision Scan</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {mode === 'engine_solver' ? (
            <>
              {/* Deterministic Engine Status Bar */}
              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        deterministicAudit.status === 'Optimal'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : deterministicAudit.status === 'Action Required'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {deterministicAudit.status}
                    </span>
                    <span className="text-xs font-extrabold text-white">
                      {deterministicAudit.overallScore}/100 Engineering Score
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Waste: <strong className="text-slate-200">{deterministicAudit.currentWastePercent}%</strong> ·{' '}
                    Min Pitch: <strong className="text-slate-200">{deterministicAudit.profileMinPitchDeg}°</strong> ·{' '}
                    Unassigned Flashings: <strong className="text-slate-200">{unassignedLineCount}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRunHybridSolver()}
                  disabled={isSolvingEngine}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-md"
                >
                  {isSolvingEngine ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>{isSolvingEngine ? 'Solving...' : 'AI Deep Audit'}</span>
                </button>
              </div>

              {/* Natural-Language Engineering Command Executor */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={intentPrompt}
                    onChange={(e) => setIntentPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRunHybridSolver()}
                    placeholder="Command roof engine (e.g. Set pitch to 18°, optimize start face)..."
                    className="flex-1 min-h-10 bg-slate-950 border border-slate-700 rounded-xl px-3 text-xs text-white focus:outline-hidden focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleRunHybridSolver()}
                    disabled={isSolvingEngine}
                    className="min-h-10 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Solve</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {QUICK_ENGINEERING_COMMANDS.map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      onClick={() => {
                        setIntentPrompt(cmd);
                        handleRunHybridSolver(cmd);
                      }}
                      disabled={isSolvingEngine}
                      className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[10px] font-semibold text-slate-300 cursor-pointer text-left"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Engineering Summary */}
              {aiSolverSummary && (
                <div className="p-3 rounded-2xl bg-indigo-950/35 border border-indigo-500/40 space-y-1.5 animate-in fade-in">
                  <div className="text-[11px] font-black text-indigo-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Structural Synthesis</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">{aiSolverSummary}</p>
                  {aiTradeNotes.length > 0 && (
                    <ul className="space-y-1 pt-1 border-t border-indigo-500/20">
                      {aiTradeNotes.map((note, idx) => (
                        <li key={idx} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Executable Deterministic Patches */}
              {activePatches.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                      Executable Deterministic Fixes ({activePatches.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleApplyAllPatches}
                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer shadow-sm"
                    >
                      <Wrench className="w-3 h-3" />
                      <span>Apply All Fixes</span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {activePatches.map((patch) => (
                      <div
                        key={patch.id}
                        className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                                patch.severity === 'critical'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : patch.severity === 'optimization'
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {patch.source === 'ai_hybrid' ? 'AI+CAD' : 'Engine'}
                            </span>
                            <span className="text-xs font-bold text-white truncate">{patch.label}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{patch.reason}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApplyPatch(patch)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/50 text-emerald-300 hover:text-white text-[11px] font-extrabold cursor-pointer shrink-0 transition-colors"
                        >
                          Apply
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deterministic Findings Breakdown */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  Live Deterministic Verification
                </div>
                {deterministicAudit.findings.map((finding) => (
                  <div
                    key={finding.id}
                    className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-start gap-2"
                  >
                    {finding.severity === 'pass' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          finding.severity === 'critical' ? 'text-rose-400' : 'text-amber-400'
                        }`}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-100">{finding.title}</div>
                      <div className="text-[11px] text-slate-400">{finding.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : mode === 'assistant' ? (
            <>
              {/* Quick 1-Tap Field Prompts */}
              <div className="flex flex-wrap gap-1.5">
                {STAGE_PROMPTS[lifecycleStage].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleAsk(chip)}
                    disabled={isLoadingReply}
                    className="min-h-10 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold text-slate-200 text-left cursor-pointer transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Ask Bar (Voice + Text) */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
                  placeholder="Ask about sheet cuts, pitch, flashings, order..."
                  className="flex-1 min-h-11 bg-slate-950 border border-slate-700 rounded-xl px-3 text-xs text-white focus:outline-hidden focus:border-sky-500"
                />
                {speechSupported && (
                  <button
                    type="button"
                    onClick={handleToggleVoice}
                    className={`min-h-11 min-w-11 rounded-xl flex items-center justify-center border cursor-pointer shrink-0 ${
                      isListening
                        ? 'bg-rose-600 border-rose-400 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-300 hover:text-white'
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
                  className="min-h-11 min-w-11 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white flex items-center justify-center cursor-pointer shrink-0"
                  aria-label="Send to Roof AI"
                >
                  {isLoadingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>

              {/* Response Card */}
              {isLoadingReply && (
                <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col items-center justify-center gap-2 text-xs text-slate-300">
                  <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
                  <span>Analyzing roof geometry &amp; NZMRM rules...</span>
                </div>
              )}

              {!isLoadingReply && reply && (
                <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 space-y-2.5 animate-in fade-in">
                  <div className="text-sm font-black text-sky-300">{reply.headline}</div>
                  <p className="text-xs text-slate-200 leading-relaxed">{reply.answer}</p>

                  {reply.checklist?.length > 0 && (
                    <ul className="space-y-1.5 pt-1 border-t border-slate-800">
                      {reply.checklist.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-[11px] text-slate-300">
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
                      className="w-full min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>{reply.suggestedAction.label}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            /* MODE 3: PHOTO / ARCHITECTURAL PLAN AI SCANNER */
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Optional Scale / Pitch Note
                </label>
                <input
                  type="text"
                  value={scanHint}
                  onChange={(e) => setScanHint(e.target.value)}
                  placeholder="e.g. Front eave is 14m, 22.5 deg hip roof"
                  className="w-full min-h-11 bg-slate-950 border border-slate-700 rounded-xl px-3 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

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
                className="w-full min-h-14 rounded-2xl border-2 border-dashed border-emerald-500/50 bg-emerald-950/20 hover:bg-emerald-950/40 text-emerald-300 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Reading Roof Outline...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>Take Photo or Upload Roof Plan</span>
                  </>
                )}
              </button>

              {previewUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-800 max-h-40 bg-slate-950 flex items-center justify-center">
                  <img
                    src={previewUrl}
                    alt="Uploaded roof plan preview"
                    className="max-h-40 w-auto object-contain"
                  />
                </div>
              )}

              {scanResult && (
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-emerald-500/40 space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs font-extrabold text-emerald-300">
                    <span>
                      {scanResult.points.length} Corners · {scanResult.recommendedPitchDeg}° Pitch
                    </span>
                    <span className="capitalize text-slate-300">{scanResult.roofStyle}</span>
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
                    className="w-full min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Compass className="w-4 h-4" />
                    <span>Load &amp; Auto-Snap Outline Onto Map</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
